/**
 * The favorite-model table the picker keeps in the browser.
 *
 * One browser-wide key holds `{ provider, model }` rows: the provider route key
 * and the model id are the catalog's own identity, so a favorite survives a
 * display-name change and never collides across providers. A value that cannot
 * be read or does not parse reads as an empty table — a privacy-mode browser or
 * a hand-edited row must never keep the menu from opening. Rows whose provider
 * leaves the catalog are kept, so restoring the provider restores the star.
 */

/** One favorited model, identified the way the catalog identifies it. */
export interface FavoriteModel {
  readonly provider: string
  readonly model: string
}

/** The single browser-wide storage key holding the whole table. */
export const FAVORITES_KEY = 'dsh-model-submenu.favorites'

/** The part of `Storage` this module uses; absent or throwing reads mean "none". */
export type FavoritesStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Read the table, keeping only rows that name both halves.
 * @param storage - browser storage, or undefined when the browser withholds it.
 * @returns the stored favorites in stored order; empty when unreadable.
 */
export function readFavorites(storage: FavoritesStorage | undefined): FavoriteModel[] {
  const raw = getItem(storage)
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((row): row is FavoriteModel => typeof row === 'object' && row !== null
    && typeof (row as FavoriteModel).provider === 'string'
    && typeof (row as FavoriteModel).model === 'string')
}

/**
 * Add or remove one model, writing the whole table back.
 * @param storage - browser storage, or undefined when writes are unavailable.
 * @param provider - the provider route key.
 * @param model - the model id inside that provider.
 * @returns the table after the change, whether or not the write landed.
 */
export function toggleFavorite(
  storage: FavoritesStorage | undefined,
  provider: string,
  model: string,
): FavoriteModel[] {
  const current = readFavorites(storage)
  const next = isFavorite(current, provider, model)
    ? current.filter((row) => row.provider !== provider || row.model !== model)
    : [...current, { provider, model }]
  try {
    storage?.setItem(FAVORITES_KEY, JSON.stringify(next))
  } catch {
    // A full quota or a locked-down browser loses the star, not the menu.
  }
  return next
}

/**
 * @param favorites - the table to search.
 * @param provider - the provider route key.
 * @param model - the model id inside that provider.
 * @returns whether that exact pair is favorited.
 */
export function isFavorite(
  favorites: readonly FavoriteModel[],
  provider: string,
  model: string,
): boolean {
  return favorites.some((row) => row.provider === provider && row.model === model)
}

/**
 * Stable-partition a catalog so favorited rows lead, each part keeping the
 * catalog's own order.
 * @param rows - the catalog in its display order.
 * @param favorited - predicate answering whether one row is favorited.
 * @returns a new list; the input order when nothing is favorited.
 */
export function orderWithFavorites<T>(
  rows: readonly T[],
  favorited: (row: T) => boolean,
): readonly T[] {
  const starred = rows.filter(favorited)
  if (starred.length === 0) return rows
  return [...starred, ...rows.filter((row) => !favorited(row))]
}

function getItem(storage: FavoritesStorage | undefined): string | null {
  try {
    return storage?.getItem(FAVORITES_KEY) ?? null
  } catch {
    return null
  }
}
