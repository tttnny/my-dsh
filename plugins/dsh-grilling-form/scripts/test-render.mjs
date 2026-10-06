/**
 * 视图自检：用真 react 跑一遍表单行，断言这张表单在各状态下确实画出该有的东西。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 是替身：真组件是浏览器里的 ESM、带 .css 导入，
 * Node 里跑不起来。替身只做「把 title / collapsedContent / children 原样渲染出来」与把
 * 受控值摊到 html 属性上这两件事，所以这里验证的是本插件自己的视图结构与文案；
 * 真组件的外观要在浏览器里看。
 *
 * 取词函数走 `src/client/locales.js` 的中文字典真值，缺键或缺参数当场抛——视图用了字典里
 * 没有的键、「{answered}/{total}」这类占位符少传参，都在这里失败，而不是在页面上显示成空白。
 *
 * 运行：node scripts/test-render.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { zh } from '../src/client/locales.js';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 注入样式要 document；本测试不检查 CSS，只要求它别炸
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: '' }),
  head: { appendChild: () => {} },
};

/** 只渲染 props 的 ui-primitives 替身，见文件头。记下 Button 收到的那份 props：
 * 导入按钮的受控状态与 onClick 只能在这里摸到。 */
let lastButtonProps = null;
const primitives = {
  MarkdownText: ({ text }) => createElement('span', null, text),
  StateDot: () => createElement('span', null),
  IconQuestionOutlineRegular: () => null,
  IconInspectOutlineRegular: () => null,
  IconDownloadOutlineRegular: () => null,
  Checkbox: ({ checked, label, disabled }) => createElement(
    'label',
    { 'data-checked': String(checked), 'data-disabled': String(disabled === true) },
    label,
  ),
  Button: (props) => {
    lastButtonProps = props;
    return createElement('button', { disabled: props.disabled === true, type: 'button' }, props.children);
  },
  Tag: ({ children }) => createElement('span', null, children),
};

const registrations = [];
let exported;
globalThis.window = {
  __ModuleLoader__: {
    load: ({ factory }) => {
      exported = factory((specifier) => {
        if (specifier === 'react') return require('react');
        if (specifier === 'react/jsx-runtime') return require('react/jsx-runtime');
        if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
        throw new Error(`module table miss: ${specifier}`);
      });
    },
  },
};

await import(`${pathToFileURL(join(root, 'lib', 'client.js')).href}?render=${String(Date.now())}`);

/** 视图要的服务，属性可直接读（inject 守卫那一路由 scripts/smoke-client.mjs 管）。 */
const ctx = {
  effect: (fn) => { fn(); return () => {}; },
  locale: { register: () => () => {} },
  slots: {
    inject: (_key, callback) => { callback(); return () => {}; },
    register: (options, component) => { registrations.push({ options, component }); return () => {}; },
  },
};
exported.apply(ctx);

const row = registrations.find((entry) => entry.options.name === 'tool.call.toolview');
assert.ok(row !== undefined, '行没有注册进 tool.call.toolview');

/** 真字典 + 缺键即抛的取词函数。 */
function translate(key, params) {
  const text = zh[key];
  assert.ok(text !== undefined, `字典里没有键 ${key}`);
  if (params === undefined) return text;
  return text.replace(/\{(\w+)\}/g, (_match, name) => {
    assert.ok(name in params, `${key} 少了参数 ${name}`);
    return String(params[name]);
  });
}

const argsRaw = JSON.stringify({
  questions: [
    {
      id: 'h1',
      number: 'Q2',
      header: 'Host 权威层',
      question: 'Host 权威层怎么改？',
      detail: '正文第一段。',
      options: [
        { label: 'A：扩展 /archive/guardCheck', description: '改动最小' },
        { label: 'B：新建一层', recommended: true },
      ],
    },
    { id: 'h2', question: '范围呢？' },
  ],
});
const pending = JSON.stringify({ pending: true, message: 'form shown' });
/** 一条推荐都没有的一轮：用来量「什么都没填」时导入键确实是灰的。 */
const plainArgsRaw = JSON.stringify({
  questions: [{ id: 'p1', question: '不带推荐的一题', options: [{ label: '甲：这样' }, { label: '乙：那样' }] }],
});
const settled = (text, extra = {}) => ({
  kind: 'result',
  call: { name: 'grilling_form', argsRaw: extra.argsRaw ?? argsRaw },
  content: [{ type: 'text', text }],
  ...extra,
});
const running = { callId: 'call-1', name: 'grilling_form', argsRaw };

