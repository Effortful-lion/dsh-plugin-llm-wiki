/**
 * DSH 侧的全部工具：wiki_search / wiki_read / wiki_write / wiki_lint / wiki_bootstrap。
 *
 * 工具口径刻意保持"指针 + 预算"：搜索只给摘要，读取分三档（head / toc / full），
 * 写入默认进提案区。这样即便 agent 很笨，一次查询的上下文开销也有上界。
 */

import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import type { Context } from '@deepseek-ai/cordis'

import { appendLog, buildPageText, buildProposalText, logEntry, pagePath, proposalPath, validateDraft } from '../../core/draft.ts'
import { renderIndex } from '../../core/index-page.ts'
import { lintSnapshot, pageHealth, summarize } from '../../core/lint.ts'
import { searchPages } from '../../core/search.ts'
import { backlinksOf } from '../../core/parse.ts'
import {
  CONTENT_TYPES,
  LIMITS,
  STATUSES,
  WIKI_LAYOUT,
  type PageStatus,
  type PageType,
  type WikiPage,
} from '../../core/model.ts'
import type { WikiStore } from './store.ts'

export interface ToolDeps {
  store: WikiStore
  writeMode: 'propose' | 'direct'
  maxCandidates: number
  staleDays: number
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
  if (!values || values.length === 0) return undefined
  const invalid = values.filter(value => !(CONTENT_TYPES as string[]).includes(value))
  if (invalid.length > 0) throw new ToolArgsError([`未知 type：${invalid.join(', ')}；可用 ${CONTENT_TYPES.join(' / ')}`])
  return values as PageType[]
}

/** 把一句话摘要压成模型可读的一行。 */
function hitLine(index: number, hit: { id: string, type: string, title: string, summary: string, status: string, inbound: number }): string {
  return `${index + 1}. [${hit.type}/${hit.status}] ${hit.title} — \`${hit.id}\`${hit.inbound > 0 ? ` · ←${hit.inbound}` : ''}\n   ${hit.summary}`
}

