/**
 * 配置卡片状态机自检：这一层管的是「按一下保存会发生什么」。
 *
 * 这里守的是三条只有把控件真的点一遍才看得见的事：
 *   1. 两节各存各的——改端点不该动类型清单，清单没填全也不该挡住端点；
 *   2. 宿主回 `false` 是**拒绝**而非成功：把它当成功会让页面显示「已保存」，
 *      而配置文件里还是旧值；
 *   3. 未保存的草稿不会被宿主的下一次发布冲掉，而**已经落地**的那一节会刷新。
 *
 * 跑法：pnpm test / node scripts/test-card.mjs
 */
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildModelOptions,
  describeChoice,
  describeModel,
  DispatchCardStore,
  exportRowsJson,
  parseRowsJson,
  readRow,
  routeKey,
  splitRouteKey,
  validateRows,
  SETTINGS_NAMESPACE,
  ALLOWED_MODELS_NAMESPACE,
} from '../src/client/settings/store.ts';
import { JUDGE_API_KEY_REF } from '../src/server/credentials.ts';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));

let passed = 0;
let total = 0;
async function test(label, fn) {
  total += 1;
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${label}`);
  } catch (error) {
    console.error(`  FAIL ${label}: ${error.message}`);
    throw error;
  }
}

console.log(`# ${root}`);

/**
 * 一份宿主配置表单的替身：值、可写性、以及每次 `mutate` 要回什么。
 * `accept` 为 false 时模拟宿主拒绝——它 resolve(false)，不抛。
 */
function makeForm(initial = {}, accept = true) {
  let value = {
    enabled: true,
    logEnabled: true,
    endpointUrl: 'http://judge.invalid/v1/systemone',
    judgeModel: 'jev-latest',
    rows: [{ description: '机械修改', provider: 'd1api', model: 'deepseek-v4.1-flash', effort: 'low' }],
    ...initial,
  };
  const writes = [];
  let writable = true;
  const listeners = new Set();
  return {
    writes,
    setWritable(next) {
      writable = next;
    },
    push(next) {
      value = { ...value, ...next };
      for (const listener of [...listeners]) listener();
    },
    form: {
      getSnapshot: () => ({ status: 'ready', value, writable, revision: 1 }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      mutate: async (ops) => {
        writes.push(ops);
        if (!accept) return false;
        for (const op of ops) {
          if (op.op === 'set') value = { ...value, [op.path[0]]: op.value };
        }
        for (const listener of [...listeners]) listener();
        return true;
      },
    },
  };
}

/** 凭据服务的替身：只记账，从不把值读回来。 */
function makeCredentials(options = {}) {
  const set = [];
  const unset = [];
  const configured = options.configured ?? false;
  const accept = options.accept ?? true;
  return {
    set,
    unset,
    credentials: {
      describe: async () => ({ ok: true, value: { [JUDGE_API_KEY_REF]: { configured, writable: true } } }),
      set: async (ref, value) => {
        set.push([ref, value]);
        return accept ? { ok: true } : { ok: false, error: { message: '凭据被环境变量遮住了' } };
      },
      unset: async (ref) => {
        unset.push(ref);
        return accept ? { ok: true } : { ok: false, error: { message: '删不掉' } };
      },
    },
  };
}

/** 一份接好线的卡片 store；每次测试各持一份，互不串状态。 */
function makeStore(options = {}) {
  const host = makeForm(options.config, options.accept ?? true);
  const keys = makeCredentials(options.keyOptions);
  const store = new DispatchCardStore();
  store.attach({
    form: host.form,
    allowedForm: {
      getSnapshot: () => ({
        status: 'ready',
        writable: true,
        value: {
          allowedModels: [
            { provider: 'd1api', model: 'deepseek-v4.1-flash' },
            { provider: 'a6api', model: 'kimi-k3' },
          ],
        },
      }),
      subscribe: () => () => {},
      mutate: async () => true,
    },
    session: {
      modelCatalog: async () => ({
        ok: true,
        value: {
          groups: [
            {
              id: 'd1api',
              name: 'd1api',
              models: [{
                id: 'deepseek-v4.1-flash',
                name: 'DeepSeek V4.1 Flash',
                reasoning: { efforts: [{ id: 'low' }, { id: 'high' }, { id: 'max' }] },
              }],
            },
            {
              id: 'a6api',
              name: 'a6api',
              models: [{
                id: 'kimi-k3',
                name: 'Kimi K3',
                reasoning: { efforts: [{ id: 'low' }] },
              }],
            },
          ],
        },
      }),
    },
    remote: {
      log: async () => [],
      preview: async () => '{}',
      probe: async () => ({ ok: true, latencyMs: 1 }),
    },
    credentials: keys.credentials,
    t: (key) => key,
  });
  return { store, host, keys };
}

await test('两节各存各的：改端点不动类型清单', async () => {
  const { store, host } = makeStore();
  assert.equal(store.getState().rowsDirty, false);
  store.field('endpointUrl', 'http://other.invalid/v1/systemone');
  const state = store.getState();
  assert.equal(state.judgeDirty, true, '判断服务那节应当脏了');
  assert.equal(state.rowsDirty, false, '类型清单这一节不该跟着脏');

  await store.save('judge');
  assert.equal(host.writes.length, 1);
  assert.deepEqual(host.writes[0].map((op) => op.path[0]), ['endpointUrl']);
  assert.equal(store.getState().judgeDirty, false);
  assert.equal(store.getState().rowsDirty, false);
});

await test('类型清单没填全时，判断服务那节照样能存', async () => {
  const { store, host } = makeStore();
  store.addRow();
  assert.notEqual(store.getState().rowsInvalid, '', '新加的空行应当让清单存不了');

  store.field('judgeModel', '另一个判断模型');
  await store.save('judge');
  assert.equal(host.writes.length, 1, '清单的毛病不该挡住端点这一节');
  assert.equal(store.getState().judgeDirty, false);
});

await test('清单没填全时按保存，一个字节都不写', async () => {
  const { store, host } = makeStore();
  store.addRow();
  await store.save('rows');
  assert.equal(host.writes.length, 0);
  assert.notEqual(store.getState().rowsInvalid, '');
});

await test('宿主回 false 是拒绝，不是成功：页面必须报没存上', async () => {
  const { store, host } = makeStore({ accept: false });
  store.field('endpointUrl', 'http://refused.invalid/v1/systemone');
  await store.save('judge');
  const state = store.getState();
  assert.equal(host.writes.length, 1, '写确实发出去了');
  assert.equal(state.saveFailed, 'judge', '宿主没接受就该报失败，并归到发起保存的那一节');
  assert.notEqual(state.saveError, '');
  assert.equal(state.judgeDirty, true, '没落地就还得是脏的');
});

await test('宿主抛错时把宿主自己的话显示出来', async () => {
  const { store, host } = makeStore();
  host.form.mutate = async () => {
    throw new Error('revision conflict');
  };
  store.field('endpointUrl', 'http://boom.invalid/v1/systemone');
  await store.save('judge');
  assert.equal(store.getState().saveError, 'revision conflict');
});

await test('密钥跟着判断服务那次保存一起写，且写的是固定引用名', async () => {
  const { store, keys, host } = makeStore();
  store.key('magpie');
  assert.equal(store.getState().judgeDirty, true, '填了密钥也算这一节有改动');

  await store.save('judge');
  assert.deepEqual(keys.set, [[JUDGE_API_KEY_REF, 'magpie']]);
  assert.equal(host.writes.length, 0, '只填密钥不改设置时没有文档写入');
  assert.equal(store.getState().key.text, '', '落地之后输入框清空');
  assert.equal(store.getState().key.landed, 'saved');
  assert.equal(store.getState().judgeDirty, false);
});

await test('密钥写入被拒时，设置一个字节都不写', async () => {
  const { store, keys, host } = makeStore({ keyOptions: { accept: false } });
  store.key('magpie');
  store.field('endpointUrl', 'http://never.invalid/v1/systemone');
  await store.save('judge');
  assert.equal(keys.set.length, 1);
  assert.equal(host.writes.length, 0, '密钥没写进去就不该再动设置');
  assert.notEqual(store.getState().saveFailed, '');
  assert.equal(store.getState().key.text, 'magpie', '没存上就把输入留着，别让读者重打');
});

await test('密钥值从不进页面状态，只在写入那一刻交给凭据服务', async () => {
  const { store, keys } = makeStore();
  store.key('  sk-secret-value  ');
  await store.save('judge');
  assert.deepEqual(keys.set[0][1], 'sk-secret-value', '写入前去掉两端空白');
  const serialized = JSON.stringify(store.getState());
  assert.equal(serialized.includes('sk-secret-value'), false, '密钥值不该留在状态里');
});

await test('已经存了密钥时状态栏说已存，删掉后说没存', async () => {
  const { store, keys } = makeStore({ keyOptions: { configured: true } });
  await new Promise((tick) => setTimeout(tick, 0));
  assert.equal(store.getState().key.configured, true);
  await store.clearKey();
  assert.deepEqual(keys.unset, [JUDGE_API_KEY_REF]);
  assert.equal(store.getState().key.landed, 'cleared');
});

await test('未保存的草稿不被宿主的下一次发布冲掉', async () => {
  const { store, host } = makeStore();
  store.field('endpointUrl', 'http://mid-typing.invalid/v1/sys');
  host.push({ judgeModel: '宿主换了模型' });
  assert.equal(store.getState().endpointUrl, 'http://mid-typing.invalid/v1/sys', '正在输入的端点不该被冲掉');
  assert.equal(store.getState().judgeModel, '宿主换了模型', '没在改的那一项跟着宿主走');
});

await test('宿主改了一项而我在改另一项时，保存不会把那一项写回去', async () => {
  const { store, host } = makeStore();
  store.field('endpointUrl', 'http://mid-typing.invalid/v1/sys');
  host.push({ judgeModel: '另一个页面改的模型' });
  await store.save('judge');
  const paths = host.writes.flat().map((op) => op.path[0]);
  assert.deepEqual(paths, ['endpointUrl'], '只该写读者真正改过的那一项');
  assert.equal(host.writes.flat()[0].value, 'http://mid-typing.invalid/v1/sys');
  assert.equal(store.getState().judgeModel, '另一个页面改的模型', '别处的改动要留在页面上');
  assert.equal(store.getState().judgeDirty, false);
});

await test('落地之后，宿主发布的新值会刷新到页面', async () => {
  const { store, host } = makeStore();
  await store.save('rows');
  host.push({ endpointUrl: 'http://moved.invalid/v1/systemone' });
  assert.equal(store.getState().endpointUrl, 'http://moved.invalid/v1/systemone');
});

await test('放弃改动只丢那一节', async () => {
  const { store } = makeStore();
  store.field('endpointUrl', 'http://discard.invalid/v1/systemone');
  store.addRow();
  store.revert('judge');
  assert.equal(store.getState().endpointUrl, 'http://judge.invalid/v1/systemone');
  assert.equal(store.getState().rowsDirty, true, '另一节的草稿还在');
});

await test('放弃判断服务那节的草稿，不会把「已存密钥」说成「还没有密钥」', async () => {
  const { store } = makeStore({ keyOptions: { configured: true } });
  await new Promise((tick) => setTimeout(tick, 0));
  assert.equal(store.getState().key.configured, true);
  store.field('endpointUrl', 'http://discard.invalid/v1/systemone');
  store.revert('judge');
  assert.equal(store.getState().key.configured, true, '密钥还在凭据文件里，页面不该改口');
  assert.equal(store.getState().key.text, '', '只清掉还没交出去的那段文本');
});

await test('保存失败按节报，且改一处就清掉上一次的失败', async () => {
  const { store } = makeStore({ accept: false });
  // 清单里先放一条填全的行，让清单那一节也能真的发出保存。
  store.cell(0, 'description', '评审代码');
  store.field('endpointUrl', 'http://refused.invalid/v1/systemone');
  await store.save('judge');
  assert.equal(store.getState().saveFailed, 'judge', '失败归属发起保存的那一节');

  store.addRow();
  assert.equal(store.getState().saveFailed, '', '一有改动，上一次的失败就不再是当前事实');
});

await test('页面没有凭据通道时，密钥格标成不可用', async () => {
  const host = makeForm();
  const store = new DispatchCardStore();
  store.attach({
    form: host.form,
    allowedForm: null,
    session: null,
    remote: null,
    credentials: null,
    t: (key) => key,
  });
  assert.equal(store.getState().key.unavailable, true);
  assert.equal(store.getState().key.writable, false);
});

await test('宿主说不可写时，按保存什么也不做', async () => {
  const { store, host } = makeStore();
  host.setWritable(false);
  host.push({});
  store.field('endpointUrl', 'http://readonly.invalid/v1/systemone');
  await store.save('judge');
  assert.equal(host.writes.length, 0);
});

await test('换成不声明这个强度的模型时，强度跟着清掉', async () => {
  const { store } = makeStore();
  await new Promise((tick) => setTimeout(tick, 0));
  store.cell(0, 'effort', 'max');
  store.cell(0, 'provider', 'a6api');
  store.cell(0, 'model', 'kimi-k3');
  assert.equal(store.getState().rows[0].effort, '', 'kimi-k3 没有 max，留着它保存就会带上跑不了的强度');
});

await test('换成声明同样强度的模型时，强度保留', async () => {
  const { store } = makeStore();
  await new Promise((tick) => setTimeout(tick, 0));
  store.cell(0, 'effort', 'low');
  store.cell(0, 'provider', 'a6api');
  store.cell(0, 'model', 'kimi-k3');
  assert.equal(store.getState().rows[0].effort, 'low');
});

await test('行残缺的判据就是宿主那条：三项都要有', () => {
  const { store } = makeStore();
  assert.equal(store.rowUsable({ description: 'a', provider: 'p', model: 'm', effort: 'low' }), true);
  assert.equal(store.rowUsable({ description: 'a', provider: 'p', model: 'm', effort: '' }), false);
  assert.equal(store.rowUsable({ description: 'a', provider: '', model: 'm', effort: 'low' }), false);
});

await test('路由键能原样拆回来（分隔符不会撞进 id）', () => {
  assert.deepEqual(splitRouteKey(routeKey('d1api', 'deepseek-v4.1-flash')), {
    provider: 'd1api', model: 'deepseek-v4.1-flash',
  });
  assert.deepEqual(splitRouteKey('没有分隔符'), { provider: '', model: '' });
});

await test('模型选项只列宿主允许的路由，并带上它声明的强度', () => {
  const options = buildModelOptions(
    [{ provider: 'd1api', model: 'deepseek-v4.1-flash' }, { provider: 'ghost', model: 'gone' }],
    [{ id: 'd1api', models: [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash', reasoning: { efforts: [{ id: 'low' }] } }] }],
  );
  assert.deepEqual(options.map((option) => option.provider), ['d1api', 'ghost']);
  assert.equal(options[0].label, 'DeepSeek V4.1 Flash');
  assert.deepEqual(options[0].efforts, ['low']);
  assert.deepEqual(options[1].efforts, [], '目录里已经没有了也照样能选，只是没有强度可选');
});

await test('存下来的行读得回来，缺字段当空串', () => {
  assert.deepEqual(readRow({ description: 'a', provider: 'p' }), {
    description: 'a', provider: 'p', model: '', effort: '',
  });
  assert.deepEqual(readRow(null), { description: '', provider: '', model: '', effort: '' });
});

await test('「选择」一列写模型与强度，供应商留给悬停的整段路', () => {
  const row = { provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'high' };
  assert.equal(describeModel(row), 'deepseek/deepseek-flash · high');
  assert.equal(describeChoice(row), 'magpie · deepseek/deepseek-flash · high');
});

await test('两条路都不留下悬空的分隔点', () => {
  // 退回时强度可能读不到，两条路都不该写成「m · 」或「magpie · m · 」。
  assert.equal(describeModel({ model: 'm', effort: '' }), 'm');
  assert.equal(describeChoice({ provider: 'magpie', model: 'm', effort: '' }), 'magpie · m');
  assert.equal(describeChoice({ provider: '', model: 'm', effort: 'low' }), 'm · low');
  assert.equal(describeChoice({ provider: '  ', model: '  ', effort: '  ' }), '');
  assert.equal(describeModel({ model: '  ', effort: '  ' }), '');
});

await test('带一条没填完的行也能读了再粘回来（导出与导入往返）', () => {
  const rows = [
    { description: '机械修改', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' },
    // 「加一行」之后还没填的那一条：导出不该把它写成一行空壳，导入也不该拒收。
    { description: '', provider: '', model: '', effort: '' },
  ];
  const text = exportRowsJson(rows);
  assert.deepEqual(JSON.parse(text), [rows[0]], '空白行不写进 JSON');
  assert.deepEqual(parseRowsJson(text), { ok: true, rows: [rows[0]] });

  // 别人手写的 JSON 里带着一条空白行，同样照收其余几条。
  const pasted = JSON.stringify([rows[0], { description: '', provider: '', model: '', effort: '' }]);
  assert.deepEqual(parseRowsJson(pasted), { ok: true, rows: [rows[0]] });
});

await test('整份都是空行时算空清单', () => {
  assert.deepEqual(parseRowsJson('[{"description":"","provider":"","model":"","effort":""}]'), {
    ok: false, error: 'empty',
  });
});

await test('导出就是清单本身，不带编号', () => {
  const text = exportRowsJson([
    { description: '机械修改', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' },
    { description: '评审代码', provider: '', model: '', effort: '' },
  ]);
  assert.deepEqual(JSON.parse(text), [
    { description: '机械修改', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' },
    { description: '评审代码', provider: '', model: '', effort: '' },
  ]);
});

await test('导出的文本读回来还是那几条', () => {
  const rows = [
    { description: '机械修改', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' },
    { description: '评审代码', provider: 'a6api', model: 'kimi-k3', effort: 'high' },
  ];
  assert.deepEqual(parseRowsJson(exportRowsJson(rows)), { ok: true, rows });
});

await test('导入认不出 JSON、不是数组、字段不是文字，各报各的', () => {
  assert.deepEqual(parseRowsJson('{不是 JSON'), { ok: false, error: 'json' });
  assert.deepEqual(parseRowsJson('{"description":"a"}'), { ok: false, error: 'shape' });
  assert.deepEqual(parseRowsJson('["a"]'), { ok: false, error: 'shape' });
  assert.deepEqual(parseRowsJson('[{"description":1}]'), { ok: false, error: 'shape' });
  // 只剩空行时等于一份空清单，按空清单说。
  assert.deepEqual(parseRowsJson('[{}]'), { ok: false, error: 'empty' });
  assert.deepEqual(parseRowsJson('[]'), { ok: false, error: 'empty' });
});

await test('导入认得缺字段与多出来的字段', () => {
  const result = parseRowsJson(JSON.stringify([
    { description: '只有描述' },
    { description: '多一个字段', provider: 'p', model: 'm', effort: 'low', extra: '不认识的' },
  ]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows, [
    { description: '只有描述', provider: '', model: '', effort: '' },
    { description: '多一个字段', provider: 'p', model: 'm', effort: 'low' },
  ]);
});

await test('描述空或重了都不让存', () => {
  const t = (key) => key;
  assert.notEqual(validateRows([{ description: '  ', provider: 'p', model: 'm', effort: 'e' }], t), '');
  assert.notEqual(validateRows([
    { description: 'a', provider: 'p', model: 'm', effort: 'e' },
    { description: 'a', provider: 'p', model: 'm', effort: 'e' },
  ], t), '');
  assert.equal(validateRows([{ description: 'a', provider: 'p', model: 'm', effort: 'e' }], t), '');
});

await test('命名空间与包名是两个字面量，各自写在各自的地方', () => {
  assert.equal(SETTINGS_NAMESPACE, 'dsh-subagent-judge-dispatch');
  assert.equal(ALLOWED_MODELS_NAMESPACE, 'subagent-model-selection-settings');
});

console.log(`${passed}/${total} passed`);
