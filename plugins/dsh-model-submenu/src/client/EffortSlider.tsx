/**
 * The reasoning-level slider that replaces the Host's effort drill.
 *
 * The Host's second menu cell is a button that drills into a list of levels.
 * This slider sits inside that same cell, between the Host's label and value, so
 * the levels are reachable without leaving the menu. The levels are discrete but
 * the drag is not: the knob follows the pointer continuously, the level it
 * reports is the detent nearest that position, and letting go eases the knob onto
 * that detent and commits once. Keyboard arrows step and commit immediately.
 *
 * The fill takes the level's color, so the track and the two captions read as
 * one signal: "off" is neutral, the levels above it walk a blue-to-violet ramp,
 * and only the top level fills with the whole gradient.
 *
 * "Provider default" is not a detent: it is a state, drawn as an empty track
 * with a hollow knob, so it never reads as the lowest level.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { EffortChoice } from './selection.ts';
import { LEVEL_GRADIENT, isTopLevel, levelColor } from './level-color.ts';
import { detentAt, fillWidth, fractionAt, knobOffset, offsetOf } from './slider.ts';
import css from './ModelOptions.module.css';

/** Props of the slider: the levels, the one in force, and the commit path. */
export interface EffortSliderProps {
  /** The levels in catalog order, lowest first. */
  readonly steps: readonly EffortChoice[];
  /** Index of the level in force, already clamped into `steps`. */
  readonly current: number;
  /** Whether the provider default is in force instead of a level. */
  readonly defaultActive: boolean;
  /** Where the knob rests while the provider default is in force. */
  readonly defaultIndex: number;
  /** Localized name of the provider default, read while it is in force. */
  readonly defaultLabel: string;
  /** Whether a selection is in flight; input is ignored while it is. */
  readonly busy: boolean;
  /** Accessible name, taken from the Host's own row label. */
  readonly label: string;
  /** @param index - the level the user settled on. */
  readonly onCommit: (index: number) => void;
}

/**
 * Render the slider.
 * @param props - levels, the level in force, and the commit path.
 * @returns one focusable slider over the discrete levels.
 */
export function EffortSlider({
  steps, current, defaultActive, defaultIndex, defaultLabel, busy, label, onCommit,
}: EffortSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  // The drag position lives in a ref as well as in state: a press and a release
  // can arrive in one task, and the release must not read a render that never ran.
  const dragRef = useRef<number | null>(null);
  // While dragging this is where the pointer is along the travel, not a level:
  // the knob has to move with the pointer, or the drag reads as a series of jumps.
  const [drag, setDrag] = useState<number | null>(null);
  // After a release that submits, the knob waits on the detent it settled on
  // instead of springing back to the old level while the write is in flight.
  const [hold, setHold] = useState<number | null>(null);
  const dragging = drag !== null;
  const resting = defaultActive ? defaultIndex : current;
  const active = dragging ? detentAt(drag, steps.length) : resting;
  const knobFraction = drag ?? hold ?? offsetOf(resting, steps.length);
  // The color and the ticks follow the knob, not the level in force: during a
  // drag, and while a commit is in flight, the knob has already gone ahead.
  const shown = dragging || hold !== null ? detentAt(knobFraction, steps.length) : resting;
  const beginDrag = (fraction: number | null): void => {
    dragRef.current = fraction;
    setDrag(fraction);
  };

  // The hold ends as soon as the write does, whether it landed on the new level
  // or was rejected: the displayed level is the truth again either way.
  useEffect(() => {
    if (!busy) setHold(null);
  }, [busy]);
  useEffect(() => {
    setHold(null);
  }, [current, defaultActive]);

  const fractionAtPointer = (clientX: number): number => {
    const track = trackRef.current;
    if (track === null) return dragRef.current ?? knobFraction;
    const rect = track.getBoundingClientRect();
    return fractionAt(clientX, rect.left, rect.width);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (busy) return;
    // The Host's menu cell owns this subtree; without these the press would
    // also settle the cell and pull focus out of the slider.
    event.preventDefault();
    event.stopPropagation();
    setHold(null);
    beginDrag(fractionAtPointer(event.clientX));
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has no capture to take; the drag still tracks moves.
    }
    event.currentTarget.focus();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current === null || busy) return;
    beginDrag(fractionAtPointer(event.clientX));
  };

  const settle = (event: PointerEvent<HTMLDivElement>, commit: boolean): void => {
    if (dragRef.current === null) return;
    const next = detentAt(fractionAtPointer(event.clientX), steps.length);
    beginDrag(null);
    if (!commit) return;
    // Leaving the provider default is a change even when the knob lands where
    // the default already pointed.
    if (next !== current || defaultActive) {
      setHold(offsetOf(next, steps.length));
      onCommit(next);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (busy) return;
    const last = steps.length - 1;
    const next = event.key === 'ArrowRight' || event.key === 'ArrowUp'
      ? Math.min(active + 1, last)
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? Math.max(active - 1, 0)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null;
    if (next === null) return;
    // The menu walks rows with the arrow keys; a slider keeps them for itself.
    event.preventDefault();
    event.stopPropagation();
    if (next !== current || defaultActive) onCommit(next);
  };

  const offset = knobOffset(knobFraction);
  // The provider default fills nothing: the knob shows where it lands, the
  // track stays empty so it never reads as a chosen level.
  const idle = defaultActive && !dragging && hold === null;
  const filled = idle ? 0 : knobFraction;
  const fill = isTopLevel(shown, steps.length) ? LEVEL_GRADIENT : levelColor(shown, steps.length);
  return <div
    ref={trackRef}
    className={css.slider}
    role="slider"
    tabIndex={0}
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={Math.max(0, steps.length - 1)}
    aria-valuenow={active}
    aria-valuetext={defaultActive && !dragging ? defaultLabel : steps[active]?.label}
    aria-disabled={busy || undefined}
    data-busy={busy ? '' : undefined}
    data-dragging={dragging ? '' : undefined}
    data-default={idle ? '' : undefined}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={(event) => { settle(event, true); }}
    onPointerCancel={(event) => { settle(event, false); }}
    onKeyDown={onKeyDown}
    onClick={(event) => { event.stopPropagation(); }}
  >
    <div className={css.sliderTrack} aria-hidden="true">
      <div className={css.sliderFill} style={{ width: fillWidth(filled), background: fill }} />
      {steps.map((step, index) => <span
        key={step.key}
        className={css.sliderTick}
        data-on={index <= shown && !idle ? '' : undefined}
        style={{ left: knobOffset(offsetOf(index, steps.length)) }}
      />)}
      <div className={css.sliderKnob} style={{ left: offset }} />
    </div>
  </div>;
}
