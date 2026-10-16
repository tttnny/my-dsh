/**
 * 宿主半边自检：真 cordis `Context`，把「判断 → 改写」这条链按宿主真实的
 * `agent/request` 瀑布跑一遍。
 *
 * 这里守的是三件自检以外看不见的事：
 *   1. 判断失败（连不上、答复对不上清单）时**一个字段都不写**——不是「写回原值」，
 *      而是把宿主解析好的那个对象按身份原样退回；
 *   2. 改写时模型、强度、提供方三项一起写；
 *   3. 同一个子代理只判一次，主代理与嵌套之外的东西一概不碰。
 *
 * 跑法：pnpm test / node scripts/smoke-host.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';

import * as plugin from '../lib/index.js';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const pkgName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;

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
    apiKeyRef: 'JEV_API_KEY',
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
    apiKeyRef: ref('apiKeyRef'),
    rows: ref('rows'),
  };
}

/** A child agent whose durable facts say "subagent, delegated by the main one". */
function childAgent(id = 'child-1', label = '跑一下测试') {
  return {
    id,
    options: { subagentDepth: 1 },
    session: {
      header: { parentSession: 'session-main', delegationDepth: 1 },
      snapshotEvents: () => [
        { type: 'subagent/descriptor', data: { version: 3, mode: 'one-shot', provider: 'in-process', label } },
        { type: 'user/message', data: { content: [{ type: 'text', text: '把测试跑一遍' }] } },
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
    { type: 'user/message', data: { content: [{ type: 'text', text: '父代理对话的第一条消息' }] } },
  ];
  const own = [
    { type: 'subagent/descriptor', data: { version: 3, mode: 'one-shot', provider: 'in-process', label: '真正这次派的活' } },
    { type: 'user/message', data: { content: [{ type: 'text', text: '这次的任务正文' }] } },
  ];
  return {
    id,
    options: { subagentDepth: 1 },
    session: {
      header: { parentSession: 'session-main', delegationDepth: 1 },
      inheritedEventCount: inherited.length,
      ownEvents: () => own,
      snapshotEvents: (from = 0) => [...inherited, ...own].slice(from),
    },
  };
}

/** A top-level agent: no delegation depth at all. */
function mainAgent() {
  return {
    id: 'session-main',
    options: {},
    session: { header: {}, snapshotEvents: () => [] },
  };
}

/**
 * Mount the plugin on a real cordis Context and capture the `agent/request`
 * waterfall listener it registers.
 */
function mount(configOverrides = {}, options = {}) {
  const ctx = new Context();
  const handlers = [];
  const original = ctx.on.bind(ctx);
  ctx.on = (name, listener) => {
    if (name === 'agent/request') handlers.push(listener);
    return original(name, listener);
  };
  ctx.credentials = {
    resolve: async () => ({ value: 'test-key' }),
    describe: async () => ({ configured: true, writable: true }),
  };
  ctx.sessions = { get: (id) => (id === 'session-main' ? { header: {} } : undefined) };
  ctx.sessionTitle = { get: () => ({ title: options.parentTitle ?? '主对话标题' }) };
  plugin.apply(ctx, makeConfig(configOverrides));
  return { ctx, handlers };
}

/** Run one request through the captured waterfall with a stubbed judge endpoint. */
async function judgeOnce(handlers, agent, resolved, fetchStub) {
  const saved = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    assert.equal(handlers.length, 1, 'agent/request 应当只挂一个监听器');
    // 让 apply() 里那次凭据读取落地
    await new Promise((resolveTick) => setTimeout(resolveTick, 0));
    return await handlers[0]({ agent, turn: 1, step: 1, signal: new AbortController().signal }, async () => resolved);
  } finally {
    globalThis.fetch = saved;
  }
}

const RESOLVED = { provider: 'magpie', model: 'future/deepseek-v4.1-flash', reasoningEffort: 'high' };
const answer = (choice) =>
  async () => new Response(JSON.stringify({ answers: { task_type: { choice } } }), { status: 200 });

const { handlers } = mount();

await test('导出的行身份与包内 cordis.patch.yml 那条装配行同名', () => {
  assert.equal(plugin.name, 'dsh-subagent-judge-dispatch');
  assert.deepEqual(plugin.inject, ['credentials', 'sessions', 'sessionTitle']);
});

await test('判断成功时三项一起写到这次调用上', async () => {
  const result = await judgeOnce(handlers, childAgent('child-ok'), RESOLVED, answer('1'));
  assert.equal(result.provider, 'd1api');
  assert.equal(result.model, 'deepseek-v4.1-flash');
  assert.equal(result.reasoningEffort, 'low');
});

await test('判断连不上时原对象按身份退回，一个字段都不写', async () => {
  const result = await judgeOnce(handlers, childAgent('child-down'), RESOLVED, async () => {
    throw new Error('connection refused');
  });
  assert.equal(result, RESOLVED, '失败必须退回宿主解析好的同一个对象');
});

await test('答复对不上清单时同样一个字都不写', async () => {
  const result = await judgeOnce(handlers, childAgent('child-bad'), RESOLVED, answer('99'));
  assert.equal(result, RESOLVED);
});

await test('主代理自己不被判断', async () => {
  let called = false;
  const result = await judgeOnce(handlers, mainAgent(), RESOLVED, async () => {
    called = true;
    return new Response('{}', { status: 200 });
  });
  assert.equal(result, RESOLVED);
  assert.equal(called, false, '主代理不该触发判断调用');
});

await test('同一个子代理只判一次，第二步不再问', async () => {
  let calls = 0;
  const agent = childAgent('child-once');
  const stub = async () => {
    calls += 1;
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  };
  const first = await judgeOnce(handlers, agent, RESOLVED, stub);
  const second = await judgeOnce(handlers, agent, RESOLVED, stub);
  assert.equal(calls, 1, '同一子代理只该问一次');
  assert.equal(first.model, 'kimi-k3');
  assert.equal(second, RESOLVED, '第二次应当原样退回，不再改写');
});

await test('改写开关关着时不判断也不改写', async () => {
  const off = mount({ enabled: false });
  let called = false;
  const result = await judgeOnce(off.handlers, childAgent('child-off'), RESOLVED, async () => {
    called = true;
    return new Response('{}', { status: 200 });
  });
  assert.equal(result, RESOLVED);
  assert.equal(called, false);
});

await test('清单里没有填全的行时不判断', async () => {
  const empty = mount({ rows: [{ description: '缺模型', provider: '', model: '', effort: '' }] });
  let called = false;
  const result = await judgeOnce(empty.handlers, childAgent('child-norows'), RESOLVED, async () => {
    called = true;
    return new Response('{}', { status: 200 });
  });
  assert.equal(result, RESOLVED);
  assert.equal(called, false);
});

await test('发送的请求体形状：一个问题、编号为键、描述为值', async () => {
  let body;
  await judgeOnce(handlers, childAgent('child-body', '评审一处改动'), RESOLVED, async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '2' } } }), { status: 200 });
  });
  assert.equal(body.model, 'jev-latest');
  assert.equal(body.state.message, '评审一处改动', '任务文字取自子代理的派工描述');
  assert.deepEqual(Object.keys(body.questions.task_type.criteria), ['1', '2']);
  assert.equal(body.questions.task_type.criteria['2'], '评审代码');
});

