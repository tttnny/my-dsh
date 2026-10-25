/**
 * 视图自检：用真 react 跑一遍浏览器半边的那两个注册项，断言它们在各状态下确实画出该有的东西。
 *
 * - **轮次尾部**（conversation.chat.turnTail）：表单住在这里——题号、题干、选项、导入键、分叉键，
 *   以及冻结与「提问表单已被后面那张取代」两态；
 * - **工具行**（tool.call.toolview）：投出去的轮次什么都不画，没投出画那句说明、失败画失败说明。
 *
 * @deepseek-ai/dsh-client-ui-primitives 是替身：真组件是浏览器里的 ESM、带 .css 导入，
 * Node 里跑不起来。替身只做「把 label / children 原样渲染出来」与把受控值摊到 html 属性上
 * 这两件事，所以这里验证的是本插件自己的视图结构与文案；真组件的外观要在浏览器里看。
 *
 * 取词函数走 src/client/locales.js 的中文字典真值，缺键或缺参数当场抛——视图用了字典里
 * 没有的键、「{answered}/{total}」这类占位符少传参，都在这里失败，而不是在页面上显示成空白。
 *
 * 运行：node scripts/test-render.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { importBlockStart, shortFormId } from '../src/form-model.js';
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
 * 导入键与分叉键的受控状态、onClick、class 只能在这里摸到。
 * **这份替身表必须与源码引到的名字逐一对齐**（多一个、少一个都由 smoke-client.mjs 拦下）：
 * 少一个，那一处就是 undefined，React 只打一行 warning、这里的断言却全绿。 */
