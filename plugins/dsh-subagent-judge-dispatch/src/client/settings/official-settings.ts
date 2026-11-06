/**
 * The official setting this card depends on, and how to open it.
 *
 * The host has no cross-plugin call for opening one official settings card:
 * `pluginNavigation` shows the Plugins page, and the card it shows from there
 * carries the page's own `data-plugin-item` attribute. So the jump is two
 * steps — show the list, then press the card — and the second step presses that
 * documented attribute rather than reaching into the page's private store.
 *
 * The item id is the host's own: the Subagent settings page registers as
 * `subagent` in the Plugins page's Official group.
 */

/** The official item id of the Subagent settings page. */
const SUBAGENT_ITEM_ID = 'subagent';

/** How long to wait for the card to render after the list is shown. */
const OPEN_BUDGET_MS = 1500;

/** How often to look for the card while it renders. */
const OPEN_POLL_MS = 50;

/** The slice of the host's `pluginNavigation` service this module uses. */
export interface PluginNavigationLike {
  /** Show the Plugins page's list without changing the current Session. */
  openList(): void;
}

/**
 * Build the opener for the official Subagent settings page.
 *
 * @param navigation - the host's Plugins navigation service, when the page has one.
 * @returns a function that shows the Plugins list and presses the Subagent
 *   card, or null when this page cannot navigate.
 */
export function createOfficialSettingsOpener(
  navigation: PluginNavigationLike | undefined,
): (() => void) | null {
  if (navigation === undefined || typeof navigation.openList !== 'function') return null;
  return () => {
    navigation.openList();
    const deadline = Date.now() + OPEN_BUDGET_MS;
    const press = (): void => {
      const card = document.querySelector<HTMLElement>(
        `[data-plugin-item="${SUBAGENT_ITEM_ID}"] button`,
      );
      if (card !== null) {
        card.click();
        return;
      }
      // The list renders on the next commit; keep looking until it is there.
      if (Date.now() < deadline) setTimeout(press, OPEN_POLL_MS);
    };
    setTimeout(press, 0);
  };
}
