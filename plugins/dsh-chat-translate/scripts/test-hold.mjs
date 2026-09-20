// jsdom 回归：工具调用整行扣留——实时 turn 里新出现的行先整行隐藏，译文就绪后
// 按阅读顺序放行并重放 smooth-stream 的行入场；排在待出现行后面的会话流条目同时
// 被挂起（data-dsh-reveal-hold），所以不会有行先占位再被顶下去。缓存命中/历史行/
// 非末尾插入/无活动 turn/通道全关都不扣留；明确失败与超时放行原文；已显示行的原文
// 变化原地换译文。
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const HOLD_ATTRIBUTE = 'data-dsh-reveal-hold';

const HTML = [
  '<!doctype html><html><body>',
  '<div data-conversation-scroll>',
  '  <div data-chat-flow>',
  '    <div id="row0" data-chat-flow-key="call:c0" data-chat-flow-kind="tool-call">',
  '      <div id="row0-host" class="follow surface" data-entrance="active">',
  '        <div data-chat-call-id="c0">',
  '          <div class="XX_card"><div class="XX_root" data-variant="bash" data-state="ok">',
  '            <span class="XX_title">Bash</span>',
  '            <span class="XX_summary">Historical row title</span>',
  '          </div></div>',
  '        </div>',
  '      </div>',
  '    </div>',
  '    <div id="turn-status" role="status" aria-live="polite">Deep diving</div>',
  '  </div>',
  '</div>',
  '</body></html>',
].join('');

const dom = new JSDOM(HTML, { pretendToBeVisual: true, url: 'http://127.0.0.1:3080/' });
const { window } = dom;
global.window = window; global.document = window.document;
global.MutationObserver = window.MutationObserver; global.HTMLElement = window.HTMLElement;
global.Element = window.Element; global.Node = window.Node;
global.localStorage = window.localStorage;
// jsdom 不做排版，getClientRects() 恒为空，观察器会每 3 秒误判「会话根已不可见」并
// 重启（重启会批量放行扣留中的行）。浏览器里根容器有布局盒，这里补上。
window.document.querySelector('[data-conversation-scroll]').getClientRects = () => [{}];

const failures = [];
function check(label, ok) {
  if (ok) { console.log('  ok   ' + label); } else { console.log('  FAIL ' + label); failures.push(label); }
}

let fetchMode = 'ok';
/** 挂起模式下的在途请求：测试显式放行它们，用来控制队首就绪的时刻。 */
let hangResolvers = [];

global.fetch = async (url, opts) => {
  const target = String(url);
  if (target.includes('/translate')) {
    const mode = fetchMode;
    const body = JSON.parse(opts.body);
    const response = () => ({
      ok: true,
      json: async () => ({
        ok: true,
        results: body.texts.map((text) => ({
          original: text,
          translated: mode === 'fallback' ? text : '译<' + text + '>',
          channel: mode === 'fallback' ? 'fallback' : 'mock',
          cached: false,
        })),
      }),
    });
    if (mode === 'hang') return new Promise((resolve) => { hangResolvers.push(() => resolve(response())); });
    return response();
  }
  return { ok: false, json: async () => ({}) };
};
window.fetch = global.fetch;

function releaseHangs() {
  const pending = hangResolvers;
  hangResolvers = [];
  for (const resolve of pending) resolve();
}

let factory = null;
window.__ModuleLoader__ = { load: (entry) => { factory = entry.factory; } };
window.eval(code);
const primitivesStub = new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : () => null) });
const api = factory((id) => (id === 'react'
  ? { useState: () => [null, () => {}], useEffect: () => {} }
  : (id === '@deepseek-ai/dsh-client-ui-primitives' ? primitivesStub : null)));
api.apply({ effect: (fn) => { try { fn(); } catch (error) { console.log('[effect err]', error.message); } }, get: () => null });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (selector) => window.document.querySelector(selector);
const flow = () => $('[data-chat-flow]');
const row = (id) => $('#' + id);
const root = (id) => row(id)?.querySelector('.XX_root');
const host = (id) => $('#' + id + '-host');
const hidden = (id) => root(id)?.style.display === 'none';
const translatedTo = (id) => row(id)?.querySelector('.XX_root > .XX_summary > .dsh-tidy-translated-block')?.textContent ?? null;
const held = (id) => row(id)?.hasAttribute(HOLD_ATTRIBUTE) === true;

