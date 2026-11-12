/**
 * Route the Host's own model cell to the all-provider picker.
 *
 * The Host draws the root menu's first two cells itself: the model cell drills
 * into the current provider's list, the effort cell into the levels. This plugin
 * wants the model cell to open its dialog instead, and the Host exposes no hook
 * for that cell. This entry is mounted exactly while the root pane is open, so
 * it can take the click on the menu surface before the cell's own handler runs.
 *
 * The cell is recognized as the menu surface's first `role="menuitem"` child,
 * which is the Host's root-menu shape. When it is not found the click is left
 * alone and the Host drills as it always did.
 */
import { useEffect, useRef } from 'react';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { PickerStore } from './picker-state.ts';

/** Props of the redirect: menu state, the owning session, and the picker store. */
export type ModelCellRedirectProps = PropsRuntime<'conversation.input.model.options'>
  & {
    /** Session whose catalog the picker will show. */
    readonly sessionId: string;
    /** Carries the open request to the overlay view. */
    readonly picker: PickerStore;
  }

/**
 * Render the marker and redirect the model cell while the root pane is open.
 * @param props - menu state, session, and the picker store.
 * @returns an inert marker; the entry's work is the click listener.
 */
export function ModelCellRedirect({ sessionId, picker, dismiss }: ModelCellRedirectProps) {
  const markerRef = useRef<HTMLSpanElement | null>(null);
  // The Host rebuilds `dismiss` on every render, so the listener reads the
  // current one through a ref instead of being torn down and reinstalled.
  const latest = useRef({ sessionId, picker, dismiss });
  latest.current = { sessionId, picker, dismiss };

  useEffect(() => {
    const surface = markerRef.current?.closest('[data-menu-material]');
    if (!(surface instanceof HTMLElement)) return;
    const redirect = (event: MouseEvent): void => {
      const cell = surface.querySelector(':scope > button[role="menuitem"]');
      if (cell === null) return;
      if (!(event.target instanceof Node) || !cell.contains(event.target)) return;
      // Capture on the surface runs before the React root's bubble listener, so
      // stopping here keeps the cell's own drill handler from ever running.
      event.preventDefault();
      event.stopPropagation();
      const request = latest.current;
      request.dismiss();
      request.picker.open(request.sessionId);
    };
    surface.addEventListener('click', redirect, true);
    return () => {
      surface.removeEventListener('click', redirect, true);
    };
  }, []);

  return <span ref={markerRef} hidden />;
}
