/**
 * 自动化任务层：插件内置的 J01–J10 就是一组"有自选项的 DSH 定时任务"。
 *
 * 契约（与 DSH Automation 页的关系）：
 * - 开 = 在 DSH 里真建一条任务；关 = 真删掉一条。插件不维护第二套调度器。
 * - 归属靠两个标记认：标题前缀 `[wiki] ` 与 prompt 首行 `owner: llm-wiki; library: <path>`。
 *   DSH 的任务记录没有 metadata 字段，所以只能靠约定，不能靠字段。
 * - 对账双条件：本地 enabled 且 taskId 在"本库拥有的集合"里。名单外的任务永不删除。
 */

import { WIKI_LAYOUT, type Snapshot } from '../core/model.ts'
import type { WikiStore } from './store.ts'

const OWNER = 'llm-wiki'

/** DSH Schedule 服务的最小结构面（避免把宿主类型硬编码进插件）。 */
export interface ScheduleTiming {
  /** `at` / `after` 是一次性；其余是重复任务。 */
  kind: 'daily' | 'weekly' | 'cron' | 'every' | 'after' | 'at' | 'rrule'
  [key: string]: unknown
}

export interface ScheduleEntryLike {
  id: string
  title: string
  prompt: string
  status: 'active' | 'paused' | 'ended'
  updatedAt?: string
}

export interface ScheduleLike {
  create(request: {
    title: string
    prompt: string
    timing: ScheduleTiming
    target?: { kind: 'new_once' | 'new' | 'session', sessionId?: string }
  }): Promise<{ id: string }>
  catalog(): Promise<ScheduleEntryLike[]>
  edit(request: { id: string, action: 'delete' | 'update', patch?: Record<string, unknown>, expectedUpdatedAt?: string | null }): Promise<unknown>
  run?(request: { id: string }): Promise<unknown>
}

export interface JobState {
  enabled: boolean
  taskId: string | null
  options: Record<string, unknown>
}

export interface JobsFile {
  version: 1
  library: string
  jobs: Record<string, JobState>
}

export interface JobDefinition {
  id: string
  name: string
  /** 一句话说清"为什么存在"；面板直接显示。 */
  why: string
  kind: 'event' | 'clock'
  /** 自选项默认值；面板据此渲染表单。 */
  defaults: Record<string, unknown>
  /** 自选项说明，面板用来生成 label 与范围。 */
  optionSpec: { key: string, label: string, type: 'number' | 'string' | 'boolean', min?: number, max?: number, hint?: string }[]
  /** 触发的动作编号（A##）。 */
  action: string
  cost: '0' | 'llm'
  /** clock 类必须给出调度；返回 null 表示缺少必要自选项。 */
  cronOf?(options: Record<string, unknown>, timeZone: string): ScheduleTiming | null
  /** 生成投给 agent 的指令正文。 */
  promptOf(options: Record<string, unknown>, library: string): string
}

const TZ = 'Asia/Shanghai'

function dailyAt(time: string): ScheduleTiming {
  return { kind: 'daily', daily: { time, time_zone: TZ } }
}

function weeklyAt(time: string, weekdays: number[]): ScheduleTiming {
  return { kind: 'weekly', weekly: { time, time_zone: TZ, weekdays } }
}

function escape(text: unknown): string {
  return typeof text === 'string' ? text : JSON.stringify(text)
}

