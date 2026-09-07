import { installStickyUserRows } from "./installSticky.ts";

/** 浏览器端最小上下文：只用 effect 挂载/卸载副作用，不再依赖旧版 dsh-client-runtime。 */
interface ClientContext {
  effect(factory: () => void | (() => void), label: string): void;
}

const STYLE_ID = "dsh-oil-sticky-prompt";
const STYLES = `
[data-oil-sticky-host]{
  position:sticky;
  top:0;
  z-index:5;
  height:0;
  overflow:visible;
  pointer-events:none;
}
.oilStickyBar{
  position:absolute;
  left:0;
  right:0;
  top:0;
  display:flex;
  justify-content:center;
  padding:8px calc(var(--dsh-composer-side-clearance, 16px) + 16px);
  background:var(--dsw-alias-bg-base);
  box-shadow:0 16px 16px -12px var(--dsw-alias-bg-base);
  opacity:0;
  transition:opacity 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.oilStickyBar[data-oil-visible]{opacity:1}
.oilStickyBar[hidden]{display:none}
.oilStickyPrompt{
  display:block;
  box-sizing:border-box;
  width:100%;
  max-width:var(--dsh-chat-content-width, 748px);
  margin:0;
  padding:6px 12px;
  border:none;
  border-radius:16px;
  background:var(--dsw-specific-bubble);
  color:var(--dsw-alias-label-primary);
  font:inherit;
  font-size:13px;
  line-height:20px;
  text-align:left;
  pointer-events:auto;
  cursor:pointer;
  will-change:transform;
}
.oilStickyPrompt:focus-visible{
  outline:none;
  box-shadow:0 0 0 2px var(--dsw-alias-border-l3);
}
.oilStickyPromptText{
  display:-webkit-box;
  overflow:hidden;
  overflow-wrap:anywhere;
  white-space:normal;
  -webkit-box-orient:vertical;
  -webkit-line-clamp:2;
}
@media (prefers-reduced-motion:reduce){
  .oilStickyBar{box-shadow:none;opacity:1;transition:none}
  .oilStickyPrompt{transition:none}
}
`;

/** 浏览器插件名（与 cordis.patch.yml 的 insert id 一致）。 */
export const name = "dsh-oil-sticky-prompt";

/** 无硬依赖的纯 DOM 观察插件：不等待任何服务，immediately 由 package.json 声明。 */
export const inject: string[] = [];

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const existing = document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`);
    const tag = existing instanceof HTMLStyleElement ? existing : document.createElement("style");
    tag.dataset.plugin = "dsh-oil-sticky-prompt";
    tag.dataset.pluginCss = STYLE_ID;
    tag.textContent = STYLES;
    if (existing === null) document.head.appendChild(tag);
    return () => { tag.remove(); };
  }, "dsh-oil-sticky-prompt: styles");
  ctx.effect(() => installStickyUserRows(), "dsh-oil-sticky-prompt: stick");
}
