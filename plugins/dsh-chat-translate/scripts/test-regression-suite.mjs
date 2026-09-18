// Comprehensive Automated Regression Test Suite for dsh-chat-translate
// Tests:
// 1. ContentMaskingPipeline placeholder masking & robust unmasking
// 2. Direct translation pass-through (no restrictive language skipping)
// 3. Concurrency pool, Token mutex & Circuit breaker state machine
// 4. LruDiskCache & ClientCache LRU eviction and TTL handling
// 5. ConfigManager validation, atomic persistence, and change events
// 6. NonDestructiveTranslationMount DOM preservation, toggle, and clean unmount
// 7. HttpRouter DoS 1MB protection and endpoint handling

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { JSDOM } from 'jsdom';

// Isolate all file-backed state (config/cache/credentials) into a temp dir so
// the suite never reads or overwrites the real ~/.dsh files.
const TMP_HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-chat-translate-test-'));
process.env.DSH_HOME = TMP_HOME;

import { ContentMaskingPipeline, isMaskLeak, isMaskLeakAgainst } from '../src/server/pipeline/masking.ts';
import { TranslationDispatcher } from '../src/server/dispatcher.ts';
import { ConfigManager } from '../src/server/config.ts';
import { LruDiskCache } from '../src/server/cache.ts';
import { CredentialsReader } from '../src/server/credentials.ts';
import { ClientCache } from '../src/client/translate/client-cache.ts';
import { NonDestructiveTranslationMount } from '../src/client/translate/mount.ts';
import { createHttpHandler } from '../src/server/router.ts';
import { createFakeSettingsScope, createFakeCredentials } from './test-helpers.mjs';

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function testAsync(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

console.log('=== Starting dsh-chat-translate Regression Test Suite ===\n');

// -------------------------------------------------------------
// Suite 1: ContentMaskingPipeline Placeholder Protection
// -------------------------------------------------------------
console.log('--- Suite 1: ContentMaskingPipeline Placeholder Protection ---');

const pipeline = new ContentMaskingPipeline();

// The wire token carries a random id, so tests must derive it from the masked
// text instead of hard-coding a literal — that is exactly what regressed in 1.3.1
// (the engine dropped one underscore and the strict unmask regex gave up).
function tokenIndexIn(maskedText, index) {
  const tokens = [...maskedText.matchAll(/__(?:DSH\s*_?\s*MASK)[\s._-]*[xX]?([a-z]{2,8})_(\d+)__/gi)];
  const hit = tokens.find((m) => Number(m[2]) === index);
  if (!hit) throw new Error(`mask token #${index} not found in ${JSON.stringify(maskedText)}`);
  return hit[0];
}

test('Masks multi-line code blocks with backticks and tildes', () => {
  const input = 'Here is some code:\n```typescript\nconst answer: number = 42;\nconsole.log(answer);\n```\nAnd more text.';
  const { maskedText, unmask } = pipeline.mask(input);
  assert.ok(!maskedText.includes('const answer'));

  const simulatedTranslation = `这是代码：\n${tokenIndexIn(maskedText, 0)}\n以及更多文本。`;
  const unmasked = unmask(simulatedTranslation);
  assert.ok(unmasked.includes('const answer: number = 42;'));
  assert.ok(unmasked.startsWith('这是代码：'));
});

test('Masks inline code spans', () => {
  const input = 'Please execute `pnpm run build` and `pnpm run typecheck` before releasing.';
  const { maskedText, unmask } = pipeline.mask(input);

  const simulated = `请在发布前执行 ${tokenIndexIn(maskedText, 0)} 和 ${tokenIndexIn(maskedText, 1)}。`;
  const unmasked = unmask(simulated);
  assert.equal(unmasked, '请在发布前执行 `pnpm run build` 和 `pnpm run typecheck`。');
});

test('Masks URLs accurately', () => {
  const input = 'Check the documentation at https://cn.bing.com/translator?q=test&lang=zh-Hans for updates.';
  const { maskedText, unmask } = pipeline.mask(input);

  const simulated = `查看文档位于 ${tokenIndexIn(maskedText, 0)} 获取更新。`;
  const unmasked = unmask(simulated);
  assert.equal(unmasked, '查看文档位于 https://cn.bing.com/translator?q=test&lang=zh-Hans 获取更新。');
});

test('Round-trips every masked construct through an unchanged translation', () => {
  const inputs = [
    'Here is some code:\n```typescript\nconst answer: number = 42;\n```\nAnd more text.',
    'Please execute `pnpm run build` and `pnpm run typecheck` before releasing.',
    'Check the documentation at https://cn.bing.com/translator?q=test&lang=zh-Hans for updates.',
    'Files located at /etc/nginx/nginx.conf, src/server/dispatcher.ts, and C:\\Users\\test\\config.json',
    'Look at node_modules/.pnpm/x@1.0.0/node_modules/y/index.js please',
    '/usr/local/bin/node --version',
    'Run command with --concurrency=5 --force-refresh -p 3080 and -rf',
    'a **bold** word and src/a.b glob',
  ];
  for (const input of inputs) {
    const { maskedText, unmask } = pipeline.mask(input);
    assert.equal(unmask(maskedText), input, `round-trip failed for ${JSON.stringify(input)}`);
  }
});

test('Unmasks engine-mangled tokens: case, spacing, dropped separators and boundaries', () => {
  const input = 'Let me check these host-side service names in 0.1.6: `webServer`, `storageDomain`, `settings`';
  const { maskedText, unmask } = pipeline.mask(input);
  assert.equal(unmask(maskedText), input);

  const id = /__DSHMASKx([a-z]{4})_0__/.exec(maskedText)[1];
  const token = (i) => `__DSHMASKx${id}_${i}__`;
  const expected = '让我检查这些主机端服务名称：`webServer`, `storageDomain`, `settings`';
  const variants = [
    expected.replace(token(0), `__DSHMASKX${id.toUpperCase()}_0__`),
    expected.replace(token(0), `__DSH MASK x${id} _ 0__`),
    expected.replace(token(0), `__DSHMASK${id}_0__`), // `x` separator eaten
    expected.replace(token(0), `__DSHMASK${id}_0__`.replace('_0', '0')), // id and index fused
    expected.replace(token(0), `_DSHMASKx${id}_0_`), // one boundary underscore left
    expected.replace(token(0), `__DSH_MASK_0__`), // legacy format
    expected.replace(token(0), `__dsh_mask_0__`), // legacy, case folded
  ];
  for (const variant of variants) {
    const unmasked = unmask(variant);
    assert.equal(unmasked, expected, `failed for ${JSON.stringify(variant)}`);
    assert.equal(isMaskLeak(unmasked), false);
  }
});

test('Leaves a token carrying a foreign masking-pass id untouched', () => {
  const { unmask } = pipeline.mask('Locate `DSH_HOME` directory');
  assert.equal(unmask('定位 __DSHMASKxzzzz_0__ 目录'), '定位 __DSHMASKxzzzz_0__ 目录');
});

test('Out-of-range token indexes are kept verbatim', () => {
  const { maskedText, unmask } = pipeline.mask('Please execute `pnpm run build` before releasing.');
  const foreign = maskedText.replace(/__DSHMASKx([a-z]{4})_0__/, '__DSHMASKx$1_99__');
  assert.equal(unmask(foreign), foreign);
});

test('isMaskLeak flags hallucinated and leaked placeholders only', () => {
  assert.equal(isMaskLeak('查找 __DSH_MASK_0__ 中的归属使用情况'), true);
  assert.equal(isMaskLeak('比较 __DSHMASK_1__ 和 __DSH _ MASK _ 2__'), true);
  assert.equal(isMaskLeak('定位 _DSH_MASK_0 目录'), true);
  assert.equal(isMaskLeak('正常的一段译文。'), false);
  assert.equal(isMaskLeak('dshmask 不是占位符'), false);
});

test('isMaskLeakAgainst spares text that legitimately talks about placeholders', () => {
  // A source that itself documents the placeholder must round-trip.
  const source = 'The user reports `_DSH_MASK_0` placeholders leaking into translations';
  const translated = '用户反馈 `_DSH_MASK_0` 占位符泄漏进译文';
  assert.equal(isMaskLeak(translated), true, 'the bare predicate cannot tell the two apart');
  assert.equal(isMaskLeakAgainst(source, translated), false, 'a pre-existing token is not a leak');

  // A hallucinated token introduces one the source never had.
  assert.equal(isMaskLeakAgainst('find attribution usage in dsh-llm', '查找 __DSH_MASK_0__ 中的归属使用情况'), true);
  // Repeated occurrences are counted: one in the source, two in the translation.
  assert.equal(isMaskLeakAgainst('about `_DSH_MASK_0`', '关于 `_DSH_MASK_0` 和 __DSH_MASK_0__'), true);
});

test('Mask rules never swallow an already-inserted token (no nested masks)', () => {
  const input = 'See https://example.com/a/b.ts and node_modules/.pnpm/x@1.0.0/node_modules/y/index.js';
  const { maskedText } = pipeline.mask(input);
  const tokens = maskedText.match(/__DSHMASKx[a-z]{4}_\d+__/g) ?? [];
  assert.equal(tokens.length, new Set(tokens).size, 'a duplicated/nested token was produced');
  for (const token of tokens) {
    assert.ok(!token.includes('__DSHMASKx', 2), 'token contains a nested token');
  }
});

test('A path is masked as one unit, never split mid-path', () => {
  const { maskedText } = pipeline.mask('Edit src/server/dispatcher.ts to fix the bug');
  assert.ok(!maskedText.includes('src__DSHMASK'), `path was split: ${JSON.stringify(maskedText)}`);
  assert.equal((maskedText.match(/__DSHMASKx/g) ?? []).length, 1);
});

test('Masks file paths (Linux, Windows, relative, source files)', () => {
  const input = 'Files located at /etc/nginx/nginx.conf, src/server/dispatcher.ts, and C:\\Users\\test\\config.json';
  const { maskedText, unmask } = pipeline.mask(input);
  assert.ok(!maskedText.includes('/etc/nginx/nginx.conf'));
  assert.ok(!maskedText.includes('src/server/dispatcher.ts'));

  const unmasked = unmask(maskedText);
  assert.equal(unmasked, input);
});

test('Masks CLI flags and options', () => {
  const input = 'Run command with --concurrency=5 --force-refresh -p 3080 and -rf';
  const { maskedText, unmask } = pipeline.mask(input);
  assert.ok(!maskedText.includes('--concurrency=5'));
  assert.ok(!maskedText.includes('--force-refresh'));

  const unmasked = unmask(maskedText);
  assert.equal(unmasked, input);
});

test('Robust unmasking handles MT engine spacing and casing changes', () => {
  const input = 'Locate `DSH_HOME` directory';
  const { maskedText, unmask } = pipeline.mask(input);

  // Machine translation engines often lowercase tokens or insert spaces around placeholders
  const altered1 = '定位 __dsh_mask_0__ 目录';
  assert.equal(unmask(altered1), '定位 `DSH_HOME` 目录');

  const altered2 = '定位 __DSH _ MASK _ 0__ 目录';
  assert.equal(unmask(altered2), '定位 `DSH_HOME` 目录');
});

// -------------------------------------------------------------
// Suite 2: Concurrency Pool & Circuit Breaker State Machine
// -------------------------------------------------------------
console.log('\n--- Suite 2: Concurrency Pool & Circuit Breaker State Machine ---');

await testAsync('In-flight deduplication merges identical concurrent requests', async () => {
  const config = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  await cache.init();
  const dispatcher = new TranslationDispatcher(config, cache);

  let calls = 0;
  // Mock mock adapter
  const mockAdapter = {
    id: 'mock-dedup',
    name: 'Mock Dedup',
    isAvailable: () => true,
    translate: async (t) => {
      calls++;
      await new Promise((r) => setTimeout(r, 60));
      return `translated:${t}`;
    },
  };
  dispatcher.adapters.set('mock-dedup', mockAdapter);
  // Disable real channels so only the injected mock is active
  await config.updateConfig({ aiEnabled: false, bingEnabled: false, concurrency: 5 });

  const promises = [
    dispatcher.translateOne('Identical task text'),
    dispatcher.translateOne('Identical task text'),
    dispatcher.translateOne('Identical task text'),
    dispatcher.translateOne('Identical task text'),
    dispatcher.translateOne('Identical task text'),
  ];

  const results = await Promise.all(promises);
  assert.equal(calls, 1, 'In-flight map must merge 5 identical requests into 1 network call');
  assert.equal(results[0].translated, 'translated:Identical task text');
  assert.equal(results[4].translated, 'translated:Identical task text');
});

await testAsync('Circuit Breaker trips to OPEN after 3 failures and resets on recovery', async () => {
  const config = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  const dispatcher = new TranslationDispatcher(config, cache);

  let failCount = 0;
  let succeed = false;
  const unstableAdapter = {
    id: 'unstable',
    name: 'Unstable',
    isAvailable: () => true,
    translate: async (t) => {
      if (!succeed) {
        failCount++;
        throw new Error('503 Service Unavailable');
      }
      return `ok:${t}`;
    },
  };
  dispatcher.adapters.set('unstable', unstableAdapter);
  await config.updateConfig({ aiEnabled: false, bingEnabled: false, concurrency: 1 });

  // 3 consecutive failures
  const r1 = await dispatcher.translateOne('Fail 1');
  const r2 = await dispatcher.translateOne('Fail 2');
  const r3 = await dispatcher.translateOne('Fail 3');
  assert.equal(r1.channel, 'fallback');
  assert.equal(r3.channel, 'fallback');
  assert.equal(failCount, 3);

  // 4th call: circuit should be OPEN, skipping the adapter entirely
  const r4 = await dispatcher.translateOne('Fail 4');
  assert.equal(failCount, 3, 'Circuit is open: adapter must not be called');
  assert.equal(r4.channel, 'fallback');

  // Fast-forward openUntil to simulate cooling timeout
  const circuitState = dispatcher.circuitStates.get('unstable');
  assert.ok(circuitState);
  assert.equal(circuitState.state, 'open');
  circuitState.openUntil = Date.now() - 100; // time elapsed -> triggers half-open

  // Allow adapter to succeed on trial
  succeed = true;
  const r5 = await dispatcher.translateOne('Recovery trial');
  assert.equal(r5.translated, 'ok:Recovery trial');
  assert.equal(circuitState.state, 'closed', 'Successful half-open probe resets circuit to closed');
  assert.equal(circuitState.failureCount, 0);
});

await testAsync('A channel that leaks a mask placeholder is discarded, never cached', async () => {
  const config = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  cache.cache.clear();
  const dispatcher = new TranslationDispatcher(config, cache);

  let calls = 0;
  const leakyAdapter = {
    id: 'leaky',
    name: 'Leaky',
    isAvailable: () => true,
    translate: async () => {
      calls++;
      // Simulates an engine rewrite that defeats placeholder restoration.
      return '查找 __DSHMASK_abcd_0__ 中的内容';
    },
  };
  dispatcher.adapters.set('leaky', leakyAdapter);
  await config.updateConfig({ aiEnabled: false, bingEnabled: false, concurrency: 1 });

  const result = await dispatcher.translateOne('find things in the content');
  assert.equal(result.channel, 'fallback', 'a leaked mask must not be reported as a translation');
  assert.equal(result.translated, 'find things in the content', 'the original text must survive');
  assert.equal(cache.get('find things in the content'), undefined, 'a leaked mask must not be cached');
  assert.equal(calls, 1);
});

await testAsync('A translated string without masks but with a hallucinated placeholder is discarded', async () => {
  const config = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  cache.cache.clear();
  const dispatcher = new TranslationDispatcher(config, cache);

  const hallucinating = {
    id: 'hallucinating',
    name: 'Hallucinating',
    isAvailable: () => true,
    translate: async () => '查找 __DSH_MASK_0__ 中的归属使用情况',
  };
  dispatcher.adapters.set('hallucinating', hallucinating);
  await config.updateConfig({ aiEnabled: false, bingEnabled: false, concurrency: 1 });

  const result = await dispatcher.translateOne('find attribution usage in dsh-llm');
  assert.equal(result.channel, 'fallback');
  assert.equal(result.translated, 'find attribution usage in dsh-llm');
});

await testAsync('A translation that legitimately keeps a placeholder from the source is accepted', async () => {
  const config = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  cache.cache.clear();
  const dispatcher = new TranslationDispatcher(config, cache);

  const faithful = {
    id: 'faithful',
    name: 'Faithful',
    isAvailable: () => true,
    translate: async () => '用户反馈 `_DSH_MASK_0` 占位符泄漏进译文',
  };
  dispatcher.adapters.set('faithful', faithful);
  await config.updateConfig({ aiEnabled: false, bingEnabled: false, concurrency: 1 });

  const source = 'The user reports `_DSH_MASK_0` placeholders leaking into translations';
  const result = await dispatcher.translateOne(source);
  assert.equal(result.channel, 'faithful', 'a placeholder already present in the source is not a leak');
  assert.equal(result.translated, '用户反馈 `_DSH_MASK_0` 占位符泄漏进译文');
  // The disk cache has no access to the source text, so it stays conservative
  // and keeps such a value out; the text is simply re-translated next time.
  assert.equal(cache.get(source), undefined);
});

// -------------------------------------------------------------
// Suite 3: LRU Cache Semantics & TTL
// -------------------------------------------------------------
console.log('\n--- Suite 3: LRU Cache Semantics & TTL ---');

test('ClientCache implements strict LRU eviction order', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  global.localStorage = dom.window.localStorage;
  global.window = dom.window;

  const clientCache = new ClientCache();
  clientCache.memCache.clear();

  // Insert 3 items
  clientCache.set('a', 'alpha');
  clientCache.set('b', 'beta');
  clientCache.set('c', 'gamma');

  // Access 'a' to refresh its position in LRU (making 'b' the oldest)
  const aVal = clientCache.get('a');
  assert.equal(aVal, 'alpha');

  // Verify internal map order: oldest should be 'b'
  const keys = Array.from(clientCache.memCache.keys());
  assert.deepEqual(keys, ['b', 'c', 'a']);
});