/** 内置任务清单。新增一条就在这里加，面板与对账都会自动跟上。 */
export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    id: 'J01',
    name: '索引重建',
    why: '页面变了索引没变，检索就会指向旧摘要。',
    kind: 'event',
    action: 'A15',
    cost: '0',
    defaults: { debounceMs: 1500 },
    optionSpec: [{ key: 'debounceMs', label: '防抖（毫秒）', type: 'number', min: 500, max: 5000 }],
    promptOf: options => `用 wiki_action 执行 A15（重建索引）。防抖 ${escape(options.debounceMs)} 毫秒内的多次写入合并为一次。`,
  },
  {
    id: 'J02',
    name: '单页体检',
    why: '新页写坏 schema 时，就地报错比周报更早。',
    kind: 'event',
    action: 'A11',
    cost: '0',
    defaults: { blockOnError: true },
    optionSpec: [{ key: 'blockOnError', label: '有 error 时阻止合并', type: 'boolean' }],
    promptOf: () => '用 wiki_action 执行 A11（scope=page，fix=false），只检查刚写入的那一页。',
  },
  {
    id: 'J03',
    name: '全量体检',
    why: '断链、孤儿、缺出处会慢慢堆积，每周清一次。',
    kind: 'clock',
    action: 'A11',
    cost: '0',
    defaults: { time: '09:00', notify: true },
    optionSpec: [
      { key: 'time', label: '每天几点', type: 'string', hint: 'HH:mm' },
      { key: 'notify', label: '有问题时通知', type: 'boolean' },
    ],
    cronOf: options => dailyAt(`${escape(options.time)}:00`.replace('::', ':')),
    promptOf: () => '用 wiki_action 执行 A11（scope=full，fix=true），把可修的问题修掉，其余按严重度列出。',
  },
  {
    id: 'J04',
    name: '提案过期',
    why: '没人裁决的提案会一直挂在面板上，掩盖新提案。',
    kind: 'clock',
    action: 'A10',
    cost: '0',
    defaults: { keepDays: 7, time: '09:10' },
    optionSpec: [
      { key: 'keepDays', label: '保留天数', type: 'number', min: 3, max: 60 },
      { key: 'time', label: '每天几点', type: 'string', hint: 'HH:mm' },
    ],
    cronOf: options => dailyAt(`${escape(options.time)}:00`),
    promptOf: options => `用 wiki_action 执行 A10，清理超过 ${escape(options.keepDays)} 天的提案。`,
  },
  {
    id: 'J05',
    name: '重复扫描',
    why: '同一个概念写两页，检索会各给一半答案。',
    kind: 'clock',
    action: 'A12',
    cost: 'llm',
    defaults: { threshold: 0.75, maxPairs: 20, time: '09:20', weekdays: [1] },
    optionSpec: [
      { key: 'threshold', label: '相似度阈值', type: 'number', min: 0.5, max: 0.95 },
      { key: 'maxPairs', label: '最多候选对', type: 'number', min: 5, max: 50 },
      { key: 'time', label: '几点', type: 'string', hint: 'HH:mm' },
    ],
    cronOf: options => weeklyAt(`${escape(options.time)}:00`, [1]),
    promptOf: options => `用 wiki_action 执行 A12（threshold=${escape(options.threshold)}，limit=${escape(options.maxPairs)}），对产出的合并提案逐条判断是否真的同一实体：是则保留提案，否则用 wiki_action 无法删除时明确说明哪条误报。`,
  },
  {
    id: 'J06',
    name: '矛盾扫描',
    why: '两页给出不同数字时，谁也不会主动发现。',
    kind: 'clock',
    action: 'A13',
    cost: 'llm',
    defaults: { maxPages: 50, time: '09:30', weekdays: [1] },
    optionSpec: [
      { key: 'maxPages', label: '每次最多检查页数', type: 'number', min: 10, max: 200 },
      { key: 'time', label: '几点', type: 'string', hint: 'HH:mm' },
    ],
    cronOf: options => weeklyAt(`${escape(options.time)}:00`, [1]),
    promptOf: options => `用 wiki_action 执行 A13（maxPages=${escape(options.maxPages)}），只报事实性冲突，不报措辞差异。`,
  },
  {
    id: 'J07',
    name: '过期页提醒',
    why: 'active 但半年没更新的页，往往已经不可信。',
    kind: 'clock',
    action: 'A14',
    cost: '0',
    defaults: { staleDays: 180, time: '09:40' },
    optionSpec: [
      { key: 'staleDays', label: '多久算过期（天）', type: 'number', min: 30, max: 730 },
      { key: 'time', label: '几点', type: 'string', hint: 'HH:mm' },
    ],
    cronOf: options => dailyAt(`${escape(options.time)}:00`),
    promptOf: options => `用 wiki_action 执行 A14（days=${escape(options.staleDays)}），把过期页列表给我，不要自动改页。`,
  },
  {
    id: 'J08',
    name: '主题采集',
    why: '知识库要长，得有人持续往里送料。',
    kind: 'clock',
    action: 'A04',
    cost: 'llm',
    defaults: { topic: '', sources: [], maxItems: 5, time: '08:30' },
    optionSpec: [
      { key: 'topic', label: '采集主题', type: 'string' },
      { key: 'maxItems', label: '每次条数', type: 'number', min: 1, max: 20 },
      { key: 'time', label: '每天几点', type: 'string', hint: 'HH:mm' },
      { key: 'sources', label: '采集源（逗号分隔 URL）', type: 'string' },
    ],
    cronOf: options => dailyAt(`${escape(options.time)}:00`),
    promptOf: options => [
      `采集主题「${escape(options.topic)}」，最多 ${escape(options.maxItems)} 条。`,
      `采集源：${escape(options.sources)}`,
      '用 wiki_action 执行 A04，把抓到的内容落进 0-inbox/collect，不要直接写 wiki。',
    ].join('\n'),
  },
  {
    id: 'J09',
    name: '缺口补页',
    why: '检索连续打空，说明库里缺这一块。',
    kind: 'event',
    action: 'A08',
    cost: 'llm',
    defaults: { missThreshold: 3 },
    optionSpec: [{ key: 'missThreshold', label: '连续打空几次触发', type: 'number', min: 2, max: 10 }],
    promptOf: () => '同一主题连续检索打空时，用 wiki_action 执行 A08 建 stub 页，写清已知/未知/需要什么来源。',
  },
  {
    id: 'J10',
    name: '垃圾清理',
    why: '临时文件、切片、过期备份会一直占地方。',
    kind: 'clock',
    action: 'A18',
    cost: '0',
    defaults: { level: 'safe', time: '09:50', weekdays: [7] },
    optionSpec: [
      { key: 'level', label: '级别（safe / safe+deep-list）', type: 'string' },
      { key: 'time', label: '几点', type: 'string', hint: 'HH:mm' },
    ],
    cronOf: options => weeklyAt(`${escape(options.time)}:00`, [7]),
    promptOf: options => `用 wiki_action 执行 A18（dryRun=false）。级别 ${escape(options.level)}：safe 直接清；需要深度清理时执行 A19 只出清单，等我勾选。`,
  },
]

