# LLM Wiki × DSH 插件 —— 开发规格

版本 v0.4.0-dev ｜ 状态：待评审 ｜ 前身：v0.2.0（core + 5 工具已实现，未安装）
文档族：[ROADMAP.md](./ROADMAP.md)（分期）｜[FEASIBILITY.md](./FEASIBILITY.md)（14 项可行性判定）｜[archive/PRD-v0.3.0-product.md](./archive/PRD-v0.3.0-product.md)（上一版产品叙述）

> 本文件是**开发契约**，不是产品说明书。每条需求都要落到常量、签名、错误码、断言之一；落不到这四者的，不算需求。

---

## 0. 一页速览

| 项 | 值 |
|---|---|
| 交付形态 | **一个 npm 包，两个半边**：宿主半 `lib/index.js`、前端半 `lib/client.js` |
| 包名 | `dsh-plugin-llm-wiki` |
| 宿主入口 | `name = 'llm-wiki'`，`inject = ['tools','fs','connection','schedule','subprocess']`，`apply(ctx, config)` |
| 前端入口 | `exports["./client"]`，`package.json` 声明 `dsh.client{platform:'web', inject:[...]}` |
| 模型面 | 6 个工具：`wiki_search / wiki_read / wiki_write / wiki_lint / wiki_bootstrap / wiki_action` |
| 面板面 | 6 条精确 Fetch 路由 + 1 个会话 View（标签「知识库」） |
| 数据面 | 纯 Markdown，四个数字目录 + 一份 `WIKI.md` |
| 成本纪律 | 机械动作 0 token（Fetch 路由直达宿主）；只有编译/分流/判断过 agent |
| 阻塞项 | M0 三项实测（§14） |

---

## 1. 包与源码布局

```
llm-wiki/
├── core/                     # 纯 TS，零依赖，宿主与前端共用（现有 1422 行）
│   ├── model.ts              # 类型 + WIKI_LAYOUT + 规则目录 + LIMITS
│   ├── frontmatter.ts        # YAML 子集解析 / 序列化
│   ├── parse.ts              # stripCode / findSection / extractLinks / buildSnapshot
│   ├── index-page.ts         # renderIndex / parseIndexEntries
│   ├── search.ts             # searchPages（本次加 bigram）
│   ├── lint.ts               # lintSnapshot / fixableFindings
│   ├── draft.ts              # slugify / validateDraft / buildProposalText / logEntry
│   └── bootstrap.ts          # 骨架文件内容
├── host/                     # 宿主半边（新）
│   ├── index.ts              # 插件体：Config / inject / apply
│   ├── store.ts              # WikiStore：快照读、缓存、assertWritable、写锁
│   ├── actions/              # 按组拆文件
│   │   ├── ingest.ts   confirm.ts   compile.ts   maintain.ts   gc.ts   init.ts
│   ├── jobs/
│   │   ├── registry.ts       # J01–J10 定义
│   │   └── reconcile.ts      # 与 DSH 任务对账
│   ├── rpc.ts                # 6 条 Fetch 路由
│   ├── tools.ts              # 6 个模型工具
│   └── preprocess/           # PDF / 图片 / 音视频适配器
├── client/                   # 前端半边（新）
│   ├── index.ts              # 注册 View
│   ├── view.tsx              # 三段式面板
│   ├── state.ts              # 状态拉取与缓存
│   └── style.ts              # 内联样式字符串（不用 .module.css）
├── template/WIKI.md          # 生成物模板，构建时内联
├── scripts/smoke.ts          # 回归 24 项（已存在）
└── docs/                     # 本文件 + ROADMAP + FEASIBILITY
```

两条构建命令（M0 后固定）：

```bash
# 宿主半
esbuild host/index.ts --bundle --platform=node --format=esm --target=node22 \
  '--external:@deepseek-ai/*' --outfile=lib/index.js

# 前端半：先出 CJS 正文，再包成闭包工厂
esbuild client/index.ts --bundle --platform=browser --format=cjs --target=es2022 \
  '--external:react' '--external:@deepseek-ai/*' --outfile=.tmp/client.body.js
node scripts/wrap-client.mjs .tmp/client.body.js lib/client.js
```

---

## 2. 数据模型（core/model.ts 目标态）

