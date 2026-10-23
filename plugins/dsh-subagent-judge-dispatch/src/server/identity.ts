/**
 * Reading one subagent's identity, from the child Agent alone.
 *
 * Inside `agent/request` the plugin holds a child Agent and nothing else: no
 * delegation record, no parent handle. Everything the log needs — what the child
 * was asked to do, and which conversation asked for it — has to be read back out
 * of the child's own durable session facts.
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
export function ownEventsOf(session: SessionLike): readonly SessionEventLike[] {
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

/** Opening words of the return guidance the Host appends to a delegation. */
export const RETURN_GUIDANCE_PREFIX = 'Your parent agent id is ';

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
 * Two shapes carry that message, and both are read because the judgement runs
 * before the second one exists. A delegation starts as pending inbox input, so
 * it first appears inside an `agent/inbox/spliced` event; the Host claims it at
 * the step boundary and only then appends the `user/message` carrying it. The
 * judge is asked during the step's request, which is before that append — so
 * reading only `user/message` would find nothing on the very request that
 * matters. From the next step on the `user/message` is there instead.
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
export function readTaskText(agent: AgentLike): string {
  for (const event of ownEventsOf(agent.session)) {
    const candidates = delegationMessagesOf(event);
    for (const data of candidates) {
      const blocks = textBlocksOf(data);
      // The guidance is appended last; a task that happens to open with the same
      // words is still honored because only the trailing block is examined.
      if (blocks.length > 1 && blocks[blocks.length - 1].startsWith(RETURN_GUIDANCE_PREFIX)) {
        blocks.pop();
      }
      const text = blocks.join('\n').trim();
      if (text !== '') return text;
    }
  }
  return '';
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
