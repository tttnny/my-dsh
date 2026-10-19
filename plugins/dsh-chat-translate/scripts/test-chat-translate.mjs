// 客户端重写的核心回归（无浏览器）：
// 1. 行渲染计划与宿主 AssistantMarkdown 的分支等价（空行守卫、groupPart 过滤、
//    tool-call 跳过、image 连组、未知块、停止标记、React 键唯一）；
// 2. 翻译呈现判断：成功即挂载（「原样回」同样挂载），失败只留下一个可补跑的
//    标记与悬停载荷（fail: 一句通道细节），未落定与在途一律不给任何标记；
//    空白块不送译、不占位、永不标记；reasoning 分组不送译，texts 与 outcomes
//    同域对齐；
// 3. 翻译池：同键同文本幂等、文本换代重请求、逐批落定逐批可见、落定后无任何
//    自动重走、manual ensure 整行补跑且成功块结果保持、LRU 行数上限；
// 4. 呈现策略：ui-chat 的 transcriptView 值（含 legacy 值）映射到策略表；
// 5. 正文左缘没有任何线标：成功块的切换归一条 10px 透明窄带，悬停时在光标右边
//    出一条气泡；失败块归一个真 ↻ 按钮（补跑在途原位转圈）；样式表里不存在任何
//    border-left 与缩进。
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
const { isCleanHotspotClick } = await import('../src/client/chat/click-guard.ts');
const { createChatPresentation, policyForMode } = await import('../src/client/chat/presentation.ts');
const stylesModule = await import('../src/client/chat/styles.ts');
const {
  proseClassNames,
  proseAction,
  PROSE_BASE_CLASS,
  HOTSPOT_CLASS,
  HINT_BUBBLE_CLASS,
  RETRY_CLASS,
  RETRY_BUSY_ATTR,
  RETRY_SPIN_CLASS,
  ASSISTANT_CSS,
} = stylesModule;

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
    channel: 'ready',
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
    channel: 'ready',
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
  const response = planAssistantRow({ blocks, streaming: false, interrupted: false, channel: 'ready', groupPart: 'response' });
  assert.deepEqual(response.entries.map((e) => e.type), ['prose']);
  const reasoning = planAssistantRow({ blocks, streaming: false, interrupted: false, channel: 'ready', groupPart: 'reasoning' });
  assert.deepEqual(reasoning.entries.map((e) => e.type), ['reasoning']);
});

await test('连续 image 合成一组，被 text 打断则分两组', () => {
  const blocks = [
    { kind: 'image', attachment: { id: 'a' } },
    { kind: 'image', attachment: { id: 'b' } },
    { kind: 'text', text: 'mid' },
    { kind: 'image', attachment: { id: 'c' } },
  ];
  const plan = planAssistantRow({ blocks, streaming: false, interrupted: false, channel: 'ready' });
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
    channel: 'ready',
  });
  assert.deepEqual(plan.entries.map((e) => e.type), ['unknown']);
});

await test('停止标记：interrupted 行尾追加，纯思考行在 response 分组下也显示', () => {
  const plan = planAssistantRow({
    blocks: [{ kind: 'text', text: 'partial' }],
    streaming: false,
    interrupted: true,
    channel: 'ready',
  });
  assert.deepEqual(plan.entries.map((e) => e.type), ['prose', 'stopped']);
  const onlyReasoning = planAssistantRow({
    blocks: [{ kind: 'reasoning', text: 'r' }],
    streaming: false,
    interrupted: true,
    channel: 'ready',
    groupPart: 'response',
  });
  // response 分组把 reasoning 过滤掉后，剩余全是被过滤/工具块：宿主条件是
  // 「不存在非 reasoning 非 tool-call 块」→ 停止标记仍然显示（挂在被过滤后的行尾）。
  assert.ok(onlyReasoning.entries.some((e) => e.type === 'stopped'));
});

