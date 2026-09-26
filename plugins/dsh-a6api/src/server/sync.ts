import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { getCatalogEntry } from './catalog.js';
import { deriveUserIdFromToken } from './a6api-client.js';
import type { A6ApiConfig } from '../types.js';

/**
 * DSH 原生配置整合（消除插件独立配置文件 dsh-a6api-config.json）：
 * - 凭据（API Key / 系统访问令牌 / userId）→ ~/.dsh/.credentials.yaml（refs，0600）
 * - 非机密状态（baseURL / 模型列表）→ 当前 Profile 的 `llm-pi-ai` 条目配置（`ctx.settings` 是
 *   SettingsForms：`describe()` 读，`update()`/`mutate()` 写，字段须为 Volatile 才可热更新；
 *   旧 `~/.dsh/settings.yaml` 已被内核一次性导入并改名 `.imported`，不再是可读可写的落点）
 * - 凭据 → `ctx.credentials`（env 优先语义），缺失时兜底直读 ~/.dsh/.credentials.yaml。
 * - 配置服务的写失败直接抛出：0.1.7 起没有可替代的配置文件落点（见 syncModels）。
 * - 旧版插件私有配置文件在启动时自动迁移（只填空不覆盖）并归档为 dsh-a6api-config.json.bak。
 */

export const A6API_CRED_REF = 'A6API_API_KEY';
export const A6API_TOKEN_REF = 'A6API_ACCESS_TOKEN';
export const A6API_USER_REF = 'A6API_USER_ID';

const SETTINGS_NS = 'llm-pi-ai';
const PROVIDER_KEY = 'a6api';
const DEFAULT_BASE_URL = 'https://api.a6api.com';
const LEGACY_CONFIG_NAME = 'dsh-a6api-config.json';

/** 原子写入：先写临时文件（0600/0644）再 rename，避免崩溃截断与权限位泄露 */
async function atomicWriteFile(filePath: string, content: string, mode = 0o600): Promise<void> {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fsp.writeFile(tmpPath, content, { mode });
  await fsp.rename(tmpPath, filePath);
}

function dshHome(): string {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function legacyConfigFile(): string {
  return path.join(dshHome(), LEGACY_CONFIG_NAME);
}

function credentialsFile(): string {
  return path.join(dshHome(), '.credentials.yaml');
}

/** 取凭据服务；缺失时返回 undefined（凭据读写仍兜底直读 ~/.dsh/.credentials.yaml） */
function getCredentials(ctx: any) {
  try {
    if (ctx && typeof ctx.get === 'function') return ctx.get('credentials');
  } catch {}
  return undefined;
}

/** 取设置表单服务（SettingsForms）；缺失时返回 undefined（读按默认值，写直接抛错） */
function getSettings(ctx: any) {
  try {
    if (ctx && typeof ctx.get === 'function') return ctx.get('settings');
  } catch {}
  return undefined;
}

/** 去掉 OpenAI 兼容端点的 /v1 后缀，还原插件 API 调用所用的裸地址 */
function stripV1(baseURL: string): string {
  return baseURL.replace(/\/v1\/?$/, '');
}

// ===== .credentials.yaml 手写读写（原生缝缺失时的兜底，格式与 DSH 一致：version:1 + refs） =====

/** Read a key from .credentials.yaml */
export async function readCredentialKey(refKey: string): Promise<string | null> {
  try {
    const yaml = await fsp.readFile(credentialsFile(), 'utf8');
    let inRefs = false;
    for (const line of yaml.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent === 0) {
        inRefs = trimmed.startsWith('refs:');
        continue;
      }
      if (!inRefs) continue;
      const m = /^([A-Za-z0-9_.\-]+):\s*(.*)$/.exec(trimmed);
      if (m && m[1] === refKey) {
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        return val || null;
      }
    }
  } catch {}
  return null;
}

/**
 * Write/update a key in .credentials.yaml。
 * DSH credentials-local 对空 ref 值整体拒收文档（parseRefs 抛错），因此
 * 空串/undefined = 删除该键行（与原生 unset 语义一致），绝不写入空值。
 */
