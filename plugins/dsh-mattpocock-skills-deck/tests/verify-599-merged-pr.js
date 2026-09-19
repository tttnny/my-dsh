#!/usr/bin/env node
/**
 * verify-599-merged-pr.js —— GitHub 房的「已合并」拉取请求（#599）。
 *
 * 钉住三件事：
 *   一、列表查询发出「已合并」这一状态（只写 OPEN/CLOSED 时已合并的整批不回来）。
 *   二、归一 single source：pullStateOf 把已合并收成契约的「已关闭」，合并时间保留。
 *   三、界面判据 single source：prStateKind 把三种形状分别判成 open/closed/merged，
 *       且拉取请求页与单票详情页都调它，不再自己判「不是 CLOSED 就当打开」。
 *
 * 运行：node tests/verify-599-merged-pr.js
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let failed = 0
function check(cond, msg) { if (cond) console.log('  PASS ' + msg); else { failed++; console.log('  FAIL ' + msg) } }
const read = (rel) => existsSync(resolve(ROOT, rel)) ? readFileSync(resolve(ROOT, rel), 'utf8') : ''

const { pullStateOf } = await import(pathToFileURL(resolve(ROOT, 'src/host/tracker/backends/github/normalize.js')).href)
const { prStateKind } = await import(pathToFileURL(resolve(ROOT, 'src/client/views/shared/stateKind.js')).href)
const { STATE } = await import(pathToFileURL(resolve(ROOT, 'src/shared/tracker/constants.js')).href)

// 一、查询条件
const queries = read('src/host/tracker/backends/github/queries.js')
check(/pullRequests\([^)]*states:\[OPEN,CLOSED,MERGED\]/.test(queries), '列表查询 pullRequests 的 states 含 MERGED')
check(/issues\([^)]*states:\[OPEN,CLOSED\]/.test(queries), '工单查询 states 仍是两态（未被误改）')

// 二、归一：已合并收成已关闭，合并时间不丢
check(pullStateOf({ state: 'MERGED' }) === STATE.CLOSED, 'GraphQL state=MERGED → 已关闭')
check(pullStateOf({ state: 'open', merged_at: '2026-01-01T00:00:00Z' }) === STATE.CLOSED, 'REST open + merged_at → 已关闭')
check(pullStateOf({ state: 'closed' }) === STATE.CLOSED, 'state=closed → 已关闭')
check(pullStateOf({ state: 'open' }) === STATE.OPEN, 'state=open → 打开')
check(pullStateOf({}) === STATE.OPEN, '缺 state 收敛为打开，不抛')

// 三、界面判据 single source
check(prStateKind({ state: 'merged' }) === 'merged', 'state=merged → merged')
check(prStateKind({ state: 'closed', mergedAt: '2026-01-01T00:00:00Z' }) === 'merged', 'closed + mergedAt → merged')
check(prStateKind({ state: 'closed' }) === 'closed', 'closed 无合并时间 → closed')
check(prStateKind({ state: 'open' }) === 'open', 'open → open')
check(prStateKind(null) === 'open', '空值收敛为 open，不抛')

const prTab = read('src/client/views/PrTab.js')
const issueDetail = read('src/client/views/IssueDetail.js')
check(/prStateKind\(/.test(prTab), '拉取请求页调用 prStateKind')
check(/prStateKind\(/.test(issueDetail), '单票详情页调用 prStateKind')
check(!/String\(x\.state \|\| ''\)\.toUpperCase\(\) !== 'CLOSED'/.test(prTab), '拉取请求页不再自己判「不是 CLOSED 就当打开」')

const zh = read('src/client/kernel/locale-flow.js')
check(/'list\.state\.merged': '已合并'/.test(zh) && /'list\.state\.merged': 'Merged'/.test(zh), '中英词条含 list.state.merged')

// 四、双产物
for (const a of ['client.js', 'package/lib/client.js']) {
  if (!existsSync(resolve(ROOT, a))) { check(false, a + ' 缺失（先跑 node scripts/build.mjs）'); continue }
  const buf = read(a)
  check(buf.indexOf('list.state.merged') >= 0, a + ' 含 list.state.merged')
  check(buf.indexOf('prStateKind') >= 0, a + ' 含 prStateKind')
}

console.log(failed ? '\n[verify-599-merged-pr] FAIL (' + failed + ' failed)' : '\n全部通过 · #599 已合并拉取请求口径生效')
process.exit(failed ? 1 : 0)