await test('译文呈现：成功即挂载；原样回同样挂载；失败只留补跑标记与悬停载荷', () => {
  const blocks = [{ kind: 'text', text: '这是一段已经很自然的中文。' }, { kind: 'text', text: 'tail' }];
  const outcomes = [
    { translated: '这是一段已经很自然的中文。', ok: true }, // 原样回
    { translated: '尾巴译文', ok: false, detail: 'channel timed out after 600000ms' }, // 通道伤
  ];
  const plan = planAssistantRow({ blocks, streaming: false, interrupted: false, channel: 'ready', outcomes });
  assert.equal(plan.entries[0].translated, '这是一段已经很自然的中文。');
  assert.equal(plan.entries[0].mark, 'translated', '原样回同样算翻成');
  assert.equal(plan.entries[0].showingOriginal, false, '默认读译文');
  assert.equal(plan.entries[1].translated, null, '失败的块不得显示译文');
  assert.equal(plan.entries[1].mark, 'failed');
  assert.equal(
    plan.entries[1].fail,
    'channel timed out after 600000ms',
    'fail 一句技术细节直达计划层，供悬停报因'
  );
  assert.equal(plan.entries[1].retryBusy, false, '落定的失败块：↻ 静止可点');
  const viewing = planAssistantRow({
    blocks, streaming: false, interrupted: false, channel: 'ready', outcomes,
    originalKeys: new Set([0]),
  });
  assert.equal(viewing.entries[0].mark, 'translated', '读原文不改标记：这一段仍然翻成过');
  assert.equal(viewing.entries[0].showingOriginal, true, '读原文由显示源单点承载，不再是另一种标记');
  assert.equal(viewing.entries[0].translated, '这是一段已经很自然的中文。', '读原文不抹掉已成功的结果');
  assert.equal(viewing.entries[1].showingOriginal, false, '没有译文的块没有原文态可切');
  const busy = planAssistantRow({ blocks, streaming: false, interrupted: false, channel: 'ready', outcomes, retrying: [1] });
  assert.equal(busy.entries[1].mark, 'failed', '补跑在途仍标失败：↻ 留在原地');
  assert.equal(busy.entries[1].retryBusy, true, '被点名的块：↻ 原位转圈、暂时不能重复点');
  const otherBusy = planAssistantRow({ blocks, streaming: false, interrupted: false, channel: 'ready', outcomes, retrying: [0] });
  assert.equal(otherBusy.entries[1].retryBusy, false, '没点名的失败块 ↻ 静止可点');
  const firstRun = planAssistantRow({ blocks, streaming: false, interrupted: false, channel: 'ready', outcomes, retrying: [] });
  assert.equal(firstRun.entries[1].retryBusy, false, '首跑在途（还有批没回）不得让 ↻ 转圈——用户没点过它');
  // 流式：已经写定的块（frozen=1）照常出译文，正在长的尾块保持原文、不挂任何标记。
  const streaming = planAssistantRow({ blocks, streaming: true, interrupted: false, channel: 'ready', outcomes, frozen: 1 });
  assert.equal(streaming.entries[0].translated, '这是一段已经很自然的中文。', '写定的块流式期间就出中文');
  assert.equal(streaming.entries[0].mark, 'translated', '写定的成功块带译文标记');
  assert.equal(streaming.entries[1].translated, null, '还在长的尾块保持原文');
  assert.equal(streaming.entries[1].mark, null, '还有结果位的失败块在尾块位置上也不挂标记');
  const settledStreaming = planAssistantRow({ blocks, streaming: true, interrupted: false, channel: 'ready', outcomes, frozen: 2 });
  assert.equal(settledStreaming.entries[1].mark, 'failed', '全部写定后（例如中断的行）失败标记照常挂');
  assert.equal(settledStreaming.entries[1].failKind, 'channel', '类别进计划层，供悬停与读屏换文案');
  // 设置没配好：不送请求，但同样如实标记——静默会让读者以为插件坏了。
  const unconfigured = planAssistantRow({
    blocks, streaming: false, interrupted: false, channel: 'unconfigured',
  });
  assert.equal(unconfigured.entries[0].mark, 'failed', '没配好也要如实标记，不能一声不响');
  assert.equal(unconfigured.entries[0].failKind, 'not-configured', '类别进计划层：气泡与读屏据此换文案');
  assert.match(unconfigured.entries[0].fail ?? '', /no translation request was sent/, '技术一句说清这请求根本没发');
  assert.equal(unconfigured.entries[0].translated, null, '没配好时不显示任何译文');
  assert.equal(unconfigured.entries[0].retryBusy, false, '静止可点：按钮行为不变');
  const unconfiguredStreaming = planAssistantRow({
    blocks, streaming: true, interrupted: false, channel: 'unconfigured', frozen: 1,
  });
  assert.equal(unconfiguredStreaming.entries[0].mark, 'failed', '写定的块当场标记');
  assert.equal(unconfiguredStreaming.entries[1].mark, null, '正在长的尾块仍然不挂任何东西');
  const disabled = planAssistantRow({ blocks, streaming: false, interrupted: false, channel: 'off', outcomes });
  assert.equal(disabled.entries[0].translated, null, '开关关闭时一切按原文');
  assert.equal(disabled.entries[1].mark, null, '开关关闭时失败标记也一并撤下');
});

