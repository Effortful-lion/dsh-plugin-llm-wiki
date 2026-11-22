/**
 * Obsidian 通道：**真的把库打开**，而不只是回一个 URI 让浏览器去跳。
 *
 * 早先的写法是「宿主返回 obsidian://open?vault=X，前端 window.location.href = uri」，
 * 在 Electron 壳里这一步经常什么都不发生——尤其当那个 vault 根本没在 Obsidian 里注册过时，
 * 系统会把 URL 交给 Obsidian，Obsidian 发现没这个 vault，静默回到原窗口。
 * 表现就是用户说的「打开知识库没有完成」。
 *
 * 所以这里做三件事：
 * 1. **注册**：把库目录写进 Obsidian 的 vault 清单（obsidian.json），写之前留一份备份。
 *    注册过之后 `obsidian://open?vault=<名字>` 才是确定能命中的。
 * 2. **唤起**：用系统命令打开深链（macOS `open`、Windows `start`、Linux `xdg-open`），
 *    Obsidian 没启动时这一步会把它拉起来。
 * 3. **兜底**：深链失败就把库目录直接交给 Obsidian（等价于「Open folder as vault」）。
 *
 * 仍是 0 token：全程是宿主里的几次 execFile，跟模型无关。
 */

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, normalize, relative, resolve, sep } from 'node:path'

/** Obsidian vault 名默认取库根目录名；用户也可以在配置里显式指定。 */
export function vaultNameOf(libraryPath: string, configured?: string): string {
  const clean = (configured ?? '').trim()
  return clean !== '' ? clean : basename(libraryPath)
}

/**
 * 把库内相对路径转成 obsidian:// 深链。
 * `2-wiki/concepts/x.md` → `obsidian://open?vault=brain&file=2-wiki%2Fconcepts%2Fx`
 * （Obsidian 的 file 参数不带 .md 扩展名也能定位）
 */
export function openUri(vault: string, relPath: string): string {
  const normalized = relPath.replace(/^\/+/, '').replace(/\.md$/i, '')
  const params = new URLSearchParams({ vault, file: normalized })
  return `obsidian://open?${params.toString()}`
}

/** 只开库、不指定文件：`obsidian://open?vault=brain`。 */
export function vaultUri(vault: string): string {
  return `obsidian://open?${new URLSearchParams({ vault }).toString()}`
}

/** 按绝对路径打开（Obsidian 会打开包含该路径的 vault）：`obsidian://open?path=...`。 */
export function pathUri(absolutePath: string): string {
  return `obsidian://open?${new URLSearchParams({ path: absolutePath }).toString()}`
}

// ─────────────────────────── vault 注册表 ───────────────────────────

/** Obsidian 的 vault 清单文件。三平台各一个位置，都是 Obsidian 自己写的。 */
export function registryPath(): string {
  const home = homedir()
  switch (process.platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json')
    case 'win32':
      return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'obsidian', 'obsidian.json')
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'obsidian', 'obsidian.json')
  }
}

interface RegistryVault { path: string, ts: number, open?: boolean }
interface Registry { vaults?: Record<string, RegistryVault>, [key: string]: unknown }

/** 比较路径用的规范形式：去尾斜杠、解析成绝对路径。 */
function canonical(path: string): string {
  const full = normalize(resolve(path)).replace(/[\\/]+$/, '')
  return process.platform === 'linux' ? full : full.toLowerCase()
}

function readRegistry(file: string): Registry {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Registry
    if (parsed === null || typeof parsed !== 'object') return {}
    if (parsed.vaults === undefined || parsed.vaults === null) parsed.vaults = {}
    return parsed
  } catch {
    return {}
  }
}

/** 在清单里找这个库；返回它的 vault id。找不到返回 undefined。 */
export function findVaultId(vaultPath: string): string | undefined {
  const file = registryPath()
  if (!existsSync(file)) return undefined
  const registry = readRegistry(file)
  const wanted = canonical(vaultPath)
  for (const [id, vault] of Object.entries(registry.vaults ?? {})) {
    if (typeof vault?.path === 'string' && canonical(vault.path) === wanted) return id
  }
  return undefined
}

export interface RegisterOutcome {
  /** vault id；注册成功或本来就存在时都有值。 */
  id: string
  /** 这次是不是新写进去的。 */
  changed: boolean
  /** 写文件前的备份路径（只在 changed 时有）。 */
  backup?: string
}

/**
 * 确保库目录在 Obsidian 的 vault 清单里。
 *
 * 幂等：已经在清单里就直接返回原 id，不碰文件。
 * 真要写时先复制一份 `obsidian.json.bak-<时间戳>`，写坏了还能手工恢复。
 */
