/**
 * 核心逻辑冒烟测试：不依赖 vitest，直接用 tsx 跑。
 *   tsx scripts/smoke.ts
 * 覆盖：frontmatter 往返、页面解析、图/入链、lint 四类规则、索引往返、草稿门禁、检索排序。
 */

import { parseDocument, stringifyFrontmatter } from '../core/frontmatter.ts'
import { buildSnapshot, parsePage } from '../core/parse.ts'
import { lintSnapshot } from '../core/lint.ts'
import { renderIndex, parseIndexEntries } from '../core/index-page.ts'
import { validateDraft, buildPageText, proposalPath, buildProposalText, parseProposal } from '../core/draft.ts'
import { searchPages } from '../core/search.ts'
import { dedupe } from '../core/dedupe.ts'

let failures = 0
function check(label: string, condition: boolean, hint = ''): void {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures += 1
  console.error(`  FAIL ${label}${hint ? ` → ${hint}` : ''}`)
}

const ROOT = 'mybrain'
const NOW = '2026-11-22T09:00:00+08:00'

// 1. frontmatter 往返
const fm = stringifyFrontmatter({
  id: 'concepts/llm-wiki',
  type: 'concept',
  title: 'LLM Wiki：把检索变成编译',
  summary: '把知识编译成 wiki，而不是每次查询重新推导。',
  aliases: ['llm wiki', '知识编译'],
  tags: ['rag', 'pkm'],
  sources: ['sources/karpathy-gist'],
  created: '2026-11-20',
  updated: '2026-11-22',
})
const roundtrip = parseDocument(`${fm}\n# 标题\n\n正文。`)
console.log('[frontmatter]')
check('解析出 9 个字段', Object.keys(roundtrip.data).length === 9, JSON.stringify(Object.keys(roundtrip.data)))
check('中文标题保留了冒号', String(roundtrip.data.title).includes('：'))
check('块数组解析为 2 项', Array.isArray(roundtrip.data.aliases) && (roundtrip.data.aliases as string[]).length === 2)
check('正文与 frontmatter 分离', roundtrip.body.startsWith('# 标题'))

// 2. 页面解析 + 图
const pagesText: Record<string, string> = {
  'mybrain/2-wiki/concepts/llm-wiki.md': `${fm}\n# LLM Wiki\n\n把知识编译成 wiki。\n\n## 关联\n\n- 上游：[[sources/karpathy-gist|Karpathy gist]]\n- 相邻：[[concepts/retrieval-as-reasoning]]\n\n\`\`\`\n[[concepts/should-not-count]]\n\`\`\`\n`,
  'mybrain/2-wiki/concepts/retrieval-as-reasoning.md': `---
id: concepts/retrieval-as-reasoning
type: concept
title: Retrieval as Reasoning
summary: 检索是一串有意图的跳转，而不是一次 top-k。
status: active
sources:
  - sources/arxiv-llm-wiki
created: 2026-11-21
updated: 2026-11-21
---

# Retrieval as Reasoning

## 关联

- [[concepts/llm-wiki]]
- [[concepts/missing-page]]
`,
  'mybrain/2-wiki/sources/karpathy-gist.md': `---
id: sources/karpathy-gist
type: source
title: Karpathy 的 LLM Wiki 思路
summary: 原始帖：Obsidian 是 IDE，LLM 是程序员，wiki 是代码库。
status: active
sources:
  - 原始链接 https://example.com
created: 2026-11-20
updated: 2026-11-20
---

# Karpathy 的 LLM Wiki 思路

## 关联

- [[concepts/llm-wiki]]
`,
  'mybrain/2-wiki/concepts/orphan-demo.md': `---
id: concepts/orphan-demo
type: concept
title: 孤立示例
summary: 没有任何页链接到它，用来触发 L001。
status: active
sources:
  - sources/karpathy-gist
created: 2026-11-22
updated: 2026-11-22
---

# 孤立示例

## 关联

- [[concepts/llm-wiki]]
`,
  'mybrain/2-wiki/index.md': `---
id: index
type: index
title: 知识库索引
summary: 全库目录。
status: active
created: 2026-11-22
updated: 2026-11-22
---

# 索引

- [[concepts/llm-wiki|LLM Wiki]]
- [[concepts/retrieval-as-reasoning|Retrieval as Reasoning]]
- [[concepts/ghost|幽灵页]]
`,
}
const pages = Object.entries(pagesText).map(([path, text]) => parsePage(path, text, ROOT))
const snapshot = buildSnapshot(pages)
console.log('[graph]')
check('解析 5 页', snapshot.pages.length === 5, String(snapshot.pages.length))
check('代码块内的链接被忽略', !(snapshot.linksById.get('concepts/llm-wiki') ?? []).some(link => link.raw.includes('should-not-count')))
check('llm-wiki 有 3 条入链（不含 index）', snapshot.inbound.get('concepts/llm-wiki') === 3, String(snapshot.inbound.get('concepts/llm-wiki')))
check('短链可按标题解析', (snapshot.linksById.get('concepts/retrieval-as-reasoning') ?? [])[1]?.raw === 'concepts/missing-page')

