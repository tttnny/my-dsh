/**
 * 视图自检：用真 react 跑一遍行组件，断言卡片上确实出现该出现的东西。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 是替身：真组件是浏览器里的 ESM、带 .css 导入，
 * Node 里跑不起来。替身只做「把 title / collapsedContent / children 原样渲染出来」这一件事，
 * 所以这里验证的是本插件自己的视图结构与文案；真组件的外观要在浏览器里看。
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

/** 只渲染 props 的 ui-primitives 替身，见文件头。同时记下 DisclosureRow 收到的那份 props：
 * 展开是受控的，`onToggle` 漏传时真组件不会挂 onClick（`expandOnRowClick` 也救不回来），
 * 症状是行永远展不开、正文永远不出现——这条只有在这里断言才拦得住。 */
let lastDisclosureProps = null;
const primitives = {
  DisclosureRow: (props) => {
    lastDisclosureProps = props;
    const { title, collapsedContent, children } = props;
    return createElement('div', null, title, collapsedContent, children);
  },
  MarkdownText: ({ text }) => createElement('span', null, text),
  StateDot: () => createElement('span', null),
  IconQuestionOutline14: () => null,
  IconInspectOutline12: () => null,
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
    },
  ],
});
const settled = (text, extra = {}) => ({
  kind: 'result',
  call: { name: 'ask_user_grilling', argsRaw },
  content: [{ type: 'text', text }],
  ...extra,
});
const running = { callId: 'call-1', name: 'ask_user_grilling', argsRaw };
const answers = (entries) => JSON.stringify({ answers: entries });

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

const html = (block, props = {}) => renderToStaticMarkup(createElement(row.component, {
  callId: 'call-1',
  toolName: 'ask_user_grilling',
  block,
  t: translate,
  ...props,
}));

test('已作答：摘要给计数，正文给题号、题干、detail、选项与轮末补充题', () => {
  const markup = html(settled(answers([
    { id: 'h1', selected: ['A：扩展 /archive/guardCheck'] },
    { id: '__grill_round_supplement__', selected: ['无需补充'] },
  ])));
  assert.match(markup, /提问/);
  assert.match(markup, /2\/2 已回答/);
  assert.match(markup, /Q2 · Host 权威层/);
  assert.match(markup, /Host 权威层怎么改？/);
  assert.match(markup, /正文第一段。/);
  assert.match(markup, /A：扩展 \/archive\/guardCheck/);
  assert.match(markup, /这轮还有什么要补充或调整的吗？/);
  assert.match(markup, /无需补充/);
});

test('已作答：没答的题标「未回答」，答了的计入计数', () => {
  const markup = html(settled(answers([
    { id: 'h1', selected: [] },
    { id: '__grill_round_supplement__', selected: ['无需补充'] },
  ])));
  assert.match(markup, /1\/2 已回答/);
  assert.match(markup, /未回答/);
});

test('运行中：摘要给等待回答，题目已列出', () => {
  const markup = html(running);
  assert.match(markup, /等待回答/);
  assert.match(markup, /Host 权威层怎么改？/);
});

test('被拒：给违规清单，不给补充题', () => {
  const markup = html(settled(JSON.stringify({
    rejected: true,
    violations: ['Question 1 (id "__grill_sneak__") uses the reserved prefix'],
    error: '1 violation(s) in this round',
    answers: [],
  })));
  assert.match(markup, /入参被拒绝/);
  assert.match(markup, /reserved prefix/);
  assert.doesNotMatch(markup, /这轮还有什么要补充或调整的吗？/);
});

test('取消：给说明与题目', () => {
  const markup = html(settled('', { isError: true, error: { name: 'UserQuestionError', code: 'ASK_CANCELLED' } }));
  assert.match(markup, /本轮已取消/);
  assert.match(markup, /Host 权威层怎么改？/);
});

test('调用失败：给失败说明', () => {
  const markup = html(settled('boom: seam unavailable', { isError: true, error: { name: 'Error', code: 'EPIPE' } }));
  assert.match(markup, /调用失败/);
  assert.match(markup, /boom: seam unavailable/);
});

test('行是可展开的：DisclosureRow 拿到受控的 onToggle（漏传则整行点不开、正文永不出现）', () => {
  html(settled(answers([{ id: 'h1', selected: ['A'] }])));
  assert.equal(typeof lastDisclosureProps.onToggle, 'function', '没给 onToggle，展开行挂不上点击');
  assert.equal(lastDisclosureProps.expandOnRowClick, true);
  assert.equal(lastDisclosureProps.open, false, '初始应折叠');
  assert.equal(lastDisclosureProps.expandable, true, '这一行有内容，应当可展开');
});

test('没有内容的行不给 onToggle：不可展开', () => {
  // argsRaw 为空、结果为空 → expandable 为 false，此时展开态恒为 false。
  html({ kind: 'result', call: { name: 'ask_user_grilling', argsRaw: '' }, content: [] });
  assert.equal(lastDisclosureProps.expandable, false);
  assert.equal(lastDisclosureProps.open, false);
});

test('流式半截 JSON：退回原始文本，不假装读懂了', () => {
  const markup = html({ callId: 'call-2', name: 'ask_user_grilling', argsRaw: '{"questions":[{"id":"h1","quest' });
  assert.match(markup, /dsg-raw/);
  assert.match(markup, /h1/);
  assert.doesNotMatch(markup, /这轮还有什么要补充或调整的吗？/);
});

test('查看按钮只在槽位给了 inspect 时出现', () => {
  const withInspect = html(settled(answers([{ id: 'h1', selected: ['A'] }])), { inspect: () => {} });
  assert.match(withInspect, /查看/);
  const without = html(settled(answers([{ id: 'h1', selected: ['A'] }])));
  assert.doesNotMatch(without, /查看/);
});

console.log(`${passed}/${total} passed`);
