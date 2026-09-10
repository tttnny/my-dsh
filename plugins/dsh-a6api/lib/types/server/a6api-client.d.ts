import type { BalanceInfo, MerchantChannelInfo, ApiRoutingLogItem, MarketplacePin, A6ApiTokenItem } from '../types.js';
/** Normalize Base URL removing trailing slashes */
export declare function cleanBaseUrl(url: string): string;
/** Format relative time */
export declare function formatRelativeTime(timestampSec: number): string;
/** Format CNY Price */
export declare function formatCnyPrice(micros: number, exchangeRate?: number): string;
/**
 * 混合价估算（¥ / 1亿 tokens，供模型卡片徽标展示，换算与口径同官网标注脚本）：
 * 输入类 token 占 99.65%，按 24h 实测缓存命中率分为「命中 × 缓存读价」与「未命中 × 输入价」，
 * 输出固定占 0.35% × 输出价。单价按 micros/1e6 × 汇率折算为 ¥/1M；
 * 三类单价全为 0（按次计费等无 token 单价）时返回 undefined，前端不展示。
 */
export declare function computeBlendedPrice100m(inMicros: number, cacheReadMicros: number, outMicros: number, cacheHitRatePct: number, exchangeRate: number): number | undefined;
export declare function buildWebHeaders(userId?: string, accessToken?: string): Record<string, string>;
/** Fetch User Balance (Real Account Balance Only) */
export declare function fetchBalance(baseURL: string, apiKey: string, userId?: string, accessToken?: string): Promise<BalanceInfo | null>;
/** Fetch Token Allowed Models */
export declare function fetchTokenModels(baseURL: string, apiKey: string): Promise<string[]>;
/** Fetch Recent User Routing Logs */
export declare function fetchRecentLogs(userId?: string, accessToken?: string, limit?: number): Promise<ApiRoutingLogItem[]>;
/** Fetch Channel Card details from A6API Marketplace */
export declare function fetchChannelDetails(channelId: number, userId?: string, accessToken?: string, targetModelName?: string, logSnapshot?: any): Promise<MerchantChannelInfo | null>;
/** 轻量拉取价格波动条数（仅 pending/unseen） */
export declare function fetchPriceFluctuation(userId?: string, accessToken?: string): Promise<{
    pendingCount: number;
    unseenCount: number;
    totalCount: number;
    notices?: any[];
    authError?: boolean;
}>;
interface MarketplaceActionResult {
    ok: boolean;
    message?: string;
    data?: any;
}
/** GET /api/marketplace/pins — 当前账号全部固定记录（卡片状态跟随官网的真相源） */
export declare function fetchMarketplacePins(userId?: string, accessToken?: string): Promise<MarketplacePin[]>;
/** GET /api/token/?p=1&size=100 — 令牌列表（用于把 API Key 解析为 token_id） */
export declare function fetchTokens(userId?: string, accessToken?: string): Promise<A6ApiTokenItem[]>;
/** POST /api/marketplace/pin — 把某模型的流量固定到指定渠道（绑定令牌） */
export declare function marketplacePin(userId: string | undefined, accessToken: string | undefined, payload: {
    token_id: number;
    channel_id: number;
    model_name: string;
    fallback_to_smart_routing: boolean;
}): Promise<MarketplaceActionResult>;
/** POST /api/marketplace/unpin — 取消某模型的固定
 *  上游 pr195（2026-09-08）起 payload 必须携带 channel_id，缺字段一律 400 invalid_request */
export declare function marketplaceUnpin(userId: string | undefined, accessToken: string | undefined, payload: {
    token_id: number;
    channel_id: number;
    model_name: string;
}): Promise<MarketplaceActionResult>;
/** POST /api/marketplace/channels/:id/disable?model= — 禁用某渠道对该模型的服务 */
export declare function marketplaceDisableChannel(userId: string | undefined, accessToken: string | undefined, channelId: number, model: string): Promise<MarketplaceActionResult>;
/** POST /api/marketplace/channels/:id/restore?model= — 恢复被禁用的渠道 */
export declare function marketplaceRestoreChannel(userId: string | undefined, accessToken: string | undefined, channelId: number, model: string): Promise<MarketplaceActionResult>;
export {};