export function defaultJobsFile(library: string): JobsFile {
  const jobs: Record<string, JobState> = {}
  for (const definition of JOB_DEFINITIONS) {
    jobs[definition.id] = { enabled: false, taskId: null, options: { ...definition.defaults } }
  }
  return { version: 1, library, jobs }
}

/** 任务的拥有判据：标题前缀 + prompt 首行。两个都对上才算本库的。 */
export function isOwned(entry: ScheduleEntryLike, library: string): boolean {
  return entry.title.startsWith('[wiki] ')
    && entry.prompt.split('\n')[0] === `owner: ${OWNER}; library: ${library}`
}

export function titleOf(definition: JobDefinition, libraryName: string): string {
  return `[wiki] ${libraryName} · ${definition.name}`
}

export function promptOf(definition: JobDefinition, library: string, options: Record<string, unknown>): string {
  return [`owner: ${OWNER}; library: ${library}`, definition.promptOf(options, library)].join('\n')
}

/** 任务状态的持久化：只存自选项与 taskId，调度真源永远在 DSH。 */
export class JobsStore {
  private currentName: string

  constructor(private readonly store: WikiStore, libraryName: string) {
    this.currentName = libraryName
  }

  /** 切库时同步改名：任务标题与 prompt 里的库名跟着走。 */
  rename(libraryName: string): void {
    this.currentName = libraryName
  }

  async load(): Promise<JobsFile> {
    const raw = await this.store.readOptional(WIKI_LAYOUT.jobsFile)
    if (raw === undefined || raw.trim() === '') return defaultJobsFile(this.store.libraryPath)
    try {
      const parsed = JSON.parse(raw) as JobsFile
      if (parsed.version !== 1 || typeof parsed.jobs !== 'object') return defaultJobsFile(this.store.libraryPath)
      // 补齐新增/删除过的任务定义，保证面板永远拿到完整清单。
      const merged = defaultJobsFile(this.store.libraryPath)
      for (const [id, definition] of Object.entries(merged.jobs)) {
        const stored = parsed.jobs[id]
        if (stored !== undefined) {
          definition.enabled = stored.enabled === true
          definition.taskId = typeof stored.taskId === 'string' ? stored.taskId : null
          definition.options = { ...definition.options, ...(stored.options ?? {}) }
        }
      }
      return { version: 1, library: this.store.libraryPath, jobs: merged.jobs }
    } catch {
      return defaultJobsFile(this.store.libraryPath)
    }
  }

