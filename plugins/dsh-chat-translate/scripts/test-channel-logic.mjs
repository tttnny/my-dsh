// Channel truth table (user contract), legacy-config migration and
// circuit-breaker single-flight probe verification.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigManager, migrateLegacyConfigFile } from '../src/server/config.ts';
import { LruDiskCache } from '../src/server/cache.ts';
import { TranslationDispatcher } from '../src/server/dispatcher.ts';
import { CredentialsReader } from '../src/server/credentials.ts';
import { createFakeSettingsScope, createFakeCredentials } from './test-helpers.mjs';

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

console.log('=== Suite A: dual-channel truth table (user contract) ===');

await testAsync('AI on+configured, Bing on -> AI only', async () => {
  const { dispatcher, calls } = await setupDispatcher();
  await dispatcher.configManager.updateConfig({ aiEnabled: true, bingEnabled: true, baseUrl: 'http://x', model: 'm' });
  const r = await dispatcher.translateOne('TT1: List files here');
  assert.deepEqual(calls, ['openai']);
  assert.equal(r.channel, 'openai');
});

await testAsync('AI on+NOT configured, Bing on -> Bing', async () => {
  const { dispatcher, calls } = await setupDispatcher();
  await dispatcher.configManager.updateConfig({ aiEnabled: true, bingEnabled: true });
  const r = await dispatcher.translateOne('TT2: List files here');
  assert.deepEqual(calls, ['bing']);
  assert.equal(r.channel, 'bing');
});

await testAsync('AI on+NOT configured, Bing off -> no translation', async () => {
  const { dispatcher, calls } = await setupDispatcher();
  await dispatcher.configManager.updateConfig({ aiEnabled: true, bingEnabled: false });
  const r = await dispatcher.translateOne('TT3: List files here');
  assert.deepEqual(calls, []);
  assert.equal(r.channel, 'fallback');
});

await testAsync('AI off, Bing on -> Bing', async () => {
  const { dispatcher, calls } = await setupDispatcher();
  await dispatcher.configManager.updateConfig({ aiEnabled: false, bingEnabled: true, baseUrl: 'http://x', model: 'm' });
  const r = await dispatcher.translateOne('TT4: List files here');
  assert.deepEqual(calls, ['bing']);
  assert.equal(r.channel, 'bing');
});

await testAsync('AI off, Bing off -> no translation', async () => {
  const { dispatcher, calls } = await setupDispatcher();
  await dispatcher.configManager.updateConfig({ aiEnabled: false, bingEnabled: false });
  const r = await dispatcher.translateOne('TT5: List files here');
  assert.deepEqual(calls, []);
  assert.equal(r.channel, 'fallback');
});

await testAsync('AI failure falls back to Bing', async () => {
  const { dispatcher, calls } = await setupDispatcher({ failOpenai: true });
  await dispatcher.configManager.updateConfig({ aiEnabled: true, bingEnabled: true, baseUrl: 'http://x', model: 'm' });
  const r = await dispatcher.translateOne('TT6: List files here');
  assert.deepEqual(calls, ['openai', 'bing']);
  assert.equal(r.channel, 'bing');
});

async function setupDispatcher({ failOpenai = false } = {}) {
  const cfg = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  // Reset to a clean baseline — the fake scope is fresh per setup, so nothing
  // leaks between tests by construction.
  await cfg.updateConfig({ enabled: true, aiEnabled: false, bingEnabled: false, baseUrl: '', model: '', concurrency: 3 });
  const cache = new LruDiskCache();
  await cache.init();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  dispatcher.credentials = { getApiKey: () => 'sk-test' };
  const calls = [];
  for (const id of ['openai', 'bing']) {
    dispatcher.adapters.set(id, {
      id,
      name: id,
      isAvailable: () => true,
      translate: async (t) => {
        calls.push(id);
        if (id === 'openai' && failOpenai) throw new Error('AI boom');
        return `[${id}]${t}`;
      },
    });
  }
  return { dispatcher, calls };
}

console.log('\n=== Suite B: circuit breaker half-open single-flight ===');

