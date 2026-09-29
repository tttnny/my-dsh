// 客户端重写的核心回归（无浏览器）：
// 1. 行渲染计划与宿主 AssistantMarkdown 的分支等价（空行守卫、groupPart 过滤、
//    tool-call 跳过、image 连组、未知块、停止标记、React 键唯一）；
// 2. 翻译呈现判断：成功挂载（「原样回」同样挂载），失败一律同一条红实线、
//    败因载荷（fail: reason+detail）随悬停文案，在途只给已登记行的未落定块
//    （灰脉动），空白块不送译、不占位、永不挂线；reasoning 分组不送译，
//    texts 与 outcomes 同域对齐；
// 3. 翻译池：同键同文本幂等、文本换代重请求、逐批落定逐批可见、落定后无任何
//    自动重走、manual ensure 整行补跑且成功块保持挂线、LRU 行数上限；
// 4. 呈现策略：ui-chat 的 transcriptView 值（含 legacy 值）映射到策略表；
// 5. 左缘线标：蓝=译文、灰细=读原文备译文、红实=失败（一律一种）、
//    灰脉动=在途、无线=没送过模型。
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
const storeModule = await import('../src/client/chat/translate-store.ts');
const { createTranslateStore, chunkTexts } = storeModule;
const { isBareBlockClick } = await import('../src/client/chat/click-guard.ts');
const { createChatPresentation, POLICY_BY_MODE } = await import('../src/client/chat/presentation.ts');
const { proseClassNames, proseAction, ASSISTANT_CSS } = await import('../src/client/chat/styles.ts');

const flush = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

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

await test('译文呈现：成功挂载并带标记；原样回同样挂载；失败一律同一条线', () => {
  const blocks = [{ kind: 'text', text: '这是一段已经很自然的中文。' }, { kind: 'text', text: 'tail' }];
  const outcomes = [
    { translated: '这是一段已经很自然的中文。', ok: true }, // 原样回
    { translated: '尾巴译文', ok: false, reason: 'content', detail: 'line count changed (1 -> 2)' }, // 失败
  ];
  const plan = planAssistantRow({ blocks, streaming: false, interrupted: false, canTranslate: true, outcomes, rowStatus: 'settled' });
  assert.equal(plan.entries[0].translated, '这是一段已经很自然的中文。');
  assert.equal(plan.entries[0].mark, 'translated', '原样回同样挂线');
  assert.equal(plan.entries[1].translated, null, '失败的块不得显示译文');
  assert.equal(plan.entries[1].mark, 'failed', '两类败因共用同一条红实线标记');
  assert.deepEqual(
    plan.entries[1].fail,
    { reason: 'content', detail: 'line count changed (1 -> 2)' },
    'fail 载荷直达计划层，供 Tooltip 悬停报因'
  );
  const viewing = planAssistantRow({
    blocks, streaming: false, interrupted: false, canTranslate: true, outcomes, rowStatus: 'settled',
    originalKeys: new Set([0]),
  });
  assert.equal(viewing.entries[0].mark, 'original-view', '点了读原文：蓝线折成灰细线');
  assert.equal(viewing.entries[0].translated, '这是一段已经很自然的中文。', '读原文不抹掉已成功的结果');
  const streaming = planAssistantRow({ blocks, streaming: true, interrupted: false, canTranslate: true, outcomes, rowStatus: 'settled' });
  assert.equal(streaming.entries[0].translated, null, '流式中不得换译文');
  assert.equal(streaming.entries[1].mark, null, '流式中连红线都不挂');
  const disabled = planAssistantRow({ blocks, streaming: false, interrupted: false, canTranslate: false, outcomes, rowStatus: 'settled' });
  assert.equal(disabled.entries[0].translated, null, '开关关闭时一切按原文');
  assert.equal(disabled.entries[1].mark, null, '开关关闭时红线也一并撤下');
});

await test('空白块不送译、不占位、永不挂线', () => {
  const blocks = [
    { kind: 'text', text: '  \n ' },
    { kind: 'text', text: 'hi' },
    { kind: 'text', text: '' },
  ];
  const plan = planAssistantRow({
    blocks,
    streaming: false,
    interrupted: false,
    canTranslate: true,
    outcomes: [{ translated: '嗨', ok: true }],
    rowStatus: 'pending',
  });
  assert.deepEqual(plan.texts, ['hi'], '空白块不进送译清单');
  assert.equal(plan.entries[0].mark, null, '空白块连在途脉动都不显');
  assert.equal(plan.entries[1].translated, '嗨', '非空白块按压缩后的下标对齐 outcomes');
  assert.equal(plan.entries[1].mark, 'translated');
  assert.equal(plan.entries[2].mark, null);
});

