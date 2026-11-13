/**
 * Reading one subagent's identity, from the child Agent and the session log.
 *
 * When the child is created the plugin holds a child Agent and nothing else: no
 * delegation record, no parent handle. Everything the log needs — what the child
 * was asked to do, and which conversation asked for it — has to be read back out
 * of durable session facts: the child's own events, and the delegating call the
 * parent has already logged.
 */

/**
 * The read surface of a Session this module needs; kept structural for tests.
 *
 * `ownEvents` (or `snapshotEvents(inheritedEventCount)`) is the child-owned tail
 * of the log. It matters: a forked child's log opens with the parent's finished
 * turns, so reading from the start would hand the judge the ANCESTOR's
 * descriptor label and the parent conversation's first message.
 */
export interface SessionLike {
  readonly header: { readonly parentSession?: string; readonly delegationDepth?: number };
  readonly inheritedEventCount?: number;
  ownEvents?(): readonly SessionEventLike[];
  snapshotEvents(from?: number): readonly SessionEventLike[];
}

/** One session event as this module reads it. */
export interface SessionEventLike {
  readonly type: string;
  readonly data?: unknown;
}

/** The read surface of an Agent this module needs. */
export interface AgentLike {
  readonly id: string;
  readonly options: { readonly subagentDepth?: number };
  readonly session: SessionLike;
}

/**
 * Read only the events this child itself produced.
 *
 * A forked child inherits the parent's completed prefix, and the inherited part
 * carries an ancestor's descriptor and the parent's own messages. Everything
 * this module reads must come from the child-owned tail, or the judge is told
 * about a different agent's job. Three shapes are accepted because the session
 * type is structural here: `ownEvents()`, `snapshotEvents(from)` with the
 * inherited count, and a plain full read as the last resort.
 *
 * @param session - the child's session.
 * @returns the child-owned events, in log order.
 */
function ownEventsOf(session: SessionLike): readonly SessionEventLike[] {
  if (typeof session.ownEvents === 'function') return session.ownEvents();
  const inherited = session.inheritedEventCount;
  if (typeof inherited === 'number' && Number.isSafeInteger(inherited) && inherited > 0) {
    return session.snapshotEvents(inherited);
  }
  return session.snapshotEvents();
}

/**
 * Whether one agent is a subagent, rather than a top-level conversation.
 *
 * Two sources are consulted because neither alone is complete: the durable
 * header is authoritative and monotone (a resumed child keeps its depth), while
 * `options.subagentDepth` is stamped onto the live options and may deepen the
 * count but never lower it. Absence in both means a top-level agent.
 *
 * @param agent - the agent making the request.
 * @returns whether this is a subagent.
 */
export function isSubagent(agent: AgentLike): boolean {
  const fromHeader = agent.session.header.delegationDepth;
  const fromOptions = agent.options.subagentDepth;
  const depth = Math.max(
    typeof fromHeader === 'number' && Number.isSafeInteger(fromHeader) ? fromHeader : 0,
    typeof fromOptions === 'number' && Number.isSafeInteger(fromOptions) ? fromOptions : 0,
  );
  return depth >= 1;
}

/**
 * Opening words of every return guidance the Host has appended to a delegation.
 *
 * The Host changed the wording in 0.2.2-rc.2. The block used to name the parent
 * session id and ask for an explicit `send_message`; it now only promises that
 * the final answer is delivered. A log written by either release stays readable,
 * so both openings are recognized.
 */
const RETURN_GUIDANCE_PREFIXES = [
  'Your parent agent id is ',
  'Your final answer is delivered automatically if your ',
] as const;

/**
 * @param text - one trailing text block of a delegation message.
 * @returns whether it opens like the Host's return guidance.
 */
function isReturnGuidance(text: string): boolean {
  return RETURN_GUIDANCE_PREFIXES.some((prefix) => text.startsWith(prefix));
}

