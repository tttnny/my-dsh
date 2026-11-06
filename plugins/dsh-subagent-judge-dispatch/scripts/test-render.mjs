/**
 * 渲染自检：用真 react 把配置卡片画进 jsdom，锁住这次界面的四件事。
 *
 *   1. 没有保存按钮：试通在判断服务那节的标题行里，导入、导出、加一行按这个顺序排在
 *      任务类型那节的标题行右端；预览同时用到判断模型与类型清单，单独排在卡片最下面
 *      那一条栏里；行上只有「删掉」，没有「查看」；
 *   2. 文字格离开才写、开关拨了就写；行的问题写在编号列下方；
 *   3. 判断日志那张表是六列：结果、选择、主代理、子代理、时间、耗时——结果在最左，
 *      模型·强度合成一格，供应商只在悬停时补上；
 *   4. 点一行开出来的弹窗只讲一件事：这次发给判断模型的完整内容。结果、选择、
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
  // 真 Menu 把 anchor 渲染在原处、展开时把行挂到浮层上；替身把展开的行渲染在
  // anchor 后面，让「点开选一项」这条路径在 Node 里也走得通。
  Menu: ({ anchor, open, items = [], onSelect }) => createElement(
    'div',
    { className: 'menu-stub' },
    anchor,
    open
      ? createElement(
        'div',
        { role: 'menu' },
        items.filter((item) => item.type !== 'label').map((item) => createElement(
          'button',
          { key: item.id, type: 'button', onClick: () => onSelect?.(item.id) },
          item.label,
        )),
      )
      : null,
  ),
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

/** 宿主那份配置表单：记下每次写入，并把值真的改掉。 */
let hostValue = {
  enabled: true,
  logEnabled: true,
  endpointUrl: 'http://127.0.0.1:3425',
  judgeModel: 'bailian-decision/decision-model-preview',
  rows: [{ description: '机械修改', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' }],
};
const writes = [];
const hostForm = {
  getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value: hostValue }),
  subscribe: () => () => {},
  mutate: async (ops) => {
    writes.push(ops);
    for (const op of ops) {
      if (op.op === 'set') hostValue = { ...hostValue, [op.path[0]]: op.value };
    }
    return true;
  },
};

