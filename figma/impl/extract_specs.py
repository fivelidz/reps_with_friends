#!/usr/bin/env python3
"""F3 spec extractor — dump text/fill/radius/layout specs for given Figma nodes.

Usage: python3 extract_specs.py <node_id> [<node_id> ...]
Reads figma/assets/file.json (full REST dump). Output: indented tree with
every text node (content, font, size, weight, colour), every solid fill,
corner radii, and frame padding — everything F3 needs to rebuild a component
without opening Figma.

Kept in-repo per the preserve-creation-code rule (docs/13 lane F3).
"""

import json, sys

FILE = __file__.rsplit("/", 2)[0] + "/assets/file.json"  # figma/assets/file.json


def color_of(fill):
    if not fill:
        return None
    if fill.get("type") == "SOLID":
        c = fill.get("color", {})
        return "#{:02X}{:02X}{:02X}".format(
            round(c.get("r", 0) * 255),
            round(c.get("g", 0) * 255),
            round(c.get("b", 0) * 255),
        ) + (
            f" @{round(fill.get('opacity', 1) * 100)}%"
            if fill.get("opacity", 1) < 1
            else ""
        )
    return fill.get("type")


def fills_of(node):
    out = []
    for f in node.get("fills") or []:
        c = color_of(f)
        if c:
            out.append(c)
    return out


def strokes_of(node):
    out = []
    for f in node.get("strokes") or []:
        c = color_of(f)
        if c:
            out.append(f"{c} w{node.get('strokeWeight', '?')}")
    return out


def walk(node, depth=0):
    ind = "  " * depth
    t = node.get("type", "?")
    name = node.get("name", "")
    bits = [f"{ind}{t} «{name}»"]
    w = node.get("absoluteBoundingBox") or {}
    if w:
        bits.append(f"[{int(w.get('width', 0))}x{int(w.get('height', 0))}]")
    r = node.get("rectangleCornerRadii") or node.get("cornerRadius")
    if r and r not in (0, [0, 0, 0, 0]):
        bits.append(f"r={r}")
    fl = fills_of(node)
    if fl:
        bits.append(f"fill={fl}")
    st = strokes_of(node)
    if st:
        bits.append(f"stroke={st}")
    if t == "TEXT":
        stl = node.get("style", {})
        bits.append(f"TEXT='{node.get('characters', '')}'")
        bits.append(
            f"  {ind}  font={stl.get('fontFamily')} {stl.get('fontWeight')} {stl.get('fontSize')}px lh={stl.get('lineHeightPx')} ls={stl.get('letterSpacing')} case={stl.get('textCase')} align={stl.get('textAlignHorizontal')}"
        )
        for f in node.get("fills") or []:
            if f.get("type") == "SOLID":
                c = f.get("color", {})
                bits.append(
                    "  {}  color=#{:02X}{:02X}{:02X}{:02X}".format(
                        ind,
                        round(c.get("r", 0) * 255),
                        round(c.get("g", 0) * 255),
                        round(c.get("b", 0) * 255),
                        round((f.get("opacity", 1)) * 255),
                    )
                )
    lay = node.get("layoutMode")
    if lay:
        bits.append(
            f"{ind}  layout={lay} gap={node.get('itemGap')} pad={node.get('paddingTop')},{node.get('paddingRight')},{node.get('paddingBottom')},{node.get('paddingLeft')} align={node.get('primaryAxisAlignItems')}/{node.get('counterAxisAlignItems')}"
        )
    print(" ".join(bits[:7]))
    if t == "TEXT":
        for extra in bits[7:]:
            print(extra)
    for ch in node.get("children", []):
        walk(ch, depth + 1)


def main():
    want = sys.argv[1:]
    data = json.load(open(FILE))
    index = {}

    def index_nodes(n):
        index[n.get("id")] = n
        for c in n.get("children", []):
            index_nodes(c)

    index_nodes(data["document"])
    for nid in want:
        nid = nid.replace("-", ":")
        n = index.get(nid)
        print(f"\n{'=' * 70}\nNODE {nid}\n{'=' * 70}")
        if n:
            walk(n)
        else:
            print("NOT FOUND")


if __name__ == "__main__":
    main()
