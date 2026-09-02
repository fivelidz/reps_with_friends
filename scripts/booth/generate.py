#!/usr/bin/env python3
"""generate.py — PHOTO BOOTH generation pipeline (one avatar per invocation).

Productisation of the PROVEN docs/23 §5 run (scripts/img2threejs_run/):
  stage 1 INTAKE   glm-4.6v (native v4 vision, zhipuai key) → bounded JSON:
                   palette hexes + silhouette/feature semantics. NO likeness —
                   we ask for palette + coarse shape classes only, never facial
                   geometry. One strict-JSON retry on parse failure.
  stage 2 CODEGEN  glm-5.3 (anthropic shim, text key) → the bust module in our
                   photo_avatars contract (module-only output — §5.3 lesson:
                   spec+module output burned tokens on hidden thinking).
  stage 3 GATE     deterministic, owns the verdict (vision reviewers are
                   generous — §5.3 finding #8): headless chromium page contract
                   check (renders, tick, sockets.head, no NaN, mesh budget) via
                   scripts/booth/gate_render.ts + pixel gate (palette fidelity,
                   silhouette aspect, multi-part) via scripts/booth/pixel_gate.py.
                   ONE reject+retry: failure notes → glm-5.3 fix pass → re-gate.
  save             site/models/photo_avatars/booth_<ts>.js (provenance header)
                   + append to booth_index.json (the /avatars registry).
  fallback --fallback: no LLM at all — PIL palette sampling
                   (scripts/avatars/photo_palette_sample.py method) →
                   deterministic template bust. The booth never dead-ends.

Costs log to .data/booth-log.jsonl (per call + per run summary).
Progress: "PHASE:<name>" lines on stderr (serve.ts surfaces them live).
Photo handling: the input file is downsized server-side to ≤512px, used for the
run, and deleted by the caller — never stored in the repo.

Usage (normally spawned by serve.ts, not run by hand):
  python3 scripts/booth/generate.py --image /tmp/x.png --id booth_x --base http://localhost:4173 [--fallback]
"""

import argparse
import json
import pathlib
import re
import subprocess
import sys
import time

REPO = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import glm  # noqa: E402

sys.path.insert(0, str(REPO / "scripts/avatars"))
from photo_palette_sample import palette as sample_palette  # type: ignore[import-not-found]  # runtime sys.path import

MODELS_DIR = REPO / "site/models/photo_avatars"
REGISTRY = MODELS_DIR / "booth_index.json"


def phase(name):
    print(f"PHASE:{name}", file=sys.stderr, flush=True)


# ── prompts ──────────────────────────────────────────────────────────────────

INTAKE_PROMPT = """You are the intake stage of a stylised-avatar pipeline. Analyse the photo and return STRICT JSON only (no markdown fence, no commentary).

PRIVACY CONTRACT: do NOT identify the person, estimate age/appearance ratings, or measure facial geometry. We need ONLY palette colours and coarse silhouette/feature classes — the output drives a symbolic flat-colour bust, never a likeness.

{
 "subject": "person selfie" | "illustration" | "other",
 "palette": [{"region": "hair|skin|eyes|garment|accent|background", "hex": "#rrggbb", "note": "one word"}],
 "hair": {"class": "bald|buzz|short|medium|long|covered", "silhouette": ["fringe","top-knot","bun","curly cap","flow","parted","cap","beanie","hood"], "hex": "#rrggbb"},
 "headwear": {"present": true, "kind": "glasses|sunglasses|cap|beanie|headphones|none", "hex": "#rrggbb"},
 "facial_hair": {"present": true, "kind": "stubble|beard|moustache|goatee", "hex": "#rrggbb"},
 "garment": {"kind": "tee|hoodie|tank|jersey|shirt|other", "hex": "#rrggbb", "accent_hex": "#rrggbb"},
 "expression": "neutral|smile|focused",
 "proportions": {"head_height_vs_canvas": 0.5, "shoulder_width_vs_head_width": 2.5},
 "silhouette_signature": ["2-3 most identity-defining shape features"],
 "suitable_for_stylised_bust": true
}
Rules: sample colours as honest hex estimates from the pixels; list every distinct colour region (aim 4-8 palette entries); mark present:false entries with null hex; be precise about what is ON the head vs PART of the garment."""

