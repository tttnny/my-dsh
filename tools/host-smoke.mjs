#!/usr/bin/env node
/**
 * 宿主半边的装载冒烟：在本机再起一个 DSH 实例，看本仓的包能不能真的挂上去。
 *
 * 宿主半边只在进程启动时装载（见 docs/rules/dev-copy.md「生效时机」），所以「改完到底挂没挂上」
 * 此前只能靠重启正在服务会话的那个 GUI，或者临时现搭第二实例。这里把它做成一条命令：
 *
 *   1. 把当前 DSH_HOME 复制到 tmp/host-smoke/home（不带 sessions / storages / attachments / cache），
 *      并把 profile 里 @lynn123411/* 的软链改写成指向本仓库的绝对路径——那份副本因此不会
 *      反写正在跑的那份 profile；
 *   2. 用 `port: 0` + `printUrl` 的覆盖层起一个实例（不改端口、不开浏览器、不碰启动器）；
 *   3. 登录换 cookie，判四件事：实例起来了、首页 200、启动日志里没有装载异常、
 *      每个声明了 dsh.client 的本仓插件都能从 `/plugins/??<包名>/client.js&rev=…` 取到；
 *   4. 收掉进程。失败时保留 home 与日志，直接给你看现场。
 *
 * 用法：
 *   node tools/host-smoke.mjs                      # 当前 profile（$DSH_PROFILE，默认 web）
 *   node tools/host-smoke.mjs --profile web
 *   node tools/host-smoke.mjs --compose-only       # 只跑 --dump-config（0.1 秒，先排除组合问题）
 *   node tools/host-smoke.mjs --keep               # 跑完保留 home 与日志
 * 退出码：0 装载通过，1 装载不通过，2 跑不起来。
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

import { currentKernel, dshHome, listPackages, repoRoot } from './lib/repo.mjs';

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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

/**
 * 起一个子进程，轮询到退出或等到 marker 出现（或超时）。
 * @param {string[]} argv - 可执行文件与参数。
 * @param {number} timeoutMs - 毫秒上限。
 * @param {(output: string) => string|undefined} [marker] - 每轮拿当前输出调一次，返回非 undefined 即算等到。
 * @returns {Promise<{status: number|null, output: string, marker?: string, timeout: boolean, kill: () => void}>}
 */
async function run(argv, timeoutMs, marker) {
  const child = spawn(argv[0], argv.slice(1), { env: { ...process.env, DSH_HOME: tempHome }, stdio: ['ignore', 'pipe', 'pipe'] });
  const kill = () => {
    try {
      child.kill('SIGTERM');
    } catch {}
  };
  let output = '';
  let matched;
  const onData = (chunk) => {
    output += chunk.toString();
    if (marker !== undefined && matched === undefined) matched = marker(output);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null) return { status: child.exitCode, output, marker: matched, timeout: false, kill };
    if (matched !== undefined) return { status: 0, output, marker: matched, timeout: false, kill };
    if (Date.now() > deadline) {
      kill();
      return { status: null, output, marker: matched, timeout: true, kill };
    }
    await sleep(100);
  }
}

/** 日志末尾若干非空行。 */
const logTail = (text, count) => text.split('\n').filter((line) => line !== '').slice(-count);

const args = parseArgs(process.argv.slice(2));
const root = repoRoot(resolve(join(import.meta.dirname, '..')));
const profile = typeof args.profile === 'string' ? args.profile : process.env.DSH_PROFILE ?? 'web';
const home = dshHome();
const sourceProfile = join(home, 'profiles', profile);
if (!existsSync(sourceProfile)) {
  console.error(`host-smoke: ${sourceProfile} 不存在——先给这个 profile 装一次（dsh plugin --profile ${profile} add …）`);
  process.exit(2);
}

let kernel;
try {
  kernel = currentKernel(typeof args.dsh === 'string' ? args.dsh : undefined);
} catch (error) {
  console.error(`host-smoke: ${error.message}`);
  process.exit(2);
}

const workspace = join(root, 'tmp/host-smoke');
const tempHome = join(workspace, 'home');
const tempProfile = join(tempHome, 'profiles', profile);
const logPath = join(workspace, `${profile}.log`);
const overlayPath = join(workspace, 'overlay.yml');
mkdirSync(workspace, { recursive: true });

// ── 1. 复制一份 home（不碰正在服务的那份） ──────────────────────────────────
const SKIP = new Set(['sessions', 'storages', 'attachments', 'cache', 'bot', '.DS_Store', '.pnpm-store']);
rmSync(tempHome, { recursive: true, force: true });
mkdirSync(tempHome, { recursive: true });
for (const entry of readdirSync(home, { withFileTypes: true })) {
  if (SKIP.has(entry.name)) continue;
  cpSync(join(home, entry.name), join(tempHome, entry.name), { recursive: true, dereference: false, verbatimSymlinks: true });
}

// profile 里的软链是在原地写的相对路径，搬进 tmp 就指丢了——改写成指向本仓库的绝对软链。
const ownPackages = listPackages(root);
const linkDir = join(tempProfile, 'node_modules/@lynn123411');
let relinked = 0;
for (const entry of ownPackages) {
  const path = join(linkDir, entry.name.split('/')[1]);
  // 用 lstat 判存在：复制过来的软链是相对路径，在这里已经是断链，existsSync 会答 false。
  try {
    lstatSync(path);
  } catch {
    continue;
  }
  rmSync(path, { recursive: true, force: true });
  symlinkSync(entry.dir, path, 'dir');
  relinked += 1;
}

