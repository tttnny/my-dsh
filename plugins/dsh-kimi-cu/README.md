# @lynn123411/dsh-kimi-cu

把本机装的 KimiCU（macOS / Windows）接进 DSH：它的 MCP 服务变成模型可以直接调用的 `mcp__kimi-cu__*` 工具，随包带一份操作桌面的 `kimi-cu` 技能；插件页还会检测 KimiCU 是否装好、给出对应平台的官方安装命令，并在装好之后把 KimiCU 更新到最新。

## 概述

- **读写本机界面**：macOS 通过 CodeAct 操作应用和浏览器，默认在后台执行；Windows 使用前台真实输入，会短暂占用鼠标键盘。
- **安装检测与引导**：插件页详情页的状态卡显示安装、权限与 MCP 连接状态，给出当前平台的官方安装命令、复制按钮与重新检测；模型也可以用 `kimi_cu_status` 工具查同样的状态。
- **一键更新**：卡片读 KimiCU 官方的更新清单，有新版时按钮显示「更新到 x.y.z」；点一下由 KimiCU 自己的 `upgrade` 通道下载、校验签名并替换安装，过程中显示阶段文字，完成后就地更新版本号并重连 MCP。
- **随包带操作技能**：`kimi-cu` 技能说明怎么绑定目标窗口、什么时候重新观察、坐标与 index 怎么用、投递成功与真的生效怎么区分；macOS 与 Windows 各一份。

## 安装与开关

```bash
dsh plugin --profile web add @lynn123411/dsh-kimi-cu
```

这条命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之并入层栈。首次使用前要先装 KimiCU 本身：装好插件后打开插件页的详情页，状态卡会给出当前平台的官方安装命令。

开关在插件页「已安装插件」里本插件那一行的右侧：关掉后 `mcp__kimi-cu__*` 工具与随包技能一起消失，重新打开时重新探测并注册。

装好 KimiCU 后，在插件详情页点「重新检测」。探测通过且桌面槽位可用时，插件会建立 MCP 连接。

## 配置

本插件没有可调字段，插件页详情页上的状态卡就是它的配置界面：注册在 `plugins.bundle.config`，key 是包名，因此不占设置页。

卡片是「标签 | 内容 | 动作」的三列行：

| 行 | 内容 | 动作 |
| --- | --- | --- |
| 状态 | 安装与连接状态、故障信息、安装位置附注 | 「重新检测」刷新本机检查并尝试补连 |
| 版本 | 探测到的 KimiCU 版本号 | — |
| 路径 | 探测到的可执行文件路径 | — |
| 更新 | 更新清单的比对结果或当前阶段；失败时给失败原因与原始输出 | 「检查更新」/「更新到 x.y.z」/「已是最新」/「更新中」 |
| 文档 | — | 官方文档链接 |

未安装、检测到旧安装目录或 MCP 命令指向的文件不存在时，状态行下面多一块「安装」：官方安装命令、复制按钮、官方文档链接与分步说明。本机检查未通过时多一块「本机检查」：`doctor` 的每一项与修复提示。平台不受支持时卡片只说明一句，不注册 MCP 连接。

## 实现

### 装配：三行都在根层

`cordis.patch.yml` 只有一层 `insert`，三行都在根层，profile 里每个 preset 的 agent 都能看到这批工具与这个技能：

| 行 id | 挂的包 | 作用 |
| --- | --- | --- |
| `dsh-kimi-cu` | 本包 | 宿主半边（`kimi_cu_status` 工具、状态与更新两条 `/api` 路由、MCP 注册）与浏览器半边（插件页状态卡） |
| `skill-kimi-cu-macos` | `@deepseek-ai/dsh-skill-filesystem` | 只扫本包 `skills/macos`，平台守卫关掉非 macOS |
| `skill-kimi-cu-windows` | `@deepseek-ai/dsh-skill-filesystem` | 只扫本包 `skills/windows`，平台守卫关掉非 Windows |

MCP 连接不占 patch 行：宿主半边探测到可执行文件之后调用 `mcpManager.register('kimi-cu', …)`，命令与参数取自同一次探测，状态卡、`kimi_cu_status` 与真正的连接读的是同一份结果。管理器缺失时 `ctx.inject(['mcpManager'])` 整块不激活，插件其余部分照常加载，只是没有 `mcp__kimi-cu__*` 工具。

### 检测

宿主半边在 `src/server/`：

- `resolve.ts`：纯函数，解析安装位置、MCP 命令与安装计划；不受支持的平台给出 `mcp: null`。
- `doctor.ts`：跑 `kimi-cu doctor` 并解析。macOS 解析 `✅`/`❌` 行；Windows 解析 `version=` 与 `mcp=true`。
- `status.ts`：把上面两样合成 `KimiCuStatus`，缓存 10 秒、并发调用共用一次探测、`refresh` 绕过缓存；所有失败落进状态字段，不抛。