export function registerVault(vaultPath: string): RegisterOutcome {
  const file = registryPath()
  const existing = findVaultId(vaultPath)
  if (existing !== undefined) return { id: existing, changed: false }

  const registry = readRegistry(file)
  const id = randomBytes(8).toString('hex')
  registry.vaults = {
    ...(registry.vaults ?? {}),
    [id]: { path: normalize(resolve(vaultPath)), ts: Date.now() },
  }

  const backup = `${file}.bak-${Date.now()}`
  try {
    mkdirSync(join(file, '..'), { recursive: true })
    if (existsSync(file)) copyFileSync(file, backup)
    writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
  } catch (error) {
    throw new Error(`写 Obsidian vault 清单失败（${file}）：${error instanceof Error ? error.message : String(error)}`)
  }
  return { id, changed: true, backup: existsSync(file) ? backup : undefined }
}

// ─────────────────────────── 进程与唤起 ───────────────────────────

/** Obsidian 客户端装没装。只做文件探测，不启动任何东西。 */
export function appInstalled(): boolean {
  const home = homedir()
  switch (process.platform) {
    case 'darwin':
      return existsSync('/Applications/Obsidian.app') || existsSync(join(home, 'Applications', 'Obsidian.app'))
    case 'win32':
      return existsSync(join(process.env.LOCALAPPDATA ?? '', 'Obsidian', 'Obsidian.exe'))
        || existsSync(join(process.env.PROGRAMFILES ?? '', 'Obsidian', 'Obsidian.exe'))
    default:
      return existsSync(registryPath()) || existsSync('/usr/bin/obsidian') || existsSync('/opt/Obsidian/obsidian')
  }
}

/** Obsidian 是否已经在跑。已跑时新写入的 vault 清单它看不到，要换一条打开路径。 */
export function isRunning(): Promise<boolean> {
  const [command, args] = process.platform === 'win32'
    ? ['tasklist', ['/FI', 'IMAGENAME eq Obsidian.exe']]
    : ['pgrep', ['-x', 'Obsidian']]
  return new Promise(resolvePromise => {
    execFile(command, args, { timeout: 3000 }, (error, stdout) => {
      if (error !== null) { resolvePromise(false); return }
      resolvePromise(process.platform === 'win32' ? /obsidian\.exe/i.test(stdout) : stdout.trim() !== '')
    })
  })
}

/** 把一条 URL 交给系统默认处理程序（`obsidian://…` 会路由到 Obsidian）。 */
function openUrl(url: string): Promise<void> {
  const [command, args] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]]
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { timeout: 8000 }, error => {
      if (error === null) resolvePromise()
      else reject(error)
    })
  })
}

/** 把库目录直接交给 Obsidian：等价于「Open folder as vault」，它会自己注册。 */
function openFolderWithApp(folder: string): Promise<void> {
  const [command, args] = process.platform === 'darwin'
    ? ['open', ['-a', 'Obsidian', folder]]
    : process.platform === 'win32'
      ? [join(process.env.LOCALAPPDATA ?? '', 'Obsidian', 'Obsidian.exe'), [folder]]
      : ['obsidian', [folder]]
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, { timeout: 10000 }, error => {
      if (error === null) resolvePromise()
      else reject(error)
    })
  })
}

// ─────────────────────────── 对外：打开一个库 ───────────────────────────

/**
 * 决定"该打开哪个 vault"。
 *
 * 触发这一层的实际问题：把库单独登记成 vault 之后，Obsidian 会给它一套**全新的**
 * `.obsidian`——你原来那个 vault 里的主题、字体、已装插件、快捷键、工作区布局
 * 全部不算数，看起来就像"个性化设置都没了"。
 *
 * 所以默认行为改成：**往上找最近的、已经带 `.obsidian` 的祖先目录**，
 * 打开那个 vault，再用 `file=` 深链定位到库这一层。这样沿用你原有的整套配置，
 * 库仍然是库（只是一个文件夹），而且不用改你 Obsidian 里的任何东西。
 *
 * 只有两种情况才把库自己当成 vault：
 * - 往上找不到任何已初始化的 vault（库是独立目录）；
 * - 配置里显式写了 `vaultName`，且它与外层 vault 的名字不同——那视为"我就是要单独开一个 vault"。
 */
export interface OpenTarget {
  /** 实际要打开（或登记）的 vault 目录。 */
  vaultPath: string
  /** 该 vault 的名字（Obsidian 清单里按目录名对应）。 */
  vaultName: string
  /** 深链。 */
  uri: string
  /** enclosing = 用外层 vault（保住个性化设置）；library = 库自己成 vault。 */
  mode: 'enclosing' | 'library'
  /** enclosing 模式下，库相对外层 vault 的位置（`llm-wiki`）。 */
  innerPath: string
}

function hasObsidianConfig(dir: string): boolean {
  return existsSync(join(dir, '.obsidian'))
}

