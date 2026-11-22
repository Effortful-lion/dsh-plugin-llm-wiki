/**
 * 写入侧的规范：草稿校验（Compliance）、页面文本拼装、提案与日志格式。
 *
 * 这里是两个插件唯一允许"造文本"的地方，保证 DSH 写的页和 Obsidian 写的页
 * 在 frontmatter、标题层级、时间戳上完全同构——否则同一份 wiki 会因为两个入口
 * 而产生两种风格，lint 会把这种漂移报成 schema 问题。
 */

import { parseDocument, stringifyFrontmatter } from './frontmatter.ts'
import { extractLinks, findSection, pageIdFromPath } from './parse.ts'
import {
  CANONICAL_FIELDS,
  CONTENT_TYPES,
  LIMITS,
  PAGE_TYPE_SEGMENT,
  RAW_FIELDS,
  STATUSES,
  WIKI_LAYOUT,
  type Origin,
  type PageStatus,
  type PageType,
  type Proposal,
  type ProposalMeta,
  type Snapshot,
  type WikiPage,
} from './model.ts'

export interface DraftInput {
  id?: string
  type: PageType
  title: string
  summary: string
  body: string
  status?: PageStatus
  tags?: string[]
  aliases?: string[]
  sources?: string[]
  domain?: string
  confidence?: number
}

export interface ValidationResult {
  errors: string[]
  warnings: string[]
  /** 规范化后的 id 与目标路径（仅在无 error 时可信）。 */
  id: string
  path: string
}

/** 生成可用作文件名的 slug；保留中文，其余压成连字符。 */
export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug === '' ? 'untitled' : slug
}

/** 页面在 vault 中的路径。 */
export function pagePath(root: string, type: PageType, slug: string): string {
  const segment = PAGE_TYPE_SEGMENT[type]
  return `${root}/${WIKI_LAYOUT.wikiDir}/${segment}/${slug}.md`
}

/** 由草稿推导 id；显式 id 必须落在对应目录段。 */
export function draftId(draft: DraftInput): string {
  if (draft.id && draft.id.trim() !== '') {
    return draft.id.trim().replace(/\.md$/, '').replace(/^\/+/, '')
  }
  return `${PAGE_TYPE_SEGMENT[draft.type]}/${slugify(draft.title)}`
}

/**
 * 校验一份草稿是否能进入 wiki。error 必须修，warning 可带着写。
 * @param draft - 待写入内容。
 * @param snapshot - 当前整库（用于查重与断链）。
 * @param root - wiki 根目录。
 * @param options - `allowExisting` 用于 update：目标页已存在是预期状态，不算撞 id；
 *   `existing` 为原页，update 时校验要用"继承后的有效值"，否则只补一条反链也会被判缺 sources。
 */