await test('在途脉动只给「已登记、未落定」的块；行未登记什么都不显', () => {
  const blocks = [{ kind: 'text', text: 'one' }, { kind: 'text', text: 'two' }];
  const registered = planAssistantRow({
    blocks,
    streaming: false,
    interrupted: false,
    canTranslate: true,
    outcomes: [{ translated: '一', ok: true }, null],
    rowStatus: 'pending',
  });
  assert.equal(registered.entries[0].mark, 'translated');
  assert.equal(registered.entries[1].mark, 'inflight', '待决批的块显灰脉动');
  const unregistered = planAssistantRow({ blocks, streaming: false, interrupted: false, canTranslate: true });
  assert.equal(unregistered.entries[0].mark, null, '没进池就没有脉动');
  assert.equal(unregistered.entries[0].translated, null);
  const settled = planAssistantRow({
    blocks,
    streaming: false,
    interrupted: false,
    canTranslate: true,
    outcomes: [{ translated: '一', ok: true }, { translated: 'two', ok: false, reason: 'transport' }],
    rowStatus: 'settled',
  });
  assert.equal(settled.entries[1].mark, 'failed', '落定的失败块红实线，不再脉动');
  assert.equal(settled.entries[1].fail.reason, 'transport', '传输伤只进悬停载荷，不再换线型');
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
    return texts.map((t) => ({ original: t, translated: '译:' + t, ok: true, cached: false }));
  });
  store.ensure('a1', ['one', 'two']);
  store.ensure('a1', ['one', 'two']);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 1);
  const state = store.getState('a1');
  assert.equal(state.status, 'settled');
  assert.equal(state.outcomes[1].translated, '译:two');
});

await test('文本换代：同键不同文本整行重新请求', async () => {
  const seen = [];
  const store = createTranslateStore(async (texts) => {
    seen.push(texts.join('|'));
    return texts.map((t) => ({ original: t, translated: '译:' + t, ok: true, cached: false }));
  });
  store.ensure('a1', ['one']);
  await new Promise((r) => setTimeout(r, 0));
  store.ensure('a1', ['one changed']);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen, ['one', 'one changed']);
  assert.equal(store.getState('a1').outcomes[0].translated, '译:one changed');
});

await test('失败结果归一：!ok、空译文与缺 reason 各按败因落账；服务端 detail 原样带过', async () => {
  const store = createTranslateStore(async (texts) => [
    { original: texts[0], translated: '坏的', ok: false, cached: false, reason: 'content', detail: 'line count changed (1 -> 2)' },
    { original: texts[1], translated: '   ', ok: true, cached: false },
    { original: texts[2], translated: 'x', ok: false, cached: false },
  ]);
  store.ensure('a1', ['bad', 'blank', 'no-reason']);
  await flush();
  const state = store.getState('a1');
  assert.deepEqual(state.outcomes, [
    { translated: 'bad', ok: false, reason: 'content', detail: 'line count changed (1 -> 2)' },
    { translated: 'blank', ok: false, reason: 'transport' },
    { translated: 'no-reason', ok: false, reason: 'transport' },
  ]);
});

await test('在途期间行换代：旧代结果不得覆盖新代 pending', async () => {
  const gate = deferred();
  let first = true;
  const store = createTranslateStore(async (texts) => {
    if (first) {
      first = false;
      await gate.promise;
      return texts.map((t) => ({ original: t, translated: '旧代:' + t, ok: true, cached: false }));
    }
    return texts.map((t) => ({ original: t, translated: '新代:' + t, ok: true, cached: false }));
  });
  store.ensure('a1', ['one']);
  store.ensure('a1', ['one', 'two']); // 换代
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  let state = store.getState('a1');
  assert.equal(state.status, 'settled');
  assert.equal(state.outcomes.length, 2);
  assert.equal(state.outcomes[0].translated, '新代:one', '旧代迟到的结果必须被丢弃');
  gate.resolve();
  await new Promise((r) => setTimeout(r, 0));
  state = store.getState('a1');
  assert.equal(state.outcomes[0].translated, '新代:one', '旧代结果不得回写');
});

await test('请求异常按失败处理：行落 settled、块按 transport 挂线', async () => {
  const store = createTranslateStore(async () => {
    throw new Error('boom');
  });
  store.ensure('a1', ['x']);
  await flush();
  const state = store.getState('a1');
  assert.equal(state.status, 'settled', '落定即终态：没有自动补跑在等它');
  assert.equal(state.outcomes[0].ok, false);
  assert.equal(state.outcomes[0].reason, 'transport');
});