let buttons = [];
const primitives = {
  IconQuestionOutlineRegular: () => null,
  IconInspectOutlineRegular: () => null,
  IconDownloadOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  // 导入键在「已是当前那份」时换成它（打勾图标），多选选中时方框里画它。
  IconCheckOutlineRegular: () => createElement('span', { 'data-icon': 'check' }),
  // 真 MarkdownText 是宿主那个 markdown 渲染器；这里只需要它把源文本原样摊成一段 HTML，
  // 所以替身保留「是不是 markdown、用哪一版（body / compact）」这两个可断言的事实。
  MarkdownText: ({ text, variant }) => createElement(
    'div',
    { 'data-markdown': String(variant ?? 'body') },
    text,
  ),
  MarkdownDelegateProvider: ({ children }) => createElement('div', { 'data-markdown-delegate': 'yes' }, children),
  Button: (props) => {
    buttons.push(props);
    // icon 也要渲染出来：真 Button 把它画在文案前，替身丢掉它就等于图标那半边从没被测过。
    return createElement(
      'button',
      { disabled: props.disabled === true, type: 'button', title: props.title },
      props.icon ?? null,
      props.children,
    );
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

/** 页脚那一段（导入键与分叉键）；多选项的方框里也画着勾，断言图标时只该看这一段。 */
const footerOf = (markup) => /<div class="dsg-footer">.*?<\/div><\/div>/.exec(markup)?.[0] ?? '';

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

const CALL = 'call-1';
/** 一张表的作答块：起止行里的记号由这个调用 id 推出来，界面靠它认哪条发言是这张表的作答。 */
const blockWith = (callId, body) => (
  body === '' ? `${importBlockStart(callId)}\n【/拷问作答】` : `${importBlockStart(callId)}\n${body}\n【/拷问作答】`
);
/** 这一轮（CALL）那张作答块。 */
const blockOf = (body) => blockWith(CALL, body);

const argsRaw = JSON.stringify({
  questions: [
    {
      type: 'multi',
      question: 'Host 权威层怎么改？',
      options: [
        { label: 'A：扩展 /archive/guardCheck' },
        { label: 'B：新建一层（推荐）' },
      ],
    },
    { type: 'free', question: '范围呢？' },
  ],
});
/** 一条推荐都没有的一轮：用来量「什么都没填」时导入键照样可按。 */
const plainArgsRaw = JSON.stringify({
  questions: [{ type: 'multi', question: '不带推荐的一题', options: [{ label: '甲：这样' }, { label: '乙：那样' }] }],
});
const shown = JSON.stringify({ ok: true, message: 'form shown' });
/** 没投出的那一轮：说明就是闸门拦下时给模型的原话（拿它量工具行画的确实是结果里那句话）。 */
const hidden = JSON.stringify({ ok: false, message: 'An earlier form is still waiting for the answer.' });
/** 本轮那次调用：默认是投出去的那一次（结果 ok: true）。 */
const settled = (text, extra = {}) => ({
  kind: 'tool-result',
  callId: CALL,
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
 * @param {object} props - 本轮那次调用的 block（call）、前面那一轮的 block（earlier，取出代用）、
 *   后面那一轮的 block（later）、chat 记录里的发言节点（nodes）、草稿（draft）。
 * @returns {{markup: string, drafts: string[], forked: number[], buttons: object[]}} 静态 HTML 与记录下来的动作。
 */
function html(props = {}) {
  const drafts = [];
  const forked = [];
  const rounds = { 4: props.call ?? settled(shown) };
  if (props.earlier !== undefined) rounds[3] = props.earlier;
  if (props.later !== undefined) rounds[5] = props.later;
  const chat = {
    locations: {
      getTurn: (turn) => (rounds[turn] === undefined ? [] : [`${turn}:0`]),
    },
    nodes: { get: (key) => ({ kind: 'tool-call', data: { root: rounds[key.split(':')[0]] } }) },
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

/** 渲染工具行（表搬走之后它只剩没投出与失败两态）。 */
function rowHtml(block, props = {}) {
  buttons = [];
  const markup = renderToStaticMarkup(createElement(row.component, {
    block,
    toolName: 'grilling_form',
    callId: CALL,
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

test('刚投出：题号、题干、选项、推荐徽标、自填框、导入键都在；没有标题、展开正文与选项说明', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  assert.match(markup, /dsg-number">1\.</);
  assert.match(markup, /dsg-number">2\.</);
  assert.match(markup, /Host 权威层怎么改？/);
  assert.match(markup, /A：扩展 \/archive\/guardCheck/);
  assert.match(markup, /B：新建一层/);
  assert.match(markup, /推荐/);
  assert.match(markup, /范围呢？/);
  assert.match(markup, /<textarea/);
  assert.match(markup, /导入输入框/);
  assert.doesNotMatch(markup, /dsg-header|dsg-detail|dsg-optionDescription/);
  assert.doesNotMatch(markup, /已填/);
});

test('摊开、不折叠：可填时页面上没有折叠行，也没有卡片壳', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  assert.doesNotMatch(markup, /dsg-row/);
  assert.doesNotMatch(markup, /dsg-card/);
});

// --- PTC 模式：这张表是 run_code 的子调用 ---

/** PTC 模式下本轮那个根块：模型调的是 run_code，表住在它的 subCalls 里。 */
const runCodeRoot = (subCalls) => ({
  kind: 'tool-result',
  callId: 'call-run',
  seq: 5,
  call: { name: 'run_code', argsRaw: JSON.stringify({ code: 'await tools.grilling_form({...})', description: '交一轮问题' }) },
  content: [{ type: 'text', text: '(run_code completed with no output)' }],
  isError: false,
  subCalls,
});

/** run_code 里那个 grilling_form 子调用（id 形状与宿主一致）。 */
const dispatchedForm = (overrides = {}) => ({
  kind: 'tool-result',
  callId: 'call-run:ptc:1',
  parentCallId: 'call-run',
  seq: 6,
  call: { name: 'grilling_form', argsRaw },
  content: [{ type: 'text', text: shown }],
  isError: false,
  subCalls: [],
  ...overrides,
});

test('PTC：表在 run_code 的子调用里时，轮次尾部照样把整张表画出来', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ call: runCodeRoot([dispatchedForm()]) });
  assert.match(markup, /dsg-number">1\.</);
  assert.match(markup, /Host 权威层怎么改？/);
  assert.match(markup, /范围呢？/);
  assert.match(markup, /导入输入框/);
});

test('PTC：run_code 里没有这张表时什么都不画', () => {
  globalThis.localStorage = fakeStorage();
  const otherChild = { ...dispatchedForm(), call: { name: 'bash', argsRaw: '{}' } };
  assert.equal(html({ call: runCodeRoot([otherChild]) }).markup, '');
});

test('本轮没有这张表：什么都不画', () => {
  globalThis.localStorage = fakeStorage();
  assert.equal(html({ turn: { turn: 9, start: { seq: 30 }, end: { seq: 35 } } }).markup, '');
});

test('没投出的一轮：尾部什么都不画（那句说明归工具行）', () => {
  globalThis.localStorage = fakeStorage();
  assert.equal(html({ call: settled(hidden) }).markup, '');
});

test('结果形状不认识的轮次不画：读不出「投出去了」，两个注册项都不动', () => {
  globalThis.localStorage = fakeStorage();
  const legacy = settled(JSON.stringify({ pending: true, message: 'old' }), {
    argsRaw: JSON.stringify({ questions: [{ id: 'a', question: '选哪个？', multi_select: false, options: [{ label: '甲' }] }] }),
  });
  assert.equal(html({ call: legacy }).markup, '');
});

test('推荐项默认勾上；取消掉之后不再勾回来（「清空过」与「没作答」分得开）', () => {
  globalThis.localStorage = fakeStorage();
  assert.match(html().markup, /data-checked="true"/);
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ [CALL]: { 1: { selected: [], custom: '' } } }),
  });
  assert.doesNotMatch(html().markup, /data-checked="true"/);
});

test('刷新后恢复：storage 里的勾选与自填回到表单上', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ [CALL]: { 1: { selected: ['B：新建一层'], custom: '我自己的补充' } } }),
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

test('推荐徽标与选项文字分工：文字里不带「（推荐）」，徽标另画', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  assert.doesNotMatch(markup, /B：新建一层（推荐）/);
  assert.match(markup, />推荐</);
});

test('导入键：还没导入时是「导入输入框」，草稿里已经是当前那份时变「已导入」', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ [CALL]: { 1: { selected: ['B：新建一层'], custom: '' } } }),
  });
  const fresh = html();
  assert.match(fresh.markup, /导入输入框/);
  assert.doesNotMatch(fresh.markup, /已导入/);
  const imported = html({ draft: blockOf('1.\n- B：新建一层') });
  assert.match(imported.markup, /已导入/);
  assert.doesNotMatch(imported.markup, />导入输入框</);
  // 「已导入」那份的图标与「还没导入」那份不同：一个打勾、一个下载（图标是 undefined 时两边都空）。
  // 只看页脚：多选项的方框里也画着一个勾，整段匹配会把它算进来。
  assert.match(footerOf(imported.markup), /data-icon="check"/);
  assert.doesNotMatch(footerOf(fresh.markup), /data-icon="check"/);
});

