# @lynn123411/dsh-ask-user-grilling

DSH 侧的 grilling 适配层（输送机制）：把 Matt Pocock 的 grilling 流程在 DSH 里的提问环节做成工具级硬约束。本插件只提供 `ask_user_grilling`，不提供任何 plan-mode 工具——共识达成后不自动进入 plan mode，交还用户决定下一步。分工：本插件负责「在 DSH 里怎么问」的工具层；grilling 纪律文案里散文预告 + 表单投递写在工具描述与 matt-* 预设 vendor 的 `skills/grilling/SKILL.md` 里（`matt-ptc` 另含 PTC 投递指引），子代理停轮纪律只写在工具描述里（软纪律、无硬拦）、不进 SKILL（避免诱导模型派遣子代理），preset persona 保持原厂原样不做任何修改。

> ⚠️ **安装约束：本插件是 preset 工具行消费的 Cordis 插件，严禁加入 profile `package.json` 的 `dsh.profile.bundles`**（bundle 层必须在包内声明 `dsh.bundle`，本插件没有，加入会导致启动报错）。只需通过 `pnpm add` / `dsh plugin --profile web add` 进入 dependencies 即可，preset 的工具行会直接从 node_modules 解析本包。

## 特性

- **ask_user_grilling**：本 preset 唯一的提问工具（grilling 轮次与一切其他提问都走它——`tool-ask-user` 行已从三份 preset 删除）。
  - **子代理等齐（软纪律，无硬拦）**：若本轮派了子代理且下轮依赖其结论，优先**结束当前回合**、等全部结算后再问——事实没回就先问只会浪费一轮；子代理运行时提问不再被拒绝；
  - **强制多选**：所有问题一律多选（schema 不提供关闭开关；此行为刻意**不写入工具描述**——模型若知道只能多选，会为避免互斥选项而影响出题质量，见「描述即纪律」）；
  - **补充机制**：每题末尾的补充输入框由 UI 自动渲染、轮末补充题由代码自动追加，两者都不依赖模型也不写入描述（模型自加补充项只会与它们重复）；仅当轮末补充输入非空时才应再开一轮；
  - **题干引导**：要求题干只含问题本身、不重复选项文本（仅模型侧引导，不做硬校验——避免误伤自然提及选项名称的题干）；
  - **描述即纪律**：工具描述保持精简，只承载工具必知项（以 `lib/index.js` 实物为准：唯一提问工具路由、散文预告 + 同一回合一次投递、字段映射与推荐标记、id 规则、勿自加收尾题、子代理等齐软纪律（无硬闸门））；投递协议细节由技能旁注 DSH delivery 承载，不与工具描述重复；停轮纪律不在技能里写，只由本工具描述现教（软纪律，无硬闸门）。
- 轮次收尾不自动进入 plan mode：grilling 达成共识后由用户决定继续方式（直接执行、或需要方案时自行 `/plan on`）。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ask-user-grilling
```

已发布至 npm，供三个 matt 预设（`matt-standard` / `matt-ptc` / `matt-cordis`）使用（preset 的工具行直接消费本包）。

**本地开发**：临时联调可将本目录复制到 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-ask-user-grilling/`（preset 的工具行会直接从 node_modules 解析），但裸拷贝是未注册状态：`pnpm install` / `dsh plugin add|remove` 等任何 profile 同步都会把它当 extraneous 清掉，并导致三份 matt preset 从模式选择里消失（2026-09-08 真实事故，见 `patches/matt-presets-bootstrap/README.md` §四）——“被清重拷”只是重复踩坑。注意：**不要**把它加进 profile `package.json` 的 `dsh.profile.bundles`（bundle 层必须在包内声明 `dsh.bundle`，否则启动报错）。含未发布改点时调完即发版，再用 `pnpm add` 回装为注册版本。
