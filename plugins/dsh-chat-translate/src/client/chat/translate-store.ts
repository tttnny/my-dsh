import { requestTranslateReply } from '../translate/api.ts';
import type { ReplyBlockResult, ReplyFailReason } from '../../server/types.ts';
import { estimateTokens, REPLY_MAX_INPUT_TOKENS } from '../../server/pipeline/blocks.ts';

/** 一行正文的按块翻译结果，与请求的 texts 数组按下标对齐。 */
export interface BlockOutcome {
  /** 模型产出的中文（Markdown 源文本）；失败时等于原文。 */
  translated: string;
  /** 该块是否翻译成功。 */
  ok: boolean;
  /** 仅 ok=false 时出现；失败一律同一条红实线，reason 只选悬停文案的标签。 */
  reason?: ReplyFailReason;
  /** 仅 ok=false 时可能出现：服务端给出的技术细节，拼在标签后进悬停文案。 */
  detail?: string;
}

/**
 * 一行正文的翻译状态。outcomes 与 texts 同下标，null = 该块所在批尚未落定：
 * 每批返回就地填入并通知，长回答按阅读顺序逐段出中文，不憋到最后一批。
 * 全部批落定后 status 转 settled——落定即终态：这里没有任何自动补跑，
 * 失败块的救活只由用户的点击发起（ensure 的 manual 参数）。
 */
export interface RowState {
  status: 'pending' | 'settled';
  texts: readonly string[];
  outcomes: readonly (BlockOutcome | null)[];
}

/** 送译一行正文的取数面：默认走宿主路由，测试注入假实现。 */
export type ReplyFetcher = (texts: string[]) => Promise<ReplyBlockResult[]>;

/** 同时在池的行数上限：LRU 淘汰最久未读的整行；行文本本身仍归宿主会话持有。 */
export const MAX_TRANSLATED_ROWS = 200;

/**
 * 一次 HTTP 请求装载的估算 token 上限：与宿主的打包输入上限同值同源
 * （blocks.ts 的 REPLY_MAX_INPUT_TOKENS）——客户端按宿主的打包窗口切批，
 * 每批在宿主侧通常正好落进一次模型调用。
 */
export const REQUEST_TOKEN_BUDGET = REPLY_MAX_INPUT_TOKENS;

