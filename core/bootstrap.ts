/**
 * 空库骨架：目录清单、WIKI.md、index.md、log.md、jobs.json。
 * 幂等——初始化不是"重置"，已存在的文件一律跳过。
 */

import { appendLog, logEntry } from './draft.ts'
import { renderIndex } from './index-page.ts'
import { buildSnapshot } from './parse.ts'
import { WIKI_LAYOUT, PAGE_TYPE_SEGMENT } from './model.ts'

/** 相对库根的目录清单（顺序即创建顺序）。 */
export const WIKI_DIRECTORIES = [
  WIKI_LAYOUT.inboxNotes,
  WIKI_LAYOUT.inboxFiles,
  WIKI_LAYOUT.inboxParts,
  WIKI_LAYOUT.inboxCollect,
  WIKI_LAYOUT.rawDir,
  WIKI_LAYOUT.attachments,
  WIKI_LAYOUT.wikiDir,
  ...(['entity', 'concept', 'source', 'answer', 'project'] as const)
    .map(type => `${WIKI_LAYOUT.wikiDir}/${PAGE_TYPE_SEGMENT[type]}`),
  WIKI_LAYOUT.proposalDir,
  WIKI_LAYOUT.backupDir,
  WIKI_LAYOUT.trashDir,
] as const

/** 点开头目录不该进版本控制：它们全是可再生的中间物。 */
export const GITIGNORE = `# llm-wiki 中间物
3-review/.backup/
3-review/.trash/
0-inbox/files/.parts/
.DS_Store
`

/**
 * 库内的写作规范。它由插件生成：**改这里不如改 PRD**——
 * 这份文件的每一条都对应代码里的一个断言，改文件不会让断言跟着变。
 */
export const SCHEMA_STUB = `# WIKI.md · 本库的写作与维护规范

> 本文件由 llm-wiki 插件生成。它描述的是**代码里已经生效的规则**，
> 手改这里不会改变任何行为；要改规则，改插件。

## 四个阶段目录

| 目录 | 含义 | 谁写 | 进索引 |
|---|---|---|---|
| \`0-inbox/\` | 待确认素材：笔记、上传文件、采集结果 | 人 / 采集任务 | 否 |
| \`1-raw/\` | 已确认素材，只追加不改写 | 确认动作 | 否 |
| \`2-wiki/\` | 已编译知识，人和 agent 都读 | 编译 / 合并 | 是 |
| \`3-review/\` | 待裁决提案（等价于 PR） | agent | 否 |

点开头的 \`3-review/.backup\`、\`3-review/.trash\`、\`0-inbox/files/.parts\`
是中间物与回收站，永远不进索引，也不进 git。

## 页面（2-wiki）

- 目录决定类型：\`2-wiki/{entities,concepts,sources,answers,projects}/<slug>.md\`
- 必备 frontmatter：\`id\`、\`type\`、\`title\`、\`summary\`(≤120 字)、\`status\`、\`created\`、\`updated\`
- 可选：\`aliases\`、\`tags\`、\`sources\`、\`domain\`、\`confidence\`
- 正文必备段：\`## 摘要\`、\`## 要点\`、\`## 关联\`、\`## 出处\`
- \`## 关联\` 至少一条 [[wikilink]]，且必须指向已存在的页；断链是 error
- 非 stub 页必须有 \`sources\`：没有出处的断言不进库
- 一页只讲一件事；同义内容合并而不是新建

## 状态

\`stub\`（占位）→ \`active\`（可用）→ \`contested\`（有矛盾，待裁决）→ \`deprecated\`（已废止）

\`deprecated\` 页**不搬家**：原地保留，页首必须写清「为何废止 / 被谁替代 / 最后有效日期」。
检索默认不返回它，旧链接也不会断。

## 领域

领域写在 frontmatter 的 \`domain\`，不是目录。这样 id 永远稳定，
将来要按领域拆库，也只是按 \`domain\` 筛一遍再搬路径，链接不会破。

## 提案（3-review）

提案文件是"拟写入的完整页面 + 一句理由 + 生成时目标页的版本"。
合并时会校验版本：目标页在此期间改过，就报冲突、不覆盖。
提案保留 \`7\` 天后由过期清理任务收走。

## 工作流

1. **摄取**：笔记 / 上传 / 采集 → \`0-inbox/\`
2. **确认**：人看一眼，确认后才进 \`1-raw/\`（配置可放开自动确认）
3. **编译**：\`1-raw/\` 的素材 → 查重、查矛盾 → 在 \`3-review/\` 生成提案
4. **裁决**：合并提案 → 落 \`2-wiki/\` → 重建索引
5. **维护**：体检、去重、矛盾、过期推送、清理，都由任务承担
`

/**
 * 空库要写的文件。
 * @param now - ISO 时间戳。
 */
export function bootstrapFiles(now: string): { path: string, text: string }[] {
  return [
    { path: `${WIKI_LAYOUT.wikiDir}/index.md`, text: renderIndex(buildSnapshot([]), { updated: now }) },
    {
      path: `${WIKI_LAYOUT.wikiDir}/log.md`,
      text: appendLog('', logEntry({ now, operation: 'index', summary: '初始化空库骨架。' })),
    },
    { path: WIKI_LAYOUT.schemaFile, text: SCHEMA_STUB },
    {
      path: WIKI_LAYOUT.jobsFile,
      text: `${JSON.stringify({ version: 1, library: '', jobs: {} }, null, 2)}\n`,
    },
    { path: '.gitignore', text: GITIGNORE },
  ]
}
