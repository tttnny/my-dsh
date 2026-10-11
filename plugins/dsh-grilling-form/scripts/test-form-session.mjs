// 表单会话（内壳）的单测：一轮表单从投出到冻结的全部**组合规则**都收在这一个 interface 后面——
// 用户自己那份作答、叠在上面的推荐默认、冻结判定、写穿顺序、导入门禁。此前这些规则散在视图
// 组件里（两表不变量靠注释 + 代码 + 渲染自检三方共守），现在只有一个 owner。
//
// 低层纯函数（form-model.js）照旧各自直接可测，这里测的是它们的组合方式。
import assert from 'node:assert/strict';
import { createFormSession, initialFormAnswers } from '../src/form-session.js';

// 逐条跑、末尾汇总：一条失败不打断后面的，一次把所有红的都报出来（退出码在末尾给）。
let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    failures.push(name);
  }
}

/** 只有 getItem/setItem 的假存储。 */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    dump: () => Object.fromEntries(map),
  };
}

const SESSION = 'sess-1';
const CALL = 'call-1';
const KEY = `dsh-grilling-form.${SESSION}`;
const questions = [
  {
    id: 'a',
    header: 'Q1 · 落点',
    question: '落点放哪？',
    multiSelect: true,
    options: [
      { label: 'A：详情页（推荐）', displayLabel: 'A：详情页', recommended: true },
      { label: 'B：列表里', displayLabel: 'B：列表里', recommended: false },
    ],
  },
  { id: 'b', header: '', question: '范围呢？', multiSelect: true, options: [] },
];
/** 一道单选：一题至多留一项。 */
const singleQuestion = {
  id: 's',
  header: 'Q9 · 是否继续',
  question: '继续吗？',
  multiSelect: false,
  options: [
    { label: '继续（推荐）', displayLabel: '继续', recommended: true },
    { label: '停一下', displayLabel: '停一下', recommended: false },
  ],
};
const sessionOf = (overrides = {}) => createFormSession({
  questions,
  sessionId: SESSION,
  callId: CALL,
  storage: fakeStorage(),
  storedAnswers: {},
  ...overrides,
});

test('可填态：推荐项默认勾上，但默认不落进 storage（用户没动过就不算他的作答）', () => {
  const storage = fakeStorage();
  const session = sessionOf({ storage });
  assert.equal(session.readOnly, false);
  assert.deepEqual(session.answers.a, { selected: ['A：详情页（推荐）'], custom: '' });
  assert.equal(session.canImport, true);
  assert.deepEqual(storage.dump(), {}, '一进页面就把默认写进 storage，用户就再也分不清「取消过」与「没作答」');
});

test('勾选：写穿到 storage，返回给调用方的是用户自己那份（含他刚勾的）', () => {
  const storage = fakeStorage();
  const session = sessionOf({ storage });
  const merged = session.toggle('a', 'B：列表里');
  assert.deepEqual(merged.a.selected.sort(), ['A：详情页（推荐）', 'B：列表里'].sort());
  assert.deepEqual(JSON.parse(storage.dump()[KEY])[CALL].a.selected.sort(), ['A：详情页（推荐）', 'B：列表里'].sort());
});

test('取消默认推荐：写一条空记录（清空过 ≠ 没作答），重建会话也不会勾回来', () => {
  const storage = fakeStorage();
  const first = sessionOf({ storage });
  const merged = first.toggle('a', 'A：详情页（推荐）');
  assert.deepEqual(merged.a, { selected: [], custom: '' });
  const second = sessionOf({ storage, storedAnswers: merged });
  assert.deepEqual(second.answers.a, { selected: [], custom: '' });
  assert.equal(second.canImport, false, '一条作答都没有时导入键是灰的');
});

test('自填与勾选各自独立，落在同一份记录里', () => {
  const storage = fakeStorage();
  const first = sessionOf({ storage });
  const afterToggle = first.toggle('a', 'B：列表里');
  const afterCustom = sessionOf({ storage, storedAnswers: afterToggle }).setCustom('b', '只改插件');
  assert.deepEqual(afterToggle.a.selected.sort(), ['A：详情页（推荐）', 'B：列表里'].sort());
  assert.deepEqual(afterCustom.b, { selected: [], custom: '只改插件' });
  assert.deepEqual(JSON.parse(storage.dump()[KEY])[CALL].b, { selected: [], custom: '只改插件' });
});

test('导入：有作答时把块写进草稿（替换旧块 / 放在最前），没作答时原样返回', () => {
  const session = sessionOf();
  assert.equal(
    session.importInto('我另外想说一句。'),
    '【拷问作答】\nQ1 · 落点：\n- A：详情页\n【/拷问作答】\n\n我另外想说一句。',
  );
  const again = sessionOf();
  assert.match(again.importInto('【拷问作答】\n旧的一行\n【/拷问作答】\n\n后面的话'), /Q1 · 落点：\n- A：详情页/);
  const empty = sessionOf({ storedAnswers: { a: { selected: [], custom: '' }, b: { selected: [], custom: '' } } });
  assert.equal(empty.canImport, false);
  assert.equal(empty.importInto('原样'), '原样');
});

