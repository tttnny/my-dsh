/**
 * Where a judgement is sent: the address the reader typed, with the service's
 * path appended when it does not already carry one.
 *
 * The page asks for the address only. Which path the service lives at is
 * decided here rather than asked as a second setting: an address that already
 * names one of the known paths is used as it is, and anything shorter gets the
 * default. This module imports nothing, so both halves can share the rule.
 */

/** Paths the service is reached at; the first is the one appended by default. */
const ENDPOINT_PATHS = ['/v1/systemone', '/systemone'] as const;

/**
 * Turn the typed address into the URL a request is sent to.
 *
 * An address that already ends with one of the known paths is left as it is, so
 * a stored full URL — or one pasted from elsewhere — is never doubled. An
 * address that stops at the default path's own prefix (`…/v1`) only needs the
 * rest of it. Everything shorter gets the default path.
 *
 * @param input - the address the reader typed.
 * @returns the URL to call, or '' when no address is set.
 */
export function resolveEndpointUrl(input: unknown): string {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (trimmed === '') return '';
  const address = trimmed.replace(/\/+$/, '');
  if (ENDPOINT_PATHS.some((path) => address.endsWith(path))) return address;
  if (address.endsWith('/v1')) return `${address}/systemone`;
  return `${address}/v1/systemone`;
}
