# matt-presets-bootstrap — 手工构建三个 matt preset 操作手册

> **纯手工版指南**：不依赖同目录的 `matt-presets-bootstrap.sh`，所有动作一条条手动执行、每步可自查。仓库里那份 `.sh` 只是本文的脚本化等价物（动作相同），**二选一，别两个都跑**。

目标：在一台新机器上把 `matt-standard` / `matt-ptc` / `matt-cordis` 装进 `~/.dsh/.agent-presets/`，并装好 grilling 适配插件 `@lynn123411/dsh-ask-user-grilling`。

多数人只需要第 3–5 节（有仓库克隆，复制成品 + 安装插件）。第 9 节是 DSH 升级后的维护；附录 A 是「没有仓库克隆 / 想从零理解」时的完整推导路线。

## 0. 十秒路线图

| # | 做什么 | 关键动作（详见各节） |
|---|---|---|
| 1 | 前置检查 | §2 |
| 2 | 安装 grilling 插件 | §3：`rsync` 插件目录到 node_modules（或 `dsh plugin` 从 npm 装） |
| 3 | 同步三个 preset | §4：`rsync` 三份到 `~/.dsh/.agent-presets/<id>/`（排除 README.md） |
| 4 | 行级自检 | §5：grep/find 逐项对照 25/25/27、插件行、旁注在位 |
| 5 | 重启并选择 preset | §6 |
| 6 | 验收一个 grilling 会话 | §7（可选但推荐） |
| 7 | DSH 升级后的维护 | §9（按需） |

## 1. 背景：为什么这样组装

三个 matt preset = **DSH 原厂组合逐字** ＋ **Matt 的整套技能** ＋ **一个 grilling 适配插件**：

