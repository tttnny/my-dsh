#!/usr/bin/env python3
"""场景：dsh-grilling-form 的插件页配图。

数值全部来自干净 profile prev-grill（只装本插件）里真实界面的 getBoundingClientRect /
getComputedStyle 读数：题号与题型 14px、#ADB2B8；题干 14px/24px、#0F1115；题目补充说明
13px/20px、#81858C；选项行整行可点，圈 16×16、选中时圈内一个实心点；推荐徽标 11px/17px、
#4176E6 字、#ECF1FC 底、圆角 999px；每题一个自填框，1px #D6D6D6 边框、圆角 12px。

取景框是真实界面的 (420, 296) 起 710×333 的一块：过程行「已完成，用时 2秒」与它下面的
分隔线、题号 / 题型 / 题干那一行、题目补充说明、两个单选选项（第一个带推荐徽标与已选中的圈）、
每题一个自填框。710 宽是正文列 680 加两侧留白——按 1:1 画会有一行半句话被 640 画布切掉；
710×333 这个取景框又刚好停在输入框上沿之前，所以整幅等比缩到 640×300（见 tmp/team/finish-svg.py）。

  python3 tools/preview-svg/examples/dsh-grilling-form.py > tools/preview-svg/examples/dsh-grilling-form.json
  python3 tools/preview-svg/gen.py --scene tools/preview-svg/examples/dsh-grilling-form.json --out tmp/team/dsh-grilling-form/native.svg
  python3 tmp/team/finish-svg.py tmp/team/dsh-grilling-form/native.svg plugins/dsh-grilling-form/docs/preview.svg 0.918220
"""
import json
import os
import sys

sys.path.insert(0, "tools/preview-svg")
from gen import load_fonts, text_width  # noqa: E402
from ui import circle, path, rect, text  # noqa: E402

load_fonts("tmp/preview-svg/fonts")

zh = "--zh" in sys.argv

# 画布原点在真实界面的 (420, 296)
COL = 16.5          # 表单左缘（视口 436.5）
INK = "#0F1115"
DIM = "#ADB2B8"     # 题号与题型
MUTED = "#81858C"   # 补充说明与过程行
RULE = "#E5E5E5"    # 过程行下面的分隔线
BRAND = "#4176E6"
BADGE_BG = "#ECF1FC"
BORDER = "#D6D6D6"
PLACEHOLDER = "#E1E5EE"


def fit(s, x, baseline, size, color, weight=400, target=None):
    """按真实界面的宽度把 Noto 的字宽压回去。"""
    condense = 1.0 if target is None else target / text_width(s, size, weight, 1.0)
    return text(s, x, baseline, size, color, weight, condense=condense)


def radio(cx, cy, checked):
    """16×16 的圈；选中时圈内一个实心点，未选中是浅灰边。"""
    elements = [circle(cx, cy, 7.5, fill="#FFFFFF", stroke=INK if checked else BORDER, strokeWidth=1)]
    if checked:
        elements.append(circle(cx, cy, 3.6, fill=INK))
    return elements


# 过程行：已完成，用时 2秒（表单是这一轮的尾巴，行与它下面的分隔线一起进图）
turn = [
    fit("已完成，用时", COL, 15, 14, MUTED),
    fit("2", 104.3, 15, 14, MUTED),
    fit("秒", 114.5, 15, 14, MUTED),
    path("M136 8.3 l3.5 3.1 l3.5 -3.1", stroke=MUTED, strokeWidth=1.4, linecap="round", linejoin="round"),
]

# 第一题：题号、题型、题干同一行
question = [
    fit("1.", COL, 56, 14, DIM),
    fit("单选" if zh else "Single choice", 40.5, 56, 14, DIM, target=28 if zh else 97.9),
    fit("配图应该画哪一处界面？", 72.5 if zh else 142.4, 56, 14, INK),
]

# 题目补充说明：两行小一号灰字
detail = [
    fit("配图要放进插件说明里，读者第一眼看到的就是它。选哪一处界面，决定了这张图是在讲「插件在对话里长什么样」还", COL, 82.8, 13, MUTED, 300, target=676),
    fit("是「插件怎么配置」。", COL, 102.8, 13, MUTED, 300),
]

# 选项一：已选中，带推荐徽标
option1 = [
    *radio(24.5, 133, True),
    fit("对话里的提问表单", 42.5, 138.2, 14, INK),
    rect(162.5, 124, 38 if zh else 95.9, 19, r=9.5, fill=BADGE_BG),
    fit("推荐" if zh else "Recommended", 170.5, 137.6, 11, BRAND, target=22 if zh else 79.9),
    fit("直接展示插件被用起来时的样子，读者一眼看懂它干什么；但配置项和开关不会出现在图里。", 42.5, 161.8, 13, MUTED, 300, target=533),
]

# 选项二：未选中，说明两行
option2 = [
    *radio(24.5, 199, False),
    fit("插件配置页", 42.5, 204.2, 14, INK),
    fit("能交代所有可调选项，适合给已经决定要用的人看；但看不出插件在对话中的实际效果，对首次接触的人吸引力", 42.5, 227.8, 13, MUTED, 300, target=637),
    fit("弱。", 42.5, 247.8, 13, MUTED, 300),
]

# 每题一个自填框
custom = [
    rect(COL, 269.5, 679, 61, r=12, fill="#FFFFFF", stroke=BORDER, strokeWidth=1),
    fit("选项不够用的话，在这里自己写一段" if zh else "Write your own answer here if the options do not cover it", 24.5, 292.2, 14, PLACEHOLDER),
]

scene = {
    "width": 720,
    "height": 333,
    "canvas": [640, 300],
    "background": "#FFFFFF",
    "elements": [
        *turn,
        rect(17, 30, 679, 1, fill=RULE),
        *question,
        *detail,
        *option1,
        *option2,
        *custom,
    ],
}

scene["source"] = os.path.relpath(__file__)
json.dump(scene, sys.stdout, ensure_ascii=False)