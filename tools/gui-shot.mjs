#!/usr/bin/env node
/**
 * 把跑着的 DSH Web GUI 拉进无头浏览器，点一下、量一下、拍一张。自检管不了布局——居中、
 * 高度上限、滚动归属、遮挡、sticky 只有真浏览器能证明。
 *
 * 用法：
 *   node tools/gui-shot.mjs --wait 'button[aria-haspopup="menu"]' \
 *     --click 'button[aria-haspopup="menu"]' --eval '<读几何的 JS>' --shot tmp/ui.png
 *   node tools/gui-shot.mjs --session session-<id> --shot tmp/session.png
 *
 * 登录靠 $DSH_WEB_URL / $DSH_WEB_AUTH_URL（先访问 auth URL 拿会话 cookie，再进应用）。
 * 细节与坑见 docs/rules/plugin-ui.md「看一眼界面」。
 *
 * ── 等不到、点不到都是失败 ─────────────────────────────────────────────────────
 * `--wait` 没等到选择器、`--click` 找不到元素、页面报了错，这三件都以退出码 1
 * 结束并照样落图：图留着方便看清当时页面上是什么，但调用方不该把它当成一次
 * 成功的验证。`--eval` 抛异常同理（异常原文打出来）。
 *
 * 同一个参数只给一次：`parseArgs` 是覆盖式的，写两次 `--eval` 只有后一次生效，
 * 而前一次的表达式会静默消失。重复即报错，不猜调用方想要哪一次。
 *
 * ── 直接拍到某个会话 ─────────────────────────────────────────────────────────
 * 会话页没有 URL 路由，进会话只能点：首页是「新会话草稿」，侧栏里那个会话要先
 * 展开它所在的工作区组才点得到。`--session` 把这两步做了，顺序是先展开所有折叠
 * 的组、再点 `[data-row-key="session:<id>"]`、再等输入框挂上。会话自己的行带着
 * `aria-selected="true"` 就算到位。
 *
 * 它同时让会话状态的前后快照取自同一个会话的页面：首页草稿与各个会话各带自己的
 * 模型选择，在两者之间比较会把模型标签的变化读成一次改动。
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

/** 逐个解析 `--k v` 形式的参数；同名给两次直接报错（后者会静默吞掉前者）。 */
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const name = key.slice(2)
    if (name in out) throw new Error(`参数 --${name} 给了两次；同一参数只认一次`)
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

/**
 * 参数或环境不对时以退出码 2 结束（与 `tools/README.md` 的约定一致：0 通过、
 * 1 没做成、2 跑不起来）。抛异常的写法会打一屏栈，调用方读不出是哪一条。
 */
const refuse = (message) => {
  console.error(`gui-shot: ${message}`)
  process.exit(2)
}

let args
try {
  args = parseArgs(process.argv.slice(2))
} catch (error) {
  refuse(error.message)
}
/** 认不得的参数：静默忽略会让人以为写了就生效（`--sessoin` 这种手滑最贵）。 */
const KNOWN = new Set([
  'port', 'shot', 'size', 'wait', 'click', 'eval', 'session',
  'auth-wait', 'after-click-wait', 'allow-mutation',
])
for (const key of Object.keys(args)) {
  if (!KNOWN.has(key)) refuse(`认不得的参数 --${key}`)
}

const port = Number(args.port ?? 9223)
const profile = 'tmp/chrome-profile'
const shotPath = String(args.shot ?? 'tmp/ui.png')
const authUrl = process.env.DSH_WEB_AUTH_URL
const webUrl = process.env.DSH_WEB_URL
if (!authUrl || !webUrl) refuse('DSH_WEB_URL / DSH_WEB_AUTH_URL 没设：这两条是登录用的')

mkdirSync('tmp', { recursive: true })
rmSync(profile, { recursive: true, force: true })
mkdirSync(profile, { recursive: true })

let chromeBin
try {
  chromeBin = findChrome()
} catch (error) {
  refuse(error.message)
}

