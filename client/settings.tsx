/**
 * 设置页区块：注册到 DSH 的 `settings.section`，出现在「设置 → 插件 → LLM Wiki」。
 *
 * 三条设计约束：
 *
 * 1. **不做第二个控制台**。面板负责日常操作（收料、编译、裁决），设置页只放
 *    配置项本身。同一件事不在两处各放一个开关。
 * 2. **用宿主主题与排版**。这里借用 `--dsw-alias-*` 语义色与设置页的行式布局，
 *    看起来像 DSH 自己的一个设置区，而不是嵌进来的一个外来页面。
 * 3. **改完必须落盘**。保存走宿主 `/api/llm-wiki/config` → `configEditor`，
 *    写进 profile 的 `cordis.patch.yml` 再重载插件；页脚把那个文件路径显示出来，
 *    用户能自己核对"是不是真的同步到磁盘"。
 *
 * 知识空间与库路径早先是只读的，理由是"路径是锚点，改错会指向空目录"。
 * 可实际用起来，只读把人逼去手改 YAML——那才真容易改错。现在两项都可写，
 * 校验放在宿主（绝对路径、不许 `..`、存在性），错了就在这一页说清楚哪一条不对。
 */

import { useCallback, useEffect, useState } from 'react'

export interface PluginConfig {
  /** 知识空间：Obsidian 打开的那个工作目录。 */
  spacePath?: string
  /** 单库模式的库根（空间里还没记当前库时用它）。 */
  libraryPath?: string
  libraryName?: string
  writeMode?: string
  maxCandidates?: number
  gitEnabled?: boolean
  gitAutoCommit?: boolean
  audioProvider?: string
  audioMaxMinutes?: number
  audioChunkMinutes?: number
  debounceMs?: number
  watchLibrary?: boolean
  vaultName?: string
  /** 只读：宿主解析出来的当前库绝对路径，给用户一个"我在改哪个库"的锚点。 */
  resolvedLibraryPath?: string
  /** 只读：空间点文件里记的当前库名。 */
  activeLibrary?: string
}

