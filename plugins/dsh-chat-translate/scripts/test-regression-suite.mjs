// Comprehensive Automated Regression Test Suite for dsh-chat-translate
// Tests:
// 1. ContentMaskingPipeline placeholder masking & robust unmasking
// 2. All reply blocks dispatched regardless of language (no skipping; Chinese is rewritten too)
// 3. Serial request queue & failure-reason classification (user-initiated retries)
// 4. LruDiskCache revision gating, LRU eviction and TTL handling
// 5. ConfigManager live-config reads and change notification
// 6. HttpRouter DoS 1MB protection and endpoint handling

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Isolate all file-backed state (config/cache/credentials) under ./tmp so the
// suite never reads or overwrites the real ~/.dsh files (system /tmp is
// off-limits per repo instructions).
const TMP_ROOT = path.join(import.meta.dirname, 'tmp');
await fs.mkdir(TMP_ROOT, { recursive: true });
const TMP_HOME = await fs.mkdtemp(path.join(TMP_ROOT, 'suite-'));
process.env.DSH_HOME = TMP_HOME;

import { ContentMaskingPipeline, MaskRestoreError, isMaskLeak } from '../src/server/pipeline/masking.ts';
import { hasMaskResidue } from '../src/server/pipeline/mask-tokens.ts';
import { TranslationDispatcher } from '../src/server/dispatcher.ts';
import { ConfigManager, createLiveConfigSource, DEFAULT_CONFIG } from '../src/server/config.ts';
import { apply as applyHost, Config as HostConfig, inject as hostInject } from '../src/index.ts';
import { LruDiskCache } from '../src/server/cache.ts';
import { PROMPT_REVISION } from '../src/server/prompt-revision.ts';
import { CredentialsReader } from '../src/server/credentials.ts';
import {
  createFetchRoutes,
  REPLY_ROUTE_PATH,
  TEST_CHANNEL_ROUTE_PATH,
} from '../src/server/router.ts';
import { createFakeSettingsEntry, createFakeCredentials } from './test-helpers.mjs';

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
  };
  for (const [name, out] of Object.entries(poisoned)) {
    assert.throws(() => unmask(out), MaskRestoreError, `accepted: ${name} — ${JSON.stringify(out)}`);
  }
});

