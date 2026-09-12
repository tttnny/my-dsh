/** Browser half of the private Antigravity bootstrap capability bundle. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type AntigravityAuthKey } from './locales.ts';
export { AntigravityAuthSettings } from './AntigravityAuthSettings.tsx';
export type { AntigravityAuthSettingsProps } from './AntigravityAuthSettings.tsx';
export { en, zh } from './locales.ts';
export type { AntigravityAuthKey } from './locales.ts';
/** Client services required by the settings section and its loopback RPC. */
export declare const inject: string[];
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Copy for the Antigravity bootstrap settings section. */
        'settings.antigravityAuth': AntigravityAuthKey;
    }
}
/** Register one disposable settings section and no capability controls. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map