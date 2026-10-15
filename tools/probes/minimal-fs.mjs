#!/usr/bin/env node
/**
 * minimal-fs preset 的真装载探针：用**真实的内核包**（真 cordis `Context`、真 `ToolRuntime`、
 * 真 `SystemPrompt`、真 `dsh-tool-fs`）验两件它写在 patch 里的事，桩件只替三个 `apply` 读的服务：
 *
 *   1. `dsh-tool-fs` 按自己的开关逐个注册工具，所以 patch 里的 `readImage: false` 让
 *      `read_image` 根本不进注册表（带 `readImage: true` 的对照组）。
 *   2. `./tool-filter` 那一条把 `grilling_form` 从本 preset 作用域组合出的目录里摘掉，
 *      工具本身仍注册着（带摘之前的对照组）。
 *
 * 包从哪来：`--kernel <内核安装树>` 或 `DSH_KERNEL_DIR` 点名的内核、`DSH_PROBE_MODULES` 指的
 * 一棵装好 `@deepseek-ai/*` 的实现（指到某个包的目录即可）、本仓库自己的 `node_modules`、
 * 最后是已装内核（`tools/lib/repo.mjs` 的 `currentKernel`）。找到哪个就用哪个，并在开头打出
 * 路径，所以「跑的是哪一份实现」永远看得见。
 *
 * 用法：
 *   node tools/probes/minimal-fs.mjs                 # 用已装内核的实现
 *   node tools/probes/minimal-fs.mjs --kernel <dir>  # 指定内核安装树
 * 退出码：0 全部通过（含这台机器没条件跑时的跳过），1 有断言失败，2 参数里的内核树不成立。
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { currentKernel, repoRoot } from '../lib/repo.mjs';

const root = repoRoot(resolve(join(import.meta.dirname, '..', '..')));

/** 逐个解析 `--k v` 与 `--flag`。 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const next = argv[i + 1];
    out[key.slice(2)] = next === undefined || next.startsWith('--') ? true : ((i += 1), next);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const kernelArg = typeof args.kernel === 'string' ? resolve(args.kernel) : process.env.DSH_KERNEL_DIR;

/** 内核安装树：`--kernel <树根>` 或已装的最高版本。 */
function kernelTree() {
  if (kernelArg !== undefined) {
    const pkgPath = join(kernelArg, 'node_modules/@deepseek-ai/dsh/package.json');
    try {
      return { version: JSON.parse(readFileSync(pkgPath, 'utf8')).version, dir: kernelArg };
    } catch {
      console.error(`探针：${kernelArg} 不是一份内核安装树（缺 node_modules/@deepseek-ai/dsh/package.json）`);
      process.exit(2);
    }
  }
  try {
    return currentKernel();
  } catch {
    return undefined;
  }
}

/**
 * 没有内核、也没点名 `--kernel` 时，允许用别处已经解析好的实现：`DSH_PROBE_MODULES` 指到
 * **某个包的目录**，解析器就从那里往上找 `node_modules`（就像 `NODE_PATH` 那类用法）。
 * 都没有就跳过。
 * @returns {string|undefined} 解析起点（`createRequire` 的 from 路径）。
 */
function externalStart() {
  const dir = process.env.DSH_PROBE_MODULES;
  if (dir === undefined || dir === '') return undefined;
  // 那棵树里没有 @deepseek-ai 就等于没指：当它不存在，走跳过那条路。
  const resolved = resolve(dir);
  if (!existsSync(join(resolved, 'node_modules/@deepseek-ai'))) return undefined;
  return join(resolved, 'dsh-probe.js');
}

/**
 * 内核包仓里每个带 package.json 的包：包名 → 真实目录。纯 Node 遍历，探针不依赖第三方 glob。
 * @param {string} store - 内核的 `node_modules/.pnpm`。
 * @returns {Map<string, string>} 包名到真实目录。
 */
function storePackages(store) {
  const found = new Map();
  const walk = (dir, depth) => {
    if (depth > 4) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      const pkgPath = join(path, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (typeof pkg.name === 'string' && !found.has(pkg.name)) found.set(pkg.name, path);
      } catch {
        // 没有描述文件就继续往下走。
      }
      walk(path, depth + 1);
    }
  };
  walk(store, 0);
  return found;
}