// 3. lint
const indexText = pagesText['mybrain/2-wiki/index.md']!
const findings = lintSnapshot(snapshot, { indexText, now: NOW })
const codes = new Set(findings.map(item => item.code))
console.log('[lint]')
check('报断链 L002', codes.has('L002-broken-link'))
check('报悬空索引 L005', codes.has('L005-dangling-index'))
check('报孤儿页 L001', codes.has('L001-orphan'))
check('报未登记索引 L004', codes.has('L004-unindexed'))
check('error 排在 info 之前', findings[0]?.severity === 'error', findings[0]?.code)

// 4. 索引往返
const rendered = renderIndex(snapshot, { updated: NOW })
const declared = parseIndexEntries(rendered)
console.log('[index]')
check('索引含全部 4 个内容页', declared.length === 4, declared.join(','))
check('索引幂等（重复渲染同文本）', renderIndex(snapshot, { updated: NOW }) === rendered)
check('索引不含正文复制的标题层级', !rendered.includes('## 定义'))

// 5. 草稿门禁
const goodDraft = {
  type: 'concept' as const,
  title: '知识编译',
  summary: '把来源一次性编译成可遍历的页面。',
  body: '## 定义\n\n编译一次，长期复用。\n\n## 关联\n\n- [[concepts/llm-wiki]]\n',
  status: 'active' as const,
  sources: ['sources/karpathy-gist'],
  tags: ['pkm'],
}
const good = validateDraft(goodDraft, snapshot, ROOT)
console.log('[draft]')
check('合格草稿零 error', good.errors.length === 0, good.errors.join(' | '))
check('id 由 type + slug 推出', good.id === 'concepts/知识编译', good.id)
check('路径落在 wiki/concepts', good.path === 'mybrain/2-wiki/concepts/知识编译.md', good.path)

const noSource = validateDraft({ ...goodDraft, sources: [] }, snapshot, ROOT)
check('active 缺 sources 被拒', noSource.errors.some(error => error.includes('sources')))

const noRelated = validateDraft({ ...goodDraft, title: '另一个', body: '## 定义\n\n只有定义。\n' }, snapshot, ROOT)
check('缺 关联 段被拒', noRelated.errors.some(error => error.includes('关联')))

const brokenLink = validateDraft({ ...goodDraft, title: '第三页', body: '## 关联\n\n- [[concepts/not-exist]]\n' }, snapshot, ROOT)
check('断链被拒', brokenLink.errors.some(error => error.includes('不存在')))

const text = buildPageText(goodDraft, { now: NOW })
check('页面文本含规范 frontmatter', text.startsWith('---\nid: concepts/知识编译'))
check('提案路径按时间排序', proposalPath(ROOT, 'concepts/知识编译', NOW).startsWith('mybrain/3-review/20261122-0900-'))

// 5b. 局部更新：草稿没给的字段必须继承原页，不能悄悄清空
const existingPage = {
  id: 'concepts/知识编译',
  type: 'concept' as const,
  title: '知识编译',
  summary: '把来源一次性编译成可遍历的页面。',
  status: 'active' as const,
  aliases: ['knowledge compile'],
  tags: ['pkm', 'design'],
  sources: ['sources/karpathy-gist'],
  domain: 'engineering',
  created: '2026-11-20',
  updated: '2026-11-20',
  layer: 'wiki' as const,
  body: '## 定义\n\n编译一次。\n\n## 关联\n\n- [[concepts/llm-wiki]]\n',
  frontmatter: {},
  schemaIssues: [],
}
const partialUpdate = buildPageText(
  { ...goodDraft, tags: undefined, aliases: undefined, sources: undefined, domain: undefined },
  { now: NOW, existing: existingPage },
)
check('update 保留原 tags', partialUpdate.includes('  - pkm') && partialUpdate.includes('  - design'), partialUpdate)
check('update 保留原 aliases', partialUpdate.includes('knowledge compile'), partialUpdate)
check('update 保留原 domain', partialUpdate.includes('domain: engineering'), partialUpdate)
check('update 保留原 created', partialUpdate.includes('created: 2026-11-20'), partialUpdate)