const CSS = `
/* 设置页的层级只有三层，别再加：分区 → 设置项 → 解释。
   视觉上也只给三件事上色：分区标题的主题色小标、控件本身的边框、以及主按钮。
   其余全部靠字重、字号、发丝线和一个极淡的悬停底纹区分——设置页看着"花"比看着"平"更糟。 */
.lws{
  --s-ink:var(--dsw-alias-label-primary,#1c1c1e);
  --s-ink2:var(--dsw-alias-label-secondary,#5b5b60);
  --s-dim:var(--dsw-alias-label-caption,#8b8d98);
  --s-line:var(--dsw-alias-border-l4,rgba(0,0,0,.14));
  --s-line2:var(--dsw-alias-border-l5,rgba(0,0,0,.06));
  --s-accent:var(--dsw-alias-accent-primary,#6a5bf0);
  --s-accent-wash:color-mix(in srgb, var(--s-accent) 7%, transparent);
  --s-accent-line:color-mix(in srgb, var(--s-accent) 34%, transparent);
  --s-surface:var(--dsw-alias-bg-primary,transparent);
  --s-ok:var(--dsw-alias-state-success-primary,#186b3c);
  --s-warn:var(--dsw-alias-state-warn-label,#8a5300);
  --s-err:var(--dsw-alias-state-error-primary,#a1291b);
  display:flex;flex-direction:column;gap:14px;padding:2px 0 4px;font-size:12.5px;line-height:1.5;color:var(--s-ink);
}
.lws *{box-sizing:border-box}

/* 开场一句：说清这一页管什么、改完落在哪。 */
.lws-lede{font-size:12px;line-height:1.7;color:var(--s-dim);max-width:64ch;margin:0}

/* 分区 = 一张卡：标题一条、下面是设置项。卡与卡之间靠留白分开，不靠再套一层边框。 */
.lws-sec{
  border:1px solid color-mix(in srgb, var(--s-line) 55%, transparent);
  border-radius:12px;background:var(--s-surface);overflow:hidden;
  box-shadow:0 1px 2px rgba(20,18,45,.03);
}
.lws-h{
  display:flex;align-items:center;gap:8px;padding:11px 14px;margin:0;
  font-size:13px;font-weight:680;letter-spacing:.1px;
  background:linear-gradient(180deg,var(--s-accent-wash),transparent);
  border-bottom:1px solid var(--s-line2);
}
.lws-h::before{content:"";width:3px;height:12px;border-radius:2px;background:var(--s-accent);flex:0 0 auto}
.lws-h .d{font-weight:400;font-size:11px;color:var(--s-dim);letter-spacing:0}
.lws-h .flag{
  margin-left:auto;font-size:10px;font-weight:600;color:var(--s-accent);
  border:1px solid var(--s-accent-line);border-radius:999px;padding:1px 7px;line-height:1.5;
}

/* 一行设置项：左说明、右控件。解释放在说明下面，缩一号、退一级颜色。 */
.lws-row{display:flex;align-items:flex-start;gap:16px;padding:11px 14px;border-top:1px solid var(--s-line2);min-height:34px;transition:background .14s}
.lws-h+.lws-row,.lws-sec>.lws-row:first-child{border-top:0}
.lws-row:hover{background:color-mix(in srgb, var(--s-accent) 3.5%, transparent)}
.lws-row.vert{flex-direction:column;align-items:stretch;gap:8px}
.lws-lb{flex:1;min-width:0;color:var(--s-ink);font-weight:500;line-height:1.45}
.lws-lb small{display:block;font-size:11px;color:var(--s-dim);margin-top:3px;line-height:1.6;font-weight:400;letter-spacing:.1px}
.lws-ct{display:flex;align-items:center;gap:8px;flex:0 0 auto;flex-wrap:wrap;justify-content:flex-end}
.lws-ct.wide{flex:1 1 100%;justify-content:flex-start}

/* 控件：统一 30px 高、8px 圆角；输入用"浅内凹"而不是纯白，让它和卡片分开一层。 */
.lws-in{
  border:1px solid var(--s-line);border-radius:8px;
  background:color-mix(in srgb, var(--s-ink) 2.5%, var(--s-surface));
  color:var(--s-ink);font:inherit;font-size:12px;height:30px;padding:0 9px;min-width:84px;
  transition:border-color .14s,box-shadow .14s,background .14s;
}
.lws-in.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;letter-spacing:-.1px}
.lws-in.grow{flex:1 1 320px;min-width:0;width:100%}
select.lws-in{cursor:pointer;padding-right:6px}
.lws-in:hover:not(:disabled){border-color:var(--s-accent-line)}
.lws-in:focus{outline:none;background:var(--s-surface);border-color:var(--s-accent);box-shadow:0 0 0 3px var(--s-accent-wash)}
.lws-in:disabled{opacity:.5;cursor:not-allowed}
.lws-num{width:84px;text-align:right;font-variant-numeric:tabular-nums}
.lws-unit{font-size:11px;color:var(--s-dim);white-space:nowrap}

/* 按钮三档：primary 只有"保存"；普通操作中性；文本型给静默动作。 */
.lws-btn{
  appearance:none;border:1px solid var(--s-line);border-radius:8px;
  background:var(--s-surface);color:var(--s-ink2);font:inherit;font-size:12px;
  height:30px;padding:0 13px;cursor:pointer;white-space:nowrap;
  transition:border-color .14s,background .14s,color .14s;
}
.lws-btn:hover:not(:disabled){border-color:var(--s-accent-line);color:var(--s-ink);background:var(--s-accent-wash)}
.lws-btn:focus-visible{outline:2px solid var(--s-accent);outline-offset:2px}
.lws-btn.primary{
  background:var(--s-accent);border-color:var(--s-accent);color:#fff;font-weight:600;
  box-shadow:0 1px 2px rgba(60,44,160,.20),0 8px 18px -14px rgba(60,44,160,.65);
}
.lws-btn.primary:hover:not(:disabled){background:color-mix(in srgb, var(--s-accent) 92%, #000);border-color:transparent;color:#fff}
.lws-btn:disabled{opacity:.42;cursor:not-allowed}

/* 开关：比原来大一圈，两种状态用"实心 vs 空心"区分，不只靠颜色深浅。 */
.lws-sw{
  width:38px;height:21px;border-radius:999px;padding:0;cursor:pointer;flex:0 0 auto;
  border:1px solid var(--s-line);background:color-mix(in srgb, var(--s-ink) 8%, transparent);
  position:relative;transition:background .16s,border-color .16s;
}
.lws-sw i{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .16s}
.lws-sw.on{background:var(--s-accent);border-color:var(--s-accent)}
.lws-sw.on i{left:18px}
.lws-sw:focus-visible{outline:2px solid var(--s-accent);outline-offset:2px}
.lws-sw:disabled{opacity:.42;cursor:not-allowed}

/* 提示条：一条信息一行，左边一道同色竖条——颜色只表示结果，不表示装饰。 */
.lws-note{
  font-size:11.5px;line-height:1.6;padding:7px 11px;border-radius:8px;
  background:var(--dsw-alias-bg-secondary,rgba(0,0,0,.04));color:var(--s-ink2);
  border-left:2px solid var(--s-line);
}
.lws-note.warn{background:color-mix(in srgb, var(--s-warn) 10%, transparent);color:var(--s-warn);border-left-color:var(--s-warn)}
.lws-note.err{background:color-mix(in srgb, var(--s-err) 10%, transparent);color:var(--s-err);border-left-color:var(--s-err)}
.lws-note.ok{background:color-mix(in srgb, var(--s-ok) 10%, transparent);color:var(--s-ok);border-left-color:var(--s-ok)}

/* "当前在哪"：等宽字体一块底，读起来像终端里的一行事实，而不是正文。 */
.lws-anchor{
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.8;
  color:var(--s-dim);word-break:break-all;padding:9px 11px;border-radius:8px;
  background:color-mix(in srgb, var(--s-ink) 3%, var(--s-surface));
  border-left:2px solid var(--s-accent-line);
}
.lws-anchor b{color:var(--s-ink2);font-weight:600;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;font-size:11.5px}

/* 底部保存条：一条发丝线隔开，按钮沉到右下，提示独占一行。 */
.lws-foot{
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:10px 2px 0;border-top:1px solid var(--s-line2);margin-top:2px;
}
.lws-foot .lws-note{flex:1 1 100%}
.lws-foot .spacer{flex:1}
.lws-dirty{font-size:11.5px;color:var(--s-warn)}
.lws-disk{font-size:10.5px;line-height:1.75;color:var(--s-dim);word-break:break-all}
.lws-disk code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;color:var(--s-ink2)}
`

