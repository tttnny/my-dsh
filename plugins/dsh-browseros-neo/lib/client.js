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

    const STATUS_META = {
      connected: { dot: '#30a46c', text: '已连接 · 工具已注册' },
      alive: { dot: '#b58a00', text: '端点在线，等待桥挂载' },
      profile: { dot: '#b58a00', text: 'BrowserOS neo 已安装，当前未运行' },
      absent: { dot: '#8a8f98', text: '未检测到 BrowserOS neo（~/.browserclaw 不存在）' },
    };

    function statusMeta(st) {
      if (!st) return { dot: '#8a8f98', text: '读取状态失败' };
      if (!st.enabled) return { dot: '#8a8f98', text: '已停用' };
      if (st.connected) return STATUS_META.connected;
      if (st.alive) return STATUS_META.alive;
      if (st.neoProfile) return STATUS_META.profile;
      return STATUS_META.absent;
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

      const act = React.useCallback(async (body) => {
        setBusy(true);
        try {
          await fetch('/api/dsh-browseros-neo/action', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
        } finally {
          await refresh();
          setTimeout(() => void refresh(), 1500);
          setBusy(false);
        }
      }, [refresh]);

      const meta = statusMeta(st);
      const label = { display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' };
      const small = { fontSize: '0.85em', opacity: 0.72 };
      const buttonStyle = { padding: '4px 12px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 };

      return h('div', { style: { maxWidth: 560, lineHeight: 1.7 } },
        h('p', { style: small }, 'BrowserOS neo（agent 专用浏览器）接入：经官方 dsh-mcp-client 桥接，工具以 mcp__browseros-neo__* 暴露；Neo 端口从 ~/.browserclaw/runtime.json 自动解析。'),
        h('div', label,
          h('span', { style: { width: 10, height: 10, borderRadius: '50%', background: meta.dot, display: 'inline-block', flexShrink: 0 } }),
          h('span', null, meta.text),
          st && st.checkedAt ? h('span', { style: small }, '· 上次检测 ' + new Date(st.checkedAt).toLocaleTimeString()) : null,
        ),
        st && st.endpoint ? h('div', { style: small }, '端点：' + st.endpoint) : null,
        st && st.lastError && !st.connected ? h('div', { style: Object.assign({}, small, { color: '#e5484d' }) }, '最近错误：' + st.lastError) : null,
        h('div', label,
          h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' } },
            h('input', {
              type: 'checkbox',
              checked: !!(st && st.enabled),
              disabled: busy,
              onChange: (e) => void act({ action: 'setEnabled', enabled: e.target.checked }),
            }),
            h('span', null, '启用 Browser Neo 接入'),
          ),
        ),
        h('div', label,
          h('button', { style: buttonStyle, disabled: busy || !st || !st.neoProfile, onClick: () => void act({ action: 'reconnect' }) }, '立即重连'),
          h('span', { style: small }, 'Neo 已打开但状态未恢复时点此处；平时模型可调用 browseros_neo_launch 工具自动后台拉起 Neo。'),
        ),
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
