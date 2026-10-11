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
  Checkbox: ({ checked, label, disabled, className }) => createElement(
    'label',
    { 'data-checked': String(checked), 'data-disabled': String(disabled === true), 'data-class': String(className) },
    label,
  ),
  Button: (props) => {
    buttons.push(props);
    return createElement('button', { disabled: props.disabled === true, type: 'button', title: props.title }, props.children);
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

/** 把替身渲染进 HTML 里被转义的实体还原回来（摘要行断言按它比原文）。 */
function decodeEntities(text) {
  return text
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'");
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
    // 注入进来的分叉动作是 async（失败要能被按键接住），假件照这个形状给：推一个记号再 resolve。
    forkAt: (seq) => { forked.push(seq); return Promise.resolve(); },
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

test('刚投出：题目、题号标题、detail、选项、推荐徽标、自填框、导入键都在同一层；进度行已经删掉', () => {
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
  assert.doesNotMatch(markup, /已填/);
  assert.doesNotMatch(markup, /这一轮 2 题/);
});

test('摊开、不折叠：可填时页面上没有折叠行，也没有任何展开/收起控件或卡片壳', () => {
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
});

test('刷新后恢复：storage 里的勾选与自填回到表单上', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['B：新建一层（推荐）'], custom: '我自己的补充' } } }),
  });
  const { markup } = html();
  assert.match(markup, /data-checked="true"/);
  assert.match(markup, /我自己的补充/);
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

test('导入键：还没导入时是「导入输入框」，草稿里已经是当前那份时变「已导入」', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['B：新建一层（推荐）'], custom: '' } } }),
  });
  const fresh = html();
  assert.match(fresh.markup, /导入输入框/);
  assert.doesNotMatch(fresh.markup, /已导入/);
  const imported = html({ draft: '【拷问作答】\nQ2 · Host 权威层：\n- B：新建一层\n【/拷问作答】' });
  assert.match(imported.markup, /已导入/);
  assert.doesNotMatch(imported.markup, />导入输入框</);
});

test('导入键：表单改过之后草稿里那份就旧了——按键变「更新输入框」，草稿再点一次才追上', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['B：新建一层（推荐）'], custom: '' } } }),
  });
  const stale = html({ draft: '【拷问作答】\nQ2 · Host 权威层：\n- A：扩展 /archive/guardCheck\n【/拷问作答】' });
  assert.match(stale.markup, /更新输入框/);
});

test('导入键：还没填任何作答时是灰的，并说明要先在上面作答', () => {
  globalThis.localStorage = fakeStorage();
  const empty = html({ call: settled(pending, { argsRaw: plainArgsRaw }) });
  const button = empty.buttons.find((candidate) => candidate.className === 'dsg-import');
  assert.equal(button.disabled, true);
  assert.equal(button.title, '先在上面勾选或自填');
});

test('点导入：把作答写进原生草稿（默认勾上的推荐项也算作答，块在前、原有文字随后）', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h2: { selected: [], custom: '只改插件' } } }),
  });
  const { drafts, buttons } = html({ draft: '我另外想说一句。' });
  buttons.find((button) => button.className === 'dsg-import').onClick();
  assert.equal(
    drafts[0],
    '【拷问作答】\nQ2 · Host 权威层：\n- B：新建一层\n范围呢？：\n- 只改插件\n【/拷问作答】\n\n我另外想说一句。',
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
const replyText = (body) => `【拷问作答】\n${body}\n【/拷问作答】`;
/** 冻结态顶上那行摘要（切掉图标与标签，只留那句「本轮已过 · N 题 · 已填 M」）。 */
const summaryText = (markup) => decodeEntities(/本轮已过[^<]*/.exec(markup)?.[0] ?? '');

test('冻结：整块不可折叠、始终摊开——摘要行留着但不可点、没有箭头，表就在下面', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h1: { selected: ['B：新建一层（推荐）'], custom: '自填的补充' }, h2: { selected: [], custom: '' } } }),
  });
  const { markup } = html({ nodes: [settled(pending), replyNode(replyText('Q2 · Host 权威层：\n- B：新建一层\n范围呢？：\n- 自填的补充'))] });
  assert.match(markup, /data-readonly="true"/);
  // 没有任何折叠控件：折叠行、箭头、aria-expanded、展开/收起键都不许有
  assert.doesNotMatch(markup, /aria-expanded/, '不再是折叠行');
  assert.doesNotMatch(markup, /class="dsg-frozen[" ]/, '不再用折叠行承载');
  // 摘要留着，且与表同处一层：摘要、题干、勾选框、自填框全都在
  assert.match(summaryText(markup), /^本轮已过 · 2 题 · 已填 2$/);
  assert.match(markup, /dsg-summaryIcon/, '问号图标留着，只去掉箭头');
  assert.match(markup, /Host 权威层怎么改？/);
  assert.match(markup, /范围呢？/);
  assert.match(markup, /data-checked="true"/);
  assert.match(markup, /data-disabled="true"/);
  assert.match(markup, /自填的补充/);
  assert.match(markup, /readonly/);
  // 底下那行「本轮已过，仅供查看」已删掉（顶上摘要已经说了本轮已过）
  assert.doesNotMatch(markup, /仅供查看/);
  // 不是「一行行答案」，也不再有导入键
  assert.doesNotMatch(markup, /dsg-answer/);
  assert.doesNotMatch(markup, /导入输入框/);
  // 分叉键还在（回看时也能从这一轮开新会话）
  assert.match(markup, /从这里分叉/);
});

