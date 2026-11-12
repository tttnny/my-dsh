/**
 * 渲染自检：用真 react 把「菜单桥」与「常驻浮层里的弹窗」画进 jsdom。
 *
 * 锁住这几件事：
 *
 *   1. 宿主根菜单的第一格被拦下：先关菜单、再把开合请求交给常驻的 store，
 *      宿主自己那格的下钻不执行；第二格改成滑块，点标签只把焦点交给滑块；
 *   2. 弹窗只在 store 指向本会话时出现，会话不可选时整块不渲染；
 *   3. 弹窗列出全部供应商的模型，收藏的排前面，星标是独立控件、点它不换模型；
 *   4. 点模型立即提交并关闭；点当前这个模型不提交；被拒时留在弹窗并弹提示；
 *   5. 选模型时恢复该模型上次用的思考等级。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 是替身：真组件是浏览器里的 ESM、带
 * .css 导入，Node 里跑不起来。替身只做「把 children 与 aria 原样渲染出来」，
 * 所以这里验证的是本插件自己的视图结构与事件接线；真组件的外观与浮层定位
 * 要在浏览器里看（`tools/gui-shot.mjs`）。
 *
 * 运行：node scripts/test-render.mjs
 */
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { installDom, loadClientBundle, primitivesStub } from '../../../tools/lib/dom-harness.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const dom = installDom(JSDOM, { storage: true, raf: true })
const { createElement, act } = await import('react')
const { createRoot } = await import('react-dom/client')

/** ui-primitives 替身：只还原本测试关心的渲染结果。 */
const primitives = primitivesStub({
  Modal: ({ open, onClose, closeLabel, children }) => open
    ? createElement('div', { role: 'dialog' },
      createElement('button', { type: 'button', 'aria-label': closeLabel, onClick: onClose }, '×'),
      children)
    : null,
  Input: ({ icon, className, ...rest }) => createElement('input', { ...rest, className }),
  ShortcutKeys: ({ keys }) => createElement('span', null, keys.join('')),
  Toast: ({ text }) => createElement('div', { role: 'status' }, text),
  IconCheckOutlineRegular: () => createElement('span', { className: 'check' }),
  IconChevronRightOutlineRegular: () => createElement('span', null),
  IconFlatListOutlineRegular: () => createElement('span', null),
  IconWarningOutlineRegular: () => createElement('span', null),
  IconSearchOutlineRegular: () => createElement('span', null),
  Tag: ({ tone, className, children }) => createElement('span', { 'data-tone': tone, className }, children),
  isMobileDevice: () => false,
  rankByName: (items, query) => {
    const needle = query.toLowerCase()
    return items.filter((item) => item.name.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle))
  },
})

const exported = await loadClientBundle({ root, primitives })

/** 注册项：本测试直接拿两个组件来画。 */
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
const bridgeEntry = registrations.find((entry) => entry.options.name === 'conversation.input.model.options')
const hostEntry = registrations.find((entry) => entry.options.name === 'conversation.input.overlay')
assert.ok(bridgeEntry !== undefined, '菜单桥没有注册')
assert.ok(hostEntry !== undefined, '浮层弹窗没有注册')

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
const dismissals = []
const failures = []
const picker = exported.createPickerStore()
/** Open and close through act, so React flushes the store change inside the test. */
const openPicker = () => { act(() => { picker.open('session-1') }) }
const closePicker = () => { act(() => { picker.close() }) }

const table = {
  'picker.title': '切换模型',
  'picker.all': '全部',
  'picker.search': '搜索模型或提供商…',
  'picker.close': '关闭',
  'status.loading': '正在加载模型…',
  'status.empty': '没有可用的模型。',
  'status.failed': '模型列表加载失败：{message}',
  'status.providerFailed': '{name} 加载失败：{message}',
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
  'effort.label': '推理等级',
  'effort.providerDefault': 'Default',
  'effort.useDefault': '切换为默认档位',
}
const t = (key, values) => {
  const text = table[key] ?? key
  return values === undefined
    ? text
    : text.replace(/\{(\w+)\}/g, (_all, name) => String(values[name] ?? ''))
}

