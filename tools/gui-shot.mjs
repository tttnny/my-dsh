#!/usr/bin/env node
/**
 * 把跑着的 DSH Web GUI 拉进无头浏览器，点一下、量一下、拍一张。自检管不了布局——居中、
 * 高度上限、滚动归属、遮挡、sticky 只有真浏览器能证明。
 *
 * 用法：
 *   node tools/gui-shot.mjs --wait 'button[aria-haspopup="menu"]' \
 *     --click 'button[aria-haspopup="menu"]' --eval '<读几何的 JS>' --shot tmp/ui.png
 *
 * 登录靠 $DSH_WEB_URL / $DSH_WEB_AUTH_URL（先访问 auth URL 拿会话 cookie，再进应用）。
 * 细节与坑见 docs/rules/plugin-ui.md「看一眼界面」。
 *
 * ── 它会改真东西 ──────────────────────────────────────────────────────────────
 * 这浏览器连的是**正在服务的那个实例**，所以 `--click` 与 `--eval` 里的一次点击
 * 就是一次真实操作：点模型会换掉这个会话正在用的模型、点收藏会写进 localStorage。
 * 验证完忘了改回去，下一个 agent 看到的就是被改过的状态（本仓库发生过：一次界面
 * 验证把会话切到一个不可用的模型上，连带把后续跑起来的子会话弄断）。
 *
 * 因此：**进入任何交互之前先记一份会话状态，跑完再记一份，两边不同就报警并以
 * 退出码 1 结束**，除非显式 `--allow-mutation`（确定这次就是要改状态）。报警会
 * 把「改动前 → 改动后」逐条打出来，照它改回去即可。
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 逐个解析 `--k v` 形式的参数。 */
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const name = key.slice(2)
    const next = argv[i + 1]
    out[name] = next === undefined || next.startsWith('--') ? true : (i++, next)
  }
  return out
}

/** playwright 缓存里的 Chrome for Testing，取版本号最大的那个；没有就退回系统 Chrome。 */
function findChrome() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) {
    const versions = readdirSync(cache)
      .filter((n) => /^chromium-\d+$/.test(n))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    for (const v of versions) {
      const bin = join(cache, v, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
      if (existsSync(bin)) return bin
    }
  }
  for (const bin of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']) {
    if (existsSync(bin)) return bin
  }
  throw new Error('找不到 Chrome：装 playwright 的 chromium，或装系统 Chrome')
}

/** 最小 CDP 客户端：flatten 会话 + 事件等待。 */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    this.events = []
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id === undefined) { this.events.push(msg); return }
      const entry = this.pending.get(msg.id)
      if (!entry) return
      this.pending.delete(msg.id)
      msg.error ? entry.reject(new Error(JSON.stringify(msg.error))) : entry.resolve(msg.result)
    })
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq
    this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
}

const args = parseArgs(process.argv.slice(2))
const port = Number(args.port ?? 9223)
const profile = 'tmp/chrome-profile'
const shotPath = String(args.shot ?? 'tmp/ui.png')
const authUrl = process.env.DSH_WEB_AUTH_URL
const webUrl = process.env.DSH_WEB_URL
if (!authUrl || !webUrl) throw new Error('DSH_WEB_URL / DSH_WEB_AUTH_URL 没设：这两条是登录用的')

mkdirSync('tmp', { recursive: true })
rmSync(profile, { recursive: true, force: true })
mkdirSync(profile, { recursive: true })

const chrome = spawn(findChrome(), [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  `--window-size=${args.size ?? '1280,900'}`,
  'about:blank',
], { stdio: 'ignore' })

