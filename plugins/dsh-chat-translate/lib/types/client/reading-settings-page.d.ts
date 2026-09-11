/**
 * The shared 「阅读体验」 settings page.
 *
 * Several plugins contribute their configuration to ONE settings page, but the
 * kernel cannot declare that page jointly: `settings.section` is a list slot
 * that rejects a duplicate `id` at the same priority ("already has an entry
 * with id"), and a child slot may be declared exactly once ("slot … is already
 * declared"). Composing several cards into one page therefore takes one
 * declarer, so every participating plugin carries this same shell and the
 * FIRST one to activate claims the page; the others register their card into
 * {@link READING_ITEM_SLOT} and wait for the winner's declaration through
 * `slots.inject`. Uninstalling the winner promotes another participant on the
 * next boot, so no participant is a fixed owner.
 *
 * The page renders ONE TAB PER REGISTERED CARD: the tab roster comes from the
 * child slot's own registrations (id + `label` + `order`, the same shape the
 * kernel's own Plugins page uses for its tabs), and each panel dispatches
 * through `renderSlot(READING_ITEM_SLOT, {}, { only: id })`. Every panel stays
 * mounted but hidden, so a card's local state survives a tab switch.
 *
 * Keep this file identical across the participating plugins
 * (`dsh-smooth-stream`, `dsh-oil-sticky-prompt`, `dsh-chat-translate`).
 * Participants own their own card component, locale dictionaries, settings
 * namespace and Host half — only the page shell below is shared, because
 * cross-plugin value imports are forbidden by the client bundle purity gate.
 * It imports nothing but `react` plus type-only DSH packages on purpose, so
 * every participant's build configuration compiles it unchanged.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { InjectFace, LocaleNamespaceMap, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Page id claimed by the first participating plugin to activate. */
export declare const READING_PAGE_ID = "reading";
/** Sidebar position of the shared page; own plugins start at 110. */
export declare const READING_PAGE_ORDER = 110;
/** The page's one child slot: every participant's card registers here. */
export declare const READING_ITEM_SLOT = "reading.settings.item";
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /** One participating plugin's card inside the shared reading page. */
        'reading.settings.item': {
            kind: 'list';
            scope: 'root';
        };
    }
}
/** One participant's tab, derived from its card registration. */
export interface ReadingTab {
    /** Registration id — the participant's Host settings namespace. */
    id: string;
    /** Registration order, ascending in the tab bar. */
    order: number;
    /** Registration label, already resolved for the active locale. */
    label: string;
}
/** Live tab roster handed to the page component through its inject face. */
export interface ReadingTabsFace {
    getSnapshot(): readonly ReadingTab[];
    subscribe(listener: () => void): () => void;
}
/** Inject face of the shared page. */
export interface ReadingPageFace {
    readingTabs: ReadingTabsFace;
}
type ReadingPageProps = PropsRuntime<'settings.section'> & PropsRenderSlots<typeof READING_ITEM_SLOT> & InjectFace<ReadingPageFace>;
/**
 * Page body: one tab per registered card, plus the selected card's panel.
 * The shell supplies the section's own seats and `renderSlot` bound to the
 * child slot declared at registration time.
 */
export declare function ReadingSettingsSection({ renderSlot, readingTabs }: ReadingPageProps): import("react").DetailedReactHTMLElement<import("react").HTMLAttributes<HTMLElement>, HTMLElement> | null;
/** Whether a participant already holds the shared page. */
export declare function readingPageClaimed(ctx: ClientContext): boolean;
/**
 * Claim the shared page when no participant holds it yet. Call inside
 * `ctx.slots.inject('settings.section', …)`: injection order decides the
 * winner, and the losers stay silent instead of colliding with the kernel's
 * duplicate-id and duplicate-declaration guards.
 * @param ctx - browser context carrying the slot registry.
 * @param label - page label, re-read by the shell on every projection.
 * @param locale - locale namespace the label thunk translates through.
 * @returns The page registration's disposer, or a no-op when another
 * participant already holds the page.
 */
export declare function claimReadingSettingsPage(ctx: ClientContext, label: () => string, locale: keyof LocaleNamespaceMap & string): () => void;
export {};