```ts
type PageType   = 'entity'|'concept'|'source'|'answer'|'project'|'index'|'log'
type PageStatus = 'stub'|'active'|'contested'|'deprecated'
type Origin     = 'note'|'upload'|'collect'|'manual'
type Confirm    = 'auto'|'human'

interface WikiPage {
  path: string; id: string; type: PageType
  title: string; summary: string; status: PageStatus
  aliases: string[]; tags: string[]; sources: string[]
  domain?: string            // 新增：领域，元数据而非目录
  origin?: Origin            // 新增：来源类型
  confirmed?: Confirm        // 新增：素材确认方式
  derivedFrom?: string       // 新增：预处理产物 → 原件路径
  created: string; updated: string; confidence?: number
  body: string; frontmatter: Frontmatter; schemaIssues: string[]
}

interface Proposal {          // 3-review/*.md
  path: string                // review/<时间>-<slug>.md
  target: string              // 目标页 id（新建时为新 id）
  action: 'create'|'update'|'deprecate'|'merge'|'conflict-resolve'
  base?: string               // 目标页上次的 updated 时间戳，用于冲突检测
  reason: string
  body: string                // 目标页全文
}
```

**frontmatter 顺序（写死，保证 diff 稳定）**

```
id, type, title, summary, status, aliases, tags, sources, domain, created, updated, confidence
```

`origin / confirmed / derivedFrom` 不进固定顺序，按字母序追加尾部——它们只出现在 `0-inbox` 与 `1-raw`，不参与 diff。

---

## 3. 路径常量与不变式

### 3.1 WIKI_LAYOUT（v0.4 目标态，替换现有 `raw / wiki / 50_review`）

```ts
export const WIKI_LAYOUT = {
  schemaFile:   'WIKI.md',
  inboxDir:     '0-inbox',
  inboxNotes:   '0-inbox/notes',
  inboxFiles:   '0-inbox/files',
  inboxParts:   '0-inbox/files/.parts',
  inboxCollect: '0-inbox/collect',
  rawDir:       '1-raw',
  attachments:  '1-raw/attachments',
  wikiDir:      '2-wiki',
  indexPath:    '2-wiki/index.md',
  logPath:      '2-wiki/log.md',
  reviewDir:    '3-review',
  backupDir:    '3-review/.backup',
  trashDir:     '3-review/.trash',
  jobsFile:     '2-wiki/jobs.json',
} as const
```

### 3.2 六条不变式（违反即 bug，必须有测试）

1. **可写白名单**：只放行 `0-inbox/**`、`1-raw/**`、`2-wiki/**`、`3-review/**` 与四个点目录；其余由 `assertWritable` 抛 `E_PATH_OUTSIDE`。判定用 `path.relative`，不是字符串前缀。
2. **agent 不可直写 `2-wiki`**：`wiki_write` 只有 `propose` 落 `3-review`；`direct` 仅当 `Config.writeMode === 'direct'` 且只落 `2-wiki`。
3. **id 稳定**：`id = <类型目录>/<slug>`，不含 domain、时间、序号；slug 仅 `[a-z0-9\u4e00-\u9fa5-]`。
4. **索引不含点目录**：`.backup`、`.trash`、`.parts` 不进索引、不进链接图，写进 `.gitignore`。
5. **入链排除 `2-wiki/index.md`**：否则每页都有入链，孤儿页永不出现。
6. **提案不是页**：`3-review/**` 不进 `buildSnapshot` 的 pages，但参与 L012 统计。

### 3.3 状态机

```
stub ──编译──▶ active ──矛盾──▶ contested ──裁决──▶ active
  │             │                                    │
  └────弃用──────┴────────────────▶ deprecated ◀─────┘
```

`deprecated` 页**不搬家**，页首强制三段：为何废止 / 被谁替代 / 最后有效日期；`search` 默认不返回，须显式 `includeDeprecated`。

### 3.4 前端 bundle 包装（脚本必须有）

```js
// scripts/wrap-client.mjs 的产物形状
window.__ModuleLoader__.load({
  id: 'llm-wiki',
  factory: (require) => {
    const module = { exports: {} }; const exports = module.exports
    /* esbuild CJS 正文 */
    return module.exports
  },
  meta: {},
})
```

依据：`packages/client/tsdown.client.ts` 文件头；`modules/src/client/system.ts:122` 有二次创建防护。包装形状错 → 前端整体不加载且只在 console 报错，这是最容易白干的一步。

---

## 4. 页面正文结构（schema 门禁的判定依据）

```
--- frontmatter ---
# 标题

## 摘要        （≤120 字）
## 要点        （3–7 条，每条一个断言）
## 关联        （必须存在，≥1 条指向已存在页）
## 出处        （active / contested 必填；answer 可豁免）
## 备注        （可选，人工段写这里）
```

`## 关联` 缺失或空 → `L003-schema` error，阻止合并。

