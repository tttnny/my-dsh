/*!
 * dsh-ui-beam-orbs 客户端入口（自动生成）
 * 由 scripts/build.mjs 从 src/ 拼接生成——请勿直接修改本文件；
 * 修改源码（src/ 下的模块与 CSS）后运行：node scripts/build.mjs
 */
window.__ModuleLoader__.load({
  id: "@lynn123411/dsh-ui-beam-orbs",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    // 设置页面板需要 React（平台 seed 模块）；拿不到就跳过设置 UI，不影响界面效果
    var react = null;
    try { react = require("react"); } catch (e) {}
    if (document.getElementById("dsh-beam-orbs-css") === null) {
      var styleTag = document.createElement("style");
      styleTag.id = "dsh-beam-orbs-css";
      styleTag.textContent = `
/*!
 * dsh-ui-beam-orbs.css
 * DSH Web GUI 界面皮肤层：玻璃拟态 + Border Beam + Thinking Orbs +
 * Pulse 任务清单框 + 发送按钮微动效。
 *
 * 深色主题：全部界面覆盖生效（body[data-ds-dark-theme]）；
 * 浅色主题：恢复 DSH 官方原版外观，不匹配任何覆盖规则。
 * 背景引擎（极光/鲸鱼/星座）在 dsh-ui-deepseek-bg 插件。
 */

/* ============ 官方玻璃拟态（ds-glass 令牌，取自缓存 6f322bb0cffe2c36.css）============ */
/* 仅深色主题生效；浅色主题保持官方原版卡片 */

/* 侧边对话栏：半透明 + 玻璃模糊
   注意：backdrop-filter 会让元素成为 fixed 后代的包含块（设置弹窗会被
   强制压成侧边栏宽度）——所以模糊放在 ::before 伪元素上，列本身只设背景 */
body[data-ds-dark-theme] .pI_x6G_sidebarCol {
  position: relative;
  background: rgba(13, 15, 19, 0.55) !important;
  border-right-color: hsla(0, 0%, 100%, 0.08) !important;
}

body[data-ds-dark-theme] .pI_x6G_sidebarCol::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  /* GPU 优化：全高侧边栏 blur 跟随设置面板（--dsh-bg-blur，默认 8px） */
  backdrop-filter: blur(var(--dsh-bg-blur, 8px));
  -webkit-backdrop-filter: blur(var(--dsh-bg-blur, 8px));
}

/* 侧边栏内容根：不再叠不透明底色。
   注意：不能给这里加 z-index/堆叠上下文——设置弹窗（fixed z-1000）挂载在
   侧边栏内部，一旦被困在侧边栏的堆叠上下文里就会被输入框（z-7）盖住；
   模糊伪元素用 z-index:-1 自然绘制在内容之下，内容无需提升层级
   [data-slot="sidebar"] > div 为跨构建通用选择器 */
body[data-ds-dark-theme] .hHd-Xa_root,
body[data-ds-dark-theme] [data-slot="sidebar"] > div {
  background: transparent !important;
}

/* 底部输入框卡片：官方玻璃卡片样式（ds-glass-card/dropdown 同款令牌）
   [data-composer-card="true"] 为跨构建通用属性选择器 */
body[data-ds-dark-theme] .uV2eYG_card,
body[data-ds-dark-theme] [data-composer-card="true"] {
  background: rgba(13, 15, 19, 0.55) !important;
  /* GPU 优化：输入卡片背后有滚动文字，模糊最可见；强度跟随设置面板 */
  backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  -webkit-backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  border-color: hsla(0, 0%, 100%, 0.08) !important;
  box-shadow: 0 0 1px 0 rgba(0, 0, 0, 0.2), 0 0 4px 0 rgba(0, 0, 0, 0.02), 0 12px 32px 0 rgba(0, 0, 0, 0.08) !important;
}

/* 输入框座位：去掉向不透明底色的渐隐，让极光从玻璃下透出
   [data-composer-seat] 为跨构建通用属性选择器 */
body[data-ds-dark-theme] .wSkVaW_composerSeat,
body[data-ds-dark-theme] [data-composer-seat] {
  background: transparent !important;
}

/* 会话列表底部渐隐条：0.1.5-rc.1 真实类名 .bhn1Oq_fade（dsh-client-ui-workspace，
   规则 background:linear-gradient(to bottom, transparent, var(--dsw-specific-sidebar-fill))
   即「用不透明侧边栏填充色渐变」的那条），在玻璃侧边栏下会露出浅色白条——透明化。
   原 .qDHVXG_fade 在 0.1.3-alpha.2 与 0.1.5-rc.1 均不存在（历史死选择器）。 */
body[data-ds-dark-theme] .bhn1Oq_fade,
body[data-ds-dark-theme] [class$="_fade"] {
  background: transparent !important;
}

/* ============ 设置页「界面特效」专属导航图标：Sparkles 闪烁星芒 ============ */
[data-dsh-beam-orbs-settings-nav] > svg:first-child {
  display: none !important;
}

[data-dsh-beam-orbs-settings-nav]::before {
  content: "";
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z'/%3E%3Cpath d='M5 3v4'/%3E%3Cpath d='M7 5H3'/%3E%3Cpath d='M19 17v4'/%3E%3Cpath d='M21 19h-4'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z'/%3E%3Cpath d='M5 3v4'/%3E%3Cpath d='M7 5H3'/%3E%3Cpath d='M19 17v4'/%3E%3Cpath d='M21 19h-4'/%3E%3C/svg%3E") center / contain no-repeat;
}

/* ============ 消息气泡与代码块玻璃化（与侧边栏/输入框同款材质）============ */
/* 仅深色主题生效；浅色主题保持官方原版气泡/代码块 */

/* 用户消息气泡（.Sixlwa_bubble = dsh-client-ui-chat MessageItem.module.css，0.1.3-alpha.2 与
   0.1.5-rc.1 实测均在；原 .gdEzaW_bubble 两版皆无，为历史死选择器） */
body[data-ds-dark-theme] .Sixlwa_bubble,
body[data-ds-dark-theme] [class$="_bubble"] {
  background: rgba(13, 15, 19, 0.55) !important;
  /* GPU 优化：气泡数量多且背后是平滑极光；强度跟随设置面板 */
  backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  -webkit-backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  box-shadow: inset 0 0 0 1px hsla(0, 0%, 100%, 0.08) !important;
}

/* 工具 DSL 块内容体（终端/代码/差异/阅读/搜索/网页/图片）+ 上下文注入行。
   实测真实类名：dsh-client-ui-tool 的 o3BgMG_*Body 族（0.1.3-alpha.2 / 0.1.5-rc.1 均在），
   以及 dsh-client-ui-chat 的 .XrJvXW_body —— 注意后者实为「上下文注入行」内容体，并非代码块。
   原 _block_* / _body_1ye18_20 / _copyButton_10eou_142 / _bannerWrap_178r4_21 在 0.1.3-alpha.2
   与 0.1.5-rc.1 全量产物中均不存在（历史死选择器）；其兜底 [class*="_block_"] /
   [class$="_bannerWrap"] / [class$="_copyButton"] 同样 0 命中，故改为按 _*Body 后缀兜底。 */
body[data-ds-dark-theme] .o3BgMG_terminalBody,
body[data-ds-dark-theme] .o3BgMG_codeBody,
body[data-ds-dark-theme] .o3BgMG_diffBody,
body[data-ds-dark-theme] .o3BgMG_readBody,
body[data-ds-dark-theme] .o3BgMG_searchBody,
body[data-ds-dark-theme] .o3BgMG_webBody,
body[data-ds-dark-theme] .o3BgMG_imageBody,
body[data-ds-dark-theme] .XrJvXW_body,
body[data-ds-dark-theme] [class$="_codeBody"],
body[data-ds-dark-theme] [class$="_terminalBody"],
body[data-ds-dark-theme] [class$="_diffBody"],
body[data-ds-dark-theme] [class$="_readBody"],
body[data-ds-dark-theme] [class$="_searchBody"],
body[data-ds-dark-theme] [class$="_webBody"],
body[data-ds-dark-theme] [class$="_imageBody"] {
  background: rgba(13, 15, 19, 0.55) !important;
  /* GPU 优化：代码块数量多；强度跟随设置面板 */
  backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  -webkit-backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  box-shadow: inset 0 0 0 1px hsla(0, 0%, 100%, 0.08) !important;
}

/* ============ 工具调用行统一透明与悬浮交互（彻底消除 Bash 等黑框框）============ */
body[data-ds-dark-theme] .CY-8Ka_card,
body[data-ds-dark-theme] .o3BgMG_root,
body[data-ds-dark-theme] .ztWv_q_callRow,
body[data-ds-dark-theme] .EvIC1a_callRow {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

body[data-ds-dark-theme] .CY-8Ka_root,
body[data-ds-dark-theme] .o3BgMG_row {
  background: transparent !important;
  border-radius: 6px !important;
  transition: background 0.15s ease !important;
}
body[data-ds-dark-theme] .CY-8Ka_root:hover,
body[data-ds-dark-theme] .o3BgMG_row:hover {
  background: rgba(255, 255, 255, 0.05) !important;
}

/* 展开后的终端与输出卡片（保持深邃毛玻璃） */
body[data-ds-dark-theme] .CY-8Ka_terminal,
body[data-ds-dark-theme] .CY-8Ka_ioCard,
body[data-ds-dark-theme] .o3BgMG_ioCard {
  background: rgba(13, 15, 19, 0.65) !important;
  /* GPU 优化：终端/输出卡片，强度跟随设置面板 */
  backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  -webkit-backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  border: 1px solid hsla(0, 0%, 100%, 0.08) !important;
  border-radius: 10px !important;
  box-shadow: inset 0 0 0 1px hsla(0, 0%, 100%, 0.06), 0 4px 16px rgba(0, 0, 0, 0.25) !important;
}

/* ============ Thinking Orbs (orbs.jakubantalik.com 移植) ============ */
/* Orb 指示器本体（插件自建元素）两主题通用；状态栏深色适配仅深色主题生效，
   浅色主题保留官方原版状态文本。 */

.dsh-thinking-orb-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 8px;
  flex: none;
  vertical-align: middle;
  font-size: 14px;
  -webkit-text-fill-color: initial !important;
  transition: filter 0.25s ease;
  filter: drop-shadow(0 0 6px rgba(59, 130, 246, 0.7));
}
.dsh-thinking-orb-wrap[data-state="searching"] { filter: drop-shadow(0 0 7px rgba(59, 130, 246, 0.85)); }
.dsh-thinking-orb-wrap[data-state="solving"] { filter: drop-shadow(0 0 7px rgba(52, 211, 153, 0.85)); }
.dsh-thinking-orb-wrap[data-state="listening"] { filter: drop-shadow(0 0 7px rgba(56, 189, 248, 0.85)); }
.dsh-thinking-orb-wrap[data-state="connecting"] { filter: drop-shadow(0 0 7px rgba(168, 85, 247, 0.9)); }
.dsh-thinking-orb-wrap[data-state="weaving"] { filter: drop-shadow(0 0 7px rgba(236, 72, 153, 0.9)); }
.dsh-thinking-orb-wrap[data-state="composing"] { filter: drop-shadow(0 0 7px rgba(251, 146, 60, 0.9)); }
.dsh-thinking-orb-wrap[data-state="breathing"] { filter: drop-shadow(0 0 7px rgba(255, 122, 41, 0.9)); }
.dsh-thinking-orb-wrap[data-state="shaping"] { filter: drop-shadow(0 0 7px rgba(96, 165, 250, 0.85)); }
.dsh-thinking-orb-wrap[data-state="working"] { filter: drop-shadow(0 0 7px rgba(59, 130, 246, 0.8)); }
.dsh-thinking-orb-wrap[data-waiting] { filter: drop-shadow(0 0 6px rgba(148, 163, 184, 0.65)) !important; opacity: 0.92; }
.dsh-thinking-orb-wrap[data-planning],
[data-plan-mode="1"] .dsh-thinking-orb-wrap {
  filter: drop-shadow(0 0 8px rgba(255, 122, 41, 0.95)) !important;
}

.dsh-thinking-orb-canvas {
  width: 20px;
  height: 20px;
  display: block;
}

/* ---------- 以下状态栏深色适配仅深色主题生效 ---------- */

/* 隐藏原生直接裸文本，防止 React Virtual DOM 冲突 */
body[data-ds-dark-theme] .EvIC1a_turnStatus,
body[data-ds-dark-theme] [role="status"][aria-live="polite"].EvIC1a_turnStatus {
  font-size: 0 !important;
}

body[data-ds-dark-theme] .dsh-turn-status-text {
  font-size: 14px !important;
  line-height: 24px !important;
  font-weight: 500 !important;
  display: inline-block !important;
  vertical-align: middle !important;
  color: var(--dsw-static-deepseek-500, #1d6bf3);
  -webkit-text-fill-color: var(--dsw-static-deepseek-500, #1d6bf3);
}

body[data-ds-dark-theme] .EvIC1a_turnStatus {
  display: inline-flex !important;
  align-items: center !important;
  font-weight: 500 !important;
  font-size: 0 !important;
  line-height: 24px !important;
  filter: drop-shadow(0 0 10px rgba(77, 139, 245, 0.45)) !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 4px 0 !important;
}

body[data-ds-dark-theme] .dsh-turn-status-text {
  display: inline-block !important;
  background: linear-gradient(90deg, #4d8bf5 0%, #60a5fa 35%, #ffffff 50%, #60a5fa 65%, #4d8bf5 100%) !important;
  background-size: 250% 100% !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  color: transparent !important;
  animation: 1.8s linear infinite dsh-beam-orbs-turn-status-shimmer !important;
}

/* 流光关键帧：background-size 为 250% 100%，200% -> -300% 恰好平移整数个平铺周期，形成无缝循环 */
@keyframes dsh-beam-orbs-turn-status-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -300% 0; }
}

body[data-ds-dark-theme] .EvIC1a_turnStatusClock,
body[data-ds-dark-theme] [class*="turnStatusClock"] {
  font-size: 12px !important;
  display: inline-block !important;
  vertical-align: middle !important;
}

body[data-ds-dark-theme] .EvIC1a_turnStatusClock {
  font-size: 12px !important;
  font-variant-numeric: tabular-nums !important;
  color: rgba(255, 255, 255, 0.6) !important;
  -webkit-text-fill-color: rgba(255, 255, 255, 0.6) !important;
  margin-left: 8px !important;
  font-weight: 400 !important;
  filter: none !important;
}

body[data-ds-dark-theme] [data-plan-mode="1"] .EvIC1a_turnStatus,
body[data-ds-dark-theme] .EvIC1a_turnStatus[data-planning] {
  filter: drop-shadow(0 0 10px rgba(255, 122, 41, 0.5)) !important;
}

body[data-ds-dark-theme] [data-plan-mode="1"] .dsh-turn-status-text,
body[data-ds-dark-theme] .EvIC1a_turnStatus[data-planning] .dsh-turn-status-text {
  background: linear-gradient(90deg, #ff7a29 0%, #ff9d42 35%, #fff1d6 50%, #ff9d42 65%, #ff7a29 100%) !important;
  background-size: 250% 100% !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  color: transparent !important;
}

/* ---------- 无障碍降级：不支持 background-clip: text 时恢复实色，避免文字全透明 ---------- */

@supports not ((-webkit-background-clip: text) or (background-clip: text)) {
  body[data-ds-dark-theme] .dsh-turn-status-text {
    background: none !important;
    animation: none !important;
    color: #7ea6ff !important;
    -webkit-text-fill-color: initial !important;
  }

  /* 计划态同步降级为实色橙色，渐变整块填充不会透在实色字后 */
  body[data-ds-dark-theme] [data-plan-mode="1"] .dsh-turn-status-text,
  body[data-ds-dark-theme] .EvIC1a_turnStatus[data-planning] .dsh-turn-status-text {
    background: none !important;
    animation: none !important;
    color: #ff7a29 !important;
    -webkit-text-fill-color: #ff7a29 !important;
  }
}

/* ---------- 无障碍适配：prefers-reduced-motion 下静态化流光，保证文字始终可读 ---------- */

@media (prefers-reduced-motion: reduce) {
  body[data-ds-dark-theme] .dsh-turn-status-text {
    animation: none !important;
    background: none !important;
    color: #7ea6ff !important;
    -webkit-text-fill-color: #7ea6ff !important;
  }

  body[data-ds-dark-theme] [data-plan-mode="1"] .dsh-turn-status-text,
  body[data-ds-dark-theme] .EvIC1a_turnStatus[data-planning] .dsh-turn-status-text {
    color: #ff7a29 !important;
    -webkit-text-fill-color: #ff7a29 !important;
  }
}

/* ============ 计划待审框 (Plan Review Card)：仅深色主题生效 ============
   .LVzXQa_card = dsh-client-ui-user-questions/PlanReviewPanel.module.css 的真实计划待审卡
   （0.1.3-alpha.2 与 0.1.5-rc.1 实测均在）。
   原 [data-slot="plan-review"] 在两版均非合法槽位键（从未生效过的历史死选择器），已删除。
   注意：计划待审卡没有独立槽位——它经 conversation.composer 链按 pendingInteraction 选中渲染，
   故不可用 [data-slot="conversation.input.plan"]：后者是 dsh-client-ui-plan 注册的「输入栏 plan
   开关 chip」，只要有会话就存在（与计划待审无关），套用会让橙色计划样式常驻输入栏。 */
body[data-ds-dark-theme] .LVzXQa_card {
  background: rgba(13, 15, 19, 0.68) !important;
  backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  -webkit-backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  border: 1px solid rgba(255, 150, 40, 0.25) !important;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255, 150, 40, 0.15) !important;
}
body[data-ds-dark-theme] .LVzXQa_strip {
  background: rgba(255, 140, 40, 0.12) !important;
  color: #ff9d42 !important;
}
body[data-ds-dark-theme] .LVzXQa_dot {
  background: #ff7a29 !important;
  box-shadow: 0 0 8px rgba(255, 122, 41, 0.8) !important;
}

/* ============ 任务清单框 (Todo List Dock & Panel) — Pulse 官方风格 ============ */
/* 仅深色主题生效；浅色主题保持官方原版任务清单 */

/* 1. 容器卡片材质（Card Container） */
body[data-ds-dark-theme] [data-testid="todo-panel"],
body[data-ds-dark-theme] [data-slot="conversation.input.dock"] section,
body[data-ds-dark-theme] .lXshSW_root,
body[data-ds-dark-theme] ._7yHdaG_panel,
body[data-ds-dark-theme] [data-slot="conversation.input.dock"] ._7yHdaG_panel,
body[data-ds-dark-theme] [data-slot="conversation.input.dock"] > div > section {
  position: relative !important;
  background: rgba(29, 29, 29, 0.78) !important;
  backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  -webkit-backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  border: none !important;
  border-radius: 16px !important;
  box-shadow: inset 0 0 0 1px rgba(44, 47, 54, 0.52), inset 0 0 50px 0 rgba(255, 255, 255, 0.02), 0 8px 32px rgba(0, 0, 0, 0.35) !important;
  margin-bottom: 8px !important;
  overflow: visible !important;
  isolation: isolate !important;
  box-sizing: border-box !important;
  transition: box-shadow 0.3s ease, background 0.3s ease !important;
}

body[data-ds-dark-theme] [data-slot="conversation.input.dock"] {
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
}

body[data-ds-dark-theme] ._7yHdaG_panel:after {
  display: none !important;
  border: none !important;
}

body[data-ds-dark-theme] .lXshSW_body {
  position: relative !important;
  z-index: 4 !important;
  padding: 14px 18px !important;
  gap: 12px !important;
  box-sizing: border-box !important;
}

body[data-ds-dark-theme] .lXshSW_header {
  padding: 0 !important;
  gap: 10px !important;
  background: transparent !important;
  border: none !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  width: 100% !important;
}

body[data-ds-dark-theme] ._7yHdaG_header {
  padding: 10px 14px !important;
  gap: 10px !important;
  border-radius: 12px !important;
}

body[data-ds-dark-theme] ._7yHdaG_header:hover,
body[data-ds-dark-theme] .lXshSW_header:hover {
  background: transparent !important;
}

body[data-ds-dark-theme] .lXshSW_lead,
body[data-ds-dark-theme] ._7yHdaG_lead {
  color: #858585 !important;
  transition: color 0.15s ease !important;
}

body[data-ds-dark-theme] .lXshSW_header:hover .lXshSW_lead,
body[data-ds-dark-theme] ._7yHdaG_header:hover ._7yHdaG_lead {
  color: #ededed !important;
}

body[data-ds-dark-theme] .lXshSW_chevron,
body[data-ds-dark-theme] ._7yHdaG_chevron {
  color: #858585 !important;
  transition: color 0.15s ease, transform 0.2s ease !important;
}

body[data-ds-dark-theme] .lXshSW_header:hover .lXshSW_chevron,
body[data-ds-dark-theme] ._7yHdaG_header:hover ._7yHdaG_chevron {
  color: #ededed !important;
}

/* 2. 标题与状态文字流光（Text Shimmer） */
body[data-ds-dark-theme] .lXshSW_title {
  font-size: 13px !important;
  font-weight: 600 !important;
  line-height: 20px !important;
  background: linear-gradient(90deg, transparent 0%, transparent 40%, #ffffff 50%, transparent 60%, transparent 100%), #ededed !important;
  background-size: 400% 100%, 100% 100% !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  color: transparent !important;
  animation: dsh-pulse-shimmer 2.4s linear infinite !important;
  display: inline-block !important;
}

body[data-ds-dark-theme] .lXshSW_progress,
body[data-ds-dark-theme] ._7yHdaG_count,
body[data-ds-dark-theme] [data-testid="todo-panel"] [class*="progress"],
body[data-ds-dark-theme] [data-testid="todo-panel"] [class*="title"] {
  font-size: 13px !important;
  font-weight: 400 !important;
  line-height: 20px !important;
  background: linear-gradient(90deg, transparent 0%, transparent 40%, #ededed 50%, transparent 60%, transparent 100%), #858585 !important;
  background-size: 400% 100%, 100% 100% !important;
  -webkit-background-clip: text !important;
  background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  color: transparent !important;
  animation: dsh-pulse-shimmer 2.4s linear infinite !important;
  display: inline-block !important;
}

@keyframes dsh-pulse-shimmer {
  0% {
    background-position: 100% 0px, 0 0;
  }
  100% {
    background-position: 0% 0px, 0 0;
  }
}

/* 3. 任务条目与状态指示器（Task Items & Status Glyphs） */
body[data-ds-dark-theme] .lXshSW_list,
body[data-ds-dark-theme] ._7yHdaG_list {
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
  max-height: 200px !important;
  margin: 0 !important;
  padding: 4px 0 0 0 !important;
  list-style: none !important;
  overflow-y: auto !important;
}

body[data-ds-dark-theme] .lXshSW_item,
body[data-ds-dark-theme] ._7yHdaG_row,
body[data-ds-dark-theme] [data-testid="todo-panel"] li {
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  font-size: 13px !important;
  line-height: 16px !important;
  padding: 4px 6px !important;
  border-radius: 8px !important;
  transition: background 0.15s ease !important;
  background: transparent !important;
  box-sizing: border-box !important;
}

body[data-ds-dark-theme] .lXshSW_item:hover,
body[data-ds-dark-theme] ._7yHdaG_row:hover,
body[data-ds-dark-theme] [data-testid="todo-panel"] li:hover {
  background: rgba(255, 255, 255, 0.04) !important;
}

body[data-ds-dark-theme] .lXshSW_content {
  min-width: 0 !important;
  flex: auto !important;
  transition: color 0.2s ease !important;
}

body[data-ds-dark-theme] .lXshSW_glyph {
  flex: none !important;
  place-items: center !important;
  width: 16px !important;
  height: 16px !important;
  display: grid !important;
  transition: filter 0.25s ease, color 0.25s ease !important;
}

/* 进行中状态（in_progress） */
body[data-ds-dark-theme] [data-status="in_progress"] .lXshSW_content,
body[data-ds-dark-theme] .lXshSW_item[data-status="in_progress"] .lXshSW_content,
body[data-ds-dark-theme] [data-testid="todo-panel"] [data-status="in_progress"] [class*="content"] {
  color: #f5f5f5 !important;
  -webkit-text-fill-color: #f5f5f5 !important;
  font-weight: 500 !important;
}

body[data-ds-dark-theme] [data-status="in_progress"] .lXshSW_glyph,
body[data-ds-dark-theme] .lXshSW_glyphProgress,
body[data-ds-dark-theme] [data-testid="todo-panel"] [data-status="in_progress"] [class*="glyph"] {
  color: #38bdf8 !important;
  filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.65)) !important;
  animation: dsh-task-spin 2s linear infinite !important;
  transform-origin: center center !important;
}

body[data-ds-dark-theme] [data-status="in_progress"] svg circle,
body[data-ds-dark-theme] .lXshSW_glyphProgress circle {
  stroke-dasharray: 3 3 !important;
  stroke: #38bdf8 !important;
}

@keyframes dsh-task-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 已完成状态（completed） */
body[data-ds-dark-theme] [data-status="completed"] .lXshSW_content,
body[data-ds-dark-theme] .lXshSW_item[data-status="completed"] .lXshSW_content,
body[data-ds-dark-theme] [data-testid="todo-panel"] [data-status="completed"] [class*="content"] {
  color: #686868 !important;
  -webkit-text-fill-color: #686868 !important;
  font-weight: 400 !important;
}

body[data-ds-dark-theme] [data-status="completed"] .lXshSW_glyph,
body[data-ds-dark-theme] .lXshSW_glyphCompleted,
body[data-ds-dark-theme] [data-testid="todo-panel"] [data-status="completed"] [class*="glyph"] {
  color: #34d399 !important;
  filter: drop-shadow(0 0 4px rgba(52, 211, 153, 0.35)) !important;
  animation: none !important;
}

body[data-ds-dark-theme] [data-status="completed"] svg circle,
body[data-ds-dark-theme] [data-status="completed"] svg path,
body[data-ds-dark-theme] .lXshSW_glyphCompleted circle,
body[data-ds-dark-theme] .lXshSW_glyphCompleted path {
  color: #34d399 !important;
  stroke: #34d399 !important;
}

/* 待处理状态（pending） */
body[data-ds-dark-theme] [data-status="pending"] .lXshSW_content,
body[data-ds-dark-theme] .lXshSW_item[data-status="pending"] .lXshSW_content,
body[data-ds-dark-theme] [data-testid="todo-panel"] [data-status="pending"] [class*="content"] {
  color: #858585 !important;
  -webkit-text-fill-color: #858585 !important;
  font-weight: 400 !important;
}

body[data-ds-dark-theme] [data-status="pending"] .lXshSW_glyph,
body[data-ds-dark-theme] .lXshSW_glyphPending,
body[data-ds-dark-theme] [data-testid="todo-panel"] [data-status="pending"] [class*="glyph"] {
  color: #686868 !important;
  filter: none !important;
  opacity: 0.7 !important;
  animation: none !important;
}

body[data-ds-dark-theme] [data-status="pending"] svg circle,
body[data-ds-dark-theme] .lXshSW_glyphPending circle {
  stroke-dasharray: 2.4 2.4 !important;
  stroke: #686868 !important;
}

/* 4. Border Beam Pulse 边缘脉冲光束集成（仅深色主题） */
body[data-ds-dark-theme] [data-beam="dsh-todo"] {
  position: relative !important;
  border-radius: 16px !important;
  overflow: visible !important;
  isolation: isolate !important;
}

body[data-ds-dark-theme] [data-beam="dsh-todo"]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 15px;
  padding: 1px;
  clip-path: inset(0 round 16px);
  background:
    radial-gradient(ellipse 70px 40px at 33% -7.4%, rgb(255, 50, 100), transparent),
    radial-gradient(ellipse 60px 35px at 12% -5%, rgb(40, 140, 255), transparent),
    radial-gradient(ellipse 40px 70px at 2.1% 68.3%, rgb(50, 200, 80), transparent),
    radial-gradient(ellipse 20px 35px at 2.1% 68.3%, rgb(30, 185, 170), transparent),
    radial-gradient(ellipse 180px 32px at 74.4% 100%, rgb(100, 70, 255), transparent),
    radial-gradient(ellipse 85px 26px at 55% 100%, rgb(40, 140, 255), transparent),
    radial-gradient(ellipse 74px 32px at 93.9% 0%, rgb(255, 120, 40), transparent),
    radial-gradient(ellipse 26px 42px at 100% 27.1%, rgb(240, 50, 180), transparent),
    radial-gradient(ellipse 52px 48px at 100% 27.1%, rgb(180, 40, 240), transparent);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
  z-index: 2;
  opacity: 0.35;
  transition: opacity 0.4s ease;
  animation: none;
}

body[data-ds-dark-theme] [data-beam="dsh-todo"]::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 16px;
  background:
    radial-gradient(ellipse 63px 36px at 33% -7.4%, rgba(255, 50, 100, 0.4), transparent),
    radial-gradient(ellipse 54px 32px at 12% -5%, rgba(40, 140, 255, 0.4), transparent),
    radial-gradient(ellipse 36px 63px at 2.1% 68.3%, rgba(50, 200, 80, 0.4), transparent),
    radial-gradient(ellipse 18px 32px at 2.1% 68.3%, rgba(30, 185, 170, 0.4), transparent),
    radial-gradient(ellipse 162px 29px at 74.4% 100%, rgba(100, 70, 255, 0.4), transparent),
    radial-gradient(ellipse 77px 23px at 55% 100%, rgba(40, 140, 255, 0.4), transparent),
    radial-gradient(ellipse 67px 29px at 93.9% 0%, rgba(255, 120, 40, 0.4), transparent),
    radial-gradient(ellipse 23px 38px at 100% 27.1%, rgba(240, 50, 180, 0.4), transparent),
    radial-gradient(ellipse 47px 43px at 100% 27.1%, rgba(180, 40, 240, 0.4), transparent);
  box-shadow: inset 0 0 10px 1px rgba(255, 255, 255, 0.18);
  -webkit-mask-image:
    linear-gradient(white, transparent 24px, transparent calc(100% - 24px), white),
    linear-gradient(to right, white, transparent 24px, transparent calc(100% - 24px), white);
  -webkit-mask-composite: source-over;
  mask-image:
    linear-gradient(white, transparent 24px, transparent calc(100% - 24px), white),
    linear-gradient(to right, white, transparent 24px, transparent calc(100% - 24px), white);
  mask-composite: add;
  pointer-events: none;
  z-index: 1;
  opacity: 0.28;
  clip-path: inset(0 round 16px);
  transition: opacity 0.4s ease;
  animation: none;
}

body[data-ds-dark-theme] [data-beam="dsh-todo"] [data-beam-bloom] {
  display: block;
  position: absolute;
  inset: -1px;
  border-radius: 16px;
  clip-path: inset(0 round 16px);
  background:
    radial-gradient(ellipse 70px 40px at 33% -7.4%, rgb(255, 50, 100), transparent),
    radial-gradient(ellipse 60px 35px at 12% -5%, rgb(40, 140, 255), transparent),
    radial-gradient(ellipse 40px 70px at 2.1% 68.3%, rgb(50, 200, 80), transparent),
    radial-gradient(ellipse 20px 35px at 2.1% 68.3%, rgb(30, 185, 170), transparent),
    radial-gradient(ellipse 180px 32px at 74.4% 100%, rgb(100, 70, 255), transparent),
    radial-gradient(ellipse 85px 26px at 55% 100%, rgb(40, 140, 255), transparent),
    radial-gradient(ellipse 74px 32px at 93.9% 0%, rgb(255, 120, 40), transparent),
    radial-gradient(ellipse 26px 42px at 100% 27.1%, rgb(240, 50, 180), transparent),
    radial-gradient(ellipse 52px 48px at 100% 27.1%, rgb(180, 40, 240), transparent);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  padding: 1px;
  filter: blur(8px) brightness(1.2) saturate(1.2);
  pointer-events: none;
  z-index: 3;
  opacity: 0.15;
  transition: opacity 0.4s ease;
  animation: none;
}

/* Active Pulse State: 存在进行中任务或运行状态时的灵动脉冲呼吸 */
body[data-ds-dark-theme] [data-beam="dsh-todo"][data-active]::after,
body[data-ds-dark-theme] [data-beam="dsh-todo"][data-pulse-active]::after {
  opacity: 0.85;
  animation: beam-pulse-hue-shift 12s ease-in-out infinite, dsh-pulse-breathe 2.8s ease-in-out infinite;
}

body[data-ds-dark-theme] [data-beam="dsh-todo"][data-active]::before,
body[data-ds-dark-theme] [data-beam="dsh-todo"][data-pulse-active]::before {
  opacity: 0.7;
  animation: beam-pulse-hue-shift 12s ease-in-out infinite, dsh-pulse-inner-breathe 2.8s ease-in-out infinite;
}

body[data-ds-dark-theme] [data-beam="dsh-todo"][data-active] [data-beam-bloom],
body[data-ds-dark-theme] [data-beam="dsh-todo"][data-pulse-active] [data-beam-bloom] {
  opacity: 0.55;
  animation: beam-pulse-hue-shift 12s ease-in-out infinite, dsh-pulse-bloom-breathe 2.8s ease-in-out infinite;
}

@keyframes beam-pulse-hue-shift {
  0% {
    filter: hue-rotate(-30deg) brightness(1.2) saturate(1.2);
  }
  50% {
    filter: hue-rotate(30deg) brightness(1.2) saturate(1.2);
  }
  100% {
    filter: hue-rotate(-30deg) brightness(1.2) saturate(1.2);
  }
}

@keyframes dsh-pulse-breathe {
  0%, 100% {
    opacity: 0.45;
    filter: hue-rotate(-30deg) brightness(1.15) saturate(1.2);
  }
  50% {
    opacity: 0.95;
    filter: hue-rotate(15deg) brightness(1.45) saturate(1.4);
  }
}

@keyframes dsh-pulse-inner-breathe {
  0%, 100% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.85;
  }
}

@keyframes dsh-pulse-bloom-breathe {
  0%, 100% {
    opacity: 0.25;
    filter: blur(6px) brightness(1.1);
  }
  50% {
    opacity: 0.65;
    filter: blur(10px) brightness(1.4);
  }
}

@media (prefers-reduced-motion: reduce) {
  body[data-ds-dark-theme] [data-beam="dsh-todo"]::after,
  body[data-ds-dark-theme] [data-beam="dsh-todo"]::before,
  body[data-ds-dark-theme] [data-beam="dsh-todo"] [data-beam-bloom],
  body[data-ds-dark-theme] .lXshSW_title,
  body[data-ds-dark-theme] .lXshSW_progress,
  body[data-ds-dark-theme] ._7yHdaG_count,
  body[data-ds-dark-theme] [data-status="in_progress"] .lXshSW_glyph,
  body[data-ds-dark-theme] .lXshSW_glyphProgress {
    animation: none !important;
  }
}

/* ============ 提问框 (Ask User Question Card)：仅深色主题生效 ============
   .Mbwy4a_card = dsh-client-ui-user-questions/QuestionComposer.module.css 的真实提问卡
   （0.1.3-alpha.2 与 0.1.5-rc.1 实测均在）。
   原 [data-slot="user-questions"] 在两版均非合法槽位键（从未生效过的历史死选择器），已删除。
   提问卡同样经 conversation.composer 链渲染，没有独立槽位，故只按真实类名匹配。 */
body[data-ds-dark-theme] .Mbwy4a_card {
  background: rgba(13, 15, 19, 0.68) !important;
  backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  -webkit-backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  border: 1px solid hsla(0, 0%, 100%, 0.1) !important;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.4), inset 0 0 0 1px hsla(0, 0%, 100%, 0.08) !important;
}

/* ============ 审批卡片：仅深色主题生效 ============
   .mna1RW_card = dsh-client-ui-approval/ApprovalPanel.module.css 的真实审批卡
   （0.1.3-alpha.2 与 0.1.5-rc.1 实测均在）。修正两处错位：
   1) 原 .VOzbGW_panel 实为 dsh-client-ui-settings-general 的「设置弹窗面板」——原规则把审批样式
      套到了设置弹窗上，现移除（设置弹窗恢复官方原版外观）；
   2) 原 [data-slot="approval"] 在两版均非合法槽位键（从未生效过的历史死选择器）。
   新增 [data-slot="conversation.approval.detail"]（0.1.5-rc.1 合法槽位，为审批卡内部的 detail 插槽）。 */
body[data-ds-dark-theme] .mna1RW_card,
body[data-ds-dark-theme] [data-slot="conversation.approval.detail"] > div {
  background: rgba(13, 15, 19, 0.75) !important;
  backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  -webkit-backdrop-filter: blur(var(--dsh-bg-blur, 8px)) !important;
  border: 1px solid hsla(0, 0%, 100%, 0.1) !important;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), inset 0 0 0 1px hsla(0, 0%, 100%, 0.08) !important;
  border-radius: 16px !important;
}

/* ============ 发送按钮与交互微动效：仅深色主题生效 ============ */
body[data-ds-dark-theme] .uV2eYG_primary {
  background: linear-gradient(135deg, #2563eb, #3b82f6) !important;
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.35) !important;
  border-radius: 999px !important;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), filter 0.2s ease, box-shadow 0.2s ease !important;
}
body[data-ds-dark-theme] .uV2eYG_primary:hover:not(:disabled) {
  transform: scale(1.05) !important;
  filter: brightness(1.15) !important;
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.5) !important;
}
body[data-ds-dark-theme] .uV2eYG_primary:active:not(:disabled) {
  transform: scale(0.95) !important;
}
body[data-ds-dark-theme] [data-composer-card="true"][data-planning] .uV2eYG_primary,
body[data-ds-dark-theme] .uV2eYG_card[data-planning] .uV2eYG_primary {
  background: linear-gradient(135deg, #ff5a36, #ff9500) !important;
  box-shadow: 0 2px 12px rgba(255, 90, 54, 0.45) !important;
}

/* ============ 玻璃开关（body.dsh-bg-no-glass）：移除 backdrop blur，垫实底色保可读性 ============ */
/* 仅深色主题生效；浅色主题始终为官方原版卡片 */
body[data-ds-dark-theme].dsh-bg-no-glass .pI_x6G_sidebarCol::before {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: transparent !important;
}
body[data-ds-dark-theme].dsh-bg-no-glass .pI_x6G_sidebarCol {
  background: rgba(13, 15, 19, 0.92) !important;
}
body[data-ds-dark-theme].dsh-bg-no-glass .uV2eYG_card,
body[data-ds-dark-theme].dsh-bg-no-glass [data-composer-card="true"],
/* 目标与 02-bubbles.css 的玻璃化目标保持一致（原 .gdEzaW_bubble / _block_* / _copyButton_* /
   _bannerWrap_* / .VOzbGW_panel 在两版 DSH 中均不存在；.VOzbGW_panel 实为设置弹窗面板，
   02-bubbles.css 已不再对其施加玻璃，此处同步移除） */
body[data-ds-dark-theme].dsh-bg-no-glass .Sixlwa_bubble,
body[data-ds-dark-theme].dsh-bg-no-glass .o3BgMG_terminalBody,
body[data-ds-dark-theme].dsh-bg-no-glass .o3BgMG_codeBody,
body[data-ds-dark-theme].dsh-bg-no-glass .o3BgMG_diffBody,
body[data-ds-dark-theme].dsh-bg-no-glass .o3BgMG_readBody,
body[data-ds-dark-theme].dsh-bg-no-glass .o3BgMG_searchBody,
body[data-ds-dark-theme].dsh-bg-no-glass .o3BgMG_webBody,
body[data-ds-dark-theme].dsh-bg-no-glass .o3BgMG_imageBody,
body[data-ds-dark-theme].dsh-bg-no-glass .XrJvXW_body,
body[data-ds-dark-theme].dsh-bg-no-glass [class$="_bubble"],
body[data-ds-dark-theme].dsh-bg-no-glass [class$="_codeBody"],
body[data-ds-dark-theme].dsh-bg-no-glass [class$="_terminalBody"],
body[data-ds-dark-theme].dsh-bg-no-glass [class$="_diffBody"],
body[data-ds-dark-theme].dsh-bg-no-glass [class$="_readBody"],
body[data-ds-dark-theme].dsh-bg-no-glass [class$="_searchBody"],
body[data-ds-dark-theme].dsh-bg-no-glass [class$="_webBody"],
body[data-ds-dark-theme].dsh-bg-no-glass [class$="_imageBody"],
body[data-ds-dark-theme].dsh-bg-no-glass .LVzXQa_card,
body[data-ds-dark-theme].dsh-bg-no-glass .Mbwy4a_card,
body[data-ds-dark-theme].dsh-bg-no-glass .mna1RW_card,
body[data-ds-dark-theme].dsh-bg-no-glass .CY-8Ka_ioCard,
body[data-ds-dark-theme].dsh-bg-no-glass .o3BgMG_ioCard {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: rgba(13, 15, 19, 0.92) !important;
}

body[data-ds-dark-theme].dsh-bg-no-glass [data-testid="todo-panel"],
body[data-ds-dark-theme].dsh-bg-no-glass [data-slot="conversation.input.dock"] section,
body[data-ds-dark-theme].dsh-bg-no-glass .lXshSW_root,
body[data-ds-dark-theme].dsh-bg-no-glass ._7yHdaG_panel {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: #1d1d1d !important;
}

`;
      document.head.appendChild(styleTag);
    }

/* ===================== beam-css.js ===================== */
/* ===================================================================== *
 * src/beam-css.js — 工厂级片段（无副作用：纯常量与纯函数）
 *   Border Beam 调色板 / BEAM_* 参数 / CSS 生成函数（buildBeamCSS 等），
 *   被 src/beam.js（initBeam）直接调用。拼接时置于工厂闭包顶层。
 * ===================================================================== */
/* ===================================================================== *
 * Border Beam (beam.jakubantalik.com) — ported for DSH composer
 * Copyright (c) Jakub Antalik, MIT — https://github.com/Jakubantalik/Libraries
 * Variant: md conic-gradient / colorful, mono, sunset, duration 2.45s, 0.8x
 * ===================================================================== */
  var BEAM_ID = "dsh-composer";
  var BEAM_DURATION = 2.45; // 0.8x md full border
  var BEAM_HUE_RANGE = 30;
  var BEAM_BRIGHTNESS = 1.3;
  var BEAM_CFG_DARK = { stroke: 0.26, inner: 0.42, bloom: 0.24, innerShadow: "rgba(255, 255, 255, 0.27)" };
  var BEAM_CFG_LIGHT = { stroke: 0.12, inner: 0.26, bloom: 0.34, innerShadow: "rgba(0, 0, 0, 0.14)" };

  var colorPalettes = {
    colorful: {
      border: [
        { color: "rgb(255, 50, 100)", pos: "33% -7.4%", size: "70px 40px" },
        { color: "rgb(40, 140, 255)", pos: "12% -5%", size: "60px 35px" },
        { color: "rgb(50, 200, 80)", pos: "2.1% 68.3%", size: "40px 70px" },
        { color: "rgb(30, 185, 170)", pos: "2.1% 68.3%", size: "20px 35px" },
        { color: "rgb(100, 70, 255)", pos: "74.4% 100%", size: "180px 32px" },
        { color: "rgb(40, 140, 255)", pos: "55% 100%", size: "85px 26px" },
        { color: "rgb(255, 120, 40)", pos: "93.9% 0%", size: "74px 32px" },
        { color: "rgb(240, 50, 180)", pos: "100% 27.1%", size: "26px 42px" },
        { color: "rgb(180, 40, 240)", pos: "100% 27.1%", size: "52px 48px" }
      ]
    },
    mono: {
      border: [
        { color: "rgb(180, 180, 180)", pos: "33% -7.4%", size: "70px 40px" },
        { color: "rgb(140, 140, 140)", pos: "12% -5%", size: "60px 35px" },
        { color: "rgb(160, 160, 160)", pos: "2.1% 68.3%", size: "40px 70px" },
        { color: "rgb(130, 130, 130)", pos: "2.1% 68.3%", size: "20px 35px" },
        { color: "rgb(170, 170, 170)", pos: "74.4% 100%", size: "180px 32px" },
        { color: "rgb(150, 150, 150)", pos: "55% 100%", size: "85px 26px" },
        { color: "rgb(190, 190, 190)", pos: "93.9% 0%", size: "74px 32px" },
        { color: "rgb(145, 145, 145)", pos: "100% 27.1%", size: "26px 42px" },
        { color: "rgb(165, 165, 165)", pos: "100% 27.1%", size: "52px 48px" }
      ]
    },
    sunset: {
      border: [
        { color: "rgb(255, 80, 50)", pos: "33% -7.4%", size: "70px 40px" },
        { color: "rgb(255, 160, 40)", pos: "12% -5%", size: "60px 35px" },
        { color: "rgb(255, 120, 60)", pos: "2.1% 68.3%", size: "40px 70px" },
        { color: "rgb(255, 200, 50)", pos: "2.1% 68.3%", size: "20px 35px" },
        { color: "rgb(255, 100, 80)", pos: "74.4% 100%", size: "180px 32px" },
        { color: "rgb(255, 180, 60)", pos: "55% 100%", size: "85px 26px" },
        { color: "rgb(255, 60, 60)", pos: "93.9% 0%", size: "74px 32px" },
        { color: "rgb(255, 140, 50)", pos: "100% 27.1%", size: "26px 42px" },
        { color: "rgb(255, 90, 70)", pos: "100% 27.1%", size: "52px 48px" }
      ]
    }
  };

  function getColorGradients(variant, isDark, id) {
    var _v = variant || "colorful";
    var pal = (colorPalettes[_v] || colorPalettes.colorful).border;
    return pal.map(function(c) {
      return "radial-gradient(ellipse " + c.size + " at " + c.pos + ", " + c.color + ", transparent)";
    }).join(",\n    ");
  }

  function getInnerGradients(variant, isDark, id) {
    var _v = variant || "colorful";
    var pal = (colorPalettes[_v] || colorPalettes.colorful).border;
    var baseOpacity = _v === "mono" ? 0.225 : 0.45;
    return pal.map(function(c) {
      var rgba = c.color.replace("rgb(", "rgba(").replace(")", ", " + baseOpacity + ")");
      var sz = c.size.split(" ").map(function(s) { return Math.round(parseInt(s) * 0.9) + "px"; }).join(" ");
      return "radial-gradient(ellipse " + sz + " at " + c.pos + ", " + rgba + ", transparent)";
    }).join(",\n    ");
  }

  function buildBeamCSS(id, borderRadius, isDark, variant) {
    variant = variant || "colorful";
    var cfg = isDark ? BEAM_CFG_DARK : BEAM_CFG_LIGHT;
    var sat = isDark ? 1.2 : 1.5;
    var innerRadius = Math.max(0, borderRadius - 1);
    var hueAnim = "animation: beam-hue-shift-" + id + " 12s ease-in-out infinite;";
    var hueKeyframes = "@keyframes beam-hue-shift-" + id + " {\n" +
      "  0% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) - " + BEAM_HUE_RANGE + "deg)) brightness(" + BEAM_BRIGHTNESS.toFixed(2) + ") saturate(" + sat.toFixed(2) + "); }\n" +
      "  50% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) + " + BEAM_HUE_RANGE + "deg)) brightness(" + BEAM_BRIGHTNESS.toFixed(2) + ") saturate(" + sat.toFixed(2) + "); }\n" +
      "  100% { filter: hue-rotate(calc(var(--beam-hue-base, 0deg) - " + BEAM_HUE_RANGE + "deg)) brightness(" + BEAM_BRIGHTNESS.toFixed(2) + ") saturate(" + sat.toFixed(2) + "); }\n" +
      "}";

    var whiteGrad = isDark
      ? "conic-gradient(\n" +
        "  from var(--beam-angle-" + id + "),\n" +
        "  transparent 0%, transparent 54%,\n" +
        "  rgba(255, 255, 255, 0.1) 57%,\n" +
        "  rgba(255, 255, 255, 0.3) 60%,\n" +
        "  rgba(255, 255, 255, 0.6) 63%,\n" +
        "  rgba(255, 255, 255, 0.75) 66%,\n" +
        "  rgba(255, 255, 255, 0.6) 69%,\n" +
        "  rgba(255, 255, 255, 0.3) 72%,\n" +
        "  rgba(255, 255, 255, 0.1) 75%,\n" +
        "  transparent 78%, transparent 100%\n" +
        ")"
      : "conic-gradient(\n" +
        "  from var(--beam-angle-" + id + "),\n" +
        "  transparent 0%, transparent 54%,\n" +
        "  rgba(0, 0, 0, 0.08) 57%,\n" +
        "  rgba(0, 0, 0, 0.2) 60%,\n" +
        "  rgba(0, 0, 0, 0.4) 63%,\n" +
        "  rgba(0, 0, 0, 0.55) 66%,\n" +
        "  rgba(0, 0, 0, 0.4) 69%,\n" +
        "  rgba(0, 0, 0, 0.2) 72%,\n" +
        "  rgba(0, 0, 0, 0.08) 75%,\n" +
        "  transparent 78%, transparent 100%\n" +
        ")";

    var colorGrads, innerGrads;
    if (variant === "sunset") {
      colorGrads = "conic-gradient(from var(--beam-angle-" + id + "), transparent 0%, transparent 45%, rgb(255, 60, 20) 50%, rgb(255, 90, 0) 55%, rgb(220, 40, 0) 60%, transparent 65%, transparent 100%)";
      innerGrads = "conic-gradient(from var(--beam-angle-" + id + "), transparent 0%, transparent 45%, rgba(255, 60, 20, 0.6) 50%, rgba(255, 90, 0, 0.5) 55%, transparent 65%)";
    } else {
      colorGrads = getColorGradients(variant, isDark, id);
      innerGrads = getInnerGradients(variant, isDark, id);
    }

    var bloomGrad = isDark
      ? "conic-gradient(\n" +
        "  from var(--beam-angle-" + id + "),\n" +
        "  transparent 0%, transparent 58%,\n" +
        "  rgba(255, 255, 255, 0.03) 62%,\n" +
        "  rgba(255, 255, 255, 0.08) 65%,\n" +
        "  rgba(255, 255, 255, 0.2) 67%,\n" +
        "  rgba(255, 255, 255, 0.45) 69%,\n" +
        "  rgba(255, 255, 255, 0.85) 70%,\n" +
        "  rgba(255, 255, 255, 0.85) 70.5%,\n" +
        "  rgba(255, 255, 255, 0.45) 71.5%,\n" +
        "  rgba(255, 255, 255, 0.2) 73%,\n" +
        "  rgba(255, 255, 255, 0.08) 75%,\n" +
        "  rgba(255, 255, 255, 0.03) 78%,\n" +
        "  transparent 82%\n" +
        ")"
      : "conic-gradient(\n" +
        "  from var(--beam-angle-" + id + "),\n" +
        "  transparent 0%, transparent 58%,\n" +
        "  rgba(0, 0, 0, 0.02) 62%,\n" +
        "  rgba(0, 0, 0, 0.08) 65%,\n" +
        "  rgba(0, 0, 0, 0.2) 67%,\n" +
        "  rgba(0, 0, 0, 0.4) 69%,\n" +
        "  rgba(0, 0, 0, 0.6) 70%,\n" +
        "  rgba(0, 0, 0, 0.6) 70.5%,\n" +
        "  rgba(0, 0, 0, 0.4) 71.5%,\n" +
        "  rgba(0, 0, 0, 0.2) 73%,\n" +
        "  rgba(0, 0, 0, 0.08) 75%,\n" +
        "  rgba(0, 0, 0, 0.02) 78%,\n" +
        "  transparent 82%\n" +
        ")";

    return "@property --beam-angle-" + id + " {\n" +
      "  syntax: \"<angle>\";\n" +
      "  initial-value: 0deg;\n" +
      "  inherits: true;\n" +
      "}\n" +
      "@property --beam-opacity-" + id + " {\n" +
      "  syntax: \"<number>\";\n" +
      "  initial-value: 0;\n" +
      "  inherits: true;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"] {\n" +
      "  position: relative;\n" +
      "  border-radius: " + borderRadius + "px;\n" +
      "  overflow: visible;\n" +
      "  isolation: isolate;\n" +
      "  transition: --beam-strength 0.35s cubic-bezier(0.16, 1, 0.3, 1);\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"]:not([data-active]):not([data-pulse]):hover {\n" +
      "  --beam-strength: 0.22;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-active] {\n" +
      "  animation:\n" +
      "    beam-spin-" + id + " " + BEAM_DURATION + "s linear infinite,\n" +
      "    beam-fade-in-" + id + " 0.6s ease forwards;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-fading] {\n" +
      "  animation:\n" +
      "    beam-spin-" + id + " " + BEAM_DURATION + "s linear infinite,\n" +
      "    beam-fade-out-" + id + " 0.5s ease forwards;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-active]::after,\n" +
      "[data-beam=\"" + id + "\"][data-fading]::after,\n" +
      "[data-beam=\"" + id + "\"][data-typing]::after,\n" +
      "[data-beam=\"" + id + "\"][data-pulse]::after {\n" +
      "  content: \"\";\n" +
      "  position: absolute;\n" +
      "  inset: 0;\n" +
      "  border-radius: " + innerRadius + "px;\n" +
      "  padding: 1px;\n" +
      "  clip-path: inset(0 round " + borderRadius + "px);\n" +
      "  background: " + whiteGrad + ",\n" +
      "    " + colorGrads + ";\n" +
      "  -webkit-mask:\n" +
      "    conic-gradient(\n" +
      "      from var(--beam-angle-" + id + "),\n" +
      "      transparent 0%, transparent 30%,\n" +
      "      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,\n" +
      "      white 52%, white 80%,\n" +
      "      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,\n" +
      "      transparent 95%, transparent 100%\n" +
      "    ),\n" +
      "    linear-gradient(#fff 0 0) content-box,\n" +
      "    linear-gradient(#fff 0 0);\n" +
      "  -webkit-mask-composite: source-in, xor;\n" +
      "  mask:\n" +
      "    conic-gradient(\n" +
      "      from var(--beam-angle-" + id + "),\n" +
      "      transparent 0%, transparent 30%,\n" +
      "      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,\n" +
      "      white 52%, white 80%,\n" +
      "      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,\n" +
      "      transparent 95%, transparent 100%\n" +
      "    ),\n" +
      "    linear-gradient(#fff 0 0) content-box,\n" +
      "    linear-gradient(#fff 0 0);\n" +
      "  mask-composite: intersect, exclude;\n" +
      "  pointer-events: none;\n" +
      "  z-index: 2;\n" +
      "  opacity: calc(var(--beam-opacity-" + id + ") * " + cfg.stroke.toFixed(2) + " * var(--beam-stroke-opacity, 1) * var(--beam-strength, 1));\n" +
      "  " + hueAnim + "\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-active]::before,\n" +
      "[data-beam=\"" + id + "\"][data-fading]::before,\n" +
      "[data-beam=\"" + id + "\"][data-typing]::before,\n" +
      "[data-beam=\"" + id + "\"][data-pulse]::before {\n" +
      "  content: \"\";\n" +
      "  position: absolute;\n" +
      "  inset: 0;\n" +
      "  border-radius: " + borderRadius + "px;\n" +
      "  background: " + innerGrads + ";\n" +
      "  box-shadow: inset 0 0 9px 1px " + cfg.innerShadow + ";\n" +
      "  -webkit-mask-image:\n" +
      "    conic-gradient(\n" +
      "      from var(--beam-angle-" + id + "),\n" +
      "      transparent 0%, transparent 30%,\n" +
      "      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,\n" +
      "      white 52%, white 80%,\n" +
      "      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,\n" +
      "      transparent 95%, transparent 100%\n" +
      "    ),\n" +
      "    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),\n" +
      "    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);\n" +
      "  -webkit-mask-composite: source-in, source-over;\n" +
      "  mask-image:\n" +
      "    conic-gradient(\n" +
      "      from var(--beam-angle-" + id + "),\n" +
      "      transparent 0%, transparent 30%,\n" +
      "      rgba(255, 255, 255, 0.1) 36%, rgba(255, 255, 255, 0.35) 44%,\n" +
      "      white 52%, white 80%,\n" +
      "      rgba(255, 255, 255, 0.35) 86%, rgba(255, 255, 255, 0.1) 92%,\n" +
      "      transparent 95%, transparent 100%\n" +
      "    ),\n" +
      "    linear-gradient(white, transparent 28px, transparent calc(100% - 28px), white),\n" +
      "    linear-gradient(to right, white, transparent 28px, transparent calc(100% - 28px), white);\n" +
      "  mask-composite: intersect, add;\n" +
      "  pointer-events: none;\n" +
      "  z-index: 1;\n" +
      "  opacity: calc(var(--beam-opacity-" + id + ") * " + cfg.inner.toFixed(2) + " * var(--beam-inner-opacity, 1) * var(--beam-strength, 1));\n" +
      "  clip-path: inset(0 round " + borderRadius + "px);\n" +
      "  " + hueAnim + "\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"] [data-beam-bloom] {\n" +
      "  display: none;\n" +
      "  position: absolute;\n" +
      "  inset: 0;\n" +
      "  border-radius: " + innerRadius + "px;\n" +
      "  clip-path: inset(0 round " + borderRadius + "px);\n" +
      "  background: " + bloomGrad + ";\n" +
      "  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);\n" +
      "  -webkit-mask-composite: xor;\n" +
      "  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);\n" +
      "  mask-composite: exclude;\n" +
      "  padding: 1px;\n" +
      "  filter: blur(8px) brightness(" + BEAM_BRIGHTNESS.toFixed(2) + ") saturate(" + sat.toFixed(2) + ");\n" +
      "  pointer-events: none;\n" +
      "  z-index: 3;\n" +
      "  opacity: 0;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-active] [data-beam-bloom],\n" +
      "[data-beam=\"" + id + "\"][data-fading] [data-beam-bloom],\n" +
      "[data-beam=\"" + id + "\"][data-typing] [data-beam-bloom],\n" +
      "[data-beam=\"" + id + "\"][data-pulse] [data-beam-bloom] {\n" +
      "  display: block;\n" +
      "  opacity: calc(var(--beam-opacity-" + id + ") * " + cfg.bloom.toFixed(2) + " * var(--beam-bloom-opacity, 1) * var(--beam-strength, 1));\n" +
      "}\n" +
      "@keyframes beam-spin-" + id + " {\n" +
      "  to { --beam-angle-" + id + ": 360deg; }\n" +
      "}\n" +
      "@keyframes beam-fade-in-" + id + " {\n" +
      "  to { --beam-opacity-" + id + ": 1; }\n" +
      "}\n" +
      "@keyframes beam-fade-out-" + id + " {\n" +
      "  from { --beam-opacity-" + id + ": 1; }\n" +
      "  to { --beam-opacity-" + id + ": 0; }\n" +
      "}\n" +
      hueKeyframes + "\n" +
      "/* Typing edge breathing override (stationary mono beam, no spin/rainbow) */\n" +
      "[data-beam=\"" + id + "\"][data-typing] {\n" +
      "  --beam-opacity-" + id + ": 1;\n" +
      "  animation: none !important;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-typing]::after {\n" +
      "  animation: beam-typing-stroke-breathe 0.45s cubic-bezier(0.16, 1, 0.3, 1) !important;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-typing]::before {\n" +
      "  animation: beam-typing-inner-breathe 0.45s cubic-bezier(0.16, 1, 0.3, 1) !important;\n" +
      "}\n" +
      "[data-beam=\"" + id + "\"][data-typing] [data-beam-bloom] {\n" +
      "  animation: beam-typing-bloom-breathe 0.45s cubic-bezier(0.16, 1, 0.3, 1) !important;\n" +
      "}\n" +
      "@keyframes beam-typing-stroke-breathe {\n" +
      "  0% {\n" +
      "    opacity: 0.35;\n" +
      "    filter: brightness(1);\n" +
      "  }\n" +
      "  30% {\n" +
      "    opacity: 1;\n" +
      "    filter: brightness(1.55);\n" +
      "  }\n" +
      "  100% {\n" +
      "    opacity: 0.55;\n" +
      "    filter: brightness(1.1);\n" +
      "  }\n" +
      "}\n" +
      "@keyframes beam-typing-inner-breathe {\n" +
      "  0% {\n" +
      "    opacity: 0.25;\n" +
      "    filter: brightness(1);\n" +
      "  }\n" +
      "  30% {\n" +
      "    opacity: 0.85;\n" +
      "    filter: brightness(1.4);\n" +
      "  }\n" +
      "  100% {\n" +
      "    opacity: 0.4;\n" +
      "    filter: brightness(1.05);\n" +
      "  }\n" +
      "}\n" +
      "@keyframes beam-typing-bloom-breathe {\n" +
      "  0% {\n" +
      "    opacity: 0.2;\n" +
      "    filter: blur(6px) brightness(1);\n" +
      "  }\n" +
      "  30% {\n" +
      "    opacity: 0.95;\n" +
      "    filter: blur(10px) brightness(1.6);\n" +
      "  }\n" +
      "  100% {\n" +
      "    opacity: 0.35;\n" +
      "    filter: blur(7px) brightness(1.15);\n" +
      "  }\n" +
      "}\n" +
      "/* Completion pulse flash */\n" +
      "[data-beam=\"" + id + "\"][data-pulse]::after,\n" +
      "[data-beam=\"" + id + "\"][data-pulse]::before,\n" +
      "[data-beam=\"" + id + "\"][data-pulse] [data-beam-bloom] {\n" +
      "  animation: beam-pulse-flash 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;\n" +
      "}\n" +
      "@keyframes beam-pulse-flash {\n" +
      "  0% {\n" +
      "    opacity: 1;\n" +
      "    filter: brightness(1.6) saturate(1.4);\n" +
      "    transform: scale(1);\n" +
      "  }\n" +
      "  30% {\n" +
      "    opacity: 1;\n" +
      "    filter: brightness(1.8) saturate(1.6);\n" +
      "    transform: scale(1.015);\n" +
      "  }\n" +
      "  100% {\n" +
      "    opacity: 0;\n" +
      "    filter: brightness(1) saturate(1);\n" +
      "    transform: scale(1);\n" +
      "  }\n" +
      "}\n" +
      "/* Paused rule */\n" +
      "[data-beam=\"" + id + "\"][data-paused],\n" +
      "[data-beam=\"" + id + "\"][data-paused]::after,\n" +
      "[data-beam=\"" + id + "\"][data-paused]::before,\n" +
      "[data-beam=\"" + id + "\"][data-paused] [data-beam-bloom] {\n" +
      "  animation-play-state: paused !important;\n" +
      "}\n" +
      "@media (prefers-reduced-motion: reduce) {\n" +
      "  [data-beam=\"" + id + "\"][data-active],\n" +
      "  [data-beam=\"" + id + "\"][data-fading],\n" +
      "  [data-beam=\"" + id + "\"][data-active]::after,\n" +
      "  [data-beam=\"" + id + "\"][data-fading]::after,\n" +
      "  [data-beam=\"" + id + "\"][data-active]::before,\n" +
      "  [data-beam=\"" + id + "\"][data-fading]::before,\n" +
      "  [data-beam=\"" + id + "\"][data-active] [data-beam-bloom],\n" +
      "  [data-beam=\"" + id + "\"][data-fading] [data-beam-bloom] {\n" +
      "    animation: none !important;\n" +
      "  }\n" +
      "}";
  }

  




/* ===================== orbs-math.js ===================== */
/* ===================================================================== *
 * src/orbs-math.js — 工厂级片段（无副作用：纯函数）
 *   Thinking Orbs 几何数学（orbs.jakubantalik.com 移植）：Jl..up、
 *   drawOrb 系列与 getOrbPreset，被 src/orbs.js（initOrbs）直接调用。
 * ===================================================================== */
  /* ------------------------------------------------------------------ *
   * Thinking Orbs (orbs.jakubantalik.com) — agent activity indicator
   * Copyright (c) Jakub Antalik, MIT
   * Dotted thought-orb loading indicators for AI & agent UIs
   * 9 hand-tuned mathematical state models:
   *   working (orbits), searching (globe), solving (rubik), listening (wave),
   *   connecting (web), weaving (braid), composing (ribbon), breathing (ring),
   *   shaping (morph).
   * ------------------------------------------------------------------ */
  /* 模块级排序闭包：避免 Ct 每帧新建比较函数（本文件唯一允许的微优化） */
  var ORB_Z_SORT = function(a, b) { return a.z - b.z; };

  function Jl(e, t, n) { return e + (t - e) * n; }
  function pc(e) { return e - Math.floor(e); }
  function ze(e, t) {
    var n = Math.sin(e * 12.9898 + t * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }
  function ql(e, t) {
    var n = Math.floor(e), r = Math.floor(t);
    var l = e - n, o = t - r;
    l = l * l * (3 - 2 * l);
    o = o * o * (3 - 2 * o);
    var u = ze(n, r), i = ze(n + 1, r), s = ze(n, r + 1), f = ze(n + 1, r + 1);
    return u + (i - u) * l + (s - u) * o + (u - i - s + f) * l * o;
  }
  function Wu(e, t) {
    var n = Math.PI * (3 - Math.sqrt(5));
    var r = 1 - 2 * (e + 0.5) / t;
    var l = Math.sqrt(Math.max(0, 1 - r * r));
    var o = e * n;
    return [l * Math.cos(o), r, l * Math.sin(o)];
  }
  function Qd(e, t) {
    return Math.atan2(Math.sin(e - t), Math.cos(e - t));
  }
  function $t(e, t, n, r, l) {
    var o = Math.sin(t), u = Math.cos(t);
    var i = Math.sin(e), s = Math.cos(e);
    return function(f, v, h) {
      var p = f * s + h * i;
      var y = -f * i + h * s;
      var g = v * u - y * o;
      var w = v * o + y * u;
      return [n + p * l, r - g * l, w];
    };
  }
  function Ct(e, t, n) {
    if (n === undefined) n = 0.3;
    var r = [];
    for (var i = 0; i < e.length; i++) {
      var l = e[i];
      if ((l.a !== undefined ? l.a : 1) >= 0.02) {
        l.r = Math.max(n, l.r);
        r.push(l);
      }
    }
    r.sort(ORB_Z_SORT);
    var lines = [];
    for (var j = 0; j < t.length; j++) {
      if ((t[j].a !== undefined ? t[j].a : 1) >= 0.02) lines.push(t[j]);
    }
    return { dots: r, lines: lines };
  }
  function Vt(e, t) {
    return Math.pow(e / 300, t);
  }
  function Kd(ctx, dots, isDark) {
    for (var i = 0; i < dots.length; i++) {
      var l = dots[i];
      var o = l.a !== undefined ? l.a : 1;
      var u = Math.min(1, Math.max(0, l.white !== undefined ? l.white : 0.5));
      var val = Math.round((isDark ? 1 - u : u) * 255);
      ctx.fillStyle = "rgba(" + val + "," + val + "," + val + "," + o.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function Yd(ctx, lines, isDark) {
    for (var i = 0; i < lines.length; i++) {
      var r = lines[i];
      var l = r.a !== undefined ? r.a : 1;
      var o = Math.min(1, Math.max(0, r.white !== undefined ? r.white : 0.5));
      var u = Math.round((isDark ? 1 - o : o) * 255);
      ctx.strokeStyle = "rgba(" + u + "," + u + "," + u + "," + l.toFixed(3) + ")";
      ctx.lineWidth = r.w || 1;
      ctx.beginPath();
      ctx.moveTo(r.x1, r.y1);
      ctx.lineTo(r.x2, r.y2);
      ctx.stroke();
    }
  }
  function Xd(ctx, data, isDark) {
    if (data.lines && data.lines.length > 0) Yd(ctx, data.lines, isDark);
    if (data.dots && data.dots.length > 0) Kd(ctx, data.dots, isDark);
  }

  var Gd = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.76;
    var u = $t(t * 0.4, 0.3, r, l, 1);
    var i = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var s = [];
    var f = n.ghostN !== undefined ? n.ghostN : 150;
    for (var p = 0; p < f; p++) {
      var y = Wu(p, f);
      var pt = u(y[0] * o, y[1] * o, y[2] * o);
      var c = (pt[2] / o + 1) / 2;
      s.push({ x: pt[0], y: pt[1], z: pt[2], r: 0.8 * i, white: 0.78, a: 0.1 + 0.22 * c });
    }
    var v = n.strandN !== undefined ? n.strandN : 52, h = n.turns !== undefined ? n.turns : 3;
    for (var p2 = 0; p2 < 3; p2++) {
      var y2 = p2 / 3 * 2 * Math.PI;
      for (var g = 0; g < v; g++) {
        var w = (pc(g / v + t * 0.045) * 2 - 1) * 0.96;
        var C = Math.sqrt(Math.max(0, 1 - w * w));
        var c2 = Math.min(1, (1 - Math.abs(w)) / 0.1);
        var a = w * Math.PI * h + y2;
        var d = 1 + 0.075 * Math.sin(w * Math.PI * h * 2 + y2 * 2 + t * 0.8);
        var m = C * o * d;
        var pt2 = u(Math.cos(a) * m, w * o * d, Math.sin(a) * m);
        var E = (pt2[2] / o + 1) / 2;
        s.push({
          x: pt2[0],
          y: pt2[1],
          z: pt2[2],
          r: ((n.rBase !== undefined ? n.rBase : 1.2) + (n.rDepth !== undefined ? n.rDepth : 1.8) * E) * i,
          white: 0.55 - 0.45 * E,
          a: c2 * (0.45 + 0.55 * E)
        });
      }
    }
    return Ct(s, [], n.rMin);
  };

  function Zd(e, t, n, r) {
    var l = 2 * t * n + r;
    var o = e % l;
    var u = new Array(t).fill(0);
    var i = -1;
    if (o < 2 * t * n) {
      var s = Math.floor(o / n);
      var f = (o - s * n) / n;
      var h = 1 - Math.pow(1 - Math.min(1, f / 0.7), 3);
      if (s < t) {
        for (var p = 0; p < s; p++) u[p] = 1;
        u[s] = h;
        i = s;
      } else {
        var p2 = 2 * t - 1 - s;
        for (var y = 0; y < p2; y++) u[y] = 1;
        u[p2] = 1 - h;
        i = p2;
      }
    }
    return { amount: u, active: i };
  }

  function Jd(e, t, n) {
    var r = e[0], l = e[1], o = e[2];
    var u = false;
    for (var i = 0; i < t.length; i++) {
      if (n.amount[i] <= 0) continue;
      var s = t[i];
      var f = s.axis === 0 ? r : s.axis === 1 ? l : o;
      if (f < s.lo || f >= s.hi) continue;
      if (i === n.active) u = true;
      var v = s.ang * n.amount[i];
      var h = Math.cos(v), p = Math.sin(v);
      if (s.axis === 0) {
        var y = l * h - o * p;
        o = l * p + o * h;
        l = y;
      } else if (s.axis === 1) {
        var y2 = r * h + o * p;
        o = -r * p + o * h;
        r = y2;
      } else {
        var y3 = r * h - l * p;
        l = r * p + l * h;
        r = y3;
      }
    }
    return [r, l, o, u];
  }

  function qd(e) {
    var t = [];
    for (var n = 0; n < e; n++) {
      var r = Math.min(2, Math.floor(ze(n, 2.3) * 3));
      var l = -1 + 0.5 * Math.min(3, Math.floor(ze(n, 5.9) * 4));
      var o = ze(n, 7.7) < 0.5 ? 1 : -1;
      t.push({ axis: r, lo: l, hi: l + 0.5, ang: o * Math.PI / 2 });
    }
    return t;
  }

  var bd = function(e, t, n) {
    var l = e / 2, o = e / 2, u = e / 2 * 0.82;
    var i = 0.4 + 0.06 * Math.sin(t * 0.35);
    var s = $t(t * 0.5, i, l, o, u);
    var f = t * (0.5 + (1.7 - 0.5) * (n.scanMul !== undefined ? n.scanMul : 1));
    var v = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var h = n.dimBase !== undefined ? n.dimBase : 1;
    var p = [];
    var y = n.latRings !== undefined ? n.latRings : 17, g = n.lonDensity !== undefined ? n.lonDensity : 44;
    for (var w = 0; w <= y; w++) {
      var C = -Math.PI / 2 + w / y * Math.PI;
      var c = Math.cos(C), a = Math.sin(C);
      var d = Math.max(1, Math.round(Math.abs(c) * g));
      for (var m = 0; m < d; m++) {
        var k = m / d * 2 * Math.PI;
        var pt = s(c * Math.cos(k), a, c * Math.sin(k));
        var L = (pt[2] + 1) / 2;
        var N = Qd(k + t * 0.5, f);
        var D = Math.exp(-(N * N) / 0.18) * Math.max(0, pt[2]);
        p.push({
          x: pt[0],
          y: pt[1],
          z: pt[2],
          r: ((n.rBase !== undefined ? n.rBase : 0.6) + (n.rDepth !== undefined ? n.rDepth : 1.7) * L + (n.rBoost !== undefined ? n.rBoost : 1) * D) * v,
          white: (n.inkFar !== undefined ? n.inkFar : 0.62) - (n.inkSpan !== undefined ? n.inkSpan : 0.54) * L,
          a: h + (1 - h) * Math.min(1, D)
        });
      }
    }
    return Ct(p, [], n.rMin);
  };

  var ep = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.82;
    var u = $t(t * 0.55, 0.35 + 0.1 * Math.sin(t * 0.9), r, l, o);
    var i = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var s = n.moveCount !== undefined ? n.moveCount : 14;
    var f = qd(s);
    var v = Zd(t, s, 0.42, 1.2);
    var h = [];
    var p = n.latRings !== undefined ? n.latRings : 15, y = n.lonDensity !== undefined ? n.lonDensity : 40;
    for (var g = 0; g <= p; g++) {
      var w = -Math.PI / 2 + g / p * Math.PI;
      var C = Math.cos(w), c = Math.sin(w);
      var a = Math.max(1, Math.round(Math.abs(C) * y));
      for (var d = 0; d < a; d++) {
        var m = d / a * 2 * Math.PI;
        var rot = Jd([C * Math.cos(m), c, C * Math.sin(m)], f, v);
        var pt = u(rot[0], rot[1], rot[2]);
        var I = (pt[2] + 1) / 2;
        h.push({
          x: pt[0],
          y: pt[1],
          z: pt[2],
          r: ((n.rBase !== undefined ? n.rBase : 0.6) + (n.rDepth !== undefined ? n.rDepth : 1.7) * I + (rot[3] ? (n.rActive !== undefined ? n.rActive : 0.3) : 0)) * i,
          white: (n.inkFar !== undefined ? n.inkFar : 0.62) - (n.inkSpan !== undefined ? n.inkSpan : 0.54) * I - (rot[3] ? 0.14 : 0)
        });
      }
    }
    return Ct(h, [], n.rMin);
  };

  var tp = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.874;
    var u = $t(t * 0.18, 0.38, r, l, 1);
    var i = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var s = [];
    var f = n.rings !== undefined ? n.rings : 15, v = n.lonDensity !== undefined ? n.lonDensity : 40;
    for (var h = 0; h <= f; h++) {
      var p = -Math.PI / 2 + h / f * Math.PI;
      var y = Math.cos(p), g = Math.sin(p);
      var w = 0.62 * Math.sin(t * 2.1 - h * 0.52) + 0.38 * Math.sin(t * 1.27 + h * 0.83);
      var C = o * (0.88 + 0.105 * w);
      var c = Math.max(1, Math.round(Math.abs(y) * v));
      for (var a = 0; a < c; a++) {
        var d = a / c * 2 * Math.PI;
        var pt = u(y * Math.cos(d) * C, g * C, y * Math.sin(d) * C);
        var x = (pt[2] / o + 1) / 2;
        var E = Math.max(0, w);
        s.push({
          x: pt[0],
          y: pt[1],
          z: pt[2],
          r: ((n.rBase !== undefined ? n.rBase : 0.6) + (n.rDepth !== undefined ? n.rDepth : 1.7) * x) * (1 + 0.4 * E) * i,
          white: 0.66 - 0.56 * x - 0.1 * E
        });
      }
    }
    return Ct(s, [], n.rMin);
  };

  function np(e) { return e * e * (3 - 2 * e); }
  function hc(e) {
    var t = e.length, n = [];
    var r = 0;
    for (var l = 0; l < t; l++) {
      var o = e[l], u = e[(l + 1) % t], i = Math.hypot(u[0] - o[0], u[1] - o[1]);
      n.push(i);
      r += i;
    }
    return function(l2) {
      var o2 = l2 * r, u2 = 0;
      for (; o2 > n[u2] && u2 < t - 1;) {
        o2 -= n[u2];
        u2++;
      }
      var i2 = e[u2], s = e[(u2 + 1) % t], f = n[u2] ? Math.min(1, o2 / n[u2]) : 0;
      return [i2[0] + (s[0] - i2[0]) * f, i2[1] + (s[1] - i2[1]) * f];
    };
  }
  var rp = function(e) {
    var t = -Math.PI / 2 + e * 2 * Math.PI;
    return [Math.cos(t) * 0.24, Math.sin(t) * 0.24];
  };
  var lp = hc([[0, -0.26], [0.24, 0.16], [-0.24, 0.16]]);
  var op = hc([[0, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [-0.2, -0.2]]);
  var bl = [rp, lp, op];
  function up(e) { return Math.max(6, Math.round(34 * e)); }
  var Xo = 1.4, mc = 0.9, eo = Xo + mc;
  var ip = function(e, t, n) {
    var r = bl.length, l = t % (eo * r), o = Math.floor(l / eo), u = l - o * eo;
    var i = u > Xo ? np((u - Xo) / mc) : 0;
    var s = n.spread !== undefined ? n.spread : 1;
    var f = bl[o], v = bl[(o + 1) % r];
    var h = 160, p = [];
    for (var S = 0; S < h; S++) {
      var x = S / h, E = f(x), L = v(x);
      p.push([(E[0] + (L[0] - E[0]) * i) * s, (E[1] + (L[1] - E[1]) * i) * s]);
    }
    var y = [];
    var g = 0;
    for (var S2 = 0; S2 < h; S2++) {
      var x2 = p[S2], E2 = p[(S2 + 1) % h], L2 = Math.hypot(E2[0] - x2[0], E2[1] - x2[1]);
      y.push(L2);
      g += L2;
    }
    var w = up(n.iconD !== undefined ? n.iconD : 1);
    var C = (n.rDot !== undefined ? n.rDot : 0.021) * 1.35 * s;
    var c = 1 + 0.02 * Math.sin(u * 3.1);
    var a = [], d = e / 2;
    var m = 0, k = 0;
    for (var S3 = 0; S3 < w; S3++) {
      var x3 = S3 / w * g;
      for (; k + y[m] < x3 && m < h - 1;) {
        k += y[m];
        m++;
      }
      var E3 = p[m], L3 = p[(m + 1) % h], N = y[m] ? Math.min(1, (x3 - k) / y[m]) : 0;
      var D = (E3[0] + (L3[0] - E3[0]) * N) * c, I = (E3[1] + (L3[1] - E3[1]) * N) * c;
      a.push({ x: d + D * e, y: d + I * e, z: 0, r: Math.max(0.35, C * e), white: 0.1 });
    }
    return Ct(a, [], n.rMin);
  };

  var sp = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.82;
    var u = $t(t * 0.12, 0.3, r, l, 1);
    var i = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var s = [];
    var f = n.orbitN !== undefined ? n.orbitN : 12, v = n.ghostN !== undefined ? n.ghostN : 40, h = n.particles !== undefined ? n.particles : 3;
    for (var p = 0; p < f; p++) {
      var y = ze(p, 1.7), g = ze(p, 5.2), w = ze(p, 8.9);
      var C = o * (0.45 + 0.52 * y);
      var c = y * 2 * Math.PI;
      var a = Math.acos(2 * g - 1);
      var d = Math.sin(a) * Math.cos(c), m = Math.cos(a), k = Math.sin(a) * Math.sin(c);
      var S = -m, x = d;
      var E = 0, L = Math.max(1e-6, Math.sqrt(S * S + x * x));
      S /= L; x /= L;
      var N = m * E - k * x, D = k * S - d * E, I = d * x - m * S;
      var pe = (0.25 + 0.55 * w) * (w > 0.5 ? 1 : -1);
      for (var se = 0; se < v; se++) {
        var Y = se / v * 2 * Math.PI;
        var pt = u((S * Math.cos(Y) + N * Math.sin(Y)) * C, (x * Math.cos(Y) + D * Math.sin(Y)) * C, (E * Math.cos(Y) + I * Math.sin(Y)) * C);
        var z = (pt[2] / C + 1) / 2;
        s.push({
          x: pt[0],
          y: pt[1],
          z: pt[2],
          r: (n.ghostR !== undefined ? n.ghostR : 0.9) * i,
          white: 0.72,
          a: (n.ghostA !== undefined ? n.ghostA : 0.5) * (0.4 + 0.6 * z)
        });
      }
      for (var se2 = 0; se2 < h; se2++) {
        var Y2 = t * pe + se2 / h * 2 * Math.PI + g * 6;
        var pt2 = u((S * Math.cos(Y2) + N * Math.sin(Y2)) * C, (x * Math.cos(Y2) + D * Math.sin(Y2)) * C, (E * Math.cos(Y2) + I * Math.sin(Y2)) * C);
        var z2 = (pt2[2] / C + 1) / 2;
        s.push({
          x: pt2[0],
          y: pt2[1],
          z: pt2[2],
          r: ((n.partR !== undefined ? n.partR : 1.2) + (n.partRDepth !== undefined ? n.partRDepth : 1.6) * z2) * i,
          white: 0.3 - 0.22 * z2
        });
      }
    }
    return Ct(s, [], n.rMin);
  };

  var bi = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.78;
    var u = n.spin !== undefined ? n.spin : 1;
    var i = 0.3;
    var s = $t(t * 0.1 * u, i, r, l, 1);
    var f = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var v = [];
    var h = n.ghostN !== undefined ? n.ghostN : 150;
    for (var I = 0; I < h; I++) {
      var pe = Wu(I, h);
      var pt = s(pe[0] * o, pe[1] * o, pe[2] * o);
      var Ce = (pt[2] / o + 1) / 2;
      v.push({ x: pt[0], y: pt[1], z: pt[2], r: 0.8 * f, white: 0.78, a: 0.1 + 0.22 * Ce });
    }
    var p = t * 0.24 * u;
    var y = n.faceOn ? -i : 0.55 + 0.3 * Math.sin(t * 0.18) * u;
    var g = Math.cos(p), w = 0, C = Math.sin(p);
    var c = -C * Math.sin(y), a = Math.cos(y), d = g * Math.sin(y);
    var m = w * d - C * a, k = C * c - g * d, S = g * a - w * c;
    var x = 0.23 * (n.wobMul !== undefined ? n.wobMul : 1);
    var E = n.faceOn ? o / (1 + 0.85 * x) : o;
    var L = n.lanes !== undefined ? n.lanes : 5, N = n.segs !== undefined ? n.segs : 88;
    var D = Math.max(1, Math.round(L * (n.bandMul !== undefined ? n.bandMul : 1)));
    for (var I2 = 0; I2 < D; I2++) {
      var pe2 = (I2 - (D - 1) / 2) * 0.075;
      var se = Math.abs(I2 - (D - 1) / 2) / Math.max(1, (D - 1) / 2);
      for (var Y = 0; Y < N; Y++) {
        var Z = Y / N * 2 * Math.PI;
        var Ce2 = (0.16 * Math.sin(Z * 3 - t * 1.7 + I2 * 0.22) + 0.07 * Math.sin(Z * 5 + t * 1.1)) * (n.wobMul !== undefined ? n.wobMul : 1);
        var _ = n.faceOn ? 1 + Ce2 : 1;
        var z = n.faceOn ? pe2 : pe2 + Ce2;
        var T = g * Math.cos(Z) + c * Math.sin(Z) + m * z;
        var U = w * Math.cos(Z) + a * Math.sin(Z) + k * z;
        var Q = C * Math.cos(Z) + d * Math.sin(Z) + S * z;
        var rt = Math.sqrt(T * T + U * U + Q * Q);
        var De = E * _;
        var pt2 = s(T / rt * De, U / rt * De, Q / rt * De);
        var Ml = (pt2[2] / o + 1) / 2;
        v.push({
          x: pt2[0],
          y: pt2[1],
          z: pt2[2],
          r: ((n.rBase !== undefined ? n.rBase : 1.1) + (n.rDepth !== undefined ? n.rDepth : 1.7) * Ml) * (1 - 0.25 * se) * f,
          white: 0.52 - 0.44 * Ml + 0.18 * se,
          a: 0.4 + 0.6 * Ml
        });
      }
    }
    return Ct(v, [], n.rMin);
  };

  var ap = function(e, t, n) {
    var r = e / 2, l = e / 2, o = e / 2 * 0.8 * (n.spread !== undefined ? n.spread : 1);
    var u = $t(t * 0.12, 0.32, r, l, o);
    var i = Vt(e, n.rsPow !== undefined ? n.rsPow : 0.6);
    var s = n.nodeN !== undefined ? n.nodeN : 30, f = n.thr !== undefined ? n.thr : 0.72;
    var v = n.nodeR !== undefined ? n.nodeR : 1.4, h = n.nodeRDepth !== undefined ? n.nodeRDepth : 1.8;
    var p = [];
    for (var C = 0; C < s; C++) {
      var c = Wu(C, s);
      var a = c[0] + 0.3 * (ql(C * 0.31 + 9, t * 0.24) - 0.5) * 2;
      var d = c[1] + 0.3 * (ql(C * 0.53 + 27, t * 0.21) - 0.5) * 2;
      var m = c[2] + 0.3 * (ql(C * 0.77 + 55, t * 0.27) - 0.5) * 2;
      var k = Math.sqrt(a * a + d * d + m * m);
      p.push([a / k, d / k, m / k]);
    }
    var y = [], g = [];
    for (var C2 = 0; C2 < s; C2++) {
      for (var c2 = C2 + 1; c2 < s; c2++) {
        var a2 = p[C2][0] - p[c2][0];
        var d2 = p[C2][1] - p[c2][1];
        var m2 = p[C2][2] - p[c2][2];
        var k2 = Math.sqrt(a2 * a2 + d2 * d2 + m2 * m2);
        if (k2 >= f) continue;
        var ptA = u(p[C2][0], p[C2][1], p[C2][2]);
        var ptB = u(p[c2][0], p[c2][1], p[c2][2]);
        var I = ((ptA[2] + ptB[2]) / 2 + 1) / 2;
        y.push({
          x1: ptA[0],
          y1: ptA[1],
          x2: ptB[0],
          y2: ptB[1],
          white: 0.42,
          a: (1 - k2 / f) * (0.3 + 0.55 * I),
          w: Math.max(0.6, (n.lineW !== undefined ? n.lineW : 0.8) * i)
        });
      }
    }
    for (var C3 = 0; C3 < s; C3++) {
      var pt3 = u(p[C3][0], p[C3][1], p[C3][2]);
      var m3 = (pt3[2] + 1) / 2;
      var k3 = 1 + 0.25 * Math.sin(t * 1.4 + C3 * 2.7);
      g.push({
        x: pt3[0],
        y: pt3[1],
        z: pt3[2],
        r: (v + h * m3) * k3 * i,
        white: 0.55 - 0.45 * m3
      });
    }
    var w = n.signals !== undefined ? n.signals : 5;
    for (var C4 = 0; C4 < w; C4++) {
      var c4 = Math.floor(t * 0.55 + C4 * 7.31);
      var a4 = Math.floor(ze(c4, C4 * 3.1 + 1.7) * s);
      var d4 = Math.floor(ze(c4, C4 * 5.7 + 4.2) * s);
      if (a4 === d4) continue;
      var m4 = pc(t * 0.55 + C4 * 7.31);
      var k4 = Jl(p[a4][0], p[d4][0], m4);
      var S4 = Jl(p[a4][1], p[d4][1], m4);
      var x4 = Jl(p[a4][2], p[d4][2], m4);
      var E4 = Math.max(1e-6, Math.sqrt(k4 * k4 + S4 * S4 + x4 * x4));
      var pt4 = u(k4 / E4, S4 / E4, x4 / E4);
      var I4 = (pt4[2] + 1) / 2;
      g.push({
        x: pt4[0],
        y: pt4[1],
        z: pt4[2],
        r: (v * 1.5 + h * I4) * i,
        white: 0.05,
        a: 0.5 + 0.5 * I4
      });
    }
    return Ct(g, y, n.rMin);
  };

  var cp = {
    orbits: sp,
    globe: bd,
    rubik: ep,
    wave: tp,
    web: ap,
    braid: Gd,
    ribbon: bi,
    ring: bi,
    morph: ip
  };

  var dp = [["latRings", "lonDensity"], ["rings", "lonDensity"], ["lanes", "segs"]];
  var pp = ["orbitN", "ghostN", "nodeN", "strandN", "signals"];
  var hp = ["iconD"];
  var mp = ["rBase", "rDepth", "rActive", "rDot", "ghostR", "partR", "partRDepth", "nodeR", "nodeRDepth"];

  function vp(e, t) {
    var n = Object.assign({}, e), r = new Set(), l = Math.sqrt(t);
    for (var i = 0; i < dp.length; i++) {
      var pair = dp[i];
      var o = pair[0], u = pair[1];
      if (n[o] != null && n[u] != null && !r.has(o) && !r.has(u)) {
        n[o] = Math.max(2, Math.round(n[o] * l));
        n[u] = Math.max(2, Math.round(n[u] * l));
        r.add(o); r.add(u);
      }
    }
    for (var j = 0; j < pp.length; j++) {
      var o2 = pp[j];
      if (n[o2] != null && n[o2] !== 0 && !r.has(o2)) {
        n[o2] = Math.max(1, Math.round(n[o2] * t));
      }
    }
    for (var k = 0; k < hp.length; k++) {
      var o3 = hp[k];
      if (n[o3] != null) {
        n[o3] = Math.max(0.02, n[o3] * t);
      }
    }
    return n;
  }

  function yp(e, t) {
    var n = Object.assign({}, e);
    for (var i = 0; i < mp.length; i++) {
      var r = mp[i];
      if (n[r] != null) {
        n[r] = n[r] * t;
      }
    }
    n.rSizeMul = (n.rSizeMul != null ? n.rSizeMul : 1) * t;
    return n;
  }

  var gp = {
    globe: { latRings: 17, lonDensity: 44, rBase: 0.6, rDepth: 1.7, rBoost: 1, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
    orbits: { orbitN: 12, ghostN: 40, ghostR: 0.9, ghostA: 0.5, particles: 3, partR: 1.2, partRDepth: 1.6, rsPow: 0.6, rMin: 0.3 },
    rubik: { latRings: 15, lonDensity: 40, moveCount: 14, rBase: 0.6, rDepth: 1.7, rActive: 0.3, inkFar: 0.62, inkSpan: 0.54, rsPow: 0.6, rMin: 0.3 },
    wave: { rings: 15, lonDensity: 40, rBase: 0.6, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    web: { nodeN: 30, thr: 0.72, signals: 5, nodeR: 1.4, nodeRDepth: 1.8, lineW: 0.8, rsPow: 0.6, rMin: 0.3 },
    braid: { strandN: 52, turns: 3, ghostN: 150, rBase: 1.2, rDepth: 1.8, rsPow: 0.6, rMin: 0.3 },
    ribbon: { lanes: 5, segs: 88, ghostN: 150, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    ring: { lanes: 5, segs: 88, ghostN: 0, faceOn: 1, rBase: 1.1, rDepth: 1.7, rsPow: 0.6, rMin: 0.3 },
    morph: { rDot: 0.021, iconD: 1, rMin: 0.25 }
  };

  var wp = {
    working: "orbits",
    searching: "globe",
    solving: "rubik",
    listening: "wave",
    connecting: "web",
    weaving: "braid",
    composing: "ribbon",
    breathing: "ring",
    shaping: "morph"
  };

  var kp = {
    orbits: { 64: { speed: 1.885, count: 1, size: 1 }, 20: { speed: 3.9, count: 0.238, size: 2.4 } },
    globe: { 64: { speed: 2.015, count: 0.42, size: 1.15, extra: { scanMul: 4.08, dimBase: 0.45 } }, 20: { speed: 2.665, count: 0.105, size: 1.75, extra: { scanMul: 4.335, dimBase: 0.45 } } },
    rubik: { 64: { speed: 1.82, count: 0.35, size: 1.05 }, 20: { speed: 1.95, count: 0.088, size: 1.9 } },
    wave: { 64: { speed: 4.388, count: 0.341, size: 1 }, 20: { speed: 3.998, count: 0.105, size: 1.6 } },
    web: { 64: { speed: 3.315, count: 1.35, size: 0.95 }, 20: { speed: 6.63, count: 0.25, size: 1.52 } },
    braid: { 64: { speed: 1.625, count: 0.5, size: 1 }, 20: { speed: 2.75, count: 0.1125, size: 1.36 } },
    ribbon: { 64: { speed: 2.34, count: 0.25, size: 0.85, extra: { spin: 0, bandMul: 3.9, wobMul: 1 } }, 20: { speed: 3.12, count: 0.051, size: 1.073, extra: { spin: 0, bandMul: 4.94, wobMul: 1 } } },
    ring: { 64: { speed: 3.24, count: 0.25, size: 0.956, extra: { spin: 0, bandMul: 3.627, wobMul: 0.368 } }, 20: { speed: 3.78, count: 0.028, size: 1.622, extra: { spin: 0, bandMul: 3.968, wobMul: 0.565 } } },
    morph: { 64: { speed: 2.405, count: 0.702, size: 0.395, extra: { spread: 1.45 } }, 20: { speed: 2.08, count: 0.53, size: 1.011, extra: { spread: 1.45 } } }
  };

  var orbPresetsCache = new Map();
  function getOrbPreset(stateKey, size) {
    var key = stateKey + "-" + size;
    var cached = orbPresetsCache.get(key);
    if (cached) return cached;
    var mode = wp[stateKey] || "orbits";
    var preset = (kp[mode] && kp[mode][size]) ? kp[mode][size] : kp.orbits[20];
    var opts = Object.assign({}, gp[mode]);
    if (preset.count !== 1) opts = vp(opts, preset.count);
    if (preset.size !== 1) opts = yp(opts, preset.size);
    if (preset.extra) opts = Object.assign(opts, preset.extra);
    var res = { mode: mode, speed: preset.speed, opts: opts };
    orbPresetsCache.set(key, res);
    return res;
  }

  /* ------------------------------------------------------------------ *
   * 工具调用状态映射 (Tool Call → Thinking Orb Style & Status Text)
   * 9 种几何动效: searching / listening / composing / solving /
   *               connecting / shaping / weaving / breathing / working
   * ------------------------------------------------------------------ */




/* ===================== theme.js ===================== */
/* ------------------------------------------------------------------ *
 * src/theme.js — 主题检测（initTheme）
 *   本插件（dsh-ui-beam-orbs）独立检测主题：深色时应用
 *   玻璃拟态 / Border Beam / Thinking Orbs / 任务清单 Pulse；
 *   浅色主题恢复 DSH 官方原版外观（CSS 全部门控在 body[data-ds-dark-theme]）。
 *   背景引擎（极光/鲸鱼/星座）在 dsh-ui-deepseek-bg 插件。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initTheme(shared) {
  var state = shared.state;

  function detectDark() {
    var b = document.body;
    var d = document.documentElement;
    if (b && b.hasAttribute("data-ds-dark-theme")) return true;
    if (d && d.hasAttribute("data-ds-dark-theme")) return true;
    if (b && b.hasAttribute("data-ds-light-theme")) return false;
    if (d && d.hasAttribute("data-ds-light-theme")) return false;
    if (d && d.dataset) {
      if (d.dataset.theme === "dark") return true;
      if (d.dataset.theme === "light") return false;
    }
    // 官方 ThemePresenter 会把解析后的主题写入 <html> 的 color-scheme，
    // 比 prefers-color-scheme 更权威（用户显式选浅色而系统深色时依然正确）
    if (d && d.style && d.style.colorScheme) {
      if (d.style.colorScheme === "dark") return true;
      if (d.style.colorScheme === "light") return false;
    }
    return !!(shared.media.darkQuery && shared.media.darkQuery.matches);
  }

  state.dark = detectDark();

  shared.refs.detectDark = detectDark;
}


/* ===================== settings.js ===================== */
/* ===================================================================== *
 * src/settings.js — 界面特效设置（initSettings）
 *   玻璃拟态（侧边栏/气泡/代码块等）、Border Beam 光效、Thinking Orbs
 *   （Orbs 为工具调用状态几何动效，可在设置页关闭以降载省电）+ 高级：玻璃模糊强度。
 *   即时生效、localStorage 持久化（dsh-bg-glass-settings）。
 *   背景引擎设置（极光/鲸鱼/星座/鼠标）在 dsh-ui-deepseek-bg 插件。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ===================================================================== */
function initSettings(shared) {
  var ctx = shared.ctx;

  var SETTINGS_KEY = "dsh-bg-glass-settings";
  var DEFAULTS = { beam: true, glass: true, orbs: true, blur: 12 };

  function loadSettings() {
    var d = { beam: true, glass: true, orbs: true, blur: 12 };
    var parsed = null;
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {}
    if (parsed && typeof parsed === "object") {
      var allowed = { beam:1, glass:1, blur:1, orbs:1 };
      for (var k in parsed) if (Object.prototype.hasOwnProperty.call(parsed, k) && allowed[k]) d[k] = parsed[k];
    }
    return d;
  }
  shared.settings = loadSettings();
  var bgSettings = shared.settings;

  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(bgSettings)); } catch (e) { try { if (e && e.name === "QuotaExceededError") console.warn("[dsh-glass] localStorage quota exceeded", e); } catch(_){} } }
  function estimateGpu() {
    var s = bgSettings, score = 0;
    if (s.beam) score += 8;
    if (s.glass) score += 9 * Math.min(1.6, (s.blur || 8) / 8);
    if (s.orbs) score += 2;
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  function snapshotSettings() {
    return {
      beam: !!bgSettings.beam, glass: !!bgSettings.glass, orbs: !!bgSettings.orbs,
      blur: Number(bgSettings.blur) || 8,
      gpu: estimateGpu()
    };
  }
  var settingsListeners = [];
  function notifySettings() { for (var i = 0; i < settingsListeners.length; i++) { try { settingsListeners[i](); } catch (e) {} } }
  function subscribeSettings(fn) {
    settingsListeners.push(fn);
    return function () { var i = settingsListeners.indexOf(fn); if (i >= 0) settingsListeners.splice(i, 1); };
  }
  function updateSetting(key, value) {
    bgSettings[key] = value;
    saveSettings(); applyBgSettings(); notifySettings();
  }
  function resetSettings() {
    bgSettings.beam = DEFAULTS.beam; bgSettings.glass = DEFAULTS.glass; bgSettings.orbs = DEFAULTS.orbs; bgSettings.blur = DEFAULTS.blur;
    saveSettings(); applyBgSettings(); notifySettings();
  }

  /** 把每个子系统立即切换到当前设置 */
  function applyBgSettings() {
    try { document.body.classList.toggle("dsh-bg-no-glass", !bgSettings.glass); } catch (e) {}
    try {
      if (bgSettings.beam) {
        if (shared.refs.watchBeamComposer) shared.refs.watchBeamComposer();
        if (shared.refs.watchBeamTodo) shared.refs.watchBeamTodo();
      } else {
        if (shared.refs.detachComposerBeam) shared.refs.detachComposerBeam();
        if (shared.refs.detachTodoBeam) shared.refs.detachTodoBeam();
      }
    } catch (e) {}
    try { if (shared.refs.shellGlassApply) shared.refs.shellGlassApply(); } catch (e) {} // 玻璃内联样式按开关重跑一次
    // 用 watchThinkingOrbs 而非 syncThinkingOrb：关闭时内部走 detachThinkingOrbs，
    // 重新打开时重挂轮询与合批订阅（只调 sync 的话监听永不复活，小球失联）
    try { if (shared.refs.watchThinkingOrbs) shared.refs.watchThinkingOrbs(); } catch (e) {}
  }

  /* ---- 设置页「界面特效」面板 ---- */
  var SETTINGS_UI_CSS = [
    ".dsh-bg-settings{display:flex;flex-direction:column;gap:14px;max-width:560px;padding-bottom:28px;}",
    ".dsh-bg-card{border:1px solid rgba(128,128,128,.2);border-radius:12px;padding:14px 16px;background:rgba(128,128,128,.05);}",
    ".dsh-bg-sec-title{font-size:13px;font-weight:600;opacity:.9;margin-bottom:10px;letter-spacing:0.2px;}",
    ".dsh-bg-div{border-top:1px solid rgba(128,128,128,.12);margin:14px 0;}",
    /* GPU 仪表 */
    ".dsh-bg-meter-label{display:flex;justify-content:space-between;align-items:center;font-size:12px;opacity:.85;margin-bottom:6px;}",
    ".dsh-bg-meter{height:8px;border-radius:999px;background:rgba(128,128,128,.16);overflow:hidden;}",
    ".dsh-bg-meter>div{height:100%;border-radius:999px;transition:width .25s ease,background .25s ease;}",
    ".dsh-bg-meta{font-size:11px;opacity:.55;line-height:1.6;margin-top:8px;}",
    /* 开关行：细分隔线 + 紧凑内边距 */
    ".dsh-bg-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px;}",
    ".dsh-bg-row+.dsh-bg-row{border-top:1px solid rgba(128,128,128,.08);}",
    ".dsh-bg-row-info{flex:1;min-width:0;}",
    ".dsh-bg-row-title{font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px;}",
    ".dsh-bg-row-desc{font-size:11px;opacity:.6;margin-top:2px;line-height:1.4;}",
    ".dsh-bg-chip{font-size:10px;line-height:16px;padding:0 6px;border-radius:999px;border:1px solid rgba(128,128,128,.3);opacity:.85;white-space:nowrap;flex:none;}",
    ".dsh-bg-chip[data-level=\"high\"]{color:#ff9d6b;border-color:rgba(255,140,80,.4);}",
    ".dsh-bg-chip[data-level=\"mid\"]{color:#ffd166;border-color:rgba(255,200,90,.4);}",
    ".dsh-bg-chip[data-level=\"low\"]{color:#7ee2a8;border-color:rgba(110,220,160,.4);}",
    ".dsh-bg-switch{position:relative;width:36px;height:20px;flex:none;cursor:pointer;border-radius:999px;border:none;background:rgba(128,128,128,.3);transition:background .15s;padding:0;}",
    ".dsh-bg-switch[aria-checked=\"true\"]{background:#4d8bf5;}",
    ".dsh-bg-switch::after{content:\"\";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s ease;box-shadow:0 1px 2px rgba(0,0,0,.2);}",
    ".dsh-bg-switch[aria-checked=\"true\"]::after{transform:translateX(16px);}",
    /* 高级折叠面板 */
    ".dsh-bg-adv summary{cursor:pointer;font-size:13px;font-weight:600;opacity:.9;user-select:none;padding:2px 0;outline:none;display:flex;align-items:center;gap:6px;}",
    ".dsh-bg-adv summary::-webkit-details-marker{display:none;}",
    ".dsh-bg-adv summary::before{content:\"▶\";font-size:9px;display:inline-block;transition:transform .2s ease;opacity:.7;}",
    ".dsh-bg-adv[open] summary::before{transform:rotate(90deg);}",
    ".dsh-bg-adv[open] summary{margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(128,128,128,.12);}",
    ".dsh-bg-adv summary:hover{opacity:1;}",
    /* 高级区条目 */
    ".dsh-bg-slider-item{padding:10px 2px;}",
    ".dsh-bg-slider-item+.dsh-bg-slider-item{border-top:1px solid rgba(128,128,128,.08);}",
    ".dsh-bg-item-title{font-size:13px;font-weight:500;}",
    ".dsh-bg-item-desc{font-size:11px;opacity:.6;line-height:1.45;margin-top:2px;}",
    ".dsh-bg-slider-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}",
    ".dsh-bg-val-badge{font-size:11px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-variant-numeric:tabular-nums;color:#6ea8ff;background:rgba(77,139,245,.12);border:1px solid rgba(77,139,245,.25);border-radius:6px;padding:1px 7px;line-height:16px;flex:none;}",
    ".dsh-bg-range{display:block;width:100%;height:6px;border-radius:3px;background:rgba(128,128,128,.2);outline:none;margin:10px 0 4px;cursor:pointer;-webkit-appearance:none;appearance:none;transition:background .15s;}",
    ".dsh-bg-range:hover{background:rgba(128,128,128,.28);}",
    ".dsh-bg-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;background:#4d8bf5;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transition:transform .12s ease;}",
    ".dsh-bg-range::-webkit-slider-thumb:hover{transform:scale(1.15);}",
    ".dsh-bg-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#4d8bf5;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);}",
    ".dsh-bg-range-labels{display:flex;justify-content:space-between;font-size:10px;opacity:.45;user-select:none;margin-top:2px;}",
    /* 底部 */
    ".dsh-bg-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:4px;}",
    ".dsh-bg-reset{cursor:pointer;border:1px solid rgba(128,128,128,.25);background:transparent;color:inherit;border-radius:8px;padding:6px 14px;font-size:12px;font-family:inherit;transition:background .15s,border-color .15s;}",
    ".dsh-bg-reset:hover{background:rgba(128,128,128,.1);border-color:rgba(128,128,128,.4);}",
    ".dsh-bg-note{font-size:11px;opacity:.55;line-height:1.5;}",
    "@media (prefers-reduced-motion: reduce){.dsh-bg-meter>div{transition:none;}}",
    /* 设置页「界面特效」专属导航图标：Sparkles 闪烁星芒光效，替代默认齿轮 */
    "[data-dsh-beam-orbs-settings-nav] > svg:first-child{display:none!important;}",
    "[data-dsh-beam-orbs-settings-nav]::before{content:'';flex:none;width:16px;height:16px;background:currentColor;-webkit-mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z'/%3E%3Cpath d='M5 3v4'/%3E%3Cpath d='M7 5H3'/%3E%3Cpath d='M19 17v4'/%3E%3Cpath d='M21 19h-4'/%3E%3C/svg%3E\") center / contain no-repeat;mask:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z'/%3E%3Cpath d='M5 3v4'/%3E%3Cpath d='M7 5H3'/%3E%3Cpath d='M19 17v4'/%3E%3Cpath d='M21 19h-4'/%3E%3C/svg%3E\") center / contain no-repeat;}"
  ].join("\n");

  function injectSettingsCss() {
    try {
      var tag = document.getElementById("dsh-bg-glass-settings-css");
      if (!tag) {
        tag = document.createElement("style");
        tag.id = "dsh-bg-glass-settings-css";
        document.head.appendChild(tag);
      }
      tag.textContent = SETTINGS_UI_CSS;
    } catch (e) {}
  }

  function BgSettingsSection() {
    var h = react.createElement;
    var snapState = react.useState(function () { return snapshotSettings(); });
    var snap = snapState[0];
    var setSnap = snapState[1];
    react.useEffect(function () {
      return subscribeSettings(function () { setSnap(snapshotSettings()); });
    }, []);
    var gpu = snap.gpu;
    var meterColor = gpu < 35 ? "#4ade80" : (gpu < 60 ? "#facc15" : "#fb7185");
    var rows = [
      { key: "beam", title: "Border Beam 光效", desc: "输入框边界旋转光晕与打字呼吸", level: "mid" },
      { key: "glass", title: "玻璃拟态", desc: "侧边栏/气泡/代码块/计划/任务/审批卡片的 backdrop blur", level: "mid" },
      { key: "orbs", title: "Thinking Orbs 动态指示器", desc: "工具调用状态的几何动效（低性能设备可关闭以省电）", level: "low" }
    ];
    var levelText = { high: "高", mid: "中", low: "低" };
    function switchBtn(key) {
      return h("button", {
        type: "button",
        className: "dsh-bg-switch",
        role: "switch",
        "aria-checked": snap[key] ? "true" : "false",
        "aria-label": "开关",
        onClick: function () { updateSetting(key, !snap[key]); }
      });
    }
    function rowEl(row) {
      return h("div", { key: row.key, className: "dsh-bg-row" },
        h("div", { className: "dsh-bg-row-info" },
          h("div", { className: "dsh-bg-row-title" }, row.title,
            h("span", { className: "dsh-bg-chip", "data-level": row.level }, levelText[row.level] + "负载")),
          h("div", { className: "dsh-bg-row-desc" }, row.desc)),
        switchBtn(row.key));
    }
    function sliderItemBlur() {
      return h("div", { className: "dsh-bg-slider-item" },
        h("div", { className: "dsh-bg-slider-head" },
          h("span", { className: "dsh-bg-item-title" }, "玻璃模糊强度"),
          h("span", { className: "dsh-bg-val-badge" }, snap.blur + " px")),
        h("div", { className: "dsh-bg-item-desc" }, "侧边栏、对话气泡与代码块的背景模糊半径（数值越大磨砂越重、越小越轻透）"),
        h("select", {
          className: "dsh-bg-select dsh-bg-range-select",
          style: { marginTop: "8px" },
          value: snap.blur,
          onChange: function (e) { updateSetting("blur", parseInt(e.target.value, 10)); }
        }, [6, 8, 10, 12].map(function (v) {
          return h("option", { key: v, value: v },
            v + " px" + (v === 6 ? "（轻透磨砂 · 最省）" : v === 8 ? "（标准磨砂）" : v === 10 ? "（柔和毛玻璃）" : "（深度毛玻璃）"));
        })));
    }
    return h("div", { className: "dsh-bg-settings" },
      h("div", { className: "dsh-bg-card" },
        h("div", { className: "dsh-bg-sec-title" }, "估算 GPU 负载"),
        h("div", { className: "dsh-bg-meter-label" },
          h("span", null, "界面特效（UI 层）"),
          h("span", { style: { color: meterColor, fontWeight: 600 } }, gpu + "%")),
        h("div", { className: "dsh-bg-meter" }, h("div", { style: { width: gpu + "%", background: meterColor } })),
        h("div", { className: "dsh-bg-meta" }, "按 模糊半径 × 生效组件数 估算，仅供参考；切换即时生效并自动保存。"),
        h("div", { className: "dsh-bg-div" }),
        h("div", { className: "dsh-bg-sec-title" }, "特效开关"),
        rows.map(rowEl),
        h("div", { className: "dsh-bg-div" }),
        h("details", { className: "dsh-bg-adv dsh-bg-card" },
          h("summary", null, "渲染质量（高级）"),
          sliderItemBlur())),
      h("div", { className: "dsh-bg-foot" },
        h("button", { type: "button", className: "dsh-bg-reset", onClick: function () { resetSettings(); } }, "恢复默认"),
        h("span", { className: "dsh-bg-note" }, "v1.0.6 · 即时生效并自动保存")));
  }

  var SETTINGS_NAV_MARKER = "data-dsh-beam-orbs-settings-nav";

  function syncSettingsNavIcon() {
    try {
      var buttons = document.querySelectorAll('[role="dialog"] nav button, .VOzbGW_navCell, [class*="navCell"]');
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        var txt = btn.textContent ? btn.textContent.trim() : "";
        if (txt === "界面特效" || txt.indexOf("界面特效") !== -1) {
          if (!btn.hasAttribute(SETTINGS_NAV_MARKER)) {
            btn.setAttribute(SETTINGS_NAV_MARKER, "");
          }
        } else if (btn.hasAttribute(SETTINGS_NAV_MARKER)) {
          btn.removeAttribute(SETTINGS_NAV_MARKER);
        }
      }
    } catch (e) {}
  }

  /** 注册设置页条目（需要 slots 服务；缺 ctx/slots 时静默跳过） */
  function setupSettingsUi(ctx) {
    if (!react) return;
    try {
      var slots = ctx && ctx.get ? ctx.get("slots") : null;
      if (!slots) return;
      injectSettingsCss();
      slots.inject("settings.section", function () {
        return slots.register({
          name: "settings.section",
          id: "dsh-bg-glass",
          order: 6,
          label: function () { return "界面特效"; }
        }, BgSettingsSection);
      });
      // 监听设置弹窗挂载，标记「界面特效」导航项以展示专属 Sparkles 光效图标
      syncSettingsNavIcon();
      // 合批订阅已覆盖 #root 全树 childList/subtree + class/aria-label 属性突变，足以在设置弹窗
      // 挂载与导航项重绘时重跑标记。原先额外挂了一个裸 observer（document.body 全量子树 +
      // characterData:true，流式输出高频触发）却从不 disconnect，既是泄漏也是纯冗余：此处删除，
      // 由上面的 subscribeCoalesced 单例统一承载（它随订阅者归零自动 disconnect）。
      if (shared.refs.subscribeCoalesced) {
        shared.refs.subscribeCoalesced(syncSettingsNavIcon);
      }
    } catch (e) {}
  }

  shared.refs.setupSettingsUi = setupSettingsUi;
}


/* ===================== coalesce.js ===================== */
/* ------------------------------------------------------------------ *
 * src/coalesce.js — 合批 MutationObserver（initCoalesce）
 *   单例 + rAF 合批，将 #root 全树突变分发给 shell/beam/orbs/todo；
 *   与主题观察器（observer.js）职责分离。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initCoalesce(shared) {
  var cbs = [];
  var scheduled = false;
  var mo = null;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var raf = window.requestAnimationFrame || function(fn){ return setTimeout(fn, 16); };
    raf(function(){
      scheduled = false;
      var list = cbs.slice();
      for (var i=0;i<list.length;i++) { try{ list[i].fn(); }catch(e){} }
    });
  }
  function ensure() {
    if (mo) return;
    if (!window.MutationObserver) return;
    mo = new MutationObserver(function(){ schedule(); });
    var rootEl = document.querySelector("#root") || document.documentElement;
    try {
      mo.observe(rootEl, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-ds-dark-theme","data-ds-light-theme","data-theme","class","data-state","data-tool","data-status","aria-label","aria-expanded","data-testid","role","data-plan-mode","data-beam","data-active","data-pulse-active"]
      });
    } catch(e){}
    // 暴露给 diag/调试
    try{ shared.refs.coalescedObserver = mo; }catch(_){}
  }
  function subscribe(fn) {
    cbs.push({fn: fn});
    ensure();
    return function unsubscribe(){
      for (var i=0;i<cbs.length;i++) if (cbs[i].fn===fn) { cbs.splice(i,1); break; }
      if (cbs.length===0 && mo) { try{ mo.disconnect(); }catch(_){} mo=null; }
    };
  }
  shared.refs.subscribeCoalesced = subscribe;
  shared.refs.ensureCoalesced = ensure;
  shared.refs.scheduleCoalesced = schedule;
}




/* ===================== beam.js ===================== */
/* ------------------------------------------------------------------ *
 * src/beam.js — Border Beam 状态机与 composer/todo 集成（initBeam）
 *   含全部 beam 状态变量、attach/detach/watch 与调试句柄对象；
 *   CSS 生成（buildBeamCSS 等）在 src/beam-css.js（工厂级片段）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initBeam(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;

  /* ------------------------------------------------------------------ *
   * Border Beam — composer integration (D S H)
   * ------------------------------------------------------------------ */
  var beamStyleTag = null;
  var beamAttachedCard = null;
  var beamResizeObs = null;
  var beamMutObs = null;
  var beamCoalesceUnsub = null;
  var pendingExecuting = false;
  var pendingTimer = null;
  var beamPollTimer = null;
  var beamTypingHandler = null;
  var beamKeydownHandler = null;
  var typingActive = false;
  var typingTimer = null;
  var currentBeamMode = "hairline";
  // IME 组合输入锁：Enter 选词确认时 isComposing 可能已为 false，靠组合事件锁避免误判为发送
  var beamIsComposing = false;
  var beamComposingLockTimer = null;
  var pulseTimer = null;
  var beamState = { mode: "hairline", idleStrength: 0.65, focusStrength: 1.0, disabled: false };
  // 命名 handler 供 attach/update 共用，cleanup 可成对移除，避免匿名监听泄漏；解锁窗口 150ms（原 350ms 会吞选词后快速真实 Enter）
  var BEAM_COMPOSE_LOCK_MS = 150;
  var beamCompStart = function() {
    beamIsComposing = true;
    if (beamComposingLockTimer) { clearTimeout(beamComposingLockTimer); beamComposingLockTimer = null; }
    triggerTypingBreathe();
  };
  var beamCompUpdate = function() {
    beamIsComposing = true;
    triggerTypingBreathe();
  };
  var beamCompEnd = function() {
    triggerTypingBreathe();
    if (beamComposingLockTimer) clearTimeout(beamComposingLockTimer);
    beamComposingLockTimer = setTimeout(function(){ beamIsComposing = false; beamComposingLockTimer = null; }, BEAM_COMPOSE_LOCK_MS);
  };
  var beamCompKeyUp = function(e){
    if (e.keyCode === 229) {
      beamIsComposing = true;
      if (beamComposingLockTimer) clearTimeout(beamComposingLockTimer);
      beamComposingLockTimer = setTimeout(function(){ beamIsComposing = false; beamComposingLockTimer = null; }, BEAM_COMPOSE_LOCK_MS);
    }
  };

  function isBeamDisabled() {
    // 设置面板的 Beam 开关优先；URL/localStorage 逃生舱保留
    if (bgSettings && bgSettings.beam === false) return true;
    try {
      if (typeof location !== "undefined" && (location.search.indexOf("beam=0") !== -1 || location.search.indexOf("nobeam") !== -1 || location.search.indexOf("beam=false") !== -1)) return true;
      if (typeof localStorage !== "undefined" && localStorage.getItem("dsh-beam-disabled") === "1") return true;
    } catch(e) {}
    return false;
  }
  function getBeamThemeIsDark() { return !!state.dark; } // Border Beam 深浅两套参数跟随主题（浅色用 BEAM_CFG_LIGHT）
  function getBeamIdleStrength() { if (beamState && typeof beamState.idleStrength === "number") return beamState.idleStrength; return getBeamThemeIsDark() ? 0.65 : 0.5; }
  function resolveBorderRadius(el) {
    try {
      var cs = window.getComputedStyle(el);
      var v = parseFloat(cs.borderTopLeftRadius);
      if (!isNaN(v) && v > 0) return Math.round(v);
    } catch(e) {}
    return 16;
  }

  function ensureBeamStyles(borderRadius, variant) {
    var isDark = getBeamThemeIsDark();
    var r = typeof borderRadius === "number" ? borderRadius : 16;
    var v = variant || "colorful";
    var css = buildBeamCSS(BEAM_ID, r, isDark, v);
    if (!beamStyleTag) {
      beamStyleTag = document.getElementById("dsh-beam-css");
      if (!beamStyleTag) {
        beamStyleTag = document.createElement("style");
        beamStyleTag.id = "dsh-beam-css";
        document.head.appendChild(beamStyleTag);
      }
    }
    if (beamStyleTag.textContent !== css) beamStyleTag.textContent = css;
  }

  function setBeamStrength(v, opts) {
    var card = beamAttachedCard;
    if (!card) return;
    var strength = Math.max(0, Math.min(1, v));
    card.style.setProperty("--beam-strength", strength);
    if (opts && opts.persist) { try { localStorage.setItem("dsh-beam-strength", String(strength)); } catch(e) {} }
  }

  function findComposerInput(card) {
    if (!card) return null;
    return card.querySelector('textarea, [contenteditable="true"], [data-composer-input], .uV2eYG_input');
  }

  function isTyping() {
    return typingActive;
  }

  function triggerTypingBreathe() {
    var card = beamAttachedCard || document.querySelector('[data-composer-card="true"], .uV2eYG_card');
    if (!card || isExecuting()) return;
    typingActive = true;
    if (currentBeamMode !== "typing" && !isExecuting()) {
      applyBeamMode("typing");
    }
    // Refresh breathing animation by toggling data-typing
    card.removeAttribute("data-typing");
    void card.offsetWidth;
    card.setAttribute("data-typing", "");

    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(function() {
      typingActive = false;
      if (!isExecuting()) {
        updateBeamState();
      }
    }, 700);
  }

  function isPlanMode() {
    try {
      if (document.querySelector('[aria-label*="plan mode 已开启"], [aria-label*="Plan mode on"], [aria-label*="plan mode is on"], [aria-label*="Plan Mode on"]')) return true;
      // 0.1.5-rc.1：plan 状态由输入栏的 plan chip 承载（dsh-client-ui-plan PlanModeControl，
      // 类名 rS3zOq_chip）。该组件在非 plan mode 时 return null，仅计划模式开启才渲染，
      // 故其存在即 plan mode 开启，且与 locale 无关（上一行的 aria-label 判定保留为哈希漂移兜底）。
      // 原 [data-slot="plan"] 在 0.1.3-alpha.2 / 0.1.5-rc.1 均非合法槽位键（从未生效）；
      // 不可改用 [data-slot="conversation.input.plan"]——那是只要有会话就渲染的 plan 开关槽位，
      // 会导致 isPlanMode() 恒为 true、beam 永久停在 planning 态。
      if (document.querySelector('.rS3zOq_chip')) return true;
      if (document.documentElement.dataset && document.documentElement.dataset.planMode === "1") return true;
    } catch(e) {}
    return false;
  }

  function isRealExecuting() {
    try {
      var stopBtn = document.querySelector('button[aria-label*="停止生成"], button[aria-label*="Stop generating"], button[aria-label*="Stop generating message"], [data-composer-card] button[aria-label*="停止"], [data-composer-card] button[aria-label*="Stop"]');
      if (stopBtn && !stopBtn.disabled && stopBtn.offsetParent !== null) return true;
      // 身份限定执行探测：只认真实工具行 / 推理流 / 答案流的 DOM 特征，
      // 不再裸查全文档 [data-state="running"]——否则任意第三方面板
      // （如 AgentTeams 活动面板的成员/任务状态芯片）都会误触发执行态流光
      var EXECUTING_IDENTITY_SELECTOR = [
        '[data-tool][data-state="running"]',
        '[data-sample="bash"][data-state="running"]',
        '[data-subcalls] [data-tool][data-state="running"]',
        '.CY-8Ka_root[data-state="running"]',
        '.o3BgMG_root[data-state="running"]',
        '.iWrAna_card[data-state="running"]',
        '[data-variant="think"][data-state="running"]',
        '[data-variant="answer"][data-state="running"]',
        '[data-role="assistant"][data-streaming="true"]'
      ].join(", ");
      var runningRows = document.querySelectorAll(EXECUTING_IDENTITY_SELECTOR);
      for (var ri = 0; ri < runningRows.length; ri++) {
        var runningEl = runningRows[ri];
        if (!runningEl || runningEl.offsetParent === null) continue;
        if (runningEl.classList && (runningEl.classList.contains("dsh-thinking-orb-wrap") || runningEl.classList.contains("dsh-turn-status-text") || runningEl.classList.contains("dsh-thinking-orb-canvas"))) {
          continue;
        }
        return true;
      }
    } catch(e) {}
    return false;
  }

  function isExecuting() {
    try {
      if (pendingExecuting) return true;
      return isRealExecuting();
    } catch(e) { return false; }
  }

  function applyBeamMode(mode) {
    var card = beamAttachedCard;
    if (!card) return;

    currentBeamMode = mode;

    if (pulseTimer) {
      clearTimeout(pulseTimer);
      pulseTimer = null;
    }
    if (mode === "pulse") {
      pendingExecuting = false;
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    }

    var isDark = getBeamThemeIsDark();
    var r = resolveBorderRadius(card);
    var variant = mode === "typing" ? "mono" : (mode === "planning" ? "sunset" : "colorful");
    ensureBeamStyles(r, variant);

    // Clean state attributes and inline style overrides
    card.removeAttribute("data-active");
    card.removeAttribute("data-fading");
    card.removeAttribute("data-typing");
    card.removeAttribute("data-planning");
    card.removeAttribute("data-pulse");
    card.removeAttribute("data-paused");
    card.style.removeProperty("filter");
    card.style.removeProperty("--beam-hue-base");

    if (mode === "hairline") {
      card.setAttribute("data-beam", BEAM_ID);
      card.style.removeProperty("--beam-strength");
      card.style.setProperty("--beam-strength", "0.08");
      return;
    }

    if (mode === "typing") {
      card.setAttribute("data-beam", BEAM_ID);
      card.setAttribute("data-typing", "");
      card.removeAttribute("data-active");
      card.style.setProperty("--beam-strength", "0.85");
      card.style.setProperty("--beam-hue-base", "0deg");
      return;
    }

    if (mode === "planning") {
      card.setAttribute("data-beam", BEAM_ID);
      card.setAttribute("data-planning", "");
      card.setAttribute("data-active", "");
      card.style.setProperty("--beam-strength", "1");
      card.style.setProperty("--beam-hue-base", "15deg");
      return;
    }

    if (mode === "executing") {
      card.setAttribute("data-beam", BEAM_ID);
      card.setAttribute("data-active", "");
      card.style.setProperty("--beam-strength", "1");
      return;
    }

    if (mode === "pulse") {
      card.setAttribute("data-beam", BEAM_ID);
      card.setAttribute("data-pulse", "");
      card.style.setProperty("--beam-strength", "1");
      pulseTimer = setTimeout(function() {
        if (currentBeamMode === "pulse") {
          applyBeamMode("hairline");
        }
      }, 800);
      return;
    }
  }

  function resolveBeamMode() {
    if (isBeamDisabled()) return "hairline";
    if (pendingExecuting || isExecuting()) {
      if (isPlanMode()) return "planning";
      return "executing";
    }
    if (currentBeamMode === "pulse") return "pulse";
    if (typingActive) return "typing";
    return "hairline";
  }

  function updateBeamState() {
    if (!beamAttachedCard || !document.contains(beamAttachedCard) || !beamAttachedCard.isConnected) {
      var freshCard = document.querySelector('[data-composer-card="true"], .uV2eYG_card');
      if (freshCard && freshCard !== beamAttachedCard) {
        try { if (beamAttachedCard && beamAttachedCard._dshBeamCleanup) beamAttachedCard._dshBeamCleanup(); } catch(e) {}
        beamAttachedCard = null;
        attachComposerBeam();
        return;
      }
    }

    if (beamAttachedCard) {
      var freshInput = findComposerInput(beamAttachedCard);
      var boundInput = beamAttachedCard._dshBeamInput;
      if (freshInput && freshInput !== boundInput) {
        if (boundInput) {
          try {
            if (beamTypingHandler) {
              boundInput.removeEventListener("input", beamTypingHandler);
              boundInput.removeEventListener("change", beamTypingHandler);
            }
            if (beamKeydownHandler) {
              boundInput.removeEventListener("keydown", beamKeydownHandler);
            }
            boundInput.removeEventListener("compositionstart", beamCompStart);
            boundInput.removeEventListener("compositionupdate", beamCompUpdate);
            boundInput.removeEventListener("compositionend", beamCompEnd);
            boundInput.removeEventListener("keyup", beamCompKeyUp);
          } catch(e) {}
        }
        if (beamTypingHandler && beamKeydownHandler) {
          try {
            freshInput.addEventListener("input", beamTypingHandler);
            freshInput.addEventListener("change", beamTypingHandler);
            freshInput.addEventListener("keydown", beamKeydownHandler);
            freshInput.addEventListener("compositionstart", beamCompStart);
            freshInput.addEventListener("compositionupdate", beamCompUpdate);
            freshInput.addEventListener("compositionend", beamCompEnd);
            freshInput.addEventListener("keyup", beamCompKeyUp);
            beamAttachedCard._dshBeamInput = freshInput;
          } catch(e) {}
        }
      }
    }

    if (pendingExecuting && isRealExecuting()) {
      pendingExecuting = false;
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
    }

    var next = resolveBeamMode();

    if ((currentBeamMode === "executing" || currentBeamMode === "planning") &&
        next !== "executing" && next !== "planning" && next !== "pulse") {
      applyBeamMode("pulse");
      try { if (shared.refs.syncThinkingOrb) shared.refs.syncThinkingOrb(); } catch(e) {}
      return;
    }

    if (currentBeamMode === "pulse" && next === "pulse") {
      try { if (shared.refs.syncThinkingOrb) shared.refs.syncThinkingOrb(); } catch(e) {}
      return;
    }

    if (currentBeamMode !== next) {
      applyBeamMode(next);
    }
    try { if (shared.refs.syncThinkingOrb) shared.refs.syncThinkingOrb(); } catch(e) {}
  }

  function ensureBeamMutObs() {
    if (beamMutObs || beamCoalesceUnsub) return;
    if (shared.refs.subscribeCoalesced) {
      try {
        beamCoalesceUnsub = shared.refs.subscribeCoalesced(function() {
          if (!beamAttachedCard || !document.contains(beamAttachedCard)) {
            try { attachComposerBeam(); } catch(e) {}
          } else {
            try { updateBeamState(); } catch(e) {}
          }
        });
        return;
      } catch(e){}
    }
    if (!window.MutationObserver) return;
    beamMutObs = new MutationObserver(function() {
      if (!beamAttachedCard || !document.contains(beamAttachedCard)) {
        try { attachComposerBeam(); } catch(e) {}
      } else {
        try { updateBeamState(); } catch(e) {}
      }
    });
    var rootEl = document.querySelector("#root") || document.documentElement;
    try { beamMutObs.observe(rootEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "class", "data-plan-mode", "data-state", "data-status"] }); } catch(e) {}
  }
  function detachBeamMutObs() {
    if (beamCoalesceUnsub) { try { beamCoalesceUnsub(); } catch(e) {} beamCoalesceUnsub = null; return; }
    if (beamMutObs) { try { beamMutObs.disconnect(); } catch(e) {} beamMutObs = null; }
  }

    function attachComposerBeam() {
    if (isBeamDisabled()) return;
    if (beamAttachedCard && document.contains(beamAttachedCard)) return;
    var card = document.querySelector('[data-composer-card="true"], .uV2eYG_card');
    if (!card) return;
    card.setAttribute("data-beam", BEAM_ID);
    if (!card.querySelector("[data-beam-bloom]")) {
      var bloom = document.createElement("div");
      bloom.setAttribute("data-beam-bloom", "");
      card.appendChild(bloom);
    }
    var radius = resolveBorderRadius(card);
    ensureBeamStyles(radius, "colorful");
    card.style.setProperty("overflow", "visible");
    card.style.setProperty("isolation", "isolate");
    if (window.getComputedStyle(card).position === "static") card.style.position = "relative";
    beamAttachedCard = card;
    currentBeamMode = "hairline";
    updateBeamState();

    var input = findComposerInput(card);
    if (input) {
      beamTypingHandler = function() {
        triggerTypingBreathe();
      };
      beamKeydownHandler = function(e) {
        // 输入法组合中：优先以浏览器原生 isComposing / keyCode 229 为准，beamIsComposing 仅兜底非 Enter 按键，避免 150ms 锁吞选词后真实 Enter
        if (e.isComposing || e.keyCode === 229) {
          triggerTypingBreathe();
          return;
        }
        if (beamIsComposing) {
          if (e.key !== "Enter") {
            triggerTypingBreathe();
            return;
          }
          // Enter 且处于锁窗口但浏览器已判定非 composing：视为真实发送，透传至下方发送逻辑
        }
        if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
          // @/slash 联想菜单打开时：回车是选中候选（文件/命令/技能），不应进入彩色执行态，只触发白色呼吸
          var _menuOpen = false;
          try {
            var _lb = document.querySelector('[role="listbox"]');
            if (_lb && _lb.offsetParent !== null) _menuOpen = true;
            if (!_menuOpen) {
              var _m = document.querySelector('._3e4SsG_menu');
              if (_m && _m.offsetParent !== null) _menuOpen = true;
            }
            if (!_menuOpen) {
              var _ad = document.querySelector('[aria-activedescendant]');
              if (_ad) {
                var _aid = _ad.getAttribute('aria-activedescendant');
                if (_aid && document.getElementById(_aid) && document.getElementById(_aid).offsetParent !== null) _menuOpen = true;
              }
            }
          } catch (_e) {}
          if (_menuOpen) {
            triggerTypingBreathe();
            return;
          }
          var val = input.value !== undefined ? input.value : input.textContent;
          if (val && String(val).trim().length > 0) {
            // 回车发送：设置短时 pending（1.4s），桥接 DOM 尚未挂载 running 状态的空档，
            // 让 Thinking Orbs 与 Border Beam 立即进入执行态，避免工具间隙误判为空闲
            pendingExecuting = true;
            if (pendingTimer) clearTimeout(pendingTimer);
            pendingTimer = setTimeout(function(){ pendingExecuting = false; try{ updateBeamState(); }catch(e){} }, 1400);
            try { if (shared.refs.syncThinkingOrb) shared.refs.syncThinkingOrb(); } catch(e) {}
            setTimeout(function(){ try{ updateBeamState(); }catch(e){} }, 60);
            setTimeout(function(){ try{ updateBeamState(); }catch(e){} }, 180);
            if (!typingActive) triggerTypingBreathe();
            return;
          } else {
            triggerTypingBreathe();
            return;
          }
        }
        if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key && (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete")) {
          triggerTypingBreathe();
        }
      };

      input.addEventListener("input", beamTypingHandler);
      input.addEventListener("change", beamTypingHandler);
      input.addEventListener("keydown", beamKeydownHandler);
      input.addEventListener("compositionstart", beamCompStart);
      input.addEventListener("compositionupdate", beamCompUpdate);
      input.addEventListener("compositionend", beamCompEnd);
      input.addEventListener("keyup", beamCompKeyUp);
      card._dshBeamInput = input;
    }

    var sendBtn = card.querySelector('button[aria-label="Send message"], button[aria-label="发送消息"], button[aria-label*="Send"], button[aria-label*="发送"], .uV2eYG_primary');
    if (sendBtn) {
      var sendHandler = function() {
        typingActive = false;
        if (typingTimer) clearTimeout(typingTimer);
        pendingExecuting = true;
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(function() { pendingExecuting = false; updateBeamState(); }, 2000);
        updateBeamState();
      };
      sendBtn.addEventListener("click", sendHandler);
      card._dshBeamSendBtn = sendBtn;
      card._dshBeamSendHandler = sendHandler;
    }

    if (window.ResizeObserver) {
      if (beamResizeObs) try { beamResizeObs.disconnect(); } catch(e) {}
      beamResizeObs = new ResizeObserver(function() {
        if (!beamAttachedCard) return;
        var nr = resolveBorderRadius(beamAttachedCard);
        ensureBeamStyles(nr, currentBeamMode === "typing" ? "mono" : (currentBeamMode === "planning" ? "sunset" : "colorful"));
      });
      try { beamResizeObs.observe(card); } catch(e) {}
    }

    if (beamPollTimer) clearInterval(beamPollTimer);
    beamPollTimer = setInterval(updateBeamState, 450);

    ensureBeamMutObs();

    card._dshBeamCleanup = function() {
      if (input) {
        try {
          if (beamTypingHandler) {
            input.removeEventListener("input", beamTypingHandler);
            input.removeEventListener("change", beamTypingHandler);
          }
          if (beamKeydownHandler) {
            input.removeEventListener("keydown", beamKeydownHandler);
          }
          input.removeEventListener("compositionstart", beamCompStart);
          input.removeEventListener("compositionupdate", beamCompUpdate);
          input.removeEventListener("compositionend", beamCompEnd);
          input.removeEventListener("keyup", beamCompKeyUp);
        } catch(e) {}
      }
      if (card._dshBeamSendBtn && card._dshBeamSendHandler) {
        try { card._dshBeamSendBtn.removeEventListener("click", card._dshBeamSendHandler); } catch(e) {}
      }
      if (beamPollTimer) { clearInterval(beamPollTimer); beamPollTimer = null; }
      try { detachBeamMutObs(); } catch(e) {}
      if (beamResizeObs) { try { beamResizeObs.disconnect(); beamResizeObs = null; } catch(e) {} }
      if (pulseTimer) { clearTimeout(pulseTimer); pulseTimer = null; }
      if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
      if (beamComposingLockTimer) { clearTimeout(beamComposingLockTimer); beamComposingLockTimer = null; }
      beamIsComposing = false;
      try { if (shared.refs.stopThinkingOrb) shared.refs.stopThinkingOrb(); } catch(e) {}
    };
  }

  function detachComposerBeam() {
    var card = beamAttachedCard;
    if (!card) return;
    try { if (card._dshBeamCleanup) card._dshBeamCleanup(); } catch(e) {}
    try { if (shared.refs.stopThinkingOrb) shared.refs.stopThinkingOrb(); } catch(e) {}
    card.removeAttribute("data-beam");
    card.removeAttribute("data-active");
    card.removeAttribute("data-fading");
    card.removeAttribute("data-typing");
    card.removeAttribute("data-planning");
    card.removeAttribute("data-pulse");
    card.removeAttribute("data-paused");
    card.style.removeProperty("--beam-strength");
    card.style.removeProperty("--beam-hue-base");
    card.style.removeProperty("filter");
    card.style.removeProperty("isolation");
    var bloom = card.querySelector("[data-beam-bloom]");
    if (bloom) try { bloom.remove(); } catch(e) {}
    if (beamResizeObs) try { beamResizeObs.disconnect(); beamResizeObs = null; } catch(e) {}
    // 清理挂在 DOM 节点上的自定义属性，防止 React 节点复用池携带旧闭包
    try { delete card._dshBeamCleanup; } catch(e) {}
    try { delete card._dshBeamInput; } catch(e) {}
    try { delete card._dshBeamSendBtn; } catch(e) {}
    try { delete card._dshBeamSendHandler; } catch(e) {}
    beamAttachedCard = null;
    currentBeamMode = "hairline";
  }

  function refreshBeamTheme() {
    if (!beamAttachedCard) return;
    var r = resolveBorderRadius(beamAttachedCard);
    var v = currentBeamMode === "typing" ? "mono" : (currentBeamMode === "planning" ? "sunset" : "colorful");
    ensureBeamStyles(r, v);
    updateBeamState();
  }

  function watchBeamComposer() {
    if (isBeamDisabled()) { detachComposerBeam(); return; }
    attachComposerBeam();
    ensureBeamMutObs();
  }

  /* ------------------------------------------------------------------ *
   * Border Beam — Todo List Panel integration
   * ------------------------------------------------------------------ */
  var todoAttachedPanel = null;
  var todoPollTimer = null;
  var todoMutObs = null;
  var todoCoalesceUnsub = null;

  function findTodoPanel() {
    var panel = document.querySelector('[data-testid="todo-panel"], .lXshSW_root, [data-slot="conversation.input.dock"] [data-testid="todo-panel"], [data-slot="conversation.input.dock"] .lXshSW_root');
    if (panel) return panel;
    var dockSections = document.querySelectorAll('[data-slot="conversation.input.dock"] section, [data-slot="conversation.input.dock"] > div > section');
    for (var i = 0; i < dockSections.length; i++) {
      var s = dockSections[i];
      if (s.querySelector('.lXshSW_body, .lXshSW_header, [data-testid="todo-panel"], [aria-label*="待办"], [aria-label*="Todo"], [aria-label*="todo"]')) {
        return s;
      }
    }
    return null;
  }

  function isTodoActive(panel) {
    if (!panel) return false;
    if (panel.querySelector('[data-status="in_progress"]')) return true;
    if (panel.querySelector('.lXshSW_glyphProgress, [class*="glyphProgress"]')) return true;
    var progressEl = panel.querySelector('.lXshSW_progress, [class*="progress"]');
    if (progressEl && progressEl.textContent) {
      var ptxt = progressEl.textContent.toLowerCase();
      if (ptxt.indexOf('进行中') !== -1 || ptxt.indexOf('in progress') !== -1 || ptxt.indexOf('active') !== -1) {
        return true;
      }
    }
    if (isExecuting()) return true;
    return false;
  }

  function cleanupTodoPanelDom(panel) {
    if (!panel) return;
    try {
      panel.removeAttribute("data-beam");
      panel.removeAttribute("data-active");
      panel.removeAttribute("data-pulse-active");
      var bloom = panel.querySelector("[data-beam-bloom]");
      if (bloom) bloom.remove();
    } catch(e) {}
  }

  function updateTodoBeamState() {
    if (!state.dark) {
      // 浅色主题：不放任何 DOM 标记/元素，保持官方原版任务清单
      if (todoAttachedPanel) { try { cleanupTodoPanelDom(todoAttachedPanel); } catch(e){} todoAttachedPanel = null; }
      return;
    }
    if (isBeamDisabled() || !bgSettings.beam) {
      if (todoAttachedPanel) {
        cleanupTodoPanelDom(todoAttachedPanel);
        todoAttachedPanel = null;
      }
      return;
    }
    var panel = findTodoPanel();
    if (!panel || !document.contains(panel)) {
      if (todoAttachedPanel) {
        cleanupTodoPanelDom(todoAttachedPanel);
        todoAttachedPanel = null;
      }
      return;
    }
    if (panel !== todoAttachedPanel || panel.getAttribute("data-beam") !== "dsh-todo" || !panel.querySelector("[data-beam-bloom]")) {
      attachTodoBeam(panel);
      return;
    }
    var hasActiveTask = isTodoActive(panel);
    if (hasActiveTask) {
      if (!panel.hasAttribute("data-pulse-active")) panel.setAttribute("data-pulse-active", "");
      if (!panel.hasAttribute("data-active")) panel.setAttribute("data-active", "");
    } else {
      if (panel.hasAttribute("data-pulse-active")) panel.removeAttribute("data-pulse-active");
      if (panel.hasAttribute("data-active")) panel.removeAttribute("data-active");
    }
  }

  function attachTodoBeam(panel) {
    if (!panel) panel = findTodoPanel();
    if (!panel) return;
    if (!state.dark) {
      if (todoAttachedPanel) { try { cleanupTodoPanelDom(todoAttachedPanel); } catch(e){} todoAttachedPanel = null; }
      return;
    }
    if (isBeamDisabled() || !bgSettings.beam) return;
    if (todoAttachedPanel && todoAttachedPanel !== panel) {
      cleanupTodoPanelDom(todoAttachedPanel);
    }
    todoAttachedPanel = panel;
    if (panel.getAttribute("data-beam") !== "dsh-todo") {
      panel.setAttribute("data-beam", "dsh-todo");
    }
    if (!panel.querySelector("[data-beam-bloom]")) {
      var bloom = document.createElement("div");
      bloom.setAttribute("data-beam-bloom", "");
      bloom.setAttribute("aria-hidden", "true");
      panel.appendChild(bloom);
    }
    var hasActiveTask = isTodoActive(panel);
    if (hasActiveTask) {
      panel.setAttribute("data-pulse-active", "");
      panel.setAttribute("data-active", "");
    } else {
      panel.removeAttribute("data-pulse-active");
      panel.removeAttribute("data-active");
    }
  }

  function ensureTodoMutObs() {
    if (todoMutObs || todoCoalesceUnsub) return;
    if (shared.refs.subscribeCoalesced) {
      try {
        todoCoalesceUnsub = shared.refs.subscribeCoalesced(function() {
          try {
            var panel = findTodoPanel();
            if (!todoAttachedPanel || !document.contains(todoAttachedPanel) || (panel && panel !== todoAttachedPanel) || (panel && panel.getAttribute("data-beam") !== "dsh-todo")) {
              if (panel) attachTodoBeam(panel);
              else updateTodoBeamState();
            } else {
              updateTodoBeamState();
            }
          } catch(e) {}
        });
        return;
      } catch(e) {}
    }
    if (!window.MutationObserver) return;
    todoMutObs = new MutationObserver(function() {
      try {
        var panel = findTodoPanel();
        if (!todoAttachedPanel || !document.contains(todoAttachedPanel) || (panel && panel !== todoAttachedPanel) || (panel && panel.getAttribute("data-beam") !== "dsh-todo")) {
          if (panel) attachTodoBeam(panel);
          else updateTodoBeamState();
        } else {
          updateTodoBeamState();
        }
      } catch(e) {}
    });
    var rootEl = document.querySelector("#root") || document.documentElement;
    try {
      todoMutObs.observe(rootEl, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-status", "class", "aria-expanded", "data-state", "data-testid", "aria-label", "data-beam"]
      });
    } catch(e) {}
  }

  function detachTodoMutObs() {
    if (todoCoalesceUnsub) { try { todoCoalesceUnsub(); } catch(e) {} todoCoalesceUnsub = null; return; }
    if (todoMutObs) { try { todoMutObs.disconnect(); } catch(e) {} todoMutObs = null; }
  }

  function detachTodoBeam() {
    var panel = todoAttachedPanel || findTodoPanel();
    if (panel) cleanupTodoPanelDom(panel);
    if (todoPollTimer) { clearInterval(todoPollTimer); todoPollTimer = null; }
    detachTodoMutObs();
    todoAttachedPanel = null;
  }

  function watchBeamTodo() {
    if (isBeamDisabled() || !bgSettings.beam) { detachTodoBeam(); return; }
    attachTodoBeam();
    ensureTodoMutObs();
    if (!todoPollTimer) {
      todoPollTimer = setInterval(updateTodoBeamState, 450);
    }
  }

  shared.refs.isExecuting = isExecuting;
  shared.refs.isPlanMode = isPlanMode;
  shared.refs.getBeamThemeIsDark = getBeamThemeIsDark;
  shared.refs.watchBeamComposer = watchBeamComposer;
  shared.refs.watchBeamTodo = watchBeamTodo;
  shared.refs.detachComposerBeam = detachComposerBeam;
  shared.refs.detachTodoBeam = detachTodoBeam;
  shared.refs.refreshBeamTheme = refreshBeamTheme;
  shared.refs.getBeamAttachedCard = function () { return beamAttachedCard; };
  shared.refs.beamHandle = {
    attach: attachComposerBeam,
    detach: detachComposerBeam,
    attachTodo: attachTodoBeam,
    detachTodo: detachTodoBeam,
    updateTodo: updateTodoBeamState,
    get todoPanel() { return todoAttachedPanel; },
    setStrength: function(v) { setBeamStrength(v, { persist: false }); },
    setIdleStrength: function(v) { beamState.idleStrength = Math.max(0, Math.min(1, v)); if (beamAttachedCard) beamAttachedCard.style.setProperty("--beam-strength", String(beamState.idleStrength)); refreshBeamTheme(); },
    setFocusStrength: function(v) { beamState.focusStrength = Math.max(0, Math.min(1, v)); if (beamAttachedCard) beamAttachedCard.style.setProperty("--beam-strength", String(beamState.focusStrength)); refreshBeamTheme(); },
    disable: function() { try { localStorage.setItem("dsh-beam-disabled", "1"); } catch(e) {} detachComposerBeam(); detachTodoBeam(); },
    enable: function() { try { localStorage.removeItem("dsh-beam-disabled"); } catch(e) {} watchBeamComposer(); watchBeamTodo(); },
    refresh: function() { refreshBeamTheme(); updateTodoBeamState(); },
    get state() { return currentBeamMode; },
    get isExecuting() { return isExecuting(); },
    get isTyping() { return isTyping(); },
    update: updateBeamState,
    get id() { return BEAM_ID; },
    get card() { return beamAttachedCard; }
  };
}




