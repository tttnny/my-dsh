/**
 * 渲染自检：用真 react 把助手行画进 jsdom，锁住这次改动的核心承诺。
 *
 * 「点正文不切换、点左缘才切换」过去只被类名字符串间接锁着——onClick 挂在
 * 正文容器上还是挂在别处，字符串断言看不出来，重构时能被悄悄改回去。这里走
 * 真渲染 + 真事件派发，断言四条：
 *   1. 点正文（单击落字）不切换译文/原文；
 *   2. 点左缘那条窄热区才切换；
 *   3. 在热区按下、往右拖进正文再松手（选字手势）不切换；
 *   4. 点失败块的热区 = 整行补跑（真的又发了一次请求）。
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

const { settingsStore, chatTranslate } = exported;

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
assert.equal(settingsStore.getState().aiConfigured, true, '测试前置：通道应视为已配置');

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
        block === 'Broken block'
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

function renderRow(rowKey, text, container) {
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
  act(() => {
    root.render(createElement(row.component, componentProps));
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

await test('读译文：正文块与左缘热区同时在场，正文不再是点击目标', () => {
  const blockEl = containerA.querySelector('.dsh-ct-prose');
  assert.ok(blockEl !== null, '正文块没有渲染');
  assert.match(blockEl.className, /dsh-ct-prose-translated/, '成功块应挂蓝线类');
  assert.match(blockEl.className, /dsh-ct-prose-indent/, '可翻译时正文块应统一缩进');
  assert.ok(!/clickable/.test(blockEl.className), '正文块类名里不该有可点态');
  const hotspot = containerA.querySelector('.dsh-ct-hotspot');
  assert.ok(hotspot !== null, '有线就该有左缘热区');
  assert.equal(hotspot.tagName, 'BUTTON', '热区应是可聚焦的 button');
  assert.match(blockEl.className, /dsh-ct-prose-translated/, '热区状态应与线型一致：读译文');
  assert.equal(containerA.textContent.includes('【译】Hello world'), true, '应显示译文');
});

await test('点正文（单击落字）不切换译文/原文', () => {
  const proseBody = containerA.querySelector('.md');
  clickAt(proseBody);
  // 断言渲染源本身：译文在渲染源里时原文并不出现（译文是「【译】原文」整体，
  // 只断言「原文还在」会被子串关系蒙混过关）。
  assert.equal(proseBody.textContent, '【译】Hello world', '点正文后渲染源应仍是译文');
  assert.match(containerA.querySelector('.dsh-ct-prose').className, /dsh-ct-prose-translated/);
});

await test('从热区按下、往右拖进正文选字松手：不切换', () => {
  const hotspot = containerA.querySelector('.dsh-ct-hotspot');
  const blockEl = containerA.querySelector('.dsh-ct-prose');
  dragFromTo(hotspot, blockEl);
  assert.equal(containerA.textContent.includes('【译】Hello world'), true, '拖选手势不该切换');
  dom.window.getSelection().removeAllRanges();
});

await test('已有非空选区时点热区：仍算选字，不切换', () => {
  // 上一条只覆盖了「click 落在公共祖先」这条路（靠 target 判定）。
  // 这一条让 click 真的落在热区上、但页面上存在非空选区——守卫的第二个条件。
  const hotspot = containerA.querySelector('.dsh-ct-hotspot');
  const range = dom.window.document.createRange();
  range.selectNodeContents(containerA.querySelector('.md'));
  dom.window.getSelection().removeAllRanges();
  dom.window.getSelection().addRange(range);
  clickAt(hotspot);
  assert.equal(containerA.textContent.includes('【译】Hello world'), true, '有选区时点热区不该切换');
  dom.window.getSelection().removeAllRanges();
});

await test('点左缘热区才切换到原文，再点切回译文', () => {
  const hotspot = containerA.querySelector('.dsh-ct-hotspot');
  clickAt(hotspot);
  assert.equal(containerA.textContent.includes('【译】Hello world'), false, '点热区应切回原文');
  assert.match(containerA.querySelector('.dsh-ct-prose').className, /dsh-ct-prose-original/, '读原文应挂灰细线类');
  clickAt(containerA.querySelector('.dsh-ct-hotspot'));
  assert.equal(containerA.textContent.includes('【译】Hello world'), true, '再点应切回译文');
});

await test('键盘 Enter 在热区上等效于点击（且只动作一次）', () => {
  const hotspot = containerA.querySelector('.dsh-ct-hotspot');
  hotspot.focus();
  assert.equal(document.activeElement, hotspot, '热区应可聚焦——键盘焦点落在它上面');
  act(() => {
    hotspot.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  });
  assert.equal(containerA.textContent.includes('【译】Hello world'), false, 'Enter 应切到原文');
  assert.match(containerA.querySelector('.dsh-ct-prose').className, /dsh-ct-prose-original/, '切后线型应同步为读原文');
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

await test('失败块：红线 + 常驻 ↻，正文同样不响应点击', () => {
  const blockEl = containerB.querySelector('.dsh-ct-prose');
  assert.match(blockEl.className, /dsh-ct-prose-failed/, '失败块应挂红实线类');
  assert.ok(containerB.querySelector('.dsh-ct-retry') !== null, '失败块的 ↻ 应常驻，不靠悬停显形');
  const hotspot = containerB.querySelector('.dsh-ct-hotspot');
  assert.match(blockEl.className, /dsh-ct-prose-failed/);
  const before = replyCalls;
  clickAt(containerB.querySelector('.md'));
  assert.equal(replyCalls, before, '点正文不该触发补跑');
});

await test('点失败块的热区 = 整行补跑（真的又发了一次请求）', () => {
  const before = replyCalls;
  holdNextReply = true; // 让补跑悬在「在途」，下一步才在脉动态上断言
  clickAt(containerB.querySelector('.dsh-ct-hotspot'));
  assert.equal(replyCalls, before + 1, '点热区应发起一次补跑请求');
});

await test('在途热区仍在（键盘焦点不掉），但按下去是空操作', () => {
  const hotspot = containerB.querySelector('.dsh-ct-hotspot');
  assert.ok(hotspot !== null, '补跑期间热区不该消失');
  assert.equal(hotspot.getAttribute('data-idle'), 'true', '在途应标记 data-idle（光标不给手型）');
  const before = replyCalls;
  clickAt(hotspot);
  assert.equal(replyCalls, before, '在途再点是空操作');
});

await test('补跑落定后回到译文的可切换态', async () => {
  assert.ok(typeof releaseHeldReply === 'function', '补跑请求应还悬着');
  await act(async () => {
    releaseHeldReply();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const hotspot = containerB.querySelector('.dsh-ct-hotspot');
  assert.match(containerB.querySelector('.dsh-ct-prose').className, /dsh-ct-prose-translated/, '补跑成功后应回到译文态');
  assert.equal(hotspot.getAttribute('data-idle'), null, '落定后不再是空操作态');
  assert.equal(containerB.textContent.includes('【译】Broken block'), true, '应显示重跑得到的译文');
});

await test('失败→在途的迁移不重挂载热区：键盘焦点不掉回 body', async () => {
  // 这条锁住一个真实踩过的坑：Tooltip 曾经按状态包/拆，失败块被补跑时树形变化
  // 让 React 重挂载 button，焦点落回 body——「在途热区保留、焦点不掉」当场失效。
  // 修法是 Tooltip 常挂、只用 disabled 收放（其契约保证 disabled 时锚点渲染一致）。
  const containerD = document.createElement('div');
  document.body.appendChild(containerD);
  const rootD = renderRow('ax4', 'Broken block', containerD);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  const before = containerD.querySelector('.dsh-ct-hotspot');
  before.focus();
  assert.ok(document.activeElement === before, '前置：热区应已获得焦点');

  holdNextReply = true;
  act(() => {
    before.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  });

  const after = containerD.querySelector('.dsh-ct-hotspot');
  // 断言布尔而不是直接比 DOM 节点：assert 失败时要格式化两个 jsdom 元素（巨大的
  // 循环图），进程会当场被 OOM 杀掉，失败就变成「被 KILL」而不是一条断言消息。
  assert.ok(after === before, '补跑期间不得重挂载热区（同一个 DOM 节点）');
  assert.ok(document.activeElement === after, '补跑期间键盘焦点必须还留在热区上');
  assert.equal(after.getAttribute('data-idle'), 'true', '此时应是在途态');

  await act(async () => {
    releaseHeldReply();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.ok(
    document.activeElement === containerD.querySelector('.dsh-ct-hotspot'),
    '落定后焦点仍在热区上'
  );
  act(() => rootD.unmount());
});

act(() => rootB.unmount());

// 第三个行键：键盘补跑单独验一次（Enter 在 button 上会合成 click，最易双触发）。
const containerC = document.createElement('div');
document.body.appendChild(containerC);
const rootC = renderRow('ax3', 'Broken block', containerC);
// 这一行没有预先登记，挂载后自己会首跑一次；等它落定成「失败」再验键盘补跑。
await act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

await test('失败块：键盘 Enter 在热区上补跑整行，且只发一次请求', () => {
  const hotspot = containerC.querySelector('.dsh-ct-hotspot');
  assert.match(containerC.querySelector('.dsh-ct-prose').className, /dsh-ct-prose-failed/, '前置：首跑应已落定为失败');
  const before = replyCalls;
  holdNextReply = true;
  act(() => {
    hotspot.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
  });
  assert.equal(replyCalls, before + 1, 'Enter 应只发起一次补跑（合成 click 必须被掐掉）');
});

act(() => rootC.unmount());

console.log(`${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
