# patch-dsh-cordis-inspect-idempotent

让 `@deepseek-ai/dsh-tool-cordis` 的 Host inspect provider 注册幂等，使含 `tool-cordis` 的多个预设可在同一 DSH 进程内共存。

> **本目录只有文档、没有脚本**：补丁改的是 vendor 编译产物，由 AI 按本文执行——锚点、替换正文、校验与回滚都逐字写死在下面。隔壁 [`../matt-presets-bootstrap/`](../matt-presets-bootstrap/README.md) 同样是纯文档形式。

## 背景

`dsh-tool-cordis`（官方 `cordis` 预设、`ptc-cordis`、`matt-cordis` 的创造能力来源）挂载时会向全局单例 `ctx.cordisInspect` 注册 Host inspect provider（`Service` / `Event` / `Builtin` / `Tool`）。该注册表（`dsh-cordis-host-runner` 的 `lib/types/inspect-registry.js`）**不做幂等**：

```js
register(registration) {
    const manifest = validateManifest(registration.manifest);
    if (this.providers.has(manifest.id))
        throw new Error(`Host Cordis inspect provider "${manifest.id}" is already registered`);
    // ...
}
```

因此同一 DSH 进程内先后挂载两个含 `tool-cordis` 的预设（官方 `cordis`、`ptc-cordis`、`matt-cordis` 任意两个）时，**第二个预设挂载失败**（`standingKeyFor` 报 `failed to apply loader entry tool-cordis`）。单开其中一个预设不受影响。

## 修复方案

把 `dsh-tool-cordis/lib/index.js` 中的注册循环替换为「先收集已注册的 host provider id，同 id 跳过，其余照常注册」的守卫版本。**缩进是制表符**（外层 1 个、`for` 体内 2 个），行尾 LF。

改动前（**锚点，全文件应恰好出现 1 次**）：

```js
	for (const provider of hostInspectProviders(ctx)) ctx.effect(() => ctx.cordisInspect.register(provider), `tool-cordis: inspect ${provider.manifest.id}`);
```

改动后（8 行）：

```js
	// local patch (user): idempotent cordisInspect host registration — presets that also carry tool-cordis (cordis, ptc-cordis,
	// matt-cordis) may coexist in one process; same-id host providers are
	// skipped instead of throwing `already registered`.
	const existingHostInspect = new Set(ctx.cordisInspect.list().filter(p => p.platform === "host").map(p => p.id));
	for (const provider of hostInspectProviders(ctx)) {
		if (existingHostInspect.has(provider.manifest.id)) continue;
		ctx.effect(() => ctx.cordisInspect.register(provider), `tool-cordis: inspect ${provider.manifest.id}`);
	}
```

不改任何行为语义：首次注册照旧，重复注册不再抛错。`cordisInspect.list()` 返回 `{ platform, id, ... }` 视图（`inspect-registry.js` 的 `view()`：`{ platform, ...manifest, methods: [...] }`），补丁用 `platform === "host"` 过滤，避免与 Client 侧 manifest 混淆。首行注释同时充当**幂等 marker**。

## 打补丁

### 1. 定位目标 = 当前运行的 DSH 实例

**不要按固定路径扫。** `/Applications/DSH Desktop.app`、`npm root -g`、`pnpm root -g`、`~/.dsh/profiles/*/node_modules` 这些位置都是猜测：同一台机器上可以并存多套互不相干的 DSH 安装（例如 DSH Desktop 应用包与 dsh-launcher 的 `versions/<ver>/`），猜出来的那份**很可能不是正在跑的那份**——会出现「补丁报成功、问题依旧」；反过来改正跑的那份就够了。

正确做法是从运行中的进程反推它**实际加载**的文件：

```bash
python3 - <<'PY'
import os, re, subprocess
MARK = "@deepseek-ai/dsh/lib/bin.js"
ps = subprocess.run(["ps", "-Ao", "pid=,command="], capture_output=True, text=True).stdout
for line in ps.splitlines():
    m = re.match(r"\s*(\d+)\s+(.*)", line)
    if not m:
        continue
    pid, cmd = m.group(1), m.group(2)
    if MARK not in cmd or not re.match(r"^\S*node\b", cmd):
        continue                                   # 只看 node 进程，排除自身匹配
    binjs = cmd.split(MARK)[0].split(" ", 1)[-1].rstrip("/") + "/" + MARK
    if not os.path.isfile(binjs):
        continue                                   # 排除命令行里恰好含该串的其它进程
    dsh = os.path.dirname(os.path.dirname(binjs))  # <X>/node_modules/@deepseek-ai/dsh
    r = subprocess.run(["node", "-e",
        "console.log(require.resolve('@deepseek-ai/dsh-tool-cordis',{paths:[process.argv[1]]}))",
        os.path.realpath(dsh)], capture_output=True, text=True)
    port = (re.search(r"--port\s+(\d+)", cmd) or [None, "?"])[1]
    print(f"pid={pid} port={port}\n  {r.stdout.strip() or r.stderr.strip()}")
PY
```

