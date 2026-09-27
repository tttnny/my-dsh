// Reply channel contract (one channel), retired-key cleanup, legacy-config
// migration and circuit-breaker single-flight probe verification.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigManager, migrateLegacyConfigFile } from '../src/server/config.ts';
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

console.log('=== Suite A: reply channel contract (one channel) ===');

await testAsync('AI configured -> translated, channel openai', async () => {
  const { dispatcher, calls, source } = await setupDispatcher();
  await source.update({ baseUrl: 'http://x', model: 'm' });
  const results = await dispatcher.translateReplyBlocks(['TT1: List files here']);
  assert.deepEqual(calls, ['openai']);
  assert.equal(results[0].channel, 'openai');
  assert.equal(results[0].ok, true);
});

await testAsync('AI not configured -> no request, original kept', async () => {
  const { dispatcher, calls, source } = await setupDispatcher();
  await source.update({ baseUrl: '', model: '' });
  const results = await dispatcher.translateReplyBlocks(['TT2: List files here']);
  assert.deepEqual(calls, []);
  assert.equal(results[0].ok, false);
  assert.equal(results[0].translated, 'TT2: List files here');
  assert.equal(results[0].channel, 'none');
});

await testAsync('master switch off -> no request, original kept', async () => {
  const { dispatcher, calls, source } = await setupDispatcher();
  await source.update({ enabled: false, baseUrl: 'http://x', model: 'm' });
  const results = await dispatcher.translateReplyBlocks(['TT3: List files here']);
  assert.deepEqual(calls, []);
  assert.equal(results[0].translated, 'TT3: List files here');
});

await testAsync('AI failure keeps the original instead of falling back', async () => {
  const { dispatcher, calls, source } = await setupDispatcher({ failOpenai: true });
  await source.update({ baseUrl: 'http://x', model: 'm' });
  const results = await dispatcher.translateReplyBlocks(['TT4: List files here']);
  assert.deepEqual(calls, ['openai', 'openai'], 'batch then the per-piece retry');
  assert.equal(results[0].ok, false);
  assert.equal(results[0].translated, 'TT4: List files here');
});

await testAsync('a cooling-down channel is skipped without a request', async () => {
  const { dispatcher, calls, source } = await setupDispatcher();
  await source.update({ baseUrl: 'http://x', model: 'm' });
  dispatcher.circuitStates.set('openai', {
    state: 'open',
    failureCount: 3,
    openUntil: Date.now() + 30000,
    probeInFlight: false,
  });
  const results = await dispatcher.translateReplyBlocks(['TT5: List files here']);
  assert.deepEqual(calls, []);
  assert.equal(results[0].ok, false);
});

async function setupDispatcher({ failOpenai = false } = {}) {
  // The fake IS this plugin's settings entry: `get`/`watch` is the live config
  // source ConfigManager reads, and `update` simulates one accepted live edit.
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
    translate: async (t) => {
      calls.push('openai');
      if (failOpenai) throw new Error('AI boom');
      return `[openai]${t}`;
    },
  });
  return { dispatcher, calls, source, cache };
}

console.log('\n=== Suite B: circuit breaker half-open single-flight ===');

