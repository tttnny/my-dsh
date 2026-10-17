/**
 * 渲染自检：用真 react 把输入框旁的模型菜单画进 jsdom，锁住这次改动的四个承诺。
 *
 *   1. 小菜单只列当前供应商的模型，且收藏的排前面并带星标；
 *   2. 点模型立即提交，选中的还是那个模型就不提交；
 *   3. 改思考等级只改选中态，关闭菜单那一刻才提交；
 *   4. 「更多模型…」在思考等级写入成功之后才换成弹窗，写入失败就留在小菜单。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 是替身：真组件是浏览器里的 ESM、带
 * .css 导入，Node 里跑不起来。替身只做「把 children 与 aria 原样渲染出来」，
 * 所以这里验证的是本插件自己的视图结构与事件接线；真组件的外观与浮层定位
 * 要在浏览器里看（`tools/gui-shot.mjs`）。
 *
 * 运行：node scripts/test-render.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:3080/',
  pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
globalThis.Node = dom.window.Node
globalThis.Event = dom.window.Event
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.KeyboardEvent = dom.window.KeyboardEvent
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.localStorage = dom.window.localStorage
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.HTMLElement.prototype.scrollIntoView = () => {}

const { createElement, act } = await import('react')
const { createRoot } = await import('react-dom/client')

/** ui-primitives 替身：只还原本测试关心的渲染结果。 */
const primitives = new Proxy(
  {
    MenuSurface: ({ children, ...rest }) => createElement('div', rest, children),
    Modal: ({ open, onClose, closeLabel, children }) => open
      ? createElement('div', { role: 'dialog' },
        createElement('button', { type: 'button', 'aria-label': closeLabel, onClick: onClose }, '×'),
        children)
      : null,
    Input: ({ icon, className, ...rest }) => createElement('input', { ...rest, className }),
    ShortcutKeys: ({ keys }) => createElement('span', null, keys.join('')),
    Toast: ({ text }) => createElement('div', { role: 'status' }, text),
    IconCheckOutlineRegular: () => createElement('span', { className: 'check' }),
    IconChevronDownOutlineRegular: () => createElement('span', null),
    IconFlatListOutlineRegular: () => createElement('span', null),
    IconWarningOutlineRegular: () => createElement('span', null),
    IconSearchOutlineRegular: () => createElement('span', null),
    rankByName: (items, query) => {
      const needle = query.toLowerCase()
      return items.filter((item) => item.name.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle))
    },
  },
  { get: (target, key) => (key in target ? target[key] : () => null) },
)

let exported
globalThis.window.__ModuleLoader__ = {
  load: ({ factory }) => {
    exported = factory((spec) => {
      if (spec === 'react') return require('react')
      if (spec === 'react/jsx-runtime') return require('react/jsx-runtime')
      if (spec === 'react-dom') return require('react-dom')
      if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`module table miss: ${spec}`)
    })
  },
}
await import(`${pathToFileURL(join(root, 'lib', 'client.js')).href}?render=${String(Date.now())}`)

/** 座位注册项：本测试直接拿它的组件来画。 */
const registrations = []
const ctx = {
  effect: (fn) => { fn(); return () => {} },
  get: () => undefined,
  inject: (_names, fn) => { fn(ctx); return () => {} },
  slots: {
    inject: (_key, register) => { register(); return () => {} },
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
  configForms: {
    describe: () => ({
      getSnapshot: () => ({ status: 'ready', view: { namespaces: [], writable: true, hasDocument: false }, error: null }),
      subscribe: () => () => {},
      ensure: async () => {},
    }),
  },
  remote: {
    llm: { listConfigurableProviders: async () => ({ ok: true, value: [] }) },
  },
  locale: { register: () => () => {}, bind: () => (key) => key },
  modelDirectories: { directoryFor: () => null },
  sessions: { subagentAddress: () => undefined },
}
exported.apply(ctx)
const seat = registrations.find((entry) => entry.options.name === 'conversation.input.model')
assert.ok(seat !== undefined, '模型座位没有注册')

// ── 共享目录：两个供应商，magpie 三个模型，a6api 一个 ─────────────────────────

const reasoning = {
  efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }],
  defaultEffort: 'high',
}

