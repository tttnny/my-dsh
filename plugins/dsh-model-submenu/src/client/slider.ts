/**
 * Geometry of the discrete effort slider.
 *
 * The track is a capsule and the knob a slightly larger circle riding on it, so
 * the knob overhangs the track instead of merging with its rounded end. The
 * knob's centre travels between two points inset by the knob's radius, so the
 * knob never runs past either end. A pointer position becomes a position along
 * that travel; a position becomes the detent nearest it, or the CSS lengths that
 * put the knob and the fill there.
 */

/**
 * Track height in CSS pixels; the stylesheet keeps the same value. Half of it is
 * the radius of the track's ends and of the fill's cap.
 */
export const TRACK_HEIGHT = 16;

/**
 * Knob diameter in CSS pixels. It is larger than the track, so the knob reads as
 * a knob riding on the track rather than as the track's own end cap.
 */
export const KNOB_SIZE = 20;

/** The knob's centre keeps its own radius away from either end of the track. */
const KNOB_RADIUS = KNOB_SIZE / 2;

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
 * Where a pointer sits along the knob's travel. The drag reads this rather than a
 * detent, so the knob follows the pointer instead of jumping a level at a time.
 * @param clientX - pointer position in viewport coordinates.
 * @param left - the track's left edge in viewport coordinates.
 * @param width - the track's width in pixels.
 * @returns the position as a fraction of the travel, clamped to 0 and 1.
 */
export function fractionAt(clientX: number, left: number, width: number): number {
  const usable = width - KNOB_SIZE;
  if (usable <= 0) return 0;
  const fraction = (clientX - left - KNOB_RADIUS) / usable;
  return Math.min(Math.max(fraction, 0), 1);
}

/**
 * @param fraction - a knob position between 0 and 1.
 * @param count - number of detents.
 * @returns the detent nearest that position.
 */
export function detentAt(fraction: number, count: number): number {
  if (count <= 1) return 0;
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return Math.round(clamped * (count - 1));
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
  return detentAt(fractionAt(clientX, left, width), count);
}

/**
 * @param fraction - a knob position between 0 and 1.
 * @returns the CSS length that puts the knob centre there, inset at both ends.
 */
export function knobOffset(fraction: number): string {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return `calc(${KNOB_RADIUS}px + ${clamped} * (100% - ${KNOB_SIZE}px))`;
}

/**
 * Width of the colored fill for a knob position.
 *
 * The fill is the track's own shape cut at the knob: its right cap carries the
 * track's radius and ends under the knob, so the color runs into the knob
 * instead of stopping at a straight edge, and the last detent reaches the track's
 * end rather than the knob's centre.
 * @param fraction - a knob position between 0 and 1.
 * @returns the CSS width of the fill.
 */
export function fillWidth(fraction: number): string {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return `calc(${TRACK_HEIGHT}px + ${clamped} * (100% - ${TRACK_HEIGHT}px))`;
}
