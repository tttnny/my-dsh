// tests/verify-session-ops-016.js — DSH 0.1.6 会话动作单点门禁（打开 / 改名 / 主视图当前会话）
// 用法: node tests/verify-session-ops-016.js
//
// 背景（0.1.6 契约迁移）：客户端会话控制器在这一版移除了 sessions.open，且 scope(id) 只读已租用
//   作用域、不再为会话物化（改名必须显式租用 sessions.using）；sessions.list 快照不再携带 current，
//   主视图持有者改由行上的 retainedBy.mainView 标识。本门禁把三处单点实现从真源切出、在沙箱用
//   0.1.6 形状的假服务执行，钉死「只走新契约」，并静态拦截旧调用回流。
//
// 验收：
//   a) openSessionById：只经 uiWorkspace.openSession 打开；函数体内不出现 sessions.open
//   b) renameSessionById：只经 sessions.using 租用作用域后 rename；不出现 scope(/sessionOf(
//   c) currentSessionIdOf：取 retainedBy.mainView > 0 的行；无持有者返回 undefined；按快照对象缓存
//   d) 真源与 pkg 产物均无 sessions.open( 调用、无快照 x.current 读取
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const API_IO = 'src/client/kernel/api-io.js'
const STORE_DERIVED = 'src/client/kernel/store-derived.js'
const PRODUCTS = ['client.js', 'package/lib/client.js']

let failed = false
let total = 0
function check(ok, msg) {
  total++
  console.log((ok ? '  PASS ' : '  FAIL ') + msg)
  if (!ok) failed = true
}

/** 按名字切出一段 `[export ]const <name> = function (...) {...}`（括号配平，dev/pkg 双形态通用） */
function sliceFnDecl(src, name) {
  const m = new RegExp('(?:export\\s+)?const\\s+' + name + '\\s*=\\s*function').exec(src)
  if (!m) throw new Error('切片锚点缺失: ' + name)
  const start = m.index
  const open = src.indexOf('{', m.index + m[0].length)
  if (open < 0) throw new Error('切片失败: ' + name)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1).replace(/^export\s+/, '') }
  }
  throw new Error('切片括号不平衡: ' + name)
}

console.log('== DSH 0.1.6 会话动作单点门禁 ==')

const io = fs.readFileSync(path.join(ROOT, API_IO), 'utf8')
const derived = fs.readFileSync(path.join(ROOT, STORE_DERIVED), 'utf8')

// ---- a) openSessionById ----
const openFnSrc = sliceFnDecl(io, 'openSessionById')
check(openFnSrc.indexOf('sessions.open') < 0, 'openSessionById 不含 sessions.open（0.1.6 已移除）')
{
  const calls = []
  const sandbox = new Function('ctx', openFnSrc + '; return openSessionById')
  const open = sandbox({ get: (k) => (k === 'uiWorkspace' ? { openSession: (sid) => calls.push(sid) } : undefined) })
  check(open('sid-A') === true, 'openSessionById 命中 uiWorkspace.openSession 返回 true')
  check(calls.length === 1 && calls[0] === 'sid-A', 'openSessionById 以原 sid 调用 openSession')
  check(open('') === false, 'openSessionById 空 sid 直接拒绝')
  const missing = sandbox({ get: () => undefined })
  check(missing('sid-B') === false, 'uiWorkspace 缺席时不抛错、返回 false')
}

// ---- b) renameSessionById ----
const renameFnSrc = sliceFnDecl(io, 'renameSessionById')
check(renameFnSrc.indexOf('sessions.scope(') < 0 && renameFnSrc.indexOf('sessionOf(') < 0,
  'renameSessionById 不依赖 scope()/sessionOf()（0.1.6 不再物化作用域）')
;(async () => {
  const seen = []
  const sessions = {
    using: (sid, opts, op) => {
      seen.push({ sid, source: opts && opts.source })
      return Promise.resolve(op({ binding: { session: { rename: (title) => Promise.resolve({ ok: true, value: { title } }) } } }))
    },
  }
  const sandbox = new Function(renameFnSrc + '; return renameSessionById')
  const rename = sandbox()
  const r = await rename(sessions, 'sid-R', '[#7] 标题')
  check(seen.length === 1 && seen[0].sid === 'sid-R' && typeof seen[0].source === 'string' && seen[0].source.length > 0,
    'renameSessionById 经 sessions.using 显式租用（带 source）')
  check(r && r.ok === true && r.value.title === '[#7] 标题', 'renameSessionById 透传 binding.session.rename 结果')
  const refused = await rename({}, 'sid-R', 'x')
  check(refused === null, 'sessions.using 缺席时补 null（不抛）')

  // ---- c) currentSessionIdOf ----
  const cacheDecl = /const currentSessionIdCache = new WeakMap\(\)/.exec(derived)
  check(cacheDecl !== null, 'currentSessionIdOf 自带按快照对象的 WeakMap 缓存')
  const curFnSrc = cacheDecl[0] + ';\n' + sliceFnDecl(derived, 'currentSessionIdOf')
  check(curFnSrc.indexOf('retainedBy') >= 0 && curFnSrc.indexOf('mainView') >= 0,
    'currentSessionIdOf 以 retainedBy.mainView 判据')
  const cur = new Function(curFnSrc + '; return currentSessionIdOf')()
  const snap = { byId: { a: { id: 'a' }, b: { id: 'b', retainedBy: { mainView: 1 } } } }
  check(cur(snap) === 'b', 'currentSessionIdOf 取 mainView>0 的行')
  check(cur({ byId: { a: { id: 'a', retainedBy: {} } } }) === undefined, '无持有者返回 undefined')
  check(cur({ byId: { a: { id: 'a', retainedBy: { mainView: 1 } } } }) === 'a'
    && cur({ byId: { a: { id: 'a', retainedBy: { mainView: 1 } } } }) === 'a', 'currentSessionIdOf 结果按快照对象稳定')
  check(cur(null) === undefined, 'currentSessionIdOf 空快照返回 undefined')

  // ---- d) 旧调用不得回流（真源 + 双产物）----
  const sources = [[API_IO + '+' + STORE_DERIVED, io + '\n' + derived]]
  for (const p of PRODUCTS) sources.push([p, fs.readFileSync(path.join(ROOT, p), 'utf8')])
  for (const [label, src] of sources) {
    check(!/sessions\s*\.\s*open\s*\(/.test(src), label + ' 无 sessions.open( 调用')
    check(!/\(\s*x\s*\)\s*=>\s*x\.current\b/.test(src) && !/function\s*\(\s*x\s*\)\s*\{\s*return x\.current\s*\}/.test(src),
      label + ' 无快照 x.current 读取')
  }

  if (failed) { console.log('\nFAIL ' + total + ' checks, some failed'); process.exit(1) }
  console.log('\nPASS all ' + total + ' checks')
})()