await test('空白块不送译、不占位、永不标记', () => {
  const blocks = [
    { kind: 'text', text: '  \n ' },
    { kind: 'text', text: 'hi' },
    { kind: 'text', text: '' },
  ];
  const plan = planAssistantRow({
    blocks,
    streaming: false,
    interrupted: false,
    channel: 'ready',
    outcomes: [{ translated: '嗨', ok: true }],
  });
  assert.deepEqual(plan.texts, ['hi'], '空白块不进送译清单');
  assert.equal(plan.entries[0].mark, null, '空白块什么都不显');
  assert.equal(plan.entries[1].translated, '嗨', '非空白块按压缩后的下标对齐 outcomes');
  assert.equal(plan.entries[1].mark, 'translated');
  assert.equal(plan.entries[2].mark, null);
});

await test('未落定的块不给任何标记；行未登记同样什么都不显', () => {
  const blocks = [{ kind: 'text', text: 'one' }, { kind: 'text', text: 'two' }];
  const registered = planAssistantRow({
    blocks,
    streaming: false,
    interrupted: false,
    channel: 'ready',
    outcomes: [{ translated: '一', ok: true }, null],
  });
  assert.equal(registered.entries[0].mark, 'translated');
  assert.equal(registered.entries[1].mark, null, '还没结果的块什么都不显——没有标记、没有占位');
  const unregistered = planAssistantRow({ blocks, streaming: false, interrupted: false, channel: 'ready' });
  assert.equal(unregistered.entries[0].mark, null, '没进池就没有任何标记');
  assert.equal(unregistered.entries[0].translated, null);
  const settled = planAssistantRow({
    blocks,
    streaming: false,
    interrupted: false,
    channel: 'ready',
    outcomes: [{ translated: '一', ok: true }, { translated: 'two', ok: false, detail: 'channel timed out after 600000ms' }],
  });
  assert.equal(settled.entries[1].mark, 'failed', '落定的失败块留下补跑标记');
  assert.equal(settled.entries[1].fail, 'channel timed out after 600000ms', '细节只进悬停载荷');
  assert.equal(settled.entries[1].retryBusy, false, '落定后 ↻ 不再转圈');
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
    channel: 'ready',
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
    channel: 'ready',
  });
  const mixedKeys = mixed.entries.map((e) => e.key);
  assert.equal(new Set(mixedKeys).size, mixedKeys.length);
});

await test('reasoning 分组不送译：texts 与本组渲染的正文块同域', () => {
  const blocks = [
    { kind: 'reasoning', text: 'why' },
    { kind: 'text', text: 'what' },
  ];
  const reasoning = planAssistantRow({ blocks, streaming: false, interrupted: false, channel: 'ready', groupPart: 'reasoning' });
  assert.deepEqual(reasoning.texts, [], 'reasoning 行不渲染正文，也就不登记译文');
  const response = planAssistantRow({
    blocks,
    streaming: false,
    interrupted: false,
    channel: 'ready',
    groupPart: 'response',
    outcomes: [{ translated: '答案', ok: true }],
  });
  assert.deepEqual(response.texts, ['what']);
  assert.equal(response.entries[0].translated, '答案', 'response 行的第 0 块对齐 outcomes[0]');
});

// ---------------------------------------------------------------
// 3. 翻译池
// ---------------------------------------------------------------

