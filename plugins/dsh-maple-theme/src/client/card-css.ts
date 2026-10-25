/** 卡片自己的样式。宿主「插件」页只提供页面骨架，行布局由卡片自己给。
 *
 * 形状照宿主的设置行：左边标题与说明，右边控件；整块是一张卡片（填充 + 发丝描边），
 * 不加阴影——浮起来的才是菜单与弹窗。颜色一律取 --dsw-alias-*，深浅两套自动跟随。
 */
export const CARD_CSS = `
.dsh-maple-card{display:flex;flex-direction:column;gap:20px;padding:16px 0}
.dsh-maple-group{display:flex;flex-direction:column;gap:4px}
.dsh-maple-group-title{font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-tertiary);letter-spacing:.02em}
.dsh-maple-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:0.5px solid var(--dsw-alias-border-l1)}
.dsh-maple-row:last-child{border-bottom:0}
.dsh-maple-row-info{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-maple-row-title{font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.dsh-maple-row-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dsh-maple-row-field{flex:none;display:flex;align-items:center;gap:8px}
.dsh-maple-number{width:88px}
/* 预设选择器：与同一行的数字框同高同圆角，右边一枚下拉箭头。 */
.dsh-maple-select{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 8px 0 12px;box-sizing:border-box;
  border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:14px;line-height:22px;cursor:pointer}
.dsh-maple-select:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-maple-select:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));outline-offset:2px}
.dsh-maple-select-label{min-width:72px;text-align:left}
.dsh-maple-chevron{flex:none;color:var(--dsw-alias-label-tertiary)}
/* 色相滑块：轨道本身铺一条色相环，拖到哪就是哪个色，比看数字直观。 */
.dsh-maple-hue{width:140px;height:32px;appearance:none;background:transparent;cursor:pointer;margin:0}
.dsh-maple-hue::-webkit-slider-runnable-track{height:6px;border-radius:999px;corner-shape:round;
  background:linear-gradient(to right,
    hsl(0 60% 62%), hsl(40 60% 62%), hsl(80 60% 62%), hsl(120 60% 62%),
    hsl(160 60% 62%), hsl(200 60% 62%), hsl(240 60% 62%), hsl(280 60% 62%),
    hsl(320 60% 62%), hsl(360 60% 62%))}
.dsh-maple-hue::-webkit-slider-thumb{appearance:none;width:14px;height:14px;margin-top:-4px;border-radius:999px;
  corner-shape:round;background:var(--dsw-alias-label-primary-foreground);
  border:1.5px solid var(--dsw-alias-border-l3);box-shadow:var(--dsw-elevation-panel)}
.dsh-maple-hue:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:4px;border-radius:999px}
.dsh-maple-unit{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:none}
.dsh-maple-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);padding-top:12px}
.dsh-maple-empty{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
`;
