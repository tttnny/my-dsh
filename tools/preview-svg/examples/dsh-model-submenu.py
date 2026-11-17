#!/usr/bin/env python3
"""
场景：model-submenu 在输入框上方打开的模型菜单（第一行是弹窗入口，第二行是推理等级滑块）。

数值全部来自真实界面：干净 profile（只装本插件）+ gui-shot 量出来的 getBoundingClientRect /
getComputedStyle。菜单在截图里位于 (770.88, 331)，画布上放在 (172.19, 77)，所以场景坐标 =
真实坐标 - (598.69, 254)。英文版按英文文案重新排版后的那份读数画（菜单宽 307，起点 759.5）。

  python3 tools/preview-svg/examples/dsh-model-submenu.py > tools/preview-svg/examples/dsh-model-submenu.json
  python3 tools/preview-svg/gen.py --scene tools/preview-svg/examples/dsh-model-submenu.json --out plugins/dsh-model-submenu/docs/preview.svg
"""
import json
import sys

sys.path.insert(0, "tools/preview-svg")
from fontTools.ttLib import TTFont  # noqa: E402
from ui import MENU_SHADOW, circle, info_icon, path, rect, switch, text  # noqa: E402

FONTS = {}
for _weight, _name in ((400, "Regular"), (500, "Medium")):
    _font = TTFont(f"tmp/preview-svg/fonts/NotoSansSC-{_name}.otf")
    FONTS[_weight] = (_font["head"].unitsPerEm, _font.getBestCmap(), _font["hmtx"])


def width(s, size, weight=400):
    """一段文字的排版宽度（advance 之和）。"""
    upem, cmap, hmtx = FONTS[weight]
    return sum(hmtx[cmap[ord(c)]][0] for c in s) * size / upem


zh = "--zh" in sys.argv

# 两种语言的读数：菜单宽、左缘、第二行标签宽（滑块跟着标签走）。
GEOMETRY = {
    "zh": {"panel_x": 172.19, "panel_w": 295.63, "label_x": 184.19, "value_x": 216.19,
           "chevron_x": 443.81, "track_x": 242.19, "track_w": 213.63,
           "tick_x": (252.19, 316.72, 381.26, 445.81), "knob_x": 445.81,
           "info_cx": 315.19, "switch_x": 419.81, "trigger_x": 195.06,
           "effort_x": 420.69, "trig_chevron_x": 453.31},
    "en": {"panel_x": 166.5, "panel_w": 307.0, "label_x": 178.5, "value_x": 221.88,
           "chevron_x": 449.5, "track_x": 218.39, "track_w": 243.11,
           "tick_x": (228.39, 302.75, 377.13, 451.5), "knob_x": 451.5,
           "info_cx": 333.98, "switch_x": 425.5, "trigger_x": 192.75,
           "effort_x": 426.38, "trig_chevron_x": 459.0},
}
G = GEOMETRY["zh" if zh else "en"]

LABEL_MODEL = "模型" if zh else "Model"
LABEL_EFFORT = "推理等级" if zh else "Effort"
LABEL_TEAM = "启用智能体团队协作" if zh else "Enable agent teamwork"
MODEL = "Deepseek-V4.1-Flash · routing group"
EFFORT = "Max"

# 基线取自真实截图里墨迹的底边（CJK 墨迹比基线低 1px，带降部的拉丁字母低 3px）
BASE_ROW1, BASE_ROW1_VALUE, BASE_ROW2, BASE_ROW3, BASE_TRIGGER = 103, 102.5, 137, 171, 213

PANEL_Y = 77
TRACK_Y = 124
KNOB_CY = 132


def chevron_right(x, y, color):
    """12×12 框里的右向箭头，x/y 是框的左上角。"""
    return path(f"M{x + 5.5} {y + 3.6} L{x + 7.5} {y + 6} L{x + 5.5} {y + 8.4}",
                stroke=color, strokeWidth=1.3, linecap="round", linejoin="round")


def chevron_down(x, y, color):
    """输入框触发器上的下向箭头，x/y 是箭头的左上角。"""
    return path(f"M{x} {y + 0.6} L{x + 3.5} {y + 3.2} L{x + 7} {y + 0.6}",
                stroke=color, strokeWidth=1.4, linecap="round", linejoin="round")


def slider():
    """轨道、填充、刻度点与旋钮：最高档，填充铺满整条轨道。"""
    elements = [rect(G["track_x"], TRACK_Y, G["track_w"], 16, r=8, fill="rgba(0,0,0,0.12)")]
    elements.append(rect(G["track_x"], TRACK_Y, G["track_w"], 16, r=8, fill="url(#effortFill)"))
    for cx in G["tick_x"]:
        elements.append(circle(cx, KNOB_CY, 2, fill="rgba(0,0,0,0.28)"))
    elements.append(circle(G["knob_x"], KNOB_CY, 10, fill="#FFFFFF", stroke="rgba(0,0,0,0.08)", strokeWidth=0.75))
    return elements


scene = {
    "width": 640,
    "height": 300,
    "background": "#FFFFFF",
    "defs": [
        '<linearGradient id="effortFill" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0" stop-color="#4D93F8"/><stop offset="1" stop-color="#9333EA"/></linearGradient>',
    ],
    "elements": [
        # 菜单面板：16px 圆角、半透明材质、柔和投影
        rect(G["panel_x"], PANEL_Y, G["panel_w"], 110, r=16, fill="#FDFEFE", stroke="#F4F4F5", strokeWidth=0.5, shadow=MENU_SHADOW),
        # 第一行：模型（点它打开跨供应商弹窗）
        text(LABEL_MODEL, G["label_x"], BASE_ROW1, 13, "#0F1115"),
        text(MODEL, G["value_x"], BASE_ROW1_VALUE, 13, "#81858C", condense=0.972),
        chevron_right(G["chevron_x"], 92, "#353638"),
        # 第二行：推理等级滑块（档位文字与箭头已被插件隐藏）
        text(LABEL_EFFORT, G["label_x"], BASE_ROW2, 13, "#0F1115"),
        *slider(),
        # 第三行：宿主自己的智能体团队开关，菜单里原样保留
        text(LABEL_TEAM, G["label_x"], BASE_ROW3, 13, "#0F1115"),
        *info_icon(G["info_cx"], 166, "#ADB2B8"),
        *switch(G["switch_x"], 156, False),
        # 输入框上的模型触发器：当前档位按同一套配色染成紫色
        text(MODEL, G["trigger_x"], BASE_TRIGGER, 13, "#61666B", condense=0.972),
        text(EFFORT, G["effort_x"], BASE_TRIGGER, 13, "#9333EA"),
        chevron_down(G["trig_chevron_x"], 207.11, "#ADB2B8"),
    ],
}

json.dump(scene, sys.stdout, ensure_ascii=False)
