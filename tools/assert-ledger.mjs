#!/usr/bin/env node
/**
 * 仓库台账的一致性门禁：把 `docs/rules/*.md` 里那些**固定形状**的约定变成确定性检查。
 *
 * 查的都是「改了 A 忘了改 B」这类漂移，判据一条比一条机械：
 *   1. 包名与目录名对应（`plugins/dsh-<name>/` ↔ `@lynn123411/dsh-<name>`；`presets/<id>/` ↔ `@lynn123411/dsh-preset-<id>`）
 *   2. `engines.dsh` 是 `>=<版本>`，且本包全部 `@deepseek-ai/dsh-*`（peer 与 dev）与它同串
 *   3. `@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 写区间（不是精确版本），同包内与跨包同串
 *   4. 许可只由 `package.json` 的 `license` 声明，各层目录不附带许可文书
 *   5. `files` 与 `dsh.bundle.patch` 指的条目在目录里存在
 *   6. 插件与 preset README 的三节固定形状（`## 功能` / `## 特性` / `## 安装`），`## 安装` 里给的是本包名，README 指的 .md 都在目录里
 *   7. 根 `README.md` 与包目录互相覆盖（都指向对方，且没有指向不存在目录的链接）
 *   8. `docs/rules/presets.md` 的 order 台账与各 preset 的 `<id>.patch.yml` 一致
 *   9. web 开发 profile 里的自有包是软链、指向本仓库、版本号与仓库一致（没装这个 profile 的机器跳过这一项）
 *  10. 规则面（`README.md`、DETAILS 以外的 `.md`、`.patch.yml`、`.mjs` / `.js` / `.ts`）里的内核
 *      版本字面量与本包 `engines.dsh` 同串；历史实测记录（`DETAILS.md`）与 vendored 内容不查
 *  11. 抄自官方 preset 的 `<id>.patch.yml` 与运行中内核的官方同名文件逐行一致，只放行已登记的差异
 *  12. 每个包钉住 pnpm 版本；有依赖的包另有 `pnpm-workspace.yaml` 放行内核 alpha 版本与构建脚本
 *  13. 归档的包只在 `archive/` 下被提到：除 `archive/`、`tmp/`、构建产物与随包 vendored 内容外，
 *      规则文档、工具脚本、根 README 与各包源码里都不出现它的包名或目录名，`plugins/<dir>` 也必须是活目录
 *  14. 插件 README/DETAILS 里写死的「N 个字段、M 条描述」与构建产物里实际注册的工具面一致
 *
 * 判据来自 docs/rules/plugins.md、release.md、presets.md、to-readme.md 与 AGENTS.md；
 * 改了那些约定就同步改这里，两边是同一件事的两个位置，不允许只改一边。
 *
 * 用法：node tools/assert-ledger.mjs [--quiet] [--dsh <版本>]
 * 退出码：0 全部一致，1 有漂移（逐条打印文件与修法）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { firstDifference, loadCopies, normalize } from './lib/preset-copies.mjs';
import {
  currentKernel,
  declaredRanges,
  devCopyState,
  dshHome,
  kernelPresetsDir,
  listPackages,
  profiles,
  readJson,
  repoRoot,
} from './lib/repo.mjs';

/**
 * 把文档里写的中文或阿拉伯数字读成整数。只认一到九十，够用：工具面的字段不会更多。
 * @param {string} text - 例如「八」「11」「十一」。
 * @returns {number|undefined} 数字；认不出时 undefined（调用方跳过这条声明）。
 */
function cnNumber(text) {
  const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (/^\d+$/.test(text)) return Number(text);
  if (text === '十') return 10;
  if (text.startsWith('十')) return 10 + (digits[text.slice(1)] ?? 0);
  if (text.endsWith('十')) return (digits[text.slice(0, -1)] ?? 0) * 10;
  if (text.includes('十')) {
    const [tens, ones] = text.split('十');
    return (digits[tens] ?? 0) * 10 + (digits[ones] ?? 0);
  }
  return digits[text];
}

/**
 * 一个插件注册的工具面有多大：顶层参数里的字段数，加上各处 description 的条数。
 *
 * 从构建产物里数，因为那里是工具真正注册的形状；读不出来（没构建、工具不是 grilling_form
 * 那种 defineTool 写法）时返回 undefined，调用方跳过这条声明而不是报假错。
 * @param {{ dir: string, rel: string }} entry - 包。
 * @returns {{ fields: number, descriptions: number }|undefined} 字段数与描述条数。
 */
