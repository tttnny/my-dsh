# matt-presets-bootstrap — 三个 matt preset 的改动点与重打说明

三个 matt preset（`matt-standard` / `matt-ptc` / `matt-cordis`）＝ **官方 0.1.7-rc.2 组合逐字** ＋ **Matt 的 26 个技能** ＋ **grilling 适配插件**（`ask_user_grilling`）－ 普通提问工具（`tool-ask-user` 行原位换成 `ask_user_grilling`，见 §一「工具行」）。本文逐处说明相对官方材料**改了什么、改成什么样、为什么**；本目录为纯文档，由 AI 按本文执行。仓库 `presets/matt-*/` 就是改好的成品，装进 profile 即用；以下改动点只在「从零组装 / DSH 升级后重打」时需要动手。

改动只发生在两类文件上：`matt-<id>.patch.yml`（官方正文上一处包装行、一处插入、一处工具行原位替换）与 `skills/grilling/SKILL.md`（本地适配四处：格式块、投递旁注、事实段删上游句、子代理旁注；新增文字为中文）。`matt-standard` 与 `matt-cordis` 的 `grilling/SKILL.md` 完全相同；`matt-ptc` 只在投递旁注描述投递的那半句上按 PTC 形态表述（`run_code` 程序内 `tools.ask_user_grilling`，见 §二 改动②），PTC 措辞不进入非 PTC preset。三份 persona 都逐字取官方——grilling 纪律不写进 persona，而是下沉到技能正文的旁注：模型读到技能时正好看到，比 system prompt 里的抽象禁令有效。插件只改表单呈现，工具描述与共有参数描述同原生逐字一致，不承载任何纪律。

## 零、当前基线

- 官方基底：**DSH 0.1.7-rc.2**。官方 preset 正文 = `@deepseek-ai/dsh-web-app` 包内的 `presets/{standard,ptc,cordis}.patch.yml`（`node tmp/dsh-0.1.7-migration/dshpkg.mjs dsh-web-app` 取包目录）；只读本地副本在 `tmp/dsh-0.1.7-migration/official-presets/`。
- **0.1.6 的目录预设形态已不存在**：`@deepseek-ai/dsh-agent-presets`、`<id>/agent.cordis.yml`、`~/.dsh/.agent-presets/` 在 0.1.7-rc.2 全安装树里没有任何引用。官方正文搬进 patch，并且**去掉了全部行内说明注释**——所以仓库成品也不再携带 0.1.6 那批注释。
- 每个 matt preset 是一个 **bundle 包**：

  ```
  presets/matt-<id>/
  ├── package.json          # @lynn123411/dsh-preset-matt-<id>，dsh.bundle.patch → ./matt-<id>.patch.yml
  ├── matt-<id>.patch.yml   # 一条 @deepseek-ai/dsh-agent-preset 插入行
  ├── skills/               # 26 个 mattpocock 技能
  └── README.md
  ```

- 成品与官方正文的差异**恰为** §一 清单；多一处都是官方漂移或漏派生。

## 一、逐处改动清单（相对官方 0.1.7-rc.2）

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

**为什么是这个表达式**：0.1.7-rc.2 里 preset 行的子行挂载时 `baseUrl` 被设成 **profile 目录**（`dsh-agent-preset-registry` 的 `activate()`：`mountPreset(scope.ctx.extend({ baseUrl: record.context.baseUrl }), ...)`；`profile-boot` 注释也写明 include root 把 `baseUrl` 锚在 profile 目录）。所以 0.1.6 世代的 `new URL('skills/', baseUrl)` 会指向 `<profile>/skills/`——**必然落空**。可解析的资产必须从**已安装的包**里取：官方 cordis preset 的写法就是 `createRequire(baseUrl).resolve('<包>/package.json')` 再 `join(dirname(...), 'skills')`，本仓库三份都照抄这个形态，只是把包名换成自己的 bundle 包。

### 工具行：`tool-ask-user` → `tool-ask-user-grilling`（MATT-DEL + MATT-ADD，三份都有）