---

## 5. 动作规格（A01–A19）

### 5.1 统一形态

```ts
interface Action<I> {
  id: string
  cost: '0' | 'llm'
  preview(input: I): Promise<{ items: string[]; count: number; notes?: string[] }>
  run(input: I, signal?: AbortSignal): Promise<{ receipt: Receipt }>
  idempotencyKey(input: I): string
}

interface Receipt {
  action: string; changed: number; created: number; removed: number; ms: number
}
```

三条硬约束：`preview` 不许写盘；`run` 单写者（进程内锁 + lockfile 兜底）；每次 `run` 追加 `2-wiki/log.md`：

```
- 2026-11-22T21:04:11+08:00 [A09] merge 3 proposals → 5 pages, 3 removed, 412ms
```

### 5.2 动作表

| ID | 动作 | 输入 | 回执 | 主要错误码 | 幂等键 |
|---|---|---|---|---|---|
| A01 | 灵感落盘 | `{text, title?}` | created 1 | E_SCHEMA | 文本 sha256 |
| A02 | 文件接收 | `{bytes, mime, filename}` | created 1 | E_TOO_LARGE, E_MIME | 内容 sha256 |
| A03 | 预处理 | `{inboxFileId}` | created 1 | E_PDF_UNAVAILABLE, E_AUDIO_UNAVAILABLE | 输入 hash + 通道版本 |
| A04 | 采集执行 | `{taskId}` | created 1 | E_NO_SOURCE, E_RATE_LIMIT | URL 规范化集合 |
| A05 | 确认入库 | `{ids?, all?}` | moved N | E_NOT_FOUND | 目标 raw slug |
| A06 | 撤回素材 | `{id}` | moved 1 | E_NOT_FOUND | 页 id |
| A07 | 编译素材 | `{id}` | created 1 提案 | E_EMPTY_RAW, E_SCHEMA | raw id + base |
| A08 | 缺口补页 | `{query}` | created 1 stub 提案 | — | query 归一化 |
| A09 | 合并提案 | `{paths?, all?, dryRun?}` | changed N | E_CONFLICT, E_SCHEMA, E_LOCKED | 提案路径集合 |
| A10 | 过期清理 | `{days?}` | removed N | — | 提案路径 + 天数 |
| A11 | 结构体检 | `{scope:'page'\|'full', path?}` | changed 0 | — | 天然幂等 |
| A12 | 去重扫描 | `{threshold?, limit?}` | created 0..N 提案 | E_LLM | 页对签名 |
| A13 | 矛盾扫描 | `{domain?, maxPages?}` | created 0..N 提案 | E_LLM | 域 + 页集合 |
| A14 | 过期页提醒 | `{days?}` | changed 0 | — | 天然幂等 |
| A15 | 重建索引 | `{}` | changed 1 | E_SCHEMA | 索引内容 hash |
| A16 | 建库 | `{root}` | created N | E_NOT_EMPTY | root + 骨架版本 |
| A17 | 回滚 | `{commit\|path}` | changed 1 | E_NO_GIT, E_CONFLICT | commit 短 sha |
| A18 | 安全清理 | `{dryRun?}` | removed N，回收 M | — | 文件集合签名 |
| A19 | 深度清理 | `{items[]}` | moved N | E_STALE_PREVIEW | items 签名 |
| `P.discard` | 丢弃提案 | `{paths[]}` 或 `{all:true}` | discarded N | — | 提案进 `3-review/.trash`；与 A10（按时间过期）语义不同：一个是你判的，一个是定时器的 |
| `J.create` | 新建自动化任务 | `{title, frequency, time, prompt?}` | `{taskId}` | `E_NO_SPACE` | 标题加 `[wiki] <库> · ` 前缀，prompt 首行写 owner，供对账认归属 |
| `J.delete` | 删任务 | `{jobId}` 或 `{taskId}` | deleted | `E_BAD_NAME` | 内置：删 DSH 任务 + 关掉 jobs.json 里的开关（定义保留）；自定义：删任务并清 state |

### 5.3 两个关键动作的内部流程

**A05 确认入库（0 token）**

```
0-inbox/{notes,collect,files}/*.md
  → 归一：去重（URL 规范化 + 标题 Jaccard ≥ 0.85）
  → 写 1-raw/<slug>.md（confirmed / origin / sources）
  → 原件移入 1-raw/attachments/
  → 删除 inbox 原件
```

**A09 合并提案（0 token）**

