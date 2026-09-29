/**
 * 助手行渲染器：经 keyed slot `conversation.chat.node`（key `assistant-step`）
 * 替换宿主默认的行渲染。
 *
 * 接管换来两件事——
 * 1. 正文块从数据层拿**原始 markdown**（`AssistantBlock.text`），译文同样按
 *    markdown 交给宿主公开基线组件 `MarkdownText` 重渲染：格式保真由官方
 *    渲染器负责，本文件不产生任何自拼 markup。
 * 2. 「已翻译/没译成」是渲染状态：落定、开关开启、进入视口后逐行首跑；成功
 *    的块（包括模型认为原样最好的块）挂译文、左缘蓝线、点击在译文与原文间
 *    切换；失败的块保持原文、左缘挂红线（实线=传输失败、虚线=内容拒收），
 *    整块可点=手动整行补跑，无限次、无自动重试；已登记在途而尚无结果的块
 *    显灰脉动。
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
import { planAssistantRow } from './row-plan.ts';
import { isBareBlockClick } from './click-guard.ts';
import { rowCopy } from '../locales.ts';
import type { AssistantBlockLike } from './row-plan.ts';
import type { ProseMark } from './styles.ts';
import { ensureAssistantStyles, proseAction, proseClassNames } from './styles.ts';
import { chatTranslate, sameTexts } from './translate-store.ts';

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
  readonly status: string;
  readonly turn: number;
  readonly step: number;
  readonly blocks: readonly AssistantBlockLike[];
  readonly finalNode?: { readonly seq: number };
}

interface TurnProcessLike {
  readonly foldable: boolean;
  readonly open: boolean;
  readonly spec: { readonly answerStep: number; readonly inlineReasoning: boolean };
  readonly setOpen: (open: boolean) => void;
}

export interface AssistantStepProps {
  readonly node: {
    readonly data: NodeDataLike;
    readonly location?: { readonly kind?: string; readonly turn?: { readonly status?: string } };
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
const NOOP = (): void => {};

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
const subscribeTranslate = (listener: () => void): (() => void) => chatTranslate.subscribe(listener);

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

// ---- 正文块：译文/原文切换与失败重试共用一个壳 ----

interface ProseBlockProps {
  text: string;
  /** 成功落定的中文源文本（仅 mark='translated' 时作为渲染源）。 */
  translated: string | null;
  /** 左缘线状态，单点算自 row-plan；可点性、重试指引、脉动全由它决定。 */
  mark: ProseMark;
  onToggle: () => void;
  onRetry: () => void;
  streaming: boolean;
  labels: MarkdownLabels;
  mentions: MarkdownFileMentions | undefined;
  pathImages: MarkdownPathImages;
}

/**
 * 点击判定：落在块内交互元素（链接、代码块复制钮等）上的点击归那个元素，
 * 不连带切块/重试；拖选译文松手产生的 click 同样忽略。
 */
function blockClick(event: React.MouseEvent<HTMLDivElement>, action: () => void): void {
  const guardEvent = {
    target: event.target as { closest?(selector: string): unknown } | null,
    currentTarget: event.currentTarget,
  };
  if (isBareBlockClick(guardEvent, typeof window === 'undefined' ? undefined : window)) action();
}