const explicitClear = buildPageText({ ...goodDraft, tags: [] }, { now: NOW, existing: existingPage })
check('显式传空数组才算清空 tags', explicitClear.includes('tags: []'), explicitClear)

const deprecatedPage = { ...existingPage, status: 'deprecated' as const }
const stillDeprecated = buildPageText(
  { ...goodDraft, status: deprecatedPage.status },
  { now: NOW, existing: deprecatedPage },
)
check('deprecated 页 update 后仍是 deprecated', stillDeprecated.includes('status: deprecated'), stillDeprecated)


// 6. 检索排序
const hits = searchPages(snapshot, 'llm wiki', { limit: 3 })
console.log('[search]')
check('精确标题命中排第一', hits[0]?.id === 'concepts/llm-wiki', hits.map(hit => `${hit.id}:${hit.score}`).join(' '))
check('不返回 index/log', !hits.some(hit => hit.type === 'index' || hit.type === 'log'))
check('结果只含摘要，不含正文', (hits[0]?.summary.length ?? 999) <= 120)
check('标签过滤生效', searchPages(snapshot, 'wiki', { tags: ['rag'] })[0]?.id === 'concepts/llm-wiki')
check('bigram 兜底：整串不命中也能靠字面重合找到', searchPages(snapshot, '检索推理') !== undefined)

// 7. raw 层：独立命名空间 + 不进链接图
const rawPage = parsePage('mybrain/1-raw/note-a.md', `---
id: raw/note-a
type: source
title: 一条素材
summary: 待编译的素材。
status: stub
domain: doctor
origin: note
confirmed: auto
created: 2026-11-22
updated: 2026-11-22
---

# 一条素材

原文在这里，[[concepts/llm-wiki]] 这种链接不该进图。
`, ROOT)
const withRaw = buildSnapshot(pages, [rawPage])
console.log('[raw]')
check('raw 页 id 是 raw/<slug>', rawPage.id === 'raw/note-a', rawPage.id)
check('raw 页层标记正确', rawPage.layer === 'raw')
check('raw 页进 raw 索引', withRaw.raw.has('raw/note-a'))
check('raw 页不进 byId（不会和 wiki 页撞 id）', !withRaw.byId.has('raw/note-a'))
check('raw 页不产生出链', !withRaw.linksById.has('raw/note-a'))
check('domain 被读出', rawPage.domain === 'doctor', String(rawPage.domain))

// 8. 提案往返
const proposalText = buildProposalText({
  target: 'concepts/llm-wiki',
  action: 'update',
  pageText: '---\nid: concepts/llm-wiki\ntype: concept\ntitle: t\nsummary: s\nstatus: active\nsources:\n  - sources/karpathy-gist\n---\n\n# t\n\n## 关联\n\n- [[concepts/retrieval-as-reasoning]]\n',
  now: NOW,
  rationale: '补一条反例',
  baseUpdated: '2026-11-22',
})
const parsedProposal = parseProposal('mybrain/3-review/x.md', proposalText)
console.log('[proposal]')
check('提案能解析出 target', parsedProposal?.meta.target === 'concepts/llm-wiki')
check('提案能解析出 action', parsedProposal?.meta.action === 'update')
check('提案能解析出 base', parsedProposal?.meta.base === '2026-11-22')
check('提案正文只剩拟写入内容', (parsedProposal?.body ?? '').startsWith('---'), (parsedProposal?.body ?? '').slice(0, 20))
check('base 不符时合并会被判冲突（checkPageBody 之外的第二道门）',
  buildProposalText({ target: 'concepts/llm-wiki', action: 'update', pageText: 'x', now: NOW, baseUpdated: 'old' }).includes('base: old'))

// 9. 去重候选
const dupSnapshot = buildSnapshot([
  ...pages,
  parsePage('mybrain/2-wiki/concepts/llm-wiki-duplicate.md', `---
id: concepts/llm-wiki-duplicate
type: concept
title: LLM Wiki：把检索变成编译
summary: 与 llm-wiki 几乎是同一页。
status: active
aliases:
  - llm wiki
sources:
  - sources/karpathy-gist
created: 2026-11-22
updated: 2026-11-22
---

# LLM Wiki

## 关联

- [[sources/karpathy-gist]]
- [[concepts/retrieval-as-reasoning]]
`, ROOT),
])
const pairs = dedupe(dupSnapshot, { threshold: 0.6 })
console.log('[dedupe]')
check('能找到高度相似的候选对', pairs.length >= 1, String(pairs.length))
check('保留的一方是入链更多的页', pairs[0]?.keep === 'concepts/llm-wiki', String(pairs[0]?.keep))

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