await test('落定行 ensure 短路；manual 补跑整行重发且成功块不闪', async () => {
  let calls = 0;
  let failSecond = true;
  const store = createTranslateStore(async (texts) => {
    calls++;
    return texts.map((t, i) =>
      failSecond && i === 1
        ? { original: t, translated: t, ok: false, cached: false, reason: 'content' }
        : { original: t, translated: '译:' + t, ok: true, cached: false }
    );
  });
  store.ensure('a1', ['x', 'y']);
  await flush();
  assert.equal(store.getState('a1').status, 'settled');
  assert.equal(store.getState('a1').outcomes[1].reason, 'content');

  assert.equal(store.ensure('a1', ['x', 'y']), false, '自动 ensure 短路——滚动不再触发任何重走');
  assert.equal(calls, 1, '落定行没有被池再次打通道（首跑就那一次批请求）');

  failSecond = false;
  assert.equal(store.ensure('a1', ['x', 'y'], true), true, 'manual=true 是唯一的补跑入口');
  const mid = store.getState('a1');
  assert.equal(mid.status, 'pending');
  assert.equal(mid.outcomes[0].translated, '译:x', '补跑瞬间已成功块当场种回，译文不闪');
  assert.equal(mid.outcomes[1], null, '失败块清空结果位进在途');
  await flush();
  const done = store.getState('a1');
  assert.equal(done.status, 'settled');
  assert.equal(done.outcomes[1].translated, '译:y');
});

await test('手动补跑无限次：落定→补跑→再落定→再补跑，每次都真发', async () => {
  let calls = 0;
  const store = createTranslateStore(async (texts) => {
    calls++;
    return texts.map((t) => ({ original: t, translated: t, ok: false, cached: false, reason: 'content' }));
  });
  store.ensure('a1', ['x']);
  await flush();
  for (let round = 0; round < 5; round++) {
    assert.equal(store.ensure('a1', ['x'], true), true, '第 ' + (round + 1) + ' 次手点必须重发，没有额度封顶');
    await flush();
  }
  assert.equal(calls, 6);
  assert.equal(store.getState('a1').status, 'settled');
});

await test('在途时再点（含 manual）是空操作：脉动就是「已在跑」的答复', async () => {
  const gate = deferred();
  let calls = 0;
  const store = createTranslateStore(async (texts) => {
    calls++;
    await gate.promise;
    return texts.map((t) => ({ original: t, translated: '译:' + t, ok: true, cached: false }));
  });
  store.ensure('a1', ['x']);
  assert.equal(store.ensure('a1', ['x'], true), false, 'pending 行连手点都不重发');
  assert.equal(calls, 1);
  gate.resolve();
  await flush();
  assert.equal(store.getState('a1').status, 'settled');
});

await test('逐批落定：先回的段先可见，不等最后一批', async () => {
  const big = '汉'.repeat(6000); // 独自成批
  const gates = [deferred(), deferred()];
  let batch = 0;
  const store = createTranslateStore(async (texts) => {
    const gate = gates[batch++];
    await gate.promise;
    return texts.map((t) => ({ original: t, translated: '译:' + t.slice(0, 8), ok: true, cached: false }));
  });
  store.ensure('a1', ['first', big]);
  await new Promise((r) => setTimeout(r, 0));
  gates[0].resolve();
  await new Promise((r) => setTimeout(r, 0));
  let state = store.getState('a1');
  assert.equal(state.status, 'pending', '还有批在途');
  assert.equal(state.outcomes[0].translated, '译:first', '第一批落定即可渲染');
  assert.equal(state.outcomes[1], null, '第二批未回仍是空位（该块显灰脉动）');
  gates[1].resolve();
  await new Promise((r) => setTimeout(r, 0));
  state = store.getState('a1');
  assert.equal(state.status, 'settled');
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
    return batch.map((t) => ({ original: t, translated: '译:' + t, ok: true, cached: false }));
  });
  store.ensure('a1', ['good1', big, 'bad', 'good2']);
  await flush();
  await flush();
  await flush();
  const state = store.getState('a1');
  assert.equal(state.status, 'settled');
  // 切批结果：[good1] / [big] / [bad, good2]（bad 与 good2 余量同批）。
  // 死批整批败（含同批的 good2——失败面就是批），前后两批不受牵连。
  assert.deepEqual(state.outcomes.map((o) => [o.translated, o.ok, o.reason]), [
    ['译:good1', true, undefined],
    ['译:' + big, true, undefined],
    ['bad', false, 'transport'],
    ['good2', false, 'transport'],
  ]);
});

