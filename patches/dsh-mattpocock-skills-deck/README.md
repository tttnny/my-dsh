# patch-dsh-mattpocock-skills-deck

修复第三方插件 `dsh-mattpocock-skills-deck`（[FeatherHunter/dsh-mattpocock-skills-deck](https://github.com/FeatherHunter/dsh-mattpocock-skills-deck)）无法检测 agent-preset 技能套件的本地补丁脚本。

## 症状

插件永久显示红条：

> 未检测到核心技能套件（wayfinder / triage / grilling / grill-me / implement / ask-matt 等）：技能 wayfinder 未安装。安装后才能使用全流程功能。

而技能明明已随 preset 安装（`~/.dsh/.agent-presets/matt-standard/skills/` 下 25 个技能齐全）。

## 根因

插件的技能判装（`probeSkill` → `lightProbeReason`，以及 `predicateRegistry.js` 的 SKILL_PROBE 回退）只探测四个根：

| 根 | 路径 |
| --- | --- |
| 用户标准根 | `~/.agents/skills/<skill>` |
| 用户 DSH 根 | `~/.dsh/skills/<skill>` |
| 项目根 | `<project>/.dsh/skills/<skill>`、`<project>/.agents/skills/<skill>` |

DSH 官方的 `dsh-skill-filesystem` 服务也只扫这四个根。而本合集通过 **agent-preset** 分发技能（`~/.dsh/.agent-presets/<id>/skills/<skill>/SKILL.md`，DSH 的 agent-presets 机制将技能放在 preset 目录内）——不在任何探测根内。注册表通道（`ctx.get('skills')`）同样不收录 preset 技能，于是 `wayfinder` 等 25 项全部判为「未安装」。

## 修复方案

四处幂等补丁（全部只读探测扩展，判装口径不变——仍需 `SKILL.md` frontmatter `name` 精确匹配才算已安装）：

1. **`lib/index.js`**：新增 `directListDirNames`（复用插件既有的 `node:fs/promises` 只读直读纪律，枚举目录名）；
2. **`lib/index.js` `lightProbeReason`**：候选根追加 `~/.dsh/.agent-presets/<id>/skills/<skill>`（枚举全部 preset id；FS 通道与 DIRECT 通道共用候选数组，自动生效）；
3. **`lib/index.js`** 直读通道注释同步；
4. **`lib/tracker/predicateRegistry.js`**：SKILL_PROBE 回退探测（`ctx.skillProbe` 未注入时）同步追加 `.dsh/skills` 与 `.agent-presets` 候选。

## 使用

```bash
# 默认定位 web profile 的插件安装目录
bash patches/dsh-mattpocock-skills-deck/patch-dsh-mattpocock-skills-deck.sh

# 其他安装位置
PLUGIN_DIR=/path/to/node_modules/dsh-mattpocock-skills-deck \
  bash patches/dsh-mattpocock-skills-deck/patch-dsh-mattpocock-skills-deck.sh
```

- 幂等：已打补丁时自动跳过，可重复执行；
- 插件每次升级/重装后需重新执行；
- 完成后重启 dsh web 服务（或刷新页面触发重探测），红条应消失、25 项技能全部变绿。

## 验证

- `node --check` 语法检查通过（脚本内置）；
- 复刻探测逻辑对真实 preset 实测：`~/.dsh/.agent-presets/{matt-cordis,matt-ptc,matt-standard,ptc-cordis}/skills/` 下 25/25 技能名片合法命中。
