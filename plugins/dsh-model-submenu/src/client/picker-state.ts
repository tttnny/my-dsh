/**
 * Which session's picker is open.
 *
 * The row that asks for the picker lives inside the composer model menu, and the
 * Host unmounts that menu the moment a row is clicked. The dialog lives in the
 * composer's overlay slot, which stays mounted. One plugin-wide store carries the
 * request across that unmount — the same split the Host's own command popups use
 * between their controller and their overlay view.
 */

/** What the store publishes. */
export interface PickerSnapshot {
  /** Session whose picker is open, or null when none is. */
  readonly sessionId: string | null
}

/** Open and close verbs plus the observable the overlay view subscribes to. */
export interface PickerStore {
  /** @returns the current request. */
  readonly getSnapshot: () => PickerSnapshot
  /** @param listener - called after every change. @returns the unsubscribe. */
  readonly subscribe: (listener: () => void) => () => void
  /** @param sessionId - open the picker for one session, replacing any other. */
  readonly open: (sessionId: string) => void
  /** Close whatever is open. */
  readonly close: () => void
}

/**
 * @returns a store that starts closed.
 */
export function createPickerStore(): PickerStore {
  let snapshot: PickerSnapshot = { sessionId: null };
  const listeners = new Set<() => void>();
  const publish = (next: PickerSnapshot): void => {
    if (next.sessionId === snapshot.sessionId) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open: (sessionId) => {
      publish({ sessionId });
    },
    close: () => {
      publish({ sessionId: null });
    },
  };
}
