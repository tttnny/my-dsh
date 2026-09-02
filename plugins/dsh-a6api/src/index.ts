import { fetchBalance, fetchTokenModels, fetchRecentLogs, fetchPriceFluctuation, formatRelativeTime, fetchMarketplacePins, fetchTokens, fetchChannelDetails, marketplacePin, marketplaceUnpin, marketplaceDisableChannel, marketplaceRestoreChannel } from './server/a6api-client.js';
import { getKnownMerchantsFromLogs, probeSingleModel } from './server/probe.js';
import { resolveModelMeta, getCatalog, upsertCatalogEntries, clearCatalog, queryOpenRouter, fetchMarketplaceModels, updateCatalogEntry } from './server/catalog.js';
import { createConfigAccess } from './server/sync.js';
import type { ConfigAccess } from './server/sync.js';
import type { A6ApiConfig, A6ApiStateResponse, MarketplacePin, MerchantChannelInfo, ModelCardData } from './types.js';
import { validateReasoningEfforts } from './types.js';

export const name = '@lynn123411/dsh-a6api';
export const inject = ['webServer'];

export {
  fetchBalance,
  fetchTokenModels,
  fetchRecentLogs,
  fetchChannelDetails,
  fetchMarketplacePins,
} from './server/a6api-client.js';
export { probeSingleModel, getKnownMerchantsFromLogs } from './server/probe.js';
export {
  resolveModelMeta,
  inferBrand,
  getCatalog,
  getCatalogEntry,
  clearCatalog,
  queryOpenRouter,
  fetchMarketplaceModels,
  updateCatalogEntry,
} from './server/catalog.js';
export { createConfigAccess, A6API_CRED_REF, A6API_TOKEN_REF, A6API_USER_REF } from './server/sync.js';

const PREFIX = '/api/dsh-a6api';

/** 客户端脱敏占位符：服务端绝不回传真实密钥 */
const MASK = '••••••••';

/** 脱敏配置：API Key / 系统访问令牌 / userId 仅以占位符形式下发，真实值只存在于服务端 */
function maskConfig(c: A6ApiConfig): A6ApiConfig {
  return {
    ...c,
    apiKey: c.apiKey ? MASK : '',
    accessToken: c.accessToken ? MASK : '',
    userId: c.userId ? MASK : '',
    hasApiKey: Boolean(c.apiKey),
    hasToken: Boolean(c.accessToken),
  };
}

function sendJson(res: any, status: number, body: any) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
    // 不设 access-control-allow-origin：仅允许同源调用，阻断跨站读取与 CSRF 预检
  });
  res.end(JSON.stringify(body));
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: any) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => resolve(data.trim()));
    req.on('error', reject);
  });
}

