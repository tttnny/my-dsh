/**
 * 助手行接管所需的样式：与宿主 `AssistantMarkdown` / `ReasoningRow` 逐条对齐
 * 的等价规则（字号、行距、gap、粘性折叠头、running 微光、summary 遮罩等）。
 *
 * 正文左缘**不画任何东西**——没有竖线、没有脉动、也没有缩进：正文的排版与宿主
 * 默认完全一致。标记只剩两种语义类，且都只是状态钩子、不带任何绘制规则：
 * `dsh-ct-prose-translated`（有译文）与 `dsh-ct-prose-failed`（失败）。
 *
 * 交互压到三个东西上，全部落在正文之外：
 * 1. 成功块的可点面是 `dsh-ct-hotspot`——正文左缘外侧那条 6px 透明窄带。它整条
 *    落在正文之外（不占正文一个像素），切换译文与原文都由它承载。
 * 2. 成功块上方还有一条 `dsh-ct-toolbar`：鼠标进入正文、或键盘焦点落进块里时，
 *    在块**上方**浮出一颗按钮（文案就是当前能做的那个动作），鼠标移开收回。
 *    它绝对定位，不占正文位置，也不改变排版；收起时用 visibility 而不是 display:none，
 *    这样它仍在 Tab 序列里——键盘走到它，它就现身。
 * 3. 失败块的可点面是 `dsh-ct-retry`——一个真的 button（小 ↻），浮在正文左缘
 *    外侧更远一点的位置；补跑在途时它原位转圈（`data-busy`），不重挂载。
 *
 * 左缘那两样不给可见的焦点框：键盘可以聚焦，但界面不加任何标记——这是明说的
 * 取舍；工具条上那颗按钮是浮出的可见控件，给一个可见的焦点环。
 * 悬停也不改任何视觉，只有指针变手型。动画声明尊重 `prefers-reduced-motion`。
 * 样式随 bundle 注入一次（`<style data-plugin-css>`），类名用固定前缀，不依赖
 * 宿主哈希类名。
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
  // ---- 正文块：排版与宿主默认逐字一致（无 padding、无 border），只做两件事——
  //      当窄带与 ↻ 的定位父级，以及承载一个纯语义的状态类 ----
  '.dsh-ct-prose{position:relative}',
  // ---- 左缘窄带：从正文左缘往外 6px 的一条透明带子，整条在正文之外。绝对定位
  //      的偏移以 padding box 为基准，而正文从 padding box 左缘起排；`left:-6px`
  //      + `width:6px` 于是恰好落在 [-6px,0)，一个字都不压，也不占排版。
  //      z-index 压过宽表格的透明出血层（那条规则给 table 挂了 z-index:1）。
  //      宿主正文列左侧恒定有 32px（侧栏嵌入 24px）内边距，这条带子落在空白里。 ----
  '.dsh-ct-hotspot{position:absolute;left:-6px;top:0;bottom:0;width:6px;margin:0;padding:0;border:0;background:0 0;cursor:pointer;z-index:2;-webkit-appearance:none;appearance:none}',
  // 键盘可聚焦，但不加任何可见标记：没有 outline，也没有别的变化。
  '.dsh-ct-hotspot:focus-visible{outline:none}',
  // ---- 成功块上方的悬浮工具条：鼠标进入正文或键盘焦点落进块里时，在块**上方**
  //      浮出一个小按钮（读译文时是「查看原文」，反之亦然）。它绝对定位在正文
  //      之上，既不占正文位置、也不进排版流；鼠标移开即收回。左缘那条窄带照旧
  //      存在——两条路都通向同一个动作。 ----
  //     用 visibility 而不是 display:none 收起：display:none 会让按钮既不可聚焦、
  //      也永远进不了 Tab 序列，「键盘焦点落进来时出现」就成了一句空话。visibility
  //      仍然把它从指针与排版里拿走（不占位置、不接点击），但可聚焦——Tab 到它时
  //      :focus-within 立刻让它现身，给出可见的焦点环。 ----
  '.dsh-ct-toolbar{position:absolute;bottom:100%;left:0;margin-bottom:2px;visibility:hidden;opacity:0;z-index:4}',
  '.dsh-ct-prose:hover>.dsh-ct-toolbar,.dsh-ct-prose:focus-within>.dsh-ct-toolbar{visibility:visible;opacity:1}',
  '.dsh-ct-toolbar-button{display:inline-flex;align-items:center;gap:4px;margin:0;padding:1px 8px;border:0;border-radius:var(--dsw-radius-sm,4px);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:20px;cursor:pointer;-webkit-appearance:none;appearance:none}',
  '.dsh-ct-toolbar-button:hover{color:var(--dsw-alias-label-primary)}',
  // 工具条上的按钮给键盘一个看得见的落点（与左缘那两样不同：它是浮出的可见控件）。
  '.dsh-ct-toolbar-button:focus-visible{outline:1px solid var(--dsw-alias-label-secondary);outline-offset:1px}',
  // ---- 失败块的 ↻：真按钮，常驻在正文左侧的空隙里（`left:-18px` + 16px 宽，
  //      右缘距正文 2px，覆盖不到任何文字）。它是失败段唯一的点击目标——失败
  //      块不放窄带，一段落只对应一个动作。 ----
  '.dsh-ct-retry{position:absolute;left:-18px;top:2px;width:16px;height:20px;display:flex;align-items:center;justify-content:center;margin:0;padding:0;border:0;background:0 0;color:var(--dsw-alias-state-error-primary);cursor:pointer;z-index:3;-webkit-appearance:none;appearance:none}',
  // 补跑在途：原位转圈（同一个节点，不重挂载——键盘焦点不掉），并停止承诺重复点。
  '.dsh-ct-retry[data-unconfigured]{color:var(--dsw-alias-label-tertiary)}',
  '.dsh-ct-retry[data-busy]{cursor:default}',
  '.dsh-ct-retry[data-busy] .dsh-ct-retry-spin{animation:0.9s linear infinite dsh-ct-retry-spin}',
  '@keyframes dsh-ct-retry-spin{to{transform:rotate(360deg)}}',
  // 尊重 reduced-motion：不转圈，但「按下去没用」这件事必须仍然看得见——否则
  // 关掉动画后按钮就只剩「点不动又没提示」。用静态的变淡替代旋转。
  '@media (prefers-reduced-motion:reduce){.dsh-ct-retry-spin{animation:none}.dsh-ct-retry[data-busy]{opacity:.45}}',
  // 键盘同样可以聚焦 ↻，但界面不给任何可见标记（与窄带一致）。
  '.dsh-ct-retry:focus-visible{outline:none}',
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
 * 正文块的状态词汇：只剩「翻成了」与「没翻成」两种。单点在 row-plan 算出
 * （`planAssistantRow` 直接产出 mark），渲染层只消费、样式层只翻成类名。
 * 「这块当前显示译文还是原文」不再是一种 mark——它是同一份成功结果上的显示
 * 源选择（`showingOriginal`），所以切回原文后标记不变、也仍然切得回来。
 */
