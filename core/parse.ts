/**
 * 页面解析与图构建：把一批 Markdown 文件变成可检索、可 lint 的 `Snapshot`。
 *
 * 设计约束（与 llm-wiki 模式一致）：
 * - 页面身份来自路径，不来自标题，所以重命名标题不会打断链接；
 * - 出链在代码块/行内代码里不算链接，避免示例代码污染图；
 * - `index.md` 的目录链接不计入入链，否则每页都"有人引用"，孤儿页永远消失。
 */

import { parseDocument } from './frontmatter.ts'
import {
  CONTENT_TYPES,
  LIMITS,
  SEGMENT_TYPE,
  STATUSES,
  WIKI_LAYOUT,
  type Finding,
  type Link,
  type PageStatus,
  type PageType,
  type Snapshot,
  type WikiPage,
} from './model.ts'

/** 去掉围栏代码块、行内代码、HTML 注释与 Obsidian 注释，只留下可能含链接的正文。 */
export function stripCode(text: string): string {
  return text
    .replace(/^```[\s\S]*?^```/gm, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/%%[\s\S]*?%%/g, '')
}

interface Section {
  headingLine: number
  startLine: number
  endLine: number
}

/** 找到某个二级标题（如 `## 关联`）的段落范围；`endLine` 不含。 */
export function findSection(text: string, heading: string): Section | undefined {
  const lines = text.split('\n')
  const normalizedHeading = heading.replace(/^#+\s*/, '').trim()
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim()
    if (!line.startsWith('## ')) continue
    if (line.slice(3).trim() !== normalizedHeading) continue
    // endLine 用"1-based 且不含"的行号：无下一个二级标题时等于行数 + 1，
    // 否则等于下一个二级标题的 1-based 行号（cursor 是 0-based）。
    let endLine = lines.length + 1
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^##\s/.test(lines[cursor]!)) {
        endLine = cursor + 1
        break
      }
    }
    return { headingLine: index + 1, startLine: index + 2, endLine }
  }
  return undefined
}

/** 提取正文里的 [[wikilink]]；返回原始目标（未解析）与所在行号。 */
export function extractLinks(text: string): Link[] {
  const clean = stripCode(text)
  const lines = clean.split('\n')
  const related = findSection(clean, LIMITS.relatedSection)
  const links: Link[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const pattern = /(!?)\[\[([^\]]+)\]\]/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(line)) !== null) {
      if (match[1] === '!') continue
      const raw = match[2]!.split('|')[0]!.split('#')[0]!.trim().replace(/\.md$/, '')
      if (raw === '') continue
      const lineNumber = index + 1
      links.push({
        raw,
        inRelated: related !== undefined && lineNumber >= related.startLine && lineNumber < related.endLine,
        line: lineNumber,
      })
    }
  }
  return links
}

/**
 * 由 vault 相对路径推导页面 id。
 * `mybrain/wiki/concepts/x.md` → `concepts/x`；`wiki/index.md` → `index`。
 * @param root - wiki 根目录（vault 相对，如 `mybrain`）。
 * @param path - vault 相对路径。
 */
export function pageIdFromPath(root: string, path: string): string {
  const prefix = `${root}/`
  const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path
  // raw 层有自己的一级命名空间：`1-raw/x.md` → `raw/x`，与 2-wiki 的类型目录永不相撞。
  if (relative.startsWith(`${WIKI_LAYOUT.rawDir}/`)) {
    return `raw/${relative.slice(WIKI_LAYOUT.rawDir.length + 1).replace(/\.md$/, '')}`
  }
  const withinWiki = relative.startsWith(`${WIKI_LAYOUT.wikiDir}/`)
    ? relative.slice(WIKI_LAYOUT.wikiDir.length + 1)
    : relative
  const withoutExtension = withinWiki.replace(/\.md$/, '')
  if (withoutExtension === 'index' || withoutExtension === 'log') return withoutExtension
  return withoutExtension
}

export function typeOfId(id: string): PageType | null {
  if (id === 'index') return 'index'
  if (id === 'log') return 'log'
  const segment = id.split('/')[0] ?? ''
  return SEGMENT_TYPE[segment] ?? null
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => asString(item)).filter(item => item !== '')
  if (typeof value === 'string' && value.trim() !== '') return [value.trim()]
  return []
}

/**
 * 解析单个页面，并把 schema 问题记在 `schemaIssues` 上（由 lint 统一汇总）。
 * @param path - vault 相对路径。
 * @param text - 文件内容。
 * @param root - wiki 根目录，用于推导 id。
 */
