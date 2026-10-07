/**
 * 视图自检：用真 react 跑一遍浏览器半边的那两个注册项，断言它们在各状态下确实画出该有的东西。
 *
 * - **轮次尾部**（`conversation.chat.turnTail`）：表单住在这里——题目、选项、导入键、分叉键，
 *   以及冻结（只读即冻结）那一态；
 * - **工具行**（`tool.call.toolview`）：投出去的轮次什么都不画，被拒画违规清单、失败画说明。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 是替身：真组件是浏览器里的 ESM、带 .css 导入，
 * Node 里跑不起来。替身只做「把 label / children 原样渲染出来」与把受控值摊到 html 属性上
 * 这两件事，所以这里验证的是本插件自己的视图结构与文案；真组件的外观要在浏览器里看。
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

/** 只渲染 props 的 ui-primitives 替身，见文件头。每次渲染记下 Button 收到的那份 props：
 * 导入键与分叉键的受控状态、onClick、class 只能在这里摸到。 */
let buttons = [];
const primitives = {
  MarkdownText: ({ text }) => createElement('span', null, text),
  StateDot: () => createElement('span', null),
  IconQuestionOutlineRegular: () => null,
  IconInspectOutlineRegular: () => null,
  IconDownloadOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  Checkbox: ({ checked, label, disabled }) => createElement(
    'label',
    { 'data-checked': String(checked), 'data-disabled': String(disabled === true) },
    label,
  ),
  Button: (props) => {
    buttons.push(props);
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
const forkRequests = [];
const ctx = {
  effect: (fn) => { fn(); return () => {}; },
  locale: { register: () => () => {} },
  slots: {
    inject: (_key, callback) => { callback(); return () => {}; },
    register: (options, component) => { registrations.push({ options, component }); return () => {}; },
  },
  sessions: { fork: (opts) => { forkRequests.push(opts); return Promise.resolve('child-1'); } },
  uiWorkspace: { openSession: () => {} },
};
exported.apply(ctx);

const tail = registrations.find((entry) => entry.options.name === 'conversation.chat.turnTail');
const row = registrations.find((entry) => entry.options.name === 'tool.call.toolview');
assert.ok(tail !== undefined, '表单没有注册进 conversation.chat.turnTail');
assert.ok(row !== undefined, '工具行没有注册进 tool.call.toolview');

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
/** 本轮那次调用：默认是投出去的那一次（结果 pending）。 */
const settled = (text, extra = {}) => ({
  kind: 'tool-result',
  callId: 'call-1',
  seq: 5,
  call: { name: 'grilling_form', argsRaw: extra.argsRaw ?? argsRaw },
  content: [{ type: 'text', text }],
  isError: false,
  ...extra,
});
/** 本轮的轮次位置：seq 6 是收尾助手那条，seq 8 才是本轮结束点（分叉要切在这里）。 */
const turnOf = (options = {}) => ({ turn: 4, start: { seq: 3 }, end: { seq: options.endSeq ?? 8 }, ...options });
const SESSION_KEY = 'dsh-grilling-form.sess-1';

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

/**
 * 渲染轮次尾部的表单。
 * @param {object} props - 本轮那次调用的 block（`call`）、chat 记录里的节点（`nodes`）、草稿（`draft`）。
 * @returns {{markup: string, drafts: string[], forked: number[], buttons: object[]}} 静态 HTML 与记录下来的动作。
 */
function html(props = {}) {
  const drafts = [];
  const forked = [];
  const callNode = { kind: 'tool-call', data: { root: props.call ?? settled(pending) } };
  const chat = {
    locations: { getTurn: (turn) => (turn === 4 && props.noRound !== true ? ['call'] : []) },
    nodes: { get: (key) => (key === 'call' ? callNode : undefined) },
    legacy: { nodes: props.nodes ?? [] },
  };
  buttons = [];
  const markup = renderToStaticMarkup(createElement(tail.component, {
    turn: props.turn ?? turnOf(),
    // 槽位给的是「收尾助手那条」的位置；分叉要用的是本轮结束点（turn.end.seq）
    seq: props.seq ?? 6,
    sessionId: 'sess-1',
    t: translate,
    inputActions: { setDraft: (text) => drafts.push(text) },
    useInput: (selector) => selector({ draft: props.draft ?? '' }),
    useConversation: (selector) => selector({ views: { get: () => chat } }),
    forkAt: (seq) => forked.push(seq),
    ...props,
  }));
  return { markup, drafts, forked, buttons: [...buttons] };
}

/** 渲染工具行（表搬走之后它只剩被拒与失败两态）。 */
function rowHtml(block, props = {}) {
  buttons = [];
  const markup = renderToStaticMarkup(createElement(row.component, {
    block,
    toolName: 'grilling_form',
    callId: 'call-1',
    sessionId: 'sess-1',
    t: translate,
    ...props,
  }));
  return { markup, buttons: [...buttons] };
}

// --- 住在轮次尾部 ---

test('表单注册在轮次尾部槽位（自有 id 与字典），工具行按 wire 工具名照旧注册', () => {
  assert.equal(tail.options.id, '@lynn123411/dsh-grilling-form');
  assert.equal(tail.options.locale, 'grillingForm');
  assert.equal(row.options.key, 'grilling_form');
});

test('刚投出：题目、题号标题、detail、选项、推荐徽标、自填框、导入键与进度都在同一层', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
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

test('摊开、不折叠：页面上没有折叠行，也没有任何展开/收起控件或卡片壳', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  assert.doesNotMatch(markup, /aria-expanded/);
  assert.doesNotMatch(markup, /dsg-row/);
  assert.doesNotMatch(markup, /dsg-card/);
});

test('本轮没有这张表：什么都不画', () => {
  globalThis.localStorage = fakeStorage();
  assert.equal(html({ noRound: true }).markup, '');
});

test('本轮的表被拒：尾部什么都不画（违规清单归工具行）', () => {
  globalThis.localStorage = fakeStorage();
  const rejected = settled(JSON.stringify({ rejected: true, violations: ['x'], error: 'y' }));
  assert.equal(html({ call: rejected }).markup, '');
});

test('推荐项默认勾上；取消掉之后不再勾回来（「清空过」与「没作答」分得开）', () => {
  globalThis.localStorage = fakeStorage();
  assert.match(html().markup, /data-checked="true"/);
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: [], custom: '' } } }),
  });
  const { markup } = html();
  assert.doesNotMatch(markup, /data-checked="true"/);
  assert.match(markup, /这一轮 2 题 · 已填 0/);
});

