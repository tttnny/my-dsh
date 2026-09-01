/**
 * Visual user-turn and model-call explorer backed by the Workflow-owned
 * projection (plain-JS port; icons/JsonTree/Modal from dsh-client-ui-primitives).
 */

// ---------------------------------------------------------------------------
// Class-name map (plain CSS classes, no modules).
// ---------------------------------------------------------------------------

const css = {
  root: 'dshaw-root',
  summary: 'dshaw-summary',
  summaryTitle: 'dshaw-summaryTitle',
  metrics: 'dshaw-metrics',
  metric: 'dshaw-metric',
  workspace: 'dshaw-workspace',
  turns: 'dshaw-turns',
  turnList: 'dshaw-turnList',
  turnItem: 'dshaw-turnItem',
  turnItemSelected: 'dshaw-turnItemSelected',
  turnTopline: 'dshaw-turnTopline',
  turnBottomline: 'dshaw-turnBottomline',
  status: 'dshaw-status',
  statusComplete: 'dshaw-status_complete',
  statusError: 'dshaw-status_error',
  statusRunning: 'dshaw-status_running',
  statusWaiting: 'dshaw-status_waiting',
  loadOlder: 'dshaw-loadOlder',
  main: 'dshaw-main',
  turnHeader: 'dshaw-turnHeader',
  callScroller: 'dshaw-callScroller',
  virtualBody: 'dshaw-virtualBody',
  virtualRow: 'dshaw-virtualRow',
  callRow: 'dshaw-callRow',
  callHeader: 'dshaw-callHeader',
  tokenMetric: 'dshaw-tokenMetric',
  flow: 'dshaw-flow',
  flowCard: 'dshaw-flowCard',
  flowCardSelected: 'dshaw-flowCardSelected',
  requestCard: 'dshaw-requestCard',
  responseCard: 'dshaw-responseCard',
  toolCard: 'dshaw-toolCard',
  toolCardError: 'dshaw-toolCardError',
  cardHeader: 'dshaw-cardHeader',
  cardTitle: 'dshaw-cardTitle',
  cardBody: 'dshaw-cardBody',
  cardPreview: 'dshaw-cardPreview',
  chips: 'dshaw-chips',
  arrow: 'dshaw-arrow',
  toolFlow: 'dshaw-toolFlow',
  toolResult: 'dshaw-toolResult',
  toolResultRunning: 'dshaw-toolResultRunning',
  toolResultComplete: 'dshaw-toolResultComplete',
  toolResultError: 'dshaw-toolResultError',
  finalReply: 'dshaw-finalReply',
  detailPanel: 'dshaw-detailPanel',
  detailGrid: 'dshaw-detailGrid',
  detailCode: 'dshaw-detailCode',
  jsonInspector: 'dshaw-jsonInspector',
  jsonToolbar: 'dshaw-jsonToolbar',
  jsonLanguage: 'dshaw-jsonLanguage',
  jsonActions: 'dshaw-jsonActions',
  jsonAction: 'dshaw-jsonAction',
  jsonViewport: 'dshaw-jsonViewport',
  jsonTree: 'dshaw-jsonTree',
  jsonDialog: 'dshaw-jsonDialog',
  jsonDialogHeader: 'dshaw-jsonDialogHeader',
  jsonDialogBody: 'dshaw-jsonDialogBody',
  empty: 'dshaw-empty',
};

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function formatTime(value) {
  return value === null || !Number.isFinite(value) ? '—' : TIME_FORMAT.format(new Date(value));
}

