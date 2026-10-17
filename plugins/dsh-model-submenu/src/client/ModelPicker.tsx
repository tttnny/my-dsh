/**
 * The model picker: the centered dialog opened from the menu's last row.
 *
 * It is the one place every provider is visible at once — a search field, a tab
 * per provider with a model, and one flat list with each model's metadata line.
 * Favorites lead the list and can be toggled from a row's star without
 * selecting that row. A click commits at once; a rejected commit keeps the
 * dialog open so the user can retry or pick another model.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  IconSearchOutlineRegular,
  Input,
  Modal,
  ShortcutKeys,
  rankByName,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { ModelRow } from './ModelRow.tsx'
import { isFavorite, orderWithFavorites } from './favorites.ts'
import type { ModelFacts } from './model-facts.ts'
import { metaSegments } from './model-facts.ts'
import { pickerTabs, rowsForTab, type ModelRow as CatalogRow } from './rows.ts'
import type { ModelFactsLookup } from './facts-source.ts'
import type { Selection } from './selection.ts'
import { planModelCommit } from './selection.ts'
import css from './ModelSubmenu.module.css'

/** Props the seat hands the picker. */
export interface ModelPickerProps {
  /** Whether the dialog is showing. */
  readonly open: boolean
  /** The shared directory snapshot. */
  readonly state: ModelDirectoryState
  /** The selection in force, null before a first selection resolves. */
  readonly live: Selection | null
  /** The metadata lookup for the current settings answer. */
  readonly facts: ModelFactsLookup
  /** The favorite table right now. */
  readonly favorites: readonly { readonly provider: string; readonly model: string }[]
  /** Whether a selection is in flight. */
  readonly busy: boolean
  /** Submit one selection. */
  readonly onPick: (selection: Selection) => void
  /** Toggle one model's favorite. */
  readonly onToggleFavorite: (provider: string, model: string) => void
  /** Reload the catalog after a failure. */
  readonly onReload: () => void
  /** Close the dialog, optionally returning focus. */
  readonly onClose: () => void
}

/**
 * Render the picker.
 * @param props - the catalog, the live selection, and the picker's verbs.
 * @returns the dialog; nothing while closed.
 */
