/**
 * 插件入口（宿主半）。
 *
 * 四件事：
 * 1. 向模型暴露 6 个 `wiki_*` 工具；
 * 2. 向面板暴露 `/api/llm-wiki/*` 路由（0 token）；
 * 3. 把 J01–J10 注册成 DSH 定时任务，并与 DSH 的任务列表做对账；
 * 4. 让设置**真的落到磁盘并且当场生效**：先试 DSH 的 configEditor（写 profile patch），
 *    被拒时写插件自有的 `llm-wiki.settings.json`，然后就地改写运行中的那份配置。
 *
 * 第 4 条是这一版的重点。以前设置页只能读不能存：profile 里插件是 `insert:` 形式装进去的，
 * configEditor 会以"被 home patch / 命令行覆盖"为由拒绝写入，于是知识空间只能只读。
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { existsSync, watch } from 'node:fs'
import { basename, join } from 'node:path'

import { WIKI_LAYOUT } from '../core/model.ts'
import { Actions, ActionError, type ActionContext } from './actions.ts'
import { JobsStore, reconcile } from './jobs.ts'
import { registerRpc, sanitizeConfigPatch, type RpcDeps } from './rpc.ts'
import { appInstalled, detectCli, openInObsidian, vaultNameOf } from './obsidian.ts'
import { initLibrary, listLibraries, readActive, writeActive, type LibraryInfo } from './space.ts'
import { registerWikiTools, type ToolDeps } from './tools.ts'
import { WikiStore } from './store.ts'
import { readSettingsSync, settingsFilePath, writeSettings } from './settings.ts'
import type { ScheduleLike } from './jobs.ts'

export const name = 'llm-wiki'

/** 只强制要求工具注册表；其余服务都按可选获取，缺了也能降级运行。 */
export const inject = ['tools']

export interface Config {
  /** 知识空间：Obsidian 打开的那个工作目录（唯一）。填了它就用它推导库路径。 */
  spacePath: string
  /** 知识库根目录的绝对路径。`spacePath` 为空时才用它。 */
  libraryPath: string
  /** 面板与任务标题里显示的名字。 */
  libraryName: string
  /** 默认写入模式：propose 落 3-review，direct 落 2-wiki。 */
  writeMode: 'propose' | 'direct'
  /** 检索默认条数。 */
  maxCandidates: number
  /** 是否启用 git 回滚能力（默认关：真需要回退时再改回页就是一次新提案）。 */
  gitEnabled: boolean
  /** 合并提案后是否自动 commit。 */
  gitAutoCommit: boolean
  /** 音视频转写通道：none / whisper / api。默认 none（DSH 无内置转写）。 */
  audioProvider: 'none' | 'whisper' | 'api'
  /** 单条音视频的切片阈值（分钟）。 */
  audioMaxMinutes: number
  /** 每片长度（分钟）；切片后逐片转写再合并。 */
  audioChunkMinutes: number
  /** 文件监听防抖（毫秒）。 */
  debounceMs: number
  /** 是否监听库目录自动重建索引（J01 的事件侧）。 */
  watchLibrary: boolean
  /** Obsidian vault 名（深链用）；留空取库根目录名。 */
  vaultName: string
}

export const Config: z<Config> = z.object({
  spacePath: z.string().default(''),
  libraryPath: z.string().default(''),
  libraryName: z.string().default('brain'),
  writeMode: z.union(['propose', 'direct'] as const).default('propose'),
  maxCandidates: z.number().step(1).min(1).max(20).default(8),
  gitEnabled: z.boolean().default(false),
  gitAutoCommit: z.boolean().default(true),
  audioProvider: z.union(['none', 'whisper', 'api'] as const).default('none'),
  audioMaxMinutes: z.number().step(1).min(5).max(120).default(30),
  audioChunkMinutes: z.number().step(1).min(2).max(30).default(10),
  debounceMs: z.number().step(100).min(500).max(5000).default(1500),
  watchLibrary: z.boolean().default(true),
  vaultName: z.string().default(''),
})

interface OptService<T> { get(name: string): T | undefined }

interface ProfileContextLike { dir?: string, patchPath?: string }

