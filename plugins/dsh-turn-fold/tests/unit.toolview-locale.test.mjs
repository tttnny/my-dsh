// toolview 手写分发的 locale 回归：子条目声明的命名空间必须被尊重。
//
// 背景：本插件 shadow 了 conversation.chat.node，内置 ToolCallTree 的 renderSlot
// 由我们自己实现（renderToolview）。官方 renderEntry 只给**声明了 locale 的条目**
// 发 t，且按该条目自己的命名空间绑定——ui-tool 的工具行用 'conversation'，
// 但 tool.call.toolview 的 key 领域是开放的，第三方条目各用各的命名空间
// （本仓库 ask_user_grilling 行声明 'askGrilling'）。手写分发一度沿用插件自己的
// t（'chat'/'conversation'），对方词典查不到，locale 服务按契约原样返回 key——
// 卡片外壳还在、正文全变成 "row.title" 这类裸 key，展开后像「什么都没有」。
//
// 命名空间在 entry.locale（顶层字段），不在 entry.options.locale：SlotCore 只把
// key/id/order/label/priority 放进 options。
//
// 这里用真实 renderToolview + 假 locale 面驱动：断言按条目命名空间绑定、
// 未声明 locale 时退回 kit.t，以及 locale 面缺失（旧版/测试宿主）时不崩。
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { loadPlugin } from './helpers/loader.mjs'

const require = createRequire(import.meta.url)
const { renderToStaticMarkup } = require('react-dom/server')

// 注意：本套件以 --test-isolation=none 与其余测试同进程序跑，**不要**覆盖
// globalThis.window / document——那会顶掉别的套件依赖的 jsdom（症状是语言切换类
// 断言读到另一种语言）。loadPlugin 缺省自建 jsdom，这里直接用它。
const { test: T, exports: pluginExports, React } = loadPlugin()

/** 造一个假 locale 面：记录被 bind 的命名空间，按 (ns, key) 查词典返回。 */
function makeLocaleFace(dicts) {
  const bound = []
  return {
    bound,
    bind(ns) {
      bound.push(ns)
      return (key, params) => {
        const dict = dicts[ns]
        const text = dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key
        if (!params) return text
        return String(text).replace(/\{(\w+)\}/g, (m, name) =>
          Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m)
      }
    },
  }
}

/** 条目组件：把 t 的两次调用结果渲染成可断言的文本。 */
function makeRow() {
  return function Row({ t }) {
    return React.createElement('div', { className: 'foreign-row' },
      `${t('row.title')} · ${t('row.answered', { answered: 2, total: 2 })}`)
  }
}

/**
 * 用给定的 slots/locale 环境驱动 apply。
 * @param {{ entries: object[], face: object|null }} options - toolview 条目与 locale 面。
 */
function assemble({ entries, face }) {
  const slotsService = {
    entries: () => [],
    getVersion: () => 0,
    entriesOfSlot: (key) => (key === 'tool.call.toolview' ? entries : []),
    inject: () => {},
    register: () => {},
  }
  pluginExports.apply({
    locale: face ?? undefined,
    slots: slotsService,
    settingsScope: { bind: () => ({ getSnapshot: () => ({ value: undefined }), subscribe: () => () => {}, set: () => {} }) },
    effect: (fn) => { fn(); return () => {} },
    inject: (deps, cb) => { if (typeof cb === 'function') cb({ slots: slotsService }) },
    on: () => () => {},
  })
  return slotsService
}

/** 渲染 renderToolview 的结果为纯文本。 */
function renderText(element) {
  return renderToStaticMarkup(element).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

describe('toolview 手写分发：按子条目声明的 locale 命名空间绑定 t', () => {
  it("条目声明 'askGrilling' → 用该命名空间取词（不再裸显 row.title）", () => {
    const face = makeLocaleFace({
      askGrilling: { 'row.title': '提问', 'row.answered': '{answered}/{total} 已回答' },
      conversation: {},
    })
    const Row = makeRow()
    assemble({ entries: [{ component: Row, options: { key: 'ask_user_grilling' }, locale: 'askGrilling' }], face })

    face.bound.length = 0; // apply() 自己会 bind('chat') 做探测，只看这次渲染绑了什么
    const el = T.renderToolview({ t: (k) => k }, {}, 'ask_user_grilling', null)
    assert.equal(renderText(el), '提问 · 2/2 已回答')
    assert.deepEqual(face.bound, ['askGrilling'])
  })

  it('条目未声明 locale → 退回 kit.t（官方对这类条目就是不发 t）', () => {
    const face = makeLocaleFace({ askGrilling: { 'row.title': '提问' } })
    const Row = makeRow()
    assemble({ entries: [{ component: Row, options: { key: 'plain_tool' } }], face })

    const kitT = (key) => `kit:${key}`
    face.bound.length = 0;
    const el = T.renderToolview({ t: kitT }, {}, 'plain_tool', null)
    assert.match(renderText(el), /kit:row\.title/)
    assert.deepEqual(face.bound, [], '未声明 locale 不该去 bind')
  })

  it('locale 面缺失（旧版宿主）→ 退回 kit.t，不抛错', () => {
    const Row = makeRow()
    assemble({ entries: [{ component: Row, options: { key: 'ask_user_grilling' }, locale: 'askGrilling' }], face: null })

    const kitT = (key) => `kit:${key}`
    const el = T.renderToolview({ t: kitT }, {}, 'ask_user_grilling', null)
    assert.match(renderText(el), /kit:row\.title/)
  })

  it('locale 面的 bind 抛错 → 退回 kit.t，不崩条目', () => {
    const Row = makeRow()
    const face = { bind() { throw new Error('boom') } }
    assemble({ entries: [{ component: Row, options: { key: 'ask_user_grilling' }, locale: 'askGrilling' }], face })

    const kitT = (key) => `kit:${key}`
    const el = T.renderToolview({ t: kitT }, {}, 'ask_user_grilling', null)
    assert.match(renderText(el), /kit:row\.title/)
  })

  it('条目缺 component / 键不匹配 → 仍走 fallback', () => {
    const face = makeLocaleFace({ askGrilling: {} })
    const Row = makeRow()
    assemble({ entries: [{ options: { key: 'ask_user_grilling' }, locale: 'askGrilling' }], face })
    const fallback = React.createElement('div', null, 'FALLBACK')
    assert.equal(renderText(T.renderToolview({ t: (k) => k }, {}, 'ask_user_grilling', fallback)), 'FALLBACK')

    assemble({ entries: [{ component: Row, options: { key: 'other' }, locale: 'askGrilling' }], face })
    assert.equal(renderText(T.renderToolview({ t: (k) => k }, {}, 'ask_user_grilling', fallback)), 'FALLBACK')
  })

  it('官方工具行（声明 conversation）行为不变：仍按 conversation 取词', () => {
    const face = makeLocaleFace({ conversation: { 'row.title': '官方标题' } })
    const Row = makeRow()
    assemble({ entries: [{ component: Row, options: { key: 'bash' }, locale: 'conversation' }], face })
    face.bound.length = 0;
    const el = T.renderToolview({ t: (k) => k }, {}, 'bash', null)
    assert.match(renderText(el), /官方标题/)
    assert.deepEqual(face.bound, ['conversation'])
  })
})
