# @lynn123411/dsh-a6api 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、配置存储、开发副本与验证。

## 装配形态

装进 profile 一条命令即可，profile 侧不用手写任何补丁：

```bash
dsh plugin --profile web add @lynn123411/dsh-a6api
```

命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条根层行：

```yaml
- insert:
    - id: dsh-a6api
      name: '@lynn123411/dsh-a6api'
```

浏览器半边（`lib/client.js`）由 client-modules 依据 `dsh.client` 声明自动发现。客户端半边声明的服务（`dsh.client.inject`）：`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-plugin-manager`。

## 配置

配置页整体注册进 `plugins.bundle.config`（key 为包名 `@lynn123411/dsh-a6api`），路径是「插件」→ 本插件详情页——四个页面直接铺在描述之下、行列表之上，设置页里不再有任何本插件的入口。做法与约束见仓库 `docs/rules/plugin-config-page.md`。

写入位置按内容分三处：

| 内容 | 落点 |
| --- | --- |
| API Key / 系统访问令牌 / 账号 ID | `~/.dsh/.credentials.yaml`（0600，环境变量优先语义） |
| 模型列表 | 当前 Profile 的 `llm-pi-ai` 条目配置（`llm-pi-ai.providers.a6api`） |
| 所选协议 | 插件子目录 `~/.dsh/dsh-a6api/catalog.json`（一个模型都没启用时 DSH 线路块整块不存在，协议只能存在这里） |

模型列表经 DSH `settings` 服务的 `describe()` 读、`update()` / `mutate()` 写；旧 `~/.dsh/settings.yaml` 由内核一次性导入并改名 `.imported`。写入 `llm-pi-ai` 条目配置时缺省字段自动省略，由 DSH 默认值兜底。

服务端对 `/state` 的合并结果保留 120s 短缓存供轮询复用；「可用模型」页的「刷新列表」按钮带 `force=1`，绕过缓存立即向 A6API 重建最新数据。价格波动胶囊的待处理条数基于 `GET /api/marketplace/price-notices`，每 60s 轻轮询一次，只计不处置。卡片上的混合价胶囊按输出 token 占比固定 0.35% 折算，与官网模型市场的标注方式一致。

## 开发副本

运行副本用 `link:` 连到本仓库目录，改完即生效（细则见仓库 `docs/rules/dev-copy.md`）：

```bash
cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-a6api" --offline
cd <my-dsh 绝对路径>/plugins/dsh-a6api && pnpm install && pnpm build
```

宿主半边要重启 DSH 实例才生效；客户端半边刷新页面即生效，必要时硬刷新一次。

## 验证

```bash
cd plugins/dsh-a6api && pnpm check
```

`check`（链条以 `package.json` 的 `scripts` 为准）串起类型检查、构建、浏览器半边自检与四份服务端行为测试，外加两道德性门禁：

- `scripts/smoke-client.mjs`：装载构建产物 `lib/client.js`，除装配层（本插件在插件页的 bundle 配置注册、侧边栏入口注册，并核对本插件没有注册聊天输入框那一行的入口）外，还渲染配置卡片与侧边栏入口弹窗，核对「基础配置」的字段与保存按钮、侧边栏入口的宽窄形制、弹窗交给 `Modal` 原子的标题与关闭文案与两个尺寸钩子类、插件自己不再装任何 document/window 监听、注入的样式表里旧的侧向定位规则已消失与「配置」胶囊，并看守悬停提示仍走 ui-primitives 的 `Tooltip`——渲染树与 bundle 里都不应再出现插件自造的提示属性。
- `scripts/test-sync-settings.mjs`：配置读写与协议写入。
- `scripts/test-probe-protocol.mjs`：探测请求按协议构造。
- `scripts/test-auth-bootstrap.mjs`：账号 ID 自举。
- `scripts/test-reasoning-source.mjs`：推理档位来源。
- `scripts/assert-lib-untracked.mjs`：`lib/` 不被 git 跟踪。
- `scripts/assert-lib-mirror.mjs`：`lib/types` 与 `src/` 一一对应，陈旧或缺失的声明都判失败。
