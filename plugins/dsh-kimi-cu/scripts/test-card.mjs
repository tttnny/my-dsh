/**
 * 状态卡渲染自检：用真 react 把卡片画进 jsdom，锁住四种状态与两个动作。
 *
 *   1. 未安装：命令、复制按钮、步骤都在；
 *   2. 已就绪：版本与恢复提示在，安装命令不再出现；
 *   3. 已安装但未就绪：失败项与修复提示在；
 *   4. 平台不支持 / 读取失败：各自给出明确说明；
 *   5. 复制把命令写进剪贴板，重新检测请求带 refresh=1。
 *
 * ui-primitives 是替身：真组件是浏览器里的 ESM、带 .css 导入，Node 里跑不起来。
 * 替身只把 children 与 onClick 原样渲染，所以这里验的是本插件自己的视图结构。
 *
 * 跑法：node scripts/test-card.mjs
 */
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { installDom, loadClientBundle, primitivesStub } from '../../../tools/lib/dom-harness.mjs';
import { zh } from '../src/client/locales.ts';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const dom = installDom(JSDOM, { storage: false, raf: true });

const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');

const primitives = primitivesStub({
  Button: (props) => createElement(
    'button',
    { type: 'button', onClick: props.onClick, disabled: props.disabled },
    props.children,
  ),
  Tag: (props) => createElement('span', { 'data-tone': props.tone }, props.children),
});

const exported = await loadClientBundle({ root, primitives });

const registrations = [];
const table = {
  locale: { register: () => () => {}, bind: () => (key) => key },
  slots: {
    inject: (_slot, register) => { register(); return () => {}; },
    register: (options, component) => { registrations.push({ options, component }); return () => {}; },
  },
};
const ctx = new Proxy(
  { effect: (fn) => { fn(); return () => {}; }, inject: () => () => {}, get: (name) => table[name] },
  {
    get(target, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      if (prop in target) return target[prop];
      if (prop === 'locale' || prop === 'slots') return table[prop];
      throw new Error('cannot get property "' + String(prop) + '" without inject');
    },
  },
);
exported.apply(ctx);
const card = registrations.find((entry) => entry.options.name === 'plugins.bundle.config').component;
const t = (key) => zh[key] ?? key;

let fetchUrl = '';
let fetchBody = null;
let fetchCode = 200;
globalThis.fetch = async (url) => {
  fetchUrl = String(url);
  return new Response(JSON.stringify(fetchBody), {
    status: fetchCode,
    headers: { 'Content-Type': 'application/json' },
  });
};

let copied = '';
Object.defineProperty(dom.window.navigator, 'clipboard', {
  value: { writeText: async (text) => { copied = text; } },
  configurable: true,
});

