// CSS 测试：验证 client.js 注入的样式规则在真实 DOM 上生效——
// 被折叠的成员 flowItem（含 [data-dstf-hidden] 标记）display:none，
// 展开（移除标记）恢复显示，再次收起重新隐藏。
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { loadPlugin } from './helpers/loader.mjs'

const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')

function makeFlowItem(doc, kind, contentHtml) {
  const el = doc.createElement('div')
  el.setAttribute('data-chat-flow-kind', kind)
  const slot = doc.createElement('div')
  slot.setAttribute('data-slot', 'conversation.chat.node')
  slot.style.display = 'contents'
  slot.innerHTML = contentHtml
  el.appendChild(slot)
  return el
}

describe('CSS 折叠隐藏规则', () => {
  const { document } = loadPlugin()

  it('注入的 style 标签包含 :has() 隐藏规则', () => {
    const tag = document.querySelector('style[data-plugin-css="dsh-turn-fold/style"]')
    assert.ok(tag, '插件应注入 style 标签')
    const css = tag.textContent
    assert.match(css, /\[data-chat-flow-kind\]:has\(\[data-dstf-hidden\]\)\{display:none\}/)
    assert.match(css, /\[data-dstf-turn-folded\] \[data-variant="think"\]\{display:none\}/)
  })

  it('注入的 style 标签包含回合折叠栏分隔线规则（折叠栏与内容之间的水平细线）', () => {
    const tag = document.querySelector('style[data-plugin-css="dsh-turn-fold/style"]')
    const css = tag.textContent
    assert.match(css, /\.dstf-turn-divider\{height:1px/, '分隔线应为 1px 水平细线')
    assert.match(css, /\.dstf-group-root\[data-dstf-open\]:not\(\[data-dstf-turn\]\) > \.dstf-fold-clip\{margin-top:16px\}/,
      '展开间距应挂在直接子元素 .dstf-fold-clip 上（16px，排除回合栏）——header 在 DisclosureRow 内部 DOM，挂 header 无法既命中又不跨层泄漏')
    assert.doesNotMatch(css, /\.dstf-group-root\[data-dstf-open\][^{]*\.dstf-header\{margin/,
      '不得再用 header 承载展开间距（后代选择器跨层泄漏 / > 选择器匹配不上 DisclosureRow 内部 DOM）')
    // 防跳动：fold-clip 的 margin-top 参与过渡（收起时 16px 间距随高度一起动画，
    // 不在收起开始瞬间瞬跳）
    assert.match(css, /transition:grid-template-rows \.28s[^}]*margin-top \.28s/, 'fold-clip 过渡应包含 margin-top')
    // dock 占位条横向几何：官方 dock 卡片同款收束（内容宽度为上限、居中），
    // 否则宽栏里拉满整行、左缘贴侧边栏（bug：回合空窗占位条出现在左下角）
    assert.match(css, /\.dstf-group-root\[data-dstf-placeholder\]\{margin-top:16px\}/, '占位栏应补 16px 上间距与正式栏 flow gap 对齐')
    // 0 秒占位栏与正式回合栏的位置接续：占位栏渲染在 user 消息的 flowItem 内（正下方、
    // 无间距），正式回合栏在下一个 flowItem 顶部（官方 column 有 16px flow gap）——
    // 占位栏补 16px 上间距，交接瞬间位置逐像素一致、不跳变
    assert.match(css, /\.dstf-group-root\[data-dstf-placeholder\]\{margin-top:16px\}/, '占位栏应补 16px 上间距与正式栏 flow gap 对齐')
    assert.doesNotMatch(css, /\.dstf-dock-run/, '输入区 dock 占位条已移除（占位回 user 消息正下方，避免跑到状态描述行下面）')
  })

  it('展开间距不跨层泄漏：回合嵌套段自己的 fold-clip 命中 16px，回合的不命中', () => {
    // 结构模拟真实 DOM：header 在 DisclosureRow 内部包装层里（非 group-root 直接子元素）
    const turn = document.createElement('div')
    turn.className = 'dstf-group-root'
    turn.setAttribute('data-dstf-turn', 'true')
    turn.setAttribute('data-dstf-open', 'true')
    turn.innerHTML =
      '<div class="disclosure-wrap"><div class="dstf-header">回合折叠栏</div></div>' +
      '<div class="dstf-turn-divider"></div>' +
      '<div class="dstf-fold-clip dstf-fold-clip-open"><div class="dstf-fold-body">' +
        '<div class="dstf-group-root" data-dstf-open="true">' +
          '<div class="disclosure-wrap"><div class="dstf-header">步骤折叠栏</div></div>' +
          '<div class="dstf-fold-clip dstf-fold-clip-open"><div class="dstf-fold-body">成员行</div></div>' +
        '</div>' +
      '</div></div>'
    document.body.appendChild(turn)
    const clips = turn.querySelectorAll('.dstf-fold-clip')
    assert.equal(clips.length, 2)
    assert.equal(parseInt(document.defaultView.getComputedStyle(clips[0]).marginTop, 10), 0,
      '回合折叠栏的 fold-clip 不应获得 16px（间距由分隔线承担）')
    assert.equal(parseInt(document.defaultView.getComputedStyle(clips[1]).marginTop, 10), 16,
      '嵌套步骤折叠栏自己的 fold-clip 应获得 16px（与成员间距同节奏）')
    document.body.removeChild(turn)
  })

  it('注入的 style 标签包含滚轮数字规则与 sr-only 规则', () => {
    const tag = document.querySelector('style[data-plugin-css="dsh-turn-fold/style"]')
    const css = tag.textContent
    assert.match(css, /\.dstf-roll-cell\{display:inline-block;width:1ch;height:1em;overflow:hidden/, '数位视窗应裁切为 1ch×1em')
    assert.match(css, /\.dstf-roll-strip\{display:flex;flex-direction:column\}/, '数字条竖排 0-9')
    assert.match(css, /\.dstf-sr-only\{position:absolute;width:1px;height:1px/, 'sr-only 完整文案应视觉隐藏')
  })

  it('成员含 hidden 标记 → flowItem display:none（收起状态）', () => {
    const el = makeFlowItem(document, 'tool-call', '<span data-dstf-hidden="true" style="display:none"></span>')
    document.body.appendChild(el)
    const cs = document.defaultView.getComputedStyle(el)
    assert.equal(cs.display, 'none')
    document.body.removeChild(el)
  })

  it('无 hidden 标记 → flowItem 正常显示（展开状态）', () => {
    const el = makeFlowItem(document, 'tool-call', '<div class="tool-card">content</div>')
    document.body.appendChild(el)
    const cs = document.defaultView.getComputedStyle(el)
    assert.notEqual(cs.display, 'none')
    document.body.removeChild(el)
  })

  it('回归 Bug2 场景（CSS 层面）：展开 → 收起 → 重新隐藏', () => {
    const el = makeFlowItem(document, 'tool-call', '<span data-dstf-hidden="true" style="display:none"></span>')
    document.body.appendChild(el)
    const slot = el.querySelector('[data-slot]')
    assert.equal(document.defaultView.getComputedStyle(el).display, 'none', '初始收起')
    // 模拟展开：替换内容为卡片
    slot.innerHTML = '<div class="tool-card">card</div>'
    assert.notEqual(document.defaultView.getComputedStyle(el).display, 'none', '展开后显示')
    // 模拟收起：替换回 hidden 标记
    slot.innerHTML = '<span data-dstf-hidden="true" style="display:none"></span>'
    assert.equal(document.defaultView.getComputedStyle(el).display, 'none', '收起后重新隐藏')
    document.body.removeChild(el)
  })

  it('无 hidden 标记的普通节点（user 等）不受影响', () => {
    const el = makeFlowItem(document, 'user', '<div class="user-msg">用户消息</div>')
    document.body.appendChild(el)
    const cs = document.defaultView.getComputedStyle(el)
    assert.notEqual(cs.display, 'none', '不含 hidden 标记的节点不应被隐藏')
    document.body.removeChild(el)
  })

  it('规则对任意 kind 的成员生效（assistant-step 成员同样隐藏）', () => {
    const el = makeFlowItem(document, 'assistant-step', '<span data-dstf-hidden="true" style="display:none"></span>')
    document.body.appendChild(el)
    assert.equal(document.defaultView.getComputedStyle(el).display, 'none')
    document.body.removeChild(el)
  })

  it('旧的 diff / 文件名链接样式已彻底移除', () => {
    const tag = document.querySelector('style[data-plugin-css="dsh-turn-fold/style"]')
    const css = tag.textContent
    assert.ok(!css.includes('.dstf-file-link'), '文件名链接样式已删除')
    assert.ok(!css.includes('.dstf-diff'), 'diff 高亮样式已删除')
  })

  it('段外 text 正文首尾块 margin 钳制为 0（镜像官方重置，防止与 16px padding/gap 叠加）', () => {    // 模拟官方 AssistantMarkdown 结构：root > body > .markdown > p（p 自带 margin:16px 0，
    // 运行中的官方 bundle 首尾重置未必生效——插件用 >*>*>*> 结构选择器钳制）
    const el = document.createElement('div')
    el.className = 'dstf-text-only'
    el.innerHTML = '<div class="root"><div class="body"><div class="markdown">' +
      '<p style="margin:16px 0">正文段落</p>' +
      '</div></div></div>'
    document.body.appendChild(el)
    const cs = document.defaultView.getComputedStyle(el.querySelector('p'))
    assert.equal(cs.marginTop, '0px', '首块 margin-top 应被钳为 0（含覆盖内联 margin）')
    assert.equal(cs.marginBottom, '0px', '尾块 margin-bottom 应被钳为 0')
    document.body.removeChild(el)
  })

  it('text-only 内非首尾块的 margin 不受钳制（多段落内部间距保持官方值）', () => {
    const el = document.createElement('div')
    el.className = 'dstf-text-only'
    el.innerHTML = '<div><div><div class="markdown">' +
      '<p style="margin:16px 0">第一段</p>' +
      '<p style="margin:16px 0">第二段</p>' +
      '</div></div></div>'
    document.body.appendChild(el)
    const ps = el.querySelectorAll('p')
    assert.equal(document.defaultView.getComputedStyle(ps[0]).marginTop, '0px')
    assert.equal(document.defaultView.getComputedStyle(ps[1]).marginBottom, '0px')
    // 中间块的 margin 不动（此例两段互为首尾，构造三段验证中段）
    el.innerHTML = '<div><div><div class="markdown">' +
      '<p>一</p><p style="margin:16px 0">二</p><p>三</p>' +
      '</div></div></div>'
    const mid = el.querySelectorAll('p')[1]
    assert.equal(document.defaultView.getComputedStyle(mid).marginTop, '16px', '中段 margin-top 不应被钳制')
    assert.equal(document.defaultView.getComputedStyle(mid).marginBottom, '16px', '中段 margin-bottom 不应被钳制')
    document.body.removeChild(el)
  })

  it('最终总结包装器 [data-dstf-turn-folded] 首尾块 margin 同样钳制', () => {
    const el = document.createElement('div')
    el.setAttribute('data-dstf-turn-folded', 'true')
    el.innerHTML = '<div class="root"><div class="body"><div class="markdown">' +
      '<p style="margin:16px 0">最终总结</p>' +
      '</div></div></div>'
    document.body.appendChild(el)
    const cs = document.defaultView.getComputedStyle(el.querySelector('p'))
    assert.equal(cs.marginTop, '0px', '最终总结首块 margin-top 应被钳为 0')
    document.body.removeChild(el)
  })
})
