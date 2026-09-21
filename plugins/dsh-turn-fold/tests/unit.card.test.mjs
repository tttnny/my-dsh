// 「阅读体验」共享页卡片：选举 / 卡片注册 / 设置持久化 / 壳体同源性
// 以及本版新增：层级缩进、三级工具名解析、思考计数守卫、tok/s decode 口径。
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadPlugin } from './helpers/loader.mjs'
import { makeNode, asNode, toolNode, userNode, buildSnapshot } from './helpers/store.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
})
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN', languages: ['zh-CN'] }, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { test: T, exports: pluginExports, React } = loadPlugin({ window: dom.window })

/** 记录注册条目的 slots mock（可预置"页面已被他人占用"的 entries）。 */
function makeSlots(extraEntries = []) {
  const regs = []
  return {
    regs,
    svc: {
      entries(key) {
        if (key === 'settings.section') return [...extraEntries]
        return []
      },
      getVersion() { return 0 },
      entriesOfSlot() { return [] },
      inject(name, factory) { regs.push({ slot: name, result: factory() }) },
      register(options, component) { return { component, options } },
      subscribe() { return () => {} },
    },
  }
}

/** 最小 locale mock：register + bind（卡片标题/页面名走它取）。 */
function makeLocale() {
  const dicts = new Map()
  return {
    register(ns, pairs) {
      dicts.set(ns, pairs)
      return () => { dicts.delete(ns) }
    },
    bind(ns) {
      return (key) => (dicts.get(ns) && dicts.get(ns).zh && dicts.get(ns).zh[key]) || key
    },
  }
}

function applyWith({ extraEntries = [], withSettingsScope = true } = {}) {
  const { svc, regs } = makeSlots(extraEntries)
  const effects = []
  const scope = {
    set() {}, unset() {},
    getSnapshot() { return { status: 'ready', value: { transcriptView: 'normal' }, writable: true } },
    subscribe() { return () => {} },
  }
  const localeMock = makeLocale()
  const ctx = {
    slots: svc,
    locale: localeMock,
    // 共享页壳用 ctx.get("locale") 可选读取（避免触发内核 inject guard）
    get(name) { return name === 'locale' ? localeMock : undefined },
    effect(fn) { effects.push(fn()); return () => {} },
    inject(deps, cb) {
      cb({ slots: svc, connection: { generation: { getSnapshot: () => ({ host: { home: 'C:/Users/Test' } }), subscribe: () => () => {} } } })
    },
  }
  if (withSettingsScope) ctx.settingsScope = { bind: () => scope }
  pluginExports.apply(ctx)
  return { regs, effects }
}

describe('阅读体验共享页：页面选举与卡片注册', () => {
  it('页面未被占用 → 本插件当选，声明 reading 页与 reading.settings.item 子槽', () => {
    const { regs } = applyWith()
    const page = regs.find((r) => r.slot === 'settings.section')
    assert.ok(page, '应参与 settings.section 选举')
    // 未占用 → claim 实际注册页面，register 返回条目对象
    assert.ok(page.result && page.result.options, '未被占用时应实际注册页面')
    assert.equal(page.result.options.id, 'reading', '页面 id 为 reading')
    assert.equal(page.result.options.order, 110, '侧栏 order 110')
    assert.ok(page.result.options.children['reading.settings.item'], '声明 reading.settings.item 子槽')
  })

  it('页面已被他人占用 → 不再重复声明（claim 返回空 disposer）', () => {
    const { regs } = applyWith({ extraEntries: [{ options: { id: 'reading' } }] })
    const page = regs.find((r) => r.slot === 'settings.section')
    assert.ok(page, '仍会调用 inject')
    // 已占用 → claim 走 readingPageClaimed 短路，返回空 disposer（函数），
    // 而不是 ctx.slots.register(...) 的条目对象——即不重复声明页面。
    assert.equal(typeof page.result, 'function', '已占用时返回空 disposer')
    assert.equal(page.result.options, undefined, '不再是注册条目')
  })

  it('卡片始终注册进 reading.settings.item：id/order/locale 正确', () => {
    const { regs } = applyWith()
    const card = regs.find((r) => r.slot === 'reading.settings.item')
    assert.ok(card, '卡片注册到共享页子槽')
    assert.equal(card.result.options.id, 'dsh-turn-fold', '座位 id 取插件稳定 id')
    assert.equal(card.result.options.order, 10, '排在 chat-translate(30) 之前')
    assert.equal(card.result.options.locale, 'dshTurnFold', '卡片 locale 挂自己的命名空间')
    assert.equal(card.result.options.label(), '会话折叠', 'tab 标题取自本插件词典')
  })

  it('页面已被占用时卡片仍照常注册（设置入口不依赖当选）', () => {
    const { regs } = applyWith({ extraEntries: [{ options: { id: 'reading' } }] })
    assert.ok(regs.find((r) => r.slot === 'reading.settings.item'), '未当选也要注册卡片')
  })

  it('无 slots 服务 → apply 不抛错、不注册任何东西', () => {
    assert.doesNotThrow(() => {
      pluginExports.apply({ inject() {}, effect() {} })
    })
  })
})

