// SettingsStore unit tests: attach/derive, debounced scope writes,
// credentials Remote {ok,value} unwrapping, and aiConfigured derivation.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:3080/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.MutationObserver = dom.window.MutationObserver;
global.HTMLElement = dom.window.HTMLElement;

const { settingsStore, TRANSLATE_API_KEY_REF } = await import('../src/client/settings/store.ts');

let passed = 0;
let total = 0;
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Client-shape fake of the settingsScope service (mirror + path writes). */
function makeScope(initialValue) {
  const listeners = new Set();
  const mutations = [];
  let value = { ...initialValue };
  return {
    getSnapshot: () => ({ status: 'ready', value, writable: true }),
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    mutate: async (ops) => {
      for (const op of ops) {
        mutations.push(op);
        if (op.op === 'set') value = { ...value, [op.path[0]]: op.value };
        else {
          const { [op.path[0]]: _drop, ...rest } = value;
          value = rest;
        }
      }
      for (const l of [...listeners]) l();
    },
    mutations,
  };
}

/** Client-shape fake of the credentials Remote API ({ok,value} wrapper). */
function makeRemote(overrides = {}) {
  const calls = [];
  return {
    describe: async (refs) => {
      calls.push(['describe', refs]);
      return overrides.describe
        ? await overrides.describe(refs)
        : { ok: true, value: { [TRANSLATE_API_KEY_REF]: { configured: true, writable: true } } };
    },
    set: async (ref, v) => {
      calls.push(['set', ref, v]);
      return overrides.set ? await overrides.set(ref, v) : { ok: true, value: undefined };
    },
    unset: async (ref) => {
      calls.push(['unset', ref]);
      return overrides.unset ? await overrides.unset(ref) : { ok: true, value: undefined };
    },
    calls,
  };
}

console.log('=== SettingsStore unit tests ===');

test('defaults before attach', () => {
  const s = settingsStore.getState();
  assert.equal(s.enabled, true);
  assert.equal(s.concurrency, 3);
  assert.equal(s.aiConfigured, false);
});

await testAsync('attach derives state from the scope and key status from credentials', async () => {
  settingsStore.attach(
    makeScope({ enabled: false, concurrency: 7, baseUrl: 'http://x', model: 'm' }),
    makeRemote()
  );
  await sleep(10); // let the async key-status refresh settle
  const s = settingsStore.getState();
  assert.equal(s.enabled, false, 'scope value derived');
  assert.equal(s.concurrency, 7);
  assert.equal(s.baseUrl, 'http://x');
  assert.equal(s.aiConfigured, true, 'baseUrl + model + configured key => aiConfigured');
});

await testAsync('update applies locally and writes through the scope debounced', async () => {
  const scope = makeScope({});
  settingsStore.attach(scope, makeRemote());
  await sleep(10);

  settingsStore.update({ baseUrl: 'http://a' });
  settingsStore.update({ baseUrl: 'http://ab' });
  settingsStore.update({ model: 'm1' });
  assert.equal(settingsStore.getState().baseUrl, 'http://ab', 'optimistic local state');

  assert.equal(scope.mutations.length, 0, 'no write before the debounce window elapses');
  await sleep(350);
  assert.deepEqual(scope.mutations, [
    { op: 'set', path: ['baseUrl'], value: 'http://ab' },
    { op: 'set', path: ['model'], value: 'm1' },
  ], 'trailing debounce collapses keystrokes into one batched path mutation');
});

await testAsync('saveApiKey writes through credentials Remote and refreshes status', async () => {
  settingsStore.attach(makeScope({ baseUrl: 'http://x', model: 'm' }), makeRemote());
  await sleep(10);

  const res = await settingsStore.saveApiKey('sk-new');
  assert.equal(res.ok, true);
  assert.equal(settingsStore.getState().aiConfigured, true);
});

await testAsync('saveApiKey surfaces a refused Remote write as failure', async () => {
  settingsStore.attach(
    makeScope({ baseUrl: 'http://x', model: 'm' }),
    makeRemote({ set: async () => ({ ok: false, error: { code: 'x', message: 'env-shadowed ref' } }) })
  );
  await sleep(10);

  const res = await settingsStore.saveApiKey('sk-refused');
  assert.equal(res.ok, false, 'refusal must not report success');
  assert.match(res.error, /env-shadowed/);
});

await testAsync('saveApiKey with empty value unsets the ref', async () => {
  const remote = makeRemote();
  settingsStore.attach(makeScope({}), remote);
  await sleep(10);

  const res = await settingsStore.saveApiKey('   ');
  assert.equal(res.ok, true);
  assert.ok(
    remote.calls.some((c) => c[0] === 'unset' && c[1] === TRANSLATE_API_KEY_REF),
    'empty input clears via unset'
  );
});

await testAsync('unattached store degrades to in-memory mode without throwing', async () => {
  settingsStore.attach(null, null);
  await settingsStore.update({ enabled: false, baseUrl: 'http://x' });
  assert.equal(settingsStore.getState().enabled, false, 'local-only update works');
  const res = await settingsStore.saveApiKey('sk-x');
  assert.equal(res.ok, false, 'saveApiKey reports unavailable without the remote');
  assert.match(res.error, /不可用/);
});

settingsStore.dispose();
console.log('\n======================================================');
console.log(`All ${passed}/${total} store tests PASSED successfully!`);
console.log('======================================================\n');