`remaining model-facing rows` 组内的 `- id: tool-ask-user` 块整块换成下面这个块（三份内容相同）。`# MATT-DEL:` / `# MATT-ADD:` 标记是升级 diff 审查识别「预期差异」的依据，勿删：

```yaml
          # MATT-DEL: upstream tool-ask-user row removed.
          # MATT-ADD: replaced in place by tool-ask-user-grilling — the same form with
          # forced multi-select and an auto-appended round-end supplement question. Skills
          # ship upstream-verbatim except grilling (local notes: template, delivery,
          # sub-agent rounds; see patches/matt-presets-bootstrap/README.md section 2).
          - id: tool-ask-user-grilling
            name: '@lynn123411/dsh-ask-user-grilling'
```

**原因**：一问一答只留一个工具——所有提问一律走 `ask_user_grilling`（原生 `ask_user_question` 的表单呈现变体：强制多选 + 自动追加轮末补充题 + 可选参数 `number`（题号）与 `detail`（正文）），普通提问工具不再保留，所以直接在原槽位替换。该行放在 planning 组**之外**（普通工具区）即可，因为 `ask_user_grilling` 只消费 host-plane 的 `userQuestions`、无 realm 依赖，也不提供任何 plan-mode 工具（共识达成后交还用户决定下一步）。副作用一并接受：一切提问（plan mode 追问、简单确认）都被强制多选并自动追加轮末补充题；官方 plan-mode 正文两处点名的 `ask_user_question` 悬空（逐字不能改，不管）。

### matt-cordis 的两条额外处理

- **persona 逐字取官方短 persona**。0.1.7-rc.2 官方 `cordis` 的 persona 已与 `standard` 同一句（`prefix: >-\n  You are a coding agent powered by the {{model}} model.`），官方注释写明理由：工具描述与技能目录承载运行细节、preset 作者规则归技能。0.1.6 世代那篇长篇创造模式 persona 已删——它把「预设作者规则」留在自己身上，而且指向 `${DSH_HOME:-$HOME/.dsh}/.agent-presets/<id>/` 这套 0.1.7 已删除的机制。persona 行始终逐字取官方正文，不要保留任何仓库旧写法。
- **`customSkillDirs` 两个条目**：本包 `skills/`（26 个 matt 技能）＋ 官方 `@deepseek-ai/dsh-agent-preset/skills`（官方 cordis 自带的 3 个：`cordis-composition-reference` / `cordis-plugin-development` / `editing-cordis-compositions`）。仓库**不再 vendor** 那两个 cordis 随附技能副本（旧副本正文写着 `.agent-presets`，已随本次迁移删除）；技能正文随官方包走，仓库侧零 diff 维护。

## 二、`skills/grilling/SKILL.md`：本地适配四处

上游文件的 frontmatter 与英文正文原样保留，本地动手四处：① 格式块、② 投递旁注、③ 事实段删上游一句、④ 子代理旁注。① 的模板占位与 ②④ 的新增旁注为中文，③ 是纯删除；除此之外上游英文逐字不动。

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

- **改动 ② 投递纪律旁注**：格式块之后新增一段引用（中文）：每一轮分两步投递——先在消息文本里按模板以散文预告本轮全部问题（标题/正文/选项/推荐），在**同一回合内**紧接着把同一轮作为一次 `ask_user_grilling` 调用发出、让用户在表单中作答；旁注只保留一条 bullet——散文预告与工具投递必须**同一轮、一一对应**（提问工具由前一句点名、轮末补充题由代码自动追加，二者不重复写进旁注）。字段组织细节（题号→`number`、标题→`question`、正文→`detail`、选项→`options`、推荐项放首位并在标签末尾加 `(Recommended)`；`header` 只放分类短标题，题号由插件并进去）不写进旁注，由模板与工具的参数描述承载：界面把 `question` 渲染成无 markdown、不吃换行的标题，`detail` 才走 markdown 正文块——多段正文塞进 `question` 会挤成一坨大标题并把选项区往下顶。**原因**：纯散文让用户拿到不可点击文本、丢失表单；纯工具又让用户看不到正文里的问题陈述——散文预告 + 工具表单各司其职，且必须成对出现。

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