let passed = 0;
let total = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

/** 只有 getItem/setItem 的假 localStorage：视图从它恢复勾选与自填。 */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
  };
}

const SESSION_KEY = 'dsh-grilling-form.sess-1';

function html(block, props = {}) {
  const drafts = [];
  const markup = renderToStaticMarkup(createElement(row.component, {
    callId: 'call-1',
    toolName: 'grilling_form',
    sessionId: 'sess-1',
    block,
    t: translate,
    inputActions: { setDraft: (text) => drafts.push(text) },
    useInput: (selector) => selector({ draft: props.draft ?? '' }),
    useConversation: (selector) => selector({
      views: { get: () => (props.nodes === undefined ? undefined : { legacy: { nodes: props.nodes } }) },
    }),
    ...props,
  }));
  return { markup, drafts, onClick: () => lastButtonProps.onClick() };
}

test('刚投出（pending）：题目、题号标题、detail、选项、推荐徽标、自填框与导入键都在', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(settled(pending));
  assert.match(markup, /Q2 · Host 权威层/);
  assert.match(markup, /Host 权威层怎么改？/);
  assert.match(markup, /正文第一段。/);
  assert.match(markup, /A：扩展 \/archive\/guardCheck/);
  assert.match(markup, /改动最小/);
  assert.match(markup, /B：新建一层/);
  assert.match(markup, /推荐/);
  assert.match(markup, /范围呢？/);
  assert.match(markup, /<textarea/);
  assert.match(markup, /导入输入框/);
  assert.match(markup, /这一轮 2 题 · 已填 1/);
});

test('摊开、不折叠：页面上没有折叠行，也没有任何展开/收起控件', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(settled(pending));
  assert.doesNotMatch(markup, /aria-expanded/);
  assert.doesNotMatch(markup, /盘问/);
  assert.doesNotMatch(markup, /dsg-row/);
  // 整块直接铺在记录里，没有卡片壳
  assert.doesNotMatch(markup, /dsg-card/);
});

test('推荐项默认勾上：storage 里什么都没写时，标了推荐的那一项就是选中态', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(settled(pending));
  assert.match(markup, /data-checked="true"/);
});

test('取消掉默认勾选之后不再勾回来（「清空过」与「没作答」分得开）', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: [], custom: '' } } }),
  });
  const { markup } = html(settled(pending));
  assert.doesNotMatch(markup, /data-checked="true"/);
  assert.match(markup, /这一轮 2 题 · 已填 0/);
});

test('表单上没有提交键：提交权只在原生输入框的发送键上', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(settled(pending));
  assert.doesNotMatch(markup, /提交/);
  assert.doesNotMatch(markup, /发送/);
  assert.doesNotMatch(markup, /Submit/i);
});

test('推荐徽标与 label 分工：label 里不带「（推荐）」后缀，徽标另画', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(settled(pending));
  assert.doesNotMatch(markup, /B：新建一层（推荐）/);
  assert.match(markup, />推荐</);
});

test('刷新后恢复：storage 里的勾选与自填回到表单上', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['B：新建一层（推荐）'], custom: '我自己的补充' } } }),
  });
  const { markup } = html(settled(pending));
  assert.match(markup, /data-checked="true"/);
  assert.match(markup, /我自己的补充/);
  assert.match(markup, /这一轮 2 题 · 已填 1/);
});

test('未导入提醒：表单里有内容而草稿里没有导入块时常驻显示', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['B：新建一层（推荐）'], custom: '' } } }),
  });
  const stale = html(settled(pending));
  assert.match(stale.markup, /还没导入输入框/);
  const imported = html(settled(pending), { draft: '【盘问作答】\nQ2 · Host 权威层：B：新建一层\n【/盘问作答】' });
  assert.doesNotMatch(imported.markup, /还没导入输入框/);
});

test('导入键的受控状态：什么都没填时是灰的，填了才可点', () => {
  globalThis.localStorage = fakeStorage();
  assert.match(html(settled(pending, { argsRaw: plainArgsRaw })).markup, /<button disabled=""/);
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { p1: { selected: [], custom: '只自填也算' } } }),
  });
  const filled = html(settled(pending, { argsRaw: plainArgsRaw }));
  assert.doesNotMatch(filled.markup, /<button disabled=""/);
  assert.match(filled.markup, /导入输入框/);
});