async function parseJsonBody(req: any): Promise<any> {
  const text = await readBody(req);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

// In-memory cache for merchant cards to avoid duplicate log calls
const merchantCardCache = new Map<string, { card: MerchantChannelInfo; at: number }>();
/** 卡片缓存有效期:过期后 /state 从最新日志重新推导,避免永远展示陈旧商户 */
const MERCHANT_CARD_TTL_MS = 15 * 60 * 1000;

/** 令牌解析结果缓存（避免 /state 每次重复调令牌列表） */
let tokenResolveCache: { tokenId: number; at: number } | null = null;
const TOKEN_RESOLVE_TTL_MS = 10 * 60 * 1000;

/**
 * 把配置的 API Key 解析为平台 token_id（固定/取消固定/禁用按令牌绑定）。
 * 解析链：内存缓存（TTL）→ 令牌列表按 key 精确匹配 → 唯一令牌兜底。
 * 返回 null 表示无法解析（调用方可再用「探测日志 token_id」兜底）。
 * 说明：tokenId 是派生数据，不再持久化；每次进程冷启动后首次固定/取消固定多一次令牌列表请求。
 */
async function resolveTokenId(config: A6ApiConfig): Promise<number | null> {
  if (tokenResolveCache && Date.now() - tokenResolveCache.at < TOKEN_RESOLVE_TTL_MS) {
    return tokenResolveCache.tokenId;
  }
  const token = config.accessToken || '';
  if (!config.userId || !token) return null;
  try {
    const tokens = await fetchTokens(config.userId, token);
    let tokenId: number | null = null;
    const key = (config.apiKey || '').trim();
    if (key) {
      const hit = tokens.find((t) => t.key && t.key === key);
      if (hit) tokenId = hit.id;
    }
    if (!tokenId && tokens.length === 1) tokenId = tokens[0].id;
    if (tokenId && tokenId > 0) {
      tokenResolveCache = { tokenId, at: Date.now() };
      return tokenId;
    }
  } catch (err) {
    console.warn('[dsh-a6api] resolveTokenId error:', err);
  }
  return null;
}

/** 取当前 Web 会话凭据（固定族接口鉴权，与市场价格波动同源） */
function webAuthOf(config: A6ApiConfig): { userId?: string; token?: string } {
  return { userId: config.userId || undefined, token: config.accessToken || undefined };
}

/** 从缓存取模型商家卡片（TTL 内有效） */
function cachedMerchantOf(modelName: string): MerchantChannelInfo | undefined {
  const entry = merchantCardCache.get(modelName.toLowerCase());
  return entry && Date.now() - entry.at < MERCHANT_CARD_TTL_MS ? entry.card : undefined;
}

/** 把固定记录叠加到模型卡片上（pin_here / pin_elsewhere / 禁用等展示字段） */
function overlayPinsOnModels(models: ModelCardData[], pins: MarketplacePin[], tokenId?: number | null): ModelCardData[] {
  const byModel = new Map<string, MarketplacePin[]>();
  for (const p of pins) {
    const key = (p.model_name || '').toLowerCase();
    if (!key) continue;
    const list = byModel.get(key);
    if (list) list.push(p);
    else byModel.set(key, [p]);
  }
  return models.map((m) => {
    const list = byModel.get(m.model_name.toLowerCase());
    if (!list || list.length === 0) return m;
    // 优先取当前令牌的固定记录；解析不出令牌时退而取任意一条（标注未匹配）
    const pick =
      (tokenId ? list.find((p) => Number(p.token_id) === tokenId) : undefined) || list[0];
    const cardChannel = m.merchant?.channel_id;
    const pinChannel = pick.channel_id;
    return {
      ...m,
      // Number() 归一化：官方接口可能返回字符串渠道 ID，严格相等会误判
      pinStatus: pinChannel
        ? cardChannel && Number(cardChannel) === Number(pinChannel)
          ? 'pin_here'
          : 'pin_elsewhere'
        : undefined,
      pinnedChannelId: pinChannel,
      pinnedSupplierName: pick.supplier_nickname || pick.supplier_name,
      pinnedFallback: pick.fallback_to_smart_routing,
      pinTokenMatched: Boolean(tokenId && Number(pick.token_id) === tokenId),
    };
  });
}

// ===== /state 与 /price-fluctuation 的上游短缓存 + 并发去重 =====
//
// 客户端每 60s（每个标签页一份定时器）轮询 /state，页面刷新/打开设置面板还会额外触发；
// 无状态实现下每来一个 /state 都完整重拉上游（余额/令牌模型/日志/固定记录），多标签页各自为政，
// 上游流量 = 标签页数 × 触发次数。这里把「最近一次组装结果」按凭据短缓存（TTL），
// 并把并发到达的请求合并到同一份在途构建：上游请求频率从「每 60s × 标签页数」降为「每 TTL 一次」。
// 数据变更类操作（保存配置/同步模型/探测/固定/取消固定/禁用/恢复）调用 stateMemo.invalidate()
// 提升代际并清空缓存；变更前已开始的在途构建完成时因代际不符不会写入缓存（仅服务本次请求）。

/**
 * 通用上游记忆：TTL 短缓存 + 同键在途构建合并 + 代际失效。
 * shouldCache 可选：对不应被缓存的结果（如鉴权失败态）返回 false，该结果仅服务本次请求。
 */
function createUpstreamMemo<T>(ttlMs: number, shouldCache?: (value: T) => boolean): {
  get(key: string, fetcher: () => Promise<T>): Promise<T>;
  invalidate(): void;
} {
  let cache = new Map<string, { data: T; at: number; epoch: number }>();
  const inflight = new Map<string, Promise<T>>();
  let epoch = 0;

  return {
    /**
     * 数据变更后调用：旧结果立即不可用。
     * 同时清空在途构建表：变更完成后才到达的请求不会「加入」变更前已开始的旧构建
     * （旧构建的写缓存仍有代际校验兜底），而是必然发起一次新构建拿到最新数据。
     */
    invalidate() {
      epoch += 1;
      cache.clear();
      inflight.clear();
    },

    async get(key, fetcher) {
      const hit = cache.get(key);
      if (hit && hit.epoch === epoch && Date.now() - hit.at < ttlMs) return hit.data;

      let pending = inflight.get(key);
      if (!pending) {
        const buildEpoch = epoch;
        const run = Promise.resolve()
          .then(fetcher)
          .then((data) => {
            // 构建期间发生数据变更 → 不写缓存；shouldCache 拒绝（如 authError）→ 不写缓存
            if (buildEpoch === epoch && (!shouldCache || shouldCache(data))) {
              cache.set(key, { data, at: Date.now(), epoch: buildEpoch });
            }
            return data;
          })
          .finally(() => {
            if (inflight.get(key) === run) inflight.delete(key);
          });
        inflight.set(key, run);
        pending = run;
      }
      return pending;
    },
  };
}

/** /state 全量响应缓存 TTL：略大于客户端 60s 轮询周期 → 单标签页稳态上游约每 2 分钟一次，多标签页共享 */
const stateMemo = createUpstreamMemo<A6ApiStateResponse>(120_000);
/** 价格波动计数缓存（同一上游价格通知接口的合并窗口）；鉴权失败态不缓存，保证失效信号即时可见 */
const priceCountsMemo = createUpstreamMemo<{
  pendingCount: number;
  unseenCount: number;
  totalCount: number;
  authError?: boolean;
}>(120_000, (counts) => !counts.authError);

/** 缓存键：按节点与凭据隔离；userId / apiKey / accessToken 任一变化 → 键变化 → 自动错过旧缓存 */
function stateCacheKeyOf(config: A6ApiConfig): string {
  const fingerprint = (s: string): string => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };
  return `${config.baseURL || ''}|${config.userId || ''}|${fingerprint(config.apiKey || '')}|${fingerprint(config.accessToken || '')}`;
}

/** /state 入口：短缓存优先；未命中则合并到在途构建（并发 /state 共享同一次上游拉取） */
async function getCachedStateResponse(config: A6ApiConfig, configAccess: ConfigAccess): Promise<A6ApiStateResponse> {
  return stateMemo.get(stateCacheKeyOf(config), () => buildStateResponse(config, configAccess));
}