test('导入键：表单改过之后草稿里那份就旧了——按键变「更新输入框」，草稿再点一次才追上', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ [CALL]: { 1: { selected: ['B：新建一层'], custom: '' } } }),
  });
  const stale = html({ draft: blockOf('1.\n- A：扩展 /archive/guardCheck') });
  assert.match(stale.markup, /更新输入框/);
});

test('导入键：什么都没填时也能按（「我明确什么都没选」要能提交出去），按键上没有禁用与提示语', () => {
  globalThis.localStorage = fakeStorage();
  const empty = html({ call: settled(shown, { argsRaw: plainArgsRaw }) });
  const button = empty.buttons.find((candidate) => candidate.className === 'dsg-import');
  assert.notEqual(button.disabled, true, '空作答照导，按键不置灰');
  assert.equal(button.title, undefined, '没有「先去作答」这类提示语，因为没有什么可拦的');
});

test('点导入：把作答写进原生草稿（带这张表的记号与题号行，块在前、原有文字随后）', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ [CALL]: { 2: { selected: [], custom: '只改插件' } } }),
  });
  const { drafts, buttons } = html({ draft: '我另外想说一句。' });
  buttons.find((button) => button.className === 'dsg-import').onClick();
  assert.equal(
    drafts[0],
    `${blockOf('1.\n- B：新建一层\n2.\n- 只改插件')}\n\n我另外想说一句。`,
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

// --- 冻结 ---

const replyNode = (text, seq = 9, kind = 'user') => ({ kind, seq, content: [{ type: 'text', text }] });
/** 冻结态顶上那行摘要（切掉图标与标签，只留那句「本轮已过 · N 题 · 已填 M」）。 */
const summaryText = (markup) => decodeEntities(/本轮已过[^<]*/.exec(markup)?.[0] ?? '');

test('冻结：整块不可折叠、始终摊开——摘要行留着但不可点、没有箭头，表就在下面', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ [CALL]: { 1: { selected: ['B：新建一层'], custom: '自填的补充' }, 2: { selected: [], custom: '' } } }),
  });
  const { markup } = html({ nodes: [settled(shown), replyNode(blockOf('1.\n- B：新建一层\n2.\n- 自填的补充'))] });
  assert.match(markup, /data-readonly="true"/);
  // 没有任何折叠控件：折叠行、箭头、展开/收起键都不许有
  assert.doesNotMatch(markup, /class="dsg-frozen[" ]/, '不再用折叠行承载');
  // 摘要留着，且与表同处一层：摘要、题干、勾选框、自填框全都在
  assert.match(summaryText(markup), /^本轮已过 · 2 题 · 已填 2$/);
  assert.match(markup, /dsg-summaryIcon/, '问号图标留着，只去掉箭头');
  assert.match(markup, /Host 权威层怎么改？/);
  assert.match(markup, /范围呢？/);
  assert.match(markup, /data-checked="true"/);
  assert.match(markup, /<input class="dsg-optionInput" type="checkbox"[^>]*disabled=""/);
  assert.match(markup, /自填的补充/);
  assert.match(markup, /<textarea[^>]*readonly=""/);
  // 不是「一行行答案」，也不再有导入键
  assert.doesNotMatch(markup, /dsg-answer/);
  assert.doesNotMatch(markup, /导入输入框/);
  // 分叉键还在（回看时也能从这一轮开新会话）
  assert.match(markup, /从这里分叉/);
});

