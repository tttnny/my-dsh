#!/usr/bin/env python3
"""
把一份场景 JSON 画成插件页配图 SVG：矩形、圆、线、路径、文字。

文字在这里被转成路径——插件页的图不能依赖浏览器字体，换台机器字一换整张图就散了。
字体用 Noto Sans SC 的 OTF（SIL OFL），按字重取最接近的一份。

用法：
  python3 tools/preview-svg/gen.py --scene tmp/scene.json --out plugins/dsh-x/docs/preview.svg

场景 JSON：
  {
    "source": "tools/preview-svg/examples/<包目录名>.py",   // 必填：写进 SVG 的来源标记
    "width": 640, "height": 300, "background": "#FFFFFF",
    "defs": ["<filter id=...>...</filter>"],          // 可选，原样放进 <defs>
    "elements": [
      {"type": "rect", "x": 0, "y": 0, "w": 10, "h": 10, "r": 4,
       "fill": "#fff", "stroke": "#eee", "strokeWidth": 0.5,
       "shadow": {"dy": 3, "blur": 6, "color": "#0F172A", "opacity": 0.08}},
      {"type": "circle", "cx": 8, "cy": 8, "r": 3.5, "fill": "#4176E6"},
      {"type": "line", "x1": 0, "y1": 0, "x2": 0, "y2": 10, "color": "#f0f0f0", "width": 1, "dash": [4, 3]},
      {"type": "path", "d": "M0 0 L4 4", "stroke": "#333", "strokeWidth": 1.4, "fill": "none", "linecap": "round"},
      {"type": "text", "text": "模型", "x": 12, "baseline": 22, "size": 13,
       "color": "#0F1115", "weight": 400, "anchor": "start", "condense": 1.0}
    ]
  }

坐标一律是画布像素；baseline 是文字基线的 y。anchor 取 start / middle / end。
condense 是横向压缩比例（默认 1），用来把 Noto 比系统字体宽出来的那一点压回去。

依赖：python3 与 fontTools（pip install fonttools）。字体目录默认 tmp/preview-svg/fonts，
里面要有 NotoSansSC-{Light,Regular,Medium,Bold}.otf，下载命令见 docs/rules/plugin-preview.md。
"""
import argparse
import json
import os
import sys

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

WEIGHTS = [(300, "Light"), (400, "Regular"), (500, "Medium"), (700, "Bold")]

FONTS = {}


def load_fonts(directory):
    """按字重把四份 OTF 读进来；缺哪份就报错退出。"""
    for weight, name in WEIGHTS:
        path = os.path.join(directory, f"NotoSansSC-{name}.otf")
        if not os.path.exists(path):
            sys.exit(f"preview-svg: 缺字体 {path}（下载命令见 docs/rules/plugin-preview.md）")
        font = TTFont(path)
        FONTS[weight] = (font["head"].unitsPerEm, font.getBestCmap(), font.getGlyphSet(), font["hmtx"])


def pick_weight(weight):
    """取最接近的可用字重。"""
    return min(FONTS, key=lambda w: abs(w - weight))


def text_width(text, size, weight, condense):
    upem, cmap, _, hmtx = FONTS[pick_weight(weight)]
    scale = size / upem
    return sum(hmtx[cmap[ord(c)]][0] * scale for c in text) * condense


def text_path(element):
    """把一段文字转成一条 path。"""
    text = element["text"]
    size = element.get("size", 13)
    weight = element.get("weight", 400)
    condense = element.get("condense", 1)
    color = element.get("color", "#0F1115")
    baseline = element["baseline"]
    x = element["x"]
    anchor = element.get("anchor", "start")
    width = text_width(text, size, weight, condense)
    if anchor == "end":
        x -= width
    elif anchor == "middle":
        x -= width / 2
    upem, cmap, glyph_set, hmtx = FONTS[pick_weight(weight)]
    scale = size / upem
    parts = []
    pen_x = x
    for char in text:
        name = cmap.get(ord(char))
        if name is None:
            sys.exit(f"preview-svg: 字体里没有 {char!r}（{element.get('text')!r}）")
        pen = SVGPathPen(glyph_set, ntos=lambda v: f"{v:.2f}")
        glyph_set[name].draw(TransformPen(pen, (scale * condense, 0, 0, -scale, pen_x, baseline)))
        commands = pen.getCommands()
        if commands:
            parts.append(commands)
        pen_x += hmtx[name][0] * scale * condense
    return f'<path d="{" ".join(parts)}" fill="{color}"/>'