await test('行数 LRU 上限：超出后淘汰最久未读的行', () => {
  const store = createTranslateStore(async (texts) =>
    texts.map((t) => ({ original: t, translated: '译:' + t, ok: true, cached: false }))
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
// 5. 左缘线标：蓝=读译文，灰细=读原文备译文，红实=失败（悬停报因），
//    灰脉动=在途，无线=没送过模型（失败态整块可点=手动补跑）
// ---------------------------------------------------------------

await test('标记名单点：线型随状态，失败一条红线，在途不可点', () => {
  assert.equal(proseClassNames(null), undefined, '没送过模型的块没有任何标记类');
  const translated = proseClassNames('translated');
  assert.match(translated, /dsh-ct-prose-clickable dsh-ct-prose-translated/);
  assert.ok(!translated.includes('dsh-ct-prose-original'), '译文态不挂灰线类');
  const showingOriginal = proseClassNames('original-view');
  assert.ok(!showingOriginal.includes('dsh-ct-prose-translated'), '原文态不挂蓝线');
  assert.match(showingOriginal, /dsh-ct-prose-clickable dsh-ct-prose-original/, '灰细线仍可点切回');
  const failed = proseClassNames('failed');
  assert.match(failed, /dsh-ct-prose-clickable/, '红线整块可点=重试');
  assert.match(failed, /dsh-ct-prose-failed/, '失败挂实线红');
  assert.match(failed, /dsh-ct-prose-retryable/, '失败块带 ↻ 悬停锚点');
  const inflight = proseClassNames('inflight');
  assert.match(inflight, /dsh-ct-prose-inflight/);
  assert.ok(!inflight.includes('clickable'), '在途脉动态不可点（点了也是空操作）');
  assert.ok(!inflight.includes('retryable'), '在途不露重试指引');
});

await test('线的色相与粗细：蓝 1px 主色、灰 0.5px 中性、红走 error 色相', () => {
  assert.match(
    ASSISTANT_CSS,
    /\.dsh-ct-prose-translated\{border-left:1px solid color-mix\(in srgb, var\(--dsw-alias-state-business-primary\) 65%, transparent\)\}/,
    '译文线是 1px 主色（粗一点的蓝）'
  );
  assert.match(
    ASSISTANT_CSS,
    /\.dsh-ct-prose-original\{border-left:0\.5px solid var\(--dsw-alias-border-l2\)\}/,
    '原文态线是 0.5px 中性 hairline（细灰）'
  );
  assert.match(
    ASSISTANT_CSS,
    /\.dsh-ct-prose-failed\{border-left:1px solid color-mix\(in srgb, var\(--dsw-alias-state-error-primary\) 65%, transparent\)\}/,
    '失败是 1px error 色实线——不分败因，一律实线'
  );
  assert.ok(!ASSISTANT_CSS.includes('dashed'), '失败只有一条实线，样式表里没有虚线');
});

await test('在途灰脉动：动画声明存在且尊重 prefers-reduced-motion', () => {
  assert.match(ASSISTANT_CSS, /\.dsh-ct-prose-inflight\{padding-left:12px;border-left:1px solid var\(--dsw-alias-border-l2\);animation:/);
  assert.match(ASSISTANT_CSS, /@keyframes dsh-ct-prose-inflight-pulse/);
  assert.match(
    ASSISTANT_CSS,
    /@media \(prefers-reduced-motion:reduce\)\{\.dsh-ct-prose-inflight\{animation:none\}\}/,
    'reduced-motion 降级为静态灰线'
  );
});

await test('动作单点：mark 唯一决定 toggle / retry / 不可点', () => {
  assert.equal(proseAction('translated'), 'toggle');
  assert.equal(proseAction('original-view'), 'toggle', '读原文态仍可点切回');
  assert.equal(proseAction('failed'), 'retry', '红线整块可点=补跑');
  assert.equal(proseAction('inflight'), null, '在途脉动不可点');
  assert.equal(proseAction(null), null);
});

await test('防回归：自动重试面不存在——额度常量不得复活', () => {
  assert.equal('MAX_ROW_ATTEMPTS' in storeModule, false);
});

console.log('');
console.log('chat-translate: ' + passed + '/' + total + ' 通过');
process.exit(passed === total ? 0 : 1);
