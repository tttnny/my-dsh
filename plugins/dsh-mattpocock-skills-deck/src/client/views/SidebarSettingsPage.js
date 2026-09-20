/**
 * views/SidebarSettingsPage.js — 「侧边栏」共享设置页壳（真源 ESM；build 拼回 src/client/index.js 的 leaf 标记处）
 *
 * 与 dsh-workspace-tree 共用「设置 → 侧边栏」这一页：页壳逐字同源，
 * 另一份在 dsh-workspace-tree 的 lib/client.js 里（`//#region shared sidebar settings page shell`；
 * 差异只有行首缩进与本文件的行首 export，构建时都会被剥掉/对上）。
 * 改壳必须两份一起改，判据见仓库 docs/rules/shared-settings-page.md。
 */
//#region shared sidebar settings page shell
/**
 * The shared 「侧边栏」 settings page.
 *
 * Several plugins contribute their configuration to ONE settings page, but the
 * kernel cannot declare that page jointly: `settings.section` is a list slot
 * that rejects a duplicate `id` at the same priority ("already has an entry
 * with id"), and a child slot may be declared exactly once ("slot … is already
 * declared"). Composing several cards into one page therefore takes one
 * declarer, so every participating plugin carries this same shell and the FIRST
 * one to activate claims the page; the others register their card into
 * SIDEBAR_ITEM_SLOT and wait for the winner's declaration through
 * `slots.inject`. Uninstalling the winner promotes another participant on the
 * next boot, so no participant is a fixed owner.
 *
 * The page renders ONE TAB PER REGISTERED CARD: the tab roster comes from the
 * child slot's own registrations (id + `label` + `order`, the same shape the
 * kernel's own Plugins page uses for its tabs), and each panel dispatches
 * through `renderSlot(SIDEBAR_ITEM_SLOT, {}, { only: id })`. Every panel stays
 * mounted but hidden, so a card's local state survives a tab switch.
 *
 * The panel element is a plain `div`: every participant's card already owns its
 * own chrome (title rows, groups, forms), so the shared page only stacks them.
 *
 * Keep this region identical to the one in `dsh-workspace-tree`'s
 * `lib/client.js` apart from line indentation and the leading `export` this
 * module keeps for the build to strip. Participants own their own card
 * component, locale dictionaries, settings namespace and Host half — only the
 * page shell is shared, because cross-plugin value imports are forbidden by the
 * client bundle purity gate. It needs nothing but `React` on purpose, so every
 * participant's build configuration compiles it unchanged.
 */
/** Page id claimed by the first participating plugin to activate. */
export const SIDEBAR_PAGE_ID = 'sidebar'
/** Sidebar position of the shared page; own plugins start at 110. */
export const SIDEBAR_PAGE_ORDER = 130
/** The page's one child slot: every participant's card registers here. */
export const SIDEBAR_ITEM_SLOT = 'sidebar.settings.item'

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
  border: 'none',
  position: 'relative',
  padding: '7px 1px 11px',
  cursor: 'pointer',
  font: 'var(--dsw-font-xs-13)',
  color: 'var(--dsw-alias-label-tertiary)',
}

const TAB_ACTIVE_STYLE = Object.assign({}, TAB_STYLE, {
  color: 'var(--dsw-alias-label-primary)',
})

/** The kernel's own tab marker: a 2px rounded bar under the active label. */
const TAB_MARKER_STYLE = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: '2px',
  borderRadius: '2px 2px 0 0',
  background: 'var(--dsw-alias-label-primary)',
}

/**
 * Panels stay mounted (hidden) so each card keeps its local state. `display:
 * none` is written explicitly because a card's own styles commonly set
 * `display: flex` while the section's stylesheet loads after this one.
 */
const PANEL_STYLE = { margin: 0 }
const PANEL_HIDDEN_STYLE = { margin: 0, display: 'none' }

/** A registration label is a plain string or a thunk re-read per projection. */
const readLabel = function (label) {
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
const createSidebarTabs = function (ctx) {
  const locale = ctx.get('locale')
  let version = -1
  let revision = -1
  let tabs = []
  return {
    getSnapshot: function () {
      const nextVersion = ctx.slots.getVersion(SIDEBAR_ITEM_SLOT)
      const nextRevision = locale === undefined ? 0 : locale.getSnapshot().revision
      if (nextVersion === version && nextRevision === revision) return tabs
      version = nextVersion
      revision = nextRevision
      tabs = ctx.slots.entries(SIDEBAR_ITEM_SLOT)
        .map(function (entry) {
          return {
            id: entry.options.id === undefined ? '' : entry.options.id,
            order: entry.options.order === undefined ? 0 : entry.options.order,
            label: readLabel(entry.options.label),
          }
        })
        .sort(function (left, right) { return left.order - right.order })
      return tabs
    },
    subscribe: function (listener) {
      const offSlots = ctx.slots.subscribe(SIDEBAR_ITEM_SLOT, listener)
      const offLocale = locale === undefined ? undefined : locale.subscribe(listener)
      return function () {
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
export const SidebarSettingsSection = function (props) {
  const renderSlot = props.renderSlot
  const sidebarTabs = props.sidebarTabs
  const tabs = React.useSyncExternalStore(
    sidebarTabs.subscribe,
    sidebarTabs.getSnapshot,
    sidebarTabs.getSnapshot,
  )
  const requestedState = React.useState(null)
  const requested = requestedState[0]
  const setRequested = requestedState[1]
  const selected = requested !== null && tabs.some(function (tab) { return tab.id === requested })
    ? requested
    : (tabs.length > 0 ? tabs[0].id : null)
  if (selected === null) return null
  return React.createElement(
    'div',
    null,
    React.createElement(
      'div',
      { role: 'tablist', style: TABLIST_STYLE },
      tabs.map(function (tab) {
        const active = tab.id === selected
        return React.createElement(
          'button',
          {
            key: tab.id,
            type: 'button',
            role: 'tab',
            'aria-selected': active,
            style: active ? TAB_ACTIVE_STYLE : TAB_STYLE,
            onClick: function () { setRequested(tab.id) },
          },
          tab.label,
          active ? React.createElement('span', { style: TAB_MARKER_STYLE, 'aria-hidden': true }) : null,
        )
      }),
    ),
    tabs.map(function (tab) {
      const active = tab.id === selected
      return React.createElement(
        'div',
        {
          key: tab.id,
          role: 'tabpanel',
          hidden: !active,
          style: active ? PANEL_STYLE : PANEL_HIDDEN_STYLE,
        },
        renderSlot(SIDEBAR_ITEM_SLOT, {}, { only: tab.id }),
      )
    }),
  )
}

/** Whether a participant already holds the shared page. */
export const sidebarPageClaimed = function (ctx) {
  return ctx.slots.entries('settings.section').some(function (entry) {
    return entry.options.id === SIDEBAR_PAGE_ID
  })
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
export const claimSidebarSettingsPage = function (ctx, label) {
  if (sidebarPageClaimed(ctx)) return function () {}
  const sidebarTabs = createSidebarTabs(ctx)
  const children = {}
  children[SIDEBAR_ITEM_SLOT] = { kind: 'list', scope: 'root' }
  return ctx.slots.register({
    name: 'settings.section',
    id: SIDEBAR_PAGE_ID,
    order: SIDEBAR_PAGE_ORDER,
    label: label,
    inject: function () { return { sidebarTabs: sidebarTabs } },
    children: children,
  }, SidebarSettingsSection)
}
//#endregion
