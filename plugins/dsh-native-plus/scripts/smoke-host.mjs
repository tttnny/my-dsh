/**
 * 宿主半边自检：真 cordis `Context` + 真 settings 服务的登记面，断言这个插件只做一件事——
 * 声明自己的配置形状，并登记「不要在设置页上自动生成一份同字段表单」。
 *
 * 配置形状由浏览器半边的字段表生成，所以这里同时钉住「两边不会各写一份」：
 * 字段集必须与 `src/client/schema.ts` 的 `FIELDS` 一一对上。
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
const { FIELDS, defaultConfig } = await import('../src/client/schema.ts');

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
  assert.equal(plugin.name, 'dsh-native-plus');
  assert.equal(pkgName, '@lynn123411/dsh-native-plus');
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

await test('Config 的键集与字段表一一对上', () => {
  const resolved = new plugin.Config({});
  assert.deepEqual(Object.keys(resolved).sort(), FIELDS.map((field) => field.key).sort());
});

await test('Config 的默认值与浏览器半边那份出厂配置逐字段一致', () => {
  const resolved = new plugin.Config({});
  const defaults = defaultConfig();
  for (const [key, value] of Object.entries(defaults)) {
    assert.equal(valueOf(resolved, key), value, `${key} 的两份默认值不一致`);
  }
});

await test('每个字段都是 volatile：改值不重挂整条 loader 行', () => {
  const resolved = new plugin.Config({});
  assert.equal(Object.getOwnPropertySymbols(resolved.lineHeight).length, 1, 'volatile 字段应当带写入符号');
  assert.equal(Object.getOwnPropertySymbols(resolved.paragraphGap).length, 1, '每个字段都应当带写入符号');
});

await test('Config 直接拒绝越界值：行高 1.4…2、间距 4…24', () => {
  assert.throws(() => new plugin.Config({ lineHeight: 0.5 }), /lineHeight/);
  assert.throws(() => new plugin.Config({ paragraphGap: 999 }), /paragraphGap/);
  const edges = new plugin.Config({ lineHeight: 1.4, paragraphGap: 24 });
  assert.equal(valueOf(edges, 'lineHeight'), 1.4);
  assert.equal(valueOf(edges, 'paragraphGap'), 24);
});

await test('apply 登记「不要自动生成设置页」，并带上自己的 fiber', () => {
  const { ctx, calls } = host();
  plugin.apply(ctx);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].presentation, { auto: false });
  assert.notEqual(calls[0].owner, undefined);
});

await test('没有 settings 服务时 apply 当场失败（守卫仍有牙齿）', () => {
  assert.throws(() => plugin.apply(new Context()), /settings|undefined/i);
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
