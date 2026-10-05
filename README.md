# my-dsh

> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 插件 / 补丁 / preset 合集 · Collection of DSH plugins, patches & presets

---

## 🧩 插件（plugins/）

<table>
  <thead>
    <tr>
      <th>类型</th>
      <th>插件</th>
      <th>说明</th>
      <th>安装</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><b>📖 阅读体验</b><br><i>作用于对话流的「读」，不污染上下文</i></td>
      <td><a href="./plugins/dsh-chat-translate"><code>@lynn123411/dsh-chat-translate</code></a></td>
      <td><b>聊天翻译</b><br>· 接管助手行渲染（keyed slot <code>assistant-step</code>），正文块不论源语言一律送模型改写成自然简体中文——整段中文同样照送、顺机器腔；Think 卡 / 工具调用行 / 用户消息 / 代码块 / 空白块不翻，与宿主渲染逐分支等价，接管器抛错自动退位给宿主<br>· 结构重装配：代码围栏逐字保留、从不送模型，散文段送译后按原结构拼回，经基线组件 <code>MarkdownText</code> 重渲染；形状修复按段落块对齐——结构行（记号类别、表格竖线、链接数）逐一对齐并把行首前缀修回原文、散文行自由重排、空行布局取原文，修不齐的自动重掷一次、仍不齐则照收译文，形状问题不再否决内容<br>· 左缘竖线：读译文蓝粗线、读原文灰细线、失败红实线（悬停报通道细节：超时/断流/空返回）、在途灰脉动、没送过模型无线；模型返回一模一样也算翻过<br>· 开关两个入口：输入框下方那一行的「译」胶囊与本插件配置页总开关，读写同一个 <code>enabled</code><br>· 落定且进入视口才整行请求（每行唯一的首跑），失败不自动重试——点红线整行手动补跑，已成功块保持挂线；串行单在途；磁盘缓存按提示词修订号（<code>PROMPT_REVISION</code>）整体作废，换提示词不让旧译文串代<br>· OpenAI 兼容 AI 单通道（Key / Base URL / 模型齐备才翻，Key 存 <code>~/.dsh/.credentials.yaml</code>）<br>· 配置页挂在「<b>插件</b>」页：注册进 <code>plugins.row.config</code>（key <code>@lynn123411/dsh-chat-translate#dsh-chat-translate</code>），路径是「插件」→本插件详情页→该行的「配置」<br>· 脸面：中文名「聊天翻译」＋一句话简介＋极简线性图标（<code>locale/</code> 的 <code>meta</code> 与 <code>package.json</code> 的 <code>icon</code>）</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-chat-translate</code></td>
    </tr>
    <tr>
      <td rowspan="3"><b>🔌 模型接入</b><br><i>把外部网关变成 DSH 原生提供商</i></td>
      <td><a href="./plugins/dsh-a6api"><code>@lynn123411/dsh-a6api</code></a></td>
      <td><b>A6API 接入</b><br>· 将 A6API 聚合网关注册为 DSH 原生 LLM 提供商，模型一键同步进选择器<br>· 多标签页视图、余额（$ / ¥）与调用明细、模型白名单同步<br>· 商户线路实时探测与全景指标卡片（含官方 vs 商户价格对比）<br>· 输入框下方快捷模型卡片 + 账户余额 / 价格波动 / 模型市场胶囊行<br>· 配置页挂在「<b>插件</b>」页：注册进 <code>plugins.row.config</code>（key <code>@lynn123411/dsh-a6api#dsh-a6api</code>）</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-a6api</code></td>
    </tr>
    <tr>
      <td><a href="./plugins/dsh-llm-agentrouter"><code>@lynn123411/dsh-llm-agentrouter</code></a></td>
      <td><b>AgentRouter 中转聚合</b><br>· 单 pi-ai 路由承载多模型，模型选择器只出现一个分组<br>· 国内 / 国际端点设置卡一键切换，下一请求即生效（要热更的字段以 <code>.volatile()</code> 声明，设置面由 Config schema 派生）<br>· 出站 User-Agent 改写 + 402 配额围栏<br>· 上游分叉：沿用 <code>llm-agentrouter</code> 命名空间；配置落在当前 Profile 的插件条目里，端点卡片挂在本插件在「插件」页的配置页（<code>plugins.row.config</code>，key <code>@lynn123411/dsh-llm-agentrouter#llm-agentrouter</code>）</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-llm-agentrouter</code></td>
    </tr>
    <tr>
      <td><a href="./plugins/dsh-antigravity-auth"><code>@lynn123411/dsh-antigravity-auth</code></a></td>
      <td><b>Antigravity 全套权益接入</b><br>· Google Antigravity 私有能力包：Gemini 2.5/3.1/3.7、Claude 3.5/3.7 与 GPT-OSS 原生模型接入<br>· 突破 127.0.0.1 严格回环限制，支持全网卡监听（0.0.0.0）与远程手动授权回调换票<br>· 搭载 Google Search Grounding 联网搜索、多模态生图与视频分析工具<br>· 配置卡片挂在「<b>插件</b>」页本插件的配置页（<code>plugins.row.config</code>，key <code>@lynn123411/dsh-antigravity-auth#antigravity-auth</code>）</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-antigravity-auth</code></td>
    </tr>
    <tr>
      <td><b>🎛️ 模型选择</b><br><i>输入框里模型选择器的形态</i></td>
      <td><a href="./plugins/dsh-model-submenu"><code>@lynn123411/dsh-model-submenu</code></a></td>
      <td><b>模型二级菜单</b><br>· 给输入框模型选择器加上供应商层级：根面板保持原生两行「供应商 / 推理等级」，点「供应商」进供应商列表（当前供应商那行显示它正在使用的模型名并勾选，其余显示模型数量），再点某个供应商进它的模型列表，面板顶部有返回行<br>· 点模型立即提交并关闭；推理等级保持原生——根面板的「推理等级」行进该模型的等级列表，选中即提交，「Default」表示跟随供应商默认<br>· 外观沿用内置弹层与 <code>--dsw-*</code> 主题变量；方向键 / Tab / Escape 与加载、失败、提交被拒的提示照旧<br>· 形态：bundle 型插件，客户端半边以 <code>priority: -100</code> 接管 <code>conversation.input.model</code>，<code>/model</code> 命令面板与设置页不受影响</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-model-submenu</code></td>
    </tr>
    <tr>
      <td><b>🧠 Agent 工作流</b><br><i>面向模型与流程，随 preset 生效</i></td>
      <td><a href="./plugins/dsh-ask-user-grilling"><code>@lynn123411/dsh-ask-user-grilling</code></a></td>
      <td><b>盘问表单</b><br>· <code>grilling_form</code>：grilling 轮的逐题盘问工具——校验入参后调用 <code>exec.concludeTurn()</code> 立即结束本轮，并把整轮问题作为一张<b>摊开在对话记录里的可交互表单</b>投出去（不阻塞等答案、不接管输入框）；入参表示不了的（重复 id、空题干、空 label、同题重名 label、展开正文里把选项又列一遍）就地返回 <code>rejected</code> + <code>violations</code> 且不结束本轮<br>· 表单没有折叠行也没有卡片壳，题目跟上下文同处一层，进度是顶上的一行小灰字；支持多选、<b>推荐项默认勾上</b>、每题自填、<code>detail</code> markdown 正文（只写各选项共用的背景）、<code>number</code> 并进 <code>header</code>、「推荐」徽标；底部只有一个「导入输入框」键，把作答写进<b>原生输入框草稿</b>，用户按原生发送键发出，作答作为下一条用户消息到达；填了未导入时常驻提醒，这条调用之后有过用户发言就转只读；勾选与自填按会话存 <code>localStorage</code>、刷新后恢复<br>· 配合 <code>matt-*</code> 预设：一轮只投一次表单、当轮即结束，原生 <code>ask_user_question</code> 保留给简单确认<br>· ⚠️ 形态：bundle + 客户端半边——工具由 preset 工具行（<code>- id: tool-grilling-form</code>）注册，profile <code>dsh.profile.bundles</code> 里的本包载体行（<code>id: lynn-grilling-form-carrier</code>、<code>config.carrier: true</code>，什么都不注册）只为让 Web shell 服务表单 bundle</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling</code></td>
    </tr>
    <tr>
      <td><b>📱 设备访问</b><br><i>跨设备与本机外部应用接入</i></td>
      <td><a href="./plugins/dsh-web-auth-url"><code>@lynn123411/dsh-web-auth-url</code></a></td>
      <td><b>GUI 鉴权地址</b><br>· 把当前实例<b>带 token 的访问地址</b>交给模型与 shell：托管 <code>DSH_WEB_AUTH_URL</code>，每次 shell 调用即时解析，token 随重启轮换自动跟随<br>· 贡献一段紧随 <code>app:web-surface</code> 的提示词，交代「第一次请求 303 换 cookie、之后复用同一个 jar」这一必需用法（token 只对 <code>GET /</code> 有效，之后全靠 Set-Cookie，故 <code>curl -c/-b</code> 是唯一可行路径）<br>· <b>secret 不进提示词与 transcript</b>：默认只报变量名，<code>inline</code> 档才把带 token 的地址写进提示词<br>· 形态：bundle 型插件，无客户端半边、不新增端口与凭据</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-web-auth-url</code></td>
    </tr>
  </tbody>
