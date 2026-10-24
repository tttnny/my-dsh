/**
 * 助手行渲染器：经 keyed slot `conversation.chat.node`（key `assistant-step`）
 * 替换宿主默认的行渲染。
 *
 * 接管换来两件事——
 * 1. 正文块从数据层拿**原始 markdown**（`AssistantBlock.text`），译文同样按
 *    markdown 交给宿主公开基线组件 `MarkdownText` 重渲染：格式保真由官方
 *    渲染器负责，本文件不产生任何自拼 markup。
 * 2. 「翻成了没有」是渲染状态：落定、开关开启、进入视口后逐行首跑；成功的块
 *    （包括模型认为原样最好的块）换成中文渲染，失败的块保持原文。
 *
 * 正文左缘不画任何东西，正文排版与宿主默认逐字一致。可点的只有左缘之外的两样：
 * 成功块的译文/原文切换归一条 10px 透明窄带（正文一个像素都不占），失败块的补跑
 * 归一个真的 ↻ 按钮（浮在正文左侧的空隙里）。鼠标停在窄带上时，**光标右边**出
 * 一条气泡报出此刻能做的动作（读译文时「查看原文」，反之亦然），气泡跟着光标在
 * 带子上移动，鼠标离开带子就收起。正文整块不是点击目标，所以单击落字、拖选复制
 * 都不会误触。补跑在途时 ↻ 原位转圈、暂不可重复点。
 *
 * 除正文外的行内容与宿主逐分支等价：reasoning 行走折叠（含 Turn-process
 * 隐藏与 beforematch 揭示）、连续 image 组交回 owner 的 renderMessageImages、
 * 未知块落 JsonBlock、tool-call 在助手行内跳过（工具行由宿主独立渲染）、
 * 中断前缀行尾带「已停止」。props 形状是宿主 contract 的结构性镜像：值边
 * 不跨包（客户端 bundle 纯净门禁），类型注释指明对应声明。
 * 本渲染器抛错时按 keyed slot 的退位语义退出该 cell，宿主原渲染器回位。
 */
