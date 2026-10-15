#!/usr/bin/env node
/**
 * 新插件脚手架：一条命令铺出一个能跑、能过闸门的插件骨架。
 *
 * 一次新建此前要照着邻居抄 15 个文件（package.json、tsconfig、build.mjs、cordis.patch.yml、
 * .gitignore、pnpm-workspace.yaml、产物门禁、两半边的自检骨架、README 三段、locale、图标），
 * 而且每个文件都有几处容易抄错的常量（包名、行 id、engines 与 peer 串、dsh.client.inject）。
 * 这里把它们按当前内核基线生成，生成即 `pnpm check` 绿。
 *
 * 铺出来的形状（可以直接删掉不需要的部分）：
 *   src/index.ts           宿主半边：注册一个回显工具（TODO 换成真的行为）
 *   src/client/index.ts    浏览器半边：注册中英字典（TODO 在这里接管座位 / 画界面）
 *   scripts/smoke-host.mjs 真 cordis + 真 ToolRuntime 的宿主半边自检
 *   scripts/smoke-client.mjs 以 Web shell 的方式装载 lib/client.js，带「未声明服务读取」守卫
 *   build.mjs / tsconfig.json / cordis.patch.yml / locale / assets / README.md / .gitignore
 *
 * 用法：
 *   node tools/new-plugin.mjs dsh-form-filler --title 表单填充 --tool fill_form
 *   node tools/new-plugin.mjs dsh-tiny --host-only        # 只铺宿主半边
 *   node tools/new-plugin.mjs dsh-tiny --no-install       # 先不装依赖
 *   node tools/new-plugin.mjs dsh-tiny --link             # 顺带装进 profile（dsh plugin add）
 * 退出码：0 铺好，1 中途失败，2 参数不对。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { currentKernel, kernelBaselines, repoRoot } from './lib/repo.mjs';

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
const dirName = args._[0];
if (dirName === undefined || !/^dsh-[a-z0-9][a-z0-9-]*$/.test(dirName)) {
  console.error('用法：node tools/new-plugin.mjs dsh-<name> [--title 中文名] [--tool 工具名] [--host-only] [--no-install] [--link] [--out 目录]');
  console.error('  目录名要写成 dsh-<name>（小写字母、数字、连字符）');
  process.exit(2);
}

const kernel = currentKernel(typeof args.dsh === 'string' ? args.dsh : undefined);
const baselines = kernelBaselines(kernel);
const dshRange = `>=${baselines.dsh}`;
const cordisRange = baselines.cordis ?? '^4.0.5-alpha.2';
const short = dirName.replace(/^dsh-/, '');
const pkgName = `@lynn123411/${dirName}`;
const rowId = dirName;
const toolName = typeof args.tool === 'string' ? args.tool : short.replaceAll('-', '_');
const title = typeof args.title === 'string' ? args.title : short;
const description = typeof args.description === 'string' ? args.description : 'TODO 一句话说这个插件干什么。';
const withClient = args['host-only'] !== true;
const outRoot = typeof args.out === 'string' ? resolve(args.out) : join(root, 'plugins');
const dir = join(outRoot, dirName);
if (existsSync(dir)) {
  console.error(`new-plugin: ${dir} 已经存在，不覆盖`);
  process.exit(2);
}

const pkg = {
  name: pkgName,
  version: '0.1.0',
  description,
  type: 'module',
  main: 'lib/index.js',
  exports: {
    '.': './lib/index.js',
    ...(withClient ? { './client': './lib/client.js' } : {}),
    './cordis.patch.yml': './cordis.patch.yml',
    './locale/en.json': './locale/en.json',
    './locale/zh.json': './locale/zh.json',
    './package.json': './package.json',
  },
  files: ['lib', 'cordis.patch.yml', 'README.md', 'DETAILS.md', 'locale', 'assets'],
  license: 'MIT',
  keywords: ['deepseek-harness', 'dsh', 'dsh-plugin', 'cordis'],
  repository: {
    type: 'git',
    url: 'git+https://github.com/tttnny/my-dsh.git',
    directory: `plugins/${dirName}`,
  },
  scripts: {
    build: 'node build.mjs',
    prepack: 'pnpm run build',
    typecheck: 'tsc -p tsconfig.json --noEmit',
    test: `node build.mjs && node scripts/smoke-host.mjs${withClient ? ' && node scripts/smoke-client.mjs' : ''}`,
    'assert:lib-untracked': 'node scripts/assert-lib-untracked.mjs',
    check: 'pnpm typecheck && pnpm test && pnpm assert:lib-untracked',
  },
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    ...(withClient ? { client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-locale'] } } : {}),
  },
  peerDependencies: {
    '@deepseek-ai/cordis': cordisRange,
    '@deepseek-ai/dsh-tools': dshRange,
  },
  devDependencies: {
    '@deepseek-ai/cordis': cordisRange,
    '@deepseek-ai/dsh-system-prompt': dshRange,
    '@deepseek-ai/dsh-tools': dshRange,
    ...(withClient ? { '@deepseek-ai/dsh-client-locale': dshRange } : {}),
    '@types/node': '^22.20.0',
    esbuild: '^0.25.0',
    typescript: '^6.0.0',
  },
  engines: { dsh: dshRange, node: '^22.19 || >=24' },
  publishConfig: { access: 'public' },
  icon: './assets/icon.svg',
};

const files = {
  'package.json': `${JSON.stringify(pkg, null, 2)}\n`,
  '.gitignore': [
    '# 不带尾斜杠：尾斜杠只匹配目录，worktree 里的 node_modules 是指向主仓库的软链，尾斜杠放行',
    'node_modules',
    '/lib/',
    '*.tgz',
    '.DS_Store',
    '',
  ].join('\n'),
  'pnpm-workspace.yaml': [
    '# pnpm 11 blocks dependency build scripts until they are explicitly approved here.',
    'allowBuilds:',
    '  esbuild: true',
    '',
  ].join('\n'),
  'tsconfig.json': `${JSON.stringify({
    compilerOptions: {
      strict: true,
      noImplicitAny: true,
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      jsx: 'react-jsx',
      noEmit: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      types: ['node'],
    },
    include: ['src'],
  }, null, 2)}\n`,
  'cordis.patch.yml': [
    `# ${pkgName} bundle patch`,
    '# 声明在 package.json 的 dsh.bundle.patch，`dsh plugin --profile web add` 后自动并入 profile 层栈。',
    '#',
    '# 这一条 insert 行同时承载两个半边（见 docs/rules/client-wiring.md）：',
    '#   - 宿主半边：在那条行下注册插件本体（上面 src/index.ts 的 apply）。行在 root 层，',
    '#     所以它落进全局层；要收窄到某个 preset，就在 preset 的 config.plugins 里另注册一行。',
    '#   - 浏览器半边：这条行是 root loader entry，dsh-client-modules 只对 root loader 的',
    '#     enabled entry 依据 dsh.client 声明服务浏览器半边（lib/client.js）。',
    '- insert:',
    `    - id: ${rowId}`,
    `      name: '${pkgName}'`,
    '',
  ].join('\n'),
  'assets/icon.svg': [
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">',
    '  <rect x="3.5" y="3.5" width="17" height="17" rx="4"/>',
    '  <path d="M12 8.5v7"/>',
    '  <path d="M8.5 12h7"/>',
    '</svg>',
    '',
  ].join('\n'),
  'locale/en.json': `${JSON.stringify({
    meta: { title, description },
  }, null, 2)}\n`,
  'locale/zh.json': `${JSON.stringify({
    meta: { title, description },
  }, null, 2)}\n`,
  'README.md': [
    `# ${pkgName}`,
    '',
    description,
    '',
    '## 功能',
    '',
    `- **${title}**：TODO 写这个插件给用户带来什么。`,
    '',
    '## 特性',
    '',
    `- **形态与装配**：bundle 型插件，装完即用、profile 侧不用手写补丁；装配、开发副本与验证见 [DETAILS.md](./DETAILS.md)。`,
    '',
    '## 安装',
    '',
    '```sh',
    `dsh plugin --profile web add ${pkgName}`,
    '```',
    '',
  ].join('\n'),
  'DETAILS.md': [
    `# ${pkgName} 详情`,
    '',
    '> 本文档是 [README.md](./README.md) 的补充：装配形态、开发副本与验证。',
    '',
    '## 装配形态',
    '',
    '```sh',
    `dsh plugin --profile web add ${pkgName}`,
    '```',
    '',
    '这条命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条 root loader entry。TODO 写清这条行承载的两个半边与它声明的服务。',
    '',
    '## 开发副本',
    '',
    '运行副本用 `link:` 连到本仓库目录（细则见仓库 `docs/rules/dev-copy.md`）：',
    '',
    '```sh',
    `cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/${dirName}" --offline`,
    '```',
    '',
    '## 验证',
    '',
    '```sh',
    `cd plugins/${dirName} && pnpm check`,
    '```',
    '',
    'TODO 写清 `check` 链上每一步断言什么、哪一步守的是宿主契约。',
    '',
  ].join('\n'),
  'src/index.ts': [
    `import { defineTool } from '@deepseek-ai/dsh-tools';`,
    `import type { Context } from '@deepseek-ai/cordis';`,
    '',
    '/**',
    ` * ${pkgName} —— ${description}`,
    ' *',
    ' * 宿主半边只做一件事：注册下面那个工具。浏览器半边与它同挂一条 root loader 行（见',
    ' * cordis.patch.yml），所以这里不碰界面。',
    ' *',
    ' * TODO 换成真的行为：把 execute 里的回显换成这个插件真正要做的事；要读别的 cordis 服务，',
    ' * 就把服务名加进下面的 inject（漏声明在浏览器半边是静默消失，见 docs/rules/client-wiring.md）。',
    ' */',
    `export const name = '${rowId}';`,
    `export const inject = ['tools'];`,
    '',
    `/** 工具名：模型看到的名字（snake_case）。 */`,
    `const TOOL_NAME = '${toolName}';`,
    '',
    '/**',
    ' * 插件本体：注册工具。',
    ' * @param ctx - 宿主插件上下文（`tools` 由 inject 声明）。',
    ' */',
    'export function apply(ctx: Context): void {',
    '  ctx.tools.register(defineTool({',
    '    name: TOOL_NAME,',
    "    description: 'TODO: what this tool does, in one line for the model.',",
    '    parameters: {',
    '      text: {',
    "        type: 'string',",
    '        required: true,',
    "        description: 'TODO: what this argument is.',",
    '      },',
    '    },',
    '    output: {',
    '      schema: {',
    "        type: 'object',",
    '        additionalProperties: false,',
    '        properties: {',
    "          echoed: { type: 'string', description: 'TODO: what came back.' },",
    '        },',
    '      },',
    "      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],",
    '    },',
    '    async execute(args) {',
    '      return { echoed: args.text };',
    '    },',
    '  }));',
    '}',
    '',
  ].join('\n'),
  'scripts/assert-lib-untracked.mjs': [
    '/**',
    ' * 产物门禁：`lib/` 是 `src/` 的构建镜像，不许入 git（见 docs/rules/release.md「产物与清单」）。',
    ' * index 里还列着 lib/ 下任何文件就失败。',
    ' *',
    ' * 运行：node scripts/assert-lib-untracked.mjs [plugin-dir]',
    ' */',
    "import { execFileSync } from 'node:child_process';",
    "import { dirname, join, resolve } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    '',
    "const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));",
    "const tracked = execFileSync('git', ['ls-files', 'lib'], { cwd: root, encoding: 'utf8' })",
    "  .split('\\n')",
    '  .filter((line) => line.length > 0);',
    '',
    'if (tracked.length > 0) {',
    "  console.error('assert-lib-untracked: lib/ 是构建镜像，不能入 git：');",
    '  for (const path of tracked) console.error(`  ${path}`);',
    '  process.exit(1);',
    '}',
    "console.log('assert-lib-untracked: ok（lib/ 下无跟踪文件）');",
    '',
  ].join('\n'),
  'scripts/smoke-host.mjs': [
    '/**',
    ' * 宿主半边自检：真 cordis `Context` + 真 `ToolRuntime`（内核包来自本包 devDependencies，',
    ' * 与 engines.dsh 同版本），断言工具注册得上、行为对、包内装配行与包名对得上。',
    ' *',
    ' * 跑法：pnpm test / node scripts/smoke-host.mjs',
    ' */',
    "import assert from 'node:assert/strict';",
    "import { readFileSync } from 'node:fs';",
    "import { dirname, join, resolve } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    '',
    "import { Context } from '@deepseek-ai/cordis';",
    "import SystemPrompt from '@deepseek-ai/dsh-system-prompt';",
    "import ToolRuntime from '@deepseek-ai/dsh-tools';",
    '',
    "import * as plugin from '../lib/index.js';",
    '',
    "const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));",
    "const pkgName = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;",
    '',
    'let passed = 0;',
    'let total = 0;',
    'async function test(label, fn) {',
    '  total += 1;',
    '  try {',
    '    await fn();',
    '    passed += 1;',
    '    console.log(`  ok   ${label}`);',
    '  } catch (error) {',
    '    console.error(`  FAIL ${label}: ${error.message}`);',
    '    throw error;',
    '  }',
    '}',
    '',
    '/** 起一个真内核上下文：工具表 + 它写工具 schema 用的提示词服务。 */',
    'function host() {',
    '  const ctx = new Context();',
    '  new SystemPrompt(ctx, {});',
    '  new ToolRuntime(ctx);',
    '  return ctx;',
    '}',
    '',
    'const ctx = host();',
    'plugin.apply(ctx);',
    `const tool = ctx.tools.get('${toolName}');`,
    '',
    `await test('导出的行身份与包内 cordis.patch.yml 那条装配行同名', () => {`,
    `  assert.equal(plugin.name, '${rowId}');`,
    '  assert.deepEqual(plugin.inject, [\'tools\']);',
    '});',
    '',
    `await test('工具注册得上，名字与 schema 齐全', () => {`,
    '  assert.ok(tool !== undefined, \'工具没注册上\');',
    `  assert.equal(tool.name, '${toolName}');`,
    '  assert.ok(tool.parameters.properties.text.type === \'string\');',
    '});',
    '',
    `await test('执行与 render：回显原样返回', async () => {`,
    '  const value = await tool.execute({ text: \'hello\' }, { signal: new AbortController().signal });',
    '  assert.deepEqual(value, { echoed: \'hello\' });',
    '  assert.deepEqual(tool.output.render({ text: \'hello\' }, value), [{ type: \'text\', text: JSON.stringify(value) }]);',
    '});',
    '',
    `await test('包内 cordis.patch.yml 只有一条装配行，id 与包名各自独立地对上', () => {`,
    '  const patch = readFileSync(join(root, \'cordis.patch.yml\'), \'utf8\')',
    '    .split(\'\\n\')',
    '    .map((line) => line.replace(/(^|\\s)#.*$/, \'\'))',
    '    .filter((line) => line.trim() !== \'\')',
    '    .join(\'\\n\');',
    '  const rows = [...patch.matchAll(/-\\s*id:\\s*(\\S+)\\s*\\n\\s*name:\\s*\'([^\']+)\'/g)];',
    '  assert.equal(rows.length, 1, \'包内 cordis.patch.yml 应当只有一条装配行\');',
    '  assert.equal(rows[0][1], plugin.name);',
    '  assert.equal(rows[0][2], pkgName);',
    '});',
    '',
    'console.log(`${passed}/${total} passed`);',
    '',
  ].join('\n'),
  'build.mjs': [
    '// 两半边的构建：宿主半边 lib/index.js（ESM，内核包留 external），',
    '// 客户端半边 lib/client.js（浏览器 CJS，React 与宿主模块走 Web shell 的模块表）。',
    '//',
    '// 客户端 bundle 必须自注册成一个 factory（window.__ModuleLoader__.load）并自成一个文件：',
    '// 浏览器侧的 require 只认平台种子表、boot graph 行与已注册的 factory，包内相对 require',
    '// 不在其中，所以相对导入必须在构建期就被内联进来。详见 docs/rules/dev-copy.md。',
    '',
    "import { mkdirSync, readFileSync } from 'node:fs';",
    "import { build } from 'esbuild';",
    '',
    "const pkgName = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name;",
    '',
    '// Web shell 播种的平台模块表（@deepseek-ai/dsh-web-frontend 的 staticModules）。',
    'const PLATFORM_MODULES = [',
    "  'react',",
    "  'react/jsx-runtime',",
    "  'react-dom',",
    "  'react-dom/client',",
    "  '@deepseek-ai/cordis',",
    "  '@deepseek-ai/dsh-client-store',",
    "  '@deepseek-ai/dsh-client-ui-slots',",
    "  '@deepseek-ai/dsh-client-ui-primitives',",
    "  '@deepseek-ai/dsh-client-locale',",
    '];',
    '',
    '// 宿主半边由 DSH 进程按 realpath 路由供给的内核包，inline 进来会造出第二份 registry。',
    'const KERNEL_MODULES = [',
    "  '@deepseek-ai/cordis',",
    "  '@deepseek-ai/dsh-tools',",
    '];',
    '',
    '/** 客户端 bundle 的纯净度门禁：任何非平台模块的 @deepseek-ai/* 请求当场失败。 */',
    'const clientPurity = {',
    "  name: 'dsh-client-bundle-purity',",
    '  setup(build) {',
    '    build.onResolve({ filter: /^@deepseek-ai\\// }, (args) => {',
    '      if (PLATFORM_MODULES.includes(args.path)) return null;',
    '      throw new Error(`client bundle purity: "${args.path}" is not a platform module`);',
    '    });',
    '  },',
    '};',
    '',
    "mkdirSync('lib', { recursive: true });",
    '',
    'await build({',
    "  entryPoints: ['src/index.ts'],",
    "  outfile: 'lib/index.js',",
    '  bundle: true,',
    "  format: 'esm',",
    "  platform: 'node',",
    "  target: ['node22'],",
    '  external: KERNEL_MODULES,',
    '  sourcemap: true,',
    "  logLevel: 'info',",
    '});',
    '',
    ...(withClient ? [
      'await build({',
      "  entryPoints: ['src/client/index.ts'],",
      "  outfile: 'lib/client.js',",
      '  bundle: true,',
      "  format: 'cjs',",
      "  platform: 'browser',",
      "  target: ['es2022'],",
      "  jsx: 'automatic',",
      '  external: PLATFORM_MODULES,',
      '  plugins: [clientPurity],',
      '  sourcemap: true,',
      '  banner: {',
      '    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkgName)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,',
      '  },',
      '  footer: {',
      "    js: 'return module.exports; } });',",
      '  },',
      "  logLevel: 'info',",
      '});',
      '',
    ] : []),
  ].join('\n'),
};