/** 往上找最近的已初始化 vault；找不到返回 undefined。 */
export function enclosingVault(vaultPath: string): string | undefined {
  let current = resolve(vaultPath)
  for (let depth = 0; depth < 6; depth += 1) {
    const parent = dirname(current)
    if (parent === current) return undefined
    if (hasObsidianConfig(parent)) return parent
    current = parent
  }
  return undefined
}

/**
 * 解析打开目标。**纯函数**（只读文件系统探测），不启动任何东西——
 * 这样才能在测试里把"库 vs 外层 vault"的判断单独钉住。
 */
export function resolveOpenTarget(input: OpenInput): OpenTarget {
  const relPath = (input.relPath ?? '').trim()
  const outer = enclosingVault(input.vaultPath)
  const explicit = (input.explicitVaultName ?? '').trim()
  const outerName = outer === undefined ? '' : basename(outer)
  const wantsOwnVault = explicit !== '' && outerName !== '' && explicit !== outerName

  if (outer !== undefined && !wantsOwnVault) {
    const inner = relative(outer, resolve(input.vaultPath)).split(sep).join('/')
    const innerPath = inner === '' || inner === '.' ? '' : inner
    const file = [innerPath, relPath].filter(part => part !== '').join('/')
    return {
      vaultPath: outer,
      vaultName: outerName,
      uri: file === '' ? vaultUri(outerName) : openUri(outerName, file),
      mode: 'enclosing',
      innerPath,
    }
  }

  const name = vaultNameOf(input.vaultPath, explicit)
  return {
    vaultPath: input.vaultPath,
    vaultName: name,
    uri: relPath === '' ? vaultUri(name) : openUri(name, relPath),
    mode: 'library',
    innerPath: '',
  }
}

// ─────────────────────────── 对外：打开一个库 ───────────────────────────

export interface OpenOutcome {
  ok: boolean
  /** 实际走的通道：url=深链，cli=官方命令行，app=把目录交给客户端，none=没开成。 */
  via: 'url' | 'cli' | 'app' | 'none'
  /** 深链（前端展示、日志、手工兜底都用它）。 */
  uri: string
  /** 给用户看的一句话。 */
  note: string
  /** 这个库是不是这次才登记进 Obsidian 的。 */
  registered: boolean
  error?: { code: string, message: string }
}

export interface OpenInput {
  /** 库根目录的绝对路径。 */
  vaultPath: string
  /** vault 名的**解析结果**（可能已经退回目录名）。 */
  vaultName: string
  /**
   * 配置里**手写**的 vault 名（可能是空串）。
   *
   * 这两者必须分开：`vaultName` 永远是解析后的非空值，拿它判断"用户是不是指定了 vault"，
   * 会把默认情况（留空 → 退回目录名）误判成"用户要求单独开一个 vault"，
   * 于是永远走不到"用外层 vault"那条路——个性化设置看起来就又丢了。
   */
  explicitVaultName?: string
  /** 库内相对路径；空表示只开库。 */
  relPath?: string
}

/** 官方 CLI：`obsidian vault=<v> open path=<p>`。要求客户端已经在跑。 */
function cliOpen(vault: string, relPath: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile('obsidian', [`vault=${vault}`, 'open', `path=${relPath}`], { timeout: 8000 }, error => {
      if (error === null) resolvePromise()
      else reject(error)
    })
  })
}

/**
 * 打开知识库：登记 → 按"客户端在不在跑 / 这个库它认不认识 / 有没有指定文件"
 * 选一条真的能成的路。
 *
 * 三条路各自解决一个具体场景，顺序是有理由的：
 *
 * - **官方 CLI**（`obsidian`，客户端在跑才可用）：能同时指定 vault 与文件。
 *   客户端已经在跑时，它内存里还是启动时那份 vault 清单，刚登记的新 vault 它不认识，
 *   深链会被判成"找不到 vault"，而 CLI 是按名字直接命令它的，所以优先。
 * - **深链**（`obsidian://open`）：冷启动最准，但也只在 vault 已登记时成立。
 * - **把目录交给客户端**（`open -a Obsidian <dir>`）：等价于「Open folder as vault」，
 *   客户端会自己登记，代价是只到库这一层、精确不到文件。
 */
