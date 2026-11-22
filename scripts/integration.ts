/**
 * 宿主集成测试：在真实文件系统上把动作链跑一遍。
 *
 * 与 `scripts/smoke.ts` 的分工：smoke 测纯函数（core 的形状与算法），
 * 这里测"真的写文件、真的跑 git、真的调 ffprobe / python3"的那些环节。
 *
 * 跑法：`tsx scripts/integration.ts`，全部通过时最后一行打印"集成测试全部通过"。
 */

import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Actions, ActionError, type ActionContext } from '../host/actions.ts'
import { WikiStore } from '../host/store.ts'
import { sanitizeConfigPatch, registerRpc } from '../host/rpc.ts'
import { buildProposalText, proposalPath } from '../core/draft.ts'
import { probe, slice } from '../host/media.ts'
import { initLibrary, listLibraries, readActive, writeActive } from '../host/space.ts'
import { enclosingVault, resolveOpenTarget } from '../host/obsidian.ts'

const results: { name: string, ok: boolean, hint?: string }[] = []

function check(name: string, ok: boolean, hint?: string): void {
  results.push({ name, ok, hint })
}

async function expectError(name: string, code: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task()
    check(name, false, `本该报 ${code}，却成功了`)
  } catch (error) {
    const actual = error instanceof ActionError ? error.code : String(error)
    check(name, actual === code, `实际：${actual}`)
  }
}

const base = await mkdtemp(join(tmpdir(), 'wiki-it-'))
const library = join(base, 'brain')

function makeActions(patch: Partial<ActionContext> = {}): Actions {
  return new Actions({
    store: new WikiStore(library),
    now: () => new Date().toISOString(),
    deferToAgent: async () => false,
    gitEnabled: false,
    gitAutoCommit: true,
    audioProvider: 'none',
    audioMaxMinutes: 30,
    audioChunkMinutes: 10,
    ...patch,
  })
}

function git(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', library, ...args], (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout.trim())
    })
  })
}

const PAGE = (id: string, title: string, updated: string): string => [
  '---',
  `id: ${id}`,
  'type: concept',
  `title: ${title}`,
  'summary: 一句话摘要，用于索引。',
  'status: active',
  'sources:',
  '  - raw/note-x',
  `created: ${updated}`,
  `updated: ${updated}`,
  '---',
  '',
  `# ${title}`,
  '',
  '## 要点',
  '',
  '- 与内脏脂肪相关。',
  '',
  '## 关联',
  '',
  '- [[concepts/insulin-resistance]]',
  '',
].join('\n')

/* ── 1. 建库与空态 ──────────────────────────────────────────── */
{
  const actions = makeActions()
  const empty = await actions.state() as { initialized?: boolean }
  check('库没建时 state 返回 initialized:false', empty.initialized === false)

  const boot = await actions.bootstrap()
  const detail = boot.detail as { created: string[] }
  check('建库在深层路径上自建目录', detail.created.length >= 5, `${detail.created.length} 个文件`)

  const again = await actions.bootstrap()
  check('建库幂等：第二次跳过', (again.detail as { created: string[] }).created.length === 0)

  {
    const store = new WikiStore(library)
    const blocked = await store.write('../x.md', 'x').then(() => false, () => true)
    check('越界路径被拒（不许写到库外）', blocked)
    const outside = await store.write('WIKI.md', 'x').then(() => false, () => true)
    check('白名单外的路径被拒（WIKI.md 只由建库写）', outside)
  }
}

/* ── 2. 灵感 → 确认 → 素材 ─────────────────────────────────── */
{
  const actions = makeActions()
  await actions.note({ text: '胰岛素抵抗是 2 型糖尿病的核心机制，与内脏脂肪相关。', title: '胰岛素抵抗' })
  const inbox = await actions.state() as { counts: { inbox: number } }
  check('A01 落 0-inbox', inbox.counts.inbox === 1, `inbox=${inbox.counts.inbox}`)

  await actions.confirm({ all: true, byHuman: true })
  const after = await actions.state() as { counts: { inbox: number, raw: number } }
  check('A05 确认后进 1-raw', after.counts.inbox === 0 && after.counts.raw === 1, `${after.counts.inbox}/${after.counts.raw}`)

  await expectError('A06 撤销不存在的东西会报 E_NOT_FOUND', 'E_NOT_FOUND', () => actions.retract({ item: 'note-不存在' }))
}

