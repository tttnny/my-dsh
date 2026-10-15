#!/usr/bin/env node
/**
 * 仓库台账的一致性门禁：把 `docs/rules/*.md` 里那些**固定形状**的约定变成确定性检查。
 *
 * 查的都是「改了 A 忘了改 B」这类漂移，判据一条比一条机械：
 *   1. 包名与目录名对应（`plugins/dsh-x/` ↔ `@lynn123411/dsh-x`；`presets/id/` ↔ `@lynn123411/dsh-preset-id`）
 *   2. `engines.dsh` 是 `>=<版本>`，且本包全部 `@deepseek-ai/dsh-*`（peer 与 dev）与它同串
 *   3. `@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 写区间（不是精确版本），同包内与跨包同串
 *   4. 许可只由 `package.json` 的 `license` 声明，各层目录不附带许可文书
 *   5. `files` 与 `dsh.bundle.patch` 指的条目在目录里存在
 *   6. 插件与 preset README 的四段固定形状，`## 安装` 里给的是本包名，README 指的 .md 都在目录里
 *   7. 根 `README.md` 与包目录互相覆盖（都指向对方，且没有指向不存在目录的链接）
 *   8. `docs/rules/presets.md` 的 order 台账与各 preset 的 `<id>.patch.yml` 一致
 *   9. 本机开发副本是软链、指向本仓库、版本号与仓库一致（没装开发副本的机器跳过这一项）
 *  10. 规则面（`README.md`、DETAILS 以外的 `.md`、`.patch.yml`、`.mjs` / `.js` / `.ts`）里的内核
 *      版本字面量与本包 `engines.dsh` 同串；历史实测记录（`DETAILS.md`）与 vendored 内容不查
 *  11. 抄自官方 preset 的 `<id>.patch.yml` 与已装内核的官方同名文件逐行一致，只放行已登记的差异
 *
 * 判据来自 docs/rules/plugins.md、release.md、presets.md、to-readme.md 与 AGENTS.md；
 * 改了那些约定就同步改这里，两边是同一件事的两个位置，不允许只改一边。
 *
 * 用法：node tools/assert-ledger.mjs [--quiet] [--dsh <版本>]
 * 退出码：0 全部一致，1 有漂移（逐条打印文件与修法）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  currentKernel,
  declaredRanges,
  devCopyState,
  dshHome,
  kernelPresetsDir,
  listPackages,
  profiles,
  repoRoot,
} from './lib/repo.mjs';

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

/** 把一段文本按行归一，逐行比对；返回两边都还有内容的第一处差异。 */
function firstDifference(a, b) {
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  for (let i = 0; i < Math.max(linesA.length, linesB.length); i += 1) {
    if (linesA[i] !== linesB[i]) return { line: i + 1, expected: linesA[i] ?? '（文件在这里结束）', actual: linesB[i] ?? '（文件在这里结束）' };
  }
  return undefined;
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

// ── 6. README 四段（插件与 preset 同形） ──────────────────────────────────────
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
    if (!text.includes(section)) fail(`${entry.rel}/README.md`, `缺「${section}」一节（README 是固定四段）`);
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

// ── 9. 开发副本（本机装了才查） ──────────────────────────────────────────────
const localProfiles = profiles(dshHome());
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
// 两条收窄，避免把无关的版本号当漂移：一行里要有「内核 / dsh / engines」这类语境词，版本号
// 前面不能紧跟字母与 `.-/:`（排除 `127.0.0.1`、`1e0.1.7`、`transform 1.21.21-1.79` 这类）。
const NUMBER_LITERAL = /(^|[^\w./:-])(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/g;
const KERNEL_CONTEXT = /内核|[dD][sS][hH]|engines/;
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
      if (!KERNEL_CONTEXT.test(line)) continue;
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

// ── 11. 抄自官方 preset 的抄本与内核同版本 ────────────────────────────────────
// 官方 `presets/*.patch.yml` 每一版都会动，抄本落后不报错、只静默与官方不一致（见
// docs/rules/presets.md「版本与依赖」）。这里把它变成提交时就要过的门禁：逐行比对，
// 只放行登记在 lib/preset-copies.json 里的那几处。
const copiesPath = join(root, 'tools/lib/preset-copies.json');
if (!existsSync(copiesPath)) {
  fail('tools/lib/preset-copies.json', '缺这份抄本登记表：每个抄自官方 preset 的 <id>.patch.yml 都要登记');
} else {
  const copies = JSON.parse(readFileSync(copiesPath, 'utf8')).copies ?? [];
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
      const normalize = (text, renames) => text
        .split('\n')
        .filter((line) => line.trim() !== '' && !/^\s*#/.test(line) && !copy.dropLines.some((pattern) => new RegExp(pattern).test(line)))
        .map((line) => renames.reduce((out, [pattern, replacement]) => out.replace(new RegExp(pattern), replacement), line))
        .filter((line) => line.trim() !== '' && !/^\s*#/.test(line))
        .join('\n')
        .trim();
      const official = normalize(readFileSync(officialPath, 'utf8'), []);
      const local = normalize(readFileSync(localPath, 'utf8'), copy.renames.map(({ pattern, replacement }) => [pattern, replacement]));
      const diff = firstDifference(official, local);
      if (diff !== undefined) {
        fail(
          `presets/${copy.id}/${copy.id}.patch.yml`,
          `与内核 ${kernel.version} 的官方 ${copy.official}.patch.yml 不一致（归一后第 ${diff.line} 行）\n      官方：${diff.expected}\n      抄本：${diff.actual}\n      官方动了就重抄；确实要保留的差异登记到 tools/lib/preset-copies.json`,
        );
      }
    }
  }
}

// ── 汇总 ────────────────────────────────────────────────────────────────────
const checks = 11;
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
console.error('\n判据见 docs/rules/plugins.md（版本与依赖、许可、README）、release.md（产物与清单）、presets.md（order 台账）、to-readme.md。');
process.exit(1);
