import React, { useEffect, useRef, useState } from 'react';
import { store } from '../store.js';
import { MerchantCard } from './MerchantCard.js';
import { PricePill } from './PricePill.js';
import { MarketPill } from './MarketPill.js';

/** 浮层宽度上限;实际宽度取它与「视口宽度 - 2 * 间距」中的较小值 */
const POPUP_MAX_WIDTH = 500;
/** 浮层与按钮之间、浮层与视口边缘之间的间距 */
const POPUP_GAP = 8;
/** 按钮上方空间不足时的浮层高度下限,再小就只剩一条滚动缝 */
const POPUP_MIN_HEIGHT = 120;

/** 把 DSH 模型 ID 归一化为 A6api 模型名(剥离 provider 前缀,如 a6api/gpt-4o → gpt-4o) */
const normalizeModelId = (id: string): string => id.replace(/^[^/]+\//, '');

interface A6ApiComposerCardProps {
  /** 宿主注入:当前会话 ID(composer dock 的会话级标准属性) */
  sessionId?: string;
  /** apply 注入:modelDirectories 服务访问器(与 composer 模型选择器同源) */
  getModelDirectories?: () => any;
}

/** 浮层的固定定位结果:贴按钮上沿向上展开,水平方向以按钮为中心 */
interface PopupPosition {
  left: number;
  bottom: number;
  maxHeight: number;
}

/**
 * 输入框下方那一行的「A6api」按钮 + 贴按钮上沿向上弹出的浮层(任何会话均可展开):
 * 顶部为账户速览胶囊行,下方为当前会话模型对应的 MerchantCard;会话未使用 A6api 模型时
 * 卡片区域整体置灰不可交互。与设置页共享 A6ApiStore 单例:探测/轮询/操作结果实时同步。
 */
export const A6ApiComposerCard: React.FC<A6ApiComposerCardProps> = ({
  sessionId,
  getModelDirectories,
}) => {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<{ provider?: string; model?: string } | null>(null);
  const [state, setState] = useState(store.getState());
  const [pos, setPos] = useState<PopupPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const fetchedRef = useRef(false);
  const lastPosRef = useRef<PopupPosition | null>(null);

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

  const toggle = () => setOpen((v) => !v);

  // 打开时:定位(贴按钮上沿向上展开、水平以按钮为中心)+ 惰性加载 /state
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
      const width = Math.min(POPUP_MAX_WIDTH, vw - 2 * POPUP_GAP);
      const left = Math.max(POPUP_GAP, Math.min(r.left + r.width / 2 - width / 2, vw - width - POPUP_GAP));
      // 浮层下边缘停在按钮上边缘之上;高度上限取按钮上方可用空间,内容超出时浮层内部滚动
      const bottom = window.innerHeight - r.top + POPUP_GAP;
      const maxHeight = Math.max(POPUP_MIN_HEIGHT, r.top - 2 * POPUP_GAP);
      const next = { left, bottom, maxHeight };
      // 位置未变则跳过 setPos:浮层内部滚动(capture 也会收到)不应触发整卡重渲染
      const last = lastPosRef.current;
      if (last && last.left === next.left && last.bottom === next.bottom && last.maxHeight === next.maxHeight) {
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
      <button
        ref={buttonRef}
        type="button"
        className="dsh-a6-dock-btn"
        onClick={toggle}
        aria-expanded={open}
        aria-label="A6api"
        data-tooltip={
          hasA6apiModel
            ? open
              ? '收起 A6api 模型卡片'
              : '查看当前会话的 A6api 模型卡片'
            : '当前会话未使用 A6api 模型，卡片已置灰'
        }
      >
        A6api
      </button>

      {open && pos && (
        <div
          ref={popupRef}
          className="dsh-a6-dock-popup"
          role="dialog"
          aria-label="当前会话 A6api 模型卡片"
          style={{ left: pos.left, bottom: pos.bottom, maxHeight: pos.maxHeight }}
        >
          {/* 账户速览胶囊行：账号级数据，与当前模型卡片无关，加载/空态恒显示；
              余额胶囊纯展示（不可点击），价格波动胶囊可跳官网处理，模型市场胶囊直达官网模型页 */}
          <div className="dsh-a6-dock-pills">
            {state.balance?.hasAccountAuth && (
              <div
                className="dsh-a6-header-balance-badge dsh-a6-dock-balance-pill"
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
          <div className={hasA6apiModel ? undefined : 'dsh-a6-dock-card-dimmed'}>
            {card ? (
              <MerchantCard model={card} />
            ) : state.loading && state.models.length === 0 ? (
              <div className="dsh-a6-dock-popup-empty">
                <div className="dsh-a6-spinner" />
                <span>正在加载 A6api 数据...</span>
              </div>
            ) : hasA6apiModel ? (
              <div className="dsh-a6-dock-popup-empty">
                <span>未找到「{modelName}」的商户数据</span>
                <span className="dsh-a6-hint">可在「设置 → A6api」中探测该模型</span>
              </div>
            ) : (
              <div className="dsh-a6-dock-popup-empty">
                <span>当前会话未使用 A6api 模型</span>
                <span className="dsh-a6-hint">
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
