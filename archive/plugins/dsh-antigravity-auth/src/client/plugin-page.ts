/**
 * This bundle's configuration page and where it lives: the DSH **Plugins** page,
 * not the Settings page.
 *
 * The Plugins page is the host's own home for per-plugin configuration. It
 * declares `plugins.bundle.config`, keyed by a bundle's package name, and
 * renders that entry as a `view: 'page'` form ON the bundle's own page — under
 * its description, above its rows. Registering the key is what puts the form
 * there: the reader reaches it without opening a row first, and the page draws
 * the icon, the title and the crumb itself. The Settings page keeps only
 * read-only plugin lists.
 *
 * The key is the BUNDLE's package name. The host page lists this bundle's own row
 * under the form — the one row whose specifier is the bare package name, and
 * therefore the only one that carries a browser half (a subpath row like
 * `@lynn123411/dsh-antigravity-auth/search` names no `dsh.client` of its own). It
 * is NOT the Host settings namespace: the master form is addressed by the
 * `antigravity-auth` entry id, and the three capability rows
 * (`antigravity-search`, `antigravity-image`, `antigravity-video`) are other
 * entries of the same bundle whose configuration lives in this card.
 *
 * Registration is deliberately dynamic: the slot only exists while the host's
 * plugin-manager entry is mounted, so `slots.inject` runs the registration when
 * (and only when) that page is there — a deployment without it leaves no trace.
 */
// Type-only: brings the owner's `plugins.bundle.config` SlotMap contract into
// this program. Erased from the bundle, so the browser half never depends on
// the plugin manager at runtime.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'

/** npm package name of this bundle — the whole `plugins.bundle.config` key. */
const BUNDLE_NAME = '@lynn123411/dsh-antigravity-auth'

/** The Plugins page slot a bundle's own configuration registers into. */
export const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config'

/** This bundle's own config key: the bundle's package name. */
export const BUNDLE_CONFIG_KEY = BUNDLE_NAME

/** Services this registration needs from the browser runtime. */
interface PluginPageSlots {
  inject(name: string, callback: () => unknown): () => void
}

/**
 * Contribute this bundle's configuration page to the Plugins page.
 * @param slots - the client slot registry.
 * @param register - registers the page component; returns its disposer.
 * @returns A disposer releasing the contribution, or a no-op when the browser
 * runtime hands no slot registry at all (the bundle's other seats stay mounted
 * either way). A throwing `inject` is a real contract violation and propagates.
 */
export function setupPluginPage(
  slots: PluginPageSlots | null | undefined,
  register: () => () => void
): () => void {
  if (!slots || typeof slots.inject !== 'function') return () => {}
  return slots.inject(BUNDLE_CONFIG_SLOT, register)
}
