#!/usr/bin/env python3
"""FK simulator for the orc's rigify skeleton — mirrors three.js math exactly:
  bone.quaternion = rest_quat * Euler(x,y,z,'XYZ')   (three.js setFromEuler XYZ = qx*qy*qz)
  world = parent_world * T * R * S
Plus the ModelAvatar prone container (rotation about origin=feet, then y-lift)
and the scene re-centre (feet to y=0).

Usage: python3 fk_sim.py <orc.glb> [exercise] [p]
Prints joint world positions + objective pose measurements.
"""

import json, struct, sys, math


# ── minimal quat/vec math (x,y,z,w) ─────────────────────────────────────────
def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def qconj(q):
    return (-q[0], -q[1], -q[2], q[3])


def qrot(q, v):
    p = (v[0], v[1], v[2], 0.0)
    r = qmul(qmul(q, p), qconj(q))
    return (r[0], r[1], r[2])


def qnorm(q):
    n = math.sqrt(sum(c * c for c in q))
    return tuple(c / n for c in q)


def euler_xyz(x, y, z):
    """three.js Quaternion.setFromEuler order 'XYZ' — verified formula."""
    c1, s1 = math.cos(x / 2), math.sin(x / 2)
    c2, s2 = math.cos(y / 2), math.sin(y / 2)
    c3, s3 = math.cos(z / 2), math.sin(z / 2)
    return qnorm(
        (
            s1 * c2 * c3 + c1 * s2 * s3,
            c1 * s2 * c3 - s1 * c2 * s3,
            c1 * c2 * s3 + s1 * s2 * c3,
            c1 * c2 * c3 - s1 * s2 * s3,
        )
    )


