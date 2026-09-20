// jsdom 回归：思考链改成按钮触发——摘要不翻、按钮插入位置、三态切换、
// running 置灰、折叠点击自动展开、缓存规则、失败回到未翻译、开关撤按钮并还原。
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

const HTML = [
  '<!doctype html><html><body>',
  '<div data-chat-flow>',
  '  <div id="c1" data-chat-call-id="c1">',
  '    <div class="CY-8Ka_root" data-variant="bash" data-state="ok">',
  '      <span class="CY-8Ka_title">Bash</span>',
  '      <span class="CY-8Ka_summary">Run integration test suite</span>',
  '    </div>',
  '  </div>',
  '  <div id="historic" class="lcKema_root" data-variant="think" data-state="ok">',
  '    <div class="lcKema_row" data-disclosure-row aria-expanded="false">',
  '      <span class="lcKema_leading"></span>',
  '      <span class="lcKema_title">Think</span>',
  '      <span class="lcKema_separator"></span>',
  '      <span class="lcKema_summary">Historic folded summary</span>',
  '    </div>',
  '  </div>',
  '  <div id="smooth" class="_07evbq_root" data-variant="think" data-state="ok">',
  '    <div class="_07evbq_disclosureRow" data-disclosure-row aria-expanded="false">',
  '      <span class="_07evbq_thinkLeading"></span>',
  '      <span class="_07evbq_thinkTitle">Think</span>',
  '      <span class="_07evbq_thinkSummary">Smooth folded summary</span>',
  '    </div>',
  '    <div class="_07evbq_thinkBody" data-collapsed><p>Smooth body paragraph.</p></div>',
  '  </div>',
  '  <div id="running" class="lcKema_root" data-variant="think" data-state="running">',
  '    <div class="lcKema_row" data-disclosure-row data-open aria-expanded="true">',
  '      <span class="lcKema_title">Think</span>',
  '    </div>',
  '    <div class="lcKema_thinkBody"><p>Running paragraph.</p></div>',
  '  </div>',
  '  <div id="open" class="lcKema_root" data-variant="think" data-state="ok">',
  '    <div class="lcKema_row" data-disclosure-row data-open aria-expanded="true">',
  '      <span class="lcKema_title">Think</span>',
  '    </div>',
  '    <div class="lcKema_thinkBody">',
  '      <p>Stable paragraph one.</p>',
  '      <pre><code>const answer = 42;</code></pre>',
  '      <ul><li>First item text <ul><li>Nested item text</li></ul></li><li>Second item text</li></ul>',
  '      <p>Tail paragraph.</p>',
  '    </div>',
  '  </div>',
  '</div>',
  '</body></html>',
].join('');

const dom = new JSDOM(HTML, { pretendToBeVisual: true, url: 'http://127.0.0.1:3080/' });
const { window } = dom;
global.window = window; global.document = window.document;
global.MutationObserver = window.MutationObserver; global.HTMLElement = window.HTMLElement;
global.Element = window.Element; global.Node = window.Node; global.MouseEvent = window.MouseEvent;
global.localStorage = window.localStorage;

const failures = [];
function check(label, ok) {
  if (ok) { console.log('  ok   ' + label); } else { console.log('  FAIL ' + label); failures.push(label); }
}

let thinkCalls = 0;
let failText = null;
const thinkRequestMountCounts = [];
global.fetch = async (url, opts) => {
  const target = String(url);
  const body = JSON.parse(opts.body);
  if (target.includes('/translate-think')) {
    thinkCalls++;
    thinkRequestMountCounts.push(window.document.querySelectorAll('.dsh-tidy-translated-block').length);
    const results = body.blocks.map((block) => ({
      original: block,
      translated: failText !== null && block.includes(failText) ? block : '译<' + block + '>',
      ok: !(failText !== null && block.includes(failText)),
      cached: false,
      channel: 'mock',
    }));
    return { ok: true, json: async () => ({ ok: true, results }) };
  }
  if (target.includes('/translate')) {
    return {
      ok: true,
      json: async () => ({ ok: true, results: body.texts.map((text) => ({ original: text, translated: '标题<' + text + '>', channel: 'mock', cached: false })) }),
    };
  }
  return { ok: false, json: async () => ({}) };
};
window.fetch = global.fetch;

let factory = null;
window.__ModuleLoader__ = { load: (entry) => { factory = entry.factory; } };
window.eval(code);
// The settings card's ui-primitives controls are never rendered here, so the
// module table only has to answer the bundle's top-level require.
const primitivesStub = new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : () => null) });
const api = factory((id) => (id === 'react'
  ? { useState: () => [null, () => {}], useEffect: () => {} }
  : (id === '@deepseek-ai/dsh-client-ui-primitives' ? primitivesStub : null)));
