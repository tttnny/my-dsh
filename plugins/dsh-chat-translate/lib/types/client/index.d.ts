/** Client plugin name, shared with the browser bundle id. */
export declare const name = "dsh-chat-translate";
/**
 * Declared services: slots for the shared 「阅读体验」 settings page (page claim
 * plus the card registration), settingsScope for the per-namespace settings
 * mirror, and the remote + remote.credentials pair for the credentials Remote
 * namespace — the runtime withholds any service not declared here, so
 * `ctx.remote.credentials` would be undefined otherwise. The locale service is
 * optional and read through `ctx.get`, like the renderer's slots registry.
 */
export declare const inject: string[];
interface ClientContext {
    effect(factory: () => void | (() => void), label: string): void;
    get?(serviceName: string): any;
    slots?: any;
    settingsScope?: any;
    locale?: any;
    remote?: {
        credentials?: any;
    };
}
/**
 * Mount the tool-call / think-summary translation observer and the settings UI
 * card inside the shared reading-settings page.
 * @param ctx - DSH browser client context.
 */
export declare function apply(ctx: ClientContext): void;
export { chatTranslateObserver } from './translate/observer.ts';
export { setupSettingsUi } from './settings/ui.tsx';
export { NonDestructiveTranslationMount } from './translate/mount.ts';
export { StreamDebounceViewportObserver } from './translate/viewport-observer.ts';
export { clientCache } from './translate/client-cache.ts';
export { lazyQueue } from './translate/lazy.ts';
export { settingsStore } from './settings/store.ts';
