/**
 * The extra row in the composer model menu: opens the all-provider picker.
 *
 * The Host's own menu already lists the current provider's models and the
 * reasoning levels, so this plugin no longer replaces that seat. It contributes
 * one row here and keeps the dialog in the composer overlay, because the Host
 * unmounts this menu as soon as the row is clicked.
 */
import {
  IconChevronRightOutlineRegular,
  IconFlatListOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { PickerStore } from './picker-state.ts';
import css from './ModelOptions.module.css';

/** Props of the row: menu state, the owning session, and the picker store. */
export type ModelOptionsRowProps = PropsRuntime<'conversation.input.model.options'>
  & PropsLocale<'modelSubmenu'>
  & {
    /** Session whose catalog the picker will show. */
    readonly sessionId: string;
    /** Carries the open request to the overlay view. */
    readonly picker: PickerStore;
  }

/**
 * Render the row.
 * @param props - menu state, session, and the picker store.
 * @returns one menu item that opens the dialog.
 */
export function ModelOptionsRow({ locked, dismiss, sessionId, picker, t }: ModelOptionsRowProps) {
  return <button
    type="button"
    role="menuitem"
    className={css.optionsRow}
    disabled={locked}
    onClick={() => {
      // The menu is about to unmount, so the request has to leave this component
      // before the click handler returns.
      dismiss();
      picker.open(sessionId);
    }}
  >
    <IconFlatListOutlineRegular className={css.optionsIcon} size={16} />
    <span className={css.optionsLabel}>{t('options.row')}</span>
    <IconChevronRightOutlineRegular className={css.optionsChevron} />
  </button>;
}
