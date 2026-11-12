/**
 * Bridge the Host's own model menu: the model cell opens the all-provider
 * picker, and the effort cell carries the reasoning-level slider.
 *
 * The Host draws the root menu's first two cells itself: the model cell drills
 * into the current provider's list, the effort cell into the levels. This plugin
 * wants the first to open its dialog and the second to stop drilling, and the
 * Host exposes no hook for either. This entry is mounted exactly while the root
 * pane is open, so it can take the click on the menu surface before the cells'
 * own handlers run and mount the slider into the effort cell.
 *
 * The cells are recognized as the menu surface's direct `role="menuitem"`
 * children, which is the Host's root-menu shape; the options slot output sits in
 * its own wrapper, so other plugins' rows never join that list. When the second
 * cell is missing the model declares no reasoning levels and the row is left
 * alone; when the first is missing the click falls through to the Host.
 *
 * Clicking the cell's label switches to the provider default, which is a state
 * rather than a detent: the slider shows it as an empty track under a hollow
 * knob, so it never reads as the weakest level.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { EffortSlider } from './EffortSlider.tsx';
import type { PickerStore } from './picker-state.ts';
import { effortChoices, liveReasoning, planEffortCommit, selectionOf, type Selection } from './selection.ts';
import css from './ModelOptions.module.css';

/** Props of the bridge: menu state, the owning session, and the seat's injected face. */
export type ModelMenuBridgeProps = PropsRuntime<'conversation.input.model.options'>
  & PropsLocale<'modelSubmenu'>
  & Pick<ModelSelectInjected, 'available' | 'directory' | 'select'>
  & {
    /** Session whose catalog and picker this menu drives. */
    readonly sessionId: string;
    /** Carries the open request to the overlay view. */
    readonly picker: PickerStore;
  }

/**
 * Render the marker, redirect the model cell, and mount the effort slider.
 * @param props - menu state, session, catalog face, and localized copy.
 * @returns an inert marker plus the slider while the effort cell is present.
 */
