/**
 * Owner of the sticky-prompt DOM behaviour, driven by the `enabled` preference.
 *
 * The installer already returns a disposer, so a toggle is a plain
 * install/dispose pair with no partial teardown. Routing both activation paths
 * (startup default, settings-driven flips) through one owner keeps a single
 * writer, so at most one installation — one listener set, one timer map, one
 * injected host per scroller — can exist at a time.
 */

import { installStickyUserRows } from './installSticky.ts'

/** Installs the DOM behaviour and returns the disposer that removes it. */
export type StickyInstaller = () => () => void

/** Preference-driven lifecycle of the sticky-prompt installation. */
export class StickyPromptRuntime {
  private readonly install: StickyInstaller
  private release: (() => void) | undefined

  /**
   * @param install - installer producing its own disposer. Injectable so the
   * toggle logic stays testable without a DOM; the production caller passes
   * {@link installStickyUserRows}.
   */
  constructor(install: StickyInstaller = installStickyUserRows) {
    this.install = install
  }

  /**
   * Apply a preference value: installs on the off→on edge, disposes the
   * listeners, timers, and injected DOM on the on→off edge, and does nothing
   * when the requested value already holds — so a redundant scope notification
   * never restarts the behaviour and drops the currently pinned row.
   * @param enabled - the value the user's section resolves to.
   */
  setEnabled(enabled: boolean): void {
    if (enabled === (this.release !== undefined)) return
    if (!enabled) {
      this.release?.()
      this.release = undefined
      return
    }
    this.release = this.install()
  }

  /** Release the installation whatever the preference says (plugin or service teardown). */
  dispose(): void {
    this.release?.()
    this.release = undefined
  }
}