test('isMaskLeak flags current-format tokens only', () => {
  assert.equal(isMaskLeak('查看 ⟦abcd3⟧ 中的归属使用情况'), true);
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

// -------------------------------------------------------------
// Suite 2: Reply Cache & Failure Semantics (one first-run per row)
// -------------------------------------------------------------
console.log('\n--- Suite 2: Reply Cache & Failure Semantics ---');

await testAsync('A repeated reply block is answered from the cache, not the adapter', async () => {
  const entry = createFakeSettingsEntry();
  const config = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
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
  dispatcher.adapters.set('openai', mockAdapter);
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const first = await dispatcher.translateReplyBlocks(['Identical task text']);
  const second = await dispatcher.translateReplyBlocks(['Identical task text']);
  assert.equal(calls, 1, 'the cache must answer the second request, not the adapter');
  assert.equal(first[0].translated, 'translated:Identical task text');
  assert.equal(second[0].translated, 'translated:Identical task text');
  assert.equal(second[0].cached, true);
});

await testAsync('A transport failure stays transport; the next call may pass freely', async () => {
  // 落定的行等的是用户的点击，不是冷却期：下一次调用（新行的首跑，或点击
  // 后同代文本的重发）照旧打到适配器。
  const entry = createFakeSettingsEntry();
  const config = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  const dispatcher = new TranslationDispatcher(config, cache);

  let fail = true;
  let calls = 0;
  const unstableAdapter = {
    id: 'unstable',
    name: 'Unstable',
    isAvailable: () => true,
    translate: async (t) => {
      calls++;
      if (fail) throw new Error('503 Service Unavailable');
      return `ok:${t}`;
    },
  };
  dispatcher.adapters.set('openai', unstableAdapter);
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const down = await dispatcher.translateReplyBlocks(['Fail 1']);
  assert.equal(down[0].ok, false);
  assert.equal(down[0].reason, 'transport');

  fail = false;
  const revived = await dispatcher.translateReplyBlocks(['Fail 1']);
  assert.equal(revived[0].ok, true, '无冷却、无额度：下一次调用直接打到通道');
  assert.equal(revived[0].translated, 'ok:Fail 1');
  assert.ok(calls >= 2);
});

await testAsync('A channel that mangles a mask token is discarded, never cached', async () => {
  const entry = createFakeSettingsEntry();
  const config = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
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
  dispatcher.adapters.set('openai', leakyAdapter);
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const result = (await dispatcher.translateReplyBlocks([source]))[0];
  assert.equal(result.ok, false, 'a mangled mask must not be reported as a translation');
  assert.equal(result.reason, 'content');
  assert.equal(result.translated, source, 'the original text must survive');
  assert.equal(cache.get(source), undefined, 'a mangled mask must not be cached');
  assert.equal(calls, 2, 'the batch and its per-piece retry both run');
});

await testAsync('A channel that drops a mask token keeps its fragment out of the cache', async () => {
  const entry = createFakeSettingsEntry();
  const config = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
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
  dispatcher.adapters.set('openai', dropping);
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const result = (await dispatcher.translateReplyBlocks([source]))[0];
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'content', '丢片段是内容拒收');
  assert.equal(result.translated, source);
  assert.equal(cache.get(source), undefined);
});

await testAsync('A translated string without masks but with a hallucinated placeholder is discarded', async () => {
  const entry = createFakeSettingsEntry();
  const config = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  cache.cache.clear();
  const dispatcher = new TranslationDispatcher(config, cache);

  const hallucinating = {
    id: 'hallucinating',
    name: 'Hallucinating',
    isAvailable: () => true,
    translate: async () => '查找 ⟦abcd0⟧ 中的归属使用情况',
  };
  dispatcher.adapters.set('openai', hallucinating);
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const result = (await dispatcher.translateReplyBlocks(['find attribution usage in dsh-llm']))[0];
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'content', '凭空造出占位符同样是内容拒收');
  assert.equal(result.translated, 'find attribution usage in dsh-llm');
});

await testAsync('A translation that keeps a placeholder the source documented is accepted', async () => {
  const entry = createFakeSettingsEntry();
  const config = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  cache.cache.clear();
  const dispatcher = new TranslationDispatcher(config, cache);

  const source = 'The user reports `__DSH_MASK_0__` placeholders leaking into translations';
  const { maskedText, unmask } = pipeline.mask(source);
  assert.equal(unmask(maskedText), source, 'a documented placeholder must round-trip');
  assert.ok(!maskedText.includes('__DSH_MASK_0__'), 'the token-shaped string is masked like any other code fragment');

  const faithful = {
    id: 'faithful',
    name: 'Faithful',
    isAvailable: () => true,
    // A faithful engine returns the token it was given, in place. The inline
    // code span (backticks included) IS the fragment, so no backticks to add.
    translate: async (text) => `用户反馈 ${/⟦[a-z]{4}\d+⟧/.exec(text)[0]} 占位符泄漏进译文`,
  };
  dispatcher.adapters.set('openai', faithful);
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const result = (await dispatcher.translateReplyBlocks([source]))[0];
  assert.equal(result.ok, true, 'a placeholder the source documented is not a leak');
  assert.equal(result.translated, '用户反馈 `__DSH_MASK_0__` 占位符泄漏进译文');
});

