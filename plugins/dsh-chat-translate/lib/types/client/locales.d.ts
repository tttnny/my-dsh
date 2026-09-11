/** Locale bundles for the chat-translate card inside the shared 「阅读体验」 page. */
/** Dictionary namespace owned by this plugin's settings card. */
export declare const NS = "settings.chatTranslate";
/** Locale keys this plugin renders. */
export type ChatTranslateLocaleKey = 'pageNav';
/** English copy. */
export declare const en: Record<ChatTranslateLocaleKey, string>;
/** Chinese copy. */
export declare const zh: Record<ChatTranslateLocaleKey, string>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.chatTranslate': ChatTranslateLocaleKey;
    }
}
