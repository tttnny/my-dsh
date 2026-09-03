# ptc-preset-fusion-checklist — PTC 融合预设防错清单（经验总结）

> 写新的「PTC × 其他能力」融合 preset（如 `ptc-cordis`、`matt-ptc`）时，先读这份清单。
> 它来自**两次真实事故**的完整复盘：
>
> - **事故一**（ptc-cordis）：模型持续报 `missing required property "description"` —— 根因是 persona/技能没跟着融合，模型复制了内层工具的 `description`、漏了外层的。
> - **事故二**（matt-ptc + gemini-3.7-flash-high）：persona 已融合到位，模型仍 **78%** 调用报 `missing required property "code"` —— 根因是模型把「意图叙述」当调用发出（只发 `description`），加上 `exit_plan_mode` 大文档提交在 PTC 下的天然摩擦。
>
> 两次事故的共同结论：**composition 行级融合只是入场券，persona 契约融合与模型路由才决定失败率。**
>
> **适用范围**（v3 重构后）：失败形态（§1）、根因分层（§2）、模型路由教训（§4⑤）与诊断脚本（§6）适用于**一切 PTC 会话**（`ptc-cordis`、`matt-ptc`、官方 `ptc` 及未来融合）；§5 的 persona 契约文案当前仅 `ptc-cordis` 在用（`matt-ptc` 自 v3 起 persona 回归官方逐字，纪律改由技能旁注+插件描述承载，见 `patches/matt-presets-bootstrap/`），但它仍是新写 PTC 融合 preset 的推荐起点。

---

## 1. 失败形态总览

PTC 模式下 `run_code` 是唯一可直接调用的工具，其参数校验（`dsh-tools`，`ToolArgsError: INVALID_ARGS`）要求**顶层**必填 `code` + `description`。所有参数事故可按「外层 arguments 的顶层 keys」分类：

| 外层 keys | 报错 | 形态名称 | 性质 |
| --- | --- | --- | --- |
| `{code}` | `missing required property "description"` | **内外层混淆**：模型把 `description` 写进程序内 `tools.bash({...})`，外层漏传 | 事故一主因 |
| `{description}` | `missing required property "code"` | **叙述即调用**：模型把意图描述当成调用本身，程序体根本没发 | 事故二主因（gemini-flash 78%） |
| `{command, ...}` | `missing required property "code"` | **code↔command 混淆**：把 `run_code` 第一个参数名写成 bash 的 `command` | 同源混淆 |
| 直接调用 `<name>` | `unknown tool "<name>": only \`run_code\` is callable directly …` | **原生调用尝试** | persona/技能原生措辞残留 |
| 程序体本身 | `code run failed (exception): Expression expected` / `Expected ',', got 'ident'` | **JS 语法错**：最常见是 bash 命令串里单引号嵌套提前结束字符串 | 模型写作能力，文案可减不能根除 |
| `{"_truncated": …}` | `missing required property "code"; missing required property "description"` | **上下文截断 artifact**：harness 为省上下文截断历史调用参数后留下的记录 | 宿主噪声，**不算模型错误**，统计时剔除 |

## 2. 根因分层

按可控性从高到低排列。**第 0 层是事故二的新增教训，也是失败率的最大杠杆。**

0. **模型 PTC 纪律（路由问题）**：同一套融合到位的 persona 下，`qwen3.8-flash` 错误率 6–9%（且为语义级错误、可自愈），`muse-spark` 0%，而 `gemini-3.7-flash-high` 78%（机械级重复、 persona 逐字预言错误文本也拦不住）。**PTC preset 必须配经过实测的模型**，见 §4 ⑤。
1. **直接机制**：`run_code` 顶层必填 `code` + `description`，缺一即拒，程序体一个字节都不会被执行。
2. **模型认知陷阱**（三个，对应三种主要形态）：
   - **内外层同名**：SDK 示例里 `description` 出现两次——
     `run_code({ code: "return await tools.bash({ command: 'pwd', description: 'Show current directory' })", description: "Show current directory" })`
     ——模型复制内层那个、丢掉外层那个（→ `{code}` 形态）。
   - **`description` 参数文档是吸引子**：schema 里它写着 "Clear, concise description of what this program does… (shown in the UI)" 并附三个示例。对「爱叙述」的模型，只发 description 看起来就是一次有用的调用（→ `{description}` 形态）。
   - **报错文本的三缺口**：`missing required property "code"` 只说了缺什么，**没说收到了什么、没说什么都没执行、没给正确形态**。事故二的会话记录显示模型收到报错后的修复方向是**反复改 `description` 的措辞**（它唯一发出的参数），以及**原样重发**（触发 harness 防循环提示），甚至发「测试调用」探测——依然只发 description。报错单点纠错有效（前期失败后 1–3 轮内能恢复），但模型不把教训带到下一个意图。