function toolShapeOf(entry) {
  const bundle = join(entry.dir, 'lib', 'index.js');
  if (!existsSync(bundle)) return undefined;
  let source;
  try {
    source = readFileSync(bundle, 'utf8');
  } catch {
    return undefined;
  }
  // 只认 defineTool 那一段：同一个包里别的注册项不算工具面。
  const defineAt = source.indexOf('defineTool(');
  if (defineAt === -1) return undefined;
  const toolSource = source.slice(defineAt);
  // 只数入参：`parameters: {` 起、到配平为止；`output` 之后是结果 schema，不是模型要填的字段。
  const parametersAt = toolSource.indexOf('parameters: {');
  if (parametersAt === -1) return undefined;
  const body = toolSource.slice(parametersAt + 'parameters: {'.length);
  const parameters = body.slice(0, balancedAt(body));

  // 字段 = 入参对象第一层的键（questions、replace）+ 每个 properties 块第一层的键
  // （questions[] 的四个、options[] 的两个）。这正是文档里「八个字段」数的那些。
  let fields = topLevelKeys(parameters).length;
  for (const match of parameters.matchAll(/\bproperties:\s*\{/g)) {
    const blockBody = parameters.slice(match.index + match[0].length);
    fields += topLevelKeys(blockBody.slice(0, balancedAt(blockBody))).length;
  }
  // 只数「描述」的值，不数恰好叫 description 的字段：字段的值是花括号（properties 里的一项），
  // 描述的值是字符串或其他表达式。所以逐个看冒号后面跟的是什么，是花括号的跳过。
  let descriptions = 0;
  for (const match of toolSource.matchAll(/\bdescription\s*:/g)) {
    const rest = toolSource.slice(match.index + match[0].length).replace(/^\s+/, '');
    if (!rest.startsWith('{')) descriptions += 1;
  }
  return fields === 0 ? undefined : { fields, descriptions };
}

/**
 * 从开括号之后的位置起，找到与它配对的收尾括号的下标。
 * @param {string} body - 从 `{` 之后开始的文本。
 * @returns {number} 配对 `}` 的下标；没配上时给整段长度。
 */
function balancedAt(body) {
  let depth = 1;
  let index = 0;
  while (index < body.length) {
    const char = body[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    } else if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      while (index < body.length && body[index] !== quote) index += body[index] === '\\' ? 2 : 1;
    }
    index += 1;
  }
  return body.length;
}

/**
 * 一个对象字面量第一层的键：按花括号配平走，只收深度 0 处的 `key:`。
 *
 * 不按缩进数：构建产物会把行内对象压成一行，缩进不可靠；按配平后的深度数才稳。
 * @param {string} body - 从开括号之后开始的文本。
 * @returns {string[]} 第一层的键。
 */
function topLevelKeys(body) {
  const keys = [];
  let depth = 0;
  let index = 0;
  while (index < body.length) {
    const char = body[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      if (depth === 0) return keys;
      depth -= 1;
    } else if (char === '"' || char === "'") {
      // 跳过字符串字面量：里面的花括号与冒号都不算结构。
      const quote = char;
      index += 1;
      while (index < body.length && body[index] !== quote) index += body[index] === '\\' ? 2 : 1;
    } else if (depth === 0 && /[A-Za-z_$]/.test(char)) {
      const match = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(index));
      if (match !== null) {
        keys.push(match[1]);
        index += match[0].length;
        continue;
      }
    }
    index += 1;
  }
  return keys;
}

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
const root = repoRoot(resolve(join(import.meta.dirname, '..')));
const quiet = args.quiet === true;

/** 逐条收集发现，最后一起打印：一次提交要把该修的看全，不要修一条跑一次。 */
const findings = [];
const fail = (file, message) => findings.push({ file, message });
const rel = (path) => path.slice(root.length + 1);

const packages = listPackages(root);
const pluginPackages = packages.filter((entry) => entry.kind === 'plugin');
const presetPackages = packages.filter((entry) => entry.kind === 'preset');

// ── 1. 包名与目录名 ────────────────────────────────────────────────────────────
for (const entry of packages) {
  const dirName = entry.rel.split('/')[1];
  const expected = entry.kind === 'plugin'
    ? `@lynn123411/dsh-${dirName.replace(/^dsh-/, '')}`
    : `@lynn123411/dsh-preset-${dirName}`;
  if (entry.kind === 'plugin' && !dirName.startsWith('dsh-')) {
    fail(entry.rel, `插件目录名要以 dsh- 开头（现为 ${dirName}）`);
  }
  if (entry.name !== expected) {
    fail(`${entry.rel}/package.json`, `包名 ${entry.name} 与目录名不符，应为 ${expected}`);
  }
  if (entry.kind === 'preset' && entry.name !== `@lynn123411/dsh-preset-${dirName}`) {
    fail(`${entry.rel}/package.json`, `preset 目录名必须是 preset id（= patch 里的 config.id），包名应为 @lynn123411/dsh-preset-${dirName}`);
  }
}

