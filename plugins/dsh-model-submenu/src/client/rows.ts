/**
 * Catalog flattening, tab derivation, and query matching for the picker.
 *
 * The model catalog groups models by provider; the picker shows one flat list
 * with a tab per provider, so both surfaces read from these rows. Matching
 * delegates to the shell's own ranker, which is why a query behaves the same
 * here as in the built-in menu: case-insensitive, ordered subsequence, prefix
 * hits first.
 */

import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'

/** One provider group of the shared catalog. */
export type ProviderGroup = ModelDirectoryState['groups'][number]

/** One model inside a provider group. */
export type CatalogModel = ProviderGroup['models'][number]

/** One flat catalog row, carrying the provider identity beside the model. */
export interface ModelRow extends ModelRef {
  readonly providerName: string
  /** The model id inside its provider, the other half of a selection. */
  readonly model: string
  /** The catalog entry itself, for name and reasoning metadata. */
  readonly entry: CatalogModel
}

/** A provider and one of its models: the pair every selection and favorite names. */
export interface ModelRef {
  readonly provider: string
  readonly model: string
}

/** One picker tab. */
export interface PickerTab {
  readonly id: string
  readonly label: string
}

/** The tab id standing for every provider. */
export const ALL_TAB = '*'

/**
 * Flatten the catalog to one row per model.
 * @param groups - the shared directory's provider groups, in display order.
 * @returns the rows in catalog order.
 */
export function flattenGroups(groups: readonly ProviderGroup[]): readonly ModelRow[] {
  return groups.flatMap((group) => group.models.map((model) => ({
    provider: group.id,
    providerName: group.name,
    model: model.id,
    entry: model,
  })))
}

/**
 * Build the picker's tabs: the all-tab, then one per provider that has a model.
 * @param groups - the shared directory's provider groups.
 * @param allLabel - localized label for the all-tab.
 * @returns the tabs in catalog order.
 */
export function pickerTabs(groups: readonly ProviderGroup[], allLabel = 'All'): readonly PickerTab[] {
  return [
    { id: ALL_TAB, label: allLabel },
    ...groups.filter((group) => group.models.length > 0).map((group) => ({ id: group.id, label: group.name })),
  ]
}

/**
 * @param rows - the flat catalog.
 * @param tab - the tab id; the all-tab keeps every row.
 * @returns the rows the tab shows, in their current order.
 */
export function rowsForTab(rows: readonly ModelRow[], tab: string): readonly ModelRow[] {
  return tab === ALL_TAB ? rows : rows.filter((row) => row.provider === tab)
}

/** One row handed to the shell's ranker, carrying both searchable keys. */
export interface SearchCandidate {
  readonly name: string
  readonly label: string
  readonly row: ModelRow
}

/**
 * Shape rows as the shell's ranker candidates: the model name is the name, the
 * provider display name is the second key, so a query reaches either.
 * @param rows - the rows to search.
 * @returns candidates in row order.
 */
export function searchCandidates(rows: readonly ModelRow[]): readonly SearchCandidate[] {
  return rows.map((row) => ({ name: row.entry.name, label: row.providerName, row }))
}

/**
 * Read the reasoning metadata the catalog advertises for one model.
 * @param groups - the shared directory's provider groups.
 * @returns the metadata, or undefined when that model advertises none.
 */
export function reasoningOf(
  groups: readonly ProviderGroup[],
): (provider: string, model: string) => CatalogModel['reasoning'] {
  return (provider, model) => groups
    .find((group) => group.id === provider)
    ?.models.find((candidate) => candidate.id === model)
    ?.reasoning
}

/**
 * Filter rows by a query over the model name and the provider name.
 * @param rows - the rows to search.
 * @param query - the typed text; an empty or blank query keeps every row.
 * @param rank - the shell's own ranker, so this search behaves like every other one.
 * @returns the matching rows.
 */
export function searchRows(
  rows: readonly ModelRow[],
  query: string,
  rank: (items: readonly SearchCandidate[], query: string) => readonly SearchCandidate[],
): readonly ModelRow[] {
  const trimmed = query.trim()
  if (trimmed === '') return rows
  return rank(searchCandidates(rows), trimmed).map((match) => match.row)
}
