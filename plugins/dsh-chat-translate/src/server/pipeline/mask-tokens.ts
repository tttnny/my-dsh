/**
 * Mask placeholder tokens — single source of truth for the wire format, the
 * tolerant matcher and the leftover detector.
 *
 * Wire format: `__DSHMASKx<letters>_<index>__` (e.g. `__DSHMASKxkbdt_3__`).
 *
 * Design constraints, each one a measured failure of the previous
 * `__DSH_MASK_<index>__` format against real MT engines:
 *
 *  - No underscore between `DSH` and `MASK`. Small models routinely drop that
 *    one separator (`__DSH_MASK_1__` -> `__DSHMASK_1__`), which defeated the
 *    old strict unmask regex and leaked the raw token into the UI.
 *  - A random letter run (`x<letters>`) makes the token collision-free against
 *    the source text and unambiguous to parse: the index is the digit run after
 *    the last `_`, so no lookbehind is needed.
 *  - The leading/trailing `__` stay: they survive MT and mark the token as
 *    emphasis to the model.
 *
 * `matchMaskToken` stays tolerant of the *legacy* format and of the spacing /
 * casing / separator damage observed in the wild, because poisoned translations
 * already sit in the on-disk and browser caches.
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
    token: (index: number) => `__DSHMASKx${id}_${index}__`,
  };
}

/**
 * Loose matcher covering every observed engine rewrite:
 *
 *   __DSHMASKxkbdt_3__      exact
 *   __DSHMASKXKBDT_3__      case folded
 *   __DSH MASK xkbdt _ 3__  spaces inserted around the structural underscores
 *   __DSHMASKkbdt_3__       the `x` id separator eaten
 *   _DSHMASKxkbdt_3_        one boundary underscore dropped
 *   __DSH_MASK_3__ / __dsh_mask_3__  legacy format (no random id)
 *
 * Both boundaries and the internal separators are optional, and the `x` id
 * separator may be replaced by whitespace/dot/hyphen. The two index branches
 * stay unambiguous: an id is always a letter run, the index always digits.
 * Capture groups: `[1] = legacy index` (undefined for the current format),
 * `[2] = token id` (undefined for the legacy format), `[3] = current index`.
 */
export const MASK_TOKEN_PATTERN_SOURCE =
  '_*\\s*DSH\\s*_*\\s*MASK\\s*(?:_?\\s*(\\d+)|_*[xX]?[\\s._-]*([a-z]{2,8})\\s*_+\\s*(\\d+))(?:_{0,2}(?=[^\\w]|$))?';

export interface MaskTokenMatch {
  index: number;
  /** false when the token carried an id from a different `mask()` call. */
  acceptsId: boolean;
  /** Length of the matched token in characters. */
  length: number;
}

/**
 * Match a single mask token at `start` in `text`.
 *
 * `acceptsId` is false when the token's random id belongs to another masking
 * pass — the caller must then leave the token untouched, because its index
 * would resolve to unrelated content.
 */
export function matchMaskToken(text: string, start: number, id: string): MaskTokenMatch | null {
  const anchored = new RegExp(`^(?:${MASK_TOKEN_PATTERN_SOURCE})`, 'i').exec(text.slice(start));
  if (!anchored) return null;

  // Group 1 is the legacy index, group 2 the random id, group 3 the current
  // index. Whichever index group matched, `parseInt` reads it as a plain
  // number: "0" and "xabcd_0" both resolve to 0.
  const index = Number.parseInt(anchored[1] ?? anchored[3] ?? '', 10);
  if (Number.isNaN(index)) return null;

  const tokenId = anchored[2];
  const acceptsId = tokenId === undefined || tokenId.toLowerCase() === id.toLowerCase();
  return { index, acceptsId, length: anchored[0].length };
}

/** True when translated text still carries a mask token of any format. */
export function hasMaskResidue(text: string): boolean {
  if (!text) return false;
  return new RegExp(MASK_TOKEN_PATTERN_SOURCE, 'i').test(text);
}

/** Every mask-token-looking fragment in `text`, verbatim. */
export function maskResidues(text: string): string[] {
  if (!text) return [];
  return text.match(new RegExp(MASK_TOKEN_PATTERN_SOURCE, 'gi')) ?? [];
}

/**
 * True when `translatedText` exposes a mask token that was NOT already part of
 * `originalText`.
 *
 * A placeholder surviving the round trip is a leak; but a source text that
 * legitimately talks *about* placeholders (this plugin's own documentation,
 * say) must survive translation, so tokens the source already carried are not
 * treated as residue.
 */
export function hasNewMaskResidue(originalText: string, translatedText: string): boolean {
  const residues = maskResidues(translatedText);
  if (residues.length === 0) return false;

  const presentInSource = new Map<string, number>();
  for (const fragment of maskResidues(originalText)) {
    const key = fragment.toLowerCase();
    presentInSource.set(key, (presentInSource.get(key) ?? 0) + 1);
  }
  for (const fragment of residues) {
    const key = fragment.toLowerCase();
    const remaining = presentInSource.get(key) ?? 0;
    if (remaining === 0) return true;
    presentInSource.set(key, remaining - 1);
  }
  return false;
}