/* ── 2b. 整目录上传：保留结构 / 同名不覆盖 / 越界路径被夹住 ───── */
{
  const root = library
  const actions = makeActions()
  const text = (value: string): Uint8Array => new TextEncoder().encode(value)

  const first = await actions.ingestFile({ bytes: text('# ch1'), filename: 'book/ch1/a.md' })
  check('整目录上传：按原结构落盘', existsSync(join(root, '0-inbox/files/book/ch1/a.md')), String(first.receipt.created))
  check('整目录上传：注记落在 0-inbox/notes', existsSync(join(root, '0-inbox/notes/file-a.md')), 'file-a.md')

  await actions.ingestFile({ bytes: text('# ch2'), filename: 'book/ch2/a.md' })
  check('同名不同目录互不覆盖', existsSync(join(root, '0-inbox/files/book/ch2/a.md')), 'ch2/a.md')

  await actions.ingestFile({ bytes: text('# again'), filename: 'book/ch1/a.md' })
  check('同目录同名落 -2，原件不动', existsSync(join(root, '0-inbox/files/book/ch1/a-2.md')))

  await actions.ingestFile({ bytes: text('nope'), filename: '../../etc/passwd' })
  check('越界路径被夹在 0-inbox/files 内', existsSync(join(root, '0-inbox/files/etc/passwd')), 'etc/passwd')

  const items = await actions.inboxItems()
  const origins = items.map(item => item.origin)
  check('确认队列能看到原始相对路径', origins.includes('book/ch1/a.md'), JSON.stringify(origins))
  check('同目录重名的两条各有一条注记', origins.includes('book/ch1/a-2.md') && origins.includes('book/ch2/a.md'), JSON.stringify(origins))
}

/* ── 3. PDF 抽取（三条通道，按本机能力） ─────────────────────── */
{
  const sample = process.env.WIKI_PDF_SAMPLE ?? '/path/to/sample.pdf'
  if (existsSync(sample)) {
    const actions = makeActions()
    const bytes = await readFile(sample)
    await actions.ingestFile({ bytes, filename: 'Java面试宝典.pdf', mime: 'application/pdf' })
    try {
      const done = await actions.preprocess({ item: 'file-java面试宝典' })
      // A03 把抽取结果写回 0-inbox 的同一条素材（确认后才进 1-raw）。
      const rawText = await readFile(join(library, '0-inbox/notes/file-java面试宝典.md'), 'utf8')
      const channel = (rawText.match(/- 抽取通道：(\S+)/) ?? [])[1] ?? '未知'
      check('PDF 走通抽取通道', rawText.length > 500 && channel !== '未知',
        `通道 ${channel} · ${done.receipt.changed} 处改动`)
    } catch (error) {
      check('PDF 抽不出时明确降级成"仅存档"', error instanceof ActionError && error.code === 'E_PDF_UNAVAILABLE',
        String(error))
    }
  } else {
    check('PDF 用例跳过（样本不在本机）', true)
  }
}

/* ── 4. 音视频：provider 三态 ─────────────────────────────────── */
{
  const actions = makeActions()
  await actions.ingestFile({ bytes: new Uint8Array([0, 1, 2, 3]), filename: '会议录音.m4a', mime: 'audio/mp4' })
  await expectError('audioProvider=none 时明确报"只存档"', 'E_PREPROCESS_UNAVAILABLE',
    () => actions.preprocess({ item: 'file-会议录音' }))

  const apiActions = makeActions({ audioProvider: 'api' })
  await expectError('api 通道缺环境变量时报清缺什么', 'E_PREPROCESS_UNAVAILABLE',
    () => apiActions.preprocess({ item: 'file-会议录音' }))
}

/* ── 5. 切片（真跑 ffmpeg） ─────────────────────────────────── */
{
  const work = join(base, 'audio')
  await mkdir(work, { recursive: true })
  const file = join(work, 'long.m4a')
  const ok = await new Promise<boolean>((resolve) => {
    execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=75', '-ac', '1', '-ar', '8000', file],
    error => resolve(error === null))
  })
  if (ok) {
    const info = await probe(file)
    check('ffprobe 读出时长', info !== undefined && Math.abs(info.durationSeconds - 75) <= 1, String(info?.durationSeconds))
    const sliced = await slice(file, join(work, 'parts'), 30, info!.durationSeconds)
    check('超过阈值按 30 秒切片', sliced !== undefined && sliced.parts.length === 3,
      sliced === undefined ? '切片失败' : sliced.parts.map(part => part.name).join(', '))
  } else {
    check('ffmpeg 不可用，切片用例跳过', true)
  }
}

