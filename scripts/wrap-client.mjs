/**
 * 把 esbuild 的 CJS 产物包成 DSH 预期的闭包工厂。
 *
 * 契约（来自 DSH 的 packages/client/tsdown.client.ts）：
 *   window.__ModuleLoader__.load({ id, factory, meta })
 *   factory: (require) => module.exports
 *
 * 形状错的话前端整体静默不加载，只在 console 报错——这是最容易白干的一步，
 * 所以包装固定成脚本，不允许手工拼。
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [, , input, output, packageName] = process.argv
if (input === undefined || output === undefined) {
  console.error('用法：node scripts/wrap-client.mjs <body.js> <out.js> [packageName]')
  process.exit(1)
}

const id = packageName ?? 'dsh-plugin-llm-wiki'
const body = await readFile(resolve(input), 'utf8')
// 去掉 esbuild 可能留下的 sourceMappingURL：包进工厂后行号已无意义，留着只会误导。
const cleaned = body.replace(/\/\/# sourceMappingURL=.+\s*$/u, '').trimEnd()

const wrapped = [
  `window.__ModuleLoader__.load({id:${JSON.stringify(id)},factory:require=>{`,
  'var module={exports:{}};var exports=module.exports;',
  cleaned,
  ';return module.exports}});',
  '',
].join('\n')

await writeFile(resolve(output), wrapped, 'utf8')
console.log(`wrapped ${input} → ${output} (${wrapped.length} B, id=${id})`)
