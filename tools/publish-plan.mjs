#!/usr/bin/env node
/**
 * 发布规划：挑出这次要发到 npm 的包，并把不能发的原因一次说清。
 *
 * 发布流程写在 docs/rules/release.md：先改 package.json 的 version，再跑各包的 check、台账与
 * `npm pack --dry-run`，最后 `npm publish`。这个脚本只做第一道判定——哪些包该发、哪些发不了——
 * 不改文件、不发布。GitHub Actions 的 publish 工作流用它挑包，本机也能直接跑。
 *
 * 判定依据是 registry 上已有的版本：本地版本已经在 registry 上，说明版本号没改，发出去必被拒绝
 * （同版本第二次 publish 是 409），在这里报出来比让 `npm publish` 在 CI 里红更有用。
 *
 * 用法：
 *   node tools/publish-plan.mjs                    # 自动：本地版本 registry 上还没有的包
 *   node tools/publish-plan.mjs --packages dsh-chat-translate,plugin-upgrade-cordis
 *   node tools/publish-plan.mjs --json             # 机器读；人读的摘要走 stderr
 * 退出码：0 有包可发且没有包被拦下，1 没有可发的包或有包被拦下，2 跑不起来（参数不对、查不到 registry）。
 */
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';

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
  console.error(`publish-plan: ${message}`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
const known = new Set(['packages', 'json']);
for (const key of Object.keys(args)) {
  if (!known.has(key)) stop(`认不得的参数 --${key}；只认 --packages 与 --json`);
}
const json = args.json === true;
const packagesArg = typeof args.packages === 'string' ? args.packages : '';

const root = repoRoot(import.meta.dirname);
const packages = listPackages(root);

/**
 * registry 上已有的版本。
 * `--fetch-retries=0` 与 `--fetch-timeout=10000` 治两种不同的挂住（见 release.md「查已发布版本」）；
 * 没发过的包（E404）按空清单算。
 * @param {string} name - 包名。
 * @returns {string[]} 已发布的版本号。
 */
function publishedVersions(name) {
  const result = spawnSync('npm', ['view', name, 'versions', '--json', '--fetch-retries=0', '--fetch-timeout=10000'], { encoding: 'utf8' });
  if (result.error !== undefined) stop(`跑不起来 npm：${result.error.message}`);
  const output = (result.stdout ?? '').trim();
  if (result.status !== 0) {
    const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (/E404|404 Not Found|is not in this registry/i.test(text)) return [];
    stop(`查 registry 失败（${name}）：${text.trim().split('\n').slice(-3).join(' ')}`);
  }
  if (output === '') return [];
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    stop(`读不懂 npm view 的输出（${name}）：${output.slice(0, 200)}`);
  }
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** 包名、目录名、`plugins/<目录>` 都指向同一个包。 */
const index = new Map();
for (const entry of packages) {
  for (const token of [entry.name, entry.name.split('/').pop(), entry.rel, basename(entry.dir)]) {
    index.set(token, entry);
  }
}

const tokens = packagesArg.split(/[\s,，]+/).filter((token) => token !== '');
const explicit = tokens.length > 0;
const candidates = [];
if (!explicit) {
  candidates.push(...packages);
} else {
  const seen = new Set();
  for (const token of tokens) {
    const entry = index.get(token);
    if (entry === undefined) {
      stop(`认不得的包 ${token}；给包名（@lynn123411/dsh-x）、目录名（dsh-x）或 plugins/<目录>`);
    }
    if (seen.has(entry.rel)) continue;
    seen.add(entry.rel);
    candidates.push(entry);
  }
}

const plan = { publish: [], skip: [], blocked: [] };
for (const entry of candidates) {
  const version = entry.pkg.version;
  const record = { name: entry.name, version, rel: entry.rel };
  if (entry.pkg.private === true) {
    plan.blocked.push({ ...record, reason: 'package.json 写了 "private": true' });
    continue;
  }
  if (entry.pkg.publishConfig?.access !== 'public') {
    plan.blocked.push({ ...record, reason: 'publishConfig.access 不是 "public"，scoped 包会发不出去' });
    continue;
  }
  if (typeof version !== 'string' || version === '') {
    plan.blocked.push({ ...record, reason: 'package.json 没有 version' });
    continue;
  }
  if (publishedVersions(entry.name).includes(version)) {
    if (explicit) {
      plan.blocked.push({ ...record, reason: `registry 上已有 ${version}；先改 package.json 的 version` });
    } else {
      plan.skip.push({ ...record, reason: `registry 上已有 ${version}` });
    }
    continue;
  }
  plan.publish.push(record);
}

const lines = [];
lines.push(explicit ? 'publish-plan: 按 --packages 指定的包判定' : 'publish-plan: 自动挑包（registry 上已有本地版本的包不列）');
for (const entry of plan.publish) lines.push(`发布  ${entry.name}@${entry.version}  ${entry.rel}`);
for (const entry of plan.skip) lines.push(`跳过  ${entry.name}@${entry.version}  ${entry.rel}  ${entry.reason}`);
for (const entry of plan.blocked) lines.push(`拦下  ${entry.name}@${entry.version}  ${entry.rel}  ${entry.reason}`);
lines.push(`publish-plan: 可发 ${plan.publish.length} 个，跳过 ${plan.skip.length} 个，拦下 ${plan.blocked.length} 个`);
if (plan.publish.length === 0 && plan.blocked.length === 0) {
  lines.push('publish-plan: 没有可发的包——先改要发的包 package.json 的 version');
}

const stream = json ? process.stderr : process.stdout;
for (const line of lines) stream.write(`${line}\n`);
if (json) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
process.exit(plan.blocked.length === 0 && plan.publish.length > 0 ? 0 : 1);
