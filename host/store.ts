/**
 * 库访问层：把一个纯 Markdown 文件夹读成 `Snapshot`，并承担唯一的写入口。
 *
 * 只用 node:fs ——宿主插件运行在宿主进程里，库是本地目录；相比 ctx.fs 少一层
 * 后端抽象，换来"同一份代码在 CLI / 桌面 / 测试里行为一致"。写路径由 `assertWritable` 兜底。
 */

import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile, copyFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import { buildSnapshot, parsePage } from '../core/parse.ts'
import { WIKI_DIRECTORIES, bootstrapFiles } from '../core/bootstrap.ts'
import { appendLog, logEntry, parseProposal } from '../core/draft.ts'
import {
  WIKI_LAYOUT,
  WRITABLE_PREFIXES,
  type Proposal,
  type Snapshot,
} from '../core/model.ts'

export interface LoadedWiki {
  snapshot: Snapshot
  indexText: string | undefined
  logText: string
  proposals: Proposal[]
  jobsRaw: string
}

export interface Occupancy {
  attachments: number
  parts: number
  backup: number
  trash: number
  total: number
}

const CACHE_TTL_MS = 2000

/** 库里所有写动作的唯一入口：越界拒绝、原子写、日志追踪。 */
export class WikiStore {
  private currentPath: string
  private cache: (LoadedWiki & { at: number, sig: string }) | undefined
  private queue: Promise<unknown> = Promise.resolve()

  constructor(libraryPath: string) {
    this.currentPath = libraryPath
  }

  /** 当前库根。切换知识库时就地重绑，所有下游（Actions / JobsStore / tools）跟着走。 */
  get libraryPath(): string {
    return this.currentPath
  }

  /**
   * 换一个库：同一个 store 实例继续服役，清掉按旧库算出来的缓存。
   * 面板的"选择知识库"就是在空间里挑一个文件夹后调这里。
   */
  rebase(libraryPath: string): void {
    this.currentPath = libraryPath
    this.cache = undefined
  }