export function ModelMenuBridge({
  sessionId, picker, dismiss, reportFailure, available, directory, select, t,
}: ModelMenuBridgeProps) {
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [effortRow, setEffortRow] = useState<HTMLElement | null>(null);
  const [rowLabel, setRowLabel] = useState<string | null>(null);

  const state = useSyncExternalStore(
    (listener) => directory.subscribe(listener),
    () => directory.getSnapshot(),
  );
  const current = state.current;
  const reasoning = liveReasoning(state);
  const levels = useMemo(() => effortChoices(reasoning), [reasoning]);
  const declared = levels.findIndex((level) => level.effort === reasoning?.defaultEffort);
  const chosen = current?.reasoningEffort === undefined
    ? -1
    : levels.findIndex((level) => level.effort === current.reasoningEffort);
  // The provider default is a state, not a detent: it is in force whenever the
  // session carries no explicit level.
  const defaultActive = current !== null && current.reasoningEffort === undefined;
  const currentIndex = chosen >= 0 ? chosen : declared >= 0 ? declared : 0;
  const defaultIndex = declared >= 0 ? declared : 0;
  const canDefault = !defaultActive;
  const busy = state.pending !== null;
  // One detent is not a choice: leave the Host's row exactly as it is.
  const showSlider = available && levels.length >= 2 && effortRow !== null;

  // The Host rebuilds its cells on every render, so the surface and the effort
  // cell are re-read after each one; the identity guards keep that from looping.
  useLayoutEffect(() => {
    const foundSurface = markerRef.current?.closest('[data-menu-material]');
    const nextSurface = foundSurface instanceof HTMLElement ? foundSurface : null;
    if (nextSurface !== surface) setSurface(nextSurface);
    const cells = nextSurface === null
      ? []
      : [...nextSurface.querySelectorAll<HTMLElement>(':scope > button[role="menuitem"]')];
    const nextRow = cells.length >= 2 ? cells[1] ?? null : null;
    if (nextRow !== effortRow) setEffortRow(nextRow);
    const nextLabel = nextRow?.querySelector("span[class*='cellLabel']")?.textContent?.trim() ?? '';
    if (nextLabel !== (rowLabel ?? '')) setRowLabel(nextLabel);
  });

  const submit = (selection: Selection | null): void => {
    if (selection === null) return;
    void select(selection).then((result) => {
      if (result === undefined || result.ok) return;
      reportFailure(result.error.code === 'session/writer-held'
        ? t('error.sessionInUse')
        : t('error.action', { message: `${result.error.code}: ${result.error.message}` }));
    });
  };
  const commit = (index: number): void => {
    const live = selectionOf(state);
    const level = levels[index];
    if (live === null || level === undefined) return;
    submit(planEffortCommit(live, level.effort));
  };
  const commitDefault = (): void => {
    const live = selectionOf(state);
    if (live === null) return;
    submit(planEffortCommit(live, undefined));
  };

  // The Host rebuilds `dismiss` on every render, so the listener reads the
  // current one through a ref instead of being torn down and reinstalled.
  const latest = useRef({ sessionId, picker, dismiss, showSlider, canDefault, commitDefault });
  latest.current = { sessionId, picker, dismiss, showSlider, canDefault, commitDefault };

  useEffect(() => {
    if (surface === null) return;
    const redirect = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const cells = [...surface.querySelectorAll<HTMLElement>(':scope > button[role="menuitem"]')];
      const modelCell = cells[0];
      if (modelCell !== undefined && modelCell.contains(target)) {
        // Capture on the surface runs before the React root's bubble listener, so
        // stopping here keeps the cell's own drill handler from ever running.
        event.preventDefault();
        event.stopPropagation();
        const request = latest.current;
        request.dismiss();
        request.picker.open(request.sessionId);
        return;
      }
      const row = cells[1];
      if (row === undefined || !row.contains(target) || !latest.current.showSlider) return;
      // The slider owns its own presses; only the label and the value are inert.
      if (sliderRef.current?.contains(target) === true) return;
      event.preventDefault();
      event.stopPropagation();
      const label = row.querySelector("span[class*='cellLabel']");
      if (latest.current.canDefault && label !== null && label.contains(target)) {
        latest.current.commitDefault();
        return;
      }
      sliderRef.current?.querySelector<HTMLElement>('[role="slider"]')?.focus();
    };
    surface.addEventListener('click', redirect, true);
    return () => {
      surface.removeEventListener('click', redirect, true);
    };
  }, [surface]);

  // The slider takes the whole slack beside the label: the value and the
  // chevron go, because the level is already written under the composer and the
  // row no longer drills anywhere. Every write is recorded and put back.
  useLayoutEffect(() => {
    if (effortRow === null || !showSlider) return;
    const label = effortRow.querySelector<HTMLElement>("span[class*='cellLabel']");
    const value = effortRow.querySelector<HTMLElement>("span[class*='cellValue']");
    const chevron = effortRow.querySelector<SVGElement>("svg[class*='cellChevron']");
    const saved = {
      value: value?.style.display ?? '',
      chevron: chevron?.style.display ?? '',
      cursor: label?.style.cursor ?? '',
      title: label?.getAttribute('title') ?? null,
    };
    if (value !== null) value.style.display = 'none';
    if (chevron !== null) chevron.style.display = 'none';
    if (label !== null && canDefault) {
      label.style.cursor = 'pointer';
      label.title = t('effort.useDefault');
    }
    return () => {
      if (value !== null) value.style.display = saved.value;
      if (chevron !== null) chevron.style.display = saved.chevron;
      if (label !== null) {
        label.style.cursor = saved.cursor;
        if (saved.title === null) label.removeAttribute('title');
        else label.title = saved.title;
      }
    };
  }, [effortRow, showSlider, canDefault, t]);

  return <>
    <span ref={markerRef} hidden />
    {showSlider && effortRow !== null && createPortal(
      <div ref={sliderRef} className={css.sliderCell}>
        <EffortSlider
          steps={levels}
          current={currentIndex}
          defaultActive={defaultActive}
          defaultIndex={defaultIndex}
          defaultLabel={t('effort.providerDefault')}
          busy={busy}
          label={rowLabel !== null && rowLabel !== '' ? rowLabel : t('effort.label')}
          onCommit={commit}
        />
      </div>,
      effortRow,
    )}
  </>;
}
