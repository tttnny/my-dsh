/**
 * The shared 「API中转」 settings page.
 *
 * Several plugins contribute their configuration to ONE settings page, but the
 * kernel cannot declare that page jointly: `settings.section` is a list slot
 * that rejects a duplicate `id` at the same priority ("already has an entry
 * with id"), and a child slot may be declared exactly once ("slot … is already
 * declared"). Composing several cards into one page therefore takes one
 * declarer, so every participating plugin carries this same shell and the
 * FIRST one to activate claims the page; the others register their card into
 * {@link RELAY_ITEM_SLOT} and wait for the winner's declaration through
 * `slots.inject`. Uninstalling the winner promotes another participant on the
 * next boot, so no participant is a fixed owner.
 *
 * The page renders ONE TAB PER REGISTERED CARD: the tab roster comes from the
 * child slot's own registrations (id + `label` + `order`, the same shape the
 * kernel's own Plugins page uses for its tabs), and each panel dispatches
 * through `renderSlot(RELAY_ITEM_SLOT, {}, { only: id })`. Every panel stays
 * mounted but hidden, so a card's local state survives a tab switch.
 *
 * Keep the runtime body of this file identical across the participating
 * plugins (`dsh-a6api`, `dsh-llm-agentrouter`). Participants own their own card
 * component, locale dictionaries, settings namespace and Host half — only the
 * page shell is shared, because cross-plugin value imports are forbidden by
 * the client bundle purity gate. It imports nothing but `react` on purpose, so
 * every participant's build configuration compiles it unchanged.
 */

import { createElement, useState, useSyncExternalStore } from 'react'

/** Page id claimed by the first participating plugin to activate. */
export const RELAY_PAGE_ID = 'relay'
/** Sidebar position of the shared page; own plugins start at 110. */
export const RELAY_PAGE_ORDER = 120
/** The page's one child slot: every participant's card registers here. */
export const RELAY_ITEM_SLOT = 'relay.settings.item'

/**
 * Tab chrome mirrors the kernel's own settings tabs (`.tabs` / `.tab` in
 * `ui-settings-plugins`): tertiary label, 13px, 22px gutter. The marker is the
 * ACTIVE TAB'S OWN bottom border and the bar draws no rail of its own — a
 * shared underline reads as "every tab is selected".
 */
const TABLIST_STYLE = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: '22px',
  marginTop: '2px',
  marginBottom: '16px',
}

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
}

const TAB_ACTIVE_STYLE = Object.assign({}, TAB_STYLE, {
  color: 'var(--dsw-alias-label-primary, inherit)',
})

/** The kernel's own tab marker: a 2px rounded bar under the active label. */
const TAB_MARKER_STYLE = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: '2px',
  borderRadius: '2px 2px 0 0',
  background: 'var(--dsw-alias-label-primary, currentColor)',
}

/**
 * Panels stay mounted (hidden) so each card keeps its local state. `display:
 * none` is written explicitly because a card's own styles commonly set
 * `display: flex` while the section's stylesheet loads after this one.
 */
const PANEL_STYLE = { margin: 0 }
const PANEL_HIDDEN_STYLE = { margin: 0, display: 'none' }

/** A registration label is a plain string or a thunk re-read per projection. */
function readLabel(label) {
  if (typeof label === 'function') return label()
  return typeof label === 'string' ? label : ''
}

/**
 * Build the live tab roster over the child slot's registrations. `locale` is
 * read through `ctx.get`: a participant needs it only to re-read localized
 * labels on a language switch, and reaching an undeclared service as
 * `ctx.locale` would trip the kernel's inject guard. Every participant passes a
 * bound translator as its `label` thunk, so the label re-reads the active
 * language on each projection.
 *
 * @param ctx - browser context carrying the slot registry.
 * @returns The tab store consumed by the page component.
 */
function createRelayTabs(ctx) {
  const locale = ctx.get('locale')
  let version = -1
  let revision = -1
  let tabs = []
  return {
    getSnapshot: () => {
      const nextVersion = ctx.slots.getVersion(RELAY_ITEM_SLOT)
      const nextRevision = locale === undefined ? 0 : locale.getSnapshot().revision
      if (nextVersion === version && nextRevision === revision) return tabs
      version = nextVersion
      revision = nextRevision
      tabs = ctx.slots.entries(RELAY_ITEM_SLOT)
        .map(entry => ({
          id: entry.options.id ?? '',
          order: entry.options.order ?? 0,
          label: readLabel(entry.options.label),
        }))
        .sort((left, right) => left.order - right.order)
      return tabs
    },
    subscribe: (listener) => {
      const offSlots = ctx.slots.subscribe(RELAY_ITEM_SLOT, listener)
      const offLocale = locale === undefined ? undefined : locale.subscribe(listener)
      return () => {
        offSlots()
        if (offLocale !== undefined) offLocale()
      }
    },
  }
}

/**
 * Page body: one tab per registered card, plus the selected card's panel.
 * The shell supplies the section's own seats and `renderSlot` bound to the
 * child slot declared at registration time.
 */
export function RelaySettingsSection({ renderSlot, relayTabs }) {
  const tabs = useSyncExternalStore(
    relayTabs.subscribe,
    relayTabs.getSnapshot,
    relayTabs.getSnapshot,
  )
  const [requested, setRequested] = useState(null)
  const selected = requested !== null && tabs.some(tab => tab.id === requested)
    ? requested
    : (tabs.length > 0 ? tabs[0].id : null)
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
      'div',
      {
        key: tab.id,
        role: 'tabpanel',
        hidden: tab.id !== selected,
        style: tab.id === selected ? PANEL_STYLE : PANEL_HIDDEN_STYLE,
      },
      renderSlot(RELAY_ITEM_SLOT, {}, { only: tab.id }),
    )),
  )
}

/** Whether a participant already holds the shared page. */
export function relayPageClaimed(ctx) {
  return ctx.slots.entries('settings.section').some(entry => entry.options.id === RELAY_PAGE_ID)
}

/**
 * Claim the shared page when no participant holds it yet. Call inside
 * `ctx.slots.inject('settings.section', …)`: injection order decides the
 * winner, and the losers stay silent instead of colliding with the kernel's
 * duplicate-id and duplicate-declaration guards.
 *
 * @param ctx - browser context carrying the slot registry.
 * @param label - page label of the claiming participant, re-read by the shell
 * on every projection so a language switch reaches the sidebar too.
 * @returns The page registration's disposer, or a no-op when another
 * participant already holds the page.
 */
export function claimRelaySettingsPage(ctx, label) {
  if (relayPageClaimed(ctx)) return () => {}
  const relayTabs = createRelayTabs(ctx)
  const children = {}
  children[RELAY_ITEM_SLOT] = { kind: 'list', scope: 'root' }
  return ctx.slots.register({
    name: 'settings.section',
    id: RELAY_PAGE_ID,
    order: RELAY_PAGE_ORDER,
    label,
    inject: () => ({ relayTabs }),
    children,
  }, RelaySettingsSection)
}