await test('fork 出来的子代理只读自己的事件，不把祖先的文字送给判断模型', async () => {
  let body;
  await judgeOnce(handlers, forkedChildAgent(), RESOLVED, async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
  });
  assert.equal(body.state.message, '真正这次派的活', '必须取子代理自己的最后一条 descriptor');
  assert.notEqual(body.state.message, '祖先的活', '不能读到被浇灌进来的祖先标签');
});

await test('fork 出来的子代理没有自己的描述时，任务正文也取自己那段', async () => {
  const agent = forkedChildAgent('child-fork-nodesc');
  agent.session.ownEvents = () => [
    { type: 'user/message', data: { content: [{ type: 'text', text: '这次的任务正文' }] } },
  ];
  let body;
  await judgeOnce(handlers, agent, RESOLVED, async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
  });
  assert.equal(body.state.message, '这次的任务正文');
  assert.notEqual(body.state.message, '父代理对话的第一条消息');
});

await test('没有描述时拿任务正文来判', async () => {
  const agent = childAgent('child-nodesc');
  agent.session.snapshotEvents = () => [
    { type: 'user/message', data: { content: [{ type: 'text', text: '把这条正文当任务' }] } },
  ];
  let body;
  await judgeOnce(handlers, agent, RESOLVED, async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
  });
  assert.equal(body.state.message, '把这条正文当任务');
});

await test('判断过的子代理记忆有上限，不会随运行时间无限长大', async () => {
  // 500 个孩子逐个判过之后，最早那个应当已被忘记（否则这份记忆会一直长）。
  // 忘记的代价只是极老的孩子万一再发请求时会多判一次。
  const first = childAgent('child-many-0');
  await judgeOnce(handlers, first, RESOLVED, answer('1'));
  for (let i = 1; i < 501; i += 1) {
    await judgeOnce(handlers, childAgent(`child-many-${i}`), RESOLVED, answer('1'));
  }

  let recent = false;
  await judgeOnce(handlers, childAgent('child-many-499'), RESOLVED, async () => {
    recent = true;
    return new Response(JSON.stringify({ answers: { task_type: { choice: '1' } } }), { status: 200 });
  });
  assert.equal(recent, false, '最近判过的孩子仍该被记住，不再重复问');

  let oldest = false;
  await judgeOnce(handlers, first, RESOLVED, async () => {
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
