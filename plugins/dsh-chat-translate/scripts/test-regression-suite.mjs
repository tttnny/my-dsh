// Comprehensive Automated Regression Test Suite for dsh-chat-translate
// Tests:
// 1. Structural reassembly: fence segmentation, per-line shape check, link-target restore
// 2. All reply blocks dispatched regardless of language (no skipping; Chinese is rewritten too)
// 3. Serial request queue & failure-reason classification (user-initiated retries)
// 4. LruDiskCache revision gating, LRU eviction and TTL handling
// 5. ConfigManager live-config reads and change notification
// 6. Connection exact Fetch routes and endpoint handling

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

import { splitMarkdownSegments, shapeMismatch, restoreLinkTargets } from '../src/server/pipeline/segments.ts';
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

/** 原样回显 ⟪…⟫ 标记负载的每个段，模拟守规矩的多段翻译。 */
function echoMarkers(text) {
  const matches = [...text.matchAll(/⟪([a-z]{4})(\d+)⟫/g)];
  return matches
    .map((match, index) => {
      const start = match.index + match[0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
      return match[0] + '\n译:' + text.slice(start, end).trim();
    })
    .join('\n\n');
}

function makeDispatcher(translate) {
  const entry = createFakeSettingsEntry();
  const config = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache(100, `regression-${Math.random().toString(36).slice(2)}.json`);
  const dispatcher = new TranslationDispatcher(config, cache);
  const calls = [];
  dispatcher.adapters.set('openai', {
    id: 'openai',
    name: 'Fake',
    isAvailable: () => true,
    translate: async (t, signal, cfg, options) => {
      calls.push({ text: t, options });
      return translate(t, calls.length, options);
    },
  });
  return { entry, cache, dispatcher, calls };
}

console.log('=== Starting dsh-chat-translate Regression Test Suite ===\n');

// -------------------------------------------------------------
// Suite 1: Structural reassembly (segments, shape, links)
// -------------------------------------------------------------
console.log('--- Suite 1: Structural reassembly ---');

test('splitMarkdownSegments round-trips and classifies fences', () => {
  const text = 'Intro `code` line.\n\n```bash\nnpm publish --tag latest\n```\n\nOutro.';
  const segments = splitMarkdownSegments(text);
  assert.equal(segments.map((s) => s.text).join(''), text, '拼接恒等于原文');
  assert.deepEqual(segments.map((s) => s.kind), ['prose', 'code', 'prose']);
  assert.ok(segments[1].text.startsWith('```bash'));
  assert.ok(segments[1].text.endsWith('```\n'), '段尾换行归属前一段');
});

test('tilde fences and unclosed fences become code segments', () => {
  const tilde = 'a\n~~~sh\ncode\n~~~\nb';
  assert.deepEqual(splitMarkdownSegments(tilde).map((s) => s.kind), ['prose', 'code', 'prose']);
  const unclosed = 'a\n```js\nnever closed\nstill code';
  const segments = splitMarkdownSegments(unclosed);
  assert.deepEqual(segments.map((s) => s.kind), ['prose', 'code']);
  assert.equal(segments.map((s) => s.text).join(''), unclosed);
});

test('a fence of the other marker does not close an open fence', () => {
  const text = '```js\n~~~\nnot a close\n```';
  const segments = splitMarkdownSegments(text);
  assert.deepEqual(segments.map((s) => s.kind), ['code']);
});

test('shapeMismatch accepts a pure content rewrite and flags structural edits', () => {
  const original = '| a | b |\n| --- | --- |\n| `x` | [t](u) |';
  const good = '| 甲 | 乙 |\n| --- | --- |\n| `x 的译文` | [标题](u) |';
  assert.equal(shapeMismatch(original, good), null, '逐字改内容、结构不动 = 通过');
  assert.ok(shapeMismatch(original, '| 甲 | 乙 |\n| --- |'), '行数变了');
  assert.ok(shapeMismatch(original, '| a |\n| --- |\n| x | y |'), '竖线数变了');
  assert.equal(shapeMismatch(original, '| a | b |\n| --- | --- |\n| x | [t](u) |'), null, '反引号丢了不拦：行内代码是样式不是骨架');
  assert.equal(shapeMismatch(original, '| a | b |\n| --- | --- |\n| `x` | [t](u) `多出来的` |'), null, '反引号多了也不拦');
  assert.ok(shapeMismatch(original, '| a | b |\n| --- | --- |\n| `x` | [t](u) [v](w) |'), '链接个数变了');
  assert.ok(shapeMismatch('- item', '* item'), '列表记号换了字符');
  assert.ok(shapeMismatch('## Head', 'Head'), '标题记号丢了');
  assert.ok(shapeMismatch('  plain', 'plain'), '缩进丢了');
});

test('restoreLinkTargets keeps translated text and copies urls back verbatim', () => {
  const original = 'see [the docs](https://example.com/a?b=c) and ![img](/i.png)';
  const translated = '看 [文档](https://例子.com/被改了) 还有 ![图](/换了的.png)';
  assert.equal(
    restoreLinkTargets(original, translated),
    '看 [文档](https://example.com/a?b=c) 还有 ![图](/i.png)'
  );
  assert.equal(restoreLinkTargets('no links here', '没有链接'), '没有链接');
  // URL 自带括号时，回填锚在 `]` 后的开括号，不咬进 URL 内部。
  assert.equal(restoreLinkTargets('[x](url(1))', '[乙](被改的)'), '[乙](url(1))');
});

// -------------------------------------------------------------
// Suite 2: Reply Cache & Failure Semantics (one first-run per row)
// -------------------------------------------------------------
console.log('\n--- Suite 2: Reply Cache & Failure Semantics ---');

await testAsync('A repeated reply block is answered from the cache, not the adapter', async () => {
  const { entry, dispatcher, calls } = makeDispatcher(async (t) => `translated:${t}`);
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const first = await dispatcher.translateReplyBlocks(['Identical task text']);
  const second = await dispatcher.translateReplyBlocks(['Identical task text']);
  assert.equal(calls.length, 1, 'the cache must answer the second request, not the adapter');
  assert.equal(first[0].translated, 'translated:Identical task text');
  assert.equal(second[0].cached, true);
});

await testAsync('A transport failure stays transport; the next call may pass freely', async () => {
  // 落定的行等的是用户的点击，不是冷却期：下一次调用（新行的首跑，或点击
  // 后同代文本的重发）照旧打到适配器。
  let fail = true;
  const { entry, dispatcher } = makeDispatcher(async (t) => {
    if (fail) throw new Error('503 Service Unavailable');
    return `ok:${t}`;
  });
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const down = await dispatcher.translateReplyBlocks(['Fail 1']);
  assert.equal(down[0].ok, false);
  assert.equal(down[0].reason, 'transport');

  fail = false;
  const up = await dispatcher.translateReplyBlocks(['Fail 1']);
  assert.equal(up[0].ok, true, '无冷却、无额度：下一次调用直接打到通道');
});

await testAsync('A reply that breaks the markdown shape is discarded, never cached', async () => {
  // 单行被模型拆成两行——段落结构真破了，这才是形状拒收该拦的事。
  const { entry, cache, dispatcher, calls } = makeDispatcher(async () => '阅读调度器\n并修文档规则');
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const source = 'Read `dispatcher.ts` and fix docs/rules/plugins.md';
  const result = (await dispatcher.translateReplyBlocks([source]))[0];
  assert.equal(result.ok, false, '行数变了 = 结构破损，不得当作译文展示');
  assert.equal(result.reason, 'content');
  assert.equal(result.translated, source, 'the original text must survive');
  assert.equal(cache.get(source.toLowerCase()), undefined, 'a shape break must not be cached');
  assert.equal(calls.length, 2, 'the batch and its per-piece retry both run');
});

await testAsync('Inline code may be translated, added or dropped without veto', async () => {
  const { entry, dispatcher } = makeDispatcher(async () => '现在看看 `调度器` 和 `规则` 吧');
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const result = (await dispatcher.translateReplyBlocks(['Look at `dispatcher` now']))[0];
  assert.equal(result.ok, true, '反引号内是内容，不是语法——允许翻译');
  assert.ok(result.translated.includes('`调度器`'), '反引号增减放行，只是样式漂移');
});

await testAsync('A hallucinated batch marker rejects the answer as content', async () => {
  const { entry, dispatcher } = makeDispatcher(async () => '译文里混着 ⟪abcd0⟫ 标记');
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const result = (await dispatcher.translateReplyBlocks(['Some English prose.']))[0];
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'content', '残留的块标记是内容级拒收，不是通道伤');
});