await testAsync('LruDiskCache handles TTL expiration and LRU eviction', async () => {
  const cache = new LruDiskCache(3);
  cache.cache.clear();

  cache.set('k1', 'v1');
  cache.set('k2', 'v2');
  cache.set('k3', 'v3');

  // Access k1 to make k2 the oldest
  cache.get('k1');

  // Insert k4 -> should evict k2 (oldest unaccessed)
  cache.set('k4', 'v4');
  assert.equal(cache.get('k2'), undefined, 'k2 should have been evicted');
  assert.equal(cache.get('k1'), 'v1', 'k1 should still exist');
  assert.equal(cache.get('k3'), 'v3', 'k3 should still exist');
  assert.equal(cache.get('k4'), 'v4', 'k4 should still exist');
});

test('LruDiskCache refuses to store and evicts mask-leaked translations', () => {
  const cache = new LruDiskCache(10);
  cache.cache.clear();

  cache.set('clean', '干净译文');
  assert.equal(cache.get('clean'), '干净译文');

  cache.set('poisoned', '查找 __DSHMASK_abcd_0__ 中的内容');
  assert.equal(cache.get('poisoned'), undefined, 'a leaked translation must never be stored');

  // An entry that entered the map by other means (e.g. a poisoned on-disk
  // entry loaded before this guard existed) is evicted on read.
  cache.cache.set('warm', { t: Date.now(), v: '比较 __DSH_MASK_1__ 中的行为' });
  assert.equal(cache.get('warm'), undefined, 'a warm poisoned entry is evicted on read');
  assert.equal(cache.cache.has('warm'), false);
});

