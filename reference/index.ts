/**
 * DSH 插件入口：把 LLM Wiki 作为一组工具挂到 `ctx.tools` 上。
 *
 * 分工（与 Obsidian 插件对齐）：
 * - 这里负责"agent 怎么读写"：检索、分级读取、写入门禁、审计；
 * - Obsidian 插件负责"人怎么看"：索引、lint 面板、模板、状态栏；
 * 两边共用 `core/`，所以同一条 lint 规则不会有两个版本。
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import { WikiStore } from './store.ts'
import { registerWikiTools } from './tools.ts'

export const name = 'llm-wiki'

/** 依赖工具注册表：缺 `ctx.tools` 时插件不应被加载。 */
export const inject = ['tools']

export interface Config {
  /** Obsidian vault 的绝对路径。 */
  vaultPath: string
  /** wiki 根目录（vault 相对）。 */
  root: string
  /** 默认写入模式：propose 走 50_review，direct 直接写 wiki/。 */
  writeMode: 'propose' | 'direct'
  /** 检索默认条数。 */
  maxCandidates: number
  /** 活跃页多久未更新算 stale（info 级）。 */
  staleDays: number
}

export const Config: z<Config> = z.object({
  vaultPath: z.string().required(),
  root: z.string().default('mybrain'),
  writeMode: z.union(['propose', 'direct'] as const).default('propose'),
  maxCandidates: z.number().step(1).min(1).max(20).default(8),
  staleDays: z.number().step(1).min(1).default(180),
})

export function apply(ctx: Context, config: Config) {
  const store = new WikiStore({ vaultPath: config.vaultPath.trim(), root: config.root.trim() })
  registerWikiTools(ctx, {
    store,
    writeMode: config.writeMode,
    maxCandidates: config.maxCandidates,
    staleDays: config.staleDays,
  })
}
