#!/usr/bin/env python3
"""Per-screen comparison: my headless screenshots vs Ben's Figma @2x exports.
Grid-block colour comparison (structure + palette fidelity), honest numbers.
Verdict bands account for known deltas: our redrawn icons, placeholder
wordmark, test-app status-bar tools, browser vs Figma text rendering."""

from PIL import Image
import json, os, sys

REPO = "/home/fivelidz/projects/reps_with_friends"
EXPORTS = f"{REPO}/figma/assets/exports"
SHOTS = f"{REPO}/apps/screenshots/figma-app"
REPORT = "/tmp/figma_verify_report.json"

# screen id -> figma frame id (from the app registry)
reg = json.load(open("/tmp/figma_screens.json"))  # [{id, figma, name}]
COLS, ROWS = 13, 28  # 30px blocks at 390 wide
TOL = 48  # per-block mean channel distance tolerance


def blocks(img, cols=COLS, rows=ROWS):
    img = img.convert("RGB")
    w, h = img.size
    out = []
    bw, bh = w / cols, h / rows
    px = img.load()
    for ry in range(rows):
        for rx in range(cols):
            x0, y0 = int(rx * bw), int(ry * bh)
            x1, y1 = int((rx + 1) * bw), int((ry + 1) * bh)
            r_acc = g_acc = b_acc = 0.0
            n = 0
            for y in range(y0, max(y1, y0 + 1), 2):
                for x in range(x0, max(x1, x0 + 1), 2):
                    p = px[x, y]
                    r_acc += p[0]
                    g_acc += p[1]
                    b_acc += p[2]
                    n += 1
            out.append((r_acc / n, g_acc / n, b_acc / n))
    return out


def find_export(figma_id):
    for f in os.listdir(EXPORTS):
        if f.startswith(figma_id + "_"):
            return os.path.join(EXPORTS, f)
    return None


def main():
    report = json.load(open(REPORT))
    rows = []
    for s in reg:
        sid, fid = s["id"], s["figma"]
        shot_p = os.path.join(SHOTS, sid + ".png")
        exp_p = find_export(fid)
        if not os.path.exists(shot_p) or not exp_p:
            rows.append(
                {
                    "id": sid,
                    "figma": fid,
                    "verdict": "MISSING",
                    "why": "no screenshot"
                    if not os.path.exists(shot_p)
                    else "no export",
                }
            )
            continue
        mine = Image.open(shot_p)
        ref = Image.open(exp_p)
        # common size: my shots are 780x1688 (390x844 @2x); exports 786x1704
        W, H = 780, 1688
        mine = mine.resize((W, H), Image.Resampling.LANCZOS)
        ref = ref.resize((W, H), Image.Resampling.LANCZOS)
        bm, br = blocks(mine), blocks(ref)
        dists = [sum(abs(a[i] - b[i]) for i in range(3)) / 3 for a, b in zip(bm, br)]
        match = sum(1 for d in dists if d <= TOL) / len(dists) * 100
        mean = sum(dists) / len(dists)
        verdict = (
            "faithful"
            if match >= 82
            else "close"
            if match >= 68
            else "loose"
            if match >= 50
            else "off"
        )
        rows.append(
            {
                "id": sid,
                "figma": fid,
                "name": s.get("name", ""),
                "blockMatch": round(match, 1),
                "meanDiff": round(mean, 1),
                "verdict": verdict,
            }
        )
    json.dump(rows, open("/tmp/figma_compare.json", "w"), indent=1)
    for r in rows:
        print(
            f"{r['figma']:>16} {r['id']:<12} {str(r.get('blockMatch', '—')):>6}%  {r['verdict']}"
        )
    ok = [r for r in rows if r["verdict"] in ("faithful", "close")]
    print(f"\n{len(ok)}/{len(rows)} screens faithful/close (block match ≥68%)")


main()
