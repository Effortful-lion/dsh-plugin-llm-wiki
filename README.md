# LLM Wiki · 超级大脑

> 一个 DSH 插件：把"第二大脑"做成**一个纯 Markdown 文件夹 + 会话里的一个「知识库」面板 + 一组可调度的自动化任务**。
>
> A DeepSeek Harness plugin that turns a plain Markdown folder into a second brain: an in-app knowledge-base panel, zero-token maintenance actions, scheduled jobs, and Obsidian for reading the actual pages.

![知识库面板](docs/screenshots/panel.png)

- 库是普通文件夹，Obsidian 能直接打开看；DSH 负责编译、体检、清理。
- 面板上的按钮是**机械动作**，走精确 Fetch 路由直连宿主，**0 token**；只有需要判断的活才交给模型。
- 定时任务注册到 DSH 自己的任务页，插件内也能开关、能分三档，不抢 DSH 的 cron 管理权。

**已发布**：`npm i dsh-plugin-llm-wiki` · License MIT · 反馈请开 [issue](https://github.com/Effortful-lion/dsh-plugin-llm-wiki/issues)。

---

## 1. 目录地图

```
llm-wiki/
├── package.json          # 插件清单：main/exports/dsh.client/dsh.bundle
├── cordis.patch.yml      # 作为组合包装入时的那一行（含默认配置）
├── tsconfig.json         # 只为 tsc --noEmit
├── README.md             # 本文件
├── docs/                 # 三份文档（见 §7）
├── core/                 # 纯 TS、零依赖、可单测：库的形状与算法
│   ├── model.ts          # 路径常量、类型、限额、错误码（改口径只改这里）
│   ├── parse.ts          # Markdown + frontmatter 解析、快照与链接图（含 1-raw 层）
│   ├── search.ts         # 检索打分（中文二元组 + 英文整词 + 邻接加成）
│   ├── draft.ts          # 页面/raw/提案文本的生成与解析、日志条目
│   ├── bootstrap.ts      # 建库：目录清单、WIKI.md 规范、5 个骨架文件
│   ├── dedupe.ts         # 重复候选：标题+别名+邻居加权，跨类型不比较
│   ├── lint.ts           # 体检规则；索引渲染在 index-page.ts
│   ├── index-page.ts     # 索引的渲染与往返解析
│   └── frontmatter.ts    # YAML 子集：解析 / 序列化（零依赖）
├── host/                 # 宿主半（Node 侧）
│   ├── index.ts          # 插件入口：Config、工具注册、路由注册、任务对账、目录监听
│   ├── store.ts          # 文件读写：越界拦截、白名单、串行写、临时文件+rename、回收站
│   ├── actions.ts        # A01–A19 全部动作 + state()（面板唯一数据源）
│   ├── jobs.ts           # J01–J10 定义、jobs.json、与 DSH 任务列表对账、任务分三档
│   ├── rpc.ts            # 6 条路由 /api/llm-wiki/{state,action,upload,open,libraries,library} + 动作分发
│   ├── space.ts          # 知识空间：列库、初始化库、记录当前库（.llm-wiki-space.json）
│   ├── tools.ts          # 6 个 wiki_* 工具（模型侧入口）
│   ├── git.ts            # A17 回滚与合并后自动提交（只在 gitEnabled 时启用）
│   ├── media.ts          # 音视频：ffprobe 探时长 → ffmpeg 切片 → 转写 → 合并
│   └── pdf.ts            # PDF 抽取：pdftotext → python3+pypdf → 纯 JS 三级降级
├── client/               # 前端半（浏览器侧）
│   ├── index.ts          # 注册两块界面：conversation.view + settings.section
│   ├── view.tsx          # 会话里的「知识库」面板（日常操作）
│   ├── settings.tsx      # 设置页「插件 → LLM Wiki」区块（改配置）
│   ├── index.ts          # 往会话标签栏注册「知识库」
│   └── view.tsx          # 面板：超级大脑头部 / 大脑状态 / 文件收集 / 大脑整理 / 两条队列 / 任务队列
├── scripts/
│   ├── build.sh          # 两条构建 → lib/index.js + lib/client.js
│   ├── wrap-client.mjs   # 把 CJS 正文包成 window.__ModuleLoader__ 闭包工厂
│   ├── smoke.ts          # 42 项回归（纯函数：解析、检索、提案、去重）
│   └── integration.ts    # 40 项集成（真写文件、真跑 git / ffmpeg / python3）
├── lib/                  # 构建产物（可删可重建，别手改）
└── reference/            # 只读参照：旧版宿主侧三份源码 + 说明，不参与构建
```

**可以整目录删掉再重建的**：`lib/`、`node_modules/`（只用于 tsc 解析，是符号链接）。
**不要动的**：`core/`、`docs/`。

---

## 2. 四条命令

```bash
# 构建（产物 lib/index.js + lib/client.js）。esbuild 自动探测，找不到再设 ESBUILD=...
bash scripts/build.sh

# 类型检查（strict，NodeNext）
pnpm exec tsc -p tsconfig.json --noEmit

# 回归一：纯函数（core 的形状与算法）48 项
pnpm exec tsx scripts/smoke.ts

# 回归二：宿主集成（真写文件、真跑 git / ffprobe、符号链接与并发）46 项
pnpm exec tsx scripts/integration.ts
```

改 `core/` 任何常量后，必须重跑构建 + 两套回归。

> 如果本机没有全局 `tsx` / `tsc`，用 `node_modules/.bin/tsx` 也一样；
> 这两条命令只是跑测试，宿主运行时不需要它们。

---

## 3. 装进 DSH

三条路，选一条就行（都由使用者本人执行）：

```bash
# ① 从 npm 装（推荐）
dsh plugin --profile <你的 profile> add dsh-plugin-llm-wiki

# ② 直接从 GitHub 装（仓库里带了构建产物 lib/，不用自己 build）
dsh plugin --profile <你的 profile> add github:Effortful-lion/dsh-plugin-llm-wiki

# ③ 本地开发：克隆后 link 进去
git clone https://github.com/Effortful-lion/dsh-plugin-llm-wiki.git
cd dsh-plugin-llm-wiki && npm run build
dsh plugin --profile <你的 profile> add link:$PWD
```

也可以手工把 `cordis.patch.yml` 里的 `- insert:` 段抄进 profile 的 `cordis.patch.yml`。装完重启 DSH：

- 会话标签栏多一个「知识库」；
- 打开面板若显示"知识库还没建"，点按钮建库即可（会写出四个阶段目录 + `WIKI.md` + `index.md` + `log.md` + `jobs.json`）；
- DSH 任务页出现 `[wiki] …` 开头的任务（默认全关，在面板任务区逐个开）。

---

## 3.5 设置页（v0.5 新增）

「设置 → 插件 → LLM Wiki」里有这块插件的配置区块，改完即时写回 profile（走 `configEditor`，不碰你自己的 `cordis.patch.yml`）。

**分工原则**：面板只做日常操作，设置页只放"改完要重启才生效"的配置项，同一件事不在两处各放一个开关。

可改的字段（白名单，强制类型校验）：

| 字段 | 说明 |
|---|---|
| `writeMode` | propose 先出提案 / direct 直写 2-wiki |
| `maxCandidates` | 检索候选上限 1–20 |
| `libraryName` | 面板显示名，不改磁盘目录 |
| `audioProvider` | none / whisper / api |
| `audioMaxMinutes`、`audioChunkMinutes` | 单文件上限 5–120 分、切片 2–30 分 |
| `gitEnabled`、`gitAutoCommit` | 回滚与自动提交 |
| `watchLibrary`、`debounceMs` | 自动重建索引 500–5000 毫秒 |
| `vaultName` | Obsidian 深链用的 vault 名 |

`spacePath` 与 `libraryPath` 也可编辑。校验放在宿主：绝对路径、不许 `..`、不许指到文件上；写盘后当场重绑（详见 §4.6）。

数字与布尔按真类型校验：字符串 `"12"` 冒充数字、`"yes"` 冒充布尔都会被拒（`E_SCHEMA`）。

---

## 4. 面板怎么用（用户视角）

面板只回答三件事：**这东西进来了吗、脑子现在什么状态、我要裁决什么**。中间过程（类型判断、预处理、去重、矛盾比对、孤页补齐）都在按钮内部，不摊在面板上。正文永远留在库里，用「打开知识库」交给 Obsidian。

| 区域 | 内容 |
|---|---|
| 头部 | 库身份 + 列表选库（切库）+ **新建知识库**（建目录与骨架并切过去）+ **打开知识库**（真的唤起 Obsidian，见 §4.4） |
| 大脑状态 | 页 / 待补页 / 待编译 / 待审 / 过期 / 断裂 / 待确认 / 健康度，外加占用与 git、音频、通道三个开关态 |
| 文件收集 | 「灵感编辑」直接落 `0-inbox`；「文件上传」可拖拽、可选文件、也可**整目录上传**（保留目录结构，见 §4.3），内部判类型（PDF / 音频走预处理） |
| 大脑整理 | 六颗按钮，名字 = 动词 + 对象：**Wiki 编译**、**重建 Wiki 索引**、**Wiki 体检**、**清理临时文件**、**清理未用附件**（先出清单再确认）、**版本回滚**；鼠标停一下有逐条解释 |
| 确认队列 | `0-inbox` 逐条 **入库 / 撤回**，点头才进 `1-raw` |
| 提案队列 | `3-review` 逐条 **合并 / 丢弃**，机器只提议 |
| 自动化任务队列 | 内置 9 条（J01–J10 除手动档）逐行 停用 / 启用 / 删除；新建任务支持 **每天 / 每周（可多选周几）/ 每隔 N 天**，另有「一句话交给 AI」生成规则（见 §4.2） |

设置项（知识空间、库列表与初始化、两条队列的候选上限、音频、版本）不在面板里，走 DSH 设置页。
矛盾扫描频率、去重阈值仍由 `jobs.json` 的 option 承载，不写死在面板上。

### 4.0 库被删掉之后：面板不塌，也不逼你初始化

以前当前库的文件夹被删（或改名）之后，整个面板会塌成一张"这个文件夹还不是知识库 / 初始化知识库"的卡片，
其他入口全没了——连"我不想用这个名字了"都表达不出来。现在改成：

- **顶部那一行一直在**：库名照旧显示（取空间点文件里记着的名字），下拉里会多一条
  `xxx（磁盘上没有）`，旁边仍然是「新建知识库」「打开知识库」；
- 主体换成一张说明卡，三条路摆在一起：**重建这个库**（A16，只补骨架、不碰已有内容）、
  **新建一个库**、或**从下拉切到别的库**；
- 库况 / 收料 / 整理 / 队列 / 任务这些依赖库内容的部分整块不渲染——不铺一屏零，也不给会报错的按钮；
- 顶部那句摘要直接说「这个库在磁盘上找不到了」，不再算"待办"。

判定没变：`store.rootExists()` 为假就是"不在"，所以文件夹被删、被改名、或空间整块被移走，都会落到这一屏。

### 4.1 「新建知识库」不需要开文件夹、也不需要先开 Obsidian

点头部那颗「新建知识库」→ 填一个文件夹名 → 确定即可。宿主一次做完四件事：

1. 在**知识空间**下建这个文件夹（空间路径就是 Obsidian 的工作目录）；
2. 写出 `0-inbox` / `1-raw` / `2-wiki` / `3-review` 与 `WIKI.md`、`index.md`、`log.md`、`jobs.json`；
3. 把它切成当前库（写空间的 `.llm-wiki-space.json`，面板立刻切过去）；
4. 默认顺手把这个新库交给 Obsidian 打开一次（表单里那个勾可以关掉）。

所以**不需要**先开 Finder 建目录，**也不需要**先开 Obsidian 建 vault：目录和骨架文件是宿主直接写的，
vault 的登记由「打开知识库」那条链路负责（见 §4.4）。

校验也都在宿主：库名不能带 `/`、不能以点开头；空间里已经初始化过的同名库会被拒（`E_EXISTS`）；
文件夹里已有内容不会被覆盖（`bootstrap` 只补缺，不覆盖）。空间没配置时按钮是灰的，提示去设置里填路径。

### 4.2 定时任务的时间怎么写

时间规则最后都会变成 DSH 的 `ScheduleTiming`，面板只负责翻译，不让用户写 cron：

| 面板上选的 | 落成什么 | 例子 |
|---|---|---|
| 每天 + 时间 | `{kind:'daily', time}` | 每天 09:10 |
| 每周 + 多选周几 + 时间 | `{kind:'weekly', weekdays:[1..7]}` | 每周 一、三、五 07:30 |
| 每隔 N 天（2–30）+ 时间 | `{kind:'rrule', rrule:'DTSTART…\nRRULE:FREQ=DAILY;INTERVAL=N'}` | 每隔 2 天 08:00 |
| 每月 + 几号 + 时间 | `{kind:'rrule', rrule:'DTSTART…\nRRULE:FREQ=MONTHLY;BYMONTHDAY=N'}` | 每月 15 日 09:30（`N=-1` = 最后一天） |

要点：**每月也走 RRULE**（`FREQ=MONTHLY;BYMONTHDAY=15`，`-1` 表示最后一天）——该月没有这一天就跳过，
不提前也不顺延（2 月没有 31 号，那就 3 月 31 日再来）；cron 也能表达，但 RRULE 与"每隔 N 天"同一套写法，改期时更好读。

要点：**`weekdays` 是数组**。早先这里写死了 `[1]`（周一），面板又没有星期选择，于是"每周"永远是周一——
现在是多选，并按 ISO 星期（1=周一 … 7=周日）去重升序提交。间隔用 RRULE 的 `FREQ=DAILY;INTERVAL=N`
而不是 `every_seconds`：前者是"每 N 天的这个钟点"，后者会随运行时长把执行时间漂到半夜。

表单装不下的规则（每月第一个工作日、月底、隔两天且要按周对齐…）走面板里的
**「说不清时间？用一句话交给 AI」**：这句话原样交给 agent，由它翻成 RRULE 再用 `schedule_create` 建，
标题仍带 `[wiki] <库> ·` 前缀，所以建出来的任务照样归这个库管。常规规则用表单，0 token、即时、
可核对（表单下方会显示一句人话，例如「每周 一、三、五 07:30」）。

### 4.3 整目录上传：结构保留，同名不覆盖

「文件上传」里除了选文件，还有一颗 **上传文件夹**（`<input webkitdirectory>`），也支持把整个目录拖进拖拽区
（按 `DataTransferItem.webkitGetAsEntry()` 递归摊平）。我的判断是**保留原有目录结构**，理由：

- 收进来的往往是成套资料（一本书的章节、一个文件夹的截图）；拍平之后 `ch1/a.md` 与 `ch2/a.md`
  只能靠随机后缀区分，人就看不懂了；
- 素材本来要人工确认，保留路径等于保留"它原来在哪"这条线索——确认队列里现在直接显示原相对路径；
- 目录里同名不覆盖：同名第二条落成 `a-2.md`，原件不动。

细节：单次最多 200 个文件、每个 ≤ 64 MB（`LIMITS.uploadBytes`）；隐藏文件、`__MACOSX`、`Thumbs.db` 跳过；
路径分段里的 `..` / `.` 丢掉、控制字符替换、最多 6 层——所以 `../../etc/passwd` 只会落成
`0-inbox/files/etc/passwd`。上传是逐条串行的，按钮上会显示 `上传 3/12 · 文件名`。

**顺带修掉一个只有批量上传才会暴露的 bug**：注记的 slug 以前只查快照（2-wiki / 1-raw），不查
`0-inbox/notes` 里已有的注记，于是同名 stem 的第二条素材会把前一条的注记覆盖掉、队列里凭空少一条。
现在 slug 会避开已存在的注记（`file-a` → `file-a-2`）。

### 4.4 「打开知识库」到底做了什么（以及为什么不再丢个性化设置）

先说踩到的坑：早先的实现会把**库文件夹单独登记成一个 vault**。Obsidian 给每个 vault 一套独立的
`.obsidian`——主题、字体、已装插件、快捷键、工作区布局全在里面。于是单独登记的那一刻，你就拿到了
一套全新的默认配置，原来那套"看起来消失了"。

现在的默认行为是**用外层 vault**：

1. 从库目录往上找最近一个已经带 `.obsidian` 的祖先目录（通常就是"知识空间"）；
2. 打开那个 vault（它本来就是你在用的那个），再用 `file=` 深链定位到库这一层：
   `obsidian://open?vault=<空间名>&file=llm-wiki`；
3. 只有这两种情况才把库自己当 vault：往上找不到任何已初始化 vault（库是独立目录），
   或者配置里**显式**写了 `vaultName` 且与外层 vault 名不同。

配套实现细节：
- 深链、注册、CLI（`obsidian vault=<空间> open path=llm-wiki`）三条路都以"解析出来的目标 vault"为准；
- 判断"用户是不是显式指定了 vault"看的是**原始配置值**，不是解析后的名字——
  解析后的名字永远非空，拿它判断会把默认情况误判成"要单独开 vault"，个性化设置照样丢；
- 不再往 `obsidian.json` 里塞库条目（除非上面第二种情况），已经在清单里的旧条目也不会被反复重建。

### 4.5 打开知识库的通道顺序

以前这一步只把 `obsidian://open?vault=X` 交给浏览器跳转，在 Electron 壳里要么被拦、要么因为
那个 vault 从没在 Obsidian 里登记过而被静默忽略——表现就是"点了没反应"。现在宿主自己动手：

1. **登记**：把库目录写进 Obsidian 的 vault 清单（`~/Library/Application Support/obsidian/obsidian.json`，
   Windows/Linux 各有对应位置）。写之前复制一份 `obsidian.json.bak-<时间戳>`，已经在清单里就只读不改。
2. **唤起**：按场景挑一条真能成的路——
   - 客户端已经在跑 → 官方 CLI `obsidian vault=<名> open path=<文件>`（能精确到文件）；
   - vault 已登记 → `obsidian://open?vault=…`（冷启动最准）；
   - 还没登记 / 客户端没跑 → `open -a Obsidian <库目录>`，等价于「Open folder as vault」。
3. **兜底**：上面每条都失败才报 `E_LAUNCH_FAILED` / `E_NO_OBSIDIAN`，并说清下一步能做什么。

按钮立刻会有结果文案（"已唤起 Obsidian 打开这个库（llm-wiki）"），前端不再自己拼 URL。

### 4.6 设置怎么落盘、怎么生效

设置页（`client/settings.tsx`）保存时走 `POST /api/llm-wiki/config`，宿主按两级落点写：

| 层级 | 文件 | 说明 |
|---|---|---|
| 1 | profile 的 `cordis.patch.yml` | DSH 正规通道（`configEditor`），写成功后 Loader 重载插件 |
| 2 | profile 目录下的 `llm-wiki.settings.json` | 插件自有设置文件；profile 的 `insert:` 形式会让 `configEditor` 拒写（"overridden by a home patch or command-line overlay"），这时写这里 |

两级都会真正写进磁盘，重启后仍然有效；第 2 级写完会**就地生效**（路径变了会重绑 store、挪监听器），
不需要重启。设置页底部把两个文件的绝对路径都列出来，方便核对值到底落在哪儿。

`spacePath` / `libraryPath` 以前是只读的，现在可编辑——校验放在宿主：必须是绝对路径、不许有 `..`、
不许指到文件上。

---

## 5. 配置（`cordis.patch.yml` 或 DSH 设置页）

| 字段 | 默认 | 说明 |
|---|---|---|
| `spacePath` | `''` | 知识空间 = Obsidian 工作目录。填了它，库 = 空间下的一个文件夹，面板里可切库；留空退化成单库模式。**设置页可改**，改完写盘并就地重绑 |
| `libraryPath` | `''` | 单库模式的库根；有空间时作 fallback（空间还没记 active 时用）。**设置页可改** |
| `libraryName` | `brain` | 只在没有 `libraryPath` 时按名字在空间下推路径 |
| `vaultName` | `''` | Obsidian vault 名；留空则从库路径往上找 `.obsidian` 推断，再不行用库目录名 |
| `writeMode` | `propose` | `propose`=先落 `3-review`；`direct`=直接写 `2-wiki`（工具侧还会再拒一次） |
| `maxCandidates` | `8` | 检索默认返回条数 |
| `gitEnabled` | `false` | 回滚能力，默认关。改错了就再改一次、再交一次提案 |
| `gitAutoCommit` | `true` | 合并后是否自动提交（git 开启后才生效） |
| `audioProvider` | `none` | 音视频转写通道，**默认不做**；DSH 本身没有转写能力 |
| `audioMaxMinutes` | `30` | 超过这个时长就切片 |
| `audioChunkMinutes` | `10` | 每片长度；逐片转写后按"第 N 段 + 时间戳"合并 |
| `debounceMs` | `1500` | 库变动后重建索引的防抖 |
| `watchLibrary` | `true` | 是否监听 `2-wiki` / `3-review` 自动重建索引 |

---

## 6. 能力矩阵（这一版真实做到了哪一步）

| 能力 | 状态 | 依赖与降级 |
|---|---|---|
| PDF 抽文本 | **可用**，三级降级 | `pdftotext` → `python3 + pypdf` → 纯 JS；三级都抽不出才报 `E_PDF_UNAVAILABLE` 并只存档 |
| 音视频转写 | **已接线，默认关** | `audioProvider: whisper`（本机 whisper-cli / whisper / main）或 `api`（OpenAI 兼容，凭据只从 `DSH_WIKI_ASR_URL` / `DSH_WIKI_ASR_KEY` / `DSH_WIKI_ASR_MODEL` 读，不落进库） |
| 长音视频切片 | **可用** | 超过 `audioMaxMinutes` 用 ffmpeg 切 `0-inbox/files/.parts/<slug>/`，逐片转写后合并 |
| 新建知识库 | **可用** | 面板一步建目录 + 骨架 + 切库，不需要 Finder / Obsidian，见 §4.1 |
| 打开 Obsidian | **可用** | 默认用外层 vault（保住主题/插件/快捷键）→ 深链定位到库；库是独立目录时才单独登记，见 §4.4 |
| git 回滚 | **可用，默认关** | `gitEnabled` 打开且库是 git 仓库；只恢复 `2-wiki` / `3-review`，回滚前先打 `.backup`，多出来的文件进回收站 |
| 合并后自动提交 | **可用** | `gitEnabled` + `gitAutoCommit`；一条合并 = 一个可回滚版本 |
| 采集 | 可用但粗糙 | 只抓正文文本，不解析站点结构；出处写进 frontmatter |

## 7. 已验证 / 未验证（诚实清单）

**已跑通**（`tsc` 零错误、`smoke` 42 项全绿、`integration` 29 项全绿）：

- 建库（含库根不存在时自建）、幂等重跑、空库状态不抛错、越界路径与白名单拦截；
- PDF 抽取走通"python3 + pypdf"通道（227 页样本，33 万字）；
- ffprobe 探时长、ffmpeg 按 30 秒切片（75 秒样本切 3 段）；
- git：关闭时报 `E_NO_GIT`、非仓库报 `E_NOT_A_REPO`、合并自动提交、回滚到基线、坏提交报 `E_BAD_COMMIT`；
- 灵感 → 确认 → `1-raw` 的完整流转，`state()` 计数随之变化；
- 提案写入 → 合并 → 页面落 `2-wiki` → 提案删除 → 索引重建；
- Wiki 体检、清理临时文件、清理未用附件预览；
- 任务对账：开则建、关则删、名单外的任务一律不碰；
- 两个 bundle 的形状：宿主 `import()` 可加载且导出 `name/inject/Config/apply`；前端在沙箱里注册参数为 `{name:'conversation.view', id:'llm-wiki', order:60, label:'知识库'}`。

**未验证**（要装进 DSH 才能看）：

- 面板是否真出现在会话标签栏、3 秒轮询与三条路由的实际连通；
- `schedule.create` 是否真落进 DSH 任务页（目前只用假 schedule 测了对账逻辑）；
- `deferToAgent`（把"判断"类活交回模型）在真实会话里的行为。

**明确未实现**（都是设计上留的坑，不是 bug）：

- 面板上的任务自选项只有开关，没有可编辑的输入表单（`optionSpec` 数据已备好）；
- 新建任务只支持 daily/weekly + 时间，没有 cron 表达式与多选星期；
- 深链与官方 CLI 的差异只在 macOS 上实测过；Windows/Linux 走的是 `start` / `xdg-open` 同构路径，未实机验证；
- 图片（非 PDF 的扫描件）没有 OCR，只存档；
- RAG、协作发布：按 ROADMAP 属于永久非目标或后续规划。
- 同空间多库现在是"物理嵌套、逻辑独立"：Obsidian 一次只开一个 vault，切库后要从那个文件夹重新打开。

---

## 8. 文档

| 文件 | 作用 |
|---|---|
| `docs/PRD.md` | 开发契约 v0.4.0-dev：包布局 / 数据模型 / 六条不变式 / A01–A19 / J01–J10 / 6 工具 / 3 路由 / View 线框 / 算法 / 错误码 / 测试矩阵 / M0–M6 / 决策台账 |
| `docs/FEASIBILITY.md` | 对 DSH 源码逐项核对的能力判定，含两条事实性否定（无 PDF 解析、无音视频转写） |
| `docs/ROADMAP.md` | 分期与永久非目标 |

类型检查与回归脚本用的是你本机 DSH 检出里的 `tsc` / `tsx`（`@deepseek-ai/dsh-root 0.2.2-rc.3` 及以上）；只跑构建的话，`npm i` 就够了。

---

## 8.5 发布（维护者）

- **npm**：`dsh-plugin-llm-wiki`。仓库里的 `lib/` 是构建产物，已随仓库提交，`dsh plugin add github:…` 可直接装。
- **自动发布**：`.github/workflows/publish.yml` 用 npm 的 **trusted publishing（OIDC）**，CI 里不放 token。
  一次性配置：npmjs.com → 该包 → Settings → Trusted Publisher → GitHub Actions，填
  `Effortful-lion` / `dsh-plugin-llm-wiki` / `publish.yml`。之后推 `v*` 标签即自动发布。
- 首次发布新包名时，npm 会把版本先「暂存（staged）」：需要账号本人用 2FA 在网页上批准，
  或本地 `npm publish --otp=<6 位码>`。包里出现 `0.0.0-stage` 是 npm 的暂存占位，不是我们的版本。

## 9. License

MIT © 2026 [younglion](https://github.com/Effortful-lion)

> 说明：`lib/` 是构建产物（`npm run build` 由 `scripts/build.sh` 生成），为了能直接 `dsh plugin add github:…` 装而一并提交；改源码请改 `core/` `host/` `client/`，不要手改 `lib/`。
