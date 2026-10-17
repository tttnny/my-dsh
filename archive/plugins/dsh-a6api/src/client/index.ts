import React from 'react';
import { A6ApiSettingsPanel } from './components/A6ApiSettings.js';
import { SidebarCard } from './components/SidebarCard.js';
import { BUNDLE_CONFIG_KEY, BUNDLE_CONFIG_SLOT, setupPluginPage } from './settings/plugin-page.js';
import { en, NS, zh } from './locales.js';
import mainCss from './styles/main.css';
import { store } from './store.js';

export const name = '@lynn123411/dsh-a6api';
export const inject = ['slots', 'locale'];

/**
 * Register this plugin's dictionaries. Called once at the top of `apply` so the
 * copy exists before any seat renders; `ctx.get` keeps the read optional (the
 * client declares `locale`, but a bundle must still tolerate its absence).
 */
function registerNavDicts(ctx: any): void {
  const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
  if (!locale || typeof locale.register !== 'function') return;
  ctx.effect(
    () => locale.register(NS, { zh, en }),
    'dsh-a6api: settings dictionaries',
  );
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
  // 字典属于本插件自身的文本，与配置页挂在哪一页无关：放在 apply 顶层注册。
  // slots.inject 的声明边界会重新执行回调，原先写在回调里会在重声明时重复注册
  // 同一 (ns, locale) 并抛错（locale 运行时不接受重复注册）。
  registerNavDicts(ctx);
  if (typeof window === 'undefined') return;
  // 启动预热 + 后台轮询：插件随 DSH 启动即后台拉取一次完整状态（服务端 /state 已并行化），
  // 之后每 60s 整体刷新 —— 用户打开侧边栏入口的弹窗/插件配置页时数据已就绪，秒开无 spinner。
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

    // 配置入口：配置页住在宿主的「插件」页，而不是设置页。宿主在插件页声明 `plugins.bundle.config`
    // (key = bundle 包名)，把条目渲染在**该 bundle 自己的一级页面上**——描述之下、行列表之上，
    // 不用先点开某一行。页面标题、图标、面包屑由宿主插件页负责。
    // 本面板自带「可用模型 / 模型目录 / 账户资产 / 基础配置」四个内层 tab。
    // 动态注册：该 slot 只在宿主 plugin-manager 入口挂载期间存在，部署里没有这一页就什么都不留。
    ctx.effect(
      () => setupPluginPage(
        slots,
        () => slots.register(
          {
            name: BUNDLE_CONFIG_SLOT,
            // bundle 包名：插件页据此把本项渲染到本 bundle 的一级页面上。
            key: BUNDLE_CONFIG_KEY,
            // 页面负责标题/图标/面包屑；卡片保留自己的内层 tab 与顺序。
            locale: NS,
          },
          A6ApiSettingsPanel,
        ),
      ),
      'dsh-a6api: plugins page config',
    );

    // 侧边栏最下方、「设置」上方的「A6api」入口:点击在屏幕正中弹出当前会话 A6api
    // 模型的 MerchantCard 弹窗(宿主 Modal 原子:遮罩 + 居中 + Esc/点遮罩/关闭按钮)。
    // 宿主把 sidebar.footer.action 渲染在 sidebar.settings
    // 之前(即「设置」上方),两种侧边栏宽度都如此。
    // 该 slot 是 root 作用域:屋主只给 wide(没有会话身份),当前会话由组件经全局会话
    // 来源 useSessions 求出(取主视图保有的那个会话),模型选择仍走 modelDirectories。
    // order -1 让本条目排在可选的 Cordis 面板(order 0)之前。
    // getter 在 apply 闭包创建一次,引用稳定,避免 entry 重渲染触发组件 effect 反复重订阅。
    const getModelDirectories = () =>
      ctx && typeof ctx.get === 'function' ? ctx.get('modelDirectories') : undefined;
    // pluginNavigation 由宿主插件管理页在挂载期间 provide、卸载时回收,所以读法必须是
    // 可选的 ctx.get(拿不到就隐藏「配置」胶囊),并用 internal/service 订阅它的显隐。
    const getPluginNavigation = () =>
      ctx && typeof ctx.get === 'function' ? ctx.get('pluginNavigation') : undefined;
    const subscribePluginNavigation = (listener: () => void) => {
      try {
        return ctx.on('internal/service', (name: string) => {
          if (name === 'pluginNavigation') listener();
        });
      } catch {
        return () => {};
      }
    };
    slots.inject('sidebar.footer.action', () => {
      return slots.register(
        {
          name: 'sidebar.footer.action',
          id: 'dsh-a6-sidebar-entry',
          order: -1,
          label: 'A6api',
          locale: NS,
        },
        (props: any) =>
          React.createElement(SidebarCard, {
            ...(props || {}),
            getModelDirectories,
            getPluginNavigation,
            subscribePluginNavigation,
          }),
      );
    });
  } catch (err) {
    console.warn('[dsh-a6api] Failed to inject slots:', err);
  }
}