# @lynn123411/dsh-browseros-neo

[BrowserOS neo](https://docs.browseros.com/neo)（agent 专用浏览器）的 DSH 一键接入插件。DSH 原生自带 MCP 客户端桥 [@deepseek-ai/dsh-mcp-client](https://github.com/deepseek-ai/deepseek-harness)，本插件不重复造轮子、也不改官方桥的任何配置语义——它只是把「接入 BrowserOS neo」这件事变成装完即用：自动解析真实端点、Neo 后开自动挂载、模型还能自己后台唤醒 Neo。安装后 Neo 的 20 个浏览器工具以 `mcp__browseros-neo__*` 出现，与 Claude Code / Codex 等官方一键接入的 harness 完全同名同形。

## 特性

- **零配置桥接**：装完即在宿主内挂载官方 `dsh-mcp-client`（streamable-http，`serverName: browseros-neo`），工具名 `mcp__browseros-neo__snapshot / act / read / run …`；官方设计保持原样，超时等参数一概用官方默认值。
- **真实端口自动解析**：BrowserOS neo 的 MCP 端口不一定是文档写的 9200——插件从 neo 自己的 `~/.browserclaw/runtime.json` 读实际端点（本机实测为 9010），文件缺失才回退 `http://127.0.0.1:9200/mcp`。
- **单一生命周期状态机（v0.7）**：模型每次调用 neo 工具都经过 DSH 官方环绕水位线 `tools/execute`（调度器文档点名用于 retry 中间件的接缝）。插件在此跑一个状态机：就绪预检（Neo 死了就地后台拉起并等就绪 ≤40s，冷启动后第一次调用是「慢几秒的成功」而非报错）→ 派发 → 失败签名分类 → 修复（僵尸会话重建 / 零窗口 reopen / 冷启动）→ **同一次调用内重放一次** → 仅重放仍败才在结果上追加指引。僵尸与窗口类失败从未到达浏览器动作层，重放无双重动作风险；未就绪时的合成错误结果与 `tools/pre-execute` deny 物化同构（`normalizeDispatchResult` 对 error 结果原样放行）。生命周期错误对模型基本不可见。
- **Neo 后开兜底**：官方桥的自动重连只有约 10 次机会（~2.5 分钟），用完即放弃并注销全部工具直到重启 DSH。监督 tick 每 30 秒探测端点，Neo 起来（down→up 边沿）或端口变化时自动重挂载——只管「桥还没挂上」的存在性场景（没有任何调用可拦时唯一能挂载的机制）。
- **模型可自启 / 补窗口 / 刷新会话（macOS）**：`browseros_neo_launch` 是状态机之上的薄壳——模型主动唤醒并阻塞等待时用：① Neo 没跑 → 后台拉起（`open -g`，不抢焦点）；② 在跑但零窗口 → macOS reopen（等价点 Dock 图标）补开窗口；③ 一切正常 → 刷新桥会话后返回。就绪判定 = 端点应答 + 至少一个浏览器窗口 + 桥会话对当前进程有效；设置页「立即重连」直接重建会话。同时把 Neo 自动安装的官方 skill（`~/.agents/skills/browseros-neo`）Failure 段做了一句最小改动来指向该工具，并用 `chflags uchg` 锁定防被 Neo 回写（解锁：`chflags -R nouchg ~/.agents/skills/browseros-neo`）。
- **设置页三件套**：设置 › Browser Neo（侧栏 `order: 140`）——启用开关、端点/连接状态行、「立即重连」按钮；状态经宿主路由 `/api/dsh-browseros-neo` 每 4 秒轮询。
- **可完全关闭**：开关停用后卸载桥、工具消失；监视与探测全部随插件 fiber 生命周期清理。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-browseros-neo
```

（DSH Desktop 桌面应用用 `--profile desktop`；profile 装错不生效，多个入口需分别安装。装完重启 DSH 生效，需要机器上已安装 [BrowserOS neo](https://www.browseros.com/neo)。）

从本仓库源码本地安装 / 联调：

```bash
# 1) 落位到 web profile（无构建链，直接拷贝）
mkdir -p ~/.dsh/profiles/web/node_modules/@lynn123411/dsh-browseros-neo
cd plugins/dsh-browseros-neo
cp -R lib cordis.patch.yml package.json README.md LICENSE \
  ~/.dsh/profiles/web/node_modules/@lynn123411/dsh-browseros-neo/
# 2) 在 ~/.dsh/profiles/web/package.json 的 dependencies 与 dsh.profile.bundles
#    中登记 "@lynn123411/dsh-browseros-neo" 后重启 dsh web
# 3) 官方 skill 的 launch 引导改写 + 锁定（一次性）：
#    编辑 ~/.agents/skills/browseros-neo/SKILL.md 的「## Failure」段后执行
chflags uchg ~/.agents/skills/browseros-neo/SKILL.md
```
