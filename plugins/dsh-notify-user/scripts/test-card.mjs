/**
 * 进度卡与配置卡的渲染自检：用真 react 把两种座位画进 jsdom。
 *
 * 锁住这几件事：
 *
 *   1. 只报摘要时卡片只有标题行，没有正文、没有折叠键；
 *   2. 折叠键长在圆点里，两个状态都只在悬停时出现；展开时箭头朝上；
 *   3. 正文默认收起时正文不出现，点圆点出现；默认展开时直接出现；
 *   4. 「始终展开」没有折叠键，正文始终展开；
 *   5. 配置卡的汇报形态是两选一、正文显示是三选一，写入各自的字段；
 *      只报摘要时正文显示整行不出现；
 *   6. 标题行时间默认不画，打开 `showTime` 才画；摘要按散文渲染时没有这一行。
 *
 * 断言只比布尔或文本，不比 DOM 节点：失败信息里 `util.inspect` 一个 jsdom 元素
 * 会顺着 ownerDocument 爬进整个窗口，慢到看起来像卡死。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 是替身：真组件是浏览器里的 ESM、带 .css
 * 导入，Node 里跑不起来。替身只把文本与 aria 原样渲染出来，所以这里验证的是本插件
 * 自己的视图结构与事件接线；真组件的外观要在浏览器里看。
 *
 * 运行：node scripts/test-card.mjs
 */
import assert from 'node:assert/strict';
import { syncedConfig } from './lib/client-bundle.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { installDom, loadClientBundle, primitivesStub } from '../../../tools/lib/dom-harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 失败时别让 jsdom 的窗口把事件循环挂住：直接以失败码退出。
process.on('uncaughtException', (error) => { console.error(error); process.exit(1); });
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });

installDom(JSDOM);
const { createElement, act, useSyncExternalStore } = await import('react');
const { createRoot } = await import('react-dom/client');

/** ui-primitives 替身：开关画成带 aria 的按钮，markdown 只把文本画出来。 */
const primitives = primitivesStub({
  Switch: ({ checked, onChange, label, disabled }) => createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': checked ? 'true' : 'false',
    'aria-label': label,
    disabled: disabled === true,
    onClick: () => { onChange(!checked); },
  }),
  Pill: ({ children, active, onClick }) => createElement('button', {
    type: 'button',
    'aria-pressed': active ? 'true' : 'false',
    onClick,
  }, children),
  Input: (props) => createElement('input', props),
  Tooltip: ({ children }) => children,
  IconInfoOutlineRegular: () => createElement('span', { 'aria-hidden': 'true' }),
  IconChevronDownOutlineRegular: ({ className }) => createElement('span', { className, 'data-chevron': 'true' }),
  TextShimmer: ({ children }) => createElement('span', null, children),
  MarkdownDelegateProvider: ({ children }) => createElement('div', null, children),
  MarkdownText: ({ text }) => createElement('span', { 'data-markdown': text }, text),
});

const exported = await loadClientBundle({ root, primitives });

/** 注册项：配置卡与工具行兜底渲染都从这里拿。 */
const registrations = [];

/** 可变的配置表单：改字段会通知订阅者。 */
let configValue = {
  nudgeAfter: 10,
  collapsible: true,
  summaryOnly: false,
  summaryRender: 'card',
  bodyExpandedByDefault: false,
  showTime: false,
  cardPlacement: 'boundary',
  defaultEnabled: true,
  sessionOverrides: {},
};
const writes = [];
const listeners = new Set();
/** 表单状态：`loading` 用来验配置晚到的顺序。 */
let configStatus = 'ready';
/** 每次写入的延时：用来验写入队列不并行。 */
let setDelay = 0;
let inFlight = 0;
let maxInFlight = 0;
const form = {
  getSnapshot: () => ({ status: configStatus, value: configStatus === 'ready' ? configValue : undefined }),
  subscribe: (listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  set: async (field, value) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    if (setDelay > 0) await new Promise((resolve) => { setTimeout(resolve, setDelay); });
    writes.push([field, value]);
    configValue = { ...configValue, [field]: value };
    inFlight -= 1;
    for (const listener of listeners) listener();
    return true;
  },
};

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
  locale: {
    register: () => () => {},
    bind: () => (key) => key,
  },
  uiConversation: { events: { register: () => () => {} } },
};

const synced = syncedConfig(field => field === 'cardPlacement' ? 'inline' : form.getSnapshot().value?.[field], form.subscribe);
exported.apply(ctx, synced);

