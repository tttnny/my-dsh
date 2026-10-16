import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import {
  isJudgeUsable,
  readPluginConfig,
  SETTINGS_NAMESPACE,
  type PluginConfigRefs,
  type ResolvedConfig,
} from './server/config.ts';
import { JUDGE_API_KEY_REF, type CredentialsServiceLike } from './server/credentials.ts';
import { applyDecision, decideRewrite, outcomeReason } from './server/dispatch.ts';
import {
  isSubagent,
  readChildLabel,
  readTaskText,
  resolveRootSessionId,
  type SessionLike,
} from './server/identity.ts';
import { judgeTaskType } from './server/judge-client.ts';
import { selectableRows } from './server/judge-prompt.ts';
import { LogStore } from './server/log-store.ts';
import { createFetchRoutes } from './server/router.ts';
import type { LogEntry } from './server/types.ts';

/**
 * Stable Cordis loader name; the same literal as the `id` of this plugin's row
 * in `cordis.patch.yml` and as its settings namespace.
 */
export const name = SETTINGS_NAMESPACE;

/**
 * Declared services. `credentials` is the DSH-owned secret surface the judge key
 * is read through; `sessions` and `sessionTitle` turn a child Agent's id into the
 * conversation title the log shows. The Fetch routes ride Connection's
 * authenticated transport, which only a Web carrier composes, so they are taken
 * through `ctx.inject` and the plugin still loads without one.
 */
export const inject = ['credentials', 'sessions', 'sessionTitle'];

export { Config, DEFAULT_ENDPOINT_URL, DEFAULT_JUDGE_MODEL } from './server/config.ts';
export { JUDGE_API_KEY_REF } from './server/credentials.ts';

/** Minimal structural shape of the `sessionTitle` service. */
interface SessionTitleLike {
  get(session: unknown): { title: string } | undefined;
}

/** Minimal structural shape of this plugin's own `settings` usage. */
interface SettingsLike {
  configure(presentation: { auto?: boolean }, owner?: unknown): () => void;
}

/**
 * The Host context surface this plugin uses.
 *
 * Declared structurally rather than by extending `Context`: the fields read here
 * (`inject` with a narrower dependency list, `on` for one waterfall event) are a
 * subset with a deliberately looser signature, and widening `inject` to satisfy
 * the interface would hide the services this plugin actually declares through
 * the exported `inject` table.
 */
interface HostContext {
  credentials: CredentialsServiceLike;
  sessions: { get(id: string): unknown };
  sessionTitle: SessionTitleLike;
  settings: SettingsLike;
  fiber: unknown;
  on(event: string, listener: (...args: any[]) => unknown): () => void;
  effect(factory: () => void | (() => void), label?: string): unknown;
  inject(names: string[] | string, callback: (ctx: HostContext) => void | (() => void)): void;
}

/** Which Agent fields this plugin reads inside the request hook. */
interface RequestAgent {
  id: string;
  options: { subagentDepth?: number };
  session: SessionLike;
}

/** One resolved model call the waterfall hands through. */
interface CallConfig {
  provider: string;
  model: string;
  reasoningEffort?: unknown;
  [key: string]: unknown;
}

/** How many judged children to remember before forgetting the oldest. */
const JUDGED_LIMIT = 500;

/**
 * The set of children already judged, bounded so a long-running instance cannot
 * grow without limit.
 *
 * Insertion order is eviction order: a `Set` iterates oldest-first, so the one
 * entry that goes is always the earliest judgement. Forgetting a very old child
 * costs at most one extra judgement should it somehow make another request,
 * which is strictly better than an unbounded map keyed by every subagent ever
 * delegated.
 */
class JudgedChildren {
  private readonly seen = new Set<string>();

  /** Record a child as judged, forgetting the oldest entry past the cap. */
  add(id: string): void {
    this.seen.add(id);
    if (this.seen.size <= JUDGED_LIMIT) return;
    const oldest = this.seen.values().next();
    if (!oldest.done) this.seen.delete(oldest.value);
  }

  /** Whether this child has already been judged. */
  has(id: string): boolean {
    return this.seen.has(id);
  }
}

/**
 * Mount the host half: judge every subagent once, write the route the judgement
 * chose, and keep the log the Plugins page reads.
 *
 * @param ctx - DSH Host context.
 * @param config - this plugin's runtime-resolved Config (every field a live ref).
 */