/* ── 6. 提案：正常合并 / base 冲突 ───────────────────────────── */
{
  // 与 Actions 共用同一个 store 实例：插件里也是单例，缓存才有可比性。
  const store = new WikiStore(library)
  const actions = makeActions({ store })
  await mkdir(join(library, '3-review'), { recursive: true })
  const now = new Date().toISOString()
  await store.write(proposalPath(library, 'concepts/insulin-resistance', now), buildProposalText({
    target: 'concepts/insulin-resistance',
    action: 'create',
    pageText: PAGE('concepts/insulin-resistance', '胰岛素抵抗', now.slice(0, 10)),
    now,
    rationale: '首次编译',
  }))

  const merged = await actions.merge({ all: true })
  check('A09 合并后页面落 2-wiki、提案删除', merged.receipt.created === 1 && merged.receipt.removed === 1,
    JSON.stringify(merged.receipt))

  const state = await actions.state() as { counts: { wiki: number } }
  check('合并后 wiki 计数 +1', state.counts.wiki === 1, String(state.counts.wiki))

  // base 不符：提案基于旧时间戳
  await store.write(proposalPath(library, 'concepts/insulin-resistance', now, 'conflict'), buildProposalText({
    target: 'concepts/insulin-resistance',
    action: 'update',
    pageText: PAGE('concepts/insulin-resistance', '胰岛素抵抗', '1999-01-01'),
    now,
    rationale: '基于旧版本改',
    baseUpdated: '1999-01-01',
  }))
  const conflictFile = proposalPath(library, 'concepts/insulin-resistance', now, 'conflict')
  await expectError('A09 base 不符报 E_CONFLICT', 'E_CONFLICT', () => actions.merge({ all: true }))
  await rm(conflictFile, { force: true })
}

/* ── 7. git：关闭 / 非仓库 / 自动提交 / 回滚 ─────────────────── */
{
  await expectError('git 关闭时 A17 报 E_NO_GIT', 'E_NO_GIT',
    () => makeActions().rollback({ commit: 'HEAD' }))

  const gitActions = makeActions({ gitEnabled: true })
  await expectError('不是仓库时 A17 报 E_NOT_A_REPO', 'E_NOT_A_REPO',
    () => gitActions.rollback({ commit: 'HEAD' }))

  await git(['init', '-q'])
  await git(['add', '--', '2-wiki', '3-review', 'WIKI.md'])
  await git(['-c', 'user.name=it', '-c', 'user.email=it@local', 'commit', '-qm', 'baseline'])

  const now = new Date().toISOString()
  await mkdir(join(library, '3-review'), { recursive: true })
  await new WikiStore(library).write(proposalPath(library, 'concepts/second-page', now), buildProposalText({
    target: 'concepts/second-page',
    action: 'create',
    pageText: PAGE('concepts/second-page', '第二页', now.slice(0, 10)),
    now,
    rationale: '第二页',
  }))
  const merged = await gitActions.merge({ all: true })
  check('git 开着时合并会顺手提交', merged.receipt.notes.some(note => note.includes('已提交')),
    merged.receipt.notes.join(' / '))

  const baseline = await git(['rev-parse', 'HEAD~1'])
  const rollback = await gitActions.rollback({ commit: baseline })
  check('A17 回滚恢复基线（多出来的页进回收站）',
    rollback.receipt.changed >= 1, `changed=${rollback.receipt.changed} removed=${rollback.receipt.removed}`)
  const state = await gitActions.state() as { counts: { wiki: number } }
  check('回滚后页数回到基线', state.counts.wiki === 1, String(state.counts.wiki))

  await expectError('回滚到不存在的提交报 E_BAD_COMMIT', 'E_BAD_COMMIT',
    () => gitActions.rollback({ commit: 'deadbeef' }))
}

/* ── 8. 清理：预览 / 未知项拒绝 ─────────────────────────────── */
{
  const actions = makeActions()
  const safe = await actions.cleanSafe({ dryRun: true })
  check('A18 预览返回清单而不是直接删', Array.isArray((safe.detail as { targets?: unknown[] }).targets) ||
    (safe.detail as { targets?: unknown[] }).targets !== undefined)

  await expectError('A19 勾选过期清单报 E_STALE_PREVIEW', 'E_STALE_PREVIEW',
    () => actions.cleanDeep({ items: ['3-review/.trash/不存在.md'] }))

  const deep = await actions.cleanDeep({})
  check('A19 默认只出候选', (deep.detail as { candidates?: unknown[] }).candidates !== undefined)
}

/* ── 9. 任务对账 ─────────────────────────────────────────────── */
{
  const { JobsStore, reconcile, JOB_DEFINITIONS } = await import('../host/jobs.ts')
  const store = new WikiStore(library)
  const jobs = new JobsStore(store, 'brain')
  const file = await jobs.load()
  check('jobs.json 覆盖 J01–J10', Object.keys(file.jobs).length === JOB_DEFINITIONS.length)

  const created: string[] = []
  const fake = {
    async catalog() {
      return created.map(id => ({
        id,
        title: '[wiki] brain · 索引重建',
        prompt: `owner: llm-wiki; library: ${library}`,
        status: 'active' as const,
      }))
    },
    async create() {
      const id = `task-${created.length}`
      created.push(id)
      return { id }
    },
    async edit(request: { id: string, action: string }) {
      if (request.action === 'delete') {
        const index = created.indexOf(request.id)
        if (index >= 0) created.splice(index, 1)
      }
      return {}
    },
  }
  file.jobs.J03!.enabled = true
  const reconciled = await reconcile(fake as never, file, library, 'brain', JOB_DEFINITIONS)
  check('开着的任务会被建出来', reconciled.created.includes('J03'), JSON.stringify(reconciled))
  file.jobs.J03!.enabled = false
  const cleaned = await reconcile(fake as never, file, library, 'brain', JOB_DEFINITIONS)
  check('关掉后对应任务被删', cleaned.deleted.includes('J03'), JSON.stringify(cleaned))
  check('名单外的任务一个没动', created.length === 0, String(created.length))
}