await testAsync('Only one probe passes while half-open', async () => {
  const cfg = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  await cache.init();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  dispatcher.credentials = { getApiKey: () => 'sk-test' };
  await cfg.updateConfig({ aiEnabled: false, bingEnabled: false, concurrency: 5 });

  let calls = 0;
  let succeed = false;
  dispatcher.adapters.set('unstable', {
    id: 'unstable',
    name: 'Unstable',
    isAvailable: () => true,
    translate: async (t) => {
      calls++;
      await new Promise((r) => setTimeout(r, 80));
      if (!succeed) throw new Error('boom');
      return `ok:${t}`;
    },
  });

  // Trip the circuit: 3 consecutive failures -> OPEN
  await dispatcher.translateOne('F1');
  await dispatcher.translateOne('F2');
  await dispatcher.translateOne('F3');
  const state = dispatcher.circuitStates.get('unstable');
  assert.equal(state.state, 'open');

  // Fast-forward the cooling window -> next call enters half-open
  state.openUntil = Date.now() - 100;

  // Fire 3 concurrent requests with the adapter healthy: exactly ONE may reach
  // the adapter as probe; the other two must be blocked by the single-flight guard.
  succeed = true;
  calls = 0;
  const results = await Promise.all([
    dispatcher.translateOne('P1'),
    dispatcher.translateOne('P2'),
    dispatcher.translateOne('P3'),
  ]);
  assert.equal(calls, 1, 'half-open must allow exactly one in-flight probe');
  const probed = results.filter((r) => r.channel === 'unstable').length;
  assert.equal(probed, 1);
  assert.equal(state.state, 'closed', 'successful probe resets the circuit to closed');
  assert.equal(state.probeInFlight, false);

  // Circuit is closed again: normal traffic flows
  const r4 = await dispatcher.translateOne('P4');
  assert.equal(r4.channel, 'unstable');
});

await testAsync('Empty probe result releases the single-flight flag', async () => {
  const cfg = new ConfigManager(createFakeSettingsScope(), new CredentialsReader(createFakeCredentials()));
  const cache = new LruDiskCache();
  await cache.init();
  const dispatcher = new TranslationDispatcher(cfg, cache);
  dispatcher.credentials = { getApiKey: () => 'sk-test' };
  await cfg.updateConfig({ aiEnabled: false, bingEnabled: false, concurrency: 5 });

  let calls = 0;
  let empty = true;
  dispatcher.adapters.set('emptyish', {
    id: 'emptyish',
    name: 'Emptyish',
    isAvailable: () => true,
    translate: async (t) => {
      calls++;
      if (empty) return ''; // empty result, no throw
      return `ok:${t}`;
    },
  });

  // Empty results count as failures -> circuit opens after 3
  await dispatcher.translateOne('E1');
  await dispatcher.translateOne('E2');
  await dispatcher.translateOne('E3');
  const state = dispatcher.circuitStates.get('emptyish');
  assert.equal(state.state, 'open', 'empty results must count as failures');

  // Fast-forward -> half-open probe returns empty: the single-flight flag
  // must be released, otherwise the channel would be bypassed forever.
  state.openUntil = Date.now() - 100;
  calls = 0;
  const r = await dispatcher.translateOne('E4');
  assert.equal(calls, 1, 'probe ran');
  assert.equal(state.probeInFlight, false, 'empty probe must release the flag');
  assert.equal(state.state, 'open', 'empty probe re-opens the circuit');

  // After cooldown a healthy probe succeeds and closes the circuit
  state.openUntil = Date.now() - 100;
  empty = false;
  calls = 0;
  const r2 = await dispatcher.translateOne('E5');
  assert.equal(calls, 1);
  assert.equal(r2.channel, 'emptyish');
  assert.equal(state.state, 'closed');
});

console.log('\n=== Suite C: legacy config migration (pre-1.2 standalone file) ===');

