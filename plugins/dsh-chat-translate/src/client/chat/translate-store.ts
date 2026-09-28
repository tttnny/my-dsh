import { requestTranslateReply, type ReplyBlockResult } from '../translate/api.ts';
import { estimateTokens, REPLY_MAX_INPUT_TOKENS } from '../../server/pipeline/blocks.ts';

/** 一行正文的按块翻译结果，与请求的 texts 数组按下标对齐。 */
export interface BlockOutcome {
  /** 模型产出的中文（Markdown 源文本）；失败时等于原文。 */
  translated: string;
  /** 该块是否翻译成功。失败的块界面保持原文、不标记。 */
  ok: boolean;
}

/**
 * 一行正文的翻译状态。outcomes 与 texts 同下标，null = 该块所在批尚未落定：
 * 每批返回就地填入并通知，长回答按阅读顺序逐段出中文，不憋到最后一批。
 * 全部批落定后：无失败即 done；有失败标 partial——partial 行允许下一次
 * ensure 重走（渲染层的下一次触发是滚出视口再回来、或行重挂载），失败的
 * 块因此自然重试，成功的块由宿主磁盘缓存直接命中、不再花模型调用。
 */
export interface RowState {
  status: 'pending' | 'partial' | 'done';
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
 * 配到新文本上。请求幂等：同键同文本、且上一代已落定成功或仍在途的 ensure
 * 不再发请求；只有 partial（有失败块）的同代 ensure 会重走。在途期间换代，
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
   * @returns 是否发出了新的请求（同代 done/pending 与换代前的登记之外都是 false）。
   */
  ensure(rowKey: string, texts: readonly string[]): boolean {
    const current = this.rows.get(rowKey);
    if (current !== undefined && sameTexts(current.texts, texts)) {
      // 同代：done/pending 短路；partial 重走——失败块的「自然重试」入口。
      if (current.status !== 'partial') return false;
    }
    const snapshot = [...texts];
    const next: RowState = {
      status: 'pending',
      texts: snapshot,
      outcomes: snapshot.map(() => null),
    };
    this.rows.delete(rowKey);
    this.rows.set(rowKey, next);
    this.prune();
    this.bump();
    if (snapshot.length > 0) void this.run(rowKey, snapshot);
    return true;
  }

  private async run(rowKey: string, texts: readonly string[]): Promise<void> {
    // 去重靠 ensure 的同代短路；换代后的并发在途允许存在——迟到的旧代结果
    // 由每批落定处的快照核对丢弃。
    const outcomes: (BlockOutcome | null)[] = texts.map(() => null);
    let offset = 0;
    for (const batch of chunkTexts(texts)) {
      let results: ReplyBlockResult[] = [];
      try {
        results = await this.fetch(batch);
      } catch {
        // 取数面的异常与失败结果同义：该批保持原文。api 层自身已兜底，这里
        // 防的是 fetcher 实现抛错的形态。
        results = [];
      }
      for (let i = 0; i < batch.length; i++) {
        const result = results[i];
        if (result !== undefined && result.ok && result.translated && result.translated.trim()) {
          outcomes[offset + i] = { translated: result.translated, ok: true };
        } else {
          outcomes[offset + i] = { translated: batch[i] ?? texts[offset + i] ?? '', ok: false };
        }
      }
      offset += batch.length;
      // 逐批可见：行仍是这一代才写入，写完通知——先回的段先出中文。
      const live = this.rows.get(rowKey);
      if (live === undefined || live.status !== 'pending' || !sameTexts(live.texts, texts)) return;
      this.rows.set(rowKey, { status: 'pending', texts: live.texts, outcomes: [...outcomes] });
      this.bump();
    }
    const state = this.rows.get(rowKey);
    if (state?.status === 'pending' && sameTexts(state.texts, texts)) {
      const anyFailed = outcomes.some((outcome) => outcome === null || !outcome.ok);
      this.rows.set(rowKey, {
        status: anyFailed ? 'partial' : 'done',
        texts: state.texts,
        outcomes,
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

function sameTexts(a: readonly string[], b: readonly string[]): boolean {
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
