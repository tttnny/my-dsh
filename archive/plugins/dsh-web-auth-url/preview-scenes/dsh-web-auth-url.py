#!/usr/bin/env python3
"""
场景：dsh-web-auth-url 的插件页配图。

画的是对话里展开的 web_gui_login 工具调用行：行头「工具调用 · web_gui_login · {}」、
卡片里的输入 / 输出两段（输出是插件 render 出来的带 token 地址与换 cookie 的两条 curl），
以及模型把地址贴回来的那条回复链接。

数值全部来自干净 profile（prev-auth，只装本插件）里 gui-shot 量出来的
getBoundingClientRect / getComputedStyle / Range.getClientRects，取景原点 (436, 292)。
中英两张只换界面文案与实测坐标，结构一样。

  python3 tools/preview-svg/examples/dsh-web-auth-url.py > tools/preview-svg/examples/dsh-web-auth-url-en.json
  python3 tools/preview-svg/examples/dsh-web-auth-url.py --zh > tools/preview-svg/examples/dsh-web-auth-url-zh.json
  python3 tools/preview-svg/gen.py --scene tools/preview-svg/examples/dsh-web-auth-url-en.json \
      --out plugins/dsh-web-auth-url/docs/preview.svg
  python3 tools/preview-svg/gen.py --scene tools/preview-svg/examples/dsh-web-auth-url-zh.json \
      --out plugins/dsh-web-auth-url/docs/preview.zh.svg
"""
import json
import re
import os
import sys

sys.path.insert(0, "tools/preview-svg")
from ui import circle, path, rect, text  # noqa: E402

from fontTools.ttLib import TTFont  # noqa: E402

ORIGIN_X, ORIGIN_Y = 436.0, 292.0
zh = "--zh" in sys.argv

# 与 gen.py 同一套字体与宽度算法：用来把 Noto 的宽度压/拉到界面实测宽度。
FONTS = {
    400: TTFont("tmp/preview-svg/fonts/NotoSansSC-Regular.otf"),
    500: TTFont("tmp/preview-svg/fonts/NotoSansSC-Medium.otf"),
}


def natural_width(s, size, weight=400):
    font = FONTS[weight]
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    return sum(hmtx[cmap[ord(c)]][0] for c in s) * size / upem


def at(x, y):
    """真实界面坐标 → 画布坐标。"""
    return round(x - ORIGIN_X, 2), round(y - ORIGIN_Y, 2)


def line(s, x0, advances, baseline, size, color, weight=400):
    """逐字按实测 advance 落位：整行压缩会在中段累积几像素的漂移。"""
    elements = []
    x = x0
    for char, advance in zip(s, advances):
        if char != " ":
            elements.append(text(char, *at(x, baseline), size, color, weight=weight,
                                 condense=round(advance / natural_width(char, size, weight), 3)))
        x += advance
    return elements


def mono_line(s, x, baseline, size=11, color="#61666B", advance=6.6):
    """等宽文本：界面里是 SF Mono，每字 6.6px，逐字落在同一格上。"""
    return line(s, x, [advance] * len(s), baseline, size, color)


def icon_path(d, box_x, box_y, box_size, view_box, color, stroke_width):
    """把 16 格 viewBox 的图标路径按实测框缩放平移。"""
    scale = box_size / view_box
    return path(_scale_path(d, box_x - ORIGIN_X, box_y - ORIGIN_Y, scale),
                stroke=color, strokeWidth=round(stroke_width * scale, 3), linecap="butt", linejoin="round")


def _scale_path(d, dx, dy, scale):
    """只处理本图用到的 M/L/C/H/V 绝对命令。"""
    tokens = re.findall(r"[MLCHV]|-?\d*\.?\d+", d)
    out = []
    i = 0
    cx = cy = 0.0
    while i < len(tokens):
        cmd = tokens[i]
        i += 1
        count = {"M": 2, "L": 2, "C": 6, "H": 1, "V": 1}[cmd]
        nums = [float(v) for v in tokens[i:i + count]]
        i += count
        points = []
        if cmd in ("H", "V"):
            if cmd == "H":
                cx = nums[0]
            else:
                cy = nums[0]
            points.append(f"{round(dx + cx * scale, 2)} {round(dy + cy * scale, 2)}")
        else:
            for j in range(0, count, 2):
                cx, cy = nums[j], nums[j + 1]
                points.append(f"{round(dx + cx * scale, 2)} {round(dy + cy * scale, 2)}")
        out.append(cmd + " " + " ".join(points))
    return " ".join(out)


# ── 行头：chevron-up 图标 + 标题 + 分隔点 + 「web_gui_login · {}」────────────────
CHEVRON_UP = "M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10"
SUMMARY = "web_gui_login · {}"
SUMMARY_ADVANCES = [9.73, 7.34, 7.53, 7.13, 7.84, 7.52, 3.14, 7.5, 3.22, 7.59, 7.86, 3.13, 7.51, 3.58,
                    3.78, 3.58, 4.89, 4.91]

if zh:
    title, title_x, title_advances, sep_cx, summary_x = "工具调用", 458.5, [13, 13, 13, 13], 519.5, 528.5
else:
    title, title_x, title_advances, sep_cx, summary_x = (
        "Tool call", 458.5, [6.89, 7.59, 7.61, 3.22, 3.58, 7.19, 7.11, 3.2, 3.23], 517.13, 526.13)