CODEGEN_SYSTEM = (
    "You are the codegen stage of a stylised-avatar pipeline: reconstruction-by-code, "
    "procedural Three.js only. Output exactly ONE ```javascript fenced block containing "
    "the complete module — no other prose, no spec. Code only."
)

CODEGEN_FORMAT = """Target module format (MUST match exactly — it loads in /avatars):
import * as THREE from 'three';
const C = { /* palette keys -> 0xrrggbb, ONLY hexes from the intake palette */ };
const mat = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0, flatShading: true }, Object.fromEntries(Object.entries(o || {}).filter(([k]) => ['roughness','metalness','emissive','emissiveIntensity','transparent','opacity','side'].includes(k)))));
export function createBoothModel() {
  const root = new THREE.Group(); root.name = 'booth-bust';
  const M = (geo, hex, parent, p, o) => { const m = new THREE.Mesh(geo, mat(hex, o)); m.position.set(p[0], p[1], p[2]); parent.add(m); return m; };

  // named pivot groups: Shoulders, Neck, Head, Hair (+ Accessory if glasses/headwear)
  const Shoulders = new THREE.Group(); Shoulders.name = 'Shoulders'; root.add(Shoulders);
  const Neck = new THREE.Group(); Neck.name = 'Neck'; Neck.position.set(0, 1.0, 0); Shoulders.add(Neck);
  const Head = new THREE.Group(); Head.name = 'Head'; Head.position.set(0, 0.72, 0); Neck.add(Head);
  const Hair = new THREE.Group(); Hair.name = 'Hair'; Head.add(Hair);

  // REQUIRED scaffold proportions (the gallery frames these correctly):
  //   torso: Box ~2.7 x 1.15 x 1.15 centred y 0.55 under Shoulders (bust only — no arms, nothing below chest)
  //   neck: Cylinder r~0.32 h~0.8 at y~0.32 under Neck
  //   head: Sphere r=1.0 at y 0.25 under Head — face FRONT is +Z
  //   eyes: small shapes at z~1.05, x ±0.36, y 0.38 (NEVER buried inside the head sphere)
  //   mouth: small shape at z~0.94, y ~-0.15
  //   hair: cap sphere-segment r~1.05 over the crown; extra volumes ONLY per the intake hair class/silhouette
  //   glasses/headwear: sit OUTSIDE the head radius (|x| > 1.0 at ear height y 0.25), never over the eyes
  //   garment details (collar / zip / stripe / drawstrings) on the torso front z ~0.58
  //   facial hair: thin band/patch volumes hugging the jaw (z 0.7..0.95), distinct hex from hair

  // ... zones: one commented block per zone (torso, head, hair, face, accessories, garment) ...

  root.userData.sockets = { root, shoulders: Shoulders, neck: Neck, head: Head, hair: Hair };
  root.userData.tick = (t) => {
    Head.rotation.z = Math.sin(1.4 * t) * 0.03;
    Head.position.y = 0.72 + Math.sin(1.8 * t) * 0.02;
    Shoulders.scale.setScalar(1 + Math.sin(1.1 * t) * 0.012);
    Hair.rotation.z = -Math.sin(1.4 * t) * 0.05;
  };
  return root;
}
export const BOOTH_DESC = { id: '__ID__', name: 'short evocative name', blurb: 'one sentence — palette + silhouette from a photo, no likeness' };
Rules: pure three r177 primitives (Sphere/Cylinder/Capsule/Box/Torus/Cone); NO textures, loaders or external assets; every material colour must be one of the intake palette hexes; flat shading; total meshes <= 34; module 4-14 KB; everything inside |x|<2.4, y 0..3.2, |z|<1.6; all literals finite (no NaN); keep the M() helper and the scaffold coordinates above.
The o argument of M() is MATERIAL-ONLY (roughness/metalness/emissive/emissiveIntensity/transparent/opacity/side). Geometry props (openEnded etc.) belong in the geometry constructor; mesh transforms (rotation/scale) are set on the returned mesh AFTER the M() call, never inside o."""


