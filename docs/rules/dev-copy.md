# 开发副本（`link:` 软链接）

开发 profile 里的自有包一律 `link:` 到本仓库目录——**仓库文件就是已安装内容**，改完即生效。**界面是新的、路由 404** 或撞 `Cannot find package '…'` 时查这一份。

**本仓库只管 `web` 这个开发 profile。** 自有包只在它里面是 `link:` 开发副本；`desktop`、`headless`、`acp`、`diagnose` 按 npm 包安装、不跟随本仓库，**物化成 registry 版本是设计如此，不是漂移**。这条约定登记在 `tools/lib/repo.mjs` 的 `DEV_PROFILE` 一处：`dev-link.mjs` 默认只查它，`assert-ledger.mjs` 判据 9 只查它，提交门禁因此不会被别的 profile 拖红。

## 建立与校验

`node tools/dev-link.mjs` 默认只读检查开发 profile × 全部自有包：软链、目标版本、被物化成 registry 版本的入口，以及声明了 `dsh.client` 却没登记进 `dsh.profile.bundles` 的包。要看别的 profile 加 `--all-profiles` 或 `--profile <名字>`——那里「物化成 registry 版本」不算问题，只有软链断了、依赖缺失、bundle 没登记才算。另扫 `node_modules/@lynn123411/` 下已断开或指向 `archive/` 的孤儿软链。

日常只修开发 profile，用 `node tools/dev-link.mjs --write`（默认就是 `web`）。要动别的 profile 必须显式写 `--profile <名字>` 或 `--all-profiles`——那会把那里的发布副本换成开发软链，只在有意为之的时候用。只重连某个包时另加 `--package <包名或目录名>`；该参数只筛选在维护的包，孤儿软链仍按选中的 profile 全部清理。

`--write` 执行 `pnpm add "link:<实际包绝对路径>" --offline` 并删除孤儿软链，**不登记 `dsh.profile.bundles`**。只缺 bundle 登记时它不重连依赖，要按输出执行 `dsh plugin --profile <name> add <实际包目录>`。

归档包要先在每个装过它的 profile 里卸载，清掉 `dependencies` 与 `dsh.profile.bundles`，再用工具清孤儿软链；仅删除软链不能阻止 profile 同步再次物化清单中的包。顺序与完成判据见 [release.md](./release.md)「退役（归档）」。

## 保持软链

市场 / 管理器里的「安装 / 更新」与任何 profile 同步都会按 `package.json` 的 spec 物化回 registry 版本、顶掉软链；确需回到发布版时才显式 `pnpm add @lynn123411/dsh-<name>@<版本>`。

只有临时验证本机没建链接的别人的包才退回手工同步，且必须整目录对齐（`lib/`、`package.json`、`cordis.patch.yml` 等一起拷），再 `diff -rq` 核对：漏拷 `lib/index.js` 会让宿主半边停在旧版而客户端半边已更新。

## 生效时机

