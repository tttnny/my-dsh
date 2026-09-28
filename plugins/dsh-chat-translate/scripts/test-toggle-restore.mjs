// jsdom 验证：助手回答正文自动翻译（折叠块内外一律，最终汇总同样译）、关闭开关
// 立即还原英文、重新开启再次翻译。Think 卡与工具行的正文由排除规则挡住，一个字
// 都不翻。
//
// fixture 是内核真实的正文结构：flow row 带 data-chat-flow-kind /
// data-chat-group-part="response"，并照内核那样挂上 data-turn-process-member /
// data-turn-process-answer（判据与它们无关）；正文是 <div class="<hash>_root">
// 包着 <div class="<hash>_body"> 的 markdown 容器；同一行里还挂着 Think 卡与工具行。
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const dom = new JSDOM(`<!doctype html><html><body>
  <div data-chat-flow>
    <div data-chat-flow-kind="assistant-step" data-chat-group-part="response" data-turn-process-member="1">
      <div class="hWmORq_root">
        <div class="hWmORq_body">
          <p>I traced the failing path to a stale lock file.</p>
        </div>
      </div>
    </div>
    <div data-chat-flow-kind="assistant-step" data-chat-group-part="reasoning" data-variant="think">
      <div class="lcKema_root" data-variant="think" data-state="ok">
        <div class="lcKema_thinkBody"><p>A think paragraph that must stay English.</p></div>
      </div>
    </div>
    <div data-chat-flow-kind="tool-call">
      <div data-chat-call-id="c1"><div class="CY-8Ka_card"><div class="CY-8Ka_root" data-variant="bash" data-state="ok">
        <span class="CY-8Ka_title">Bash</span><span class="CY-8Ka_summary">Run integration test suite</span>
      </div></div></div>
    </div>
    <div data-chat-flow-kind="assistant-step" data-chat-group-part="response" data-turn-process-answer="1">
      <div class="hWmORq_root">
        <div class="hWmORq_body" id="final">
          <p>Here is the final summary of everything I changed.</p>
        </div>
      </div>
    </div>
  </div>
</body></html>`, { pretendToBeVisual: true, url: 'http://127.0.0.1:3080/' });
const { window } = dom;
global.window = window; global.document = window.document;
global.MutationObserver = window.MutationObserver; global.HTMLElement = window.HTMLElement;
global.Node = window.Node; global.Element = window.Element;
global.localStorage = window.localStorage;

const failures = [];
function check(label, ok) {
  if (ok) console.log('  ok   ' + label);
  else { console.log('  FAIL ' + label); failures.push(label); }
}

const replyCalls = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/api/dsh-chat-translate/translate-reply')) {
    const body = JSON.parse(opts.body);
    replyCalls.push(body.blocks.slice());
    return {
      ok: true,
      json: async () => ({
        ok: true,
        results: body.blocks.map((block) => ({
          original: block,
          translated: `译<${block}>`,
          ok: true,
          cached: false,
          channel: 'mock',
        })),
      }),
    };
  }
  return { ok: false, json: async () => ({}) };
};
window.fetch = global.fetch;

let factory = null;
window.__ModuleLoader__ = { load: (e) => { factory = e.factory; } };
window.eval(code);
const primitivesStub = new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : () => null) });
const exports = factory((id) => id === 'react'
  ? { useState: () => [null, () => {}], useEffect: () => {} }
  : (id === '@deepseek-ai/dsh-client-ui-primitives' ? primitivesStub : null));

function createForm(initial) {
  const listeners = new Set();
  let value = { ...initial };
  return {
    getSnapshot: () => ({ status: 'ready', value, writable: true, revision: 1, mode: 'host' }),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    mutate: async (ops) => {
      for (const op of ops) if (op.op === 'set') value = { ...value, [op.path[0]]: op.value };
      for (const listener of [...listeners]) listener();
      return true;
    },
  };
}

