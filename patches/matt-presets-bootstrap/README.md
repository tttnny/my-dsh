# matt-presets-bootstrap — 三个 matt preset 的改动点与重打说明

三个 matt preset（`matt-standard` / `matt-ptc` / `matt-cordis`）＝ **官方 0.2.0-rc.2 组合逐字** ＋ **Matt 的 26 个技能** ＋ **grilling 适配插件**（`ask_user_grilling`）－ 普通提问工具（`tool-ask-user` 行原位换成 `ask_user_grilling`，见 §一「工具行」）。本文逐处说明相对官方材料**改了什么、改成什么样、为什么**；本目录为纯文档，由 AI 按本文执行。仓库 `presets/matt-*/` 就是改好的成品，装进 profile 即用；以下改动点只在「从零组装 / DSH 升级后重打」时需要动手。

改动只发生在两类文件上：`matt-<id>.patch.yml`（官方正文上一处包装行、一处插入、一处工具行原位替换）与 `skills/grilling/SKILL.md`（本地适配五处：核心原则旁注、格式块、投递旁注、事实段删上游句、收尾段改写；新增文字为中文）。`matt-standard` 与 `matt-cordis` 的 `grilling/SKILL.md` 完全相同；`matt-ptc` 只在投递旁注的第二条 bullet 上按 PTC 形态表述（`run_code` 程序内 `tools.ask_user_grilling`，见 §二 改动③），PTC 措辞不进入非 PTC preset。三份 persona 都逐字取官方——grilling 纪律不写进 persona，而是下沉到技能正文的旁注：模型读到技能时正好看到，比 system prompt 里的抽象禁令有效。插件只改表单呈现，工具描述与共有参数描述同原生逐字一致，不承载任何纪律。

## 零、当前基线

- 官方基底：**DSH 0.2.0-rc.2**。官方 preset 正文 = `@deepseek-ai/dsh-web-app` 包内的 `presets/{standard,ptc,cordis}.patch.yml`，包目录从本次运行的安装树里取：

  ```bash
  ls -d "<DSH 安装>/node_modules/.pnpm/@deepseek-ai+dsh-web-app@*/node_modules/@deepseek-ai/dsh-web-app"
  ```

  四份正文（`standard` / `ptc` / `minimal` / `cordis`）是唯一权威；本仓库只取其中三份派生，官方发新版就照新正文重打。
- **目录预设形态不存在**：`@deepseek-ai/dsh-agent-presets`、`<id>/agent.cordis.yml`、`~/.dsh/.agent-presets/` 在当前 DSH 全安装树里没有任何引用，也没有对应物——不写「复制到 preset 目录」的安装法。官方正文搬进 patch，并且**不带行内说明注释**——所以仓库成品也不携带。
- 每个 matt preset 是一个 **bundle 包**：

  ```
  presets/matt-<id>/
  ├── package.json          # @lynn123411/dsh-preset-matt-<id>，dsh.bundle.patch → ./matt-<id>.patch.yml
  ├── matt-<id>.patch.yml   # 一条 @deepseek-ai/dsh-agent-preset 插入行
  ├── skills/               # 26 个 mattpocock 技能
  └── README.md
  ```

- 成品与官方正文的差异**恰为** §一 清单；多一处都是官方漂移或漏派生。

## 一、逐处改动清单（相对官方 0.2.0-rc.2）

### 包装与身份（三份都有）

官方是一条插入行（`- insert:` → `@deepseek-ai/dsh-agent-preset` 行）。本仓库在同一位置改成：

- Loader 行 id：`preset-<id>` → `preset-matt-<id>`；
- `config.id`：`<id>` → `matt-<id>`；
- 补 `config.name` / `config.description`——原 `preset.yml` 的两行折进 AgentPreset Config（`preset.yml` 文件本身删除）；
- `config.order`：官方占 1（standard）/ 2（ptc）/ 3（minimal）/ 4（cordis），本仓库取 **11（matt-standard）/ 12（matt-ptc）/ 13（matt-cordis）**，不与官方及其他自建 preset 撞值。名册按 `order` 升序、再按 id 排序（`dsh-agent-preset-registry` 的 `list()`）。

