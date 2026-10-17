#!/usr/bin/env node
/**
 * 一个会话（连同它派出去的子会话）这一轮到底改了什么：改过哪些文件、跑过哪些命令、提交了哪几次。
 *
 * 做回顾（`/retro`）时最贵的一步是「重建这次到底发生了什么」：`git log` 只有最后落盘的
 * 结果，看不到试错的路径（哪个文件改了又改、哪条命令反复跑、中途换过几次方案）。会话
 * 记录里有这些，但它躺在 `~/.dsh/sessions/` 的 zstd 多帧日志里，手工翻不动。
 *
 * 用法：
 *   node tools/session-changes.mjs                       # 最近一个会话及其全部子会话
 *   node tools/session-changes.mjs <会话 id>              # 指定会话
 *   node tools/session-changes.mjs --json                # 给机器读
 *   node tools/session-changes.mjs --since <毫秒时间戳>   # 只看这个时刻之后
 *
 * 会话 id 可以带 `session-` 前缀，也可以给纯 uuid。子会话按记录里的 `parentSession`
 * 自己找出来，不用一个个传。
 *
 * 取什么：`tool/call` 里对 bash、edit、write 的调用，抽出碰过的文件路径；对 git commit
 * 的调用抽出标题。文件路径只留仓库内的相对路径，其余（`~/.dsh` 下的、`tmp/` 里的）
 * 丢掉——回顾要看的是这次改了什么源码。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { repoRoot } from './lib/repo.mjs'

/** zstd 帧头魔数；一条会话日志是多帧首尾相接。 */
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * 解一条多帧 zstd 日志。
 * @param raw - 整个文件的字节。
 * @returns 解出来的文本；坏帧处停下，已解出的部分照常返回。
 */
function decodeLog(raw) {
  let out = ''
  let offset = 0
  while (offset < raw.length) {
    try {
      out += zstdDecompressSync(raw.subarray(offset)).toString('utf8')
    } catch {
      break
    }
    const next = raw.indexOf(FRAME_MAGIC, offset + 4)
    if (next < 0) break
    offset = next
  }
  return out
}

/**
 * 把一条日志文本拆成事件对象。
 * @param text - 解出来的 JSONL 文本。
 * @returns 解析成功的事件。
 */
function parseEvents(text) {
  const events = []
  for (const line of text.split('\n')) {
    if (line === '') continue
    try {
      events.push(JSON.parse(line))
    } catch {
      // 半行（日志正在写）跳过即可。
    }
  }
  return events
}

/**
 * 找一个工作目录对应的会话目录。
 * @param root - 仓库根。
 * @returns 该工作目录的会话目录，没有就 undefined。
 */
function sessionDirOf(root) {
  const base = join(homedir(), '.dsh', 'sessions')
  if (!existsSync(base)) return undefined
  // 会话目录名是「--」 + 去掉开头斜杠、斜杠换成短横的绝对路径 + 「--」。
  const wanted = `--${root.replace(/^\//, '').replaceAll('/', '-')}--`
  for (const name of readdirSync(base)) {
    if (name === wanted) return join(base, name)
  }
  return undefined
}

/**
 * 读一个会话的三个身份字段。
 * @param file - 会话日志文件。
 * @returns id、创建时刻、父会话 id。
 */
function identityOf(file) {
  const raw = readFileSync(file)
  const text = decodeLog(raw)
  const first = parseEvents(text.split('\n').slice(0, 1).join('\n'))[0]
  return {
    id: first?.id ?? '',
    createdAt: first?.createdAt ?? statSync(file).birthtimeMs,
    parent: first?.parentSession,
    origin: first?.origin,
  }
}

/**
 * 从一条 bash 命令里抽出碰过的仓库内文件路径。
 * @param command - 命令原文。
 * @param root - 仓库根，用来把绝对路径折成相对路径。
 * @returns 相对路径，去重。
 */
