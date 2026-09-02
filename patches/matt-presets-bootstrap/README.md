# matt-presets-bootstrap — 新机器构建三个 matt preset 的指导与脚本

在一台新机器上构造 `matt-standard` / `matt-ptc` / `matt-cordis` 三个 preset 的完整指南。读完你会理解每个材料的来源与作用；不想读就直接跑脚本（[§3](#3-一键构建脚本)）。

## 1. 设计思想（为什么这样组装）

三个 matt preset = **DSH 原厂 preset 逐字** ＋ **Matt 的整套技能** ＋ **一个 grilling 适配插件**：

| 材料 | 来源 | 作用 |
|---|---|---|
| 原厂组合 `standard` / `ptc` / `cordis` | DSH 安装自带（macOS：`/Applications/DSH Desktop.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh-agent-presets/presets/`） | 基底。原厂写得标准，**persona 一行不改**——工具调用报错即模型问题，不怀疑组合 |
| Matt 的 25 个技能 | [mattpocock/skills](https://github.com/mattpocock/skills) | 工程/生产力技能库，vendor 进各 preset 的 `skills/`（matt-cordis 再并入 cordis 自带 2 个，共 27 个） |
| `@lynn123411/dsh-ask-user-grilling` | npm / 本仓库 `plugins/dsh-ask-user-grilling/` | grilling 输送层：`ask_user_grilling`（子代理闸门/强制多选/补充机制）+ `enter_plan_mode` |
| grilling 本地旁注 | 本仓库 `presets/*/skills/grilling/SKILL.md` 内三段引用块 | grilling 纪律的唯一载体：强制 `ask_user_grilling`（含映射表）、子代理停轮、共识后直入 plan mode |

原则：**纪律不写进 persona**（曾写过，v2 架构），而是下沉到「技能模仿点 + 插件工具描述」——模型加载 grilling 技能时正好读到纪律，比 system prompt 里的抽象禁令有效得多（根因见 §5）。

## 2. 从零推导（理解用；有仓库克隆则不必手工做）

1. **下载 Matt 技能**：`git clone --depth 1 https://github.com/mattpocock/skills`，取其 `skills/` 下 25 个目录。
2. **复制原厂组合**：从 DSH 安装目录取 `standard/agent.cordis.yml` 等三份，作为三个 preset 的基底。
3. **打 MATT-ADD 附加改动**（每个文件头部注释有完整指引；官方行零删除）：
   - `skill-filesystem` 行加 `config.customSkillDirs` 指向 `./skills/`（cordis 自带，跳过）；
   - `planning` 组内（`isolate: planMode`）追加工具行 `- id: tool-ask-user-grilling` / `name: '@lynn123411/dsh-ask-user-grilling'`——必须留在组内，因为 `enter_plan_mode` 消费 realm 隔离的 `planMode` 服务。
4. **写入 grilling 旁注**：把本仓库 `presets/matt-standard/skills/grilling/SKILL.md` 的三段引用块（DSH delivery / Sub-agent rounds / Consensus → plan mode）合入上游 grilling 技能（格式块后、结尾处）。
5. **写 preset.yml**：`name` + `description`（参考本仓库各 preset）。
6. **安装插件**：`dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling`。
7. **同步**：三 preset 目录（`agent.cordis.yml` + `preset.yml` + `skills/`，不含 README.md）放入 `~/.dsh/.agent-presets/<id>/`。
8. **重启 DSH**，新会话选择对应 preset。

## 3. 一键构建脚本

前置：已克隆本仓库（脚本从仓库同步插件——仓库可能含未发布的本地改点，是本合集的事实源；没有仓库时才用 `dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling` 从 npm 装）；DSH 已安装。

```bash
# 构建/更新三个 preset 并安装插件（幂等，可反复跑）
bash patches/matt-presets-bootstrap/matt-presets-bootstrap.sh

# 或显式
bash patches/matt-presets-bootstrap/matt-presets-bootstrap.sh setup
```

脚本动作：① 检查依赖与材料完整性；② 安装/本地同步 `dsh-ask-user-grilling` 插件；③ rsync 三 preset 到 `~/.dsh/.agent-presets/`（排除 README.md）；④ 自检（MATT-ADD 标记数、技能计数 25/25/27、grilling 旁注在位）；⑤ 打印后续步骤（重启 DSH、跑一个 grilling 会话、用 check 验收）。

## 4. 验收（check 子命令）

构建后跑一个真实 grilling 会话（`/grill-me` 随便给个话题），然后：

```bash
bash patches/matt-presets-bootstrap/matt-presets-bootstrap.sh check <session-id>
```

健康输出：`ask_user_grilling 调用 ≥ 1`、`散文轮检测: 未命中`。若散文轮失守（模型把 Qn./Recommended: 整轮写成纯文本而不调工具），按 §5 定位。

## 5. 排错（前 grilling-prose-fallback 补丁的根因框架）

散文轮失守的根因按经验排序：

0. **具体样例 > 抽象禁令**：grilling 技能自带 Qn./Recommended: 散文模板（"Format a round like so"；上游原为 emoji 问号/箭头标记，本仓库已替换为纯文本），模型照抄具体样例的倾向强于遵守抽象规则——所以纪律必须写在技能文件里模板正下方（本仓库的三段旁注），而不是只写在 persona。**检查**：`grep -c "DSH delivery" ~/.dsh/.agent-presets/matt-*/skills/grilling/SKILL.md` 应为 1/1/1；
1. **缺映射表**：Qn. 标题→`header`、正文→`question`、ABCD→`options`、Recommended: 推荐→置首+"(Recommended)"——旁注里已内置；
2. **缺恢复指令**：已发散文轮→不道歉不改写，立即原样重发为一次工具调用；
3. **模型路由**：同一份材料下不同模型的纪律执行度差异巨大（参考 `patches/ptc-preset-fusion-checklist/` 的跨模型对比），仍高发就换路由模型复测。

注意：事实前言（"先把事实摆一下"）以散文出现是**允许**的，只有【问题】必须进工具；PTC preset 下提问经 `run_code` 程序内 `tools.ask_user_grilling`，其参数错误的另见 `patches/ptc-preset-fusion-checklist/`。
