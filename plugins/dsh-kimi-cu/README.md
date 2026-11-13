# @lynn123411/dsh-kimi-cu

把本机装的 KimiCU（macOS / Windows）接进 DSH：它的 MCP 服务变成模型可以直接调用的 `mcp__kimi-cu__*` 工具，随包带一份操作桌面的 `kimi-cu` 技能；插件页还会检测 KimiCU 是否装好、给出对应平台的官方安装命令，并在装好之后把 KimiCU 更新到最新。

## 功能

- **读写本机 app 界面**：模型能看到并操作已打开的应用窗口——观察、点击、输入、滚动、拖拽，以及列出应用和窗口。macOS 走后台静默操作；Windows 走前台真实输入，会短暂占用鼠标键盘。
- **安装检测与引导**：插件页详情页的状态卡显示「未安装 / 已安装但本机检查未通过 / 本机检查通过」，给出当前平台的官方安装命令、复制按钮与重新检测；模型也可以用 `kimi_cu_status` 工具查同样的状态。
- **一键更新**：卡片读 KimiCU 官方的更新清单，有新版时按钮显示「更新到 x.y.z」；点一下由 KimiCU 自己的 `upgrade` 通道下载、校验签名并替换安装，过程中显示阶段文字，完成后就地更新版本号并重连 MCP。
- **随包带操作技能**：`kimi-cu` 技能说明怎么绑定目标窗口、什么时候重新观察、坐标与 index 怎么用、投递成功与真的生效怎么区分；macOS 与 Windows 各一份。

## 特性

- **装配按平台分流**：patch 里三条根层行——本包自己的宿主/浏览器半边、macOS 技能行、Windows 技能行；平台守卫保证同一时刻只有一条技能行启用。MCP 连接不占 patch 行，由宿主半边按探测结果注册。
- **Windows 走旧 13 工具 MCP**：`kimi-cu.exe mcp`，不需要 Node；工具面与 macOS 同族，但没有 `paste`、`drag_paths`、`js`、`list_windows`、`get_window`，多一个 `turn_ended`。
- **检测只看本机事实**：二进制是否存在、版本号、`doctor` 结果；缓存 10 秒，并发调用共用一次探测，`refresh` 绕过缓存。`doctor` 只检查调用者上下文，所以「本机检查通过」不表示后台 Service 已就绪——服务权限要看 `xpc-ping`（见随包 macOS 技能）。
- **安装只给命令，更新交给 KimiCU 自己**：安装脚本不在插件里跑，卡片只给官方命令与复制；更新走 `kimi-cu upgrade`，下载、SHA-256 与签名校验、替换与回滚都由 KimiCU 完成，插件只负责触发、显示阶段与失败分类。装好后在插件页把本插件关一次再开一次（或重启 DSH）让 MCP 连接重建。
- **桌面操作是独占能力**：宿主只允许一个桌面操作后端，官方 CUA 与 Cua Driver 都经 `computerUse.register()` 占位。本插件同样占位（名字 `kimi-cu`），占到了才交出 `mcp__kimi-cu__*`；槽位已被别的后端占着时**不抢也不交出工具**，只写一条 warning——两套后端同时控制同一台机器比少一套工具更危险。组合里没有这个服务时行为不变。槽位后来空出来要重启 DSH 才会补位。
- **连不上有据可查**：MCP 连接由宿主的 `mcpManager` 管，连接状态、重启与探测都在它那一处；二进制缺失时插件启动会写一条带安装命令的 warning，`kimi_cu_status` 也照常回答。
- **长任务按 5 分钟计**：注册给管理器的条目把单次工具调用上限设成 5 分钟。
- **一条连接服务所有 session**：宿主只起一个 KimiCU MCP 连接；两个 session 同时操作同一个应用时要错开。
- **技能行另立门户**：`providerName: kimi-cu` + `includeDefaultRoots: false`，只扫本包对应平台的 `skills/`；项目与用户技能目录仍归内核那条默认行。
- **技能目录按包名解析**：bundle patch 的 `!!js` 以 profile 目录为 `baseUrl`，所以技能路径用 `createRequire(baseUrl).resolve(...)` 算成绝对路径。
- **自检盯着内核契约**：`pnpm check` 用内核自带 include 的 YAML 方言读 patch，拿内核 `skill-filesystem` 的真 `Config` schema 校验两条技能行，再照 Loader 的方式求值技能目录表达式；MCP 注册那条链断言命令取自探测器、管理器走可选注入；更新链路由 `test-update` 盯住清单解析、版本比较、阶段映射、失败分类、单飞锁与超时；随包技能的真发现与真装载交给 `tools/probes/preset-skills.mjs`。装配、验证与实测记录见 [DETAILS.md](./DETAILS.md)。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-kimi-cu
```

首次使用前需要先安装 KimiCU；装好插件后打开插件页的详情页，状态卡会给出当前平台的官方安装命令。
