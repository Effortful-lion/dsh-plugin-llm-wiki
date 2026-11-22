/**
 * 模型面：6 个工具。它们只做"读指针 / 读页 / 提提案 / 体检 / 建库 / 触发动作"，
 * 不替 agent 下判断，也不把正文整段塞进上下文。
 */

import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'

import { buildPageText, proposalPath, buildProposalText, validateDraft } from '../core/draft.ts'
import { renderIndex } from '../core/index-page.ts'
import { lintSnapshot, pageHealth, summarize } from '../core/lint.ts'
import { searchPages } from '../core/search.ts'
import { backlinksOf, relatedOf } from '../core/parse.ts'
import {
  CONTENT_TYPES,
  LIMITS,
  WIKI_LAYOUT,
  type PageType,
  type WikiPage,
} from '../core/model.ts'
import type { Actions } from './actions.ts'
import type { WikiStore } from './store.ts'

export interface ToolDeps {
  store: WikiStore
  actions: Actions
  /** 默认写入模式：propose 落 3-review，direct 落 2-wiki。 */
  writeMode: 'propose' | 'direct'
  maxCandidates: number
}

const TEXT = (text: string) => [{ type: 'text' as const, text }]

function nowIso(): string {
  return new Date().toISOString()
}

function outlineOf(body: string): string {
  const lines = body.split('\n').filter(line => /^#{1,3}\s/.test(line))
  return lines.length === 0 ? '（无标题层级）' : lines.join('\n')
}

function composeContent(page: WikiPage, mode: 'head' | 'toc' | 'full'): string {
  if (mode === 'toc') return outlineOf(page.body)
  const limit = mode === 'full' ? LIMITS.fullPageChars : LIMITS.headChars
  if (page.body.length <= limit) return page.body
  return `${page.body.slice(0, limit)}\n\n…（${mode} 模式截断于 ${limit} 字符；需要全文用 mode=full）`
}

function typeFilter(values: string[] | undefined): PageType[] | undefined {
  if (values === undefined || values.length === 0) return undefined
  const invalid = values.filter(value => !(CONTENT_TYPES as string[]).includes(value))
  if (invalid.length > 0) throw new ToolArgsError([`未知 type：${invalid.join(', ')}；可用 ${CONTENT_TYPES.join(' / ')}`])
  return values as PageType[]
}

/** 把一句话摘要压成模型可读的一行。 */
function hitLine(index: number, hit: { id: string, type: string, status: string, title: string, summary: string, inbound: number }): string {
  return `${index + 1}. [${hit.type}/${hit.status}] ${hit.title} — \`${hit.id}\`${hit.inbound > 0 ? ` · ←${hit.inbound}` : ''}\n   ${hit.summary}`
}

export function registerWikiTools(ctx: Context, deps: ToolDeps): void {
  const { store, actions } = deps

  ctx.tools.register(defineTool({
    name: 'wiki_search',
    description: [
      'Search the wiki by title, alias, tag, summary and id. Returns pointers only (id + ≤110 字摘要), never full text.',
      'Always search before creating a page: an existing page usually should be updated instead of duplicated.',
    ].join(' '),
    parameters: {
      query: { type: 'string', required: true, description: '关键词；空格分词，全部命中优先。空串返回按入链排序的概览。' },
      domain: { type: 'string', description: '限定领域（frontmatter.domain）。' },
      types: { type: 'array', items: { type: 'string', enum: [...CONTENT_TYPES] }, description: '限定页面类型。' },
      limit: { type: 'number', description: `返回条数上限，默认 ${deps.maxCandidates}，最大 20。` },
      include_deprecated: { type: 'boolean', description: '是否包含已废止页（默认不含）。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          hits: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                title: { type: 'string', required: true },
                type: { type: 'string', required: true },
                status: { type: 'string', required: true },
                summary: { type: 'string', required: true },
                domain: { type: 'string', required: true },
                updated: { type: 'string', required: true },
                score: { type: 'number', required: true },
                inbound: { type: 'integer', required: true },
              },
            },
          },
          hint: { type: 'string', required: true },
        },
      },
      render: (_args, value) => TEXT(value.hits.length === 0
        ? `没有命中。换一组词，或先从 0-inbox 确认素材 / 让采集任务送料。\n${value.hint}`
        : `命中 ${value.hits.length} 页：\n${value.hits.map((hit, index) => hitLine(index, hit)).join('\n')}\n\n${value.hint}`),
    },
    presentCall: args => ({ card: 'generic' as const, title: `搜索 wiki：${args.query || '（概览）'}`, kind: 'search' as const }),
    async execute(args) {
      const { snapshot } = await store.load()
      const limit = Math.max(1, Math.min(args.limit ?? deps.maxCandidates, 20))
      const hits = searchPages(snapshot, args.query ?? '', {
        types: typeFilter(args.types),
        domain: args.domain,
        limit,
        includeDeprecated: args.include_deprecated === true,
      })
      return {
        hits: hits.map(hit => ({
          id: hit.id,
          title: hit.title,
          type: hit.type,
          status: hit.status,
          summary: hit.summary,
          domain: hit.domain ?? '',
          updated: hit.updated,
          score: hit.score,
          inbound: hit.inbound,
        })),
        hint: hits.length > 0
          ? '下一步：wiki_read 最相关的 2–4 页（mode=head），需要细节再 mode=full；不要一次读十页。'
          : '若确实缺页：先看 0-inbox / 1-raw 里有没有能编译的素材，再考虑 wiki_write 建 stub。',
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'wiki_read',
    description: [
      'Read wiki pages by id (index/log allowed). Modes: head (frontmatter + 前后 1200 字), toc (标题层级), full (≤12000 字).',
      'Each page returns its 关联出链、反链与 lint 摘要，方便沿链接跳，而不是重新搜索。',
    ].join(' '),
    parameters: {
      ids: { type: 'array', required: true, items: { type: 'string' }, description: `页面 id（如 concepts/x、index）。一次最多 ${LIMITS.readBatch} 页。` },
      mode: { type: 'string', enum: ['head', 'toc', 'full'], description: '读取深度，默认 head。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pages: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                title: { type: 'string', required: true },
                status: { type: 'string', required: true },
                domain: { type: 'string', required: true },
                updated: { type: 'string', required: true },
                content: { type: 'string', required: true },
                related: { type: 'array', required: true, items: { type: 'string' } },
                backlinks: { type: 'array', required: true, items: { type: 'string' } },
                health: { type: 'string', required: true },
              },
            },
          },
          missing: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => TEXT([
        value.pages.map(page => [
          `## ${page.title} — \`${page.id}\`  [${page.status}]${page.domain === '' ? '' : ` · ${page.domain}`}`,
          page.content,
          `关联：${page.related.length === 0 ? '（无）' : page.related.join('、')}`,
          `反链：${page.backlinks.length === 0 ? '（无）' : page.backlinks.join('、')}`,
          `健康：${page.health}`,
        ].join('\n')).join('\n\n'),
        value.missing.length === 0 ? '' : `未找到：${value.missing.join('、')}（先用 wiki_search 确认 id）`,
      ].filter(Boolean).join('\n\n')),
    },
    presentCall: args => ({ card: 'generic' as const, title: `读取 ${args.ids.length} 页`, kind: 'read' as const }),
    async execute(args) {
      const ids = args.ids.slice(0, LIMITS.readBatch)
      if (ids.length === 0) throw new ToolArgsError(['ids 不能为空'])
      const mode = args.mode ?? 'head'
      const loaded = await store.load()
      const { snapshot } = loaded
      const findings = lintSnapshot(snapshot, { indexText: loaded.indexText, proposalCount: loaded.proposals.length, now: nowIso() })
      const pages = []
      const missing: string[] = []
      for (const id of ids) {
        const page = snapshot.byId.get(id)
        if (page === undefined) {
          missing.push(id)
          continue
        }
        const health = page.type === 'index' || page.type === 'log'
          ? 'ok'
          : pageHealth(snapshot, page, findings.filter(item => item.page === id)).status
        pages.push({
          id: page.id,
          title: page.title,
          status: page.status,
          domain: page.domain ?? '',
          updated: page.updated,
          content: composeContent(page, mode),
          related: relatedOf(snapshot, id),
          backlinks: backlinksOf(snapshot, id),
          health,
        })
      }
      return { pages, missing }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'wiki_write',
    description: [
      'Create or update a wiki page through the schema gate. Default mode=propose writes a proposal into 3-review/; mode=direct writes 2-wiki/ only when the plugin config allows it.',
      'A page must carry `## 关联` with at least one wikilink to an existing page; active/contested pages need sources.',
    ].join(' '),
    parameters: {
      mode: { type: 'string', enum: ['propose', 'direct'], description: '默认 propose。' },
      action: { type: 'string', enum: ['create', 'update', 'deprecate'], description: '写入意图。' },
      target: { type: 'string', required: true, description: '目标页 id，如 concepts/x。' },
      body: { type: 'string', required: true, description: '完整页面正文（含 `# 标题` 与各段）。' },
      title: { type: 'string', required: true, description: '页面标题。' },
      summary: { type: 'string', required: true, description: `一句话摘要，≤${LIMITS.summaryChars} 字。` },
      sources: { type: 'array', items: { type: 'string' }, description: '出处：素材 id（raw/xxx）或来源页 id。' },
      tags: { type: 'array', items: { type: 'string' }, description: '标签。' },
      aliases: { type: 'array', items: { type: 'string' }, description: '别名（2–5 个，用于检索与短链）。update 时省略则保留原值。' },
      domain: { type: 'string', description: '领域；不确定就留空。update 时省略则保留原值。' },
      reason: { type: 'string', description: '为什么改（会写进提案）。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          written: { type: 'string', required: true },
          mode: { type: 'string', required: true },
          warnings: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => TEXT(`已写入 ${value.mode === 'propose' ? '提案' : '页面'}：\`${value.written}\`${value.warnings.length === 0 ? '' : `\n注意：${value.warnings.join('；')}`}`),
    },
    presentCall: args => ({ card: 'generic' as const, title: `写入 ${args.target}`, kind: 'edit' as const }),
    async execute(args) {
      const loaded = await store.load()
      const { snapshot } = loaded
      const type = (args.target.split('/')[0] === 'entities' ? 'entity'
        : args.target.split('/')[0] === 'concepts' ? 'concept'
        : args.target.split('/')[0] === 'sources' ? 'source'
        : args.target.split('/')[0] === 'answers' ? 'answer'
        : args.target.split('/')[0] === 'projects' ? 'project'
        : 'concept') as PageType
      const before = snapshot.byId.get(args.target)
      const draft = {
        id: args.target,
        type,
        title: args.title,
        summary: args.summary,
        body: args.body,
        // deprecate 显式降级；其余情况沿用原页状态（新建时由 buildPageText 兜底 active）。
        // 不要把 update 硬写成 active，否则改一条反链就会把 deprecated 页悄悄复活。
        status: args.action === 'deprecate'
          ? 'deprecated' as const
          : (before?.status ?? 'active' as const),
        tags: args.tags,
        aliases: args.aliases,
        sources: args.sources,
        domain: args.domain,
      }
      const validation = validateDraft(draft, snapshot, store.libraryPath, {
        allowExisting: args.action !== 'create',
        existing: before,
      })
      if (validation.errors.length > 0) throw new ToolArgsError(validation.errors)

      const now = nowIso()
      const pageText = buildPageText(draft, { now, existing: before })
      const direct = args.mode === 'direct' || deps.writeMode === 'direct'
      if (!direct) {
        const path = proposalPath(store.libraryPath, args.target, now)
        await store.exclusive(async () => {
          await store.write(path, buildProposalText({
            target: args.target,
            action: args.action ?? 'create',
            pageText,
            now,
            rationale: args.reason,
            baseUpdated: snapshot.byId.get(args.target)?.updated,
          }))
        })
        await store.appendLog(now, 'proposal', `提案：${args.target}`, [args.reason ?? ''])
        return { written: path, mode: 'propose', warnings: validation.warnings }
      }

      if (deps.writeMode !== 'direct') {
        throw new ToolArgsError(['mode=direct 被拒绝：插件配置是 propose；要直写请先在面板里改 writeMode。'])
      }
      const path = `${WIKI_LAYOUT.wikiDir}/${args.target}.md`
      await store.exclusive(async () => {
        await store.write(path, pageText)
        const { snapshot: fresh } = await store.load()
        await store.write(WIKI_LAYOUT.indexPath, renderIndex(fresh, { updated: now }))
      })
      await store.appendLog(now, 'write', `直写：${args.target}`, [args.reason ?? ''])
      return { written: path, mode: 'direct', warnings: validation.warnings }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'wiki_lint',
    description: 'Run the whole-library audit. `fix: true` rebuilds index.md (the only auto-fixable rules).',
    parameters: {
      fix: { type: 'boolean', description: '是否顺带修复可自动修的问题（重建索引）。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          error: { type: 'integer', required: true },
          warn: { type: 'integer', required: true },
          info: { type: 'integer', required: true },
          fixed: { type: 'integer', required: true },
          items: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                code: { type: 'string', required: true },
                severity: { type: 'string', required: true },
                page: { type: 'string', required: true },
                message: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => TEXT([
        `error ${value.error} · warn ${value.warn} · info ${value.info}${value.fixed > 0 ? ` · 已修 ${value.fixed}` : ''}`,
        value.items.slice(0, 20).map(item => `- [${item.severity}] ${item.code} · \`${item.page}\` ${item.message}`).join('\n'),
        value.items.length > 20 ? `…还有 ${value.items.length - 20} 条（看面板体检页）` : '',
      ].filter(Boolean).join('\n')),
    },
    presentCall: () => ({ card: 'generic' as const, title: '体检', kind: 'read' as const }),
    async execute(args) {
      const result = await actions.lint({ fix: args.fix === true })
      const detail = result.detail as { counts: Record<string, number>, findings: { code: string, severity: string, page: string, message: string }[] }
      return {
        error: detail.counts.error ?? 0,
        warn: detail.counts.warn ?? 0,
        info: detail.counts.info ?? 0,
        fixed: result.receipt.changed,
        items: detail.findings.map(item => ({ code: item.code, severity: item.severity, page: item.page, message: item.message })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'wiki_bootstrap',
    description: 'Create the library skeleton (0-inbox / 1-raw / 2-wiki / 3-review + WIKI.md + index + log). Idempotent: existing files are skipped.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          created: { type: 'array', required: true, items: { type: 'string' } },
          skipped: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => TEXT(`建库完成：新建 ${value.created.length} 个，跳过 ${value.skipped.length} 个已存在文件。`),
    },
    presentCall: () => ({ card: 'generic' as const, title: '初始化知识库', kind: 'edit' as const }),
    async execute() {
      const result = await actions.bootstrap()
      const detail = result.detail as { created: string[], skipped: string[] }
      return { created: detail.created, skipped: detail.skipped }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'wiki_action',
    description: [
      'Trigger one panel action by id (A01–A19). Use it when a scheduled job tells you to run an action, or when the panel cannot reach the host.',
      'params is a JSON object string; pass only the fields that action accepts.',
    ].join(' '),
    parameters: {
      action: { type: 'string', required: true, description: 'A01…A19。' },
      params: { type: 'string', description: 'JSON 对象字符串，例如 {"all":true}。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          changed: { type: 'integer', required: true },
          created: { type: 'integer', required: true },
          removed: { type: 'integer', required: true },
          notes: { type: 'array', required: true, items: { type: 'string' } },
          instruction: { type: 'string', required: true },
        },
      },
      render: (_args, value) => TEXT([`改动 ${value.changed} · 新建 ${value.created} · 删除 ${value.removed}`, value.notes.join('\n'), value.instruction].filter(Boolean).join('\n')),
    },
    presentCall: args => ({ card: 'generic' as const, title: `执行 ${args.action}`, kind: 'execute' as const }),
    async execute(args) {
      let params: Record<string, unknown> = {}
      if (args.params !== undefined && args.params.trim() !== '') {
        try {
          params = JSON.parse(args.params) as Record<string, unknown>
        } catch {
          throw new ToolArgsError(['params 不是合法 JSON'])
        }
      }
      const result = await runAction(actions, args.action, params)
      return {
        changed: result.receipt.changed,
        created: result.receipt.created,
        removed: result.receipt.removed,
        notes: result.receipt.notes,
        instruction: result.instruction ?? '',
      }
    },
  }))
}

/** 工具与 RPC 共用同一张动作表，避免两处各写一套参数名。 */
export async function runAction(actions: Actions, action: string, params: Record<string, unknown>) {
  const text = (key: string) => String(params[key] ?? '')
  switch (action) {
    case 'A01': return actions.note({ text: text('text'), title: params.title as string | undefined, domain: params.domain as string | undefined })
    case 'A03': return actions.preprocess({ item: text('item') })
    case 'A04': return actions.collect({
      urls: Array.isArray(params.urls) ? params.urls.map(String) : text('sources').split(',').filter(item => item.trim() !== ''),
      topic: params.topic as string | undefined,
      maxItems: typeof params.maxItems === 'number' ? params.maxItems : undefined,
    })
    case 'A05': return actions.confirm({ items: params.items as string[] | undefined, all: params.all === true, byHuman: false })
    case 'A06': return actions.retract({ item: text('item') })
    case 'A07': return actions.compile({ items: params.items as string[] | undefined, all: params.all === true })
    case 'A08': return actions.gap({ query: text('query') })
    case 'A09': return actions.merge({ paths: params.paths as string[] | undefined, all: params.all === true, dryRun: params.dryRun === true })
    case 'A10': return actions.expireProposals({ keepDays: typeof params.keepDays === 'number' ? params.keepDays : undefined, dryRun: params.dryRun === true })
    case 'A11': return actions.lint({ fix: params.fix === true })
    case 'A12': return actions.dedupe({
      threshold: typeof params.threshold === 'number' ? params.threshold : undefined,
      limit: typeof params.limit === 'number' ? params.limit : undefined,
      dryRun: params.dryRun === true,
    })
    case 'A13': return actions.contradict({
      domain: params.domain as string | undefined,
      maxPages: typeof params.maxPages === 'number' ? params.maxPages : undefined,
    })
    case 'A14': return actions.stale({ days: typeof params.days === 'number' ? params.days : undefined })
    case 'A15': return actions.reindex()
    case 'A16': return actions.bootstrap()
    case 'A17': return actions.rollback({ commit: params.commit as string | undefined })
    case 'A18': return actions.cleanSafe({ dryRun: params.dryRun === true })
    case 'A19': return actions.cleanDeep({ items: params.items as string[] | undefined, dryRun: params.dryRun === true })
    default: throw new ToolArgsError([`未知动作 ${action}：可用 A01–A19`])
  }
}

export { summarize }
