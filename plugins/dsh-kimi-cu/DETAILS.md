# @lynn123411/dsh-kimi-cu 装配与验证

写给维护者。用户面向的说明在 [README.md](./README.md)。

## 五行落在哪

`cordis.patch.yml` 只有一层 `insert`，五行都在根层：

| 行 id | 挂的包 | 作用 |
| --- | --- | --- |
| `dsh-kimi-cu` | 本包 | 宿主半边（`kimi_cu_status` 工具 + `/api/dsh-kimi-cu/status` 路由）与浏览器半边（插件页状态卡） |
| `mcp-kimi-cu-macos` | `@deepseek-ai/dsh-mcp-client` | stdio 连 `/Applications/KimiCU.app/Contents/MacOS/kimi-cu mcp -s user` |
| `mcp-kimi-cu-windows` | `@deepseek-ai/dsh-mcp-client` | stdio 连 `%LOCALAPPDATA%\Kimi Computer Use\kimi-cu.exe mcp`（`KIMI_CU_WINDOWS_EXE` 可覆盖） |
| `skill-kimi-cu-macos` | `@deepseek-ai/dsh-skill-filesystem` | 只扫本包 `skills/macos` |
| `skill-kimi-cu-windows` | `@deepseek-ai/dsh-skill-filesystem` | 只扫本包 `skills/windows` |

根层的意思是「进全局层」：profile 里每个 preset 的 agent 都能看到这批工具与这个技能。`dsh plugin --profile web add` 之后，本包名同时进 profile 的 `dependencies` 与 `dsh.profile.bundles`，`dsh.bundle.patch` 声明的这份 patch 随即并入层栈。

## 为什么 MCP 要按平台分两条

KimiCU 在 macOS 与 Windows 是两条产品线：macOS 只有 app 包，命令是 app 内的二进制，参数 `mcp -s user`；Windows 只有独立 runtime，默认装在 `%LOCALAPPDATA%\Kimi Computer Use`（0.3.8 起；旧目录 `%LOCALAPPDATA%\KimiCU` 由安装器建 junction 兼容），参数只有 `mcp`。两条行共用 `serverName: kimi-cu`，平台守卫保证同一时刻只有一条启用，模型看到的仍是 `mcp__kimi-cu__*`。

Windows 走的是旧 13 工具 MCP，不是上游主推的 code-mode 插件：code-mode 要求用户先装 Kimi Code 插件包、宿主 PATH 有 Node 24.15+，与本插件「装完即用」的目标冲突；旧 MCP 由 runtime 自带，不需要 Node，工具面与 macOS 同族。

## 为什么技能也按平台分两条

两份技能的工具面与操作语义不同：macOS 是后台静默、AX 树、`paste` / `drag_paths` / `js`；Windows 是前台真实输入、UIA 树、`turn_ended`，没有 `paste` / `drag_paths` / `js`。合成一份会让模型在错误的平台上调用不存在的工具，所以各扫各的目录，技能名都叫 `kimi-cu`。

## 检测与引导

宿主半边在 `src/server/`：

- `resolve.ts`：纯函数，解析安装位置与安装计划；与 patch 里的平台表达式共用同一套规则（`check-bundle` 会断言两边一致）。
- `doctor.ts`：跑 `kimi-cu doctor` 并解析。macOS 解析 `✅`/`❌` 行；Windows 解析 `version=` 与 `mcp=true`。
- `status.ts`：把上面两样合成 `KimiCuStatus`，缓存 10 秒、并发单飞、`refresh` 绕过缓存；所有失败落进状态字段，不抛。探测整体失败时返回 `notes: ['detection-failed']` 的状态，路由与工具拿到的是状态而不是异常。

Windows 的路径公式在 patch 表达式与 `resolve.ts` 的 `windowsMcpCommand` 里各有一份，必须逐字一致；`test-status` 与 `check-bundle` 会逐 env 断言。覆盖值存在时只用覆盖值，不回退到默认/旧目录；旧目录安装会同时标 `legacy-install` 与 `mcp-command-missing`，卡片按「未就绪」处理，不会在 MCP 行启动的文件不存在时报「已就绪」。

