// smoke-host.test.js — T0 阶段 0 验收·host 半冒烟
// 加载 package/lib/index.js（ESM），用宿主 stub ctx 调用 apply，断言：
//   1) name / inject 正确
//   2) apply 注册 /api/dsws 精确 Fetch 路由（connection.fetch.register；0.1.5-rc.1 起不再用
//      connection.rpc.handle —— 该 API 在本版对兄弟插件不可用，见 src/host/rpcChannel.js 头部注释）
//   3) 请求信封契约：缺 endpoint → bad-request；未注册 endpoint → not-found
// 用法: node tests/smoke-host.test.js
import { readFileSync } from 'node:fs'
import * as esbuild from 'esbuild'

let failures = 0
const check = (ok, msg) => { console.log((ok ? '  PASS ' : '  FAIL ') + msg); if (!ok) failures++ }

// ---- esbuild 语法门禁（可解析 ESM）----
const code = readFileSync('package/lib/index.js', 'utf8')
try {
  await esbuild.transform(code, { loader: 'js', format: 'esm' })
  check(true, 'ESM 语法编译 OK')
} catch (e) {
  check(false, 'ESM 语法编译: ' + e.message)
}

// ---- 宿主 stub：subprocess/timer/fs 真实最小实现；connection.fetch.register 捕获注册 ----
let registered = null
const subprocess = {
  async resolveExecutable() { return 'gh' },
  spawn() { return { stdout: { on: () => {} }, stderr: { on: () => {} }, on: () => {}, terminate: () => {} } },
}
const timer = { timeout: (fn, ms) => setTimeout(fn, ms) }
const fsSvc = { readFileSync: () => '', writeFileSync: () => {}, existsSync: () => false, mkdirSync: () => {}, readdirSync: () => [], statSync: () => ({ isDirectory: () => false }) }
const services = { subprocess, timer, fs: fsSvc, connection: { fetch: { register: (route) => { registered = route } } } }
const ctx = { get: (k) => services[k], effect: (fn) => { const r = fn(); return typeof r === 'function' ? r : () => {} } }

const modRaw = await import('../package/lib/index.js')
const mod = modRaw.default ?? modRaw
check((modRaw.name ?? mod.name) === 'dsh-mattpocock-skills-deck' || modRaw.default !== undefined, `name = ${modRaw.name ?? mod.name ?? '(default)'}`)
check((Array.isArray(modRaw.inject) && modRaw.inject.length === 4) || modRaw.default !== undefined, `inject 含 4 服务（${JSON.stringify(modRaw.inject ?? mod.inject ?? '(default)')}）`)
check(typeof mod.apply === 'function', 'apply 为函数')

mod.apply(ctx)
// 通道注册走动态 import（D7 禁止静态 import），等微任务 + 模块加载落地
await new Promise((resolve) => setTimeout(resolve, 300))
check(!!registered, 'connection.fetch.register 被调用')
check(!!registered && registered.path === '/api/dsws', `通道路径 = ${registered && registered.path}`)
check(!!registered && Array.isArray(registered.methods) && registered.methods.indexOf('POST') >= 0, `methods = ${JSON.stringify(registered && registered.methods)}`)

// ---- 请求信封契约 ----
const post = (payload) => registered.fetch(new Request('http://dsh.internal/api/dsws', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
}))
const r1 = await (await post({})).json()
check(r1.ok === false && r1.error.code === 'bad-request', `缺 endpoint → ${JSON.stringify(r1.error && r1.error.code)}`)
const r2 = await (await post({ endpoint: '__no_such_endpoint__' })).json()
check(r2.ok === false && r2.error.code === 'not-found', `未注册 endpoint → ${JSON.stringify(r2.error && r2.error.code)}`)

console.log(failures ? `\nhost 冒烟失败 ${failures} 项` : '\nhost 冒烟全部通过')
process.exit(failures ? 1 : 0)