import * as React from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ReactElement, ReactNode } from 'react';
import {
  DisclosureRow,
  IconRefreshOutlineRegular,
  IconThinkOutlineRegular,
  JsonBlock,
  MarkdownText,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  MarkdownCodeLabels,
  MarkdownFileMentions,
  MarkdownLabels,
  MarkdownPathImages,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { settingsStore } from '../settings/store.ts';
import { growingTailIndex, planAssistantRow } from './row-plan.ts';
import type { ChannelState } from './row-plan.ts';
import { isConclusionRow } from './conclusion.ts';
import { isCleanHotspotClick } from './click-guard.ts';
import { hideHintBubble, placeHintBubble } from './hint-bubble.ts';
import { rowCopy } from '../locales.ts';
import type { AssistantBlockLike } from './row-plan.ts';
import type { ProseMark } from './styles.ts';
import {
  ensureAssistantStyles,
  HINT_BUBBLE_CLASS,
  HOTSPOT_CLASS,
  PROSE_BASE_CLASS,
  RETRY_BUSY_ATTR,
  RETRY_CLASS,
  RETRY_SPIN_CLASS,
  RETRY_UNCONFIGURED_ATTR,
  proseAction,
  proseClassNames,
} from './styles.ts';
import { chatTranslate, sameTexts } from './translate-store.ts';
import type { BlockFailKind, ChatTranslateStore } from './translate-store.ts';

// ---- 宿主 contract 的结构性镜像（source of truth: ui-chat slots.d.ts） ----

interface DisclosureState {
  readonly expanded: boolean;
  readonly setExpanded: (open: boolean) => void;
  readonly toggle: () => void;
}

interface PresentationLike {
  readonly settledReasoningPreview: boolean;
}

interface NodeDataLike {
  readonly status: 'running' | 'settled' | 'interrupted';
  readonly turn: number;
  readonly step: number;
  readonly blocks: readonly AssistantBlockLike[];
  readonly finalNode?: { readonly seq: number };
}

interface TurnProcessLike {
  readonly foldable: boolean;
  readonly open: boolean;
  /**
   * 宿主 `TurnProcessSpec` 的结构性镜像。`answerStep` 在宿主那里是可以为 null
   * 的（本轮还没有落定的消息），镜像必须照实写，否则判据会在类型层面被当成
   * 「永远有值」。
   */
  readonly spec: { readonly answerStep: number | null; readonly inlineReasoning: boolean };
  readonly setOpen: (open: boolean) => void;
}

export interface AssistantStepProps {
  /**
   * 这一行用的翻译池。缺省是客户端半边那一个单例；测试按座次注入自己的池，
   * 好把一行渲染成某个指定的结果态，而不必先让单例池产出那个结果。
   */
  readonly store?: RowTranslateStore;
  readonly node: {
    readonly data: NodeDataLike;
    /**
     * 宿主 `TurnLocation` 的结构性镜像：本轮各 step 的号只用来判「后面还有没有
     * 一步」，所以这里只声明 `step` 一个字段，不声明每一步的数据。
     */
    readonly location?: {
      readonly kind?: string;
      readonly turn?: { readonly status?: string; readonly steps?: readonly { readonly step: number }[] };
    };
    readonly anchorSeq?: number;
  };
  readonly groupPart?: string;
  readonly useDisclosure: () => DisclosureState;
  readonly useTurnData: (key: string) => unknown;
  readonly turnProcess?: TurnProcessLike;
  readonly openFile: (path: string, options?: { line?: number }) => void;
  readonly renderMessageImages: (owner: {
    readonly images: readonly { readonly attachment: unknown }[];
    readonly align?: string;
  }) => ReactNode;
  readonly fileMentions: (owner: unknown) => MarkdownFileMentions | undefined;
  readonly usePresentation: <R>(select: (policy: PresentationLike) => R) => R;
  readonly t: (key: string, params?: Record<string, unknown>) => string;
}

// ---- 与宿主逐字对齐的小件 ----

// 图标在渲染时创建，模块顶层不触碰运行时组件。
const thinkIcon = (): ReactElement => React.createElement(IconThinkOutlineRegular, { size: 14 });

function markdownLabels(t: (key: string, params?: Record<string, unknown>) => string): MarkdownLabels {
  return {
    code: {
      copyLabel: t('copy'),
      copiedLabel: t('copied'),
      toolbarLabels: {
        codeLabel: t('codeBlock.title'),
        wrapLabel: t('codeBlock.wrap'),
        unwrapLabel: t('codeBlock.unwrap'),
      },
    } as MarkdownCodeLabels,
    footnotes: t('markdown.footnotes'),
  };
}

function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith('\\\\');
}

function isAbsoluteWorkspacePath(path: string): boolean {
  return path.startsWith('/') || isWindowsStylePath(path);
}

/** 本地绝对路径经认证的 file 路由寻址（宿主 fileMediaUrl 等价）。 */
function fileMediaUrl(base: string, path: string): string | undefined {
  if ((!/^https?:/u.test(base) && !base.startsWith('dsh-app://app/')) || !isAbsoluteWorkspacePath(path)) return void 0;
  if (/^[/\\]{2}/u.test(path) || /[\u0000-\u001f\u007f]/u.test(path)) return void 0;
  return new URL(`api/file?path=${encodeURIComponent(path)}`, base).href;
}

function localPathMediaUrl(base: string, value: string): string | undefined {
  let path: string;
  try {
    path = decodeURIComponent(value.split(/[?#]/u)[0] ?? '');
  } catch {
    return void 0;
  }
  return fileMediaUrl(base, path);
}

function firstLine(text: string): string {
  const newline = text.indexOf('\n');
  return newline === -1 ? text : text.slice(0, newline);
}

function latestCompletedParagraphFirstLine(text: string): string {
  let summary = '';
  let paragraphStart = 0;
  const separator = /\r?\n(?:[\t ]*\r?\n)+/g;
  for (;;) {
    const nextParagraph = separator.exec(text);
    const paragraphEnd = nextParagraph === null ? text.length : nextParagraph.index + nextParagraph[0].indexOf('\n');
    const newline = text.indexOf('\n', paragraphStart);
    if (newline !== -1 && newline <= paragraphEnd) {
      const candidate = text.slice(paragraphStart, newline).trim();
      if (candidate !== '') summary = candidate;
    }
    if (nextParagraph === null) return summary;
    paragraphStart = nextParagraph.index + nextParagraph[0].length;
  }
}

/** 折叠的隐藏节点对页内搜索保持可达：命中前用 beforematch 揭示（宿主等价）。 */
function useSearchableHidden(hidden: boolean, reveal: () => void): React.RefObject<HTMLDivElement | null> {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (hidden && element.contains(element.ownerDocument.activeElement)) {
      reveal();
      return;
    }
    if (hidden) element.setAttribute('hidden', 'until-found');
    else element.removeAttribute('hidden');
  }, [hidden, reveal]);
  React.useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    element.addEventListener('beforematch', reveal);
    return () => {
      element.removeEventListener('beforematch', reveal);
    };
  }, [reveal]);
  return ref;
}

