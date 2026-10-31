// SettingsStore unit tests: attach/derive over the shared configuration form,
// staged drafts that write nothing while the reader types, the commit's
// revision-fenced path-op batch, the credentials Remote unwrapping, and the
// master switch written straight through.
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

const { settingsStore, TRANSLATE_API_KEY_REF, parseTimeout, AI_TIMEOUT_MIN, AI_TIMEOUT_MAX } =
  await import('../src/client/settings/store.ts');
const { DEFAULT_PROMPT } = await import('../src/prompt.ts');

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Client-shape fake of `ConfigForm<T>` — the per-entry face
 * `ctx.configForms.get(<profile entry id>)` returns: a mirror snapshot plus one
 * revision-fenced path-write batch.
 */
function makeForm(initialValue) {
  const listeners = new Set();
  const mutations = [];
  let value = { ...initialValue };
  return {
    getSnapshot: () => ({ status: 'ready', value, writable: true, revision: 1, mode: 'host' }),
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
  // 这一份替身记得住自己的状态：set/unset 之后 describe 要说实话，否则「清空 Key
  // 之后界面还显示已配置」这类 bug 会被替身自己抹平。
  let configured = overrides.configured ?? true;
  return {
    describe: async (refs) => {
      calls.push(['describe', refs]);
      return overrides.describe
        ? await overrides.describe(refs)
        : { ok: true, value: { [TRANSLATE_API_KEY_REF]: { configured, writable: true } } };
    },
    set: async (ref, v) => {
      calls.push(['set', ref, v]);
      if (overrides.set) return await overrides.set(ref, v);
      if (ref === TRANSLATE_API_KEY_REF) configured = true;
      return { ok: true, value: undefined };
    },
    unset: async (ref) => {
      calls.push(['unset', ref]);
      if (overrides.unset) return await overrides.unset(ref);
      if (ref === TRANSLATE_API_KEY_REF) configured = false;
      return { ok: true, value: undefined };
    },
    calls,
  };
}

console.log('=== SettingsStore unit tests ===');

await testAsync('默认值：未挂载时按内置默认读，未配置算未就绪', async () => {
  settingsStore.attach(null, null);
  const s = settingsStore.getState();
  assert.equal(s.committed.enabled, true);
  assert.equal(s.committed.aiTimeoutMs, 600000);
  assert.equal(s.committed.aiConfigured, false);
  assert.equal(s.available, false, '没有配置面就不算可用');
});

await testAsync('attach 后从表单读出已保存值，草稿就位且一个字都不脏', async () => {
  const form = makeForm({ enabled: false, aiTimeoutMs: 120000, baseUrl: 'http://x', model: 'm' });
  let subscribed = 0;
  const subscribe = form.subscribe;
  form.subscribe = (listener) => { subscribed++; return subscribe(listener); };
  settingsStore.attach(form, makeRemote());
  await sleep(10); // let the async key-status refresh settle
  assert.ok(subscribed > 0, 'the store subscribes so a Host-side change is picked up');
  const s = settingsStore.getState();
  assert.equal(s.committed.enabled, false, 'form value derived');
  assert.equal(s.committed.aiTimeoutMs, 120000);
  assert.equal(s.committed.aiConfigured, true, 'baseUrl + model + configured key => aiConfigured');
  assert.equal(s.baseUrl.text, 'http://x', '草稿就是已保存的那份');
  assert.equal(s.aiTimeoutMs.text, '120000');
  assert.equal(s.dirty, false, '刚挂载没有任何待保存的改动');
});

await testAsync('暂存：打字期间不写盘，已保存值与渲染读到的都不动', async () => {
  const form = makeForm({ baseUrl: 'http://old', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);

  settingsStore.draft('baseUrl', 'http://new');
  settingsStore.draft('model', 'm2');
  await sleep(20);

  assert.equal(form.mutations.length, 0, '打字期间一个字都不许写盘');
  assert.equal(settingsStore.getState().baseUrl.text, 'http://new', '草稿留在页面上');
  assert.equal(settingsStore.getState().committed.baseUrl, 'http://old', '已保存值是另一份');
  assert.equal(settingsStore.getState().dirty, true, '有待保存的改动');
});

await testAsync('保存：整批路径写一次交上去，草稿归位、dirty 复位', async () => {
  const form = makeForm({ baseUrl: 'http://old', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);

  settingsStore.draft('baseUrl', 'http://new');
  settingsStore.draft('model', 'm2');
  settingsStore.draft('aiTimeoutMs', '45000');
  await settingsStore.save();

  assert.deepEqual(
    form.mutations,
    [
      { op: 'set', path: ['baseUrl'], value: 'http://new' },
      { op: 'set', path: ['model'], value: 'm2' },
      { op: 'set', path: ['aiTimeoutMs'], value: 45000 },
    ],
    '一次保存 = 一批路径写，按字段顺序'
  );
  const s = settingsStore.getState();
  assert.equal(s.committed.baseUrl, 'http://new', '保存后已保存值跟着走');
  assert.equal(s.committed.model, 'm2');
  assert.equal(s.committed.aiTimeoutMs, 45000);
  assert.equal(s.dirty, false, '保存完没有待保存的改动');
  assert.equal(s.saving, false);
});

await testAsync('清空一项等于恢复默认：写 unset 而不是空串', async () => {
  const form = makeForm({ baseUrl: 'http://old', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.draft('baseUrl', '   ');
  await settingsStore.save();
  assert.deepEqual(form.mutations, [{ op: 'unset', path: ['baseUrl'] }]);
  assert.equal(settingsStore.getState().committed.baseUrl, '');
});

await testAsync('超时草稿解析：空 = 清除，越界与非数字都算不合法', async () => {
  assert.equal(parseTimeout(''), null, '空草稿 = 清除该项');
  assert.equal(parseTimeout('   '), null, '只有空白也算空');
  assert.equal(parseTimeout('45000'), 45000);
  assert.equal(parseTimeout(' 45000 '), 45000, '两侧空白不算错');
  assert.equal(parseTimeout('45000.6'), 45001, '小数四舍五入到整数毫秒');
  assert.equal(parseTimeout('abc'), undefined, '非数字不合法，拦住保存');
  assert.equal(parseTimeout(String(AI_TIMEOUT_MIN - 1)), undefined, '低于下界不合法——不悄悄收进范围');
  assert.equal(parseTimeout(String(AI_TIMEOUT_MAX + 1)), undefined, '高于上界同样不合法');
  assert.equal(parseTimeout(String(AI_TIMEOUT_MIN)), AI_TIMEOUT_MIN, '边界值本身合法');
  assert.equal(parseTimeout(String(AI_TIMEOUT_MAX)), AI_TIMEOUT_MAX);
});

await testAsync('清空超时草稿后保存：写 unset 让该项回落默认，而不是留着旧值', async () => {
  const form = makeForm({ baseUrl: 'http://x', model: 'm', aiTimeoutMs: 45000 });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.draft('aiTimeoutMs', '');
  await settingsStore.save();
  assert.deepEqual(form.mutations, [{ op: 'unset', path: ['aiTimeoutMs'] }], '空草稿 = unset');
  assert.equal(
    settingsStore.getState().committed.aiTimeoutMs,
    600000,
    '清除后回落到 schema 默认，页面也照实回显'
  );
});

await testAsync('超时草稿不合法时拦住保存，草稿留着供改正', async () => {
  const form = makeForm({ baseUrl: 'http://x', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.draft('aiTimeoutMs', 'abc');
  assert.equal(settingsStore.getState().invalid, true, '不合法进 invalid，页面据此禁用保存');
  await settingsStore.save();
  assert.equal(form.mutations.length, 0, '不合法就一个字都不写');
  assert.equal(settingsStore.getState().aiTimeoutMs.text, 'abc', '草稿留着，不是丢弃');
});

await testAsync('提示词输入框显示生效的那份：没写过就整段显示内置默认，且不算改动', async () => {
  const form = makeForm({ baseUrl: 'http://x', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  const s = settingsStore.getState();
  assert.equal(s.committed.prompt, '', '文档里存的是空值');
  assert.equal(s.prompt.text, DEFAULT_PROMPT, '输入框显示生效的默认指令');
  assert.equal(s.dirty, false, '显示默认不等于有改动');
  await settingsStore.save();
  assert.equal(form.mutations.length, 0, '没动就不写一条记录');
});

await testAsync('改写提示词：先停在草稿里，离开输入框才写一条 set', async () => {
  const form = makeForm({ baseUrl: 'http://x', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.draft('prompt', '把这段话当成人话重写。');
  assert.equal(form.mutations.length, 0, '打字期间不写盘');
  assert.equal(settingsStore.getState().dirty, true);
  await settingsStore.save();
  assert.deepEqual(form.mutations, [
    { op: 'set', path: ['prompt'], value: '把这段话当成人话重写。' },
  ]);
  assert.equal(settingsStore.getState().committed.prompt, '把这段话当成人话重写。');
  assert.equal(settingsStore.getState().dirty, false);
});

await testAsync('清空提示词框后点完成：框里回到生效的那份，不再是空的', async () => {
  // 只读态显示的是「模型实际收到什么」。空草稿等于默认，若就这样回到只读态，
  // 读者看到的是一个空框，而模型仍在收默认指令——与配置页的承诺相反。
  const form = makeForm({ baseUrl: 'http://x', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.draft('prompt', '');
  settingsStore.settlePromptDraft();
  const s = settingsStore.getState();
  assert.equal(s.prompt.text, DEFAULT_PROMPT, '空草稿被填回生效的默认指令');
  assert.equal(s.prompt.dirty, false, '填回默认不算改动');
  assert.equal(form.mutations.length, 0, '这一步只是把框摆正，不写盘');
});

await testAsync('拨一下「译」胶囊不会冲掉正在改的提示词草稿', async () => {
  // 胶囊写的是 enabled，与提示词无关；宿主通知回来时不能把 prompt 草稿一起重置。
  const form = makeForm({ baseUrl: 'http://x', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.draft('prompt', '正在改的一段');
  await settingsStore.setEnabled(false);
  await sleep(10);
  const s = settingsStore.getState();
  assert.equal(s.committed.enabled, false, '前置：开关确实写下去了');
  assert.equal(s.prompt.text, '正在改的一段', '提示词草稿原样留着');
  assert.equal(s.dirty, true, '仍算有待保存的改动');
});

await testAsync('宿主那边真改了提示词时，草稿跟着换成新的已保存值', async () => {
  const form = makeForm({ baseUrl: 'http://x', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.draft('prompt', '本地没保存的一段');
  await form.mutate([{ op: 'set', path: ['prompt'], value: '别处写进来的' }]);
  await sleep(10);
  const s = settingsStore.getState();
  assert.equal(s.committed.prompt, '别处写进来的');
  assert.equal(s.prompt.text, '别处写进来的', '这一格跟着已保存值走');
  assert.equal(s.prompt.dirty, false);
});

await testAsync('一字不差贴回默认 = 回到默认：写 unset 而不是把默认抄进配置', async () => {
  const form = makeForm({ baseUrl: 'http://x', model: 'm', prompt: '我自己写的一段' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.draft('prompt', DEFAULT_PROMPT);
  await settingsStore.save();
  assert.deepEqual(form.mutations, [{ op: 'unset', path: ['prompt'] }]);
  assert.equal(settingsStore.getState().committed.prompt, '');
  assert.equal(settingsStore.getState().prompt.text, DEFAULT_PROMPT, '输入框仍显示生效的默认');
});

await testAsync('恢复默认只是填回草稿，离开输入框才写盘', async () => {
  const form = makeForm({ baseUrl: 'http://x', model: 'm', prompt: '我自己写的一段' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.restoreDefaultPrompt();
  assert.equal(settingsStore.getState().prompt.text, DEFAULT_PROMPT);
  assert.equal(form.mutations.length, 0, '恢复默认不写盘');
  await settingsStore.save();
  assert.deepEqual(form.mutations, [{ op: 'unset', path: ['prompt'] }]);
});

await testAsync('总开关拨一下就写，不必等离开输入框', async () => {
  const form = makeForm({ enabled: true, baseUrl: 'http://x', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  await settingsStore.setEnabled(false);
  assert.deepEqual(form.mutations, [{ op: 'set', path: ['enabled'], value: false }]);
  assert.equal(settingsStore.getState().committed.enabled, false, '胶囊与配置页共用的状态立刻跟着变');
});

await testAsync('API Key 与其它设置共用一次保存：草稿写进凭据面，草稿随后清空', async () => {
  const form = makeForm({ baseUrl: 'http://old', model: 'm' });
  const remote = makeRemote();
  settingsStore.attach(form, remote);
  await sleep(10);
  settingsStore.draft('baseUrl', 'http://new');
  settingsStore.draft('apiKey', 'sk-fresh');
  await settingsStore.save();
  assert.ok(
    remote.calls.some((c) => c[0] === 'set' && c[1] === TRANSLATE_API_KEY_REF && c[2] === 'sk-fresh'),
    'Key 在同一次保存里写进凭据面'
  );
  assert.equal(settingsStore.getState().apiKey.text, '', '密钥不回显：草稿保存后清空');
  assert.equal(settingsStore.getState().committed.baseUrl, 'http://new');
});

await testAsync('同时两次提交共享同一批写，不重复落盘', async () => {
  const form = makeForm({ baseUrl: 'http://old', model: 'm' });
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.draft('baseUrl', 'http://new');
  await Promise.all([settingsStore.save(), settingsStore.save()]);
  assert.deepEqual(form.mutations, [{ op: 'set', path: ['baseUrl'], value: 'http://new' }], '只写一批');
  assert.equal(settingsStore.getState().dirty, false);
});

await testAsync('out-of-range 超时收进范围', async () => {
  settingsStore.attach(makeForm({ aiTimeoutMs: 10 ** 9 }), makeRemote());
  await sleep(10);
  assert.equal(settingsStore.getState().committed.aiTimeoutMs, 900000);
  settingsStore.attach(makeForm({ aiTimeoutMs: 1 }), makeRemote());
  await sleep(10);
  assert.equal(settingsStore.getState().committed.aiTimeoutMs, 500);
});

await testAsync('saveApiKey writes through credentials Remote and refreshes status', async () => {
  settingsStore.attach(makeForm({ baseUrl: 'http://x', model: 'm' }), makeRemote());
  await sleep(10);

  const res = await settingsStore.saveApiKey('sk-new');
  assert.equal(res.ok, true);
  assert.equal(settingsStore.getState().committed.aiConfigured, true);
});

await testAsync('saveApiKey surfaces a refused Remote write as failure', async () => {
  settingsStore.attach(
    makeForm({ baseUrl: 'http://x', model: 'm' }),
    makeRemote({ set: async () => ({ ok: false, error: { code: 'x', message: 'env-shadowed ref' } }) })
  );
  await sleep(10);

  const res = await settingsStore.saveApiKey('sk-refused');
  assert.equal(res.ok, false, 'refusal must not report success');
  assert.match(res.error, /env-shadowed/);
});

await testAsync('清空 Key 草稿后保存：unset 该 ref，界面不再显示已配置', async () => {
  const remote = makeRemote();
  settingsStore.attach(makeForm({ baseUrl: 'http://x', model: 'm' }), remote);
  await sleep(10);
  // 读者把 Key 那一格清空（先碰过它，才谈得上「清掉」）。
  settingsStore.draft('apiKey', 'sk-typed-then-cleared');
  settingsStore.draft('apiKey', '');
  await settingsStore.save();
  assert.ok(
    remote.calls.some((call) => call[0] === 'unset' && call[1] === TRANSLATE_API_KEY_REF),
    '空草稿保存 = 清除该 ref'
  );
  assert.equal(settingsStore.getState().committed.aiConfigured, false, '清除后不再算已配置');
});

await testAsync('没碰过 Key 那一格时空草稿保存：不动这个 ref', async () => {
  const remote = makeRemote();
  settingsStore.attach(makeForm({ baseUrl: 'http://old', model: 'm' }), remote);
  await sleep(10);
  settingsStore.draft('baseUrl', 'http://new');
  await settingsStore.save();
  assert.ok(
    !remote.calls.some((call) => call[0] === 'set' || call[0] === 'unset'),
    '密钥从不回显，空草稿的默认含义是「别动它」'
  );
});

await testAsync('saveApiKey with empty value unsets the ref', async () => {
  const remote = makeRemote();
  settingsStore.attach(makeForm({}), remote);
  await sleep(10);

  const res = await settingsStore.saveApiKey('   ');
  assert.equal(res.ok, true);
  assert.ok(
    remote.calls.some((c) => c[0] === 'unset' && c[1] === TRANSLATE_API_KEY_REF),
    'empty input clears via unset'
  );
});

await testAsync('一条被拒绝的写：草稿全部留着，页面报失败', async () => {
  const form = makeForm({ baseUrl: 'http://old', model: 'm' });
  form.mutate = async () => {
    throw new Error('revision conflict');
  };
  settingsStore.attach(form, makeRemote());
  await sleep(10);
  settingsStore.draft('baseUrl', 'http://new');
  await settingsStore.save();
  const s = settingsStore.getState();
  assert.equal(s.saveFailed, true, '被拒绝要报出来，不能装作写成功');
  assert.equal(s.baseUrl.text, 'http://new', '草稿留着供改正');
  assert.equal(s.saving, false);
  assert.equal(s.committed.baseUrl, 'http://old', '被拒绝的值不进已保存状态');
});

await testAsync('unattached store degrades to in-memory mode without throwing', async () => {
  settingsStore.attach(null, null);
  await settingsStore.setEnabled(false);
  assert.equal(settingsStore.getState().committed.enabled, false, 'local-only update works');
  const res = await settingsStore.saveApiKey('sk-x');
  assert.equal(res.ok, false, 'saveApiKey reports unavailable without the remote');
  assert.match(res.error, /不可用/);
});

settingsStore.dispose();
console.log('\n======================================================');
console.log(`All ${passed}/${total} store tests PASSED successfully!`);
console.log('======================================================\n');
