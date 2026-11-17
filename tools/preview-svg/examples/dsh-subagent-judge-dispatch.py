#!/usr/bin/env python3
"""
场景：dsh-subagent-judge-dispatch 的插件页配图（插件页上的「任务类型」配置卡）。

数值来自真实界面：干净 profile（prev-judge）里只装本插件的实例，gui-shot 在 680×1000
窗口下量出来的 getBoundingClientRect / getComputedStyle，坐标已减去裁切原点 (17, 302)。

  python3 tools/preview-svg/examples/dsh-subagent-judge-dispatch.py --zh > scene-zh.json
  python3 tools/preview-svg/gen.py --scene scene-zh.json --out plugins/dsh-subagent-judge-dispatch/docs/preview.zh.svg
"""
import json
import os
import sys

sys.path.insert(0, "tools/preview-svg")
import gen  # noqa: E402
from ui import line, path, rect, text  # noqa: E402

zh = "--zh" in sys.argv
gen.load_fonts("tmp/preview-svg/fonts")

INK = "#0F1115"
MUTED = "#81858C"
LINK = "#4176E6"
CARD_STROKE = "rgba(0,0,0,0.16)"
ROW_RULE = "#E0E0E0"
BTN_STROKE = "#E0E0E0"

# 卡片与表格的几何：全部来自量出来的值（裁切原点 17, 302）。
CARD = (3, 19.2, 635, 262)
HEAD_RIGHT = 619          # 标题行右缘
TABLE_LEFT = 22
COL_NO, COL_TYPE, COL_MODEL, COL_EFFORT, COL_ACTIONS = 22, 106, 211, 399, 523
ROW_TOPS = [130.2, 174.7, 219.7]
RULE_Y = [None, 174.5, 219.5]
ROW_H = [44.5, 45, 45]


def clip(s, size, weight, max_width):
    """按渲染用的字体宽度把文字截到方框里（输入框会把超出的部分裁掉）。"""
    out = ""
    for char in s:
        if gen.text_width(out + char, size, weight, 1.0) > max_width:
            break
        out += char
    return out


def button(x, y, w, h, label, size=12):
    """宿主的 outline 小按钮：白底、8px 圆角、一圈 1px 的内阴影当边框。"""
    return [
        rect(x, y, w, h, r=8, fill="#FFFFFF"),
        rect(x + 0.5, y + 0.5, w - 1, h - 1, r=7.5, fill="none", stroke=BTN_STROKE, strokeWidth=1),
        text(label, x + 11, y + 16, size, INK),
    ]


def field(x, y, w, h, value, clip_width):
    """宿主的输入框：白底、12px 圆角、1px 描边，文字从内边距 9px 处开始。"""
    return [
        rect(x, y, w, h, r=12, fill="#FFFFFF"),
        rect(x + 0.5, y + 0.5, w - 1, h - 1, r=11.5, fill="none", stroke=CARD_STROKE, strokeWidth=1),
        text(clip(value, 14, 400, clip_width), x + 9, y + 19, 14, INK),
    ]


labels = {
    "title": "任务类型" if zh else "Task types",
    "import": "导入" if zh else "Import",
    "export": "导出" if zh else "Export",
    "add": "加一行" if zh else "Add a row",
    "depends": "依赖官方配置「允许 Agent 为子智能体选择模型」。" if zh else 'Depends on the official setting "Allow agents to choose models for Subagents".',
    "open": "去设置" if zh else "Open",
    "no": "编号" if zh else "No.",
    "type": "任务类型" if zh else "Task type",
    "model": "模型" if zh else "Model",
    "effort": "强度" if zh else "Effort",
    "remove": "删掉" if zh else "Remove",
}

rows = [
    {
        "description": "只改一处小地方：修一个写明的报错，或补一句文案。" if zh
        else "One small fix: a clear error, or a line of copy.",
        "model": "magpie/deepseek/deepseek-flash",
        "effort": "low",
    },
    {
        "description": "跨多个文件的重构：要读懂现有实现再动手，改完还要跑测试。" if zh
        else "A refactor across files: read the current code first, then run the tests.",
        "model": "magpie/group/deepseek-v4.1-flash",
        "effort": "high",
    },
    {
        "description": "查资料、读代码、给结论，不改任何文件。" if zh
        else "Read code and notes, then answer; change no file.",
        "model": "magpie/group/deepseek-v4.1-flash",
        "effort": "low",
    },
]

# 标题行右端的三个按钮：右缘对齐，宽度按文字算（宿主的小按钮是「文字 + 22px 内边距」）。
action_labels = [labels["import"], labels["export"], labels["add"]]
widths = [round(gen.text_width(label, 12, 400, 1.0)) + 22 for label in action_labels]
buttons = []
cursor = HEAD_RIGHT
for label, width in zip(reversed(action_labels), reversed(widths)):
    cursor -= width
    buttons.append((cursor, label))
    cursor -= 8
buttons.reverse()

elements = [
    # 卡片
    rect(*CARD[:2], CARD[2], CARD[3], r=20, fill="#FFFFFF"),
    rect(CARD[0] + 0.5, CARD[1] + 0.5, CARD[2] - 1, CARD[3] - 1, r=19.5, fill="none",
         stroke=CARD_STROKE, strokeWidth=1),
    # 标题行
    text(labels["title"], TABLE_LEFT, 55.2, 14, INK, 500),
]
for x, label in buttons:
    elements.extend(button(x, 36.2, round(gen.text_width(label, 12, 400, 1.0)) + 22, 28, label))
# 依赖官方配置那一行
elements.extend([
    text(labels["depends"], TABLE_LEFT, 89.2, 12, MUTED),
    text(labels["open"], 300 if zh else TABLE_LEFT + round(gen.text_width(labels["depends"], 12, 400, 1.0)) + 4, 89.2, 12, LINK),
    # 表头
    text(labels["no"], COL_NO, 119.2, 12, MUTED),
    text(labels["type"], COL_TYPE, 119.2, 12, MUTED),
    text(labels["model"], COL_MODEL, 119.2, 12, MUTED),
    text(labels["effort"], COL_EFFORT, 119.2, 12, MUTED),
])
# 行
for index, row in enumerate(rows):
    top = ROW_TOPS[index]
    if index > 0:
        elements.append(line(TABLE_LEFT, RULE_Y[index], TABLE_LEFT + 597, RULE_Y[index], ROW_RULE, 1))
    field_top = top + 6
    elements.extend([
        text(str(index + 1), COL_NO, top + 27, 12, MUTED),
        *field(COL_TYPE, field_top, 97, 32, row["description"], 79),
        *field(COL_MODEL, field_top, 180, 32, row["model"], 162),
        *field(COL_EFFORT, field_top, 116, 32, row["effort"], 98),
    ])
    remove_width = round(gen.text_width(labels["remove"], 12, 400, 1.0)) + 22
    elements.extend(button(COL_ACTIONS, field_top + 2, remove_width, 28, labels["remove"]))

scene = {"width": 640, "height": 300, "background": "#FFFFFF", "elements": elements}
scene["source"] = os.path.relpath(__file__)
json.dump(scene, sys.stdout, ensure_ascii=False)
