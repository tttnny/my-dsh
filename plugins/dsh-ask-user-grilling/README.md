# @lynn123411/dsh-ask-user-grilling

DSH 侧的 grilling 适配层（输送机制）：把 Matt Pocock 的 grilling 流程在 DSH 里的提问环节做成工具级硬约束。**不修改、不包装这组技能的任何文件**——技能按原设计运行，本插件只负责「在 DSH 里怎么问」。

## 特性

- **ask_user_grilling**：grilling 轮次专用提问工具。
  - **子代理闸门**：后台有子代理运行时会拒绝提问，返回「阻塞 + 运行中名单」，等待全部完成后重试；
  - **强制多选**：所有问题一律多选（schema 不提供关闭开关）；
  - **补充机制**：自动为每个问题追加「✍️ 补充」选项，并自动在每轮末尾追加「本轮还有什么要补充或调整的吗？」；
  - **题干硬校验**：题干包含任何选项文本时拒绝执行，列出违规并要求重写。
- **enter_plan_mode**：为当前 agent 激活 DSH 计划模式。grilling 最后一轮答完、用户确认共识后调用，让 agent 写方案供审阅而不是直接开始执行；可通过 `exit_plan_mode` 或 `/plan off` 退出。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

**本地开发（未发布时）**：将本目录复制到 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-ask-user-grilling/` 即可，preset 的工具行会直接从 node_modules 解析。注意：**不要**把它加进 profile `package.json` 的 `dsh.profile.bundles`（bundle 层必须在包内声明 `dsh.bundle`，否则启动报错）；也**不要**在发布前加进 `dependencies`（未发布的包会让 `pnpm install` 拉取失败）。发布后通过 `dsh plugin add` 正规安装即可。

> ⚠️ profile 是 pnpm hoisted 布局：任何 `pnpm install` / `dsh plugin add|remove` 都可能清掉手工同步的副本——重装后需重新同步本目录。
