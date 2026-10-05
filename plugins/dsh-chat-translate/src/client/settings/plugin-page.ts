/**
 * This plugin's configuration page and where it lives: the DSH **Plugins** page,
 * not the Settings page.
 *
 * The Plugins page is the host's own home for per-plugin configuration. It
 * declares `plugins.row.config` (keyed `<bundle package name>#<row id>`); a row
 * whose key is registered gains a 配置 control, and opening it renders the entry
 * as a page of its own with the page drawing the icon, the title and the crumb.
 * The Settings page keeps only read-only plugin lists.
 *
 * The row id this plugin's bundle patch declares is also its Host settings
 * namespace. That equality is what lets the page hand the entry an owner `form`;
 * it is spelled once here and asserted by the wiring test against the Host half.
 *
 * Registration is deliberately dynamic: the slot only exists while the host's
 * plugin-manager entry is mounted, so `slots.inject` runs the registration when
 * (and only when) that page is there — a deployment without it leaves no trace.
 */
// Type-only: brings the owner's `plugins.row.config` SlotMap contract into this
// program. Erased from the bundle, so the browser half never depends on the
// plugin manager at runtime.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'

/** npm package name of this plugin's bundle — the first half of the row key. */
const BUNDLE_NAME = '@lynn123411/dsh-chat-translate'

/** The row id this plugin's bundle patch declares; also its settings namespace. */
const ROW_ID = 'dsh-chat-translate'

/** The Plugins page slot one row's configuration registers into. */
export const ROW_CONFIG_SLOT = 'plugins.row.config'

/**
 * The slot key naming one row of one bundle.
 * @param bundle - the bundle's npm package name.
 * @param rowId - the row id the bundle's patch declares.
 * @returns the `plugins.row.config` key.
 */
function rowConfigKey(bundle: string, rowId: string): string {
  return `${bundle}#${rowId}`
}

/** This plugin's own row key. */
export const ROW_CONFIG_KEY = rowConfigKey(BUNDLE_NAME, ROW_ID)

/** Services this registration needs from the browser runtime. */
interface PluginPageSlots {
  inject(name: string, callback: () => unknown): () => void
}

/**
 * Contribute this plugin's configuration page to the Plugins page.
 * @param slots - the client slot registry.
 * @param register - registers the page component; returns its disposer.
 * @returns A disposer releasing the contribution, or a no-op when the browser
 * runtime hands no slot registry at all (the plugin's other seats stay mounted
 * either way). A throwing `inject` is a real contract violation and propagates.
 */
export function setupPluginPage(
  slots: PluginPageSlots | null | undefined,
  register: () => () => void
): () => void {
  if (!slots || typeof slots.inject !== 'function') return () => {}
  return slots.inject(ROW_CONFIG_SLOT, register)
}

