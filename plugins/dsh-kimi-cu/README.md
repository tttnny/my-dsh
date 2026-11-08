# @lynn123411/dsh-kimi-cu

把本机装的 KimiCU（macOS / Windows）接进 DSH：它的 MCP 服务变成模型可以直接调用的 `mcp__kimi-cu__*` 工具，随包带一份操作桌面的 `kimi-cu` 技能；插件页还会检测 KimiCU 是否装好，并给出对应平台的官方安装命令。

## 功能

- **读写本机 app 界面**：模型能看到并操作已打开的应用窗口——观察、点击、输入、滚动、拖拽，以及列出应用和窗口。macOS 走后台静默操作；Windows 走前台真实输入，会短暂占用鼠标键盘。
- **安装检测与引导**：插件页详情页的状态卡显示「未安装 / 已安装但未就绪 / 已就绪」，给出当前平台的官方安装命令、复制按钮与重新检测；模型也可以用 `kimi_cu_status` 工具查同样的状态。
- **随包带操作技能**：`kimi-cu` 技能说明怎么绑定目标窗口、什么时候重新观察、坐标与 index 怎么用、投递成功与真的生效怎么区分；macOS 与 Windows 各一份。

## 特性

- **装配按平台分流**：patch 里五条根层行——本包自己的宿主/浏览器半边、macOS MCP 行、Windows MCP 行、macOS 技能行、Windows 技能行；平台守卫保证同一时刻只有一条 MCP 行与一条技能行启用。
- **Windows 走旧 13 工具 MCP**：`kimi-cu.exe mcp`，不需要 Node；工具面与 macOS 同族，但没有 `paste`、`drag_paths`、`js`、`list_windows`、`get_window`，多一个 `turn_ended`。
- **检测只看本机事实**：二进制是否存在、版本号、`doctor` 结果；缓存 10 秒，并发调用共用一次探测，`refresh` 绕过缓存。
- **只给命令，不执行安装**：卡片给官方命令与复制，不静默运行远程脚本；装好后在插件页把本插件关一次再开一次（或重启 DSH）让 MCP 行重连。
- **连不上就当场报错**：MCP 行 `failOnStartupError: true`，二进制缺失或 `mcp` 子命令没响应时那一行激活失败并报错，而不是静默少掉一整排工具。
- **长任务按 5 分钟计**：MCP 行把单次工具调用上限设成 5 分钟。
- **一条连接服务所有 session**：MCP 行在根层，宿主只起一个 KimiCU MCP 连接；两个 session 同时操作同一个应用时要错开。
- **技能行另立门户**：`providerName: kimi-cu` + `includeDefaultRoots: false`，只扫本包对应平台的 `skills/`；项目与用户技能目录仍归内核那条默认行。
- **技能目录按包名解析**：bundle patch 的 `!!js` 以 profile 目录为 `baseUrl`，所以技能路径用 `createRequire(baseUrl).resolve(...)` 算成绝对路径。
- **自检盯着内核契约**：`pnpm check` 用内核自带 include 的 YAML 方言读 patch，拿内核两个包的真 `Config` schema 校验两条 MCP 行与两条技能行，再照 Loader 的方式求值技能目录表达式；随包技能的真发现与真装载交给 `tools/probes/preset-skills.mjs`。装配、验证与实测记录见 [DETAILS.md](./DETAILS.md)。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-kimi-cu
```

首次使用前需要先安装 KimiCU；装好插件后打开插件页的详情页，状态卡会给出当前平台的官方安装命令。
