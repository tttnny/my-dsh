/**
 * 产物门禁：`lib/` 是 `src/` 的构建镜像，不许入 git（见 docs/rules/release.md「产物与清单」）。
 * index 里还列着 lib/ 下任何文件就失败。
 *
 * 运行：node scripts/assert-lib-untracked.mjs [plugin-dir]
 */
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const tracked = execFileSync('git', ['ls-files', 'lib'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((line) => line.length > 0);

if (tracked.length > 0) {
  console.error('assert-lib-untracked: lib/ 是构建镜像，不能入 git：');
  for (const path of tracked) console.error(`  ${path}`);
  process.exit(1);
}
console.log('assert-lib-untracked: ok（lib/ 下无跟踪文件）');
