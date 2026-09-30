/**
 * 左缘热区的点击判定：只有「按下与松手都落在热区上」的干净点击才切换/补跑。
 *
 * 热区没有子元素，所以浏览器派发过来的 click 若 `target === currentTarget`，
 * 就说明按下与松手都在热区里；反之（在热区按下、往右拖进正文选字再松手）click
 * 会派发给两者的公共祖先，target 不是热区，天然判为拖选。这不是启发式，是
 * click 事件的分派语义——正文整块不再是点击目标，误触从根上消失。
 * 纯 DOM 判定，不依赖 React，可独立测试。
 */

interface MinimalPointerEvent {
  /** 点击命中的最深元素。 */
  target: unknown;
  /** 挂了本守卫的热区元素本身。 */
  currentTarget: unknown;
}

interface MinimalWindow {
  getSelection?(): { isCollapsed?: boolean; toString?(): string } | null;
}

/**
 * @param event - click 事件（结构面：target/currentTarget）。
 * @param view - 可注入的 window（测试传假对象；运行时传全局 window）。
 * @returns 该点击是否应当触发切换/补跑。
 */
export function isCleanHotspotClick(event: MinimalPointerEvent, view: MinimalWindow | undefined): boolean {
  if (event.target !== event.currentTarget) return false;
  // 已经存在一段非空选区时不动它：用户此刻在做的是选字，不是切换。
  const selection = typeof view?.getSelection === 'function' ? view.getSelection() : null;
  if (selection !== null && selection !== undefined) {
    if (selection.isCollapsed === false && String(selection.toString?.() ?? '') !== '') return false;
  }
  return true;
}
