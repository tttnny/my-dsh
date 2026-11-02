/**
 * 配置卡片状态机自检：这一层管的是「一次提交会发生什么」。
 *
 * 这里守的是只有把控件真的点一遍才看得见的事：
 *   1. 按控件各自的时机写——文字格离开才写、开关与行动作当场写——且两节各写各的；
 *   2. 宿主回 `false` 是**拒绝**而非成功：把它当成功会让页面显示已保存，
 *      而配置文件里还是旧值；
 *   3. 没填完的行照常写入（服务端本来就跳过不可用的行），页面只在行上提示；
 *   4. 连续两次提交合并成一次写，写的是最新值。
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
  rowHints,
  routeKey,
  splitRouteKey,
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
  let acceptNow = accept;
  const listeners = new Set();
  return {
    writes,
    setWritable(next) {
      writable = next;
    },
    setAccept(next) {
      acceptNow = next;
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
        if (!acceptNow) return false;
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
  let configured = options.configured ?? false;
  const accept = options.accept ?? true;
  return {
    set,
    unset,
    credentials: {
      describe: async () => ({ ok: true, value: { [JUDGE_API_KEY_REF]: { configured, writable: true } } }),
      set: async (ref, value) => {
        set.push([ref, value]);
        if (!accept) return { ok: false, error: { message: '凭据被环境变量遮住了' } };
        configured = true;
        return { ok: true };
      },
      unset: async (ref) => {
        unset.push(ref);
        if (!accept) return { ok: false, error: { message: '删不掉' } };
        configured = false;
        return { ok: true };
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

await test('文字格只在提交时写，且只写改过的那一项', async () => {
  const { store, host } = makeStore();
  store.field('endpointUrl', 'http://other.invalid/v1/systemone');
  assert.equal(host.writes.length, 0, '还没离开输入框，一个字节都不写');

  await store.commit('judge');
  assert.equal(host.writes.length, 1);
  assert.deepEqual(host.writes[0].map((op) => op.path[0]), ['endpointUrl']);
  assert.equal(store.getState().endpointUrl, 'http://other.invalid/v1/systemone');
});

await test('开关拨了就写', async () => {
  const { store, host } = makeStore();
  store.toggle('logEnabled', false);
  await store.commit('judge');
  assert.equal(host.writes.length, 1);
  assert.deepEqual(host.writes[0], [{ op: 'set', path: ['logEnabled'], value: false }]);
});

await test('连续两次提交合并成一次写，写的是最新值', async () => {
  const { store, host } = makeStore();
  store.field('endpointUrl', 'http://a.invalid/v1/systemone');
  const first = store.commit('judge');
  store.field('judgeModel', '另一个判断模型');
  const second = store.commit('judge');
  await Promise.all([first, second]);
  assert.equal(host.writes.length, 1, '排队的那一次读到的是最新草稿，不必再写一遍');
  assert.deepEqual(host.writes[0].map((op) => op.path[0]).sort(), ['endpointUrl', 'judgeModel']);
});

await test('没填完的行照常写入，页面只在行上提示', async () => {
  const { store, host } = makeStore();
  store.addRow();
  await store.commit('rows');
  assert.equal(host.writes.length, 1, '空行也写进去：它只是暂时不生效');
  const hints = (index) => rowHints(store.getState().rows, index, (key) => key);
  assert.deepEqual(hints(store.getState().rows.length - 1), [
    'rows.incomplete',
    'rows.hintNoDescription',
  ]);
});

await test('描述为空或与别的行重复时各给一句提示，但不拦写', async () => {
  const { store, host } = makeStore();
  store.cell(0, 'description', '');
  await store.commit('rows');
  assert.equal(host.writes.length, 1, '描述空着也照写');
  const hints = (index) => rowHints(store.getState().rows, index, (key) => key);
  assert.deepEqual(hints(0), ['rows.hintNoDescription']);

  store.cell(0, 'description', '机械修改');
  store.addRow();
  store.cell(1, 'description', '机械修改');
  await store.commit('rows');
  assert.deepEqual(hints(1), ['rows.incomplete', 'rows.hintDuplicateDescription']);
});

await test('宿主回 false 是拒绝，不是成功：页面必须报没写进去', async () => {
  const { store, host } = makeStore({ accept: false });
  store.field('endpointUrl', 'http://refused.invalid/v1/systemone');
  await store.commit('judge');
  const state = store.getState();
  assert.equal(host.writes.length, 1, '写确实发出去了');
  assert.equal(state.writeFailed, 'judge', '宿主没接受就该报失败，并归到发起提交的那一节');
  assert.notEqual(state.writeError, '');
  assert.equal(state.endpointUrl, 'http://refused.invalid/v1/systemone', '没落地就把草稿留着');
});

await test('宿主抛错时把宿主自己的话显示出来', async () => {
  const { store, host } = makeStore();
  host.form.mutate = async () => {
    throw new Error('revision conflict');
  };
  store.field('endpointUrl', 'http://boom.invalid/v1/systemone');
  await store.commit('judge');
  assert.equal(store.getState().writeError, 'revision conflict');
});

await test('密钥在提交时写入，且写的是固定引用名', async () => {
  const { store, keys, host } = makeStore();
  store.key('magpie');
  assert.equal(keys.set.length, 0, '打字期间不写');

  await store.commit('judge');
  assert.deepEqual(keys.set, [[JUDGE_API_KEY_REF, 'magpie']]);
  assert.equal(host.writes.length, 0, '只填密钥不改设置时没有文档写入');
  assert.equal(store.getState().key.text, '', '落地之后输入框清空');
});

await test('密钥写入被拒时，设置一个字节都不写', async () => {
  const { store, keys, host } = makeStore({ keyOptions: { accept: false } });
  store.key('magpie');
  store.field('endpointUrl', 'http://never.invalid/v1/systemone');
  await store.commit('judge');
  assert.equal(keys.set.length, 1);
  assert.equal(host.writes.length, 0, '密钥没写进去就不该再动设置');
  assert.equal(store.getState().key.failed, true, '密钥行自己报这句话');
  assert.equal(store.getState().writeFailed, '', '同一句话不在节尾再说一遍');
  assert.equal(store.getState().key.text, 'magpie', '没存上就把输入留着，别让读者重打');
});

await test('密钥值从不进页面状态，只在写入那一刻交给凭据服务', async () => {
  const { store, keys } = makeStore();
  store.key('  sk-secret-value  ');
  await store.commit('judge');
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
  assert.equal(store.getState().key.configured, false);
});

await test('还没提交的草稿不被宿主的下一次发布冲掉', async () => {
  const { store, host } = makeStore();
  store.field('endpointUrl', 'http://mid-typing.invalid/v1/sys');
  host.push({ judgeModel: '宿主换了模型' });
  assert.equal(store.getState().endpointUrl, 'http://mid-typing.invalid/v1/sys', '正在输入的端点不该被冲掉');
  assert.equal(store.getState().judgeModel, '宿主换了模型', '没在改的那一项跟着宿主走');
});

await test('宿主改了一项而我在改另一项时，提交不会把那一项写回去', async () => {
  const { store, host } = makeStore();
  store.field('endpointUrl', 'http://mid-typing.invalid/v1/sys');
  host.push({ judgeModel: '另一个页面改的模型' });
  await store.commit('judge');
  const paths = host.writes.flat().map((op) => op.path[0]);
  assert.deepEqual(paths, ['endpointUrl'], '只该写读者真正改过的那一项');
  assert.equal(host.writes.flat()[0].value, 'http://mid-typing.invalid/v1/sys');
  assert.equal(store.getState().judgeModel, '另一个页面改的模型', '别处的改动要留在页面上');
});

await test('落地之后，宿主发布的新值会刷新到页面', async () => {
  const { store, host } = makeStore();
  await store.commit('rows');
  host.push({ endpointUrl: 'http://moved.invalid/v1/systemone' });
  assert.equal(store.getState().endpointUrl, 'http://moved.invalid/v1/systemone');
});

await test('导入整份清单后立即写入', async () => {
  const { store, host } = makeStore();
  store.replaceRows([
    { description: '评审代码', provider: 'a6api', model: 'kimi-k3', effort: 'high' },
  ]);
  await store.commit('rows');
  assert.equal(host.writes.length, 1);
  assert.deepEqual(host.writes[0][0].value, [
    { description: '评审代码', provider: 'a6api', model: 'kimi-k3', effort: 'high' },
  ]);
});

await test('加一行与删一行都当场写入', async () => {
  const { store, host } = makeStore();
  store.addRow();
  await store.commit('rows');
  assert.equal(host.writes.length, 1, '加一行立刻写');
  store.removeRow(1);
  await store.commit('rows');
  assert.equal(host.writes.length, 2, '删一行也立刻写');
  assert.equal(store.getState().rows.length, 1);
});

await test('失败按节报，留到下一次写入真的落地才消失', async () => {
  const { store, host } = makeStore({ accept: false });
  store.field('endpointUrl', 'http://refused.invalid/v1/systemone');
  await store.commit('judge');
  assert.equal(store.getState().writeFailed, 'judge', '失败归属发起提交的那一节');

  store.field('endpointUrl', 'http://refused.invalid/v1/systemone2');
  assert.equal(store.getState().writeFailed, 'judge', '打字期间错误不该消失：值还没写进去');

  host.setAccept(true);
  await store.commit('judge');
  assert.equal(store.getState().writeFailed, '', '写入落地之后才清掉');
});

await test('把值改回已提交的那一份，失败提示跟着消失', async () => {
  const { store } = makeStore({ accept: false });
  store.field('endpointUrl', 'http://refused.invalid/v1/systemone');
  await store.commit('judge');
  assert.equal(store.getState().writeFailed, 'judge');

  store.field('endpointUrl', 'http://judge.invalid/v1/systemone');
  await store.commit('judge');
  assert.equal(store.getState().writeFailed, '', '没有东西可写，错误就不再是当前事实');
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

await test('宿主说不可写时，提交什么也不做', async () => {
  const { store, host } = makeStore();
  host.setWritable(false);
  host.push({});
  store.field('endpointUrl', 'http://readonly.invalid/v1/systemone');
  await store.commit('judge');
  assert.equal(host.writes.length, 0);
});

await test('换成不声明这个强度的模型时，强度跟着清掉', async () => {
  const { store } = makeStore();
  await new Promise((tick) => setTimeout(tick, 0));
  store.cell(0, 'effort', 'max');
  store.cell(0, 'provider', 'a6api');
  store.cell(0, 'model', 'kimi-k3');
  assert.equal(store.getState().rows[0].effort, '', 'kimi-k3 没有 max，留着它写出去就会带上跑不了的强度');
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

await test('行提示：不生效、没描述、描述重复，各一句', () => {
  const t = (key) => key;
  const rows = [
    { description: '机械修改', provider: 'p', model: 'm', effort: 'low' },
    { description: '', provider: 'p', model: 'm', effort: 'low' },
    { description: '机械修改', provider: 'p', model: 'm', effort: 'low' },
    { description: '跑测试', provider: '', model: '', effort: '' },
    { description: '评审代码', provider: 'p', model: 'm', effort: 'low' },
  ];
  assert.deepEqual(rowHints(rows, 0, t), ['rows.hintDuplicateDescription'], '两条一模一样的描述都算重');
  assert.deepEqual(rowHints(rows, 1, t), ['rows.hintNoDescription']);
  assert.deepEqual(rowHints(rows, 2, t), ['rows.hintDuplicateDescription']);
  assert.deepEqual(rowHints(rows, 3, t), ['rows.incomplete']);
  assert.deepEqual(rowHints(rows, 4, t), []);
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
  assert.equal(describeModel({ model: 'm', effort: '' }), 'm');
  assert.equal(describeChoice({ provider: 'magpie', model: 'm', effort: '' }), 'magpie · m');
  assert.equal(describeChoice({ provider: '', model: 'm', effort: 'low' }), 'm · low');
  assert.equal(describeChoice({ provider: '  ', model: '  ', effort: '  ' }), '');
  assert.equal(describeModel({ model: '  ', effort: '  ' }), '');
});

await test('带一条没填完的行也能读了再粘回来（导出与导入往返）', () => {
  const rows = [
    { description: '机械修改', provider: 'magpie', model: 'deepseek/deepseek-flash', effort: 'low' },
    { description: '', provider: '', model: '', effort: '' },
  ];
  const text = exportRowsJson(rows);
  assert.deepEqual(JSON.parse(text), [rows[0]], '空白行不写进 JSON');
  assert.deepEqual(parseRowsJson(text), { ok: true, rows: [rows[0]] });

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

await test('命名空间与包名是两个字面量，各自写在各自的地方', () => {
  assert.equal(SETTINGS_NAMESPACE, 'dsh-subagent-judge-dispatch');
  assert.equal(ALLOWED_MODELS_NAMESPACE, 'subagent-model-selection-settings');
});

console.log(`${passed}/${total} passed`);
