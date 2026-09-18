/**
 * Product mirror gate: `lib/` is a build mirror of `src/` and stays out of
 * git. Fails when the index still lists any file under it.
 *
 * Run with: node scripts/assert-lib-untracked.mjs [plugin-dir]
 */

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
const tracked = execFileSync('git', ['ls-files', 'lib'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(line => line.length > 0)

if (tracked.length > 0) {
  console.error('assert-lib-untracked: lib/ is a build mirror and must not be tracked:')
  for (const path of tracked) console.error(`  ${path}`)
  process.exit(1)
}
console.log('assert-lib-untracked: ok (no tracked file under lib/)')
