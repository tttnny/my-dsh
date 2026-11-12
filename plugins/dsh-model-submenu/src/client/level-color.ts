/**
 * The accent one reasoning level carries.
 *
 * "Off" carries no accent at all — the fill and the caption stay neutral, so
 * switching reasoning off reads as switching it off rather than as the first
 * shade of a ramp. Every level above it walks a blue-to-violet ramp, and the
 * highest level is the only one whose fill is a gradient.
 */

/** Off: the dimmed label tone, the same neutral the Host uses for quiet text. */
const NEUTRAL = 'var(--dsw-alias-label-dimmed)';

/** Lowest lit level: the blue the composer already uses for accents. */
const LOW = [77, 147, 248] as const;

/** Highest level: violet. */
const HIGH = [147, 51, 234] as const;

/**
 * @param t - a point on the ramp, 0 at the lowest lit level and 1 at the top.
 * @returns the ramp color there.
 */
function ramp(t: number): string {
  const mix = (from: number, to: number): number => Math.round(from + (to - from) * t);
  return `rgb(${mix(LOW[0], HIGH[0])}, ${mix(LOW[1], HIGH[1])}, ${mix(LOW[2], HIGH[2])})`;
}

/**
 * @param index - the level's detent, 0 being "off".
 * @param count - number of detents.
 * @returns the level's color as a CSS color string.
 */
export function levelColor(index: number, count: number): string {
  if (index <= 0) return NEUTRAL;
  // The top level is always the violet end, even when it is the only lit one.
  if (isTopLevel(index, count)) return ramp(1);
  const span = Math.max(1, count - 2);
  return ramp(Math.min(Math.max((index - 1) / span, 0), 1));
}

/**
 * @param index - the level's detent.
 * @param count - number of detents.
 * @returns whether this level is the only one painted with a gradient.
 */
export function isTopLevel(index: number, count: number): boolean {
  return count > 1 && index === count - 1;
}

/** The top level's fill: the whole ramp, ending on the color its text takes. */
export const LEVEL_GRADIENT = `linear-gradient(90deg, ${ramp(0)}, ${ramp(1)})`;