  async save(file: JobsFile): Promise<void> {
    await this.store.write(WIKI_LAYOUT.jobsFile, `${JSON.stringify(file, null, 2)}\n`)
  }

  get name(): string { return this.currentName }
}

/**
 * 与 DSH 对账：补建缺失的、删除本地已关的、标记被外部删掉的。
 * @param schedule - DSH Schedule 服务。
 * @param file - 本地任务状态。
 * @param definitions - 任务清单（默认内置）。
 */
export async function reconcile(
  schedule: ScheduleLike,
  file: JobsFile,
  library: string,
  libraryName: string,
  definitions: JobDefinition[] = JOB_DEFINITIONS,
): Promise<{ created: string[], deleted: string[], disabled: string[], changed: boolean }> {
  const result = { created: [] as string[], deleted: [] as string[], disabled: [] as string[], changed: false }
  let entries: ScheduleEntryLike[]
  try {
    entries = await schedule.catalog()
  } catch {
    return result
  }
  const owned = new Set(Object.values(file.jobs).map(state => state.taskId).filter((id): id is string => id !== null))

  for (const definition of definitions) {
    if (definition.kind === 'event') continue
    const state = file.jobs[definition.id]
    if (state === undefined) continue
    const matched = state.taskId === null ? undefined : entries.find(entry => entry.id === state.taskId)

    if (state.enabled && matched === undefined) {
      const timing = definition.cronOf?.(state.options, TZ) ?? null
      if (timing === null) continue
      const created = await schedule.create({
        title: titleOf(definition, libraryName),
        prompt: promptOf(definition, library, state.options),
        timing,
        target: { kind: 'new_once' },
      })
      state.taskId = created.id
      result.created.push(definition.id)
      result.changed = true
      continue
    }

    if (!state.enabled && matched !== undefined && owned.has(matched.id)) {
      await schedule.edit({ id: matched.id, action: 'delete' })
      state.taskId = null
      result.deleted.push(definition.id)
      result.changed = true
      continue
    }

    if (state.enabled && state.taskId !== null && matched === undefined) {
      // 用户在 DSH 里手动删了任务：跟随为关闭，不悄悄重建。
      state.enabled = false
      state.taskId = null
      result.disabled.push(definition.id)
      result.changed = true
    }
  }
  return result
}

/** 面板任务区要展示的三档。 */
export async function taskBoard(
  schedule: ScheduleLike,
  file: JobsFile,
  library: string,
): Promise<{ builtin: unknown[], custom: unknown[], suspects: unknown[] }> {
  let entries: ScheduleEntryLike[] = []
  try {
    entries = await schedule.catalog()
  } catch {
    entries = []
  }
  const builtin = JOB_DEFINITIONS.map(definition => {
    const state = file.jobs[definition.id]
    const entry = state?.taskId === null || state?.taskId === undefined
      ? undefined
      : entries.find(candidate => candidate.id === state.taskId)
    return {
      id: definition.id,
      name: definition.name,
      why: definition.why,
      kind: definition.kind,
      action: definition.action,
      cost: definition.cost,
      options: state?.options ?? definition.defaults,
      optionSpec: definition.optionSpec,
      enabled: state?.enabled === true,
      taskId: state?.taskId ?? null,
      status: entry?.status ?? 'absent',
    }
  })
  const names = new Set(JOB_DEFINITIONS.map(definition => definition.name))
  const custom = entries
    .filter(entry => ![...names].some(name => entry.title.includes(name)) && isOwned(entry, library))
    .map(entry => ({ id: entry.id, title: entry.title, status: entry.status }))
  const suspects = entries
    .filter(entry => entry.title.startsWith('[wiki] ') && !isOwned(entry, library) && !custom.some(item => (item as { id: string }).id === entry.id))
    .map(entry => ({ id: entry.id, title: entry.title, status: entry.status }))
  return { builtin, custom, suspects }
}

export type { Snapshot }
