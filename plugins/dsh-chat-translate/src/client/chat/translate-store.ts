import { requestTranslateReply } from '../translate/api.ts';
import type { ReplyBlockResult } from '../../server/types.ts';
import { estimateTokens, REPLY_MAX_INPUT_TOKENS } from '../../server/pipeline/blocks.ts';

/**
 * 一块翻译失败的类别：`channel` = 通道伤（超时、断流、空返回），重试有意义；
 * `not-configured` = 通道还没配齐或设置不对，重试不会变，得先去改设置。
 */
export type BlockFailKind = 'channel' | 'not-configured';

/** 一行正文的按块翻译结果，与请求的 texts 数组按下标对齐。 */
export interface BlockOutcome {
  /** 模型产出的中文（Markdown 源文本）；失败时等于原文。 */
  translated: string;
  /** 该块是否翻译成功。 */
  ok: boolean;
  /** 仅 ok=false 时可能出现：服务端给出的技术细节，拼在标签后进悬停文案。 */
  detail?: string;
  /** 仅 ok=false 时可能出现：失败类别，决定悬停与读屏报哪一类原因。 */
  reason?: BlockFailKind;
}

/**
 * 一行正文的翻译状态。outcomes 与 texts 同下标，null = 该块还没有任何结果：
 * 它还没写定（流式期间正在长，判据见 {@link ChatTranslateStore.ensure} 的
 * `frozen`），或者本代还没有轮到它。每批返回就地填入并通知，长回答按阅读顺序
 * 逐段出中文，不憋到最后一批。
 *
 * settledThrough = 前多少个下标已经写定（正文只往后追加，写定的块内容再也
 * 不会变）。已经落定的块不会因为后面又有新块写定而重发——**失败块是唯一的
 * 例外**，它由用户手点 ↻ 重发（`retries`），池里没有任何自动补跑。
 */
export interface RowState {
  status: 'pending' | 'settled';
  texts: readonly string[];
  outcomes: readonly (BlockOutcome | null)[];
  /** 已经写定的块数：这些下标的内容不会再变。 */
  settledThrough: number;
  /** 这一轮在途是用户手点的补跑所涉及的下标；补跑期间这些块的 ↻ 转圈。 */
  retrying: readonly number[];
}

/** 送译一行正文的取数面：默认走宿主路由，测试注入假实现。 */
export type ReplyFetcher = (texts: string[]) => Promise<ReplyBlockResult[]>;

/** {@link ChatTranslateStore.ensure} 的调用面。 */
export interface EnsureOptions {
  /**
   * 前多少个块已经写定（内容冻结、可以送译）。省略 = 全部写定，也就是落定行
   * 的整行送译。流式期间调用方传当前冻结数：正文只往后追加，所以这个数只增
   * 不减；正在长的尾块（下标 >= frozen）一个字都不发。
   */
  frozen?: number;
  /**
   * 用户点 ↻ 发起的补跑：只重发这些下标里**当前没有成功译文**的块，其余块
   * （成功的、内容已经命中的）原地不动。省略 = 自动首跑，不重发任何已落定的块。
   */
  retries?: readonly number[];
}

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