export async function openInObsidian(input: OpenInput): Promise<OpenOutcome> {
  const target = resolveOpenTarget(input)
  const relPath = (input.relPath ?? '').trim()
  /** 在 enclosing 模式下，深链里的文件路径要带上库这一层（`llm-wiki/2-wiki/x`）。 */
  const innerFile = [target.innerPath, relPath].filter(part => part !== '').join('/')

  if (!appInstalled()) {
    return {
      ok: false,
      via: 'none',
      uri: target.uri,
      note: '',
      registered: false,
      error: {
        code: 'E_NO_OBSIDIAN',
        message: '这台机器上没找到 Obsidian 客户端：装好 Obsidian 再点「打开知识库」，或者先手工打开一次这个文件夹。',
      },
    }
  }

  const known = findVaultId(target.vaultPath) !== undefined
  const running = await isRunning()
  let registered = known
  let registerNote = ''
  let registerError = ''
  try {
    const outcome = registerVault(target.vaultPath)
    registered = true
    // 只有"库自己成 vault"时才提登记：外层 vault 本来就是用户自己的，不该多嘴。
    if (outcome.changed && target.mode === 'library') registerNote = '已把这个库登记到 Obsidian'
  } catch (error) {
    registerError = error instanceof Error ? error.message : String(error)
  }

  const where = target.mode === 'enclosing'
    ? `${target.vaultName}（沿用它的外观与插件设置）`
    : target.vaultName

  const succeed = (via: OpenOutcome['via'], note: string): OpenOutcome => ({
    ok: true,
    via,
    uri: target.uri,
    registered,
    note: [note, registerNote].filter(Boolean).join('；'),
  })

  type Attempt = { via: OpenOutcome['via'], run: () => Promise<void>, note: string }
  const attempts: Attempt[] = []

  if (running && innerFile !== '') {
    attempts.push({ via: 'cli', run: () => cliOpen(target.vaultName, innerFile), note: `已在 Obsidian 打开 ${target.vaultName} › ${innerFile}` })
  }
  if (known) {
    attempts.push({ via: 'url', run: () => openUrl(target.uri), note: `已在 Obsidian 打开 ${where}` })
  }
  if (running && innerFile === '') {
    attempts.push({
      via: 'app',
      run: () => openFolderWithApp(target.mode === 'enclosing' ? target.vaultPath : input.vaultPath),
      note: `已让 Obsidian 打开 ${where}`,
    })
  }
  if (!known) {
    attempts.push({ via: 'url', run: () => openUrl(target.uri), note: `已在 Obsidian 打开 ${where}` })
  }
  if (innerFile !== '') {
    // 客户端刚才没跑：上面已经把 vault 打开/登记过了，这里再补一次精确到文件。
    attempts.push({
      via: 'app',
      run: () => openFolderWithApp(target.mode === 'enclosing' ? target.vaultPath : input.vaultPath),
      note: `已让 Obsidian 打开 ${where}`,
    })
    attempts.push({ via: 'cli', run: () => cliOpen(target.vaultName, innerFile), note: `已在 Obsidian 打开 ${target.vaultName} › ${innerFile}` })
  } else if (!running) {
    attempts.push({
      via: 'app',
      run: () => openFolderWithApp(target.mode === 'enclosing' ? target.vaultPath : input.vaultPath),
      note: `已让 Obsidian 打开 ${where}`,
    })
  }

  for (const attempt of attempts) {
    try {
      await attempt.run()
      return succeed(attempt.via, attempt.note)
    } catch {
      continue
    }
  }

  return {
    ok: false,
    via: 'none',
    uri: target.uri,
    registered,
    note: '',
    error: {
      code: 'E_LAUNCH_FAILED',
      message: registerError === ''
        ? '没能唤起 Obsidian：系统拒绝了打开命令。可以手工打开 Obsidian，再点一次这个按钮。'
        : `没能唤起 Obsidian：${registerError}`,
    },
  }
}

// ─────────────────────────── obsidian-cli（可选） ───────────────────────────

export interface ObsidianCli {
  binary: string
  /** `obsidian-cli open --vault <v> <note>`；失败时抛错，调用方降级到 URI。 */
  open(vault: string, relPath: string): Promise<void>
}

async function probeBinary(binary: string): Promise<boolean> {
  return new Promise(resolvePromise => {
    execFile(binary, ['--help'], { timeout: 4000 }, error => {
      // --help 退出码非 0 也算"存在"，只排除 ENOENT。
      resolvePromise(error === null || (error as NodeJS.ErrnoException | null)?.code !== 'ENOENT')
    })
  })
}

/**
 * 探测本机 `obsidian-cli`。
 * 只认第三方 `obsidian-cli`：官方 `obsidian` 命令要求客户端已经在跑，
 * 拿它当"有 CLI 能力"会让面板显示一个用不上的状态。
 */
export async function detectCli(): Promise<ObsidianCli | undefined> {
  for (const binary of ['obsidian-cli']) {
    if (!(await probeBinary(binary))) continue
    return {
      binary,
      open: (vault, relPath) => new Promise((resolvePromise, reject) => {
        const note = relPath.replace(/^\/+/, '').replace(/\.md$/i, '')
        execFile(binary, ['open', '--vault', vault, note], error => {
          if (error !== null) reject(error)
          else resolvePromise()
        })
      }),
    }
  }
  return undefined
}
