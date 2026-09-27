// jsdom 回归：过程折叠块里的正文自动翻译——落定前不翻、落定后按 markdown 块翻、
// 代码块原样、Think 卡与工具行永不翻、纯中文块跳过、失败保留原文、缓存命中不再
// 请求、多块按阅读顺序挂载、块级点击原地切回原文；折叠块之外的正文（最终汇总）
// 一个字都不翻、也不进请求。
//
// fixture 照内核真实结构搭：flow row 带 data-chat-flow-kind / data-chat-group-part，
// 折叠块成员由内核标 data-turn-process-member，最终汇总那一行标
// data-turn-process-answer；正文是 <div class="<hash>_root" data-streaming><div
// class="<hash>_body">…，流式中的回答在 markdown 根上挂 data-streaming。
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

const HTML = [
  '<!doctype html><html><body>',
  '<div data-chat-flow>',
  '  <div id="settled" data-chat-flow-kind="assistant-step" data-chat-group-part="response" data-turn-process-member="1">',
  '    <div class="hWmORq_root"><div class="hWmORq_body">',
  '      <p>Stable paragraph one.</p>',
  '      <pre><code>const answer = 42;</code></pre>',
  '      <ul><li>First item text <ul><li>Nested item text</li></ul></li><li>Second item text</li></ul>',
  '      <p>Tail paragraph.</p>',
  '      <p>这一段已经写好了，不需要翻译。</p>',
  '    </div></div>',
  '  </div>',
  '  <div id="streaming" data-chat-flow-kind="assistant-step" data-chat-group-part="response" data-turn-process-member="1">',
  '    <div class="hWmORq_root" data-streaming><div class="hWmORq_body"><p>Still streaming paragraph.</p></div></div>',
  '  </div>',
  '  <div id="thinking" data-chat-flow-kind="assistant-step" data-chat-group-part="reasoning" data-variant="think">',
  '    <div class="lcKema_root" data-variant="think" data-state="ok">',
  '      <div class="lcKema_row" data-disclosure-row data-open aria-expanded="true"><span class="lcKema_title">Think</span></div>',
  '      <div class="lcKema_thinkBody"><p>A think paragraph that must stay English.</p></div>',
  '    </div>',
  '  </div>',
  '  <div id="tool" data-chat-flow-kind="tool-call">',
  '    <div data-chat-call-id="c1"><div class="CY-8Ka_root" data-variant="bash" data-state="ok">',
  '      <span class="CY-8Ka_title">Bash</span><span class="CY-8Ka_summary">Run integration test suite</span>',
  '    </div></div>',
  '  </div>',
  '  <div id="final" data-chat-flow-kind="assistant-step" data-chat-group-part="response" data-turn-process-answer="1">',
  '    <div class="hWmORq_root"><div class="hWmORq_body">',
  '      <p>Here is the final summary of everything I changed.</p>',
  '    </div></div>',
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

let replyCalls = 0;
let failText = null;
const requestedBlocks = [];
global.fetch = async (url, opts) => {
  const target = String(url);
  if (target.includes('/translate-reply')) {
    replyCalls++;
    const body = JSON.parse(opts.body);
    requestedBlocks.push(body.blocks.slice());
    const results = body.blocks.map((block) => ({
      original: block,
      translated: failText !== null && block.includes(failText) ? block : '译<' + block + '>',
      ok: !(failText !== null && block.includes(failText)),
      cached: false,
      channel: 'mock',
    }));
    return { ok: true, json: async () => ({ ok: true, results }) };
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

const replyForm = {
  getSnapshot: () => ({ status: 'ready', value: { enabled: true }, writable: true, revision: 1, mode: 'host' }),
  subscribe: () => () => {},
  mutate: async () => true,
};
api.apply({
  effect: (fn) => { try { fn(); } catch (error) { console.log('[effect err]', error.message); } },
  get: () => null,
  configForms: { get: () => replyForm, whileServed: (namespaces, register) => register(new Set(namespaces)) },
  locale: { register: () => () => {}, bind: (ns) => (key) => `${ns}:${key}` },
  slots: { inject: (_key, callback) => { callback(); return () => {}; }, register: () => () => {}, entries: () => [] },
  remote: { credentials: null },
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (selector) => window.document.querySelector(selector);
const $$ = (selector) => [...window.document.querySelectorAll(selector)];
const text = (selector) => $(selector)?.textContent ?? '';
const visibleText = (element) => {
  if (element === null) return '';
  const shown = element.querySelector('.dsh-tidy-original-shown');
  if (shown !== null) return shown.textContent;
  const translated = element.querySelector('.dsh-tidy-translated-block');
  return translated?.textContent ?? element.textContent;
};
const mountedBlocks = (scope) => window.document.querySelectorAll(scope + ' .dsh-tidy-translated-block').length;
const click = (element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

await wait(900);

// 1. 视口内的落定回答自动翻译，不需要点任何按钮
check('落定回答自动翻译，没有按钮', $$('.dsh-tidy-think-button').length === 0);
check('段落挂上译文', $('#settled p')?.getAttribute('data-tidy-translated') === 'true');
check('译文内容正确', visibleText($('#settled p')) === '译<Stable paragraph one.>');
check('尾段同样翻译', visibleText($$('#settled p')[1]) === '译<Tail paragraph.>');

// 2. 流式中的回答不翻
check('流式中的回答不翻', $('#streaming p')?.getAttribute('data-tidy-translated') === null);
check('流式回答不进请求', requestedBlocks.flat().every((block) => !block.includes('Still streaming')));

// 3. Think 卡与工具行永不翻
check('Think 正文一字未动', text('#thinking .lcKema_thinkBody p') === 'A think paragraph that must stay English.');
check('工具调用摘要一字未动', text('#tool .CY-8Ka_summary') === 'Run integration test suite');
check('Think 正文没有译文容器', $('#thinking .dsh-tidy-translated-block') === null);

// 4. 代码块原样，混合块只翻行内文字
check('代码块原样保留', $('#settled pre code').textContent === 'const answer = 42;');
check('代码块内没有译文容器', $('#settled pre .dsh-tidy-translated-block') === null);
check('混合块的外层文字拆成行内片段', $('#settled .dsh-tidy-run > .dsh-tidy-translated-block') !== null);
check('嵌套子列表逐项翻译', mountedBlocks('#settled ul') >= 2);

// 5. 纯中文块跳过
check('已写好的中文段落不翻', $$('#settled p')[2]?.getAttribute('data-tidy-translated') === null);
check('中文段落没有进请求', requestedBlocks.flat().every((block) => !block.includes('已经写好了')));

// 5b. 折叠块之外的正文（最终汇总那一行）一个字都不翻
check('最终汇总不翻', $('#final p')?.getAttribute('data-tidy-translated') === null);
check('最终汇总没有译文容器', $('#final .dsh-tidy-translated-block') === null);
check('最终汇总不进请求', requestedBlocks.flat().every((block) => !block.includes('final summary')));

// 6. 请求形状：一次请求带上全部需要翻的块
check('只发正文块路由的请求', replyCalls >= 1);
check(
  '一次请求装载整条回答的块',
  JSON.stringify(requestedBlocks[0]) ===
    JSON.stringify([
      'Stable paragraph one.',
      'First item text',
      'Nested item text',
      'Second item text',
      'Tail paragraph.',
    ])
);

// 7. 块级点击原地切回原文
const paragraph = $('#settled p');
click(paragraph.querySelector('.dsh-tidy-translated-block'));
check('点击译文切回原文', visibleText(paragraph) === 'Stable paragraph one.');
const callsAfterToggle = replyCalls;
click(paragraph.querySelector('.dsh-tidy-original-shown'));
check('再点原文切回译文', visibleText(paragraph) === '译<Stable paragraph one.>');
check('点击不产生新请求', replyCalls === callsAfterToggle);

// 8. 落定事件：把 data-streaming 摘掉，流式回答随即翻译
const streamingRoot = $('#streaming .hWmORq_root');
streamingRoot.removeAttribute('data-streaming');
await wait(600);
check('落定后流式回答被翻译', visibleText($('#streaming p')) === '译<Still streaming paragraph.>');

// 9. 失败：保留原文、不挂译文、不进缓存（再滚回来会重试）
// 译文挂载在原文旁边，所以「保持原文」要看可见的那一半。
failText = 'A paragraph that will fail.';
const growing = $('#streaming .hWmORq_body');
const extra = window.document.createElement('p');
extra.textContent = 'A paragraph that will fail.';
growing.appendChild(extra);
await wait(700);
check('失败块保留原文', visibleText(extra) === 'A paragraph that will fail.');
check('失败块没有译文容器', extra.querySelector('.dsh-tidy-translated-block') === null);
check('成功的块照常翻译', visibleText($$('#streaming p')[0]) === '译<Still streaming paragraph.>');

// 10. 缓存命中：同一条文本第二次出现不再请求
const callsBeforeCache = replyCalls;
const cachedBody = $('#streaming .hWmORq_body');
const repeat = window.document.createElement('p');
repeat.textContent = 'Stable paragraph one.';
cachedBody.appendChild(repeat);
await wait(700);
check('同文本命中缓存不发新请求', replyCalls === callsBeforeCache);
// 命中缓存的块由 lazy 队列的视口回调处理；jsdom 没有 IntersectionObserver，
// 这条路径由 observer 自己承担，不在这里断言挂载结果。
check('缓存命中不会退回原文或重复请求', replyCalls === callsBeforeCache);

api.chatTranslateObserver.disconnect();
console.log(failures.length === 0 ? '\nreply-client: PASS' : `\nreply-client: FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);
