#!/usr/bin/env node
/**
 * preset 随包技能的**真装载**检查：用已装内核里的 `@deepseek-ai/dsh-skill-filesystem`，
 * 以 preset 那一行的参数（`customSkillDirs=[<preset>/skills]`、`includeDefaultRoots: false`、
 * `watch: false`）构造 `FileSystemSkillProvider`，走它自己的 `list()` / `get()`：
 *
 *   - 候选数与 `skills/` 下带 `SKILL.md` 的目录数一致，名字逐个对得上；
 *   - 每个候选的 `source` 都是 `custom`；
 *   - 解析过程零条 `logger.warn`（一条警告就是一个技能被静默丢掉）；
 *   - 逐个 `get()` 都能取到正文，`resourceBase` 指回该技能目录。
 *
 * 这不是第二实例：它只装载内核的 skill provider，不起 Web 服务。没有已装内核的机器（CI）
 * 明说跳过，不把「没跑」当成「通过」。
 *
 * 用法：
 *   node tools/probes/preset-skills.mjs --preset plugin-upgrade-cordis
 *   node tools/probes/preset-skills.mjs --skills presets/plugin-upgrade-cordis/skills
 *   node tools/probes/preset-skills.mjs --skills <目录> --kernel <内核安装树>
 *   node tools/probes/preset-skills.mjs --preset <id> --dsh <内核版本>
 * 退出码：0 通过（含明说跳过），1 不通过，2 跑不起来（缺 skills 目录、内核里没有这个包等）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { currentKernel, repoRoot } from '../lib/repo.mjs';

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
  console.error(`preset-skills: ${message}`);
  process.exit(code);
}

/** 读 SKILL.md 的 frontmatter 里的 name。 */
function frontmatterName(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (block === null) return undefined;
  const line = /^name:\s*(.+)$/m.exec(block[1]);
  return line === null ? undefined : line[1].trim().replace(/^["']|["']$/g, '');
}

const args = parseArgs(process.argv.slice(2));
const root = repoRoot(import.meta.dirname);
const skillsArg = typeof args.skills === 'string' ? args.skills : typeof args.preset === 'string' ? join(root, 'presets', args.preset, 'skills') : undefined;
if (skillsArg === undefined) stop('要一个 --preset <id> 或 --skills <目录>');
const skillsDir = resolve(skillsArg);
if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) stop(`没有 skills 目录：${skillsDir}`);

/** skills/ 下应当被发现的技能：目录看 SKILL.md，平铺的 .md 直接算一个。 */
function expectedSkills() {
  const out = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      const file = join(skillsDir, entry.name, 'SKILL.md');
      if (!existsSync(file)) continue;
      out.push({ dir: entry.name, file, name: frontmatterName(readFileSync(file, 'utf8')) ?? entry.name });
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const file = join(skillsDir, entry.name);
      out.push({ dir: undefined, file, name: frontmatterName(readFileSync(file, 'utf8')) ?? entry.name.replace(/\.md$/, '') });
    }
  }
  return out;
}

const expected = expectedSkills();
if (expected.length === 0) stop(`${skillsDir} 下没有带 SKILL.md 的技能`, 1);

let kernel;
if (typeof args.kernel === 'string') {
  // --kernel 直接给安装树时绕过启动器：只取这个目录。
  const dir = resolve(args.kernel);
  if (!existsSync(join(dir, 'node_modules/.pnpm'))) stop(`--kernel 不是内核安装树：${dir}`);
  kernel = { version: '（指定目录）', dir };
} else {
  try {
    kernel = currentKernel(typeof args.dsh === 'string' ? args.dsh : undefined);
  } catch (error) {
    console.log(`preset-skills: 跳过（${error.message}）——技能发现要本机已装内核，CI 上跑不了`);
    process.exit(0);
  }
}

/** 在内核包仓里找 skill-filesystem 的真实目录。 */
function skillFilesystemDir() {
  const store = join(kernel.dir, 'node_modules/.pnpm');
  for (const entry of readdirSync(store)) {
    if (!entry.startsWith('@deepseek-ai+dsh-skill-filesystem@')) continue;
    const candidate = join(store, entry, 'node_modules/@deepseek-ai/dsh-skill-filesystem');
    if (existsSync(join(candidate, 'lib/index.js'))) return candidate;
  }
  return undefined;
}

const packageDir = skillFilesystemDir();
if (packageDir === undefined) stop(`内核 ${kernel.version} 里找不到 @deepseek-ai/dsh-skill-filesystem`);

const { FileSystemSkillProvider } = await import(pathToFileURL(join(packageDir, 'lib/index.js')).href);

const warnings = [];
const ctx = {
  get: () => undefined,
  logger: {
    warn: (message) => warnings.push(String(message)),
    info: () => {},
    debug: () => {},
    error: (message) => warnings.push(String(message)),
  },
};
const controller = new AbortController();
const provider = new FileSystemSkillProvider(
  ctx,
  { signal: controller.signal, invalidate: () => {} },
  { customSkillDirs: [skillsDir], includeDefaultRoots: false, watch: false },
);

let listed;
try {
  listed = await provider.list({ cwd: root });
} catch (error) {
  await provider.dispose();
  stop(`list() 抛错：${error.message}`, 1);
}
const candidates = Array.isArray(listed) ? listed : listed.candidates;
const complete = Array.isArray(listed) ? true : listed.complete !== false;
const problems = [];
if (!complete) problems.push('list() 报告发现不完整（complete=false）');
if (candidates.length !== expected.length) problems.push(`候选 ${candidates.length} 个，skills/ 下应有 ${expected.length} 个`);
const expectedByName = new Map(expected.map((skill) => [skill.name, skill]));
const seen = new Set();
const lines = [];
for (const candidate of candidates) {
  const claim = expectedByName.get(candidate.name);
  if (claim === undefined) {
    problems.push(`多出候选 ${candidate.name}`);
    continue;
  }
  seen.add(candidate.name);
  if (candidate.source !== 'custom') problems.push(`${candidate.name} 的 source 是 ${candidate.source}，不是 custom`);
  let loaded;
  try {
    loaded = await provider.get(candidate, { signal: controller.signal });
  } catch (error) {
    problems.push(`${candidate.name} 的 get() 抛错：${error.message}`);
    continue;
  }
  if (loaded === undefined) {
    problems.push(`${candidate.name} 的正文加载不到`);
    continue;
  }
  if (typeof loaded.content !== 'string' || loaded.content.length === 0) problems.push(`${candidate.name} 的正文是空的`);
  if (loaded.name !== claim.name) problems.push(`${candidate.name} 的正文 name 是 ${loaded.name}`);
  if (loaded.resourceBase?.kind !== 'directory' || !String(loaded.resourceBase.path).startsWith(skillsDir)) {
    problems.push(`${candidate.name} 的 resourceBase 没指回技能目录（${JSON.stringify(loaded.resourceBase)}）`);
  }
  lines.push(`  ${candidate.name}\tsource=custom\tbody=${loaded.content.length}\t${claim.dir ?? claim.file.slice(skillsDir.length + 1)}`);
}
for (const skill of expected) if (!seen.has(skill.name)) problems.push(`少了 ${skill.name}`);
for (const warning of warnings) problems.push(`logger.warn：${warning}`);

await provider.dispose();
controller.abort();

if (problems.length > 0) {
  console.error(`preset-skills: 不通过（${kernel.version}，${skillsDir}）`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`preset-skills: ok（${candidates.length} 个技能，source=custom，0 条警告，正文全部可加载；内核 ${kernel.version}）`);
for (const line of lines) console.log(line);
process.exit(0);
