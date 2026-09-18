# @lynn123411/dsh-ui-deepseek-bg

仿 DeepSeek Harness 官网风格的**背景引擎**插件：极光背景（WebGL2 流体）+ 粒子鲸鱼 + 星座网格 + 鼠标跟随交互，内置「背景特效」设置面板（性能档位 / 特效开关 / GPU 调优）。

> 界面皮肤层（玻璃拟态 / Border Beam / Thinking Orbs / 任务清单 Pulse / 发送按钮微动效）在 `@lynn123411/dsh-ui-beam-orbs` 插件，两插件配合使用还原完整效果。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-ui-deepseek-bg
```

重启后打开 http://127.0.0.1:3080 即可（深色主题显示背景特效；浅色主题为官方原版）。

> 需 DSH ≥ 0.1.0-rc.8，Web profile 已含 `@deepseek-ai/dsh-web-app`。