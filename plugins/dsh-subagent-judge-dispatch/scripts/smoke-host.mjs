/**
 * 宿主半边自检：真 cordis `Context`，把「子代理创建 → 判断 → 选定路线」这条链
 * 按宿主真实的 `agent/created` 钩子跑一遍。
 *
 * 这里守的是三件自检以外看不见的事：
 *   1. 判断失败（连不上、答复对不上清单）时**一个字段都不写**——不是「写回原值」，
 *      而是根本不调 `agent.model.select()`，子代理按宿主解析好的路线跑；
 *   2. 改写时模型、强度、提供方三项一起交给 `select()`；
 *   3. 同一个子代理只判一次，主代理与嵌套之外的东西一概不碰。
 *
 * 跑法：pnpm test / node scripts/smoke-host.mjs
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mock } from 'node:test';

import { Context } from '@deepseek-ai/cordis';

import * as plugin from '../lib/index.js';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const pkgName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;

// 判断日志落盘到家目录：每个 mount() 换一个仓库根 tmp/ 下的临时家目录，自检既
// 不去读写真实的家目录，也不会把上一条用例剩下的记录读成这一条用例的。
const tmpRoot = join(root, '..', '..', 'tmp');
mkdirSync(tmpRoot, { recursive: true });
const tmpHomes = [];
process.on('exit', () => {
  for (const dir of tmpHomes) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // 临时目录删不掉不影响自检结论。
    }
  }
});

/** 换一份空的家目录，返回它。 */
function freshHome() {
  const dir = mkdtempSync(join(tmpRoot, 'judge-host-'));
  tmpHomes.push(dir);
  process.env.DSH_HOME = dir;
  return dir;
}

/** 当前家目录里落盘的日志。 */

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

/** One Config ref set, the way DSH hands resolved Volatile refs to apply(). */
function makeConfig(overrides = {}) {
  const value = {
    enabled: true,
    sessionOverrides: {},
    logEnabled: true,
    endpointUrl: 'http://judge.invalid',
    judgeModel: 'jev-latest',
    rows: [
      { description: '机械修改', provider: 'd1api', model: 'deepseek-v4.1-flash', effort: 'low' },
      { description: '评审代码', provider: 'a6api', model: 'kimi-k3', effort: 'high' },
    ],
    ...overrides,
  };
  const ref = (key) => ({ get: () => value[key] });
  return {
    enabled: ref('enabled'),
    sessionOverrides: ref('sessionOverrides'),
    logEnabled: ref('logEnabled'),
    endpointUrl: ref('endpointUrl'),
    judgeModel: ref('judgeModel'),
    rows: ref('rows'),
  };
}

const RETURN_GUIDANCE = 'Your final answer is delivered automatically if your parent is still online. Include the result.';

/** The delegation message itself, in the shape the Host builds it. */
function delegationMessage(taskText, guidance = RETURN_GUIDANCE, senderSessionId = 'session-main') {
  return {
    source: { kind: 'agent-message', form: 'relay', senderSessionId },
    content: [
      { type: 'text', text: 'Agent lead sent a message: ' },
      { type: 'text', text: taskText },
      { type: 'text', text: guidance },
    ],
  };
}

/**
 * The events a freshly delegated child's own log opens with, in one of the two
 * shapes its delegation takes.
 *
 * `pending` is what the first request sees: the delegation is spliced into the
 * inbox and claimed at the step boundary, and it becomes a `user/message` only
 * after the request this plugin hooks is answered. `committed` is the message
 * after that append. A log may carry either, so the task must be readable from
 * both.
 *
 * Alongside it sits a user-role message that is not the task: the
 * working-directory notice. Reading the task means telling these apart by
 * source, and dropping the appended guidance.
 *
 * @param taskText - the delegated task.
 * @param options - `committed` selects the committed shape; `guidance` picks the
 *   release's return-guidance wording.
 * @returns the child-owned events, in log order.
 */
function delegatedMessages(taskText, { committed = false, guidance = RETURN_GUIDANCE } = {}) {
  const message = delegationMessage(taskText, guidance);
  const notice = {
    type: 'user/message',
    data: {
      source: { kind: 'working-directory' },
      content: [{ type: 'text', text: 'The working directory changed from "/w" to "/w/child".' }],
    },
  };
  if (committed) return [notice, { type: 'user/message', data: message }];
  return [
    notice,
    { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [message] } },
    { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, removedCount: 1, inserted: [] } },
  ];
}

/** The inherited route every fake child starts on. */
const INHERITED = { provider: 'magpie', model: 'future/deepseek-v4.1-flash', reasoningEffort: 'high' };

/**
 * One Agent's model face: the route it would run on, and what the plugin selected.
 *
 * `selected` stays undefined when the plugin wrote nothing, which is exactly the
 * negative the failure tests assert.
 */
function modelFace(inherited = INHERITED) {
  const face = {
    selected: undefined,
    current: () => inherited,
    select: (selection) => { face.selected = selection },
  };
  return face;
}