3. **融合放大因素**（「融合遗漏」的实质）：
   - **persona 照搬**：直接把 cordis / matt 的长 persona 搬进 PTC 预设，通篇没提 PTC 契约；官方 `ptc` 预设刻意只用一句话 persona，让 SDK 区段主导注意力。系统提示里 persona 在最前、SDK 声明在最后，中间隔着数万字符的规则文本——persona 越长越把契约稀释。
   - **技能按原生调用编写**：技能里写「Call `cordis_inspect_list`」，PTC 下直接调报 `unknown tool`。
   - **大文档工具调用摩擦**：融合带来的流程终点动作（grilling 收尾 → `exit_plan_mode` 提交整份 markdown 计划）在 PTC 下变成「JSON 参数里嵌 JS 字符串字面量嵌 markdown」——PTC 最难的调用形态。事故二中模型在此**连续失败 14 次**，最终放弃工具、把计划贴成纯文本（恰好违反 plan-mode 规则），用户只能手动 `/plan off`。

## 3. 实证

### 事故一（ptc-cordis，修复前）

16 次 `run_code` 调用，8 败 8 成，分界线极其干净：

| 外层 `run_code` 参数 | 结果 |
| --- | --- |
| 只有 `{code}` | `invalid arguments: missing required property "description"` |
| `{code, description}` | 正常执行 |

### 事故二（matt-ptc + gemini-3.7-flash-high，persona 已融合）

45 次 `run_code` 调用：**35 败（78%）**、8 成、2 次截断 artifact。35 次失败**全部**是 `{description}` 单参数形态。失败后的恢复模式（对 §2.2 第三陷阱的直接证据）：

- **改措辞瞎猜**：`Submit the decision-complete execution plan…` → `Submit complete execution plan…` → `Submit migration plan…` → …（改的是 description，缺的是 code）
- **原样重发**：`Enter DSH plan mode` ×3、`Exit plan mode with full macOS conversion plan` ×3 → 触发 harness「重复相同调用」提示
- **探测也踩坑**：`Test simple code invocation`、`Test run code with simple exit_plan_mode` —— 想发测试调用，发出的还是只有 description
- 模型自己的 reasoning 曾正确诊断出参数名是 `code`，之后仍再错 25 次

### 跨会话对比（变量隔离）

| preset | 模型 | run_code 调用 | 参数错误 | 错误率 | 错误性质 |
| --- | --- | --- | --- | --- | --- |
| ptc | muse-spark-1.2-contributor | 9 | 0 | 0% | — |
| ptc-cordis | aliyun/qwen3.8-flash | 53 | 3 | 6% | 语义级（引号嵌套、edit 前未 read 等），可自愈 |
| ptc-cordis | aliyun/qwen3.8-flash | 152 | 13 | 9% | 同上 |
| matt-ptc | antigravity-tools/gemini-3.7-flash-high | 45 | 35 | **78%** | 机械级，同一形态重复 35 次 |

## 4. 融合检查清单（新融合 preset 逐项过）

- [ ] **① 先定呈现模式**：`mode: ptc`（只见 run_code）/ `both`（原生 + run_code 并存）/
      `native`（不融合 PTC）。定了就写进 `agent.cordis.yml` 注释、`preset.yml`、
      `README.md`、根 `README.md` 四处；**改 mode 必须同步改全套文档**
      （本仓库曾发生 HEAD 是 `both`、工作区改成 `ptc` 且未提交，导致「装的版本
      ≠ 仓库版本」的隐患）。
