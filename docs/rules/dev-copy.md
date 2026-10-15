# 开发副本（`link:` 软链接）

profile 里的自有包一律 `link:` 到本仓库目录——**仓库文件就是已安装内容**，改完即生效。**界面是新的、路由 404** 或撞 `Cannot find package '…'` 时查这一份。

## 建立与校验

`node tools/dev-link.mjs` 一次查全部 profile × 全部自有包：软链还在不在、指得对不对、读到的版本号对不对、被市场顶掉的入口，以及声明了 `dsh.client` 却没登记进 `dsh.profile.bundles` 的包（客户端半边因此不会被服务）。`--write` 把有问题的连回仓库。

它跑的就是手工那一条：`cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-<name>" --offline`（包不在目录根部时链接实际包目录）；建成后 `pnpm install` 幂等，可随时重跑。

## 保持软链

市场 / 管理器里的「安装 / 更新」与任何 profile 同步都会按 `package.json` 的 spec 物化回 registry 版本、顶掉软链；确需回到发布版时才显式 `pnpm add @lynn123411/dsh-<name>@<版本>`。

只有临时验证本机没建链接的别人的包才退回手工同步，且必须整目录对齐（`lib/`、`package.json`、`cordis.patch.yml` 等一起拷），再 `diff -rq` 核对：漏拷 `lib/index.js` 会让宿主半边停在旧版而客户端半边已更新。

## 生效时机

- **自带构建的插件（`src/` → `lib/`）先 `pnpm build`**：链接过去的是构建产物，编辑 `src/` 不 build 等于没改。
- **客户端半边**：刷新页面即生效（bundle 按 `rev` 下发并带长期缓存，HMR 重新哈希后才换 `rev`，必要时硬刷新 `Cmd+Shift+R`）。想确认这一次到底拿到哪份产物：`node tools/verify-client.mjs <包> --needle '<你新写的类名或文案>'`（`--build` 连构建一起做）——它抄首页上那条带 `rev` 的地址、带 cookie 取回 bundle、在产物里找那段新东西，找不到就 FAIL。
- **宿主半边**：重启 DSH 实例——loader 只在启动时装载。增删 `link:` 包、或本地覆盖某个安装包，同样要重启：解析表在进程启动时固定。改完不想动正在服务的这个实例时，用 `node tools/host-smoke.mjs`：它拿一份副本 home 起第二个实例（临时端口、不开浏览器、不碰启动器），判「本仓 bundle 全部解析到 + 首页 200 + 每个客户端 bundle 取得到 + 启动日志里没有装载异常」。正在跑那个实例的日志路径由 `node tools/dsh-env.mjs` 打出——启动期的装载异常就写在那里。

## 内核包解析

`link:` 插件 `import` 的 `@deepseek-ai/*` 由 DSH 运行时的 profile 解析供给：安装自带的包与已选 bundle 携带的包进 Node 的 ESM / CJS 解析器，软链的真实路径会被 canonicalize 后归到同一份模块实例。仓库根因此不放 `node_modules`，进程按默认启动参数即可。

## 缺包时的报错长相

| 插件如何被引用 | 何时挂 | 报错长相 |
| --- | --- | --- |
| bundle 层（列在 profile `dsh.profile.bundles` 里） | profile 启动即挂 | `dsh: plugin tree failed to load … Cannot find package '…'`——整个 web profile exit 1，启动器转入 diagnose |
| 只被 preset 的工具行引用（**不在** bundles 里） | DSH 正常启动，切换该 preset 时失败 | `failed to import loader entry <id> (<包名>): Cannot find package '…'`，末尾带失败那条行的 id 与包名 |

诊断时记两条：`Cannot find package` 的解析失败被 Node **缓存在进程内**，同进程重试仍是同一条错，要换新进程复现；客户端半边的 `@deepseek-ai/*` 由浏览器侧模块表供给、不参与 Node 解析，缺包只在宿主日志里现形。