test('点导入：把作答写进原生草稿（默认勾上的推荐项也算作答，块在前、原有文字随后）', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h2: { selected: [], custom: '只改插件' } } }),
  });
  const { drafts, onClick } = html(settled(pending), { draft: '我另外想说一句。' });
  onClick();
  assert.equal(
    drafts[0],
    '【盘问作答】\nQ2 · Host 权威层：B：新建一层\n范围呢？：只改插件\n【/盘问作答】\n\n我另外想说一句。',
  );
});

test('只读：这条调用之后有过用户发言，表单留有内容但不再可填、不再有导入键', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['B：新建一层（推荐）'], custom: '自填的补充' }, h2: { selected: [], custom: '' } } }),
  });
  const { markup } = html(settled(pending), {
    nodes: [
      { kind: 'tool-result', callId: 'call-1', seq: 5 },
      { kind: 'user', seq: 9 },
    ],
  });
  assert.match(markup, /data-readonly="true"/);
  assert.match(markup, /本轮已过，仅供查看/);
  assert.match(markup, /B：新建一层/);
  assert.doesNotMatch(markup, /B：新建一层（推荐）/, '只读展示同样不带后缀');
  assert.match(markup, /自填的补充/);
  assert.match(markup, /未作答/);
  assert.doesNotMatch(markup, /导入输入框/);
  assert.doesNotMatch(markup, /<textarea/);
  assert.doesNotMatch(markup, /data-checked="true"/, '只读时不再画可点的勾选框');
});

test('还没过去：没有更晚的用户发言时表单照常可填', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(settled(pending), {
    nodes: [
      { kind: 'tool-result', callId: 'call-1', seq: 5 },
      { kind: 'assistant', seq: 6 },
    ],
  });
  assert.doesNotMatch(markup, /data-readonly="true"/);
  assert.match(markup, /导入输入框/);
});

test('被拒：给违规清单与总说明', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(settled(JSON.stringify({
    rejected: true,
    violations: ['Question 1 (id "dup") repeats an id'],
    error: '1 violation(s) in this round',
  })));
  assert.match(markup, /repeats an id/);
  assert.match(markup, /1 violation\(s\) in this round/);
  assert.doesNotMatch(markup, /导入输入框/);
});

test('被拒且结果里没有总说明时，至少有一句人话', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(settled(JSON.stringify({ rejected: true, violations: [] })));
  assert.match(markup, /入参被拒绝/);
});

test('调用失败：给失败说明', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(settled('boom: tool runtime gone', { isError: true, error: { name: 'Error', code: 'EPIPE' } }));
  assert.match(markup, /boom: tool runtime gone/);
});

test('结果形状认不出来：至少说清是调用失败，并且把题面留着', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(settled('boom'));
  assert.match(markup, /调用失败/);
  assert.match(markup, /Host 权威层怎么改？/);
});

test('结果还没落库但参数已能解析：只画题干，不画进度行、选项与导入键', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html(running);
  assert.match(markup, /Host 权威层怎么改？/);
  assert.doesNotMatch(markup, /dsg-progress/);
  assert.doesNotMatch(markup, /导入输入框/);
  assert.doesNotMatch(markup, /data-checked/);
});

test('流式半截 JSON：退回原始文本，不假装读懂了', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ callId: 'call-2', name: 'grilling_form', argsRaw: '{"questions":[{"id":"h1","quest' });
  assert.match(markup, /dsg-raw/);
  assert.match(markup, /h1/);
  assert.doesNotMatch(markup, /导入输入框/);
});

test('查看按钮只在槽位给了 inspect 时出现', () => {
  globalThis.localStorage = fakeStorage();
  assert.match(html(settled(pending), { inspect: () => {} }).markup, /查看/);
  assert.doesNotMatch(html(settled(pending)).markup, /查看/);
});

test('没有内容的行什么都不画', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ kind: 'result', call: { name: 'grilling_form', argsRaw: '' }, content: [] });
  assert.doesNotMatch(markup, /导入输入框/);
  assert.doesNotMatch(markup, /dsg-progress/);
});

console.log(`${passed}/${total} passed`);
