/**
 * Workflow target envelope + snapshot builder for the uiConversation view
 * registry. Ported from the 0.1.2 upstream trajectory builder (target
 * "workflow") and extended with the reference's surface-ledger step so every
 * assistant request carries the complete provider-neutral messages array.
 */

const EMPTY_LIST = [];

/** Stable empty target used until a Session has assembled Workflow records. */
const EMPTY_WORKFLOW_SNAPSHOT = {
  eventNodes: EMPTY_LIST,
  eventLocations: new Map(),
  requests: EMPTY_LIST,
  callSchemas: new Map(),
  partial: null,
  runningCalls: EMPTY_LIST,
};

function workflowNode(context, anchorSeq, data) {
  return {
    key: context.key,
    kind: context.kind,
    id: context.id,
    target: 'workflow',
    anchorSeq,
    location: context.start !== undefined && context.start.location !== undefined
      ? context.start.location
      : { kind: 'unresolved' },
    data,
  };
}

function stepKey(turn, step) {
  return `${turn}\u0000${step}`;
}

function headerStepKey(header) {
  const location = header.location;
  return location.kind === 'step' ? stepKey(location.turn.turn, location.step.step) : undefined;
}

function headerFor(request, headersByStep, previous) {
  return headersByStep.get(stepKey(request.turn, request.step))
    ?? (previous !== undefined && previous.seq < request.startSeq
      ? {
        latest: previous,
        ...(previous.change === undefined ? {} : { change: previous.change }),
      }
      : undefined);
}

function applyHeader(request, header, includeChange) {
  return header === undefined
    ? request
    : {
      ...request,
      prompt: header.latest.prompt,
      requestConfig: header.latest.prompt.config,
      ...(includeChange && header.change !== undefined ? { promptChange: header.change } : {}),
    };
}

function withRequestConfig(node, prompt) {
  return prompt === undefined ? node : { ...node, requestConfig: prompt.config };
}

function captureSchemas(block, toolsByName, output) {
  const name = 'kind' in block ? block.call !== null ? block.call.name : undefined : block.name;
  const schema = name === undefined ? undefined : toolsByName.get(name);
  if (schema !== undefined) output.set(block.callId, schema);
  for (const child of block.subCalls) captureSchemas(child, toolsByName, output);
}

function indexTools(tools) {
  return new Map(tools.map((tool) => [tool.name, tool]));
}

const COMPACTION_INTERRUPTED_ERROR = 'Compaction was interrupted before completion.';

function interruptCompactions(requests, boundaries) {
  let nextRequest = 0;
  const runningCompactions = [];
  for (const boundary of boundaries) {
    while (nextRequest < requests.length) {
      const request = requests[nextRequest];
      if (request === undefined || request.startSeq >= boundary.seq) break;
      if (request.purpose === 'compaction' && request.status === 'running') {
        runningCompactions.push(nextRequest);
      }
      nextRequest++;
    }
    let index = runningCompactions.pop();
    while (index !== undefined && requests[index] !== undefined
      && requests[index].status !== 'running') {
      index = runningCompactions.pop();
    }
    if (index === undefined) continue;
    const request = requests[index];
    if (request === undefined || request.purpose !== 'compaction') continue;
    requests[index] = {
      ...request,
      completedAt: boundary.time,
      status: 'error',
      error: COMPACTION_INTERRUPTED_ERROR,
    };
  }
}

function applyTurnErrors(requests, endings) {
  const lastAssistantByTurn = new Map();
  for (const [index, request] of requests.entries()) {
    if (request.purpose === 'assistant') lastAssistantByTurn.set(request.turn, index);
  }
  for (const ending of endings) {
    if (ending.error === undefined) continue;
    const index = lastAssistantByTurn.get(ending.turn);
    if (index === undefined) continue;
    const request = requests[index];
    if (request === undefined || request.purpose !== 'assistant') continue;
    requests[index] = {
      ...request,
      completedAt: request.completedAt !== null ? request.completedAt : ending.time,
      status: 'error',
      error: ending.error,
      ...(ending.errorCode === undefined ? {} : { errorCode: ending.errorCode }),
    };
  }
}

// ---------------------------------------------------------------------------
// Surface ledger: reconstruct each assistant request's complete messages.
// ---------------------------------------------------------------------------

function applySurfaceRecord(entries, record) {
  const next = { seq: record.seq, message: record.message };
  const operation = record.operation;
  if (operation.kind === 'append') {
    entries.push(next);
    return;
  }
  const start = entries.findIndex(entry => entry.seq === operation.start);
  const end = entries.findIndex(entry => entry.seq === operation.end);
  if (start === -1 || end === -1 || start > end) {
    entries.splice(0, entries.length, next);
    return;
  }
  entries.splice(start, end - start + 1, next);
}

function attachRequestMessages(requests, records) {
  const entries = [];
  let recordIndex = 0;
  for (const [requestIndex, request] of requests.entries()) {
    if (request.purpose !== 'assistant') continue;
    const boundary = request.resultSeq !== undefined
      ? request.resultSeq
      : request.completedSeq !== undefined ? request.completedSeq : Number.POSITIVE_INFINITY;
    while ((records[recordIndex] !== undefined ? records[recordIndex].seq : Number.POSITIVE_INFINITY) < boundary) {
      applySurfaceRecord(entries, records[recordIndex]);
      recordIndex++;
    }
    requests[requestIndex] = {
      ...request,
      messages: entries.flatMap(entry => entry.message === null ? [] : [entry.message]),
    };
  }
}

