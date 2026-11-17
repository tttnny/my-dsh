#!/usr/bin/env python3
"""
参考场景：notify-user 的插件页配图。

数值全部来自真实界面（干净 profile + gui-shot 量出来的 getBoundingClientRect /
getComputedStyle）。换一个插件时照这个结构写，改的是内容与坐标，不是结构。

  python3 tools/preview-svg/examples/notify-user.py > tmp/scene.json
  python3 tools/preview-svg/gen.py --scene tmp/scene.json --out plugins/dsh-notify-user/docs/preview.svg
"""
import json
import sys

sys.path.insert(0, "tools/preview-svg")
from ui import MENU_SHADOW, chevron, circle, hash_icon, info_icon, line, rect, switch, text  # noqa: E402

LEFT = 16          # 对话列左缘
MENU_X, MENU_Y = 328, 78
ROW_H = 34

zh = "--zh" in sys.argv


def group_row(y, label):
    return [*hash_icon(LEFT, y + 4), text(label, LEFT + 22, y + 17, 14, "#81858C")]


def notify_card(y, title, body):
    return [
        circle(LEFT + 8, y + 12, 3.5, fill="#4176E6"),
        text(title, LEFT + 22, y + 17, 14, "#4176E6", 600),
        line(LEFT + 8, y + 26, LEFT + 8, y + 46, "#F0F0F0"),
        text(body, LEFT + 22, y + 41, 13, "#0F1115"),
    ]


def menu(rows):
    elements = [rect(MENU_X, MENU_Y, 296, 144, r=16, fill="#FCFDFE", stroke="#EFEFF2", strokeWidth=0.5, shadow=MENU_SHADOW)]
    for index, row in enumerate(rows):
        top = MENU_Y + 4 + ROW_H * index
        elements.append(text(row["label"], MENU_X + 12, top + 22, 13, "#0F1115"))
        if row.get("value") is not None:
            elements.append(text(row["value"], MENU_X + 266, top + 22, 13, "#81858C", anchor="end", condense=0.972))
            elements.append(chevron(MENU_X + 272, top + 11))
        else:
            elements.extend(info_icon(MENU_X + row["info"] + 10, top + 17))
            elements.extend(switch(MENU_X + 248, top + 7, row["on"]))
    return elements


scene = {
    "width": 640,
    "height": 300,
    "background": "#FFFFFF",
    "elements": [
        *group_row(91, "运行了代码，执行了命令，修改了文件等" if zh else "Ran code, ran commands, and more"),
        *notify_card(127, "已检查 12 个文件" if zh else "Checked 12 files",
                     "三个文件都改完了，接着跑测试。" if zh else "Three files updated, running tests now."),
        *group_row(185, "运行了代码，执行了命令，已写入文件等" if zh else "Ran code, wrote files, and more"),
        *menu([
            {"label": "模型" if zh else "Model", "value": "Deepseek-V4.1-Flash · routing group"},
            {"label": "推理等级" if zh else "Reasoning effort", "value": "Max"},
            {"label": "启用智能体团队协作" if zh else "Enable agent team", "info": 133, "on": False},
            {"label": "主动汇报" if zh else "Progress updates", "info": 68, "on": True},
        ]),
    ],
}

json.dump(scene, sys.stdout, ensure_ascii=False)
