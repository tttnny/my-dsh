#!/usr/bin/env python3
"""场景：dsh-chat-translate 的插件页配图。

数值全部来自干净 profile prev-chat（只装本插件）里真实界面的 getBoundingClientRect /
getComputedStyle 读数：正文 14px/24px、颜色 #0F1115；过程行「已完成，用时 5秒」
14px、#81858C；行内代码片 12.25px、底色 #FAFAFA、边框 #F0F0F0、圆角 8px。

取景框是真实界面的 (420, 232) 起 697×327 的一块：过程行、两段被译成中文的过程正文、
一段按原文呈现的结论正文、消息底部那一行。697 宽是正文列 680 加两侧留白——按 1:1
画会有一行半句话被 640 画布切掉，所以整幅等比缩到 640×300（见 tmp/team/finish-svg.py）。

  python3 tools/preview-svg/examples/dsh-chat-translate.py > tools/preview-svg/examples/dsh-chat-translate.json
  python3 tools/preview-svg/gen.py --scene tools/preview-svg/examples/dsh-chat-translate.json --out tmp/team/dsh-chat-translate/native.svg
  python3 tmp/team/finish-svg.py tmp/team/dsh-chat-translate/native.svg plugins/dsh-chat-translate/docs/preview.svg 0.918220
"""
import json
import os
import sys

sys.path.insert(0, "tools/preview-svg")
from gen import load_fonts, text_width  # noqa: E402
from ui import circle, line, path, rect, text  # noqa: E402

load_fonts("tmp/preview-svg/fonts")

zh = "--zh" in sys.argv

# 画布原点在真实界面的 (420, 232)
COL = 16.5          # 正文列左缘（视口 436.5）
INK = "#0F1115"
MUTED = "#81858C"
RULE = "#E5E5E5"
CODE_BG = "#FAFAFA"


def fit(s, x, baseline, size, color, weight=400, target=None, anchor="start"):
    """按真实界面的宽度把 Noto 的字宽压回去。"""
    condense = 1.0 if target is None else target / text_width(s, size, weight, 1.0)
    return text(s, x, baseline, size, color, weight, anchor=anchor, condense=condense)


def chip(x, y, w, label):
    """行内代码片：浅灰底 + 等宽文字。"""
    inner = w - 11
    return [
        rect(x, y, w, 21, r=8, fill=CODE_BG, stroke="#F0F0F0", strokeWidth=1),
        fit(label, x + 5.5, y + 13.5, 12.25, INK, target=inner),
    ]


def icon_copy(x, y):
    """消息底部：复制。两个叠起来的圆角方框（实测 16×17 的图标框里各 10×12，线宽 1）。"""
    return [
        rect(x + 4, y + 1, 10, 12, r=2, stroke=MUTED, strokeWidth=1),
        rect(x + 1, y + 4, 10, 12, r=2, fill="#FFFFFF", stroke=MUTED, strokeWidth=1),
    ]


def icon_thumb(x, y, flip=False):
    """消息底部：赞 / 踩。一只手掌加一只拇指，15×15，线宽 1.1。"""
    if flip:
        # 踩：把赞那条路径绕图标中心转 180°，袖口落到右上、拇指朝下。
        return [
            path(f"M{x + 6.25} {y + 9.375} V{y + 11.875} a1.875 1.875 0 0 0 1.875 1.875 l2.5 -5.625 v-6.875 h-7.05 a1.25 1.25 0 0 0 -1.25 1.0625 l-0.8625 5.625 a1.25 1.25 0 0 0 1.25 1.4375 z", stroke=MUTED, strokeWidth=1.1, linejoin="round"),
            path(f"M{x + 10.625} {y + 1.25} H{x + 12.5} a1.25 1.25 0 0 1 1.25 1.25 v4.375 a1.25 1.25 0 0 1 -1.25 1.25 h-1.875", stroke=MUTED, strokeWidth=1.1, linejoin="round"),
        ]
    return [
        path(f"M{x + 8.75} {y + 5.625} V{y + 3.125} a1.875 1.875 0 0 0 -1.875 -1.875 l-2.5 5.625 v6.875 h7.05 a1.25 1.25 0 0 0 1.25 -1.0625 l0.8625 -5.625 a1.25 1.25 0 0 0 -1.25 -1.4375 z", stroke=MUTED, strokeWidth=1.1, linejoin="round"),
        path(f"M{x + 4.375} {y + 13.75} H{x + 2.5} a1.25 1.25 0 0 1 -1.25 -1.25 v-4.375 a1.25 1.25 0 0 1 1.25 -1.25 h1.875", stroke=MUTED, strokeWidth=1.1, linejoin="round"),
    ]


