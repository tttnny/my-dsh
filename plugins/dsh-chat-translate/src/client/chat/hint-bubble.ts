/**
 * 左缘透明带上的悬停气泡：一条贴在鼠标右边的提示，报出此刻能做的那个动作。
 *
 * 位置是纯几何计算：默认落在光标右侧 {@link HINT_GAP} 像素、与光标同一高度；
 * 右边放不下时翻到光标左边，上下贴边时把气泡收回视口内。气泡由渲染层常挂、
 * 随鼠标移动改写内联样式——不经过 React 状态，鼠标划过一段正文不会重渲染 markdown。
 *
 * 为什么不用宿主的 `Tooltip`：它把气泡钉在锚点元素的矩形上，而且只在悬停开始那一刻
 * 量一次那个矩形（`show()` 里一次 `getBoundingClientRect`），所以它既到不了光标处、
 * 也不会跟着光标走。这里要的是「跟着光标」，气泡因此自己画；样式取宿主 Tooltip 的
 * 同款令牌与尺寸（见 styles.ts 的 `.dsh-ct-hint`）。
 */

/** 光标位置：视口坐标，即鼠标事件的 clientX / clientY。 */
export interface HintPointer {
  readonly clientX: number;
  readonly clientY: number;
}

/** 视口尺寸。 */
export interface HintViewport {
  readonly width: number;
  readonly height: number;
}

/** 气泡与光标之间的间隙。 */
export const HINT_GAP = 12;

/** 气泡离视口边缘的最小留白。 */
const EDGE_MARGIN = 12;

/**
 * 算出气泡该落在哪儿。
 *
 * @param pointer - 光标位置（视口坐标）。
 * @param size - 气泡自己的尺寸（由调用方从元素上量出来）。
 * @param viewport - 视口尺寸。
 * @returns left / top 是给 `position: fixed` 用的视口坐标；side 说气泡落在光标的
 *   哪一侧——`right` 时左边缘贴 left，`left` 时右边缘贴 left（由样式层翻成位移）。
 */
export function hintPlacement(
  pointer: HintPointer,
  size: { readonly width: number; readonly height: number },
  viewport: HintViewport
): { readonly left: number; readonly top: number; readonly side: 'left' | 'right' } {
  const right = pointer.clientX + HINT_GAP;
  const side = right + size.width <= viewport.width - EDGE_MARGIN ? 'right' : 'left';
  const half = size.height / 2;
  // 视口比气泡还矮时（极端窗口）下界会高过上界，取上界——气泡至少不与光标错位。
  const bottomMost = Math.max(EDGE_MARGIN + half, viewport.height - EDGE_MARGIN - half);
  const top = Math.min(Math.max(pointer.clientY, EDGE_MARGIN + half), bottomMost);
  return { left: side === 'right' ? right : pointer.clientX - HINT_GAP, top, side };
}

/**
 * 把气泡挪到光标旁边并显形。尺寸每次现量：气泡宽度由文案决定，而文案会随
 * 译文/原文的切换改变。
 *
 * @param bubble - 气泡元素（`position: fixed`，见 `.dsh-ct-hint`）。
 * @param pointer - 光标位置（视口坐标）。
 * @param viewport - 视口尺寸。
 */
export function placeHintBubble(bubble: HTMLElement, pointer: HintPointer, viewport: HintViewport): void {
  const placement = hintPlacement(pointer, { width: bubble.offsetWidth, height: bubble.offsetHeight }, viewport);
  bubble.style.left = `${placement.left}px`;
  bubble.style.top = `${placement.top}px`;
  bubble.dataset.side = placement.side;
  bubble.dataset.visible = 'true';
}

/** 收起气泡：只摘掉显形标记，元素留在原地（下次悬停不必重挂载）。 */
export function hideHintBubble(bubble: HTMLElement | null): void {
  if (bubble === null) return;
  delete bubble.dataset.visible;
}