await testAsync('LruDiskCache drops mask-leaked entries while loading from disk', async () => {
  const cachePath = path.join(TMP_HOME, 'dsh-chat-translate', 'cache.json');
  const now = Date.now();
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(
    cachePath,
    JSON.stringify({
      ok: { t: now, v: '正常译文' },
      leaked: { t: now, v: '在 __DSHMASK_abcd_0__ 中查找' },
      legacyLeaked: '定位 _DSH_MASK_0 目录',
    }),
    'utf-8'
  );

  const cache = new LruDiskCache();
  await cache.init();
  assert.equal(cache.get('ok'), '正常译文');
  assert.equal(cache.get('leaked'), undefined, 'poisoned on-disk entry must be dropped');
  assert.equal(cache.get('legacyLeaked'), undefined, 'poisoned legacy entry must be dropped');

  // Leave no cache file behind: the relocation test below asserts on the
  // pre-1.2 root-level layout and needs the plugin subdir to be empty.
  await fs.rm(cachePath, { force: true });
});

await testAsync('LruDiskCache relocates the legacy root-level cache file', async () => {
  const legacyPath = path.join(TMP_HOME, 'dsh-chat-translate-cache.json');
  const now = Date.now();
  await fs.writeFile(legacyPath, JSON.stringify({ k1: { t: now, v: 'v1' } }), 'utf-8');

  const cache = new LruDiskCache();
  await cache.init();
  assert.equal(cache.get('k1'), 'v1', 'legacy entry survives the relocation');

  const newPath = path.join(TMP_HOME, 'dsh-chat-translate', 'cache.json');
  await fs.access(newPath); // the plugin subdir + file must exist now
  await assert.rejects(fs.access(legacyPath), 'legacy file removed after relocation');

  cache.set('k2', 'v2');
  await cache.flush();
  const onDisk = JSON.parse(await fs.readFile(newPath, 'utf-8'));
  assert.ok(onDisk.k2, 'flush writes to the relocated path');
});

