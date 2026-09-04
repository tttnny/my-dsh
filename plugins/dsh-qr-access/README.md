# @lynn123411/dsh-qr-access

把 DSH Desktop 的浏览器访问地址变成二维码。在设置页新增「扫码访问」分区，实时生成**局域网 HTTPS 访问地址**与**本地 CA 证书**的大尺寸二维码——手机相机一扫直达，免复制粘贴、免发消息传 URL。

DSH Desktop 的访问 token 随每次重启（宿主换代）轮换，本插件**不做任何缓存**：二维码每次都从桌面设置同源接口现取，重启后扫到的永远是当前代的最新地址。

## 特性

- **扫码直连**：手机相机扫二维码直接打开带 token 的完整访问 URL，免去「电脑复制 → 传到手机」两步。
- **手动点选地址**：完整列出本机地址（127.0.0.1，仅电脑可达）与全部局域网 HTTPS 地址，点哪个生成哪个的码；不做网卡猜测（Clash TUN 的 198.18.0.1 之类虚拟地址也如实列出，由你判断哪块手机连得上）。
- **CA 证书码**：一键切到「CA 证书」页，扫码直达 `.well-known/dsh-desktop-ca.crt` 下载页；证书地址按所选局域网地址的主机自动配对，附 SHA-256 指纹与 iOS / Android 信任引导，首次访问免证书告警、WebCrypto 可用。
- **实时跟随 token 轮换**：面板挂载期间每 30 秒轻量轮询 + 手动「刷新」按钮 + 页面重新可见即刷新，DSH 重启后二维码自动变为新地址，无需任何操作。
- **状态可视化**：局域网 HTTPS 状态（已就绪 / 启动中 / 未启用 / 失败）徽标与错误原因直读桌面设置数据，未就绪时给出开启指引。
- **零宿主代码**：纯客户端插件，数据全部来自 DSH Desktop 同源接口 `/api/desktop/settings`，不新增任何路由、端口或凭据面。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-qr-access
```

> 依赖 DSH Desktop v2.0+（兼容模式）且已开启「局域网访问（需要 HTTPS）」；npm 版 DSH 无桌面设置接口，分区会显示不可用提示。

## 本地开发

```bash
cd plugins/dsh-qr-access
pnpm install
pnpm run build        # esbuild 产出 lib/index.js + lib/client.js（CJS + __ModuleLoader__ 包装）
pnpm run typecheck    # 可选
```

本地实测：把构建产物同步到 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-qr-access/`，并在 `~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles` 中追加 `@lynn123411/dsh-qr-access`，重启 DSH Desktop 后在「设置 → 扫码访问」验证。
