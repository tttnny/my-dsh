/**
 * 宿主半边自检：真 cordis `Context` + 真 `ToolRuntime`（内核包来自本包 devDependencies），
 * 断言工具注册得上、配置形状对、催办接线在真事件派发下按预期注入。
 *
 * 跑法：pnpm test / node scripts/smoke-host.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';

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

/** 起一个真内核上下文：工具表 + 它写工具 schema 用的提示词服务。 */
function host() {
  const ctx = new Context();
  new SystemPrompt(ctx, {});
  new ToolRuntime(ctx);
  return ctx;
}

/**
 * 起一份装好本插件的宿主，并给出驱动两条事件的入口。
 * @param {number} threshold - 催办阈值。
 */
function harness(threshold) {
  const ctx = host();
  plugin.apply(ctx, new plugin.Config({ nudgeAfter: threshold }));
  const signal = new AbortController().signal;
  let calls = 0;
  return {
    ctx,
    tool: ctx.tools.get('notify_user'),
    /** 一次模型直接发起的工具调用（根调用）。 */
    rootCall(agent, name = 'read', result = { isError: false, content: [] }) {
      calls += 1;
      return ctx.emit('tools/result', {
        callId: `call-${calls}`, rootCallId: `call-${calls}`, name, arguments: {}, signal, agent,
      }, result);
    },
    /** 一次 PTC 程序内部的子调用（带 parent）。 */
    nestedCall(agent, name = 'read') {
      calls += 1;
      return ctx.emit('tools/result', {
        callId: `sub-${calls}`, rootCallId: 'call-parent', parent: Symbol('parent'), name, arguments: {}, signal, agent,
      }, { isError: false, content: [] });
    },
    /**
     * 一步开始前；返回这一步真正会进入的决策。
     * @param {object} agent - 这一步的 agent。
     * @param {object[]} messages - 这一步收件箱里的消息。
     * @param {number} stepNumber - 这一步在回合内的序号；1 表示新回合。
     */
    step(agent, messages = [], stepNumber = 2) {
      return ctx.waterfall('agent/pre-step', {
        agent, messages, turn: 1, step: stepNumber, signal,
      }, async () => ({ kind: 'enter', messages }));
    },
  };
}

/** 一个顶层会话的假 agent。 */
function mainAgent() {
  return { id: 'main', session: { header: {} } };
}

/** 一个子代理会话的假 agent。 */
function childAgent() {
  return { id: 'child', session: { header: { origin: 'subagent' } } };
}

/** 从一步的决策里取出催办消息。 */
function noticeOf(decision) {
  return decision.kind === 'enter' ? decision.messages.find(message => message.source.kind === 'notify-user-nudge') : undefined;
}

await test('导出的行身份与包内 cordis.patch.yml 那条装配行同名', () => {
  assert.equal(plugin.name, 'dsh-notify-user');
  assert.deepEqual(plugin.inject, ['tools']);
});

await test('配置形状：阈值默认 8 / 0 合法 / 越界抛错，折叠默认开，位置默认边界', () => {
  assert.equal(new plugin.Config({}).nudgeAfter.get(), 8);
  assert.equal(new plugin.Config({ nudgeAfter: 0 }).nudgeAfter.get(), 0);
  assert.equal(new plugin.Config({ nudgeAfter: 12 }).nudgeAfter.get(), 12);
  assert.throws(() => new plugin.Config({ nudgeAfter: -1 }), /nudgeAfter/);
  assert.throws(() => new plugin.Config({ nudgeAfter: 101 }), /nudgeAfter/);
  assert.equal(new plugin.Config({}).collapsible.get(), true);
  assert.equal(new plugin.Config({ collapsible: false }).collapsible.get(), false);
  assert.equal(new plugin.Config({}).cardPlacement.get(), 'boundary');
  assert.equal(new plugin.Config({ cardPlacement: 'inline' }).cardPlacement.get(), 'inline');
  assert.throws(() => new plugin.Config({ cardPlacement: 'nope' }), /cardPlacement/);
});

const first = harness(8);

await test('工具注册得上，名字与两个参数字段齐全', () => {
  assert.ok(first.tool !== undefined, '工具没注册上');
  assert.equal(first.tool.name, 'notify_user');
  assert.equal(first.tool.parameters.properties.title.type, 'string');
  assert.equal(first.tool.parameters.properties.message.type, 'string');
  assert.deepEqual(first.tool.parameters.required, ['message']);
  assert.equal(first.tool.isConcurrencySafe({ message: 'M' }), true);
});