Windows 的路径公式只在 `resolve.ts` 的 `windowsMcpCommand` 里有一份。覆盖值存在时只用覆盖值，不回退到默认目录；旧目录安装会同时标 `legacy-install` 与 `mcp-command-missing`，卡片按「本机检查未通过」处理，不会在连接指向的文件不存在时报「本机检查通过」。

`doctor` 报告服务与调用者上下文的检查；服务不可达时可用 `xpc-ping` 进一步诊断（见随包 macOS 技能）。

### 更新链路

- `update.ts`：清单解析、按数字段比版本、`==>` 行映射阶段、失败分类，以及带单飞锁的更新器。
- `update-runtime.ts`：读清单（5 秒超时）与跑 `upgrade` 子进程并逐行回调。
- `update-router.ts`：`GET /api/dsh-kimi-cu/update` 返回检查结果，`POST` 返回 NDJSON 事件流。

macOS 与 Windows 各有一份更新清单，版本号互不可比。页面打开时静默读一次清单（与本地检测解耦），只用来决定按钮文案；点按钮时服务端重新比对，已是最新就直接返回。

- **命令**：macOS 跑 `kimi-cu upgrade`（不带版本号，让 KimiCU 自己判断）；Windows 的 `upgrade` 必须带目标版本，所以传清单里的版本号。
- **清单读不到**：macOS 照常跑，交给 KimiCU 判断；Windows 报网络错误，不执行。
- **阶段**：`==>` 开头的行映射成「正在下载／校验／替换／重连」，认不出的行保持上一个阶段。
- **失败分类**：只看错误行（跳过 `==>` 与 `✓` 进度行），分网络、校验失败、权限不足、已有升级在跑、超时五类，另有 unknown 兜底。
- **单飞锁与超时**：同一时刻只允许一次更新；5 分钟超时只放弃等待，不 kill 子进程，锁留到它真的退出。
- **断流**：如果浏览器收不到最终事件，会显示更新结果未知。可重新检测本机版本与 MCP 连接。服务端仍跟踪原进程退出并处理后续重连。
- **版本与重连**：确认已装入目标版本或更新版本后，通过 `mcpManager.restart('kimi-cu')` 重建仍在注册的连接。启动命令变更或旧注册已撤回时重新注册。管理器报告已连接后，卡片才确认重连成功。

安装不执行、更新却执行，是因为两者要的权限不同：安装器要用户在系统设置里授予辅助功能与屏幕录制，后台执行拿不到；更新走 KimiCU 自带的 `upgrade`，下载、校验、替换、回滚都由它完成，不需要交互式密码。

### 桌面操作独占槽位

本机检查通过、MCP 启动文件存在且管理器可用时，插件会注册 MCP 连接。如果宿主提供 `computerUse` 服务，插件会先调用 `computerUse.register()` 为 `kimi-cu` 占用桌面操作槽位。自定义宿主组合可以省略 `computerUse`，此时 KimiCU 仍由 MCP 管理器接入，连接没有 `computerUse` 提供的独占保护。槽位冲突会显示占用方。MCP 注册或连接终态失败时撤回注册并释放槽位，后续可重新检测补连。管理器报告清理未完成时，保留槽位至宿主停止，避免旧连接和新后端同时控制桌面。

### 技能按平台分两条

两份技能的工具面与操作语义不同：macOS 使用 CodeAct 的 `js` / `js_reset` 和 AX 树，Windows 使用直接工具、前台真实输入和 UIA 树。各平台分别扫描对应目录，技能名都叫 `kimi-cu`；实际工具以已连接服务的 schema 为准。

两条技能行都写 `providerName: kimi-cu` 与 `includeDefaultRoots: false`，只扫本包对应平台的 `skills/`；项目与用户技能目录仍归内核那条默认行。技能目录用 `createRequire(baseUrl).resolve(...)` 算成绝对路径：bundle patch 的 `!!js` 以 profile 目录为 `baseUrl`，写相对路径会解析到别处。

### 工具调用上限与连接数

注册给管理器的条目把单次工具调用上限设成 5 分钟；超时会被客户端取消，长任务应拆成可验证的步骤。macOS 的官方启动脚本检查系统和 App 版本，App 低于脚本要求时可能自动升级。

宿主只起一个 KimiCU MCP 连接，所有 session 共用。macOS 的持久 JS 会话和观察状态也随连接共享；多个 session 应错开操作，重新观察后再使用目标标识。

## 模型体验

`kimi_cu_status` 的模型侧描述：

> Check whether KimiCU (Kimi Computer Use) is installed and ready on this machine, and get the platform-specific install or repair steps. Call this when the mcp__kimi-cu__* tools are missing or a KimiCU call fails with a connection error.

`refresh` 是布尔参数。启用时绕过缓存重新检测，并尝试补连。工具返回 JSON，含平台、安装与版本信息、`doctor` 结果、MCP 命令与实时状态、安装计划。

