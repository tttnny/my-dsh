import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import { fetchWithNetRetry } from './net.js';
import {
  DEFAULT_MODEL_PROTOCOL,
  THINKING_LEVEL_KEYS,
  isModelProtocol,
  validateReasoningEfforts,
} from '../types.js';
import type {
  A6ApiModelMeta,
  CatalogModelEntry,
  ModelProtocol,
  ReasoningSource,
} from '../types.js';

/**
 * 模型目录（运行时数据，取代旧的静态 A6API_CATALOG）。
 *
 * - 持久化：`$DSH_HOME/dsh-a6api/catalog.json`（结构 `{ version: 2, protocol, entries: [...] }`），
 *   初始为空；「模型目录」页从 A6API 市场拉取模型 ID、从 OpenRouter 查询参数后建立。
 *   v1.4 起位于插件子目录（与 DSH「组件自建 home 子目录」惯例一致），不再占用
 *   `$DSH_HOME` 根目录；旧版根目录文件（<=1.3 `dsh-a6api-catalog.json`）首次读取时
 *   自动搬迁（保持数据无损），搬迁后旧文件即删除。
 * - 顶层 `protocol` = 用户选的模型协议（整条线路共用）。落在这里是因为 DSH 线路配置
 *   在一个模型都没启用时整块不存在，协议无处可存；v1 旧文件缺该字段即默认协议。
 * - 条目字段 = DSH llm-pi-ai 条目的原生模型字段（id/name/contextWindow/
 *   maxTokens/input/reasoningEfforts），外加内部附带的 brand（来自 A6API 市场渠道，
 *   仅用于可用模型卡片展示）与 reasoningSource / reasoningChange（档位来源与本次
 *   数量变化）。这三个内部字段都不写入 llm-pi-ai 条目配置（见 sync.ts 的 buildA6apiBlock）。
 * - 档位来源：`default`（写死 7 档，未确认）/ `queried`（第三方查得，已确认）/
 *   `manual`（用户手改，已确认）。「获取市场模型」只写 default；一键查询只更新来源
 *   不是 manual 的条目；用户手改一律记 manual。缺字段的旧条目读作 default。
 * - 目录为唯一参数真相源：「可用模型」页写入 llm-pi-ai 条目配置时从此取字段，缺则省略
 *   （由 llm-pi-ai 默认值兜底），不再有任何内置手写默认参数。
 */

const CATALOG_VERSION = 2;

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
/** 顶层协议（缺字段/非法值 = 默认协议）：与 entries 同一次读取加载，写盘时一并落回。 */
let protocolCache: ModelProtocol | null = null;

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
      // 协议：v1 旧文件没有这个字段，任何缺失/非法值都读作默认协议（不抛错）
      protocolCache = isModelProtocol(j?.protocol) ? j.protocol : DEFAULT_MODEL_PROTOCOL;
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
  protocolCache = DEFAULT_MODEL_PROTOCOL;
  return catalogCache as CatalogModelEntry[];
}

export function getCatalog(): CatalogModelEntry[] {
  return ensureLoaded();
}

/** 读取目录顶层记住的模型协议（缺失 = 默认协议）。 */
export function getCatalogProtocol(): ModelProtocol {
  ensureLoaded();
  return protocolCache ?? DEFAULT_MODEL_PROTOCOL;
}

