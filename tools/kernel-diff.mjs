#!/usr/bin/env node
/**
 * 两版内核之间改了什么。默认比**已装内核**的安装产物；加 `--from-source` 比 DSH 源码
 * checkout 里的 `dsh-v<版本>` tag——升级后旧内核通常已经不在，源码 tag 才是常规来源。
 *
 * 源码模式按包列出变动的文件（默认不计 `package.json` 的版本号变动），并单独回答
 * 「四份官方 preset 这一版动没动」。`--declared` 只看本仓包声明过的 `@deepseek-ai/*`。
 *
 * 用法：
 *   node tools/kernel-diff.mjs <旧版本>                      # 与已装的最高版本比安装产物
 *   node tools/kernel-diff.mjs <旧版本> <新版本>
 *   node tools/kernel-diff.mjs <旧版本> --from-source        # 与当前已装内核比源码 tag
 *   node tools/kernel-diff.mjs <旧版本> --from-source <新版本>
 *   node tools/kernel-diff.mjs <旧版本> --from-source --declared   # 只看本仓声明过的包
 *   node tools/kernel-diff.mjs <旧版本> --from-source --presets    # 包差异之后附加一节官方 preset
 *   node tools/kernel-diff.mjs <旧版本> --only dsh-tool-fs --only dsh-persona
 *   node tools/kernel-diff.mjs <旧版本> --all               # 连 package.json 的差异一起列
 *   node tools/kernel-diff.mjs --list                        # 只列这台机器装了哪些内核
 * 退出码：0 有结果（含「无差异」），2 跑不起来（版本没装、tag 不存在、参数不对）。
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { dshSourceDir, git, sourceTag, sourceTags } from './lib/dsh-source.mjs';
import { currentKernel, declaredRanges, installedKernels, listPackages, repoRoot } from './lib/repo.mjs';

/** 只出现、不带值的开关。它们后面那个词是位置参数，不能被吃掉。 */
const FLAGS = new Set(['--from-source', '--declared', '--presets', '--all', '--all-paths', '--list']);

