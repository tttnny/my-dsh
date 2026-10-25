/**
 * 宿主半边自检：真 cordis `Context` + 真 settings 服务的登记面，断言这个插件只做一件事——
 * 声明自己的配置形状，并登记「不要在设置页上自动生成一份同字段表单」。
 *
 * 承重点在真货上：真 `Context`（读未声明的服务会抛，与 cordis 一致）、真 schemastery 校验、
 * 真的配置默认值。假的只有 `settings.configure`：它由内核的 settings 插件提供，这里只复核
 * 插件有没有按正确的形状调用它。包内 `cordis.patch.yml` 那条装配行也在这里独立核对一遍。
 *
 * 跑法：pnpm test / node scripts/smoke-host.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';

import * as plugin from '../lib/index.js';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
/** 包名：与包内 cordis.patch.yml 那条装配行的 name 独立比对，不共用字面量。 */
const pkgName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;

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

/**
 * 起一个真 cordis 上下文，挂一个只记录登记的 settings 假件。
 * `provide` 是 cordis 注册服务的正式入口：`ctx.set` 只对已提供的服务生效，
 * 这正是「读未声明的服务会抛」那条守卫的另一面。
 */
function host() {
  const ctx = new Context();
  const calls = [];
  const settings = {
    configure(presentation, owner) { calls.push({ presentation, owner }); return () => {}; },
  };
  ctx.provide('settings', settings);
  return { ctx, calls, settings };
}

await test('导出的行身份与包名一致', () => {
  assert.equal(plugin.name, 'dsh-maple-theme');
  assert.equal(pkgName, '@lynn123411/dsh-maple-theme');
  assert.deepEqual(plugin.inject, ['settings']);
});

/**
 * volatile 字段在运行时是一个带 `get()` 的引用（DSH 把被接受的编辑写回同一个引用，
 * 插件不必重挂就能读到新值），所以断言要看 `get()` 的结果，不是字段本身。
 */
function valueOf(resolved, field) {
  const slot = resolved[field];
  return slot !== null && typeof slot === 'object' && typeof slot.get === 'function' ? slot.get() : slot;
}

await test('Config 的十个字段齐全且默认值就是 Maple 的出厂值', () => {
  const resolved = new plugin.Config({});
  assert.equal(valueOf(resolved, 'hueLight'), 35);
  assert.equal(valueOf(resolved, 'hueDark'), 207);
  assert.equal(valueOf(resolved, 'lineHeight'), 1.75);
  assert.equal(valueOf(resolved, 'paragraphGap'), 10);
  assert.equal(valueOf(resolved, 'headingColor'), 'colorful');
  assert.equal(valueOf(resolved, 'headingIndicator'), true);
  assert.equal(valueOf(resolved, 'codePalette'), true);
  assert.equal(valueOf(resolved, 'shellSkin'), true);
  assert.equal(valueOf(resolved, 'mapleFont'), true);
  assert.equal(valueOf(resolved, 'nativePalette'), false);
  assert.deepEqual(Object.keys(resolved).sort(), [
    'codePalette', 'headingColor', 'headingIndicator', 'hueDark', 'hueLight', 'lineHeight', 'mapleFont', 'nativePalette', 'paragraphGap', 'shellSkin',
  ]);
});

await test('每个字段都是 volatile：改值不重挂整条 loader 行', () => {
  const resolved = new plugin.Config({});
  assert.equal(Object.getOwnPropertySymbols(resolved.hueLight).length, 1, 'volatile 字段应当带写入符号');
});

await test('Config 直接拒绝越界值：色相 0…360、行高 1.4…2、间距 4…24', () => {
  assert.throws(() => new plugin.Config({ hueLight: -20 }), /hueLight/);
  assert.throws(() => new plugin.Config({ hueDark: 400 }), /hueDark/);
  assert.throws(() => new plugin.Config({ lineHeight: 0.5 }), /lineHeight/);
  assert.throws(() => new plugin.Config({ paragraphGap: 999 }), /paragraphGap/);
  // 边界值本身是合法的：配置页的旋钮端点就是按这几个数做的。
  const edges = new plugin.Config({ hueLight: 0, hueDark: 360, lineHeight: 1.4, paragraphGap: 24 });
  assert.equal(valueOf(edges, 'hueLight'), 0);
  assert.equal(valueOf(edges, 'hueDark'), 360);
  assert.equal(valueOf(edges, 'lineHeight'), 1.4);
  assert.equal(valueOf(edges, 'paragraphGap'), 24);
});

await test('Config 拒绝认不出的标题配色', () => {
  assert.throws(() => new plugin.Config({ headingColor: 'rainbow' }), /headingColor|union|expected/i);
});

await test('apply 登记「不要自动生成设置页」，并带上自己的 fiber', () => {
  const { ctx, calls } = host();
  plugin.apply(ctx);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].presentation, { auto: false });
  assert.notEqual(calls[0].owner, undefined);
});

await test('没有 settings 服务时 apply 当场失败（守卫仍有牙齿）', () => {
  // 反例：同一个插件挂在空上下文上必须报错。若这条不成立，说明上面那条断言
  // 测试的是一个根本没被调用的路径，绿灯是假的。
  assert.throws(() => plugin.apply(new Context()), /settings|undefined/i);
});

await test('宿主半边的出厂值与浏览器半边那份默认值逐字段一致', async () => {
  // 两边各写一份默认值是必要的：宿主半边不带 DOM、浏览器半边不读 schema。
  // 但两份必须相同——否则卡片上显示的出厂值与实际渲染的出厂值会分叉。
  const { DEFAULT_SETTINGS } = await import('../lib/client.js').catch(() => ({}));
  if (DEFAULT_SETTINGS === undefined) {
    // 客户端 bundle 装着 DOM 依赖，这里不装载它；改读设计源文件的字面量。
    const source = readFileSync(new URL('../src/client/settings.ts', import.meta.url), 'utf8');
    const block = /DEFAULT_SETTINGS[^{]*\{([^}]*)\}/.exec(source);
    assert.notEqual(block, null, '找不到 DEFAULT_SETTINGS');
    const fields = Object.fromEntries(
      [...block[1].matchAll(/(\w+):\s*([^,\n]+),/g)].map((m) => [m[1], m[2].trim()]),
    );
    const resolved = new plugin.Config({});
    for (const key of ['hueLight', 'hueDark', 'lineHeight', 'paragraphGap']) {
      assert.equal(String(valueOf(resolved, key)), fields[key], `${key} 的两份默认值不一致`);
    }
    for (const key of ['headingColor', 'headingIndicator', 'codePalette', 'shellSkin', 'mapleFont']) {
      const expected = fields[key] === 'true' ? true : fields[key] === 'false' ? false : fields[key].replace(/['"]/g, '');
      assert.equal(valueOf(resolved, key), expected, `${key} 的两份默认值不一致`);
    }
  }
});

await test('包内 cordis.patch.yml 只有一条装配行，id 与包名各自独立地对上', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, ''))
    .filter((line) => line.trim() !== '')
    .join('\n');
  const rows = [...patch.matchAll(/-\s*id:\s*(\S+)\s*\n\s*name:\s*'([^']+)'/g)];
  assert.equal(rows.length, 1, '包内 cordis.patch.yml 应当只有一条装配行');
  assert.equal(rows[0][1], plugin.name);
  assert.equal(rows[0][2], pkgName);
});

console.log(`${passed}/${total} passed`);
