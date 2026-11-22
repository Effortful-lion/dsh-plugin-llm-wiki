# reference/ —— 只读参考，不要编译

这是 v0.2.0 宿主侧实现的三份源码快照，**保留原因**：里面已有 5 个工具的参数校验、输出 schema、`assertWritable` 越界判定、快照缓存这些踩过坑的写法，值得照抄细节。

| 文件 | 行数 | 值得借鉴的点 | 不要照抄的点 |
|---|---|---|---|
| `index.ts` | 50 | `inject` 声明、`apply(ctx, config)` 形状、工具注册循环 | 目录布局是旧的（`raw/wiki/50_review`），且只注入了 `tools`/`fs` |
| `store.ts` | 173 | `assertWritable` 用 `path.relative` 判越界、快照按 mtime 缓存、写前 `await fs.stat` 校验 | 无写锁、无 `0-inbox` |
| `tools.ts` | 491 | 输出 schema `additionalProperties:false` + 逐字段 `required:true`（PRD §7 的硬要求就来自这里的踩坑）；`wiki_read` 的 head/toc/full 三档预算；`ToolArgsError(violations: string[])` 签名 | 只有 5 个工具（缺 `wiki_action`）；直接写文件、不经动作层 |

**三条纪律**：

1. 这些文件不参与任何构建。`esbuild` 的入口是 `host/index.ts` 与 `client/index.ts`，不是这里。
2. 端口时按 `docs/PRD.md` §2/§5/§7 的签名写，不要因为"这里能跑"就保留旧结构。
3. 移植完成后本目录即可删除——它只是过渡期的参照物。
