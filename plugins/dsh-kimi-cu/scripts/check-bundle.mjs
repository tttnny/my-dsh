#!/usr/bin/env node
/**
 * 包内自检：这个 bundle 装上之后，patch 里那两行真的各就各位。
 *
 * 三层断言，越往下越贴近真实装载：
 *   1. 清单面：`files` 点名的都在、bundle patch 指得到、`exports` 的每个子路径都在、两个语言的标题与
 *      说明齐备、随包技能的 frontmatter 合规。
 *   2. 文本面：patch 只插两行、id 与内核包名对、两行都带 macOS 守卫、MCP 那行指向 KimiCU 的 app 内二进制、
 *      技能那行另取 providerName 且只扫本包 `skills/`。这一层不需要内核，CI 上照跑。
 *   3. 契约面（本机装了内核才有）：拿内核自带 include 的 `entryListSchema`——就是装载时用的那份
 *      YAML 方言——读这份 patch，再把两行 config 交给内核包的 **真 Config schema** 校验，最后照 Loader
 *      的求值方式跑一遍 `customSkillDirs` 里那条表达式，确认它落回本包的 `skills/`。
 *
 * 两种断言的边界：文本面只认「含义」，不认写法——同一份配置改成块状 `args` 不该让它变红；字段的
 * 类型与必填由契约面的真 schema 负责，那里才是唯一说得准的地方。
 *
 * 随包技能能不能被真发现与真装载不在这里：那是 `tools/probes/preset-skills.mjs` 的事，`check` 里紧接
 * 着跑它。
 *
 * 跑法：pnpm check / node scripts/check-bundle.mjs
 * 退出码：0 通过（含明说跳过），1 不通过。
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { currentKernel } from '../../../tools/lib/repo.mjs';

const PACKAGE_NAME = '@lynn123411/dsh-kimi-cu';
const KIMI_CU_BINARY = '/Applications/KimiCU.app/Contents/MacOS/kimi-cu';
const MACOS_GUARD = "process.platform !== 'darwin'";
const ROW_IDS = ['mcp-kimi-cu', 'skill-kimi-cu'];

const packageDir = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));

let passed = 0;
let total = 0;
const skipped = [];

/**
 * 跑一条断言；同步与异步的断言共用一条路径（`await` 一个同步返回值是空操作）。
 * @param {string} label - 这条断言在说什么。
 * @param {() => void|Promise<void>} fn - 断言本体，靠 `node:assert` 抛错。
 * @returns {Promise<void>}
 */
async function test(label, fn) {
  total += 1;
  try {
    await fn();
  } catch (error) {
    console.error(`  FAIL ${label}`);
    throw error;
  }
  passed += 1;
  console.log(`  ok   ${label}`);
}

/**
 * 明说跳过一条要内核才能跑的断言——「没跑」不能被读成「通过」。
 * @param {string} label - 跳过的是哪条。
 * @param {string} why - 为什么跑不了。
 * @returns {void}
 */
function skip(label, why) {
  skipped.push({ label, why });
  console.log(`  skip ${label}（${why}）`);
}

// ── 1. 清单面 ─────────────────────────────────────────────────────────────────
await test('bundle patch 指得到，files 点名的条目都在', () => {
  const declared = manifest.dsh?.bundle?.patch;
  assert.equal(typeof declared, 'string', 'package.json 缺 dsh.bundle.patch');
  assert.ok(existsSync(join(packageDir, declared)), `dsh.bundle.patch 指的 ${declared} 不存在`);
  for (const pattern of manifest.files) {
    const probe = pattern.replace(/\/\*\*.*$/, '').replace(/\/\*[^]*$/, '').replace(/\/$/, '');
    assert.ok(existsSync(join(packageDir, probe)), `files 里的 ${pattern} 在目录里不存在`);
  }
});

const patchText = readFileSync(join(packageDir, manifest.dsh.bundle.patch), 'utf8');

await test('exports 的每个子路径都解析得到，图标在那个位置', () => {
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    assert.ok(existsSync(join(packageDir, target)), `exports 的 ${subpath} 指向 ${target}，文件不存在`);
  }
  assert.equal(manifest.icon, './assets/icon.svg');
  assert.ok(existsSync(join(packageDir, 'assets/icon.svg')), 'package.json 的 icon 指的图标不存在');
});

await test('两个语言都给了标题与说明——插件页的卡片靠它们', () => {
  for (const lang of ['en', 'zh']) {
    const locale = JSON.parse(readFileSync(join(packageDir, 'locale', `${lang}.json`), 'utf8'));
    assert.ok(locale.meta?.title, `locale/${lang}.json 缺 meta.title，卡片会退回包名`);
    assert.ok(locale.meta?.description, `locale/${lang}.json 缺 meta.description，卡片会退回 package.json 的描述`);
  }
});

