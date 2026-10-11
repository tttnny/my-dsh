import React, { useEffect, useRef, useState } from 'react';
import { IconApiOutlineMedium, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { dictionaryT, type A6apiT } from '../locales.js';
import { store } from '../store.js';
import { MerchantCard } from './MerchantCard.js';
import { PricePill } from './PricePill.js';
import { MarketPill } from './MarketPill.js';

/** 浮层宽度上限；实际宽度取它与「视口宽 - 左边缘 - 间距」中的较小值 */
const POPUP_MAX_WIDTH = 500;
/** 浮层与按钮之间、浮层与视口边缘之间的间距 */
const POPUP_GAP = 8;
/** 按钮上方空间不足时的浮层高度下限，再小就只剩一条滚动缝 */
const POPUP_MIN_HEIGHT = 120;

/** 本插件的 bundle 包名：`pluginNavigation.openBundle` 用它打开自己的配置页 */
export const BUNDLE_NAME = '@lynn123411/dsh-a6api';

/** 把 DSH 模型 ID 归一化为 A6api 模型名（剥离 provider 前缀，如 a6api/gpt-4o → gpt-4o） */
const normalizeModelId = (id: string): string => id.replace(/^[^/]+\//, '');

/** 标准全局会话 hook 缺席时的兜底：没有会话列表就当作「没有当前会话」 */
const noSessions = (): undefined => undefined;

/**
 * 按主视图保留的会话求出当前会话 ID（与宿主 `publishMain()` 同一判据）。
 * 这个入口是 root 作用域，宿主不给 `sessionId`，只能由全局会话来源求出来。
 * @param useSessions - 标准全局会话选择器 hook。
 * @returns 当前会话 ID，或没有主视图会话时的 undefined。
 */
function currentSessionId(useSessions: any): string | undefined {
  return useSessions((state: any) => {
    const byId: Record<string, any> = state?.byId ?? {};
    return Object.keys(byId)
      .map((id) => byId[id])
      .find((session: any) => (session?.retainedBy?.mainView ?? 0) > 0)?.id;
  });
}

/**
 * 可选插件的配置页跳转：`pluginNavigation` 由宿主的插件管理页在挂载期间提供，
 * 该页卸载后服务会消失——所以这里既读当前值，也订阅它的出现与消失，
 * 让「配置」胶囊跟着显隐，而不是在 apply 时探一次就写死。
 * @param get - 读取当前值的访问器。
 * @param subscribe - 值变化通知；缺席时只在挂载/重渲染时读一次。
 * @returns 当前的 `pluginNavigation` 服务，或提供者不在时的 undefined。
 */
function usePluginNavigation(get: (() => any) | undefined, subscribe: ((listener: () => void) => () => void) | undefined): any {
  const [value, setValue] = useState(() => get?.());
  useEffect(() => {
    if (!get) return;
    if (!subscribe) {
      setValue(get());
      return;
    }
    const sync = () => setValue(get());
    sync();
    return subscribe(sync);
  }, [get, subscribe]);
  return value;
}

interface SidebarCardProps {
  /** 宿主注入：侧边栏是否展开（false = 56px 图标栏） */
  wide?: boolean;
  /** 宿主注入：本插件字典的翻译函数 */
  t?: A6apiT;
  /** 宿主注入：全局会话来源（root 作用域没有会话级 sessionId） */
  useSessions?: any;
  /** apply 注入：modelDirectories 服务访问器（与模型选择器同源） */
  getModelDirectories?: () => any;
  /** apply 注入：可选 `pluginNavigation` 服务访问器 */
  getPluginNavigation?: () => any;
  /** apply 注入：订阅可选服务显隐 */
  subscribePluginNavigation?: (listener: () => void) => () => void;
}

/** 浮层的固定定位结果：从按钮右缘往右、底部贴着按钮一带 */
interface PopupPosition {
  left: number;
  bottom: number;
  maxHeight: number;
  width: number;
}

/**
 * 侧边栏最下方、「设置」上方的 A6api 入口（侧边栏展开时图标 +「A6api」文字，
 * 收窄时只剩图标），点它从按钮右侧展开模型卡片浮层：顶部账户速览胶囊行
 * （账户余额 / 价格波动 / 模型市场 / 配置），下方是当前会话所用 A6api 模型的
 * MerchantCard；会话未使用 A6api 模型时卡片区域整体置灰不可交互。
 * 与设置页共享 A6ApiStore 单例：探测/轮询/操作结果实时同步。
 */
export const SidebarCard: React.FC<SidebarCardProps> = ({
  wide = true,
  t = dictionaryT,
  useSessions,
  getModelDirectories,
  getPluginNavigation,
  subscribePluginNavigation,
}) => {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<{ provider?: string; model?: string } | null>(null);
  const [state, setState] = useState(store.getState());
  const [pos, setPos] = useState<PopupPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const fetchedRef = useRef(false);
  const lastPosRef = useRef<PopupPosition | null>(null);

  const sessionId = currentSessionId(useSessions ?? noSessions);
  const pluginNavigation = usePluginNavigation(getPluginNavigation, subscribePluginNavigation);

  // 订阅 modelDirectories：当前会话的模型选择(provider/model)，服务可能晚于插件加载，500ms 重试
  useEffect(() => {
    let disposed = false;
    let unsub: (() => void) | null = null;
    let timer: any = null;
    let tries = 0;
    const connect = () => {
      if (disposed) return;
      const md = getModelDirectories?.();
      if (!md || typeof md.directoryFor !== 'function') {
        if (tries++ < 6) timer = setTimeout(connect, 500);
        return;
      }
      let dir: any;
      try {
        dir = md.directoryFor(sessionId);
      } catch {
        dir = undefined; // 子代理等无模型选择场景
      }
      if (!dir) {
        setSelection(null);
        return;
      }
      const update = () => {
        try {
          const snap = dir.store?.getSnapshot?.();
          setSelection(snap?.current ?? null);
        } catch {
          setSelection(null);
        }
      };
      update();
      try {
        unsub = dir.store?.subscribe?.(update) ?? null;
      } catch {
        unsub = null;
      }
    };
    connect();
    return () => {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      if (unsub) {
        try {
          unsub();
        } catch {}
      }
    };
  }, [sessionId, getModelDirectories]);

  // 订阅 A6api store(与设置页同一单例,探测/轮询/操作实时同步)
  useEffect(() => {
    const unsub = store.subscribe(() => setState({ ...store.getState() }));
    return unsub;
  }, []);

  const isA6api = Boolean(selection && selection.provider === 'a6api');
  const modelName = normalizeModelId(selection?.model || '');
  // 当前会话是否正在使用 A6api 模型:决定卡片区域正常展示还是整体置灰(浮层本身任何会话都可展开)
  const hasA6apiModel = isA6api && Boolean(modelName);

  // 按模型名查商户卡片:非 A6api 会话同样查询(同名模型以置灰态展示,提示其在 A6api 可用)
  const card = modelName
    ? state.models.find((m) => m.model_name.toLowerCase() === modelName.toLowerCase())
    : undefined;

  const canOpenConfig = Boolean(pluginNavigation && typeof pluginNavigation.openBundle === 'function');

  const toggle = () => setOpen((v) => !v);

  // 打开时:定位(按钮右缘起步往右、底部贴按钮一带)+ 惰性加载 /state
  useEffect(() => {
    if (!open) {
      setPos(null);
      lastPosRef.current = null;
      return;
    }
    // fetchState 可重入:store 初始 loading=true 且仅设置页/本组件触发拉取,不能以 loading 作守卫
    if (state.models.length === 0 && !fetchedRef.current) {
      fetchedRef.current = true;
      store.fetchState().catch(() => {});
    }
    const place = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      // 按钮在屏幕左侧,浮层只能往右长:左边缘贴按钮右缘加间距,宽度取上限与剩余视野的较小值
      const left = r.right + POPUP_GAP;
      const width = Math.min(POPUP_MAX_WIDTH, vw - left - POPUP_GAP);
      // 浮层下边缘停在按钮上边缘之上;高度上限取按钮上方可用空间,内容超出时浮层内部滚动
      const bottom = window.innerHeight - r.top + POPUP_GAP;
      const maxHeight = Math.max(POPUP_MIN_HEIGHT, r.top - 2 * POPUP_GAP);
      const next = { left, bottom, maxHeight, width };
      // 位置未变则跳过 setPos:浮层内部滚动(capture 也会收到)不应触发整卡重渲染
      const last = lastPosRef.current;
      if (last
        && last.left === next.left
        && last.bottom === next.bottom
        && last.maxHeight === next.maxHeight
        && last.width === next.width) {
        return;
      }
      lastPosRef.current = next;
      setPos(next);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Esc / 外部点击关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open]);

  return (
    <>
      {/* 与旁边的「设置」同一形制：展开=图标+文字，收窄=只图标；气泡往右侧放，避免贴屏幕左缘被裁 */}
      <Tooltip
        label={
          open
            ? t('sidebarTipOpen')
            : hasA6apiModel
              ? t('sidebarTip')
              : t('sidebarTipNoModel')
        }
        side="right"
        gap={6}
        portal
      >
        <button
          ref={buttonRef}
          type="button"
          className={wide ? 'dsh-a6-sidebar-btn' : 'dsh-a6-sidebar-btn dsh-a6-sidebar-btn-rail'}
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="A6api"
        >
          <IconApiOutlineMedium size={wide ? 16 : 18} />
          {wide && <span className="dsh-a6-sidebar-btn-label">A6api</span>}
        </button>
      </Tooltip>

      {open && pos && (
        <div
          ref={popupRef}
          className="dsh-a6-sidebar-popup"
          role="dialog"
          aria-label={t('sidebarDialogLabel')}
          style={{ left: pos.left, bottom: pos.bottom, maxHeight: pos.maxHeight, width: pos.width }}
        >
          {/* 账户速览胶囊行：账号级数据，与当前模型卡片无关，加载/空态恒显示；
              余额胶囊纯展示（不可点击），价格波动胶囊可跳官网处理，模型市场胶囊直达官网模型页，
              末尾「配置」胶囊直达本插件的完整配置页（宿主插件页不可用时自动隐藏） */}
          <div className="dsh-a6-sidebar-pills">
            {state.balance?.hasAccountAuth && (
              <Tooltip
                label={t('sidebarBalanceTip')}
                side="bottom"
                align="center"
                gap={6}
                portal
              >
                <div className="dsh-a6-header-balance-badge dsh-a6-sidebar-balance-pill">
                  <span className="dsh-a6-hb-label">{t('balanceLabel')}</span>
                  <span className="dsh-a6-hb-amount">{state.balance.accountBalanceFormatted}</span>
                </div>
              </Tooltip>
            )}
            <PricePill
              pf={state.priceFluctuation}
              hasToken={Boolean(state.config?.hasToken)}
              compact
              t={t}
            />
            <MarketPill t={t} />
            {canOpenConfig && (
              <button
                type="button"
                className="dsh-a6-config-pill"
                onClick={() => {
                  try {
                    pluginNavigation.openBundle(BUNDLE_NAME);
                  } catch {}
                }}
              >
                <span className="dsh-a6-config-pill-label">{t('configPill')}</span>
              </button>
            )}
          </div>
          {/* 模型卡片区域:非 A6api 会话整体置灰且不可交互(顶部账户胶囊不受影响) */}
          <div className={hasA6apiModel ? undefined : 'dsh-a6-sidebar-card-dimmed'}>
            {card ? (
              <MerchantCard model={card} t={t} />
            ) : state.loading && state.models.length === 0 ? (
              <div className="dsh-a6-sidebar-empty">
                <div className="dsh-a6-spinner" />
                <span>{t('emptyLoading')}</span>
              </div>
            ) : hasA6apiModel ? (
              <div className="dsh-a6-sidebar-empty">
                <span>{t('sidebarNoMerchant', { name: modelName })}</span>
                <span className="dsh-a6-hint">{t('sidebarNoMerchantHint')}</span>
              </div>
            ) : (
              <div className="dsh-a6-sidebar-empty">
                <span>{t('sidebarNoModel')}</span>
                <span className="dsh-a6-hint">
                  {modelName ? t('sidebarOtherModel', { name: modelName }) : t('sidebarSwitchHint')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
