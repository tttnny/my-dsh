/**
 * The translation prompt's cache generation.
 *
 * The reply cache stores results keyed by source text; a cache document written
 * under a different prompt semantics would replay stale translations into a new
 * policy (the exact poisoning that makes "already-Chinese blocks look
 * untranslated" outlive a prompt fix). The document therefore carries this
 * revision, and a load whose revision differs starts from an empty pool.
 *
 * Two things move the revision:
 *
 * - a change to the built-in prompt in `src/prompt.ts`, which bumps
 *   {@link PROMPT_REVISION} by hand;
 * - the reader writing their own prompt on the configuration page, which flows
 *   in as a digest of the effective text ({@link cacheRevision}).
 */
import { createHash } from 'node:crypto';
import { resolvePrompt } from '../prompt.ts';

/**
 * Bump it — and only here — whenever the built-in prompt in `src/prompt.ts`
 * changes what the model is asked to do. Copy-only edits may ride.
 */
export const PROMPT_REVISION = 'r5';

/**
 * Cache generation for the prompt currently in force.
 *
 * The digest is of the effective prompt — the reader's text when they wrote
 * one, the built-in default otherwise — so editing the prompt on the
 * configuration page retires every translation the previous wording produced,
 * and writing the same text back lands in the same pool again.
 *
 * @param prompt - the configured prompt; blank means the built-in default.
 * @returns the revision string a cache document is written and matched under.
 */
export function cacheRevision(prompt: string | undefined): string {
  const digest = createHash('sha256').update(resolvePrompt(prompt), 'utf8').digest('hex').slice(0, 12);
  return `${PROMPT_REVISION}:${digest}`;
}
