#!/usr/bin/env python3
"""rename_bones.py — fold Meshy's Blender-style joint names onto the standard
mixamo names our ModelAvatar/BVHPlayer expect, by rewriting node names in the
GLB JSON chunk (joint indices/inverseBindMatrices are untouched; skins bind by
index, so renaming is safe for the mesh. The embedded rest clip's tracks that
referenced the old names silently unbind — we never play it: card native: []).

renames: Spine01→Spine1, Spine02→Spine2, neck→Neck
usage: python3 rename_bones.py in.glb out.glb
"""

import json, struct, sys

RENAMES = {"Spine01": "Spine1", "Spine02": "Spine2", "neck": "Neck"}


def main(src, dst):
    with open(src, "rb") as f:
        data = f.read()
    magic, ver, total = struct.unpack("<III", data[:12])
    assert magic == 0x46546C67, "not a glb"
    off, chunks = 12, []
    while off < len(data):
        clen, ctype = struct.unpack("<II", data[off : off + 8])
        chunks.append((ctype, data[off + 8 : off + 8 + clen]))
        off += 8 + clen
    jdoc = json.loads(next(c for t, c in chunks if t == 0x4E4F534A).decode())
    changed = 0
    for n in jdoc.get("nodes", []):
        if n.get("name") in RENAMES:
            n["name"] = RENAMES[n["name"]]
            changed += 1
    js = json.dumps(jdoc, separators=(",", ":")).encode()
    out = bytearray()
    body = bytearray()
    body += struct.pack("<I", len(js)) + struct.pack("<I", 0x4E4F534A) + js
    # pad JSON chunk to 4 bytes
    while len(body) % 4:
        body += b" "
    for t, c in chunks:
        if t == 0x4E4F534A:
            continue
        pad = (4 - (len(c) % 4)) % 4
        body += (
            struct.pack("<I", len(c) + pad) + struct.pack("<I", t) + c + b"\x00" * pad
        )
    out += struct.pack("<III", 0x46546C67, ver, 12 + len(body)) + body
    with open(dst, "wb") as f:
        f.write(bytes(out))
    print(f"{src} -> {dst}: renamed {changed} nodes, {len(data)} -> {len(out)} bytes")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