let seq = 0;
function appendRow(text, options = {}) {
  const id = options.id ?? 'row' + (++seq + 10);
  const suffix = options.suffix === undefined ? '' : '<span class="XX_summarySuffix">' + options.suffix + '</span>';
  const item = window.document.createElement('div');
  item.id = id;
  item.setAttribute('data-chat-flow-key', 'call:' + id);
  item.setAttribute('data-chat-flow-kind', 'tool-call');
  item.innerHTML =
    '<div id="' + id + '-host" class="follow surface" data-entrance="' + (options.entrance ?? 'idle') + '">' +
    '<div data-chat-call-id="' + id + '">' +
    '<div class="XX_card"><div class="XX_root" data-variant="bash" data-state="ok">' +
    '<span class="XX_title">Bash</span>' +
    '<span class="XX_summary">' + text + '</span>' + suffix +
    '</div></div></div></div>';
  flow().appendChild(item);
  return id;
}

/** 非工具条目：回答节点 / 思考卡片所在的会话流条目，没有可翻译的摘要。 */
function appendAgentItem(id) {
  const element = window.document.createElement('div');
  element.id = id;
  element.setAttribute('data-chat-flow-key', 'step:' + id);
  element.innerHTML = '<div class="follow surface" data-entrance="idle"><span>Answer text</span></div>';
  flow().appendChild(element);
  return id;
}

/** 不翻译的工具行（摘要渲染成文件链接按钮，类名里没有 summary）。 */
function appendReadRow(id) {
  const element = window.document.createElement('div');
  element.id = id;
  element.setAttribute('data-chat-flow-key', 'call:' + id);
  element.setAttribute('data-chat-flow-kind', 'tool-call');
  element.innerHTML =
    '<div id="' + id + '-host" class="follow surface" data-entrance="idle">' +
    '<div data-chat-call-id="' + id + '">' +
    '<div class="XX_card"><div class="XX_root" data-variant="read" data-tool="read">' +
    '<span class="XX_title">Read</span><button class="XX_fileLink">src/index.ts</button>' +
    '</div></div></div></div>';
  flow().appendChild(element);
  return id;
}

// 1. 装载时已在屏幕上的行是历史：不扣留，原地补译。
check('装载时历史行不被隐藏', !hidden('row0'));
await wait(700);
check('历史行照常译出', translatedTo('row0') === '译<Historical row title>');

// 2. 实时 turn 里新追加的行：先整行隐藏，译文就绪后放行。
fetchMode = 'ok';
const live = appendRow('Run integration test suite');
await wait(0);
check('新行立即整行隐藏', hidden(live));
check('等待期间自己的流程条目也被挂起', held(live));
await wait(700);
check('译文就绪后放行', !hidden(live));
check('放行时已挂译文', translatedTo(live) === '译<Run integration test suite>');
check('放行时把行入场门控拨到 active', host(live).getAttribute('data-entrance') === 'active');
check('队列排空后摘掉挂起标记', !held(live));

// 3. 宿主已经是 active（React 挂载时就挂着、动画早跑完了）：清一次再恢复来重放。
const restarted = appendRow('Restart entrance row title', { entrance: 'active' });
const styleTraces = [];
const styles = new window.MutationObserver((records) => {
  for (const record of records) styleTraces.push(record.oldValue || '');
});
styles.observe(host(restarted), { attributes: true, attributeFilter: ['style'], attributeOldValue: true });
await wait(0);
check('带 active 宿主的新行同样先隐藏', hidden(restarted));
await wait(700);
check('active 宿主上的动画被重放', styleTraces.some((value) => value.includes('animation: none')));
check('重放后行内样式已清干净', host(restarted).style.animation === '');
styles.disconnect();

// 4. 命中缓存的新行：同步就绪，不进等待，整行立即显示。
api.clientCache.set('Cached row title', '缓存标题');
const cachedRow = appendRow('Cached row title');
await wait(0);
check('缓存命中的新行不被隐藏', !hidden(cachedRow));
check('缓存命中的新行直接显示译文', translatedTo(cachedRow) === '缓存标题');
check('缓存命中的行不留挂起标记', !held(cachedRow));

// 5. 明确失败（降级）没有可等的译文：先隐藏，判定失败后放行原文。
fetchMode = 'fallback';
const failing = appendRow('Failing row title');
await wait(0);
check('降级行同样先隐藏', hidden(failing));
await wait(700);
check('判定失败后放行', !hidden(failing));
check('放行的是原文', translatedTo(failing) === null);

// 6. 一直拿不到译文：5 秒上限到点放行原文。
fetchMode = 'hang';
const hanging = appendRow('Hanging row title');
await wait(0);
check('挂起行先隐藏', hidden(hanging));
await wait(5300);
check('超过上限后放行原文', !hidden(hanging) && translatedTo(hanging) === null);
hangResolvers = [];