</table>

---

## 🎨 Agent Presets（presets/）

| preset | 说明 | 安装 |
| --- | --- | --- |
| [minimal-fs](./presets/minimal-fs) | **极简-文件测试模式**：官方 `minimal` 的身份（`prefix` 即完整系统提示词、关闭运行时快照）＋ 文件工具 `read` / `write` / `edit`，**整组不含 shell**。工具目录就是这三个——没有 bash / pwsh、没有检索 / `read_image`、没有技能 / 计划 / 目标 / 子代理。随包的 `tool-filter` 行在 `system-prompt/assemble` 处把 `read_image` 移出模型可见目录（`tools.restrict()` 只筛继承工具、兄弟行包注册表又输给 loader 的并发装载，两条路都已实测不成立） | `dsh plugin --profile web add @lynn123411/dsh-preset-minimal-fs` |
| [matt-standard](./presets/matt-standard) | **Matt 标准工程模式**：官方 `standard` 组合（persona 零改动）＋ Matt Pocock 26 个技能（[mattpocock/skills](https://github.com/mattpocock/skills)）＋ grilling 表单工具。grilling 轮次把整轮问题一次投成对话里的表单、当轮即结束（不再写散文预告）；原生 `ask_user_question` 保留给简单确认。达成共识后不自动进入 plan mode。形态：可安装的 bundle 包，patch 插一条 `@deepseek-ai/dsh-agent-preset` 行（order 11） | `dsh plugin --profile web add @lynn123411/dsh-preset-matt-standard @lynn123411/dsh-ask-user-grilling` |
| [matt-ptc](./presets/matt-ptc) | **Matt PTC 模式（实验性）**：官方 `ptc` 组合（persona 零改动，`mode: ptc` 下模型只见 `run_code`）＋ 26 个 Matt 技能（`skills/`）＋ grilling 表单工具（轮次经 `run_code` 内的 `tools.grilling_form` 一次投出对话里的表单、当轮即结束）；原生 `ask_user_question` 保留给简单确认。达成共识后不自动进入 plan mode。形态：可安装的 bundle 包，patch 插一条 `@deepseek-ai/dsh-agent-preset` 行（order 12） | `dsh plugin --profile web add @lynn123411/dsh-preset-matt-ptc @lynn123411/dsh-ask-user-grilling` |
| [matt-cordis](./presets/matt-cordis) | **Matt 创造模式**：官方 `cordis` 组合（persona 零改动，含 `tool-cordis` 工具行与官方随附的 4 个技能）＋ 26 个 Matt 技能并入 `skills/` ＋ grilling 表单工具。grilling 轮次把整轮问题一次投成对话里的表单、当轮即结束（不再写散文预告）；原生 `ask_user_question` 保留给简单确认。形态：可安装的 bundle 包，patch 插一条 `@deepseek-ai/dsh-agent-preset` 行（order 13） | `dsh plugin --profile web add @lynn123411/dsh-preset-matt-cordis @lynn123411/dsh-ask-user-grilling` |

> 四个 preset 都是可安装的 **bundle 包**（npm 名 `@lynn123411/dsh-preset-<id>`），安装命令与插件同一条：它把包写进 profile 的 `dependencies`、并把包名登记进 `dsh.profile.bundles`。装完**重启 DSH**，再在新建会话界面选择对应模式——preset 的挂载在进程内只装载一次，改 patch 或随包文件都不会热更。开发副本把包名换成仓库内路径：`dsh plugin --profile web add ./presets/<id>`（在仓库根执行，会记成 `link:`）。三个 `matt-*` 的命令里另点名 `@lynn123411/dsh-ask-user-grilling`：它已是各包的 `dependencies`（行总可解析），但 bundle 层只按 profile 的**直接依赖**登记，漏了它工具照常可用、表单行退回原始 JSON。三个 `matt-*` 的开发副本同理：`dsh plugin --profile web add ./presets/<id> ./plugins/dsh-ask-user-grilling`（`link:` 包的 `dependencies` 不会被物化，只 link preset 会缺行）。

---

## 🛠️ 本地补丁（patches/）

| 目录 | 说明 |
| --- | --- |
| [matt-presets-bootstrap](./patches/matt-presets-bootstrap/) | **三个 matt preset 的改动点与重打说明**：相对官方 0.2.0-rc.2 preset patch 的逐处改动清单（包装与身份、技能目录 `customSkillDirs`、工具行 `tool-grilling-form`（上游 `tool-ask-user` 保留）、matt-cordis 的 persona 与官方 cordis 随附技能的处置）、`skills/grilling/SKILL.md` 四处本地适配的成品块、当前基线、外部材料与「何时重打」。**纯文档，无脚本**。详见 [README](./patches/matt-presets-bootstrap/README.md) |

---

## 📄 许可证

本仓库与 `plugins/` 各目录都不附带 `LICENSE` 文件：许可只由各包 `package.json` 的 `license` 字段声明（MIT）。 
