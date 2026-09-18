# dsh-qr-access 本地开发

## 构建

```bash
cd plugins/dsh-qr-access
pnpm install
pnpm run build        # esbuild 产出 lib/index.js（宿主半区，ESM）+ lib/client.js（CJS + __ModuleLoader__ 包装）
pnpm run typecheck    # 可选
```

宿主半区源码在 `src/index.ts` + `src/host/urls.ts`（地址解析与铸 token 白名单）；
浏览器半区在 `src/client/`。

## 本机验证（运行目录同步）

- 构建后**只同步产物四件套**到 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-qr-access/`：
  `lib/`、`cordis.patch.yml`、`package.json`、`README.md`。
- ⚠️ **严禁整目录复制（连 `node_modules/` 一起拷）**：此前曾因此把 typescript / esbuild
  等 devDependencies 的嵌套 `.pnpm` 树（约 35M）带入运行目录。正确安装/回装一律走
  `dsh plugin --profile web add @lynn123411/dsh-qr-access`
  或 `cd ~/.dsh/profiles/web && pnpm add @lynn123411/dsh-qr-access@<版本>`。
- 本插件是 **bundle 型**（包内声明 `dsh.bundle.patch`），因此**必须**出现在 profile
  `package.json` 的 `dsh.profile.bundles` 列表中（标准安装命令会自动登记）。
  注意：「不要加进 bundles」的告诫只适用于无 `dsh.bundle` 声明的纯工具型插件
  （如 `@lynn123411/dsh-ask-user-grilling`），不适用于本插件。
- **宿主半区新增路由必须重启 DSH 才生效**（`lib/index.js` 的路由注册只在插件加载时执行）；
  仅改浏览器半区时可只刷新页面。重启后在「设置 → 扫码访问」验证，并可用
  `curl -b <cookie> 'http://127.0.0.1:<port>/api/qr-access/urls?protocol=http:'` 直接看响应。

## 宿主依赖说明

- 两条数据源，浏览器半区自动选择：
  1. **DSH Desktop**（优先）：同源桌面接口 `/api/desktop/settings`（局域网 HTTPS + CA 证书）；
  2. **任意 dsh 实例**（兜底）：本插件宿主半区注册的 `GET /api/qr-access/urls`。
- 安全边界：宿主路由挂在 DSH 自带 `/api` 前缀下，自动继承 `connection` 的 Host/Origin
  栅栏与浏览器会话鉴权；只为「回环 / 局域网 IP 字面量 / `--trusted-host` 声明项 / 当前页面
  authority」铸 token，响应 `cache-control: no-store`。不新增端口、不新增凭据、不 spawn 进程。
- 已知限制：DSH 0.1.5-rc.1 的 CLI 拒绝 `--host 0.0.0.0`，故通用实例恒为回环绑定，
  `webRuntime.lanAddresses` 为空；跨设备只能靠本机隧道/反代 + `--trusted-host`。
- 唯一第三方依赖 `qrcode-generator` 是**构建期**依赖（devDependencies），
  已由 esbuild 内联进 `lib/client.js`：client 半区自包含，运行时零 `require`，
  profile 根 `node_modules/qrcode-generator` 下也**没有**任何副本可依赖。
  改动它之后必须重新 `node build.mjs`，产物才带上新版本。
- `node:os` 仅用于「绑定 `0.0.0.0` 且宿主未提供 `webRuntime`」时自算局域网地址，
  由 `src/host/node-os.d.ts` 提供最小环境声明（不引入 `@types/node`）。