export function validateDraft(
  draft: DraftInput,
  snapshot: Snapshot,
  root: string,
  options: { allowExisting?: boolean, existing?: Partial<WikiPage> } = {},
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const id = draftId(draft)
  const segment = PAGE_TYPE_SEGMENT[draft.type]

  if (!CONTENT_TYPES.includes(draft.type)) errors.push(`type 只能是 ${CONTENT_TYPES.join(' / ')}`)
  const idParts = id.split('/')
  if (idParts.length !== 2 || idParts[0] !== segment) {
    errors.push(`id 必须形如 ${segment}/<slug>，当前是 ${id}`)
  }
  if (!/^[a-z0-9\p{Letter}\p{Number}-]+$/u.test(idParts[1] ?? '')) {
    errors.push(`slug 只能包含字母、数字、中文与连字符：${idParts[1] ?? ''}`)
  }
  const path = pagePath(root, draft.type, idParts[1] ?? slugify(draft.title))
  if (snapshot.byId.has(id) && !options.allowExisting) {
    errors.push(`id 已存在：${id}（更新请显式传 action=update）`)
  }
  if (!snapshot.byId.has(id) && options.allowExisting) {
    errors.push(`要更新的页不存在：${id}（新建请用 action=create）`)
  }

  const title = draft.title.trim()
  if (title === '') errors.push('title 不能为空')
  if (title.length > 80) warnings.push(`title ${title.length} 字，建议 ≤80`)

  const summary = draft.summary.trim()
  if (summary === '') errors.push('summary 不能为空：它是索引与检索的唯一入口')
  if (summary.length > LIMITS.summaryChars) errors.push(`summary ${summary.length} 字，上限 ${LIMITS.summaryChars}`)

  const status: PageStatus = draft.status ?? options.existing?.status ?? 'active'
  if (!STATUSES.includes(status)) errors.push(`status 只能是 ${STATUSES.join(' / ')}`)

  const body = draft.body.trim()
  if (body === '') errors.push('body 不能为空')

  const related = body.includes(LIMITS.relatedSection)
  if (!related) errors.push(`body 必须包含 \`${LIMITS.relatedSection}\` 段并至少链接一页`)

  const links = extractLinks(body)
  const relatedLinks = links.filter(link => link.inRelated)
  if (related && relatedLinks.length === 0) errors.push(`\`${LIMITS.relatedSection}\` 里至少要有一条 [[wikilink]]`)
  for (const link of links) {
    const resolved = snapshot.byId.has(link.raw) ? link.raw : undefined
    if (!resolved && !relatedLinksToExisting(snapshot, link.raw)) {
      errors.push(`第 ${link.line} 行指向不存在的页：[[${link.raw}]]（先建页，或改成已存在的 id）`)
    }
  }

  // update 时草稿未必重复声明 sources；有效值 = 草稿给的 ?? 原页已有的。
  const effectiveSources = (draft.sources ?? options.existing?.sources ?? [])
    .map(source => source.trim()).filter(source => source !== '')
  if (effectiveSources.length === 0 && (status === 'active' || status === 'contested') && draft.type !== 'answer') {
    errors.push('active / contested 页必须有 sources：无出处的断言不许进库')
  }
  for (const source of effectiveSources) {
    if (!snapshot.byId.has(source)) warnings.push(`sources 里的 ${source} 还不是已建页面（建议建一张 sources 页）`)
  }

  const effectiveAliases = draft.aliases ?? options.existing?.aliases ?? []
  for (const alias of effectiveAliases) {
    if (alias.trim() === '') continue
    const collision = snapshot.nameIndex.get(alias.trim().toLowerCase())
    if (collision && collision !== id) errors.push(`别名「${alias}」已属于 ${collision}`)
  }
  if (draft.confidence !== undefined && (draft.confidence < 0 || draft.confidence > 1)) {
    errors.push('confidence 必须在 0..1')
  }

  if (draft.type === 'source' && effectiveSources.length > 0 && !effectiveSources.some(source => source === id)) {
    warnings.push('来源页通常引用自己；确认 sources 字段没有指错')
  }

  return { errors, warnings, id, path }
}

function relatedLinksToExisting(snapshot: Snapshot, raw: string): boolean {
  const normalized = raw.trim().toLowerCase()
  if (snapshot.byId.has(raw)) return true
  for (const [name, id] of snapshot.nameIndex) {
    if (name === normalized) return true
    if (id.toLowerCase() === normalized) return true
  }
  return false
}

/**
 * 拼装一个完整页面。正文按 `# 标题` + `## 定义` + `## 关联` 的顺序规整。
 *
 * `existing` 用于 update：除 `created` 外，**草稿里没显式给出的字段一律继承原页**。
 * 这是"局部更新"的语义——只想补一条反链，不应该顺手把 tags / aliases / domain 清空。
 * 想主动清空某个字段，请传空数组（`tags: []`），那是显式意图，不算遗漏。
 *
 * @param draft - 已通过校验的草稿。
 * @param options - `now` 为 ISO 时间戳；`existing` 为原页（update 时必传）。
 */