/* ── 空间与库（v7 模型） ────────────────────────────────────────── */
{
  const space = join(base, 'space')
  await mkdir(space, { recursive: true })
  await mkdir(join(space, 'empty-one'), { recursive: true })

  const inited = await initLibrary(space, 'alpha', new Date().toISOString())
  const fourDirs = ['0-inbox', '1-raw', '2-wiki', '3-review']
  check('初始化建出四个阶段目录', fourDirs.every(dir => existsSync(join(space, 'alpha', dir))), fourDirs.join(','))
  check('初始化写出 WIKI.md', existsSync(join(space, 'alpha', 'WIKI.md')))
  const again = await initLibrary(space, 'alpha', new Date().toISOString())
  check('重复初始化是幂等的', again.created.length === 0, again.created.join(','))

  const listed = await listLibraries(space)
  const alpha = listed.find(item => item.name === 'alpha')
  const empty = listed.find(item => item.name === 'empty-one')
  check('空间里能列出库', listed.length === 2, String(listed.length))
  check('有 WIKI.md 的文件夹算已初始化', alpha?.initialized === true)
  check('空文件夹算未初始化', empty?.initialized === false)

  await writeActive(space, 'alpha')
  check('当前库能跨进程读回', readActive(space) === 'alpha', String(readActive(space)))

  // 切库 = 同一个 store 换根，不重载插件。
  const shared = new WikiStore(join(space, 'alpha'))
  const actionsOnShared = makeActions({ store: shared })
  const before = await actionsOnShared.state()
  shared.rebase(join(space, 'empty-one'))
  await mkdir(join(space, 'empty-one', '0-inbox', 'notes'), { recursive: true })
  const written = await new Actions({
    store: shared,
    now: () => new Date().toISOString(),
    deferToAgent: async () => false,
    gitEnabled: false,
    gitAutoCommit: true,
    audioProvider: 'none',
    audioMaxMinutes: 30,
    audioChunkMinutes: 10,
  }).note({ text: '切库之后写的' })
  check('切库后 store 停在新库', shared.libraryPath === join(space, 'empty-one'), shared.libraryPath)
  check('切库后写动作落到新库', written.receipt !== undefined && existsSync(join(space, 'empty-one', '0-inbox', 'notes')), '')
  check('切库前读到的是旧库', (before.counts as { wiki: number }).wiki === 0)

  let bad = ''
  try { await initLibrary(space, '../evil', new Date().toISOString()) } catch (error) { bad = error instanceof Error ? error.message : String(error) }
  check('非法库名被拒', bad !== '')
}

/* ── 缓存失效：子目录里的增删必须让快照失效 ─────────────────────── */
{
  const cacheRoot = join(base, 'cache-lib')
  const cacheStore = new WikiStore(cacheRoot)
  await initLibrary(base, 'cache-lib', new Date().toISOString())

  const first = await cacheStore.load()
  const baseline = first.snapshot.pages.length

  // 直接在子目录里造一页（模拟 Obsidian 里新建文件，不经过本插件的写入路径）。
  // 关键：这不会改变 `2-wiki/` 自己的 mtime，只有 `2-wiki/concepts/` 变了。
  const pageText = `---
id: concepts/cache-probe
type: concept
title: 缓存探针
summary: 用于验证子目录写入能让快照缓存失效。
status: active
sources:
  - sources/self
created: 2026-11-22
updated: 2026-11-22
---

# 缓存探针

## 关联

- [[index]]
`
  await writeFile(join(cacheRoot, '2-wiki', 'concepts', 'cache-probe.md'), pageText, 'utf8')

  // 立刻再读：若指纹只盯顶层目录且缓存未过期，这里会拿到旧快照。
  const second = await cacheStore.load()
  check('子目录新增页面后缓存立即失效', second.snapshot.pages.length === baseline + 1, `期望 ${baseline + 1}，实得 ${second.snapshot.pages.length}`)
  check('新页能被 byId 查到', second.snapshot.byId.has('concepts/cache-probe'))
}