/** 组装一次完整的 /state 响应（原 /state 路由内联逻辑原样提取：上游拉取 + 商户卡片推导 + 固定叠加） */
async function buildStateResponse(config: A6ApiConfig, configAccess: ConfigAccess): Promise<A6ApiStateResponse> {
  const token = config.accessToken || '';
  // 并行拉取互相独立的上游数据：余额 / 本地配置模型 / 令牌模型列表 / 最近日志 / 平台固定记录。
  // 原串行 5 次上游 RTT → 1 次，冷路径 3~10s → 约 1~2s（启动预热 + 60s 轮询依赖此提速）。
  // 错误语义与原先一致：余额/模型列表/日志失败则整体 500，固定记录失败降级为空。
  const [balance, dshConfiguredModels, modelIdsRaw, allLogs, pins] = await Promise.all([
    fetchBalance(config.baseURL, config.apiKey, config.userId, token),
    configAccess.getDshConfiguredModels(),
    config.apiKey ? fetchTokenModels(config.baseURL, config.apiKey) : Promise.resolve([] as string[]),
    fetchRecentLogs(config.userId, token, 100),
    config.userId && token
      ? fetchMarketplacePins(config.userId, token).catch(() => [] as MarketplacePin[])
      : Promise.resolve([] as MarketplacePin[]),
  ]);

  // Auto-persist discovered userId
  if (balance?.userId && String(balance.userId) !== config.userId) {
    // 账号变化：旧 tokenId 不再对应当前账号，作废并重置解析缓存
    tokenResolveCache = null;
    config.userId = String(balance.userId);
    await configAccess.writeConfig({ userId: config.userId });
  }

  // Fallback to DSH-configured / default models if token query returned empty
  let modelIds = modelIdsRaw;
  if (modelIds.length === 0) {
    modelIds = [
      ...new Set([
        ...dshConfiguredModels,
        'gpt-5.6-sol',
        'gpt-5.6-terra',
        'gpt-5.6-luna',
        'claude-fable-5',
        'claude-opus-5',
        'grok-4.6',
      ]),
    ];
  }

  // 一次拉取日志(接口实测上限 100 条),同一份数据用于: ①商户卡片预填充 ②路由快照时效映射 ③Account 页最近明细
  // 防御性排序：依赖“最新在前”，若网关排序变更仍能正确取首条
  allLogs.sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));

  // Match known merchant cards from recent logs if not yet in cache (with 10s total timeout to avoid /state hang)
  if (config.userId || token) {
    const missing = modelIds.filter((m) => {
      const entry = merchantCardCache.get(m.toLowerCase());
      return !entry || Date.now() - entry.at >= MERCHANT_CARD_TTL_MS;
    });
    if (missing.length > 0) {
      let found: Record<string, MerchantChannelInfo> = {};
      try {
        found = await Promise.race([
          getKnownMerchantsFromLogs(config.userId, token, missing, allLogs),
          new Promise<Record<string, MerchantChannelInfo>>((resolve) => setTimeout(() => resolve({}), 10000)),
        ]);
      } catch {
        found = {};
      }
      for (const [mName, card] of Object.entries(found)) {
        merchantCardCache.set(mName.toLowerCase(), { card, at: Date.now() });
      }
    }
  }

  // 路由快照时效: 每个模型最新一条「带 channel 的调用日志」时间 —— 与预填充卡片商户数据同一条规则(取最新命中商户路由的请求)
  const lastRoutedMap = new Map<string, number>();
  for (const log of allLogs) {
    const mName = log.model_name;
    const chId = Number(log.channel);
    const ts = Number(log.created_at) || 0;
    if (mName && chId > 0 && ts > 0 && !lastRoutedMap.has(mName.toLowerCase())) {
      lastRoutedMap.set(mName.toLowerCase(), ts);
    }
  }

  const dshSet = new Set(dshConfiguredModels);
  let models: ModelCardData[] = modelIds.map((mId) => {
    const meta = resolveModelMeta(mId);
    const cacheEntry = merchantCardCache.get(mId.toLowerCase());
    const cachedCard =
      cacheEntry && Date.now() - cacheEntry.at < MERCHANT_CARD_TTL_MS
        ? cacheEntry.card
        : undefined;
    const routedAt = lastRoutedMap.get(mId.toLowerCase());
    return {
      model_name: mId,
      brand: meta.brand,
      contextWindow: meta.contextWindow,
      maxTokens: meta.maxTokens,
      modalities: meta.modalities,
      hasReasoning: Boolean(meta.reasoningEfforts || meta.thinkingFormat),
      inDsh: dshSet.has(mId),
      merchant: cachedCard,
      probeStatus: cachedCard ? 'success' : 'idle',
      lastRoutedAt: routedAt,
      lastRoutedText: routedAt ? formatRelativeTime(routedAt) : undefined,
    };
  });

  // 固定状态叠加：pins 已在并行批次拉取（失败降级为空数组），让卡片状态跟随官网
  // （官网侧解除固定/涨价自动解除都会反映过来）
  const resolvedTokenId = pins.length > 0 ? await resolveTokenId(config) : null;
  models = overlayPinsOnModels(models, pins, resolvedTokenId);

  // 固定商家自动接管卡片：模型已固定到「非当前卡片」的商家时（当前令牌的固定），
  // 拉取该固定商家的渠道详情替换卡片，而不是提示「已固定到其他商家」。
  // 拉取失败/固定属于其他令牌时保持原卡片并回退到提示徽标。
  const rePointTargets = models
    .filter(
      (m) =>
        m.pinStatus === 'pin_elsewhere' &&
        m.pinTokenMatched === true &&
        m.pinnedChannelId &&
        m.pinnedChannelId > 0,
    )
    .map((m) => ({ modelName: m.model_name, channelId: m.pinnedChannelId as number }));
  if (rePointTargets.length > 0 && config.userId && token) {
    try {
      await Promise.race([
        (async () => {
          for (let i = 0; i < rePointTargets.length; i += 4) {
            const batch = rePointTargets.slice(i, i + 4);
            await Promise.all(
              batch.map(async ({ modelName, channelId }) => {
                try {
                  const pinnedCard = await fetchChannelDetails(
                    channelId,
                    config.userId,
                    token,
                    modelName,
                  );
                  // 校验返回卡片确实属于目标固定渠道，避免官方搜索返回其他条目污染缓存
                  if (pinnedCard && Number(pinnedCard.channel_id) === Number(channelId)) {
                    merchantCardCache.set(modelName.toLowerCase(), { card: pinnedCard, at: Date.now() });
                  }
                } catch {}
              }),
            );
          }
        })(),
        new Promise<void>((resolve) => setTimeout(() => resolve(), 10000)),
      ]);
    } catch {}
    // 用回填后的缓存重建卡片（固定商家即卡片商家 → 状态升级为 pin_here）
    models = models.map((m) => {
      if (m.pinStatus !== 'pin_elsewhere' || m.pinTokenMatched !== true) return m;
      const entry = merchantCardCache.get(m.model_name.toLowerCase());
      const card = entry && Date.now() - entry.at < MERCHANT_CARD_TTL_MS ? entry.card : undefined;
      if (card && Number(card.channel_id) === Number(m.pinnedChannelId)) {
        // 路由快照口径对齐：取「该商家的该模型」最近一次请求（卡片已切换到固定商家，时间不能再按任意商家取）
        const pinnedLog = allLogs.find(
          (l) =>
            l.model_name?.toLowerCase() === m.model_name.toLowerCase() &&
            Number(l.channel) === m.pinnedChannelId,
        );
        const pinnedAt = pinnedLog ? Number(pinnedLog.created_at) || 0 : undefined;
        return {
          ...m,
          merchant: card,
          pinStatus: 'pin_here' as const,
          probeStatus: 'success' as const,
          lastRoutedAt: pinnedAt,
          lastRoutedText: pinnedAt ? formatRelativeTime(pinnedAt) : undefined,
        };
      }
      return m;
    });
  }

  // Account 页明细保持原有窗口 (20 条)
  const recentLogs = allLogs.slice(0, 20);

  return {
    config: maskConfig(config),
    balance,
    models,
    dshConfiguredModels,
    recentLogs,
    pins,
  };
}