- **改动 ③ 事实段删上游一句**：`Finding _facts_ …` 段里那句 `Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now.` **整句删除**，段末直接以 `The _decisions_ are the user's: put each to them and wait.` 收尾（三份 preset 相同）。**原因**：该句「先把其余 frontier 问完」与改动④「等齐再问」是同一条时序上的相反指令，而 `ask_user_grilling` 不设闸门、拦不住抢先提问——冲突只能在正文里消解。代价：随上游覆盖时这句会被带回来，需手工再删一遍（见 §六）。

- **改动 ④ 子代理轮次旁注**：事实段之后新增一段引用（中文），三份 preset 同文（PTC 只换投递旁注那半句，本段一致）。**判据**：禁令点到**具体调用**（`bash sleep` 与「先小睡一下再检查」的折中）而非笼统的「不要轮询」——后者会被读成「不要反复轮询」，单次 sleep 就被当成合规。**生效范围**：仅加载了本技能的会话；普通会话的同一诱因不在本文处理。**边界**：文字级软纪律、无闸门拦截，只写在这条旁注里——插件不承载纪律（工具描述与共有参数描述与原生逐字一致）。成品：

```markdown
> **Sub-agent rounds：** 如果你在某轮派遣了子代理，派遣指的是**发出调用**：本轮派出的每一个子代理都要有对应的派遣调用，并在同一回合的消息文本里列出各自去干什么。清单是**回执**——只在文本里列清单、没发出调用，等于这一轮没有派遣。
>
> - 结束回合前自查：清单条数 = 已发出的派遣调用数，对不上就先补发调用；核对完立刻结束回合。
> - 主代理不得自己制造等待，如 `bash sleep` 以及「先小睡一下再检查」的折中，全部禁止。
> - 等**全部**已派遣子代理结算后，再问 frontier（包括未受阻的问题）。
```

**其余英文正文不动**：格式块前后的英文段落与收尾段均为上游逐字；本地在英文正文上的唯一动作是改动③ 那一句删除。

## 三、其余文件

