/**
 * Mask placeholder tokens — single source of truth for the wire format, the
 * matcher and the leftover detector.
 *
 * Wire format: `⟦xkbdt3⟧` — U+27E6/U+27E7 (mathematical white square brackets)
 * around `<4-letter random id><index>`.
 *
 * Design constraints, each one a measured failure against real MT engines:
 *
 *  - No letters spelling a pronounceable word and no underscores: engines
 *    abbreviate tokens with such a shape back to their recognizable core, and
 *    bare `DSH` runs then show in the UI instead of the protected fragments.
 *  - Random letters keep two mask passes in the same session from colliding and
 *    make the token unambiguous in the translated text.
 *  - `matchMaskToken` accepts exactly what this module emits (plus the same
 *    token with a dropped closing bracket, an engine rewrite seen in practice).
 *    It deliberately does NOT accept anything else: a translation that damaged
 *    a token beyond recognition is discarded rather than repaired, because
 *    repairing it is what put mixed or duplicated text on screen.
 */

/** Random part of the token. Letters only: never confuses the index scan. */
const RANDOM_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

export function randomTokenId(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += RANDOM_LETTERS[Math.floor(Math.random() * RANDOM_LETTERS.length)];
  }
  return out;
}

export interface MaskTokenFormat {
  /** Unique per `mask()` call; embedded in every token of that call. */
  id: string;
  /** Build the placeholder written into the text sent to the translator. */
  token: (index: number) => string;
}

export function createMaskTokenFormat(): MaskTokenFormat {
  const id = randomTokenId();
  return {
    id,
    token: (index: number) => `⟦${id}${index}⟧`,
  };
}

/**
 * Scanner for complete tokens of this format. A token whose closing bracket the
 * engine dropped is still resolved (see `matchMaskToken`), but it is not
 * recognized as a complete token here: the space `mask()` inserts sits outside
 * that token, and matching a truncated one would strip a space of the
 * translation's own.
 */
export const MASK_TOKEN_PATTERN_SOURCE = '⟦([a-z]{4})(\\d+)⟧';

/**
 * The opening bracket, the id and the index of a token, without its closing
 * bracket. Used to resolve a token the engine truncated.
 */
export const MASK_TOKEN_PREFIX_PATTERN_SOURCE = '⟦\\s*([a-z]{4})(\\d+)';

export interface MaskTokenMatch {
  /** Index into the mask list of the `mask()` call that produced the token. */
  index: number;
  /** Length of the matched token in characters. */
  length: number;
  /** True when the closing bracket was missing and only the prefix matched. */
  truncated: boolean;
}

/**
 * Match exactly one mask token of this format at `start` in `text`.
 *
 * The id must match the id of the masking pass that owns the token: every mask
 * pass carries its own random id, so a token carrying another id belongs to
 * another call and must not be resolved here.
 */
export function matchMaskToken(text: string, start: number, id: string): MaskTokenMatch | null {
  const complete = new RegExp(`^(?:${MASK_TOKEN_PATTERN_SOURCE})`, 'iu').exec(text.slice(start));
  // The closing bracket is optional here so a token the engine truncated is
  // still resolved; the id and index inside must survive intact.
  const truncated = complete
    ? null
    : new RegExp(`^(?:${MASK_TOKEN_PREFIX_PATTERN_SOURCE})`, 'iu').exec(text.slice(start));

  const anchored = complete ?? truncated;
  if (!anchored) return null;
  if (anchored[1].toLowerCase() !== id.toLowerCase()) return null;

  const index = Number.parseInt(anchored[2], 10);
  if (Number.isNaN(index)) return null;

  return { index, length: anchored[0].length, truncated: complete === null };
}

/** Every token of this format in `text`, left to right. */
export function findMaskTokens(text: string): Array<{ match: MaskTokenMatch; raw: string }> {
  const found: Array<{ match: MaskTokenMatch; raw: string }> = [];
  const pattern = new RegExp(MASK_TOKEN_PATTERN_SOURCE, 'giu');
  let candidate = pattern.exec(text);
  while (candidate) {
    const id = candidate[1].toLowerCase();
    const index = Number.parseInt(candidate[2], 10);
    if (!Number.isNaN(index)) {
      found.push({
        match: { index, length: candidate[0].length, truncated: false },
        raw: candidate[0],
      });
    }
    if (pattern.lastIndex === candidate.index) pattern.lastIndex++;
    candidate = pattern.exec(text);
  }
  return found;
}

/** True when `text` still carries a token of the current format. */
export function hasMaskResidue(text: string): boolean {
  if (!text) return false;
  return new RegExp(MASK_TOKEN_PATTERN_SOURCE, 'iu').test(text);
}
