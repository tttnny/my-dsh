/**
 * DSH 源码 checkout：按发布 tag 读宿主源码。
 *
 * 已装内核只保留最新一版，而「这一版到底改了什么」要跟上一版比。源码 checkout 上的
 * `dsh-v<版本>` tag 一直在，所以它才是常规路径的比对来源。位置默认取仓库同级目录
 * `../other/deepseek-harness`（本机布局），可用 `DSH_SOURCE` 指定。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 找 DSH 源码 checkout。
 * @param {string} root - 本仓库根。
 * @returns {string|undefined} 带 `.git` 的 checkout 目录；这台机器没有时返回 undefined。
 */
export function dshSourceDir(root) {
  const candidates = [
    process.env.DSH_SOURCE,
    resolve(root, '..', 'other', 'deepseek-harness'),
    resolve(root, '..', 'deepseek-harness'),
  ].filter((dir) => typeof dir === 'string' && dir !== '');
  return candidates.find((dir) => existsSync(join(dir, '.git')));
}

/**
 * 在 checkout 里跑一条 git。
 * @param {string} dir - checkout 目录。
 * @param {string[]} args - git 参数（不含 `-C`）。
 * @returns {{status: number, stdout: string, stderr: string}} 退出码与输出。
 */
export function git(dir, args) {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** 版本号 → 发布 tag 名。 */
export function sourceTag(version) {
  return `dsh-v${version}`;
}

/**
 * 列 checkout 里的发布 tag（新到旧）。
 * @param {string} dir - checkout 目录。
 * @returns {string[]} tag 名。
 */
export function sourceTags(dir) {
  const result = git(dir, ['tag', '--list', 'dsh-v*', '--sort=-v:refname']);
  return result.status === 0 ? result.stdout.split('\n').filter(Boolean) : [];
}

/**
 * 读 tag 里的一份文件。
 * @param {string} dir - checkout 目录。
 * @param {string} tag - tag 名。
 * @param {string} path - 仓库内相对路径。
 * @returns {string|undefined} 文件内容；不存在时 undefined。
 */
export function readSourceFile(dir, tag, path) {
  const result = git(dir, ['show', `${tag}:${path}`]);
  return result.status === 0 ? result.stdout : undefined;
}

/**
 * 判断 tag 里有没有某份文件。
 * @param {string} dir - checkout 目录。
 * @param {string} tag - tag 名。
 * @param {string} path - 仓库内相对路径。
 * @returns {boolean} 存在与否。
 */
export function sourceFileExists(dir, tag, path) {
  return git(dir, ['cat-file', '-e', `${tag}:${path}`]).status === 0;
}

/**
 * 按发布 tag 取官方 preset 文件。
 * @param {string} dir - checkout 目录。
 * @param {string} tag - tag 名。
 * @param {string} official - 官方 preset id（`cordis`、`minimal` 等）。
 * @returns {string|undefined} 文件内容；路径不存在时 undefined。
 */
export function readOfficialPreset(dir, tag, official) {
  return readSourceFile(dir, tag, `packages/bundle/web-app/presets/${official}.patch.yml`);
}
