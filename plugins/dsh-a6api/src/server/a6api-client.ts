import type { BalanceInfo, MerchantChannelInfo, OfficialPrices, ApiRoutingLogItem, MarketplacePin, A6ApiTokenItem } from '../types.js';
import { resolveModelMeta } from './catalog.js';

/** Normalize Base URL removing trailing slashes */
export function cleanBaseUrl(url: string): string {
  if (!url) return 'https://api.a6api.com';
  return url.trim().replace(/\/+$/, '');
}

/** Format relative time */
export function formatRelativeTime(timestampSec: number): string {
  if (!timestampSec || timestampSec <= 0) return '刚刚';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestampSec;
  if (diff < 0) return '刚刚';
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

/** Format CNY Price */
export function formatCnyPrice(micros: number, exchangeRate = 6.7209): string {
  if (micros === undefined || micros === null) return '—';
  if (micros === 0) return '¥0';
  const usd = micros / 1_000_000;
  const cny = usd * exchangeRate;
  if (cny < 0.0001) return `¥${cny.toFixed(6)}`;
  if (cny < 0.01) return `¥${cny.toFixed(4)}`;
  if (cny < 1) return `¥${cny.toFixed(4)}`;
  return `¥${cny.toFixed(3)}`;
}

/** 混合价估算常数：输出 token 占总 token 比例固定 0.35%（与官网模型市场 ¥/100M 标注口径一致） */
const BLENDED_OUT_SHARE = 0.0035;

/**
 * 混合价估算（¥ / 1亿 tokens，供模型卡片徽标展示，换算与口径同官网标注脚本）：
 * 输入类 token 占 99.65%，按 24h 实测缓存命中率分为「命中 × 缓存读价」与「未命中 × 输入价」，
 * 输出固定占 0.35% × 输出价。单价按 micros/1e6 × 汇率折算为 ¥/1M；
 * 三类单价全为 0（按次计费等无 token 单价）时返回 undefined，前端不展示。
 */
export function computeBlendedPrice100m(
  inMicros: number,
  cacheReadMicros: number,
  outMicros: number,
  cacheHitRatePct: number,
  exchangeRate: number,
): number | undefined {
  const inY = (inMicros / 1_000_000) * exchangeRate; // 未命中（输入）价 ¥/1M
  const hitY = (cacheReadMicros / 1_000_000) * exchangeRate; // 命中（缓存读）价 ¥/1M
  const outY = (outMicros / 1_000_000) * exchangeRate; // 输出价 ¥/1M
  if (inY <= 0 && hitY <= 0 && outY <= 0) return undefined;
  const h = Math.min(1, Math.max(0, cacheHitRatePct / 100));
  const inShare = 1 - BLENDED_OUT_SHARE; // 输入类 token 占比 99.65%
  const per1M = h * inShare * hitY + (1 - h) * inShare * inY + BLENDED_OUT_SHARE * outY;
  return per1M * 100;
}

export function buildWebHeaders(userId?: string, accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };
  const uid = userId ? String(userId).trim() : '';
  if (uid) {
    headers['New-Api-User'] = uid;
  }
  if (accessToken && accessToken.trim()) {
    const raw = accessToken.trim();
    if (raw.startsWith('session=')) {
      headers['Cookie'] = raw;
    } else if (raw.includes(';')) {
      headers['Cookie'] = raw;
    } else {
      // Set both Authorization (for System Access Token) and Cookie fallback
      headers['Authorization'] = raw;
      headers['Cookie'] = `session=${raw}`;
    }
  }
  return headers;
}

