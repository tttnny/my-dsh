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
import {
  ALL_TAB,
  flattenGroups,
  pickerTabs,
  reasoningOf,
  rowsForTab,
  searchRows,
  type CatalogModel,
  type ModelRow as CatalogRow,
} from './rows.ts'
import { Tag, isMobileDevice } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelFactsLookup } from './facts-source.ts'
import type { Selection } from './selection.ts'
import { planModelCommit } from './selection.ts'
import css from './ModelOptions.module.css'

/** Props the seat hands the picker. */
export interface ModelPickerProps {
  /** Whether the dialog is showing. */
  readonly open: boolean
  /** Resolve a catalog badge's localized text for the active language. */
  readonly resolveText: (text: NonNullable<CatalogModel['badge']>['text']) => string
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
  /**
   * The reasoning level this browser last used for one model, if any.
   * @param provider - the provider route key.
   * @param model - the model id inside that provider.
   * @returns the remembered level, or undefined when none is remembered.
   */
  readonly rememberedOf?: (provider: string, model: string) => string | undefined
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
  open, resolveText, state, live, facts, favorites, busy, rememberedOf, onPick, onToggleFavorite, onReload, onClose, t,
}: ModelPickerProps & PropsLocale<'modelSubmenu'>) {
  const id = useId()
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(ALL_TAB)

  const tabs = useMemo(() => pickerTabs(state.groups, t('picker.all')), [state.groups, t])
  const reason = useMemo(() => reasoningOf(state.groups), [state.groups])
  const rows = useMemo(() => orderWithFavorites(
    rowsForTab(flattenGroups(state.groups), tab),
    (row) => isFavorite(favorites, row.provider, row.model),
  ), [state.groups, tab, favorites])
  // Search runs inside the favorite partition, never across it: a query must not
  // pull an unstarred model above a starred one, because favorites lead the list
  // whether or not a query is typed.
  const visible = useMemo(() => orderWithFavorites(
    searchRows(rows, query, rankByName),
    (row) => isFavorite(favorites, row.provider, row.model),
  ), [rows, query, favorites])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setTab(ALL_TAB)
    if (listRef.current !== null) listRef.current.scrollTop = 0
    // 粗指针设备不自动聚焦文本输入：移动端弹键盘会顶起布局，宿主座位也这样守。
    const frame = requestAnimationFrame(() => {
      if (!isMobileDevice()) searchRef.current?.focus()
    })
    return () => { cancelAnimationFrame(frame) }
  }, [open])

  if (!open) return null

  const pick = (row: CatalogRow) => {
    const selection = planModelCommit(live, row.provider, row.model, reason, rememberedOf?.(row.provider, row.model))
    if (selection === null) {
      onClose()
      return
    }
    onPick(selection)
  }
  const failures = state.failures.filter((failure) => tab === ALL_TAB || failure.id === tab)
  const failed = state.error !== null && state.status === 'error'
  const loading = state.status === 'loading'
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
          placeholder={t('picker.search')}
          icon={<IconSearchOutlineRegular size={14} />}
          value={query}
          readOnly={busy}
          onChange={(event) => { setQuery(event.target.value) }}
          data-modal-autofocus=""
        />
      </div>
      <div className={css.pickerTabs} role="tablist" aria-label={t('picker.title')}>
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`${id}-tab-${entry.id}`}
            aria-selected={entry.id === tab}
            aria-controls={`${id}-list`}
            tabIndex={0}
            className={css.pickerTab}
            onClick={() => { setTab(entry.id) }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div ref={listRef} id={`${id}-list`} className={css.pickerList}>
        {loading && <div className={css.notice}>{t('status.loading')}</div>}
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
        {visible.length === 0 && !loading && !failed && (
          <div className={css.notice}>{state.groups.length === 0 ? t('status.empty') : t('picker.searchEmpty')}</div>
        )}
        {visible.map((row) => (
          <div key={`${row.provider}/${row.model}`}>
            <ModelRow
              name={row.entry.name}
              badge={row.entry.badge === undefined
                ? undefined
                : <Tag tone={row.entry.badge.tone} className={css.rowBadge}>{resolveText(row.entry.badge.text)}</Tag>}
              selected={live?.provider === row.provider && live.model === row.model}
              busy={busy}
              favorited={isFavorite(favorites, row.provider, row.model)}
              meta={metaLine({
                row,
                facts: facts(row.provider, row.model),
                providerName: tab === ALL_TAB ? row.providerName : undefined,
                thinks: row.entry.reasoning !== undefined,
                effortLabel: t('meta.effort'),
                imageLabel: t('meta.images'),
              })}
              starLabel={isFavorite(favorites, row.provider, row.model)
                ? t('picker.unfavorite', { model: row.entry.name })
                : t('picker.favorite', { model: row.entry.name })}
              onPick={() => { pick(row) }}
              onToggleFavorite={() => { onToggleFavorite(row.provider, row.model) }}
            />
          </div>
        ))}
      </div>
      <div className={css.pickerFooter}>
        <span className={css.footerHint}>
          <ShortcutKeys keys={['Esc']} />
          <span>{t('picker.hintClose')}</span>
        </span>
      </div>
    </Modal>
  )
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

