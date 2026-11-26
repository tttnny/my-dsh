#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, posix, resolve } from 'node:path';
import { listPackages, readJson, repoRoot, writeJson } from './lib/repo.mjs';

const [command, input, destination] = process.argv.slice(2);

function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function exportPaths(value) {
  if (typeof value === 'string') return value.startsWith('./') && !value.includes('*') ? [value] : [];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(exportPaths);
}

function assertPackedFiles({ dir, kind, pkg }, files) {
  const patch = pkg.dsh?.bundle?.patch;
  if (typeof patch !== 'string' || !patch) throw new Error(pkg.name + '：缺 bundle patch 声明');
  const required = ['package.json', patch, pkg.main, pkg.icon, ...exportPaths(pkg.exports)];
  if (pkg.dsh?.client) {
    const client = pkg.exports?.['./client'];
    const entry = typeof client === 'string' ? client : client?.default;
    if (typeof entry !== 'string' || !entry) throw new Error(pkg.name + '：缺客户端出口 ./client');
    required.push(entry);
  }
  if (kind === 'plugin') {
    for (const language of ['en', 'zh']) {
      const locale = 'locale/' + language + '.json';
      const detail = readJson(join(dir, locale)).meta.detail;
      const image = /!\[[^\]]*\]\(([^)\s]+)/.exec(readFileSync(join(dir, detail), 'utf8'))?.[1];
      if (!image) throw new Error(pkg.name + '：缺详情配图 ' + detail);
      required.push(locale, detail, posix.join(posix.dirname(detail), image));
    }
  }
  const included = new Set(files.map(({ path }) => path));
  const missing = required.filter((path) => path && !included.has(path.replace(/^\.\//, '')));
  if (missing.length) throw new Error(pkg.name + ' 的压缩包缺少 ' + missing.join('、'));
}

function pack(planFile, outputDir) {
  const plan = readJson(planFile);
  if (!plan.publish?.length) throw new Error('没有可打包的包');
  const packages = new Map(listPackages(repoRoot(import.meta.dirname)).map((entry) => [entry.rel, entry]));
  mkdirSync(outputDir, { recursive: true });
  const archives = plan.publish.map(({ rel, name, version }) => {
    const entry = packages.get(rel);
    if (entry?.name !== name || entry.pkg.version !== version) throw new Error('包声明与计划不一致：' + rel);
    console.log('\n=== npm pack ' + name + '@' + version);
    const result = spawnSync('npm', ['pack', '--json', '--pack-destination', outputDir], {
      cwd: entry.dir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) throw new Error(name + ' 打包失败：' + (result.error?.message ?? (result.stdout?.trim() || result.signal || result.status)));
    const [archive] = JSON.parse(result.stdout);
    if (archive.name !== name || archive.version !== version || basename(archive.filename) !== archive.filename) {
      throw new Error('压缩包与计划不一致：' + rel);
    }
    assertPackedFiles(entry, archive.files);
    const digest = sha256(join(outputDir, archive.filename));
    console.log(archive.filename + ' · ' + archive.files.length + ' 个文件 · SHA-256 ' + digest);
    return { name, version, filename: archive.filename, sha256: digest };
  });
  writeJson(join(outputDir, 'archives.json'), archives);
  summary('## 已检查的发布压缩包\n\n' + archives.map((entry) => '- ' + entry.name + '@' + entry.version + ' · SHA-256 ' + entry.sha256).join('\n'));
}

function publish(dir) {
  if (!process.env.NODE_AUTH_TOKEN) throw new Error('缺少 NPM_TOKEN secret');
  const tag = process.env.DIST_TAG || 'latest';
  const archives = readJson(join(dir, 'archives.json'));
  if (!archives.length) throw new Error('没有已检查的发布压缩包');
  for (const archive of archives) {
    if (basename(archive.filename) !== archive.filename || sha256(join(dir, archive.filename)) !== archive.sha256) {
      throw new Error('压缩包校验失败：' + archive.filename);
    }
  }
  const published = [];
  let failed;
  try {
    for (const archive of archives) {
      const { filename, name, version } = archive;
      console.log('\n=== npm publish ' + name + '@' + version + '（' + tag + '）');
      const result = spawnSync('npm', ['publish', join(dir, filename), '--ignore-scripts', '--access', 'public', '--tag=' + tag], { stdio: 'inherit' });
      if (result.status !== 0) {
        failed = archive;
        throw new Error(name + '@' + version + ' 发布失败：' + (result.error?.message ?? result.signal ?? result.status));
      }
      published.push({ name, version, tag });
    }
  } finally {
    // 其中一包失败时，也要把已发布的包交给索引构建。
    const lines = archives.map((archive, index) => {
      const status = index < published.length ? '已发布' : archive === failed ? '失败' : '未尝试';
      return '- ' + status + ' · ' + archive.name + '@' + archive.version;
    });
    const remaining = archives.slice(published.length).map(({ name }) => name);
    if (remaining.length) lines.push('', '待续发包名（若失败原因是响应不明，先核对该包是否已发）', '', remaining.join(', '));
    summary('## npm 发布结果 · ' + tag + '\n\n' + lines.join('\n'));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'published=' + JSON.stringify(published) + '\n');
  }
}

try {
  if (command === 'pack' && input && destination) pack(resolve(input), resolve(destination));
  else if (command === 'publish' && input && !destination) publish(resolve(input));
  else throw new Error('用法：release-packages.mjs pack <计划 JSON> <产物目录> 或 publish <产物目录>');
} catch (error) {
  console.error('release-packages: ' + error.message);
  process.exitCode = 1;
}
