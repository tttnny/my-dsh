# 插件详情配图（`docs/preview.svg`）

插件页那张图不是插画，是界面。画它之前先把界面渲染出来，照着量出来的数值画；凭印象画出来的东西和真实界面对不上，读者第一眼就能看出来。

## 一、先选材：画效果，不画设置

配图下面是配置卡、组件列表和来源信息。**图里再画一遍这些，就是重复**：读者往下滚一屏看到同样的东西，图就白占了位置。

画插件**生效时**的样子——它让界面多出来、或者改掉了什么：

| 该画 | 不该画 |
| --- | --- |
| 被操作的应用窗口、弹出的菜单、对话里多出来的卡片 | 插件页上的配置卡、设置项、安装状态卡 |
| 翻译后的正文、排版后的标题与表格 | 组件列表、来源信息、版本号 |

选材前先打开插件页看一眼：配图正下方紧接着显示的是什么？和它重复就换一处。

## 二、在只装本插件的 profile 里取界面

插件之间会互相改界面：`dsh-model-submenu` 把「推理等级」换成滑块，`dsh-native-plus` 改正文行高与段距，`dsh-chat-translate` 改助手正文。在开发 profile 里截的图是**那套组合**的样子，不是读者单独装这一个插件时看到的样子。

```sh
dsh --profile prev-<name> --from-default-profile web web --help   # 建一份干净的 web profile
dsh plugin --profile prev-<name> add "link:<my-dsh>/plugins/dsh-<name>"
dsh --profile prev-<name> --port <端口> --no-open                  # 另起实例，别碰 3088 那个
```

端口按包分配，避免两个 agent 抢同一个。

## 三、量、写、画、比

1. **截图**：`DSH_WEB_URL=http://127.0.0.1:<端口> DSH_WEB_AUTH_URL=<启动时打印的带 token 地址> node tools/gui-shot.mjs --eval "<打开目标界面的脚本>" --shot tmp/<pkg>/real.png`。
2. **量**：同一次 `--eval` 里读 `getBoundingClientRect()` 与 `getComputedStyle()`，把每个元素的 x / y / 宽高、字号、行高、圆角、颜色、间距打成 JSON。坐标以父容器为基准记，不要目测。
3. **组件单独渲染**：只属于本插件的组件用 `node tools/ui-preview.mjs --pkg plugins/dsh-<name> --entry src/client/Xxx.tsx --mount Xxx --props tmp/<pkg>/props.mjs --shot tmp/<pkg>/component.png`，它用宿主真实样式表，且不受别的插件影响。
4. **写场景**：在 `tools/preview-svg/examples/<包目录名>.py` 写一份场景脚本（每个包一份，和配图一起进版本库，改图时改它），元素用 `tools/preview-svg/ui.py` 里的助手函数拼，坐标与颜色抄第 2、3 步的读数；`--zh` 出中文场景。
5. **生成**：`python3 tools/preview-svg/examples/<包目录名>.py > tmp/scene.json` 后 `python3 tools/preview-svg/gen.py --scene tmp/scene.json --out plugins/dsh-<name>/docs/preview.svg`。文字在生成时转成路径，不依赖浏览器字体。
6. **比对**：`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --screenshot=tmp/<pkg>/mine.png --window-size=640,300 "file://$PWD/plugins/dsh-<name>/docs/preview.svg"`，再和真实截图裁出的同一区域同尺寸相减（PIL 一行 `ImageChops.difference`），逐行看差异。

比对看什么：位置与尺寸要对齐到 0–1px，剩下的差异应该只落在字形边缘。整行错位、整块偏移都说明坐标抄错了。各包实测平均差 0.9–12（0–255），主要来自字体替换。

## 四、跟着内容走的位置要算，不要写死

中英两版文字长度不同：光标、箭头、标注这类**跟着文字走**的位置，按各自语言的文字宽度算出来，别写死坐标。场景脚本里用同一份字体量宽度（`examples/dsh-kimi-cu.py` 的 `body_width()`），光标才会停在行尾而不是压在字上。

画布放不下时，等比缩放或换取景，**不能出现被裁断的半句话**。半句话比画得简单更糟，读者会当成坏图。

## 五、素材：插件自己的视觉元素从包里取

插件自带的图标、光标、徽标、装饰，从插件包或它包装的应用里取，不要凭印象画。位图素材量出尺寸与颜色后用路径重画，不能嵌进 SVG。

例：KimiCU 的虚拟光标在 `/Applications/KimiCU.app/Contents/Resources/kimi-cu_Overlay.bundle/`，`cursor.png` 是蓝色圆角三角（#56A4FF、白色粗描边），`cursor_halo.png` 是径向光晕。

## 六、字体

`gen.py` 从 `tmp/preview-svg/fonts/` 读 Noto Sans SC 的四份 OTF（SIL OFL）。缺了就下载一次：

```sh
mkdir -p tmp/preview-svg/fonts
for w in Light Regular Medium Bold; do
  curl -sL -o "tmp/preview-svg/fonts/NotoSansSC-$w.otf" \
    "https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-$w.otf"
done
```

Noto 的拉丁字母比 macOS 的 PingFang 宽一点，长串英文用 `condense` 压回去（实测 `0.972` 对 13px 的模型名刚好）。

## 七、画布与文件

- 画布 640×300，`width="640" height="300" viewBox="0 0 640 300"`。
- 自包含：没有 `text`、`foreignObject`、`script`、`style`、动画元素与外部引用；文字全部转成路径。
- 中英各一张，放在 `docs/` 下，与 `DETAIL.md` / `DETAIL.zh.md` 同目录；两份 `DETAIL` 的 alt 写清图里画了什么。
- 尺寸、成对关系与替代文字由 `node tools/assert-detail.mjs` 检查；它查不了「画得像不像」，那一步只能靠比对。

## 八、收尾

- 取图用的临时 profile 删掉（`rm -rf ~/.dsh/profiles/prev-*`），实例 `job_kill` 掉，端口释放。
- 为取图打开的应用窗口关掉，别留在用户桌面上。
- 场景脚本留在 `tools/preview-svg/examples/`，改图时改它，不要手改 SVG。

## 九、常见错法

- **画设置不画效果**：把插件页上的配置卡画进配图，和下方内容重复（kimi-cu 第一版就是这样）。
- **凭印象画**：把进度卡画成白底圆角卡片，实际是蓝点加蓝色标题的裸行。
- **在开发 profile 里截图**：菜单里多出别的插件的滑块或装饰。
- **只拍整页不量数值**：字号差 1px、圆角差 4px，叠在一起就是「不像」。
- **写死跟随文字的位置**：中文版光标在行尾，英文版就压在字上。
- **半截字**：右边被画布裁断的句子。
- **用 `text` 元素**：换台机器字体一换，整张图就散了。
