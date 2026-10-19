/**
 * 助手行的渲染计划：纯函数，不含 React，无浏览器依赖。
 *
 * 计划层承担两类判断——
 * 1. 与宿主 `AssistantMarkdown` 逐条等价的分支：什么时候整行不渲染、
 *    groupPart 怎么过滤、tool-call 块为什么在这里被跳过（工具行是 flow 里
 *    独立的行，由宿主自己渲染）、连续 image 怎么合成一组、未知块落 JSON、
 *    「已停止」标记的出现条件。
 * 2. 翻译呈现的单点判断：正文块左缘出现什么。判据一次算清：成功落定=翻成了
 *    （`translated`，原始 mark 里没有「读原文」这一态——它由 `showingOriginal`
 *    单点承载，所以切回原文后仍然切得回来）；失败=留下补跑标记（`failed`，
 *    `fail` 一句技术细节只喂悬停文案，`retryBusy` 说 ↻ 此刻是否在原地转圈）；
 *    其余（空白块、流式、开关关、未登记、还没有结果的块）= 左缘什么都不出现。
 *    模型原样返回同样算成功：标记传达「这段过了模型」，不是「变过」。
 *    空白块（trim 后为空）不进送译清单、不占下标、永不标记——它没送过模型，
 *    重试也永远不会成，标记只会留下消不掉的东西。
 *
 * 渲染层（assistant-step.tsx）只消费 mark 与两个附加位；改动这里的等价分支必须
 * 同时对照宿主实现。
 */
import type { BlockOutcome, BlockFailKind } from './translate-store.ts';
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
   * 正文块：mark 即左缘标记状态（类名与左缘动作全由它决定）；translated 仅在
   * 成功时非 null；showingOriginal 是同一份成功结果上的显示源选择（成功块的
   * 译文/原文切换）；fail 仅在 mark==='failed' 时非 null——服务端的技术一句，
   * 供悬停报因；failKind 是同一失败的分类（悬停与读屏据此报哪一类原因）；
   * retryBusy 仅在这一块被手点补跑时为 true——↻ 原地转圈、暂不可重复点。
   */
  | {
      type: 'prose';
      key: number;
      text: string;
      translated: string | null;
      mark: ProseMark;
      showingOriginal: boolean;
      fail: string | null;
      failKind: BlockFailKind | null;
      retryBusy: boolean;
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
  /**
   * 通道此刻的状态，决定正文左缘出现什么：'ready' 正常送译、'unconfigured'
   * 不送请求但如实报「设置没配好」、'off' 一律按原文且不挂任何标记。
   */
  channel: ChannelState;
  /**
   * 该行正文块的翻译结果，与 texts 同下标；null = 该批尚未落定。
   * 未登记或换代时整个缺省。
   */
  outcomes?: readonly (BlockOutcome | null)[];
  /**
   * 前多少个正文块已经写完（内容冻结）。省略 = 全部写完。流式期间调用方传
   * 当前冻结数：正在长的尾块（下标 >= frozen）保持原文，也不带任何左缘动作。
   */
  frozen?: number;
  /**
   * 这一轮在途是用户点 ↻ 发起的补跑所涉及的下标：只有它们让失败块的 ↻ 转圈。
   * 首跑在途（还有批没回）不转——用户没点过它。
   */
  retrying?: readonly number[];
  /** 用户点了「读原文」的正文块（按条目 key）：成功块改回原文渲染，
   *  触发它的是左缘窄带上的切换，不是点正文。 */
  originalKeys?: ReadonlySet<number>;
}

/** trim 后为空的块不送译、不标记、不占下标——判据单点在这里。 */
function isBlankText(value: string | undefined): boolean {
  return (value ?? '').trim() === '';
}

/**
 * 送译清单：本分组真正会渲染出来的非空白 text 块。reasoning 分组不渲染任何正文，
 * 也就不送译——texts、textIndex、outcomes 三者始终同域对齐。渲染层判「已经写定
 * 到第几块」用的是同一份清单（{@link growingTailIndex}），所以这里导出的既是一
 * 个读法，也是那条判据的唯一实现。
 *
 * @param blocks - 行的块清单。
 * @param groupPart - flow 分组。
 * @returns 按出现顺序排列的正文原文。
 */
