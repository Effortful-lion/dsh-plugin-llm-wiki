/**
 * index.md 的生成与解析。
 *
 * 索引是"先读目录"策略的入口：agent 必须先读 index，再按需 read 页面，
 * 因此索引只承载指针级信息（id / 标题 / 摘要 / 标签 / 更新时间 / 入链数），
 * 不复制正文——复制正文会让索引自己变成第二份真相源。
 */

import { stringifyFrontmatter } from './frontmatter.ts'
import {
  CANONICAL_FIELDS,
  CONTENT_TYPES,
  LIMITS,
  PAGE_TYPE_SEGMENT,
  type PageType,
  type Snapshot,
  type WikiPage,
} from './model.ts'

const TYPE_LABEL: Record<string, string> = {
  concept: '概念',
  entity: '实体',
  source: '来源',
  answer: '回答',
  project: '项目',
}

function truncate(text: string, limit: number): string {
  const single = text.replace(/\s+/g, ' ').trim()
  if (single.length <= limit) return single
  return `${single.slice(0, Math.max(0, limit - 1))}…`
}

function entryLine(snapshot: Snapshot, page: WikiPage): string {
  const inbound = snapshot.inbound.get(page.id) ?? 0
  const tags = page.tags.slice(0, 3).map(tag => `#${tag}`).join(' ')
  const parts = [
    truncate(page.summary, LIMITS.snippetChars) || '（待补摘要）',
    tags,
    page.updated || '',
    inbound > 0 ? `←${inbound}` : '',
  ].filter(part => part !== '')
  return `- [[${page.id}|${page.title}]] — ${parts.join(' · ')}`
}

/**
 * 生成 index.md 全文（含 frontmatter）。幂等：同一快照永远得到同一文本。
 * @param snapshot - 整库快照。
 * @param options - `updated` 使用调用方时钟；测试里可传固定值。
 */
export function renderIndex(snapshot: Snapshot, options: { updated: string }): string {
  const date = options.updated.slice(0, 10)
  const content = snapshot.pages.filter(page => CONTENT_TYPES.includes(page.type))
  const grouped = new Map<PageType, WikiPage[]>()
  for (const page of content) {
    const list = grouped.get(page.type) ?? []
    list.push(page)
    grouped.set(page.type, list)
  }

  const counts = CONTENT_TYPES
    .map(type => [type, grouped.get(type)?.length ?? 0] as const)
    .filter(([, count]) => count > 0)

  const lines: string[] = [
    stringifyFrontmatter({
      id: 'index',
      type: 'index',
      title: '知识库索引',
      summary: '全库目录：先读这里，再按需打开页面。',
      status: 'active',
      created: date,
      updated: date,
    } as Record<string, unknown>, CANONICAL_FIELDS).trimEnd(),
    '',
    '# 索引 · Index',
    '',
    '> 本页由 llm-wiki 自动生成，请勿手工编辑。增删页面后重新运行索引重建（DSH 里是 `wiki_lint --fix`，Obsidian 里是命令「LLM Wiki：重建索引」）。',
    '',
    `共 ${content.length} 页${counts.length > 0 ? ` · ${counts.map(([type, count]) => `${TYPE_LABEL[type] ?? type} ${count}`).join(' · ')}` : ''}`,
    '',
  ]

  for (const type of CONTENT_TYPES) {
    const pages = grouped.get(type)
    if (!pages || pages.length === 0) continue
    lines.push(`## ${TYPE_LABEL[type] ?? type} · ${PAGE_TYPE_SEGMENT[type]} · ${pages.length}`, '')
    pages
      .slice()
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-Hans-CN'))
      .forEach(page => lines.push(entryLine(snapshot, page)))
    lines.push('')
  }

  if (content.length === 0) {
    lines.push('（空库）先收录一份 `raw/` 来源，再让 agent 写第一页。', '')
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}

/** 从 index.md 里取回它声明过的页面 id（用于 L004 / L005）。 */
export function parseIndexEntries(text: string): string[] {
  const ids = new Set<string>()
  const pattern = /^\s*-\s*\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const id = match[1]!.trim().replace(/\.md$/, '')
    if (id !== '') ids.add(id)
  }
  return [...ids]
}
