# 开发副本（`link:` 软链接）

运行目录指向仓库目录，**仓库文件就是已安装内容**，改完即生效。**界面是新的、路由 404** 或撞 `Cannot find package '…'` 时查这一份。

## 建立与校验

- 建立：`cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-<name>" --offline`。包不在插件目录根部时链接实际包目录（如 `dsh-mattpocock-skills-deck/package`；该插件 2026-09-26 已删除，此处只作形态示例）。建成后 `pnpm install` 幂等，可随时重跑。
- 校验：`ls -la ~/.dsh/profiles/web/node_modules/@lynn123411/ | grep dsh-<name>` 出软链接，且经该路径读到的 `package.json` 版本号等于仓库版本号。

## 不点市场、不手工拷

市场 / 管理器里的「安装 / 更新」与任何 profile 同步都会按 `package.json` 的 spec 物化回 registry 版本、顶掉开发副本；确需回到发布版时才显式 `pnpm add @lynn123411/dsh-<name>@<版本>`。

只有临时验证本机没建链接的别人的包才退回手工同步，且必须整目录对齐：`cp lib/*.js package.json README.md cordis.patch.yml <运行目录>/`，再 `diff -rq` 核对。漏拷 `lib/index.js` 会让宿主半边停在旧版而客户端半边已更新。

## 生效时机

**自带构建的插件（`src/` → `lib/`）先 `pnpm build`**：链接过去的是构建产物，编辑 `src/` 不 build 等于没改。之后——客户端半边刷新页面即生效（bundle 按 `rev` 下发并带长期缓存，HMR 重新哈希后才换 `rev`，必要时硬刷新 `Cmd+Shift+R`）；宿主半边必须重启 DSH 实例——loader 只在启动时装载，profile 的 bundle 层也是启动时组装的。

## 内核包路由与 `--preserve-symlinks`

`link:` 插件宿主半边 `import` 的内核包由 DSH 自身路由供给，**仓库根不放 `node_modules`**。该路由默认 `enforce`：`@deepseek-ai/*` 按**同一个 realpath** 归到安装目录里的那一份（同一 realpath = 同一模块实例），只覆盖 profiles 目录内的导入方。`link:` 插件的真实路径在仓库里，所以 DSH 进程必须带 `--preserve-symlinks` 启动，把模块 URL 留在 profile 路径上、进入路由范围。

- **flag 由启动器供给**：`NODE_RUNTIME_FLAGS` 已覆盖实例启动、web profile 初始化、终端 `dsh` 包装脚本三处，在启动器终端里敲 `dsh` 无需额外处理。
- **手工启动 profile 时自己加**：`node --preserve-symlinks <版本>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web …`。flag 必须排在脚本路径**之前**；`NODE_OPTIONS` 是环境变量，会连带污染 `dsh plugin` 拉起的 pnpm 子进程。
- profile 级 fallback 链接由 DSH 在安装时自行重建，升级后无需重指任何东西。

## 缺 flag 的失败长相

| 插件如何被引用 | 何时挂 | 报错长相 |
| --- | --- | --- |
| bundle 层（列在 profile `dsh.profile.bundles` 里） | profile 启动即挂 | `dsh: plugin tree failed to load … Cannot find package '…'`——整个 web profile exit 1，启动器转入 diagnose |
| 只被 preset 的工具行引用（**不在** bundles 里） | DSH 正常启动，切换该 preset 时失败 | `failed to import loader entry <id> (<包名>): Cannot find package '…'`，末尾带失败那条行的 id 与包名（preset 现在由组合包的 patch 声明，不再是目录预设文件） |

诊断时记两条：`Cannot find package` 的解析失败被 Node **缓存在进程内**，同进程重试仍是同一条错，要换新进程复现；客户端半边的 `@deepseek-ai/*` 由浏览器侧模块表供给、不参与 Node 解析，缺包只在宿主日志里现形。