/**
 * 找到 profile 目录。
 *
 * 首选 `profileContext` 服务（DSH 自己就用它的 `.dir` 与 `.patchPath`）；
 * CLI/无该服务的组合里退回环境变量。两者都拿不到时返回空串，
 * 设置页会显示"没有可写的 profile 目录"，而不是假装写成功了。
 */
function resolveProfile(ctx: Context): { dir: string, patchPath: string } {
  const service = (ctx as unknown as OptService<ProfileContextLike>).get('profileContext')
  const dir = (service?.dir ?? process.env.DSH_PROFILE_DIR ?? '').trim()
  if (dir === '') return { dir: '', patchPath: '' }
  const patchPath = (service?.patchPath ?? '').trim() || join(dir, 'cordis.patch.yml')
  return { dir, patchPath }
}

/** profile 的配置文件路径：DSH 把插件配置写回这里（configEditor 的落点）。 */
function profileConfigFile(patchPath: string): string {
  return patchPath !== '' && existsSync(patchPath) ? patchPath : ''
}

/**
 * DSH Config 打底，磁盘上插件自有的设置覆盖在上面。
 * 覆盖值走同一套校验：文件被人手工改坏了也不会把插件带进沟里。
 */
function mergeLiveConfig(base: Config, profileDir: string, log?: (message: string) => void): Config {
  if (profileDir === '') return { ...base }
  const stored = readSettingsSync(profileDir)
  if (Object.keys(stored).length === 0) return { ...base }
  try {
    const clean = sanitizeConfigPatch(stored)
    return { ...base, ...clean } as unknown as Config
  } catch (error) {
    log?.(`设置文件里有不合法的值，已忽略：${error instanceof Error ? error.message : String(error)}`)
    return { ...base }
  }
}

