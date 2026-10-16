/**
 * Shared shapes of the judgement half: one type row, one judgement outcome, one
 * log record.
 *
 * Everything here is a plain value so the decision core stays testable without
 * a Host: the wiring in `src/index.ts` is the only code that touches cordis.
 */

/** One row of the task-type list: what the judge reads, and what it selects. */
export interface TypeRow {
  /** Sequence number the page assigns and the judge answers with. */
  id: number;
  /** Free-form description the judge reads as this type's criterion. */
  description: string;
  /** Provider route of the model this type runs on. */
  provider: string;
  /** Model id interpreted by that provider. */
  model: string;
  /** Reasoning effort id this type runs at. */
  effort: string;
}

/** Why a judgement did not produce a rewrite. */
export type FallbackReason =
  /** The judge endpoint could not be reached. */
  | 'unreachable'
  /** The judge did not answer inside the budget. */
  | 'timeout'
  /** The answer named no option this list offers. */
  | 'unmatched'
  /** The answer selected a row whose model or effort is not filled in. */
  | 'incomplete';

/** What the judge decided, and where the final route came from. */
export type JudgeOutcome =
  | {
    /** The judgement selected a usable row. */
    kind: 'matched';
    /** The row it selected. */
    row: TypeRow;
    /** How long the judgement call took, in milliseconds. */
    latencyMs: number;
  }
  | {
    /** The judgement did not produce a rewrite. */
    kind: 'fallback';
    /** Why it did not. */
    reason: FallbackReason;
    /** How long the judgement call took, in milliseconds. */
    latencyMs: number;
  };

/**
 * One row of the plugin's own log.
 *
 * The log is the only place a delegation's assigned route is visible: the
 * Host's native subagent list has no model column and plugins cannot add one.
 */
export interface LogEntry {
  /** Type number the judgement returned, or null when none matched. */
  typeId: number | null;
  /** Model the child was given, or the model it kept on a fallback. */
  model: string;
  /** Effort the child was given, or the effort it kept on a fallback. */
  effort: string;
  /** Where the route came from: the judgement, or the main agent. */
  source: 'judged' | 'inherited';
  /** Why it fell back; absent on a matched judgement. */
  reason?: FallbackReason;
  /** When the delegation was judged, as an epoch millisecond. */
  at: number;
  /** How long the judgement took, in milliseconds. */
  latencyMs: number;
  /** Title of the main conversation that delegated, or its id when untitled. */
  parentTitle: string;
  /** The subagent's delegation description. */
  childLabel: string;
}
