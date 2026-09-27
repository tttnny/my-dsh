import React from 'react';
import { A6ApiSettingsPanel } from './components/A6ApiSettings.js';
import { A6ApiComposerCard } from './components/A6ApiComposerCard.js';
import { RELAY_ITEM_SLOT, claimRelaySettingsPage } from './relay-settings-page.js';
import { en, NS, zh } from './locales.js';
import mainCss from './styles/main.css';
import { store } from './store.js';

export const name = '@lynn123411/dsh-a6api';
export const inject = ['slots', 'locale'];

/**
 * Register this plugin's dictionaries. Called once at the top of `apply` so the
 * copy exists whether or not this plugin wins the shared page election; `ctx.get`
 * keeps the read optional (the client declares `locale`, but a bundle must still
 * tolerate its absence).
 */
function registerNavDicts(ctx: any): void {
  const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
  if (!locale || typeof locale.register !== 'function') return;
  ctx.effect(
    () => locale.register(NS, { zh, en }),
    'dsh-a6api: settings dictionaries',
  );
}

/** Translated title thunk; falls back to the built-in dictionary without locale. */
function navLabel(ctx: any, key: 'pageNav' | 'tabNav'): () => string {
  const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
  if (locale && typeof locale.bind === 'function') {
    return () => locale.bind(NS)(key);
  }
  return () => zh[key];
}

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

export function apply(ctx: any): void {
  injectStyles();
  // 字典属于本插件自身的文本，与是否当选共享页宿主无关：放在 apply 顶层注册。
  // slots.inject 的声明边界会重新执行回调，原先写在回调里会在重声明时重复注册
  // 同一 (ns, locale) 并抛错（locale 运行时不接受重复注册）。
  registerNavDicts(ctx);
  if (typeof window === 'undefined') return;
  // 启动预热 + 后台轮询：插件随 DSH 启动即后台拉取一次完整状态（服务端 /state 已并行化），
  // 之后每 60s 整体刷新 —— 用户打开输入框下方的浮层/设置页时数据已就绪，秒开无 spinner。
  // 必须挂在 ctx.effect 内：卸载 / 热重载（HMR）时清掉启动定时器并停掉 store 的 60s 轮询，
  // 否则每次重新 apply 都会再挂一份无 disposer 的定时器（旧实现 setTimeout 在 effect 之外）。
  // 清理复用 store.stopAutoRefresh()（clear interval 并置空 autoRefreshTimer）；
  // 之后重新 apply 时 initPricePolling() 见 timer 为空会重新 startAutoRefresh，语义自洽。
  try {
    ctx.effect(() => {
      const warmupTimer = setTimeout(() => {
        try { store.warmUp(); } catch {}
        try { store.initPricePolling(); } catch {}
      }, 1500);
      return () => {
        clearTimeout(warmupTimer);
        try { store.stopAutoRefresh(); } catch {}
      };
    }, 'dsh-a6api: warmup & price polling');
  } catch {}


  try {
    const slots = ctx?.slots || (ctx?.get ? ctx.get('slots') : null);
    if (!slots || typeof slots.inject !== 'function') return;

    // 设置入口：与 dsh-llm-agentrouter 共用「API中转」一页（外层 tab = 参与插件各一张卡片，
    // 内核不允许一页被两个插件共同声明，故先激活者当选页面宿主，见 relay-settings-page.js）。
    // 本面板自带「可用模型 / 模型目录 / 账户资产 / 基础配置」四个内层 tab，整体作为外层一张卡片。
    slots.inject('settings.section', () => {
      return claimRelaySettingsPage(ctx, navLabel(ctx, 'pageNav'));
    });
    slots.inject(RELAY_ITEM_SLOT, () => {
      return slots.register(
        {
          name: RELAY_ITEM_SLOT,
          // id = 本插件的设置命名空间：共享页按 id 过滤本 tab 的面板，故须与卡片自身命名空间一致
          id: 'dsh-a6api',
          order: 10,
          // 卡片文案由本插件的 locale 命名空间提供
          locale: NS,
          // label 由共享页投影为外层 tab 标题
          label: navLabel(ctx, 'tabNav'),
        },
        A6ApiSettingsPanel,
      );
    });

    // 输入框下方那一行的「A6api」按钮:点击贴按钮上沿向上弹出当前会话 A6api 模型的 MerchantCard 浮层。
    // order -1 让按钮排在官方 StatsPills(order 0)左侧;会话身份由该 slot 的会话级标准属性 sessionId 提供。
    // getter 在 apply 闭包创建一次,引用稳定,避免 entry 重渲染触发组件 effect 反复重订阅
    const getModelDirectories = () =>
      ctx && typeof ctx.get === 'function' ? ctx.get('modelDirectories') : undefined;
    slots.inject('conversation.composer.dock', () => {
      return slots.register(
        {
          name: 'conversation.composer.dock',
          id: 'dsh-a6api-current-model',
          order: -1,
        },
        (props: any) =>
          React.createElement(A6ApiComposerCard, {
            ...(props || {}),
            getModelDirectories,
          }),
      );
    });
  } catch (err) {
    console.warn('[dsh-a6api] Failed to inject slots:', err);
  }
}