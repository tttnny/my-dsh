import { build } from 'esbuild';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';

mkdirSync('lib', { recursive: true });

// Bundle id follows the package name (standard @lynn123411/dsh-* naming).
const pkgName = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name;

// 1. Host build
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

// 2. Client build
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

// 3. Types build
try {
  if (existsSync('node_modules/.bin/tsc')) {
    execFileSync('node_modules/.bin/tsc', ['-p', 'tsconfig.json'], { stdio: 'inherit' });
  } else {
    execSync('pnpm exec tsc -p tsconfig.json', { stdio: 'inherit' });
  }
} catch (err) {
  // Declaration emit is part of the build: a silent warning here would let
  // lib/types drift behind src/ without failing anything.
  console.error('[dsh-chat-translate] tsc declaration emit failed:', err?.message || err);
  process.exitCode = 1;
}