/** Turn and model-call projection for the visual Workflow view (plain-JS port). */

/** Lifecycle shown by a workflow turn or model call. */
const WorkflowStatus = {
  WAITING: 'waiting',
  RUNNING: 'running',
  COMPLETE: 'complete',
  ERROR: 'error',
};

const STEP_TITLE_PREFIX = 'Step ';
function stepNumber(title) {
  if (!title.startsWith(STEP_TITLE_PREFIX)) return null;
  const rest = title.slice(STEP_TITLE_PREFIX.length).trim();
  const match = /^(\d+)(?:\b|$)/.exec(rest);
  return match === null ? null : Number(match[1]);
}

function preview(cell) {
  if (cell === undefined) return '';
  return (cell.previewMarkdown ?? cell.text).replace(/\s+/g, ' ').trim();
}

function truncatePrompt(value) {
  const characters = Array.from(value);
  return characters.length > 20 ? `${characters.slice(0, 20).join('')}…` : value;
}

function callUsage(response) {
  if (response === undefined) return undefined;
  const hasInput = response.input !== undefined
    || response.cacheRead !== undefined
    || response.cacheWrite !== undefined;
  if (!hasInput && response.output === undefined) return undefined;
  return {
    inputTotal: hasInput
      ? (response.input ?? 0) + (response.cacheRead ?? 0) + (response.cacheWrite ?? 0)
      : undefined,
    inputUncached: response.input,
    cacheRead: response.cacheRead,
    cacheWrite: response.cacheWrite,
    output: response.output,
  };
}

function callStatus(request, response, tools) {
  if (request !== undefined && request.status === 'error'
    || response !== undefined && response.isError === true
    || tools.some(tool => tool.isError === true)) {
    return 'error';
  }
  if (request !== undefined && request.status === 'running'
    || tools.some(tool => tool.timeSeconds === null
      && tool.outputDetail === undefined
      && tool.result === undefined
      && tool.resultPreviewMarkdown === undefined)) {
    return 'running';
  }
  if (request !== undefined && request.status === 'complete'
    || response !== undefined
    || tools.length > 0) return 'complete';
  return 'waiting';
}

function callDuration(request, cells) {
  if (request !== undefined && request.completedAt !== null) {
    return Math.max(0, request.completedAt - request.startedAt);
  }
  const durations = cells
    .map(cell => cell.timeSeconds)
    .filter(value => value !== null && Number.isFinite(value));
  return durations.length === 0 ? null : Math.max(...durations) * 1000;
}

function turnStatus(calls) {
  if (calls.some(call => call.status === 'running')) return 'running';
  if (calls.some(call => call.status === 'error')) return 'error';
  const last = calls.at(-1);
  return last !== undefined ? last.status : 'waiting';
}

function turnDuration(turn, calls, timings) {
  const timing = timings.get(turn);
  if (timing !== undefined && timing.endTime !== undefined) {
    return Math.max(0, timing.endTime - timing.startTime);
  }
  const starts = calls
    .map(call => call.startedAt)
    .filter(value => value !== null);
  const ends = calls.flatMap(call => call.startedAt === null || call.durationMs === null
    ? []
    : [call.startedAt + call.durationMs]);
  if (starts.length === 0 || ends.length === 0) return null;
  return Math.max(0, Math.max(...ends) - Math.min(...starts));
}

/**
 * Fold the Trajectory layout into a user-turn index and model-call rows.
 * @param turns - Existing replay-safe Trajectory turn layout.
 * @param requests - Provider request lifecycles from the same projection.
 * @param timings - Session-owned turn timing boundaries (empty when absent).
 * @returns Visual workflow model ordered by user turn and step.
 */
function deriveWorkflowModel(turns, requests, timings = new Map()) {
  const assistantRequests = requests.filter(request => request.purpose === 'assistant');
  const requestsByStep = new Map(
    assistantRequests.map(request => [`${request.turn}:${request.step}`, request]),
  );
  const workflowTurns = turns.flatMap((entry) => {
    if (entry.turn === null) return [];
    const turn = entry.turn;
    const prologue = entry.groups
      .filter(group => group.title === 'Message')
      .flatMap(group => group.cells);
    const opening = prologue.find(cell => cell.kind === 'user' && cell.opensTurn === true)
      ?? prologue.find(cell => cell.kind === 'user');
    const callGroups = entry.groups.flatMap(group => stepNumber(group.title) === null ? [] : [group]);
    const calls = callGroups.flatMap((group, index) => {
      const step = stepNumber(group.title);
      if (step === null) return [];
      const request = requestsByStep.get(`${turn}:${step}`);
      const response = group.cells.find(cell => cell.kind === 'message' && cell.requestOnly !== true);
      const tools = group.cells.filter(cell => cell.kind === 'tool' || cell.kind === 'subtool');
      const inputs = [
        ...(step === 1 ? prologue.filter(cell => cell.kind === 'user' || cell.kind === 'context') : []),
        ...group.cells.filter(cell => cell.kind === 'user' || cell.kind === 'context' || cell.kind === 'system'),
      ];
      if (request === undefined && response === undefined && tools.length === 0) return [];
      const cells = [...inputs, ...(response === undefined ? [] : [response]), ...tools];
      return [{
        id: `${turn}:${step}`,
        turn,
        step,
        number: index + 1,
        request,
        messages: request !== undefined ? request.messages ?? [] : [],
        inputs,
        response,
        tools,
        usage: callUsage(response),
        status: callStatus(request, response, tools),
        startedAt: request !== undefined
          ? request.startedAt ?? (response !== undefined ? response.startedAt ?? null : null)
          : response !== undefined ? response.startedAt ?? null : null,
        durationMs: callDuration(request, cells),
      }];
    });
    const timing = timings.get(turn);
    const openingPrompt = preview(opening);
    const prompt = openingPrompt || `Turn ${turn}`;
    return [{
      turn,
      prompt,
      promptPreview: truncatePrompt(prompt),
      hasPrompt: openingPrompt !== '',
      startedAt: timing !== undefined
        ? timing.startTime ?? (opening !== undefined ? opening.startedAt ?? null : null) ?? (calls[0] !== undefined ? calls[0].startedAt : null)
        : (opening !== undefined ? opening.startedAt ?? null : null) ?? (calls[0] !== undefined ? calls[0].startedAt : null),
      durationMs: turnDuration(turn, calls, timings),
      calls,
      toolCount: calls.reduce((total, call) => total + call.tools.length, 0),
      status: turnStatus(calls),
    }];
  });
  const starts = workflowTurns
    .map(turn => turn.startedAt)
    .filter(value => value !== null);
  const ends = workflowTurns.flatMap(turn => turn.startedAt === null || turn.durationMs === null
    ? []
    : [turn.startedAt + turn.durationMs]);
  return {
    turns: workflowTurns,
    requestCount: workflowTurns.reduce((total, turn) => total + turn.calls.length, 0),
    toolCount: workflowTurns.reduce((total, turn) => total + turn.toolCount, 0),
    durationMs: starts.length === 0 || ends.length === 0
      ? null
      : Math.max(0, Math.max(...ends) - Math.min(...starts)),
  };
}