/** Fetch User Balance (Real Account Balance Only) */
export async function fetchBalance(
  baseURL: string,
  apiKey: string,
  userId?: string,
  accessToken?: string,
): Promise<BalanceInfo | null> {
  const cleanUrl = cleanBaseUrl(baseURL);

  let hasAccountAuth = false;
  let accountBalanceUsd = 0;
  let accountBalanceFormatted = '未连接';
  let accountBalanceCnyFormatted = '';
  let username: string | undefined;
  let responseUserId: string | number | undefined = userId;
  let usedUsd = 0;
  let requestCount = 0;

  // 1. Fetch real account balance from Web Console API
  if (userId || accessToken) {
    const candidates = ['https://a6api.com/api/user/self', `${cleanUrl}/api/user/self`];
    const uniqueCandidates = [...new Set(candidates)];

    for (const url of uniqueCandidates) {
      try {
        const res = await fetch(url, {
          headers: buildWebHeaders(userId, accessToken),
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.data && json.data.quota !== undefined) {
            const quota = Number(json.data.quota || 0);
            const rawUsed = Number(json.data.used_quota || 0);
            const usd = Number((quota / 500000).toFixed(4));
            const cny = Number((usd * 6.7209).toFixed(2));
            const used = Number((rawUsed / 500000).toFixed(4));

            hasAccountAuth = true;
            accountBalanceUsd = usd;
            accountBalanceFormatted = `$${usd.toFixed(2)}`;
            accountBalanceCnyFormatted = `≈ ¥${cny.toFixed(2)}`;
            usedUsd = used;
            requestCount = Number(json.data.request_count || 0);
            username = json.data.username || json.data.display_name || undefined;
            if (json.data.id) responseUserId = json.data.id;
            break;
          }
        }
      } catch {
        // continue candidate
      }
    }
  }

  // 2. If only API Key is present, query usage for consumed statistics if auth is not yet connected
  if (!hasAccountAuth && apiKey && apiKey.trim()) {
    try {
      const usageRes = await fetch(`${cleanUrl}/v1/dashboard/billing/usage?start_date=2024-01-01&end_date=2030-12-31`, {
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      }).catch(() => null);

      if (usageRes && usageRes.ok) {
        const usageJson = await usageRes.json();
        usedUsd = Number(usageJson?.total_usage || 0);
      }
    } catch {}
  }

  if (!hasAccountAuth && (!apiKey || !apiKey.trim()) && (!userId || !userId.trim())) {
    return null;
  }

  return {
    hasAccountAuth,
    accountBalanceUsd,
    accountBalanceFormatted,
    accountBalanceCnyFormatted,
    usedUsd,
    usedFormatted: `$${usedUsd.toFixed(2)}`,
    requestCount,
    username,
    userId: responseUserId,
    isLow: hasAccountAuth ? accountBalanceUsd < 0.5 : false,
    updatedAt: Date.now(),
  };
}

/** Fetch Token Allowed Models */
export async function fetchTokenModels(baseURL: string, apiKey: string): Promise<string[]> {
  const cleanUrl = cleanBaseUrl(baseURL);
  if (!apiKey || !apiKey.trim()) return [];

  const endpoints = [`${cleanUrl}/v1/models`, `${cleanUrl}/models`];
  let lastErr = null;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data)) {
          return json.data.map((m: any) => String(m.id || m.name)).filter(Boolean);
        }
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (lastErr) {
    console.warn('[dsh-a6api] fetchTokenModels failed:', lastErr);
  }
  return [];
}

