import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import { SETTINGS_NAMESPACE } from './enablement.ts';
import {
  isJudgeUsable,
  readPluginConfig,
  type PluginConfigRefs,
  type ResolvedConfig,
} from './server/config.ts';
import { JUDGE_API_KEY_REF, type CredentialsServiceLike } from './server/credentials.ts';
import { decideRewrite, outcomeReason } from './server/dispatch.ts';
import {
  hasRecordedRoute,
  isSubagent,
  readDelegatedTask,
  resolveRootSessionId,
  type SessionHeaderLike,
  type SessionLike,
} from './server/identity.ts';
import { JudgeBudget } from './server/judge-budget.ts';
import { judgeTaskType } from './server/judge-client.ts';
import { composeJudgeSubject, selectableRows } from './server/judge-prompt.ts';
import { LogStore } from './server/log-store.ts';
import { createFetchRoutes } from './server/router.ts';
import type { FallbackReason, LogEntry } from './server/types.ts';

/**
 * Stable Cordis loader name; the same literal as the `id` of this plugin's row
 * in `cordis.patch.yml` and as its settings namespace.
 */
export const name = SETTINGS_NAMESPACE;

/**
 * Declared services. `credentials` is the DSH-owned secret surface the judge key
 * is read through. `sessions` finds the task the parent delegated. The Fetch
 * routes ride Connection's authenticated transport, which only a Web carrier composes, so they are taken
 * through `ctx.inject` and the plugin still loads without one.
 */
export const inject = ['credentials', 'sessions'];

export { Config } from './server/config.ts';
export { JUDGE_API_KEY_REF } from './server/credentials.ts';

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
  settings: SettingsLike;
  fiber: unknown;
  get(name: 'sessionPersistence'): { stat(id: string): Promise<{ header: SessionHeaderLike } | undefined> } | undefined;
  get(name: 'subagentModelSelection'): { allowedRoutes(): readonly ModelRoute[] | undefined } | undefined;
  get(name: 'llm'): { resolveCallConfig(selection: RouteSelection, signal?: AbortSignal): Promise<unknown> } | undefined;
  on(event: string, listener: (...args: any[]) => unknown): () => void;
  effect(factory: () => void | (() => void | Promise<void>), label?: string): unknown;
  inject(names: string[] | string, callback: (ctx: HostContext) => void | (() => void)): void;
}

/** The route a child runs on; the three fields travel together. */
interface ModelRoute {
  provider: string;
  model: string;
}

interface RouteSelection extends ModelRoute {
  reasoningEffort?: string;
}

/** The Agent model face this plugin uses: read the inherited route, select the judged one. */
interface AgentModelLike {
  current(): RouteSelection | undefined;
  select(selection: RouteSelection): void;
}

/** Which Agent fields this plugin reads when a child is created. */
interface RequestAgent {
  id: string;
  options: { subagentDepth?: number };
  session: SessionLike;
  model: AgentModelLike;
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
  const lifetime = new AbortController();
  /** Children already judged, so a ten-step child is asked about once. */
  const judged = new JudgedChildren();
  let apiKey = '';

