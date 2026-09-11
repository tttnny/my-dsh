# patch-dsh-agent-loop-inbox-own-events

让 `@deepseek-ai/dsh-agent-loop` 的 inbox 投影跳过 fork 继承前缀，使分叉出来的子会话不再把源会话「切点之后、尚未认领」的排队消息当成自己的待发输入。

> **本目录只有文档、没有脚本**：补丁改的是 vendor 编译产物，由 AI 按本文执行——锚点、替换正文、校验与回滚都逐字写死在下面。隔壁 [`../patch-dsh-cordis-inspect-idempotent/`](../patch-dsh-cordis-inspect-idempotent/README.md)、[`../matt-presets-bootstrap/`](../matt-presets-bootstrap/README.md) 同样是纯文档形式。

## 背景

`agent/inbox/spliced` 是**成对**事件：一条用户消息先以 `inserted` 入队，随后 `turn/start` 开始处理，真正的「认领」发生在这一轮开始时——以 `removedCount` 删除。也就是说，一个 `turn/end` 与下一个 `turn/start` 之间可能停着一条尚未配对的入队。

`dsh-api-session-controller` 的 `fork()` 把 seed 切在「boundary 的下一个 `turn/start` 之前」，这类未配对入队因此会被整条复制进子会话日志。而 `dsh-agent-loop/lib/index.js` 的 inbox 投影：

```js
init: () => ({ "next-turn": [], "next-step": [] }),
apply(state, event) {
	if (event.type !== "agent/inbox/spliced") return state;
	…
}
```

——`init` 不接第二个参数，`apply` 折叠全部事件。`dsh-session-projection` 明确把「精确的 fork 继承切点」作为 `init(header, inheritedEventCount)` 的第二参交给投影，这里没有用它；投影折叠的是 `session.snapshotEvents()`（含继承前缀）。结果是：分叉子会话一建好，队列里就带着源会话那条未认领的消息——用户发的第一条消息只能排在它后面，而那条幽灵消息先被 `claim()` 认领、作为子会话第一轮输入发给模型。

0.1.5-alpha.1 之前，inbox 是「只重放 `session.ownEvents()`」（跳过继承前缀）的类；本补丁恢复的正是这个语义。

## 修复方案

用一张模块级 `WeakMap` 把切点**挂在 state 旁边**，而不是塞进 state 本身：state、wire view、checkpoint 行的形状与上游完全一致，不动 schema、不动 wire 契约、不动 `viewSchema.parse` 与缓存行的字段格式。

`inheritedEventCount` 是继承事件条数，也就是切点；继承前缀的 `seq` 必然 `< inheritedEventCount`，所以 `apply` 对这类事件原样返回。

五处改动（**缩进是制表符**，行尾 LF）。按 ①→⑤ 顺序施加：

### ① marker + WeakMap 声明

改动前（**锚点，全文件应恰好出现 1 次**）：

```js
/** Standard fold that reconstructs pending input and rejects invalid durable splice history. */
const inboxProjectionDefinition = {
```

改动后：

```js
/** Standard fold that reconstructs pending input and rejects invalid durable splice history. */
// local patch (user): a seeded (forked) child must not replay the fork parent's
// `agent/inbox/spliced` events. `init` receives the exact inherited cut; keep it
// beside the state so `apply` ignores every splice before it — the semantics the
// pre-0.1.5-alpha.1 `session.ownEvents()` replay had.
const inboxInheritedCut = /* @__PURE__ */ new WeakMap();
const inboxProjectionDefinition = {
```

首行注释即**幂等 marker**：`local patch (user): a seeded (forked) child must not replay`。

### ② `init` 接住切点

锚点：

```js
	init: () => ({
		"next-turn": [],
		"next-step": []
	}),
```

替换：

```js
	init: (_header, inheritedEventCount) => {
		const state = {
			"next-turn": [],
			"next-step": []
		};
		if (inheritedEventCount > 0) inboxInheritedCut.set(state, inheritedEventCount);
		return state;
	},
```

### ③ `apply` 跳过继承前缀

锚点：

```js
	apply(state, event) {
		if (event.type !== "agent/inbox/spliced") return state;
```

替换：

