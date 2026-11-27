import { build } from 'esbuild';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';

mkdirSync('lib', { recursive: true });

// Declaration output is a mirror of src/ like lib/ itself, and tsc never prunes
// its outDir: a deleted or renamed module would otherwise keep shipping its old
// .d.ts inside the published `lib`. Clean before emitting.
rmSync('lib/types', { recursive: true, force: true });

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

// 2. Client build. The target Web shell seeds these modules in packages/client/web/src/seed.ts.
const platformModules = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
];
const clientPurity = {
  name: 'dsh-client-bundle-purity',
  setup(build) {
    build.onResolve({ filter: /^(?:@deepseek-ai\/|react(?:-dom)?(?:\/|$))/ }, ({ path }) => {
      if (platformModules.includes(path)) return { path, external: true };
      throw new Error(`client bundle purity: "${path}" is not a platform module`);
    });
  },
};

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  plugins: [clientPurity],
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