await test('左缘窄带点击守卫：落在窄带上的干净点击才触发，拖选与正文点击不触发', () => {
  const hotspot = { role: 'hotspot' };
  const prose = { role: 'prose' };
  const link = { role: 'link' };
  const collapsedView = { getSelection: () => ({ isCollapsed: true, toString: () => '' }) };
  const selectingView = { getSelection: () => ({ isCollapsed: false, toString: () => '选中了一段原文' }) };

  assert.equal(
    isCleanHotspotClick({ target: hotspot, currentTarget: hotspot }, collapsedView),
    true,
    '按下与松手都在窄带上：切换' 
  );
  assert.equal(
    isCleanHotspotClick({ target: prose, currentTarget: hotspot }, collapsedView),
    false,
    '在窄带上按下、拖到正文松手：click 归公共祖先（target 不是窄带），算选字'
  );
  assert.equal(
    isCleanHotspotClick({ target: link, currentTarget: hotspot }, collapsedView),
    false,
    '落在正文内链接上的点击更不该触发切换'
  );
  assert.equal(
    isCleanHotspotClick({ target: hotspot, currentTarget: hotspot }, selectingView),
    false,
    '已有非空选区时松手：仍算选字，不切换'
  );
  assert.equal(
    isCleanHotspotClick({ target: hotspot, currentTarget: hotspot }, undefined),
    true,
    '无 window 环境（测试外）不误伤'
  );
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
    return texts.map((t) => ({ translated: '译:' + t, ok: true }));
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

await test('流式增量：新增写定的块立刻送译，已出的块不重发', async () => {
  const sent = [];
  const store = createTranslateStore(async (texts) => {
    sent.push([...texts]);
    return texts.map((t) => ({ translated: '译:' + t, ok: true }));
  });
  // 第一片：整行还在生成，只有第 0 块写完。
  store.ensure('a1', ['first'], { frozen: 1 });
  await flush();
  assert.deepEqual(store.getState('a1').outcomes[0], { translated: '译:first', ok: true });
  assert.equal(sent.length, 1, '写完的块当场发出去');

  // 第二片：第 1 块也写完了；第 2 块还在长，不算写定。
  store.ensure('a1', ['first', 'second', 'growing'], { frozen: 2 });
  await flush();
  const state = store.getState('a1');
  assert.deepEqual(sent, [['first'], ['second']], '只送新写定那一块，第 0 块不再重发');
  assert.equal(state.outcomes[0].translated, '译:first');
  assert.equal(state.outcomes[1].translated, '译:second');
  assert.equal(state.outcomes[2], null, '还在长的块没有任何结果位');
});

await test('流式增量：正在长的块内容变了不重发，同一个块写定后才送一次', async () => {
  const sent = [];
  const store = createTranslateStore(async (texts) => {
    sent.push([...texts]);
    return texts.map((t) => ({ translated: '译:' + t, ok: true }));
  });
  store.ensure('a1', ['growing'], { frozen: 0 });
  await flush();
  assert.deepEqual(sent, [], '一个字都没写定的块不发请求');

  store.ensure('a1', ['growing longer'], { frozen: 0 });
  await flush();
  assert.deepEqual(sent, [], '还在长的那一块翻来覆去都不发');

  store.ensure('a1', ['growing longer', 'next'], { frozen: 1 });
  await flush();
  assert.deepEqual(sent, [['growing longer']], '写定的那一刻才送出去，送的是最终内容');
  assert.equal(store.getState('a1').outcomes[0].translated, '译:growing longer');
});

await test('流式期间失败块照常落账，不挡住后面写定的块', async () => {
  const sent = [];
  const store = createTranslateStore(async (texts) => {
    sent.push([...texts]);
    return texts.map((t) =>
      t === 'bad'
        ? { translated: t, ok: false, detail: 'channel timed out', reason: 'channel' }
        : { translated: '译:' + t, ok: true }
    );
  });
  store.ensure('a1', ['bad'], { frozen: 1 });
  await flush();
  assert.equal(store.getState('a1').outcomes[0].ok, false);
  store.ensure('a1', ['bad', 'good'], { frozen: 2 });
  await flush();
  assert.deepEqual(sent, [['bad'], ['good']], '前一块失败不连坐，后面的块照送');
  const state = store.getState('a1');
  assert.equal(state.outcomes[0].ok, false);
  assert.equal(state.outcomes[0].detail, 'channel timed out');
  assert.equal(state.outcomes[1].translated, '译:good');
});

await test('文本换代：同键不同文本整行重新请求', async () => {
  const seen = [];
  const store = createTranslateStore(async (texts) => {
    seen.push(texts.join('|'));
    return texts.map((t) => ({ translated: '译:' + t, ok: true }));
  });
  store.ensure('a1', ['one']);
  await new Promise((r) => setTimeout(r, 0));
  store.ensure('a1', ['one changed']);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(seen, ['one', 'one changed']);
  assert.equal(store.getState('a1').outcomes[0].translated, '译:one changed');
});

await test('失败结果归一：!ok 与空译文各按原文落账；服务端 detail 原样带过', async () => {
  const store = createTranslateStore(async (texts) => [
    { translated: '坏的', ok: false, detail: 'channel timed out after 600000ms' },
    { translated: '   ', ok: true },
    { translated: 'x', ok: false },
  ]);
  store.ensure('a1', ['bad', 'blank', 'no-detail']);
  await flush();
  const state = store.getState('a1');
  assert.deepEqual(state.outcomes, [
    { translated: 'bad', ok: false, detail: 'channel timed out after 600000ms' },
    { translated: 'blank', ok: false },
    { translated: 'no-detail', ok: false },
  ]);
});

await test('行往后追加（新块写定）时，在途那一块的迟到结果按当时登记的原文落账', async () => {
  const gate = deferred();
  let first = true;
  const store = createTranslateStore(async (texts) => {
    if (first) {
      first = false;
      await gate.promise;
      return texts.map((t) => ({ translated: '旧代:' + t, ok: true }));
    }
    return texts.map((t) => ({ translated: '新代:' + t, ok: true }));
  });
  store.ensure('a1', ['one']);
  store.ensure('a1', ['one', 'two']); // 第 1 块写定，第 0 块还在飞
  await flush();
  let state = store.getState('a1');
  assert.equal(state.outcomes.length, 2);
  assert.equal(state.outcomes[1].translated, '新代:two', '新写定的块不等前面那一块');
  assert.equal(state.outcomes[0], null, '还在飞的块此刻没有结果位');
  assert.equal(state.status, 'pending', '在飞账本非空，行不算落定');

  gate.resolve();
  await flush();
  state = store.getState('a1');
  assert.equal(state.status, 'settled');
  assert.equal(state.outcomes[0].translated, '旧代:one', '内容一字未变：迟到结果接手，不重发也不丢');
  assert.equal(state.outcomes[1].translated, '新代:two');
});

await test('内容寻址：同一段原文在另一行出现直接复用，不再打通道', async () => {
  const sent = [];
  const store = createTranslateStore(async (texts) => {
    sent.push([...texts]);
    return texts.map((t) => ({ translated: '译:' + t, ok: true }));
  });
  store.ensure('a1', ['same', 'other']);
  await flush();
  store.ensure('a2', ['same']);
  await flush();
  assert.deepEqual(sent, [['same', 'other']], '第二行的同一段原文命中内容池，一个字都不发');
  assert.equal(store.getState('a2').outcomes[0].translated, '译:same');
});

await test('按块补跑：只重发点名那一块，别的块连通道都不碰', async () => {
  const sent = [];
  let failFirst = true;
  const store = createTranslateStore(async (texts) => {
    sent.push([...texts]);
    return texts.map((t) =>
      failFirst && t === 'x'
        ? { translated: t, ok: false, detail: 'channel timed out' }
        : { translated: '译:' + t, ok: true }
    );
  });
  store.ensure('a1', ['x', 'y']);
  await flush();
  assert.deepEqual(sent, [['x', 'y']]);
  assert.equal(store.getState('a1').outcomes[0].ok, false);
  assert.equal(store.getState('a1').outcomes[1].translated, '译:y');

  failFirst = false;
  assert.equal(store.ensure('a1', ['x', 'y'], { retries: [0] }), true, '手点 ↻ 是唯一的补跑入口');
  const mid = store.getState('a1');
  assert.deepEqual(mid.retrying, [0], '只有被点名的那一块的 ↻ 转圈');
  assert.equal(mid.outcomes[1].translated, '译:y', '成功的块原地不动，连请求都不再发');
  await flush();
  assert.deepEqual(sent, [['x', 'y'], ['x']], '补跑只送点名那一块');
  assert.equal(store.getState('a1').outcomes[0].translated, '译:x');
  assert.deepEqual(store.getState('a1').retrying, []);
});

await test('交接失败：每一块各自带原因落账，互不覆盖', async () => {
  const results = {
    a: { ok: true, translated: '译:a' },
    b: { ok: false, detail: 'channel timed out after 600000ms' },
    c: { ok: false, detail: 'OPENAI_API_KEY missing', reason: 'not-configured' },
  };
  const store = createTranslateStore(async (texts) =>
    texts.map((t) => ({ translated: t, ...results[t] }))
  );
  store.ensure('a1', ['a', 'b', 'c']);
  await flush();
  const outcomes = store.getState('a1').outcomes;
  assert.equal(outcomes[0].ok, true);
  assert.deepEqual(outcomes[1], { translated: 'b', ok: false, detail: 'channel timed out after 600000ms' });
  assert.deepEqual(outcomes[2], { translated: 'c', ok: false, detail: 'OPENAI_API_KEY missing', reason: 'not-configured' });
});

await test('请求异常按失败处理：行落 settled、块标失败但说不出细节', async () => {
  const store = createTranslateStore(async () => {
    throw new Error('boom');
  });
  store.ensure('a1', ['x']);
  await flush();
  const state = store.getState('a1');
  assert.equal(state.status, 'settled', '落定即终态：没有自动补跑在等它');
  assert.equal(state.outcomes[0].ok, false);
  assert.equal(state.outcomes[0].detail, undefined, '取数面抛错说不出细节');
});

await test('落定行自动 ensure 短路；手点 ↻ 只重发失败块，成功块不闪', async () => {
  let calls = 0;
  let failSecond = true;
  const store = createTranslateStore(async (texts) => {
    calls++;
    return texts.map((t, i) =>
      failSecond && i === 1
        ? { translated: t, ok: false, detail: 'channel timed out' }
        : { translated: '译:' + t, ok: true }
    );
  });
  store.ensure('a1', ['x', 'y']);
  await flush();
  assert.equal(store.getState('a1').status, 'settled');
  assert.equal(store.getState('a1').outcomes[1].detail, 'channel timed out');

  assert.equal(store.ensure('a1', ['x', 'y']), false, '自动 ensure 短路——滚动不再触发任何重走');
  assert.equal(calls, 1, '落定行没有被池再次打通道（首跑就那一次批请求）');

  failSecond = false;
  assert.equal(store.ensure('a1', ['x', 'y'], { retries: [1] }), true, '手点 ↻ 是唯一的补跑入口');
  const mid = store.getState('a1');
  assert.equal(mid.status, 'pending');
  assert.deepEqual(mid.retrying, [1], '只有手点的那一块的 ↻ 转圈');
  assert.equal(mid.outcomes[0].translated, '译:x', '补跑瞬间已成功块原样留着，译文不闪');
  assert.equal(mid.outcomes[1].ok, false, '被点名的块保留上一次的失败结果——↻ 因此不消失，只原位转圈');
  assert.equal(mid.outcomes[1].detail, 'channel timed out', '在途标签照旧报得出败因');
  await flush();
  const done = store.getState('a1');
  assert.equal(done.status, 'settled');
  assert.deepEqual(done.retrying, [], '落定后不再转圈');
  assert.equal(done.outcomes[1].translated, '译:y');
});

await test('手点补跑无限次：落定→补跑→再落定→再补跑，每次都真发', async () => {
  let calls = 0;
  const store = createTranslateStore(async (texts) => {
    calls++;
    return texts.map((t) => ({ translated: t, ok: false }));
  });
  store.ensure('a1', ['x']);
  await flush();
  for (let round = 0; round < 5; round++) {
    assert.equal(
      store.ensure('a1', ['x'], { retries: [0] }),
      true,
      '第 ' + (round + 1) + ' 次手点必须重发，没有额度封顶'
    );
    await flush();
  }
  assert.equal(calls, 6);
  assert.equal(store.getState('a1').status, 'settled');
});

await test('在途时再点（含 ↻）是空操作：↻ 转着圈就是「已在跑」的答复', async () => {
  const gate = deferred();
  let calls = 0;
  const store = createTranslateStore(async (texts) => {
    calls++;
    await gate.promise;
    return texts.map((t) => ({ translated: '译:' + t, ok: true }));
  });
  store.ensure('a1', ['x']);
  assert.equal(store.ensure('a1', ['x'], { retries: [0] }), false, '在途的块连手点都不重发');
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
    return texts.map((t) => ({ translated: '译:' + t.slice(0, 8), ok: true }));
  });
  store.ensure('a1', ['first', big]);
  await new Promise((r) => setTimeout(r, 0));
  gates[0].resolve();
  await new Promise((r) => setTimeout(r, 0));
  let state = store.getState('a1');
  assert.equal(state.status, 'pending', '还有批在途');
  assert.equal(state.outcomes[0].translated, '译:first', '第一批落定即可渲染');
  assert.equal(state.outcomes[1], null, '第二批未回仍是空位（该块暂无标记）');
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
    return batch.map((t) => ({ translated: '译:' + t, ok: true }));
  });
  store.ensure('a1', ['good1', big, 'bad', 'good2']);
  await flush();
  await flush();
  await flush();
  const state = store.getState('a1');
  assert.equal(state.status, 'settled');
  // 切批结果：[good1] / [big] / [bad, good2]（bad 与 good2 余量同批）。
  // 死批整批败（含同批的 good2——失败面就是批），前后两批不受牵连。
  assert.deepEqual(state.outcomes.map((o) => [o.translated, o.ok, o.detail]), [
    ['译:good1', true, undefined],
    ['译:' + big, true, undefined],
    ['bad', false, undefined],
    ['good2', false, undefined],
  ]);
});