```js
	apply(state, event) {
		if (event.type !== "agent/inbox/spliced") return state;
		if (event.seq < (inboxInheritedCut.get(state) ?? 0)) return state;
```

### ④ `apply` 产生的新 state 续挂切点

锚点：

```js
			return splice.target === "next-turn" ? {
				"next-turn": next,
				"next-step": state["next-step"]
			} : {
				"next-turn": state["next-turn"],
				"next-step": next
			};
```

替换：

```js
			const spliced = splice.target === "next-turn" ? {
				"next-turn": next,
				"next-step": state["next-step"]
			} : {
				"next-turn": state["next-turn"],
				"next-step": next
			};
			const inheritedCut = inboxInheritedCut.get(state);
			if (inheritedCut !== void 0) inboxInheritedCut.set(spliced, inheritedCut);
			return spliced;
```

### ⑤ 作废补丁前的投影缓存行

锚点：

```js
	stateVersion: 1
};
```

替换：

```js
	stateVersion: 2
};
```

`session_projcache` 按 `ver` 判断行是否可用（`dsh-session-projection` 的 `viewCheckpoint()` / `restore()`：`row.ver !== def.stateVersion` 即丢弃并从 `init` 重折）。升到 2 后，补丁前写入的 inbox 行会被作废重建，避免**已经存在**的 fork 子会话继续从旧缓存里读到幽灵消息。

## 打补丁

### 1. 定位目标 = 当前运行的 DSH 实例

**不要按固定路径扫。** `/Applications/DSH Desktop.app`、`npm root -g`、`pnpm root -g`、`~/.dsh/profiles/*/node_modules` 都是猜测：同一台机器上可以并存多套互不相干的 DSH 安装（例如 DSH Desktop 应用包与 dsh-launcher 的 `versions/<ver>/`），猜出来的那份**很可能不是正在跑的那份**。正确做法是从运行中的进程反推它**实际加载**的文件：

```bash
python3 - <<'PY'
import os, re, subprocess
MARK = "@deepseek-ai/dsh/lib/bin.js"
ps = subprocess.run(["ps", "-Ao", "pid=,command="], capture_output=True, text=True)
for line in ps.stdout.splitlines():
    m = re.match(r"\s*(\d+)\s+(.*)", line)
    if not m:
        continue
    pid, cmd = m.group(1), m.group(2)
    if MARK not in cmd or not re.match(r"^\S*node\b", cmd):
        continue                                   # 只看 node 进程，排除自身匹配
    binjs = cmd.split(MARK)[0].split(" ", 1)[-1].rstrip("/") + "/" + MARK
    if not os.path.isfile(binjs):
        continue                                   # 排除命令行里恰好含该串的其它进程
    # <X>/node_modules/@deepseek-ai/dsh 是 pnpm 符号链接；require.resolve 的 paths
    # 按字面路径解析，必须先用 realpath 进到 .pnpm 虚拟目录，才看得到同层依赖。
    dsh = os.path.realpath(os.path.dirname(os.path.dirname(binjs)))
    r = subprocess.run(["node", "-e",
        "console.log(require.resolve(process.argv[1],{paths:[process.argv[2]]}))",
        "@deepseek-ai/dsh-agent-loop", dsh], capture_output=True, text=True)
    port = (re.search(r"--port\s+(\d+)", cmd) or [None, "?"])[1]
    print(f"pid={pid} port={port}")
    print("  " + (r.stdout.strip() or r.stderr.strip()))
PY
```

要点：

- 运行中的 DSH 进程 cmdline 形如 `node <X>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --port 3080 --no-open`；
- **用 Node 自己的解析**拿目标文件：`dsh-agent-loop` 不是 `@deepseek-ai/dsh` 的依赖，要从 `@deepseek-ai/dsh` 包目录的 **realpath** 出发 `require.resolve`——它落在 `<X>/node_modules/.pnpm/@deepseek-ai+dsh-agent-loop@<ver>_<hash>/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js`，哈希段随 peer 组合变化，`require.resolve` 的结果就是运行进程加载的那一份；
- 路径可能含空格（如 `~/Library/Application Support/...`），任何按空格切词的做法都会切坏，故按 marker 切分；
- 探测到多个实例（多端口并存）时**逐个都打**。

