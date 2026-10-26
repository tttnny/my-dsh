# 插件配置页（`plugins.bundle.config`）

自有插件的配置界面一律注册到宿主「插件」页，**不占设置页**（`settings.section` 一个都不要占）。

## 配置落点

插件页在 `main` 注册时声明这些子 slot（`packages/client/ui-plugin-manager/src/client/index.ts` 的 `children` 表）：

| slot | kind | key | 位置 |
| --- | --- | --- | --- |
| `plugins.bundle.config` | keyed | 包名 | 配置**直接铺在 bundle 详情页上**（描述与行列表之间），**仅** `view: 'page'` |
| `plugins.row.config` | keyed | `` `${包名}#${行id}` `` | 该 bundle 详情页里那一行多出「配置」按钮，点开是独立一整页 |
| `plugins.item` | list | `id` 自取 | 在「官方」分组里多一张卡片；详情页正文就是该条目 |
| `plugins.bundle.activation` | keyed | 包名 | 用户从列表里启用这个 bundle 之后的一段引导（`packageName` + `onDismiss` + `onOpenDetails`） |

**`plugins.item` 被官方设置页占用**（宿主 `packages/client/ui-plugin-manager/src/client/slot-contract.ts` 的 JSDoc：一个宿主平面命名空间配一个官方伴随包），**本仓插件不用它**；要卡片就落 `plugins.bundle.config`。

**本仓插件一律用 `plugins.bundle.config`**：key 只有包名一个字段，配置「不点第二下就能改」；`row.config` 要先展开某一行才够得着，而承载浏览器半边的是裸包名那一行（见 [client-wiring.md](./client-wiring.md)「裸包名那一行才带浏览器半边」）。

`plugins.detail.{actions,badge,section}` 是给**别人**的插件画补充内容的 list slot（渲染时拿 `subject`，无话可说返回 null），不是配置入口。

## key 与命名空间

- key 是 **bundle 的 npm 包名**（`@lynn123411/dsh-<name>`）。
- 它与**本插件的 Host 设置命名空间**是两个不同的字面量：命名空间是该 bundle patch 里那一行的 `id`，卡片自己用 `ctx.configForms.get(<命名空间>)`（或 `whileServed([<命名空间>], …)`）读写。
- **改 key 或改命名空间都要同步全部参与者与测试断言**；key 写歪一个字符的症状是配置**永远不出现且没有任何报错**。

## 注册写法

```js
ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
  name: 'plugins.bundle.config',
  key: BUNDLE_NAME,                 // bundle 的 npm 包名
  locale: NS,                       // 卡片自己的词典命名空间
  inject: () => ({ ... }),          // 本插件要给卡片的面
}, CardComponent))
```

- **必须走 `slots.inject`**：该 slot 由插件页的 `main` 条目声明，只在那个页面挂载时才存在；`inject` 在声明出现时跑回调、塌缩时自动拆掉注册。
- **卡片拿到 `view: 'page'`**，没有 `summary` 分支要写（`summary` 是 `plugins.item` 卡片与行兜底描述用的）。
- **`bundle.config` 不传 `props.form`**（宿主只对 `plugins.item` 与 `plugins.row.config` 注入 owner form）：配置一律由卡片自己经 `ctx.configForms.get(<命名空间>)` 取。
- **页面自己画标题、图标与面包屑**，卡片不要再画一遍插件名；卡片保留自己的分区、控件与顺序。
- 本插件**有** Host 配置命名空间（导出 `Config` schema）时，用 `ctx.configForms.whileServed([<命名空间>], …)` 把注册整块包起来；配置全在**别人的**命名空间里、自己没有 `Config` 的保持无条件注册。

## 每个插件各持一份接线模块

`plugin-page.ts`（`BUNDLE_NAME` + `BUNDLE_CONFIG_SLOT` + `BUNDLE_CONFIG_KEY` + `setupPluginPage`）在两个包内各有一份，是同一套做法的两份拷贝，不是可以互相 import 的共享模块。三件事必须一致，改一处就改全部：

