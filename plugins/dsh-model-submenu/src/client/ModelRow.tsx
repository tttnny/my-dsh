/**
 * One pickable model in the picker.
 *
 * The star is its own control, because favouriting there must not switch the
 * model: the row button picks, the star toggles, and the check marks the model
 * in use.
 */

import type { ReactNode } from 'react';
import { IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { StarIcon } from './icons.tsx';
import css from './ModelOptions.module.css';

/** Props of one row. */
export interface ModelRowProps {
  /** The model's catalog name. */
  readonly name: string;
  /** Optional catalog badge shown beside the name. */
  readonly badge?: ReactNode | undefined;
  /** Whether this row is the model in use. */
  readonly selected: boolean;
  /** Whether a selection is in flight, which locks the row. */
  readonly busy: boolean;
  /** Whether the model is favorited right now. */
  readonly favorited: boolean;
  /** The metadata line's text. */
  readonly meta?: string | undefined;
  /** Localized accessible name for the star control. */
  readonly starLabel?: string | undefined;
  /** Whether the star is a Tab stop right now (the picker's roving highlight). */
  readonly starTabStop?: boolean;
  /** Tab order of the row itself; the picker keeps rows out of it so ↑/↓ own the walk. */
  readonly rowTabIndex?: number;
  /** Pick this row. */
  readonly onPick: () => void;
  /** The row took the keyboard, so its star becomes reachable. */
  readonly onFocusRow?: (() => void) | undefined;
  /** Toggle this row's favorite. */
  readonly onToggleFavorite: () => void;
  /** Extra row content, such as the picker's disabled reason. */
  readonly children?: ReactNode;
}

/**
 * Render one model row.
 * @param props - the row's content and behaviour.
 * @returns the row element.
 */
export function ModelRow({
  name, badge, selected, busy, favorited, meta, starLabel,
  starTabStop = false, rowTabIndex, onPick, onFocusRow, onToggleFavorite, children,
}: ModelRowProps) {
  return <div
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
        {badge}
        {meta !== undefined && meta !== '' && <span className={css.rowMeta}>{meta}</span>}
      </span>
    </button>
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
    <span className={css.check} aria-hidden={!selected}>{selected ? <IconCheckOutlineRegular /> : null}</span>
    {children}
  </div>;
}