export function buildPageText(
  draft: DraftInput,
  options: { now: string, existing?: Partial<WikiPage> },
): string {
  const id = draftId(draft)
  const status: PageStatus = draft.status ?? options.existing?.status ?? 'active'
  const date = options.now.slice(0, 10)
  const before = options.existing

  /** 草稿给了就用草稿（含显式空数组），没给就继承原页，原页也没有则回落到默认值。 */
  const pickList = (fromDraft: string[] | undefined, fromExisting: string[] | undefined): string[] => {
    if (fromDraft !== undefined) return fromDraft.map(item => item.trim()).filter(item => item !== '')
    return (fromExisting ?? []).map(item => item.trim()).filter(item => item !== '')
  }

  const tags = pickList(draft.tags, before?.tags).map(tag => tag.replace(/^#/, ''))
  const aliases = pickList(draft.aliases, before?.aliases)
  const sources = pickList(draft.sources, before?.sources)
  const domain = draft.domain !== undefined && draft.domain !== ''
    ? draft.domain.trim()
    : (before?.domain ?? '')
  const confidence = draft.confidence === undefined ? before?.confidence : draft.confidence

  const frontmatter = stringifyFrontmatter({
    id,
    type: draft.type,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    status,
    aliases,
    tags,
    sources,
    ...(domain === '' ? {} : { domain }),
    created: before?.created || date,
    updated: date,
    ...(confidence === undefined ? {} : { confidence }),
  }, CANONICAL_FIELDS)

  const body = draft.body.trim()
  const withTitle = body.startsWith('# ') ? body : `# ${draft.title.trim()}\n\n${body}`
  return `${frontmatter}\n${withTitle}\n`
}

/** 提案文件名：日期 + 目标 slug（+ 可选后缀），天然按时间排序。 */
export function proposalPath(root: string, id: string, now: string, suffix?: string): string {
  const stamp = now.replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-').slice(0, 13)
  const tail = slugify(id.split('/').slice(1).join('-') || id)
  const extra = suffix === undefined || suffix === '' ? '' : `-${slugify(suffix)}`
  return `${root}/${WIKI_LAYOUT.proposalDir}/${stamp}-${tail}${extra}.md`
}

/**
 * 提案正文：完整目标页 + 一段元信息，让人可以直接 diff 后合并。
 * 提案不是 wiki 页面（不进 index，也不会被 lint 当作页面）。
 */
export function buildProposalText(input: {
  target: string
  action: ProposalMeta['action']
  pageText: string
  now: string
  rationale?: string
  baseUpdated?: string
}): string {
  const meta = stringifyFrontmatter({
    id: `proposal/${input.target}`,
    type: 'proposal',
    title: `提案：${input.target}`,
    status: 'pending',
    created: input.now.slice(0, 10),
    updated: input.now.slice(0, 10),
    // 刻意用扁平键：本库的 YAML 子集不支持嵌套映射，而提案必须能被零依赖解析。
    proposal_target: input.target,
    proposal_action: input.action,
    proposal_base: input.baseUpdated ?? 'none',
    proposal_reason: (input.rationale ?? '').trim(),
    proposal_generated_at: input.now,
  }, [...CANONICAL_FIELDS, 'proposal_target', 'proposal_action', 'proposal_base', 'proposal_reason', 'proposal_generated_at'])

  const rationale = (input.rationale ?? '').trim()
  const body = input.pageText.length > LIMITS.proposalChars
    ? `${input.pageText.slice(0, LIMITS.proposalChars)}\n\n…（提案正文超过 ${LIMITS.proposalChars} 字符被截断，请分页提交）\n`
    : input.pageText

  return [
    meta,
    `<!-- ${rationale === '' ? 'llm-wiki 提案' : `理由：${rationale}`} -->`,
    '',
    '## 拟写入内容',
    '',
    PAGE_START,
    body.trimEnd(),
    PAGE_END,
    '',
    '## 合并方式',
    '',
    `1. 审阅上面的目标页；`,
    `2. 合并到 \`${WIKI_LAYOUT.wikiDir}/${input.target}.md\`（create 时新建）；`,
    `3. 删除本提案文件，然后跑一次 lint / 重建索引。`,
    '',
  ].join('\n')
}

/** 取两个标记之间的原文（不含标记行）。 */
function extractBetween(text: string, start: string, end: string): string | undefined {
  const from = text.indexOf(start)
  if (from < 0) return undefined
  const to = text.indexOf(end, from + start.length)
  if (to < 0) return undefined
  return text.slice(from + start.length, to).replace(/^\n+/, '').replace(/\n+$/, '')
}

/** 提案里"拟写入页面"的边界标记：页面自身也有 `## 标题`，所以不能靠标题切段。 */
export const PAGE_START = '<!-- llm-wiki:page:start -->'
export const PAGE_END = '<!-- llm-wiki:page:end -->'

/** log.md 的一条记录（append-only，永不重写历史）。 */
export function logEntry(input: {
  now: string
  operation: 'ingest' | 'write' | 'lint' | 'index' | 'proposal' | 'confirm'
    | 'compile' | 'merge' | 'collect' | 'gc' | 'job' | 'rollback' | 'deprecate'
  summary: string
  details?: string[]
}): string {
  const stamp = input.now.replace(/\.\d{3}Z$/, 'Z')
  const lines = [`## ${stamp} · ${input.operation}`, `- ${input.summary}`]
  for (const detail of input.details ?? []) lines.push(`- ${detail}`)
  return `${lines.join('\n')}\n`
}

/** 把一条记录追加到 log.md 末尾，保留原内容不动。 */
export function appendLog(existingText: string, entry: string): string {
  const base = existingText.trimEnd()
  if (base === '') {
    return [
      stringifyFrontmatter({
        id: 'log',
        type: 'log',
        title: '操作日志',
        summary: 'append-only 的写入历史。',
        status: 'active',
      }, CANONICAL_FIELDS).trimEnd(),
      '',
      '# 操作日志 · Log',
      '',
      '> 只追加，不改写。每次 ingest / write / lint 都会留一条。',
      '',
      entry,
    ].join('\n')
  }
  return `${base}\n\n${entry}`
}

/** 从 vault 路径反推 id（供 Obsidian 插件与工具共用）。 */
export function idOfPath(root: string, path: string): string {
  return pageIdFromPath(root, path)
}

/** 1-raw 素材页的路径：`1-raw/<slug>.md`。素材不做类型分目录。 */
export function rawPath(root: string, slug: string): string {
  return `${root}/${WIKI_LAYOUT.rawDir}/${slug}.md`
}

/**
 * 拼装一张素材页（1-raw）。素材不是断言，因此不带 `## 关联` 要求，
 * 只保证"从哪来、什么时候确认、原始文件在哪"三件事可追溯。
 */
export function buildRawText(input: {
  slug: string
  title: string
  summary: string
  body: string
  now: string
  origin: Origin
  confirmed: 'auto' | 'human'
  domain?: string
  sources?: string[]
  derivedFrom?: string
  type?: PageType
}): string {
  const date = input.now.slice(0, 10)
  const frontmatter = stringifyFrontmatter({
    id: `raw/${input.slug}`,
    type: input.type ?? 'source',
    title: input.title.trim(),
    summary: input.summary.trim().slice(0, LIMITS.summaryChars),
    status: 'stub',
    domain: input.domain ?? '',
    origin: input.origin,
    confirmed: input.confirmed,
    sources: input.sources ?? [],
    created: date,
    updated: date,
    ...(input.derivedFrom === undefined ? {} : { derivedFrom: input.derivedFrom }),
  }, RAW_FIELDS)

  return [
    frontmatter,
    `# ${input.title.trim()}`,
    '',
    '## 素材原文',
    '',
    input.body.trim(),
    '',
  ].join('\n')
}

/**
 * 解析一份提案文件。提案不是页面：它不进索引、不进链接图，只描述"要把目标页改成什么"。
 * @param path - 库内相对路径。
 * @param text - 文件原文。
 */
export function parseProposal(path: string, text: string): Proposal | null {
  const parsed = parseDocument(text)
  const target = typeof parsed.data.proposal_target === 'string' ? parsed.data.proposal_target : ''
  const action = typeof parsed.data.proposal_action === 'string' ? parsed.data.proposal_action : ''
  if (target === '' || action === '') return null
  const section = findSection(parsed.body, '拟写入内容')
  const body = extractBetween(parsed.body, PAGE_START, PAGE_END)
    ?? (section === undefined
      ? parsed.body
      : parsed.body.split('\n').slice(section.startLine - 1, section.endLine - 1).join('\n'))
  return {
    path,
    meta: {
      target,
      action: action as ProposalMeta['action'],
      base: typeof parsed.data.proposal_base === 'string' && parsed.data.proposal_base !== 'none'
        ? parsed.data.proposal_base
        : undefined,
      reason: typeof parsed.data.proposal_reason === 'string' ? parsed.data.proposal_reason : undefined,
      generatedAt: typeof parsed.data.proposal_generated_at === 'string' ? parsed.data.proposal_generated_at : undefined,
    },
    body: body.trim(),
    text,
  }
}