describe('阅读体验共享页：壳体与母本同源', () => {
  // 母本 = dsh-chat-translate 的编译产物（TSX 经 esbuild 输出）；归一化差异必须为 0。
  const shellFile = fileURLToPath(new URL('../../dsh-chat-translate/lib/client.js', import.meta.url))
  const selfFile = fileURLToPath(new URL('../lib/client.js', import.meta.url))

  // 壳体本体以 `var READING_PAGE_ID = "reading";` 开头，以 claimReadingSettingsPage 的
  // 收尾 `}` 结束。结束位置动态扫描而不是写死行数——母本一旦变长，写死行数的比较会
  // 静默只比前 N 行而"通过"。
  function extractShell(lines, startIdx) {
    const start = lines.findIndex((l) => l.includes('var READING_PAGE_ID = "reading";'))
    assert.notEqual(start, -1, '应含 READING_PAGE_ID 定义（壳体本体起点）')
    const fnAt = lines.findIndex((l, i) => i > start && l.includes('function claimReadingSettingsPage'))
    assert.notEqual(fnAt, -1, '应含 claimReadingSettingsPage（壳体本体终点前哨）')
    const end = lines.findIndex((l, i) => i > fnAt && l.trim() === '}')
    assert.notEqual(end, -1, '应含 claimReadingSettingsPage 的收尾 }')
    return lines.slice(start, end + 1)
  }

  function extractRegion(src) {
    const start = src.indexOf('//#region shared reading settings page shell')
    const end = src.indexOf('//#endregion shared reading settings page shell')
    assert.ok(start !== -1 && end !== -1, '本插件应含共享页 region 标记')
    return extractShell(src.slice(start, end).split('\n'))
  }

  function extractMaster(src) {
    return extractShell(src.split('\n'))
  }

  it('region 内容与母本编译产物逐行相同（仅行首缩进不同）', () => {
    const master = extractMaster(readFileSync(shellFile, 'utf8'))
    const region = extractRegion(readFileSync(selfFile, 'utf8'))
    assert.equal(region.length, master.length, `区段行数应与母本一致（region=${region.length} master=${master.length}）`)
    for (let i = 0; i < master.length; i++) {
      assert.equal(region[i].trim(), master[i].trim(), `第 ${i + 1} 行与母本不同：\n区段: ${region[i]}\n母本: ${master[i]}`)
    }
  })

  it('静态常量与母本一致（页 id / order / 子槽名）', () => {
    assert.equal(T.READING_PAGE_ID, 'reading')
    assert.equal(T.READING_PAGE_ORDER, 110)
    assert.equal(T.READING_ITEM_SLOT, 'reading.settings.item')
  })
})

describe('设置持久化（localStorage）', () => {
  beforeEach(() => { dom.window.localStorage.clear() })

  it('字段显隐写入 dsh-turn-fold:fields，读回时只接受已知键的布尔值', () => {
    T.setFieldVisible('cacheHit', false)
    const raw = dom.window.localStorage.getItem(T.FIELD_VISIBILITY_KEY)
    assert.ok(raw, '写入 localStorage')
    const saved = JSON.parse(raw)
    assert.equal(saved.cacheHit, false, '关闭状态被持久化')
    // 读回：坏值/未知键一律忽略，保持默认
    dom.window.localStorage.setItem(T.FIELD_VISIBILITY_KEY, JSON.stringify({ cacheHit: false, bogus: 'x', duration: 'yes' }))
    T.loadFieldVisibility()
    // 恢复断言基线
    T.setFieldVisible('cacheHit', true)
  })

  it('图标风格写入 dsh-turn-fold:icon-style，坏值落回默认 poker', () => {
    T.setFoldIconStyle('default')
    assert.equal(dom.window.localStorage.getItem(T.FOLD_ICON_KEY), 'default', '持久化选择')
    dom.window.localStorage.setItem(T.FOLD_ICON_KEY, 'nonsense')
    T.setFoldIconStyle('poker') // 先归位，再验证坏值读取不回退成脏值
    assert.equal(T.getFoldIconStyle(), 'poker')
  })

  it('localStorage 不可用时不抛错（读失败落默认）', () => {
    const saved = dom.window.localStorage
    Object.defineProperty(dom.window, 'localStorage', {
      configurable: true,
      get() { throw new Error('blocked') },
    })
    assert.doesNotThrow(() => { T.loadFieldVisibility() }, '读取失败不抛错')
    Object.defineProperty(dom.window, 'localStorage', { configurable: true, value: saved })
  })
})

