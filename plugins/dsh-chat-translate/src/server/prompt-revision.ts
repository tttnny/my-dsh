/**
 * The single registration of the translation prompt's semantic revision.
 *
 * The reply cache stores results keyed by source text; a cache document
 * written under a different prompt semantics would replay stale translations
 * into a new policy (the exact poisoning that makes "already-Chinese blocks
 * look untranslated" persist for a TTL after a prompt change). The document
 * therefore carries this revision, and a load whose revision differs starts
 * from an empty pool.
 *
 * Bump it — and only here — whenever the prompt below `buildSystemPrompt`
 * changes what the model is asked to do. Copy-only edits may ride.
 */
export const PROMPT_REVISION = 'r1';
