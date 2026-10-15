#!/usr/bin/env node
/**
 * 「页面真的换上新产物了吗」的判据（docs/rules/dev-copy.md「生效时机」里那四步手工，合成一条命令）：
 * 构建 → 从运行中实例的首页抄这个插件的 `rev` → 带 `rev` 取回 bundle → 断言新写的类名/文案在里面。
 *
 * 客户端半边的 bundle 按 `rev` 下发并带长期缓存，不带 `rev` 请求会 404；而首页里那段 JSON 把
 * `&rev=` 写成了 `&amp;rev=`，照抄进 curl 就白跑一次。这里把这些坑都封在工具里。
 *
 * 用法：
 *   node tools/verify-client.mjs dsh-a6api --needle 'dsh-a6-sidebar-modal'
 *   node tools/verify-client.mjs @lynn123411/dsh-chat-translate --build --needle '译'
 *   node tools/verify-client.mjs dsh-model-submenu --json
 * 退出码：0 断言通过（没给 --needle 时＝取到了 bundle），1 不通过，2 跑不起来。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { listPackages, repoRoot } from './lib/repo.mjs';

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

const args = parseArgs(process.argv.slice(2));
const root = repoRoot(resolve(join(import.meta.dirname, '..')));
const wanted = args._[0];
if (wanted === undefined) {
  console.error('用法：node tools/verify-client.mjs <包名 | 包目录名> [--needle <文本>] [--build] [--json]');
  process.exit(2);
}

const packages = listPackages(root);
const entry = packages.find((item) => item.name === wanted)
  ?? packages.find((item) => item.rel === wanted)
  ?? packages.find((item) => item.rel === `plugins/${wanted}` || item.rel === `presets/${wanted}`)
  ?? packages.find((item) => item.name.endsWith(`/${wanted}`));
if (entry === undefined) {
  console.error(`verify-client: 认不出这个包：${wanted}`);
  console.error(`  仓库里的包：${packages.map((item) => item.name).join('、')}`);
  process.exit(2);
}
if (entry.pkg.dsh?.client === undefined) {
  console.error(`verify-client: ${entry.name} 没有 dsh.client 声明——它没有浏览器半边，没有 bundle 可取`);
  process.exit(2);
}

const webUrl = typeof args.url === 'string' ? args.url : process.env.DSH_WEB_URL;
const authUrl = typeof args.auth === 'string' ? args.auth : process.env.DSH_WEB_AUTH_URL;
if (webUrl === undefined || authUrl === undefined) {
  console.error('verify-client: 需要 DSH_WEB_URL 与 DSH_WEB_AUTH_URL（在 DSH 会话里跑就有；也可用 --url/--auth 给）');
  process.exit(2);
}

// ── 1. 可选：先构建（改动在 src/ 时，不构建等于验的是旧产物） ─────────────────
if (args.build === true) {
  const scripts = entry.pkg.scripts ?? {};
  if (scripts.build === undefined) {
    console.error(`verify-client: ${entry.name} 没有 build 脚本——手写源码形态的包不用构建`);
    process.exit(2);
  }
  try {
    execFileSync('pnpm', ['run', 'build'], { cwd: entry.dir, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    console.error(`verify-client: 已构建（${entry.name}）`);
  } catch (error) {
    console.error(`verify-client: 构建失败：\n${(error.stdout ?? '') + (error.stderr ?? '')}`);
    process.exit(1);
  }
}

// ── 2. 登录换 cookie，取首页 ────────────────────────────────────────────────
const cookieJar = new Map();
/** 带会话 cookie 请求一次；auth 那次会种下 cookie。 */
async function request(target) {
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
}

const auth = await request(authUrl);
if (auth.status !== 303 && cookieJar.size === 0) {
  console.error(`verify-client: 换 cookie 失败（token 地址答 ${auth.status}）——实例还活着吗？`);
  process.exit(2);
}
const index = await request(new URL('/', webUrl).href);
if (index.status !== 200) {
  console.error(`verify-client: 首页答 ${index.status}`);
  process.exit(2);
}
const html = await index.text();

// ── 3. 从首页抄这个插件的 bundle 地址（含 rev） ─────────────────────────────
const escaped = entry.name.replace('/', '%2F');
const candidates = [...html.matchAll(/plugins\/\?\?[^"'\s]+/g)]
  .map((hit) => hit[0])
  .filter((candidate) => candidate.includes(entry.name) || candidate.includes(escaped))
  .map((candidate) => candidate.replaceAll('&amp;', '&'))
  .sort((a, b) => a.length - b.length);
if (candidates.length === 0) {
  console.error(`verify-client: 首页清单里没有 ${entry.name}——它没挂上（见 docs/rules/client-wiring.md）`);
  process.exit(1);
}
const target = candidates[0];
const rev = /[&?]rev=([^&"'\s]+)/.exec(target)?.[1];
// 同一批里可能还有别的模块；只要这批地址里有它自己的 client.js，就说明这一条是它的入口。
if (!target.includes(`${entry.name}/client.js`) && !target.includes(`${escaped}/client.js`)) {
  console.error(`verify-client: 抄到的地址里没有这个包的 client.js：${target}`);
  process.exit(1);
}

const bundle = await request(new URL(target, webUrl).href);
if (bundle.status !== 200) {
  console.error(`verify-client: bundle 答 ${bundle.status}（rev=${rev ?? '（首页里没写）'}）`);
  process.exit(1);
}
const body = await bundle.text();
const digest = createHash('sha256').update(body).digest('hex').slice(0, 12);

// ── 4. 断言 ────────────────────────────────────────────────────────────────
const needle = typeof args.needle === 'string' ? args.needle : undefined;
const hits = needle === undefined ? undefined : body.split(needle).length - 1;
const report = {
  package: entry.name,
  rev: rev ?? null,
  bytes: Buffer.byteLength(body),
  sha256_12: digest,
  needle: needle ?? null,
  needleHits: hits ?? null,
};

if (args.json === true) console.log(JSON.stringify(report, null, 2));
else console.log(`verify-client: ${entry.name} rev=${rev ?? '（无）'} ${(report.bytes / 1024).toFixed(0)} KB sha256=${digest}`);

if (needle !== undefined && hits === 0) {
  console.error(`verify-client: 新产物没换上——bundle 里没有「${needle}」`);
  console.error('  改了 src/ 就先 pnpm build；已构建还是这样，说明浏览器那侧拿的还是旧 rev（硬刷新 Cmd+Shift+R 再看）。');
  process.exit(1);
}
if (needle !== undefined) {
  console.log(`verify-client: ok（命中「${needle}」${hits} 次）`);
}
process.exit(0);
