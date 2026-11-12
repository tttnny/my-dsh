/**
 * Tint the composer's effort caption with the level's color.
 *
 * The slider's fill and the menu's value already carry the level's color; the
 * caption on the collapsed trigger is the third place the level shows, and it
 * lives outside the menu. This entry stays mounted for the whole session and
 * writes that one color, so all three read as one signal.
 *
 * The caption is recognized as the trigger's `span[class*='triggerEffort']`
 * child — the same class-substring contract the menu row uses. When the model
 * declares no levels the span does not exist and nothing is written.
 */
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import { levelColor } from './level-color.ts';
import { effortChoices, liveReasoning } from './selection.ts';
import { offsetOf } from './slider.ts';

/** Props of the tint: the shared catalog face. */
export type EffortTintProps = Pick<ModelSelectInjected, 'available' | 'directory'>;

/**
 * Render nothing and keep the trigger caption colored.
 * @param props - the session's catalog face.
 * @returns an inert marker.
 */
export function EffortTint({ available, directory }: EffortTintProps) {
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const [caption, setCaption] = useState<HTMLElement | null>(null);
  const state = useSyncExternalStore(
    (listener) => directory.subscribe(listener),
    () => directory.getSnapshot(),
  );
  const levels = effortChoices(liveReasoning(state));
  const effort = state.current?.reasoningEffort;
  const chosen = effort === undefined ? -1 : levels.findIndex((level) => level.effort === effort);
  // The provider default has no color of its own: the caption keeps the Host's.
  const color = available && chosen >= 0 && levels.length >= 2
    ? levelColor(offsetOf(chosen, levels.length))
    : null;

  // The Host rebuilds the trigger on every model change, so the caption is
  // re-read after each render; the identity guard keeps that from looping.
  useLayoutEffect(() => {
    const card = markerRef.current?.closest('[data-composer-card]');
    const next = card?.querySelector<HTMLElement>(
      '[data-slot="conversation.input.model"] button[aria-haspopup="menu"] span[class*="triggerEffort"]',
    ) ?? null;
    if (next !== caption) setCaption(next);
  });

  useLayoutEffect(() => {
    if (caption === null || color === null) return;
    const saved = caption.style.color;
    caption.style.color = color;
    return () => {
      caption.style.color = saved;
    };
  }, [caption, color]);

  return <span ref={markerRef} hidden />;
}
