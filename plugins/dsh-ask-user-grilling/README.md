# @lynn123411/dsh-ask-user-grilling

DSH 侧的 grilling 适配层（输送机制）：把 Matt Pocock 的 grilling 流程在 DSH 里的提问环节做成工具级硬约束。本插件只提供 `ask_user_grilling`，不提供任何 plan-mode 工具——共识达成后不自动进入 plan mode，交还用户决定下一步。分工：本插件负责「在 DSH 里怎么问」的工具与报错层；grilling 纪律文案（散文预告 + 表单投递、子代理停轮）写在工具描述与 matt-* 预设 vendor 的 `skills/grilling/SKILL.md` 里（`matt-ptc` 另含 PTC 投递指引），preset persona 保持原厂原样不做任何修改。

## 特性

- **ask_user_grilling**：grilling 轮次专用提问工具。
  - **子代理闸门**：后台有子代理运行时会拒绝提问，返回「阻塞 + 运行中名单」——agent 应**结束当前回合**，子代理结算通知自动唤醒后再调用，不在回合内反复重试；
  - **强制多选**：所有问题一律多选（schema 不提供关闭开关；此行为刻意**不写入工具描述**——模型若知道只能多选，会为避免互斥选项而影响出题质量，见「描述即纪律」）；
  - **补充机制**：每题末尾的补充输入框由 UI 自动渲染、轮末补充题由代码自动追加，两者都不依赖模型也不写入描述（模型自加补充项只会与它们重复）；仅当轮末补充输入非空时才应再开一轮；
  - **题干引导**：要求题干只含问题本身、不重复选项文本（仅模型侧引导，不做硬校验——避免误伤自然提及选项名称的题干）；
  - **描述即纪律**：工具描述保持精简，只承载「grilling 轮次专用（其余用 ask_user_question）、先散文预告同一轮、再以一次调用投递表单、字段映射、勿自加收尾题、子代理运行中返回 blocked」等工具必知项；投递协议细节（散文预告与表单一一对应、PTC 形态）由技能旁注（DSH delivery / Sub-agent rounds）承载，不与工具描述重复。
- 轮次收尾不自动进入 plan mode：grilling 达成共识后由用户决定继续方式（直接执行、或需要方案时自行 `/plan on`）。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

已发布至 npm，配合 `matt-standard` 预设使用（preset 的工具行直接消费本包）。

**本地开发**：将本目录复制到 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-ask-user-grilling/` 即可，preset 的工具行会直接从 node_modules 解析。注意：**不要**把它加进 profile `package.json` 的 `dsh.profile.bundles`（bundle 层必须在包内声明 `dsh.bundle`，否则启动报错）。

> 注意：profile 是 pnpm hoisted 布局：`pnpm install` / `dsh plugin add|remove` 重装后，手工同步的本地副本会被清掉，需重新同步。
