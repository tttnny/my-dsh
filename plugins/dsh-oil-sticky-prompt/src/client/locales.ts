/** Locale bundles for the sticky-prompt card inside the shared 「阅读体验」 settings page. */

/** Dictionary namespace owned by this plugin's settings card. */
export const NS = 'settings.oilStickyPrompt'

/** Locale keys the card renders. */
export type StickyPromptLocaleKey =
  | 'title' | 'description' | 'pageNav'
  | 'enabled' | 'enabledHint'
  | 'loading' | 'readOnly' | 'unavailable' | 'writeFailed'

/** English copy. */
export const en: Record<StickyPromptLocaleKey, string> = {
  title: 'Sticky prompt',
  description: 'Pin the latest user message to the top of the conversation so the current question stays in view.',
  pageNav: 'Reading',
  enabled: 'Enable the sticky prompt',
  enabledHint: 'Turn off to stop injecting the sticky bar; turning it back on restores it immediately.',
  loading: 'Loading plugin settings…',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'Plugin settings are unavailable in this connection.',
  writeFailed: 'The deployment did not accept this change; the effective value is unchanged.',
}

/** Simplified Chinese copy. */
export const zh: Record<StickyPromptLocaleKey, string> = {
  title: '吸顶提示',
  description: '把最近的用户消息固定在对话流顶部，长上下文回看时不丢失当前问题。',
  pageNav: '阅读体验',
  enabled: '启用吸顶提示',
  enabledHint: '关闭后不再注入吸顶条；重新开启立即恢复。',
  loading: '正在加载插件设置…',
  readOnly: '本部署的设置为只读。',
  unavailable: '当前连接无法访问插件设置。',
  writeFailed: '本部署没有接受这次修改，当前生效值未改变。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.oilStickyPrompt': StickyPromptLocaleKey
  }
}
