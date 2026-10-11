import { build } from 'esbuild';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';

mkdirSync('lib', { recursive: true });

// 声明产物是 src/ 的镜像：tsc 从不清理 outDir，删掉或改名的模块会把它旧的 .d.ts
// 一直留在发布包里（`files` 含 lib）——产物门禁只断言 lib/ 未被 git 跟踪，拦不住
// 这种陈旧镜像。emit 前先清掉，保证 lib/types 与 src/ 一一对应。
rmSync('lib/types', { recursive: true, force: true });

const pkgName = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name;

// 1. Host build (Node.js ESM)
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  logLevel: 'info',
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-home-paths', 'node:*'],
});

// 2. Client build (Browser CJS with ModuleLoader wrapper)
await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  loader: {
    '.css': 'text',
  },
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkgName)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
});

// 3. Types build
// 声明产物是发布包的一部分：上面先清了 lib/types，这里若只 warn 就会让整个声明镜像
// 静默消失（包照发、lib/types 空）。失败必须让 build 非零退出。
try {
  if (existsSync('node_modules/.bin/tsc')) {
    execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.json'], { stdio: 'inherit' });
  } else {
    execSync('pnpm exec tsc -p tsconfig.json', { stdio: 'inherit' });
  }
} catch (err) {
  console.error('[dsh-a6api] tsc declaration emit failed:', err?.message || err);
  process.exitCode = 1;
}
