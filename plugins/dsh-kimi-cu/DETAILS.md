# @lynn123411/dsh-kimi-cu 装配与验证

写给维护者。用户面向的说明在 [README.md](./README.md)。

## 三行落在哪

`cordis.patch.yml` 只有一层 `insert`，三行都在根层：

| 行 id | 挂的包 | 作用 |
| --- | --- | --- |
| `dsh-kimi-cu` | 本包 | 宿主半边（`kimi_cu_status` 工具 + `/api/dsh-kimi-cu/status` 与 `/api/dsh-kimi-cu/update` 两条路由 + MCP 注册）与浏览器半边（插件页状态卡） |
| `skill-kimi-cu-macos` | `@deepseek-ai/dsh-skill-filesystem` | 只扫本包 `skills/macos` |
| `skill-kimi-cu-windows` | `@deepseek-ai/dsh-skill-filesystem` | 只扫本包 `skills/windows` |

根层的意思是「进全局层」：profile 里每个 preset 的 agent 都能看到这批工具与这个技能。`dsh plugin --profile web add` 之后，本包名同时进 profile 的 `dependencies` 与 `dsh.profile.bundles`，`dsh.bundle.patch` 声明的这份 patch 随即并入层栈。

## MCP 连接为什么不在 patch 里

宿主半边探测到可执行文件之后调用 `mcpManager.register('kimi-cu', …)`，命令与参数取自同一次探测。这样只有一处决定「连什么」：状态卡、`kimi_cu_status` 与真正的连接都读 `resolve.ts` 的同一份结果，不会出现 patch 表达式与检测逻辑各写一遍、改一处忘另一处的漂移。

管理器还统一提供连接状态、重启与探测，KimiCU 的连接因此出现在与其他 MCP 服务器同一张表里。管理器缺失时 `ctx.inject(['mcpManager'])` 整块不激活，插件其余部分照常加载，只是没有 `mcp__kimi-cu__*` 工具。

## 为什么要占桌面操作的独占槽位

宿主把「控制桌面」当成独占能力：`@deepseek-ai/dsh-computer-use` 只放行一个提供方，第二个 `computerUse.register()` 直接抛错并报出已占位的名字。官方 CUA 与 Cua Driver 都经这个登记占位。

KimiCU 同样是桌面操作后端，但它的工具走 MCP，宿主看不见它在控制桌面。所以本插件也占位（名字 `kimi-cu`），并且**占到了才注册 MCP 连接**：槽位已被别的后端占着时不抢、也不交出工具，只写一条 warning。两套后端同时控制同一台机器，比少一套工具更危险。

两个可选服务谁先到不确定，所以注册动作收在 `syncMcp()` 里：条件齐了才动手，条件变了再算一次。组合里没有 `computerUse` 服务时行为不变，照常注册。槽位后来空出来要重启 DSH 才会补位——宿主的登记没有变更事件可订阅。

## 为什么 MCP 要按平台分

KimiCU 在 macOS 与 Windows 是两条产品线：macOS 只有 app 包，命令是 app 内的二进制，参数 `mcp -s user`；Windows 只有独立 runtime，默认装在 `%LOCALAPPDATA%\Kimi Computer Use`（0.3.8 起；旧目录 `%LOCALAPPDATA%\KimiCU` 由安装器建 junction 兼容），参数只有 `mcp`。平台判断在 `resolve.ts`：不受支持的平台给出 `mcp: null`，宿主半边就不注册，模型看到的仍是 `mcp__kimi-cu__*`。

Windows 走的是旧 13 工具 MCP，不是上游主推的 code-mode 插件：code-mode 要求用户先装 Kimi Code 插件包、宿主 PATH 有 Node 24.15+，与本插件「装完即用」的目标冲突；旧 MCP 由 runtime 自带，不需要 Node，工具面与 macOS 同族。

## 为什么技能也按平台分两条

两份技能的工具面与操作语义不同：macOS 是后台静默、AX 树、`paste` / `drag_paths` / `js`；Windows 是前台真实输入、UIA 树、`turn_ended`，没有 `paste` / `drag_paths` / `js`。合成一份会让模型在错误的平台上调用不存在的工具，所以各扫各的目录，技能名都叫 `kimi-cu`。