await test('执行返回 ok，render 与 presentationMeta 对得上', async () => {
  const value = await first.tool.execute({ title: 'T', message: 'M' }, { signal: new AbortController().signal });
  assert.deepEqual(value, { ok: true });
  assert.deepEqual(first.tool.output.render({ title: 'T', message: 'M' }, value), [{ type: 'text', text: 'Update shown in the conversation.' }]);
  assert.deepEqual(first.tool.output.presentationMeta({ title: 'T', message: 'M' }, value), { title: 'T', message: 'M' });
  assert.deepEqual(first.tool.output.presentationMeta({ message: 'M' }, value), { message: 'M' });
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

await test('满 8 次根调用后，下一步注入一条 notice', async () => {
  const agent = mainAgent();
  const h = harness(8);
  for (let index = 0; index < 7; index += 1) {
    await h.rootCall(agent);
    assert.equal(noticeOf(await h.step(agent)), undefined, `第 ${index + 1} 次调用后不该催`);
  }
  await h.rootCall(agent);
  const notice = noticeOf(await h.step(agent));
  assert.ok(notice !== undefined, '第 8 次调用后应当催');
  assert.equal(notice.source.kind, 'notify-user-nudge');
  assert.equal(notice.source.form, 'notice');
  assert.match(notice.content[0].text, /8 tool calls without a notify_user update/);
  assert.match(notice.source.summary, /8 tool calls/);
});

await test('汇报过就重新计数', async () => {
  const agent = mainAgent();
  const h = harness(8);
  for (let index = 0; index < 8; index += 1) await h.rootCall(agent);
  await h.rootCall(agent, 'notify_user');
  assert.equal(noticeOf(await h.step(agent)), undefined, '汇报后不该立刻催');
  for (let index = 0; index < 7; index += 1) await h.rootCall(agent);
  assert.equal(noticeOf(await h.step(agent)), undefined, '7 次还不够');
  await h.rootCall(agent);
  assert.ok(noticeOf(await h.step(agent)) !== undefined, '再满 8 次应当催');
});

await test('PTC 子调用不计入阈值', async () => {
  const agent = mainAgent();
  const h = harness(8);
  for (let index = 0; index < 20; index += 1) await h.nestedCall(agent);
  assert.equal(noticeOf(await h.step(agent)), undefined, '子调用不该计数');
  for (let index = 0; index < 8; index += 1) await h.rootCall(agent);
  assert.ok(noticeOf(await h.step(agent)) !== undefined, '根调用满 8 次应当催');
});

await test('PTC 程序里的 notify_user 也能清零', async () => {
  const agent = mainAgent();
  const h = harness(8);
  for (let index = 0; index < 8; index += 1) await h.rootCall(agent);
  await h.nestedCall(agent, 'notify_user');
  assert.equal(noticeOf(await h.step(agent)), undefined, '嵌套汇报后不该催');
});

await test('阈值 0 关闭催办', async () => {
  const agent = mainAgent();
  const h = harness(0);
  for (let index = 0; index < 20; index += 1) await h.rootCall(agent);
  assert.equal(noticeOf(await h.step(agent)), undefined);
});

await test('用户插话清零', async () => {
  const agent = mainAgent();
  const h = harness(8);
  for (let index = 0; index < 8; index += 1) await h.rootCall(agent);
  const user = { role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } };
  assert.equal(noticeOf(await h.step(agent, [user])), undefined);
  for (let index = 0; index < 7; index += 1) await h.rootCall(agent);
  assert.equal(noticeOf(await h.step(agent)), undefined, '清零后 7 次还不够');
});

await test('新回合第一步清零：定时提醒触发的回合不催', async () => {
  const agent = mainAgent();
  const h = harness(8);
  for (let index = 0; index < 8; index += 1) await h.rootCall(agent);
  const reminder = { role: 'user', content: [{ type: 'text', text: 'reminder' }], source: { kind: 'schedule' } };
  assert.equal(noticeOf(await h.step(agent, [reminder], 1)), undefined, '新回合第一步不该催');
  for (let index = 0; index < 7; index += 1) await h.rootCall(agent);
  assert.equal(noticeOf(await h.step(agent)), undefined, '清零后 7 次还不够');
  await h.rootCall(agent);
  assert.ok(noticeOf(await h.step(agent)) !== undefined, '再满 8 次应当催');
});

await test('回合中途的上下文注入不清零', async () => {
  const agent = mainAgent();
  const h = harness(8);
  for (let index = 0; index < 8; index += 1) await h.rootCall(agent);
  const context = { role: 'user', content: [{ type: 'text', text: 'time' }], source: { kind: 'time-context', form: 'snapshot' } };
  assert.ok(noticeOf(await h.step(agent, [context])) !== undefined, '上下文注入不该清零');
});

await test('子代理不计数、不注入', async () => {
  const agent = childAgent();
  const h = harness(8);
  for (let index = 0; index < 20; index += 1) await h.rootCall(agent);
  assert.equal(noticeOf(await h.step(agent)), undefined);
});

await test('下游拒绝这一步时不追加消息，也不吞掉这次催办', async () => {
  const agent = mainAgent();
  const h = harness(8);
  for (let index = 0; index < 8; index += 1) await h.rootCall(agent);
  const decision = await h.ctx.waterfall('agent/pre-step', {
    agent, messages: [], turn: 1, step: 1, signal: new AbortController().signal,
  }, async () => ({ kind: 'reject' }));
  assert.equal(decision.kind, 'reject');
  assert.ok(noticeOf(await h.step(agent)) !== undefined, '拒绝后下一次进入应当仍能催');
});

await test('派发前被取消的调用不计数（tools/result 口径）', async () => {
  const agent = mainAgent();
  const h = harness(2);
  const aborted = {
    isError: true,
    error: { message: 'aborted before dispatch', info: { code: 'ABORTED_BEFORE_DISPATCH' } },
    content: [],
  };
  await h.rootCall(agent, 'read', aborted);
  await h.rootCall(agent, 'read', aborted);
  await h.rootCall(agent, 'read');
  assert.equal(noticeOf(await h.step(agent)), undefined, '两次取消 + 一次真实调用，还差一次才到阈值');
  await h.rootCall(agent, 'read');
  assert.ok(noticeOf(await h.step(agent)) !== undefined, '第二次真实调用到阈值，应当催');
});

console.log(`${passed}/${total} passed`);
