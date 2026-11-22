/**
 * 宿主侧三条精确 Fetch 路由。它们绕过 Gateway，**只对 owner principal 开放**，
 * 因此面板按钮能 0 token 直达宿主；远端会话会拿到 403，前端据此自动降级成交给 agent。
 *
 * 路由路径必须挂在 `/api/` 下（DSH 的 exact route 校验按 API_PATH 切段）。
 */

import { Actions, ActionError } from './actions.ts'
import { JobsStore, taskBoard, reconcile } from './jobs.ts'
import type { ObsidianCli, OpenOutcome } from './obsidian.ts'
import { recentCommits } from './git.ts'
import type { LibraryInfo } from './space.ts'
import type { WikiStore } from './store.ts'
import type { ScheduleLike } from './jobs.ts'

/** 任务时区与 jobs.ts 保持一致；DSH 的 ScheduleTiming 目前按这个字段排期。 */
const TZ = 'Asia/Shanghai'

export interface RpcDeps {
  store: WikiStore
  actions: Actions
  jobs: JobsStore
  /** 当前库的显示名（= 空间里的文件夹名）；切库时就地改写。 */
  libraryName: string
  /** 知识空间：空字符串表示没配，切库/建库都会报 E_NO_SPACE。 */
  space: {
    path: string
    active: string
    list(): Promise<LibraryInfo[]>
    init(name: string): Promise<LibraryInfo>
    activate(name: string): Promise<LibraryInfo>
  }
  gitEnabled: boolean
  audioProvider: string
  /** Obsidian vault 名（深链用）。 */
  vaultName: string
  /** 惰性探测本机 obsidian-cli；没有时返回 undefined，只走 URI / 客户端。 */
  obsidianCli(): Promise<ObsidianCli | undefined>
  /** Obsidian 客户端装没装（只做文件探测，不启动）。 */
  obsidianAppAvailable?(): boolean
  /** 取 DSH Schedule 服务；不可用时返回 undefined。 */
  schedule(): ScheduleLike | undefined
  /** 把"需要判断"的活交给 agent（一次性任务并立即跑）。 */
  deferToAgent?(instruction: string, title: string): Promise<boolean>
  /**
   * 真的把库（或库里某篇笔记）交给 Obsidian：注册 vault → 唤起客户端 → 兜底。
   * 返回实际走的通道与一句人话，前端只负责显示，不自己拼 URL。
   */
  openInObsidian(relPath: string): Promise<OpenOutcome>
  /** profile 里存这份配置的文件（写回磁盘的落点）；拿不到时为空串。 */
  configPath?: string
  /** 插件自有的设置文件（configEditor 拒绝写入时的落点）。 */
  settingsPath?: string
  /** 读当前生效的插件配置（设置页展示用）。 */
  readConfig(): Record<string, unknown>
  /**
   * 写回插件配置。成功返回 `{ persisted: true }`；profile 不允许持久化时
   * 返回 `{ persisted: false, error }`，前端据此说明"只在本进程生效"。
   * 走 configEditor，不碰用户的 cordis.patch.yml。
   */
  writeConfig(patch: Record<string, unknown>): Promise<{
    persisted: boolean
    error?: string
    /** profile = 写进 DSH 的 profile patch；settings = 写进插件自有设置文件。 */
    via?: 'profile' | 'settings'
    /** 实际落盘的文件。 */
    file?: string
    /** 是否已经就地生效（不用重启）。 */
    applied?: boolean
    /** 路径变了（已重绑到新库）。 */
    pathsChanged?: boolean
    /** profile 层是否也同步写成功。 */
    profileSynced?: boolean
    /** 降级说明：为什么没走 profile。 */
    note?: string
  }>
  /** 一次动作完成后通知前端刷新（靠前端轮询即可，这里只是保留钩子）。 */
  notify?(event: string): void
}

/**
 * DSH 的 HTTP 表面：`ctx.webServer.register({ kind:'prefix', path, handler })`。
 * handler 是 Node 原生 `(req, res)`，不是 Web Fetch 的 Request/Response——
 * 早先按 `ctx.get('connection').fetch.register` 写过，那条路径在宿主里取不到服务，
 * 路由根本没注册，面板只能拿到 404。
 */
