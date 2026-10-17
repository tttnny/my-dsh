#!/usr/bin/env node
/**
 * 开发副本（`link:` 软链）的校验与重连。
 *
 * profile 里的自有包一律 `link:` 到本仓库目录——仓库文件就是已安装内容，改完即生效。但市场 /
 * 管理器里的「安装 / 更新」与任何 profile 同步都会按 `package.json` 的 spec 把它物化回 registry
 * 版本、顶掉软链（docs/rules/dev-copy.md「保持软链」）；此后仓库里改的东西就不再生效，而且
 * 表面上什么都没坏。这个工具把那份状态查出来，并一条命令连回去。
 *
 * 顺带查一件静默的事：声明了 `dsh.client` 却没进 profile `dsh.profile.bundles` 的包，客户端
 * 半边永远不会被服务（docs/rules/client-wiring.md）——这里给的是要跑的那条命令。
 *
 * 第二件静默的事是**孤儿软链**：包里归档之后目录搬进 `archive/`，profile 里那条 `link:` 还指着
 * 旧路径。包不在 `plugins/`、`presets/` 里，上面按包清单走的检查看不见它，`pnpm install` 也
 * 不会碰它（它不在 `dependencies` 里了），于是它一直挂到某次手工清理为止。这里逐条扫
 * `node_modules/@lynn123411/` 下的软链，断的报出来并给出删除命令。
 *
 * 用法：
 *   node tools/dev-link.mjs                        # 查全部 profile（只读）
 *   node tools/dev-link.mjs --profile web
 *   node tools/dev-link.mjs --write                # 有问题的重连回仓库
 *   node tools/dev-link.mjs --write --package dsh-model-submenu
 *   node tools/dev-link.mjs --json
 *   node tools/dev-link.mjs --home tmp/host-smoke/home   # 查另一份 DSH 主目录
 * 退出码：0 全部健康（或 --write 之后已健康），1 有问题（含孤儿软链；未写模式），2 跑不起来。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync, unlinkSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { devCopyState, dshHome, listPackages, profiles, repoRoot } from './lib/repo.mjs';

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
const write = args.write === true;
const onlyProfile = typeof args.profile === 'string' ? args.profile : undefined;
const home = typeof args.home === 'string' ? resolve(args.home) : dshHome();
const onlyPackage = typeof args.package === 'string' ? args.package : undefined;

let packages = listPackages(root);
if (onlyPackage !== undefined) {
  packages = packages.filter((entry) => entry.name === onlyPackage || entry.rel === `plugins/${onlyPackage}` || entry.rel === `presets/${onlyPackage}`);
  if (packages.length === 0) {
    console.error(`dev-link: 认不出这个包：${onlyPackage}`);
    process.exit(2);
  }
}
let list = profiles(home);
if (onlyProfile !== undefined) list = list.filter((profile) => profile.name === onlyProfile);
if (list.length === 0) {
  console.error(`dev-link: ${home}/profiles 下没有${onlyProfile === undefined ? '' : ` ${onlyProfile}`} profile`);
  process.exit(2);
}

/** 一个包在一个 profile 里的一条观察。 */
function inspect(profile, entry) {
  const short = entry.name.split('/')[1];
  const declared = profile.pkg.dependencies?.[entry.name];
  const bundles = profile.pkg.dsh?.profile?.bundles ?? [];
  const state = devCopyState(profile.dir, entry.name);
  const problems = [];
  if (declared === undefined && state.state === 'missing') {
    return { profile: profile.name, package: entry.name, state: 'absent', declared, problems };
  }
  if (state.state === 'missing') problems.push(`profile 的 dependencies 里写着 ${declared}，node_modules 里却没有——跑 pnpm install`);
  if (state.state === 'materialized') {
    problems.push(`开发副本被物化成 registry 版本（${state.version ?? '版本不明'}）${declared === undefined ? '' : `，spec 现在是 ${declared}`}——不再跟随仓库`);
  }
  if (state.state === 'dangling') problems.push(`软链断了（${state.target}）——这个 profile 装载时解析不到它`);
  if (state.state === 'link' && state.version !== entry.pkg.version) {
    problems.push(`软链读到的版本 ${state.version} 与仓库 ${entry.pkg.version} 不一致（指到别处了：${state.target}）`);
  }
  if (entry.pkg.dsh?.client !== undefined && declared !== undefined && !bundles.includes(entry.name)) {
    problems.push(`声明了 dsh.client 却不在 dsh.profile.bundles 里——客户端半边不会被服务（见 docs/rules/client-wiring.md）`);
  }
  return { profile: profile.name, package: entry.name, state: state.state, declared, problems, version: state.version };
}

