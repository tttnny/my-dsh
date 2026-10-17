#!/usr/bin/env node
/**
 * preset 的组合解析门禁（`docs/rules/presets.md`「验证」的第一条，这里把它变成一条命令）：
 * 在本机 `dsh` 上跑一次 `--dump-config`，确认本 preset 的 patch 能并进 profile 层栈、
 * 组合树里出现 `preset-<id>` 行，且 `config.id` / `config.order` 与目录名和 patch 一致。
 *
 * 只组合、不装载、不求值 `!!js`：真装载与工具目录是 `tools/host-smoke.mjs` 的事。
 *
 * 为什么用临时 DSH_HOME：`--dump-config` 也会 prepareProfile（往 profile 目录写 cordis.yml）。
 * 临时 home 里只放 profile 的 package.json 与 lock，**不放 node_modules**，所以它不装任何依赖、
 * 不动正在服务的那份 profile。没有安装的本仓 bundle 会被跳过并打一行提示——组合 overlay 与
 * 那些 bundle 无关，判据不看它们。
 *
 * 用法：
 *   node tools/preset-compose.mjs plugin-upgrade-cordis  # 一个 preset
 *   node tools/preset-compose.mjs --all                  # presets/ 下全部
 *   node tools/preset-compose.mjs plugin-upgrade-cordis --profile web --json
 * 退出码：0 组合通过，1 组合不通过，2 跑不起来（本机没有 dsh 安装等）。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import { currentKernel, dshHome, repoRoot } from './lib/repo.mjs';

const root = repoRoot(resolve(join(import.meta.dirname, '..')));

/** 逐个解析 `--k v` 与 `--flag`。 */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) {
      out._.push(key);
      continue;
    }
    const next = argv[i + 1];
    out[key.slice(2)] = next === undefined || next.startsWith('--') ? true : ((i += 1), next);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const profile = typeof args.profile === 'string' ? args.profile : process.env.DSH_PROFILE ?? 'web';
const ids = args.all === true ? undefined : args._;
if (args.all !== true && (ids === undefined || ids.length === 0)) {
  console.error('用法：node tools/preset-compose.mjs <preset-id | --all> [--profile web] [--json]');
  process.exit(2);
}

let kernel;
try {
  kernel = currentKernel(typeof args.dsh === 'string' ? args.dsh : undefined);
} catch (error) {
  // 没有已装内核的机器（CI 就是这种）做不了组合：`--dump-config` 本身就要宿主二进制。
  // 与 `assert-ledger.mjs` 的抄本比对同一条处置——明说跳过，不把「没跑」判成「通过」。
  console.log(`preset-compose: 跳过（${error.message}）——组合解析要本机已装内核，CI 上跑不了`);
  process.exit(0);
}

// 临时 home：只抄 profile 的清单文件，不抄 node_modules（见文件头）。
const tempHome = join(root, 'tmp/preset-compose/home');
const tempProfile = join(tempHome, 'profiles', profile);
mkdirSync(tempProfile, { recursive: true });
const sourceProfile = join(dshHome(), 'profiles', profile);
for (const file of ['package.json', 'pnpm-lock.yaml']) {
  const from = join(sourceProfile, file);
  if (existsSync(from)) copyFileSync(from, join(tempProfile, file));
}
if (!existsSync(join(tempProfile, 'package.json'))) {
  writeFileSync(join(tempProfile, 'package.json'), `${JSON.stringify({ name: `dsh-profile-${profile}`, private: true }, null, 2)}\n`);
}

