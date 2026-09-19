import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import {
  IconCheckOutline16,
  IconChevronDownOutline14,
  IconChevronLeftOutline14,
  IconChevronRightOutline14,
  IconDataOutline16,
  IconWarningOutline16,
  Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelDirectoryState, ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ModelSubmenu.module.css'

type ModelSubmenuProps = ModelSelectInjected & { locked: boolean } & PropsLocale<'modelSubmenu'>

type Selection = Parameters<ModelSelectInjected['select']>[0]
type ProviderGroup = ModelDirectoryState['groups'][number]
type CatalogModel = ProviderGroup['models'][number]

/** Which list the open menu is showing. */
type Pane = 'root' | 'providers' | 'models' | 'effort'

/** Unplaced portal card: hidden but laid out at a fixed origin so offsetWidth/offsetHeight are real. */
const MEASURE_STYLE = {
  visibility: 'hidden',
  left: 0,
  top: 0,
} as const

const cls = (...parts: readonly (string | false | undefined)[]): string => parts.filter((part) => part !== false && part !== undefined).join(' ')

/**
 * The composer's model seat (`conversation.input.model`), taken over from the
 * built-in occupant with a provider level: the root pane keeps the built-in's
 * two cells — 供应商 in place of 模型, plus the native 推理等级 — the provider
 * cell drills into the catalog's providers, and a provider drills into its
 * models before submitting. The trigger, the menu surface, the keyboard
 * contract (arrows move, Tab settles, Escape and Shift+Tab leave a drilled pane
 * first), the effort list and the failure surfaces are the built-in ones.
 */
export function ModelSubmenu({ locked, available, directory, load, select, t }: ModelSubmenuProps) {
  const state = useSyncExternalStore((fn) => directory.subscribe(fn), () => directory.getSnapshot())
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  const [providerId, setProviderId] = useState<string | null>(null)
  const lastActionRef = useRef<'load' | 'select'>('load')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  const focusIntent = useRef<string | null>(null)
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
  const effortChoices = useMemo(() => reasoning === undefined ? [] : [
    ...reasoning.defaultEffort === undefined
      ? [{ key: 'provider-default', effort: undefined as string | undefined, label: t('effort.providerDefault') }]
      : [],
    ...reasoning.efforts.map((level) => ({ key: `effort:${level.id}`, effort: level.id as string | undefined, label: level.name })),
  ], [reasoning, t])

  const shownGroup = pane === 'models' && providerId !== null ? groups.find((group) => group.id === providerId) : undefined
  const busy = state.status === 'selecting'

  const reload = () => {
    lastActionRef.current = 'load'
    load()
  }

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node) === true) return
      if (menuRef.current?.contains(event.target as Node) === true) return
      setOpen(false)
      setPane('root')
    }
    document.addEventListener('mousedown', closeOutside)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
    }
  }, [open])

  useEffect(() => {
    const intent = focusIntent.current
    focusIntent.current = null
    if (!open || intent === null) return
    if (intent === 'initial') {
      const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled]), [role="menuitem"][aria-current="true"]:not([disabled])')
      const first = [...itemRefs.current].find(([key]) => !key.startsWith('back:'))?.[1]
      ;(checked ?? first ?? triggerRef.current)?.focus()
      return
    }
    ;(itemRefs.current.get(intent) ?? triggerRef.current)?.focus()
  }, [open, pane])

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
  }, [open, pane, state])

  if (!available) return null

  const show = () => {
    setPane('root')
    setProviderId(null)
    setOpen(true)
    reload()
  }
  const close = (restoreFocus = false) => {
    setOpen(false)
    setPane('root')
    setProviderId(null)
    if (restoreFocus) queueMicrotask(() => {
      triggerRef.current?.focus()
    })
  }
  const drill = (next: Pane) => {
    focusIntent.current = 'initial'
    setPane(next)
  }
  /** Leave the shown pane for its parent, handing the keyboard back to the row that opened it. */
  const back = () => {
    if (pane === 'models') {
      focusIntent.current = providerId === null ? null : `provider:${providerId}`
      setPane('providers')
      return
    }
    focusIntent.current = pane === 'effort' ? 'root:effort' : 'root:provider'
    setPane('root')
  }
  const moveFocus = (offset: number) => {
    const items = [...itemRefs.current.values()]
    if (items.length === 0) return
    const active = items.findIndex((item) => item === document.activeElement)
    items[active === -1 ? offset > 0 ? 0 : items.length - 1 : (active + offset + items.length) % items.length]?.focus()
  }
  const onRootKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      if (pane !== 'root') back()
      else close(true)
      return
    }
    if (!open) return
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        event.preventDefault()
        if (pane !== 'root') back()
        else close(true)
        return
      }
      const focused = document.activeElement
      const rows = [...itemRefs.current.values()]
      if (focused instanceof HTMLButtonElement && rows.includes(focused)) {
        event.preventDefault()
        focused.click()
        return
      }
      if (focused !== triggerRef.current) return
      event.preventDefault()
      const checked = menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]:not([disabled]), [role="menuitem"][aria-current="true"]:not([disabled])')
      ;(checked ?? rows.find((item) => !item.disabled))?.focus()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
  }
  const onBlur = (event: React.FocusEvent) => {
    if (event.relatedTarget instanceof Node && (rootRef.current?.contains(event.relatedTarget) === true || menuRef.current?.contains(event.relatedTarget) === true)) return
    close()
  }
  const settleSelection = (result: Awaited<ReturnType<ModelSelectInjected['select']>>) => {
    if (result === undefined) return
    if (result.ok) {
      if (rootRef.current !== null) close(true)
      return
    }
    const { error } = result
    toastSeq.current += 1
    setToast({
      seq: toastSeq.current,
      text: error.code === 'session/writer-held' ? t('error.sessionInUse') : t('error.action', { message: `${error.code}: ${error.message}` }),
    })
  }
  const submit = (selection: Selection) => {
    lastActionRef.current = 'select'
    select(selection).then(settleSelection)
  }
  /** A model commits outright; its reasoning levels stay behind the root's effort cell. */
  const chooseModel = (provider: string, model: CatalogModel) => {
    if (current?.provider === provider && current.model === model.id) {
      close(true)
      return
    }
    submit({ provider, model: model.id })
  }
  const chooseEffort = (effort: string | undefined) => {
    if (current === null) return
    if (effectiveEffort === effort) {
      close(true)
      return
    }
    submit({ provider: current.provider, model: current.model, ...effort === undefined ? {} : { reasoningEffort: effort } })
  }
  const waiting = current === null && state.status === 'loading'
  const modelLabel = waiting ? t('trigger.loading') : currentModel?.name ?? (current === null ? t('trigger.fallback') : `${current.provider}/${current.model}`)
  const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`
  const triggerAria = waiting
    ? t('trigger.loading')
    : current === null
      ? t('trigger.selectAria')
      : effortLabel === undefined
        ? t('trigger.aria', { model: modelLabel })
        : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })

  itemRefs.current = new Map()
  const itemRef = (key: string) => (node: HTMLButtonElement | null) => {
    if (node === null) itemRefs.current.delete(key)
    else itemRefs.current.set(key, node)
  }
  const backRow = () => (
    <button ref={itemRef('back')} type="button" role="menuitem" className={css.cell} onClick={back}>
      <IconChevronLeftOutline14 className={css.cellChevron} />
      <span className={css.cellLabel}>{t('back')}</span>
    </button>
  )
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
        title={triggerLabel}
        disabled={locked}
        onClick={() => {
          if (open) close()
          else show()
        }}
      >
        <IconDataOutline16 className={css.triggerIcon} size={16} />
        <span className={css.triggerLabel}>{modelLabel}</span>
        {effortLabel !== undefined && <span className={css.triggerEffort}>{effortLabel}</span>}
        <IconChevronDownOutline14 className={cls(css.chevron, open && css.chevronOpen)} />
      </button>
      {open && createPortal((
        <div
          ref={menuRef}
          id={`${id}-menu`}
          className={css.menu}
          style={menuPos ?? MEASURE_STYLE}
          role="menu"
          aria-label={pane === 'models' && shownGroup !== undefined ? shownGroup.name : pane === 'effort' ? t('menu.effort') : t('menu.aria')}
          aria-busy={state.status === 'loading' || busy}
        >
          {pane === 'root' && (
            <Fragment>
              <button ref={itemRef('root:provider')} type="button" role="menuitem" className={css.cell} onClick={() => drill('providers')}>
                <span className={css.cellLabel}>{t('menu.provider')}</span>
                <span className={css.cellValue}>{currentGroup?.name ?? current?.provider ?? ''}</span>
                <IconChevronRightOutline14 className={css.cellChevron} />
              </button>
              {reasoning !== undefined && (
                <button ref={itemRef('root:effort')} type="button" role="menuitem" className={css.cell} onClick={() => drill('effort')}>
                  <span className={css.cellLabel}>{t('menu.effort')}</span>
                  <span className={css.cellValue}>{effortLabel}</span>
                  <IconChevronRightOutline14 className={css.cellChevron} />
                </button>
              )}
            </Fragment>
          )}
          {pane === 'providers' && (
            <Fragment>
              {state.status === 'loading' && <div className={css.status}>{t('status.loading')}</div>}
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className={css.error}>
                  <span>{t('error.action', { message: state.error })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('action.reload')}</button>
                </div>
              )}
              {state.failures.map((failure) => (
                <div className={css.warning} key={failure.id}>
                  <span>{t('warning.groupLoad', { name: failure.name, message: failure.message })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('action.reload')}</button>
                </div>
              ))}
              {state.status === 'ready' && groups.length === 0 && <div className={css.empty}>{t('empty.models')}</div>}
              <div className={cls(css.groups, 'scrollable')}>
                {groups.map((group) => {
                  const mine = current?.provider === group.id
                  return (
                    <button
                      key={group.id}
                      ref={itemRef(`provider:${group.id}`)}
                      type="button"
                      role="menuitem"
                      aria-current={mine ? 'true' : undefined}
                      className={css.cell}
                      title={group.name}
                      onClick={() => {
                        setProviderId(group.id)
                        drill('models')
                      }}
                    >
                      <span className={css.cellLabel}>{group.name}</span>
                      <span className={css.cellValue}>{mine ? currentModel?.name ?? current?.model ?? '' : t('provider.modelCount', { count: String(group.models.length) })}</span>
                      {mine && <span className={css.check}><IconCheckOutline16 /></span>}
                      <IconChevronRightOutline14 className={css.cellChevron} />
                    </button>
                  )
                })}
              </div>
            </Fragment>
          )}
          {pane === 'models' && shownGroup !== undefined && (
            <Fragment>
              {backRow()}
              <div className={cls(css.groups, 'scrollable')}>
                {shownGroup.models.map((model) => {
                  const selected = current?.provider === shownGroup.id && current.model === model.id
                  return (
                    <button
                      key={model.id}
                      ref={itemRef(`model:${shownGroup.id}/${model.id}`)}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      className={cls(css.option, selected && css.selected)}
                      title={model.name}
                      disabled={busy}
                      onClick={() => chooseModel(shownGroup.id, model)}
                    >
                      <span className={css.optionCopy}><span className={css.modelName}>{model.name}</span></span>
                      <span className={css.check}>{selected ? <IconCheckOutline16 /> : null}</span>
                    </button>
                  )
                })}
              </div>
            </Fragment>
          )}
          {pane === 'effort' && (
            <Fragment>
              {backRow()}
              {state.error !== null && lastActionRef.current === 'load' && (
                <div className={css.error}>
                  <span>{t('error.action', { message: state.error })}</span>
                  <button type="button" className={css.retry} onClick={reload}>{t('action.reload')}</button>
                </div>
              )}
              {effortChoices.length === 0
                ? <div className={css.empty}>{t('empty.efforts')}</div>
                : effortChoices.map((level) => (
                  <button
                    key={level.key}
                    ref={itemRef(`effort:${level.key}`)}
                    type="button"
                    role="menuitemradio"
                    aria-checked={effectiveEffort === level.effort}
                    className={cls(css.option, effectiveEffort === level.effort && css.selected)}
                    disabled={busy}
                    onClick={() => chooseEffort(level.effort)}
                  >
                    <span className={css.optionCopy}><span className={css.modelName}>{level.label}</span></span>
                    <span className={css.check}>{effectiveEffort === level.effort ? <IconCheckOutline16 /> : null}</span>
                  </button>
                ))}
            </Fragment>
          )}
        </div>
      ), document.body)}
      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutline16 />}
          anchor={rootRef.current?.closest('[data-composer-card]') ?? null}
          onDone={() => {
            setToast(null)
          }}
        />
      )}
    </div>
  )
}