`config.plugins` 整体取官方逐字，只叠加下面「技能目录」与「工具行」两处。

### 技能目录：`skill-filesystem` 的 `customSkillDirs`（MATT-ADD，`standard` / `ptc` 新增；`cordis` 官方自带，额外加本包一条）

在 `- id: skill-filesystem` 的 `name:` 行之后插入。**原因**：26 个技能是 vendor 进本包 `skills/` 的额外目录，skill-filesystem 默认不扫它——不加此块模型根本发现不了、也调不到这些技能：

```yaml
          - id: skill-filesystem
            name: '@deepseek-ai/dsh-skill-filesystem'
            # MATT-ADD: discover the 26 mattpocock skills shipped in this bundle's ./skills/.
            config:
              customSkillDirs:
                - !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@lynn123411/dsh-preset-matt-standard/package.json')), 'skills')
```

`matt-ptc` 同形，只把包名换成 `@lynn123411/dsh-preset-matt-ptc`。

**为什么是这个表达式**：preset 行的子行挂载时 `baseUrl` 被设成 **profile 目录**（`dsh-agent-preset-registry` 的 `activate()`：`mountPreset(scope.ctx.extend({ baseUrl: record.context.baseUrl }), ...)`；`profile-boot` 注释也写明 include root 把 `baseUrl` 锚在 profile 目录）。所以 `new URL('skills/', baseUrl)` 这种相对写法会指向 `<profile>/skills/`——**必然落空**。可解析的资产必须从**已安装的包**里取：官方 cordis preset 的写法就是 `createRequire(baseUrl).resolve('<包>/package.json')` 再 `join(dirname(...), 'skills')`，本仓库三份都照抄这个形态，只是把包名换成自己的 bundle 包。

### 工具行：`tool-ask-user` → `tool-ask-user-grilling`（MATT-DEL + MATT-ADD，三份都有）

`remaining model-facing rows` 组内的 `- id: tool-ask-user` 块整块换成下面这个块（三份内容相同）。`# MATT-DEL:` / `# MATT-ADD:` 标记是升级 diff 审查识别「预期差异」的依据，勿删：

```yaml
          # MATT-DEL: upstream tool-ask-user row removed.
          # MATT-ADD: replaced in place by tool-ask-user-grilling — the same form with
          # forced multi-select and an auto-appended round-end supplement question. Skills
          # ship upstream-verbatim except grilling (local notes: template, business-language
          # framing, delivery, sub-agent settle gate; see patches/matt-presets-bootstrap/README.md section 2).
          - id: tool-ask-user-grilling
            name: '@lynn123411/dsh-ask-user-grilling'
```

**原因**：一问一答只留一个工具——所有提问一律走 `ask_user_grilling`（原生 `ask_user_question` 的表单呈现变体：强制多选 + 自动追加轮末补充题 + 可选参数 `number`（题号）与 `detail`（正文）），普通提问工具不再保留，所以直接在原槽位替换。该行放在 planning 组**之外**（普通工具区）即可，因为 `ask_user_grilling` 只消费 host-plane 的 `userQuestions`、无 realm 依赖，也不提供任何 plan-mode 工具（共识达成后交还用户决定下一步）。副作用一并接受：一切提问（plan mode 追问、简单确认）都被强制多选并自动追加轮末补充题；官方 plan-mode 正文两处点名的 `ask_user_question` 悬空（逐字不能改，不管）。

### matt-cordis 的两条额外处理

- **persona 逐字取官方短 persona**。官方 `cordis` 的 persona 与 `standard` 同一句（`prefix: >-\n  You are a coding agent powered by the {{model}} model.`），官方注释写明理由：工具描述与技能目录承载运行细节、preset 作者规则归技能。persona 行始终逐字取官方正文，不保留仓库自写的长篇身份——预设作者规则归随包技能，不归 persona。
- **`customSkillDirs` 两个条目**：本包 `skills/`（26 个 matt 技能）＋ 官方 `@deepseek-ai/dsh-agent-preset/skills`（官方 cordis 自带的 4 个：`agent-experience` / `cordis-composition-reference` / `cordis-plugin-development` / `editing-cordis-compositions`）。仓库**不 vendor** 这些 cordis 随附技能副本；技能正文随官方包走，仓库侧零 diff 维护。

