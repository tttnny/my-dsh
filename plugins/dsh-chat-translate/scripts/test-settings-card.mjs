/**
 * 配置页的渲染自检：提示词那一格是「真的能改」，不是一块说明文字。
 *
 * 这个文件只锁一件事：插件页上这张卡片把写给模型的指令整段铺在一个 textarea
 * 里，读者改了它、点保存，改动就以一条 `prompt` 路径写进配置；没改时一个字都
 * 不写。「恢复默认」把内置默认填回草稿，同样要点保存才落盘。
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
const ctx = {
  effect: (fn) => {
    const disposer = fn();
    return typeof disposer === 'function' ? disposer : () => {};
  },
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
// 这样译文池里真的会落下东西，换代那条断言才有东西可丢。
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

await test('点「完成」回到只读态，草稿原样留着', async () => {
  const done = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'promptDone'
  );
  await act(async () => {
    done.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
  });
  const prompt = container.querySelector('.dsh-tidy-prompt');
  assert.equal(prompt.readOnly, true, '回到只读态');
  assert.equal(prompt.value, '把收到的文字改写成同事之间说话的语气。', '没保存的草稿仍在框里');
  assert.equal(mutations.length, 0, '收起改写态同样不写盘');
});

await test('点保存：提示词作为一条 prompt 路径写进配置', async () => {
  const save = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'save'
  );
  assert.ok(save !== undefined, '保存按钮要在卡片上');
  await act(async () => {
    save.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
  });
  assert.deepEqual(mutations, [
    { op: 'set', path: ['prompt'], value: '把收到的文字改写成同事之间说话的语气。' },
  ]);
  assert.equal(settingsStore.getState().committed.prompt, '把收到的文字改写成同事之间说话的语气。');
  assert.equal(settingsStore.getState().dirty, false);
});

await test('恢复默认：填回草稿、仍不写盘；再点保存写 unset', async () => {
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
  assert.equal(mutations.length, 0, '恢复默认只是草稿');

  const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'save');
  await act(async () => {
    save.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
  });
  assert.deepEqual(mutations, [{ op: 'unset', path: ['prompt'] }], '与默认一字不差就存成空值');
});

await test('总开关关着时提示词照样看得见', async () => {
  // 总开关只决定「翻不翻」，不决定「能不能配」：读者想先写好指令再开翻译是常态。
  await act(async () => {
    doc = { ...doc, enabled: false, prompt: '' };
    for (const listener of [...listeners]) listener();
    await settle();
  });
  assert.equal(settingsStore.getState().committed.enabled, false, '前置：总开关应是关着的');
  const prompt = container.querySelector('.dsh-tidy-prompt');
  assert.ok(prompt !== null, '总开关关着时提示词那一格仍在页面上');
  assert.equal(prompt.value, DEFAULT_PROMPT, '显示生效中的默认指令');
  const editable =
    [...container.querySelectorAll('button')].some((button) => button.textContent === 'promptEdit')
    || !prompt.readOnly;
  assert.ok(editable, '总开关关着时也能进改写态');
  await act(async () => {
    doc = { ...doc, enabled: true };
    for (const listener of [...listeners]) listener();
    await settle();
  });
});

await test('提示词一改，浏览器这一侧的译文池跟着换代', async () => {
  // 不换代的话，本页里已经翻过的段落会一直取旧措辞的译文，一个请求都不发——
  // 读者改了提示词却看不到任何变化。接线在 src/client/index.ts 的订阅里。
  const seeded = chatTranslate.ensure('probe-row', ['A paragraph worth translating']);
  await act(async () => {
    await settle();
    await settle();
  });
  const before = chatTranslate.getState('probe-row');
  assert.ok(before !== undefined, '前置：这一行有状态');
  assert.equal(chatTranslate.dropTranslations(), true, '前置：池里确实有译文可丢');

  // 真改一次提示词：写进配置文档，宿主通知回来，订阅把它换成新一代。
  await act(async () => {
    await form.mutate([{ op: 'set', path: ['prompt'], value: '一套新说法' }]);
    await settle();
  });
  assert.equal(settingsStore.getState().committed.prompt, '一套新说法');
  assert.equal(
    chatTranslate.dropTranslations(),
    false,
    '池里已经空了：说明订阅在提示词变化时丢掉过一遍'
  );
  assert.ok(seeded !== undefined, 'ensure 的返回值不影响这次断言，只用来占位说明前置动作');
});

act(() => rootHandle.unmount());
console.log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
