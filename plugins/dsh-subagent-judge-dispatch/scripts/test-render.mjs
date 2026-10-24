/**
 * 渲染自检：用真 react 把配置卡片画进 jsdom，锁住这次界面的三件事。
 *
 *   1. 试通与预览两个按钮在判断服务那一节的保存行里，不在标题栏；
 *   2. 判断日志那张表是六列：结果、选择、主代理、子代理、时间、耗时——结果在最左，
 *      模型·强度合成一格，供应商只在悬停时补上；
 *   3. 点一行开出来的弹窗只讲一件事：这次发给判断模型的完整内容。结果、选择、
 *      主代理这些行上已经有了，弹窗不再各列一遍；那段正文自己换行，高了在框里滚动。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 是替身：真组件是浏览器里的 ESM、带 .css
 * 导入，Node 里跑不起来。替身只把 children 与 aria 原样渲染，所以这里验的是本插件
 * 自己的视图结构；真组件的外观与浮层定位要在浏览器里看（`tools/gui-shot.mjs`）。
 *
 * 跑法：node scripts/test-render.mjs
 */
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { installDom, loadClientBundle, primitivesStub } from '../../../tools/lib/dom-harness.mjs';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));

const dom = installDom(JSDOM, { storage: true, raf: true });
/** Tooltip 替身给每个气泡发一个 id，锚点靠它指过来。 */
let nextTipId = 0;
const { createElement, cloneElement, Fragment, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { createPortal } = await import('react-dom');

const FAILED_FOR_LEGIBILITY = '原文很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长的一段主代理标题';

/** 一份按宿主形状返回的日志：一条判成、一条没判成。 */
const ENTRIES = [
  {
    typeId: 3,
    provider: 'magpie',
    model: 'deepseek/deepseek-flash',
    effort: 'high',
    at: Date.parse('2026-10-23T17:33:26+08:00'),
    latencyMs: 251,
    parentTitle: FAILED_FOR_LEGIBILITY,
    childLabel: 'Map admin audio pipeline',
    prompt: '{\n  "model": "bailian-decision/decision-model-preview",\n  "state": {\n    "message": "Map admin audio pipeline"\n  }\n}',
  },
  {
    typeId: null,
    provider: 'magpie',
    model: 'deepseek/deepseek-flash',
    effort: '',
    reason: 'unmatched',
    at: Date.parse('2026-10-23T22:27:04+08:00'),
    latencyMs: 229,
    parentTitle: '另一个主代理',
    childLabel: '跑一下测试',
    prompt: '',
  },
];

/** 剪贴板替身：记下最后一次写进去的文本，写成功与否由 `clipboardWorks` 决定。 */
const clipboard = { text: null };
let clipboardWorks = true;

/** ui-primitives 替身：只还原本测试关心的渲染结果。 */
const primitives = primitivesStub({
  writeClipboard: async (text) => {
    clipboard.text = text;
    return clipboardWorks;
  },
  Modal: ({ open, onClose, closeLabel, title, description, children, footer }) => open
    ? createElement(
      'div',
      { role: 'dialog', 'data-title': title },
      createElement('button', { type: 'button', 'aria-label': closeLabel, onClick: onClose }, '×'),
      description === undefined ? null : createElement('p', null, description),
      children,
      footer === undefined ? null : createElement('div', { className: 'modal-footer' }, footer),
    )
    : null,
  Input: ({ className, ...rest }) => createElement('input', { ...rest, className }),
  Button: ({ children, onClick, disabled }) => createElement(
    'button',
    { type: 'button', disabled: disabled === true ? true : undefined, onClick },
    children,
  ),
  Switch: ({ checked, onChange, label }) => createElement('input', {
    type: 'checkbox',
    checked,
    'aria-label': label,
    onChange: (event) => onChange(event.target.checked),
  }),
  Tag: ({ children }) => createElement('span', null, children),
  CodeBlock: ({ code }) => createElement('pre', { 'data-code': code }, code),
  SegmentedTabs: ({ items, value, onChange }) => createElement(
    'div',
    { role: 'tablist' },
    items.map((item) => createElement(
      'button',
      { key: item.value, type: 'button', role: 'tab', 'aria-selected': item.value === value, onClick: () => onChange(item.value) },
      item.label,
    )),
  ),
  Menu: ({ anchor }) => anchor,
  // 真 Tooltip 把锚点原样渲染，气泡另挂在 body 上、用 aria-describedby 指过去。
  // 替身要保住这条：否则「截断时才有气泡」这类断言只能靠猜。
  Tooltip: ({ label, children }) => {
    nextTipId += 1;
    const id = `tip-${nextTipId}`;
    const anchor = cloneElement(children, { 'aria-describedby': id });
    // 气泡走 portal：真 Tooltip 的 `portal` 就是这样，留在行里会变成第 7 个格子。
    return createElement(
      Fragment,
      null,
      anchor,
      createPortal(createElement('span', { id, role: 'tooltip' }, label), document.body),
    );
  },
});

const exported = await loadClientBundle({ root, primitives });

/** 本测试直接拿座位组件来画，不关心注册细节。 */
const registrations = [];
const ctx = {
  effect: (fn) => { fn(); return () => {} },
  inject: (_names, fn) => { fn(ctx); return () => {} },
  slots: {
    inject: (_key, register) => { register(); return () => {} },
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
  configForms: {
    get: () => ({
      getSnapshot: () => ({
        status: 'ready',
        writable: true,
        revision: 1,
        value: {
          enabled: true,
          logEnabled: true,
          endpointUrl: 'http://127.0.0.1:3425/v1/systemone',
          judgeModel: 'bailian-decision/decision-model-preview',
          rows: [{ description: '机械修改', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' }],
        },
      }),
      subscribe: () => () => {},
      mutate: async () => true,
    }),
    whileServed: (_namespaces, register) => register(new Set()),
  },
  remote: {
    session: { modelCatalog: async () => ({ ok: true, value: { groups: [] } }) },
    credentials: {
      describe: async () => ({ ok: true, value: {} }),
      set: async () => ({ ok: true }),
      unset: async () => ({ ok: true }),
    },
  },
  locale: { register: () => () => {}, bind: () => (key) => key },
};
exported.apply(ctx);
const seat = registrations.find((entry) => entry.options.name === 'plugins.bundle.config');
assert.ok(seat !== undefined, '配置卡片没有注册');

// 日志那条路由由插件的 remote 走 fetch；这里把宿主那三条读拦下来。
globalThis.fetch = async (url) => {
  if (String(url).endsWith('/log')) {
    return new Response(JSON.stringify({ ok: true, entries: ENTRIES }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

const container = document.createElement('div');
document.body.appendChild(container);
const reactRoot = createRoot(container);
const Card = seat.component;
/** 座位上的 `t`：用插件自己的字典，验的是读者真会看到的那句话。 */
const { zh } = exported.__dictionaries;
const t = (key) => zh[key] ?? key;

const render = async () => {
  await act(async () => {
    reactRoot.render(createElement(Card, { t }));
  });
  await act(async () => { await new Promise((tick) => setTimeout(tick, 0)); });
};
await render();

const buttons = () => [...container.querySelectorAll('button')];
const buttonByText = (text) => buttons().find((node) => node.textContent?.trim() === text);
const click = async (node) => {
  assert.ok(node !== undefined, '要点的那个控件应当在场');
  await act(async () => { node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise((tick) => setTimeout(tick, 0)); });
};

/**
 * 往受控输入框里打字。
 *
 * React 记着上一次渲染时节点上的值，直接赋 `node.value` 会被它当成「没变」而
 * 丢掉这次 input；走原型上的原生 setter 赋值，React 读到的是真的变化。
 */
const type = async (node, value) => {
  const proto = node instanceof dom.window.HTMLTextAreaElement
    ? dom.window.HTMLTextAreaElement.prototype
    : dom.window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
    node.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () => { await new Promise((tick) => setTimeout(tick, 0)); });
};

let passed = 0;
let total = 0;
const test = async (label, fn) => {
  total += 1;
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`);
    throw error;
  }
};

await test('试通与预览两个按钮在保存行里，不在标题栏', () => {
  const probe = buttonByText(zh['judge.probe']);
  const preview = buttonByText(zh['preview.open']);
  assert.ok(probe !== undefined, '试通按钮应当在场');
  assert.ok(preview !== undefined, '预览按钮应当在场');
  // 两者同在一个 .dsh-judge-actions 里，且与「保存」同在那一行。
  const row = probe.closest('.dsh-judge-actions');
  assert.ok(row !== null, '试通按钮应当落在某一节的保存行里');
  assert.equal(preview.closest('.dsh-judge-actions'), row, '两个按钮在同一行');
  assert.equal(buttonByText(zh['save.button'])?.closest('.dsh-judge-actions'), row, '跟保存同一行');
  // 标题栏里不再有按钮。
  const head = probe.closest('.dsh-judge-section')?.querySelector('.dsh-judge-head');
  assert.equal(head?.querySelectorAll('button').length ?? 0, 0, '标题栏里不该再有按钮');
});

await test('导出把整份清单按纯 JSON 复制走', async () => {
  clipboard.text = null;
  clipboardWorks = true;
  await click(buttonByText(zh['rows.export']));
  const parsed = JSON.parse(clipboard.text ?? 'null');
  assert.deepEqual(parsed, [
    { description: '机械修改', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' },
  ], '导出的是清单本身，不带编号');
  assert.equal(container.textContent?.includes(zh['rows.exported']), true, '复制成功要说一声');
});

await test('导出失败时如实报错，不装作复制好了', async () => {
  clipboardWorks = false;
  await click(buttonByText(zh['rows.export']));
  assert.equal(container.textContent?.includes(zh['rows.exportFailed']), true);
  clipboardWorks = true;
});

await test('导入是粘贴，粘进来的清单只填表，保存仍要另按', async () => {
  await click(buttonByText(zh['rows.importOpen']));
  const box = container.querySelector('textarea.dsh-judge-paste');
  assert.ok(box !== null, '导入弹窗里应当有一个粘贴框');

  const pasted = JSON.stringify([
    { description: '评审代码', provider: 'a6api', model: 'kimi-k3', effort: 'high' },
    { description: '跑测试', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' },
  ]);
  await type(box, pasted);
  await click(buttonByText(zh['rows.importApply']));

  const rows = [...container.querySelectorAll('.dsh-judge-table tbody tr')];
  // 第二格是描述；模型与强度各有自己的格子。
  assert.deepEqual(
    rows.map((line) => line.children[1].querySelector('input').value),
    ['评审代码', '跑测试'],
    '表里换成了粘进来的两条',
  );
  assert.deepEqual(
    rows.map((line) => line.children[2].querySelector('input').value),
    ['a6api/kimi-k3', 'magpie/deepseek/deepseek-flash'],
    '模型也跟着换了',
  );
  assert.deepEqual(
    rows.map((line) => line.children[3].querySelector('input').value),
    ['high', 'low'],
    '强度也跟着换了',
  );
  // 导入落在草稿里：清单那一节的保存按钮此刻可点，说明还没写进文档。
  const rowsSection = buttonByText(zh['rows.importOpen'])?.closest('.dsh-judge-section');
  const saveButton = [...(rowsSection?.querySelectorAll('button') ?? [])]
    .find((node) => node.textContent?.trim() === zh['save.button']);
  assert.equal(saveButton?.disabled, false, '导入之后仍要读者自己按保存');
});

await test('粘进来的不是清单时说清楚是哪一种问题', async () => {
  await click(buttonByText(zh['rows.importOpen']));
  const box = container.querySelector('textarea.dsh-judge-paste');
  await type(box, '{不是 JSON');
  await click(buttonByText(zh['rows.importApply']));
  assert.equal(container.textContent?.includes(zh['rows.importBadJson']), true, '这不是 JSON 就要这么说');

  await type(box, '[{"description": 1}]');
  await click(buttonByText(zh['rows.importApply']));
  assert.equal(container.textContent?.includes(zh['rows.importBadShape']), true, '字段不是文字就算形状不对');

  await type(box, '[]');
  await click(buttonByText(zh['rows.importApply']));
  assert.equal(container.textContent?.includes(zh['rows.importEmpty']), true, '空清单不算一次导入');

  await click(buttonByText(zh['rows.importCancel']));
  assert.equal(container.querySelector('textarea.dsh-judge-paste'), null, '取消之后弹窗关掉');
});

await test('点开日志页后，六列按顺序摆好', async () => {
  await click([...container.querySelectorAll('[role="tab"]')].find((node) => node.textContent === zh['tab.log']));
  const head = container.querySelector('.dsh-judge-log-head');
  assert.ok(head !== null, '日志表应当画出来了');
  assert.deepEqual(
    [...head.children].map((cell) => cell.textContent),
    [zh['log.colResult'], zh['log.colChoice'], zh['log.colParent'], zh['log.colChild'], zh['log.colTime'], zh['log.colLatency']],
    '列的顺序就是读者扫一眼的顺序：结果最左，然后是选择、主代理、子代理',
  );
});

await test('「结果」列写「类型 3」与「未判成」，不写编号以外的花话', async () => {
  const rows = [...container.querySelectorAll('.dsh-judge-log-row:not(.dsh-judge-log-head)')];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].children[0].textContent, '类型 3');
  assert.equal(rows[1].children[0].textContent, '未判成');
  // 没判成的原因不在这一列里展开：悬停才说，列宽留给编号。
  assert.equal(rows[1].children[0].getAttribute('title'), null, '不用原生 title，那样键盘够不到');
  const described = rows[1].children[0].getAttribute('aria-describedby');
  assert.ok(described !== null, '这一格应当挂着 Tooltip');
  assert.equal(document.getElementById(described)?.textContent, zh['reason.unmatched']);
});

await test('「选择」列只写模型与强度，悬停才带上供应商', () => {
  const rows = [...container.querySelectorAll('.dsh-judge-log-row:not(.dsh-judge-log-head)')];
  assert.equal(rows[0].children[1].textContent, 'deepseek/deepseek-flash · high');
  const described = rows[0].children[1].getAttribute('aria-describedby');
  assert.ok(described !== null, '这一格应当挂着 Tooltip');
  assert.equal(
    document.getElementById(described)?.textContent,
    'magpie · deepseek/deepseek-flash · high',
    '悬停的那一段才把供应商写在前面',
  );
  // 没判成时强度可能读不到，不能留下悬空的分隔点。
  assert.equal(rows[1].children[1].textContent, 'deepseek/deepseek-flash');
  const missing = rows[1].children[1].getAttribute('aria-describedby');
  assert.equal(document.getElementById(missing)?.textContent, 'magpie · deepseek/deepseek-flash');
});

await test('「主代理」与「子代理」两列各放各的内容', () => {
  const rows = [...container.querySelectorAll('.dsh-judge-log-row:not(.dsh-judge-log-head)')];
  assert.equal(rows[0].children[2].textContent, FAILED_FOR_LEGIBILITY);
  assert.equal(rows[0].children[3].textContent, 'Map admin audio pipeline');
  assert.equal(rows[1].children[2].textContent, '另一个主代理');
  assert.equal(rows[1].children[3].textContent, '跑一下测试');
});

await test('未判成的那一格只写「未判成」，原因留给悬停', () => {
  const rows = [...container.querySelectorAll('.dsh-judge-log-row:not(.dsh-judge-log-head)')];
  const cell = rows[1].children[0];
  assert.equal(cell.textContent, '未判成');
  // 原因不在格子文字里、也不在原生 title 上——气泡走宿主的 Tooltip，
  // 它的文案在 `aria-describedby` 指向的那个 span 里。
  assert.equal(cell.getAttribute('title'), null, '不用原生 title，那样键盘够不到');
  const anchor = cell.parentElement?.getAttribute('aria-describedby') ?? cell.getAttribute('aria-describedby');
  assert.ok(anchor !== null && anchor !== undefined, '这一格应当挂着 Tooltip');
  assert.equal(document.getElementById(anchor)?.textContent, zh['reason.unmatched']);
});

await test('放不下的那几格要能截断，不写出格', () => {
  const rows = [...container.querySelectorAll('.dsh-judge-log-row:not(.dsh-judge-log-head)')];
  for (const index of [1, 2, 3]) {
    assert.ok(rows[0].children[index].classList.contains('dsh-judge-cell-clip'), '这一格要能截断');
  }
});

await test('点一行开出来的弹窗只讲这段提示词', async () => {
  const rows = [...container.querySelectorAll('.dsh-judge-log-row:not(.dsh-judge-log-head)')];
  await click(rows[0]);
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog !== null, '弹窗应当打开');
  assert.equal(dialog.getAttribute('data-title'), zh['log.promptTitle']);
  assert.equal(dialog.querySelector('pre')?.getAttribute('data-code'), ENTRIES[0].prompt, '弹窗里就是那条请求体');
  // 请求体外面这一层负责两件事：正文自己换行，高了在框里滚动。
  assert.ok(dialog.querySelector('pre')?.closest('.dsh-judge-prompt') !== null, '请求体应当套在会滚动的框里');
  // 行上已有的标签不在弹窗里再列一遍。只看标签，不看正文：提示词里本来就会有
  // 主代理写的任务文字，那是它该有的内容，不是「重复列了一遍」。
  const labels = [...dialog.querySelectorAll('*')]
    .filter((node) => node.children.length === 0 && node !== dialog.querySelector('p'))
    .map((node) => node.textContent?.trim());
  for (const label of [zh['log.colResult'], zh['log.colChoice'], zh['log.colParent'], zh['log.colChild'], zh['log.colTime'], zh['log.colLatency']]) {
    assert.equal(labels.includes(label), false, `弹窗不该再有一行「${label}」`);
  }
  // 这些值只该在提示词正文里出现，不该作为一行标签旁边的值再列一次。
  const paragraphs = [...dialog.querySelectorAll('p')].map((node) => node.textContent);
  for (const value of ['类型 3', 'magpie · deepseek/deepseek-flash · high', '251 毫秒']) {
    assert.equal(paragraphs.includes(value), false, `弹窗不该把「${value}」再列一遍`);
  }
});

await test('这次没发出请求时，弹窗说清楚，而不是给一个空框', async () => {
  await click(document.querySelector('[role="dialog"] button'));
  const rows = [...container.querySelectorAll('.dsh-judge-log-row:not(.dsh-judge-log-head)')];
  await click(rows[1]);
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog !== null);
  assert.equal(dialog.querySelector('pre'), null, '没有内容就不该画一个空代码块');
  assert.equal(dialog.textContent?.includes(zh['log.promptEmpty']), true);
});

console.log(`${passed}/${total} passed`);
