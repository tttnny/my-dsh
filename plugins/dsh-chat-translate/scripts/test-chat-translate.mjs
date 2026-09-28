// 客户端重写的核心回归（无浏览器）：
// 1. 行渲染计划与宿主 AssistantMarkdown 的分支等价（空行守卫、groupPart 过滤、
//    tool-call 跳过、image 连组、未知块、停止标记、React 键唯一）；
// 2. 翻译呈现判断：成功才挂载，「原样回」同样挂载带标记，失败与未落定（null）
//    显示原文；reasoning 分组不送译，texts 与 outcomes 同域对齐；
// 3. 翻译池：同键同文本幂等、文本换代重请求、逐批落定逐批可见、partial 行再
//    ensure 重走、结果落定换代作废、LRU 行数上限；
// 4. 呈现策略：ui-chat 的 transcriptView 值（含 legacy 值）映射到策略表；
// 5. 左缘细线只标「当前显示译文」：点回原文时线消失、块保持可点。
import assert from 'node:assert/strict';

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log('  ok   ' + name);
    passed++;
  } catch (err) {
    console.error('  FAIL ' + name + ':', err.message);
    throw err;
  }
}

const { planAssistantRow } = await import('../src/client/chat/row-plan.ts');
const { createTranslateStore, chunkTexts } = await import('../src/client/chat/translate-store.ts');
const { isBareBlockClick } = await import('../src/client/chat/click-guard.ts');
const { createChatPresentation, POLICY_BY_MODE } = await import('../src/client/chat/presentation.ts');
const { proseClassNames } = await import('../src/client/chat/styles.ts');

// ---------------------------------------------------------------
// 1+2. 行渲染计划
// ---------------------------------------------------------------