const subscribeSettings = (listener: () => void): (() => void) => settingsStore.subscribe(listener);

/** 行的翻译池：默认是客户端半边那一个单例，测试可以按座次注入自己的池。 */
export type RowTranslateStore = Pick<ChatTranslateStore, 'ensure' | 'getState' | 'getVersion' | 'subscribe'>;

/**
 * 行的视口在场状态（150px 缓冲）：进入视口才放行首跑请求。落定后的行不再
 * 有自动重走——滚出再回来只触发 ensure 的同代短路（pending/settled 都不发
 * 第二个请求），失败的救活只由块上的点击发起。
 */
function useSettledInView(ref: React.RefObject<HTMLElement | null>, armed: boolean): boolean {
  const noObserver = typeof IntersectionObserver === 'undefined';
  const [inView, setInView] = useState<boolean>(noObserver);
  useEffect(() => {
    if (noObserver || !armed) return;
    const element = ref.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setInView(entries.some((entry) => entry.isIntersecting));
      },
      { rootMargin: '150px' }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [armed, noObserver, ref]);
  return inView;
}

// ---- 思考行（宿主 ReasoningRow 等价，类名换本插件前缀） ----

interface ReasoningRowProps {
  text: string;
  running: boolean;
  usePresentation: <R>(select: (policy: PresentationLike) => R) => R;
  useDisclosure: () => DisclosureState;
  t: (key: string, params?: Record<string, unknown>) => string;
}

const ReasoningRow = memo(function ReasoningRow({
  text,
  running,
  usePresentation,
  useDisclosure,
  t,
}: ReasoningRowProps): ReactElement {
  const { expanded, toggle } = useDisclosure();
  const labels = useMemo(() => markdownLabels(t), [t]);
  const summaryText = running ? latestCompletedParagraphFirstLine(text) : firstLine(text);
  const summary = useMemo(() => summaryText.replaceAll('**', ''), [summaryText]);
  const preview = usePresentation(
    (policy) => !expanded && summary !== '' && (running || policy.settledReasoningPreview)
  );
  const collapsedContent = useMemo(
    () =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement('span', { className: 'dsh-ct-think-separator', 'aria-hidden': true }),
        React.createElement(
          'span',
          { className: 'dsh-ct-think-summary', 'data-streaming': running || void 0 },
          React.createElement('span', { className: 'dsh-ct-think-summary-text' }, summary)
        )
      ),
    [running, summary]
  );
  const content = useMemo(
    () =>
      expanded
        ? React.createElement(
            'div',
            { className: 'dsh-ct-think-body' },
            React.createElement(MarkdownText, { text, streaming: running, labels, variant: 'compact' })
          )
        : void 0,
    [expanded, labels, running, text]
  );
  return React.createElement(
    'div',
    {
      className: 'dsh-ct-think-root',
      'data-variant': 'think',
      'data-state': running ? 'running' : 'ok',
      'data-expanded': expanded || void 0,
      'data-preview': preview || void 0,
    },
    running && React.createElement('span', { className: 'dsh-ct-visually-hidden' }, t('row.running')),
    React.createElement(
      DisclosureRow,
      {
        rowClassName: 'dsh-ct-think-row',
        leadingClassName: 'dsh-ct-think-leading',
        titleClassName: 'dsh-ct-think-title',
        chevronClassName: 'dsh-ct-think-chevron',
        icon: thinkIcon(),
        title: t('message.think'),
        open: expanded,
        expandable: true,
        expandOnRowClick: true,
        onToggle: toggle,
        collapsedContent,
      },
      content
    )
  );
});

// ---- 正文块：左缘之外的两样东西承载交互，正文本身只做选中/复制 ----