/** A child agent whose durable facts say "subagent, delegated by the main one". */
function childAgent(
  id = 'child-1',
  label = '跑一下测试',
  taskText = '把测试跑一遍',
  options = {},
) {
  return {
    id,
    testDelegation: { description: label, prompt: taskText },
    options: { subagentDepth: 1 },
    model: modelFace(),
    session: {
      header: { id, parentSession: 'session-main', delegationDepth: 1 },
      snapshotEvents: () => [
        { type: 'subagent/descriptor', data: { version: 3, mode: 'one-shot', provider: 'in-process', label } },
        ...delegatedMessages(taskText, options),
      ],
    },
  };
}

/**
 * A forked child: its log opens with the parent's finished turns, so the
 * inherited prefix carries an ANCESTOR's descriptor and the parent's own first
 * message. Only the child-owned tail describes this delegation.
 */
function forkedChildAgent(id = 'child-fork') {
  const inherited = [
    { type: 'subagent/descriptor', data: { version: 3, mode: 'one-shot', provider: 'in-process', label: '祖先的活' } },
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '父代理对话的第一条消息' }] } },
  ];
  const own = [
    { type: 'subagent/descriptor', data: { version: 3, mode: 'one-shot', provider: 'in-process', label: '真正这次派的活' } },
    ...delegatedMessages('这次的任务正文'),
  ];
  return {
    id,
    testDelegation: { description: '真正这次派的活', prompt: '这次的任务正文' },
    options: { subagentDepth: 1 },
    model: modelFace(),
    session: {
      header: { id, parentSession: 'session-main', delegationDepth: 1 },
      inheritedEventCount: inherited.length,
      ownEvents: () => own,
      snapshotEvents: (from = 0) => [...inherited, ...own].slice(from),
    },
  };
}

/**
 * A child exactly as the Host creates it: the descriptor is there, the task is not.
 *
 * A fresh delegation is submitted as queued inbox input only after the creation
 * listeners return, so the task text has to come from the delegating `tool/call`
 * the parent already recorded.
 */
function freshChildAgent(id = 'child-fresh', label = '跑一下测试') {
  return {
    id,
    options: { subagentDepth: 1 },
    model: modelFace(),
    session: {
      header: { id, parentSession: 'session-main', delegationDepth: 1 },
      snapshotEvents: () => [
        { type: 'subagent/descriptor', data: { version: 3, mode: 'one-shot', provider: 'in-process', label } },
      ],
    },
  };
}

/** The parent session as it looks while the delegating tool call is executing. */
function nativeCall(args, { name = 'subagent', callId = 'native-1' } = {}) {
  return { type: 'tool/call', data: { name, callId, arguments: JSON.stringify(args) } };
}

function parentWithCalls(calls) {
  return {
    header: { id: 'session-main' },
    snapshotEvents: () => calls.map((args, index) => nativeCall(args, { callId: `native-${index}` })),
  };
}

/** The outer `run_code` call a programmatic delegation leaves in the parent log. */
const RUN_CODE_CALL = {
  type: 'tool/call',
  data: { name: 'run_code', arguments: JSON.stringify({ code: 'await tools.subagent({ ... })' }) },
};

/** One nested call as the parent records it when it came from inside `run_code`. */
function ptcCall(name, args, subCallId = 'ptc-1') {
  return { type: 'tool/ptc-dispatch-start', data: { name, arguments: args, subCallId } };
}

/**
 * The parent session as it looks while a delegation made from inside `run_code`
 * is executing: the nested call is a `tool/ptc-dispatch-start` whose arguments
 * are already the normalized object, and the outer `tool/call` names only
 * `run_code`.
 */
function parentWithPtcCalls(calls) {
  return {
    header: { id: 'session-main' },
    snapshotEvents: () => [
      RUN_CODE_CALL,
      ptcCall('bash', { description: '先看一眼改动', command: 'git status' }),
      ...calls.map((args, i) => ptcCall('subagent', args, `ptc-${i}`)),
    ],
  };
}

/** A top-level agent: no delegation depth at all. */
function mainAgent() {
  return {
    id: 'session-main',
    options: {},
    model: modelFace(),
    session: { header: {}, snapshotEvents: () => [] },
  };
}

/**
 * Mount the plugin on a real cordis Context and capture the `agent/created`
 * listener it registers.
 */
