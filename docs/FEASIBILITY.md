# 可行性验证报告

对象：LLM Wiki × DSH 插件（PRD v0.3.0 全部硬需求）
方法：对 DeepSeek Harness 源码（`@deepseek-ai/dsh-root` 0.2.2-rc.3）逐项核对，证据精确到文件与行；未跑通的一律标「待实测」，不标「可行」。
结论：**14 项验证项中，9 项可直接落地，4 项需绕开或改设计，2 项在本机不可用（PDF 解析、音视频转写）。**

---

## 一、总表

| # | 需求 | 判定 | 依据 | 影响 |
|---|---|---|---|---|
| 1 | 插件同时带宿主半与前端半 | ✅ 可行 | `package.json` 的 `dsh.client{inject,platform}` + `exports["./client"]`；宿主半侧扫描**已启用的 Loader 条目**并组合启动图，经 `/plugins` 发 bundle（`packages/client/modules/README.md:12`） | 一个包两端，符合 PRD §7.1 |
| 2 | 面板注册为会话 View 标签 | ✅ 可行（参数待实测） | `ctx.uiConversation.views.register({target, create})`（`ui-conversation/README.md:51`）；`ViewTab{id,label}` 由 `conversation.view` slot entry 的注册选项投影（`ui-conversation/src/client/contract/views.ts`） | 「知识库」tab 可加在编队之后 |
| 3 | 机械动作 0 token 直达宿主 | ✅ 可行 | `ctx.connection.fetch.register({path,methods,requestBody,fetch})`，精确路由（`client/connection/src/rpc-host.ts:112,170`）；仅 owner principal 可达（同文件 148–158） | 面板 `fetch('/api/llm-wiki/act')` 直接执行，不烧 token |
| 4 | 定时任务交给 DSH | ✅ 可行 | `ctx.schedule.create({title,prompt,timing,target})`，支持 `daily/every/cron/rrule`；任务进 Automation 页，原生暂停/删除/Run now（`schedule/schedule/README.md`） | J 类任务开关语义成立 |
| 5 | 任务的「归属标记」 | ⚠️ 只能靠约定 | 任务记录字段只有 `title/prompt/timing/target`（`schedule/schedule/src/types.ts:23–26`），**没有 metadata 字段** | 只能 title 前缀 `[wiki] ` + prompt 首行标记；语义对账做不到，只做存在性对账 |
| 6 | 文件变更触发索引重建 | ✅ 可行 | `ctx.fs.watch(target, changed, signal)`（`fs/fs/src/index.ts:117`）；写入/移动/删除/版本防护齐全（`fs/fs/README.zh.md`） | J01 成立 |
| 7 | 清理动作（扫描大小、删除） | ✅ 可行 | 同上，`ctx.fs` 提供 list/stat/delete/move | A18/A19 成立 |
| 8 | Git 回滚 | ✅ 可行（需系统 git） | `ctx.subprocess` 启动受管进程（`subprocess/subprocess/README.zh.md`） | A17 成立；检测 `git rev-parse` 失败即降级备份模式 |
| 9 | 图片 OCR | ⚠️ 降级为「送模型看图」 | 模型能力由 `ModelModality` 声明（`llm/llm/src/types.ts:378`），DSH 只有「把图给模型」这条路，**没有独立 OCR 服务** | 质量取决于所用模型；图片按 token 计费，批量 OCR 会很贵 |
| 10 | PDF 转文本 | ❌ 本机无内置 | `core/tools` 与 `document/`（仅 Office 渲染）均无 PDF 解析实现 | 需引 `unpdf`/`pdfjs` 依赖，或 `ctx.subprocess` 调 `pdftotext` |
| 11 | 音视频转写 | ❌ 本机无此能力 | `attachment` 不持音频类型；无转写实现。PRD 里「复用 DSH 多模态」是**错的**——那是豆包侧能力，不是 DSH | 必须外部方案（whisper.cpp / ASR API），或 v1 不做 |
| 12 | 长音频切片 | ⚠️ 需外部依赖 | 依赖 ffmpeg（抽音轨、静音检测） | 切片逻辑可写，但要有 ffmpeg |
| 13 | 中文 bigram 检索改进 | ✅ 可行 | 纯 `core/search.ts` 内改造，零依赖零 token | 照原计划做 |
| 14 | RAG 向量检索 | ⚠️ 需外部提供方 | DSH 无内置 embedding 服务 | 印证 ROADMAP「必须先定提供方与存放位置」 |

---

## 二、四条必须改的设计

### 1. 前端 bundle 不是普通 esbuild 产物

浏览器半必须是**闭包工厂**：调 `window.__ModuleLoader__.load({id, factory, meta})`，外部依赖通过注入的 `require` 解析（`packages/client/tsdown.client.ts` 文件头注释明确写了这条；`modules/src/client/system.ts:122` 有二次创建防护）。

所以构建要包一层：

```js
window.__ModuleLoader__.load({
  id: 'llm-wiki-client',
  factory: (require) => { const module = { exports: {} }, exports = module.exports
    /* esbuild CJS 产物正文 */ ; return module.exports },
  meta: {},
})
```