interface ProseBlockProps {
  text: string;
  /** 成功落定的中文源文本（仅 mark='translated' 时作为渲染源）。 */
  translated: string | null;
  /** 左缘标记状态，单点算自 row-plan；类名与左缘动作全由它决定。 */
  mark: ProseMark;
  /** 成功块当前是否读原文：只是同一份结果上的显示源选择，切换标记不变。 */
  showingOriginal: boolean;
  /** 仅 mark='failed' 时非 null：悬停文案的技术细节（通道伤一句）。 */
  fail: string | null;
  /** 仅 mark='failed' 时非 null：失败类别，决定悬停与读屏报哪一类原因、怎么救。 */
  failKind: BlockFailKind | null;
  /** 仅这一块被手点补跑时为 true：↻ 原地转圈、暂不可重复点。 */
  retryBusy: boolean;
  onToggle: () => void;
  onRetry: () => void;
  streaming: boolean;
  labels: MarkdownLabels;
  mentions: MarkdownFileMentions | undefined;
  pathImages: MarkdownPathImages;
}

/**
 * 正文块的现状：正文排版与宿主默认逐字一致（无缩进、无线），左缘之外各有一段
 * 可点区域——
 *
 * - 成功块：一条透明窄带（`.dsh-ct-hotspot`，宽 10px），完全落在正文左侧，用来
 *   在译文与原文之间切换；鼠标停在它上面时**在光标右边**出气泡（`.dsh-ct-hint`，
 *   跟光标走），报出此刻能做的那个动作。窄带用原生 `button` 而不是 ui-primitives
 *   的 Button：它没有自己的外形（完全透明、无 hover 背景、无 focus 框），任何可见
 *   控件的外观都会破坏「正文排版原生」这条规则；`button` 只借用它的可聚焦与键盘
 *   语义。窄带里不挂任何东西——气泡是它旁边一条独立的浮层，不是它的孩子。
 * - 失败块：一个真 ↻ 按钮（`.dsh-ct-retry`），浮在正文左侧的空隙里，点它只重发
 *   这一块。失败段不放窄带——一段落只对应一个动作，避免两种点击目标叠在同一小片
 *   地方。补跑在途时它原位转圈、光标不再承诺可点。
 *
 * 正文整块不是点击目标：单击落字、拖选复制都不会误触切换。
 */
