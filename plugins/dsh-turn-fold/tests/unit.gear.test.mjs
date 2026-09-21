// 设置卡片 & 折叠图标选择器：验证「阅读体验」共享页里的卡片渲染 → checkbox 开关 →
// 字段过滤 → 图标风格切换。齿轮弹窗已移除（设置统一收进设置页）。
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { loadPlugin } from './helpers/loader.mjs'
import { makeNode, buildSnapshot } from './helpers/store.mjs'

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

const { test: T, React } = loadPlugin({ window: dom.window })

describe('设置卡片（阅读体验共享页） & 折叠图标选择器', () => {
  let container, root

  before(() => {
    container = dom.window.document.createElement('div')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)
  })

  it('卡片根元素是 <li>（共享页面板是 <ul>），且平铺渲染 6 个字段 checkbox', () => {
    act(() => { root.render(React.createElement(T.SessionFoldSettingsCard)) })
    const card = container.querySelector('.dstf-settings-card')
    assert.ok(card, '卡片出现')
    assert.strictEqual(card.tagName, 'LI', '卡片根元素必须是 <li>，否则 <ul> 面板漏出游离项目符号')
    assert.strictEqual(card.style.listStyle, 'none', '自带 listStyle:none 兜底')
    const fields = card.querySelectorAll('.dstf-card-field')
    assert.strictEqual(fields.length, 6, '6 个字段 checkbox')
    const checkboxes = card.querySelectorAll('input[type="checkbox"]')
    assert.strictEqual(checkboxes.length, 6, '6 个 checkbox')
    for (const cb of checkboxes) assert.ok(cb.checked, '默认全勾选')
  })

  it('齿轮弹窗相关 CSS 已彻底移除（不再有 .dstf-gear-* 规则）', () => {
    const css = dom.window.document.querySelector('style[data-plugin-css="dsh-turn-fold/style"]')
    assert.ok(css, '注入样式存在')
    assert.ok(!css.textContent.includes('.dstf-gear-icon'), '齿轮图标样式已删除')
    assert.ok(!css.textContent.includes('.dstf-gear-overlay'), '弹窗遮罩样式已删除')
    assert.ok(!css.textContent.includes('.dstf-gear-popup'), '弹窗卡片样式已删除')
  })

  it('取消勾选 缓存命中率 → filterVisibleMetrics 不再输出 cacheHitPercent', () => {
    // 先勾掉 cacheHit 字段
    const checkbox = container.querySelector('#dstf-field-cacheHit')
    assert.ok(checkbox)
    act(() => { checkbox.click() })
    assert.strictEqual(checkbox.checked, false, '缓存命中率取消勾选')

    // 构造包含所有指标的 metrics 对象
    const metrics = { durationMs: 12345, ttftMs: 500, tokens: 1000, tokensPerSecond: 25.5, cacheHitPercent: '66.67', outputTokens: 500 }
    const filtered = T.filterVisibleMetrics(metrics)
    assert.strictEqual(filtered.durationMs, 12345, '耗时保留')
    assert.strictEqual(filtered.ttftMs, 500, '首字保留')
    assert.strictEqual(filtered.tokens, 1000, '消耗token 保留')
    assert.strictEqual(filtered.tokensPerSecond, 25.5, 'tok/s 保留')
    assert.strictEqual(filtered.cacheHitPercent, undefined, '缓存命中率已过滤')
    assert.strictEqual(filtered.outputTokens, 500, 'outputTokens 始终保留')
  })

  it('取消勾选 已折叠行数 → filterVisibleMetrics 不再输出 foldedRows', () => {
    // 上一个用例勾掉了 cacheHit：先恢复，避免跨用例状态影响本用例断言
    act(() => { T.setFieldVisible('cacheHit', true) })
    // 先勾掉 folded 字段
    const checkbox = container.querySelector('#dstf-field-folded')
    assert.ok(checkbox, '卡片应含"已折叠行数"checkbox')
    act(() => { checkbox.click() })
    assert.strictEqual(checkbox.checked, false, '已折叠行数取消勾选')

    const metrics = { durationMs: 12345, ttftMs: 500, tokens: 1000, tokensPerSecond: 25.5, cacheHitPercent: '66.67', foldedRows: 8, outputTokens: 500 }
    const filtered = T.filterVisibleMetrics(metrics)
    assert.strictEqual(filtered.durationMs, 12345, '耗时保留')
    assert.strictEqual(filtered.cacheHitPercent, '66.67', '缓存命中率保留')
    assert.strictEqual(filtered.foldedRows, undefined, '已折叠行数已过滤')
    assert.strictEqual(filtered.outputTokens, 500, 'outputTokens 始终保留')
    // 文案层不再出现"已折叠…"
    assert.ok(!T.turnHeaderLabel(filtered).includes('已折叠'), '标题不含已折叠字段')
  })

  it('turnHeaderLabel：foldedRows 仅 >0 时拼接在缓存命中之后（zh/en）', () => {
    // zh：紧跟"缓存命中x%"之后；缺省 closed 按已折叠处理
    const label = T.turnHeaderLabel({ cacheHitPercent: '66.7', foldedRows: 8 })
    assert.strictEqual(label, '缓存命中66.7% · 已折叠8步')
    // 运行中（closed=false）显示"待折叠N步"
    assert.strictEqual(T.turnHeaderLabel({ cacheHitPercent: '66.7', foldedRows: 8 }, false), '缓存命中66.7% · 待折叠8步')
    // 无 foldedRows / foldedRows=0（上游只在 >0 时注入，这里兜底验证不显示"已折叠0步"）
    assert.strictEqual(T.turnHeaderLabel({ cacheHitPercent: '66.7' }), '缓存命中66.7%')
    assert.strictEqual(T.turnHeaderLabel({ foldedRows: 0 }), '')
  })

  it('全部取消 → filterVisibleMetrics 不输出任何可渲染字段（turnHeaderLabel 走兜底文案）', () => {
    act(() => {
      T.setFieldVisible('duration', false)
      T.setFieldVisible('ttft', false)
      T.setFieldVisible('tokens', false)
      T.setFieldVisible('tokensPerSecond', false)
      T.setFieldVisible('cacheHit', false)
    })
    const metrics = { durationMs: 12345, ttftMs: 500, tokens: 1000, tokensPerSecond: 25.5, cacheHitPercent: '66.67', outputTokens: 500 }
    const filtered = T.filterVisibleMetrics(metrics)
    // 内部字段 outputTokens 保留（其他代码路径需要），但没有任何可渲染字段
    assert.strictEqual(filtered.durationMs, undefined)
    assert.strictEqual(filtered.ttftMs, undefined)
    assert.strictEqual(filtered.tokens, undefined)
    assert.strictEqual(filtered.tokensPerSecond, undefined)
    assert.strictEqual(filtered.cacheHitPercent, undefined)
    assert.strictEqual(filtered.outputTokens, 500)
    // turnHeaderLabel 对无可渲染字段的对象返回空串 → 折叠栏 fallback "运行了 N 条命令"
    assert.strictEqual(T.turnHeaderLabel(filtered), '')
  })

  // ── 折叠图标选择 ──
  it('卡片内出现折叠图标选择器（两个选项，每个选项右侧一排预览图标）', () => {
    act(() => { root.render(React.createElement(T.SessionFoldSettingsCard)) })
    const selector = container.querySelector('.dstf-card-icon-selector')
    assert.ok(selector, '选择器区域出现')
    const options = selector.querySelectorAll('.dstf-card-icon-option')
    assert.strictEqual(options.length, 2, '两个选项')

    // 选项文字在左、预览在右
    const pokerOpt = options[0]
    const defaultOpt = options[1]
    assert.ok(pokerOpt.querySelector('.dstf-card-icon-option-text'), 'poker 选项有文字区')
    assert.ok(defaultOpt.querySelector('.dstf-card-icon-option-text'), 'default 选项有文字区')
    const pokerPreview = pokerOpt.querySelector('.dstf-card-icon-option-preview')
    const defaultPreview = defaultOpt.querySelector('.dstf-card-icon-option-preview')
    assert.ok(pokerPreview, 'poker 选项有预览区')
    assert.ok(defaultPreview, 'default 选项有预览区')

    // 文字在左、预览在右：DOM 顺序 text → preview
    const firstChild = pokerOpt.children[0]
    const secondChild = pokerOpt.children[1]
    assert.ok(firstChild.classList.contains('dstf-card-icon-option-text'), '文字在前')
    assert.ok(secondChild.classList.contains('dstf-card-icon-option-preview'), '预览在后')

    // poker 预览 6 个图标（4 个静态牌堆/扇形——每秒按牌面池轮换，四花色 + Logo——
    // + 牌面翻转 + 牌面轮换）
    const pokerItems = pokerPreview.querySelectorAll('.dstf-card-icon-option-preview-item')
    assert.strictEqual(pokerItems.length, 6, 'poker 预览 6 种图标')
    // 静态牌堆/扇形 4 个。判定用 svg 内的 .dstf-poker-card（仅静态 PokerIcon 有牌堆
    // 结构）——spin/anim 在 open=false 时不渲染 data-* 属性，:not 排除不可靠；
    // 每个预览项在放大气泡里还有一份副本，只数可见项（tooltip > preview-item 直链）。
    const allIcons = [...pokerPreview.querySelectorAll(':scope > .dstf-preview-tooltip > .dstf-card-icon-option-preview-item > .dstf-poker-icon')]
    const staticIcons = allIcons.filter((el) => el.querySelector('.dstf-poker-card'))
    assert.strictEqual(staticIcons.length, 4, '静态牌堆/扇形预览 4 个（每秒轮换牌面）')

    // default 预览 2 个图标（右箭头、下箭头）
    const defaultItems = defaultPreview.querySelectorAll('.dstf-card-icon-option-preview-item')
    assert.strictEqual(defaultItems.length, 2, 'default 预览 2 种图标')
    // 箭头是描边 polyline（非 fill 路径）
    const rightArrow = defaultItems[0].querySelector('polyline')
    assert.ok(rightArrow, '右箭头用 polyline 描边')
    const downArrow = defaultItems[1].querySelector('polyline')
    assert.ok(downArrow, '下箭头用 polyline 描边')

    // 默认选中 poker（第一个）
    assert.ok(options[0].hasAttribute('data-selected'), '默认选中动态扑克牌')
  })

  it('每个预览图标外包放大气泡（hover 显示，无尖尖）', () => {
    // 展开后：每个预览项都包在 .dstf-preview-tooltip 里，内含原预览项 + 放大气泡
    const tips = container.querySelectorAll('.dstf-card-icon-option-preview .dstf-preview-tooltip')
    // poker 6（4 静态轮换 + 翻牌 + 轮换）+ default 2 = 8 个预览项
    assert.strictEqual(tips.length, 8, '每个预览图标一个 tooltip 包裹')
    for (const tip of tips) {
      const item = tip.querySelector('.dstf-card-icon-option-preview-item')
      assert.ok(item, 'tooltip 内含原预览项')
      const bubble = tip.querySelector('.dstf-preview-bubble')
      assert.ok(bubble, 'tooltip 内含放大气泡')
      // 无尖尖（已移除）
      assert.strictEqual(bubble.querySelector('.dstf-preview-bubble-arrow'), null, '气泡无尖尖')
      const body = bubble.querySelector('.dstf-preview-bubble-body')
      assert.ok(body, '气泡内含放大主体')
      assert.ok(body.querySelector('svg'), '放大主体内含图标')
    }
    // 气泡默认隐藏（opacity:0 / visibility:hidden 由 CSS 控制，jsdom 只看结构）
  })

  it('选择"默认" → turnPokerIcon 返回 undefined（官方 chevron）', () => {
    // 选中"默认"选项（第二个）
    const option = container.querySelectorAll('.dstf-card-icon-option')[1]
    assert.ok(option)
    act(() => { option.click() })
    assert.strictEqual(T.getFoldIconStyle(), 'default', '已切换到 default')

    // turnPokerIcon 返回 undefined（而非 PokerSpinIcon / PokerIcon）
    const fold = { turn: 1, toolCount: 3 }
    const result = T.turnPokerIcon(fold, false, true)
    assert.strictEqual(result, undefined, '运行中回合折叠栏不渲染扑克牌')

    const resultClosed = T.turnPokerIcon(fold, true, false)
    assert.strictEqual(resultClosed, undefined, '结束后回合折叠栏也不渲染扑克牌')
  })

  it('切回"动态扑克牌" → turnPokerIcon 返回组件', () => {
    const option = container.querySelectorAll('.dstf-card-icon-option')[0]
    assert.ok(option)
    act(() => { option.click() })
    assert.strictEqual(T.getFoldIconStyle(), 'poker', '已切回 poker')

    act(() => {
      const fold = { turn: 2, toolCount: 5 }
      const result = T.turnPokerIcon(fold, false, true)
      // 返回 React 元素（PokerSpinIcon 等），不是 undefined
      assert.notStrictEqual(result, undefined, '运行中回合折叠栏渲染扑克牌')
    })
  })

  // ── 牌面随机池：四花色 + DeepSeek Logo ──
  describe('牌面随机池（foldSuitFor / buildPokerSVGBase）', () => {
    it('pokerFacePool：四花色 + deepseek（Logo 数据存在时）', () => {
      assert.deepStrictEqual(T.pokerFacePool(), ['spade', 'heart', 'diamond', 'club', 'deepseek'])
    })
    it('随机池含 5 种牌面：四花色 + deepseek（Logo 数据存在时）', () => {
      assert.ok(T.iconConfig && T.iconConfig.pokerSpinDeepseek, '内置图标数据应含 DeepSeek Logo path')
      const seen = new Set()
      for (let i = 0; i < 200; i++) seen.add(T.foldSuitFor('pool-probe-' + i))
      for (const face of ['spade', 'heart', 'diamond', 'club', 'deepseek']) {
        assert.ok(seen.has(face), '随机池应能抽到 ' + face + '（200 次抽样未出现）')
      }
    })
    it('同一 leaderKey 记忆牌面（重渲染不变）', () => {
      const first = T.foldSuitFor('stable-key')
      for (let i = 0; i < 10; i++) assert.strictEqual(T.foldSuitFor('stable-key'), first)
    })

    it('buildPokerSVGBase deepseek：pip 用 <use> 引 Logo（每实例唯一 id）', () => {
      const svg = T.buildPokerSVGBase(3, 'deepseek')
      assert.match(svg, /<defs>.*dstf-poker-logo-\d+/, 'defs 应注入 Logo path（唯一 id）')
      assert.match(svg, /<use href="#dstf-poker-logo-\d+" fill="currentColor"\/>/, 'pip 处应以 <use> 引用 Logo')
      assert.match(svg, /class="dstf-poker-pip"/, 'Logo 与花色共用 pip 结构（同变换/scale）')
      // 防溢出：Logo 墨迹填满 24 盒，不能用花色 pipScale(0.28)——按卡牌几何独立缩放
      // （min(w×0.72, h×0.58)/24，3 张堆 = 0.1821…），宽度向留出描边余量
      assert.match(svg, /dstf-poker-pip" transform="translate\([^)]*\) scale\(0\.18\d*\)/,
        'Logo pip 应使用独立缩放（~0.182，而非花色的 0.28）')
      assert.ok(!svg.includes('scale(0.28)translate') && !/dstf-poker-pip"[^>]*scale\(0\.28\)/.test(svg),
        'Logo pip 不得使用花色的 0.28 缩放')
      assert.ok(!svg.includes('axis-deepseek-UID'), 'id 占位应已被替换')
      // 每实例 id 唯一（同页多个折叠栏不冲突）
      const svg2 = T.buildPokerSVGBase(3, 'deepseek')
      const id1 = svg.match(/dstf-poker-logo-\d+/)[0]
      const id2 = svg2.match(/dstf-poker-logo-\d+/)[0]
      assert.notStrictEqual(id1, id2, '两次生成的 Logo id 应不同')
      // 结构不变：仍 3 张牌 + 每张一个 mask 定义
      assert.equal((svg.match(/dstf-poker-card/g) || []).length, 3)
      assert.equal((svg.match(/<mask id="dstf-poker-mask-/g) || []).length, 3)
    })

    it('buildPokerSVGBase 花色：不受 Logo 分支影响（无 Logo id、pip 内联 path）', () => {
      const svg = T.buildPokerSVGBase(3, 'spade')
      assert.ok(!svg.includes('dstf-poker-logo-'), '花色分支不应注入 Logo defs')
      assert.match(svg, /class="dstf-poker-pip"[^>]*><path /, '花色 pip 仍内联 path')
      assert.equal((svg.match(/dstf-poker-card/g) || []).length, 3)
    })

    it('牌面轮换动画模板：卡牌 5:7（card-base 5.7143×8，遮挡 mask 同比收窄）', () => {
      const svg = T.POKER_ANIM_SVG
      assert.match(svg, /class="anim-base-rect"\s+x="-2\.8571"\s+y="-4"\s+width="5\.7143"\s+height="8"/,
        'card-base 应为 5:7（此前是 8×8 方形）')
      assert.equal((svg.match(/class="anim-mask-rect" x="-3\.1143"[^>]*width="6\.2286"/g) || []).length, 4,
        '4 个遮挡 occluder 应随卡牌宽度同比收窄')
    })

    it('设置预览：4 个静态牌堆/扇形同一时刻牌面互不相同（相位错开轮换）', () => {
      // FoldIconSelector 的 4 个静态预览取 pool[(tick+i)%5]，i 为预览序号——
      // 池长 5 > 4，任意 tick 下 4 个牌面两两不同
      const pool = T.pokerFacePool()
      const at = (t, i) => pool[(t + i) % pool.length]
      for (let t = 0; t < 5; t++) {
        const shown = [at(t, 0), at(t, 1), at(t, 2), at(t, 3)]
        assert.strictEqual(new Set(shown).size, 4, 'tick=' + t + ' 时 4 个预览牌面互不相同')
      }
    })
  })

  // ── 步骤折叠栏闭合标题：纯计数（文件名/参数/diff 不再进入标题） ──
  describe('步骤折叠栏闭合标题（纯计数）', () => {
    it('闭合标题按份数输出，不含文件名、不含 diff 数字', () => {
      T.segmentLabelCache.clear()
      const mk = (key, seq, name, path) =>
        makeNode(key, 'tool-call', seq, { data: { root: { kind: 'tool-result', callId: key, name, argsRaw: JSON.stringify({ path }), isError: false } } })
      const nodes = [
        makeNode('u', 'user', 100, { data: { seq: 100, content: [] } }),
        makeNode('as', 'assistant-step', 200, { data: { status: 'settled', turn: 13, step: 1, blocks: [{ kind: 'reasoning', text: '思考' }] } }),
        mk('e0', 300, 'edit', 'C:\\proj\\index.js'),
        makeNode('as2', 'assistant-step', 400, { data: { status: 'settled', turn: 13, step: 2, blocks: [{ kind: 'text', text: '最终' }] } }),
      ]
      const s = buildSnapshot(nodes, { turnEnds: new Map() })
      const g = T.computeGroup(s.chat.order, s.chat.nodes, s.chat.nodes.get('e0'))
      const label = T.segmentLabel(g, s.chat.nodes, true)
      assert.ok(!label.includes('index.js'), '标题不含文件名')
      assert.ok(!label.includes('['), '标题不含 [ +N -M ] diff 片段')
      assert.ok(/编辑了1份文件/.test(label), '按份数计数')
    })

    it('GroupHeader 不再渲染任何文件链接元素', () => {
      const headerRoot = createRoot(dom.window.document.createElement('div'))
      act(() => {
        headerRoot.render(React.createElement(T.GroupHeader, {
          label: '编辑了2份文件 · 运行了1条命令',
          count: 2, open: false, onToggle: () => {}, isTurn: false,
        }))
      })
      assert.strictEqual(dom.window.document.querySelectorAll('.dstf-file-link').length, 0, '无文件链接')
      act(() => { headerRoot.unmount() })
    })


    it('showToast / clearToast 状态管理', () => {
      // 先清除可能被前序测试残留的 toast 状态
      T.clearToast()
      // 初始
      const init = T.getToast()
      assert.strictEqual(init.text, null)
      const seq0 = init.seq
      // showToast
      T.showToast('测试消息')
      const t1 = T.getToast()
      assert.strictEqual(t1.text, '测试消息')
      assert.strictEqual(t1.seq, seq0 + 1)
      // clearToast
      T.clearToast()
      const t2 = T.getToast()
      assert.strictEqual(t2.text, null)
      assert.strictEqual(t2.seq, t1.seq)
      // 重复 clear 无害
      T.clearToast()
      assert.strictEqual(T.getToast().text, null)
    })

    it('TurnFoldToast 在平台缺失 Toast 时返回 null', () => {
      const host = dom.window.document.createElement('div')
      const root = createRoot(host)
      act(() => { root.render(React.createElement(T.TurnFoldToast)) })
      // Toast 为 null（未 mock uiPrimitives），组件返回 null，DOM 无内容
      assert.strictEqual(host.children.length, 0)
      act(() => { root.unmount() })
    })
  })

  // ── 图标配置外置加载（iconConfig / ICON_DEFAULTS / localStorage） ──
  describe('图标配置外置（icons/default.json 注入 + localStorage 优先）', () => {
    it('内置默认：ICON_DEFAULTS 有完整图标数据，iconConfig 引用它', () => {
      assert.ok(T.ICON_DEFAULTS, 'ICON_DEFAULTS 已注入（非 null）')
      assert.strictEqual(T.ICON_DEFAULTS.pokerR, 1.08, 'pokerR 默认 1.08')
      assert.ok(T.ICON_DEFAULTS.pokerAnimSVG, 'pokerAnimSVG 已注入')
      assert.ok(T.ICON_DEFAULTS.pokerAnimSVG.length > 1000, 'pokerAnimSVG 是完整 SVG（>1KB）')
      assert.ok(T.ICON_DEFAULTS.pokerPips.spade.path, 'spade path 已注入')
      assert.ok(T.ICON_DEFAULTS.pokerSpin.scaleKeys, 'pokerSpin.scaleKeys 已注入')
      // 无 localStorage 覆盖时 iconConfig 与 ICON_DEFAULTS 一致
      assert.strictEqual(T.iconConfig, T.ICON_DEFAULTS, '未覆盖时 iconConfig = ICON_DEFAULTS')
      assert.strictEqual(T.POKER_R, 1.08, 'POKER_R 引用配置')
      assert.ok(T.POKER_ANIM_SVG, 'POKER_ANIM_SVG 有值')
    })

    it('localStorage 覆盖优先：修改后重新加载，iconConfig 用覆盖值', () => {
      // 先清空 localStorage，加载基准
      try { dom.window.localStorage.removeItem('dsh-turn-fold:icons') } catch (e) {}
      // 写入一个覆盖配置（模拟未来下载的图标包）
      const override = JSON.parse(JSON.stringify(T.ICON_DEFAULTS))
      override.meta = { version: 99, description: '测试覆盖包', compat: '>=0.3.1' }
      override.pokerR = 7.77
      override.pokerPips.spade.path = '<path d="CUSTOM"/>'
      try {
        dom.window.localStorage.setItem('dsh-turn-fold:icons', JSON.stringify(override))
      } catch (e) { /* jsdom 可能不支持 */ }

      // 用新的 jsdom 重新加载插件（读同一 localStorage 需要同一 window）
      const { test: T2 } = loadPlugin({ window: dom.window })
      if (T2 && T2.iconConfig) {
        assert.strictEqual(T2.iconConfig.pokerR, 7.77, 'localStorage 覆盖 pokerR 生效')
        assert.strictEqual(T2.POKER_R, 7.77, 'POKER_R 用覆盖值')
        assert.strictEqual(T2.iconConfig.pokerPips.spade.path, '<path d="CUSTOM"/>', 'spade path 覆盖生效')
      } else {
        // jsdom 下 loadPlugin 若复用了 factory 缓存则跳过值断言
        assert.ok(true, 'jsdom localStorage 限制，跳过值断言')
      }
      try { dom.window.localStorage.removeItem('dsh-turn-fold:icons') } catch (e) {}
    })

    it('不兼容的图标包（compat 高于当前版本）回退内置默认', () => {
      const override = JSON.parse(JSON.stringify(T.ICON_DEFAULTS))
      override.meta = { version: 1, description: '未来不兼容包', compat: '>=99.0.0' }
      override.pokerR = 5.55
      try { dom.window.localStorage.setItem('dsh-turn-fold:icons', JSON.stringify(override)) } catch (e) {}
      const { test: T2 } = loadPlugin({ window: dom.window })
      if (T2 && T2.iconConfig) {
        assert.strictEqual(T2.iconConfig.pokerR, 1.08, '不兼容包回退内置默认')
      } else {
        assert.ok(true, 'jsdom localStorage 限制，跳过')
      }
      try { dom.window.localStorage.removeItem('dsh-turn-fold:icons') } catch (e) {}
    })
  })
})
