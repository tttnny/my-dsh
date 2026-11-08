/**
 * 宿主半边自检：真 cordis Context + 真 ToolRuntime，断言 kimi_cu_status 注册得上、
 * 返回的状态形状对、patch 的五条行各就各位。
 *
 * 跑法：pnpm test / node scripts/smoke-host.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';

import * as plugin from '../lib/index.js';
import { STATUS_ROUTE_PATH } from '../src/shared/status.ts';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const pkgName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;

let passed = 0;
let total = 0;
async function test(label, fn) {
  total += 1;
  try {
    await fn();
    passed += 1;
    console.log('  ok   ' + label);
  } catch (error) {
    console.error('  FAIL ' + label + ': ' + error.message);
    throw error;
  }
}

/** 起一个真内核上下文：工具表 + 它写工具 schema 用的提示词服务。 */
function host() {
  const ctx = new Context();
  new SystemPrompt(ctx, {});
  new ToolRuntime(ctx);
  return ctx;
}

const ctx = host();
plugin.apply(ctx);
const tool = ctx.tools.get('kimi_cu_status');
const signal = new AbortController().signal;

await test('导出的行身份与 patch 里那条根层行同名', () => {
  assert.equal(plugin.name, 'dsh-kimi-cu');
  assert.deepEqual(plugin.inject, ['tools']);
});

await test('工具注册得上，refresh 参数是可选布尔', () => {
  assert.ok(tool !== undefined, '工具没注册上');
  assert.equal(tool.name, 'kimi_cu_status');
  assert.equal(tool.parameters.properties.refresh.type, 'boolean');
  assert.equal(tool.parameters.required, undefined);
});

await test('执行返回 JSON 状态，形状对', async () => {
  const value = await tool.execute({}, { signal });
  assert.equal(typeof value.status, 'string');
  const status = JSON.parse(value.status);
  assert.ok(['darwin', 'win32', 'other'].includes(status.platform));
  assert.equal(typeof status.supported, 'boolean');
  assert.equal(typeof status.installed, 'boolean');
  assert.equal(typeof status.checkedAt, 'number');
  assert.equal(typeof status.doctor, 'object');
  assert.ok(status.install === null || typeof status.install.command === 'string');
  assert.ok(status.mcp === null || Array.isArray(status.mcp.args));
});

await test('render 把 JSON 原样交给模型', async () => {
  const value = await tool.execute({}, { signal });
  assert.deepEqual(tool.output.render({}, value), [{ type: 'text', text: value.status }]);
});

await test('只读工具标记为并发安全', () => {
  assert.equal(tool.isConcurrencySafe({}), true);
});

await test('状态路由路径固定', () => {
  assert.equal(STATUS_ROUTE_PATH, '/api/dsh-kimi-cu/status');
});

await test('patch 有五行，根层行 id 与包名对得上', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, ''))
    .filter((line) => line.trim() !== '')
    .join('\n');
  const rows = [...patch.matchAll(/-\s*id:\s*(\S+)\s*\n\s*name:\s*'([^']+)'/g)].map((match) => [match[1], match[2]]);
  assert.equal(rows.length, 5, 'patch 应当有五条装配行');
  assert.deepEqual(rows[0], ['dsh-kimi-cu', pkgName]);
  assert.deepEqual(rows[1], ['mcp-kimi-cu-macos', '@deepseek-ai/dsh-mcp-client']);
  assert.deepEqual(rows[2], ['mcp-kimi-cu-windows', '@deepseek-ai/dsh-mcp-client']);
  assert.deepEqual(rows[3], ['skill-kimi-cu-macos', '@deepseek-ai/dsh-skill-filesystem']);
  assert.deepEqual(rows[4], ['skill-kimi-cu-windows', '@deepseek-ai/dsh-skill-filesystem']);
});

console.log('\nsmoke-host: ' + passed + '/' + total + ' 条断言通过');
