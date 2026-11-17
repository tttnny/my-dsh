#!/usr/bin/env python3
"""
场景：KimiCU 正在操作的 TextEdit 窗口 + 虚拟光标。

窗口取自真实截图（1172×976，缩到 620 宽后取顶部 300px），工具栏控件、标尺刻度与正文
位置由截图上逐行扫描得到；虚拟光标取自 KimiCU.app 的 Overlay bundle（cursor.png /
cursor_halo.png）。

  python3 tools/preview-svg/examples/dsh-kimi-cu.py > tmp/scene.json
"""
import json
import sys

sys.path.insert(0, "tools/preview-svg")
from fontTools.ttLib import TTFont  # noqa: E402
from ui import circle, line, path, rect, text  # noqa: E402

# 正文宽度按同一份字体量出来，光标才好停在行尾而不是压在字上
_BODY_FONT = TTFont("tmp/preview-svg/fonts/NotoSansSC-Regular.otf")
_BODY_UPEM = _BODY_FONT["head"].unitsPerEm
_BODY_CMAP = _BODY_FONT.getBestCmap()
_BODY_HMTX = _BODY_FONT["hmtx"]


def body_width(s, size):
    """一段正文的排版宽度。"""
    return sum(_BODY_HMTX[_BODY_CMAP[ord(c)]][0] * size / _BODY_UPEM for c in s)

W, H = 640, 300
OX, OY, S = 10, 8, 0.96875          # 窗口在画布上的位置与缩放
X = lambda v: round(OX + v * S, 2)   # noqa: E731
Y = lambda v: round(OY + v * S, 2)   # noqa: E731
L = lambda v: round(v * S, 2)        # noqa: E731

zh = "--zh" in sys.argv
title = "未命名.rtf — 已编辑" if zh else "Untitled.rtf — Edited"
body = "会议纪要：下周三之前把方案发出去。" if zh else "Meeting notes: send the plan out before Wednesday."
font_name = "苹方-简" if zh else "PingFang SC"
style_name = "常规体" if zh else "Regular"