/** 逐个解析 `--k v` 与 `--flag`；`--only` 可重复。 */
function parseArgs(argv) {
  const out = { _: [], only: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) {
      out._.push(key);
      continue;
    }
    const next = argv[i + 1];
    // 开关一律当 flag：只有取值参数才吃掉后一个词。否则「<旧版本> --from-source <新版本>」
    // 会把新版本当成 --from-source 的值，命令静默退回「比已装内核」。
    const value = next === undefined || next.startsWith('--') || FLAGS.has(key) ? true : ((i += 1), next);
    if (key === '--only') out.only.push(value);
    else out[key.slice(2)] = value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const root = repoRoot(import.meta.dirname);
const kernels = installedKernels();
const fromSource = args['from-source'] === true;
const declaredOnly = args.declared === true;
const listPresets = args.presets === true;

/** 本仓包声明过的 `@deepseek-ai/*`——「宿主这次动了什么」里跟我有关的那一部分。 */
function declaredNames() {
  const names = new Set();
  for (const entry of listPackages(root)) {
    for (const { name } of declaredRanges(entry.pkg, (name) => name.startsWith('@deepseek-ai/'))) names.add(name);
  }
  return names;
}

const only = args.only.filter((name) => name !== true).map((name) => (name.startsWith('@deepseek-ai/') ? name : `@deepseek-ai/${name}`));
const declared = declaredOnly ? declaredNames() : undefined;

/** 一个包是否要报：默认只报宿主包；`--only` 与 `--declared` 同时给时取交集。 */
function wanted(name) {
  if (only.length > 0 ? !only.includes(name) : !name.startsWith('@deepseek-ai/')) return false;
  if (declared !== undefined && !declared.has(name)) return false;
  return true;
}

if (args.list === true) {
  if (fromSource) {
    const source = dshSourceDir(root);
    if (source === undefined) {
      console.error('kernel-diff: 找不到 DSH 源码 checkout；用 DSH_SOURCE 指定（默认找仓库同级的 ../other/deepseek-harness）');
      process.exit(2);
    }
    for (const tag of sourceTags(source)) console.log(`${tag.slice('dsh-v'.length)}\t${source}`);
    process.exit(0);
  }
  if (kernels.length === 0) {
    console.error('kernel-diff: 这台机器上没有已装内核');
    process.exit(2);
  }
  for (const kernel of kernels) console.log(`${kernel.version}\t${kernel.dir}`);
  process.exit(0);
}

if (args._.length === 0) {
  console.error('用法：node tools/kernel-diff.mjs <旧版本> [新版本] [--from-source] [--declared] [--presets] [--only <包名>]... [--all]');
  process.exit(2);
}
const olderVersion = args._[0];

/** 是否存在且是目录。 */
function isDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

// ── 源码模式 ──────────────────────────────────────────────────────────────────
if (fromSource) {
  const source = dshSourceDir(root);
  if (source === undefined) {
    console.error('kernel-diff: 找不到 DSH 源码 checkout；用 DSH_SOURCE 指定（默认找仓库同级的 ../other/deepseek-harness）');
    process.exit(2);
  }
  let newerVersion = args._[1];
  if (newerVersion === undefined) {
    try {
      newerVersion = currentKernel().version;
    } catch (error) {
      console.error(`kernel-diff: 没给新版本，也读不到已装内核（${error.message}）`);
      process.exit(2);
    }
  }
  const olderTag = sourceTag(olderVersion);
  const newerTag = sourceTag(newerVersion);
  const tags = sourceTags(source);
  const missing = [olderTag, newerTag].filter((tag) => !tags.includes(tag));
  if (missing.length > 0) {
    console.error(`kernel-diff: 源码 checkout 里没有 tag ${missing.join('、')}；最近的发布 tag：${tags.slice(0, 6).join('、') || '（一个都没有）'}`);
    process.exit(2);
  }

  /** tag 里的包目录 → 包名（`packages/<区>/<包>/package.json`，一次 git grep 取全）。 */
  function packagesAt(tag) {
    const found = new Map();
    const result = git(source, ['grep', '-n', '"name"', tag, '--', 'packages/*/*/package.json']);
    if (result.status !== 0) return found;
    for (const line of result.stdout.split('\n')) {
      const match = /^[^:]+:(packages\/[^:]+\/package\.json):\d+:\s*"name":\s*"([^"]+)"/.exec(line);
      if (match !== null) found.set(match[1].replace(/\/package\.json$/, ''), match[2]);
    }
    return found;
  }

  /** 变动路径按最深的那层包目录归组；返回 包名 → [{status, file}]。 */
  function groupByPackage(statusLines, dirs) {
    const groups = new Map();
    for (const line of statusLines) {
      const [status, path] = line.split('\t');
      if (status === undefined || path === undefined || !path.startsWith('packages/')) continue;
      const parts = path.split('/');
      let dir;
      for (let depth = Math.min(parts.length - 1, 4); depth >= 3; depth -= 1) {
        const candidate = parts.slice(0, depth).join('/');
        if (dirs.has(candidate)) {
          dir = candidate;
          break;
        }
      }
      if (dir === undefined) continue;
      const name = dirs.get(dir);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push({ status, file: path.slice(dir.length + 1) });
    }
    return groups;
  }

  const olderDirs = packagesAt(olderTag);
  const newerDirs = packagesAt(newerTag);
  const unknown = only.filter((name) => ![...olderDirs.values(), ...newerDirs.values()].includes(name));
  if (unknown.length > 0) {
    console.error(`kernel-diff: 源码里没有这些包（名字拼错了？）：${unknown.join('、')}`);
    process.exit(2);
  }
  const diff = git(source, ['diff', '--no-renames', '--name-status', olderTag, newerTag, '--', 'packages']);
  if (diff.status !== 0) {
    console.error(`kernel-diff: git diff 失败：${diff.stderr.trim()}`);
    process.exit(2);
  }
  const groups = groupByPackage(diff.stdout.split('\n').filter(Boolean), newerDirs);
  const olderNames = new Set(olderDirs.values());
  const newerNames = new Set(newerDirs.values());
  const added = [...newerNames].filter((name) => !olderNames.has(name) && wanted(name)).sort();
  const removed = [...olderNames].filter((name) => !newerNames.has(name) && wanted(name)).sort();

  const changed = [];
  for (const [name, entries] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!wanted(name)) continue;
    const kept = entries.filter((entry) => args.all === true || !entry.file.endsWith('package.json'));
    if (kept.length > 0) changed.push({ name, entries: kept.sort((a, b) => a.file.localeCompare(b.file)) });
  }

  console.log(`kernel-diff: ${olderVersion} → ${newerVersion}（源码 tag ${olderTag} → ${newerTag}）`);
  console.log(`  源码：${source}`);
  if (only.length > 0) console.log(`  只比：${only.join('、')}`);
  if (declaredOnly) console.log(`  只比本仓声明过的 ${declared.size} 个包`);
  console.log(`  包数 ${olderDirs.size} → ${newerDirs.size}；内容有差异的 ${changed.length}，新版新装 ${added.length}，新版没有 ${removed.length}`);
  if (added.length > 0) console.log(`  新版新装：${added.join('、')}`);
  if (removed.length > 0) console.log(`  新版没有：${removed.join('、')}`);
  for (const item of changed) {
    console.log(`\n${item.name}`);
    for (const entry of item.entries) console.log(`  ${entry.status} ${entry.file}`);
  }
  if (changed.length === 0 && added.length === 0 && removed.length === 0) console.log('\npackages/ 下没有差异');
  console.log('\n  package.json 的版本号变动不计（--all 连它一起列）');

  if (listPresets) {
    const presets = git(source, ['diff', '--no-renames', '--name-status', olderTag, newerTag, '--', 'packages/bundle/web-app/presets']);
    const lines = presets.status === 0 ? presets.stdout.split('\n').filter(Boolean) : [];
    console.log('\n官方 preset：');
    if (lines.length === 0) console.log('  四份官方 preset 一字未动');
    for (const line of lines) {
      const [status, path] = line.split('\t');
      console.log(`  ${status} ${path === undefined ? '' : path.split('/').pop()}`);
    }
  }

  const outside = git(source, ['diff', '--no-renames', '--name-only', olderTag, newerTag, '--', '.', ':(exclude)packages']);
  const outsidePaths = outside.status === 0 ? outside.stdout.split('\n').filter(Boolean) : [];
  if (outsidePaths.length > 0) {
    console.log(`\npackages/ 之外还有 ${outsidePaths.length} 个文件变动${args['all-paths'] === true ? '' : '（--all-paths 列出来）'}`);
    if (args['all-paths'] === true) for (const path of outsidePaths) console.log(`  ${path}`);
  }
  process.exit(0);
}

