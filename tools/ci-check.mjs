#!/usr/bin/env node
/**
 * 按 CI 的方式把仓库重跑一遍：干净 HOME、corepack 钉住的 pnpm、逐包 `pnpm install
 * --frozen-lockfile`，最后跑 `node tools/check.mjs`。
 *
 * 本机的 pnpm 用户配置可能把安全策略关掉（macOS 上是
 * `~/Library/Preferences/pnpm/config.yaml`），于是「本机全绿、CI 全红」。这个脚本把
 * CI 的环境条件搬到本机：仓库复制到 `tmp/ci-check/repo`（不带 node_modules、.git 与 tmp），
 * HOME 指向 `tmp/ci-check/home`，用空 home 里装出的 corepack 外壳跑 pnpm。
 *
 * 日常不用跑：`check` 与 `publish` 两个工作流在干净 runner 上跑的就是这一套，而且 `publish`
 * 把它排在 `npm publish` 之前。它留给两种情况——CI 红了要本机复现；或这次改动动了安装契约
 * （依赖声明、lock、`pnpm-workspace.yaml` 的放行项、`packageManager`），因为本机的 pnpm
 * 用户配置可能把安全策略关掉。它比工作流多覆盖一处：副本取自工作区，未提交的改动也在里面。
 *
 * 要联网：install 从 registry 取包；空 HOME 意味着 store 也是新的，第一次会慢一点。
 *
 * 用法：
 *   node tools/ci-check.mjs          # 跑完删掉 tmp/ci-check（成功时）
 *   node tools/ci-check.mjs --keep   # 保留现场
 * 退出码：0 全通过，1 有一步不通过（现场保留），2 跑不起来（缺 corepack 等）。
 */
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';

import { listPackages, repoRoot } from './lib/repo.mjs';

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

/** 退出并说明原因。 */
function stop(message, code = 2) {
  console.error(`ci-check: ${message}`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
const keep = args.keep === true;
const unknown = Object.keys(args).filter((key) => key !== 'keep');
if (unknown.length > 0) stop(`认不得的参数：${unknown.map((key) => `--${key}`).join('、')}`);

const root = repoRoot(import.meta.dirname);
const work = join(root, 'tmp/ci-check');
const workRepo = join(work, 'repo');
const workHome = join(work, 'home');
const binDir = join(work, 'bin');
rmSync(work, { recursive: true, force: true });
mkdirSync(workHome, { recursive: true });
mkdirSync(binDir, { recursive: true });

// 复制工作区（不是 git archive）：未提交的改动也要进这次模拟。逐项复制根目录，
// 跳过 tmp/（现场自己就在里面）与 .git/、node_modules/。
const copyFilter = (src) => {
  const name = basename(src);
  if (name === 'node_modules' || name === '.git' || name === 'tmp' || name === '.DS_Store') return false;
  return !name.endsWith('.tgz');
};
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (['.git', 'node_modules', 'tmp', '.DS_Store'].includes(entry.name) || entry.name.endsWith('.tgz')) continue;
  cpSync(join(root, entry.name), join(workRepo, entry.name), { recursive: true, filter: copyFilter });
}

const env = {
  ...process.env,
  HOME: workHome,
  COREPACK_HOME: join(workHome, 'corepack'),
  DSH_HOME: join(workHome, '.dsh'),
  PATH: `${binDir}:${process.env.PATH ?? ''}`,
  CI: 'true',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
};

/** 跑一条命令，输出原样透传。 */
function run(executable, commandArgs, cwd) {
  const result = spawnSync(executable, commandArgs, { cwd, env, stdio: 'inherit' });
  if (result.error !== undefined) stop(`跑不起来 ${executable}：${result.error.message}`);
  return result.status ?? 2;
}

if (run('corepack', ['enable', '--install-directory', binDir], workRepo) !== 0) {
  stop('corepack enable 失败；这台机器没有可用的 corepack（Node 22+ 自带）');
}

const packages = listPackages(workRepo).filter((entry) => ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  .some((field) => Object.keys(entry.pkg[field] ?? {}).length > 0));
console.log(`ci-check: 干净 HOME ${workHome}`);
console.log(`ci-check: 工作区副本 ${workRepo}`);
console.log(`ci-check: 要装依赖的 ${packages.length} 个包`);

for (const entry of packages) {
  console.log(`\n=== ${entry.rel} → pnpm install --frozen-lockfile`);
  const status = run('pnpm', ['install', '--frozen-lockfile'], entry.dir);
  if (status !== 0) {
    console.error(`ci-check: ${entry.rel} 的 install 退出码 ${status}；现场保留在 ${work}`);
    process.exit(1);
  }
}

console.log('\n=== node tools/check.mjs');
const checkStatus = run('node', ['tools/check.mjs'], workRepo);
if (checkStatus !== 0) {
  console.error(`ci-check: check 退出码 ${checkStatus}；现场保留在 ${work}`);
  process.exit(checkStatus === 2 ? 2 : 1);
}

if (keep) {
  console.log(`\nci-check: ok；按 --keep 保留了现场：${work}`);
} else {
  rmSync(work, { recursive: true, force: true });
  console.log('\nci-check: ok（与 CI 同一套 install 与 check；现场已清掉）');
}
process.exit(0);
