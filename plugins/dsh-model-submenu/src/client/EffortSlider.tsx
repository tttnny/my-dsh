/**
 * The reasoning-level slider that replaces the Host's effort drill.
 *
 * The Host's second menu cell is a button that drills into a list of levels.
 * This slider sits inside that same cell, between the Host's label and value, so
 * the levels are reachable without leaving the menu. Levels are discrete: the
 * knob snaps to one detent per level, the drag only moves the knob, and the
 * release commits once. Keyboard arrows step and commit immediately.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { EffortChoice } from './selection.ts';
import { knobOffset, offsetOf, stepAt } from './slider.ts';
import css from './ModelOptions.module.css';

/** Props of the slider: the levels, the one in force, and the commit path. */
export interface EffortSliderProps {
  /** The levels in catalog order; the first is the provider default when the model has none. */
  readonly steps: readonly EffortChoice[];
  /** Index of the level in force, already clamped into `steps`. */
  readonly current: number;
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
export function EffortSlider({ steps, current, busy, label, onCommit }: EffortSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  // The drag index lives in a ref as well as in state: a press and a release can
  // arrive in one task, and the release must not read a render that never ran.
  const dragRef = useRef<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const active = drag ?? current;
  const beginDrag = (index: number | null): void => {
    dragRef.current = index;
    setDrag(index);
  };

  const indexAt = (clientX: number): number => {
    const track = trackRef.current;
    if (track === null) return active;
    const rect = track.getBoundingClientRect();
    return stepAt(clientX, rect.left, rect.width, steps.length);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (busy) return;
    // The Host's menu cell owns this subtree; without these the press would
    // also settle the cell and pull focus out of the slider.
    event.preventDefault();
    event.stopPropagation();
    beginDrag(indexAt(event.clientX));
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has no capture to take; the drag still tracks moves.
    }
    event.currentTarget.focus();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current === null || busy) return;
    const next = indexAt(event.clientX);
    if (next !== dragRef.current) beginDrag(next);
  };

  const settle = (event: PointerEvent<HTMLDivElement>, commit: boolean): void => {
    if (dragRef.current === null) return;
    const next = indexAt(event.clientX);
    beginDrag(null);
    if (commit && next !== current) onCommit(next);
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
    if (next !== current) onCommit(next);
  };

  const fraction = offsetOf(active, steps.length);
  const offset = knobOffset(fraction);
  return <div
    ref={trackRef}
    className={css.slider}
    role="slider"
    tabIndex={0}
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={Math.max(0, steps.length - 1)}
    aria-valuenow={active}
    aria-valuetext={steps[active]?.label}
    aria-disabled={busy || undefined}
    data-busy={busy ? '' : undefined}
    data-dragging={drag === null ? undefined : ''}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={(event) => { settle(event, true); }}
    onPointerCancel={(event) => { settle(event, false); }}
    onKeyDown={onKeyDown}
    onClick={(event) => { event.stopPropagation(); }}
  >
    <div className={css.sliderTrack} aria-hidden="true">
      <div className={css.sliderFill} style={{ width: offset }} />
      {steps.map((step, index) => <span
        key={step.key}
        className={css.sliderTick}
        data-on={index <= active ? '' : undefined}
        style={{ left: knobOffset(offsetOf(index, steps.length)) }}
      />)}
      <div className={css.sliderKnob} style={{ left: offset }} />
    </div>
  </div>;
}
