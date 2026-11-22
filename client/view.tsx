/**
 * 会话标签「知识库」= 超级大脑面板。
 *
 * 三条职责，别的一概不做：
 *   1. 让人一眼知道「这个库现在什么状态」；
 *   2. 把素材收进来（灵感 / 文件），并在这里裁决是否入库；
 *   3. 把需要判断的活交给 agent，需要机械执行的活自己干完。
 *
 * 数据全部来自宿主 `/api/llm-wiki/state`（0 token，3 秒轮询）；
 * 按钮全部是 `/api/llm-wiki/action` 的一次 POST。正文永远留在库里，由 Obsidian 打开。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface LibraryInfo { name: string, path: string, initialized: boolean }
export interface InboxItem { slug: string, rel: string, title: string, updated: string, kind: string, origin?: string }
export interface ProposalItem { path: string, target: string, action: string, reason: string, generatedAt: string }
export interface CommitInfo { hash: string, date: string, subject: string }
export interface JobItem {
  id: string, name: string, why: string, kind: string, action: string, cost: string
  options: Record<string, unknown>
  optionSpec: { key: string, label: string, type: string, min?: number, max?: number, hint?: string }[]
  enabled: boolean
  taskId: string | null
  status: string
}
export interface StatePayload {
  ok: boolean
  initialized: boolean
  library: { path: string, name: string }
  space: { path: string, active: string, libraries: LibraryInfo[] }
  mode: { git: boolean, audio: string }
  git: { enabled: boolean, commits: CommitInfo[] }
  scheduleAvailable: boolean
  counts: { wiki: number, stub: number, active: number, contested: number, deprecated: number, raw: number, inbox: number, proposals: number, orphan: number }
  health: number
  findings: { error: number, warn: number, info: number }
  occupancy: { attachments: number, parts: number, backup: number, trash: number, total: number }
  inbox: InboxItem[]
  proposals: ProposalItem[]
  pages: { id: string, title: string, status: string, domain: string, inbound: number, updated: string }[]
  tasks: { builtin: JobItem[], custom: { id: string, title: string, status: string }[], suspects: { id: string, title: string, status: string }[] }
  obsidian: { vault: string, cli: boolean }
}

const EMPTY: StatePayload = {
  ok: false,
  initialized: true,
  library: { path: '', name: '' },
  space: { path: '', active: '', libraries: [] },
  mode: { git: false, audio: 'none' },
  git: { enabled: false, commits: [] },
  scheduleAvailable: false,
  counts: { wiki: 0, stub: 0, active: 0, contested: 0, deprecated: 0, raw: 0, inbox: 0, proposals: 0, orphan: 0 },
  health: 100,
  findings: { error: 0, warn: 0, info: 0 },
  occupancy: { attachments: 0, parts: 0, backup: 0, trash: 0, total: 0 },
  inbox: [],
  proposals: [],
  pages: [],
  tasks: { builtin: [], custom: [], suspects: [] },
  obsidian: { vault: '', cli: false },
}

/**
 * 面板样式。只用 `--dsw-alias-*` 语义 token，跟随宿主深浅色；
 * 数值 token 缺失时才落到括号里的兜底值。
 *
 * 排版取向：这是一块"工作台"，不是落地页——信息密度高、留白克制、
 * 层级靠字重与分隔线建立，不靠投影和渐变。
 */
