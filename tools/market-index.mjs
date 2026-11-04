#!/usr/bin/env node
/**
 * 生成插件索引（plugin market index format 1）：把 plugins/ 与 presets/ 下已发布到 npm 的 bundle
 * 汇总成一份 JSON，连同图标一起写到输出目录，供 DSH 的「发现」页作为索引源读取。
 *
 * 数据来源分两半：
 *   - 版本、发布时间、dist-tags、engines.dsh：npm registry 的 packument，只列声明了 dsh.bundle 的版本；
 *   - 标题、描述、图标：仓库里包的 locale/<lang>.json 与 assets/icon.svg；preset 的显示名与描述取自它
 *     bundle patch 里的 preset 行（DSH 会话选择器显示的就是那一行）。
 *
 * 索引是生成物，不入库：Pages 工作流在发布时现生成现部署，仓库里不放一份会过期的副本。
 *
 * 用法：
 *   node tools/market-index.mjs                        # 写到 tmp/market/
 *   node tools/market-index.mjs --out site             # 写到指定目录
 *   node tools/market-index.mjs --url <索引 URL>        # 相对图标按这个 URL 解析；默认由 origin 推出
 *   node tools/market-index.mjs --registry <registry>  # 换 registry（默认 https://registry.npmjs.org）
 *   node tools/market-index.mjs --json                 # 机器读
 * 退出码：0 成功，1 生成的索引不过自检，2 跑不起来（网络、参数、包没发布）。
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { listPackages, readJson, repoRoot, writeJson } from './lib/repo.mjs';

/** 精确 SemVer 2.0.0，与 DSH 索引校验器同一条规则。 */
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/u;
/** npm 包名，与 DSH 索引校验器同一条规则。 */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;
/** engines.dsh 的字形检查：完整区间求值由 DSH 读取索引时做，这里只挡明显的坏值。 */
const RANGE = /^[0-9A-Za-z.+<>=^~|* -]+$/u;
const PACKAGE_NAME_MAX_LENGTH = 214;
const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/** 逐个解析 --k v 与 --flag。 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const next = argv[i + 1];
    out[key.slice(2)] = next === undefined || next.startsWith('--') ? true : ((i += 1), next);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const known = new Set(['out', 'url', 'registry', 'json']);
for (const key of Object.keys(args)) {
  if (!known.has(key)) {
    console.error(`market-index: 认不得的参数 --${key}；只认 --out、--url、--registry 与 --json`);
    process.exit(2);
  }
}
const json = args.json === true;

const root = repoRoot(resolve(join(import.meta.dirname, '..')));
const outDir = resolve(root, typeof args.out === 'string' ? args.out : 'tmp/market');
const iconsDir = join(outDir, 'icons');
const registry = (typeof args.registry === 'string' ? args.registry : DEFAULT_REGISTRY).replace(/\/+$/u, '');

/** 由 origin 推出 GitHub Pages 上的索引 URL，避免把地址在仓库里写第二遍。 */
function defaultIndexUrl(repo) {
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: repo, encoding: 'utf8' });
  const text = (remote.stdout ?? '').trim();
  const match = /^(?:https:\/\/|git@)github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/u.exec(text);
  if (match === null) {
    console.error(`market-index: 从 origin 推不出 GitHub Pages 地址（${text || '没有 origin'}）；用 --url 给一个`);
    process.exit(2);
  }
  return `https://${match[1]}.github.io/${match[2]}/index.json`;
}

const indexUrl = typeof args.url === 'string' ? args.url : defaultIndexUrl(root);

/** 读一个包 locale/ 下的标题与描述，合成索引要的 LocalizedText。 */
function readLocale(dir) {
  const texts = {};
  for (const language of ['en', 'zh']) {
    const path = join(dir, 'locale', `${language}.json`);
    if (!existsSync(path)) continue;
    let meta;
    try {
      meta = readJson(path).meta;
    } catch {
      continue;
    }
    if (meta === undefined || meta === null) continue;
    if (typeof meta.title === 'string') (texts.title ??= {})[language] = meta.title;
    if (typeof meta.description === 'string') (texts.description ??= {})[language] = meta.description;
  }
  // 索引要求带 en 的对象；只有别的语言时退回单字符串。
  const finish = (value) => {
    if (value === undefined) return undefined;
    if (value.en !== undefined) return value;
    return Object.values(value)[0];
  };
  return { title: finish(texts.title), description: finish(texts.description) };
}

