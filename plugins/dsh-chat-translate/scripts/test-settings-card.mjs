/**
 * 配置页的渲染自检：提示词那一格是「真的能改」，不是一块说明文字。
 *
 * 这个文件只锁一件事：插件页上这张卡片把写给模型的指令整段铺在一个 textarea
 * 里，读者改了它、离开输入框（或点「完成」），改动就以一条 `prompt` 路径写进
 * 配置；没改时一个字都不写。卡片上没有保存按钮，任何输入离开即写盘。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 是替身（真组件带 .css 导入，Node 里
 * 跑不起来）：替身把 text / children 原样渲染，所以这里验的是本插件自己的视图
 * 结构与事件接线；真控件的外观要在浏览器里看。
 *
 * 运行：node scripts/test-settings-card.mjs（需先 pnpm build）
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { installDom, loadClientBundle, primitivesStub } from '../../../tools/lib/dom-harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const dom = installDom(JSDOM);
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');

const primitives = primitivesStub({
  // 真 Button 是 <button>：卡片里的「恢复默认」与「保存」都要能点。
  Button: ({ children, ...rest }) => createElement('button', rest, children),
  // 真 Input 是 <input>（外观在包着的 span 上）：替身直接给出原生元素。
  Input: (props) => createElement('input', props),
  Switch: (props) => createElement('input', { type: 'checkbox', checked: props.checked, onChange: () => props.onChange?.(!props.checked) }),
  Tag: ({ children }) => createElement('span', null, children),
});

const exported = await loadClientBundle({ root, primitives });

const registrations = [];
const disposed = [];
const effects = [];
const ctx = {
  effect: (fn) => {
    const disposer = fn();
    if (typeof disposer === 'function') effects.push(disposer);
  },
  // 这一页没有 ui-deliverables：可选的文件提及服务缺席，回调不运行。
  inject: () => ({}),
  get: () => undefined,
  slots: {
    inject: (_key, register) => {
      register();
      return () => {};
    },
    register: (options, component) => {
      registrations.push({ options, component });
      return () => disposed.push(options.key ?? options.id);
    },
    entries: () => [],
  },
  configForms: {
    get: () => form,
    whileServed: (_namespaces, register) => register(new Set(_namespaces)),
  },
  locale: { register: () => () => {}, bind: () => (key) => key },
  remote: { credentials: null },
};

/** 配置文档：宿主那份活配置的替身，记下每一批路径写。 */
let doc = { enabled: true, aiTimeoutMs: 600000, baseUrl: 'https://api.example.com/v1', model: 'test-model' };
const mutations = [];
const listeners = new Set();
const form = {
  getSnapshot: () => ({ status: 'ready', value: doc, writable: true, revision: 1, mode: 'host' }),
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  mutate: async (ops) => {
    for (const op of ops) {
      mutations.push(op);
      if (op.op === 'set') doc = { ...doc, [op.path[0]]: op.value };
      else {
        const { [op.path[0]]: _drop, ...rest } = doc;
        doc = rest;
      }
    }
    for (const listener of [...listeners]) listener();
  },
};

// 两个接口都挡掉网络：保存后的通道探测回一份成功，正文翻译按块回「译:…」，
// 让换代测试能够区分已登记的行与内容缓存。
globalThis.fetch = async (url, init) => {
  if (String(url).includes('translate-reply')) {
    const blocks = JSON.parse(init.body).blocks;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        results: blocks.map((block) => ({ translated: `译:${block}`, ok: true })),
      }),
    };
  }
  return { ok: true, json: async () => ({ ok: true, latencyMs: 1 }) };
};

exported.apply(ctx);

const card = registrations.find((entry) => entry.options.name === 'plugins.bundle.config');
assert.ok(card !== undefined, '配置卡没有注册进 plugins.bundle.config');
assert.equal(card.options.locale, 'settings.chatTranslate');