const BASE = {
  platform: 'darwin',
  supported: true,
  installed: false,
  path: null,
  version: null,
  doctor: { ran: false, ok: false, checks: [], raw: '' },
  mcp: { command: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu', args: ['mcp', '-s', 'user'] },
  install: {
    command: 'curl -fsSL https://cdn.kimi.com/kimi-computer-use/latest/setup_macos.sh | bash',
    steps: ['install', 'grant-permissions', 'reload-plugin'],
    docsUrl: 'https://example.com/zh',
    docsUrlEn: 'https://example.com/en',
  },
  notes: [],
  checkedAt: 1,
};

let passed = 0;
let total = 0;
async function test(label, fn) {
  total += 1;
  try {
    await fn();
    passed += 1;
    console.log('  ok   ' + label);
  } catch (error) {
    console.error('  FAIL ' + label + ': ' + error.message);
    throw error;
  }
}

/**
 * 把卡片画进一个新容器。
 * @param status - 这一次 fetch 返回的状态。
 * @param options - httpStatus 覆盖响应码。
 * @returns 容器与 react root。
 */
async function mount(status, options = {}) {
  fetchBody = status;
  fetchCode = options.httpStatus ?? 200;
  fetchUrl = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  const reactRoot = createRoot(container);
  await act(async () => {
    reactRoot.render(createElement(card, { t }));
    await new Promise((done) => setTimeout(done, 0));
  });
  return { container, reactRoot };
}

/**
 * 按文字找按钮。
 * @param container - 容器。
 * @param text - 文字片段。
 * @returns 按钮或 undefined。
 */
function buttonByText(container, text) {
  return [...container.querySelectorAll('button')].find((button) => (button.textContent ?? '').includes(text));
}

await test('未安装：显示安装命令、复制按钮与步骤', async () => {
  const { container } = await mount(BASE);
  const text = container.textContent ?? '';
  assert.match(text, /未检测到 KimiCU/);
  assert.match(text, /setup_macos\.sh/);
  assert.match(text, /复制命令/);
  assert.match(text, /安装官方 KimiCU 运行时。/);
  assert.ok(buttonByText(container, '复制命令') !== undefined);
});

await test('已就绪：显示版本与恢复提示，不再展示安装命令', async () => {
  const { container } = await mount({
    ...BASE,
    installed: true,
    path: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu',
    version: '0.6.8',
    doctor: { ran: true, ok: true, checks: [{ id: 'accessibility', label: 'Accessibility (AX)', ok: true }], raw: '' },
  });
  const text = container.textContent ?? '';
  assert.match(text, /KimiCU 已就绪/);
  assert.match(text, /0\.6\.8/);
  assert.match(text, /如果模型看不到/);
  assert.doesNotMatch(text, /setup_macos\.sh/);
});

await test('已安装但未就绪：列出失败项与修复提示', async () => {
  const { container } = await mount({
    ...BASE,
    installed: true,
    path: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu',
    version: '0.6.8',
    doctor: {
      ran: true,
      ok: false,
      checks: [{ id: 'screen-recording', label: 'Screen Recording', ok: false }],
      raw: '',
    },
  });
  const text = container.textContent ?? '';
  assert.match(text, /已安装 KimiCU，但还没就绪/);
  assert.match(text, /屏幕录制/);
  assert.match(text, /打开系统设置/);
});

await test('平台不支持：只说明不支持，不展示安装命令', async () => {
  const { container } = await mount({
    ...BASE,
    platform: 'other',
    supported: false,
    install: null,
    mcp: null,
  });
  const text = container.textContent ?? '';
  assert.match(text, /本插件只支持 macOS 与 Windows/);
  assert.doesNotMatch(text, /setup_macos\.sh/);
});

await test('读取失败：显示错误与重试', async () => {
  const { container } = await mount({ error: 'boom' }, { httpStatus: 500 });
  const text = container.textContent ?? '';
  assert.match(text, /读不到 KimiCU 的状态。/);
  assert.ok(buttonByText(container, '重试') !== undefined);
});

await test('复制按钮把安装命令写进剪贴板', async () => {
  const { container } = await mount(BASE);
  copied = '';
  const button = buttonByText(container, '复制命令');
  assert.ok(button !== undefined);
  await act(async () => {
    button.click();
    await new Promise((done) => setTimeout(done, 0));
  });
  assert.equal(copied, BASE.install.command);
});

await test('覆盖路径缺失：显示 override-missing 附注', async () => {
  const { container } = await mount({ ...BASE, notes: ['override-missing'] });
  const text = container.textContent ?? '';
  assert.match(text, /KIMI_CU_WINDOWS_EXE 指向的文件不存在/);
});

await test('MCP 命令缺失：即使 doctor 全绿也显示未就绪', async () => {
  const { container } = await mount({
    ...BASE,
    installed: true,
    path: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu',
    version: '0.3.13',
    doctor: { ran: true, ok: true, checks: [], raw: '' },
    notes: ['legacy-install', 'mcp-command-missing'],
  });
  const text = container.textContent ?? '';
  assert.match(text, /已安装 KimiCU，但还没就绪/);
  assert.match(text, /MCP 行要启动的文件不存在/);
});

await test('重新检测请求带 refresh=1', async () => {
  const { container } = await mount(BASE);
  const button = buttonByText(container, '重新检测');
  assert.ok(button !== undefined);
  await act(async () => {
    button.click();
    await new Promise((done) => setTimeout(done, 0));
  });
  assert.match(fetchUrl, /refresh=1/);
});

console.log('\ntest-card: ' + passed + '/' + total + ' 条断言通过');