test('冻结：摘要行只是文字，不是键——它既拦不住也不能被点开', () => {
  globalThis.localStorage = fakeStorage();
  const { markup, buttons } = html({ nodes: [settled(shown), replyNode(blockOf('2.\n- 只改插件'))] });
  assert.match(markup, /本轮已过 · 2 题 · 已填 1/);
  assert.equal(buttons.length, 1, '冻结时页面上只有分叉一个键，摘要行不在其中');
  assert.equal(buttons[0].className, 'dsg-fork');
});

test('冻结：摘要只说这轮的题数与答了几题；块里没有的题就是没作答，推荐默认不勾回来', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ nodes: [settled(shown), replyNode(blockOf('2.\n- 只改插件'))] });
  assert.match(summaryText(markup), /^本轮已过 · 2 题 · 已填 1$/);
  assert.equal([...markup.matchAll(/data-checked="true"/g)].length, 0);
});

test('冻结：按实发消息重画——输入框里改过的以那条消息为准，不是表单里那份', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ [CALL]: { 1: { selected: ['A：扩展 /archive/guardCheck'], custom: '' }, 2: { selected: [], custom: '表单里那份' } } }),
  });
  const { markup } = html({
    nodes: [settled(shown), replyNode(blockOf('1.\n- B：新建一层\n- 消息里补的一句\n2.\n- 只改插件'))],
  });
  assert.match(markup, /消息里补的一句/);
  assert.doesNotMatch(markup, /表单里那份/, '实发消息里没有的，不许从本地那份补上');
});

test('冻结：只认带着这张表记号的那条发言——转向消息、聊别的事、别的表的块都不锁它', () => {
  globalThis.localStorage = fakeStorage();
  const steering = html({ nodes: [settled(shown), replyNode('边跑边补一句', 7, 'steering')] });
  assert.doesNotMatch(steering.markup, /data-readonly="true"/);
  assert.match(steering.markup, /导入输入框/);
  const chatty = html({ nodes: [settled(shown), replyNode('我另外想说一句，没导入。')] });
  assert.doesNotMatch(chatty.markup, /data-readonly="true"/);
  const other = html({ nodes: [settled(shown), replyNode(`${importBlockStart('zzzz')}\n1.\n- 别的表\n【/拷问作答】`)] });
  assert.doesNotMatch(other.markup, /data-readonly="true"/);
});

test('冻结：不拿后面轮次的作答重画（只认这张表自己那块）', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({
    nodes: [
      settled(shown),
      replyNode(blockOf('2.\n- 先答的'), 9),
      replyNode(blockOf('1.\n- B：新建一层'), 20),
    ],
  });
  assert.match(markup, /先答的/);
  assert.equal([...markup.matchAll(/data-checked="true"/g)].length, 0, '后面那轮的勾选不许出现在这一轮的表上');
});

test('冻结：块在但坏了才退回本地那份（内容不凭空消失）', () => {
  globalThis.localStorage = fakeStorage({
    [SESSION_KEY]: JSON.stringify({ [CALL]: { 2: { selected: [], custom: '本地那份自填' } } }),
  });
  const { markup } = html({ nodes: [settled(shown), replyNode(blockOf('跟哪道题都对不上：随便'))] });
  assert.match(markup, /本地那份自填/);
});

test('冻结时不再有任何导入入口：只剩分叉键', () => {
  globalThis.localStorage = fakeStorage();
  const { markup, buttons } = html({ nodes: [settled(shown), replyNode(blockOf('2.\n- 只改插件'))] });
  assert.doesNotMatch(markup, /导入输入框/);
  assert.equal(buttons.length, 1, '冻结时只剩一个分叉键');
});

