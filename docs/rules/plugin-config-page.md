# 插件配置页（`plugins.bundle.config`）

插件的配置界面住在**宿主「插件」页**，不在设置页。这份是它的前门：形态、key 约定、注册写法、以及失败长相。

## 为什么是插件页

内核 `dsh-client-ui-plugin-manager` 就是按这个前提写的：官方 README 的原话是「注册了配置页的插件在这里、在它自己的页面上编辑；设置里只保留只读的插件列表」。设置页那个「内置插件」分区只是只读清单与 tab 壳，**不是**插件配置的落点。所以自有插件一律注册到插件页，`settings.section` 一个都不要占。

## 三个配置落点

插件页在 `main` 注册时声明这些子 slot（两个 keyed + 一个 list），选哪个只影响用户点几下：

| slot | kind | key | 位置 |
| --- | --- | --- | --- |
| `plugins.bundle.config` | keyed | 包名 | 配置**直接铺在 bundle 详情页上**（描述与行列表之间），**仅** `view: 'page'` |
| `plugins.row.config` | keyed | `` `${包名}#${行id}` `` | 该 bundle 详情页里那一行多出「配置」按钮，点开是独立一整页 |
| `plugins.item` | list | `id` 自取 | 在「官方」分组里多一张卡片；详情页正文就是该条目 |

**本仓插件一律用 `plugins.bundle.config`**：配置要「不点第二下就能改」，而 `row.config` 必须先展开某一行才够得着。`bundle.config` 的 key 只有一个字段（包名），没有两半要对齐。

**不要用 `row.config`**：本仓每个插件都是「一个包 = 一个 bundle + 自己的浏览器半边」，而 `dsh-client-modules` 按「该 Loader 行解析到的最近 `package.json` 是否声明 `dsh.client`」逐行判定；它的 `exactPackageSpecifier` 判据**拒掉子路径说明符**（`@scope/pkg/sub`），所以 `dsh-antigravity-auth` 那三条 `pkg/search`、`pkg/image`、`pkg/video` 行都拿不到浏览器半边——只有**裸包名那一行**承载它。那一行在插件页里以本包元信息标题出现、下方带出完整包名（`rowText` 先取 `meta.title`，没有才退回模块名），读者看到的就是「插件里还有一行自己」。把配置挂到它上面，等于让读者为了改配置先点开一个只是承载浏览器半边的技术行。`bundle.config` 避开这一步。

`plugins.detail.{actions,badge,section}` 是给**别人**的插件画补充内容的 list slot（渲染时拿 `subject`，无话可说返回 null），不是配置入口。

## key 就是包名

key 是 **bundle 的 npm 包名**（`@lynn123411/dsh-<name>`），一次一个字段。

它与**本插件的 Host 设置命名空间**无关，两者是不同的字面量：命名空间是该 bundle patch 里那一行的 `id`，卡片自己用 `ctx.configForms.get(<命名空间>)`（或 `whileServed([<命名空间>], …)`）读写。**改 key 或改命名空间都要同步全部参与者与测试断言**；key 写歪一个字符的症状是配置**永远不出现且没有任何报错**。

## 注册写法

```js
ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
  name: 'plugins.bundle.config',
  key: BUNDLE_NAME,                 // bundle 的 npm 包名
  locale: NS,                       // 卡片自己的词典命名空间
  inject: () => ({ ... }),          // 本插件要给卡片的面
}, CardComponent))
```

