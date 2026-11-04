/**
 * tools/ 各脚本共用的底座：找仓库根、列出包、读 JSON、找在用内核与 profile。
 *
 * 零依赖，只用 node: 内置模块——仓库根不放 package.json，也不放依赖安装（见 AGENTS.md 第 7 条）。
 * 每个工具都 `node tools/<name>.mjs` 直接跑，不需要任何安装步骤。
 */
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** 仓库根的两个标志物：`.githooks/`（提交闸门）与 `AGENTS.md`（写给 agent 的前门）。 */
const ROOT_MARKERS = ['.githooks', 'AGENTS.md'];

/**
 * 从 start 逐级向上找仓库根。
 * @param {string} [start] - 起点目录，默认当前工作目录。
 * @returns {string} 仓库根的绝对路径。
 */
export function repoRoot(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    if (ROOT_MARKERS.every((marker) => existsSync(join(dir, marker)))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`找不到仓库根：从 ${start} 逐级向上都没有 .githooks 与 AGENTS.md`);
    dir = up;
  }
}

/**
 * 读一份 JSON 文件。
 * @param {string} path - 文件绝对路径。
 * @returns {any} 解析结果。
 */
export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * 按本仓库的版式写回一份 JSON：两格缩进、末尾一个换行。
 * @param {string} path - 文件绝对路径。
 * @param {any} value - 要写出的值。
 * @returns {void}
 */
export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * 列出仓库里的包：`plugins/dsh-<name>/` 与 `presets/<id>/` 两层，带 package.json 的才算。
 * @param {string} root - 仓库根。
 * @returns {Array<{kind: 'plugin'|'preset', rel: string, dir: string, pkgPath: string, name: string, pkg: any}>}
 *   按目录名排序的包清单。
 */
export function listPackages(root) {
  const out = [];
  for (const [kind, top] of [['plugin', 'plugins'], ['preset', 'presets']]) {
    const base = join(root, top);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const dir = join(base, entry.name);
      const pkgPath = join(dir, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = readJson(pkgPath);
      out.push({ kind, rel: `${top}/${entry.name}`, dir, pkgPath, name: pkg.name, pkg });
    }
  }
  return out;
}

/**
 * 读一个包声明的版本范围清单：peerDependencies / devDependencies / dependencies 三处里
 * 以 `@deepseek-ai/` 开头的名字。
 * @param {any} pkg - 包描述。
 * @param {(name: string) => boolean} match - 名字判据。
 * @returns {Array<{field: string, name: string, range: string}>} 逐处声明，按字段顺序。
 */
export function declaredRanges(pkg, match) {
  const out = [];
  for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      if (match(name)) out.push({ field, name, range });
    }
  }
  return out;
}

/** 比较两个 SemVer（预发布段按 `.` 逐段比，数值段比数值、其余按字典序）。 */
export function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v).split('-');
    return { core: core.split('.').map(Number), pre: pre === undefined ? undefined : pre.split('.') };
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff !== 0) return diff;
  }
  // 没有预发布段的版本大于有预发布段的同号版本。
  if (left.pre === undefined || right.pre === undefined) {
    return left.pre === right.pre ? 0 : left.pre === undefined ? 1 : -1;
  }
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
    const l = left.pre[i];
    const r = right.pre[i];
    if (l === r) continue;
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const ln = Number(l);
    const rn = Number(r);
    const bothNumeric = !Number.isNaN(ln) && !Number.isNaN(rn);
    if (bothNumeric && ln !== rn) return ln - rn;
    if (bothNumeric) continue;
    return l < r ? -1 : 1;
  }
  return 0;
}

/** 去掉版本范围上的装饰，只留版本号本身（`~4.0.5-alpha.2` → `4.0.5-alpha.2`）。 */
export function bareVersion(range) {
  return String(range).trim().replace(/^[\^~>=<\s]+/, '');
}

/** 按本仓库的写法组区间：caret 加版本号（`4.0.5-alpha.2` → `^4.0.5-alpha.2`）。 */
export function caretRange(version) {
  return `^${bareVersion(version)}`;
}

/**
 * 启动器目录：DSH 的安装树、已装版本、实例日志都在这儿。
 * @returns {string|undefined} 存在的那一个，找不到返回 undefined。
 */
