/**
 * The shared 「阅读体验」 settings page.
 *
 * Several plugins contribute their configuration to ONE settings page, but the
 * kernel cannot declare that page jointly: `settings.section` is a list slot
 * that rejects a duplicate `id` at the same priority ("already has an entry
 * with id"), and a child slot may be declared exactly once ("slot … is already
 * declared"). Composing three cards into one page therefore takes one
 * declarer, so every participating plugin carries this same shell and the
 * FIRST one to activate claims the page; the others register their card into
 * {@link READING_ITEM_SLOT} and wait for the winner's declaration through
 * `slots.inject`. Uninstalling the winner promotes another participant on the
 * next boot, so no participant is a fixed owner.
 *
 * Keep this file identical across the participating plugins
 * (`dsh-smooth-stream`, `dsh-oil-sticky-prompt`, `dsh-chat-translate`).
 * Participants own their own card component, locale dictionaries, settings
 * namespace and Host half — only the page shell below is shared, because
 * cross-plugin value imports are forbidden by the client bundle purity gate.
 */

import { createElement } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { LocaleNamespaceMap, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Page id claimed by the first participating plugin to activate. */
export const READING_PAGE_ID = 'reading'
/** Sidebar position of the shared page; own plugins start at 110. */
export const READING_PAGE_ORDER = 110
/** The page's one child slot: every participant's card registers here. */
export const READING_ITEM_SLOT = 'reading.settings.item'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** One participating plugin's card inside the shared reading page. */
    'reading.settings.item': { kind: 'list'; scope: 'root' }
  }
}

type ReadingPageProps = PropsRuntime<'settings.section'> & PropsRenderSlots<typeof READING_ITEM_SLOT>

/**
 * Page body. The shell supplies the section's own seats plus `renderSlot`
 * bound to the child slot declared at registration time; the page owns the
 * layout only.
 *
 * Cards are laid out SIDE BY SIDE: a markerless grid whose columns fit as many
 * ~280px cards as the settings column has room for, so the reading plugins sit
 * in one row on a wide panel and wrap gracefully on a narrow one. Cards render
 * `<li>` roots, hence the list reset.
 */
export function ReadingSettingsSection({ renderSlot }: ReadingPageProps) {
  return createElement(
    'ul',
    {
      style: {
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        alignItems: 'start',
        gap: '12px',
      },
    },
    renderSlot(READING_ITEM_SLOT, {}),
  )
}

/** Whether a participant already holds the shared page. */
export function readingPageClaimed(ctx: ClientContext): boolean {
  return ctx.slots.entries('settings.section').some(entry => entry.options.id === READING_PAGE_ID)
}

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
export function claimReadingSettingsPage(
  ctx: ClientContext,
  label: () => string,
  locale: keyof LocaleNamespaceMap & string,
): () => void {
  if (readingPageClaimed(ctx)) return () => {}
  return ctx.slots.register({
    name: 'settings.section',
    id: READING_PAGE_ID,
    order: READING_PAGE_ORDER,
    label,
    locale,
    children: { 'reading.settings.item': { kind: 'list', scope: 'root' } },
  }, ReadingSettingsSection)
}
