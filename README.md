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
      <td rowspan="2"><b>🎨 视觉皮肤</b><br><i>只改表现，关掉即回官方原版</i></td>
      <td><a href="./plugins/dsh-ui-deepseek-bg"><code>@lynn123411/dsh-ui-deepseek-bg</code></a></td>
      <td><b>背景引擎</b><br>· 仿 DSH 官网风格：极光（WebGL2 流体）/ 粒子鲸鱼 / 星座网格 + 鼠标跟随交互<br>· 内置「背景特效」面板（性能档位 / 特效开关 / GPU 调优）<br>· 建议与界面皮肤层成对安装，还原完整官网观感</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-ui-deepseek-bg</code></td>
    </tr>
    <tr>
      <td><a href="./plugins/dsh-ui-beam-orbs"><code>@lynn123411/dsh-ui-beam-orbs</code></a></td>
      <td><b>界面皮肤层</b><br>· 玻璃拟态 + Border Beam 五态边框流光 + Thinking Orbs 几何光球 + Pulse 任务框 + 发送按钮微动效<br>· 内置「界面特效」面板，与背景引擎叠加还原完整沉浸感<br>· 浅色主题自动回退官方原版</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-ui-beam-orbs</code></td>
    </tr>
    <tr>
      <td rowspan="3"><b>📖 阅读体验</b><br><i>作用于对话流的「读」，不污染上下文</i></td>
      <td><a href="./plugins/dsh-oil-sticky-prompt"><code>@lynn123411/dsh-oil-sticky-prompt</code></a></td>
      <td><b>对话吸顶提示</b><br>· 最近一条用户 Prompt 悬浮固定在对话流顶部，告别长对话迷路<br>· 点击平滑回滚至对应消息<br>· 纯 DOM 观察、零服务依赖<br>· 新增「启用 / 停用」设置，并入共享的「<b>阅读体验</b>」设置页</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-oil-sticky-prompt</code></td>
    </tr>
    <tr>
      <td><a href="./plugins/dsh-smooth-stream"><code>@lynn123411/dsh-smooth-stream</code></a></td>
      <td><b>丝滑流式渲染</b><br>· 自适应揭示引擎：按积压深度调速，折行单帧位移 ≤ 8px<br>· 二阶阻尼弹簧跟随：合成层 <code>translate3d</code> 补偿，零重排<br>· 闭环背压 + 掉帧自愈；思考块自动展开、回合结算自动折叠<br>· <b>工具卡片内部不逐字揭示</b>：工具行保留入场与跟随，卡片文本即时完整呈现<br>· 设置项与另两个阅读插件共用「<b>阅读体验</b>」设置页（先到先得当选页面宿主）<br>· 上游分叉 <code>Laplace-bit/dsh-smooth-stream</code> v0.6.0：单内核适配 <code>0.1.5-rc.1</code>，改名 <code>lynn-smooth-stream</code> 命名空间</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-smooth-stream</code></td>
    </tr>
    <tr>
      <td><a href="./plugins/dsh-chat-translate"><code>@lynn123411/dsh-chat-translate</code></a></td>
      <td><b>聊天翻译</b><br>· 工具调用与思考摘要自动译中（思考完全结束才翻、仅当前会话、正文不翻）<br>· OpenAI 兼容 AI 通道（可配 Base URL / 模型，Key 存 <code>~/.dsh/.credentials.yaml</code>）+ 免 Key Bing 兜底双通道<br>· 设置项并入共享的「<b>阅读体验</b>」设置页（原「聊天翻译」独立设置页已移除）</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-chat-translate</code></td>
    </tr>
    <tr>
      <td><b>🗂️ 工作区管理</b><br><i>侧栏信息架构与会话资产，含写语义</i></td>
      <td><a href="./plugins/dsh-workspace-tree"><code>@lynn123411/dsh-workspace-tree</code></a></td>
      <td><b>工作区树</b><br>· 文件系统推导的多级树（文件夹 / 工作区双模式，会话环境严格隔离）<br>· 一键在外部 IDE 打开（VS Code / Cursor / CodeBuddy / Windsurf / Trae / JetBrains 等）<br>· 全局重命名 + 安全归档区 + 级联物理删除<br>· 唯一带注册表与文件系统写语义的侧栏插件</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-workspace-tree</code></td>
    </tr>
    <tr>
      <td rowspan="2"><b>🔌 模型接入</b><br><i>把外部网关变成 DSH 原生提供商</i></td>
      <td><a href="./plugins/dsh-a6api"><code>@lynn123411/dsh-a6api</code></a></td>
      <td><b>A6API 接入</b><br>· 将 A6API 聚合网关注册为 DSH 原生 LLM 提供商，模型一键同步进选择器<br>· 多标签页视图、余额（$ / ¥）与调用明细、模型白名单同步<br>· 商户线路实时探测与全景指标卡片（含官方 vs 商户价格对比）<br>· 侧边栏快捷模型卡片 + 账户余额 / 价格波动 / 模型市场胶囊行</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-a6api</code></td>
    </tr>
    <tr>
      <td><a href="./plugins/dsh-llm-agentrouter"><code>@lynn123411/dsh-llm-agentrouter</code></a></td>
      <td><b>AgentRouter 中转聚合</b><br>· 单 pi-ai 路由承载多模型，模型选择器只出现一个分组<br>· 国内 / 国际端点设置卡一键切换，下一请求即生效<br>· 出站 User-Agent 改写 + 402 配额围栏<br>· 上游分叉 <code>aqiu817/dsh-llm-agentrouter</code>：沿用 <code>llm-agentrouter</code> 命名空间；适配 <code>ctx.settings.installSection</code> 与 <code>settings.plugins.tab</code> slots，已在 <code>0.1.5-rc.1</code> 逐项实证兼容</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-llm-agentrouter</code></td>
    </tr>
    <tr>
      <td rowspan="2"><b>🧠 Agent 工作流</b><br><i>面向模型与流程，随 preset 生效</i></td>
      <td><a href="./plugins/dsh-ask-user-grilling"><code>@lynn123411/dsh-ask-user-grilling</code></a></td>
      <td><b>提问表单变体</b><br>· <code>ask_user_grilling</code>：原生 <code>ask_user_question</code> 的呈现变体——同一条 <code>userQuestions</code> seam，工具描述与全部参数描述<b>与原生逐字一致</b>，只强制多选、并自动追加一道轮末补充题（多选刻意不写进描述）<br>· 配合 <code>matt-*</code> 预设：轮次先散文预告、再以一次表单投递作答<br>· ⚠️ 形态：普通 Cordis 插件（preset 工具行消费，非 bundle），严禁加入 profile <code>package.json</code> 的 <code>dsh.profile.bundles</code></td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling</code></td>
    </tr>
    <tr>
      <td><a href="./plugins/dsh-mattpocock-skills-deck"><code>@lynn123411/dsh-mattpocock-skills-deck</code></a></td>
      <td><b>Matt 技能控制面板（Deck）</b><br>· wayfinder 地图 / 票务 / 进度、triage / grilling / handoff 动作注入侧栏（GitHub / GitLab / Markdown 后端）<br>· 上游分叉 <code>FeatherHunter/dsh-mattpocock-skills-deck</code>：技能判装识别 <code>~/.dsh/.agent-presets/&lt;id&gt;/skills/</code> 根并<b>按当前会话生效 preset 门控</b>（没选 Matt preset 不虚报「环境 10/10」，选了不误报缺失）<br>· 移除上游随包全局技能 provider</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-mattpocock-skills-deck</code></td>
    </tr>
    <tr>
      <td><b>📱 设备访问</b><br><i>跨设备与本机外部应用接入</i></td>
      <td><a href="./plugins/dsh-qr-access"><code>@lynn123411/dsh-qr-access</code></a></td>
      <td><b>扫码访问</b><br>· 设置页分区实时生成<b>带 token 的当前实例访问地址</b>二维码，手机扫码直达、免复制粘贴<br>· 双数据源：DSH Desktop 桌面接口优先（局域网 HTTPS + 本地 CA 证书码），<b>任意 dsh 实例</b>走插件自带宿主路由（<code>/api</code> 栅栏 + 会话鉴权），列出当前页面 / 本机 / 局域网 / <code>--trusted-host</code> 受信主机地址<br>· 地址现取当前宿主代（token 随重启轮换自动跟随，30s 轮询 + 刷新按钮 + 页面可见即刷新）<br>· 形态：bundle 型插件，宿主半区只注册一条只读路由，不新增端口与凭据面</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-qr-access</code></td>
    </tr>
  </tbody>
