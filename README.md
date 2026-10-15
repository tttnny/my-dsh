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
      <td><b>聊天翻译</b><br>接管助手行的正文渲染，把每段回答改写成自然简体中文，译文与原文随时一键切换。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-chat-translate</code></td>
    </tr>
    <tr>
      <td><b>🔌 模型接入</b><br><i>把外部网关变成 DSH 原生提供商</i></td>
      <td><a href="./plugins/dsh-a6api"><code>@lynn123411/dsh-a6api</code></a></td>
      <td><b>A6API 接入</b><br>把 A6API 聚合网关注册成 DSH 原生提供商，模型一键同步，另有一套商户卡片界面挑线路、看余额、比价格。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-a6api</code></td>
    </tr>
    <tr>
      <td><b>🎛️ 模型选择</b><br><i>输入框里模型选择器的形态</i></td>
      <td><a href="./plugins/dsh-model-submenu"><code>@lynn123411/dsh-model-submenu</code></a></td>
      <td><b>模型二级菜单</b><br>给输入框的模型选择器加上供应商层级：先挑供应商，再挑它的模型。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-model-submenu</code></td>
    </tr>
    <tr>
      <td><b>🧠 Agent 工作流</b><br><i>面向模型与流程，随 profile 生效</i></td>
      <td><a href="./plugins/dsh-grilling-form"><code>@lynn123411/dsh-grilling-form</code></a></td>
      <td><b>盘问表单</b><br>把 grilling 轮的问题作为一张可交互表单投在对话流轮次尾部，投出即结束本轮，作答由用户导入输入框后自行发送。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-grilling-form</code></td>
    </tr>
    <tr>
      <td><b>📱 设备访问</b><br><i>跨设备与本机外部应用接入</i></td>
      <td><a href="./plugins/dsh-web-auth-url"><code>@lynn123411/dsh-web-auth-url</code></a></td>
      <td><b>GUI 鉴权地址</b><br>把当前实例带 token 的访问地址交给模型与 shell，默认不把 secret 写进提示词与会话记录。</td>
      <td><code>dsh plugin --profile web add @lynn123411/dsh-web-auth-url</code></td>
    </tr>
  </tbody>
</table>

---

## 🎨 Agent Presets（presets/）

| preset | 说明 | 安装 |
| --- | --- | --- |
| [minimal-fs](./presets/minimal-fs) | **极简-文件测试模式**：官方极简模式的身份，并入文件工具三件套 `read` / `write` / `edit`，整组不含 shell。 | `dsh plugin --profile web add @lynn123411/dsh-preset-minimal-fs` |
| [plugin-upgrade-cordis](./presets/plugin-upgrade-cordis) | **插件升级创造模式**：官方创造模式逐字保留，并入 11 个插件工程技能。 | `dsh plugin --profile web add @lynn123411/dsh-preset-plugin-upgrade-cordis` |

> `presets/` 下的 preset 都是可安装的 **bundle 包**（npm 名 `@lynn123411/dsh-preset-<id>`），安装命令与插件同一条：它把包写进 profile 的 `dependencies`、并把包名登记进 `dsh.profile.bundles`。装完**重启 DSH**，再在新建会话界面选择对应模式——preset 的挂载在进程内只装载一次，改 patch 或随包文件都不会热更。开发副本把包名换成仓库内路径：`dsh plugin --profile web add ./presets/<id>`（在仓库根执行，会记成 `link:`）。

---

## 📄 许可证

本仓库与 `plugins/` 各目录都不附带 `LICENSE` 文件：许可只由各包 `package.json` 的 `license` 字段声明（MIT）。