// ---------------------------------------------------------------------------
// Builder + view definition.
// ---------------------------------------------------------------------------

class WorkflowSnapshotBuilder {
  constructor() {
    this.nodes = new Map();
    this.positions = new Map();
    this.contributions = [];
    this.empty = EMPTY_WORKFLOW_SNAPSHOT;
  }

  replace(input) {
    this.nodes.clear();
    for (const node of input.nodes) this.nodes.set(node.key, node);
    this.rebuildContributions();
    return this.snapshot();
  }

  apply(input) {
    let structural = false;
    for (const node of input.upserts) {
      const previous = this.nodes.get(node.key);
      this.nodes.set(node.key, node);
      if (previous === undefined || previous.anchorSeq !== node.anchorSeq) {
        structural = true;
        continue;
      }
      const position = this.positions.get(node.key);
      if (position === undefined) structural = true;
      else this.contributions[position] = node;
    }
    if (structural) this.rebuildContributions();
    return this.snapshot();
  }

  snapshot() {
    const headersByStep = new Map();
    for (const contribution of this.contributions) {
      if (contribution.data.kind !== 'request-header') continue;
      const key = headerStepKey(contribution.data.header);
      if (key === undefined) continue;
      const previous = headersByStep.get(key);
      headersByStep.set(key, {
        latest: contribution.data.header,
        ...(contribution.data.header.change !== undefined
          ? { change: contribution.data.header.change }
          : previous !== undefined && previous.change !== undefined ? { change: previous.change } : {}),
      });
    }
    const finalized = [];
    const eventLocations = new Map();
    const requests = [];
    const boundaries = [];
    const turnEndings = [];
    const callSchemas = new Map();
    const surfaceRecords = [];
    const consumedPromptChanges = new Set();
    let previousHeader;
    let previousTools = new Map();
    let partial = null;
    const runningCalls = [];

    for (const contribution of this.contributions) {
      const data = contribution.data;
      if (data.kind === 'request-header') {
        previousHeader = data.header;
        previousTools = indexTools(data.header.prompt.tools);
        continue;
      }
      if (data.kind === 'surface') {
        surfaceRecords.push(data.record);
        continue;
      }
      if (data.kind === 'node') {
        finalized.push(data.node);
        eventLocations.set(data.node.seq, contribution.location);
        continue;
      }
      if (data.kind === 'assistant') {
        const header = data.request === undefined
          ? undefined
          : headerFor(data.request, headersByStep, previousHeader);
        if (data.node !== undefined) finalized.push(withRequestConfig(data.node, header !== undefined ? header.latest.prompt : undefined));
        if (data.partial !== null) partial = data.partial;
        if (data.request !== undefined) {
          const change = header !== undefined ? header.change : undefined;
          const includeChange = change !== undefined && !consumedPromptChanges.has(change.seq);
          requests.push(applyHeader(data.request, header, includeChange));
          if (includeChange) consumedPromptChanges.add(change.seq);
        }
        continue;
      }
      if (data.kind === 'tool') {
        if ('kind' in data.root) finalized.push(data.root);
        else runningCalls.push(data.root);
        if (previousHeader !== undefined && previousHeader.seq < contribution.anchorSeq) {
          captureSchemas(data.root, previousTools, callSchemas);
        }
        continue;
      }
      if (data.kind === 'compaction') {
        requests.push(data.request);
        continue;
      }
      if (data.kind === 'session-end') {
        boundaries.push({ seq: data.seq, time: data.time });
        continue;
      }
      turnEndings.push({
        turn: data.turn,
        time: data.time,
        ...(data.error === undefined ? {} : { error: data.error }),
        ...(data.errorCode === undefined ? {} : { errorCode: data.errorCode }),
      });
    }

    requests.sort((left, right) => left.startSeq - right.startSeq);
    interruptCompactions(requests, boundaries);
    applyTurnErrors(requests, turnEndings);
    attachRequestMessages(requests, surfaceRecords);
    finalized.sort((left, right) => left.seq - right.seq);
    return {
      eventNodes: finalized,
      eventLocations,
      requests,
      callSchemas,
      partial,
      runningCalls,
    };
  }

  rebuildContributions() {
    this.contributions = [...this.nodes.values()]
      .sort((left, right) => left.anchorSeq - right.anchorSeq || left.key.localeCompare(right.key));
    this.positions.clear();
    for (const [index, contribution] of this.contributions.entries()) {
      this.positions.set(contribution.key, index);
    }
  }
}

/** Workflow target factory preserving the existing stage-oriented view model. */
const workflowViewDefinition = {
  target: 'workflow',
  create: () => new WorkflowSnapshotBuilder(),
};

/**
 * Register the stage-oriented Workflow target builder.
 * @param ctx - Plugin context receiving the view Definition.
 */
function registerWorkflowConversationView(ctx) {
  ctx.uiConversation.views.register(workflowViewDefinition);
}