export async function writeCredentialKey(refKey: string, value: string): Promise<void> {
  const cFile = credentialsFile();
  let yaml = '';
  try {
    yaml = await fsp.readFile(cFile, 'utf8');
  } catch {
    yaml = 'version: 1\nrefs:\n';
  }

  const lines = yaml.split(/\r?\n/);
  let inRefs = false;
  let refsLineIdx = -1;
  let foundIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent === 0) {
      if (trimmed.startsWith('refs:')) {
        inRefs = true;
        refsLineIdx = i;
      } else {
        inRefs = false;
      }
      continue;
    }
    if (inRefs) {
      const m = /^([A-Za-z0-9_.\-]+):/.exec(trimmed);
      if (m && m[1] === refKey) {
        foundIdx = i;
        break;
      }
    }
  }

  if (value === '') {
    // 删除语义：移除该键行（refs 下无其他键时保留空的 refs: 骨架，是合法空存储）
    if (foundIdx >= 0) lines.splice(foundIdx, 1);
  } else {
    if (foundIdx >= 0) {
      lines[foundIdx] = `  ${refKey}: ${JSON.stringify(value)}`;
    } else {
      if (refsLineIdx >= 0) {
        lines.splice(refsLineIdx + 1, 0, `  ${refKey}: ${JSON.stringify(value)}`);
      } else {
        lines.push('refs:', `  ${refKey}: ${JSON.stringify(value)}`);
      }
    }
  }

  await atomicWriteFile(cFile, lines.join('\n'), 0o600);
}

// ===== 旧版独立配置文件（dsh-a6api-config.json）读取与规范化 =====

/** 旧字段别名收敛：accessToken / systemAccessToken / sessionCookie 是同一个凭据的历代命名 */
function normalizeLegacy(parsed: any): {
  baseURL: string;
  apiKey: string;
  accessToken: string;
  userId: string;
  activeModels: string[];
} {
  return {
    apiKey: typeof parsed?.apiKey === 'string' ? parsed.apiKey : '',
    accessToken: String(parsed?.accessToken || parsed?.systemAccessToken || parsed?.sessionCookie || ''),
    userId: String(parsed?.userId || ''),
    baseURL: typeof parsed?.baseURL === 'string' && parsed.baseURL ? parsed.baseURL : DEFAULT_BASE_URL,
    activeModels: Array.isArray(parsed?.activeModels) ? parsed.activeModels.filter((m: any) => typeof m === 'string') : [],
  };
}

/** 旧文件读取（迁移未完成/失败时的末级兜底；别名只在读取链上存在） */
async function readLegacyConfig(): Promise<A6ApiConfig | null> {
  try {
    const raw = await fsp.readFile(legacyConfigFile(), 'utf8');
    const legacy = normalizeLegacy(JSON.parse(raw));
    return {
      baseURL: legacy.baseURL,
      apiKey: legacy.apiKey,
      accessToken: legacy.accessToken || undefined,
      userId: legacy.userId || undefined,
      activeModels: legacy.activeModels,
    };
  } catch {
    return null;
  }
}

/** 构建 llm-pi-ai.providers.a6api 块（与 DSH 原生 schema 兼容：openai-completions + /v1 端点）。
 *  参数来自模型目录（getCatalogEntry）：有则写入，缺则省略该字段（llm-pi-ai 默认值兜底）。 */
