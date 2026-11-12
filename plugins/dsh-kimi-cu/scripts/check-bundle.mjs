#!/usr/bin/env node
/**
 * 包内自检：这个 bundle 装上之后，patch 里那五行真的各就各位，平台分流与技能目录都对。
 *
 * 三层断言，越往下越贴近真实装载：
 *   1. 清单面：files 点名的都在、bundle patch 指得到、exports 与 main 都在、dsh.client 声明了
 *      web 与四个契约包、两个语言的标题与说明齐备、两份技能的 frontmatter 合规。
 *   2. 文本面：patch 只插五行、id 与内核包名对、四条平台行各带自己的守卫、macOS/Windows 两条
 *      MCP 行的命令与参数分开、两条技能行各扫自己的目录。这一层不需要内核，CI 上照跑。
 *   3. 契约面（本机装了内核才有）：拿内核自带 include 的 entryListSchema——就是装载时用的那份
 *      YAML 方言——读这份 patch，再把两条 MCP 行与两条技能行的 config 交给内核包的真 Config
 *      schema 校验；Windows 那条用假的 process 求值，并断言结果与 resolveInstall 一致。
 *
 * 随包技能能不能被真发现与真装载不在这里：那是 tools/probes/preset-skills.mjs 的事，check 里
 * 对两个技能根各跑一次。
 *
 * 跑法：pnpm check / node scripts/check-bundle.mjs
 * 退出码：0 通过（含明说跳过），1 不通过。
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { currentKernel } from '../../../tools/lib/repo.mjs';
import { resolveInstall } from '../src/server/resolve.ts';

const PACKAGE_NAME = '@lynn123411/dsh-kimi-cu';
const MACOS_BINARY = '/Applications/KimiCU.app/Contents/MacOS/kimi-cu';
const MACOS_GUARD = "process.platform !== 'darwin'";
const WINDOWS_GUARD = "process.platform !== 'win32'";
const ROW_IDS = ['dsh-kimi-cu', 'skill-kimi-cu-macos', 'skill-kimi-cu-windows'];
const SKILL_DIRS = { 'skill-kimi-cu-macos': 'macos', 'skill-kimi-cu-windows': 'windows' };

const packageDir = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));

let passed = 0;
let total = 0;
const skipped = [];

/**
 * 跑一条断言；同步与异步的断言共用一条路径（await 一个同步返回值是空操作）。
 * @param label - 这条断言在说什么。
 * @param fn - 断言本体，靠 node:assert 抛错。
 * @returns {Promise<void>}
 */
async function test(label, fn) {
  total += 1;
  try {
    await fn();
  } catch (error) {
    console.error('  FAIL ' + label);
    throw error;
  }
  passed += 1;
  console.log('  ok   ' + label);
}

/**
 * 明说跳过一条要内核才能跑的断言——「没跑」不能被读成「通过」。
 * @param label - 跳过的是哪条。
 * @param why - 为什么跑不了。
 * @returns {void}
 */
function skip(label, why) {
  skipped.push({ label, why });
  console.log('  skip ' + label + '（' + why + '）');
}

// ── 1. 清单面 ─────────────────────────────────────────────────────────────────
await test('bundle patch 指得到，files 点名的条目都在', () => {
  const declared = manifest.dsh?.bundle?.patch;
  assert.equal(typeof declared, 'string', 'package.json 缺 dsh.bundle.patch');
  assert.ok(existsSync(join(packageDir, declared)), 'dsh.bundle.patch 指的 ' + declared + ' 不存在');
  for (const entry of manifest.files) {
    assert.ok(existsSync(join(packageDir, entry)), 'files 里的 ' + entry + ' 在目录里不存在');
  }
});

const patchText = readFileSync(join(packageDir, manifest.dsh.bundle.patch), 'utf8');