// -------------------------------------------------------------
// Suite 3: LRU Cache Semantics & TTL
// -------------------------------------------------------------
console.log('\n--- Suite 3: LRU Cache Semantics & TTL ---');

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

  cache.set('poisoned', '查找 ⟦abcd0⟧ 中的内容');
  assert.equal(cache.get('poisoned'), undefined, 'a leaked translation must never be stored');

  // An entry that entered the map by other means (e.g. a poisoned on-disk
  // entry) is evicted on read: the leak check guards every read path.
  cache.cache.set('warm', { t: Date.now(), v: '比较 ⟦wxyz1⟧ 中的行为' });
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
      rev: PROMPT_REVISION,
      entries: {
        ok: { t: now, v: '正常译文' },
        leaked: { t: now, v: '在 ⟦abcd0⟧ 中查找' },
        // 无时间戳 / 非字符串译文：陌生形态，读取时被丢掉。
        noTime: { v: '没有时间戳' },
        notString: { t: now, v: 42 },
      },
    }),
    'utf-8'
  );

  const cache = new LruDiskCache();
  await cache.init();
  assert.equal(cache.get('ok'), '正常译文');
  assert.equal(cache.get('leaked'), undefined, 'poisoned on-disk entry must be dropped');
  assert.equal(cache.get('noTime'), undefined, 'entry without a timestamp must be dropped');
  assert.equal(cache.get('notString'), undefined, 'entry with a non-string value must be dropped');

  // Leave no cache file behind: other tests in this suite start from an empty
  // plugin cache directory.
  await fs.rm(cachePath, { force: true });
});

// -------------------------------------------------------------
// Suite 4: ConfigManager Validation & Change Notification
// -------------------------------------------------------------
console.log('\n--- Suite 4: ConfigManager Live Config & Change Notification ---');

await testAsync('ConfigManager reads the committed config and notifies subscribers', async () => {
  const entry = createFakeSettingsEntry();
  const cfg = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));

  const seen = [];
  const unsub = cfg.onConfigChange((next) => {
    seen.push(next.aiTimeoutMs);
  });

  // One committed live edit (what the browser configuration form writes).
  await entry.update({ aiTimeoutMs: 120000, baseUrl: 'http://x' });
  assert.equal(cfg.getConfig().aiTimeoutMs, 120000, 'the facade reads the committed value');
  assert.equal(cfg.getConfig().baseUrl, 'http://x');
  assert.deepEqual(seen, [120000], 'the change notification carries the committed value');

  unsub();
  await entry.update({ aiTimeoutMs: 90000 });
  assert.deepEqual(seen, [120000], 'an unsubscribed listener is not called');
});

// -------------------------------------------------------------
// Suite 6: Connection exact Fetch routes (translation proxy surface)
// -------------------------------------------------------------
console.log('\n--- Suite 6: Connection exact Fetch routes ---');

function makeRoutes() {
  const entry = createFakeSettingsEntry();
  const cfg = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  return { cfg, entry, dispatcher, routes: createFetchRoutes(dispatcher) };
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
      { path: REPLY_ROUTE_PATH, methods: ['POST'], requestBody: 'buffered' },
      { path: TEST_CHANNEL_ROUTE_PATH, methods: ['POST'], requestBody: 'buffered' },
    ]
  );
});

await testAsync('Reply route answers a POST with dispatcher results', async () => {
  const { entry, dispatcher, routes } = makeRoutes();
  dispatcher.adapters.set('openai', {
    id: 'openai',
    name: 'Mock',
    isAvailable: () => true,
    translate: async (t) => '译:' + t,
  });
  await entry.update({ baseUrl: 'http://x', model: 'm' });
  const route = routes.find((r) => r.path === REPLY_ROUTE_PATH);
  const res = await route.fetch(post(REPLY_ROUTE_PATH, { blocks: ['Hello'] }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.results[0].translated, '译:Hello');
});

await testAsync('Reply route answers a malformed body with 400', async () => {
  const { routes } = makeRoutes();
  const route = routes.find((r) => r.path === REPLY_ROUTE_PATH);
  const res = await route.fetch(post(REPLY_ROUTE_PATH, '{not json'));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).ok, false);
});

