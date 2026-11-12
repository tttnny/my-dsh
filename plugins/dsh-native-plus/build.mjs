// 两半边的构建：宿主半边 lib/index.js（ESM，内核包留 external），
// 客户端半边 lib/client.js（浏览器 CJS，React 与宿主模块走 Web shell 的模块表）。
//
// 客户端 bundle 必须自注册成一个 factory（window.__ModuleLoader__.load）并自成一个文件：
// 浏览器侧的 require 只认平台种子表、boot graph 行与已注册的 factory，包内相对 require
// 不在其中，所以相对导入必须在构建期就被内联进来。详见 docs/rules/dev-copy.md。

import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const pkgName = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name;

// Web shell 播种的平台模块表（@deepseek-ai/dsh-web-frontend 的 staticModules）。
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-locale',
];

// 宿主半边由 DSH 进程按 realpath 路由供给的内核包，inline 进来会造出第二份 registry。
const KERNEL_MODULES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/schemastery',
  '@deepseek-ai/dsh-tools',
];

/** 样式表按文本内联：`?inline` 后缀让 esbuild 把文件内容当字符串模块交给 import。 */
const inlineCss = {
  name: 'dsh-inline-css',
  setup(build) {
    build.onResolve({ filter: /\?inline$/ }, (args) => ({
      path: fileURLToPath(new URL(args.path.replace(/\?inline$/, ''), pathToFileURL(args.importer))),
      namespace: 'inline-css',
    }));
    build.onLoad({ filter: /.*/, namespace: 'inline-css' }, (args) => ({
      contents: readFileSync(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

/** 客户端 bundle 的纯净度门禁：任何非平台模块的 @deepseek-ai/* 请求当场失败。 */
const clientPurity = {
  name: 'dsh-client-bundle-purity',
  setup(build) {
    build.onResolve({ filter: /^@deepseek-ai\// }, (args) => {
      if (PLATFORM_MODULES.includes(args.path)) return null;
      throw new Error(`client bundle purity: "${args.path}" is not a platform module`);
    });
  },
};

mkdirSync('lib', { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  external: KERNEL_MODULES,
  sourcemap: true,
  logLevel: 'info',
});

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  external: PLATFORM_MODULES,
  plugins: [inlineCss, clientPurity],
  sourcemap: true,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkgName)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
});