## 检测与引导

宿主半边在 `src/server/`：

- `resolve.ts`：纯函数，解析安装位置、MCP 命令与安装计划；MCP 注册与状态卡都读它这一份（`check-bundle` 会逐平台断言）。
- `doctor.ts`：跑 `kimi-cu doctor` 并解析。macOS 解析 `✅`/`❌` 行；Windows 解析 `version=` 与 `mcp=true`。
- `status.ts`：把上面两样合成 `KimiCuStatus`，缓存 10 秒、并发单飞、`refresh` 绕过缓存；所有失败落进状态字段，不抛。探测整体失败时返回 `notes: ['detection-failed']` 的状态，路由与工具拿到的是状态而不是异常。

Windows 的路径公式只在 `resolve.ts` 的 `windowsMcpCommand` 里有一份；`test-status` 与 `check-bundle` 会逐 env 断言。覆盖值存在时只用覆盖值，不回退到默认/旧目录；旧目录安装会同时标 `legacy-install` 与 `mcp-command-missing`，卡片按「本机检查未通过」处理，不会在连接指向的文件不存在时报「本机检查通过」。

浏览器半边在 `src/client/`：注册 `plugins.bundle.config`（key 是包名），卡片按「未安装 / 本机检查未通过 / 本机检查通过 / 不支持」四种状态渲染，给官方命令、复制、重新检测与文档链接。卡片只给安装命令，不执行安装脚本；已安装时版本行右侧多一个更新按钮，它只触发 KimiCU 自己的 `upgrade`。

`kimi_cu_status` 工具返回同一份 JSON；MCP 工具缺失或连接失败时，技能要求模型先查它，再把安装/修复步骤转告用户。

## 为什么安装不执行、更新却执行

- 安装器需要交互式权限授予：macOS 的辅助功能与屏幕录制只能在系统设置里由用户确认，后台执行拿不到。所以安装只给官方命令与复制，由用户在终端里执行。
- 更新走 KimiCU 自带的 `upgrade`：它自己下载、校验 SHA-256 与 Apple 公证或 Authenticode、替换安装、重启服务并自检，失败回滚；不需要交互式密码，也不要求退出 app。
- 因此更新可以由卡片触发，安装仍只给命令。装好后按提示开关插件。

## 更新链路

宿主半边在 `src/server/`：

- `update.ts`：清单解析、按数字段比版本、`==>` 行映射阶段、失败分类，以及带单飞锁的更新器。
- `update-runtime.ts`：读清单（5 秒超时）与跑 `upgrade` 子进程并逐行回调。
- `update-router.ts`：`GET /api/dsh-kimi-cu/update` 返回检查结果，`POST` 返回 NDJSON 事件流。

macOS 与 Windows 各有一份更新清单，版本号互不可比：macOS 读 `kimi-computer-use/latest/version.json`，Windows 读 `kimi-computer-use-windows/latest/version.json`。页面打开时静默读一次清单（与本地检测解耦），只用来决定按钮文案；点按钮时服务端重新比对，已是最新就直接返回，否则执行。

- **命令**：macOS 跑 `kimi-cu upgrade`（不带版本号，让 KimiCU 自己判断）；Windows 的 `upgrade` 必须带目标版本，所以传清单里的版本号。
- **清单读不到**：macOS 照常跑，交给 KimiCU 判断；Windows 报网络错误，不执行。
- **阶段**：`==>` 开头的行映射成「正在下载／校验／替换／重连」，认不出的行保持上一个阶段。
- **失败分类**：只看错误行（跳过 `==>` 与 `✓` 进度行），分网络、校验失败、权限不足、已有升级在跑、超时五类，另有 unknown 兜底。
- **单飞锁与超时**：同一时刻只允许一次更新；5 分钟超时只放弃等待，不 kill 子进程，锁留到它真的退出。
- **重连**：升级后读到新版本号才调 `mcpManager.restart('kimi-cu')`；重启失败时卡片提示重启 DSH。

