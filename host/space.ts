/**
 * 知识空间：Obsidian 的一个工作目录（唯一），里面可以有多个知识库（各自一个文件夹）。
 *
 * 三条约定写死在代码里：
 * 1. **空间唯一**：`spacePath` 就是 Obsidian 打开的那个目录；不提供第二个空间。
 * 2. **库是子文件夹**：一个文件夹里有 `WIKI.md` 或 `0-inbox/`，就当它已经是一个库。
 * 3. **当前库记在空间里**：`.llm-wiki-space.json`（点文件，不进 Obsidian 搜索、不进库的索引）。
 *    配置里只写空间路径；换库不该改 profile，改了还得重载插件。
 *
 * 为什么每个库要各自在 Obsidian 里单独打开成 vault：Obsidian 一次只认一个 vault，
 * 若把几个库塞进同一个 vault，全局搜索与反链会跨库串起来，隔离就是假的。
 */

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { WIKI_DIRECTORIES, bootstrapFiles } from '../core/bootstrap.ts'
import { WIKI_LAYOUT } from '../core/model.ts'

/** 空间里的点文件：只记"当前用哪个库"。 */
export const SPACE_STATE_FILE = '.llm-wiki-space.json'

export interface LibraryInfo {
  /** 文件夹名，也是 Obsidian 里的 vault 名。 */
  name: string
  path: string
  /** 有 WIKI.md 或 0-inbox 即视为已初始化。 */
  initialized: boolean
  pages?: number
}

interface SpaceState {
  version: 1
  active: string
}

function stateFileOf(spacePath: string): string {
  return join(spacePath, SPACE_STATE_FILE)
}

/** 同步读：apply 是同步函数，开机时就要知道当前是哪个库。 */
export function readActive(spacePath: string): string | undefined {
  try {
    const raw = readFileSync(stateFileOf(spacePath), 'utf8')
    const parsed = JSON.parse(raw) as SpaceState
    if (typeof parsed.active !== 'string' || parsed.active.trim() === '') return undefined
    return parsed.active.trim()
  } catch {
    return undefined
  }
}

export async function writeActive(spacePath: string, name: string): Promise<void> {
  await mkdir(spacePath, { recursive: true })
  const state: SpaceState = { version: 1, active: name }
  await writeFile(stateFileOf(spacePath), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function looksLikeLibrary(path: string): boolean {
  return existsSync(join(path, WIKI_LAYOUT.schemaFile)) || existsSync(join(path, WIKI_LAYOUT.inboxDir))
}

/**
 * 列出空间下的所有库。
 * 只认直接子目录，且跳过点目录（`.obsidian`、`.trash` 这些不是库）。
 */
export async function listLibraries(spacePath: string): Promise<LibraryInfo[]> {
  let names: string[] = []
  try {
    const entries = await readdir(spacePath, { withFileTypes: true })
    names = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right))
  } catch {
    return []
  }

  const libraries: LibraryInfo[] = []
  for (const name of names) {
    const path = join(spacePath, name)
    libraries.push({ name, path, initialized: looksLikeLibrary(path) })
  }
  return libraries
}

export interface InitResult {
  library: LibraryInfo
  created: string[]
  skipped: string[]
}

/**
 * 把一个（通常是空的）文件夹初始化成一个库：四个阶段目录 + WIKI.md / index / log。
 * 幂等：已存在的文件不覆盖，只补缺的。
 */
export async function initLibrary(spacePath: string, name: string, now: string): Promise<InitResult> {
  const trimmed = name.trim()
  if (trimmed === '' || trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`不是合法的库名：${name}`)
  }
  if (trimmed.startsWith('.')) throw new Error(`库名不能以点开头：${trimmed}`)

  const path = join(spacePath, trimmed)
  const info = await stat(path).catch(() => undefined)
  if (info !== undefined && !info.isDirectory()) throw new Error(`${path} 不是目录`)

  const created: string[] = []
  const skipped: string[] = []
  await mkdir(path, { recursive: true })
  for (const directory of WIKI_DIRECTORIES) {
    const absolute = join(path, directory)
    if (existsSync(absolute)) { skipped.push(directory); continue }
    await mkdir(absolute, { recursive: true })
    created.push(directory)
  }
  for (const file of bootstrapFiles(now)) {
    const absolute = join(path, file.path)
    if (existsSync(absolute)) { skipped.push(file.path); continue }
    await writeFile(absolute, file.text, 'utf8')
    created.push(file.path)
  }
  return { library: { name: trimmed, path, initialized: true }, created, skipped }
}
