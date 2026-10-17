import { cleanBaseUrl, fetchChannelDetails, fetchRecentLogs } from './a6api-client.js';
import { fetchWithNetRetry, isFlakyNetworkError } from './net.js';
import { DEFAULT_MODEL_PROTOCOL, isModelProtocol } from '../types.js';
import type { ApiRoutingLogItem, MerchantChannelInfo, ModelProtocol } from '../types.js';

export interface ProbeResult {
  modelName: string;
  success: boolean;
  channelId?: number;
  channelName?: string;
  /** 该次请求实际使用的令牌 ID（用于固定/禁用按令牌绑定） */
  tokenId?: number;
  merchant?: MerchantChannelInfo | null;
  error?: string;
  durationMs?: number;
}

/** Delay helper */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Anthropic Messages 的 api 版本头。取 Anthropic SDK 的默认值（2023-06-01）：
 * pi-ai 走 Messages 协议时由 SDK 自带同一个值，探测要与真实流量发的一样。
 */
const ANTHROPIC_API_VERSION = '2023-06-01';

export interface ProbeRequestSpec {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/**
 * 按当前协议构造那一次极小探测请求：端点、鉴权头与请求体是同一个决定，三者在
 * 一处定完（否则会出现"探测走一条线、流量走另一条线"，固定的商户就白探了）。
 *
 * 地址语义：`baseURL` 是插件自己定的官方裸地址（不带 `/v1`）。
 * - OpenAI Chat / Response：请求打在 `{裸地址}/v1/...`（与写入线路配置的带 `/v1`
 *   前缀一致）。
 * - Messages：请求打在 `{裸地址}/v1/messages`。宿主对 Messages 收裸地址、自己再补
 *   `/v1/messages`，插件侧写线路配置时给的就是裸地址；这里若在带 `/v1` 的地址上拼，
 *   就会变成 `/v1/v1/messages`，所以只在这一支上直接补 `/v1/messages`。
 */
export function buildProbeRequest(
  protocol: ModelProtocol | undefined,
  baseURL: string,
  apiKey: string,
  modelName: string,
): ProbeRequestSpec {
  const chosen: ModelProtocol = isModelProtocol(protocol) ? protocol : DEFAULT_MODEL_PROTOCOL;
  const root = cleanBaseUrl(baseURL);
  const key = apiKey.trim();

  if (chosen === 'anthropic-messages') {
    return {
      url: `${root}/v1/messages`,
      headers: {
        'Content-Type': 'application/json',
        // Messages 协议不用 Bearer：鉴权走 x-api-key，并且必须带 api 版本头
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: {
        model: modelName,
        max_tokens: 1,
        messages: [{ role: 'user', content: '1' }],
      },
    };
  }

  if (chosen === 'openai-responses') {
    return {
      url: `${root}/v1/responses`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      // Responses 用 input 而不是 messages，输出上限字段名也不同（max_output_tokens）
      body: {
        model: modelName,
        input: [{ role: 'user', content: [{ type: 'input_text', text: '1' }] }],
        max_output_tokens: 16,
        store: false,
      },
    };
  }

  return {
    url: `${root}/v1/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: {
      model: modelName,
      messages: [{ role: 'user', content: '1' }],
      max_tokens: 1,
    },
  };
}

/** Probe a single model by sending a 1-token prompt and querying logs */
export async function probeSingleModel(
  baseURL: string,
  apiKey: string,
  userId?: string,
  accessToken?: string,
  modelName?: string,
  protocol?: ModelProtocol,
): Promise<ProbeResult> {
  const targetModel = modelName || '';
  if (!apiKey) {
    return { modelName: targetModel, success: false, error: '未配置 API Key' };
  }

  const startTime = Date.now();
  let requestOk = false;
  let requestError = '';

  try {
    const spec = buildProbeRequest(protocol, baseURL, apiKey, targetModel);
    const res = await fetchWithNetRetry(spec.url, {
      method: 'POST',
      headers: spec.headers,
      body: JSON.stringify(spec.body),
      // 推理模型(如 grok-4.6)实测单次响应可达 40-90s+,阈值过短会被频繁掐断导致探测失败；
      // 走 fetchWithNetRetry：每次尝试独立 180s 窗口，传输层瞬断(ECONNRESET)自动重试一次
      timeoutMs: 180000,
    });

    if (res.ok) {
      requestOk = true;
    } else {
      const errText = await res.text();
      requestError = `HTTP ${res.status}: ${errText.slice(0, 150)}`;
    }
  } catch (err: any) {
    const raw = err?.message || String(err);
    // 超时错误英文原文对用户不友好,转为中文提示
    if (raw.includes('aborted due to timeout') || err?.name === 'TimeoutError') {
      requestError = '探测超时(阈值180秒) — 推理模型响应较慢,已保留上次商户数据,请稍后重试';
    } else if (isFlakyNetworkError(err)) {
      // 实测：上游回收空闲连接后首发请求约 5s 抛 fetch failed(ECONNRESET)，重试即恢复；
      // fetchWithNetRetry 已自动重试一次，走到这里说明重试后仍失败
      requestError = '与上游连接不稳定(fetch failed，已自动重试仍失败)，请稍后重试';
    } else {
      requestError = raw;
    }
  }

  const durationMs = Date.now() - startTime;

  // 仅请求成功后查日志,失败时直接返回错误(不在卡片上回退展示历史商户)
  if (requestOk && (userId || accessToken)) {
    // Wait slightly for gateway log writing (慢模型请求期间日志已落盘,快模型需要等待)
    await sleep(1200);
    try {
      const logs = await fetchRecentLogs(userId, accessToken, 15);
      const minTimestamp = Math.floor(startTime / 1000) - 10;
      // Find recent log entry for this model
      const log =
        logs.find(
          (it) =>
            it.model_name?.toLowerCase() === targetModel.toLowerCase() &&
            Number(it.created_at || 0) >= minTimestamp,
        ) || logs.find((it) => it.model_name?.toLowerCase() === targetModel.toLowerCase());

      if (log && log.channel) {
        const channelId = Number(log.channel);
        let logSnapshot: any = null;
        if (log.other) {
          try {
            logSnapshot = { ...JSON.parse(log.other), channel_name: log.channel_name, model_name: log.model_name };
          } catch {}
        }
        const merchant = await fetchChannelDetails(channelId, userId, accessToken, targetModel, logSnapshot);
        return {
          modelName: targetModel,
          success: true,
          channelId,
          channelName: log.channel_name,
          // 该次请求由 API Key 发起，日志中记录的 token_id 即该 Key 的令牌 ID
          tokenId: log.token_id !== undefined && Number(log.token_id) > 0 ? Number(log.token_id) : undefined,
          merchant,
          durationMs,
        };
      }
    } catch (err: any) {
      console.warn(`[dsh-a6api] Log lookup error for ${targetModel}:`, err);
    }
  }

  return {
    modelName: targetModel,
    success: requestOk,
    durationMs,
    error: requestOk ? undefined : requestError,
  };
}

/** Pre-populate merchant cards from recent logs without triggering live probe */
export async function getKnownMerchantsFromLogs(
  userId?: string,
  accessToken?: string,
  modelNames: string[] = [],
  logs?: ApiRoutingLogItem[],
): Promise<Record<string, MerchantChannelInfo>> {
  if ((!userId && !accessToken) || modelNames.length === 0) return {};

  const result: Record<string, MerchantChannelInfo> = {};
  try {
    const items = logs !== undefined ? logs : await fetchRecentLogs(userId, accessToken, 50);
    // 防御性排序：与 /state 的 lastRoutedMap 保持一致
    const sorted = items.slice().sort((a: any, b: any) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
    const modelToLog = new Map<string, any>();

    for (const log of sorted) {
      const mName = log.model_name;
      const chId = Number(log.channel);
      if (mName && chId && !modelToLog.has(mName.toLowerCase())) {
        modelToLog.set(mName.toLowerCase(), log);
      }
    }

    const matchedEntries: { modelName: string; log: any }[] = [];
    for (const name of modelNames) {
      const log = modelToLog.get(name.toLowerCase());
      if (log) {
        matchedEntries.push({ modelName: name, log });
      }
    }

    // Fetch details with concurrency limit 4
    for (let i = 0; i < matchedEntries.length; i += 4) {
      const batch = matchedEntries.slice(i, i + 4);
      await Promise.all(
        batch.map(async ({ modelName, log }) => {
          try {
            const channelId = Number(log.channel);
            let logSnapshot: any = null;
            if (log.other) {
              try {
                logSnapshot = { ...JSON.parse(log.other), channel_name: log.channel_name, model_name: log.model_name };
              } catch {}
            }
            const card = await fetchChannelDetails(channelId, userId, accessToken, modelName, logSnapshot);
            if (card) {
              result[modelName] = card;
            }
          } catch {
            // ignore
          }
        }),
      );
    }
  } catch (err) {
    console.warn('[dsh-a6api] getKnownMerchantsFromLogs error:', err);
  }

  return result;
}
