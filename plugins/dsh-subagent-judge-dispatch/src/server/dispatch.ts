/**
 * The decision half: given what the judge said, decide exactly what to write
 * onto a subagent's next model call — or write nothing at all.
 *
 * This module holds the one rule that matters most, so it is a pure function
 * that a test can drive directly: **any** judgement that did not end in a
 * usable row writes nothing. Not "writes the inherited values", not "writes a
 * partial route" — nothing. Writing anything is a replacement, so a fallback
 * that wrote the parent's own values back would still be an overwrite, and a
 * partial write would drop the inherited reasoning effort
 * (`resolveChildAgentOptions` deletes it when a route changes without one).
 */

import { isSelectableRow } from './judge-prompt.ts';
import type { FallbackReason, JudgeOutcome, TypeRow } from './types.ts';

/** The three fields a rewrite carries, all present or none at all. */
export interface RouteRewrite {
  provider: string;
  model: string;
  reasoningEffort: string;
}

/** What to write for one judged subagent. */
export type DispatchDecision =
  | { kind: 'rewrite'; rewrite: RouteRewrite }
  | { kind: 'none' };

/**
 * Turn a judgement into the rewrite it authorises.
 *
 * The three fields travel as one object because they must be written as one:
 * a route change without an explicit effort makes the Host drop the inherited
 * effort, so a caller can never be handed two of the three.
 *
 * @param outcome - what the judge call produced.
 * @returns the rewrite, or `none` when the child must inherit unchanged.
 */
export function decideRewrite(outcome: JudgeOutcome): DispatchDecision {
  if (outcome.kind !== 'matched') return { kind: 'none' };
  const row: TypeRow = outcome.row;
  // A row the judge could select but that is missing a piece is not a rewrite
  // this plugin may make; leaving the child alone is always safe.
  if (!isSelectableRow(row)) return { kind: 'none' };
  return {
    kind: 'rewrite',
    rewrite: {
      provider: row.provider.trim(),
      model: row.model.trim(),
      reasoningEffort: row.effort.trim(),
    },
  };
}

/**
 * Why a delegation ended up inheriting, as the log reports it.
 *
 * The judge answering nothing, the judge answering a number this list does not
 * have, an unreachable endpoint and an expired budget are four different fixes
 * for the reader — "it answered nothing" points at the endpoint, "no listed
 * type" points at the descriptions. A selected row that turned out to be missing
 * a field is a fifth: the judgement worked, the row it named was not usable.
 *
 * A judgement that produced a rewrite has no reason at all.
 *
 * @param outcome - what the judge call produced.
 * @param decision - what was written for it.
 * @returns the reason to record, or undefined when the rewrite landed.
 */
export function outcomeReason(
  outcome: JudgeOutcome,
  decision: DispatchDecision,
): FallbackReason | undefined {
  if (decision.kind === 'rewrite') return undefined;
  if (outcome.kind !== 'matched') return outcome.reason;
  return 'incomplete';
}

/**
 * Apply a rewrite onto one model-call configuration.
 *
 * The incoming configuration is returned untouched on `none`, which is what
 * makes "the child inherits exactly what the main agent runs" true rather than
 * approximated: no field is restated, so nothing about the call changes.
 *
 * @param config - the call configuration the Host resolved.
 * @param decision - what to write.
 * @returns the configuration to use.
 */
export function applyDecision<T extends { provider: string; model: string; reasoningEffort?: unknown }>(
  config: T,
  decision: DispatchDecision,
): T {
  if (decision.kind === 'none') return config;
  return {
    ...config,
    provider: decision.rewrite.provider,
    model: decision.rewrite.model,
    reasoningEffort: decision.rewrite.reasoningEffort,
  };
}