await test('行数 LRU 上限：超出后淘汰最久未读的行', () => {
  const store = createTranslateStore(async (texts) =>
    texts.map((t) => ({ translated: '译:' + t, ok: true }))
  );
  for (let i = 0; i < 260; i++) store.ensure('row' + i, ['t' + i]);
  assert.equal(store.getState('row0'), undefined, '最早登记的行应被淘汰');
  assert.ok(store.getState('row259'), '最新行保留在池内');
});

// ---------------------------------------------------------------
// 4. 呈现策略
// ---------------------------------------------------------------

await test('策略映射与宿主一致：compact 不预览，其余模式与 legacy 值都预览', () => {
  assert.equal(policyForMode('compact').settledReasoningPreview, false, 'compact 不预览首行');
  assert.equal(policyForMode('standard').settledReasoningPreview, true);
  assert.equal(policyForMode('detailed').settledReasoningPreview, true);
  assert.equal(policyForMode('verbose').settledReasoningPreview, true);
  assert.equal(policyForMode('normal').settledReasoningPreview, true, 'legacy normal 按 standard 读');
  assert.equal(policyForMode('expanded').settledReasoningPreview, true, 'legacy expanded 按 detailed 读');
  assert.equal(policyForMode('unrecognized').settledReasoningPreview, true, '未识别的值按 standard 读');
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
  assert.equal(fallback.getSnapshot(), policyForMode('standard'));
});