- [ ] **② persona 融合，不是照搬**：开篇（身份句之后）声明 PTC 契约，用 §5 的
      **v2 标准文案**（含 WRONG/RIGHT 对照、报错恢复指令）；**点名本预设专属工具**
      （如 grilling 的 `ask_user_grilling` / `ask_user_question`，
      cordis 的 `cordis_define` / `cordis_inspect_*`），告诉模型它们同样只能经
      `tools.x()` 到达。
- [ ] **③ 技能注释策略**：核心工具集技能（如 cordis 的两个）在文件头部加一段
      「PTC 模式适配」说明；通用技能（如 matt 25 件套）不加，靠 persona 里的
      统一换算规则覆盖，避免侵入性改动。
- [ ] **④ mode 与 persona 措辞一致**：`both` 模式下原生调用**照常执行**，persona
      绝不能写「唯一可直接调用的是 run_code」（那是 ptc 模式的表述）。
- [ ] **⑤ 模型路由（事故二新增，最大杠杆）**：给 PTC preset 配**实测过 PTC 纪律**的
      模型。参考 §3 对比表：`qwen3.8-flash` / `muse-spark` 可用；
      `gemini-3.7-flash-high` 在 PTC 下 78% 失败，**只配给原生模式 preset**
      （如 matt-standard）。接新模型时先跑一个 10 步以内的 PTC 冒烟会话，
      用 §6 脚本统计错误形态再决定路由。
- [ ] **⑥ 大文档提交路径（事故二新增）**：凡流程终点需要「提交大段 markdown」的工具
      （`exit_plan_mode` 是典型），persona 里必须给具体写法（§5 末尾提醒行已含）：
      程序内用模板字面量组装、计划文本避免反引号与 `${`、用缩进代码块替代围栏
      代码块、同一程序内提交。
- [ ] **⑦ 同步本地安装**：`~/.dsh/.agent-presets/<id>/` 只复制 `agent.cordis.yml` +
      `preset.yml` + `skills/`（**排除 README.md**），并保持仓库与本地一致
      （`diff` 验证）。
- [ ] **⑧ 验证分两关**：
      1. **挂载校验**：改动后跑 `agentPresets.standingKeyFor('<id>')`（可挂一个
         注入 `agentPresets` 的临时动态插件来调），确认 composition 真实可挂载；
      2. **新会话实测**：persona 只对**新建**会话生效（standing mount 在进程内常驻，
         改动后重启 DSH 再开新会话），用 §6 脚本统计 `missing required property` /
         `unknown tool` 是否再现。

## 5. 标准 persona 契约文案（v2，可直接粘贴）

插在 persona `text:` 的身份句之后、原有内容之前。**ptc 版**（三段 + 末尾提醒，
即 `ptc-cordis` 当前在用的加固版；`matt-ptc` 自 v3 重构（2026-09-03）起 persona
已回归官方 `ptc` 逐字、不再携带任何加固文案——其 grilling 纪律改由
`skills/grilling/SKILL.md` 旁注与插件工具描述承载，见
`patches/matt-presets-bootstrap/`）：