api.apply({ effect: (fn) => { try { fn(); } catch (error) { console.log('[effect err]', error.message); } }, get: () => null });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => [...window.document.querySelectorAll(selector)];
const text = (selector) => $(selector)?.textContent ?? '';
const buttonOf = (card) => $(card + ' .dsh-tidy-think-button');
const buttonState = (card) => buttonOf(card)?.getAttribute('data-state');
const mountedBlocks = (scope) => window.document.querySelectorAll(scope + ' .dsh-tidy-translated-block').length;
const click = (element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const translatedTo = (selector) => $(selector + ' > .dsh-tidy-translated-block')?.textContent ?? null;

// 打开两个开关：总开关默认打开，按钮的可见性还要求 AI 已配置。
api.chatTranslateObserver.setThinkEnabled(true);
api.chatTranslateObserver.setThinkConfigured(true);
// 工具标题那条路径要等视口防抖（400ms）加批次刷新（50ms），这里一次等够。
await wait(1200);

// 1. 按钮注入
check('每张思考卡都插入了按钮', $$('.dsh-tidy-think-button').length === 4);
const historicRow = $('#historic .lcKema_row');
check(
  '按钮插在 Think 标题之后、摘要之前',
  historicRow.children[1]?.className.includes('title') &&
    historicRow.children[2]?.className.includes('think-button') &&
    historicRow.children[3]?.className.includes('separator')
);
check('未点击前一律不翻译', mountedBlocks('#open') === 0 && mountedBlocks('#smooth') === 0 && thinkCalls === 0);
check('running 卡片的按钮置灰', buttonOf('#running')?.disabled === true);
check('可点卡片的按钮可用', buttonOf('#open')?.disabled === false);
check('工具标题照常翻译', translatedTo('#c1 .CY-8Ka_summary') === '标题<Run integration test suite>');

// 2. 摘要不翻
check(
  '内核折叠摘要不翻',
  $('#historic .lcKema_summary > .dsh-tidy-translated-block') === null &&
    text('#historic .lcKema_summary') === 'Historic folded summary'
);
check('smooth-stream 摘要不翻', text('#smooth ._07evbq_thinkSummary') === 'Smooth folded summary');

// 3. running 期间点击无效
click(buttonOf('#running'));
await wait(250);
check('running 时点击不产生请求', thinkCalls === 0 && buttonState('#running') === 'idle');
check('running 时正文保持原文', mountedBlocks('#running') === 0);

// 4. 点击翻译
click(buttonOf('#open'));
check('点击后进入翻译中', buttonState('#open') === 'working');
await wait(700);
check('译文挂到段落上', translatedTo('#open .lcKema_thinkBody p') === '译<Stable paragraph one.>');
check('混合块的外层文字拆成行内片段', $('#open .dsh-tidy-run > .dsh-tidy-translated-block') !== null);
check('嵌套子列表逐项翻译', mountedBlocks('#open ul') >= 2);
check('代码块原样保留', $('#open pre code').textContent === 'const answer = 42;');
check('代码块内没有译文容器', $('#open pre .dsh-tidy-translated-block') === null);
check('翻译完成后按钮实心高亮', buttonState('#open') === 'translated');

// 5. 再点整条切回原文
click(buttonOf('#open'));
await wait(80);
const openBlocks = $$('#open .dsh-tidy-translated-block');
check('再点整条切回原文', openBlocks.length > 0 && openBlocks.every((node) => node.style.display === 'none'));
check('切换后按钮回到描边', buttonState('#open') === 'idle');

// 6. 再点一次：命中缓存，不发请求
const callsBeforeReplay = thinkCalls;
click(buttonOf('#open'));
await wait(250);
check('缓存命中不再发请求', thinkCalls === callsBeforeReplay);
check('译文重新显示', $$('#open .dsh-tidy-translated-block').every((node) => node.style.display === 'inline'));
check('按钮回到高亮', buttonState('#open') === 'translated');

// 7. 正文点击不再切换：思考链只由按钮变更
click($('#open .dsh-tidy-translated-block'));
await wait(80);
check(
  '点击译文不改动状态',
  buttonState('#open') === 'translated' &&
    $$('#open .dsh-tidy-translated-block').every((node) => node.style.display === 'inline')
);
click($('#open .dsh-tidy-original-hidden'));
await wait(80);
check('点击原文容器也不改动状态', buttonState('#open') === 'translated');

// 8. 整条命中缓存：插入即显示中文，不发请求
function appendThinkCard(id, inner) {
  const card = window.document.createElement('div');
  card.id = id;
  card.className = 'lcKema_root';
  card.dataset.variant = 'think';
  card.dataset.state = 'ok';
  card.innerHTML =
    '<div class="lcKema_row" data-disclosure-row data-open aria-expanded="true">' +
    '<span class="lcKema_leading"></span><span class="lcKema_title">Think</span></div>' +
    '<div class="lcKema_thinkBody">' + inner + '</div>';
  $('[data-chat-flow]').appendChild(card);
  return card;
}

appendThinkCard('cached', '<p>Stable paragraph one.</p>');
const callsBeforeCached = thinkCalls;
await wait(500);
check(
  '整条命中缓存时展开即显示中文',
  mountedBlocks('#cached') === 1 && buttonState('#cached') === 'translated'
);
check('没有为它发请求', thinkCalls === callsBeforeCached);

// 9. 部分命中：展开仍是原文，点按钮补齐
appendThinkCard('partial', '<p>Stable paragraph one.</p><p>Brand new paragraph.</p>');
await wait(500);
check('部分命中时展开仍是原文', mountedBlocks('#partial') === 0 && text('#partial .lcKema_thinkBody p') === 'Stable paragraph one.');
check('部分命中时按钮是描边', buttonState('#partial') === 'idle');
click(buttonOf('#partial'));
await wait(700);
check('点按钮后补齐并整条显示', mountedBlocks('#partial') === 2 && buttonState('#partial') === 'translated');

// 10. 失败：停止动画、回到未翻译
failText = 'FAILME';
appendThinkCard('fail', '<p>FAILME paragraph.</p>');
await wait(400);
click(buttonOf('#fail'));
await wait(600);
check('失败后按钮回到未翻译', buttonState('#fail') === 'idle');
check('失败时不挂译文', mountedBlocks('#fail') === 0);
failText = null;

// 11. 折叠时点击：先自动展开，再翻译
const historicRowElement = $('#historic .lcKema_row');
historicRowElement.addEventListener('click', () => {
  if (historicRowElement.hasAttribute('data-open')) return;
  historicRowElement.setAttribute('data-open', '');
  const body = window.document.createElement('div');
  body.className = 'lcKema_thinkBody';
  body.innerHTML = '<p>Historic body paragraph.</p>';
  $('#historic').appendChild(body);
});
check('折叠卡片也有按钮', buttonOf('#historic') !== null);
check('折叠时正文尚未渲染', $('#historic .lcKema_thinkBody') === null);
click(buttonOf('#historic'));
await wait(900);
check('折叠点击先自动展开', $('#historic [data-open]') !== null);
check('展开后完成翻译', mountedBlocks('#historic') === 1);
check('翻译完成后按钮高亮', buttonState('#historic') === 'translated');

// 12. 关闭开关：撤掉按钮并还原
api.chatTranslateObserver.setThinkEnabled(false);
await wait(300);
check('关闭后按钮全部撤掉', $$('.dsh-tidy-think-button').length === 0);
check('关闭后思考译文全部还原', mountedBlocks('#open') === 0 && mountedBlocks('#historic') === 0);
check('关闭后工具标题译文不受影响', translatedTo('#c1 .CY-8Ka_summary') === '标题<Run integration test suite>');

// 13. AI 未配置：不注入按钮
api.chatTranslateObserver.setThinkEnabled(true);
api.chatTranslateObserver.setThinkConfigured(false);
await wait(300);
check('AI 未配置时不注入按钮', $$('.dsh-tidy-think-button').length === 0);
api.chatTranslateObserver.setThinkConfigured(true);
await wait(500);
check('配置恢复后按钮回来', $$('.dsh-tidy-think-button').length >= 7);

// 14. 多单位：一次点击分成多次请求，前一批先挂载
let bulkInner = '';
for (let index = 0; index < 24; index++) {
  bulkInner += '<p>Bulk paragraph ' + index + ' ' + 'word '.repeat(60).trim() + '</p>';
}
appendThinkCard('bulk', bulkInner);
await wait(500);
check('多单位卡片默认不翻译', mountedBlocks('#bulk') === 0);
thinkRequestMountCounts.length = 0;
click(buttonOf('#bulk'));
await wait(1800);
check('多单位时分成多次请求', thinkRequestMountCounts.length >= 2);
check('第一批在第二次请求之前就已挂载', thinkRequestMountCounts[1] > 0);
check('分块没有漏掉段落', mountedBlocks('#bulk') === 24);
check('全部完成后按钮高亮', buttonState('#bulk') === 'translated');

console.log('');console.log('思考链按钮客户端回归：' + (failures.length === 0 ? 'PASS' : 'FAIL (' + failures.length + ')'));
api.chatTranslateObserver.disconnect();
process.exit(failures.length === 0 ? 0 : 1);
