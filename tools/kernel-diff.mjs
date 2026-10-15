#!/usr/bin/env node
/**
 * 两个已装内核之间的实现差异：逐个 `@deepseek-ai/*` 包对比 `.pnpm` 里的真实文件，报出
 * 有差异的包与其中变动的文件。内核升版后想知道「这次到底动了什么、我依赖的那几个包动没动」
 * 时用它，不用再现搭一份对比脚本。
 *
 * 比的是已装内核的安装产物（`node_modules/.pnpm` 下的真实目录），不是内核源码；拷进去的包
 * （软链）不重复比，会在开头点出数量。
 *
 * 用法：
 *   node tools/kernel-diff.mjs <旧版本>                 # 与已装的最高版本比
 *   node tools/kernel-diff.mjs <旧版本> <新版本>
 *   node tools/kernel-diff.mjs <旧版本> --only dsh-tool-fs --only dsh-persona
 *   node tools/kernel-diff.mjs <旧版本> --all           # 连 package.json 的差异一起列
 *   node tools/kernel-diff.mjs --list                   # 只列这台机器装了哪些内核
 * 退出码：0 有结果（含「无差异」），2 跑不起来（版本没装、参数不对）。
 */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { installedKernels } from './lib/repo.mjs';

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
    const value = next === undefined || next.startsWith('--') ? true : ((i += 1), next);
    if (key === '--only') out.only.push(value);
    else out[key.slice(2)] = value;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const kernels = installedKernels();

if (args.list === true) {
  if (kernels.length === 0) {
    console.error('kernel-diff: 这台机器上没有已装内核');
    process.exit(2);
  }
  for (const kernel of kernels) console.log(`${kernel.version}\t${kernel.dir}`);
  process.exit(0);
}

if (args._.length === 0) {
  console.error('用法：node tools/kernel-diff.mjs <旧版本> [新版本] [--only <包名>]... [--all]');
  process.exit(2);
}
const olderVersion = args._[0];
const newerVersion = args._[1] ?? kernels[0]?.version;
const find = (version) => kernels.find((kernel) => kernel.version === version);
const older = find(olderVersion);
const newer = newerVersion === undefined ? undefined : find(newerVersion);
for (const [version, kernel] of [[olderVersion, older], [newerVersion, newer]]) {
  if (kernel === undefined) {
    console.error(`kernel-diff: 内核 ${version} 没有安装；已装的是 ${kernels.map((entry) => entry.version).join('、') || '（一个都没有）'}`);
    process.exit(2);
  }
}
if (older.dir === newer.dir) {
  console.error(`kernel-diff: 新旧是同一份内核（${olderVersion}）`);
  process.exit(2);
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
const only = args.only.filter((name) => name !== true).map((name) => (name.startsWith('@deepseek-ai/') ? name : `@deepseek-ai/${name}`));
/** 逐包比的是内核自己的包；第三方包（软链进包仓的）会在汇总里点数，不逐个比。 */
const wanted = (name) => (only.length > 0 ? only.includes(name) : name.startsWith('@deepseek-ai/'));

const changed = [];
const added = [];
const removed = [];
const unknown = only.filter((name) => !newerPackages.has(name) && !olderPackages.has(name));
if (unknown.length > 0) {
  console.error(`kernel-diff: 包仓里没有这些包（名字拼错了？）：${unknown.join('、')}`);
  process.exit(2);
}
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
const outside = [...olderPackages.keys(), ...newerPackages.keys()].filter((name) => !name.startsWith('@deepseek-ai/'));
console.log(`  包数 ${olderPackages.size} → ${newerPackages.size}（第三方 ${outside.length} 个不逐包比）；内容有差异的 ${changed.length}，新版新装 ${added.length}，新版没有 ${removed.length}`);
if (added.length > 0) console.log(`  新版新装：${added.join('、')}`);
if (removed.length > 0) console.log(`  新版没有：${removed.join('、')}`);

for (const item of changed) {
  console.log(`\n${item.name}`);
  for (const entry of item.entries) console.log(`  ${entry}`);
}
if (changed.length === 0 && added.length === 0) console.log('\n没有差异');