const toolview = registrations.find((entry) => entry.options?.name === 'tool.call.toolview');
const configCard = registrations.find((entry) => entry.options?.name === 'plugins.bundle.config');
assert.ok(toolview !== undefined, '工具行兜底渲染没有注册');
assert.ok(configCard !== undefined, '配置卡没有注册');

/** 文案：只还原本测试用到的键。 */
const table = {
  'row.fallbackTitle': '更新',
  'markdown.copy': '复制',
  'markdown.copied': '已复制',
  'markdown.footnotes': '脚注',
  'row.failed': '汇报失败',
  'config.defaultEnabled.label': '默认开启',
  'config.threshold.label': '催办阈值',
  'config.threshold.unit': '次',
  'config.resetOnProse.label': '散文回复清零',
  'config.placement.label': '进度卡位置',
  'config.placement.boundary': '步骤组边界',
  'config.placement.inline': '跟随工具行',
  'config.reportMode.label': '汇报形态',
  'config.reportMode.structured': '结构化正文',
  'config.reportMode.summary': '只报摘要',
  'config.summaryRender.label': '摘要呈现',
  'config.summaryRender.card': '进度卡',
  'config.summaryRender.prose': '散文',
  'config.bodyMode.label': '正文显示',
  'config.bodyMode.always': '始终展开',
  'config.bodyMode.collapsed': '默认收起',
  'config.bodyMode.expanded': '默认展开',
  'config.showTime.label': '显示时间',
  'config.write.failed': '没写进去，再改一次试试。',
  'config.unavailable': '这份配置现在读不到。',
};
const t = (key) => table[key] ?? key;

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
    process.exit(1);
  }
}

const container = document.createElement('div');
document.body.appendChild(container);

/** 每个用例都换一个新的根：卡片把「默认展开」记在挂载时的状态里。 */
let viewRoot;
function mount(element) {
  if (viewRoot !== undefined) act(() => { viewRoot.unmount(); });
  container.replaceChildren();
  viewRoot = createRoot(container);
  act(() => { viewRoot.render(element); });
}

/** 每个用例都从「结构化正文、可折叠、默认收起」开始。 */
function reset(value = {}) {
  configValue = {
    nudgeAfter: 10,
    collapsible: true,
    summaryOnly: false,
    summaryRender: 'card',
    bodyExpandedByDefault: false,
    showTime: false,
    cardPlacement: 'boundary',
    defaultEnabled: true,
    sessionOverrides: {},
    ...value,
  };
  writes.length = 0;
  configStatus = 'ready';
  setDelay = 0;
  maxInFlight = 0;
}

/** 画一张进度卡；默认是一张落定的、带标题与正文的卡。 */
function renderCard({ meta = { title: '标题', message: '正文' }, ...props } = {}) {
  const hooks = Object.fromEntries(Object.entries(toolview.options.inject().hooks).map(([name, ref]) => [
    `use${name[0].toUpperCase()}${name.slice(1)}`,
    selector => selector(useSyncExternalStore(ref.subscribe, ref.getSnapshot)),
  ]));
  mount(createElement(toolview.component, {
    phase: 'result',
    block: { time: 1000, meta },
    openFile: () => {},
    ...hooks,
    t,
    ...props,
  }));
}

/** 画配置卡。 */
function renderConfigCard() {
  mount(createElement(configCard.component, { form, t }));
}

/** 卡片正文的文本；没有正文时为 undefined。 */
const bodyText = () => container.querySelector('.dsh-notify-body')?.textContent ?? undefined;
/** 标题行右侧的时间文本；没有时为 undefined。 */
const timeText = () => container.querySelector('.dsh-notify-time')?.textContent ?? undefined;
/** 折叠键在不在（不管长在哪儿）。 */
const hasChevron = () => container.querySelector('.dsh-notify-chevron') !== null;
/** 折叠键在不在圆点里。 */
const chevronInDot = () => container.querySelector('.dsh-notify-dot .dsh-notify-chevron') !== null;
/** 折叠按钮在不在。 */
const hasToggle = () => container.querySelector('.dsh-notify-toggle') !== null;
/** 按 aria-label 找开关；没有时返回 undefined。 */
const switchOf = (label) => container.querySelector(`[role="switch"][aria-label="${label}"]`) ?? undefined;
/** 按 aria-label 找一组切换按钮。 */
const groupOf = (label) => container.querySelector(`[role="group"][aria-label="${label}"]`) ?? undefined;
/** 在某一组里按文字找一个切换按钮。 */
const pillOf = (groupLabel, text) => {
  const group = groupOf(groupLabel);
  if (group === undefined) return undefined;
  return [...group.querySelectorAll('button')].find((button) => button.textContent === text) ?? undefined;
};
/** 点一个元素。 */
const click = (element) => {
  act(() => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); });
};