/** 按出现顺序把整行文本切成不超预算的批；单块超预算时独自成批。 */
export function chunkTexts(texts: readonly string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let tokens = 0;
  for (const text of texts) {
    const cost = Math.max(estimateTokens(text), 1);
    if (current.length > 0 && tokens + cost > REQUEST_TOKEN_BUDGET) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(text);
    tokens += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * 助手行的翻译池：按行键存「该行全部正文块的翻译结果」。
 *
 * 行键由渲染层给出（会话内锚点序号），文本数组参与一致性判断：同键不同文本
 * 视为行换了一代内容，整行重新请求——这保证重渲染或会话切换后不会把旧译文
 * 配到新文本上。请求幂等：同键同文本且仍在途的 ensure 不发第二个请求；已落定
 * 的行同样短路——**除非** manual=true，那是用户点了某个红线块发起的手动补跑，
 * 无限次、不设额度。手动补跑时上一代已成功的块保持挂线（结果从上一代种下，
 * 服务端磁盘缓存让它们秒回），只有尚无译文的块显示在途脉动。在途期间换代，
 * 迟到的旧代结果直接丢弃。
 *
 * 本模块不依赖 React：渲染层用 useSyncExternalStore 订阅版本，再读 getState。
 */
export class ChatTranslateStore {
  private rows = new Map<string, RowState>();
  private listeners = new Set<() => void>();
  private version = 0;
  private fetch: ReplyFetcher;

  constructor(fetcher: ReplyFetcher) {
    this.fetch = fetcher;
  }

  /** 单调版本号：任何状态变化（含单批落定）都前进一位，供渲染层判等重渲。 */
  getVersion(): number {
    return this.version;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 读一行状态，并把该行刷成最近使用。 */
  getState(rowKey: string): RowState | undefined {
    const state = this.rows.get(rowKey);
    if (state === undefined) return undefined;
    // Refresh LRU order (re-insert at the end).
    this.rows.delete(rowKey);
    this.rows.set(rowKey, state);
    return state;
  }

  /**
   * 确保该行按当前文本被翻译。
   * @param manual - 用户点击失败块发起的补跑：已落定的同代行只有这条路会重发。
   * @returns 是否发出了新的请求。
   */
  ensure(rowKey: string, texts: readonly string[], manual = false): boolean {
    const current = this.rows.get(rowKey);
    let seed: (BlockOutcome | null)[] | null = null;
    if (current !== undefined && sameTexts(current.texts, texts)) {
      // 在途：再点是空操作，脉动本身就是「已在跑」的答复。
      if (current.status === 'pending') return false;
      if (!manual) return false;
      // 手动补跑：上一代已成功的块当场种回，重发期间译文不闪。
      seed = current.outcomes.map((outcome) => (outcome !== null && outcome.ok ? { ...outcome } : null));
    }
    const snapshot = [...texts];
    const seedOutcomes = seed ?? snapshot.map(() => null);
    const next: RowState = {
      status: 'pending',
      texts: snapshot,
      outcomes: seedOutcomes,
    };
    this.rows.delete(rowKey);
    this.rows.set(rowKey, next);
    this.prune();
    this.bump();
    if (snapshot.length > 0) void this.run(rowKey, snapshot, seedOutcomes);
    return true;
  }

  private async run(
    rowKey: string,
    texts: readonly string[],
    initial: readonly (BlockOutcome | null)[]
  ): Promise<void> {
    // 去重靠 ensure 的同代短路；换代后的并发在途允许存在——迟到的旧代结果
    // 由每批落定处的快照核对丢弃。工作数组取私有副本：登记在池里的那份
    // 只经 set+notify 整批换代，不存在「就地写入却还没通知」的中间可见态。
    const outcomes: (BlockOutcome | null)[] = initial.map((o) => o);
    let offset = 0;
    for (const batch of chunkTexts(texts)) {
      let results: ReplyBlockResult[] = [];
      try {
        results = await this.fetch(batch);
      } catch {
        // 取数面的异常与失败结果同义：该批保持原文。api 层自身已兜底，这里
        // 防的是 fetcher 实现抛错的形态——异常说不出败因，按传输失败报。
        results = [];
      }
      for (let i = 0; i < batch.length; i++) {
        const result = results[i];
        if (result !== undefined && result.ok && result.translated && result.translated.trim()) {
          outcomes[offset + i] = { translated: result.translated, ok: true };
        } else {
          const detail = typeof result?.detail === 'string' && result.detail !== '' ? result.detail : undefined;
          outcomes[offset + i] = {
            translated: batch[i] ?? texts[offset + i] ?? '',
            ok: false,
            reason: result?.reason ?? 'transport',
            ...(detail === undefined ? {} : { detail }),
          };
        }
      }
      offset += batch.length;
      // 逐批可见：行仍是这一代才写入，写完通知——先回的段先出中文。
      const live = this.rows.get(rowKey);
      if (live === undefined || live.status !== 'pending' || !sameTexts(live.texts, texts)) return;
      this.rows.set(rowKey, {
        status: 'pending',
        texts: live.texts,
        outcomes: [...outcomes],
      });
      this.bump();
    }
    const state = this.rows.get(rowKey);
    if (state?.status === 'pending' && sameTexts(state.texts, texts)) {
      this.rows.set(rowKey, {
        status: 'settled',
        texts: state.texts,
        outcomes: [...outcomes],
      });
      this.bump();
    }
  }

  private prune(): void {
    while (this.rows.size > MAX_TRANSLATED_ROWS) {
      const oldest = this.rows.keys().next().value;
      if (oldest === undefined) break;
      this.rows.delete(oldest);
    }
  }

  private bump(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // 一个订阅者的异常不影响其他订阅者。
      }
    }
  }
}

/** 文本清单是否同代（逐位相等）：池的幂等判据，渲染层拿它核对登记行属于当前文本。 */
export function sameTexts(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** 供测试注入取数面创建独立池。 */
export function createTranslateStore(fetcher: ReplyFetcher): ChatTranslateStore {
  return new ChatTranslateStore(fetcher);
}

/** 正文翻译池：客户端半边唯一的按行译文登记处。 */
export const chatTranslate = createTranslateStore(requestTranslateReply);