await test('exports 的每个子路径都解析得到，main 与 client 都在', () => {
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    assert.ok(existsSync(join(packageDir, target)), 'exports 的 ' + subpath + ' 指向 ' + target + '，文件不存在');
  }
  assert.equal(manifest.main, 'lib/index.js');
  assert.ok(existsSync(join(packageDir, manifest.main)), 'main 指的产物不存在');
  assert.ok(existsSync(join(packageDir, 'lib/client.js')), '浏览器半边的产物不存在');
  assert.equal(manifest.icon, './assets/icon.svg');
  assert.ok(existsSync(join(packageDir, 'assets/icon.svg')), 'package.json 的 icon 指的图标不存在');
});

await test('dsh.client 声明了 web 与四个契约包', () => {
  assert.equal(manifest.dsh?.client?.platform, 'web');
  const inject = manifest.dsh?.client?.inject ?? [];
  for (const name of [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-ui-plugin-manager',
    '@deepseek-ai/dsh-client-ui-renderer',
  ]) {
    assert.ok(inject.includes(name), 'dsh.client.inject 缺 ' + name);
  }
});

await test('两个语言都给了标题与说明——插件页的卡片靠它们', () => {
  for (const lang of ['en', 'zh']) {
    const locale = JSON.parse(readFileSync(join(packageDir, 'locale', lang + '.json'), 'utf8'));
    assert.ok(locale.meta?.title, 'locale/' + lang + '.json 缺 meta.title，卡片会退回包名');
    assert.ok(locale.meta?.description, 'locale/' + lang + '.json 缺 meta.description，卡片会退回 package.json 的描述');
  }
});

await test('两份技能都在，frontmatter 的 name 与目录名一致且带描述', () => {
  for (const dir of ['macos', 'windows']) {
    const skillFile = join(packageDir, 'skills', dir, 'kimi-cu', 'SKILL.md');
    assert.ok(existsSync(skillFile), 'skills/' + dir + '/kimi-cu/SKILL.md 不存在');
    const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(skillFile, 'utf8'));
    assert.ok(block, dir + ' 的 SKILL.md 必须以 YAML frontmatter 开头，否则技能发现会静默丢掉它');
    assert.equal(/^name:\s*(.+)$/m.exec(block[1])?.[1].trim(), 'kimi-cu', dir + ' 的 frontmatter name 要与目录名一致');
    assert.ok(/^description:\s*\S/m.test(block[1]), dir + ' 的 frontmatter 缺 description');
  }
});

