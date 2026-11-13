#!/usr/bin/env node
/**
 * 仓库级 check：把 `.githooks/pre-commit` 对本次改动做的事，对**全部包**跑一遍。
 *
 * 提交闸门只看改动的包，且只在这台装了钩子的机器上生效；CI 或换台机器想一次跑齐时用它。
 * 顺序是：先台账（`assert-ledger.mjs`，含内核版本字面量与 preset 抄本比对），再每个包在自己
 * 目录跑它 `scripts` 里的 `check`，最后一道是产物新鲜度（`assert-artifacts.mjs`：`lib/` 不能比
 * `src/` 旧）。它放最后是因为多数包的 `check` 自带构建，跑完就修好了；留在这里抓的是「check
 * 跑完产物还旧」——那说明这个包的 check 不构建、而自检里有读 `lib/` 的脚本。
 *
 * 包的依赖要先装好：`docs/rules/plugins.md`「验证」里那条约定（仓库根不放依赖）没有变——
 * 这个脚本不替你 install，缺 node_modules 就报出来。CI 的装法见 `.github/workflows/check.yml`。
 *
 * 用法：
 *   node tools/check.mjs                 # 台账 + 全部包的 check + 产物新鲜度
 *   node tools/check.mjs --ledger-only   # 台账 + 产物新鲜度，跳过包级 check，不安装依赖
 *   node tools/check.mjs --json          # 机器读；可与 --ledger-only 同用
 * 退出码：0 全通过，1 有检查返回非零，2 有包因缺 node_modules 被跳过或参数不对。
 * 子命令无法启动会记录状态 2；未触发上述缺依赖标记时，汇总退出码仍为 1。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

const args = parseArgs(process.argv.slice(2));
const known = new Set(['json', 'ledger-only']);
for (const key of Object.keys(args)) {
  if (!known.has(key)) {
    console.error(`check: 认不得的参数 --${key}；只认 --json 与 --ledger-only`);
    process.exit(2);
  }
}
const json = args.json === true;
const ledgerOnly = args['ledger-only'] === true;

const root = repoRoot(resolve(join(import.meta.dirname, '..')));
const hasDependencies = (pkg) => ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
  .some((field) => Object.keys(pkg[field] ?? {}).length > 0);

/** 在一个目录跑一条命令，回传结果（输出在非 json 模式下原样透传）。 */
function run(command, cwd, passthrough) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: 'utf8',
    stdio: passthrough ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status ?? (result.error === undefined ? 1 : 2),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message,
  };
}

const results = [];
const ledger = run(['node', join(root, 'tools/assert-ledger.mjs')], root, !json);
results.push({ name: '（仓库台账）', command: 'node tools/assert-ledger.mjs', ...ledger });
if (!json) console.log(ledger.status === 0 ? 'check: 台账通过' : 'check: 台账不通过');

let blocked = false;
if (!ledgerOnly) {
  for (const entry of listPackages(root)) {
    const script = entry.pkg.scripts?.check;
    const label = entry.rel;
    if (typeof script !== 'string') {
      if (!json) console.log(`check: 跳过 ${label}（它的 scripts 里没有 check）`);
      results.push({ name: label, command: '(没有 check 脚本)', status: 0, skipped: true, stdout: '', stderr: '' });
      continue;
    }
    if (hasDependencies(entry.pkg) && !existsSync(join(entry.dir, 'node_modules'))) {
      blocked = true;
      const message = `缺 node_modules：先 cd ${entry.rel} && pnpm install`;
      if (!json) console.error(`check: 跑不起来 ${label} —— ${message}`);
      results.push({ name: label, command: 'pnpm check', status: 2, stdout: '', stderr: message });
      continue;
    }
    if (!json) console.log(`\n=== ${label} → pnpm check`);
    const result = run(['pnpm', 'check'], entry.dir, !json);
    results.push({ name: label, command: 'pnpm check', ...result });
  }
}

// 产物新鲜度放在各包的 check **之后**：绝大多数包的 check 里带构建，跑完它自己就修好了；
// 这里要抓的是「check 跑完了，产物还是比源码旧」——那说明这个包的 check 不构建，而它的自检
// 里有读 lib/ 的脚本。放在最前面只会对「本来就打算构建」的包误报。
const artifacts = run(['node', join(root, 'tools/assert-artifacts.mjs')], root, !json);
results.push({ name: '（产物新鲜度）', command: 'node tools/assert-artifacts.mjs', ...artifacts });
if (!json) console.log(artifacts.status === 0 ? 'check: 产物新鲜' : 'check: 产物比源码旧（有包的 check 不构建，却读 lib/）');

const failed = results.filter((result) => result.status !== 0);
if (json) {
  console.log(JSON.stringify({
    ok: failed.length === 0 && !blocked,
    blocked,
    results: results.map(({ name, command, status, skipped, error }) => ({ name, command, status, ...(skipped === undefined ? {} : { skipped }), ...(error === undefined ? {} : { error }) })),
  }, null, 2));
} else {
  console.log(`\ncheck: ${results.length - failed.length}/${results.length} 通过${blocked ? '；有包因为缺依赖没跑' : ''}`);
  for (const result of failed) console.error(`  ${result.name}：${result.command} 退出码 ${result.status}${result.error === undefined ? '' : `（${result.error}）`}`);
}
if (blocked) process.exit(2);
process.exit(failed.length === 0 ? 0 : 1);
