/**
 * 已翻译块的点击守卫：切换只认「落在块空白正文上的裸点击」。
 *
 * 块内含链接、代码块复制钮等交互元素——它们的点击归自己，不连带切块；
 * 拖选译文松手产生的 click 同样忽略。纯 DOM 判定，不依赖 React，可独立测试。
 */

interface MinimalPointerEvent {
  /** 点击命中的最深元素。 */
  target: { closest?(selector: string): unknown } | null;
  /** 挂了本守卫的已翻译块容器。 */
  currentTarget: unknown;
}

interface MinimalWindow {
  getSelection?(): { isCollapsed?: boolean; toString?(): string } | null;
}

/**
 * @param event - click 事件（结构面：target/currentTarget）。
 * @param view - 可注入的 window（测试传假对象；运行时传全局 window）。
 * @returns 该点击是否应当触发原文/译文切换。
 */
export function isBareBlockClick(event: MinimalPointerEvent, view: MinimalWindow | undefined): boolean {
  const target = event.target;
  const interactive = typeof target?.closest === 'function' ? target.closest('a,button,[role="button"]') : null;
  if (interactive !== null && interactive !== undefined && interactive !== event.currentTarget) return false;
  const selection = typeof view?.getSelection === 'function' ? view.getSelection() : null;
  if (selection !== null && selection !== undefined) {
    if (selection.isCollapsed === false && String(selection.toString?.() ?? '') !== '') return false;
  }
  return true;
}
