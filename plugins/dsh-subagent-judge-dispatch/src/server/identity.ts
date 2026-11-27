/** Durable session facts used to identify a child and its initial task. */
export interface SessionLike {
  readonly header: SessionHeaderLike;
  readonly inheritedEventCount?: number;
  ownEvents?(): readonly SessionEventLike[];
  snapshotEvents(from?: number): readonly SessionEventLike[];
}

export interface SessionHeaderLike {
  readonly id: string;
  readonly parentSession?: string;
  readonly delegationDepth?: number;
  readonly origin?: 'subagent';
}

export interface SessionEventLike {
  readonly type: string;
  readonly data?: unknown;
}

export interface AgentLike {
  readonly id: string;
  readonly options: { readonly subagentDepth?: number };
  readonly session: SessionLike;
}

function ownEventsOf(session: SessionLike): readonly SessionEventLike[] {
  return session.ownEvents?.() ?? session.snapshotEvents(session.inheritedEventCount ?? 0);
}

export function isSubagent(agent: AgentLike): boolean {
  const fromHeader = agent.session.header.delegationDepth;
  const fromOptions = agent.options.subagentDepth;
  return Math.max(
    typeof fromHeader === 'number' && Number.isSafeInteger(fromHeader) ? fromHeader : 0,
    typeof fromOptions === 'number' && Number.isSafeInteger(fromOptions) ? fromOptions : 0,
  ) >= 1;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readText(block: unknown): string | undefined {
  const data = asRecord(block);
  return data?.type === 'text' && typeof data.text === 'string' ? data.text : undefined;
}

const RETURN_GUIDANCE = 'Your final answer is delivered automatically if your parent is still online.';

/** Read the first accepted parent relay, excluding the sender line and result-delivery guidance. */
function readInitialTask(events: readonly SessionEventLike[], parentId: string): string | undefined {
  for (const event of events) {
    const inserted = asRecord(event.data)?.inserted;
    const messages = event.type === 'user/message' ? [event.data]
      : event.type === 'agent/inbox/spliced' && Array.isArray(inserted) ? inserted : [];
    for (const value of messages) {
      const message = asRecord(value);
      const source = asRecord(message?.source);
      if (source?.kind !== 'agent-message' || source.form !== 'relay' || source.senderSessionId !== parentId) continue;
      if (!Array.isArray(message?.content)) return undefined;
      const [sender, ...body] = message.content;
      if (!/^Agent .+ sent a message: $/.test(readText(sender) ?? '')) return undefined;
      const texts = body.map(readText).filter((text): text is string => text !== undefined);
      if (texts.length > 1 && texts.at(-1)?.startsWith(RETURN_GUIDANCE)) texts.pop();
      return texts.join('\n').trim() || undefined;
    }
  }
  return undefined;
}

const DELEGATION_TOOLS: ReadonlySet<unknown> = new Set(['subagent', 'subagent_fork']);

interface DelegatedTask {
  label: string;
  text: string;
  explicitRoute: boolean;
}

function matchingCall(data: Record<string, unknown>, label: string): DelegatedTask | undefined {
  if (!DELEGATION_TOOLS.has(data.name)) return undefined;
  let args = data.arguments;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { return undefined; }
  }
  const call = asRecord(args);
  if (typeof call?.description !== 'string' || call.description.trim() !== label ||
      typeof call.prompt !== 'string' || call.prompt.trim() === '') return undefined;
  return {
    label,
    text: call.prompt.trim(),
    explicitRoute: call.provider !== undefined || call.model !== undefined || call.reasoning_effort !== undefined,
  };
}

/** Find unfinished calls in the step that created the child. */
function outstandingDelegation(
  events: readonly SessionEventLike[],
  label: string,
  resumedChildId?: string,
): DelegatedTask | undefined {
  const end = resumedChildId === undefined ? events.length : events.findIndex((event) =>
    event.type === 'subagent/catalog' && asRecord(event.data)?.childId === resumedChildId,
  );
  const finished = new Set<string>();
  let task: DelegatedTask | undefined;
  for (let index = end - 1; index >= 0; index -= 1) {
    const { type, data: value } = events[index];
    if (type === 'step/start' || type === 'step/end' || type === 'turn/start' || type === 'turn/end') break;
    const data = asRecord(value);
    if (data === undefined) continue;
    switch (type) {
      case 'tool/result': {
        const id = asRecord(data.message)?.toolCallId;
        if (typeof id === 'string') finished.add(`native:${id}`);
        break;
      }
      case 'tool/ptc-dispatch':
        if (typeof data.subCallId === 'string') finished.add(`ptc:${data.subCallId}`);
        break;
      case 'tool/call': case 'tool/ptc-dispatch-start': {
        const ptc = type === 'tool/ptc-dispatch-start';
        const id = ptc ? data.subCallId : data.callId;
        if (typeof id !== 'string' || finished.has(`${ptc ? 'ptc' : 'native'}:${id}`)) break;
        const candidate = matchingCall(data, label);
        if (candidate === undefined) break;
        if (task !== undefined) return undefined;
        task = candidate;
        break;
      }
    }
  }
  return task;
}

/** Keep a route already selected or used by this child. */
export function hasRecordedRoute(session: SessionLike, events = ownEventsOf(session)): boolean {
  return events.some((event) => event.type === 'model/selection' || event.type === 'request/header');
}

/** Read a uniquely identified task and the route choice made by its caller. */
export function readDelegatedTask(
  agent: AgentLike,
  parentSessionOf: (id: string) => SessionLike | undefined,
  resumed: boolean,
): DelegatedTask | undefined {
  const parentId = agent.session.header.parentSession;
  if (!parentId) return undefined;
  const parent = parentSessionOf(parentId);
  if (parent?.header.id !== parentId) return undefined;
  const own = ownEventsOf(agent.session);
  if (hasRecordedRoute(agent.session, own)) return undefined;
  const descriptor = [...own].reverse().find((event) => event.type === 'subagent/descriptor');
  const label = asRecord(descriptor?.data)?.label;
  if (typeof label !== 'string' || label.trim() === '') return undefined;
  const task = outstandingDelegation(ownEventsOf(parent), label.trim(), resumed ? agent.id : undefined);
  if (task === undefined) return undefined;
  if (resumed && readInitialTask(own, parentId) !== task.text) return undefined;
  return task;
}

/**
 * Walk up a child's lineage to the top-level conversation that started it.
 *
 * A nested subagent's direct parent is another subagent, and the log's job is to
 * name the conversation the reader recognises — so the walk continues until a
 * session is a top-level conversation. A normal session fork is itself a
 * conversation, even when its header names a parent. The walk is bounded to
 * tolerate a damaged lineage.
 *
 * @param startId - the child's direct parent session id.
 * @param lookup - reads the header of a live or persisted session.
 * @returns the top-level session id, or the last id reached when the walk stops.
 */
export async function resolveRootSessionId(
  startId: string,
  lookup: (id: string) => SessionHeaderLike | undefined | Promise<SessionHeaderLike | undefined>,
): Promise<string> {
  const seen = new Set<string>([startId]);
  let current = startId;
  for (let hop = 0; hop < 32; hop += 1) {
    const header = await lookup(current);
    if (header === undefined || (header.origin !== 'subagent' && (header.delegationDepth ?? 0) < 1)) return current;
    const parent = header.parentSession;
    if (typeof parent !== 'string' || parent === '' || seen.has(parent)) return current;
    seen.add(parent);
    current = parent;
  }
  return current;
}