function formatDuration(value) {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}s`;
  const minutes = Math.floor(value / 60000);
  const seconds = Math.round(value % 60000 / 1000);
  return `${minutes}m${seconds}s`;
}

function concise(value, fallback) {
  const text = value !== undefined ? value.replace(/\s+/g, ' ').trim() : '';
  return text === '' ? fallback : text;
}

function stringify(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusLabel(status, t) {
  switch (status) {
    case 'waiting': return t('workflow.status.waiting');
    case 'running': return t('workflow.status.running');
    case 'complete': return t('workflow.status.complete');
    case 'error': return t('workflow.status.error');
  }
}

function StatusIcon({ status }) {
  if (status === 'complete') return jsx(IconCheckOutline16, { size: 14, 'aria-hidden': true });
  if (status === 'error') return jsx(IconWarningOutline16, { size: 14, 'aria-hidden': true });
  if (status === 'running') return jsx(IconLoadingOutline16, { size: 14, 'aria-hidden': true });
  return jsx(IconQueueOutline14, { size: 14, 'aria-hidden': true });
}

function Status({ status, t }) {
  return jsx('span', {
    className: [
      css.status,
      status === 'complete' ? css.statusComplete
        : status === 'error' ? css.statusError
          : status === 'running' ? css.statusRunning : css.statusWaiting,
    ].join(' '),
    children: [
      jsx(StatusIcon, { status }),
      statusLabel(status, t),
    ],
  });
}

function Metric({ value, label }) {
  return jsx('span', {
    className: css.metric,
    children: [
      jsx('strong', { children: value }),
      jsx('span', { children: label }),
    ],
  });
}

function turnTitle(turn, t) {
  return t('workflow.turnTitle', {
    turn: String(turn.turn),
    prompt: turn.promptPreview,
  });
}

function TurnItem({ turn, selected, onSelect, t }) {
  return jsx('button', {
    type: 'button',
    className: `${css.turnItem} ${selected ? css.turnItemSelected : ''}`,
    'aria-current': selected ? 'true' : undefined,
    onClick: onSelect,
    title: turn.prompt,
    children: [
      jsx('span', {
        className: css.turnTopline,
        children: [
          jsx('strong', { children: turnTitle(turn, t) }),
          jsx('time', { children: formatTime(turn.startedAt) }),
        ],
      }),
      jsx('span', {
        className: css.turnBottomline,
        children: [
          jsx('span', {
            children: `${turn.calls.length}${t('workflow.calls.suffix')} · ${turn.toolCount}${t('workflow.tools.suffix')}`,
          }),
          jsx(Status, { status: turn.status, t }),
        ],
      }),
    ],
  });
}

function detailKey(target) {
  return target.kind === 'tool' ? `${target.key}:tool:${target.tool}` : `${target.key}:${target.kind}`;
}

function FlowArrow() {
  return jsx(IconChevronRightOutline14, { className: css.arrow, size: 18, 'aria-hidden': true });
}

function CardButton({ className, target, selected, onSelect, children, label }) {
  return jsx('button', {
    type: 'button',
    className: `${css.flowCard} ${className ?? ''} ${selected ? css.flowCardSelected : ''}`,
    'aria-label': label,
    'aria-expanded': selected,
    onClick: () => { onSelect(target); },
    children,
  });
}

function RequestCard({ call, selected, onSelect, t }) {
  const request = call.request;
  const model = request !== undefined
    ? (request.requestConfig !== undefined && request.requestConfig.model !== undefined
      ? request.requestConfig.model
      : request.provenance !== undefined ? request.provenance.model : undefined)
    : undefined;
  const systemCount = request !== undefined
    && request.prompt !== undefined
    && request.prompt.system !== undefined
    && request.prompt.system.trim() !== '' ? 1 : 0;
  const messageCount = call.messages.length;
  const tools = request !== undefined && request.prompt !== undefined
    ? request.prompt.tools !== undefined ? request.prompt.tools.length : 0
    : 0;
  return jsx(CardButton, {
    className: css.requestCard,
    target: { kind: 'request', key: call.id },
    selected,
    onSelect,
    label: `${t('workflow.request')} ${call.number}`,
    children: [
      jsx('span', {
        className: css.cardHeader,
        children: jsx('span', {
          className: css.cardTitle,
          children: [
            jsx(IconSendOutline16, { size: 14, 'aria-hidden': true }),
            t('workflow.request'),
          ],
        }),
      }),
      jsx('span', {
        className: css.cardBody,
        children: [
          jsx('span', { className: css.cardPreview, children: model ?? t('workflow.request.context') }),
          jsx('span', {
            className: css.chips,
            children: [
              jsx('span', { children: `${t('workflow.system')} ${systemCount}` }),
              jsx('span', { children: `${t('workflow.messages')} ${messageCount}` }),
              jsx('span', { children: `${t('workflow.toolDefinitions')} ${tools}` }),
            ],
          }),
        ],
      }),
    ],
  });
}

function ResponseCard({ call, selected, onSelect, t }) {
  const response = call.response;
  const toolCalls = response !== undefined
    && response.sourceBlocks !== undefined
    ? response.sourceBlocks.filter(block => block.type === 'tool-call').length
    : call.tools.length;
  return jsx(CardButton, {
    className: css.responseCard,
    target: { kind: 'response', key: call.id },
    selected,
    onSelect,
    label: `${t('workflow.response')} ${call.number}`,
    children: [
      jsx('span', {
        className: css.cardHeader,
        children: jsx('span', {
          className: css.cardTitle,
          children: [
            jsx(IconSparkle16, { size: 14, 'aria-hidden': true }),
            t('workflow.response'),
          ],
        }),
      }),
      jsx('span', {
        className: css.cardBody,
        children: [
          jsx('span', {
            className: css.cardPreview,
            children: response === undefined
              ? t('workflow.response.pending')
              : concise(response.previewMarkdown ?? response.text, t('workflow.response.toolOnly')),
          }),
          jsx('span', {
            className: css.chips,
            children: [
              jsx('span', {
                children: `${t('workflow.reasoning')} ${response !== undefined && response.thinkingDetail !== undefined ? 1 : 0}`,
              }),
              jsx('span', {
                children: `${t('workflow.content')} ${response !== undefined && response.outputDetail !== undefined ? 1 : 0}`,
              }),
              jsx('span', { children: `${t('workflow.toolCalls')} ${toolCalls}` }),
            ],
          }),
        ],
      }),
    ],
  });
}

/**
 * Render the accessible status strip for one tool result.
 * @param props - Resolved status, visible label, and formatted duration.
 * @returns The live tool-result status strip.
 */
function WorkflowToolResult({ status, label, duration }) {
  const resultClass = status === 'error'
    ? css.toolResultError
    : status === 'complete' ? css.toolResultComplete : css.toolResultRunning;
  return jsx('span', {
    className: `${css.toolResult} ${resultClass}`,
    'data-tool-status': status,
    'aria-live': 'polite',
    children: [
      status === 'error'
        ? jsx(IconWarningOutline16, { size: 14, 'aria-hidden': true })
        : status === 'complete'
          ? jsx(IconCheckOutline16, { size: 14, 'aria-hidden': true })
          : jsx(IconLoadingOutline16, { size: 14, 'aria-hidden': true }),
      jsx('span', { children: label }),
      jsx('time', { children: duration }),
    ],
  });
}

function ToolCard({ call, tool, index, selected, onSelect, t }) {
  const settled = tool.outputDetail !== undefined
    || tool.result !== undefined
    || tool.resultPreviewMarkdown !== undefined;
  const status = tool.isError === true ? 'error' : settled ? 'complete' : 'running';
  const resultLabel = status === 'error'
    ? t('workflow.status.error')
    : status === 'complete'
      ? concise(tool.resultPreviewMarkdown ?? tool.result, t('workflow.tool.complete'))
      : t('workflow.status.running');
  return jsx(CardButton, {
    className: tool.isError === true ? css.toolCardError : css.toolCard,
    target: { kind: 'tool', key: call.id, tool: index },
    selected,
    onSelect,
    label: `${t('workflow.tool')} ${tool.text || tool.callId || index + 1}`,
    children: [
      jsx('span', {
        className: css.cardHeader,
        children: jsx('span', {
          className: css.cardTitle,
          children: [
            jsx(IconCodeOutline16, { size: 14, 'aria-hidden': true }),
            tool.text || t('workflow.tool'),
          ],
        }),
      }),
      jsx('span', {
        className: css.cardBody,
        children: [
          jsx('span', {
            className: css.cardPreview,
            children: concise(tool.previewMarkdown, tool.callId ?? t('workflow.tool.call')),
          }),
          jsx(WorkflowToolResult, {
            status,
            label: resultLabel,
            duration: formatDuration(tool.timeSeconds === null ? null : tool.timeSeconds * 1000),
          }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// JSON inspector (primitives JsonTree + Modal instead of react-json-view-lite).
// ---------------------------------------------------------------------------

function WorkflowJsonInspector({ data, label, t }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const expandButton = useRef(null);
  const dialogTitle = t('workflow.json.dialog', { label });
  const closeDialog = () => {
    setDialogOpen(false);
    window.setTimeout(() => { if (expandButton.current !== null) expandButton.current.focus(); }, 0);
  };
  const tree = (className) => jsx(JsonTree, {
    data,
    label: dialogTitle,
    className: `${css.jsonTree} ${className ?? ''}`.trim(),
    copyable: true,
    expandTopLevel: false,
  });
  return jsxs(Fragment, {
    children: [
      jsx('div', {
        className: css.jsonInspector,
        'data-workflow-scroll-region': '',
        children: [
          jsx('div', {
            className: css.jsonToolbar,
            children: [
              jsx('span', {
                className: css.jsonLanguage,
                children: [
                  jsx(IconDataOutline16, { size: 13, 'aria-hidden': true }),
                  'JSON',
                ],
              }),
              jsx('div', {
                className: css.jsonActions,
                children: jsx('button', {
                  ref: expandButton,
                  type: 'button',
                  className: css.jsonAction,
                  onClick: () => { setDialogOpen(true); },
                  'aria-label': t('workflow.json.expand'),
                  title: t('workflow.json.expand'),
                  children: jsx(IconFullscreenOutline16, { size: 14, 'aria-hidden': true }),
                }),
              }),
            ],
          }),
          jsx('div', { className: css.jsonViewport, children: tree('') }),
        ],
      }),
      jsx(Modal, {
        open: dialogOpen,
        onClose: closeDialog,
        title: dialogTitle,
        closeLabel: t('workflow.json.close'),
        className: css.jsonDialog,
        headless: true,
        children: [
          jsx('header', {
            className: css.jsonDialogHeader,
            children: [
              jsx('strong', {
                children: [
                  jsx(IconDataOutline16, { size: 16, 'aria-hidden': true }),
                  dialogTitle,
                ],
              }),
              jsx('div', {
                className: css.jsonActions,
                children: jsx('button', {
                  type: 'button',
                  className: css.jsonAction,
                  onClick: closeDialog,
                  'aria-label': t('workflow.json.close'),
                  title: t('workflow.json.close'),
                  autoFocus: true,
                  children: jsx(IconCloseOutline16, { size: 16, 'aria-hidden': true }),
                }),
              }),
            ],
          }),
          jsx('div', {
            className: css.jsonDialogBody,
            'data-workflow-scroll-region': '',
            children: tree(''),
          }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------------------
// Error boundary for DetailPanel — prevents white-screen on render errors.
// ---------------------------------------------------------------------------

class DetailErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    if (typeof console !== 'undefined' && console.error) console.error('[dsh-agent-workflow] DetailPanel error', error, info);
  }
  render() {
    if (this.state.hasError) {
      return jsx('div', {
        className: css.detailPanel,
        role: 'alert',
        children: [
          jsx('header', { children: jsx('strong', { children: this.props.fallbackTitle || 'Details' }) }),
          jsx('div', { className: css.detailGrid, children: jsx('pre', { style: { padding: '12px', whiteSpace: 'pre-wrap' }, children: String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error) }) }),
        ],
      });
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Details panel.
// ---------------------------------------------------------------------------

function jsonSection(label, value) {
  return { label, value: stringify(value), json: true };
}

function treeSection(label, field, value) {
  const tree = { [field]: value };
  return { label, value: stringify(tree), tree };
}

function textSection(label, value) {
  const source = value.trim();
  if (!source.startsWith('{') && !source.startsWith('[')) return { label, value };
  try {
    return { label, value: stringify(JSON.parse(source)), json: true };
  } catch {
    return { label, value };
  }
}

function clampMessages(messages) {
  if (!Array.isArray(messages)) return messages;
  if (messages.length <= 80) return messages;
  return messages.slice(-80);
}

function clampText(value) {
  if (typeof value !== 'string') return value;
  if (value.length <= 20000) return value;
  return value.slice(0, 20000) + '\n… [truncated ' + (value.length - 20000) + ' chars]';
}

function DetailPanel({ call, target, onClose, t }) {
  try {
  let title = t('workflow.request.details');
  let sections = [];
  if (target.kind === 'request') {
    const request = call.request;
    sections = [
      treeSection(t('workflow.systemPrompt'), 'system', request !== undefined && request.prompt !== undefined
        ? request.prompt.system ?? null
        : null),
      treeSection(t('workflow.messages'), 'messages', clampMessages(call.messages)),
      treeSection(t('workflow.toolDefinitions'), 'tools', request !== undefined && request.prompt !== undefined
        ? request.prompt.tools ?? []
        : []),
    ];
  } else if (target.kind === 'response') {
    title = t('workflow.response.details');
    const response = call.response;
    sections = [
      textSection(t('workflow.reasoning'), clampText(response !== undefined && response.thinkingDetail !== undefined
        ? response.thinkingDetail
        : t('workflow.empty'))),
      textSection(t('workflow.content'), clampText(response !== undefined
        ? response.outputDetail !== undefined ? response.outputDetail : response.text ?? t('workflow.empty')
        : t('workflow.empty'))),
      jsonSection(t('workflow.metadata'), response !== undefined && response.assistantMetrics !== undefined
        ? response.assistantMetrics
        : {}),
    ];
  } else {
    title = t('workflow.tool.details');
    const tool = call.tools[target.tool];
    sections = [
      textSection(t('workflow.arguments'), clampText(tool !== undefined
        ? tool.inputDetail !== undefined ? tool.inputDetail : tool.previewMarkdown ?? t('workflow.empty')
        : t('workflow.empty'))),
      textSection(t('workflow.result'), clampText(tool !== undefined
        ? tool.outputDetail !== undefined
          ? tool.outputDetail
          : tool.resultPreviewMarkdown !== undefined ? tool.resultPreviewMarkdown : tool.result ?? t('workflow.empty')
        : t('workflow.empty'))),
      textSection(t('workflow.schema'), tool !== undefined
        ? tool.schemaDetail !== undefined ? tool.schemaDetail : t('workflow.empty')
        : t('workflow.empty')),
    ];
  }
  return jsx('section', {
    className: css.detailPanel,
    'aria-label': title,
    children: [
      jsx('header', {
        children: [
          jsx('strong', { children: title }),
          jsx('button', {
            type: 'button',
            onClick: onClose,
            'aria-label': t('workflow.details.close'),
            children: jsx(IconChevronUpOutline14, { size: 16, 'aria-hidden': true }),
          }),
        ],
      }),
      jsx('div', {
        className: css.detailGrid,
        children: sections.map(section => jsx('section', {
          key: section.label,
          children: [
            jsx('h4', { children: section.label }),
            section.tree !== undefined
              ? jsx(WorkflowJsonInspector, { data: section.tree, label: section.label, t })
              : section.json === true
                ? jsx('div', {
                  'data-workflow-scroll-region': '',
                  children: jsx(CodeBlock, {
                    className: css.detailCode,
                    code: section.value,
                    lang: 'json',
                    copyLabel: t('workflow.copy'),
                    copiedLabel: t('workflow.copied'),
                  }),
                })
                : jsx('pre', { 'data-workflow-scroll-region': '', children: section.value }),
          ],
        })),
      }),
    ],
  });
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) console.error('[dsh-agent-workflow] DetailPanel render error', e);
    return jsx('section', {
      className: css.detailPanel,
      'aria-label': 'Details',
      children: [
        jsx('header', { children: jsx('strong', { children: title || 'Details' }) }),
        jsx('div', { className: css.detailGrid, children: jsx('pre', { children: String(e && e.message ? e.message : e), style: { padding: '12px', whiteSpace: 'pre-wrap' } }) }),
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// Simple dependency-free virtualizer.
// ---------------------------------------------------------------------------

function useSimpleVirtualizer({ count, getScrollElement, estimateSize, overscan }) {
  const [state, setState] = useState({ scrollTop: 0, viewport: 0, tick: 0 });
  const sizes = useRef(new Map());
  useEffect(() => {
    const el = getScrollElement();
    if (el === null || el === undefined) return undefined;
    const update = () => setState((prev) => ({ ...prev, scrollTop: el.scrollTop, viewport: el.clientHeight }));
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (observer !== null) observer.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      if (observer !== null) observer.disconnect();
    };
  }, [getScrollElement]);
  const { scrollTop, viewport } = state;
  const metrics = useMemo(() => {
    const offsets = [0];
    let total = 0;
    for (let index = 0; index < count; index++) {
      total += sizes.current.get(index) ?? estimateSize;
      offsets.push(total);
    }
    return { offsets, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, estimateSize, state.tick]);
  function findIndexForOffset(value, offsets) {
    let low = 0;
    let high = offsets.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (offsets[mid] <= value) low = mid + 1;
      else high = mid;
    }
    return Math.max(0, low - 1);
  }
  const start = Math.max(0, findIndexForOffset(scrollTop, metrics.offsets) - overscan);
  const end = Math.min(count, findIndexForOffset(scrollTop + viewport, metrics.offsets) + 1 + overscan);
  const items = [];
  for (let index = start; index < end; index++) items.push(index);
  const measure = (index) => (el) => {
    if (el === null) return;
    const height = el.offsetHeight;
    if (height > 0 && sizes.current.get(index) !== height) {
      sizes.current.set(index, height);
      setState((prev) => ({ ...prev, tick: prev.tick + 1 }));
    }
  };
  return { items, offsets: metrics.offsets, total: metrics.total, measure };
}

function CallRow({ call, detail, onDetail, t }) {
  const selectedKey = detail === null ? null : detailKey(detail);
  const select = (target) => {
    onDetail(detailKey(target) === selectedKey ? null : target);
  };
  return jsx('article', {
    className: css.callRow,
    children: [
      jsx('header', {
        className: css.callHeader,
        children: [
          jsx('strong', { children: `${t('workflow.modelCall')} #${call.number}` }),
          jsx('span', { children: formatTime(call.startedAt) }),
          jsx('span', { children: formatDuration(call.durationMs) }),
          call.usage !== undefined && call.usage.inputTotal !== undefined
            ? jsx('span', {
              className: css.tokenMetric,
              children: [
                jsx('span', { children: `${t('workflow.input')} ${call.usage.inputTotal.toLocaleString()}` }),
                call.usage.inputUncached !== undefined
                  && (call.usage.cacheRead !== undefined || call.usage.cacheWrite !== undefined)
                  ? jsx('small', {
                    children: `${t('workflow.inputUncached')} ${call.usage.inputUncached.toLocaleString()}`,
                  })
                  : null,
                call.usage.cacheRead !== undefined
                  ? jsx('small', {
                    children: `${t('workflow.cacheRead')} ${call.usage.cacheRead.toLocaleString()}`,
                  })
                  : null,
                call.usage.cacheWrite !== undefined
                  ? jsx('small', {
                    children: `${t('workflow.cacheWrite')} ${call.usage.cacheWrite.toLocaleString()}`,
                  })
                  : null,
              ],
            })
            : null,
          call.usage !== undefined && call.usage.output !== undefined
            ? jsx('span', { children: `${t('workflow.output')} ${call.usage.output.toLocaleString()}` })
            : null,
          jsx(Status, { status: call.status, t }),
        ],
      }),
      jsx('div', {
        className: css.flow,
        children: [
          jsx(RequestCard, { call, selected: selectedKey === `${call.id}:request`, onSelect: select, t }),
          jsx(FlowArrow, {}),
          jsx(ResponseCard, { call, selected: selectedKey === `${call.id}:response`, onSelect: select, t }),
          call.tools.map((tool, index) => jsx('span', {
            className: css.toolFlow,
            key: tool.callId ?? `${call.id}:${index}`,
            children: [
              jsx(FlowArrow, {}),
              jsx(ToolCard, {
                call,
                tool,
                index,
                selected: selectedKey === `${call.id}:tool:${index}`,
                onSelect: select,
                t,
              }),
            ],
          })),
          call.tools.length === 0 && call.response !== undefined
            ? jsx('span', {
              className: css.finalReply,
              children: [
                jsx(IconChevronRightOutline14, { size: 18, 'aria-hidden': true }),
                jsx('span', {
                  children: [
                    jsx(IconSendOutline16, { size: 16, 'aria-hidden': true }),
                    t('workflow.finalReply'),
                  ],
                }),
              ],
            })
            : null,
        ],
      }),
      detail !== null
        ? jsx(DetailErrorBoundary, { fallbackTitle: t('workflow.request.details'), t, children: jsx(DetailPanel, { call, target: detail, onClose: () => { onDetail(null); }, t }) })
        : null,
    ],
  });
}

