/**
 * The composer overlay's picker view: the dialog, its catalog, and its verbs.
 *
 * It lives in `conversation.input.overlay` rather than beside the row, because
 * the Host unmounts the model menu as soon as a row is clicked. Everything the
 * dialog reads arrives through this entry's injected face.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { ModelPicker } from './ModelPicker.tsx';
import type { FactsSource } from './facts-source.ts';
import {
  readFavorites,
  toggleFavorite,
  type FavoriteModel,
  type FavoritesStorage,
} from './favorites.ts';
import {
  effortFor,
  readEfforts,
  rememberEffort,
  type RememberedEffort,
} from './effort-memory.ts';
import { selectionOf, type Selection } from './selection.ts';
import type { PickerStore } from './picker-state.ts';
import css from './ModelOptions.module.css';

/** Props of the overlay view: the session, the store, and the seat's injected face. */
export type ModelPickerHostProps = PropsLocale<'modelSubmenu'>
  & ModelSelectInjected
  & {
    /** Session whose catalog this view renders. */
    readonly sessionId: string;
    /** The request written by the menu row. */
    readonly picker: PickerStore;
    /** The settings-derived metadata the picker's line reads. */
    readonly factsSource: FactsSource;
  }

/**
 * Render the picker for this session.
 * @param props - session, store, catalog face, and localized copy.
 * @returns the dialog while the store names this session; otherwise nothing.
 */
export function ModelPickerHost({
  sessionId, picker, available, directory, load, select, resolveText, factsSource, t,
}: ModelPickerHostProps) {
  const request = useSyncExternalStore(picker.subscribe, picker.getSnapshot);
  const state = useSyncExternalStore((listener) => directory.subscribe(listener), () => directory.getSnapshot());
  const [favorites, setFavorites] = useState<readonly FavoriteModel[]>(() => readFavorites(storageOf()));
  const [memory, setMemory] = useState<readonly RememberedEffort[]>(() => readEfforts(storageOf()));
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null);
  const toastSeq = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const busy = state.status === 'selecting';
  const live = useMemo(() => selectionOf(state), [state]);
  const facts = useSyncExternalStore((listener) => factsSource.subscribe(listener), () => factsSource.getSnapshot());
  const open = request.sessionId === sessionId;
  // The injected face is cached per entry and session, but the read goes through
  // a ref anyway: a catalog load writes the store, so an unstable `load` in the
  // dependency list would reload on every render it caused.
  const loadRef = useRef(load);
  loadRef.current = load;

  // Opening reads the catalog again: another client may have changed it, and a
  // failed load has to be retryable from the same gesture.
  useEffect(() => {
    if (open) loadRef.current();
  }, [open]);

  // The Host's own menu changes the reasoning level without passing through this
  // plugin, so the memory is written from the directory snapshot too — a picker
  // click alone would only ever record levels chosen in the dialog. The key guard
  // keeps one write per distinct selection instead of one per snapshot.
  const current = state.current;
  const rememberedRef = useRef<string | null>(null);
  useEffect(() => {
    if (current === null) return;
    const key = `${current.provider}/${current.model}/${current.reasoningEffort ?? ''}`;
    if (rememberedRef.current === key) return;
    rememberedRef.current = key;
    setMemory(rememberEffort(storageOf(), current.provider, current.model, current.reasoningEffort));
  }, [current]);

  if (!available) return null;

  const raiseToast = (text: string): void => {
    toastSeq.current += 1;
    setToast({ seq: toastSeq.current, text });
  };
  const submit = (selection: Selection): void => {
    void select(selection).then((result) => {
      if (result === undefined || result.ok) {
        setMemory(rememberEffort(storageOf(), selection.provider, selection.model, selection.reasoningEffort));
        picker.close();
        return;
      }
      raiseToast(result.error.code === 'session/writer-held'
        ? t('error.sessionInUse')
        : t('error.action', { message: `${result.error.code}: ${result.error.message}` }));
    });
  };

  return <div ref={rootRef} className={css.pickerHost}>
    <ModelPicker
      open={open}
      resolveText={resolveText}
      state={state}
      live={live}
      facts={facts}
      favorites={favorites}
      busy={busy}
      t={t}
      rememberedOf={(provider, model) => effortFor(memory, provider, model)}
      onPick={submit}
      onToggleFavorite={(provider, model) => {
        setFavorites(toggleFavorite(storageOf(), provider, model));
      }}
      onReload={load}
      onClose={() => {
        picker.close();
      }}
    />
    {toast !== null && <Toast
      key={toast.seq}
      text={toast.text}
      icon={<IconWarningOutlineRegular />}
      anchor={rootRef.current?.closest('[data-composer-card]') ?? null}
      onDone={() => {
        setToast(null);
      }}
    />}
  </div>;
}

/** Isolate the browser's storage so a locked-down browser reads as "no favorites". */
function storageOf(): FavoritesStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
