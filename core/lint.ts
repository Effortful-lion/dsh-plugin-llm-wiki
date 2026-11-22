/**
 * 审计器（Auditor）：把"库是否诚实"变成一组可枚举的规则。
 *
 * 与 llm-wiki 模式里的后台质量代理对应：
 * - Auditor → 本文件（结构完整性）；
 * - Compliance → 写入门禁 `validateDraft`（draft.ts）；
 * - Librarian → 索引生成与别名归一（index-page.ts / parse.ts）；
 * - Adversary → 不在这里：它需要联网核对原文，属于 agent 工作流（WIKI.md 里约定）。
 */

import { parseIndexEntries } from './index-page.ts'
import { backlinksOf } from './parse.ts'
import {
  CONTENT_TYPES,
  LIMITS,
  RULES,
  WIKI_LAYOUT,
  type Finding,
  type LintCode,
  type Severity,
  type Snapshot,
  type WikiPage,
} from './model.ts'

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 }

export interface LintOptions {
  /** index.md 的原文；省略时只报"缺少索引"，无法比对条目。 */
  indexText?: string
  /** 待处理提案数（`3-review/*.md`）。 */
  proposalCount?: number
  now?: string
  staleDays?: number
}

function daysBetween(from: string, to: string): number | undefined {
  const start = Date.parse(from.length === 10 ? `${from}T00:00:00Z` : from)
  const end = Date.parse(to.length === 10 ? `${to}T00:00:00Z` : to)
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined
  return Math.floor((end - start) / 86_400_000)
}

function finding(code: LintCode, page: string, message: string, target?: string): Finding {
  return { code, severity: RULES[code].severity, page, message, target }
}

/**
 * 对整库跑一遍规则。
 * @param snapshot - 整库快照。
 * @param options - 索引原文、提案数、时钟。
 * @returns 按严重度排序的问题列表。
 */
export function lintSnapshot(snapshot: Snapshot, options: LintOptions = {}): Finding[] {
  const findings: Finding[] = [...snapshot.problems]
  const now = options.now ?? new Date().toISOString()
  const staleDays = options.staleDays ?? LIMITS.staleDays

  for (const page of snapshot.pages) {
    if (page.type === 'index' || page.type === 'log') continue

    for (const issue of page.schemaIssues) findings.push(finding('L003-schema', page.id, issue))

    if (page.summary.length > LIMITS.summaryChars) {
      findings.push(finding('L006-summary-long', page.id, `summary ${page.summary.length} 字，上限 ${LIMITS.summaryChars}`))
    }

    const links = snapshot.linksById.get(page.id) ?? []
    for (const link of links) {
      if (!link.resolved) findings.push(finding('L002-broken-link', page.id, `第 ${link.line} 行断链：[[${link.raw}]]`, link.raw))
    }

    const related = links.filter(link => link.inRelated && link.resolved && link.resolved !== page.id)
    if (related.length === 0) {
      findings.push(finding('L010-no-links', page.id, `缺少 \`${LIMITS.relatedSection}\` 出链；孤立知识无法被遍历到`))
    }

    const inbound = backlinksOf(snapshot, page.id)
    if (inbound.length === 0 && page.status !== 'stub') {
      findings.push(finding('L001-orphan', page.id, `没有任何入链；在别的页 \`${LIMITS.relatedSection}\` 里补一条`))
    }

    if (page.status !== 'stub' && page.status !== 'deprecated' && page.sources.length === 0 && page.type !== 'answer') {
      findings.push(finding('L008-uncited', page.id, '非 stub 页没有 sources 出处'))
    }

    if (page.status === 'active' || page.status === 'contested') {
      const age = daysBetween(page.updated, now)
      if (age !== undefined && age > staleDays) {
        findings.push(finding('L011-stale', page.id, `已 ${age} 天未更新（阈值 ${staleDays}）`))
      }
    }
  }

  const indexPage = snapshot.byId.get('index')
  if (!indexPage) {
    findings.push(finding('L005-dangling-index', 'index', '缺少 wiki/index.md；先重建索引'))
  } else if (options.indexText !== undefined) {
    const declared = new Set(parseIndexEntries(options.indexText))
    for (const page of snapshot.pages) {
      if (!CONTENT_TYPES.includes(page.type)) continue
      if (!declared.has(page.id)) findings.push(finding('L004-unindexed', page.id, '未登记在 index.md'))
    }
    for (const id of declared) {
      if (!snapshot.byId.has(id)) findings.push(finding('L005-dangling-index', 'index', `索引条目指向不存在的页：${id}`, id))
    }
  }

  if ((options.proposalCount ?? 0) > 0) {
    findings.push(finding('L012-proposal-pending', 'index', `${WIKI_LAYOUT.proposalDir}/ 有 ${options.proposalCount} 份待处理提案`))
  }

  return findings.sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || left.code.localeCompare(right.code)
    || left.page.localeCompare(right.page))
}

/** 统计各严重度数量，供 UI/工具返回摘要。 */
export function summarize(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>((counts, item) => {
    counts[item.severity] += 1
    return counts
  }, { error: 0, warn: 0, info: 0 })
}

/** 可由 `--fix` 自动消除的问题（目前只有索引类）。 */
export function fixableFindings(findings: Finding[]): Finding[] {
  return findings.filter(item => RULES[item.code].fixable)
}

/** 页面自身的健康摘要，供 `wiki_read` 折叠展示。 */
export function pageHealth(snapshot: Snapshot, page: WikiPage, findings: Finding[]): { status: 'ok' | 'warn' | 'error', issues: Finding[] } {
  const issues = findings.filter(item => item.page === page.id)
  const worst = issues.some(item => item.severity === 'error') ? 'error' : issues.length > 0 ? 'warn' : 'ok'
  return { status: worst as 'ok' | 'warn' | 'error', issues }
}
