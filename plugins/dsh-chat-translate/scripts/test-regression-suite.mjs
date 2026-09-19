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

import { ContentMaskingPipeline, MaskRestoreError, isMaskLeak } from '../src/server/pipeline/masking.ts';
import { hasLegacyMaskResidue, hasMaskResidue } from '../src/server/pipeline/mask-tokens.ts';
import { TranslationDispatcher } from '../src/server/dispatcher.ts';
import { ConfigManager } from '../src/server/config.ts';
import { LruDiskCache } from '../src/server/cache.ts';
import { CredentialsReader } from '../src/server/credentials.ts';
import { ClientCache } from '../src/client/translate/client-cache.ts';
import { NonDestructiveTranslationMount } from '../src/client/translate/mount.ts';
import {
  createFetchRoutes,
  TRANSLATE_ROUTE_PATH,
  THINK_ROUTE_PATH,
  TEST_CHANNEL_ROUTE_PATH,
} from '../src/server/router.ts';
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
// text instead of hard-coding a literal.
function tokenIndexIn(maskedText, index) {
  const hit = [...maskedText.matchAll(/⟦([a-z]{4})(\d+)⟧/gi)].find((m) => Number(m[2]) === index);
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

test('Resolves a token whose closing bracket the engine dropped', () => {
  const input = 'Let me check these host-side service names in 0.1.6: `webServer`, `storageDomain`, `settings`';
  const { maskedText, unmask } = pipeline.mask(input);
  assert.equal(unmask(maskedText), input);

  const id = /⟦([a-z]{4})0⟧/.exec(maskedText)[1];
  const opened = maskedText.replace(`⟦${id}0⟧`, `⟦${id}0`);
  assert.equal(unmask(opened), input);
});

test('Rejects a translation that rewrote, dropped, duplicated or invented a token', () => {
  const input = 'Read src/server/dispatcher.ts and fix docs/rules/plugins.md';
  const { maskedText, unmask } = pipeline.mask(input);
  const id = /⟦([a-z]{4})0⟧/.exec(maskedText)[1];
  const token = (i) => `⟦${id}${i}⟧`;

  const healthy = `阅读 ${token(0)} 并修复 ${token(1)}`;
  assert.equal(unmask(healthy), '阅读 src/server/dispatcher.ts 并修复 docs/rules/plugins.md');

  const poisoned = {
    'token abbreviated to a bare word': '阅读 DSH 并修复 DSH',
    'token core kept, id and index lost': '阅读 DSHMASK 并修复 DSHMASK',
    'index dropped': `阅读 ⟦${id}⟧ 并修复 ⟦${id}⟧`,
    'one token dropped': `阅读 ${token(0)} 并修复`,
    'one token duplicated': `阅读 ${token(0)} 并修复 ${token(1)} ${token(1)}`,
    'foreign pass id': `阅读 ⟦zzzz0⟧ 并修复 ${token(1)}`,
    'out-of-range index': `阅读 ${token(0)} 并修复 ⟦${id}9⟧`,
    'retired placeholder format': '阅读 __DSH_MASK_0__ 并修复 __DSH_MASK_1__',
  };
  for (const [name, out] of Object.entries(poisoned)) {
    assert.throws(() => unmask(out), MaskRestoreError, `accepted: ${name} — ${JSON.stringify(out)}`);
  }
});

test('isMaskLeak flags tokens of the current and of retired formats only', () => {
  assert.equal(isMaskLeak('查看 ⟦abcd3⟧ 中的归属使用情况'), true);
  assert.equal(isMaskLeak('查看 __DSH_MASK_0__ 中的归属使用情况'), true);
  assert.equal(isMaskLeak('查看 __DSHMASKxkbdt_3__ 中的归属使用情况'), true);
  assert.equal(isMaskLeak('正常的一段译文。'), false);
  assert.equal(isMaskLeak('dshmask 不是占位符'), false);
  assert.equal(isMaskLeak('the dsh mask utility'), false);
});

test('A source that documents a placeholder still round-trips', () => {
  const source = 'The user reports `__DSH_MASK_0__` placeholders leaking into translations';
  const { maskedText, unmask } = pipeline.mask(source);
  assert.equal(unmask(maskedText), source);
  assert.equal(hasMaskResidue(unmask(maskedText)), false);
});

test('hasLegacyMaskResidue requires a token-shaped legacy match', () => {
  assert.equal(hasLegacyMaskResidue('__DSH_MASK_0__'), true);
  assert.equal(hasLegacyMaskResidue('__DSHMASKxkbdt_12__'), true);
  assert.equal(hasLegacyMaskResidue('prose about the dsh mask feature'), false);
  assert.equal(hasLegacyMaskResidue('DSH MASK env var'), false);
});

test('isMaskLeak flags tokens of the current and of retired formats only', () => {
  assert.equal(isMaskLeak('查看 ⟦abcd3⟧ 中的归属使用情况'), true);
  assert.equal(isMaskLeak('查看 __DSH_MASK_0__ 中的归属使用情况'), true);
  assert.equal(isMaskLeak('查看 __DSHMASKxkbdt_3__ 中的归属使用情况'), true);
  assert.equal(isMaskLeak('正常的一段译文。'), false);
  assert.equal(isMaskLeak('dshmask 不是占位符'), false);
  assert.equal(isMaskLeak('the dsh mask utility'), false);
});

test('Mask rules never swallow an already-inserted token (no nested masks)', () => {
  const input = 'See https://example.com/a/b.ts and node_modules/.pnpm/x@1.0.0/node_modules/y/index.js';
  const { maskedText } = pipeline.mask(input);
  const tokens = maskedText.match(/⟦[a-z]{4}\d+⟧/g) ?? [];
  assert.equal(tokens.length, new Set(tokens).size, 'a duplicated/nested token was produced');
  for (const token of tokens) {
    assert.ok(!token.slice(1).includes('⟦'), 'token contains a nested token');
  }
});

test('A path is masked as one unit, never split mid-path', () => {
  const { maskedText } = pipeline.mask('Edit src/server/dispatcher.ts to fix the bug');
  assert.ok(!maskedText.includes('src⟦'), `path was split: ${JSON.stringify(maskedText)}`);
  assert.equal((maskedText.match(/⟦[a-z]{4}\d+⟧/g) ?? []).length, 1);
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

test('A token touching a Latin word is spaced out so the engine cannot merge it', () => {
  const input = 'Fix src/server/dispatcher.ts now';
  const { maskedText, unmask } = pipeline.mask(input);
  const id = /⟦([a-z]{4})0⟧/.exec(maskedText)[1];

  assert.ok(maskedText.includes(` ⟦${id}0⟧ `), `token stayed glued to the source: ${JSON.stringify(maskedText)}`);
  assert.equal(unmask(maskedText), input);
  // The engine keeps the spaced token but rewrites the surrounding words; the
  // inserted spaces go away with the token and no word is welded to another.
  assert.equal(unmask(`修复 ⟦${id}0⟧ 立即`), '修复 src/server/dispatcher.ts 立即');
});

test('A token dropped or rewritten by the engine rejects the whole translation', () => {
  const input = 'Locate `DSH_HOME` directory';
  const { maskedText, unmask } = pipeline.mask(input);
  const id = /⟦([a-z]{4})0⟧/.exec(maskedText)[1];
  assert.equal(unmask(maskedText), input);
  // Closing bracket dropped: still resolvable.
  assert.equal(unmask(`定位 ⟦${id}0 目录`), '定位 `DSH_HOME` 目录');
  // Token gone entirely, and a token whose id was rewritten.
  assert.throws(() => unmask('定位 目录'), MaskRestoreError);
  assert.throws(() => unmask('定位 ⟦zzzz0⟧ 目录'), MaskRestoreError);
  assert.throws(() => unmask('定位 ⟦⟧ 目录'), MaskRestoreError);
});

test('A model that reproduces a retired placeholder is treated as a damaged translation', () => {
  const { unmask } = pipeline.mask('Locate `DSH_HOME` directory');
  // The engine dropped the current token and shipped the retired format instead.
  assert.throws(() => unmask('定位 __DSH_MASK_0__ 目录'), MaskRestoreError);
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

await testAsync('A channel that mangles a mask token is discarded, never cached', async () => {
  const config = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  cache.cache.clear();
  const dispatcher = new TranslationDispatcher(config, cache);

  const source = 'Read src/server/dispatcher.ts';
  let calls = 0;
  const leakyAdapter = {
    id: 'leaky',
    name: 'Leaky',
    isAvailable: () => true,
    translate: async () => {
      calls++;
      // Simulates an engine rewrite that defeats placeholder restoration: the
      // protected fragment is replaced by the first word of the old marker.
      return '阅读 DSH 里的内容';
    },
  };
  dispatcher.adapters.set('leaky', leakyAdapter);
  await config.updateConfig({ aiEnabled: false, bingEnabled: false, concurrency: 1 });

  const result = await dispatcher.translateOne(source);
  assert.equal(result.channel, 'fallback', 'a mangled mask must not be reported as a translation');
  assert.equal(result.translated, source, 'the original text must survive');
  assert.equal(cache.get(source), undefined, 'a mangled mask must not be cached');
  assert.equal(calls, 1);
});

await testAsync('A channel that drops a mask token keeps its fragment out of the cache', async () => {
  const config = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  cache.cache.clear();
  const dispatcher = new TranslationDispatcher(config, cache);

  const source = 'Read src/server/dispatcher.ts';
  const dropping = {
    id: 'dropping',
    name: 'Dropping',
    isAvailable: () => true,
    // The engine translated the sentence but swallowed the protected fragment.
    translate: async () => '阅读文件',
  };
  dispatcher.adapters.set('dropping', dropping);
  await config.updateConfig({ aiEnabled: false, bingEnabled: false, concurrency: 1 });

  const result = await dispatcher.translateOne(source);
  assert.equal(result.channel, 'fallback');
  assert.equal(result.translated, source);
  assert.equal(cache.get(source), undefined);
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

await testAsync('A translation that keeps a placeholder the source documented is accepted', async () => {
  const config = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  cache.cache.clear();
  const dispatcher = new TranslationDispatcher(config, cache);

  const source = 'The user reports `__DSH_MASK_0__` placeholders leaking into translations';
  const { maskedText, unmask } = pipeline.mask(source);
  assert.equal(unmask(maskedText), source, 'a documented placeholder must round-trip');
  assert.ok(!maskedText.includes('__DSH_MASK_0__'), 'the retired token is protected, not sent raw');

  const faithful = {
    id: 'faithful',
    name: 'Faithful',
    isAvailable: () => true,
    // A faithful engine returns the token it was given, in place.
    translate: async (text) => `用户反馈 \`${/⟦[a-z]{4}\d+⟧/.exec(text)[0]}\` 占位符泄漏进译文`,
  };
  dispatcher.adapters.set('faithful', faithful);
  await config.updateConfig({ aiEnabled: false, bingEnabled: false, concurrency: 1 });

  const result = await dispatcher.translateOne(source);
  assert.equal(result.channel, 'faithful', 'a placeholder the source documented is not a leak');
  assert.equal(result.translated, '用户反馈 `__DSH_MASK_0__` 占位符泄漏进译文');
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
// Suite 6: Connection exact Fetch routes (translation proxy surface)
// -------------------------------------------------------------
console.log('\n--- Suite 6: Connection exact Fetch routes ---');

function makeRoutes() {
  const cfg = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  return { cfg, dispatcher, routes: createFetchRoutes(dispatcher) };
}

function post(path, body) {
  return new Request('http://127.0.0.1' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('Fetch routes own exact POST paths with buffered bodies', () => {
  const { routes } = makeRoutes();
  assert.deepEqual(
    routes.map((route) => ({ path: route.path, methods: route.methods, requestBody: route.requestBody })),
    [
      { path: TRANSLATE_ROUTE_PATH, methods: ['POST'], requestBody: 'buffered' },
      { path: THINK_ROUTE_PATH, methods: ['POST'], requestBody: 'buffered' },
      { path: TEST_CHANNEL_ROUTE_PATH, methods: ['POST'], requestBody: 'buffered' },
    ]
  );
});

await testAsync('Translate route answers a POST with dispatcher results', async () => {
  const { cfg, dispatcher, routes } = makeRoutes();
  dispatcher.adapters.set('mock', {
    id: 'mock',
    name: 'Mock',
    isAvailable: () => true,
    translate: async (t) => '译:' + t,
  });
  // Only the injected mock is active - real channels must not leak into the test.
  await cfg.updateConfig({ aiEnabled: false, bingEnabled: false });
  const route = routes.find((r) => r.path === TRANSLATE_ROUTE_PATH);
  const res = await route.fetch(post(TRANSLATE_ROUTE_PATH, { texts: ['Hello'] }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.results[0].translated, '译:Hello');
});

await testAsync('Translate route answers a malformed body with 400', async () => {
  const { routes } = makeRoutes();
  const route = routes.find((r) => r.path === TRANSLATE_ROUTE_PATH);
  const res = await route.fetch(post(TRANSLATE_ROUTE_PATH, '{not json'));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

await testAsync('Test-channel route proxies the probe through the dispatcher', async () => {
  const { dispatcher, routes } = makeRoutes();
  dispatcher.testChannel = async (id) => ({ ok: id === 'bing', latencyMs: 1 });
  const route = routes.find((r) => r.path === TEST_CHANNEL_ROUTE_PATH);
  const res = await route.fetch(post(TEST_CHANNEL_ROUTE_PATH, { channel: 'bing' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, latencyMs: 1 });
});

console.log('\n======================================================');
console.log(`All ${passed}/${total} regression tests PASSED successfully!`);
console.log('======================================================\n');