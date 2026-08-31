# @lynn123411/dsh-ask-user-grilling

DSH 侧的 grilling 适配层（输送机制）：把 Matt Pocock 的 grilling 流程在 DSH 里的提问环节做成工具级硬约束。**不修改、不包装这组技能的任何文件**——技能按原设计运行，本插件只负责「在 DSH 里怎么问」。

## 特性

- **ask_user_grilling**：grilling 轮次专用提问工具。
  - **子代理闸门**：后台有子代理运行时会拒绝提问，返回「阻塞 + 运行中名单」——agent 应**结束当前回合**，子代理结算通知自动唤醒后再调用，不在回合内反复重试；
  - **强制多选**：所有问题一律多选（schema 不提供关闭开关）；
  - **补充机制**：每题的补充通过内置输入框「输入你的答案」完成，不再单独追加「补充」选项（避免与输入框重复）；仅在每轮末尾追加一道轮级补充问题——单选「无需补充」+ 输入框补充（原先每题的补充复选框 + 轮末「有补充」选项与输入框重复，已移除）；
  - **题干引导**：要求题干只含问题本身、不重复选项文本（仅模型侧引导，不做硬校验——避免误伤自然提及选项名称的题干）。
- **enter_plan_mode**：为当前 agent 激活 DSH 计划模式。grilling 最后一轮答完、用户确认共识后调用，让 agent 写方案供审阅而不是直接开始执行；可通过 `exit_plan_mode` 或 `/plan off` 退出。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

已发布至 npm，配合 `matt-standard` 预设使用（preset 的工具行直接消费本包）。

**本地开发**：将本目录复制到 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-ask-user-grilling/` 即可，preset 的工具行会直接从 node_modules 解析。注意：**不要**把它加进 profile `package.json` 的 `dsh.profile.bundles`（bundle 层必须在包内声明 `dsh.bundle`，否则启动报错）。

> 注意：profile 是 pnpm hoisted 布局：`pnpm install` / `dsh plugin add|remove` 重装后，手工同步的本地副本会被清掉，需重新同步。