```
for each proposal:
  p = parse(proposal)
  t = byId.get(p.target)
  if (p.base && t && t.updated !== p.base) → E_CONFLICT（提示重新生成提案）
  validateDraft(p.body)                    → 失败则 E_SCHEMA，整批不落盘
  write(t ?? create)                       先写 .tmp-<rand> 再 rename 覆盖
  if (Config.git.enabled && autoCommit) → git add <path> && git commit -m "wiki: <proposal>"
  rm proposal
A15 重建索引 → 追加 log
```

**原子性**：任何一步抛错，按内存中的原内容回滚已写文件；提案不删（除非整批成功）。

---

## 6. 任务规格（J01–J10）

### 6.1 定义形状

```ts
interface JobDefinition {
  id: 'J01'|…|'J10'
  name: string
  why: string
  kind: 'event' | 'clock'
  options: ZodType
  defaults: unknown
  target: string                                   // 触发的 action id
  cost: '0' | 'llm'
  cronOf(options): TimingSelector | null           // clock 必实现
  promptOf(options, library): string               // 生成的 DSH 任务 prompt
}
```

### 6.2 清单

| ID | 名称 | kind | options | 默认 | 目标 | cost |
|---|---|---|---|---|---|---|
| J01 | 索引重建 | event | `debounceMs 500–5000` | 1500 | A15 | 0 |
| J02 | 单页体检 | event | `blockOnError: bool` | true | A11(page) | 0 |
| J03 | 全量体检 | clock | `time HH:mm`、`notify` | 09:00 / true | A11(full) | 0 |
| J04 | 提案过期 | clock | `keepDays 3–60`、`time` | 7 / 09:10 | A10 | 0 |
| J05 | 重复扫描 | clock | `threshold 0.5–0.95`、`maxPairs`、`rrule` | 0.75 / 20 / 每周一 | A12 | llm |
| J06 | 矛盾扫描 | clock | `domain?`、`maxPages`、`rrule` | 全库 / 50 / 每周 | A13 | llm |
| J07 | 过期页提醒 | clock | `staleDays` | 180 | A14 | 0 |
| J08 | 采集 | clock（多实例） | `topic, sources[], maxItems, domain?, dedupe` | 每日 / 5 | A04 | llm |
| J09 | 缺口补页 | event | `missThreshold` | 3 | A08 | llm |
| J10 | 垃圾清理 | clock | `level: 'safe'\|'safe+deep-list'` | safe / 每周 | A18 | 0 |

### 6.3 对账算法（照此实现，防误删）

```ts
async function reconcile(defs: JobDefinition[], local: JobsFile, schedule: ScheduleService) {
  const owned = new Set(Object.values(local.jobs).map(j => j.taskId).filter(Boolean))
  const hostTasks = await schedule.list({})

  for (const def of defs) {
    if (def.kind === 'event') continue                 // event 类不注册任务
    const st = local.jobs[def.id]
    const matched = hostTasks.find(t => t.id === st.taskId)

    if (st.enabled && !matched) {                      // 本地 on、DSH 没有 → 补建
      const task = await schedule.create({
        title: `[wiki] ${local.library} · ${def.name}`,
        prompt: `owner: llm-wiki; library: ${local.library}\n${def.promptOf(st.options, local.library)}`,
        timing: def.cronOf(st.options)!,
        target: { kind: 'new_once' },
      })
      st.taskId = task.id
      await log(`[J] recreate ${def.id} → ${task.id}`)
    } else if (!st.enabled && matched && owned.has(matched.id)) {
      await schedule.edit(matched.id, { action: 'delete' })   // 双条件命中才删
      st.taskId = null
    } else if (st.enabled && st.taskId && !matched) {           // 用户在 DSH 手动删了
      st.enabled = false
      await log(`[J] ${def.id} removed externally → disabled`)
    }
  }
  // 名单外任务一律不碰；title 以 [wiki] 开头但 id 不在名单里的，只进面板「疑似本库任务」
}
```

**硬约束**：`owned` 集合之外的任务永不删除——一次 reconcile 误删一条提醒任务，用户就再也不会信任这个插件。

---

## 7. 模型工具（6 个）

| 工具 | 参数 | 输出 | 备注 |
|---|---|---|---|
| `wiki_search` | `query, domain?, limit=8, includeDeprecated=false` | `{candidates:[{id,title,summary,score,matched}]}` | 只回指针 + ≤110 字摘要 |
| `wiki_read` | `ids[] (≤6), mode: head\|toc\|full` | `{pages:[…]}` | head 1200 字符，full 12000 字符 |
| `wiki_write` | `mode: propose\|direct, action, target, body, reason` | `{proposalPath}` / `{written}` | direct 受 Config 限制 |
| `wiki_lint` | `fix: bool` | `{findings, fixedCount}` | fix 只做 L004 / L005 |
| `wiki_bootstrap` | `{}` | `{created[], skipped[]}` | 幂等 |
| `wiki_action` | `action: 'A05'…'A19', params` | `{receipt}` | 无面板环境的退路 |