function snapshot(overrides = {}) {
  return {
    current: { provider: 'magpie', model: 'a', reasoningEffort: 'high' },
    routable: true,
    groups: [
      {
        id: 'magpie',
        name: 'Magpie',
        models: [
          { id: 'a', name: 'Model A', reasoning },
          { id: 'b', name: 'Model B', reasoning },
          { id: 'c', name: 'Model C' },
        ],
      },
      { id: 'a6api', name: 'A6api', models: [{ id: 'kimi', name: 'Kimi K3', reasoning }] },
    ],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
    ...overrides,
  }
}

let state = snapshot()
const listeners = new Set()
const store = {
  getSnapshot: () => state,
  subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
}
const setState = (next) => {
  state = next
  act(() => { for (const listener of [...listeners]) listener() })
}

/** One stable lookup: a settings document with no answer for any model. */
const unknownFacts = () => ({ contextWindow: undefined, images: 'unknown' })

const loads = []
const selections = []
const outcomes = []
const seatProps = {
  available: true,
  directory: store,
  load: () => { loads.push('load') },
  select: async (selection) => {
    selections.push(selection)
    const next = outcomes.length === 0 ? { ok: true, value: undefined } : outcomes.shift()
    if (next.ok) {
      setState(snapshot({ current: { provider: selection.provider, model: selection.model, ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort } } }))
    }
    return next
  },
  factsSource: {
    // The lookup identity must be stable: the seat reads it through
    // useSyncExternalStore, which re-renders forever on a fresh reference.
    getSnapshot: () => unknownFacts,
    subscribe: () => () => {},
  },
  t: (key, values) => {
    const table = {
      'menu.effort': '思考',
      'menu.more': '更多模型…',
      'menu.hint': '提示文字',
      'menu.aria': '模型与思考等级',
      'effort.providerDefault': '默认',
      'picker.title': '切换模型',
      'picker.all': '全部',
      'picker.search': '搜索模型或提供商…',
      'picker.close': '关闭',
      'status.loading': '正在加载模型…',
      'status.empty': '没有可用的模型。',
      'status.failed': '模型列表加载失败：{message}',
      'status.providerFailed': '{name} 加载失败：{message}',
      'trigger.loading': '正在加载模型…',
      'trigger.fallback': '选择模型',
      'trigger.aria': '选择模型，当前 {model}',
      'trigger.ariaEffort': '选择模型，当前 {model}，思考等级 {effort}',
      'action.reload': '重新加载',
      'error.action': '模型操作失败：{message}',
      'error.sessionInUse': '会话被占用',
      'picker.favorite': '收藏 {model}',
      'picker.unfavorite': '取消收藏 {model}',
      'picker.searchEmpty': '没有匹配的模型。',
      'picker.hintNavigate': '导航',
      'picker.hintSelect': '选择',
      'picker.hintClose': '关闭',
      'meta.effort': '思考',
      'meta.images': '图片输入',
    }
    const text = table[key] ?? key
    return values === undefined
      ? text
      : text.replace(/\{(\w+)\}/g, (_all, name) => String(values[name] ?? ''))
  },
  locked: false,
}

let container
let viewRoot

function mount() {
  container = document.createElement('div')
  document.body.append(container)
  viewRoot = createRoot(container)
  act(() => { viewRoot.render(createElement(seat.component, seatProps)) })
}

function unmount() {
  act(() => { viewRoot.unmount() })
  container.remove()
}

const click = (element) => {
  act(() => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })) })
}
const flush = async () => { await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) }) }
const menu = () => document.querySelector('[role="group"]')
const trigger = () => container.querySelector('button[aria-haspopup="menu"]')
const rows = () => menu() === null ? [] : [...menu().querySelectorAll('[role="menuitemradio"]')]
const moreRow = () => menu() === null ? undefined : [...menu().querySelectorAll('button')].find((button) => button.textContent === '更多模型…')
const segments = () => menu() === null ? [] : [...menu().querySelectorAll('[role="radio"]')]
const segment = (label) => segments().find((button) => button.textContent === label)