// ── 2. engines.dsh 与全部 dsh-* 同串 ──────────────────────────────────────────
for (const entry of packages) {
  const engine = entry.pkg.engines?.dsh;
  if (typeof engine !== 'string' || !/^>=\d/.test(engine)) {
    fail(`${entry.rel}/package.json`, `engines.dsh 要写成 >=<当前内核版本> 的 SemVer 范围（现为 ${JSON.stringify(engine)}）`);
    continue;
  }
  for (const decl of declaredRanges(entry.pkg, (name) => name.startsWith('@deepseek-ai/dsh-'))) {
    if (decl.range !== engine) {
      fail(
        `${entry.rel}/package.json`,
        `${decl.field}.${decl.name} = ${decl.range}，与 engines.dsh ${engine} 不同串（两边要同一个范围字符串）`,
      );
    }
  }
}

// ── 3. cordis / schemastery 基线 ─────────────────────────────────────────────
const baselineRanges = new Map();
for (const base of ['@deepseek-ai/cordis', '@deepseek-ai/schemastery']) {
  baselineRanges.set(base, new Map());
}
for (const entry of packages) {
  for (const base of baselineRanges.keys()) {
    const decls = declaredRanges(entry.pkg, (name) => name === base);
    if (decls.length === 0) continue;
    const ranges = new Set(decls.map((decl) => decl.range));
    for (const decl of decls) {
      if (!decl.range.startsWith('^')) {
        fail(
          `${entry.rel}/package.json`,
          `${decl.field}.${base} = ${decl.range} 写死了精确版本；这是独立基线，要按现值写区间（^<版本>）`,
        );
      }
      const seen = baselineRanges.get(base);
      if (!seen.has(decl.range)) seen.set(decl.range, []);
      seen.get(decl.range).push(`${entry.rel}(${decl.field})`);
    }
    if (ranges.size > 1) {
      fail(`${entry.rel}/package.json`, `${base} 在同一个包里声明了多个区间：${[...ranges].join('、')}`);
    }
  }
  // 声明了就必须在 files 里带上运行时要用的那一份？——不做推断，交给各包自己的 check。
}
for (const [base, seen] of baselineRanges) {
  if (seen.size > 1) {
    const lines = [...seen].map(([range, where]) => `${range} ← ${where.join('、')}`);
    fail('（跨包）', `${base} 在包与包之间不一致，跑 node tools/dsh-baseline.mjs --write 统一：\n      ${lines.join('\n      ')}`);
  }
}

// ── 4. 许可 ─────────────────────────────────────────────────────────────────
for (const entry of packages) {
  if (typeof entry.pkg.license !== 'string' || entry.pkg.license === '') {
    fail(`${entry.rel}/package.json`, '缺 license 字段；许可只由这个字段声明');
  }
  for (const file of readdirSync(entry.dir)) {
    if (/^LICEN[CS]E/i.test(file)) {
      fail(`${entry.rel}/${file}`, '仓库各层目录不附带许可文书，删掉它（许可只在 package.json 的 license 字段）');
    }
  }
}
for (const file of readdirSync(root)) {
  if (/^LICEN[CS]E/i.test(file)) fail(file, '仓库根不附带许可文书，删掉它（许可只在各包 package.json 的 license 字段）');
}