test('冻结：摘要行只是文字，不是键——它既拦不住也不能被点开', () => {
  globalThis.localStorage = fakeStorage();
  const { markup, buttons } = html({ nodes: [settled(pending), replyNode(replyText('范围呢？：\n- 只改插件'))] });
  assert.match(markup, /本轮已过 · 2 题 · 已填 1/);
  assert.equal(buttons.length, 1, '冻结时页面上只有分叉一个键，摘要行不在其中');
  assert.equal(buttons[0].className, 'dsg-fork');
});

test('冻结：摘要只说这轮的题数与答了几题，不再有进度行那套「已填」文案', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ nodes: [settled(pending), replyNode(replyText('范围呢？：\n- 只改插件'))] });
  assert.match(summaryText(markup), /^本轮已过 · 2 题 · 已填 1$/);
  assert.equal([...markup.matchAll(/data-checked="true"/g)].length, 0, '块里没有的题就是没作答，推荐默认不勾回来');
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
      replyNode(replyText('Q2 · Host 权威层：\n- B：新建一层\n- 消息里补的一句\n范围呢？：\n- 甲：只改插件')),
    ],
  });
  assert.match(markup, /消息里补的一句/);
  assert.doesNotMatch(markup, /表单里那份/, '实发消息里没有的，不许从本地那份补上');
});

test('冻结：只认紧接这一轮的那条发言——回看旧轮次时不拿后面轮次的作答重画', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({
    nodes: [
      settled(pending),
      replyNode(replyText('范围呢？：\n- 只改插件'), 9),
      // 后面某一轮的作答：题面标题一样，但那是另一轮的事
      replyNode(replyText('Q2 · Host 权威层：\n- B：新建一层'), 20),
    ],
  });
  assert.equal([...markup.matchAll(/data-checked="true"/g)].length, 0, '后面那轮的勾选不许出现在这一轮的表上');
});

test('冻结：实发消息里根本没有块＝没作答——本地勾选与推荐默认都不冒充，只挂一行说明', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h2: { selected: [], custom: '本地那份自填' } } }),
  });
  const { markup } = html({ nodes: [settled(pending), replyNode('我另外想说一句，没导入。')] });
  assert.match(markup, /data-readonly="true"/);
  assert.match(markup, /本轮没有通过表单作答/);
  assert.doesNotMatch(markup, /本地那份自填/, '用户没走表单，本地那份不是他的答案');
  assert.doesNotMatch(markup, /data-checked="true"/, '推荐默认也不许冒充他的答案');
});

test('冻结：块在但坏了才退回本地那份（内容不凭空消失）', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ 'call-1': { h2: { selected: [], custom: '本地那份自填' } } }),
  });
  const { markup } = html({ nodes: [settled(pending), replyNode(replyText('跟哪道题都对不上：随便'))] });
  assert.match(markup, /本地那份自填/);
  assert.doesNotMatch(markup, /本轮没有通过表单作答/);
});

test('冻结时不再有任何导入入口：只剩分叉键', () => {
  globalThis.localStorage = fakeStorage();
  const { markup, buttons } = html({ nodes: [settled(pending), replyNode(replyText('范围呢？：\n- 只改插件'))] });
  assert.doesNotMatch(markup, /导入输入框/);
  assert.equal(buttons.length, 1, '冻结时只剩一个分叉键');
});

test('单选题：勾选框上再点别的项就换掉上一个（一题至多一项），题面照旧把两项都画出来', () => {
  globalThis.localStorage = fakeStorage();
  const single = JSON.stringify({
    questions: [{ id: 'q', question: '继续吗？', multi_select: false, options: [{ label: '继续', recommended: true }, { label: '停一下' }] }],
  });
  const { markup, buttons } = html({ call: settled(pending, { argsRaw: single }) });
  assert.match(markup, /继续/);
  assert.match(markup, /停一下/);
  assert.equal([...markup.matchAll(/data-checked="true"/g)].length, 1, '推荐项默认勾上一项');
  const importButton = buttons.find((button) => button.className === 'dsg-import');
  assert.notEqual(importButton, undefined);
});

test('单选题的元素上标了「这一题是单选」，多选不标——圆圈外观靠这个标记挂钩', () => {
  globalThis.localStorage = fakeStorage();
  const single = JSON.stringify({
    questions: [{ id: 'q', question: '继续吗？', multi_select: false, options: [{ label: '继续' }] }],
  });
  const singleMarkup = html({ call: settled(pending, { argsRaw: single }) }).markup;
  assert.match(singleMarkup, /data-class="[^"]*\bdsg-optionSingle\b/, '单选那题的元素带单选标记');
  // 多选题（缺省）不标，方框保持系统默认外观
  const multiMarkup = html().markup;
  assert.match(multiMarkup, /data-class="dsg-option"/);
  assert.doesNotMatch(multiMarkup, /dsg-optionSingle/);
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
