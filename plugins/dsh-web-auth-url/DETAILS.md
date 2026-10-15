# @lynn123411/dsh-web-auth-url 详情

> 本文档是 [README.md](./README.md) 的补充：装配形态、配置项与验证。

## 装配形态

装进 profile 一条命令即可，profile 侧不用手写任何补丁：

```bash
dsh plugin --profile web add @lynn123411/dsh-web-auth-url
```

命令把包名写进 profile 的 `dependencies` 与 `dsh.profile.bundles`，包内 `cordis.patch.yml` 随之插入一条宿主半边行：

```yaml
- insert:
    - id: dsh-web-auth-url
      name: '@lynn123411/dsh-web-auth-url'
```

本插件没有客户端半边，也没有要覆盖的内核行，所以这一条行只注册宿主本体。

## 配置

| 键 | 取值 | 含义 |
| --- | --- | --- |
| `prompt` | `env`（默认） | 段落里只报变量名 `DSH_WEB_AUTH_URL`，token 不进提示词与转录记录。 |
| `prompt` | `inline` | 把带 token 的地址直接写进段落：地址每次装配即时解析、重启后不过期，但 token 会随请求发给模型服务商并落盘进会话。 |
| `prompt` | `off` | 不贡献提示词段落，只保留托管环境变量。 |

两档带地址的句式共用同一份文案，只有地址那处被替换；`env` 与 `off` 都不让 token 出现在提示词里。

## 开发副本

运行副本用 `link:` 连到本仓库目录，改完即生效（细则见仓库 `docs/rules/dev-copy.md`）：

```bash
cd ~/.dsh/profiles/web && pnpm add "link:<my-dsh 绝对路径>/plugins/dsh-web-auth-url" --offline
```

本插件是手写源码形态（`lib/` 直接发布，没有 `src/` 与 `build`），所以改 `lib/` 之后要重启 DSH 实例：托管环境变量与提示词段落都住在宿主半边，loader 只在启动时装载。

## 验证

```bash
cd plugins/dsh-web-auth-url && pnpm check
```

`check` 就是 `scripts/smoke-host.mjs`。它把两个承重点放在**真实的 0.2.1-alpha.3 内核服务**上，而不是桩件：

- **托管环境变量**：真实 `ctx.shellEnv`（`@deepseek-ai/dsh-shell-env`）的 `collect()` 每次调用都重新执行本插件的 `resolve`，因此 token 轮换后下一次 shell 调用拿到新地址。
- **段落锚点**：真实 `ctx.systemPrompt`（`@deepseek-ai/dsh-system-prompt`）里 `app:web-auth-url` 必须紧跟 `app:web-surface`；锚点漂了本插件算出的 order 会成 `NaN`，真实 `section()` 直接抛错。

文案断言只钉承重的那几件事（两档都带引号的 curl 管道、`env` 档不出现 token、末句要求不再用 token），不钉整句原文。两个内核包是本插件的 devDependencies（与 `engines.dsh` 同版本），`pnpm install` 后离线可跑，不指向任何 DSH 安装副本。文件末尾另有一段守卫反例，证明 cordis 对未声明服务的属性读取真的抛错。
