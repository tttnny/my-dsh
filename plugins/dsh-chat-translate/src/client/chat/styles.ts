/**
 * 助手行接管所需的样式：与宿主 `AssistantMarkdown` / `ReasoningRow` 逐条对齐
 * 的等价规则（字号、行距、gap、粘性折叠头、running 微光、summary 遮罩等），
 * 加上本插件唯一新增的视觉词汇——正文块左缘的线与贴着它的那条热区：
 * 蓝粗线（1px 主色）=正在读译文；灰细线（0.5px 中性）=有译文但正在读原文
 * （再点即切回）；红实线（1px error 色）=翻译失败（通道伤：超时、断流、空
 * 返回）；灰脉动=整行在途、这块尚无结果；无线=没送过模型（含空白块）或开关关闭。
 * 译文的结构漂移不再挂红线——由宿主按原文修回、重掷或照收，红线只剩通道伤一种。
 *
 * 点击不落在正文上：`dsh-ct-hotspot` 是贴着左缘线的窄热区（线左侧 4px + 线
 * 右侧那 12px 缩进，随块高铺满），切换与补跑都由它承载，正文只做选中/复制。
 * 悬停不改任何视觉——只有鼠标在热区上变手型；键盘聚焦（且仅键盘聚焦）时线
 * 加亮，粗细始终只表示译文/原文。失败块的 ↻ 常驻在红线旁，是补跑的可见入口。
 *
 * 全部颜色与尺寸走 `--dsw-alias-*` / `--dsh-*` 主题别名，中性平边按官方规则
 * 画 0.5px hairline；动画声明尊重 `prefers-reduced-motion`。样式随 bundle 注入
 * 一次（`<style data-plugin-css>`），类名用固定前缀，不依赖宿主哈希类名。
 */

const STYLE_TAG_ID = '@lynn123411/dsh-chat-translate/chat-assistant.css';

