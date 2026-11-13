#!/usr/bin/env node
/**
 * 一条命令打出这台机器上「跑 DSH」要用到的全部路径与版本：DSH 主目录、profile、在用的内核
 * 与已装清单、`dsh` 二进制、内核对齐目标、启动器目录、运行中实例的地址与实例日志，以及 DSH
 * 源码 checkout（内核升版时按它的 `dsh-v<版本>` tag 比两版之间的差异）。
 *
 * 文档里此前写的是 `<DSH 安装>` 这类占位——每个 agent 都要自己去 Application Support 里翻一遍。
 * 这里把它变成一次查询。
 *
 * 用法：
 *   node tools/dsh-env.mjs            # 人读的一行一项
 *   node tools/dsh-env.mjs --dsh <版本> # 指定内核版本（默认取运行中实例的内核）
 *   node tools/dsh-env.mjs --json     # 机器读
 */
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { dshSourceDir } from './lib/dsh-source.mjs';
import {
  currentKernel,
  devCopyState,
  dshHome,
  installedKernels,
  kernelBaselines,
  kernelPresetsDir,
  launcherDir,
  listPackages,
  profiles,
  repoRoot,
  runningInstances,
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

const args = parseArgs(process.argv.slice(2));
const root = repoRoot(resolve(join(import.meta.dirname, '..')));
const home = dshHome();
const kernel = currentKernel(typeof args.dsh === 'string' ? args.dsh : process.env.DSH_KERNEL_VERSION);
const installed = installedKernels();
const baselines = kernelBaselines(kernel);
const launcher = launcherDir();
const activeProfile = process.env.DSH_PROFILE ?? 'web';
const profile = profiles(home).find((entry) => entry.name === activeProfile);
const running = runningInstances().filter((instance) => instance.profile === activeProfile);
const sourceDir = dshSourceDir(root);

/** 目录树里最新的修改时间；目录不存在时回 0。 */
function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs);
  }
  return newest;
}

/**
 * 开发副本里比实例启动更新的产物。
 *
 * 宿主半边在进程里，改 `lib/` 之后要触发一次 profile 重新组合才换上新代码；客户端半边刷新页面就生效。
 * 这里只回答「有没有比实例新的产物」，不判断该不该重启——见 docs/rules/dev-copy.md「生效时机」。
 */
function stalePackages(instance) {
  if (instance.startedAt === undefined || profile === undefined) return [];
  return listPackages(root)
    .filter((entry) => devCopyState(profile.dir, entry.name).state === 'link')
    .filter((entry) => {
      const lib = join(entry.dir, 'lib');
      return existsSync(lib) && newestMtime(lib) > instance.startedAt;
    })
    .map((entry) => entry.rel);
}

const report = {
  repo: root,
  dshHome: home,
  profile: activeProfile,
  profileDir: profile?.dir ?? join(home, 'profiles', activeProfile),
  profileExists: profile !== undefined,
  kernelVersion: kernel.version,
  kernelDir: kernel.dir,
  installedKernels: installed.map((entry) => entry.version),
  kernelPkg: join(kernel.dir, 'node_modules/@deepseek-ai/dsh/package.json'),
  kernelReal: realpathSync(join(kernel.dir, 'node_modules/@deepseek-ai/dsh')),
  kernelStore: join(kernel.dir, 'node_modules/.pnpm'),
  kernelPresetsDir: kernelPresetsDir(kernel) ?? null,
  dshBin: kernel.bin,
  dshBinExists: existsSync(kernel.bin),
  baselines,
  launcherDir: launcher ?? null,
  sourceDir: sourceDir ?? null,
  running: running.map((instance) => ({
    url: instance.url,
    log: instance.logPath,
    startedAt: instance.startedAt ?? null,
    stale: stalePackages(instance),
  })),
};

if (args.json === true) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const lines = [
    ['仓库根', report.repo],
    ['DSH_HOME', report.dshHome],
    ['profile', `${report.profile}${report.profileExists ? '' : '（不存在）'} → ${report.profileDir}`],
    ['内核', `${report.kernelVersion}（${report.kernelDir}）`],
    ['已装内核', report.installedKernels.map((version) => (version === report.kernelVersion ? `${version} ← 在用` : version)).join('、')],
    ['内核实现', report.kernelReal],
    ['内核包仓', report.kernelStore],
    ['官方 preset', report.kernelPresetsDir ?? '（这台机器没装 @deepseek-ai/dsh-web-app）'],
    ['dsh 二进制', `${report.dshBin}${report.dshBinExists ? '' : '（不存在）'}`],
    ['内核对齐目标', `engines.dsh >=${report.baselines.dsh} · cordis ${report.baselines.cordis ?? '（内核未声明）'} · schemastery ${report.baselines.schemastery ?? '（内核未声明）'}`],
    ['启动器', report.launcherDir ?? '（找不到）'],
    ['DSH 源码', report.sourceDir ?? '（找不到：默认找仓库同级的 ../other/deepseek-harness，或设 DSH_SOURCE）'],
  ];
  for (const instance of report.running) {
    lines.push(['运行中实例', `${instance.url}\n${' '.repeat(16)}实例日志 ${instance.log}`]);
    if (instance.stale.length > 0) {
      lines.push(['实例产物', `${instance.stale.length} 个包的 lib/ 比实例启动新（宿主半边要重新组合才生效，见 docs/rules/dev-copy.md「生效时机」）`]);
    }
  }
  // 中文按两列宽算，才排得整齐。
  const columns = (text) => [...text].reduce((sum, char) => sum + (char.codePointAt(0) > 0x2e80 ? 2 : 1), 0);
  const width = Math.max(...lines.map(([label]) => columns(label)));
  for (const [label, value] of lines) {
    console.log(`${label}${' '.repeat(width - columns(label))}  ${value}`);
  }
}
