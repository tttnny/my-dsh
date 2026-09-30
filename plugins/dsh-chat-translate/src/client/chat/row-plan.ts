/**
 * 助手行的渲染计划：纯函数，不含 React，无浏览器依赖。
 *
 * 计划层承担两类判断——
 * 1. 与宿主 `AssistantMarkdown` 逐条等价的分支：什么时候整行不渲染、
 *    groupPart 怎么过滤、tool-call 块为什么在这里被跳过（工具行是 flow 里
 *    独立的行，由宿主自己渲染）、连续 image 怎么合成一组、未知块落 JSON、
 *    「已停止」标记的出现条件。
 * 2. 翻译呈现的单点判断：正文块在什么状态下挂什么线，直接产出 styles.ts
 *    的 `ProseMark`（词汇与类名映射单点在 styles.ts）。判据一次算清：成功落定
 *    =蓝线（用户点了读原文则灰细线——`originalKeys` 进来折进 mark）；失败
 *    （通道伤）=红实线一根，`fail` 一句技术细节只喂悬停文案；行已登记在途且
 *    这块尚无结果=灰脉动；其余（空白块、流式、开关关、未登记）=无线。模型
 *    原样返回同样算成功：标记传达「这段过了模型」，不是「变过」。
 *    空白块（trim 后为空）不进送译清单、不占下标、永不挂线——它没送过模型，
 *    重试也永远不会成，挂线只会留下消不掉的标记。
 *
 * 渲染层（assistant-step.tsx）只消费 mark；改动这里的等价分支必须同时对照
 * 宿主实现。
 */
import type { BlockOutcome } from './translate-store.ts';
import type { ProseMark } from './styles.ts';

/** 助手行块数据的结构性镜像（值边不跨包，type-only 世界）。 */
export interface AssistantBlockLike {
  readonly kind: string;
  readonly text?: string;
  readonly attachment?: unknown;
  readonly block?: unknown;
}

export type RowPlanEntry =
  /** 思考块：blockIndex 供「流式尾块」判定，key 是条目在计划里的位置（React 键）。 */
  | { type: 'reasoning'; key: number; blockIndex: number; text: string }
  /**
   * 正文块：mark 即左缘线状态（线型、脉动、热区动作全由它决定）；
   * translated 仅在成功时非 null，供 mark==='translated' 时换源文本渲染；
   * fail 仅在 mark==='failed' 时非 null——服务端的技术一句，Tooltip 悬停
   * 报因用，缺省时只报「翻译失败」。线型不从这里出：失败一律同一条红实线。
   */
  | {
      type: 'prose';
      key: number;
      text: string;
      translated: string | null;
      mark: ProseMark;
      fail: string | null;
    }
  | { type: 'images'; key: number; attachments: readonly unknown[] }
  | { type: 'unknown'; key: number; block: unknown }
  | { type: 'stopped'; key: number };

export interface RowPlan {
  /** null = 整行不渲染（与宿主的空行守卫一致）。 */
  entries: RowPlanEntry[] | null;
  /** 送翻译池的正文文本，按正文块出现顺序（空白块除外），与结果下标对齐。 */
  texts: string[];
}

export interface RowPlanInput {
  blocks: readonly AssistantBlockLike[];
  /** 行在流式中：流式期间一律原文，落定后才有译文。 */
  streaming: boolean;
  /** 中断前缀：行尾带「已停止」标记。 */
  interrupted: boolean;
  /** flow 分组：'reasoning' 只要思考块，'response' 排除思考块，缺省全要。 */
  groupPart?: string;
  /** 可译门（enabled 且通道三要素齐备）：false 时一切按原文呈现，不挂线。 */
  canTranslate: boolean;
  /**
   * 该行正文块的翻译结果，与 texts 同下标；null = 该批尚未落定。
   * 未登记或换代时整个缺省。
   */
  outcomes?: readonly (BlockOutcome | null)[];
  /** 池里这行的状态：pending 时未落定的块显灰脉动，未登记什么都不显。 */
  rowStatus?: 'pending' | 'settled';
  /** 用户点了「读原文」的正文块（按条目 key）：把译文态折成 original-view。
   *  触发它的是左缘热区上的切换，不是点正文。 */
  originalKeys?: ReadonlySet<number>;
}

/** trim 后为空的块不送译、不挂线、不占下标——判据单点在这里。 */
function isBlankText(value: string | undefined): boolean {
  return (value ?? '').trim() === '';
}

export function planAssistantRow(input: RowPlanInput): RowPlan {
  const { blocks, streaming, interrupted, groupPart, canTranslate, outcomes, rowStatus, originalKeys } =
    input;

  // 宿主守卫逐字等价：只有 tool-call 块、又非流式非中断的行不渲染。
  const hasVisible = streaming || interrupted || blocks.some((block) => block.kind !== 'tool-call');
  if (!hasVisible) return { entries: null, texts: [] };

  // 送译文本 = 本分组真正会渲染出来的非空白 text 块：reasoning 分组不渲染任何
  // 正文，也就不送译——texts、textIndex、outcomes 三者始终同域对齐。
  const texts: string[] = [];
  if (groupPart !== 'reasoning') {
    for (const block of blocks) {
      if (block.kind === 'text' && !isBlankText(block.text)) texts.push(block.text ?? '');
    }
  }

  const entries: RowPlanEntry[] = [];
  let textIndex = 0;
  let imageRun: unknown[] | null = null;

  const flushImages = (): void => {
    if (imageRun !== null) {
      entries.push({ type: 'images', key: entries.length, attachments: imageRun });
      imageRun = null;
    }
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block === undefined) continue;
    if (groupPart === 'reasoning' && block.kind !== 'reasoning') continue;
    if (groupPart === 'response' && block.kind === 'reasoning') continue;

    switch (block.kind) {
      case 'text': {
        flushImages();
        const blank = isBlankText(block.text);
        const index = textIndex;
        if (!blank) textIndex += 1;
        // key 一律用条目位置：块下标在 groupPart 过滤后可能与行尾追加项撞
        // React 键（如 reasoning 被过滤的 interrupted 行）。
        const key = entries.length;
        const attemptable = !blank && canTranslate && !streaming;
        const outcome = attemptable && outcomes !== undefined ? outcomes[index] ?? null : null;
        let mark: ProseMark = null;
        let fail: string | null = null;
        if (outcome !== null && outcome.ok) {
          mark = originalKeys?.has(key) ? 'original-view' : 'translated';
        } else if (outcome !== null) {
          mark = 'failed';
          fail = outcome.detail ?? null;
        } else if (attemptable && rowStatus === 'pending') {
          mark = 'inflight';
        }
        entries.push({
          type: 'prose',
          key,
          text: block.text ?? '',
          translated: outcome !== null && outcome.ok ? outcome.translated : null,
          mark,
          fail,
        });
        break;
      }
      case 'reasoning':
        flushImages();
        entries.push({ type: 'reasoning', key: entries.length, blockIndex: i, text: block.text ?? '' });
        break;
      case 'image':
        if (imageRun === null) imageRun = [];
        imageRun.push(block.attachment);
        break;
      case 'tool-call':
        flushImages();
        break;
      default:
        flushImages();
        entries.push({ type: 'unknown', key: entries.length, block: block.block ?? null });
    }
  }
  flushImages();

  // 宿主的停止标记条件逐字等价。
  const showStopped =
    interrupted &&
    (groupPart === undefined ||
      groupPart === 'response' ||
      !blocks.some((block) => block.kind !== 'reasoning' && block.kind !== 'tool-call'));
  if (showStopped) entries.push({ type: 'stopped', key: entries.length });

  return { entries, texts };
}