// ── 5. files 与 bundle patch 指的条目存在 ─────────────────────────────────────
for (const entry of packages) {
  // 构建产物（`lib/` 这类）在没构建过的克隆里本来就不存在，包自己的 .gitignore 是它的登记位：
  // 被 ignore 掉的条目跳过存在性检查，其余条目照查。
  const gitignore = existsSync(join(entry.dir, '.gitignore')) ? readFileSync(join(entry.dir, '.gitignore'), 'utf8') : '';
  const ignored = new Set(
    gitignore.split('\n')
      .map((line) => line.replace(/#.*$/, '').trim().replace(/^\//, '').replace(/\/$/, ''))
      .filter((line) => line !== ''),
  );
  for (const pattern of entry.pkg.files ?? []) {
    const probe = pattern.replace(/\/\*\*.*$/, '').replace(/\/\*[^]*$/, '').replace(/\/$/, '');
    if (probe === '' || ignored.has(probe)) continue;
    if (!existsSync(join(entry.dir, probe))) {
      fail(`${entry.rel}/package.json`, `files 里的 ${pattern} 在目录里不存在（删条目或补文件，清单只写还存在的）`);
    }
  }
  const patch = entry.pkg.dsh?.bundle?.patch;
  for (const file of Array.isArray(patch) ? patch : patch === undefined ? [] : [patch]) {
    if (!existsSync(join(entry.dir, file))) {
      fail(`${entry.rel}/package.json`, `dsh.bundle.patch 指的 ${file} 不存在`);
    }
  }
}

// ── 6. README 三节（插件与 preset 同形：一级标题 + 功能 / 特性 / 安装） ────────
for (const entry of packages) {
  const path = join(entry.dir, 'README.md');
  if (!existsSync(path)) {
    fail(entry.rel, '缺 README.md');
    continue;
  }
  const text = readFileSync(path, 'utf8');
  const heading = /^#\s+(.+?)\s*$/m.exec(text)?.[1];
  // preset 的标题写成 `# <id> — <显示名>`，比对标题里第一个字段。
  const expected = entry.kind === 'plugin' ? entry.name : entry.rel.split('/')[1];
  const head = heading?.split(/\s+|[—–]/)[0];
  if (head !== expected) {
    fail(`${entry.rel}/README.md`, `一级标题要以 ${expected} 开头（现为 ${JSON.stringify(heading ?? '')}）`);
  }
  for (const section of ['## 功能', '## 特性', '## 安装']) {
    if (!text.includes(section)) fail(`${entry.rel}/README.md`, `缺「${section}」一节（README 正文是固定三节：功能 / 特性 / 安装）`);
  }
  const install = text.slice(text.indexOf('## 安装'));
  if (!install.includes(`add ${entry.name}`)) {
    fail(`${entry.rel}/README.md`, `「## 安装」里要给 dsh plugin --profile web add ${entry.name}`);
  }
  // README 指向的同包文档（DETAILS.md 这类）必须真的在目录里，否则装出来就是个死链。
  for (const match of text.matchAll(/\]\((?!https?:|#)([^)#\s]+\.md)(?:#[^)\s]*)?\)/g)) {
    const target = join(entry.dir, decodeURI(match[1]));
    if (!existsSync(target)) fail(`${entry.rel}/README.md`, `链接指向的 ${match[1]} 在目录里不存在`);
  }
}

// ── 7. 根 README 与包目录互相覆盖 ────────────────────────────────────────────
const rootReadme = readFileSync(join(root, 'README.md'), 'utf8');
for (const entry of packages) {
  if (!rootReadme.includes(`./${entry.rel}`)) {
    fail('README.md', `没有指向 ${entry.rel} 的行；新增包要并进插件表 / preset 表`);
  }
}
for (const match of rootReadme.matchAll(/\]\(\.\/((?:plugins|presets)\/[^)#\s]+)\)/g)) {
  const target = match[1].replace(/\/$/, '');
  if (!existsSync(join(root, target))) {
    fail('README.md', `链接指向不存在的目录：./${target}`);
  }
}

// ── 8. preset order 台账 ─────────────────────────────────────────────────────
const presetsDocPath = join(root, 'docs/rules/presets.md');
const presetsDoc = readFileSync(presetsDocPath, 'utf8');
const orderRows = new Map();
for (const match of presetsDoc.matchAll(/^\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*$/gm)) {
  const official = match[1].includes('官方');
  const id = match[1].replace(/（官方）/g, '').trim();
  orderRows.set(id, { order: Number(match[2]), official });
}
const declaredOrders = new Map();
for (const entry of presetPackages) {
  const id = entry.rel.split('/')[1];
  const patchPath = join(entry.dir, `${id}.patch.yml`);
  if (!existsSync(patchPath)) {
    fail(entry.rel, `缺 ${id}.patch.yml（preset 由 <id>.patch.yml 声明）`);
    continue;
  }
  const order = /^\s*order:\s*(\d+)\s*$/m.exec(readFileSync(patchPath, 'utf8'))?.[1];
  if (order === undefined) {
    fail(`${rel(patchPath)}`, 'config.order 没有写；取值登记在 docs/rules/presets.md 的台账表');
    continue;
  }
  declaredOrders.set(id, Number(order));
  if (orderRows.get(id)?.order !== Number(order)) {
    fail('docs/rules/presets.md', `order 台账与 ${id}.patch.yml 不一致：台账 ${orderRows.get(id)?.order ?? '（缺这一行）'}，patch ${order}`);
  }
}
for (const [id, row] of orderRows) {
  if (row.official) continue;
  if (!declaredOrders.has(id)) {
    fail('docs/rules/presets.md', `order 台账里的 ${id} 在 presets/ 下没有对应目录（退役了就从台账删掉这一行）`);
  }
}
const seenOrders = new Map();
for (const [id, order] of declaredOrders) {
  if (seenOrders.has(order)) {
    fail('docs/rules/presets.md', `order ${order} 被 ${seenOrders.get(order)} 与 ${id} 同时占用`);
  }
  seenOrders.set(order, id);
}

// ── 9. 开发副本（只查 web 这个开发 profile，装了才查） ────────────────────────
// desktop 等其他 profile 装的是发布版，不跟随本仓库；把它们的实体副本也当漂移报出来
// 只会让提交前的门禁一直红。开发副本的约定只落在 web 上。
const DEV_PROFILE = 'web';
const localProfiles = profiles(dshHome()).filter((profile) => profile.name === DEV_PROFILE);
for (const profile of localProfiles) {
  for (const entry of packages) {
    const state = devCopyState(profile.dir, entry.name);
    if (state.state === 'missing') continue;
    if (state.state === 'materialized') {
      fail(
        `${rel(profile.dir)}/node_modules/@lynn123411/${entry.name.split('/')[1]}`,
        `开发副本被物化成实体副本（${state.version ?? '版本不明'}）；跑 node tools/dev-link.mjs --write 连回仓库`,
      );
      continue;
    }
    if (state.state === 'dangling') {
      fail(
        `${rel(profile.dir)}/node_modules/@lynn123411/${entry.name.split('/')[1]}`,
        `软链断了（${state.target}）——这个 profile 装载时解析不到它；跑 node tools/dev-link.mjs --write 重连`,
      );
      continue;
    }
    if (state.version !== entry.pkg.version) {
      fail(
        `${rel(profile.dir)}/node_modules/@lynn123411/${entry.name.split('/')[1]}`,
        `软链读到的版本 ${state.version} 与仓库 ${entry.pkg.version} 不一致（软链指到了别处？）`,
      );
    }
  }
}

// ── 10. 内核版本字面量 ───────────────────────────────────────────────────────
// 硬钉内核版本的地方除了 package.json 的声明，还有自检断言、脚本注释与文档里的版本标注。
// 查的是「规则面」：README、非 DETAILS 的 .md、.patch.yml 与脚本；历史实测记录与 vendored
// 内容天然记着当时的版本号，不查（范围与理由见 docs/rules/plugins.md「版本与依赖」）。
//
// 两条收窄，避免把无关的版本号当漂移：脚本里一行要有「内核 / dsh / engines」这类语境词
// （脚本的版本号可能是工具链或历史注释，如 tsdown.config.ts 的 0.1.7-rc.2），版本号前面不能
// 紧跟字母与 `.-/:`（排除 `127.0.0.1`、`1e0.1.7`、`transform 1.21.21-1.79` 这类）。
// 文档与 patch 是「现状说明」，不套行内语境词：一行只写「agent-loop 注册了哪些变量」也可能
// 带着内核版本（UPSTREAM.md 的提示词变量扫描就是这样），漏查一次就静默落后一版。
const NUMBER_LITERAL = /(^|[^\w./:-])(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/g;
const KERNEL_CONTEXT = /内核|[dD][sS][hH]|engines/;
const PROSE_FACE = /\.(md|yml|yaml)$/;
const LITERAL_IGNORED_DIRS = new Set(['.git', 'node_modules', 'lib', 'dist', 'tmp', 'skills', 'upstream']);
const LITERAL_IGNORED_FILES = new Set(['pnpm-lock.yaml', 'upstream-lock.json']);
/** 展示命令行形状的英文注释：那里写的是「怎么调这个工具」，不是「现在是什么版本」。 */
const literalExempt = new Map([
  ['tools/dsh-env.mjs', '用法示例要给出 --dsh <版本> 的形状，不是现状声明'],
  ['tools/dsh-baseline.mjs', '同上'],
]);
/** 列出包目录里所有要查版本字面量的文件（相对仓库根的路径）。 */
function literalFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || LITERAL_IGNORED_DIRS.has(entry.name) || LITERAL_IGNORED_FILES.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...literalFiles(path));
      continue;
    }
    if (/\.(md|mjs|js|ts|tsx|jsx|yml|yaml)$/.test(entry.name) && !entry.name.startsWith('DETAILS')) out.push(path);
  }
  return out;
}
for (const entry of packages) {
  const engine = entry.pkg.engines?.dsh;
  if (typeof engine !== 'string' || !/^>=/.test(engine)) continue;
  const expected = engine.slice(2);
  for (const path of literalFiles(entry.dir)) {
    const repoPath = rel(path);
    if (literalExempt.has(repoPath)) continue;
    for (const [index, line] of readFileSync(path, 'utf8').split('\n').entries()) {
      if (!PROSE_FACE.test(path) && !KERNEL_CONTEXT.test(line)) continue;
      for (const match of line.matchAll(NUMBER_LITERAL)) {
        if (match[2] === expected) continue;
        fail(
          `${repoPath}:${index + 1}`,
          `写着内核版本 ${match[2]}，本包 engines.dsh 是 ${engine}——冒烟与自检都要跟到当前内核；历史实测记录写进 DETAILS.md，那里不查`,
        );
      }
    }
  }
}

// ── 13. 归档的包不再被活文件提到 ──────────────────────────────────────────────
// 归档只搬目录，引用不会自己消失。查两件事，都是「改了 A 忘了改 B」：
//   a. 归档包的包名与目录名出现在 archive/ 之外的规则面、工具脚本与包里——归档目录是它
//      唯一该出现的地方（见 docs/rules/release.md「退役（归档）」）。
//   b. 文档与脚本里点名的 `plugins/<dir>` / `presets/<id>` 必须真的存在。`<name>` 这类
//      占位符（含尖括号或星号）不是路径，跳过。
// 查的是全仓的活文件，不是某个包的目录：这类引用散在 docs/rules/、tools/ 与邻居包的注释里，
// 归档时最容易漏的就是它们（docs/rules/plugins.md「证明断言有牙齿」那条经验）。
const REFERENCE_SCANNED_DIRS = new Set(['node_modules', 'lib', 'dist', 'tmp', '.git', 'skills', 'upstream', 'archive']);
const REFERENCE_FILES = /\.(md|mjs|js|ts|tsx|jsx|json|ya?ml)$/;
/**
 * 匹配后面紧跟的字符决定它是不是一个真实路径：`plugins/dsh-<name>` 的段是 `dsh-`（被尖括号截断），
 * `presets/cordis.patch.yml` 说的是内核自带的官方 preset 文件——两者都不是本仓库的目录引用。
 */
const notAPath = (line, end) => /[<>*{}./]/.test(line[end] ?? ' ');

/** 收集活文件：规则文档、仓库级工具、各包的源码与脚本，加上根 README / AGENTS / .gitignore。 */
function referenceFiles() {
  const out = [];
  const walk = (dir, depth) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
      if (REFERENCE_SCANNED_DIRS.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 6) walk(path, depth + 1);
        continue;
      }
      if (REFERENCE_FILES.test(entry.name) || entry.name === '.gitignore') out.push(path);
    }
  };
  for (const top of ['docs', 'tools', 'plugins', 'presets']) {
    if (existsSync(join(root, top))) walk(join(root, top), 0);
  }
  for (const file of ['README.md', 'AGENTS.md', '.gitignore']) {
    if (existsSync(join(root, file))) out.push(join(root, file));
  }
  return out;
}

