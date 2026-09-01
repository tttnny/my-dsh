/**
 * Workflow-owned event Definitions for the uiConversation projection engine
 * (target "workflow"). Ported from the upstream trajectory definitions onto
 * the 0.1.2 event model — the same replay-safe state machines with a
 * Workflow-owned target, so replay cannot modify or short-circuit Chat and
 * Trajectory projections.
 */

// ---------------------------------------------------------------------------
// Event projection helpers (previously shared by dsh-client-runtime).
// ---------------------------------------------------------------------------

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}
function readString(record, key) {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function collect(source, member, field) {
  const list = source[member];
  if (!Array.isArray(list)) return [];
  const seen = [];
  for (const entry of list) {
    const record = asRecord(entry);
    const value = record === null ? null : readString(record, field);
    if (value !== null && !seen.includes(value)) seen.push(value);
  }
  return seen;
}
function joined(names) {
  return names.length > 0 ? names.join(', ') : null;
}
const KNOWN_FORMS = ['instructions', 'catalog', 'snapshot', 'notice', 'relay', 'recall'];
function contextForm(source) {
  const record = asRecord(source);
  const form = record === null ? null : readString(record, 'form');
  return form !== null && KNOWN_FORMS.includes(form) ? form : null;
}
function contextProvenance(source) {
  const record = asRecord(source);
  const kind = record === null ? null : readString(record, 'kind');
  if (record === null || kind === null) return { role: 'inject', label: null };
  switch (kind) {
    case 'session-reference': return {
      role: 'recall',
      label: joined(collect(record, 'references', 'label')) ?? kind,
    };
    case 'agent-instructions': return {
      role: 'inject',
      label: joined(collect(record, 'changes', 'path')) ?? kind,
    };
    case 'plugin': return {
      role: 'inject',
      label: readString(record, 'plugin') ?? kind,
    };
    case 'skill-invocation': return {
      role: 'inject',
      label: readString(record, 'name') ?? kind,
    };
    default: return { role: 'inject', label: kind };
  }
}
function toAssistantBlocks(content) {
  return content.map(toAssistantBlock);
}
function toAssistantBlock(block) {
  switch (block.type) {
    case 'text': return { kind: 'text', text: block.text };
    case 'reasoning': return { kind: 'reasoning', text: block.text };
    case 'image': return { kind: 'image', attachment: block.attachment };
    case 'tool-call': return {
      kind: 'tool-call',
      callId: String(block.id),
      name: block.name,
      argsRaw: block.arguments,
    };
    default: return { kind: 'other', block };
  }
}
function emptyAssistantBlock(blockType) {
  switch (blockType) {
    case 'text': return { kind: 'text', text: '' };
    case 'reasoning': return { kind: 'reasoning', text: '' };
    case 'tool-call': return { kind: 'tool-call', callId: '', name: '', argsRaw: '' };
    default: return { kind: 'other', block: null };
  }
}
function displayFailure(failure) {
  if (failure === null || typeof failure !== 'object') return { message: String(failure) };
  const record = failure;
  const code = typeof record.code === 'string' ? record.code : undefined;
  if (code === 'AUTH') return { code, message: '' };
  return {
    ...(code === undefined ? {} : { code }),
    message: typeof record.message === 'string' ? record.message : JSON.stringify(failure),
  };
}
function isTokenDelta(chunk) {
  switch (chunk.type) {
    case 'text-delta':
    case 'reasoning-delta': return chunk.text !== '';
    case 'tool-call-delta': return chunk.argumentsDelta !== '' || chunk.name !== undefined;
    default: return false;
  }
}

// ---------------------------------------------------------------------------
// Surface records (per-request messages reconstruction). The upstream 0.1.2
// builder dropped these; the Workflow view keeps the request messages ledger,
// so the surface definition is retained and the helpers inlined from
// @deepseek-ai/dsh-session/surface.
// ---------------------------------------------------------------------------

const SURFACE_EVENT_TYPES = new Set(['user/message', 'assistant/message', 'tool/result']);
function isSurfaceEvent(event) {
  return SURFACE_EVENT_TYPES.has(event.type) && event.surfaceOp !== undefined;
}
function isAppendSurfaceEvent(event) {
  return isSurfaceEvent(event) && event.surfaceOp === 'append';
}
function isReplacementSurfaceEvent(event) {
  return isSurfaceEvent(event) && event.surfaceOp !== 'append';
}
function deriveEventMessage(event) {
  switch (event.type) {
    case 'user/message': return event.data;
    case 'assistant/message': {
      if (event.data.message.content.length === 0) return null;
      return event.data.message;
    }
    case 'tool/result': return event.data.message;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Inbox + message definitions.
// ---------------------------------------------------------------------------

function applySplice(previous, splice) {
  const pending = [...(previous !== undefined ? previous.state.pending ?? [] : [])];
  const claimed = new Set(previous !== undefined ? previous.state.claimed ?? [] : []);
  const removed = pending.splice(splice.start, splice.removedCount ?? 0, ...splice.inserted);
  for (const identity of splice.inserted) claimed.delete(identity.id);
  if (splice.outcome !== 'canceled') for (const identity of removed) claimed.add(identity.id);
  return { pending, claimed };
}

const workflowInboxDefinition = {
  kind: 'workflow-inbox-next-step',
  match: (event) => event.type === 'agent/inbox/spliced' && event.data.target === 'next-step'
    ? { id: String(event.seq), role: 'start' }
    : null,
  start: (_context, match, reader) => {
    if (match.event.type !== 'agent/inbox/spliced') {
      throw new Error('workflow-inbox-next-step start requires agent/inbox/spliced');
    }
    return applySplice(reader.previous('workflow-inbox-next-step'), match.event.data);
  },
  update: (context) => context.state,
  publication: () => 'none',
};

const workflowMessageDefinition = {
  kind: 'workflow-input-message',
  target: 'workflow',
  match: (event) => event.type === 'user/message' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match, reader) => {
    if (match.event.type !== 'user/message') {
      throw new Error('workflow-input-message start requires user/message');
    }
    const event = match.event;
    if (event.data.source.kind !== 'user') {
      return {
        kind: 'context',
        seq: event.seq,
        time: event.time,
        content: event.data.content,
        source: event.data.source,
        provenance: contextProvenance(event.data.source),
        form: contextForm(event.data.source),
      };
    }
    const previous = reader.previous('workflow-inbox-next-step');
    const claimed = previous !== undefined
      && previous.state.claimed.has(String(event.data.id)) === true;
    return claimed
      ? {
        kind: 'steering',
        messageId: event.data.id,
        seq: event.seq,
        time: event.time,
        content: event.data.content,
        source: event.data.source,
      }
      : {
        kind: 'user',
        seq: event.seq,
        time: event.time,
        content: event.data.content,
        source: event.data.source,
      };
  },
  update: (context) => context.state,
  buildViewNode: (context) => context.state === undefined
    ? null
    : workflowNode(context, context.state.seq, { kind: 'node', node: context.state }),
};

function registerWorkflowMessageDefinitions(ctx) {
  ctx.uiConversation.events.register(workflowInboxDefinition);
  ctx.uiConversation.events.register(workflowMessageDefinition);
}

// ---------------------------------------------------------------------------
// Request-header definition.
// ---------------------------------------------------------------------------

function workflowRequestHeaderDefinition(inspect) {
  return {
    kind: 'workflow-request-header',
    target: 'workflow',
    match: (event) => event.type === 'request/header' ? { id: String(event.seq), role: 'start' } : null,
    start: (_context, match, reader) => {
      if (match.event.type !== 'request/header') {
        throw new Error('workflow-request-header start requires request/header');
      }
      const previous = reader.previous('workflow-request-header') !== undefined
        ? reader.previous('workflow-request-header').state.prompt
        : undefined;
      const { prompt, change } = inspect(previous, match.event);
      return {
        seq: match.event.seq,
        time: match.event.time,
        prompt,
        location: match.location,
        ...(change === undefined ? {} : { change }),
      };
    },
    update: (context) => context.state,
    buildViewNode: (context) => context.state === undefined
      ? null
      : workflowNode(context, context.state.seq, {
        kind: 'request-header',
        header: context.state,
      }),
  };
}

function registerWorkflowRequestHeaderDefinition(ctx) {
  ctx.uiConversation.events.register(
    workflowRequestHeaderDefinition((previous, event) =>
      ctx.uiConversation.inspectRequestPrompt(previous, event)),
  );
}

// ---------------------------------------------------------------------------
// Surface definition.
// ---------------------------------------------------------------------------

const workflowSurfaceDefinition = {
  kind: 'workflow-surface-event',
  target: 'workflow',
  match: (event) => isAppendSurfaceEvent(event) || isReplacementSurfaceEvent(event)
    ? { id: String(event.seq), role: 'start' }
    : null,
  start: (_context, match) => {
    const event = match.event;
    if (!isAppendSurfaceEvent(event) && !isReplacementSurfaceEvent(event)) {
      throw new Error('workflow-surface-event start requires a surface event');
    }
    return {
      seq: event.seq,
      message: deriveEventMessage(event),
      operation: event.surfaceOp === 'append'
        ? { kind: 'append' }
        : { kind: 'replace', start: event.surfaceOp.start, end: event.surfaceOp.end },
    };
  },
  update: (context) => context.state,
  buildViewNode: (context) => context.state === undefined
    ? null
    : workflowNode(context, context.state.seq, { kind: 'surface', record: context.state }),
};

function registerWorkflowSurfaceDefinition(ctx) {
  ctx.uiConversation.events.register(workflowSurfaceDefinition);
}

// ---------------------------------------------------------------------------
// Assistant streaming, settlement, and request lifecycle.
// ---------------------------------------------------------------------------

function isChunkRunEvent(event) {
  return event.type === 'chunkrow/text-chunks'
    || event.type === 'chunkrow/reasoning-chunks'
    || event.type === 'chunkrow/tool-call-chunks';
}
function initialState(turn, step, startSeq, startTime, started) {
  return {
    turn, step, startSeq, startTime, started,
    sawChunk: false,
    blocks: [],
    visibleBlocks: 0,
    firstVisibleSeq: undefined,
    firstVisibleTime: undefined,
    firstTokenTime: undefined,
    final: undefined,
    usage: undefined,
    retry: undefined,
    stepEnd: undefined,
  };
}
function compactBlocks(blocks) {
  return blocks.filter((block) => block !== undefined);
}
function blockIsVisible(block) {
  if (block === undefined || block.kind === 'tool-call') return false;
  if (block.kind === 'text' || block.kind === 'reasoning') return block.text.trim() !== '';
  return true;
}
function countVisibleBlocks(blocks) {
  let count = 0;
  for (const block of blocks) if (blockIsVisible(block)) count++;
  return count;
}
function hasInterruptionEvidence(blocks) {
  return blocks.some((block) => {
    if (block.kind === 'text' || block.kind === 'reasoning') return block.text.trim() !== '';
    return true;
  });
}
function addUsage$1(current, next) {
  return {
    inputTokens: (current !== undefined ? current.inputTokens ?? 0 : 0) + next.inputTokens,
    outputTokens: (current !== undefined ? current.outputTokens ?? 0 : 0) + next.outputTokens,
    ...(current !== undefined && current.cacheReadTokens !== undefined
        || next.cacheReadTokens !== undefined
      ? { cacheReadTokens: (current !== undefined ? current.cacheReadTokens ?? 0 : 0) + (next.cacheReadTokens ?? 0) }
      : {}),
    ...(current !== undefined && current.cacheWriteTokens !== undefined
        || next.cacheWriteTokens !== undefined
      ? { cacheWriteTokens: (current !== undefined ? current.cacheWriteTokens ?? 0 : 0) + (next.cacheWriteTokens ?? 0) }
      : {}),
    ...(current !== undefined && current.reasoningTokens !== undefined
        || next.reasoningTokens !== undefined
      ? { reasoningTokens: (current !== undefined ? current.reasoningTokens ?? 0 : 0) + (next.reasoningTokens ?? 0) }
      : {}),
  };
}
function updateChunk(state, match) {
  if (match.event.type !== 'assistant/chunk') return state;
  const chunk = match.event.data.chunk;
  if (chunk.type === 'usage') {
    return { ...state, sawChunk: true, usage: addUsage$1(state.usage, chunk.usage) };
  }
  const blocks = [...state.blocks];
  let changedIndex = -1;
  let previousVisible = false;
  switch (chunk.type) {
    case 'block-start':
      changedIndex = chunk.index;
      previousVisible = blockIsVisible(blocks[chunk.index]);
      blocks[chunk.index] = emptyAssistantBlock(chunk.blockType);
      break;
    case 'text-delta': {
      const previous = blocks[chunk.index];
      changedIndex = chunk.index;
      previousVisible = blockIsVisible(previous);
      blocks[chunk.index] = {
        kind: 'text',
        text: (previous !== undefined && previous.kind === 'text' ? previous.text : '') + chunk.text,
      };
      break;
    }
    case 'reasoning-delta': {
      const previous = blocks[chunk.index];
      changedIndex = chunk.index;
      previousVisible = blockIsVisible(previous);
      blocks[chunk.index] = {
        kind: 'reasoning',
        text: (previous !== undefined && previous.kind === 'reasoning' ? previous.text : '') + chunk.text,
      };
      break;
    }
    case 'tool-call-delta': {
      const previous = blocks[chunk.index];
      changedIndex = chunk.index;
      previousVisible = blockIsVisible(previous);
      const base = previous !== undefined && previous.kind === 'tool-call'
        ? previous
        : { kind: 'tool-call', callId: '', name: '', argsRaw: '' };
      blocks[chunk.index] = {
        kind: 'tool-call',
        callId: base.callId || String(chunk.id),
        name: chunk.name !== undefined ? chunk.name : base.name,
        argsRaw: base.argsRaw + chunk.argumentsDelta,
      };
      break;
    }
    case 'block-end':
      changedIndex = chunk.index;
      previousVisible = blockIsVisible(blocks[chunk.index]);
      blocks[chunk.index] = toAssistantBlock(chunk.block);
      break;
    default: return { ...state, sawChunk: true };
  }
  const visibleBlocks = state.visibleBlocks - Number(previousVisible) + Number(blockIsVisible(blocks[changedIndex]));
  return {
    ...state,
    sawChunk: true,
    blocks,
    visibleBlocks,
    ...(visibleBlocks > 0 && state.firstVisibleSeq === undefined
      ? { firstVisibleSeq: match.event.seq, firstVisibleTime: match.event.time }
      : {}),
    ...(isTokenDelta(chunk) && state.firstTokenTime === undefined
      ? { firstTokenTime: match.event.time }
      : {}),
  };
}
function chunkRunBoundaries(event, needsToken, needsVisible, visibleFromStart) {
  const fragments = event.type === 'chunkrow/tool-call-chunks' ? event.data.args : event.data.texts;
  const nameStartsToken = event.type === 'chunkrow/tool-call-chunks' && Object.hasOwn(event.data, 'name');
  let firstTokenTime;
  let firstVisible;
  let time = event.time;
  for (let index = 0; index < fragments.length; index++) {
    const fragment = fragments[index];
    if (needsToken && firstTokenTime === undefined && (nameStartsToken || fragment !== '')) firstTokenTime = time;
    if (needsVisible && firstVisible === undefined
      && (visibleFromStart || event.type !== 'chunkrow/tool-call-chunks' && fragment.trim() !== '')) {
      firstVisible = { seq: event.seq + index, time };
    }
    if ((!needsToken || firstTokenTime !== undefined)
      && (!needsVisible || firstVisible !== undefined)) break;
    time += (event.data.dt !== undefined ? event.data.dt[index] ?? 0 : 0);
  }
  return { firstTokenTime, firstVisible };
}
function updateChunkRun(state, event) {
  const blocks = [...state.blocks];
  const previous = blocks[event.data.index];
  const previousVisible = blockIsVisible(previous);
  let visibleFromStart = state.visibleBlocks - Number(previousVisible) > 0;
  if (event.type === 'chunkrow/text-chunks') {
    const text = previous !== undefined && previous.kind === 'text' ? previous.text : '';
    visibleFromStart = visibleFromStart || text.trim() !== '';
    blocks[event.data.index] = { kind: 'text', text: text + event.data.texts.join('') };
  } else if (event.type === 'chunkrow/reasoning-chunks') {
    const text = previous !== undefined && previous.kind === 'reasoning' ? previous.text : '';
    visibleFromStart = visibleFromStart || text.trim() !== '';
    blocks[event.data.index] = { kind: 'reasoning', text: text + event.data.texts.join('') };
  } else {
    const base = previous !== undefined && previous.kind === 'tool-call'
      ? previous
      : { kind: 'tool-call', callId: '', name: '', argsRaw: '' };
    blocks[event.data.index] = {
      kind: 'tool-call',
      callId: base.callId || String(event.data.id),
      name: Object.hasOwn(event.data, 'name') ? event.data.name : base.name,
      argsRaw: base.argsRaw + event.data.args.join(''),
    };
  }
  const boundaries = chunkRunBoundaries(
    event,
    state.firstTokenTime === undefined,
    state.firstVisibleSeq === undefined,
    visibleFromStart,
  );
  const visibleBlocks = state.visibleBlocks - Number(previousVisible) + Number(blockIsVisible(blocks[event.data.index]));
  return {
    ...state,
    sawChunk: true,
    blocks,
    visibleBlocks,
    ...(boundaries.firstVisible === undefined
      ? {}
      : { firstVisibleSeq: boundaries.firstVisible.seq, firstVisibleTime: boundaries.firstVisible.time }),
    ...(boundaries.firstTokenTime === undefined ? {} : { firstTokenTime: boundaries.firstTokenTime }),
  };
}
function closedBoundary(context) {
  if (context.state !== undefined && context.state.stepEnd !== undefined
    && context.state.stepEnd.event.type === 'step/end') {
    return context.state.stepEnd.event;
  }
  const location = context.start !== undefined && context.start.location !== undefined
    ? context.start.location
    : context.matches.at(-1) !== undefined ? context.matches.at(-1).location : undefined;
  if (location !== undefined && location.kind === 'step' && location.step.status === 'closed') {
    return location.step.end;
  }
  if (location !== undefined
    && (location.kind === 'step' || location.kind === 'turn')
    && location.turn.status === 'closed') return location.turn.end;
  return undefined;
}
function fallbackState$1(context) {
  let state;
  for (const match of context.matches) {
    if (isChunkRunEvent(match.event)) {
      state = state === undefined
        ? initialState(match.event.data.turn, match.event.data.step, match.event.seq, match.event.time, false)
        : state;
      state = updateChunkRun(state, match.event);
      continue;
    }
    const event = match.event;
    if (event.type === 'assistant/chunk') {
      state = state === undefined
        ? initialState(event.data.turn, event.data.step, event.seq, event.time, false)
        : state;
      state = updateChunk(state, match);
    } else if (event.type === 'assistant/message') {
      state = state === undefined
        ? initialState(event.data.turn, event.data.step, event.seq, event.time, false)
        : state;
      const blocks = toAssistantBlocks(event.data.message.content);
      state = {
        ...state,
        blocks,
        visibleBlocks: countVisibleBlocks(blocks),
        final: match,
        usage: state.usage !== undefined ? state.usage : event.data.usage,
      };
    } else if (event.type === 'step/end' && state !== undefined) {
      state = { ...state, stepEnd: match };
    }
  }
  return state;
}
function finalNode(state, context) {
  const final = state.final;
  if (final !== undefined && final.event.type === 'assistant/message') {
    const event = final.event;
    return {
      kind: 'assistant',
      seq: event.seq,
      messageId: event.data.message.id,
      time: event.time,
      turn: state.turn,
      step: state.step,
      blocks: toAssistantBlocks(event.data.message.content),
      usage: event.data.usage,
      provenance: {
        provider: event.data.message.source.provider,
        model: event.data.message.source.model,
      },
      timing: {
        stepStartTime: state.started ? state.startTime : null,
        firstTokenTime: state.firstTokenTime !== undefined ? state.firstTokenTime : null,
        completedTime: event.time,
      },
      ...(event.data.interrupted === true ? { interrupted: true } : {}),
    };
  }
  const boundary = closedBoundary(context);
  if (boundary === undefined) return undefined;
  const blocks = compactBlocks(state.blocks);
  if (!hasInterruptionEvidence(blocks)) return undefined;
  return {
    kind: 'assistant',
    seq: boundary.seq - 0.9,
    time: boundary.time,
    turn: state.turn,
    step: state.step,
    blocks,
    interrupted: true,
  };
}
function assistantRequest(state, node, boundary) {
  if (!state.started) return undefined;
  const status = node !== undefined && node.interrupted !== true
    ? 'complete'
    : state.retry !== undefined || boundary !== undefined ? 'error' : 'running';
  return {
    purpose: 'assistant',
    startSeq: state.startSeq,
    turn: state.turn,
    step: state.step,
    startedAt: state.startTime,
    completedAt: node !== undefined ? node.time : boundary !== undefined ? boundary.time : null,
    status,
    ...(state.retry === undefined
      ? {}
      : {
        error: state.retry.message,
        ...(state.retry.code === undefined ? {} : { errorCode: state.retry.code }),
        retry: state.retry.retry,
        ...(state.retry.maxRetries === undefined ? {} : { maxRetries: state.retry.maxRetries }),
        retryDelayMs: state.retry.delayMs,
      }),
    ...(node !== undefined && node.messageId === undefined
      ? {}
      : node !== undefined
        ? {
          resultSeq: node.seq,
          ...(node.provenance === undefined ? {} : { provenance: node.provenance }),
        }
        : {}),
    // Workflow extension: a chunk-only fallback has no durable message to
    // anchor message assembly, so retain the closing boundary as its edge.
    ...(node !== undefined && node.messageId !== undefined || boundary === undefined
      ? {}
      : { completedSeq: boundary.seq }),
    ...(state.usage === undefined ? {} : { usage: state.usage }),
  };
}
const workflowAssistantDefinition = {
  kind: 'workflow-assistant-step',
  target: 'workflow',
  match: (event) => {
    if (event.type === 'step/start') {
      return { id: `${event.data.turn}:${event.data.step}`, role: 'start' };
    }
    if (event.type === 'assistant/chunk'
      || event.type === 'assistant/message'
      || event.type === 'llm/retry'
      || event.type === 'step/end') {
      return { id: `${event.data.turn}:${event.data.step}`, role: 'update' };
    }
    if (isChunkRunEvent(event)) {
      return { id: `${event.data.turn}:${event.data.step}`, role: 'update' };
    }
    return null;
  },
  start: (_context, match) => {
    if (match.event.type !== 'step/start') {
      throw new Error('workflow-assistant-step start requires step/start');
    }
    return initialState(match.event.data.turn, match.event.data.step, match.event.seq, match.event.time, true);
  },
  update: (context, match) => {
    if (isChunkRunEvent(match.event)) return updateChunkRun(context.state, match.event);
    if (match.event.type === 'assistant/chunk') return updateChunk(context.state, match);
    if (match.event.type === 'assistant/message') {
      const blocks = toAssistantBlocks(match.event.data.message.content);
      return {
        ...context.state,
        blocks,
        visibleBlocks: countVisibleBlocks(blocks),
        final: match,
        usage: context.state.usage !== undefined ? context.state.usage : match.event.data.usage,
      };
    }
    if (match.event.type === 'step/end') return { ...context.state, stepEnd: match };
    if (match.event.type !== 'llm/retry') return context.state;
    const data = match.event.data;
    const failure = displayFailure(data.failure);
    return {
      ...initialState(context.state.turn, context.state.step, context.state.startSeq, context.state.startTime, true),
      firstTokenTime: context.state.firstTokenTime,
      usage: context.state.usage,
      retry: {
        message: failure.message,
        ...(failure.code === undefined ? {} : { code: failure.code }),
        retry: data.retry,
        ...(data.mode === 'normal' ? { maxRetries: data.maxRetries } : {}),
        delayMs: data.delayMs,
      },
    };
  },
  publication: (match) => {
    if (match.event.type === 'step/start') return 'none';
    if (isChunkRunEvent(match.event)) return 'animation-frame';
    if (match.event.type !== 'assistant/chunk') return 'immediate';
    const type = match.event.data.chunk.type;
    return type === 'usage' || type === 'finish' ? 'none' : 'animation-frame';
  },
  buildViewNode: (context) => {
    const state = context.state !== undefined ? context.state : fallbackState$1(context);
    if (state === undefined) return null;
    const node = finalNode(state, context);
    const boundary = closedBoundary(context);
    const partial = node === undefined && boundary === undefined && state.sawChunk
      ? { turn: state.turn, step: state.step, blocks: compactBlocks(state.blocks) }
      : null;
    const request = assistantRequest(state, node, boundary);
    if (node === undefined && partial === null && request === undefined) return null;
    return workflowNode(context, state.startSeq, {
      kind: 'assistant',
      ...(node === undefined ? {} : { node }),
      partial,
      ...(request === undefined ? {} : { request }),
    });
  },
};

const workflowTurnEndDefinition = {
  kind: 'workflow-turn-end',
  target: 'workflow',
  match: (event) => event.type === 'turn/end' ? { id: String(event.seq), role: 'start' } : null,
  start: (_context, match) => {
    if (match.event.type !== 'turn/end') {
      throw new Error('workflow-turn-end start requires turn/end');
    }
    const reason = match.event.data.reason;
    const failure = reason.kind === 'error' ? displayFailure(reason.error) : undefined;
    return {
      turn: match.event.data.turn,
      seq: match.event.seq,
      time: match.event.time,
      ...(failure === undefined
        ? {}
        : {
          error: failure.message,
          ...(failure.code === undefined ? {} : { errorCode: failure.code }),
        }),
    };
  },
  update: (context) => context.state,
  buildViewNode: (context) => context.state === undefined
    ? null
    : workflowNode(context, context.state.seq, {
      kind: 'turn-end',
      turn: context.state.turn,
      time: context.state.time,
      ...(context.state.error === undefined ? {} : { error: context.state.error }),
      ...(context.state.errorCode === undefined ? {} : { errorCode: context.state.errorCode }),
    }),
};

function registerWorkflowAssistantDefinition(ctx) {
  ctx.uiConversation.events.register(workflowAssistantDefinition);
  ctx.uiConversation.events.register(workflowTurnEndDefinition);
}

// ---------------------------------------------------------------------------
// Root Tool lifecycle with nested Code Dispatch calls.
// ---------------------------------------------------------------------------

const MAX_DEPTH = 256;
function rootCall(match) {
  if (match.event.type !== 'tool/call') throw new Error('workflow-tool-call start requires tool/call');
  return {
    callId: String(match.event.data.callId),
    name: match.event.data.name,
    argsRaw: match.event.data.arguments,
    turn: match.event.data.turn,
    step: match.event.data.step,
    time: match.event.time,
    subCalls: [],
  };
}
function rootResult(match, previous) {
  if (match.event.type !== 'tool/result') return undefined;
  const result = match.event.data.message.content[0];
  return {
    kind: 'tool-result',
    seq: match.event.seq,
    time: match.event.time,
    callId: String(match.event.data.message.source.callId),
    call: previous === undefined ? null : { name: previous.name, argsRaw: previous.argsRaw },
    callTime: previous !== undefined ? previous.time ?? null : null,
    content: result.content,
    isError: result.isError === true,
    ...(match.event.data.error === undefined ? {} : { error: match.event.data.error }),
    meta: match.event.data.meta,
    subCalls: [],
  };
}
function locationTurn(match) {
  return match.location.kind === 'step' || match.location.kind === 'turn'
    ? match.location.turn.turn
    : 0;
}
function locationStep(match) {
  return match.location.kind === 'step' ? match.location.step.step : 0;
}
function childCall(match, data) {
  return {
    callId: data.subCallId,
    parentCallId: data.parentCallId,
    name: data.name,
    argsRaw: JSON.stringify(data.arguments),
    turn: locationTurn(match),
    step: locationStep(match),
    time: match.event.time,
    subCalls: [],
  };
}
function childResult(match, data, previous) {
  return {
    kind: 'tool-result',
    seq: match.event.seq,
    time: match.event.time,
    callId: data.subCallId,
    parentCallId: data.parentCallId,
    call: { name: data.name, argsRaw: JSON.stringify(data.arguments) },
    callTime: previous === undefined || 'kind' in previous ? null : previous.time,
    content: data.content !== undefined ? data.content : [],
    isError: data.isError === true,
    subCalls: [],
  };
}
function acceptsEdge(state, parent, child) {
  if (parent === child || state.parents.has(child)) return false;
  let cursor = parent;
  let parentDepth = 0;
  const ancestors = new Set();
  while (cursor !== undefined) {
    if (cursor === child || ancestors.has(cursor)) return false;
    ancestors.add(cursor);
    parentDepth++;
    cursor = state.parents.get(cursor);
  }
  const pending = [{ callId: child, depth: 1 }];
  const descendants = new Set();
  let subtreeDepth = 0;
  for (const candidate of pending) {
    if (descendants.has(candidate.callId)) return false;
    descendants.add(candidate.callId);
    subtreeDepth = Math.max(subtreeDepth, candidate.depth);
    for (const nested of state.children.get(candidate.callId) ?? []) {
      pending.push({ callId: nested, depth: candidate.depth + 1 });
    }
  }
  return parentDepth + subtreeDepth <= MAX_DEPTH;
}
function updateDispatch(state, match) {
  const event = match.event;
  if (event.type !== 'tool/code-dispatch-start' && event.type !== 'tool/code-dispatch') return state;
  const data = event.data;
  const parentId = String(data.parentCallId);
  const childId = String(data.subCallId);
  const siblings = state.children.get(parentId) ?? [];
  const index = siblings.indexOf(childId);
  if (index < 0 && !acceptsEdge(state, parentId, childId)) return state;
  if (event.type === 'tool/code-dispatch-start' && index >= 0) return state;
  const calls = new Map(state.calls);
  calls.set(childId, event.type === 'tool/code-dispatch-start'
    ? childCall(match, data)
    : childResult(match, data, calls.get(childId)));
  if (index >= 0) return { ...state, calls };
  const children = new Map(state.children);
  children.set(parentId, [...siblings, childId]);
  const parents = new Map(state.parents);
  parents.set(childId, parentId);
  return { ...state, calls, children, parents };
}
function interruption(context) {
  const location = context.start !== undefined && context.start.location !== undefined
    ? context.start.location
    : undefined;
  if (location !== undefined && location.kind === 'step' && location.step.status === 'closed') {
    return location.step.end;
  }
  if (location !== undefined
    && (location.kind === 'step' || location.kind === 'turn')
    && location.turn.status === 'closed') return location.turn.end;
  return undefined;
}
function projectCall(state, callId, interruptedAt, visited, depth) {
  visited = visited !== undefined ? visited : new Set();
  depth = depth !== undefined ? depth : 1;
  const block = state.calls.get(callId);
  if (block === undefined) return undefined;
  if (visited.has(callId) || depth > MAX_DEPTH) return { ...block, subCalls: [] };
  const nextVisited = new Set(visited);
  nextVisited.add(callId);
  const subCalls = (state.children.get(callId) ?? []).flatMap((childId) => {
    const child = projectCall(state, childId, interruptedAt, nextVisited, depth + 1);
    return child === undefined ? [] : [child];
  });
  if ('kind' in block || interruptedAt === undefined) return { ...block, subCalls };
  return {
    kind: 'tool-result',
    seq: interruptedAt.seq - 0.8,
    time: interruptedAt.time,
    callId: block.callId,
    ...(block.parentCallId === undefined ? {} : { parentCallId: block.parentCallId }),
    call: { name: block.name, argsRaw: block.argsRaw },
    callTime: block.time,
    content: [],
    isError: true,
    error: { name: 'Interrupted', code: 'interrupted' },
    subCalls,
  };
}
function fallbackState(context) {
  const resultMatch = context.matches.find((match) => match.event.type === 'tool/result');
  const root = resultMatch === undefined ? undefined : rootResult(resultMatch);
  if (root === undefined) return undefined;
  let state = {
    rootId: root.callId,
    calls: new Map([[root.callId, root]]),
    children: new Map(),
    parents: new Map(),
  };
  for (const match of context.matches) state = updateDispatch(state, match);
  return state;
}
const workflowToolDefinition = {
  kind: 'workflow-tool-call',
  target: 'workflow',
  match: (event) => {
    if (event.type === 'tool/call') return { id: String(event.data.callId), role: 'start' };
    if (event.type === 'tool/result') {
      return { id: String(event.data.message.source.callId), role: 'update' };
    }
    if (event.type === 'tool/code-dispatch-start' || event.type === 'tool/code-dispatch') {
      const rootCallId = event.data.rootCallId;
      return typeof rootCallId === 'string' && rootCallId !== ''
        ? { id: rootCallId, role: 'update' }
        : null;
    }
    return null;
  },
  start: (_context, match) => {
    const root = rootCall(match);
    return {
      rootId: root.callId,
      calls: new Map([[root.callId, root]]),
      children: new Map(),
      parents: new Map(),
    };
  },
  update: (context, match) => {
    if (match.event.type !== 'tool/result') return updateDispatch(context.state, match);
    const previous = context.state.calls.get(context.state.rootId);
    const running = previous !== undefined && !('kind' in previous) ? previous : undefined;
    const result = rootResult(match, running);
    if (result === undefined) return context.state;
    const calls = new Map(context.state.calls);
    calls.set(context.state.rootId, result);
    return { ...context.state, calls };
  },
  buildViewNode: (context) => {
    const state = context.state !== undefined ? context.state : fallbackState(context);
    if (state === undefined) return null;
    const root = projectCall(state, state.rootId, interruption(context));
    if (root === undefined) return null;
    const anchorSeq = context.start !== undefined
      ? context.start.event.seq
      : 'kind' in root
        ? root.seq
        : context.matches[0] !== undefined ? context.matches[0].event.seq ?? 0 : 0;
    return workflowNode(context, anchorSeq, { kind: 'tool', root });
  },
};
function registerWorkflowToolDefinition(ctx) {
  ctx.uiConversation.events.register(workflowToolDefinition);
}

// ---------------------------------------------------------------------------
// Compaction requests and session boundaries.
// ---------------------------------------------------------------------------

function checkpointId(event) {
  if (event.type !== 'user/message') return undefined;
  const source = event.data.source;
  return source.kind === 'plugin' && source.plugin === 'compact'
    && typeof source.compactionId === 'string' && source.compactionId !== ''
    ? source.compactionId
    : undefined;
}
function eventCompactionId(event) {
  if (event.type !== 'compaction/start'
    && event.type !== 'compaction/summary'
    && event.type !== 'compaction/end') return undefined;
  const value = event.data.compactionId;
  return typeof value === 'string' && value !== '' ? value : undefined;
}
function requestFromState(state) {
  const start = state.start.event;
  if (start.type !== 'compaction/start') return undefined;
  const summary = state.summary !== undefined ? state.summary.event : undefined;
  const end = state.end !== undefined ? state.end.event : undefined;
  const checkpoint = state.checkpoint !== undefined ? state.checkpoint.event : undefined;
  return {
    purpose: 'compaction',
    startSeq: start.seq,
    turn: start.data.turn,
    step: 0,
    startedAt: start.time,
    completedAt: end !== undefined && end.type === 'compaction/end' ? end.time : null,
    status: end === undefined || end.type !== 'compaction/end'
      ? 'running'
      : end.data.error === undefined ? 'complete' : 'error',
    ...(end !== undefined && end.type === 'compaction/end' && end.data.error !== undefined
      ? { error: end.data.error }
      : {}),
    ...(summary === undefined || summary.type !== 'compaction/summary'
      ? {}
      : {
        resultSeq: summary.seq,
        summary: summary.data.summary,
        ...(summary.data.rawOutput === undefined ? {} : { rawOutput: summary.data.rawOutput }),
        provenance: { provider: summary.data.provider, model: summary.data.model },
        requestConfig: {
          provider: summary.data.provider,
          model: summary.data.model,
          purpose: 'compaction',
          ...(summary.data.maxTokens === undefined ? {} : { maxTokens: summary.data.maxTokens }),
        },
        ...(summary.data.usage === undefined ? {} : { usage: summary.data.usage }),
      }),
    ...(checkpoint !== undefined && checkpoint.type === 'user/message'
      ? { replacementSeq: checkpoint.seq }
      : {}),
  };
}
const workflowCompactionDefinition = {
  kind: 'workflow-compaction',
  target: 'workflow',
  match: (event) => {
    const compactId = eventCompactionId(event);
    if (compactId !== undefined) {
      return { id: compactId, role: event.type === 'compaction/start' ? 'start' : 'update' };
    }
    const checkpoint = checkpointId(event);
    return checkpoint === undefined ? null : { id: checkpoint, role: 'update' };
  },
  start: (_context, match) => {
    if (match.event.type !== 'compaction/start') {
      throw new Error('workflow-compaction start requires compaction/start');
    }
    return { start: match };
  },
  update: (context, match) => {
    if (match.event.type === 'compaction/summary') return { ...context.state, summary: match };
    if (match.event.type === 'compaction/end') return { ...context.state, end: match };
    return checkpointId(match.event) === undefined
      ? context.state
      : { ...context.state, checkpoint: match };
  },
  buildViewNode: (context) => {
    if (context.state === undefined) return null;
    const request = requestFromState(context.state);
    return request === undefined
      ? null
      : workflowNode(context, request.startSeq, { kind: 'compaction', request });
  },
};
const workflowSessionEndDefinition = {
  kind: 'workflow-session-end',
  target: 'workflow',
  match: (event) => event.type === 'session/end-seed'
    ? { id: String(event.seq), role: 'start' }
    : null,
  start: (_context, match) => ({ seq: match.event.seq, time: match.event.time }),
  update: (context) => context.state,
  buildViewNode: (context) => context.state === undefined
    ? null
    : workflowNode(context, context.state.seq, {
      kind: 'session-end',
      seq: context.state.seq,
      time: context.state.time,
    }),
};
function registerWorkflowCompactionDefinitions(ctx) {
  ctx.uiConversation.events.register(workflowCompactionDefinition);
  ctx.uiConversation.events.register(workflowSessionEndDefinition);
}