const face = {
  sessionId: 'session-1',
  picker,
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
    // The lookup identity must be stable: the host reads it through
    // useSyncExternalStore, which re-renders forever on a fresh reference.
    getSnapshot: () => unknownFacts,
    subscribe: () => () => {},
  },
  resolveText: (text) => (typeof text === 'string' ? text : (text.zh ?? text.en)),
  t,
}

let container
let viewRoot
/** The Host menu surface a bridge test mounts into, when there is one. */
let surface
/** What the Host's own cells did — the bridge must keep these empty. */
const hostCellClicks = []

function mount(element) {
  container = document.createElement('div')
  document.body.append(container)
  viewRoot = createRoot(container)
  act(() => { viewRoot.render(element) })
}

/** One Host cell: label, value, chevron, and the Host's own click handler. */
function hostCell(name, label, value) {
  const cell = document.createElement('button')
  cell.type = 'button'
  cell.setAttribute('role', 'menuitem')
  cell.setAttribute('data-cell', name)
  cell.innerHTML = `<span class="_host_cellLabel">${label}</span>`
    + `<span class="_host_cellValue">${value}</span>`
    + '<svg class="_host_cellChevron"></svg>'
  cell.addEventListener('click', () => { hostCellClicks.push(name) })
  return cell
}

/**
 * Mount the bridge inside a stand-in for the Host's root menu: one surface
 * holding the two cells the Host draws itself, with the effort cell carrying
 * the same three children the Host renders.
 */
function mountBridge(element) {
  surface = document.createElement('div')
  surface.setAttribute('data-menu-material', '')
  surface.append(hostCell('model', '模型', 'Model A'), hostCell('effort', '推理等级', 'High'))
  document.body.append(surface)
  container = document.createElement('div')
  surface.append(container)
  viewRoot = createRoot(container)
  act(() => { viewRoot.render(element) })
}

/** Fresh bridge on a fresh stand-in menu, with the catalog reset to the default. */
function mountFreshBridge(props) {
  unmount()
  setState(snapshot())
  mountBridge(createElement(bridgeEntry.component, props ?? bridgeProps))
}

function unmount() {
  if (viewRoot !== undefined) act(() => { viewRoot.unmount() })
  viewRoot = undefined
  container?.remove()
  container = undefined
  surface?.remove()
  surface = undefined
}

/** One cell of the stand-in menu surface. */
const cell = (name) => surface.querySelector(`[data-cell="${name}"]`)
const cellValue = (name) => cell(name).querySelector("span[class*='cellValue']")
const cellChevron = (name) => cell(name).querySelector("svg[class*='cellChevron']")
const slider = () => cell('effort').querySelector('[role="slider"]')
const ticks = () => slider() === null ? [] : [...slider().querySelectorAll('[class*="sliderTick"]')]

const click = (element) => {
  act(() => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })) })
}
// jsdom has no PointerEvent; React dispatches by native event type, so a
// MouseEvent carrying the pointer type drives the same handler.
const pointer = (type, element, clientX) => {
  act(() => {
    element.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX }))
  })
}
const key = (element, name) => {
  act(() => {
    element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
  })
}
/** jsdom does no layout: give the slider the 100px track it would have on screen. */
const withTrack = () => {
  slider().getBoundingClientRect = () => ({
    left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}),
  })
}
const flush = async () => { await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) }) }
const dialog = () => document.querySelector('[role="dialog"]')
const rowButtons = () => dialog() === null ? [] : [...dialog().querySelectorAll('[role="menuitemradio"]')]
const rowByName = (name) => rowButtons().find((row) => row.getAttribute('title') === name)
const stars = () => dialog() === null ? [] : [...dialog().querySelectorAll('button[aria-pressed]')]
const starOf = (row) => row.parentElement.querySelector('button[aria-pressed]')
const search = () => dialog()?.querySelector('input[role="searchbox"]')
const tabs = () => dialog() === null ? [] : [...dialog().querySelectorAll('[role="tab"]')]
const tab = (label) => tabs().find((button) => button.textContent === label)

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

