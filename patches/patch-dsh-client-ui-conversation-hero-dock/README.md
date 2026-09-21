# patch-dsh-client-ui-conversation-hero-dock

让 `@deepseek-ai/dsh-client-ui-conversation` 的 `conversation.composer.dock`（输入框卡片**下方**那一行）在新建会话的 hero 形态下也渲染，使挂在那一行的插件条目（`@lynn123411/dsh-a6api` 的「A6api」胶囊）在新建会话里同样出现。

> **本目录只有文档、没有脚本**：补丁改的是 vendor 编译产物，由 AI 按本文执行——锚点、替换正文、校验与回滚都逐字写死在下面。与 [`../patch-dsh-cordis-inspect-idempotent/`](../patch-dsh-cordis-inspect-idempotent/README.md)、[`../patch-dsh-agent-loop-inbox-own-events/`](../patch-dsh-agent-loop-inbox-own-events/README.md) 同为纯文档形式。

## 背景

输入框卡片下方那一行由宿主 `ui-conversation` 的 `InputBar` 渲染。它的子节点里，插件可见的 slot 与官方 `ContextMeter` 是**同一个 `.dock` 容器里的兄弟节点**，但两者的渲染条件不同：

```js
children: [variant === "composer" && input !== void 0 && sessionId !== void 0 ? renderSlot("conversation.composer.dock", {}) : null, (0, react_jsx_runtime.jsx)(ContextMeter, { ... })]
```

- `ContextMeter` 无 variant 门禁，hero 下照样进 `.dock`（自身无上下文占用时返回 `null`）；
- **`conversation.composer.dock` 多一个 `variant === "composer"`**，而新建会话的 hero 形态传入的是 `variant: "hero"`（`ConversationContent` 里 `variant: hero ? "hero" : "composer"`），于是 hero 下该 slot 恒为 `null` —— 挂在那一行的任何插件条目（含 `dsh-a6api` 的胶囊，order -1）在新建会话里都不出现，发出第一条消息、页面转为 `composer` 形态后才出现。

同一份 CSS 还有一条配套规则 `.uV2eYG_hero .uV2eYG_dock:empty{display:none}`：hero 下这一行若没有任何子节点就整行隐藏。它只是"空行不占位"，**不阻止**有内容时显示。

另需澄清一处易混点：`sessionId` 在新建会话下**是有的**。`uiWorkspace.startSession(workspaceId)` 会真的建出一个会话（`ConversationMainPanel` 的 `hero` 判据之一就是 `summaryBlank === true`），`input` 同样存在（hero 的输入框是可输入的）。所以 hero 下这个门禁**只差 `variant` 一项**——这正是本补丁只动这一处的原因。真正没有会话的形态（未选工作区、`sessionId === void 0`）不在本补丁范围内，那里 `input`/`sessionId` 都缺，输入框本身是 inert 的，胶囊也不该出现。

## 修复方案

把门禁放宽为「`composer` 或 `hero`」，其余条件与语义一概不动。**缩进是制表符**（外层 6 个、与锚点同行），行尾 LF。

改动前（**锚点，全文件应恰好出现 1 次**）：

```js
variant === "composer" && input !== void 0 && sessionId !== void 0 ? renderSlot("conversation.composer.dock", {}) : null
```

改动后：

```js
(variant === "composer" || variant === "hero") && input !== void 0 && sessionId !== void 0 ? renderSlot("conversation.composer.dock", {}) : null
```

替换的是**整行里的这一段表达式**，不是整行——该行其余内容（`children: [`、随后的 `ContextMeter` 元素、行尾 `})]`）必须原样保留。补丁不改 `ContextMeter`、不改 `.dock` 的 CSS、不改官方 `StatsPills`（`ui-chat`，order 0）的注册条件。

**行为影响**：hero 下这一行由「空」变为「有内容」时，`.hero .dock:empty` 不再命中，整行按正常间距显示。活跃会话（`composer` 形态）行为**完全不变**。

## 打补丁

### 1. 定位目标 = 当前运行的 DSH 实例

**不要按固定路径扫。** 同一台机器上可以并存多套互不相干的 DSH 安装（DSH Desktop 应用包、launcher 的 `versions/<ver>/`、全局 npm/pnpm 安装），猜出来的那份**很可能不是正在跑的那份**。从运行中的进程反推它**实际加载**的副本：

```bash
python3 - <<'PY'
import os, re, subprocess
MARK = "@deepseek-ai/dsh/lib/bin.js"
PKG = "@deepseek-ai/dsh-client-ui-conversation"
# ps 的 command 列在非 tty 下会被截断,必须带 -ww
ps = subprocess.run(["ps", "-Aww", "-o", "pid=,command="], capture_output=True, text=True).stdout
found = 0
for line in ps.splitlines():
    m = re.match(r"\s*(\d+)\s+(.*)", line)
    if not m:
        continue
    pid, cmd = m.group(1), m.group(2)
    if MARK not in cmd or not re.match(r"^\S*node\b", cmd):
        continue                                   # 只看 node 进程，排除自身匹配
    binjs = cmd.split(MARK)[0].split(" ", 1)[-1].rstrip("/") + "/" + MARK
    if not os.path.isfile(binjs):
        continue
    found += 1
    dsh = os.path.realpath(os.path.dirname(os.path.dirname(binjs)))  # <X>/node_modules/@deepseek-ai/dsh
    r = subprocess.run(["node", "-e",
        "console.log(require.resolve(process.argv[1],{paths:[process.argv[2]]}))",
        PKG, dsh], capture_output=True, text=True)
    port = (re.search(r"--port\s+(\d+)", cmd) or [None, "?"])[1]
    print(f"pid={pid} port={port}\n  -> {r.stdout.strip() or r.stderr.strip()}")
print("instances:", found)
PY
```

