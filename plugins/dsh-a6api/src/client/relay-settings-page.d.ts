/**
 * Hand-written types for {@link ./relay-settings-page.js}. The shell is plain
 * JavaScript so the same runtime body compiles unchanged into the
 * `dsh-llm-agentrouter` browser bundle, which is written by hand.
 */

/** Page id claimed by the first participating plugin to activate. */
export declare const RELAY_PAGE_ID = 'relay'
/** Sidebar position of the shared page; own plugins start at 110. */
export declare const RELAY_PAGE_ORDER = 120
/** The page's one child slot: every participant's card registers here. */
export declare const RELAY_ITEM_SLOT = 'relay.settings.item'

/** One participant's tab, derived from its card registration. */
export interface RelayTab {
  /** Registration id — the participant's settings namespace. */
  id: string
  /** Registration order, ascending in the tab bar. */
  order: number
  /** Registration label, already resolved for the active locale. */
  label: string
}

/** Live tab roster handed to the page component through its inject face. */
export interface RelayTabsFace {
  getSnapshot(): readonly RelayTab[]
  subscribe(listener: () => void): () => void
}

/** The page component's own props: the kernel's `renderSlot` plus the inject face. */
export interface RelaySectionProps {
  /** Section seats supplied by the kernel, bound to this page's child slot. */
  renderSlot: (
    name: string,
    owner?: Record<string, unknown>,
    filter?: Record<string, unknown>,
  ) => unknown
  /** Live tab roster built over the child slot's registrations. */
  relayTabs: RelayTabsFace
}

/** Whether a participant already holds the shared page. */
export declare function relayPageClaimed(ctx: unknown): boolean

/**
 * Claim the shared page when no participant holds it yet. Call inside
 * `ctx.slots.inject('settings.section', …)`.
 *
 * @param ctx - browser context carrying the slot registry.
 * @param label - page label of the claiming participant.
 * @returns The page registration's disposer, or a no-op when another
 * participant already holds the page.
 */
export declare function claimRelaySettingsPage(
  ctx: unknown,
  label: () => string,
): () => void

/** Page body: one tab per registered card, plus the selected card's panel. */
export declare function RelaySettingsSection(props: RelaySectionProps): unknown
