#!/usr/bin/env node
/**
 * 详情文档门禁：每个插件包在插件页显示的详情文档与配图。
 *
 * 判据：
 *  1. `locale/en.json` 与 `locale/zh.json` 都存在，且各自的 `meta.detail` 是非空字符串。
 *  2. `meta.detail` 指向包内子目录里的 `.md` / `.markdown` 文件：路径用 `/`、不含 `..`、
 *     不以 `/` 开头、不是 URL；文件存在。
 *  3. 文档只由一行图片引用组成，没有别的正文；引用的图片在文档旁边存在。
 *  4. 配图是自包含 SVG：640×300 画布，不含 `text`、`foreignObject`、`script`、`style`、
 *     动画元素与外部引用。
 *  5. 中英两份文档引用的不是同一个文件，两张图内容不同。
 *  6. 两张配图合计不超过 1 MiB。
 *  7. `package.json` 的 `files` 覆盖 `meta.detail` 的顶层目录，发布后才读得到。
 *
 * 退出码：0 通过，1 有判据不通过，2 跑不起来（目录或 JSON 读不了）。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative, isAbsolute } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PLUGINS = join(ROOT, 'plugins')
const LANGUAGES = ['en', 'zh']
const MAX_PAIR_BYTES = 1024 * 1024
const CANVAS = /width="640"[^>]*height="300"|height="300"[^>]*width="640"/

const failures = []

/**
 * 记一条不通过。
 * @param {string} pkg - 包目录名。
 * @param {string} message - 说明。
 * @returns {void}
 */
function fail(pkg, message) {
  failures.push(`${pkg}: ${message}`)
}

/**
 * 读一个 JSON 文件。
 * @param {string} path - 文件路径。
 * @returns {unknown} 解析结果。
 */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * 从 Markdown 里取图片：替代文字与目标。
 * @param {string} markdown - 文档正文。
 * @returns {readonly {alt: string, target: string}[]} 图片，按出现顺序。
 */
function imageTargets(markdown) {
  const targets = []
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    targets.push({ alt: match[1], target: match[2] })
  }
  return targets
}

/**
 * 文档里除图片那一行之外还有没有正文。
 * @param {string} markdown - 文档正文。
 * @returns {boolean} 有别的非空行时为真。
 */
function hasOtherContent(markdown) {
  const rest = markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  return rest.split('\n').some(line => line.trim() !== '')
}

/**
 * 检查一张配图。
 * @param {string} pkg - 包目录名。
 * @param {string} path - 图片路径。
 * @returns {void}
 */
function checkImage(pkg, path) {
  const svg = readFileSync(path, 'utf8')
  const label = relative(ROOT, path)
  if (!CANVAS.test(svg)) fail(pkg, `${label} 不是 640×300 画布`)
  for (const [pattern, what] of [
    [/<text[\s>]/, 'text 元素'],
    [/<foreignObject[\s>]/, 'foreignObject'],
    [/<script[\s>]/, 'script'],
    [/<style[\s>]/, 'style'],
    [/<(animate|animateTransform|animateMotion|set)[\s>]/, '动画元素'],
    [/xlink:href\s*=\s*"(?!#)/, '外部引用'],
    [/href\s*=\s*"(?!#)/, '外部引用'],
    [/url\(\s*['"]?(?!#)/, '外部引用'],
  ]) {
    if (pattern.test(svg)) fail(pkg, `${label} 含${what}`)
  }
}

/**
 * 检查一个包。
 * @param {string} dir - 包目录名。
 * @returns {void}
 */
function checkPackage(dir) {
  const root = join(PLUGINS, dir)
  const manifest = readJson(join(root, 'package.json'))
  const documents = []

  for (const language of LANGUAGES) {
    const localePath = join(root, 'locale', `${language}.json`)
    if (!existsSync(localePath)) {
      fail(dir, `缺 locale/${language}.json`)
      continue
    }
    const detail = readJson(localePath)?.meta?.detail
    if (typeof detail !== 'string' || detail === '') {
      fail(dir, `locale/${language}.json 的 meta.detail 不是非空字符串`)
      continue
    }
    if (isAbsolute(detail) || /^[a-z]+:/i.test(detail) || detail.includes('\\') || detail.split('/').includes('..')) {
      fail(dir, `meta.detail ${JSON.stringify(detail)} 不是包内相对路径`)
      continue
    }
    if (!/\.(md|markdown)$/.test(detail)) {
      fail(dir, `meta.detail ${JSON.stringify(detail)} 不以 .md 或 .markdown 结尾`)
      continue
    }
    const documentPath = join(root, detail)
    if (!existsSync(documentPath)) {
      fail(dir, `meta.detail 指向的 ${detail} 不存在`)
      continue
    }
    const top = detail.split('/')[0]
    if (detail.split('/').length < 2) fail(dir, `meta.detail ${JSON.stringify(detail)} 不在包子目录里`)
    if (!Array.isArray(manifest.files) || !manifest.files.includes(top)) {
      fail(dir, `files 没有列出 ${top}`)
    }

    const markdown = readFileSync(documentPath, 'utf8')
    const targets = imageTargets(markdown)
    if (targets.length !== 1) fail(dir, `${detail} 应只引用一张图，实际 ${String(targets.length)} 张`)
    if (hasOtherContent(markdown)) fail(dir, `${detail} 除图片外还有正文`)
    for (const { alt, target } of targets) {
      if (alt.trim().length < 8) fail(dir, `${detail} 的图片替代文字太短，写清图里画了什么`)
      if (isAbsolute(target) || /^[a-z]+:/i.test(target)) {
        fail(dir, `${detail} 引用了包外图片 ${target}`)
        continue
      }
      const imagePath = resolve(dirname(documentPath), target)
      if (!imagePath.startsWith(root + '/')) {
        fail(dir, `${detail} 的图片 ${target} 在包外`)
        continue
      }
      if (!existsSync(imagePath)) {
        fail(dir, `${detail} 的图片 ${target} 不存在`)
        continue
      }
      checkImage(dir, imagePath)
      documents.push({ language, document: detail, image: imagePath })
    }
  }

  if (documents.length === 2) {
    if (documents[0].image === documents[1].image) fail(dir, '中英两份文档引用了同一张图')
    else if (readFileSync(documents[0].image).equals(readFileSync(documents[1].image))) fail(dir, '中英两张配图内容相同')
    const bytes = documents.reduce((sum, entry) => sum + statSync(entry.image).size, 0)
    if (bytes > MAX_PAIR_BYTES) fail(dir, `两张配图合计 ${String(bytes)} 字节，超过 1 MiB`)
  }
}

if (!existsSync(PLUGINS)) {
  console.error('找不到 plugins/，请在仓库根运行')
  process.exit(2)
}

const packages = readdirSync(PLUGINS, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && existsSync(join(PLUGINS, entry.name, 'package.json')))
  .map(entry => entry.name)
  .sort()

for (const dir of packages) {
  try {
    checkPackage(dir)
  } catch (error) {
    console.error(`${dir}: 读不了——${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 2
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure}`)
  console.error(`\n${String(failures.length)} 条不通过`)
  process.exit(1)
}

console.log(`✓ ${String(packages.length)} 个包的详情文档与配图`)
