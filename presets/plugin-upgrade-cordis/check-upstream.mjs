#!/usr/bin/env node
// Vendor check for presets/plugin-upgrade-cordis.
//
//   node check-upstream.mjs            online: did upstream change anything under the vendored paths
//                                      since the commit pinned in upstream-lock.json?
//   node check-upstream.mjs --verify   offline: does this tree still match the lock, and is it shaped
//                                      like a skill root (every dir has SKILL.md, name == dir, no stray .md)?
//   node check-upstream.mjs --write    offline: rewrite upstream-lock.json from the current tree.
//                                      Pair with --commit <sha> after copying a new upstream revision.
//
// Exit codes: 0 = up to date / verified, 1 = drift or shape problem, 2 = could not determine
// (network, rate limit, unknown commit, unreadable lock). This is repo-side tooling; it also ships
// in the package so an installed copy can be verified the same way.
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOCK_PATH = join(HERE, 'upstream-lock.json')
const DEFAULT_REPO = 'oh-my-dsh/dsh-plugin-upgrade-skill'
const DEFAULT_REF = 'main'
const DEFAULT_VENDORED = 'skills'
const SKIP = new Set(['.git', '.DS_Store'])

function parseArgs(argv) {
  const opts = { mode: 'check', json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--verify') opts.mode = 'verify'
    else if (arg === '--write') opts.mode = 'write'
    else if (arg === '--json') opts.json = true
    else if (arg === '--commit') opts.commit = argv[++i]
    else if (arg === '--repo') opts.repo = argv[++i]
    else if (arg === '--ref') opts.ref = argv[++i]
    else if (arg === '--help' || arg === '-h') opts.help = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return opts
}

function readLock() {
  try {
    return JSON.parse(readFileSync(LOCK_PATH, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    console.error(`cannot read ${LOCK_PATH}: ${error.message}`)
    process.exit(2)
  }
}

function relPosix(base, path) {
  return relative(base, path).split(sep).join('/')
}

/** Every regular file under `dir`, as directory-relative POSIX paths, sorted. */
function listFiles(dir, base = dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(path, base))
    else if (entry.isSymbolicLink()) out.push({ rel: relPosix(base, path), link: readlinkSync(path) })
    else if (entry.isFile()) out.push({ rel: relPosix(base, path), path })
  }
  return out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
}

/** sha256 over sorted `rel\0<bits>\0` records; a symlink hashes its target text. */
function hashDir(dir) {
  const hash = createHash('sha256')
  for (const file of listFiles(dir)) {
    hash.update(file.rel)
    hash.update('\0')
    hash.update(file.link === undefined ? readFileSync(file.path) : Buffer.from(`link:${file.link}`))
    hash.update('\0')
  }
  return `sha256-${hash.digest('hex')}`
}

/** sha256 over sorted `skill\0<treeHash>\n` records — the whole vendored set. */
function hashSkills(skillsDir, names) {
  const hash = createHash('sha256')
  for (const name of [...names].sort()) {
    hash.update(name)
    hash.update('\0')
    hash.update(hashDir(join(skillsDir, name)))
    hash.update('\n')
  }
  return `sha256-${hash.digest('hex')}`
}

/** Directory-bundle roots under `skillsDir`; shape violations are pushed onto `problems`. */
function skillNames(skillsDir, problems) {
  const names = []
  for (const entry of readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      names.push(entry.name)
      continue
    }
    if (entry.name.endsWith('.md')) {
      // A flat .md at this root is parsed as a skill by @deepseek-ai/dsh-skill-filesystem and warns
      // "missing YAML frontmatter" on every mount; upstream prose belongs in upstream/ instead.
      problems.push(`skills/${entry.name}: flat .md at the skills root is parsed as a skill — move it out of skills/`)
    }
  }
  for (const name of names) {
    let text
    try {
      text = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8')
    } catch {
      problems.push(`skills/${name}: missing SKILL.md`)
      continue
    }
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)?.[1] ?? ''
    const declared = /^name:\s*(.+?)\s*$/m.exec(frontmatter)?.[1]?.replace(/^['"]|['"]$/g, '')
    if (declared !== name) problems.push(`skills/${name}: frontmatter name is ${JSON.stringify(declared)}, expected ${JSON.stringify(name)}`)
    if (!/^description:\s*\S/m.test(frontmatter)) problems.push(`skills/${name}: frontmatter has no description`)
  }
  if (names.length === 0) problems.push('skills/: no skill directories found')
  return names
}

/** Local tree state: skill list, shape problems, per-skill tree hashes. */
function state(vendored) {
  const skillsDir = join(HERE, vendored)
  let stat
  try {
    stat = lstatSync(skillsDir)
  } catch {
    console.error(`cannot read ${skillsDir}`)
    process.exit(2)
  }
  if (!stat.isDirectory()) {
    console.error(`${skillsDir} is not a directory`)
    process.exit(2)
  }
  const problems = []
  const names = skillNames(skillsDir, problems)
  return { skillsDir, names, problems, trees: Object.fromEntries(names.map((n) => [n, hashDir(join(skillsDir, n))])) }
}

function verify() {
  const lock = readLock()
  if (lock === undefined) {
    console.error(`${LOCK_PATH} is missing — run: node check-upstream.mjs --write --commit <sha>`)
    return 2
  }
  const { names, problems, trees } = state(lock.vendored ?? DEFAULT_VENDORED)
  const expected = lock.skills ?? {}
  for (const name of Object.keys(expected)) if (!names.includes(name)) problems.push(`skills/${name}: in the lock but missing on disk`)
  for (const name of names) {
    if (!(name in expected)) problems.push(`skills/${name}: on disk but not in the lock (new skill — run --write)`)
    else if (trees[name] !== expected[name]) problems.push(`skills/${name}: content differs from the lock (${expected[name]} -> ${trees[name]})`)
  }
  const hash = hashSkills(join(HERE, lock.vendored ?? DEFAULT_VENDORED), names)
  if (hash !== lock.hash) problems.push(`skills/: set hash differs from the lock (${lock.hash} -> ${hash})`)
  if (problems.length > 0) {
    console.error(`FAIL ${lock.source?.repo ?? DEFAULT_REPO}@${String(lock.commit).slice(0, 8)} — ${problems.length} problem(s):`)
    for (const problem of problems) console.error(`  ${problem}`)
    console.error('If this is an intended sync, re-run with --write (and --commit <sha>).')
    return 1
  }
  console.log(`PASS ${names.length} skills match the lock (${lock.source?.repo ?? DEFAULT_REPO}@${String(lock.commit).slice(0, 8)})`)
  console.log(`     ${hash}`)
  return 0
}

function write(opts) {
  const lock = readLock() ?? {}
  const vendored = lock.vendored ?? DEFAULT_VENDORED
  const { names, problems, trees } = state(vendored)
  if (problems.length > 0) {
    console.error(`refusing to lock a malformed tree — ${problems.length} problem(s):`)
    for (const problem of problems) console.error(`  ${problem}`)
    return 1
  }
  const commit = opts.commit ?? lock.commit
  if (commit === undefined) {
    console.error('--write needs --commit <sha> when upstream-lock.json does not exist yet')
    return 2
  }
  const next = {
    version: 1,
    source: { repo: opts.repo ?? lock.source?.repo ?? DEFAULT_REPO, type: 'github' },
    ref: opts.ref ?? lock.ref ?? DEFAULT_REF,
    commit,
    vendored,
    license: lock.license ?? 'MIT',
    hash: hashSkills(join(HERE, vendored), names),
    skills: Object.fromEntries([...names].sort().map((n) => [n, trees[n]])),
  }
  writeFileSync(LOCK_PATH, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`wrote upstream-lock.json — ${names.length} skills @ ${commit}`)
  console.log(`     ${next.hash}`)
  return 0
}

async function check(opts) {
  const lock = readLock()
  if (lock === undefined) {
    console.error(`${LOCK_PATH} is missing — run: node check-upstream.mjs --write --commit <sha>`)
    return 2
  }
  const repo = opts.repo ?? lock.source?.repo ?? DEFAULT_REPO
  const vendored = lock.vendored ?? DEFAULT_VENDORED
  const ref = opts.ref ?? lock.ref ?? DEFAULT_REF
  const url = `https://api.github.com/repos/${repo}/compare/${lock.commit}...${ref}`
  let response
  try {
    response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'dsh-preset-plugin-upgrade-cordis-check-upstream',
        ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    })
  } catch (error) {
    console.error(`cannot reach the GitHub API: ${error.message}`)
    return 2
  }
  if (response.status === 403 || response.status === 429) {
    console.error(`GitHub API refused the request (${response.status}) — likely the unauthenticated rate limit; set GITHUB_TOKEN`)
    return 2
  }
  if (response.status === 404) {
    console.error(`unknown comparison ${repo}@${String(lock.commit).slice(0, 8)}...${ref} — was the pinned commit rewritten?`)
    return 2
  }
  if (!response.ok) {
    console.error(`GitHub API returned ${response.status}`)
    return 2
  }
  const data = await response.json()
  const prefix = `${vendored}/`
  const files = data.files ?? []
  const changed = files.filter((f) => f.filename === vendored || f.filename.startsWith(prefix))
  const truncated = files.length >= 300
  if (opts.json) {
    console.log(JSON.stringify({ repo, ref, status: data.status, aheadBy: data.ahead_by, totalCommits: data.total_commits, truncated, changed: changed.map((f) => `${f.status} ${f.filename}`) }, null, 2))
  } else {
    console.log(`${repo}: ${String(lock.commit).slice(0, 8)}...${ref} -> ${data.status} (ahead_by=${data.ahead_by}, ${vendored}/ changed=${changed.length})`)
    for (const file of changed) console.log(`  ${file.status} ${file.filename}`)
    if (truncated) console.log('  note: the compare response is capped at 300 files; re-run after syncing to see the rest')
  }
  if (changed.length > 0) {
    if (!opts.json) console.error(`\nupstream moved inside ${vendored}/ — sync per UPSTREAM.md, then: node check-upstream.mjs --write --commit <new sha>`)
    return 1
  }
  if (!opts.json) console.log(`no changes under ${vendored}/ — nothing to sync${data.ahead_by > 0 ? ` (${data.ahead_by} commit(s) ahead, all outside the vendored paths)` : ''}`)
  return 0
}

function usage() {
  console.log(`usage: node check-upstream.mjs [--verify | --write] [options]

  (default)        compare the pinned commit against upstream and list changes under the vendored paths
  --verify         offline: local tree matches upstream-lock.json and is shaped like a skill root
  --write          offline: rewrite upstream-lock.json from the local tree
  --commit <sha>   with --write: pin the new upstream commit
  --repo <o/n>     override the source repository
  --ref <branch>   upstream branch to compare against (default: main)
  --json           machine-readable output (check mode)

exit: 0 up to date, 1 drift or shape problem, 2 could not determine`)
}

const opts = parseArgs(process.argv.slice(2))
if (opts.help) {
  usage()
  process.exit(0)
}
process.exit(opts.mode === 'verify' ? verify() : opts.mode === 'write' ? write(opts) : await check(opts))