/** 去掉 YAML 标量外层的引号。 */
function unquote(text) {
  const trimmed = text.trim();
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

/**
 * 读 preset 的显示名与描述：它们写在 bundle patch 的 preset 行里，DSH 会话选择器显示的就是这一行，
 * 索引从这里读，不在别处再存一份。
 */
function readPresetDisplay(dir, pkg) {
  const patch = pkg.dsh?.bundle?.patch;
  if (typeof patch !== 'string') return {};
  const path = join(dir, patch);
  if (!existsSync(path)) return {};
  const lines = readFileSync(path, 'utf8').split('\n');
  const anchor = lines.findIndex((line) => line.includes('@deepseek-ai/dsh-agent-preset'));
  if (anchor === -1) return {};
  const configAt = lines.findIndex((line, index) => index > anchor && /^\s*config:\s*$/u.test(line));
  if (configAt === -1) return {};
  const indentOf = (line) => line.length - line.trimStart().length;
  const configIndent = indentOf(lines[configAt]);
  const out = {};
  for (const line of lines.slice(configAt + 1)) {
    if (line.trim() === '') continue;
    if (indentOf(line) <= configIndent) break;
    const match = /^\s*(name|description):\s*(.+)$/u.exec(line);
    if (match === null) continue;
    const key = match[1] === 'name' ? 'title' : 'description';
    if (out[key] === undefined) out[key] = unquote(match[2]);
  }
  return out;
}

/** 把 package.json 的 repository 归一成索引要的仓库网页 + 目录。 */
function toRepository(value) {
  if (value === undefined || value === null) return undefined;
  const raw = typeof value === 'string' ? value : value.url;
  if (typeof raw !== 'string') return undefined;
  const url = raw
    .replace(/^git\+/u, '')
    .replace(/^git:\/\//u, 'https://')
    .replace(/^ssh:\/\/git@/u, 'https://')
    .replace(/^git@([^:]+):/u, 'https://$1/')
    .replace(/\.git$/u, '');
  if (!URL.canParse(url)) return undefined;
  const directory = typeof value === 'object' ? value.directory : undefined;
  return { url: new URL(url).href, ...directory === undefined ? {} : { directory } };
}

/** 取一个包的 packument；scoped 名字按 registry 认的 @scope%2Fname 形式转义。 */
async function fetchPackument(name) {
  const url = `${registry}/${name.replace('/', '%2F')}`;
  let response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  } catch (error) {
    throw new Error(`读不到 ${url}：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`读不到 ${url}：HTTP ${response.status}`);
  return response.json();
}

/**
 * 把一个包变成索引里的一条。
 * @param {{kind: 'plugin'|'preset', dir: string, name: string, pkg: any}} info - listPackages 给出的一条。
 * @returns {Promise<{entry: any, notes: string[]}>} 索引条目与生成过程中的说明。
 */
async function buildEntry(info) {
  const { kind, dir, name, pkg } = info;
  const notes = [];
  const packument = await fetchPackument(name);
  const listed = new Set();
  const versions = [];
  for (const [version, manifest] of Object.entries(packument.versions ?? {})) {
    if (!SEMVER.test(version)) {
      notes.push(`${name}@${version} 不是精确 SemVer`);
      continue;
    }
    if (manifest.dsh?.bundle === undefined) {
      notes.push(`${name}@${version} 没有声明 dsh.bundle`);
      continue;
    }
    const range = manifest.engines?.dsh;
    if (typeof range !== 'string' || range.trim() === '' || !RANGE.test(range)) {
      notes.push(`${name}@${version} engines.dsh 缺失或不是区间（${JSON.stringify(range)}）`);
      continue;
    }
    const published = packument.time?.[version];
    const timestamp = published === undefined ? Number.NaN : Date.parse(published);
    if (Number.isNaN(timestamp)) {
      notes.push(`${name}@${version} registry 没有发布时间`);
      continue;
    }
    listed.add(version);
    versions.push({
      version,
      publishTimestamp: Math.floor(timestamp / 1000),
      source: { type: 'npm' },
      engines: { dsh: range },
    });
  }
  if (versions.length === 0) throw new Error(`${name} 在 ${registry} 上没有可列的版本：一个声明了 dsh.bundle 的发布版本都没有`);

  const locale = readLocale(dir);
  const preset = kind === 'preset' ? readPresetDisplay(dir, pkg) : {};
  const title = locale.title ?? preset.title;
  const description = locale.description ?? preset.description;

  let icon;
  const iconPath = join(dir, 'assets', 'icon.svg');
  if (existsSync(iconPath)) {
    mkdirSync(iconsDir, { recursive: true });
    const file = `${name.split('/').pop()}.svg`;
    copyFileSync(iconPath, join(iconsDir, file));
    icon = `icons/${file}`;
  }

  const repository = toRepository(pkg.repository);
  const distTags = {};
  for (const [tag, target] of Object.entries(packument['dist-tags'] ?? {})) {
    if (listed.has(target)) distTags[tag] = target;
  }

  const entry = {
    name,
    ...title === undefined ? {} : { title },
    ...description === undefined ? {} : { description },
    ...icon === undefined ? {} : { icon },
    ...repository === undefined ? {} : { repository },
    metadata: {
      category: kind,
      keywords: Array.isArray(pkg.keywords) ? pkg.keywords : [],
    },
    ...Object.keys(distTags).length === 0 ? {} : { 'dist-tags': distTags },
    versions,
  };
  return { entry, notes };
}

/** 自检：DSH 读取索引时会拒绝的规则，这里能查的都查一遍。 */
function assertIndex(index, url) {
  const problems = [];
  const fail = (path, reason) => problems.push(`${path} ${reason}`);
  if (index.format !== 1) fail('$.format', '必须是 1');
  if (!URL.canParse(url)) fail('$', `索引 URL ${JSON.stringify(url)} 不是绝对 URL`);
  const localized = (value, path) => {
    if (typeof value === 'string') {
      if (value.trim() === '') fail(path, '不能是空白字符串');
      return;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      fail(path, '必须是字符串或语言对象');
      return;
    }
    if (value.en === undefined) fail(path, '必须包含 en');
    for (const [language, text] of Object.entries(value)) {
      if (!/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/u.test(language)) fail(`${path}.${language}`, '必须是小写语言 id');
      if (typeof text !== 'string' || text.trim() === '') fail(`${path}.${language}`, '不能是空白字符串');
    }
  };
  localized(index.title, '$.title');
  if (index.description !== undefined) localized(index.description, '$.description');
  const names = new Set();
  index.plugins.forEach((plugin, position) => {
    const at = `$.plugins[${position}]`;
    if (typeof plugin.name !== 'string' || plugin.name.length > PACKAGE_NAME_MAX_LENGTH || !PACKAGE_NAME.test(plugin.name)) {
      fail(`${at}.name`, '不是合法的 npm 包名');
    } else if (names.has(plugin.name)) {
      fail(`${at}.name`, `重复 ${plugin.name}`);
    } else {
      names.add(plugin.name);
    }
    if (plugin.title !== undefined) localized(plugin.title, `${at}.title`);
    if (plugin.description !== undefined) localized(plugin.description, `${at}.description`);
    if (plugin.icon !== undefined && !plugin.icon.startsWith('data:')) {
      const resolved = new URL(plugin.icon, url);
      if (resolved.protocol !== 'https:' && resolved.origin !== new URL(url).origin) {
        fail(`${at}.icon`, '必须解析到 https 或索引同源');
      }
    }
    if (plugin.homepage !== undefined && !URL.canParse(plugin.homepage)) fail(`${at}.homepage`, '必须是绝对 URL');
    if (plugin.repository !== undefined) {
      if (!URL.canParse(plugin.repository.url)) fail(`${at}.repository.url`, '必须是绝对 URL');
      if (plugin.repository.url.includes('?') || plugin.repository.url.includes('#')) {
        fail(`${at}.repository.url`, '不能带查询或片段');
      }
    }
    const category = plugin.metadata?.category;
    if (category !== undefined && index.metadata.categories[category] === undefined) {
      fail(`${at}.metadata.category`, `引用了未声明的分类 ${category}`);
    }
    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) {
      fail(`${at}.versions`, '必须是非空数组');
      return;
    }
    const seen = new Set();
    plugin.versions.forEach((version, position_) => {
      const versionAt = `${at}.versions[${position_}]`;
      if (!SEMVER.test(version.version)) fail(`${versionAt}.version`, '不是精确 SemVer');
      if (seen.has(version.version)) fail(`${versionAt}.version`, `重复 ${version.version}`);
      seen.add(version.version);
      if (!Number.isInteger(version.publishTimestamp) || version.publishTimestamp < 0) {
        fail(`${versionAt}.publishTimestamp`, '必须是非负整数秒');
      }
      if (version.source?.type !== 'npm' && version.source?.type !== 'git') fail(`${versionAt}.source.type`, '必须是 npm 或 git');
      if (version.engines?.dsh !== undefined && (typeof version.engines.dsh !== 'string' || version.engines.dsh.trim() === '')) {
        fail(`${versionAt}.engines.dsh`, '必须是非空字符串');
      }
    });
  });
  return problems;
}

const infos = listPackages(root).filter((info) => info.pkg.dsh?.bundle !== undefined);
if (infos.length === 0) {
  console.error('market-index: 仓库里没有声明 dsh.bundle 的包');
  process.exit(2);
}

const entries = [];
const notes = [];
for (const info of infos) {
  const result = await buildEntry(info);
  entries.push(result.entry);
  notes.push(...result.notes);
}

const index = {
  format: 1,
  title: { en: 'my-dsh', zh: 'my-dsh' },
  description: {
    en: 'DSH plugins and presets published from the my-dsh repository.',
    zh: 'my-dsh 仓库发布的 DSH 插件与 preset。',
  },
  metadata: {
    categories: {
      plugin: { title: { en: 'Plugins', zh: '插件' } },
      preset: { title: { en: 'Presets', zh: 'Preset' } },
    },
  },
  plugins: entries,
};

const problems = assertIndex(index, indexUrl);
if (problems.length > 0) {
  for (const problem of problems) console.error(`market-index: ${problem}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeJson(join(outDir, 'index.json'), index);

if (json) {
  console.log(JSON.stringify({
    indexUrl,
    outDir,
    plugins: entries.map((entry) => ({ name: entry.name, versions: entry.versions.length })),
    notes,
  }, null, 2));
} else {
  console.log(`索引：${join(outDir, 'index.json')}`);
  console.log(`地址：${indexUrl}`);
  for (const entry of entries) {
    const title = typeof entry.title === 'string' ? entry.title : entry.title?.zh ?? entry.title?.en;
    console.log(`  ${entry.name}  ${entry.versions.length} 个版本  ${title ?? ''}`);
  }
  for (const note of notes) console.log(`  跳过：${note}`);
}
