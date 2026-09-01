/**
 * Assemble lib/client.js from the plain-JS source modules under src/client/.
 * The bundle is a single CJS factory registered with the DSH client module
 * loader; the factory require()s only shell seed rows (react, the JSX runtime,
 * dsh-client-ui-primitives). All plugin code and CSS are inlined.
 */
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ID = 'dsh-agent-workflow';
const root = join(dirname(fileURLToPath(import.meta.url)), '.');
const srcDir = join(root, 'src');
const outDir = join(root, 'lib');

/** Module order: imports first, entry (apply) last. */
const MODULES = [
  'client/imports.js',
  'client/locales.js',
  'client/record.js',
  'client/layout.js',
  'client/model.js',
  'client/builder.js',
  'client/definitions.js',
  'client/view.js',
  'client/index.js',
];

const banner = `/**
 * @lynn123411/dsh-agent-workflow browser half.
 * Visual user-turn, model-request, response, and tool-call explorer
 * (adapted to dsh 0.1.2-alpha.1; plain-JS source assembled by build.mjs).
 */
window.__ModuleLoader__.load({
  id: \"@lynn123411/dsh-agent-workflow\",
  factory: (require) => {
    'use strict';
    var module = { exports: {} };
    var exports = module.exports;
`;

const footer = `
    // The client loader reads the plugin descriptor off module.exports:
    // without apply/inject the entry cannot activate and web boot fails.
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
`;

/** Inline the stylesheet once, keyed by a data-plugin-css marker. */
function cssInjection(cssSource) {
  return `
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-agent-workflow/styles.css"]') === null) {
      var tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-agent-workflow';
      tag.dataset.pluginCss = 'dsh-agent-workflow/styles.css';
      tag.textContent = ${JSON.stringify(cssSource)};
      document.head.appendChild(tag);
    }
`;
}

await mkdir(outDir, { recursive: true });
await copyFile(join(srcDir, 'index.js'), join(outDir, 'index.js'));

const cssSource = await readFile(join(srcDir, 'client', 'styles.css'), 'utf8');
const parts = [banner, cssInjection(cssSource)];
for (const name of MODULES) {
  const source = await readFile(join(srcDir, name), 'utf8');
  parts.push(`    //#region src/${name}`);
  parts.push(source.replace(/^/gm, '    '));
  parts.push('    //#endregion');
}
parts.push(footer);
await writeFile(join(outDir, 'client.js'), parts.join('\n'));
console.log('built lib/client.js and lib/index.js');
