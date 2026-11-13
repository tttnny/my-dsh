/**
 * 桌面操作独占槽位的自检：本插件要和官方 CUA、Cua Driver 一样经 `computerUse.register()`
 * 占位，占不到就不把 `mcp__kimi-cu__*` 工具交出去。
 *
 * 用真 cordis Context 与真 `ctx.inject`，只把两个服务换成可观察的替身：
 * `computerUse` 照抄宿主的独占语义（第二个注册直接抛错），`mcpManager` 记录每次注册。
 *
 * 跑法：pnpm test / node scripts/test-exclusivity.mjs
 */
import assert from 'node:assert/strict';

import { Context, Service } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';

import * as plugin from '../lib/index.js';

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
 * 探测器替身：与平台无关，直接给出「已安装且 MCP 命令可用」的状态。
 *
 * 真探测器在 Linux 上必然给 `mcp: null`（不受支持的平台），注册那条链就跑不到，
 * 而这里要验的是独占槽位与注册的先后关系，不是平台分流。
 */
const fakeDetect = async () => ({
  platform: 'darwin',
  supported: true,
  installed: true,
  path: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu',
  version: '0.7.5',
  doctor: { ran: true, ok: true, checks: [], raw: '' },
  mcp: { command: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu', args: ['mcp', '-s', 'user'] },
  install: null,
  notes: [],
  checkedAt: 0,
});

/** 等若干个微任务，让注入回调里那条同步链跑完。 */
async function settle() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

/**
 * 等一个条件成立。探测要真的跑一次 `doctor`，是外部进程，不能只等微任务。
 * @param {() => boolean} predicate - 条件。
 * @param {string} what - 超时时的说明。
 */
async function waitFor(predicate, what) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('等不到：' + what);
}

/** 宿主的桌面操作独占登记，语义照抄：占住之后第二个注册抛错并报出已占位的名字。 */
class FakeComputerUse extends Service {
  constructor(ctx) {
    super(ctx, 'computerUse');
    this.registration = undefined;
  }

  get providerName() {
    return this.registration;
  }

  register(name) {
    if (this.registration !== undefined) {
      throw new Error(`computer use provider "${this.registration}" is already registered`);
    }
    return this.ctx.effect(() => {
      this.registration = name;
      return () => {
        this.registration = undefined;
      };
    }, 'computerUse.register()');
  }
}

/** MCP 管理器替身：只记录注册过的服务器与撤销次数。 */
class FakeMcpManager extends Service {
  constructor(ctx) {
    super(ctx, 'mcpManager');
    this.calls = [];
    this.disposed = 0;
  }

  register(name, entry) {
    this.calls.push({ name, entry });
    return () => {
      this.disposed += 1;
    };
  }
}

/** 起一个只带工具表的上下文：工具表要提示词服务来写 schema。 */
function host() {
  const ctx = new Context();
  new SystemPrompt(ctx, {});
  new ToolRuntime(ctx);
  return ctx;
}

await test('组合里没有 computerUse 时行为不变：照常注册 MCP 连接', async () => {
  const ctx = host();
  const mcp = new FakeMcpManager(ctx);
  plugin.apply(ctx, { detect: fakeDetect });
  await waitFor(() => mcp.calls.length === 1, '没有独占服务时应当照常交出工具');
  assert.equal(mcp.calls[0].name, 'kimi-cu');
});

await test('槽位空着时先占位，占到了才注册 MCP 连接', async () => {
  const ctx = host();
  const cu = new FakeComputerUse(ctx);
  const mcp = new FakeMcpManager(ctx);
  plugin.apply(ctx, { detect: fakeDetect });
  await waitFor(() => mcp.calls.length === 1, '占到位之后应当注册 MCP 连接');
  assert.equal(cu.providerName, 'kimi-cu', '本插件应当占住桌面操作槽位');
});

await test('槽位被别的后端占着时不抢，也不交出工具', async () => {
  const ctx = host();
  const cu = new FakeComputerUse(ctx);
  const release = cu.register('cua-driver-mcp');
  const mcp = new FakeMcpManager(ctx);
  plugin.apply(ctx, { detect: fakeDetect });
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(cu.providerName, 'cua-driver-mcp', '别的后端占着时不能顶掉它');
  assert.equal(mcp.calls.length, 0, '占不到位就不该注册 mcp__kimi-cu__* 工具');
  await release();
});

await test('占位后别的后端再注册会被拒：独占是双向的', async () => {
  const ctx = host();
  const cu = new FakeComputerUse(ctx);
  const mcp = new FakeMcpManager(ctx);
  plugin.apply(ctx, { detect: fakeDetect });
  await waitFor(() => mcp.calls.length === 1, '应当注册 MCP 连接');
  assert.equal(cu.providerName, 'kimi-cu');
  assert.throws(() => cu.register('cua-driver-mcp'), /already registered/);
});

console.log('\ntest-exclusivity: ' + passed + '/' + total + ' 条断言通过');
