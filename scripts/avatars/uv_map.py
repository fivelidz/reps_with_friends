#!/usr/bin/env python3
"""Map UV usage per mesh in a GLB: which palette grid cells the UVs sample,
with vertex positions so swatches can be tied to body regions."""

import json, struct, sys, collections


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, ver, length = struct.unpack_from("<III", data, 0)
    off = 12
    js = None
    bin_start = None
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off)
        if ctype == 0x4E4F534A:
            js = json.loads(data[off + 8 : off + 8 + clen])
        elif ctype == 0x004E4942:
            bin_start = off + 8
        off += 8 + clen
    return js, data, bin_start


def read_accessor(g, data, bin_start, idx):
    acc = g["accessors"][idx]
    bv = g["bufferViews"][acc["bufferView"]]
    base = bin_start + bv["byteOffset"] + acc.get("byteOffset", 0)
    comp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    n = acc["count"]
    fmt = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}[
        acc["componentType"]
    ]
    sz = struct.calcsize(fmt)
    stride = bv.get("byteStride", comp * sz)
    out = []
    for i in range(n):
        row = data[base + i * stride : base + i * stride + comp * sz]
        vals = struct.unpack("<" + fmt * comp, row)
        out.append(vals)
    return out


def main(path):
    g, data, bin_start = read_glb(path)
    assert g is not None and bin_start is not None, "bad glb"
    print(f"== {path}")
    for mi, mesh in enumerate(g.get("meshes", [])):
        for pi, prim in enumerate(mesh.get("primitives", [])):
            name = mesh.get("name", f"mesh{mi}")
            attrs = prim.get("attributes", {})
            if "TEXCOORD_0" not in attrs:
                continue
            uvs = read_accessor(g, data, bin_start, attrs["TEXCOORD_0"])
            poss = (
                read_accessor(g, data, bin_start, attrs["POSITION"])
                if "POSITION" in attrs
                else None
            )
            # histogram grid cells (16x16 grid); glTF v origin = top-left
            hist = collections.Counter()
            ys_per_cell = collections.defaultdict(list)
            xs_per_cell = collections.defaultdict(list)
            for i, (u, v) in enumerate(uvs):
                cu = min(15, max(0, int(u * 16)))
                cv = min(15, max(0, int(v * 16)))
                hist[(cu, cv)] += 1
                if poss:
                    ys_per_cell[(cu, cv)].append(poss[i][1])
                    xs_per_cell[(cu, cv)].append(poss[i][0])
            print(f"-- {name} prim{pi}: {len(uvs)} verts, {len(hist)} grid cells used")
            # normalise Y range for region naming
            ally = [p[1] for p in poss] if poss else [0]
            ymin, ymax = min(ally), max(ally)
            for (cu, cv), n in hist.most_common(30):
                ys = ys_per_cell[(cu, cv)]
                rel = ((sum(ys) / len(ys)) - ymin) / (ymax - ymin + 1e-9) if poss else 0
                region = "head" if rel > 0.82 else "torso" if rel > 0.45 else "legs"
                print(
                    f"   cell=({cu:2d},{cv:2d}) verts={n:5d}  meanY_rel={rel:.2f} [{region}]"
                )


if __name__ == "__main__":
    main(sys.argv[1])