elements = [
    rect(0, 0, W, H, fill="#E9EBEF"),
    rect(OX, OY, 620, 300, r=10, fill="#FFFFFF", shadow={"dy": 6, "blur": 14, "color": "#0F172A", "opacity": 0.16}),
    line(OX, Y(22), OX + 620, Y(22), "#EDEDEE"),
    # 蓝色工具项
    rect(X(6), Y(7), L(72), L(20), r=10, fill="#6E6BF2"),
    rect(X(28), Y(12), L(26), L(9), r=1.6, fill="#FFFFFF", opacity=0.95),
    rect(X(31), Y(15), L(6), L(3), r=0.8, fill="#6E6BF2"),
    circle(X(50), Y(21), L(2.6), fill="#FFFFFF"),
    text(title, X(110), Y(17), 10.5, "#A6A6AB"),
    # 工具栏
    rect(X(9), Y(28), L(92), L(24), r=6, fill="#EDEDEE"),
    text("B", X(19), Y(45), 11, "#3B3B3F", 600),
    text("I", X(38), Y(45), 11, "#3B3B3F"),
    text("U", X(57), Y(45), 11, "#3B3B3F"),
    text("S", X(76), Y(45), 11, "#3B3B3F"),
    line(X(29), Y(33), X(29), Y(47), "#D8D8DA"),
    line(X(48), Y(33), X(48), Y(47), "#D8D8DA"),
    line(X(67), Y(33), X(67), Y(47), "#D8D8DA"),
    rect(X(108), Y(28), L(21), L(24), r=6, fill="#000000"),
    rect(X(138), Y(28), L(22), L(24), r=6, fill="#FFFFFF", stroke="#E3E3E5"),
    text("S", X(145), Y(45), 11, "#3B3B3F"),
    line(X(141), Y(44), X(157), Y(31), "#E5484D", width=1.4),
    rect(X(163), Y(28), L(85), L(24), r=6, fill="#EDEDEE"),
    text(font_name, X(173), Y(45), 10.5, "#3B3B3F"),
    rect(X(256), Y(28), L(85), L(24), r=6, fill="#EDEDEE"),
    text(style_name, X(266), Y(45), 10.5, "#3B3B3F"),
    rect(X(349), Y(28), L(52), L(24), r=6, fill="#EDEDEE"),
    text("12", X(360), Y(45), 10.5, "#3B3B3F"),
    # 对齐四连
    rect(X(409), Y(28), L(103), L(24), r=6, fill="#EDEDEE"),
    line(X(417), Y(35), X(433), Y(35), "#5B5B60"),
    line(X(417), Y(40), X(433), Y(40), "#5B5B60"),
    line(X(417), Y(45), X(428), Y(45), "#5B5B60"),
    line(X(443), Y(35), X(459), Y(35), "#5B5B60"),
    line(X(446), Y(40), X(456), Y(40), "#5B5B60"),
    line(X(443), Y(45), X(459), Y(45), "#5B5B60"),
    line(X(469), Y(35), X(485), Y(35), "#5B5B60"),
    line(X(472), Y(40), X(482), Y(40), "#5B5B60"),
    line(X(469), Y(45), X(480), Y(45), "#5B5B60"),
    line(X(495), Y(35), X(511), Y(35), "#5B5B60"),
    line(X(498), Y(40), X(508), Y(40), "#5B5B60"),
    line(X(495), Y(45), X(511), Y(45), "#5B5B60"),
    # 列表与行距
    rect(X(519), Y(28), L(48), L(24), r=6, fill="#EDEDEE"),
    line(X(527), Y(35), X(559), Y(35), "#5B5B60"),
    line(X(531), Y(40), X(559), Y(40), "#5B5B60"),
    line(X(527), Y(45), X(559), Y(45), "#5B5B60"),
    rect(X(575), Y(28), L(53), L(24), r=6, fill="#EDEDEE"),
    text("1.0", X(584), Y(45), 10.5, "#3B3B3F"),
    # 标尺
    line(OX, Y(52), OX + 620, Y(52), "#EDEDEE"),
    line(OX, Y(90), OX + 620, Y(90), "#F0F0F1"),
]

# 标尺刻度：每 40px 一个三角，每 8px 一根细刻度，每 40px 一个数字
for index in range(15):
    x = X(7 + index * 40)
    elements.append(path(f"M{x} {Y(56)} l{L(7)} {L(4)} l-{L(7)} {L(4)} Z", fill="#B4B4B8"))
    elements.append(text(str(index * 2), x, Y(80), 8.5, "#8A8A90"))
for index in range(75):
    x = X(7 + index * 8)
    tall = index % 5 == 0
    elements.append(line(x, Y(84 if tall else 86), x, Y(90), "#D6D6DA"))

elements.append(text(body, X(6), Y(122), 12, "#1A1A1C"))

# 虚拟光标：光晕 + 圆角三角 + 白色描边
tip_x, tip_y = X(6) + body_width(body, 12) + 10, Y(112)
elements += [
    circle(tip_x + 16, tip_y + 20, 50, fill="url(#halo)"),
    path(
        f"M{tip_x} {tip_y} L{tip_x + 5} {tip_y + 50} L{tip_x + 16} {tip_y + 39} "
        f"L{tip_x + 27} {tip_y + 58} L{tip_x + 36} {tip_y + 53} L{tip_x + 25} {tip_y + 35} "
        f"L{tip_x + 42} {tip_y + 33} Z",
        fill="#56A4FF", stroke="#FFFFFF", strokeWidth=5.5, linejoin="round",
    ),
]

scene = {
    "width": W,
    "height": H,
    "background": "#E9EBEF",
    "defs": [
        '<radialGradient id="halo">'
        '<stop offset="0" stop-color="#6EACEC" stop-opacity="0.5"/>'
        '<stop offset="0.55" stop-color="#6EACEC" stop-opacity="0.2"/>'
        '<stop offset="1" stop-color="#6EACEC" stop-opacity="0"/>'
        "</radialGradient>"
    ],
    "elements": elements,
}
json.dump(scene, sys.stdout, ensure_ascii=False)