test('刷新后恢复：storage 里的勾选与自填回到表单上', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['B：新建一层（推荐）'], custom: '我自己的补充' } } }),
  });
  const { markup } = html();
  assert.match(markup, /data-checked="true"/);
  assert.match(markup, /我自己的补充/);
  assert.match(markup, /这一轮 2 题 · 已填 1/);
});

test('表单上没有提交键：提交权只在原生输入框的发送键上', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  assert.doesNotMatch(markup, /提交/);
  assert.doesNotMatch(markup, /发送/);
  assert.doesNotMatch(markup, /Submit/i);
});

test('推荐徽标与 label 分工：label 里不带「（推荐）」后缀，徽标另画', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  assert.doesNotMatch(markup, /B：新建一层（推荐）/);
  assert.match(markup, />推荐</);
});

test('没有未导入提醒，也没有任何导入相关的提示', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['B：新建一层（推荐）'], custom: '' } } }),
  });
  const { markup } = html(); // 草稿是空的，也就是「填了还没导入」
  assert.doesNotMatch(markup, /还没导入/);
  assert.doesNotMatch(markup, /提醒/);
});

test('导入键的受控状态：什么都没填时是灰的，填了才可点', () => {
  globalThis.localStorage = fakeStorage();
  assert.equal(html({ call: settled(pending, { argsRaw: plainArgsRaw }) }).buttons.find((b) => b.className === 'dsg-import').disabled, true);
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { p1: { selected: [], custom: '只自填也算' } } }),
  });
  const filled = html({ call: settled(pending, { argsRaw: plainArgsRaw }) });
  assert.equal(filled.buttons.find((b) => b.className === 'dsg-import').disabled, false);
  assert.match(filled.markup, /导入输入框/);
});

