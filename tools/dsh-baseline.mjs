#!/usr/bin/env node
/**
 * 内核基线跟进：一次把仓库里全部包的 DSH 版本声明改到目标内核上，并同步各自的 lock。
 *
 * 内核每升一版，7 个包要各改一遍 `engines.dsh`、全部 `@deepseek-ai/dsh-*` 的 peer / dev 串，
 * 还有 `@deepseek-ai/cordis` 与 `@deepseek-ai/schemastery` 这两条独立基线，再各跑一次
 * `pnpm install` 重写 lock——上一轮 alpha.2 → alpha.3 就是 7 个包各一次手工改动（caret 也是
 * 那么掉的：两个包的 cordis 被写成了精确版本，见 tools/assert-ledger.mjs 抓出来的那两处）。
 *
 * 目标值从**已装内核**读：版本号取 `@deepseek-ai/dsh` 的 version，cordis 与 schemastery 取
 * 内核自己声明的版本再按本仓库写法组 caret 区间。默认干跑（只报不改），`--write` 才落盘。
 *
 * 用法：
 *   node tools/dsh-baseline.mjs                        # 干跑：列出每个包要改的字段
 *   node tools/dsh-baseline.mjs --dsh 0.2.1-alpha.3
 *   node tools/dsh-baseline.mjs --write                # 落盘 + 在改动的包里跑 pnpm install
 *   node tools/dsh-baseline.mjs --write --bump patch   # 顺带把版本号加一位
 *   node tools/dsh-baseline.mjs --only dsh-a6api       # 只动一个包
 * 退出码：0 已对齐或改写成功，1 有包改写失败，2 跑不起来。
 */
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import { currentKernel, kernelBaselines, listPackages, repoRoot, writeJson } from './lib/repo.mjs';

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

/** 版本号加一位（patch / minor / major）；预发布段在加位时去掉（`0.2.1-alpha.2` → `0.2.2`）。 */
function bumpVersion(version, kind) {
  const parts = String(version).split('-')[0].split('.').map(Number);
  if (kind === 'major') return `${parts[0] + 1}.0.0`;
  if (kind === 'minor') return `${parts[0]}.${parts[1] + 1}.0`;
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

const args = parseArgs(process.argv.slice(2));
const root = repoRoot(resolve(join(import.meta.dirname, '..')));
const write = args.write === true;
const bump = typeof args.bump === 'string' ? args.bump : undefined;
if (bump !== undefined && !['patch', 'minor', 'major'].includes(bump)) {
  console.error(`dsh-baseline: --bump 只认 patch / minor / major（给的是 ${bump}）`);
  process.exit(2);
}

let kernel;
try {
  kernel = currentKernel(typeof args.dsh === 'string' ? args.dsh : undefined);
} catch (error) {
  console.error(`dsh-baseline: ${error.message}`);
  process.exit(2);
}
const target = kernelBaselines(kernel);
console.log(`dsh-baseline: 目标内核 ${target.dsh}（${kernel.dir}）`);
console.log(`dsh-baseline: 独立基线 cordis ${target.cordis ?? '（内核未声明，跳过）'} · schemastery ${target.schemastery ?? '（内核未声明，跳过）'}`);

/** 一个包要做的改动：字段路径 → 新值。 */
function plan(entry) {
  const changes = [];
  const dshRange = `>=${target.dsh}`;
  const engine = entry.pkg.engines?.dsh;
  if (engine !== dshRange) changes.push({ path: 'engines.dsh', from: engine, to: dshRange });
  for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(entry.pkg[field] ?? {})) {
      if (name.startsWith('@deepseek-ai/dsh-') && range !== dshRange) {
        changes.push({ path: `${field}.${name}`, from: range, to: dshRange });
      }
      if (name === '@deepseek-ai/cordis' && target.cordis !== undefined && range !== target.cordis) {
        changes.push({ path: `${field}.${name}`, from: range, to: target.cordis });
      }
      if (name === '@deepseek-ai/schemastery' && target.schemastery !== undefined && range !== target.schemastery) {
        changes.push({ path: `${field}.${name}`, from: range, to: target.schemastery });
      }
    }
  }
  return changes;
}

/** 把改动写进包描述（保持原有的键次序）。 */
function apply(pkg, changes) {
  for (const change of changes) {
    const [head, ...rest] = change.path.split('.');
    if (rest.length === 0) {
      pkg.engines = { ...pkg.engines, dsh: change.to };
      continue;
    }
    const field = head;
    const name = rest.join('.');
    pkg[field][name] = change.to;
  }
}

let packages = listPackages(root);
if (typeof args.only === 'string') {
  packages = packages.filter((entry) => entry.name === args.only || entry.rel === `plugins/${args.only}` || entry.rel === `presets/${args.only}`);
  if (packages.length === 0) {
    console.error(`dsh-baseline: 认不出这个包：${args.only}`);
    process.exit(2);
  }
}

const plans = packages.map((entry) => ({ entry, changes: plan(entry) })).filter((item) => item.changes.length > 0 || bump !== undefined);
const touched = plans.filter((item) => item.changes.length > 0);

for (const item of plans) {
  const { entry, changes } = item;
  const bumped = changes.length > 0 && bump !== undefined ? bumpVersion(entry.pkg.version, bump) : undefined;
  if (changes.length === 0 && bumped === undefined) continue;
  console.log(`\n${entry.rel}${bumped === undefined ? '' : `  ${entry.pkg.version} -> ${bumped}`}`);
  for (const change of changes) console.log(`  ${change.path}: ${change.from ?? '（缺）'} -> ${change.to}`);
}

if (touched.length === 0 && !write) {
  console.log('\ndsh-baseline: 全部包已对齐，没有要改的');
  process.exit(0);
}
if (!write) {
  console.log(`\ndsh-baseline: 干跑结束——${touched.length} 个包要改。落盘跑 node tools/dsh-baseline.mjs --write`);
  process.exit(0);
}

let failed = 0;
for (const item of plans) {
  const { entry, changes } = item;
  if (changes.length === 0) continue;
  apply(entry.pkg, changes);
  if (bump !== undefined) entry.pkg.version = bumpVersion(entry.pkg.version, bump);
  writeJson(entry.pkgPath, entry.pkg);
  console.log(`\ndsh-baseline: ${entry.rel} 已改写，跑 pnpm install`);
  try {
    execFileSync('pnpm', ['install'], { cwd: entry.dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    failed += 1;
    console.error(`dsh-baseline: ${entry.rel} 的 pnpm install 失败：\n${((error.stdout ?? '') + (error.stderr ?? '')).split('\n').slice(-15).join('\n')}`);
  }
}

console.log(`\ndsh-baseline: 改写 ${touched.length} 个包${failed === 0 ? '' : `，${failed} 个安装失败`}`);
console.log('  接着跑：node tools/assert-ledger.mjs；再在改动的包目录跑 pnpm check');
process.exit(failed === 0 ? 0 : 1);