if (withClient) {
  files['src/client/locales.ts'] = [
    '/** 这个插件的字典命名空间：座位注册与 `locale.bind` 都用它。 */',
    `export const NS = '${short.replaceAll('-', '')}';`,
    '',
    '/** 英文文案。 */',
    'export const en = {',
    `  'panel.title': '${title}',`,
    '};',
    '',
    '/** 中文文案。键集与英文逐一对齐（smoke-client 会查这一条）。 */',
    'export const zh = {',
    `  'panel.title': '${title}',`,
    '};',
    '',
  ].join('\n');
  files['src/client/index.ts'] = [
    `import type { Context as ClientContext } from '@deepseek-ai/cordis';`,
    '// 类型只读：`ctx.locale` 与它的字典类型来自这个包的浏览器半边。',
    `import type {} from '@deepseek-ai/dsh-client-locale/client';`,
    `import { NS, en, zh } from './locales.js';`,
    '',
    `export { NS } from './locales.js';`,
    '',
    '/**',
    ` * ${pkgName} 的浏览器半边：注册字典。`,
    ' *',
    ' * TODO 在这里画界面：先读宿主 checkout 的 packages/client/ui-primitives/README.md 挑现成控件，',
    ' * 再照 docs/rules/plugin-ui.md 的两条样式规则写；接管座位用 `ctx.slots.inject(<座位键>, ...)`',
    ' * （座位键的类型来自对应包的浏览器半边，所以要 `import type {} from \'@deepseek-ai/dsh-client-ui-<包>/client\'`）。',
    ' */',
    `export const name = '${pkgName}';`,
    `export const inject = ['locale'];`,
    '',
    '/**',
    ' * 插件本体：注册字典。',
    ' * @param ctx - 客户端根上下文。',
    ' */',
    'export function apply(ctx: ClientContext): void {',
    `  ctx.effect(() => ctx.locale.register(NS, { zh, en }), '${dirName}: dictionaries');`,
    '}',
    '',
  ].join('\n');
  files['scripts/smoke-client.mjs'] = [
    '/**',
    ' * 浏览器半边自检：按 Web shell 的方式装载 lib/client.js（`window.__ModuleLoader__.load` 桩件），',
    ' * 喂假 cordis 服务，断言注册结果。**未声明的服务读取必须抛**——漏声明不会报错，只会让插件',
    ' * 在页面里消失（docs/rules/client-wiring.md），守卫自身要有反例断言证明它还能抛。',
    ' *',
    ' * 跑法：pnpm test / node scripts/smoke-client.mjs',
    ' */',
    "import { createRequire } from 'node:module';",
    "import { fileURLToPath } from 'node:url';",
    "import { dirname, join, resolve } from 'node:path';",
    '',
    'const require = createRequire(import.meta.url);',
    "const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));",
    '',
    'const failures = [];',
    'const check = (label, ok) => {',
    '  if (ok) console.log(`  ok   ${label}`);',
    '  else { console.error(`  FAIL ${label}`); failures.push(label); }',
    '};',
    '',
    'let exported;',
    'const requires = [];',
    'globalThis.window = {',
    '  __ModuleLoader__: {',
    '    load: ({ id, factory }) => {',
    '      requires.push(id);',
    '      exported = factory((spec) => {',
    '        if (spec === \'react\') return require(\'react\');',
    '        if (spec === \'react/jsx-runtime\') return require(\'react/jsx-runtime\');',
    '        if (spec === \'react-dom\') return require(\'react-dom\');',
    '        throw new Error(`module table miss: ${spec}`);',
    '      });',
    '    },',
    '  },',
    '};',
    '',
    'const locales = [];',
    'const errors = [];',
    'const services = () => ({',
    '  locale: {',
    '    register: (ns, dictionaries) => { locales.push({ ns, dictionaries }); return () => {}; },',
    '    bind: () => (key) => key,',
    '  },',
    '});',
    '',
    '/** cordis 忠实的上下文：读未声明的服务抛 `cannot get property "x" without inject`。 */',
    'function makeCtx(label, declared = []) {',
    '  const table = services();',
    '  const base = {',
    '    label,',
    '    effect: (fn) => { fn(); return () => {}; },',
    '    on: () => () => {},',
    '    inject: (names, callback) => {',
    '      const list = Array.isArray(names) ? names : [names];',
    '      try {',
    '        const dispose = callback(makeCtx(`${label}/${list.join(\',\')}`, [...declared, ...list]));',
    '        if (typeof dispose === \'function\') dispose();',
    '      } catch (error) {',
    '        errors.push(`${label} inject[${list.join(\',\')}] threw: ${error?.message}`);',
    '      }',
    '      return () => {};',
    '    },',
    '    get: (name) => table[name],',
    '  };',
    '  return new Proxy(base, {',
    '    get(target, prop) {',
    '      if (typeof prop === \'symbol\' || prop === \'then\') return undefined;',
    '      if (prop in target) return target[prop];',
    '      if (declared.includes(prop)) return table[prop];',
    '      throw new Error(`cannot get property "${prop}" without inject`);',
    '    },',
    '  });',
    '}',
    '',
    'await import(`${join(root, \'lib/client.js\')}?smoke=${Date.now()}`);',
    '',
    `check('bundle 以包 id 自注册', requires[0] === '${pkgName}');`,
    `check('导出 name / apply / inject', exported?.name === '${pkgName}' && typeof exported?.apply === 'function' && Array.isArray(exported?.inject));`,
    `check('inject 写的就是它真正读的服务', JSON.stringify(exported?.inject) === '["locale"]');`,
    '',
    'try {',
    '  makeCtx(\'teeth\').locale;',
    '  check(\'守卫拒绝未声明的服务读取\', false);',
    '} catch (error) {',
    '  check(\'守卫拒绝未声明的服务读取\', /cannot get property "locale" without inject/.test(error.message));',
    '}',
    '',
    'try {',
    '  exported.apply(makeCtx(\'root\', exported.inject ?? []));',
    '  check(\'apply() 过得了 inject 守卫\', true);',
    '} catch (error) {',
    '  check(\'apply() 过得了 inject 守卫\', false);',
    '  console.error(`       ${error.message}`);',
    '}',
    '',
    'const dictionary = locales.find((entry) => entry.ns !== undefined)?.dictionaries;',
    'check(\'字典注册上了\', dictionary !== undefined);',
    'const zhKeys = Object.keys(dictionary?.zh ?? {}).sort();',
    'const enKeys = Object.keys(dictionary?.en ?? {}).sort();',
    'check(\'zh/en 键集一致且非空\', zhKeys.length > 0 && JSON.stringify(zhKeys) === JSON.stringify(enKeys));',
    'check(\'每条文案都非空\', enKeys.every((key) => typeof dictionary.en[key] === \'string\' && dictionary.en[key].length > 0));',
    'check(\'apply 期间没有接线错误\', errors.length === 0);',
    'for (const error of errors) console.error(`       ${error}`);',
    '',
    'console.log(failures.length === 0 ? \'\\nsmoke: PASS\' : `\\nsmoke: FAIL (${failures.length})`);',
    'process.exit(failures.length === 0 ? 0 : 1);',
    '',
  ].join('\n');
}

