#!/usr/bin/env python3
"""Export loop cycles from AI4Animation's Geno demo motions (npz) → JSON clips
for site/model-avatars.js (`loadJSONClip`).

The npz files (facebookresearch/ai4animationpy, Demos/_ASSETS_/Geno/Motions/)
are 100STYLE captures (Mason, Starke & Komura 2022 — trial naming
{style}{take}_subject{n}) retargeted to the Geno skeleton via
orangeduck/100style-retarget (data CC BY 4.0), per the repo README's dataset
table (NOT CMU-derived, as earlier comments assumed). 23-joint mixamo-family
format using Geno's own joint names (Hips/Spine/Spine1-3/Neck/Head/LeftArm/...):

    positions   (F, 23, 3)  WORLD joint positions, metres
    quaternions (F, 23, 4)  WORLD joint rotations, (x,y,z,w) [auto-verified]
    bone_names  (23,)       parent_indices (23,)    framerate (scalar, Hz)

This script:
  1. auto-verifies the quaternion word-order by reconstructing child joint
     positions from parent world pos+quat and the frame-0 offset,
  2. scans the capture for the cleanest LOOPING window (stride / period pair
     minimising joint rotation distance + hips velocity mismatch),
  3. slices that window, converts world quats → per-bone LOCAL quats
     (q_local = q_parent⁻¹ · q_child), keeps hips local position (= world),
  4. writes a JSON clip: rest offsets (parent-local, from the loop's first
     frame geometry) + sampled quaternion tracks + hips position track.

Output: site/models/geno_npz_<name>.json  (one loop, ~30 fps).
"""

import json
import sys

import numpy as np

SRC = "/home/fivelidz/projects/github_repos/_new_aug2026/Ai4animationpy/Demos/_ASSETS_/Geno/Motions"
DST = "/home/fivelidz/projects/reps_with_friends/site/models"

# name, npz file, loop window [min,max] seconds, min speed m/s, stride,
# optional scan range (t0, t1) seconds restricting where loops are searched.
JOBS = [
    ("geno_walk", "walk3_subject3.npz", (0.55, 1.35), 0.8, 5),
    ("geno_run", "run1_subject2.npz", (0.45, 1.05), 1.6, 5),
    ("geno_sprint", "sprint1_subject4.npz", (0.35, 0.90), 2.5, 5),
    # tactical aim-walk: slow walk with a two-hand weapon hold (hands ~0.34m
    # apart, wrists extended forward) — cleanest loop in the whole dataset
    # (score 0.078 vs walk's 0.231). Found at ~22s, 1.38s period, ~0.12 m/s.
    ("geno_aimwalk", "aiming1_subject1.npz", (0.90, 2.00), 0.10, 5),
    # side-lying floor drag: subject lies on their side and pulls themselves
    # across the floor. Scan restricted to the grounded phase (after the
    # get-down at ~10-16s); best scoot cycle ~107.6s, 3.07s, 0.33 m/s.
    ("geno_floorscoot", "ground1_subject1.npz", (2.00, 3.50), 0.08, 5, (16.0, 150.0)),
]

# name, npz file, [t0, t1] seconds — exported verbatim (no loop search);
# played once and held at the end frame (`hold: true` in GENO_CLIPS).
ONE_SHOTS = [
    # stand → side-lying get-down, the prelude to floor work (crunches,
    # stretches). Smooth 2s descent inside 8.5-11.5s; hips 0.79 → 0.11 m.
    ("geno_getdown", "ground1_subject1.npz", 8.5, 11.5),
]


def quat_as_matrix(q, conv):
    """q: (...,4) raw quat words → (...,3,3) rotation matrices."""
    if conv == "xyzw":
        x, y, z, w = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
    else:  # wxyz
        w, x, y, z = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
    n = np.sqrt(x * x + y * y + z * z + w * w)
    x, y, z, w = x / n, y / n, z / n, w / n
    m = np.empty(q.shape[:-1] + (3, 3))
    m[..., 0, 0] = 1 - 2 * (y * y + z * z)
    m[..., 0, 1] = 2 * (x * y - z * w)
    m[..., 0, 2] = 2 * (x * z + y * w)
    m[..., 1, 0] = 2 * (x * y + z * w)
    m[..., 1, 1] = 1 - 2 * (x * x + z * z)
    m[..., 1, 2] = 2 * (y * z - x * w)
    m[..., 2, 0] = 2 * (x * z - y * w)
    m[..., 2, 1] = 2 * (y * z + x * w)
    m[..., 2, 2] = 1 - 2 * (x * x + y * y)
    return m


def quat_mul(a, b):
    """Hamilton product, both (x,y,z,w)."""
    ax, ay, az, aw = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    bx, by, bz, bw = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack(
        [
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz,
        ],
        axis=-1,
    )


def quat_conj(q):
    out = q.copy()
    out[..., :3] *= -1
    return out


