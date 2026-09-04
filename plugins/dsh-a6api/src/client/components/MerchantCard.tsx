import React, { useState, useRef } from 'react';
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

export const MerchantCard: React.FC<{
  model: ModelCardData;
}> = ({ model }) => {
  // 进入后默认不展开
  const [expanded, setExpanded] = useState(false);
  const [pinConfirmOpen, setPinConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const errorTimerRef = useRef<any>(null);

  const isProbing = model.probeStatus === 'probing';
  const isQueued = model.probeStatus === 'queued';
  const merchant = model.merchant;
  const isBusy = store.getState().actionBusyModels.has(model.model_name);
  const canWebAction = Boolean(store.getState().config?.hasToken);
  const hasMerchant = Boolean(merchant?.channel_id);
  const isPinnedHere = model.pinStatus === 'pin_here';
  const isPinnedElsewhere = model.pinStatus === 'pin_elsewhere';
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
      flashActionError(r.error || '固定失败');
    } else {
      setPinConfirmOpen(false);
    }
  };

  const handleUnpin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    const r = await store.unpinModel(model.model_name);
    if (!r.ok) flashActionError(r.error || '取消固定失败');
  };

  const handleDisable = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    const r = await store.disableModel(model.model_name);
    if (!r.ok) flashActionError(r.error || '禁用失败');
  };

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setActionError(null);
    const r = await store.restoreModel(model.model_name);
    if (!r.ok) flashActionError(r.error || '恢复失败');
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

  // Smart tag styling
  const getTagClass = (tag: string) => {
    if (tag.includes('保真')) return 'tag-guarantee';
    if (tag.includes('稳定')) return 'tag-stable';
    if (tag.includes('低价')) return 'tag-cheap';
    if (tag.includes('高速')) return 'tag-fast';
    if (tag.includes('高质')) return 'tag-quality';
    return '';
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
        return (
          '混合价估算（¥ / 1亿 tokens，输出占比固定 0.35%）\n' +
          `命中 ${hSharePct}% × 缓存读价 + 未命中 ${mSharePct}% × 输入价 + 输出 0.35% × 输出价\n` +
          `= ¥${Number(per1m.toPrecision(4))} /1M ≈ ¥${fmtSig(blend100m!)} /1亿 tokens\n` +
          '命中率取卡片 24h 实测缓存命中率'
        );
      })()
    : undefined;

  return (
    <div className={`dsh-a6-official-card ${model.inDsh ? 'in-dsh' : ''}`}>
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
                    商户ID {merchant.channel_id}
                  </span>
                </>
              )}
              {isPinnedHere && !isChannelDisabled && (
                <span
                  className="dsh-a6-pin-badge here"
                  data-tooltip={
                    `该模型已固定到当前商家${model.pinnedFallback === false ? '（严格固定）' : '，异常时自动切换智能优选'}${model.pinTokenMatched === false ? '；该固定属于其他令牌，仅供参考' : ''}`
                  }
                  data-tooltip-pos="down"
                >
                  已固定
                </span>
              )}
              {isPinnedElsewhere && (
                <span
                  className="dsh-a6-pin-badge elsewhere"
                  data-tooltip={
                    `该模型已固定到${model.pinnedChannelId ? `商户 #${model.pinnedChannelId}` : '其他商家'}${model.pinnedSupplierName ? `（${model.pinnedSupplierName}）` : ''}${model.pinTokenMatched === false ? '；该固定属于其他令牌，仅供参考' : ''}`
                  }
                  data-tooltip-pos="down"
                >
                  已固定到其他商家
                </span>
              )}
              {isChannelDisabled && (
                <span className="dsh-a6-pin-badge disabled" data-tooltip="当前商家已对该模型禁用，路由不会命中此渠道" data-tooltip-pos="down">
                  已禁用
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
              <span className="dsh-a6-price-top" title="输入价 (1M)">
                {merchant.input_price_cny}
              </span>
              <span className="dsh-a6-price-btm" title="缓存读 (1M)">
                {merchant.cache_read_price_cny}
              </span>
            </div>
            <div className="dsh-a6-price-col">
              <span className="dsh-a6-price-top" title="输出价 (1M)">
                {merchant.output_price_cny}
              </span>
              <span className="dsh-a6-price-btm" title="缓存写 (1M)">
                {merchant.cache_write_price_cny}
              </span>
            </div>
            {blend100mValid && (
              <div className="dsh-a6-blend-pill" title={blendTitle}>
                ≈ ¥{fmtSig(blend100m!)}/亿
              </div>
            )}
            <div className="dsh-a6-ratio-pill" title="实时倍率比官方价">
              {ratioText}
            </div>
          </div>
        ) : (
          <div className="dsh-a6-bar-pricing unprobed">
            <div
              className={`dsh-a6-unprobed-hint ${model.probeError ? 'error' : ''}`}
              data-tooltip={model.probeError || undefined}
              data-tooltip-pos="down"
            >
              {isProbing ? '商家探测中...' : isQueued ? '排队等待探测...' : model.probeError ? '探测失败' : '尚未探测商家'}
            </div>
          </div>
        )}

        {/* Col 3: Status / Health Bars (实时, 24h, 7d) */}
        <div className="dsh-a6-bar-uptime">
          <div className="dsh-a6-uptime-row">
            <span className="dsh-a6-uptime-label">实时</span>
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
          {(merchant?.labels || ['稳定', '低价', '高速', '高质']).map((lbl, idx) => (
            <span key={idx} className={`dsh-a6-smart-pill ${getTagClass(lbl)}`}>
              {lbl}
            </span>
          ))}
        </div>

      </div>

      {/* 2. Bottom Footer: 时间戳左下角 + 操作按钮右下角 */}
      <div className="dsh-a6-card-footer">
        <div className="dsh-a6-time-stack">
          <span
            className="dsh-a6-time-ago"
            data-tooltip="该商户路线全网最近一次成功响应时间"
          >
            全网最近：{merchant?.last_success_text || '刚刚'}
          </span>
          <span
            className={`dsh-a6-time-ago dsh-a6-route-snapshot${model.lastRoutedAt ? '' : ' never'}`}
            data-tooltip={
              model.lastRoutedAt
                ? `个人最后一次请求该商家的该模型 ${formatAbsolute(model.lastRoutedAt)}`
                : '日志中暂无该商家的该模型路由记录'
            }
          >
            个人最近：{model.lastRoutedText || '从未路由'}
          </span>
        </div>

        {/* Col 6: 操作按钮组 — 卡片右下角 */}
        <div className="dsh-a6-bar-actions" onClick={(e) => e.stopPropagation()}>
          <div className="dsh-a6-bar-actions-btns">
            <button
              type="button"
              className="dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm"
              onClick={handleProbe}
              disabled={isProbing || isQueued}
              data-tooltip={
                isQueued
                  ? '正在全量探测队列中等待，请勿重复点击'
                  : '向该模型发送一次请求以探测并捕获其实际命中的商户 ID、价格及健康度指标（消耗少量Token）'
              }
            >
              {isProbing ? '探测中...' : isQueued ? '等待探测' : '探测商家'}
            </button>

            {isPinnedHere ? (
              <button
                type="button"
                className="dsh-a6-btn dsh-a6-btn-danger dsh-a6-btn-sm"
                onClick={handleUnpin}
                disabled={isBusy || !canWebAction || model.pinTokenMatched === false || isProbing || isQueued}
                data-tooltip={
                  isProbing || isQueued
                    ? '探测完成后再取消固定'
                    : model.pinTokenMatched === false
                      ? '该固定属于其他令牌，无法在此取消；如需取消请到官网或先为当前令牌固定此商家'
                      : canWebAction
                        ? '取消固定后恢复智能优选路由，可重新探测后再决定是否固定'
                        : '需先在「基础配置」配置系统访问令牌/会话'
                }
              >
                {isBusy ? '处理中...' : '取消固定'}
              </button>
            ) : (
              <button
                type="button"
                className="dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm"
                onClick={handleOpenPinConfirm}
                disabled={isBusy || !hasMerchant || !canWebAction || isProbing || isQueued}
                data-tooltip={
                  isProbing || isQueued
                    ? '探测完成后再固定商家'
                    : !hasMerchant
                      ? '该模型暂无商家数据，请先「探测商家」'
                      : !canWebAction
                        ? '需先在「基础配置」配置系统访问令牌/会话'
                        : '把当前商家固定为该模型的服务渠道（优先路由，异常时自动切换智能优选）'
                }
              >
                {isBusy ? '处理中...' : '固定商家'}
              </button>
            )}

            {isChannelDisabled ? (
              <button
                type="button"
                className="dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm"
                onClick={handleRestore}
                disabled={isBusy || !canWebAction || isProbing || isQueued}
                data-tooltip={
                  isProbing || isQueued
                    ? '探测完成后再恢复'
                    : canWebAction
                      ? '恢复该商家对此模型的服务'
                      : '需先在「基础配置」配置系统访问令牌/会话'
                }
              >
                {isBusy ? '处理中...' : '恢复'}
              </button>
            ) : (
              <button
                type="button"
                className="dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm"
                onClick={handleDisable}
                disabled={isBusy || !hasMerchant || !canWebAction || isProbing || isQueued}
                data-tooltip={
                  isProbing || isQueued
                    ? '探测完成后再禁用'
                    : !hasMerchant
                      ? '该模型暂无商家数据，请先「探测商家」'
                      : !canWebAction
                        ? '需先在「基础配置」配置系统访问令牌/会话'
                        : '禁用当前商家对该模型的服务，路由将不再命中此渠道'
                }
              >
                {isBusy ? '处理中...' : '禁用'}
              </button>
            )}

            <button
              type="button"
              className={`dsh-a6-btn dsh-a6-btn-sm ${model.inDsh ? 'dsh-a6-btn-in-dsh' : 'dsh-a6-btn-primary'}`}
              onClick={handleToggleDsh}
              data-tooltip={model.inDsh ? '已加入 DSH 模型选择器 (点击移除)' : '添加至 DSH 模型选择器'}
            >
              {model.inDsh ? '移除模型' : '添加模型'}
            </button>

            <button
              type="button"
              className={`dsh-a6-expand-toggle-btn ${expanded ? 'open' : ''}`}
              onClick={() => setExpanded(!expanded)}
              data-tooltip={expanded ? '收起价格详情' : '展开官方基准价与商户实时价对比表'}
              data-tooltip-pos="left"
            >
              {expanded ? '收起' : '详情'}
            </button>
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
              <span className="dsh-a6-dt-label">渠道说明</span>
              <span className="dsh-a6-dt-desc">
                {merchant?.description || '高并发 主打便宜 稳定'}
              </span>
            </div>
            {merchant?.channel_name && (
              <div className="dsh-a6-dt-right">
                <span className="dsh-a6-dt-label">命中线路</span>
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
                  <th>输入价 (1M)</th>
                  <th>输出价 (1M)</th>
                  <th>缓存读 (1M)</th>
                  <th>缓存写 (1M)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="dsh-a6-tr-official">
                  <td className="dsh-a6-td-label">官方价</td>
                  <td>{merchant?.official_price?.input_cny || '¥26.884'}</td>
                  <td>{merchant?.official_price?.output_cny || '¥134.418'}</td>
                  <td>{merchant?.official_price?.cache_read_cny || '¥2.688'}</td>
                  <td>{merchant?.official_price?.cache_write_cny || '¥33.605'}</td>
                </tr>
                <tr className="dsh-a6-tr-merchant">
                  <td className="dsh-a6-td-label">商户价</td>
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
            aria-label="固定商家确认"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dsh-a6-pin-modal-title">固定商家</div>
            <div className="dsh-a6-pin-modal-body">
              <div className="dsh-a6-pin-modal-row">
                <span className="dsh-a6-pin-modal-label">模型</span>
                <span className="dsh-a6-pin-modal-value">{model.model_name}</span>
              </div>
              <div className="dsh-a6-pin-modal-row">
                <span className="dsh-a6-pin-modal-label">商家</span>
                <span className="dsh-a6-pin-modal-value">
                  {merchant.channel_name} (ID: {merchant.channel_id})
                </span>
              </div>
              <div className="dsh-a6-pin-modal-row">
                <span className="dsh-a6-pin-modal-label">当前价</span>
                <span className="dsh-a6-pin-modal-value">
                  输入 {merchant.input_price_cny} · 输出 {merchant.output_price_cny}
                </span>
              </div>
              <p className="dsh-a6-pin-modal-note">
                固定后该模型的流量优先走此商家；商家异常时自动切换智能优选（平台默认）。固定生效于当前 API Key 令牌，可随时取消。
              </p>
              {actionError && <div className="dsh-a6-action-error">{actionError}</div>}
            </div>
            <div className="dsh-a6-pin-modal-foot">
              <button
                type="button"
                className="dsh-a6-btn dsh-a6-btn-secondary dsh-a6-btn-sm"
                onClick={() => setPinConfirmOpen(false)}
                disabled={isBusy}
              >
                取消
              </button>
              <button
                type="button"
                className="dsh-a6-btn dsh-a6-btn-primary dsh-a6-btn-sm"
                onClick={handleConfirmPin}
                disabled={isBusy}
              >
                {isBusy ? '固定中...' : '确认固定'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
