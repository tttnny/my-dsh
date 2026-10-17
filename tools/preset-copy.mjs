#!/usr/bin/env node
/**
 * 抄本（抄自官方 `@deepseek-ai/dsh-web-app/presets/<官方 id>.patch.yml` 的 preset patch）
 * 的三件事，一条命令：
 *
 *   --diff           抄本与已装官方文件的差异（归一规则见 `tools/lib/preset-copies.json`）
 *   --official-diff  两版官方之间动了哪几行（按源码 checkout 的 `dsh-v<版本>` tag 取）
 *   --recopy         把官方这一版的改动三方合并进抄本，保留三处自定义（顶部注释、行 id /
 *                    显示名 / order、skill-filesystem 的 custom root）
 *   --variables      抄本里的 `{{变量}}` 是否都还登记在这一版内核的 agent-loop 里
 *
 * 基线的版本号读抄本顶部那行 `# from dsh <版本>`；升级后它还是上一版，正好当三方合并的
 * base。没有已装内核时 `--diff` 与 `--variables` 明说跳过（CI 上就是这种），不把「没跑」
 * 当成「通过」。
 *
 * 用法：
 *   node tools/preset-copy.mjs <id> [--diff]            # 默认
 *   node tools/preset-copy.mjs <id> --official-diff [--from <版本>] [--to <版本>]
 *   node tools/preset-copy.mjs <id> --recopy [--from <版本>] [--to <版本>]
 *   node tools/preset-copy.mjs <id> --variables [--dsh <版本>]
 * 退出码：0 通过 / 没有差异，1 有差异 / 合并冲突，2 跑不起来（没登记、没有源码 tag 等）。
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { dshSourceDir, readOfficialPreset, sourceTag, sourceTags } from './lib/dsh-source.mjs';
import { allDifferences, loadCopies, normalize } from './lib/preset-copies.mjs';
import { currentKernel, kernelPresetsDir, repoRoot } from './lib/repo.mjs';

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

/** 退出并说明原因。 */
function stop(message, code = 2) {
  console.error(`preset-copy: ${message}`);
  process.exit(code);
}

/** 是否存在且是目录。 */
function isDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** 抄本顶部记的基线版本（`# from dsh <版本>`）。 */
function baselineVersion(text) {
  return /^#\s*from\s+dsh\s+(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)/m.exec(text)?.[1];
}

const args = parseArgs(process.argv.slice(2));
const known = new Set(['diff', 'official-diff', 'recopy', 'variables', 'from', 'to', 'dsh']);
for (const key of Object.keys(args)) {
  if (key !== '_' && !known.has(key)) stop(`认不得的参数 --${key}`);
}
const modes = ['diff', 'official-diff', 'recopy', 'variables'].filter((mode) => args[mode] === true);
if (modes.length > 1) stop(`一次只做一件事：${modes.map((mode) => `--${mode}`).join(' 与 ')}`);
const mode = modes[0] ?? 'diff';
const id = args._[0];
const root = repoRoot(import.meta.dirname);
const registry = loadCopies(root);

if (id === undefined) {
  const ids = registry.copies.map((copy) => copy.id);
  stop(`要一个 preset id；已登记：${ids.join('、') || '（一个都没有）'}`);
}
const copy = registry.copies.find((entry) => entry.id === id);
if (copy === undefined) stop(`${id} 没在 ${registry.path} 里登记`);
if (copy.official === null) stop(`${id} 登记为自写 preset（official: null），没有官方抄本可比`);
const copyPath = join(root, 'presets', id, `${id}.patch.yml`);
if (!existsSync(copyPath)) stop(`缺 ${copyPath.slice(root.length + 1)}`);
const copyText = readFileSync(copyPath, 'utf8');

/** 已装内核；这台机器没有就返回 undefined。 */
let kernelCache;
function kernel() {
  if (kernelCache !== undefined) return kernelCache.value;
  try {
    kernelCache = { value: currentKernel(typeof args.dsh === 'string' ? args.dsh : undefined) };
  } catch {
    kernelCache = { value: undefined };
  }
  return kernelCache.value;
}

/** 已装官方 preset 文件；没有内核或内核里没有 web-app 时返回 undefined。 */
function installedOfficial() {
  const installed = kernel();
  if (installed === undefined) return undefined;
  const dir = kernelPresetsDir(installed);
  return dir === undefined ? undefined : join(dir, `${copy.official}.patch.yml`);
}