// --- 提问表单已被后面那张取代 ---

const replacing = (overrides = {}) => settled(shown, {
  callId: 'call-2',
  seq: 12,
  call: { name: 'grilling_form', argsRaw: JSON.stringify({ questions: [{ question: '更新的？' }], replace: true }) },
  ...overrides,
});

test('被取代：后面那一轮带 replace: true 投出过，这张表只剩一行字——两道题都不再画', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ later: replacing() });
  assert.match(markup, /data-superseded="true"/);
  assert.match(markup, /提问表单已被后面那张取代/);
  assert.doesNotMatch(markup, /Host 权威层怎么改？/);
  assert.doesNotMatch(markup, /范围呢？/);
  assert.doesNotMatch(markup, /<textarea/);
  assert.doesNotMatch(markup, /导入输入框/);
  assert.doesNotMatch(markup, /从这里分叉/);
});

test('被取代：后面那张没投出去、或没带 replace: true 时，这张表照旧可填', () => {
  globalThis.localStorage = fakeStorage();
  const blocked = replacing({ content: [{ type: 'text', text: hidden }] });
  assert.doesNotMatch(html({ later: blocked }).markup, /提问表单已被后面那张取代/);
  const plain = settled(shown, { callId: 'call-2', seq: 12 });
  assert.doesNotMatch(html({ later: plain }).markup, /提问表单已被后面那张取代/);
});

test('被取代：自己那份作答块已经到了的表不显示「被取代」——它是已答的那张', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ later: replacing(), nodes: [settled(shown), replyNode(blockOf('2.\n- 答了'))] });
  assert.doesNotMatch(markup, /提问表单已被后面那张取代/);
  assert.match(markup, /data-readonly="true"/);
});


// --- 取代时把旧表的勾选搬过来 ---

/** 旧表问的两道题：第一道与新表的题干一字不差，第二道差一个字。 */
const earlierArgs = JSON.stringify({
  questions: [
    { question: '同一句话？', options: [{ label: '甲：这样' }] },
    { question: '差一个字？' },
  ],
});
/** 新表：题干一样的那道题要带着旧表的勾选与自填，改过的那道不带。 */
const carriedArgs = JSON.stringify({
  questions: [{ question: '同一句话？', options: [{ label: '甲：这样' }, { label: '乙：那样' }] }],
  replace: true,
});
const earlierForm = settled(shown, { callId: 'call-old', seq: 3, call: { name: 'grilling_form', argsRaw: earlierArgs } });
const seedOldAnswers = () => fakeStorage({
  [SESSION_KEY]: JSON.stringify({
    'call-old': { 1: { selected: ['甲：这样'], custom: '旧表填的' }, 2: { selected: [], custom: '不该搬' } },
  }),
});

test('取代时搬勾选：题干一字不差的那道题带着旧表的勾选与自填，改过一个字的不带', () => {
  globalThis.localStorage = seedOldAnswers();
  const { drafts, buttons } = html({ earlier: earlierForm, call: settled(shown, { argsRaw: carriedArgs }) });
  const markup = html({ earlier: earlierForm, call: settled(shown, { argsRaw: carriedArgs }) }).markup;
  assert.match(markup, /data-checked="true"/, '新表上没有推荐项，勾上只可能来自搬运');
  assert.match(markup, /旧表填的/);
  assert.doesNotMatch(markup, /不该搬/, '题干差一个字就不搬');
  assert.deepEqual(drafts, [], '取代发生时不往草稿里写：要等用户自己点导入');
  buttons.find((button) => button.className === 'dsg-import').onClick();
  assert.match(drafts[0], /- 甲：这样/);
  assert.match(drafts[0], /- 旧表填的/);
});

test('取代时搬勾选：这一轮没点名取代就不搬（那不是取代，是又投了一张）', () => {
  globalThis.localStorage = seedOldAnswers();
  const withoutReplace = JSON.stringify({ questions: [{ question: '同一句话？', options: [{ label: '甲：这样' }, { label: '乙：那样' }] }] });
  const { markup } = html({ earlier: earlierForm, call: settled(shown, { argsRaw: withoutReplace }) });
  assert.doesNotMatch(markup, /data-checked="true"/);
  assert.doesNotMatch(markup, /旧表填的/);
});

