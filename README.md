# my-dsh

> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 插件 / preset 合集 · Collection of DSH plugins & presets

---

## 🔎 插件索引（发现页）

`plugins/` 与 `presets/` 同时发布成一份 DSH 插件索引，可以在插件页的**发现**标签页里浏览和安装，不必逐个记包名。

1. 打开**插件** → **实验性插件** → 打开**自定义插件索引**。
2. 在**发现**里点**添加索引源**，填 `https://tttnny.github.io/my-dsh/index.json`。

索引由 `node tools/market-index.mjs` 从 npm registry 生成，发版后由 `.github/workflows/market.yml` 自动重建并部署到 GitHub Pages。

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
      <td><b>🎨 外观</b><br><i>对话正文的排版与外壳的边角</i></td>
      <td><a href="./plugins/dsh-native-plus"><code>@lynn123411/dsh-native-plus</code></a></td>
      <td><b>原生增强</b><br>在 DSH 自带的蓝白黑之上整理对话正文与外壳：六级标题的蓝阶、引用与表格、代码块、行高与段距、内嵌字体。配色一个字不改。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-native-plus</code></td>
    </tr>
    <tr>
      <td><b>📖 阅读体验</b><br><i>作用于对话流的「读」，不污染上下文</i></td>
      <td><a href="./plugins/dsh-chat-translate"><code>@lynn123411/dsh-chat-translate</code></a></td>
      <td><b>聊天翻译</b><br>接管助手行的正文渲染，把过程步骤的外文正文译成简体中文（已是中文的段落原样保留），译文与原文随时一键切换。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-chat-translate</code></td>
    </tr>
    <tr>
      <td><b>🎛️ 模型选择</b><br><i>输入框里模型选择器的形态</i></td>
      <td><a href="./plugins/dsh-model-submenu"><code>@lynn123411/dsh-model-submenu</code></a></td>
      <td><b>模型选择</b><br>把输入框旁的模型选择器换成两层：一层列当前供应商的模型与思考等级，一层弹窗列出所有供应商的模型，可搜可收藏。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-model-submenu</code></td>
    </tr>
    <tr>
      <td rowspan="3"><b>🧠 Agent 工作流</b><br><i>面向模型与流程，随 profile 生效</i></td>
      <td><a href="./plugins/dsh-grilling-form"><code>@lynn123411/dsh-grilling-form</code></a></td>
      <td><b>拷问表单</b><br>把 grilling 轮的问题作为一张可交互表单投在对话流轮次尾部，投出即结束本轮，作答由用户导入输入框后自行发送。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-grilling-form</code></td>
    </tr>
    <tr>
      <td><a href="./plugins/dsh-subagent-judge-dispatch"><code>@lynn123411/dsh-subagent-judge-dispatch</code></a></td>
      <td><b>判断式子代理指派</b><br>派工时把任务文字交给一个判断模型，让它在你自己写的任务类型清单里挑一个编号，据此改写这个子代理使用的模型与思考强度。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-subagent-judge-dispatch</code></td>
    </tr>
    <tr>
      <td><a href="./plugins/dsh-notify-user"><code>@lynn123411/dsh-notify-user</code></a></td>
      <td><b>主动汇报</b><br>给模型一条不结束本轮就能向用户汇报进度的通道；连续多次工具调用没汇报时，插件会催它发一条。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-notify-user</code></td>
    </tr>
    <tr>
      <td><b>📱 设备访问</b><br><i>浏览器与服务地址的登录、挂载</i></td>
      <td><a href="./plugins/dsh-web-auth-url"><code>@lynn123411/dsh-web-auth-url</code></a></td>
      <td><b>GUI 登录</b><br>模型调用一次工具就拿到这个 GUI 带 token 的地址：用它换一次会话 cookie，之后照常访问干净地址。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-web-auth-url</code></td>
    </tr>
    <tr>
      <td><b>🖥️ 桌面操作</b><br><i>读写本机 app 的界面</i></td>
      <td><a href="./plugins/dsh-kimi-cu"><code>@lynn123411/dsh-kimi-cu</code></a></td>
      <td><b>KimiCU 桌面操作</b><br>接上本机 KimiCU（macOS / Windows），让模型看见并操作已打开的应用窗口；插件页检测安装状态并给出对应平台的安装命令。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-kimi-cu</code></td>
    </tr>
  </tbody>
</table>

---

## 🎨 Agent Presets（presets/）

| preset | 说明 | 安装 |
| --- | --- | --- |
| [plugin-upgrade-cordis](./presets/plugin-upgrade-cordis) | **插件升级创造模式**：官方创造模式逐字保留，并入 11 个插件工程技能。 | `dsh plugin --profile web add @lynn123411/dsh-preset-plugin-upgrade-cordis` |

> `presets/` 下的 preset 都是可安装的 **bundle 包**（npm 名 `@lynn123411/dsh-preset-<id>`），安装命令与插件同一条：它把包写进 profile 的 `dependencies`、并把包名登记进 `dsh.profile.bundles`。装完直接在新建会话界面选择对应模式，不必重启。改过 preset 的 patch 之后要触发一次重新组合（在插件页里开关任一插件，或改存 profile 的 `cordis.patch.yml`）才会换上新声明；没有 `hmr` 的 profile 仍要重启。开发副本把包名换成仓库内路径：`dsh plugin --profile web add ./presets/<id>`（在仓库根执行，会记成 `link:`）。

---

## 📄 许可证

本仓库与 `plugins/` 各目录都不附带 `LICENSE` 文件：许可只由各包 `package.json` 的 `license` 字段声明（MIT）。
