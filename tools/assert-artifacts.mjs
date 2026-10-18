/**
 * 构建产物新鲜度门禁：`lib/` 是 `src/` 的镜像，读 `lib/` 的自检必须在它比 `src/` 新的时候才跑。
 *
 * 为什么要有这一条：一个包里往往一半脚本打 `src/`、另一半打构建产物 `lib/`。改完 `src/` 只跑
 * 「读 lib 的那个」脚本，测的是上一轮的产物——它会报一条看起来像代码写错的失败，或者（更糟）
 * 一路绿灯，而真正要验的东西根本没被加载。这条规矩原来只写在 docs/rules/plugins.md「证明断言
 * 有牙齿」里靠人记，这里把它变成能判定的状态。
 *
 * 「手写 lib」的包不受这条约束：`lib/` 本身是源码、跟着 git 走（`dsh-web-auth-url` 就是），
 * 它没有 `src/` 可对应，判据是「`src/` 存在且 `lib/` 未被 git 跟踪」。
 *
 * 用法：node tools/assert-artifacts.mjs [--json]
 * 退出码：0 全部新鲜（或这个包没有产物目录），1 有陈旧产物，2 跑不起来。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { listPackages, repoRoot } from './lib/repo.mjs';

/** 产物目录名。本仓各包统一用 `lib/`。 */
const ARTIFACT_DIR = 'lib';
/** 产物对应的源码目录名。 */
const SOURCE_DIR = 'src';

/** 逐个解析 `--flag`。 */
function parseArgs(argv) {
  const out = {};
  for (const key of argv) {
    if (key.startsWith('--')) out[key.slice(2)] = true;
  }
  return out;
}

/**
 * 一个目录树里最新一个文件的修改时间。
 * @param {string} dir - 目录绝对路径。
 * @returns {number} 毫秒时间戳；目录不存在或空目录时 0。
 */
function newestMtime(dir) {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestMtime(path));
      continue;
    }
    newest = Math.max(newest, statSync(path).mtimeMs);
  }
  return newest;
}

/**
 * 一个目录树里最新的一个文件。
 * @param {string} dir - 目录绝对路径。
 * @returns {{ path: string, mtime: number }} 最新那个文件；目录不存在时给空路径与 0。
 */
function newestFile(dir) {
  let best = { path: '', mtime: 0 };
  if (!existsSync(dir)) return best;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = newestFile(path);
      if (nested.mtime > best.mtime) best = nested;
      continue;
    }
    const mtime = statSync(path).mtimeMs;
    if (mtime > best.mtime) best = { path, mtime };
  }
  return best;
}

/**
 * 这个包的 `lib/` 有没有被 git 跟踪（那就是手写源码，不是产物）。
 * @param {string} dir - 包目录绝对路径。
 * @returns {boolean} `lib/` 下有被跟踪的文件时为 true。
 */
function libIsTracked(dir) {
  try {
    const out = execFileSync('git', ['ls-files', ARTIFACT_DIR], { cwd: dir, encoding: 'utf8' });
    return out.trim() !== '';
  } catch {
    // 不是 git 仓库（极少见）：按产物处理，宁严勿松。
    return false;
  }
}

const args = parseArgs(process.argv.slice(2));
const root = repoRoot(join(import.meta.dirname, '..'));
const findings = [];

for (const entry of listPackages(root)) {
  const artifactDir = join(entry.dir, ARTIFACT_DIR);
  const sourceDir = join(entry.dir, SOURCE_DIR);
  if (!existsSync(artifactDir) || !existsSync(sourceDir)) continue;
  if (libIsTracked(entry.dir)) continue;

  const newestSource = newestFile(sourceDir);
  const newestArtifact = newestFile(artifactDir);
  if (newestArtifact.mtime === 0) {
    findings.push({
      package: entry.name,
      file: relative(root, artifactDir),
      message: `${ARTIFACT_DIR}/ 是空的：先跑 pnpm build，读产物的自检没有东西可加载`,
    });
    continue;
  }
  if (newestSource.mtime > newestArtifact.mtime) {
    findings.push({
      package: entry.name,
      file: relative(root, newestSource.path),
      message: `比 ${relative(root, newestArtifact.path)} 新：${ARTIFACT_DIR}/ 是上一轮的镜像，先跑 pnpm build 再跑读产物的自检`,
    });
  }
}

if (args.json === true) {
  console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
} else if (findings.length > 0) {
  console.error('assert-artifacts: 构建产物比源码旧（读 lib/ 的自检会测到上一轮的东西）：');
  for (const finding of findings) console.error(`  ${finding.file}\n    ${finding.message}`);
  console.error('\n修法：在包目录里跑 pnpm build（或 pnpm check，它会先构建）。');
} else {
  console.log('assert-artifacts: ok（有产物目录的包都是最新的）');
}

process.exit(findings.length === 0 ? 0 : 1);
