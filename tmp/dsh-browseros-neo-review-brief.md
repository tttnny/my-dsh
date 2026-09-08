# dsh-browseros-neo 插件 · 需求→实现全景与评审简报

> 目的：供评审 AI 全面审查本插件的设计与实现。本文自包含（不依赖对话历史）。
> 版本：v0.6.0 · 日期：2026-09-09 · 平台：macOS / DSH web profile
> 源码真源：`plugins/dsh-browseros-neo/`（运行副本 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-browseros-neo/`，两者 diff 一致）

---

## 1. 需求

**一句话**：让 DSH（DeepSeek Harness，agent harness）里的模型能可靠地驱动 BrowserOS neo（一款"给 agent 用的第二个浏览器"，带用户真实登录态），且用户几乎无心智负担。

具体诉求（按优先级）：
1. 模型获得 neo 的全部浏览器工具（snapshot/act/read/run/tabs… 共 20 个），用于真实网页任务；
2. Neo 是桌面应用、用户随时开关——**插件必须让"Neo 没开/刚重启/开着但没窗口"都不成为任务障碍**；
3. 用户明确拍板：**模型应能自己拉起 Neo**（而不是提示人类去点开）；
4. 设计原则（用户定）：**官方组件的设计不随便动**——复用官方 MCP 桥、不改其参数语义、不 fork；
5. 交付形态：符合本仓库规范的 DSH 插件（`plugins/dsh-<name>/` + npm scope `@lynn123411/`）。

## 2. 环境与事实（评审前必读）

| 事实 | 证据/来源 |
|---|---|
| DSH 0.1.3-alpha.2 自带官方 MCP 桥 `@deepseek-ai/dsh-mcp-client`（默认不启用）；工具命名固定 `mcp__<serverName>__<rawName>`；只桥 tools | 包内 README.zh.md；launcher `.pnpm` store 实测 |
| 桥的已知行为：`failOnStartupError:false` 默认；重连指数退避 **maxAttempts=10（~4 分钟）后放弃**，直到重启/重载配置 | README 明文 |
| **关键缺口**：MCP spec（2025-06-18 Transports §Session Management 第 4 条）要求客户端收到会话 404 **MUST** 重新 initialize；官方 TS SDK 1.30.0 的 `streamableHttp.send()` 只特判 401/405，404 仅抛普通请求错误（`onerror` 不触发 `onclose`）→ 桥对"僵尸会话"**永不重连** | SDK 源码实测 + spec 原文 |
| Neo 的 MCP 端点：`~/.browserclaw/runtime.json` 的 `url` + `/mcp`（本机实测 **9010**，文档写 9200；端口会变） | 本机实测 |
| Neo 的 MCP **会话 = agent 身份**：`name_session` 命名、tab 组 `<client>/<name>`、cockpit 卡片、审计会话全部绑定在会话上 → **不能无状态 per-call 转发**（会把身份打碎） | Neo 工具面 + claw-server 日志 |
| Neo 进程活着 ≠ 可用：**零窗口时 MCP 照常应答**，但页面工具全报 `CDP error: No browser window available` / `No profile available`；macOS reopen（`open -b`，等价点 Dock）可补开窗口 | 实测截图 + claw-server 日志 |
| 错误文本会被 harness 本地化（如 "未找到：会话不存在" = Session not found）→ 签名匹配必须中英双覆盖 | 实测截图 |
| DSH 会话的**工具列表每轮开头快照一次**（`agent/pre-step` → `assembly.tools`）：轮中挂载的新工具下一轮才可见 | dsh-agent-loop 源码 |
| DSH 公开水位线：`tools/pre-execute`（allow/deny/ask 闸门，审批即挂在此处）、`tools/execute`（环绕派发，官方注释"for timeout, **retry**, or metrics"）、`tools/post-execute`（decision 可 accept+content 追加/block）；scope 过滤下插件 fiber ctx 无 tag → 可收全部派发（第三方 dsh-rewind-plugin 生产先例） | dsh-tools 源码/类型 |
| Neo 会自动给 6 家 harness 写 MCP 配置 + 把官方 skill 投放到 `~/.agents/skills/browseros-neo/`（DSH 会扫此标准根，所以 DSH 模型天然看得见它）；skill 通篇裸名（`snapshot`/`act`），而 DSH 侧实名 `mcp__browseros-neo__*` | skills.json / manifest.json 实测 |
| DSH 插件包可自带 `cordis.patch.yml`（`dsh.bundle.patch`）自挂载；**patch 层只认 id 覆盖或 `insert:` 列表，裸插件条目会被静默跳过**；浏览器半区发现依赖 `exports["./client"]`（缺失 → 整个 web boot 崩溃） | 本机踩坑实录 |

## 3. 决策记录（做了什么取舍、为什么）

**选定**：薄包装插件——插件内 `ctx.plugin(dshMcpClient, {...})` 挂载官方桥（不改桥、不改其默认参数），插件只做桥做不到的四件事：端点动态解析、生命周期自愈、模型自启 Neo、设置页。

**否决的备选**（评审时可挑战）：
- 自研 MCP client / 无状态 per-call 转发：违背"不重造官方件"原则 + 打破会话身份（§2）；
- 纯配置行（手写 `dsh-mcp-client` 一行）：无法解决端口漂移、10 次重试放弃、僵尸会话、模型自启；
- 常驻 daemon 中间层：复杂度搬家不是减少；
- 修上游（给 SDK/桥提 404 重连 issue）：**用户明确拒绝**，选择纯本地方案；
- 参照系 ego-lite（citrolabs/ego-lite）：skill+bash+浏览器内嵌 Node 运行时，无 MCP 无端口无会话僵尸，其 `browserCdp()` 自带 "Session lost → invalidate → 同调用内重试"。我们**采纳了它的重试模式**（落在 `tools/execute` 包装器），但无法整体照抄——Neo 不给浏览器内核侧权限，身份绑在 MCP 会话上。

**演进史**（每轮都是实测驱动）：v0.1 壳+监督 → v0.2 窗口级就绪（实测发现零窗口僵尸态）→ v0.3 PID 轮询核对（实测发现秒级重启漏边沿）→ v0.4 **删 PID 层**，改 `tools/post-execute` 绊线（事件驱动）→ v0.5 `tools/pre-execute` 预检闸门（消灭冷启动第一次失败）→ v0.6 `tools/execute` 透明重试（消灭僵尸的第一次失败）。

## 4. 架构：失败模式 × 防线矩阵

| # | 失败模式 | 防线 | 模型可见性 |
|---|---|---|---|
| F1 | 端点死（Neo 没开）时模型调用 | `tools/pre-execute` 闸门：probe→`open -g -b` 后台拉起→等端点+窗口（≤40s，并行共享 `wakePromise`）→放行原调用；超时→deny+可操作指引 | 第一次调用只是慢，不失败 |
| F2 | 僵尸会话（Neo 重启过，桥持旧会话 ID，全报 404） | `tools/execute` 包装器：失败结果命中僵尸签名→`healSession()`（dispose+重挂，5s 冷却）→**同调用内重放 `next()`**；重放仍败→原样返回给 F2' | 完全不可见（F2' 兜底） |
| F2' | 同上（兜底） | `tools/post-execute` 绊线：追加"已重建，请立即原样重试"提示（accept+content，不改 isError） | 一次带指引的失败 |
| F3 | 零窗口（MCP 活、页面工具全报 CDP 错） | 绊线识别→`wakeInBackground()`（probe 判 alive→`open -b` reopen）+提示 | 一次带指引的失败 |
| F4 | 桥未挂载时 Neo 后开 / 端口变化 | 监督 tick：30s probe（initialize+用完即 DELETE），down→up 边沿或 URL 变化→重挂载（覆盖官方桥 10 次放弃） | 不可见 |
| F5 | 用户主动控制 | 设置页三件套（启用开关→卸载/挂载；状态行 4s 轮询 `/api/dsh-browseros-neo/status`；「立即重连」=强制 `remountNow()`） | — |
| F6 | 模型主动唤醒/等待 | `browseros_neo_launch` 工具：三态（冷启/补窗/刷会话），就绪判定=端点应答+窗口数>0（经一次性诊断 MCP 会话 `windows list` 解析 `Found N windows`），15s 防抖，非 darwin 明确报错 | 结构化返回值 |
| G1 | 官方 skill 裸名误导 | 只改 Failure 段一句（指向 launch 工具+三种失败态+"下一轮出现"引导），文件+目录 `chflags uchg` 锁死防 Neo 回写 | — |
| G2 | 每轮工具快照 | launch/绊线提示文案明确"工具下一轮自动出现，勿兜底" | 文案引导 |

**核心原则落点**：官方桥零改动（挂载参数只有 serverName/transport/url/failOnStartupError=false，全按文档）；所有自愈都发生在 DSH 公开水位线与插件自有 fiber 内；探测永不启动 Neo（只有"模型调用"或"用户点击"才触发启动——尊重用户关着 Neo 的意图）。

## 5. 文件清单

```
plugins/dsh-browseros-neo/
├── lib/index.js        # 宿主半区（~700 行）：监督 tick、三道水位线（gate/tripwire/retry）、
│                       # launch 工具、/api 路由、ctx.plugin 挂桥、settings 命名空间
├── lib/client.js       # 浏览器半区：手写信封格式 window.__ModuleLoader__.load({id,factory})，
│                       # require('react') 取宿主共享实例；settings.section order=140
├── cordis.patch.yml    # `- insert:` 自挂载行（patch 层语义见 §2）
├── package.json        # dsh.bundle.patch + dsh.client{platform:web,immediately:true}
│                       # 桥等全部走 peerDependencies（宿主模块图解析，实测 OK）
├── README.md           # 仓库规范三段式 + 本地联调 + 解锁命令
└── LICENSE
外部一次性变更：~/.agents/skills/browseros-neo/SKILL.md（Failure 段一句改写 + uchg 锁定）
仓库登记：根 README 表（设备访问域）、docs/agents/settings-order.md（140 占位→150 空位）
```

关键实现细节（评审重点看这些函数）：
- `resolveEndpoint()`：runtime.json→`/mcp` 拼接，兜底 9200；
- `probe(url)`：单次 initialize 握手判活，`res.body.cancel()` + 补发 DELETE 防会话泄漏；
- `mcpToolCall` / `neoWindowCount`：一次性诊断会话调 `windows list`，正则解析窗口数；
- `tick()`：`ticking` 互斥；down 时**保留 fiber**（让桥自己重试），up 边沿/URL 变化/上轮失败才 dispose+重挂；
- `remountNow()`：先 dispose（5s 超时保护）再 await tick；
- `healSession()`：`remountNow` + 5s 冷却（并行失败只修一次）；
- `ensureNeoReady()`：快路径信任 tick 新鲜度（<30s 零开销），慢路径 probe→共享 wakePromise；
- `tools/execute` 包装器：先 `await next()`，仅 ZOMBIE_RE 命中才 heal+二次 `next()`；
- `tools/post-execute`：先 `await next()` 保链，accept+content 追加（不动 isError）；
- 错误签名正则：`ZOMBIE_RE` / `WINDOW_RE` / `DOWN_RE`（中英双语）。

## 6. 已知取舍与风险（请重点审）

1. **`tools/execute` 内二次 `next()` 的调度器语义**：官方注释点名 retry 用例，但未实测过"重挂后同名工具重派发"是否解析到新 fiber 的注册（若解析到旧定义可能再错一次→绊线兜底提示，不会更差）。**未验证**。
2. **快路径信任窗口**：闸门信任 <30s 的 tick 结论，Neo 恰在此窗内死掉会漏一次 fetch failed（绊线兜底）。要不要收紧？
3. **dispose 超时 5s 后弃置引用**：若旧 fiber dispose 悬挂，其 serverName 预留（mcp-client 模块级 Map，按 scope owner）可能未释放→新挂载抛 "already in use"→tick 记录 lastError，下轮重试。是否有更干净的处理？
4. **错误文本正则**：依赖 claw-server/SDK 的英文措辞与 harness 本地化中文双覆盖；上游改措辞即漏判（漏判退化为"普通失败+模型按 skill 调 launch"，launch 的 ready 路径仍会重建会话——有兜底但慢一拍）。
5. **每 30s initialize 探测**：会在 Neo 侧建会话（已补 DELETE）；`listChanged` 能力桥自己会消费，tick 不订阅 SSE GET 流。
6. **uchg 锁 skill 的代价**：Neo 升级官方 skill 文本将进不来（README 有解锁命令）；Neo 的"连接面板"可能显示 DSH 状态异常（写文件失败）。
7. **单用户单实例假设**：无多 DSH 进程并发挂载的考虑；`lastOpenAt` 防抖是进程内的。
8. **launch 阻塞时长**：闸门最坏 40s + 工具自身超时；`timeoutMs` 给 launch 设了 90s。审批式长挂起是否有未知副作用（如轮次超时）？
9. **零窗口自动 reopen 的打扰面**：只在"模型已在调用 neo 工具且报窗口错"时触发（被动），不会闲时拉窗口——但模型误用 neo 时会给用户弹出窗口。
10. **安全面**：`/api/dsh-browseros-neo` 无鉴权依赖宿主 webServer 同源/token 体系（与 chat-translate 同款）；`open -b <bundleid>` 固定串无注入面。

## 7. 验证状态

- ✅ 试点（裸配置行）：20 工具注册、新会话实跑 HN 任务；
- ✅ v0.2 场景：冷启动拉起（用户图一流程：fetch 失败→launch→同轮成功）；
- ✅ v0.2 场景：僵尸会话绊线（图二流程修复后同轮恢复）；
- ✅ 落位工程链：bundle 自挂载、client 半区加载、设置页三件套截图确认；
- ⏳ **v0.5 预检闸门 / v0.6 透明重试：代码已同步，等待用户重启宿主实测**（剧本：关 Neo 直接测→第一次应"慢而成功"；Neo 秒级重启→调用应"直接成功"）；
- ❌ 未测：多会话并发、dispose 悬挂、PTC 模式（`default.` 前缀）下的签名匹配（截图显示 PTC 会话中 exec.name 仍为原生名，理论兼容，未专门验证）。

## 8. 给评审 AI 的问题清单

1. §6 各条的严重性排序与更优解？特别是 #1（二次 next() 语义）和 #3（serverName 预留泄漏）；
2. 三道水位线（gate/execute-retry/post-execute-hint）的职责边界是否有重叠或缺口？失败分类正则是否该收敛为"先试修复、修复失败才提示"的单一状态机？
3. 用 `tools/execute` 做透明重试后，post-execute 里同签名的 heal+hint 是否已冗余？保留是否有害（双重提示）？
4. 30s tick + 40s 闸门预算 + 5s 冷却 + 15s 防抖这一组常量的合理性与最坏情况时序；
5. 有没有本仓库环境内**更简单**的整体方案被我们漏掉（约束：不修上游、不 fork、复用官方桥、macOS）？
