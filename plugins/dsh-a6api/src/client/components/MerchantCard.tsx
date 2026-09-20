import React, { useState, useRef, useEffect } from 'react';
import { Button, Tag, type TagTone } from '@deepseek-ai/dsh-client-ui-primitives';
import { dictionaryT, type A6apiT } from '../locales.js';
import { store } from '../store.js';
import type { ModelCardData } from '../../types.js';

// 秒级时间戳 → 绝对时间文案 (MM-DD HH:mm:ss，跨年时带年)
const formatAbsolute = (tsSec: number) => {
  const d = new Date(tsSec * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  const nowY = new Date().getFullYear();
  const y = d.getFullYear();
  const md = `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return y !== nowY ? `${y}-${md}` : md;
};

/** 3 位有效数字；千位以上加千分符（与官网模型市场标注脚本 fmtSig 口径一致） */
const fmtSig = (n: number) => {
  if (!Number.isFinite(n)) return '—';
  const s = Number(n.toPrecision(3));
  if (Math.abs(s) >= 1000) return s.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return String(s);
};

/** 上游商户标签（中文为 A6API 市场侧的稳定标识）→ 官方 Tag 语气。 */
const tagToneOf = (label: string): TagTone => {
  if (label.includes('保真')) return 'success';
  if (label.includes('稳定')) return 'success';
  if (label.includes('低价')) return 'info';
  if (label.includes('高速')) return 'warning';
  if (label.includes('高质')) return 'neutral';
  return 'outline';
};

/**
 * 商户卡片：设置页「可用模型」列表与输入框下方浮层共用。
 * 浮层侧注册未带 locale，故 `t` 缺省回落到本插件字典。
 */
export const MerchantCard: React.FC<{
  model: ModelCardData;
  t?: A6apiT;
}> = ({ model, t = dictionaryT }) => {
  // 进入后默认不展开
  const [expanded, setExpanded] = useState(false);
  const [pinConfirmOpen, setPinConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const errorTimerRef = useRef<any>(null);

  // ===== 探测完成 → 卡片刷新动画（输入框下方浮层与设置页共用本组件，一处生效两处） =====
  // 触发条件：本卡片 probeStatus 由 'probing' 跃迁到终态（success/error），即探测结果回填瞬间。
  // 动画全部基于 box-shadow/::after/子列 opacity-transform，根节点不加 transform/filter，
  // 避免把内部 position:fixed 的固定弹窗裹进动画 containing block。
  const REFRESH_FLASH_MS = 1600;
  const prevProbeStatus = useRef(model.probeStatus);
  const [refreshFlash, setRefreshFlash] = useState<'ok' | 'err' | null>(null);
  const flashTimerRef = useRef<any>(null);
  useEffect(() => {
    const prev = prevProbeStatus.current;
    const cur = model.probeStatus;
    if (prev === cur) return;
    prevProbeStatus.current = cur;
    if (prev === 'probing' && (cur === 'success' || cur === 'error')) {
      setRefreshFlash(cur === 'success' ? 'ok' : 'err');
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setRefreshFlash(null), REFRESH_FLASH_MS);
    }
  }, [model.probeStatus]);
  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const isProbing = model.probeStatus === 'probing';
  const isQueued = model.probeStatus === 'queued';
  const merchant = model.merchant;
  const isBusy = store.getState().actionBusyModels.has(model.model_name);
  const canWebAction = Boolean(store.getState().config?.hasToken);
  const hasMerchant = Boolean(merchant?.channel_id);
  const isPinnedHere = model.pinStatus === 'pin_here';
  const isPinnedElsewhere = model.pinStatus === 'pin_elsewhere';
  const hasPin = isPinnedHere || isPinnedElsewhere;
  const isPinMismatch = hasPin && model.pinTokenMatched === false;
  const isPinUnknown = hasPin && model.pinTokenMatched === undefined;
  const pinTokenNote = isPinMismatch
    ? t('pinTokenOther')
    : isPinUnknown
      ? t('pinTokenUnknown')
      : '';
  const isChannelDisabled = Boolean(merchant?.user_channel_disabled);

  const flashActionError = (msg: string) => {
    // 连续失败时先清掉旧定时器，避免前一条错误提前清掉后一条
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setActionError(msg);
    errorTimerRef.current = setTimeout(() => setActionError(null), 6000);
  };

  const handleProbe = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.probeModel(model.model_name);
  };

  const handleToggleDsh = (e: React.MouseEvent) => {
    e.stopPropagation();
    store.toggleDshModel(model.model_name);
  };

  const handleOpenPinConfirm = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    setPinConfirmOpen(true);
  };

  const handleConfirmPin = async () => {
    setActionError(null);
    const r = await store.pinModel(model.model_name);
    if (!r.ok) {
      flashActionError(r.error || t('errPin'));
    } else {
      setPinConfirmOpen(false);
    }
  };

  const handleUnpin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    // 上游取消固定需要渠道 ID：优先固定记录自身渠道，其次卡片商家渠道
    const channelId = Number(model.pinnedChannelId || model.merchant?.channel_id || 0) || undefined;
    const r = await store.unpinModel(model.model_name, channelId);
    if (!r.ok) flashActionError(r.error || t('errUnpin'));
  };

  const handleDisable = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    const r = await store.disableModel(model.model_name);
    if (!r.ok) flashActionError(r.error || t('errDisable'));
  };

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    const r = await store.restoreModel(model.model_name);
    if (!r.ok) flashActionError(r.error || t('errRestore'));
  };

  // Success Rate Dot Generators
  const renderRealtimeDots = () => {
    if (merchant?.success_buckets && merchant.success_buckets.length > 0) {
      return merchant.success_buckets.slice(0, 10).map((b, i) => {
        const rate = b.success_rate;
        let colorClass = 'green';
        if (rate < 8000) colorClass = 'red';
        else if (rate < 9500) colorClass = 'yellow';
        return <div key={i} className={`dsh-a6-rate-dot ${colorClass}`} />;
      });
    }
    const count = 10;
    const greenCount = merchant ? Math.round((merchant.recent_success_rate_pct / 100) * count) : 10;
    return Array.from({ length: count }).map((_, i) => (
      <div key={i} className={`dsh-a6-rate-dot ${i < greenCount ? 'green' : 'empty'}`} />
    ));
  };

  const render24hDots = () => {
    if (merchant?.b24 && merchant.b24.length > 0) {
      return merchant.b24.slice(0, 12).map((b, i) => {
        if (!b.s || b.s === 0) {
          return <div key={i} className="dsh-a6-rate-dot empty" />;
        }
        let colorClass = 'green';
        if (b.r < 8000) colorClass = 'red';
        else if (b.r < 9500) colorClass = 'yellow';
        return <div key={i} className={`dsh-a6-rate-dot ${colorClass}`} />;
      });
    }
    const count = 12;
    const greenCount = merchant ? Math.round((merchant.success_rate_24h_pct / 100) * count) : 12;
    return Array.from({ length: count }).map((_, i) => (
      <div key={i} className={`dsh-a6-rate-dot ${i < greenCount ? 'green' : 'empty'}`} />
    ));
  };

  const render7dDots = () => {
    if (merchant?.b7d && merchant.b7d.length > 0) {
      return merchant.b7d.slice(0, 7).map((b, i) => {
        if (!b.s || b.s === 0) {
          return <div key={i} className="dsh-a6-rate-dot empty" />;
        }
        let colorClass = 'green';
        if (b.r && b.r < 8000) colorClass = 'red';
        else if (b.r && b.r < 9500) colorClass = 'yellow';
        return <div key={i} className={`dsh-a6-rate-dot ${colorClass}`} />;
      });
    }
    return Array.from({ length: 7 }).map((_, i) => (
      <div key={i} className={`dsh-a6-rate-dot ${i >= 4 ? 'green' : 'empty'}`} />
    ));
  };

  // Realtime ratio pill
  const ratioText = merchant?.realtime_ratio_formatted || '0.0341';

  // Latency & Cache hit
  const latencySec = merchant
    ? ((merchant.p50_ttft_ms || merchant.recent_p50_ms || 2340) / 1000).toFixed(2) + 's'
    : model.probeLatencyMs
      ? (model.probeLatencyMs / 1000).toFixed(2) + 's'
      : '2.34s';
  const cacheHitPct = merchant ? merchant.cache_hit_rate_pct : 72.0;

  // 混合价估算（¥/1亿 tokens）：服务端按 24h 缓存命中率 + 输出占比 0.35% 预计算，客户端仅格式化与解释
  const blend100m = merchant?.blended_price_100m_cny;
  const blend100mValid = blend100m !== undefined && Number.isFinite(blend100m);
  const blendTitle = blend100mValid
    ? (() => {
        const h = Math.min(100, Math.max(0, merchant!.cache_hit_rate_pct)) / 100;
        const inShare = 99.65; // 输入类 token 占比 %（输出固定 0.35%）
        const hSharePct = Math.round(h * inShare * 10) / 10;
        const mSharePct = Math.round((1 - h) * inShare * 10) / 10;
        const per1m = blend100m! / 100;
        return t('blendTip', {
          hitShare: hSharePct,
          missShare: mSharePct,
          per1m: Number(per1m.toPrecision(4)),
          total: fmtSig(blend100m!),
        });
      })()
    : undefined;

  // 智能标签：上游商户标签为中文稳定标识；无数据时用本插件字典兜底
  const tagList: { key: string | number; tone: TagTone; label: string }[] = merchant?.labels
    ? merchant.labels.map((lbl, idx) => ({ key: idx, tone: tagToneOf(lbl), label: lbl }))
    : [
        { key: 'stable', tone: 'success' as TagTone, label: t('tagStable') },
        { key: 'cheap', tone: 'info' as TagTone, label: t('tagCheap') },
        { key: 'fast', tone: 'warning' as TagTone, label: t('tagFast') },
        { key: 'quality', tone: 'neutral' as TagTone, label: t('tagQuality') },
      ];

  return (
    <div
      className={`dsh-a6-official-card${model.inDsh ? ' in-dsh' : ''}${
        refreshFlash ? ` dsh-a6-card-refresh ${refreshFlash === 'ok' ? 'refresh-ok' : 'refresh-err'}` : ''
      }`}
    >
      {refreshFlash && (
        <div className={`dsh-a6-refresh-flag ${refreshFlash === 'ok' ? 'ok' : 'err'}`} aria-hidden="true">
          {refreshFlash === 'ok' ? t('refreshOk') : t('refreshErr')}
        </div>
      )}
      {/* 1. Main Top Row */}
      <div className="dsh-a6-card-main-bar" onClick={() => setExpanded(!expanded)}>
        {/* Col 1: Model Title & Subtitle */}
        <div className="dsh-a6-bar-identity">
          <div className="dsh-a6-title-col">
            <div className="dsh-a6-title-line">
              <span className="dsh-a6-name-text">{model.model_name}</span>
              {merchant?.channel_id && (
                <>
                  <span className="dsh-a6-dot-sep">·</span>
                  <span className="dsh-a6-merchant-id-text">
                    {t('merchantId', { id: merchant.channel_id })}
                  </span>
                </>
              )}
              {isPinnedHere && !isChannelDisabled && (
                <span
                  className="dsh-a6-pin-badge"
                  data-tooltip={
                    t('pinHereTipPrefix') +
                    (model.pinnedFallback === false ? t('pinHereStrict') : t('pinHereFallback')) +
                    pinTokenNote
                  }
                  data-tooltip-pos="down"
                >
                  <Tag tone="success">{t('pinBadgeHere')}</Tag>
                </span>
              )}
              {isPinnedElsewhere && (
                <span
                  className="dsh-a6-pin-badge"
                  data-tooltip={
                    t('pinElsewhereTipPrefix') +
                    (model.pinnedChannelId
                      ? t('pinElsewhereTargetChannel', { id: model.pinnedChannelId })
                      : t('pinBadgeElsewhere')) +
                    (model.pinnedSupplierName ? t('pinSupplier', { name: model.pinnedSupplierName }) : '') +
                    (!hasMerchant ? t('pinNoMerchantData') : '') +
                    pinTokenNote
                  }
                  data-tooltip-pos="down"
                >
                  <Tag tone="warning">
                    {!hasMerchant && model.pinnedChannelId
                      ? t('pinBadgeElsewhereChannel', { id: model.pinnedChannelId })
                      : t('pinBadgeElsewhere')}
                  </Tag>
                </span>
              )}
              {isChannelDisabled && (
                <span
                  className="dsh-a6-pin-badge"
                  data-tooltip={t('pinDisabledTip')}
                  data-tooltip-pos="down"
                >
                  <Tag tone="neutral">{t('pinBadgeDisabled')}</Tag>
                </span>
              )}
            </div>
            {merchant?.description && (
              <div className="dsh-a6-sub-desc">{merchant.description}</div>
            )}
          </div>
        </div>

        {/* Col 2: Pricing Summary + Ratio Tag */}
        {merchant ? (
          <div className="dsh-a6-bar-pricing">
            <div className="dsh-a6-price-col">
              <span className="dsh-a6-price-top" title={t('priceInput')}>
                {merchant.input_price_cny}
              </span>
              <span className="dsh-a6-price-btm" title={t('priceCacheRead')}>
                {merchant.cache_read_price_cny}
              </span>
            </div>
            <div className="dsh-a6-price-col">
              <span className="dsh-a6-price-top" title={t('priceOutput')}>
                {merchant.output_price_cny}
              </span>
              <span className="dsh-a6-price-btm" title={t('priceCacheWrite')}>
                {merchant.cache_write_price_cny}
              </span>
            </div>
            {blend100mValid && (
              <span className="dsh-a6-blend-pill" title={blendTitle}>
                <Tag tone="success">{t('blendPill', { value: fmtSig(blend100m!) })}</Tag>
              </span>
            )}
            <span className="dsh-a6-ratio-pill" title={t('ratioTip')}>
              <Tag tone="info">{ratioText}</Tag>
            </span>
          </div>
        ) : (
          <div className="dsh-a6-bar-pricing unprobed">
            <div
              className={`dsh-a6-unprobed-hint ${model.probeError ? 'error' : ''}`}
              data-tooltip={model.probeError || undefined}
              data-tooltip-pos="down"
            >
              {isProbing
                ? t('probingMerchant')
                : isQueued
                  ? t('queuedProbe')
                  : model.probeError
                    ? t('probeFailed')
                    : t('notProbed')}
            </div>
          </div>
        )}

        {/* Col 3: Status / Health Bars (实时, 24h, 7d) */}
        <div className="dsh-a6-bar-uptime">
          <div className="dsh-a6-uptime-row">
            <span className="dsh-a6-uptime-label">{t('uptimeRealtime')}</span>
            <div className="dsh-a6-dots-track">{renderRealtimeDots()}</div>
            <span className="dsh-a6-uptime-val">
              {merchant ? `${merchant.recent_success_rate_pct.toFixed(1)}%` : '100.0%'}
            </span>
          </div>
          <div className="dsh-a6-uptime-row">
            <span className="dsh-a6-uptime-label">24h</span>
            <div className="dsh-a6-dots-track">{render24hDots()}</div>
            <span className="dsh-a6-uptime-val">
              {merchant ? `${merchant.success_rate_24h_pct.toFixed(1)}%` : '99.3%'}
            </span>
          </div>
          <div className="dsh-a6-uptime-row">
            <span className="dsh-a6-uptime-label">7d</span>
            <div className="dsh-a6-dots-track">{render7dDots()}</div>
            <span className="dsh-a6-uptime-val">
              {merchant?.sr_7d_state === 'no_data'
                ? '-'
                : merchant?.success_rate_7d_pct
                  ? `${merchant.success_rate_7d_pct.toFixed(1)}%`
                  : '-'}
            </span>
          </div>
        </div>

        {/* Col 4: Speed / Latency & Cache Hit Bar */}
        <div className="dsh-a6-bar-perf">
          <div className="dsh-a6-perf-row">
            <span className="dsh-a6-latency-text">{latencySec}</span>
            <span className="dsh-a6-cache-hit-text">{cacheHitPct.toFixed(1)}%</span>
            <div className="dsh-a6-hit-track">
              <div
                className="dsh-a6-hit-fill"
                style={{ width: `${Math.min(100, Math.max(0, cacheHitPct))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Col 5: Smart Tags */}
        <div className="dsh-a6-bar-tags">
          {tagList.map((tag) => (
            <Tag key={tag.key} tone={tag.tone}>
              {tag.label}
            </Tag>
          ))}
        </div>
      </div>

      {/* 2. Bottom Footer: 时间戳左下角 + 操作按钮右下角 */}
      <div className="dsh-a6-card-footer">
        <div className="dsh-a6-time-stack">
          <span className="dsh-a6-time-ago" data-tooltip={t('lastSuccessTip')}>
            {t('lastSuccessPrefix')}
            {merchant?.last_success_text || t('lastSuccessFallback')}
          </span>
          <span
            className={`dsh-a6-time-ago dsh-a6-route-snapshot${model.lastRoutedAt ? '' : ' never'}`}
            data-tooltip={
              model.lastRoutedAt
                ? t('personalTip', { time: formatAbsolute(model.lastRoutedAt) })
                : t('personalTipNever')
            }
          >
            {t('personalPrefix')}
            {model.lastRoutedText || t('neverRouted')}
          </span>
        </div>

        {/* Col 6: 操作按钮组 — 卡片右下角 */}
        <div className="dsh-a6-bar-actions" onClick={(e) => e.stopPropagation()}>
          <div className="dsh-a6-bar-actions-btns">
            <Button
              variant="outline"
              size="sm"
              onClick={handleProbe}
              disabled={isProbing || isQueued}
              data-tooltip={isQueued ? t('probeTipQueued') : t('probeTip')}
            >
              {isProbing ? t('probingMerchant') : isQueued ? t('queuedProbe') : t('probeAction')}
            </Button>

            {isPinnedHere ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnpin}
                disabled={isBusy || !canWebAction || model.pinTokenMatched === false || isProbing || isQueued}
                data-tooltip={
                  isProbing || isQueued
                    ? t('unpinTipProbing')
                    : model.pinTokenMatched === false
                      ? t('unpinTipOtherToken')
                      : !canWebAction
                        ? t('unpinTipNoToken')
                        : model.pinTokenMatched === undefined
                          ? t('unpinTipUnknown')
                          : t('unpinTip')
                }
              >
                {isBusy ? t('processing') : t('unpin')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenPinConfirm}
                disabled={isBusy || !hasMerchant || !canWebAction || isProbing || isQueued}
                data-tooltip={
                  isProbing || isQueued
                    ? t('pinTipProbing')
                    : !hasMerchant
                      ? t('pinTipNoMerchant')
                      : !canWebAction
                        ? t('pinTipNoToken')
                        : t('pinTip')
                }
              >
                {isBusy ? t('processing') : t('pin')}
              </Button>
            )}

            {isChannelDisabled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestore}
                disabled={isBusy || !canWebAction || isProbing || isQueued}
                data-tooltip={
                  isProbing || isQueued
                    ? t('restoreTipProbing')
                    : canWebAction
                      ? t('restoreTip')
                      : t('restoreTipNoToken')
                }
              >
                {isBusy ? t('processing') : t('restore')}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisable}
                disabled={isBusy || !hasMerchant || !canWebAction || isProbing || isQueued}
                data-tooltip={
                  isProbing || isQueued
                    ? t('disableTipProbing')
                    : !hasMerchant
                      ? t('disableTipNoMerchant')
                      : !canWebAction
                        ? t('disableTipNoToken')
                        : t('disableTip')
                }
              >
                {isBusy ? t('processing') : t('disable')}
              </Button>
            )}

            <Button
              variant={model.inDsh ? 'outline' : 'primary'}
              size="sm"
              onClick={handleToggleDsh}
              data-tooltip={model.inDsh ? t('addTipRemove') : t('addTip')}
            >
              {model.inDsh ? t('removeModel') : t('addModel')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              data-tooltip={expanded ? t('collapseTip') : t('detailTip')}
              data-tooltip-pos="left"
            >
              {expanded ? t('collapse') : t('detail')}
            </Button>
          </div>
        </div>

        {actionError && (
          <div className="dsh-a6-action-error" role="alert">
            {actionError}
          </div>
        )}
      </div>

      {/* 2. Bottom Detailed Price Comparison Table (Only when expanded) */}
      {expanded && (
        <div className="dsh-a6-detail-container">
          <div className="dsh-a6-detail-top-row">
            <div className="dsh-a6-dt-left">
              <span className="dsh-a6-dt-label">{t('channelNote')}</span>
              <span className="dsh-a6-dt-desc">
                {merchant?.description || t('channelDescFallback')}
              </span>
            </div>
            {merchant?.channel_name && (
              <div className="dsh-a6-dt-right">
                <span className="dsh-a6-dt-label">{t('hitRoute')}</span>
                <span className="dsh-a6-dt-channel-name">
                  {merchant.channel_name} (ID: {merchant.channel_id})
                </span>
              </div>
            )}
          </div>

          <div className="dsh-a6-dt-divider" />

          {/* Clean Price Comparison Table */}
          <div className="dsh-a6-dt-table-col">
            <table className="dsh-a6-price-table">
              <thead>
                <tr>
                  <th className="dsh-a6-th-blank"></th>
                  <th>{t('thInput')}</th>
                  <th>{t('thOutput')}</th>
                  <th>{t('thCacheRead')}</th>
                  <th>{t('thCacheWrite')}</th>
                </tr>
              </thead>
              <tbody>
                <tr className="dsh-a6-tr-official">
                  <td className="dsh-a6-td-label">{t('officialPrice')}</td>
                  <td>{merchant?.official_price?.input_cny || '¥26.884'}</td>
                  <td>{merchant?.official_price?.output_cny || '¥134.418'}</td>
                  <td>{merchant?.official_price?.cache_read_cny || '¥2.688'}</td>
                  <td>{merchant?.official_price?.cache_write_cny || '¥33.605'}</td>
                </tr>
                <tr className="dsh-a6-tr-merchant">
                  <td className="dsh-a6-td-label">{t('merchantPrice')}</td>
                  <td className="dsh-a6-td-bold">{merchant?.input_price_cny || '¥0.1364'}</td>
                  <td className="dsh-a6-td-bold">{merchant?.output_price_cny || '¥0.6822'}</td>
                  <td className="dsh-a6-td-bold">{merchant?.cache_read_price_cny || '¥0.0136'}</td>
                  <td className="dsh-a6-td-bold">{merchant?.cache_write_price_cny || '¥0.1705'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. 固定确认弹窗（轻量，无商家选择器/兜底开关） */}
      {pinConfirmOpen && merchant && (
        <div
          className="dsh-a6-pin-modal-overlay"
          onClick={(e) => {
            e.stopPropagation();
            setPinConfirmOpen(false);
          }}
        >
          <div
            className="dsh-a6-pin-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t('pinModalAria')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dsh-a6-pin-modal-title">{t('pinModalTitle')}</div>
            <div className="dsh-a6-pin-modal-body">
              <div className="dsh-a6-pin-modal-row">
                <span className="dsh-a6-pin-modal-label">{t('pinModalModel')}</span>
                <span className="dsh-a6-pin-modal-value">{model.model_name}</span>
              </div>
              <div className="dsh-a6-pin-modal-row">
                <span className="dsh-a6-pin-modal-label">{t('pinModalMerchant')}</span>
                <span className="dsh-a6-pin-modal-value">
                  {merchant.channel_name} (ID: {merchant.channel_id})
                </span>
              </div>
              <div className="dsh-a6-pin-modal-row">
                <span className="dsh-a6-pin-modal-label">{t('pinModalPrice')}</span>
                <span className="dsh-a6-pin-modal-value">
                  {t('pinModalPriceValue', {
                    input: merchant.input_price_cny,
                    output: merchant.output_price_cny,
                  })}
                </span>
              </div>
              <p className="dsh-a6-pin-modal-note">{t('pinModalNote')}</p>
              {actionError && <div className="dsh-a6-action-error">{actionError}</div>}
            </div>
            <div className="dsh-a6-pin-modal-foot">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPinConfirmOpen(false)}
                disabled={isBusy}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmPin}
                disabled={isBusy}
              >
                {isBusy ? t('processing') : t('pinModalConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};