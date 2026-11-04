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
    logEnabled: true,
    endpointUrl: 'http://judge.invalid/v1/systemone',
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
    logEnabled: ref('logEnabled'),
    endpointUrl: ref('endpointUrl'),
    judgeModel: ref('judgeModel'),
    rows: ref('rows'),
  };
}

/** The return guidance the Host appends to a continuable delegation's task. */
const RETURN_GUIDANCE =
  'Your parent agent id is "session-main". Before you finish, send your result to that agent with '
  + 'send_message({ agent_id: "session-main", message: "<self-contained result>" }).';

/** The delegation message itself, in the shape the Host builds it. */
function delegationMessage(taskText) {
  return {
    source: { kind: 'user' },
    content: [
      { type: 'text', text: taskText },
      { type: 'text', text: RETURN_GUIDANCE },
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
 * @param options - `committed` selects the committed shape.
 * @returns the child-owned events, in log order.
 */
function delegatedMessages(taskText, { committed = false } = {}) {
  const message = delegationMessage(taskText);
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
    options: { subagentDepth: 1 },
    model: modelFace(),
    session: {
      header: { parentSession: 'session-main', delegationDepth: 1 },
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
    options: { subagentDepth: 1 },
    model: modelFace(),
    session: {
      header: { parentSession: 'session-main', delegationDepth: 1 },
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
      header: { parentSession: 'session-main', delegationDepth: 1 },
      snapshotEvents: () => [
        { type: 'subagent/descriptor', data: { version: 3, mode: 'one-shot', provider: 'in-process', label } },
      ],
    },
  };
}

/** The parent session as it looks while the delegating tool call is executing. */
function parentWithCalls(calls) {
  return {
    header: {},
    snapshotEvents: () => calls.map(({ description, prompt }) => ({
      type: 'tool/call',
      data: { name: 'subagent', arguments: JSON.stringify({ description, prompt }) },
    })),
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
  const original = ctx.on.bind(ctx);
  ctx.on = (name, listener) => {
    if (name === 'agent/created') handlers.push(listener);
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
    get: (id) => (id === 'session-main' ? (options.parentSession ?? { header: {}, snapshotEvents: () => [] }) : undefined),
  };
  ctx.sessionTitle = { get: () => ({ title: options.parentTitle ?? '主对话标题' }) };
  // 插件的三条读取挂在 connection 的 /api 通道上：给了这个服务，页面读日志那条路
  // 才会被注册，下面「日志里存的就是发出去的请求」才有地方读。
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
async function judgeOnce(handlers, agent, fetchStub) {
  const saved = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    assert.equal(handlers.length, 1, 'agent/created 应当只挂一个监听器');
    // 让 apply() 里那次凭据读取落地
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));
    await handlers[0]({ agent, source: 'fresh' });
    return agent.model.selected;
  } finally {
    globalThis.fetch = saved;
  }
}

const answer = (choice) =>
  async () => new Response(JSON.stringify({ answers: { task_type: { choice } } }), { status: 200 });

const { handlers } = mount();

await test('导出的行身份与包内 cordis.patch.yml 那条装配行同名', () => {
  assert.equal(plugin.name, 'dsh-subagent-judge-dispatch');
  assert.deepEqual(plugin.inject, ['credentials', 'sessions', 'sessionTitle']);
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

await test('日志里存的就是那一次发出去的请求，一字不差', async () => {
  const mounted = mount();
  // connection 是通过 ctx.inject 取的可选服务：那条 fiber 在自己的回合里才装载。
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  const logRoute = mounted.routes.find((route) => route.path === '/api/dsh-subagent-judge-dispatch/log');
  assert.ok(logRoute, '日志路由注册上了');

  let sent;
  await judgeOnce(mounted.handlers, childAgent('child-prompt', '只读地盯着这个活'), async (_url, init) => {
    sent = init.body;
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });

  const body = await (await logRoute.fetch(new Request('http://host/api/log'), {})).json();
  assert.equal(body.entries.length, 1);
  const entry = body.entries[0];
  assert.equal(entry.prompt, JSON.stringify(sent === undefined ? '' : JSON.parse(sent), null, 2),
    '日志里那段提示词必须与真正发出去的请求体同值');
  assert.equal(JSON.parse(entry.prompt).state.message, 'Delegation label: 只读地盯着这个活\n\n把测试跑一遍',
    '任务文字也在提示词里');
  assert.equal(entry.typeId, 2);
  assert.equal(entry.childLabel, '只读地盯着这个活');
  assert.equal(entry.parentTitle, '主对话标题');
});

await test('没判成的那一行也带着发出去的提示词', async () => {
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
  assert.match(body.entries[0].prompt, /"model": "jev-latest"/, '连不上也有请求体可看');
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
  assert.doesNotMatch(body.state.message, /Your parent agent id is/,
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

await test('父会话里读不到派工调用时只拿标签去判，不编造正文', async () => {
  const mounted = mount({}, { parentSession: { header: {}, snapshotEvents: () => [] } });
  let body;
  await judgeOnce(mounted.handlers, freshChildAgent('child-fresh-nocall', '只有标签'), async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.equal(body.state.message, 'Delegation label: 只有标签');
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

await test('叉出来的子代理没有自己的描述时，任务正文也取自己那段', async () => {
  const agent = forkedChildAgent('child-fork-nodesc');
  agent.session.ownEvents = () => delegatedMessages('这次的任务正文');
  let body;
  await judgeOnce(handlers, agent, async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
  });
  assert.equal(body.state.message, '这次的任务正文', '没有标签就只发任务正文');
  assert.notEqual(body.state.message, '父代理对话的第一条消息');
});

await test('没有描述时拿任务正文来判', async () => {
  const agent = childAgent('child-nodesc', '', '把这条正文当任务');
  let body;
  await judgeOnce(handlers, agent, async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
  });
  assert.equal(body.state.message, '把这条正文当任务');
});

await test('日志的子代理一栏只写派工标签，不把整段任务正文塞进去', async () => {
  const mounted = mount();
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  const logRoute = mounted.routes.find((route) => route.path === '/api/dsh-subagent-judge-dispatch/log');
  const task = `这是一个很长的活。${'细节。'.repeat(30)}`;
  await judgeOnce(mounted.handlers, childAgent('child-label', '跑一下测试', task), answer('2'));
  const body = await (await logRoute.fetch(new Request('http://host/api/log'), {})).json();
  assert.equal(body.entries[0].childLabel, '跑一下测试');
  assert.equal(body.entries[0].typeId, 2);
});

await test('没有标签时日志的子代理一栏退回任务正文的开头', async () => {
  const mounted = mount();
  await new Promise((resolveTick) => setTimeout(resolveTick, 0));
  const logRoute = mounted.routes.find((route) => route.path === '/api/dsh-subagent-judge-dispatch/log');
  const task = '把这条正文当任务'.repeat(20);
  await judgeOnce(mounted.handlers, childAgent('child-label-fallback', '', task), answer('2'));
  const body = await (await logRoute.fetch(new Request('http://host/api/log'), {})).json();
  assert.ok(body.entries[0].childLabel.startsWith('把这条正文当任务'));
  assert.ok(body.entries[0].childLabel.length <= 60, '一栏放不下整段正文，截到 60 字');
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