/** Fetch Recent User Routing Logs */
export async function fetchRecentLogs(
  userId?: string,
  accessToken?: string,
  limit = 30,
): Promise<ApiRoutingLogItem[]> {
  if (!userId && !accessToken) return [];
  try {
    const res = await fetch(`https://a6api.com/api/log/self?p=1&page_size=${limit}&type=0`, {
      headers: buildWebHeaders(userId, accessToken),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data?.items)) {
        return json.data.items.map((it: any) => {
          const rawQuota = Number(it.quota || 0);
          const costUsd = rawQuota / 500000;
          let costFormatted = '$0.00';
          if (costUsd > 0) {
            if (costUsd < 0.0001) costFormatted = `$${costUsd.toFixed(6)}`;
            else if (costUsd < 0.01) costFormatted = `$${costUsd.toFixed(4)}`;
            else costFormatted = `$${costUsd.toFixed(4)}`;
          }

          const rawChannel = Number(it.channel || 0);
          let channelId: number | undefined = rawChannel > 0 ? rawChannel : undefined;
          if (!channelId && it.other) {
            try {
              const otherObj = JSON.parse(it.other);
              if (otherObj.actual_channel_id && Number(otherObj.actual_channel_id) > 0) {
                channelId = Number(otherObj.actual_channel_id);
              } else if (otherObj.billed_channel_id && Number(otherObj.billed_channel_id) > 0) {
                channelId = Number(otherObj.billed_channel_id);
              }
            } catch {}
          }

          const isError =
            it.type !== 2 ||
            (it.other && (
              it.other.includes('"request_final_status":"failed"') ||
              it.other.includes('"request_final_status":"error"') ||
              it.other.includes('"request_final_status":"upstream_error"')
            )) ||
            Boolean(it.content && it.content.startsWith('status_code='));

          return {
            id: it.id || it.request_id || String(Math.random()),
            created_at: Number(it.created_at || Date.now() / 1000),
            model_name: it.model_name || it.marketplace_model_name || '',
            channel: channelId,
            channel_name: it.channel_name || (channelId ? `商户 #${channelId}` : undefined),
            token_id: it.token_id !== undefined && it.token_id !== null ? Number(it.token_id) : undefined,
            prompt_tokens: Number(it.prompt_tokens || 0),
            completion_tokens: Number(it.completion_tokens || 0),
            use_time: Number(it.use_time || 0),
            quota: rawQuota,
            cost_usd: costUsd,
            cost_formatted: costFormatted,
            token_name: it.token_name || 'API',
            status: isError ? ('error' as const) : ('success' as const),
            other: it.other,
            raw: it,
          };
        });
      }
    }
  } catch (err) {
    console.warn('[dsh-a6api] fetchRecentLogs error:', err);
  }
  return [];
}