// ── 抄本与已装官方 ────────────────────────────────────────────────────────────
if (mode === 'diff') {
  const officialPath = installedOfficial();
  if (officialPath === undefined || !existsSync(officialPath)) {
    console.log('preset-copy: 跳过（这台机器没有已装内核或内核里没有官方 preset）——比对对象就在内核里；看两版官方之间的差异用 --official-diff');
    process.exit(0);
  }
  const official = normalize(readFileSync(officialPath, 'utf8'), copy, false);
  const local = normalize(copyText, copy, true);
  const differences = allDifferences(official, local);
  if (differences.length === 0) {
    console.log(`preset-copy: ok（${id} 归一后与已装 ${kernel().version} 的官方 ${copy.official}.patch.yml 一致）`);
    process.exit(0);
  }
  console.error(`preset-copy: ${id} 与已装 ${kernel().version} 的官方 ${copy.official}.patch.yml 有 ${differences.length} 处不一致（归一后）`);
  for (const diff of differences) {
    console.error(`  presets/${id}/${id}.patch.yml 归一后第 ${diff.line} 行`);
    console.error(`    官方：${diff.expected}`);
    console.error(`    抄本：${diff.actual}`);
  }
  console.error('  官方动了就重抄：node tools/preset-copy.mjs ' + id + ' --recopy');
  process.exit(1);
}