export function ModelPicker({
  open, state, live, facts, favorites, busy, onPick, onToggleFavorite, onReload, onClose, t,
}: ModelPickerProps & PropsLocale<'modelSubmenu'>) {
  const id = useId()
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('*')
  const [highlight, setHighlight] = useState(0)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())

  const tabs = useMemo(() => pickerTabs(state.groups, t('picker.all')), [state.groups, t])
  const rows = useMemo(() => orderWithFavorites(
    rowsForTab(state.groups.flatMap((group) => group.models.map((model) => ({
      provider: group.id,
      providerName: group.name,
      model: model.id,
      entry: model,
    }))), tab),
    (row) => isFavorite(favorites, row.provider, row.model),
  ), [state.groups, tab, favorites])
  const visible = useMemo(() => searchRowsWith(rows, query), [rows, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setTab('*')
    setHighlight(0)
    if (listRef.current !== null) listRef.current.scrollTop = 0
    const frame = requestAnimationFrame(() => { searchRef.current?.focus() })
    return () => { cancelAnimationFrame(frame) }
  }, [open])

  useEffect(() => {
    setHighlight((current) => visible.length === 0 ? 0 : Math.min(current, visible.length - 1))
  }, [visible.length])

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${highlight}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  if (!open) return null

  const activeRow = visible[highlight]
  const activeId = activeRow === undefined ? undefined : `${id}-row-${highlight}`
  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (visible.length === 0) return
      setHighlight((current) => {
        const next = current + (event.key === 'ArrowDown' ? 1 : -1)
        return (next + visible.length) % visible.length
      })
      return
    }
    if (event.key === 'Enter' && activeRow !== undefined && !busy) {
      event.preventDefault()
      pick(activeRow)
    }
  }
  const pick = (row: CatalogRow) => {
    const selection = planModelCommit(live, row.provider, row.model, null, (provider, model) => {
      const group = state.groups.find((candidate) => candidate.id === provider)
      return group?.models.find((candidate) => candidate.id === model)?.reasoning
    })
    if (selection === null) {
      onClose()
      return
    }
    onPick(selection)
  }
  const moveTab = (offset: 1 | -1) => {
    const index = tabs.findIndex((candidate) => candidate.id === tab)
    const next = tabs[(index + offset + tabs.length) % tabs.length]
    if (next === undefined) return
    setTab(next.id)
    tabRefs.current.get(next.id)?.focus()
  }
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, tabId: string) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      setTab(tabId)
      moveTab(event.key === 'ArrowRight' ? 1 : -1)
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const first = tabs[event.key === 'Home' ? 0 : tabs.length - 1]
      if (first !== undefined) {
        setTab(first.id)
        tabRefs.current.get(first.id)?.focus()
      }
    }
  }

  const failures = state.failures.filter((failure) => tab === '*' || failure.id === tab)
  const failed = state.error !== null && state.status === 'error'
  const showStatus = failed || state.status === 'loading'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('picker.title')}
      closeLabel={t('picker.close')}
      className={css.pickerDialog ?? ''}
      contentClassName={css.pickerContent ?? ''}
    >
      <div className={css.pickerSearch}>
        <Input
          ref={searchRef}
          className={css.pickerSearchInput ?? ''}
          type="text"
          role="searchbox"
          aria-label={t('picker.search')}
          aria-controls={`${id}-list`}
          aria-activedescendant={activeId}
          placeholder={t('picker.search')}
          icon={<IconSearchOutlineRegular size={14} />}
          value={query}
          readOnly={busy}
          onChange={(event) => { setQuery(event.target.value) }}
          onKeyDown={onSearchKeyDown}
          data-modal-autofocus=""
        />
      </div>
      <div className={css.pickerTabs} role="tablist" aria-label={t('picker.title')}>
        {tabs.map((entry) => (
          <button
            key={entry.id}
            ref={(node) => {
              if (node === null) tabRefs.current.delete(entry.id)
              else tabRefs.current.set(entry.id, node)
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${entry.id}`}
            aria-selected={entry.id === tab}
            aria-controls={`${id}-list`}
            tabIndex={0}
            className={css.pickerTab}
            onClick={() => {
              setTab(entry.id)
              setHighlight(0)
            }}
            onKeyDown={(event) => { onTabKeyDown(event, entry.id) }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div
        ref={listRef}
        id={`${id}-list`}
        className={css.pickerList}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${tab}`}
      >
        {showStatus && state.status === 'loading' && <div className={css.notice}>{t('status.loading')}</div>}
        {failed && (
          <div className={css.notice}>
            <span>{t('status.failed', { message: state.error ?? '' })}</span>
            <button type="button" className={css.retry} onClick={onReload}>{t('action.reload')}</button>
          </div>
        )}
        {failures.map((failure) => (
          <div className={css.notice} key={failure.id}>
            <span>{t('status.providerFailed', { name: failure.name, message: failure.message })}</span>
            <button type="button" className={css.retry} onClick={onReload}>{t('action.reload')}</button>
          </div>
        ))}
        {visible.length === 0 && !showStatus && (
          <div className={css.notice}>{state.groups.length === 0 ? t('status.empty') : t('picker.searchEmpty')}</div>
        )}
        {visible.map((row, index) => (
          <div key={`${row.provider}/${row.model}`} data-row-index={index} id={`${id}-row-${index}`}>
            <ModelRow
              name={row.entry.name}
              selected={live?.provider === row.provider && live.model === row.model}
              busy={busy}
              star="interactive"
              favorited={isFavorite(favorites, row.provider, row.model)}
              meta={metaLine({
                row,
                facts: facts(row.provider, row.model),
                providerName: tab === '*' ? row.providerName : undefined,
                thinks: row.entry.reasoning !== undefined,
                effortLabel: t('meta.effort'),
                imageLabel: t('meta.images'),
              })}
              starLabel={isFavorite(favorites, row.provider, row.model)
                ? t('picker.unfavorite', { model: row.entry.name })
                : t('picker.favorite', { model: row.entry.name })}
              starTabStop={index === highlight}
              rowTabIndex={-1}
              onPick={() => { pick(row) }}
              onFocusRow={() => { setHighlight(index) }}
              onToggleFavorite={() => { onToggleFavorite(row.provider, row.model) }}
            />
          </div>
        ))}
      </div>
      <div className={css.pickerFooter}>
        <span className={css.footerHint}>
          <ShortcutKeys keys={['↑', '↓']} />
          <span>{t('picker.hintNavigate')}</span>
          <span className={css.footerDot}>·</span>
          <ShortcutKeys keys={['Enter']} />
          <span>{t('picker.hintSelect')}</span>
          <span className={css.footerDot}>·</span>
          <ShortcutKeys keys={['Esc']} />
          <span>{t('picker.hintClose')}</span>
        </span>
      </div>
    </Modal>
  )
}

function searchRowsWith(rows: readonly CatalogRow[], query: string): readonly CatalogRow[] {
  const trimmed = query.trim()
  if (trimmed === '') return rows
  const ranked = rankByName(rows.map((row) => ({
    name: row.entry.name,
    label: row.providerName,
    row,
  })), trimmed)
  return ranked.map((match) => match.row)
}

function metaLine(input: {
  readonly row: CatalogRow
  readonly facts: ModelFacts
  readonly providerName: string | undefined
  readonly thinks: boolean
  readonly effortLabel: string
  readonly imageLabel: string
}): string {
  return metaSegments({
    ...input.providerName === undefined ? {} : { providerName: input.providerName },
    facts: input.facts,
    thinks: input.thinks,
    effortLabel: input.effortLabel,
    imageLabel: input.imageLabel,
  }).join(' · ')
}