const CSS = `
/* 主题层。
   取向：一块"工作台"——信息密度高、层级靠字重与细线建立；底色给一层极淡的
   主题色晕染，让白卡片有地方浮起来，而不是整屏一张白纸。
   全部走 --dsw-alias-* 语义 token，跟随宿主深浅色；token 缺失时才落到兜底值。 */
.lw{
  --lw-ink:var(--dsw-alias-label-primary,#1b1a2a);
  --lw-ink2:var(--dsw-alias-label-secondary,#403d58);
  --lw-dim:var(--dsw-alias-label-caption,#6f6c87);
  --lw-line:var(--dsw-alias-border-l4,rgba(122,106,196,.16));
  --lw-line2:var(--dsw-alias-border-l5,rgba(122,106,196,.09));
  /* 语义色一律取宿主的状态 token：深浅色由 DSH 决定，这里不再自己判断主题。
     底色/描边用 color-mix 从同一个颜色推出来，不会出现"深色模式里一坨深棕"。 */
  --lw-accent:var(--dsw-alias-accent-primary,#6a5bf0);
  --lw-accent-wash:color-mix(in srgb, var(--lw-accent) 7%, transparent);
  --lw-accent-line:color-mix(in srgb, var(--lw-accent) 34%, transparent);
  --lw-surface:var(--dsw-alias-bg-primary,#fff);
  --lw-ok:var(--dsw-alias-state-success-primary,#12784a);
  --lw-ok-wash:color-mix(in srgb, var(--lw-ok) 11%, transparent);
  --lw-ok-line:color-mix(in srgb, var(--lw-ok) 34%, transparent);
  --lw-warn:var(--dsw-alias-state-warn-label,#8a5a05);
  --lw-warn-wash:color-mix(in srgb, var(--lw-warn) 13%, transparent);
  --lw-danger:var(--dsw-alias-state-error-primary,#b02a1c);
  --lw-danger-wash:color-mix(in srgb, var(--lw-danger) 9%, transparent);
  --lw-danger-line:color-mix(in srgb, var(--lw-danger) 32%, transparent);
  --lw-shadow:0 1px 2px rgba(20,18,45,.045),0 14px 30px -28px rgba(20,18,45,.55);
  display:flex;flex-direction:column;gap:12px;padding:16px 16px 26px;height:100%;overflow-y:auto;box-sizing:border-box;
  font-size:13px;line-height:1.5;color:var(--lw-ink);
  background:
    radial-gradient(120% 70% at 0% -20%, var(--lw-accent-wash), transparent 62%),
    radial-gradient(90% 60% at 100% 0%, rgba(96,150,220,.05), transparent 60%);
}
.lw *{box-sizing:border-box}
.lw-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}

/* 顶部：库身份。左侧一道主题色竖条做锚点，不做大标题堆叠。 */
.lw-top{
  position:relative;display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;padding:15px 16px 15px 18px;
  border:1px solid var(--lw-line);border-radius:14px;background:var(--lw-surface);box-shadow:var(--lw-shadow);overflow:hidden;
}
.lw-top::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:linear-gradient(180deg,var(--lw-accent),rgba(106,91,240,.35))}
.lw-top::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,var(--lw-accent-wash),transparent 46%)}
.lw-top>*{position:relative;z-index:1}
.lw-top .who{flex:1;min-width:230px}
.lw-top h1{margin:0;font-size:16.5px;font-weight:700;letter-spacing:.15px;line-height:1.35}
.lw-top .sub{margin-top:4px;font-size:11.5px;color:var(--lw-ink2);line-height:1.55}
.lw-top .where{margin-top:6px;font-size:10.5px;color:var(--lw-dim);word-break:break-all}
.lw-top .acts{display:flex;gap:7px;align-items:center;flex-wrap:wrap}

/* 卡片 */
.lw-card{border:1px solid var(--lw-line);border-radius:13px;background:var(--lw-surface);box-shadow:var(--lw-shadow);overflow:hidden}
.lw-chead{
  display:flex;align-items:baseline;gap:8px;padding:11px 15px;flex-wrap:wrap;
  border-bottom:1px solid var(--lw-line2);
  background:linear-gradient(180deg,var(--lw-accent-wash),transparent);
}
.lw-chead h2{margin:0;font-size:12.5px;font-weight:680;letter-spacing:.1px}
.lw-chead .why{font-size:10.5px;color:var(--lw-dim);line-height:1.4}
.lw-spacer{flex:1}
.lw-badge{font-size:12px;font-weight:700;color:var(--lw-accent);font-variant-numeric:tabular-nums}
.lw-badge span{font-weight:400;font-size:10px;color:var(--lw-dim);margin-left:3px}

/* 按钮：四档语义。
   neutral = 次要动作；primary = 当前页的主动作；go = 建设性裁决（入库/合并/启用）；
   danger = 不可逆（删除）；run 是 go 的轻量版本，用在"启用"这类开关上。 */
.lw-btn{
  appearance:none;border:1px solid var(--lw-line);background:var(--lw-surface);color:var(--lw-ink2);
  font:inherit;font-size:12px;padding:6px 12px;min-height:30px;border-radius:8px;cursor:pointer;white-space:nowrap;
  transition:background .15s,border-color .15s,color .15s,box-shadow .15s;
}
.lw-btn:hover:not(:disabled){border-color:var(--lw-accent-line);background:var(--lw-accent-wash);color:var(--lw-ink)}
.lw-btn:active:not(:disabled){box-shadow:inset 0 1px 2px rgba(20,18,45,.10)}
.lw-btn:focus-visible{outline:2px solid var(--lw-accent);outline-offset:2px}
.lw-btn:disabled{opacity:.4;cursor:not-allowed}
.lw-btn.primary{
  background:var(--lw-accent);border-color:var(--lw-accent);color:#fff;font-weight:600;
  box-shadow:0 1px 2px rgba(60,44,160,.22),0 8px 18px -14px rgba(60,44,160,.7);
}
.lw-btn.primary:hover:not(:disabled){background:color-mix(in srgb,var(--lw-accent) 92%,#000);border-color:transparent;color:#fff}
.lw-btn.mini{font-size:11.5px;padding:4px 10px;min-height:26px;border-radius:7px}
.lw-btn.go{color:var(--lw-ok);border-color:var(--lw-ok-line);background:var(--lw-ok-wash);font-weight:600}
.lw-btn.go:hover:not(:disabled){background:color-mix(in srgb, var(--lw-ok) 16%, transparent);border-color:color-mix(in srgb, var(--lw-ok) 48%, transparent);color:var(--lw-ok)}
.lw-btn.run{color:var(--lw-ok);border-color:var(--lw-ok-line);background:transparent;font-weight:600}
.lw-btn.run:hover:not(:disabled){background:var(--lw-ok-wash);border-color:color-mix(in srgb, var(--lw-ok) 48%, transparent)}
.lw-btn.danger{color:var(--lw-danger);border-color:var(--lw-danger-line);background:transparent}
.lw-btn.danger:hover:not(:disabled){background:var(--lw-danger-wash);border-color:color-mix(in srgb, var(--lw-danger) 48%, transparent);color:var(--lw-danger)}
.lw-btn.tile{
  min-height:36px;height:auto;width:100%;justify-content:center;font-weight:560;background:var(--lw-surface);
  white-space:normal;line-height:1.35;padding:7px 8px;text-align:center;
}
.lw-btn.tile:hover:not(:disabled){background:var(--lw-accent-wash)}
.lw-select{
  border:1px solid var(--lw-line);background:var(--lw-surface);color:var(--lw-ink2);border-radius:8px;
  padding:5px 9px;font:inherit;font-size:12px;cursor:pointer;max-width:190px;transition:border-color .15s;
}
.lw-select:hover{border-color:var(--lw-accent-line)}
.lw-select:focus-visible{outline:2px solid var(--lw-accent);outline-offset:2px}

/* 主体两列 */
.lw-grid{display:grid;grid-template-columns:minmax(0,1.04fr) minmax(0,.96fr);gap:12px;align-items:stretch}
.lw-col{display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0}
.lw-col.fill > .lw-queue{flex:1 1 0;height:auto;min-height:200px}

/* 状态：数字先行，格子之间用细线分隔，不靠边框堆盒子 */
.lw-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px 0;padding:13px 8px 6px}
.lw-stat{padding:4px 10px;min-width:0}
.lw-stat+.lw-stat{border-left:1px solid var(--lw-line2)}
/* 每行第一个格子不要竖线：4 列时是 5/9 号，3 列时是 4/7 号，2 列时是 3/5 号。 */
.lw-stat:nth-child(4n+1){border-left:0}
.lw-stat .k{font-size:10.5px;color:var(--lw-dim);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lw-stat .v{font-size:18px;font-weight:700;line-height:1.3;letter-spacing:-.3px;font-variant-numeric:tabular-nums;margin-top:2px}
.lw-stat .v small{font-size:10px;font-weight:400;color:var(--lw-dim);margin-left:2px;letter-spacing:0}
.lw-stat.warn .v{color:var(--lw-warn)}
.lw-stat.warn .k{color:var(--lw-warn);opacity:.92}
.lw-stat.ok .v{color:var(--lw-ok)}
.lw-bar{margin-top:6px;height:4px;border-radius:3px;background:var(--lw-ok-wash);overflow:hidden}
.lw-bar i{display:block;height:100%;border-radius:3px;background:var(--lw-ok);opacity:.85;transition:width .3s}
.lw-statsub{display:flex;gap:10px;flex-wrap:wrap;padding:9px 15px 13px;font-size:10.5px;color:var(--lw-dim);border-top:1px solid var(--lw-line2);margin-top:8px}
.lw-statsub .sep{width:1px;height:9px;background:var(--lw-line);align-self:center}

/* 收料：tab */
.lw-tabs{display:flex;gap:2px;padding:0 11px;border-bottom:1px solid var(--lw-line2)}
.lw-tab{
  appearance:none;border:0;background:transparent;font:inherit;font-size:11.5px;color:var(--lw-dim);
  padding:10px 10px;min-height:34px;cursor:pointer;position:relative;transition:color .15s;
}
.lw-tab:hover{color:var(--lw-ink2)}
.lw-tab:focus-visible{outline:2px solid var(--lw-accent);outline-offset:-2px;border-radius:6px}
.lw-tab.on{color:var(--lw-ink);font-weight:650}
.lw-tab.on::after{content:"";position:absolute;left:7px;right:7px;bottom:-1px;height:2px;background:var(--lw-accent);border-radius:2px}
.lw-pane{padding:12px 15px 14px;display:flex;flex-direction:column;gap:9px}
.lw-note{
  width:100%;border:1px solid var(--lw-line);border-radius:9px;background:var(--lw-surface);color:var(--lw-ink);
  font:inherit;font-size:12px;padding:9px 10px;resize:vertical;min-height:74px;line-height:1.6;transition:border-color .15s,box-shadow .15s;
}
.lw-note::placeholder{color:var(--lw-dim)}
.lw-note:focus{outline:none;border-color:var(--lw-accent-line);box-shadow:0 0 0 3px rgba(106,91,240,.10)}
.lw-row{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
/* 单行输入复用 textarea 的观感，但不允许换行撑高 */
/* 单行输入：在 .lw-row（横向）里按比例伸缩，在 .lw-pane（纵向）里占满一行且不撑高。
   早先只写了 flex:1 1 200px，放进纵向容器就变成了"高度 200px"，输入框会胀成一块砖。 */
.lw-name{min-height:0;height:32px;padding:5px 9px;width:100%;flex:0 0 auto;font-size:12px}
.lw-row>.lw-name{flex:1 1 200px;width:auto;min-width:140px}
.lw-check{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--lw-ink2);white-space:nowrap;cursor:pointer;user-select:none}
.lw-check input{accent-color:var(--lw-accent);width:13px;height:13px;margin:0;cursor:pointer}
/* 新建任务表单：整块给一层浅底，和下面的任务行区分开 */
.lw-form{background:var(--dsw-alias-bg-secondary,#faf9ff);border-bottom:1px solid var(--lw-line2)}
/* 星期胶囊：选中的那一颗要一眼看出来，未选保持中性 */
.lw-dow{appearance:none;border:1px solid var(--lw-line);background:var(--lw-surface);color:var(--lw-dim);font:inherit;font-size:11.5px;width:26px;height:26px;border-radius:7px;cursor:pointer;transition:background .14s,border-color .14s,color .14s}
.lw-dow:hover{border-color:var(--lw-accent-line);color:var(--lw-ink2)}
.lw-dow.on{background:var(--lw-accent);border-color:var(--lw-accent);color:#fff;font-weight:650}
.lw-dow:focus-visible{outline:2px solid var(--lw-accent);outline-offset:2px}
.lw-btn.quiet{background:transparent;border-color:transparent;color:var(--lw-dim);padding:4px 2px;min-height:24px}
.lw-btn.quiet:hover:not(:disabled){background:transparent;border-color:transparent;color:var(--lw-accent);text-decoration:underline}
.lw-hint{font-size:10.5px;color:var(--lw-dim);line-height:1.5}
.lw-drop{
  border:1.5px dashed var(--lw-accent-line);border-radius:11px;background:var(--lw-accent-wash);
  padding:18px 13px;text-align:center;cursor:pointer;transition:background .15s,border-color .15s;
}
.lw-drop:hover,.lw-drop.over{background:color-mix(in srgb, var(--lw-accent) 12%, transparent);border-color:var(--lw-accent)}
.lw-drop .t{font-size:12.5px;font-weight:620}
.lw-drop .d{font-size:10.5px;color:var(--lw-dim);margin-top:4px;line-height:1.55}

/* 整理 */
.lw-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:13px 15px}
.lw-tfoot{padding:9px 15px;border-top:1px solid var(--lw-line2);font-size:10.5px;color:var(--lw-dim);line-height:1.55}

/* 队列：固定高度，装不下在框内滚，头尾钉住 */
.lw-queue{display:flex;flex-direction:column;height:286px;min-height:0}
.lw-queue .lw-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.lw-queue .lw-scroll::-webkit-scrollbar{width:8px}
.lw-queue .lw-scroll::-webkit-scrollbar-thumb{background:var(--lw-line);border-radius:4px}
.lw-queue .lw-scroll::-webkit-scrollbar-thumb:hover{background:var(--lw-dim)}
.lw-queue .lw-scroll::-webkit-scrollbar-track{background:transparent}
.lw-queue .lw-void{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:18px;text-align:center}
.lw-void .t{font-size:12px;color:var(--lw-ink2);font-weight:620}
.lw-void .d{font-size:11px;color:var(--lw-dim);line-height:1.6;max-width:32ch}
.lw-q{display:flex;gap:10px;align-items:center;padding:10px 15px;font-size:12px;transition:background .15s}
.lw-q+.lw-q{border-top:1px solid var(--lw-line2)}
.lw-q:hover{background:var(--lw-accent-wash)}
.lw-q .body{flex:1;min-width:0}
.lw-q .n{display:block;font-weight:620;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lw-q .m{display:block;font-size:10.5px;color:var(--lw-dim);margin-top:1px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lw-q .acts{display:flex;gap:6px;flex:0 0 auto;align-items:center}
.lw-qfoot{display:flex;align-items:center;gap:8px;padding:8px 15px;border-top:1px solid var(--lw-line2);font-size:10.5px;color:var(--lw-dim)}

/* 任务行：开着的任务整行带底纹 + 左侧主题色标记；停用后标记与底纹一起消失，
   只剩灰掉的字。这样"哪些在跑"是扫一眼就知道的，而不用读按钮文案。 */
.lw-task{
  position:relative;display:grid;grid-template-columns:minmax(0,1fr) 92px auto;gap:10px;align-items:center;
  padding:9px 15px 9px 17px;font-size:12px;transition:background .15s;
}
.lw-task+.lw-task{border-top:1px solid var(--lw-line2)}
.lw-task::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0;background:transparent;transition:background .15s}
.lw-task.on{background:color-mix(in srgb, var(--lw-accent) 9%, transparent)}
.lw-task.on::before{background:var(--lw-accent)}
.lw-task:hover{background:color-mix(in srgb, var(--lw-accent) 12%, transparent)}
.lw-task .n{display:block;font-weight:620;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lw-task .m{display:block;font-size:10.5px;color:var(--lw-dim);margin-top:1px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lw-task.off{background:transparent}
.lw-task.off::before{background:var(--lw-line2)}
.lw-task.off .n{color:var(--lw-dim);font-weight:500}
.lw-task.off .m{opacity:.85}
.lw-task .when{font-size:10px;color:var(--lw-dim);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.lw-task .acts{display:flex;gap:6px;justify-content:flex-end}

/* 提示 */
.lw-banner{font-size:11.5px;padding:7px 11px;border-radius:8px;background:var(--lw-accent-wash);color:var(--lw-ink2);border:1px solid var(--lw-line2)}
.lw-err{font-size:11.5px;padding:7px 11px;border-radius:8px;background:var(--lw-danger-wash);color:var(--lw-danger);white-space:pre-wrap;line-height:1.5;border:1px solid var(--lw-danger-line)}
.lw-okb{font-size:11.5px;padding:7px 11px;border-radius:8px;background:var(--lw-ok-wash);color:var(--lw-ok);border:1px solid var(--lw-ok-line)}
.lw-instr{font-size:11px;color:var(--lw-dim);white-space:pre-wrap;max-height:150px;overflow-y:auto;line-height:1.6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}

/* 未初始化：只给一件事做 */
.lw-boot{display:flex;flex-direction:column;gap:10px;padding:20px 18px;border:1px solid var(--lw-line);border-radius:14px;background:var(--lw-surface);box-shadow:var(--lw-shadow)}
.lw-boot h1{margin:0;font-size:15px;font-weight:700}
.lw-boot p{margin:0;font-size:12px;color:var(--lw-dim);line-height:1.6}
.lw-boot .path{font-size:10.5px;color:var(--lw-dim);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}

@media (max-width:880px){
  .lw-grid{grid-template-columns:1fr}
  .lw-stats{grid-template-columns:repeat(3,minmax(0,1fr))}
  .lw-stat:nth-child(4n+1){border-left:1px solid var(--lw-line2)}
  .lw-stat:nth-child(3n+1){border-left:0}
}
@media (max-width:600px){
  .lw{padding:12px 12px 20px}
  .lw-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lw-stat:nth-child(3n+1){border-left:1px solid var(--lw-line2)}
  .lw-stat:nth-child(2n+1){border-left:0}
  .lw-tools{grid-template-columns:repeat(2,minmax(0,1fr))}
  .lw-task{grid-template-columns:minmax(0,1fr) auto}
  .lw-task .when{display:none}
  .lw-top .acts{width:100%}
  .lw-top .acts .lw-btn,.lw-top .acts .lw-select{flex:1}
}
@media (prefers-reduced-motion:reduce){
  .lw-bar i,.lw-drop,.lw-btn,.lw-task,.lw-q{transition:none}
}
`

