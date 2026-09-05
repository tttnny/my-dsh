import type {
  A6ApiConfig,
  A6ApiStateResponse,
  BalanceInfo,
  CatalogModelEntry,
  ModelCardData,
  ApiRoutingLogItem,
  PriceFluctuationState,
  MarketplacePin,
} from '../types.js';

function formatRelativeNow(tsSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - tsSec;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  return `${Math.floor(diff / 86400)} 天前`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 限流特征：网关 429 / Too Many Requests / rate limit（Key 级并发限制时出现；\b429\b 避免误伤上游错误码如 42901） */
const RATE_LIMIT_RE = /\b429\b|Too Many Requests|rate\s*limit/i;

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

class A6ApiStore {
  private state: StoreState = {
    loading: true,
    config: {
      baseURL: 'https://api.a6api.com',
      apiKey: '',
      userId: '',
      activeModels: [],
    },
    balance: null,
    models: [],
    dshConfiguredModels: [],
    recentLogs: [],
    probingModelNames: new Set(),
    actionBusyModels: new Set(),
    probeAllActive: false,
    probeAllTotal: 0,
    probeAllDoneCount: 0,
    pins: [],
    catalog: [],
    catalogBusy: null,
    error: null,
    priceFluctuation: { pendingCount: 0, unseenCount: 0, totalCount: 0, updatedAt: null } as any,
  };

  private listeners: Set<Listener> = new Set();
  private autoRefreshTimer: any = null;
  /** 启动预热已触发（幂等）：插件随 DSH 启动即后台拉一次完整状态 */
  private warmedUp = false;
  /** 全量探测取消标志：置位后不再从队列取新任务，在途探测正常完成 */
  private probeCancelled = false;
  /** 本轮全量探测的模型名快照（null = 未在运行），用于进度计数与 /state 刷新后重挂状态 */
  private probeAllSnapshot: string[] | null = null;
  /** 本轮已完成探测的模型（幂等集合，驱动 probeAllDoneCount） */
  private probeAllDone = new Set<string>();
  /** 入队前各模型的 probeError 暂存，取消时恢复历史错误提示 */
  private probeQueuedPrevError = new Map<string, string | undefined>();

  constructor() {
    this.startAutoRefresh();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) {
      try {
        l();
      } catch (err) {
        console.error('[dsh-a6api] listener error:', err);
      }
    }
  }

  public getState(): StoreState {
    return this.state;
  }

  public async fetchState(force = false): Promise<void> {
    this.state.loading = true;
    this.notify();
    try {
      // force=true（仅手动「刷新列表」）：服务端绕过 120s 短缓存立即重建返回最新上游数据；
      // 后台轮询/预热/操作后刷新不带 force，继续吃短缓存以省上游流量
      const res = await fetch('/api/dsh-a6api/state' + (force ? '?force=1' : ''));
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          const data: A6ApiStateResponse = json.data;
          this.state.config = data.config;
          this.state.balance = data.balance;
          this.state.models = data.models;
          // 全量探测进行中：/state 只产 idle/success，重挂 queued/probing，
          // 避免「刷新列表 / 固定操作 / 轮询发现 pins 变化」等 fetchState 打断排队与进度计数
          const snapshot = this.probeAllSnapshot;
          if (this.state.probeAllActive && snapshot) {
            this.state.models = this.state.models.map((m) => {
              if (this.state.probingModelNames.has(m.model_name)) {
                return { ...m, probeStatus: 'probing' as const };
              }
              if (snapshot.includes(m.model_name) && !this.probeAllDone.has(m.model_name)) {
                return { ...m, probeStatus: 'queued' as const, probeError: undefined };
              }
              return m;
            });
          }
          this.state.dshConfiguredModels = data.dshConfiguredModels;
          if (Array.isArray(data.pins)) {
            this.state.pins = data.pins;
          }
          if (data.recentLogs) {
            this.state.recentLogs = data.recentLogs;
          }
          this.state.error = null;
          // 若已配 token，顺带刷新价格波动（防重复：10s 内已拉过则跳过）
          if (this.state.config?.hasToken) {
            const last = (this.state.priceFluctuation as any)?.updatedAt;
            if (!last || Date.now() - last > 10000) {
              this.fetchPriceFluctuation().catch(() => {});
            }
          }
        }
      }
    } catch (err: any) {
      this.state.error = err?.message || String(err);
    } finally {
      this.state.loading = false;
      this.notify();
    }
  }

  public async saveConfig(config: Partial<A6ApiConfig>): Promise<boolean> {
    try {
      const res = await fetch('/api/dsh-a6api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        await this.fetchState();
        return true;
      }
    } catch (err: any) {
      this.state.error = err?.message || String(err);
      this.notify();
    }
    return false;
  }

  public async refreshBalance(): Promise<void> {
    try {
      const res = await fetch('/api/dsh-a6api/balance');
      if (res.ok) {
        const json = await res.json();
        if (json?.balance) {
          this.state.balance = json.balance;
        }
        if (json?.recentLogs) {
          this.state.recentLogs = json.recentLogs;
        }
        this.notify();
      }
    } catch {}
  }

  // ===== 模型目录 =====

  public async fetchCatalog(): Promise<void> {
    try {
      const res = await fetch('/api/dsh-a6api/catalog');
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.catalog)) {
          this.state.catalog = json.catalog;
          this.notify();
        }
      }
    } catch {}
  }

  /** 从 A6API 市场拉取全部模型 ID 并入目录（仅新增/补品牌，不动已有参数） */
  public async fetchMarketModels(): Promise<{ ok: boolean; total?: number; added?: number; failedPages?: number; error?: string }> {
    if (this.state.catalogBusy) return { ok: false, error: '目录操作进行中' };
    this.state.catalogBusy = 'fetch';
    this.notify();
    try {
      const res = await fetch('/api/dsh-a6api/catalog/fetch-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        await this.fetchCatalog();
        return { ok: true, total: json.total, added: json.added, failedPages: json.failedPages || 0 };
      }
      const errText = json?.error || `HTTP ${res.status}`;
      this.state.error = errText;
      return { ok: false, error: errText };
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.state.error = msg;
      return { ok: false, error: msg };
    } finally {
      this.state.catalogBusy = null;
      this.notify();
    }
  }

  /** 对全部（或指定）目录模型查 OpenRouter 并填充参数 */
  public async queryOpenRouter(modelIds?: string[]): Promise<{ ok: boolean; updated?: number; notFound?: string[]; error?: string }> {
    if (this.state.catalogBusy) return { ok: false, error: '目录操作进行中' };
    this.state.catalogBusy = 'query';
    this.notify();
    try {
      const res = await fetch('/api/dsh-a6api/catalog/query-openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelIds }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        await this.fetchCatalog();
        return { ok: true, updated: json.updated, notFound: json.notFound || [] };
      }
      const errText = json?.error || `HTTP ${res.status}`;
      this.state.error = errText;
      return { ok: false, error: errText };
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.state.error = msg;
      return { ok: false, error: msg };
    } finally {
      this.state.catalogBusy = null;
      this.notify();
    }
  }

  /** 修改目录条目参数；已启用模型由服务端即时重写 settings.yaml */
  public async updateCatalogEntry(
    id: string,
    patch: Partial<CatalogModelEntry>,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch('/api/dsh-a6api/catalog/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        await this.fetchCatalog();
        return { ok: true };
      }
      const errText = json?.error || `HTTP ${res.status}`;
      this.state.error = errText;
      return { ok: false, error: errText };
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.state.error = msg;
      return { ok: false, error: msg };
    }
  }

  /** 清空模型目录（随后可重新从 A6API 拉取 / OpenRouter 填充） */
  public async clearCatalog(): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch('/api/dsh-a6api/catalog/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        await this.fetchCatalog();
        return { ok: true };
      }
      const errText = json?.error || `HTTP ${res.status}`;
      this.state.error = errText;
      return { ok: false, error: errText };
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.state.error = msg;
      return { ok: false, error: msg };
    }
  }

  public async fetchPriceFluctuation(): Promise<void> {
    try {
      const res = await fetch('/api/dsh-a6api/price-fluctuation');
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          const d = json.data;
          const hasAuth = d.hasAuth !== false && !d.authError;
          // 服务端已区分“未配置/失效”与“有待处理 0”，客户端尊重 hasAuth
          if (!hasAuth) {
            // 失效或未配置时，显示 -- 而非 0（由 UI 层判断），但仍更新时间避免频繁重试
            const next = { pendingCount: 0, unseenCount: 0, totalCount: 0, updatedAt: Date.now(), hasAuth: false, authError: Boolean(d.authError) } as any;
            if (JSON.stringify(next) !== JSON.stringify(this.state.priceFluctuation)) {
              this.state.priceFluctuation = next;
              this.notify();
            }
            return;
          }
          const pending = Number(d.pendingCount ?? 0);
          const unseen = Number(d.unseenCount ?? 0);
          const total = Number(d.totalCount ?? 0);
          const next = { pendingCount: pending, unseenCount: unseen, totalCount: total, updatedAt: Date.now(), hasAuth: true, authError: false } as any;
          if (pending !== (this.state.priceFluctuation as any).pendingCount || unseen !== (this.state.priceFluctuation as any).unseenCount || (this.state.priceFluctuation as any).hasAuth === false || (this.state.priceFluctuation as any).updatedAt === null) {
            this.state.priceFluctuation = next;
            this.notify();
          } else if ((this.state.priceFluctuation as any).updatedAt === null) {
            this.state.priceFluctuation = next;
            this.notify();
          }
        }
      }
    } catch {}
  }

  /** 单次探测请求（不修改状态，供限流重试循环复用） */
  private async probeOnce(
    modelName: string,
  ): Promise<{ kind: 'ok'; json: any } | { kind: 'http'; status: number } | { kind: 'network'; error: string }> {
    try {
      const res = await fetch('/api/dsh-a6api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName }),
      });
      if (res.ok) {
        const json = await res.json();
        return { kind: 'ok', json };
      }
      return { kind: 'http', status: res.status };
    } catch (err: any) {
      return { kind: 'network', error: err?.message || String(err) };
    }
  }

  private isRateLimitedOutcome(
    o: { kind: 'ok'; json: any } | { kind: 'http'; status: number } | { kind: 'network'; error: string },
  ): boolean {
    return (
      (o.kind === 'ok' &&
        Boolean(o.json?.result?.error && RATE_LIMIT_RE.test(String(o.json.result.error)))) ||
      (o.kind === 'http' && o.status === 429)
    );
  }

  /** 把一次探测结果应用到卡片（按结果类型走原有映射逻辑） */
  private applyProbeResult(
    modelName: string,
    outcome: { kind: 'ok'; json: any } | { kind: 'http'; status: number } | { kind: 'network'; error: string },
  ): void {
    const patch = (p: Partial<ModelCardData>) => {
      this.state.models = this.state.models.map((m) => (m.model_name === modelName ? { ...m, ...p } : m));
      this.notify();
    };
    if (outcome.kind === 'ok') {
      const json = outcome.json;
      if (json?.result?.merchant) {
        patch({
          merchant: json.result.merchant,
          probeStatus: 'success',
          probeLatencyMs: json.result.durationMs,
          probeError: undefined,
          lastProbedAt: Date.now(),
          // 探测请求本身会写路由日志,乐观更新路由快照时效,下次 /state 以日志为准
          lastRoutedAt: Math.floor(Date.now() / 1000),
          lastRoutedText: formatRelativeNow(Math.floor(Date.now() / 1000)),
        });
      } else if (json?.result?.error) {
        patch({
          merchant: undefined,
          probeStatus: 'error',
          probeError: json.result.error,
          lastProbedAt: Date.now(),
        });
      } else {
        patch({
          probeStatus: json?.result?.success ? 'success' : 'idle',
          probeLatencyMs: json?.result?.durationMs,
          probeError: json?.result?.success
            ? '探测成功,但未捕获商户信息(需配置系统访问令牌)'
            : undefined,
          lastProbedAt: Date.now(),
        });
      }
    } else if (outcome.kind === 'http') {
      patch({
        merchant: undefined,
        probeStatus: 'error',
        probeError: `HTTP ${outcome.status}`,
        lastProbedAt: Date.now(),
      });
    } else {
      patch({
        merchant: undefined,
        probeStatus: 'error',
        probeError: outcome.error,
        lastProbedAt: Date.now(),
      });
    }
  }

  public async probeModel(modelName: string): Promise<void> {
    this.state.probingModelNames.add(modelName);
    this.state.models = this.state.models.map((m) =>
      m.model_name === modelName ? { ...m, probeStatus: 'probing' as const } : m,
    );
    this.notify();

    try {
      let outcome = await this.probeOnce(modelName);
      // Key 级限流(429)自动重试：退避 0.8s / 2s，共 3 次；重试期间卡片保持「探测中」
      if (this.isRateLimitedOutcome(outcome)) {
        for (let attempt = 2; attempt <= 3; attempt++) {
          await sleep(attempt === 2 ? 800 : 2000);
          outcome = await this.probeOnce(modelName);
          if (!this.isRateLimitedOutcome(outcome)) break;
        }
        if (this.isRateLimitedOutcome(outcome)) {
          this.state.models = this.state.models.map((m) =>
            m.model_name === modelName
              ? {
                  ...m,
                  merchant: undefined,
                  probeStatus: 'error' as const,
                  probeError: '请求被限流(429),已自动重试 3 次仍失败,请稍后再试',
                  lastProbedAt: Date.now(),
                }
              : m,
          );
          return;
        }
      }
      this.applyProbeResult(modelName, outcome);
    } finally {
      this.state.probingModelNames.delete(modelName);
      // 计入全量探测进度（仅限本轮快照内的模型；幂等集合，重复探测不重复计数）
      if (this.probeAllSnapshot?.includes(modelName)) {
        this.probeAllDone.add(modelName);
        this.state.probeAllDoneCount = this.probeAllDone.size;
      }
      this.notify();
      this.refreshBalance().catch(() => {});
    }
  }

  public async probeAll(): Promise<void> {
    // 重入防护：运行中直接忽略（store 状态驱动 UI，正常入口已不可点，防御其他调用路径）
    if (this.state.probeAllActive) return;
    const names = this.state.models.map((m) => m.model_name);
    if (names.length === 0) return;
    this.probeCancelled = false;
    this.probeAllSnapshot = names;
    this.probeAllDone.clear();
    // 暂存入队前的探测错误文案，取消时恢复（避免排队期间清空历史错误提示）
    this.probeQueuedPrevError = new Map(this.state.models.map((m) => [m.model_name, m.probeError]));
    this.state.probeAllActive = true;
    this.state.probeAllTotal = names.length;
    this.state.probeAllDoneCount = 0;
    // 全量入队：等待中的模型按钮显示「等待探测」并禁用
    this.state.models = this.state.models.map((m) => ({
      ...m,
      probeStatus: 'queued' as const,
      probeError: undefined,
    }));
    this.notify();
    // 浏览器同源 HTTP/1.1 连接池约 6 路，再高也到不了上游；8 仅保证槽位不被浏览器排队饿死
    const CONCURRENCY = Math.min(8, names.length);
    let idx = 0;
    const worker = async () => {
      while (idx < names.length && !this.probeCancelled) {
        const name = names[idx++];
        // 取消后立即重开时，上一次运行的在途探测仍占用该模型：跳过避免并发双探，
        // 其结果仍会回填卡片并计入本轮进度
        if (this.state.probingModelNames.has(name)) continue;
        await this.probeModel(name);
      }
    };
    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    } finally {
      this.state.probeAllActive = false;
      this.probeAllSnapshot = null;
      this.probeAllDone.clear();
      this.state.probeAllDoneCount = 0;
      // 取消时剩余排队模型复位为可手动探测（并恢复历史错误文案）；正常跑完时队列已空，为 no-op
      this.restoreQueuedModels();
      this.notify();
    }
  }

  /** 把仍处于 queued 的模型复位为 idle 并恢复入队前的错误文案 */
  private restoreQueuedModels(): void {
    const prev = this.probeQueuedPrevError;
    this.state.models = this.state.models.map((m) =>
      m.probeStatus === 'queued'
        ? { ...m, probeStatus: 'idle' as const, probeError: prev.get(m.model_name) }
        : m,
    );
    this.probeQueuedPrevError = new Map();
  }

  /** 取消全量探测：立即复位排队模型，不再取新任务，已在途的探测正常完成并回填卡片 */
  public cancelProbeAll(): void {
    if (!this.state.probeAllActive) return;
    this.probeCancelled = true;
    this.state.probeAllActive = false;
    this.probeAllSnapshot = null;
    this.probeAllDone.clear();
    this.state.probeAllDoneCount = 0;
    this.restoreQueuedModels();
    this.notify();
  }

  public async toggleDshModel(modelName: string): Promise<void> {
    const currentSet = new Set(this.state.dshConfiguredModels);
    if (currentSet.has(modelName)) {
      currentSet.delete(modelName);
    } else {
      currentSet.add(modelName);
    }
    const newModels = [...currentSet];
    try {
      const res = await fetch('/api/dsh-a6api/sync-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelIds: newModels }),
      });
      if (res.ok) {
        const json = await res.json();
        this.state.dshConfiguredModels = json.dshConfiguredModels || newModels;
        const dshSet = new Set(this.state.dshConfiguredModels);
        this.state.models = this.state.models.map((m) => ({
          ...m,
          inDsh: dshSet.has(m.model_name),
        }));
        this.notify();
      }
    } catch (err: any) {
      this.state.error = err?.message || String(err);
      this.notify();
    }
  }

  /**
   * 固定 / 取消固定 / 禁用 / 恢复 的统一执行器。
   * 成功后会刷新 /state（服务端会把平台固定记录叠加回卡片，跟随官网状态）。
   */
  private async runMarketplaceAction(
    modelName: string,
    endpoint: string,
    busySet: Set<string>,
  ): Promise<{ ok: boolean; error?: string }> {
    if (busySet.has(modelName)) return { ok: false, error: '操作进行中' };
    busySet.add(modelName);
    this.notify();
    try {
      const res = await fetch(`/api/dsh-a6api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        if (Array.isArray(json.pins)) {
          this.state.pins = json.pins;
        }
        await this.fetchState();
        return { ok: true };
      }
      const errText = json?.error || `HTTP ${res.status}`;
      this.state.error = errText;
      this.notify();
      return { ok: false, error: errText };
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.state.error = msg;
      this.notify();
      return { ok: false, error: msg };
    } finally {
      busySet.delete(modelName);
      this.notify();
    }
  }

  /** 固定卡片当前商家到该模型 */
  public pinModel(modelName: string): Promise<{ ok: boolean; error?: string }> {
    return this.runMarketplaceAction(modelName, 'pin', this.state.actionBusyModels);
  }

  /** 取消该模型的固定 */
  public unpinModel(modelName: string): Promise<{ ok: boolean; error?: string }> {
    return this.runMarketplaceAction(modelName, 'unpin', this.state.actionBusyModels);
  }

  /** 禁用卡片当前商家对该模型的服务 */
  public disableModel(modelName: string): Promise<{ ok: boolean; error?: string }> {
    return this.runMarketplaceAction(modelName, 'disable', this.state.actionBusyModels);
  }

  /** 恢复被禁用的商家 */
  public restoreModel(modelName: string): Promise<{ ok: boolean; error?: string }> {
    return this.runMarketplaceAction(modelName, 'restore', this.state.actionBusyModels);
  }

  /**
   * 启动预热：插件随 DSH 启动即后台拉取一次完整状态。
   * 侧边栏按钮在应用启动时就已挂载，预热让用户打开浮层/设置页时数据早已就绪 → 秒开无 spinner。
   * 未配置凭据时 /state 返回默认回退数据，无害；后续保存配置/轮询会持续刷新。
   * 目录一并预热（模型目录 tab 徽标/首屏不等待首次进入）。
   */
  public warmUp(): void {
    if (this.warmedUp) return;
    this.warmedUp = true;
    this.fetchState().catch(() => {});
    this.fetchCatalog().catch(() => {});
  }

  private startAutoRefresh() {
    if (this.autoRefreshTimer) clearInterval(this.autoRefreshTimer);
    // 60s 后台整体刷新：/state 单次拉取即含余额/模型/日志/固定记录（服务端已并行化），
    // 取代原先分立的余额/价格波动/固定记录三个轮询。价格波动与固定记录由 fetchState
    // 内部的去重逻辑按需触发；未配置 API Key 时跳过，避免无意义请求。
    this.autoRefreshTimer = setInterval(() => {
      if (this.state.config?.hasApiKey) {
        this.fetchState().catch(() => {});
      }
    }, 60000);
  }

  public stopAutoRefresh() {
    if (this.autoRefreshTimer) { clearInterval(this.autoRefreshTimer); this.autoRefreshTimer = null; }
  }

  public initPricePolling() {
    if (this.autoRefreshTimer) return;
    this.startAutoRefresh();
    if (this.state.config?.hasToken) {
      this.fetchPriceFluctuation().catch(() => {});
    }
  }
}

export const store = new A6ApiStore();