| 材料 | 来源 | 作用 |
|---|---|---|
| 原厂组合 `standard` / `ptc` / `cordis` | DSH 安装自带，在其 `node_modules/@deepseek-ai/dsh-agent-presets/presets/` 下 | 基底。原厂写得标准，**persona 一行不改**——工具调用报错即模型问题，不怀疑组合 |
| Matt 的 25 个技能 | [mattpocock/skills](https://github.com/mattpocock/skills) | 工程/生产力技能库，vendor 进各 preset 的 `skills/`（matt-cordis 再并入 cordis 自带 2 个，共 27 个） |
| `@lynn123411/dsh-ask-user-grilling` | npm / 本仓库 `plugins/dsh-ask-user-grilling/` | grilling 输送层：`ask_user_grilling`（子代理闸门 / 强制多选 / 补充机制）+ `enter_plan_mode` |
| grilling 本地适配 | 本仓库 `presets/*/skills/grilling/SKILL.md`（三份逐字节相同） | grilling 纪律载体：强制走 `ask_user_grilling`（含映射表）、子代理停轮、共识后直入 plan mode |

原则：**纪律不写进 persona**，而是下沉到「技能旁注 + 插件工具描述」——模型加载 grilling 技能时正好读到纪律，比 system prompt 里的抽象禁令有效得多（根因见 §8）。

## 2. 前置检查

- [ ] 已克隆本仓库（第 3–5 节从仓库取材料；没有仓库克隆时走附录 A）
- [ ] DSH 已安装、能正常启动
- [ ] `rsync` / `grep` / `find` 可用（macOS、Linux 自带）

本仓库里你要同步的成品（每个 preset 目录 = `agent.cordis.yml` + `preset.yml` + `skills/` + `README.md`；**README.md 不随 preset 安装**，同步时排除）：

```
presets/matt-standard/   技能 25 个
presets/matt-ptc/        技能 25 个
presets/matt-cordis/     技能 27 个（25 + cordis 随附 2：cordis-plugin-development、editing-cordis-compositions）
```

> 警告：下面同步用 `rsync --delete`，会**清空并重写** `~/.dsh/.agent-presets/<id>/`。想保留旧版先备份。

## 3. 安装 grilling 适配插件

### 方式 A（推荐，有仓库克隆）：从仓库本地同步

本仓库是本合集的事实源（可能含未发布的本地改点），优先用这种方式：

```bash
mkdir -p ~/.dsh/profiles/web/node_modules/@lynn123411/dsh-ask-user-grilling
rsync -a --delete plugins/dsh-ask-user-grilling/ \
  ~/.dsh/profiles/web/node_modules/@lynn123411/dsh-ask-user-grilling/
```

### 方式 B（无仓库克隆）：从 npm 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

### 验证

```bash
ls ~/.dsh/profiles/web/node_modules/@lynn123411/dsh-ask-user-grilling/   # 应看到 package.json + lib/
```

> 注意：profile 是 pnpm hoisted 布局，`pnpm install` / `dsh plugin add|remove` 重装后本地副本会被清掉，需要重新同步（重跑本节）。

## 4. 同步三个 preset 到 `~/.dsh/.agent-presets/`

在**仓库根目录**下执行：

```bash
for p in matt-standard matt-ptc matt-cordis; do
  mkdir -p ~/.dsh/.agent-presets/$p
  rsync -a --delete --exclude README.md presets/$p/ ~/.dsh/.agent-presets/$p/
  echo "$p synced"
done
```

### 验证：结构与技能计数

```bash
ls ~/.dsh/.agent-presets/matt-standard/                       # agent.cordis.yml preset.yml skills/
for p in matt-standard matt-ptc matt-cordis; do
  echo "$p: $(find ~/.dsh/.agent-presets/$p/skills -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ') SKILL.md"
done
# 期望：matt-standard 25 / matt-ptc 25 / matt-cordis 27
```

三份 `skills/grilling/SKILL.md` 应与仓库一致（逐字节相同）：

```bash
shasum ~/.dsh/.agent-presets/*/skills/grilling/SKILL.md        # 三个 hash 应相同
shasum presets/matt-standard/skills/grilling/SKILL.md          # 且与仓库成品一致
```

## 5. 行级自检（把脚本的自检逐条手工跑一遍）

| 检查项 | 命令 | 期望 |
|---|---|---|
| 插件工具行在位 | `grep -c '^    - id: tool-ask-user-grilling$' ~/.dsh/.agent-presets/matt-standard/agent.cordis.yml`（三个 preset 都查） | 各 `1` |
| customSkillDirs | `grep -c customSkillDirs ~/.dsh/.agent-presets/matt-standard/agent.cordis.yml` | `≥ 1`（matt-standard / matt-ptc 是 MATT-ADD 加的；matt-cordis 官方自带，同样应有） |
| grilling 旁注在位 | `grep -c 'DSH delivery' ~/.dsh/.agent-presets/matt-*/skills/grilling/SKILL.md` | `1/1/1` |
| persona 无 v2 纪律残留 | `grep -n 'Ask every question through the ask_user_grilling' ~/.dsh/.agent-presets/matt-*/agent.cordis.yml` | **无任何输出** |

技能计数（25/25/27）见 §4 验证；三条旁注（`DSH delivery` / `Sub-agent rounds` / `Consensus → plan mode`）可一次性确认：

```bash
for n in 'DSH delivery' 'Sub-agent rounds' 'Consensus'; do
  echo "== $n =="; grep -rl "$n" ~/.dsh/.agent-presets/matt-*/skills/grilling/
done
```

任一项不符 → 回到 §3/§4 重新同步；仍不符说明材料来源有问题，对照 §1 表格逐一排查。

## 6. 重启与使用

1. **重启 DSH**（standing 挂载与新插件描述才会生效）。
2. 新建会话，选择 preset：**Matt 标准** / **Matt PTC 模式** / **Matt 创造模式**。
3. 跑一个 grilling 会话开胃：`/grill-me <任意话题>`。

## 7. 验收一个 grilling 会话（check 的手工版）

先用 `/grill-me`（或任意触发 grilling 的表述）跑一个真实会话，给它一个值得盘的话题，答完几轮。

### 7.1 定位会话文件

```bash
find ~/.dsh/sessions -name session.jsonl.zstd | head
```

记下刚跑的那个会话的路径（形如 `~/.dsh/sessions/<目录>/session-<id>/session.jsonl.zstd` 或裸 `<id>` 目录）。

### 7.2 统计 grilling 工具调用

```bash
F=<上面定位到的会话文件路径>
zstd -dc "$F" | grep -o 'ask_user_grilling' | wc -l     # ≥ 1 即健康信号
```

原生 preset 的调用是 assistant 消息里的 tool-call；matt-ptc 下提问发生在 `run_code` 程序内（`tools.ask_user_grilling`），会话里以 `tool/code-dispatch` 事件呈现——上面的 `grep -o` 对两种形态都计数。

### 7.3 散文轮失守检测

散文轮 = 模型把轮次写成了消息文本（`Qn. **标题**` / `Recommended:` 段落）而没有调工具。近似扫描：

```bash
zstd -dc "$F" | grep '"assistant/message"' | grep -E 'Q[0-9]+[.、．\-:]'
```

有命中不代表一定失守——**目视核对**该条消息所在回合是否同回合有 `ask_user_grilling` 工具调用（事实前言以散文出现是允许的；只有【问题】必须进工具）：

```bash
zstd -dc "$F" | grep -B2 -A2 '"name": "ask_user_grilling"' | head -40   # 或直接看 DSH 会话界面
```

### 7.4 判读表

| 现象 | 结论 | 处置 |
|---|---|---|
| 有 grilling 调用（≥ 1）且无散文轮失守 | 健康（对应脚本 exit 0） | 收工 |
| 某回合的轮次是纯文本、同回合没调工具 | 散文轮失守（exit 2） | 按 §8 定位 |
| 调用数 0、也没见到轮次格式 | 无法判定（exit 3） | 换一个真 grilling 会话重测 |

## 8. 排错：散文轮失守的根因框架

按经验排序：

0. **具体样例 > 抽象禁令**：grilling 技能自带 `Qn.` / `Recommended:` 散文模板（"Format a round like so"），模型照抄具体样例的倾向强于遵守抽象规则——所以纪律必须写在技能文件里模板正下方（三段旁注），而不是只写在 persona。**检查**：`grep -c "DSH delivery" ~/.dsh/.agent-presets/matt-*/skills/grilling/SKILL.md` 应为 `1/1/1`；
1. **缺映射表**：`Qn.` 标题→`header`、正文→`question`、ABCD→`options`、`Recommended:` 推荐→置首 + `"(Recommended)"`——旁注里已内置；
2. **缺恢复指令**：已发散文轮→不道歉不改写，立即原样重发为一次工具调用；
3. **模型路由**：同一份材料下不同模型的纪律执行度差异巨大（可参考 `patches/ptc-preset-fusion-checklist/` 的跨模型对比），仍高发就换路由模型复测。

另：事实前言（"先把事实摆一下"）以散文出现是**允许**的，只有【问题】必须进工具；PTC preset 下提问经 `run_code` 程序内 `tools.ask_user_grilling`，其参数错误的排错另见 `patches/ptc-preset-fusion-checklist/`。

## 9. DSH 升级后的维护（原 upgrade 的手工版）

三个 matt 组合是官方文件的**确定性派生**（官方逐字 + banner + 两处 MATT-ADD），所以升级后不用人肉比对每一行，按下面两步走。

### 9.1 找出新版官方 presets 目录

```bash
# 常见位置二选一，看哪个存在：
ls "/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets" 2>/dev/null
ls "$(npm root -g 2>/dev/null)/@deepseek-ai/dsh-agent-presets/presets" 2>/dev/null
```

记下路径为 `OFF`。逐个组合 diff 官方原文件与仓库成品：

```bash
OFF=<官方 presets 目录>
for p in standard ptc cordis; do
  echo "== $p vs matt-$p =="
  diff "$OFF/$p/agent.cordis.yml" "presets/matt-$p/agent.cordis.yml" | head -80
done
```

### 9.2 读 diff（手工判读）

diff 输出里**预期的差异**只有两类（其余即官方带来的真实变化）：

- 仓库文件头部多一段自我描述注释（banner）；
- 标 `# MATT-ADD:` 的两处：`skill-filesystem` 下的 `customSkillDirs` 块；planning 组 plan-mode 段内的插件工具行。

判读：

- 除预期差异外**无其他行** → 官方没变（或变化不涉及派生内容），无需动作；
- 有新增/修改的官方行 → 逐条判断：是否与 MATT-ADD 冲突（如官方自己也给 `skill-filesystem` 加了 `customSkillDirs`）、plan-mode 段落结构变化是否影响 grilling 流程。确认无冲突后执行下面的**重贴流程**更新仓库。

### 9.3 重贴流程（确需更新时）

对每个受影响的组合（仓库根目录内操作）：

1. `cp "$OFF/<off>/agent.cordis.yml" presets/matt-<name>/agent.cordis.yml`（用官方新文件整体覆盖仓库文件）；
2. 在**文件开头**补回旧文件的 banner 注释（`# `matt-standard` = official ...` 到官方首行之前那段；从 git 历史或旧备份取）；
3. **重打 MATT-ADD 一**：定位 `- id: skill-filesystem` 段，若官方该段没有 `customSkillDirs`，在其 `name:` 行后插入（**matt-cordis 官方自带则跳过**）：

```yaml
  # MATT-ADD: discover the 25 vendored mattpocock skills shipped in ./skills/.
  config:
    customSkillDirs:
      - !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"
```

4. **重打 MATT-ADD 二**：定位 planning 组内 plan-mode 段结尾（锚点行 `do not proceed with implementation.`），在其后插入（**matt-ptc 加注 PTC 那行注释**）：

```yaml
    # MATT-ADD: grilling adaptations (@lynn123411/dsh-ask-user-grilling).
    # `enter_plan_mode` consumes the realm-isolated `planMode` service, so this
    # row must live inside the planning group; `ask_user_grilling` consumes
    # host-plane `userQuestions`/`subagents`, reachable from within the realm.
    # Under mode: ptc both tools are reached as `tools.<name>(...)` inside
    # `run_code` — see the grilling skill's DSH delivery note.
    - id: tool-ask-user-grilling
      name: '@lynn123411/dsh-ask-user-grilling'
```

> 若锚点找不到了（官方改了 `skill-filesystem` 行结构或 plan-mode 段落），先手工核对再插，别硬贴。

5. **核对 matt-cordis 的 cordis 随附技能**与官方同步（官方升级可能改这两个技能）：

```bash
for sk in cordis-plugin-development editing-cordis-compositions; do
  diff -rq "$OFF/cordis/skills/$sk" "presets/matt-cordis/skills/$sk" \
    || rsync -a --delete "$OFF/cordis/skills/$sk/" "presets/matt-cordis/skills/$sk/"
done
```

6. 重跑 §4 同步 + §5 自检，全绿后重启 DSH、跑一个 grilling 会话、按 §7 验收（exit 0 同义于健康），然后提交。

**Matt 技能上游更新是另一条线**：`git pull` [mattpocock/skills](https://github.com/mattpocock/skills) 后整体覆盖各 preset 的 `skills/` 下 25 个技能目录，再以仓库任一 `grilling/SKILL.md` 成品覆盖回 grilling（其余技能无本地改动），重新走 §4–§7。

## 附录 A：从零推导（没有仓库克隆，或想理解每一层时）

前提：有 DSH 安装（拿官方组合）与网络（拉 Matt 技能）。有仓库克隆时**不必**走这里——直接复制 §4 的成品更稳。

1. **下载 Matt 技能**：`git clone --depth 1 https://github.com/mattpocock/skills`，取其 `skills/` 下 25 个目录。
2. **复制原厂组合**：从 §9.1 定位的官方目录取 `standard/`、`ptc/`、`cordis/` 的 `agent.cordis.yml` 作为基底（顺便取各自 `preset.yml` 字段作参考）。
3. **打 MATT-ADD**：按 §9.3 的块一（`customSkillDirs`，cordis 自带则跳过）与块二（planning 组插件行，ptc 加 PTC 注释）插入。
4. **应用 grilling 本地适配**：grilling 的上游技能来自步骤 1，需 5 处编辑（**有仓库时直接用本仓库 `presets/*/skills/grilling/SKILL.md` 覆盖即可**——三份成品逐字节相同，就是上游 + 下面 5 处编辑的结果）：
   - 格式块 emoji 标记（问号/箭头）改写为纯文本 `Qn.` / `Recommended:`，模板上方引言行加注 `(plain-text markers, no emoji)`；
   - 格式块后插入旁注一 **DSH delivery**（映射表 + 恢复指令 + PTC `tools.<name>` 措辞，见成品第 24–29 行）；
   - 事实段中**删除**上游 "Don't block on it … ask the rest of the frontier now." 一句（与下一条冲突，有意删除）；
   - 事实段后插入旁注二 **Sub-agent rounds**（派遣即停轮，见成品第 35 行）；
   - 结尾插入旁注三 **Consensus → plan mode**（共识后直入 plan mode，见成品第 39 行）。
5. **写 preset.yml**：`name` + `description`（直接照抄本仓库 `presets/matt-*/preset.yml`，或用 `preset name:` 前缀命名空间避免与官方 preset 冲突）。
6. **写 `preset.yml` 同级的 `agent.cordis.yml`** 完成后，把整个目录（`agent.cordis.yml` + `preset.yml` + `skills/`）放入 `~/.dsh/.agent-presets/<id>/`，再按 §3 装插件。
7. **重启 DSH**，新会话选择对应 preset，按 §5–§7 自检与验收。

## 附录 B：定位锚点与常见位置速查

- **官方 presets 目录**：`/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets`；或 `$(npm root -g)/@deepseek-ai/dsh-agent-presets/presets`。
- **`agent.cordis.yml` 两个插入锚点**：`- id: skill-filesystem` 段（块一插在其后）；plan-mode 段结尾行 `do not proceed with implementation.`（块二插在其后）。
- **插件本地副本**：`~/.dsh/profiles/web/node_modules/@lynn123411/dsh-ask-user-grilling/`；npm 安装 `dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling`。
- **会话文件**：`~/.dsh/sessions/<目录>/session-<id>/session.jsonl.zstd`（或裸 `<id>` 目录），解压 `zstd -dc`。
- **grilling 技能旁注标识**：`DSH delivery`、`Sub-agent rounds`、`Consensus → plan mode`（grep 定位）；旁注行含 `(local adaptation — keep when syncing from upstream)`。
