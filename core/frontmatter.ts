/**
 * 极简 YAML frontmatter 解析/序列化。
 *
 * 只支持 LLM Wiki 用到的子集：标量、内联数组、块数组、块标量（`|` / `>`）。
 * 刻意不引入 YAML 依赖：两个插件运行在不同宿主里（DSH host / Obsidian renderer），
 * 共享一份零依赖实现比各自装解析器更可控。无法识别的行原样保留在 `unknownLines`，
 * lint 会把它报成 L003，而不是静默丢失。
 */

export interface ParsedDocument {
  /** 解析出的键值；未声明 frontmatter 时为空对象。 */
  data: Record<string, unknown>
  /** frontmatter 之后的正文。 */
  body: string
  hasFrontmatter: boolean
  /** 解析器无法识别的行（行号从 1 开始）。 */
  unknownLines: { line: number, text: string }[]
}

const KEY_LINE = /^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string
    } catch {
      return trimmed.slice(1, -1)
    }
  }
  if (trimmed.length >= 2 && trimmed.startsWith('\'') && trimmed.endsWith('\'')) {
    return trimmed.slice(1, -1).replace(/''/g, '\'')
  }
  return trimmed
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (trimmed === 'null' || trimmed === '~') return null
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^[-+]?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  if (/^[-+]?\d*\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (inner === '') return []
    return splitInlineList(inner).map(item => parseScalar(item))
  }
  if (trimmed.startsWith('{')) {
    // 流式映射不在使用范围内：保留原文，交由 lint 报 schema 问题。
    return trimmed
  }
  return unquote(trimmed)
}

function splitInlineList(inner: string): string[] {
  const items: string[] = []
  let current = ''
  let quote: '"' | '\'' | null = null
  for (const char of inner) {
    if (quote) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      current += char
      continue
    }
    if (char === ',') {
      items.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim() !== '') items.push(current.trim())
  return items
}

/**
 * 解析一段 Markdown 文本。
 * @param text - 原始文件内容（可含 BOM / CRLF）。
 * @returns frontmatter 数据、正文与无法识别的行。
 */
export function parseDocument(text: string): ParsedDocument {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const result: ParsedDocument = { data: {}, body: normalized, hasFrontmatter: false, unknownLines: [] }

  if (lines[0]?.trim() !== '---') return result
  let close = -1
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]!.trim()
    if (line === '---' || line === '...') {
      close = index
      break
    }
  }
  if (close === -1) return result

  result.hasFrontmatter = true
  result.body = lines.slice(close + 1).join('\n').replace(/^\n+/, '')

  let pendingKey: string | null = null
  let pendingBlock: 'list' | 'literal' | 'folded' | null = null
  let blockLines: string[] = []

  const flush = () => {
    if (!pendingKey) return
    if (pendingBlock === 'list') {
      result.data[pendingKey] = blockLines.map(item => unquote(item.replace(/^-\s*/, '')))
    } else if (pendingBlock === 'literal' || pendingBlock === 'folded') {
      const joined = pendingBlock === 'literal' ? blockLines.join('\n') : blockLines.join(' ')
      result.data[pendingKey] = joined
    }
    pendingKey = null
    pendingBlock = null
    blockLines = []
  }

  for (let index = 1; index < close; index += 1) {
    const rawLine = lines[index]!
    const lineNumber = index + 1
    if (rawLine.trim() === '' || rawLine.trimStart().startsWith('#')) {
      if (pendingBlock === 'literal' || pendingBlock === 'folded') {
        flush()
      }
      continue
    }

    const itemMatch = /^\s*-\s*(.*)$/.exec(rawLine)
    if (itemMatch) {
      if (pendingKey && (pendingBlock === 'list' || pendingBlock === null)) {
        pendingBlock = 'list'
        blockLines.push(itemMatch[1] ?? '')
        continue
      }
      result.unknownLines.push({ line: lineNumber, text: rawLine })
      continue
    }

    if ((pendingBlock === 'literal' || pendingBlock === 'folded') && /^\s+/.test(rawLine)) {
      blockLines.push(rawLine.trim())
      continue
    }

    const keyMatch = KEY_LINE.exec(rawLine)
    if (!keyMatch) {
      result.unknownLines.push({ line: lineNumber, text: rawLine })
      continue
    }

    flush()
    const key = keyMatch[1]!
    const value = (keyMatch[2] ?? '').trim()
    if (value === '') {
      // 可能跟随块数组或块标量。
      pendingKey = key
      pendingBlock = null
      continue
    }
    if (value === '|' || value === '|-' || value === '>') {
      pendingKey = key
      pendingBlock = value.startsWith('|') ? 'literal' : 'folded'
      continue
    }
    result.data[key] = parseScalar(value)
  }
  flush()

  return result
}

const NEEDS_QUOTE = /[:#\[\]{}&*!|>'"%@`]|^\s|\s$/

function formatScalar(value: unknown): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (value === null) return 'null'
  const text = String(value)
  if (text === '' || NEEDS_QUOTE.test(text) || text.includes('\n')) return JSON.stringify(text)
  return text
}

/**
 * 序列化 frontmatter，按 `order` 给出的字段顺序输出，其余键按原顺序追加。
 * 数组统一用块数组，避免内联列表里出现逗号导致解析歧义。
 * @param data - 要写入的字段。
 * @param order - 规范字段顺序，默认使用 model.ts 的 CANONICAL_FIELDS。
 * @returns 含首尾 `---` 的 frontmatter 文本（以换行结尾）。
 */
export function stringifyFrontmatter(data: Record<string, unknown>, order?: readonly string[]): string {
  const keys = order ? [...order.filter(key => data[key] !== undefined && data[key] !== null)] : []
  for (const key of Object.keys(data)) {
    if (data[key] === undefined || data[key] === null) continue
    if (!keys.includes(key)) keys.push(key)
  }

  const lines: string[] = ['---']
  for (const key of keys) {
    const value = data[key]
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`)
        continue
      }
      lines.push(`${key}:`)
      for (const item of value) lines.push(`  - ${formatScalar(item)}`)
      continue
    }
    if (typeof value === 'object') {
      // 嵌套对象（proposal 块）用缩进两格的子键输出。
      lines.push(`${key}:`)
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`  ${childKey}: ${formatScalar(childValue)}`)
      }
      continue
    }
    lines.push(`${key}: ${formatScalar(value)}`)
  }
  lines.push('---')
  return `${lines.join('\n')}\n`
}