function ProseBlock({
  text,
  translated,
  mark,
  onToggle,
  onRetry,
  streaming,
  labels,
  mentions,
  pathImages,
}: ProseBlockProps): ReactElement {
  const action = proseAction(mark);
  const clickable = action !== null;
  const retrying = action === 'retry';
  const handler = retrying ? onRetry : onToggle;
  const source = mark === 'translated' ? (translated as string) : text;
  const copy = rowCopy();
  const block = React.createElement(
    'div',
    {
      className: proseClassNames(mark),
      'data-translated': mark === 'translated' ? 'true' : void 0,
      // 容器内含链接等交互内容，不套 role=button（非法嵌套）；可聚焦 + 键盘
      // Enter/Space 即切换/重试，满足官方「键盘可达」门。在途块也保持可聚焦
      // （Enter 空操作）——补跑把红线折成脉动时，键盘焦点不致从行上掉回 body。
      tabIndex: clickable || mark === 'inflight' ? 0 : void 0,
      onClick: clickable ? (event: React.MouseEvent<HTMLDivElement>) => blockClick(event, handler) : void 0,
      onKeyDown: clickable
        ? (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handler();
            }
          }
        : void 0,
    },
    retrying &&
      React.createElement(
        'span',
        { className: 'dsh-ct-retry', 'aria-hidden': true },
        React.createElement(IconRefreshOutlineRegular, { size: 10 })
      ),
    retrying && React.createElement('span', { className: 'dsh-ct-visually-hidden' }, copy.retryAria),
    React.createElement(MarkdownText, {
      text: source,
      streaming,
      labels,
      fileMentions: mentions,
      pathImages,
    })
  );
  if (!retrying) return block;
  // Tooltip 锚在失败块本身：正文任意处悬停、键盘聚焦都即刻出泡——锚在那条
  // 10px 装饰图标上则两个通道都够不着（图标 aria-hidden、从不接收焦点）。
  return React.createElement(Tooltip, {
    label: () => copy.retryTip,
    side: 'right',
    portal: true,
    children: block as Parameters<typeof Tooltip>[0]['children'],
  });
}

// ---- 助手行本体 ----

export const AssistantStepView = memo(function AssistantStepView(props: AssistantStepProps): ReactElement | null {
  ensureAssistantStyles();
  const { node, groupPart, useDisclosure, useTurnData, turnProcess, openFile, renderMessageImages, fileMentions, usePresentation, t } = props;
  const data = node.data;
  const streaming = data.status === 'running';
  const interrupted = data.status === 'interrupted';

  const enabled = useSyncExternalStore(subscribeSettings, () => settingsStore.getState().enabled);
  const aiConfigured = useSyncExternalStore(subscribeSettings, () => settingsStore.getState().aiConfigured);
  useSyncExternalStore(subscribeTranslate, () => chatTranslate.getVersion());

  const canTranslate = enabled && aiConfigured;
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
  const plan = useMemo(
    () =>
      planAssistantRow({
        blocks,
        streaming,
        interrupted,
        groupPart,
        canTranslate,
        outcomes: undefined,
      }),
    [blocks, streaming, interrupted, groupPart, canTranslate]
  );

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inView = useSettledInView(rootRef, !streaming && canTranslate && plan.entries !== null && plan.texts.length > 0);

  useEffect(() => {
    if (streaming || !canTranslate || !inView || plan.entries === null || plan.texts.length === 0) return;
    chatTranslate.ensure(rowKey, plan.texts);
  }, [streaming, canTranslate, inView, rowKey, plan]);

  const [originalKeys, setOriginalKeys] = useState<ReadonlySet<number>>(() => new Set());

  // 只认同代登记：rowKey 是会话内锚点，跨会话可能重号——texts 逐位相等才把
  // 旧 outcomes 挂上来，换代的那一帧（含换会话撞键）按「未登记」渲染，纯原文
  // 无线无脉动，随后 ensure 重新登记。
  const registered = chatTranslate.getState(rowKey);
  const rowState = registered !== undefined && sameTexts(registered.texts, plan.texts) ? registered : undefined;
  const displayed = useMemo(
    () =>
      planAssistantRow({
        blocks,
        streaming,
        interrupted,
        groupPart,
        canTranslate,
        outcomes: rowState?.outcomes,
        rowStatus: rowState?.status,
        originalKeys,
      }),
    [blocks, streaming, interrupted, groupPart, canTranslate, rowState, originalKeys]
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

  // 手动补跑：点任一红线块 = 整行重发（无限次、不设额度）；在途再点是空
  // 操作——store 的 pending 短路让它是安全的，灰脉动本身就是「已在跑」的答复。
  const retryRow = useCallback(() => {
    chatTranslate.ensure(rowKey, plan.texts, true);
  }, [rowKey, plan]);

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
            onToggle: () => toggleBlock(entry.key),
            onRetry: retryRow,
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
