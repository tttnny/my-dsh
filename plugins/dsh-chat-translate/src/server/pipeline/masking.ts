import {
  createMaskTokenFormat,
  hasMaskResidue,
  matchMaskToken,
  MASK_TOKEN_PATTERN_SOURCE,
  MASK_TOKEN_PREFIX_PATTERN_SOURCE,
} from './mask-tokens.ts';

export interface MaskResult {
  maskedText: string;
  /**
   * Restore every protected fragment. Throws `MaskRestoreError` when the
   * translated text did not carry the token sequence back intact; the caller
   * must discard that translation instead of showing a repaired guess.
   */
  unmask: (translatedText: string) => string;
}

/** Which spaces `mask()` inserted directly before and after a token. */
export interface InsertedSpacing {
  leading: boolean;
  trailing: boolean;
}

/** Bound the unmask scanner so a poisoned translation cannot spin forever. */
const MAX_UNMASK_PASSES = 10_000;

/** Chinese, Japanese and Korean text is written without spaces between words. */
const ASCII_WORD = /[A-Za-z0-9_]/;

/** A single leading or trailing space: the one this pipeline inserted. */
const INSERTED_SPACE = /^ | $/;

export class MaskRestoreError extends Error {
  readonly expectedCount: number;
  readonly foundCount: number;

  constructor(message: string, expectedCount: number, foundCount: number) {
    super(message);
    this.name = 'MaskRestoreError';
    this.expectedCount = expectedCount;
    this.foundCount = foundCount;
  }
}