## 二、`skills/grilling/SKILL.md`：本地适配五处

上游文件的 frontmatter 与英文正文原样保留，本地动手五处：① 核心原则旁注、② 格式块、③ 投递旁注、④ 事实段删上游一句、⑤ 收尾段改写。①③⑤ 的旁注与 ② 的模板占位为中文（⑤ 块内保留的上游两句英文除外），④ 是纯删除；除此之外上游英文逐字不动。

- **改动 ① 核心原则旁注（产品视角）**：frontier 段（`Work the tree in **rounds**…`）之后、`Format a round like so:` 之前，插入一段中文引用：**把沟通对象当产品负责人，只聊业务结果，不谈代码实现**，四条 bullet——视角落点（只确认用户能感知的行为：页面表现、交互体验、业务流程；屏蔽底层工程细节：接口、依赖库、实现模块）、语言脱敏（杜绝代码片段、文件路径、未经解释的黑话）、技术翻译（底层选型影响重大时，先讲对用户的影响、再确认业务上的取舍）、决策呈现（「效果对效果」直观对比，并标注各自代价：上线时间、性能折损、维护成本）。**原因**：答题人是决策者、不是实现者——工程视角的问题产品负责人答不了，答案也支撑不了设计树上的决定；旁注放在格式块之前，模型组装问题时先读到这一视角。成品（三份 preset 相同）：

```markdown
> **核心原则：把沟通对象当产品负责人，只聊业务结果，不谈代码实现。**
>
> - **视角落点**：只确认**用户能感知的行为**（页面表现、交互体验、业务流程），屏蔽底层工程细节（接口、依赖库、实现模块）。
> - **语言脱敏**：问题中杜绝代码片段、文件路径及未经解释的专业黑话，统一用业务语言交流。
> - **技术翻译**：若底层选型影响重大，先讲**"对用户有什么影响"**，再确认**"业务上怎么取舍"**。
> - **决策呈现**：提供选项时，做**"效果对效果"**的直观对比，并明确标注各自的代价（如上线时间、性能折损、维护成本）。
```

- **改动 ② 格式块**：上游 `Format a round like so:` 之后那段用 emoji 标记、题干占位含 `including multiple choices`（诱导把选项塞进题干）；改成纯文本，选项独立成 `Options:` 块、推荐独立一行，并给出英文与中文两份示例（中文示例用 `选项:` / `推荐:` 标签）。**原因**：模板是模型最可能整段照抄的样例——emoji 会被抄进输出、『选项塞正文』的占位会诱导模型把 A/B/C 写进题干；选项独立成块后与投递字段一一对应，两份示例让中文会话也拿到中文标签。成品（三份 preset 相同）：

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

- **改动 ③ 投递纪律旁注**：格式块之后新增一段引用（中文）：**每一轮分两步投递**，两步各占一条 bullet——第一条：先在消息文本里以散文预告本轮全部问题（标题/正文/选项/推荐）；第二条：在**同一回合内**紧接着把同一轮作为一次 `ask_user_grilling` 调用发出、让用户在表单中作答，「散文预告与工具投递必须**同一轮、一一对应**」的约束收在第二条末尾的括号里（轮末补充题由代码自动追加，不写进旁注）。字段组织细节（题号→`number`、标题→`question`、正文→`detail`、选项→`options`、推荐项放首位并在标签末尾加 `(Recommended)`；`header` 只放分类短标题，题号由插件并进去）不写进旁注，由模板与工具的参数描述承载：界面把 `question` 渲染成无 markdown、不吃换行的标题，`detail` 才走 markdown 正文块——多段正文塞进 `question` 会挤成一坨大标题并把选项区往下顶。**原因**：纯散文让用户拿到不可点击文本、丢失表单；纯工具又让用户看不到正文里的问题陈述——散文预告 + 工具表单各司其职，且必须成对出现。

