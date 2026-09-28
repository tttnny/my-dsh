import { clientCache } from './client-cache.ts';
import { requestTranslateReply } from './api.ts';
import { NonDestructiveTranslationMount } from './mount.ts';
import { estimateTokens } from '../../server/pipeline/blocks.ts';

/**
 * 回答正文的翻译：由观察器在一条回答落定后（`data-streaming` 消失）调用，
 * 不需要用户点任何按钮。
 *
 * 目标只取正文容器里的 markdown 块级元素；混合块（列表项文字 + 子列表 /
 * 代码块）拆成行内片段，嵌套的块级子节点留在原位；代码块（pre）及其内部一律
 * 不动。每一块都送翻译服务——包括整段中文的块，由模型决定改写还是原样回。
 */

const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'BLOCKQUOTE',
  'TD',
  'TH',
  'DT',
  'DD',
  'FIGCAPTION',
]);

const CONTAINER_TAGS = new Set(['UL', 'OL', 'DL', 'TABLE', 'THEAD', 'TBODY', 'TR', 'DIV', 'SECTION']);

/** 出现这些后代就说明当前块是混合块，必须拆片段而不是整块当单位。 */
const NESTED_BOUNDARY_SELECTOR = [...BLOCK_TAGS, ...CONTAINER_TAGS, 'PRE']
  .join(',')
  .toLowerCase();

/**
 * 一次客户端请求装多少个单位：估算 token 低于宿主的打包上限，让每个请求在
 * 宿主侧通常只对应一次模型调用；请求逐块发出、译文逐块挂载。
 */
const REQUEST_TOKENS = 2048;

/** 稳定的翻译单位：一块级元素，或一段行内节点。 */
export interface ReplyUnit {
  element?: HTMLElement;
  nodes?: Node[];
  text: string;
  anchor: Node;
}

function isMountedElement(element: HTMLElement): boolean {
  return element.dataset?.tidyTranslated === 'true';
}

function hasNestedBoundary(element: HTMLElement): boolean {
  return element.querySelector(NESTED_BOUNDARY_SELECTOR) !== null;
}

/** 收集正文里全部可翻译单位，跳过已挂译文的部分与代码块；空文本之外一律成单位。 */
export function collectReplyUnits(body: HTMLElement): ReplyUnit[] {
  const units: ReplyUnit[] = [];

  const pushRun = (nodes: Node[]): void => {
    if (nodes.length === 0) return;
    const text = nodes.map((node) => node.textContent ?? '').join('').trim();
    if (!text) return;
    const anchor = nodes[0];
    if (anchor === undefined) return;
    units.push({ nodes, text, anchor });
  };

  const walk = (container: HTMLElement): void => {
    let run: Node[] = [];
    const flush = (): void => {
      pushRun(run);
      run = [];
    };

    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType !== 1) {
        run.push(node);
        continue;
      }
      const element = node as HTMLElement;
      if (NonDestructiveTranslationMount.isOwnNode(element)) {
        flush();
        continue;
      }
      if (element.tagName === 'PRE') {
        flush();
        continue;
      }
      if (BLOCK_TAGS.has(element.tagName)) {
        flush();
        collectBlock(element);
        continue;
      }
      if (CONTAINER_TAGS.has(element.tagName)) {
        flush();
        walk(element);
        continue;
      }
      // 行内元素（strong / code / a / em 等）与相邻文本合成一个片段
      run.push(element);
    }
    flush();
  };

  const collectBlock = (element: HTMLElement): void => {
    if (isMountedElement(element)) return;
    if (!hasNestedBoundary(element)) {
      const text = (element.textContent ?? '').trim();
      if (text) units.push({ element, text, anchor: element });
      return;
    }
    walk(element);
  };

  walk(body);
  return units;
}

