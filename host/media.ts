/**
 * 音视频通道。设计原则来自 PRD §10.4 与用户拍板：
 *
 * 1. **不内置转写**：DSH 本身没有 ASR 能力，通道由配置决定（none / whisper / api）。
 * 2. **长文件先切片再转写再合并**：超过 `audioMaxMinutes` 就按 `audioChunkMinutes` 切，
 *    切片落在 `0-inbox/files/.parts/<slug>/`，是中间物，清理时可直接回收。
 * 3. **每一步失败都要能说清是哪一步**：探时长、切片、转写各报各的错误码。
 */

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const MAX_BUFFER = 16 * 1024 * 1024

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(Object.assign(new Error((stderr || error.message).trim().slice(0, 300)), { code: 'E_BIN' }))
        return
      }
      resolve(stdout)
    })
  })
}

async function hasBinary(bin: string): Promise<boolean> {
  try {
    await run(bin, ['-version'])
    return true
  } catch {
    // 有的版本只认 `--version`，再试一次。
    try {
      await run(bin, ['--version'])
      return true
    } catch {
      return false
    }
  }
}

export const AUDIO_EXT = /\.(mp3|m4a|wav|aac|flac|ogg|opus|wma|amr|mp4|mov|mkv|webm|avi)$/i

export interface MediaInfo {
  durationSeconds: number
  sampleRate?: number
  channels?: number
}

/** 用 ffprobe 探时长；没有 ffprobe 就返回 undefined（调用方决定降级还是报错）。 */
export async function probe(absolute: string): Promise<MediaInfo | undefined> {
  if (!(await hasBinary('ffprobe'))) return undefined
  try {
    const out = await run('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'format=duration:stream=sample_rate,channels',
      '-of', 'json',
      absolute,
    ])
    const parsed = JSON.parse(out) as { format?: { duration?: string }, streams?: { sample_rate?: string, channels?: number }[] }
    const duration = Number(parsed.format?.duration ?? '')
    if (!Number.isFinite(duration) || duration <= 0) return undefined
    const stream = parsed.streams?.[0]
    return {
      durationSeconds: Math.round(duration),
      sampleRate: stream?.sample_rate === undefined ? undefined : Number(stream.sample_rate),
      channels: stream?.channels,
    }
  } catch {
    return undefined
  }
}

export interface SliceResult {
  directory: string
  parts: { name: string, seconds: number }[]
}

/**
 * 切成等长分片。`segment_time` 秒一片，输出 `part-01.m4a` 这样的名字。
 * 用 16 kHz 单声道 m4a：ASR 通道普遍接受，体积也小。
 */
export async function slice(
  absolute: string,
  outDir: string,
  chunkSeconds: number,
  totalSeconds: number,
): Promise<SliceResult | undefined> {
  if (!(await hasBinary('ffmpeg'))) return undefined
  const { mkdir } = await import('node:fs/promises')
  await mkdir(outDir, { recursive: true })
  try {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', absolute,
      '-vn', '-ac', '1', '-ar', '16000',
      '-f', 'segment', '-segment_time', String(chunkSeconds), '-reset_timestamps', '1',
      join(outDir, 'part-%02d.m4a')])
  } catch {
    return undefined
  }
  const names = (await readdir(outDir)).filter(name => name.startsWith('part-')).sort()
  if (names.length === 0) return undefined
  const parts = names.map((name, index) => {
    const seconds = Math.min(chunkSeconds, Math.max(0, totalSeconds - index * chunkSeconds))
    return { name, seconds }
  })
  return { directory: outDir, parts }
}

/** 转写通道。返回逐段文本；空字符串代表这一段没识别出内容。 */
export type Transcriber = (absolute: string, hint: { part: number, total: number }) => Promise<string>

/** 本机 whisper 系列命令行（whisper / whisper-cli / whisper.cpp 的 main）。 */
export async function localWhisper(): Promise<Transcriber | undefined> {
  const candidates = ['whisper-cli', 'whisper', 'main']
  let bin: string | undefined
  for (const candidate of candidates) {
    if (await hasBinary(candidate)) {
      bin = candidate
      break
    }
  }
  if (bin === undefined) return undefined
  return async (absolute) => {
    const work = await mkdtemp(join(tmpdir(), 'wiki-asr-'))
    try {
      await run(bin!, ['-f', absolute, '-otxt', '-of', join(work, 'out'), '-np'])
      const text = await readFile(join(work, 'out.txt'), 'utf8')
      return text.trim()
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  }
}

/**
 * OpenAI 兼容的 `/v1/audio/transcriptions`。
 * 端点与凭据只从环境变量取：`DSH_WIKI_ASR_URL` / `DSH_WIKI_ASR_KEY` / `DSH_WIKI_ASR_MODEL`。
 * 不写进配置文件，避免凭据落到 Markdown 库里。
 */
export async function apiTranscriber(): Promise<Transcriber | undefined> {
  const endpoint = process.env.DSH_WIKI_ASR_URL ?? ''
  const key = process.env.DSH_WIKI_ASR_KEY ?? ''
  if (endpoint === '' || key === '') return undefined
  const model = process.env.DSH_WIKI_ASR_MODEL ?? 'whisper-1'
  return async (absolute) => {
    const bytes = await readFile(absolute)
    const form = new FormData()
    form.append('model', model)
    form.append('response_format', 'json')
    form.append('file', new Blob([bytes], { type: 'audio/mp4' }), basename(absolute))
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}` },
      body: form,
    })
    if (!response.ok) {
      throw Object.assign(new Error(`ASR 接口 ${response.status}`), { code: 'E_RATE_LIMIT' })
    }
    const payload = await response.json() as { text?: string }
    return (payload.text ?? '').trim()
  }
}

/** 按 provider 选通道；选不到就说明缺什么。 */
export async function makeTranscriber(provider: 'none' | 'whisper' | 'api'): Promise<{ ok: true, transcribe: Transcriber } | { ok: false, reason: string }> {
  if (provider === 'none') return { ok: false, reason: 'audioProvider=none：音视频只存档，不转写' }
  if (provider === 'whisper') {
    const local = await localWhisper()
    if (local === undefined) return { ok: false, reason: '找不到 whisper 命令行（whisper-cli / whisper / main 都不在 PATH）' }
    return { ok: true, transcribe: local }
  }
  const api = await apiTranscriber()
  if (api === undefined) {
    return { ok: false, reason: '缺少 DSH_WIKI_ASR_URL / DSH_WIKI_ASR_KEY 环境变量（api 通道不走配置文件）' }
  }
  return { ok: true, transcribe: api }
}

/** 合并逐段文本：保留分段标记与起始时间，方便回溯是哪一段说的。 */
export function mergeParts(parts: { index: number, startSeconds: number, text: string }[]): string {
  return parts.map(part => {
    const minutes = Math.floor(part.startSeconds / 60)
    const seconds = part.startSeconds % 60
    const stamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    return `### 第 ${part.index} 段 · ${stamp}\n\n${part.text === '' ? '（这一段没有识别到语音）' : part.text}`
  }).join('\n\n')
}