/** Full-height Workflow conversation view. */
function WorkflowView({ useSession, useWorkflow, loadOlder, viewRequest, completeViewRequest, t }) {
  const inspection = useWorkflow((snapshot) => snapshot);
  const hasOlder = useSession((snapshot) => snapshot.hasMore);
  const loadingOlder = useSession((snapshot) => snapshot.loadingOlder);
  const layout = useMemo(() => deriveWorkflowLayout({
    nodes: inspection.eventNodes,
    eventLocations: inspection.eventLocations,
    partial: inspection.partial,
    runningCalls: inspection.runningCalls,
    requests: inspection.requests,
    callSchemas: inspection.callSchemas,
  }), [inspection]);
  const model = useMemo(
    () => deriveWorkflowModel(layout, inspection.requests, new Map()),
    [inspection.requests, layout],
  );
  const [historyPage, setHistoryPage] = useState(0);
  const historyLoadPending = useRef(false);
  useEffect(() => {
    if (!hasOlder || loadingOlder || historyLoadPending.current) return;
    let active = true;
    historyLoadPending.current = true;
    void loadOlder().then((changed) => {
      historyLoadPending.current = false;
      if (active && changed) setHistoryPage((page) => page + 1);
    }, () => {
      historyLoadPending.current = false;
    });
    return () => { active = false; };
  }, [hasOlder, historyPage, loadOlder, loadingOlder]);
  useEffect(() => {
    if (viewRequest !== undefined && viewRequest !== null && viewRequest.view === 'workflow') {
      if (completeViewRequest !== undefined) completeViewRequest();
    }
  }, [viewRequest, completeViewRequest]);
  const [chosenTurn, setChosenTurn] = useState(null);
  const selectedTurn = model.turns.find(turn => turn.turn === chosenTurn) ?? model.turns.at(-1);
  const [detail, setDetail] = useState(null);
  const scrollRef = useRef(null);
  const calls = selectedTurn !== undefined ? selectedTurn.calls : [];
  const getScrollElement = useCallback(() => scrollRef.current, []);
  const virtualizer = useSimpleVirtualizer({
    count: calls.length,
    getScrollElement,
    estimateSize: 230,
    overscan: 4,
  });
  const handleCallWheel = useCallback((event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    if (event.target instanceof Element
      && event.target.closest('[data-workflow-scroll-region]') !== null) return;
    const scroller = event.currentTarget;
    const scale = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2 ? scroller.clientHeight : 1;
    const next = Math.max(0, Math.min(
      scroller.scrollHeight - scroller.clientHeight,
      scroller.scrollTop + event.deltaY * scale,
    ));
    if (next === scroller.scrollTop) return;
    scroller.scrollTop = next;
    event.preventDefault();
  }, []);

  return jsx('section', {
    className: css.root,
    'aria-label': t('workflow.aria'),
    children: [
      jsx('header', {
        className: css.summary,
        children: [
          jsx('div', {
            className: css.summaryTitle,
            children: [
              jsx(IconBranchOutline16, { size: 18, 'aria-hidden': true }),
              jsx('strong', { children: t('view.workflow') }),
            ],
          }),
          jsx('div', {
            className: css.metrics,
            children: [
              jsx(Metric, { value: String(model.turns.length), label: t('workflow.turns') }),
              jsx(Metric, { value: String(model.requestCount), label: t('workflow.modelCalls') }),
              jsx(Metric, { value: String(model.toolCount), label: t('workflow.toolCalls') }),
              jsx(Metric, { value: formatDuration(model.durationMs), label: t('workflow.totalDuration') }),
            ],
          }),
        ],
      }),
      jsx('div', {
        className: css.workspace,
        children: [
          jsx('aside', {
            className: css.turns,
            'aria-label': t('workflow.turns'),
            children: [
              jsx('header', {
                children: [
                  jsx('strong', { children: t('workflow.turns') }),
                  jsx('span', { children: String(model.turns.length) }),
                ],
              }),
              jsx('div', {
                className: css.turnList,
                children: model.turns.map(turn => jsx(TurnItem, {
                  key: turn.turn,
                  turn,
                  selected: turn.turn === (selectedTurn !== undefined ? selectedTurn.turn : null),
                  onSelect: () => { setChosenTurn(turn.turn); setDetail(null); },
                  t,
                })),
              }),
              hasOlder
                ? jsx('button', {
                  type: 'button',
                  className: css.loadOlder,
                  disabled: loadingOlder,
                  onClick: () => { void loadOlder(); },
                  children: [
                    loadingOlder
                      ? jsx(IconLoadingOutline16, { size: 14, 'aria-hidden': true })
                      : jsx(IconChevronDownOutline14, { size: 14, 'aria-hidden': true }),
                    loadingOlder ? t('workflow.loadingOlder') : t('workflow.loadOlder'),
                  ],
                })
                : null,
            ],
          }),
          jsx('main', {
            className: css.main,
            children: selectedTurn === undefined
              ? jsx('div', { className: css.empty, children: t('workflow.emptyTurns') })
              : [
                jsx('header', {
                  className: css.turnHeader,
                  children: [
                    jsx('div', {
                      children: jsx('strong', { title: selectedTurn.prompt, children: turnTitle(selectedTurn, t) }),
                    }),
                    jsx('div', {
                      children: [
                        jsx('span', { children: formatTime(selectedTurn.startedAt) }),
                        jsx('span', { children: formatDuration(selectedTurn.durationMs) }),
                        jsx('span', { children: `${selectedTurn.calls.length}${t('workflow.calls.suffix')}` }),
                        jsx('span', { children: `${selectedTurn.toolCount}${t('workflow.tools.suffix')}` }),
                      ],
                    }),
                  ],
                }),
                jsx('div', {
                  ref: scrollRef,
                  className: css.callScroller,
                  onWheelCapture: handleCallWheel,
                  children: calls.length === 0
                    ? jsx('div', { className: css.empty, children: t('workflow.emptyCalls') })
                    : jsx('div', {
                      className: css.virtualBody,
                      style: { height: virtualizer.total },
                      children: virtualizer.items.map((item) => {
                        const call = calls[item];
                        if (call === undefined) return null;
                        const activeDetail = detail !== null && detail.key === call.id ? detail : null;
                        return jsx('div', {
                          key: call.id,
                          ref: virtualizer.measure(item),
                          'data-index': item,
                          className: css.virtualRow,
                          style: { transform: `translateY(${virtualizer.offsets[item]}px)` },
                          children: jsx(CallRow, { call, detail: activeDetail, onDetail: setDetail, t }),
                        });
                      }),
                    }),
                }),
              ],
          }),
        ],
      }),
    ],
  });
}