/**
 * 读配置。失败时带出**具体是哪一种失败**——都笼统写成"读不到"的话，
 * 用户没法判断该刷新页面、该重启 DSH，还是该去查插件有没有启用。
 */
async function getConfig(): Promise<{ config?: PluginConfig, configPath?: string, settingsPath?: string, problem?: string }> {
  let response: Response
  try {
    response = await fetch('/api/llm-wiki/config', { headers: { accept: 'application/json' }, cache: 'no-store' })
  } catch (error) {
    return { problem: `请求没发出去：${error instanceof Error ? error.message : String(error)}` }
  }
  if (response.status === 404) {
    return { problem: '宿主上没有 /api/llm-wiki/config 这条路由：插件已启用但路由没挂上。重启 DSH 后重试；若仍这样，说明跑的还是旧版插件代码。' }
  }
  if (response.status === 401 || response.status === 403) {
    return { problem: `宿主拒绝了这次读取（HTTP ${response.status}）：面板路由只对本机窗口开放，远端会话读不到。请在主机窗口打开设置页。` }
  }
  if (!response.ok) {
    return { problem: `宿主返回 HTTP ${response.status}。` }
  }
  const data = await response.json().catch(() => undefined) as
    { config?: PluginConfig, configPath?: string, settingsPath?: string } | undefined
  if (data?.config === undefined) return { problem: '宿主应答里没有 config 字段：插件可能刚重启，稍后重试。' }
  return {
    config: data.config,
    configPath: typeof data.configPath === 'string' ? data.configPath : '',
    settingsPath: typeof data.settingsPath === 'string' ? data.settingsPath : '',
  }
}