async function postJson(url: string, body: unknown): Promise<{ ok: boolean, error?: { code: string, message: string }, [key: string]: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.status === 403) {
    return { ok: false, error: { code: 'E_ROUTE_FORBIDDEN', message: '这个窗口读不到宿主（远端会话）：请在主机窗口操作，或让 agent 用 wiki_action 执行。' } }
  }
  return await response.json() as { ok: boolean, error?: { code: string, message: string } }
}

async function callAction(action: string, params: Record<string, unknown> = {}): Promise<{ ok: boolean, error?: { code: string, message: string }, instruction?: string, detail?: unknown }> {
  return await postJson('/api/llm-wiki/action', { action, params }) as { ok: boolean, error?: { code: string, message: string }, instruction?: string, detail?: unknown }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** `0-inbox/notes/foo.md` → `0-inbox/notes`，给队列行做来源标注。 */
function dirOf(rel: string): string {
  const cut = rel.lastIndexOf('/')
  return cut < 0 ? rel : rel.slice(0, cut)
}

const KIND_LABEL: Record<string, string> = {
  note: '灵感笔记',
  upload: '文件上传',
  collect: '采集',
  manual: '手工',
}

/** 一次上传最多带多少个文件：再多就该走批量脚本，而不是一次点 500 个请求。 */
const MAX_UPLOAD_FILES = 200

/** 一条待上传的文件：file 本体 + 相对路径（整目录上传时形如 book/ch1/a.md）。 */
interface UploadEntry { file: File, rel: string }

/** macOS 的 .DS_Store / __MACOSX 之类：传上去只会变成噪音素材。 */
function isJunkUpload(rel: string): boolean {
  const segments = rel.split('/').filter(Boolean)
  const name = segments.at(-1) ?? ''
  if (name === '' || name.startsWith('.')) return true
  if (name === 'Thumbs.db' || name === 'desktop.ini') return true
  return segments.includes('__MACOSX')
}

/** ISO 星期：1=周一 … 7=周日，与 DSH ScheduleTiming 的 weekdays 对齐。 */
const DOW = [
  { value: 1, label: '一' },
  { value: 2, label: '二' },
  { value: 3, label: '三' },
  { value: 4, label: '四' },
  { value: 5, label: '五' },
  { value: 6, label: '六' },
  { value: 7, label: '日' },
] as const

/** 把当前表单翻成一句人话，让人在点"创建"之前就能核对时间。 */
function ruleLabel(task: { frequency: string, time: string, weekdays: number[], everyDays: number, monthDay: number }): string {
  if (task.frequency === 'weekly') {
    if (task.weekdays.length === 0) return '每周：还没选周几'
    const names = task.weekdays.map(day => DOW.find(item => item.value === day)?.label ?? String(day)).join('、')
    return `每周 ${names} ${task.time}`
  }
  if (task.frequency === 'interval') return `每隔 ${task.everyDays} 天 ${task.time}`
  if (task.frequency === 'monthly') {
    return task.monthDay === -1 ? `每月最后一天 ${task.time}` : `每月 ${task.monthDay} 日 ${task.time}`
  }
  return `每天 ${task.time}`
}

export function WikiPanel() {
  const [state, setState] = useState<StatePayload>(EMPTY)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState('')
  const [tab, setTab] = useState<'note' | 'drop'>('note')
  const [draft, setDraft] = useState('')
  const [over, setOver] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [deepCandidates, setDeepCandidates] = useState<{ rel: string, reason: string }[]>([])
  const [showNewLibrary, setShowNewLibrary] = useState(false)
  const [newLibraryName, setNewLibraryName] = useState('')
  const [openAfterCreate, setOpenAfterCreate] = useState(true)
  const [showNewTask, setShowNewTask] = useState(false)
  const [newTask, setNewTask] = useState({
    title: '',
    frequency: 'daily',
    time: '09:00',
    prompt: '',
    weekdays: [1] as number[],
    everyDays: 3,
    /** 每月几号；-1 表示"最后一天"。 */
    monthDay: 1,
  })
  const [showPlan, setShowPlan] = useState(false)
  const [planText, setPlanText] = useState('')
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [rollbackCommit, setRollbackCommit] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/llm-wiki/state', { headers: { accept: 'application/json' }, cache: 'no-store' })
      if (!response.ok) {
        setError(response.status === 403
          ? '远端会话读不到宿主状态：请在主机窗口打开这个标签。'
          : response.status === 404
            ? '宿主上没有 /api/llm-wiki/state 这条路由：插件已启用但路由没挂上。重启 DSH；若仍是 404，说明跑的还是旧版插件代码。'
            : `读取状态失败（HTTP ${response.status}）。`)
        return
      }
      setState(await response.json() as StatePayload)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => { void refresh() }, 3000)
    return () => { clearInterval(timer) }
  }, [refresh])

  const run = useCallback(async (
    action: string,
    params: Record<string, unknown> = {},
    label = action,
    after?: (result: { ok: boolean, detail?: unknown, instruction?: string }) => void,
  ) => {
    setBusy(label)
    setError('')
    setNote('')
    try {
      const result = await callAction(action, params)
      if (!result.ok) {
        setError(`${result.error?.code ?? 'E_INTERNAL'}：${result.error?.message ?? '失败'}`)
        return
      }
      setInstructions(typeof result.instruction === 'string' ? result.instruction : '')
      setNote(`${label} 完成`)
      after?.(result)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy('')
    }
  }, [refresh])

  /**
   * 上传一批文件。整目录上传时每条都带相对路径（`book/ch1/a.md`），
   * 宿主会照这个结构落到 0-inbox/files 下——所以这里只负责"把路径一并送上去"。
   *
   * 三个约束写在前面：隐藏文件与 __MACOSX 跳过（macOS 压缩包常带一堆噪音）、
   * 单次最多 200 个、逐条传并在按钮上显示进度（一次并发 200 个只会把人晾在那儿）。
   */
  const uploadMany = useCallback(async (entries: UploadEntry[]) => {
    const picked = entries.filter(entry => !isJunkUpload(entry.rel)).slice(0, MAX_UPLOAD_FILES)
    setError('')
    setNote('')
    if (picked.length === 0) {
      setNote('没有可传的文件：隐藏文件、__MACOSX 与系统缩略图已跳过。')
      return
    }
    const skippedByLimit = entries.filter(entry => !isJunkUpload(entry.rel)).length - picked.length
    let ok = 0
    let failed = 0
    let firstError = ''
    setBusy(`上传 0/${picked.length}`)
    try {
      for (const [index, entry] of picked.entries()) {
        const label = entry.rel.split('/').pop() ?? entry.rel
        setBusy(`上传 ${index + 1}/${picked.length} · ${label}`)
        try {
          const response = await fetch('/api/llm-wiki/upload', {
            method: 'POST',
            headers: {
              // 整条相对路径都塞进 header：宿主按它建子目录、保留结构。
              'x-filename': encodeURIComponent(entry.rel),
              'x-mime': entry.file.type || 'application/octet-stream',
              'content-type': 'application/octet-stream',
            },
            body: await entry.file.arrayBuffer(),
          })
          const result = await response.json() as { ok: boolean, error?: { code?: string, message?: string } }
          if (result.ok) ok += 1
          else {
            failed += 1
            if (firstError === '') firstError = `${result.error?.code ?? ''}：${result.error?.message ?? '上传失败'}`
          }
        } catch (cause) {
          failed += 1
          if (firstError === '') firstError = cause instanceof Error ? cause.message : String(cause)
        }
      }
      if (failed === 0) {
        setNote(`已接收 ${ok} 个文件${skippedByLimit > 0 ? `；另有 ${skippedByLimit} 个超过单次 ${MAX_UPLOAD_FILES} 个的上限，没传` : ''}`)
      } else {
        setError(`${failed} 个没传上去（成功 ${ok} 个）。第一个失败：${firstError}`)
      }
      await refresh()
    } finally {
      setBusy('')
    }
  }, [refresh])

  /** 拖进来的可能是文件、也可能是整个目录：按 DataTransferItem 递归摊平，保留相对路径。 */
  const collectDrop = useCallback(async (transfer: DataTransfer): Promise<UploadEntry[]> => {
    const items = Array.from(transfer.items ?? [])
    const roots = items
      .map(item => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
      .filter((entry): entry is FileSystemEntry => entry !== null)
    if (roots.length === 0) {
      return Array.from(transfer.files ?? []).map(file => ({
        file,
        rel: file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name,
      }))
    }
    const out: UploadEntry[] = []
    const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
      if (out.length > MAX_UPLOAD_FILES * 2) return
      if (entry.isFile) {
        const file = await new Promise<File | undefined>(resolve => {
          (entry as FileSystemFileEntry).file(resolve, () => { resolve(undefined) })
        })
        if (file !== undefined) out.push({ file, rel: prefix === '' ? file.name : `${prefix}/${file.name}` })
        return
      }
      if (!entry.isDirectory) return
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const children: FileSystemEntry[] = []
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>(resolve => {
          reader.readEntries(resolve, () => { resolve([]) })
        })
        if (batch.length === 0) break
        children.push(...batch)
      }
      const next = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      for (const child of children) await walk(child, next)
    }
    for (const root of roots) await walk(root, '')
    return out
  }, [])

  /**
   * 打开知识库：把这件事整体交给宿主。
   *
   * 早先的写法是"宿主回 uri，前端 window.location.href = uri"，在 Electron 壳里
   * 这一步常常什么都不发生（自定义协议被拦，或者那个 vault 压根没在 Obsidian 注册）。
   * 现在宿主负责注册 vault、唤起客户端、失败兜底，前端只把结果如实显示出来。
   */
  const openLibrary = useCallback(async () => {
    setBusy('打开知识库')
    setError('')
    setNote('')
    try {
      const result = await postJson('/api/llm-wiki/open', { path: '' })
      if (!result.ok) {
        const failure = result.error as { code?: string, message?: string } | undefined
        setError(`${failure?.code ?? 'E_OPEN_FAILED'}：${failure?.message ?? '没能打开 Obsidian'}`)
        return
      }
      const note = typeof result.note === 'string' ? result.note : ''
      setNote(note === '' ? '已让 Obsidian 打开这个库' : note)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy('')
    }
  }, [])

  const switchLibrary = useCallback(async (name: string) => {
    setBusy(`切换到 ${name}`)
    try {
      const result = await postJson('/api/llm-wiki/library', { op: 'switch', name })
      if (!result.ok) { setError(result.error?.message ?? '切换失败'); return }
      setNote(`当前库已切到 ${name}`)
      await refresh()
    } finally {
      setBusy('')
    }
  }, [refresh])

  /**
   * 建库：宿主在空间下建目录 + 四个阶段 + WIKI.md / index / log，然后直接切过去。
   * 不需要开 Finder，也不需要先开 Obsidian——那两步只在"想看正文"时才需要。
   * 勾了"建好后打开"就顺手把新库交给 Obsidian 一次。
   */
  const createLibrary = useCallback(async () => {
    const name = newLibraryName.trim()
    if (name === '') return
    setBusy(`创建 ${name}`)
    setError('')
    setNote('')
    try {
      const result = await postJson('/api/llm-wiki/library', { op: 'create', name })
      if (!result.ok) {
        const failure = result.error as { code?: string, message?: string } | undefined
        setError(`${failure?.code ?? 'E_CREATE_FAILED'}：${failure?.message ?? '建库失败'}`)
        return
      }
      setShowNewLibrary(false)
      setNewLibraryName('')
      setNote(`已建好 ${name} 并切到它`)
      await refresh()
      if (!openAfterCreate) return
      const opened = await postJson('/api/llm-wiki/open', { path: '' })
      if (!opened.ok) {
        const failure = opened.error as { code?: string, message?: string } | undefined
        setError(`${failure?.code ?? 'E_OPEN_FAILED'}：${failure?.message ?? '没能打开 Obsidian'}`)
        return
      }
      const openedNote = typeof opened.note === 'string' ? opened.note : ''
      setNote(openedNote === '' ? `已建好 ${name} 并切到它，已在 Obsidian 打开` : `已建好 ${name} 并切到它；${openedNote}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy('')
    }
  }, [newLibraryName, openAfterCreate, refresh])

  const counts = state.counts
  const libraries = state.space.libraries
  const activeName = state.space.active !== '' ? state.space.active : state.library.name
  const activeLibrary = libraries.find(library => library.name === activeName)
  /**
   * 下拉里要有"当前库"，哪怕它已经不在磁盘上。
   * 用户把整个文件夹删掉之后，active 仍然记着那个名字；如果这里不补一条，
   * 选择器会显示成空白，看起来像"没选库"，比报错还难懂。
   */
  const libraryOptions = useMemo(() => {
    const list = libraries.map(library => ({ ...library, missing: false }))
    if (activeName !== '' && !list.some(library => library.name === activeName)) {
      list.unshift({ name: activeName, path: state.library.path, initialized: false, missing: true })
    }
    return list
  }, [libraries, activeName, state.library.path])

  /** 一句话说清"现在最该做哪件事"，替代一屏需要自己解读的数字。 */
  const headline = useMemo(() => {
    // 库都不在了就别再算"待办"：这里先给一句实话，别让人对着零去猜。
    if (!state.initialized) return '这个库在磁盘上找不到了'
    if (counts.inbox > 0) return `有 ${counts.inbox} 条素材等你确认是否入库`
    if (counts.proposals > 0) return `有 ${counts.proposals} 个提案等你裁决`
    if (counts.raw > 0) return `1-raw 有 ${counts.raw} 条素材可以编译成页了`
    if (state.findings.error > 0) return `Wiki 体检发现 ${state.findings.error} 个需要修的问题`
    return '没有待处理项'
  }, [counts, state.findings.error])

  return (
    <div className="lw">
      <style>{CSS}</style>

      {/* ── 顶部：库身份 ── */}
      <div className="lw-top">
        <div className="who">
          <h1>{activeName === '' ? '超级大脑' : activeName}</h1>
          <div className="sub">{headline}</div>
          <div className="where lw-mono">
            {/* 空路径时别留悬空的 " · "：先把两段各自算好，再决定要不要拼分隔符。 */}
            {[
              state.space.path === '' ? '单库模式' : `空间 ${state.space.path}`,
              state.library.path,
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="acts">
          {/* 只有一个库时不放下拉：一个只有一项的选择器只是噪音。 */}
          {libraryOptions.length > 1 ? (
            <select
              className="lw-select"
              value={activeName}
              disabled={busy !== ''}
              onChange={event => { void switchLibrary(event.target.value) }}
              aria-label="选择知识库"
              title="切换知识库"
            >
              {libraryOptions.map(library => (
                <option key={library.name} value={library.name}>
                  {library.name}{library.missing ? '（磁盘上没有）' : library.initialized ? '' : '（未初始化）'}
                </option>
              ))}
            </select>
          ) : null}
          {/* 当前选中的库还没初始化时，把"初始化"直接放在这里——
              否则用户切到一个空文件夹就卡住了，只能猜下一步该干什么。 */}
          {activeLibrary?.initialized === false && state.initialized ? (
            <button className="lw-btn" disabled={busy !== ''}
              onClick={() => { void run('A16', {}, '初始化知识库') }}>初始化这个库</button>
          ) : null}
          <button
            className="lw-btn"
            disabled={busy !== '' || state.space.path === ''}
            title={state.space.path === '' ? '先在设置里填知识空间路径，才有地方建库' : '在空间下新建一个库'}
            onClick={() => setShowNewLibrary(v => !v)}
          >{showNewLibrary ? '取消新建' : '新建知识库'}</button>
          <button className="lw-btn primary" onClick={() => { void openLibrary() }}>打开知识库</button>
        </div>
      </div>

      {showNewLibrary ? (
        <div className="lw-card">
          <div className="lw-chead">
            <h2>新建知识库</h2>
            <span className="why">在空间 {state.space.path} 下建一个文件夹，按四个阶段把骨架写齐</span>
          </div>
          <div className="lw-pane">
            <div className="lw-row">
              <input
                className="lw-note lw-name"
                placeholder="文件夹名，例如 health"
                value={newLibraryName}
                disabled={busy !== ''}
                autoFocus
                onChange={event => setNewLibraryName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') void createLibrary() }}
              />
              <label className="lw-check">
                <input
                  type="checkbox"
                  checked={openAfterCreate}
                  onChange={event => setOpenAfterCreate(event.target.checked)}
                />
                建好后在 Obsidian 打开
              </label>
              <button className="lw-btn" disabled={busy !== ''}
                onClick={() => { setShowNewLibrary(false); setNewLibraryName('') }}>取消</button>
              <button className="lw-btn primary" disabled={busy !== '' || newLibraryName.trim() === ''}
                onClick={() => { void createLibrary() }}>创建</button>
            </div>
            <div className="lw-hint">
              不用开 Finder、也不用先开 Obsidian：目录和 WIKI.md / index / log 都是宿主写的，
              建完自动切到新库。文件夹里已有内容不会被覆盖，已存在的库会被拒绝重建。
            </div>
          </div>
        </div>
      ) : null}

      {busy === '' ? null : <div className="lw-banner">正在执行 {busy}…</div>}
      {error === '' ? null : <div className="lw-err">{error}</div>}
      {note === '' ? null : <div className="lw-okb">{note}</div>}
      {instructions === '' ? null : (
        <div className="lw-card">
          <div className="lw-chead">
            <h2>这一步需要 agent 接手</h2>
            <span className="why">已交给一个一次性任务</span>
            <div className="lw-spacer" />
            <button className="lw-btn mini" onClick={() => { void navigator.clipboard?.writeText(instructions) }}>复制指令</button>
            <button className="lw-btn mini" onClick={() => setInstructions('')}>收起</button>
          </div>
          <div className="lw-pane"><div className="lw-instr">{instructions}</div></div>
        </div>
      )}

      {state.initialized ? (
        <>
      <div className="lw-grid">
        <div className="lw-col">

          {/* ── 状态 ── */}
          <div className="lw-card">
            <div className="lw-chead">
              <h2>库况</h2>
              <span className="why">只读，3 秒刷新</span>
            </div>
            <div className="lw-stats">
              {([
                ['页', counts.wiki, ''],
                ['待编译', counts.raw, counts.raw > 0 ? 'warn' : ''],
                ['待确认', counts.inbox, counts.inbox > 0 ? 'warn' : ''],
                ['待审', counts.proposals, counts.proposals > 0 ? 'warn' : ''],
                ['占位页', counts.stub, ''],
                ['过期', counts.deprecated, ''],
                ['孤儿页', counts.orphan, counts.orphan > 0 ? 'warn' : ''],
              ] as [string, number, string][]).map(([label, value, tone]) => (
                <div className={`lw-stat${tone === '' ? '' : ` ${tone}`}`} key={label}>
                  <div className="k">{label}</div>
                  <div className="v">{value}</div>
                </div>
              ))}
              <div className={`lw-stat${state.health >= 80 ? ' ok' : ' warn'}`}>
                <div className="k">健康度</div>
                <div className="v">{state.health}<small>%</small></div>
                <div className="lw-bar"><i style={{ width: `${Math.max(0, Math.min(100, state.health))}%` }} /></div>
              </div>
            </div>
            <div className="lw-statsub">
              <span>占用 {fmtSize(state.occupancy.total)}</span>
              <span className="sep" />
              <span>附件 {fmtSize(state.occupancy.attachments)}</span>
              <span className="sep" />
              <span>中间物 {fmtSize(state.occupancy.parts)}</span>
              <span className="sep" />
              <span>git {state.mode.git ? '开' : '关'}</span>
              <span className="sep" />
              <span>音频 {state.mode.audio === 'none' ? '不转写' : state.mode.audio}</span>
            </div>
          </div>

          {/* ── 收料 ── */}
          <div className="lw-card">
            <div className="lw-chead">
              <h2>收料</h2>
              <span className="why">进来的只是素材，入库前都要你点一次</span>
            </div>
            <div className="lw-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'note'} className={`lw-tab${tab === 'note' ? ' on' : ''}`} onClick={() => setTab('note')}>灵感</button>
              <button role="tab" aria-selected={tab === 'drop'} className={`lw-tab${tab === 'drop' ? ' on' : ''}`} onClick={() => setTab('drop')}>文件</button>
            </div>

            {tab === 'note' ? (
              <div className="lw-pane">
                <textarea
                  className="lw-note"
                  placeholder="随手写，落到 0-inbox；之后再决定要不要收进库里。"
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                />
                <div className="lw-row">
                  <button
                    className="lw-btn primary"
                    disabled={busy !== '' || draft.trim() === ''}
                    onClick={() => { void run('A01', { text: draft }, '存入 0-inbox').then(() => setDraft('')) }}
                  >存入 0-inbox</button>
                  <span className="lw-spacer" />
                  <span className="lw-hint">{draft.trim() === '' ? '' : `${draft.trim().length} 字`}</span>
                </div>
              </div>
            ) : (
              <div className="lw-pane">
                <div
                  className={`lw-drop${over ? ' over' : ''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={event => { event.preventDefault(); setOver(true) }}
                  onDragLeave={() => setOver(false)}
                  onDrop={event => {
                    event.preventDefault()
                    setOver(false)
                    void (async () => {
                      const entries = await collectDrop(event.dataTransfer)
                      if (entries.length > 0) await uploadMany(entries)
                    })()
                  }}
                >
                  <div className="t">把文件或整个文件夹拖到这里</div>
                  <div className="d">
                    文件夹会保留原有的目录结构（落在 0-inbox/files/原文件夹/…）。
                    PDF 会抽正文，录音按设置切片转写，其余原样存档。
                  </div>
                </div>
                <div className="lw-row">
                  <span className="lw-hint">落在 0-inbox/files，同名不覆盖（第二个起落成 -2）</span>
                  <span className="lw-spacer" />
                  <button className="lw-btn" onClick={() => fileRef.current?.click()}>选择文件</button>
                  <button className="lw-btn" onClick={() => folderRef.current?.click()}>上传文件夹</button>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={event => {
                const files = Array.from(event.target.files ?? [])
                event.target.value = ''
                if (files.length === 0) return
                void uploadMany(files.map(file => ({
                  file,
                  rel: file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name,
                })))
              }}
            />
            {/* webkitdirectory 不是标准属性，React 不认，用展开对象塞进去。 */}
            <input
              ref={folderRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              onChange={event => {
                const files = Array.from(event.target.files ?? [])
                event.target.value = ''
                if (files.length === 0) return
                void uploadMany(files.map(file => ({
                  file,
                  rel: file.webkitRelativePath !== '' ? file.webkitRelativePath : file.name,
                })))
              }}
            />
          </div>

          {/* ── 整理 ── */}
          <div className="lw-card">
            <div className="lw-chead">
              <h2>整理</h2>
              <span className="why">一个按钮干完一件事；名字就是它干的事</span>
            </div>
            <div className="lw-tools">
              {/* 命名规则：动词 + 对象。「编译」不带对象要人猜；「Wiki 编译」不用猜。
                  title 里放一句解释，鼠标停一下就知道它会动哪些东西。 */}
              <button className="lw-btn tile" disabled={busy !== ''}
                title="把 1-raw 的素材编译成 2-wiki 页面：素材成页 + 去重 + 矛盾比对 + 补孤页 + 更新索引"
                onClick={() => { void run('A07', { all: true }, 'Wiki 编译') }}>
                Wiki 编译{counts.raw > 0 ? ` · ${counts.raw}` : ''}
              </button>
              <button className="lw-btn tile" disabled={busy !== ''}
                title="用 2-wiki 现在的实际内容重写 index.md：相当于给这个库重画一张地图"
                onClick={() => { void run('A15', {}, '重建 Wiki 索引') }}>重建 Wiki 索引</button>
              <button className="lw-btn tile" disabled={busy !== ''}
                title="查断链、schema、孤页与索引一致性；能修的当场修，其余按严重度列出来"
                onClick={() => { void run('A11', { fix: true }, 'Wiki 体检') }}>
                Wiki 体检{state.findings.error > 0 ? ` · ${state.findings.error}` : ''}
              </button>
              <button className="lw-btn tile" disabled={busy !== ''}
                title="清掉崩溃残留的 .tmp、音视频切片中间物、过期的回收站与索引备份"
                onClick={() => { void run('A18', {}, '清理临时文件') }}>清理临时文件</button>
              <button className="lw-btn tile" disabled={busy !== ''}
                title="没有素材引用的附件、30 天没确认的收件：先列清单，你点头才移进回收站"
                onClick={() => {
                  void run('A19', {}, '清理未用附件预览', result => {
                    const detail = result.detail as { candidates?: { rel: string, reason: string }[] } | undefined
                    setDeepCandidates(Array.isArray(detail?.candidates) ? detail.candidates : [])
                  })
                }}>
                清理未用附件{deepCandidates.length > 0 ? ` · ${deepCandidates.length}` : ''}
              </button>
              <button
                className="lw-btn tile"
                disabled={busy !== '' || !state.git.enabled}
                title={state.git.enabled ? '把 2-wiki / 3-review 退回某次提交；回滚前会先留一份备份' : '版本回滚未开启：在设置 → 插件 → LLM Wiki 里打开 git 回滚，并让库成为 git 仓库'}
                onClick={() => setRollbackOpen(v => !v)}
              >版本回滚</button>
            </div>

            {deepCandidates.length === 0 ? null : (
              <div className="lw-pane" style={{ borderTop: '1px solid var(--lw-line2)' }}>
                <div className="lw-hint">清理候选 {deepCandidates.length} 项（未用附件 / 超期收件），只进回收站不进库：</div>
                <div className="lw-hint lw-mono" style={{ maxHeight: 92, overflowY: 'auto' }}>
                  {deepCandidates.map(item => `${item.rel} — ${item.reason}`).join('\n')}
                </div>
                <div className="lw-row">
                  <button className="lw-btn go" disabled={busy !== ''}
                    onClick={() => {
                      void run('A19', { items: deepCandidates.map(item => item.rel) }, '清理未用附件').then(() => setDeepCandidates([]))
                    }}>移入回收站这 {deepCandidates.length} 项</button>
                  <button className="lw-btn" onClick={() => setDeepCandidates([])}>先不动</button>
                </div>
              </div>
            )}

            {rollbackOpen ? (
              <div className="lw-pane" style={{ borderTop: '1px solid var(--lw-line2)' }}>
                <div className="lw-hint">只回滚 2-wiki 与 3-review：</div>
                <div className="lw-row">
                  <select className="lw-select" style={{ maxWidth: '100%', flex: 1 }}
                    value={rollbackCommit} onChange={event => setRollbackCommit(event.target.value)}>
                    <option value="">选择提交…</option>
                    {state.git.commits.map(commit => (
                      <option key={commit.hash} value={commit.hash}>
                        {commit.hash.slice(0, 8)} · {commit.subject}
                      </option>
                    ))}
                  </select>
                  <button className="lw-btn go" disabled={busy !== '' || rollbackCommit === ''}
                    onClick={() => { void run('A17', { commit: rollbackCommit }, '版本回滚').then(() => { setRollbackOpen(false); setRollbackCommit('') }) }}
                  >回滚到这版</button>
                </div>
              </div>
            ) : null}

            <div className="lw-tfoot">
              Wiki 编译 = 素材成页 + 去重 + 矛盾比对 + 补孤页 + 更新索引；有争议只出提案，不改现有页。
            </div>
          </div>
        </div>

        <div className="lw-col fill">
          {/* ── 确认队列 ── */}
          <div className="lw-card lw-queue">
            <div className="lw-chead">
              <h2>确认队列</h2>
              <div className="lw-spacer" />
              <span className="lw-badge">{counts.inbox}<span>条待确认</span></span>
            </div>
            {state.inbox.length === 0 ? (
              <div className="lw-void">
                <div className="t">收件箱是空的</div>
                <div className="d">上方「收料」存进来的东西会先到这里，等你点头才进 1-raw。</div>
              </div>
            ) : (
              <>
                <div className="lw-scroll">
                  {state.inbox.map(item => (
                    <div className="lw-q" key={item.rel}>
                      <div className="body">
                        <span className="n">{item.title}</span>
                        <span className="m">
                          {KIND_LABEL[item.kind] ?? item.kind} · {item.origin !== undefined && item.origin !== '' ? item.origin : dirOf(item.rel)}
                        </span>
                      </div>
                      <div className="acts">
                        <button className="lw-btn mini go" disabled={busy !== ''} title="确认这条素材：从 0-inbox 移进 1-raw"
                          onClick={() => { void run('A05', { items: [item.slug] }, `入库 ${item.title}`) }}>入库</button>
                        <button className="lw-btn mini" disabled={busy !== ''} title="把这条素材从 0-inbox 撤掉，不进库"
                          onClick={() => { void run('A06', { item: item.slug }, `撤回 ${item.title}`) }}>撤回</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="lw-qfoot">
                  <span>确认后才进 1-raw</span>
                  <span className="lw-spacer" />
                  <button className="lw-btn mini" disabled={busy !== ''}
                    onClick={() => { void run('A05', { all: true }, '全部入库') }}>全部入库</button>
                </div>
              </>
            )}
          </div>

          {/* ── 提案队列 ── */}
          <div className="lw-card lw-queue">
            <div className="lw-chead">
              <h2>提案队列</h2>
              <div className="lw-spacer" />
              <span className="lw-badge">{counts.proposals}<span>条待审批</span></span>
            </div>
            {state.proposals.length === 0 ? (
              <div className="lw-void">
                <div className="t">没有待裁决的提案</div>
                <div className="d">编译、去重、矛盾扫描产出的改动都会先落 3-review，等你合并。</div>
              </div>
            ) : (
              <>
                <div className="lw-scroll">
                  {state.proposals.map(proposal => (
                    <div className="lw-q" key={proposal.path}>
                      <div className="body">
                        <span className="n">{proposal.target}</span>
                        <span className="m">{proposal.action === 'update' ? '改写' : proposal.action === 'deprecate' ? '废止' : '新建'}{proposal.reason === '' ? '' : ` · ${proposal.reason}`}</span>
                      </div>
                      <div className="acts">
                        <button className="lw-btn mini go" disabled={busy !== ''} title="采纳这个提案：把提案里的写法落进 2-wiki"
                          onClick={() => { void run('A09', { paths: [proposal.path] }, `合并 ${proposal.target}`) }}>合并</button>
                        <button className="lw-btn mini" disabled={busy !== ''} title="不采纳：把这条提案删掉，页面不动"
                          onClick={() => { void run('P.discard', { paths: [proposal.path] }, `丢弃 ${proposal.target}`) }}>丢弃</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="lw-qfoot">
                  <span>页面怎么写由你裁决</span>
                  <span className="lw-spacer" />
                  <button className="lw-btn mini" disabled={busy !== ''}
                    onClick={() => { void run('A09', { all: true }, '合并全部') }}>全部合并</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 自动化任务 ── */}
      <div className="lw-card">
        <div className="lw-chead">
          <h2>自动化任务</h2>
          <span className="why">
            {state.scheduleAvailable ? '开 = 在 DSH 建一条任务；停 = 真删' : '定时服务不可用：开关只存本地'}
          </span>
          <div className="lw-spacer" />
          <button className="lw-btn mini" disabled={busy !== ''} onClick={() => setShowNewTask(v => !v)}>
            {showNewTask ? '取消' : '新建任务'}
          </button>
        </div>

        {showNewTask ? (
          <div className="lw-pane lw-form">
            <div className="lw-row">
              <input className="lw-note lw-name" placeholder="任务名，例如「每周整理一次」"
                value={newTask.title}
                onChange={event => setNewTask({ ...newTask, title: event.target.value })} />
              <select className="lw-select" value={newTask.frequency}
                aria-label="重复方式"
                onChange={event => setNewTask({ ...newTask, frequency: event.target.value })}>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="interval">每隔 N 天</option>
                <option value="monthly">每月</option>
              </select>
              <input className="lw-select" type="time" value={newTask.time} aria-label="执行时间"
                onChange={event => setNewTask({ ...newTask, time: event.target.value })} />
            </div>

            {newTask.frequency === 'weekly' ? (
              <div className="lw-row">
                <span className="lw-hint">周几</span>
                {DOW.map(day => {
                  const on = newTask.weekdays.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      aria-pressed={on}
                      className={`lw-dow${on ? ' on' : ''}`}
                      onClick={() => setNewTask({
                        ...newTask,
                        weekdays: on
                          ? newTask.weekdays.filter(value => value !== day.value)
                          : [...newTask.weekdays, day.value].sort((left, right) => left - right),
                      })}
                    >{day.label}</button>
                  )
                })}
              </div>
            ) : null}

            {newTask.frequency === 'monthly' ? (
              <div className="lw-row">
                <span className="lw-hint">每月</span>
                <select
                  className="lw-select"
                  value={String(newTask.monthDay)}
                  aria-label="每月几号"
                  onChange={event => setNewTask({ ...newTask, monthDay: Number(event.target.value) })}
                >
                  {Array.from({ length: 31 }, (_, index) => index + 1).map(day => (
                    <option key={day} value={day}>{day} 日</option>
                  ))}
                  <option value={-1}>最后一天</option>
                </select>
                <span className="lw-hint">该月没有这一天就跳过，不提前也不顺延</span>
              </div>
            ) : null}

            {newTask.frequency === 'interval' ? (
              <div className="lw-row">
                <span className="lw-hint">每隔</span>
                <input
                  className="lw-select lw-num"
                  type="number"
                  min={2}
                  max={30}
                  value={newTask.everyDays}
                  onChange={event => setNewTask({ ...newTask, everyDays: Number(event.target.value) })}
                />
                <span className="lw-hint">天一次（2–30）</span>
              </div>
            ) : null}

            <input className="lw-note lw-name" placeholder="交给 agent 的指令（留空就用任务名）"
              value={newTask.prompt}
              onChange={event => setNewTask({ ...newTask, prompt: event.target.value })} />

            <div className="lw-row">
              <span className="lw-hint">{ruleLabel(newTask)}</span>
              <span className="lw-spacer" />
              <button className="lw-btn" onClick={() => setShowNewTask(false)}>取消</button>
              <button className="lw-btn primary"
                disabled={busy !== '' || newTask.title.trim() === '' || (newTask.frequency === 'weekly' && newTask.weekdays.length === 0)}
                onClick={() => {
                  void run('J.create', {
                    title: newTask.title.trim(),
                    frequency: newTask.frequency,
                    time: newTask.time,
                    weekdays: newTask.weekdays,
                    everyDays: newTask.everyDays,
                    monthDay: newTask.monthDay,
                    prompt: newTask.prompt.trim() === '' ? undefined : newTask.prompt.trim(),
                  }, '新建任务').then(() => {
                    setShowNewTask(false)
                    setNewTask({ title: '', frequency: 'daily', time: '09:00', prompt: '', weekdays: [1], everyDays: 3, monthDay: 1 })
                  })
                }}>创建</button>
            </div>

            {/* 表单装不下的规则（每月第一个工作日、月底、隔两天但按周算…）走这一条，
                交给 agent 翻成 rrule；常规规则用上面的表单，0 token。 */}
            <div className="lw-row">
              <button className="lw-btn quiet" onClick={() => setShowPlan(v => !v)}>
                {showPlan ? '收起' : '说不清时间？用一句话交给 AI'}
              </button>
            </div>
            {showPlan ? (
              <div className="lw-row">
                <input className="lw-note lw-name"
                  placeholder="例如：每月第一个工作日早上 8 点，把过期提案清一遍"
                  value={planText}
                  onChange={event => setPlanText(event.target.value)}
                  onKeyDown={event => {
                    if (event.key !== 'Enter' || planText.trim() === '') return
                    void run('J.plan', { text: planText.trim() }, '交给 AI 排任务').then(() => { setPlanText(''); setShowPlan(false) })
                  }} />
                <button className="lw-btn" disabled={busy !== '' || planText.trim() === ''}
                  onClick={() => {
                    void run('J.plan', { text: planText.trim() }, '交给 AI 排任务').then(() => {
                      setPlanText('')
                      setShowPlan(false)
                    })
                  }}>让 AI 建</button>
              </div>
            ) : null}
          </div>
        ) : null}

        {state.tasks.builtin.map(job => {
          const when = typeof job.options.time === 'string'
            ? `${job.kind === 'event' ? '事件' : job.options.time}${job.kind === 'clock' ? ' 每天' : ''}`
            : (job.kind === 'event' ? '事件' : '定时')
          return (
            <div className={`lw-task ${job.enabled ? 'on' : 'off'}`} key={job.id}>
              <div>
                <span className="n">{job.name}</span>
                <span className="m">{job.why}</span>
              </div>
              <span className="when">{when}</span>
              <div className="acts">
                <button className={`lw-btn mini${job.enabled ? '' : ' run'}`} disabled={busy !== ''}
                  onClick={() => { void run('J.toggle', { id: job.id, enabled: !job.enabled }, `${job.enabled ? '停用' : '启用'} ${job.name}`) }}>
                  {job.enabled ? '停用' : '启用'}
                </button>
                <button className="lw-btn mini danger" disabled={busy !== ''}
                  onClick={() => { void run('J.delete', { jobId: job.id }, `删除 ${job.name}`) }}>删除</button>
              </div>
            </div>
          )
        })}

        {state.tasks.custom.map(task => (
          <div className="lw-task" key={task.id}>
            <div>
              <span className="n">{task.title.replace(/^\[wiki\]\s*/u, '')}</span>
              <span className="m">自定义 · {task.status}</span>
            </div>
            <span className="when">自定义</span>
            <div className="acts">
              <button className="lw-btn mini danger" disabled={busy !== ''}
                onClick={() => { void run('J.delete', { taskId: task.id }, '删除任务') }}>删除</button>
            </div>
          </div>
        ))}

        <div className="lw-qfoot">
          <span>内置任务由插件对账维护</span>
          {state.tasks.suspects.length === 0 ? null : (
            <>
              <span className="lw-spacer" />
              <span>另有 {state.tasks.suspects.length} 条属于别的库，不显示也不动</span>
            </>
          )}
        </div>
      </div>
        </>
      ) : (
        <div className="lw-card">
          <div className="lw-chead">
            <h2>这个库在磁盘上找不到了</h2>
            <span className="why">{state.library.path === '' ? '当前库路径是空的' : state.library.path}</span>
          </div>
          <div className="lw-pane">
            <div className="lw-hint" style={{ lineHeight: 1.65 }}>
              多半是文件夹被删掉或改名了。这个库的名字不必沿用——你可以重建它的骨架，
              也可以直接换个库，或者建一个新的。三条路都在这一屏：
            </div>
            <div className="lw-row">
              <button className="lw-btn primary" disabled={busy !== ''}
                onClick={() => { void run('A16', {}, '重建这个库') }}>重建这个库</button>
              <button className="lw-btn" disabled={busy !== ''} onClick={() => setShowNewLibrary(true)}>新建一个库</button>
              {libraryOptions.length > 1
                ? <span className="lw-hint">或从右上角的下拉切到别的库</span>
                : <span className="lw-hint">空间里没有别的库可切</span>}
            </div>
            <div className="lw-hint">
              重建只补骨架（0-inbox / 1-raw / 2-wiki / 3-review + WIKI.md / index / log），不碰任何已有内容。
              {state.space.path === ''
                ? ' 另外：知识空间还没配，先在设置里填一个目录，库才有地方落。'
                : state.space.libraries.length === 0
                  ? ' 另外：空间目录本身也读不到，去设置里核对一下路径。'
                  : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