// ── 已装内核模式 ──────────────────────────────────────────────────────────────
const newerVersion = args._[1] ?? kernels[0]?.version;
const find = (version) => kernels.find((kernel) => kernel.version === version);
const older = find(olderVersion);
const newer = newerVersion === undefined ? undefined : find(newerVersion);
for (const [version, kernel] of [[olderVersion, older], [newerVersion, newer]]) {
  if (kernel === undefined) {
    console.error(
      `kernel-diff: 内核 ${version} 没有安装；已装的是 ${kernels.map((entry) => entry.version).join('、') || '（一个都没有）'}\n` +
        '  上一版与这一版的差异看源码 tag：加 --from-source（升级后旧内核通常已经不在了）',
    );
    process.exit(2);
  }
}
if (older.dir === newer.dir) {
  console.error(`kernel-diff: 新旧是同一份内核（${olderVersion}）`);
  process.exit(2);
}

/** 一份内核里官方 preset 的目录。 */
function presetsDirOf(kernel) {
  const store = join(kernel.dir, 'node_modules/.pnpm');
  if (!isDirectory(store)) return undefined;
  for (const entry of readdirSync(store)) {
    if (!entry.startsWith('@deepseek-ai+dsh-web-app@')) continue;
    const dir = join(store, entry, 'node_modules/@deepseek-ai/dsh-web-app/presets');
    if (isDirectory(dir)) return dir;
  }
  return undefined;
}

