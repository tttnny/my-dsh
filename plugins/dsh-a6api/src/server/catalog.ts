import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { fetchWithNetRetry } from './net.js';
import type { A6ApiModelMeta, CatalogModelEntry } from '../types.js';

/**
 * 模型目录（运行时数据，取代旧的静态 A6API_CATALOG）。
 *
 * - 持久化：`$DSH_HOME/dsh-a6api/catalog.json`（结构 `{ version: 1, entries: [...] }`），
 *   初始为空；「模型目录」页从 A6API 市场拉取模型 ID、从 OpenRouter 查询参数后建立。
 *   v1.4 起位于插件子目录（与 DSH「组件自建 home 子目录」惯例一致），不再占用
 *   `$DSH_HOME` 根目录；旧版根目录文件（<=1.3 `dsh-a6api-catalog.json`）首次读取时
 *   自动搬迁（保持数据无损），搬迁后旧文件即删除。
 * - 条目字段 = DSH settings.yaml 的 llm-pi-ai 原生模型字段（id/name/contextWindow/
 *   maxTokens/input/reasoningEfforts），外加内部附带的 brand（来自 A6API 市场渠道，
 *   仅用于可用模型卡片展示，不写入 settings.yaml）。
 * - 目录为唯一参数真相源：「可用模型」页写入 settings.yaml 时从此取字段，缺则省略
 *   （由 llm-pi-ai 默认值兜底），不再有任何内置手写默认参数。
 */

const CATALOG_VERSION = 1;

/** 当前 catalog 文件路径（v1.4+：插件子目录，不再占用 DSH home 根目录）。
 *  dshHomePath 与 DSH 的 resolveDshHome 完全一致：显式配置 home → $DSH_HOME（~ 展开）→ ~/.dsh。 */
export function catalogFile(): string {
  return dshHomePath('dsh-a6api', 'catalog.json');
}

/** 旧版（<=1.3）根目录文件，仅用于一次性搬迁。 */
function legacyCatalogFile(): string {
  return dshHomePath('dsh-a6api-catalog.json');
}

/**
 * 一次性搬迁旧版根目录 catalog（<=1.3）到插件子目录，保持数据无损。
 * 同步执行（ensureLoaded 为同步路径），幂等：
 *  - 新路径已有文件 → 旧文件只是残留，直接清理；
 *  - 新路径缺失且旧文件存在 → 建目录后 rename（同卷原子）；失败则由读取侧回退旧路径；
 *  - 都无 → 空目录。
 */
function ensureRelocated(): void {
  const target = catalogFile();
  const legacy = legacyCatalogFile();
  try {
    fs.accessSync(target);
    try {
      fs.unlinkSync(legacy);
    } catch {}
    return;
  } catch {
    // target 不存在，继续搬迁
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(legacy, target);
  } catch {
    // 旧文件不存在或搬迁失败：由读取侧回退到旧路径
  }
}

/** 进程内缓存：resolveModelMeta 等同步路径直接读内存 */
let catalogCache: CatalogModelEntry[] | null = null;

function ensureLoaded(): CatalogModelEntry[] {
  if (catalogCache) return catalogCache;
  ensureRelocated();
  const sources = [catalogFile(), legacyCatalogFile()];
  for (const file of sources) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const j = JSON.parse(raw);
      // 形状过滤：跳过无字符串 id 的损坏条目，避免 getCatalogEntry 的 .toLowerCase() 抛错拖垮 /state
      catalogCache = Array.isArray(j?.entries)
        ? j.entries.filter((e: any) => e && typeof e.id === 'string')
        : [];
      if (file !== catalogFile()) {
        // 搬迁失败的回退读取：数据已进内存，清理旧文件
        try {
          fs.unlinkSync(file);
        } catch {}
      }
      return catalogCache as CatalogModelEntry[];
    } catch {
      // 尝试下一个源（损坏/缺失都跳过）
    }
  }
  catalogCache = [];
  return catalogCache as CatalogModelEntry[];
}

export function getCatalog(): CatalogModelEntry[] {
  return ensureLoaded();
}

export function getCatalogEntry(id: string): CatalogModelEntry | undefined {
  const t = id.toLowerCase();
  return ensureLoaded().find((e) => e.id.toLowerCase() === t);
}

/**
 * 目录写操作串行队列：fetch-models / query-openrouter / update / clear 共享同一写链，
 * 避免读-改-写交错丢更新（如「编辑保存」与「一键查询」并发时后写者覆盖先写者）。
 */
let writeChain: Promise<void> = Promise.resolve();

function enqueueWrite(fn: () => Promise<void>): Promise<void> {
  const next = writeChain.then(fn, fn);
  writeChain = next.then(
    () => {},
    () => {},
  );
  return next;
}

