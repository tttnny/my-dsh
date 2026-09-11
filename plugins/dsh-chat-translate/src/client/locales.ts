/** Locale bundles for the chat-translate card inside the shared 「阅读体验」 page. */

/** Dictionary namespace owned by this plugin's settings card. */
export const NS = 'settings.chatTranslate';

/** Locale keys this plugin renders. */
export type ChatTranslateLocaleKey = 'pageNav';

/** English copy. */
export const en: Record<ChatTranslateLocaleKey, string> = {
  pageNav: 'Reading',
};

/** Chinese copy. */
export const zh: Record<ChatTranslateLocaleKey, string> = {
  pageNav: '阅读体验',
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.chatTranslate': ChatTranslateLocaleKey;
  }
}
