#!/usr/bin/env node
/**
 * 一条命令打出这台机器上「跑 DSH」要用到的全部路径与版本：DSH 主目录、profile、已装内核、
 * `dsh` 二进制、内核对齐目标、启动器目录、运行中实例的地址与实例日志。
 *
 * 文档里此前写的是 `<DSH 安装>` 这类占位——每个 agent 都要自己去 Application Support 里翻一遍。
 * 这里把它变成一次查询。
 *
 * 用法：
 *   node tools/dsh-env.mjs                     # 人读的一行一项
 *   node tools/dsh-env.mjs --dsh 0.2.1-alpha.3 # 指定内核版本（默认取已装最高版本）
 *   node tools/dsh-env.mjs --json              # 机器读
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  currentKernel,
  dshHome,
  kernelBaselines,
  launcherDir,
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
const baselines = kernelBaselines(kernel);
const launcher = launcherDir();
const activeProfile = process.env.DSH_PROFILE ?? 'web';
const profile = profiles(home).find((entry) => entry.name === activeProfile);
const running = runningInstances().filter((instance) => instance.profile === activeProfile);

const report = {
  repo: root,
  dshHome: home,
  profile: activeProfile,
  profileDir: profile?.dir ?? join(home, 'profiles', activeProfile),
  profileExists: profile !== undefined,
  kernelVersion: kernel.version,
  kernelDir: kernel.dir,
  kernelPkg: join(kernel.dir, 'node_modules/@deepseek-ai/dsh/package.json'),
  dshBin: kernel.bin,
  dshBinExists: existsSync(kernel.bin),
  baselines,
  launcherDir: launcher ?? null,
  running: running.map((instance) => ({ url: instance.url, log: instance.logPath })),
};

if (args.json === true) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const lines = [
    ['仓库根', report.repo],
    ['DSH_HOME', report.dshHome],
    ['profile', `${report.profile}${report.profileExists ? '' : '（不存在）'} → ${report.profileDir}`],
    ['内核', `${report.kernelVersion}（${report.kernelDir}）`],
    ['dsh 二进制', `${report.dshBin}${report.dshBinExists ? '' : '（不存在）'}`],
    ['内核对齐目标', `engines.dsh >=${report.baselines.dsh} · cordis ${report.baselines.cordis ?? '（内核未声明）'} · schemastery ${report.baselines.schemastery ?? '（内核未声明）'}`],
    ['启动器', report.launcherDir ?? '（找不到）'],
  ];
  for (const instance of report.running) {
    lines.push(['运行中实例', `${instance.url}\n${' '.repeat(16)}实例日志 ${instance.log}`]);
  }
  // 中文按两列宽算，才排得整齐。
  const columns = (text) => [...text].reduce((sum, char) => sum + (char.codePointAt(0) > 0x2e80 ? 2 : 1), 0);
  const width = Math.max(...lines.map(([label]) => columns(label)));
  for (const [label, value] of lines) {
    console.log(`${label}${' '.repeat(width - columns(label))}  ${value}`);
  }
}