export function launcherDir() {
  const candidates = [
    process.env.DSH_LAUNCHER_DIR,
    join(homedir(), 'Library/Application Support/in.dsh-plug.dsh-launcher'),
    join(homedir(), '.local/share/in.dsh-plug.dsh-launcher'),
    join(homedir(), '.config/in.dsh-plug.dsh-launcher'),
  ].filter(Boolean);
  return candidates.find((dir) => existsSync(dir));
}

/**
 * 已安装的内核版本，版本号从高到低。
 * @returns {Array<{version: string, dir: string, bin: string, pkg: any}>} 每个已装版本一条。
 */
export function installedKernels() {
  const launcher = launcherDir();
  if (launcher === undefined) return [];
  const versions = join(launcher, 'versions');
  if (!existsSync(versions)) return [];
  const out = [];
  for (const entry of readdirSync(versions, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(versions, entry.name);
    const pkgPath = join(dir, 'node_modules/@deepseek-ai/dsh/package.json');
    if (!existsSync(pkgPath)) continue;
    const pkg = readJson(pkgPath);
    out.push({ version: pkg.version ?? entry.name, dir, bin: join(dir, 'node_modules/.bin/dsh'), pkg });
  }
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

/**
 * 启动器的配置文件：实例、版本与设置都在这里。
 * @returns {any|undefined} 解析结果；没有启动器或读不出来时 undefined。
 */
export function launcherConfig() {
  const launcher = launcherDir();
  if (launcher === undefined) return undefined;
  const path = join(launcher, 'config.json');
  if (!existsSync(path)) return undefined;
  try {
    return readJson(path);
  } catch {
    return undefined;
  }
}

/**
 * 这台机器「在用」的那个内核：先看活动 profile 正在运行的实例，没有再退到最近一次启动的实例。
 * 内核版本以运行中的 DSH 为准（见 docs/rules/plugins.md「版本与依赖」），不是已装的最高版本。
 * @param {string} [profile] - profile 名，默认 `$DSH_PROFILE` 或 `web`。
 * @returns {{version: string, dir: string, bin: string, pkg: any}|undefined} 内核安装树；判断不出来时 undefined。
 */
export function runningKernel(profile = process.env.DSH_PROFILE ?? 'web') {
  const config = launcherConfig();
  if (config === undefined) return undefined;
  const instances = Array.isArray(config.instances) ? config.instances : [];
  const versions = Array.isArray(config.versions) ? config.versions : [];
  const kernels = installedKernels();
  /** 实例 → 它启动的那个内核；版本目录不在本机时按版本号找。 */
  const kernelOf = (instance) => {
    const version = versions.find((entry) => entry.id === instance?.version_id);
    if (version === undefined) return undefined;
    return kernels.find((kernel) => kernel.dir === version.dir)
      ?? kernels.find((kernel) => kernel.version === version.version);
  };
  const live = new Set(runningInstances().filter((instance) => instance.profile === profile).map((instance) => instance.id));
  const running = kernelOf(instances.find((instance) => live.has(instance.id)));
  if (running !== undefined) return running;
  const last = instances.find((instance) => instance.id === config.settings?.last_instance_id);
  if (last !== undefined && (last.last_profile ?? last.default_profile) === profile) return kernelOf(last);
  return undefined;
}

/**
 * 取一个内核：默认取这台机器在用的那个（运行中实例的内核，没有运行实例时取最近启动的实例），
 * 都判断不出来才退到已装的最高版本。
 * @param {string} [version] - 指定版本号时必须已装。
 * @returns {{version: string, dir: string, bin: string, pkg: any}} 内核安装树。
 */
export function currentKernel(version) {
  const kernels = installedKernels();
  if (kernels.length === 0) {
    throw new Error(`找不到已装内核：${launcherDir() ?? '（连启动器目录都没有）'}/versions 下没有 node_modules/@deepseek-ai/dsh`);
  }
  if (version === undefined) return runningKernel() ?? kernels[0];
  const hit = kernels.find((kernel) => kernel.version === version);
  if (hit === undefined) {
    throw new Error(`内核 ${version} 没有安装；已装的是 ${kernels.map((k) => k.version).join('、')}`);
  }
  return hit;
}

/**
 * 内核自己的基线：版本号 + 它依赖的 cordis / schemastery（区间按本仓库写法给 caret）。
 * @param {{version: string, pkg: any}} kernel - 内核安装树。
 * @returns {{dsh: string, cordis: string|undefined, schemastery: string|undefined}} 目标声明。
 */
export function kernelBaselines(kernel) {
  const deps = { ...kernel.pkg.dependencies, ...kernel.pkg.peerDependencies };
  return {
    dsh: kernel.version,
    cordis: deps['@deepseek-ai/cordis'] === undefined ? undefined : caretRange(deps['@deepseek-ai/cordis']),
    schemastery: deps['@deepseek-ai/schemastery'] === undefined ? undefined : caretRange(deps['@deepseek-ai/schemastery']),
  };
}

/**
 * DSH 主目录。
 * @returns {string} `$DSH_HOME`，没设就是 `~/.dsh`。
 */
export function dshHome() {
  return process.env.DSH_HOME === undefined || process.env.DSH_HOME === '' ? join(homedir(), '.dsh') : resolve(process.env.DSH_HOME);
}

/**
 * 内核自带的官方 preset 目录（`@deepseek-ai/dsh-web-app/presets/`）。
 * 自有 preset 的抄本要与这里的同名文件对齐，所以每个 agent 都要找一次这条路径。
 * @param {{dir: string}} kernel - 内核安装树。
 * @returns {string|undefined} 目录路径；这台机器没装 web-app 时返回 undefined。
 */
export function kernelPresetsDir(kernel) {
  const store = join(kernel.dir, 'node_modules/.pnpm');
  if (!existsSync(store)) return undefined;
  for (const entry of readdirSync(store).filter((name) => name.startsWith('@deepseek-ai+dsh-web-app@'))) {
    const dir = join(store, entry, 'node_modules/@deepseek-ai/dsh-web-app/presets');
    if (existsSync(dir)) return dir;
  }
  return undefined;
}

/**
 * 一个 DSH 主目录里的 profile。
 * @param {string} [home] - DSH 主目录，默认 `dshHome()`。
 * @returns {Array<{name: string, dir: string, pkgPath: string, pkg: any}>} 带 package.json 的 profile。
 */
export function profiles(home = dshHome()) {
  const base = join(home, 'profiles');
  if (!existsSync(base)) return [];
  const out = [];
  for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const pkgPath = join(base, entry.name, 'package.json');
    if (!existsSync(pkgPath)) continue;
    out.push({ name: entry.name, dir: join(base, entry.name), pkgPath, pkg: readJson(pkgPath) });
  }
  return out;
}

/**
 * 启动器记着的运行中实例（URL 与实例日志路径）。
 * @returns {Array<{id: string, profile: string, url: string, logPath: string}>} 运行中的实例。
 */
export function runningInstances() {
  const launcher = launcherDir();
  if (launcher === undefined) return [];
  const path = join(launcher, 'running.json');
  if (!existsSync(path)) return [];
  let parsed;
  try {
    parsed = readJson(path);
  } catch {
    return [];
  }
  return Object.entries(parsed).map(([id, entry]) => ({
    id,
    profile: entry.profile,
    url: entry.url,
    logPath: join(launcher, 'logs', `${id}.log`),
  }));
}

/**
 * 一个自有包在某个 profile 里的开发副本状态。
 * @param {string} profileDir - profile 目录。
 * @param {string} name - 包名（`@lynn123411/dsh-x`）。
 * @returns {{state: 'link'|'materialized'|'missing', target?: string, version?: string}} 检查结果：
 *   `link` 是软链（target 是软链原文），`materialized` 是被顶掉的实体副本（version 是那份的版本号），
 *   `missing` 是这个 profile 里没装。
 */
export function devCopyState(profileDir, name) {
  const short = name.split('/')[1];
  const path = join(profileDir, 'node_modules/@lynn123411', short);
  // 这里必须用 lstat：断掉的软链 existsSync 也答 false，会被误报成「没装」。
  let stat;
  try {
    stat = lstatSync(path);
  } catch {
    return { state: 'missing' };
  }
  if (!stat.isSymbolicLink()) {
    let version;
    try {
      version = readJson(join(path, 'package.json')).version;
    } catch {
      version = undefined;
    }
    return { state: 'materialized', version };
  }
  const target = readlinkSync(path);
  let version;
  try {
    version = readJson(join(path, 'package.json')).version;
  } catch {
    return { state: 'dangling', target };
  }
  return { state: 'link', target, version };
}
