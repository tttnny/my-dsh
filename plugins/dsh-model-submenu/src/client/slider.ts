/**
 * Geometry of the discrete effort slider.
 *
 * The track carries one detent per level and the knob's centre travels between
 * two ends inset by the knob radius, so the knob never overhangs the track. A
 * pointer position becomes the detent nearest it; a detent becomes a fraction
 * of the track that CSS turns into the knob's centre and the filled width.
 */

/** Knob diameter in CSS pixels; the centre stops half of it from each end. */
export const KNOB_SIZE = 18;

/**
 * The star field painted over the filled part of the track.
 *
 * Positions are a cheap deterministic scatter rather than a random draw: a drag
 * re-renders on every detent, and the dots must not jump around while the knob
 * moves. `x` and `y` are percentages inside the fill.
 */
export const SLIDER_STARS: readonly { x: number; y: number; size: number; delay: number }[] = Array.from(
  { length: 14 },
  (_, index) => ({
    x: 6 + ((index * 37) % 88),
    y: 12 + ((index * 53) % 76),
    size: 1 + ((index * 7) % 3) * 0.4,
    delay: (index * 0.37) % 2.4,
  }),
);

/**
 * @param index - detent index.
 * @param count - number of detents.
 * @returns the knob centre as a fraction of the track, 0 at the first detent and 1 at the last.
 */
export function offsetOf(index: number, count: number): number {
  if (count <= 1) return 0;
  const clamped = Math.min(Math.max(index, 0), count - 1);
  return clamped / (count - 1);
}

/**
 * @param clientX - pointer position in viewport coordinates.
 * @param left - the track's left edge in viewport coordinates.
 * @param width - the track's width in pixels.
 * @param count - number of detents.
 * @returns the detent nearest the pointer, clamped to the two ends.
 */
export function stepAt(clientX: number, left: number, width: number, count: number): number {
  if (count <= 1) return 0;
  const usable = width - KNOB_SIZE;
  if (usable <= 0) return 0;
  const fraction = (clientX - left - KNOB_SIZE / 2) / usable;
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return Math.round(clamped * (count - 1));
}

/**
 * @param fraction - a knob position between 0 and 1.
 * @returns the CSS length that puts the knob centre there, inset at both ends.
 */
export function knobOffset(fraction: number): string {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return `calc(${KNOB_SIZE / 2}px + ${clamped} * (100% - ${KNOB_SIZE}px))`;
}
