#!/usr/bin/env node
/**
 * 界面预览：把**真的**插件组件打进一个独立页面，再用无头浏览器拍图。不碰正在服务的实例。
 *
 * 为什么要它：`tools/gui-shot.mjs` 连的是正在服务的那一个实例，看到一个组件的长相要先有一轮
 * 真的对话把它渲染出来——代价高，而且 `--click` 会改真实会话状态。做界面时才需要看的那一眼，
 * 不该逼你花一次模型调用。
 *
 * 它做三件事：
 *   1. 用包自己装的 esbuild 把组件打成 IIFE；React 走 `nodePaths`，插件的 `.css` 在构建期
 *      读成字符串一起收集；
 *   2. **ui-primitives 用薄壳替身**（`tools/ui-preview/primitives.jsx`）：真包在自己 bundle
 *      里塞了 shiki、simple-icons、katex 等重依赖，本仓库装不下来。替身只顶掉组件本身，
 *      样式仍取它安装副本里的真实 CSS 文件，所以字距、行高、markdown 段落间距都是宿主那一份；
 *   3. 拼一份 HTML（宿主主题变量 + 那些真实样式表 + 预览脚本）落到 `tmp/ui-preview/`，
 *      用本机 Chrome 无头截图。
 *
 * 用法：
 *   node tools/ui-preview.mjs --pkg plugins/dsh-grilling-form \
 *     --entry src/client/GrillingForm.jsx --mount GrillingFormTail \
 *     --props tmp/form-props.json --shot tmp/form.png [--width 900] [--height 1200]
 *
 * `--props` 指向一个 JSON 文件，内容直接成为那个组件的 props（可以是函数占位不了的对象）。
 * 不给 `--shot` 时只产出 HTML 与 bundle，交给别的浏览器去看。
 *
 * 退出码：0 出图，1 构建或截图失败，2 参数或环境不对（没装 Chrome、包缺 esbuild）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { listPackages, repoRoot } from './lib/repo.mjs';

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
 * 找 Chrome：先 playwright 缓存里版本号最大的 Chrome for Testing，再退回系统那两个。
 * @returns {string|undefined} 可执行文件路径。
 */
function findChrome() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    const versions = readdirSyncSafe(cache)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const version of versions) {
      const bin = join(cache, version, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      if (existsSync(bin)) return bin;
    }
  }
  for (const bin of [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]) {
    if (existsSync(bin)) return bin;
  }
  return undefined;
}

/**
 * 读一个目录下的名字；目录不存在时给空数组。
 * @param {string} dir - 目录。
 * @returns {string[]} 名字。
 */
function readdirSyncSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const args = parseArgs(process.argv.slice(2));
const root = repoRoot(join(import.meta.dirname, '..'));

if (typeof args.pkg !== 'string') {
  console.error('ui-preview: 要 --pkg <plugins/dsh-xxx>');
  process.exit(2);
}
const pkg = listPackages(root).find((entry) => entry.rel === String(args.pkg).replace(/\/$/, ''));
if (pkg === undefined) {
  console.error(`ui-preview: 认不得的包 ${args.pkg}`);
  process.exit(2);
}

const entry = join(pkg.dir, String(args.entry ?? 'src/client/index.js'));
if (!existsSync(entry)) {
  console.error(`ui-preview: 入口不存在 ${entry}`);
  process.exit(2);
}

const esbuildPath = join(pkg.dir, 'node_modules', 'esbuild', 'lib', 'main.js');
if (!existsSync(esbuildPath)) {
  console.error(`ui-preview: ${pkg.rel} 没装 esbuild（先在该包目录 pnpm install）`);
  process.exit(2);
}
const { build } = await import(esbuildPath);

const outDir = join(root, 'tmp', 'ui-preview');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

/** 构建期收集到的样式文本。 */
const sheets = [];

/** `.css` → 一个「类名就是类名」的模块对象，同时把样式文本收起来。 */
const cssPlugin = {
  name: 'ui-preview-css',
  setup(ctx) {
    ctx.onResolve({ filter: /\.css$/ }, (arg) => ({
      path: resolve(arg.resolveDir, arg.path),
      namespace: 'ui-preview-css',
    }));
    ctx.onLoad({ filter: /.*/, namespace: 'ui-preview-css' }, (arg) => {
      // `:global(...)` 是 CSS Modules 的写法，浏览器不认；预览里去壳留类名。
      sheets.push(`/* ${arg.path} */\n${readFileSync(arg.path, 'utf8').replace(/:global\(([^)]*)\)/g, '$1')}`);
      return {
        contents: 'export default new Proxy({}, { get: (_t, key) => String(key) });',
        loader: 'js',
      };
    });
  },
};

/** ui-primitives 换成薄壳（真包打不进来，见文件头）。 */
const stubPlugin = {
  name: 'ui-preview-primitives-stub',
  setup(ctx) {
    ctx.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
      path: join(import.meta.dirname, 'ui-preview', 'primitives.jsx'),
    }));
  },
};

