import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchDesktopSettings, type DesktopLanState, type DesktopSettingsView, type DesktopWebView } from './api.ts';
import { QrSvg } from './qr-svg.tsx';
import { ensureStyles } from './styles.ts';

/** 局域网 HTTPS 四态徽标文案与色调。 */
const LAN_STATE_META: Record<DesktopLanState, { label: string; tone: 'ok' | 'warn' | 'muted' | 'err' }> = {
  ready: { label: '已就绪', tone: 'ok' },
  starting: { label: '启动中', tone: 'warn' },
  inactive: { label: '未启用', tone: 'muted' },
  failed: { label: '失败', tone: 'err' },
};

/** 轮询间隔：面板挂载期间轻量跟随 token 轮换（响应体仅数百字节）。 */
const POLL_MS = 30_000;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isLoopbackHost(url: string): boolean {
  const host = hostOf(url);
  return host === '127.0.0.1' || host === 'localhost' || host.startsWith('127.');
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  return fallbackCopy(text);
}

interface AddressRow {
  url: string;
  kind: 'local' | 'lan';
  title: string;
  host: string;
}

function buildAddressRows(web: DesktopWebView): AddressRow[] {
  return [
    { url: web.localUrl, kind: 'local', title: '本机访问', host: hostOf(web.localUrl) },
    ...web.lanUrls.map((url, i) => ({
      url,
      kind: 'lan' as const,
      title: web.lanUrls.length > 1 ? `局域网 HTTPS #${i + 1}` : '局域网 HTTPS',
      host: hostOf(url),
    })),
  ];
}

