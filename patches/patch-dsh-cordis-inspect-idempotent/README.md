# patch-dsh-cordis-inspect-idempotent

让 `@deepseek-ai/dsh-tool-cordis` 的 Host inspect provider 注册幂等的本地补丁脚本。

## 背景

`dsh-tool-cordis`（官方 `cordis` 预设、`ptc-cordis`、`matt-cordis` 的创造能力来源）
挂载时会向全局单例 `ctx.cordisInspect` 注册 Host inspect provider
（`Service` / `Event` / `Builtin` / `Tool`）。该注册表（`dsh-cordis-host-runner` 的
`inspect-registry.js`）**不做幂等**：同 id 再次注册直接抛
`Host Cordis inspect provider "Service" is already registered`。

因此同一 DSH 进程内先后挂载两个含 `tool-cordis` 的预设（官方 `cordis`、`ptc-cordis`、
`matt-cordis` 任意两个）时，**第二个预设挂载失败**（`standingKeyFor` 报
`failed to apply loader entry tool-cordis`）。单开其中一个预设不受影响。

## 修复方案

把 `dsh-tool-cordis/lib/index.js` 中的注册循环：

```js
for (const provider of hostInspectProviders(ctx)) ctx.effect(() => ctx.cordisInspect.register(provider), `tool-cordis: inspect ${provider.manifest.id}`);
```

改为「先收集已注册的 host provider id，同 id 跳过，其余照常注册」的守卫版本。
不改任何行为语义：首次注册照旧，重复注册不再抛错。`cordisInspect.list()` 返回
`{ platform, id, ... }` 视图，补丁用 `platform === "host"` 过滤，避免与 Client 侧
manifest 混淆。

## 用法

```bash
bash patch-dsh-cordis-inspect-idempotent.sh            # 自动定位
DSH_ROOT=/path/to/dsh bash patch-dsh-cordis-inspect-idempotent.sh   # 或显式指定
```

自动搜索位置：`DSH_ROOT`（如指定）→ DSH Desktop 应用包
（`/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules`）
→ `npm root -g` / `pnpm root -g` → `~/.dsh/profiles/*/node_modules`。对所有找到的
副本逐个打补丁（含 marker 检测，幂等可重复执行），每个被打补丁的文件旁留
`.bak-cordis-inspect` 备份。执行完成后**重启 DSH** 使新代码加载；DSH 每次升级/
重装后重跑一次。

## 验证

- 锚点行唯一性校验：待替换代码在 `lib/index.js` 中出现次数 ≠ 1 时报错拒打，
  防止 vendor 升级改动后误伤；
- 补丁后 `node --check` 语法校验；
- 实测（补丁前）：同进程挂载 `cordis` + `matt-cordis` → 第二个失败
  `Host Cordis inspect provider "Service" is already registered`；
- 补丁后：重启 DSH，`standingKeyFor('matt-cordis')` 与 `standingKeyFor('ptc-cordis')`
  均应返回 mounted OK，且可与官方 `cordis` 会话同进程并存。

## 回滚

```bash
cp <文件>.bak-cordis-inspect <文件>
```
