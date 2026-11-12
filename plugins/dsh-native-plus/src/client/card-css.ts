/** 卡片自己的样式。宿主「插件」页只提供页面骨架，行布局由卡片自己给。
 *
 * 形状照宿主的设置行：左边标题与说明，右边控件；整块是一张卡片，不加阴影——
 * 浮起来的才是菜单与弹窗。颜色一律取 --dsw-alias-*，深浅两套自动跟随。
 */
export const CARD_CSS = `
.dsh-np-card{display:flex;flex-direction:column;gap:16px;padding:16px 0}
.dsh-np-rows{display:flex;flex-direction:column}
.dsh-np-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
.dsh-np-rows > .dsh-np-row:last-child{border-bottom:0}
.dsh-np-row-info{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-np-row-title{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.dsh-np-row-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dsh-np-row-field{flex:none;display:flex;align-items:center;gap:8px}
.dsh-np-number{width:76px}
/* 数值滑块：细轨 + 圆点。 */
.dsh-np-slider{width:110px;height:32px;appearance:none;background:transparent;cursor:pointer;margin:0}
.dsh-np-slider::-webkit-slider-runnable-track{height:4px;border-radius:999px;corner-shape:round;
  background:var(--dsw-alias-border-l3)}
.dsh-np-slider::-webkit-slider-thumb{appearance:none;width:12px;height:12px;margin-top:-4px;border-radius:999px;
  corner-shape:round;background:var(--dsw-alias-brand-primary);border:0 solid transparent}
.dsh-np-slider:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;border-radius:999px}
.dsh-np-unit{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:none;min-width:16px}
.dsh-np-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);padding-top:8px}
.dsh-np-empty{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
`;
