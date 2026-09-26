import { chatTranslateObserver } from './translate/observer.ts';
import { setupSettingsUi } from './settings/ui.tsx';
// Type-only, erased from the bundle: the renderer augments Context with the
// `slots` service the shared 「阅读体验」 page shell consumes, and the settings
// contract declares the `settings.section` slot its page component renders into.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

/** Client plugin name, shared with the browser bundle id. */
export const name = 'dsh-chat-translate';

/**
 * Declared services: slots for the shared 「阅读体验」 settings page (page claim
 * plus the card registration), configForms for this plugin's own configuration
 * form (`ctx.configForms.get(<profile entry id>)` is the read/write face the
 * card rides), the remote + remote.credentials pair for the credentials Remote
 * namespace, and locale for the card's own dictionary. The runtime withholds
 * any service not declared here; `locale` is declared rather than sampled
 * because `ctx.get('locale')` at apply time can beat the locale plugin's
 * `provide`, which silently left the card's dictionary unregistered.
 */
export const inject = ['slots', 'configForms', 'remote', 'remote.credentials', 'locale'];

interface ClientContext {
  effect(factory: () => void | (() => void), label?: string): void;
  get?(serviceName: string): any;
  slots?: any;
  configForms?: any;
  locale?: any;
  remote?: { credentials?: any };
}

/**
 * Mount the tool-call / think-chain translation observer and the settings UI
 * card inside the shared reading-settings page.
 * @param ctx - DSH browser client context.
 */
export function apply(ctx: ClientContext): void {
  // 1. Mount tool title / think summary translation observer (current session only)
  ctx.effect(() => chatTranslateObserver.start(document), 'dsh-chat-translate: title translate observer');

  // 2. Join the shared 「阅读体验」 settings page (claim it, or register a card into it)
  ctx.effect(() => setupSettingsUi(ctx), 'dsh-chat-translate: settings section');
}

export { chatTranslateObserver } from './translate/observer.ts';
export { setupSettingsUi } from './settings/ui.tsx';
export { NonDestructiveTranslationMount } from './translate/mount.ts';
export { StreamDebounceViewportObserver } from './translate/viewport-observer.ts';
export { clientCache } from './translate/client-cache.ts';
export { lazyQueue } from './translate/lazy.ts';
export { settingsStore } from './settings/store.ts';
