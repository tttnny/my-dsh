import React from 'react';
import { A6ApiSettingsPanel } from './components/A6ApiSettings.js';
import { A6ApiSidebarCard } from './components/A6ApiSidebarCard.js';
import mainCss from './styles/main.css';
import { store } from './store.js';

export const name = '@lynn123411/dsh-a6api';
export const inject = ['slots'];

function injectStyles() {
  if (typeof document === 'undefined') return;
  const styleId = 'dsh-a6api-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = mainCss;
    document.head.appendChild(style);
  }
}

function setupGlobalTooltip(): (() => void) | void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if ((window as any).__dsh_a6api_tooltip_setup) return () => {};
  (window as any).__dsh_a6api_tooltip_setup = true;

  const portalId = 'dsh-a6api-tooltip';
  const arrowId = 'dsh-a6api-tooltip-arrow';
  let portal: HTMLElement | null = document.getElementById(portalId) as HTMLElement | null;
  let arrow: HTMLElement | null = document.getElementById(arrowId) as HTMLElement | null;
  if (!portal) {
    portal = document.createElement('div');
    portal.id = portalId;
    portal.setAttribute('role', 'tooltip');
    portal.style.cssText = 'position:fixed;left:0;top:0;transform:translate(-9999px,-9999px);padding:6px 10px;background:rgba(15,23,42,0.96);color:#f8fafc;font-size:11px;line-height:1.4;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,0.28);border:1px solid rgba(255,255,255,0.12);max-width:min(320px,85vw);width:max-content;white-space:normal;word-break:break-word;overflow-wrap:anywhere;text-align:left;pointer-events:none;opacity:0;visibility:hidden;transition:opacity 0.08s;z-index:2147483647;';
    document.body.appendChild(portal);
  }
  if (!arrow) {
    arrow = document.createElement('div');
    arrow.id = arrowId;
    arrow.style.cssText = 'position:fixed;left:0;top:0;width:8px;height:8px;background:rgba(15,23,42,0.96);transform:translate(-9999px,-9999px) rotate(45deg);border-left:1px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.12);pointer-events:none;opacity:0;visibility:hidden;z-index:2147483646;';
    document.body.appendChild(arrow);
  }

  let currentTarget: Element | null = null;

  function hide() {
    if (!portal || !arrow) return;
    portal.style.opacity = '0';
    (portal as HTMLElement).style.visibility = 'hidden';
    arrow.style.opacity = '0';
    (arrow as HTMLElement).style.visibility = 'hidden';
    document.body.classList.remove('dsh-a6api-tooltip-active');
    currentTarget = null;
  }

  function position(target: Element) {
    if (!portal || !arrow || !target) return;
    const text = target.getAttribute('data-tooltip');
    if (!text) return;
    (portal as HTMLElement).textContent = text;
    (portal as HTMLElement).style.visibility = 'hidden';
    (portal as HTMLElement).style.opacity = '0';
    (portal as HTMLElement).style.transform = 'translate(-9999px,-9999px)';
    (portal as HTMLElement).style.visibility = 'visible';
    const ttRect = (portal as HTMLElement).getBoundingClientRect();
    (portal as HTMLElement).style.visibility = 'hidden';
    const rect = target.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    let pos = target.getAttribute('data-tooltip-pos') || '';
    if (!pos) {
      const spaceAbove = rect.top;
      const spaceBelow = vh - rect.bottom;
      if (spaceAbove < ttRect.height + gap + 12 && spaceBelow > spaceAbove) pos = 'down';
      else pos = 'top';
    }

    let top = 0;
    let left = 0;
    let arrowTop = 0;
    let arrowLeft = 0;
    const isDown = pos.startsWith('down');

    if (isDown) {
      top = rect.bottom + gap;
      arrowTop = rect.bottom + gap - 4;
    } else {
      top = rect.top - ttRect.height - gap;
      arrowTop = rect.top - gap - 4;
    }

    if (pos === 'left') {
      left = rect.right - ttRect.width;
      arrowLeft = rect.right - 14;
    } else if (pos === 'right') {
      left = rect.left;
      arrowLeft = rect.left + 14;
    } else if (pos === 'down-left') {
      left = rect.right - ttRect.width;
      arrowLeft = rect.right - 14;
    } else if (pos === 'down-right') {
      left = rect.left;
      arrowLeft = rect.left + 14;
    } else {
      left = rect.left + rect.width / 2 - ttRect.width / 2;
      arrowLeft = rect.left + rect.width / 2 - 4;
    }

    left = Math.max(margin, Math.min(left, vw - ttRect.width - margin));
    const minArrow = left + 8;
    const maxArrow = left + ttRect.width - 12;
    arrowLeft = Math.max(minArrow, Math.min(arrowLeft, maxArrow));

    if (top < margin) top = margin;
    if (top + ttRect.height > vh - margin) top = vh - ttRect.height - margin;

    (portal as HTMLElement).style.transform = 'translate(' + left + 'px,' + top + 'px)';
    (portal as HTMLElement).style.visibility = 'visible';
    (portal as HTMLElement).style.opacity = '1';
    (arrow as HTMLElement).style.transform = 'translate(' + arrowLeft + 'px,' + arrowTop + 'px) rotate(45deg)';
    (arrow as HTMLElement).style.visibility = 'visible';
    (arrow as HTMLElement).style.opacity = '1';
    document.body.classList.add('dsh-a6api-tooltip-active');
  }

  let hoverTimer: any = null;
  const onMouseOver = (e: any) => {
    const target = e.target && e.target.closest ? e.target.closest('[data-tooltip]') : null;
    if (!target) return;
    currentTarget = target;
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (currentTarget === target) position(target);
    }, 30);
  };
  const onMouseOut = (e: any) => {
    const target = e.target && e.target.closest ? e.target.closest('[data-tooltip]') : null;
    if (!target) return;
    const related = e.relatedTarget as Element | null;
    if (related && target.contains(related)) return;
    if (currentTarget === target) {
      if (hoverTimer) clearTimeout(hoverTimer);
      hide();
    }
  };
  const onFocusIn = (e: any) => {
    const target = e.target && e.target.closest ? e.target.closest('[data-tooltip]') : null;
    if (!target) return;
    currentTarget = target;
    position(target);
  };
  const onFocusOut = (e: any) => {
    const target = e.target && e.target.closest ? e.target.closest('[data-tooltip]') : null;
    if (!target) return;
    if (currentTarget === target) hide();
  };
  const onScrollOrResize = () => {
    if (currentTarget) {
      if (document.body.contains(currentTarget) && (currentTarget as any).matches && (currentTarget as HTMLElement).matches(':hover')) {
        position(currentTarget);
      } else if (document.activeElement === currentTarget) {
        position(currentTarget);
      } else {
        hide();
      }
    }
  };

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);
  document.addEventListener('scroll', onScrollOrResize, true);

  return () => {
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
    document.removeEventListener('scroll', onScrollOrResize, true);
    if (hoverTimer) clearTimeout(hoverTimer);
    try { portal?.remove(); } catch {}
    try { arrow?.remove(); } catch {}
    document.body.classList.remove('dsh-a6api-tooltip-active');
    try { delete (window as any).__dsh_a6api_tooltip_setup; } catch { (window as any).__dsh_a6api_tooltip_setup = undefined; }
    currentTarget = null;
  };
}

