#!/usr/bin/env node
/** 断言镜像产物目录未被 git 跟踪，并被 .gitignore 挡住：产物由 build 生成、由 prepack 现打。 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const sourceRoot = resolve(import.meta.dirname, '..')
const mirrorRoots = ['lib']

function git(args) {
  return execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf8' })
}

for (const mirrorRoot of mirrorRoots) {
  const tracked = git(['ls-files', '--', mirrorRoot]).trim()
  if (tracked !== '') {
    const files = tracked.split('\n')
    throw new Error(`artifacts check: ${mirrorRoot}/ 有 ${files.length} 个文件被 git 跟踪（例如 ${files[0]}）；镜像产物不入库`)
  }
  git(['check-ignore', '--quiet', '--', `${mirrorRoot}/index.js`])
}

console.log(`artifacts check: ${mirrorRoots.join(', ')} 未被 git 跟踪，并被 .gitignore 挡住`)