export function apply(ctx: any): void {
  // DSH 原生配置访问器：启动即触发旧配置文件自动迁移（幂等，首次读取会等待其完成）
  const configAccess = createConfigAccess(ctx);
  void configAccess.ensureMigrated();

  // Register Web API routes
  const webServer = ctx.webServer || (ctx.get ? ctx.get('webServer') : null);
  if (webServer && typeof webServer.register === 'function') {
    ctx.effect(() => {
      const unregister = webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: async (req: any, res: any) => {
          const url = new URL(req.url || '/', 'http://localhost');
          const pathname = url.pathname.replace(PREFIX, '') || '/';

          // CORS preflight：同源策略下无需放行跨源（移除 ACAO 后跨源预检天然失败）
          if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
          }

          // CSRF 面：同源 POST 一律要求 JSON Content-Type（跨站表单无法伪造该头）；
          // 客户端全部 POST 已带 application/json（含无 body 的 fetch-models/clear）
          if (req.method === 'POST' && !String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
            return sendJson(res, 415, { ok: false, error: 'Content-Type must be application/json' });
          }

          try {
            // GET /state — 短缓存 + 并发去重：TTL 内重复/并发请求共享同一份上游结果，
            // 多标签页轮询、页面刷新、面板打开与操作后的自动刷新不再各自重复拉取上游
            if (pathname === '/state' && (req.method === 'GET' || req.method === 'HEAD')) {
              const config = await configAccess.readConfig();
              const response = await getCachedStateResponse(config, configAccess);
              return sendJson(res, 200, { ok: true, data: response });
            }

            // POST /config
            if (pathname === '/config' && req.method === 'POST') {
              const body = await parseJsonBody(req);
              const current = await configAccess.readConfig();
              // 兼容旧客户端 bundle 仍会发送 sessionCookie：同一凭据，取任一非占位值
              const rawToken =
                body.accessToken !== undefined && body.accessToken !== MASK
                  ? body.accessToken
                  : body.sessionCookie !== undefined && body.sessionCookie !== MASK
                    ? body.sessionCookie
                    : current.accessToken;
              const newApiKey =
                body.apiKey !== undefined && body.apiKey !== MASK ? body.apiKey : current.apiKey;
              // API Key / 系统访问令牌（账号）/ userId 任一变更后，旧 tokenId 不再对应当前账号的令牌，
              // 清除并重置解析缓存，下次固定/取消固定时重新解析
              const credChanged =
                newApiKey !== current.apiKey ||
                rawToken !== (current.accessToken || '') ||
                (body.userId !== undefined && body.userId !== MASK && body.userId !== current.userId);
              if (credChanged) {
                tokenResolveCache = null;
              }

              const updated: A6ApiConfig = {
                baseURL: body.baseURL !== undefined ? body.baseURL : current.baseURL,
                apiKey: newApiKey,
                accessToken: rawToken,
                userId: body.userId !== undefined && body.userId !== MASK ? body.userId : current.userId,
                activeModels: Array.isArray(body.activeModels) ? body.activeModels : current.activeModels,
              };

              // Validate access token and auto-fetch balance & userId
              const balance = await fetchBalance(updated.baseURL, updated.apiKey, updated.userId, updated.accessToken);
              if (balance?.userId) {
                updated.userId = String(balance.userId);
              }

              // 凭据写入原生存储（credentials refs；空串 = 清除）；仅写有变化的字段
              const credWrites: Partial<Pick<A6ApiConfig, 'apiKey' | 'accessToken' | 'userId'>> = {};
              if (updated.apiKey !== current.apiKey) credWrites.apiKey = updated.apiKey;
              if ((updated.accessToken || '') !== (current.accessToken || '')) credWrites.accessToken = updated.accessToken;
              if ((updated.userId || '') !== (current.userId || '')) credWrites.userId = updated.userId;
              if (Object.keys(credWrites).length > 0) {
                await configAccess.writeConfig(credWrites);
              }

              // 同步 DSH settings（与旧行为一致：仅当有活动模型时）。
              // 注：零模型时无法持久化 baseURL——llm-pi-ai 对手写路由无合法的零模型表示
              // （models: [] 会被 assertServiceable 拒绝并毒化下次启动），a6api 块此时不存在，
              // 节点设置属惰性状态，待用户启用模型时随块一并落盘。
              if (updated.activeModels.length > 0) {
                await configAccess.syncModels(updated.baseURL, updated.activeModels);
              }
              // 配置（含凭据/节点/模型列表）已变更：作废 /state 短缓存，下次拉取立即重建；
              // 价格波动缓存同样按凭据键控，一并作废（避免旧计数/旧鉴权失败态残留）
              stateMemo.invalidate();
              priceCountsMemo.invalidate();
              return sendJson(res, 200, { ok: true, config: maskConfig(updated), balance });
            }

            // GET /balance
            if (pathname === '/balance' && (req.method === 'GET' || req.method === 'HEAD')) {
              const config = await configAccess.readConfig();
              const token = config.accessToken || '';
              const balance = await fetchBalance(config.baseURL, config.apiKey, config.userId, token);
              const recentLogs = await fetchRecentLogs(config.userId, token, 20);
              return sendJson(res, 200, { ok: true, balance, recentLogs });
            }

            // GET /logs
            if (pathname === '/logs' && (req.method === 'GET' || req.method === 'HEAD')) {
              const config = await configAccess.readConfig();
              const token = config.accessToken || '';
              const recentLogs = await fetchRecentLogs(config.userId, token, 30);
              return sendJson(res, 200, { ok: true, logs: recentLogs });
            }

            // POST /probe
            if (pathname === '/probe' && req.method === 'POST') {
              const body = await parseJsonBody(req);
              const config = await configAccess.readConfig();
              const token = config.accessToken || '';
              const modelName = body.modelName;

              if (modelName && modelName !== 'all') {
                const result = await probeSingleModel(config.baseURL, config.apiKey, config.userId, token, modelName);
                if (result.merchant) {
                  merchantCardCache.set(modelName.toLowerCase(), { card: result.merchant, at: Date.now() });
                }
                // 探测会写入路由日志/更新商户卡片：作废 /state 短缓存，让卡片即时反映新探测结果
                stateMemo.invalidate();
                return sendJson(res, 200, { ok: true, result });
              }

              // Probe all models in token
              let modelIds: string[] = body.modelNames;
              if (!Array.isArray(modelIds) || modelIds.length === 0) {
                modelIds = await fetchTokenModels(config.baseURL, config.apiKey);
              }
              if (modelIds.length === 0) {
                modelIds = await configAccess.getDshConfiguredModels();
              }

              const results = [];
              for (const m of modelIds) {
                const r = await probeSingleModel(config.baseURL, config.apiKey, config.userId, token, m);
                if (r.merchant) {
                  merchantCardCache.set(m.toLowerCase(), { card: r.merchant, at: Date.now() });
                }
                results.push(r);
              }

              // 全量探测同样会刷新日志与商户卡片
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, results });
            }

            // POST /sync-models
            if (pathname === '/sync-models' && req.method === 'POST') {
              const body = await parseJsonBody(req);
              await configAccess.ensureMigrated();
              const config = await configAccess.readConfig();
              const modelIds = Array.isArray(body.modelIds) ? body.modelIds : [];
              const baseURL = body.baseURL || config.baseURL;

              // 模型列表唯一真相源 = DSH settings.yaml 的 llm-pi-ai.providers.a6api.models
              await configAccess.syncModels(baseURL, modelIds);

              const dshConfiguredModels = await configAccess.getDshConfiguredModels();
              // DSH 已启用模型列表已变更（响应含 dshConfiguredModels/回退模型列表）
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, dshConfiguredModels });
            }

            // POST /pin — 把卡片当前商家固定为该模型的服务渠道（平台侧，按 API Key 令牌绑定）
            if (pathname === '/pin' && req.method === 'POST') {
              const body = await parseJsonBody(req);
              const config = await configAccess.readConfig();
              const modelName = String(body.modelName || '').trim();
              if (!modelName) return sendJson(res, 400, { ok: false, error: '缺少模型名称' });
              const { userId, token } = webAuthOf(config);
              if (!userId || !token) {
                return sendJson(res, 400, { ok: false, error: '需在「基础配置」填写系统访问令牌/会话后才能固定商家' });
              }
              // 固定的是卡片当前展示的商家（无商家选择器）
              let card = cachedMerchantOf(modelName);
              // token_id 解析链：配置缓存 → 令牌列表 → 探测日志（1-token）
              let tokenId = await resolveTokenId(config);
              // 卡片缺失或令牌未解析时，用一次探测同时回填两者（探测请求本身会写路由日志）
              if ((!card || !tokenId) && config.apiKey) {
                let probedOk = false;
                try {
                  const probe = await probeSingleModel(config.baseURL, config.apiKey, userId, token, modelName);
                  probedOk = Boolean(probe && probe.success);
                  if (!tokenId && probe.tokenId && Number(probe.tokenId) > 0) tokenId = Number(probe.tokenId);
                  if (!card && probe.merchant) {
                    card = probe.merchant;
                    merchantCardCache.set(modelName.toLowerCase(), { card, at: Date.now() });
                  }
                } catch {}
                // 探测已写路由日志/可能更新商户卡片：即使主操作随后失败也先失效，避免旧卡片被缓存长期服务
                if (probedOk) stateMemo.invalidate();
              }
              if (!card) {
                return sendJson(res, 400, { ok: false, error: '该模型暂无商家数据，请先「探测商家」' });
              }
              if (!tokenId) {
                return sendJson(res, 400, { ok: false, error: '无法自动解析 API Key 对应的令牌 ID，请检查系统访问令牌是否有效，或到官网「令牌」页手动固定' });
              }
              if (!card.channel_id) {
                return sendJson(res, 400, { ok: false, error: '商家卡片缺少渠道 ID，请重新探测' });
              }
              const pinResult = await marketplacePin(userId, token, {
                token_id: tokenId,
                channel_id: card.channel_id,
                model_name: modelName,
                // 平台默认兜底：渠道异常时自动切换智能优选（不暴露 UI 开关）
                fallback_to_smart_routing: true,
              });
              if (!pinResult.ok) {
                return sendJson(res, 400, { ok: false, error: pinResult.message || '固定失败' });
              }
              // 更新内存令牌解析缓存（tokenId 为派生数据，不持久化）
              tokenResolveCache = { tokenId, at: Date.now() };
              merchantCardCache.set(modelName.toLowerCase(), {
                card: { ...card, is_pinned: true, pin_status: 'pin_here' },
                at: Date.now(),
              });
              const pinList = await fetchMarketplacePins(userId, token);
              // 固定状态已变更：作废 /state 短缓存，随后的 fetchState 立即重建（含新的 pin 叠加）
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, message: `已固定 ${modelName} 至商户 #${card.channel_id}`, pins: pinList, tokenId });
            }

            // POST /unpin — 取消该模型的固定（取消后重新探测即可路由到新商家）
            if (pathname === '/unpin' && req.method === 'POST') {
              const body = await parseJsonBody(req);
              const config = await configAccess.readConfig();
              const modelName = String(body.modelName || '').trim();
              if (!modelName) return sendJson(res, 400, { ok: false, error: '缺少模型名称' });
              const { userId, token } = webAuthOf(config);
              if (!userId || !token) {
                return sendJson(res, 400, { ok: false, error: '需在「基础配置」填写系统访问令牌/会话后才能取消固定' });
              }
              const tokenId = await resolveTokenId(config);
              if (!tokenId) {
                return sendJson(res, 400, { ok: false, error: '无法解析 API Key 对应的令牌 ID，请检查系统访问令牌是否有效' });
              }
              const unpinResult = await marketplaceUnpin(userId, token, { token_id: tokenId, model_name: modelName });
              if (!unpinResult.ok) {
                return sendJson(res, 400, { ok: false, error: unpinResult.message || '取消固定失败' });
              }
              const card = cachedMerchantOf(modelName);
              if (card) {
                merchantCardCache.set(modelName.toLowerCase(), {
                  card: { ...card, is_pinned: false, pin_status: undefined },
                  at: Date.now(),
                });
              }
              const pinList = await fetchMarketplacePins(userId, token);
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, message: `已取消固定 ${modelName}`, pins: pinList, tokenId });
            }

            // POST /disable — 禁用卡片当前商家对该模型的服务（平台侧，按 渠道×模型）
            if (pathname === '/disable' && req.method === 'POST') {
              const body = await parseJsonBody(req);
              const config = await configAccess.readConfig();
              const modelName = String(body.modelName || '').trim();
              if (!modelName) return sendJson(res, 400, { ok: false, error: '缺少模型名称' });
              let card = cachedMerchantOf(modelName);
              // 卡片缓存过期时用一次探测回填（与 /pin 一致，避免「按钮可用但接口 400」）
              if (!card && config.apiKey) {
                let probedOk = false;
                try {
                  const probe = await probeSingleModel(config.baseURL, config.apiKey, config.userId, config.accessToken || '', modelName);
                  probedOk = Boolean(probe && probe.success);
                  if (probe.merchant) {
                    card = probe.merchant;
                    merchantCardCache.set(modelName.toLowerCase(), { card, at: Date.now() });
                  }
                } catch {}
                // 探测已写路由日志/可能更新商户卡片：即使主操作随后失败也先失效
                if (probedOk) stateMemo.invalidate();
              }
              if (!card || !card.channel_id) {
                return sendJson(res, 400, { ok: false, error: '该模型暂无商家数据，请先「探测商家」' });
              }
              const { userId, token } = webAuthOf(config);
              if (!userId || !token) {
                return sendJson(res, 400, { ok: false, error: '需在「基础配置」填写系统访问令牌/会话后才能禁用商家' });
              }
              const disableResult = await marketplaceDisableChannel(userId, token, card.channel_id, modelName);
              if (!disableResult.ok) {
                return sendJson(res, 400, { ok: false, error: disableResult.message || '禁用失败' });
              }
              merchantCardCache.set(modelName.toLowerCase(), {
                card: { ...card, user_channel_disabled: true },
                at: Date.now(),
              });
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, message: `已禁用商户 #${card.channel_id} 对该模型的服务` });
            }

            // POST /restore — 恢复被禁用的商家
            if (pathname === '/restore' && req.method === 'POST') {
              const body = await parseJsonBody(req);
              const config = await configAccess.readConfig();
              const modelName = String(body.modelName || '').trim();
              if (!modelName) return sendJson(res, 400, { ok: false, error: '缺少模型名称' });
              let card = cachedMerchantOf(modelName);
              if (!card && config.apiKey) {
                let probedOk = false;
                try {
                  const probe = await probeSingleModel(config.baseURL, config.apiKey, config.userId, config.accessToken || '', modelName);
                  probedOk = Boolean(probe && probe.success);
                  if (probe.merchant) {
                    card = probe.merchant;
                    merchantCardCache.set(modelName.toLowerCase(), { card, at: Date.now() });
                  }
                } catch {}
                // 探测已写路由日志/可能更新商户卡片：即使主操作随后失败也先失效
                if (probedOk) stateMemo.invalidate();
              }
              if (!card || !card.channel_id) {
                return sendJson(res, 400, { ok: false, error: '该模型暂无商家数据，请先「探测商家」' });
              }
              const { userId, token } = webAuthOf(config);
              if (!userId || !token) {
                return sendJson(res, 400, { ok: false, error: '需在「基础配置」填写系统访问令牌/会话后才能恢复商家' });
              }
              const restoreResult = await marketplaceRestoreChannel(userId, token, card.channel_id, modelName);
              if (!restoreResult.ok) {
                return sendJson(res, 400, { ok: false, error: restoreResult.message || '恢复失败' });
              }
              merchantCardCache.set(modelName.toLowerCase(), {
                card: { ...card, user_channel_disabled: false },
                at: Date.now(),
              });
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, message: `已恢复商户 #${card.channel_id} 对该模型的服务` });
            }

            // GET /price-fluctuation — 轻量价格波动条数（待处理 n），仅回传计数；
            // 服务端短缓存 + 并发去重：多标签页/轮询共享同一份价格通知上游结果
            if (pathname === '/price-fluctuation' && (req.method === 'GET' || req.method === 'HEAD')) {
              const config = await configAccess.readConfig();
              const token = config.accessToken || '';
              if (!token || !config.userId) {
                return sendJson(res, 200, { ok: true, data: { pendingCount: 0, unseenCount: 0, totalCount: 0, hasAuth: false, authError: false, updatedAt: Date.now() } });
              }
              const counts = await priceCountsMemo.get(stateCacheKeyOf(config), async () => {
                const result = await fetchPriceFluctuation(config.userId, token);
                // 仅缓存计数（notices 体量大且无跨请求复用价值，不下发也不缓存）
                const { notices, ...rest } = result as any;
                return rest as any;
              });
              // 401/403 时 authError=true，客户端可区分“未配置”与“失效”
              const hasAuth = !counts.authError;
              return sendJson(res, 200, { ok: true, data: { pendingCount: counts.pendingCount, unseenCount: counts.unseenCount, totalCount: counts.totalCount, hasAuth, authError: Boolean(counts.authError), updatedAt: Date.now() } });
            }

            // GET /pins — 轻量固定记录（客户端 60s 轮询，让卡片状态跟随官网侧解除/新增固定）
            if (pathname === '/pins' && (req.method === 'GET' || req.method === 'HEAD')) {
              const config = await configAccess.readConfig();
              const { userId, token } = webAuthOf(config);
              if (!userId || !token) {
                return sendJson(res, 200, { ok: true, pins: [] });
              }
              try {
                const pins = await fetchMarketplacePins(userId, token);
                return sendJson(res, 200, { ok: true, pins });
              } catch (err: any) {
                console.warn('[dsh-a6api] GET /pins error:', err);
                return sendJson(res, 200, { ok: true, pins: [] });
              }
            }

            // GET /catalog — 模型目录全量（运行时 JSON，字段 = settings.yaml 原生模型字段 + brand）
            if (pathname === '/catalog' && (req.method === 'GET' || req.method === 'HEAD')) {
              return sendJson(res, 200, { ok: true, catalog: getCatalog() });
            }

            // POST /catalog/clear — 清空模型目录（重新拉取/填充前使用；settings.yaml 已启用条目不受影响）
            if (pathname === '/catalog/clear' && req.method === 'POST') {
              await clearCatalog();
              // 目录品牌/参数参与 /state 卡片元数据（resolveModelMeta）：作废短缓存
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true });
            }

            // POST /catalog/fetch-models — 从 A6API 市场翻页拉取全部模型 ID（含品牌），合并入目录。
            // 仅新增缺失条目/补品牌/补默认推理档位，不覆盖任何已存在条目的参数。
            if (pathname === '/catalog/fetch-models' && req.method === 'POST') {
              const config = await configAccess.readConfig();
              const { userId, token } = webAuthOf(config);
              let result;
              try {
                result = await fetchMarketplaceModels(userId, token);
              } catch (err: any) {
                // 未配置系统访问令牌等鉴权类错误 → 400 + 引导文案（与 /pin 风格一致）
                return sendJson(res, 400, { ok: false, error: err?.message || '获取市场模型失败' });
              }
              const models = result.models;
              const before = new Set(getCatalog().map((e) => e.id.toLowerCase()));
              let added = 0;
              for (const m of models) {
                if (!before.has(m.id.toLowerCase())) added++;
              }
              // reasoningEfforts 默认 = DSH 全部思考档位（upsert 只补缺失字段，已有自定义不受影响）
              await upsertCatalogEntries(
                models.map((m) => ({ id: m.id, brand: m.brand, reasoningEfforts: m.reasoningEfforts })),
              );
              // 目录品牌参与 /state 卡片元数据：作废短缓存
              stateMemo.invalidate();
              return sendJson(res, 200, {
                ok: true,
                total: models.length,
                added,
                failedPages: result.failedPages,
              });
            }

            // POST /catalog/query-openrouter — 对全部（或指定）目录模型查 OpenRouter 并填充参数。
            // 能查到的填充 contextWindow/maxTokens/input/name；查不到的保持原字段不变。
            if (pathname === '/catalog/query-openrouter' && req.method === 'POST') {
              const body = await parseJsonBody(req);
              const catalog = getCatalog();
              const modelIds =
                Array.isArray(body.modelIds) && body.modelIds.length > 0
                  ? body.modelIds.map((s: any) => String(s))
                  : catalog.map((e) => e.id);
              if (modelIds.length === 0) {
                return sendJson(res, 400, { ok: false, error: '目录为空，请先「从 A6API 获取市场模型」' });
              }
              const result = await queryOpenRouter(modelIds);
              // contextWindow/maxTokens 等目录字段参与 /state 卡片元数据：作废短缓存
              stateMemo.invalidate();
              return sendJson(res, 200, {
                ok: true,
                updated: result.updated.length,
                notFound: result.notFound,
              });
            }

            // POST /catalog/update — 修改单个目录条目参数（name/contextWindow/maxTokens/input/reasoningEfforts）。
            // 若该模型已在 DSH 启用，立即重写 settings.yaml 对应条目使参数即时生效。
            if (pathname === '/catalog/update' && req.method === 'POST') {
              const body = await parseJsonBody(req);
              const id = String(body.id || '').trim();
              if (!id) return sendJson(res, 400, { ok: false, error: '缺少模型 ID' });
              const patch: Record<string, any> = {};
              // null = 删除该字段（清空语义）；undefined = 不修改
              if (body.name !== undefined) {
                if (body.name === null) {
                  patch.name = null;
                } else if (typeof body.name !== 'string') {
                  return sendJson(res, 400, { ok: false, error: 'name 必须是字符串' });
                } else {
                  const name = body.name.trim();
                  patch.name = name || null;
                }
              }
              for (const key of ['contextWindow', 'maxTokens'] as const) {
                if (body[key] === null) {
                  patch[key] = null;
                } else if (body[key] !== undefined) {
                  const n = Number(body[key]);
                  if (!Number.isInteger(n) || n < 1) {
                    return sendJson(res, 400, { ok: false, error: `${key} 必须是正整数` });
                  }
                  patch[key] = n;
                }
              }
              if (body.input !== undefined) {
                if (body.input === null) {
                  patch.input = null;
                } else if (!Array.isArray(body.input)) {
                  return sendJson(res, 400, { ok: false, error: 'input 必须是数组' });
                } else {
                  const mods = body.input.filter((m: any) => m === 'text' || m === 'image');
                  // 空数组 = 清空该字段（null 语义删除）
                  patch.input = mods.length > 0 ? mods : null;
                }
              }
              if (body.reasoningEfforts !== undefined) {
                if (body.reasoningEfforts === null) {
                  patch.reasoningEfforts = null; // 删除该字段
                } else {
                  // DSH 语义严格校验：键 ∈ THINKING_LEVELS、值非空（仅 off 可 null）、非空字典、至少一个非 off 档位
                  const v = validateReasoningEfforts(body.reasoningEfforts);
                  if (!v.ok) return sendJson(res, 400, { ok: false, error: v.error });
                  patch.reasoningEfforts = v.value;
                }
              }
              const entry = await updateCatalogEntry(id, patch);
              if (!entry) return sendJson(res, 404, { ok: false, error: '目录中不存在该模型' });

              // 已启用模型：立即重写 settings.yaml 对应条目（参数即时生效，单一数据流：目录 → settings.yaml）
              try {
                const config = await configAccess.readConfig();
                const dshModels = await configAccess.getDshConfiguredModels();
                if (dshModels.some((m) => m.toLowerCase() === entry.id.toLowerCase()) && config.activeModels.length > 0) {
                  await configAccess.syncModels(config.baseURL, config.activeModels);
                }
              } catch (err: any) {
                console.warn('[dsh-a6api] catalog update: resync settings failed:', err?.message || err);
              }
              // 目录条目已变更（卡片元数据/已启用模型参数均受影响）：作废短缓存
              stateMemo.invalidate();
              return sendJson(res, 200, { ok: true, entry });
            }

            return sendJson(res, 404, { ok: false, error: 'Not found' });
          } catch (err: any) {
            console.error('[dsh-a6api] API error:', err);
            return sendJson(res, 500, { ok: false, error: err?.message || String(err) });
          }
        },
      });

      return () => {
        if (typeof unregister === 'function') unregister();
      };
    }, 'dsh-a6api: web API router');
  }
}
