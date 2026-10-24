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
.dsh-maple-unit{font-size:12px;color:var(--dsw-alias-label-tertiary);min-width:18px}
.dsh-maple-note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);padding-top:12px}
.dsh-maple-empty{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
`;