export function apply(ctx: Context, config: Config) {
  const profile = resolveProfile(ctx)
  const profileDir = profile.dir
  const settingsFile = profileDir === '' ? '' : settingsFilePath(profileDir)
  const log = (message: string): void => { ctx.logger?.('llm-wiki').warn(message) }

  /** 运行中的有效配置。保存设置时就地改这个对象，路由与工具都跟着走。 */
  const live = mergeLiveConfig(config, profileDir, log)

  let spacePath = live.spacePath.trim()
  let configured = live.libraryPath.trim()
  // 空间优先：当前库 = 空间点文件里记的那个文件夹；没记过就用配置里的库名。
  let folder = spacePath === ''
    ? ''
    : (readActive(spacePath) ?? (configured === '' ? live.libraryName : basename(configured)))
  let libraryPath = spacePath === '' ? configured : join(spacePath, folder)
  if (libraryPath === '') {
    ctx.logger?.('llm-wiki').warn('既没配 spacePath 也没配 libraryPath：插件不注册任何工具')
    return
  }
  let libraryName = basename(libraryPath)

  const store = new WikiStore(libraryPath)
  let cliProbe: Promise<Awaited<ReturnType<typeof detectCli>>> | undefined
  const jobs = new JobsStore(store, libraryName)
  const scheduleOf = (): ScheduleLike | undefined =>
    (ctx as unknown as OptService<ScheduleLike>).get('schedule')

  /** 生成一条一次性任务并立刻运行：把"需要判断"的活交给 agent。 */
  const deferToAgent = async (instruction: string, title: string): Promise<boolean> => {
    const schedule = scheduleOf()
    if (schedule === undefined || typeof schedule.run !== 'function') return false
    try {
      const created = await schedule.create({
        title: `[wiki] ${libraryName} · ${title}`,
        prompt: [
          `owner: llm-wiki; library: ${store.libraryPath}`,
          `这是一次性任务：完成后不需要保留。`,
          instruction,
        ].join('\n'),
        timing: { kind: 'at', at: new Date(Date.now() + 5000).toISOString() },
        target: { kind: 'new_once' },
      })
      const outcome = await schedule.run({ id: created.id })
      const pending = typeof outcome === 'object' && outcome !== null
        && (outcome as { code?: string }).code === 'schedule_execution_pending'
      if (!pending) await schedule.edit({ id: created.id, action: 'delete' })
      return true
    } catch (error) {
      ctx.logger?.('llm-wiki').warn(`交给 agent 失败：${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * 动作层的配置是**活对象**：Actions 每次调用都读 `this.ctx.xxx`，
   * 所以保存设置时直接改这里的字段就够了，不必重建 Actions、也不必重载插件。
   */
  const actionContext: ActionContext = {
    store,
    now: () => new Date().toISOString(),
    deferToAgent,
    gitEnabled: live.gitEnabled,
    gitAutoCommit: live.gitAutoCommit,
    audioProvider: live.audioProvider,
    audioMaxMinutes: live.audioMaxMinutes,
    audioChunkMinutes: live.audioChunkMinutes,
  }
  const actions = new Actions(actionContext)

  const toolDeps: ToolDeps = {
    store,
    actions,
    writeMode: live.writeMode,
    maxCandidates: live.maxCandidates,
  }
  registerWikiTools(ctx, toolDeps)

  // ── J01 的事件侧：库变了就重建索引（0 token，幂等） ──
  // 抽成函数是因为换库之后要把监听器挪到新目录上。
  let watchers: { close(): void }[] = []
  let debounceTimer: NodeJS.Timeout | undefined
  let rebuilding = false
  const stopWatchers = (): void => {
    if (debounceTimer !== undefined) { clearTimeout(debounceTimer); debounceTimer = undefined }
    for (const watcher of watchers) watcher.close()
    watchers = []
  }
  const startWatchers = (): void => {
    if (!live.watchLibrary) { stopWatchers(); return }
    const trigger = (): void => {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (rebuilding) return
        rebuilding = true
        void actions.reindex()
          .catch((error: unknown) => {
            if (!(error instanceof ActionError)) {
              ctx.logger?.('llm-wiki').warn(`自动重建索引失败：${error instanceof Error ? error.message : String(error)}`)
            }
          })
          .finally(() => { rebuilding = false })
      }, live.debounceMs)
    }
    for (const directory of [WIKI_LAYOUT.wikiDir, WIKI_LAYOUT.proposalDir]) {
      try {
        watchers.push(watch(`${store.libraryPath}/${directory}`, { recursive: true }, () => { trigger() }))
      } catch (error) {
        ctx.logger?.('llm-wiki').info(`监听 ${directory} 失败（库可能还没建）：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  startWatchers()
  ctx.effect(() => () => { stopWatchers() }, 'llm-wiki: library watcher')

  /**
   * 保存设置之后的就地生效：
   * 普通字段改活对象；路径变了就重绑 store（这是唯一需要挪家的东西）。
   * 返回 `pathsChanged` 让前端知道要不要提示"已切到新库"。
   */
  const applySettings = async (
    patch: Record<string, unknown>,
    deps: RpcDeps,
  ): Promise<{ pathsChanged: boolean }> => {
    Object.assign(live, patch)
    actionContext.gitEnabled = live.gitEnabled
    actionContext.gitAutoCommit = live.gitAutoCommit
    actionContext.audioProvider = live.audioProvider
    actionContext.audioMaxMinutes = live.audioMaxMinutes
    actionContext.audioChunkMinutes = live.audioChunkMinutes
    toolDeps.writeMode = live.writeMode
    toolDeps.maxCandidates = live.maxCandidates

    deps.gitEnabled = live.gitEnabled
    deps.audioProvider = live.audioProvider

    let pathsChanged = false
    const nextSpace = live.spacePath.trim()
    const nextConfigured = live.libraryPath.trim()
    if (nextSpace !== spacePath || nextConfigured !== configured) {
      spacePath = nextSpace
      configured = nextConfigured
      const nextFolder = spacePath === ''
        ? ''
        : (readActive(spacePath) ?? (configured === '' ? live.libraryName : basename(configured)))
      const nextLibrary = spacePath === '' ? configured : join(spacePath, nextFolder)
      if (nextLibrary !== '' && nextLibrary !== store.libraryPath) {
        stopWatchers()
        store.rebase(nextLibrary)
        libraryName = basename(nextLibrary)
        folder = nextFolder
        jobs.rename(libraryName)
        if (spacePath !== '') {
          await writeActive(spacePath, libraryName).catch((error: unknown) => {
            ctx.logger?.('llm-wiki').warn(`写入空间点文件失败：${error instanceof Error ? error.message : String(error)}`)
          })
        }
        startWatchers()
        pathsChanged = true
      }
    }

    deps.libraryName = libraryName
    deps.vaultName = vaultNameOf(store.libraryPath, live.vaultName)
    deps.space.path = spacePath
    deps.space.active = folder
    return { pathsChanged }
  }

  /**
   * webServer 在 Web 组合里**晚于插件发布**：apply 执行时它还不存在，
   * `ctx.get('webServer')` 会返回 undefined，路由一条都挂不上（面板 404 的根因）。
   * `ctx.inject` 会等服务就绪后再回调，服务被替换时还会重跑——这正是我们要的。
   */
  ctx.inject(['webServer'], (scoped) => {
    // deps 是活对象：切库、保存设置时就地改这里的名字与 vault，路由与工具都跟着走。
    const deps: RpcDeps = {
      store,
      actions,
      jobs,
      libraryName,
      gitEnabled: live.gitEnabled,
      audioProvider: live.audioProvider,
      vaultName: vaultNameOf(libraryPath, live.vaultName),
      // 惰性探测：apply 是同步的，第一次打开面板时才去问 obsidian-cli 在不在。
      obsidianCli: () => (cliProbe ??= detectCli()),
      obsidianAppAvailable: () => appInstalled(),
      schedule: scheduleOf,
      // 一句话建任务走这条：把自然语言交给 agent，由它翻成 rrule 再建。
      deferToAgent,
      // profile 里这份配置的落点，设置页拿它证明"改动真的写到磁盘上了"。
      configPath: profileConfigFile(profile.patchPath),
      settingsPath: settingsFile,
      readConfig: (): Record<string, unknown> => ({
        libraryName,
        writeMode: live.writeMode,
        maxCandidates: live.maxCandidates,
        gitEnabled: live.gitEnabled,
        gitAutoCommit: live.gitAutoCommit,
        audioProvider: live.audioProvider,
        audioMaxMinutes: live.audioMaxMinutes,
        audioChunkMinutes: live.audioChunkMinutes,
        debounceMs: live.debounceMs,
        watchLibrary: live.watchLibrary,
        vaultName: live.vaultName,
        // 路径两项可编辑：给的是**配置里的原始值**，不是解析后的结果，
        // 否则用户一保存就会把"解析出来的当前库"写成配置。
        spacePath: live.spacePath,
        libraryPath: live.libraryPath,
        // 解析后的现状，只读展示用。
        resolvedLibraryPath: store.libraryPath,
        activeLibrary: libraryName,
      }),
      /**
       * 打开知识库：注册 vault → 唤起 Obsidian → 兜底。
       * 传的是**当前库**的绝对路径，不是空间：一个库一个 vault。
       */
      openInObsidian: (relPath: string) => openInObsidian({
        vaultPath: store.libraryPath,
        vaultName: deps.vaultName,
        // 原始配置值（可能是空串）：判断"要不要单独开一个 vault"只能看它。
        explicitVaultName: live.vaultName,
        relPath,
      }),
      /**
       * 写回配置，两级落点：
       *
       * 1. `configEditor`（DSH 正规通道）：写 profile 的 cordis.patch.yml，Loader 立刻重载。
       *    插件以 `insert:` 形式装进 profile 时这条路会被拒——那就走第 2 级。
       * 2. 插件自有的 `llm-wiki.settings.json`（同目录、同一块磁盘）：写完当场生效，
       *    不用重启；启动时它覆盖 DSH Config。
       *
       * 两级都不成时如实返回 `persisted: false`，不假装存住了。
       */
      writeConfig: async (patch: Record<string, unknown>) => {
        const entry = (ctx as unknown as { fiber?: { entry?: unknown } }).fiber?.entry
        const editor = (ctx as unknown as OptService<{
          edit(entry: unknown, mutate: (current: Record<string, unknown>) => Record<string, unknown>): Promise<unknown>
        }>).get('configEditor')

        // 1) 先落盘到插件自己的设置文件。
        //    这是**保证生效**的那一层：它不受 profile 组合层的约束，
        //    写成功就一定能在本进程和下次启动时读到。
        if (settingsFile === '') {
          return { persisted: false, error: '没有可写的 profile 目录：设置无处落盘（DSH 没提供 profileContext）' }
        }
        let written: Awaited<ReturnType<typeof writeSettings>>
        try {
          written = await writeSettings(profileDir, patch)
        } catch (error) {
          return { persisted: false, error: `写设置文件失败：${error instanceof Error ? error.message : String(error)}` }
        }
        const outcome = await applySettings(patch, deps)

        // 2) 再试 DSH 正规通道，把同一份值同步进 profile 的 cordis.patch.yml。
        //    成不成都不影响本条设置已经生效；失败只作为降级说明回给前端，
        //    免得出现"写着成功、其实哪儿都没变"这种假成功。
        let profileSynced = false
        let profileError = ''
        if (entry !== undefined && editor !== undefined) {
          try {
            await editor.edit(entry, current => ({ ...current, ...patch }))
            profileSynced = true
          } catch (error) {
            profileError = error instanceof Error ? error.message : String(error)
          }
        } else {
          profileError = entry === undefined ? '拿不到 profile 里的插件条目' : 'DSH 没有 configEditor 服务'
        }

        return {
          persisted: true,
          via: 'settings',
          file: written.file,
          applied: true,
          pathsChanged: outcome.pathsChanged,
          profileSynced,
          note: profileSynced
            ? '同一份值也写进了 profile 配置'
            : `profile 配置层没写进去（${profileError}）：本条设置以插件设置文件为准`,
        }
      },
      space: {
        path: spacePath,
        active: folder,
        list: async (): Promise<LibraryInfo[]> => (spacePath === '' ? [] : listLibraries(spacePath)),
        init: async (name: string) => {
          if (spacePath === '') throw new ActionError('E_NO_SPACE', '还没配知识空间：设置里填一个目录')
          const result = await initLibrary(spacePath, name, new Date().toISOString())
          return result.library
        },
        /**
         * 切库：同一进程内直接重绑 store，不重载插件。
         * 名字、vault 名、任务归属一起换；DSH 里的任务本来就带库路径，互不干扰。
         */
        activate: async (name: string) => {
          if (spacePath === '') throw new ActionError('E_NO_SPACE', '还没配知识空间：设置里填一个目录')
          const list = await listLibraries(spacePath)
          const target = list.find(item => item.name === name)
          if (target === undefined) throw new ActionError('E_NOT_FOUND', `空间里没有库 ${name}`)
          stopWatchers()
          store.rebase(target.path)
          libraryName = target.name
          jobs.rename(target.name)
          deps.libraryName = target.name
          deps.vaultName = vaultNameOf(target.path, live.vaultName)
          startWatchers()
          await writeActive(spacePath, target.name)
          return target
        },
      },
    }
    // owned by inject-scoped fiber：webServer 消失/替换时自动注销并重建。
    ctx.effect(
      () => registerRpc(scoped as unknown as Parameters<typeof registerRpc>[0], deps),
      'llm-wiki: http routes',
    )
  })

  // 启动时对账一次：只动 owner 标记对得上的任务。
  ctx.effect(() => {
    void (async () => {
      // 空间模式下把当前库固化下来：否则每次重启都靠"配置里的库名"兜底，
      // 一旦用户改过配置或换过库，兜底就会悄悄指回旧库。
      if (spacePath !== '' && readActive(spacePath) !== libraryName) {
        try {
          await writeActive(spacePath, libraryName)
        } catch (error) {
          ctx.logger?.('llm-wiki').warn(`写入空间点文件失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const schedule = scheduleOf()
      if (schedule === undefined) return
      try {
        const file = await jobs.load()
        const result = await reconcile(schedule, file, store.libraryPath, libraryName)
        if (result.changed) {
          await jobs.save(file)
          ctx.logger?.('llm-wiki').info(`任务对账：建 ${result.created.length} 删 ${result.deleted.length} 关闭 ${result.disabled.length}`)
        }
      } catch (error) {
        ctx.logger?.('llm-wiki').warn(`任务对账失败：${error instanceof Error ? error.message : String(error)}`)
      }
    })()
    return () => {}
  }, 'llm-wiki: task reconcile')
}
