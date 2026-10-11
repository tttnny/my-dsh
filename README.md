# my-dsh

> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 插件 / preset 合集 · Collection of DSH plugins & presets

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
      <td><b>聊天翻译</b><br>· 接管助手行渲染（keyed slot <code>assistant-step</code>），正文块不论源语言一律送模型改写成自然简体中文——整段中文同样照送、顺机器腔；Think 卡 / 工具调用行 / 用户消息 / 代码块 / 空白块不翻，与宿主渲染逐分支等价，接管器抛错自动退位给宿主<br>· 结构重装配：代码围栏逐字保留、从不送模型，散文段送译后按原结构拼回，经基线组件 <code>MarkdownText</code> 重渲染；形状修复按段落块对齐——结构行（记号类别、表格竖线、链接数）逐一对齐并把行首前缀修回原文、散文行自由重排、空行布局取原文，修不齐的自动重掷一次、仍不齐则照收译文，形状问题不再否决内容<br>· 正文排版原生：左缘不画任何标记、不加缩进；可点的两个东西都在正文左缘之外——成功块是 6px 透明窄带（点它切译文/原文，再点切回），失败块是一个常驻的 ↻ 按钮（悬停报通道细节：超时/断流/空返回，点它整行重译，等待期间原地转圈）；模型返回一模一样也算翻过<br>· 开关两个入口：输入框下方那一行的「译」胶囊与本插件配置页总开关，读写同一个 <code>enabled</code><br>· 落定且进入视口才整行请求（每行唯一的首跑），失败不自动重试——点 ↻ 整行手动补跑，已成功的结果保持不变；串行单在途；磁盘缓存按提示词修订号（<code>PROMPT_REVISION</code>）整体作废，换提示词不让旧译文串代<br>· OpenAI 兼容 AI 单通道（Key / Base URL / 模型齐备才翻，Key 存 <code>~/.dsh/.credentials.yaml</code>）<br>· 配置页挂在「<b>插件</b>」页：注册进 <code>plugins.bundle.config</code>（key <code>@lynn123411/dsh-chat-translate</code>），进本插件详情页即可直接改，无需再点开某一行<br>· 脸面：中文名「聊天翻译」＋一句话简介＋极简线性图标（<code>locale/</code> 的 <code>meta</code> 与 <code>package.json</code> 的 <code>icon</code>）</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-chat-translate</code></td>
    </tr>
    <tr>
      <td><b>🔌 模型接入</b><br><i>把外部网关变成 DSH 原生提供商</i></td>
      <td><a href="./plugins/dsh-a6api"><code>@lynn123411/dsh-a6api</code></a></td>
      <td><b>A6API 接入</b><br>· 将 A6API 聚合网关注册为 DSH 原生 LLM 提供商，模型一键同步进选择器<br>· 多标签页视图、余额（$ / ¥）与调用明细、模型白名单同步<br>· 商户线路实时探测与全景指标卡片（含官方 vs 商户价格对比）<br>· 左侧边栏底部「A6api」入口（与「设置」同处），浮层从按钮右侧展开，含账户余额 / 价格波动 / 模型市场 / 配置胶囊行<br>· 模型协议三选一（OpenAI Chat / OpenAI Response / Messages，整条线路共用），接入地址固定为官方地址<br>· 模型目录：拉取市场模型、从 OpenRouter 查询参数与推理档位，档位来源分已确认 / 未确认（未确认标「档位未确认」）<br>· 配置页挂在「<b>插件</b>」页：注册进 <code>plugins.bundle.config</code>（key <code>@lynn123411/dsh-a6api</code>），进本插件详情页即可直接改</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-a6api</code></td>
    </tr>
    <tr>
      <td><b>🎛️ 模型选择</b><br><i>输入框里模型选择器的形态</i></td>
      <td><a href="./plugins/dsh-model-submenu"><code>@lynn123411/dsh-model-submenu</code></a></td>
      <td><b>模型二级菜单</b><br>· 给输入框模型选择器加上供应商层级：根面板保持原生两行「供应商 / 推理等级」，点「供应商」进供应商列表（当前供应商那行显示它正在使用的模型名并勾选，其余显示模型数量），再点某个供应商进它的模型列表，面板顶部有返回行<br>· 点模型立即提交并关闭；推理等级保持原生——根面板的「推理等级」行进该模型的等级列表，选中即提交，「Default」表示跟随供应商默认<br>· 外观沿用内置弹层与 <code>--dsw-*</code> 主题变量；方向键 / Tab / Escape 与加载、失败、提交被拒的提示照旧<br>· 形态：bundle 型插件，客户端半边以 <code>priority: -100</code> 接管 <code>conversation.input.model</code>，<code>/model</code> 命令面板与设置页不受影响</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-model-submenu</code></td>
    </tr>
    <tr>
      <td><b>🧠 Agent 工作流</b><br><i>面向模型与流程，随 profile 生效</i></td>
      <td><a href="./plugins/dsh-grilling-form"><code>@lynn123411/dsh-grilling-form</code></a></td>
      <td><b>盘问表单</b><br>· <code>grilling_form</code>：grilling 轮的逐题盘问工具——校验入参后调用 <code>exec.concludeTurn()</code> 立即结束本轮，并把整轮问题作为一张<b>投在对话流轮次尾部的可交互表单</b>投出去（不阻塞等答案、不接管输入框）；入参表示不了的（重复 id、空题干、空 label、同题重名 label、展开正文里把选项又列一遍）就地返回 <code>rejected</code> + <code>violations</code> 且不结束本轮（总说明只报条数，规则由逐条违规自己说；选项名里的顿号、冒号不再拒收——作答按「一项一行」回填）<br>· 表单挂在对话流的<b>轮次尾部</b>（工具行必被折进这一轮的「工作过程」，住那儿得先展开才看得见；那条工具行只在入参被拒时画违规清单、调用失败时给失败说明），没有折叠行也没有卡片壳，题目跟正文同处一层、没有进度行；<b>题型两种</b>（多选题是缺省，<code>multi_select: false</code> 即单选、一题至多留一项，单选的圈是圆圈加实心点、行为与多选同一个控件）、<b>推荐项默认勾上</b>、每题自填、<code>detail</code> markdown 正文（只写各选项共用的背景）、<code>number</code> 并进 <code>header</code>、「推荐」徽标；底部的导入键把作答写进<b>原生输入框草稿</b>（键自己的文案就是提示：<b>导入输入框 / 已导入 / 更新输入框</b>，表单改过之后催你更新，没可导的作答时说清要先作答），用户按原生发送键发出，作答作为下一条用户消息到达；这条调用之后有过用户发言，表单就<b>冻结</b>成提交时的样子（选择器与自填框原样留着、锁住、文字还能选中）并按<b>实发消息</b>重画，且整块<b>不折叠、始终摊开</b>、顶上只多一行摘要（那行不可点、没有箭头）——消息里<b>根本没有作答块</b>时如实显示「本轮没有通过表单作答」（本地勾选与推荐默认都不冒充），只有块坏了才退回本地那份，旁边的「从这里分叉」按本轮结束点开一条新会话、<b>失败会说出来</b>；勾选与自填按会话存 <code>localStorage</code>、刷新后恢复<br>· 与 <a href="https://github.com/tttnny/matt-skills-dsh">tttnny/matt-skills-dsh</a> 的 grilling 技能配合：技能正文只讲方法论与问题措辞，工具用法的机械细节（字段语义、会被拒的写法、作答块形态）全部以本工具自述为准，因此技能不必跟着协议漂；一轮只投一次表单、当轮即结束既是工具自述也是技能方法论，原生 <code>ask_user_question</code> 保留给简单确认<br>· ⚠️ 形态：bundle + 客户端半边——<b>一条命令装完即用</b>：包内 <code>cordis.patch.yml</code> 的根层行（<code>- id: tool-grilling-form</code>）既注册工具（root 层 ⇒ 全局层，profile 里每个 preset 的 agent 都看得见，<code>minimal-fs</code> 靠自带的 <code>tool-filter</code> 把它移出模型可见目录），又因本身是 root loader entry 而承载表单 bundle；profile 侧不需要手写补丁</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-grilling-form</code></td>
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
| [minimal-fs](./presets/minimal-fs) | **极简-文件测试模式**：官方 `minimal` 的身份（`prefix` 即完整系统提示词、关闭运行时快照）＋ 文件工具 `read` / `write` / `edit`，**整组不含 shell**。工具目录就是这三个——没有 bash / pwsh、没有检索 / `read_image`、没有技能 / 计划 / 目标 / 子代理。随包的 `tool-filter` 行在 `system-prompt/assemble` 处把 `read_image` 与 profile 根层的 `grilling_form` 移出模型可见目录（`tools.restrict()` 只筛继承工具、兄弟行包注册表又输给 loader 的并发装载，两条路都已实测不成立） | `dsh plugin --profile web add @lynn123411/dsh-preset-minimal-fs` |
| [plugin-upgrade-cordis](./presets/plugin-upgrade-cordis) | **插件升级创造模式**：官方创造模式（`cordis`）逐字保留（persona、工具矩阵、计划 / 压缩 / 子代理编排、动态插件工具 `tool-cordis`），另并入 [dsh-plugin-upgrade-skill](https://github.com/oh-my-dsh/dsh-plugin-upgrade-skill) 的 **11 个插件工程技能**（随包 `skills/`）：`plugin-upgrade` / `plugin-workflow` / `plugin-write` / `plugin-test` / `plugin-release` / `plugin-runtime-debug` / `plugin-fleet-sweep` / `plugin-heavy-dep` / `dsh-upgrade-audit` / `dsh-benchmark-case` / `generic-migration` | `dsh plugin --profile web add @lynn123411/dsh-preset-plugin-upgrade-cordis` |

> `presets/` 下的 preset 都是可安装的 **bundle 包**（npm 名 `@lynn123411/dsh-preset-<id>`），安装命令与插件同一条：它把包写进 profile 的 `dependencies`、并把包名登记进 `dsh.profile.bundles`。装完**重启 DSH**，再在新建会话界面选择对应模式——preset 的挂载在进程内只装载一次，改 patch 或随包文件都不会热更。开发副本把包名换成仓库内路径：`dsh plugin --profile web add ./presets/<id>`（在仓库根执行，会记成 `link:`）。

---

## 📄 许可证

本仓库与 `plugins/` 各目录都不附带 `LICENSE` 文件：许可只由各包 `package.json` 的 `license` 字段声明（MIT）。 
