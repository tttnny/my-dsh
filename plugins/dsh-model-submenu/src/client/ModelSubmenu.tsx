import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  IconChevronDownOutlineRegular,
  IconFlatListOutlineRegular,
  IconWarningOutlineRegular,
  MenuSurface,
  Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelDirectoryState, ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ModelPicker } from './ModelPicker.tsx'
import { ModelRow } from './ModelRow.tsx'
import type { FactsSource } from './facts-source.ts'
import {
  isFavorite,
  orderWithFavorites,
  readFavorites,
  toggleFavorite,
  type FavoriteModel,
  type FavoritesStorage,
} from './favorites.ts'
import type { EffortChoice, EffortMark, Selection } from './selection.ts'
import { reasoningOf } from './rows.ts'
import { effortChoices, planEffortCommit, planModelCommit } from './selection.ts'
import css from './ModelSubmenu.module.css'

type ModelSubmenuProps = ModelSelectInjected & { locked: boolean } & PropsLocale<'modelSubmenu'> & {
  /** The live settings-derived metadata the picker's line reads. */
  readonly factsSource: FactsSource
}

type ProviderGroup = ModelDirectoryState['groups'][number]
type CatalogModel = ProviderGroup['models'][number]

/** Unplaced portal card: hidden but laid out at a fixed origin so offsetWidth/offsetHeight are real. */
const MEASURE_STYLE = {
  visibility: 'hidden',
  left: 0,
  top: 0,
} as const

const cls = (...parts: readonly (string | false | undefined)[]): string => parts.filter((part) => part !== false && part !== undefined).join(' ')

/**
 * The composer's model seat (`conversation.input.model`), taken over from the
 * built-in occupant with a provider-scoped menu: one provider's models above,
 * the reasoning row as segments, the cache warning, and the door to the picker
 * that lists every provider.
 *
 * A model click commits at once. A reasoning mark commits when the menu closes,
 * whether the close came from a click outside, Escape, a model click, or the
 * picker door — the picker opens only after the marked level has landed, so its
 * "current" reading is never stale.
 */