- `skills/` 的 26 个技能：来自 [mattpocock/skills](https://github.com/mattpocock/skills) **原样 vendor，无改动**；其中 `implement-spec` 上游归在 `skills/in-progress/`（beta、官方明确不随插件分发），本仓库按快照一并 vendor。grilling 是唯一有本地改动的例外。matt-cordis 的技能数与另两份相同（26）——cordis 随附的 3 个技能改由官方 `@deepseek-ai/dsh-agent-preset/skills` 提供，不再入库。
- `package.json`（bundle 声明）、`matt-<id>.patch.yml`（组合声明）、`README.md`：自写。`package.json` 与另三份 preset 同形态：`name` / `version` / `description` / `type` / `exports["./package.json"]` / `files`（`skills`、`matt-<id>.patch.yml`、`README.md`）/ `dependencies` / `license` / `keywords` / `repository.directory` / `engines.dsh: "0.1.7-rc.2"`（0.1.7-rc.1 起安装与启动都做 DSH 版本兼容检查，内核版本钉死由它承担）/ `publishConfig` / `dsh.bundle.patch`。`dependencies` 只写 `config.plugins` 消费的仓库外插件（三份都是 `@lynn123411/dsh-ask-user-grilling`）：preset 行按 `name` 从声明它的那棵树解析，缺了它整行 `never started`、preset 带上诊断且不可选。**不声明 `peerDependencies`**：preset bundle 不编译、不 import 内核包，而 `config.plugins` 引用的内核包有几十个，挑几个当 peer 纯属任意；更要紧的是 pnpm 的 `auto-install-peers` 会去 registry 把它们物化回来，可能顶掉本机开发副本（本仓库硬约束 2 的同款事故）。

## 四、外部材料（非改动、需自带）

- 插件 `@lynn123411/dsh-ask-user-grilling`（`ask_user_question` 的表单呈现变体：同一条 `ctx.userQuestions` seam，工具描述与共有参数描述**与原生逐字一致**；只强制多选、把可选题号参数 `number` 并进 `header`、把可选正文参数 `detail` 交给界面的 markdown 正文位、并自动追加一道轮末补充题；表单装不下的入参就地返回 `rejected` + `violations`；多选刻意不写进描述；transcript 那一行由本包自带的浏览器半边画成问答卡片）：**必须经注册安装、且列进 profile 的 bundle 层**。① 装包（`dsh plugin --profile web add @lynn123411/dsh-preset-matt-<id> @lynn123411/dsh-ask-user-grilling`，或 Plugin Manager `install_bundle`）；三份 preset 已把它声明为 `dependencies`，preset 行总可解析——但 bundle 层只按 profile 的**直接依赖**登记（`dsh-app-boot` 的 `readProfilePlugins` 读 profile 自己的 `package.json`），漏点名时工具照常可用、卡片退回原始 JSON。② 该包进 `dsh.profile.bundles`（包内 `cordis.patch.yml` 会插入一条载体行，宿主半边在那条行下什么都不注册）；② 不可省：卡片是客户端半边画的，而客户端 bundle 只对 root loader 的 **enabled entry** 服务，preset 工具行是直接挂的子树、不是 Loader entry。**不要手工拷贝进 `node_modules/@lynn123411/`**：未注册的裸拷贝会在任何 pnpm 同步时被当 extraneous 剪掉；roster 对每份 preset 做行可解析性健康检查，插件被剪后三份 preset 都带 `never started` 诊断、不可选。仓库 `plugins/dsh-ask-user-grilling/` 是事实源。
- 26 个技能随 mattpocock/skills 上游更新。

## 五、验证（2026-09-26 在 DSH 0.1.7-rc.2 实测）

```bash
DSH="$(node tmp/dsh-0.1.7-migration/dshpkg.mjs dsh)/lib/bin.js"
```

1. **组合解析**（三份都 exit 0）：

   ```
   $ node "$DSH" --profile web --patch presets/matt-standard/matt-standard.patch.yml --dump-config > /tmp/dump.yml
   exit=0 ; 1518 行
   # == /Users/tny/Desktop/work/my-dsh/presets/matt-standard/matt-standard.patch.yml
   - id: preset-matt-standard
     name: '@deepseek-ai/dsh-agent-preset'
     config:
       id: matt-standard
       name: Matt 标准
       order: 11
   ```

   `matt-ptc` / `matt-cordis` 同样 exit 0（1524 / 1523 行）。

2. **与官方结构等价**（`presetrows.mjs` + `presetnorm.mjs`）：

   ```
   ### only in .../official-presets/standard.patch.yml: preset-standard, tool-ask-user
   ### only in .../presets/matt-standard/matt-standard.patch.yml: preset-matt-standard, tool-ask-user-grilling
   ### name changed: (none)
   ```

   归一化后 `diff -u` 只剩两处：`customSkillDirs` 插入块、工具行替换。`ptc` / `cordis` 同（cordis 无插入、只有工具行 + `customSkillDirs` 多一条）。

3. **逐行深度比对**：解析两份 patch，把两处 MATT 改动归一化掉后，`config.plugins` 与官方 `JSON.stringify` 全等 → `true`（插件数官方/仓库 = 19/19、20/20、20/20）。

4. **AgentPreset Config 校验**：用真的 `@deepseek-ai/dsh-agent-preset` schemastery `Config` 校验三份解析结果，全部通过；`plugins` = 19/20/20，`customSkillDirs` = 1/1/2，`order` = 11/12/13。

5. **`!!js` 表达式求值**（`--dump-config` 不求值 `!!js`，所以这条单独跑）：把 patch 里的 `!!js` 标量原文取出、以 `baseUrl = file://<profile 目录>/` 求值——三份各解析到本包 `skills/`（各 26 个 `SKILL.md` 目录），matt-cordis 第二条解析到官方包的 `skills/`（3 个，含 `cordis-composition-reference`）。

6. **包形态**：`cd presets/matt-<id> && npm pack --dry-run` 三份都 exit 0，各 79 个文件（`package.json` + `matt-<id>.patch.yml` + `README.md` + 26 个技能目录及其子文件）。

7. **真装载（0.1.7-rc.2 隔离 `DSH_HOME`）**：0.1.0 按包名只装 preset 时，三份的 `agentPresets.list()` 都报 `tool-ask-user-grilling (@lynn123411/dsh-ask-user-grilling): never started`——patch 里那条工具行不可解析。0.1.1 起 grilling 进 `dependencies`，以 matt-standard 复测三个流程：
   - 只装 preset（npm 包名，或本地 tarball 当 registry）：`broken: null`，grilling 作为传递依赖装进 profile，但**不进** `dsh.profile.bundles`（`readProfilePlugins` 只读 profile 的直接依赖）——工具可用，transcript 卡片退回原始 JSON；
   - 命令点名两个包：两个包都进 `bundles`，`broken: null`，grilling 行 `fiberState: 2`；
   - 开发副本（`link:`）只装 preset：`link:` 包的 `dependencies` 不被物化，仍旧 `never started`——开发副本命令必须同样点名 `./plugins/dsh-ask-user-grilling`。

   探针读 `agentPresets.list()` / `compositionInventory()`；三份的 `skills/` 26 个技能进 skills 服务、`tool-ask-user-grilling=up`、matt-ptc 的模型可见目录只有 `run_code`、matt-cordis 另有官方 3 个 cordis 技能与 `tool-cordis=up`。`--dump-config-schema` 对含 `@deepseek-ai/dsh-agent-preset` 的组合树一律 exit 1（报 `unrecognized Loader tree carrier`）——这是它对该行的既有局限：**把官方 `standard.patch.yml` 当 overlay 跑，stderr 与本次成品逐字相同**（4 条基线 + 每多一条 preset 行多 1 条），不是本仓库引入的问题。

## 六、何时重打

- **DSH 升级后**：官方 `standard/ptc/cordis` 组合更新 → 取新版官方 `@deepseek-ai/dsh-web-app/presets/<id>.patch.yml` 覆盖 `matt-<id>.patch.yml`，再按 §一 重打「包装」「技能目录」「工具行」三处。「技能目录」的锚点是 `- id: skill-filesystem` 的 `name:` 行；「工具行」的锚点是 `remaining model-facing rows` 里的 `- id: tool-ask-user` 块——官方若改了这两处结构则需手工定位。**必须做全量 diff**：官方会在组合里新增工具行，只 diff 这两个改动块看不出来。
- **重打后的校验**：§五 第 2、3 条必须重跑——归一化 diff 只许出现「技能目录」与「工具行」，深度比对必须全等。`cordis` 的 persona 也随官方逐字覆盖。
- **官方 cordis 技能更新**：不需要动本仓库——matt-cordis 的 `customSkillDirs` 第二条指向官方包，跟着 DSH 升级自动更新。
- **同进程与官方 `cordis` 共存**：0.1.7-rc.2 起 Host inspect provider 由**宿主组合单点注册**（`dsh-web-app/cordis.patch.yml` 的 `cordis-inspect-providers` 行，`@deepseek-ai/dsh-tool-cordis/host`），per-preset 的 `tool-cordis` 行不再注册任何 provider，重复注册无从产生——**不需要任何幂等补丁**。判据：`--profile web --dump-config | grep -c "id: cordis-inspect-providers"` 期望 `1`；全安装树 `grep -rn "cordisInspect.register"` 应唯一命中 `dsh-tool-cordis/lib/types/host.js`。
- **Matt 技能上游更新后**：整体覆盖 26 个技能目录（上游 `skills/engineering` 18 个 + `skills/productivity` 7 个 + `skills/in-progress/implement-spec`），再把三份 preset 的 `skills/grilling/SKILL.md` 按 §二 重做——上游逐字 + 改动①②③④（`matt-ptc` 用 PTC 形态的投递旁注；改动③ 是删句，覆盖上游文件后需手工再删一遍）。其余技能无本地改动。

仓库 `presets/matt-*/` 即上述改动后的成品；日常使用 = `dsh plugin --profile web add @lynn123411/dsh-preset-matt-<id> @lynn123411/dsh-ask-user-grilling` 装进 profile（本仓库开发副本改传 `./presets/matt-<id> ./plugins/dsh-ask-user-grilling`），重启 DSH 后在新建会话界面选择。
