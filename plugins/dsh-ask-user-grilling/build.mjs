// 两半边的构建：宿主半边 lib/index.js（ESM，内核包留 external），
// 客户端半边 lib/client.js（浏览器 CJS，React 与 ui-primitives 走 Web shell 的模块表）。
//
// 客户端 bundle 必须自注册成一个 factory（window.__ModuleLoader__.load）并自成一个文件：
// 浏览器侧的 require 只认平台种子表、boot graph 行与已注册的 factory，包内相对 require
// 不在其中，所以相对导入必须在构建期就被内联进来。CSS 同理——没有独立的样式资源路由，
// 只能在构建期读成字符串、由插件在物化时注入 <style>。

import { mkdirSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkgName = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name;

// Web shell 播种的平台模块表（@deepseek-ai/dsh-web-frontend 的 staticModules）里本插件允许外部化的请求。
// `@deepseek-ai/dsh-client-ui-dockkit` 已不是可安装的包（shell 只留一个空对象桩件），故不列入；
// 其余 @deepseek-ai/* 一律不许出现在客户端 bundle 里：浏览器侧的模块表解答不了它，
// 物化时才会抛，构建期拦下才有信号。
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
];

// 宿主半边由 DSH 进程按 realpath 路由供给的内核包，inline 进来会造出第二份 registry。
const KERNEL_MODULES = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/dsh-user-questions',
];

/** 把 .css 读成字符串导出；模块体不在这里执行，注入由插件自己按标签键做。 */
const cssText = {
  name: 'dsh-css-text',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, (args) => ({
      contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf8'))};`,
      loader: 'js',
    }));
  },
};

/** 客户端 bundle 的纯净度门禁：任何非平台模块的 @deepseek-ai/* 请求当场失败。 */
const clientPurity = {
  name: 'dsh-client-bundle-purity',
  setup(build) {
    build.onResolve({ filter: /^@deepseek-ai\// }, (args) => {
      if (PLATFORM_MODULES.includes(args.path)) return null;
      throw new Error(
        `client bundle purity: "${args.path}" is not a platform module — `
        + '跨插件的值导入被禁止；要通过 cordis 服务协作',
      );
    });
  },
};

mkdirSync('lib', { recursive: true });

await build({
  entryPoints: ['src/index.js'],
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
  entryPoints: ['src/client/index.js'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  external: PLATFORM_MODULES,
  plugins: [cssText, clientPurity],
  sourcemap: true,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkgName)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
});