export function parsePage(path: string, text: string, root: string): WikiPage {
  const parsed = parseDocument(text)
  const fm = parsed.data
  const derivedId = pageIdFromPath(root, path)
  const layer: 'raw' | 'wiki' = derivedId.startsWith('raw/') ? 'raw' : 'wiki'
  const issues: string[] = []

  if (!parsed.hasFrontmatter) issues.push('缺少 frontmatter')
  for (const unknown of parsed.unknownLines) {
    issues.push(`无法解析的 frontmatter 行 ${unknown.line}：${unknown.text.slice(0, 40)}`)
  }

  const declaredId = asString(fm.id)
  const id = declaredId || derivedId
  if (declaredId && declaredId !== derivedId) issues.push(`id 与路径不一致：声明 ${declaredId}，路径 ${derivedId}`)
  if (!declaredId && fmtRequiresId(derivedId)) issues.push('frontmatter 缺少 id')

  const declaredType = asString(fm.type)
  const type = layer === 'raw'
    // raw 素材不做类型分目录，据此从 frontmatter 读；缺省当来源。
    ? ((CONTENT_TYPES as string[]).includes(declaredType) ? declaredType as PageType : 'source')
    : typeOfId(derivedId)
  if (layer === 'wiki') {
    if (!declaredType) issues.push('frontmatter 缺少 type')
    else if (!(CONTENT_TYPES as string[]).includes(declaredType) && !['index', 'log'].includes(declaredType)) {
      issues.push(`未知 type：${declaredType}`)
    } else if (type && declaredType !== type) {
      issues.push(`type 与目录不一致：声明 ${declaredType}，目录 ${type}`)
    }
  }

  const title = asString(fm.title)
  if (title === '') issues.push('缺少 title')

  const rawStatus = asString(fm.status, 'stub')
  const status = (STATUSES as string[]).includes(rawStatus) ? rawStatus as PageStatus : 'stub'
  if (rawStatus !== status) issues.push(`非法 status：${rawStatus}`)

  const summary = asString(fm.summary)
  if (type !== 'index' && type !== 'log' && summary === '') issues.push('缺少 summary')

  const confidenceRaw = fm.confidence
  const confidence = typeof confidenceRaw === 'number' ? confidenceRaw : undefined
  if (confidenceRaw !== undefined && (confidence === undefined || confidence < 0 || confidence > 1)) {
    issues.push('confidence 必须在 0..1')
  }

  return {
    path,
    id,
    type: type ?? 'concept',
    title: title || id,
    summary,
    status,
    aliases: asStringArray(fm.aliases),
    tags: asStringArray(fm.tags),
    sources: asStringArray(fm.sources),
    domain: asString(fm.domain) || undefined,
    created: asString(fm.created),
    updated: asString(fm.updated) || asString(fm.created),
    confidence,
    layer,
    body: parsed.body,
    frontmatter: fm,
    schemaIssues: issues,
  }
}

function fmtRequiresId(id: string): boolean {
  return id !== WIKI_LAYOUT.indexPath && id !== 'index' && id !== 'log'
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * 构建整库快照：解析、建图、算入链、建名字索引、收集结构性硬错误。
 * @param pages - 2-wiki 下的已解析页面（顺序无关）。
 * @param rawPages - 1-raw 下的素材页；不进入链接图，只供引用与页面生成使用。
 */
export function buildSnapshot(pages: WikiPage[], rawPages: WikiPage[] = []): Snapshot {
  const byId = new Map<string, WikiPage>()
  const raw = new Map<string, WikiPage>()
  const problems: Finding[] = []
  const nameIndex = new Map<string, string>()

  for (const page of rawPages) raw.set(page.id, page)

  for (const page of pages) {
    if (byId.has(page.id)) {
      problems.push({
        code: 'L009-duplicate-id',
        severity: 'warn',
        page: page.id,
        message: `id 重复：${byId.get(page.id)!.path} 与 ${page.path}`,
      })
      continue
    }
    byId.set(page.id, page)
  }

  const register = (name: string, id: string) => {
    const key = normalizeName(name)
    if (key === '') return
    const existing = nameIndex.get(key)
    if (existing && existing !== id) {
      problems.push({
        code: 'L007-alias-collision',
        severity: 'error',
        page: existing,
        target: id,
        message: `名称「${name}」同时指向 ${existing} 与 ${id}`,
      })
      return
    }
    nameIndex.set(key, id)
  }

  for (const page of byId.values()) {
    if (page.type === 'index' || page.type === 'log') continue
    register(page.id, page.id)
    register(page.id.split('/').slice(1).join('/'), page.id)
    register(page.title, page.id)
    for (const alias of page.aliases) register(alias, page.id)
  }

  const linksById = new Map<string, Link[]>()
  const inbound = new Map<string, number>()

  const resolve = (raw: string): string | undefined => {
    const direct = byId.has(raw) ? raw : undefined
    if (direct) return direct
    const normalized = normalizeName(raw.replace(/^\/+/, ''))
    const viaName = nameIndex.get(normalized)
    if (viaName) return viaName
    // `[[concepts/x|...]]` 已由 extractLinks 去掉别名；这里再兜一层大小写差异。
    const lower = raw.toLowerCase()
    for (const id of byId.keys()) {
      if (id.toLowerCase() === lower) return id
    }
    return undefined
  }

  for (const page of byId.values()) {
    const links = extractLinks(page.body)
    for (const link of links) link.resolved = resolve(link.raw)
    linksById.set(page.id, links)
    if (page.type === 'index' || page.type === 'log') continue
    for (const link of links) {
      if (!link.resolved || link.resolved === page.id) continue
      inbound.set(link.resolved, (inbound.get(link.resolved) ?? 0) + 1)
    }
  }

  return { pages: [...byId.values()], byId, raw, linksById, inbound, nameIndex, problems }
}

/** 供 lint 使用：只保留内容页。 */
export function contentPages(snapshot: Snapshot): WikiPage[] {
  return snapshot.pages.filter(page => CONTENT_TYPES.includes(page.type))
}

/** 页面指向的相关页（`## 关联` 内的出链），用于 wiki_read 的 traversal affordance。 */
export function relatedOf(snapshot: Snapshot, id: string): string[] {
  const links = snapshot.linksById.get(id) ?? []
  return links.filter(link => link.inRelated && link.resolved && link.resolved !== id)
    .map(link => link.resolved!)
}

/** 反向链接（谁引用了我），排除 index。 */
export function backlinksOf(snapshot: Snapshot, id: string): string[] {
  const result: string[] = []
  for (const [sourceId, links] of snapshot.linksById) {
    if (sourceId === 'index') continue
    if (links.some(link => link.resolved === id && link.inRelated)) result.push(sourceId)
  }
  return result
}
