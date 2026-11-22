/**
 * LLM Wiki 的共享模型：页面类型、目录布局、frontmatter 字段、lint 规则目录。
 *
 * 这是宿主半与前端半的唯一契约来源，不依赖任何运行时，因此可以被任意构建工具打包。
 * v0.4：目录改为"四个数字阶段目录 + 一份说明"，类型交给子目录，领域交给 frontmatter。
 */

export type PageType = 'entity' | 'concept' | 'source' | 'answer' | 'project' | 'index' | 'log'

export type PageStatus = 'stub' | 'active' | 'contested' | 'deprecated'

/** 素材从哪来。只出现在 0-inbox 与 1-raw，不参与 2-wiki 的 diff。 */
export type Origin = 'note' | 'upload' | 'collect' | 'manual'

/** 素材是否经过人确认。`auto` 表示配置允许直接放行。 */
export type Confirmation = 'auto' | 'human'

export type LintCode =
  | 'L001-orphan'
  | 'L002-broken-link'
  | 'L003-schema'
  | 'L004-unindexed'
  | 'L005-dangling-index'
  | 'L006-summary-long'
  | 'L007-alias-collision'
  | 'L008-uncited'
  | 'L009-duplicate-id'
  | 'L010-no-links'
  | 'L011-stale'
  | 'L012-proposal-pending'

export type Severity = 'error' | 'warn' | 'info'

export interface Finding {
  code: LintCode
  severity: Severity
  /** 页面 id；索引级问题（如 L005）指向 index。 */
  page: string
  message: string
  /** 相关目标（断链目标、冲突页 id），便于 UI 跳转。 */
  target?: string
}

export interface Frontmatter {
  id?: string
  type?: string
  title?: string
  summary?: string
  status?: string
  aliases?: string[]
  tags?: string[]
  sources?: string[]
  domain?: string
  created?: string
  updated?: string
  confidence?: number
  origin?: string
  confirmed?: string
  derivedFrom?: string
  [key: string]: unknown
}

export interface WikiPage {
  /** 库内相对路径，例如 `2-wiki/concepts/retrieval-as-reasoning.md`。 */
  path: string
  /** 稳定 id，例如 `concepts/retrieval-as-reasoning`；索引页为 `index`，日志为 `log`。 */
  id: string
  type: PageType
  title: string
  summary: string
  status: PageStatus
  aliases: string[]
  tags: string[]
  sources: string[]
  domain?: string
  created: string
  updated: string
  confidence?: number
  /** 阶段层：raw 素材页为 'raw'，wiki 页为 'wiki'。 */
  layer: 'raw' | 'wiki'
  body: string
  frontmatter: Frontmatter
  /** frontmatter 之外的 schema 问题，由 lint 汇总。 */
  schemaIssues: string[]
}

export interface Link {
  /** 规范化后的目标文本（去掉别名与锚点）。 */
  raw: string
  /** 解析到的页面 id；未解析为 undefined。 */
  resolved?: string
  /** 链接是否出现在 `## 关联` 段落。 */
  inRelated: boolean
  line: number
}

export interface Snapshot {
  /** 2-wiki 下的内容页（不含 index / log）。 */
  pages: WikiPage[]
  byId: Map<string, WikiPage>
  /** 1-raw 下的素材页，按 id 索引。 */
  raw: Map<string, WikiPage>
  /** 所有出链，按源页面 id 分组。 */
  linksById: Map<string, Link[]>
  /** 入链计数（不计 index 目录链接）。 */
  inbound: Map<string, number>
  /** 别名与小写标题索引，用于短链解析。 */
  nameIndex: Map<string, string>
  problems: Finding[]
}

/**
 * 库根目录下固定的布局。所有路径都相对库根。
 *
 * 四个数字目录 = 四个处理阶段，一律带词：`0-inbox` 待确认、`1-raw` 已确认素材、
 * `2-wiki` 已编译知识、`3-review` 待裁决提案。分类交给 `2-wiki/<类型>/`，领域交给 frontmatter.`domain`。
 */
export const WIKI_LAYOUT = {
  schemaFile: 'WIKI.md',
  inboxDir: '0-inbox',
  inboxNotes: '0-inbox/notes',
  inboxFiles: '0-inbox/files',
  inboxParts: '0-inbox/files/.parts',
  inboxCollect: '0-inbox/collect',
  rawDir: '1-raw',
  attachments: '1-raw/attachments',
  wikiDir: '2-wiki',
  indexPath: '2-wiki/index.md',
  logPath: '2-wiki/log.md',
  proposalDir: '3-review',
  backupDir: '3-review/.backup',
  trashDir: '3-review/.trash',
  jobsFile: '2-wiki/jobs.json',
} as const

/** 可写目录白名单（相对库根的前缀）。其余路径一律拒绝写入。 */
export const WRITABLE_PREFIXES = [
  '0-inbox/',
  '1-raw/',
  '2-wiki/',
  '3-review/',
] as const