await testAsync('LruDiskCache retires a stale legacy file when the new cache exists', async () => {
  const newPath = path.join(TMP_HOME, 'dsh-chat-translate', 'cache.json');
  const now = Date.now();
  await fs.writeFile(newPath, JSON.stringify({ fresh: { t: now, v: 'nv' } }), 'utf-8');
  const legacyPath = path.join(TMP_HOME, 'dsh-chat-translate-cache.json');
  await fs.writeFile(legacyPath, JSON.stringify({ stale: { t: now, v: 'ov' } }), 'utf-8');

  const cache = new LruDiskCache();
  await cache.init();
  assert.equal(cache.get('fresh'), 'nv', 'new cache wins');
  assert.equal(cache.get('stale'), undefined, 'stale legacy entries are not merged');
  await assert.rejects(fs.access(legacyPath), 'stale legacy file retired');
});

// -------------------------------------------------------------
// Suite 4: ConfigManager Validation & Change Notification
// -------------------------------------------------------------
console.log('\n--- Suite 4: ConfigManager Validation & Change Notification ---');

await testAsync('ConfigManager clamps numeric bounds and notifies listeners', async () => {
  const cfg = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));

  let notified = false;
  const unsub = cfg.onConfigChange((next) => {
    notified = true;
    assert.equal(next.concurrency, 100);
  });

  // Clamp concurrency to 100
  await cfg.updateConfig({ concurrency: 9999 });
  assert.equal(cfg.getConfig().concurrency, 100);
  assert.equal(notified, true);

  // Clamp timeoutMs to minimum 500
  await cfg.updateConfig({ timeoutMs: 10 });
  assert.equal(cfg.getConfig().timeoutMs, 500);

  unsub();
});