MCP 工具在模型侧的名字是 `mcp__kimi-cu__<name>`（例如 macOS 的 `mcp__kimi-cu__js`，或 Windows 的 `mcp__kimi-cu__list_apps`）。随包技能说明这些工具的用法与边界，并要求在 `mcp__kimi-cu__*` 缺失或连接失败时先调 `kimi_cu_status`，把安装或修复步骤转告用户，不要在缺装时假装能操作。

## 限制

- **桌面操作是独占能力**：槽位被其他后端占用时会显示冲突。对方释放后，可点「重新检测」补连。
- **一条连接服务所有 session**：macOS 的持久 JS 变量、句柄和 reset 在会话间共享，`scope:"cell"` 也能读取已有持久变量；多个 session 必须错开操作，无法保证会话隔离。
- **服务权限诊断**：服务不可达时使用 `xpc-ping` 检查后台 Service 的状态与权限。
- **安装与升级**：首次安装由用户执行安装命令；macOS 官方启动脚本在 App 版本过低时可能自动执行升级。系统权限由用户授予。
- **更新超时只放弃等待**：5 分钟到点后卡片报超时，子进程可能仍在跑。
- **平台不受支持时不连**：卡片说明一句，不注册 MCP，模型看不到 `mcp__kimi-cu__*`。
- **Windows 使用前台真实输入**：会短暂占用鼠标键盘；具体工具以已连接服务的 schema 为准。
- **技能目录按包名解析**：bundle patch 里不能写相对路径。

## 验证

```sh
cd plugins/dsh-kimi-cu && pnpm check
```

`check` 链上每一步：

- `typecheck`：`src` 的类型闸门。
- `smoke-host.mjs`：真 cordis + 真 `ToolRuntime`，断言插件名与 `inject`、`kimi_cu_status` 的注册与执行、返回的状态形状、两条 `/api` 路由路径，以及 patch 的三条装配行与「MCP 连接不写静态行」。
- `smoke-client.mjs`：按 Web shell 的方式装载浏览器 bundle，断言包 id 自注册、`inject` 与真正读的服务一致、字典键集中英对齐、状态卡注册在 `plugins.bundle.config` 且 key 是包名，以及未声明服务的读取会抛。
- `test-exclusivity.mjs`：用可注入的 `fakeDetect` 验独占槽位（没有 `computerUse` 时照常注册、槽位空着时先占位再注册、被别的后端占着时不注册也不顶掉、占位后别人再注册被拒），不读真探测器。
- `test-status.mjs`：检测的纯逻辑（缓存与单飞、`refresh` 绕过缓存、两平台的路径公式、覆盖值与旧目录的附注）。
- `test-update.mjs`：更新链路（清单解析、版本比较、阶段映射、失败分类、单飞锁与超时），以及真实 Connection 对匿名、普通认证与 owner 请求的准入。
- `test-card.mjs`：用真 react 把状态卡画进 jsdom（四种状态、安装块、检查项、更新按钮的四种文案、失败与原始输出）。
- `assert:lib-untracked.mjs`：`lib/` 是构建产物镜像，不入 git。
- `check-bundle.mjs`：清单面、文本面与契约面（内核真 `Config` schema、两平台分支、技能目录）。
- `tools/probes/preset-skills.mjs` 各跑一次 `skills/macos` 与 `skills/windows`：随包技能能被内核的技能发现机制找到。

浏览器里打开插件详情页，确认卡片与当前安装、权限和 MCP 状态一致，并验证「重新检测」能更新状态。宿主装载由 `node tools/host-smoke.mjs` 验证。

## 上游

- KimiCU（Kimi Computer Use）由 Moonshot AI 提供，许可 `Proprietary`。本包只接本机装的 KimiCU MCP 服务与官方更新通道，不重新分发 app；两份 `kimi-cu` 技能正文写在本仓库，按两个平台各自的工具面维护。
- 官方 macOS 插件包 `https://cdn.kimi.com/kimi-computer-use/latest/kimi-cu-plugin.zip` 提供 CodeAct 技能与启动脚本；本包的 macOS 技能按其工具面自行维护。
- macOS 使用 App 内的官方 `Contents/Resources/kimi-cu-mcp` 启动 CodeAct；Windows 使用 `kimi-cu.exe mcp`。实际工具取决于安装的服务版本。
- 安装命令与更新清单：macOS `https://cdn.kimi.com/kimi-computer-use/latest/setup_macos.sh`、`https://cdn.kimi.com/kimi-computer-use/latest/version.json`；Windows `https://cdn.kimi.com/kimi-computer-use-windows/latest/setup_windows.ps1`、`https://cdn.kimi.com/kimi-computer-use-windows/latest/version.json`。
- 上游文档：`https://www.kimi.com/code/docs/kimi-code-cli/customization/plugins.html`（英文版在 `/en/` 下同名路径）。
