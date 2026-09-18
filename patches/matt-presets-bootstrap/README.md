# matt-presets-bootstrap — 三个 matt preset 的手工改动点说明

三个 matt preset（`matt-standard` / `matt-ptc` / `matt-cordis`）＝ **官方组合逐字** ＋ **Matt 的 26 个技能** ＋ **grilling 适配插件**（`ask_user_grilling`）－ 普通提问工具（`tool-ask-user` 行原位换成 `ask_user_grilling`，§一 改动②）。本文逐处说明相对官方材料**改了什么、改成什么样、为什么**；本目录为纯文档，由 AI 按本文执行。仓库 `presets/matt-*/` 就是改好的成品，直接同步即用；以下改动点只在「从零组装 / DSH 升级后重打」时需要动手。

改动只发生在两类文件上：`agent.cordis.yml`（官方正文上一处插入、一处工具行原位替换）与 `skills/grilling/SKILL.md`（本地适配两处：格式块与投递旁注，改动内容为中文）。`matt-standard` 与 `matt-cordis` 的 `grilling/SKILL.md` 完全相同；`matt-ptc` 只在投递旁注描述投递的那半句上按 PTC 形态表述（`run_code` 程序内 `tools.ask_user_grilling`，见 §二 改动②），PTC 措辞不进入非 PTC preset。persona 一行不改——grilling 纪律不写进 persona，而是下沉到技能正文的旁注：模型读到技能时正好看到，比 system prompt 里的抽象禁令有效。插件只改表单呈现，工具描述与共有参数描述同原生逐字一致，不承载任何纪律。

## 零、当前基线

- 官方基底：**DSH 0.1.6-alpha.2** / `@deepseek-ai/dsh-agent-presets@0.1.6-alpha.2`。官方正文位置：安装目录 `node_modules/.pnpm/@deepseek-ai+dsh-agent-presets@<ver>*/node_modules/@deepseek-ai/dsh-agent-presets/presets/{standard,ptc,cordis,minimal}/agent.cordis.yml`。
- 成品与官方正文的差异**恰为** §一 那两处改动块 + §二 的 grilling 技能正文；多一处都是官方漂移或漏派生。
- 两处改动块：`customSkillDirs` 插入（块首行 `# MATT-ADD:`），以及 `tool-ask-user` 行的原位替换（行上一行 `# MATT-DEL:` + 四行 `# MATT-ADD:`）。
- persona 行逐字取官方正文，仓库不保留旧写法（官方偶有键级改名）。

## 一、`agent.cordis.yml`：一处插入 + 一处原位替换

结构：官方正文逐字，只在两处动手——`skill-filesystem` 段插入 `customSkillDirs`；`remaining model-facing rows` 段把 `tool-ask-user` 行**原位换成** `tool-ask-user-grilling`（提问槽位始终只放一个工具，所以是替换而不是另加一行）。

- **改动 ① `customSkillDirs`**：`- id: skill-filesystem` 段的 `name:` 行之后插入（**matt-cordis 官方自带此块，跳过**）。**原因**：26 个技能是 vendor 进 `skills/` 的额外目录，skill-filesystem 默认不扫它——不加此块模型根本发现不了、也调不到这些技能：

```yaml
  # MATT-ADD: discover the 26 vendored mattpocock skills shipped in ./skills/.
  config:
    customSkillDirs:
      - !!js "process.getBuiltinModule('node:url').fileURLToPath(new URL('skills/', baseUrl))"
```

- **改动 ② `tool-ask-user` → `tool-ask-user-grilling`**：`remaining model-facing rows` 组内的 `- id: tool-ask-user` 块整块换成下面这个块（三份内容相同）。`# MATT-DEL:` / `# MATT-ADD:` 标记是升级 diff 审查识别「预期差异」的依据，勿删：

```yaml
# MATT-DEL: upstream tool-ask-user row removed.
# MATT-ADD: replaced in place by tool-ask-user-grilling — the same form with
# forced multi-select and an auto-appended round-end supplement question. Skills
# ship upstream-verbatim except grilling (DSH-delivery note, see
# patches/matt-presets-bootstrap/README.md section 2).
- id: tool-ask-user-grilling
  name: '@lynn123411/dsh-ask-user-grilling'
```

**原因**：一问一答只留一个工具——所有提问一律走 `ask_user_grilling`（原生 `ask_user_question` 的表单呈现变体：强制多选 + 自动追加轮末补充题 + 可选题号参数 `number`），普通提问工具不再保留，所以直接在原槽位替换。该行放在 planning 组**之外**（普通工具区）即可，因为 `ask_user_grilling` 只消费 host-plane 的 `userQuestions`、无 realm 依赖，也不提供任何 plan-mode 工具（共识达成后交还用户决定下一步）。副作用一并接受：一切提问（plan mode 追问、简单确认）都被强制多选并自动追加轮末补充题；官方 plan-mode 正文两处点名的 `ask_user_question` 悬空（逐字不能改，不管）。