/** 归档目录里的包名，映射到它归档后的相对路径（找不到 package.json 时退回目录名）。 */
const archivedNames = new Map();
for (const top of ['archive/plugins', 'archive/presets']) {
  const base = join(root, top);
  if (!existsSync(base)) continue;
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgPath = join(base, entry.name, 'package.json');
    const name = existsSync(pkgPath) ? readJson(pkgPath).name : null;
    if (typeof name === 'string') archivedNames.set(name, `${top}/${entry.name}`);
    archivedNames.set(entry.name, `${top}/${entry.name}`);
  }
}
/** 归档名的命中：长的先占位，落在已占区间里的短名让位（包名本身含目录名，会命中两次）。 */
function nameHits(line) {
  const taken = [];
  const out = [];
  for (const [name, archivedAt] of [...archivedNames].sort((a, b) => b[0].length - a[0].length)) {
    let from = 0;
    for (;;) {
      const at = line.indexOf(name, from);
      if (at === -1) break;
      from = at + name.length;
      const before = line[at - 1] ?? '';
      const after = line[at + name.length] ?? '';
      if (/[\w-]/.test(before) || /[\w-]/.test(after)) continue;
      if (taken.some(([start, end]) => at < end && at + name.length > start)) continue;
      taken.push([at, at + name.length]);
      out.push({ name, archivedAt });
    }
  }
  return out;
}
if (archivedNames.size > 0) {
  for (const path of referenceFiles()) {
    const repoPath = rel(path);
    for (const [index, line] of readFileSync(path, 'utf8').split('\n').entries()) {
      for (const hit of nameHits(line)) {
        fail(
          `${repoPath}:${index + 1}`,
          `提到已归档的 ${hit.name}（现在在 ${hit.archivedAt}）；这里改指仍在维护的包，或删掉这句话`,
        );
      }
      for (const match of line.matchAll(/(?<![\w./-])(plugins|presets)\/([a-z0-9][a-z0-9-]*)/g)) {
        if (notAPath(line, match.index + match[0].length)) continue;
        if (!existsSync(join(root, match[1], match[2]))) {
          fail(`${repoPath}:${index + 1}`, `指向的 ${match[1]}/${match[2]} 不存在（归档了就把示例改指仍在维护的包）`);
        }
      }
    }
  }
}

