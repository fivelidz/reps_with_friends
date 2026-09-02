#!/usr/bin/env python3
"""
Scrape Ben Gillies' Pinterest board(s) for Reps With Friends design references.
Shared by founder Alexei for internal design ideation.

Source of truth:
  - Public board "REPS WITH FRIENDS": https://au.pinterest.com/bengillies888/reps-with-friends/
    (board id 319474236006666636 — 8 pins)
  - The shared link in the brief was /reps-with-friends-ideation/ which soft-404s
    anonymously (secret board). Its pins surface via Ben's profile SSR pin feed
    (15 extra pins beyond the public board). We take both.

Method (no auth, public SSR data only):
  1. Board page SSR JSON (__PWS_INITIAL_PROPS__ .initialReduxState.pins) -> 8 pins
  2. Profile page SSR JSON (same path) -> 23 pins (superset incl. the 8)
  3. Per-pin page og:title/og:description for annotation (rate-limited)
  4. Download orig image (fallback 736x) at 0.3s spacing -> site/pinboard/pin_NN.ext

Outputs: site/pinboard/pins_raw.json (all metadata, feeds manifest.json build)
"""

import json, re, subprocess, time, sys, os, html as htmllib
from pathlib import Path

OUT = Path("/home/fivelidz/projects/reps_with_friends/site/pinboard")
TMP = Path("/tmp/pinboard_scrape")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

BOARD_URL = "https://au.pinterest.com/bengillies888/reps-with-friends/"
PROFILE_URL = "https://au.pinterest.com/bengillies888/"


def curl(url, out, extra=None):
    cmd = ["curl", "-sL", "-A", UA, "-o", str(out), "-w", "%{http_code}", url]
    if extra:
        cmd = cmd[:1] + extra + cmd[1:]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    return r.stdout.strip()


def redux_pins(htmlfile):
    html = (TMP / htmlfile).read_text(encoding="utf-8")
    m = re.search(
        r'<script id="__PWS_INITIAL_PROPS__" type="application/json">(.*?)</script>',
        html,
        re.S,
    )
    if not m:
        return {}, {}
    redux = json.loads(m.group(1)).get("initialReduxState", {})
    return redux.get("pins", {}), redux.get("boards", {})


# ── 1+2. merge pin sets ────────────────────────────────────────────────
board_pins, boards = redux_pins("board2.html")
profile_pins, _ = redux_pins("profile.html")
assert boards, "board SSR missing"
board_meta = next(iter(boards.values()))
board_ids = set(board_pins)
print(f"board pins: {len(board_ids)}  profile pins: {len(profile_pins)}")

merged = {}
for pid, p in board_pins.items():
    q = dict(p)
    q["source"] = "board"
    merged[pid] = q
for pid, p in profile_pins.items():
    if pid in merged:
        merged[pid]["source"] = (
            "board+profile" if pid in board_ids else merged[pid]["source"]
        )
    else:
        q = dict(p)
        q["source"] = "profile"
        merged[pid] = q

# pidgets descriptions for board pins
pidgets = json.loads((TMP / "pidgets2.json").read_text())
pidgets_desc = {str(p["id"]): p.get("description", "") for p in pidgets["data"]["pins"]}

# dedupe by image signature, keep both pin ids noted
by_sig = {}
order = []
for pid, p in merged.items():
    sig = p.get("image_signature") or pid
    if sig in by_sig:
        by_sig[sig]["duplicate_of"] = by_sig[sig]["id"]
        continue
    entry = {
        "id": pid,
        "pin_url": f"https://au.pinterest.com/pin/{pid}/",
        "source": p["source"],
        "image_signature": sig,
        "images": p.get("images", {}),
        "is_video": bool(p.get("videos")),
        "dominant_color": p.get("dominant_color"),
        "pidgets_description": htmllib.unescape(pidgets_desc.get(pid, "")),
        "og_title": "",
        "og_description": "",
    }
    by_sig[sig] = entry
    order.append(entry)

print(f"unique images: {len(order)} (dupes pruned)")

# ── 3. pin pages for og metadata (first 6 chars only saved; rate-limited) ──
for i, e in enumerate(order):
    if i and i % 10 == 0:
        print(f"  ...pin pages {i}/{len(order)}", flush=True)
    page = TMP / f"pp_{e['id']}.html"
    if not page.exists():
        code = curl(e["pin_url"], page)
        if code != "200":
            print(f"  WARN pin page {e['id']} -> {code}")
        time.sleep(0.3)
    try:
        h = page.read_text(encoding="utf-8")
        t = re.search(r'property="og:title" content="([^"]*)"', h) or re.search(
            r'content="([^"]*)" [^>]*property="og:title"', h
        )
        d = re.search(r'property="og:description" content="([^"]*)"', h) or re.search(
            r'content="([^"]*)" [^>]*property="og:description"', h
        )
        if t:
            e["og_title"] = htmllib.unescape(t.group(1))[:300]
        if d:
            e["og_description"] = htmllib.unescape(d.group(1))[:500]
    except Exception as ex:
        print(f"  WARN parse {e['id']}: {ex}")


# ── 4. download images ────────────────────────────────────────────────
def best_url(images):
    for k in ("orig", "736x", "474x"):
        u = (images.get(k) or {}).get("url")
        if u:
            return u, k
    return None, None


n_ok = 0
for i, e in enumerate(order):
    url, size_key = best_url(e["images"])
    if not url:
        print(f"  SKIP {e['id']} no image")
        continue
    ext = os.path.splitext(url)[1].lower() or ".jpg"
    name = f"pin_{i + 1:02d}{ext}"
    dest = OUT / name
    e["file"] = name
    e["downloaded_variant"] = size_key
    if dest.exists() and dest.stat().st_size > 5000:
        n_ok += 1
        continue
    code = curl(url, dest)
    ok = code == "200" and dest.exists() and dest.stat().st_size > 5000
    # fallback: try 736x if orig failed
    if not ok and size_key == "orig":
        u2 = (e["images"].get("736x") or {}).get("url")
        if u2:
            dest2 = dest.with_suffix(os.path.splitext(u2)[1].lower() or ".jpg")
            code = curl(u2, dest2)
            if code == "200" and dest2.exists() and dest2.stat().st_size > 5000:
                dest.unlink(missing_ok=True)
                dest = dest2
                e["file"] = dest.name
                e["downloaded_variant"] = "736x"
                ok = True
    if ok:
        n_ok += 1
    else:
        print(f"  FAIL {e['id']} {code} {url}")
    time.sleep(0.3)

print(f"downloaded ok: {n_ok}/{len(order)}")
meta = {
    "board": {
        k: board_meta.get(k) for k in ("id", "name", "url", "pin_count", "privacy")
    },
    "board_url_full": "https://au.pinterest.com"
    + board_meta.get("url", "/bengillies888/reps-with-friends/"),
    "profile_url": PROFILE_URL,
    "scrape_date": time.strftime("%Y-%m-%d"),
    "pins": order,
}
(TMP / "pins_raw.json").write_text(json.dumps(meta, indent=1))
print("wrote", TMP / "pins_raw.json")
