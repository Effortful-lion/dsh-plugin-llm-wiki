/**
 * 去重候选：先算规则相似的候选对，再交给后续动作。
 *
 * 这里只做"哪两页可能是同一件事"的判断准备，**不判断是否真的重复**——
 * 是否合并由提案裁决。这样规则层永远零 token，且不会自己动手删东西。
 */

import { stripCode } from './parse.ts'
import { LIMITS, type Snapshot, type WikiPage } from './model.ts'

export interface DedupePair {
  /** 建议保留的页（入链多、内容多的一方）。 */
  keep: string
  /** 建议合并掉的页。 */
  drop: string
  similarity: number
}

/** 中文二元组 / 英文整词。 */
function gramsOf(text: string): Set<string> {
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

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const gram of left) if (right.has(gram)) shared += 1
  return shared / (left.size + right.size - shared)
}

/**
 * 包含度（重叠系数）：共享 / 较小集合。
 * 用来补 jaccard 的短板——短标题与长标题的 jaccard 天然偏低，但"短的那个被完全包含"就是强信号。
 */
function overlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let shared = 0
  for (const gram of left) if (right.has(gram)) shared += 1
  return shared / Math.min(left.size, right.size)
}

/** 标题相似度：jaccard 与包含度各占一半，既抓"几乎重合"也抓"短的被长的吞掉"。 */
function titleSimilarity(left: Set<string>, right: Set<string>): number {
  return (jaccard(left, right) + overlap(left, right)) / 2
}

/** 该页在 `## 关联` 里指向的邻居。 */
function neighborsOf(page: WikiPage, snapshot: Snapshot): Set<string> {
  const links = snapshot.linksById.get(page.id) ?? []
  return new Set(links.filter(link => link.inRelated && link.resolved).map(link => link.resolved!))
}

/**
 * 计算重复候选对。
 * @param snapshot - 整库快照。
 * @param options - 阈值与条数上限。
 */
export function dedupe(snapshot: Snapshot, options: { threshold?: number, limit?: number } = {}): DedupePair[] {
  const threshold = options.threshold ?? LIMITS.dupThreshold
  const limit = options.limit ?? LIMITS.dupMaxPairs
  const pages = snapshot.pages.filter(page => page.type !== 'index' && page.type !== 'log' && page.status !== 'deprecated')

  const pairs: DedupePair[] = []
  for (let leftIndex = 0; leftIndex < pages.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < pages.length; rightIndex += 1) {
      const left = pages[leftIndex]!
      const right = pages[rightIndex]!
      // 类型不同就不是同一个实体：source 页永远不该并进 concept 页。
      if (left.type !== right.type) continue
      const leftTitle = gramsOf(`${left.title} ${left.aliases.join(' ')}`)
      const rightTitle = gramsOf(`${right.title} ${right.aliases.join(' ')}`)
      const titleScore = titleSimilarity(leftTitle, rightTitle)
      const leftAlias = gramsOf(left.aliases.join(' '))
      const rightAlias = gramsOf(right.aliases.join(' '))
      const leftNeighbors = neighborsOf(left, snapshot)
      const rightNeighbors = neighborsOf(right, snapshot)
      // 权重按"这一维是否有可比内容"归一化：两边都没别名时，别名不该拉低整体相似度。
      const dims: { score: number, weight: number }[] = [{ score: titleScore, weight: 0.6 }]
      if (leftAlias.size > 0 && rightAlias.size > 0) dims.push({ score: jaccard(leftAlias, rightAlias), weight: 0.2 })
      if (leftNeighbors.size > 0 && rightNeighbors.size > 0) dims.push({ score: jaccard(leftNeighbors, rightNeighbors), weight: 0.2 })
      const total = dims.reduce((sum, dim) => sum + dim.weight, 0)
      const similarity = dims.reduce((sum, dim) => sum + dim.score * dim.weight, 0) / total
      if (similarity < threshold) continue

      const leftInbound = snapshot.inbound.get(left.id) ?? 0
      const rightInbound = snapshot.inbound.get(right.id) ?? 0
      const keep = leftInbound > rightInbound
        ? left
        : leftInbound < rightInbound
          ? right
          : stripCode(left.body).length >= stripCode(right.body).length ? left : right
      const drop = keep.id === left.id ? right : left
      pairs.push({ keep: keep.id, drop: drop.id, similarity })
    }
  }

  return pairs.sort((left, right) => right.similarity - left.similarity).slice(0, limit)
}