/** 文本清单是否同代（逐位相等）：池的幂等判据，渲染层拿它核对登记行属于当前文本。 */
export function sameTexts(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** 前缀关系：`next` 是不是由 `prev` 往后追加而来（正文流式的正常形态）。 */
export function isAppendOnly(prev: readonly string[], next: readonly string[]): boolean {
  if (next.length < prev.length) return false;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

/**
 * 助手行的翻译池：按行键登记「该行正文块的翻译结果」，并按原文内容查已送达的译文。
 *
 * 行键由渲染层给出（会话内锚点序号），文本数组参与一致性判断。判定分两件：
 *
 * - **换代 = 整行重新登记**：文本清单与前一代不是「逐位相等」也不是「往后追加」
 *   （正文被整份重写，例如上游模型重试），旧结果整份作废。
 * - **写定的块不回炉**：流式期间调用方逐次给出已经写定的块数，池只对「本次新
 *   写定、而且内容还没有命中」的块发请求。正文只往后追加，先写定的块内容再
 *   也不会变，重发它只是白烧一次通道。
 *
 * **内容寻址**：同一段原文在别处出现过（同一行的另一块、另一行、另一个会话），
 * 直接取已送达的译文，不再打通道。手动补跑（`retries`）同样只重发没有成功
 * 译文的块，所以点一次 ↻ 不会把整行重新翻译一遍。
 *
 * **落定即终态**：池里没有任何自动补跑——滚动、重挂载、后面又有新块写定都不会
 * 重发已经落定的块；救活只由 `retries` 发起，无限次、不设额度。
 *
 * 本模块不依赖 React：渲染层用 useSyncExternalStore 订阅版本，再读 getState。
 */
export class ChatTranslateStore {
  private rows = new Map<string, RowState>();
  private listeners = new Set<() => void>();
  private version = 0;
  private fetch: ReplyFetcher;
  /** 已送达的译文，按原文内容寻址：跨行、跨代复用同一段文本的结果。 */
  private translated = new Map<string, string>();
  /**
   * 每行**在飞的块**：下标 → 那一轮请求认领的原文。流式期间新代接手它们的结果位
   * 而不重发，等结果回来按当时登记的原文落账（文本没变才算同一块）。
   */
  private pending = new Map<string, { texts: Map<number, string> }>();

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
   * @param rowKey - 行键（会话内锚点）。
   * @param texts - 该行正文的原文清单，与渲染用的下标对齐。
   * @param options - `frozen`（写定到第几块）与 `retries`（手点补跑哪些块）。
   * @returns 是否发出了新的请求。
   */
  ensure(rowKey: string, texts: readonly string[], options: EnsureOptions = {}): boolean {
    const next = [...texts];
    const frozen = clampFrozen(options.frozen ?? next.length, next.length);
    const retries = normalizeRetries(options.retries);

    const current = this.rows.get(rowKey);
    const settledThrough = current?.settledThrough ?? 0;
    let seed: (BlockOutcome | null)[] | null = null;
    let previousFrozen = 0;

    const sameGeneration = current !== undefined && sameTexts(current.texts, next);
    if (current !== undefined && (sameGeneration || isAppendOnly(current.texts, next))) {
      // 在途：再点是空操作——↻ 此刻正转着圈，本身就是「已在跑」的答复。
      if (sameGeneration && current.status === 'pending') return false;
      if (retries.length === 0 && frozen <= settledThrough && sameGeneration) return false;
      seed = current.outcomes.map((outcome) => (outcome === null ? null : { ...outcome }));
      previousFrozen = Math.min(current.settledThrough, next.length);
    }

    const inflight = this.pending.get(rowKey);
    const plan = this.planFor(next, frozen, retries, previousFrozen, seed, current?.texts, inflight);

    // 本轮新发的请求记进在飞账本（下标 + 它们认领的那一份文本）。还在飞的那些
    // 块由上一轮继续负责，新代只接手它们的结果位，不重发。
    if (plan.indexes.length > 0) {
      const entry = inflight ?? { texts: new Map<number, string>() };
      for (let i = 0; i < plan.indexes.length; i++) {
        entry.texts.set(plan.indexes[i]!, next[plan.indexes[i]!] ?? '');
      }
      this.pending.set(rowKey, entry);
    }

    const work = plan.indexes.length > 0;
    this.rows.delete(rowKey);
    this.rows.set(rowKey, {
      status: work || (inflight !== undefined && inflight.texts.size > 0) ? 'pending' : 'settled',
      texts: next,
      outcomes: plan.outcomes,
      settledThrough: settleThrough(settledThrough, frozen),
      retrying: work ? plan.retrying : [],
    });
    this.prune();
    this.bump();

    if (!work) return false;
    void this.run(rowKey, next, frozen, plan.indexes, plan.sending);
    return true;
  }

  /**
   * 建本轮的取数计划：哪些下标要送、送什么文本、结果位怎么排。
   *
   * 只对**已经写定、而且内容还没命中**的块发请求。自动首跑里先前写定的下标一律
   * 跳过（它们要么已经成功，要么在等手点补跑）；`retries` 只对点名的块解禁一次。
   */
  private planFor(
    texts: readonly string[],
    frozen: number,
    retries: readonly number[],
    previousFrozen: number,
    seed: readonly (BlockOutcome | null)[] | null,
    seedTexts: readonly string[] | undefined,
    inflight: { texts: Map<number, string> } | undefined
  ): { indexes: number[]; sending: string[]; outcomes: (BlockOutcome | null)[]; retrying: number[] } {
    const outcomes: (BlockOutcome | null)[] = texts.map((_, index) => seed?.[index] ?? null);
    const retrySet = new Set(retries);
    const indexes: number[] = [];
    const sending: string[] = [];

    for (let index = 0; index < texts.length; index++) {
      const text = texts[index] ?? '';
      if (index >= frozen) {
        // 还在长的块：一个字都不发，也不给任何结果位。
        outcomes[index] = null;
        continue;
      }
      const cached = this.translated.get(cacheKey(text));
      if (cached !== undefined) {
        outcomes[index] = { translated: cached, ok: true };
        continue;
      }
      if (inflight?.texts.get(index) === text) {
        // 这一块正在飞：结果位留给它，不重发（内容一字未变才认）。
        continue;
      }
      if (retrySet.has(index)) {
        // 补跑点名的块：**保留**上一次的失败结果——↻ 因此原位转圈（同一个节点、
        // 同一个读屏标签，键盘焦点不掉），等回来的结果覆盖它。
        if (outcomes[index] === null || outcomes[index] === undefined) {
          outcomes[index] = { translated: text, ok: false };
        }
        indexes.push(index);
        sending.push(text);
        continue;
      }
      const kept = seed?.[index];
      if (kept !== null && kept !== undefined && seedTexts?.[index] === text) {
        // 上一代这个位置的文本与此刻一字不差：结果留着，等新块的那一轮结束后
        // 由内容池统一兜底（下一轮 ensure 命中缓存）。留着的意义是换代那一帧
        // 不闪——已经看到的中文不会因为后面又有新块写定而退回原文。
        outcomes[index] = { ...kept };
        continue;
      }
      if (index < previousFrozen) continue;
      if (outcomes[index] === null) {
        indexes.push(index);
        sending.push(text);
        outcomes[index] = null;
      }
    }
    return { indexes, sending, outcomes, retrying: indexes };
  }

  private async run(
    rowKey: string,
    body: readonly string[],
    frozen: number,
    indexes: readonly number[],
    sending: readonly string[]
  ): Promise<void> {
    const collected = new Map<number, BlockOutcome>();
    // 本轮实际送出去的原文：只有仍然在飞的块才允许落账，所以结果回来时按「当时
    // 登记的原文」认领，而不是按调用方递进来的那一份文本数组。
    const sent = new Map<number, string>();
    for (let i = 0; i < indexes.length; i++) sent.set(indexes[i]!, sending[i] ?? '');

    let cursor = 0;
    for (const batch of chunkTexts(sending)) {
      let results: ReplyBlockResult[] = [];
      try {
        results = await this.fetch(batch);
      } catch {
        // 取数面的异常与失败结果同义：该批保持原文。api 层自身已兜底，这里
        // 防的是 fetcher 实现抛错的形态——异常说不出细节，悬停只报「翻译失败」。
        results = [];
      }
      for (let i = 0; i < batch.length; i++) {
        const index = indexes[cursor + i];
        if (index === undefined) break;
        const text = batch[i] ?? '';
        const result = results[i];
        if (result !== undefined && result.ok && result.translated && result.translated.trim()) {
          collected.set(index, { translated: result.translated, ok: true });
          // 成功才进内容池：失败不进，点 ↻ 因此会真重发，别的行也捡不到坏结果。
          this.translated.set(cacheKey(text), result.translated);
        } else {
          const detail = typeof result?.detail === 'string' && result.detail !== '' ? result.detail : undefined;
          collected.set(index, {
            translated: body[index] ?? text,
            ok: false,
            ...(detail === undefined ? {} : { detail }),
            ...(result?.reason === 'not-configured' ? { reason: 'not-configured' as const } : {}),
          });
        }
      }
      cursor += batch.length;
      this.commit(rowKey, frozen, indexes, sent, collected);
    }
    this.commit(rowKey, frozen, indexes, sent, collected, true);
  }

  /**
   * 把这一次请求已经拿到的结果写回行。
   *
   * 落账的判据是**在飞账本**而不是文本数组的身份：这一块还在飞、而且行的原文与
   * 那时登记的一字不差，结果才算数。行被换代（旧结果整份作废）、被 LRU 淘汰、
   * 或者那一块已经被手动补跑重新认领时，结果一律丢弃。
   */
  private commit(
    rowKey: string,
    frozen: number,
    indexes: readonly number[],
    sent: ReadonlyMap<number, string>,
    collected: ReadonlyMap<number, BlockOutcome>,
    finish = false
  ): void {
    const live = this.rows.get(rowKey);
    const inflight = this.pending.get(rowKey);
    if (live === undefined || inflight === undefined) {
      if (finish) this.pending.delete(rowKey);
      return;
    }
    const outcomes: (BlockOutcome | null)[] = live.outcomes.map((outcome) => (outcome === null ? null : { ...outcome }));
    for (const [index, outcome] of collected) {
      if (inflight.texts.get(index) !== sent.get(index) || live.texts[index] !== sent.get(index)) continue;
      outcomes[index] = outcome;
    }
    for (const [index, text] of sent) {
      if (collected.has(index) && inflight.texts.get(index) === text) inflight.texts.delete(index);
    }
    // 转圈的是**还在飞**的块：结果已回来的立刻停转，即便同一轮里别的块还在等
    // （那一块自己的 ↻ 才该转）。落定时一轮都没了。
    const retrying = finish ? [] : indexes.filter((index) => inflight.texts.has(index));
    const done = finish && inflight.texts.size === 0;
    if (done) this.pending.delete(rowKey);
    this.rows.set(rowKey, {
      status: done ? 'settled' : 'pending',
      texts: live.texts,
      outcomes,
      settledThrough: settleThrough(live.settledThrough, frozen),
      retrying,
    });
    this.bump();
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

/** 内容池的键：与宿主磁盘池同口径（trim 后小写），只有空白差异的块算同一段。 */
function cacheKey(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * 写定数单点推进：单调不减。正文只往后追加，所以已经写定的块数只进不退；
 * 手点补跑会把当时较小的 frozen 递回来，不能让它把进度退回去。
 *
 * @param current - 行上已记录的写定数。
 * @param frozen - 本次调用带来的写定数。
 * @returns 两者中较大者。
 */
function settleThrough(current: number, frozen: number): number {
  return Math.max(current, frozen);
}

/** 冻结数收进 [0, length]：调用方给多了不算数。 */
function clampFrozen(frozen: number, length: number): number {
  if (!Number.isFinite(frozen) || frozen < 0) return 0;
  return Math.min(Math.floor(frozen), length);
}

/** 补跑下标去重、排序、收进合法范围。 */
function normalizeRetries(retries: readonly number[] | undefined): number[] {
  if (retries === undefined || retries.length === 0) return [];
  const unique = new Set<number>();
  for (const index of retries) {
    if (Number.isInteger(index) && index >= 0) unique.add(index);
  }
  return [...unique].sort((a, b) => a - b);
}

/** 供测试注入取数面创建独立池。 */
export function createTranslateStore(fetcher: ReplyFetcher): ChatTranslateStore {
  return new ChatTranslateStore(fetcher);
}

/** 正文翻译池：客户端半边唯一的按行译文登记处。 */
export const chatTranslate = createTranslateStore(requestTranslateReply);
