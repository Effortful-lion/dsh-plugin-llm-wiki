/**
 * 动作层：面板上的每个按钮都对应这里的一个 A 编号。
 *
 * 三条硬约束：
 * 1. `preview` 绝不写盘；`run` 才写。
 * 2. 所有 `run` 都在 store.exclusive 里跑（进程内单写者）。
 * 3. 每次 run 追加一条 log；回执里有 changed / created / removed / ms。
 *
 * 成本纪律：能在宿主算出来的一律 0 token（确认、合并、索引、体检、清理）；
 * 需要判断的（编译正文、矛盾裁决）交给 agent —— 通过一次性任务把指令送达，
 * 见 `deferToAgent`。
 */

import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  buildPageText,
  buildProposalText,
  buildRawText,
  parseProposal,
  rawPath,
  slugify,
  validateDraft,
  proposalPath,
} from '../core/draft.ts'
import { renderIndex } from '../core/index-page.ts'
import { lintSnapshot, summarize, fixableFindings } from '../core/lint.ts'
import { searchPages } from '../core/search.ts'
import { parseDocument } from '../core/frontmatter.ts'
import { parsePage, extractLinks, stripCode } from '../core/parse.ts'
import { dedupe } from '../core/dedupe.ts'
import {
  CONTENT_TYPES,
  LIMITS,
  PAGE_TYPE_SEGMENT,
  RULES,
  WIKI_LAYOUT,
  type Origin,
  type PageType,
  type Receipt,
  type Snapshot,
  type WikiPage,
} from '../core/model.ts'
import type { WikiStore } from './store.ts'
import { AUDIO_EXT, makeTranscriber, mergeParts, probe, slice } from './media.ts'
import { extractPdfText, extractPdfViaPython } from './pdf.ts'
import { commitLibrary, inspectRepo, restoreFile, restoreTree } from './git.ts'

export interface ActionContext {
  store: WikiStore
  /** 执行副作用时的时钟。 */
  now(): string
  /** 把指令交给 agent（生成一次性任务并立即运行）；不可用时返回 false。 */
  deferToAgent(instruction: string, title: string): Promise<boolean>
  /** git 是否可用（用于 A17 回滚与自动提交）。 */
  gitEnabled: boolean
  /** 合并提案后是否自动提交（仅 gitEnabled 时生效）。 */
  gitAutoCommit?: boolean
  /** 音视频转写通道。 */
  audioProvider?: 'none' | 'whisper' | 'api'
  /** 超过这个分钟数就切片。 */
  audioMaxMinutes?: number
  /** 每片长度（分钟）。 */
  audioChunkMinutes?: number
}

export interface Preview {
  items: string[]
  count: number
  notes: string[]
}

export interface ActionResult {
  receipt: Receipt
  /** 需要 agent 接手时，把指令回给前端。 */
  instruction?: string
  /** 结构化附加信息（例如清理清单）。 */
  detail?: Record<string, unknown>
  /** 让 ActionResult 可以直接当 RPC 信封里的 data 用。 */
  [key: string]: unknown
}

class ActionError extends Error {
  constructor(readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message)
    this.name = 'ActionError'
  }
}

const TEXT_FILE_EXT = /\.(md|markdown|txt|json|csv|yaml|yml|log|xml|html?)$/i

/**
 * 拆分上传时带过来的相对路径：`book/ch1/a.md` → `{ dir: 'book/ch1', name: 'a.md' }`。
 *
 * 这一段是**不可信输入**（前端给的、浏览器给的都可能被伪造）：
 * `..` 与 `.` 直接丢、空段丢掉、控制字符和 Windows 保留字符换成 `_`、
 * 每段最长 60 字符、最多 6 层。落盘位置由调用方拼在 `0-inbox/files` 之下，
 * 所以即便有人塞 `../../etc/passwd`，最终也只会落成 `0-inbox/files/etc/passwd`。
 */