/* ── 并发写：日志是读改写，必须在锁内追加 ───────────────────────── */
{
  const raceRoot = join(base, 'race-lib')
  const raceStore = new WikiStore(raceRoot)
  const raceActions = makeActions({ store: raceStore })
  await raceActions.bootstrap()

  // bootstrap 自己会写一条 log，先记下基线。
  const baseline = ((await raceStore.load()).logText.match(/^## /gm) ?? []).length
  const rounds = 8
  await Promise.all(Array.from({ length: rounds }, (_, index) =>
    raceActions.note({ text: `并发灵感第 ${index} 条，用于验证日志不丢` })))

  const after = ((await raceStore.load()).logText.match(/^## /gm) ?? []).length
  check(
    '并发 8 次写动作的日志一条不丢',
    after === baseline + rounds,
    `期望 ${baseline + rounds}，实得 ${after}（丢 ${baseline + rounds - after} 条）`,
  )
}

/* ── 符号链接越界：字符串白名单挡不住，必须用 realpath 兜 ─────────── */
{
  const symRoot = join(base, 'sym-lib')
  await mkdir(join(symRoot, '0-inbox', 'notes'), { recursive: true })
  const outsideDir = join(base, 'sym-outside')
  await mkdir(outsideDir, { recursive: true })

  const symStore = new WikiStore(symRoot)
  let linkable = true
  try {
    await symlink(outsideDir, join(symRoot, '0-inbox', 'notes', 'evil'))
  } catch {
    linkable = false
  }

  if (linkable) {
    let blocked = ''
    try {
      await symStore.write('0-inbox/notes/evil/pwned.md', 'PWNED')
    } catch (error) {
      blocked = error instanceof Error ? error.message : String(error)
    }
    check('库内符号链接指向库外时写入被拒', blocked !== '', blocked === '' ? '写入成功了' : '')
    check('库外目录没有被写入文件', !existsSync(join(outsideDir, 'pwned.md')))

    // 正常路径必须仍然可用，别把守卫做成"一刀切拒绝"
    await symStore.write('0-inbox/notes/normal.md', 'ok')
    check('守卫不影响库内正常写入', existsSync(join(symRoot, '0-inbox', 'notes', 'normal.md')))
  } else {
    check('符号链接测试（当前文件系统不支持，跳过）', true)
  }
}

/* ── 打开目标：优先外层 vault，别把用户的 Obsidian 个性化设置弄丢 ── */
{
  const space = join(base, 'vault-space')
  await mkdir(join(space, '.obsidian'), { recursive: true })
  await mkdir(join(space, 'libA', '2-wiki'), { recursive: true })
  await mkdir(join(base, 'loose-lib'), { recursive: true })

  check('能找到外层 vault', enclosingVault(join(space, 'libA')) === space, String(enclosingVault(join(space, 'libA'))))

  const enclosed = resolveOpenTarget({ vaultPath: join(space, 'libA'), vaultName: '', relPath: '' })
  check('默认打开外层 vault（保住主题/插件/快捷键）',
    enclosed.mode === 'enclosing' && enclosed.vaultPath === space, JSON.stringify(enclosed))
  check('深链定位到库这一层',
    enclosed.uri.includes('vault=vault-space') && enclosed.uri.includes('file=libA'), enclosed.uri)

  const note = resolveOpenTarget({ vaultPath: join(space, 'libA'), vaultName: '', relPath: '2-wiki/a.md' })
  // openUri 会去掉 .md（Obsidian 的 file 参数不需要扩展名）
  check('深链带库 + 文件', note.uri.includes('file=libA%2F2-wiki%2Fa'), note.uri)

  const loose = resolveOpenTarget({ vaultPath: join(base, 'loose-lib'), vaultName: '', relPath: '' })
  check('没有外层 vault 时库自己成 vault',
    loose.mode === 'library' && loose.vaultName === 'loose-lib', JSON.stringify(loose))

  // 关键回归：vaultName 是解析后的值（一定有值），不能拿它当"用户手写了 vault 名"。
  const resolvedName = resolveOpenTarget({ vaultPath: join(space, 'libA'), vaultName: 'libA', explicitVaultName: '', relPath: '' })
  check('解析后的 vaultName 不触发单独开 vault', resolvedName.mode === 'enclosing', JSON.stringify(resolvedName))

  const forced = resolveOpenTarget({ vaultPath: join(space, 'libA'), vaultName: 'libA', explicitVaultName: 'libA', relPath: '' })
  check('配置里手写 vaultName 时按库单独开', forced.mode === 'library', JSON.stringify(forced))
}

/* ── 设置页配置校验：白名单 + 强类型 ─────────────────────────────── */
{
  check('配置：只放行白名单字段', Object.keys(sanitizeConfigPatch({ writeMode: 'propose', notAField: 1 })).join(',') === 'writeMode')
  // 知识空间与库路径从"只读锚点"改成"可写但有校验"：这一条盯住白名单别再退化。
  check('配置：知识空间可写', Object.keys(sanitizeConfigPatch({ spacePath: '/tmp' })).join(',') === 'spacePath')
  check('配置：库路径可写', Object.keys(sanitizeConfigPatch({ libraryPath: '/tmp/lib' })).join(',') === 'libraryPath')
  check('配置：未知字段被丢弃', Object.keys(sanitizeConfigPatch({ notAField: 1, debounceMs: 2000 })).join(',') === 'debounceMs')
  check('配置：字符串 trim', sanitizeConfigPatch({ libraryName: '  brain  ' }).libraryName === 'brain')

  const rejects = (label: string, raw: Record<string, unknown>): void => {
    let code = ''
    try { sanitizeConfigPatch(raw) } catch (error) { code = error instanceof ActionError ? error.code : String(error) }
    check(label, code === 'E_SCHEMA', code === '' ? '本该被拒' : code)
  }
  rejects('配置：越界数字被拒', { maxCandidates: 99 })
  rejects('配置：字符串冒充数字被拒', { maxCandidates: '12' })
  rejects('配置：字符串冒充布尔被拒', { gitEnabled: 'yes' })
  rejects('配置：非法枚举被拒', { audioProvider: 'telepathy' })
}

/* ── HTTP 路由：用真 http.Server 挂上，逐条打一遍 ───────────────
   这组是 404 事故的回归：只要 `registerRpc` 的传输层再被写成
   宿主不认的接口，这里会立刻红。 */
{
  const httpBase = join(base, 'http-lib')
  const httpStore = new WikiStore(httpBase)
  await initLibrary(base, 'http-lib', new Date().toISOString())
  const httpActions = makeActions({ store: httpStore })
  const { JobsStore: HttpJobsStore } = await import('../host/jobs.ts')
  const httpJobs = new HttpJobsStore(httpStore, 'http-lib')

  const createdTasks: { title: string, prompt: string, timing: Record<string, any>, target?: unknown }[] = []
  const fakeSchedule = {
    async create(request: { title: string, prompt: string, timing: Record<string, any>, target?: unknown }) {
      createdTasks.push(request)
      return { id: `fake-task-${createdTasks.length}` }
    },
    async catalog() {
      return createdTasks.map((task, index) => ({
        id: `fake-task-${index + 1}`,
        title: task.title,
        prompt: task.prompt,
        status: 'active' as const,
      }))
    },
    async edit() { return {} },
    async run() { return {} },
  }

  let served: import('node:http').Server | undefined
  const fakeHost = {
    webServer: {
      register(route: { handler(req: unknown, res: unknown): void }) {
        served = createServer((req, res) => { void route.handler(req, res) })
        served.listen(0)
        return () => { served?.close() }
      },
    },
  }

  registerRpc(fakeHost as never, {
    store: httpStore,
    actions: httpActions,
    jobs: httpJobs,
    libraryName: 'http-lib',
    space: {
      path: base,
      active: 'http-lib',
      list: async () => [{ name: 'http-lib', path: httpBase, initialized: true }],
      // 用真的 initLibrary / listLibraries：路由里"建库 → 切库"这条链才算真被走过。
      init: async (name: string) => (await initLibrary(base, name, new Date().toISOString())).library,
      activate: async (name: string) => {
        const found = (await listLibraries(base)).find(item => item.name === name)
        if (found === undefined) throw new ActionError('E_NOT_FOUND', `空间里没有库 ${name}`)
        return found
      },
    },
    gitEnabled: false,
    audioProvider: 'none',
    vaultName: 'http-lib',
    obsidianCli: async () => undefined,
    obsidianAppAvailable: () => true,
    // 假 Schedule：只记账。J.create 的时间规则要能在这里被逐字核对。
    schedule: () => fakeSchedule as never,
    configPath: join(base, 'cordis.patch.yml'),
    openInObsidian: async (relPath: string) => ({
      ok: true,
      via: 'url' as const,
      uri: relPath === '' ? 'obsidian://open?vault=http-lib' : `obsidian://open?vault=http-lib&file=${encodeURIComponent(relPath)}`,
      note: '已唤起 Obsidian 打开这个库（http-lib）',
      registered: true,
    }),
    readConfig: () => ({ writeMode: 'propose', maxCandidates: 8 }),
    writeConfig: async () => ({ persisted: true }),
  })

  await new Promise(resolve => setTimeout(resolve, 120))
  const addr = served?.address() as { port: number } | undefined
  const hit = async (label: string, path: string, init?: RequestInit): Promise<{ status: number, text: string }> => {
    if (addr === undefined) return { status: 0, text: '' }
    const response = await fetch(`http://127.0.0.1:${addr.port}${path}`, init)
    return { status: response.status, text: await response.text() }
  }

  check('路由已注册（能拿到端口）', addr !== undefined, String(addr))

  const st = await hit('state', '/api/llm-wiki/state')
  check('GET /state 返回 200', st.status === 200, `实际 ${st.status}`)
  check('GET /state 带 ok:true', st.text.includes('"ok":true'))

  const cfg = await hit('config', '/api/llm-wiki/config')
  check('GET /config 返回 200', cfg.status === 200, `实际 ${cfg.status}`)

  const cfgOk = await hit('config-post', '/api/llm-wiki/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config: { maxCandidates: 12 } }),
  })
  check('POST /config 合法值 200', cfgOk.status === 200, `实际 ${cfgOk.status}`)

  const cfgBad = await hit('config-bad', '/api/llm-wiki/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config: { maxCandidates: 999 } }),
  })
  check('POST /config 越界值 400', cfgBad.status === 400, `实际 ${cfgBad.status}`)

  // 知识空间以前是只读的（"路径是锚点，改错会指向空目录"）。现在可写，
  // 但校验放在宿主：必须绝对路径、不许 `..`、不许指到已有的文件上。
  const spaceRelative = await hit('config-space-relative', '/api/llm-wiki/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config: { spacePath: 'relative/dir' } }),
  })
  check('POST /config 相对路径空间 400', spaceRelative.status === 400, `实际 ${spaceRelative.status}`)

  const spaceTraversal = await hit('config-space-traversal', '/api/llm-wiki/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config: { spacePath: '/tmp/../etc' } }),
  })
  check('POST /config 带 .. 的空间 400', spaceTraversal.status === 400, `实际 ${spaceTraversal.status}`)

  const spaceOk = await hit('config-space', '/api/llm-wiki/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config: { spacePath: base } }),
  })
  check('POST /config 绝对路径空间 200', spaceOk.status === 200, `实际 ${spaceOk.status}`)
  check('POST /config 回带 configPath', spaceOk.text.includes('configPath'), spaceOk.text.slice(0, 160))

  // 打开知识库：空路径 = 开库；带 `..` = 拒绝。真正唤起客户端要靠人跑，
  // 这里只校验路由约定（宿主把结果原样透传）。
  const openEmpty = await hit('open-empty', '/api/llm-wiki/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: '' }),
  })
  check('POST /open 空路径 200', openEmpty.status === 200, `实际 ${openEmpty.status}`)
  check('POST /open 回带深链与文案', openEmpty.text.includes('obsidian://') && openEmpty.text.includes('"note"'), openEmpty.text.slice(0, 200))

  const openOutside = await hit('open-outside', '/api/llm-wiki/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: '../secrets.md' }),
  })
  check('POST /open 越界路径 400', openOutside.status === 400, `实际 ${openOutside.status}`)

  // 建库：面板上那颗「新建知识库」走的就是 op=create——建目录 + 切过去，一步完成。
  const created = await hit('library-create', '/api/llm-wiki/library', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'create', name: 'fresh-lib' }),
  })
  check('POST /library 建库 200', created.status === 200, `实际 ${created.status}`)
  check('POST /library 建库后自动切过去', created.text.includes('"op":"init"') && created.text.includes('"active":"fresh-lib"'), created.text.slice(0, 200))
  check('POST /library 建库真的落了目录', existsSync(join(base, 'fresh-lib', '0-inbox')) && existsSync(join(base, 'fresh-lib', 'WIKI.md')))

  const dup = await hit('library-dup', '/api/llm-wiki/library', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'create', name: 'http-lib' }),
  })
  check('POST /library 已存在的库 400', dup.status === 400, `实际 ${dup.status}`)
  check('POST /library 已存在带 E_EXISTS', dup.text.includes('E_EXISTS'), dup.text.slice(0, 160))

  const badName = await hit('library-bad-name', '/api/llm-wiki/library', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'create', name: '../escape' }),
  })
  check('POST /library 带 / 的库名 400', badName.status === 400, `实际 ${badName.status}`)

  // 定时任务的时间规则：这一组盯的是"每周永远周一"那个坑，以及"每隔 N 天"的表达方式。
  const postTask = async (body: Record<string, unknown>) => await hit('task-create', '/api/llm-wiki/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'J.create', params: body }),
  })

  const daily = await postTask({ title: '每天扫一遍', frequency: 'daily', time: '07:30' })
  check('J.create 每天 200', daily.status === 200, `实际 ${daily.status}`)
  const dailyTiming = createdTasks.at(-1)?.timing ?? {}
  check('J.create 每天 = daily + 秒补齐', dailyTiming.kind === 'daily' && (dailyTiming.daily as { time: string }).time === '07:30:00', JSON.stringify(dailyTiming))

  const weekly = await postTask({ title: '每周整理', frequency: 'weekly', time: '07:30', weekdays: [5, 1, 3, 3] })
  check('J.create 每周 200', weekly.status === 200, `实际 ${weekly.status}`)
  const weeklyTiming = (createdTasks.at(-1)?.timing ?? {}) as { kind?: string, weekly?: { weekdays?: number[] } }
  check('J.create 每周保留所选星期（去重升序）', JSON.stringify(weeklyTiming.weekly?.weekdays) === '[1,3,5]', JSON.stringify(weeklyTiming))

  const interval = await postTask({ title: '隔两天', frequency: 'interval', time: '08:00', everyDays: 2 })
  check('J.create 每隔 N 天 200', interval.status === 200, `实际 ${interval.status}`)
  const intervalTiming = (createdTasks.at(-1)?.timing ?? {}) as { kind?: string, rrule?: string }
  check('J.create 每隔 N 天用 RRULE', intervalTiming.kind === 'rrule' && /INTERVAL=2/u.test(intervalTiming.rrule ?? ''), JSON.stringify(intervalTiming))
  check('J.create RRULE 带 DTSTART 与固定时区', /DTSTART;TZID=Asia\/Shanghai:/u.test(intervalTiming.rrule ?? '') && /FREQ=DAILY/u.test(intervalTiming.rrule ?? ''), intervalTiming.rrule ?? '')

  const monthly = await postTask({ title: '每月 15 号', frequency: 'monthly', time: '09:30', monthDay: 15 })
  check('J.create 每月 200', monthly.status === 200, `实际 ${monthly.status}`)
  const monthlyTiming = (createdTasks.at(-1)?.timing ?? {}) as { kind?: string, rrule?: string }
  check('每月用 RRULE + BYMONTHDAY', /FREQ=MONTHLY/u.test(monthlyTiming.rrule ?? '') && /BYMONTHDAY=15/u.test(monthlyTiming.rrule ?? ''), JSON.stringify(monthlyTiming))

  const monthlyLast = await postTask({ title: '每月最后一天', frequency: 'monthly', time: '09:30', monthDay: -1 })
  check('每月最后一天 = BYMONTHDAY=-1', monthlyLast.status === 200 && /BYMONTHDAY=-1/u.test(((createdTasks.at(-1)?.timing ?? {}) as { rrule?: string }).rrule ?? ''), monthlyLast.status === 200 ? 'ok' : `实际 ${monthlyLast.status}`)

  const monthlyBad = await postTask({ title: '每月 32 号', frequency: 'monthly', time: '09:30', monthDay: 32 })
  check('每月 32 号 400', monthlyBad.status === 400, `实际 ${monthlyBad.status}`)

  const badTime = await postTask({ title: '时间写错', frequency: 'daily', time: '25:99' })
  check('J.create 时间越界 400', badTime.status === 400, `实际 ${badTime.status}`)
  const noDay = await postTask({ title: '没选星期', frequency: 'weekly', time: '07:30', weekdays: [] })
  check('J.create 每周不选星期 400', noDay.status === 400, `实际 ${noDay.status}`)
  const plan = await hit('task-plan', '/api/llm-wiki/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'J.plan', params: { text: '每月第一个工作日早上 8 点清提案' } }),
  })
  check('J.plan 没接 agent 时 400', plan.status === 400, `实际 ${plan.status}`)

  const noAction = await hit('action-empty', '/api/llm-wiki/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  check('POST /action 缺 action 400', noAction.status === 400, `实际 ${noAction.status}`)

  const libs = await hit('libraries', '/api/llm-wiki/libraries')
  check('GET /libraries 返回 200', libs.status === 200, `实际 ${libs.status}`)

  const missing = await hit('nope', '/api/llm-wiki/nope')
  check('未知路由返回 404（而不是静默失败）', missing.status === 404, `实际 ${missing.status}`)
  check('未知路由带 E_NO_ROUTE', missing.text.includes('E_NO_ROUTE'))

  served?.close()
}

