import type { ApiRoutingLogItem, MerchantChannelInfo } from '../types.js';
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
/** Probe a single model by sending a 1-token prompt and querying logs */
export declare function probeSingleModel(baseURL: string, apiKey: string, userId?: string, accessToken?: string, modelName?: string): Promise<ProbeResult>;
/** Pre-populate merchant cards from recent logs without triggering live probe */
export declare function getKnownMerchantsFromLogs(userId?: string, accessToken?: string, modelNames?: string[], logs?: ApiRoutingLogItem[]): Promise<Record<string, MerchantChannelInfo>>;