const chrome = spawn(chromeBin, [
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

/** 这一趟没做成的事。都不中止：照样落图，最后一起以退出码 1 报出来。 */
const failures = []

if (args.wait) {
  let seen = false
  for (let i = 0; i < 120 && !seen; i++) {
    seen = await evaluate(`!!document.querySelector(${JSON.stringify(String(args.wait))})`)
    if (!seen) await sleep(500)
  }
  console.log(`wait ${args.wait}: ${seen ? 'ok' : '没等到'}`)
  if (!seen) {
    failures.push(`--wait 没等到 ${args.wait}（等了 60 秒）`)
    console.log('页面文字前 300 字：', await evaluate('document.body.innerText.slice(0, 300)'))
  }
}

/**
 * 拍到某个会话：会话页没有 URL 路由，只能点进侧栏那一条。
 *
 * 两步缺一不可——折叠的工作区组里没有会话行，所以先展开；点行之后会话自己的
 * `aria-selected` 转成 true 才算切过去（点了没反应也常发生，比如点到行上的
 * 其它按钮）。首页是「新会话草稿」，不点这一下拍到的永远是欢迎页。
 */
if (args.session) {
  const id = String(args.session)
  const opened = await evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const rowSelector = '[data-row-key="session:' + ${JSON.stringify(id)} + '"]'
    // 展开与会话行都可能在好几秒后才出现：侧栏自己是渲染出来的，组里的会话是
    // 展开时去取的。所以「展开 → 找行」一起轮询，而不是先展开再干等。
    let row = null
    for (let i = 0; i < 40 && row === null; i++) {
      for (const group of document.querySelectorAll('[data-row-key^="workspace:"]')) {
        if (group.getAttribute('aria-expanded') === 'false') group.click()
      }
      await sleep(500)
      row = document.querySelector(rowSelector)
    }
    if (row === null) return { ok: false, reason: '侧栏里没有这个会话的行（id 写错了？这个工作区没在侧栏？）' }
    row.click()
    for (let i = 0; i < 40; i++) {
      const now = document.querySelector(rowSelector)
      if (now && now.getAttribute('aria-selected') === 'true'
        && document.querySelector('[data-composer-card]')) return { ok: true }
      await sleep(250)
    }
    return { ok: false, reason: '点了行，但会话没切过去（aria-selected 没变 true）' }
  })()`)
  console.log(`session ${id}: ${opened.ok ? 'ok' : opened.reason}`)
  if (!opened.ok) failures.push(`--session ${id}: ${opened.reason}`)
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

/**
 * 快照要等输入框挂上再拍。
 *
 * 拍早了 `model` 是 null，等页面渲染完它变成真正的标签，两边一比就成了「状态
 * 变了」——把这当成改动会把一次只读的截图误报成失败。等不到（比如正在看的页面
 * 本来就没有输入框）就照样拍，比较时跳过 null 那一侧：不知道改动前是什么，
 * 就不能断言是它变了。
 */
for (let i = 0; i < 40; i++) {
  if (await evaluate(`!!document.querySelector('[data-composer-card] button[aria-haspopup="menu"]')`)) break
  await sleep(250)
}

const before = await evaluate(SNAPSHOT)

if (args.click) {
  const clicked = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(String(args.click))})
    if (!el) return false
    el.click()
    return true
  })()`)
  console.log(`click ${args.click}: ${clicked ? 'ok' : '找不到'}`)
  if (!clicked) failures.push(`--click 找不到 ${args.click}`)
  await sleep(Number(args['after-click-wait'] ?? 900))
}

if (args.eval) {
  try {
    const value = await evaluate(String(args.eval))
    console.log('eval:', typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  } catch (error) {
    failures.push(`--eval 抛异常：${error.message}`)
  }
}

const after = await evaluate(SNAPSHOT)

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
mkdirSync(shotPath.replace(/\/[^/]*$/, '') || '.', { recursive: true })
writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
console.log('screenshot:', shotPath)

// 浏览器 console 在 agent 这侧看不见，页面错误只能这样收。
const errors = await evaluate('window.__errors ?? []')
console.log('page errors:', errors.length ? JSON.stringify(errors) : '(none)')
if (errors.length) failures.push(`页面报了 ${errors.length} 个错`)

// The run changed the session it was looking at: name what changed so it can be
// put back, and fail unless the caller said the mutation was the point.
const changed = Object.keys(after).filter((key) => before[key] !== null && before[key] !== after[key])
if (changed.length > 0 && !args['allow-mutation']) {
  console.log('')
  console.log('gui-shot: 这次运行改掉了会话状态（真浏览器里的一次点击就是一次真实操作）：')
  for (const key of changed) {
    console.log(`  ${key}: ${JSON.stringify(before[key])}  ->  ${JSON.stringify(after[key])}`)
  }
  console.log('照上面的「改动前」改回去；如果这次就是要改状态，加 --allow-mutation 再跑。')
  failures.push(`会话状态变了：${changed.join('、')}`)
}

if (failures.length > 0) {
  console.log('')
  console.log('gui-shot: 这次没做成：')
  for (const failure of failures) console.log(`  - ${failure}`)
  console.log('图已经落下去了，用它看清当时页面上是什么；别把这一趟当成验过的证据。')
  ws.close()
  try { spawn('pkill', ['-f', `remote-debugging-port=${port}`], { stdio: 'ignore' }) } catch {}
  finish(1)
}

ws.close()
try { spawn('pkill', ['-f', `remote-debugging-port=${port}`], { stdio: 'ignore' }) } catch {}
finish(0)