/* ── webServer 获取策略：防止面板 404 根因回归 ────────────────────
   根因是 apply 阶段 ctx.get('webServer') 返回 undefined，
   必须改成 ctx.inject(['webServer'], scoped => ...) 等服务就绪。 */
{
  const raw = await readFile(new URL('../host/index.ts', import.meta.url), 'utf8')
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n')

  check('host 用 ctx.inject 等待 webServer', /ctx\.inject\(\['webServer'\]/.test(src))
  check('apply 阶段没有直接 get(webServer)', !/get\(['"]webServer['"]\)/.test(src))
  check('registerRpc 使用 scoped ctx', /registerRpc\(scoped/.test(src))
  check('registerRpc 由 effect 托管', /effect\([\s\S]{0,160}registerRpc/.test(src))
}

/* ── 汇总 ─────────────────────────────────────────────────────── */
const failed = results.filter(item => !item.ok)
for (const item of results) {
  console.log(`${item.ok ? '  ok  ' : '  FAIL'} ${item.name}${item.ok || item.hint === undefined ? '' : ` → ${item.hint}`}`)
}
console.log(`\n${results.length} 项，失败 ${failed.length} 项`)
if (failed.length > 0) {
  console.log('临时目录保留：', base)
  process.exitCode = 1
} else {
  console.log('集成测试全部通过')
  await rm(base, { recursive: true, force: true })
}
