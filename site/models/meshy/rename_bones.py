#!/usr/bin/env python3
"""rename_bones.py — fold Meshy's Blender-style joint names onto the standard
mixamo names our ModelAvatar/BVHPlayer expect, by rewriting node names in the
GLB JSON chunk (joint indices/inverseBindMatrices are untouched; skins bind by
index, so renaming is safe for the mesh. The embedded rest clip's tracks that
referenced the old names silently unbind — we never play it: card native: []).

renames: Spine01→Spine1, Spine02→Spine2, neck→Neck
usage: python3 rename_bones.py in.glb out.glb

2026-09-08 FIX (chunk alignment): the original version wrote the JSON chunk
with chunkLength = raw JSON bytes and placed the 0x20 alignment padding AFTER
the declared chunk — three.js walks chunks strictly sequentially
(header → skip 8+chunkLength), so the BIN chunk header was read 1–3 bytes
early (padding + 'B'), body stayed null, and every GLTF load rejected with
"Cannot read properties of null (reading 'slice')". This silently blanked the
/avatars meshy-frog card since 2026-08-31. Now the padding is part of the
declared chunkLength (and asserted 4-aligned), so the output parses everywhere.
"""

import json, struct, sys

RENAMES = {"Spine01": "Spine1", "Spine02": "Spine2", "neck": "Neck"}

JSON_CHUNK = 0x4E4F534A  # 'JSON'
BIN_CHUNK = 0x004E4942  # 'BIN\0'


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
    jdoc = json.loads(next(c for t, c in chunks if t == JSON_CHUNK).decode())
    changed = 0
    for n in jdoc.get("nodes", []):
        if n.get("name") in RENAMES:
            n["name"] = RENAMES[n["name"]]
            changed += 1
    js = json.dumps(jdoc, separators=(",", ":")).encode()
    pad = (4 - (len(js) % 4)) % 4
    js_padded = (
        js + b" " * pad
    )  # spec: JSON chunk padded with spaces, IN the declared length

    out = bytearray()
    body = bytearray()
    body += (
        struct.pack("<I", len(js_padded)) + struct.pack("<I", JSON_CHUNK) + js_padded
    )
    for t, c in chunks:
        if t == JSON_CHUNK:
            continue
        bpad = (4 - (len(c) % 4)) % 4
        body += (
            struct.pack("<I", len(c) + bpad) + struct.pack("<I", t) + c + b"\x00" * bpad
        )
    assert len(body) % 4 == 0, "chunks must stay 4-aligned"
    out += struct.pack("<III", 0x46546C67, ver, 12 + len(body)) + body
    with open(dst, "wb") as f:
        f.write(bytes(out))
    print(f"{src} -> {dst}: renamed {changed} nodes, {len(data)} -> {len(out)} bytes")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