## 连不上时看什么

KimiCU 的二进制不在 PATH 上，所以「装了但没连上」是常见状态。三条信号各管一段：

- 插件启动时探测一次，缺装就写一条带官方安装命令的 warning；
- `kimi_cu_status` 工具随时可查，返回安装位置、版本、`doctor` 结果与安装计划；
- 宿主的 `mcpManager` 记录这条连接的状态，重启与探测都在它那一处。

注册发生在探测之后，所以装好 KimiCU 之后要在插件页里把本插件关一次再开一次（或重启），注册才会重新跑一次。

## 为什么把工具调用上限设成 5 分钟

内核 `mcp-client` 的默认值是 60 秒。KimiCU 的 `js` cell 可以跑循环和批量操作，超过 60 秒会被客户端取消。5 分钟覆盖常见的批量；更长的任务拆成多个 cell。

## 一条连接服务所有 session

宿主只起一个 KimiCU MCP 连接，所有 session 共用。KimiCU 的快照与 index 缓存是连接级的：两个 session 同时操作同一个应用，后一次观察会顶掉前一次的参照。技能要求每次动作前重新观察。

## 技能目录为什么不能写相对路径

bundle patch 里的 `!!js` 表达式以**声明这份 patch 的那棵树**的 `baseUrl` 求值；对 bundle 层来说那是 profile 目录。所以技能目录写成先按包名解析出包目录、再拼 `skills/<platform>`。

## 随包技能从哪来

`skills/macos/kimi-cu/SKILL.md` 以 KimiCU 自带技能为底稿，另加 DSH 适配（工具前缀、窗口级工具、`activate_window` / `debug_tap` 的边界、`kimi_cu_status`）。`skills/windows/kimi-cu/SKILL.md` 按 Windows runtime 的旧 13 工具 MCP 与官方 `INSTALL.md` 写。上游改了要人工同步一次。

## 验证

包目录里跑 `pnpm check`，它由这几段组成：

1. `pnpm typecheck`。
2. `pnpm test`：构建 + `smoke-host`（真 cordis + 真 ToolRuntime）+ `smoke-client`（假 Web shell）+ `test-status`（纯逻辑）+ `test-update`（更新链路纯逻辑与更新器行为）+ `test-card`（jsdom 渲染）。
3. `assert:lib-untracked`。
4. `check-bundle.mjs`：清单面、文本面与契约面（内核真 `Config` schema、两平台分支、技能目录）。
5. `tools/probes/preset-skills.mjs --skills skills/macos` 与 `--skills skills/windows`。

仓库级一次跑齐用 `node tools/check.mjs`；真装载用 `node tools/host-smoke.mjs`。

## 实测记录

- 2026-11-08，内核 0.2.2-rc.1，macOS：`pnpm check` 全通过（typecheck、4 个测试脚本、check-bundle 16 条、两个技能根的 probe）；`kimi-cu doctor` 五项全绿，`kimi_cu_status` 返回 0.6.8 与已就绪。
- 2026-11-08，内核 0.2.2-rc.1，macOS：`node tools/host-smoke.mjs` 装载通过，插件页能取到本包的 `client.js`。
- 2026-11-13，内核 0.2.2-rc.3，macOS：`pnpm check` 全通过（typecheck、6 个测试脚本、check-bundle 13 条、两个技能根的 probe）。
- 2026-11-13，真机更新链路：清单检查得出 0.7.5 已是最新，`run()` 直接返回 upToDate；`upgrade --force-reinstall` 6.7 秒退出 0，走完下载、签名与公证校验、替换与重启服务，`==>` 行依次映射到 checking、downloading、verifying，签名通过后映射到 installing；装完仍是 0.7.5，`doctor` 五项全绿，服务仍 enabled，`mcp__kimi-cu__*` 连接未中断。
- Windows 真机验收待补：卡片未安装 → 运行官方命令 → 重新检测 → 开关插件 → `mcp__kimi-cu__*` 工具出现 → `list_apps` 可用。