export function WikiSettings() {
  const [saved, setSaved] = useState<PluginConfig | undefined>(undefined)
  const [configPath, setConfigPath] = useState('')
  const [settingsPath, setSettingsPath] = useState('')
  const [draft, setDraft] = useState<PluginConfig>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'err', text: string } | undefined>(undefined)

  const reload = useCallback(async () => {
    const result = await getConfig()
    if (result.config === undefined) {
      setMessage({ tone: 'err', text: result.problem ?? '读不到插件配置。' })
      return
    }
    setSaved(result.config)
    setConfigPath(result.configPath ?? '')
    setSettingsPath(result.settingsPath ?? '')
    setMessage(undefined)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const set = useCallback(<K extends keyof PluginConfig>(key: K, value: PluginConfig[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }))
    setMessage(undefined)
  }, [])

  const value = <K extends keyof PluginConfig>(key: K): PluginConfig[K] =>
    (draft[key] !== undefined ? draft[key] : saved?.[key])

  const dirty = Object.keys(draft).length > 0

  const save = useCallback(async () => {
    if (!dirty) return
    setBusy(true)
    setMessage(undefined)
    try {
      const response = await fetch('/api/llm-wiki/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config: draft }),
      })
      const data = await response.json().catch(() => ({ ok: false })) as {
        ok: boolean
        persisted?: boolean
        error?: string
        config?: PluginConfig
        configPath?: string
        settingsPath?: string
        via?: 'profile' | 'settings'
        file?: string
        applied?: boolean
        pathsChanged?: boolean
        profileSynced?: boolean
        note?: string
      }
      // 保存被拒时**不要**清空草稿：用户填的值还在，改一处就能重试，
      // 不必从头再填一遍。
      if (!data.ok) {
        setMessage({ tone: 'err', text: data.error ?? `保存失败（HTTP ${response.status}）` })
        return
      }
      if (data.config !== undefined) setSaved(data.config)
      if (typeof data.configPath === 'string' && data.configPath !== '') setConfigPath(data.configPath)
      if (typeof data.settingsPath === 'string' && data.settingsPath !== '') setSettingsPath(data.settingsPath)
      setDraft({})
      if (data.persisted === false) {
        setMessage({ tone: 'err', text: data.error ?? '改动没写进磁盘。' })
        return
      }
      const file = typeof data.file === 'string' && data.file !== ''
        ? data.file
        : (data.via === 'profile' ? configPath : settingsPath)
      const head = `已写入 ${file}，${data.applied === false ? '重启后生效' : '已就地生效'}`
      const tail = data.pathsChanged === true ? '；当前库已切到新路径' : ''
      const mirror = data.profileSynced === true ? '；profile 配置也已同步' : ''
      const downgrade = data.profileSynced === false && typeof data.note === 'string' && data.note !== ''
        ? `（${data.note}）`
        : ''
      setMessage({ tone: 'ok', text: `${head}${tail}${mirror}。${downgrade}` })
    } catch (error) {
      setMessage({ tone: 'err', text: `保存失败：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setBusy(false)
    }
  }, [dirty, draft])

  if (saved === undefined) {
    return (
      <div className="lws">
        <style>{CSS}</style>
        <div className={`lws-note ${message === undefined ? '' : 'err'}`}>
          {message?.text ?? '正在读取插件配置…'}
        </div>
        {message === undefined ? null : (
          <div className="lws-foot">
            <button type="button" className="lws-btn" onClick={() => { setMessage(undefined); void reload() }}>重试</button>
          </div>
        )}
      </div>
    )
  }

  const row = (label: string, hint: string | undefined, control: React.ReactNode) => (
    <div className="lws-row">
      <div className="lws-lb">{label}{hint === undefined ? null : <small>{hint}</small>}</div>
      <div className="lws-ct">{control}</div>
    </div>
  )

  const pathRow = (key: 'spacePath' | 'libraryPath', placeholder: string) => (
    <div className="lws-row vert">
      <div className="lws-ct wide">
        <input
          className="lws-in mono grow"
          value={String(value(key) ?? '')}
          placeholder={placeholder}
          spellCheck={false}
          disabled={busy}
          onChange={event => set(key, event.target.value)}
        />
      </div>
    </div>
  )

  const toggle = (key: 'gitEnabled' | 'gitAutoCommit' | 'watchLibrary') => (
    <button
      type="button"
      role="switch"
      aria-checked={value(key) === true}
      aria-label={key}
      className={`lws-sw${value(key) === true ? ' on' : ''}`}
      disabled={busy}
      onClick={() => set(key, value(key) !== true)}
    ><i /></button>
  )

  const num = (key: 'maxCandidates' | 'audioMaxMinutes' | 'audioChunkMinutes' | 'debounceMs', min: number, max: number, step: number, unit: string) => (
    <>
      <input
        className="lws-in lws-num"
        type="number"
        min={min}
        max={max}
        step={step}
        value={String(value(key) ?? '')}
        disabled={busy}
        onChange={event => {
          const parsed = Number(event.target.value)
          set(key, Number.isFinite(parsed) ? parsed : min)
        }}
      />
      <span className="lws-unit">{unit}</span>
    </>
  )

  return (
    <div className="lws">
      <style>{CSS}</style>

      <p className="lws-lede">
        面板负责日常操作，这里放配置本身。所有改动都会写回 profile 的插件配置并重载插件，
        与磁盘上的那份始终是同一份。
      </p>

      <div className="lws-sec">
        <div className="lws-h">知识空间<span className="d">Obsidian 的工作目录；库是它下面的文件夹</span><span className="flag">可编辑</span></div>
        <div className="lws-lb">空间路径<small>换空间 = 换一批库。保存后插件重载，面板顶部的「打开知识库」跟着指向新空间里的当前库。</small></div>
        {pathRow('spacePath', '/Users/you/obsidian-workspace')}
        <div className="lws-lb" style={{ marginTop: 10 }}>单库模式的库路径<small>只在空间里还没记下当前库时兜底；平时留空即可。</small></div>
        {pathRow('libraryPath', '/Users/you/obsidian-workspace/llm-wiki')}
        <div className="lws-anchor">
          <b>当前库</b>　{saved.resolvedLibraryPath === undefined || saved.resolvedLibraryPath === '' ? '（还没定下来）' : saved.resolvedLibraryPath}
          {saved.activeLibrary === undefined || saved.activeLibrary === '' ? null : <>　·　记在空间里的名字：{saved.activeLibrary}</>}
        </div>
      </div>

      <div className="lws-sec">
        <div className="lws-h">写入与审批<span className="d">决定机器能自己走到哪一步</span></div>
        {row(
          '写入模式',
          'propose：页面先进 3-review 等你裁决；direct：agent 直接写 2-wiki',
          <select
            className="lws-in"
            value={String(value('writeMode') ?? 'propose')}
            disabled={busy}
            onChange={event => set('writeMode', event.target.value)}
          >
            <option value="propose">propose · 先出提案</option>
            <option value="direct">direct · 直接写库</option>
          </select>,
        )}
        {row(
          '检索候选上限',
          '一次最多返回多少条命中',
          num('maxCandidates', 1, 20, 1, '条'),
        )}
        {row(
          '库名',
          '面板与任务标题里显示的名字；不改变磁盘上的目录',
          <input
            className="lws-in"
            value={String(value('libraryName') ?? '')}
            disabled={busy}
            onChange={event => set('libraryName', event.target.value)}
          />,
        )}
      </div>

      <div className="lws-sec">
        <div className="lws-h">音视频<span className="d">长录音先切片再转写</span></div>
        {row(
          '转写通道',
          'none：只存档不转写；whisper：本机 whisper-cli；api：走远端接口',
          <select
            className="lws-in"
            value={String(value('audioProvider') ?? 'none')}
            disabled={busy}
            onChange={event => set('audioProvider', event.target.value)}
          >
            <option value="none">none · 不转写</option>
            <option value="whisper">whisper · 本机</option>
            <option value="api">api · 远端</option>
          </select>,
        )}
        {row('单文件上限', '超过这个长度的录音会被拒绝或切片', num('audioMaxMinutes', 5, 120, 1, '分钟'))}
        {row('切片长度', '每片转写完再拼起来', num('audioChunkMinutes', 2, 30, 1, '分钟'))}
      </div>

      <div className="lws-sec">
        <div className="lws-h">版本与监听<span className="d">出事了能不能退回去</span></div>
        {row(
          'git 回滚',
          '开启后每次合并是一个可回滚的 commit；要求库本身是 git 仓库',
          toggle('gitEnabled'),
        )}
        {row('合并后自动提交', undefined, toggle('gitAutoCommit'))}
        {row(
          '监听库目录',
          '库一有改动就自动重写 index.md，省掉手点「重建 Wiki 索引」',
          toggle('watchLibrary'),
        )}
        {row('防抖间隔', '连续多次改动合并成一次重建', num('debounceMs', 500, 5000, 100, '毫秒'))}
        {row(
          'Obsidian vault 名',
          '深链与客户端都用它；留空取库目录名',
          <input
            className="lws-in"
            value={String(value('vaultName') ?? '')}
            placeholder="留空 = 用目录名"
            disabled={busy}
            onChange={event => set('vaultName', event.target.value)}
          />,
        )}
      </div>

      <div className="lws-foot">
        {message === undefined ? null : <span className={`lws-note ${message.tone}`}>{message.text}</span>}
        <span className="spacer" />
        {dirty && message === undefined ? <span className="lws-dirty">有未保存的改动</span> : null}
        <button
          type="button"
          className="lws-btn"
          disabled={busy || !dirty}
          onClick={() => { setDraft({}); setMessage(undefined) }}
        >放弃</button>
        <button
          type="button"
          className="lws-btn primary"
          disabled={busy || !dirty}
          onClick={() => { void save() }}
        >{busy ? '保存中…' : '保存设置'}</button>
      </div>

      <div className="lws-disk">
        落盘位置
        <br />profile 配置：{configPath === '' ? '（宿主没报出 profile 路径，多半是 CLI 场景）' : <code>{configPath}</code>}
        <br />插件设置：{settingsPath === '' ? '（没有可写的 profile 目录）' : <code>{settingsPath}</code>}
        <br />两条都在磁盘上，重启之后仍然是保存的值；设置页优先写 profile，被 profile 的组合层挡住时写插件设置。
      </div>
    </div>
  )
}