interface WebHost {
  webServer: {
    register(route: {
      kind: 'prefix'
      path: string
      handler(req: NodeRequest, res: NodeResponse): void | Promise<void>
    }): () => void
  }
}

interface NodeRequest {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  on(event: 'data', listener: (chunk: Buffer | string) => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'error', listener: (error: Error) => void): void
  destroy(): void
}

interface NodeResponse {
  writableEnded: boolean
  destroyed: boolean
  writeHead(status: number, headers: Record<string, string | number>): void
  end(body?: string): void
}

/** 发送 JSON：写 content-length 让浏览器能立刻收尾，和宿主其它路由保持一致。 */
function sendJson(res: NodeResponse, status: number, payload: unknown): void {
  if (res.writableEnded || res.destroyed) return
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** 读请求体；超限直接断开，避免一个坏请求把内存吃光。 */
function readBody(req: NodeRequest, cap = 64 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.length
      if (size > cap) { reject(new ActionError('E_TOO_LARGE', '请求体超过上限')); req.destroy(); return }
      chunks.push(buf)
    })
    req.on('end', () => { resolve(Buffer.concat(chunks)) })
    req.on('error', reject)
  })
}

async function readJsonBody(req: NodeRequest): Promise<Record<string, unknown>> {
  const raw = await readBody(req)
  if (raw.length === 0) return {}
  return JSON.parse(raw.toString('utf8')) as Record<string, unknown>
}

function headerOf(req: NodeRequest, name: string): string {
  const value = req.headers[name.toLowerCase()]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

function failureStatus(error: unknown): { status: number, body: Record<string, unknown> } {
  if (error instanceof ActionError) {
    return { status: 400, body: { ok: false, error: { code: error.code, message: error.message, details: error.details ?? {} } } }
  }
  const message = error instanceof Error ? error.message : String(error)
  const code = /拒绝写入|拒绝访问/u.test(message) ? 'E_PATH_OUTSIDE'
    : /超过上限/u.test(message) ? 'E_TOO_LARGE'
    : 'E_INTERNAL'
  return { status: 500, body: { ok: false, error: { code, message, details: {} } } }
}

/**
 * 设置页能改的字段白名单。
 *
 * 只放"改了能就地生效、且不会让插件指向不存在路径"的项。`libraryPath` 与
 * `spacePath` 故意不在这里：它们是库的锚点，改错会让面板指向空目录，
 * 该走"选库/初始化库"这类有校验的动作，而不是一个自由输入框。
 */
export const EDITABLE_CONFIG_KEYS = [
  'spacePath',
  'libraryPath',
  'libraryName',
  'writeMode',
  'maxCandidates',
  'gitEnabled',
  'gitAutoCommit',
  'audioProvider',
  'audioMaxMinutes',
  'audioChunkMinutes',
  'debounceMs',
  'watchLibrary',
  'vaultName',
] as const

const NUMBER_LIMITS: Record<string, { min: number, max: number, step: number }> = {
  maxCandidates: { min: 1, max: 20, step: 1 },
  audioMaxMinutes: { min: 5, max: 120, step: 1 },
  audioChunkMinutes: { min: 2, max: 30, step: 1 },
  debounceMs: { min: 500, max: 5000, step: 100 },
}

const ENUMS: Record<string, string[]> = {
  writeMode: ['propose', 'direct'],
  audioProvider: ['none', 'whisper', 'api'],
}

/** 布尔字段单独列出：不能靠"落到 string 分支"蒙混过关（"yes" 不是 true）。 */
const BOOLEANS = ['gitEnabled', 'gitAutoCommit', 'watchLibrary'] as const

/**
 * 路径字段。
 *
 * 这一类字段以前是只读的，理由是"改错会让面板指向空目录"。但只读换来的代价是：
 * 用户想换知识空间只能去改 profile 的 YAML——那才是真正容易改错的地方，
 * 而且改完还得重启。所以改成可写，但**由宿主先校验**：
 * 必须是绝对路径、不许有 `..`、不许是文件；空间目录必须已经存在。
 */
const PATH_KEYS = ['spacePath', 'libraryPath'] as const

function absolutePath(value: string, key: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (trimmed.split(/[\\/]+/u).includes('..')) {
    throw new ActionError('E_SCHEMA', `${key} 里不能有 ..：${trimmed}`)
  }
  const absolute = trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(trimmed) || trimmed.startsWith('~')
  if (!absolute) throw new ActionError('E_SCHEMA', `${key} 要写绝对路径，例如 /Users/you/obsidian-workspace`)
  return trimmed
}

/** 过滤 + 强类型：只放行白名单字段，并把数字夹进 schema 允许的区间。 */
export function sanitizeConfigPatch(raw: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const key of EDITABLE_CONFIG_KEYS) {
    if (!(key in raw)) continue
    const value = raw[key]
    if (value === undefined) continue

    if (key in ENUMS) {
      if (typeof value !== 'string' || !ENUMS[key]!.includes(value)) {
        throw new ActionError('E_SCHEMA', `${key} 只能是 ${ENUMS[key]!.join(' / ')}`)
      }
      clean[key] = value
      continue
    }
    if (key in NUMBER_LIMITS) {
      const limit = NUMBER_LIMITS[key]!
      // 只接受真正的数字：字符串 "12" 会让 schema 与实际类型不一致。
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ActionError('E_SCHEMA', `${key} 必须是数字`)
      }
      if (value < limit.min || value > limit.max) {
        throw new ActionError('E_SCHEMA', `${key} 必须在 ${limit.min}–${limit.max} 之间`)
      }
      clean[key] = Math.round(value)
      continue
    }
    if ((PATH_KEYS as readonly string[]).includes(key)) {
      if (typeof value !== 'string') throw new ActionError('E_SCHEMA', `${key} 必须是字符串路径`)
      clean[key] = absolutePath(value, key)
      continue
    }
    if ((BOOLEANS as readonly string[]).includes(key)) {
      if (typeof value !== 'boolean') throw new ActionError('E_SCHEMA', `${key} 必须是 true 或 false`)
      clean[key] = value
      continue
    }
    if (typeof value === 'string') { clean[key] = value.trim(); continue }
    throw new ActionError('E_SCHEMA', `${key} 的类型不对`)
  }
  return clean
}