export const ASSISTANT_CSS = [
  // ---- 行骨架（宿主 AssistantMarkdown.root/body 等价） ----
  '.dsh-ct-root{display:flex;flex-direction:column;font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary)}',
  '.dsh-ct-body{display:flex;flex-direction:column;gap:16px}',
  '.dsh-ct-body>[data-turn-process-inline][hidden]{margin-bottom:-16px}',
  // 宽表格溢出内容列（宿主等价规则，类名 md-table-wide 由 MarkdownText 自己产出）
  '.dsh-ct-body .md-table-wide{--dsh-table-spare:max(0px, calc((100cqw - var(--dsh-chat-content-width)) / 2));--dsh-table-lead:calc(var(--dsh-table-spare) + min(var(--dsh-chat-content-width), 100cqw) - 100%);box-sizing:border-box;width:calc(100% + var(--dsh-table-lead) + var(--dsh-table-spare));max-width:none;margin-left:calc(-1 * var(--dsh-table-lead));padding-left:var(--dsh-table-lead)}',
  '.dsh-ct-body .md-table-wide>table{z-index:1;position:relative}',
  // ---- 已停止标记（宿主 .hWmORq_stopped 等价） ----
  '.dsh-ct-stopped{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}',
  // ---- 正文块：可翻译时左缘留出 12px 缩进（缩进与线无关——译文出现前后
  //      正文位置不变，切换总开关时整列也不横移），并成为热区的定位父级 ----
  '.dsh-ct-prose{position:relative}',
  '.dsh-ct-prose-indent{padding-left:12px}',
  // ---- 线型：粗细与色相只表示状态。蓝粗线=读译文，灰细线=读原文备着译文
  //      （0.5px 中性 hairline），红实线=失败（只剩通道伤一种） ----
  '.dsh-ct-prose-translated{border-left:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 65%, transparent)}',
  '.dsh-ct-prose-original{border-left:0.5px solid var(--dsw-alias-border-l2)}',
  '.dsh-ct-prose-failed{border-left:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 65%, transparent)}',
  // ---- 在途：灰 1px 线脉动（缩进由 .dsh-ct-prose-indent 统一给，转蓝不跳字）；
  //      prefers-reduced-motion 降级为静态灰线 ----
  '.dsh-ct-prose-inflight{border-left:1px solid var(--dsw-alias-border-l2);animation:1.4s ease-in-out infinite alternate dsh-ct-prose-inflight-pulse}',
  '@keyframes dsh-ct-prose-inflight-pulse{from{border-left-color:var(--dsw-alias-border-l2)}to{border-left-color:color-mix(in srgb, var(--dsw-alias-border-l2) 20%, transparent)}}',
  '@media (prefers-reduced-motion:reduce){.dsh-ct-prose-inflight{animation:none}}',
  // ---- 左缘热区：随块高铺满的一条透明窄带。绝对定位的偏移以 padding box 为
  //      基准、而线画在 border 上，所以线的左缘在 -1px：`left:-5px` 给出线外侧
  //      4px，`width:17px` 让右缘落在正文第一个字上（12px 缩进），不吃正文。
  //      切换与补跑只由它承载；正文整块不再是点击目标，选中/复制不再误触。
  //      z-index 压过宽表格的透明出血层（那条规则给 table 挂了 z-index:1）；
  //      出血区是透明 padding，正文格子的起点仍在缩进之外 ----
  '.dsh-ct-hotspot{position:absolute;left:-5px;top:0;bottom:0;width:17px;margin:0;padding:0;border:0;background:0 0;cursor:pointer;z-index:2;-webkit-appearance:none;appearance:none}',
  // 在途只剩「已在跑」这一答复：热区保留（键盘焦点不掉），但光标不承诺能点。
  '.dsh-ct-hotspot[data-idle]{cursor:default}',
  // 热区没有自己的外形：它是透明的一层。focus-visible 只对键盘聚焦成立（指针
  // 点出来的焦点不匹配），下面的 :has 规则把线加亮——粗细始终只表示译文/原文。
  '.dsh-ct-hotspot:focus-visible{outline:none}',
  '.dsh-ct-prose-translated:has(.dsh-ct-hotspot:focus-visible){border-left-color:var(--dsw-alias-state-business-primary)}',
  '.dsh-ct-prose-original:has(.dsh-ct-hotspot:focus-visible){border-left-color:var(--dsw-alias-label-caption)}',
  '.dsh-ct-prose-failed:has(.dsh-ct-hotspot:focus-visible){border-left-color:var(--dsw-alias-state-error-primary)}',
  // 在途线本就在动；CSS 动画压过普通声明，聚焦的加亮必须同时停掉动画才看得见
  // （停掉脉动本身就是一次可见的变化，线也从闪烁的灰换成静止的亮灰）。
  '.dsh-ct-prose-inflight:has(.dsh-ct-hotspot:focus-visible){animation:none;border-left-color:var(--dsw-alias-label-caption)}',
  // ---- 失败块的补跑指引：小 ↻（官方图标）常驻在红线旁——失败不会被悬停
  //      发现，救活入口必须一直看得见；纯装饰（pointer-events:none），点击
  //      归热区，败因由 Tooltip 挂在热区上 ----
  '.dsh-ct-retry{position:absolute;left:2px;top:6px;display:flex;color:var(--dsw-alias-state-error-primary);pointer-events:none;z-index:3}',
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

/**
 * 正文块左缘线的状态词汇：单点在 row-plan 算出（`planAssistantRow` 直接产出
 * mark），渲染层只消费、样式层只翻成类名——「线型与脉动」不再多处重算。
 * 失败只有 `failed` 一种：同一条红实线，败因走悬停文案。
 */
export type ProseMark = 'translated' | 'original-view' | 'failed' | 'inflight' | null;

/** mark → 热区动作单点：切换、重试、没有热区三选一（渲染层照此接线）。 */
export type ProseAction = 'toggle' | 'retry' | null;

/**
 * mark → 正文块类名与热区动作的单点表。
 *
 * 一张表而不是两个并列 switch：线型（类名）与可点性（动作）从同一行读出来，
 * 加一种 mark 时不可能只改一处、留下「有线但点不动」或「可点但没有线」的
 * 半截状态。`action` 为 null 表示没有热区——没线的块（没送过模型、开关关闭、
 * 通道没配好、空白块）没有可切换的东西。
 */
interface ProsePresentation {
  /** 正文块的状态类名；null 的块只有基础类。 */
  className: string | null;
  /** 热区动作：切换、补跑、或没有热区。 */
  action: ProseAction;
}

const PROSE_BY_MARK: Record<Exclude<ProseMark, null>, ProsePresentation> = {
  translated: { className: 'dsh-ct-prose-translated', action: 'toggle' },
  'original-view': { className: 'dsh-ct-prose-original', action: 'toggle' },
  failed: { className: 'dsh-ct-prose-failed', action: 'retry' },
  // 在途有线、有热区，但 action 为 null：按下去是空操作（脉动已是「已在跑」
  // 的答复），热区保留只是为了让键盘焦点不掉回页面。
  inflight: { className: 'dsh-ct-prose-inflight', action: null },
};

/** 每个正文块都挂的基础类：定位父级（热区以它为基准绝对定位）。 */
export const PROSE_BASE_CLASS = 'dsh-ct-prose';

export function prosePresentation(mark: ProseMark): ProsePresentation {
  return mark === null ? { className: null, action: null } : PROSE_BY_MARK[mark];
}

/** mark → 热区动作（{@link prosePresentation} 的窄读法，测试与渲染层共用）。 */
export function proseAction(mark: ProseMark): ProseAction {
  return prosePresentation(mark).action;
}

/**
 * mark → 正文块类名单点：只有线型。点击不在这层——正文整块不可点，切换与
 * 补跑由左缘热区（{@link HOTSPOT_CLASS}）承载，所以这里不再有可点态/光标类。
 */
export function proseClassNames(mark: ProseMark): string | undefined {
  const line = prosePresentation(mark).className;
  return line === null ? void 0 : `${PROSE_BASE_CLASS} ${line}`;
}

/**
 * 缩进单点：能翻译（开关开 + 通道齐备）时所有正文块一律左缩进，与「这块是否
 * 已挂线」无关——译文落定的那一刻正文不右移，块与块左缘也对齐；关掉开关或
 * 通道没配好时不缩进，排版回到宿主原样（此时正文会横移一次，是刻意的取舍）。
 */
export function proseIndentClassName(canTranslate: boolean): string | undefined {
  return canTranslate ? 'dsh-ct-prose-indent' : void 0;
}

/** 左缘热区的类名单点：切换/补跑的唯一点击目标。 */
export const HOTSPOT_CLASS = 'dsh-ct-hotspot';

/** 在途热区：仍在，但按下去是空操作，光标不再变手型。 */
export const HOTSPOT_IDLE_ATTR = 'data-idle';

/** 注入接管样式；重复调用是空操作。 */
export function ensureAssistantStyles(): void {
  if (typeof document === 'undefined') return;
  const selector = `style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`;
  if (document.querySelector(selector) !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = '@lynn123411/dsh-chat-translate';
  tag.dataset.pluginCss = STYLE_TAG_ID;
  tag.textContent = ASSISTANT_CSS;
  document.head.appendChild(tag);
}