/** 本测试直接拿座位组件来画，不关心注册细节。 */
const registrations = [];
/** 插件页导航替身：记下「回到插件页列表」被叫了几次。 */
let openedList = 0;
const ctx = {
  effect: (fn) => { fn(); return () => {} },
  get: (name) => (name === 'pluginNavigation' ? { openList: () => { openedList += 1; } } : undefined),
  inject: (_names, fn) => { fn(ctx); return () => {} },
  slots: {
    inject: (_key, register) => { register(); return () => {} },
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
  configForms: {
    get: () => hostForm,
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
/** 两节各有一颗「导入」「导出」，按节找按钮，别拿 DOM 顺序当依据。 */
const buttonIn = (root, text) => [...(root?.querySelectorAll('button') ?? [])]
  .find((node) => node.textContent?.trim() === text);
const judgeSection = () => container.querySelector('.dsh-judge-section');
const rowsSection = () => container.querySelector('.dsh-judge-table')?.closest('.dsh-judge-section');
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

await test('没有保存按钮：试通在判断服务标题行，导入导出与加一行在任务类型标题行，预览在卡片最下面', () => {
  // 断言要有牙齿：字典里没有那个键，页面上也没有那颗按钮——重新加回保存按钮时这里必须红。
  assert.equal(zh['save.button'], undefined, '字典里不该再有「保存」这个键');
  assert.equal(
    buttons().some((node) => node.textContent?.trim() === '保存'),
    false,
    '卡片上不该有保存按钮',
  );

  const probe = buttonByText(zh['judge.probe']);
  assert.ok(probe !== undefined, '试通按钮应当在场');
  const judgeHead = probe.closest('.dsh-judge-section')?.querySelector('.dsh-judge-head');
  assert.ok(judgeHead?.contains(probe), '试通落在判断服务那一节的标题行里');
  // 判断服务那一节的三件动作按「导入、导出、试通」排：前两件是同一份设置的两个方向，
  // 试通是问一句能不能用。
  assert.deepEqual(
    [...(judgeHead?.querySelectorAll('button') ?? [])].map((node) => node.textContent?.trim()),
    [zh['judge.importOpen'], zh['judge.export'], zh['judge.probe']],
    '判断服务标题行按「导入、导出、试通」排',
  );

  // 三件都是整张表的动作，排在任务类型那一节的标题行右端；
  // 顺序固定：先导入再导出，最后才是往表尾续一条的「加一行」。
  const rowsHead = rowsSection()?.querySelector('.dsh-judge-head');
  assert.deepEqual(
    [...(rowsHead?.querySelectorAll('button') ?? [])].map((node) => node.textContent?.trim()),
    [zh['rows.importOpen'], zh['rows.export'], zh['rows.add']],
    '标题行右端按「导入、导出、加一行」排',
  );
  assert.notEqual(rowsHead, judgeHead, '两节的标题行各是各的');

  // 行上只剩「删掉」：说明放不下时点进格子看，不再单开一个弹窗。
  const rowButtons = [...(container.querySelector('.dsh-judge-table tbody tr')?.querySelectorAll('button') ?? [])]
    .map((node) => node.textContent?.trim());
  assert.deepEqual(rowButtons, [zh['rows.remove']], '行上不再有「查看」');

  // 预览同时用到判断模型与类型清单，哪一节都不独占，单独排在两节之外。
  const preview = buttonByText(zh['preview.open']);
  assert.ok(preview !== undefined, '预览按钮应当在场');
  assert.equal(preview.closest('.dsh-judge-section'), null, '预览不该挂在某一节里面');
  assert.ok(preview.closest('.dsh-judge-footer') !== null, '预览应当落在卡片最下面那条栏里');
});

await test('任务类型那一节写明依赖的官方配置，点了跳到那张卡片', async () => {
  const section = rowsSection();
  assert.equal(
    section?.textContent?.includes(zh['rows.dependsOn']),
    true,
    '写明依赖哪份官方配置',
  );
  const open = buttonIn(section, zh['rows.dependsOnOpen']);
  assert.ok(open !== undefined, '去设置的入口应当在场');

  // 宿主插件页上的那张官方卡片：按下它会打开官方配置页。
  const card = document.createElement('li');
  card.setAttribute('data-plugin-item', 'subagent');
  const cardButton = document.createElement('button');
  cardButton.textContent = '子智能体';
  card.appendChild(cardButton);
  document.body.appendChild(card);
  let openedCard = 0;
  cardButton.addEventListener('click', () => { openedCard += 1; });

  const before = openedList;
  await click(open);
  assert.equal(openedList, before + 1, '先回到插件页列表');
  assert.equal(openedCard, 1, '再按下那张官方卡片');
  card.remove();
});

await test('文字格离开才写，写的是这一格的新值', async () => {
  const input = container.querySelector(`input[aria-label="${zh['judge.endpoint']}"]`);
  assert.ok(input !== null, '端点格子应当在场');
  const before = writes.length;
  await type(input, 'http://typed.invalid/v1/systemone');
  assert.equal(writes.length, before, '打字期间一个字节都不写');

  await act(async () => {
    input.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true }));
  });
  await act(async () => { await new Promise((tick) => setTimeout(tick, 0)); });
  assert.equal(writes.length, before + 1, '离开输入框就写一次');
  assert.deepEqual(writes.at(-1), [{ op: 'set', path: ['endpointUrl'], value: 'http://typed.invalid/v1/systemone' }]);
});

await test('判断服务设置导出为纯 JSON，不带密钥', async () => {
  clipboard.text = null;
  clipboardWorks = true;
  await click(buttonIn(judgeSection(), zh['judge.export']));
  assert.deepEqual(JSON.parse(clipboard.text ?? 'null'), {
    endpointUrl: 'http://typed.invalid/v1/systemone',
    judgeModel: 'bailian-decision/decision-model-preview',
  }, '导出的是这一节的两项设置');
  assert.equal(container.textContent?.includes(zh['judge.exported']), true, '复制成功要说一声');
  clipboardWorks = false;
  await click(buttonIn(judgeSection(), zh['judge.export']));
  assert.equal(container.textContent?.includes(zh['judge.exportFailed']), true, '复制失败要如实说');
  clipboardWorks = true;
});