/** 原子写盘（tmp+rename）成功后才更新内存缓存；写失败时缓存保持与磁盘一致的旧值 */
async function writeCatalog(entries: CatalogModelEntry[]): Promise<void> {
  const file = catalogFile();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify({ version: CATALOG_VERSION, entries }, null, 2), {
    encoding: 'utf8',
    mode: 0o644,
  });
  await fsp.rename(tmp, file);
  catalogCache = entries;
}

/** 合并新增条目（不覆盖已有条目的既有字段；仅补缺失字段，参数以用户已保存/查询到的为准）。
 *  undefined 字段不参与合并（避免覆盖已有值）；按小写 id 去重（保留首个 casing，避免大小写幽灵重复）。 */
export async function upsertCatalogEntries(entries: CatalogModelEntry[]): Promise<void> {
  await enqueueWrite(async () => {
    const cur = ensureLoaded();
    const map = new Map<string, CatalogModelEntry>();
    for (const e of cur) map.set(e.id.toLowerCase(), e);
    for (const e of entries) {
      const clean = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as CatalogModelEntry;
      const key = clean.id.toLowerCase();
      const prev = map.get(key);
      map.set(key, prev ? { ...prev, ...clean } : clean);
    }
    await writeCatalog([...map.values()]);
  });
}

/** 清空目录（重新从 A6API 拉取/OpenRouter 填充前使用）。settings.yaml 已启用条目不受影响 */
export async function clearCatalog(): Promise<void> {
  await enqueueWrite(async () => {
    await writeCatalog([]);
  });
}

/** 全量替换式更新单个条目（模型目录页保存修改用）；patch 中值为 null 的字段 = 删除该字段。返回更新后的条目 */
export async function updateCatalogEntry(
  id: string,
  patch: Partial<Omit<CatalogModelEntry, 'id'>>,
): Promise<CatalogModelEntry | null> {
  let result: CatalogModelEntry | null = null;
  await enqueueWrite(async () => {
    const cur = ensureLoaded();
    const idx = cur.findIndex((e) => e.id.toLowerCase() === id.toLowerCase());
    if (idx < 0) return;
    const next: CatalogModelEntry = { ...cur[idx], ...patch, id: cur[idx].id, updatedAt: Date.now() };
    for (const k of Object.keys(patch)) {
      if ((patch as any)[k] === null) delete (next as any)[k];
    }
    const list = cur.slice();
    list[idx] = next;
    await writeCatalog(list);
    result = next;
  });
  return result;
}

// ===== 品牌归一化（市场渠道返回的原始品牌 → 卡片展示风格） =====

const BRAND_NORMALIZE: Record<string, string> = {
  meituan: 'MeiTuan',
  tencent: 'Tencent',
  xiaomi: 'Xiaomi',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  deepseek: 'DeepSeek',
  zhipu: 'Zhipu',
  moonshot: 'Moonshot',
  alibaba: 'Alibaba',
  minimax: 'MiniMax',
};

function normalizeBrand(raw: string): string {
  const k = String(raw || '').toLowerCase();
  return BRAND_NORMALIZE[k] || raw || 'Other';
}

/** 从 A6API 模型名推断品牌（目录无数据时的展示兜底，与旧行为一致） */
export function inferBrand(modelId: string): string {
  const m = modelId.toLowerCase();
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('chatgpt')) return 'OpenAI';
  if (m.startsWith('claude')) return 'Anthropic';
  if (m.startsWith('gemini') || m.startsWith('google') || m.startsWith('imagen')) return 'Google';
  if (m.startsWith('deepseek')) return 'DeepSeek';
  if (m.startsWith('grok')) return 'xAI';
  if (m.startsWith('glm') || m.startsWith('zhipu') || m.startsWith('cog')) return 'Zhipu';
  if (m.startsWith('kimi') || m.startsWith('moonshot')) return 'Moonshot';
  if (m.startsWith('qwen')) return 'Alibaba';
  if (m.startsWith('minimax')) return 'MiniMax';
  if (m.startsWith('mimo') || m.startsWith('xiaomi')) return 'Xiaomi';
  if (m.startsWith('hunyuan') || m.startsWith('tencent') || m.startsWith('hy')) return 'Tencent';
  return 'Other';
}

/**
 * 默认推理档位：DSH llm-pi-ai 支持的全部思考档位（THINKING_LEVELS），
 * wire 值取档位名本身（identity），`off` 无 wire 值（null = 发送时不带思考参数）。
 * 新获取的市场模型默认声明全部档位，用户可自行修改。
 */
export const DEFAULT_REASONING_EFFORTS: Record<string, string | null> = {
  off: null,
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
};

