/** Shared bounded text predicate for Host trust-boundary values. */

export function isBoundedSafeText(value: unknown, maxLength: number, minLength = 1): value is string {
  if (typeof value !== 'string'
    || !Number.isSafeInteger(maxLength)
    || !Number.isSafeInteger(minLength)
    || minLength < 0
    || maxLength < minLength
    || value.length < minLength
    || value.length > maxLength) return false
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index)
    if (codePoint < 0x20 || codePoint === 0x7f) return false
  }
  return true
}
