/**
 * Test stand-in for one schemastery volatile config reference.
 *
 * The loader hands a plugin its resolved config with every `volatile()` field
 * wrapped in a stable reference; specs only need the `get()` half, so this
 * keeps the reader honest without a schemastery round trip.
 */
export function live<T>(value: T): { get(): T } {
  return { get: () => value }
}