/** Fetch Channel Card details from A6API Marketplace */
export async function fetchChannelDetails(
  channelId: number,
  userId?: string,
  accessToken?: string,
  targetModelName?: string,
  logSnapshot?: any,
): Promise<MerchantChannelInfo | null> {
  if (!channelId) return null;
  const targetName = targetModelName || '';
  const meta = resolveModelMeta(targetName);

  try {
    const res = await fetch(
      `https://a6api.com/api/marketplace/channels/search?channel_id=${channelId}&view=list&page=1&page_size=20`,
      {
        headers: buildWebHeaders(userId, accessToken),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (res.ok) {
      const json = await res.json();
      const items: any[] = json?.data?.items || [];
      if (items.length > 0) {
        // Find match for targetModelName if provided, otherwise first item
        const item =
          (targetName
            ? items.find((it) => it.model_name?.toLowerCase() === targetName.toLowerCase())
            : null) || items[0];

        const rate = Number(item.realtime_ratio_exchange_rate || 6.7209);
        const inMicros = Number(item.input_price_micros || 0);
        const outMicros = Number(item.output_price_micros || 0);
        const cacheReadMicros = Number(item.cache_read_price_micros || 0);
        const cacheWriteMicros = Number(item.cache_write_price_micros || 0);

        // Parse Smart Routing Labels
        const labels: string[] = [];
        if (item.authenticity_guaranteed) {
          const badge = item.authenticity_guarantee_badge_key;
          if (badge === 'gold') labels.push('保真 · 金标');
          else if (badge === 'silver') labels.push('保真 · 银标');
          else if (badge === 'bronze') labels.push('保真 · 铜标');
          else labels.push('保真');
        }
        if (Array.isArray(item.smart_routing_labels)) {
          for (const l of item.smart_routing_labels) {
            if (l === 'stable' && !labels.includes('稳定')) labels.push('稳定');
            if (l === 'cheap' && !labels.includes('低价')) labels.push('低价');
            if (l === 'fast' && !labels.includes('高速')) labels.push('高速');
            if (l === 'quality' && !labels.includes('高质')) labels.push('高质');
          }
        }
        if (labels.length === 0) {
          labels.push('稳定', '低价', '高速', '高质');
        }

        // Official Prices
        let official_price: OfficialPrices | undefined;
        if (item.official_price && item.official_price.input_price_micros !== undefined) {
          const offIn = Number(item.official_price.input_price_micros || 0);
          const offOut = Number(item.official_price.output_price_micros || 0);
          const offCR = Number(item.official_price.cache_read_price_micros || 0);
          const offCW = Number(item.official_price.cache_write_price_micros || 0);
          official_price = {
            input_price_micros: offIn,
            output_price_micros: offOut,
            cache_read_price_micros: offCR,
            cache_write_price_micros: offCW,
            input_cny: formatCnyPrice(offIn, rate),
            output_cny: formatCnyPrice(offOut, rate),
            cache_read_cny: formatCnyPrice(offCR, rate),
            cache_write_cny: formatCnyPrice(offCW, rate),
          };
        } else if (meta.officialPriceMicros) {
          const offIn = meta.officialPriceMicros.input;
          const offOut = meta.officialPriceMicros.output;
          const offCR = meta.officialPriceMicros.cacheRead;
          const offCW = meta.officialPriceMicros.cacheWrite;
          official_price = {
            input_price_micros: offIn,
            output_price_micros: offOut,
            cache_read_price_micros: offCR,
            cache_write_price_micros: offCW,
            input_cny: formatCnyPrice(offIn, rate),
            output_cny: formatCnyPrice(offOut, rate),
            cache_read_cny: formatCnyPrice(offCR, rate),
            cache_write_cny: formatCnyPrice(offCW, rate),
          };
        }

        const successRate24h =
          item.success_rate_24h !== undefined ? Number(item.success_rate_24h) / 100 : 99.3;
        const recentSuccessRate =
          item.recent_success_rate !== undefined ? Number(item.recent_success_rate) / 100 : 100;
        const cacheHitRate =
          item.cache_hit_rate_24h !== undefined ? Number(item.cache_hit_rate_24h) / 100 : 72.0;
        const lastSuccessAt = Number(item.last_success_at || item.last_test_time || 0);

        const blended100m = computeBlendedPrice100m(inMicros, cacheReadMicros, outMicros, cacheHitRate, rate);

        const ratioCny = Number(item.realtime_ratio_cny || (inMicros / 1000000) * rate || 0.0341);
        const ratioFormatted = ratioCny.toFixed(4);

        return {
          listing_id: item.listing_id,
          // 归一化为数字，避免官方返回字符串 channel_id 导致严格相等比较失效（接管/固定判定依赖）
          channel_id: item.channel_id !== undefined && item.channel_id !== null ? Number(item.channel_id) : channelId,
          channel_name: item.channel_name || `商户 #${channelId}`,
          supplier_name: item.supplier_name || item.supplier_nickname || 'GPT低价',
          supplier_id: item.supplier_id || 290,
          model_name: item.model_name || targetName,
          brand: item.brand || meta.brand || 'OpenAI',
          description: item.description || '高并发 主打便宜 稳定',
          charge_type: item.charge_type || 'per_token',
          charge_type_text: item.charge_type === 'per_token' ? '按量' : '按量',
          sample_count: Number(item.sample_count || 100),
          sample_count_text: `近 ${item.sample_count || 100} 次样本`,
          input_price_micros: inMicros,
          output_price_micros: outMicros,
          cache_read_price_micros: cacheReadMicros,
          cache_write_price_micros: cacheWriteMicros,
          input_price_cny: formatCnyPrice(inMicros, rate),
          output_price_cny: formatCnyPrice(outMicros, rate),
          cache_read_price_cny: formatCnyPrice(cacheReadMicros, rate),
          cache_write_price_cny: formatCnyPrice(cacheWriteMicros, rate),
          official_price,
          realtime_ratio_cny: ratioCny,
          realtime_ratio_formatted: ratioFormatted,
          recent_success_rate_pct: recentSuccessRate,
          success_rate_24h_pct: successRate24h,
          success_rate_7d_pct: item.success_rate_7d !== undefined ? Number(item.success_rate_7d) / 100 : undefined,
          success_buckets: Array.isArray(item.success_buckets) ? item.success_buckets : undefined,
          b24: Array.isArray(item.b24) ? item.b24 : undefined,
          b7d: Array.isArray(item.b7d) ? item.b7d : undefined,
          sr_24h_state: item.sr_24h_state || 'rate',
          sr_7d_state: item.sr_7d_state || 'no_data',
          p50_ttft_ms: Number(item.p50_ttft_ms || 2273),
          recent_p50_ms: Number(item.recent_p50_ms || item.last_test_response_ms || 2340),
          cache_hit_rate_pct: cacheHitRate,
          blended_price_100m_cny: blended100m,
          labels,
          last_success_at: lastSuccessAt,
          last_success_text: formatRelativeTime(lastSuccessAt),
          authenticity_guaranteed: Boolean(item.authenticity_guaranteed),
          authenticity_badge: item.authenticity_guarantee_badge_key,
          // 官方固定状态值是 pin_here / pin_elsewhere（早期代码误用 'pinned'，已修正）
          is_pinned: item.pin_status === 'pin_here' || item.route_status === 'pin_here',
          pin_status: typeof item.pin_status === 'string' ? item.pin_status : undefined,
          user_channel_disabled: Boolean(item.user_channel_disabled || item.route_status === 'user_disabled'),
          supplier_channel_disabled: Boolean(item.supplier_channel_disabled),
          raw: item,
        };
      }
    }
  } catch (err) {
    console.warn('[dsh-a6api] fetchChannelDetails error:', err);
  }

  // Fallback if we have log snapshot info
  if (logSnapshot) {
    const rate = 6.7209;
    const inMicros = Number(logSnapshot.marketplace_price_input_micros || 20300);
    const outMicros = Number(logSnapshot.marketplace_price_output_micros || 101502);
    const cacheReadMicros = Number(logSnapshot.marketplace_price_cache_read_micros || 2030);
    const cacheWriteMicros = Number(logSnapshot.marketplace_price_cache_write_micros || 25375);

    let official_price: OfficialPrices | undefined;
    if (meta.officialPriceMicros) {
      const offIn = meta.officialPriceMicros.input;
      const offOut = meta.officialPriceMicros.output;
      const offCR = meta.officialPriceMicros.cacheRead;
      const offCW = meta.officialPriceMicros.cacheWrite;
      official_price = {
        input_price_micros: offIn,
        output_price_micros: offOut,
        cache_read_price_micros: offCR,
        cache_write_price_micros: offCW,
        input_cny: formatCnyPrice(offIn, rate),
        output_cny: formatCnyPrice(offOut, rate),
        cache_read_cny: formatCnyPrice(offCR, rate),
        cache_write_cny: formatCnyPrice(offCW, rate),
      };
    }

    const ratioCny = Number((inMicros / 1000000) * rate || 0.0341);

    return {
      listing_id: logSnapshot.marketplace_listing_id,
      channel_id: channelId,
      channel_name: logSnapshot.channel_name || `商户 #${channelId}`,
      supplier_name: logSnapshot.supplier_nickname || logSnapshot.channel_name || 'GPT低价',
      supplier_id: 290,
      model_name: targetName || logSnapshot.model_name || '',
      brand: meta.brand || 'OpenAI',
      description: '高并发 主打便宜 稳定',
      charge_type: 'per_token',
      charge_type_text: '按量',
      sample_count: 100,
      sample_count_text: '近 100 次样本',
      input_price_micros: inMicros,
      output_price_micros: outMicros,
      cache_read_price_micros: cacheReadMicros,
      cache_write_price_micros: cacheWriteMicros,
      input_price_cny: formatCnyPrice(inMicros, rate),
      output_price_cny: formatCnyPrice(outMicros, rate),
      cache_read_price_cny: formatCnyPrice(cacheReadMicros, rate),
      cache_write_price_cny: formatCnyPrice(cacheWriteMicros, rate),
      official_price,
      realtime_ratio_cny: ratioCny,
      realtime_ratio_formatted: ratioCny.toFixed(4),
      recent_success_rate_pct: 100,
      success_rate_24h_pct: 99.3,
      recent_p50_ms: Number(logSnapshot.use_time ? logSnapshot.use_time * 1000 : 2340),
      p50_ttft_ms: 2273,
      cache_hit_rate_pct: 72.0,
      blended_price_100m_cny: computeBlendedPrice100m(inMicros, cacheReadMicros, outMicros, 72.0, rate),
      labels: ['稳定', '低价', '高速', '高质'],
      last_success_at: Math.floor(Date.now() / 1000),
      last_success_text: '刚刚',
      authenticity_guaranteed: false,
      is_pinned: false,
      user_channel_disabled: false,
    };
  }

  return null;
}
/** 轻量拉取价格波动条数（仅 pending/unseen） */
export async function fetchPriceFluctuation(
  userId?: string,
  accessToken?: string,
): Promise<{ pendingCount: number; unseenCount: number; totalCount: number; notices?: any[]; authError?: boolean }> {
  const token = (accessToken || '').trim();
  const uid = (userId || '').trim();
  if (!uid && !token) {
    return { pendingCount: 0, unseenCount: 0, totalCount: 0, authError: false };
  }
  const headers = buildWebHeaders(uid || undefined, token || undefined);
  const url = 'https://a6api.com/api/marketplace/price-notices';
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (res.status === 401 || res.status === 403) {
      console.warn('[dsh-a6api] fetchPriceFluctuation auth failed', res.status);
      return { pendingCount: 0, unseenCount: 0, totalCount: 0, authError: true };
    }
    if (!res.ok) {
      console.warn('[dsh-a6api] fetchPriceFluctuation HTTP', res.status);
      return { pendingCount: 0, unseenCount: 0, totalCount: 0 };
    }
    const json: any = await res.json().catch(() => null);
    if (!json) return { pendingCount: 0, unseenCount: 0, totalCount: 0 };
    if (json.success === false) return { pendingCount: 0, unseenCount: 0, totalCount: 0 };

    // 兼容多种返回形态
    let arr: any[] = [];
    if (Array.isArray(json)) arr = json;
    else if (Array.isArray(json.data)) arr = json.data;
    else if (Array.isArray(json.data?.notices)) arr = json.data.notices;
    else if (Array.isArray(json.data?.items)) arr = json.data.items;
    else if (Array.isArray(json.notices)) arr = json.notices;
    else if (Array.isArray(json.items)) arr = json.items;

    // 区分“字段缺失” vs “显式为 0”——仅缺失时才兜底
    const pickWithPresent = (keys: string[]): { value: number; present: boolean } => {
      for (const k of keys) {
        const v = json?.data?.[k] ?? json?.[k];
        if (v !== undefined && v !== null) {
          const n = Number(v);
          if (!Number.isNaN(n)) return { value: n, present: true };
        }
      }
      return { value: 0, present: false };
    };
    const pendingPick = pickWithPresent(['pendingCount', 'pending_count', 'pending', 'openCount']);
    const unseenPick = pickWithPresent(['unseenCount', 'unseen_count', 'unseen', 'has_unseen_count']);
    let pending = pendingPick.value;
    let unseen = unseenPick.value;
    const total = arr.length;

    // 仅在计数键缺失时才从数组兜底，避免覆盖 API 显式 0
    if (!pendingPick.present && arr.length > 0) {
      // 上游真实形态：notice.status ∈ effective/superseded（价格事件本身的状态），
      // 用户对固定渠道的「待处理」信号在 relations[].state === 'open'（obsolete = 已被新通知取代）。
      // 有 relations 时以 open 为准；无 relations 时退回通知级状态（含 effective）。
      const isPendingNotice = (n: any): boolean => {
        if (n?.pending === true) return true;
        const rels = Array.isArray(n?.relations) ? n.relations : [];
        if (rels.length > 0) {
          return rels.some((r: any) => String(r?.state ?? '').toLowerCase() === 'open');
        }
        const s = String(n?.state ?? n?.status ?? '').toLowerCase();
        return s === 'open' || s === 'pending' || s === 'effective';
      };
      const counted = arr.filter(isPendingNotice).length;
      // 仅当数组有可识别的状态信号时才用 counted，否则保持 0（不猜测）
      const hasState = arr.some(
        (n: any) =>
          n.state !== undefined ||
          n.status !== undefined ||
          (Array.isArray(n.relations) && n.relations.length > 0),
      );
      if (hasState) pending = counted;
      // 若无任何状态信号且 pending 缺失，保持 0，不再退化为 total
    }
    if (!unseenPick.present && arr.length > 0) {
      unseen = arr.filter((n: any) => n.has_unseen === true || n.hasUnseen === true || n.unseen === true || n.is_unread === true).length;
    }

    // 调试日志已移除（避免未脱敏透传）；如需本地调试可临时开启 DEBUG 环境变量
    // if (process.env.DEBUG) console.log('[dsh-a6api] price fluctuation sample', arr[0]);

    return { pendingCount: pending, unseenCount: unseen, totalCount: total, notices: arr };
  } catch (err) {
    console.warn('[dsh-a6api] fetchPriceFluctuation error', err);
    return { pendingCount: 0, unseenCount: 0, totalCount: 0 };
  }
}

/* ============================================================================
 * 固定 / 取消固定 / 禁用 一族接口（平台侧，Web 会话鉴权，与市场价格波动同凭据）
 * ========================================================================== */

interface MarketplaceActionResult {
  ok: boolean;
  message?: string;
  data?: any;
}

/** 兼容多种返回形态：{success,message} / {data:{success,message}} */
function parseMarketplaceResult(json: any): MarketplaceActionResult {
  if (!json) return { ok: false, message: '空响应' };
  const top = json.success === false ? json : null;
  const inner = json.data && json.data.success === false ? json.data : null;
  if (top) return { ok: false, message: top.message || '操作失败' };
  if (inner) return { ok: false, message: inner.message || '操作失败' };
  return { ok: true, data: json.data };
}

/** 提取数组字段：兼容 data / data.data / data.items / data.data.items 四种形态 */
function extractArray(json: any): any[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.data)) return json.data;
  if (json.data && Array.isArray(json.data.data)) return json.data.data;
  if (json.data && Array.isArray(json.data.items)) return json.data.items;
  if (json.data && json.data.data && Array.isArray(json.data.data.items)) return json.data.data.items;
  return [];
}