- **包名 key**：`BUNDLE_NAME` 等于本包 `package.json` 的 `name`，`BUNDLE_CONFIG_KEY` 等于它。两份文件的导出面本身就不一样（`plugins/dsh-chat-translate` 那份的 `BUNDLE_NAME` 不导出，`plugins/dsh-subagent-judge-dispatch` 那份导出），所以「从邻居 import 一个符号」这条路走不通。
- **座位常量**：`BUNDLE_CONFIG_SLOT` 一律是 `plugins.bundle.config`，写错就落到不存在的座位上（`register` 当场抛，见「静默失败」）。
- **`setupPluginPage` 的 inject 时机**：先取 `slots.inject(slot, register)` 的返回，不能改成在 `apply` 顶层直接 `register`；`inject` 的回调才是插件页挂载时注册、塌缩时拆除的那一段。

两份文件：

- `plugins/dsh-chat-translate/src/client/settings/plugin-page.ts`
- `plugins/dsh-subagent-judge-dispatch/src/client/settings/plugin-page.ts`

跨插件值导入靠约定拦，构建门禁只有 `dsh-client-bundle-purity` 这一道：客户端 bundle 里任何既不在平台模块表、也不在本包 `dsh.client.external` 里的 `@deepseek-ai/*` 值导入当场构建失败，理由是那样的导入要么内联出第二份运行时实例、要么要一个模块表答不出的说明符。新插件骨架 `tools/new-plugin.mjs` 自带这道闸；本仓 `dsh-chat-translate` 是唯一没有它的包，**别照抄它**。

## 卡片的脸面

- **标题 / 简介**：包内 `locale/<lang>.json` 的 `meta.title` / `meta.description`（本仓写 `en.json` + `zh.json`），缺失回退 `package.json` 的 `name` / `description`。**必须在 `exports` 里导出** `./locale/en.json` 与 `./locale/zh.json`，否则解析不到、静默退回包名。
- **图标**：`package.json` 的 `icon`，值是相对该 `package.json` 的路径，随文件系统解析、不受 `exports` 约束。宿主把图标解码成图片放进 `img`，所以 `currentColor` 在那里恒为黑：写成填色加描边的彩色 SVG（`fill` 与 `stroke` 都给定值，不在外壳上写 `stroke="currentColor"`），每个插件各画一套，不要在插件之间复用同一个形状。
- 两者都要进 `files`（`assets`、`locale`），否则发布包缺文件。
- **改完 `exports` 按 [dev-copy.md](./dev-copy.md)「生效时机」处置**：标题、简介与图标由宿主进程经 Node 的模块解析器读（`packages/boot/app-boot/src/package-meta.ts` 的 `readPluginMeta`，每次调用都重新解析、自身不缓存结果），属于宿主半边那一类改动。判据：插件页上这个 bundle 的标题与简介换成了新词。

## 静默失败

- key（包名）写歪一个字符 → 配置**永远不出现且无报错**。判定面就一条：卡片只在 bundle 的包名出现在**活着的**座位注册里时才渲染——宿主把「有配置」算成 `ledger.bundles.has(pkg.name)`，ledger 从当前的 `plugins.bundle.config` 注册项里取 `key`（宿主 `packages/client/ui-plugin-manager/src/client/config-ledger.ts`），所以 key 差一个字符、大小写不同，或者 `whileServed` 包住后宿主没服务那个命名空间，卡片都直接不画，页面上没有任何提示。
- 注册项没走 `slots.inject`、直接在 `apply` 顶层注册 → 插件页未挂载时 `register` 抛 `slot "plugins.bundle.config" is not declared (a parent entry's children table must declare it)`（宿主 `packages/client/ui-slots/src/index.ts` 的 `register` 第一句），未声明就必抛，没有「静默不生效」这条路。
- `locale/*.json` 没写进 `exports`、或没进 `files` → 标题退回包名、简介退回 `package.json` 的 `description`。
- 漏声明 `dsh.client.inject` 里的插件契约包 → 整条 loader entry 变 failed，宿主日志无异常（见 [client-wiring.md](./client-wiring.md)）。

校验手段：各包的 wiring / smoke 脚本断言注册项的 `name` 与 `key` 字面量；页面层留一次端到端目视（插件页 → 详情页 → 配置卡在描述之下、行列表之上，能读写）。
