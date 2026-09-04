/** 「扫码访问」分区样式：dshqa- 前缀，半透明中性色适配明暗两套主题。 */
export const QR_ACCESS_CSS = `
.dshqa-panel{display:flex;flex-direction:column;gap:16px;max-width:620px;width:100%;font-size:14px;color:inherit}
.dshqa-card{border:1px solid rgba(128,128,128,.28);border-radius:12px;background:rgba(128,128,128,.06);padding:16px;display:flex;flex-direction:column;gap:12px}
.dshqa-card-title{display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:600;font-size:14px;flex-wrap:wrap}
.dshqa-title-right{display:inline-flex;align-items:center;gap:10px}
.dshqa-desc{font-size:12px;line-height:1.7;opacity:.72;word-break:break-word}
.dshqa-badge{display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:500;flex:none}
.dshqa-badge.ok{color:#16a34a;background:rgba(22,163,74,.12)}
.dshqa-badge.warn{color:#d97706;background:rgba(217,119,6,.14)}
.dshqa-badge.err{color:#dc2626;background:rgba(220,38,38,.12)}
.dshqa-badge.muted{color:#6b7280;background:rgba(107,114,128,.16)}
.dshqa-btn{appearance:none;border:1px solid rgba(128,128,128,.35);background:transparent;color:inherit;border-radius:8px;padding:5px 14px;font-size:12.5px;cursor:pointer;transition:background .15s ease;flex:none}
.dshqa-btn:hover{background:rgba(128,128,128,.12)}
.dshqa-btn:disabled{opacity:.5;cursor:default}
.dshqa-tabs{display:inline-flex;gap:4px;background:rgba(128,128,128,.12);border-radius:9px;padding:3px}
.dshqa-tab{appearance:none;border:none;background:transparent;color:inherit;border-radius:7px;padding:4px 12px;font-size:12.5px;cursor:pointer;opacity:.7}
.dshqa-tab.active{background:rgba(128,128,128,.2);opacity:1;font-weight:600}
.dshqa-addr-list{display:flex;flex-direction:column;gap:8px}
.dshqa-addr{display:flex;align-items:center;gap:10px;border:1px solid rgba(128,128,128,.3);border-radius:10px;padding:10px 12px;cursor:pointer;background:transparent;color:inherit;text-align:left;transition:border-color .15s ease,background .15s ease;width:100%}
.dshqa-addr:hover{background:rgba(128,128,128,.08)}
.dshqa-addr.active{border-color:#3b82f6;background:rgba(59,130,246,.08)}
.dshqa-addr-dot{width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(128,128,128,.6);flex:none;position:relative}
.dshqa-addr.active .dshqa-addr-dot{border-color:#3b82f6}
.dshqa-addr.active .dshqa-addr-dot::after{content:'';position:absolute;inset:2.5px;border-radius:50%;background:#3b82f6}
.dshqa-addr-main{display:flex;flex-direction:column;gap:2px;min-width:0}
.dshqa-addr-title{font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dshqa-addr-host{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;opacity:.66;word-break:break-all}
.dshqa-tag{font-size:10.5px;padding:1px 7px;border-radius:999px;background:rgba(107,114,128,.18);color:inherit;opacity:.75;font-weight:500;flex:none}
.dshqa-tag.lan{background:rgba(22,163,74,.14);color:#16a34a;opacity:1}
.dshqa-qr-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px;border-radius:10px;background:rgba(128,128,128,.06)}
.dshqa-qr-svg{display:block;border-radius:8px;box-shadow:0 1px 8px rgba(0,0,0,.14)}
.dshqa-url{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;opacity:.8;word-break:break-all;text-align:center;user-select:all;line-height:1.6}
.dshqa-copy-row{display:flex;justify-content:center}
.dshqa-note{font-size:12px;line-height:1.8;opacity:.72;word-break:break-word}
.dshqa-note code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;word-break:break-all}
.dshqa-qr-fail{font-size:12px;opacity:.6;padding:24px}
`;

let stylesInjected = false;

/** 往 head 注入一次分区样式（幂等；随页面生命周期存活，卸载分区不移除）。 */
export function ensureStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.dataset.dshQrAccess = 'true';
  el.textContent = QR_ACCESS_CSS;
  document.head.appendChild(el);
  stylesInjected = true;
}