输出 schema 必须 `additionalProperties:false` 且逐字段 `required:true`——v0.2 踩过：真实返回值多一个字段就被 DSH 拒绝。

---

## 8. 宿主 RPC（6 条精确 Fetch 路由）

注册方式（依据 `client/connection/src/rpc-host.ts:112,170`）：

```ts
ctx.connection.fetch.register({
  path: '/api/llm-wiki/state', methods: ['GET'], requestBody: 'none',
  fetch: async () => json(await state.snapshot()),
})
```

| 路由 | 方法 | 请求 | 响应 |
|---|---|---|---|
| `/api/llm-wiki/state` | GET | — | `{library, space, git:{enabled,commits}, counts, inbox, proposals, occupancy, tasks, mode:{git,audio}, health, obsidian:{vault,cli}, scheduleAvailable}` |
| `/api/llm-wiki/action` | POST | `{action, params, preview?}` | `{ok, preview?, receipt?, instruction?, error?}` |
| `/api/llm-wiki/upload` | POST | 原始字节 + `x-mime` / `x-filename`，或 multipart | `{ok, item}` |
| `/api/llm-wiki/open` | POST | `{path}`（空串 = 直接开 vault 根） | `{ok, uri}` |
| `/api/llm-wiki/libraries` | GET | — | `{ok, space, active, libraries:[{name,path,initialized}]}` |
| `/api/llm-wiki/library` | POST | `{op:'init'|'switch', name}` | `{ok, library, libraryName}` |

**空间模型**：`spacePath` 是 Obsidian 工作目录（vault 级），其下每个直接子目录可以是一个库；当前库名记在 `<space>/.llm-wiki-space.json`。切库不重载插件——`WikiStore.rebase()` 换根，`JobsStore.rename()` 改标题前缀，`deps` 是活对象所以 Actions / 工具 / 路由自动跟随。

统一错误信封：

```json
{"ok":false,"error":{"code":"E_CONFLICT","message":"目标页已变更","details":{"path":"…"}}}
```

**降级**：远端会话下精确路由只对 owner principal 开放（否则 403）。面板收到 403 后，按钮改为把 `wiki_action` 指令注入当前会话，并显式提示「已转交 agent，将消耗 token」。

---

## 9. 前端 View（标签「知识库」）

### 9.1 注册

```ts
ctx.uiConversation.views.register({ target: 'llm-wiki', create: () => <WikiPanel/> })
// label / 顺序 / 偏好持久化的具体字段：M0-1 实测后回填
```

### 9.2 布局（v7，见 `design/panel-v7.html`）

面板分左右两列 + 一条通栏，按钮收敛到"一颗按钮干完一件事"：

```
┌ 超级大脑 ──────────────────────────────────────────────┐
│ 基于 DSH + Obsidian 的个人知识库 · <队列提示>            │
│ 知识空间 <space> · 当前库 <name>   [选择知识库▾] [打开知识库] │
└───────────────────────────────────────────────────────┘
┌ 大脑状态 ─────────────┐ ┌ 确认队列 ─────────────────┐
│ 页/stub/待编译/待审/过期 │ │ 每条  [入库] [撤回]         │
│ /断裂/待确认/健康        │ └──────────────────────────┘
│ 占用 · git · 音频 · 通道 │ ┌ 提案队列 ─────────────────┐
├ 文件收集 ─────────────┤ │ 每条  [合并] [丢弃]         │
│ [灵感编辑][文件上传]     │ └──────────────────────────┘
│ 拖拽区 / 文本框          │
├ 大脑整理 ─────────────┤
│ 编译/重建索引/体检       │
│ 安全清理/深度清理/回滚   │
└───────────────────────┘
┌ 自动化任务队列 ────────────────────────────────────────┐
│ [新建任务]  每行：名称+说明 | 时间 | [停用任务][删除任务]  │
└───────────────────────────────────────────────────────┘
```

不可见的部分（刻意黑盒）：类型判断、PDF 抽取、音频切片与转写、去重、矛盾比对、孤页补齐、索引渲染——都在按钮内部完成，面板只显示计数与结果。
设置项（知识空间路径、库列表与初始化、两条队列候选上限、音频、版本）搬到 DSH 设置页，占 `settings.general.item` 槽 + Config 自动生成页。

