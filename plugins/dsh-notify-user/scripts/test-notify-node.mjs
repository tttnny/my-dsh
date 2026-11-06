/**
 * notify_user 对话节点定义的自检：认领哪些事件、节点站在哪个位置、卡片数据从哪来。
 *
 * 定义在浏览器 bundle 里，本脚本按 Web shell 的方式装载 lib/client.js，用假服务
 * 抓住注册的定义，再按宿主装配器的顺序喂事件。跑之前先 pnpm build（pnpm test 会做）。
 *
 * 跑法：pnpm test / node scripts/test-notify-node.mjs
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadClientBundle } from './lib/client-bundle.mjs';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const { exported } = await loadClientBundle(root);

/** 假服务：只保留 apply 真的读的那几个成员。 */
const services = {
  locale: { register: () => () => {} },
  slots: {
    inject: (_name, register) => { register(); return () => {}; },
    register: () => () => {},
  },
  configForms: {
    get: () => ({ getSnapshot: () => ({ status: 'ready', value: {} }), subscribe: () => () => {}, set: async () => true }),
    whileServed: (namespaces, register) => register(new Set(namespaces)),
  },
  uiConversation: {
    events: {
      register: (definition) => { registered = definition; return () => {}; },
    },
  },
};
let registered;
const ctx = {
  effect: (factory) => {
    const dispose = factory();
    return typeof dispose === 'function' ? dispose : () => {};
  },
  inject: (_names, callback) => { callback(ctx); return () => {}; },
  ...services,
};
exported.apply(ctx);

let passed = 0;
let total = 0;
function test(label, fn) {
  total += 1;
  try {
    fn();
    passed += 1;
    console.log('  ok   ' + label);
  } catch (error) {
    console.error('  FAIL ' + label + ': ' + error.message);
    throw error;
  }
}

const location = { kind: 'unresolved' };

/** 一次原生工具调用事件。 */
function callEvent(callId, args = { title: '标题', message: '正文' }, seq = 10, time = 1000) {
  return {
    type: 'tool/call',
    seq,
    time,
    data: { turn: 1, step: 1, callId, name: 'notify_user', arguments: JSON.stringify(args) },
  };
}

/** 一次工具结果事件；surfaceOp 缺省是追加。 */
function resultEvent(callId, meta, seq = 11, time = 1100, surfaceOp = 'append') {
  return {
    type: 'tool/result',
    seq,
    time,
    surfaceOp,
    data: {
      turn: 1,
      step: 1,
      message: { role: 'tool', content: [], source: { callId } },
      ...(meta === undefined ? {} : { meta }),
    },
  };
}

/** 一次带工具名的流式块结束事件。 */
function blockEndEvent(callId, seq = 9, time = 900) {
  return {
    type: 'assistant/live-chunk',
    seq,
    time,
    data: {
      attemptId: 'attempt-1',
      turn: 1,
      step: 1,
      chunk: {
        type: 'block-end',
        index: 0,
        block: { type: 'tool-call', id: callId, name: 'notify_user', arguments: '{"message":"正文"}' },
      },
    },
  };
}

/** 一次带工具名的流式增量事件。 */
function deltaEvent(callId, seq = 9, time = 900) {
  return {
    type: 'assistant/live-chunk',
    seq,
    time,
    data: {
      attemptId: 'attempt-1',
      turn: 1,
      step: 1,
      chunk: { type: 'tool-call-delta', index: 0, id: callId, name: 'notify_user', argumentsDelta: '{"message":"正文"}' },
    },
  };
}

/** 一次 PTC 子调用开始事件。 */
function ptcStartEvent(subCallId, seq = 20, time = 2000) {
  return {
    type: 'tool/ptc-dispatch-start',
    seq,
    time,
    data: {
      rootCallId: 'root-1',
      parentCallId: 'parent-1',
      subCallId,
      name: 'notify_user',
      arguments: { title: 'PTC 标题', message: 'PTC 正文' },
    },
  };
}

/** 一次 PTC 子调用结果事件。 */
function ptcResultEvent(subCallId, meta, seq = 21, time = 2100) {
  return {
    type: 'tool/ptc-dispatch',
    seq,
    time,
    data: {
      rootCallId: 'root-1',
      parentCallId: 'parent-1',
      subCallId,
      name: 'notify_user',
      arguments: { title: 'PTC 标题', message: 'PTC 正文' },
      content: [],
      ...(meta === undefined ? {} : { meta }),
    },
  };
}

/**
 * 按装配器的顺序把事件喂给定义：先匹配，再决定 start 还是 update。
 * @param definition - 被测定义。
 * @param events - 按 seq 升序的事件。
 * @returns 每个 id 的上下文。
 */
function feed(definition, events) {
  const contexts = new Map();
  for (const event of events) {
    const result = definition.match(event);
    if (result === null) continue;
    const key = definition.kind + ':' + result.id;
    let context = contexts.get(key);
    if (context === undefined) {
      context = { key, kind: definition.kind, id: result.id, matches: [], start: undefined, state: undefined, current: new Map() };
      contexts.set(key, context);
    }
    const match = { event, role: result.role, location };
    context.matches.push(match);
    if (result.role === 'start' && context.start === undefined) {
      context.start = match;
      context.state = definition.start(context, match, { previous: () => undefined });
    } else if (context.state !== undefined) {
      context.state = definition.update(context, match);
    }
  }
  return contexts;
}

