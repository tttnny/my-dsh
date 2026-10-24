---
name: kimi-cu
description: |
  使用 KimiCU 读取和操作本机 macOS app：查看界面或截图，点击、输入、滚动、拖拽，以及列出应用和窗口。用户需要代为操作桌面界面时使用；仅讨论或修改 app 代码时不需要。
---

# kimi-cu — macOS 后台 GUI 操作

通过 KimiCU MCP 的无障碍（AX）树和截图观察界面，再定向操作目标应用。参数以当前工具 schema 为准；本 skill 说明目标绑定、操作选择和验证规则。

## 操作边界

- 默认后台操作，不自行激活应用、抬窗或开启前台 fallback。永不移动真实光标、使用 HID 投递或拦截用户真实点击；不要用 AppleScript / cliclick 等绕过这些限制。
- 前台应用、键盘焦点、窗口层叠顺序是不同状态；`foreground_changed:false` 不能单独证明窗口未抬起。发现抬窗或打断用户输入时，停止相关重试并如实说明。
- 发送、提交、删除、付款等动作须在用户已明确授权的目标和范围内；已有授权不重复确认，缺少必要信息时再问。

## 观察与目标绑定

1. 目标不明确时优先用 `list_apps(running_only:true)` / `list_windows` 定位已打开的应用和窗口，避免输出全部安装目录。需要找尚未启动的应用时才用 `list_apps(running_only:false)`；不传参数同样包含已安装用户应用，内部 helper 和系统后台组件已过滤。
2. 用 MCP `get_app_state` 观察目标；后续 index 和坐标必须来自这次观察。`mode:"full"` 返回树和图，`mode:"image"` 适合看图、浮层和视觉验证，`mode:"ax"` 适合读文本及按 index 操作；`ax_filter` 可缩小树的输出。
3. 执行动作；页面切换、滚动、弹窗或布局变化影响目标时，重新观察再决定下一步。
4. 验证任务要求的结果。投递成功不等于生效；尤其检查 `verified`、`verification_required`、`effect`，必要时再次观察。

坐标纪律：

- `click` / `scroll` / `drag` / 定向 `type_text` 的 x/y 是所用截图的像素坐标，不是屏幕坐标。不要自行换算缩放比例。`mode:"ax"` 的 bbox 是窗口内点坐标，不能直接当作截图像素点击；用 index 或重新取图。
- 多窗口及浮层从 `screenshots[]` 选正确图片，传其 `window_id`；支持 `screenshot_id` 的动作同时传图片标识（主图为响应的 `screenshot_id`，数组项为 `id`）。浮窗必须用浮窗自己的图和窗口，不能省略窗口让路由猜测，也不能借用主图坐标。
- `rect:{x,y,width,height}` 使用窗口内点坐标，并把该窗口的当前截图锚点切到局部区域。区域图内的操作直接使用区域图像素；改回全窗坐标前重新取全窗图。歧义、过期或越界报错时重新观察，不强行换算重试。
- 正常观察使用 MCP（包括其 JS facade）；不要用 shell 的 `kimi-cu shot` / `app-state` / `windows` 代替。开发调试 CLI 不刷新 MCP 快照缓存。

## 输入与编辑

- 普通表单整体赋值优先 `set_value`。聊天框、富文本输入优先 `type_text` 并显式指定 `index`，或使用已绑定窗口的截图 x/y。需要替换时显式 `clear:true`；保留原文插入时用 `clear:false`，追加前确认插入点在末尾。
- 只需聚焦或放置光标时可用 `click(index)` / 坐标点击。点击失败或未建立文本焦点时，重新观察，不能继续盲目输入。
- 不带 index/x/y 的 `type_text` 和 `paste` 依赖目标应用的实际文本焦点；无焦点失败时改为定向聚焦。`paste` 可携带富文本，按返回的验证要求检查内容及格式。
- 富文本编辑交给输入工具处理，不绕过工具直接写 AXValue，也不用“清空再恢复”修复内容。验证失败可能已有部分效果，先读取现状，不盲目重贴或覆盖原文。
- 输入和发送分开判断；仅在任务包含发送时使用 `submit` / `autosubmit` 或发送按钮。

## 点击、滚动与批量

- 优先使用目标实际提供的 AX 动作；动作名称来自观察结果。弹上下文菜单可用 `perform_secondary_action` 的 `AXShowMenu`，网页右键手势也可用 `click(mouse_button:"right")`，并观察结果。
- 原生列表可用 `scroll(index, dy)`，按 AX 动作以整页粒度滚动；页面指定位置用截图 x/y。`dy>0` 向上。滚动后重新定位受影响的目标。
- `effect:"unverifiable"` + `verified:false` 表示投递完成但效果未验证（遮挡窗口或 CEF 原生 chrome 目标；点击已不做像素校验）；不能当作任务已完成，要重新观察核对是否达到预期。
- 动作未生效时先重新观察目标和状态，再选择界面提供的等价操作。不要连续盲重试，也不要为了绕过失败改做会产生不同结果的动作。
- 全遮挡且已节流的 Chromium/CEF 窗口会静默吞掉或分钟级延迟窗口路由事件：自动通道点击无效时，可用 `click(channel:"public")`——整段序列（hover/primer/down/up）以带窗口号的 NSEvent 工厂事件经 postToPid 投递，导航、聚焦、按钮全有效。被吞事件可能分钟级后才执行，不要因此盲目重发同一点位；先重新观察再按次决定。
- 目标稳定、后续步骤能用代码判断的循环或批量操作适合 KimiCU 自带 `js`；不按步数强制合并。下一步需要模型读新截图时，先返回观察结果，再写下一段代码。同一窗口的多条笔画可用 `drag_paths`。具体用法见下文。

## JS 与批量操作

