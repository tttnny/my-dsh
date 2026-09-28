/**
 * 助手行的渲染计划：纯函数，不含 React，无浏览器依赖。
 *
 * 计划层承担两类判断——
 * 1. 与宿主 `AssistantMarkdown` 逐条等价的分支：什么时候整行不渲染、
 *    groupPart 怎么过滤、tool-call 块为什么在这里被跳过（工具行是 flow 里
 *    独立的行，由宿主自己渲染）、连续 image 怎么合成一组、未知块落 JSON、
 *    「已停止」标记的出现条件。
 * 2. 翻译的呈现判断：正文块在什么状态下显示译文并带「已翻译」标记。标准只有
 *    一条——该块的翻译成功落定。「模型认为原样最好、返回同样的文字」同样是
 *    成功：照常挂载、照常标记，标记传达的是「这段过了模型」，不是「这段变过」。
 *
 * 渲染层（assistant-step.tsx）把计划变成 JSX；改动这里的等价分支必须同时对照
 * 宿主实现。
 */
import type { BlockOutcome } from './translate-store.ts';

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
  /** 正文块：translated 非 null 时显示该译文并带「已翻译」标记，否则显示 text。 */
  | { type: 'prose'; key: number; text: string; translated: string | null }
  | { type: 'images'; key: number; attachments: readonly unknown[] }
  | { type: 'unknown'; key: number; block: unknown }
  | { type: 'stopped'; key: number };

export interface RowPlan {
  /** null = 整行不渲染（与宿主的空行守卫一致）。 */
  entries: RowPlanEntry[] | null;
  /** 送翻译池的正文文本，按正文块出现顺序，与结果下标对齐。 */
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
   * 该行正文块的翻译结果，与 texts 同下标；null = 该批尚未落定（逐批出文的
   * 中间态）。未登记或换代时整个缺省。
   */
  outcomes?: readonly (BlockOutcome | null)[];
}

export function planAssistantRow(input: RowPlanInput): RowPlan {
  const { blocks, streaming, interrupted, groupPart, canTranslate, outcomes } = input;

  // 宿主守卫逐字等价：只有 tool-call 块、又非流式非中断的行不渲染。
  const hasVisible = streaming || interrupted || blocks.some((block) => block.kind !== 'tool-call');
  if (!hasVisible) return { entries: null, texts: [] };

  // 送译文本 = 本分组真正会渲染出来的 text 块：reasoning 分组不渲染任何正文，
  // 也就不送译——texts、textIndex、outcomes 三者始终同域对齐。
  const texts: string[] = [];
  if (groupPart !== 'reasoning') {
    for (const block of blocks) {
      if (block.kind === 'text') texts.push(block.text ?? '');
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
        const index = textIndex;
        textIndex += 1;
        // key 一律用条目位置：块下标在 groupPart 过滤后可能与行尾追加项撞
        // React 键（如 reasoning 被过滤的 interrupted 行）。
        const outcome = canTranslate && !streaming && outcomes !== undefined ? outcomes[index] : null;
        entries.push({
          type: 'prose',
          key: entries.length,
          text: block.text ?? '',
          translated: outcome !== null && outcome !== undefined && outcome.ok ? outcome.translated : null,
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
