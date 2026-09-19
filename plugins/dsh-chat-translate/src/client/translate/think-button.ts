/**
 * 思考卡标题右侧的翻译按钮。
 *
 * 三态：idle（描边「译」字，点击开始翻译）、working（圈内圆环旋转，点击忽略）、
 * translated（实心高亮，点击整条切回原文）。样式只在首次使用注入一次，配色沿用
 * 内核的 dsw-* 变量；系统开启「减弱动态效果」时圆环不旋转。
 */

export type ThinkButtonState = 'idle' | 'working' | 'translated';

export const THINK_BUTTON_CLASS = 'dsh-tidy-think-button';

const STYLE_TAG_ID = '@lynn123411/dsh-chat-translate/think-button.css';

const THINK_BUTTON_CSS = `
/* 思考卡标题右侧的翻译按钮：三态（未翻译 / 翻译中 / 已翻译）与旋转动画。 */
.dsh-tidy-think-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex: none;
  width: 18px;
  height: 18px;
  margin: 0 6px 0 2px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35));
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, currentColor);
  font-family: inherit;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}

.dsh-tidy-think-button:hover:not([disabled]) {
  border-color: var(--dsw-alias-label-secondary, rgba(128, 128, 128, 0.6));
  color: var(--dsw-alias-label-primary, currentColor);
}

.dsh-tidy-think-button[data-state='translated'] {
  border-color: transparent;
  background: color-mix(in srgb, var(--dsw-static-deepseek-500, #4d6bfe) 18%, transparent);
  color: var(--dsw-static-deepseek-500, #4d6bfe);
}

.dsh-tidy-think-button[data-state='working'] {
  color: transparent;
}

.dsh-tidy-think-button[data-state='working']::after {
  content: '';
  position: absolute;
  inset: 3px;
  border: 1.5px solid var(--dsw-alias-label-caption, rgba(128, 128, 128, 0.45));
  border-top-color: var(--dsw-static-deepseek-500, #4d6bfe);
  border-radius: 50%;
  animation: dsh-tidy-think-spin 0.8s linear infinite;
}

.dsh-tidy-think-button[disabled] {
  opacity: 0.35;
  cursor: default;
}

@keyframes dsh-tidy-think-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .dsh-tidy-think-button[data-state='working']::after {
    animation: none;
    border-color: var(--dsw-static-deepseek-500, #4d6bfe);
  }
}
`;

/** 注入按钮样式，重复调用无副作用。 */
export function ensureThinkButtonStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]') !== null) return;
  const style = document.createElement('style');
  style.dataset.plugin = '@lynn123411/dsh-chat-translate';
  style.dataset.pluginCss = STYLE_TAG_ID;
  style.textContent = THINK_BUTTON_CSS;
  document.head?.appendChild(style);
}

export interface ThinkButtonHandle {
  element: HTMLButtonElement;
  getState(): ThinkButtonState;
  setState(state: ThinkButtonState): void;
  setDisabled(disabled: boolean, reason: string): void;
}

/** 创建一个按钮实例；onActivate 由调用方决定点下去做什么。 */
export function createThinkButton(onActivate: () => void): ThinkButtonHandle {
  ensureThinkButtonStyles();
  const element = document.createElement('button');
  element.type = 'button';
  element.className = THINK_BUTTON_CLASS;
  element.textContent = '译';
  element.dataset.state = 'idle';
  element.setAttribute('aria-label', '翻译思考链');
  element.title = '翻译思考链';
  // 整行可点（展开/收起），按钮必须自己拦下冒泡。
  element.addEventListener('click', (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (element.disabled) return;
    onActivate();
  });

  const setState = (state: ThinkButtonState): void => {
    element.dataset.state = state;
    const label = state === 'translated' ? '显示思考原文' : '翻译思考链';
    element.setAttribute('aria-label', label);
    element.title = label;
  };

  return {
    element,
    getState: () => (element.dataset.state ?? 'idle') as ThinkButtonState,
    setState,
    setDisabled: (disabled, reason) => {
      element.disabled = disabled;
      if (disabled) element.title = reason;
      else setState((element.dataset.state ?? 'idle') as ThinkButtonState);
    },
  };
}