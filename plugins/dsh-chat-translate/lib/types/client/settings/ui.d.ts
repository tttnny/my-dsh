import * as React from 'react';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/**
 * Chat-translate's card inside the shared 「阅读体验」 settings page. The card
 * keeps its own chrome (title rows, switches, credential form); the shared page
 * only stacks the participants' cards.
 * @param _props - renderer-bound seat of the `reading.settings.item` slot.
 * @returns The card element.
 */
export declare function TidySettingsPanel(_props: PropsRuntime<'reading.settings.item'>): React.ReactElement;
/**
 * Bind the settings store to DSH's native settings/credentials services and
 * join the shared 「阅读体验」 settings page: whichever participant activates
 * first claims the page, everyone registers a card into its child slot.
 * @param ctx - DSH browser client context; services are resolved defensively.
 */
export declare function setupSettingsUi(ctx: any): void;
