# @lynn123411/dsh-smooth-stream

> 分叉自 [Laplace-bit/dsh-smooth-stream](https://github.com/Laplace-bit/dsh-smooth-stream) v0.6.0：单内核适配 DSH `0.1.5-rc.1`，归入 `@lynn123411` 命名空间，并**移除工具卡片内部的逐字揭示**。上游原版说明见其仓库 README。

把 AI 的长篇生成变成提词器式的温润流淌：内容呈现与视口运动各自是一条独立的物理状态机，在每一帧 rAF 里连续积分，从而消掉「整段砸在屏幕上」的跳跃感与「`scrollTop = scrollHeight` 硬跳」的重排抖动。插件同时接管助理回复与其余 Agent 行的入场、增长与跟随；**工具行仍然享受入场与跟随，但卡片内部不再逐字打印**。

## 特性

- **逐字揭示（Reveal Engine）**：按积压深度自适应调节速度（$v = 90 + \text{backlog}^{1.25} \times P$），慢速时从容、爆发时平稳追赶；折行处单帧视觉位移限制在 8px 以内。
- **零重排跟随（Follow Engine）**：二阶阻尼弹簧（$k=130, c=24, m=1$）在合成层做 `translate3d` 补偿，真实滚动容器始终锚定底部，跟随过程不读写触发 Layout 的属性。
- **闭环背压**：跟随滞后逼近预留空间时反向给揭示引擎施加阻尼（最低 0.55 倍速），防止文字增长冲出视口弹簧范围。
- **工具卡片内部即时呈现**（本分叉的差异点）：`tool-call` 行依旧被包装，保留 220ms 入场/增长滑行与滚动跟随，但卡片里的文本以完整长度落盘、不再逐字揭示 —— 所以展开工具、看命令输出时没有打字机延迟。
- **单内核适配**：面向 DSH `0.1.5-rc.1` 重建接缝 —— `ClientContext` 用 cordis `Context`、Chat 节点契约取自 `@deepseek-ai/dsh-client-ui-chat/client`、图片改走内核的 `conversation.message.images` slot、客户端 store 静态取自模块表 seed；只为 ≤ 0.1.2 内核存在的兼容探针已删除。
- **原生设置命名空间**：偏好读写走 DSH 的 `settingsScope` 服务（命名空间 `lynn-smooth-stream`），设置页「插件配置」里按命名空间自动配对卡片；仅「版本 + 一键更新」保留一条极小的插件 RPC。
- **动效偏好三态**：`auto`（跟随系统 reduce-motion）/ `force-smooth` / `force-reduced`。
- **思考块自动展开与回合折叠**：流式期间自动展开思考，回合结算后收敛为 `已处理 X 秒` 摘要行。
- **诊断面板**：可选的实时 HUD，观测 FPS、字符积压、弹性曲线并微调物理参数。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-smooth-stream
```

从本仓库源码本地联调（临时装配，改动即时生效）：

```bash
cd plugins/dsh-smooth-stream
pnpm install
pnpm build          # 产出 lib/index.js（host）与 lib/client.js（浏览器半边）
# 然后在 ~/.dsh/profiles/web 里以本地路径依赖加入本包，并写进 dsh.profile.bundles
```