export function ModelSubmenu({ locked, available, directory, load, select, t, factsSource }: ModelSubmenuProps) {
  const state = useSyncExternalStore((fn) => directory.subscribe(fn), () => directory.getSnapshot())
  const [open, setOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [mark, setMark] = useState<EffortMark | null>(null)
  const [favorites, setFavorites] = useState<readonly FavoriteModel[]>(() => readFavorites(storageOf()))
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null)
  const id = useId()

  const groups = state.groups
  const current = state.current
  const currentGroup = current === null ? undefined : groups.find((group) => group.id === current.provider)
  const currentModel = currentGroup?.models.find((model) => model.id === current?.model)
  const reasoning = currentModel?.reasoning
  const effectiveEffort = current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('effort.providerDefault')
      : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort
  const choices = useMemo(() => effortChoices(reasoning, t('effort.providerDefault')), [reasoning, t])
  /** The segments show the marked level while one is marked, the live one otherwise. */
  const shownEffort = mark === null ? effectiveEffort : mark.effort
  const busy = state.status === 'selecting'
  const live = useMemo(() => selectionOf(state), [state])
  const reason = useMemo(() => reasoningOf(groups), [groups])
  const facts = useSyncExternalStore((fn) => factsSource.subscribe(fn), () => factsSource.getSnapshot())

  const menuRows = useMemo(() => currentGroup === undefined ? [] : orderWithFavorites(
    currentGroup.models,
    (model) => isFavorite(favorites, currentGroup.id, model.id),
  ), [currentGroup, favorites])

  const raiseToast = (text: string) => {
    toastSeq.current += 1
    setToast({ seq: toastSeq.current, text })
  }
  const reload = () => {
    load()
  }
  const submit = (selection: Selection, onDone: (() => void) | null, onRejected?: () => void) => {
    select(selection).then((result) => {
      if (result === undefined || result.ok) {
        onDone?.()
        return
      }
      onRejected?.()
      raiseToast(result.error.code === 'session/writer-held'
        ? t('error.sessionInUse')
        : t('error.action', { message: `${result.error.code}: ${result.error.message}` }))
    })
  }
  /** Close the menu, writing the marked level when it differs from the live one. */
  const closeMenu = useCallback((restoreFocus: boolean) => {
    const pending = live === null ? null : planEffortCommit(live, mark)
    setOpen(false)
    setMark(null)
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
    if (pending !== null) submit(pending, null)
    // submit reads only the stable seat props and the toast setter.
  }, [live, mark])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node) === true) return
      if (menuRef.current?.contains(event.target as Node) === true) return
      closeMenu(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
    }
  }, [open, closeMenu])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled])')
      const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]:not([disabled])')
      const target = checked ?? first ?? triggerRef.current
      target?.scrollIntoView({ block: 'nearest' })
      target?.focus()
    })
    return () => { cancelAnimationFrame(frame) }
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      const MARGIN = 12
      const lw = menuRef.current?.offsetWidth ?? 0
      const lh = menuRef.current?.offsetHeight ?? 0
      let x = rect.right - lw
      let y = rect.top - 8 - lh
      if (lw > 0) x = Math.min(Math.max(x, MARGIN), window.innerWidth - lw - MARGIN)
      if (lh > 0) y = Math.min(Math.max(y, MARGIN), window.innerHeight - lh - MARGIN)
      setMenuPos({ left: x, top: y })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, state])

  if (!available) return null

  const show = () => {
    setMark(null)
    setOpen(true)
    reload()
  }
  /** The picker door: land the marked level first, then swap surfaces. */
  const openPicker = () => {
    const pending = live === null ? null : planEffortCommit(live, mark)
    setMark(null)
    if (pending === null) {
      setOpen(false)
      setPickerOpen(true)
      return
    }
    submit(pending, () => {
      setOpen(false)
      setPickerOpen(true)
    })
  }
  const chooseModel = (provider: string, model: CatalogModel) => {
    const picked = planModelCommit(live, provider, model.id, mark, reason)
    if (picked === null) {
      setOpen(false)
      setMark(null)
      queueMicrotask(() => { triggerRef.current?.focus() })
      return
    }
    // A model click is the decision: close at once, and keep the menu open when
    // the host rejects it so the user can try another model.
    setOpen(false)
    setMark(null)
    submit(picked, () => { queueMicrotask(() => { triggerRef.current?.focus() }) }, () => {
      // The host refused it: put the menu back so the user can pick another.
      setOpen(true)
    })
  }
  const rowButtons = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not([disabled])') ?? [])]
  const moveFocus = (offset: number) => {
    const items = rowButtons()
    if (items.length === 0) return
    const active = items.findIndex((item) => item === document.activeElement)
    items[active === -1 ? offset > 0 ? 0 : items.length - 1 : (active + offset + items.length) % items.length]?.focus()
  }
  const onEffortKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    if (choices.length === 0) return
    event.preventDefault()
    const index = choices.findIndex((choice) => choice.effort === shownEffort)
    const step = event.key === 'ArrowRight' ? 1 : -1
    const next = choices[((index === -1 ? 0 : index) + step + choices.length) % choices.length]
    if (next !== undefined) setMark({ effort: next.effort })
  }
  const onRootKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      closeMenu(true)
      return
    }
    if (!open) return
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        event.preventDefault()
        closeMenu(true)
        return
      }
      const focused = document.activeElement
      const rows = rowButtons()
      if (focused instanceof HTMLButtonElement && rows.includes(focused)) {
        event.preventDefault()
        focused.click()
        return
      }
      if (focused !== triggerRef.current) return
      event.preventDefault()
      const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled])')
      ;(checked ?? rows[0])?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
  }
  const onBlur = (event: React.FocusEvent) => {
    if (pickerOpen) return
    if (event.relatedTarget instanceof Node
      && (rootRef.current?.contains(event.relatedTarget) === true || menuRef.current?.contains(event.relatedTarget) === true)) return
    closeMenu(false)
  }
  const toggleFavoriteOf = (provider: string, model: string) => {
    setFavorites(toggleFavorite(storageOf(), provider, model))
  }

  const waiting = current === null && state.status === 'loading'
  const modelLabel = waiting ? t('trigger.loading') : currentModel?.name ?? (current === null ? t('trigger.fallback') : `${current.provider}/${current.model}`)
  const triggerAria = waiting
    ? t('trigger.loading')
    : current === null
      ? t('trigger.selectAria')
      : effortLabel === undefined
        ? t('trigger.aria', { model: modelLabel })
        : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })
  const providerName = currentGroup?.name
    ?? state.failures.find((failure) => failure.id === current?.provider)?.name
    ?? current?.provider
    ?? ''
  const providerFailure = current === null ? undefined : state.failures.find((failure) => failure.id === current.provider)

  return (
    <div ref={rootRef} className={css.root} onKeyDown={onRootKeyDown} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-label={triggerAria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`}
        disabled={locked}
        onClick={() => {
          if (open) closeMenu(false)
          else show()
        }}
      >
        <IconFlatListOutlineRegular className={css.triggerIcon} size={16} />
        <span className={css.triggerLabel}>{modelLabel}</span>
        {effortLabel !== undefined && <span className={css.triggerEffort}>{effortLabel}</span>}
        <IconChevronDownOutlineRegular className={cls(css.chevron, open && css.chevronOpen)} />
      </button>
      {open && createPortal((
        <MenuSurface
          ref={menuRef}
          id={`${id}-menu`}
          className={css.menu}
          style={menuPos ?? MEASURE_STYLE}
          role="group"
          aria-label={t('menu.aria')}
          aria-busy={state.status === 'loading' || busy}
        >
          <div className={css.providerName} title={providerName}>{providerName}</div>
          {state.status === 'loading' && <div className={css.notice}>{t('status.loading')}</div>}
          {state.error !== null && state.status === 'error' && (
            <div className={css.notice}>
              <span>{t('status.failed', { message: state.error })}</span>
              <button type="button" className={css.retry} onClick={reload}>{t('action.reload')}</button>
            </div>
          )}
          {providerFailure !== undefined && (
            <div className={css.notice}>
              <span>{t('status.providerFailed', { name: providerFailure.name, message: providerFailure.message })}</span>
              <button type="button" className={css.retry} onClick={reload}>{t('action.reload')}</button>
            </div>
          )}
          <div className={cls(css.groups, 'scrollable')} role="menu" aria-label={t('menu.aria')}>
            {menuRows.map((model) => (
              <ModelRow
                key={model.id}
                name={model.name}
                selected={current !== null && currentGroup !== undefined && current.provider === currentGroup.id && current.model === model.id}
                busy={busy}
                star="static"
                favorited={currentGroup !== undefined && isFavorite(favorites, currentGroup.id, model.id)}
                onPick={() => {
                  if (currentGroup !== undefined) chooseModel(currentGroup.id, model)
                }}
              />
            ))}
            {menuRows.length === 0 && state.status === 'ready' && (
              <div className={css.notice}>{t('status.empty')}</div>
            )}
          </div>
          <div className={css.divider} />
          <div className={css.effortRow}>
            <span className={css.effortHeading}>{t('menu.effort')}</span>
            {choices.length > 0 && (
              <div className={css.effortTrack} role="radiogroup" aria-label={t('menu.effort')} onKeyDown={onEffortKeyDown}>
                {choices.map((choice: EffortChoice) => (
                  <button
                    key={choice.key}
                    type="button"
                    role="radio"
                    aria-checked={choice.effort === shownEffort}
                    className={css.effortSegment}
                    disabled={busy}
                    onClick={() => { setMark({ effort: choice.effort }) }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={css.divider} />
          <p className={css.hint}>{t('menu.hint')}</p>
          <div className={css.divider} />
          <button type="button" role="menuitem" className={css.moreRow} onClick={openPicker}>
            <IconFlatListOutlineRegular className={css.moreIcon} size={16} />
            <span>{t('menu.more')}</span>
          </button>
        </MenuSurface>
      ), document.body)}
      <ModelPicker
        open={pickerOpen}
        state={state}
        live={live}
        facts={facts}
        favorites={favorites}
        busy={busy}
        t={t}
        onPick={(selection) => { submit(selection, () => { setPickerOpen(false) }) }}
        onToggleFavorite={toggleFavoriteOf}
        onReload={reload}
        onClose={() => {
          setPickerOpen(false)
          queueMicrotask(() => { triggerRef.current?.focus() })
        }}
      />
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutlineRegular />}
          anchor={rootRef.current?.closest('[data-composer-card]') ?? null}
          onDone={() => {
            setToast(null)
          }}
        />
      )}
    </div>
  )
}

/** The selection in force, or null while the host has not resolved one. */
function selectionOf(state: ModelDirectoryState): Selection | null {
  if (state.current === null) return null
  return state.current.reasoningEffort === undefined
    ? { provider: state.current.provider, model: state.current.model }
    : { provider: state.current.provider, model: state.current.model, reasoningEffort: state.current.reasoningEffort }
}

/** Isolate the browser's storage so a locked-down browser reads as "no favorites". */
function storageOf(): FavoritesStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