`matt-standard` / `matt-cordis` 的旁注全文：

```markdown
> **每一轮分两步投递**：
>
> - 先在消息文本里**以散文预告这一轮的全部问题**（标题、正文、选项与推荐）。
> - 在**同一回合内**紧接着把**同一轮**作为**一次** `ask_user_grilling` 调用发出，让用户在表单中作答（散文预告与工具投递必须**同一轮、一一对应**）。
```

`matt-ptc` 只把第二条 bullet 换成：

```markdown
> - 在**同一回合内**紧接着再在 `run_code` 程序内用 `return await tools.ask_user_grilling({ questions: [...] })` 把**同一轮**作为**一次**调用投出，让用户在表单中作答（散文预告与工具投递必须**同一轮、一一对应**）。
```

- **改动 ④ 事实段删上游一句**：`Finding _facts_ …` 段里那句 `Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now.` **整句删除**，段末直接以 `The _decisions_ are the user's: put each to them and wait.` 收尾（三份 preset 相同）。**原因**：该句「先把其余 frontier 问完」与改动⑤「未结算不作数、先等它结算」是同一条时序上的相反指令（子代理结果可能推翻已定的决定，基于旧假设继续提问只会问出要重开的问题），而 `ask_user_grilling` 不设闸门、拦不住抢先提问——冲突只能在正文里消解。代价：随上游覆盖时这句会被带回来，需手工再删一遍（见 §六）。

- **改动 ⑤ 收尾段改写（会话结束的判定）**：上游收尾段 `The session is done when the frontier is empty… Do not act on it…` 改写成一段中文引用：**会话结束的判定需要同时满足**两条——第一条保留上游原句（**The frontier is empty**: every branch of the design tree visited, nothing left silently assumed.），第二条新增（中文）：本会话派遣过的每一个子代理都已结算，只要还有一个没回来，`frontier` 空了也不作数、不得当成最终共识、不得向用户确认或据此行动，先等它结算（结果可能推翻已定下来的决定、需要重开一部分树）；块末逐字保留 `Do not act on it until the user confirms you have reached a shared understanding.`。三份 preset 同文（PTC 的特例只在 ③ 的投递第二条 bullet，本段一致）。**判据**：等子代理只压在**收口闸门**上——未结算就不认共识、不向用户确认、不据此行动；结果可能推翻已定的决定、需要重开一部分树。轮次层面（这一轮问谁、何时问）只由 frontier 定义与事实段支配，正文不带派遣/等待的轮次纪律。**边界**：文字级软纪律、无闸门拦截，纪律只写在旁注里、不写在插件上（工具描述与共有参数描述与原生逐字一致）。成品：

```markdown
> **会话结束的判定需要同时满足**：
>
> - **The frontier is empty**: every branch of the design tree visited, nothing left silently assumed.
> - 本会话派遣过的**每一个子代理都已结算**——只要还有一个没回来，`frontier` 空了也不作数，不得当成最终共识、不得向用户确认或据此行动；先等它结算（结果可能推翻已定下来的决定、需要重开一部分树）。
>
> Do not act on it until the user confirms you have reached a shared understanding.
```

**其余英文正文不动**：格式块前后的英文段落均为上游逐字；本地在英文正文上的动作只有两处——改动④ 那一句删除、改动⑤ 的收尾段改写。

## 三、其余文件