await test('全空行（只有 tool-call、非流式非中断）不渲染', () => {
  const plan = planAssistantRow({
    blocks: [{ kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' }],
    streaming: false,
    interrupted: false,
    canTranslate: true,
  });
  assert.equal(plan.entries, null);
});

await test('tool-call 在助手行内跳过，其余块照常排布', () => {
  const plan = planAssistantRow({
    blocks: [
      { kind: 'text', text: 'First' },
      { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{}' },
      { kind: 'text', text: 'Second' },
    ],
    streaming: false,
    interrupted: false,
    canTranslate: true,
  });
  const types = plan.entries.map((e) => e.type);
  assert.deepEqual(types, ['prose', 'prose']);
  assert.deepEqual(plan.texts, ['First', 'Second']);
});

await test('groupPart 过滤与宿主等价：response 行排除思考，reasoning 行只留思考', () => {
  const blocks = [
    { kind: 'reasoning', text: 'why' },
    { kind: 'text', text: 'what' },
  ];
  const response = planAssistantRow({ blocks, streaming: false, interrupted: false, canTranslate: true, groupPart: 'response' });
  assert.deepEqual(response.entries.map((e) => e.type), ['prose']);
  const reasoning = planAssistantRow({ blocks, streaming: false, interrupted: false, canTranslate: true, groupPart: 'reasoning' });
  assert.deepEqual(reasoning.entries.map((e) => e.type), ['reasoning']);
});

await test('连续 image 合成一组，被 text 打断则分两组', () => {
  const blocks = [
    { kind: 'image', attachment: { id: 'a' } },
    { kind: 'image', attachment: { id: 'b' } },
    { kind: 'text', text: 'mid' },
    { kind: 'image', attachment: { id: 'c' } },
  ];
  const plan = planAssistantRow({ blocks, streaming: false, interrupted: false, canTranslate: true });
  assert.deepEqual(
    plan.entries.map((e) => e.type),
    ['images', 'prose', 'images']
  );
  assert.equal(plan.entries[0].attachments.length, 2);
});

await test('未知 kind 落 unknown 项（渲染为 JSON 块），不吞内容', () => {
  const plan = planAssistantRow({
    blocks: [{ kind: 'other', block: { weird: true } }],
    streaming: false,
    interrupted: false,
    canTranslate: true,
  });
  assert.deepEqual(plan.entries.map((e) => e.type), ['unknown']);
});

await test('停止标记：interrupted 行尾追加，纯思考行在 response 分组下也显示', () => {
  const plan = planAssistantRow({
    blocks: [{ kind: 'text', text: 'partial' }],
    streaming: false,
    interrupted: true,
    canTranslate: true,
  });
  assert.deepEqual(plan.entries.map((e) => e.type), ['prose', 'stopped']);
  const onlyReasoning = planAssistantRow({
    blocks: [{ kind: 'reasoning', text: 'r' }],
    streaming: false,
    interrupted: true,
    canTranslate: true,
    groupPart: 'response',
  });
  // response 分组把 reasoning 过滤掉后，剩余全是被过滤/工具块：宿主条件是
  // 「不存在非 reasoning 非 tool-call 块」→ 停止标记仍然显示（挂在被过滤后的行尾）。
  assert.ok(onlyReasoning.entries.some((e) => e.type === 'stopped'));
});

await test('译文呈现：成功挂载并带标记；原样回同样挂载；失败与流式显示原文', () => {
  const blocks = [{ kind: 'text', text: '这是一段已经很自然的中文。' }, { kind: 'text', text: 'tail' }];
  const outcomes = [
    { translated: '这是一段已经很自然的中文。', ok: true }, // 原样回
    { translated: '尾巴译文', ok: false }, // 失败
  ];
  const plan = planAssistantRow({ blocks, streaming: false, interrupted: false, canTranslate: true, outcomes });
  assert.equal(plan.entries[0].translated, '这是一段已经很自然的中文。');
  assert.equal(plan.entries[1].translated, null, '失败的块不得显示译文');
  const streaming = planAssistantRow({ blocks, streaming: true, interrupted: false, canTranslate: true, outcomes });
  assert.equal(streaming.entries[0].translated, null, '流式中不得换译文');
  const disabled = planAssistantRow({ blocks, streaming: false, interrupted: false, canTranslate: false, outcomes });
  assert.equal(disabled.entries[0].translated, null, '开关关闭时一切按原文');
});

await test('React 键唯一：groupPart 过滤 + interrupted 追加项不撞键', () => {
  // reasoning 被过滤后，行尾 stopped 的键不得与正文块的键重合。
  const plan = planAssistantRow({
    blocks: [
      { kind: 'reasoning', text: 'r' },
      { kind: 'text', text: 'answer' },
    ],
    streaming: false,
    interrupted: true,
    canTranslate: true,
    groupPart: 'response',
  });
  const keys = plan.entries.map((e) => e.key);
  assert.equal(new Set(keys).size, keys.length, 'entries 键必须互不相同: ' + JSON.stringify(keys));
  assert.deepEqual(plan.entries.map((e) => e.type), ['prose', 'stopped']);
  // 连图组 + 正文 + 未知块 + 停止的混合行同样不撞。
  const mixed = planAssistantRow({
    blocks: [
      { kind: 'image', attachment: { id: 'a' } },
      { kind: 'image', attachment: { id: 'b' } },
      { kind: 'text', text: 't1' },
      { kind: 'other', block: { x: 1 } },
    ],
    streaming: false,
    interrupted: true,
    canTranslate: true,
  });
  const mixedKeys = mixed.entries.map((e) => e.key);
  assert.equal(new Set(mixedKeys).size, mixedKeys.length);
});

await test('reasoning 分组不送译：texts 与本组渲染的正文块同域', () => {
  const blocks = [
    { kind: 'reasoning', text: 'why' },
    { kind: 'text', text: 'what' },
  ];
  const reasoning = planAssistantRow({ blocks, streaming: false, interrupted: false, canTranslate: true, groupPart: 'reasoning' });
  assert.deepEqual(reasoning.texts, [], 'reasoning 行不渲染正文，也就不登记译文');
  const response = planAssistantRow({
    blocks,
    streaming: false,
    interrupted: false,
    canTranslate: true,
    groupPart: 'response',
    outcomes: [{ translated: '答案', ok: true }],
  });
  assert.deepEqual(response.texts, ['what']);
  assert.equal(response.entries[0].translated, '答案', 'response 行的第 0 块对齐 outcomes[0]');
});

await test('逐批中间态：null 结果位呈现原文、不挂线', () => {
  const plan = planAssistantRow({
    blocks: [{ kind: 'text', text: 'one' }, { kind: 'text', text: 'two' }],
    streaming: false,
    interrupted: false,
    canTranslate: true,
    outcomes: [{ translated: '一', ok: true }, null],
  });
  assert.equal(plan.entries[0].translated, '一');
  assert.equal(plan.entries[1].translated, null, '未落定的块按原文呈现');
});

// ---------------------------------------------------------------
// 3. 翻译池
// ---------------------------------------------------------------

await test('点击守卫：交互元素与拖选松手不触发切换，裸点击触发', () => {
  const wrapper = { role: 'wrapper' };
  const link = { role: 'link', closest: (sel) => (sel.includes('a') ? link : null) };
  const bareTarget = { closest: () => wrapper }; // closest 命中的就是块容器本身
  const noHit = { closest: () => null };
  const collapsedView = { getSelection: () => ({ isCollapsed: true, toString: () => '' }) };
  const selectingView = { getSelection: () => ({ isCollapsed: false, toString: () => '选中了一段译文' }) };

  assert.equal(isBareBlockClick({ target: link, currentTarget: wrapper }, collapsedView), false, '块内链接的点击归链接');
  assert.equal(isBareBlockClick({ target: bareTarget, currentTarget: wrapper }, collapsedView), true, 'closest 命中块自身照常切');
  assert.equal(isBareBlockClick({ target: noHit, currentTarget: wrapper }, collapsedView), true, '空白处裸点击切换');
  assert.equal(isBareBlockClick({ target: noHit, currentTarget: wrapper }, selectingView), false, '拖选松手产生的 click 不切');
  assert.equal(isBareBlockClick({ target: noHit, currentTarget: wrapper }, undefined), true, '无 window 环境（测试外）不误伤');
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

await test('同键同文本幂等：只请求一次；结果按下标对齐', async () => {
  let calls = 0;
  const store = createTranslateStore(async (texts) => {
    calls++;
    return texts.map((t) => ({ original: t, translated: '译:' + t, ok: true, cached: false, channel: 'mock' }));
  });
  store.ensure('a1', ['one', 'two']);
  store.ensure('a1', ['one', 'two']);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 1);
  const state = store.getState('a1');
  assert.equal(state.status, 'done');
  assert.equal(state.outcomes[1].translated, '译:two');
});

await test('文本换代：同键不同文本整行重新请求', async () => {
  const seen = [];
  const store = createTranslateStore(async (texts) => {
    seen.push(texts.join('|'));
    return texts.map((t) => ({ original: t, translated: '译:' + t, ok: true, cached: false, channel: 'mock' }));
  });
  store.ensure('a1', ['one']);
  await new Promise((r) => setTimeout(r, 0));
  store.ensure('a1', ['one changed']);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen, ['one', 'one changed']);
  assert.equal(store.getState('a1').outcomes[0].translated, '译:one changed');
});

await test('失败结果归一：!ok 或空译文映射为失败保原文', async () => {
  const store = createTranslateStore(async (texts) => [
    { original: texts[0], translated: '坏的', ok: false, cached: false, channel: 'mock' },
    { original: texts[1], translated: '   ', ok: true, cached: false, channel: 'mock' },
  ]);
  store.ensure('a1', ['bad', 'blank']);
  await new Promise((r) => setTimeout(r, 0));
  const state = store.getState('a1');
  assert.deepEqual(state.outcomes, [
    { translated: 'bad', ok: false },
    { translated: 'blank', ok: false },
  ]);
});

await test('在途期间行换代：旧代结果不得覆盖新代 pending', async () => {
  const gate = deferred();
  let first = true;
  const store = createTranslateStore(async (texts) => {
    if (first) {
      first = false;
      await gate.promise;
      return texts.map((t) => ({ original: t, translated: '旧代:' + t, ok: true, cached: false, channel: 'mock' }));
    }
    return texts.map((t) => ({ original: t, translated: '新代:' + t, ok: true, cached: false, channel: 'mock' }));
  });
  store.ensure('a1', ['one']);
  store.ensure('a1', ['one', 'two']); // 换代
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  let state = store.getState('a1');
  assert.equal(state.status, 'done');
  assert.equal(state.outcomes.length, 2);
  assert.equal(state.outcomes[0].translated, '新代:one', '旧代迟到的结果必须被丢弃');
  gate.resolve();
  await new Promise((r) => setTimeout(r, 0));
  state = store.getState('a1');
  assert.equal(state.outcomes[0].translated, '新代:one', '旧代结果不得回写');
});

await test('请求异常按失败处理：行落 partial，等待下一次自然重试', async () => {
  const store = createTranslateStore(async () => {
    throw new Error('boom');
  });
  store.ensure('a1', ['x']);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const state = store.getState('a1');
  assert.equal(state.status, 'partial', '有失败块就不算落定成功');
  assert.equal(state.outcomes[0].ok, false);
});

await test('partial 行再 ensure 会重走；done 行同文本短路', async () => {
  let calls = 0;
  let fail = true;
  const store = createTranslateStore(async (texts) => {
    calls++;
    if (fail) throw new Error('down');
    return texts.map((t) => ({ original: t, translated: '译:' + t, ok: true, cached: false, channel: 'mock' }));
  });
  store.ensure('a1', ['x']);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(store.getState('a1').status, 'partial');
  fail = false;
  assert.equal(store.ensure('a1', ['x']), true, 'partial 的同文本 ensure 必须重新请求');
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const done = store.getState('a1');
  assert.equal(done.status, 'done');
  assert.equal(done.outcomes[0].translated, '译:x');
  assert.equal(store.ensure('a1', ['x']), false, 'done 的同文本 ensure 短路');
  assert.equal(calls, 2);
});

await test('失败行重试有上限：同代三次封顶不再发请求；文本换代重置', async () => {
  let calls = 0;
  const store = createTranslateStore(async () => {
    calls++;
    throw new Error('down');
  });
  const flush = async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  };
  // 同一代文本连跑三轮（首轮 ensure + 两次滚回视口的自然重试）。
  for (let round = 1; round <= 3; round++) {
    store.ensure('a1', ['x']);
    await flush();
  }
  assert.equal(calls, 3, '每轮各请求一次');
  assert.equal(store.getState('a1').status, 'partial');
  assert.equal(store.ensure('a1', ['x']), false, '同代封顶后 ensure 不再重走');
  await flush();
  assert.equal(calls, 3, '封顶意味着不再打通道');
  // 文本换代：额度重置，照走。
  store.ensure('a1', ['x', 'y']);
  await flush();
  assert.equal(calls, 4, '新代文本重新获得完整重试额度');
});

await test('逐批落定：先回的段先可见，不等最后一批', async () => {
  const big = '汉'.repeat(6000); // 独自成批
  const gates = [deferred(), deferred()];
  let batch = 0;
  const store = createTranslateStore(async (texts) => {
    const gate = gates[batch++];
    await gate.promise;
    return texts.map((t) => ({ original: t, translated: '译:' + t.slice(0, 8), ok: true, cached: false, channel: 'mock' }));
  });
  store.ensure('a1', ['first', big]);
  await new Promise((r) => setTimeout(r, 0));
  gates[0].resolve();
  await new Promise((r) => setTimeout(r, 0));
  let state = store.getState('a1');
  assert.equal(state.status, 'pending', '还有批在途');
  assert.equal(state.outcomes[0].translated, '译:first', '第一批落定即可渲染');
  assert.equal(state.outcomes[1], null, '第二批未回仍是空位（该块呈现原文）');
  gates[1].resolve();
  await new Promise((r) => setTimeout(r, 0));
  state = store.getState('a1');
  assert.equal(state.status, 'done');
  assert.ok(state.outcomes[1].ok);
});

await test('chunkTexts：按 token 预算切批，单块超预算独立成批', () => {
  const short = ['one', 'two', 'three'];
  assert.deepEqual(chunkTexts(short), [['one', 'two', 'three']], '小行一批装下');
  const big = '汉'.repeat(6000); // 每个汉字约 1 token，远超预算
  const texts = ['a', big, 'b'];
  const batches = chunkTexts(texts);
  assert.deepEqual(batches, [['a'], [big], ['b']], '超预算的块独自成批，前后各自切');
  assert.ok(batches.every((batch) => batch.length > 0), '不产生空批');
});

await test('批间隔离：一批失败只败这一批，其余批译文照常落定', async () => {
  const big = '汉'.repeat(6000);
  const store = createTranslateStore(async (batch) => {
    if (batch.includes('bad')) throw new Error('this batch dies');
    return batch.map((t) => ({ original: t, translated: '译:' + t, ok: true, cached: false, channel: 'mock' }));
  });
  store.ensure('a1', ['good1', big, 'bad', 'good2']);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const state = store.getState('a1');
  assert.equal(state.status, 'partial');
  // 切批结果：[good1] / [big] / [bad, good2]（bad 与 good2 余量同批）。
  // 死批整批败（含同批的 good2——失败面就是批），前后两批不受牵连。
  assert.deepEqual(state.outcomes.map((o) => [o.translated, o.ok]), [
    ['译:good1', true],
    ['译:' + big, true],
    ['bad', false],
    ['good2', false],
  ]);
});

await test('行数 LRU 上限：超出后淘汰最久未读的行', () => {
  const store = createTranslateStore(async (texts) =>
    texts.map((t) => ({ original: t, translated: '译:' + t, ok: true, cached: false, channel: 'mock' }))
  );
  for (let i = 0; i < 260; i++) store.ensure('row' + i, ['t' + i]);
  assert.equal(store.getState('row0'), undefined, '最早登记的行应被淘汰');
  assert.ok(store.getState('row259'), '最新行保留在池内');
});

// ---------------------------------------------------------------
// 4. 呈现策略
// ---------------------------------------------------------------

await test('策略表与宿主一致：四模式 + legacy 值映射', () => {
  assert.equal(POLICY_BY_MODE.standard.settledReasoningPreview, true);
  assert.equal(POLICY_BY_MODE.compact.settledReasoningPreview, false);
  assert.equal(POLICY_BY_MODE.detailed.stepGrouping, 'history');
  assert.equal(POLICY_BY_MODE.verbose.foldCompletedTurns, false);
  assert.equal(POLICY_BY_MODE.normal.settledReasoningPreview, true, 'legacy normal 按 standard 读');
  assert.equal(POLICY_BY_MODE.expanded.stepGrouping, 'history', 'legacy expanded 按 detailed 读');
});

await test('配置面可用时跟随 transcriptView；缺省时按 standard', async () => {
  const listeners = new Set();
  const form = {
    getSnapshot: () => ({ status: 'ready', value: { transcriptView: 'compact' }, writable: true, revision: 1 }),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const presentation = createChatPresentation();
  presentation.attach(form);
  assert.equal(presentation.getSnapshot().settledReasoningPreview, false);
  presentation.detach();

  const fallback = createChatPresentation();
  fallback.attach(null);
  assert.equal(fallback.getSnapshot(), POLICY_BY_MODE.standard);
});

// ---------------------------------------------------------------
// 5. 左缘细线随显示态
// ---------------------------------------------------------------

await test('细线只标「当前显示译文」：点回原文时线消失、块保持可点', () => {
  assert.equal(proseClassNames(false, false), undefined, '未挂译文的块没有任何标记类');
  assert.equal(proseClassNames(false, true), undefined, '未挂译文谈不上原文态');
  const showingTranslation = proseClassNames(true, false);
  assert.match(showingTranslation, /dsh-ct-prose-translated/, '显示译文时挂左缘细线');
  assert.match(showingTranslation, /dsh-ct-prose-clickable/, '译文态整块可点');
  const showingOriginal = proseClassNames(true, true);
  assert.ok(!showingOriginal.includes('dsh-ct-prose-translated'), '显示原文时细线随之消失');
  assert.match(showingOriginal, /dsh-ct-prose-clickable/, '原文态仍可点击切回译文');
});

console.log('');
console.log('chat-translate: ' + passed + '/' + total + ' 通过');
process.exit(passed === total ? 0 : 1);
