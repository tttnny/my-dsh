export interface A6ApiConfig {
  baseURL: string;
  apiKey: string;
  accessToken?: string;
  userId?: string;
  activeModels: string[];
  /** 服务端脱敏下发：是否已配置 API Key（真实密钥绝不回传客户端） */
  hasApiKey?: boolean;
  /** 服务端脱敏下发：是否已配置系统访问令牌 */
  hasToken?: boolean;
}

/**
 * 模型目录条目（settings.yaml 的 llm-pi-ai 原生模型字段 + 内部 brand）。
 * 可选字段缺省 = 参数未获取/未填写，写 settings.yaml 时省略该字段（llm-pi-ai 默认值兜底）。
 */
export interface CatalogModelEntry {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  input?: ('text' | 'image')[];
  /** false = 明确非推理模型；dict = 档位 → wire 值（值可为 null，同 llm-pi-ai 语义） */
  reasoningEfforts?: Record<string, string | null> | false;
  /** 仅插件内部使用：品牌来自 A6API 市场渠道，不写入 settings.yaml */
  brand?: string;
  /** 最近一次 OpenRouter 查询/人工修改时间 */
  updatedAt?: number;
}

/** DSH llm-pi-ai 支持的完整思考档位（THINKING_LEVELS，与 dsh-llm-pi-ai 源码一致） */
export const THINKING_LEVEL_KEYS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

export type ReasoningEffortsValue = Record<string, string | null> | false;

/**
 * 校验 reasoningEfforts（DSH llm-pi-ai 语义，服务端与客户端共用）：
 * - false = 非推理模型，合法
 * - 键必须 ∈ THINKING_LEVEL_KEYS；值必须非空字符串，仅 off 允许 null
 * - 空字典、仅 off 无其他档位均非法
 */
export function validateReasoningEfforts(
  value: unknown,
): { ok: true; value: ReasoningEffortsValue } | { ok: false; error: string } {
  if (value === false) return { ok: true, value: false };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'reasoningEfforts 必须是档位字典或 false' };
  }
  const dict = value as Record<string, unknown>;
  const keys = Object.keys(dict);
  if (keys.length === 0) return { ok: false, error: 'reasoningEfforts 不能为空字典' };
  const out: Record<string, string | null> = {};
  for (const k of keys) {
    if (!(THINKING_LEVEL_KEYS as readonly string[]).includes(k)) {
      return { ok: false, error: `reasoningEfforts 键 "${k}" 不是 DSH 支持的档位（off/minimal/low/medium/high/xhigh/max）` };
    }
    const v = dict[k];
    if (v === null) {
      if (k !== 'off') {
        return { ok: false, error: `reasoningEfforts.${k} 必须提供 wire 值，仅 off 允许留空` };
      }
      out[k] = null;
    } else if (typeof v === 'string' && v.length > 0) {
      out[k] = v;
    } else {
      return { ok: false, error: `reasoningEfforts.${k} 的值必须是非空字符串或 null` };
    }
  }
  if (!keys.some((k) => k !== 'off')) {
    return { ok: false, error: 'reasoningEfforts 除 off 外至少需要一个思考档位（非推理模型请用 false）' };
  }
  return { ok: true, value: out };
}