function pathsIn(command, root) {
  const found = new Set()
  // 只认「有扩展名、且文件真的在仓库里」的写法：`src/client/x.ts`、`./a.mjs`。
  // 光看形状会把 `foo.find`、`x.filter` 这类 JS 片段也当成路径收进来。
  for (const match of command.matchAll(/(?<![\w.$])((?:\.{0,2}\/)?[\w@-]+(?:\/[\w@.-]+)*\.(?:ts|tsx|js|mjs|mts|cts|json|md|css|yml|yaml|sh))\b/g)) {
    const token = match[1]
    const rel = relative(root, resolve(root, token))
    if (rel.startsWith('..') || rel === '') continue
    if (rel.startsWith('node_modules/') || rel.startsWith('tmp/') || rel.startsWith('.')) continue
    if (!existsSync(resolve(root, rel))) continue
    // 只留源码与配置：`lib/` 是构建产物，会话里几乎每条命令都会碰到。
    if (rel.startsWith('lib/')) continue
    found.add(rel)
  }
  return [...found]
}

const args = process.argv.slice(2)
const json = args.includes('--json')
const sinceIndex = args.indexOf('--since')
const since = sinceIndex >= 0 ? Number(args[sinceIndex + 1]) : 0
const wanted = args.find((arg, index) => !arg.startsWith('--')
  && (sinceIndex < 0 || index !== sinceIndex + 1))

const root = repoRoot(import.meta.dirname)
const dir = sessionDirOf(root)
if (dir === undefined) {
  console.error(`session-changes: 找不到 ${root} 对应的会话目录`)
  process.exit(2)
}

const sessions = readdirSync(dir)
  .map((name) => join(dir, name, 'session.v4.jsonl.zstd'))
  .filter((file) => existsSync(file))
  .map((file) => ({ file, ...identityOf(file) }))

/** 会话 id 允许带或不带 `session-` 前缀。 */
const normalize = (id) => String(id).replace(/^session-/, '')

let target
if (wanted !== undefined) {
  target = sessions.find((session) => normalize(session.id) === normalize(wanted))
  if (target === undefined) {
    console.error(`session-changes: 没有这个会话：${wanted}`)
    process.exit(2)
  }
} else {
  target = sessions.reduce((best, session) => (session.createdAt > best.createdAt ? session : best))
}

// 子会话可能不止一层，按 parentSession 逐层往下收。
const included = [target]
for (let changed = true; changed;) {
  changed = false
  for (const session of sessions) {
    if (included.includes(session)) continue
    if (included.some((parent) => normalize(parent.id) === normalize(session.parent ?? ''))) {
      included.push(session)
      changed = true
    }
  }
}

const report = { root, sessions: [] }
for (const session of included) {
  const events = parseEvents(decodeLog(readFileSync(session.file)))
  const files = new Set()
  const commits = []
  const commands = []
  for (const event of events) {
    if (event.type !== 'tool/call') continue
    if (since > 0 && event.time < since) continue
    let parsed
    try {
      parsed = JSON.parse(event.data.arguments)
    } catch {
      continue
    }
    const name = event.data.name
    if (name === 'bash') {
      const command = String(parsed.command ?? '')
      commands.push(command.split('\n')[0])
      for (const path of pathsIn(command, root)) files.add(path)
      for (const match of command.matchAll(/git\s+(?:-c\s+\S+\s+)?commit\s+[^|;&]*?-m\s+(['"])([\s\S]*?)\1/g)) {
        commits.push(match[2].split('\n')[0])
      }
    } else if (name === 'edit' || name === 'write' || name === 'read') {
      const path = String(parsed.file_path ?? '')
      if (path === '') continue
      const rel = relative(root, path.startsWith('/') ? path : resolve(root, path))
      if (rel.startsWith('..') || rel.startsWith('tmp/') || rel.startsWith('node_modules/')) continue
      if (name !== 'read') files.add(rel)
    }
  }
  report.sessions.push({
    id: session.id,
    parent: session.parent,
    origin: session.origin,
    createdAt: new Date(session.createdAt).toISOString(),
    files: [...files].sort(),
    commits,
    commandCount: commands.length,
  })
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

console.log(`session-changes: ${report.sessions.length} 个会话（根 ${target.id}）`)
for (const session of report.sessions) {
  const kind = session.parent === undefined ? '本会话' : '子会话'
  console.log('')
  console.log(`${kind} ${session.id} · ${session.createdAt} · ${session.commandCount} 条命令`)
  if (session.commits.length > 0) {
    for (const commit of session.commits) console.log(`  提交 ${commit}`)
  }
  if (session.files.length > 0) {
    for (const file of session.files) console.log(`  文件 ${file}`)
  }
  if (session.commits.length === 0 && session.files.length === 0) console.log('  （没有落到仓库的改动）')
}