### 9.3 状态与刷新

- 打开时拉一次 `/state`，此后 **3s 轮询**（0 token）。
- 任一动作完成 → 立即重拉，不等轮询。
- 面板不缓存写状态：所有写操作回宿主，面板只读。

### 9.4 按钮 → 动作映射（前端不得自造逻辑）

| 按钮 | 调用 | 预览文案 |
|---|---|---|
| 灵感框保存 | `A01` | 无 |
| 上传 | `/upload` → `A02` → `A03` | 「将转写/抽取 N 页」 |
| 立即采集 | `A04{taskId}` | 「将抓 ≤N 条」 |
| 确认全部 | `A05{all:true}` | 「将移动 N 条」 |
| 编译全部 | `A07` 循环 | 「约 N 页上下文 ≈ M token」 |
| 合并全部 | `A09{all:true,preview:true}` → 确认 | 「改动 N 页，删除 M 提案」 |
| 安全清理 | `A18{dryRun:true}` → 执行 | 「删 N 个，释放 X MB」 |
| 深度清理 | `A19` preview → 勾选 → run | 逐项列表 |
| 打开知识库 | `/open{path:''}` | 无（直接跳 `obsidian://`） |
| 选择知识库 | `/library{op:'switch'}` | 无（切完重拉 state） |
| 确认队列·入库 / 撤回 | `A05{items:[slug]}` / `A06{item}` | 无（单条，不弹窗） |
| 提案队列·合并 / 丢弃 | `A09{paths:[p]}` / `P.discard{paths:[p]}` | 无（单条，不弹窗） |
| 大脑整理·回滚 | `A17{commit}`（选项来自 `state.git.commits`） | 无 |
| 任务队列·停用/启用 | `J.toggle{id}` | 无 |
| 任务队列·删除任务 | `J.delete{jobId}` 或 `{taskId}` | 浏览器 confirm |
| 任务队列·新建任务 | `J.create{title,frequency,time,prompt?}` | 内联表单 |

---

## 10. 关键算法

### 10.1 预处理分派

```ts
switch (true) {
  case /^text\/|markdown/.test(mime):   direct
  case /^image\//.test(mime):           modelVision(bytes, mime)      // 依赖模型模态
  case mime === 'application/pdf':      pdfText(bytes) ?? pdftotext()  // 需依赖或系统工具
  case /^audio\/|^video\//.test(mime):  audioProvider?.transcribe()    // 可选依赖
  default:                              E_MIME
}
```

通道缺失时：原件进 `attachments/`，产物页 `status: stub` + 备注「未启用转写」，**不阻塞、不报错、不假装成功**。

### 10.2 检索打分（v0.2 基础 + bigram + domain）

```
字段权重：标题精确 120 ｜ 别名 120 ｜ 标题前缀 90 ｜ 别名前缀 85 ｜ 标题含 70
          标签 60 ｜ id 45 ｜ 摘要 35 ｜ 正文 15 ｜ 入链加成 ≤10
bigram：query 与标题/别名各切 bigram（中文）或按空格词（英文），命中 ≥2 → +25
domain：显式传入则硬过滤；未传入则跨域命中 −15
```

### 10.3 去重候选（先规则后判断）

```
sim = 0.5*Jaccard(title bigram) + 0.3*Jaccard(aliases) + 0.2*neighborOverlap(links)
候选对：sim ≥ threshold（默认 .75），最多 maxPairs（20）
→ agent 判「是否同一实体」→ merge 提案（带两侧 base 与建议保留段）
```

### 10.4 清理判定

| 对象 | 判定 | 级别 |
|---|---|---|
| `.tmp-*` 残留 | 存在 >1h | safe |
| `0-inbox/files/.parts/**` | 对应产物已生成 | safe |
| `3-review/*.md` | 已 `expired` 且 >keepDays | safe |
| `3-review/.backup/**` | 目录时间 >7 天 | safe |
| `3-review/.trash/**` | >7 天 | safe |
| `1-raw/attachments/*` | 无任何 raw 页 `derivedFrom` 指向 | **deep** |
| `0-inbox/{notes,collect}/*` | mtime >30 天且未确认 | deep（只提示） |
| `1-raw/*.md` | 无任何 wiki 页引用 | deep（标 unused） |

deep 一律先进 `.trash`，7 天后由 J10 的 safe 级真删。

---

## 11. 配置（Config schema）

