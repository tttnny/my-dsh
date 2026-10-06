# 设置页侧边导航 order 台账

**本文件是唯一台账**：`settings.section` 的 order 取值只登记在这里。排序规则本身在 [plugin-config-page.md](./plugin-config-page.md)「为什么是插件页」——自有插件已不占这个台账。侧栏项经 `slots.register({ name: "settings.section", id, order, label })` 注册，同层按 `order` 升序排列。

**本仓自有插件不再占任何一行**：插件配置住在宿主「插件」页（见 [plugin-config-page.md](./plugin-config-page.md)），不经 `settings.section`。下表保留历史取值，避免将来重建设置页项时撞值。**页内 tab 不在此列**：挂 `settings.plugins.tab` 的 `order` 是页内顺序，与侧栏无关、取值自由。

## 已占用

| order | 侧栏项 | 归属 | 来源 |
| --- | --- | --- | --- |
| -10 | 账号 | DSH 原生，登录态才出现 | 内核 `settings-account`（仅在 `credential-stored` 时注册） |
| 0 | 通用设置 | DSH 原生 | 内核 `settings-general` |
| 5 | —（第三方主题） | `dsh-cool-theme` | 包内 `lib/client.js` |
| 10 | 模型 | DSH 原生 | 内核 `settings-models` |
| 15 | 插件 | DSH 原生 | 内核 `settings-plugins` |
| 20 | Agent 预设 | DSH 原生 | 内核 `agent-preset` |
| 30 | —（通知中心） | `@lyhalal/dsh-notification-center` | 包内 `lib/client.js` |
| 40 | —（插件市场） | `dshmarket` | 包内 `client/client.js` |
| 100 | 桌面设置 | DSH 原生，Desktop 专属（npm 版无） | 内核注册 |
| 100 | —（侧栏增强） | `dsh-better-sidebar` | 包内 `lib/client.js`，与桌面设置同值 |
| 110 | ——（历史：阅读体验） | **已释放**。原共享页 `reading` 与子 slot `reading.settings.item`，参与者 `dsh-chat-translate`、仓外包 `@lynn123411/dsh-smooth-stream`；两者都已改挂插件页 / 停用 | 页壳 `plugins/dsh-chat-translate/src/client/reading-settings-page.tsx` 已删除 |
| 120 | ——（历史：API中转） | **已释放**。原共享页 `relay` 与子 slot `relay.settings.item`，参与者 `dsh-a6api`、`dsh-llm-agentrouter`、`dsh-antigravity-auth`；三者都已改挂插件页 | 页壳 `plugins/dsh-a6api/src/client/relay-settings-page.js`（+ `.d.ts`）与 `plugins/dsh-llm-agentrouter/lib/client.js` 的共享壳 region 已删除 |
| 130 | ——（历史：侧边栏共享页） | **已释放**。原共享页 `sidebar` 与子 slot `sidebar.settings.item`，仅由 `dsh-mattpocock-skills-deck` 声明；该插件 2026-09-26 已删除，页面与卡片一并消失 | 从未有母本 |
| **140** | **下一个要用 `settings.section` 的自有插件使用** | — | 空位 |

## 自有插件的现状

| 插件 | 配置落点 |
| --- | --- |
| `dsh-a6api` / `dsh-antigravity-auth` / `dsh-chat-translate` | 插件页 `plugins.bundle.config`，key = 包名，见各包 `src/client/**/plugin-page.ts` 的 `BUNDLE_CONFIG_KEY` |
| `dsh-llm-agentrouter` | 同上；本包无 `src/`，key 在包内 `lib/client.js` 的 `BUNDLE_NAME` |
| `dsh-model-submenu` | 无配置界面（接管输入框模型座次） |
| `dsh-grilling-form` | 无配置界面（`tool.call.toolview` 表单行） |
| `dsh-web-auth-url` | 无配置界面，且无客户端半边 |

归档插件不占位，也不再登记：退役见 [release.md](./release.md)「退役（归档）」。
