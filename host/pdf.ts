/**
 * PDF 文本抽取的兜底实现。
 *
 * 为什么要有它：这台机器上没装 `pdftotext`，DSH 自己不解析 PDF，
 * 而"论文/报告进库"是这类知识库最高频的输入。链路优先用 pdftotext（质量最好），
 * 缺失时退到这里的纯 JS 实现：解 Flate 压缩 + 抽 BT/ET 里的 Tj / TJ / ' / " 字符串。
 *
 * 能力边界（必须写在取用方能看到的地方）：
 * - 只处理文本型 PDF；扫描件、图片页抽不出字（抽出来太短就当作失败，交还"仅存档"）。
 * - 不处理 CID/ToUnicode 复杂编码，中文可能乱码；乱码检测靠"可读字符占比"。
 */

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { inflateSync, inflateRawSync } from 'node:zlib'

/** 抽出来的字里，至少要有这么多"像正常文本"的字符，才认为抽取成功。 */
const MIN_USEFUL_CHARS = 200

function decodeStream(data: Buffer): Buffer | undefined {
  for (const inflate of [inflateSync, inflateRawSync]) {
    try {
      return inflate(data)
    } catch {
      continue
    }
  }
  return undefined
}

/** 把 PDF 的字符串字面量转义解开：\\n \\r \\t \\( \\) \\\\ 与八进制。 */
function unescapePdfString(raw: string): string {
  let out = ''
  for (let index = 0; index < raw.length; index += 1) {
    const ch = raw[index]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = raw[index + 1]
    index += 1
    if (next === 'n') out += '\n'
    else if (next === 'r') out += '\r'
    else if (next === 't') out += '\t'
    else if (next === '(' || next === ')' || next === '\\') out += next
    else if (next !== undefined && /[0-7]/.test(next)) {
      let octal = next
      while (octal.length < 3 && index + 1 < raw.length && /[0-7]/.test(raw[index + 1] ?? '')) {
        octal += raw[index + 1]
        index += 1
      }
      out += String.fromCharCode(parseInt(octal, 8))
    }
  }
  return out
}

/** 从一个内容流里抽文本：逐行扫，遇 `Tj` / `TJ` / `'` / `"` 收一段。 */
function textOfContent(content: string): string {
  const pieces: string[] = []
  const literal = /\((?:\\.|[^\\)])*\)/g
  const showText = /(\[[^\]]*\]|\((?:\\.|[^\\)])*\))\s*(Tj|TJ|'|")/g

  let match: RegExpExecArray | null
  while ((match = showText.exec(content)) !== null) {
    const chunk = match[1] ?? ''
    if (chunk.startsWith('[')) {
      // TJ 数组：字符串片段之间可能出现字距调整数字，逐段取出再拼。
      literal.lastIndex = 0
      let inner: RegExpExecArray | null
      const segment: string[] = []
      while ((inner = literal.exec(chunk)) !== null) {
        segment.push(unescapePdfString(inner[0].slice(1, -1)))
      }
      pieces.push(segment.join(''))
    } else {
      pieces.push(unescapePdfString(chunk.slice(1, -1)))
    }
    // 行尾换行由 T* / TD / Td 决定，这里用空白兜底，避免整页粘连。
    if (match[2] === 'Tj' || match[2] === 'TJ') pieces.push(' ')
  }
  return pieces.join('')
}

/** 可读字符占比：中文、ASCII 字母数字、常见标点算可读。 */
function usefulRatio(text: string): number {
  const compact = text.replace(/\s+/g, '')
  if (compact === '') return 0
  let useful = 0
  for (const ch of compact) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0x20 && code <= 0x7e) useful += 1
    else if (code >= 0x4e00 && code <= 0x9fff) useful += 1
    else if (code >= 0x3000 && code <= 0x303f) useful += 1
    else if (code >= 0xff00 && code <= 0xff65) useful += 1
  }
  return useful / [...compact].length
}

export interface PdfExtraction {
  text: string
  /** 解释一下抽取质量，写进素材正文，省得以后怀疑。 */
  note: string
}

/**
 * 第二个通道：系统 python3 里如果有 pypdf，用它抽（质量远好于下面的 JS 兜底）。
 * 只依赖"本机已有的 python3 + pypdf"，缺失就返回 undefined，由调用方继续降级。
 */
export async function extractPdfViaPython(absolute: string): Promise<PdfExtraction | undefined> {
  const script = [
    'import json,sys',
    'try:',
    '    from pypdf import PdfReader',
    'except Exception:',
    '    print(json.dumps({"ok": False, "why": "no pypdf"})); raise SystemExit(0)',
    'reader = PdfReader(sys.argv[1])',
    'pages = [p.extract_text() or "" for p in reader.pages]',
    'print(json.dumps({"ok": True, "pages": len(pages), "text": "\\n\\n".join(pages)}, ensure_ascii=False))',
  ].join('\n')
  const out = await new Promise<string>((resolve, reject) => {
    execFile('python3', ['-c', script, absolute], { maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
  }).catch(() => '')
  if (out.trim() === '') return undefined
  let payload: { ok?: boolean, why?: string, pages?: number, text?: string }
  try {
    payload = JSON.parse(out) as typeof payload
  } catch {
    return undefined
  }
  if (payload.ok !== true || typeof payload.text !== 'string') return undefined
  const text = payload.text.replace(/[ \t]{2,}/g, ' ').trim()
  if (text.length < MIN_USEFUL_CHARS) return undefined
  return {
    text,
    note: `python3 + pypdf 抽取：${payload.pages ?? 0} 页`,
  }
}

/** 抽 PDF；抽不出可用文本时返回 undefined，调用方据此"仅存档"。 */
export async function extractPdfText(absolute: string): Promise<PdfExtraction | undefined> {
  const bytes = await readFile(absolute)
  if (bytes.length === 0) return undefined

  const streams: string[] = []
  const streamPattern = /stream\r?\n/g
  const content = bytes.toString('latin1')
  let match: RegExpExecArray | null
  while ((match = streamPattern.exec(content)) !== null) {
    const start = match.index + match[0].length
    const end = bytes.indexOf(Buffer.from('endstream'), start)
    if (end < 0) break
    const payload = bytes.subarray(start, end)
    const inflated = decodeStream(payload)
    if (inflated === undefined) continue
    streams.push(inflated.toString('latin1'))
    streamPattern.lastIndex = end
  }

  const merged = streams.map(textOfContent).join('\n').replace(/[ \t]{2,}/g, ' ').trim()
  const ratio = usefulRatio(merged)
  if (merged.length < MIN_USEFUL_CHARS || ratio < 0.7) return undefined
  return {
    text: merged,
    note: `纯 JS 抽取（未装 pdftotext）：${streams.length} 个内容流，可读字符占比 ${(ratio * 100).toFixed(0)}%`,
  }
}