export function registerWikiTools(ctx: Context, deps: ToolDeps): void {
  const { store } = deps

  ctx.tools.register(defineTool({
    name: 'wiki_search',
    description: [
      'Search the LLM Wiki by page title, alias, tag, summary and id. Returns pointers only (id + ≤110 字摘要), never full text.',
      'Use it before creating pages: an existing page usually should be updated instead of duplicated.',
    ].join(' '),
    parameters: {
      query: { type: 'string', required: true, description: '关键词；支持空格分词，全部命中优先。空串返回按入链排序的概览。' },
      types: {
        type: 'array',
        items: { type: 'string', enum: [...CONTENT_TYPES] },
        description: '限定页面类型；省略表示全部内容页。',
      },
      tags: { type: 'array', items: { type: 'string' }, description: '标签过滤（全部满足）。' },
      limit: { type: 'number', description: `返回条数上限，默认 ${deps.maxCandidates}，最大 20。` },
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
                tags: { type: 'array', required: true, items: { type: 'string' } },
                updated: { type: 'string', required: true },
                score: { type: 'number', required: true },
                inbound: { type: 'integer', required: true },
                matched: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
          },
          hint: { type: 'string', required: true },
        },
      },
      render: (_args, value) => TEXT(value.hits.length === 0
        ? '没有命中。换一组词，或先 wiki_bootstrap 建库 / 从 raw/ 收录一份来源。'
        : `命中 ${value.hits.length} 页：\n${value.hits.map((hit, index) => hitLine(index, hit)).join('\n')}\n\n${value.hint}`),
    },
    presentCall: args => ({ card: 'generic' as const, title: `搜索 wiki：${args.query || '（概览）'}`, kind: 'search' as const }),
    async execute(args) {
      const { snapshot } = await store.load()
      const limit = Math.max(1, Math.min(args.limit ?? deps.maxCandidates, 20))
      const hits = searchPages(snapshot, args.query ?? '', {
        types: typeFilter(args.types),
        tags: args.tags,
        limit,
      })
      return {
        hits,
        hint: hits.length > 0
          ? '下一步：wiki_read 命中里最相关的 2–4 页（mode=head），需要细节再 mode=full；不要一次读十页。'
          : `库里现有 ${CONTENT_TYPES.length} 类目录；若确实缺页，先用 wiki_read(["index"]) 看全貌。`,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'wiki_read',
    description: [
      'Read wiki pages by id (index/log allowed). Modes: head (frontmatter + 前 1200 字), toc (标题层级), full (全文 ≤12000 字).',
      'Each page returns its 关联出链、反链与该页的 lint 摘要，方便沿链接继续跳，而不是重新搜索。',
    ].join(' '),
    parameters: {
      ids: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: `页面 id（如 concepts/llm-wiki、index）。一次最多 ${LIMITS.readBatch} 页。`,
      },
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
                type: { type: 'string', required: true },
                title: { type: 'string', required: true },
                status: { type: 'string', required: true },
                summary: { type: 'string', required: true },
                path: { type: 'string', required: true },
                tags: { type: 'array', required: true, items: { type: 'string' } },
                aliases: { type: 'array', required: true, items: { type: 'string' } },
                sources: { type: 'array', required: true, items: { type: 'string' } },
                updated: { type: 'string', required: true },
                related: { type: 'array', required: true, items: { type: 'string' } },
                backlinks: { type: 'array', required: true, items: { type: 'string' } },
                health: { type: 'string', required: true },
                issues: { type: 'array', required: true, items: { type: 'string' } },
                content: { type: 'string', required: true },
              },
            },
          },
          missing: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => TEXT(value.pages.map(page => [
        `## ${page.title} · \`${page.id}\` (${page.type}/${page.status})`,
        `> ${page.summary}`,
        page.issues.length > 0 ? `> ⚠ ${page.issues.join('；')}` : '',
        '',
        page.content.trim(),
        '',
        `关联：${page.related.map(id => `[[${id}]]`).join(' ') || '（无）'} · 反链：${page.backlinks.map(id => `[[${id}]]`).join(' ') || '（无）'}`,
      ].filter(line => line !== '').join('\n')).join('\n\n---\n\n')
      + (value.missing.length > 0 ? `\n\n未找到：${value.missing.join(', ')}（用 wiki_search 找替代页，或直接新建）` : '')),
    },
    presentCall: args => ({
      card: 'generic' as const,
      title: `读取 ${args.ids.length} 页`,
      kind: 'read' as const,
      rawInput: args.ids,
    }),
    async execute(args) {
      if (args.ids.length > LIMITS.readBatch) throw new ToolArgsError([`一次最多读 ${LIMITS.readBatch} 页；分两批，或先用 wiki_search 缩小范围`])
      const { snapshot, indexText, proposalCount } = await store.load()
      const findings = lintSnapshot(snapshot, { indexText, proposalCount, staleDays: deps.staleDays })
      const pages = []
      const missing: string[] = []
      for (const id of args.ids) {
        const page = snapshot.byId.get(id)
        if (!page) {
          missing.push(id)
          continue
        }
        const health = pageHealth(snapshot, page, findings)
        pages.push({
          id: page.id,
          type: page.type,
          title: page.title,
          status: page.status,
          summary: page.summary,
          path: page.path,
          tags: page.tags,
          aliases: page.aliases,
          sources: page.sources,
          updated: page.updated,
          related: (snapshot.linksById.get(page.id) ?? []).filter(link => link.inRelated && link.resolved && link.resolved !== page.id).map(link => link.resolved!),
          backlinks: backlinksOf(snapshot, page.id),
          health: health.status,
          issues: health.issues.map(issue => `${issue.code}: ${issue.message}`),
          content: composeContent(page, (args.mode ?? 'head') as 'head' | 'toc' | 'full'),
        })
      }
      return { pages, missing }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'wiki_write',
    description: [
      'Create or update one wiki page through the schema gate.',
      `Default mode=propose writes a reviewable proposal under ${WIKI_LAYOUT.proposalDir}/ and leaves the wiki untouched; mode=direct writes ${WIKI_LAYOUT.wikiDir}/ only when the deployment config allows it.`,
      'Requires a `## 关联` section with at least one existing [[wikilink]] and, for active pages, at least one source.',
    ].join(' '),
    parameters: {
      action: { type: 'string', required: true, enum: ['create', 'update'] },
      type: { type: 'string', required: true, enum: [...CONTENT_TYPES], description: '页面类型，决定目录段。' },
      title: { type: 'string', required: true, description: '页面标题（≤80 字）。' },
      summary: { type: 'string', required: true, description: `一句话摘要（≤${LIMITS.summaryChars} 字），索引与检索都只读它。` },
      body: { type: 'string', required: true, description: `Markdown 正文，必须含 \`${LIMITS.relatedSection}\` 段与至少一条 [[wikilink]]。` },
      id: { type: 'string', description: `显式 id（如 concepts/xxx）；省略时由 type + 标题推出。` },
      status: { type: 'string', enum: [...STATUSES], description: '默认 active。' },
      tags: { type: 'array', items: { type: 'string' } },
      aliases: { type: 'array', items: { type: 'string' }, description: '别名，用于短链解析；全库唯一。' },
      sources: { type: 'array', items: { type: 'string' }, description: '出处页 id（sources/xxx）。' },
      confidence: { type: 'number', description: '0..1' },
      mode: { type: 'string', enum: ['propose', 'direct'], description: `默认跟随部署配置（当前 ${deps.writeMode}）。` },
      rationale: { type: 'string', description: '为什么改这一页；会写进提案注释，供人审阅。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          action: { type: 'string', required: true },
          mode: { type: 'string', required: true },
          id: { type: 'string', required: true },
          path: { type: 'string', required: true },
          proposalPath: { type: 'string', required: true },
          warnings: { type: 'array', required: true, items: { type: 'string' } },
          findings: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                code: { type: 'string', required: true },
                severity: { type: 'string', required: true },
                message: { type: 'string', required: true },
              },
            },
          },
          indexUpdated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => TEXT([
        value.ok ? `✓ ${value.action} \`${value.id}\`` : `✗ ${value.action} \`${value.id}\` 未落盘`,
        `目标：${value.path}`,
        value.proposalPath ? `提案：${value.proposalPath}（等待人工合并）` : '',
        value.indexUpdated ? '索引：已重建' : '索引：未变（提案模式下不更新）',
        value.warnings.length > 0 ? `注意：${value.warnings.join('；')}` : '',
        value.findings.length > 0 ? `写入后仍有问题：\n${value.findings.map(item => `- ${item.severity} ${item.code} ${item.message}`).join('\n')}` : '',
      ].filter(line => line !== '').join('\n')),
    },
    presentCall: args => ({ card: 'generic' as const, title: `${args.action} ${args.id ?? args.title}`, kind: 'other' as const }),
    async execute(args) {
      const { snapshot } = await store.load()
      const draft = {
        id: args.id,
        type: args.type as PageType,
        title: args.title,
        summary: args.summary,
        body: args.body,
        status: (args.status ?? 'active') as PageStatus,
        tags: args.tags,
        aliases: args.aliases,
        sources: args.sources,
        confidence: args.confidence,
      }
      const mode = (args.mode ?? deps.writeMode) as 'propose' | 'direct'
      if (mode === 'direct' && deps.writeMode !== 'direct') {
        throw new ToolArgsError(['当前部署是 propose 模式：直写需要人在插件配置里显式改成 writeMode=direct'])
      }

      const validation = validateDraft(draft, snapshot, store.root, { allowExisting: args.action === 'update' })
      if (validation.errors.length > 0) throw new ToolArgsError(validation.errors.map(error => `写入被 schema 拒绝：${error}`))

      const existing = args.action === 'update' ? snapshot.byId.get(validation.id) : undefined
      const now = nowIso()
      const path = pagePath(store.root, draft.type, validation.id.split('/')[1]!)
      const pageText = buildPageText(draft, { now, existing })

      if (mode === 'propose') {
        const target = proposalPath(store.root, validation.id, now)
        await store.write(target, buildProposalText({
          target: validation.id,
          action: args.action,
          pageText,
          now,
          rationale: args.rationale,
          baseUpdated: existing?.updated,
        }))
        await appendLogEntry(store, now, 'proposal', `提案 ${args.action} \`${validation.id}\``, [
          `提案文件：${target}`,
          args.rationale ? `理由：${args.rationale}` : '',
        ].filter(Boolean))

        return {
          ok: true,
          action: args.action,
          mode,
          id: validation.id,
          path,
          proposalPath: target,
          warnings: validation.warnings,
          findings: [],
          indexUpdated: false,
        }
      }

      await store.write(path, pageText)
      const after = await store.load()
      const indexText = renderIndex(after.snapshot, { updated: now })
      await store.write(`${store.root}/${WIKI_LAYOUT.indexPath}`, indexText)
      await appendLogEntry(store, now, 'write', `${args.action} \`${validation.id}\``, [args.rationale ?? ''].filter(Boolean))
      const findings = lintSnapshot((await store.load()).snapshot, { indexText, proposalCount: 0, staleDays: deps.staleDays })
        .filter(finding => finding.page === validation.id)

      return {
        ok: true,
        action: args.action,
        mode,
        id: validation.id,
        path,
        proposalPath: '',
        warnings: validation.warnings,
        findings: findings.map(finding => ({ code: finding.code, severity: finding.severity, message: finding.message })),
        indexUpdated: true,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'wiki_lint',
    description: [
      'Run the auditor over the whole wiki: orphan pages, broken links, schema violations, unindexed pages, dangling index entries, alias collisions, missing citations, staleness.',
      'With fix=true it rebuilds index.md (the only auto-fixable class) and returns the findings that remain.',
    ].join(' '),
    parameters: {
      fix: { type: 'boolean', description: '重建 index.md 后再跑一遍，默认 false。' },
      includeInfo: { type: 'boolean', description: '是否返回 info 级问题（stale / 待处理提案），默认 true。' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          counts: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              error: { type: 'integer', required: true },
              warn: { type: 'integer', required: true },
              info: { type: 'integer', required: true },
            },
          },
          findings: {
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
          indexRebuilt: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => TEXT([
        `error ${value.counts.error} · warn ${value.counts.warn} · info ${value.counts.info}${value.indexRebuilt ? ' · 索引已重建' : ''}`,
        value.findings.length === 0
          ? '干净。'
          : value.findings.map(item => `- ${item.severity.padEnd(5)} ${item.code} \`${item.page}\` ${item.message}`).join('\n'),
      ].join('\n')),
    },
    presentCall: args => ({ card: 'generic' as const, title: args.fix ? 'Lint + 重建索引' : 'Lint wiki', kind: 'other' as const }),
    async execute(args) {
      const now = nowIso()
      let loaded = await store.load()
      let indexText = loaded.indexText
      let indexRebuilt = false

      if (args.fix) {
        indexText = renderIndex(loaded.snapshot, { updated: now })
        await store.write(`${store.root}/${WIKI_LAYOUT.indexPath}`, indexText)
        await appendLogEntry(store, now, 'index', '重建索引', [`共 ${loaded.snapshot.pages.length} 页`])
        loaded = await store.load()
        indexText = renderIndex(loaded.snapshot, { updated: now })
        indexRebuilt = true
      }

      const findings = lintSnapshot(loaded.snapshot, {
        indexText,
        proposalCount: loaded.proposalCount,
        staleDays: deps.staleDays,
      }).filter(finding => args.includeInfo === false ? finding.severity !== 'info' : true)

      return {
        counts: summarize(findings),
        findings: findings.map(finding => ({ code: finding.code, severity: finding.severity, page: finding.page, message: finding.message })),
        indexRebuilt,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'wiki_bootstrap',
    description: 'Create the wiki skeleton when the vault has no wiki yet: directories, index.md, log.md and a starter WIKI.md. Idempotent — existing files are never overwritten.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          created: { type: 'array', required: true, items: { type: 'string' } },
          skipped: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => TEXT(value.created.length === 0
        ? `骨架构件已存在：${value.skipped.join('、')}`
        : `已建立 ${value.root}：${value.created.join('、')}${value.skipped.length > 0 ? `（跳过 ${value.skipped.join('、')}）` : ''}`),
    },
    presentCall: () => ({ card: 'generic' as const, title: '初始化 wiki 骨架', kind: 'other' as const }),
    async execute() {
      const result = await store.bootstrap(nowIso())
      return { root: store.root, created: result.created, skipped: result.skipped }
    },
  }))
}

async function appendLogEntry(
  store: WikiStore,
  now: string,
  operation: 'ingest' | 'write' | 'lint' | 'index' | 'proposal',
  summary: string,
  details: string[],
): Promise<void> {
  const path = `${store.root}/${WIKI_LAYOUT.logPath}`
  let existing = ''
  try {
    existing = await store.read(path)
  } catch {
    existing = ''
  }
  const entry = logEntry({ now, operation, summary, details })
  await store.write(path, appendLog(existing, entry))
}