```ts
z.object({
  libraryPath: z.string().required(),
  libraryName: z.string().default('brain'),
  writeMode: z.union(['propose','direct'] as const).default('propose'),
  git: z.object({
    enabled: z.boolean().default(false),
    autoCommit: z.boolean().default(true),
  }),
  audio: z.object({
    provider: z.union(['none','whisper','api'] as const).default('none'),
    maxMinutes: z.number().default(30),
  }),
  debounceMs: z.number().min(500).max(5000).default(1500),
})
```

`libraryPath` 为空时不注册任何工具，面板显示「未配置库」——不允许半配状态存在。

---

## 12. 错误码表

| 码 | 场景 | 前端表现 |
|---|---|---|
| `E_PATH_OUTSIDE` | 路径越界 | 红条 + 打印相对路径 |
| `E_SCHEMA` | 页面不满足 §4 | 高亮缺失段 |
| `E_CONFLICT` | 提案 base 与当前页不符 | 「页面已变，重新生成提案」 |
| `E_LOCKED` | 另一写动作在跑 | 「正在写入，稍候」 |
| `E_NOT_A_REPO` | 库根不是 git 仓库（`gitEnabled` 已开但没 init） | 提示 `git init` 或关掉开关 |
| `E_BAD_COMMIT` | 指定的提交不存在 / 那版里没有 2-wiki、3-review | 重新拉提交列表 |
| `E_NO_SPACE` | 没配 `spacePath` 却要做 切库/建库 | 「先到设置里填知识空间目录」 |
| `E_BAD_NAME` | 库名/任务名缺失或非法（含路径分隔符） | 高亮输入框 |
| `E_NO_GIT` | 未启用或无 git | 按钮禁用 + 说明开启方式 |
| `E_PDF_UNAVAILABLE` / `E_AUDIO_UNAVAILABLE` | 通道缺失 | 「该格式未启用，已仅存档」 |
| `E_ROUTE_FORBIDDEN` | 远端会话 403 | 自动转 agent 执行 |
| `E_STALE_PREVIEW` | deep 预览过期 | 强制重新预览 |
| `E_LLM` | 判断类动作模型失败 | 显示失败页数 + 重试 |
| `E_MIME` / `E_TOO_LARGE` | 格式或体积 | 拒绝并提示上限 |

---

## 13. 测试矩阵

| # | 类型 | 断言 |
|---|---|---|
| T1 | 单测 | frontmatter 往返字节级稳定（含 domain / origin） |
| T2 | 单测 | 代码块内链接不建图 |
| T3 | 单测 | index 目录链接不计入入链 |
| T4 | 单测 | L001 / L002 / L004 / L005 各触发一次 |
| T5 | 单测 | 索引渲染幂等（同内容不写盘） |
| T6 | 单测 | bigram：`胰岛素抵抗` 命中 `胰岛素 抵抗 机制` |
| T7 | 单测 | domain 过滤与跨域扣分 |
| T8 | 动作 | A05 二次执行 0 改动 |
| T9 | 动作 | A09 base 不符 → E_CONFLICT 且整批不落盘 |
| T10 | 动作 | A09 中途异常 → 已写文件全部回滚 |
| T11 | 动作 | A16 二次执行全 skipped |
| T12 | 动作 | A18 只删 safe；A19 需预览，过期报 E_STALE_PREVIEW |
| T13 | 任务 | reconcile：on 且 DSH 无 → 补建；DSH 手删 → 本地 off |
| T14 | 任务 | reconcile 不碰名单外任务（含 `[wiki]` 前缀的陌生任务） |
| T15 | RPC | `/state` 空库返回全 0 不报错 |
| T16 | RPC | 未知 action → E_ACTION_UNKNOWN |
| T17 | 前端 | 403 时自动转 agent 并提示 |
| T18 | 端到端 | search → read → lint → write(propose) → merge → index |
| T19 | 端到端 | 1000 页：索引 <1s、检索 <300ms |
| T20 | 打包 | `lib/client.js` 被 `window.__ModuleLoader__.load` 接受 |

---

## 14. 里程碑与退出条件