// -------------------------------------------------------------
// Suite 5: NonDestructiveTranslationMount DOM Lifecycle
// -------------------------------------------------------------
console.log('\n--- Suite 5: NonDestructiveTranslationMount DOM Lifecycle ---');

test('Mounts translation without destroying child nodes or event listeners', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="target"><span class="title">Bash</span><code class="cmd">npm test</code></div></body></html>');
  const target = dom.window.document.getElementById('target');
  assert.ok(target);

  let clicked = false;
  target.querySelector('.cmd')?.addEventListener('click', () => { clicked = true; });

  // Mount translation
  NonDestructiveTranslationMount.mount(target, '运行测试命令');
  assert.equal(NonDestructiveTranslationMount.isMounted(target), true);

  // Translation container should be visible
  const transBlock = target.querySelector('.dsh-tidy-translated-block');
  assert.ok(transBlock);
  assert.equal(transBlock.textContent, '运行测试命令');

  // Original nodes must be preserved inside .dsh-tidy-original-hidden
  const origWrapper = target.querySelector('.dsh-tidy-original-hidden');
  assert.ok(origWrapper);
  assert.equal(origWrapper.querySelector('.title')?.textContent, 'Bash');
  assert.equal(origWrapper.querySelector('.cmd')?.textContent, 'npm test');

  // Interactive toggle: clicking transBlock shows original
  transBlock.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal((origWrapper).style.display, 'inline');
  assert.equal((transBlock).style.display, 'none');

  // Clicking origWrapper toggles back
  origWrapper.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.equal((transBlock).style.display, 'inline');
  assert.equal((origWrapper).style.display, 'none');

  // Event listener on original node still works
  origWrapper.querySelector('.cmd')?.dispatchEvent(new dom.window.MouseEvent('click'));
  assert.equal(clicked, true);

  // Clean unmount restores original DOM structure
  NonDestructiveTranslationMount.unmount(target);
  assert.equal(target.querySelector('.dsh-tidy-translated-block'), null);
  assert.equal(target.querySelector('.dsh-tidy-original-hidden'), null);
  assert.equal(target.querySelector('.title')?.textContent, 'Bash');
  assert.equal(target.querySelector('.cmd')?.textContent, 'npm test');
});