export type ProseMark = 'translated' | 'failed' | null;

/** mark → 左缘动作单点：切换、补跑、没有可点物三选一（渲染层照此接线）。 */
export type ProseAction = 'toggle' | 'retry' | null;

/**
 * mark → 状态类名与左缘动作的单点表。
 *
 * 一张表而不是两个并列 switch：类名与可点性从同一行读出来，加一种 mark 时
 * 不可能只改一处、留下「有类名但点不动」或「可点但没有类」的半截状态。
 * `action` 为 null 表示左缘没有可点物——没有结果的块（没送过模型、开关关闭、
 * 通道没配好、空白块）没有可切换的东西。
 */
interface ProsePresentation {
  /** 正文块的语义状态类名（不带任何绘制规则，只作状态钩子）。 */
  className: string;
  /** 左缘动作：切换、补跑、或没有可点物。 */
  action: ProseAction;
}

const PROSE_BY_MARK: Record<Exclude<ProseMark, null>, ProsePresentation> = {
  translated: { className: 'dsh-ct-prose-translated', action: 'toggle' },
  failed: { className: 'dsh-ct-prose-failed', action: 'retry' },
};

/** 每个正文块都挂的基础类：窄带与 ↻ 的定位父级。 */
export const PROSE_BASE_CLASS = 'dsh-ct-prose';

/** mark → 状态类名与左缘动作（{@link proseClassNames} / {@link proseAction} 的唯一读法）。 */
function prosePresentation(mark: ProseMark): ProsePresentation | null {
  return mark === null ? null : PROSE_BY_MARK[mark];
}

/** mark → 左缘动作（{@link prosePresentation} 的窄读法，测试与渲染层共用）。 */
export function proseAction(mark: ProseMark): ProseAction {
  return prosePresentation(mark)?.action ?? null;
}

/**
 * mark → 正文块类名单点：只有语义状态类。点击不在这层——正文整块不可点，
 * 切换归左缘窄带、补跑归 ↻（{@link HOTSPOT_CLASS} / {@link RETRY_CLASS}）。
 */
export function proseClassNames(mark: ProseMark): string | undefined {
  const presentation = prosePresentation(mark);
  return presentation === null ? void 0 : `${PROSE_BASE_CLASS} ${presentation.className}`;
}

/** 成功块的可点窄带类名：左缘外 6px 的透明带子，切换译文/原文。 */
export const HOTSPOT_CLASS = 'dsh-ct-hotspot';

/** 成功块上方那条悬浮工具条的类名（鼠标进入或键盘聚焦时出现）。 */
export const TOOLBAR_CLASS = 'dsh-ct-toolbar';

/** 工具条上那颗按钮的类名。 */
export const TOOLBAR_BUTTON_CLASS = 'dsh-ct-toolbar-button';

/** 失败块的 ↻ 类名：一个真的 button，点它只重发这一块。 */
export const RETRY_CLASS = 'dsh-ct-retry';

/** 补跑在途态：挂在 ↻ 自己身上（同一个节点，只换属性，不重挂载）。 */
export const RETRY_BUSY_ATTR = 'data-busy';

/**
 * 「设置还没配好」类失败：同一个 ↻ 位置上的按钮降到次要色（错误红是「通道伤了」
 * 的颜色，设置问题不是通道伤）。位置、可点性、读屏标签都不变——第一题选了 C，
 * 按钮不改成跳转，只是把它报的原因说清楚。
 */
export const RETRY_UNCONFIGURED_ATTR = 'data-unconfigured';

/** ↻ 的转圈图标类名（转的是图标本身，按钮位置不动）。 */
export const RETRY_SPIN_CLASS = 'dsh-ct-retry-spin';

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