/**
 * 注册所有面板路由。
 *
 * 传输层是 DSH 的 `ctx.webServer.register({ kind:'prefix', path, handler })`：
 * 一条前缀路由 + 内部按 pathname 分发，和宿主其它插件一致。
 * 返回 disposer，插件卸载时整片摘下。
 */
export function registerRpc(host: WebHost, deps: RpcDeps): () => void {
  const PREFIX = '/api/llm-wiki'
  let disposed = false

  const handle = async (req: NodeRequest, res: NodeResponse): Promise<void> => {
    if (disposed) { sendJson(res, 503, { ok: false, error: { code: 'E_DISPOSED', message: '插件已卸载' } }); return }

    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) || '/' : url.pathname
    const method = (req.method ?? 'GET').toUpperCase()

    try {
      // ── GET /state ──
      if (pathname === '/state' && method === 'GET') {
        sendJson(res, 200, await stateOf(deps))
        return
      }

      // ── GET /config ──
      if (pathname === '/config' && method === 'GET') {
        sendJson(res, 200, { ok: true, config: deps.readConfig(), configPath: deps.configPath ?? '', settingsPath: deps.settingsPath ?? '' })
        return
      }

      // ── POST /config ──
      if (pathname === '/config' && method === 'POST') {
        let payload: Record<string, unknown>
        try { payload = await readJsonBody(req) } catch {
          sendJson(res, 400, { ok: false, error: { code: 'E_BAD_JSON', message: '请求体不是合法 JSON', details: {} } })
          return
        }
        const raw = payload.config
        if (raw === null || typeof raw !== 'object') {
          sendJson(res, 400, { ok: false, error: { code: 'E_BAD_JSON', message: '缺少 config 对象', details: {} } })
          return
        }
        const outcome = await deps.writeConfig(sanitizeConfigPatch(raw as Record<string, unknown>))
        sendJson(res, 200, {
          ok: true,
          ...outcome,
          config: deps.readConfig(),
          configPath: deps.configPath ?? '',
          settingsPath: deps.settingsPath ?? '',
        })
        return
      }

      // ── POST /action ──
      if (pathname === '/action' && method === 'POST') {
        let payload: Record<string, unknown>
        try { payload = await readJsonBody(req) } catch {
          sendJson(res, 400, { ok: false, error: { code: 'E_BAD_JSON', message: '请求体不是合法 JSON', details: {} } })
          return
        }
        const action = String(payload.action ?? '').trim()
        if (action === '') {
          sendJson(res, 400, { ok: false, error: { code: 'E_ACTION_UNKNOWN', message: '缺少 action', details: {} } })
          return
        }
        const params = (payload.params ?? {}) as Record<string, unknown>
        sendJson(res, 200, { ok: true, ...await dispatch(deps, action, params) })
        return
      }

      // ── POST /upload ──
      if (pathname === '/upload' && method === 'POST') {
        const body = await readBody(req)
        const filename = decodeURIComponent(headerOf(req, 'x-filename')) || 'upload.bin'
        const mime = headerOf(req, 'x-mime') || headerOf(req, 'content-type') || ''
        const result = await deps.actions.ingestFile({
          bytes: new Uint8Array(body),
          filename,
          mime,
          domain: headerOf(req, 'x-domain') || undefined,
        })
        sendJson(res, 200, { ok: true, ...result })
        return
      }

      // ── POST /open ── 交给 Obsidian 打开库或某篇笔记（真的唤起客户端）
      if (pathname === '/open' && method === 'POST') {
        let payload: Record<string, unknown>
        try { payload = await readJsonBody(req) } catch {
          sendJson(res, 400, { ok: false, error: { code: 'E_BAD_JSON', message: '请求体不是合法 JSON', details: {} } })
          return
        }
        const relPath = String(payload.path ?? '').trim()
        // 空路径 = 只打开这个库（vault），用于面板顶部的「打开知识库」。
        if (relPath !== '' && (relPath.includes('..') || relPath.startsWith('/'))) {
          sendJson(res, 400, { ok: false, error: { code: 'E_PATH_OUTSIDE', message: `不是库内路径：${relPath}`, details: {} } })
          return
        }
        const outcome = await deps.openInObsidian(relPath)
        // OpenOutcome 自带 ok/via/uri/note，直接透传：前端只读，不再二次拼装。
        sendJson(res, outcome.ok ? 200 : 502, outcome as unknown as Record<string, unknown>)
        return
      }

      // ── GET /libraries ── 空间里的库清单
      if (pathname === '/libraries' && method === 'GET') {
        const libraries = await deps.space.list()
        sendJson(res, 200, { ok: true, space: deps.space.path, active: deps.space.active, libraries })
        return
      }

      // ── POST /library ── 初始化一个空文件夹 / 切换当前库
      if (pathname === '/library' && method === 'POST') {
        let payload: Record<string, unknown>
        try { payload = await readJsonBody(req) } catch {
          sendJson(res, 400, { ok: false, error: { code: 'E_BAD_JSON', message: '请求体不是合法 JSON', details: {} } })
          return
        }
        const name = String(payload.name ?? '').trim()
        if (name === '') {
          sendJson(res, 400, { ok: false, error: { code: 'E_BAD_NAME', message: '缺少库名', details: {} } })
          return
        }
        // 库名会成为磁盘上的目录名：先把它挡在门外，别等 initLibrary 抛个笼统错误。
        if (name.includes('/') || name.includes('\\') || name.startsWith('.') || name === '..') {
          sendJson(res, 400, {
            ok: false,
            error: { code: 'E_BAD_NAME', message: `库名不能带 / 或 \\，也不能以点开头：${name}`, details: {} },
          })
          return
        }
        if (payload.op === 'switch') {
          const target = await deps.space.activate(name)
          deps.space.active = target.name
          sendJson(res, 200, { ok: true, op: 'switch', library: target, active: target.name })
          return
        }
        /**
         * 建库（面板上的「新建知识库」）：
         * 空间下新建一个文件夹 → 写 0-inbox/1-raw/2-wiki/3-review + WIKI.md/index/log，
         * 然后**直接切过去**。全程不需要开 Finder、也不需要先开 Obsidian：
         * 文件夹和骨架文件都是宿主写的；Obsidian 只在"想看正文"时才需要，那一步是「打开知识库」。
         */
        if (payload.op === 'init' || payload.op === 'create') {
          const libraries = await deps.space.list().catch(() => [])
          const existing = libraries.find(item => item.name === name)
          if (existing?.initialized === true) {
            sendJson(res, 400, {
              ok: false,
              error: { code: 'E_EXISTS', message: `空间里已经有库 ${name}：切过去就行，不必重建`, details: {} },
            })
            return
          }
          const created = await deps.space.init(name)
          const target = await deps.space.activate(created.name)
          deps.space.active = target.name
          sendJson(res, 200, { ok: true, op: 'init', library: target, active: target.name })
          return
        }
        sendJson(res, 400, { ok: false, error: { code: 'E_BAD_OP', message: `未知的库操作：${String(payload.op ?? '')}`, details: {} } })
        return
      }

      sendJson(res, 404, { ok: false, error: { code: 'E_NO_ROUTE', message: `未知路由 ${method} ${pathname}`, details: {} } })
    } catch (error) {
      const { status, body } = failureStatus(error)
      sendJson(res, status, body)
    }
  }

  const dispose = host.webServer.register({ kind: 'prefix', path: PREFIX, handler: handle })
  return () => { disposed = true; dispose() }
}

