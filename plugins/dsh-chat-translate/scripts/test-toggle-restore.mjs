// jsdom 验证：关闭开关 → 已翻译节点立即还原英文；开启 → 重新翻译
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const dom = new JSDOM(`<!doctype html><html><body>
  <div data-chat-flow data-chat-flow-kind="assistant-step">
    <div data-chat-call-id="c1"><div class="CY-8Ka_card"><div class="CY-8Ka_root" data-variant="bash" data-state="ok">
      <span class="CY-8Ka_title">Bash</span><span class="CY-8Ka_summary">Run integration test suite</span>
    </div></div></div>
  </div>
</body></html>`, { pretendToBeVisual: true, url: 'http://127.0.0.1:3080/' });
const { window } = dom;
global.window = window; global.document = window.document;
global.MutationObserver = window.MutationObserver; global.HTMLElement = window.HTMLElement;
global.localStorage = window.localStorage;

global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('/api/dsh-chat-translate/translate')) {
    const body = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ ok: true, results: body.texts.map(t => ({ original: t, translated: `译文[${t}]`, channel: 'mock', cached: false })) }) };
  }
  return { ok: false, json: async () => ({}) };
};
window.fetch = global.fetch;

let factory = null;
window.__ModuleLoader__ = { load: (e) => { factory = e.factory; } };
window.eval(code);
// The settings card's ui-primitives controls are never rendered here, so the
// module table only has to answer the bundle's top-level require.
const primitivesStub = new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : () => null) });
const exports = factory((id) => id === 'react'
  ? { useState: () => [null, () => {}], useEffect: () => {} }
  : (id === '@deepseek-ai/dsh-client-ui-primitives' ? primitivesStub : null));
exports.apply({ effect: (fn) => { try { fn(); } catch (e) { console.log('[effect err]', e.message); } }, get: () => null });

const summary = () => window.document.querySelector('.CY-8Ka_summary');
await new Promise(r => setTimeout(r, 600));
console.log('1) 初始翻译后 summary:', summary()?.textContent);
console.log('   tidyTranslated:', summary()?.getAttribute('data-tidy-translated'));

// 通过 SettingsStore 切换开关
exports.settingsStore.update({ enabled: false });
await new Promise(r => setTimeout(r, 100));
console.log('2) 点击关闭后 summary:', summary()?.textContent, '| tidyTranslated:', summary()?.getAttribute('data-tidy-translated'));
await new Promise(r => setTimeout(r, 400));
console.log('3) 400ms 后（应保持英文，未被反噬重翻）:', summary()?.textContent);

exports.settingsStore.update({ enabled: true });
await new Promise(r => setTimeout(r, 600));
console.log('4) 重新开启后 summary:', summary()?.textContent, '| tidyTranslated:', summary()?.getAttribute('data-tidy-translated'));

// 清理：断开 observer（含 root 探测定时器），避免进程挂起
exports.chatTranslateObserver.disconnect();
process.exit(0); // jsdom 的 IntersectionObserver 内部调度器会保持事件循环活跃