test('点导入：把作答写进原生草稿（默认勾上的推荐项也算作答，块在前、原有文字随后）', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h2: { selected: [], custom: '只改插件' } } }),
  });
  const { drafts, buttons } = html({ draft: '我另外想说一句。' });
  buttons.find((button) => button.className === 'dsg-import').onClick();
  assert.equal(
    drafts[0],
    '【盘问作答】\nQ2 · Host 权威层：B：新建一层\n范围呢？：只改插件\n【/盘问作答】\n\n我另外想说一句。',
  );
});

// --- 从这里分叉 ---

test('点「从这里分叉」：用**本轮结束点**调用注入的动作，不是收尾助手那条的位置', () => {
  globalThis.localStorage = fakeStorage();
  const { markup, forked, buttons } = html();
  assert.match(markup, /从这里分叉/);
  buttons.find((button) => button.className === 'dsg-fork').onClick();
  assert.deepEqual(forked, [8]);
});

test('本轮结束位置拿不到时不画那个键（不拿收尾助手那条冒充切点）', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ turn: turnOf({ end: undefined }) });
  assert.doesNotMatch(markup, /从这里分叉/);
  assert.match(markup, /导入输入框/, '表的其它部分照旧');
});

test('槽位没给分叉动作时也不画那个键（不画一个点了没用的键）', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ forkAt: undefined });
  assert.doesNotMatch(markup, /从这里分叉/);
  assert.match(markup, /导入输入框/);
});

// --- 只读即冻结 ---

const replyNode = (text, seq = 9) => ({ kind: 'user', seq, content: [{ type: 'text', text }] });
const replyText = (body) => `【盘问作答】\n${body}\n【/盘问作答】`;

test('冻结：本轮过去之后表单停住——勾选框与自填框原样留着、不可交互、没有导入键', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['B：新建一层（推荐）'], custom: '自填的补充' }, h2: { selected: [], custom: '' } } }),
  });
  const { markup } = html({ nodes: [settled(pending), replyNode(replyText('Q2 · Host 权威层：B：新建一层\n范围呢？：自填的补充'))] });
  assert.match(markup, /data-readonly="true"/);
  assert.match(markup, /本轮已过，仅供查看/);
  // 停住的样子就是可填时的样子：勾选框还在、还是那个勾选态，自填框还在、还写着那行字
  assert.match(markup, /data-checked="true"/);
  assert.match(markup, /data-disabled="true"/);
  assert.match(markup, /自填的补充/);
  assert.match(markup, /readonly/);
  // 不是「一行行答案」
  assert.doesNotMatch(markup, /dsg-answer/);
  assert.doesNotMatch(markup, /未作答/);
  assert.doesNotMatch(markup, /导入输入框/);
  // 分叉键还在（回看时也能从这一轮开新会话）
  assert.match(markup, /从这里分叉/);
});

test('冻结：还没过去时表单照常可填（更晚的用户发言才是冻结的判据）', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ nodes: [settled(pending), { kind: 'assistant', seq: 7 }] });
  assert.doesNotMatch(markup, /data-readonly="true"/);
  assert.match(markup, /导入输入框/);
});