async function stateOf(deps: RpcDeps): Promise<Record<string, unknown>> {
  const base = await deps.actions.state()
  const schedule = deps.schedule()
  const jobs = await deps.jobs.load()
  const board = schedule === undefined
    ? { builtin: [], custom: [], suspects: [] }
    : await taskBoard(schedule, jobs, deps.store.libraryPath)
  const libraries = deps.space.path === '' ? [] : await deps.space.list().catch(() => [])
  const commits = deps.gitEnabled
    ? await recentCommits(deps.store.libraryPath, 5).catch(() => [])
    : []
  /**
   * 顺序要紧：`base` 先铺，下面这些再覆盖。
   * 库不在磁盘上时 `actions.state()` 会返回 `library.name = ''`，
   * 一旦让它盖在 deps 上，面板头部就变成空白标题——看起来像插件坏了。
   * 名字从 deps 来：它就是"空间点文件里记着的那个库"，哪怕文件夹已经没了。
   */
  return {
    ok: true,
    ...base,
    library: { path: deps.store.libraryPath, name: deps.libraryName },
    space: { path: deps.space.path, active: deps.libraryName, libraries },
    mode: { git: deps.gitEnabled, audio: deps.audioProvider },
    git: { enabled: deps.gitEnabled, commits },
    scheduleAvailable: schedule !== undefined,
    obsidian: {
      vault: deps.vaultName,
      cli: (await deps.obsidianCli()) !== undefined,
      app: deps.obsidianAppAvailable?.() ?? false,
    },
    tasks: board,
  }
}