浏览器半边在 `src/client/`：注册 `plugins.bundle.config`（key 是包名），卡片按「未安装 / 未就绪 / 已就绪 / 不支持」四种状态渲染，给官方命令、复制、重新检测与文档链接。卡片只给命令，不执行安装脚本。

`kimi_cu_status` 工具返回同一份 JSON；MCP 工具缺失或连接失败时，技能要求模型先查它，再把安装/修复步骤转告用户。

## 为什么卡片不自动执行安装

- 宿主静默执行远程脚本会绕过 DSH 的审批模型：安装器从 CDN 下载并替换运行时，失败时难以回滚。
- macOS 安装器需要交互式权限授予（辅助功能、屏幕录制），后台执行拿不到用户在系统设置里的确认。
- Windows 安装器会替换正在使用的运行时；如果宿主正连着它，更新与连接状态都会被打断。
- 因此卡片只给官方命令与复制，由用户在终端里执行；装好后按提示开关插件。

## 为什么 MCP 那行要 failOnStartupError: true

KimiCU 的二进制不在 PATH 上。不设 `failOnStartupError` 时，初次连不上只写一行日志，模型看不到任何工具——用户侧的表现是「插件装了但没用」。设成 `true` 让那一行的 fiber 在激活时回滚并报错，故障当场看得见。

代价要讲清楚：激活失败会连带销毁这条连接的重连监督器，所以装好 KimiCU 之后，要在插件页里把这个插件关一次再开一次（或重启），那一行才会重新连。宿主本身照常启动：`mcp-kimi-cu-*` 不在内核的必需启动行清单里。

## 为什么把工具调用上限设成 5 分钟

内核 `mcp-client` 的默认值是 60 秒。KimiCU 的 `js` cell 可以跑循环和批量操作，超过 60 秒会被客户端取消。5 分钟覆盖常见的批量；更长的任务拆成多个 cell。

## 一条连接服务所有 session

两条 MCP 行都在根层，宿主只起一个 KimiCU MCP 连接，所有 session 共用。KimiCU 的快照与 index 缓存是连接级的：两个 session 同时操作同一个应用，后一次观察会顶掉前一次的参照。技能要求每次动作前重新观察。

## 技能目录为什么不能写相对路径

bundle patch 里的 `!!js` 表达式以**声明这份 patch 的那棵树**的 `baseUrl` 求值；对 bundle 层来说那是 profile 目录。所以技能目录写成先按包名解析出包目录、再拼 `skills/<platform>`。

## 随包技能从哪来

`skills/macos/kimi-cu/SKILL.md` 以 KimiCU 自带技能为底稿，另加 DSH 适配（工具前缀、窗口级工具、`activate_window` / `debug_tap` 的边界、`kimi_cu_status`）。`skills/windows/kimi-cu/SKILL.md` 按 Windows runtime 的旧 13 工具 MCP 与官方 `INSTALL.md` 写。上游改了要人工同步一次。

## 验证

包目录里跑 `pnpm check`，它由这几段组成：

1. `pnpm typecheck`。
2. `pnpm test`：构建 + `smoke-host`（真 cordis + 真 ToolRuntime）+ `smoke-client`（假 Web shell）+ `test-status`（纯逻辑）+ `test-card`（jsdom 渲染）。
3. `assert:lib-untracked`。
4. `check-bundle.mjs`：清单面、文本面与契约面（内核真 `Config` schema、两平台分支、技能目录）。
5. `tools/probes/preset-skills.mjs --skills skills/macos` 与 `--skills skills/windows`。

仓库级一次跑齐用 `node tools/check.mjs`；真装载用 `node tools/host-smoke.mjs`。

## 实测记录

- 2026-11-08，内核 0.2.2-rc.1，macOS：`pnpm check` 全通过（typecheck、4 个测试脚本、check-bundle 16 条、两个技能根的 probe）；`kimi-cu doctor` 五项全绿，`kimi_cu_status` 返回 0.6.8 与已就绪。
- 2026-11-08，内核 0.2.2-rc.1，macOS：`node tools/host-smoke.mjs` 装载通过，插件页能取到本包的 `client.js`。
- Windows 真机验收待补：卡片未安装 → 运行官方命令 → 重新检测 → 开关插件 → `mcp__kimi-cu__*` 工具出现 → `list_apps` 可用。