- `skills/` 的 26 个技能：来自 [mattpocock/skills](https://github.com/mattpocock/skills) **原样 vendor，无改动**；其中 `implement-spec` 上游归在 `skills/in-progress/`（beta、官方明确不随插件分发），本仓库按快照一并 vendor。grilling 是唯一有本地改动的例外。matt-cordis 的技能数与另两份相同（26）——cordis 随附的 4 个技能由官方 `@deepseek-ai/dsh-agent-preset/skills` 提供，不入库。
- `package.json`（bundle 声明）、`matt-<id>.patch.yml`（组合声明）、`README.md`：自写。`package.json` 与另三份 preset 同形态：`name` / `version` / `description` / `type` / `exports["./package.json"]` / `files`（`skills`、`matt-<id>.patch.yml`、`README.md`）/ `dependencies` / `license` / `keywords` / `repository.directory` / `engines.dsh`（写**大于等于当前版本**的 SemVer 范围，不写精确版本）/ `publishConfig` / `dsh.bundle.patch`。`dependencies` 只写 `config.plugins` 消费的仓库外插件（三份都是 `@lynn123411/dsh-ask-user-grilling`）：preset 行按 `name` 从声明它的那棵树解析，缺了它整行 `never started`、preset 带上诊断且不可选。**不声明 `peerDependencies`**：preset bundle 不编译、不 import 内核包，而 `config.plugins` 引用的内核包有几十个，挑几个当 peer 纯属任意；更要紧的是 pnpm 的 `auto-install-peers` 会去 registry 把它们物化回来，可能顶掉本机开发副本（本仓库硬约束 2 的同款事故）。

## 四、外部材料（非改动、需自带）

- 插件 `@lynn123411/dsh-ask-user-grilling`（`ask_user_question` 的表单呈现变体：同一条 `ctx.userQuestions` seam，工具描述与共有参数描述**与原生逐字一致**；只强制多选、把可选题号参数 `number` 并进 `header`、把可选正文参数 `detail` 交给界面的 markdown 正文位、并自动追加一道轮末补充题；表单装不下的入参就地返回 `rejected` + `violations`；多选刻意不写进描述；transcript 那一行由本包自带的浏览器半边画成问答卡片）：**必须经注册安装、且列进 profile 的 bundle 层**。① 装包（`dsh plugin --profile web add @lynn123411/dsh-preset-matt-<id> @lynn123411/dsh-ask-user-grilling`，或 Plugin Manager `install_bundle`）；三份 preset 已把它声明为 `dependencies`，preset 行总可解析——但 bundle 层只按 profile 的**直接依赖**登记（`dsh-app-boot` 的 `readProfilePlugins` 读 profile 自己的 `package.json`），漏点名时工具照常可用、卡片退回原始 JSON。② 该包进 `dsh.profile.bundles`（包内 `cordis.patch.yml` 会插入一条载体行，宿主半边在那条行下什么都不注册）；② 不可省：卡片是客户端半边画的，而客户端 bundle 只对 root loader 的 **enabled entry** 服务，preset 工具行是直接挂的子树、不是 Loader entry。**不要手工拷贝进 `node_modules/@lynn123411/`**：未注册的裸拷贝会在任何 pnpm 同步时被当 extraneous 剪掉；roster 对每份 preset 做行可解析性健康检查，插件被剪后三份 preset 都带 `never started` 诊断、不可选。仓库 `plugins/dsh-ask-user-grilling/` 是事实源。
- 26 个技能随 mattpocock/skills 上游更新。

## 五、验证（2026-09-30 在 DSH 0.2.0-rc.2 实测）

`<DSH 安装>` 指本次运行中的安装目录（启动器布局下形如 `…/versions/0.2.0-rc.2`）：

```bash
DSH="<DSH 安装>/node_modules/@deepseek-ai/dsh/lib/bin.js"
```

1. **组合解析**（三份都 exit 0）：

   ```
   $ node "$DSH" --profile web --patch presets/matt-standard/matt-standard.patch.yml --dump-config > ./tmp/dump.yml
   exit=0 ; 2272 行
   # == /Users/tny/Desktop/work/my-dsh/presets/matt-standard/matt-standard.patch.yml
   - id: preset-matt-standard
     name: '@deepseek-ai/dsh-agent-preset'
     config:
       id: matt-standard
       name: Matt 标准
       order: 11
   ```

   `matt-ptc` / `matt-cordis` 同样 exit 0（2278 / 2277 行）；`minimal-fs` 2101 行。

2. **与官方结构等价**——把两份 patch 的行列表（缩进 10 的 `- id:` 行）逐一比对，只许出现「工具行原地替换」这一处差异：

   ```
   ### matt-standard vs standard.patch.yml
   ### only in official: tool-ask-user
   ### only in repo:     tool-ask-user-grilling
   ### plugin rows official/repo: 19/19; order preserved: true
   ### matt-ptc vs ptc.patch.yml
   ### only in official: tool-ask-user
   ### only in repo:     tool-ask-user-grilling
   ### plugin rows official/repo: 20/20; order preserved: true
   ### matt-cordis vs cordis.patch.yml
   ### only in official: tool-ask-user
   ### only in repo:     tool-ask-user-grilling
   ### plugin rows official/repo: 20/20; order preserved: true
   ```

   归一化后 `diff -u` 只剩两处：`customSkillDirs` 插入块、工具行替换。`ptc` / `cordis` 同（cordis 无插入、只有工具行 + `customSkillDirs` 多一条）。

3. **逐行深度比对**：解析两份 patch，把两处 MATT 改动归一化掉后，`config.plugins` 与官方 `JSON.stringify` 全等 → `true`（插件行数官方/仓库 = 19/19、20/20、20/20）。

4. **AgentPreset Config 校验**：用真的 `@deepseek-ai/dsh-agent-preset` schemastery `Config` 校验三份解析结果，全部通过；`plugins` = 19/20/20，`customSkillDirs` = 1/1/2，`order` = 11/12/13。

5. **`!!js` 表达式求值**（`--dump-config` 不求值 `!!js`，所以这条单独跑）：把 patch 里的 `!!js` 标量原文取出、以 `baseUrl = file://<profile 目录>/` 求值——三份各解析到本包 `skills/`（各 26 个 `SKILL.md` 目录），matt-cordis 第二条解析到官方包的 `skills/`（0.2.0-rc.2 起 4 个：`agent-experience` / `cordis-composition-reference` / `cordis-plugin-development` / `editing-cordis-compositions`）。

6. **包形态**：`cd presets/matt-<id> && npm pack --dry-run` 三份都 exit 0，各 79 个文件（`package.json` + `matt-<id>.patch.yml` + `README.md` + 26 个技能目录及其子文件）。

7. **真装载（0.2.0-rc.2 隔离 `DSH_HOME`）**：grilling 是 `dependencies` 里的仓库外插件，preset 行才解析得到；它在不在 profile 的 `dsh.profile.bundles` 决定 transcript 卡片走自带半边还是退回原始 JSON。三个流程：
   - 只装 preset（npm 包名，或本地 tarball 当 registry）：`broken: null`，grilling 作为传递依赖装进 profile，但**不进** `dsh.profile.bundles`（`readProfilePlugins` 只读 profile 的直接依赖）——工具可用，卡片退回原始 JSON；
   - 命令点名两个包：两个包都进 `bundles`，`broken: null`，grilling 行 `fiberState: 2`；
   - 开发副本（`link:`）只装 preset：`link:` 包的 `dependencies` 不被物化，工具行 `never started`（`broken: "tool-ask-user-grilling (@lynn123411/dsh-ask-user-grilling): never started"`）——开发副本命令必须同样点名 `./plugins/dsh-ask-user-grilling`；点名后 `broken: null`、grilling 行 `fiberState: 2`。

   探针读 `agentPresets.list()` / `compositionInventory()` 与 `systemPrompt.assemble({ scope })`（后者的 `assembly.tools` 就是模型最终收到的 schema 数组）。隔离 `DSH_HOME` + `dsh plugin add` 五个 `link:` 目录，实测：

   - `list()`：四条官方 + `minimal-fs`(5) / `matt-standard`(11) / `matt-ptc`(12) / `matt-cordis`(13) 全部 `broken: null`；`compositionInventory()` 四份都 `broken: null`，行 `fiberState: 2`（`tool-pwsh` / 各 `disabled` 行为 `enabled:false`，非故障）。
   - `tool-ask-user-grilling=up`（`@lynn123411/dsh-ask-user-grilling` 行 `fiberState: 2`）。
   - 模型可见目录：`matt-ptc` 只有 `["run_code"]`；`matt-cordis` 另有 `cordis_inspect_list` / `cordis_inspect_query` / `plugin_manager`；`minimal-fs` 是 `["edit","read","write"]`。
   - 技能目录（`skills.list({ scope })`）：三份 matt 各 26 个随包技能；`matt-cordis` 另含官方 4 个（`agent-experience` / `cordis-composition-reference` / `cordis-plugin-development` / `editing-cordis-compositions`）＝ 30 / 30 / 34 条（宿主 `~/.dsh/skills`、项目 `.agents/skills` 也并入，故总数高于随包数）。`minimal-fs` 不挂 skill-filesystem，技能目录为空。
   - `minimal-fs` 反向对照（同组合去掉 `tool-filter` 行）：模型可见目录变成 `["edit","read","read_image","write"]`——`read_image` 确实是这一行从 `system-prompt/assemble` 里移除的，不是它没注册。

   `--dump-config-schema` 对含 `@deepseek-ai/dsh-agent-preset` 的组合树一律 exit 1（报 `unrecognized Loader tree carrier`）——这是它对该行的既有局限：**把官方 `standard.patch.yml` 当 overlay 跑，stderr 与本次成品逐字相同**（4 条基线 + 每多一条 preset 行多 1 条），不是本仓库引入的问题。

## 六、何时重打

- **DSH 升级后**：官方 `standard/ptc/cordis` 组合更新 → 取新版官方 `@deepseek-ai/dsh-web-app/presets/<id>.patch.yml` 覆盖 `matt-<id>.patch.yml`，再按 §一 重打「包装」「技能目录」「工具行」三处。「技能目录」的锚点是 `- id: skill-filesystem` 的 `name:` 行；「工具行」的锚点是 `remaining model-facing rows` 里的 `- id: tool-ask-user` 块——官方若改了这两处结构则需手工定位。**必须做全量 diff**：官方会在组合里新增工具行，只 diff 这两个改动块看不出来。
- **重打后的校验**：§五 第 2、3 条必须重跑——归一化 diff 只许出现「技能目录」与「工具行」，深度比对必须全等。`cordis` 的 persona 也随官方逐字覆盖。
- **官方 cordis 技能更新**：不需要动本仓库——matt-cordis 的 `customSkillDirs` 第二条指向官方 `@deepseek-ai/dsh-agent-preset/skills`，跟着 DSH 升级自动更新（0.2.0-rc.2 起该目录 4 个技能，多出 `agent-experience`）。
- **同进程与官方 `cordis` 共存**：Host inspect provider 由**宿主组合单点注册**（`dsh-web-app/cordis.patch.yml` 的 `cordis-inspect-providers` 行，`@deepseek-ai/dsh-tool-cordis/host`），per-preset 的 `tool-cordis` 行不再注册任何 provider，重复注册无从产生——**不需要任何幂等补丁**。判据：`--profile web --dump-config | grep -c "id: cordis-inspect-providers"` 期望 `1`；全安装树 `grep -rn "cordisInspect.register"` 应唯一命中 `dsh-tool-cordis/lib/types/host.js`。
- **Matt 技能上游更新后**：整体覆盖 26 个技能目录（上游 `skills/engineering` 18 个 + `skills/productivity` 7 个 + `skills/in-progress/implement-spec`），再把三份 preset 的 `skills/grilling/SKILL.md` 按 §二 重做——上游逐字 + 改动①②③④⑤（`matt-ptc` 的投递旁注第二条 bullet 用 PTC 形态；改动④ 是删句、改动⑤ 是改写收尾段，覆盖上游文件后两处都要手工再删/再写一遍）。其余技能无本地改动。

仓库 `presets/matt-*/` 即上述改动后的成品；日常使用 = `dsh plugin --profile web add @lynn123411/dsh-preset-matt-<id> @lynn123411/dsh-ask-user-grilling` 装进 profile（本仓库开发副本改传 `./presets/matt-<id> ./plugins/dsh-ask-user-grilling`），重启 DSH 后在新建会话界面选择。
