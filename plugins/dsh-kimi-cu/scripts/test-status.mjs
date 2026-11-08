/**
 * 检测核心自检：平台解析、安装计划、`doctor` 解析与状态缓存。
 *
 * 这些是纯逻辑，不 spawn 任何进程：真 `doctor` 的调用在 smoke-host 与真机验收里。
 * 期望值来自官方 `INSTALL.md` 与实测输出，不是照抄实现。
 *
 * 跑法：node scripts/test-status.mjs
 */
import assert from 'node:assert/strict';

import {
  DOCS_URL,
  DOCS_URL_EN,
  MACOS_BINARY,
  MACOS_INSTALL_COMMAND,
  WINDOWS_INSTALL_COMMAND,
} from '../src/shared/status.ts';
import { installPlan, resolveInstall } from '../src/server/resolve.ts';
import { parseDoctor } from '../src/server/doctor.ts';
import { createStatusDetector, parseMacosVersion } from '../src/server/status.ts';

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

const MAC_DOCTOR_OK = [
  'kimi-cu doctor',
  '✅ Accessibility (AX)',
  '✅ Screen Recording',
  '✅ SkyLight post-to-pid',
  '✅ bg-input (window-location SPI)',
  '✅ signed keyboard',
  '',
].join('\n');

const MAC_DOCTOR_BAD = MAC_DOCTOR_OK.replace('✅ Screen Recording', '❌ Screen Recording');

const WIN_DOCTOR_OK = ['version=0.3.13', 'mcp=true', 'helper=embedded', ''].join('\n');
const WIN_DOCTOR_BAD = WIN_DOCTOR_OK.replace('mcp=true', 'mcp=false');

const LOCAL = 'C:\\Users\\t\\AppData\\Local';
const WIN_PRIMARY = `${LOCAL}\\Kimi Computer Use\\kimi-cu.exe`;
const WIN_LEGACY = `${LOCAL}\\KimiCU\\kimi-cu.exe`;

await test('macOS 安装计划：官方命令、权限步骤、文档地址', () => {
  const plan = installPlan('darwin');
  assert.equal(plan.command, MACOS_INSTALL_COMMAND);
  assert.match(plan.command, /setup_macos\.sh/);
  assert.deepEqual(plan.steps, ['install', 'grant-permissions', 'reload-plugin']);
  assert.equal(plan.docsUrl, DOCS_URL);
  assert.equal(plan.docsUrlEn, DOCS_URL_EN);
});

await test('Windows 安装计划：官方 PowerShell 命令、无权限步骤', () => {
  const plan = installPlan('win32');
  assert.equal(plan.command, WINDOWS_INSTALL_COMMAND);
  assert.match(plan.command, /setup_windows\.ps1/);
  assert.deepEqual(plan.steps, ['install', 'reload-plugin']);
});

await test('不支持的平台没有安装计划', () => {
  assert.equal(installPlan('other'), null);
});

await test('macOS：找到二进制时 installed 为真，MCP 命令带 -s user', () => {
  const resolved = resolveInstall({ platform: 'darwin', env: {}, exists: (path) => path === MACOS_BINARY });
  assert.equal(resolved.supported, true);
  assert.equal(resolved.installed, true);
  assert.equal(resolved.path, MACOS_BINARY);
  assert.deepEqual(resolved.mcp, { command: MACOS_BINARY, args: ['mcp', '-s', 'user'] });
  assert.deepEqual(resolved.notes, []);
});

await test('macOS：没找到二进制时 installed 为假，但 MCP 命令仍是约定路径', () => {
  const resolved = resolveInstall({ platform: 'darwin', env: {}, exists: () => false });
  assert.equal(resolved.installed, false);
  assert.equal(resolved.path, null);
  assert.equal(resolved.mcp.command, MACOS_BINARY);
});

