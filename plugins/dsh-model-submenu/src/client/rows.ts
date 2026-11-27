/**
 * Catalog flattening, tab derivation, and query matching for the picker.
 *
 * The model catalog groups models by provider; the picker shows one flat list
 * with a tab per provider. The shared text search index matches model and
 * provider names and IDs.
 */

import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { TextSearchIndex } from '@deepseek-ai/dsh-util-text-search'

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

/** Build a reusable search index for the rows in the current provider tab. */
export function createModelSearch(rows: readonly ModelRow[]): TextSearchIndex<ModelRow> {
  return new TextSearchIndex(rows, (row) => ({
    fuzzy: [row.entry.name, row.model, row.providerName, row.provider],
  }))
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
