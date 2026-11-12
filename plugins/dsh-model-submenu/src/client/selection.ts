/**
 * When the composer menu writes a selection.
 *
 * Both gestures are immediate: clicking a level submits it, clicking a model
 * submits it. The only quiet path is clicking the model already in use — that
 * closes the menu without a write. A model click also restores the level this
 * browser last used for that model, so switching away and back never silently
 * resets the effort.
 */

import type { ModelReasoning } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'

/** One complete selection, as the directory's `select` takes it. */
export interface Selection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

/** One segment of the reasoning row. */
export interface EffortChoice {
  readonly key: string
  readonly effort: string | undefined
  readonly label: string
}

/**
 * Build the slider's detents for one model.
 *
 * The provider default is deliberately absent: it is a state, not a level, and
 * giving it a detent would read as the weakest reasoning instead of "let the
 * provider decide". The label above the track switches to it.
 * @param reasoning - the catalog's reasoning metadata, undefined when the model has none.
 * @returns one detent per advertised level, in catalog order.
 */
export function effortChoices(reasoning: ModelReasoning | undefined): readonly EffortChoice[] {
  if (reasoning === undefined) return []
  return reasoning.efforts.map((level) => ({
    key: level.id,
    effort: level.id as string | undefined,
    label: level.name,
  }))
}

/**
 * The selection a level click submits.
 * @param live - the selection in force right now.
 * @param effort - the clicked level, undefined meaning the provider default.
 * @returns the selection to submit, or null when the level already is the live one.
 */
export function planEffortCommit(live: Selection, effort: string | undefined): Selection | null {
  if (sameEffort(live.reasoningEffort, effort)) return null
  return {
    provider: live.provider,
    model: live.model,
    ...effort === undefined ? {} : { reasoningEffort: effort },
  }
}

/**
 * The selection a model click submits.
 * @param live - the selection in force right now, null before a first selection resolves.
 * @param provider - the clicked model's provider.
 * @param model - the clicked model id.
 * @param reasoningOf - the catalog's reasoning metadata for one provider and model.
 * @param remembered - the level this browser last used for the target model, if any.
 * @returns the selection to submit, or null when the click changes nothing.
 */
export function planModelCommit(
  live: Selection | null,
  provider: string,
  model: string,
  reasoningOf: (provider: string, model: string) => ModelReasoning | undefined,
  remembered?: string | undefined,
): Selection | null {
  if (live !== null && sameModel(live, provider, model)) return null
  const offered = reasoningOf(provider, model)
  // The target model's own memory is restored, so switching away and back never
  // silently resets the effort.
  const carried = offered !== undefined
    && remembered !== undefined
    && offered.efforts.some((level) => level.id === remembered)
  return {
    provider,
    model,
    ...carried ? { reasoningEffort: remembered } : {},
  }
}

/**
 * The reasoning metadata the catalog advertises for the model in force.
 * @param state - the session's directory snapshot.
 * @returns the metadata, or undefined when no model is live or it advertises none.
 */
export function liveReasoning(state: ModelDirectoryState): ModelReasoning | undefined {
  const current = state.current
  if (current === null) return undefined
  return state.groups
    .find((group) => group.id === current.provider)
    ?.models.find((model) => model.id === current.model)
    ?.reasoning
}

/**
 * The selection in force, or null while the Host has not resolved one.
 * @param state - the session's directory snapshot.
 * @returns the live selection, with the effort only when one is set.
 */
export function selectionOf(state: ModelDirectoryState): Selection | null {
  if (state.current === null) return null
  return state.current.reasoningEffort === undefined
    ? { provider: state.current.provider, model: state.current.model }
    : {
      provider: state.current.provider,
      model: state.current.model,
      reasoningEffort: state.current.reasoningEffort,
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
 * @param effort - the level in question.
 * @returns whether they name the same level.
 */
export function sameEffort(liveEffort: string | undefined, effort: string | undefined): boolean {
  return liveEffort === effort
}