/** 按估算 token 把单位切成若干次客户端请求，顺序不变。 */
export function chunkUnits(units: ReplyUnit[], maxTokens: number = REQUEST_TOKENS): ReplyUnit[][] {
  const chunks: ReplyUnit[][] = [];
  let current: ReplyUnit[] = [];
  let tokens = 0;
  for (const unit of units) {
    const cost = Math.max(estimateTokens(unit.text), 1);
    if (current.length > 0 && tokens + cost > maxTokens) {
      chunks.push(current);
      current = [];
      tokens = 0;
    }
    current.push(unit);
    tokens += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * 一条回答正文的翻译控制器。观察器把落定的正文容器交给 {@link translateBody}；
 * 同一条回答的在途翻译只跑一次。
 */
class ReplyTranslateController {
  /** 正文容器 → 在途 Promise，避免同一条回答被重复翻译。 */
  private inFlight = new WeakMap<HTMLElement, Promise<void>>();

  /**
   * 翻译一条回答的正文容器。已命中缓存的单位立即挂上，其余按块请求；
   * 失败的块保留原文（结果不入缓存，下次滚回视口会自然重试）。
   * @param body - 正文容器（markdown body）。
   * @returns 本次翻译完成后结算（已在途则返回同一次在途）。
   */
  translateBody(body: HTMLElement): Promise<void> {
    const running = this.inFlight.get(body);
    if (running !== undefined) return running;
    const task = this.run(body).finally(() => {
      this.inFlight.delete(body);
    });
    this.inFlight.set(body, task);
    return task;
  }

  private async run(body: HTMLElement): Promise<void> {
    const units = collectReplyUnits(body);
    if (units.length === 0) return;

    const missing: ReplyUnit[] = [];
    for (const unit of units) {
      const cached = clientCache.get(unit.text);
      if (cached === undefined) missing.push(unit);
      else this.applyUnit(unit, cached);
    }
    if (missing.length === 0) return;

    await this.translateUnits(missing);
  }

  /**
   * 逐块请求并挂载。失败的块保持原文：界面上不留提示，控制台留一条警告，结果
   * 不进缓存，因此这一块在下次进入视口时会自然重试。
   */
  private async translateUnits(units: ReplyUnit[]): Promise<void> {
    for (const chunk of chunkUnits(units)) {
      const texts = chunk.map((unit) => unit.text);
      let results: Awaited<ReturnType<typeof requestTranslateReply>>;
      try {
        results = await requestTranslateReply(texts);
      } catch (err: any) {
        console.warn(
          `[dsh-chat-translate] 正文翻译块请求失败，保留原文: ${err?.message ?? err}`
        );
        continue;
      }
      const byText = new Map(results.map((result) => [result.original, result]));
      for (const unit of chunk) {
        const result = byText.get(unit.text);
        // 译文为空、与原文相同、或翻译失败都不挂载。
        if (
          result === undefined ||
          !result.ok ||
          !result.translated.trim() ||
          result.translated.trim() === unit.text.trim()
        ) {
          console.warn(
            `[dsh-chat-translate] 正文翻译未成功，保留原文: "${unit.text.slice(0, 40)}"`
          );
          continue;
        }
        clientCache.set(unit.text, result.translated);
        this.applyUnit(unit, result.translated);
      }
    }
  }

  /** 把译文挂到单位上；期间文本或节点已经变动的单位直接放弃（结果已进缓存）。 */
  private applyUnit(unit: ReplyUnit, translated: string): void {
    if (unit.element !== undefined) {
      const element = unit.element;
      if (!element.isConnected || isMountedElement(element)) return;
      if ((element.textContent ?? '').trim() !== unit.text) return;
      NonDestructiveTranslationMount.mount(element, translated, {
        originalText: unit.text,
      });
      return;
    }

    const nodes = unit.nodes ?? [];
    if (nodes.length === 0 || nodes.some((node) => !node.isConnected)) return;
    const parent = nodes[0]?.parentNode ?? null;
    if (parent === null || !nodes.every((node) => node.parentNode === parent)) return;
    const text = nodes.map((node) => node.textContent ?? '').join('').trim();
    if (text !== unit.text) return;
    NonDestructiveTranslationMount.mountRun(nodes, translated, {
      originalText: unit.text,
    });
  }
}

export const replyTranslator = new ReplyTranslateController();