function mount(configOverrides = {}, options = {}) {
  // 日志在 apply() 里按当时的 DSH_HOME 定下位置，所以要在这之前换好。
  freshHome();
  const ctx = new Context();
  const handlers = [];
  let currentAgent;
  const original = ctx.on.bind(ctx);
  ctx.on = (name, listener) => {
    if (name === 'agent/created') handlers.push(async (payload) => {
      currentAgent = payload.agent;
      try { await listener(payload); } finally { currentAgent = undefined; }
    });
    return original(name, listener);
  };
  ctx.credentials = {
    resolve: async (ref) => {
      resolvedRefs.push(ref);
      return { value: 'test-key' };
    },
    describe: async () => ({ configured: true, writable: true }),
  };
  ctx.sessions = {
    get(id) {
      if (id === 'session-main' && options.parentSession) return options.parentSession;
      const session = options.otherSessions?.[id];
      if (id !== 'session-main' && session === undefined) return undefined;
      const agent = currentAgent;
      if (agent?.testDelegation && id === agent.session.header.parentSession) {
        return { header: { ...session?.header, id }, snapshotEvents: () => [
          nativeCall(agent.testDelegation),
          { type: 'subagent/catalog', data: { childId: agent.id } },
        ] };
      }
      return session ?? { header: { id }, snapshotEvents: () => [] };
    },
  };
  ctx.provide('subagentModelSelection', { allowedRoutes: options.allowedRoutes ?? (() => [
    { provider: 'd1api', model: 'deepseek-v4.1-flash' },
    { provider: 'a6api', model: 'kimi-k3' },
  ]) });
  ctx.provide('llm', { resolveCallConfig: options.preflight ?? (async () => {}) });
  if (options.storedHeaders) {
    ctx.provide('sessionPersistence', {
      stat: async (id) => options.storedHeaders[id] && { header: options.storedHeaders[id] },
    });
  }
  // 插件的三条读取挂在 connection 的 /api 通道上：给了这个服务，页面读日志那条路
  // 才会被注册，下面的日志测试才有地方读。
  const routes = [];
  ctx.provide('connection', {
    fetch: { register: (route) => { routes.push(route); return () => {}; } },
  });
  plugin.apply(ctx, makeConfig(configOverrides));
  return { ctx, handlers, routes };
}

/** 凭据服务被问过哪些引用名；用来证明插件读的是自己那个固定引用。 */
const resolvedRefs = [];

/** Create one child through the captured hook with a stubbed judge endpoint. */
async function judgeOnce(handlers, agent, fetchStub, source = agent.testDelegation ? 'resume' : 'startup') {
  const saved = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    assert.equal(handlers.length, 1, 'agent/created 应当只挂一个监听器');
    // 让 apply() 里那次凭据读取落地
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));
    await handlers[0]({ agent, source });
    return agent.model.selected;
  } finally {
    globalThis.fetch = saved;
  }
}

const answer = (choice) =>
  async () => new Response(JSON.stringify({ answers: { task_type: { choice } } }), { status: 200 });

async function assertNotJudged(handlers, agent) {
  let calls = 0;
  const result = await judgeOnce(handlers, agent, async () => {
    calls += 1;
    return answer('2')();
  });
  assert.equal(calls, 0);
  assert.equal(result, undefined);
}

const { handlers } = mount();

await test('导出的行身份与包内 cordis.patch.yml 那条装配行同名', () => {
  assert.equal(plugin.name, 'dsh-subagent-judge-dispatch');
  assert.deepEqual(plugin.inject, ['credentials', 'sessions']);
});

await test('判断密钥从插件自己那个固定引用读，不是从页面填的名字', async () => {
  assert.equal(plugin.JUDGE_API_KEY_REF, 'SUBAGENT_JUDGE_API_KEY');
  // 读的是哪个引用名，只有「问过哪个名字」能证明；替身对任何名字都回同一个值，
  // 所以断言落在记账上，不落在读到的值上。
  assert.deepEqual(resolvedRefs, ['SUBAGENT_JUDGE_API_KEY']);
});

await test('判断成功时三项一起写到这次调用上', async () => {
  const result = await judgeOnce(handlers, childAgent('child-ok'), answer('1'));
  assert.equal(result.provider, 'd1api');
  assert.equal(result.model, 'deepseek-v4.1-flash');
  assert.equal(result.reasoningEffort, 'low');
});

await test('判断连不上时一个字段都不写', async () => {
  const result = await judgeOnce(handlers, childAgent('child-down'), async () => {
    throw new Error('connection refused');
  });
  assert.equal(result, undefined, '失败必须什么都不写');
});

await test('答复对不上清单时同样一个字都不写', async () => {
  const result = await judgeOnce(handlers, childAgent('child-bad'), answer('99'));
  assert.equal(result, undefined);
});

await test('日志只保存路线和请求统计', async () => {
  const mounted = mount();
  // connection 是通过 ctx.inject 取的可选服务：那条 fiber 在自己的回合里才装载。
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  const logRoute = mounted.routes.find((route) => route.path === '/api/dsh-subagent-judge-dispatch/log');
  assert.ok(logRoute, '日志路由注册上了');

  let sent;
  await judgeOnce(mounted.handlers, childAgent('child-prompt', '只读地盯着这个活', '正文开头' + '中间细节'.repeat(60) + '完整正文末尾'), async (_url, init) => {
    sent = init.body;
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });

  const body = await (await logRoute.fetch(new Request('http://host/api/log'), {})).json();
  assert.equal(body.entries.length, 1);
  const entry = body.entries[0];
  const request = JSON.parse(sent);
  assert.match(request.state.message, /完整正文末尾/);
  assert.equal(entry.typeId, 2);
  assert.deepEqual(entry.metrics, {
    judgeModel: 'jev-latest', optionCount: 2, subjectLength: request.state.message.length,
  });
  assert.doesNotMatch(JSON.stringify(entry), /正文开头|完整正文末尾|只读地盯着这个活|评审代码/);
  for (const field of ['requestSummary', 'parentTitle', 'childLabel']) assert.equal(Object.hasOwn(entry, field), false);
});