function ProseBlock({
  text,
  translated,
  mark,
  showingOriginal,
  fail,
  failKind,
  retryBusy,
  onToggle,
  onRetry,
  streaming,
  labels,
  mentions,
  pathImages,
}: ProseBlockProps): ReactElement {
  const action = proseAction(mark);
  const source = mark === 'translated' && !showingOriginal ? (translated as string) : text;
  const copy = rowCopy();
  const className = proseClassNames(mark) ?? PROSE_BASE_CLASS;
  const hintRef = useRef<HTMLSpanElement | null>(null);

  /**
   * 把气泡挪到光标右边并显形——只在鼠标位于透明带**上**时生效（事件就挂在带上，
   * 见 {@link hotspotButton}）。气泡不经过 React 状态：直接写它的内联样式，
   * 鼠标划过一段正文不会重渲染 markdown。
   *
   * @param event - 窄带上的鼠标事件；只读它的 clientX / clientY。
   */
  const showHint = (event: { clientX: number; clientY: number }): void => {
    const bubble = hintRef.current;
    if (bubble === null) return;
    placeHintBubble(bubble, event, { width: window.innerWidth, height: window.innerHeight });
  };

  /** 鼠标离开透明带：收起气泡（元素留在原地，下次悬停直接复用）。 */
  const hideHint = (): void => {
    hideHintBubble(hintRef.current);
  };

  // 成功块才放窄带：没有结果的块（没送过模型、开关关闭、通道没配好、空白块、
  // 还在等结果的块）没有可切换的东西；失败块由 ↻ 承担唯一动作。
  //
  // 窄带自己没有孩子：它的点击判定就靠「click 的 target 就是它」（见 click-guard.ts）。
  // 悬停气泡是它旁边一条独立的浮层，鼠标事件都归窄带自己。
  const hotspotButton =
    action !== 'toggle'
      ? null
      : React.createElement('button', {
          type: 'button',
          className: HOTSPOT_CLASS,
          // 窄带是覆盖层，读屏只应听到它的动作，正文仍由 MarkdownText 读。
          'aria-label': showingOriginal ? copy.toggleToTranslatedAria : copy.toggleToOriginalAria,
          tabIndex: 0,
          // 光标跟踪只挂在带上：鼠标移到正文上不动气泡，气泡也就一直收着——悬停
          // 提示只在鼠标真的停在这条透明带上时才出现。
          onMouseEnter: (event: React.MouseEvent<HTMLButtonElement>) => showHint(event),
          onMouseMove: (event: React.MouseEvent<HTMLButtonElement>) => showHint(event),
          onMouseLeave: hideHint,
          // button 自己会按 Enter/Space 合成 click，若不接管就会与这段键盘处理
          // 叠加成两次动作：这里两个键都走 keydown 并 preventDefault，合成被掐掉。
          onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            onToggle();
          },
          onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
            if (
              isCleanHotspotClick(
                { target: event.target as unknown, currentTarget: event.currentTarget as unknown },
                typeof window === 'undefined' ? undefined : window
              )
            ) {
              onToggle();
            }
          },
        });

  // 气泡投到 body 下：正文块有自己的叠层与裁剪，浮层留在里面会被它们困住。文案
  // 就是此刻能做的那个动作，切到原文后同一处气泡改口成「查看译文」。它是纯装饰，
  // 读屏忽略——窄带自己的 aria-label 已经说了同一句。
  const hint =
    action !== 'toggle'
      ? null
      : createPortal(
          React.createElement(
            'span',
            { ref: hintRef, className: HINT_BUBBLE_CLASS, 'aria-hidden': true },
            showingOriginal ? copy.hotspotShowTranslation : copy.hotspotShowOriginal
          ),
          document.body
        );

  // ↻ 是真按钮：失败段唯一的点击目标，也可能被键盘聚焦。在途时它原位转圈并
  // 停止响应（data-busy 由样式层翻成「不转手型」+ 图标旋转），但**元素不换**——
  // 键盘焦点因此不会掉回 body。Tooltip 挂在它上面报败因：这个按钮只在失败段存在，
  // 补跑期间也一直挂着（元素不换 = 气泡锚点不重挂载）。
  const retryButton = React.createElement(
    'button',
    {
      type: 'button',
      className: RETRY_CLASS,
      // 败因进按钮自己的读屏标签：气泡只在 openOnClick 时才挂 aria-describedby，
      // 读屏用户不悬停，标签是他们唯一能听到「超时 / 断流 / 空返回」，或者听到
      // 「设置还没配好、要去哪儿改」的地方。
      'aria-label': retryBusy ? copy.retryBusyAria(fail, failKind) : copy.retryAria(fail, failKind),
      ...(retryBusy ? { [RETRY_BUSY_ATTR]: 'true' } : {}),
      ...(failKind === 'not-configured' ? { [RETRY_UNCONFIGURED_ATTR]: 'true' } : {}),
      tabIndex: 0,
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (!retryBusy) onRetry();
      },
      onClick: retryBusy
        ? void 0
        : () => {
            onRetry();
          },
    },
    React.createElement(
      'span',
      { className: RETRY_SPIN_CLASS, 'aria-hidden': true },
      React.createElement(IconRefreshOutlineRegular, { size: 10 })
    )
  );

  // ↻ 只在失败段存在，且它是那一段**唯一**的可点物；补跑在途时它原位转圈、暂不
  // 响应。Tooltip 挂在按钮自己身上报败因：只要这一段还是失败态，气泡锚点就不换。
  const retry =
    action !== 'retry'
      ? null
      : React.createElement(Tooltip, {
          label: () => copy.failTitle(failKind, fail),
          side: 'top',
          portal: true,
          children: retryButton as Parameters<typeof Tooltip>[0]['children'],
        });

  return React.createElement(
    'div',
    { className },
    retry,
    hotspotButton,
    hint,
    React.createElement(MarkdownText, {
      text: source,
      streaming,
      labels,
      fileMentions: mentions,
      pathImages,
    })
  );
}

// ---- 助手行本体 ----