```text
This session presents every tool in PTC mode: the ONLY tool you may call directly is `run_code`, and it takes two REQUIRED top-level arguments — `code` (the body of an async program) and `description` (a short summary of the program). These are top-level arguments of `run_code` itself: the `description` you pass inside the program to another tool, like `tools.bash({ description, ... })`, is a DIFFERENT argument and does not satisfy the requirement. The first argument is named `code` (the program body), NOT `command` — `command` is `tools.bash`'s parameter name, and calling `run_code({ command, description })` fails with `missing required property "code"`.

A call that carries only `description` — `run_code({ description: "..." })` — executes NOTHING: it is rejected before your program is read, the turn is wasted, and rephrasing the description changes nothing. NEVER narrate intent through `run_code`; narration belongs in your plain reply text. Minimal pair:

- WRONG: `run_code({ "description": "List top-level files" })` → rejected with `missing required property "code"`, nothing ran
- RIGHT: `run_code({ "code": "return await tools.glob({ pattern: \"*\" })", "description": "List top-level files" })` → runs

If a call is rejected with `Error: invalid arguments: missing required property "code"` (or `"description"`), your call omitted that TOP-LEVEL argument and nothing executed. Do not rephrase the description, do not probe with test calls, and do not repeat the same payload: immediately resend the SAME intent as ONE complete `run_code({ code, description })` call.

Every other tool (bash, fs, skill, subagent, <本预设专属工具>, ...) is reached ONLY from inside a `run_code` program as `await tools.<name>(args)` — e.g. `await tools.<本预设专属工具>({...})`. A direct call to any other tool fails with `unknown tool`. The rules and skill documents below are written in native-tool wording ("call <工具名>"): interpret every such instruction as a `tools.<name>(...)` call inside a `run_code` program, and include that program's own top-level `code` AND `description`. When a bash command itself contains single quotes, wrap the whole command in a template literal (backticks) or double quotes — nesting single quotes inside a JS single-quoted string (e.g. `command: '... require('$D/...') ...'`) ends the string early and the program fails to parse (`code run failed (exception): …`, e.g. `Expression expected` or `Expected ',', got 'ident'`).
```

末尾再补一句总提醒（含事故二的 exit_plan_mode 指引）：

```text
— and remember: in this session you reach every tool, including <本预设专属工具> / exit_plan_mode, through `tools.<name>(...)` inside `run_code({ code, description })`. For exit_plan_mode, build the plan markdown as a template literal inside the program (avoid backticks and ${ sequences in the plan text — use indented code blocks instead of fenced ones) and submit it in the same program: assign the template literal to a `plan` variable, then `return await tools.exit_plan_mode({ plan })`.
```

**both 版**（原生调用照常，所以措辞不同；恢复指令同样适用）：

```text
This session presents tools in PTC mode: `run_code` executes a program against the generated SDK and takes two REQUIRED top-level arguments — `code` (the body of an async program) and `description` (a short summary of the program). The top-level `description` of `run_code` is a DIFFERENT argument from any `description` you pass to a tool inside the program, like `tools.bash({ description, ... })` — both must be present. If a call is rejected with `Error: invalid arguments: missing required property "code"` (or `"description"`), your call omitted that TOP-LEVEL argument and nothing executed: resend the SAME intent as ONE complete `run_code({ code, description })` call.

Every tool you do NOT call natively can also be reached from inside a `run_code` program as `await tools.<name>(args)`. Skill documents are written in native-tool wording; interpret them as either a native call or a `tools.<name>(...)` call inside `run_code`.
```

## 6. 排查方法（下次再遇到时）

用随附诊断脚本一步拿到形态分布（推荐）：

```bash
bash patches/ptc-preset-fusion-checklist/ptc-preset-fusion-checklist.sh <session-id>
# 或直接给文件路径
bash patches/ptc-preset-fusion-checklist/ptc-preset-fusion-checklist.sh \
  ~/.dsh/sessions/<workspace-dir>/<session-id>/session.jsonl.zstd
```

手工等价命令：

```bash
# 1. 解压目标会话日志，数一下错误
unzstd -c ~/.dsh/sessions/<workspace-dir>/<session-id>/session.jsonl.zstd \
  | grep -o 'invalid arguments[^"]*' | sort | uniq -c

# 2. 核对 run_code 外层参数（每一条 tool/call name=run_code 的 arguments 顶层 keys）
python3 - <<'EOF'
import json
for line in open('/tmp/s.jsonl'):
    r = json.loads(line)
    if r.get('type') == 'tool/call' and r['data'].get('name') == 'run_code':
        print(list(json.loads(r['data']['arguments']).keys()))
EOF
```

按外形分支定位：

- 外层只有 `['description']` → **叙述即调用**。persona 已含 v2 文案仍高发 → 是 §2 第 0 层
  问题，**换模型**（§4 ⑤）；同时观察失败后的恢复模式：改 description 措辞 = 报错三缺口
  在起作用，原样重发 = 模型完全没读报错。
