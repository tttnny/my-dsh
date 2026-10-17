/**
 * 声明镜像一致性闸门：`lib/types` 是 `src/` 的镜像（tsconfig 的 rootDir=src、
 * outDir=lib/types、emitDeclarationOnly），两边必须逐文件一一对应。
 *
 * 为什么需要这条，`assert:lib-untracked` 为什么拦不住：那条只断言 `lib/` 没有被 git
 * 跟踪。陈旧镜像（源文件已删、旧 `.d.ts` 还在）既不违反「未跟踪」，也不报错——而
 * `files` 含 `lib`，于是 `npm pack` 会把已删组件的声明打进发布包。`lib` 是 gitignore
 * 的，`git status` 也看不见它。清镜像只由 `build` 负责（见 build.mjs 的 rmSync），
 * 这条闸门负责证明「清干净了、且 tsc 真的重新发了一遍」。
 *
 * 两个方向都查：
 * - 陈旧：`lib/types` 里有 `src/` 已经不存在的声明；
 * - 缺失：`src/` 里的模块没有对应声明（tsc 没跑、或某个文件被排除出 include）。
 *
 * Run with: node scripts/assert-lib-mirror.mjs [plugin-dir]
 */

import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))

/** 递归列出目录下所有文件，返回相对 root 的 POSIX 路径。目录不存在返回 []。 */
function listFiles(dir) {
  const out = []
  const walk = (current) => {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out.push(relative(root, full).split('\\').join('/'))
    }
  }
  walk(dir)
  return out
}

// 期望集：src/ 下每个可发声明文件的 .ts/.tsx 模块（.d.ts 是手写声明输入，tsc 不为它产出）
const expected = new Set(
  listFiles(join(root, 'src'))
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))
    .map((f) => f.replace(/^src\//, '').replace(/\.(ts|tsx)$/, '.d.ts')),
)

// 实际集：lib/types 下的声明文件
const actual = new Set(
  listFiles(join(root, 'lib', 'types')).map((f) => f.replace(/^lib\/types\//, '')),
)

const stale = [...actual].filter((f) => !expected.has(f)).sort()
const missing = [...expected].filter((f) => !actual.has(f)).sort()

if (stale.length > 0 || missing.length > 0) {
  if (stale.length > 0) {
    console.error('assert-lib-mirror: lib/types 有 src/ 已不存在的陈旧声明（会随 files 进发布包）：')
    for (const f of stale) console.error(`  ${f}`)
  }
  if (missing.length > 0) {
    console.error('assert-lib-mirror: src/ 有模块没发出声明（build 没跑完，或文件不在 include 里）：')
    for (const f of missing) console.error(`  ${f}`)
  }
  console.error('请重跑 `pnpm build`；若仍旧，检查 build.mjs 的清镜像步骤与 tsc 是否真的在 emit。')
  process.exit(1)
}

console.log(`assert-lib-mirror: ok (lib/types 与 src/ 一一对应，共 ${actual.size} 个声明)`)
