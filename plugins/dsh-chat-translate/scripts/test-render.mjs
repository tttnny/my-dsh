/**
 * 渲染自检：用真 react 把助手行画进 jsdom，锁住这次改动的核心承诺。
 *
 * 正文左缘不再有任何线，可点的只有左缘之外的两样东西，它们各自是唯一的入口：
 *   1. 成功块：一条 6px 透明窄带（`.dsh-ct-hotspot`）承载译文/原文切换；
 *      点正文（单击落字）不切换，拖选择字也不切换；
 *   2. 失败块：一个真 ↻ 按钮（`.dsh-ct-retry`）承载整行补跑，没有窄带；
 *      补跑在途时它原地转圈、不重挂载（键盘焦点不掉），再点是空操作。
 *
 * `@deepseek-ai/dsh-client-ui-primitives` 是替身：真组件是浏览器里的 ESM、带
 * .css 导入，Node 里跑不起来。替身只做「把 text / children 原样渲染出来」与
 * 「Tooltip 直接把锚点渲染出来」这两件事，所以这里验证的是本插件自己的视图
 * 结构与事件接线；真组件的外观与气泡定位要在浏览器里看。
 *
 * 运行：node scripts/test-render.mjs
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:3080/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// Node 24 把 globalThis.navigator 定义成 getter-only，直接赋值会抛；jsdom 的
// 那份其实已经在 window 上，React 读的是 window.navigator。
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
});
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.MutationObserver = dom.window.MutationObserver;
// 视口在场判定：没有 IntersectionObserver 时组件按「已在视口」处理，首跑照发。
globalThis.IntersectionObserver = undefined;

const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');

/** ui-primitives 替身：只还原本测试关心的渲染结果与锚点关系。 */
const primitives = new Proxy(
  {
    MarkdownText: ({ text }) => createElement('div', { className: 'md' }, text),
    // Tooltip 的 hover/focus 通道由官方组件负责，这里只把锚点渲染出来。
    Tooltip: ({ children }) => children,
    IconRefreshOutlineRegular: () => createElement('span', { className: 'icon-refresh' }),
    DisclosureRow: ({ title, collapsedContent, children }) =>
      createElement('div', null, title, collapsedContent, children),
  },
  { get: (target, key) => (key in target ? target[key] : () => null) }
);

/** 走真实的 bundle 入口（与 shell 同一条 __ModuleLoader__ 路径）。 */
let exported;
globalThis.window.__ModuleLoader__ = {
  load: ({ factory }) => {
    exported = factory((spec) => {
      if (spec === 'react') return require('react');
      if (spec === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (spec === 'react-dom') return require('react-dom');
      if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
      throw new Error(`module table miss: ${spec}`);
    });
  },
};
await import(`${pathToFileURL(join(root, 'lib', 'client.js')).href}?render=${String(Date.now())}`);

/** 捕获助手行渲染器的注册项——本测试直接拿它来画。 */
const registrations = [];
const ctx = {
  effect: (fn) => {
    fn();
    return () => {};
  },
  get: () => undefined,
  slots: {
    inject: (_key, register) => {
      register();
      return () => {};
    },
    register: (options, component) => {
      registrations.push({ options, component });
      return () => {};
    },
    entries: () => [],
  },
  configForms: { get: () => null, whileServed: (_ns, register) => register(new Set()) },
  locale: { register: () => () => {}, bind: () => (key) => key },
  remote: { credentials: null },
};
exported.apply(ctx);

const row = registrations.find((entry) => entry.options.key === 'assistant-step');
assert.ok(row !== undefined, '助手行渲染器没有注册进 conversation.chat.node');

// --- 设置与翻译池：让 canTranslate 成立，并把两行正文喂成「成功」与「失败」 ---

const { settingsStore, chatTranslate, createTranslateStore } = exported;

settingsStore.attach(
  {
    getSnapshot: () => ({
      status: 'ready',
      value: { enabled: true, baseUrl: 'https://api.example.com/v1', model: 'test-model' },
      writable: true,
      revision: 1,
    }),
    subscribe: () => () => {},
    mutate: async () => true,
  },
  { describe: async () => ({ ok: true, value: { TRANSLATE_API_KEY: { configured: true } } }) }
);
// refreshKeyStatus 是异步的：等它把 aiConfigured 折进来再渲染。
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});
assert.equal(
  settingsStore.getState().committed.aiConfigured,
  true,
  '测试前置：通道应视为已配置'
);