const finish = (code) => {
  try { chrome.kill() } catch {}
  // profile 里带着登录 cookie，跑完就清（也省下每次 20 多 MB 的垃圾）。Chrome 收尾
  // 会短暂占着里面的文件，删不掉就同步等 50ms 再来，最多一秒。
  for (let i = 0; i < 20; i++) {
    try {
      rmSync(profile, { recursive: true, force: true })
      break
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  process.exit(code)
}

let wsUrl
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`)
    if (res.ok) wsUrl = (await res.json()).webSocketDebuggerUrl
  } catch {}
  if (!wsUrl) await sleep(250)
}
if (!wsUrl) { console.error('chrome 没起远程调试端口'); finish(1) }

const ws = new WebSocket(wsUrl)
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve)
  ws.addEventListener('error', reject)
})
const cdp = new Cdp(ws)
const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
await cdp.send('Page.enable', {}, sessionId)
await cdp.send('Runtime.enable', {}, sessionId)

const evaluate = async (expression) => {
  const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
  if (exceptionDetails) throw new Error(`${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ''}`)
  return result.value
}

// 登录：auth URL 答 303 并种 cookie，然后才是应用本身。
await cdp.send('Page.navigate', { url: authUrl }, sessionId)
await sleep(Number(args['auth-wait'] ?? 1200))
await cdp.send('Page.navigate', { url: webUrl }, sessionId)
await evaluate(`window.__errors = []; window.addEventListener('error', e => window.__errors.push(String(e.message)))`)

if (args.wait) {
  let seen = false
  for (let i = 0; i < 120 && !seen; i++) {
    seen = await evaluate(`!!document.querySelector(${JSON.stringify(String(args.wait))})`)
    if (!seen) await sleep(500)
  }
  console.log(`wait ${args.wait}: ${seen ? 'ok' : '没等到'}`)
  if (!seen) console.log('页面文字前 300 字：', await evaluate('document.body.innerText.slice(0, 300)'))
}

/**
 * The session state a click can change, read straight off the page.
 *
 * The composer's model trigger carries the whole selection in its accessible
 * name, and the two storage keys are the plugin state a click can write. Reading
 * only these keeps the snapshot cheap enough to take before and after every run.
 */
const SNAPSHOT = `(() => {
  const trigger = document.querySelector('[data-composer-card] button[aria-haspopup="menu"]')
  const read = (key) => { try { return globalThis.localStorage.getItem(key) } catch { return null } }
  return {
    model: trigger ? trigger.getAttribute('aria-label') : null,
    favorites: read('dsh-model-submenu.favorites'),
    efforts: read('dsh-model-submenu.efforts'),
  }
})()`

const before = await evaluate(SNAPSHOT)

if (args.click) {
  const clicked = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(String(args.click))})
    if (!el) return false
    el.click()
    return true
  })()`)
  console.log(`click ${args.click}: ${clicked ? 'ok' : '找不到'}`)
  await sleep(Number(args['after-click-wait'] ?? 900))
}

if (args.eval) {
  const value = await evaluate(String(args.eval))
  console.log('eval:', typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

const after = await evaluate(SNAPSHOT)

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
mkdirSync(shotPath.replace(/\/[^/]*$/, '') || '.', { recursive: true })
writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
console.log('screenshot:', shotPath)

// 浏览器 console 在 agent 这侧看不见，页面错误只能这样收。
const errors = await evaluate('window.__errors ?? []')
console.log('page errors:', errors.length ? JSON.stringify(errors) : '(none)')

// The run changed the session it was looking at: name what changed so it can be
// put back, and fail unless the caller said the mutation was the point.
const changed = Object.keys(after).filter((key) => before[key] !== after[key])
if (changed.length > 0 && !args['allow-mutation']) {
  console.log('')
  console.log('gui-shot: 这次运行改掉了会话状态（真浏览器里的一次点击就是一次真实操作）：')
  for (const key of changed) {
    console.log(`  ${key}: ${JSON.stringify(before[key])}  ->  ${JSON.stringify(after[key])}`)
  }
  console.log('照上面的「改动前」改回去；如果这次就是要改状态，加 --allow-mutation 再跑。')
  ws.close()
  try { spawn('pkill', ['-f', `remote-debugging-port=${port}`], { stdio: 'ignore' }) } catch {}
  finish(1)
}

ws.close()
try { spawn('pkill', ['-f', `remote-debugging-port=${port}`], { stdio: 'ignore' }) } catch {}
finish(0)