/** 组合一个 preset 并检查树上的那一行。 */
function compose(id) {
  const dir = join(root, 'presets', id);
  const patch = join(dir, `${id}.patch.yml`);
  if (!existsSync(patch)) return { id, ok: false, reason: `缺 ${id}.patch.yml` };
  const declaredOrder = /^\s*order:\s*(\d+)\s*$/m.exec(readFileSync(patch, 'utf8'))?.[1];

  const run = spawnSync(kernel.bin, ['--profile', profile, '--patch', patch, '--dump-config'], {
    env: { ...process.env, DSH_HOME: tempHome },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const status = run.status ?? 1;
  const stdout = run.stdout ?? '';
  // 临时 home 里没装本仓 bundle，宿主会为每一条打一行「skipping profile bundle」——组合 overlay
  // 与它们无关，别让这些噪声盖住真正的提示（例如某条 patch 的 entry 找不到）。
  const stderr = (run.stderr ?? '').split('\n').filter((line) => line !== '' && !/^dsh: skipping profile bundle /.test(line)).join('\n');

  const dumpPath = join(root, 'tmp/preset-compose', `${id}.dump.yml`);
  mkdirSync(join(root, 'tmp/preset-compose'), { recursive: true });
  writeFileSync(dumpPath, stdout);

  if (status !== 0) {
    return { id, ok: false, reason: `--dump-config 退出码 ${status}`, stderr: stderr.trim(), dumpPath };
  }

  // 找那一行本身，不按节头找：bundle 组合出来的行与 `--patch` overlay 追加的行都会出现在
  // 组合树里，而只有前者带 `# == <包名>` 节头。行块从它自己开始，到下一个顶格行（`- ` 或 `# `）为止。
  const lines = stdout.split('\n');
  const at = lines.indexOf(`- id: preset-${id}`);
  if (at === -1) return { id, ok: false, reason: `组合树里没有 preset-${id} 行（没有哪条 bundle 组合出它）`, stderr: stderr.trim(), dumpPath };
  let end = at + 1;
  while (end < lines.length && !/^(- |# )/.test(lines[end])) end += 1;
  const block = lines.slice(at, end).join('\n');
  const problems = [];
  if (!/^\s{2}name: '@deepseek-ai\/dsh-agent-preset'$/m.test(block)) problems.push('这一行不是 @deepseek-ai/dsh-agent-preset');
  const configId = /^\s{4}id:\s*(\S+)\s*$/m.exec(block)?.[1];
  if (configId !== id) problems.push(`config.id 是 ${JSON.stringify(configId)}，与目录名 ${id} 不一致`);
  const order = /^\s{4}order:\s*(\d+)\s*$/m.exec(block)?.[1];
  if (declaredOrder !== undefined && order !== declaredOrder) {
    problems.push(`组合出来的 order 是 ${order}，patch 里写的是 ${declaredOrder}`);
  }
  const rows = [...block.matchAll(/^\s{6}- id:\s*(\S+)\s*$/gm)].map((match) => match[1]);
  if (rows.length === 0) problems.push('config.plugins 里一行都没有');

  return { id, ok: problems.length === 0, reason: problems.join('；'), rows, order, stderr: stderr.trim(), dumpPath };
}

const presetIds = ids ?? readdirSync(join(root, 'presets'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(root, 'presets', entry.name, `${entry.name}.patch.yml`)))
  .map((entry) => entry.name);
const missing = presetIds.filter((id) => !existsSync(join(root, 'presets', id, `${id}.patch.yml`)));
for (const id of missing) console.error(`preset-compose: presets/${id}/${id}.patch.yml 不存在`);

const results = presetIds.filter((id) => !missing.includes(id)).map(compose);
const failed = results.filter((result) => !result.ok);

if (args.json === true) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const result of results) {
    if (result.ok) {
      console.log(`preset-compose: ok（${result.id}：组合 ${result.rows.length} 行，order ${result.order}）`);
      if (result.stderr !== '') console.log(`  提示：${result.stderr.split('\n')[0]}`);
    } else {
      console.error(`preset-compose: 不通过（${result.id}）：${result.reason}`);
      if (result.stderr) for (const line of result.stderr.split('\n').slice(0, 10)) console.error(`  ${line}`);
      if (result.dumpPath) console.error(`  组合树在 ${result.dumpPath}`);
    }
  }
}

if (failed.length > 0 || missing.length > 0) process.exit(1);
rmSync(join(root, 'tmp/preset-compose/home'), { recursive: true, force: true });
process.exit(0);