| 阶段 | 交付 | 退出条件 |
|---|---|---|
| **M0** | 三项实测：View 注册 / fetch 路由 / schedule 创建与对账 | 三项全通；任一失败按 [FEASIBILITY.md](./FEASIBILITY.md) §三 退路改设计后再进 M1 |
| **M1** | `WIKI_LAYOUT` 改 v0.4；core 加 domain / origin / confirmed；`WIKI.md` 改生成物 | T1–T5 + `scripts/smoke.ts` 24 项全绿 |
| **M2** | A01–A19 + 写锁 + log；6 工具改调动作；3 条 RPC | T8–T12、T15–T16 全绿 |
| **M3** | 前端 View：库况条 + 建议队列 + 阶段按钮 + 任务区 | T17、T20 全绿；点开 3s 内出数 |
| **M4** | J01–J10 注册表 + 对账 + 采集表单 | T13–T14 全绿；任务在 Automation 页可见，关掉即消失 |
| **M5** | J05 / J06 / J07 接默认 cron；A12 / A13 出提案 | 造 3 组重复页能出合并提案 |
| **M6** | A18 / A19 清理 + A17 回滚（git 可选） | T12 全绿；`.trash` 7 天后自动真删 |

---

## 15. 决策台账

| # | 决策 | 一句话理由 |
|---|---|---|
| D1 | 只做 DSH 插件，砍掉 Obsidian 插件 | 库是纯 Markdown 文件夹，维护面只该有一处 |
| D2 | 面板 = 会话 View「知识库」 | 主内容区，与对话 / 上下文 / 编队同级 |
| D3 | 编号 0/1/2/3 只表达阶段 | 分类交给 type + domain，避免「该放 20 还是 30」 |
| D4 | 单库，domain 是元数据 | id 稳定；拆库可按域筛选且不破链接 |
| D5 | inbox→raw 自动放行 + 可撤回 | 素材不是断言，人的注意力留给提案 |
| D6 | 提案只进 `2-wiki` | raw 层没有提案概念，只有撤回 |
| D7 | 删模板；`WIKI.md` 是生成物 | 建页由代码生成，手写规范必然与实现漂移 |
| D8 | `deprecated` 取代 archive 目录 | id 不复用，墓碑页承接旧链接 |
| D9 | 机械 0 token；判断过 agent | 成本与延迟都更优 |
| D10 | 回滚是可选能力（git 默认关） | 真需要回滚的概率低，改回去就是再提一个提案 |
| D11 | 任务统一 Job 模型 + 单向真源 + 对账 | 避免两套系统、避免双写状态 |
| D12 | 面板通道分两类（RPC / 会话注入） | 混着走要么贵要么危险 |
| D13 | 音视频为可选依赖，**默认关** | DSH 无转写能力（验证结论） |
| D14 | clock 任务频率都是自选项 | 频率是偏好，不是规则 |
| D15 | RAG 延后为可选模块；v1 先做 bigram + 别名 | token 不贵，调参贵 |
| D16 | 任务分三档（内置 / 自定义 / 其它） | DSH 任务页全局混装，分类是插件该做的事 |
| D17 | 长音频切片转写，不截断 | 一次性加载超长音频既慢又贵 |
| D18 | 清理分两级，不做一键大清洗 | 混着删就是灾难；删除先进 `.trash` |

---

## 16. v0.2.0 → v0.4.0 迁移映射

| 现在 | 目标 | 要做的改动 |
|---|---|---|
| `WIKI_LAYOUT.rawDir = 'raw'` | `'1-raw'` | 改常量 + 迁移函数 |
| `WIKI_LAYOUT.wikiDir = 'wiki'` | `'2-wiki'` | 同上 |
| `WIKI_LAYOUT.proposalDir = '50_review'` | `'3-review'` | 同上 |
| `WIKI_LAYOUT.templatesDir` | 删除 | 模板改为代码内联 |
| 无 `inboxDir` | `'0-inbox'`（三个子目录） | 新增 |
| `Frontmatter` 无 domain / origin / confirmed | 加三字段 | 追加在 sources 之后 |
| `dsh-plugin/` + `obsidian-plugin/` 两包 | 合并为 `host/` + `client/` | 删 obsidian-plugin，`core/` 不动 |
| 5 个工具 | 6 个（加 `wiki_action`） | 工具体改调动作层 |
| 无 RPC / 无前端 | 3 条路由 + 1 个 View | 新增，依赖 M0 实测 |

---

## 17. 未决（M0 后回填）

1. View 注册选项的完整字段（label / 顺序 / 偏好持久化）——M0-1。
2. 本地目录包安装后 `exports["./client"]` 是否照常被 `/plugins` 解析——M0-1 附带。
3. 单张扫描页送模型的 token 量级——决定批量 OCR 值不值。
4. `ctx.fs.watch` 递归监听的 fd 上限（1000 页规模）——M0 附带压测。
5. 音频三条路（whisper / ASR API / 不做）——需拍板；当前按「不做，默认关」实现。