// 有 --mount 就现生成一个入口：把那个具名导出渲染进 #root，props 从 JSON 文件读。
// 组件文件旁边的样式表一并 import —— 它会在构建期被读成文本收进 preview.css，
// 于是「看这个组件」不要求它自己恰好 import 了样式。
let buildEntry = entry;
if (typeof args.mount === 'string') {
  // props 可以是 JSON，也可以是一个 `.mjs` 模块（default 导出那个对象）——组件的 props
  // 常常带函数（取词、订阅、动作），JSON 表达不了，所以模块这条路是常用的那条。
  const propsPath = typeof args.props === 'string' ? resolve(root, args.props) : undefined;
  const propsIsModule = propsPath !== undefined && /\.mjs$/.test(propsPath);
  // 模块那条路用静态 import：iife 格式下没有顶层 await 可用。
  const propsImport = propsIsModule
    ? `import propsFromModule from ${JSON.stringify(propsPath)};\n`
    : '';
  const propsSource = propsIsModule
    ? 'propsFromModule'
    : (propsPath === undefined ? '{}' : readFileSync(propsPath, 'utf8'));
  // 同目录、同名的那份 .css（GrillingForm.jsx → GrillingForm.css）存在就带上。
  const siblingCss = entry.replace(/\.jsx?$/, '.css');
  const cssImport = existsSync(siblingCss) ? `import ${JSON.stringify(siblingCss)};\n` : '';
  writeFileSync(join(outDir, 'entry.jsx'), `import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
${cssImport}${propsImport}import { ${String(args.mount)} as Component } from ${JSON.stringify(entry)};

const props = ${propsSource};
createRoot(document.getElementById('root')).render(createElement(Component, props));
`);
  buildEntry = join(outDir, 'entry.jsx');
}

await build({
  entryPoints: [buildEntry],
  outfile: join(outDir, 'preview.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  absWorkingDir: pkg.dir,
  nodePaths: [join(pkg.dir, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [stubPlugin, cssPlugin],
  logLevel: 'warning',
});

/** 宿主那几份真实样式表：主题变量、字号 token，加上本插件用到的那些控件。 */
const dshRoot = process.env.DSH_SOURCE ?? resolve(root, '..', 'other', 'deepseek-harness');
const primitivesRoot = join(pkg.dir, 'node_modules/@deepseek-ai/dsh-client-ui-primitives/lib');
const hostSheets = [
  join(dshRoot, 'packages/client/ui-theme/src/styles/design-platform.css'),
  join(dshRoot, 'packages/client/ui-theme/src/styles/gradient-shadow-text.css'),
  join(primitivesRoot, 'markdown/MarkdownText.module.css'),
  join(primitivesRoot, 'Tag.module.css'),
  join(primitivesRoot, 'Button.module.css'),
].filter((path) => existsSync(path));

const flatten = (text) => text.replace(/:global\(([^)]*)\)/g, '$1');
writeFileSync(join(outDir, 'preview.css'), [
  ...hostSheets.map((path) => `/* ${path} */\n${flatten(readFileSync(path, 'utf8'))}`),
  ...sheets,
].join('\n\n'));

writeFileSync(join(outDir, 'index.html'), `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>ui-preview · ${pkg.rel}</title>
<link rel="stylesheet" href="./preview.css" />
<style>
  html, body { margin: 0; background: var(--dsw-alias-bg-base, #fff); }
  body {
    color: var(--dsw-alias-label-primary, #0f1115);
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 14px;
  }
  /* 对话流那一条的宽度：插件多半长在这么宽的一列里。 */
  #root { max-width: 720px; margin: 0 auto; padding: 40px 24px 80px; }
</style>
</head>
<body>
<div id="root"></div>
<script src="./preview.js"></script>
</body>
</html>
`);

if (typeof args.shot !== 'string') {
  console.log('ui-preview: 出好了 tmp/ui-preview/index.html（没给 --shot，不截图）');
  process.exit(0);
}

const chrome = findChrome();
if (chrome === undefined) {
  console.error('ui-preview: 找不到 Chrome（装 playwright 的 chromium，或装系统 Chrome）');
  process.exit(2);
}

const shotPath = resolve(root, args.shot);
mkdirSync(dirname(shotPath), { recursive: true });
const child = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--window-size=${String(args.width ?? 900)},${String(args.height ?? 1200)}`,
  '--virtual-time-budget=2500',
  `--screenshot=${shotPath}`,
  `file://${join(outDir, 'index.html')}`,
], { stdio: 'ignore' });
const code = await new Promise((done) => child.on('exit', done));
if (code !== 0 || !existsSync(shotPath)) {
  console.error(`ui-preview: 截图失败（Chrome 退出码 ${String(code)}）`);
  process.exit(1);
}
console.log(`ui-preview: ${args.shot}`);
