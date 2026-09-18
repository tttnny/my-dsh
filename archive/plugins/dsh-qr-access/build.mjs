import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

mkdirSync('lib', { recursive: true });

// Bundle id follows the package name (standard @lynn123411/dsh-* naming).
const pkgName = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name;

// 1. Host build —— 纯客户端插件：宿主半区是零副作用 no-op（数据走 DSH Desktop 同源接口）。
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  logLevel: 'info',
});

// 2. Client build —— CJS + __ModuleLoader__ 包装；react / react-dom / react-jsx-runtime 由 DSH 运行时提供。
await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  external: ['react', 'react-dom'],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkgName)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
});

// 3. Types emit（可选，失败不阻塞构建）
try {
  execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.json'], { stdio: 'inherit' });
} catch (err) {
  console.warn('[dsh-qr-access] tsc emit skipped or failed:', err?.message || err);
}