test('冻结：按实发消息重画——输入框里改过的以那条消息为准，不是表单里那份', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['A：扩展 /archive/guardCheck'], custom: '' }, h2: { selected: [], custom: '表单里那份' } } }),
  });
  const { markup } = html({
    nodes: [
      settled(pending),
      replyNode(replyText('Q2 · Host 权威层：B：新建一层、消息里补的一句\n范围呢？：甲：只改插件')),
    ],
  });
  assert.match(markup, /消息里补的一句/);
  assert.doesNotMatch(markup, /表单里那份/, '实发消息里没有的，不许从本地那份补上');
  assert.match(markup, /这一轮 2 题 · 已填 2/);
});

test('冻结：块里没出现的题就是没作答——推荐默认不会被勾回来', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ nodes: [settled(pending), replyNode(replyText('范围呢？：只改插件'))] });
  assert.match(markup, /data-readonly="true"/);
  assert.equal([...markup.matchAll(/data-checked="true"/g)].length, 0);
  assert.match(markup, /这一轮 2 题 · 已填 1/);
});

test('冻结：只认紧接这一轮的那条发言——回看旧轮次时不拿后面轮次的作答重画', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({
    nodes: [
      settled(pending),
      replyNode(replyText('范围呢？：只改插件'), 9),
      // 后面某一轮的作答：题面标题一样，但那是另一轮的事
      replyNode(replyText('Q2 · Host 权威层：B：新建一层'), 20),
    ],
  });
  assert.match(markup, /这一轮 2 题 · 已填 1/);
  assert.equal([...markup.matchAll(/data-checked="true"/g)].length, 0, '后面那轮的勾选不许出现在这一轮的表上');
});

test('冻结：反解拿不到（没有块）时退回本地那份，内容不凭空消失', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h2: { selected: [], custom: '本地那份自填' } } }),
  });
  const { markup } = html({ nodes: [settled(pending), replyNode('我另外想说一句，没导入。')] });
  assert.match(markup, /data-readonly="true"/);
  assert.match(markup, /本地那份自填/);
  assert.match(markup, /data-checked="true"/, '退回本地那份时推荐默认照旧生效');
});

test('冻结时不再有任何导入入口：只剩分叉键', () => {
  globalThis.localStorage = fakeStorage();
  const { markup, buttons } = html({ nodes: [settled(pending), replyNode(replyText('范围呢？：只改插件'))] });
  assert.doesNotMatch(markup, /导入输入框/);
  assert.equal(buttons.length, 1, '冻结时只剩一个分叉键');
});

// --- 工具行：表搬走之后只剩被拒与失败 ---

test('被投出去的轮次：工具行什么都不画（页面上不会出现两张表）', () => {
  globalThis.localStorage = fakeStorage();
  assert.equal(rowHtml(settled(pending)).markup, '');
});

test('被拒：给违规清单与总说明，且没有导入键', () => {
  const { markup } = rowHtml(settled(JSON.stringify({
    rejected: true,
    violations: ['Question 1 (id "dup") repeats an id'],
    error: '1 violation(s) in this round',
  })));
  assert.match(markup, /repeats an id/);
  assert.match(markup, /1 violation\(s\) in this round/);
  assert.doesNotMatch(markup, /导入输入框/);
});

test('被拒且结果里没有总说明时，至少有一句人话', () => {
  const { markup } = rowHtml(settled(JSON.stringify({ rejected: true, violations: [] })));
  assert.match(markup, /入参被拒绝/);
});

test('调用失败：给失败说明', () => {
  const { markup } = rowHtml(settled('boom: tool runtime gone', { isError: true, error: { name: 'Error', code: 'EPIPE' } }));
  assert.match(markup, /boom: tool runtime gone/);
});

test('查看按钮只在槽位给了 inspect 时出现（表被拒的那一轮）', () => {
  const rejected = settled(JSON.stringify({ rejected: true, violations: ['x'] }));
  assert.match(rowHtml(rejected, { inspect: () => {} }).markup, /查看/);
  assert.doesNotMatch(rowHtml(rejected).markup, /查看/);
});

console.log(`${passed}/${total} passed`);
