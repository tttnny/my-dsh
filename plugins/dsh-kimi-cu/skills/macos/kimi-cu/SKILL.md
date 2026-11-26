---
name: kimi-cu
description: |
  使用 KimiCU CodeAct 读取和操作本机 macOS 应用或浏览器网页，包括观察、点击、输入、滚动和拖拽。用户需要代为操作桌面或浏览器时使用；仅讨论或修改代码时不需要。
---

# kimi-cu — macOS CodeAct 操作

DSH 的 KimiCU MCP 提供 `js` 和 `js_reset`（完整工具名为 `mcp__kimi-cu__js` / `mcp__kimi-cu__js_reset`）。通过它们调用运行时自带的 `cua`，无需 import；参数和可用 API 以当前工具描述及 `cua.help()` 为准。工具缺失或连接失败时先调用 `kimi_cu_status`，报告安装或修复结果。

## 观察与操作

1. 用 `await cua.listApps({running_only:true})` 找应用，从返回对象的 `apps` 数组选择目标；用 `cua.getApp(bundle_id)` 创建句柄。首次调用只做发现或观察，并读取返回的 API 参考。
2. 用 `app.getState({mode:"ax"})` 读界面；需要截图用 `mode:"image"`，确需两者时用 `mode:"full"`。多窗口先用 `app.listWindows()` 找窗口，再观察目标窗口。
3. 基于本次观察选择唯一目标；按 index 操作时传相应的 `snapshot_id`。坐标使用所选截图的像素，并绑定该图的 `window_id` 和 `screenshot_id`；AX bbox 是窗口内点坐标，不能当截图像素。
4. 执行动作后观察并验证实际结果，检查 `verified`、`effect` 和 `verification_required`。投递成功不等于生效；结果不明时先观察，不盲目重放。

界面变化、窗口切换或快照过期后重新观察。默认 AX 树可能被截断；目标可能遗漏时用 `app.getState({mode:"ax",offset:0})` 开始分页，按返回的 `next_offset` 和 `snapshot_id` 续读直到 `has_more` 为 false。分页过期或被新观察替换后重新开始。

表单整体赋值优先 `app.setValue`；聊天框和富文本优先定向 `app.typeText`。替换内容时显式 `clear:true`，追加前确认插入点。输入和发送分开判断，只在任务包含发送时提交。滚动优先使用 `page`（正数向上），滚动后重新定位。

同窗口批量笔画可用 `app.drag({paths,...})`；保留用户操作守卫。批量不是事务，检查 `delivered` 和 `results`，结合画面确定完成情况后只处理剩余路径。

## 浏览器与 JS 会话

浏览器任务使用 `cua.createTab`、`cua.listBrowserTabs` 或 `cua.attachTab`，再通过标签页对象观察和操作。页面动作使用当前观察的 ref，导航或重渲染后重新观察。浏览器功能关闭时引导用户开启，不绕过开关；扩展及本地服务须已连接。

DSH 的多个会话共用一条 MCP 连接及其持久 JS 状态，变量、句柄和 `js_reset` 会互相影响；跨会话没有隔离。多个会话操作 KimiCU 时必须错开，不能把持久变量当作私有数据。一次性调用优先用 `scope:"cell"`，但它仍可读取已有持久变量，不是隔离机制。已确定的操作可以放在同一 cell，遇到需要判断的新界面时先返回观察结果。异常可能发生在部分动作完成之后；检查错误结果与实际界面。重连或 `js_reset` 不会撤销动作，重连后重新发现目标，不沿用旧句柄、快照或截图。

## 操作边界与排障

默认后台操作，不移动真实光标或用其他工具绕过限制；只有任务需要且用户已授权前台操作时才激活窗口。发送、删除、付款等动作以用户已授权的目标和范围为准。

缺少 `js` / `js_reset` 时检查 KimiCU 安装版本、官方启动脚本和 MCP 连接；更新插件后重连 MCP，已有会话仍显示旧工具时新建会话。重连后先用 `console.log(cua.help())` 和 `console.log(await cua.listApps({running_only:true}))` 做只读验证。

权限由 KimiCU 后台服务持有。服务或权限故障时可用 `/Applications/KimiCU.app/Contents/MacOS/kimi-cu xpc-ping` 检查；需要系统授权时引导用户操作。日常观察和输入使用 CodeAct，不用 CLI 截图生成坐标。用户明确要求恢复服务时可用 `/Applications/KimiCU.app/Contents/MacOS/kimi-cu fix --json`；它会重建服务并结束旧 CodeAct 会话，事后重连并重新观察。