## 二、`skills/grilling/SKILL.md`：本地适配两处

上游文件逐字保留（frontmatter + 五段英文正文），只改格式块与投递旁注。改动① 的模板占位与改动② 的旁注为中文，上游其余正文英文原样。

- **改动 ① 格式块**：上游 `Format a round like so:` 之后那段用 emoji 标记、题干占位含 `including multiple choices`（诱导把选项塞进题干）；改成纯文本，选项独立成 `Options:` 块、推荐独立一行，并给出英文与中文两份示例（中文示例用 `选项:` / `推荐:` 标签）。**原因**：模板是模型最可能整段照抄的样例——emoji 会被抄进输出、『选项塞正文』的占位会诱导模型把 A/B/C 写进题干；选项独立成块后与投递字段一一对应，两份示例让中文会话也拿到中文标签。成品（三份 preset 相同）：

```
Q1. **<question title>**: <question body, might be multiple paragraphs>

Options:
- A: <option A>
- B: <option B>
- C: <option C>

Recommended: <your recommended answer>

---

Q2. **<问题标题>**: <问题正文，可能包含多个段落>

选项:
- A: <选项 A>
- B: <选项 B>
- C: <选项 C>

推荐: <您的推荐答案>
```

- **改动 ② 投递纪律旁注**：格式块之后新增一段引用（中文）：每一轮分两步投递——先在消息文本里按模板以散文预告本轮全部问题（标题/正文/选项/推荐），在**同一回合内**紧接着把同一轮作为一次 `ask_user_grilling` 调用发出、让用户在表单中作答；旁注只保留一条 bullet——散文预告与工具投递必须**同一轮、一一对应**（提问工具由前一句点名、轮末补充题由代码自动追加，二者不重复写进旁注）。字段组织细节（题号→`number`、标题→`header`、正文→`question`、选项→`options`、推荐项放首位并在标签末尾加 `(Recommended)`）不写进旁注，由模板与工具的参数描述承载。**原因**：纯散文让用户拿到不可点击文本、丢失表单；纯工具又让用户看不到正文里的问题陈述——散文预告 + 工具表单各司其职，且必须成对出现。

`matt-standard` / `matt-cordis` 的旁注全文：

```markdown
> **DSH delivery：** 每一轮分两步投递：先在消息文本里**以散文预告这一轮的全部问题**（标题、正文、选项与推荐），在**同一回合内**紧接着把**同一轮**作为**一次** `ask_user_grilling` 调用发出，让用户在表单中作答：
>
> - 散文预告与工具投递必须**同一轮、一一对应**。
```

`matt-ptc` 只把旁注里描述投递的那半句替换成：

```markdown
在**同一回合内**紧接着再在 `run_code` 程序内用 `return await tools.ask_user_grilling({ questions: [...] })` 把**同一轮**作为**一次**调用投出，让用户在表单中作答：
```

**上游英文正文不动**：格式块前后的英文正文、以及事实段那句 `Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now.` 均为上游逐字；仓库不保留曾经的「删 Don't block 句 + 子代理等齐旁注」写法。

## 三、其余文件（无本地改动或自写）