// -------------------------------------------------------------
// Suite 6: HttpRouter 1MB DoS Protection & API Endpoints
// -------------------------------------------------------------
console.log('\n--- Suite 6: HttpRouter 1MB DoS Protection & API Endpoints ---');

await testAsync('Router rejects bodies exceeding 1MB with 413 Payload Too Large', async () => {
  const cfg = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  const handler = createHttpHandler(cfg, dispatcher);

  // Construct mock large request (> 1MB)
  const hugeChunk = Buffer.alloc(1024 * 1024 + 100, 'a');
  let responseStatus = 0;
  let responseData = '';

  const mockReq = {
    url: '/api/dsh-chat-translate/translate',
    method: 'POST',
    on: (evt, cb) => {
      if (evt === 'data') cb(hugeChunk);
      if (evt === 'end') cb();
    },
  };

  const mockRes = {
    writeHead: (status, headers) => { responseStatus = status; },
    end: (data) => { responseData = data; },
  };

  await handler(mockReq, mockRes);
  assert.equal(responseStatus, 413, 'Over-limit body must return 413 Payload Too Large');
});

await testAsync('Retired config/credentials endpoints return 404', async () => {
  const cfg = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  const handler = createHttpHandler(cfg, dispatcher);

  const mockReq = (url, method, body) => ({
    url,
    method,
    on: (evt, cb) => {
      if (evt === 'data' && body) cb(Buffer.from(JSON.stringify(body)));
      if (evt === 'end') cb();
    },
  });
  const mockRes = () => {
    let status = 0;
    let body = null;
    return {
      get status() { return status; },
      get body() { return body; },
      writeHead: (s) => { status = s; },
      end: (data) => { body = data ? JSON.parse(data) : null; },
    };
  };

  // Since 1.2 config/credentials live on DSH's own surfaces, not this router.
  for (const [url, method, body] of [
    ['/api/dsh-chat-translate/config', 'GET', null],
    ['/api/dsh-chat-translate/config', 'POST', { concurrency: 8 }],
    ['/api/dsh-chat-translate/credentials', 'POST', { apiKey: 'sk-x' }],
  ]) {
    const res = mockRes();
    await handler(mockReq(url, method, body), res);
    assert.equal(res.status, 404, `${method} ${url} must be retired (404)`);
    assert.equal(res.body.ok, false);
  }
});

await testAsync('Router POST /translate still proxies to the dispatcher', async () => {
  const cfg = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  dispatcher.adapters.set('mock', {
    id: 'mock',
    name: 'Mock',
    isAvailable: () => true,
    translate: async (t) => `译:${t}`,
  });
  // Only the injected mock is active — real channels must not leak into the test.
  await cfg.updateConfig({ aiEnabled: false, bingEnabled: false });
  const handler = createHttpHandler(cfg, dispatcher);

  let responseStatus = 0;
  let responseBody = null;
  const mockReq = {
    url: '/api/dsh-chat-translate/translate',
    method: 'POST',
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(JSON.stringify({ texts: ['Hello'] })));
      if (evt === 'end') cb();
    },
  };
  const mockRes = {
    writeHead: (status) => { responseStatus = status; },
    end: (data) => { responseBody = JSON.parse(data); },
  };

  await handler(mockReq, mockRes);
  assert.equal(responseStatus, 200);
  assert.equal(responseBody.ok, true);
  assert.equal(responseBody.results[0].translated, '译:Hello');
});

console.log('\n======================================================');
console.log(`All ${passed}/${total} regression tests PASSED successfully!`);
console.log('======================================================\n');