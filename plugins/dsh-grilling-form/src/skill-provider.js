// 随包技能：三份 DSH 适配版正文。启用本插件时，provider 注册进每个 agent 自己的层，
// 盖过预设层里的同名技能；停用即退场。
//
// 为什么不是根层的一个 provider：预设把 skill-filesystem 挂在 preset 层，注册表按 scope 链
// 覆盖，近的层直接赢，rank 只在同一层里比；根层 rank 0 也压不过 preset 层。所以注册走
// agent.ctx（见 src/index.js）。
//
// 正文是 matt-skills-lynn 里三个技能的适配版副本（含与 harness 无关的增强）。那边改动后
// 要把正文同步回本包 skills/；scripts/test-skill-provider.mjs 守着正文里必须出现的那几句。

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** provider 在技能注册表里的名字。 */
export const SKILL_PROVIDER_NAME = 'dsh-grilling-form';
/** 同一层里的去重优先级；跨层由层的远近决定，所以 provider 要注册到 agent 层。 */
export const SKILL_RANK = 0;
/** 候选的来源标签；只作元数据，不参与优先级。 */
export const SKILL_SOURCE = 'plugin';
/** 随包覆盖的三个技能，顺序就是 list() 的顺序。 */
export const SKILL_NAMES = ['grilling', 'implement-spec', 'code-review'];

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// 类型直接用宿主包发布的契约：@deepseek-ai/dsh-skill 是 devDependency，只供 tsc 解析 JSDoc，
// 构建产物里没有它的运行时导入。
/** @typedef {import('@deepseek-ai/dsh-skill').SkillInvocationPolicy} SkillInvocation */
/** @typedef {import('@deepseek-ai/dsh-skill').SkillResourceBase} SkillResourceBase */
/** @typedef {import('@deepseek-ai/dsh-skill').SkillDefinition} SkillDefinition */
/** @typedef {import('@deepseek-ai/dsh-skill').SkillCandidate} SkillCandidate */
/** @typedef {import('@deepseek-ai/dsh-skill').SkillProvider} SkillProvider */

/**
 * 读一个 frontmatter 标量：带引号的按 JSON 解析，不带引号的取整行。
 * @param {string|undefined} value 冒号后面的原文（已去首尾空白）。
 * @param {string} filePath 出错时写进说明的文件路径。
 * @param {string} key 字段名。
 * @returns {string|undefined} 标量；没写时 undefined。
 */
function readScalar(value, filePath, key) {
  if (value === undefined) return undefined;
  if (!value.startsWith('"')) return value;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') return parsed;
  } catch {
    // 落到下面的统一报错。
  }
  throw new TypeError(filePath + ': frontmatter field "' + key + '" is not a valid quoted string');
}

/**
 * 读一个 frontmatter 布尔值，认 YAML 的几种写法。
 * @param {string|undefined} value 冒号后面的原文。
 * @param {string} filePath 出错时写进说明的文件路径。
 * @param {string} key 字段名。
 * @returns {boolean|undefined} 布尔值；没写时 undefined。
 */
function readBoolean(value, filePath, key) {
  if (value === undefined) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true;
  if (normalized === 'false' || normalized === 'no' || normalized === '0') return false;
  throw new TypeError(filePath + ': frontmatter field "' + key + '" must be a boolean');
}

/**
 * 解析一份 SKILL.md：只认本包三份文件用到的 frontmatter 子集。
 * @param {unknown} raw 文件原文。
 * @param {string} filePath 出错时写进说明的文件路径。
 * @returns {{ name: string, description: string, invocation: SkillInvocation, content: string }} 解析结果。
 */
export function parseSkillMarkdown(raw, filePath) {
  const text = typeof raw === 'string' ? raw : '';
  const lines = text.split('\n');
  if ((lines[0] ?? '').replace(/\r$/, '') !== '---') {
    throw new TypeError(filePath + ': missing YAML frontmatter');
  }
  let closing = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].replace(/\r$/, '') === '---') {
      closing = index;
      break;
    }
  }
  if (closing === -1) throw new TypeError(filePath + ': unterminated YAML frontmatter');

  /** @type {Map<string, string>} */
  const fields = new Map();
  for (let index = 1; index < closing; index += 1) {
    const line = lines[index].replace(/\r$/, '');
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) throw new TypeError(filePath + ': frontmatter line without a colon: ' + line);
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }

  const name = readScalar(fields.get('name'), filePath, 'name');
  if (name === undefined || !SKILL_NAME.test(name)) {
    throw new TypeError(filePath + ': frontmatter requires a kebab-case name');
  }
  const description = readScalar(fields.get('description'), filePath, 'description');
  if (description === undefined || description === '') {
    throw new TypeError(filePath + ': frontmatter requires a description');
  }
  const disableModelInvocation = readBoolean(fields.get('disable-model-invocation'), filePath, 'disable-model-invocation');
  const userInvocable = readBoolean(fields.get('user-invocable'), filePath, 'user-invocable');
  return {
    name,
    description,
    invocation: {
      modelInvocable: disableModelInvocation !== true,
      userInvocable: userInvocable !== false,
    },
    content: lines.slice(closing + 1).join('\n').trim(),
  };
}

/**
 * 读三份随包技能。文件缺失或 frontmatter 坏时直接抛，让插件在装载时就红。
 * @param {URL} [baseUrl] 技能目录，默认是包根下的 skills/。
 * @returns {Map<string, SkillDefinition>} 名字到定义的映射。
 */
export function loadSkills(baseUrl = new URL('../skills/', import.meta.url)) {
  const directory = resolve(fileURLToPath(baseUrl));
  /** @type {Map<string, SkillDefinition>} */
  const definitions = new Map();
  for (const name of SKILL_NAMES) {
    const path = join(directory, name, 'SKILL.md');
    const parsed = parseSkillMarkdown(readFileSync(path, 'utf8'), path);
    if (parsed.name !== name) {
      throw new TypeError(path + ': frontmatter name "' + parsed.name + '" does not match its directory');
    }
    definitions.set(name, {
      name: parsed.name,
      description: parsed.description,
      invocation: parsed.invocation,
      source: SKILL_SOURCE,
      provider: SKILL_PROVIDER_NAME,
      resourceBase: { kind: 'directory', path: directory },
      path,
      content: parsed.content,
    });
  }
  return definitions;
}

/**
 * 把三份定义包成技能注册表认的 provider。
 * @param {Map<string, SkillDefinition>} definitions loadSkills() 的产物。
 * @returns {SkillProvider} provider。
 */
export function createSkillProvider(definitions) {
  return {
    name: SKILL_PROVIDER_NAME,
    async list() {
      return SKILL_NAMES.map((name) => {
        const definition = definitions.get(name);
        if (definition === undefined) throw new TypeError('missing skill definition for "' + name + '"');
        return {
          name: definition.name,
          description: definition.description,
          invocation: definition.invocation,
          source: definition.source,
          provider: definition.provider,
          resourceBase: definition.resourceBase,
          path: definition.path,
          rank: SKILL_RANK,
          locator: definition.name,
        };
      });
    },
    async get(candidate) {
      return typeof candidate.locator === 'string' ? definitions.get(candidate.locator) : undefined;
    },
  };
}