def vadd(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vmul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vlen(a):
    return math.sqrt(vdot(a, a))


def vnorm(a):
    n = vlen(a)
    return (a[0] / n, a[1] / n, a[2] / n) if n > 1e-12 else (0, 0, 0)


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    off = 12
    js = None
    bs = None
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        if ctype == 0x4E4F534A:
            js = json.loads(data[off + 8 : off + 8 + clen])
        elif ctype == 0x004E4942:
            bs = off + 8
        off += 8 + clen
    assert js is not None and bs is not None
    return js


class Node:
    __slots__ = ("name", "children", "t", "q", "s", "parent", "rest_q", "rest_t")

    def __init__(self, name):
        self.name = name
        self.children = []
        self.t = (0, 0, 0)
        self.q = (0, 0, 0, 1)
        self.s = (1, 1, 1)
        self.parent = None


def build_tree(g):
    nodes = [Node(n.get("name", "")) for n in g["nodes"]]
    for i, n in enumerate(g["nodes"]):
        if "translation" in n:
            nodes[i].t = tuple(n["translation"])
        if "rotation" in n:
            nodes[i].q = qnorm(tuple(n["rotation"]))
        if "scale" in n:
            nodes[i].s = tuple(n["scale"])
        for c in n.get("children", []):
            nodes[c].parent = nodes[i]
            nodes[i].children.append(nodes[c])
    roots = [n for n in nodes if n.parent is None]
    return nodes, roots


def world_chain(node):
    """world position of a node = accumulate parent T (rotations of ancestors applied)."""
    chain = []
    n = node
    while n:
        chain.append(n)
        n = n.parent
    chain.reverse()
    pos = (0, 0, 0)
    q = (0, 0, 0, 1)
    for nd in chain:
        pos = vadd(qrot(q, nd.t), pos)
        q = qmul(q, nd.q)
    return pos, q


# ── pose deltas: (boneName, x, y, z) applied as rest*eulerXYZ ───────────────
def apply_poses(nodes_by_name, deltas):
    for name, (x, y, z) in deltas.items():
        nd = nodes_by_name.get(name)
        if nd is None:
            continue
        nd.q = qmul(nd.rest_q, euler_xyz(x, y, z))


def capture_rest(nodes):
    for nd in nodes:
        nd.rest_q = nd.q
        nd.rest_t = nd.t


# measurements
def measure(P, names):
    out = {}

    def d(a, b):
        return vlen(vsub(P[a], P[b]))

    out["hip_y"] = P["spine"][1]
    out["head_y"] = P["spine.005"][1]
    out["handL_y"] = P["hand.L"][1]
    out["handR_y"] = P["hand.R"][1]
    out["foot_y"] = (P["foot.L"][1] + P["foot.R"][1]) / 2
    out["toe_y"] = (P["toe.L"][1] + P["toe.R"][1]) / 2
    out["knee_y"] = (P["shin.L"][1] + P["shin.R"][1]) / 2
    # limb directions (child - parent)
    out["thigh_dir"] = vnorm(vsub(P["shin.L"], P["thigh.L"]))
    out["shin_dir"] = vnorm(vsub(P["foot.L"], P["shin.L"]))
    out["arm_dir"] = vnorm(vsub(P["forearm.L"], P["upper_arm.L"]))
    out["fore_dir"] = vnorm(vsub(P["hand.L"], P["forearm.L"]))
    out["spine_dir"] = vnorm(vsub(P["spine.003"], P["spine"]))
    out["forward"] = vnorm(vsub(P["toe.L"], P["foot.L"]))  # world forward at rest
    return out


def main(path, exercise="rest", p=0.5):
    g = read_glb(path)
    nodes, roots = build_tree(g)
    capture_rest(nodes)
    by_name = {n.name: n for n in nodes}

    # rest world positions
    def all_pos():
        P = {}
        for nd in nodes:
            if nd.name in BONES:
                pos, _ = world_chain(nd)
                P[nd.name] = pos
        return P

    BONES = [
        "spine",
        "spine.001",
        "spine.002",
        "spine.003",
        "spine.004",
        "spine.005",
        "spine.006",
        "shoulder.L",
        "upper_arm.L",
        "forearm.L",
        "hand.L",
        "shoulder.R",
        "upper_arm.R",
        "forearm.R",
        "hand.R",
        "thigh.L",
        "shin.L",
        "foot.L",
        "toe.L",
        "thigh.R",
        "shin.R",
        "foot.R",
        "toe.R",
    ]
    P0 = all_pos()
    H = P0["spine.006"][1] - min(
        P0["toe.L"][1], P0["toe.R"][1], P0["foot.L"][1], P0["foot.R"][1]
    )
    print(f"rest: figure H≈{H:.3f}  forward={measure(P0, BONES)['forward']}")
    for b in ["spine", "spine.003", "spine.005", "hand.L", "hand.R", "foot.L", "toe.L"]:
        print(f"   {b:12s} {P0[b][0]:+.3f} {P0[b][1]:+.3f} {P0[b][2]:+.3f}")

    if exercise == "rest":
        return

    # ── apply a pose (same structure as poseRigify) ─────────────────────────
    d = 1 if p >= 0.5 else 0  # placeholder; caller passes explicit p and we use down(p)

    def down(p):
        return p * 2 if p < 0.5 else (1 - p) * 2

    def tri(p):
        return 1 - abs(2 * p - 1)

    dd = down(p)
    tt = tri(p)
    D = {}
    hip_drop = 0.0
    if exercise == "squat":
        D = {
            "spine": (-0.2 * dd, 0, 0),
            "spine.001": (-0.12 * dd, 0, 0),
            "thigh.L": (1.2 * dd, 0, -0.1 * dd),
            "thigh.R": (1.2 * dd, 0, 0.1 * dd),
            "shin.L": (-1.85 * dd, 0, 0),
            "shin.R": (-1.85 * dd, 0, 0),
            "foot.L": (0.6 * dd, 0, 0),
            "foot.R": (0.6 * dd, 0, 0),
            "upper_arm.L": (0, 0, -0.5 - 0.3 * dd),
            "upper_arm.R": (0, 0, 0.5 + 0.3 * dd),
            "forearm.L": (-0.4, 0, 0),
            "forearm.R": (-0.4, 0, 0),
        }
        hip_drop = 0.15 * dd
    elif exercise == "pushup":
        D = {
            "upper_arm.L": (0, 0, -1.4),
            "upper_arm.R": (0, 0, 1.4),
            "forearm.L": (1.1 * dd, 0, 0),
            "forearm.R": (1.1 * dd, 0, 0),
            "spine.005": (0.4, 0, 0),
        }
        hip_drop = 0
    elif exercise == "jumpingjack":
        D = {
            "upper_arm.L": (0, 0, -0.4 - 2.0 * tt),
            "upper_arm.R": (0, 0, 0.4 + 2.0 * tt),
            "thigh.L": (0, 0, -0.05 - 0.35 * tt),
            "thigh.R": (0, 0, 0.05 + 0.35 * tt),
        }
        hip_drop = 0
    elif exercise == "curl":
        D = {
            "upper_arm.L": (0, 0, -0.8),
            "upper_arm.R": (0, 0, 0.8),
            "forearm.L": (1.8 * dd, 0, 0),
            "forearm.R": (1.8 * dd, 0, 0),
        }
        hip_drop = 0
    apply_poses(by_name, D)
    # hips drop (spine is the hips-equivalent root bone here)
    if hip_drop:
        by_name["spine"].t = vadd(by_name["spine"].t, (0, -H * hip_drop, 0))
    P = all_pos()
    M = measure(P, BONES)
    print(f"\nposed [{exercise} p={p}] (NO prone container):")
    for b in [
        "spine",
        "spine.003",
        "spine.005",
        "hand.L",
        "forearm.L",
        "thigh.L",
        "shin.L",
        "foot.L",
        "toe.L",
    ]:
        print(f"   {b:12s} {P[b][0]:+.3f} {P[b][1]:+.3f} {P[b][2]:+.3f}")
    print(
        f"   hip_y={M['hip_y']:.3f} (drop {P0['spine'][1] - M['hip_y']:.3f} = {(P0['spine'][1] - M['hip_y']) / H * 100:.0f}%H)"
        f"  hand_y={M['handL_y']:.3f}  foot_y={M['foot_y']:.3f}  toe_y={M['toe_y']:.3f}"
    )
    print(
        f"   thigh_dir={tuple(round(c, 2) for c in M['thigh_dir'])} shin_dir={tuple(round(c, 2) for c in M['shin_dir'])}"
    )
    print(
        f"   arm_dir={tuple(round(c, 2) for c in M['arm_dir'])} fore_dir={tuple(round(c, 2) for c in M['fore_dir'])}"
    )
    print(f"   spine_dir={tuple(round(c, 2) for c in M['spine_dir'])}")

    # prone container for pushup: rotate about origin (feet centre) then lift
    if exercise == "pushup":
        for rx, rz, lift in [(-math.pi / 2, 0, 0.17 * H), (math.pi / 2, 0, 0.17 * H)]:
            qp = euler_xyz(rx, 0, rz)
            Pr = {b: qrot(qp, P[b]) for b in P}
            Pr = {b: vadd(Pr[b], (0, lift * H, 0)) for b in Pr}
            print(f"\n   PRONE rx={rx:+.2f} lift={lift * H:.2f}:")
            for b in [
                "spine",
                "spine.003",
                "spine.005",
                "hand.L",
                "forearm.L",
                "thigh.L",
                "shin.L",
                "foot.L",
                "toe.L",
            ]:
                print(f"      {b:12s} {Pr[b][0]:+.3f} {Pr[b][1]:+.3f} {Pr[b][2]:+.3f}")


if __name__ == "__main__":
    main(
        sys.argv[1],
        sys.argv[2] if len(sys.argv) > 2 else "rest",
        float(sys.argv[3]) if len(sys.argv) > 3 else 0.5,
    )
