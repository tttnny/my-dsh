#!/usr/bin/env python3
"""
场景：dsh-native-plus 的插件页配图。

数值全部来自真实界面：干净 profile（prev-native）里一个只装了本插件的实例，
gui-shot 量出来的 getBoundingClientRect / getComputedStyle，坐标已减去裁切原点 (26, 375)。

  python3 tools/preview-svg/examples/dsh-native-plus.py > tools/preview-svg/examples/dsh-native-plus-zh.json
  python3 tools/preview-svg/gen.py --scene tools/preview-svg/examples/dsh-native-plus-zh.json \
      --out plugins/dsh-native-plus/docs/preview.zh.svg
"""
import json
import re
import sys

sys.path.insert(0, "tools/preview-svg")
from ui import line, path, rect, text  # noqa: E402

zh = "--zh" in sys.argv

# 裁切原点：(26, 375)。下面所有坐标都是画布坐标。
LEFT = 6            # 正文列左缘
COL_W = 629

# 颜色：从真实截图上取的像素值。
INK = "#0F1115"
H2 = "#1F47BB"
QUOTE_FILL = "#F4F7FD"
QUOTE_BAR = "#4176E6"
TABLE_HEAD = "#ECF1FC"
CODE_FILL = "#F9FAFB"
CODE_BORDER = "rgba(65,118,230,0.22)"
BANNER_LABEL = "#81858C"
ICON = "#61666B"

NOWRAP = [
    "M2 15H1V1H2V15Z",
    "M12.3535 7.64645C12.5487 7.84171 12.5487 8.15829 12.3535 8.35355L9.85352 10.8535L9.14648 10.1465"
    "L10.793 8.5H3.5V7.5H10.793L9.14648 5.85352L9.85352 5.14648L12.3535 7.64645Z",
    "M15 15H14V1H15V15Z",
]
COPY_RECT = (1.52075, 4.07373, 10.3932, 10.3932, 2)
COPY_PATH = (
    "M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756"
    " 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296"
    "C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905"
    "H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z"
)

TOKEN = re.compile(r"[MLHVCZmlhvcz]|-?\d*\.?\d+")


def transform(d, scale, dx, dy):
    """把 16×16 viewBox 里的绝对路径缩放到目标方框。只认 M/L/H/V/C/Z。"""
    tokens = TOKEN.findall(d)
    out = []
    index = 0
    command = None
    while index < len(tokens):
        token = tokens[index]
        if token.isalpha():
            command = token
            index += 1
            out.append(command)
            continue
        if command in ("M", "L"):
            x, y = float(tokens[index]), float(tokens[index + 1])
            out.append(f"{x * scale + dx:.2f} {y * scale + dy:.2f}")
            index += 2
        elif command == "H":
            out.append(f"{float(tokens[index]) * scale + dx:.2f}")
            index += 1
        elif command == "V":
            out.append(f"{float(tokens[index]) * scale + dy:.2f}")
            index += 1
        elif command == "C":
            values = [float(v) for v in tokens[index:index + 6]]
            out.append(" ".join(
                f"{values[i] * scale + (dx if i % 2 == 0 else dy):.2f}" for i in range(6)
            ))
            index += 6
        elif command == "Z":
            out.append("Z")
            index += 1
        else:
            raise SystemExit("unexpected path command " + str(command))
    return " ".join(out)


def icon_nowrap(x, y):
    scale = 14 / 16
    return [
        path(transform(d, scale, x, y), fill=ICON)
        for d in NOWRAP
    ]


def icon_copy(x, y):
    scale = 14 / 16
    rx, ry, rw, rh, rr = COPY_RECT
    return [
        rect(x + rx * scale, y + ry * scale, rw * scale, rh * scale, r=rr * scale,
             fill="none", stroke=ICON, strokeWidth=scale),
        path(transform(COPY_PATH, scale, x, y), fill=ICON),
    ]


def table_head(y):
    """表头：只有上面两角是圆的，填一层浅蓝。"""
    r = 8
    d = (f"M{LEFT} {y + 43} V{y + r} A{r} {r} 0 0 1 {LEFT + r} {y} "
         f"H{LEFT + COL_W - r} A{r} {r} 0 0 1 {LEFT + COL_W} {y + r} V{y + 43} Z")
    return [path(d, fill=TABLE_HEAD)]


def table_bottom_rule(y):
    """末行的下边框：两端跟着圆角往上收。"""
    r = 8
    d = (f"M{LEFT + 0.5} {y - r} A{r} {r} 0 0 0 {LEFT + r} {y} "
         f"H{LEFT + COL_W - r} A{r} {r} 0 0 0 {LEFT + COL_W - 0.5} {y - r}")
    return [path(d, stroke="rgba(0,0,0,0.1)", strokeWidth=1, fill="none")]


def code_block(y):
    """代码块：填充 + 一圈发丝边框（边框画在块内 0.5px 处，与浏览器的 border 同位）。"""
    return [
        rect(LEFT, y, COL_W, 90, r=12, fill=CODE_FILL),
        rect(LEFT + 0.5, y + 0.5, COL_W - 1, 89, r=11.5, fill="none",
             stroke=CODE_BORDER, strokeWidth=1),
    ]


scene = {
    "width": 640,
    "height": 300,
    "background": "#FFFFFF",
    "elements": [
        # 二级标题
        text("单行代码示例" if zh else "A one-line snippet", LEFT, 27.09, 21, H2, 700),

        # 引用
        rect(LEFT, 47.39, COL_W, 40.5, r=8, fill=QUOTE_FILL),
        rect(LEFT + 7, 55.39, 3, 24.5, r=4, fill=QUOTE_BAR),
        text("一行引用" if zh else "A one-line quote", LEFT + 18, 72.39, 14, INK),

        # 表格
        *table_head(101.89),
        line(LEFT, 144.39, LEFT + COL_W, 144.39, "rgba(0,0,0,0.12)", 1),
        *table_bottom_rule(187.39),
        text("列一" if zh else "Column A", LEFT + 12, 127.89, 13, INK, 600),
        text("列二" if zh else "Column B", LEFT + 314.5 + 12, 127.89, 13, INK, 600),
        text("甲" if zh else "Alpha", LEFT + 12, 170.89, 13, INK),
        text("乙" if zh else "Beta", LEFT + 314.5 + 12, 170.89, 13, INK),

        # 代码块
        *code_block(203.89),
        rect(LEFT + 1, 204.89, COL_W - 2, 43, fill=CODE_FILL),
        line(LEFT + 1, 247.39, LEFT + COL_W - 1, 247.39, CODE_BORDER, 1),
        text("js", LEFT + 23, 230.89, 11, BANNER_LABEL),
        *icon_nowrap(569, 219.89),
        *icon_copy(597, 219.89),
        # 代码行在界面上是等宽字体（SF Mono），这里只有 Noto Sans SC：按浏览器量到的
        # 每一段宽度把 Noto 的宽度压/撑回去，段与段之间才不会裂开。
        text("console", LEFT + 23, 266.89, 11, "#1C7ED6", condense=1.1544),
        text(".log", LEFT + 69.2, 266.89, 11, "#6741D9", condense=1.3864),
        text("(", LEFT + 95.61, 266.89, 11, INK, condense=1.7769),
        text('"ok"', LEFT + 102.22, 266.89, 11, "#2B8A3E", condense=1.1398),
        text(");", LEFT + 128.63, 266.89, 11, INK, condense=1.9469),
    ],
}

json.dump(scene, sys.stdout, ensure_ascii=False)
