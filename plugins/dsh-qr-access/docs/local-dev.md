# dsh-qr-access 本地开发

## 构建

```bash
cd plugins/dsh-qr-access
pnpm install
pnpm run build        # esbuild 产出 lib/index.js + lib/client.js（CJS + __ModuleLoader__ 包装）
pnpm run typecheck    # 可选
```

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
- 重启 DSH Desktop 后在「设置 → 扫码访问」验证。

## 宿主依赖说明

- 数据来源为 DSH Desktop v2.0+（兼容模式）同源接口 `/api/desktop/settings`；
  纯 npm 版 DSH 无此接口，插件 fail-soft，分区显示不可用提示。
- 零宿主副作用：不 spawn 任何进程、不新增路由/端口/凭据面；
  唯一第三方依赖 `qrcode-generator` 是**构建期**依赖（devDependencies），
  已由 esbuild 内联进 `lib/client.js`：client 半区自包含，运行时零 `require`，
  profile 根 `node_modules/qrcode-generator` 下也**没有**任何副本可依赖。
  改动它之后必须重新 `node build.mjs`，产物才带上新版本。