// ---------------------------------------------------------------
// 5. 正文左缘：没有任何线标。成功块的切换归一条 6px 透明窄带（正文位置不动），
//    失败块归一个真 ↻ 按钮（补跑在途原位转圈）。
// ---------------------------------------------------------------

await test('标记名单点：只有成功/失败两种，正文里不存在任何线型与缩进规则', () => {
  assert.equal(proseClassNames(null), undefined, '没翻成的块没有任何标记类');
  assert.match(proseClassNames('translated'), /dsh-ct-prose dsh-ct-prose-translated/);
  assert.match(proseClassNames('failed'), /dsh-ct-prose dsh-ct-prose-failed/);
  assert.equal(PROSE_BASE_CLASS, 'dsh-ct-prose', '每块都挂定位父级类');
  assert.ok(!ASSISTANT_CSS.includes('dsh-ct-toolbar'), '悬浮工具条整体退场：正文之外只剩窄带与 ↻');
  assert.ok(!ASSISTANT_CSS.includes('border-left'), '样式表里一根竖线都不留');
  assert.ok(!ASSISTANT_CSS.includes('prose-indent'), '缩进规则整体退场');
  assert.ok(!ASSISTANT_CSS.includes('padding-left:12px'), '不再给正文补 12px');
  assert.ok(!ASSISTANT_CSS.includes('prose-inflight'), '在途视觉标记退场');
  assert.ok(!ASSISTANT_CSS.includes('dsh-ct-prose-original'), '「备着译文的原文」不再是独立标记');
});