- **自带构建的插件（`src/` → `lib/`）先 `pnpm build`**：链接过去的是构建产物，编辑 `src/` 不 build 等于没改。
- **客户端半边**：刷新页面即生效（bundle 按 `rev` 下发并带长期缓存；`rev` 是产物文件 `mtime`、`ctime`、`size` 三样的哈希，不含内容，所以文件被重写而统计值没变时不换 `rev`，必要时硬刷新 `Cmd+Shift+R`）。想确认这一次到底拿到哪份产物：`node tools/verify-client.mjs <包> --needle '<你新写的类名或文案>'`（`--build` 连构建一起做）——它抄首页上那条带 `rev` 的地址、带 cookie 取回 bundle、在产物里找那段新东西，找不到就 FAIL。这条命令要两个环境变量 `DSH_WEB_URL` 与 `DSH_WEB_AUTH_URL`（在 DSH 会话里跑就有，也可用 `--url` / `--auth` 给），缺一个就以 2 退出；它读的是**正在跑那个实例**的首页清单，所以先让那个实例重新组合、浏览器刷新拿到新地址，再跑它——否则判的是旧 `rev` 那一份。
- **宿主半边**：**Web profile 不用重启进程**。改 `lib/` 之后触发一次 profile 重新组合就换上新代码：在插件页或 `plugin_manager` 里把插件关一次再开一次，或者改存 profile 的 `cordis.patch.yml`（HMR 盯着它）。重新组合会把已装载模块与磁盘逐一比对身份（inode、大小、修改时间），变了的模块先逐出、再由 Loader 重新 `import`，拿到的是磁盘上最新的文件；`link:` 包的目标目录同样在比对范围内。loader 不监听文件，所以什么都不做不会自己生效。
- **没有 `hmr` 的 profile**（headless、SDK、ACP 在 YAML 里把它关了）仍旧重启才生效。
- **这几种情况必须重启**：操作结果是 `restart-required`，`restartReason` 说明理由——`no-hmr`（没有 HMR）、`package-moved`（某个安装映射换了目录）、`module-comparison`（模块缓存无法与磁盘比对），以及待处理模块标着 `host-module` / `unmanaged-plugin`（进程入口静态图里的模块，比如把 DSH 自己的包软链进 profile）。
- **增删 `link:` 包**：走插件页 / `plugin_manager` 安装时，重新组合重算映射并启动新行；在 profile 里手工 `pnpm add` 之后要靠 `cordis.patch.yml` 或 `dsh.profile.bundles` 的变化触发重新组合，而映射变动被拒时结果仍是 `restart-required`（`package-moved`）。
- 改完不想动正在服务的这个实例时，用 `node tools/host-smoke.mjs`：它拿一份副本 home 起第二个实例（临时端口、不开浏览器、不碰启动器），判「本仓 bundle 全部解析到 + 首页 200 + 每个客户端 bundle 取得到 + 启动日志里没有装载异常」。正在跑那个实例的日志路径由 `node tools/dsh-env.mjs` 打出——启动期的装载异常就写在那里。

## 内核包解析

`link:` 插件 `import` 的 `@deepseek-ai/*` 由 DSH 运行时的 profile 解析供给：安装自带的包与已选 bundle 携带的包进 Node 的 ESM / CJS 解析器，软链的真实路径会被 canonicalize 后归到同一份模块实例。仓库根因此不放 `node_modules`，进程按默认启动参数即可。

## 缺包时的报错长相

| 插件如何被引用 | 何时挂 | 报错长相 |
| --- | --- | --- |
| bundle 层（列在 profile `dsh.profile.bundles` 里） | profile 启动时 | `dsh: skipping profile bundle "<包名>": Error: dsh: cannot resolve profile bundle "<包名>" …`——这一层被跳过，实例照常起来（所以「页面里东西少了」不会报错） |
| 该行必须激活（根 include，以及内核写死的那几行：`agent-loop`、`webserver`、`web-runtime`、`modules`、`connection`、`headless-runner`、`acp`、`sdk-jsonrpc-server`），而它 import 不到 | profile 启动即失败 | `dsh: plugin tree failed to load: …` 后跟 `Failed plugins (N):` 与 `<id>` / `Package: <包名>` / `failed to import: Error [ERR_MODULE_NOT_FOUND]: Cannot find package '<包名>' imported from <profile 目录>`——进程以 1 退出，启动器转入 diagnose |
| 普通行（不必激活的行）import 不到 | DSH 正常启动 | 启动日志一行 `<id> (<包名>): failed to import: Error [ERR_MODULE_NOT_FOUND]: Cannot find package '<包名>' imported from <baseUrl>`，这一行不挂、其余照常 |
| 只被 preset 的工具行引用（**不在** bundles 里） | DSH 正常启动，切换该 preset 时失败 | `<id> (<包名>): never started`——preset 的审计只按「fiber 建没建起来」判，缺包连 fiber 都没有；整份 preset 因此挂载失败 |

诊断时记两条：`Cannot find package` 的解析失败被 Node **缓存在进程内**，同进程重试仍是同一条错，要换新进程复现；客户端半边的 `@deepseek-ai/*` 由浏览器侧模块表供给、不参与 Node 解析，缺包只在宿主日志里现形。