### KimiCU 自带 REPL

先确认工具列表包含 **KimiCU MCP 提供的** `js` / `js_reset`。这是随 KimiCU 打包的运行时，不能把同名的其他插件 JS 工具或系统 Node 当作此入口。未提供 JS 时使用普通 MCP 工具；不为简单操作临时搭建运行时。

```js
var { kimiCU } = await import("@kimi/cu");
nodeRepl.write(await kimiCU.list_apps({ running_only: true }));
```

- 顶层变量和函数跨 cell 持久；输出文本/对象需 `nodeRepl.write(value)`，裸表达式不显示。观察产生的图片会作为 image content 返回。
- 方法对应普通工具，但 facade 有独立参数校验和别名；不要假定所有参数完全相同。例如 JS `press_key` 用 `key`，普通工具用 `keys`；窗口可写成 `window:{app,id,title}`，index 可用 `element_index`。未知参数应检查当前接口和版本，不静默删掉有语义的参数继续操作。
- JS 调用失败会抛带 `code` 的异常。用 `try/catch` 输出错误并停止依赖该结果的后续动作；抛异常不代表此前动作已回滚。成功返回也仍须按前文验证实际效果。
- 同一 cell 对同一应用窗口连续读取非空 AX 树时可读 `tree_diff` / `state_diff`；检查 `mode` 和基准信息。首次观察、新窗口、禁用 diff 或纯图片观察不能假定有增量补丁。
- 批量只合并目标已知且稳定的动作，逐个 `await`。新菜单、页面或截图需要模型辨认时，在该观察后结束 cell，不能预写未观察界面的坐标/index。
- `js_reset` 会清空 REPL 变量并重建内核，不会清理 app 草稿、撤销动作或恢复窗口。仅在运行时异常、明确提示或升级后使用。

### drag_paths

用于同一窗口内已规划好的笔画、拖动或短路径；不替代需要逐步观察的导航点击。

- 每批 1–500 条路径，每项为 `{points:[[x,y], ...], steps?, hold_ms?, step_ms?}`。每条至少两个点；dab 可用两个相近点。
- 必须显式传 `window_id`，并使用该窗口最近一次图像观察的像素坐标。当前服务的该路径不消费 `screenshot_id`，不能靠它单独选窗或恢复旧截图锚点。批内不切换窗口/坐标系。
- 传 `abort_if_cursor_in_window:true` 保持用户操作守卫。用户在窗口内移动真实鼠标或按住鼠标时会拒投或中途停止；光标静止在窗口内本身不触发。触发后等待用户停止相关操作，重新观察再继续，不关闭守卫硬投。
- 批量不是事务，已投笔画不回滚。普通工具返回 `results`、`delivered`、`total`，中断时可能带 `cursor_in_window:true`。结合界面核对后，仅处理未完成路径；中途止投可从第一个 false 位置续作，其他失败须逐项检查，不能整批重放。
- 当前 JS 异常只保留错误码和文字，未必包含失败响应的 `results`。无法确定哪些笔画已完成时，先核对画面和错误信息；不能猜测断点或重新提交整个批次。需要程序化读取失败明细时使用普通 `drag_paths` 工具。

## 排障与升级

### 先根据结果分流

- 歧义窗口、坐标越界或旧 index：按前文重新绑定窗口和观察，不重装或抢前台。
- 缺图/黑图：先看 `screenshot_diagnosis`，区分最小化、窗口关闭、其他 Space、锁屏、未渲染和权限问题。需要用户恢复窗口或切回所在桌面时明确说明，不自行切 Space。
- 空 AX 树也可能是自绘或远程渲染控件；有可用截图时可按图操作，不直接认定权限丢失。
- `unknown field` / `KIMI_CU_UNKNOWN_FIELD`：先核对当前入口的 schema；刚升级时优先排查旧 MCP 桥和 JS 内核，不能据此直接断言新功能不存在。

### 服务和权限

KimiCU 的权限由 launchd 后台 Service 持有。`kimi-cu doctor` 检查调用者上下文，不能代替服务权限判断。仅在服务连接或权限故障时使用以下只读 CLI：

```bash
ls /Applications/KimiCU.app/Contents/MacOS/kimi-cu
/Applications/KimiCU.app/Contents/MacOS/kimi-cu service-status
/Applications/KimiCU.app/Contents/MacOS/kimi-cu xpc-ping
```

`xpc-ping` 应报告 `accessibility=true`、`screenRecording=true`；运行时连接还可看 `runtimeSocket` 是否 listening。

- app 不存在：说明需要安装。用户要求安装或已授权时执行官方安装流程：
  ```bash
  curl -fsSL https://cdn.kimi.com/kimi-computer-use/latest/setup_macos.sh | bash
  ```
- 服务未注册：用 `/Applications/KimiCU.app/Contents/MacOS/kimi-cu install` 注册，再检查状态。已经注册但仍不通时保留错误信息继续定位，不反复 install。
- 服务明确报告权限缺失：运行 `/Applications/KimiCU.app/Contents/MacOS/kimi-cu request-permissions --ax --screen`，提示用户在系统设置为 KimiCU 开启缺失权限；系统授权开关由用户操作。完成后检查 `xpc-ping` 并重试观察。

### 升级后的连接

收到新版本提示时转告用户，已有升级授权时可运行 `kimi-cu upgrade`。不要仅因有新版就中断任务或自行升级。

服务升级不会自动替换长寿的 MCP 桥和 NodeRepl 内核。升级后在客户端重连 KimiCU MCP（支持 `/mcp` 的客户端可用该入口）；JS 用户还需 `js_reset`，然后重新 import 和观察。reset 不代替 MCP 重连，也不会清掉应用内容。

CLI 只用于排障/安装维护；日常取图、取坐标和操作仍用 MCP。
