import React, { useEffect, useRef, useState } from 'react';
import { store } from '../store.js';
import { MerchantCard } from './MerchantCard.js';
import { PricePill } from './PricePill.js';
import { MarketPill } from './MarketPill.js';

const POPUP_MAX_WIDTH = 500;

/** 把 DSH 模型 ID 归一化为 A6api 模型名(剥离 provider 前缀,如 a6api/gpt-4o → gpt-4o) */
const normalizeModelId = (id: string): string => id.replace(/^[^/]+\//, '');

interface A6ApiSidebarCardProps {
  /** 宿主注入:侧边栏是否宽布局(false = 56px rail) */
  wide: boolean;
  /** 宿主注入:会话列表快照钩子(取 current 即当前会话 ID) */
  useSessions?: (selector: (s: any) => any) => any;
  /** apply 注入:modelDirectories 服务访问器(与 composer 模型选择器同源) */
  getModelDirectories?: () => any;
}

/**
 * 侧边栏左下角「A6api」按钮 + 向上弹出浮层(任何会话均可展开):顶部为账户速览胶囊行,
 * 下方为当前会话模型对应的 MerchantCard;会话未使用 A6api 模型时卡片区域整体置灰不可交互。
 * 与设置页共享 A6ApiStore 单例:探测/轮询/操作结果实时同步。
 *
 * useSessions 是 React hook,不能条件调用:由外层按「壳是否注入」分派到两个固定
 * 分支(内层恒调用 / 无钩子分支恒不调用),规避 Rules of Hooks 风险。
 */
export const A6ApiSidebarCard: React.FC<A6ApiSidebarCardProps> = ({
  wide,
  useSessions,
  getModelDirectories,
}) => {
  if (useSessions) {
    return (
      <A6ApiSidebarCardInner
        wide={wide}
        useSessions={useSessions}
        getModelDirectories={getModelDirectories}
      />
    );
  }
  return <A6ApiSidebarCardBody wide={wide} getModelDirectories={getModelDirectories} />;
};

const A6ApiSidebarCardInner: React.FC<{
  wide: boolean;
  useSessions: (selector: (s: any) => any) => any;
  getModelDirectories?: () => any;
}> = ({ wide, useSessions, getModelDirectories }) => {
  // 恒调用 hook(存在性由外层分派保证)
  const currentId: string | undefined = useSessions((s: any) => s?.current);
  return (
    <A6ApiSidebarCardBody
      wide={wide}
      currentId={currentId}
      getModelDirectories={getModelDirectories}
    />
  );
};

interface A6ApiSidebarCardBodyProps {
  wide: boolean;
  currentId?: string;
  getModelDirectories?: () => any;
}

const A6ApiSidebarCardBody: React.FC<A6ApiSidebarCardBodyProps> = ({
  wide,
  currentId,
  getModelDirectories,
}) => {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<{ provider?: string; model?: string } | null>(null);
  const [state, setState] = useState(store.getState());
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const flippedRef = useRef(false);
  const fetchedRef = useRef(false);
  const lastPosRef = useRef<{ left: number; top?: number; bottom?: number } | null>(null);

  // 订阅 modelDirectories:当前会话的模型选择(provider/model),服务可能晚于插件加载,500ms 重试
  useEffect(() => {
    let disposed = false;
    let unsub: (() => void) | null = null;
    let tries = 0;
    const connect = () => {
      if (disposed) return;
      const md = getModelDirectories?.();
      if (!md || typeof md.directoryFor !== 'function') {
        if (tries++ < 6) setTimeout(connect, 500);
        return;
      }
      let dir: any;
      try {
        dir = md.directoryFor(currentId);
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
      if (unsub) {
        try {
          unsub();
        } catch {}
      }
    };
  }, [currentId, getModelDirectories]);

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

  const toggle = () => setOpen((v) => !v);

  // 打开时:定位(锚定按钮向上展开,空间不足/按钮出视口则翻转)+ 惰性加载 /state
  useEffect(() => {
    if (!open) {
      setPos(null);
      lastPosRef.current = null;
      flippedRef.current = false;
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
      const width = Math.min(POPUP_MAX_WIDTH, vw - 16);
      const left = Math.max(8, Math.min(r.left, vw - width - 8));
      // 按钮被 footer 滚动推出视口(top<0)时同样翻转,避免浮层 bottom 锚出视口
      const flipped = flippedRef.current || r.top < 8;
      if (flipped) flippedRef.current = true;
      const next = flipped
        ? { left, top: r.bottom + 8 }
        : { left, bottom: window.innerHeight - r.top + 8 };
      // 位置未变则跳过 setPos:浮层内部滚动(capture 也会收到)不应触发整卡重渲染
      const last = lastPosRef.current;
      if (
        last &&
        last.left === next.left &&
        (last.top ?? null) === (next.top ?? null) &&
        (last.bottom ?? null) === (next.bottom ?? null)
      ) {
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

  // 翻转重测:浮层内容增长(卡片展开「详情」等内部状态、数据加载)时自动翻转
  useEffect(() => {
    if (!open || !popupRef.current) return;
    const checkFlip = () => {
      if (flippedRef.current || !popupRef.current) return;
      const rect = popupRef.current.getBoundingClientRect();
      if (rect.top < 8) {
        flippedRef.current = true;
        const btn = buttonRef.current;
        if (btn) {
          const r = btn.getBoundingClientRect();
          setPos({ left: lastPosRef.current?.left ?? 8, top: r.bottom + 8 });
        }
      }
    };
    checkFlip();
    const ro = new ResizeObserver(checkFlip);
    ro.observe(popupRef.current);
    return () => ro.disconnect();
  }, [open, pos]);

  // Esc / 外部点击关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popupRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
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
      <span
        className={`dsh-a6-side-btn-wrap${wide ? '' : ' rail'}`}
        data-tooltip={!hasA6apiModel ? '当前会话未使用 A6api 模型，卡片已置灰' : undefined}
      >
        <button
          ref={buttonRef}
          type="button"
          className={`dsh-a6-side-btn${wide ? '' : ' rail'}`}
          onClick={toggle}
          aria-expanded={open}
          aria-label={wide ? undefined : 'A6api'}
          data-tooltip={hasA6apiModel ? (open ? '收起 A6api 模型卡片' : '查看当前会话的 A6api 模型卡片') : undefined}
        >
          {/* 与设置按钮同款齿轮图标(currentColor 跟随文字色) */}
          <svg
            className="dsh-a6-side-btn-badge"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M14.0861 5.51366C13.8717 5.0575 13.588 4.58542 13.2889 4.18108C13.208 4.07172 13.1596 4.04373 13.0243 4.03054C12.4277 3.97255 11.8245 4.05527 11.2269 3.9972C10.7224 3.94816 10.3133 3.71661 10.0115 3.30919C9.66986 2.84777 9.43973 2.31343 9.09824 1.85234C9.01771 1.74365 8.96805 1.71589 8.83354 1.70282C8.29432 1.65044 7.70402 1.65061 7.16656 1.70282C7.03205 1.71589 6.98239 1.74365 6.90186 1.85234C6.56067 2.31303 6.33025 2.84774 5.98855 3.30919C5.68681 3.71661 5.27774 3.94816 4.77317 3.9972C4.17564 4.05527 3.57239 3.97255 2.97585 4.03054C2.84046 4.04373 2.79208 4.07172 2.71115 4.18108C2.41212 4.58542 2.12835 5.0575 1.91403 5.51366C1.85299 5.64359 1.85286 5.7018 1.91403 5.8319C2.14865 6.33077 2.49748 6.76892 2.73237 7.26854C2.9594 7.7515 2.96041 8.24717 2.73338 8.73044C2.49837 9.23061 2.14891 9.66837 1.91403 10.1681C1.85291 10.2982 1.85299 10.3564 1.91403 10.4863C2.12856 10.9429 2.41185 11.4142 2.71115 11.8189C2.79208 11.9283 2.84046 11.9563 2.97585 11.9694C3.57239 12.0274 4.17564 11.9447 4.77317 12.0028C5.27774 12.0518 5.68681 12.2834 5.98855 12.6908C6.33024 13.1522 6.56037 13.6866 6.90186 14.1476C6.98239 14.2563 7.03205 14.2841 7.16656 14.2972C7.70402 14.3494 8.29432 14.3495 8.83354 14.2972C8.96805 14.2841 9.01771 14.2563 9.09824 14.1476C9.43944 13.687 9.66985 13.1522 10.0115 12.6908C10.3133 12.2834 10.7224 12.0518 11.2269 12.0028C11.8244 11.9447 12.4271 12.0275 13.0243 11.9694C13.1596 11.9563 13.208 11.9283 13.2889 11.8189C13.5891 11.4131 13.872 10.942 14.0861 10.4863C14.1471 10.3564 14.1472 10.2982 14.0861 10.1681C13.8513 9.66861 13.5017 9.23061 13.2667 8.73044C13.0397 8.24717 13.0407 7.7515 13.2677 7.26854C13.5026 6.7689 13.8513 6.33106 14.0861 5.8319C14.1472 5.7018 14.1471 5.64359 14.0861 5.51366ZM15.3035 6.40373C15.0685 6.90359 14.7188 7.34119 14.4841 7.84037C14.4231 7.97025 14.423 8.02855 14.4841 8.15861C14.7189 8.65833 15.0685 9.09611 15.3035 9.59626C15.5308 10.0801 15.5308 10.5744 15.3035 11.0582C15.052 11.5933 14.7225 12.1426 14.37 12.6191C14.0685 13.0265 13.6581 13.259 13.1536 13.3081C12.5566 13.366 11.9541 13.2835 11.3573 13.3414C11.2228 13.3545 11.1731 13.3823 11.0926 13.491C10.7511 13.9521 10.521 14.4864 10.1793 14.9478C9.87828 15.3542 9.46719 15.5869 8.96387 15.6358C8.34008 15.6964 7.66194 15.6966 7.03623 15.6358C6.53291 15.5869 6.12182 15.3542 5.82084 14.9478C5.47911 14.4863 5.24878 13.9517 4.90753 13.491C4.82701 13.3823 4.77734 13.3545 4.64284 13.3414C4.04647 13.2835 3.44373 13.366 2.84653 13.3081C2.34201 13.259 1.93164 13.0265 1.63013 12.6191C1.27867 12.144 0.948453 11.5941 0.696621 11.0582C0.469315 10.5744 0.469279 10.0801 0.696621 9.59626C0.931628 9.09613 1.2813 8.65807 1.51597 8.15861C1.57708 8.02855 1.57702 7.97025 1.51597 7.84037C1.28117 7.34095 0.931635 6.9036 0.696621 6.40373C0.469213 5.91992 0.469367 5.42562 0.696621 4.94183C0.948441 4.40587 1.27868 3.85598 1.63013 3.38092C1.93164 2.97349 2.34201 2.74095 2.84653 2.6919C3.44353 2.63397 4.04599 2.71649 4.64284 2.65856C4.77734 2.64549 4.82701 2.61774 4.90753 2.50904C5.24905 2.04792 5.47913 1.51362 5.82084 1.05219C6.12182 0.645806 6.53291 0.413119 7.03623 0.364178C7.66002 0.303556 8.33816 0.303369 8.96387 0.364178C9.46719 0.413119 9.87828 0.645806 10.1793 1.05219C10.521 1.51365 10.7513 2.04828 11.0926 2.50904C11.1731 2.61774 11.2228 2.64549 11.3573 2.65856C11.9541 2.71649 12.5566 2.63397 13.1536 2.6919C13.6581 2.74095 14.0685 2.97349 14.37 3.38092C14.7214 3.85598 15.0517 4.40587 15.3035 4.94183C15.5307 5.42562 15.5309 5.91992 15.3035 6.40373Z"
              fill="currentColor"
            />
            <path
              d="M9.13764 7.99999C9.13764 7.3715 8.62855 6.8624 8.00005 6.8624C7.37155 6.8624 6.86246 7.3715 6.86246 7.99999C6.86246 8.62849 7.37155 9.13759 8.00005 9.13759C8.62855 9.13759 9.13764 8.62849 9.13764 7.99999ZM10.4834 7.99999C10.4834 9.37126 9.37132 10.4833 8.00005 10.4833C6.62878 10.4833 5.51674 9.37126 5.51674 7.99999C5.51674 6.62873 6.62878 5.51669 8.00005 5.51669C9.37132 5.51669 10.4834 6.62873 10.4834 7.99999Z"
              fill="currentColor"
            />
          </svg>
          {wide && <span className="dsh-a6-side-btn-label">A6api</span>}
        </button>
      </span>

      {open && pos && (
        <div
          ref={popupRef}
          className="dsh-a6-side-popup"
          role="dialog"
          aria-label="当前会话 A6api 模型卡片"
          style={{ left: pos.left, ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }) }}
        >
          {/* 账户速览胶囊行：账号级数据，与当前模型卡片无关，加载/空态恒显示；
              余额胶囊纯展示（不可点击），价格波动胶囊可跳官网处理，模型市场胶囊直达官网模型页 */}
          <div className="dsh-a6-side-pills">
            {state.balance?.hasAccountAuth && (
              <div
                className="dsh-a6-header-balance-badge dsh-a6-side-balance-pill"
                title="账户余额（每 60 秒自动同步）"
              >
                <span className="dsh-a6-hb-label">账户余额:</span>
                <span className="dsh-a6-hb-amount">{state.balance.accountBalanceFormatted}</span>
              </div>
            )}
            <PricePill
              pf={state.priceFluctuation}
              hasToken={Boolean(state.config?.hasToken)}
              compact
            />
            <MarketPill />
          </div>
          {/* 模型卡片区域:非 A6api 会话整体置灰且不可交互(顶部账户胶囊不受影响) */}
          <div className={hasA6apiModel ? undefined : 'dsh-a6-side-card-dimmed'}>
            {card ? (
              <MerchantCard model={card} />
            ) : state.loading && state.models.length === 0 ? (
              <div className="dsh-a6-side-popup-empty">
                <div className="dsh-a6-spinner" />
                <span>正在加载 A6api 数据...</span>
              </div>
            ) : hasA6apiModel ? (
              <div className="dsh-a6-side-popup-empty">
                <span>未找到「{modelName}」的商户数据</span>
                <span className="dsh-a6-side-popup-hint">可在「设置 → A6api」中探测该模型</span>
              </div>
            ) : (
              <div className="dsh-a6-side-popup-empty">
                <span>当前会话未使用 A6api 模型</span>
                <span className="dsh-a6-side-popup-hint">
                  {modelName ? `「${modelName}」暂无商户数据` : '切换到 A6api 模型后自动展示商户卡片'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