test('定义注册在 chat 目标上', () => {
  assert.equal(registered?.kind, 'notify-user');
  assert.equal(registered?.target, 'chat');
});

test('原生调用被独占认领', () => {
  const definition = registered;
  assert.deepEqual(definition.match(callEvent('call-1')), { id: 'call-1', role: 'start', exclusive: true });
});

test('别的工具不认领', () => {
  const definition = registered;
  const event = callEvent('call-1');
  event.data.name = 'bash';
  assert.equal(definition.match(event), null);
});

test('流式块结束事件被独占认领', () => {
  assert.deepEqual(registered.match(blockEndEvent('call-1')), { id: 'call-1', role: 'start', exclusive: true });
});

test('带工具名的流式增量被独占认领', () => {
  assert.deepEqual(registered.match(deltaEvent('call-delta')), { id: 'call-delta', role: 'start', exclusive: true });
});

test('没有工具名的流式增量不认领', () => {
  const event = deltaEvent('call-unnamed');
  delete event.data.chunk.name;
  assert.equal(registered.match(event), null);
});

test('PTC 子调用开始与结果都被独占认领', () => {
  assert.deepEqual(registered.match(ptcStartEvent('sub-1')), { id: 'sub-1', role: 'start', exclusive: true });
  assert.deepEqual(registered.match(ptcResultEvent('sub-1', { message: '正文' })), { id: 'sub-1', role: 'update', exclusive: true });
});

test('只有见过的调用才认领结果', () => {
  assert.equal(registered.match(resultEvent('unknown', { message: '正文' })), null);
  registered.match(callEvent('call-1'));
  assert.deepEqual(registered.match(resultEvent('call-1', { message: '正文' })),
    { id: 'call-1', role: 'update', exclusive: true });
});

test('替换写法的结果不认领', () => {
  registered.match(callEvent('call-1'));
  assert.equal(registered.match(resultEvent('call-1', { message: '正文' }, 11, 1100, { op: 'replace', startSeq: 1, endSeq: 2 })), null);
});

test('节点站在步骤组外，位置是 process', () => {
  const contexts = feed(registered, [callEvent('call-1')]);
  const node = registered.buildViewNode(contexts.get(registered.kind + ':call-1'));
  assert.equal(node.kind, 'notify-user');
  assert.equal(node.target, 'chat');
  assert.equal(node.groupTree, 'process');
  assert.equal(node.visibility, 'visible');
  assert.equal(node.anchorSeq, 10);
  assert.deepEqual(node.data, { title: '标题', message: '正文', time: 1000, settled: false });
});

test('结果落定后读 meta，正文以 meta 为准', () => {
  const contexts = feed(registered, [
    callEvent('call-1'),
    resultEvent('call-1', { title: '最终标题', message: '最终正文' }),
  ]);
  const node = registered.buildViewNode(contexts.get(registered.kind + ':call-1'));
  assert.deepEqual(node.data, { title: '最终标题', message: '最终正文', time: 1000, settled: true });
});

test('结果没有 meta 时保留调用参数里的内容', () => {
  const contexts = feed(registered, [callEvent('call-1'), resultEvent('call-1', undefined)]);
  const node = registered.buildViewNode(contexts.get(registered.kind + ':call-1'));
  assert.deepEqual(node.data, { title: '标题', message: '正文', time: 1000, settled: true });
});

test('结果先到时按结果补出节点', () => {
  // 前一个窗口见过这次调用，当前窗口只剩结果：认领得到，节点锚在结果事件上。
  registered.match(callEvent('call-late'));
  const contexts = feed(registered, [resultEvent('call-late', { title: '结果标题', message: '结果正文' }, 11, 1100)]);
  const node = registered.buildViewNode(contexts.get(registered.kind + ':call-late'));
  assert.equal(node.anchorSeq, 11);
  assert.deepEqual(node.data, { title: '结果标题', message: '结果正文', time: 1100, settled: true });
});

test('只有流式事件时不出节点', () => {
  const contexts = feed(registered, [blockEndEvent('call-1')]);
  assert.equal(registered.buildViewNode(contexts.get(registered.kind + ':call-1')), null);
});

test('流式事件之后落成原生调用，节点锚在调用事件上', () => {
  const contexts = feed(registered, [blockEndEvent('call-1'), callEvent('call-1', { message: '正文' }, 10, 1000)]);
  const node = registered.buildViewNode(contexts.get(registered.kind + ':call-1'));
  assert.equal(node.anchorSeq, 10);
  assert.equal(node.data.message, '正文');
});

test('PTC 子调用同样出节点', () => {
  const contexts = feed(registered, [ptcStartEvent('sub-1'), ptcResultEvent('sub-1', { title: 'PTC 标题', message: 'PTC 正文' })]);
  const node = registered.buildViewNode(contexts.get(registered.kind + ':sub-1'));
  assert.equal(node.kind, 'notify-user');
  assert.equal(node.groupTree, 'process');
  assert.deepEqual(node.data, { title: 'PTC 标题', message: 'PTC 正文', time: 2000, settled: true });
});

test('没有正文时仍出节点，标题兜底交给渲染器', () => {
  const contexts = feed(registered, [callEvent('call-1', {})]);
  const node = registered.buildViewNode(contexts.get(registered.kind + ':call-1'));
  assert.deepEqual(node.data, { message: '', time: 1000, settled: false });
});

console.log('\nnotify-node: ' + passed + '/' + total + ' passed');
process.exit(passed === total ? 0 : 1);