</table>

---

## 🎨 Agent Presets（presets/）

| preset | 说明 |
| --- | --- |
| [ptc-cordis](./presets/ptc-cordis) | **PTC-Cordis 混合模式**：融合 PTC（`mode: ptc`：模型只见 `run_code`，全部工具经 SDK 以脚本调用）与 Cordis 动态插件编辑（`cordis_define`/`run`），含 `cordis-plugin-development` / `editing-cordis-compositions` 随附技能，开箱与官方 `standard` / `ptc` / `cordis` 并列可选 |
| [matt-standard](./presets/matt-standard) | **Matt 标准工程模式**：官方 `standard` 组合（persona 零改动）+ Matt Pocock 25 个工程/生产力技能（[mattpocock/skills](https://github.com/mattpocock/skills)）+ grilling 投递插件。grilling 轮次先散文预告、再以表单工具投递作答；达成共识后不自动进入 plan mode |
| [matt-ptc](./presets/matt-ptc) | **Matt PTC 模式（实验性）**：官方 `ptc` 组合（persona 零改动，`mode: ptc` 下模型只见 `run_code`）+ 25 个 Matt 技能 + grilling 投递插件（grilling 轮次经 `run_code` 内的 `tools.ask_user_grilling` 投递） |
| [matt-cordis](./presets/matt-cordis) | **Matt 创造模式**：官方 `cordis` 组合（persona 零改动，含 `tool-cordis` 动态插件工具集、两个随附技能、双平面引导）+ 25 个 Matt 技能并入 skills/ + grilling 投递插件。grilling 轮次先散文预告、再以表单工具投递作答 |

---

## 🛠️ 本地补丁（patches/）

| 目录 | 说明 |
| --- | --- |
| [patch-dsh-cordis-inspect-idempotent](./patches/patch-dsh-cordis-inspect-idempotent/) | 修复 `dsh-tool-cordis` Host inspect provider 注册非幂等导致的「含 tool-cordis 的预设（官方 `cordis` / `ptc-cordis` / `matt-cordis`）同进程互斥」。**纯文档补丁（无脚本）**：从运行中的 DSH 进程反推它实际加载的副本再改，锚点/校验/回滚逐字写死在 README 里。详见 [README](./patches/patch-dsh-cordis-inspect-idempotent/README.md) |
| [matt-presets-bootstrap](./patches/matt-presets-bootstrap/) | **三个 matt preset 的手工改动点说明**：相对官方材料的逐处改动清单（`agent.cordis.yml` 两处 MATT-ADD + 一处 MATT-DEL、`skills/grilling/SKILL.md` 本地适配成品全文）、当前基线、外部材料与「何时重打」。**纯文档，无脚本**。详见 [README](./patches/matt-presets-bootstrap/README.md) |

---

## 📄 许可证

[MIT](./plugins/dsh-workspace-tree/LICENSE) 