/* ===================== orbs.js ===================== */
/* ------------------------------------------------------------------ *
 * src/orbs.js — Thinking Orbs 运行时（initOrbs）
 *   工具调用状态映射、DOM 扫描、Orb 画布启动/停止与状态栏文字联动；
 *   几何数学（getOrbPreset 等）在 src/orbs-math.js（工厂级片段）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initOrbs(shared) {
  var bgSettings = shared.settings;

  var TOOL_STATE_MAP = {
    // 1. Searching (globe 经纬扫描网格球)
    "grep": { state: "searching", text: "Searching files…" },
    "glob": { state: "searching", text: "Finding files…" },
    "web_search": { state: "searching", text: "Searching web…" },
    "find_dsh_plugin": { state: "searching", text: "Searching plugins…" },
    "lsp_symbols": { state: "searching", text: "Finding symbols…" },

    // 2. Listening / Inspecting (wave 声波起伏球)
    "read": { state: "listening", text: "Reading file…" },
    "read_image": { state: "listening", text: "Inspecting image…" },
    "skill": { state: "listening", text: "Loading skill…" },
    "get_goal": { state: "listening", text: "Reading goal…" },
    "web_fetch": { state: "listening", text: "Fetching web page…" },
    "lsp_diagnostics": { state: "listening", text: "Diagnosing code…" },
    "lsp_completion": { state: "listening", text: "Getting completions…" },
    "lsp_signature": { state: "listening", text: "Inspecting signature…" },
    "lsp_inlay_hints": { state: "listening", text: "Reading inlay hints…" },

    // 3. Composing / Writing (ribbon 扭转流光缎带)
    "write": { state: "composing", text: "Writing file…" },
    "edit": { state: "composing", text: "Editing file…" },
    "lsp_format": { state: "composing", text: "Formatting file…" },
    "lsp_rename": { state: "composing", text: "Renaming symbol…" },
    "lsp_code_action": { state: "composing", text: "Applying code action…" },

    // 4. Solving / Commands (rubik 旋转魔方立方矩阵)
    "bash": { state: "solving", text: "Running command…" },
    "run_code": { state: "solving", text: "Running code…" },

    // 5. Connecting / Subagents (web 动态网络拓扑 / 神经节点)
    "subagent": { state: "connecting", text: "Connecting subagent…" },
    "subagent_fork": { state: "connecting", text: "Delegating task…" },
    "workflow": { state: "connecting", text: "Running workflow…" },
    "ralph": { state: "connecting", text: "Running Ralph…" },
    "send_message": { state: "connecting", text: "Sending message…" },
    "interrupt_agent": { state: "connecting", text: "Interrupting agent…" },
    "list_agents": { state: "connecting", text: "Listing agents…" },
    "job_output": { state: "connecting", text: "Checking job output…" },
    "job_list": { state: "connecting", text: "Listing jobs…" },
    "job_kill": { state: "connecting", text: "Stopping job…" },

    // 6. Shaping / Tasks & Goals (morph 几何变形多面体)
    "todo_write": { state: "shaping", text: "Updating tasks…" },
    "create_goal": { state: "shaping", text: "Creating goal…" },
    "update_goal": { state: "shaping", text: "Updating goal…" },
    "exit_plan_mode": { state: "shaping", text: "Finalizing plan…" },

    // 7. Weaving / Cordis plugins (braid 编织双螺旋)
    "cordis_define": { state: "weaving", text: "Weaving plugin…" },
    "cordis_run": { state: "weaving", text: "Activating plugin…" },
    "cordis_stop": { state: "weaving", text: "Stopping plugin…" },
    "cordis_undefine": { state: "weaving", text: "Removing plugin…" },
    "cordis_inspect_list": { state: "weaving", text: "Inspecting runtime…" },
    "cordis_inspect_query": { state: "weaving", text: "Querying runtime…" },
    "cordis_inspect_self": { state: "weaving", text: "Inspecting plugin…" },

    // 8. Breathing / Interactive questions (ring 光晕呼吸环)
    "ask_user_question": { state: "breathing", text: "Asking question…" }
  };

  function truncateStr(str, maxLen) {
    if (!str || typeof str !== "string") return "";
    str = str.trim();
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + "…";
  }

  // 保留扩展名的截断：超长时 head + "…" + ext（ext 为最后一个 '.' 之后部分；
  // '.' 不存在或位于首字符时退化为普通截断）。替代裸截断，保住 ".ts" 等扩展名可读性。
  function truncateKeepExt(str, max) {
    if (!str || typeof str !== "string") return "";
    str = str.trim();
    if (str.length <= max) return str;
    var dotIdx = str.lastIndexOf(".");
    if (dotIdx <= 0) return truncateStr(str, max);
    var ext = str.slice(dotIdx);
    var headLen = max - ext.length - 1;
    if (headLen < 1) return truncateStr(str, max); // 扩展名本身过长时退化为普通截断
    return str.slice(0, headLen) + "…" + ext;
  }

  // 可见性判断（替代 offsetParent 强制重排）：优先 checkVisibility，
  // 回退 hidden 属性检查，杜绝流式输出期间每 50ms 扫描触发的 Forced Sync Layout。
  function isVisible(el) {
    if (!el) return false;
    try {
      if (typeof el.checkVisibility === "function") return !!el.checkVisibility();
    } catch(e) {}
    try {
      if (el.hasAttribute) return !el.hasAttribute("hidden");
    } catch(e) {}
    return true;
  }

  function extractSummaryDetail(el, toolName) {
    try {
      if (!el) return null;
      // 1. 文件链接类（read, write, edit, lsp_*）
      var fileBtn = el.querySelector('button[class*="fileLink"], .o3BgMG_fileLink, [data-file-link]');
      if (fileBtn && fileBtn.textContent) {
        var rawPath = fileBtn.textContent.trim();
        rawPath = rawPath.replace(/[\/\\]+$/, ""); // 先去尾斜杠再分段，避免产生空末段
        var pathSegs = rawPath.split(/[/\\]/);
        var fn = pathSegs.pop() || "";
        var dirFallback = false;
        if (fn === "" && pathSegs.length > 0) {
          // 末段为空（路径以分隔符结尾）：回退取倒数第二段并在文案前标注目录
          fn = pathSegs.pop() || "";
          dirFallback = true;
        }
        if (fn) {
          var shortFn = truncateKeepExt(fn, 26);
          if (dirFallback) shortFn = "dir " + shortFn;
          if (toolName === "read") return "Reading " + shortFn;
          if (toolName === "write") return "Writing " + shortFn;
          if (toolName === "edit") return "Editing " + shortFn;
          if (toolName.indexOf("lsp_") === 0) return "LSP: " + shortFn;
          return toolName + ": " + shortFn;
        }
      }

      // 2. 通用摘要类（grep, glob, bash, skill, web_search, subagent, etc.）
      var sumEl = el.querySelector('[class*="summary"]:not([class*="error"]), .o3BgMG_summary, .CY-8Ka_summary, .iWrAna_summary, [class*="title"]');
      if (sumEl && sumEl.textContent) {
        var txt = sumEl.textContent.trim();
        if (txt.length > 0) {
          if (toolName === "grep") return "Searching: " + truncateKeepExt(txt, 26);
          if (toolName === "glob") return "Finding: " + truncateKeepExt(txt, 26);
          if (toolName === "bash") {
            // 先剥离前置环境变量赋值（如 FOO=bar BAZ="x y" ），再剥 bash -c 包装
            var cmd = txt.replace(/^([A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/, "").replace(/^bash\s*(-c\s*)?/i, "").replace(/^["']|["']$/g, "");
            return "Running: " + truncateKeepExt(cmd, 26);
          }
          if (toolName === "run_code") return "Running: " + truncateKeepExt(txt, 26);
          if (toolName === "skill") return "Skill: " + truncateKeepExt(txt, 26);
          if (toolName === "web_search") return "Web: " + truncateKeepExt(txt, 26);
          if (toolName === "web_fetch") return "Fetching: " + truncateKeepExt(txt, 26);
          if (toolName === "find_dsh_plugin") return "Plugin: " + truncateKeepExt(txt, 26);
          if (toolName === "subagent" || toolName === "subagent_fork") return "Subagent: " + truncateStr(txt, 24);
          if (toolName === "workflow") return "Workflow: " + truncateStr(txt, 24);
          if (toolName === "ralph") return "Ralph: " + truncateStr(txt, 24);
          if (toolName === "todo_write") return "Tasks: " + truncateStr(txt, 24);
          if (toolName.indexOf("cordis_") === 0) return "Plugin: " + truncateStr(txt, 24);
          if (toolName.indexOf("lsp_") === 0) return "LSP: " + truncateStr(txt, 24);
          if (toolName.indexOf("browser_") === 0) return "Browser: " + truncateStr(txt, 24);
          return truncateStr(txt, 28);
        }
      }
    } catch(e) {}
    return null;
  }

  // —— 新调度：最小可视时长 + 等待态 + 队列，避免快工具被跳过 —— //
  var lastActiveToolRecord = {
    state: null,
    text: null,
    tool: null,
    timestamp: 0
  };
  var MIN_TOOL_DWELL_MS = 600;
  var WAITING_WINDOW_MS = 1200;       // 工具结束后的统一 Waiting 时间窗（0 ~ 1200ms）
  var RESPONDING_FALLBACK_MS = 1500;  // 未命中答案流节点时，距最后工具记录超过该时长即判定正文流式输出
  var QUEUE_TTL_MS = 2500;            // 队列项存活时长，超期丢弃防旧任务幽灵回放
  var WAITING_TEXT = "Waiting…";
  var RESPONDING_TEXT = "Responding…";
  var RESPONDING_FALLBACK_MAX_MS = 20000; // 无流标记模型长思考的兜底上限：超时回退 Thinking…
  var displayInfo = null;
  var displaySince = 0;
  var toolQueue = [];
  var prevExecuting = false;          // 上一轮 isExecuting 快照：用于识别“新一轮执行开始”

  // 非具体工具的生命周期态（waiting/thinking 等）：与它们切换时不受最小可视时长扣住，
  // 否则幽灵 Thinking 会借 dwell 多停留一拍形成双重闪烁
  function isGenericToolKey(toolKey) {
    return toolKey === "waiting" || toolKey === "thinking" || toolKey === "idle" ||
           toolKey === "fallback" || toolKey === "responding" ||
           toolKey === "reasoning" || toolKey === "plan" ||
           toolKey === "ask_user_question" || toolKey === "exit_plan_mode";
  }

  // 交互卡片（用户提问 / 计划审核）存在性检测：结果缓存 200ms 防抖。
  // 存在时小球启动门控放行、空闲清理跳过，保证 breathing/shaping 动效在交互阶段持续可见。
  var interactiveCardCache = { ts: 0, hit: false };
  function hasInteractiveCard() {
    var nowMs = Date.now();
    if (nowMs - interactiveCardCache.ts < 200) return interactiveCardCache.hit;
    interactiveCardCache.ts = nowMs;
    interactiveCardCache.hit = false;
    try {
      var qEl = document.querySelector('.Mbwy4a_card, [class*="QuestionComposer"]');
      if (qEl && isVisible(qEl)) interactiveCardCache.hit = true;
    } catch(e) {}
    if (!interactiveCardCache.hit) {
      try {
        var pEl = document.querySelector('.LVzXQa_card, [class*="PlanReviewPanel"]');
        if (pEl && isVisible(pEl)) interactiveCardCache.hit = true;
      } catch(e) {}
    }
    return interactiveCardCache.hit;
  }

  // 正文流式输出（答案流节点）探测：候选选择器逐个匹配，整体 try/catch 包裹
  function detectRespondingStream() {
    try {
      var sels = [
        '[data-variant="answer"][data-state="running"]',
        '[data-role="assistant"][data-streaming="true"]'
      ];
      for (var si = 0; si < sels.length; si++) {
        var el = document.querySelector(sels[si]);
        if (el && isVisible(el)) return true;
      }
    } catch(e) {}
    return false;
  }

  function rawDetect() {
    try {
      // Tier 1: 优先检测当前处于 running 状态的工具调用行 / 命令 / 子分派
      var runningRows = document.querySelectorAll('[data-tool][data-state="running"], [data-sample="bash"][data-state="running"], [data-subcalls] [data-tool][data-state="running"], .CY-8Ka_root[data-state="running"], .o3BgMG_root[data-state="running"], .iWrAna_card[data-state="running"], .ztWv_q_subCalls [data-tool][data-state="running"]');
      if (runningRows && runningRows.length > 0) {
        // 并发工具数：剔除“祖先已在集合内”的行（run_code 父行与其 running 子调用并存时
        // 父子会同时命中并集选择器），避免 N 双计产生 “Running 4 tools… (3 tools)” 式双重文案
        var concurrentN = 0;
        for (var ci = 0; ci < runningRows.length; ci++) {
          var nested = false;
          for (var cj = 0; cj < runningRows.length; cj++) {
            if (cj === ci) continue;
            try {
              if (runningRows[cj].getAttribute("data-tool") && runningRows[cj].contains(runningRows[ci])) { nested = true; break; }
            } catch(_ce) {}
          }
          if (!nested) concurrentN++;
        }
        for (var i = runningRows.length - 1; i >= 0; i--) {
          var row = runningRows[i];
          if (row.classList && (row.classList.contains("EvIC1a_turnStatus") || row.classList.contains("dsh-turn-status-text"))) continue;
          var tool = row.getAttribute("data-tool");
          if (!tool && (row.classList.contains("CY-8Ka_root") || row.closest(".CY-8Ka_card") || row.getAttribute("data-sample") === "bash")) {
            tool = "bash";
          }
          if (!tool && (row.classList.contains("iWrAna_card") || row.closest(".iWrAna_card"))) {
            tool = "skill";
          }
          if (!tool) {
            var parent = row.closest("[data-tool]");
            if (parent) tool = parent.getAttribute("data-tool");
          }
          var subK = 0;
          if (tool === "run_code") {
            // 子调用并发：querySelectorAll 取全部 running 子调用，末位作为 state 映射来源
            var subCallList = null;
            try {
              subCallList = row.querySelectorAll('[data-subcalls] [data-tool][data-state="running"], .ztWv_q_subCalls [data-tool][data-state="running"]');
            } catch(_se) { subCallList = null; }
            if (subCallList && subCallList.length > 0) {
              var subCallRunning = subCallList[subCallList.length - 1];
              var subTool = subCallRunning.getAttribute("data-tool");
              if (subTool) {
                row = subCallRunning;
                tool = subTool;
                subK = subCallList.length;
              }
            }
          }
          if (tool) {
            var mapped = TOOL_STATE_MAP[tool];
            var stateKey = mapped ? mapped.state : (
              tool.indexOf("cordis_") === 0 ? "weaving" :
              tool.indexOf("subagent") === 0 ? "connecting" :
              tool.indexOf("lsp_") === 0 ? "listening" :
              tool.indexOf("browser_") === 0 ? "solving" :
              tool.indexOf("read") === 0 ? "listening" : "composing"
            );
            var defaultTxt = mapped ? mapped.text : (tool + "…");
            var customDetail = extractSummaryDetail(row, tool);
            var resolvedText;
            if (concurrentN > 1) {
              // 并发聚合：多个工具同时 running 时合并为一条计数文案（state 仍取倒序第一个映射）
              resolvedText = "Running " + concurrentN + " tools…";
            } else {
              resolvedText = customDetail || defaultTxt;
            }
            if (subK > 1) resolvedText += " (" + subK + " tools)";
            return {
              state: stateKey,
              text: resolvedText,
              tool: tool
            };
          }
        }
      }

      // Tier 2: 活跃的思考/推理流 (Reasoning Stream) — 纯 Thinking，不拼接具体摘要
      var reasoningEl = document.querySelector('[data-variant="think"][data-state="running"]');
      if (reasoningEl && isVisible(reasoningEl)) {
        var thinkText = "Thinking…";
        return { state: "composing", text: thinkText, tool: "reasoning" };
      }

      // Tier 3: 用户提问与计划待审交互卡片
      var questionEl = document.querySelector('.Mbwy4a_card, [class*="QuestionComposer"]');
      if (questionEl && isVisible(questionEl)) {
        return { state: "breathing", text: "Asking question…", tool: "ask_user_question" };
      }
      var planReviewEl = document.querySelector('.LVzXQa_card, [class*="PlanReviewPanel"]');
      if (planReviewEl && isVisible(planReviewEl)) {
        return { state: "shaping", text: "Reviewing plan…", tool: "exit_plan_mode" };
      }

      // Tier 5: 活跃 Todo 项追踪（仅 executing 时）
      var executing = shared.refs.isExecuting ? shared.refs.isExecuting() : false;
      if (executing) {
        var activeTodoEl = document.querySelector('[data-testid="todo-panel"] [data-status="in_progress"], [data-slot="conversation.input.dock"] [data-status="in_progress"], [class*="todo"] [data-status="in_progress"]');
        if (activeTodoEl && activeTodoEl.textContent) {
          var todoContent = activeTodoEl.textContent.trim();
          if (todoContent.length > 0) {
            return { state: "shaping", text: "Task: " + truncateStr(todoContent, 24), tool: "todo_write" };
          }
        }
      }
    } catch(e) {}
    return null;
  }

  function resolveActiveToolState() {
    try {
      var executing = shared.refs.isExecuting ? shared.refs.isExecuting() : false;
      var now = Date.now();

      // 新一轮执行开始的检测已移至 syncThinkingOrb：renderOrb 心跳在 Stop 时已死，
      // 快照在此更新存在观测盲区（Stop 后 executing=false 永不被观测，prevExecuting 卡死，
      // 上轮 record 会泄漏进新轮并误显 Responding）

      var candidate = rawDetect();

      if (candidate) {
        lastActiveToolRecord.state = candidate.state;
        lastActiveToolRecord.text = candidate.text;
        lastActiveToolRecord.tool = candidate.tool;
        lastActiveToolRecord.timestamp = now;

        if (!displayInfo) {
          displayInfo = candidate;
          displaySince = now;
          return candidate;
        }
        if (displayInfo.tool === candidate.tool && displayInfo.text === candidate.text && displayInfo.state === candidate.state) {
          displayInfo = candidate;
          return candidate;
        }
        if (now - displaySince < MIN_TOOL_DWELL_MS) {
          var alreadyQueued = false;
          for (var qi = 0; qi < toolQueue.length; qi++) {
            // tool+text 双字段都匹配才视为同一队列项（修复同名工具不同文案被静默覆写）
            if (toolQueue[qi].tool === candidate.tool && toolQueue[qi].text === candidate.text) { alreadyQueued = true; break; }
          }
          if (!alreadyQueued) {
            if (toolQueue.length < 8) toolQueue.push({ state: candidate.state, text: candidate.text, tool: candidate.tool, queuedAt: now });
            else toolQueue[toolQueue.length - 1] = { state: candidate.state, text: candidate.text, tool: candidate.tool, queuedAt: now };
          } else {
            for (var qj = 0; qj < toolQueue.length; qj++) {
              if (toolQueue[qj].tool === candidate.tool && toolQueue[qj].text === candidate.text) {
                toolQueue[qj] = { state: candidate.state, text: candidate.text, tool: candidate.tool, queuedAt: now };
              }
            }
          }
          return displayInfo;
        } else {
          displayInfo = candidate;
          displaySince = now;
          return candidate;
        }
      }

      // 无候选：优先消化队列（保证快工具至少露面一次）；超期(TTL)项循环 shift 丢弃，防旧任务幽灵回放。
      // 仅在回合仍活跃（executing 或交互卡片在场）时消化：Stop 后残余未过期项直接进入下方清理，不再回放
      if (toolQueue.length > 0 && (executing || hasInteractiveCard()) &&
          (!displayInfo || now - displaySince >= MIN_TOOL_DWELL_MS)) {
        var next = null;
        while (toolQueue.length > 0) {
          var head = toolQueue.shift();
          if (head && typeof head.queuedAt === "number" && now - head.queuedAt <= QUEUE_TTL_MS) { next = head; break; }
        }
        if (next) {
          displayInfo = next;
          displaySince = now;
          lastActiveToolRecord.state = next.state;
          lastActiveToolRecord.text = next.text;
          lastActiveToolRecord.tool = next.tool;
          lastActiveToolRecord.timestamp = now;
          return next;
        }
      }

      // 非执行态（Stop/取消/回合结束）：立即清空队列与展示，快速前进不留 600ms 旧状态残留，
      // 下一轮启动无旧态闪烁；存在交互卡片（提问呼吸环 / 计划审核 shaping）时跳过清理保证动效可见
      if (!executing) {
        if (!hasInteractiveCard()) {
          toolQueue = [];
          displayInfo = null;
          displaySince = 0;
        }
        if (shared.refs.isPlanMode && shared.refs.isPlanMode()) {
          var planIdle = { state: "composing", text: "Planning…", tool: "plan" };
          displayInfo = planIdle;
          displaySince = now;
          return planIdle;
        }
        // 空闲态不再误显示 Thinking，返回 idle 标记（由 syncThinkingOrb 隐藏）
        var idleInfo = { state: "composing", text: "Thinking…", tool: "idle" };
        return idleInfo;
      }

      // 若当前展示仍在最小可视期内，保持（仅 executing 时会走到这里）。
      // 但非具体工具的生命周期态（thinking/waiting 等）不被扣住，
      // 让统一等待窗 / 正文流式输出立即接管，消除幽灵 Thinking 双重闪烁
      if (displayInfo && now - displaySince < MIN_TOOL_DWELL_MS && !isGenericToolKey(displayInfo.tool)) {
        return displayInfo;
      }

      // executing === true 但无候选：区分 工具间隙(Waiting) / 正文流式输出(Responding) / LLM 思考(Thinking)
      var age = lastActiveToolRecord.timestamp ? (now - lastActiveToolRecord.timestamp) : 99999;
      var isRecentTool = lastActiveToolRecord.tool && lastActiveToolRecord.tool !== "reasoning" && lastActiveToolRecord.tool !== "ask_user_question" && lastActiveToolRecord.tool !== "plan" && lastActiveToolRecord.tool !== "idle" && lastActiveToolRecord.tool !== "waiting" && lastActiveToolRecord.tool !== "thinking" && lastActiveToolRecord.tool !== "responding";

      // 1) 统一等待窗：工具结束 0 ~ 1200ms 内稳定显示 Waiting…（去掉原下界，
      //    修复时间窗倒置导致 0~300ms 与 >1200ms 穿透为幽灵 Thinking 的双重闪烁）
      if (isRecentTool && age < WAITING_WINDOW_MS) {
        var waitingInfo = { state: "working", text: WAITING_TEXT, tool: "waiting" };
        if (!displayInfo || displayInfo.tool !== "waiting") {
          // 从 thinking/waiting 等非具体工具态切来时，不被最小可视时长扣住
          if (!(displayInfo && isGenericToolKey(displayInfo.tool)) && displayInfo && now - displaySince < MIN_TOOL_DWELL_MS) return displayInfo;
          displayInfo = waitingInfo;
          displaySince = now;
        }
        return waitingInfo;
      }

      var planModeNow = shared.refs.isPlanMode ? shared.refs.isPlanMode() : false;

      // 2) Responding：答案流节点探测仅在执行中且非 Plan 时参与——历史答案块常驻可见，
      //    不做门控会以陈旧节点顶掉 Planning；未命中但距最后工具记录 1.5s~20s 且非 Plan，
      //    判定为正文流式输出；超 20s 无正向流证据回退 Thinking（无流标记模型的长思考不再永久误标）
      if ((executing && !planModeNow && detectRespondingStream()) ||
          (isRecentTool && age >= RESPONDING_FALLBACK_MS && age <= RESPONDING_FALLBACK_MAX_MS && !planModeNow)) {
        var respondingInfo = { state: "composing", text: RESPONDING_TEXT, tool: "responding" };
        if (!displayInfo || displayInfo.tool !== "responding") {
          if (!(displayInfo && isGenericToolKey(displayInfo.tool)) && displayInfo && now - displaySince < MIN_TOOL_DWELL_MS) return displayInfo;
          displayInfo = respondingInfo;
          displaySince = now;
        }
        return respondingInfo;
      }

      // 3) 真正的 LLM 思考或 Plan 模式
      if (planModeNow) {
        var planInfo2 = { state: "composing", text: "Planning…", tool: "plan" };
        if (!displayInfo || displayInfo.tool !== "plan") {
          if (!(displayInfo && isGenericToolKey(displayInfo.tool)) && displayInfo && now - displaySince < MIN_TOOL_DWELL_MS) return displayInfo;
          displayInfo = planInfo2;
          displaySince = now;
        }
        return planInfo2;
      }

      // 4) 过渡空档（等待窗结束 ~ Responding 兜底线之间且未命中答案流节点）：保持当前展示，避免来回跳变。
      //    age 超过 RESPONDING_FALLBACK_MAX_MS 后不再保持，落至分支 5 回退 Thinking…（上限真正闭合）
      if (isRecentTool && displayInfo && age <= RESPONDING_FALLBACK_MAX_MS) {
        return displayInfo;
      }

      // 5) Thinking 兜底：仅保留给本轮尚未出现任何工具记录之时（reasoning 流活跃时已在上方以候选形式返回）
      var thinkInfo = { state: "composing", text: "Thinking…", tool: "thinking" };
      if (!displayInfo || displayInfo.tool !== "thinking") {
        if (!(displayInfo && isGenericToolKey(displayInfo.tool)) && displayInfo && now - displaySince < MIN_TOOL_DWELL_MS) return displayInfo;
        displayInfo = thinkInfo;
        displaySince = now;
      }
      return thinkInfo;
    } catch(e) {
      return { state: "composing", text: "Thinking…", tool: "fallback" };
    }
  }

  var orbCanvas = null;
  var orbCtx = null;
  var orbRaf = 0;
  var orbMountedStatusEl = null;
  var orbActive = false;
  var orbCurrentState = "composing";
  var orbStartTime = 0;
  var orbTextSpan = null;
  var orbReduceTimer = null;            // prefers-reduced-motion 降级绘制定时器
  var REDUCED_MOTION_INTERVAL_MS = 400; // 降级模式下的手绘帧间隔
  var srAnnounceEl = null;              // 持久屏幕阅读器播报节点

  // 无障碍：向 document.body 追加一个视觉隐藏、SR 可见的持久播报节点（幂等）
  function ensureSrAnnouncer() {
    if (srAnnounceEl && document.contains(srAnnounceEl)) return srAnnounceEl;
    try {
      srAnnounceEl = document.createElement("span");
      srAnnounceEl.setAttribute("aria-live", "polite");
      srAnnounceEl.setAttribute("role", "status");
      srAnnounceEl.setAttribute("data-dsh-sr-announcer", ""); // 防止被 statusEl 兜底选择器自匹配
      // 内联样式实现屏幕阅读器可见的视觉隐藏（sr-only 裁剪法）
      srAnnounceEl.style.position = "absolute";
      srAnnounceEl.style.width = "1px";
      srAnnounceEl.style.height = "1px";
      srAnnounceEl.style.margin = "-1px";
      srAnnounceEl.style.overflow = "hidden";
      srAnnounceEl.style.clip = "rect(0 0 0 0)";
      srAnnounceEl.style.whiteSpace = "nowrap";
      document.body.appendChild(srAnnounceEl);
    } catch(e) { srAnnounceEl = null; }
    return srAnnounceEl;
  }

  // 状态文案变化时同步到 SR 播报节点
  function announceSrStatus(text) {
    var ann = ensureSrAnnouncer();
    if (ann && ann.textContent !== text) {
      try { ann.textContent = text; } catch(e) {}
    }
  }

  function syncTurnStatusText(statusEl, text) {
    if (!statusEl || !document.contains(statusEl)) return;
    try {
      var isDark = shared.refs.getBeamThemeIsDark ? shared.refs.getBeamThemeIsDark() : false;
      if (!isDark) {
        // 浅色主题：不注入状态文字（保留官方原版状态文本），清理已注入的 span 与朗读抑制标记
        if (orbTextSpan && statusEl.contains(orbTextSpan)) {
          try { statusEl.removeChild(orbTextSpan); } catch(e){}
          orbTextSpan = null;
        }
        try { if (statusEl.getAttribute("aria-hidden")) statusEl.removeAttribute("aria-hidden"); } catch(e){}
        return;
      }
      if (!orbTextSpan || !statusEl.contains(orbTextSpan)) {
        var existing = statusEl.querySelector(".dsh-turn-status-text");
        if (existing) {
          orbTextSpan = existing;
        } else {
          orbTextSpan = document.createElement("span");
          orbTextSpan.className = "dsh-turn-status-text";
          var clockEl = statusEl.querySelector(".EvIC1a_turnStatusClock, [class*='turnStatusClock']");
          if (clockEl) {
            statusEl.insertBefore(orbTextSpan, clockEl);
          } else {
            statusEl.appendChild(orbTextSpan);
          }
        }
      }
      if (orbTextSpan && orbTextSpan.textContent !== text) {
        orbTextSpan.textContent = text;
        announceSrStatus(text); // 同步屏幕阅读器播报（statusEl 已 aria-hidden，避免双读）
      }
    } catch(e) {}
  }

  function createThinkingOrbCanvas() {
    var wrap = document.createElement("span");
    wrap.className = "dsh-thinking-orb-wrap";
    wrap.setAttribute("aria-hidden", "true");
    var cvs = document.createElement("canvas");
    cvs.className = "dsh-thinking-orb-canvas";
    var size = 20;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = size * dpr;
    cvs.height = size * dpr;
    cvs.style.width = size + "px";
    cvs.style.height = size + "px";
    wrap.appendChild(cvs);
    return { wrap: wrap, canvas: cvs };
  }

  function startThinkingOrb(targetEl) {
    if (!targetEl || !document.contains(targetEl)) return;
    // 浅色主题门控：彻底不挂 Canvas 不跑 rAF，与插件的深色门控哲学一致
    var themeDark = shared.refs.getBeamThemeIsDark ? shared.refs.getBeamThemeIsDark() : false;
    if (!themeDark) {
      if (orbActive) stopThinkingOrb();
      return;
    }
    if (targetEl === srAnnounceEl) return; // 绝不把 orb 挂进隐形播报节点
    if (orbMountedStatusEl === targetEl && orbCanvas && targetEl.contains(orbCanvas.parentNode)) {
      return;
    }
    stopThinkingOrb();

    // prefers-reduced-motion：降级为低频手绘帧 + 整体减速（仍走同一渲染函数）
    var reducedMotion = !!(shared.media && shared.media.reducedMotion);
    var orb = createThinkingOrbCanvas();
    orbCanvas = orb.canvas;
    orbCtx = orbCanvas.getContext("2d");
    orbMountedStatusEl = targetEl;
    targetEl.insertBefore(orb.wrap, targetEl.firstChild);
    // 无障碍：抑制官方原生文本与注入文本的双重朗读，并标记忙碌态（结束移除 aria-busy）
    try { targetEl.setAttribute("aria-hidden", "true"); } catch(e) {}
    try { targetEl.setAttribute("aria-busy", "true"); } catch(e) {}
    ensureSrAnnouncer();
    orbActive = true;
    orbStartTime = performance.now();
    var orbLastScan = 0;
    var orbLastInfo = null;
    var orbLastFrameTs = 0;

    function renderOrb(now) {
      if (!orbActive || !orbCtx || !orbMountedStatusEl || !document.contains(orbMountedStatusEl)) {
        stopThinkingOrb();
        return;
      }
      // 调度：常规走 rAF；reduced-motion 下由外部定时器驱动本函数，不再自续 rAF
      if (!reducedMotion) {
        orbRaf = requestAnimationFrame(renderOrb);
      }

      if (document.visibilityState === "hidden") return;

      // 大帧间隔保护（后台切回）：平移动画起点使 elapsed 连续，消除粒子瞬移
      if (!reducedMotion && orbLastFrameTs && now - orbLastFrameTs > 250) {
        orbStartTime += now - orbLastFrameTs;
      }
      orbLastFrameTs = now;

      if (now - orbLastScan >= 50 || !orbLastInfo) {
        orbLastScan = now;
        orbLastInfo = resolveActiveToolState();
      }
      var activeInfo = orbLastInfo;
      orbCurrentState = activeInfo.state;

      var isPlan = (shared.refs.isPlanMode && shared.refs.isPlanMode()) || activeInfo.tool === "plan" || (activeInfo.state === "breathing" && shared.refs.isPlanMode && shared.refs.isPlanMode());
      if (orb.wrap) {
        if (orb.wrap.getAttribute("data-state") !== activeInfo.state) {
          orb.wrap.setAttribute("data-state", activeInfo.state);
        }
        if (isPlan) {
          orb.wrap.setAttribute("data-planning", "true");
        } else {
          orb.wrap.removeAttribute("data-planning");
        }
        if (activeInfo.tool === "waiting") {
          orb.wrap.setAttribute("data-waiting", "true");
        } else {
          orb.wrap.removeAttribute("data-waiting");
        }
      }

      syncTurnStatusText(orbMountedStatusEl, activeInfo.text);

      var size = 20;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      // DPR 一致性：跨屏拖拽/缩放后 devicePixelRatio 变化时重建画布尺寸与 transform，
      // 修复渲染裁切畸变
      var targetPx = Math.round(size * dpr);
      if (orbCanvas.width !== targetPx) {
        orbCanvas.width = targetPx;
        orbCanvas.height = targetPx;
      }
      var preset = getOrbPreset(activeInfo.state, 20);
      var renderFn = cp[preset.mode] || cp.orbits;
      var speedMul = reducedMotion ? 0.2 : 1;

      var elapsed = (now - orbStartTime) * 0.001 * preset.speed * speedMul;
      if (activeInfo.tool === "waiting") elapsed *= 0.62;
      var res = renderFn(size, elapsed, preset.opts);

      var isDark = shared.refs.getBeamThemeIsDark ? shared.refs.getBeamThemeIsDark() : false;
      orbCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      orbCtx.clearRect(0, 0, size, size);
      Xd(orbCtx, res, isDark);
    }

    if (reducedMotion) {
      // 降级路径：每 400ms 手动绘制一帧（同一渲染函数），不占用 rAF
      orbReduceTimer = setInterval(function() {
        try { renderOrb(performance.now()); } catch(e) {}
      }, REDUCED_MOTION_INTERVAL_MS);
    } else {
      orbRaf = requestAnimationFrame(renderOrb);
    }
  }

  function stopThinkingOrb() {
    orbActive = false;
    if (orbRaf) {
      cancelAnimationFrame(orbRaf);
      orbRaf = 0;
    }
    if (orbReduceTimer) {
      try { clearInterval(orbReduceTimer); } catch(e) {}
      orbReduceTimer = null;
    }
    if (orbTextSpan && orbTextSpan.parentNode) {
      try { orbTextSpan.parentNode.removeChild(orbTextSpan); } catch(e) {} // 注入文字随结束移除，避免陈旧文案残留
    }
    if (orbMountedStatusEl) {
      // 忙碌与朗读抑制标记一并移除：官方原生文本恢复可读可播报（注入 span 已删，无双读）
      try { orbMountedStatusEl.removeAttribute("aria-busy"); } catch(e) {}
      try { orbMountedStatusEl.removeAttribute("aria-hidden"); } catch(e) {}
    }
    if (orbCanvas && orbCanvas.parentNode) {
      try { orbCanvas.parentNode.remove(); } catch(e) {}
    }
    orbCanvas = null;
    orbCtx = null;
    orbMountedStatusEl = null;
    orbTextSpan = null;
  }

  function syncThinkingOrb() {
    // 新一轮执行开始检测（由 400ms 轮询 + 合批订阅驱动，Stop 后必被观测）：
    // 重置上轮工具记录/队列/展示，确保 “Thinking…” 只出现在本轮尚无工具记录的阶段，
    // 同时杜绝上轮残留借 dwell 闪入新轮（≤600ms 残闪）
    var executingNow = shared.refs.isExecuting ? shared.refs.isExecuting() : false;
    if (executingNow && !prevExecuting) {
      lastActiveToolRecord.state = null;
      lastActiveToolRecord.text = null;
      lastActiveToolRecord.tool = null;
      lastActiveToolRecord.timestamp = 0;
      toolQueue = [];
      displayInfo = null;
      displaySince = 0;
    }
    prevExecuting = executingNow;
    if (!bgSettings || bgSettings.orbs === false) {
      if (orbActive) stopThinkingOrb();
      if (orbMutObs || orbPollTimer) { try { detachThinkingOrbs(); } catch(e) {} }
      return;
    }
    var statusEl = document.querySelector(".EvIC1a_turnStatus, [role=\"status\"][aria-live=\"polite\"]:not([data-dsh-sr-announcer])");
    var executing = shared.refs.isExecuting ? shared.refs.isExecuting() : false;
    // 启动门控扩展：存在交互卡片（提问呼吸环 / 计划审核 shaping）时同样保持小球，
    // 修复用户交互阶段小球蒸发的问题
    if (statusEl && (executing || hasInteractiveCard())) {
      startThinkingOrb(statusEl);
    } else {
      if (orbActive) stopThinkingOrb();
      if (!executing && !hasInteractiveCard()) {
        // 空闲时清空队列与展示，避免下次执行时残留旧状态（存在交互卡片时跳过清理）
        toolQueue = [];
        if (displayInfo) {
          displayInfo = null;
          displaySince = 0;
        }
      }
    }
  }

  var orbMutObs = null;
  var orbCoalesceUnsub = null;
  var orbPollTimer = null;
  function detachThinkingOrbs() {
    if (orbPollTimer) { try { clearInterval(orbPollTimer); } catch(e) {} orbPollTimer = null; }
    if (orbCoalesceUnsub) { try { orbCoalesceUnsub(); } catch(e) {} orbCoalesceUnsub = null; }
    if (orbMutObs) { try { orbMutObs.disconnect(); } catch(e) {} orbMutObs = null; }
    if (orbActive) try { stopThinkingOrb(); } catch(e) {}
  }
  function watchThinkingOrbs() {
    if (!bgSettings || bgSettings.orbs === false) { detachThinkingOrbs(); return; }
    if (orbPollTimer) clearInterval(orbPollTimer);
    orbPollTimer = setInterval(function() {
      try { syncThinkingOrb(); } catch(e) {}
    }, 400);

    if (orbCoalesceUnsub || orbMutObs) return;
    if (shared.refs.subscribeCoalesced) {
      try { orbCoalesceUnsub = shared.refs.subscribeCoalesced(function(){ try{ syncThinkingOrb(); }catch(e){} }); return; } catch(e){}
    }
    if (window.MutationObserver) {
      orbMutObs = new MutationObserver(function() {
        try { syncThinkingOrb(); } catch(e) {}
      });
      var rootEl = document.querySelector("#root") || document.documentElement;
      try {
        orbMutObs.observe(rootEl, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["data-state", "data-tool", "aria-label", "class", "data-plan-mode", "role"]
        });
      } catch(e) {}
    }
  }

  // SR 播报节点为懒创建（ensureSrAnnouncer 在 startThinkingOrb / announceSrStatus 首用时机创建），
  // 关闭 Orbs 的用户不承受额外 DOM/ARIA 负担

  shared.refs.syncThinkingOrb = syncThinkingOrb;
  shared.refs.stopThinkingOrb = stopThinkingOrb;
  shared.refs.watchThinkingOrbs = watchThinkingOrbs;
  shared.refs.orbsHandle = {
    start: startThinkingOrb,
    stop: stopThinkingOrb,
    sync: syncThinkingOrb,
    watch: watchThinkingOrbs,
    detach: detachThinkingOrbs,
    get active() { return orbActive; },
    get canvas() { return orbCanvas; },
    get state() { return orbCurrentState; },
    get lastRecord() { return lastActiveToolRecord; },
    get queue() { return toolQueue.slice(); },
    get display() { return displayInfo; },
    resolveState: resolveActiveToolState,
    rawDetect: rawDetect,
    getPreset: getOrbPreset
  };
}




/* ===================== shell.js ===================== */
/* ------------------------------------------------------------------ *
 * src/shell.js — 玻璃透明化与诊断面板（initShell）
 *   玻璃内联样式按设置开关重跑（shared.refs.shellGlassApply）；
 *   仅深色主题应用玻璃（state.dark），浅色主题清理覆盖恢复官方原版。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initShell(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;
  var diag = shared.dom.diag;
  var shellMutObs = null;
  var shellUnsub = null;
  var shellTimer = null;
  var shellTries = 0;
  var shellRaf = 0;

  function startDiagPanel() {
    function collect() {
      var cs = function (el) { try { return window.getComputedStyle(el); } catch (e) { return null; } };
      var bcs = cs(document.body);
      var hcs = cs(document.documentElement);
      var frame = document.querySelector('[data-slot="root"] .pI_x6G_frame') ||
        document.querySelector('[data-slot="root"] > div');
      var fcs = frame ? cs(frame) : null;
      diag.theme = state.dark ? "dark" : "light";
      diag.bodyBg = bcs ? bcs.backgroundColor : "?";
      diag.htmlBg = hcs ? hcs.backgroundColor : "?";
      diag.frameFound = !!frame;
      diag.frameBg = fcs ? fcs.backgroundColor : "?";
      var glassEls = document.querySelectorAll(".Sixlwa_bubble, [data-composer-card=\"true\"], .pI_x6G_sidebarCol");
      diag.glassEls = glassEls.length;
    }
    collect();
    var panel = document.createElement("pre");
    panel.id = "dsh-ds-diag";
    panel.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483000;background:#fff;color:#000;" +
      "font:11px/1.5 monospace;padding:10px 12px;border:2px solid #f00;max-width:520px;white-space:pre-wrap;";
    document.body.appendChild(panel);
    function render() {
      collect();
      panel.textContent = [
        "dsh-ui-beam-orbs v1.0.6 diagnostics",
        "theme: " + diag.theme,
        "body bg: " + diag.bodyBg,
        "html bg: " + diag.htmlBg,
        "frame found: " + diag.frameFound + " bg=" + diag.frameBg,
        "glass targets: " + diag.glassEls
      ].join("\n");
    }
    render();
    setInterval(render, 1000);
  }
  function makeShellTransparent() {
    // 深色主题要设置/撤销的内联样式属性集合
    var GLASS_PROPS = ["background", "background-color", "backdrop-filter", "-webkit-backdrop-filter",
      "box-shadow", "border-right-color", "border-color", "--dsh-bg-blur"];
    var processedGlass = (typeof WeakSet !== "undefined") ? new WeakSet() : null;
    // 视图根容器（会话视图等全高不透明层）候选集合。
    // 0.1.5-rc.1 槽位破坏性改名：conversation / details / pI_x6G_detailsCol 全部消失，
    // 改为 main / main.conversation / conversation.session / rightbar(.pI_x6G_rightbarCol)。
    // 承载不透明背景（.wSkVaW_root{background:var(--dsw-alias-bg-base)}）的确切祖先在无浏览器
    // 环境下无法断定，故多候选并列：命中即透明化，未命中项为空集不影响结果。
    // 【候选集合为适配 0.1.5-rc.1 槽位改名；具体生效项需真机确认】
    var VIEW_SELECTORS = '[data-slot="main"] > div, [data-slot="main.conversation"] > div, ' +
      '[data-slot="conversation.session"] > div, .pI_x6G_rightbarCol > div';
    // 玻璃化目标（消息气泡 / 工具 DSL 块内容体 / 上下文注入行 / 计划·提问·审批卡 / IO 卡片）。
    // 原 .gdEzaW_bubble 与 _block_* / _copyButton_* / _bannerWrap_* / .VOzbGW_panel 在
    // 0.1.3-alpha.2 与 0.1.5-rc.1 均不存在；此处全部改为实测真实类名，并按 _*Body / _bubble
    // 后缀兜底，避免 DSH 重组后哈希漂移再次整体失配。
    var GLASS_TARGET_SELECTORS = '.Sixlwa_bubble, .o3BgMG_terminalBody, .o3BgMG_codeBody, ' +
      '.o3BgMG_diffBody, .o3BgMG_readBody, .o3BgMG_searchBody, .o3BgMG_webBody, ' +
      '.o3BgMG_imageBody, .XrJvXW_body, .LVzXQa_card, .Mbwy4a_card, .CY-8Ka_ioCard, ' +
      '.o3BgMG_ioCard, [class$="_bubble"], [class$="_codeBody"], [class$="_terminalBody"], ' +
      '[class$="_diffBody"], [class$="_readBody"], [class$="_searchBody"], [class$="_webBody"], ' +
      '[class$="_imageBody"]';
    // 幂等写入：值与优先级均一致时跳过。流式输出期间本函数随每次 DOM 突变合批触发，
    // 无条件 setProperty 会造成大量冗余样式失效/重绘；跳过未变化项可显著降低主线程
    // 与合成器压力（GPU 优化，最终样式结果与原实现完全一致）
    function setProp(el, prop, val, prio) {
      if (!el || !el.style) return;
      var p = prio || "";
      if (el.style.getPropertyValue(prop) === val && el.style.getPropertyPriority(prop) === p) return;
      el.style.setProperty(prop, val, p);
    }
    function clearInline(el) {
      if (!el || !el.style) return;
      for (var i = 0; i < GLASS_PROPS.length; i++) {
        if (el.style.getPropertyValue(GLASS_PROPS[i]) !== "") el.style.removeProperty(GLASS_PROPS[i]);
      }
    }
    function ensureShellObserver() {
      if (shellUnsub || shellMutObs) return;
      if (!bgSettings.glass) return;
      // 优先使用合批 observer（rAF 合批，单例在 #root），回退到独立 observer
      if (shared.refs.subscribeCoalesced) {
        try {
          shellUnsub = shared.refs.subscribeCoalesced(function(){ try { scheduleShellGlass(); } catch(e) {} });
          return;
        } catch(e){}
      }
      if (!window.MutationObserver) return;
      shellMutObs = new MutationObserver(function(){ try { scheduleShellGlass(); } catch(e) {} });
      var rootEl = document.querySelector("#root") || document.documentElement;
      try { shellMutObs.observe(rootEl, { childList: true, subtree: true }); } catch(e) {}
    }
    function detachShellObserver() {
      if (shellUnsub) { try { shellUnsub(); } catch(e) {} shellUnsub = null; return; }
      if (shellMutObs) { try { shellMutObs.disconnect(); } catch(e) {} shellMutObs = null; }
      if (shellRaf) { try { cancelAnimationFrame(shellRaf); } catch(_){} shellRaf = 0; }
    }
    function scheduleShellGlass(){
      if (shellRaf) return;
      var raf = window.requestAnimationFrame || function(fn){ return setTimeout(fn,16); };
      shellRaf = raf(function(){ shellRaf=0; try{ applyShellGlass(); }catch(e){} });
    }
    function applyShellGlass() {
      // 玻璃开关关闭或浅色主题：清理覆盖并断开观察器/轮询（浅色主题恢复官方原版）
      if (!bgSettings.glass || !state.dark) {
        try { detachShellObserver(); } catch(e) {}
        // 浅色主题：撤销所有覆盖，恢复官方原版
        var frame0 = document.querySelector('[data-slot="root"] .pI_x6G_frame') ||
          document.querySelector('[data-slot="root"] > div');
        clearInline(frame0);
        clearInline(document.querySelector("#root [class*=\"_boot_\"]"));
        var views0 = document.querySelectorAll(VIEW_SELECTORS);
        for (var i0 = 0; i0 < views0.length; i0++) clearInline(views0[i0]);
        clearInline(document.querySelector(".pI_x6G_sidebarCol"));
        clearInline(document.querySelector(".hHd-Xa_root, [data-slot=\"sidebar\"] > div"));
        clearInline(document.querySelector(".uV2eYG_card, [data-composer-card=\"true\"]"));
        clearInline(document.querySelector(".wSkVaW_composerSeat, [data-composer-seat]"));
        clearInline(document.querySelector(".bhn1Oq_fade, [class$=\"_fade\"]"));
        var glassEls0 = document.querySelectorAll(GLASS_TARGET_SELECTORS);
        for (var g0 = 0; g0 < glassEls0.length; g0++) clearInline(glassEls0[g0]);
        return;
      }
      // 玻璃开启且深色：确保观察器存活
      try { ensureShellObserver(); } catch(e) {}
      // 玻璃模糊强度由设置面板实时控制（CSS 全部走 blur(var(--dsh-bg-blur))）
      try { setProp(document.body, "--dsh-bg-blur", (bgSettings.blur || 8) + "px"); } catch (e) {}
      var frame = document.querySelector('[data-slot="root"] .pI_x6G_frame') ||
        document.querySelector('[data-slot="root"] > div');
      if (frame && frame.style) {
        diag.frameFound = true;
        diag.frameBg = window.getComputedStyle ? window.getComputedStyle(frame).backgroundColor : "?";
        setProp(frame, "background", "transparent", "important");
      }
      var bootEl = document.querySelector("#root [class*=\"_boot_\"]");
      if (bootEl && bootEl.style) {
        setProp(bootEl, "background", "transparent", "important");
      }
      // 视图根容器（会话视图等全高不透明层）同样透明化
      var views = document.querySelectorAll(VIEW_SELECTORS);
      for (var i = 0; i < views.length; i++) {
        var v = views[i];
        if (v && v.style) setProp(v, "background", "transparent", "important");
      }
      // 官方玻璃拟态（ds-glass 令牌：blur 12px + 深色半透明表面色 + 官方边框/阴影）
      var glassBg = "rgba(13,15,19,.55)";
      var glassBorder = "hsla(0,0%,100%,.08)";
      var glassShadow = "0 0 1px 0 rgba(0,0,0,.2), 0 0 4px 0 rgba(0,0,0,.02), 0 12px 32px 0 rgba(0,0,0,.08)";
      var side = document.querySelector('.pI_x6G_sidebarCol, [class$="sidebarCol"]');
      if (side && side.style) {
        // 注意：backdrop-filter 会让侧边栏成为 fixed 后代的包含块（设置弹窗错乱），
        // 所以列本身不设 backdrop-filter，模糊由 CSS 的 ::before 伪元素承担
        setProp(side, "background", glassBg, "important");
        setProp(side, "border-right-color", glassBorder, "important");
      }
      var sideRoot = document.querySelector(".hHd-Xa_root, [data-slot=\"sidebar\"] > div");
      if (sideRoot && sideRoot.style) {
        // 注意：不能给侧边栏内容根加 z-index/堆叠上下文——设置弹窗（fixed z-1000）
        // 挂载在侧边栏内部，被困在侧边栏堆叠上下文里会被输入框（z-7）盖住；
        // 模糊由 CSS 的 ::before z-index:-1 承担，内容自然在模糊层之上
        setProp(sideRoot, "background", "transparent", "important");
      }
      var card = document.querySelector(".uV2eYG_card, [data-composer-card=\"true\"]");
      if (card && card.style) {
        setProp(card, "background", glassBg, "important");
        setProp(card, "backdrop-filter", "blur(" + (bgSettings.blur || 8) + "px)", "important");
        setProp(card, "-webkit-backdrop-filter", "blur(" + (bgSettings.blur || 8) + "px)", "important");
        setProp(card, "border-color", glassBorder, "important");
        setProp(card, "box-shadow", glassShadow, "important");
      }
      var seat = document.querySelector(".wSkVaW_composerSeat, [data-composer-seat]");
      if (seat && seat.style) setProp(seat, "background", "transparent", "important");
      // 会话列表底部渐隐条：0.1.5-rc.1 真实类名 .bhn1Oq_fade（dsh-client-ui-workspace，规则为
      // background:linear-gradient(to bottom, transparent, var(--dsw-specific-sidebar-fill))，
      // 正是原 .qDHVXG_fade 注释描述的那条不透明渐隐条；qDHVXG_fade 两版皆无，为历史死选择器）
      var fade = document.querySelector(".bhn1Oq_fade, [class$=\"_fade\"]");
      if (fade && fade.style) setProp(fade, "background", "transparent", "important");
      // 消息气泡与代码块玻璃化（与侧边栏/输入框同款材质）—— WeakSet 缓存避免每突变全量重写
      var glassRing = "inset 0 0 0 1px hsla(0,0%,100%,.08)";
      var blurPx = (bgSettings.blur || 8) + "px";
      var glassEls = document.querySelectorAll(GLASS_TARGET_SELECTORS);
      for (var gi = 0; gi < glassEls.length; gi++) {
        var ge = glassEls[gi];
        if (!ge || !ge.style) continue;
        if (processedGlass) {
          var cached = ge._dshBlur;
          if (processedGlass.has(ge) && cached === blurPx) continue;
          processedGlass.add(ge); ge._dshBlur = blurPx;
        }
        setProp(ge, "background", glassBg, "important");
        setProp(ge, "backdrop-filter", "blur(" + blurPx + ")", "important");
        setProp(ge, "-webkit-backdrop-filter", "blur(" + blurPx + ")", "important");
        setProp(ge, "box-shadow", glassRing, "important");
      }
    }
    applyShellGlass();
    shared.refs.shellGlassApply = applyShellGlass; // 暴露给设置开关：切换玻璃时立即重跑
    shared.refs.shellMutObs = function(){ return shellMutObs; };
    shared.refs.shellTimer = function(){ return shellTimer; };
    // 暴露 detach 供外部/主题切换调用
    shared.refs.detachShellObserver = detachShellObserver;
    shared.refs.ensureShellObserver = ensureShellObserver;
    // 轮询兜底：合批 observer 为主，仅保留轻量 2s 间隔作为保险（最多 30 次，60s 后自停）
    if (!shellTimer) {
      shellTimer = setInterval(function () {
        if (!bgSettings.glass || !state.dark) { try { detachShellObserver(); } catch(e) {} if (shellTimer){ clearInterval(shellTimer); shellTimer=null; } return; }
        try { scheduleShellGlass(); } catch(e) {}
        if (++shellTries > 30) { clearInterval(shellTimer); shellTimer = null; }
      }, 2000);
    }
    ensureShellObserver();
  }

  shared.refs.makeShellTransparent = makeShellTransparent;
  shared.refs.startDiagPanel = startDiagPanel;
}




/* ===================== observer.js ===================== */
/* ------------------------------------------------------------------ *
 * src/observer.js — 主题联动（initObserver，MutationObserver + matchMedia）
 *   监听到主题属性 / prefers-color-scheme 变化时重新检测 state.dark，
 *   并联动 Border Beam（深浅两套参数）与玻璃层（仅深色应用）。
 *   背景引擎的主题联动在 dsh-ui-deepseek-bg 插件。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initObserver(shared) {
  var state = shared.state;

  function observeTheme() {
    var apply = function () {
      var d = (shared.refs.detectDark) ? shared.refs.detectDark() :
        !!(shared.media.darkQuery && shared.media.darkQuery.matches);
      if (d !== state.dark) {
        state.dark = d;
        try{ if (shared.refs.applyThemeClass) shared.refs.applyThemeClass(); }catch(e){}
        try{ if (shared.refs.refreshBeamTheme) shared.refs.refreshBeamTheme(); }catch(e){}
        try{ if (shared.refs.shellGlassApply) shared.refs.shellGlassApply(); }catch(e){}
      } else {
        // theme 值未变也要保证 beam 的深浅参数与当前主题一致（如初始浅色）
        try{ if (shared.refs.refreshBeamTheme) shared.refs.refreshBeamTheme(); }catch(e){}
      }
    };
    if (window.MutationObserver) {
      if (!shared.refs.themeObserver) {
        var mo = new MutationObserver(apply);
        shared.refs.themeObserver = mo;
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ds-dark-theme", "data-ds-light-theme", "data-theme"] });
        if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme", "data-ds-light-theme", "data-theme"] });
      }
    }
    if (shared.media.darkQuery && shared.media.darkQuery.addEventListener) {
      shared.media.darkQuery.addEventListener("change", apply);
    } else if (shared.media.darkQuery && shared.media.darkQuery.addListener) {
      shared.media.darkQuery.addListener(apply); // 旧版 Safari/WebView 回退
    }
  }

  shared.refs.observeTheme = observeTheme;
}


/* ===================== boot.js ===================== */
/* ------------------------------------------------------------------ *
 * src/boot.js — 启动编排（initBoot）
 *   在全部 initX 之后由 apply 调用；跨模块启动函数一律经 shared.refs.*。
 *   启动 UI 皮肤：主题观察 / 玻璃透明化 / Beam（composer+todo）/ Orbs。
 *   背景引擎启动（极光/鲸鱼/星座）在 dsh-ui-deepseek-bg 插件。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initBoot(shared) {
  function boot() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", boot, { once: true }); return; }
    shared.refs.observeTheme();
    shared.refs.makeShellTransparent();
    try{ shared.refs.watchBeamComposer(); }catch(e){}
    try{ shared.refs.watchBeamTodo(); }catch(e){}
    try{ shared.refs.watchThinkingOrbs(); }catch(e){}
    if (typeof location !== "undefined" && (location.search.indexOf("dshtest") !== -1)) shared.refs.startDiagPanel();
    // 调试钩子：显式开启（localStorage dsh-bg-debug=1 或 ?dshdbg=1）才执行 opencv/opendbg，避免生产 URL 误触
    var dbgEnabled = false; try { dbgEnabled = localStorage.getItem("dsh-bg-debug") === "1" || (typeof location !== "undefined" && location.search.indexOf("dshdbg") !== -1); } catch(e){}
    // 调试钩子：?opencv=1 时展开侧边栏并打开第一个会话（检查真实消息 DOM 的代码块类名）
    if (dbgEnabled && typeof location !== "undefined" && location.search.indexOf("opencv") !== -1) {
      setTimeout(function () {
        var toggle = document.querySelector(".hHd-Xa_toggle, [aria-label*=\"sidebar\"], [aria-label*=\"侧边栏\"]");
        if (toggle) toggle.click();
        setTimeout(function () {
          var first = document.querySelector('.bhn1Oq_list [role="button"], .bhn1Oq_list button, [data-slot="sidebar.workspaces"] [role="button"]');
          if (first) first.click();
          setTimeout(function () {
            var codes = document.querySelectorAll("pre, [class*=\"_block_\"], [class*=\"_banner\"], [class*=\"_body\"], code");
            var dump = document.createElement("div");
            dump.id = "dsh-dbg-codes";
            dump.style.display = "none";
            var cls = [];
            for (var i = 0; i < codes.length; i++) {
              var c = codes[i].className;
              if (typeof c === "string" && c) cls.push(c.split(" ")[0]);
            }
            dump.setAttribute("data-classes", cls.join(","));
            document.body.appendChild(dump);
          }, 3000);
        }, 2500);
      }, 3500);
    }
    // 调试钩子：?opendbg=1 时自动打开设置页（用于无头浏览器检查设置页布局）
    if (dbgEnabled && typeof location !== "undefined" && location.search.indexOf("opendbg") !== -1) {
      setTimeout(function () {
        var triggers = document.querySelectorAll('button, [role="button"]');
        for (var i = 0; i < triggers.length; i++) {
          var t = triggers[i];
          var label = (t.getAttribute("aria-label") || t.textContent || "").toLowerCase();
          if (label.indexOf("settings") !== -1 || label.indexOf("设置") !== -1) { t.click(); break; }
        }
        setTimeout(function () {
          var panel = document.querySelector(".VOzbGW_panel");
          var dump = document.createElement("div");
          dump.id = "dsh-dbg-settings";
          dump.style.display = "none";
          dump.setAttribute("data-opened", panel ? "yes" : "no");
          if (panel) dump.setAttribute("data-html", panel.outerHTML.slice(0, 20000));
          document.body.appendChild(dump);
        }, 2500);
      }, 4000);
    }
  }

  shared.refs.boot = boot;
}


/* ===================== index.js ===================== */
/* ===================================================================== *
 * src/index.js — 客户端入口 apply(ctx)（由 scripts/build.mjs 拼接进工厂闭包）
 *   dsh-ui-beam-orbs：UI 皮肤层插件 —— 玻璃拟态 / Border Beam /
 *   Thinking Orbs / 任务清单 Pulse / 发送按钮微动效。
 *   背景引擎（极光/鲸鱼/星座/鼠标跟随）在 dsh-ui-deepseek-bg 插件。
 *   深色主题全部生效；浅色主题恢复 DSH 官方原版（CSS 门控 body[data-ds-dark-theme]）。
 *   创建 shared（media / state / settings / dom / refs），按依赖顺序调用
 *   各子系统的 initX，装配 window.__dshBeamOrbs 调试句柄。
 *   工厂级 seed `react`（构建模板注入）仅由 src/settings.js 的设置页 UI 使用。
 * ===================================================================== */
