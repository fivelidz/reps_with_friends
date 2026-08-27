#!/usr/bin/env python3
"""Inspect a GLB: JSON chunk summary + extract embedded textures to PNG.
Usage: python3 inspect_glb.py <file.glb> [outdir]"""

import json, struct, sys, os


def main(path, outdir):
    os.makedirs(outdir, exist_ok=True)
    with open(path, "rb") as f:
        data = f.read()
    magic, ver, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a glb"
    off = 12
    json_chunk = None
    bin_start = None
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off)
        body = data[off + 8 : off + 8 + clen]
        if ctype == 0x4E4F534A:  # JSON
            json_chunk = json.loads(body)
        elif ctype == 0x004E4942:  # BIN
            bin_start = off + 8
        off += 8 + clen
    assert json_chunk is not None, "no JSON chunk"
    g = json_chunk
    print(f"== {path} (glb {ver}, {length} bytes)")
    print("--- materials ---")
    for i, m in enumerate(g.get("materials", [])):
        pbr = m.get("pbrMetallicRoughness", {})
        print(
            f"[{i}] {m.get('name', '?')}: alphaMode={m.get('alphaMode', 'OPAQ')} "
            f"doubleSided={m.get('doubleSided', False)} "
            f"baseColorTex={pbr.get('baseColorTexture', {}).get('index')} "
            f"baseColorFactor={pbr.get('baseColorFactor')} "
            f"metallic={pbr.get('metallicFactor')} rough={pbr.get('roughnessFactor')}"
        )
    print("--- images ---")
    for i, im in enumerate(g.get("images", [])):
        print(
            f"[{i}] {im.get('name', '?')} mime={im.get('mimeType')} "
            f"bufferView={im.get('bufferView')}"
        )
        if "bufferView" in im:
            bv = g["bufferViews"][im["bufferView"]]
            raw = data[
                bin_start + bv["byteOffset"] : bin_start
                + bv["byteOffset"]
                + bv["byteLength"]
            ]
            ext = "png" if "png" in im.get("mimeType", "") else "jpg"
            out = os.path.join(outdir, f"{os.path.basename(path)[:-4]}_img{i}.{ext}")
            with open(out, "wb") as w:
                w.write(raw)
            print(f"     -> {out} ({len(raw)} bytes)")
    print("--- meshes ---")
    skins = g.get("skins", [])
    for i, mesh in enumerate(g.get("meshes", [])):
        prims = mesh.get("primitives", [])
        attrs = prims[0].get("attributes", {}) if prims else {}
        idx_count = 0
        if prims and "indices" in prims[0]:
            acc = g["accessors"][prims[0]["indices"]]
            idx_count = acc.get("count", 0)
        print(
            f"[{i}] {mesh.get('name', '?')}: prims={len(prims)} attrs={list(attrs.keys())} "
            f"tris~{idx_count // 3} mat={[p.get('material') for p in prims]}"
        )
    print("--- skins ---")
    for i, s in enumerate(skins):
        print(f"[{i}] {s.get('name', '?')}: joints={len(s.get('joints', []))}")
    print("--- nodes (first 40) ---")
    for i, n in enumerate(g.get("nodes", [])[:40]):
        t = []
        if "mesh" in n:
            t.append(f"mesh={n['mesh']}")
        if "skin" in n:
            t.append(f"skin={n['skin']}")
        if "children" in n:
            t.append(f"children={len(n['children'])}")
        print(f"[{i}] {n.get('name', '?')} {' '.join(t)}")
    print(
        f"total nodes: {len(g.get('nodes', []))}, animations: {len(g.get('animations', []))}"
    )


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "/tmp/glbinspect")