/** 确保小菜单是开着的那一次点击：已经开着就不再点一次把它关上。 */
const openMenu = () => {
  if (menu() === null) click(trigger())
}

/** 浏览器语义：按下与松手都落在这个元素之外，才算点外面。 */
const clickOutside = () => {
  act(() => { document.body.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })) })
}

let passed = 0
let total = 0
async function test(name, fn) {
  total += 1
  try {
    await fn()
    passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}: ${error.message}`)
    throw error
  }
}

globalThis.localStorage.clear()

await test('触发器写着当前模型与思考等级', () => {
  mount()
  assert.match(trigger().textContent, /Model A/)
  assert.match(trigger().textContent, /High/)
})

await test('小菜单只列当前供应商的模型', () => {
  click(trigger())
  const names = rows().map((row) => row.getAttribute('title'))
  assert.deepEqual(names, ['Model A', 'Model B', 'Model C'])
  assert.ok(!names.includes('Kimi K3'))
})

await test('小菜单顶上写着供应商名', () => {
  assert.ok(menu().textContent.includes('Magpie'))
})

await test('思考等级按模型配置的档位画成分段', () => {
  assert.deepEqual(segments().map((button) => button.textContent), ['Low', 'High', 'Max'])
  assert.equal(segment('High').getAttribute('aria-checked'), 'true')
})

await test('当前模型带勾选', () => {
  assert.equal(rows()[0].getAttribute('aria-checked'), 'true')
  assert.equal(rows()[1].getAttribute('aria-checked'), 'false')
})

await test('点模型立即提交并关菜单', async () => {
  selections.length = 0
  click(rows()[1])
  await flush()
  assert.deepEqual(selections, [{ provider: 'magpie', model: 'b' }])
  assert.equal(menu(), null)
})

await test('点已经选中的模型不提交', async () => {
  openMenu()
  selections.length = 0
  click(rows()[1])
  await flush()
  assert.deepEqual(selections, [])
  assert.equal(menu(), null)
})

await test('改思考等级只改选中态，不立刻提交', async () => {
  openMenu()
  selections.length = 0
  click(segment('Max'))
  await flush()
  assert.equal(segment('Max').getAttribute('aria-checked'), 'true')
  assert.equal(segment('High').getAttribute('aria-checked'), 'false')
  assert.deepEqual(selections, [])
})

await test('关闭菜单那一刻才写入思考等级', async () => {
  selections.length = 0
  clickOutside()
  await flush()
  assert.deepEqual(selections, [{ provider: 'magpie', model: 'b', reasoningEffort: 'max' }])
  assert.equal(menu(), null)
})

await test('没改过思考等级时关闭不提交', async () => {
  openMenu()
  await flush()
  selections.length = 0
  clickOutside()
  await flush()
  assert.deepEqual(selections, [])
})

await test('收藏过的模型排在小菜单前面并带星标', async () => {
  globalThis.localStorage.setItem('dsh-model-submenu.favorites', JSON.stringify([{ provider: 'magpie', model: 'c' }]))
  unmount()
  mount()
  openMenu()
  assert.deepEqual(rows().map((row) => row.getAttribute('title')), ['Model C', 'Model A', 'Model B'])
  assert.ok(menu().querySelectorAll('svg').length >= 1)
})

await test('小菜单里的星标不是独立控件', () => {
  clickOutside()
  const stars = [...menu()?.querySelectorAll('button[aria-pressed]') ?? []]
  assert.deepEqual(stars, [])
})

await test('小菜单里点实心星等于点这一行', async () => {
  globalThis.localStorage.setItem('dsh-model-submenu.favorites', JSON.stringify([{ provider: 'magpie', model: 'b' }]))
  setState(snapshot())
  unmount()
  mount()
  openMenu()
  selections.length = 0
  const mark = [...menu().querySelectorAll('button')].find((button) => (button.className || '').includes('starStatic'))
  assert.notEqual(mark, undefined, `收藏的模型应当带实心星；当前行：${[...menu().querySelectorAll('button')].map((b) => b.className).join(',')}`)
  click(mark)
  await flush()
  assert.equal(selections.length, 1)
  assert.equal(menu(), null)
})

await test('目录里消失的收藏不影响列表', async () => {
  globalThis.localStorage.setItem('dsh-model-submenu.favorites', JSON.stringify([{ provider: 'gone', model: 'x' }]))
  unmount()
  mount()
  openMenu()
  assert.deepEqual(rows().map((row) => row.getAttribute('title')), ['Model A', 'Model B', 'Model C'])
})

await test('写入失败时留在小菜单并弹出提示', async () => {
  globalThis.localStorage.clear()
  outcomes.push({ ok: false, error: { code: 'session/writer-held', message: 'held' } })
  openMenu()
  const before = selections.length
  click(segment('Low'))
  click(moreRow())
  await flush()
  assert.equal(selections.length, before + 1)
  assert.equal(document.querySelector('[role="status"]')?.textContent, '会话被占用')
  assert.equal(document.querySelector('[role="dialog"]'), null)
  assert.notEqual(menu(), null)
})

await test('加载中在小菜单里写一行文字', async () => {
  clickOutside()
  await flush()
  setState(snapshot({ status: 'loading' }))
  openMenu()
  assert.ok(menu().textContent.includes('正在加载模型…'), menu()?.textContent)
  clickOutside()
  await flush()
})

await test('当前供应商加载失败时写一行并带重新加载', async () => {
  setState(snapshot({
    status: 'ready',
    failures: [{ id: 'magpie', name: 'Magpie', message: 'boom' }],
  }))
  openMenu()
  assert.ok(menu().textContent.includes('Magpie 加载失败：boom'), menu()?.textContent ?? '菜单没打开')
  const reloadsBefore = loads.length
  const retry = [...menu().querySelectorAll('button')].find((button) => button.textContent === '重新加载')
  click(retry)
  assert.ok(loads.length > reloadsBefore)
  clickOutside()
  await flush()
})

await test('弹窗顶部写部分供应商加载失败', async () => {
  setState(snapshot({
    status: 'ready',
    failures: [{ id: 'a6api', name: 'A6api', message: 'timeout' }],
  }))
  openMenu()
  click(moreRow())
  await flush()
  const dialog = document.querySelector('[role="dialog"]')
  assert.ok(dialog.textContent.includes('A6api 加载失败：timeout'))
  click(dialog.querySelector('button[aria-label="关闭"]'))
  await flush()
})

await test('点模型被拒时小菜单重新打开', async () => {
  setState(snapshot())
  outcomes.push({ ok: false, error: { code: 'session/writer-held', message: 'held' } })
  openMenu()
  assert.notEqual(menu(), null, '小菜单应当已打开')
  selections.length = 0
  const target = rows().find((row) => row.getAttribute('title') === 'Model B')
  click(target)
  await flush()
  assert.equal(selections.length, 1)
  assert.notEqual(menu(), null)
  assert.equal(document.querySelector('[role="status"]')?.textContent, '会话被占用')
  clickOutside()
  await flush()
})

await test('思考等级写入成功后换成弹窗', async () => {
  openMenu()
  await flush()
  click(segment('Max'))
  click(moreRow())
  await flush()
  assert.notEqual(document.querySelector('[role="dialog"]'), null)
  assert.equal(menu(), null)
})

await test('弹窗顶部标签页用方向键换页', async () => {
  const dialog = document.querySelector('[role="dialog"]')
  const tabs = [...dialog.querySelectorAll('[role="tab"]')]
  const all = tabs.find((tabItem) => tabItem.textContent === '全部')
  assert.equal(all.getAttribute('aria-selected'), 'true')
  act(() => { all.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
  await flush()
  const afterRight = [...document.querySelectorAll('[role="tab"]')].find((tabItem) => tabItem.getAttribute('aria-selected') === 'true')
  assert.equal(afterRight.textContent, 'Magpie')
  act(() => { afterRight.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })) })
  await flush()
  const afterLeft = [...document.querySelectorAll('[role="tab"]')].find((tabItem) => tabItem.getAttribute('aria-selected') === 'true')
  assert.equal(afterLeft.textContent, '全部')
})

await test('弹窗列表的角色是菜单，标签页都能被 Tab 走到', () => {
  const dialog = document.querySelector('[role="dialog"]')
  assert.notEqual(dialog.querySelector('[role="menu"]'), null)
  const tabStops = [...dialog.querySelectorAll('[role="tab"]')].filter((tabItem) => tabItem.tabIndex === 0)
  assert.equal(tabStops.length, dialog.querySelectorAll('[role="tab"]').length)
})

await test('搜索不会把未收藏的模型顶到收藏之前', async () => {
  clickOutside()
  await flush()
  setState(snapshot())
  globalThis.localStorage.setItem('dsh-model-submenu.favorites', JSON.stringify([{ provider: 'magpie', model: 'c' }]))
  unmount()
  mount()
  openMenu()
  click(moreRow())
  await flush()
  const search = document.querySelector('[role="dialog"] input[role="searchbox"]')
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
    setter.call(search, 'Model')
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  await flush()
  const names = [...document.querySelectorAll('[role="dialog"] [role="menuitemradio"]')].map((row) => row.getAttribute('title'))
  assert.equal(names[0], 'Model C', `搜索后第一行应是收藏的 Model C，实际：${names.join(',')}`)
})

await test('弹窗列出全部供应商的模型', async () => {
  const search = document.querySelector('[role="dialog"] input[role="searchbox"]')
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
    setter.call(search, '')
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  await flush()
  const names = [...document.querySelectorAll('[role="dialog"] [role="menuitemradio"]')].map((row) => row.getAttribute('title'))
  assert.ok(names.includes('Model A'))
  assert.ok(names.includes('Kimi K3'))
})

await test('弹窗里点模型立即提交并关闭', async () => {
  await flush()
  selections.length = 0
  const target = [...document.querySelectorAll('[role="dialog"] [role="menuitemradio"]')]
    .find((row) => row.getAttribute('title') === 'Kimi K3')
  click(target)
  await flush()
  assert.deepEqual(selections, [{ provider: 'a6api', model: 'kimi' }])
  assert.equal(document.querySelector('[role="dialog"]'), null)
})

await test('弹窗里的星标只切换收藏，不选中也不关弹窗', async () => {
  openMenu()
  click(moreRow())
  await flush()
  const before = selections.length
  const countBefore = (JSON.parse(globalThis.localStorage.getItem('dsh-model-submenu.favorites')) ?? []).length
  const star = document.querySelector('[role="dialog"] button[aria-pressed]')
  assert.notEqual(star, null)
  const pressedBefore = star.getAttribute('aria-pressed')
  click(star)
  await flush()
  assert.equal(selections.length, before)
  assert.notEqual(document.querySelector('[role="dialog"]'), null)
  const countAfter = JSON.parse(globalThis.localStorage.getItem('dsh-model-submenu.favorites')).length
  assert.equal(countAfter, pressedBefore === 'true' ? countBefore - 1 : countBefore + 1)
})

await test('弹窗提交被拒时弹窗保持打开', async () => {
  outcomes.push({ ok: false, error: { code: 'session/writer-held', message: 'held' } })
  const target = [...document.querySelectorAll('[role="dialog"] [role="menuitemradio"]')]
    .find((row) => row.getAttribute('title') === 'Model B')
  click(target)
  await flush()
  assert.notEqual(document.querySelector('[role="dialog"]'), null)
  assert.equal(document.querySelector('[role="status"]')?.textContent, '会话被占用')
})

unmount()
console.log(passed === total ? `\nrender: PASS (${passed}/${total})` : `\nrender: FAIL (${total - passed} of ${total})`)
process.exit(passed === total ? 0 : 1)
