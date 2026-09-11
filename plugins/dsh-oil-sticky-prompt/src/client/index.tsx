// DSH 0.1.5-rc.1 dropped the separate client-runtime package: a browser plugin
// is a plain cordis Context consumer, and each domain service (`slots`,
// `locale`, `settingsScope`) is augmented onto Context by its owning plugin.
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";

import { installStickyUserRows } from "./installSticky.ts";
import { StickyPromptCard } from "./StickyPromptCard.tsx";
import { claimReadingSettingsPage, READING_ITEM_SLOT } from "./reading-settings-page.tsx";
import { StickyPromptRuntime } from "./stickyPromptRuntime.ts";
import { en, NS, zh } from "./locales.ts";
import {
  DEFAULT_STICKY_PROMPT_SETTINGS,
  STICKY_PROMPT_SETTINGS_NS,
  type StickyPromptSettings,
} from "../settings.ts";

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

/**
 * 浏览器半边：把吸顶行为的生命周期接到用户偏好上。
 *
 * 样式表与 DOM 行为分开挂载：样式是惰性的（关闭时页面里没有宿主节点可命中），
 * 随插件卸载回收即可；行为则由 StickyPromptRuntime 单一持有，随 `enabled`
 * 偏好安装 / 拆除，因此不会出现两份监听器或重复注入的宿主节点。
 */
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

  // 先按 schema 默认值装上：设置服务缺失（inject 永不触发）时插件仍然可用，
  // 偏好回路只在这个默认值之上做开关。
  const runtime = new StickyPromptRuntime(installStickyUserRows);
  ctx.effect(() => {
    runtime.setEnabled(DEFAULT_STICKY_PROMPT_SETTINGS.enabled);
    return () => { runtime.dispose(); };
  }, "dsh-oil-sticky-prompt: stick");

  ctx.inject(["slots", "locale", "settingsScope"], (settingsCtx) => {
    const scope = settingsCtx.settingsScope.bind<StickyPromptSettings>({
      namespace: STICKY_PROMPT_SETTINGS_NS,
    });
    const t = settingsCtx.locale.bind(NS);
    settingsCtx.effect(
      () => settingsCtx.locale.register(NS, { zh, en }),
      "dsh-oil-sticky-prompt: settings dictionaries",
    );
    settingsCtx.effect(() => {
      const sync = (): void => {
        const snapshot = scope.getSnapshot();
        // 首次同步完成前偏好值未知：按默认值继续，别把「镜像还没到」读成「用户关闭」。
        if (snapshot.status !== "ready") return;
        runtime.setEnabled(snapshot.value?.enabled ?? DEFAULT_STICKY_PROMPT_SETTINGS.enabled);
      };
      const off = scope.subscribe(sync);
      sync();
      // 设置服务退场时把行为还给默认值，避免一次服务重启就把功能永久关掉。
      return () => {
        off();
        runtime.setEnabled(DEFAULT_STICKY_PROMPT_SETTINGS.enabled);
      };
    }, "dsh-oil-sticky-prompt: enabled preference");
    // 「阅读体验」页由本组插件共用：先激活者声明页面与子槽位，其余参与者只把
    // 自己的卡片注册进子槽位（内核禁止一页被多次声明）。
    settingsCtx.slots.inject("settings.section", () => claimReadingSettingsPage(
      settingsCtx,
      () => t("pageNav"),
      NS,
    ));
    settingsCtx.slots.inject(READING_ITEM_SLOT, () => settingsCtx.slots.register({
      name: READING_ITEM_SLOT,
      id: STICKY_PROMPT_SETTINGS_NS,
      order: 20,
      // 共享页按此标签渲染 tab
      label: () => t("title"),
      locale: NS,
      inject: () => ({ scope }),
    }, StickyPromptCard));
  });
}