export const AssistantStepView = memo(function AssistantStepView(props: AssistantStepProps): ReactElement | null {
  ensureAssistantStyles();
  const { store, node, groupPart, useDisclosure, useTurnData, turnProcess, openFile, renderMessageImages, fileMentions, usePresentation, t } = props;
  const data = node.data;
  const streaming = data.status === 'running';
  const interrupted = data.status === 'interrupted';
  const translate = store ?? chatTranslate;
  const subscribeStore = useCallback(
    (listener: () => void): (() => void) => translate.subscribe(listener),
    [translate]
  );

  // 只读**已保存**的值：页面上还没点保存的草稿不影响正在看的这一行。
  const enabled = useSyncExternalStore(subscribeSettings, () => settingsStore.getState().committed.enabled);
  const aiConfigured = useSyncExternalStore(
    subscribeSettings,
    () => settingsStore.getState().committed.aiConfigured
  );
  useSyncExternalStore(subscribeStore, () => translate.getVersion());

  const channel: ChannelState = !enabled ? 'off' : aiConfigured ? 'ready' : 'unconfigured';
  const rowKey = `a${node.anchorSeq ?? `t${data.turn}:s${data.step}`}`;

  const labels = useMemo(() => markdownLabels(t), [t]);
  const pathImages = useMemo<MarkdownPathImages>(
    () => ({ resolve: (value: string) => localPathMediaUrl(document.baseURI, value) }),
    []
  );

  // mentions 的 owner 判定与宿主逐行等价：封闭 Turn 的收尾消息才有文件提及词表。
  const turn = node.location?.kind === 'turn' || node.location?.kind === 'step' ? node.location.turn : undefined;
  const tail = useTurnData('turn-tail') as
    | { closing?: { finalNode?: { seq: number } } }
    | undefined;
  const owner = useMemo(() => {
    if (turn?.status !== 'closed' || data.finalNode === void 0) return void 0;
    if (tail?.closing?.finalNode?.seq !== data.finalNode.seq) return void 0;
    return { turn, seq: data.finalNode.seq, openFile };
  }, [data.finalNode, openFile, tail, turn]);
  const mentions = useMemo(() => (owner === void 0 ? void 0 : fileMentions(owner)), [fileMentions, owner]);

  // 计划层给出文本清单与渲染分支；行渲染先于挂载，池按当前文本登记。
  const blocks = useMemo(() => data.blocks ?? [], [data.blocks]);

  // 结论步骤的正文一律不译：这一行把结论交给读者，通常已经是写好的中文，再送一遍
  // 只换来等待与改坏的风险。判据集中在 conclusion.ts——宿主给的 answerStep 优先，
  // 流式期间它还是 null，那里按「后面还有没有 step」与「有没有 tool-call」从严判断。
  const turnSteps = turn?.steps?.map((entry) => entry.step);
  const conclusion = isConclusionRow({
    status: data.status,
    step: data.step,
    blocks,
    answerStep: turnProcess?.spec.answerStep,
    turnSteps,
  });

  const plan = useMemo(
    () =>
      planAssistantRow({
        blocks,
        streaming,
        interrupted,
        groupPart,
        channel,
        outcomes: undefined,
        conclusion,
      }),
    [blocks, streaming, interrupted, groupPart, channel, conclusion]
  );

  // 已经写完的块数：正文只往后追加，所以流式期间除了正在长的尾块，前面每一块的
  // 内容都不会再变——「写定」就是它们的送译许可，不必等整段回答结束。
  const frozenCount = useMemo(
    () => (streaming ? growingTailIndex(blocks, groupPart, { conclusion }) : plan.texts.length),
    [blocks, groupPart, conclusion, plan.texts.length, streaming]
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const canTranslate = channel === 'ready';
  const inView = useSettledInView(rootRef, canTranslate && plan.entries !== null && frozenCount > 0);

  useEffect(() => {
    // 一冻结就送：进入视口后这一行的首跑（或下一批首跑）即刻发出，不等落定。
    if (!canTranslate || !inView || plan.entries === null || frozenCount === 0) return;
    translate.ensure(rowKey, plan.texts, { frozen: frozenCount });
  }, [canTranslate, inView, rowKey, plan, frozenCount, translate]);

  const [originalKeys, setOriginalKeys] = useState<ReadonlySet<number>>(() => new Set());

  // 只认同代登记：rowKey 是会话内锚点，跨会话可能重号——texts 逐位相等才把
  // 旧 outcomes 挂上来，换代的那一帧（含换会话撞键）按「未登记」渲染——纯原文、
  // 左缘不出现任何东西，随后 ensure 重新登记。
  const registered = translate.getState(rowKey);
  const rowState = registered !== undefined && sameTexts(registered.texts, plan.texts) ? registered : undefined;
  const displayed = useMemo(
    () =>
      planAssistantRow({
        blocks,
        streaming,
        interrupted,
        groupPart,
        channel,
        outcomes: rowState?.outcomes,
        frozen: rowState?.settledThrough ?? frozenCount,
        retrying: rowState?.retrying,
        originalKeys,
        conclusion,
      }),
    [blocks, streaming, interrupted, groupPart, channel, rowState, frozenCount, originalKeys, conclusion]
  );

  const reasoningHidden =
    turnProcess !== void 0 &&
    turnProcess.foldable &&
    turnProcess.spec.answerStep === data.step &&
    turnProcess.spec.inlineReasoning &&
    !turnProcess.open;
  const revealProcess = useCallback(() => {
    turnProcess?.setOpen(true);
  }, [turnProcess]);

  const toggleBlock = useCallback((key: number) => {
    setOriginalKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // 手动补跑：点失败块的 ↻ 只重发**失败的那些块**（无限次、不设额度）；已经
  // 成功的块原地不动、连请求都不再发。在途的块再点是空操作——↻ 自己转着圈
  // 就是「已在跑」的答复。
  const retryBlock = useCallback(() => {
    const failed: number[] = [];
    const outcomes = rowState?.outcomes;
    if (outcomes === undefined) return;
    for (let index = 0; index < outcomes.length; index++) {
      const outcome = outcomes[index];
      if (outcome !== null && outcome !== undefined && !outcome.ok) failed.push(index);
    }
    if (failed.length === 0) return;
    translate.ensure(rowKey, plan.texts, { frozen: frozenCount, retries: failed });
  }, [frozenCount, plan, rowKey, rowState, translate]);

  // 早退在所有 hook 之后：行形态在 null 与可见之间切换时 hook 序列不变。
  if (displayed.entries === null) return null;

  const last = blocks.length - 1;
  const rendered: ReactNode[] = [];
  for (const entry of displayed.entries) {
    switch (entry.type) {
      case 'prose':
        rendered.push(
          React.createElement(ProseBlock, {
            key: entry.key,
            text: entry.text,
            translated: entry.translated,
            mark: entry.mark,
            showingOriginal: entry.showingOriginal,
            fail: entry.fail,
            failKind: entry.failKind,
            retryBusy: entry.retryBusy,
            onToggle: () => toggleBlock(entry.key),
            onRetry: retryBlock,
            streaming,
            labels,
            mentions,
            pathImages,
          })
        );
        break;
      case 'reasoning':
        rendered.push(
          React.createElement(
            ProcessReasoning,
            {
              key: entry.key,
              hidden: reasoningHidden,
              reveal: revealProcess,
              children: React.createElement(ReasoningRow, {
                text: entry.text,
                running: streaming && entry.blockIndex === last,
                usePresentation,
                useDisclosure,
                t,
              }),
            }
          )
        );
        break;
      case 'images':
        rendered.push(
          React.createElement(React.Fragment, {
            key: entry.key,
          }, renderMessageImages({ images: entry.attachments.map((attachment) => ({ attachment })), align: 'start' }))
        );
        break;
      case 'unknown':
        rendered.push(
          React.createElement(JsonBlock, {
            key: entry.key,
            label: t('message.unknownBlock'),
            payload: entry.block,
            truncatedLabel: (total: number) => t('json.truncated', { total }),
          })
        );
        break;
      case 'stopped':
        rendered.push(React.createElement('span', { key: entry.key, className: 'dsh-ct-stopped' }, t('message.stopped')));
        break;
    }
  }

  return React.createElement(
    'div',
    { ref: rootRef, className: 'dsh-ct-root', 'data-streaming': streaming || void 0 },
    React.createElement('div', { className: 'dsh-ct-body' }, rendered)
  );
});

function ProcessReasoning(props: {
  hidden: boolean;
  reveal: () => void;
  children: ReactNode;
}): ReactElement {
  const ref = useSearchableHidden(props.hidden, props.reveal);
  return React.createElement(
    'div',
    { ref, 'data-turn-process-inline': props.hidden || void 0 },
    props.children
  );
}
