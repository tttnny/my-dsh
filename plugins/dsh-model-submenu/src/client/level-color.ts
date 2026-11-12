/**
 * The accent one reasoning level carries.
 *
 * The ramp runs from the composer's blue at the lowest level to violet at the
 * highest. The slider's fill is a gradient between those same two ends, so the
 * color under the knob is exactly the color the level's text takes — one signal,
 * read in three places (the track, the menu's value, the composer's caption).
 */

/** Lowest level: the blue the composer already uses for accents. */
const LOW = [77, 147, 248] as const;

/** Highest level: violet. */
const HIGH = [147, 51, 234] as const;

/**
 * @param fraction - 0 at the lowest level, 1 at the highest.
 * @returns the level's color as a CSS `rgb()` string.
 */
export function levelColor(fraction: number): string {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const mix = (from: number, to: number): number => Math.round(from + (to - from) * clamped);
  return `rgb(${mix(LOW[0], HIGH[0])}, ${mix(LOW[1], HIGH[1])}, ${mix(LOW[2], HIGH[2])})`;
}

/** The fill's two ends; a linear gradient between them matches {@link levelColor} exactly. */
export const LEVEL_GRADIENT = `linear-gradient(90deg, ${levelColor(0)}, ${levelColor(1)})`;
