/**
 * 检索：结构化信号优先，正文只做兜底。
 *
 * 这是"预算感知遍历"的第一跳。返回的每一条都是指针 + 极短摘要，
 * 让 agent 用少量 token 判断"要不要打开"，而不是一次把五页正文塞进上下文。
 */

import { stripCode } from './parse.ts'
import { LIMITS, type PageType, type PageStatus, type Snapshot } from './model.ts'

export type MatchField = 'id' | 'title' | 'alias' | 'tag' | 'summary' | 'body'

export interface SearchHit {
  id: string
  title: string
  type: PageType
  status: PageStatus
  summary: string
  tags: string[]
  domain?: string
  updated: string
  score: number
  matched: MatchField[]
  inbound: number
}

export interface SearchOptions {
  types?: PageType[]
  tags?: string[]
  limit?: number
  /** 是否包含 stub 页（默认包含：stub 也是"缺什么"的信号）。 */
  includeStubs?: boolean
  /** 是否包含 deprecated 页（默认不含：墓碑不该出现在回答里）。 */
  includeDeprecated?: boolean
  /** 领域硬过滤；给了就只在这个领域里找。 */
  domain?: string
}

/** 中文按二元组切，英文按词切；用于补"整串词不命中但字面相近"的情况。 */
function bigramsOf(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim()
  const grams = new Set<string>()
  for (const word of normalized.split(' ')) {
    if (word === '') continue
    if (/^[\x00-\x7F]+$/.test(word)) {
      if (word.length > 1) grams.add(word)
      continue
    }
    const chars = [...word]
    if (chars.length === 1) grams.add(chars[0]!)
    for (let index = 0; index + 1 < chars.length; index += 1) {
      grams.add(`${chars[index]}${chars[index + 1]}`)
    }
  }
  return grams
}

function tokensOf(query: string): string[] {
  return query.toLowerCase().split(/\s+/).map(token => token.trim()).filter(token => token !== '')
}

function clip(text: string, limit: number): string {
  const single = text.replace(/\s+/g, ' ').trim()
  if (single.length <= limit) return single
  return `${single.slice(0, Math.max(0, limit - 1))}…`
}

/**
 * 按结构化字段检索页面。
 * @param snapshot - 整库快照。
 * @param query - 查询词；空串表示"按入链与更新时间排序的概览"。
 * @param options - 类型/标签过滤与条数上限。
 * @returns 按分数降序的指针列表，绝不含正文。
 */
export function searchPages(snapshot: Snapshot, query: string, options: SearchOptions = {}): SearchHit[] {
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20))
  const queryTokens = tokensOf(query)
  const queryGrams = queryTokens.length === 0 ? new Set<string>() : bigramsOf(query)
  const hits: SearchHit[] = []

  for (const page of snapshot.pages) {
    if (page.type === 'index' || page.type === 'log') continue
    if (options.types && options.types.length > 0 && !options.types.includes(page.type)) continue
    if (options.includeStubs === false && page.status === 'stub') continue
    if (options.includeDeprecated !== true && page.status === 'deprecated') continue
    if (options.domain !== undefined && options.domain !== '' && (page.domain ?? '') !== options.domain) continue
    if (options.tags && options.tags.length > 0) {
      const pageTags = page.tags.map(tag => tag.toLowerCase())
      if (!options.tags.every(tag => pageTags.includes(tag.toLowerCase()))) continue
    }

    const matched: MatchField[] = []
    let score = 0

    if (queryTokens.length === 0) {
      score = (snapshot.inbound.get(page.id) ?? 0) * 2
    } else {
      const title = page.title.toLowerCase()
      const id = page.id.toLowerCase()
      const aliases = page.aliases.map(alias => alias.toLowerCase())
      const tags = page.tags.map(tag => tag.toLowerCase())
      const summary = page.summary.toLowerCase()
      const body = stripCode(page.body).toLowerCase()

      let allTokensMatched = true
      for (const token of queryTokens) {
        let tokenScore = 0
        let tokenField: MatchField | undefined

        if (title === token || aliases.includes(token)) { tokenScore = 120; tokenField = 'title' }
        else if (title.startsWith(token)) { tokenScore = 90; tokenField = 'title' }
        else if (aliases.some(alias => alias.startsWith(token))) { tokenScore = 85; tokenField = 'alias' }
        else if (title.includes(token)) { tokenScore = 70; tokenField = 'title' }
        else if (tags.includes(token)) { tokenScore = 60; tokenField = 'tag' }
        else if (id.includes(token)) { tokenScore = 45; tokenField = 'id' }
        else if (summary.includes(token)) { tokenScore = 35; tokenField = 'summary' }
        else if (body.includes(token)) { tokenScore = 15; tokenField = 'body' }

        if (tokenScore === 0) {
          allTokensMatched = false
          break
        }
        score += tokenScore
        if (tokenField && !matched.includes(tokenField)) matched.push(tokenField)
      }

      if (!allTokensMatched) continue
      // 二元组兜底：整词没命中但字面高度重合（中文缺分词时的典型情况）。
      const titleGrams = bigramsOf(`${page.title} ${page.aliases.join(' ')}`)
      let overlap = 0
      for (const gram of queryGrams) if (titleGrams.has(gram)) overlap += 1
      if (overlap >= 2) {
        score += 25
        if (!matched.includes('title')) matched.push('title')
      }
      // 入链是轻微的正向信号：被更多页引用，通常更"核心"。
      score += Math.min(snapshot.inbound.get(page.id) ?? 0, 10)
    }

    hits.push({
      id: page.id,
      title: page.title,
      type: page.type,
      status: page.status,
      summary: clip(page.summary || page.body.split('\n').find(line => line.trim() !== '') || '', LIMITS.snippetChars),
      tags: page.tags,
      domain: page.domain,
      updated: page.updated,
      score,
      matched,
      inbound: snapshot.inbound.get(page.id) ?? 0,
    })
  }

  return hits
    .sort((left, right) => right.score - left.score
      || right.inbound - left.inbound
      || left.title.localeCompare(right.title, 'zh-Hans-CN'))
    .slice(0, limit)
}
