# @lynn123411/dsh-mattpocock-skills-deck

> 基于 [FeatherHunter/dsh-mattpocock-skills-deck](https://github.com/FeatherHunter/dsh-mattpocock-skills-deck) v1.7.12 的**分叉（fork）**：Matt Pocock 技能套件（[mattpocock/skills](https://github.com/mattpocock/skills)）的 DSH 控制面板（Deck）——把 wayfinder 地图/票务/进度、triage / grilling / handoff 等动作注入 DSH 侧栏。分叉动机：本合集通过 **agent-preset** 分发技能（`presets/matt-*/skills/`，随会话所选 preset 生效），原插件只探测四个标准技能根、看不到 preset 目录里的技能（红条「未检测到核心技能套件」）；本分叉把「识别 preset 技能根 + 按会话生效 preset 门控」做进源码，替代此前 `patches/dsh-mattpocock-skills-deck` 补丁脚本。上游原版说明文档保留在 [docs/README-UPSTREAM.md](./docs/README-UPSTREAM.md)。

## 特性

- **控制面板（Deck）**：右侧 details 列注入地图列表 / 票务详情 / 进度契约 / triage 与 grilling 动作按钮 / handoff 交接，支持 GitHub / GitLab / Markdown 三种 issue 后端（数据链路见上游文档，本分叉未改动交互层）。
- **环境检查链（wf.chain）识别 agent-preset 技能根**（`#preset-skill-roots`）：技能判装在四个标准根（`~/.agents/skills`、`~/.dsh/skills`、项目 `.dsh/skills`、项目 `.agents/skills`）之外，追加本合集 preset 的 `~/.dsh/.agent-presets/<id>/skills/<skill>` 候选（FS 服务与插件只读直读双通道；仍需 `SKILL.md` frontmatter `name` 精确匹配才算已安装）。
- **按会话 preset 门控**（`#preset-session-gating`）：preset 技能只有随**当前会话所选 preset** 分发时才算「已安装」——会话没选 Matt 相关 preset（如内置 `standard`、`ptc-cordis`）时，环境检查如实显示技能未装，不再虚报「环境 10/10」。生效 preset 经 `agentPreset` 会话投影（创建 header 兜底）解析；解析不到会话上下文时回退「枚举全部 preset 目录」的宽松口径（宁绿勿误报）。
- **链缓存按会话隔离**：服务端与客户端的环境检查链缓存键均加入 preset / 会话维度，同一工作区里不同 preset 的会话不互串链结果。
- **不随包捆绑技能（与上游差异）**：移除上游 v1.7.12 新增的 `package/bundled-skills` 及向宿主 `skills` 服务全局注册的兜底 provider——它会让所有会话恒判「技能已装」，与按 preset 分发、按会话门控的模型冲突。
- **完整上游工程链路**：`src/`（真源）→ `node scripts/build.mjs` 双形态产物（dev `client.js`/`host.js` + 发布物 `package/lib/`）、`npm run verify` 40+ 门禁、`npm run test:smoke`；构建末尾自动同步发布物到本机 `~/.dsh/profiles/web/node_modules/@lynn123411/dsh-mattpocock-skills-deck/` 并做 hash 校验。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-mattpocock-skills-deck
```

（DSH Desktop 桌面应用用 `--profile desktop`，自启 web 服务用 `--profile web`；profile 装错不生效，多个入口需分别安装。）

从本仓库源码本地安装 / 联调：

```bash
cd plugins/dsh-mattpocock-skills-deck
npm install --ignore-scripts          # 仅构建期依赖（esbuild 等）
node scripts/build.mjs                # 构建 package/lib/ 并自动同步到 web profile
# 首次本地落位（profile 尚无该目录时 build 会跳过同步，手动补）：
mkdir -p ~/.dsh/profiles/web/node_modules/@lynn123411/dsh-mattpocock-skills-deck
cp -R package/{lib,shared,cordis.patch.yml,package.json,README.md} \
  ~/.dsh/profiles/web/node_modules/@lynn123411/dsh-mattpocock-skills-deck/
# 并在 ~/.dsh/profiles/web/package.json 的 dependencies 与 dsh.profile.bundles 中登记
# "@lynn123411/dsh-mattpocock-skills-deck"（替换旧 "dsh-mattpocock-skills-deck" 条目）后重启 dsh web。
npm run verify && npm run test:smoke  # 改动后回归
```

**使用前提**：本合集的 Matt 技能随 preset 分发——把 `presets/matt-standard`（或 `matt-ptc` / `matt-cordis`）同步到 `~/.dsh/.agent-presets/` 并在新会话选择它，Deck 环境检查才会判技能已装；若把技能装进 `~/.agents/skills` 等标准根（全盘真安装），则任何会话都判已装（与 preset 无关，符合 DSH 官方技能目录语义）。