// ── 落盘 ────────────────────────────────────────────────────────────────────
mkdirSync(join(dir, 'src/client'), { recursive: true });
mkdirSync(join(dir, 'scripts'), { recursive: true });
mkdirSync(join(dir, 'locale'), { recursive: true });
mkdirSync(join(dir, 'assets'), { recursive: true });
for (const [rel, content] of Object.entries(files)) {
  writeFileSync(join(dir, rel), content);
}
console.log(`new-plugin: ${dir.replace(`${root}/`, '')} 已铺好（${Object.keys(files).length} 个文件，宿主半边${withClient ? ' + 浏览器半边' : ''}）`);

// ── 装依赖与跑门禁 ──────────────────────────────────────────────────────────
if (args['no-install'] !== true) {
  console.log('new-plugin: pnpm install');
  try {
    execFileSync('pnpm', ['install'], { cwd: dir, stdio: ['ignore', 'inherit', 'inherit'] });
  } catch {
    console.error('new-plugin: pnpm install 失败——修好网络/registry 后在包目录重跑一次');
    process.exit(1);
  }
  console.log('new-plugin: pnpm check');
  try {
    execFileSync('pnpm', ['check'], { cwd: dir, stdio: ['ignore', 'inherit', 'inherit'] });
  } catch {
    console.error('new-plugin: pnpm check 没过——上面是失败的那几条');
    process.exit(1);
  }
}

if (args.link === true) {
  const profile = typeof args.profile === 'string' ? args.profile : process.env.DSH_PROFILE ?? 'web';
  console.log(`new-plugin: dsh plugin --profile ${profile} add ${dir}`);
  try {
    execFileSync(kernel.bin, ['plugin', `--profile`, profile, 'add', dir], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
  } catch {
    console.error('new-plugin: 装进 profile 失败——装完要重启 DSH 才装载');
    process.exit(1);
  }
}

console.log('');
console.log('new-plugin: 还差两步收尾');
console.log(`  1. 根 README.md 的插件表加一行（rowspan 合并数一并改，版式见 docs/rules/to-readme.md）：`);
console.log(`     <td><a href="./plugins/${dirName}"><code>${pkgName}</code></a></td>`);
console.log(`  2. 改 src/index.ts${withClient ? ' 与 src/client/index.ts' : ''} 里的 TODO，再跑 pnpm check`);