- **必须走 `slots.inject`**：该 slot 由插件页的 `main` 条目声明，只在那个页面挂载时才存在。`inject` 会在声明出现时跑回调、塌缩时自动拆掉注册，所以没装插件页的部署不留痕迹。
- **卡片拿到 `view: 'page'`**。`bundle.config` 只渲染 `page`，**没有 `summary` 分支要处理**（`summary` 是 `plugins.item` 卡片与行兜底描述用的）。不要为它写一段永远不跑的分支。
- **`bundle.config` 不传 `props.form`**：宿主只对 `plugins.item` 与 `plugins.row.config` 注入 owner form（`renderSlot(..., { view: 'page', form })`），`bundle.config` 的调用点没有 `form` 字段。配置一律由卡片自己经 `ctx.configForms.get(<命名空间>)` 取——从 `row.config` 迁过来的卡片若原本读 `props.form`，这里会拿到 `undefined`。
- **页面自己画标题、图标与面包屑**，所以卡片**不要**再画一遍插件名；卡片保留自己的分区、控件与顺序。
- 本插件**有** Host 配置命名空间（导出 `Config` schema）时，用 `ctx.configForms.whileServed([<命名空间>], …)` 把整块包起来：宿主不服务该条目的部署不会铺出一张没有表单的配置卡。本仓 `dsh-chat-translate`、`dsh-llm-agentrouter`、`dsh-antigravity-auth` 都是这个形状。
- 配置全在**别人的**命名空间里、自己没有 `Config` 的插件，注册保持无条件：`dsh-a6api` 的凭据在 `~/.dsh/.credentials.yaml`、模型列表写 `llm-pi-ai` 条目，它没有可 `whileServed` 的自有命名空间。

## 每个插件各持一份接线模块

`plugin-page.ts`（包名常量 + `BUNDLE_CONFIG_SLOT` + `BUNDLE_CONFIG_KEY` + `setupPluginPage`）在被迁移的插件包里各有一份：三个包的 `src/` 版本剔除注释并归一化包名后逐字节相同，只差 `BUNDLE_NAME`；`dsh-llm-agentrouter` 没有 `src/`，同一套逻辑内联在它的 `lib/client.js` 里，且直接用 `BUNDLE_NAME` 当 key、没有另立 `BUNDLE_CONFIG_KEY` 常量。**这份重复是现状，不是设计**：客户端 bundle 是各自独立构建、各由裸包名那一行注册进浏览器侧模块表（见上「不要用 `row.config`」的判定方式），包与包之间没有可共享的运行时模块位置；此前的共享页壳也正是因此只能靠复制同步。注意当前**没有**构建门禁拦住跨插件值导入（`dsh-client-bundle-purity` 只存在于 `dsh-model-submenu` 与 `dsh-ask-user-grilling`），所以这条约束靠约定，不靠工具。

约定：`setupPluginPage` 的**逻辑**必须在这四份里保持同源，改一处就改全部；只有 `BUNDLE_NAME` 与注释可以不同。`dsh-llm-agentrouter` 没有 `src/`，同样的常量与辅助函数内联在它的 `lib/client.js` 里，也要一起改。

## 卡片的脸面

插件页的标题与图标来自包元信息，不是注册项：

- **标题 / 简介**：包内 `locale/<lang>.json` 的 `meta.title` / `meta.description`（本仓写 `en.json` + `zh.json`），缺失时回退 `package.json` 的 `name` / `description`。**必须在 `exports` 里导出** `./locale/en.json` 与 `./locale/zh.json`，否则解析不到、静默退回包名。
- **图标**：`package.json` 的 `icon` 字段，值是**相对该 package.json 的路径**，必须落在同一目录内、且是 SVG / PNG / JPEG / WebP、≤ 256 KiB。图标不受 `exports` 约束（按文件系统解析）。
- 两者都要进 `files`（`assets`、`locale`），否则发布包缺文件。
- **改完 `exports` 要重启 DSH**：Node 对每个包的 `exports` 映射有进程内缓存，热更新只换 bundle 不换映射，新增的 `locale/*.json` 子路径在旧进程里解析不到（图标不走 exports，当场就生效）。

## 静默失败

- key（包名）写歪一个字符 → 配置**永远不出现且无报错**。
- 注册项没走 `slots.inject`、直接在 `apply` 顶层注册 → 插件页未挂载时 `register` 抛「slot not declared」或静默不生效，取决于内核版本。
- `locale/*.json` 没写进 `exports`、或没进 `files` → 标题退回包名、简介退回 `package.json` 的 `description`（本仓多为中文）。
- 漏声明 `dsh.client.inject` 里的插件契约包 → 整条 loader entry 变 failed，宿主日志无异常（见 [client-wiring.md](./client-wiring.md)）。

校验手段：各包的 wiring / smoke 脚本断言注册项的 `name` 与 `key` 字面量；页面层留一次端到端目视（打开插件页 → 进该插件详情页 → 配置卡就在描述之下、行列表之上，且能读写）。
