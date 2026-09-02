# grilling-prose-fallback：grilling「散文轮」失守的诊断与加固经验

matt-standard / matt-cordis / matt-ptc 三个 preset 都出现过同一事故：grilling 会话里模型把整轮问题写成 `❓ **Q1** … ➡️ 推荐` 的**散文 markdown**，而不是调用 `ask_user_grilling` 工具。本目录记录根因框架、已落地的两层加固，以及一个诊断脚本。

## 1. 症状

参照会话 `session-5ed25954-7a67-4504-a40b-c715194c2903`（`/grill-me @plugins/dsh-mattpocock-skills-deck`，aliyun/qwen3.8-flash max）：

- system prompt 含 grilling 纪律、`ask_user_grilling` 在工具清单中；
- 模型正确加载 `grilling` 技能、正确地先自查源码（"事实是你的工作"做到了）；
- 第一轮把 6 道题整轮写成散文（❓ Q1–Q6 + ➡️ 推荐），**`ask_user_grilling` 0 次调用**——用户拿到的是不可点击的纯文本，轮末补充问题与表单 UI 全部丢失。

## 2. 根因框架（与 PTC run_code 事故同构）

| 层 | 机制 | 说明 |
|---|---|---|
| 0 | **具体样例 > 抽象禁令** | `grilling/SKILL.md` 的 "Format a round like so" 块是一个带 ❓/➡️ 的具体散文模板，对模型等同于 few-shot 样例；persona 里一行 "never fall back to prose questions" 是抽象禁令。模仿具体样例的牵引力系统性胜出。 |
| 1 | **缺映射表** | 散文元素（❓标题/正文/ABCD 选项/➡️推荐）到工具字段（`header`/`question`/`options`/首项+"(Recommended)"）的翻译原本要模型自己做；翻译成本高的路径输给照抄。 |
| 2 | **缺恢复指令** | 已经写成散文后没有"怎么办"的指引。 |
| 3 | **模型路由** | 结构性问题不挑模型，但纪律执行度仍随模型差异巨大（参见 `patches/ptc-preset-fusion-checklist/` 的跨模型对比）。 |

## 3. 已落地的加固（A+B 两层）

**A. persona 加固**（`presets/matt-{standard,cordis,ptc}/agent.cordis.yml`，禁令行之后）：

- 点破第 0 层："Format a round like so" 描述的是轮次的**逻辑结构**，不是投递渠道；
- **WRONG/RIGHT 最小对**：散文轮 vs 同一轮的一次 `ask_user_grilling` 调用（matt-ptc 版为 `run_code` 程序内 `tools.ask_user_grilling`，含顶层 `code`+`description` 提醒）；
- **元素映射表**：`❓ Qn` 标题→`header`、正文→`question`、A/B/C→`options`、`➡️` 推荐→该选项置首并追加 "(Recommended)"；
- **恢复指令**：已发散文轮→不道歉、不用散文改写，立即把同一轮原样重发为一次工具调用；
- 边界澄清：事实前言可留在正文，**问题**必须进工具。

**B. 技能模仿点纠偏**（三个 preset 的 `skills/grilling/SKILL.md` 格式块正下方）：

- 加了一段 "DSH delivery" 旁注，在模型照抄模板的位置直接声明：该格式是逻辑结构，DSH 中整轮走一次 `ask_user_grilling` 调用，并给出同一张映射表。
- ⚠️ **上游同步注意**：`skills/` 是 mattpocock/skills 的 vendor 副本，重新从上游同步时这段旁注会被覆盖，需重打（三份副本原本逐字节相同，补丁也保持一致）。

**C.（未做，候选）宿主侧兜底**：nudge 插件检测 assistant 消息出现 `❓ **Q` 模式而当轮无 `ask_user_grilling` 调用时注入提醒（类似 anti-loop nudge）。先观察 A+B 效果再决定。

## 4. 诊断脚本

```bash
# 会话 id（带不带 session- 前缀均可）或直接给 .zstd 路径
bash patches/grilling-prose-fallback/grilling-prose-fallback.sh 5ed25954-7a67-4504-a40b-c715194c2903
```

输出：preset / 模型 / 技能是否加载、`ask_user_grilling` 与 `ask_user_question` 调用数、散文轮命中列表（区分"散文只是事实前言、同轮有工具调用"与"整轮失守"），并按 §2 框架给出定位提示。

## 5. 验证与注意事项

- 改动已同步 `~/.dsh/.agent-presets/`，三 preset 均通过 `agentPresets.standingKeyFor` 挂载校验；
- persona 改动需**重启 DSH** 后才对 standing 挂载生效；之后开 grilling 真会话，用 §4 脚本复查应为「散文轮检测：未命中」或仅"前言 OK"；
- 若仍失守：先确认会话 system 确实含 v2 persona（重启生效），再按 §2 第 3 层换路由模型复测。