要点：

- 运行中的 DSH 进程 cmdline 形如
  `node --preserve-symlinks <X>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --port 3080 --no-open`；
- **用 Node 自己的解析**（从 `@deepseek-ai/dsh` 包目录 `require.resolve`）拿目标文件，**不要手写 `.pnpm/*` glob 去猜**：pnpm 把该包放在
  `<X>/node_modules/.pnpm/@deepseek-ai+dsh-client-ui-conversation@<ver>_<hash>/node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js`，
  哈希段随 peer 组合变化，`require.resolve` 的结果就是运行进程加载的那一份；
- 目标文件是客户端 bundle，补丁改的是 **`lib/client.js`**（不是 `.d.ts`、不是 `client.js.map`）；
- 路径可能含空格（如 `~/Library/Application Support/...`），任何按空格切词的写法都会切坏，故按 marker 切分；
- `ps -Ao command=` 在非 tty 下会截断到屏幕宽度、导致匹配不到，**必须 `-Aww`**；
- 探测到多个实例（多端口并存）时**逐个都打**。

### 2. 判定是否已打

读目标文件，检查 marker：

```
local patch (user): composer dock also renders in the hero (new-session) variant
```

- marker 存在 → 已打过，**跳过**（补丁幂等，可重复执行）；
- marker 不存在 → 继续第 3 步。

### 3. 备份并注入

1. 若 `<目标文件>.bak-hero-dock` 不存在，先 `cp` 一份备份（已存在则**不要覆盖**，否则会把已打补丁的内容当成原始版本备份掉）；
2. 统计锚点在文件中的出现次数，**必须恰好为 1**；为 0 或 >1 都要**停手报错**，不得强行替换（vendor 升级改动过该处，硬替会误伤）；
3. 把上面 `改动前` 的表达式替换为 `改动后` 的表达式（只替换表达式本身，**不要**把整行 `children: [ ... ]` 一起替换掉），写回文件（UTF-8，保留制表符）。

### 4. 校验

```bash
node --check <目标文件>          # 语法必须通过
```

再确认：marker 已出现；锚点表达式计数已变为 0；`(variant === "composer" || variant === "hero")` 计数为 1；该表达式仍落在 `children: [` 之后、`ContextMeter` 之前的那一行，且 `react_jsx_runtime.jsx)(ContextMeter, {` 紧随其后未被破坏。

### 5. 让它生效

补丁改的是磁盘文件。先**刷新浏览器页面**看是否生效：客户端 bundle 由 DSH 按 `rev` 提供，若该 `rev` 在启动时定死，则必须**重启对应实例**（launcher 起的实例从 launcher 退出重启；`dsh web` 起的杀掉该 node 进程后重新拉起）。

> 注意：重启 DSH 会终止当前正在运行的所有会话进程（会话本身可恢复）。若你正跑着重要任务，先确认再重启。

## 验证

- 锚点表达式唯一性校验：出现次数 ≠ 1 时报错拒打；
- 补丁后 `node --check` 语法校验；
- 补丁前实测：新建会话（hero）里输入框卡片下方那一行**没有**「A6api」胶囊，发出第一条消息后出现；
- 补丁后实测：新建会话一打开，卡片下方那一行即出现「A6api」胶囊（与 `ContextMeter` 同行、整行居中），点开浮层能展示当前会话模型的商户卡片；活跃会话里的位置与行为不变。

## 已知限制

- 只覆盖 `sessionId` 已存在的 hero（`startSession` 建出的新建会话）。**未选工作区、`sessionId === void 0`** 的形态仍不显示——那里 `input` 也缺，输入框处于 inert 状态，本该没有胶囊；
- hero 下官方 `StatsPills`（`ui-chat`，order 0）仍返回 `null`（`stats.steps === 0 && !hasTokens`），所以这一行实际是 `[插件条目..., ContextMeter]`；等会话产生用量、页面转入 `composer` 形态后，官方胶囊才加入同一行；
- 因为放宽了门禁，**任何**挂在 `conversation.composer.dock` 的插件条目都会在 hero 出现。这是本补丁的意图，但换第三方插件时留意；
- 补丁改的是 vendor 产物，**不属于任何插件的发布内容**——npm 上安装 `@lynn123411/dsh-a6api` 的用户不会因此获得 hero 支持，除非同样打上本补丁。

## 回滚

```bash
cp <目标文件>.bak-hero-dock <目标文件>
```

回滚后同样需要刷新页面 / 重启 DSH。

## 何时重打

DSH 每次升级/重装后都要重打——launcher 切版本目录会重新 `pnpm install`，补丁随之被覆盖回 vendor 原样。按本文第 1 步重新定位（版本哈希会变），再走第 2–5 步即可；已打过的实例会在第 2 步被识别并跳过。