// ── 两版官方之间 ──────────────────────────────────────────────────────────────
if (mode === 'official-diff') {
  const source = dshSourceDir(root);
  if (source === undefined) stop('找不到 DSH 源码 checkout；用 DSH_SOURCE 指定');
  const from = typeof args.from === 'string' ? args.from : baselineVersion(copyText);
  if (from === undefined) stop('读不到抄本顶部的 "# from dsh <版本>"；用 --from <版本> 指定基线');
  const to = typeof args.to === 'string' ? args.to : kernel()?.version;
  if (to === undefined) stop('没给 --to，也读不到已装内核');
  if (from === to) {
    console.log(`preset-copy: 抄本已经与 ${to} 对齐，没有版本间差异可看（--from/--to 可以是同一个版本）`);
    process.exit(0);
  }
  const tags = sourceTags(source);
  const missing = [sourceTag(from), sourceTag(to)].filter((tag) => !tags.includes(tag));
  if (missing.length > 0) stop(`源码 checkout 里没有 tag ${missing.join('、')}；最近的发布 tag：${tags.slice(0, 6).join('、') || '（一个都没有）'}`);
  const before = readOfficialPreset(source, sourceTag(from), copy.official);
  const after = readOfficialPreset(source, sourceTag(to), copy.official);
  if (before === undefined || after === undefined) {
    stop(`源码 tag 里没有 packages/bundle/web-app/presets/${copy.official}.patch.yml`);
  }
  if (before === after) {
    console.log(`preset-copy: 官方 ${copy.official}.patch.yml 在 ${from} → ${to} 之间一字未动`);
    process.exit(0);
  }
  const tempDir = join(root, 'tmp/preset-copy');
  mkdirSync(tempDir, { recursive: true });
  const beforePath = join(tempDir, `${copy.official}-${from}.patch.yml`);
  const afterPath = join(tempDir, `${copy.official}-${to}.patch.yml`);
  writeFileSync(beforePath, before);
  writeFileSync(afterPath, after);
  console.log(`preset-copy: 官方 ${copy.official}.patch.yml ${from} → ${to}`);
  const result = spawnSync('git', ['diff', '--no-index', '--no-color', '--unified=4', '--', beforePath.slice(tempDir.length + 1), afterPath.slice(tempDir.length + 1)], {
    cwd: tempDir,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0 && result.status !== 1) stop(`git diff 失败：${result.stderr.trim()}`);
  process.stdout.write(result.stdout);
  process.exit(0);
}

// ── 三方合并重抄 ──────────────────────────────────────────────────────────────
if (mode === 'recopy') {
  const source = dshSourceDir(root);
  if (source === undefined) stop('找不到 DSH 源码 checkout；用 DSH_SOURCE 指定');
  const from = typeof args.from === 'string' ? args.from : baselineVersion(copyText);
  if (from === undefined) stop('读不到抄本顶部的 "# from dsh <版本>"；用 --from <版本> 指定基线');
  const to = typeof args.to === 'string' ? args.to : kernel()?.version;
  if (to === undefined) stop('没给 --to，也读不到已装内核');
  if (from === to) {
    console.log(`preset-copy: 抄本基线已经是 ${to}，不用重抄`);
    process.exit(0);
  }
  const tags = sourceTags(source);
  const missing = [sourceTag(from), sourceTag(to)].filter((tag) => !tags.includes(tag));
  if (missing.length > 0) stop(`源码 checkout 里没有 tag ${missing.join('、')}；最近的发布 tag：${tags.slice(0, 6).join('、') || '（一个都没有）'}`);
  const before = readOfficialPreset(source, sourceTag(from), copy.official);
  const after = readOfficialPreset(source, sourceTag(to), copy.official);
  if (before === undefined || after === undefined) {
    stop(`源码 tag 里没有 packages/bundle/web-app/presets/${copy.official}.patch.yml`);
  }
  const tempDir = join(root, 'tmp/preset-copy');
  mkdirSync(tempDir, { recursive: true });
  const beforePath = join(tempDir, `${copy.official}-${from}.patch.yml`);
  const afterPath = join(tempDir, `${copy.official}-${to}.patch.yml`);
  writeFileSync(beforePath, before);
  writeFileSync(afterPath, after);
  const result = spawnSync(
    'git',
    ['merge-file', '-p', '-L', `抄本（${id}）`, '-L', `${from} 官方`, '-L', `${to} 官方`, copyPath, beforePath, afterPath],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (result.status === 0) {
    let merged = result.stdout;
    const header = `# from dsh ${from}`;
    if (merged.includes(header)) merged = merged.replace(header, `# from dsh ${to}`);
    else console.log(`preset-copy: 抄本顶部没有 "${header}"，版本标注要手工跟到 ${to}`);
    writeFileSync(copyPath, merged);
    console.log(`preset-copy: 已重抄 ${id}（官方 ${from} → ${to}）；核对三处自定义：顶部注释、行 id / 显示名 / order、skill-filesystem 的 custom root`);
    console.log(`  接着跑 node tools/preset-copy.mjs ${id} --diff 与 node tools/preset-copy.mjs ${id} --variables`);
    process.exit(0);
  }
  if (result.status === 1) {
    const conflictPath = join(tempDir, 'conflict.yml');
    writeFileSync(conflictPath, result.stdout);
    console.error(`preset-copy: 三方合并有冲突，没有写回；合并结果在 ${conflictPath.slice(root.length + 1)}`);
    console.error('  按冲突标记改好后手工写回，或改完重跑 --recopy');
    process.exit(1);
  }
  stop(`git merge-file 失败：${result.stderr.trim()}`);
}

// ── 提示词变量 ────────────────────────────────────────────────────────────────
if (mode === 'variables') {
  const installed = kernel();
  if (installed === undefined) {
    console.log('preset-copy: 跳过（这台机器没有已装内核）——变量的注册表在 agent-loop 里');
    process.exit(0);
  }
  const store = join(installed.dir, 'node_modules/.pnpm');
  if (!isDirectory(store)) stop(`内核包里没有 ${store}`);
  let loopDir;
  for (const entry of readdirSync(store)) {
    if (!entry.startsWith('@deepseek-ai+dsh-agent-loop@')) continue;
    const candidate = join(store, entry, 'node_modules/@deepseek-ai/dsh-agent-loop');
    if (isDirectory(candidate)) {
      loopDir = candidate;
      break;
    }
  }
  if (loopDir === undefined || !existsSync(join(loopDir, 'lib/index.js'))) {
    stop(`内核 ${installed.version} 里找不到 @deepseek-ai/dsh-agent-loop 的实现`);
  }
  const implementation = readFileSync(join(loopDir, 'lib/index.js'), 'utf8');
  const registered = new Set([...implementation.matchAll(/variable\(\s*["']([^"']+)["']/g)].map((match) => match[1]));
  const used = new Set([...copyText.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)].map((match) => match[1]));
  const unknown = [...used].filter((name) => !registered.has(name));
  if (unknown.length > 0) {
    console.error(`preset-copy: ${id} 用了这一版内核没注册的提示词变量：${unknown.join('、')}`);
    console.error(`  ${installed.version} 的 agent-loop 注册的是：${[...registered].join('、') || '（一个都没有）'}`);
    console.error('  变量严格解析：引用了不存在的变量，每次请求都抛 unknown prompt variable，而 preset 照样可选');
    process.exit(1);
  }
  console.log(`preset-copy: ok（提示词变量 ${[...used].join('、') || '（没有）'} 都在 ${installed.version} 的 agent-loop 注册表里）`);
  process.exit(0);
}