writeFileSync(overlayPath, [
  '# tools/host-smoke.mjs 的覆盖层：换端口、不弹浏览器、把地址打出来。只在副本 home 上生效。',
  '- id: webserver',
  '  config:',
  '    host: 127.0.0.1',
  '    port: 0',
  '    compression: gzip',
  '- id: web-runtime',
  '  config:',
  '    openBrowser: false',
  '    printUrl: true',
  '',
].join('\n'));

console.log(`host-smoke: 副本 home ${tempHome.replace(`${root}/`, '')}（软链重指 ${relinked} 个包）`);
console.log(`host-smoke: 内核 ${kernel.version}，profile ${profile}`);

// ── 2. 组合解析：先花 0.1 秒排除「连组合都过不去」 ──────────────────────────
const compose = await run([kernel.bin, '--profile', profile, '--dump-config'], 60_000);
if (compose.status !== 0) {
  console.error('host-smoke: --dump-config 没通过，装载无从谈起');
  for (const line of logTail(compose.output, 20)) console.error(`  ${line}`);
  process.exit(1);
}
const missingBundles = [...compose.output.matchAll(/skipping profile bundle "([^"]+)"/g)]
  .map((match) => match[1])
  .filter((name) => name.startsWith('@lynn123411/'));
if (missingBundles.length > 0) {
  console.error(`host-smoke: 组合阶段就有本仓 bundle 解析不到：${missingBundles.join('、')}`);
  console.error('  node tools/dev-link.mjs 看开发副本状态');
  process.exit(1);
}
console.log('host-smoke: 组合解析通过（本仓 bundle 全部解析到）');
if (args['compose-only'] === true) {
  rmSync(tempHome, { recursive: true, force: true });
  process.exit(0);
}

// ── 3. 起实例 ──────────────────────────────────────────────────────────────
const boot = await run([kernel.bin, '--profile', profile, '--patch', overlayPath], 90_000, (output) => {
  writeFileSync(logPath, output);
  return /dsh web: (http\S+)/.exec(output)?.[1];
});

const url = boot.marker;
if (url === undefined) {
  console.error('host-smoke: 90 秒内没有打出实例地址——装载失败。日志末尾：');
  for (const line of logTail(boot.output, 30)) console.error(`  ${line}`);
  console.error(`  完整日志 ${logPath.replace(`${root}/`, '')}`);
  boot.kill();
  process.exit(1);
}
console.log(`host-smoke: 实例起来了 ${url.split('?')[0]}`);

// ── 4. 判据 ────────────────────────────────────────────────────────────────
const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail === '' ? '' : `（${detail}）`}`);
  if (!ok) failures.push(label);
};

const cookieJar = new Map();
const request = async (target) => {
  const response = await fetch(target, {
    redirect: 'manual',
    headers: cookieJar.size === 0 ? {} : { cookie: [...cookieJar].map(([k, v]) => `${k}=${v}`).join('; ') },
  });
  for (const cookie of response.headers.getSetCookie?.() ?? []) {
    const [pair] = cookie.split(';');
    const at = pair.indexOf('=');
    cookieJar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return response;
};

try {
  const auth = await request(url);
  check('token 地址答 303 并种下会话 cookie', auth.status === 303, `HTTP ${auth.status}`);
  const index = await request(new URL('/', url).href);
  check('首页 200', index.status === 200, `HTTP ${index.status}`);
  const html = await index.text();

  for (const entry of ownPackages.filter((item) => item.pkg.dsh?.client !== undefined)) {
    const escaped = entry.name.replace('/', '%2F');
    const match = [...html.matchAll(/plugins\/\?\?[^"'\s]+/g)]
      .map((hit) => hit[0])
      .find((candidate) => candidate.includes(entry.name) || candidate.includes(escaped));
    if (match === undefined) {
      check(`${entry.name} 的客户端 bundle 在首页清单里`, false, '首页没有它的行');
      continue;
    }
    // 首页把 JSON 嵌在 <script> 里，`&rev=` 写成了 `&amp;rev=`；带半截实体去请求就是 404。
    const bundle = await request(new URL(match.replaceAll('&amp;', '&'), url).href);
    const body = await bundle.text();
    check(`${entry.name} 的客户端 bundle 取得到`, bundle.status === 200 && body.length > 0, `HTTP ${bundle.status}，${body.length} 字节`);
  }

  // 加载期异常：这几条是宿主日志里装载失败的长相（见 docs/rules/client-wiring.md、dev-copy.md）。
  const patterns = [
    /Cannot find package/,
    /plugin tree failed to load/,
    /failed to import loader entry/,
    /never started/,
    /skipping profile bundle "@lynn123411\//,
  ];
  const bad = boot.output.split('\n').filter((line) => patterns.some((pattern) => pattern.test(line)));
  check('启动日志里没有装载异常', bad.length === 0, bad.length === 0 ? '' : bad[0].slice(0, 120));
} catch (error) {
  check('探针跑完', false, error.message);
}

boot.kill();
console.log(`host-smoke: 日志 ${logPath.replace(`${root}/`, '')}`);
if (failures.length > 0) {
  console.error(`host-smoke: FAIL（${failures.length}）——副本 home 与日志都留着看现场`);
  process.exit(1);
}
if (args.keep !== true) rmSync(tempHome, { recursive: true, force: true });
console.log('host-smoke: PASS');
process.exit(0);