function splitUploadPath(raw: string): { dir: string, name: string } {
  const parts = raw
    .replace(/\\/g, '/')
    .split('/')
    .map(part => part.trim())
    .filter(part => part !== '' && part !== '.' && part !== '..')
    .map(part => part.replace(/[\u0000-\u001f<>:"|?*]/g, '_').slice(0, 60))
  const name = parts.pop() ?? 'upload.bin'
  return { dir: parts.slice(-6).join('/'), name: name === '' ? 'upload.bin' : name }
}

function emptyReceipt(action: string): Receipt {
  return { action, changed: 0, created: 0, removed: 0, ms: 0, notes: [] }
}

/** 内容哈希，用于动作幂等与去重。 */
function hashOf(text: string | Uint8Array): string {
  return createHash('sha256').update(text).digest('hex')
}

/** 生成一个库里不重复的 slug。 */
function uniqueSlug(snapshot: Snapshot, base: string): string {
  const taken = new Set<string>([...snapshot.byId.keys(), ...snapshot.raw.keys()].map(id => id.split('/').slice(1).join('/')))
  let slug = base
  let index = 2
  while (taken.has(slug)) {
    slug = `${base}-${index}`
    index += 1
  }
  return slug
}

function clip(text: string, limit: number): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return single.length <= limit ? single : `${single.slice(0, Math.max(0, limit - 1))}…`
}

/** 从正文里抽一句摘要：优先第一段非标题文字。 */
function firstSentence(body: string): string {
  const lines = stripCode(body).split('\n').map(line => line.trim())
    .filter(line => line !== '' && !line.startsWith('#') && !line.startsWith('>'))
  return clip(lines[0] ?? '', LIMITS.summaryChars)
}

/** 校验一份"拟写入 2-wiki 的完整页面"。合并前必过这一关。 */
export function checkPageBody(text: string, targetId: string, snapshot: Snapshot, root: string): string[] {
  const errors: string[] = []
  const parsed = parseDocument(text)
  if (!parsed.hasFrontmatter) {
    errors.push('缺少 frontmatter')
    return errors
  }
  const fm = parsed.data
  if (typeof fm.id !== 'string' || fm.id.trim() !== targetId) errors.push(`id 必须是 ${targetId}`)
  const declaredType = typeof fm.type === 'string' ? fm.type : ''
  if (!(CONTENT_TYPES as string[]).includes(declaredType)) errors.push(`type 必须是 ${CONTENT_TYPES.join(' / ')}`)
  const segment = targetId.split('/')[0] ?? ''
  if (PAGE_TYPE_SEGMENT[declaredType as PageType] !== segment) errors.push(`type ${declaredType} 与目录 ${segment} 不一致`)
  if (typeof fm.title !== 'string' || fm.title.trim() === '') errors.push('缺少 title')
  const summary = typeof fm.summary === 'string' ? fm.summary.trim() : ''
  if (summary === '') errors.push('缺少 summary')
  if (summary.length > LIMITS.summaryChars) errors.push(`summary 超过 ${LIMITS.summaryChars} 字`)
  const status = typeof fm.status === 'string' ? fm.status : 'stub'
  if (!parsed.body.includes(LIMITS.relatedSection)) errors.push(`正文缺少 \`${LIMITS.relatedSection}\` 段`)
  const related = extractLinks(parsed.body).filter(link => link.inRelated)
  if (related.length === 0) errors.push(`\`${LIMITS.relatedSection}\` 里至少要有一条 [[wikilink]]`)
  for (const link of related) {
    const resolved = snapshot.byId.has(link.raw)
      || snapshot.nameIndex.get(link.raw.trim().toLowerCase()) !== undefined
      || link.raw === targetId
    if (!resolved) errors.push(`关联指向不存在的页：[[${link.raw}]]`)
  }
  const sources = Array.isArray(fm.sources) ? fm.sources : []
  if (sources.length === 0 && status !== 'stub' && declaredType !== 'answer') {
    errors.push('非 stub 页必须有 sources')
  }
  return errors
}

/** 推理之外的机械动作全集。 */
export class Actions {
  constructor(private readonly ctx: ActionContext) {}

  private get store(): WikiStore { return this.ctx.store }

  /**
   * 统一的执行外壳：加锁、计时、记 log。
   *
   * 注意 `appendLog` 必须在锁**内**执行：它是"读 log → 拼一段 → 写回"的读改写，
   * 放到锁外并发跑会互相覆盖（实测 8 个并发动作丢 2 条日志）。
   */
  private async run(action: string, summary: string, task: (receipt: Receipt) => Promise<void>, details: string[] = []): Promise<ActionResult> {
    const started = Date.now()
    const receipt = emptyReceipt(action)
    const now = this.ctx.now()
    await this.store.exclusive(async () => {
      await task(receipt)
      receipt.ms = Date.now() - started
      await this.store.appendLog(now, 'write', `[${action}] ${summary}`, [
        `changed ${receipt.changed} · created ${receipt.created} · removed ${receipt.removed}`,
        ...details,
      ])
    })
    return { receipt }
  }

  // ── A01 灵感落盘 ────────────────────────────────────────────────

  async note(input: { text: string, title?: string, domain?: string }): Promise<ActionResult> {
    const text = input.text.trim()
    if (text === '') throw new ActionError('E_EMPTY', '灵感内容不能为空')
    const { snapshot } = await this.store.load()
    const title = (input.title ?? '').trim() || firstSentence(text).slice(0, 24) || '未命名灵感'
    const slug = uniqueSlug(snapshot, `note-${slugify(title)}`)
    const now = this.ctx.now()
    const page = buildRawText({
      slug,
      title,
      summary: firstSentence(text),
      body: text,
      now,
      origin: 'note',
      confirmed: 'auto',
      domain: input.domain,
    })
    return this.run('A01', `灵感入库 ${slug}`, async receipt => {
      await this.store.write(`0-inbox/notes/${slug}.md`, page)
      receipt.created = 1
    })
  }

  // ── A02 文件接收 ────────────────────────────────────────────────

  /**
   * 接收一个文件。
   *
   * `filename` 允许带目录：整目录上传时前端会把相对路径一起送来
   * （`book/ch1/a.md`），这里**保留这段结构**落到 `0-inbox/files/book/ch1/a.md`。
   * 理由：
   * - 收进来的往往是成套资料（一本书的章节、一个文件夹的截图），拍平之后
   *   `ch1/a.md` 与 `ch2/a.md` 会互相撞名，只能靠随机后缀区分，人就看不懂了；
   * - 素材本来就要人工确认，保留路径等于保留了"它原来在哪"这条线索；
   * - 目录里同名不覆盖：第二个同名文件落成 `a-2.md`，原件不动。
   *
   * 安全：路径分段里的 `..`、空段、控制字符全部丢掉；深度最多 6 层、每段最长 60 字符。
   */
  async ingestFile(input: { bytes: Uint8Array, filename: string, mime?: string, domain?: string }): Promise<ActionResult> {
    const bytes = input.bytes
    if (bytes.byteLength === 0) throw new ActionError('E_EMPTY', '空文件')
    if (bytes.byteLength > LIMITS.uploadBytes) {
      throw new ActionError('E_TOO_LARGE', `文件超过 ${Math.round(LIMITS.uploadBytes / 1024 / 1024)} MB`)
    }
    const { snapshot } = await this.store.load()
    const { dir, name } = splitUploadPath(input.filename.trim() || 'upload.bin')
    const stem = name.replace(/\.[^.]+$/, '')
    const ext = (name.match(/\.([^.]+)$/)?.[1] ?? 'bin').toLowerCase()
    /**
     * 注记的 slug 必须**避开已经在 inbox 里的同名注记**。
     * `uniqueSlug` 只查快照（2-wiki / 1-raw），而 inbox 里的注记尚未进快照；
     * 整目录上传时 `ch1/a.md` 与 `ch2/a.md` 的 stem 都是 a，不查就会互相覆盖，
     * 前一条素材的注记被后一条顶掉，队列里就少一条、而且指向也错了。
     */
    const slugBase = `file-${slugify(stem)}`
    let slug = uniqueSlug(snapshot, slugBase)
    let slugAttempt = 2
    while (await this.store.exists(`${WIKI_LAYOUT.inboxNotes}/${slug}.md`)) {
      slug = `${slugBase}-${slugAttempt}`
      slugAttempt += 1
      if (slugAttempt > 500) break
    }
    const targetDir = dir === '' ? WIKI_LAYOUT.inboxFiles : `${WIKI_LAYOUT.inboxFiles}/${dir}`
    const stored = await this.uniqueStoredPath(targetDir, name)
    const now = this.ctx.now()
    const kind = TEXT_FILE_EXT.test(name) ? 'text' : 'binary'
    const shownPath = dir === '' ? name : `${dir}/${name}`
    const page = buildRawText({
      slug,
      title: stem === '' ? name : stem,
      summary: `${kind === 'text' ? '文本' : '二进制'}文件 ${shownPath}，等待抽取或转写`,
      body: [
        `- 原始文件：\`${stored}\`（${ext}，${Math.round(bytes.byteLength / 1024)} KB）`,
        `- 接收时间：${now}`,
        '',
        kind === 'text' ? '文本类文件可以直接进入预处理。' : '该类型需要预处理通道（PDF / 图片 / 音视频），未启用时仅作存档。',
      ].join('\n'),
      now,
      origin: 'upload',
      confirmed: 'auto',
      domain: input.domain,
      derivedFrom: stored,
      type: 'source',
    })
    return this.run('A02', `接收文件 ${shownPath}`, async receipt => {
      const { mkdir, writeFile } = await import('node:fs/promises')
      const { dirname } = await import('node:path')
      const absolute = this.store.abs(stored)
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, bytes)
      await this.store.write(`0-inbox/notes/${slug}.md`, page)
      receipt.created = 2
    })
  }

  /** 目录内不覆盖：`a.md` 已存在就落 `a-2.md`、`a-3.md`…（最多 500 次尝试）。 */
  private async uniqueStoredPath(dirRel: string, name: string): Promise<string> {
    const dot = name.lastIndexOf('.')
    const base = dot > 0 ? name.slice(0, dot) : name
    const suffix = dot > 0 ? name.slice(dot) : ''
    let candidate = `${dirRel}/${name}`
    let index = 2
    while (await this.store.exists(candidate)) {
      candidate = `${dirRel}/${base}-${index}${suffix}`
      index += 1
      if (index > 500) break
    }
    return candidate
  }

  // ── A03 预处理 ──────────────────────────────────────────────────

  async preprocess(input: { item: string }): Promise<ActionResult> {
    const { snapshot } = await this.store.load()
    const rel = input.item.replace(/^0-inbox\//, '')
    const noteRel = rel.endsWith('.md') ? `0-inbox/${rel}` : `0-inbox/notes/${rel}.md`
    const text = await this.store.read(noteRel)
    const page = parsePage(noteRel, text, this.store.libraryPath)
    const derived = typeof page.frontmatter.derivedFrom === 'string' ? page.frontmatter.derivedFrom : undefined
    if (derived === undefined) throw new ActionError('E_NO_SOURCE', '这条素材没有原始文件，无需预处理')

    const ext = (derived.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase()
    let extracted = ''
    let channel = ''
    /** 附加说明：抽取通道的质量、切片数、时长等，直接写进素材正文。 */
    const extraLines: string[] = []

    if (TEXT_FILE_EXT.test(derived)) {
      extracted = await this.store.read(derived)
      channel = 'text'
    } else if (ext === 'pdf') {
      // 先走 pdftotext（质量最好），没有就退到纯 JS 抽取。
      extracted = await extractPdf(this.store.abs(derived)).catch(() => '')
      channel = extracted === '' ? '' : 'pdf'
      if (extracted === '') {
        // 通道二：本机 python3 + pypdf（质量最好，缺了就继续降级）。
        const pypdf = await extractPdfViaPython(this.store.abs(derived)).catch(() => undefined)
        if (pypdf !== undefined) {
          extracted = pypdf.text
          channel = 'pdf-pypdf'
          extraLines.push(`- 抽取说明：${pypdf.note}`)
        }
      }
      if (extracted === '') {
        // 通道三：纯 JS（只对结构简单的文本型 PDF有效）。
        const fallback = await extractPdfText(this.store.abs(derived)).catch(() => undefined)
        if (fallback !== undefined) {
          extracted = fallback.text
          channel = 'pdf-js'
          extraLines.push(`- 抽取说明：${fallback.note}`)
        }
      }
    } else if (AUDIO_EXT.test(derived)) {
      const audio = await this.transcribeAudio(derived, page)
      extracted = audio.text
      channel = audio.channel
      extraLines.push(...audio.notes)
    }
    if (extracted === '') {
      throw new ActionError(
        ext === 'pdf' ? 'E_PDF_UNAVAILABLE' : 'E_PREPROCESS_UNAVAILABLE',
        ext === 'pdf'
          ? 'PDF 抽取通道不可用（未安装 pdftotext）：文件已存档，不阻塞'
          : `「${ext}」类型没有可用的预处理通道：文件已存档，不阻塞`,
        { stored: derived },
      )
    }

    const now = this.ctx.now()
    const slug = page.id.split('/').slice(1).join('/')
    const body = [
      `- 原始文件：\`${derived}\``,
      `- 抽取通道：${channel}`,
      `- 抽取时间：${now}`,
      ...extraLines,
      '',
      '```text',
      extracted.slice(0, 40000),
      '```',
    ].join('\n')
    return this.run('A03', `预处理 ${slug}（${channel}）`, async receipt => {
      await this.store.write(`0-inbox/notes/${slug}.md`, buildRawText({
        slug,
        title: page.title,
        summary: clip(extracted, LIMITS.summaryChars),
        body,
        now,
        origin: 'upload',
        confirmed: 'auto',
        domain: page.domain,
        derivedFrom: derived,
        type: 'source',
        sources: [derived],
      }))
      receipt.changed = 1
    })
  }

  /**
   * 音视频：探时长 → 超过阈值就切片 → 逐片转写 → 合并。
   * 每一步单独报错，前端能说清是"没装 ffmpeg""没配 ASR"还是"接口限流"。
   */
  private async transcribeAudio(derived: string, page: WikiPage): Promise<{ text: string, channel: string, notes: string[] }> {
    const provider = this.ctx.audioProvider ?? 'none'
    const maxMinutes = this.ctx.audioMaxMinutes ?? 30
    const chunkMinutes = this.ctx.audioChunkMinutes ?? 10
    const absolute = this.store.abs(derived)

    if (provider === 'none') {
      throw new ActionError('E_PREPROCESS_UNAVAILABLE',
        'audioProvider=none：音视频只存档不转写。要转写就把配置改成 whisper（本机命令行）或 api（OpenAI 兼容接口）',
        { stored: derived })
    }

    const transcriber = await makeTranscriber(provider)
    if (!transcriber.ok) {
      throw new ActionError('E_PREPROCESS_UNAVAILABLE', `${transcriber.reason}：文件已存档，不阻塞`, { stored: derived })
    }

    const info = await probe(absolute)
    if (info === undefined) {
      throw new ActionError('E_PREPROCESS_UNAVAILABLE', '探不到时长（缺 ffprobe 或文件不可读）：文件已存档，不阻塞', { stored: derived })
    }

    const notes: string[] = [`- 时长：${Math.floor(info.durationSeconds / 60)} 分 ${info.durationSeconds % 60} 秒`]
    const slug = page.id.split('/').slice(1).join('/')
    let pieces: { index: number, startSeconds: number, text: string }[] = []
    let parts: { directory: string, files: string[] } | undefined

    if (info.durationSeconds <= maxMinutes * 60) {
      const text = await transcriber.transcribe(absolute, { part: 1, total: 1 }).catch((error: unknown) => {
        throw new ActionError('E_PREPROCESS_UNAVAILABLE', `转写失败：${error instanceof Error ? error.message : String(error)}`, { stored: derived })
      })
      pieces = [{ index: 1, startSeconds: 0, text }]
      notes.push('- 未切片：时长在阈值内')
    } else {
      const chunkSeconds = Math.max(60, chunkMinutes * 60)
      const outDir = this.store.abs(`0-inbox/files/.parts/${slug}`)
      const { mkdir } = await import('node:fs/promises')
      await mkdir(outDir, { recursive: true })
      const sliced = await slice(absolute, outDir, chunkSeconds, info.durationSeconds)
      if (sliced === undefined) {
        throw new ActionError('E_PREPROCESS_UNAVAILABLE',
          `切片失败（缺 ffmpeg 或音频不可解码）。阈值 ${maxMinutes} 分钟，本文件 ${Math.round(info.durationSeconds / 60)} 分钟：文件已存档`,
          { stored: derived })
      }
      parts = { directory: `0-inbox/files/.parts/${slug}`, files: sliced.parts.map(part => part.name) }
      notes.push(`- 已切片：${sliced.parts.length} 段 × 约 ${chunkMinutes} 分钟（中间物在 \`${parts.directory}\`）`)
      for (const [offset, part] of sliced.parts.entries()) {
        const text = await transcriber.transcribe(join(outDir, part.name), { part: offset + 1, total: sliced.parts.length })
          .catch((error: unknown) => {
            throw new ActionError('E_PREPROCESS_UNAVAILABLE',
              `第 ${offset + 1}/${sliced.parts.length} 段转写失败：${error instanceof Error ? error.message : String(error)}`, { stored: derived })
          })
        pieces.push({ index: offset + 1, startSeconds: offset * chunkSeconds, text })
      }
    }

    return {
      text: mergeParts(pieces),
      channel: provider === 'whisper' ? 'whisper' : 'asr-api',
      notes: [...notes, ...(parts === undefined ? [] : [`- 切片清单：${parts.files.join('、')}`])],
    }
  }

  // ── A04 采集执行 ────────────────────────────────────────────────

  async collect(input: { urls: string[], topic?: string, domain?: string, maxItems?: number }): Promise<ActionResult> {
    const urls = (input.urls ?? []).map(url => url.trim()).filter(url => url !== '')
    if (urls.length === 0) throw new ActionError('E_NO_SOURCE', '采集源为空：先在任务里配置采集源')
    const maxItems = Math.max(1, Math.min(input.maxItems ?? 5, 20))
    const { snapshot } = await this.store.load()
    const now = this.ctx.now()
    const items: { title: string, text: string, url: string }[] = []
    for (const url of urls.slice(0, maxItems)) {
      try {
        const response = await fetch(url, { headers: { 'user-agent': 'llm-wiki-collector/1.0' } })
        if (!response.ok) continue
        const html = await response.text()
        items.push({ title: titleOfHtml(html) || url, text: textOfHtml(html), url })
      } catch {
        // 单个源失败不阻塞其余源；失败会体现在回执里。
      }
    }
    if (items.length === 0) throw new ActionError('E_RATE_LIMIT', '所有采集源都失败了：稍后重试或换源')

    const slug = uniqueSlug(snapshot, `collect-${slugify(input.topic ?? 'web')}`)
    const body = items.map((item, index) => [
      `### ${index + 1}. ${item.title}`,
      '',
      `- 来源：${item.url}`,
      '',
      item.text.slice(0, 4000),
      '',
    ].join('\n')).join('\n')
    return this.run('A04', `采集 ${items.length} 条（${input.topic ?? '未命名主题'}）`, async receipt => {
      await this.store.write(`0-inbox/collect/${slug}.md`, buildRawText({
        slug,
        title: input.topic ?? `采集 ${now.slice(0, 10)}`,
        summary: clip(items.map(item => item.title).join(' / '), LIMITS.summaryChars),
        body,
        now,
        origin: 'collect',
        confirmed: 'auto',
        domain: input.domain,
        sources: items.map(item => item.url),
        type: 'source',
      }))
      receipt.created = 1
      receipt.notes.push(`失败 ${urls.length - items.length} 个源`)
    })
  }

  // ── A05 确认入库 ────────────────────────────────────────────────

  async confirm(input: { items?: string[], all?: boolean, byHuman?: boolean }): Promise<ActionResult> {
    const { snapshot } = await this.store.load()
    const inbox = await this.inboxItems()
    const picked = input.all === true
      ? inbox
      : inbox.filter(item => (input.items ?? []).some(name => name === item.rel || name === item.slug))
    if (picked.length === 0) throw new ActionError('E_NOT_FOUND', '没有匹配的待确认素材')

    return this.run('A05', `确认入库 ${picked.length} 条`, async receipt => {
      for (const item of picked) {
        const text = await this.store.read(`0-inbox/notes/${item.slug}.md`)
        const page = parsePage(`0-inbox/notes/${item.slug}.md`, text, this.store.libraryPath)
        const confirmed = input.byHuman === true ? 'human' : 'auto'
        const rawText = text
          .replace(/^confirmed:\s*\S+$/m, `confirmed: ${confirmed}`)
          .replace(/^status:\s*\S+$/m, 'status: stub')
        const target = `${WIKI_LAYOUT.rawDir}/${item.slug}.md`
        const exists = await this.store.exists(target)
        await this.store.write(`${target}${exists ? '.new' : ''}`, rawText)
        if (exists) {
          // 同名素材已确认过：不覆盖，留成 .new 供人比对。
          receipt.notes.push(`${item.slug} 已存在，本次落为 .new`)
        } else {
          receipt.created += 1
        }
        // 原始附件跟着走，否则 raw 页的 derivedFrom 会指向已删除的路径。
        const derived = typeof page.frontmatter.derivedFrom === 'string' ? page.frontmatter.derivedFrom : undefined
        if (derived !== undefined && await this.store.exists(derived)) {
          const attachment = `${WIKI_LAYOUT.attachments}/${basename(derived)}`
          if (!await this.store.exists(attachment)) {
            const { rename } = await import('node:fs/promises')
            await rename(this.store.abs(derived), this.store.abs(attachment))
          }
          await this.store.write(target, rawText.replace(derived, attachment))
        }
        await this.store.remove(`0-inbox/notes/${item.slug}.md`)
        receipt.removed += 1
      }
    })
  }

  /** 待确认素材清单（0-inbox 下的 notes / collect）。 */
  async inboxItems(): Promise<{ slug: string, rel: string, title: string, updated: string, kind: string, origin?: string }[]> {
    const items: { slug: string, rel: string, title: string, updated: string, kind: string, origin?: string }[] = []
    for (const dir of [WIKI_LAYOUT.inboxNotes, WIKI_LAYOUT.inboxCollect]) {
      const files = await this.store.listFiles(dir, false)
      for (const file of files) {
        const text = await this.store.read(file)
        const page = parsePage(file, text, this.store.libraryPath)
        // 原始文件路径：整目录上传时这里会带出 book/ch1/a.md 这种相对路径，
        // 面板的确认队列据此显示"它原来在哪个文件夹"，不再只有一条文件名。
        const derived = typeof page.frontmatter.derivedFrom === 'string' ? page.frontmatter.derivedFrom : ''
        const origin = derived.startsWith(`${WIKI_LAYOUT.inboxFiles}/`)
          ? derived.slice(WIKI_LAYOUT.inboxFiles.length + 1)
          : undefined
        items.push({
          slug: page.id.split('/').slice(1).join('/'),
          rel: file,
          title: page.title,
          updated: page.updated,
          kind: dir === WIKI_LAYOUT.inboxCollect ? 'collect' : 'note',
          origin,
        })
      }
    }
    return items
  }

  // ── A06 撤回素材 ────────────────────────────────────────────────

  async retract(input: { item: string }): Promise<ActionResult> {
    const rel = input.item.replace(/^0-inbox\//, '')
    const candidates = [`0-inbox/${rel}`, `0-inbox/notes/${rel}.md`, `0-inbox/collect/${rel}.md`]
    let target: string | undefined
    for (const candidate of candidates) {
      if (await this.store.exists(candidate)) { target = candidate; break }
    }
    if (target === undefined) throw new ActionError('E_NOT_FOUND', `找不到素材 ${input.item}`)
    return this.run('A06', `撤回素材 ${target}`, async receipt => {
      await this.store.remove(target!)
      receipt.removed = 1
    })
  }

  // ── A07 编译素材（交给 agent）────────────────────────────────────

  async compile(input: { items?: string[], all?: boolean }): Promise<ActionResult> {
    const { snapshot } = await this.store.load()
    const raws = [...snapshot.raw.values()]
    const picked = input.all === true
      ? raws
      : raws.filter(page => (input.items ?? []).some(item => item === page.id || item === page.id.split('/')[1]))
    if (picked.length === 0) throw new ActionError('E_EMPTY_RAW', '1-raw 里没有可编译的素材：先确认一批素材')

    const instruction = [
      `编译 ${picked.length} 条素材为 wiki 页。步骤：`,
      ...picked.map((page, index) => `${index + 1}. \`${page.id}\` — ${page.title}`),
      '',
      '对每一条：先 wiki_search 查重（同主题就别新建），再读已存在的相关页；',
      '然后 wiki_write（mode=propose）写一张完整页面：',
      '- 一页只讲一件事，title/summary 各自独立可读；',
      '`## 关联` 至少一条指向已存在的页（找不到就先补一张 stub 提案）；',
      '- `sources` 写素材 id（如 raw/xxx）；矛盾之处标 status=contested 并在正文写清两边说法；',
      '- 最后跑 wiki_lint，把新页的 error 清零。',
      '',
      '不要修改 1-raw 里的素材；不要在 2-wiki 里直写（走提案）。',
    ].join('\n')

    const accepted = await this.ctx.deferToAgent(instruction, '编译素材')
    return {
      receipt: { ...emptyReceipt('A07'), notes: [accepted ? '已交给 agent 执行' : '无法创建任务，指令已返回'] },
      instruction,
    }
  }

  // ── A08 缺口补页（交给 agent）──────────────────────────────────

  async gap(input: { query: string }): Promise<ActionResult> {
    const { snapshot } = await this.store.load()
    const hits = searchPages(snapshot, input.query, { limit: 6 })
    const instruction = [
      `知识库里缺一个能回答「${input.query}」的页。`,
      `现有最接近的命中：${hits.length === 0 ? '（无）' : hits.map(hit => `\`${hit.id}\` ${hit.title}`).join('、')}`,
      '',
      '先 wiki_read 这些页，确认确实缺；再 wiki_write（mode=propose）建一张 stub 页，',
      '写清「已知 / 未知 / 需要什么来源」，并在 `## 关联` 里挂到最接近的两页。',
    ].join('\n')
    const accepted = await this.ctx.deferToAgent(instruction, '补缺口页')
    return {
      receipt: { ...emptyReceipt('A08'), notes: [accepted ? '已交给 agent 执行' : '无法创建任务，指令已返回'] },
      instruction,
    }
  }

  // ── A09 合并提案 ────────────────────────────────────────────────

  async merge(input: { paths?: string[], all?: boolean, dryRun?: boolean }): Promise<ActionResult> {
    const { snapshot, proposals } = await this.store.load()
    const picked = input.all === true
      ? proposals
      : proposals.filter(proposal => (input.paths ?? []).some(name => name === proposal.path || name === basename(proposal.path)))
    if (picked.length === 0) throw new ActionError('E_NOT_FOUND', '没有匹配的提案')

    type Step = { proposal: typeof picked[number], pageRel: string, body: string, existed: boolean }
    const steps: Step[] = []
    const conflicts: string[] = []
    const schemaErrors: string[] = []

    for (const proposal of picked) {
      const target = proposal.meta.target
      const segment = target.split('/')[0] ?? ''
      if (!Object.values(PAGE_TYPE_SEGMENT).includes(segment)) {
        schemaErrors.push(`${proposal.path}：目标 id 目录非法（${target}）`)
        continue
      }
      const pageRel = `${WIKI_LAYOUT.wikiDir}/${target}.md`
      const existing = snapshot.byId.get(target)
      if (proposal.meta.base !== undefined && existing !== undefined && existing.updated !== proposal.meta.base) {
        conflicts.push(`${target}：提案基于 ${proposal.meta.base}，当前是 ${existing.updated}`)
        continue
      }
      const errors = checkPageBody(proposal.body, target, snapshot, this.store.libraryPath)
      if (errors.length > 0) {
        schemaErrors.push(`${proposal.path}：${errors.join('；')}`)
        continue
      }
      steps.push({ proposal, pageRel, body: proposal.body, existed: existing !== undefined })
    }

    if (schemaErrors.length > 0) throw new ActionError('E_SCHEMA', schemaErrors.join('\n'), { schemaErrors })
    if (conflicts.length > 0) throw new ActionError('E_CONFLICT', conflicts.join('\n'), { conflicts })

    if (input.dryRun === true) {
      return {
        receipt: { ...emptyReceipt('A09'), notes: [`将改动 ${steps.length} 页`] },
        instruction: steps.map(step => `${step.existed ? '更新' : '新建'} \`${step.proposal.meta.target}\``).join('\n'),
      }
    }

    const written: string[] = []
    return this.run('A09', `合并 ${picked.length} 个提案`, async receipt => {
      try {
        for (const step of steps) {
          if (step.existed) await this.store.backup(step.pageRel)
          await this.store.write(step.pageRel, step.body)
          written.push(step.pageRel)
          if (step.existed) receipt.changed += 1
          else receipt.created += 1
        }
      } catch (error) {
        // 半途失败：把已写的改动全部退回原样，提案一个不删。
        for (const rel of written) {
          const backup = await this.latestBackupOf(rel)
          if (backup !== undefined) await this.store.write(rel, await this.store.read(backup))
          else await this.store.remove(rel, { hard: true })
        }
        throw error
      }
      for (const step of steps) {
        await this.store.remove(step.proposal.path)
        receipt.removed += 1
      }
      const { snapshot: fresh } = await this.store.load()
      await this.store.write(WIKI_LAYOUT.indexPath, renderIndex(fresh, { updated: this.ctx.now() }))
      // git 开着就顺手提交一次：一条合并 = 一个可回滚的版本。
      if (this.ctx.gitEnabled === true && (this.ctx.gitAutoCommit ?? true)) {
        const hash = await commitLibrary(this.store.libraryPath, `merge: ${receipt.removed} proposals`).catch(() => null)
        if (hash !== null) receipt.notes.push(`已提交 ${hash}`)
      }
    })
  }

  private async latestBackupOf(relPath: string): Promise<string | undefined> {
    const files = await this.store.listAny(WIKI_LAYOUT.backupDir, false)
    const matches = files.filter(file => basename(file).includes(relPath.replace(/\//g, '_'))).sort()
    return matches[matches.length - 1]
  }

  // ── A10 提案过期 ────────────────────────────────────────────────

  async expireProposals(input: { keepDays?: number, dryRun?: boolean } = {}): Promise<ActionResult> {
    const keepDays = input.keepDays ?? LIMITS.proposalKeepDays
    const { proposals } = await this.store.load()
    const now = Date.parse(this.ctx.now())
    const stale = proposals.filter(proposal => {
      const stamp = proposal.path.match(/(\d{8})-(\d{4})/u)
      if (stamp === null) return false
      const iso = `${stamp[1]!.slice(0, 4)}-${stamp[1]!.slice(4, 6)}-${stamp[1]!.slice(6, 8)}T${stamp[2]!.slice(0, 2)}:${stamp[2]!.slice(2, 4)}:00Z`
      const at = Date.parse(iso)
      return Number.isNaN(at) ? false : (now - at) / 86_400_000 > keepDays
    })
    if (input.dryRun === true) {
      return { receipt: { ...emptyReceipt('A10'), notes: [`${stale.length} 个提案超过 ${keepDays} 天`] }, instruction: stale.map(item => item.path).join('\n') }
    }
    return this.run('A10', `清理过期提案 ${stale.length} 个`, async receipt => {
      for (const proposal of stale) {
        await this.store.remove(proposal.path)
        receipt.removed += 1
      }
    })
  }

  /**
   * 提案队列的"丢弃"：把提案挪进 `3-review/.trash`。
   * 与 A10 的区别在语义：A10 是"放太久自动过期"，这里是"人看过，不要了"。
   */
  async discardProposals(input: { paths?: string[], all?: boolean } = {}): Promise<ActionResult> {
    const { proposals } = await this.store.load()
    const picked = input.all === true
      ? proposals
      : proposals.filter(proposal => (input.paths ?? []).includes(proposal.path))
    if (picked.length === 0) throw new ActionError('E_NOT_FOUND', '没有匹配的提案')
    return this.run('A09', `丢弃提案 ${picked.length} 个`, async receipt => {
      for (const proposal of picked) {
        await this.store.remove(proposal.path)
        receipt.removed += 1
      }
    }, picked.map(proposal => proposal.path))
  }

  // ── A11 结构体检 ────────────────────────────────────────────────

  async lint(input: { fix?: boolean } = {}): Promise<ActionResult> {
    const loaded = await this.store.load()
    const findings = lintSnapshot(loaded.snapshot, {
      indexText: loaded.indexText,
      proposalCount: loaded.proposals.length,
      now: this.ctx.now(),
    })
    const result = await this.run('A11', `体检 ${findings.length} 项（${JSON.stringify(summarize(findings))}）`, async receipt => {
      if (input.fix === true) {
        const fixable = fixableFindings(findings)
        if (fixable.length > 0) {
          await this.store.write(WIKI_LAYOUT.indexPath, renderIndex(loaded.snapshot, { updated: this.ctx.now() }))
          receipt.changed = 1
          receipt.notes.push(`修复 ${fixable.length} 项可修问题（重建索引）`)
        }
      }
    })
    return {
      ...result,
      detail: {
        counts: summarize(findings),
        findings: findings.slice(0, 200).map(item => ({
          code: item.code,
          severity: item.severity,
          page: item.page,
          message: item.message,
          target: item.target ?? '',
        })),
      },
    }
  }

  // ── A12 去重扫描 ────────────────────────────────────────────────

  async dedupe(input: { threshold?: number, limit?: number, dryRun?: boolean } = {}): Promise<ActionResult> {
    const { snapshot } = await this.store.load()
    const pairs = dedupe(snapshot, {
      threshold: input.threshold ?? LIMITS.dupThreshold,
      limit: input.limit ?? LIMITS.dupMaxPairs,
    })
    if (pairs.length === 0) {
      return { receipt: { ...emptyReceipt('A12'), notes: ['没有达到阈值的重复候选'] } }
    }
    if (input.dryRun === true) {
      return {
        receipt: { ...emptyReceipt('A12'), notes: [`${pairs.length} 组候选`] },
        instruction: pairs.map(pair => `${pair.keep} ⇔ ${pair.drop}（${pair.similarity.toFixed(2)}）`).join('\n'),
      }
    }
    const now = this.ctx.now()
    return this.run('A12', `去重候选 ${pairs.length} 组`, async receipt => {
      for (const pair of pairs) {
        const keep = snapshot.byId.get(pair.keep)
        const drop = snapshot.byId.get(pair.drop)
        if (keep === undefined || drop === undefined) continue
        const merged = mergePages(keep, drop, now)
        await this.store.write(proposalPath(this.store.libraryPath, keep.id, now, 'dedupe'), buildProposalText({
          target: keep.id,
          action: 'merge',
          pageText: merged,
          now,
          rationale: `与 ${drop.id} 相似度 ${pair.similarity.toFixed(2)}，建议合并后废止后者`,
          baseUpdated: keep.updated,
        }))
        await this.store.write(proposalPath(this.store.libraryPath, drop.id, now, 'deprecate'), buildProposalText({
          target: drop.id,
          action: 'deprecate',
          pageText: deprecatePage(drop, keep.id, now),
          now,
          rationale: `内容已并入 ${keep.id}`,
          baseUpdated: drop.updated,
        }))
        receipt.created += 2
      }
    })
  }

  // ── A13 矛盾扫描（交给 agent）──────────────────────────────────

  async contradict(input: { domain?: string, maxPages?: number } = {}): Promise<ActionResult> {
    const { snapshot } = await this.store.load()
    const pages = snapshot.pages
      .filter(page => page.status === 'active' && (input.domain === undefined || page.domain === input.domain))
      .slice(0, input.maxPages ?? 50)
    if (pages.length < 2) throw new ActionError('E_EMPTY_RAW', '可比的页不足两页')
    const instruction = [
      `检查 ${pages.length} 张 active 页之间的事实性矛盾（同一断言给出不同数值/结论/因果）。`,
      '候选页：',
      ...pages.map(page => `- \`${page.id}\` ${page.title}`),
      '',
      '读这些页，只报**互相冲突**的断言对；不要报"表述不同但意思一致"的重复。',
      '对每一对冲突：wiki_write（mode=propose, action=conflict-resolve）写一张裁决提案，',
      '把双方说法并列、给出判定与依据；无法判定的把两页都标 contested 并说明缺什么证据。',
    ].join('\n')
    const accepted = await this.ctx.deferToAgent(instruction, '矛盾扫描')
    return {
      receipt: { ...emptyReceipt('A13'), notes: [accepted ? '已交给 agent 执行' : '无法创建任务，指令已返回'] },
      instruction,
    }
  }

  // ── A14 过期页提醒 ──────────────────────────────────────────────

  async stale(input: { days?: number } = {}): Promise<ActionResult> {
    const { snapshot } = await this.store.load()
    const days = input.days ?? LIMITS.staleDays
    const now = Date.parse(this.ctx.now())
    const stale = snapshot.pages.filter(page => {
      if (page.type === 'index' || page.type === 'log') return false
      if (page.status !== 'active') return false
      const at = Date.parse(page.updated.length === 10 ? `${page.updated}T00:00:00Z` : page.updated)
      return Number.isNaN(at) ? false : (now - at) / 86_400_000 > days
    })
    return {
      receipt: { ...emptyReceipt('A14'), notes: [`${stale.length} 页超过 ${days} 天未更新`] },
      detail: { stale: stale.map(page => ({ id: page.id, title: page.title, updated: page.updated })) },
    }
  }

  // ── A15 重建索引 ────────────────────────────────────────────────

  async reindex(): Promise<ActionResult> {
    const { snapshot } = await this.store.load()
    const next = renderIndex(snapshot, { updated: this.ctx.now() })
    const current = (await this.store.readOptional(WIKI_LAYOUT.indexPath)) ?? ''
    if (current === next) {
      return { receipt: { ...emptyReceipt('A15'), notes: ['索引已是最新'] } }
    }
    return this.run('A15', '重建索引', async receipt => {
      await this.store.write(WIKI_LAYOUT.indexPath, next)
      receipt.changed = 1
    })
  }

  // ── A16 建库 ────────────────────────────────────────────────────

  async bootstrap(): Promise<ActionResult> {
    const now = this.ctx.now()
    const { created, skipped } = await this.store.bootstrap(now)
    return {
      receipt: { ...emptyReceipt('A16'), created: created.length, notes: skipped.length > 0 ? [`跳过已存在 ${skipped.length} 个`] : [] },
      detail: { created, skipped },
    }
  }

  // ── A17 回滚 ────────────────────────────────────────────────────

  /**
   * 回到某个提交的 `2-wiki` / `3-review`。
   * 先给当前状态打一份 `.backup`，所以"回滚错了"本身还能再回滚。
   */
  async rollback(input: { commit?: string, path?: string }): Promise<ActionResult> {
    if (this.ctx.gitEnabled !== true) {
      throw new ActionError('E_NO_GIT', 'git 回滚默认关闭：需要时把配置 gitEnabled 打开并确保库是一个 git 仓库')
    }
    const repo = await inspectRepo(this.store.libraryPath)
    if (!repo.ok) throw new ActionError(repo.code, repo.message)
    if (input.commit === undefined || input.commit.trim() === '') {
      throw new ActionError('E_BAD_COMMIT', '需要指定要回滚到的提交')
    }

    const commit = input.commit.trim()
    const before = await this.store.backupTree(WIKI_LAYOUT.wikiDir)

    if (input.path !== undefined && input.path.trim() !== '') {
      const rel = input.path.trim().replace(/^\/+/, '')
      if (!rel.startsWith('2-wiki/') && !rel.startsWith('3-review/')) {
        throw new ActionError('E_CONFLICT', '只允许回滚 2-wiki / 3-review 里的文件')
      }
      await restoreFile(this.store.libraryPath, commit, rel).catch((error: unknown) => {
        throw new ActionError('E_BAD_COMMIT', `回滚 ${rel} 失败：${error instanceof Error ? error.message : String(error)}`)
      })
      return this.run('A17', `回滚单页 ${rel} 到 ${commit.slice(0, 8)}`, async receipt => {
        receipt.changed = 1
        if (before !== '') receipt.notes.push(`回滚前备份：${before}`)
      }, [`commit ${commit}`, rel])
    }

    const restored = await restoreTree(this.store.libraryPath, commit).catch((error: unknown) => {
      throw new ActionError('E_BAD_COMMIT', `回滚失败：${error instanceof Error ? error.message : String(error)}`)
    })

    // 当前有、那版没有的文件：移进回收站，而不是留在库里制造"幽灵页"。
    const extras = restored.extras
    for (const rel of extras) {
      await this.store.remove(`2-wiki/${rel.replace(/^2-wiki\//, '')}`).catch(() => {})
    }

    return this.run('A17', `回滚到 ${commit.slice(0, 8)}`, async receipt => {
      receipt.changed = restored.restored.length
      receipt.removed = extras.length
      if (before !== '') receipt.notes.push(`回滚前备份：${before}`)
    }, [`commit ${commit}`, `恢复 ${restored.restored.length} 个文件`, extras.length === 0 ? '没有多余文件' : `移入回收站 ${extras.length} 个: ${extras.join(', ')}`])
  }

  // ── A18 安全清理 ────────────────────────────────────────────────

  async cleanSafe(input: { dryRun?: boolean } = {}): Promise<ActionResult> {
    const targets: { rel: string, reason: string }[] = []
    const now = Date.now()

    // 1) 残留临时文件（崩溃留下的半写）
    for (const dir of [WIKI_LAYOUT.wikiDir, WIKI_LAYOUT.rawDir, WIKI_LAYOUT.proposalDir, WIKI_LAYOUT.inboxNotes]) {
      for (const file of await this.store.listAny(dir, false)) {
        if (!/\.tmp-[0-9a-f]{8}$/u.test(file)) continue
        if (now - (await mtimeOf(this.store.abs(file))) > 3_600_000) targets.push({ rel: file, reason: '临时文件残留' })
      }
    }

    // 2) 回收站与备份超过保留期
    for (const dir of [WIKI_LAYOUT.trashDir, WIKI_LAYOUT.backupDir]) {
      for (const file of await this.store.listAny(dir, true)) {
        if (now - (await mtimeOf(this.store.abs(file))) > LIMITS.trashKeepDays * 86_400_000) {
          targets.push({ rel: file, reason: '超过保留期' })
        }
      }
    }

    // 3) 音视频切片残留（对应素材已确认时）
    for (const file of await this.store.listAny(WIKI_LAYOUT.inboxParts, true)) {
      if (/\.(wav|mp3|m4a|mp4|mov|part\d+)$/iu.test(file)) targets.push({ rel: file, reason: '切片中间物' })
    }

    // 4) 索引/日志的备份副本
    for (const file of await this.store.listAny(WIKI_LAYOUT.backupDir, true)) {
      if (basename(file).includes('index.md') || basename(file).includes('log.md')) {
        targets.push({ rel: file, reason: '索引备份' })
      }
    }

    const unique = targets.filter((target, index) => targets.findIndex(other => other.rel === target.rel) === index)
    if (input.dryRun === true) {
      return {
        receipt: { ...emptyReceipt('A18'), notes: [`将清理 ${unique.length} 个文件`] },
        detail: { targets: unique },
      }
    }
    return this.run('A18', `安全清理 ${unique.length} 个文件`, async receipt => {
      for (const target of unique) {
        try {
          await this.store.remove(target.rel, { hard: true })
          receipt.removed += 1
        } catch {
          receipt.notes.push(`跳过 ${target.rel}`)
        }
      }
    }, unique.map(target => `${target.rel} — ${target.reason}`))
  }

  // ── A19 深度清理 ────────────────────────────────────────────────

  async cleanDeep(input: { items?: string[], dryRun?: boolean } = {}): Promise<ActionResult> {
    const { snapshot } = await this.store.load()

    // 候选：没有任何 raw 页 derivedFrom 指向的附件
    const referenced = new Set<string>()
    for (const page of snapshot.raw.values()) {
      const derived = page.frontmatter.derivedFrom
      if (typeof derived === 'string') referenced.add(derived)
    }
    const orphans = (await this.store.listAny(WIKI_LAYOUT.attachments, false))
      .filter(file => !referenced.has(file))
      .map(file => ({ rel: file, reason: '没有素材页引用' }))

    // 候选：超过 30 天仍未确认的 inbox 素材
    const staleInbox: { rel: string, reason: string }[] = []
    const now = Date.now()
    for (const item of await this.inboxItems()) {
      if (now - (await mtimeOf(this.store.abs(item.rel))) > 30 * 86_400_000) {
        staleInbox.push({ rel: item.rel, reason: '30 天未确认' })
      }
    }

    const candidates = [...orphans, ...staleInbox]
    if (input.items === undefined || input.items.length === 0) {
      return {
        receipt: { ...emptyReceipt('A19'), notes: [`${candidates.length} 项候选，需逐项勾选`] },
        detail: { candidates },
      }
    }
    const picked = candidates.filter(candidate => input.items!.includes(candidate.rel))
    if (picked.length === 0) throw new ActionError('E_STALE_PREVIEW', '清单已变化：请重新预览后再勾选')

    if (input.dryRun === true) {
      return { receipt: { ...emptyReceipt('A19'), notes: [`将移入回收站 ${picked.length} 项`] }, detail: { candidates: picked } }
    }
    return this.run('A19', `深度清理 ${picked.length} 项（进回收站）`, async receipt => {
      for (const candidate of picked) {
        await this.store.remove(candidate.rel)
        receipt.removed += 1
      }
    }, picked.map(candidate => `${candidate.rel} — ${candidate.reason}`))
  }

  /** 面板状态：一次拉全，前端只读。 */
  async state(): Promise<Record<string, unknown>> {
    // 库还没建：返回一个"空库"状态，让面板显示初始化按钮，而不是抛错。
    if (!(await this.store.rootExists())) {
      return {
        initialized: false,
        library: { path: this.store.libraryPath, name: '' },
        mode: { git: this.ctx.gitEnabled, audio: 'none' },
        counts: { wiki: 0, stub: 0, active: 0, contested: 0, deprecated: 0, raw: 0, inbox: 0, proposals: 0, orphan: 0 },
        health: 0,
        findings: { error: 0, warn: 0, info: 0, items: [] },
        occupancy: { attachments: 0, parts: 0, backup: 0, trash: 0, pages: 0, total: 0 },
        inbox: [],
        proposals: [],
        pages: [],
      }
    }
    const loaded = await this.store.load()
    const inbound = loaded.snapshot.inbound
    const counts = {
      wiki: loaded.snapshot.pages.filter(page => page.type !== 'index' && page.type !== 'log').length,
      stub: loaded.snapshot.pages.filter(page => page.status === 'stub').length,
      active: loaded.snapshot.pages.filter(page => page.status === 'active').length,
      contested: loaded.snapshot.pages.filter(page => page.status === 'contested').length,
      deprecated: loaded.snapshot.pages.filter(page => page.status === 'deprecated').length,
      raw: loaded.snapshot.raw.size,
      inbox: (await this.inboxItems()).length,
      proposals: loaded.proposals.length,
      orphan: [...inbound.entries()].filter(([, count]) => count === 0).length,
    }
    const findings = lintSnapshot(loaded.snapshot, {
      indexText: loaded.indexText,
      proposalCount: loaded.proposals.length,
      now: this.ctx.now(),
    })
    const health = loaded.snapshot.pages.length === 0
      ? 100
      : Math.max(0, 100 - findings.filter(item => RULES[item.code].severity === 'error').length * 5
        - findings.filter(item => RULES[item.code].severity === 'warn').length * 2)
    const occupancy = await this.store.occupancy()
    return {
      initialized: true,
      counts,
      health,
      findings: summarize(findings),
      occupancy,
      inbox: await this.inboxItems(),
      proposals: loaded.proposals.map(proposal => ({
        path: proposal.path,
        target: proposal.meta.target,
        action: proposal.meta.action,
        reason: proposal.meta.reason ?? '',
        generatedAt: proposal.meta.generatedAt ?? '',
      })),
      pages: loaded.snapshot.pages
        .filter(page => page.type !== 'index' && page.type !== 'log')
        .sort((left, right) => (inbound.get(right.id) ?? 0) - (inbound.get(left.id) ?? 0))
        .slice(0, 60)
        .map(page => ({
          id: page.id,
          title: page.title,
          status: page.status,
          domain: page.domain ?? '',
          inbound: inbound.get(page.id) ?? 0,
          updated: page.updated,
        })),
    }
  }
}

async function mtimeOf(absolute: string): Promise<number> {
  const { stat } = await import('node:fs/promises')
  try {
    return (await stat(absolute)).mtimeMs
  } catch {
    return Date.now()
  }
}

/** PDF 抽取：只做本地 pdftotext，不引第三方二进制依赖。 */
async function extractPdf(absolute: string): Promise<string> {
  const { execFile } = await import('node:child_process')
  return new Promise((resolve, reject) => {
    execFile('pdftotext', ['-layout', '-q', absolute, '-'], { maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error !== null) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}

function titleOfHtml(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match === null ? '' : decodeEntities(match[1]!).replace(/\s+/g, ' ').trim()
}

function textOfHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n'),
  ).trim()
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** 把两张页合并成一张：保留 keep 的骨架，补进 drop 独有的要点。 */
function mergePages(keep: WikiPage, drop: WikiPage, now: string): string {
  const extra = drop.body
    .split('\n')
    .filter(line => line.trim().startsWith('- ') || line.trim().startsWith('* '))
    .filter(line => !stripCode(keep.body).includes(line.trim()))
    .slice(0, 20)
  const body = [
    keep.body.trim(),
    '',
    '## 合并补充',
    '',
    `> 来自 [[${drop.id}]]：以下要点在合并前只存在于被合并页。`,
    '',
    ...extra,
    '',
  ].join('\n')
  return buildPageText({
    id: keep.id,
    type: keep.type,
    title: keep.title,
    summary: keep.summary,
    body: body.replace(/^#\s.*$/m, ''),
    status: keep.status,
    tags: [...new Set([...keep.tags, ...drop.tags])],
    aliases: [...new Set([...keep.aliases, ...drop.aliases])],
    sources: [...new Set([...keep.sources, ...drop.sources])],
  }, { now, existing: { created: keep.created } })
}

/** 把一张页写成"已废止"的墓碑。 */
function deprecatePage(page: WikiPage, replaces: string, now: string): string {
  const body = [
    page.body.trim(),
    '',
    '## 废止说明',
    '',
    `- 为何废止：内容与 [[${replaces}]] 重复，合并后不再独立维护。`,
    `- 被谁替代：[[${replaces}]]`,
    `- 最后有效日期：${now.slice(0, 10)}`,
    '',
  ].join('\n').replace(/^#\s.*$/m, '')
  return buildPageText({
    id: page.id,
    type: page.type,
    title: page.title,
    summary: page.summary,
    body,
    status: 'deprecated',
    tags: page.tags,
    aliases: page.aliases,
    sources: page.sources,
  }, { now, existing: { created: page.created } })
}

export { ActionError }
export type { ActionError as ActionErrorType }
