# 根 README（`README.md`）

骨架的标题与顺序固定，不增删：

```
# my-dsh
> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) 插件 / preset 合集 · Collection of DSH plugins & presets
---
## 🧩 插件（plugins/）
## 🎨 Agent Presets（presets/）
## 📄 许可证
```

- 插件表是 HTML `<table>`，4 列表头固定：`类型 | 插件 | 说明 | 安装`；preset 表是 markdown 三列表 `preset | 说明 | 安装`。台账（判据 7）只查「这一行在不在」与「链接的目录存不存在」，`rowspan` 数与功能域归属要人核对：改完表自己数一遍合并格，别指望提交闸门。
- 两张安装列都写可直接复制的命令（本仓库包的 npm 名）；本地开发副本的路径写法放表下的注里，不占表体。
- 「类型」列 = 功能域，开放集合，**取值以根 `README.md` 插件表的现状为准**：归不进已有域就新开域。同域行相邻并 `rowspan` 合并成一格；「类型」格里域名下方一行 `<i>` 短语交代该域的边界。
- 「说明」列 = `<b>插件中文名</b>` + 一句话概括这个插件或 preset 干什么，一行读完；分条细节只留在各包自己的 `README.md` 与 `DETAILS.md`，不写形态、来源版本与实现取舍。
- **行只登记在 `plugins/`、`presets/` 里在维护的包**：归档只是把目录移到 `archive/plugins/`、`archive/presets/`，该行照删（见 [release.md](./release.md)「退役（归档）」）。新包入库时当场补行、按功能域归位或新开域。
- 许可证段固定一句：本仓库与各包目录**顶层**都不附带许可文书、许可由 `package.json` 的 `license` 字段声明（措辞随 [plugins.md](./plugins.md)「许可」；判据 4 只扫包目录顶层，随包 vendored 的子目录里那份许可文件不在它的检查面内）。