export class ContentMaskingPipeline {
  mask(text: string): MaskResult {
    if (!text || typeof text !== 'string') {
      return {
        maskedText: text,
        unmask: (t: string) => t,
      };
    }

    const masks: string[] = [];
    /** Which spaces `placeToken` inserted around a fragment. */
    const inserted: InsertedSpacing[] = [];
    const format = createMaskTokenFormat();

    /**
     * Record one protected fragment and return the text that replaces it.
     *
     * A match that already carries a token from an earlier rule is returned
     * unchanged: that inner token already protects the fragment, and recording
     * the surrounding text again would put one fragment under two indices.
     * `before` and `after` are the characters on either side of the match in the
     * never-masked text. A token touching a Latin word gets one space on that
     * side: the engine then sees a standalone word and keeps it separate, while
     * a token glued to source text (`Fixsrc/…`) came back merged into its
     * neighbour. The inserted spaces are recorded so `unmask` removes exactly
     * them and never a space the translation produced.
     */
    const addFragment = (
      match: string,
      before: string | undefined,
      after: string | undefined,
      onPlace?: (index: number) => void
    ): string => {
      if (hasMaskResidue(match)) return match;
      const index = masks.length;
      masks.push(match);
      const leading = before !== undefined && ASCII_WORD.test(before);
      const trailing = after !== undefined && ASCII_WORD.test(after);
      inserted.push({ leading, trailing });
      onPlace?.(index);
      return `${leading ? ' ' : ''}${format.token(index)}${trailing ? ' ' : ''}`;
    };

    const wrapRule = (input: string, pattern: RegExp, onPlace?: (index: number) => void): string =>
      input.replace(pattern, (...args: unknown[]) => {
        const match = args[0] as string;
        const offset = args[args.length - 2] as number;
        const whole = args[args.length - 1] as string;
        return addFragment(match, whole[offset - 1], whole[offset + match.length], onPlace);
      });

    // 1. Multi-line code blocks (```...``` or ~~~...~~~)
    let processed = wrapRule(text, /(?:```|~~~)[\s\S]*?(?:```|~~~)/g);

    // 2. Inline code (`...`)
    processed = wrapRule(processed, /`[^`\n]+`/g);

    // 3. URLs
    processed = wrapRule(processed, /https?:\/\/[^\s)\];,;"'<>]+/g);

    // 4. File paths and filenames with known extensions.
    //    Every alternative is anchored on a left boundary (`.`/`/` accepted
    //    only when preceded by a word char or start) so a match can never start
    //    mid-path: without the anchor a pattern free to start anywhere splits
    //    `src/server/dispatcher.ts` into `src⟦…0⟧` + remainder, masking the
    //    slash away and handing the engine a broken path.
    processed = wrapRule(
      processed,
      /(?:\/[\w.\-\\\/]+|(?<=[\w.\-])\.\.?[\\\/][\w.\-\\\/]+|(?<=^|[\s([{"'`])[a-zA-Z]:[\\\/][\w.\-\\\/]+|(?<![^\s([{"'`])\b(?:[\w.\-]+\/)+[\w.\-]+\.[a-zA-Z0-9]+\b|(?<![^\s([{"'`])\b[\w.\-]+\.(?:ts|tsx|js|jsx|json|ya?ml|md|py|go|rs|c|cpp|h|hpp|css|scss|html|sh|bash|mjs|cjs|toml|lock|log|env|svg|png|jpe?g|gif|tar|gz|zip|xml|sql)\b)/g
    );

    // 5. CLI flags / options (--flag, --flag=value, -f)
    processed = wrapRule(
      processed,
      /(?<=^|[\s(\[{"'])((?:--[a-zA-Z0-9_\-]+(?:=[^\s"'<>]+)?)|(?:-[a-zA-Z0-9]+))(?=[\s)\]}",:;!?]|$)/g
    );

    const unmask = (translatedText: string): string => {
      if (!translatedText) return translatedText;
      if (masks.length === 0) {
        if (hasMaskResidue(translatedText)) {
          throw new MaskRestoreError(
            'translation carries a mask token while the source had none',
            0,
            0
          );
        }
        return translatedText;
      }
      return replaceMaskTokens(translatedText, format.id, masks, inserted);
    };

    return {
      maskedText: processed,
      unmask,
    };
  }
}

/**
 * Restore every token of `id` in `text` from `masks`.
 *
 * Each fragment of the pass is resolved exactly once, no matter how the engine
 * reordered the sentence: the index embedded in the token identifies the
 * fragment, and the random id identifies the masking pass that owns it. The
 * spaces recorded in `inserted` are removed together with their token, so the
 * spacing the translation produced around the fragment survives untouched.
 *
 * @throws MaskRestoreError when the text does not carry every token exactly
 *   once, or still shows a token of some other pass or a damaged one — the
 *   caller discards such a translation instead of rendering a repaired guess.
 */
export function replaceMaskTokens(
  text: string,
  id: string,
  masks: string[],
  inserted?: InsertedSpacing[]
): string {
  // Two scanners, one pass: the complete-token scanner drives the loop, and the
  // prefix scanner catches a complete token whose closing bracket the engine
  // dropped (the complete-token scanner steps over such a prefix entirely).
  const complete = new RegExp(MASK_TOKEN_PATTERN_SOURCE, 'giu');
  const prefix = new RegExp(MASK_TOKEN_PREFIX_PATTERN_SOURCE, 'giu');
  const seen = new Set<number>();
  let out = '';
  let cursor = 0;
  let passes = 0;
  let whole = complete.exec(text);
  let prefixCandidate = prefix.exec(text);

  const nextStart = (wholeMatch: RegExpExecArray | null, prefixMatch: RegExpExecArray | null): number =>
    Math.min(
      wholeMatch ? wholeMatch.index : Number.POSITIVE_INFINITY,
      prefixMatch ? prefixMatch.index : Number.POSITIVE_INFINITY
    );

  let start = nextStart(whole, prefixCandidate);
  while (start !== Number.POSITIVE_INFINITY && passes++ < MAX_UNMASK_PASSES) {
    // A complete token and a truncated one share a start position only when the
    // token is complete; a truncated one found past it is the shorter match.
    const isPrefix = prefixCandidate !== null && prefixCandidate.index === start && whole?.index !== start;
    const raw = isPrefix ? prefixCandidate![0] : whole![0];
    const match = matchMaskToken(text, start, id);
    if (!match) {
      // A token of another pass or a damaged one: kept verbatim. The
      // completeness check below turns any such leftover into a rejection.
      out += text.slice(cursor, start) + raw;
      cursor = start + raw.length;
    } else {
      if (match.index < 0 || match.index >= masks.length || seen.has(match.index)) {
        throw new MaskRestoreError(
          `translation does not reproduce every protected fragment (bad index ${match.index})`,
          masks.length,
          seen.size
        );
      }
      seen.add(match.index);
      const spacing = isPrefix ? undefined : inserted?.[match.index];
      let before = text.slice(cursor, start);
      // The trailing space the previous fragment brought with it.
      if (spacing?.leading) before = before.replace(INSERTED_SPACE, '');
      if (spacing?.trailing) out = out.replace(INSERTED_SPACE, '');
      out += before + masks[match.index];
      cursor = start + raw.length;
    }

    // Skip past every candidate the resolved token already covers.
    while (whole && whole.index < cursor) whole = complete.exec(text);
    while (prefixCandidate && prefixCandidate.index < cursor) prefixCandidate = prefix.exec(text);
    start = nextStart(whole, prefixCandidate);
  }

  out += text.slice(cursor);

  if (seen.size !== masks.length || hasMaskResidue(out)) {
    throw new MaskRestoreError(
      `translation does not reproduce every protected fragment (expected ${masks.length}, found ${seen.size})`,
      masks.length,
      seen.size
    );
  }

  return out;
}

/**
 * True when a translated string still shows a mask token to the user. Callers
 * use it to discard a poisoned translation, to keep it out of the caches, and
 * to drop poisoned entries when a cache document is loaded (the file on disk
 * outlives the process and may carry anything).
 */
export function isMaskLeak(translatedText: string): boolean {
  return hasMaskResidue(translatedText);
}

export { hasMaskResidue };