await test('随包技能是目录形态，frontmatter 的 name 与目录名一致且带描述', () => {
  const skillFile = join(packageDir, 'skills/kimi-cu/SKILL.md');
  assert.ok(existsSync(skillFile), 'skills/kimi-cu/SKILL.md 不存在');
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(skillFile, 'utf8'));
  assert.ok(block, 'SKILL.md 必须以 YAML frontmatter 开头，否则技能发现会静默丢掉它');
  assert.equal(/^name:\s*(.+)$/m.exec(block[1])?.[1].trim(), 'kimi-cu', 'frontmatter 的 name 要与目录名一致，它就是模型看到的技能名');
  assert.ok(/^description:\s*\S/m.test(block[1]), 'frontmatter 缺 description，技能发现同样会丢掉它');
});

// ── 2. 文本面 ─────────────────────────────────────────────────────────────────
await test('patch 只插两行，id 就是约定的那两个', () => {
  const ids = [...patchText.matchAll(/^\s*-\s*id:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  assert.deepEqual([...ids].sort(), [...ROW_IDS].sort(), 'patch 里该有的行只有这两条，多一条就说明装配形状变了');
  assert.match(patchText, /name: '@deepseek-ai\/dsh-mcp-client'/, 'MCP 那行要挂内核的 mcp-client');
  assert.match(patchText, /name: '@deepseek-ai\/dsh-skill-filesystem'/, '技能那行要挂内核的 skill-filesystem');
});

await test('两行都带 macOS 守卫：别的平台上不启动，也不拖累宿主启动', () => {
  const guards = [...patchText.matchAll(/^\s*disabled:\s*(.+)$/gm)].map((match) => match[1].trim());
  assert.equal(guards.length, 2, '两行都要有 disabled 守卫');
  for (const guard of guards) {
    assert.equal(guard, `!!js ${MACOS_GUARD}`, `守卫要写成 !!js ${MACOS_GUARD}，现为 ${guard}`);
  }
});

/** 取某一行在 patch 文本里的那一段（到下一行 id 或文件末尾）。 */
function rowBlock(id) {
  const start = patchText.indexOf(`id: ${id}`);
  assert.ok(start !== -1, `patch 里找不到 ${id} 行`);
  const nextId = ROW_IDS.map((other) => patchText.indexOf(`id: ${other}`, start + 1)).filter((at) => at > start);
  return patchText.slice(start, nextId.length === 0 ? undefined : Math.min(...nextId));
}

await test('MCP 那行指向 KimiCU 的 app 内二进制，缺装时当场报错', () => {
  const block = rowBlock('mcp-kimi-cu');
  assert.match(block, /serverName: kimi-cu/, 'serverName 决定模型看到的 mcp__kimi-cu__* 前缀');
  assert.match(block, /transport: stdio/);
  assert.match(block, new RegExp(`command: ${KIMI_CU_BINARY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), 'KimiCU 的命令行在 app 包里，不是 PATH 上的命令');
  assert.match(block, /failOnStartupError: true/, '缺装 KimiCU 时要当场报错，而不是静默少掉一排工具');
});

await test('MCP 那行给 KimiCU 的长任务留足超时', () => {
  const block = rowBlock('mcp-kimi-cu');
  const value = Number(/toolCallTimeoutMs:\s*(\d+)/.exec(block)?.[1]);
  assert.ok(value >= 120_000, `工具调用上限要覆盖 KimiCU 的 js 长任务，不能停在默认的 60 秒，现为 ${value}`);
});

await test('技能那行另取 providerName、关掉默认目录，只扫本包 skills/', () => {
  const block = rowBlock('skill-kimi-cu');
  assert.match(block, /providerName: kimi-cu/, '不另取名就会与内核那条默认技能行同名');
  assert.match(block, /includeDefaultRoots: false/, '项目与用户技能目录由内核那条行负责，这条不重复扫');
  assert.match(block, /customSkillDirs:/);
  assert.match(block, new RegExp(`createRequire\\(baseUrl\\)\\.resolve\\('${PACKAGE_NAME}/package\\.json'\\)`), '技能目录要按包名解析：bundle patch 的 !!js 以 profile 目录为 baseUrl，相对路径会落到 profile 自己身上');
});

// ── 3. 契约面（要本机已装内核） ────────────────────────────────────────────────
/**
 * 在内核安装树的包仓里找某个包的真实目录。
 * @param {{dir: string}} kernel - 内核安装树。
 * @param {string} name - 包名，例如 `@deepseek-ai/dsh-mcp-client`。
 * @returns {string|undefined} 包目录；没装就是 undefined。
 */
function kernelPackageDir(kernel, name) {
  const store = join(kernel.dir, 'node_modules/.pnpm');
  if (!existsSync(store)) return undefined;
  for (const entry of readdirSync(store)) {
    if (!entry.startsWith(`${name.replace('/', '+')}@`)) continue;
    const candidate = join(store, entry, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  return undefined;
}

/**
 * 照 Loader 的方式求值一条 `!!js` 表达式：作用域里有 `baseUrl` 与 `process`。
 * @param {string} expression - 表达式原文。
 * @param {string} baseUrl - 装载该行的目录（file URL）。
 * @returns {unknown} 求值结果。
 */
function evaluateExpression(expression, baseUrl) {
  const evaluate = new Function('scope', 'expression', 'with (scope) { return eval(expression) }');
  return evaluate({ baseUrl, process }, expression);
}

const contractLabels = [
  'patch 能被内核装载时用的那份 YAML 方言读懂',
  'MCP 那行的 config 通过内核 mcp-client 的真 Config schema',
  '技能那行的 config 通过内核 skill-filesystem 的真 Config schema，表达式落回本包 skills/',
];

/** 本机内核，取不到就 undefined。 */
function localKernel() {
  try {
    return currentKernel();
  } catch (error) {
    for (const label of contractLabels) skip(label, `本机没有可读的内核：${error.message}`);
    return undefined;
  }
}

/** 内核里这三样齐了才能验契约面；缺哪样就说哪样。 */
function contractDirs(kernel) {
  const dirs = {
    include: kernelPackageDir(kernel, '@deepseek-ai/cordis-plugin-include'),
    client: kernelPackageDir(kernel, '@deepseek-ai/dsh-mcp-client'),
    skills: kernelPackageDir(kernel, '@deepseek-ai/dsh-skill-filesystem'),
  };
  const missing = Object.entries(dirs).filter(([, dir]) => dir === undefined).map(([name]) => name);
  if (missing.length > 0) {
    for (const label of contractLabels) skip(label, `内核 ${kernel.version} 的包仓里找不到 ${missing.join('、')}`);
    return undefined;
  }
  return dirs;
}

/**
 * 用内核装载时那份 YAML 方言读 patch，并按 id 摊平成一张表。
 *
 * `entryListSchema` 由 include 导出（ESM），而 `load` 必须用 include 自己那份 js-yaml：
 * 两个 schema 实例不能混用，混了就是「unknown tag !!js」。
 * @param {string} includeDir - 内核 `cordis-plugin-include` 的目录。
 * @returns {Promise<Map<string, any>>} id → 行。
 */
async function parseRows(includeDir) {
  const { entryListSchema } = await import(pathToFileURL(join(includeDir, 'lib/index.js')).href);
  const jsYaml = createRequire(join(includeDir, 'package.json'))('js-yaml');
  const entries = jsYaml.load(patchText, { schema: entryListSchema });
  const rows = new Map();
  for (const patch of entries) for (const row of patch.insert ?? []) rows.set(row.id, row);
  return rows;
}

const kernel = localKernel();
const dirs = kernel === undefined ? undefined : contractDirs(kernel);

if (kernel !== undefined && dirs !== undefined) {
  const rows = await parseRows(dirs.include);

  await test(`patch 能被内核 ${kernel.version} 装载时用的 YAML 方言读懂，两行都在`, () => {
    assert.deepEqual([...rows.keys()].sort(), [...ROW_IDS].sort(), '解析出来该只有这两行');
    for (const id of ROW_IDS) {
      assert.deepEqual(rows.get(id).disabled, { __jsExpr: MACOS_GUARD }, `${id} 的守卫要原样交给 Loader 求值`);
    }
  });

  await test('MCP 那行的 config 通过内核 mcp-client 的真 Config schema', async () => {
    const { Config } = await import(pathToFileURL(join(dirs.client, 'lib/index.js')).href);
    const resolved = Config(rows.get('mcp-kimi-cu').config);
    assert.equal(resolved.transport, 'stdio');
    assert.equal(resolved.serverName, 'kimi-cu');
    assert.equal(resolved.command, KIMI_CU_BINARY);
    assert.deepEqual(resolved.args, ['mcp', '-s', 'user']);
    assert.equal(resolved.failOnStartupError, true);
    assert.ok(resolved.toolCallTimeoutMs >= 120_000, '真 schema 解析出来的工具调用上限要覆盖长任务');
  });

  await test('技能那行的 config 通过内核 skill-filesystem 的真 Config schema，表达式落回本包 skills/', async () => {
    const { Config } = await import(pathToFileURL(join(dirs.skills, 'lib/index.js')).href);
    const row = rows.get('skill-kimi-cu');
    const expression = row.config.customSkillDirs?.[0]?.__jsExpr;
    assert.equal(typeof expression, 'string', 'customSkillDirs 要由 !!js 算成绝对路径');

    // 包内自引用足够判定：Node 会按 exports 把包名解析回本目录，不依赖本机装没装开发副本。
    const fromPackage = evaluateExpression(expression, pathToFileURL(join(packageDir, 'index.js')).href);
    assert.equal(resolve(fromPackage), resolve(join(packageDir, 'skills')), '表达式求值结果要是本包的 skills/ 目录');

    const resolved = Config({ ...row.config, customSkillDirs: [fromPackage] });
    assert.equal(resolved.providerName, 'kimi-cu');
    assert.equal(resolved.includeDefaultRoots, false);
    assert.deepEqual(resolved.customSkillDirs.map((dir) => resolve(dir)), [resolve(join(packageDir, 'skills'))]);
  });
}

console.log(`\ncheck-bundle: ${passed}/${total} 条断言通过${skipped.length === 0 ? '' : `，${skipped.length} 条跳过`}`);