const { settingsStore, chatTranslate } = exported;
const { DEFAULT_PROMPT } = await import('../src/prompt.ts');

let passed = 0;
let total = 0;
async function test(name, fn) {
  total += 1;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
/** 卡片自己的 `t` 座次：key 原样返回，断言看的是 key，不是某一种语言的文案。 */
const t = (key) => key;

const container = document.createElement('div');
document.body.appendChild(container);
let rootHandle = null;

async function mountCard() {
  await act(async () => {
    rootHandle = createRoot(container);
    rootHandle.render(createElement(card.component, { view: 'page', t }));
    await settle();
  });
}

await mountCard();

await test('提示词那一格是真的 textarea，整段铺开生效的那份指令', () => {
  const prompt = container.querySelector('.dsh-tidy-prompt');
  assert.ok(prompt !== null, '提示词必须是一块铺开指令的输入区');
  assert.equal(prompt.tagName, 'TEXTAREA', '多行指令用 textarea，不是单行 input');
  assert.equal(prompt.value, DEFAULT_PROMPT, '没写过时输入框显示内置默认');
  assert.ok(prompt.value.length > 100, '默认指令是整段，不是一句占位');
});

await test('提示词默认只读：不点「编辑」改不动，也没有改写用的按钮', () => {
  const prompt = container.querySelector('.dsh-tidy-prompt');
  assert.equal(prompt.readOnly, true, '一进来是只读态');
  const labels = [...container.querySelectorAll('button')].map((button) => button.textContent);
  assert.ok(labels.includes('promptEdit'), '要有「编辑」按钮');
  assert.ok(!labels.includes('promptRestore'), '只读态不摆「恢复默认」，免得看着像能直接改');
});

await test('点「编辑」才进改写态，并交出输入焦点', async () => {
  const edit = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'promptEdit'
  );
  await act(async () => {
    edit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
  });
  const prompt = container.querySelector('.dsh-tidy-prompt');
  assert.equal(prompt.readOnly, false, '改写态下才可编辑');
  assert.equal(document.activeElement, prompt, '焦点直接落在输入框里');
  const labels = [...container.querySelectorAll('button')].map((button) => button.textContent);
  assert.ok(labels.includes('promptRestore'), '改写态才摆「恢复默认」');
  assert.ok(labels.includes('promptDone'), '改写态给一个「完成」回只读');
});

await test('改提示词：先停在输入框里，配置文档一个字都不动', async () => {
  const prompt = container.querySelector('.dsh-tidy-prompt');
  const mine = '把收到的文字改写成同事之间说话的语气。';
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLTextAreaElement.prototype,
      'value'
    ).set;
    setter.call(prompt, mine);
    prompt.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await settle();
  });
  assert.equal(settingsStore.getState().prompt.text, mine, '草稿收下这次编辑');
  assert.equal(settingsStore.getState().dirty, true, '页面据此亮出「未保存」');
  assert.equal(mutations.length, 0, '打字期间不写盘');
});

await test('点「完成」回到只读态，并把改过的提示词写进配置', async () => {
  const done = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'promptDone'
  );
  await act(async () => {
    done.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
  });
  const prompt = container.querySelector('.dsh-tidy-prompt');
  assert.equal(prompt.readOnly, true, '回到只读态');
  assert.equal(prompt.value, '把收到的文字改写成同事之间说话的语气。', '草稿已写进配置并留在框里');
  assert.deepEqual(mutations, [
    { op: 'set', path: ['prompt'], value: '把收到的文字改写成同事之间说话的语气。' },
  ]);
  assert.equal(settingsStore.getState().committed.prompt, '把收到的文字改写成同事之间说话的语气。');
  assert.equal(settingsStore.getState().dirty, false);
});

