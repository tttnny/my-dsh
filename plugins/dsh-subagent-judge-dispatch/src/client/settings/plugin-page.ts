/**
 * This plugin's configuration card and where it lives: the DSH **Plugins** page,
 * registered into `plugins.bundle.config` under the bundle's package name.
 *
 * The key is the package name; the settings the card reads and writes live in a
 * DIFFERENT literal — the Loader row id, which is also this plugin's settings
 * namespace. Writing one where the other belongs makes the card silently never
 * appear, so both are spelled once, here and in `src/index.ts`.
 */

// Type-only: brings the owner's `plugins.bundle.config` SlotMap contract into
// this program. Erased from the bundle, so the browser half never depends on the
// plugin manager at runtime.
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';

/** npm package name of this plugin's bundle — the whole `plugins.bundle.config` key. */
const BUNDLE_NAME = '@lynn123411/dsh-subagent-judge-dispatch';

/** The Plugins page slot a bundle's own configuration registers into. */
export const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config';

/** This plugin's own config key: the bundle's package name. */
export const BUNDLE_CONFIG_KEY = BUNDLE_NAME;

/** Services this registration needs from the browser runtime. */
interface PluginPageSlots {
  inject(name: string, callback: () => unknown): () => void;
}

/**
 * Contribute this plugin's configuration card to the Plugins page.
 * @param slots - the client slot registry.
 * @param register - registers the card component; returns its disposer.
 * @returns A disposer releasing the contribution, or a no-op when the browser
 * runtime hands no slot registry at all.
 */
export function setupPluginPage(
  slots: PluginPageSlots | null | undefined,
  register: () => () => void,
): () => void {
  if (!slots || typeof slots.inject !== 'function') return () => {};
  return slots.inject(BUNDLE_CONFIG_SLOT, register);
}