// ── 11. 抄自官方 preset 的抄本与内核同版本 ────────────────────────────────────
// 官方 `presets/*.patch.yml` 可能动，也可能一字未动；抄本落后不报错、只静默与官方不一致
// （见 docs/rules/presets.md「抄本基线」）。这里把它变成提交时就要过的门禁：逐行比对，
// 只放行登记在 lib/preset-copies.json 里的那几处。
const registry = loadCopies(root);
const copiesPath = registry.path;
if (!existsSync(copiesPath)) {
  fail('tools/lib/preset-copies.json', '缺这份抄本登记表：每个抄自官方 preset 的 <id>.patch.yml 都要登记');
} else {
  const copies = registry.copies;
  const known = new Set(copies.map((copy) => copy.id));
  for (const entry of presetPackages) {
    const id = entry.rel.split('/')[1];
    if (!known.has(id)) {
      fail('tools/lib/preset-copies.json', `presets/${id} 没有登记——抄自官方就登记，自己写的把 official 写成 null`);
    }
  }
  let kernel;
  try {
    kernel = currentKernel(typeof args.dsh === 'string' ? args.dsh : undefined);
  } catch (error) {
    // 没装内核的机器（CI）跳过这一条：抄本比对的对象就在内核里。
    if (!quiet) console.log(`assert-ledger: 跳过抄本比对（${error.message}）`);
  }
  if (kernel !== undefined) {
    const presetsDir = kernelPresetsDir(kernel);
    if (presetsDir === undefined) {
      fail('（抄本）', `内核 ${kernel.version} 里没有 @deepseek-ai/dsh-web-app，抄本无从比对`);
    }
    for (const copy of copies) {
      if (copy.official === null) continue;
      const officialPath = join(presetsDir, `${copy.official}.patch.yml`);
      const localPath = join(root, 'presets', copy.id, `${copy.id}.patch.yml`);
      if (!existsSync(officialPath)) {
        fail(`presets/${copy.id}/${copy.id}.patch.yml`, `内核 ${kernel.version} 里没有官方 ${copy.official}.patch.yml`);
        continue;
      }
      if (!existsSync(localPath)) {
        fail(`presets/${copy.id}`, `登记表里有这个抄本，但 ${copy.id}.patch.yml 不在目录里`);
        continue;
      }
      const official = normalize(readFileSync(officialPath, 'utf8'), copy, false);
      const local = normalize(readFileSync(localPath, 'utf8'), copy);
      const diff = firstDifference(official, local);
      if (diff !== undefined) {
        fail(
          `presets/${copy.id}/${copy.id}.patch.yml`,
          `与内核 ${kernel.version} 的官方 ${copy.official}.patch.yml 不一致（归一后第 ${diff.line} 行）\n      官方：${diff.expected}\n      抄本：${diff.actual}\n      官方动了就重抄（node tools/preset-copy.mjs ${copy.id} --recopy）；确实要保留的差异登记到 tools/lib/preset-copies.json`,
        );
      }
    }
  }
}