await test('恢复默认：填回草稿不写盘；点「完成」写 unset', async () => {
  const edit = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'promptEdit'
  );
  await act(async () => {
    edit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
  });
  const restore = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'promptRestore'
  );
  assert.ok(restore !== undefined, '改写态下才有恢复默认按钮');
  mutations.length = 0;
  await act(async () => {
    restore.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
  });
  assert.equal(container.querySelector('.dsh-tidy-prompt').value, DEFAULT_PROMPT, '输入框回到默认');
  assert.deepEqual(mutations, [], '恢复默认只是草稿，离开输入框才写盘');

  const done = [...container.querySelectorAll('button')].find((button) => button.textContent === 'promptDone');
  await act(async () => {
    done.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
  });
  assert.deepEqual(mutations, [{ op: 'unset', path: ['prompt'] }], '与默认一字不差就存成空值');
});

await test('没有保存按钮：改 Base URL 后离开输入框就写盘', async () => {
  const labels = [...container.querySelectorAll('button')].map((button) => button.textContent);
  assert.ok(!labels.includes('save'), '卡片上不该再有保存按钮');
  assert.ok(!labels.includes('saving'), '卡片上不该再有保存态按钮');

  mutations.length = 0;
  const input = [...container.querySelectorAll('input')].find(
    (el) => el.getAttribute('aria-label') === 'baseUrlTitle'
  );
  assert.ok(input !== undefined, '要有 Base URL 输入框');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'https://api.changed.example/v1');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await settle();
  });
  assert.deepEqual(mutations, [], '打字期间一个字都不写盘');

  await act(async () => {
    input.focus();
    input.blur();
    await settle();
  });
  assert.deepEqual(mutations, [
    { op: 'set', path: ['baseUrl'], value: 'https://api.changed.example/v1' },
  ], '离开输入框即写盘');
  assert.equal(settingsStore.getState().committed.baseUrl, 'https://api.changed.example/v1');
});

await test('提示词一改，浏览器保留当前行译文，后续行使用新配置', async () => {
  const text = 'A paragraph worth translating';
  assert.equal(chatTranslate.ensure('probe-row', [text]), true);
  await act(async () => { await settle(); });
  assert.equal(chatTranslate.getState('probe-row').outcomes[0].translated, `译:${text}`);
  const generation = chatTranslate.getGeneration();

  await act(async () => {
    await form.mutate([{ op: 'set', path: ['prompt'], value: '一套新说法' }]);
  });
  assert.equal(settingsStore.getState().committed.prompt, '一套新说法');
  assert.equal(chatTranslate.getGeneration(), generation + 1);
  assert.equal(chatTranslate.getState('probe-row').outcomes[0].translated, `译:${text}`);
  assert.equal(chatTranslate.ensure('probe-row', [text]), false, '同一行不重发');
  assert.equal(chatTranslate.ensure('new-probe-row', [text]), true, '新行的相同文本要用新配置');
  await act(async () => { await settle(); });
});

await test('配置卡和助手行样式随卸载与重新启用更新', async () => {
  const assistantStyle = 'head style[data-plugin-css]';
  const settingsStyle = 'style[data-tidy-settings]';
  assert.equal(document.querySelectorAll(assistantStyle).length, 1);
  assert.equal(container.querySelectorAll(settingsStyle).length, 1);
  assert.equal(document.head.querySelector(settingsStyle), null);
  act(() => rootHandle.unmount());
  assert.equal(document.querySelector(settingsStyle), null);
  assert.equal(document.querySelectorAll(assistantStyle).length, 1);
  act(() => { for (const dispose of effects.splice(0).reverse()) dispose(); });
  assert.equal(document.querySelector(assistantStyle), null);
  assert.equal(chatTranslate.getState('probe-row'), undefined, '卸载清掉行内状态');

  act(() => exported.apply(ctx));
  await mountCard();
  assert.equal(document.querySelectorAll(assistantStyle).length, 1);
  assert.equal(document.querySelectorAll(settingsStyle).length, 1);
  act(() => rootHandle.unmount());
  act(() => { for (const dispose of effects.splice(0).reverse()) dispose(); });
});
console.log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