  /** 把"库内相对路径"与"库内绝对路径"统一成相对路径；库外绝对路径原样保留，由调用处报错。 */
  private normalize(relPath: string): string {
    const withoutDot = relPath.replace(/^\.\//, '')
    if (withoutDot === this.libraryPath) return '.'
    if (withoutDot.startsWith(`${this.libraryPath}/`)) return withoutDot.slice(this.libraryPath.length + 1)
    return withoutDot
  }

  /** 库内相对路径 → 绝对路径；拒绝越界。 */
  abs(relPath: string): string {
    const normalized = this.normalize(relPath)
    const absolute = normalized.startsWith('/') ? normalized : join(this.libraryPath, normalized)
    const outside = relative(this.libraryPath, absolute)
    if (outside.startsWith('..')) throw new Error(`路径越界：${relPath}`)
    return absolute
  }

  /** 库根是否已存在（面板用它在建库前显示"未初始化"）。 */
  async rootExists(): Promise<boolean> {
    try {
      return (await stat(this.libraryPath)).isDirectory()
    } catch {
      return false
    }
  }

  /** 库根必须存在且是目录；不存在就报错，建库走 bootstrap()。 */
  async ensureLibrary(): Promise<void> {
    try {
      const info = await stat(this.libraryPath)
      if (!info.isDirectory()) throw new Error(`libraryPath 不是目录：${this.libraryPath}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`libraryPath 不存在：${this.libraryPath}（先在面板里初始化知识库）`)
      }
      throw error
    }
  }

  /** 串行化所有写动作：进程内单写者，避免两个按钮同时点导致半写状态。 */
  async exclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.queue
    let release: () => void = () => {}
    this.queue = new Promise<void>(resolve => { release = resolve })
    await previous.catch(() => {})
    try {
      return await task()
    } finally {
      release()
    }
  }

  /**
   * 四个阶段目录的 mtime 指纹。
   * 缓存不能只按时间失效：用户可能在 Obsidian 里直接改文件，2 秒窗口内的旧快照
   * 会让"刚写完提案就点合并"读到空提案列表。
   *
   * 关键点：**只看顶层目录 mtime 是不够的**。POSIX 语义下，在 `2-wiki/concepts/`
   * 里新建/删除文件，只改 `concepts/` 的 mtime，`2-wiki/` 自己的 mtime 不变。
   * 所以这里递归走一层子目录，把每个子目录的 mtime 也计入指纹；否则
   * "刚写完提案 → 立刻点合并"会读到 2 秒窗口内的旧快照，合并出空列表。
   */
  private async signature(): Promise<string> {
    const parts: string[] = []
    for (const directory of [WIKI_LAYOUT.inboxNotes, WIKI_LAYOUT.rawDir, WIKI_LAYOUT.wikiDir, WIKI_LAYOUT.proposalDir]) {
      const absolute = this.abs(directory)
      try {
        const info = await stat(absolute)
        parts.push(`${info.mtimeMs}`)
      } catch {
        parts.push('-')
        continue
      }
      // 再往下取一层：库的结构就是"顶层四个阶段目录 + 一层类型子目录"，不会更深。
      try {
        const children = await readdir(absolute, { withFileTypes: true })
        const dirs = children.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        for (const child of dirs.sort((left, right) => left.name.localeCompare(right.name))) {
          try {
            const info = await stat(join(absolute, child.name))
            parts.push(`${child.name}:${info.mtimeMs}`)
          } catch {
            parts.push(`${child.name}:-`)
          }
        }
      } catch {
        parts.push('!')
      }
    }
    return parts.join('|')
  }

  async load(): Promise<LoadedWiki> {
    if (this.cache !== undefined && Date.now() - this.cache.at < CACHE_TTL_MS) {
      // 时间没到也要确认目录没被动过。
      if ((await this.signature()) === this.cache.sig) return this.cache
    }
    await this.ensureLibrary()

    const wikiFiles = await listMarkdown(join(this.libraryPath, WIKI_LAYOUT.wikiDir))
    const pages = []
    for (const file of wikiFiles) {
      const rel = relative(this.libraryPath, file).split('\\').join('/')
      pages.push(parsePage(rel, await readFile(file, 'utf8'), this.libraryPath))
    }

    const rawFiles = await listMarkdown(join(this.libraryPath, WIKI_LAYOUT.rawDir), false)
    const rawPages = []
    for (const file of rawFiles) {
      const rel = relative(this.libraryPath, file).split('\\').join('/')
      rawPages.push(parsePage(rel, await readFile(file, 'utf8'), this.libraryPath))
    }

    const proposalFiles = await listMarkdown(join(this.libraryPath, WIKI_LAYOUT.proposalDir), false)
      .catch(() => [] as string[])
    const proposals: Proposal[] = []
    for (const file of proposalFiles) {
      const rel = relative(this.libraryPath, file).split('\\').join('/')
      const parsed = parseProposal(rel, await readFile(file, 'utf8'))
      if (parsed !== null) proposals.push(parsed)
    }

    const indexText = await this.readOptional(WIKI_LAYOUT.indexPath)
    const logText = (await this.readOptional(WIKI_LAYOUT.logPath)) ?? ''
    const jobsRaw = (await this.readOptional(WIKI_LAYOUT.jobsFile)) ?? ''

    const loaded: LoadedWiki = {
      snapshot: buildSnapshot(pages, rawPages),
      indexText,
      logText,
      proposals,
      jobsRaw,
    }
    this.cache = { ...loaded, at: Date.now(), sig: await this.signature() }
    return loaded
  }

  invalidate(): void {
    this.cache = undefined
  }

  async read(relPath: string): Promise<string> {
    return readFile(this.abs(relPath), 'utf8')
  }

  async readOptional(relPath: string): Promise<string | undefined> {
    try {
      return await readFile(this.abs(relPath), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  async exists(relPath: string): Promise<boolean> {
    try {
      await stat(this.abs(relPath))
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  /** 写一个文件；白名单之外一律拒绝。先写临时文件再 rename，避免半写。 */
  async write(relPath: string, text: string): Promise<void> {
    this.assertWritable(relPath)
    await this.assertInsideReal(relPath)
    const absolute = this.abs(relPath)
    await mkdir(dirname(absolute), { recursive: true })
    const temp = `${absolute}.tmp-${randomBytes(4).toString('hex')}`
    await writeFile(temp, text, 'utf8')
    await rename(temp, absolute)
    this.invalidate()
  }

  /** 删除一个文件；默认先丢进回收站，`hard` 才真删。 */
  async remove(relPath: string, options: { hard?: boolean } = {}): Promise<void> {
    this.assertWritable(relPath)
    await this.assertInsideReal(relPath)
    const absolute = this.abs(relPath)
    if (options.hard === true) {
      await rm(absolute, { force: true })
      this.invalidate()
      return
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
    const target = join(this.abs(WIKI_LAYOUT.trashDir), `${stamp}-${basename(relPath)}`)
    await mkdir(dirname(target), { recursive: true })
    await rename(absolute, target)
    this.invalidate()
  }

  /** 移动/改名（同一库内）。 */
  async move(fromRel: string, toRel: string): Promise<void> {
    this.assertWritable(fromRel)
    this.assertWritable(toRel)
    await this.assertInsideReal(fromRel)
    await this.assertInsideReal(toRel)
    const target = this.abs(toRel)
    await mkdir(dirname(target), { recursive: true })
    await rename(this.abs(fromRel), target)
    this.invalidate()
  }

  /** 备份一个文件到 3-review/.backup，用于合并前留底与回滚。 */
  async backup(relPath: string): Promise<string> {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
    const target = `${WIKI_LAYOUT.backupDir}/${stamp}-${relPath.replace(/\//g, '_')}`
    const absolute = this.abs(target)
    await mkdir(dirname(absolute), { recursive: true })
    await copyFile(this.abs(relPath), absolute)
    return target
  }

  /**
   * 备份整个目录（逐文件复制，保留相对结构）。
   * 回滚要"先把当前状态留底"，这一步不能对一个目录调用 copyFile。
   */
  async backupTree(relDir: string): Promise<string> {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
    const target = `${WIKI_LAYOUT.backupDir}/${stamp}-${relDir.replace(/\//g, '_')}`
    const files = await this.listFiles(relDir)
    for (const file of files) {
      // listFiles 给的是"库内相对路径"，这里再相对到被备份的目录。
      const inner = relative(relDir, file)
      const absolute = this.abs(`${target}/${inner}`)
      await mkdir(dirname(absolute), { recursive: true })
      await copyFile(this.abs(file), absolute)
    }
    return target
  }

  /** 只在四个阶段目录里允许写。判据是路径前缀，且不许出现 ..。 */
  /**
   * 白名单校验（纯字符串层）。
   *
   * 这一层只挡 `../` 与白名单前缀，**挡不住符号链接**：库里若有一个
   * `0-inbox/notes/evil -> /tmp/outside` 的软链，路径字符串仍然"合法"，
   * 实际却写到库外。真正的边界由 `assertInsideReal()` 用 realpath 兜住。
   */
  assertWritable(relPath: string): void {
    const normalized = this.normalize(relPath)
    if (normalized.startsWith('/') || normalized.includes('..')) {
      throw new Error(`拒绝写入 ${relPath}：路径必须相对库根且不含 ..`)
    }
    if (!WRITABLE_PREFIXES.some(prefix => normalized.startsWith(prefix))) {
      throw new Error(`拒绝写入 ${relPath}：只允许 ${WRITABLE_PREFIXES.join(' / ')}`)
    }
  }

  /**
   * 真实路径边界：沿符号链接解析后，目标必须仍在库内。
   *
   * 目标文件可能还不存在，所以从"最近的已存在祖先"开始 realpath，
   * 再把剩下的相对段接回去——这样新建深层目录也能正确判定。
   */
  async assertInsideReal(relPath: string): Promise<void> {
    const absolute = this.abs(relPath)
    const realRoot = await realpath(this.libraryPath).catch(() => this.libraryPath)

    let probe = absolute
    const tail: string[] = []
    for (;;) {
      const resolved = await realpath(probe).catch(() => undefined)
      if (resolved !== undefined) {
        const finalPath = tail.length === 0 ? resolved : join(resolved, ...tail)
        const outside = relative(realRoot, finalPath)
        if (outside === '' || (!outside.startsWith('..') && !isAbsolute(outside))) return
        throw new Error(`拒绝访问 ${relPath}：符号链接指向库外（${finalPath}）`)
      }
      const parent = dirname(probe)
      if (parent === probe) {
        // 一直走到文件系统根都没解析出来：交给后续的 mkdir/ENOENT 去报错。
        return
      }
      tail.unshift(basename(probe))
      probe = parent
    }
  }

  /** 白名单外仍必须写的生成物（WIKI.md、.gitignore）：只给建库用，别处不要调。 */
  private async writeRaw(relPath: string, text: string): Promise<void> {
    const absolute = this.abs(relPath)
    await mkdir(dirname(absolute), { recursive: true })
    const temp = `${absolute}.tmp-${randomBytes(4).toString('hex')}`
    await writeFile(temp, text, 'utf8')
    await rename(temp, absolute)
    this.invalidate()
  }

  /** 追加一条 log；log 不存在时自动补头。 */
  async appendLog(now: string, operation: Parameters<typeof logEntry>[0]['operation'], summary: string, details: string[] = []): Promise<void> {
    const current = (await this.readOptional(WIKI_LAYOUT.logPath)) ?? ''
    const entry = logEntry({ now, operation, summary, details })
    await this.write(WIKI_LAYOUT.logPath, appendLog(current, entry))
  }

  /** 建骨架；已存在的文件跳过。 */
  async bootstrap(now: string): Promise<{ created: string[], skipped: string[] }> {
    // 建库允许库根不存在：用户给一个路径点「初始化」，由这里创建。
    await mkdir(this.libraryPath, { recursive: true })
    for (const directory of WIKI_DIRECTORIES) {
      await mkdir(join(this.libraryPath, directory), { recursive: true })
    }
    const created: string[] = []
    const skipped: string[] = []
    for (const file of bootstrapFiles(now)) {
      if (await this.exists(file.path)) {
        skipped.push(file.path)
        continue
      }
      // WIKI.md 与 .gitignore 是生成物、不在可写白名单里，但建库时必须写。
      await this.writeRaw(file.path, file.text)
      created.push(file.path)
    }
    this.invalidate()
    return { created, skipped }
  }

  /** 目录占用：附件、切片、备份、回收站四个大头。 */
  async occupancy(): Promise<Occupancy> {
    const [attachments, parts, backup, trash] = await Promise.all([
      dirSize(this.abs(WIKI_LAYOUT.attachments)),
      dirSize(this.abs(WIKI_LAYOUT.inboxParts)),
      dirSize(this.abs(WIKI_LAYOUT.backupDir)),
      dirSize(this.abs(WIKI_LAYOUT.trashDir)),
    ])
    return { attachments, parts, backup, trash, total: attachments + parts + backup + trash }
  }

  /** 列出某个目录下的文件（库内相对路径）。 */
  async listFiles(relDir: string, recursive = true): Promise<string[]> {
    const files = await listMarkdown(this.abs(relDir), recursive)
    return files.map(file => relative(this.libraryPath, file).split('\\').join('/'))
  }

  /** 列出某个目录下的全部文件（不限扩展名）。 */
  async listAny(relDir: string, recursive = false): Promise<string[]> {
    const files = await listAll(this.abs(relDir), recursive)
    return files.map(file => relative(this.libraryPath, file).split('\\').join('/'))
  }
}

async function dirSize(directory: string): Promise<number> {
  let total = 0
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      total += await dirSize(full)
      continue
    }
    if (entry.isFile()) {
      try {
        total += (await stat(full)).size
      } catch {
        // 文件在统计过程中消失：忽略，下一次统计会自愈。
      }
    }
  }
  return total
}

async function listMarkdown(directory: string, recursive = true): Promise<string[]> {
  const result: string[] = []
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result
    throw error
  }
  for (const entry of entries) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue
      if (recursive) result.push(...await listMarkdown(full, true))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) result.push(full)
  }
  return result
}

async function listAll(directory: string, recursive: boolean): Promise<string[]> {
  const result: string[] = []
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result
    throw error
  }
  for (const entry of entries) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (recursive) result.push(...await listAll(full, true))
      continue
    }
    if (entry.isFile()) result.push(full)
  }
  return result
}
