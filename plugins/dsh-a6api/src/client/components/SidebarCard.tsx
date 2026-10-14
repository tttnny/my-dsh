import React, { useEffect, useRef, useState } from 'react';
import { IconApiOutlineMedium, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { dictionaryT, type A6apiT } from '../locales.js';
import { BUNDLE_CONFIG_KEY } from '../settings/plugin-page.js';
import { store } from '../store.js';
import { MerchantCard } from './MerchantCard.js';
import { PricePill } from './PricePill.js';
import { MarketPill } from './MarketPill.js';

/** 弹窗卡片的钩子类：宿主 Modal 默认 380px 宽，这里放宽到 500px 并给出高度上限 */
const MODAL_CLASS = 'dsh-a6-sidebar-modal';
/** 弹窗正文区的钩子类：正文行据此收起为滚动区，标题栏与关闭按钮钉在卡片顶部 */
const MODAL_CONTENT_CLASS = 'dsh-a6-sidebar-modal-content';

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

/**
 * 侧边栏最下方、「设置」上方的 A6api 入口（侧边栏展开时图标 +「A6api」文字，
 * 收窄时只剩图标），点它在屏幕正中弹出宿主原生 Modal：顶部账户速览胶囊行
 * （账户余额 / 价格波动 / 模型市场 / 配置），下方是当前会话所用 A6api 模型的
 * MerchantCard；会话未使用 A6api 模型时卡片区域整体置灰不可交互。
 * 遮罩、Esc、关闭按钮与焦点回收都由 Modal 原子负责，本组件不再自绘容器与位置。
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
  const fetchedRef = useRef(false);

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
  // 当前会话是否正在使用 A6api 模型:决定卡片区域正常展示还是整体置灰(弹窗本身任何会话都可展开)
  const hasA6apiModel = isA6api && Boolean(modelName);

  // 按模型名查商户卡片:非 A6api 会话同样查询(同名模型以置灰态展示,提示其在 A6api 可用)
  const card = modelName
    ? state.models.find((m) => m.model_name.toLowerCase() === modelName.toLowerCase())
    : undefined;

  const canOpenConfig = Boolean(pluginNavigation && typeof pluginNavigation.openBundle === 'function');

  // 点入口即开窗：弹窗盖在遮罩之下，入口按钮点不到第二次，收拢只走 Modal 的
  // 关闭按钮 / Esc / 点遮罩（三条路径都汇到这里的 onClose）。
  const openDialog = () => setOpen(true);
  const closeDialog = () => setOpen(false);

  // 打开时惰性加载 /state
  useEffect(() => {
    if (!open) return;
    // fetchState 可重入:store 初始 loading=true 且仅设置页/本组件触发拉取,不能以 loading 作守卫
    if (state.models.length === 0 && !fetchedRef.current) {
      fetchedRef.current = true;
      store.fetchState().catch(() => {});
    }
  }, [open]);

  return (
    <>
      {/* 与旁边的「设置」同一形制：展开=图标+文字，收窄=只图标；气泡往右侧放，避免贴屏幕左缘被裁 */}
      <Tooltip
        label={hasA6apiModel ? t('sidebarTip') : t('sidebarTipNoModel')}
        side="right"
        gap={6}
        portal
      >
        <button
          type="button"
          className={wide ? 'dsh-a6-sidebar-btn' : 'dsh-a6-sidebar-btn dsh-a6-sidebar-btn-rail'}
          onClick={openDialog}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="A6api"
        >
          <IconApiOutlineMedium size={wide ? 16 : 18} />
          {wide && <span className="dsh-a6-sidebar-btn-label">A6api</span>}
        </button>
      </Tooltip>

      <Modal
        open={open}
        onClose={closeDialog}
        title={t('sidebarDialogLabel')}
        closeLabel={t('dialogClose')}
        className={MODAL_CLASS}
        contentClassName={MODAL_CONTENT_CLASS}
      >
        {/* 账户速览胶囊行：账号级数据，与当前模型卡片无关，加载/空态恒显示；
            余额胶囊纯展示（不可点击），价格波动胶囊可跳官网处理，模型市场胶囊直达官网模型页，
            末尾「配置」胶囊直达本插件的完整配置页（宿主插件页不可用时自动隐藏）。
            正文滚动时这一行钉在滚动区顶部，胶囊始终可点。 */}
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
                  pluginNavigation.openBundle(BUNDLE_CONFIG_KEY);
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
      </Modal>
    </>
  );
};