**连带代价**：不能用仓库内 `tsdown.client.ts` 的 `.module.css` 哈希机制与资源 revision 命名，样式只能内联字符串。可接受——面板样式量小。

### 2. 精确 Fetch 路由有访问边界

`createSharedFetchHandler` 里，精确路由**绕过 Gateway 访问检查**，但要求 `peer.principal.kind === 'owner'`（`rpc-host.ts:153–157`），否则 403。含义：

- 本机桌面/本地 Web：可用，0 token；
- 开了 remote-access 的远端会话：403。

**降级必须写进设计**：路由不可达时，面板按钮退回"注入会话指令 → agent 调工具"，功能不丢，只变慢变贵。

### 3. 「归属标记」只能靠前缀，因此对账要防误删

任务记录无 metadata（第 5 项）。所以：

- 建任务时 title 强制 `[wiki] <库名> · <任务名>`，prompt 首行 `owner: llm-wiki; library: <库名>`；
- 对账**只匹配前缀 + 本地 `jobs.json` 里记录的 task id**，两者都对上才敢删；
- 名单外的任务一律不碰——这条如果不写死，一次 reconcile 就能删掉你自己建的提醒任务。

### 4. 沙箱边界不存在，必须自己划

插件 Host 代码在宿主进程内运行，**不受工作区沙箱限制**（`boot/plugin-manager/README.zh.md`）。这既是"能写任意路径"的能力，也是最大风险。所以 `assertWritable` 不能只是"看起来在 wiki 下"，必须做 `path.relative` 越界判定，且**只放行 `0-inbox/ 1-raw/ 2-wiki/ 3-review/` 与四个点目录**。

---

## 三、三项待实测（M0 的真正内容）

上面的"✅"是代码层可得性，不等于跑通。必须实测的只有三件：

| 编号 | 实测内容 | 通过标准 | 失败则 |
|---|---|---|---|
| M0-1 | hello-world 前端插件：注册一个 View | 标签栏出现第四个 tab，label 与顺序符合预期，切回对话不报错 | 退回"面板做成工具输出的 Markdown 卡片" |
| M0-2 | 面板 `fetch('/api/llm-wiki/ping')` 打到插件注册的路由 | 同源 200，返回 JSON；`principal` 为 owner | 退回"按钮注入会话指令" |
| M0-3 | `schedule.create` 建一个每日任务 | Automation 页出现、可 Run now、可删除；删除后对账能把本地置 off | 退回"用 cron + 外部 bash" |

三项里 M0-1 风险最高：View 注册的注册选项字段名（label / 顺序 / 优先级）我只在测试里看到 `{ target, create }` 与 `satisfies ConversationViewDefinition`，**没读全定义**。这一项决定 UI 形态，必须先做。

---

## 四、对 PRD 的四处修正

| 位置 | 原文 | 修正 |
|---|---|---|
| §6.1 | 「预处理范围（v1 全覆盖，不自研解析器）：PDF、图片 OCR、纯文本、音视频转写……直接复用 DSH 侧已有能力」 | 改为：**图片送模型**（依赖模型模态）、**PDF 需引解析依赖或调 `pdftotext`**、**音视频需外部转写**，三者机制完全不同，不能并成一句话 |
| §6.1 | 「音视频转写进 v1」 | 降为**可选依赖**：无 whisper/ASR 时该格式只存档不转写，并在面板标注「此格式未启用」 |
| §8.5 | 归属标记方案 | 补一句：DSH 任务无 metadata，标记只能落 title 前缀与 prompt 首行；对账按「前缀 + 本地 id 名单」双条件 |
| §13 M0 | 「核实两件事」 | 改为**三项实测**（上表 M0-1/2/3），并明确各自的失败退路 |

---

## 五、还剩的未知

- **View 注册选项的完整字段**（label、顺序、图标、是否允许 per-session 偏好）——需读 `ConversationViewDefinition` 类型。
- **外部包的前端 bundle 安装路径**：`/plugins` 从包的 `exports["./client"]` 读，pnpm 装本地目录包时该导出是否照常解析——需实测一次真实安装。
- **图片送模型的 token 成本**：一张 A4 扫描页约多少 token，需实测一次才知道批量 OCR 值不值。
- **`ctx.fs.watch` 的粒度与上限**：监听整个库根目录（递归）是否会触发系统 fd 上限，需实测 1000 页规模。

---

## 六、结论

主线（目录结构、动作层、0 token 通道、定时任务、事件驱动索引、清理、git）**全部有源码支撑，可开工**。

真正需要你决策的只有一件：**音视频怎么办**——三条路，成本差一个量级。

1. **本地 whisper.cpp + ffmpeg**：零 token，但要装依赖、首次下模型（约 70MB），切片与断点续跑都得自己写；
2. **外部 ASR API**：几乎零实现，按分钟计费，需要 provider 与 key；
3. **v1 不做音频**：文件只存档，转写留 P 项。

我建议 **3**：音频在你的知识来源里大概率不是主力，而它会把 v1 拖出两个依赖和一套切片状态机。等你确认后再进 PRD。