/** 让排队中的写入落定。 */
const flush = async () => { await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); }); };

await test('只报摘要：只有标题行，没有正文也没有折叠键', () => {
  reset({ summaryOnly: true });
  renderCard();
  assert.equal(bodyText(), undefined, '摘要模式不该画正文');
  assert.equal(hasChevron(), false, '摘要模式不该有折叠键');
  assert.equal(hasToggle(), false, '摘要模式不该有折叠按钮');
  assert.equal(container.querySelector('.dsh-notify-card')?.hasAttribute('data-collapsible'), false, '摘要模式不该进入可折叠态');
  assert.equal(container.querySelector('.dsh-notify-title').textContent, '标题');
});

await test('只报摘要：历史卡片没有标题时取正文首行当摘要', () => {
  reset({ summaryOnly: true });
  renderCard({ meta: { message: '第一行\n第二行' } });
  assert.equal(container.querySelector('.dsh-notify-title').textContent, '第一行');
  assert.equal(bodyText(), undefined, '摘要模式不该画正文');
});

await test('只报摘要 + 散文：不画卡片，标题按普通段落渲染', () => {
  reset({ summaryOnly: true, summaryRender: 'prose' });
  renderCard();
  assert.ok(container.querySelector('.dsh-notify-card') === null, '散文模式不该画卡片');
  assert.ok(container.querySelector('.dsh-notify-dot') === null, '散文模式不该画圆点');
  assert.ok(container.querySelector('.dsh-notify-time') === null, '散文模式不该画时间');
  assert.equal(hasChevron(), false, '散文模式不该有折叠键');
  assert.match(container.textContent, /标题/);
});

await test('正文默认收起：折叠键长在圆点里，点圆点展开正文', () => {
  reset({ bodyExpandedByDefault: false });
  renderCard();
  assert.equal(bodyText(), undefined, '收起时不该画正文');
  assert.equal(hasToggle(), true, '收起时应当有折叠按钮');
  assert.equal(chevronInDot(), true, '折叠键应当在圆点里');
  click(container.querySelector('.dsh-notify-toggle'));
  assert.equal(bodyText(), '正文');
});

await test('正文默认展开：正文直接出现，圆点标成打开（悬停时箭头朝上）', () => {
  reset({ bodyExpandedByDefault: true });
  renderCard();
  assert.equal(bodyText(), '正文');
  assert.equal(container.querySelector('.dsh-notify-dot')?.hasAttribute('data-open'), true);
  assert.equal(chevronInDot(), true, '折叠键仍在圆点里，悬停时才显示');
});

await test('始终展开：没有折叠按钮与折叠键，正文始终展开', () => {
  reset({ collapsible: false, bodyExpandedByDefault: false });
  renderCard();
  assert.equal(hasToggle(), false, '始终展开不该有折叠按钮');
  assert.equal(hasChevron(), false, '始终展开不该有折叠键');
  assert.equal(bodyText(), '正文');
});

await test('标题行时间默认不画，只剩圆点与标题', () => {
  reset();
  renderCard();
  assert.equal(timeText(), undefined, '默认不该画时间');
  assert.equal(container.querySelector('.dsh-notify-title').textContent, '标题');
});

await test('打开显示时间后画出 MM-DD HH:mm', () => {
  reset({ showTime: true });
  renderCard();
  assert.match(timeText() ?? '', /^\d{2}-\d{2} \d{2}:\d{2}$/, '应当画出格式化后的时间');
});

await test('配置卡：显示时间默认关，点开关写入 showTime', async () => {
  reset();
  renderConfigCard();
  const toggle = switchOf('显示时间');
  assert.ok(toggle !== undefined, '缺显示时间开关');
  assert.equal(toggle.getAttribute('aria-checked'), 'false', '默认应当是关的');
  click(toggle);
  await flush();
  assert.deepEqual(writes, [['showTime', true]]);
});

await test('配置卡：摘要按散文渲染时没有显示时间这一行', () => {
  reset({ summaryOnly: true, summaryRender: 'prose' });
  renderConfigCard();
  assert.equal(switchOf('显示时间') === undefined, true, '不画卡片就不该有这一行');
});

