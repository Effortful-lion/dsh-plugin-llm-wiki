/**
 * 插件自有的设置文件（在 profile 目录里，和 DSH 的 profile 配置同一处磁盘）。
 *
 * 为什么需要它：
 *
 * DSH 的正规落点是 `configEditor.edit()` —— 写回 profile 的 `cordis.patch.yml`，
 * 由 Loader 立刻重载插件。那条路在"插件以 `insert:` 形式装进 profile"的 profile 上
 * 会被拒：`Configuration for "llm-wiki" is overridden by a home patch or command-line
 * overlay`。设置页因此只能读、不能存，用户被迫手改 YAML。
 *
 * 这个文件是那条路的替代：同一台磁盘、同样的键、同样的校验（校验仍在 rpc 里做），
 * 只是不参与 DSH 的 patch 组合，由插件自己在启动时读、保存时就地生效。
 * 好处是保存之后**不需要重启**；代价是它不是 DSH 官方配置层，
 * 所以设置页会把两个文件路径都显示出来，用户随时能核对值到底落在哪儿。
 */

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 文件名固定：用户要手工核对时，一眼能在 profile 目录里找到它。 */
export const SETTINGS_FILE = 'llm-wiki.settings.json'

export function settingsFilePath(profileDir: string): string {
  return join(profileDir, SETTINGS_FILE)
}

/** 同步读：apply 是同步的，启动时就要拿到值。文件不在/坏了都当空对象。 */
export function readSettingsSync(profileDir: string): Record<string, unknown> {
  if (profileDir === '') return {}
  try {
    const parsed = JSON.parse(readFileSync(settingsFilePath(profileDir), 'utf8')) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * 合并写入：先读现有文件，覆盖本次提交的键，再整份原子替换（tmp + rename），
 * 中途断电也不会留下半个 JSON。返回落盘路径与合并后的完整值。
 */
export async function writeSettings(
  profileDir: string,
  patch: Record<string, unknown>,
): Promise<{ file: string, merged: Record<string, unknown> }> {
  const file = settingsFilePath(profileDir)
  const current = readSettingsSync(profileDir)
  const merged: Record<string, unknown> = { ...current, ...patch }
  // 第一次生成时带一条自述：用户翻到 profile 目录里能立刻知道这文件是谁写的、
  // 和 cordis.patch.yml 什么关系。sanitizeConfigPatch 只认白名单键，多这条不影响读取。
  if (!('_comment' in merged)) {
    merged['_comment'] = 'dsh-plugin-llm-wiki 的设置文件：由「设置 → 插件 → LLM Wiki」写入，覆盖 profile 配置里的同名项。手工改也有效（键名与插件 Config 一致）。'
  }
  const text = `${JSON.stringify(merged, null, 2)}\n`
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
  return { file, merged }
}