// ── 14. 文档里写死的工具面数字与实际 schema 一致 ──────────────────────────────
// 插件 README/DETAILS 里会写「几个字段、几条描述」这类数字给模型看的事实。它是从源码数出来的，
// 不是独立的一份约定；加一个字段时忘了改它，读文档的人（模型）就会照错的形状调用工具。
// 这里直接读构建产物里注册的工具定义来数，两边只能一致。
for (const entry of pluginPackages) {
  const claimed = [];
  for (const name of ['README.md', 'DETAILS.md']) {
    const path = join(entry.dir, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/([一二三四五六七八九十\d]+)个字段[、，]\s*([一二三四五六七八九十\d]+)条描述/g)) {
      claimed.push({ name, raw: match[0], fields: cnNumber(match[1]), descriptions: cnNumber(match[2]) });
    }
  }
  if (claimed.length === 0) continue;
  const shape = toolShapeOf(entry);
  if (shape === undefined) continue;
  for (const claim of claimed) {
    if (claim.fields !== shape.fields || claim.descriptions !== shape.descriptions) {
      fail(
        `${entry.rel}/${claim.name}`,
        `写的「${claim.raw}」与工具面不符：实际是 ${shape.fields} 个字段、${shape.descriptions} 条描述（数字从源码数出来，改了 schema 就同步改这句）`,
      );
    }
  }
}

