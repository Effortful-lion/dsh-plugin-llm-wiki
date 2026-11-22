/**
 * Vault 访问层：把"一个 Obsidian vault 里的 mybrain 目录"读成 `Snapshot`。
 *
 * 只用 node:fs —— 插件运行在 host 进程，vault 是本地目录；相比 ctx.fs 少一层
 * 后端抽象，但换来"同一份代码在 CLI / 桌面 / 测试里行为一致"。写路径由
 * `assertWritable` 兜底：只有 wiki 投影区和 50_review 可写，人层笔记一律拒绝。
 */

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { buildSnapshot, parsePage } from '../../core/parse.ts'
import { WIKI_DIRECTORIES, bootstrapFiles } from '../../core/bootstrap.ts'
import { WIKI_LAYOUT, type Snapshot } from '../../core/model.ts'

export interface StoreConfig {
  /** vault 绝对路径，例如 `/Users/lion/workspace/obsidian-workspace`。 */
  vaultPath: string
  /** wiki 根目录（vault 相对），默认 `mybrain`。 */
  root: string
}

export interface LoadedWiki {
  snapshot: Snapshot
  indexText: string | undefined
  proposalCount: number
}

const CACHE_TTL_MS = 3000

export class WikiStore {
  readonly vaultPath: string
  readonly root: string
  private cache: (LoadedWiki & { at: number }) | undefined

  constructor(config: StoreConfig) {
    this.vaultPath = config.vaultPath
    this.root = config.root
  }

  /** wiki 根目录的绝对路径。 */
  get absRoot(): string {
    return join(this.vaultPath, this.root)
  }

  /** vault 相对路径 → 绝对路径；拒绝跳出 vault。 */
  abs(vaultRelative: string): string {
    const absolute = join(this.vaultPath, vaultRelative)
    const outside = relative(this.vaultPath, absolute)
    if (outside.startsWith('..')) throw new Error(`路径越界：${vaultRelative}`)
    return absolute
  }

  async ensureVault(): Promise<void> {
    try {
      const info = await stat(this.vaultPath)
      if (!info.isDirectory()) throw new Error(`vaultPath 不是目录：${this.vaultPath}`)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') throw new Error(`vaultPath 不存在：${this.vaultPath}（在插件配置里指向 Obsidian vault 根目录）`)
      throw error
    }
  }

  /** 读取 wiki 下的全部 Markdown，构建快照（带 3 秒缓存，写入后立即失效）。 */
  async load(): Promise<LoadedWiki> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache
    await this.ensureVault()

    const wikiDir = join(this.absRoot, WIKI_LAYOUT.wikiDir)
    const files = await listMarkdown(wikiDir)
    const pages = []
    for (const file of files) {
      const vaultRelative = relative(this.vaultPath, file).split('\\').join('/')
      const text = await readFile(file, 'utf8')
      pages.push(parsePage(vaultRelative, text, this.root))
    }

    const indexPage = pages.find(page => page.id === 'index')
    const indexText = indexPage ? await readFile(this.abs(`${this.root}/${WIKI_LAYOUT.indexPath}`), 'utf8') : undefined
    const proposals = await listMarkdown(join(this.absRoot, WIKI_LAYOUT.proposalDir)).catch(() => [] as string[])

    const loaded: LoadedWiki = { snapshot: buildSnapshot(pages), indexText, proposalCount: proposals.length }
    this.cache = { ...loaded, at: Date.now() }
    return loaded
  }

  /** 丢掉缓存：任何写入之后都必须调用。 */
  invalidate(): void {
    this.cache = undefined
  }

  async read(relativePath: string): Promise<string> {
    return readFile(this.abs(relativePath), 'utf8')
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await stat(this.abs(relativePath))
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
      throw error
    }
  }

  /**
   * 写入一个文件；只允许 wiki 投影区与提案区。
   * 人层笔记（vault 其它目录）与 raw/（人工策展的来源）都在拒绝名单里。
   */
  async write(relativePath: string, text: string): Promise<void> {
    this.assertWritable(relativePath)
    const absolute = this.abs(relativePath)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, text, 'utf8')
    this.invalidate()
  }

  /** raw/ 只读、人层只读：把它们从可写集合里显式排除，而不是依赖调用方自律。 */
  assertWritable(relativePath: string): void {
    const prefix = `${this.root}/`
    const normalized = relativePath.replace(/^\.?\//, '')
    if (!normalized.startsWith(prefix)) throw new Error(`拒绝写入 ${relativePath}：不在 wiki 根目录内`)
    const withinRoot = normalized.slice(prefix.length)
    if (withinRoot.startsWith(`${WIKI_LAYOUT.rawDir}/`)) throw new Error(`拒绝写入 ${relativePath}：raw/ 是人工策展的只读来源`)
    if (withinRoot.startsWith(`${WIKI_LAYOUT.proposalDir}/`)) return
    if (!withinRoot.startsWith(`${WIKI_LAYOUT.wikiDir}/`)) throw new Error(`拒绝写入 ${relativePath}：只允许 wiki/ 与 50_review/`)
  }

  /**
   * 建立空库骨架（幂等）：目录 + index.md + log.md + WIKI.md 草案。
   * 已存在的文件不覆盖——初始化不是"重置"。
   * @param now - ISO 时间戳，用于 index/log 的时间字段。
   */
  async bootstrap(now: string): Promise<{ created: string[], skipped: string[] }> {
    for (const directory of WIKI_DIRECTORIES) await mkdir(join(this.absRoot, directory), { recursive: true })

    const created: string[] = []
    const skipped: string[] = []
    for (const file of bootstrapFiles(now)) {
      const relativePath = `${this.root}/${file.path}`
      if (await this.exists(relativePath)) {
        skipped.push(relativePath)
        continue
      }
      const absolute = this.abs(relativePath)
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, file.text, 'utf8')
      created.push(relativePath)
    }
    this.invalidate()
    return { created, skipped }
  }
}

async function listMarkdown(directory: string): Promise<string[]> {
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
      result.push(...await listMarkdown(full))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) result.push(full)
  }
  return result
}