/** 记录模型协议（整条线路共用）。与条目写操作共用同一写链；写盘后才更新内存缓存。 */
export async function setCatalogProtocol(protocol: ModelProtocol): Promise<void> {
  await enqueueWrite(async () => {
    // 不预先改 protocolCache：写盘失败时缓存必须仍与磁盘一致，下次读才不会报假协议
    await writeCatalog(ensureLoaded(), protocol);
  });
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
async function writeCatalog(entries: CatalogModelEntry[], protocol?: ModelProtocol): Promise<void> {
  const file = catalogFile();
  // 协议与条目同写：调用方未指定时沿用内存里记住的那个，避免任何一次写盘把用户选的协议冲掉
  const nextProtocol = protocol ?? protocolCache ?? DEFAULT_MODEL_PROTOCOL;
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fsp.writeFile(
    tmp,
    JSON.stringify({ version: CATALOG_VERSION, protocol: nextProtocol, entries }, null, 2),
    {
      encoding: 'utf8',
      mode: 0o644,
    },
  );
  await fsp.rename(tmp, file);
  catalogCache = entries;
  protocolCache = nextProtocol;
}

/**
 * 合并目录条目的内部实现。两种模式：
 * - `fill`：只补缺失字段——已有条目的既有字段一律保留（市场拉取用；用户手改过的档位
 *   与来源不会被下一轮「获取市场模型」冲掉）；
 * - `overwrite`：新值覆盖旧值（查询用）；`undefined` 不参与，`null` = 删除该字段
 *   （与 updateCatalogEntry 的 null 语义一致，用于清掉「本次变更」这类过时记录）。
 * 按小写 id 去重并保留首个 casing。
 */
async function mergeIntoCatalog(entries: CatalogModelEntry[], mode: 'fill' | 'overwrite'): Promise<void> {
  await enqueueWrite(async () => {
    const cur = ensureLoaded();
    const map = new Map<string, CatalogModelEntry>();
    for (const e of cur) map.set(e.id.toLowerCase(), e);
    for (const e of entries) {
      const clean = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as CatalogModelEntry;
      const key = clean.id.toLowerCase();
      const prev = map.get(key);
      if (!prev) {
        map.set(key, clean);
        continue;
      }
      if (mode === 'fill') {
        // 只补缺失字段：已有条目的既有字段（含用户手改/已查询的档位与来源）一律保留
        const merged: CatalogModelEntry = { ...prev };
        for (const [k, v] of Object.entries(clean)) {
          if ((prev as any)[k] === undefined || (prev as any)[k] === null) (merged as any)[k] = v;
        }
        // brand 是市场渠道给的展示元数据（唯一写入方就是市场拉取），随最新名单刷新；
        // 档位与来源则严格只在缺失时才补，避免把查到的真实档位打回默认 7 档
        if (clean.brand !== undefined) merged.brand = clean.brand;
        merged.id = prev.id;
        map.set(key, merged);
      } else {
        const merged: CatalogModelEntry = { ...prev, ...clean, id: prev.id };
        for (const [k, v] of Object.entries(clean)) {
          if (v === null) delete (merged as any)[k];
        }
        map.set(key, merged);
      }
    }
    await writeCatalog([...map.values()]);
  });
}

/** 合并新增条目（只补缺失字段：已有条目的既有字段一律保留，参数以用户已保存/查询到的为准）。
 *  注意：合并语义是「已有值优先」，不是「新值优先」——需要覆盖已有字段的写路径
 *  （查询/更新）用 overwrite 模式，不要靠这个函数兜底。 */
export async function upsertCatalogEntries(entries: CatalogModelEntry[]): Promise<void> {
  await mergeIntoCatalog(entries, 'fill');
}

/** 清空目录（重新从 A6API 拉取/OpenRouter 填充前使用）。llm-pi-ai 条目中已启用的模型不受影响 */
export async function clearCatalog(): Promise<void> {
  await enqueueWrite(async () => {
    await writeCatalog([]);
  });
}

/** 全量替换式更新单个条目（模型目录页保存修改用）；patch 中值为 null 的字段 = 删除该字段。返回更新后的条目。
 *  用户手改档位（含改为非推理模型）时来源一并记为 manual：标记消失，后续查询也不再改动它。 */
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
    // 用户手改了档位：来源记 manual（已确认），并清掉与本次无关的「本次变更」记录
    if ('reasoningEfforts' in patch) {
      next.reasoningSource = 'manual';
      delete next.reasoningChange;
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
 * 注意：写 llm-pi-ai 条目配置时不要用此函数的兜底值——缺字段应省略（见 buildA6apiBlock）。
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
      // 档位来源随档位字典下发（非推理 false 不标；字典存在但无来源 = 旧数据/默认 = 未确认）
      ...(entry.reasoningEfforts && typeof entry.reasoningEfforts === 'object'
        ? { reasoningSource: entry.reasoningSource ?? 'default' }
        : {}),
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
): Promise<{
  models: { id: string; brand?: string; reasoningEfforts: Record<string, string | null>; reasoningSource: ReasoningSource }[];
  failedPages: number;
}> {
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

  const byModel = new Map<
    string,
    { id: string; brand?: string; reasoningEfforts: Record<string, string | null>; reasoningSource: ReasoningSource }
  >();
  for (const it of all) {
    const name = it?.model_name;
    if (!name) continue;
    if (!byModel.has(name)) {
      byModel.set(name, {
        id: String(name),
        brand: normalizeBrand(it?.brand),
        // 默认声明 DSH 全部思考档位：手写线路上的新模型不会退化成非推理模型。
        // 来源 = default（未确认），等一键查询查到真实档位后才转为已确认。
        reasoningEfforts: { ...DEFAULT_REASONING_EFFORTS },
        reasoningSource: 'default',
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

/** 目录条目的档位数量（false = 非推理、缺字段 = 未声明，均计 0） */
function countReasoningLevels(value: CatalogModelEntry['reasoningEfforts']): number {
  return value && typeof value === 'object' ? Object.keys(value).length : 0;
}

/**
 * 上游档位白名单 → DSH 档位字典（服务端唯一映射点）：
 * - 上游用字符串 `"none"` 表示「关闭」→ DSH 的 `off: null`（不带线上值）；
 * - 其余档位名与 DSH 档位同名，直接用档位名本身作线上拼写；
 * - 上游（或今后新增）无法映射的 token 直接丢弃，不写死白名单；
 * - DSH 要求除 off 外至少一个思考档位，因此只映射出 off（或一个都没有）时返回 null
 *   ——调用方保持「有标记无明细」的处理，不伪造一个非法字典。
 * 键序按 DSH 档位顺序输出，保证目录里的展示与写盘结果稳定。
 */
function mapEffortsToDsh(supported: unknown): Record<string, string | null> | null {
  if (!Array.isArray(supported)) return null;
  const tokens = new Set(supported.map((t) => String(t ?? '').trim().toLowerCase()).filter(Boolean));
  const out: Record<string, string | null> = {};
  for (const key of THINKING_LEVEL_KEYS) {
    if (key === 'off') {
      if (tokens.has('none') || tokens.has('off')) out.off = null;
      continue;
    }
    if (tokens.has(key)) out[key] = key;
  }
  if (!Object.keys(out).some((k) => k !== 'off')) return null;
  // 与服务端 /catalog/update、客户端编辑保存共用同一套 DSH 语义校验，映射结果必须过
  const checked = validateReasoningEfforts(out);
  return checked.ok && checked.value !== false ? checked.value : null;
}

/**
 * 「上游有推理相关标记」的判定（无档位明细时的分支依据）：
 * 顶层 `reasoning` 对象是实测的主线索；`supported_parameters` 里出现 reasoning /
 * reasoning_effort 作为辅助，避免把「有推理能力但没给白名单」的模型误判成非推理。
 */
function hasReasoningMarker(m: any): boolean {
  if (m?.reasoning !== undefined && m?.reasoning !== null) return true;
  const params: unknown[] = Array.isArray(m?.supported_parameters) ? m.supported_parameters : [];
  return params.some((p) => {
    const s = String(p ?? '').toLowerCase();
    return s === 'reasoning' || s === 'reasoning_effort';
  });
}

export interface OrQueryResult {
  updated: CatalogModelEntry[];
  notFound: string[];
  /** 来源为 manual、按覆盖规则被跳过的 ID（用户手改过的档位一律不覆盖） */
  skipped: string[];
}

/**
 * 对一批模型 ID 查询 OpenRouter 并填充目录（能查到的填充，查不到的保持空参数字段）。
 * 档位按上游返回分三种处理：
 * - 带档位白名单 → 收窄为 DSH 档位字典，来源记 queried（已确认）；数量与上一次不同时
 *   记下「本次变更」（from/to/at），供目录行渲染「本次从 N 档变 M 档」；
 * - 有推理标记但无档位明细 → 保持默认 7 档，来源仍为未确认；
 * - 完全没有推理相关标记 → 写入非推理模型（false），来源记 queried。
 * 覆盖规则：来源为 manual 的条目一律跳过（不靠合并语义兜底，在这里显式跳过）。
 * 返回更新统计：updated 为本次写入的条目，notFound 为查无的 ID，skipped 为跳过的 ID。
 */
export async function queryOpenRouter(ids: string[]): Promise<OrQueryResult> {
  const uniq = [...new Set(ids.map((s) => String(s).trim()).filter(Boolean))];
  if (uniq.length === 0) return { updated: [], notFound: [], skipped: [] };
  const models = await getOpenRouterModels();
  const updated: CatalogModelEntry[] = [];
  const notFound: string[] = [];
  const skipped: string[] = [];
  const now = Date.now();

  for (const id of uniq) {
    const prevEntry = getCatalogEntry(id);
    // 覆盖规则：用户手改过的档位（manual）查询一律跳过——合并语义是覆盖式的，不能指望它保住手改值
    if (prevEntry?.reasoningSource === 'manual') {
      skipped.push(id);
      continue;
    }
    const hit = matchOpenRouter(models, id);
    if (!hit) {
      notFound.push(id);
      continue;
    }
    const patch: Partial<Omit<CatalogModelEntry, 'id'>> = {
      updatedAt: now,
    };
    const ctx = hit.context_length ?? hit.top_provider?.context_length;
    if (ctx != null && Number(ctx) > 0) patch.contextWindow = Number(ctx);
    const maxOut = hit.top_provider?.max_completion_tokens ?? hit.max_completion_tokens;
    if (maxOut != null && Number(maxOut) > 0) patch.maxTokens = Number(maxOut);
    const mods = orModalities(hit);
    if (mods.length > 0) patch.input = mods;
    // name 仅允许用户手动填写：不从此处填充（用户未填则保持为空，写 llm-pi-ai 条目配置时省略）

    const mapped = mapEffortsToDsh(hit.reasoning?.supported_efforts);
    if (mapped) {
      const from = countReasoningLevels(prevEntry?.reasoningEfforts);
      const to = Object.keys(mapped).length;
      patch.reasoningEfforts = mapped;
      patch.reasoningSource = 'queried';
      // 数量没变就不留旧记录（避免展示一条与本次无关的「本次变更」）
      patch.reasoningChange = from !== to ? { from, to, at: now } : null;
    } else if (hasReasoningMarker(hit)) {
      // 有推理标记但没有档位明细：保持默认 7 档，来源仍为未确认（missing/非法值都读作 default）
      patch.reasoningEfforts = { ...DEFAULT_REASONING_EFFORTS };
      patch.reasoningSource = 'default';
      patch.reasoningChange = null;
    } else {
      // 完全没有推理相关标记：上游明确无推理能力 → 非推理模型，来源 queried（已确认，标记不再显示）
      patch.reasoningEfforts = false;
      patch.reasoningSource = 'queried';
      patch.reasoningChange = null;
    }

    updated.push({ id, ...patch });
  }

  if (updated.length > 0) {
    await mergeIntoCatalog(updated, 'overwrite');
  }
  return { updated, notFound, skipped };
}