/**
 * 解析模型元信息（同步）：目录数据优先，缺失时返回展示兜底值。
 * 注意：写 settings.yaml 时不要用此函数的兜底值——缺字段应省略（见 buildA6apiBlock）。
 */
export function resolveModelMeta(modelId: string): A6ApiModelMeta {
  const entry = getCatalogEntry(modelId);
  if (entry) {
    return {
      id: entry.id,
      name: entry.name || entry.id,
      brand: entry.brand || inferBrand(entry.id),
      contextWindow: entry.contextWindow ?? 262144,
      maxTokens: entry.maxTokens ?? 32768,
      modalities: entry.input && entry.input.length > 0 ? [...entry.input] : ['text'],
      ...(entry.reasoningEfforts && typeof entry.reasoningEfforts === 'object' && Object.keys(entry.reasoningEfforts).length > 0
        ? {
            reasoningEfforts: Object.fromEntries(
              Object.entries(entry.reasoningEfforts).filter(([, v]) => v !== null && v !== undefined),
            ) as Record<string, string>,
          }
        : {}),
    };
  }
  const lowerId = modelId.toLowerCase();
  const isVision = lowerId.includes('vision') || lowerId.includes('vl') || lowerId.includes('image');
  const hasReasoning = lowerId.includes('think') || lowerId.includes('reason') || lowerId.includes('pro') || lowerId.includes('sol');
  return {
    id: modelId,
    name: modelId,
    brand: inferBrand(modelId),
    contextWindow: 262144,
    maxTokens: 32768,
    modalities: isVision ? ['text', 'image'] : ['text'],
    ...(hasReasoning ? { thinkingFormat: 'deepseek' } : {}),
  };
}

// ===== A6API 市场全量模型拉取（翻页 channels/search，带 Web 会话鉴权） =====

const MARKET_SEARCH = 'https://a6api.com/api/marketplace/channels/search';
const PAGE_SIZE = 500;
const CONCURRENCY = 6;

function buildWebHeaders(userId?: string, accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };
  const uid = userId ? String(userId).trim() : '';
  const token = accessToken ? String(accessToken).trim() : '';
  if (uid) headers['New-Api-User'] = uid;
  if (token) {
    headers['Authorization'] = token;
    headers['Cookie'] = `session=${token}`;
  }
  return headers;
}

/**
 * 拉取 A6API 市场支持的全部模型 ID（含品牌）。
 * 不排除任何模型（图像生成等一并收录，参数由 OpenRouter 查询决定能否填充）。
 */