def codegen_user(intake, extra_notes=""):
    palette_lines = "\n".join(
        f"  {p['region']}: {p['hex']}"
        for p in intake.get("palette", [])
        if p.get("hex")
    )
    return (
        "Photo intake (from vision — authoritative for palette + silhouette):\n"
        f"{json.dumps(intake, indent=1)}\n\n"
        f"Palette (use these EXACT hexes as C values):\n{palette_lines}\n\n"
        f"{CODEGEN_FORMAT.replace('__ID__', CUR_ID)}\n"
        f"{extra_notes}\n"
        "Emit the complete module in one ```javascript block. Code only."
    )


# ── helpers ──────────────────────────────────────────────────────────────────

CUR_ID = "booth"


def parse_json_loose(text):
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```")[1]
        if t.startswith("json"):
            t = t[4:]
    return json.loads(t.strip())


def extract_js(text):
    m = re.search(r"```(?:javascript|js)\s*(.*?)\s*```", text, re.S)
    return m.group(1) if m else None


def static_checks(src):
    """Cheap deterministic checks BEFORE burning a chromium gate run."""
    problems = []
    if "export function createBoothModel" not in src:
        problems.append("missing export function createBoothModel")
    if (
        "BOOTH_DESC" not in src
        or "userData.tick" not in src
        or "userData.sockets" not in src
    ):
        problems.append("missing BOOTH_DESC / userData.tick / userData.sockets")
    if not re.search(r"sockets[^}]*head\s*:", src, re.S):
        problems.append("sockets.head missing")
    if re.search(r"\bNaN\b|Math\.random|await |fetch\(", src):
        problems.append("forbidden token (NaN/Math.random/await/fetch)")
    if not (1500 <= len(src) <= 40000):
        problems.append(f"module size {len(src)}B outside 1.5-40KB")
    return problems


def run_gate(module_name, palette_hexes, base):
    """chromium page-contract gate + pixel gate. Returns (ok, details)."""
    shot = REPO / f".data/booth/gate_{module_name.replace('/', '_')}.png"
    shot.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        [
            "bun",
            str(REPO / "scripts/booth/gate_render.ts"),
            module_name,
            str(shot),
            base,
            "9461",
        ],
        capture_output=True,
        text=True,
        timeout=180,
    )
    line = next((l for l in r.stdout.splitlines() if l.startswith("{")), "")
    try:
        page = json.loads(line)
    except Exception:
        return False, {
            "page": {
                "ok": False,
                "status": f"gate runner unreadable (exit {r.returncode})",
            }
        }
    if not page.get("ok"):
        return False, {"page": page}
    p = subprocess.run(
        [
            "python3",
            str(REPO / "scripts/booth/pixel_gate.py"),
            str(shot),
            json.dumps(palette_hexes),
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    try:
        pix = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception:
        return False, {
            "page": page,
            "pixel": {"ok": False, "error": "pixel gate unreadable"},
        }
    details = {"page": page, "pixel": pix, "shot": str(shot)}
    return bool(pix.get("ok")), details


def gate_failure_notes(details):
    notes = []
    pg = details.get("page", {})
    if not pg.get("ok"):
        notes.append(f"page gate: {pg.get('status') or pg.get('error')}")
    px = details.get("pixel", {})
    for c in px.get("checks", []):
        if not c.get("pass"):
            notes.append(f"{c['name']}: {c['detail']}")
    return notes


def registry_append(entry):
    data = {"avatars": []}
    if REGISTRY.exists():
        try:
            data = json.loads(REGISTRY.read_text())
        except Exception:
            data = {"avatars": []}
    data.setdefault("avatars", []).append(entry)
    REGISTRY.write_text(json.dumps(data, indent=1) + "\n")


def log_run(rec):
    with open(REPO / ".data/booth-log.jsonl", "a") as f:
        f.write(json.dumps(rec) + "\n")


# ── the deterministic quick-avatar template (NO API — the never-dead-end path)

QUICK_TEMPLATE = """// site/models/photo_avatars/{module} — PHOTO BOOTH quick palette avatar
//
// FALLBACK path (no vision API): palette median-cut sampled from the user's
// photo (scripts/avatars/photo_palette_sample.py method) + a deterministic
// template bust (scripts/booth/generate.py QUICK_TEMPLATE). Same contract as
// every photo avatar: pivots + userData.sockets + userData.tick idle.
// {date} · photo never stored.

import * as THREE from 'three';

const C = {{ skin: {skin}, hair: {hair}, garment: {garment}, accent: {accent}, eye: {eye}, dark: 0x14161c }};

const mat = (color, o = {{}}) => new THREE.MeshStandardMaterial({{ color, roughness: 0.85, metalness: 0, flatShading: true, ...o }});

export function createBoothModel() {{
  const root = new THREE.Group(); root.name = 'booth-quick-bust';
  const M = (geo, hex, parent, p, o) => {{ const m = new THREE.Mesh(geo, mat(hex, o)); m.position.set(p[0], p[1], p[2]); parent.add(m); return m; }};

  const Shoulders = new THREE.Group(); Shoulders.name = 'Shoulders'; root.add(Shoulders);
  const Neck = new THREE.Group(); Neck.name = 'Neck'; Neck.position.set(0, 1.0, 0); Shoulders.add(Neck);
  const Head = new THREE.Group(); Head.name = 'Head'; Head.position.set(0, 0.72, 0); Neck.add(Head);
  const Hair = new THREE.Group(); Hair.name = 'Hair'; Head.add(Hair);

  // torso: tee shoulders (bust only)
  M(new THREE.BoxGeometry(2.7, 1.15, 1.15), C.garment, Shoulders, [0, 0.55, 0]);
  M(new THREE.BoxGeometry(0.62, 0.52, 1.1), C.garment, Shoulders, [1.32, 1.02, 0]);
  M(new THREE.BoxGeometry(0.62, 0.52, 1.1), C.garment, Shoulders, [-1.32, 1.02, 0]);
  M(new THREE.BoxGeometry(0.7, 0.1, 0.06), C.accent, Shoulders, [0, 0.86, 0.59]);   // chest stripe
  M(new THREE.CylinderGeometry(0.3, 0.36, 0.8, 12), C.skin, Neck, [0, 0.32, 0]);      // neck

  // head + face
  M(new THREE.SphereGeometry(1.0, 20, 14), C.skin, Head, [0, 0.25, 0.05]);
  for (const sx of [1, -1]) {{
    const eye = M(new THREE.CapsuleGeometry(0.11, 0.18, 4, 10), C.eye, Head, [0.36 * sx, 0.38, 1.06]);
    eye.scale.set(1, 1, 0.35);
  }}
  const mouth = M(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.dark, Head, [0, -0.15, 0.94]);
  mouth.rotation.x = Math.PI / 2; mouth.scale.set(1.1, 0.5, 0.7);

  // hair: cap + back volume
  const cap = M(new THREE.SphereGeometry(1.05, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), C.hair, Hair, [0, 0.25, 0.05]);
  cap.rotation.x = 0.32;
  const back = M(new THREE.SphereGeometry(0.95, 16, 12), C.hair, Hair, [0, 0.3, -0.32]);
  back.scale.set(0.95, 0.95, 0.8);

  // accent ear studs — the palette's signature pop
  M(new THREE.SphereGeometry(0.07, 10, 8), C.accent, Head, [-1.02, 0.25, 0.05]);
  M(new THREE.SphereGeometry(0.07, 10, 8), C.accent, Head, [1.02, 0.25, 0.05]);

  root.userData.sockets = {{ root, shoulders: Shoulders, neck: Neck, head: Head, hair: Hair }};
  root.userData.tick = (t) => {{
    Head.rotation.z = Math.sin(1.4 * t) * 0.03;
    Head.position.y = 0.72 + Math.sin(1.8 * t) * 0.02;
    Shoulders.scale.setScalar(1 + Math.sin(1.1 * t) * 0.012);
    Hair.rotation.z = -Math.sin(1.4 * t) * 0.05;
  }};
  return root;
}}

export const BOOTH_DESC = {{
  id: '{id}',
  name: '{name}',
  blurb: 'quick palette avatar — colours sampled from your photo, silhouette from the house template (no likeness)'
}};
"""


def quick_fallback(image_path, base, job_id):
    """Deterministic no-API path. Returns verdict dict."""
    phase("quick")
    t0 = time.time()

    # region crops tuned for a selfie/bust framing; the dominant BACKGROUND
    # colour (sampled from the corners) is excluded — otherwise the booth
    # dresses you in your wall paint
    corners = sample_palette(
        str(image_path), (0.00, 0.00, 0.14, 0.14), n=3
    ) + sample_palette(str(image_path), (0.86, 0.00, 1.00, 0.14), n=3)
    bg_hex = corners[0][0] if corners else None

    def dist2(a, b):
        pa = [int(a.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4)]
        pb = [int(b.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4)]
        return sum((x - y) ** 2 for x, y in zip(pa, pb))

    def not_bg(hexc):
        return not (bg_hex and dist2(hexc, bg_hex) < 2500)  # ~ΔE 50

    regions = {
        # hair: ladder of crops walking down the frame until a non-bg colour
        # appears (framing varies — face-fill selfie vs bust-far-out portrait)
        "hair": next(
            (
                p
                for p in (
                    sample_palette(str(image_path), c, n=5)
                    for c in (
                        (0.30, 0.06, 0.70, 0.20),
                        (0.30, 0.12, 0.70, 0.30),
                        (0.30, 0.20, 0.70, 0.40),
                    )
                )
                if any(not_bg(h) for h, _ in p)
            ),
            sample_palette(str(image_path), (0.30, 0.06, 0.70, 0.30), n=5),
        ),
        "face": sample_palette(str(image_path), (0.35, 0.28, 0.65, 0.50), n=5),
        "torso": sample_palette(str(image_path), (0.20, 0.72, 0.80, 0.98), n=5),
    }

    def pick_region(name):
        cands = [h for h, _ in regions[name] if not_bg(h)]
        return cands[0] if cands else regions[name][0][0]

    def pick(hexc):
        return "0x" + hexc.lstrip("#")

    hair = pick(pick_region("hair"))
    skin = pick(pick_region("face"))
    garment = pick(pick_region("torso"))
    used = {garment.lstrip("0x"), skin.lstrip("0x")}
    accents = [
        h
        for h, _ in regions["torso"][1:] + regions["hair"]
        if not_bg(h) and h.lstrip("#") not in used
    ]
    accent = pick(accents[0]) if accents else garment
    eye = "0x2e2a26"
    palette = [
        "#" + h.lstrip("#")
        for h in (pick_region("torso"), pick_region("hair"), pick_region("face"))
    ]

    ts = time.strftime("%Y%m%d_%H%M%S")
    module_name = f"booth_{ts}_quick.js"
    CUR_ID_GLOBAL = f"booth_{ts}_quick"
    src = QUICK_TEMPLATE.format(
        module=module_name,
        date=time.strftime("%Y-%m-%d"),
        skin=skin,
        hair=hair,
        garment=garment,
        accent=accent,
        eye=eye,
        id=CUR_ID_GLOBAL,
        name=f"Quick palette bust {ts[-6:]}",
    )
    (MODELS_DIR / module_name).write_text(src)

    phase("gate")
    ok, details = run_gate(module_name, palette, base)
    if not ok:
        return {
            "ok": False,
            "error": "quick avatar failed its own gate: "
            + "; ".join(gate_failure_notes(details)),
            "fallback": True,
        }

    entry = {
        "module": module_name,
        "id": CUR_ID_GLOBAL,
        "name": f"Quick palette bust {ts[-6:]}",
        "blurb": "quick palette avatar (fallback path — no vision API)",
        "mode": "quick",
        "ts": time.strftime("%FT%T"),
    }
    registry_append(entry)
    rec = {
        "ts": time.strftime("%FT%T"),
        "type": "run",
        "job": job_id,
        "mode": "quick",
        "ok": True,
        "module": module_name,
        "tokens": {"in": 0, "out": 0},
        "seconds": round(time.time() - t0, 1),
        "gate": details.get("pixel", {}).get("checks", []),
    }
    log_run(rec)
    return {
        "ok": True,
        "module": module_name,
        "id": CUR_ID_GLOBAL,
        "url": f"/models/photo_avatars/{module_name}",
        "name": entry["name"],
        "palette": palette,
        "gate": details.get("pixel", {}),
        "mode": "quick",
        "tokens": {"in": 0, "out": 0},
    }


# ── main pipeline ────────────────────────────────────────────────────────────


def main():
    global CUR_ID
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--id", required=True)
    ap.add_argument("--base", default="http://localhost:4173")
    ap.add_argument("--fallback", action="store_true")
    args = ap.parse_args()

    image_path = pathlib.Path(args.image)

    # server-side downsize to ~512px max side (spec: server downsizes, whatever
    # the client did) — the downsized copy is the ONLY thing vision ever sees
    from PIL import Image

    phase("prep")
    small = image_path.with_name(image_path.stem + "_512.png")
    im = Image.open(image_path).convert("RGB")
    im.thumbnail((512, 512))
    im.save(small)

    if args.fallback:
        verdict = quick_fallback(small, args.base, args.id)
        try:
            small.unlink()
        except OSError:
            pass
        print(json.dumps(verdict))
        return 0 if verdict.get("ok") else 1

    t0 = time.time()
    calls = []
    tokens = {"in": 0, "out": 0}

    def track(rec):
        calls.append(
            {k: rec.get(k) for k in ("stage", "model", "in", "out", "seconds", "stop")}
        )
        tokens["in"] += rec.get("in") or 0
        tokens["out"] += rec.get("out") or 0

    # ── stage 1: intake (vision) ─────────────────────────────────────────────
    phase("intake")
    try:
        text, rec = glm.send_vision("intake", small, INTAKE_PROMPT)
        track(rec)
    except Exception as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "stage": "intake",
                    "error": f"vision intake unavailable: {e}",
                    "fallback_available": True,
                }
            )
        )
        return 1
    try:
        intake = parse_json_loose(text)
        assert isinstance(intake.get("palette"), list) and len(intake["palette"]) >= 3
        for p in intake["palette"]:
            assert re.match(r"^#[0-9a-fA-F]{6}$", str(p.get("hex", "")))
    except Exception:
        phase("intake-retry")
        try:
            text, rec = glm.send_vision(
                "intake_retry",
                small,
                "Your previous reply was not valid STRICT JSON (it was truncated or "
                "wrapped in prose). Return ONLY the JSON object — no fence, no prose, "
                f"no thinking — exactly this shape:\n{INTAKE_PROMPT}",
                max_tokens=2200,
            )
            track(rec)
            intake = parse_json_loose(text)
            assert (
                isinstance(intake.get("palette"), list) and len(intake["palette"]) >= 3
            )
        except Exception as e:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "stage": "intake",
                        "error": f"vision returned unparseable intake twice: {e}",
                        "fallback_available": True,
                    }
                )
            )
            return 1

    # ordered palette for the gate: garment/hair/skin first (biggest masses)
    ranked = sorted(
        [p for p in intake["palette"] if p.get("hex")],
        key=lambda p: {"garment": 0, "hair": 1, "skin": 2, "accent": 3}.get(
            p.get("region"), 4
        ),
    )
    palette_hexes = [p["hex"].lower() for p in ranked][:3]

    # ── stage 2: codegen (text) ──────────────────────────────────────────────
    phase("codegen")
    CUR_ID = f"booth_{time.strftime('%Y%m%d_%H%M%S')}"
    try:
        text, rec = glm.send_text(
            "codegen", CODEGEN_SYSTEM, codegen_user(intake), max_tokens=8000
        )
        track(rec)
    except Exception as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "stage": "codegen",
                    "error": f"codegen unavailable: {e}",
                    "fallback_available": True,
                }
            )
        )
        return 1
    src = extract_js(text)
    problems = (
        static_checks(src) if src else ["no ```javascript block in codegen output"]
    )
    if problems:
        phase("codegen-retry")
        try:
            text, rec = glm.send_text(
                "codegen_retry",
                CODEGEN_SYSTEM,
                codegen_user(
                    intake,
                    f"\nYour previous attempt had these defects: {'; '.join(problems)}. Fix them all.",
                ),
                max_tokens=8000,
            )
            track(rec)
            src = extract_js(text)
            problems = static_checks(src) if src else ["still no javascript block"]
        except Exception as e:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "stage": "codegen",
                        "error": f"codegen retry failed: {e}",
                        "fallback_available": True,
                    }
                )
            )
            return 1
    if problems:
        print(
            json.dumps(
                {
                    "ok": False,
                    "stage": "codegen",
                    "error": f"module failed static contract checks: {'; '.join(problems)}",
                    "fallback_available": True,
                }
            )
        )
        return 1
    assert src is not None  # static_checks passed ⟹ extract_js returned a module

    # ── stage 3: gate (+ one reject-retry loop) ──────────────────────────────
    module_name = f"{CUR_ID}.js"
    header = (
        f"// site/models/photo_avatars/{module_name} — PHOTO BOOTH avatar\n"
        "//\n"
        f"// Generated {time.strftime('%Y-%m-%d %H:%M')} by scripts/booth/generate.py:\n"
        "//   intake  : glm-4.6v (palette + silhouette semantics from a photo — no likeness)\n"
        "//   codegen : glm-5.3 (procedural Three.js bust, module contract)\n"
        "//   gate    : headless render contract + deterministic pixel probes\n"
        "// The reference photo was never stored. This file is ours.\n\n"
    )
    (MODELS_DIR / module_name).write_text(header + src + "\n")

    phase("gate")
    ok, details = run_gate(module_name, palette_hexes, args.base)
    fixed_with = None
    if not ok:
        phase("fix")
        notes = gate_failure_notes(details)
        try:
            text, rec = glm.send_text(
                "fix",
                CODEGEN_SYSTEM,
                "This module FAILED its deterministic render gate.\n\n"
                f"Failure evidence:\n- "
                + "\n- ".join(notes)
                + "\n\nThe module:\n```javascript\n"
                + src
                + "\n```\n"
                + codegen_user(
                    intake,
                    "\nReturn the FULL corrected module (same contract). Fix every listed failure.",
                ),
                max_tokens=8000,
            )
            track(rec)
            fixed = extract_js(text)
            fproblems = (
                static_checks(fixed) if fixed else ["no javascript block in fix output"]
            )
            if not fproblems:
                assert fixed is not None
                fixed_with = notes
                src = fixed
                (MODELS_DIR / module_name).write_text(header + src + "\n")
                phase("gate")
                ok, details = run_gate(module_name, palette_hexes, args.base)
        except Exception as e:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "stage": "fix",
                        "error": f"fix call failed: {e}",
                        "fallback_available": True,
                    }
                )
            )
            return 1

    try:
        small.unlink()
    except OSError:
        pass

    if not ok:
        print(
            json.dumps(
                {
                    "ok": False,
                    "stage": "gate",
                    "error": "bust failed the render gate twice: "
                    + "; ".join(gate_failure_notes(details)),
                    "fallback_available": True,
                }
            )
        )
        return 1

    # ── save + registry ──────────────────────────────────────────────────────
    phase("save")
    name_m = re.search(r"name:\s*'([^']+)'", src)
    blurb_m = re.search(r"blurb:\s*'([^']+)'", src)
    entry = {
        "module": module_name,
        "id": CUR_ID,
        "name": name_m.group(1) if name_m else f"Booth bust {CUR_ID[-6:]}",
        "blurb": blurb_m.group(1)
        if blurb_m
        else "photo booth bust (palette + silhouette)",
        "mode": "full",
        "ts": time.strftime("%FT%T"),
        "palette": palette_hexes,
    }
    registry_append(entry)

    seconds = round(time.time() - t0, 1)
    log_run(
        {
            "ts": time.strftime("%FT%T"),
            "type": "run",
            "job": args.id,
            "mode": "full",
            "ok": True,
            "module": module_name,
            "tokens": tokens,
            "seconds": seconds,
            "calls": calls,
            "fixed_with": fixed_with,
            "gate": details.get("pixel", {}).get("checks", []),
        }
    )
    print(
        json.dumps(
            {
                "ok": True,
                "module": module_name,
                "id": CUR_ID,
                "url": f"/models/photo_avatars/{module_name}",
                "name": entry["name"],
                "palette": palette_hexes,
                "gate": details.get("pixel", {}),
                "mode": "full",
                "tokens": tokens,
                "seconds": seconds,
                "calls": calls,
                "fixed_with": fixed_with,
            }
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
