/**
 * 助手行接管所需的样式：与宿主 `AssistantMarkdown` / `ReasoningRow` 逐条对齐
 * 的等价规则（字号、行距、gap、粘性折叠头、running 微光、summary 遮罩等），
 * 加上本插件唯一新增的视觉词汇——「已翻译」左缘细线。
 *
 * 全部颜色与尺寸走 `--dsw-alias-*` / `--dsh-*` 主题别名，中性平边按官方规则
 * 画 0.5px hairline；动画声明尊重 `prefers-reduced-motion`。样式随 bundle 注入
 * 一次（`<style data-plugin-css>`），类名用固定前缀，不依赖宿主哈希类名。
 */

const STYLE_TAG_ID = '@lynn123411/dsh-chat-translate/chat-assistant.css';

const CSS = [
  // ---- 行骨架（宿主 AssistantMarkdown.root/body 等价） ----
  '.dsh-ct-root{display:flex;flex-direction:column;font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary)}',
  '.dsh-ct-body{display:flex;flex-direction:column;gap:16px}',
  '.dsh-ct-body>[data-turn-process-inline][hidden]{margin-bottom:-16px}',
  // 宽表格溢出内容列（宿主等价规则，类名 md-table-wide 由 MarkdownText 自己产出）
  '.dsh-ct-body .md-table-wide{--dsh-table-spare:max(0px, calc((100cqw - var(--dsh-chat-content-width)) / 2));--dsh-table-lead:calc(var(--dsh-table-spare) + min(var(--dsh-chat-content-width), 100cqw) - 100%);box-sizing:border-box;width:calc(100% + var(--dsh-table-lead) + var(--dsh-table-spare));max-width:none;margin-left:calc(-1 * var(--dsh-table-lead));padding-left:var(--dsh-table-lead)}',
  '.dsh-ct-body .md-table-wide>table{z-index:1;position:relative}',
  // ---- 已停止标记（宿主 .hWmORq_stopped 等价） ----
  '.dsh-ct-stopped{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}',
  // ---- 「已翻译」标记：正文块左缘一条中性 hairline，整块可点击切换 ----
  '.dsh-ct-prose-translated{border-left:0.5px solid var(--dsw-alias-border-l2);padding-left:12px;cursor:pointer}',
  '.dsh-ct-prose-translated:focus-visible{outline:1.5px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px;border-radius:var(--dsw-radius-sm)}',
  // ---- ReasoningRow（宿主 lcKema_* 等价，前缀换成 dsh-ct-think） ----
  '.dsh-ct-think-root{flex-direction:column;display:flex}',
  '.dsh-ct-think-root:not([data-expanded]){contain:size layout;height:calc(24px + var(--dsh-content-font-delta,0px))}',
  '.dsh-ct-think-row{position:relative;overflow:hidden}',
  '.dsh-ct-think-root[data-expanded] [data-open] [data-disclosure-row]{z-index:1;background:var(--dsw-alias-bg-base);position:sticky;top:0}',
  '.dsh-ct-think-root[data-state=running] .dsh-ct-think-row:after{content:"";inset-block:0;background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite dsh-ct-reasoning-sweep;position:absolute;left:0}',
  '@keyframes dsh-ct-reasoning-sweep{0%{left:-300px}90%,to{left:100%}}',
  '@media (prefers-reduced-motion:reduce){.dsh-ct-think-root[data-state=running] .dsh-ct-think-row:after{animation:none}}',
  '.dsh-ct-think-leading{flex-shrink:0}',
  '.dsh-ct-think-chevron{color:var(--dsw-alias-label-secondary)}',
  '.dsh-ct-think-title{font-weight:400}',
  '.dsh-ct-think-separator{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}',
  '.dsh-ct-think-summary{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;flex:auto;overflow:hidden}',
  '.dsh-ct-think-summary-text{text-overflow:ellipsis;display:block;overflow:hidden}',
  '.dsh-ct-think-summary[data-streaming]{mask-image:linear-gradient(90deg,currentcolor calc(100% - 48px),transparent)}',
  '.dsh-ct-think-summary[data-streaming] .dsh-ct-think-summary-text{text-overflow:clip;overflow:visible}',
  '.dsh-ct-think-root:not([data-preview]) .dsh-ct-think-separator,.dsh-ct-think-root:not([data-preview]) .dsh-ct-think-summary{display:none}',
  '.dsh-ct-think-body{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0}',
  // ---- 无障碍：屏幕阅读器专用文本 ----
  '.dsh-ct-visually-hidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}',
].join('');

/** 注入接管样式；重复调用是空操作。 */
export function ensureAssistantStyles(): void {
  if (typeof document === 'undefined') return;
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`;
  if (document.querySelector(selector) !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = '@lynn123411/dsh-chat-translate';
  tag.dataset.pluginCss = STYLE_TAG_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
