/**
 * git 通道：只在 Config.gitEnabled 打开时才被调用。
 *
 * 三条纪律（比功能重要）：
 * 1. 只碰 `2-wiki/` 与 `3-review/`——库以外的东西（用户的 Obsidian 附件、别处笔记）不归我们管。
 * 2. 回滚 = `git checkout <commit> -- <path>` 把文件恢复成那版，**不做** `reset --hard`、
 *    不删提交、不动 index 之外的分支。回滚本身也要能被再回滚，所以先打一份 `.backup`。
 * 3. 没有 git、不是仓库、git 二进制缺失，一律返回可读的错误，不猜、不自动 `git init`。
 */

import { execFile } from 'node:child_process'
import { join } from 'node:path'

const MAX_BUFFER = 8 * 1024 * 1024

/** 原样返回 stdout（不 trim）：porcelain 输出靠前导空格定列，trim 会错位。 */
function runRaw(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...args], { maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(Object.assign(new Error((stderr || error.message).trim()), { code: error.code }))
        return
      }
      resolve(stdout)
    })
  })
}

function run(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...args], { maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      if (error !== null) {
        reject(Object.assign(new Error((stderr || error.message).trim()), { code: error.code }))
        return
      }
      resolve(stdout.trim())
    })
  })
}

export interface GitCommit {
  hash: string
  date: string
  subject: string
}

/** git 可用且库根就是一个仓库；两个条件任一不满足，A17 就报错而不是硬来。 */
export async function inspectRepo(root: string): Promise<{ ok: true } | { ok: false, code: string, message: string }> {
  try {
    await run(root, ['--version'])
  } catch {
    return { ok: false, code: 'E_NO_GIT', message: '这台机器上没有可用的 git 命令' }
  }
  try {
    const top = await run(root, ['rev-parse', '--show-toplevel'])
    if (top === '') return { ok: false, code: 'E_NOT_A_REPO', message: '库不是 git 仓库' }
    return { ok: true }
  } catch {
    return { ok: false, code: 'E_NOT_A_REPO', message: `库根不是 git 仓库：${join(root, '.git')} 不存在。回滚需要先 git init 并提交一次` }
  }
}

/** 最近的提交，供面板/工具挑一个目标。 */
export async function recentCommits(root: string, limit = 20): Promise<GitCommit[]> {
  const format = '%H%x09%cI%x09%s'
  const out = await run(root, ['log', `-n${limit}`, `--format=${format}`, '--', '2-wiki', '3-review'])
  if (out === '') return []
  return out.split('\n').map(line => {
    const [hash, date, subject] = line.split('\t')
    return { hash: hash ?? '', date: date ?? '', subject: subject ?? '' }
  }).filter(commit => commit.hash !== '')
}

/** 工作区是否干净（只看我们管的两个目录）。 */
export async function dirtyPaths(root: string): Promise<string[]> {
  // `-z` 输出以 NUL 分隔，不受路径里空格/中文影响；每段前 3 个字符是 XY + 空格。
  const out = await runRaw(root, ['status', '--porcelain=v1', '-z', '--', '2-wiki', '3-review'])
  if (out === '') return []
  return out.split('\0')
    .filter(entry => entry.length > 3)
    .map(entry => entry.slice(3))
    .filter(path => path !== '2-wiki' && path !== '3-review')
}

/** 提交这两个目录；没有改动时返回 null。 */
export async function commitLibrary(root: string, message: string): Promise<string | null> {
  const dirty = await dirtyPaths(root)
  if (dirty.length === 0) return null
  // 只 add / 只 commit 实际变动的那几个文件：目录做 pathspec 时，
  // 空目录（提案已被删的 3-review）会让 git 直接报 "did not match any files"。
  await run(root, ['add', '--', ...dirty])
  // 只提交我们刚 add 的那些具体文件：目录做 pathspec 时，
  // 空目录（比如 3-review 里的提案已被删）会让 git 直接报 "did not match any files"。
  await run(root, [
    '-c', 'user.name=llm-wiki',
    '-c', 'user.email=llm-wiki@local',
    'commit', '--no-verify', '-m', message,
    '--', ...dirty,
  ])
  const hash = await run(root, ['rev-parse', '--short', 'HEAD'])
  return hash
}

/**
 * 把 `2-wiki` 与 `3-review` 恢复成某个提交的版本。
 * 那版没有、现在有的文件交给调用方移进回收站（这里不直接删，留后路）。
 */
export async function restoreTree(root: string, commit: string): Promise<{ restored: string[], extras: string[] }> {
  let tracked: string
  try {
    tracked = await run(root, ['ls-tree', '-r', '--name-only', commit, '--', '2-wiki', '3-review'])
  } catch {
    throw Object.assign(new Error(`提交 ${commit} 不存在或不可读`), { code: 'E_BAD_COMMIT' })
  }
  const files = tracked.split('\n').filter(path => path !== '')
  if (files.length === 0) throw Object.assign(new Error(`提交 ${commit} 里没有 2-wiki / 3-review`), { code: 'E_BAD_COMMIT' })

  const listed = new Set(files)
  let current: string[] = []
  try {
    current = (await run(root, ['ls-files', '--', '2-wiki', '3-review'])).split('\n').filter(path => path !== '')
  } catch {
    current = []
  }
  const extras = current.filter(path => !listed.has(path))

  // 用具体文件做 pathspec：那版可能根本没有 3-review 目录。
  await run(root, ['checkout', commit, '--', ...files])
  return { restored: files, extras }
}

/** 只恢复单个文件（更小的爆炸半径）。 */
export async function restoreFile(root: string, commit: string, relPath: string): Promise<void> {
  try {
    await run(root, ['cat-file', '-e', `${commit}:${relPath}`])
  } catch {
    throw Object.assign(new Error(`提交 ${commit} 里没有 ${relPath}`), { code: 'E_BAD_COMMIT' })
  }
  await run(root, ['checkout', commit, '--', relPath])
}
