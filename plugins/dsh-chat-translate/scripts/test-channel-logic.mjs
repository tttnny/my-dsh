// Reply channel contract (one channel) and the failure-reason ledger.
// The reply path has no circuit breaker: every row gets exactly its one
// first-run attempt, failures report their reason (transport vs content) and
// only the user's click re-runs a row.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigManager } from '../src/server/config.ts';
import { LruDiskCache } from '../src/server/cache.ts';
import { TranslationDispatcher } from '../src/server/dispatcher.ts';
import { CredentialsReader } from '../src/server/credentials.ts';
import { createFakeSettingsEntry, createFakeCredentials } from './test-helpers.mjs';

// Isolate file-backed state into a temp dir.
const TMP_HOME = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-chat-translate-chtest-'));
process.env.DSH_HOME = TMP_HOME;

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

/**
 * The fake IS this plugin's settings entry: `get`/`watch` is the live config
 * source ConfigManager reads, and `update` simulates one accepted live edit.
 * @param translate - optional adapter body `(text, callNo, options)`;
 *   default echoes with an `[openai]` prefix.
 */
async function setupDispatcher({ translate } = {}) {
  const source = createFakeSettingsEntry();
  const cfg = new ConfigManager(source, new CredentialsReader(createFakeCredentials()));
  await source.update({ enabled: true, baseUrl: '', model: '' });
  const cache = new LruDiskCache(100, `channel-test-${Math.random().toString(36).slice(2)}.json`);
  await cache.init();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  dispatcher.credentials = { getApiKey: () => 'sk-test' };
  const calls = [];
  dispatcher.adapters.set('openai', {
    id: 'openai',
    name: 'openai',
    // Mirrors the real adapter's gate: base URL + model + key must all be set.
    isAvailable: (config) => Boolean(config.baseUrl?.trim() && config.model?.trim()),
    translate: async (t, signal, config, options) => {
      calls.push({ text: t, options });
      if (translate) return translate(t, calls.length, options);
      return `[openai]${t}`;
    },
  });
  return { dispatcher, calls, source, cache };
}

console.log('=== Suite A: reply channel contract (one channel) ===');

await testAsync('AI configured -> translated from the channel, not the cache', async () => {
  const { dispatcher, calls, source } = await setupDispatcher();
  await source.update({ baseUrl: 'http://x', model: 'm' });
  const results = await dispatcher.translateReplyBlocks(['TT1: List files here']);
  assert.equal(calls.length, 1);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].cached, false);
  assert.equal(results[0].translated, '[openai]TT1: List files here');
  assert.equal(results[0].reason, undefined, '成功块不带败因');
});

await testAsync('AI not configured -> no request, original kept, transport reason', async () => {
  const { dispatcher, calls, source } = await setupDispatcher();
  await source.update({ baseUrl: '', model: '' });
  const results = await dispatcher.translateReplyBlocks(['TT2: List files here']);
  assert.deepEqual(calls, []);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].translated, 'TT2: List files here');
  assert.equal(results[0].reason, 'transport');
});

await testAsync('master switch off -> no request, original kept', async () => {
  const { dispatcher, calls, source } = await setupDispatcher();
  await source.update({ enabled: false, baseUrl: 'http://x', model: 'm' });
  const results = await dispatcher.translateReplyBlocks(['TT3: List files here']);
  assert.deepEqual(calls, []);
  assert.equal(results[0].translated, 'TT3: List files here');
});

await testAsync('AI failure keeps the original instead of falling back', async () => {
  const { dispatcher, calls, source } = await setupDispatcher({
    translate: () => {
      throw new Error('AI boom');
    },
  });
  await source.update({ baseUrl: 'http://x', model: 'm' });
  const results = await dispatcher.translateReplyBlocks(['TT4: List files here']);
  assert.equal(calls.length, 2, 'batch then the per-piece retry');
  assert.equal(results[0].ok, false);
  assert.equal(results[0].translated, 'TT4: List files here');
});

await testAsync('whitespace-only blocks never reach the channel', async () => {
  const { dispatcher, calls, source } = await setupDispatcher();
  await source.update({ baseUrl: 'http://x', model: 'm' });
  const results = await dispatcher.translateReplyBlocks(['   ', '\n\n', 'real']);
  assert.equal(calls.length, 1, 'only the non-blank block is requested');
  assert.equal(results[0].ok, false);
  assert.equal(results[2].ok, true);
});

console.log('\n=== Suite B: failure-reason ledger (no circuit breaker) ===');

await testAsync('a transport failure reports reason transport', async () => {
  const { dispatcher, source } = await setupDispatcher({
    translate: () => {
      throw new Error('ECONNREFUSED');
    },
  });
  await source.update({ baseUrl: 'http://x', model: 'm' });
  const results = await dispatcher.translateReplyBlocks(['Look at `alpha` before shipping.']);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].reason, 'transport');
});