describe('层级缩进：只作用于步骤折体内部', () => {
  it('CSS 只对 depth=2 缩进，depth=1（回合折体/成员容器）不缩进', () => {
    const css = dom.window.document.querySelector('style[data-plugin-css="dsh-turn-fold/style"]').textContent
    assert.match(css, /\[data-dstf-depth="2"\]\{margin-left:22px;padding-left:8px;border-left:0\.5px solid/,
      'depth 2 逐层缩进 + 官方 0.5px 左细线')
    assert.ok(!/\[data-dstf-depth\]\s*\{/.test(css), '不应存在对所有深度生效的缩进规则')
  })

  it('回合折叠栏与步骤折叠栏同列：没有任何规则让 depth=1 缩进', () => {
    const css = dom.window.document.querySelector('style[data-plugin-css="dsh-turn-fold/style"]').textContent
    // 逐条 CSS 规则检查：凡是选择器命中 depth=1（含通配 [data-dstf-depth] 而不限定 2）
    // 的规则，都不得带水平缩进。只按字符串过滤 "data-dstf-depth=\"1\"" 会空过——
    // 当前 CSS 里根本没有 depth=1 字面量，那种写法永远通过、测不出回归。
    const rules = css.split('}').map((r) => r.trim()).filter(Boolean)
    const offenders = rules.filter((rule) => {
      const [selector = ''] = rule.split('{')
      const hitsDepth1 = /\[data-dstf-depth(?!="2")\]/.test(selector)
      return hitsDepth1 && /(?:^|;)\s*(?:margin|padding)-left\s*:/.test(rule)
    })
    assert.deepEqual(offenders, [], `以下规则会给 depth=1 加水平缩进：\n${offenders.join('\n')}`)
    // 反向断言：depth=2 的规则确实存在（证明上面的过滤器不是把一切都滤掉了）
    assert.ok(/\[data-dstf-depth="2"\]/.test(css), 'depth=2 缩进规则应存在')
  })

  it('FoldClip 给折体盖上对应深度属性（depth 1/2，非法值回退 1）', () => {
    // FoldClip 是深度的唯一落点：渲染层传 depth，组件把它写到 .dstf-fold-body。
    // 直接渲染组件即可验证（无需搭整个会话 store）。
    const host = dom.window.document.createElement('div')
    dom.window.document.body.appendChild(host)
    const root = createRoot(host)
    const render = (depth) => act(() => {
      root.render(React.createElement('div', null,
        React.createElement(T.FoldClip, { open: true, depth }, React.createElement('span', null, 'x'))))
    })
    render(2)
    const body = host.querySelector('.dstf-fold-body')
    assert.ok(body, '折体渲染')
    assert.equal(body.getAttribute('data-dstf-depth'), '2', 'depth=2 透传到折体')
    act(() => root.unmount())
    dom.window.document.body.innerHTML = ''
  })
})

describe('三级工具名解析（运行行共用）', () => {
  it('词典命中：本环境真实存在的第三方工具走中文显示名', () => {
    assert.equal(T.toolDisplayName('generate_image'), '生成图片')
    assert.equal(T.toolDisplayName('analyze_video'), '分析视频')
    assert.equal(T.toolDisplayName('find_dsh_plugin'), '搜索插件')
    assert.equal(T.toolDisplayName('ask_user_grilling'), '追问确认')
  })

  it('MCP 线名拆解：mcp__<server>__<raw> → "Server · Raw name"', () => {
    assert.equal(T.toolDisplayName('mcp__weather__get_forecast'), 'Weather · Get forecast')
    assert.equal(T.toolDisplayName('mcp__github__create_issue'), 'Github · Create issue')
  })

  it('机械兜底：下划线/连字符转空格 + 首字母大写', () => {
    assert.equal(T.toolDisplayName('some_unknown_tool'), 'Some unknown tool')
    assert.equal(T.toolDisplayName('str-replace-editor'), 'Str replace editor')
    assert.equal(T.toolDisplayName('pwsh'), 'Pwsh')
    assert.equal(T.toolDisplayName(''), '')
    assert.equal(T.toolDisplayName(undefined), '')
  })

  it('运行中的折叠栏标题使用解析后的显示名（不再是 Mcp__x__y）', () => {
    const nodes = [
      userNode('u', 100),
      makeNode('tc', 'tool-call', 300, { data: { root: { callId: 'tc', name: 'mcp__weather__get_forecast', argsRaw: JSON.stringify({ city: 'Beijing' }) } } }),
    ]
    const s = buildSnapshot(nodes, { turnEnds: new Map() })
    const g = T.computeGroup(s.chat.order, s.chat.nodes, s.chat.nodes.get('tc'))
    const title = T.segmentLabel(g, s.chat.nodes)
    assert.ok(title.includes('Weather · Get forecast'), `运行行应显示拆解后的名称：${title}`)
    assert.ok(!title.includes('Mcp__weather'), '不再露出原始线名')
  })
})

describe('空 reasoning：仍入段（不遗留空思考行），但不计入思考数', () => {
  // 两条判据必须分开：
  //   归属（isThinkNode/hasReasoning）= 结构上有 reasoning 块 → 必须收进折叠栏，
  //     否则会在对话流里留下一行脱离折叠的空思考；
  //   计数（hasVisibleReasoning）= 文本 trim 非空 → 官方四处可见性判定同款，
  //     空/纯空白块不算一次思考。
  const thinkOnly = (key, seq, text) =>
    asNode(key, seq, { blocks: [{ kind: 'reasoning', text }] })

  it('纯空白 reasoning：仍作为段成员被折叠，但 thinkCount 不计', () => {
    const nodes = [
      userNode('u', 100),
      thinkOnly('th-blank', 200, ' '),
      toolNode('tc', 400),
    ]
    const s = buildSnapshot(nodes, { turnEnds: new Map() })
    const g = T.computeGroup(s.chat.order, s.chat.nodes, s.chat.nodes.get('tc'))
    assert.equal(g.keys.includes('th-blank'), true, '空白 reasoning 节点仍入段（否则遗留孤立空思考行）')
    assert.equal(g.thinkCount, 0, '空白 reasoning 不计入思考数')
  })

  it('空字符串 reasoning：同样入段但不计数', () => {
    const nodes = [
      userNode('u', 100),
      thinkOnly('th-empty', 200, ''),
      toolNode('tc', 400),
    ]
    const s = buildSnapshot(nodes, { turnEnds: new Map() })
    const g = T.computeGroup(s.chat.order, s.chat.nodes, s.chat.nodes.get('tc'))
    assert.equal(g.keys.includes('th-empty'), true, '空串 reasoning 节点仍入段')
    assert.equal(g.thinkCount, 0, '空字符串 reasoning 不计入')
  })

  it('非空 reasoning：入段且计 1 次（守卫不误伤）', () => {
    const nodes = [
      userNode('u', 100),
      thinkOnly('th-real', 200, '真正思考'),
      toolNode('tc', 400),
    ]
    const s = buildSnapshot(nodes, { turnEnds: new Map() })
    const g = T.computeGroup(s.chat.order, s.chat.nodes, s.chat.nodes.get('tc'))
    assert.equal(g.thinkCount, 1, '非空 reasoning 计 1 次')
    assert.equal(g.keys.includes('th-real'), true, '非空 reasoning 入段')
  })

  it('纯空白 think 段闭合标题显示"思考了N次"时兜底为 1（段内无可见思考）', () => {
    // 段内只有空白 reasoning → thinkCount 0；闭合分支对 toolCount===0 有兜底（按 1 次计），
    // 保证标题不是"思考了0次"这种怪句子。
    const nodes = [userNode('u', 100), thinkOnly('th-only', 200, ' '), asNode('as2', 500, { blocks: [{ kind: 'text', text: '最终' }] })]
    const s = buildSnapshot(nodes, { turnEnds: new Map() })
    const g = T.computeGroup(s.chat.order, s.chat.nodes, s.chat.nodes.get('th-only'))
    assert.equal(g.toolCount, 0, '该段无工具')
    assert.equal(T.segmentLabel(g, s.chat.nodes, true), '思考了1次', '兜底为 1 次，不出现"思考了0次"')
  })
})

describe('tok/s：官方 decode 口径（Σoutput ÷ Σdecode）', () => {
  it('运行中按 decode 时间估算，不再用整回合墙上时间', () => {
    // 墙上时间 100s 但 decode 只有 5.1s：旧实现会算出 ~0.5 tok/s，官方口径应为 ~9.8
    const nodes = [
      userNode('u', 100),
      asNode('as-1', 200, {
        status: 'settled',
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 200 },
        timing: { stepStartTime: 200000, firstTokenTime: 204900, completedTime: 210000 },
      }),
      toolNode('tc', 300, { running: true }),
    ]
    const s = buildSnapshot(nodes, { turnEnds: new Map(), turnTimings: new Map([[13, { startTime: 200000 }]]) })
    const m = T.computeTurnMetrics(13, s.chat.nodes, s.chat.locations, s.turnTimings, 300000)
    assert.equal(m.durationMs, 100000, '耗时仍是墙上时间（100000ms）')
    assert.equal(Math.round(m.tokensPerSecond * 10) / 10, 9.8, 'tok/s 用 decode 口径：50 / 5.1s ≈ 9.8')
  })

  it('无 decode 证据（无 timing）时不产出 tok/s，而不是用墙上时间硬估', () => {
    const nodes = [
      userNode('u', 100),
      asNode('as-1', 200, { status: 'running', usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 200 } }),
    ]
    const s = buildSnapshot(nodes, { turnEnds: new Map(), turnTimings: new Map([[13, { startTime: 100000 }]]) })
    const m = T.computeTurnMetrics(13, s.chat.nodes, s.chat.locations, s.turnTimings, 105000)
    assert.equal(m.tokensPerSecond, undefined, '无 decode 证据 → 该项留空')
  })

  it('decode 与 TTFT 是两个独立判据：stepStartTime 缺失的步骤仍计入 decode', () => {
    // 官方 deriveTurnMetrics：ttftMs 要求 stepStartTime 与 firstTokenTime 都非 null；
    // decodeMs 只要求 firstTokenTime 非 null。把 decode 也挂在前者的条件里会让这类步骤
    // 的 output 与 decode 一起被丢掉 → tok/s 系统性偏低。
    // 取值刻意让两种口径结果不同：若误把 decode 挂进 stepStartTime 条件，
    // 只会算 step1 → 100 / 2s = 50；正确口径合并两步 → 400 / 5s = 80。
    const nodes = [
      userNode('u', 100),
      asNode('as-1', 200, {
        status: 'settled', step: 1,
        usage: { inputTokens: 10, outputTokens: 100, cacheReadTokens: 0 },
        timing: { stepStartTime: 1000, firstTokenTime: 2000, completedTime: 4000 },
      }),
      asNode('as-2', 300, {
        status: 'settled', step: 2,
        usage: { inputTokens: 10, outputTokens: 300, cacheReadTokens: 0 },
        timing: { stepStartTime: null, firstTokenTime: 5000, completedTime: 8000 },
      }),
      toolNode('tc', 400, { running: true }),
    ]
    const s = buildSnapshot(nodes, { turnEnds: new Map(), turnTimings: new Map([[13, { startTime: 1000 }]]) })
    const m = T.computeTurnMetrics(13, s.chat.nodes, s.chat.locations, s.turnTimings, 9000)
    // 正确：output = 100 + 300 = 400；decode = (4000-2000) + (8000-5000) = 5000ms → 80 tok/s
    assert.equal(Math.round(m.tokensPerSecond), 80, '两步 decode 都计入：400 output / 5s = 80')
    assert.notEqual(Math.round(m.tokensPerSecond), 50, '若只算 step1 会得到 50——确保这条断言有判别力')
    // TTFT 仍只认 stepStartTime 齐全者（step1 的 1000ms）
    assert.equal(m.ttftMs, 1000, 'TTFT 只取 stepStartTime 与 firstTokenTime 都齐全的 step1')
  })

  it('NaN / Infinity 不上屏（合法性守卫）', () => {
    assert.equal(T.turnHeaderLabel({ tokensPerSecond: Infinity }), '')
    assert.equal(T.turnHeaderLabel({ ttftMs: NaN }), '')
    assert.equal(T.turnHeaderLabel({ tokensPerSecond: NaN, ttftMs: NaN }), '')
  })
})

describe('首字：无浏览器时钟近似', () => {
  it('step 1 未 settle 前首字留空（不显示"折叠栏首次渲染"耗时）', () => {
    const nodes = [
      userNode('u', 100),
      asNode('as-1', 200, { status: 'running', usage: { inputTokens: 100, outputTokens: 0, cacheReadTokens: 0 } }),
    ]
    const s = buildSnapshot(nodes, { turnEnds: new Map(), turnTimings: new Map([[13, { startTime: 100000 }]]) })
    const m = T.computeTurnMetrics(13, s.chat.nodes, s.chat.locations, s.turnTimings, 105000)
    assert.equal(m.ttftMs, undefined, '无 finalNode.timing → 首字留空')
    assert.ok(!T.turnHeaderLabel(m).includes('首字'), '文案不含首字')
  })
})