await test('动作单点：mark 唯一决定 toggle / retry / 没有可点物', () => {
  assert.equal(proseAction('translated'), 'toggle', '有译文：窄带在译文与原文间切换');
  assert.equal(proseAction('failed'), 'retry', '失败：只有 ↻ 能点，整行补跑');
  assert.equal(proseAction(null), null, '没有结果：左缘没有任何可点物');
});

await test('窄带几何：宽 10px，整条落在正文左缘之外', () => {
  assert.match(
    ASSISTANT_CSS,
    /\.dsh-ct-hotspot\{position:absolute;left:-10px;top:0;bottom:0;width:10px;margin:0;padding:0;border:0;background:0 0;cursor:pointer;z-index:2/,
    '窄带从 -10px 起、宽 10px：整条贴在正文左缘外侧，一个字都不压'
  );
  assert.match(
    ASSISTANT_CSS,
    /\.dsh-ct-hotspot:focus-visible\{outline:none\}/,
    '键盘聚焦不给任何可见标记'
  );
  assert.ok(!ASSISTANT_CSS.includes('data-idle'), '旧的在途空操作态退场');
});

await test('↻ 是真按钮：常驻、可点、在途转圈且按下去无事可做', () => {
  assert.match(
    ASSISTANT_CSS,
    /\.dsh-ct-retry\{position:absolute;[^}]*cursor:pointer/,
    '↻ 自己是点击目标（失败段没有窄带）'
  );
  assert.equal(RETRY_CLASS, 'dsh-ct-retry');
  assert.equal(RETRY_BUSY_ATTR, 'data-busy', '在途态挂在同一个节点上，不重挂载');
  assert.match(
    ASSISTANT_CSS,
    new RegExp(`\\.dsh-ct-retry\\[data-busy\\] \\.[a-z-]*spin\\{animation:`),
    '在途：↻ 原地转圈'
  );
  assert.match(ASSISTANT_CSS, /@keyframes dsh-ct-retry-spin/, '转圈动画有名字，便于 reduced-motion 关掉');
  assert.match(
    ASSISTANT_CSS,
    /\.dsh-ct-retry:focus-visible\{outline:none\}/,
    '键盘聚焦 ↻ 同样不给可见标记（与窄带一致）'
  );
  assert.match(
    ASSISTANT_CSS,
    /@media \(prefers-reduced-motion:reduce\)\{\.dsh-ct-retry-spin\{animation:none\}\.dsh-ct-retry\[data-busy\]\{opacity:\.45\}\}/,
    'reduced-motion 降级：不转圈，但「按下去没用」仍看得见（静态变淡）'
  );
});

await test('窄带的悬停文案单点：读译文报「查看原文」，读原文报「查看译文」', async () => {
  const fs = await import('node:fs/promises');
  const url = await import('node:url');
  const path = await import('node:path');
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const source = await fs.readFile(path.join(here, '..', 'src', 'client', 'chat', 'assistant-step.tsx'), 'utf-8');
  // 悬停文案直接取自同一对本命名空间的文案键（与读屏标签同源），所以断言
  // 「渲染器按显示源二选一」，并钉住这两个键在词典里的中文。
  assert.match(
    source,
    /createPortal\(\s*React\.createElement\(\s*'span',\s*\{[^}]*className: HINT_BUBBLE_CLASS[^}]*\},\s*showingOriginal \? copy\.hotspotShowTranslation : copy\.hotspotShowOriginal/,
    '窄带的悬停气泡必须跟着当前显示源翻面'
  );
  const locales = await fs.readFile(path.join(here, '..', 'src', 'client', 'locales.ts'), 'utf-8');
  assert.match(locales, /hotspotShowOriginal: '查看原文'/);
  assert.match(locales, /hotspotShowTranslation: '查看译文'/);
});

await test('悬停气泡：投在 body 下的固定浮层，取宿主 Tooltip 的同款令牌', () => {
  assert.equal(HINT_BUBBLE_CLASS, 'dsh-ct-hint');
  assert.match(
    ASSISTANT_CSS,
    /\.dsh-ct-hint\{position:fixed;z-index:1100;width:max-content;max-width:50vw;margin:0;padding:3px 7px;border:0;border-radius:var\(--dsw-radius-sm\);background:var\(--dsw-alias-tooltip-bg\);color:var\(--dsw-static-neutral-bluish-00\);font-size:13px;line-height:20px;white-space:pre-line;overflow-wrap:break-word;pointer-events:none;visibility:hidden;transform:translateY\(-50%\)\}/,
    '气泡是固定定位的浮层：与宿主气泡同款尺寸与令牌，不接指针事件，默认收起'
  );
  assert.match(
    ASSISTANT_CSS,
    /\.dsh-ct-hint\[data-side=left\]\{transform:translate\(-100%,-50%\)\}/,
    '右边放不下时翻到光标左边：往左让开自身宽度'
  );
  assert.match(
    ASSISTANT_CSS,
    /\.dsh-ct-hint\[data-visible\]\{visibility:visible;animation:150ms var\(--ds-ease-in-out\) dsh-ct-hint-in\}/,
    '悬停才显形，并按宿主气泡的时长与缓动淡入'
  );
  assert.match(
    ASSISTANT_CSS,
    /@media \(prefers-reduced-motion:reduce\)\{\.dsh-ct-hint\[data-visible\]\{animation:none\}\}/,
    'reduced-motion：不淡入，气泡照常显形'
  );
  assert.ok(!/dsh-ct-hint\{[^}]*pointer-events:auto/.test(ASSISTANT_CSS), '气泡永不接指针：鼠标始终归那条窄带');
});

await test('防回归：自动重试面不存在——额度常量不得复活', () => {
  assert.equal('MAX_ROW_ATTEMPTS' in storeModule, false);
});

console.log('');
console.log('chat-translate: ' + passed + '/' + total + ' 通过');
process.exit(passed === total ? 0 : 1);