/**
 * 解析一个包的入口文件：先按常规解析（临时树、仓库自己的 node_modules），再回落到内核包仓。
 * @param {string} name - 包名。
 * @param {Map<string,string>} store - 内核包仓的包目录。
 * @param {string[]} starts - 常规解析起点。
 * @returns {string} 入口文件绝对路径。
 */
function locate(name, store, starts) {
  const candidates = [...starts, join(root, 'presets/minimal-fs/package.json')];
  for (const start of candidates) {
    try {
      const pkgPath = createRequire(start).resolve(`${name}/package.json`);
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const entry = typeof pkg.exports === 'object' && pkg.exports !== null ? pkg.exports['.'] : undefined;
      const rel = typeof entry === 'string' ? entry : entry?.import ?? entry?.default ?? entry?.require;
      if (typeof rel === 'string') return resolve(dirname(pkgPath), rel);
      return createRequire(pkgPath).resolve(name);
    } catch {
      // 换下一个起点。
    }
  }
  const dir = store.get(name);
  if (dir !== undefined) {
    const pkgPath = join(dir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const entry = typeof pkg.exports === 'object' && pkg.exports !== null ? pkg.exports['.'] : undefined;
    const rel = typeof entry === 'string' ? entry : entry?.import ?? entry?.default ?? entry?.require;
    if (typeof rel === 'string') return resolve(dir, rel);
    const main = pkg.main ?? 'index.js';
    return resolve(dir, main);
  }
  console.error(`探针：解析不到 ${name}——这台机器上既没有已装内核，也没有可用的实现`);
  process.exit(2);
}

/**
 * 内核的实现只在这台机器装了 DSH 时才有：没有内核、也没点名 `--kernel` 或 `DSH_PROBE_MODULES`，
 * 就安静跳过并回 0，别把「没条件跑」报成「不通过」（CI 属于这种机器）。
 */
const kernel = kernelTree();
const external = kernel === undefined ? externalStart() : undefined;
if (kernel === undefined && external === undefined && args.kernel !== true) {
  console.log('minimal-fs probe: 这台机器没有已装内核（CI 就属于这种），真装载探针跳过');
  process.exit(0);
}
const store = kernel === undefined ? new Map() : storePackages(join(kernel.dir, 'node_modules/.pnpm'));
// 真实现的解析起点：内核对调用 --kernel 点名的那棵树，再是 DSH_PROBE_MODULES 指的目录，最后是本仓库。
const starts = [
  ...(kernel === undefined ? [] : [join(kernel.dir, 'node_modules/@deepseek-ai/dsh/package.json')]),
  ...(external === undefined ? [] : [external]),
];
const toolFilterPath = join(root, 'presets/minimal-fs/plugins/tool-filter/index.js');
const startsFor = (name) => [...starts, join(dirname(toolFilterPath), 'package.json')];
const located = new Map();
const entryOf = (name) => {
  if (!located.has(name)) located.set(name, locate(name, store, startsFor(name)));
  return located.get(name);
};

const paths = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-tool-fs'].map(entryOf);
const [{ Context }, SystemPrompt, ToolRuntime, toolFs] = await Promise.all([
  import(pathToFileURL(paths[0]).href),
  import(pathToFileURL(paths[1]).href).then((module) => module.default ?? module),
  import(pathToFileURL(paths[2]).href).then((module) => module.default ?? module),
  import(pathToFileURL(paths[3]).href),
]);
const { apply: applyToolFs, inject: toolFsInject, Config: ToolFsConfig } = toolFs;

const { apply: applyToolFilter } = await import(pathToFileURL(toolFilterPath).href);

const source = kernel === undefined ? '仓库自己装的那份实现' : `已装内核 ${kernel.version}`;
console.log(`minimal-fs probe: 跑在 ${source} 上（${paths[0]}）`);
if (kernel === undefined) console.log('  提示：这台机器没有已装内核，探针用的是仓库目录里的实现');

let passed = 0;
let total = 0;
async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ok   ${name}`);
    passed++;
  } catch (error) {
    console.error(`  FAIL ${name}: ${error.message}`);
    throw error;
  }
}

/** Every service `dsh-tool-fs` injects, in the shape its `apply` actually reads. */
const ATTACHMENTS = {
  imageLimits: {
    mediaTypes: ['image/png'],
    maxImageBytes: 1024,
    maxMessageImageBytes: 1024,
    maxImageDimension: 4096,
    maxImagePixels: 4096 * 4096,
  },
  saveImage: async () => ({ id: 'probe' }),
};

/**
 * Assemble a real host tree with the services `dsh-tool-fs` injects.
 * @returns {Context} a context whose tool registry is live.
 */
function host() {
  const ctx = new Context();
  new SystemPrompt(ctx, {});
  new ToolRuntime(ctx);
  ctx.provide('fs', {});
  ctx.provide('workingDirectory', { path: process.cwd() });
  ctx.provide('attachments', ATTACHMENTS);
  return ctx;
}

/** The exact `config` block of the preset's `tool-fs` row. */
const PRESET_CONFIG = { read: true, readImage: false, write: true, edit: true };

console.log('--- the preset config goes through the real schema');

await test('the four switch keys are the real ones: the schema resolves and fills the rest', () => {
  const resolved = ToolFsConfig(PRESET_CONFIG);
  assert.equal(resolved.read, true);
  assert.equal(resolved.readImage, false);
  assert.equal(resolved.write, true);
  assert.equal(resolved.edit, true);
  assert.ok(Number.isInteger(resolved.readLimit), 'the schema supplies its own defaults for the caps');
});

await test('control: readImage defaults to true, so the false above is the row speaking and not the schema', () => {
  assert.equal(ToolFsConfig({}).readImage, true, 'a row that says nothing keeps read_image on');
  assert.equal(ToolFsConfig({ readImage: false }).readImage, false);
});

console.log('--- what the preset actually registers');

await test('the preset row registers read / write / edit and never read_image', async () => {
  const ctx = host();
  await ctx.plugin({ apply: applyToolFs, inject: toolFsInject }, ToolFsConfig(PRESET_CONFIG));
  for (const present of ['read', 'write', 'edit']) {
    assert.notEqual(ctx.tools.get(present), undefined, `${present} must be registered`);
  }
  assert.equal(
    ctx.tools.get('read_image'),
    undefined,
    'readImage: false must keep read_image out of the registry even with attachments mounted',
  );
});

await test('control: the same tree with readImage: true does register read_image', async () => {
  const ctx = host();
  await ctx.plugin({ apply: applyToolFs, inject: toolFsInject }, ToolFsConfig({ ...PRESET_CONFIG, readImage: true }));
  assert.notEqual(
    ctx.tools.get('read_image'),
    undefined,
    'without this control the negative above would also hold for a context that cannot register it at all',
  );
});

await test('control: the switched-off tools really are off — read: false / write: false / edit: false', async () => {
  const ctx = host();
  await ctx.plugin({ apply: applyToolFs, inject: toolFsInject }, ToolFsConfig({ read: false, readImage: true, write: false, edit: false }));
  assert.equal(ctx.tools.get('read'), undefined);
  assert.equal(ctx.tools.get('write'), undefined);
  assert.equal(ctx.tools.get('edit'), undefined);
  assert.notEqual(ctx.tools.get('read_image'), undefined);
});

console.log('--- what the tool-filter row withdraws');

await test('the filter drops grilling_form from the assembled catalog and keeps the three file tools', async () => {
  const ctx = host();
  await ctx.plugin({ apply: applyToolFs, inject: toolFsInject }, ToolFsConfig(PRESET_CONFIG));
  ctx.tools.register({
    name: 'grilling_form',
    description: 'a globally registered tool this preset inherits',
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object', properties: {} }, render: () => null },
    execute: async () => ({}),
  });
  const before = (await ctx.systemPrompt.assemble({})).tools.map((tool) => tool.name);
  assert.ok(before.includes('grilling_form'), 'the control: it is in the catalog before the filter lands');

  await ctx.plugin(applyToolFilter, {});
  const after = (await ctx.systemPrompt.assemble({})).tools.map((tool) => tool.name);
  assert.deepEqual(after.slice().sort(), ['edit', 'read', 'write']);
  assert.equal(after.includes('grilling_form'), false);
  assert.equal(ctx.tools.get('grilling_form') !== undefined, true, 'the tool itself stays registered');
});

console.log(`\nminimal-fs probe: ${passed}/${total} ok`);
