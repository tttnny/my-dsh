/**
 * When the composer menu writes a selection, and when it stays quiet.
 *
 * Two gestures share one rule: a click on a model is a decision and commits at
 * once, while a reasoning level is only marked and commits when the menu
 * closes. This module decides what the click and the close each submit, so the
 * component only has to call `select` with the answer and react to it.
 */

import type { ModelReasoning } from '@deepseek-ai/dsh-api-session-controller/types'

/** One complete selection, as the directory's `select` takes it. */
export interface Selection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/**
 * A marked reasoning level. The wrapper is what distinguishes "the user marked
 * the provider default" from "the user marked nothing": both carry no level id,
 * and only the wrapper says which of them happened.
 */
export interface EffortMark {
  readonly effort: string | undefined
}

/** One segment of the reasoning row. */
export interface EffortChoice {
  readonly key: string
  readonly effort: string | undefined
  readonly label: string
}

/**
 * Build the segments for one model's reasoning row.
 * @param reasoning - the catalog's reasoning metadata, undefined when the model has none.
 * @param providerDefaultLabel - the localized label for the "follow the provider" segment.
 * @returns the segments in catalog order; the provider-default one leads when the model declares no default.
 */
export function effortChoices(
  reasoning: ModelReasoning | undefined,
  providerDefaultLabel: string,
): readonly EffortChoice[] {
  if (reasoning === undefined) return []
  return [
    ...reasoning.defaultEffort === undefined
      ? [{ key: 'provider-default', effort: undefined, label: providerDefaultLabel }]
      : [],
    ...reasoning.efforts.map((level) => ({
      key: level.id,
      effort: level.id as string | undefined,
      label: level.name,
    })),
  ]
}

/**
 * The selection a menu close submits for a marked reasoning level.
 * @param live - the selection in force right now.
 * @param marked - the level marked in the menu; null when nothing was marked.
 * @returns the selection to submit, or null when nothing changed.
 */
export function planEffortCommit(live: Selection, marked: EffortMark | null): Selection | null {
  if (marked === null || sameEffort(live.reasoningEffort, marked.effort)) return null
  return {
    provider: live.provider,
    model: live.model,
    ...marked.effort === undefined ? {} : { reasoningEffort: marked.effort },
  }
}

/**
 * The selection a model click submits.
 * @param live - the selection in force right now, null before a first selection resolves.
 * @param provider - the clicked model's provider.
 * @param model - the clicked model id.
 * @param marked - the level marked in the menu; null when nothing was marked.
 * @param reasoningOf - the catalog's reasoning metadata for one provider and model.
 * @param remembered - the level this browser last used for the target model, if any.
 * @returns the selection to submit, or null when the click changes nothing.
 */
export function planModelCommit(
  live: Selection | null,
  provider: string,
  model: string,
  marked: EffortMark | null,
  reasoningOf: (provider: string, model: string) => ModelReasoning | undefined,
  remembered?: string | undefined,
): Selection | null {
  const effortChanged = marked !== null && !sameEffort(live?.reasoningEffort, marked.effort)
  if (live !== null && sameModel(live, provider, model) && !effortChanged) return null
  const offered = reasoningOf(provider, model)
  // A level the user just marked wins; otherwise the target model's own memory
  // is restored, so switching away and back never silently resets the effort.
  const wanted = marked === null ? remembered : marked.effort
  const carried = offered !== undefined
    && wanted !== undefined
    && offered.efforts.some((level) => level.id === wanted)
  return {
    provider,
    model,
    ...carried ? { reasoningEffort: wanted } : {},
  }
}

/**
 * @param live - one selection.
 * @param provider - the provider to compare.
 * @param model - the model id to compare.
 * @returns whether both name the same model.
 */
export function sameModel(live: Selection, provider: string, model: string): boolean {
  return live.provider === provider && live.model === model
}

/**
 * @param liveEffort - the level in force, undefined meaning the provider default.
 * @param marked - the level in question.
 * @returns whether they name the same level.
 */
export function sameEffort(liveEffort: string | undefined, marked: string | undefined): boolean {
  return liveEffort === marked
}