def quat_angle(qa, qb):
    """geodesic angle between two quats (x,y,z,w), radians."""
    d = np.abs(np.sum(qa * qb, axis=-1))
    return 2 * np.arccos(np.clip(d, -1.0, 1.0))


def detect_convention(pos, quat_raw, parents):
    """Pick the word order where parent world pos+rot reconstructs children.
    Bone offsets are constant in the parent's local frame, so rotating the
    frame-f offset into frame f2 via the two world rotations must reproduce
    the actual frame-f2 child position."""
    for conv in ("xyzw", "wxyz"):
        if conv == "xyzw":
            q = quat_raw
        else:
            q = np.stack(
                [
                    quat_raw[..., 1],
                    quat_raw[..., 2],
                    quat_raw[..., 3],
                    quat_raw[..., 0],
                ],
                axis=-1,
            )
        ok = True
        for f in (0, 500, 5000, 10000):
            if f >= pos.shape[0] - 60:
                continue
            f2 = f + 50
            for c in range(1, pos.shape[1]):
                p = parents[c]
                off = pos[f, c] - pos[f, p]
                off_local = quat_as_matrix(q[f, p], "xyzw").T @ off
                off_world_f2 = quat_as_matrix(q[f2, p], "xyzw") @ off_local
                err = np.linalg.norm(pos[f2, c] - (pos[f2, p] + off_world_f2))
                if err > 2e-2:
                    ok = False
                    break
            if not ok:
                break
        if ok:
            return conv
    return None


def find_loop(pos, quat, parents, fps, lo_s, hi_s, min_speed, stride):
    """Scan for (start, length) with minimal POSE loop error.

    Scored on hips-RELATIVE rotations (q_hips⁻¹·q_i) so straight-line and
    gently turning gaits compare by pose, not world facing; a yaw-drift
    penalty steers toward straight segments, and the drift is de-trended
    (rotated out progressively across the slice) so the loop wraps cleanly."""
    n = pos.shape[0]
    hips_speed = (
        np.linalg.norm(np.diff(pos[:, 0, :2], axis=0), axis=1) * fps
    )  # m/s horizontal
    # hips-relative pose quats (removes world facing from the comparison)
    qrel = quat_mul(quat_conj(quat[:, 0:1]), quat)
    lo = max(2, int(lo_s * fps))
    hi = min(int(hi_s * fps), n - 2)
    best = None
    for L in range(lo, hi + 1, 2):
        for s in range(30, n - L - 60, stride):
            seg_speed = hips_speed[s : s + L].mean()
            if seg_speed < min_speed:
                continue
            ang = quat_angle(qrel[s], qrel[s + L]).mean()
            # velocity continuity: joints' world velocity direction flip check via positions
            vel_s = pos[s + 2] - pos[s]
            vel_e = pos[s + L + 2] - pos[s + L]
            vd = np.linalg.norm(vel_s - vel_e, axis=-1).mean()
            # yaw drift of the travel direction over the window
            d0 = pos[min(s + 5, n - 1), 0, :2] - pos[s, 0, :2]
            d1 = pos[min(s + L + 5, n - 1), 0, :2] - pos[s + L, 0, :2]
            n0, n1 = np.linalg.norm(d0), np.linalg.norm(d1)
            yaw = 0.0
            if n0 > 1e-3 and n1 > 1e-3:
                cosw = np.clip(np.dot(d0, d1) / (n0 * n1), -1, 1)
                yaw = np.arccos(cosw)
            score = ang + 0.35 * vd + 0.5 * yaw
            if best is None or score < best[0]:
                best = (score, s, L, ang, vd, seg_speed, yaw)
    return best


def load_npz(fname):
    """Load one capture and normalise the quat word-order → (pos, q, parents, names, fps, conv)."""
    d = np.load(f"{SRC}/{fname}", allow_pickle=True)
    pos = d["positions"].astype(np.float64)
    qraw = d["quaternions"].astype(np.float64)
    names = [str(x) for x in d["bone_names"]]
    parents = d["parent_indices"].astype(int)
    fps = float(d["framerate"])
    conv = detect_convention(pos, qraw, parents)
    if conv is None:
        return None
    q = (
        qraw
        if conv == "xyzw"
        else np.stack([qraw[..., 1], qraw[..., 2], qraw[..., 3], qraw[..., 0]], axis=-1)
    )
    return pos, q, parents, names, fps, conv


