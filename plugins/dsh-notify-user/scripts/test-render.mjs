/**
 * 渲染自检：用真 react 把菜单里的「主动汇报」开关画进 jsdom。
 *
 * 锁住这几件事：
 *
 *   1. 行显示的是当前会话的落定值：会话没有自己的选择就用配置里的默认值；
 *   2. 点开关写的是「按会话的字典」：与默认值不同才留一条，切回默认值就把那条删掉；
 *   3. 宿主拒收时行退回宿主上的值，并把失败交给菜单宿主报出来；
 *   4. 子代理会话里不画这一行（催办本来就不进子代理）；
 *   5. 宿主没服务这份配置时整行不出现。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 是替身：真组件是浏览器里的 ESM、带 .css
 * 导入，Node 里跑不起来。替身只做「把 children 与 aria 原样渲染出来」，所以这里
 * 验证的是本插件自己的视图结构与事件接线；真组件的外观要在浏览器里看。
 *
 * 运行：node scripts/test-render.mjs
 */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { installDom, loadClientBundle, primitivesStub } from '../../../tools/lib/dom-harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

installDom(JSDOM);
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');

/** ui-primitives 替身：开关画成带 aria 的按钮，信息按钮与提示只保留可访问名。 */
const primitives = primitivesStub({
  Switch: ({ checked, onChange, label, disabled }) => createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': checked ? 'true' : 'false',
    'aria-label': label,
    disabled: disabled === true,
    onClick: () => { onChange(!checked); },
  }),
  Button: ({ children, variant, size, ...rest }) => createElement('button', { type: 'button', ...rest }, children),
  Tooltip: ({ children }) => children,
  IconInfoOutlineRegular: () => createElement('span', { 'aria-hidden': 'true' }),
});

const exported = await loadClientBundle({ root, primitives });

/** 注册项：本测试直接拿菜单开关那一项来画。 */
const registrations = [];
const ctx = {
  effect: (fn) => { fn(); return () => {}; },
  get: () => undefined,
  inject: (_names, fn) => { fn(ctx); return () => {}; },
  slots: {
    inject: (_key, register) => { register(); return () => {}; },
    register: (options, component) => { registrations.push({ options, component }); return () => {}; },
  },
  configForms: {
    get: () => form,
    whileServed: (_namespaces, register) => register(new Set()),
  },
  locale: { register: () => () => {}, bind: () => (key) => key },
  uiConversation: { events: { register: () => () => {} } },
};

/** 可变的配置表单：写入按顺序记下来，`accept` 决定宿主收不收。 */
let configValue = { defaultEnabled: true, sessionOverrides: {} };
let accept = true;
const writes = [];
const listeners = new Set();
const form = {
  getSnapshot: () => ({ status: configValue === undefined ? 'unavailable' : 'ready', value: configValue }),
  subscribe: (listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  set: async (field, value) => {
    writes.push([field, value]);
    if (!accept) return false;
    configValue = { ...configValue, [field]: value };
    for (const listener of listeners) listener();
    return true;
  },
};

exported.apply(ctx);

const entry = registrations.find((candidate) => candidate.options?.name === 'conversation.input.model.options');
assert.ok(entry !== undefined, '菜单开关没有注册到 conversation.input.model.options');
assert.equal(typeof entry.component, 'function');

/** 文案：只还原本测试用到的键。 */
const table = {
  'toggle.label': '主动汇报',
  'toggle.infoLabel': '关于主动汇报',
  'toggle.description': '说明',
  'toggle.failed': '没保存上，请重试。',
};
const t = (key) => table[key] ?? key;

const failures = [];
const container = document.createElement('div');
document.body.appendChild(container);
const viewRoot = createRoot(container);

/**
 * 画一行开关。
 * @param overrides - 覆盖默认属性：`sessionId`、`useSession`、`useSessions`、`locked` 等。
 */
function render(overrides = {}) {
  const props = {
    sessionId: 'session-1',
    useSession: (selector) => selector({ subagent: null }),
    useSessions: (selector) => selector({ byId: { 'session-1': { origin: 'startup' } } }),
    locked: false,
    dismiss: () => {},
    reportFailure: (message) => { failures.push(message); },
    form,
    t,
    ...overrides,
  };
  act(() => { viewRoot.render(createElement(entry.component, props)); });
}

/** 当前画出来的开关；没画这一行时返回 undefined。 */
function switchOf() {
  return container.querySelector('[role="switch"]') ?? undefined;
}

/** 点一下开关。 */
function click() {
  const element = switchOf();
  assert.ok(element !== undefined, '开关没画出来');
  act(() => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); });
}

