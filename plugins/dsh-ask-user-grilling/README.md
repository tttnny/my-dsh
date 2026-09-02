# @lynn123411/dsh-ask-user-grilling

DSH 侧的 grilling 适配层（输送机制）：把 Matt Pocock 的 grilling 流程在 DSH 里的提问环节做成工具级硬约束。分工：本插件负责「在 DSH 里怎么问」的工具与报错层；grilling 纪律文案（强制走 `ask_user_grilling`、子代理停轮、共识后直入 plan mode）写在 matt-* 预设 vendor 的 `skills/grilling/SKILL.md` 的三段本地适配旁注里（重同步上游技能时需保留），preset persona 保持原厂逐字不做任何修改。

## 特性

- **ask_user_grilling**：grilling 轮次专用提问工具。
  - **子代理闸门**：后台有子代理运行时会拒绝提问，返回「阻塞 + 运行中名单」——agent 应**结束当前回合**，子代理结算通知自动唤醒后再调用，不在回合内反复重试；
  - **强制多选**：所有问题一律多选（schema 不提供关闭开关）；
  - **补充机制**：每题的补充通过内置输入框「输入你的答案」完成，不再单独追加「补充」选项（避免与输入框重复）；仅在每轮末尾追加一道轮级补充问题——单选「无需补充」+ 输入框补充（原先每题的补充复选框 + 轮末「有补充」选项与输入框重复，已移除）；
  - **题干引导**：要求题干只含问题本身、不重复选项文本（仅模型侧引导，不做硬校验——避免误伤自然提及选项名称的题干）；
  - **描述即纪律**：工具描述内置「Qn./Recommended: 格式只是逻辑结构、必须走本工具、散文轮立即重发」与「共识确认后直接调 enter_plan_mode」的指引，不依赖 persona。
- **enter_plan_mode**：为当前 agent 激活 DSH 计划模式。grilling 最后一轮答完、用户确认共识后**直接调用**（不再先问「写方案还是直接执行」；仅当用户明确不要方案时跳过），让 agent 写方案供审阅而不是直接开始执行；可通过 `exit_plan_mode` 或 `/plan off` 退出。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

已发布至 npm，配合 `matt-standard` 预设使用（preset 的工具行直接消费本包）。

**本地开发**：将本目录复制到 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-ask-user-grilling/` 即可，preset 的工具行会直接从 node_modules 解析。注意：**不要**把它加进 profile `package.json` 的 `dsh.profile.bundles`（bundle 层必须在包内声明 `dsh.bundle`，否则启动报错）。

> 注意：profile 是 pnpm hoisted 布局：`pnpm install` / `dsh plugin add|remove` 重装后，手工同步的本地副本会被清掉，需重新同步。
