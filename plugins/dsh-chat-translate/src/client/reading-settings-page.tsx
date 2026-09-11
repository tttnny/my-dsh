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

import { createElement, useState, useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { InjectFace, LocaleNamespaceMap, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

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

/** One participant's tab, derived from its card registration. */
export interface ReadingTab {
  /** Registration id — the participant's Host settings namespace. */
  id: string
  /** Registration order, ascending in the tab bar. */
  order: number
  /** Registration label, already resolved for the active locale. */
  label: string
}

/** Live tab roster handed to the page component through its inject face. */
export interface ReadingTabsFace {
  getSnapshot(): readonly ReadingTab[]
  subscribe(listener: () => void): () => void
}

/** Inject face of the shared page. */
export interface ReadingPageFace {
  readingTabs: ReadingTabsFace
}

type ReadingPageProps =
  PropsRuntime<'settings.section'>
  & PropsRenderSlots<typeof READING_ITEM_SLOT>
  & InjectFace<ReadingPageFace>

/** A registration label is a plain string or a thunk re-read per projection. */
function readLabel(label: unknown): string {
  if (typeof label === 'function') return (label as () => string)()
  return typeof label === 'string' ? label : ''
}

/**
 * Tab chrome mirrors the kernel's own settings tabs (`.tabs` / `.tab` in
 * `ui-settings-plugins`): tertiary label, 13px, 22px gutter. The marker is the
 * ACTIVE TAB'S OWN bottom border and the bar draws no rail of its own — a
 * shared underline reads as "every tab is selected", which is exactly the bug
 * this replaces.
 */
const TABLIST_STYLE = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: '22px',
  marginTop: '2px',
  marginBottom: '16px',
} as const

const TAB_STYLE = {
  appearance: 'none',
  background: 'transparent',
  // No border on ANY tab: the marker below is the active tab's own element, so
  // an inactive tab has nothing that could render a line.
  border: 'none',
  position: 'relative',
  padding: '7px 1px 11px',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '13px',
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-tertiary, inherit)',
} as const

const TAB_ACTIVE_STYLE = {
  ...TAB_STYLE,
  color: 'var(--dsw-alias-label-primary, inherit)',
} as const

/** The kernel's own tab marker: a 2px rounded bar under the active label. */
const TAB_MARKER_STYLE = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: '2px',
  borderRadius: '2px 2px 0 0',
  background: 'var(--dsw-alias-label-primary, currentColor)',
} as const

/** Panels stay mounted (hidden) so each card keeps its local state. */
const PANEL_STYLE = { listStyle: 'none', margin: 0, padding: 0 } as const
const PANEL_HIDDEN_STYLE = { ...PANEL_STYLE, display: 'none' } as const

/**
 * Build the live tab roster over the child slot's registrations. `locale` is
 * read through `ctx.get`: a participant needs it only to re-read localized
 * labels on a language switch, and reaching an undeclared service as
 * `ctx.locale` would trip the kernel's inject guard.
 * @param ctx - browser context carrying the slot registry.
 * @returns The tab store consumed by the page component.
 */
function createReadingTabs(ctx: ClientContext): ReadingTabsFace {
  const locale = ctx.get('locale') as
    | { getSnapshot(): { revision: number }; subscribe(listener: () => void): () => void }
    | undefined
  let version = -1
  let revision = -1
  let tabs: readonly ReadingTab[] = []
  return {
    getSnapshot: () => {
      const nextVersion = ctx.slots.getVersion(READING_ITEM_SLOT)
      const nextRevision = locale === undefined ? 0 : locale.getSnapshot().revision
      if (nextVersion === version && nextRevision === revision) return tabs
      version = nextVersion
      revision = nextRevision
      tabs = ctx.slots.entries(READING_ITEM_SLOT)
        .map(entry => ({
          id: entry.options.id ?? '',
          order: entry.options.order ?? 0,
          label: readLabel(entry.options.label),
        }))
        .sort((left, right) => left.order - right.order)
      return tabs
    },
    subscribe: (listener) => {
      const offSlots = ctx.slots.subscribe(READING_ITEM_SLOT, listener)
      const offLocale = locale?.subscribe(listener)
      return () => {
        offSlots()
        offLocale?.()
      }
    },
  }
}

/**
 * Page body: one tab per registered card, plus the selected card's panel.
 * The shell supplies the section's own seats and `renderSlot` bound to the
 * child slot declared at registration time.
 */
export function ReadingSettingsSection({ renderSlot, readingTabs }: ReadingPageProps) {
  const tabs = useSyncExternalStore(
    readingTabs.subscribe,
    readingTabs.getSnapshot,
    readingTabs.getSnapshot,
  )
  const [requested, setRequested] = useState<string | null>(null)
  const selected = requested !== null && tabs.some(tab => tab.id === requested)
    ? requested
    : tabs[0]?.id ?? null
  if (selected === null) return null
  return createElement(
    'div',
    null,
    createElement(
      'div',
      { role: 'tablist', style: TABLIST_STYLE },
      tabs.map(tab => createElement(
        'button',
        {
          key: tab.id,
          type: 'button',
          role: 'tab',
          'aria-selected': tab.id === selected,
          style: tab.id === selected ? TAB_ACTIVE_STYLE : TAB_STYLE,
          onClick: () => { setRequested(tab.id) },
        },
        tab.label,
        tab.id === selected ? createElement('span', { style: TAB_MARKER_STYLE, 'aria-hidden': true }) : null,
      )),
    ),
    tabs.map(tab => createElement(
      'ul',
      {
        key: tab.id,
        role: 'tabpanel',
        hidden: tab.id !== selected,
        style: tab.id === selected ? PANEL_STYLE : PANEL_HIDDEN_STYLE,
      },
      renderSlot(READING_ITEM_SLOT, {}, { only: tab.id }),
    )),
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
  const readingTabs = createReadingTabs(ctx)
  return ctx.slots.register({
    name: 'settings.section',
    id: READING_PAGE_ID,
    order: READING_PAGE_ORDER,
    label,
    locale,
    inject: () => ({ readingTabs }),
    children: { 'reading.settings.item': { kind: 'list', scope: 'root' } },
  }, ReadingSettingsSection)
}