/** 「扫码访问」设置分区主面板。 */
export function QrAccessPanel(): React.ReactElement {
  const [view, setView] = useState<DesktopSettingsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'url' | 'ca'>('url');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const viewRef = useRef<DesktopSettingsView | null>(null);
  const aliveRef = useRef(true);
  const copyTimerRef = useRef<number | undefined>(undefined);

  /** 现取当前宿主代投影；静默轮询失败不打扰，首载失败才亮错误卡。 */
  const refresh = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const next = await fetchDesktopSettings();
      if (!aliveRef.current) return;
      viewRef.current = next;
      setView(next);
      setError(null);
      setSelected((prev) => {
        const all = [next.web.localUrl, ...next.web.lanUrls];
        return prev && all.includes(prev) ? prev : (next.web.lanUrls[0] ?? next.web.localUrl);
      });
    } catch (err) {
      if (!aliveRef.current) return;
      if (!silent || !viewRef.current) setError(String((err as Error | null)?.message ?? String(err)));
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    ensureStyles();
    aliveRef.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(true), POLL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      aliveRef.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => () => window.clearTimeout(copyTimerRef.current), []);

  const web = view?.web ?? null;
  const addresses = useMemo(() => (web ? buildAddressRows(web) : []), [web]);

  /** 与所选地址主机配对的 CA 下载地址（本机地址无证书；配对失败回退第一条）。 */
  const caUrl = useMemo<string | null>(() => {
    if (!web || !selected || web.lanCaUrls.length === 0) return null;
    if (isLoopbackHost(selected)) return null;
    let hostname = '';
    try {
      hostname = new URL(selected).hostname;
    } catch {
      return null;
    }
    const matched = web.lanCaUrls.find((u) => {
      try {
        return new URL(u).hostname === hostname;
      } catch {
        return false;
      }
    });
    return matched ?? web.lanCaUrls[0];
  }, [web, selected]);

  const onCopy = useCallback(async (): Promise<void> => {
    if (!selected) return;
    const ok = await copyText(selected);
    setCopied(ok);
    window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
  }, [selected]);

  const lanMeta = web ? LAN_STATE_META[web.lanState] : null;

  return (
    <div className="dshqa-panel">
      {/* 1. 连接状态（直读桌面设置投影） */}
      <div className="dshqa-card">
        <div className="dshqa-card-title">
          <span>连接状态</span>
          <span className="dshqa-title-right">
            {lanMeta && <span className={`dshqa-badge ${lanMeta.tone}`}>{lanMeta.label}</span>}
            <button type="button" className="dshqa-btn" onClick={() => void refresh()} disabled={loading}>
              {loading ? '刷新中…' : '刷新'}
            </button>
          </span>
        </div>
        {web?.lanState === 'inactive' && (
          <div className="dshqa-desc">
            局域网 HTTPS 未启用：在「桌面设置」中打开「局域网访问（需要 HTTPS）」后，手机才能扫码访问。
          </div>
        )}
        {web?.lanState === 'starting' && (
          <div className="dshqa-desc">局域网 HTTPS 正在启动，面板会自动跟随最新状态。</div>
        )}
        {web?.lanState === 'failed' && (
          <div className="dshqa-desc">启动失败{web.lanError ? `：${web.lanError}` : '，请查看 DSH Desktop 诊断信息。'}</div>
        )}
        {web?.lanState === 'ready' && (
          <div className="dshqa-desc">
            已就绪。用手机相机扫描下方二维码即可打开 DSH；首次使用请先在「CA 证书」页完成信任，否则浏览器会报证书告警。
          </div>
        )}
      </div>

      {/* 2. 首载失败（非 Desktop 宿主 / 未开启浏览器访问） */}
      {error && !web && (
        <div className="dshqa-card">
          <div className="dshqa-card-title"><span>未检测到桌面设置接口</span></div>
          <div className="dshqa-desc">
            读取 /api/desktop/settings 失败（{error}）。此分区依赖 DSH Desktop v2.0+ 的同源桌面接口：
            请使用 DSH Desktop（兼容模式）并保持浏览器访问开启；npm 版 DSH 无此接口，本分区不可用。
          </div>
        </div>
      )}

      {/* 3. 扫码卡：地址点选 + 大二维码 + CA 证书 */}
      {web && selected && (
        <div className="dshqa-card">
          <div className="dshqa-card-title">
            <span>扫码连接</span>
            <span className="dshqa-tabs">
              <button
                type="button"
                className={`dshqa-tab ${tab === 'url' ? 'active' : ''}`}
                onClick={() => setTab('url')}
              >
                访问地址
              </button>
              {web.lanCaUrls.length > 0 && (
                <button
                  type="button"
                  className={`dshqa-tab ${tab === 'ca' ? 'active' : ''}`}
                  onClick={() => setTab('ca')}
                >
                  CA 证书
                </button>
              )}
            </span>
          </div>

          {tab === 'url' && (
            <>
              <div className="dshqa-addr-list">
                {addresses.map((addr) => (
                  <button
                    type="button"
                    key={addr.url}
                    className={`dshqa-addr ${selected === addr.url ? 'active' : ''}`}
                    onClick={() => setSelected(addr.url)}
                  >
                    <span className="dshqa-addr-dot" />
                    <span className="dshqa-addr-main">
                      <span className="dshqa-addr-title">
                        {addr.title}
                        <span className={`dshqa-tag ${addr.kind === 'lan' ? 'lan' : ''}`}>
                          {addr.kind === 'lan' ? '局域网' : '本机'}
                        </span>
                      </span>
                      <span className="dshqa-addr-host">{addr.host}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="dshqa-qr-wrap">
                <QrSvg text={selected} />
                <div className="dshqa-url">{selected}</div>
                <div className="dshqa-copy-row">
                  <button type="button" className="dshqa-btn" onClick={() => void onCopy()}>
                    {copied ? '已复制 ✓' : '复制链接'}
                  </button>
                </div>
              </div>
              {isLoopbackHost(selected) && (
                <div className="dshqa-note">本机地址只有这台电脑能访问；手机请选择「局域网」地址。</div>
              )}
            </>
          )}

          {tab === 'ca' && (caUrl ? (
            <>
              <div className="dshqa-qr-wrap">
                <QrSvg text={caUrl} size={184} />
                <div className="dshqa-url">{caUrl}</div>
              </div>
              <div className="dshqa-note">
                首次 HTTPS 访问前需在手机上安装并信任本地 CA：扫码打开证书页（浏览器可能提示证书告警，选择继续访问即可下载）
                → 按系统引导安装 → iOS 需再到「设置 › 通用 › 关于本机 › 证书信任设置」开启完全信任；Android 在「设置 › 安全 ›
                加密与凭据 › 安装证书」中安装。本地 CA SHA-256 指纹：<code>{web.lanCaFingerprint ?? '—'}</code>
              </div>
            </>
          ) : (
            <div className="dshqa-note">
              {selected && isLoopbackHost(selected)
                ? '本机访问无需证书。请先在「访问地址」页选择一个局域网地址，这里会显示与之配对的证书下载码。'
                : '当前局域网状态暂无可下载的证书地址。'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
