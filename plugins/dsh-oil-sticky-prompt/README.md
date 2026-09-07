# @lynn123411/dsh-oil-sticky-prompt

DSH 对话吸顶提示：将最近的用户 Prompt 悬浮固定在对话流顶部，点击平滑回滚至对应消息。

## 特性

- **吸顶提示**：划过顶部的最近一条用户消息固定悬浮在对话流顶部，长上下文回看时不丢失当前问题。
- **点击回滚**：点击吸顶条平滑滚动回对应用户消息，支持 `prefers-reduced-motion` 自动降级。
- **防抖跟随**：滚动 / 缩放 / 流式输出经 rAF 合并刷新，切换置顶行带 FLIP 位移动画，短暂回滚不闪烁。
- **零依赖注入**：纯 DOM 观察插件，无服务硬依赖，随页面立即加载。

## 安装

```bash
dsh plugin --profile web add @lynn123411/dsh-oil-sticky-prompt
```