def emit_clip(name, fname, pos, q, parents, names, fps, s, L, yaw=0.0):
    """Slice frames s..s+L and write the JSON clip (shared by loops & one-shots)."""
    # de-trend the yaw drift: rotate the slice progressively so the world
    # quaternions (and horizontal travel) match at the wrap point
    idx = np.arange(s, s + L + 1)
    drift = 0.0
    if yaw > 1e-3:
        d0 = pos[min(s + 5, len(pos) - 1), 0, :2] - pos[s, 0, :2]
        d1 = pos[min(s + L + 5, len(pos) - 1), 0, :2] - pos[s + L, 0, :2]
        drift = yaw * np.sign(np.cross(d0, d1))
    qs = q[idx].copy()
    ps = pos[idx].copy()
    for k in range(len(idx)):
        if drift == 0.0:
            break
        t = k / max(1, len(idx) - 1)
        a = -drift * t  # rotate about world Y
        c, sn = np.cos(a / 2), np.sin(a / 2)
        ry = np.array([0.0, sn, 0.0, c])  # (x,y,z,w) yaw quat
        qs[k] = quat_mul(ry[None, :], qs[k])
        m = quat_as_matrix(ry[None, :], "xyzw")[0]
        ps[k] = ps[k] @ m.T  # row-vector rotation
    # subsample to ~30 fps AFTER de-trending
    step = 2 if fps > 45 else 1
    sub = np.arange(0, len(idx), step)
    qs, ps = qs[sub], ps[sub]
    times = sub / fps
    # make the hips translation IN-PLACE: linearly remove the slice's
    # HORIZONTAL (x,z) drift so no residual travel leaks into downstream
    # up-axis bob measurements (the Y bob is genuine — kept).
    if len(ps) > 1:
        dx = ps[-1, 0, 0] - ps[0, 0, 0]
        dz = ps[-1, 0, 2] - ps[0, 0, 2]
        for k in range(len(ps)):
            t = k / (len(ps) - 1)
            ps[k, 0, 0] -= dx * t
            ps[k, 0, 2] -= dz * t

    # local quats: q_local(f, i) = q_world(parent)⁻¹ · q_world(child)
    qloc = qs.copy()
    for i in range(1, len(names)):
        qloc[:, i] = quat_mul(quat_conj(qs[:, parents[i]]), qs[:, i])

    offsets: list = [[0.0, 0.0, 0.0]]
    for i in range(1, len(names)):
        p = parents[i]
        off_world = ps[0, i] - ps[0, p]
        m = quat_as_matrix(qs[0, p], "xyzw")
        off_local = m.T @ off_world
        offsets.append([round(float(x), 6) for x in off_local])

    out = {
        "source": f"ai4animationpy Demos/_ASSETS_/Geno/Motions/{fname}",
        "names": names,
        "parents": parents.tolist(),
        "offsets": offsets,
        "framerate": fps / step,
        "times": [round(float(t), 4) for t in times],
        "quats": {
            names[i]: [round(float(x), 5) for x in qloc[:, i].reshape(-1)]
            for i in range(len(names))
        },
        "hipsPos": [round(float(x), 5) for x in ps[:, 0].reshape(-1)],
    }
    path = f"{DST}/geno_npz_{name.replace('geno_', '')}.json"
    with open(path, "w") as f:
        json.dump(out, f)
    print(f"  → {path} ({len(times)} frames)")


def main():
    for job in JOBS:
        name, fname, (lo_s, hi_s), min_speed, stride = job[:5]
        scan = job[5] if len(job) > 5 else None
        data = load_npz(fname)
        if data is None:
            print(f"{name}: convention detection FAILED — skipping", file=sys.stderr)
            continue
        pos, q, parents, names, fps, conv = data
        print(f"{name}: quat convention = {conv}")

        # optionally restrict the loop search to a time range (e.g. the
        # grounded phase of ground1) — slice, search, then offset back
        f0 = 0
        pos_s, q_s = pos, q
        if scan:
            f0, f1 = int(scan[0] * fps), int(scan[1] * fps)
            pos_s, q_s = pos[f0:f1], q[f0:f1]

        res = find_loop(pos_s, q_s, parents, fps, lo_s, hi_s, min_speed, stride)
        if res is None:
            print(f"{name}: no loop found (speed gate?) — skipping", file=sys.stderr)
            continue
        score, s, L, ang, vd, speed, yaw = res
        s += f0
        print(
            f"{name}: loop frames {s}..{s + L} ({L / fps:.2f}s @ {fps:.0f}fps), "
            f"pose err {ang:.3f} rad, vel err {vd:.3f}, yaw drift {yaw:.3f}, speed {speed:.2f} m/s"
        )
        emit_clip(name, fname, pos, q, parents, names, fps, s, L, yaw)

    for name, fname, t0, t1 in ONE_SHOTS:
        data = load_npz(fname)
        if data is None:
            print(f"{name}: convention detection FAILED — skipping", file=sys.stderr)
            continue
        pos, q, parents, names, fps, conv = data
        s, L = int(t0 * fps), int((t1 - t0) * fps)
        print(
            f"{name}: one-shot frames {s}..{s + L} ({L / fps:.2f}s @ {fps:.0f}fps) [hold]"
        )
        emit_clip(name, fname, pos, q, parents, names, fps, s, L, yaw=0.0)


if __name__ == "__main__":
    main()