let observations = [];
for (const profile of list) {
  for (const entry of packages) observations.push({ profile, entry, observation: inspect(profile, entry) });
}

// ── --write：把有问题的重连回仓库 ───────────────────────────────────────────
if (write) {
  for (const item of observations) {
    const { profile, entry, observation } = item;
    // 只有「bundle 没登记」这一类不动依赖（那是 dsh plugin add 的事，见下面的提示）。
    if (!observation.problems.some((problem) => !problem.includes('dsh.profile.bundles'))) continue;
    console.log(`dev-link: ${profile.name} ← ${entry.name}（pnpm add link:${entry.rel} --offline）`);
    try {
      execFileSync('pnpm', ['add', `link:${entry.dir}`, '--offline'], {
        cwd: profile.dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      console.error(`dev-link: 重连失败：\n${(error.stdout ?? '') + (error.stderr ?? '')}`);
      process.exitCode = 1;
    }
  }
  observations = observations.map((item) => ({ ...item, observation: inspect(item.profile, item.entry) }));
}

// ── 孤儿软链：包里归档了，profile 里的 link: 还指着它 ─────────────────────────
/** 一个 profile 里指向 `@lynn123411/*` 的软链；断的与指向 `archive/` 的都算孤儿。 */
function orphanLinks(profile) {
  const dir = join(profile.dir, 'node_modules/@lynn123411');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      continue;
    }
    if (!stat.isSymbolicLink()) continue;
    const target = readlinkSync(path);
    if (!existsSync(path)) {
      out.push({ profile: profile.name, package: `@lynn123411/${name}`, path, target, reason: '软链断了（目标不存在）' });
      continue;
    }
    let real;
    try {
      real = realpathSync(path);
    } catch {
      continue;
    }
    if (real.includes(`${sep}archive${sep}`)) {
      out.push({ profile: profile.name, package: `@lynn123411/${name}`, path, target, reason: '指向已归档的目录' });
    }
  }
  return out;
}

let orphans = list.flatMap((profile) => orphanLinks(profile));
if (write) {
  for (const orphan of orphans) {
    try {
      unlinkSync(orphan.path);
      console.log(`dev-link: 删掉孤儿软链 ${orphan.package}（${orphan.reason}）`);
    } catch (error) {
      console.error(`dev-link: 删除孤儿软链失败（${orphan.path}）：${error.message}`);
      process.exitCode = 1;
    }
  }
  orphans = list.flatMap((profile) => orphanLinks(profile));
}

// ── 汇总输出 ────────────────────────────────────────────────────────────────
const withProblems = observations.filter((item) => item.observation.problems.length > 0);
if (args.json === true) {
  console.log(JSON.stringify(observations.map((item) => item.observation), null, 2));
} else {
  const healthy = observations.filter((item) => item.observation.problems.length === 0 && item.observation.state === 'link');
  const absent = observations.filter((item) => item.observation.state === 'absent');
  for (const item of withProblems) {
    const { observation } = item;
    console.error(`dev-link: ${observation.profile} · ${observation.package}（${observation.state}）`);
    for (const problem of observation.problems) console.error(`  ${problem}`);
    if (observation.problems.some((problem) => problem.includes('dsh.profile.bundles'))) {
      console.error(`  要登记 bundle：dsh plugin --profile ${observation.profile} add ${item.entry.dir}`);
    }
    if (observation.state === 'materialized' || observation.state === 'dangling' || observation.state === 'missing') {
      console.error(`  重连：pnpm add "link:${item.entry.dir}" --offline（在 ${resolve(item.profile.dir)} 下）`);
    }
  }
  for (const orphan of orphans) {
    console.error(`dev-link: ${orphan.profile} · ${orphan.package}（孤儿软链：${orphan.reason}）`);
    console.error(`  → ${orphan.target}`);
    console.error(`  删除：rm "${orphan.path}"`);
  }
  console.log(
    `dev-link: 健康软链 ${healthy.length} 个；没装这个包的组合 ${absent.length} 个；有问题 ${withProblems.length} 个`
    + `；孤儿软链 ${orphans.length} 个`,
  );
  for (const item of healthy) {
    console.log(`  ok   ${item.observation.profile} · ${item.observation.package} @${item.observation.version}`);
  }
}

process.exit(withProblems.length > 0 || orphans.length > 0 ? 1 : 0);