await test('请求失败时仍保留判断模型和选项数量', async () => {
  const mounted = mount();
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  const logRoute = mounted.routes.find((route) => route.path === '/api/dsh-subagent-judge-dispatch/log');
  await judgeOnce(mounted.handlers, childAgent('child-fallback-prompt'), async () => {
    throw new Error('connection refused');
  });
  const body = await (await logRoute.fetch(new Request('http://host/api/log'), {})).json();
  assert.equal(body.entries.length, 1);
  assert.equal(body.entries[0].typeId, null, '没判成就是 null，页面据此写「未判成」');
  assert.equal(body.entries[0].reason, 'unreachable');
  assert.equal(body.entries[0].metrics.judgeModel, 'jev-latest');
  assert.equal(body.entries[0].metrics.optionCount, 2);
});

await test('主代理自己不被判断', async () => {
  let called = false;
  const result = await judgeOnce(handlers, mainAgent(), async () => {
    called = true;
    return new Response('{}', { status: 200 });
  });
  assert.equal(result, undefined);
  assert.equal(called, false, '主代理不该触发判断调用');
});

await test('同一个子代理只判一次，再次创建时不再问', async () => {
  let calls = 0;
  const stub = async () => {
    calls += 1;
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  };
  const first = await judgeOnce(handlers, childAgent('child-once'), stub);
  // 同一个 id 再创建一次（恢复或重复宣告）：这次不该再问，也不该再写。
  const second = await judgeOnce(handlers, childAgent('child-once'), stub);
  assert.equal(calls, 1, '同一子代理只该问一次');
  assert.equal(first.model, 'kimi-k3');
  assert.equal(second, undefined, '第二次不该再写');
});

await test('改写开关关着时不判断也不改写', async () => {
  const off = mount({ enabled: false });
  let called = false;
  const result = await judgeOnce(off.handlers, childAgent('child-off'), async () => {
    called = true;
    return new Response('{}', { status: 200 });
  });
  assert.equal(result, undefined);
  assert.equal(called, false);
});

await test('新安装默认开启，旧配置保留关闭状态且允许单个会话打开', async () => {
  const defaults = plugin.Config({});
  const existing = plugin.Config({ enabled: false });
  assert.equal(defaults.enabled.get(), true);
  assert.deepEqual(defaults.sessionOverrides.get(), {});
  assert.equal(existing.enabled.get(), false);

  const { handlers: configured } = mount({ enabled: false, sessionOverrides: { 'session-main': true } });
  const result = await judgeOnce(configured, childAgent('child-enabled'), answer('2'));
  assert.equal(result?.model, 'kimi-k3');
});

await test('根会话的选择作用于直接和嵌套派工，切回默认值后立即生效', async () => {
  const { session: parent } = childAgent('child-parent');
  const sessionOverrides = { 'session-main': false, 'child-parent': true };
  const mounted = mount({ sessionOverrides }, {
    otherSessions: { 'child-parent': parent },
    storedHeaders: { 'child-dormant': { parentSession: 'session-main', origin: 'subagent' } },
  });
  const nested = childAgent('child-nested');
  nested.session.header = { id: nested.id, parentSession: 'child-parent', delegationDepth: 2 };
  const nestedEvents = nested.session.snapshotEvents();
  nestedEvents[2].data.inserted[0].source.senderSessionId = 'child-parent';
  nested.session.snapshotEvents = () => nestedEvents;
  let calls = 0;
  const stub = async () => { calls += 1; return answer('2')(); };
  assert.equal(await judgeOnce(mounted.handlers, childAgent('child-direct'), stub), undefined);
  assert.equal(await judgeOnce(mounted.handlers, nested, stub), undefined);
  const reloaded = childAgent('child-reloaded');
  reloaded.session.header = { parentSession: 'child-dormant', delegationDepth: 2 };
  assert.equal(await judgeOnce(mounted.handlers, reloaded, stub), undefined);
  assert.equal(calls, 0);
  const logRoute = mounted.routes.find(route => route.path.endsWith('/log'));
  const body = await (await logRoute.fetch(new Request('http://host/api/log'), {})).json();
  assert.deepEqual(body.entries, []);

  delete sessionOverrides['session-main'];
  assert.equal((await judgeOnce(mounted.handlers, nested, stub))?.model, 'kimi-k3');
  assert.equal(calls, 1);
});

await test('普通分叉会话的派工使用它自己的开关', async () => {
  const fork = { header: { parentSession: 'session-main' }, snapshotEvents: () => [] };
  const { handlers: configured } = mount(
    { sessionOverrides: { 'session-main': false } },
    { otherSessions: { 'session-fork': fork } },
  );
  const child = childAgent('child-forked-root');
  const childEvents = child.session.snapshotEvents();
  childEvents[2].data.inserted[0].source.senderSessionId = 'session-fork';
  child.session.snapshotEvents = () => childEvents;
  child.session.header.parentSession = 'session-fork';
  assert.equal((await judgeOnce(configured, child, answer('2')))?.model, 'kimi-k3');
});

