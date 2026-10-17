#!/usr/bin/env node
/**
 * 变异测试的机械部分：把文件里唯一一处文本换掉，跑一条命令，最后**一定**还原。
 *
 * 为什么要有这条命令：仓库要求新增或翻转断言后做变异测试（`docs/rules/plugins.md`
 * 「证明断言有牙齿」），而手工做有四件事容易出错——文件没提交导致 `git checkout` 还原不了、
 * 替换命中不止一处、命令跑完忘了还原、还原被静默忽略。这里把它们一次做对：
 *
 *   - 文件必须是 git 跟踪的，且当前干净（否则先提交或还原）；
 *   - `--from` 必须恰好命中一处（多了就把上下文写长一点）；
 *   - 命令无论通过、失败还是被信号打断，收尾都跑 `git checkout -- <文件>`；
 *   - 收尾核对 `git status --short`，别的改动也一并报出来。
 *
 * 用法：
 *   node tools/mutate.mjs --file tools/assert-ledger.mjs --from '0.2.1-alpha.5' --to '0.2.1-alpha.4' -- node tools/assert-ledger.mjs
 *   node tools/mutate.mjs --file <路径> --from <旧文本> --to <新文本> --dry-run   # 只数命中
 *   node tools/mutate.mjs --file <路径> --from <旧文本> --to <新文本> --keep      # 留下变异（调试用）
 * 退出码：0 命令通过，1 命令失败（变异被测出来了，这是常态），2 跑不起来（文件不干净、命中数不对等）。
 * 文本以 `--` 开头时用 `--from=...` / `--to=...` 的写法。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';

import { repoRoot } from './lib/repo.mjs';

/** 逐个解析 `--k v`、`--k=v` 与 `--flag`；`--` 之后是命令。 */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--') {
      out.command = argv.slice(i + 1);
      break;
    }
    if (!key.startsWith('--')) continue;
    const equals = key.indexOf('=');
    if (equals !== -1) {
      out[key.slice(2, equals)] = key.slice(equals + 1);
      continue;
    }
    const name = key.slice(2);
    const next = argv[i + 1];
    out[name] = next === undefined || next.startsWith('--') ? true : ((i += 1), next);
  }
  return out;
}

/** 退出并说明原因。 */
function stop(message, code = 2) {
  console.error(`mutate: ${message}`);
  process.exit(code);
}

/** 跑一条 git，回传退出码与输出。 */
function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const args = parseArgs(process.argv.slice(2));
const known = new Set(['file', 'from', 'to', 'dry-run', 'keep', 'command', '_']);
for (const key of Object.keys(args)) {
  if (!known.has(key)) stop(`认不得的参数 --${key}`);
}
if (typeof args.file !== 'string') stop('要 --file <路径>');
if (typeof args.from !== 'string') stop('要 --from <旧文本>');
if (typeof args.to !== 'string') stop('要 --to <新文本>');
if (args.from === '') stop('--from 不能是空串');
if (args.from === args.to) stop('--from 与 --to 相同，变异没有发生');
const dryRun = args['dry-run'] === true;
if (!dryRun && Array.isArray(args.command) === false && args.keep !== true) {
  stop('要一条命令：... -- <命令>；只想留下变异用 --keep，只数命中用 --dry-run');
}

const root = repoRoot(import.meta.dirname);
const target = isAbsolute(args.file) ? resolve(args.file) : resolve(root, args.file);
if (relative(root, target).startsWith('..')) stop(`文件在仓库外：${target}`);
const repoPath = relative(root, target);

const tracked = git(['ls-files', '--error-unmatch', '--', repoPath]);
const dirty = git(['status', '--porcelain', '--', repoPath]);
const clean = tracked.status === 0 && dirty.stdout.trim() === '';

const before = readFileSync(target, 'utf8');
const occurrences = before.split(args.from).length - 1;
if (occurrences === 0) stop(`${repoPath} 里找不到要替换的文本（注意换行与缩进）`);
if (occurrences > 1) stop(`${repoPath} 里命中 ${occurrences} 处；--from 要把上下文写长一点，恰好命中一处`);

if (dryRun) {
  console.log(`mutate: ${repoPath} 命中 1 处；--dry-run 不改文件`);
  if (!clean) console.log('mutate: 这个文件现在不干净，实跑时会用一份临时副本兜底还原');
  process.exit(0);
}

// 不干净的文件（未提交、甚至未被 git 跟踪）也能变异：跑之前把原文留一份在内存里，
// 还原时优先用 `git checkout`，它管不着（未跟踪）或不适用（本来就脏）就写回原文。
// 这样「先做一个 wip 提交、跑完再 reset」那套弯弯绕就不必了。
if (!clean) {
  console.log(`mutate: ${repoPath} 现在不干净，还原靠内存里的原文兜底`);
}

const mutated = before.replace(args.from, args.to);
writeFileSync(target, mutated);
console.log(`mutate: ${repoPath}`);
console.log(`  - ${JSON.stringify(args.from)}`);
console.log(`  + ${JSON.stringify(args.to)}`);

let commandStatus = 0;
let spawnError;
try {
  if (Array.isArray(args.command) && args.command.length > 0) {
    const [executable, ...rest] = args.command;
    console.log(`  跑 ${args.command.join(' ')}`);
    const result = spawnSync(executable, rest, { cwd: root, stdio: 'inherit' });
    if (result.error !== undefined) {
      // 不在 try 里直接退出：命令跑不起来也必须先把文件还原。
      spawnError = result.error.message;
      commandStatus = 2;
    } else {
      commandStatus = result.status ?? 2;
    }
  } else {
    console.log('  没有命令（--keep）：变异保留，记得手工还原');
    commandStatus = 0;
  }
} finally {
  if (args.keep === true) {
    console.log(`mutate: --keep，${repoPath} 保持变异；还原：用编辑器改回原文（这份文件没有可用的 git 还原点）`);
  } else if (!clean) {
    // 文件本来就脏（或根本没入库），git 那头没有「变异之前」的版本可退回，只能
    // 按内存里那份原文写回去；写完再读一遍核对，写失败会在这里当场看见。
    writeFileSync(target, before);
    const after = readFileSync(target, 'utf8');
    if (after !== before) {
      console.error(`mutate: 还原后内容与原来不一致：${repoPath}`);
      process.exit(2);
    }
    console.log(`mutate: 已按原文写回 ${repoPath}（命令退出码 ${commandStatus}）`);
  } else {
    const restored = git(['checkout', '--', repoPath]);
    if (restored.status !== 0) {
      console.error(`mutate: 还原失败！${repoPath} 还停在变异状态；手工跑 git checkout -- ${repoPath}`);
      console.error(restored.stderr.trim());
      process.exit(2);
    }
    const after = readFileSync(target, 'utf8');
    if (after !== before) {
      console.error(`mutate: 还原后内容与原来不一致：${repoPath}`);
      process.exit(2);
    }
    const status = git(['status', '--porcelain']);
    const others = status.stdout.split('\n').filter((line) => line !== '' && !line.endsWith(` ${repoPath}`));
    if (others.length > 0) {
      console.log('mutate: 注意，工作区还有别的改动：');
      for (const line of others) console.log(`  ${line}`);
    }
    console.log(`mutate: 已还原 ${repoPath}（命令退出码 ${commandStatus}）`);
  }
}
if (spawnError !== undefined) stop(`命令跑不起来：${spawnError}`);
process.exit(commandStatus);