/** 点开头目录：承载中间物，不进索引、不进链接图。 */
export const DOT_DIRECTORIES = ['3-review/.backup', '3-review/.trash', '0-inbox/files/.parts'] as const

/** 页面类型 → 目录段（id 的第一段）。index / log 不是普通页面。 */
export const PAGE_TYPE_SEGMENT: Record<PageType, string> = {
  entity: 'entities',
  concept: 'concepts',
  source: 'sources',
  answer: 'answers',
  project: 'projects',
  index: '',
  log: '',
}

export const SEGMENT_TYPE: Record<string, PageType> = {
  entities: 'entity',
  concepts: 'concept',
  sources: 'source',
  answers: 'answer',
  projects: 'project',
}

export const CONTENT_TYPES: PageType[] = ['entity', 'concept', 'source', 'answer', 'project']

export const STATUSES: PageStatus[] = ['stub', 'active', 'contested', 'deprecated']

export const ORIGINS: Origin[] = ['note', 'upload', 'collect', 'manual']

/** frontmatter 的规范字段与序列化顺序；写死的目的是让 diff 稳定。 */
export const CANONICAL_FIELDS = [
  'id',
  'type',
  'title',
  'summary',
  'status',
  'aliases',
  'tags',
  'sources',
  'domain',
  'created',
  'updated',
  'confidence',
] as const

/** raw 层 frontmatter 的顺序；与 wiki 页刻意分开，避免两套内容混在一个 diff 里。 */
export const RAW_FIELDS = [
  'id',
  'type',
  'title',
  'summary',
  'status',
  'domain',
  'origin',
  'confirmed',
  'sources',
  'created',
  'updated',
  'derivedFrom',
] as const

export interface RuleSpec {
  severity: Severity
  title: string
  /** 是否可由 `wiki_lint --fix` 自动修复。 */
  fixable: boolean
}

export const RULES: Record<LintCode, RuleSpec> = {
  'L001-orphan': { severity: 'warn', title: '孤儿页：没有任何入链', fixable: false },
  'L002-broken-link': { severity: 'error', title: '断链：wikilink 指向不存在的页', fixable: false },
  'L003-schema': { severity: 'error', title: 'frontmatter 不符合 schema', fixable: false },
  'L004-unindexed': { severity: 'warn', title: '页面未登记在 index.md', fixable: true },
  'L005-dangling-index': { severity: 'error', title: 'index.md 条目指向不存在的页', fixable: true },
  'L006-summary-long': { severity: 'warn', title: 'summary 超过 120 字', fixable: false },
  'L007-alias-collision': { severity: 'error', title: '别名或标题在多个页面重复', fixable: false },
  'L008-uncited': { severity: 'warn', title: '非 stub 页没有 sources 出处', fixable: false },
  'L009-duplicate-id': { severity: 'error', title: '页面 id 重复', fixable: false },
  'L010-no-links': { severity: 'warn', title: '页面没有 `## 关联` 出链', fixable: false },
  'L011-stale': { severity: 'info', title: '长期未更新的活跃页', fixable: false },
  'L012-proposal-pending': { severity: 'info', title: '存在未处理的写入提案', fixable: false },
}

export const LIMITS = {
  summaryChars: 120,
  relatedSection: '## 关联',
  staleDays: 180,
  /** 单次 wiki_read 最多返回的页面数。 */
  readBatch: 6,
  /** 单页全文读取的字符预算。 */
  fullPageChars: 12000,
  /** head 模式返回的正文预览长度。 */
  headChars: 1200,
  /** 检索结果每条的摘要长度。 */
  snippetChars: 110,
  /** 提案（proposal）保留的正文上限。 */
  proposalChars: 20000,
  /** 单个上传文件的上限（字节）。 */
  uploadBytes: 64 * 1024 * 1024,
  /** 提案保留天数，超过由 J04 清掉。 */
  proposalKeepDays: 7,
  /** 回收站保留天数，超过后真删。 */
  trashKeepDays: 7,
  /** 去重候选的默认相似度阈值。 */
  dupThreshold: 0.75,
  /** 一次去重扫描最多产生的候选对。 */
  dupMaxPairs: 20,
  /** 音视频切片阈值（分钟）与单片长度（分钟）。 */
  audioMaxMinutes: 30,
  audioChunkMinutes: 10,
} as const

/** 提案的语义：等价于一次待裁决的 PR。 */
export interface ProposalMeta {
  target: string
  action: 'create' | 'update' | 'deprecate' | 'merge' | 'conflict-resolve'
  /** 提案生成时目标页的 updated；合并时对不上就是冲突。 */
  base?: string
  reason?: string
  generatedAt?: string
}

export interface Proposal {
  path: string
  meta: ProposalMeta
  /** 拟写入的完整页面正文（含 frontmatter）。 */
  body: string
  /** 提案文件原文。 */
  text: string
}

/** 一次动作执行的回执；每条都会进 log.md。 */
export interface Receipt {
  action: string
  changed: number
  created: number
  removed: number
  ms: number
  notes: string[]
}