export function proseTexts(blocks: readonly AssistantBlockLike[], groupPart?: string): string[] {
  const texts: string[] = [];
  if (groupPart === 'reasoning') return texts;
  for (const block of blocks) {
    if (block.kind === 'text' && !isBlankText(block.text)) texts.push(block.text ?? '');
  }
  return texts;
}

/**
 * 流式期间「已经写定」的块数：正文只往后追加，所以除了**正在长的最后一块**，
 * 前面每一块的内容都不会再变。正在长的尾块一个字都不送，它写定的那一刻才轮到它。
 *
 * @param blocks - 行的块清单。
 * @param groupPart - flow 分组；reasoning 分组一块都不送。
 * @returns 已经写定的正文块数。
 */
export function growingTailIndex(blocks: readonly AssistantBlockLike[], groupPart?: string): number {
  return Math.max(0, proseTexts(blocks, groupPart).length - 1);
}

/**
 * 「设置没配好」时进悬停气泡与读屏标签的那一句：本地化的标签已经说清要去哪儿改，
 * 这一句是同一件事的技术侧说明（没有向通道发过请求）。它同时替换掉实际上不会发生
 * 的服务端回执——客户端在这条路上一个字都不发。
 */
export const NOT_CONFIGURED_DETAIL = 'no translation request was sent: the channel is not configured';

/** 正文块的翻译通道此刻是什么状态，决定正文左缘出现什么。 */
export type ChannelState =
  /** 开关开着、通道也配齐了：正常送译。 */
  | 'ready'
  /** 开关开着但通道没配齐（缺 Key / Base URL / 模型）：不送请求，但如实标记。 */
  | 'unconfigured'
  /** 总开关关着：纯粹不要翻译，正文保持原文，不挂任何标记。 */
  | 'off';

export function planAssistantRow(input: RowPlanInput): RowPlan {
  const {
    blocks,
    streaming,
    interrupted,
    groupPart,
    channel,
    outcomes,
    frozen,
    retrying,
    originalKeys,
  } = input;

  // 宿主守卫逐字等价：只有 tool-call 块、又非流式非中断的行不渲染。
  const hasVisible = streaming || interrupted || blocks.some((block) => block.kind !== 'tool-call');
  if (!hasVisible) return { entries: null, texts: [] };

  // 送译文本与「写定到第几块」共用同一份清单（见 proseTexts）。
  const texts = proseTexts(blocks, groupPart);

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
        // 写完（内容冻结）且开关开着才有得谈：正在长的尾块一个字都没送过，
        // 既不该有译文，也不该有失败标记——它连结果位都没有。
        const settled = index < (frozen ?? Number.POSITIVE_INFINITY);
        const attemptable = !blank && channel === 'ready' && settled;
        // 「设置没配好」不送请求，但同样如实标记：静默会让读者以为插件坏了。
        const unconfigured = !blank && channel === 'unconfigured' && settled;
        const outcome: BlockOutcome | null = attemptable && outcomes !== undefined ? outcomes[index] ?? null : null;
        let mark: ProseMark = null;
        let fail: string | null = null;
        let failKind: BlockFailKind | null = null;
        let retryBusy = false;
        if (unconfigured) {
          mark = 'failed';
          fail = NOT_CONFIGURED_DETAIL;
          failKind = 'not-configured';
        }
        if (outcome !== null && outcome.ok) {
          mark = 'translated';
        } else if (outcome !== null) {
          mark = 'failed';
          fail = outcome.detail ?? null;
          failKind = outcome.reason ?? 'channel';
          // 只有用户手点的补跑会让 ↻ 转圈（池在手点那一轮把这块登记成在飞，
          // 落定即复位）；首跑期间失败的块 ↻ 静止可点——用户没点过它。
          retryBusy = retrying?.includes(index) ?? false;
        }
        entries.push({
          type: 'prose',
          key,
          text: block.text ?? '',
          translated: outcome !== null && outcome.ok ? outcome.translated : null,
          mark,
          showingOriginal: outcome !== null && outcome.ok && (originalKeys?.has(key) ?? false),
          fail,
          failKind,
          retryBusy,
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