await testAsync('Only one probe passes while half-open', async () => {
  const source = createFakeSettingsEntry();
  const cfg = new ConfigManager(source, new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  await cache.init();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  dispatcher.credentials = { getApiKey: () => 'sk-test' };
  await source.update({ baseUrl: 'http://x', model: 'm' });

  let calls = 0;
  let succeed = false;
  dispatcher.adapters.set('openai', {
    id: 'openai',
    name: 'Unstable',
    isAvailable: () => true,
    translate: async (t) => {
      calls++;
      await new Promise((r) => setTimeout(r, 80));
      if (!succeed) throw new Error('boom');
      return `ok:${t}`;
    },
  });

  // Trip the circuit through the reply path: a failing batch records one failure,
  // its per-piece retry records another, and gate/retry count further failures
  // while the breaker is still closed. Loop until OPEN rather than hard-coding
  // the accounting, which is deliberately "failures, not requests".
  const tripDeadline = Date.now() + 5000;
  while (dispatcher.circuitStates.get('openai')?.state !== 'open') {
    assert.ok(Date.now() < tripDeadline, 'repeated failures must eventually open the circuit');
    await dispatcher.translateReplyBlocks([`F${calls}`]);
  }
  const state = dispatcher.circuitStates.get('openai');
  assert.equal(state.state, 'open');

  // Fast-forward the cooling window -> the next call enters half-open.
  state.openUntil = Date.now() - 100;

  // Drive the breaker to half-open again, then fire 3 concurrent requests with
  // the adapter healthy: exactly ONE may reach the adapter as the probe, the
  // other two are refused by the single-flight gate.
  state.state = 'open';
  state.openUntil = Date.now() - 100;
  state.probeInFlight = false;
  succeed = true;
  calls = 0;
  const results = await Promise.all([
    dispatcher.translateReplyBlocks(['P1']),
    dispatcher.translateReplyBlocks(['P2']),
    dispatcher.translateReplyBlocks(['P3']),
  ]);
  assert.equal(calls, 1, 'half-open must allow exactly one in-flight probe');
  assert.equal(results.filter((r) => r[0].ok).length, 1, 'only the probe may be served');
  assert.equal(state.state, 'closed', 'successful probe resets the circuit to closed');
  assert.equal(state.probeInFlight, false);

  // Circuit is closed again: normal traffic flows
  calls = 0;
  await dispatcher.translateReplyBlocks(['P4']);
  assert.equal(calls, 1, 'closed circuit lets the request through');
});

await testAsync('Empty probe result releases the single-flight flag', async () => {
  const source = createFakeSettingsEntry();
  const cfg = new ConfigManager(source, new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  await cache.init();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  dispatcher.credentials = { getApiKey: () => 'sk-test' };
  await source.update({ baseUrl: 'http://x', model: 'm' });

  let calls = 0;
  let empty = true;
  dispatcher.adapters.set('openai', {
    id: 'emptyish',
    name: 'Emptyish',
    isAvailable: () => true,
    translate: async (t) => {
      calls++;
      if (empty) return ''; // empty result, no throw
      return `ok:${t}`;
    },
  });

  // Empty results count as failures -> the circuit opens on repeated empties.
  while (dispatcher.circuitStates.get('openai')?.state !== 'open') {
    await dispatcher.translateReplyBlocks([`E${calls}`]);
  }
  const state = dispatcher.circuitStates.get('openai');
  assert.equal(state.state, 'open', 'empty results must count as failures');

  // Fast-forward -> half-open, and the reply path's probe comes back empty: the
  // single-flight flag must be released, otherwise the channel is bypassed forever.
  state.openUntil = Date.now() - 100;
  calls = 0;
  await dispatcher.translateReplyBlocks(['E-probe']);
  assert.ok(calls >= 1, 'probe ran');
  assert.equal(state.probeInFlight, false, 'empty probe must release the flag');
  assert.equal(state.state, 'open', 'empty probe re-opens the circuit');

  // After cooldown a healthy probe succeeds and closes the circuit
  state.openUntil = Date.now() - 100;
  empty = false;
  calls = 0;
  await dispatcher.translateReplyBlocks(['E-recover']);
  assert.ok(calls >= 1);
  assert.equal(state.state, 'closed');
});

console.log('\n=== Suite C: legacy config migration (pre-1.2 standalone file) ===');

await testAsync('Legacy config migrates into the settings namespace and the file is removed', async () => {
  const legacyPath = path.join(TMP_HOME, 'dsh-chat-translate-config.json');
  await fs.writeFile(
    legacyPath,
    JSON.stringify({ enabled: true, channels: ['bing'], baseUrl: ' http://x ', model: 'm', concurrency: 3, thinkEnabled: true }),
    'utf-8'
  );
  const entry = createFakeSettingsEntry();
  // The migration takes the provider-level face (namespace + path ops);
  // the fake entry exposes describe/mutate with the same contract.
  const settingsFace = {
    describe: () => entry.describe(),
    mutate: (ns, ops, revision) => entry.mutate(ns, ops, revision),
  };
  const migrated = await migrateLegacyConfigFile(settingsFace, legacyPath);
  assert.equal(migrated, true, 'legacy values must be reported as migrated');

  const cfg = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
  assert.equal(cfg.getConfig().enabled, true);
  assert.equal(cfg.getConfig().baseUrl, 'http://x', 'string values are trimmed');
  assert.equal(cfg.getConfig().model, 'm');
  assert.equal(cfg.getConfig().channels, undefined, 'retired channels field is dropped');
  assert.equal(cfg.getConfig().concurrency, undefined, 'retired concurrency field is dropped');
  assert.equal(cfg.getConfig().thinkEnabled, undefined, 'retired thinkEnabled field is dropped');

  await assert.rejects(fs.access(legacyPath), 'legacy file must be removed after migration');
});

await testAsync('Migration sanitizes per-field: bad values skipped, valid ones migrate', async () => {
  // A hand-edited string "false" must not block the rest of the migration;
  // out-of-range numerics are clamped to the schema bounds.
  const legacyPath = path.join(TMP_HOME, 'dsh-chat-translate-mixed-config.json');
  await fs.writeFile(
    legacyPath,
    JSON.stringify({ enabled: 'false', aiTimeoutMs: 99999999, baseUrl: ' http://x ', model: 'm' }),
    'utf-8'
  );
  const entry = createFakeSettingsEntry();
  const settingsFace = {
    describe: () => entry.describe(),
    mutate: (ns, ops, revision) => entry.mutate(ns, ops, revision),
  };
  const migrated = await migrateLegacyConfigFile(settingsFace, legacyPath);
  assert.equal(migrated, true, 'valid fields still migrate when others are rejected');

  const cfg = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
  assert.equal(cfg.getConfig().enabled, true, 'string "false" skipped -> schema default');
  assert.equal(cfg.getConfig().aiTimeoutMs, 900000, 'out-of-range clamped to the max');
  assert.equal(cfg.getConfig().baseUrl, 'http://x', 'valid string trimmed and migrated');
  assert.equal(cfg.getConfig().model, 'm');

  await assert.rejects(fs.access(legacyPath), 'file removed after migration');
});

await testAsync('Migration keeps the file when the provider write fails (retry next boot)', async () => {
  // A sanitized patch can only be rejected by a provider-level failure
  // (read-only document, disk trouble); destroying the only copy then would
  // lose the user's values, so the file must stay for the next boot.
  const legacyPath = path.join(TMP_HOME, 'dsh-chat-translate-providerfail-config.json');
  await fs.writeFile(legacyPath, JSON.stringify({ baseUrl: 'http://x' }), 'utf-8');
  const entry = createFakeSettingsEntry();
  const failingFace = {
    describe: () => entry.describe(),
    mutate: async () => {
      throw new Error('provider is read-only');
    },
  };
  const migrated = await migrateLegacyConfigFile(failingFace, legacyPath);
  assert.equal(migrated, false, 'no migration reported');
  await fs.access(legacyPath); // must still exist
  assert.equal(new ConfigManager(entry, new CredentialsReader(createFakeCredentials())).getConfig().baseUrl, '');
});

await testAsync('Migration never overwrites an existing user layer', async () => {
  const legacyPath = path.join(TMP_HOME, 'dsh-chat-translate-config.json');
  await fs.writeFile(legacyPath, JSON.stringify({ baseUrl: 'http://old', model: 'old-model' }), 'utf-8');
  const entry = createFakeSettingsEntry();
  entry.setUserLayer({ baseUrl: 'http://new', model: 'new-model' }); // user already edited via UI

  const settingsFace = {
    describe: () => entry.describe(),
    mutate: (ns, ops, revision) => entry.mutate(ns, ops, revision),
  };
  const migrated = await migrateLegacyConfigFile(settingsFace, legacyPath);
  assert.equal(migrated, false, 'nothing migrated when a user layer exists');

  const cfg = new ConfigManager(entry, new CredentialsReader(createFakeCredentials()));
  assert.equal(cfg.getConfig().baseUrl, 'http://new', 'existing user layer wins');
  assert.equal(cfg.getConfig().model, 'new-model');

  await assert.rejects(fs.access(legacyPath), 'legacy file must still be removed');
});

await testAsync('Missing or corrupt legacy file is a no-op', async () => {
  const missingPath = path.join(TMP_HOME, 'no-such-config.json');
  const entry = createFakeSettingsEntry();
  assert.equal(await migrateLegacyConfigFile(entry, missingPath), false);

  const corruptPath = path.join(TMP_HOME, 'corrupt-config.json');
  await fs.writeFile(corruptPath, '{not json', 'utf-8');
  assert.equal(await migrateLegacyConfigFile(entry, corruptPath), false);
  await assert.rejects(fs.access(corruptPath), 'corrupt legacy file is dropped');
});

console.log('\n=== Suite D: CredentialsReader over the DSH credentials service ===');

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

console.log('\n======================================================');
console.log(`All ${passed}/${total} channel-logic tests PASSED successfully!`);
console.log('======================================================\n');
