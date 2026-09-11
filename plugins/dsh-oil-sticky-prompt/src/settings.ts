/**
 * User-owned settings for the sticky-prompt plugin.
 *
 * The Host registers the namespace in the durable settings document and the
 * browser binds the same namespace through the native `settingsScope` service,
 * so both halves share this one contract module. Deliberately outside
 * `client/`: the Host half imports it too, and the client half must not own a
 * path the Host bundle would have to reach through.
 */

/**
 * Settings namespace registered by the Host and bound in the browser. It is
 * also the `id` this plugin's card registers under in the shared 「阅读体验」
 * page's item slot, and it must stay a lowercase hyphenated identifier (the
 * kernel validates it at registration).
 */
export const STICKY_PROMPT_SETTINGS_NS = 'lynn-sticky-prompt'

/** Preferences a user may set. */
export interface StickyPromptSettings {
  /**
   * Whether the sticky prompt is injected into the conversation flow. Off
   * removes the bar and every listener the plugin installed; on installs them
   * again in place.
   */
  enabled: boolean
}

/** Defaults shared by the Host schema and the browser-side fallback. */
export const DEFAULT_STICKY_PROMPT_SETTINGS: StickyPromptSettings = {
  enabled: true,
}