await test('Windows：新目录存在时用它，MCP 命令与 patch 表达式一致', () => {
  const resolved = resolveInstall({
    platform: 'win32',
    env: { LOCALAPPDATA: LOCAL },
    exists: (path) => path === WIN_PRIMARY,
  });
  assert.equal(resolved.installed, true);
  assert.equal(resolved.path, WIN_PRIMARY);
  assert.deepEqual(resolved.mcp, { command: WIN_PRIMARY, args: ['mcp'] });
  assert.deepEqual(resolved.notes, []);
});

await test('Windows：KIMI_CU_WINDOWS_EXE 覆盖默认路径', () => {
  const custom = 'D:\\tools\\kimi-cu.exe';
  const resolved = resolveInstall({
    platform: 'win32',
    env: { LOCALAPPDATA: LOCAL, KIMI_CU_WINDOWS_EXE: custom },
    exists: (path) => path === custom,
  });
  assert.equal(resolved.path, custom);
  assert.equal(resolved.mcp.command, custom);
});

await test('Windows：只有旧目录时标记 legacy-install 与 mcp-command-missing，并给出升级步骤', () => {
  const resolved = resolveInstall({
    platform: 'win32',
    env: { LOCALAPPDATA: LOCAL },
    exists: (path) => path === WIN_LEGACY,
  });
  assert.equal(resolved.installed, true);
  assert.equal(resolved.path, WIN_LEGACY);
  assert.deepEqual(resolved.notes, ['legacy-install', 'mcp-command-missing']);
  assert.equal(resolved.mcp.command, WIN_PRIMARY);
  assert.ok(resolved.install.steps.includes('upgrade'), '旧目录安装要给出升级步骤');
});

await test('Windows：两个目录都没有时 installed 为假', () => {
  const resolved = resolveInstall({ platform: 'win32', env: { LOCALAPPDATA: LOCAL }, exists: () => false });
  assert.equal(resolved.installed, false);
  assert.equal(resolved.path, null);
  assert.deepEqual(resolved.notes, []);
});

await test('Windows：KIMI_CU_WINDOWS_EXE 指向不存在的文件时不再回退到默认目录', () => {
  const missing = 'D:\\missing.exe';
  const resolved = resolveInstall({
    platform: 'win32',
    env: { LOCALAPPDATA: LOCAL, KIMI_CU_WINDOWS_EXE: missing },
    exists: (path) => path === WIN_PRIMARY,
  });
  assert.equal(resolved.installed, false);
  assert.equal(resolved.path, null);
  assert.deepEqual(resolved.notes, ['override-missing']);
  assert.equal(resolved.mcp.command, missing, 'MCP 行启动的是覆盖值，状态必须跟着它');
});

await test('Windows：LOCALAPPDATA 缺失时命令与 patch 表达式同一公式', () => {
  const resolved = resolveInstall({ platform: 'win32', env: {}, exists: () => false });
  assert.equal(resolved.installed, false);
  assert.equal(resolved.mcp.command, '\\Kimi Computer Use\\kimi-cu.exe');
});

await test('不支持的平台：supported 为假，没有 MCP 命令与安装计划', () => {
  const resolved = resolveInstall({ platform: 'linux', env: {}, exists: () => true });
  assert.equal(resolved.supported, false);
  assert.equal(resolved.installed, false);
  assert.equal(resolved.mcp, null);
  assert.equal(resolved.install, null);
});

await test('macOS doctor：五项全绿时 ok 为真，id 映射对得上', () => {
  const parsed = parseDoctor('darwin', MAC_DOCTOR_OK);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.checks.map((check) => check.id), [
    'accessibility',
    'screen-recording',
    'skylight',
    'bg-input',
    'signed-keyboard',
  ]);
  assert.equal(parsed.version, null);
});

await test('macOS doctor：有一项失败时 ok 为假', () => {
  const parsed = parseDoctor('darwin', MAC_DOCTOR_BAD);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.checks.find((check) => check.id === 'screen-recording').ok, false);
});