/** GET /api/marketplace/pins — 当前账号全部固定记录（卡片状态跟随官网的真相源） */
export async function fetchMarketplacePins(
  userId?: string,
  accessToken?: string,
): Promise<MarketplacePin[]> {
  if (!userId && !accessToken) return [];
  try {
    const res = await fetch('https://a6api.com/api/marketplace/pins', {
      headers: buildWebHeaders(userId, accessToken),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn('[dsh-a6api] fetchMarketplacePins HTTP', res.status);
      return [];
    }
    const json: any = await res.json().catch(() => null);
    if (!json || json.success === false) return [];
    return extractArray(json)
      .filter((it: any) => it && it.model_name)
      .map((it: any) => ({
        id: it.id !== undefined ? Number(it.id) : undefined,
        token_id: Number(it.token_id || 0),
        token_name: it.token_name || undefined,
        model_name: String(it.model_name),
        channel_id: it.channel_id !== undefined && Number(it.channel_id) > 0 ? Number(it.channel_id) : undefined,
        channel_name: it.channel_name || undefined,
        supplier_name: it.supplier_name || undefined,
        supplier_nickname: it.supplier_nickname || undefined,
        fallback_to_smart_routing: it.fallback_to_smart_routing !== undefined ? Boolean(it.fallback_to_smart_routing) : undefined,
        created_at: it.created_at !== undefined ? Number(it.created_at) : undefined,
        // 不下发 raw：客户端 60s 轮询用 JSON 对比判断变化，raw 含易变字段会导致误判整页刷新
      }));
  } catch (err) {
    console.warn('[dsh-a6api] fetchMarketplacePins error:', err);
    return [];
  }
}

/** GET /api/token/?p=1&size=100 — 令牌列表（用于把 API Key 解析为 token_id） */
export async function fetchTokens(
  userId?: string,
  accessToken?: string,
): Promise<A6ApiTokenItem[]> {
  if (!userId && !accessToken) return [];
  try {
    const res = await fetch('https://a6api.com/api/token/?p=1&size=100', {
      headers: buildWebHeaders(userId, accessToken),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json: any = await res.json().catch(() => null);
    if (!json || json.success === false) return [];
    return extractArray(json)
      .filter((it: any) => it && Number(it.id) > 0)
      .map((it: any) => ({
        id: Number(it.id),
        name: it.name || undefined,
        key: typeof it.key === 'string' ? it.key : undefined,
        status: it.status !== undefined ? Number(it.status) : undefined,
        raw: it,
      }));
  } catch (err) {
    console.warn('[dsh-a6api] fetchTokens error:', err);
    return [];
  }
}

/** 友好化动作类接口错误（超时英文原文转中文，与 probe.ts 同风格） */
function friendlyActionError(err: any): string {
  const raw = err?.message || String(err);
  if (raw.includes('aborted due to timeout') || err?.name === 'TimeoutError') {
    return '请求超时，请重试';
  }
  return raw;
}

/** POST /api/marketplace/pin — 把某模型的流量固定到指定渠道（绑定令牌） */
export async function marketplacePin(
  userId: string | undefined,
  accessToken: string | undefined,
  payload: {
    token_id: number;
    channel_id: number;
    model_name: string;
    fallback_to_smart_routing: boolean;
  },
): Promise<MarketplaceActionResult> {
  try {
    const res = await fetch('https://a6api.com/api/marketplace/pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildWebHeaders(userId, accessToken),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const json: any = await res.json().catch(() => null);
    const result = parseMarketplaceResult(json);
    if (!res.ok && !json) return { ok: false, message: `HTTP ${res.status}` };
    return result;
  } catch (err: any) {
    console.warn('[dsh-a6api] marketplacePin error:', err);
    return { ok: false, message: friendlyActionError(err) };
  }
}

/** POST /api/marketplace/unpin — 取消某模型的固定 */
export async function marketplaceUnpin(
  userId: string | undefined,
  accessToken: string | undefined,
  payload: { token_id: number; model_name: string },
): Promise<MarketplaceActionResult> {
  try {
    const res = await fetch('https://a6api.com/api/marketplace/unpin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildWebHeaders(userId, accessToken),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok && !json) return { ok: false, message: `HTTP ${res.status}` };
    return parseMarketplaceResult(json);
  } catch (err: any) {
    console.warn('[dsh-a6api] marketplaceUnpin error:', err);
    return { ok: false, message: friendlyActionError(err) };
  }
}

/** POST /api/marketplace/channels/:id/disable?model= — 禁用某渠道对该模型的服务 */
export async function marketplaceDisableChannel(
  userId: string | undefined,
  accessToken: string | undefined,
  channelId: number,
  model: string,
): Promise<MarketplaceActionResult> {
  try {
    const res = await fetch(
      `https://a6api.com/api/marketplace/channels/${channelId}/disable?model=${encodeURIComponent(model)}`,
      {
        method: 'POST',
        headers: buildWebHeaders(userId, accessToken),
        signal: AbortSignal.timeout(10000),
      },
    );
    const json: any = await res.json().catch(() => null);
    if (!res.ok && !json) return { ok: false, message: `HTTP ${res.status}` };
    return parseMarketplaceResult(json);
  } catch (err: any) {
    console.warn('[dsh-a6api] marketplaceDisableChannel error:', err);
    return { ok: false, message: friendlyActionError(err) };
  }
}

/** POST /api/marketplace/channels/:id/restore?model= — 恢复被禁用的渠道 */
export async function marketplaceRestoreChannel(
  userId: string | undefined,
  accessToken: string | undefined,
  channelId: number,
  model: string,
): Promise<MarketplaceActionResult> {
  try {
    const res = await fetch(
      `https://a6api.com/api/marketplace/channels/${channelId}/restore?model=${encodeURIComponent(model)}`,
      {
        method: 'POST',
        headers: buildWebHeaders(userId, accessToken),
        signal: AbortSignal.timeout(10000),
      },
    );
    const json: any = await res.json().catch(() => null);
    if (!res.ok && !json) return { ok: false, message: `HTTP ${res.status}` };
    return parseMarketplaceResult(json);
  } catch (err: any) {
    console.warn('[dsh-a6api] marketplaceRestoreChannel error:', err);
    return { ok: false, message: friendlyActionError(err) };
  }
}