const bridgeProps = {
  ...face,
  locked: false,
  dismiss: () => { dismissals.push('dismiss') },
  reportFailure: (message) => { failures.push(message) },
}

await test('点宿主的第一格：先关菜单，再把开合请求交给 store，宿主自己的下钻不执行', () => {
  closePicker()
  dismissals.length = 0
  hostCellClicks.length = 0
  mountFreshBridge()
  click(cell('model'))
  assert.deepEqual(dismissals, ['dismiss'])
  assert.equal(picker.getSnapshot().sessionId, 'session-1')
  assert.deepEqual(hostCellClicks, [], '宿主那格的下钻必须被拦下')
})

await test('点「推理等级」四个字切回 provider default', async () => {
  mountFreshBridge()
  hostCellClicks.length = 0
  selections.length = 0
  click(cell('effort').querySelector("span[class*='cellLabel']"))
  await flush()
  assert.deepEqual(hostCellClicks, [], '推理等级那一行不该再弹档位列表')
  assert.deepEqual(selections, [{ provider: 'magpie', model: 'a' }], '默认档位不带 reasoningEffort')
})

await test('点第二行的数值：不下钻，焦点交给滑块', () => {
  mountFreshBridge()
  hostCellClicks.length = 0
  click(cellValue('effort'))
  assert.deepEqual(hostCellClicks, [], '推理等级那一行不该再弹档位列表')
  assert.equal(document.activeElement, slider(), '焦点必须落在滑块上，否则键盘够不到')
})

await test('滑块按档位画刻度，旋钮停在当前档', () => {
  assert.notEqual(slider(), null)
  assert.equal(ticks().length, 3)
  assert.equal(slider().getAttribute('aria-valuenow'), '1')
  assert.equal(slider().getAttribute('aria-valuetext'), 'High')
  assert.equal(slider().getAttribute('aria-label'), '推理等级')
})

await test('数值让出空档、箭头隐藏，滑块占住中间', () => {
  assert.equal(cellValue('effort').style.flex, '0 0 auto')
  assert.equal(cellValue('effort').style.order, '1')
  assert.equal(cellChevron('effort').style.display, 'none')
})

await test('数值跟着档位变色，标签在可切回默认时是可点的', () => {
  const label = cell('effort').querySelector("span[class*='cellLabel']")
  // 三档模型的中间档：蓝紫各半。
  assert.equal(cellValue('effort').style.color, 'rgb(112, 99, 241)')
  assert.equal(label.style.cursor, 'pointer')
  assert.equal(label.getAttribute('title'), '切换为默认档位')
})

await test('provider default 不是档位：轨道空、旋钮空心、读作默认', () => {
  mountFreshBridge()
  setState(snapshot({ current: { provider: 'magpie', model: 'a' } }))
  assert.equal(slider().hasAttribute('data-default'), true)
  assert.equal(slider().getAttribute('aria-valuetext'), 'Default', '与宿主自己写的档位文字一致')
  assert.equal(ticks().length, 3, '默认不该多出一个档位')
  assert.equal(cellValue('effort').style.color, '', '默认态数值不跟着档位变色')
  const label = cell('effort').querySelector("span[class*='cellLabel']")
  assert.equal(label.style.cursor, '', '已经在默认态时标签不再是可点的')
})