def icon_branch(x, y):
    """消息底部：从这里分叉。三点两线。"""
    return [
        circle(x + 3, y + 2.5, 2.2, stroke=MUTED, strokeWidth=1.2),
        circle(x + 12.5, y + 2.5, 2.2, stroke=MUTED, strokeWidth=1.2),
        circle(x + 3, y + 12.5, 2.2, stroke=MUTED, strokeWidth=1.2),
        path(f"M{x + 3} {y + 4.7} v5.6", stroke=MUTED, strokeWidth=1.2),
        path(f"M{x + 12.5} {y + 4.7} v1.6 a3 3 0 0 1 -3 3 h-4.3", stroke=MUTED, strokeWidth=1.2),
    ]


def icon_database(x, y):
    """消息底部：用量。一个圆柱。"""
    return [
        path(f"M{x + 2} {y + 3} a5.5 2.4 0 1 1 11 0 a5.5 2.4 0 1 1 -11 0", stroke=MUTED, strokeWidth=1.1),
        path(f"M{x + 2} {y + 3} v8 a5.5 2.4 0 0 0 11 0 v-8", stroke=MUTED, strokeWidth=1.1),
        path(f"M{x + 2} {y + 7} a5.5 2.4 0 0 0 11 0", stroke=MUTED, strokeWidth=1.1),
    ]


def chevron_down(x, y):
    """过程行右侧的 14×14 下箭头。"""
    return path(f"M{x} {y} l3.5 3.1 l3.5 -3.1", stroke=MUTED, strokeWidth=1.4, linecap="round", linejoin="round")


# 过程行：已完成，用时 5秒 / Completed in 5s（英文界面里标签宽 105.3，箭头跟着往左）
if zh:
    turn = [
        fit("已完成，用时", COL, 35.5, 14, MUTED),
        fit("5", 104.3, 35.5, 14, MUTED),
        fit("秒", 114.5, 35.5, 14, MUTED),
        chevron_down(136, 28.3),
    ]
else:
    turn = [
        fit("Completed in 5s", COL, 35.5, 14, MUTED, target=105.3),
        chevron_down(129.3, 28.3),
    ]

# 过程正文第一段（已译成中文）
para1 = [fit("我会检查仓库根目录，看看这个项目由哪些文件组成，然后根据文件列表推断它的用途。", COL, 80, 14, INK)]

# 左缘那条「查看原文」气泡不画：它落在光标右边 12px，正好压住正文第一行的开头几个字，
# 读者看到的是被遮住半句的正文。图的重点是「过程步骤已经是中文、结论还是原文」，
# 气泡遮字比不画它更糟。

# 过程正文第二段（已译成中文，两行）
para2 = [
    fit("我列出了仓库根目录，以查看哪些顶层目录和文档定义了这个项目，列表显示 plugin、preset、docs、tools", COL, 116, 14, INK),
    fit("和 skill-lock 产物，以及面向 agent 的说明。", COL, 140, 14, INK),
]

# 结论正文（按原文呈现，四行，带行内代码片）。
# 英文逐词落在真实界面量到的 x 上：Noto 与 SF Pro 的字宽不同，整段只压总宽会让
# 词与词之间累积漂移，逐词对齐后每一行与真实截图的字位都咬得住。
with open("tmp/team/dsh-chat-translate/conclusion-words.json", encoding="utf-8") as handle:
    words = json.load(handle)

conclusion = [
    fit(word["w"], word["x"], word["baseline"], 14, INK, 600 if word["bold"] else 400, target=word["width"])
    for word in words
] + [
    *chip(57.8, 186, 70.8, "plugins/"),
    *chip(160.3, 186, 70.8, "presets/"),
    *chip(397.1, 186, 137, "@lynn123411/dsh-*"),
    *chip(107.6, 234, 48.8, "docs/"),
    *chip(243.9, 234, 56.1, "tools/"),
]

# 消息底部那一行：复制、赞、踩、分叉、用量、时间
footer = [
    *icon_copy(16.5, 276.5),
    *icon_thumb(53, 277.5),
    *icon_thumb(89, 277.5, flip=True),
    *icon_branch(124.5, 276.5),
    *icon_database(170.5, 277.5),
    fit("用量 39.8K tok" if zh else "Usage 39.8K tok", 189.5, 290, 12, MUTED, target=82.8 if zh else 94.7),
    fit("01:22", 288.3 if zh else 300.2, 290, 12, MUTED, target=31.2),
]

scene = {
    "width": 697,
    "height": 327,
    "canvas": [640, 300],
    "background": "#FFFFFF",
    "elements": [
        *turn,
        rect(17, 50, 679, 1, fill=RULE),
        *para1,
        *para2,
        *conclusion,
        *footer,
    ],
}

scene["source"] = os.path.relpath(__file__)
json.dump(scene, sys.stdout, ensure_ascii=False)