- 外层只有 `['code']` → 内外层 description 混淆，确认 persona 是否用 §5 v2 文案。
- 外层是 `['command','description']` → `code↔command` 混淆，§5 文案已内置纠正。
- `unknown tool "<name>"` → 模型尝试原生调用，persona/技能没融合到位（§4 ②③）。
- `code run failed (exception): Expression expected` / `Expected ',', got 'ident'`
  → 程序体 JS 语法错（单引号嵌套最常见），属模型写作能力，文案可减不能根除。
- `{"_truncated": …}` → 上下文截断 artifact，宿主噪声，统计时剔除。

**报错文本的三缺口是宿主侧问题**：`ToolArgsError: INVALID_ARGS` 的文案（只说缺什么、
不说收到什么/什么都没执行/正确形态）对所有模型都增加了恢复成本。preset 层只能用
persona 补译（§5 已做）；根治候选是宿主补丁——在参数校验失败时输出
「received keys: […] / nothing was executed / expected shape: run_code({ code, description })」。
如要做，按本仓库 patches/ 惯例新立一个补丁目录。

## 7. 背景与边界

- 官方 `ptc` 预设存在同样的机制性风险（`mode: ptc` 一样折叠），但它属于部署内置
  预设、不可修改——这正是**融合版预设要自带 persona 契约**的原因。
- 落地记录：
  - **v1**（事故一后）：`presets/ptc-cordis/` persona + 两个 Cordis 技能头部注释、
    `presets/matt-ptc/` persona（含 grilling 工具点名）。
  - **v2**（事故二后）：`presets/matt-ptc/` 与 `presets/ptc-cordis/` persona 同步加固
    （WRONG/RIGHT 对照、「nothing executed」后果声明、报错恢复指令、exit_plan_mode
    模板字面量指引），均已同步 `~/.dsh/.agent-presets/` 并通过
    `agentPresets.standingKeyFor` 挂载校验。standing mount 进程内常驻，
    **改动后需重启 DSH 再开新会话验证**。
  - **v3**（2026-09-03 重构）：`presets/matt-ptc/` persona 回归官方 `ptc` 逐字，
    v2 加固文案随之移除（其中 grilling 纪律改入 `skills/grilling/SKILL.md` 旁注 +
    插件工具描述，见 `patches/matt-presets-bootstrap/`）；`presets/ptc-cordis/`
    不在该次重构范围，v2 文案继续保留。本节 §5 的契约文案仍是新写 PTC 融合
    preset 时的推荐起点。
- `presets/matt-cordis/` **不适用本清单的 persona 契约**（2026-09 复查确认）：它是
  §4 ① 中的 `native` 融合——无 `tool-presentation` 行、无 `run_code`，全部工具
  （含 `cordis_define` 等）直接原生调用，`missing required property` / `unknown tool`
  两类错误在该预设下不可能发生；给它注入 PTC 契约反而违反 §4 ④。两个 Cordis 技能
  保持原生措辞（头部注释自我标注「仅 ptc-cordis 预设」）属正确状态。其余修复项
  （preset.yml 引号、command-goal、modelSelectionSettings、stale 预设名）经复查
  matt-cordis 均已具备，仓库与 `~/.dsh/.agent-presets/` 同步一致。
- 实测校准：v1 修复后 ptc-cordis + qwen3.8-flash 的 `missing required property`
  从约 50% 降到个位数且「外层漏 description」归零（剩余为 `code↔command` 与
  引号嵌套）；但事故二证明 **persona 加固只能压低「恢复成本」，压不住模型的
  首发失败习惯**——gemini-3.7-flash-high 在 persona 逐字预言错误文本的情况下仍
  78% 失败。persona 与模型路由两手都要硬。
- 相关补丁：[patch-dsh-cordis-inspect-idempotent](../patch-dsh-cordis-inspect-idempotent/README.md)
  解决的是另一个问题（含 `tool-cordis` 的预设同进程互斥），与本清单不冲突。