function buildA6apiBlock(baseURL: string, modelIds: string[]): Record<string, any> {
  const models = modelIds.map((id) => {
    const entry = getCatalogEntry(id);
    const m: Record<string, any> = { id };
    if (entry?.name) m.name = entry.name;
    if (entry?.contextWindow != null) m.contextWindow = entry.contextWindow;
    if (entry?.maxTokens != null) m.maxTokens = entry.maxTokens;
    if (entry?.input && entry.input.length > 0) m.input = [...entry.input];
    if (entry?.reasoningEfforts !== undefined && entry.reasoningEfforts !== null) {
      m.reasoningEfforts = entry.reasoningEfforts;
    }
    return m;
  });
  return {
    displayName: 'A6API',
    apiKeyEnv: A6API_CRED_REF,
    api: 'openai-completions',
    baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL.replace(/\/+$/, '')}/v1`,
    models,
  };
}

export interface ConfigAccess {
  /** 触发（并等待）旧配置文件的自动迁移；幂等，进程内只执行一次，失败不阻塞 */
  ensureMigrated(): Promise<void>;
  /** 读取当前配置：非机密字段只走 ctx.settings.describe()，凭据走 ctx.credentials；旧 dsh-a6api-config.json 仅在迁移前作末级兜底 */
  readConfig(): Promise<A6ApiConfig>;
  /** 写入凭据字段（空串 = 清除，走 unset）；settings 同步请用 syncModels */
  writeConfig(parts: Partial<Pick<A6ApiConfig, 'apiKey' | 'accessToken' | 'userId'>>): Promise<void>;
  /** 把模型列表（与 baseURL）同步进当前 Profile `llm-pi-ai` 条目的 providers.a6api 块 */
  syncModels(baseURL: string, modelIds: string[]): Promise<void>;
  /** 当前 DSH 已配置的 a6api 模型 ID 列表 */
  getDshConfiguredModels(): Promise<string[]>;
}

export function createConfigAccess(ctx: any): ConfigAccess {
  let migration: Promise<void> | null = null;
  /** JWT 解出的账号 ID 只回写一次凭据，避免每个请求都重复写 */
  let derivedUserIdPersisted = false;

  const ensureMigrated = (): Promise<void> => {
    if (!migration) {
      migration = doMigrate().catch((err: any) => {
        // 迁移失败不阻塞：保留旧文件，readConfig 的末级兜底继续工作，下次启动重试
        console.warn('[dsh-a6api] 旧配置迁移失败（保留旧文件读取兜底）:', err?.message || err);
      });
    }
    return migration;
  };

  /** 读一个凭据 ref：原生 resolve（env 优先）→ 文件直读兜底 */
  const resolveRef = async (creds: any, ref: string): Promise<string> => {
    try {
      if (creds && typeof creds.resolve === 'function') {
        const r = await creds.resolve(ref);
        return r && typeof r.value === 'string' ? r.value : '';
      }
    } catch (err: any) {
      console.warn(`[dsh-a6api] credentials.resolve(${ref}) failed:`, err?.message || err);
    }
    return (await readCredentialKey(ref)) || '';
  };

  /**
   * 读 llm-pi-ai.providers.a6api 块：0.1.7 起配置由 Profile 条目承载——
   * `ctx.settings` 是 SettingsForms，`describe()` 按条目 id 返回该条目的实时配置值；
   * 旧的 `settings.get(ns)` 方法已随 0.1.6 的 SettingsProvider 一并删除。
   */
  const readA6apiBlock = async (
    settings: any,
  ): Promise<{ baseURL?: string; models: string[] } | null> => {
    try {
      if (settings && typeof settings.describe === 'function') {
        const descriptor = settings
          .describe()
          .find((row: any) => row && row.ns === SETTINGS_NS);
        const value = descriptor ? descriptor.value : undefined;
        const block = value && value.providers ? value.providers[PROVIDER_KEY] : undefined;
        if (block && typeof block === 'object') {
          return {
            baseURL: typeof block.baseURL === 'string' ? block.baseURL : undefined,
            models: Array.isArray(block.models)
              ? block.models
                  .map((m: any) => (typeof m === 'string' ? m : m && typeof m.id === 'string' ? m.id : ''))
                  .filter(Boolean)
              : [],
          };
        }
      }
    } catch (err: any) {
      console.warn('[dsh-a6api] settings.describe(llm-pi-ai) failed:', err?.message || err);
    }
    return null;
  };

  const readConfig = async (): Promise<A6ApiConfig> => {
    await ensureMigrated();
    const creds = getCredentials(ctx);
    const settings = getSettings(ctx);

    // 凭据：原生 resolve（env 优先）→ 文件直读兜底
    const apiKey = await resolveRef(creds, A6API_CRED_REF);
    const accessToken = await resolveRef(creds, A6API_TOKEN_REF);
    let userId = await resolveRef(creds, A6API_USER_REF);

    // 自举死锁兜底：平台管理接口要求 New-Api-User 头，而该 id 原本只能从这些接口里发现
    // （fetchBalance 读 /api/user/self 的 data.id）。系统访问令牌是 JWT 时就地解出账号 id，
    // 并一次性写回凭据，之后不再依赖解析。解不出则留给「基础配置」的账号 ID 输入框。
    if (!userId) {
      const derived = deriveUserIdFromToken(accessToken);
      if (derived) {
        userId = derived;
        if (!derivedUserIdPersisted) {
          derivedUserIdPersisted = true;
          console.warn('[dsh-a6api] 已从系统访问令牌解出账号 ID 并写回凭据（New-Api-User）');
          void writeConfig({ userId: derived }).catch((err: any) => {
            derivedUserIdPersisted = false;
            console.warn('[dsh-a6api] 写回账号 ID 失败:', err?.message || err);
          });
        }
      }
    }

    // 非机密状态：只读 llm-pi-ai.providers.a6api 块（ctx.settings.describe()），无替代文件落点
    let baseURL = DEFAULT_BASE_URL;
    let activeModels: string[] = [];
    const block = await readA6apiBlock(settings);
    if (block) {
      if (block.baseURL) baseURL = stripV1(block.baseURL) || DEFAULT_BASE_URL;
      activeModels = block.models;
    }

    // 末级兜底：原生凭据为空且旧插件私有文件仍在（迁移未完成或失败）→ 旧文件只填空字段，
    // 非机密状态始终以原生 settings 为准（避免旧值遮蔽用户迁移失败后新改的节点/模型）
    if (!apiKey && !accessToken && fs.existsSync(legacyConfigFile())) {
      const legacy = await readLegacyConfig();
      if (legacy) {
        return {
          baseURL: baseURL || legacy.baseURL,
          apiKey: apiKey || legacy.apiKey,
          accessToken: accessToken || legacy.accessToken,
          userId: userId || legacy.userId,
          activeModels: activeModels.length > 0 ? activeModels : legacy.activeModels,
        };
      }
    }

    return { baseURL, apiKey, accessToken, userId, activeModels };
  };

  const writeConfig = async (
    parts: Partial<Pick<A6ApiConfig, 'apiKey' | 'accessToken' | 'userId'>>,
  ): Promise<void> => {
    // 先等迁移完成，避免 fillRef 的「读→写」两步把迁移值覆盖用户刚写入的新值
    await ensureMigrated();
    const creds = getCredentials(ctx);
    const entries: Array<[string, string | undefined]> = [
      [A6API_CRED_REF, parts.apiKey],
      [A6API_TOKEN_REF, parts.accessToken],
      [A6API_USER_REF, parts.userId],
    ];
    for (const [ref, value] of entries) {
      if (value === undefined) continue;
      const v = value.trim();
      try {
        if (creds && typeof creds.set === 'function' && typeof creds.unset === 'function') {
          if (v) await creds.set(ref, v);
          else await creds.unset(ref);
        } else {
          // 兜底路径：writeCredentialKey 对空串执行删除（DSH credentials-local 拒收空 ref 值）
          await writeCredentialKey(ref, v);
        }
      } catch (err: any) {
        // env 遮蔽（assertUnshadowed）等场景：跳过写入，env 值优先符合 DSH 原生语义
        console.warn(`[dsh-a6api] 写入凭据 ${ref} 失败（已跳过）:`, err?.message || err);
      }
    }
  };

  const syncModels = async (baseURL: string, modelIds: string[]): Promise<void> => {
    const settings = getSettings(ctx);
    if (!settings || typeof settings.update !== 'function' || typeof settings.mutate !== 'function') {
      throw new Error('[dsh-a6api] ctx.settings (SettingsForms) 不可用：无法同步 a6api 模型配置');
    }
    if (modelIds.length === 0) {
      // DSH 硬约束：llm-pi-ai 对手写路由（a6api 不在内置 catalog）不存在合法的「零模型」表示，
      // assertServiceable 会拒绝 models: []（"resolves no models..."），写盘将毒化下次启动。
      // 空列表 = 移除整个 a6api 块（路由从 DSH 消失；baseURL 随块一并移除，属 schema 约束下的必然）。
      // 失败直接抛：0.1.7 起唯一落点是 Profile 条目配置，没有可回退的替代文件。
      await settings.mutate(SETTINGS_NS, [{ op: 'unset', path: ['providers', PROVIDER_KEY] }]);
      return;
    }

    const block = buildA6apiBlock(baseURL, modelIds);
    // 原生缝：条目串行写队列 + schema 校验 + 热发布（合并语义，不影响其他 provider）；失败直接抛。
    await settings.update(SETTINGS_NS, { providers: { [PROVIDER_KEY]: block } });
  };

  const getDshConfiguredModels = async (): Promise<string[]> => {
    const block = await readA6apiBlock(getSettings(ctx));
    return block ? block.models : [];
  };

  /** 只填空：迁移值仅在当前无该 ref（含 env 覆盖）时写入；返回 false = 写入失败（需保留旧文件） */
  const fillRef = async (creds: any, ref: string, value: string): Promise<boolean> => {
    if (!value) return true; // 无值可迁 = 无需写 = 视为成功
    try {
      const current = await resolveRef(creds, ref);
      if (current) return true; // 已有值（含 env 覆盖），无需写
      if (creds && typeof creds.set === 'function') await creds.set(ref, value);
      else await writeCredentialKey(ref, value);
      return true;
    } catch (err: any) {
      console.warn(`[dsh-a6api] 迁移 ${ref} 失败（跳过，保留旧文件）:`, err?.message || err);
      return false;
    }
  };

  const archiveLegacy = async (filePath: string): Promise<void> => {
    try {
      await fsp.rename(filePath, `${filePath}.bak`);
      console.log('[dsh-a6api] 旧配置已迁移至 DSH 原生配置并归档: dsh-a6api-config.json.bak');
    } catch (err: any) {
      console.warn('[dsh-a6api] 旧配置归档失败（迁移值已写入，旧文件保留，下次启动重试）:', err?.message || err);
    }
  };

  const doMigrate = async (): Promise<void> => {
    const filePath = legacyConfigFile();
    let raw = '';
    try {
      raw = await fsp.readFile(filePath, 'utf8');
    } catch {
      return; // 无旧文件，无事可做
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      console.warn('[dsh-a6api] 旧配置文件损坏，跳过迁移并归档:', err?.message || err);
      await archiveLegacy(filePath);
      return;
    }

    const legacy = normalizeLegacy(parsed);
    const creds = getCredentials(ctx);

    // 凭据：只填空不覆盖（当前已有值或 env 覆盖则不动）；
    // 任一写入失败 → 不归档（决策：全部写成功后才归档），保留旧文件读取兜底与下次启动重试。
    // 顺序执行：兜底路径 writeCredentialKey 是读-改-写同一文件，并发会互相覆盖。
    const fillResults = [
      await fillRef(creds, A6API_CRED_REF, legacy.apiKey),
      await fillRef(creds, A6API_TOKEN_REF, legacy.accessToken),
      await fillRef(creds, A6API_USER_REF, legacy.userId),
    ];
    if (fillResults.some((ok) => !ok)) {
      console.warn('[dsh-a6api] 凭据迁移未全部成功，跳过归档，保留旧文件读取兜底（下次启动重试）');
      return;
    }

    // settings：仅当 a6api 块不存在时回填（绝不覆盖用户已配置的 provider）
    const block = await readA6apiBlock(getSettings(ctx));
    if (!block && legacy.activeModels.length > 0) {
      await syncModels(legacy.baseURL, legacy.activeModels);
    }

    await archiveLegacy(filePath);
  };

  return { ensureMigrated, readConfig, writeConfig, syncModels, getDshConfiguredModels };
}
