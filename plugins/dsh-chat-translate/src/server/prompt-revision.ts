/**
 * The translation prompt's cache generation.
 *
 * The reply cache stores results keyed by source text; a cache document written
 * under a different prompt semantics would replay stale translations into a new
 * policy (the exact poisoning that makes "already-Chinese blocks look
 * untranslated" outlive a prompt fix). The document therefore carries a
 * generation string, and a load whose generation differs starts from an empty
 * pool.
 *
 * Two things move the generation:
 *
 * - a change to the built-in prompt in `src/prompt.ts`, which bumps
 *   {@link PROMPT_REVISION} by hand;
 * - the reader writing their own prompt on the configuration page, which flows
 *   in as a digest of the effective text ({@link cacheGeneration}).
 *
 * 采样参数也是世代的一部分：同样的指令、同样的原文，换一组采样参数产出的
 * 就是另一份译文，旧池不该再命中。
 */
import { createHash } from 'node:crypto';
import { resolvePrompt } from '../prompt.ts';
import { SAMPLING_TEMPERATURE, SAMPLING_TOP_P } from './sampling.ts';

/**
 * Bump it — and only here — whenever the built-in prompt in `src/prompt.ts`
 * changes what the model is asked to do. Copy-only edits may ride.
 */
export const PROMPT_REVISION = 'r6';

/**
 * Cache generation for the prompt currently in force.
 *
 * The digest covers the effective prompt — the reader's text when they wrote
 * one, the built-in default otherwise — and the sampling parameters the request
 * goes out with, so editing either one retires every translation the previous
 * settings produced, and landing on the same settings again reuses the pool.
 *
 * @param prompt - the configured prompt; blank means the built-in default.
 * @returns the generation string a cache document is written and matched under.
 */
export function cacheGeneration(prompt: string | undefined): string {
  const source = [
    resolvePrompt(prompt),
    `temperature=${SAMPLING_TEMPERATURE}`,
    `top_p=${SAMPLING_TOP_P}`,
  ].join('\u0000');
  const digest = createHash('sha256').update(source, 'utf8').digest('hex').slice(0, 12);
  return `${PROMPT_REVISION}:${digest}`;
}