export function apply(ctx: HostContext, config: PluginConfigRefs): void {
  const log = new LogStore();
  /** Children already judged, so a ten-step child is asked about once. */
  const judged = new JudgedChildren();
  let apiKey = '';

  const resolvedConfig = (): ResolvedConfig => readPluginConfig(config);

  /** Re-read the judge key; a key set outside the page takes effect at once. */
  const refreshKey = async (): Promise<void> => {
    try {
      apiKey = ((await ctx.credentials.resolve(JUDGE_API_KEY_REF))?.value ?? '').trim();
    } catch {
      apiKey = '';
    }
  };
  void refreshKey();
  ctx.on('credentials/reference-updated', () => {
    void refreshKey();
  });

  // Settings are read and written through the Plugins page's own card; DSH must
  // not also derive a generic settings form for the same entry.
  ctx.inject(['settings'], (child) => {
    child.effect(
      () => child.settings.configure({ auto: false }, child.fiber),
      'dsh-subagent-judge-dispatch: settings page policy'
    );
  });

  /**
   * The delegation hook: one judgement per subagent, then the route it chose.
   *
   * Never throws and never cancels: every failure path returns the config the
   * Host already resolved, which is what makes a judge outage cost latency and
   * nothing else. The judgement is awaited because the Host awaits this
   * waterfall, so it can add up to the judge budget to that one delegation.
   */
  ctx.on('agent/request', async (payload: { agent?: RequestAgent }, next: () => Promise<CallConfig>) => {
    const resolved = await next();
    const agent = payload?.agent;
    if (agent === undefined) return resolved;
    const cfg = resolvedConfig();
    // Only subagents, and only while the model-rewrite switch is on: with it off
    // nothing is judged and nothing is logged, so the log only ever holds
    // judgements that actually ran.
    if (!isSubagent(agent) || !cfg.enabled) return resolved;
    if (judged.has(agent.id)) return resolved;
    if (!isJudgeUsable(cfg)) return resolved;
    judged.add(agent.id);

    const taskText = readChildLabel(agent) || readTaskText(agent);
    const outcome = await judgeTaskType(
      { url: cfg.endpointUrl, model: cfg.judgeModel, apiKey },
      selectableRows(cfg.rows),
      taskText,
    );
    const decision = decideRewrite(outcome);

    if (cfg.logEnabled) {
      log.append(buildEntry(ctx, agent, resolved, decision, outcome, taskText));
    }
    return applyDecision(resolved, decision);
  });

  // The three reads only the Host can answer. Connection's /api transport is
  // composed by a Web carrier; without one the plugin loads and simply has no
  // HTTP surface.
  ctx.inject(['connection'], (connectionCtx) => {
    const routes = createFetchRoutes({
      config: resolvedConfig,
      log: () => log.list(),
      apiKey: () => apiKey,
    });
    const disposers = routes.map((route) =>
      (connectionCtx as HostContext & { connection: HostConnectionHandle }).connection.fetch.register(route)
    );
    return () => {
      for (const dispose of disposers) void Promise.resolve(dispose()).catch(() => {});
    };
  });
}

/**
 * Build the log row for one judged delegation.
 *
 * A fallback row reports the route the child actually keeps — the main agent's
 * resolved provider, model and effort — rather than a blank, because the point
 * of the row is what the child ran on.
 */
function buildEntry(
  ctx: HostContext,
  agent: RequestAgent,
  resolved: CallConfig,
  decision: ReturnType<typeof decideRewrite>,
  outcome: Awaited<ReturnType<typeof judgeTaskType>>,
  taskText: string,
): LogEntry {
  const matched = decision.kind === 'rewrite';
  const reason = outcomeReason(outcome, decision);
  return {
    typeId: matched && outcome.kind === 'matched' ? outcome.row.id : null,
    model: matched ? decision.rewrite.model : resolved.model,
    effort: matched
      ? decision.rewrite.reasoningEffort
      : typeof resolved.reasoningEffort === 'string' ? resolved.reasoningEffort : '',
    source: matched ? 'judged' : 'inherited',
    ...reason === undefined ? {} : { reason },
    at: Date.now(),
    latencyMs: outcome.latencyMs,
    parentTitle: readParentTitle(ctx, agent.session.header.parentSession),
    childLabel: truncate(taskText),
  };
}

/**
 * Name the conversation that delegated, the way the reader sees it in the
 * session list: its title, falling back to the session id when it has none.
 */
function readParentTitle(ctx: HostContext, parentId: string | undefined): string {
  if (typeof parentId !== 'string' || parentId === '') return '';
  try {
    const rootId = resolveRootSessionId(parentId, (id) => ctx.sessions.get(id) as SessionLike | undefined);
    const session = ctx.sessions.get(rootId);
    if (session === undefined) return rootId;
    const title = ctx.sessionTitle.get(session)?.title;
    return typeof title === 'string' && title.trim() !== '' ? title.trim() : rootId;
  } catch {
    return parentId;
  }
}

/** Keep one log label to a readable length. */
function truncate(text: string, max = 60): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}
