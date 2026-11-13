/**
 * 更新链路自检：清单解析、版本比较、阶段映射、失败分类，以及更新器的行为。
 *
 * 纯函数部分用固定输入验；更新器用替身验「已是最新不执行」「清单读不到时 macOS 照跑、
 * Windows 报错」「单飞锁」「超时不 kill」「版本变了才重连」。
 *
 * 跑法：node scripts/test-update.mjs
 */
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyFailure,
  compareVersions,
  createUpdater,
  manifestUrl,
  parseManifest,
  parseStage,
} from '../src/server/update.ts';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));

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

const MACOS_MANIFEST = JSON.stringify({
  version: '0.7.6',
  app: { url: 'https://cdn.example/KimiCU.app.zip', sha256: 'abc', team_id: '2J9472RW75' },
});
const WINDOWS_MANIFEST = JSON.stringify({
  version: '0.3.14',
  runtime: { url: 'https://cdn.example/runtime.zip', sha256: 'def' },
});

await test('parseManifest 取 version 字段', () => {
  assert.equal(parseManifest(MACOS_MANIFEST), '0.7.6');
  assert.equal(parseManifest(WINDOWS_MANIFEST), '0.3.14');
});

await test('parseManifest 对缺字段与坏 JSON 返回 null', () => {
  assert.equal(parseManifest('{"app":{}}'), null);
  assert.equal(parseManifest('{"version":""}'), null);
  assert.equal(parseManifest('not json'), null);
});

await test('compareVersions 按数字段比较，不按字符串', () => {
  assert.equal(compareVersions('0.7.10', '0.7.9'), 1);
  assert.equal(compareVersions('0.7.9', '0.7.10'), -1);
  assert.equal(compareVersions('0.8.0', '0.7.5'), 1);
  assert.equal(compareVersions('0.7.5', '0.7.5'), 0);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
});

await test('compareVersions 对非数字版本返回 null', () => {
  assert.equal(compareVersions('v0.7.5', '0.7.5'), null);
  assert.equal(compareVersions('0.7.5-beta', '0.7.5'), null);
  assert.equal(compareVersions('', '0.7.5'), null);
});

await test('manifestUrl 两个平台各一份清单，其余平台没有', () => {
  assert.match(manifestUrl('darwin'), /kimi-computer-use\/latest\/version\.json$/);
  assert.match(manifestUrl('win32'), /kimi-computer-use-windows\/latest\/version\.json$/);
  assert.equal(manifestUrl('other'), null);
});

await test('parseStage 把 ==> 行映射成阶段，认不出的行不报错', () => {
  assert.equal(parseStage('==> 校验代码签名与 Apple 公证 …'), 'verifying');
  assert.equal(parseStage('==> 当前版本 0.7.5，线上最新 0.7.6'), 'checking');
  assert.equal(parseStage('==> 下载 KimiCU.app.zip'), 'downloading');
  assert.equal(parseStage('==> 替换 /Applications/KimiCU.app'), 'installing');
  assert.equal(parseStage('✓ 签名 + 公证校验通过。'), null);
  assert.equal(parseStage(''), null);
});

await test('classifyFailure 把已知失败分到五类', () => {
  assert.equal(classifyFailure('', true), 'timeout');
  assert.equal(classifyFailure('✗ 另一个升级正在收尾，请稍后重试；当前没有并发替换 App。', false), 'busy');
  assert.equal(classifyFailure('✗ 下载包 SHA-256 与版本清单不一致，已中止。', false), 'verify');
  assert.equal(
    classifyFailure('Staging failed; the existing service was not stopped. Run the installer from Terminal with administrator authorization.', false),
    'permission',
  );
  assert.equal(classifyFailure('✗ 下载失败，请检查网络后重试。', false), 'network');
  assert.equal(classifyFailure('something else entirely', false), 'unknown');
});