export interface A6ApiModelMeta {
  id: string;
  name: string;
  brand: string;
  contextWindow: number;
  maxTokens: number;
  modalities: ('text' | 'image')[];
  reasoningEfforts?: Record<string, string>;
  thinkingFormat?: string;
  officialPriceMicros?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export interface OfficialPrices {
  input_cny: string;
  output_cny: string;
  cache_read_cny: string;
  cache_write_cny: string;
  input_price_micros?: number;
  output_price_micros?: number;
  cache_read_price_micros?: number;
  cache_write_price_micros?: number;
}

export interface SuccessBucketItem {
  sample_count?: number;
  success_count?: number;
  success_rate: number;
}

export interface Bucket24hItem {
  s?: number;
  k?: number;
  r: number;
  t?: number;
  d?: number;
  f?: number;
  c?: number;
}

export interface Bucket7dItem {
  s?: number;
  k?: number;
  r?: number;
  t?: number;
  d?: number;
  f?: number;
  c?: number;
}

export interface MerchantChannelInfo {
  listing_id?: number;
  channel_id: number;
  channel_name: string;
  supplier_name: string;
  supplier_id?: number;
  model_name: string;
  brand: string;
  description: string;
  charge_type?: string;
  charge_type_text?: string;
  sample_count?: number;
  sample_count_text?: string;
  input_price_micros: number;
  output_price_micros: number;
  cache_read_price_micros: number;
  cache_write_price_micros: number;
  input_price_cny: string;
  output_price_cny: string;
  cache_read_price_cny: string;
  cache_write_price_cny: string;
  official_price?: OfficialPrices;
  realtime_ratio_cny: number;
  realtime_ratio_formatted: string;
  recent_success_rate_pct: number;
  success_rate_24h_pct: number;
  success_rate_7d_pct?: number;
  success_buckets?: SuccessBucketItem[];
  b24?: Bucket24hItem[];
  b7d?: Bucket7dItem[];
  sr_24h_state?: string;
  sr_7d_state?: string;
  p50_ttft_ms?: number;
  recent_p50_ms: number;
  cache_hit_rate_pct: number;
  /** 混合价估算（¥ / 1亿 tokens）：输入类 99.65% 按 24h 缓存命中率分为命中（缓存读价）/未命中（输入价），输出固定占 0.35%；无 token 单价时缺省不展示 */
  blended_price_100m_cny?: number;
  labels: string[];
  last_success_at: number;
  last_success_text: string;
  authenticity_guaranteed: boolean;
  authenticity_badge?: string;
  is_pinned?: boolean;
  /** 官方渠道搜索返回的固定状态：pin_here / pin_elsewhere / undefined */
  pin_status?: string;
  user_channel_disabled?: boolean;
  supplier_channel_disabled?: boolean;
  raw?: any;
}

/** 平台侧固定记录（GET /api/marketplace/pins） */
export interface MarketplacePin {
  id?: number;
  token_id: number;
  token_name?: string;
  model_name: string;
  channel_id?: number;
  channel_name?: string;
  supplier_name?: string;
  supplier_nickname?: string;
  /** 异常时是否自动切换智能优选（false = 严格固定） */
  fallback_to_smart_routing?: boolean;
  created_at?: number;
  raw?: any;
}

/** 令牌列表条目（GET /api/token/，用于把 API Key 解析为 token_id） */
export interface A6ApiTokenItem {
  id: number;
  name?: string;
  key?: string;
  status?: number;
  raw?: any;
}

export interface ModelCardData {
  model_name: string;
  brand: string;
  contextWindow: number;
  maxTokens: number;
  modalities: ('text' | 'image')[];
  hasReasoning: boolean;
  inDsh: boolean;
  merchant?: MerchantChannelInfo;
  probeStatus: 'idle' | 'queued' | 'probing' | 'success' | 'error';
  probeError?: string;
  probeLatencyMs?: number;
  lastProbedAt?: number;
  /** 路由快照时效：该模型最新一条「带 channel 的调用日志」时间（秒），即卡片商户数据来源请求的时刻 */
  lastRoutedAt?: number;
  /** 服务端算好的相对时间文案（如「3 小时前」），无记录时客户端显示「从未路由」 */
  lastRoutedText?: string;
  /** 平台固定状态（按当前 API Key 令牌）：固定到卡片商家 / 固定到其他商家 / 未固定 */
  pinStatus?: 'pin_here' | 'pin_elsewhere';
  /** 固定的渠道 ID（pin_elsewhere 时用于展示固定到了哪家） */
  pinnedChannelId?: number;
  pinnedSupplierName?: string;
  pinnedFallback?: boolean;
  /** 该模型对应的固定记录是否属于当前 API Key 令牌（false 时仅作参考展示） */
  pinTokenMatched?: boolean;
}

export interface BalanceInfo {
  hasAccountAuth: boolean;
  accountBalanceUsd: number;
  accountBalanceFormatted: string;
  accountBalanceCnyFormatted: string;
  usedUsd: number;
  usedFormatted: string;
  requestCount: number;
  username?: string;
  userId?: string | number;
  isLow: boolean;
  updatedAt: number;
}

export interface ApiRoutingLogItem {
  id: number | string;
  created_at: number;
  model_name: string;
  channel?: number | string;
  channel_name?: string;
  /** 发起该请求的令牌 ID（用于把 API Key 解析为固定/禁用所需的 token_id） */
  token_id?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  use_time?: number;
  quota?: number;
  cost_usd?: number;
  cost_formatted?: string;
  token_name?: string;
  status: 'success' | 'error';
  other?: string;
  raw?: any;
}

export interface A6ApiStateResponse {
  config: A6ApiConfig;
  balance: BalanceInfo | null;
  models: ModelCardData[];
  dshConfiguredModels: string[];
  recentLogs?: ApiRoutingLogItem[];
  /** 平台固定记录列表（用于卡片状态跟随官网） */
  pins?: MarketplacePin[];
}
// 价格波动胶囊（轻量监听）
export interface PriceFluctuationState {
  pendingCount: number;
  unseenCount: number;
  totalCount: number;
  updatedAt: number | null;
  hasAuth?: boolean;
  authError?: boolean;
}
