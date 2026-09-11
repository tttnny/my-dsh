import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAccessView, type AccessView, type DesktopLanState } from './api.ts';
import { QrSvg } from './qr-svg.tsx';
import { ensureStyles } from './styles.ts';

/** 局域网四态徽标文案与色调（Desktop 数据源）。 */
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

function isPlainHttp(url: string): boolean {
  try {
    return new URL(url).protocol === 'http:';
  } catch {
    return false;
  }
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

/** 地址行类型：当前页面 / 本机回环 / 局域网 / --trusted-host 受信主机。 */
type RowKind = 'page' | 'local' | 'lan' | 'trusted';

interface AddressRow {
  url: string;
  kind: RowKind;
  title: string;
  host: string;
}

/** 行类型 → 标签文案与 CSS 类。 */
const ROW_TAG: Record<RowKind, { label: string; cls: string }> = {
  page: { label: '当前页面', cls: 'page' },
  local: { label: '本机', cls: '' },
  lan: { label: '局域网', cls: 'lan' },
  trusted: { label: '隧道/反代', cls: 'trusted' },
};

/** 按来源组装地址行（同 URL 只保留首次出现的行）。 */
function buildAddressRows(view: AccessView): AddressRow[] {
  const rows: AddressRow[] = [];
  const push = (url: string | null, kind: RowKind, title: string): void => {
    if (url === null || url.length === 0 || rows.some((row) => row.url === url)) return;
    rows.push({ url, kind, title, host: hostOf(url) });
  };
  if (view.mode === 'generic') {
    push(view.pageUrl, 'page', '当前页面地址');
    push(view.localUrl, 'local', '本机访问');
  } else {
    push(view.localUrl, 'local', '本机访问');
  }
  view.lanUrls.forEach((url, i) => {
    push(url, 'lan', view.mode === 'generic' ? (view.lanUrls.length > 1 ? `局域网 #${i + 1}` : '局域网') : view.lanUrls.length > 1 ? `局域网 HTTPS #${i + 1}` : '局域网 HTTPS');
  });
  view.trustedUrls.forEach((url, i) => {
    push(url, 'trusted', view.trustedUrls.length > 1 ? `受信主机 #${i + 1}` : '受信主机');
  });
  return rows;
}

/** 首选行：优先可跨设备的地址，其次第一条。 */
function preferredUrl(rows: AddressRow[]): string | null {
  const crossDevice = rows.find((row) => row.kind !== 'local' && !isLoopbackHost(row.url));
  return (crossDevice ?? rows[0])?.url ?? null;
}

/** 「扫码访问」设置分区主面板。 */
export function QrAccessPanel(): React.ReactElement {
  const [view, setView] = useState<AccessView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'url' | 'ca'>('url');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const viewRef = useRef<AccessView | null>(null);
  const aliveRef = useRef(true);
  const copyTimerRef = useRef<number | undefined>(undefined);

  /** 现取当前宿主代地址；静默轮询失败不打扰，首载失败才亮错误卡。 */
  const refresh = useCallback(async (silent = false): Promise<void> => {
    if (!silent) setLoading(true);
    try {
      const next = await fetchAccessView();
      if (!aliveRef.current) return;
      viewRef.current = next;
      setView(next);
      setError(null);
      const rows = buildAddressRows(next);
      setSelected((prev) => (prev && rows.some((row) => row.url === prev) ? prev : preferredUrl(rows)));
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

  const addresses = useMemo(() => (view ? buildAddressRows(view) : []), [view]);
  const crossDevice = useMemo(() => addresses.some((row) => row.kind !== 'local' && !isLoopbackHost(row.url)), [addresses]);
  const port = view?.port ?? null;

  /** 与所选地址主机配对的 CA 下载地址（Desktop 专有；本机地址无证书）。 */
  const caUrl = useMemo<string | null>(() => {
    if (!view || view.mode !== 'desktop' || !selected || view.lanCaUrls.length === 0) return null;
    if (isLoopbackHost(selected)) return null;
    let hostname = '';
    try {
      hostname = new URL(selected).hostname;
    } catch {
      return null;
    }
    const matched = view.lanCaUrls.find((u) => {
      try {
        return new URL(u).hostname === hostname;
      } catch {
        return false;
      }
    });
    return matched ?? view.lanCaUrls[0];
  }, [view, selected]);

  const onCopy = useCallback(async (): Promise<void> => {
    if (!selected) return;
    const ok = await copyText(selected);
    setCopied(ok);
    window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
  }, [selected]);

  const lanMeta = view && view.mode === 'desktop' ? LAN_STATE_META[view.lanState] : null;
  const genericMeta = view && view.mode === 'generic' ? (crossDevice ? { label: '可跨设备', tone: 'ok' as const } : { label: '仅本机', tone: 'muted' as const }) : null;
  const badge = lanMeta ?? genericMeta;
  /** 「CA 证书」页只在确有证书地址时可达（通用实例无 CA 数据）。 */
  const activeTab: 'url' | 'ca' = tab === 'ca' && (view?.lanCaUrls.length ?? 0) > 0 ? 'ca' : 'url';

  return (
    <div className="dshqa-panel">
      {/* 1. 连接状态（直读当前实例的地址投影） */}
      <div className="dshqa-card">
        <div className="dshqa-card-title">
          <span>连接状态</span>
          <span className="dshqa-title-right">
            {badge && <span className={`dshqa-badge ${badge.tone}`}>{badge.label}</span>}
            <button type="button" className="dshqa-btn" onClick={() => void refresh()} disabled={loading}>
              {loading ? '刷新中…' : '刷新'}
            </button>
          </span>
        </div>

        {view?.mode === 'desktop' && view.lanState === 'inactive' && (
          <div className="dshqa-desc">
            局域网 HTTPS 未启用：在「桌面设置」中打开「局域网访问（需要 HTTPS）」后，手机才能扫码访问。
          </div>
        )}
        {view?.mode === 'desktop' && view.lanState === 'starting' && (
          <div className="dshqa-desc">局域网 HTTPS 正在启动，面板会自动跟随最新状态。</div>
        )}
        {view?.mode === 'desktop' && view.lanState === 'failed' && (
          <div className="dshqa-desc">启动失败{view.lanError ? `：${view.lanError}` : '，请查看 DSH Desktop 诊断信息。'}</div>
        )}
        {view?.mode === 'desktop' && view.lanState === 'ready' && (
          <div className="dshqa-desc">
            已就绪。用手机相机扫描下方二维码即可打开 DSH；首次使用请先在「CA 证书」页完成信任，否则浏览器会报证书告警。
          </div>
        )}

        {view?.mode === 'generic' && crossDevice && (
          <div className="dshqa-desc">
            已列出本实例的跨设备地址：手机需与电脑处于同一网络或同一隧道下。通用实例默认是明文 HTTP，带 token 的链接会明文传输，请只在可信网络里分享。
          </div>
        )}
        {view?.mode === 'generic' && !crossDevice && (
          <div className="dshqa-desc">
            本实例只监听 {view.boundHost ?? '127.0.0.1'}
            {port === null ? '' : `:${port}`}
            ，二维码只能在这台电脑上打开。DSH 当前版本仍拒绝
            <code> --host 0.0.0.0</code>；如需手机访问，请在本机起隧道 / 反向代理指向 {view.boundHost ?? '127.0.0.1'}
            {port === null ? '' : `:${port}`}，并用 <code>--trusted-host</code> 声明该 authority，本面板会自动列出它。
          </div>
        )}
      </div>

      {/* 2. 首载失败（两种数据源都不可用） */}
      {error && !view && (
        <div className="dshqa-card">
          <div className="dshqa-card-title"><span>未检测到可用的访问地址接口</span></div>
          <div className="dshqa-desc">读取访问地址失败：{error}</div>
        </div>
      )}

      {/* 3. 扫码卡：地址点选 + 大二维码 +（Desktop）CA 证书 */}
      {view && selected && (
        <div className="dshqa-card">
          <div className="dshqa-card-title">
            <span>扫码连接</span>
            <span className="dshqa-tabs">
              <button
                type="button"
                className={`dshqa-tab ${activeTab === 'url' ? 'active' : ''}`}
                onClick={() => setTab('url')}
              >
                访问地址
              </button>
              {view.lanCaUrls.length > 0 && (
                <button
                  type="button"
                  className={`dshqa-tab ${activeTab === 'ca' ? 'active' : ''}`}
                  onClick={() => setTab('ca')}
                >
                  CA 证书
                </button>
              )}
            </span>
          </div>

          {activeTab === 'url' && (
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
                        <span className={`dshqa-tag ${ROW_TAG[addr.kind].cls}`}>{ROW_TAG[addr.kind].label}</span>
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
                <div className="dshqa-note">本机地址只有这台电脑能访问；手机请选择「局域网」或「受信主机」地址。</div>
              )}
              {view.mode === 'generic' && isPlainHttp(selected) && !isLoopbackHost(selected) && (
                <div className="dshqa-note">该地址是明文 HTTP：token 会随链接明文经过网络，请只在可信网络里使用。</div>
              )}
            </>
          )}

          {activeTab === 'ca' && (caUrl ? (
            <>
              <div className="dshqa-qr-wrap">
                <QrSvg text={caUrl} size={184} />
                <div className="dshqa-url">{caUrl}</div>
              </div>
              <div className="dshqa-note">
                首次 HTTPS 访问前需在手机上安装并信任本地 CA：扫码打开证书页（浏览器可能提示证书告警，选择继续访问即可下载）
                → 按系统引导安装 → iOS 需再到「设置 › 通用 › 关于本机 › 证书信任设置」开启完全信任；Android 在「设置 › 安全 ›
                加密与凭据 › 安装证书」中安装。本地 CA SHA-256 指纹：<code>{view.lanCaFingerprint ?? '—'}</code>
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