await test('从默认态拖到同一个刻度也算离开默认', async () => {
  mountFreshBridge()
  setState(snapshot({ current: { provider: 'magpie', model: 'a' } }))
  selections.length = 0
  withTrack()
  // 默认停在 'high'（第 2 档），圆心 50px；拖到同一处也必须提交，否则用户
  // 会卡在默认态里出不来。
  pointer('pointerdown', slider(), 50)
  pointer('pointerup', slider(), 50)
  await flush()
  assert.deepEqual(selections, [{ provider: 'magpie', model: 'a', reasoningEffort: 'high' }])
})

await test('拖到另一档松手才提交一次', async () => {
  selections.length = 0
  withTrack()
  pointer('pointerdown', slider(), 75)
  pointer('pointerup', slider(), 75)
  await flush()
  assert.deepEqual(selections, [{ provider: 'magpie', model: 'a', reasoningEffort: 'max' }])
})

await test('按下与松手落在同一个任务里也不丢提交', async () => {
  mountFreshBridge()
  selections.length = 0
  withTrack()
  // No flush between the two: the release must read the drag it just started
  // rather than a render that has not run yet.
  act(() => {
    slider().dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 75 }))
    slider().dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 75 }))
  })
  await flush()
  assert.deepEqual(selections, [{ provider: 'magpie', model: 'a', reasoningEffort: 'max' }])
})

await test('松手停在原档不提交', async () => {
  mountFreshBridge()
  selections.length = 0
  withTrack()
  // 第 2 档的圆心在 7 + 43 = 50px。
  pointer('pointerdown', slider(), 50)
  pointer('pointerup', slider(), 50)
  await flush()
  assert.deepEqual(selections, [])
})

await test('键盘右移一档立即提交', async () => {
  mountFreshBridge()
  selections.length = 0
  key(slider(), 'ArrowRight')
  await flush()
  assert.deepEqual(selections, [{ provider: 'magpie', model: 'a', reasoningEffort: 'max' }])
})

await test('末档再按右键不提交', async () => {
  setState(snapshot({ current: { provider: 'magpie', model: 'a', reasoningEffort: 'max' } }))
  selections.length = 0
  key(slider(), 'ArrowRight')
  await flush()
  assert.deepEqual(selections, [])
})

await test('提交进行中时拖动与按键都不提交', async () => {
  mountFreshBridge()
  setState(snapshot({ pending: { provider: 'magpie', model: 'a', reasoningEffort: 'max' } }))
  selections.length = 0
  withTrack()
  pointer('pointerdown', slider(), 75)
  pointer('pointerup', slider(), 75)
  key(slider(), 'ArrowRight')
  await flush()
  assert.deepEqual(selections, [])
})

await test('提交被拒时走宿主的提示气泡', async () => {
  mountFreshBridge()
  outcomes.push({ ok: false, error: { code: 'session/writer-held', message: 'held' } })
  failures.length = 0
  withTrack()
  pointer('pointerdown', slider(), 75)
  pointer('pointerup', slider(), 75)
  await flush()
  assert.deepEqual(failures, ['会话被占用'])
})

await test('模型只声明一档时不挂滑块，宿主那一行原样保留', () => {
  unmount()
  // The snapshot identity must be stable: useSyncExternalStore re-renders forever
  // on a fresh object per read.
  const singleState = snapshot({
    groups: [{
      id: 'magpie',
      name: 'Magpie',
      models: [{ id: 'a', name: 'Model A', reasoning: { efforts: [{ id: 'only', name: 'Only' }], defaultEffort: 'only' } }],
    }],
  })
  const single = { getSnapshot: () => singleState, subscribe: () => () => {} }
  mountBridge(createElement(bridgeEntry.component, { ...bridgeProps, directory: single }))
  assert.equal(slider(), null)
  assert.equal(cellChevron('effort').style.display, '')
  assert.equal(cellValue('effort').style.flex, '')
})

await test('模型不声明推理等级时同样不挂滑块', () => {
  mountFreshBridge()
  setState(snapshot({ current: { provider: 'magpie', model: 'c' } }))
  assert.equal(slider(), null)
  assert.equal(cellChevron('effort').style.display, '')
})