await test('判断服务设置的导入是粘贴，粘进来的整份替换并立即写入', async () => {
  await click(buttonIn(judgeSection(), zh['judge.importOpen']));
  const box = container.querySelector('textarea.dsh-judge-paste');
  assert.ok(box !== null, '导入弹窗里应当有一个粘贴框');
  await type(box, JSON.stringify({
    endpointUrl: 'http://imported.invalid',
    judgeModel: 'judge-y',
  }));
  await click(buttonByText(zh['judge.importApply']));

  assert.equal(
    container.querySelector('input[aria-label="' + zh['judge.endpoint'] + '"]').value,
    'http://imported.invalid',
    '地址换成了粘进来的那条',
  );
  assert.equal(
    container.querySelector('input[aria-label="' + zh['judge.model'] + '"]').value,
    'judge-y',
    '判断模型也跟着换了',
  );
  const ops = writes.at(-1) ?? [];
  assert.deepEqual(ops.map((op) => op.path[0]).sort(), ['endpointUrl', 'judgeModel']);
  assert.equal(container.querySelector('textarea.dsh-judge-paste'), null, '写入之后弹窗关掉');
});

await test('判断服务设置粘错时，三种坏输入各说各的话', async () => {
  await click(buttonIn(judgeSection(), zh['judge.importOpen']));
  const box = container.querySelector('textarea.dsh-judge-paste');
  await type(box, '{不是 JSON');
  await click(buttonByText(zh['judge.importApply']));
  assert.equal(container.textContent?.includes(zh['judge.importBadJson']), true, '这不是 JSON 就要这么说');

  await type(box, '{"endpointUrl":1}');
  await click(buttonByText(zh['judge.importApply']));
  assert.equal(container.textContent?.includes(zh['judge.importBadShape']), true, '字段不是文字就算形状不对');

  await type(box, '{"endpointUrl":"  "}');
  await click(buttonByText(zh['judge.importApply']));
  assert.equal(container.textContent?.includes(zh['judge.importEmpty']), true, '既没地址也没模型不算一次导入');

  await click(buttonByText(zh['judge.importCancel']));
  assert.equal(container.querySelector('textarea.dsh-judge-paste'), null, '取消之后弹窗关掉');
});

await test('行的问题写在编号列下方', async () => {
  await click(buttonIn(rowsSection(), zh['rows.add']));
  const rows = [...container.querySelectorAll('.dsh-judge-table tbody tr')];
  const added = rows.at(-1);
  const numberCell = added?.children[0]?.textContent ?? '';
  assert.ok(numberCell.includes(zh['rows.incomplete']), '新行还没填全，编号列要说「不生效」');
  assert.ok(numberCell.includes(zh['rows.hintNoDescription']), '新行没有描述，编号列要说出来');
});

await test('导出把整份清单按纯 JSON 复制走', async () => {
  clipboard.text = null;
  clipboardWorks = true;
  await click(buttonIn(rowsSection(), zh['rows.export']));
  const parsed = JSON.parse(clipboard.text ?? 'null');
  assert.deepEqual(parsed, [
    { description: '机械修改', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' },
  ], '导出的是清单本身，不带编号');
  assert.equal(container.textContent?.includes(zh['rows.exported']), true, '复制成功要说一声');
});

await test('导出失败时如实报错，不装作复制好了', async () => {
  clipboardWorks = false;
  await click(buttonIn(rowsSection(), zh['rows.export']));
  assert.equal(container.textContent?.includes(zh['rows.exportFailed']), true);
  clipboardWorks = true;
});

await test('导入是粘贴，粘进来的清单直接替换并立即写入', async () => {
  await click(buttonIn(rowsSection(), zh['rows.importOpen']));
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
  // 导入即写入：文档里那一份 rows 就是粘进来的两条。
  const rowsWrite = writes.at(-1)?.find((op) => op.path[0] === 'rows');
  assert.ok(rowsWrite !== undefined, '导入之后应当已经写了一次 rows');
  assert.deepEqual(rowsWrite.value, [
    { description: '评审代码', provider: 'a6api', model: 'kimi-k3', effort: 'high' },
    { description: '跑测试', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' },
  ]);
});

await test('粘进来的不是清单时说清楚是哪一种问题', async () => {
  await click(buttonIn(rowsSection(), zh['rows.importOpen']));
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
