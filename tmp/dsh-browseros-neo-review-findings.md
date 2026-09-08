# dsh-browseros-neo 复杂度评审 · 实测核查结论

> 对应简报：`tmp/dsh-browseros-neo-review-brief.md`（v0.6.0）
> 日期：2026-09-09 · 核查方式：DSH/SDK 源码精读 + claw-server 日志/二进制实证 + 本机运行态
> 结论一句话：**需求驱动的防线全部真实（非过度设计），但「三道水位线」是叠加演进留下的冗余结构，源码证明合并为单一 `tools/execute` 状态机零损失；主机半区 ~700 行可瘦到 ~450–500 行，删的是重复不是能力。**

---

## 1. DSH 侧核查结果（源码级）

| # | 简报/待验说法 | 核实结果 | 证据位置 |
|---|---|---|---|
| 1 | 桥重连 maxAttempts=10、「~4 分钟」后放弃 | **属实，时长修正为 ~2.5 分钟**（0.5+1+2+4+8+16+30×4≈151s）；耗尽后**注销全部已注册工具**，只有 dispose/HMR 能复活 | `dsh-mcp-client/lib/index.js` `RECONNECT_DEFAULTS`、`scheduleReconnect()`（584–590 行） |
| 2 | 僵尸会话（404）桥永不重连 | **彻底坐实**：SDK 1.30.0 `send()` 对非 2xx 只特判 401/403；404 → `throw StreamableHTTPError`，catch 仅调 `onerror`；`onclose` **只在 `close()` 内触发**；SSE 重连失败也只走 `onerror` → 僵尸永不自愈 | SDK `streamableHttp.js` 315/371/455/287 行 |
| 3 | §6#1：二次 `next()` 可能解析到旧工具定义 | **源码层面可排除**：`dispatchToolBody()` 内才 `resolveExecution(exec.name,…)`，按名查**当前注册表**；重挂后重放命中的是新 fiber 的工具定义（仍建议实测一次兜底） | `dsh-tools/lib/index.js` 3193 行 |
| 4 | pre-execute deny 的模型体验 | deny → 物化为 `Error: <reason>` 的 isError 结果，**仍走 post-execute**；与 tools/execute 内合成 `{isError, content, error}` **完全等价**（`normalizeDispatchResult` 对 error 结果原样放行） | 3116–3134、3447–3456 行 |
| 5 | post-execute 绊线 accept+content | 合法：失败结果禁止替换 `value`，但**允许替换/追加 `content`** | 3389–3405 行 |
| 6 | 插件 untagged ctx 收全部派发 | **证实**：`scopeTarget` carrier「admits untagged listeners globally」（`tag === void 0 → true`）；三个钩子投递语义一致 | `dsh-scope/lib/index.js` 327–340 行 |
| 7 | 工具列表每轮快照 | 修正措辞：**每个 step** 快照（`preStep → assemble → assembly.tools → buildRequest`），新挂载工具下一 step 可见 | `dsh-agent-loop/lib/index.js` 630/747 行 |
| 8 | §6#3：dispose 悬挂 → serverName 预留泄漏 | 机制证实：预留在 effect disposer 中释放；但桥自身 dispose 有 5s 超时（`GENERATION_CLOSE_TIMEOUT_MS`），与插件 5s race 叠加后风险窗口很小，**现状可接受** | `dsh-mcp-client` 679–699、473 行 |

## 2. Neo 侧核查结果（日志/二进制/运行态实证）

- **当前运行态**：Neo 未运行；`runtime.json` 端口 **9010**（文档写 9200，端口漂移真实）；探测连接被拒，符合 F1 场景。
- **零窗口僵尸态实证**（`~/.browserclaw/logs/claw-server.log.2026-09-08`，19:34）：session `4aaf38ce` MCP 正常应答，但 `tabs`/`windows`/`run` 全部报 `CDP error: No browser window available` / `No profile available`。
- **僵尸会话 404 实证**（同日 19:44）：neo 重启后旧 session 的 `POST /mcp` 连续 404；服务器二进制 strings 证实 404 body 为 `Not Found: Session not found`，插件 `ZOMBIE_RE` 命中。
- **探测开销量化**：当天 claw-server 共创建 **196 个 MCP session**（30s tick 探测 + 一次性诊断会话各占一份）；插件的 DELETE 清理有效（shutdown 时 `drained=0`）。属实但有轻微成本。
- **`windows list` 回复格式**：零窗口回复 `No windows found.`（二进制 strings 实证，插件正则命中）；正面 `Found N windows` 为 Rust fmt 切片拼接，strings 中无完整字面量，但插件正则 `/Found (\d+) window/i` 不锚尾，单复数均可匹配。
- **新发现的边界**：零窗口时 `windows list` 诊断**本身也会失败**（`No profile available`，19:34 日志实证）→ `neoWindowCount` 在该态返回 `ok:false`，`waitForWindow` 轮询至超时；行为可接受，但 launch 的 alreadyRunning 分支文案会走「窗口探测失败」路径。

## 3. 复杂度结论（修正后）

### 不是过度设计的部分（全部实测坐实，删不得）

- **生命周期自愈是刚需**：僵尸永不自愈（§1.2）、零窗口僵尸态（§2）、10 次重试放弃（§1.1）均为官方桥真实缺口；
- **端点动态解析**（9010≠9200，端口漂移真实）；
- **30s tick 监督**：唯一能让「Neo 后开时工具出现在下一 step」的机制——任何调用点钩子都拦不到一个不在工具列表里的工具；
- **launch 工具的存在性**（模型自启是用户拍板的需求）、错误签名中英双覆盖、skill 锁定、设置页。

### 确认冗余、可合并的部分（源码证明零损失）

1. **三道水位线 → 单一 `tools/execute` 状态机**：
   - `next()` 前做预检（等价现 pre-execute 闸门；不 ready 时合成 isError 结果，模型体验与 deny 等价——§1.4）；
   - `next()` 后做失败分类→修复→重放一次（现 execute-retry）→ 仍败则直接在结果 content 追加指引（等价现 post-execute 绊线——§1.5）；
   - 消掉：zombie 的 `healSession` 双调用点（现靠 5s 冷却防打架，本身就是冗余证据）、两套正则分类执行、简报 §8 问题 2/3；§8 问题 1 也随 §1.3 的源码结论收敛。
2. **「拉起并等待」流程三份 → 一份**：`wakeInBackground`、`ensureNeoReady` 的 wakePromise、launch 的 ~60 行分支合并为同一状态机；launch 只负责格式化分支文案（瘦到 ~20 行）。
3. **常量收敛**：冷却/防抖在单一状态机下可合并；7 个时间常量 → ~4 个。

### 预期收益

主机半区 ~700 行 → **~450–500 行**；失败处理从「三层叠加」变为「一个状态机 + 监督 tick + launch 薄壳」。防线能力逐项保留（F1–F6、G1–G2 矩阵不变）。

### 重构唯一需要实测确认的点

pre-execute `deny` → tools/execute 合成 isError 的迁移，对模型行为无预期差异（二者物化结果同构），但 v0.5/v0.6 本身尚未实测（简报 §7），建议合并后按原剧本一次验收：关 Neo 直测（第一次应「慢而成功」）、Neo 秒级重启（调用应「直接成功」）。

---

*核查人：评审 AI · 核查环境：DSH 0.1.3-alpha.2（launcher .pnpm store）+ BrowserOS neo（claw-server Rust 二进制）+ macOS*