test('取代时搬勾选：这一轮自己那份优先——用户已经动过的地方不让搬运盖回去', () => {
  globalThis.localStorage = seedOldAnswers();
  globalThis.localStorage.setItem(SESSION_KEY, JSON.stringify({
    'call-old': { 1: { selected: ['甲：这样'], custom: '旧表填的' } },
    [CALL]: { 1: { selected: ['乙：那样'], custom: '这一轮自己填的' } },
  }));
  const { markup } = html({ earlier: earlierForm, call: settled(shown, { argsRaw: carriedArgs }) });
  assert.match(markup, /这一轮自己填的/);
  assert.doesNotMatch(markup, /旧表填的/);
});


// --- 题型 ---

test('单选题：勾选框上再点别的项就换掉上一个（一题至多一项），题面照旧把两项都画出来', () => {
  globalThis.localStorage = fakeStorage();
  const single = JSON.stringify({
    questions: [{ type: 'single', question: '继续吗？', options: [{ label: '继续（推荐）' }, { label: '停一下' }] }],
  });
  const { markup, buttons } = html({ call: settled(shown, { argsRaw: single }) });
  assert.match(markup, /继续/);
  assert.match(markup, /停一下/);
  assert.equal([...markup.matchAll(/data-checked="true"/g)].length, 1, '推荐项默认勾上一项');
  const importButton = buttons.find((button) => button.className === 'dsg-import');
  assert.notEqual(importButton, undefined);
});

test('单选题的选项行挂单选标记，多选不挂——画的圈与方框靠这个标记分派', () => {
  globalThis.localStorage = fakeStorage();
  const single = JSON.stringify({
    questions: [{ type: 'single', question: '继续吗？', options: [{ label: '继续' }] }],
  });
  const singleMarkup = html({ call: settled(shown, { argsRaw: single }) }).markup;
  assert.match(singleMarkup, /<div class="dsg-option dsg-optionSingle"/, '单选那题的选项行带单选标记');
  // 多选题不标：选中时方框里画勾，圈那套样式一条都不挂
  const multiMarkup = html().markup;
  assert.match(multiMarkup, /<div class="dsg-option"/);
  assert.doesNotMatch(multiMarkup, /dsg-optionSingle/);
});

test('自由题：只有一个打字框——没有选择器、没有提示语，框比别的题高', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  // 这一轮里 1 是多选、2 是自由题：两题各画一个打字框，但只有 1 那两个选项是选择器
  assert.match(markup, /范围呢？/);
  const boxes = [...markup.matchAll(/<textarea[^>]*>/g)].map((match) => match[0]);
  assert.equal(boxes.length, 2, '每题一个打字框');
  assert.equal([...markup.matchAll(/<div class="dsg-option(?: |")/g)].length, 2, '自由题没有选择器');
  // 多选那题：矮一点，框里有提示语
  assert.match(boxes[0], /rows="2"/);
  assert.match(boxes[0], /placeholder="选项不够用的话，在这里自己写一段"/);
  // 自由题：高一点，空着不写提示语（它只有这一个框，没什么可指的）
  assert.match(boxes[1], /rows="4"/);
  assert.doesNotMatch(boxes[1], /placeholder/);
});

test('三种题型每题都有那个补充框：单选、多选、自由各数一个，谁也不缺', () => {
  globalThis.localStorage = fakeStorage();
  const allTypes = JSON.stringify({
    questions: [
      { type: 'single', question: '单选那题', options: [{ label: '甲' }, { label: '乙' }] },
      { type: 'multi', question: '多选那题', options: [{ label: '丙' }, { label: '丁' }] },
      { type: 'free', question: '自由那题' },
    ],
  });
  const { markup } = html({ call: settled(shown, { argsRaw: allTypes }) });
  assert.equal([...markup.matchAll(/<textarea/g)].length, 3, '三题各一个补充框');
  assert.equal([...markup.matchAll(/class="dsg-item"/g)].length, 3, '三题都在');
});

// --- 两处补充说明（题目 detail、选项 description）与压暗 ---

const detailArgsRaw = JSON.stringify({
  questions: [
    {
      question: '压到多淡？',
      detail: '只作用在选项区，圈和方框不压。',
      type: 'single',
      options: [
        { label: '0.5（推荐）', description: '跟宿主 disabled 观感一致。' },
        { label: '0.65', description: '淡一些但更清楚。' },
        { label: '换灰色' },
      ],
    },
    { type: 'free', question: '还有吗？', detail: '随便写。' },
  ],
});
const detailForm = () => html({ call: settled(shown, { argsRaw: detailArgsRaw }) });

