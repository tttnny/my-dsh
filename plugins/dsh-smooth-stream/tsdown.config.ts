import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { defineConfig, type UserConfig } from 'tsdown'
import { transform } from 'lightningcss'

const PACKAGE_ID = '@lynn123411/dsh-smooth-stream'
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/**
 * Specifiers resolved from the Web shell module table. Everything else is
 * inlined so a require() the table cannot answer never reaches the browser.
 * DSH 0.1.5-rc.1 seeds exactly react, react-dom, `@deepseek-ai/cordis`,
 * `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`,
 * `@deepseek-ai/dsh-client-ui-primitives`, and `@deepseek-ai/dsh-client-ui-dockkit`;
 * every other `@deepseek-ai/*` row is a composed graph edge instead.
 */
const CLIENT_EXTERNALS: readonly string[] = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  // Static seed word: src/client/clientStore.ts requires it directly.
  '@deepseek-ai/dsh-client-store',
]

const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  return emitted
}

const nodeLibrary: UserConfig = {
  name: PACKAGE_ID,
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}

const clientBundle: UserConfig = {
  name: `${PACKAGE_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  plugins: [{
    name: 'dsh-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (CLIENT_EXTERNALS.includes(source)) return null
      if (VENDORED_LIBRARY.test(source)) return null
      if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is not a platform module — `
        + 'cross-plugin value imports are forbidden; collaborate through cordis services',
      )
    },
  }, {
    name: 'dsh-css-modules-inline',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css')) return null
      const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      // lightningcss hands back its exports map in an order that varies between
      // runs. Emitting it as-is churns the tracked bundle: two builds of the same
      // source differ by a pure reordering of the class map (same key set), which
      // makes `git diff` on lib/client.js meaningless. Sort before emitting.
      const classMap: Record<string, string> = {}
      const classEntries = Object.entries(cssExports ?? {})
        .map(([local, exp]) => [local, exp.name] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      for (const [local, name] of classEntries) classMap[local] = name
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(`${PACKAGE_ID}/${basename(fileId)}`)};`,
        'if (typeof document !== \'undefined\') {',
        // Keyed on the file, not the content: a same-document module
        // re-execution (HMR reload after a rebuild) must REPLACE the sheet,
        // or the new hashed class names run against the stale old CSS.
        '  let tag = document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\');',
        '  if (tag === null) {',
        '    tag = document.createElement(\'style\');',
        `    tag.dataset.plugin = ${JSON.stringify(PACKAGE_ID)};`,
        '    tag.dataset.pluginCss = tagId;',
        '    document.head.appendChild(tag);',
        '  }',
        '  tag.textContent = css;',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([nodeLibrary, clientBundle])