/** 造一个更新器替身环境：记录每次读清单与每次 upgrade 的入参。 */
function harness(overrides = {}) {
  const calls = { fetch: [], upgrade: [], reconnect: 0 };
  const base = {
    platform: 'darwin',
    current: async () => ({ path: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu', version: '0.7.5' }),
    fetchManifest: async () => MACOS_MANIFEST,
    runUpgrade: async (input) => {
      input.onLine('==> 当前版本 0.7.5，线上最新 0.7.6');
      input.onLine('==> 校验代码签名与 Apple 公证 …');
      return { code: 0, raw: '✓ 升级完成', timedOut: false, whenExited: Promise.resolve() };
    },
    reconnect: async () => { calls.reconnect += 1; return true; },
    now: () => 1,
  };
  const merged = { ...base, ...overrides };
  const deps = {
    ...merged,
    fetchManifest: async (url) => {
      calls.fetch.push(url);
      return merged.fetchManifest(url);
    },
    runUpgrade: async (input) => {
      calls.upgrade.push({ platform: input.platform, binaryPath: input.binaryPath, version: input.version });
      return merged.runUpgrade(input);
    },
  };
  return { updater: createUpdater(deps), calls };
}

/** 收集一次 run 的全部事件。 */
async function collect(updater) {
  const events = [];
  await updater.run((event) => events.push(event));
  return events;
}

await test('check：清单版本更高时 hasUpdate 为 true', async () => {
  const { updater } = harness();
  const check = await updater.check();
  assert.equal(check.current, '0.7.5');
  assert.equal(check.latest, '0.7.6');
  assert.equal(check.hasUpdate, true);
  assert.equal(check.error, null);
});

await test('check：清单与本地同版本时 hasUpdate 为 false', async () => {
  const { updater } = harness({ fetchManifest: async () => JSON.stringify({ version: '0.7.5' }) });
  const check = await updater.check();
  assert.equal(check.hasUpdate, false);
});

await test('check：清单读不到时记下错误，不抛', async () => {
  const { updater } = harness({ fetchManifest: async () => { throw new Error('offline'); } });
  const check = await updater.check();
  assert.equal(check.latest, null);
  assert.equal(check.hasUpdate, false);
  assert.equal(check.error, 'offline');
});

await test('check：Windows 读的是 Windows 那份清单', async () => {
  const { updater, calls } = harness({
    platform: 'win32',
    current: async () => ({ path: 'C:\\KimiCU\\kimi-cu.exe', version: '0.3.13' }),
    fetchManifest: async () => WINDOWS_MANIFEST,
  });
  await updater.check();
  assert.match(calls.fetch[0], /kimi-computer-use-windows/);
});

await test('run：已是最新时不执行 upgrade', async () => {
  const { updater, calls } = harness({ fetchManifest: async () => JSON.stringify({ version: '0.7.5' }) });
  const events = await collect(updater);
  assert.deepEqual(events.map((event) => event.type), ['stage', 'done']);
  assert.equal(events[1].upToDate, true);
  assert.equal(calls.upgrade.length, 0);
});

await test('run：有新版时先报阶段再执行，版本变了才重连', async () => {
  let version = '0.7.5';
  const { updater, calls } = harness({
    current: async () => ({ path: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu', version }),
    runUpgrade: async (input) => {
      calls.upgrade.push({ version: input.version });
      input.onLine('==> 校验代码签名与 Apple 公证 …');
      version = '0.7.6';
      return { code: 0, raw: '✓ 升级完成', timedOut: false, whenExited: Promise.resolve() };
    },
  });
  const events = await collect(updater);
  const stages = events.filter((event) => event.type === 'stage').map((event) => event.stage);
  assert.deepEqual(stages, ['checking', 'downloading', 'verifying', 'restarting']);
  const done = events.at(-1);
  assert.equal(done.type, 'done');
  assert.equal(done.version, '0.7.6');
  assert.equal(done.reconnect, 'done');
  assert.equal(calls.reconnect, 1);
  assert.equal(calls.upgrade[0].version, null, 'macOS 不带版本号，让 KimiCU 自己判断');
});

await test('run：版本没变就不重连', async () => {
  const { updater, calls } = harness({
    runUpgrade: async () => ({ code: 0, raw: '✓ 升级完成', timedOut: false, whenExited: Promise.resolve() }),
  });
  await collect(updater);
  assert.equal(calls.reconnect, 0);
});

await test('run：清单读不到时 macOS 照跑 upgrade', async () => {
  const { updater, calls } = harness({ fetchManifest: async () => { throw new Error('offline'); } });
  const events = await collect(updater);
  assert.equal(calls.upgrade.length, 1);
  assert.equal(events.at(-1).type, 'done');
});

await test('run：清单读不到时 Windows 报网络错误，不执行', async () => {
  const { updater, calls } = harness({
    platform: 'win32',
    current: async () => ({ path: 'C:\\KimiCU\\kimi-cu.exe', version: '0.3.13' }),
    fetchManifest: async () => { throw new Error('offline'); },
  });
  const events = await collect(updater);
  assert.equal(calls.upgrade.length, 0);
  assert.deepEqual(events.at(-1), { type: 'error', kind: 'network', raw: 'offline' });
});

await test('run：Windows 带清单版本号执行 upgrade', async () => {
  const { updater, calls } = harness({
    platform: 'win32',
    current: async () => ({ path: 'C:\\KimiCU\\kimi-cu.exe', version: '0.3.13' }),
    fetchManifest: async () => WINDOWS_MANIFEST,
  });
  await collect(updater);
  assert.equal(calls.upgrade[0].version, '0.3.14');
});

await test('run：并发调用被单飞锁挡住', async () => {
  let release;
  const gate = new Promise((done) => { release = done; });
  const { updater } = harness({
    runUpgrade: async () => { await gate; return { code: 0, raw: '', timedOut: false, whenExited: Promise.resolve() }; },
  });
  const first = collect(updater);
  const second = await collect(updater);
  assert.deepEqual(second, [{ type: 'error', kind: 'busy', raw: '' }]);
  release();
  await first;
  const third = await collect(updater);
  assert.equal(third.at(-1).type, 'done', '锁要在结束后释放');
});

await test('run：超时归类为 timeout', async () => {
  const { updater } = harness({
    runUpgrade: async () => ({ code: null, raw: '部分输出', timedOut: true, whenExited: Promise.resolve() }),
  });
  const events = await collect(updater);
  assert.deepEqual(events.at(-1), { type: 'error', kind: 'timeout', raw: '部分输出' });
});

await test('run：非零退出码按输出分类', async () => {
  const { updater } = harness({
    runUpgrade: async () => ({ code: 1, raw: '✗ 下载包 SHA-256 与版本清单不一致，已中止。', timedOut: false, whenExited: Promise.resolve() }),
  });
  const events = await collect(updater);
  assert.equal(events.at(-1).kind, 'verify');
});

await test('classifyFailure 跳过进度行，只看错误行', () => {
  assert.equal(
    classifyFailure(
      '==> 校验代码签名与 Apple 公证 …\nStaging failed; the existing service was not stopped. Run the installer from Terminal with administrator authorization.',
      false,
    ),
    'permission',
  );
});

await test('run：超时后锁留到子进程真的退出', async () => {
  let exit;
  const whenExited = new Promise((done) => { exit = done; });
  let first = true;
  const { updater } = harness({
    runUpgrade: async () => {
      if (!first) return { code: 0, raw: '', timedOut: false, whenExited: Promise.resolve() };
      first = false;
      return { code: null, raw: '部分输出', timedOut: true, whenExited };
    },
  });
  const events = await collect(updater);
  assert.equal(events.at(-1).kind, 'timeout');
  const second = await collect(updater);
  assert.deepEqual(second, [{ type: 'error', kind: 'busy', raw: '' }], '超时后进程还在跑，锁不能放');
  exit();
  await new Promise((done) => setTimeout(done, 0));
  const third = await collect(updater);
  assert.equal(third.at(-1).type, 'done', '进程退出后锁要放');
});

await test('run：升级后版本读不出来不算确认变化，不重连', async () => {
  let reads = 0;
  const { updater, calls } = harness({
    current: async () => {
      reads += 1;
      return reads === 1
        ? { path: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu', version: '0.7.5' }
        : { path: '/Applications/KimiCU.app/Contents/MacOS/kimi-cu', version: null };
    },
  });
  const events = await collect(updater);
  assert.equal(calls.reconnect, 0);
  assert.equal(events.at(-1).reconnect, 'skipped');
});

await test('路由常量与包内约定一致', async () => {
  const shared = await import('../src/shared/update.ts');
  assert.equal(shared.UPDATE_ROUTE_PATH, '/api/dsh-kimi-cu/update');
});

console.log('\ntest-update: ' + passed + '/' + total + ' 条断言通过（root=' + root + '）');