test('题目 detail：题干下方单独一行，与后面那个选项区并排存在', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = detailForm();
  assert.match(markup, /class="dsg-questionDetail"><div data-markdown="compact">只作用在选项区，圈和方框不压。<\/div>/);
  assert.match(markup, /class="dsg-questionDetail"><div data-markdown="compact">随便写。<\/div>/);
});

test('选项的补充说明：画在它自己那一项里，缩进到选项文字下面', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = detailForm();
  const withDetail = /<div class="dsg-option dsg-optionSingle" data-checked="true">.*?<\/div><\/div><\/div>/.exec(markup)?.[0] ?? '';
  assert.match(withDetail, /class="dsg-optionDescription"><div data-markdown="compact">跟宿主 disabled 观感一致。<\/div>/);
  // 没写 description 的那一项不画空行：三条选项里只有前两条写了 description，画出来正好两行
  assert.equal([...markup.matchAll(/class="dsg-optionDescription"/g)].length, 2, '写了两条补充说明，只画两行');
  // 那一行从它自己的开标签起、到下一个选项行（或自填框）为止；比它前面那两行里都没有第三行
  const rowsWithText = [...markup.matchAll(/<div class="dsg-option(?: dsg-optionSingle)?"[^>]*>/g)]
    .map((match) => match.index ?? 0);
  assert.equal(rowsWithText.length, 3, '这一题三个选项');
  const endsAt = [...rowsWithText.slice(1), markup.indexOf('<textarea', rowsWithText[2])];
  const slices = rowsWithText.map((start, index) => markup.slice(start, endsAt[index]));
  assert.equal(slices.length, 3, '三个选项各切一段');
  assert.match(slices[2], /换灰色/, '第三段就是没写补充说明的那一项');
  assert.doesNotMatch(slices[2], /dsg-optionDescription/, '那一项里没有说明那一行');
  assert.match(slices[0], /dsg-optionDescription/, '写了补充说明的那行照样有那一行');
});

test('没写补充说明时一处都不画（不留空行、不留空 div）', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  assert.doesNotMatch(markup, /dsg-questionDetail/);
  assert.doesNotMatch(markup, /dsg-optionDescription/);
});

test('题干、选项、两处补充说明都交给 markdown 渲染器，用的是 compact 版', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = detailForm();
  const marks = [...markup.matchAll(/data-markdown="(\w+)"/g)].map((match) => match[1]);
  assert.ok(marks.length >= 4, '四处文字各有一个 markdown 块');
  assert.deepEqual([...new Set(marks)], ['compact'], '表单里的 markdown 一律用 compact 版');
  // 题干与选项也在其中：只给补充说明上 markdown 的话这两处断言会落到 0
  assert.match(markup, /data-markdown="compact">压到多淡？/);
  assert.match(markup, /data-markdown="compact">0.5/);
});

test('markdown 链接代理包在表单外面：槽位给的 openFile 传下去了', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  assert.match(markup, /^<div data-markdown-delegate="yes">/, '整张表都在代理范围内');
});

test('每个选项行都是一块可点的框：里面是藏起来的原生勾选框、画的控件、文字与说明', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  const rows = [...markup.matchAll(/<div class="dsg-option(?: dsg-optionSingle)?" data-checked="[^"]*">/g)];
  assert.equal(rows.length, 2, '这一轮两个选项各一行');
  const first = /<div class="dsg-option" data-checked="[^"]*">(.*?)<textarea/.exec(markup)?.[1] ?? '';
  assert.match(first, /<input class="dsg-optionInput" type="checkbox"\/>/, '原生勾选框在这一行里');
  assert.match(first, /class="dsg-optionControl"/, '画出来的控件也在');
  assert.match(first, /class="dsg-optionBody"/, '文字与说明归在一个体里');
  // 整行可点：行上挂的是点击动作，勾选框自己那份 onChange 保留（键盘仍改得动）
  assert.doesNotMatch(first, /<label/, '选项行不再用 label 包块级内容');
});