/**
 * Read the child's delegation description.
 *
 * The subagent tool passes the model's `description` as the activation label,
 * and the child's durable descriptor keeps it — which is why it is readable here
 * without the parent's tool call. Only the child's OWN events are read, and the
 * LAST descriptor wins: a resumed or re-activated child appends a fresh one, and
 * the newest is the delegation actually running.
 *
 * The label is a display summary the delegating agent wrote, so it is returned
 * on its own and never merged with the task text: the judge gets the label as a
 * heading over the task, and the log's subagent column gets the label alone.
 *
 * @param agent - the subagent.
 * @returns the description, or '' when its descriptor carries none.
 */
export function readChildLabel(agent: AgentLike): string {
  let found = '';
  for (const event of ownEventsOf(agent.session)) {
    if (event.type !== 'subagent/descriptor') continue;
    const data = event.data;
    if (typeof data !== 'object' || data === null) continue;
    const label = (data as { label?: unknown }).label;
    if (typeof label === 'string' && label.trim() !== '') found = label.trim();
  }
  return found;
}

/**
 * Read the task the parent delegated.
 *
 * The delegation is the message whose `source.kind` is `user`; every other
 * producer writes user-role messages too — the working directory notice,
 * workspace instructions, the runtime snapshot, the skill catalog, the time
 * snapshot — so the source is what separates the task from the context wrapped
 * around it.
 *
 * Two shapes carry that message, and both are read because a log can hold
 * either: a delegation starts as pending inbox input, so it first appears
 * inside an `agent/inbox/spliced` event, and the Host appends the
 * `user/message` carrying it once the message is claimed at the step boundary.
 * A fresh child has neither when it is created — its delegation is read from the
 * parent's recorded call instead — so this read is what a resumed child's log
 * answers.
 *
 * The Host appends its return guidance as one trailing block of that message.
 * It tells the child how to report back, not what the job is, so it is dropped:
 * leaving it in would spend most of the subject on boilerplate.
 *
 * Only the child's OWN events are read, because a forked child's log opens with
 * the parent's finished turns.
 *
 * @param agent - the subagent.
 * @returns the delegated task text, or '' when no delegation message exists.
 */
function readTaskText(agent: AgentLike): string {
  for (const event of ownEventsOf(agent.session)) {
    const candidates = delegationMessagesOf(event);
    for (const data of candidates) {
      const blocks = textBlocksOf(data);
      // The guidance is appended last; a task that happens to open with the same
      // words is still honored because only the trailing block is examined.
      if (blocks.length > 1 && isReturnGuidance(blocks[blocks.length - 1])) {
        blocks.pop();
      }
      const text = blocks.join('\n').trim();
      if (text !== '') return text;
    }
  }
  return '';
}

/**
 * The parent-session lookup this module needs; kept structural for tests.
 */
export type ParentSessionLookup = (id: string) => SessionLike | undefined;

/**
 * The session event types that can carry a delegating tool call.
 *
 * A call the model makes directly is recorded as `tool/call`, whose
 * `arguments` is the raw JSON string the model produced. A call made from
 * inside a `run_code` program is recorded as `tool/ptc-dispatch-start`, whose
 * `arguments` is the already-normalized object. Both events are appended when
 * the call starts, before its body runs, so either one is readable while the
 * child is being created.
 */
const DELEGATION_EVENT_TYPES: ReadonlySet<string> = new Set([
  'tool/call',
  'tool/ptc-dispatch-start',
]);

/**
 * Read the task the parent delegated, at the moment the child is created.
 *
 * A fresh delegation reaches the child only after creation: the Host submits the
 * prompt as queued inbox input once the creation listeners return. So the child's
 * own log has no task yet, and the text is read from the delegating call the
 * parent recorded before dispatching. That call takes one of two shapes:
 * `tool/call` when the model called the tool directly, `tool/ptc-dispatch-start`
 * when the call came from inside a `run_code` program. A resumed child does
 * carry the message in its own log, which is why that read is tried first.
 *
 * The delegating call is identified by the description the parent wrote, which is
 * the same string the child's descriptor keeps as its label; the newest call with
 * a task prompt is the fallback when the labels cannot be matched.
 *
 * @param agent - the subagent.
 * @param parentSessionOf - resolves a session id to its live session.
 * @returns the delegated task text, or '' when no delegating call is readable.
 */