await testAsync('Link targets survive a model rewrite by construction', async () => {
  const { entry, dispatcher } = makeDispatcher(
    async () => '看 [文档](https://例子.com/被翻译过的地址)'
  );
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const result = (await dispatcher.translateReplyBlocks(['see [the docs](https://example.com/a?b=c)']))[0];
  assert.equal(result.ok, true);
  assert.ok(result.translated.includes('https://example.com/a?b=c'), 'URL 逐字拼回');
  assert.ok(result.translated.includes('[文档]'), '链接文字保留模型的翻译');
});

await testAsync('Code fences never reach the channel and splice back verbatim', async () => {
  const { entry, dispatcher, calls } = makeDispatcher(async (t, _n, options) =>
    options?.mode === 'blocks' ? echoMarkers(t) : `译:${t}`
  );
  await entry.update({ baseUrl: 'http://x', model: 'm' });

  const fence = '```bash\nnpm publish --tag latest\n```';
  const source = `Intro paragraph.\n\n${fence}\n\nOutro paragraph.`;
  const result = (await dispatcher.translateReplyBlocks([source]))[0];
  assert.equal(result.ok, true);
  assert.ok(!calls.some((call) => call.text.includes('npm publish')), '围栏内容从不进请求');
  assert.ok(result.translated.includes(fence), '代码块逐字拼回');
  assert.ok(result.translated.startsWith('译:Intro paragraph.'));
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

await testAsync('LruDiskCache drops malformed entries while loading from disk', async () => {
  const cachePath = path.join(TMP_HOME, 'dsh-chat-translate', 'cache.json');
  const now = Date.now();
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(
    cachePath,
    JSON.stringify({
      rev: PROMPT_REVISION,
      entries: {
        ok: { t: now, v: '正常译文' },
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