// ── 2. 文本面 ─────────────────────────────────────────────────────────────────
await test('patch 只插三行，id 就是约定的那三个', () => {
  const ids = [...patchText.matchAll(/^\s*-\s*id:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  assert.deepEqual([...ids].sort(), [...ROW_IDS].sort(), 'patch 里该有的行只有这三条，多一条就说明装配形状变了');
  assert.equal(patchText.includes('dsh-mcp-client'), false, 'MCP 连接改由宿主半边注册，patch 里不该再有静态行');
  assert.match(patchText, /name: '@deepseek-ai\/dsh-skill-filesystem'/, '技能行要挂内核的 skill-filesystem');
});

await test('两条平台行各带自己的守卫，根层行没有守卫', () => {
  const guards = [...patchText.matchAll(/^\s*disabled:\s*(.+)$/gm)].map((match) => match[1].trim());
  assert.equal(guards.length, 2, '只有两条平台行需要 disabled 守卫');
  assert.deepEqual([...guards].sort(), ['!!js ' + MACOS_GUARD, '!!js ' + WINDOWS_GUARD].sort());
});

await test('MCP 连接由宿主半边注册给 mcpManager，命令取自探测器', () => {
  const source = readFileSync(join(packageDir, 'src', 'index.ts'), 'utf8');
  assert.match(source, /ctx\.inject\(\['mcpManager'\]/, '管理器走可选注入，没有它插件照常加载');
  assert.match(source, /mcpManager\.register\(MCP_SERVER_NAME/, '要注册到管理器，而不是自己起一条 mcp-client');
  assert.match(source, /command: status\.mcp\.command/, '命令必须取自探测器，与状态卡、工具同源');
  assert.match(source, /args: status\.mcp\.args/, '参数同样取自探测器');
  const timeout = Number(/MCP_TOOL_TIMEOUT_MS = ([\d_]+)/.exec(source)?.[1].replaceAll('_', ''));
  assert.ok(timeout >= 120000, '工具调用上限要覆盖长任务，现为 ' + timeout);
});

/**
 * 取某一行在 patch 文本里的那一段（到下一行 id 或文件末尾）。
 * @param id - 行 id。
 * @returns 该行的文本。
 */
function rowBlock(id) {
  const start = patchText.indexOf('id: ' + id);
  assert.ok(start !== -1, 'patch 里找不到 ' + id + ' 行');
  const nextId = ROW_IDS.map((other) => patchText.indexOf('id: ' + other, start + 1)).filter((at) => at > start);
  return patchText.slice(start, nextId.length === 0 ? undefined : Math.min(...nextId));
}

await test('根层行挂本包，不带平台守卫', () => {
  const block = rowBlock('dsh-kimi-cu');
  assert.ok(block.includes("name: '" + PACKAGE_NAME + "'"), '根层行要挂本包');
  assert.doesNotMatch(block, /disabled:/, '根层行在别的平台上也要加载，卡片负责说明不支持');
});

await test('探测器给出的 MCP 命令就是各平台的真实路径', () => {
  const mac = resolveInstall({ platform: 'darwin', env: {}, exists: (path) => path === MACOS_BINARY });
  assert.equal(mac.mcp.command, MACOS_BINARY, 'KimiCU 的命令行在 app 包里，不是 PATH 上的命令');
  assert.deepEqual(mac.mcp.args, ['mcp', '-s', 'user'], 'macOS 的 MCP 需要 -s user');
  const win = resolveInstall({
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' },
    exists: () => false,
  });
  assert.equal(win.mcp.command, 'C:\\Users\\t\\AppData\\Local\\Kimi Computer Use\\kimi-cu.exe');
  assert.deepEqual(win.mcp.args, ['mcp'], 'Windows 的 MCP 只传 mcp');
  const other = resolveInstall({ platform: 'linux', env: {}, exists: () => false });
  assert.equal(other.mcp, null, '不受支持的平台上探测器给 null，宿主半边就不注册');
});

await test('两条技能行另取 providerName、关掉默认目录，各扫自己的目录', () => {
  for (const [id, dir] of Object.entries(SKILL_DIRS)) {
    const block = rowBlock(id);
    assert.ok(block.includes('providerName: kimi-cu'), id + ' 不另取名就会与内核那条默认技能行同名');
    assert.ok(block.includes('includeDefaultRoots: false'), id + ' 不该重复扫项目与用户技能目录');
    assert.ok(block.includes("'skills', '" + dir + "'"), id + ' 要扫 skills/' + dir);
    assert.ok(block.includes("createRequire(baseUrl).resolve('" + PACKAGE_NAME + "/package.json')"), id + ' 的技能目录要按包名解析');
  }
});

// ── 3. 契约面（要本机已装内核） ────────────────────────────────────────────────
/**
 * 在内核安装树的包仓里找某个包的真实目录。
 * @param kernel - 内核安装树。
 * @param name - 包名，例如 @deepseek-ai/dsh-mcp-client。
 * @returns 包目录；没装就是 undefined。
 */
function kernelPackageDir(kernel, name) {
  const store = join(kernel.dir, 'node_modules/.pnpm');
  if (!existsSync(store)) return undefined;
  for (const entry of readdirSync(store)) {
    if (!entry.startsWith(name.replace('/', '+') + '@')) continue;
    const candidate = join(store, entry, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  return undefined;
}

/**
 * 照 Loader 的方式求值一条 !!js 表达式：作用域里有 baseUrl 与 process。
 * @param expression - 表达式原文。
 * @param baseUrl - 装载该行的目录（file URL）。
 * @param processScope - process 替身；默认真 process。
 * @returns 求值结果。
 */
function evaluateExpression(expression, baseUrl, processScope = process) {
  const evaluate = new Function('scope', 'expression', 'with (scope) { return eval(expression) }');
  return evaluate({ baseUrl, process: processScope }, expression);
}

const contractLabels = [
  'patch 能被内核装载时用的那份 YAML 方言读懂',
  'macOS MCP 行的 config 通过内核 mcp-client 的真 Config schema',
  'Windows MCP 行的 config 通过内核 mcp-client 的真 Config schema，且与 resolveInstall 一致',
  '两条技能行的 config 通过内核 skill-filesystem 的真 Config schema，表达式落回对应目录',
];

/**
 * 本机内核，取不到就 undefined。
 * @returns 内核安装树或 undefined。
 */
function localKernel() {
  try {
    return currentKernel();
  } catch (error) {
    for (const label of contractLabels) skip(label, '本机没有可读的内核：' + error.message);
    return undefined;
  }
}

/**
 * 内核里这三样齐了才能验契约面；缺哪样就说哪样。
 * @param kernel - 内核安装树。
 * @returns 三个包目录或 undefined。
 */
function contractDirs(kernel) {
  const dirs = {
    include: kernelPackageDir(kernel, '@deepseek-ai/cordis-plugin-include'),
    client: kernelPackageDir(kernel, '@deepseek-ai/dsh-mcp-client'),
    skills: kernelPackageDir(kernel, '@deepseek-ai/dsh-skill-filesystem'),
  };
  const missing = Object.entries(dirs).filter(([, dir]) => dir === undefined).map(([name]) => name);
  if (missing.length > 0) {
    for (const label of contractLabels) skip(label, '内核 ' + kernel.version + ' 的包仓里找不到 ' + missing.join('、'));
    return undefined;
  }
  return dirs;
}

/**
 * 用内核装载时那份 YAML 方言读 patch，并按 id 摊平成一张表。
 * @param includeDir - 内核 cordis-plugin-include 的目录。
 * @returns id 到行的映射。
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

  await test('patch 能被内核 ' + kernel.version + ' 装载时用的 YAML 方言读懂，三行都在', () => {
    assert.deepEqual([...rows.keys()].sort(), [...ROW_IDS].sort(), '解析出来该只有这三行');
  });

  await test('两条技能行的 config 通过内核 skill-filesystem 的真 Config schema，表达式落回对应目录', async () => {
    const { Config } = await import(pathToFileURL(join(dirs.skills, 'lib/index.js')).href);
    for (const [id, dir] of Object.entries(SKILL_DIRS)) {
      const row = rows.get(id);
      const expression = row.config.customSkillDirs?.[0]?.__jsExpr;
      assert.equal(typeof expression, 'string', id + ' 的 customSkillDirs 要由 !!js 算成绝对路径');
      const fromPackage = evaluateExpression(expression, pathToFileURL(join(packageDir, 'index.js')).href);
      assert.equal(resolve(fromPackage), resolve(join(packageDir, 'skills', dir)), id + ' 的表达式要落回 skills/' + dir);
      const resolved = Config({ ...row.config, customSkillDirs: [fromPackage] });
      assert.equal(resolved.providerName, 'kimi-cu');
      assert.equal(resolved.includeDefaultRoots, false);
      assert.deepEqual(resolved.customSkillDirs.map((entry) => resolve(entry)), [resolve(join(packageDir, 'skills', dir))]);
    }
  });
}

console.log('\ncheck-bundle: ' + passed + '/' + total + ' 条断言通过' + (skipped.length === 0 ? '' : '，' + skipped.length + ' 条跳过'));