await test('Windows doctor：mcp=true 时 ok 为真，版本从输出里读', () => {
  const parsed = parseDoctor('win32', WIN_DOCTOR_OK);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.version, '0.3.13');
  assert.deepEqual(parsed.checks, [{ id: 'mcp', label: 'MCP', ok: true }]);
});

await test('Windows doctor：mcp=false 时 ok 为假', () => {
  const parsed = parseDoctor('win32', WIN_DOCTOR_BAD);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.version, '0.3.13');
});

await test('Info.plist 里能读出 CFBundleShortVersionString', () => {
  const plist = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0"><dict>',
    '  <key>CFBundleShortVersionString</key>',
    '  <string>0.6.8</string>',
    '</dict></plist>',
  ].join('\n');
  assert.equal(parseMacosVersion(plist), '0.6.8');
  assert.equal(parseMacosVersion('not a plist'), null);
});

/** 一个可推进的时钟与可计数的 doctor。 */
function detectorHarness(overrides = {}) {
  let clock = 1_000;
  let doctorCalls = 0;
  const deps = {
    platform: 'darwin',
    env: {},
    exists: () => true,
    readVersion: () => '0.6.8',
    runDoctor: async () => {
      doctorCalls += 1;
      return { ran: true, ok: true, checks: [], version: null, raw: '' };
    },
    now: () => clock,
    ttlMs: 10_000,
    ...overrides,
  };
  const detect = createStatusDetector(deps);
  return {
    detect,
    advance: (ms) => { clock += ms; },
    calls: () => doctorCalls,
  };
}

await test('检测结果在 TTL 内复用，过期后重跑', async () => {
  const harness = detectorHarness();
  const first = await harness.detect();
  assert.equal(first.version, '0.6.8');
  assert.equal(harness.calls(), 1);
  await harness.detect();
  assert.equal(harness.calls(), 1, 'TTL 内不该重跑');
  harness.advance(20_000);
  await harness.detect();
  assert.equal(harness.calls(), 2, '过期后应当重跑');
});

await test('refresh 绕过缓存', async () => {
  const harness = detectorHarness();
  await harness.detect();
  await harness.detect(true);
  assert.equal(harness.calls(), 2);
});

await test('并发调用共用一次探测', async () => {
  const harness = detectorHarness();
  await Promise.all([harness.detect(true), harness.detect(true), harness.detect(true)]);
  assert.equal(harness.calls(), 1);
});

await test('doctor 失败时状态仍保留 installed，错误写进 doctor.error', async () => {
  const harness = detectorHarness({
    runDoctor: async () => ({ ran: true, ok: false, checks: [], version: null, raw: '', error: 'timeout' }),
  });
  const status = await harness.detect();
  assert.equal(status.installed, true);
  assert.equal(status.doctor.ok, false);
  assert.equal(status.doctor.error, 'timeout');
});

await test('版本读不出来时回退到 doctor 输出里的版本', async () => {
  const harness = detectorHarness({
    readVersion: () => null,
    runDoctor: async () => ({ ran: true, ok: true, checks: [], version: '0.3.13', raw: '' }),
  });
  const status = await harness.detect();
  assert.equal(status.version, '0.3.13');
});

await test('不支持的平台不跑 doctor', async () => {
  const harness = detectorHarness({ platform: 'linux', exists: () => true });
  const status = await harness.detect();
  assert.equal(status.supported, false);
  assert.equal(harness.calls(), 0);
});

await test('exists 抛错时探测器不 reject，返回 detection-failed 状态', async () => {
  const detect = createStatusDetector({
    platform: 'darwin',
    env: {},
    exists: () => { throw new Error('boom'); },
    readVersion: () => null,
    runDoctor: async () => ({ ran: true, ok: true, checks: [], version: null, raw: '' }),
    now: () => 1,
  });
  const status = await detect();
  assert.equal(status.installed, false);
  assert.deepEqual(status.notes, ['detection-failed']);
  assert.match(status.doctor.error, /boom/);
});

console.log(`\ntest-status: ${passed}/${total} 条断言通过`);