const form = createForm({ enabled: true, baseUrl: 'https://example.test/v1', model: 'mock' });
const ctx = {
  effect: (fn) => { try { fn(); } catch (e) { console.log('[effect err]', e.message); } },
  get: () => null,
  configForms: { get: () => form, whileServed: (namespaces, register) => register(new Set(namespaces)) },
  locale: { register: () => () => {}, bind: (ns) => (key) => `${ns}:${key}` },
  slots: { inject: (_key, callback) => { callback(); return () => {}; }, register: () => () => {}, entries: () => [] },
  remote: { credentials: null },
};
exports.apply(ctx);

const foldBody = () => window.document.querySelector('[data-turn-process-member] .hWmORq_body');
const body = () => window.document.getElementById('final');
const paragraph = () => foldBody().querySelector('p');
const summary = () => body().querySelector('p');
const think = () => window.document.querySelector('.lcKema_thinkBody p');
const tool = () => window.document.querySelector('.CY-8Ka_summary');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await wait(600);
check('折叠块里的正文段落被翻译', paragraph()?.textContent?.startsWith('译<') === true);
check('译文挂在原文位置（双语对照容器）', paragraph()?.getAttribute('data-tidy-translated') === 'true');
check('折叠块之外的最终汇总同样翻译', summary()?.textContent?.startsWith('译<') === true);
check('最终汇总进请求', replyCalls.flat().some((block) => block.includes('final summary')));
check('Think 正文一个字没翻', think()?.textContent === 'A think paragraph that must stay English.');
check('工具调用摘要一个字没翻', tool()?.textContent === 'Run integration test suite');
check('两段正文各成一请求', replyCalls.length === 2 && replyCalls.every((call) => call.length === 1));

// 通过 SettingsStore 关掉总开关：立即还原英文
await exports.settingsStore.update({ enabled: false });
await wait(150);
check('关闭开关后还原英文', paragraph()?.textContent === 'I traced the failing path to a stale lock file.');
check('最终汇总随开关还原英文', summary()?.textContent === 'Here is the final summary of everything I changed.');
check('还原后不再带翻译标记', paragraph()?.getAttribute('data-tidy-translated') === null);

await wait(400);
check('还原后不被反噬重翻', paragraph()?.textContent === 'I traced the failing path to a stale lock file.');

// 关着的时候新落定的回答：重开之后必须补翻
const lateParagraph = window.document.createElement('p');
lateParagraph.textContent = 'A paragraph that settled while translation was off.';
foldBody().appendChild(lateParagraph);
await wait(400);
check('关闭期间新段落保持原文', lateParagraph.textContent === 'A paragraph that settled while translation was off.');

// 再打开：重新翻译（原段落与关闭期间落定的段落都要补上）
const callsBefore = replyCalls.length;
await exports.settingsStore.update({ enabled: true });
await wait(600);
check('重新开启后再次翻译', paragraph()?.textContent?.startsWith('译<') === true);
check('关闭期间落定的回答在重开后补翻', lateParagraph.getAttribute('data-tidy-translated') === 'true');
check('重新开启会重新请求（缓存未丢，仍走一次新请求或命中缓存）', replyCalls.length >= callsBefore);

// 点击译文：原地切回原文；再点一次切回译文
const callsBeforeToggle = replyCalls.length;
const translated = paragraph().querySelector('.dsh-tidy-translated-block');
translated?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
// 双语对照：display:none 的那一半不参与 textContent，所以断言看的是可见一半。
const visibleText = (element) => {
  const shown = element.querySelector('.dsh-tidy-original-shown');
  if (shown !== null) return shown.textContent;
  return element.querySelector('.dsh-tidy-translated-block')?.textContent ?? element.textContent;
};
check('点击译文切回原文', visibleText(paragraph()) === 'I traced the failing path to a stale lock file.');
const original = paragraph().querySelector('.dsh-tidy-original-shown');
original?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('再点原文切回译文', visibleText(paragraph()).startsWith('译<') === true);
check('请求总数没有因点击增加', replyCalls.length === callsBeforeToggle);
check('最终汇总在重开后同样被翻译', summary()?.textContent?.startsWith('译<') === true);

exports.chatTranslateObserver.disconnect();
console.log(failures.length === 0 ? '\ntoggle-restore: PASS' : `\ntoggle-restore: FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);
