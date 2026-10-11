/** Browser-safe advisory model-catalog state shared by Host RPC and settings. */

export const ANTIGRAVITY_MODEL_CATALOG_STATES = [
  'snapshot',
  'live-available',
  'refresh-failed',
  'protocol-drift',
] as const

export type AntigravityModelCatalogState = (typeof ANTIGRAVITY_MODEL_CATALOG_STATES)[number]
export type AntigravityModelAvailability = 'snapshot' | 'live-available' | 'unavailable'

export interface AntigravityModelCatalogEntry {
  readonly id: string
  readonly name: string
  readonly state: AntigravityModelAvailability
}

export interface AntigravityModelCatalogView {
  readonly state: AntigravityModelCatalogState
  readonly models: readonly AntigravityModelCatalogEntry[]
  readonly checkedAt?: string
}

export interface AntigravityModelCatalogService {
  catalogSnapshot(): AntigravityModelCatalogView
  modelCatalog(signal?: AbortSignal, forceRefresh?: boolean): Promise<AntigravityModelCatalogView>
}