await test('卸载后把宿主那一行的样式写回去', () => {
  mountFreshBridge()
  const chevron = cellChevron('effort')
  const value = cellValue('effort')
  assert.equal(chevron.style.display, 'none')
  unmount()
  assert.equal(chevron.style.display, '')
  assert.equal(value.style.flex, '')
  assert.equal(value.style.order, '')
})

await test('点菜单里的非菜单项：一概不动', () => {
  mountFreshBridge()
  const plain = document.createElement('div')
  plain.textContent = '团队协作'
  surface.append(plain)
  dismissals.length = 0
  hostCellClicks.length = 0
  click(plain)
  assert.deepEqual(hostCellClicks, [])
  assert.deepEqual(dismissals, [])
  plain.remove()
})

await test('桥本身不画任何可见内容', () => {
  assert.equal(container.textContent, '')
  assert.equal(container.querySelector('span[hidden]') !== null, true, '标记必须留在宿主菜单面板里')
})

await test('store 没指向本会话时弹窗不渲染', () => {
  closePicker()
  unmount()
  mount(createElement(hostEntry.component, face))
  assert.equal(dialog(), null)
})

await test('store 指向本会话时弹窗出现，且读了一次目录', async () => {
  loads.length = 0
  openPicker()
  await flush()
  assert.notEqual(dialog(), null)
  assert.ok(loads.includes('load'), '打开弹窗应当重新读一次目录')
})

await test('弹窗列出全部供应商的模型', () => {
  assert.deepEqual(rowButtons().map((row) => row.getAttribute('title')), ['Model A', 'Model B', 'Model C', 'Kimi K3'])
})

await test('供应商标签页各列各的模型', () => {
  assert.deepEqual(tabs().map((button) => button.textContent), ['全部', 'Magpie', 'A6api'])
  click(tab('A6api'))
  assert.deepEqual(rowButtons().map((row) => row.getAttribute('title')), ['Kimi K3'])
  click(tab('全部'))
})

await test('搜索按名字过滤', () => {
  const input = search()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
    setter.call(input, 'kimi')
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  assert.deepEqual(rowButtons().map((row) => row.getAttribute('title')), ['Kimi K3'])
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '')
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
})

await test('收藏的模型排在前面并带实心星', () => {
  globalThis.localStorage.setItem('dsh-model-submenu.favorites', JSON.stringify([{ provider: 'magpie', model: 'c' }]))
  unmount()
  mount(createElement(hostEntry.component, face))
  assert.deepEqual(rowButtons().map((row) => row.getAttribute('title')), ['Model C', 'Model A', 'Model B', 'Kimi K3'])
  assert.equal(starOf(rowByName('Model C')).getAttribute('aria-pressed'), 'true')
})

await test('星标是独立控件，点它只改收藏不换模型', async () => {
  selections.length = 0
  click(starOf(rowByName('Model A')))
  await flush()
  assert.deepEqual(selections, [])
  assert.equal(starOf(rowByName('Model A')).getAttribute('aria-pressed'), 'true')
  assert.equal(globalThis.localStorage.getItem('dsh-model-submenu.favorites').includes('"a"'), true)
})

await test('点模型立即提交并关闭弹窗', async () => {
  selections.length = 0
  click(rowByName('Model B'))
  await flush()
  assert.deepEqual(selections, [{ provider: 'magpie', model: 'b' }])
  assert.equal(picker.getSnapshot().sessionId, null)
  assert.equal(dialog(), null)
})

await test('点当前这个模型不提交，只关闭', async () => {
  openPicker()
  await flush()
  selections.length = 0
  click(rowByName('Model B'))
  await flush()
  assert.deepEqual(selections, [])
  assert.equal(dialog(), null)
})

