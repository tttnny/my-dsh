"""
插件页配图里反复出现的 DSH 界面零件：文字、矩形、圆、线、路径，以及箭头、信息图标、
开关、# 图标。每个函数返回一个场景元素（dict），直接拼进 gen.py 要的 elements 数组。

数值来自真实界面的 getBoundingClientRect / getComputedStyle，不要凭印象改。
"""


def text(s, x, baseline, size, color, weight=400, anchor="start", condense=1.0):
    return {"type": "text", "text": s, "x": x, "baseline": baseline, "size": size,
            "color": color, "weight": weight, "anchor": anchor, "condense": condense}


def rect(x, y, w, h, r=None, fill="none", stroke=None, strokeWidth=1, shadow=None, opacity=None):
    element = {"type": "rect", "x": x, "y": y, "w": w, "h": h, "fill": fill}
    if r is not None:
        element["r"] = r
    if stroke is not None:
        element["stroke"] = stroke
        element["strokeWidth"] = strokeWidth
    if shadow is not None:
        element["shadow"] = shadow
    if opacity is not None:
        element["opacity"] = opacity
    return element


def circle(cx, cy, r, fill="none", stroke=None, strokeWidth=1, opacity=None):
    element = {"type": "circle", "cx": cx, "cy": cy, "r": r, "fill": fill}
    if stroke is not None:
        element["stroke"] = stroke
        element["strokeWidth"] = strokeWidth
    if opacity is not None:
        element["opacity"] = opacity
    return element


def line(x1, y1, x2, y2, color, width=1, dash=None, linecap=None):
    element = {"type": "line", "x1": x1, "y1": y1, "x2": x2, "y2": y2, "color": color, "width": width}
    if dash is not None:
        element["dash"] = dash
    if linecap is not None:
        element["linecap"] = linecap
    return element


def path(d, stroke=None, strokeWidth=1, fill="none", linecap=None, linejoin=None):
    element = {"type": "path", "d": d, "fill": fill}
    if stroke is not None:
        element["stroke"] = stroke
        element["strokeWidth"] = strokeWidth
    if linecap is not None:
        element["linecap"] = linecap
    if linejoin is not None:
        element["linejoin"] = linejoin
    return element


def chevron(x, y, color="#353638"):
    """12×12 的右向箭头，x/y 是左上角。"""
    return path(f"M{x + 4} {y + 4.5} l4 4 l-4 4", stroke=color, strokeWidth=1.4, linecap="round", linejoin="round")


def info_icon(cx, cy, color="#ADB2B8"):
    """11×11 的信息图标，cx/cy 是圆心。"""
    return [
        circle(cx, cy, 5.2, stroke=color, strokeWidth=1.1),
        circle(cx, cy - 2.6, 0.85, fill=color),
        path(f"M{cx} {cy - 0.4} v3.6", stroke=color, strokeWidth=1.1, linecap="round"),
    ]


def switch(x, y, on, width=36, height=20):
    """开关，x/y 是左上角；开是深色底、拇指靠右。"""
    fill = "#0F1115" if on else "#E0E0E0"
    cx = x + width - 2 - height / 2 if on else x + 2 + height / 2
    return [
        rect(x, y, width, height, r=height / 2, fill=fill),
        circle(cx, y + height / 2, height / 2 - 2, fill="#FFFFFF"),
    ]


def hash_icon(x, y, color="#81858C"):
    """16×16 框里的 # 图标，x/y 是框的左上角。"""
    return [
        path(f"M{x + 6.2} {y + 3.6} L{x + 5.2} {y + 12.4}", stroke=color, strokeWidth=1.3, linecap="round"),
        path(f"M{x + 10.8} {y + 3.6} L{x + 9.8} {y + 12.4}", stroke=color, strokeWidth=1.3, linecap="round"),
        path(f"M{x + 3.8} {y + 6.4} H{x + 12.2}", stroke=color, strokeWidth=1.3, linecap="round"),
        path(f"M{x + 3.4} {y + 9.8} H{x + 11.8}", stroke=color, strokeWidth=1.3, linecap="round"),
    ]


# 菜单面板的投影：实测 rgba(0,0,0,0.04) 0 3px 8px 一类，这里取一个近似的柔和投影。
MENU_SHADOW = {"dy": 3, "blur": 6, "color": "#0F172A", "opacity": 0.08}