await testAsync('a channel that mangles placeholders reports reason content', async () => {
  const { dispatcher, source } = await setupDispatcher({
    // 通道活着：HTTP 正常返回，只是这个弱模型总丢 ⟦…⟧ 占位符。
    translate: async () => '一段丢光了占位符的译文',
  });
  await source.update({ baseUrl: 'http://x', model: 'm' });
  const results = await dispatcher.translateReplyBlocks(['Look at `alpha` and `beta` before shipping.']);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].reason, 'content');
});

await testAsync('mixed attempts: any transport wound wins over content rejections', async () => {
  const { dispatcher, source } = await setupDispatcher({
    // 打包批里丢标记（内容拒收），单发重试时通道断了（传输伤）——
    // 块按 transport 报：救活它的意义大于认命。
    translate: async (t, _n, options) => {
      if (options?.mode === 'blocks') return '完全丢掉了标记的译文';
      throw new Error('stream reset');
    },
  });
  await source.update({ baseUrl: 'http://x', model: 'm' });
  const first = 'Look at `alpha` and `beta` before shipping.';
  const second = 'Check `gamma` too.';
  const results = await dispatcher.translateReplyBlocks([first, second]);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].reason, 'transport', '批的内容拒收 + 单发的传输伤 = transport');
  assert.equal(results[1].reason, 'transport');
});

await testAsync('one poisoned block never blocks the other blocks', async () => {
  const { dispatcher, source, cache } = await setupDispatcher({
    // 守规矩的回显（原样带回掩码 token），但对含 poison 的密集代码块交假译。
    translate: async (t, _n, options) => {
      if (t.includes('poison')) return '坏掉了';
      return options?.mode === 'blocks' ? echoMarkers(t) : `译:${t}`;
    },
  });
  await source.update({ baseUrl: 'http://x', model: 'm' });
  const dense = 'a poison `alpha` fragment';
  const plain = 'An ordinary English sentence.';
  const results = await dispatcher.translateReplyBlocks([dense, plain]);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].reason, 'content', '两次尝试都只以内容拒收终结');
  assert.equal(results[1].ok, true, '同批的普通块在单发补试里必须照常译出');
  assert.ok(results[1].translated.startsWith('译:'));
  assert.ok(cache.get(plain.toLowerCase()), '译出的普通块进了缓存池');
});

await testAsync('a repeat of the same text is answered from the cache', async () => {
  const { dispatcher, calls, source } = await setupDispatcher();
  await source.update({ baseUrl: 'http://x', model: 'm' });
  const first = await dispatcher.translateReplyBlocks(['Identical task text']);
  const second = await dispatcher.translateReplyBlocks(['Identical task text']);
  assert.equal(calls.length, 1, 'the cache must answer the second request');
  assert.equal(first[0].cached, false);
  assert.equal(second[0].cached, true);
  assert.equal(second[0].translated, first[0].translated);
});

console.log('\n=== Suite C: CredentialsReader over the DSH credentials service ===');

await testAsync('init loads the stored key; setApiKey stores and refreshes the cache', async () => {
  const service = createFakeCredentials('sk-old');
  const reader = new CredentialsReader(service);
  await reader.init();
  assert.equal(reader.getApiKey(), 'sk-old', 'init must load the stored key');

  await reader.setApiKey('sk-new');
  assert.equal(reader.getApiKey(), 'sk-new', 'cache must reflect the new value immediately');
  assert.equal((await reader.describe()).configured, true);
  assert.equal((await reader.describe()).writable, true);
});

await testAsync('setApiKey with empty value clears the ref', async () => {
  const service = createFakeCredentials('sk-old');
  const reader = new CredentialsReader(service);
  await reader.init();
  await reader.setApiKey('   ');
  assert.equal(reader.getApiKey(), '', 'cleared key reads back empty');
  assert.equal((await reader.describe()).configured, false);
});

await testAsync('refresh picks up external changes and a missing key reads empty', async () => {
  const service = createFakeCredentials();
  const reader = new CredentialsReader(service);
  await reader.init();
  assert.equal(reader.getApiKey(), '', 'absent key reads empty');

  // Simulate an external write (credentials/reference-updated) landing after init.
  await service.set('TRANSLATE_API_KEY', 'sk-external');
  await reader.refresh();
  assert.equal(reader.getApiKey(), 'sk-external', 'refresh must observe external writes');
});

test('the dispatcher exposes no circuit-breaker surface anymore', () => {
  // 熔断整体删除后的防回归：账本、探针、冷却字段都不得复活。
  const entry = createFakeSettingsEntry();
  const cfg = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
  const dispatcher = new TranslationDispatcher(cfg, new LruDiskCache());
  assert.equal('circuitStates' in dispatcher, false);
  assert.equal('isCircuitOpen' in dispatcher, false);
  assert.equal('recordFailure' in dispatcher, false);
});

console.log('\n======================================================');
console.log(`All ${passed}/${total} channel-logic tests PASSED successfully!`);
console.log('======================================================\n');
