/**
 * One pickable model, as both surfaces render it.
 *
 * The menu row is a radio: the name, an optional favorite mark that follows the
 * row's own click, and the check for the model in use. The picker row adds the
 * metadata line and turns the star into its own control, because favouriting
 * there must not switch the model.
 */

import type { ReactNode } from 'react'
import { IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { StarIcon } from './icons.tsx'
import css from './ModelSubmenu.module.css'

/** How one row shows its favorite mark. */
export type StarMode = 'static' | 'interactive' | 'none'

/** Props shared by both row shapes. */
export interface ModelRowProps {
  /** The model's catalog name. */
  readonly name: string
  /** Whether this row is the model in use. */
  readonly selected: boolean
  /** Whether a selection is in flight, which locks the row. */
  readonly busy: boolean
  /** How the favorite mark behaves on this row. */
  readonly star: StarMode
  /** Whether the model is favorited right now. */
  readonly favorited: boolean
  /** The metadata line's text; undefined in the menu. */
  readonly meta?: string | undefined
  /** Localized accessible name for the star control. */
  readonly starLabel?: string | undefined
  /** Whether the star is a Tab stop right now (the picker's roving highlight). */
  readonly starTabStop?: boolean
  /** Tab order of the row itself; the picker keeps rows out of it so ↑/↓ own the walk. */
  readonly rowTabIndex?: number
  /** Pick this row. */
  readonly onPick: () => void
  /** The row took the keyboard, so its star becomes reachable. */
  readonly onFocusRow?: (() => void) | undefined
  /** Toggle this row's favorite; absent when the star is static. */
  readonly onToggleFavorite?: (() => void) | undefined
  /** Extra row content, such as the picker's disabled reason. */
  readonly children?: ReactNode
}

/**
 * Render one model row.
 * @param props - the row's content and behaviour.
 * @returns the row element.
 */
export function ModelRow({
  name, selected, busy, star, favorited, meta, starLabel,
  starTabStop = false, rowTabIndex, onPick, onFocusRow, onToggleFavorite, children,
}: ModelRowProps) {
  return (
    <div
      className={css.row}
      data-selected={selected ? '' : undefined}
      data-favorited={favorited ? '' : undefined}
    >
      <button
        type="button"
        role="menuitemradio"
        aria-checked={selected}
        tabIndex={rowTabIndex}
        className={css.rowPick}
        title={name}
        disabled={busy}
        onClick={onPick}
        onFocus={onFocusRow}
      >
        <span className={css.rowCopy}>
          <span className={css.rowName}>{name}</span>
          {meta !== undefined && meta !== '' && <span className={css.rowMeta}>{meta}</span>}
        </span>
      </button>
      {star === 'interactive' && onToggleFavorite !== undefined && (
        <button
          type="button"
          className={css.starButton}
          aria-pressed={favorited}
          aria-label={starLabel}
          tabIndex={starTabStop ? 0 : -1}
          disabled={busy}
          onClick={onToggleFavorite}
        >
          <StarIcon filled={favorited} className={css.star} />
        </button>
      )}
      {star === 'static' && favorited && (
        <span className={css.starStatic} aria-hidden="true"><StarIcon filled className={css.star} /></span>
      )}
      <span className={css.check} aria-hidden={!selected}>{selected ? <IconCheckOutlineRegular /> : null}</span>
      {children}
    </div>
  )
}