export async function fetchMarketplaceModels(
  userId?: string,
  accessToken?: string,
): Promise<{ models: { id: string; brand?: string; reasoningEfforts: Record<string, string | null> }[]; failedPages: number }> {
  if (!userId && !accessToken) {
    throw new Error('需先配置系统访问令牌才能获取市场模型');
  }
  const headers = buildWebHeaders(userId, accessToken);
  const first = await (async () => {
    const res = await fetchWithNetRetry(`${MARKET_SEARCH}?view=list&page=1&page_size=${PAGE_SIZE}`, {
      headers,
      timeoutMs: 15000,
    });
    if (!res.ok) throw new Error(`A6API 市场接口 HTTP ${res.status}`);
    return res.json();
  })();
  const total = Number(first?.data?.total || 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const all: any[] = [...(first?.data?.items || [])];
  let failedPages = 0;
  let idx = 2;
  const worker = async () => {
    while (idx <= pages) {
      const p = idx++;
      try {
        const res = await fetchWithNetRetry(`${MARKET_SEARCH}?view=list&page=${p}&page_size=${PAGE_SIZE}`, {
          headers,
          timeoutMs: 15000,
        });
        const j = await res.json();
        all.push(...(j?.data?.items || []));
      } catch (err: any) {
        failedPages++;
        console.warn('[dsh-a6api] fetchMarketplaceModels page', p, 'failed:', err?.message || err);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const byModel = new Map<string, { id: string; brand?: string; reasoningEfforts: Record<string, string | null> }>();
  for (const it of all) {
    const name = it?.model_name;
    if (!name) continue;
    if (!byModel.has(name)) {
      byModel.set(name, {
        id: String(name),
        brand: normalizeBrand(it?.brand),
        // 默认声明 DSH 全部思考档位（用户可修改；upsert 仅补缺失字段，已有自定义不受影响）
        reasoningEfforts: { ...DEFAULT_REASONING_EFFORTS },
      });
    }
  }
  const models = [...byModel.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { models, failedPages };
}

// ===== OpenRouter 模型参数查询（公开 /api/v1/models，进程内缓存 1h） =====

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';
const OR_TTL_MS = 60 * 60 * 1000;

let orCache: { at: number; models: any[] } | null = null;

async function getOpenRouterModels(): Promise<any[]> {
  if (orCache && Date.now() - orCache.at < OR_TTL_MS) return orCache.models;
  try {
    const res = await fetchWithNetRetry(OPENROUTER_URL, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeoutMs: 20000,
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
    const j: any = await res.json();
    if (!Array.isArray(j?.data)) throw new Error('OpenRouter 返回格式异常');
    orCache = { at: Date.now(), models: j.data };
    return orCache.models;
  } catch (err) {
    // 拉取失败：存在过期缓存时降级用旧数据（stale 兜底），否则上抛
    if (orCache) return orCache.models;
    throw err;
  }
}

const tailOf = (s: string): string => String(s).split('/').pop() || '';

/** 匹配策略：tail 精确 → 归一化（. _ 空格 → -）→ 剥离日期/版本后缀 → 包含。返回 null = 查无 */
function matchOpenRouter(models: any[], target: string): any | null {
  const t = target.toLowerCase();
  const tTail = tailOf(t);
  const norm = (s: string) => s.toLowerCase().replace(/[\s_.]+/g, '-');

  const byTail = models.find((m) => tailOf(String(m.id)).toLowerCase() === tTail);
  if (byTail) return byTail;

  const nTail = norm(tTail);
  const byNorm = models.find((m) => norm(tailOf(String(m.id))) === nTail);
  if (byNorm) return byNorm;

  // 剥离日期/版本后缀：-2025-12-11 / -20251001 / -0309 / -0.1 等，再精确匹配
  const stripped = tTail.replace(/-(?:\d{4}-\d{2}-\d{2}|\d{8}|-\d{2,4}|\d\.\d+)$/, '');
  if (stripped && stripped !== tTail) {
    const byStripped = models.find((m) => tailOf(String(m.id)).toLowerCase() === stripped);
    if (byStripped) return byStripped;
  }

  // 包含匹配（最后手段）：仅接受「-」分段完整包含 target 的条目，
  // 避免 'gpt-4o' 误命中 'gpt-4o-mini' 之类的前缀包含
  const tSeg = t.split('/').pop() || t;
  return (
    models.find((m) => {
      const id = String(m.id).toLowerCase();
      if (!id.includes(t)) return false;
      const tailSeg = id.split('/').pop() || '';
      return tailSeg === t || tailSeg.split('-').includes(tSeg);
    }) || null
  );
}

/** 输入模态：只取 architecture.input_modalities（输出模态不声明为输入，避免文生图模型被误标 image 输入） */
function orModalities(m: any): ('text' | 'image')[] {
  const set = new Set<'text' | 'image'>();
  const input: string[] = m?.architecture?.input_modalities || [];
  for (const mod of input) {
    const k = String(mod).toLowerCase();
    if (k === 'text') set.add('text');
    else if (k === 'image') set.add('image');
  }
  return [...set];
}

export interface OrQueryResult {
  updated: CatalogModelEntry[];
  notFound: string[];
}

/**
 * 对一批模型 ID 查询 OpenRouter 并填充目录（能查到的填充，查不到的保持空参数字段）。
 * 返回更新统计：updated 为本次填充/变更的条目，notFound 为查无的 ID。
 */
export async function queryOpenRouter(ids: string[]): Promise<OrQueryResult> {
  const uniq = [...new Set(ids.map((s) => String(s).trim()).filter(Boolean))];
  if (uniq.length === 0) return { updated: [], notFound: [] };
  const models = await getOpenRouterModels();
  const updated: CatalogModelEntry[] = [];
  const notFound: string[] = [];

  for (const id of uniq) {
    const hit = matchOpenRouter(models, id);
    if (!hit) {
      notFound.push(id);
      continue;
    }
    const patch: Partial<Omit<CatalogModelEntry, 'id'>> = {
      updatedAt: Date.now(),
    };
    const ctx = hit.context_length ?? hit.top_provider?.context_length;
    if (ctx != null && Number(ctx) > 0) patch.contextWindow = Number(ctx);
    const maxOut = hit.top_provider?.max_completion_tokens ?? hit.max_completion_tokens;
    if (maxOut != null && Number(maxOut) > 0) patch.maxTokens = Number(maxOut);
    const mods = orModalities(hit);
    if (mods.length > 0) patch.input = mods;
    // name 仅允许用户手动填写：不从此处填充（用户未填则保持为空，写 settings.yaml 时省略）
    updated.push({ id, ...patch });
  }

  if (updated.length > 0) {
    await upsertCatalogEntries(updated);
  }
  return { updated, notFound };
}