export function apply(ctx: any): void {
  injectStyles();
  if (typeof window !== 'undefined') {
    try {
      ctx.effect(() => {
        const dispose = setupGlobalTooltip();
        return () => {
          try { if (typeof dispose === 'function') (dispose as any)(); } catch {}
        };
      }, 'dsh-a6api: tooltip portal');
    } catch {}
  }
  if (typeof window === 'undefined') return;
  // 启动预热 + 后台轮询：插件随 DSH 启动即后台拉取一次完整状态（服务端 /state 已并行化），
  // 之后每 60s 整体刷新 —— 用户打开侧边栏浮层/设置页时数据已就绪，秒开无 spinner
  try {
    setTimeout(() => {
      try { store.warmUp(); } catch {}
      try { store.initPricePolling(); } catch {}
    }, 1500);
  } catch {}


  try {
    const slots = ctx?.slots || (ctx?.get ? ctx.get('slots') : null);
    if (!slots || typeof slots.inject !== 'function') return;

    slots.inject('settings.section', () => {
      return slots.register(
        {
          name: 'settings.section',
          id: 'dsh-a6api',
          // 约定：自有插件设置项 order 从 110 起步进 10（原生最大 100=桌面设置），保证排在所有原生项之下
          order: 120,
          label: () => 'A6api',
        },
        A6ApiSettingsPanel,
      );
    });

    // 侧边栏左下角「A6api」按钮:点击向上弹出当前会话 A6api 模型的 MerchantCard 浮层
    // getter 在 apply 闭包创建一次,引用稳定,避免 entry 重渲染触发组件 effect 反复重订阅
    const getModelDirectories = () =>
      ctx && typeof ctx.get === 'function' ? ctx.get('modelDirectories') : undefined;
    slots.inject('sidebar.footer.action', () => {
      return slots.register(
        {
          name: 'sidebar.footer.action',
          id: 'dsh-a6api-current-model',
          order: -1,
          label: () => 'A6api',
        },
        (props: any) =>
          React.createElement(A6ApiSidebarCard, {
            ...(props || {}),
            getModelDirectories,
          }),
      );
    });
  } catch (err) {
    console.warn('[dsh-a6api] Failed to inject slots:', err);
  }
}