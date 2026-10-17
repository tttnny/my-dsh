/**
 * The per-model reasoning level this browser last chose.
 *
 * The Host stores one level per session, so switching models away and back
 * forgets what was picked for the first one. This module keeps that memory
 * beside the favorite table, keyed the same way: provider route key plus model
 * id. Remembering the provider default removes the row, so "follow the
 * provider" stays distinguishable from "remembered a level".
 */

/** One remembered reasoning level. */
export interface RememberedEffort {
  readonly provider: string
  readonly model: string
  readonly effort: string
}

/** The single browser-wide storage key holding the whole memory. */
export const EFFORTS_KEY = 'dsh-model-submenu.efforts'

/** The part of `Storage` this module uses; absent or throwing reads mean "none". */
export type EffortStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Read the memory, keeping only rows naming both halves and a level.
 * @param storage - browser storage, or undefined when the browser withholds it.
 * @returns the remembered rows; empty when unreadable.
 */
export function readEfforts(storage: EffortStorage | undefined): RememberedEffort[] {
  const raw = getItem(storage)
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((row): row is RememberedEffort => typeof row === 'object' && row !== null
    && typeof (row as RememberedEffort).provider === 'string'
    && typeof (row as RememberedEffort).model === 'string'
    && typeof (row as RememberedEffort).effort === 'string'
    && (row as RememberedEffort).effort !== '')
}

/**
 * @param memory - the rows to search.
 * @param provider - the provider route key.
 * @param model - the model id inside that provider.
 * @returns the level last chosen for that exact model, or undefined.
 */
export function effortFor(
  memory: readonly RememberedEffort[],
  provider: string,
  model: string,
): string | undefined {
  return memory.find((row) => row.provider === provider && row.model === model)?.effort
}

/**
 * Remember one model's level, or forget it when the choice is the provider default.
 * @param storage - browser storage, or undefined when writes are unavailable.
 * @param provider - the provider route key.
 * @param model - the model id inside that provider.
 * @param effort - the chosen level, undefined meaning the provider default.
 * @returns the memory after the change, whether or not the write landed.
 */
export function rememberEffort(
  storage: EffortStorage | undefined,
  provider: string,
  model: string,
  effort: string | undefined,
): RememberedEffort[] {
  const rest = readEfforts(storage).filter((row) => row.provider !== provider || row.model !== model)
  const next = effort === undefined ? rest : [...rest, { provider, model, effort }]
  try {
    storage?.setItem(EFFORTS_KEY, JSON.stringify(next))
  } catch {
    // A full quota or a locked-down browser loses the memory, not the menu.
  }
  return next
}

function getItem(storage: EffortStorage | undefined): string | null {
  try {
    return storage?.getItem(EFFORTS_KEY) ?? null
  } catch {
    return null
  }
}