要点：

- 运行中的 DSH 进程 cmdline 形如
  `node <X>/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --host 127.0.0.1 --port 3080 --no-open`，
  由 `@deepseek-ai/dsh/lib/bin.js` 这个 marker 反推安装位置；
- **用 Node 自己的解析**（从 `@deepseek-ai/dsh` 包目录的真实路径 `require.resolve`）拿目标文件，**不要手写 `.pnpm/*` glob 去猜**：`dsh-tool-cordis` 是 `@deepseek-ai/dsh` 的依赖，pnpm 把它放在
  `<X>/node_modules/.pnpm/@deepseek-ai+dsh-tool-cordis@<ver>_<hash>/node_modules/@deepseek-ai/dsh-tool-cordis/lib/index.js`，
  哈希段随 peer 组合变化，`require.resolve` 的结果就是运行进程加载的那一份；
- 路径可能含空格（如 `~/Library/Application Support/...`），任何 `tr ' '` / `awk '{print $n}'` 式的切词都会切坏，故按 marker 切分而非按空格切分；
- 探测到多个实例（多端口并存）时**逐个都打**。

### 2. 判定是否已打

读目标文件，检查 marker：

```
local patch (user): idempotent cordisInspect host registration
```

- marker 存在 → 已打过，**跳过**（补丁幂等，可重复执行）；
- marker 不存在 → 继续第 3 步。

### 3. 备份并注入

1. 若 `<目标文件>.bak-cordis-inspect` 不存在，先 `cp` 一份备份（已存在则**不要覆盖**，否则会把已打补丁的内容当成原始版本备份掉）；
2. 统计锚点在文件中的出现次数，**必须恰好为 1**；为 0 或 >1 都要**停手报错**，不得强行替换（vendor 升级改动过该处，硬替会误伤）；
3. 用锚点整行替换为上面的 8 行注入块，写回文件（UTF-8，保留制表符）。

### 4. 校验

```bash
node --check <目标文件>          # 语法必须通过
```

再确认：marker 已出现、锚点计数已变为 0、注入块落在 `ctx.tools.register(defineTool({` 之前（该函数体内、`text: CORDIS_SYSTEM_PROMPT` 那段之后的同一位置）。

### 5. 重启 DSH

补丁改的是磁盘文件，**运行中的进程仍持有旧代码**——必须重启对应实例（launcher 起的实例从 launcher 退出重启；`dsh web` 起的杀掉该 node 进程后重新拉起）才会加载。

## 验证

- 锚点行唯一性校验：待替换代码在 `lib/index.js` 中出现次数 ≠ 1 时报错拒打，防止 vendor 升级改动后误伤；
- 补丁后 `node --check` 语法校验；
- 实测（补丁前）：同进程挂载 `cordis` + `matt-cordis` → 第二个失败
  `Host Cordis inspect provider "Service" is already registered`；
- 补丁后：重启 DSH，`standingKeyFor('matt-cordis')` 与 `standingKeyFor('ptc-cordis')`
  均应返回 mounted OK，且可与官方 `cordis` 会话同进程并存。

## 已知限制

补丁用「同 id 跳过」实现幂等，因此 provider 的注册 disposer 仍只归属**首个**注册它的预设（`inspect-registry.js` 的 `register()` 返回的 disposer 会把该 id 从 `providers` 里 `delete`）。设 A、B 为两个含 `tool-cordis` 的预设：

- 只挂 A 或只挂 B：不受影响；
- A 先挂、B 后挂：两者都可用，补丁正是在此避免了 B 挂载失败；
- 但若此后**卸载 A 而 B 仍在**：A 的 effect disposer 会删除 provider，B 不会补注册，
  B 的 inspect 查询将报 `Host Cordis inspect provider "..." is not registered`。

即本补丁解决的是**挂载期**的重复注册冲突，不改变注册表**卸载期**的共享生命周期语义。

## 回滚

```bash
cp <目标文件>.bak-cordis-inspect <目标文件>
```

回滚后同样需要重启 DSH。

## 何时重打

DSH 每次升级/重装后都要重打——launcher 切版本目录会重新 `pnpm install`，补丁随之被覆盖回 vendor 原样。按本文第 1 步重新定位（版本哈希会变），再走第 2–5 步即可；已打过的实例会在第 2 步被识别并跳过。