// ── 12. 安装约定 ─────────────────────────────────────────────────────────────
// 见 docs/rules/plugins.md「仓库级 check 与 CI」：本机的 pnpm 用户配置可能把两条默认策略
// 关掉，干净环境（CI）一定生效，所以它们必须写进仓库。这里保证它们不会悄悄丢掉。
const PNPM_PIN = /^pnpm@\d+\.\d+\.\d+$/;
const hasDependencies = (pkg) => ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  .some((field) => Object.keys(pkg[field] ?? {}).length > 0);
const pins = new Set();
for (const entry of packages) {
  const pin = entry.pkg.packageManager;
  if (typeof pin !== 'string' || !PNPM_PIN.test(pin)) {
    fail(
      `${entry.rel}/package.json`,
      '缺 packageManager（写成 pnpm@<版本>）——corepack 在没钉的包里会解析到另一个 pnpm 版本，安装时按那个版本重算策略；见 docs/rules/plugins.md「仓库级 check 与 CI」',
    );
  } else {
    pins.add(pin);
  }
  if (!hasDependencies(entry.pkg)) continue;
  const workspacePath = join(entry.dir, 'pnpm-workspace.yaml');
  if (!existsSync(workspacePath)) {
    fail(
      `${entry.rel}/pnpm-workspace.yaml`,
      '缺这份文件：pnpm 11 的两条默认策略在干净环境会拦住内核的 alpha 版本；照 docs/rules/plugins.md「仓库级 check 与 CI」给的段落补上',
    );
    continue;
  }
  const text = readFileSync(workspacePath, 'utf8');
  if (!/^minimumReleaseAgeExclude:\s*$/m.test(text) || !/^\s*-\s*["']?@deepseek-ai\/\*["']?\s*$/m.test(text)) {
    fail(
      `${entry.rel}/pnpm-workspace.yaml`,
      'minimumReleaseAgeExclude 下要有一行 - "@deepseek-ai/*"：升版当天就要装内核的 alpha 版本，24 小时最低发布年龄会拦住它',
    );
  }
  const declared = { ...entry.pkg.dependencies, ...entry.pkg.devDependencies };
  if (declared.esbuild !== undefined && (!/^allowBuilds:\s*$/m.test(text) || !/^\s+esbuild:\s*true\s*$/m.test(text))) {
    fail(
      `${entry.rel}/pnpm-workspace.yaml`,
      '声明了 esbuild，allowBuilds 里要写 esbuild: true——未登记的构建脚本在干净环境不会执行',
    );
  }
}
if (pins.size > 1) {
  fail('package.json', `packageManager 各包不一致（${[...pins].sort().join('、')}）：全仓钉同一个 pnpm 版本`);
}

// ── 汇总 ────────────────────────────────────────────────────────────────────
const checks = 14;
if (findings.length === 0) {
  if (!quiet) {
    console.log(`assert-ledger: ok（${packages.length} 个包，${checks} 项判据；开发副本 ${localProfiles.length} 个 profile）`);
  }
  process.exit(0);
}
console.error(`assert-ledger: ${findings.length} 处不一致`);
for (const finding of findings) {
  console.error(`  ${finding.file}`);
  for (const line of finding.message.split('\n')) console.error(`    ${line}`);
}
console.error('\n判据见 docs/rules/plugins.md（版本与依赖、安装约定、许可、README）、release.md（产物与清单、退役归档）、presets.md（order 台账、抄本基线）、to-readme.md。');
process.exit(1);