await testAsync('Test-channel route proxies the probe through the dispatcher', async () => {
  const { dispatcher, routes } = makeRoutes();
  dispatcher.testChannel = async (id) => ({ ok: id === 'openai', latencyMs: 1 });
  const route = routes.find((r) => r.path === TEST_CHANNEL_ROUTE_PATH);
  const res = await route.fetch(post(TEST_CHANNEL_ROUTE_PATH, { channel: 'openai' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, latencyMs: 1 });
});

// -------------------------------------------------------------
// Suite 7: Host plugin contract (0.1.7 Config schema + apply())
// -------------------------------------------------------------
console.log('\n--- Suite 7: Host Config schema & apply() wiring ---');

test('Config declares every field volatile so form and apply share one value', () => {
  const result = HostConfig['~standard'].validate({});
  assert.equal(result.issues, undefined, 'the schema accepts an empty profile row');
  const value = result.value;
  assert.deepEqual(Object.keys(value).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const [field, ref] of Object.entries(value)) {
    assert.equal(typeof ref.get, 'function', `${field} must resolve to a live ref`);
  }
  // Schema defaults, not the removed owner-scope registration.
  assert.equal(value.enabled.get(), DEFAULT_CONFIG.enabled);
  assert.equal(value.aiTimeoutMs.get(), DEFAULT_CONFIG.aiTimeoutMs);
  assert.equal(value.baseUrl.get(), DEFAULT_CONFIG.baseUrl);
  assert.equal(value.model.get(), DEFAULT_CONFIG.model);
});

test('createLiveConfigSource forwards a committed live edit to subscribers', () => {
  const held = { ...DEFAULT_CONFIG };
  const refs = Object.fromEntries(
    Object.keys(DEFAULT_CONFIG).map((field) => [field, { get: () => held[field] }])
  );
  // Stands in for `ctx.on('loader/volatile-update', …)` and its real disposer.
  const commitListeners = new Set();
  const source = createLiveConfigSource((listener) => {
    commitListeners.add(listener);
    return () => commitListeners.delete(listener);
  }, refs);
  const fire = () => { for (const listener of [...commitListeners]) listener(); };

  assert.equal(source.get().aiTimeoutMs, DEFAULT_CONFIG.aiTimeoutMs);
  const seen = [];
  const off = source.watch((next) => seen.push(next.aiTimeoutMs));

  // DSH commits the accepted edit into the refs, then fires the event.
  held.aiTimeoutMs = 120000;
  fire();
  assert.deepEqual(seen, [120000], 'the subscriber sees the committed value');

  off();
  held.aiTimeoutMs = 20000;
  fire();
  assert.deepEqual(seen, [120000], 'an unsubscribed listener is not called');
});

test('apply() wires the exact routes and opts out of the auto settings page', () => {
  const routes = [];
  const policies = [];
  const held = { ...DEFAULT_CONFIG };
  const config = Object.fromEntries(
    Object.keys(DEFAULT_CONFIG).map((field) => [field, { get: () => held[field] }])
  );
  const ctx = {
    settings: {
      configure: (presentation) => { policies.push(presentation); return () => {}; },
    },
    credentials: {
      resolve: async () => undefined,
      describe: async () => ({ configured: false, writable: true }),
      set: async () => {},
      unset: async () => {},
    },
    connection: {
      fetch: { register: (route) => { routes.push(route); return async () => {}; } },
    },
    on: () => () => {},
    effect: (fn) => { fn(); return () => {}; },
    inject: (names, callback) => { callback(ctx); },
  };

  // Hard dependencies are the DSH-owned config/secret surfaces.
  assert.deepEqual(hostInject, ['settings', 'credentials']);
  applyHost(ctx, config);

  assert.deepEqual(
    routes.map((route) => route.path),
    [REPLY_ROUTE_PATH, TEST_CHANNEL_ROUTE_PATH],
    'the connection service receives the plugin\'s two exact routes'
  );
  assert.deepEqual(policies, [{ auto: false }], 'this plugin owns its settings page');
});

await fs.rm(TMP_HOME, { recursive: true, force: true });

console.log('\n======================================================');
console.log(`All ${passed}/${total} regression tests PASSED successfully!`);
console.log('======================================================\n');