def render(element):
    """渲染一个元素。"""
    kind = element["type"]
    if kind == "text":
        return text_path(element)
    if kind == "rect":
        attrs = [f'x="{element["x"]}"', f'y="{element["y"]}"', f'width="{element["w"]}"', f'height="{element["h"]}"']
        if element.get("r") is not None:
            attrs.append(f'rx="{element["r"]}"')
        attrs.append(f'fill="{element.get("fill", "none")}"')
        if element.get("stroke"):
            attrs.append(f'stroke="{element["stroke"]}"')
            attrs.append(f'stroke-width="{element.get("strokeWidth", 1)}"')
        if element.get("opacity") is not None:
            attrs.append(f'opacity="{element["opacity"]}"')
        if element.get("shadow"):
            attrs.append('filter="url(#previewShadow)"')
        return f'<rect {" ".join(attrs)}/>'
    if kind == "circle":
        attrs = [f'cx="{element["cx"]}"', f'cy="{element["cy"]}"', f'r="{element["r"]}"', f'fill="{element.get("fill", "none")}"']
        if element.get("stroke"):
            attrs.append(f'stroke="{element["stroke"]}"')
            attrs.append(f'stroke-width="{element.get("strokeWidth", 1)}"')
        if element.get("opacity") is not None:
            attrs.append(f'opacity="{element["opacity"]}"')
        return f'<circle {" ".join(attrs)}/>'
    if kind == "line":
        attrs = [
            f'x1="{element["x1"]}"', f'y1="{element["y1"]}"',
            f'x2="{element["x2"]}"', f'y2="{element["y2"]}"',
            f'stroke="{element.get("color", "#000")}"', f'stroke-width="{element.get("width", 1)}"',
        ]
        if element.get("dash"):
            attrs.append(f'stroke-dasharray="{" ".join(str(v) for v in element["dash"])}"')
        if element.get("linecap"):
            attrs.append(f'stroke-linecap="{element["linecap"]}"')
        return f'<line {" ".join(attrs)}/>'
    if kind == "path":
        attrs = [f'd="{element["d"]}"', f'fill="{element.get("fill", "none")}"']
        if element.get("stroke"):
            attrs.append(f'stroke="{element["stroke"]}"')
            attrs.append(f'stroke-width="{element.get("strokeWidth", 1)}"')
        if element.get("linecap"):
            attrs.append(f'stroke-linecap="{element["linecap"]}"')
        if element.get("linejoin"):
            attrs.append(f'stroke-linejoin="{element["linejoin"]}"')
        return f'<path {" ".join(attrs)}/>'
    sys.exit(f"preview-svg: 不认识的元素类型 {kind!r}")


def main():
    parser = argparse.ArgumentParser(description="把场景 JSON 画成插件页配图 SVG")
    parser.add_argument("--scene", required=True, help="场景 JSON 路径")
    parser.add_argument("--out", required=True, help="输出 SVG 路径")
    parser.add_argument("--fonts", default=os.path.join("tmp", "preview-svg", "fonts"), help="Noto Sans SC OTF 所在目录")
    args = parser.parse_args()

    load_fonts(args.fonts)
    with open(args.scene, encoding="utf-8") as handle:
        scene = json.load(handle)

    width = scene.get("width", 640)
    height = scene.get("height", 300)
    # 取景框比画布宽时（真实界面按 1:1 量的），整幅等比缩进画布，不能裁字。
    canvas = scene.get("canvas")
    out_width, out_height = (canvas[0], canvas[1]) if canvas else (width, height)
    scale_x, scale_y = out_width / width, out_height / height
    defs = list(scene.get("defs", []))
    if any(element.get("shadow") for element in scene["elements"]):
        shadow = next(element["shadow"] for element in scene["elements"] if element.get("shadow"))
        defs.append(
            '<filter id="previewShadow" x="-20%" y="-20%" width="140%" height="140%">'
            f'<feDropShadow dx="0" dy="{shadow.get("dy", 2)}" stdDeviation="{shadow.get("blur", 4)}" '
            f'flood-color="{shadow.get("color", "#0F172A")}" flood-opacity="{shadow.get("opacity", 0.08)}"/>'
            "</filter>"
        )

    out = []
    # 来源标记：配图只能由场景脚本生成，手改 SVG 会被 tools/assert-detail.mjs 拦下。
    if scene.get("source"):
        out.append(f'<!-- preview-svg: {scene["source"]} -->')
    out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{out_width}" height="{out_height}" viewBox="0 0 {out_width} {out_height}" fill="none">')
    if defs:
        out.append("<defs>" + "".join(defs) + "</defs>")
    if (scale_x, scale_y) != (1, 1):
        out.append(f'<g transform="scale({scale_x:.6f} {scale_y:.6f})">')
    out.append(f'<rect width="{width}" height="{height}" fill="{scene.get("background", "#FFFFFF")}"/>')
    for element in scene["elements"]:
        out.append(render(element))
    if (scale_x, scale_y) != (1, 1):
        out.append("</g>")
    out.append("</svg>")

    os.makedirs(os.path.dirname(os.path.abspath(args.out)) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as handle:
        handle.write("\n".join(out) + "\n")
    print(f"preview-svg: {args.out}")


if __name__ == "__main__":
    main()
