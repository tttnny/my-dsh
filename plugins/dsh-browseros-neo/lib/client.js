window.__ModuleLoader__.load({
  id: '@lynn123411/dsh-browseros-neo',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    const React = require('react');

    /** Client plugin name, shared with the browser bundle id and the host half. */
    const name = 'dsh-browseros-neo';

    /** Runtime deps: only the settings.section slot; all data rides the host route. */
    const inject = ['slots'];

    const h = React.createElement;

    function statusMeta(st) {
      if (!st) return { dot: '#8a8f98', text: '读取状态失败' };
      if (st.connected && st.endpointUp) return { dot: '#30a46c', text: '已连接 · 工具以 mcp__browseros-neo__* 注册' };
      if (st.connected && st.endpointStarting) return { dot: '#b58a00', text: '桥在位 · Neo 正在启动（端点未就绪）' };
      if (st.connected) return { dot: '#b58a00', text: '桥在位，但 Neo 端点当前无应答（Neo 可能已关闭或换了端口）' };
      if (st.endpointStarting) return { dot: '#b58a00', text: 'Neo 正在启动（端点未就绪），就绪后会自动重连，或再点一次连接' };
      if (st.endpointUp) return { dot: '#b58a00', text: 'Neo 端点在线 · 桥未确认（点连接重建，或等其自行重连）' };
      if (st.neoInstalled === false) return { dot: '#8a8f98', text: '未检测到 BrowserOS neo（~/.browserclaw 不存在）' };
      return { dot: '#b58a00', text: '未连接' };
    }

    function Panel() {
      const [st, setSt] = React.useState(null);
      const [busy, setBusy] = React.useState(false);

      const refresh = React.useCallback(async () => {
        try {
          const res = await fetch('/api/dsh-browseros-neo/status', { headers: { accept: 'application/json' } });
          setSt(await res.json());
        } catch {
          setSt(null);
        }
      }, []);

      React.useEffect(() => {
        void refresh();
        const timer = setInterval(() => void refresh(), 4000);
        return () => clearInterval(timer);
      }, [refresh]);

      const connect = React.useCallback(async () => {
        setBusy(true);
        try {
          const res = await fetch('/api/dsh-browseros-neo/action', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'connect' }),
          });
          setSt(await res.json());
        } catch {
          setSt(null);
        } finally {
          setBusy(false);
          void refresh();
        }
      }, [refresh]);

      const meta = statusMeta(st);
      const row = { display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' };
      const small = { fontSize: '0.85em', opacity: 0.72 };
      const buttonStyle = {
        padding: '4px 12px',
        borderRadius: 6,
        border: '1px solid currentColor',
        background: 'transparent',
        color: 'inherit',
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.6 : 1,
      };

      return h('div', { style: { maxWidth: 560, lineHeight: 1.7 } },
        h('p', { style: small }, 'BrowserOS neo（agent 专用浏览器）接入：官方 dsh-mcp-client 桥的零配置安装器，端口从 ~/.browserclaw/runtime.json 自动解析，不做任何自动生命周期干预。'),
        h('div', row,
          h('span', { style: { width: 10, height: 10, borderRadius: '50%', background: meta.dot, display: 'inline-block', flexShrink: 0 } }),
          h('span', null, busy ? '正在连接（Neo 没在跑则后台拉起；启动未就绪/退出竞态会自动等待与补发，最长约 60 秒）…' : meta.text),
          st && st.checkedAt ? h('span', { style: small }, '· 上次操作 ' + new Date(st.checkedAt).toLocaleTimeString()) : null,
        ),
        st && st.endpoint ? h('div', { style: small }, '端点：' + st.endpoint + (st.probedEndpoint && st.probedEndpoint !== st.endpoint ? '（当前探测：' + st.probedEndpoint + '）' : '')) : null,
        st && !st.connected && st.lastError ? h('div', { style: Object.assign({}, small, { color: '#e5484d' }) }, '最近错误：' + st.lastError) : null,
        st && st.connected && st.launchedNeo ? h('div', { style: small }, '（本次已为你后台拉起 BrowserOS neo，未抢焦点）') : null,
        h('div', row,
          h('button', { style: buttonStyle, disabled: busy, onClick: () => void connect() }, '连接 BrowserOS neo'),
          h('span', { style: small }, 'Neo 没在跑则后台拉起（不抢焦点）并重建桥会话；专治官方桥 ~2.5 分钟重连预算烧光、Neo 换进程后僵尸会话两类不自愈场景。'),
        ),
        h('div', { style: small }, '提示：新挂载的工具会在会话的下一个 step 出现（每 step 装配一次工具清单），最迟下一轮对话生效。'),
      );
    }

    /** Mount the「Browser Neo」settings section (own-plugin order slot 140). */
    function apply(ctx) {
      ctx.effect(() => {
        const slots = ctx.slots ?? (typeof ctx.get === 'function' ? ctx.get('slots') : null);
        if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return;
        // Keep the receiver: slots methods read `this.ctx` on their first line.
        return slots.inject('settings.section', () => slots.register(
          {
            name: 'settings.section',
            id: 'dsh-browseros-neo',
            // 约定：自有插件设置项 order 从 110 起步进 10；已占用 110/120/130 → 取 140。
            order: 140,
            label: () => 'Browser Neo',
          },
          Panel,
        ));
      }, 'dsh-browseros-neo: settings section');
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