export function readDelegatedTask(agent: AgentLike, parentSessionOf: ParentSessionLookup): string {
  const own = readTaskText(agent);
  if (own !== '') return own;
  const parentId = agent.session.header.parentSession;
  if (typeof parentId !== 'string' || parentId === '') return '';
  const parent = parentSessionOf(parentId);
  if (parent === undefined || typeof parent.snapshotEvents !== 'function') return '';
  const label = readChildLabel(agent);
  const events = parent.snapshotEvents();
  let fallback = '';
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!DELEGATION_EVENT_TYPES.has(event.type)) continue;
    const call = delegatedCallOf(event.data);
    if (call === undefined) continue;
    if (label !== '' && call.description === label) return call.prompt;
    if (fallback === '') fallback = call.prompt;
  }
  return fallback;
}

/** The task prompt and description of one recorded tool call, when it carries them. */
function delegatedCallOf(data: unknown): { prompt: string; description?: string } | undefined {
  const parsed = argumentsOf(data);
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const record = parsed as { prompt?: unknown; description?: unknown };
  if (typeof record.prompt !== 'string' || record.prompt.trim() === '') return undefined;
  return {
    prompt: record.prompt,
    ...(typeof record.description === 'string' ? { description: record.description } : {}),
  };
}

/**
 * Decode one recorded call's arguments.
 *
 * The two event shapes disagree on purpose: `tool/call` keeps the model's raw
 * JSON string, while `tool/ptc-dispatch-start` keeps the normalized value.
 *
 * @param data - the event payload.
 * @returns the decoded arguments, or undefined when they cannot be read.
 */
function argumentsOf(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return undefined;
  const raw = (data as { arguments?: unknown }).arguments;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * The messages one event contributes, in log order.
 *
 * A delegation message is written twice across a child's life — once as pending
 * inbox input, once as the committed `user/message` — so both event shapes are
 * unwrapped here and the caller keeps the first usable one.
 *
 * @param event - one child-owned session event.
 * @returns the delegation-shaped messages the event carries, possibly none.
 */
function delegationMessagesOf(event: SessionEventLike): unknown[] {
  if (event.type === 'user/message') {
    return sourceOf(event.data)?.kind === 'user' ? [event.data] : [];
  }
  if (event.type === 'agent/inbox/spliced') {
    const inserted = (event.data as { inserted?: unknown } | undefined)?.inserted;
    if (!Array.isArray(inserted)) return [];
    return inserted.filter((message) => sourceOf(message)?.kind === 'user');
  }
  return [];
}

/** Read the durable producer facts off one message payload. */
function sourceOf(data: unknown): { kind: string } | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const source = (data as { source?: unknown }).source;
  if (typeof source !== 'object' || source === null) return undefined;
  const kind = (source as { kind?: unknown }).kind;
  return typeof kind === 'string' ? { kind } : undefined;
}

/** Pull the text blocks out of a message payload, in order. */
function textBlocksOf(data: unknown): string[] {
  if (typeof data !== 'object' || data === null) return [];
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  const texts: string[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const record = block as { type?: unknown; text?: unknown };
    if (record.type === 'text' && typeof record.text === 'string') texts.push(record.text);
  }
  return texts;
}

/**
 * Walk up a child's lineage to the top-level conversation that started it.
 *
 * A nested subagent's direct parent is another subagent, and the log's job is to
 * name the conversation the reader recognises — so the walk continues until a
 * session names no parent. The walk is bounded, because a resumed or forged
 * lineage must not be able to spin this loop.
 *
 * @param startId - the child's direct parent session id.
 * @param lookup - resolves a session id to its live session.
 * @returns the top-level session id, or the starting id when the walk stops.
 */
export function resolveRootSessionId(
  startId: string,
  lookup: (id: string) => SessionLike | undefined,
): string {
  const seen = new Set<string>([startId]);
  let current = startId;
  for (let hop = 0; hop < 32; hop += 1) {
    const session = lookup(current);
    const parent = session?.header.parentSession;
    if (typeof parent !== 'string' || parent === '' || seen.has(parent)) return current;
    seen.add(parent);
    current = parent;
  }
  return current;
}
