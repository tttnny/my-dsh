export interface MaskResult {
    maskedText: string;
    unmask: (translatedText: string) => string;
}
export declare class ContentMaskingPipeline {
    mask(text: string): MaskResult;
}
/**
 * Resolve every in-range mask token in `text` through `resolve`.
 *
 * A token whose random id belongs to another masking pass, an out-of-range
 * index and any unmatched text are all kept verbatim; `hasMaskResidue()` on the
 * result is what flags a leaked token.
 */
export declare function replaceMaskTokens(text: string, id: string, resolve: (index: number) => string | undefined): string;
/**
 * True when a translated string would still show a mask token to the user.
 * Callers use it to discard a poisoned translation (and to evict poisoned
 * cache entries written by earlier releases).
 */
export declare function isMaskLeak(translatedText: string): boolean;
/**
 * Same as `isMaskLeak`, but a token the source text already contained is not a
 * leak: text that talks about placeholders (this plugin's docs, a bug report)
 * must round-trip untouched.
 */
export declare function isMaskLeakAgainst(originalText: string, translatedText: string): boolean;