- `skills/` 其余 25 个技能：来自 [mattpocock/skills](https://github.com/mattpocock/skills) **原样 vendor，无改动**；其中 `implement-spec` 上游归在 `skills/in-progress/`（beta、官方明确不随插件分发），本仓库按快照一并 vendor。matt-cordis 额外含 cordis 官方随附 2 技能（`cordis-plugin-development`、`editing-cordis-compositions`），同样原样随官方同步。**原因**：上游即权威来源，逐字复制可整体随上游替换、仓库侧零 diff 维护（grilling 是唯一有本地改动的例外）。
- `preset.yml`：自写两行 `name` / `description`。三份 `name` 分别为「Matt 标准 / Matt PTC 模式 / Matt 创造模式」；`description` 各写一句话，大意都是「官方组合（persona 零改动）＋ Matt 的 26 个技能 ＋ grilling 适配插件，共识后不自动进入 plan mode」（三份措辞各见实物：standard 强调先散文预告再表单投递，ptc 强调模型只见 run_code，cordis 强调随附技能与 tool-cordis）。**原因**：preset 名与说明显示在 DSH 的会话选择器上，需要用户可读的名称与一句话说明。

## 四、外部材料（非改动、需自带）

- 插件 `@lynn123411/dsh-ask-user-grilling`（`ask_user_question` 的表单呈现变体：同一条 `ctx.userQuestions` seam，工具描述与共有参数描述**与原生逐字一致**，只强制多选、把可选题号参数 `number` 并进 `header`、并自动追加一道轮末补充题；多选刻意不写进描述，避免模型为规避多选而影响出题质量）：**必须经注册安装**——`cd ~/.dsh/profiles/web && pnpm add @lynn123411/dsh-ask-user-grilling@<版本>`（写进 package.json 依赖）。**不要手工拷贝进 `node_modules/@lynn123411/`**：未注册的裸拷贝会在任何 pnpm 同步（如插件市场批量更新）时被当 extraneous 剪掉，而 roster 对每份 preset 做行可解析性健康检查（`unresolvableRows`）——此插件一旦被剪，**引用它的三份 preset 会整体从模式选择里消失**。仓库 `plugins/dsh-ask-user-grilling/` 是事实源；回装前先用 `npm view` 确认 registry 已发布该版本，仓库含未发布改点时先发布再回装。**原因**：§一 改动② 引用的正是这个包，不装则工具行解析失败；它只负责表单呈现（共有描述与原生一致），grilling 纪律全部由技能正文承载。
- 26 个技能随 mattpocock/skills 上游更新。

## 五、何时重打

- **DSH 升级后**：官方 `standard/ptc/cordis` 组合更新 → 以新版官方正文覆盖仓库文件，按第一节重打那两处改动（改动① 的锚点是 `skill-filesystem` 段的 `name:` 行；改动② 的锚点是 `remaining model-facing rows` 里的 `- id: tool-ask-user` 块——官方若改了这两处结构则需手工定位），并**逐行核对官方新增行是否已全部纳入**——官方会在组合里新增工具行，只 diff 这两个改动块看不出来，必须对「官方正文 vs 仓库成品」做**全量 diff**；matt-cordis 的两个 cordis 随附技能如有变，从官方 `cordis/skills/` 覆盖。**persona 行始终逐字取官方正文**，不要保留仓库旧写法。
- **重打后的校验**：① `diff <官方> <仓库成品>` 的输出必须**恰好**是 §一 那两处改动块——`standard`/`ptc` 各 13 行（改动① 4 行插入；改动② 2 删 7 增，即 `tool-ask-user` 两行换成标记注释与 grilling 行），`cordis` 无改动① 故为 9 行；多一行都意味着漏派生或官方漂移。② 解析后逐条比对：条目总数与官方相同（增 `tool-ask-user-grilling`、减 `tool-ask-user`），共有条目中除 `skill-filesystem` 因改动① 多出 `config`（仅 `standard`/`ptc`）外**逐字段一致**。③ 三份引用的非官方第一方行可解析（`@lynn123411/dsh-ask-user-grilling`、`@deepseek-ai/dsh-tool-present`）。
- **DSH 升级后（同进程共存）**：官方 `cordis` / `ptc-cordis` / `matt-cordis` 同进程互挂依赖 `dsh-tool-cordis` Host inspect 注册幂等补丁，每次升级/重装后需重打 [`../patch-dsh-cordis-inspect-idempotent/`](../patch-dsh-cordis-inspect-idempotent/README.md)（**纯文档，无脚本**，由 AI 按文执行）。定位目标：从**运行中的 DSH 进程** cmdline 反推 `@deepseek-ai/dsh` 安装目录，再用 Node 自身解析（`require.resolve('@deepseek-ai/dsh-tool-cordis', { paths: [...] })`）取它实际加载的 `lib/index.js`。**不要按固定路径扫**（DSH Desktop 应用包与 dsh-launcher 的 `versions/<ver>/` 是两套互不相干的安装，猜错会「报成功但问题依旧」），**也不要手写 `.pnpm/*` glob**（哈希段随 peer 组合变化）。
- **Matt 技能上游更新后**：整体覆盖 26 个技能目录（上游 `skills/engineering` 18 个 + `skills/productivity` 7 个 + `skills/in-progress/implement-spec`；matt-cordis 另含两个 cordis 随附技能），再把三份 preset 的 `skills/grilling/SKILL.md` 按 §二 重做——上游逐字 + 改动① + 改动②（`matt-ptc` 用 PTC 形态的旁注）。其余技能无本地改动。

仓库 `presets/matt-*/` 即上述改动后的成品；日常同步 = 装好插件后把三个目录（`agent.cordis.yml` + `preset.yml` + `skills/`，不含 README.md）同步到 `~/.dsh/.agent-presets/<id>/` 并重启 DSH。