/** 让排队中的写入落定。 */
const flush = async () => { await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); }); };

let passed = 0;
let total = 0;
async function test(label, fn) {
  total += 1;
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`);
    throw error;
  }
}

/** 每个用例都从「默认开启、没有按会话记录」开始。 */
function reset(value = { defaultEnabled: true, sessionOverrides: {} }) {
  configValue = value;
  accept = true;
  writes.length = 0;
  failures.length = 0;
  act(() => { for (const listener of listeners) listener(); });
}

await test('默认开启：没有按会话记录时开关是开的', () => {
  reset();
  render();
  assert.equal(switchOf().getAttribute('aria-checked'), 'true');
  assert.equal(switchOf().getAttribute('aria-label'), '主动汇报');
});

await test('点一下关掉：写入一条与默认值不同的记录', async () => {
  reset();
  render();
  click();
  await flush();
  assert.deepEqual(writes, [['sessionOverrides', { 'session-1': false }]]);
  assert.equal(switchOf().getAttribute('aria-checked'), 'false');
});

await test('再点一下打开：删掉那条记录，不留与默认值相同的值', async () => {
  reset({ defaultEnabled: true, sessionOverrides: { 'session-1': false } });
  render();
  assert.equal(switchOf().getAttribute('aria-checked'), 'false');
  click();
  await flush();
  assert.deepEqual(writes, [['sessionOverrides', {}]]);
  assert.equal(switchOf().getAttribute('aria-checked'), 'true');
});

await test('默认关掉时：新会话是关的，点一下写入显式打开', async () => {
  reset({ defaultEnabled: false, sessionOverrides: {} });
  render();
  assert.equal(switchOf().getAttribute('aria-checked'), 'false');
  click();
  await flush();
  assert.deepEqual(writes, [['sessionOverrides', { 'session-1': true }]]);
  assert.equal(switchOf().getAttribute('aria-checked'), 'true');
});

await test('只改当前会话：别的会话的记录原样留着', async () => {
  reset({ defaultEnabled: true, sessionOverrides: { 'session-2': false } });
  render();
  click();
  await flush();
  assert.deepEqual(writes, [['sessionOverrides', { 'session-2': false, 'session-1': false }]]);
});

await test('宿主拒收：行退回宿主上的值，并报一次失败', async () => {
  reset();
  accept = false;
  render();
  click();
  await flush();
  assert.equal(switchOf().getAttribute('aria-checked'), 'true', '没存住就不该显示关');
  assert.deepEqual(failures, ['没保存上，请重试。']);
});

await test('写入在途时开关不接受第二次点击', async () => {
  reset();
  render();
  click();
  assert.equal(switchOf().disabled, true, '写入在途时应当禁用');
  await flush();
  assert.equal(switchOf().disabled, false, '写入落定后应当恢复');
});

await test('子代理会话不画这一行', () => {
  reset();
  render({ useSession: (selector) => selector({ subagent: { address: 'agent-1' } }) });
  assert.equal(switchOf(), undefined);
});

await test('会话列表里标成子代理的也不画', () => {
  reset();
  render({ useSessions: (selector) => selector({ byId: { 'session-1': { origin: 'subagent' } } }) });
  assert.equal(switchOf(), undefined);
});

await test('宿主没服务这份配置时整行不出现', () => {
  reset();
  configValue = undefined;
  render();
  assert.equal(switchOf(), undefined);
});

await test('锁住时开关不可点', () => {
  reset();
  render({ locked: true });
  assert.equal(switchOf().disabled, true);
});

act(() => { viewRoot.unmount(); });
container.remove();

console.log(`${passed}/${total} passed`);