await test('配置卡：摘要仍画进度卡时有显示时间这一行', () => {
  reset({ summaryOnly: true, summaryRender: 'card' });
  renderConfigCard();
  assert.ok(switchOf('显示时间') !== undefined, '摘要卡也带时间');
});

await test('配置卡：汇报形态两选一，正文显示三选一', () => {
  reset();
  renderConfigCard();
  assert.ok(pillOf('汇报形态', '结构化正文') !== undefined, '缺结构化正文');
  assert.ok(pillOf('汇报形态', '只报摘要') !== undefined, '缺只报摘要');
  assert.ok(pillOf('正文显示', '始终展开') !== undefined, '缺始终展开');
  assert.ok(pillOf('正文显示', '默认收起') !== undefined, '缺默认收起');
  assert.ok(pillOf('正文显示', '默认展开') !== undefined, '缺默认展开');
  assert.equal(pillOf('正文显示', '默认收起').getAttribute('aria-pressed'), 'true', '默认应当是收起');
});

await test('配置卡：切到只报摘要写入 summaryOnly，正文显示整行消失', async () => {
  reset();
  renderConfigCard();
  click(pillOf('汇报形态', '只报摘要'));
  await flush();
  assert.deepEqual(writes, [['summaryOnly', true]]);
  assert.equal(groupOf('正文显示'), undefined, '摘要模式不该再画正文显示');
});

await test('配置卡：只报摘要时出现摘要呈现，切到散文写入 summaryRender', async () => {
  reset({ summaryOnly: true });
  renderConfigCard();
  assert.ok(pillOf('摘要呈现', '进度卡') !== undefined, '缺进度卡');
  assert.ok(pillOf('摘要呈现', '散文') !== undefined, '缺散文');
  click(pillOf('摘要呈现', '散文'));
  await flush();
  assert.deepEqual(writes, [['summaryRender', 'prose']]);
});

await test('配置卡：结构化正文时没有摘要呈现', () => {
  reset();
  renderConfigCard();
  assert.equal(groupOf('摘要呈现'), undefined);
});

await test('配置卡：切到默认展开两个字段一起写', async () => {
  reset();
  renderConfigCard();
  click(pillOf('正文显示', '默认展开'));
  await flush();
  assert.deepEqual(writes, [['collapsible', true], ['bodyExpandedByDefault', true]]);
});

await test('配置卡：切到始终展开两个字段一起写', async () => {
  reset();
  renderConfigCard();
  click(pillOf('正文显示', '始终展开'));
  await flush();
  assert.deepEqual(writes, [['collapsible', false], ['bodyExpandedByDefault', false]]);
});

await test('配置卡：从始终展开切到默认展开，两个字段按顺序写', async () => {
  reset({ collapsible: false });
  renderConfigCard();
  click(pillOf('正文显示', '默认展开'));
  await flush();
  assert.deepEqual(writes, [['collapsible', true], ['bodyExpandedByDefault', true]]);
});

await test('配置卡：写入排成一条队列，不并行', async () => {
  reset();
  setDelay = 5;
  maxInFlight = 0;
  renderConfigCard();
  click(switchOf('默认开启'));
  click(pillOf('正文显示', '默认展开'));
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 80); }); });
  assert.equal(maxInFlight, 1, '写入不该并行');
});

await test('配置晚到：默认展开在配置就绪后生效', () => {
  reset({ bodyExpandedByDefault: true });
  configStatus = 'loading';
  renderCard();
  assert.equal(bodyText(), undefined, '加载中先按收起');
  configStatus = 'ready';
  act(() => { for (const listener of listeners) listener(); });
  assert.equal(bodyText(), '正文');
});

await test('失败的工具行显示原因，即便开启摘要散文也不画成功卡', () => {
  reset({ summaryOnly: true, summaryRender: 'prose' });
  renderCard({ block: {
    time: 1000,
    isError: true,
    content: [],
    error: { name: 'ValidationError', code: 'INVALID_ARGUMENTS' },
    meta: { title: '未送出的标题' },
  } });
  assert.match(container.textContent, /汇报失败/);
  assert.match(container.textContent, /ValidationError: INVALID_ARGUMENTS/);
  assert.doesNotMatch(container.textContent, /未送出的标题/);
  assert.equal(container.querySelector('.dsh-notify-prose, .dsh-notify-card'), null);
});

act(() => { viewRoot.unmount(); });
container.remove();

console.log(`${passed}/${total} passed`);
