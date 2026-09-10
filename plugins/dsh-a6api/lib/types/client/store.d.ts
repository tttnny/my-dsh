import type { A6ApiConfig, BalanceInfo, CatalogModelEntry, ModelCardData, ApiRoutingLogItem, PriceFluctuationState, MarketplacePin } from '../types.js';
export interface StoreState {
    loading: boolean;
    config: A6ApiConfig;
    balance: BalanceInfo | null;
    models: ModelCardData[];
    dshConfiguredModels: string[];
    recentLogs: ApiRoutingLogItem[];
    probingModelNames: Set<string>;
    /** 正在执行固定/取消固定/禁用/恢复操作的模型 */
    actionBusyModels: Set<string>;
    /** 全量探测是否进行中（store 驱动 UI：进度、取消按钮、重入防护） */
    probeAllActive: boolean;
    /** 全量探测总模型数（入队时快照） */
    probeAllTotal: number;
    /** 全量探测已完成数（与 state.models 解耦，/state 刷新不丢） */
    probeAllDoneCount: number;
    /** 平台固定记录（卡片状态跟随官网） */
    pins: MarketplacePin[];
    /** 模型目录（运行时 JSON，字段 = settings.yaml 原生模型字段 + brand） */
    catalog: CatalogModelEntry[];
    /** 目录操作进行中（获取市场模型 / OpenRouter 查询） */
    catalogBusy: 'fetch' | 'query' | null;
    error: string | null;
    priceFluctuation: PriceFluctuationState;
}
type Listener = () => void;
declare class A6ApiStore {
    private state;
    private listeners;
    private autoRefreshTimer;
    /** 启动预热已触发（幂等）：插件随 DSH 启动即后台拉一次完整状态 */
    private warmedUp;
    /** 全量探测取消标志：置位后不再从队列取新任务，在途探测正常完成 */
    private probeCancelled;
    /** 本轮全量探测的模型名快照（null = 未在运行），用于进度计数与 /state 刷新后重挂状态 */
    private probeAllSnapshot;
    /** 本轮已完成探测的模型（幂等集合，驱动 probeAllDoneCount） */
    private probeAllDone;
    /** 入队前各模型的 probeError 暂存，取消时恢复历史错误提示 */
    private probeQueuedPrevError;
    constructor();
    subscribe(listener: Listener): () => void;
    private notify;
    getState(): StoreState;
    fetchState(force?: boolean): Promise<void>;
    saveConfig(config: Partial<A6ApiConfig>): Promise<boolean>;
    refreshBalance(): Promise<void>;
    fetchCatalog(): Promise<void>;
    /** 从 A6API 市场拉取全部模型 ID 并入目录（仅新增/补品牌，不动已有参数） */
    fetchMarketModels(): Promise<{
        ok: boolean;
        total?: number;
        added?: number;
        failedPages?: number;
        error?: string;
    }>;
    /** 对全部（或指定）目录模型查 OpenRouter 并填充参数 */
    queryOpenRouter(modelIds?: string[]): Promise<{
        ok: boolean;
        updated?: number;
        notFound?: string[];
        error?: string;
    }>;
    /** 修改目录条目参数；已启用模型由服务端即时重写 settings.yaml */
    updateCatalogEntry(id: string, patch: Partial<CatalogModelEntry>): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** 清空模型目录（随后可重新从 A6API 拉取 / OpenRouter 填充） */
    clearCatalog(): Promise<{
        ok: boolean;
        error?: string;
    }>;
    fetchPriceFluctuation(): Promise<void>;
    /** 单次探测请求（不修改状态，供限流重试循环复用） */
    private probeOnce;
    private isRateLimitedOutcome;
    /** 把一次探测结果应用到卡片（按结果类型走原有映射逻辑） */
    private applyProbeResult;
    probeModel(modelName: string): Promise<void>;
    probeAll(): Promise<void>;
    /** 把仍处于 queued 的模型复位为 idle 并恢复入队前的错误文案 */
    private restoreQueuedModels;
    /** 取消全量探测：立即复位排队模型，不再取新任务，已在途的探测正常完成并回填卡片 */
    cancelProbeAll(): void;
    toggleDshModel(modelName: string): Promise<void>;
    /**
     * 固定 / 取消固定 / 禁用 / 恢复 的统一执行器。
     * 成功后会刷新 /state（服务端会把平台固定记录叠加回卡片，跟随官网状态）。
     */
    private runMarketplaceAction;
    /** 固定卡片当前商家到该模型 */
    pinModel(modelName: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** 取消该模型的固定（上游 pr195 起需要固定所属渠道 ID，随请求透传，服务端另做卡片缓存兜底） */
    unpinModel(modelName: string, channelId?: number): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** 禁用卡片当前商家对该模型的服务 */
    disableModel(modelName: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** 恢复被禁用的商家 */
    restoreModel(modelName: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /**
     * 启动预热：插件随 DSH 启动即后台拉取一次完整状态。
     * 侧边栏按钮在应用启动时就已挂载，预热让用户打开浮层/设置页时数据早已就绪 → 秒开无 spinner。
     * 未配置凭据时 /state 返回默认回退数据，无害；后续保存配置/轮询会持续刷新。
     * 目录一并预热（模型目录 tab 徽标/首屏不等待首次进入）。
     */
    warmUp(): void;
    private startAutoRefresh;
    stopAutoRefresh(): void;
    initPricePolling(): void;
}
export declare const store: A6ApiStore;
export {};
