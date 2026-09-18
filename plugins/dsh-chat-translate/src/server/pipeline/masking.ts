import {
  createMaskTokenFormat,
  hasMaskResidue,
  hasNewMaskResidue,
  matchMaskToken,
  MASK_TOKEN_PATTERN_SOURCE,
} from './mask-tokens.ts';

export interface MaskResult {
  maskedText: string;
  unmask: (translatedText: string) => string;
}

/** A match that ate an already-inserted mask token. Dropped, never re-masked. */
const MASK_MARKER = /DSH\s*_?\s*MASK/i;

/** Bound the unmask scanner so a poisoned translation cannot spin forever. */
const MAX_UNMASK_PASSES = 10_000;

export class ContentMaskingPipeline {
  mask(text: string): MaskResult {
    if (!text || typeof text !== 'string') {
      return {
        maskedText: text,
        unmask: (t: string) => t,
      };
    }

    const masks: string[] = [];
    const format = createMaskTokenFormat();
    // Rules may only match the original, never-masked text: a match that
    // swallows an inserted token would hide a whole region from unmasking.
    const addMask = (match: string): string => {
      if (MASK_MARKER.test(match)) return match;
      const idx = masks.length;
      masks.push(match);
      return format.token(idx);
    };

    let processed = text;

    // 1. Multi-line code blocks (```...``` or ~~~...~~~)
    processed = processed.replace(/(?:```|~~~)[\s\S]*?(?:```|~~~)/g, (m) => addMask(m));

    // 2. Inline code (`...`)
    processed = processed.replace(/`[^`\n]+`/g, (m) => addMask(m));

    // 3. URLs
    processed = processed.replace(/https?:\/\/[^\s)\];,;"'<>]+/g, (m) => addMask(m));

    // 4. File paths and filenames with known extensions.
    //    Every alternative is anchored on a left boundary (`.`/`/` accepted
    //    only when preceded by a word char or start) so a match can never start
    //    mid-path: `src/server` inside `src/server/dispatcher.ts` used to split
    //    the path into `src__DSH_MASK_1__`, masking the slash away.
    processed = processed.replace(
      /(?:\/[\w.\-\\\/]+|(?<=[\w.\-])\.\.?[\\\/][\w.\-\\\/]+|(?<=^|[\s([{"'`])[a-zA-Z]:[\\\/][\w.\-\\\/]+|(?<![^\s([{"'`])\b(?:[\w.\-]+\/)+[\w.\-]+\.[a-zA-Z0-9]+\b|(?<![^\s([{"'`])\b[\w.\-]+\.(?:ts|tsx|js|jsx|json|ya?ml|md|py|go|rs|c|cpp|h|hpp|css|scss|html|sh|bash|mjs|cjs|toml|lock|log|env|svg|png|jpe?g|gif|tar|gz|zip|xml|sql)\b)/g,
      (m) => addMask(m)
    );

    // 5. CLI flags / options (--flag, --flag=value, -f)
    processed = processed.replace(
      /(?<=^|[\s(\[{"'])((?:--[a-zA-Z0-9_\-]+(?:=[^\s"'<>]+)?)|(?:-[a-zA-Z0-9]+))(?=[\s)\]}",:;!?]|$)/g,
      (m) => addMask(m)
    );

    const unmask = (translatedText: string): string => {
      if (!translatedText || masks.length === 0) {
        return translatedText;
      }
      return replaceMaskTokens(translatedText, format.id, (index) =>
        index >= 0 && index < masks.length ? masks[index] : undefined
      );
    };

    return {
      maskedText: processed,
      unmask,
    };
  }
}

/**
 * Resolve every in-range mask token in `text` through `resolve`.
 *
 * A token whose random id belongs to another masking pass, an out-of-range
 * index and any unmatched text are all kept verbatim; `hasMaskResidue()` on the
 * result is what flags a leaked token.
 */
export function replaceMaskTokens(
  text: string,
  id: string,
  resolve: (index: number) => string | undefined
): string {
  const pattern = new RegExp(MASK_TOKEN_PATTERN_SOURCE, 'i');
  let out = '';
  let cursor = 0;
  let passes = 0;

  while (cursor < text.length && passes++ < MAX_UNMASK_PASSES) {
    const candidate = pattern.exec(text.slice(cursor));
    if (!candidate) break;

    const start = cursor + candidate.index;
    const match = matchMaskToken(text, start, id);
    // `matchMaskToken` owns the authoritative token length: the scanning and
    // anchored patterns must never disagree on where a token ends.
    const length = match?.length ?? candidate[0].length;
    if (length <= 0) {
      cursor = start + 1;
      continue;
    }

    const replacement = match?.acceptsId ? resolve(match.index) : undefined;
    // Not ours (foreign id / out of range): keep the token verbatim.
    out += text.slice(cursor, start) + (replacement ?? text.slice(start, start + length));
    cursor = start + length;
  }

  return out + text.slice(cursor);
}

/**
 * True when a translated string would still show a mask token to the user.
 * Callers use it to discard a poisoned translation (and to evict poisoned
 * cache entries written by earlier releases).
 */
export function isMaskLeak(translatedText: string): boolean {
  return hasMaskResidue(translatedText);
}

/**
 * Same as `isMaskLeak`, but a token the source text already contained is not a
 * leak: text that talks about placeholders (this plugin's docs, a bug report)
 * must round-trip untouched.
 */
export function isMaskLeakAgainst(originalText: string, translatedText: string): boolean {
  return hasNewMaskResidue(originalText, translatedText);
}