await test('提交被拒时留在弹窗并弹提示', async () => {
  outcomes.push({ ok: false, error: { code: 'session/writer-held', message: 'held' } })
  openPicker()
  await flush()
  click(rowByName('Model A'))
  await flush()
  assert.equal(document.querySelector('[role="status"]')?.textContent, '会话被占用')
  assert.notEqual(dialog(), null, '被拒时弹窗必须留着，好让用户换一个')
  closePicker()
})

await test('选模型时恢复该模型上次用的思考等级', async () => {
  globalThis.localStorage.setItem('dsh-model-submenu.efforts', JSON.stringify([{ provider: 'magpie', model: 'b', effort: 'max' }]))
  setState(snapshot())
  unmount()
  mount(createElement(hostEntry.component, face))
  openPicker()
  await flush()
  selections.length = 0
  click(rowByName('Model B'))
  await flush()
  assert.deepEqual(selections, [{ provider: 'magpie', model: 'b', reasoningEffort: 'max' }])
})

await test('记住的档位不在该模型的可选档里时不强塞', async () => {
  globalThis.localStorage.setItem('dsh-model-submenu.efforts', JSON.stringify([{ provider: 'magpie', model: 'c', effort: 'max' }]))
  setState(snapshot())
  unmount()
  mount(createElement(hostEntry.component, face))
  openPicker()
  await flush()
  selections.length = 0
  click(rowByName('Model C'))
  await flush()
  assert.deepEqual(selections, [{ provider: 'magpie', model: 'c' }], 'Model C 不声明思考等级，不该带档位')
})

await test('宿主菜单改的思考等级也记进记忆（写入链，不只是读取）', async () => {
  globalThis.localStorage.removeItem('dsh-model-submenu.efforts')
  setState(snapshot())
  unmount()
  mount(createElement(hostEntry.component, face))
  await flush()
  // 宿主自己的菜单把 A 调到 Max：这次点击本插件没有参与。
  setState(snapshot({ current: { provider: 'magpie', model: 'a', reasoningEffort: 'max' } }))
  await flush()
  const stored = JSON.parse(globalThis.localStorage.getItem('dsh-model-submenu.efforts'))
  assert.deepEqual(stored, [{ provider: 'magpie', model: 'a', effort: 'max' }])
})

await test('同一个选中态重复到达时不重复写记忆', async () => {
  const before = globalThis.localStorage.getItem('dsh-model-submenu.efforts')
  setState(snapshot({ current: { provider: 'magpie', model: 'a', reasoningEffort: 'max' } }))
  await flush()
  assert.equal(globalThis.localStorage.getItem('dsh-model-submenu.efforts'), before)
})

await test('加载中在弹窗里写一行文字', async () => {
  setState(snapshot({ status: 'loading' }))
  openPicker()
  await flush()
  assert.ok(dialog().textContent.includes('正在加载模型…'), dialog()?.textContent)
  closePicker()
})

await test('供应商加载失败时写一行并带重新加载', async () => {
  setState(snapshot({ status: 'ready', failures: [{ id: 'a6api', name: 'A6api', message: 'timeout' }] }))
  openPicker()
  await flush()
  assert.ok(dialog().textContent.includes('A6api 加载失败：timeout'), dialog()?.textContent)
  const before = loads.length
  click([...dialog().querySelectorAll('button')].find((button) => button.textContent === '重新加载'))
  assert.ok(loads.length > before)
  closePicker()
})

await test('会话不可选时整块不渲染', () => {
  openPicker()
  unmount()
  mount(createElement(hostEntry.component, { ...face, available: false }))
  assert.equal(dialog(), null)
})

await test('关闭按钮把 store 清空', async () => {
  openPicker()
  unmount()
  mount(createElement(hostEntry.component, face))
  await flush()
  click(dialog().querySelector('button[aria-label="关闭"]'))
  await flush()
  assert.equal(picker.getSnapshot().sessionId, null)
  assert.equal(dialog(), null)
})

unmount()
console.log(`\nrender: ${passed}/${total} passed`)
process.exit(passed === total ? 0 : 1)