header = [
    icon_path(CHEVRON_UP, 437.5, 299, 14, 16, "#81858C", 1),
    *line(title, title_x, title_advances, 311, 13, "#81858C"),
    circle(*at(sep_cx, 306), 1, fill="#ADB2B8"),
    *line(SUMMARY, summary_x, SUMMARY_ADVANCES, 311, 13, "#81858C"),
]

# ── 卡片：输入 / 分隔线 / 输出，底部一段渐隐到白 ────────────────────────────────
CARD = (440.5, 322, 671, 210.5)
CARD_FADE = (507, 532)  # 实测卡片底部从 #F9FAFB 渐隐到白

if zh:
    in_label, in_label_x, in_adv = "输入", 457.5, [11, 11]
    out_label, out_adv = "输出", [11, 11]
    in_text_x, in_text_adv = 493.5, [6.59, 6.61]
    out_text_x = 493.5
else:
    in_label, in_label_x, in_adv = "IN", 457.5, [6.6, 6.6]
    out_label, out_adv = "OUT", [6.6, 6.6, 6.6]
    in_text_x, in_text_adv = 484.7, [6.6, 6.6]
    out_text_x = 491.31

card = [
    rect(*at(CARD[0] + 0.5, CARD[1] + 0.5), CARD[2] - 1, CARD[3] - 1, r=15.5,
         fill="#F9FAFB", stroke="rgba(0,0,0,0.04)", strokeWidth=1),
    rect(*at(CARD[0], CARD_FADE[0]), CARD[2], CARD_FADE[1] - CARD_FADE[0], fill="url(#cardFade)"),
    *line(in_label, in_label_x, in_adv, 347, 11, "#ADB2B8"),
    *line("{}", in_text_x, in_text_adv, 347, 11, "#61666B"),
    rect(*at(441.5, 363), 669, 1, fill="#E0E1E1"),
    *line(out_label, 457.5, out_adv, 387.5, 11, "#ADB2B8"),
]

# 输出的九行视觉行（Range.getClientRects 逐行量的），字宽 6.6px、行高 16px。
OUT_LINES = [
    "Tokenized URL: http://127.0.0.1:3204/?token=exBAFoJeiEzbLGHObjINo_C1OYq0Uksdyjtowg7SCMQ",
    "Pick a cookie jar path under the project's ./tmp (create the directory if it is missing), ",
    "e.g.:",
    "  JAR=./tmp/dsh-web-cookie.jar",
    "Exchange the token once for the session cookie:",
    '  curl -s -c "$JAR" -o /dev/null "http://127.0.0.1:3204/?',
    'token=exBAFoJeiEzbLGHObjINo_C1OYq0Uksdyjtowg7SCMQ"',
    "Then use the jar instead of the token:",
    '  curl -s -b "$JAR" "$DSH_WEB_URL/"',
]
out_lines = []
for index, out_line in enumerate(OUT_LINES):
    out_lines.extend(mono_line(out_line, out_text_x, 387.5 + 16 * index))

# ── 模型回复：地球图标 + 带 token 的地址链接 ───────────────────────────────────
GLOBE = [
    "M7.99986 14.0887C11.3626 14.0887 14.0886 11.3627 14.0886 7.99998C14.0886 4.63727 11.3626 1.91125 7.99986 1.91125C4.63715 1.91125 1.91113 4.63727 1.91113 7.99998C1.91113 11.3627 4.63715 14.0887 7.99986 14.0887Z",
    "M2.34619 8H13.6538",
    "M7.99976 14.0889C9.23509 14.0889 10.1743 11.3629 10.1743 8.00006C10.1743 4.63739 9.23509 1.91138 7.99976 1.91138",
    "M7.99973 14.0889C6.76445 14.0889 5.8252 11.3629 5.8252 8.00006C5.8252 4.63739 6.76445 1.91138 7.99973 1.91138",
]
LINK_TEXT = "http://127.0.0.1:3204/?token=exBAFoJeiEzbLGHObjINo_C1OYq0Uksdyjtowg7SCMQ"
LINK_ADVANCES = [
    8.28, 5.19, 5.17, 8.56, 4.25, 4.25, 4.29, 6.56, 8.48, 6.46, 3.67, 8.31, 3.67, 8.31, 3.75, 6.57,
    4.18, 8.83, 8.49, 8.92, 9.06, 4.25, 7.24, 5.07, 8.27, 7.34, 7.99, 8.22, 8.86, 7.7, 7.45, 9.22,
    9.56, 7.97, 8.27, 7.61, 7.98, 3.5, 8.31, 7.53, 8.61, 7.57, 10.36, 10.43, 10.72, 8.63, 3.48, 3.85,
    10.35, 7.85, 7.59, 9.99, 6.57, 10.21, 8.04, 8.57, 8.92, 10.28, 7.44, 7.37, 8.63, 7.7, 3.5, 5.08,
    7.97, 10.75, 8.37, 7.99, 8.95, 9.98, 12.24, 10.73,
]

reply = [icon_path(d, 436.5, 549.61, 15.39, 16, "#4176E6", 1.3) for d in GLOBE]
reply.extend(line(LINK_TEXT, 456.89, LINK_ADVANCES, 562.5, 14, "#4176E6", weight=500))

scene = {
    "width": 640,
    "height": 300,
    "background": "#FFFFFF",
    "defs": [
        '<linearGradient id="cardFade" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>'
        '<stop offset="1" stop-color="#FFFFFF" stop-opacity="1"/>'
        "</linearGradient>"
    ],
    "elements": [*header, *card, *out_lines, *reply],
}

scene["source"] = os.path.relpath(__file__)
json.dump(scene, sys.stdout, ensure_ascii=False)