test('草稿状态：没块＝还没导入、块正是当前这份＝已导入、块旧了＝要更新、没作答可导＝空', () => {
  const session = sessionOf();
  assert.equal(session.draftState, 'none');
  const imported = sessionOf({ draft: session.importInto('') });
  assert.equal(imported.draftState, 'current');
  const changed = sessionOf({ storedAnswers: { b: { selected: [], custom: '改过了' } }, draft: session.importInto('') });
  assert.equal(changed.draftState, 'stale', '表单改过之后草稿里那份就旧了');
  const nothing = sessionOf({ storedAnswers: { a: { selected: [], custom: '' }, b: { selected: [], custom: '' } } });
  assert.equal(nothing.draftState, 'empty');
  assert.equal(sessionOf({ replyText: '【拷问作答】\nQ1 · 落点：\n- A：详情页\n【/拷问作答】', draft: '' }).draftState, 'empty', '冻结之后没有导入这回事');
});

test('单选：再勾一个就换掉上一个，一题至多留一项；自填照旧留着', () => {
  const storage = fakeStorage();
  const first = sessionOf({ questions: [singleQuestion], storage });
  assert.deepEqual(first.answers.s, { selected: ['继续（推荐）'], custom: '' }, '推荐项默认一项');
  const afterStop = sessionOf({ questions: [singleQuestion], storage, storedAnswers: first.toggle('s', '停一下') });
  assert.deepEqual(afterStop.answers.s.selected, ['停一下']);
  const afterCustom = sessionOf({ questions: [singleQuestion], storage, storedAnswers: afterStop.setCustom('s', '我自己定') });
  assert.deepEqual(afterCustom.answers.s, { selected: ['停一下'], custom: '我自己定' });
  const afterToggleOff = sessionOf({ questions: [singleQuestion], storage, storedAnswers: afterCustom.toggle('s', '停一下') });
  assert.deepEqual(afterToggleOff.answers.s, { selected: [], custom: '我自己定' }, '再点一下是取消，自填不跟着掉');
});

test('冻结：按实发消息重画，写操作改不动（原样返回），导入键关掉', () => {
  const storage = fakeStorage();
  const session = sessionOf({
    storage,
    replyText: '【拷问作答】\n范围呢？：\n- 只改插件\n【/拷问作答】',
  });
  assert.equal(session.readOnly, true);
  assert.deepEqual(session.answers.a, { selected: [], custom: '' }, '块里没有的题就是没作答，推荐默认不许勾回来');
  assert.deepEqual(session.answers.b, { selected: [], custom: '只改插件' });
  assert.equal(session.canImport, false);
  assert.equal(session.importInto('草稿'), '草稿');
  const unchanged = session.toggle('a', 'B：列表里');
  assert.deepEqual(unchanged, {}, '冻结之后不写 storage，也不改任何一把表');
  assert.deepEqual(storage.dump(), {});
});

test('冻结：实发消息里根本没有块＝没作答（本地勾选与推荐默认都不许冒充），只给一行说明', () => {
  const session = sessionOf({
    storedAnswers: { b: { selected: [], custom: '本地自填' } },
    replyText: '我另外想说一句，没导入。',
  });
  assert.equal(session.unanswered, true);
  assert.deepEqual(session.answers.a, { selected: [], custom: '' });
  assert.deepEqual(session.answers.b, { selected: [], custom: '' }, '本地那份在这时不是他的作答');
});

test('冻结：块坏了才退回本地那份（内容不凭空消失），并标出这是退回的一份', () => {
  const session = sessionOf({
    storedAnswers: { b: { selected: [], custom: '本地自填' } },
    replyText: '【拷问作答】\n跟哪道题都对不上：随便\n【/拷问作答】',
  });
  assert.equal(session.unanswered, false);
  assert.deepEqual(session.answers.a, { selected: ['A：详情页（推荐）'], custom: '' });
  assert.deepEqual(session.answers.b, { selected: [], custom: '本地自填' });
});

test('storage 不可用：照常可填、照样导入，只是刷新后不恢复', () => {
  const session = sessionOf({ storage: undefined });
  const merged = session.setCustom('b', 'x');
  assert.deepEqual(merged.b, { selected: [], custom: 'x' });
  assert.equal(session.canImport, true);
});

test('initialFormAnswers：按会话 + 轮次读回用户自己那份，读不到就是空', () => {
  const storage = fakeStorage({
    [KEY]: JSON.stringify({ [CALL]: { a: { selected: [], custom: '上次写的' } }, 'call-2': { a: { selected: [], custom: '别轮' } } }),
  });
  assert.deepEqual(initialFormAnswers({ sessionId: SESSION, callId: CALL, storage }), { a: { selected: [], custom: '上次写的' } });
  assert.deepEqual(initialFormAnswers({ sessionId: '别的会话', callId: CALL, storage }), {});
  assert.deepEqual(initialFormAnswers({ sessionId: SESSION, callId: CALL, storage: undefined }), {});
});

console.log(`${passed}/${passed + failures.length} passed`);
if (failures.length > 0) process.exitCode = 1;
