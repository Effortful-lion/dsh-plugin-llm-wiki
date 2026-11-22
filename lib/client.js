window.__ModuleLoader__.load({id:"dsh-plugin-llm-wiki",factory:require=>{
var module={exports:{}};var exports=module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// client/view.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var EMPTY = {
  ok: false,
  initialized: true,
  library: { path: "", name: "" },
  space: { path: "", active: "", libraries: [] },
  mode: { git: false, audio: "none" },
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
  obsidian: { vault: "", cli: false }
};
var CSS = `
/* \u4E3B\u9898\u5C42\u3002
   \u53D6\u5411\uFF1A\u4E00\u5757"\u5DE5\u4F5C\u53F0"\u2014\u2014\u4FE1\u606F\u5BC6\u5EA6\u9AD8\u3001\u5C42\u7EA7\u9760\u5B57\u91CD\u4E0E\u7EC6\u7EBF\u5EFA\u7ACB\uFF1B\u5E95\u8272\u7ED9\u4E00\u5C42\u6781\u6DE1\u7684
   \u4E3B\u9898\u8272\u6655\u67D3\uFF0C\u8BA9\u767D\u5361\u7247\u6709\u5730\u65B9\u6D6E\u8D77\u6765\uFF0C\u800C\u4E0D\u662F\u6574\u5C4F\u4E00\u5F20\u767D\u7EB8\u3002
   \u5168\u90E8\u8D70 --dsw-alias-* \u8BED\u4E49 token\uFF0C\u8DDF\u968F\u5BBF\u4E3B\u6DF1\u6D45\u8272\uFF1Btoken \u7F3A\u5931\u65F6\u624D\u843D\u5230\u515C\u5E95\u503C\u3002 */
.lw{
  --lw-ink:var(--dsw-alias-label-primary,#1b1a2a);
  --lw-ink2:var(--dsw-alias-label-secondary,#403d58);
  --lw-dim:var(--dsw-alias-label-caption,#6f6c87);
  --lw-line:var(--dsw-alias-border-l4,rgba(122,106,196,.16));
  --lw-line2:var(--dsw-alias-border-l5,rgba(122,106,196,.09));
  /* \u8BED\u4E49\u8272\u4E00\u5F8B\u53D6\u5BBF\u4E3B\u7684\u72B6\u6001 token\uFF1A\u6DF1\u6D45\u8272\u7531 DSH \u51B3\u5B9A\uFF0C\u8FD9\u91CC\u4E0D\u518D\u81EA\u5DF1\u5224\u65AD\u4E3B\u9898\u3002
     \u5E95\u8272/\u63CF\u8FB9\u7528 color-mix \u4ECE\u540C\u4E00\u4E2A\u989C\u8272\u63A8\u51FA\u6765\uFF0C\u4E0D\u4F1A\u51FA\u73B0"\u6DF1\u8272\u6A21\u5F0F\u91CC\u4E00\u5768\u6DF1\u68D5"\u3002 */
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

/* \u9876\u90E8\uFF1A\u5E93\u8EAB\u4EFD\u3002\u5DE6\u4FA7\u4E00\u9053\u4E3B\u9898\u8272\u7AD6\u6761\u505A\u951A\u70B9\uFF0C\u4E0D\u505A\u5927\u6807\u9898\u5806\u53E0\u3002 */
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

/* \u5361\u7247 */
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

/* \u6309\u94AE\uFF1A\u56DB\u6863\u8BED\u4E49\u3002
   neutral = \u6B21\u8981\u52A8\u4F5C\uFF1Bprimary = \u5F53\u524D\u9875\u7684\u4E3B\u52A8\u4F5C\uFF1Bgo = \u5EFA\u8BBE\u6027\u88C1\u51B3\uFF08\u5165\u5E93/\u5408\u5E76/\u542F\u7528\uFF09\uFF1B
   danger = \u4E0D\u53EF\u9006\uFF08\u5220\u9664\uFF09\uFF1Brun \u662F go \u7684\u8F7B\u91CF\u7248\u672C\uFF0C\u7528\u5728"\u542F\u7528"\u8FD9\u7C7B\u5F00\u5173\u4E0A\u3002 */
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

/* \u4E3B\u4F53\u4E24\u5217 */
.lw-grid{display:grid;grid-template-columns:minmax(0,1.04fr) minmax(0,.96fr);gap:12px;align-items:stretch}
.lw-col{display:flex;flex-direction:column;gap:12px;min-width:0;min-height:0}
.lw-col.fill > .lw-queue{flex:1 1 0;height:auto;min-height:200px}

/* \u72B6\u6001\uFF1A\u6570\u5B57\u5148\u884C\uFF0C\u683C\u5B50\u4E4B\u95F4\u7528\u7EC6\u7EBF\u5206\u9694\uFF0C\u4E0D\u9760\u8FB9\u6846\u5806\u76D2\u5B50 */
.lw-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:2px 0;padding:13px 8px 6px}
.lw-stat{padding:4px 10px;min-width:0}
.lw-stat+.lw-stat{border-left:1px solid var(--lw-line2)}
/* \u6BCF\u884C\u7B2C\u4E00\u4E2A\u683C\u5B50\u4E0D\u8981\u7AD6\u7EBF\uFF1A4 \u5217\u65F6\u662F 5/9 \u53F7\uFF0C3 \u5217\u65F6\u662F 4/7 \u53F7\uFF0C2 \u5217\u65F6\u662F 3/5 \u53F7\u3002 */
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

/* \u6536\u6599\uFF1Atab */
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
/* \u5355\u884C\u8F93\u5165\u590D\u7528 textarea \u7684\u89C2\u611F\uFF0C\u4F46\u4E0D\u5141\u8BB8\u6362\u884C\u6491\u9AD8 */
/* \u5355\u884C\u8F93\u5165\uFF1A\u5728 .lw-row\uFF08\u6A2A\u5411\uFF09\u91CC\u6309\u6BD4\u4F8B\u4F38\u7F29\uFF0C\u5728 .lw-pane\uFF08\u7EB5\u5411\uFF09\u91CC\u5360\u6EE1\u4E00\u884C\u4E14\u4E0D\u6491\u9AD8\u3002
   \u65E9\u5148\u53EA\u5199\u4E86 flex:1 1 200px\uFF0C\u653E\u8FDB\u7EB5\u5411\u5BB9\u5668\u5C31\u53D8\u6210\u4E86"\u9AD8\u5EA6 200px"\uFF0C\u8F93\u5165\u6846\u4F1A\u80C0\u6210\u4E00\u5757\u7816\u3002 */
.lw-name{min-height:0;height:32px;padding:5px 9px;width:100%;flex:0 0 auto;font-size:12px}
.lw-row>.lw-name{flex:1 1 200px;width:auto;min-width:140px}
.lw-check{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--lw-ink2);white-space:nowrap;cursor:pointer;user-select:none}
.lw-check input{accent-color:var(--lw-accent);width:13px;height:13px;margin:0;cursor:pointer}
/* \u65B0\u5EFA\u4EFB\u52A1\u8868\u5355\uFF1A\u6574\u5757\u7ED9\u4E00\u5C42\u6D45\u5E95\uFF0C\u548C\u4E0B\u9762\u7684\u4EFB\u52A1\u884C\u533A\u5206\u5F00 */
.lw-form{background:var(--dsw-alias-bg-secondary,#faf9ff);border-bottom:1px solid var(--lw-line2)}
/* \u661F\u671F\u80F6\u56CA\uFF1A\u9009\u4E2D\u7684\u90A3\u4E00\u9897\u8981\u4E00\u773C\u770B\u51FA\u6765\uFF0C\u672A\u9009\u4FDD\u6301\u4E2D\u6027 */
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

/* \u6574\u7406 */
.lw-tools{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:13px 15px}
.lw-tfoot{padding:9px 15px;border-top:1px solid var(--lw-line2);font-size:10.5px;color:var(--lw-dim);line-height:1.55}

/* \u961F\u5217\uFF1A\u56FA\u5B9A\u9AD8\u5EA6\uFF0C\u88C5\u4E0D\u4E0B\u5728\u6846\u5185\u6EDA\uFF0C\u5934\u5C3E\u9489\u4F4F */
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

/* \u4EFB\u52A1\u884C\uFF1A\u5F00\u7740\u7684\u4EFB\u52A1\u6574\u884C\u5E26\u5E95\u7EB9 + \u5DE6\u4FA7\u4E3B\u9898\u8272\u6807\u8BB0\uFF1B\u505C\u7528\u540E\u6807\u8BB0\u4E0E\u5E95\u7EB9\u4E00\u8D77\u6D88\u5931\uFF0C
   \u53EA\u5269\u7070\u6389\u7684\u5B57\u3002\u8FD9\u6837"\u54EA\u4E9B\u5728\u8DD1"\u662F\u626B\u4E00\u773C\u5C31\u77E5\u9053\u7684\uFF0C\u800C\u4E0D\u7528\u8BFB\u6309\u94AE\u6587\u6848\u3002 */
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

/* \u63D0\u793A */
.lw-banner{font-size:11.5px;padding:7px 11px;border-radius:8px;background:var(--lw-accent-wash);color:var(--lw-ink2);border:1px solid var(--lw-line2)}
.lw-err{font-size:11.5px;padding:7px 11px;border-radius:8px;background:var(--lw-danger-wash);color:var(--lw-danger);white-space:pre-wrap;line-height:1.5;border:1px solid var(--lw-danger-line)}
.lw-okb{font-size:11.5px;padding:7px 11px;border-radius:8px;background:var(--lw-ok-wash);color:var(--lw-ok);border:1px solid var(--lw-ok-line)}
.lw-instr{font-size:11px;color:var(--lw-dim);white-space:pre-wrap;max-height:150px;overflow-y:auto;line-height:1.6;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}

/* \u672A\u521D\u59CB\u5316\uFF1A\u53EA\u7ED9\u4E00\u4EF6\u4E8B\u505A */
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
`;
async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.status === 403) {
    return { ok: false, error: { code: "E_ROUTE_FORBIDDEN", message: "\u8FD9\u4E2A\u7A97\u53E3\u8BFB\u4E0D\u5230\u5BBF\u4E3B\uFF08\u8FDC\u7AEF\u4F1A\u8BDD\uFF09\uFF1A\u8BF7\u5728\u4E3B\u673A\u7A97\u53E3\u64CD\u4F5C\uFF0C\u6216\u8BA9 agent \u7528 wiki_action \u6267\u884C\u3002" } };
  }
  return await response.json();
}
async function callAction(action, params = {}) {
  return await postJson("/api/llm-wiki/action", { action, params });
}
function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function dirOf(rel) {
  const cut = rel.lastIndexOf("/");
  return cut < 0 ? rel : rel.slice(0, cut);
}
var KIND_LABEL = {
  note: "\u7075\u611F\u7B14\u8BB0",
  upload: "\u6587\u4EF6\u4E0A\u4F20",
  collect: "\u91C7\u96C6",
  manual: "\u624B\u5DE5"
};
var MAX_UPLOAD_FILES = 200;
function isJunkUpload(rel) {
  const segments = rel.split("/").filter(Boolean);
  const name = segments.at(-1) ?? "";
  if (name === "" || name.startsWith(".")) return true;
  if (name === "Thumbs.db" || name === "desktop.ini") return true;
  return segments.includes("__MACOSX");
}
var DOW = [
  { value: 1, label: "\u4E00" },
  { value: 2, label: "\u4E8C" },
  { value: 3, label: "\u4E09" },
  { value: 4, label: "\u56DB" },
  { value: 5, label: "\u4E94" },
  { value: 6, label: "\u516D" },
  { value: 7, label: "\u65E5" }
];
function ruleLabel(task) {
  if (task.frequency === "weekly") {
    if (task.weekdays.length === 0) return "\u6BCF\u5468\uFF1A\u8FD8\u6CA1\u9009\u5468\u51E0";
    const names = task.weekdays.map((day) => DOW.find((item) => item.value === day)?.label ?? String(day)).join("\u3001");
    return `\u6BCF\u5468 ${names} ${task.time}`;
  }
  if (task.frequency === "interval") return `\u6BCF\u9694 ${task.everyDays} \u5929 ${task.time}`;
  if (task.frequency === "monthly") {
    return task.monthDay === -1 ? `\u6BCF\u6708\u6700\u540E\u4E00\u5929 ${task.time}` : `\u6BCF\u6708 ${task.monthDay} \u65E5 ${task.time}`;
  }
  return `\u6BCF\u5929 ${task.time}`;
}
function WikiPanel() {
  const [state, setState] = (0, import_react.useState)(EMPTY);
  const [error, setError] = (0, import_react.useState)("");
  const [note, setNote] = (0, import_react.useState)("");
  const [busy, setBusy] = (0, import_react.useState)("");
  const [tab, setTab] = (0, import_react.useState)("note");
  const [draft, setDraft] = (0, import_react.useState)("");
  const [over, setOver] = (0, import_react.useState)(false);
  const [instructions, setInstructions] = (0, import_react.useState)("");
  const [deepCandidates, setDeepCandidates] = (0, import_react.useState)([]);
  const [showNewLibrary, setShowNewLibrary] = (0, import_react.useState)(false);
  const [newLibraryName, setNewLibraryName] = (0, import_react.useState)("");
  const [openAfterCreate, setOpenAfterCreate] = (0, import_react.useState)(true);
  const [showNewTask, setShowNewTask] = (0, import_react.useState)(false);
  const [newTask, setNewTask] = (0, import_react.useState)({
    title: "",
    frequency: "daily",
    time: "09:00",
    prompt: "",
    weekdays: [1],
    everyDays: 3,
    /** 每月几号；-1 表示"最后一天"。 */
    monthDay: 1
  });
  const [showPlan, setShowPlan] = (0, import_react.useState)(false);
  const [planText, setPlanText] = (0, import_react.useState)("");
  const [rollbackOpen, setRollbackOpen] = (0, import_react.useState)(false);
  const [rollbackCommit, setRollbackCommit] = (0, import_react.useState)("");
  const fileRef = (0, import_react.useRef)(null);
  const folderRef = (0, import_react.useRef)(null);
  const refresh = (0, import_react.useCallback)(async () => {
    try {
      const response = await fetch("/api/llm-wiki/state", { headers: { accept: "application/json" }, cache: "no-store" });
      if (!response.ok) {
        setError(response.status === 403 ? "\u8FDC\u7AEF\u4F1A\u8BDD\u8BFB\u4E0D\u5230\u5BBF\u4E3B\u72B6\u6001\uFF1A\u8BF7\u5728\u4E3B\u673A\u7A97\u53E3\u6253\u5F00\u8FD9\u4E2A\u6807\u7B7E\u3002" : response.status === 404 ? "\u5BBF\u4E3B\u4E0A\u6CA1\u6709 /api/llm-wiki/state \u8FD9\u6761\u8DEF\u7531\uFF1A\u63D2\u4EF6\u5DF2\u542F\u7528\u4F46\u8DEF\u7531\u6CA1\u6302\u4E0A\u3002\u91CD\u542F DSH\uFF1B\u82E5\u4ECD\u662F 404\uFF0C\u8BF4\u660E\u8DD1\u7684\u8FD8\u662F\u65E7\u7248\u63D2\u4EF6\u4EE3\u7801\u3002" : `\u8BFB\u53D6\u72B6\u6001\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`);
        return;
      }
      setState(await response.json());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);
  (0, import_react.useEffect)(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 3e3);
    return () => {
      clearInterval(timer);
    };
  }, [refresh]);
  const run = (0, import_react.useCallback)(async (action, params = {}, label = action, after) => {
    setBusy(label);
    setError("");
    setNote("");
    try {
      const result = await callAction(action, params);
      if (!result.ok) {
        setError(`${result.error?.code ?? "E_INTERNAL"}\uFF1A${result.error?.message ?? "\u5931\u8D25"}`);
        return;
      }
      setInstructions(typeof result.instruction === "string" ? result.instruction : "");
      setNote(`${label} \u5B8C\u6210`);
      after?.(result);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }, [refresh]);
  const uploadMany = (0, import_react.useCallback)(async (entries) => {
    const picked = entries.filter((entry) => !isJunkUpload(entry.rel)).slice(0, MAX_UPLOAD_FILES);
    setError("");
    setNote("");
    if (picked.length === 0) {
      setNote("\u6CA1\u6709\u53EF\u4F20\u7684\u6587\u4EF6\uFF1A\u9690\u85CF\u6587\u4EF6\u3001__MACOSX \u4E0E\u7CFB\u7EDF\u7F29\u7565\u56FE\u5DF2\u8DF3\u8FC7\u3002");
      return;
    }
    const skippedByLimit = entries.filter((entry) => !isJunkUpload(entry.rel)).length - picked.length;
    let ok = 0;
    let failed = 0;
    let firstError = "";
    setBusy(`\u4E0A\u4F20 0/${picked.length}`);
    try {
      for (const [index, entry] of picked.entries()) {
        const label = entry.rel.split("/").pop() ?? entry.rel;
        setBusy(`\u4E0A\u4F20 ${index + 1}/${picked.length} \xB7 ${label}`);
        try {
          const response = await fetch("/api/llm-wiki/upload", {
            method: "POST",
            headers: {
              // 整条相对路径都塞进 header：宿主按它建子目录、保留结构。
              "x-filename": encodeURIComponent(entry.rel),
              "x-mime": entry.file.type || "application/octet-stream",
              "content-type": "application/octet-stream"
            },
            body: await entry.file.arrayBuffer()
          });
          const result = await response.json();
          if (result.ok) ok += 1;
          else {
            failed += 1;
            if (firstError === "") firstError = `${result.error?.code ?? ""}\uFF1A${result.error?.message ?? "\u4E0A\u4F20\u5931\u8D25"}`;
          }
        } catch (cause) {
          failed += 1;
          if (firstError === "") firstError = cause instanceof Error ? cause.message : String(cause);
        }
      }
      if (failed === 0) {
        setNote(`\u5DF2\u63A5\u6536 ${ok} \u4E2A\u6587\u4EF6${skippedByLimit > 0 ? `\uFF1B\u53E6\u6709 ${skippedByLimit} \u4E2A\u8D85\u8FC7\u5355\u6B21 ${MAX_UPLOAD_FILES} \u4E2A\u7684\u4E0A\u9650\uFF0C\u6CA1\u4F20` : ""}`);
      } else {
        setError(`${failed} \u4E2A\u6CA1\u4F20\u4E0A\u53BB\uFF08\u6210\u529F ${ok} \u4E2A\uFF09\u3002\u7B2C\u4E00\u4E2A\u5931\u8D25\uFF1A${firstError}`);
      }
      await refresh();
    } finally {
      setBusy("");
    }
  }, [refresh]);
  const collectDrop = (0, import_react.useCallback)(async (transfer) => {
    const items = Array.from(transfer.items ?? []);
    const roots = items.map((item) => typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null).filter((entry) => entry !== null);
    if (roots.length === 0) {
      return Array.from(transfer.files ?? []).map((file) => ({
        file,
        rel: file.webkitRelativePath !== "" ? file.webkitRelativePath : file.name
      }));
    }
    const out = [];
    const walk = async (entry, prefix) => {
      if (out.length > MAX_UPLOAD_FILES * 2) return;
      if (entry.isFile) {
        const file = await new Promise((resolve) => {
          entry.file(resolve, () => {
            resolve(void 0);
          });
        });
        if (file !== void 0) out.push({ file, rel: prefix === "" ? file.name : `${prefix}/${file.name}` });
        return;
      }
      if (!entry.isDirectory) return;
      const reader = entry.createReader();
      const children = [];
      for (; ; ) {
        const batch = await new Promise((resolve) => {
          reader.readEntries(resolve, () => {
            resolve([]);
          });
        });
        if (batch.length === 0) break;
        children.push(...batch);
      }
      const next = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      for (const child of children) await walk(child, next);
    };
    for (const root of roots) await walk(root, "");
    return out;
  }, []);
  const openLibrary = (0, import_react.useCallback)(async () => {
    setBusy("\u6253\u5F00\u77E5\u8BC6\u5E93");
    setError("");
    setNote("");
    try {
      const result = await postJson("/api/llm-wiki/open", { path: "" });
      if (!result.ok) {
        const failure = result.error;
        setError(`${failure?.code ?? "E_OPEN_FAILED"}\uFF1A${failure?.message ?? "\u6CA1\u80FD\u6253\u5F00 Obsidian"}`);
        return;
      }
      const note2 = typeof result.note === "string" ? result.note : "";
      setNote(note2 === "" ? "\u5DF2\u8BA9 Obsidian \u6253\u5F00\u8FD9\u4E2A\u5E93" : note2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }, []);
  const switchLibrary = (0, import_react.useCallback)(async (name) => {
    setBusy(`\u5207\u6362\u5230 ${name}`);
    try {
      const result = await postJson("/api/llm-wiki/library", { op: "switch", name });
      if (!result.ok) {
        setError(result.error?.message ?? "\u5207\u6362\u5931\u8D25");
        return;
      }
      setNote(`\u5F53\u524D\u5E93\u5DF2\u5207\u5230 ${name}`);
      await refresh();
    } finally {
      setBusy("");
    }
  }, [refresh]);
  const createLibrary = (0, import_react.useCallback)(async () => {
    const name = newLibraryName.trim();
    if (name === "") return;
    setBusy(`\u521B\u5EFA ${name}`);
    setError("");
    setNote("");
    try {
      const result = await postJson("/api/llm-wiki/library", { op: "create", name });
      if (!result.ok) {
        const failure = result.error;
        setError(`${failure?.code ?? "E_CREATE_FAILED"}\uFF1A${failure?.message ?? "\u5EFA\u5E93\u5931\u8D25"}`);
        return;
      }
      setShowNewLibrary(false);
      setNewLibraryName("");
      setNote(`\u5DF2\u5EFA\u597D ${name} \u5E76\u5207\u5230\u5B83`);
      await refresh();
      if (!openAfterCreate) return;
      const opened = await postJson("/api/llm-wiki/open", { path: "" });
      if (!opened.ok) {
        const failure = opened.error;
        setError(`${failure?.code ?? "E_OPEN_FAILED"}\uFF1A${failure?.message ?? "\u6CA1\u80FD\u6253\u5F00 Obsidian"}`);
        return;
      }
      const openedNote = typeof opened.note === "string" ? opened.note : "";
      setNote(openedNote === "" ? `\u5DF2\u5EFA\u597D ${name} \u5E76\u5207\u5230\u5B83\uFF0C\u5DF2\u5728 Obsidian \u6253\u5F00` : `\u5DF2\u5EFA\u597D ${name} \u5E76\u5207\u5230\u5B83\uFF1B${openedNote}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }, [newLibraryName, openAfterCreate, refresh]);
  const counts = state.counts;
  const libraries = state.space.libraries;
  const activeName = state.space.active !== "" ? state.space.active : state.library.name;
  const activeLibrary = libraries.find((library) => library.name === activeName);
  const libraryOptions = (0, import_react.useMemo)(() => {
    const list = libraries.map((library) => ({ ...library, missing: false }));
    if (activeName !== "" && !list.some((library) => library.name === activeName)) {
      list.unshift({ name: activeName, path: state.library.path, initialized: false, missing: true });
    }
    return list;
  }, [libraries, activeName, state.library.path]);
  const headline = (0, import_react.useMemo)(() => {
    if (!state.initialized) return "\u8FD9\u4E2A\u5E93\u5728\u78C1\u76D8\u4E0A\u627E\u4E0D\u5230\u4E86";
    if (counts.inbox > 0) return `\u6709 ${counts.inbox} \u6761\u7D20\u6750\u7B49\u4F60\u786E\u8BA4\u662F\u5426\u5165\u5E93`;
    if (counts.proposals > 0) return `\u6709 ${counts.proposals} \u4E2A\u63D0\u6848\u7B49\u4F60\u88C1\u51B3`;
    if (counts.raw > 0) return `1-raw \u6709 ${counts.raw} \u6761\u7D20\u6750\u53EF\u4EE5\u7F16\u8BD1\u6210\u9875\u4E86`;
    if (state.findings.error > 0) return `Wiki \u4F53\u68C0\u53D1\u73B0 ${state.findings.error} \u4E2A\u9700\u8981\u4FEE\u7684\u95EE\u9898`;
    return "\u6CA1\u6709\u5F85\u5904\u7406\u9879";
  }, [counts, state.findings.error]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("style", { children: CSS }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-top", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "who", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", { children: activeName === "" ? "\u8D85\u7EA7\u5927\u8111" : activeName }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "sub", children: headline }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "where lw-mono", children: [
          state.space.path === "" ? "\u5355\u5E93\u6A21\u5F0F" : `\u7A7A\u95F4 ${state.space.path}`,
          state.library.path
        ].filter(Boolean).join(" \xB7 ") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acts", children: [
        libraryOptions.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "select",
          {
            className: "lw-select",
            value: activeName,
            disabled: busy !== "",
            onChange: (event) => {
              void switchLibrary(event.target.value);
            },
            "aria-label": "\u9009\u62E9\u77E5\u8BC6\u5E93",
            title: "\u5207\u6362\u77E5\u8BC6\u5E93",
            children: libraryOptions.map((library) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: library.name, children: [
              library.name,
              library.missing ? "\uFF08\u78C1\u76D8\u4E0A\u6CA1\u6709\uFF09" : library.initialized ? "" : "\uFF08\u672A\u521D\u59CB\u5316\uFF09"
            ] }, library.name))
          }
        ) : null,
        activeLibrary?.initialized === false && state.initialized ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            className: "lw-btn",
            disabled: busy !== "",
            onClick: () => {
              void run("A16", {}, "\u521D\u59CB\u5316\u77E5\u8BC6\u5E93");
            },
            children: "\u521D\u59CB\u5316\u8FD9\u4E2A\u5E93"
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            className: "lw-btn",
            disabled: busy !== "" || state.space.path === "",
            title: state.space.path === "" ? "\u5148\u5728\u8BBE\u7F6E\u91CC\u586B\u77E5\u8BC6\u7A7A\u95F4\u8DEF\u5F84\uFF0C\u624D\u6709\u5730\u65B9\u5EFA\u5E93" : "\u5728\u7A7A\u95F4\u4E0B\u65B0\u5EFA\u4E00\u4E2A\u5E93",
            onClick: () => setShowNewLibrary((v) => !v),
            children: showNewLibrary ? "\u53D6\u6D88\u65B0\u5EFA" : "\u65B0\u5EFA\u77E5\u8BC6\u5E93"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "lw-btn primary", onClick: () => {
          void openLibrary();
        }, children: "\u6253\u5F00\u77E5\u8BC6\u5E93" })
      ] })
    ] }),
    showNewLibrary ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-chead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u65B0\u5EFA\u77E5\u8BC6\u5E93" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "why", children: [
          "\u5728\u7A7A\u95F4 ",
          state.space.path,
          " \u4E0B\u5EFA\u4E00\u4E2A\u6587\u4EF6\u5939\uFF0C\u6309\u56DB\u4E2A\u9636\u6BB5\u628A\u9AA8\u67B6\u5199\u9F50"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-pane", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "lw-note lw-name",
              placeholder: "\u6587\u4EF6\u5939\u540D\uFF0C\u4F8B\u5982 health",
              value: newLibraryName,
              disabled: busy !== "",
              autoFocus: true,
              onChange: (event) => setNewLibraryName(event.target.value),
              onKeyDown: (event) => {
                if (event.key === "Enter") void createLibrary();
              }
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "lw-check", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "checkbox",
                checked: openAfterCreate,
                onChange: (event) => setOpenAfterCreate(event.target.checked)
              }
            ),
            "\u5EFA\u597D\u540E\u5728 Obsidian \u6253\u5F00"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: "lw-btn",
              disabled: busy !== "",
              onClick: () => {
                setShowNewLibrary(false);
                setNewLibraryName("");
              },
              children: "\u53D6\u6D88"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: "lw-btn primary",
              disabled: busy !== "" || newLibraryName.trim() === "",
              onClick: () => {
                void createLibrary();
              },
              children: "\u521B\u5EFA"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-hint", children: "\u4E0D\u7528\u5F00 Finder\u3001\u4E5F\u4E0D\u7528\u5148\u5F00 Obsidian\uFF1A\u76EE\u5F55\u548C WIKI.md / index / log \u90FD\u662F\u5BBF\u4E3B\u5199\u7684\uFF0C \u5EFA\u5B8C\u81EA\u52A8\u5207\u5230\u65B0\u5E93\u3002\u6587\u4EF6\u5939\u91CC\u5DF2\u6709\u5185\u5BB9\u4E0D\u4F1A\u88AB\u8986\u76D6\uFF0C\u5DF2\u5B58\u5728\u7684\u5E93\u4F1A\u88AB\u62D2\u7EDD\u91CD\u5EFA\u3002" })
      ] })
    ] }) : null,
    busy === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-banner", children: [
      "\u6B63\u5728\u6267\u884C ",
      busy,
      "\u2026"
    ] }),
    error === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-err", children: error }),
    note === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-okb", children: note }),
    instructions === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-chead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u8FD9\u4E00\u6B65\u9700\u8981 agent \u63A5\u624B" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "why", children: "\u5DF2\u4EA4\u7ED9\u4E00\u4E2A\u4E00\u6B21\u6027\u4EFB\u52A1" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-spacer" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "lw-btn mini", onClick: () => {
          void navigator.clipboard?.writeText(instructions);
        }, children: "\u590D\u5236\u6307\u4EE4" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "lw-btn mini", onClick: () => setInstructions(""), children: "\u6536\u8D77" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-pane", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-instr", children: instructions }) })
    ] }),
    state.initialized ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-grid", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-col", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-chead", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u5E93\u51B5" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "why", children: "\u53EA\u8BFB\uFF0C3 \u79D2\u5237\u65B0" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-stats", children: [
              [
                ["\u9875", counts.wiki, ""],
                ["\u5F85\u7F16\u8BD1", counts.raw, counts.raw > 0 ? "warn" : ""],
                ["\u5F85\u786E\u8BA4", counts.inbox, counts.inbox > 0 ? "warn" : ""],
                ["\u5F85\u5BA1", counts.proposals, counts.proposals > 0 ? "warn" : ""],
                ["\u5360\u4F4D\u9875", counts.stub, ""],
                ["\u8FC7\u671F", counts.deprecated, ""],
                ["\u5B64\u513F\u9875", counts.orphan, counts.orphan > 0 ? "warn" : ""]
              ].map(([label, value, tone]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `lw-stat${tone === "" ? "" : ` ${tone}`}`, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "k", children: label }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "v", children: value })
              ] }, label)),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `lw-stat${state.health >= 80 ? " ok" : " warn"}`, children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "k", children: "\u5065\u5EB7\u5EA6" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "v", children: [
                  state.health,
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "%" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-bar", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { width: `${Math.max(0, Math.min(100, state.health))}%` } }) })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-statsub", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                "\u5360\u7528 ",
                fmtSize(state.occupancy.total)
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sep" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                "\u9644\u4EF6 ",
                fmtSize(state.occupancy.attachments)
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sep" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                "\u4E2D\u95F4\u7269 ",
                fmtSize(state.occupancy.parts)
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sep" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                "git ",
                state.mode.git ? "\u5F00" : "\u5173"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sep" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
                "\u97F3\u9891 ",
                state.mode.audio === "none" ? "\u4E0D\u8F6C\u5199" : state.mode.audio
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-chead", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u6536\u6599" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "why", children: "\u8FDB\u6765\u7684\u53EA\u662F\u7D20\u6750\uFF0C\u5165\u5E93\u524D\u90FD\u8981\u4F60\u70B9\u4E00\u6B21" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-tabs", role: "tablist", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { role: "tab", "aria-selected": tab === "note", className: `lw-tab${tab === "note" ? " on" : ""}`, onClick: () => setTab("note"), children: "\u7075\u611F" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { role: "tab", "aria-selected": tab === "drop", className: `lw-tab${tab === "drop" ? " on" : ""}`, onClick: () => setTab("drop"), children: "\u6587\u4EF6" })
            ] }),
            tab === "note" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-pane", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "textarea",
                {
                  className: "lw-note",
                  placeholder: "\u968F\u624B\u5199\uFF0C\u843D\u5230 0-inbox\uFF1B\u4E4B\u540E\u518D\u51B3\u5B9A\u8981\u4E0D\u8981\u6536\u8FDB\u5E93\u91CC\u3002",
                  value: draft,
                  onChange: (event) => setDraft(event.target.value)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    className: "lw-btn primary",
                    disabled: busy !== "" || draft.trim() === "",
                    onClick: () => {
                      void run("A01", { text: draft }, "\u5B58\u5165 0-inbox").then(() => setDraft(""));
                    },
                    children: "\u5B58\u5165 0-inbox"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-spacer" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-hint", children: draft.trim() === "" ? "" : `${draft.trim().length} \u5B57` })
              ] })
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-pane", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  className: `lw-drop${over ? " over" : ""}`,
                  onClick: () => fileRef.current?.click(),
                  onDragOver: (event) => {
                    event.preventDefault();
                    setOver(true);
                  },
                  onDragLeave: () => setOver(false),
                  onDrop: (event) => {
                    event.preventDefault();
                    setOver(false);
                    void (async () => {
                      const entries = await collectDrop(event.dataTransfer);
                      if (entries.length > 0) await uploadMany(entries);
                    })();
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "t", children: "\u628A\u6587\u4EF6\u6216\u6574\u4E2A\u6587\u4EF6\u5939\u62D6\u5230\u8FD9\u91CC" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "d", children: "\u6587\u4EF6\u5939\u4F1A\u4FDD\u7559\u539F\u6709\u7684\u76EE\u5F55\u7ED3\u6784\uFF08\u843D\u5728 0-inbox/files/\u539F\u6587\u4EF6\u5939/\u2026\uFF09\u3002 PDF \u4F1A\u62BD\u6B63\u6587\uFF0C\u5F55\u97F3\u6309\u8BBE\u7F6E\u5207\u7247\u8F6C\u5199\uFF0C\u5176\u4F59\u539F\u6837\u5B58\u6863\u3002" })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-hint", children: "\u843D\u5728 0-inbox/files\uFF0C\u540C\u540D\u4E0D\u8986\u76D6\uFF08\u7B2C\u4E8C\u4E2A\u8D77\u843D\u6210 -2\uFF09" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-spacer" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "lw-btn", onClick: () => fileRef.current?.click(), children: "\u9009\u62E9\u6587\u4EF6" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "lw-btn", onClick: () => folderRef.current?.click(), children: "\u4E0A\u4F20\u6587\u4EF6\u5939" })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                ref: fileRef,
                type: "file",
                multiple: true,
                style: { display: "none" },
                onChange: (event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length === 0) return;
                  void uploadMany(files.map((file) => ({
                    file,
                    rel: file.webkitRelativePath !== "" ? file.webkitRelativePath : file.name
                  })));
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                ref: folderRef,
                type: "file",
                multiple: true,
                style: { display: "none" },
                ...{ webkitdirectory: "", directory: "" },
                onChange: (event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length === 0) return;
                  void uploadMany(files.map((file) => ({
                    file,
                    rel: file.webkitRelativePath !== "" ? file.webkitRelativePath : file.name
                  })));
                }
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-card", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-chead", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u6574\u7406" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "why", children: "\u4E00\u4E2A\u6309\u94AE\u5E72\u5B8C\u4E00\u4EF6\u4E8B\uFF1B\u540D\u5B57\u5C31\u662F\u5B83\u5E72\u7684\u4E8B" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-tools", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  className: "lw-btn tile",
                  disabled: busy !== "",
                  title: "\u628A 1-raw \u7684\u7D20\u6750\u7F16\u8BD1\u6210 2-wiki \u9875\u9762\uFF1A\u7D20\u6750\u6210\u9875 + \u53BB\u91CD + \u77DB\u76FE\u6BD4\u5BF9 + \u8865\u5B64\u9875 + \u66F4\u65B0\u7D22\u5F15",
                  onClick: () => {
                    void run("A07", { all: true }, "Wiki \u7F16\u8BD1");
                  },
                  children: [
                    "Wiki \u7F16\u8BD1",
                    counts.raw > 0 ? ` \xB7 ${counts.raw}` : ""
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  className: "lw-btn tile",
                  disabled: busy !== "",
                  title: "\u7528 2-wiki \u73B0\u5728\u7684\u5B9E\u9645\u5185\u5BB9\u91CD\u5199 index.md\uFF1A\u76F8\u5F53\u4E8E\u7ED9\u8FD9\u4E2A\u5E93\u91CD\u753B\u4E00\u5F20\u5730\u56FE",
                  onClick: () => {
                    void run("A15", {}, "\u91CD\u5EFA Wiki \u7D22\u5F15");
                  },
                  children: "\u91CD\u5EFA Wiki \u7D22\u5F15"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  className: "lw-btn tile",
                  disabled: busy !== "",
                  title: "\u67E5\u65AD\u94FE\u3001schema\u3001\u5B64\u9875\u4E0E\u7D22\u5F15\u4E00\u81F4\u6027\uFF1B\u80FD\u4FEE\u7684\u5F53\u573A\u4FEE\uFF0C\u5176\u4F59\u6309\u4E25\u91CD\u5EA6\u5217\u51FA\u6765",
                  onClick: () => {
                    void run("A11", { fix: true }, "Wiki \u4F53\u68C0");
                  },
                  children: [
                    "Wiki \u4F53\u68C0",
                    state.findings.error > 0 ? ` \xB7 ${state.findings.error}` : ""
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  className: "lw-btn tile",
                  disabled: busy !== "",
                  title: "\u6E05\u6389\u5D29\u6E83\u6B8B\u7559\u7684 .tmp\u3001\u97F3\u89C6\u9891\u5207\u7247\u4E2D\u95F4\u7269\u3001\u8FC7\u671F\u7684\u56DE\u6536\u7AD9\u4E0E\u7D22\u5F15\u5907\u4EFD",
                  onClick: () => {
                    void run("A18", {}, "\u6E05\u7406\u4E34\u65F6\u6587\u4EF6");
                  },
                  children: "\u6E05\u7406\u4E34\u65F6\u6587\u4EF6"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  className: "lw-btn tile",
                  disabled: busy !== "",
                  title: "\u6CA1\u6709\u7D20\u6750\u5F15\u7528\u7684\u9644\u4EF6\u300130 \u5929\u6CA1\u786E\u8BA4\u7684\u6536\u4EF6\uFF1A\u5148\u5217\u6E05\u5355\uFF0C\u4F60\u70B9\u5934\u624D\u79FB\u8FDB\u56DE\u6536\u7AD9",
                  onClick: () => {
                    void run("A19", {}, "\u6E05\u7406\u672A\u7528\u9644\u4EF6\u9884\u89C8", (result) => {
                      const detail = result.detail;
                      setDeepCandidates(Array.isArray(detail?.candidates) ? detail.candidates : []);
                    });
                  },
                  children: [
                    "\u6E05\u7406\u672A\u7528\u9644\u4EF6",
                    deepCandidates.length > 0 ? ` \xB7 ${deepCandidates.length}` : ""
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  className: "lw-btn tile",
                  disabled: busy !== "" || !state.git.enabled,
                  title: state.git.enabled ? "\u628A 2-wiki / 3-review \u9000\u56DE\u67D0\u6B21\u63D0\u4EA4\uFF1B\u56DE\u6EDA\u524D\u4F1A\u5148\u7559\u4E00\u4EFD\u5907\u4EFD" : "\u7248\u672C\u56DE\u6EDA\u672A\u5F00\u542F\uFF1A\u5728\u8BBE\u7F6E \u2192 \u63D2\u4EF6 \u2192 LLM Wiki \u91CC\u6253\u5F00 git \u56DE\u6EDA\uFF0C\u5E76\u8BA9\u5E93\u6210\u4E3A git \u4ED3\u5E93",
                  onClick: () => setRollbackOpen((v) => !v),
                  children: "\u7248\u672C\u56DE\u6EDA"
                }
              )
            ] }),
            deepCandidates.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-pane", style: { borderTop: "1px solid var(--lw-line2)" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-hint", children: [
                "\u6E05\u7406\u5019\u9009 ",
                deepCandidates.length,
                " \u9879\uFF08\u672A\u7528\u9644\u4EF6 / \u8D85\u671F\u6536\u4EF6\uFF09\uFF0C\u53EA\u8FDB\u56DE\u6536\u7AD9\u4E0D\u8FDB\u5E93\uFF1A"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-hint lw-mono", style: { maxHeight: 92, overflowY: "auto" }, children: deepCandidates.map((item) => `${item.rel} \u2014 ${item.reason}`).join("\n") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "button",
                  {
                    className: "lw-btn go",
                    disabled: busy !== "",
                    onClick: () => {
                      void run("A19", { items: deepCandidates.map((item) => item.rel) }, "\u6E05\u7406\u672A\u7528\u9644\u4EF6").then(() => setDeepCandidates([]));
                    },
                    children: [
                      "\u79FB\u5165\u56DE\u6536\u7AD9\u8FD9 ",
                      deepCandidates.length,
                      " \u9879"
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "lw-btn", onClick: () => setDeepCandidates([]), children: "\u5148\u4E0D\u52A8" })
              ] })
            ] }),
            rollbackOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-pane", style: { borderTop: "1px solid var(--lw-line2)" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-hint", children: "\u53EA\u56DE\u6EDA 2-wiki \u4E0E 3-review\uFF1A" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "select",
                  {
                    className: "lw-select",
                    style: { maxWidth: "100%", flex: 1 },
                    value: rollbackCommit,
                    onChange: (event) => setRollbackCommit(event.target.value),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "\u9009\u62E9\u63D0\u4EA4\u2026" }),
                      state.git.commits.map((commit) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: commit.hash, children: [
                        commit.hash.slice(0, 8),
                        " \xB7 ",
                        commit.subject
                      ] }, commit.hash))
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    className: "lw-btn go",
                    disabled: busy !== "" || rollbackCommit === "",
                    onClick: () => {
                      void run("A17", { commit: rollbackCommit }, "\u7248\u672C\u56DE\u6EDA").then(() => {
                        setRollbackOpen(false);
                        setRollbackCommit("");
                      });
                    },
                    children: "\u56DE\u6EDA\u5230\u8FD9\u7248"
                  }
                )
              ] })
            ] }) : null,
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-tfoot", children: "Wiki \u7F16\u8BD1 = \u7D20\u6750\u6210\u9875 + \u53BB\u91CD + \u77DB\u76FE\u6BD4\u5BF9 + \u8865\u5B64\u9875 + \u66F4\u65B0\u7D22\u5F15\uFF1B\u6709\u4E89\u8BAE\u53EA\u51FA\u63D0\u6848\uFF0C\u4E0D\u6539\u73B0\u6709\u9875\u3002" })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-col fill", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-card lw-queue", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-chead", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u786E\u8BA4\u961F\u5217" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-spacer" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "lw-badge", children: [
                counts.inbox,
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6761\u5F85\u786E\u8BA4" })
              ] })
            ] }),
            state.inbox.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-void", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "t", children: "\u6536\u4EF6\u7BB1\u662F\u7A7A\u7684" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "d", children: "\u4E0A\u65B9\u300C\u6536\u6599\u300D\u5B58\u8FDB\u6765\u7684\u4E1C\u897F\u4F1A\u5148\u5230\u8FD9\u91CC\uFF0C\u7B49\u4F60\u70B9\u5934\u624D\u8FDB 1-raw\u3002" })
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-scroll", children: state.inbox.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-q", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "body", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "n", children: item.title }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "m", children: [
                    KIND_LABEL[item.kind] ?? item.kind,
                    " \xB7 ",
                    item.origin !== void 0 && item.origin !== "" ? item.origin : dirOf(item.rel)
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acts", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      className: "lw-btn mini go",
                      disabled: busy !== "",
                      title: "\u786E\u8BA4\u8FD9\u6761\u7D20\u6750\uFF1A\u4ECE 0-inbox \u79FB\u8FDB 1-raw",
                      onClick: () => {
                        void run("A05", { items: [item.slug] }, `\u5165\u5E93 ${item.title}`);
                      },
                      children: "\u5165\u5E93"
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      className: "lw-btn mini",
                      disabled: busy !== "",
                      title: "\u628A\u8FD9\u6761\u7D20\u6750\u4ECE 0-inbox \u64A4\u6389\uFF0C\u4E0D\u8FDB\u5E93",
                      onClick: () => {
                        void run("A06", { item: item.slug }, `\u64A4\u56DE ${item.title}`);
                      },
                      children: "\u64A4\u56DE"
                    }
                  )
                ] })
              ] }, item.rel)) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-qfoot", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u786E\u8BA4\u540E\u624D\u8FDB 1-raw" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-spacer" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    className: "lw-btn mini",
                    disabled: busy !== "",
                    onClick: () => {
                      void run("A05", { all: true }, "\u5168\u90E8\u5165\u5E93");
                    },
                    children: "\u5168\u90E8\u5165\u5E93"
                  }
                )
              ] })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-card lw-queue", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-chead", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u63D0\u6848\u961F\u5217" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-spacer" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "lw-badge", children: [
                counts.proposals,
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u6761\u5F85\u5BA1\u6279" })
              ] })
            ] }),
            state.proposals.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-void", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "t", children: "\u6CA1\u6709\u5F85\u88C1\u51B3\u7684\u63D0\u6848" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "d", children: "\u7F16\u8BD1\u3001\u53BB\u91CD\u3001\u77DB\u76FE\u626B\u63CF\u4EA7\u51FA\u7684\u6539\u52A8\u90FD\u4F1A\u5148\u843D 3-review\uFF0C\u7B49\u4F60\u5408\u5E76\u3002" })
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-scroll", children: state.proposals.map((proposal) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-q", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "body", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "n", children: proposal.target }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "m", children: [
                    proposal.action === "update" ? "\u6539\u5199" : proposal.action === "deprecate" ? "\u5E9F\u6B62" : "\u65B0\u5EFA",
                    proposal.reason === "" ? "" : ` \xB7 ${proposal.reason}`
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acts", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      className: "lw-btn mini go",
                      disabled: busy !== "",
                      title: "\u91C7\u7EB3\u8FD9\u4E2A\u63D0\u6848\uFF1A\u628A\u63D0\u6848\u91CC\u7684\u5199\u6CD5\u843D\u8FDB 2-wiki",
                      onClick: () => {
                        void run("A09", { paths: [proposal.path] }, `\u5408\u5E76 ${proposal.target}`);
                      },
                      children: "\u5408\u5E76"
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      className: "lw-btn mini",
                      disabled: busy !== "",
                      title: "\u4E0D\u91C7\u7EB3\uFF1A\u628A\u8FD9\u6761\u63D0\u6848\u5220\u6389\uFF0C\u9875\u9762\u4E0D\u52A8",
                      onClick: () => {
                        void run("P.discard", { paths: [proposal.path] }, `\u4E22\u5F03 ${proposal.target}`);
                      },
                      children: "\u4E22\u5F03"
                    }
                  )
                ] })
              ] }, proposal.path)) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-qfoot", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u9875\u9762\u600E\u4E48\u5199\u7531\u4F60\u88C1\u51B3" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-spacer" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    className: "lw-btn mini",
                    disabled: busy !== "",
                    onClick: () => {
                      void run("A09", { all: true }, "\u5408\u5E76\u5168\u90E8");
                    },
                    children: "\u5168\u90E8\u5408\u5E76"
                  }
                )
              ] })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-chead", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u81EA\u52A8\u5316\u4EFB\u52A1" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "why", children: state.scheduleAvailable ? "\u5F00 = \u5728 DSH \u5EFA\u4E00\u6761\u4EFB\u52A1\uFF1B\u505C = \u771F\u5220" : "\u5B9A\u65F6\u670D\u52A1\u4E0D\u53EF\u7528\uFF1A\u5F00\u5173\u53EA\u5B58\u672C\u5730" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-spacer" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "lw-btn mini", disabled: busy !== "", onClick: () => setShowNewTask((v) => !v), children: showNewTask ? "\u53D6\u6D88" : "\u65B0\u5EFA\u4EFB\u52A1" })
        ] }),
        showNewTask ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-pane lw-form", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "lw-note lw-name",
                placeholder: "\u4EFB\u52A1\u540D\uFF0C\u4F8B\u5982\u300C\u6BCF\u5468\u6574\u7406\u4E00\u6B21\u300D",
                value: newTask.title,
                onChange: (event) => setNewTask({ ...newTask, title: event.target.value })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "lw-select",
                value: newTask.frequency,
                "aria-label": "\u91CD\u590D\u65B9\u5F0F",
                onChange: (event) => setNewTask({ ...newTask, frequency: event.target.value }),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "daily", children: "\u6BCF\u5929" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "weekly", children: "\u6BCF\u5468" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "interval", children: "\u6BCF\u9694 N \u5929" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "monthly", children: "\u6BCF\u6708" })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "lw-select",
                type: "time",
                value: newTask.time,
                "aria-label": "\u6267\u884C\u65F6\u95F4",
                onChange: (event) => setNewTask({ ...newTask, time: event.target.value })
              }
            )
          ] }),
          newTask.frequency === "weekly" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-hint", children: "\u5468\u51E0" }),
            DOW.map((day) => {
              const on = newTask.weekdays.includes(day.value);
              return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  type: "button",
                  "aria-pressed": on,
                  className: `lw-dow${on ? " on" : ""}`,
                  onClick: () => setNewTask({
                    ...newTask,
                    weekdays: on ? newTask.weekdays.filter((value) => value !== day.value) : [...newTask.weekdays, day.value].sort((left, right) => left - right)
                  }),
                  children: day.label
                },
                day.value
              );
            })
          ] }) : null,
          newTask.frequency === "monthly" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-hint", children: "\u6BCF\u6708" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "lw-select",
                value: String(newTask.monthDay),
                "aria-label": "\u6BCF\u6708\u51E0\u53F7",
                onChange: (event) => setNewTask({ ...newTask, monthDay: Number(event.target.value) }),
                children: [
                  Array.from({ length: 31 }, (_, index) => index + 1).map((day) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: day, children: [
                    day,
                    " \u65E5"
                  ] }, day)),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: -1, children: "\u6700\u540E\u4E00\u5929" })
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-hint", children: "\u8BE5\u6708\u6CA1\u6709\u8FD9\u4E00\u5929\u5C31\u8DF3\u8FC7\uFF0C\u4E0D\u63D0\u524D\u4E5F\u4E0D\u987A\u5EF6" })
          ] }) : null,
          newTask.frequency === "interval" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-hint", children: "\u6BCF\u9694" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "lw-select lw-num",
                type: "number",
                min: 2,
                max: 30,
                value: newTask.everyDays,
                onChange: (event) => setNewTask({ ...newTask, everyDays: Number(event.target.value) })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-hint", children: "\u5929\u4E00\u6B21\uFF082\u201330\uFF09" })
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              className: "lw-note lw-name",
              placeholder: "\u4EA4\u7ED9 agent \u7684\u6307\u4EE4\uFF08\u7559\u7A7A\u5C31\u7528\u4EFB\u52A1\u540D\uFF09",
              value: newTask.prompt,
              onChange: (event) => setNewTask({ ...newTask, prompt: event.target.value })
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-hint", children: ruleLabel(newTask) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "lw-btn", onClick: () => setShowNewTask(false), children: "\u53D6\u6D88" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                className: "lw-btn primary",
                disabled: busy !== "" || newTask.title.trim() === "" || newTask.frequency === "weekly" && newTask.weekdays.length === 0,
                onClick: () => {
                  void run("J.create", {
                    title: newTask.title.trim(),
                    frequency: newTask.frequency,
                    time: newTask.time,
                    weekdays: newTask.weekdays,
                    everyDays: newTask.everyDays,
                    monthDay: newTask.monthDay,
                    prompt: newTask.prompt.trim() === "" ? void 0 : newTask.prompt.trim()
                  }, "\u65B0\u5EFA\u4EFB\u52A1").then(() => {
                    setShowNewTask(false);
                    setNewTask({ title: "", frequency: "daily", time: "09:00", prompt: "", weekdays: [1], everyDays: 3, monthDay: 1 });
                  });
                },
                children: "\u521B\u5EFA"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-row", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "lw-btn quiet", onClick: () => setShowPlan((v) => !v), children: showPlan ? "\u6536\u8D77" : "\u8BF4\u4E0D\u6E05\u65F6\u95F4\uFF1F\u7528\u4E00\u53E5\u8BDD\u4EA4\u7ED9 AI" }) }),
          showPlan ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                className: "lw-note lw-name",
                placeholder: "\u4F8B\u5982\uFF1A\u6BCF\u6708\u7B2C\u4E00\u4E2A\u5DE5\u4F5C\u65E5\u65E9\u4E0A 8 \u70B9\uFF0C\u628A\u8FC7\u671F\u63D0\u6848\u6E05\u4E00\u904D",
                value: planText,
                onChange: (event) => setPlanText(event.target.value),
                onKeyDown: (event) => {
                  if (event.key !== "Enter" || planText.trim() === "") return;
                  void run("J.plan", { text: planText.trim() }, "\u4EA4\u7ED9 AI \u6392\u4EFB\u52A1").then(() => {
                    setPlanText("");
                    setShowPlan(false);
                  });
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                className: "lw-btn",
                disabled: busy !== "" || planText.trim() === "",
                onClick: () => {
                  void run("J.plan", { text: planText.trim() }, "\u4EA4\u7ED9 AI \u6392\u4EFB\u52A1").then(() => {
                    setPlanText("");
                    setShowPlan(false);
                  });
                },
                children: "\u8BA9 AI \u5EFA"
              }
            )
          ] }) : null
        ] }) : null,
        state.tasks.builtin.map((job) => {
          const when = typeof job.options.time === "string" ? `${job.kind === "event" ? "\u4E8B\u4EF6" : job.options.time}${job.kind === "clock" ? " \u6BCF\u5929" : ""}` : job.kind === "event" ? "\u4E8B\u4EF6" : "\u5B9A\u65F6";
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `lw-task ${job.enabled ? "on" : "off"}`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "n", children: job.name }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "m", children: job.why })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "when", children: when }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "acts", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  className: `lw-btn mini${job.enabled ? "" : " run"}`,
                  disabled: busy !== "",
                  onClick: () => {
                    void run("J.toggle", { id: job.id, enabled: !job.enabled }, `${job.enabled ? "\u505C\u7528" : "\u542F\u7528"} ${job.name}`);
                  },
                  children: job.enabled ? "\u505C\u7528" : "\u542F\u7528"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  className: "lw-btn mini danger",
                  disabled: busy !== "",
                  onClick: () => {
                    void run("J.delete", { jobId: job.id }, `\u5220\u9664 ${job.name}`);
                  },
                  children: "\u5220\u9664"
                }
              )
            ] })
          ] }, job.id);
        }),
        state.tasks.custom.map((task) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-task", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "n", children: task.title.replace(/^\[wiki\]\s*/u, "") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "m", children: [
              "\u81EA\u5B9A\u4E49 \xB7 ",
              task.status
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "when", children: "\u81EA\u5B9A\u4E49" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "acts", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: "lw-btn mini danger",
              disabled: busy !== "",
              onClick: () => {
                void run("J.delete", { taskId: task.id }, "\u5220\u9664\u4EFB\u52A1");
              },
              children: "\u5220\u9664"
            }
          ) })
        ] }, task.id)),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-qfoot", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "\u5185\u7F6E\u4EFB\u52A1\u7531\u63D2\u4EF6\u5BF9\u8D26\u7EF4\u62A4" }),
          state.tasks.suspects.length === 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-spacer" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
              "\u53E6\u6709 ",
              state.tasks.suspects.length,
              " \u6761\u5C5E\u4E8E\u522B\u7684\u5E93\uFF0C\u4E0D\u663E\u793A\u4E5F\u4E0D\u52A8"
            ] })
          ] })
        ] })
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-chead", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "\u8FD9\u4E2A\u5E93\u5728\u78C1\u76D8\u4E0A\u627E\u4E0D\u5230\u4E86" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "why", children: state.library.path === "" ? "\u5F53\u524D\u5E93\u8DEF\u5F84\u662F\u7A7A\u7684" : state.library.path })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-pane", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "lw-hint", style: { lineHeight: 1.65 }, children: "\u591A\u534A\u662F\u6587\u4EF6\u5939\u88AB\u5220\u6389\u6216\u6539\u540D\u4E86\u3002\u8FD9\u4E2A\u5E93\u7684\u540D\u5B57\u4E0D\u5FC5\u6CBF\u7528\u2014\u2014\u4F60\u53EF\u4EE5\u91CD\u5EFA\u5B83\u7684\u9AA8\u67B6\uFF0C \u4E5F\u53EF\u4EE5\u76F4\u63A5\u6362\u4E2A\u5E93\uFF0C\u6216\u8005\u5EFA\u4E00\u4E2A\u65B0\u7684\u3002\u4E09\u6761\u8DEF\u90FD\u5728\u8FD9\u4E00\u5C4F\uFF1A" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              className: "lw-btn primary",
              disabled: busy !== "",
              onClick: () => {
                void run("A16", {}, "\u91CD\u5EFA\u8FD9\u4E2A\u5E93");
              },
              children: "\u91CD\u5EFA\u8FD9\u4E2A\u5E93"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { className: "lw-btn", disabled: busy !== "", onClick: () => setShowNewLibrary(true), children: "\u65B0\u5EFA\u4E00\u4E2A\u5E93" }),
          libraryOptions.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-hint", children: "\u6216\u4ECE\u53F3\u4E0A\u89D2\u7684\u4E0B\u62C9\u5207\u5230\u522B\u7684\u5E93" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "lw-hint", children: "\u7A7A\u95F4\u91CC\u6CA1\u6709\u522B\u7684\u5E93\u53EF\u5207" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "lw-hint", children: [
          "\u91CD\u5EFA\u53EA\u8865\u9AA8\u67B6\uFF080-inbox / 1-raw / 2-wiki / 3-review + WIKI.md / index / log\uFF09\uFF0C\u4E0D\u78B0\u4EFB\u4F55\u5DF2\u6709\u5185\u5BB9\u3002",
          state.space.path === "" ? " \u53E6\u5916\uFF1A\u77E5\u8BC6\u7A7A\u95F4\u8FD8\u6CA1\u914D\uFF0C\u5148\u5728\u8BBE\u7F6E\u91CC\u586B\u4E00\u4E2A\u76EE\u5F55\uFF0C\u5E93\u624D\u6709\u5730\u65B9\u843D\u3002" : state.space.libraries.length === 0 ? " \u53E6\u5916\uFF1A\u7A7A\u95F4\u76EE\u5F55\u672C\u8EAB\u4E5F\u8BFB\u4E0D\u5230\uFF0C\u53BB\u8BBE\u7F6E\u91CC\u6838\u5BF9\u4E00\u4E0B\u8DEF\u5F84\u3002" : ""
        ] })
      ] })
    ] })
  ] });
}

// client/settings.tsx
var import_react2 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var CSS2 = `
/* \u8BBE\u7F6E\u9875\u7684\u5C42\u7EA7\u53EA\u6709\u4E09\u5C42\uFF0C\u522B\u518D\u52A0\uFF1A\u5206\u533A \u2192 \u8BBE\u7F6E\u9879 \u2192 \u89E3\u91CA\u3002
   \u89C6\u89C9\u4E0A\u4E5F\u53EA\u7ED9\u4E09\u4EF6\u4E8B\u4E0A\u8272\uFF1A\u5206\u533A\u6807\u9898\u7684\u4E3B\u9898\u8272\u5C0F\u6807\u3001\u63A7\u4EF6\u672C\u8EAB\u7684\u8FB9\u6846\u3001\u4EE5\u53CA\u4E3B\u6309\u94AE\u3002
   \u5176\u4F59\u5168\u90E8\u9760\u5B57\u91CD\u3001\u5B57\u53F7\u3001\u53D1\u4E1D\u7EBF\u548C\u4E00\u4E2A\u6781\u6DE1\u7684\u60AC\u505C\u5E95\u7EB9\u533A\u5206\u2014\u2014\u8BBE\u7F6E\u9875\u770B\u7740"\u82B1"\u6BD4\u770B\u7740"\u5E73"\u66F4\u7CDF\u3002 */
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

/* \u5F00\u573A\u4E00\u53E5\uFF1A\u8BF4\u6E05\u8FD9\u4E00\u9875\u7BA1\u4EC0\u4E48\u3001\u6539\u5B8C\u843D\u5728\u54EA\u3002 */
.lws-lede{font-size:12px;line-height:1.7;color:var(--s-dim);max-width:64ch;margin:0}

/* \u5206\u533A = \u4E00\u5F20\u5361\uFF1A\u6807\u9898\u4E00\u6761\u3001\u4E0B\u9762\u662F\u8BBE\u7F6E\u9879\u3002\u5361\u4E0E\u5361\u4E4B\u95F4\u9760\u7559\u767D\u5206\u5F00\uFF0C\u4E0D\u9760\u518D\u5957\u4E00\u5C42\u8FB9\u6846\u3002 */
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

/* \u4E00\u884C\u8BBE\u7F6E\u9879\uFF1A\u5DE6\u8BF4\u660E\u3001\u53F3\u63A7\u4EF6\u3002\u89E3\u91CA\u653E\u5728\u8BF4\u660E\u4E0B\u9762\uFF0C\u7F29\u4E00\u53F7\u3001\u9000\u4E00\u7EA7\u989C\u8272\u3002 */
.lws-row{display:flex;align-items:flex-start;gap:16px;padding:11px 14px;border-top:1px solid var(--s-line2);min-height:34px;transition:background .14s}
.lws-h+.lws-row,.lws-sec>.lws-row:first-child{border-top:0}
.lws-row:hover{background:color-mix(in srgb, var(--s-accent) 3.5%, transparent)}
.lws-row.vert{flex-direction:column;align-items:stretch;gap:8px}
.lws-lb{flex:1;min-width:0;color:var(--s-ink);font-weight:500;line-height:1.45}
.lws-lb small{display:block;font-size:11px;color:var(--s-dim);margin-top:3px;line-height:1.6;font-weight:400;letter-spacing:.1px}
.lws-ct{display:flex;align-items:center;gap:8px;flex:0 0 auto;flex-wrap:wrap;justify-content:flex-end}
.lws-ct.wide{flex:1 1 100%;justify-content:flex-start}

/* \u63A7\u4EF6\uFF1A\u7EDF\u4E00 30px \u9AD8\u30018px \u5706\u89D2\uFF1B\u8F93\u5165\u7528"\u6D45\u5185\u51F9"\u800C\u4E0D\u662F\u7EAF\u767D\uFF0C\u8BA9\u5B83\u548C\u5361\u7247\u5206\u5F00\u4E00\u5C42\u3002 */
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

/* \u6309\u94AE\u4E09\u6863\uFF1Aprimary \u53EA\u6709"\u4FDD\u5B58"\uFF1B\u666E\u901A\u64CD\u4F5C\u4E2D\u6027\uFF1B\u6587\u672C\u578B\u7ED9\u9759\u9ED8\u52A8\u4F5C\u3002 */
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

/* \u5F00\u5173\uFF1A\u6BD4\u539F\u6765\u5927\u4E00\u5708\uFF0C\u4E24\u79CD\u72B6\u6001\u7528"\u5B9E\u5FC3 vs \u7A7A\u5FC3"\u533A\u5206\uFF0C\u4E0D\u53EA\u9760\u989C\u8272\u6DF1\u6D45\u3002 */
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

/* \u63D0\u793A\u6761\uFF1A\u4E00\u6761\u4FE1\u606F\u4E00\u884C\uFF0C\u5DE6\u8FB9\u4E00\u9053\u540C\u8272\u7AD6\u6761\u2014\u2014\u989C\u8272\u53EA\u8868\u793A\u7ED3\u679C\uFF0C\u4E0D\u8868\u793A\u88C5\u9970\u3002 */
.lws-note{
  font-size:11.5px;line-height:1.6;padding:7px 11px;border-radius:8px;
  background:var(--dsw-alias-bg-secondary,rgba(0,0,0,.04));color:var(--s-ink2);
  border-left:2px solid var(--s-line);
}
.lws-note.warn{background:color-mix(in srgb, var(--s-warn) 10%, transparent);color:var(--s-warn);border-left-color:var(--s-warn)}
.lws-note.err{background:color-mix(in srgb, var(--s-err) 10%, transparent);color:var(--s-err);border-left-color:var(--s-err)}
.lws-note.ok{background:color-mix(in srgb, var(--s-ok) 10%, transparent);color:var(--s-ok);border-left-color:var(--s-ok)}

/* "\u5F53\u524D\u5728\u54EA"\uFF1A\u7B49\u5BBD\u5B57\u4F53\u4E00\u5757\u5E95\uFF0C\u8BFB\u8D77\u6765\u50CF\u7EC8\u7AEF\u91CC\u7684\u4E00\u884C\u4E8B\u5B9E\uFF0C\u800C\u4E0D\u662F\u6B63\u6587\u3002 */
.lws-anchor{
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.8;
  color:var(--s-dim);word-break:break-all;padding:9px 11px;border-radius:8px;
  background:color-mix(in srgb, var(--s-ink) 3%, var(--s-surface));
  border-left:2px solid var(--s-accent-line);
}
.lws-anchor b{color:var(--s-ink2);font-weight:600;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;font-size:11.5px}

/* \u5E95\u90E8\u4FDD\u5B58\u6761\uFF1A\u4E00\u6761\u53D1\u4E1D\u7EBF\u9694\u5F00\uFF0C\u6309\u94AE\u6C89\u5230\u53F3\u4E0B\uFF0C\u63D0\u793A\u72EC\u5360\u4E00\u884C\u3002 */
.lws-foot{
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:10px 2px 0;border-top:1px solid var(--s-line2);margin-top:2px;
}
.lws-foot .lws-note{flex:1 1 100%}
.lws-foot .spacer{flex:1}
.lws-dirty{font-size:11.5px;color:var(--s-warn)}
.lws-disk{font-size:10.5px;line-height:1.75;color:var(--s-dim);word-break:break-all}
.lws-disk code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;color:var(--s-ink2)}
`;
async function getConfig() {
  let response;
  try {
    response = await fetch("/api/llm-wiki/config", { headers: { accept: "application/json" }, cache: "no-store" });
  } catch (error) {
    return { problem: `\u8BF7\u6C42\u6CA1\u53D1\u51FA\u53BB\uFF1A${error instanceof Error ? error.message : String(error)}` };
  }
  if (response.status === 404) {
    return { problem: "\u5BBF\u4E3B\u4E0A\u6CA1\u6709 /api/llm-wiki/config \u8FD9\u6761\u8DEF\u7531\uFF1A\u63D2\u4EF6\u5DF2\u542F\u7528\u4F46\u8DEF\u7531\u6CA1\u6302\u4E0A\u3002\u91CD\u542F DSH \u540E\u91CD\u8BD5\uFF1B\u82E5\u4ECD\u8FD9\u6837\uFF0C\u8BF4\u660E\u8DD1\u7684\u8FD8\u662F\u65E7\u7248\u63D2\u4EF6\u4EE3\u7801\u3002" };
  }
  if (response.status === 401 || response.status === 403) {
    return { problem: `\u5BBF\u4E3B\u62D2\u7EDD\u4E86\u8FD9\u6B21\u8BFB\u53D6\uFF08HTTP ${response.status}\uFF09\uFF1A\u9762\u677F\u8DEF\u7531\u53EA\u5BF9\u672C\u673A\u7A97\u53E3\u5F00\u653E\uFF0C\u8FDC\u7AEF\u4F1A\u8BDD\u8BFB\u4E0D\u5230\u3002\u8BF7\u5728\u4E3B\u673A\u7A97\u53E3\u6253\u5F00\u8BBE\u7F6E\u9875\u3002` };
  }
  if (!response.ok) {
    return { problem: `\u5BBF\u4E3B\u8FD4\u56DE HTTP ${response.status}\u3002` };
  }
  const data = await response.json().catch(() => void 0);
  if (data?.config === void 0) return { problem: "\u5BBF\u4E3B\u5E94\u7B54\u91CC\u6CA1\u6709 config \u5B57\u6BB5\uFF1A\u63D2\u4EF6\u53EF\u80FD\u521A\u91CD\u542F\uFF0C\u7A0D\u540E\u91CD\u8BD5\u3002" };
  return {
    config: data.config,
    configPath: typeof data.configPath === "string" ? data.configPath : "",
    settingsPath: typeof data.settingsPath === "string" ? data.settingsPath : ""
  };
}
function WikiSettings() {
  const [saved, setSaved] = (0, import_react2.useState)(void 0);
  const [configPath, setConfigPath] = (0, import_react2.useState)("");
  const [settingsPath, setSettingsPath] = (0, import_react2.useState)("");
  const [draft, setDraft] = (0, import_react2.useState)({});
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [message, setMessage] = (0, import_react2.useState)(void 0);
  const reload = (0, import_react2.useCallback)(async () => {
    const result = await getConfig();
    if (result.config === void 0) {
      setMessage({ tone: "err", text: result.problem ?? "\u8BFB\u4E0D\u5230\u63D2\u4EF6\u914D\u7F6E\u3002" });
      return;
    }
    setSaved(result.config);
    setConfigPath(result.configPath ?? "");
    setSettingsPath(result.settingsPath ?? "");
    setMessage(void 0);
  }, []);
  (0, import_react2.useEffect)(() => {
    void reload();
  }, [reload]);
  const set = (0, import_react2.useCallback)((key, value2) => {
    setDraft((prev) => ({ ...prev, [key]: value2 }));
    setMessage(void 0);
  }, []);
  const value = (key) => draft[key] !== void 0 ? draft[key] : saved?.[key];
  const dirty = Object.keys(draft).length > 0;
  const save = (0, import_react2.useCallback)(async () => {
    if (!dirty) return;
    setBusy(true);
    setMessage(void 0);
    try {
      const response = await fetch("/api/llm-wiki/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: draft })
      });
      const data = await response.json().catch(() => ({ ok: false }));
      if (!data.ok) {
        setMessage({ tone: "err", text: data.error ?? `\u4FDD\u5B58\u5931\u8D25\uFF08HTTP ${response.status}\uFF09` });
        return;
      }
      if (data.config !== void 0) setSaved(data.config);
      if (typeof data.configPath === "string" && data.configPath !== "") setConfigPath(data.configPath);
      if (typeof data.settingsPath === "string" && data.settingsPath !== "") setSettingsPath(data.settingsPath);
      setDraft({});
      if (data.persisted === false) {
        setMessage({ tone: "err", text: data.error ?? "\u6539\u52A8\u6CA1\u5199\u8FDB\u78C1\u76D8\u3002" });
        return;
      }
      const file = typeof data.file === "string" && data.file !== "" ? data.file : data.via === "profile" ? configPath : settingsPath;
      const head = `\u5DF2\u5199\u5165 ${file}\uFF0C${data.applied === false ? "\u91CD\u542F\u540E\u751F\u6548" : "\u5DF2\u5C31\u5730\u751F\u6548"}`;
      const tail = data.pathsChanged === true ? "\uFF1B\u5F53\u524D\u5E93\u5DF2\u5207\u5230\u65B0\u8DEF\u5F84" : "";
      const mirror = data.profileSynced === true ? "\uFF1Bprofile \u914D\u7F6E\u4E5F\u5DF2\u540C\u6B65" : "";
      const downgrade = data.profileSynced === false && typeof data.note === "string" && data.note !== "" ? `\uFF08${data.note}\uFF09` : "";
      setMessage({ tone: "ok", text: `${head}${tail}${mirror}\u3002${downgrade}` });
    } catch (error) {
      setMessage({ tone: "err", text: `\u4FDD\u5B58\u5931\u8D25\uFF1A${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setBusy(false);
    }
  }, [dirty, draft]);
  if (saved === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS2 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `lws-note ${message === void 0 ? "" : "err"}`, children: message?.text ?? "\u6B63\u5728\u8BFB\u53D6\u63D2\u4EF6\u914D\u7F6E\u2026" }),
      message === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "lws-foot", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "lws-btn", onClick: () => {
        setMessage(void 0);
        void reload();
      }, children: "\u91CD\u8BD5" }) })
    ] });
  }
  const row = (label, hint, control) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-lb", children: [
      label,
      hint === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: hint })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "lws-ct", children: control })
  ] });
  const pathRow = (key, placeholder) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "lws-row vert", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "lws-ct wide", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "input",
    {
      className: "lws-in mono grow",
      value: String(value(key) ?? ""),
      placeholder,
      spellCheck: false,
      disabled: busy,
      onChange: (event) => set(key, event.target.value)
    }
  ) }) });
  const toggle = (key) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "button",
    {
      type: "button",
      role: "switch",
      "aria-checked": value(key) === true,
      "aria-label": key,
      className: `lws-sw${value(key) === true ? " on" : ""}`,
      disabled: busy,
      onClick: () => set(key, value(key) !== true),
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("i", {})
    }
  );
  const num = (key, min, max, step, unit) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "input",
      {
        className: "lws-in lws-num",
        type: "number",
        min,
        max,
        step,
        value: String(value(key) ?? ""),
        disabled: busy,
        onChange: (event) => {
          const parsed = Number(event.target.value);
          set(key, Number.isFinite(parsed) ? parsed : min);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "lws-unit", children: unit })
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("style", { children: CSS2 }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "lws-lede", children: "\u9762\u677F\u8D1F\u8D23\u65E5\u5E38\u64CD\u4F5C\uFF0C\u8FD9\u91CC\u653E\u914D\u7F6E\u672C\u8EAB\u3002\u6240\u6709\u6539\u52A8\u90FD\u4F1A\u5199\u56DE profile \u7684\u63D2\u4EF6\u914D\u7F6E\u5E76\u91CD\u8F7D\u63D2\u4EF6\uFF0C \u4E0E\u78C1\u76D8\u4E0A\u7684\u90A3\u4EFD\u59CB\u7EC8\u662F\u540C\u4E00\u4EFD\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-h", children: [
        "\u77E5\u8BC6\u7A7A\u95F4",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "d", children: "Obsidian \u7684\u5DE5\u4F5C\u76EE\u5F55\uFF1B\u5E93\u662F\u5B83\u4E0B\u9762\u7684\u6587\u4EF6\u5939" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "flag", children: "\u53EF\u7F16\u8F91" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-lb", children: [
        "\u7A7A\u95F4\u8DEF\u5F84",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: "\u6362\u7A7A\u95F4 = \u6362\u4E00\u6279\u5E93\u3002\u4FDD\u5B58\u540E\u63D2\u4EF6\u91CD\u8F7D\uFF0C\u9762\u677F\u9876\u90E8\u7684\u300C\u6253\u5F00\u77E5\u8BC6\u5E93\u300D\u8DDF\u7740\u6307\u5411\u65B0\u7A7A\u95F4\u91CC\u7684\u5F53\u524D\u5E93\u3002" })
      ] }),
      pathRow("spacePath", "/Users/you/obsidian-workspace"),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-lb", style: { marginTop: 10 }, children: [
        "\u5355\u5E93\u6A21\u5F0F\u7684\u5E93\u8DEF\u5F84",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: "\u53EA\u5728\u7A7A\u95F4\u91CC\u8FD8\u6CA1\u8BB0\u4E0B\u5F53\u524D\u5E93\u65F6\u515C\u5E95\uFF1B\u5E73\u65F6\u7559\u7A7A\u5373\u53EF\u3002" })
      ] }),
      pathRow("libraryPath", "/Users/you/obsidian-workspace/llm-wiki"),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-anchor", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("b", { children: "\u5F53\u524D\u5E93" }),
        "\u3000",
        saved.resolvedLibraryPath === void 0 || saved.resolvedLibraryPath === "" ? "\uFF08\u8FD8\u6CA1\u5B9A\u4E0B\u6765\uFF09" : saved.resolvedLibraryPath,
        saved.activeLibrary === void 0 || saved.activeLibrary === "" ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          "\u3000\xB7\u3000\u8BB0\u5728\u7A7A\u95F4\u91CC\u7684\u540D\u5B57\uFF1A",
          saved.activeLibrary
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-h", children: [
        "\u5199\u5165\u4E0E\u5BA1\u6279",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "d", children: "\u51B3\u5B9A\u673A\u5668\u80FD\u81EA\u5DF1\u8D70\u5230\u54EA\u4E00\u6B65" })
      ] }),
      row(
        "\u5199\u5165\u6A21\u5F0F",
        "propose\uFF1A\u9875\u9762\u5148\u8FDB 3-review \u7B49\u4F60\u88C1\u51B3\uFF1Bdirect\uFF1Aagent \u76F4\u63A5\u5199 2-wiki",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "select",
          {
            className: "lws-in",
            value: String(value("writeMode") ?? "propose"),
            disabled: busy,
            onChange: (event) => set("writeMode", event.target.value),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "propose", children: "propose \xB7 \u5148\u51FA\u63D0\u6848" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "direct", children: "direct \xB7 \u76F4\u63A5\u5199\u5E93" })
            ]
          }
        )
      ),
      row(
        "\u68C0\u7D22\u5019\u9009\u4E0A\u9650",
        "\u4E00\u6B21\u6700\u591A\u8FD4\u56DE\u591A\u5C11\u6761\u547D\u4E2D",
        num("maxCandidates", 1, 20, 1, "\u6761")
      ),
      row(
        "\u5E93\u540D",
        "\u9762\u677F\u4E0E\u4EFB\u52A1\u6807\u9898\u91CC\u663E\u793A\u7684\u540D\u5B57\uFF1B\u4E0D\u6539\u53D8\u78C1\u76D8\u4E0A\u7684\u76EE\u5F55",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            className: "lws-in",
            value: String(value("libraryName") ?? ""),
            disabled: busy,
            onChange: (event) => set("libraryName", event.target.value)
          }
        )
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-h", children: [
        "\u97F3\u89C6\u9891",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "d", children: "\u957F\u5F55\u97F3\u5148\u5207\u7247\u518D\u8F6C\u5199" })
      ] }),
      row(
        "\u8F6C\u5199\u901A\u9053",
        "none\uFF1A\u53EA\u5B58\u6863\u4E0D\u8F6C\u5199\uFF1Bwhisper\uFF1A\u672C\u673A whisper-cli\uFF1Bapi\uFF1A\u8D70\u8FDC\u7AEF\u63A5\u53E3",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "select",
          {
            className: "lws-in",
            value: String(value("audioProvider") ?? "none"),
            disabled: busy,
            onChange: (event) => set("audioProvider", event.target.value),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "none", children: "none \xB7 \u4E0D\u8F6C\u5199" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "whisper", children: "whisper \xB7 \u672C\u673A" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "api", children: "api \xB7 \u8FDC\u7AEF" })
            ]
          }
        )
      ),
      row("\u5355\u6587\u4EF6\u4E0A\u9650", "\u8D85\u8FC7\u8FD9\u4E2A\u957F\u5EA6\u7684\u5F55\u97F3\u4F1A\u88AB\u62D2\u7EDD\u6216\u5207\u7247", num("audioMaxMinutes", 5, 120, 1, "\u5206\u949F")),
      row("\u5207\u7247\u957F\u5EA6", "\u6BCF\u7247\u8F6C\u5199\u5B8C\u518D\u62FC\u8D77\u6765", num("audioChunkMinutes", 2, 30, 1, "\u5206\u949F"))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-sec", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-h", children: [
        "\u7248\u672C\u4E0E\u76D1\u542C",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "d", children: "\u51FA\u4E8B\u4E86\u80FD\u4E0D\u80FD\u9000\u56DE\u53BB" })
      ] }),
      row(
        "git \u56DE\u6EDA",
        "\u5F00\u542F\u540E\u6BCF\u6B21\u5408\u5E76\u662F\u4E00\u4E2A\u53EF\u56DE\u6EDA\u7684 commit\uFF1B\u8981\u6C42\u5E93\u672C\u8EAB\u662F git \u4ED3\u5E93",
        toggle("gitEnabled")
      ),
      row("\u5408\u5E76\u540E\u81EA\u52A8\u63D0\u4EA4", void 0, toggle("gitAutoCommit")),
      row(
        "\u76D1\u542C\u5E93\u76EE\u5F55",
        "\u5E93\u4E00\u6709\u6539\u52A8\u5C31\u81EA\u52A8\u91CD\u5199 index.md\uFF0C\u7701\u6389\u624B\u70B9\u300C\u91CD\u5EFA Wiki \u7D22\u5F15\u300D",
        toggle("watchLibrary")
      ),
      row("\u9632\u6296\u95F4\u9694", "\u8FDE\u7EED\u591A\u6B21\u6539\u52A8\u5408\u5E76\u6210\u4E00\u6B21\u91CD\u5EFA", num("debounceMs", 500, 5e3, 100, "\u6BEB\u79D2")),
      row(
        "Obsidian vault \u540D",
        "\u6DF1\u94FE\u4E0E\u5BA2\u6237\u7AEF\u90FD\u7528\u5B83\uFF1B\u7559\u7A7A\u53D6\u5E93\u76EE\u5F55\u540D",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "input",
          {
            className: "lws-in",
            value: String(value("vaultName") ?? ""),
            placeholder: "\u7559\u7A7A = \u7528\u76EE\u5F55\u540D",
            disabled: busy,
            onChange: (event) => set("vaultName", event.target.value)
          }
        )
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-foot", children: [
      message === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `lws-note ${message.tone}`, children: message.text }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "spacer" }),
      dirty && message === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "lws-dirty", children: "\u6709\u672A\u4FDD\u5B58\u7684\u6539\u52A8" }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "lws-btn",
          disabled: busy || !dirty,
          onClick: () => {
            setDraft({});
            setMessage(void 0);
          },
          children: "\u653E\u5F03"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          className: "lws-btn primary",
          disabled: busy || !dirty,
          onClick: () => {
            void save();
          },
          children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "lws-disk", children: [
      "\u843D\u76D8\u4F4D\u7F6E",
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
      "profile \u914D\u7F6E\uFF1A",
      configPath === "" ? "\uFF08\u5BBF\u4E3B\u6CA1\u62A5\u51FA profile \u8DEF\u5F84\uFF0C\u591A\u534A\u662F CLI \u573A\u666F\uFF09" : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: configPath }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
      "\u63D2\u4EF6\u8BBE\u7F6E\uFF1A",
      settingsPath === "" ? "\uFF08\u6CA1\u6709\u53EF\u5199\u7684 profile \u76EE\u5F55\uFF09" : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: settingsPath }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("br", {}),
      "\u4E24\u6761\u90FD\u5728\u78C1\u76D8\u4E0A\uFF0C\u91CD\u542F\u4E4B\u540E\u4ECD\u7136\u662F\u4FDD\u5B58\u7684\u503C\uFF1B\u8BBE\u7F6E\u9875\u4F18\u5148\u5199 profile\uFF0C\u88AB profile \u7684\u7EC4\u5408\u5C42\u6321\u4F4F\u65F6\u5199\u63D2\u4EF6\u8BBE\u7F6E\u3002"
    ] })
  ] });
}

// client/index.ts
var inject = ["slots"];
function apply(ctx) {
  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "llm-wiki",
    // order 大一点：排在 Chat / Trajectory 之后，不抢默认落点。
    order: 60,
    label: "\u77E5\u8BC6\u5E93"
  }, WikiPanel));
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "llm-wiki",
    order: 60,
    label: () => "LLM Wiki \xB7 \u77E5\u8BC6\u5E93"
  }, WikiSettings));
}
;return module.exports}});