function apply(ctx) {
  "use strict";
  if (window.__dshBeamOrbs && window.__dshBeamOrbs._inited) return;
  if (typeof document === "undefined") return;

  if (typeof window.__dshBeamOrbs !== 'object' || window.__dshBeamOrbs === null) window.__dshBeamOrbs = {};
  window.__dshBeamOrbs._inited = true;

  /* 跨模块共享状态：预建全部容器对象，各 initX 捕获引用后后续填充依然有效 */
  var shared = {
    media: {
      darkQuery: window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null,
      reducedMotion: !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
      coarse: !!(window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches),
      isWindows: (navigator.userAgentData && navigator.userAgentData.platform === "Windows") ||
        navigator.userAgent.indexOf("Windows") !== -1
    },
    state: { dark: false },
    settings: {},
    dom: { diag: { theme: "?", bodyBg: "?", htmlBg: "?", containerPos: "?", containerZ: "?", containerBg: "?", frameFound: false, frameBg: "?", glassEls: 0 } },
    refs: {},
    ctx: ctx
  };

  // 依赖顺序：theme → settings → coalesce → beam → orbs → shell → observer → boot
  initTheme(shared);         // 主题检测 / state.dark 初值
  initSettings(shared);      // gsSettings（shared.settings）+ 设置页 UI（界面特效）
  initCoalesce(shared);      // 合批 MutationObserver（供 beam/orbs/shell 订阅）
  initBeam(shared);          // Border Beam 状态机 + composer/todo 集成（CSS 在 beam-css.js）
  initOrbs(shared);          // Thinking Orbs 运行时（几何数学在 orbs-math.js）
  initShell(shared);         // 玻璃透明化 + 诊断面板
  initObserver(shared);      // 主题联动（MutationObserver + matchMedia）
  initBoot(shared);          // 启动编排（原 boot()）

  // 调试句柄（beam/orbs 句柄对象由各自模块构造后注册）
  try {
    if (typeof window.__dshBeamOrbs !== "object" || window.__dshBeamOrbs === null) window.__dshBeamOrbs = {};
    window.__dshBeamOrbs.beam = shared.refs.beamHandle;
    window.__dshBeamOrbs.orbs = shared.refs.orbsHandle;
  } catch (e) {}

  if (shared.refs.setupSettingsUi) shared.refs.setupSettingsUi(ctx);
  if (shared.refs.boot) shared.refs.boot();
}


    exports.apply = apply;
    // 设置面板依赖 slots 服务（由 dsh-client-ui-slots 提供）；未就绪时等待其出现
    exports.inject = ["slots"];
    return module.exports;
  }
});
