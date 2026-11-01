# @lynn123411/dsh-kimi-cu

把本机装的 KimiCU 接进 DSH：它的 `mcp -s user` 服务变成模型可以直接调用的 `mcp__kimi-cu__*` 工具，同时随包带一份操作桌面界面用的 `kimi-cu` 技能。插件本体没有一行自有代码——两件事都落在同一条 bundle patch 的两行里，挂的都是内核现成的包。

## 功能

- **读写本机 app 界面**：模型能看到并操作 macOS 上已打开的应用窗口——观察无障碍树与截图、点击、输入、滚动、拖拽，以及列出应用和窗口。
- **随包带操作技能**：`kimi-cu` 技能说明怎么绑定目标窗口、什么时候重新观察、坐标与 index 怎么用、投递成功与真的生效怎么区分，也写明 DSH 里的工具前缀、窗口级工具与前台操作的边界；模型按技能里的规则调用上面那些工具。

## 特性

- **两行都是内核自带的包**：MCP 那行挂 `@deepseek-ai/dsh-mcp-client`，技能那行挂 `@deepseek-ai/dsh-skill-filesystem`。本包只负责声明配置、带技能文件与自检。
- **只在 macOS 上生效**：KimiCU 只有 macOS 版，两行都写着 `disabled: !!js process.platform !== 'darwin'`，别的平台上插件装上也不启动任何一行。
- **连不上就当场报错**：MCP 那行 `failOnStartupError: true`，二进制不在 `/Applications/KimiCU.app/Contents/MacOS/kimi-cu` 或 `mcp` 子命令没有响应时，那一行激活失败并报错，而不是静默少掉一整排工具。代价是这条连接的重连监督器一并销毁：把 KimiCU 打开之后，要在插件页里关一次再开一次（或重启）才会重连。宿主本身照常启动。
- **长任务按 5 分钟计**：MCP 那行把单次工具调用上限设成 5 分钟，`js` 里的循环和批量操作不会在内核默认的 60 秒被客户端取消。
- **工具面不裁剪**：KimiCU 列出的工具全部露出，包括窗口级观察、后台启动与排障入口；调用边界由随包技能写明，`activate_window` 只在用户明确要求切前台时使用，`debug_tap` 只用于排障。
- **一条连接服务所有 session**：两行都在根层，宿主只起一个 KimiCU MCP 连接，快照与 index 缓存是连接级的；两个 session 同时操作同一个应用时要错开，技能要求每次动作前重新观察。
- **技能行另立门户**：`providerName: kimi-cu` + `includeDefaultRoots: false`，只扫本包的 `skills/`；项目与用户技能目录仍归内核那条默认行，两边互不覆盖，同名技能也不会互相顶掉。
- **技能目录按包名解析**：bundle patch 的 `!!js` 以 profile 目录为 `baseUrl`，所以技能路径用 `createRequire(baseUrl).resolve('@lynn123411/dsh-kimi-cu/package.json')` 算成绝对路径，而不是相对路径。
- **装完即生效**：两行都在根层，profile 里每个 preset 的 agent 都看得见这批工具与这个技能；改过 patch 之后要触发一次重新组合才换配置（带 `hmr` 的 Web profile 在插件页开关一次即可）。
- **自检盯着内核契约**：`pnpm check` 用内核自带 include 的 YAML 方言读这份 patch，拿内核两个包的真 `Config` schema 校验两行配置，再照 Loader 的方式求值一遍技能目录那条表达式；随包技能的真发现与真装载交给 `tools/probes/preset-skills.mjs`。装配、验证与实测记录见 [DETAILS.md](./DETAILS.md)。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-kimi-cu
```