if (listPresets) {
  const olderPresets = presetsDirOf(older);
  const newerPresets = presetsDirOf(newer);
  const names = new Set([
    ...(olderPresets === undefined ? [] : readdirSync(olderPresets)),
    ...(newerPresets === undefined ? [] : readdirSync(newerPresets)),
  ]);
  const moved = [];
  for (const name of [...names].sort()) {
    if (!name.endsWith('.patch.yml')) continue;
    const before = olderPresets === undefined ? undefined : readFileSync(join(olderPresets, name), 'utf8');
    const after = newerPresets === undefined ? undefined : readFileSync(join(newerPresets, name), 'utf8');
    if (before !== after) moved.push(name);
  }
  console.log(`kernel-diff: 官方 preset ${olderVersion} → ${newerVersion}`);
  if (moved.length === 0) console.log('  四份官方 preset 一字未动');
  for (const name of moved) console.log(`  ${name}`);
  process.exit(0);
}

/** 一份内核的包仓里，包名 → 真实目录（软链到别处的包不重复收）。 */
function packagesOf(store) {
  const found = new Map();
  const walk = (dir, depth) => {
    if (depth > 4) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
      } catch {
        // 不是包目录：往下找。
        walk(path, depth + 1);
        continue;
      }
      // 到了包目录就停下：再往下会顺着 node_modules 软链重复走别的包。
      if (typeof pkg.name === 'string' && !found.has(pkg.name)) found.set(pkg.name, path);
    }
  };
  walk(store, 0);
  return found;
}

/** 一棵包目录里的全部文件：相对路径 → sha256（跳过软链与 `node_modules`）。 */
function filesOf(dir, prefix = '') {
  const out = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      for (const [key, value] of filesOf(path, rel)) out.set(key, value);
      continue;
    }
    if (!stat.isFile()) continue;
    out.set(rel, createHash('sha256').update(readFileSync(path)).digest('hex'));
  }
  return out;
}

const olderStore = join(older.dir, 'node_modules/.pnpm');
const newerStore = join(newer.dir, 'node_modules/.pnpm');
const olderPackages = packagesOf(olderStore);
const newerPackages = packagesOf(newerStore);
const unknown = only.filter((name) => !newerPackages.has(name) && !olderPackages.has(name));
if (unknown.length > 0) {
  console.error(`kernel-diff: 包仓里没有这些包（名字拼错了？）：${unknown.join('、')}`);
  process.exit(2);
}

const changed = [];
const added = [];
const removed = [];
for (const name of [...newerPackages.keys()].sort()) {
  if (!wanted(name)) continue;
  const before = olderPackages.get(name);
  const after = newerPackages.get(name);
  if (before === undefined) {
    added.push(name);
    continue;
  }
  const filesBefore = filesOf(before);
  const filesAfter = filesOf(after);
  const entries = [];
  for (const [file, hash] of filesAfter) {
    if (file === 'package.json' && args.all !== true) continue;
    if (!filesBefore.has(file)) entries.push(`+ ${file}`);
    else if (filesBefore.get(file) !== hash) entries.push(`M ${file}`);
  }
  for (const file of filesBefore.keys()) {
    if (file === 'package.json' && args.all !== true) continue;
    if (!filesAfter.has(file)) entries.push(`- ${file}`);
  }
  if (entries.length > 0) changed.push({ name, entries: entries.sort() });
}
for (const name of [...olderPackages.keys()].sort()) {
  if (!newerPackages.has(name) && wanted(name)) removed.push(name);
}

console.log(`kernel-diff: ${olderVersion} → ${newerVersion}（已装内核的安装产物）`);
if (only.length > 0) console.log(`  只比：${only.join('、')}`);
if (declaredOnly) console.log(`  只比本仓声明过的 ${declared.size} 个包`);
const outside = [...olderPackages.keys(), ...newerPackages.keys()].filter((name) => !name.startsWith('@deepseek-ai/'));
console.log(`  包数 ${olderPackages.size} → ${newerPackages.size}（第三方 ${outside.length} 个不逐包比）；内容有差异的 ${changed.length}，新版新装 ${added.length}，新版没有 ${removed.length}`);
if (added.length > 0) console.log(`  新版新装：${added.join('、')}`);
if (removed.length > 0) console.log(`  新版没有：${removed.join('、')}`);

for (const item of changed) {
  console.log(`\n${item.name}`);
  for (const entry of item.entries) console.log(`  ${entry}`);
}
if (changed.length === 0 && added.length === 0) console.log('\n没有差异');