// 7. 已显示行的原文变化：保留旧译文，新译文就绪后原地替换，行不消失。
const wrapper = row(live).querySelector('.XX_root > .XX_summary > .dsh-tidy-original-hidden');
wrapper.firstChild.data = 'Run integration test suite v2';
fetchMode = 'ok';
await wait(0);
check('原文变化时行不被隐藏', !hidden(live));
check('新译文就绪前保留旧译文', translatedTo(live) === '译<Run integration test suite>');
await wait(700);
check('新译文就绪后原地替换', translatedTo(live) === '译<Run integration test suite v2>');

// 8. 后缀 span 不参与扣留判定（摘要命中缓存时整行立即显示）。
api.clientCache.set('Suffix row title', '后缀行标题');
const suffixRow = appendRow('Suffix row title', { suffix: '+2 rows' });
await wait(0);
check('后缀未命中不影响整行显示', !hidden(suffixRow));
check('摘要命中缓存直接显示', translatedTo(suffixRow) === '后缀行标题');

// 9. 两行同时在等：队首没就绪时，后面那行即使已有译文也不上屏——先出现会占住队首
// 的位置，等队首就绪再被顶下去。
fetchMode = 'hang';
const head = appendRow('Queued head title');
api.clientCache.set('Queued follower title', '排队标题');
const follower = appendRow('Queued follower title');
await wait(700);
check('队首等待时它自己隐藏', hidden(head));
check('队首等待时后面已就绪的行也不上屏', hidden(follower));
check('后面行的条目被挂起', held(follower));
await wait(0);
const agent = appendAgentItem('agent-queued');
await wait(0);
check('后续回答/思考条目同样被挂起', held(agent));
const readRow = appendReadRow('row-queued-read');
await wait(0);
check('不翻译的工具行也要等（否则它会先占住队首的位置）', hidden(readRow) && held(readRow));
releaseHangs();
await wait(50);
check('队首就绪后立即放行', !hidden(head) && translatedTo(head) === '译<Queued head title>');
check('紧随其后的行接着放行', !hidden(follower) && translatedTo(follower) === '排队标题');
check('不翻译的工具行按顺序放行且保持原文', !hidden(readRow) && translatedTo(readRow) === null);
check('放行后回答/思考条目解除挂起', !held(agent));
check('队列排空后条目上的标记全部清干净', !held(head) && !held(follower) && !held(readRow));

// 10. 没有活动 turn 标记时不扣留。
$('#turn-status').remove();
await wait(0);
fetchMode = 'hang';
const quiet = appendRow('Quiet row title');
await wait(0);
check('无活动 turn 时不扣留', !hidden(quiet));
check('无活动 turn 时不挂起后续条目', !held(quiet));

// 11. 活动 turn 期间插到流前面的（加载更早历史）不算新行。
const status = window.document.createElement('div');
status.id = 'turn-status';
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
flow().appendChild(status);
await wait(0);
const older = window.document.createElement('div');
older.id = 'row-older';
older.setAttribute('data-chat-flow-key', 'call:older');
older.setAttribute('data-chat-flow-kind', 'tool-call');
older.innerHTML =
  '<div id="row-older-host" data-entrance="idle">' +
  '<div data-chat-call-id="older"><div class="XX_card"><div class="XX_root" data-variant="bash" data-state="ok">' +
  '<span class="XX_title">Bash</span><span class="XX_summary">Older history title</span>' +
  '</div></div></div></div>';
flow().insertBefore(older, flow().firstChild);
await wait(0);
check('插到流前面的历史行不扣留', !hidden('row-older'));

// 12. 两条通道都关：没有可等的译文，不扣留。
await api.settingsStore.update({ aiEnabled: false, bingEnabled: false });
fetchMode = 'hang';
const noChannel = appendRow('No channel row title');
await wait(0);
check('通道全关时不扣留', !hidden(noChannel));

// 13. 扣留期间关闭总开关：立即放行、摘掉全部挂起标记，且批量放行不重放入场动画。
await api.settingsStore.update({ aiEnabled: true, bingEnabled: true });
const switched = appendRow('Switch off row title');
await wait(700);
check('开关关闭前确实处于扣留', hidden(switched) && held(switched));
await api.settingsStore.update({ enabled: false });
await wait(50);
check('关闭总开关后立即放行', !hidden(switched));
check('关闭总开关后摘掉挂起标记', !held(switched));
check('批量放行不重放入场动画', host(switched).getAttribute('data-entrance') === 'idle');

console.log('');
console.log('工具调用整行扣留：' + (failures.length === 0 ? 'PASS' : 'FAIL (' + failures.length + ')'));
api.chatTranslateObserver.disconnect();
process.exit(failures.length === 0 ? 0 : 1);