test('多选选中时方框里画勾，单选不画（圈里那个点由样式画）', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html();
  // 这一轮第 1 题是多选、推荐项默认勾上：它的控件里有一个勾图标
  const multiRow = /<div class="dsg-option" data-checked="true">.*?<\/div><\/div><\/div>/.exec(markup)?.[0] ?? '';
  assert.match(multiRow, /class="dsg-optionControl"><span data-icon="check"><\/span>/);
  const singleArgs = JSON.stringify({
    questions: [{ type: 'single', question: '继续吗？', options: [{ label: '继续（推荐）' }] }],
  });
  const singleMarkup = html({ call: settled(shown, { argsRaw: singleArgs }) }).markup;
  const singleRow = /<div class="dsg-option dsg-optionSingle" data-checked="true">.*?<\/div><\/div><\/div>/.exec(singleMarkup)?.[0] ?? '';
  assert.doesNotMatch(singleRow, /data-icon="check"/, '单选的选中态是圈里一个点，不画勾');
});

test('冻结时选项区压暗由 data-readonly 加选项区那几个类名挂样式（不是把整张表压掉）', () => {
  globalThis.localStorage = fakeStorage();
  const { markup } = html({ nodes: [settled(shown), replyNode(blockOf('2.\n- 只改插件'))] });
  assert.match(markup, /data-readonly="true"/);
  // 压暗靠的是根上的标记 + 那几个类名，所以它们必须都在
  for (const name of ['dsg-optionText', 'dsg-optionDescription', 'dsg-badge', 'dsg-custom']) {
    const css = readFileSync(join(root, 'src', 'client', 'GrillingForm.css'), 'utf8');
    assert.match(
      css,
      new RegExp(`\\.dsg-root\\[data-readonly='true'\\][^{]*\\.${name}`),
      `${name} 要在冻结时分到压暗那一条`,
    );
  }
  // 题干、题号与画出来的控件不在压暗名单里：回看时题目要照样读得清，勾了哪项也看得出。
  const css = readFileSync(join(root, 'src', 'client', 'GrillingForm.css'), 'utf8');
  const dimRule = /\.dsg-root\[data-readonly='true'\][^{]*\{[^}]*\}/.exec(css)?.[0] ?? '';
  assert.notEqual(dimRule, '', '找不到冻结时压暗的那一条规则');
  assert.match(dimRule, /opacity:\s*0\.5/, '那一条确实是压到 0.5');
  const dimSelector = dimRule.slice(0, dimRule.indexOf('{'));
  assert.match(dimSelector, /dsg-optionText/, '压暗名单里要有选项文字');
  assert.doesNotMatch(dimSelector, /dsg-question\b/, '题干不压');
  assert.doesNotMatch(dimSelector, /dsg-number/, '题号不压');
  assert.doesNotMatch(dimSelector, /dsg-optionControl/, '圈与方框不压');
});


test('页面上没有任何 aria 属性', () => {
  globalThis.localStorage = fakeStorage();
  const markup = html().markup;
  assert.doesNotMatch(markup, /aria-/);
  assert.doesNotMatch(rowHtml(settled(hidden)).markup, /aria-/);
  assert.doesNotMatch(rowHtml(settled(hidden), { inspect: () => {} }).markup, /aria-/);
});

// --- 工具行：表搬走之后只剩没投出与失败 ---

test('被投出去的轮次：工具行什么都不画（页面上不会出现两张表）', () => {
  globalThis.localStorage = fakeStorage();
  assert.equal(rowHtml(settled(shown)).markup, '');
});

test('没投出：画结果里那句话（入参被拒与闸门拦下都是它），不做第二次转述', () => {
  const { markup, buttons } = rowHtml(settled(hidden));
  assert.match(markup, /An earlier form is still waiting for the answer./);
  assert.equal(buttons.length, 0);
});

test('没投出但结果里没有说明时，至少有一句人话', () => {
  const { markup } = rowHtml(settled(JSON.stringify({ ok: false })));
  assert.match(markup, /这一轮没有投出表单/);
});

test('结果形状不认识：工具行也不画（轮次里没有可画的表）', () => {
  assert.equal(rowHtml(settled(JSON.stringify({ pending: true, message: 'old' }))).markup, '');
  assert.equal(rowHtml(settled(JSON.stringify({ rejected: true, violations: ['x'] }))).markup, '');
});

test('调用失败：给失败说明', () => {
  const { markup } = rowHtml(settled('boom: tool runtime gone', { isError: true, error: { name: 'Error', code: 'EPIPE' } }));
  assert.match(markup, /boom: tool runtime gone/);
});

test('查看按钮只在槽位给了 inspect 时出现（没投出的那一轮）', () => {
  const notShown = settled(hidden);
  assert.match(rowHtml(notShown, { inspect: () => {} }).markup, /查看/);
  assert.doesNotMatch(rowHtml(notShown).markup, /查看/);
});

console.log(`${passed}/${total} passed`);