  void log.init();

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
   * Runs on `agent/created`, which the Host awaits before releasing the child's
   * queued work: the route selected here is the one the child's first step
   * prepares with.
   *
   * Never throws and never cancels: every failure path writes nothing, which is
   * what makes a judge outage cost latency and nothing else. The judgement is
   * awaited because the Host awaits this hook, so it can add up to the judge
   * budget to that one delegation.
   */
  ctx.on('agent/created', async ({ agent, source, signal }: {
    agent?: RequestAgent; source: string; signal?: AbortSignal;
  }) => {
    const cancellation = signal === undefined ? lifetime.signal : AbortSignal.any([signal, lifetime.signal]);
    if (agent === undefined || !isSubagent(agent) || judged.has(agent.id) || cancellation.aborted) return;
    if (source !== 'startup' && source !== 'resume') return;

    const budget = new JudgeBudget(cancellation);
    try {
      const lookup = (id: string) => ctx.sessions.get(id) as SessionLike | undefined;
      const parentId = agent.session.header.parentSession;
      const rootId = parentId ? await budget.run(() => resolveRootSessionId(parentId, async (id) => {
        budget.check();
        return lookup(id)?.header ?? (await ctx.get('sessionPersistence')?.stat(id))?.header;
      })) : undefined;
      const cfg = resolvedConfig();
      if (cancellation.aborted || !isJudgeUsable(cfg, rootId) || judged.has(agent.id)) return;
      const task = readDelegatedTask(agent, lookup, source === 'resume');
      if (task === undefined || task.explicitRoute) return;
      judged.add(agent.id);

      const { label, text: taskText } = task;
      const inherited = agent.model.current() ?? { provider: '', model: '' };
      const outcome = await judgeTaskType(
        { url: cfg.endpointUrl, model: cfg.judgeModel, apiKey },
        selectableRows(cfg.rows),
        composeJudgeSubject(label, taskText),
        fetch,
        budget,
      );
      let decision = decideRewrite(outcome);
      let routeFailure: FallbackReason | undefined;
      if (decision.kind === 'rewrite') {
        const route = decision.rewrite;
        const llm = ctx.get('llm');
        const allowed = (): boolean => ctx.get('subagentModelSelection')?.allowedRoutes()?.some(
          (pair) => pair.provider === route.provider && pair.model === route.model,
        ) === true;
        try {
          if (llm === undefined || !allowed()) throw new Error('Unavailable child route');
          await budget.run((preflightSignal) => llm.resolveCallConfig(route, preflightSignal));
          if (!allowed()) throw new Error('Child route no longer allowed');
          if (cancellation.aborted || !isJudgeUsable(resolvedConfig(), rootId) || hasRecordedRoute(agent.session)) return;
          budget.check();
          agent.model.select(route);
        } catch {
          decision = { kind: 'none' };
          routeFailure = budget.expired() ? 'timeout' : 'unavailable-route';
        }
      }

      if (resolvedConfig().logEnabled && !cancellation.aborted) {
        log.append(buildEntry(inherited, decision, outcome, budget.elapsed(), routeFailure));
      }
    } catch {
      // A judge outage, an unreadable parent log or a Host rejection of the
      // selection costs this delegation latency and nothing else.
    } finally {
      budget.dispose();
    }
  });

  // The three reads only the Host can answer. Connection's /api transport is
  // composed by a Web carrier; without one the plugin loads and simply has no
  // HTTP surface.
  ctx.inject(['connection'], (connectionCtx) => {
    const routes = createFetchRoutes({
      config: resolvedConfig,
      log: () => log.readLatest(),
      apiKey: () => apiKey,
    });
    const disposers = routes.map((route) =>
      (connectionCtx as HostContext & { connection: HostConnectionHandle }).connection.fetch.register(route)
    );
    return () => {
      for (const dispose of disposers) void Promise.resolve(dispose()).catch(() => {});
    };
  });

  // 每次追加都立刻开写；卸载时再等一次在飞的写落地，卸载不丢最后那条。
  ctx.effect(
    () => () => {
      lifetime.abort();
      return log.flush();
    },
    'dsh-subagent-judge-dispatch: judgement log flush',
  );
}

/**
 * Build the log row for one judged delegation.
 *
 * A fallback row reports the route the child actually keeps — the main agent's
 * resolved provider, model and effort — rather than a blank, because the point
 * of the row is what the child ran on.
 */
function buildEntry(
  resolved: RouteSelection,
  decision: ReturnType<typeof decideRewrite>,
  outcome: Awaited<ReturnType<typeof judgeTaskType>>,
  latencyMs: number,
  routeFailure: FallbackReason | undefined,
): LogEntry {
  const matched = decision.kind === 'rewrite';
  const reason = routeFailure ?? outcomeReason(outcome, decision);
  return {
    typeId: matched && outcome.kind === 'matched' ? outcome.row.id : null,
    provider: matched ? decision.rewrite.provider : resolved.provider,
    model: matched ? decision.rewrite.model : resolved.model,
    effort: matched
      ? decision.rewrite.reasoningEffort
      : typeof resolved.reasoningEffort === 'string' ? resolved.reasoningEffort : '',
    ...reason === undefined ? {} : { reason },
    at: Date.now(),
    latencyMs,
    ...outcome.metrics === undefined ? {} : { metrics: outcome.metrics },
  };
}