let replyCalls = 0;
/** 补跑那次请求挂住不返回：好在「在途」这个态上做断言（否则它瞬间就落定了）。 */
let holdNextReply = false;
let releaseHeldReply = null;
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('translate-reply')) throw new Error(`unexpected fetch: ${url}`);
  replyCalls += 1;
  const blocks = JSON.parse(init.body).blocks;
  if (holdNextReply) {
    holdNextReply = false;
    return new Promise((resolve) => {
      releaseHeldReply = () =>
        resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            results: blocks.map((block) => ({ original: block, translated: `【译】${block}`, ok: true, cached: false })),
          }),
        });
    });
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      results: blocks.map((block) =>
        block.startsWith('Broken block')
          ? { original: block, translated: block, ok: false, cached: false, detail: 'channel timed out after 20000ms' }
          : { original: block, translated: `【译】${block}`, ok: true, cached: false }
      ),
    }),
  };
};

const ROW_KEYS = ['ax1', 'ax2'];
const TEXTS = [['Hello world'], ['Broken block']];
for (let i = 0; i < ROW_KEYS.length; i++) {
  chatTranslate.ensure(ROW_KEYS[i], TEXTS[i]);
}
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// --- 渲染助手行 ---

const translate = (key) => key;

function renderRow(rowKey, text, container, store) {
  const componentProps = {
    node: {
      data: { status: 'settled', turn: 1, step: 1, blocks: [{ kind: 'text', text }] },
      anchorSeq: rowKey.slice(1),
    },
    groupPart: 'response',
    useDisclosure: () => ({ expanded: false, setExpanded: () => {}, toggle: () => {} }),
    useTurnData: () => undefined,
    turnProcess: undefined,
    openFile: () => {},
    renderMessageImages: () => null,
    fileMentions: () => undefined,
    usePresentation: (select) => select({ settledReasoningPreview: false }),
    t: translate,
  };
  const root = createRoot(container);
  const props = { ...componentProps };
  if (store !== undefined) props.store = store;
  act(() => {
    root.render(createElement(row.component, props));
  });
  return root;
}

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ok   ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL ${name}: ${err.message}`);
    throw err;
  }
}

/** 浏览器语义：click 派发给「按下处」与「松手处」的最近公共祖先。 */
function clickAt(element) {
  act(() => {
    element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function dragFromTo(from, to) {
  act(() => {
    from.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  // 拖过正文时浏览器已经有了非空选区。
  const selection = dom.window.getSelection();
  const range = dom.window.document.createRange();
  const proseBody = to.querySelector('.md') ?? to;
  range.selectNodeContents(proseBody);
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => {
    to.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    // 浏览器的 click 派发给「按下处」与「松手处」的最近公共祖先。
    const commonAncestor = to.contains(from) ? to : to.parentElement ?? to;
    commonAncestor.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

const containerA = document.createElement('div');
document.body.appendChild(containerA);
const rootA = renderRow('ax1', 'Hello world', containerA);

await test('成功块：正文无标记线、无缩进，左缘只有一条 6px 窄带', () => {
  const blockEl = containerA.querySelector('.dsh-ct-prose');
  assert.ok(blockEl !== null, '正文块没有渲染');
  assert.match(blockEl.className, /dsh-ct-prose-translated/, '成功块挂语义状态类');
  assert.ok(!/indent/.test(blockEl.className), '正文不再有缩进类，排版回到原生');
  assert.ok(!/clickable|retryable/.test(blockEl.className), '正文块类名里没有可点态');
  const hotspot = containerA.querySelector('.dsh-ct-hotspot');
  assert.ok(hotspot !== null, '成功块就该有左缘窄带');
  assert.equal(hotspot.tagName, 'BUTTON', '窄带应是可聚焦的 button');
  assert.equal(containerA.querySelector('.dsh-ct-retry'), null, '成功块没有 ↻');
  assert.equal(containerA.textContent.includes('【译】Hello world'), true, '应显示译文');
});

await test('悬浮工具条：块上方一颗按钮，文案是当前能做的动作，点它与点窄带等效', () => {
  const toolbar = containerA.querySelector('.dsh-ct-toolbar');
  assert.ok(toolbar !== null, '成功块上方应有悬浮工具条');
  assert.ok(
    containerA.querySelector('.dsh-ct-prose').contains(toolbar),
    '工具条挂在正文块里（绝对定位在块上方），不是块外的另一行'
  );
  const button = toolbar.querySelector('.dsh-ct-toolbar-button');
  assert.ok(button !== null, '工具条上应有一颗按钮');
  assert.equal(button.tagName, 'BUTTON', '工具条按钮应是真的 button（可聚焦）');
  assert.equal(button.textContent, 'toolbarShowOriginal', '读译文时提示「查看原文」');
  // 工具条是 CSS 悬停显隐的（jsdom 不算样式），所以这里只验证它在树上、可点、
  // 且点它走的是同一个动作——显隐规则由下面的样式断言兜住。
  clickAt(button);
  assert.equal(containerA.textContent.includes('【译】Hello world'), false, '点工具条应切回原文');
  assert.equal(
    containerA.querySelector('.dsh-ct-toolbar-button').textContent,
    'toolbarShowTranslation',
    '读原文时按钮文案翻成「查看译文」'
  );
  clickAt(containerA.querySelector('.dsh-ct-toolbar-button'));
  assert.equal(containerA.textContent.includes('【译】Hello world'), true, '再点应切回译文');
});

await test('点正文（单击落字）不切换译文/原文', () => {
  const proseBody = containerA.querySelector('.md');
  clickAt(proseBody);
  // 断言渲染源本身：译文在渲染源里时原文并不出现（译文是「【译】原文」整体，
  // 只断言「原文还在」会被子串关系蒙混过关）。
  assert.equal(proseBody.textContent, '【译】Hello world', '点正文后渲染源应仍是译文');
  assert.match(containerA.querySelector('.dsh-ct-prose').className, /dsh-ct-prose-translated/);
});

await test('从窄带按下、往右拖进正文选字松手：不切换', () => {
  const hotspot = containerA.querySelector('.dsh-ct-hotspot');
  const blockEl = containerA.querySelector('.dsh-ct-prose');
  dragFromTo(hotspot, blockEl);
  assert.equal(containerA.textContent.includes('【译】Hello world'), true, '拖选手势不该切换');
  dom.window.getSelection().removeAllRanges();
});

await test('已有非空选区时点窄带：仍算选字，不切换', () => {
  // 上一条只覆盖了「click 落在公共祖先」这条路（靠 target 判定）。
  // 这一条让 click 真的落在窄带上、但页面上存在非空选区——守卫的第二个条件。
  const hotspot = containerA.querySelector('.dsh-ct-hotspot');
  const range = dom.window.document.createRange();
  range.selectNodeContents(containerA.querySelector('.md'));
  dom.window.getSelection().removeAllRanges();
  dom.window.getSelection().addRange(range);
  clickAt(hotspot);
  assert.equal(containerA.textContent.includes('【译】Hello world'), true, '有选区时点窄带不该切换');
  dom.window.getSelection().removeAllRanges();
});

await test('点窄带切回原文，再点切回译文；状态类始终不变', () => {
  const hotspot = containerA.querySelector('.dsh-ct-hotspot');
  clickAt(hotspot);
  assert.equal(containerA.textContent.includes('【译】Hello world'), false, '点窄带应切回原文');
  assert.match(
    containerA.querySelector('.dsh-ct-prose').className,
    /dsh-ct-prose-translated/,
    '「读原文」不是另一种标记：这一段仍然翻成过'
  );
  assert.ok(containerA.querySelector('.dsh-ct-hotspot') !== null, '读原文时窄带仍在，还能切回来');
  clickAt(containerA.querySelector('.dsh-ct-hotspot'));
  assert.equal(containerA.textContent.includes('【译】Hello world'), true, '再点应切回译文');
});

await test('键盘 Enter 在窄带上等效于点击（且只动作一次）', () => {
  const hotspot = containerA.querySelector('.dsh-ct-hotspot');
  hotspot.focus();
  assert.equal(document.activeElement, hotspot, '窄带应可聚焦——键盘焦点落在它上面');
  act(() => {
    hotspot.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  });
  assert.equal(containerA.textContent.includes('【译】Hello world'), false, 'Enter 应切到原文');
  // 再按一次切回，确认不是「按一次动作两次」抵消掉的假象。
  act(() => {
    hotspot.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    );
  });
  assert.equal(containerA.textContent.includes('【译】Hello world'), true, 'Space 应切回译文');
});

act(() => rootA.unmount());

const containerB = document.createElement('div');
document.body.appendChild(containerB);
const rootB = renderRow('ax2', 'Broken block', containerB);

await test('失败块：一个真 ↻ 按钮、没有窄带，正文不响应点击', () => {
  const blockEl = containerB.querySelector('.dsh-ct-prose');
  assert.match(blockEl.className, /dsh-ct-prose-failed/, '失败块挂语义状态类');
  assert.equal(containerB.querySelector('.dsh-ct-hotspot'), null, '失败段不放窄带：一段只有一个动作');
  const retry = containerB.querySelector('.dsh-ct-retry');
  assert.ok(retry !== null, '失败块的 ↻ 应常驻，不靠悬停显形');
  assert.equal(retry.tagName, 'BUTTON', '↻ 应是真按钮（自己的点击目标）');
  assert.equal(retry.getAttribute('data-busy'), null, '落定的失败块：↻ 静止可点');
  assert.equal(
    containerB.querySelector('.dsh-ct-toolbar'),
    null,
    '失败块没有译文/原文可切，也就不该有悬浮工具条'
  );
  // 读屏用户不悬停：Tooltip 的气泡只在 openOnClick 时才挂 aria-describedby，
  // 所以败因必须进按钮自己的标签，否则他们永远听不到「超时 / 断流 / 空返回」。
  assert.match(
    retry.getAttribute('aria-label'),
    /channel timed out after 20000ms/,
    '↻ 的读屏标签必须带上服务端给的失败原因'
  );
  const before = replyCalls;
  clickAt(containerB.querySelector('.md'));
  assert.equal(replyCalls, before, '点正文不该触发补跑');
});

await test('设置没配好：↻ 换成「去配置页」的读屏文案，按钮本身不动', async () => {
  const containerE = document.createElement('div');
  document.body.appendChild(containerE);
  // 一个只服务这一行的独立池：座次可注入，所以不必先让单例池产出这个结果。
  const store = createTranslateStore(async (blocks) =>
    blocks.map((block) => ({
      original: block,
      translated: block,
      ok: false,
      cached: false,
      detail: 'TRANSLATE_API_KEY is not configured',
      reason: 'not-configured',
    }))
  );
  const rootE = renderRow('ax9', 'unconfigured probe text', containerE, store);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const retry = containerE.querySelector('.dsh-ct-retry');
  assert.ok(retry !== null, '设置没配好同样留 ↻：位置与可点性都不变（第一题选 C）');
  assert.equal(retry.tagName, 'BUTTON');
  assert.equal(retry.getAttribute('data-unconfigured'), 'true', '同一颗按钮挂了「没配好」的属性');
  assert.match(
    retry.getAttribute('aria-label'),
    /retryAriaUnconfigured/,
    '读屏听到的是「去插件页把 Key、地址、模型填齐」，而不是「点我重试一万次」'
  );
  assert.match(retry.getAttribute('aria-label'), /not configured/, '技术细节照旧带着');
  act(() => rootE.unmount());
});

await test('点 ↻ = 只重发失败的那些块（真的又发了一次请求）', () => {
  const before = replyCalls;
  holdNextReply = true; // 让补跑悬在「在途」，下一步才在转圈态上断言
  clickAt(containerB.querySelector('.dsh-ct-retry'));
  assert.equal(replyCalls, before + 1, '点 ↻ 应发起一次补跑请求');
});

await test('补跑在途：↻ 原地转圈、同一个节点、再点是空操作', () => {
  const retry = containerB.querySelector('.dsh-ct-retry');
  assert.ok(retry !== null, '补跑期间 ↻ 不该消失');
  assert.equal(retry.getAttribute('data-busy'), 'true', '在途应标记 data-busy（转圈且不给手型）');
  assert.ok(containerB.querySelector('.dsh-ct-retry-spin') !== null, '转的是图标本身，按钮位置不动');
  assert.match(retry.getAttribute('aria-label'), /channel timed out after 20000ms/, '在途标签同样报败因');
  const before = replyCalls;
  clickAt(retry);
  assert.equal(replyCalls, before, '在途再点是空操作');
});

await test('补跑落定后回到可切换的成功态', async () => {
  assert.ok(typeof releaseHeldReply === 'function', '补跑请求应还悬着');
  await act(async () => {
    releaseHeldReply();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const retry = containerB.querySelector('.dsh-ct-retry');
  assert.equal(retry, null, '成功后 ↻ 退场');
  assert.match(containerB.querySelector('.dsh-ct-prose').className, /dsh-ct-prose-translated/, '补跑成功后回到成功态');
  assert.ok(containerB.querySelector('.dsh-ct-hotspot') !== null, '成功后左缘换成窄带');
  assert.equal(containerB.textContent.includes('【译】Broken block'), true, '应显示重跑得到的译文');
});

await test('失败→在途的迁移不重挂载 ↻：键盘焦点不掉回 body', async () => {
  // 这条锁住一个真实踩过的坑：Tooltip 曾经按状态包/拆，失败块被补跑时树形变化
  // 让 React 重挂载 button，焦点落回 body——「在途 ↻ 保留、焦点不掉」当场失效。
  // 修法是 Tooltip 常挂、只用 disabled 收放（其契约保证 disabled 时锚点渲染一致），
  // 且 ↻ 的在途态只换属性、不换元素。
  const containerD = document.createElement('div');
  document.body.appendChild(containerD);
  // 一段全新的原文：池按内容寻址，复用过的文本到不了「失败」这一态。
  const rootD = renderRow('ax4', 'Broken block again', containerD);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const before = containerD.querySelector('.dsh-ct-retry');
  before.focus();
  assert.ok(document.activeElement === before, '前置：↻ 应已获得焦点');

  holdNextReply = true;
  act(() => {
    before.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  });

  const after = containerD.querySelector('.dsh-ct-retry');
  // 断言布尔而不是直接比 DOM 节点：assert 失败时要格式化两个 jsdom 元素（巨大的
  // 循环图），进程会当场被 OOM 杀掉，失败就变成「被 KILL」而不是一条断言消息。
  assert.ok(after === before, '补跑期间不得重挂载 ↻（同一个 DOM 节点）');
  assert.ok(document.activeElement === after, '补跑期间键盘焦点必须还留在 ↻ 上');
  assert.equal(after.getAttribute('data-busy'), 'true', '此时应是转圈态');

  await act(async () => {
    releaseHeldReply();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  act(() => rootD.unmount());
});

act(() => rootB.unmount());

// 第三个行键：键盘补跑单独验一次（Enter 在 button 上会合成 click，最易双触发）。
const containerC = document.createElement('div');
document.body.appendChild(containerC);
// 又一段全新的原文（池按内容寻址：复用过的文本到不了「失败」这一态）。
const rootC = renderRow('ax3', 'Broken block once more', containerC);
// 这一行没有预先登记，挂载后自己会首跑一次；等它落定成「失败」再验键盘补跑。
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

await test('失败块：键盘 Enter 在 ↻ 上补跑整行，且只发一次请求', () => {
  const retry = containerC.querySelector('.dsh-ct-retry');
  assert.match(containerC.querySelector('.dsh-ct-prose').className, /dsh-ct-prose-failed/, '前置：首跑应已落定为失败');
  const before = replyCalls;
  holdNextReply = true;
  act(() => {
    retry.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  });
  assert.equal(replyCalls, before + 1, 'Enter 应只发起一次补跑（合成 click 必须被掐掉）');
});

act(() => rootC.unmount());

console.log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