await testAsync('Legacy config migrates into the settings namespace and the file is removed', async () => {
  const legacyPath = path.join(TMP_HOME, 'dsh-chat-translate-config.json');
  await fs.writeFile(
    legacyPath,
    JSON.stringify({ enabled: true, channels: ['bing'], baseUrl: ' http://x ', model: 'm', concurrency: 3 }),
    'utf-8'
  );
  const scope = createFakeSettingsScope();
  // The migration entry takes the provider-level face (namespace + path ops);
  // the fake scope exposes the same mutate contract.
  const settingsFace = {
    describe: () => scope.describe(),
    mutate: (ns, ops, revision) => scope.mutate(ns, ops, revision),
  };
  const migrated = await migrateLegacyConfigFile(settingsFace, legacyPath);
  assert.equal(migrated, true, 'legacy values must be reported as migrated');

  const cfg = new ConfigManager(scope, new CredentialsReader(createFakeCredentials()));
  assert.equal(cfg.getConfig().enabled, true);
  assert.equal(cfg.getConfig().baseUrl, 'http://x', 'string values are trimmed');
  assert.equal(cfg.getConfig().model, 'm');
  assert.equal(cfg.getConfig().channels, undefined, 'retired channels field is dropped');

  await assert.rejects(fs.access(legacyPath), 'legacy file must be removed after migration');
});

await testAsync('Migration sanitizes per-field: bad values skipped, valid ones migrate', async () => {
  // A hand-edited string "false" must not block the rest of the migration;
  // out-of-range numerics are clamped to the schema bounds.
  const legacyPath = path.join(TMP_HOME, 'dsh-chat-translate-mixed-config.json');
  await fs.writeFile(
    legacyPath,
    JSON.stringify({ enabled: 'false', concurrency: 9999, baseUrl: ' http://x ', model: 'm' }),
    'utf-8'
  );
  const scope = createFakeSettingsScope();
  const settingsFace = {
    describe: () => scope.describe(),
    mutate: (ns, ops, revision) => scope.mutate(ns, ops, revision),
  };
  const migrated = await migrateLegacyConfigFile(settingsFace, legacyPath);
  assert.equal(migrated, true, 'valid fields still migrate when others are rejected');

  const cfg = new ConfigManager(scope, new CredentialsReader(createFakeCredentials()));
  assert.equal(cfg.getConfig().enabled, true, 'string "false" skipped -> schema default');
  assert.equal(cfg.getConfig().concurrency, 100, 'out-of-range clamped to the max');
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
  const scope = createFakeSettingsScope();
  const failingFace = {
    describe: () => scope.describe(),
    mutate: async () => {
      throw new Error('provider is read-only');
    },
  };
  const migrated = await migrateLegacyConfigFile(failingFace, legacyPath);
  assert.equal(migrated, false, 'no migration reported');
  await fs.access(legacyPath); // must still exist
  assert.equal(new ConfigManager(scope, new CredentialsReader(createFakeCredentials())).getConfig().baseUrl, '');
});

await testAsync('Migration never overwrites an existing user layer', async () => {
  const legacyPath = path.join(TMP_HOME, 'dsh-chat-translate-config.json');
  await fs.writeFile(legacyPath, JSON.stringify({ baseUrl: 'http://old', model: 'old-model' }), 'utf-8');
  const scope = createFakeSettingsScope();
  scope.setUserLayer({ baseUrl: 'http://new', model: 'new-model' }); // user already edited via UI

  const settingsFace = {
    describe: () => scope.describe(),
    mutate: (ns, ops, revision) => scope.mutate(ns, ops, revision),
  };
  const migrated = await migrateLegacyConfigFile(settingsFace, legacyPath);
  assert.equal(migrated, false, 'nothing migrated when a user layer exists');

  const cfg = new ConfigManager(scope, new CredentialsReader(createFakeCredentials()));
  assert.equal(cfg.getConfig().baseUrl, 'http://new', 'existing user layer wins');
  assert.equal(cfg.getConfig().model, 'new-model');

  await assert.rejects(fs.access(legacyPath), 'legacy file must still be removed');
});

await testAsync('Missing or corrupt legacy file is a no-op', async () => {
  const missingPath = path.join(TMP_HOME, 'no-such-config.json');
  const scope = createFakeSettingsScope();
  assert.equal(await migrateLegacyConfigFile(scope, missingPath), false);

  const corruptPath = path.join(TMP_HOME, 'corrupt-config.json');
  await fs.writeFile(corruptPath, '{not json', 'utf-8');
  assert.equal(await migrateLegacyConfigFile(scope, corruptPath), false);
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