/**
 * 时间与重复规则。
 *
 * 面板只该问"哪天、几点"，不该逼用户理解 cron；但存储那一层必须是**结构化**的
 * 时间规则（DSH 的 ScheduleTiming），否则任务既排不出来、也没法在任务页里改。
 * 所以这里做翻译：人话（每天 / 每周几 / 每隔 N 天）→ ScheduleTiming。
 *
 * 特别注意 weekly：DSH 收的是 `weekdays: number[]`（1=周一 … 7=周日）。
 * 早先这里写死了 `[1]`，面板又没有星期选择，于是"每周"永远是周一——这就是那个坑。
 */
function clockTimeOf(raw: unknown, fallback = '09:00'): string {
  const text = String(raw ?? fallback).trim()
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/u.exec(text)
  if (match === null) throw new ActionError('E_BAD_TIME', `时间要写成 HH:mm，例如 07:30：${text}`)
  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] ?? '0')
  if (hour > 23 || minute > 59 || second > 59) throw new ActionError('E_BAD_TIME', `时间越界：${text}`)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`
}

function weekdaysOf(raw: unknown): number[] {
  const list = Array.isArray(raw)
    ? raw
    : (raw === undefined || raw === null || raw === '' ? [] : [raw])
  const days: number[] = []
  for (const entry of list) {
    const value = Number(entry)
    if (!Number.isInteger(value) || value < 1 || value > 7) {
      throw new ActionError('E_BAD_WEEKDAY', `星期只能是 1–7（1=周一）：${String(entry)}`)
    }
    if (!days.includes(value)) days.push(value)
  }
  if (days.length === 0) throw new ActionError('E_BAD_WEEKDAY', '每周任务至少要选一天')
  return days.sort((left, right) => left - right)
}

/** 本地时间的 DTSTART 戳：今天这个点；已经过了就交给调度器跳到下一个周期。 */
function localStamp(time: string): string {
  const now = new Date()
  const [hour = '09', minute = '00', second = '00'] = time.split(':')
  const pad = (value: number): string => String(value).padStart(2, '0')
  return [
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    `T${hour}${minute}${second}`,
  ].join('')
}

/**
 * 每隔 N 天用 RRULE 表达（`FREQ=DAILY;INTERVAL=N`），而不是 `every_seconds`：
 * 前者是"每 N 天的这个钟点"，后者是"从现在起每 N 秒/天"，会把执行时间逐渐漂到半夜。
 */
function intervalRule(days: number, time: string): string {
  const span = Math.max(2, Math.min(30, Math.round(days)))
  return `DTSTART;TZID=${TZ}:${localStamp(time)}\nRRULE:FREQ=DAILY;INTERVAL=${span}`
}

/**
 * 每月规则用 RRULE 表达：`FREQ=MONTHLY;BYMONTHDAY=N`（`N=-1` 就是"每月最后一天"）。
 *
 * 为什么不用 cron：`BYMONTHDAY=31` 在只有 30 天的月份会自动跳过（下次 31 号再来），
 * cron 的 `31` 在 2 月同样跳过，但 RRULE 还能一眼看懂，而且和"每隔 N 天"用的是同一套表达。
 */
function monthlyRule(monthDay: number, time: string): string {
  const day = monthDay === -1 ? -1 : Math.round(monthDay)
  if (day !== -1 && (!Number.isInteger(day) || day < 1 || day > 31)) {
    throw new ActionError('E_BAD_MONTHDAY', '每月几号要在 1–31 之间，或者选"最后一天"')
  }
  return `DTSTART;TZID=${TZ}:${localStamp(time)}\nRRULE:FREQ=MONTHLY;BYMONTHDAY=${day}`
}

/** 面板提交的"频率 + 时间 + 星期/间隔/几号" → ScheduleTiming。 */
export function createTiming(params: Record<string, unknown>): Record<string, unknown> {
  const frequency = String(params.frequency ?? 'daily').trim()
  const time = clockTimeOf(params.time)
  switch (frequency) {
    case 'weekly':
      return { kind: 'weekly', weekly: { time, time_zone: TZ, weekdays: weekdaysOf(params.weekdays ?? params.weekday) } }
    case 'monthly': {
      const raw = params.monthDay ?? params.day ?? 1
      const day = Number(raw)
      if (!Number.isFinite(day)) throw new ActionError('E_BAD_MONTHDAY', '每月几号必须是数字，或用 -1 表示最后一天')
      return { kind: 'rrule', rrule: monthlyRule(day, time) }
    }
    case 'interval': {
      const days = Number(params.everyDays ?? params.days ?? 3)
      if (!Number.isFinite(days) || days < 2 || days > 30) {
        throw new ActionError('E_BAD_INTERVAL', '间隔天数要在 2–30 之间')
      }
      return { kind: 'rrule', rrule: intervalRule(days, time) }
    }
    case 'rrule': {
      const rawRule = String(params.rrule ?? '').trim()
      if (!rawRule.includes('DTSTART') || !rawRule.includes('RRULE')) {
        throw new ActionError('E_BAD_RULE', 'rrule 需要 DTSTART 与 RRULE 两行')
      }
      return { kind: 'rrule', rrule: rawRule }
    }
    default:
      return { kind: 'daily', daily: { time, time_zone: TZ } }
  }
}

/** 面板动作 → Actions 方法。前端不得自造逻辑，只传动作号与参数。 */
async function dispatch(deps: RpcDeps, action: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const actions = deps.actions
  switch (action) {
    case 'A01': return actions.note({ text: String(params.text ?? ''), title: params.title as string | undefined, domain: params.domain as string | undefined })
    case 'A03': return actions.preprocess({ item: String(params.item ?? '') })
    case 'A04': return actions.collect({
      urls: Array.isArray(params.urls) ? params.urls.map(String) : String(params.sources ?? '').split(',').filter(url => url.trim() !== ''),
      topic: params.topic as string | undefined,
      domain: params.domain as string | undefined,
      maxItems: typeof params.maxItems === 'number' ? params.maxItems : undefined,
    })
    case 'A05': return actions.confirm({ items: params.items as string[] | undefined, all: params.all === true, byHuman: true })
    case 'A06': return actions.retract({ item: String(params.item ?? '') })
    case 'A07': return actions.compile({ items: params.items as string[] | undefined, all: params.all === true })
    case 'A08': return actions.gap({ query: String(params.query ?? '') })
    case 'A09': return actions.merge({ paths: params.paths as string[] | undefined, all: params.all === true, dryRun: params.dryRun === true })
    case 'A10': return actions.expireProposals({ keepDays: typeof params.keepDays === 'number' ? params.keepDays : undefined, dryRun: params.dryRun === true })
    case 'A11': return actions.lint({ fix: params.fix === true })
    case 'A12': return actions.dedupe({
      threshold: typeof params.threshold === 'number' ? params.threshold : undefined,
      limit: typeof params.limit === 'number' ? params.limit : undefined,
      dryRun: params.dryRun === true,
    })
    case 'A13': return actions.contradict({
      domain: params.domain as string | undefined,
      maxPages: typeof params.maxPages === 'number' ? params.maxPages : undefined,
    })
    case 'A14': return actions.stale({ days: typeof params.days === 'number' ? params.days : undefined })
    case 'A15': return actions.reindex()
    case 'A16': return actions.bootstrap()
    case 'A17': return actions.rollback({ commit: params.commit as string | undefined, path: params.path as string | undefined })
    case 'A18': return actions.cleanSafe({ dryRun: params.dryRun === true })
    case 'A19': return actions.cleanDeep({ items: params.items as string[] | undefined, dryRun: params.dryRun === true })
    case 'P.discard': return actions.discardProposals({
      paths: Array.isArray(params.paths) ? params.paths.map(String) : undefined,
      all: params.all === true,
    })
    case 'J.create': {
      const schedule = deps.schedule()
      if (schedule === undefined) throw new ActionError('E_NO_SCHEDULE', 'DSH 定时任务服务不可用')
      const label = String(params.title ?? '').trim()
      if (label === '') throw new ActionError('E_BAD_NAME', '新任务需要一个名字')
      const timing = createTiming(params)
      const created = await schedule.create({
        title: `[wiki] ${deps.libraryName} · ${label}`,
        prompt: [
          `owner: llm-wiki; library: ${deps.store.libraryPath}`,
          String(params.prompt ?? label),
        ].join('\n'),
        timing: timing as { kind: 'daily' },
        target: { kind: 'new_once' },
      })
      return {
        receipt: { action: 'J.create', changed: 1, created: 1, removed: 0, ms: 0, notes: [created.id] },
        detail: { id: created.id, timing },
      }
    }
    /**
     * 一句话建任务：把自然语言交给 agent，由它翻译成 rrule + 指令，
     * 再用 schedule_create 建。表单装不下的规则（每月第一个工作日、隔两天、
     * 月底最后一天）走这条路；常规规则仍走上面的表单，0 token。
     */
    case 'J.plan': {
      const text = String(params.text ?? '').trim()
      if (text === '') throw new ActionError('E_BAD_NAME', '先用一句话说清要定什么事')
      if (deps.deferToAgent === undefined) throw new ActionError('E_NO_AGENT', '这条通道需要 agent：请在会话里让我来建')
      const instruction = [
        `用户想按自然语言建一条定时任务，原话：「${text}」`,
        '',
        '请用 schedule_create 建这条任务，三件事别改：',
        `1) title 必须写成 \`[wiki] ${deps.libraryName} · <你概括的动作>\`，前缀是插件认领任务的依据；`,
        `2) prompt 第一行写 \`owner: llm-wiki; library: ${deps.store.libraryPath}\`，之后写每次要执行的具体动作；`,
        `3) rrule 用两行表达时间：\`DTSTART;TZID=${TZ}:YYYYMMDDTHHMMSS\` + \`RRULE:FREQ=...\`，`,
        '   例如每周一三五 07:30 → FREQ=WEEKLY;BYDAY=MO,WE,FR；隔两天 → FREQ=DAILY;INTERVAL=2；',
        '   每月第一个工作日 → FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1。',
        'target 用 new_once。建完回一句：任务名 + 你理解的时间（用中文说人话）。',
      ].join('\n')
      const handed = await deps.deferToAgent(instruction, '按一句话排一条任务')
      return {
        receipt: { action: 'J.plan', changed: handed ? 1 : 0, created: 0, removed: 0, ms: 0, notes: handed ? ['已交给 agent'] : [] },
        instruction: handed ? undefined : instruction,
      }
    }
    case 'J.delete': {
      const schedule = deps.schedule()
      const jobId = String(params.jobId ?? '')
      const taskId = String(params.taskId ?? '')
      const file = await deps.jobs.load()
      let removed = 0
      if (jobId !== '') {
        const state = file.jobs[jobId]
        if (state === undefined) throw new ActionError('E_NOT_FOUND', `没有任务 ${jobId}`)
        if (state.taskId !== null && schedule !== undefined) {
          await schedule.edit({ id: state.taskId, action: 'delete' })
          removed += 1
        }
        state.enabled = false
        state.taskId = null
        await deps.jobs.save(file)
        return { receipt: { action: 'J.delete', changed: 1, created: 0, removed, ms: 0, notes: ['内置任务只是停用并从 DSH 删除，定义保留'] } }
      }
      if (taskId === '') throw new ActionError('E_BAD_NAME', '缺少 jobId 或 taskId')
      if (schedule === undefined) throw new ActionError('E_NO_SCHEDULE', 'DSH 定时任务服务不可用')
      await schedule.edit({ id: taskId, action: 'delete' })
      removed += 1
      for (const state of Object.values(file.jobs)) {
        if (state.taskId === taskId) { state.taskId = null; state.enabled = false }
      }
      await deps.jobs.save(file)
      return { receipt: { action: 'J.delete', changed: 1, created: 0, removed, ms: 0, notes: [] } }
    }
    case 'J.reconcile': {
      const schedule = deps.schedule()
      if (schedule === undefined) throw new ActionError('E_NO_SCHEDULE', 'DSH 定时任务服务不可用')
      const file = await deps.jobs.load()
      const result = await reconcile(schedule, file, deps.store.libraryPath, deps.libraryName)
      if (result.changed) await deps.jobs.save(file)
      return { receipt: { action: 'J.reconcile', changed: result.changed ? 1 : 0, created: result.created.length, removed: result.deleted.length, ms: 0, notes: [] }, detail: result }
    }
    case 'J.toggle': {
      const id = String(params.id ?? '')
      const enabled = params.enabled === true
      const file = await deps.jobs.load()
      const state = file.jobs[id]
      if (state === undefined) throw new ActionError('E_NOT_FOUND', `没有任务 ${id}`)
      state.enabled = enabled
      if (params.options !== undefined && typeof params.options === 'object') {
        state.options = { ...state.options, ...(params.options as Record<string, unknown>) }
      }
      const schedule = deps.schedule()
      if (schedule !== undefined) {
        const result = await reconcile(schedule, file, deps.store.libraryPath, deps.libraryName)
        await deps.jobs.save(file)
        return { receipt: { action: 'J.toggle', changed: 1, created: result.created.length, removed: result.deleted.length, ms: 0, notes: [] }, detail: result }
      }
      await deps.jobs.save(file)
      return { receipt: { action: 'J.toggle', changed: 1, created: 0, removed: 0, ms: 0, notes: ['定时服务不可用：仅保存了设置'] } }
    }
    default:
      throw new ActionError('E_ACTION_UNKNOWN', `未知动作 ${action}`)
  }
}
