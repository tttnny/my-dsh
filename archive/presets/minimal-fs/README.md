# minimal-fs — 极简文件测试模式

> 官方 `minimal`（极简模式）的**身份**，并入文件工具三件套（`read` / `write` / `edit`）——**没有 shell**。专门用来做**模型能力对照测试**：排除一切命令执行与工具编排的便利，只看模型靠「读文件 + 写文件」能走多远。

## 功能

- **模型的全部执行通道就是三个文件工具**：`read`、`write`、`edit`，读、写、改都只能走它们。
- **没有 shell**：PTY 服务、终端后端与工具行整组不在，模型没有别的执行通道。
- **精简的工具目录**：没有 `bash` / `pwsh`、没有 `glob` / `grep`、没有 `read_image`、没有技能 / 计划 / 目标 / 子代理 / 网页。
- **身份与官方极简模式一致**：固定提示词、无运行时快照、不加载指令文件（`AGENTS.md`）、无上下文压缩。

## 特性

- **身份逐字沿用官方**：`prefix` 即完整系统提示词（`complete: true`）、关闭运行时快照，与官方极简模式逐字相同，也没有工具指引段落。
- **文件工具替代 shell**：官方极简模式把文件访问完全交给 shell（`cat` / `sed` / heredoc），这里把 shell 整个拿掉，只留三个结构化文件工具。
- **`read_image` 根本不注册**：`tool-fs` 行的 `readImage: false` 让这个工具不装配，不靠过滤。
- **`grilling_form` 移出模型可见目录**：它由 `@lynn123411/dsh-grilling-form` 包内根层行注册进全局层，本 preset 靠随包的 `tool-filter` 行在 `system-prompt/assemble` 处收窄，工具本身照旧注册。
- **声明形态**：bundle 型 preset 包，`config.order` 为 5（排在官方四条之后）；与官方极简模式的逐项对照、组成、声明形态、安装与验证见 [DETAILS.md](./DETAILS.md)。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-preset-minimal-fs
```

装完**重启 DSH**，在新建会话界面选择「极简-文件」。开发副本把包名换成仓库内路径（在仓库根执行）：`dsh plugin --profile web add ./presets/minimal-fs`。