await test('清单里没有填全的行时不判断', async () => {
  const empty = mount({ rows: [{ description: '缺模型', provider: '', model: '', effort: '' }] });
  let called = false;
  const result = await judgeOnce(empty.handlers, childAgent('child-norows'), async () => {
    called = true;
    return new Response('{}', { status: 200 });
  });
  assert.equal(result, undefined);
  assert.equal(called, false);
});

await test('关掉的任务类型不发给判断模型，编号由后面的行接上', async () => {
  const mounted = mount({
    rows: [
      { description: '机械修改', provider: 'd1api', model: 'deepseek-v4.1-flash', effort: 'low' },
      { enabled: false, description: '暂时关掉的', provider: 'g1api', model: 'gpt-x', effort: 'high' },
      { description: '评审代码', provider: 'a6api', model: 'kimi-k3', effort: 'high' },
    ],
  });
  let body;
  const result = await judgeOnce(mounted.handlers, childAgent('child-disabled'), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.deepEqual(Object.keys(body.questions.task_type.criteria), ['1', '2'], '编号连续，关掉的行不占号');
  assert.equal(body.questions.task_type.criteria['2'], '评审代码');
  assert.equal(result.model, 'kimi-k3', '答复的 2 是清单里第三条那行');
});

await test('没填全的行不占编号，判断模型收到的编号连续', async () => {
  const mounted = mount({
    rows: [
      { description: '机械修改', provider: 'd1api', model: 'deepseek-v4.1-flash', effort: 'low' },
      { description: '还没填完的', provider: 'g1api', model: '', effort: 'high' },
      { description: '评审代码', provider: 'a6api', model: 'kimi-k3', effort: 'high' },
    ],
  });
  let body;
  const result = await judgeOnce(mounted.handlers, childAgent('child-incomplete'), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.deepEqual(Object.keys(body.questions.task_type.criteria), ['1', '2']);
  assert.equal(body.questions.task_type.criteria['2'], '评审代码');
  assert.equal(result.model, 'kimi-k3', '答复的 2 是第三条那行，不是第二条');
});

await test('预览路由与判断请求读同一份编号', async () => {
  const mounted = mount({
    rows: [
      { description: '机械修改', provider: 'd1api', model: 'deepseek-v4.1-flash', effort: 'low' },
      { enabled: false, description: '关掉的', provider: 'g1api', model: 'gpt-x', effort: 'high' },
      { description: '还没填完的', provider: 'g1api', model: '', effort: 'high' },
      { description: '评审代码', provider: 'a6api', model: 'kimi-k3', effort: 'high' },
    ],
  });
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  const previewRoute = mounted.routes.find((route) => route.path === '/api/dsh-subagent-judge-dispatch/preview');
  const previewBody = await (await previewRoute.fetch(new Request('http://host/api/preview'), {})).json();
  const criteria = JSON.parse(previewBody.preview).questions.task_type.criteria;
  assert.deepEqual(criteria, { '1': '机械修改', '2': '评审代码' });

  let sent;
  const result = await judgeOnce(mounted.handlers, childAgent('child-preview-match'), async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.deepEqual(sent.questions.task_type.criteria, criteria, '预览的就是真正发出去的那份');
  assert.equal(result.model, 'kimi-k3');
});

await test('答复指向关掉那行原来的位置时一个字段都不写', async () => {
  const mounted = mount({
    rows: [
      { description: '机械修改', provider: 'd1api', model: 'deepseek-v4.1-flash', effort: 'low' },
      { enabled: false, description: '暂时关掉的', provider: 'g1api', model: 'gpt-x', effort: 'high' },
    ],
  });
  const result = await judgeOnce(mounted.handlers, childAgent('child-disabled-gap'), answer('2'));
  assert.equal(result, undefined, '只开了一行，答复 2 对不上清单');
});

await test('所有任务类型都关掉时不判断', async () => {
  const mounted = mount({
    rows: [{ enabled: false, description: '关掉的', provider: 'd1api', model: 'deepseek-v4.1-flash', effort: 'low' }],
  });
  let called = false;
  const result = await judgeOnce(mounted.handlers, childAgent('child-all-off'), async () => {
    called = true;
    return new Response('{}', { status: 200 });
  });
  assert.equal(result, undefined);
  assert.equal(called, false, '没有可选项就不该发请求');
});

await test('日志记的是打开行的编号', async () => {
  const mounted = mount({
    rows: [
      { enabled: false, description: '暂时关掉的', provider: 'g1api', model: 'gpt-x', effort: 'high' },
      { description: '评审代码', provider: 'a6api', model: 'kimi-k3', effort: 'high' },
    ],
  });
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  const logRoute = mounted.routes.find((route) => route.path === '/api/dsh-subagent-judge-dispatch/log');
  await judgeOnce(mounted.handlers, childAgent('child-log-number'), answer('1'));
  const body = await (await logRoute.fetch(new Request('http://host/api/log'), {})).json();
  assert.equal(body.entries[0].typeId, 1, '关掉的行不占编号，第二条那行是 1');
  assert.equal(body.entries[0].model, 'kimi-k3');
});

await test('发送的请求体形状：一个问题、编号为键、描述为值', async () => {
  let body;
  await judgeOnce(handlers, childAgent('child-body', '评审一处改动', '评审 src 下这一组改动'), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.equal(body.model, 'jev-latest');
  assert.deepEqual(Object.keys(body.questions.task_type.criteria), ['1', '2']);
  assert.equal(body.questions.task_type.criteria['2'], '评审代码');
});

await test('判断模型读到的是派工标签加任务正文，不只是那句显示用的短标签', async () => {
  let body;
  await judgeOnce(handlers, childAgent('child-subject', '评审一处改动', '评审 src 下这一组改动'), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.equal(
    body.state.message,
    'Delegation label: 评审一处改动\n\n评审 src 下这一组改动',
    '标签在前、任务正文在后，两段都在',
  );
});

await test('任务正文按来源取，不把工作目录提示当成任务', async () => {
  let body;
  await judgeOnce(handlers, childAgent('child-cwd'), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.match(body.state.message, /把测试跑一遍/);
  assert.doesNotMatch(body.state.message, /working directory changed/,
    '工作目录提示是 user 角色的消息，但不是这次派的活');
});

await test('宿主追加的返回指引不送给判断模型', async () => {
  let body;
  await judgeOnce(handlers, childAgent('child-guidance'), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.doesNotMatch(body.state.message, /Your final answer is delivered automatically/,
    '怎么回报讲的是交作业，不是这次干什么');
});

await test('任务正文很长时只取开头与结尾，中间被省掉的字数写明白', async () => {
  const long = `开头的要求。${'中间细节。'.repeat(400)}结尾的要求。`;
  let body;
  await judgeOnce(handlers, childAgent('child-long', '长活', long), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
  });
  const message = body.state.message;
  assert.ok(message.length < long.length, '整段原样发出去就没有截断');
  assert.match(message, /^Delegation label: 长活/);
  assert.match(message, /开头的要求。/);
  assert.match(message, /结尾的要求。/);
  assert.match(message, /characters omitted/, '省掉了多少要写出来，读者才分得清截断与短任务');
});

await test('第一次请求时派工消息还挂在收件箱里，也要读到正文', async () => {
  // 判断就发生在这一步：派工消息是收件箱里的待办，宿主还没把它写成 user/message。
  let body;
  await judgeOnce(handlers, childAgent('child-pending'), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.match(body.state.message, /把测试跑一遍/, '收件箱事件里那段正文就是这次的活');
});

await test('新建子代理时任务还没入队，从父会话刚记录的派工调用里读正文', async () => {
  // 宿主在 agent/created 之后才把 prompt 投进子代理收件箱，所以这一刻只能从
  // 父会话那条正在执行的 tool/call 里读。
  const mounted = mount({}, {
    parentSession: parentWithCalls([{ description: '跑一下测试', prompt: '把测试跑一遍' }]),
  });
  let body;
  await judgeOnce(mounted.handlers, freshChildAgent(), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.equal(body.state.message, 'Delegation label: 跑一下测试\n\n把测试跑一遍');
});

await test('同一批里派了多个子代理时按标签对上自己那次调用', async () => {
  const mounted = mount({}, {
    parentSession: parentWithCalls([
      { description: '别的活', prompt: '别的任务正文' },
      { description: '跑一下测试', prompt: '把测试跑一遍' },
      { description: '再别的活', prompt: '再别的任务正文' },
    ]),
  });
  let body;
  await judgeOnce(mounted.handlers, freshChildAgent(), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.equal(body.state.message, 'Delegation label: 跑一下测试\n\n把测试跑一遍',
    '必须按子代理自己的标签取那一条，不能取最后一条');
});

await test('经 run_code 派工时父会话记的是 ptc 事件，正文照样读得到', async () => {
  // 程序化调用（run_code 里的 tools.subagent）不会留下 tool/call：外层那条是
  // run_code，嵌套调用记成 tool/ptc-dispatch-start，arguments 已经是对象。
  const mounted = mount({}, {
    parentSession: parentWithPtcCalls([{ description: '跑一下测试', prompt: '把测试跑一遍' }]),
  });
  let body;
  await judgeOnce(mounted.handlers, freshChildAgent(), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.equal(body.state.message, 'Delegation label: 跑一下测试\n\n把测试跑一遍');
});

await test('同一批 ptc 派工里按标签对上自己那次，别的工具的嵌套调用不算派工', async () => {
  const mounted = mount({}, {
    parentSession: parentWithPtcCalls([
      { description: '别的活', prompt: '别的任务正文' },
      { description: '跑一下测试', prompt: '把测试跑一遍' },
    ]),
  });
  let body;
  await judgeOnce(mounted.handlers, freshChildAgent(), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.equal(body.state.message, 'Delegation label: 跑一下测试\n\n把测试跑一遍',
    '必须按子代理自己的标签取那一条，不能取最后一条，也不能取 bash 那条');
});

await test('父会话没有可关联的派工调用时保留原路线', async () => {
  const mounted = mount({}, { parentSession: { header: { id: 'session-main' }, snapshotEvents: () => [] } });
  await assertNotJudged(mounted.handlers, freshChildAgent('child-fresh-nocall'));
});

await test('无关工具、已完成或标签重复的派工调用都不能提供任务正文', async () => {
  const args = { description: '跑一下测试', prompt: '同一标签的无关正文' };
  const wrongTool = nativeCall(args, { name: 'generate_image' });
  const completed = [nativeCall(args), { type: 'tool/result', data: { message: { toolCallId: 'native-1' } } }];
  const settledPtc = [ptcCall('subagent', args), { type: 'tool/ptc-dispatch', data: { subCallId: 'ptc-1' } }];
  const ambiguous = [nativeCall(args), ptcCall('subagent_fork', args)];
  for (const events of [[wrongTool], completed, settledPtc, ambiguous]) {
    const mounted = mount({}, { parentSession: { header: { id: 'session-main' }, snapshotEvents: () => events } });
    await assertNotJudged(mounted.handlers, freshChildAgent());
  }
});

await test('已恢复的初始任务必须来自直接父会话，且父日志必须关联到本子代理', async () => {
  const agent = childAgent('child-resumed', '跑一下测试', '做这次派工', { committed: true });
  const [descriptor] = agent.session.snapshotEvents();
  const pending = (sender) => ({
    type: 'agent/inbox/spliced',
    data: { inserted: [delegationMessage('做这次派工', RETURN_GUIDANCE, sender)] },
  });
  const own = [descriptor, pending('sibling'), { type: 'user/message', data: {
    source: { kind: 'user' }, content: [{ type: 'text', text: '做这次派工' }],
  } }];
  agent.session.snapshotEvents = () => own;
  await assertNotJudged(mount().handlers, agent);
  own.push(pending('session-main'));
  const wrongCatalog = mount({}, { parentSession: { header: { id: 'session-main' }, snapshotEvents: () => [
    nativeCall(agent.testDelegation), { type: 'subagent/catalog', data: { childId: 'different-child' } },
  ] } });
  await assertNotJudged(wrongCatalog.handlers, agent);
  assert.equal((await judgeOnce(mount().handlers, agent, answer('2')))?.model, 'kimi-k3');
});

await test('直调与程序化派工中的明确路线优先，包括只明确选择模型的情况', async () => {
  const args = { description: '跑一下测试', prompt: '把测试跑一遍', provider: INHERITED.provider, model: INHERITED.model };
  const callers = [parentWithCalls([args]), parentWithPtcCalls([args])];
  for (const parentSession of callers) {
    const { handlers } = mount({}, { parentSession });
    await assertNotJudged(handlers, freshChildAgent());
  }
  const resumed = childAgent('child-explicit-resume');
  resumed.testDelegation = args;
  await assertNotJudged(mount().handlers, resumed);
});

await test('改写前核对实时允许名单、供应商和模型支持的推理等级', async () => {
  const selected = { provider: 'a6api', model: 'kimi-k3', reasoningEffort: 'high' };
  const candidates = [
    { allowedRoutes: () => undefined },
    { allowedRoutes: () => [{ provider: 'other', model: selected.model }] },
    { preflight: async (route) => {
      assert.deepEqual(route, selected);
      throw new Error('unsupported reasoning effort');
    } },
  ];
  for (const [index, options] of candidates.entries()) {
    const mounted = mount({}, options);
    const result = await judgeOnce(mounted.handlers, childAgent(`child-blocked-${index}`), answer('2'));
    assert.equal(result, undefined);
    const route = mounted.routes.find((item) => item.path.endsWith('/log'));
    const body = await (await route.fetch(new Request('http://host/api/log'), {})).json();
    assert.equal(body.entries[0]?.reason, 'unavailable-route');
    assert.equal(body.entries[0]?.model, INHERITED.model);
  }

  let routes = [selected];
  const mounted = mount({}, {
    allowedRoutes: () => routes,
    preflight: async (route) => { assert.deepEqual(route, selected); routes = []; },
  });
  assert.equal(await judgeOnce(mounted.handlers, childAgent('child-revoked'), answer('2')), undefined);
});

await test('判断和预检共用 5 秒，忽略中止的预检迟到后不改写也不追加日志', async () => {
  let finishJudge;
  let finishPreflight;
  let judgeSignal;
  let preflightSignal;
  const judgeStarted = Promise.withResolvers();
  const preflightStarted = Promise.withResolvers();
  const mounted = mount({}, { preflight: (_route, signal) => {
    preflightSignal = signal;
    preflightStarted.resolve();
    return new Promise((resolve) => { finishPreflight = resolve; });
  } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const agent = childAgent('child-slow-preflight');
  const saved = globalThis.fetch;
  globalThis.fetch = (_url, init) => {
    judgeSignal = init.signal;
    judgeStarted.resolve();
    return new Promise((resolve) => { finishJudge = resolve; });
  };
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const dispatch = mounted.handlers[0]({ agent, source: 'resume' });
    await judgeStarted.promise;
    mock.timers.tick(4000);
    finishJudge(await answer('2')());
    await preflightStarted.promise;
    assert.equal(preflightSignal, judgeSignal);
    mock.timers.tick(999);
    assert.equal(preflightSignal.aborted, false);
    mock.timers.tick(1);
    assert.equal(preflightSignal.aborted, true);
    const completed = await Promise.race([
      dispatch.then(() => true),
      new Promise((resolve) => setImmediate(() => resolve(false))),
    ]);
    assert.equal(completed, true, '预检仍挂起时派工钩子就应该结束');
    assert.equal(agent.model.selected, undefined);
    const route = mounted.routes.find((item) => item.path.endsWith('/log'));
    const entries = async () => (await (await route.fetch(new Request('http://host/api/log'), {})).json()).entries;
    const before = await entries();
    assert.equal(before.length, 1);
    assert.equal(before[0].reason, 'timeout');
    finishPreflight({});
    await new Promise(setImmediate);
    assert.equal(agent.model.selected, undefined);
    assert.deepEqual(await entries(), before);
  } finally {
    mock.timers.reset();
    globalThis.fetch = saved;
  }
});

await test('真实 Cordis 插件作用域能读取宿主的可选模型服务', async () => {
  freshHome();
  const ctx = new Context();
  const agent = freshChildAgent('child-real-scope');
  const parent = parentWithCalls([{ description: '跑一下测试', prompt: '把测试跑一遍' }]);
  ctx.provide('credentials', { resolve: async () => ({ value: 'test-key' }) });
  ctx.provide('sessions', { get: () => parent });
  const modelRoute = { provider: 'a6api', model: 'kimi-k3' };
  ctx.provide('subagentModelSelection', { allowedRoutes: () => [modelRoute] });
  let resolved;
  ctx.provide('llm', { resolveCallConfig: async (route) => { resolved = route; } });
  await ctx.plugin({
    name: plugin.name,
    inject: plugin.inject,
    apply(scope) { plugin.apply(scope, makeConfig({ logEnabled: false })); },
  });
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  const saved = globalThis.fetch;
  globalThis.fetch = answer('2');
  try {
    await ctx.serial('agent/created', { agent, source: 'startup' });
    assert.deepEqual(resolved, { ...modelRoute, reasoningEffort: 'high' });
    assert.deepEqual(agent.model.selected, resolved);
  } finally {
    globalThis.fetch = saved;
  }
});

await test('判断期间记录的模型选择优先于自动改写', async () => {
  const agent = childAgent('child-manual-selection');
  const own = agent.session.snapshotEvents();
  agent.session.snapshotEvents = () => own;
  const { handlers } = mount({}, {
    preflight: async () => { own.push({ type: 'model/selection', data: INHERITED }); },
  });
  assert.equal(await judgeOnce(handlers, agent, answer('2')), undefined);
});

await test('已经落盘成 user/message 的那份也认，两次读到同一段正文', async () => {
  // 第二步以后收件箱已清空，派工消息以 user/message 留在日志里。
  let body;
  await judgeOnce(handlers, childAgent('child-committed', '跑一下测试', '把测试跑一遍', { committed: true }), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.equal(body.state.message, 'Delegation label: 跑一下测试\n\n把测试跑一遍');
});

await test('叉出来的子代理只读自己的事件，不把祖先的文字送给判断模型', async () => {
  let body;
  await judgeOnce(handlers, forkedChildAgent(), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
  });
  assert.match(body.state.message, /^Delegation label: 真正这次派的活/,
    '必须取子代理自己的最后一条 descriptor');
  assert.doesNotMatch(body.state.message, /祖先的活/, '不能读到被浇灌进来的祖先标签');
  assert.doesNotMatch(body.state.message, /父代理对话的第一条消息/);
});

await test('判断过的子代理记忆有上限，不会随运行时间无限长大', async () => {
  // 500 个孩子逐个判过之后，最早那个应当已被忘记（否则这份记忆会一直长）。
  // 忘记的代价只是极老的孩子万一再发请求时会多判一次。
  const first = childAgent('child-many-0');
  await judgeOnce(handlers, first, answer('1'));
  for (let i = 1; i < 501; i += 1) {
    await judgeOnce(handlers, childAgent(`child-many-${i}`), answer('1'));
  }

  let recent = false;
  await judgeOnce(handlers, childAgent('child-many-499'), async () => {
    recent = true;
    return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
  });
  assert.equal(recent, false, '最近判过的孩子仍该被记住，不再重复问');

  let oldest = false;
  await judgeOnce(handlers, first, async () => {
    oldest = true;
    return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
  });
  assert.equal(oldest, true, '最早那个已被挤出记忆，所以会重新问一次');
});

await test('包内 cordis.patch.yml 只有一条装配行，id 与包名各自独立地对上', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, ''))
    .filter((line) => line.trim() !== '')
    .join('\n');
  const rows = [...patch.matchAll(/-\s*id:\s*(\S+)\s*\n\s*name:\s*'([^']+)'/g)];
  assert.equal(rows.length, 1, '包内 cordis.patch.yml 应当只有一条装配行');
  assert.equal(rows[0][1], plugin.name);
  assert.equal(rows[0][2], pkgName);
});

console.log(`${passed}/${total} passed`);