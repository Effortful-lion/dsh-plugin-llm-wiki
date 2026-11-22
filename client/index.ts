/**
 * 前端半：把两块界面挂进宿主。
 *
 * 1. `conversation.view` —— 会话标签栏里的「知识库」面板（日常操作）
 * 2. `settings.section`  —— 设置页「插件 → LLM Wiki」区块（改配置）
 *
 * 两块刻意分工：面板做操作，设置页放"改完要重启才生效"的配置项，
 * 同一件事不在两处各放一个开关。
 *
 * 不注入会话数据、不读 session 快照：面板的数字全部来自宿主 `/api/llm-wiki/state`，
 * 因此它和"当前这段对话在聊什么"完全解耦，切会话不会重新计算。
 */

import { WikiPanel } from './view.tsx'
import { WikiSettings } from './settings.tsx'

interface SlotsService {
  inject(name: string, factory: () => unknown): unknown
  register(options: Record<string, unknown>, component: unknown): unknown
}

interface ClientContext {
  slots: SlotsService
  locale?: { bind(namespace: string): (key: string) => string }
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'llm-wiki',
    // order 大一点：排在 Chat / Trajectory 之后，不抢默认落点。
    order: 60,
    label: '知识库',
  }, WikiPanel))

  // 设置页里的一个区块。label 用固定中文：这个插件的使用者是中文用户，
  // 且 DSH 的 locale 服务在此处是可选依赖，缺失时不该显示 key。
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'llm-wiki',
    order: 60,
    label: () => 'LLM Wiki · 知识库',
  }, WikiSettings))
}