### 2. 判定是否已打

读目标文件，检查 marker：

```
local patch (user): a seeded (forked) child must not replay
```

- marker 存在 → 已打过，**跳过**（补丁幂等，可重复执行）；
- marker 不存在 → 继续第 3 步。

### 3. 备份并注入

1. 若 `<目标文件>.bak-inbox-own-events` 不存在，先 `cp` 一份备份（已存在则**不要覆盖**，否则会把已打补丁的内容当成原始版本备份掉）；
2. 逐条统计「修复方案」里 5 个锚点在文件中的出现次数，**必须每个都恰好为 1**；任何一个为 0 或 >1 都要**停手报错**，不得强行替换（vendor 升级改动过该处，硬替会误伤）；
3. 按 ①→⑤ 依次整段替换，写回 UTF-8，保留制表符与行尾 LF。

### 4. 校验

```bash
node --check <目标文件>          # 语法必须通过
```

再确认：

- marker 已出现；
- ① ② ④ ⑤ 的锚点计数变为 0；③ 的锚点原文仍在（它就是替换文本的前缀），要确认它后面紧跟新增的守卫行 `if (event.seq < (inboxInheritedCut.get(state) ?? 0)) return state;`；
- 四个替换特征串存在且各命中 1 次：`inboxInheritedCut.set(state, inheritedEventCount)`、`event.seq < (inboxInheritedCut.get(state) ?? 0)`、`inboxInheritedCut.set(spliced, inheritedCut)`、`stateVersion: 2`。其中 `stateVersion: 2` 在文件里可能还有别的投影单元命中多次，属正常。

### 5. 重启 DSH

补丁改的是磁盘文件，**运行中的进程仍持有旧代码**——必须重启对应实例（launcher 起的实例从 launcher 退出重启；`dsh web` 起的杀掉该 node 进程后重新拉起）才会加载。

## 验证

- 锚点唯一性：5 个锚点任一出现次数 ≠ 1 即报错拒打；
- 语法：补丁后 `node --check` 通过；
- 实测（补丁前）：源会话有 ≥2 轮时，在**非最后一轮**回复尾巴上分叉（或源会话正跑着下一轮时分叉），在子会话里发第一条消息 → composer 队列出现一条不是自己发的消息；子会话日志里第一条 `agent/inbox/spliced` 的 `start` 为 1、紧随其后被 `removedCount: 1` 取出，取出的 `user/message` 是源会话下一轮的 prompt；
- 实测（补丁后，重启 DSH）：同样位置分叉 → 子会话队列为空，第一条 `agent/inbox/spliced` 的 `start` 为 0，子会话第一轮 `user/message` 就是自己发的那条，`request/header` 里不再出现继承来的 prompt。

## 已知限制

- 只改**继承前缀**（`seq < inheritedEventCount`）的折叠：未 seeded 的会话、以及 seeded 子会话自己产生的事件，行为不变。
- 投影缓存的冷读路径若命中补丁前写入的行，仍可能带幽灵项——所以 ⑤ 把 `stateVersion` 升到 2。若刻意跳过 ⑤，需自行清理 `storages/` 下对应的 `session_projcache` 行（或等它被重写）。
- 不改 fork 的切点：seed 里仍会带那条继承事件（只是不再被 inbox 认领）。上游若改从切点侧修（不把轮间 `agent/inbox/spliced` 收进 seed），与本补丁可叠加、不冲突。
- 切点靠 state 对象的同一性传递（`init` 建立、`apply` 每次新 state 续挂）。若上游把投影 state 改成每次 `apply` 前序列化/克隆，切点会失效——表现是退回补丁前的行为，不会更坏。

## 回滚

```bash
cp <目标文件>.bak-inbox-own-events <目标文件>
```

回滚后同样需要重启 DSH（⑤ 的 `stateVersion` 也随之回到 1）。

## 何时重打

DSH 每次升级/重装后都要重打——launcher 切版本目录会重新 `pnpm install`，补丁随之被覆盖回 vendor 原样。按本文第 1 步重新定位（版本哈希会变），再走第 2–5 步即可；已打过的实例会在第 2 步被识别并跳过。
