---
name: kimi-cu
description: |
  使用 KimiCU 读取和操作本机 Windows app：查看界面或截图，点击、输入、滚动、拖拽，以及列出应用和窗口。用户需要代为操作桌面界面时使用；仅讨论或修改 app 代码时不需要。
---

# kimi-cu — Windows 前台 GUI 操作

通过 KimiCU MCP 的 UIA 树和截图观察界面，再定向操作目标应用。参数以当前工具 schema 为准；本 skill 说明目标绑定、操作选择和验证规则。

DSH 把这些工具注册为 `mcp__kimi-cu__<name>`（例如 `mcp__kimi-cu__list_apps`）；下文用去掉前缀的短名指代。

如果 `mcp__kimi-cu__*` 工具不存在或连接失败，先调用 DSH 的 `kimi_cu_status` 工具查安装状态与修复步骤，把结论转告用户；不要在缺装时假装能操作。

## 与 macOS 版的关键差异

- Windows 版无法像 macOS 版那样全程后台输入：执行点击、输入等操作时可能短暂激活目标窗口、使用你的真实鼠标键盘，并在每块显示器上显示使用中提示与光晕。
- 不需要 macOS 的辅助功能/屏幕录制授权；目标应用以管理员权限运行时，KimiCU 需要同等权限（管理员模式由用户在控制面板里手动开启并确认 UAC）。
- 工具面是 13 个：`list_apps`、`launch_app`、`activate_window`、`get_app_state`、`click`、`type_text`、`press_key`、`scroll`、`set_value`、`perform_secondary_action`、`select_text`、`drag`、`turn_ended`。没有 `paste`、`drag_paths`、`js`、`js_reset`、`list_windows`、`get_window`、`debug_tap`。

## 操作边界

- 真实输入会短暂占用键鼠；用户正在操作电脑时先说明再动手。Esc 可以停止当前 turn 的后续真实输入。
- 同一时刻只允许一个会话持有真实输入；收到 `computer_use_busy` 时停止发输入，只做只读观察，等另一会话结束后再试。
- 不向受保护的终端窗口（命令提示符、PowerShell、Windows Terminal 等）发送输入；不发 Win/Meta/Super/Command 组合键；Explorer 的桌面/任务栏外壳不可操作，普通文件资源管理器窗口可以。
- 桌面必须已解锁并处于交互式会话；锁屏、UAC 安全桌面或远程会话断开时，运行时拒绝 GUI 观察与输入，请用户解锁/重连，不要循环重试。
- 发送、提交、删除、付款等动作须在用户已明确授权的目标和范围内；已有授权不重复确认，缺少必要信息时再问。

## 观察与目标绑定

1. 目标不明确时用 `list_apps` 定位已打开的应用；需要启动尚未运行的应用时用 `launch_app`（可传可执行文件路径/名称、StartApps 显示名或 AppID），启动后再 `list_apps` 选窗口。
2. 用 `get_app_state` 观察目标；后续 index 和坐标必须来自这次观察。`mode` 取当前 schema 支持的值；截图会作为图片返回。
3. 只需要恢复最小化窗口时用 `activate_window`；普通输入会自动激活目标，不要反复激活。
4. 执行动作；页面切换、滚动、弹窗或布局变化影响目标时，重新观察再决定下一步。
5. 验证任务要求的结果。投递成功不等于生效；必要时再次观察。

坐标纪律：

- `click` / `scroll` / `drag` 的 x/y 是所用截图的像素坐标，不是屏幕坐标。
- `get_app_state` 返回的 `snapshot_id` / `app_state_id` 把动作绑定到那次观察；内容变化后重新观察。
- UIA 的 bbox 可能缺失或不准确；截图与 UIA 不一致时以截图为准。

## 输入与编辑

- 普通表单整体赋值优先 `set_value`。
- 聊天框、富文本输入优先 `type_text` 并显式指定 `index` 或截图 x/y；`type_text` 不负责聚焦、清空或提交，先建立焦点再输入。
- 需要替换时显式清空（按当前 schema 的 `clear` 参数）；保留原文插入时确认插入点在末尾。
- 文本会覆盖系统剪贴板并留在那里。
- 输入和发送分开判断；仅在任务包含发送时提交。

## 点击、滚动与批量

- 优先使用元素自带的 UIA 动作；动作名称来自观察结果。
- 滚动用 `scroll`；方向与单位以当前 schema 为准，滚动后重新定位受影响的目标。
- 动作未生效时先重新观察目标和状态，再选择界面提供的等价操作；不要连续盲重试。
- 目标稳定、后续步骤能用代码判断的批量操作，用普通工具逐个 `await`；Windows 版没有 `js`，不要假设有。

## 结束一轮

- 本轮做过真实输入时，结束前调用 `turn_ended`，让运行时清理本轮的输入租约与停止状态；它不撤销已经投递的操作。
- 连接恢复只重建连接；已派发的点击/输入可能已经生效，不会自动重放。

## 排障与安装

- 安装：官方 runtime 安装命令（PowerShell）：

  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-RestMethod 'https://cdn.kimi.com/kimi-computer-use-windows/latest/setup_windows.ps1' | Invoke-Expression"
  ```

  默认装到 `%LOCALAPPDATA%\Kimi Computer Use\kimi-cu.exe`；旧版目录是 `%LOCALAPPDATA%\KimiCU`。
- 检查运行时：`& "$env:LOCALAPPDATA\Kimi Computer Use\kimi-cu.exe" doctor`，应输出 `mcp=true` 与 `helper=embedded`。
- 权限诊断：`kimi-cu.exe open-panel` 打开控制面板；需要操作管理员应用时，由用户在面板里开启管理员模式并确认 UAC。不要自己操作 UAC。
- 运行时更新中会返回 `runtime_upgrading` / `reconnect_required`；按提示重连 MCP，不要在同一个 MCP 会话里重试。
- 自定义路径：启动宿主前把 `KIMI_CU_WINDOWS_EXE` 设成现有的 `kimi-cu.exe` 绝对路径。
- CLI 只用于排障/安装维护；日常取图、取坐标和操作仍用 MCP。
