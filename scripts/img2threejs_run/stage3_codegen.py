#!/usr/bin/env python3
"""Stage-2 SPEC + Stage-3 CODEGEN (bounded): glm-5.3 (anthropic shim, text key)
writes the ObjectSculptSpec-lite JSON AND the reconstruction module in our
photo_avatars format. Vision semantics come from stage1_corrected.json + host
pixel-arbitration notes (docs/23 §5)."""

import json, sys, pathlib, re

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from glm_call import send

RUN = pathlib.Path(__file__).parent
intake = json.loads((RUN / "intake_corrected.json").read_text())

HOST_NOTES = """Host pixel-arbitration (authoritative, from coordinate evidence in the reference):
- The gold-ringed dark circles sit at the head's LEFT/RIGHT flanks at ear height (image x=266 and x=502; head spans x 266..502), NOT on the face front. They are headphone ear cups; the dark arc over the crown is the headband. Reconstruct as: band over crown + cup on each ear.
- The actual eyes are two small sky-blue rounded rectangles on the face front (x 312..456), the LEFT one half-covered by the coral fringe sweep.
- The mouth is an OPEN smile (dark rounded-wedge), not closed.
- The fringe sweeps asymmetrically over the viewer-left eye.
- Bust only: head + neck + shoulders/hoodie. No arms, no body below the chest line.
"""

FORMAT = """Target module format (MUST match exactly — it loads in /avatars):
import * as THREE from 'three';
const C = { ...exact hexes from the palette below... };
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
export function createBeaconModel() {
  const root = new THREE.Group(); root.name = 'Beacon_Root';
  // named pivot Groups: Shoulders, Neck, Head, Fringe, TopKnot, BandL/BandR or one Headphones group, DrawstringL/R...
  // meshes: primitives only (Sphere/Cylinder/Capsule/Box/Torus/Cone/Lathe where useful)
  // BUST: hoodie shoulders (wide, squared), hood collar behind neck, zip pull, drawstrings
  // head: skin sphere slightly squashed; coral hair cap (sphere segment); asymmetric fringe over LEFT eye (offset wedge/cone);
  // top-knot: coral sphere above crown; eyes: sky-blue rounded boxes on face; open smile: dark torus segment or wedge;
  // headphones: charcoal torus-segment band over crown + gold torus ring + charcoal cylinder cup per ear
  root.userData.sockets = { head: Head, topknot: TopKnot, cup_L: ..., cup_R: ... };
  root.userData.tick = (t) => { /* idle: gentle head bob + breath on shoulders + drawstring sway + slow gold glint via emissiveIntensity */ };
  return root;
}
export const BEACON_DESC = { id: 'beacon', name: 'Beacon — coral-top-knot DJ bust', blurb: '...' };
Rules: pure three r177 primitives; NO textures, NO external assets; flat shading; every material colour must be one of the sampled palette hexes; total mesh count <= 34; keep it readable (comments per zone)."""

body = {
    "max_tokens": 8000,
    "system": "You are the codegen stage of the img2threejs skill: reconstruction-by-code, procedural Three.js only. Output exactly two fenced blocks: ```json spec``` then ```javascript module```. No other prose.",
    "messages": [
        {
            "role": "user",
            "content": f"Reference intake (vision-corrected):\n{json.dumps(intake, indent=1)}\n\n{HOST_NOTES}\n\n{FORMAT}\n\n"
            "Emit:\n"
            '1) ```json — an ObjectSculptSpec-lite: {{"components": [{{"name","parent","primitive","dims","material":"<palette hex>","pos"}}], "palette": [hexes], "pivots": [...], "sockets": [...], "tick_plan": [...], "quality_contract": {{"must_nail": [...]}}}}\n'
            "2) ```javascript — the complete module implementing that spec in the target format (createBeaconModel + BEACON_DESC).",
        }
    ],
}
res, rec, text = send("codegen_stage3", body)
print(json.dumps(rec))

m = re.search(r"```json\s*(.*?)\s*```", text, re.S)
j = re.search(r"```javascript\s*(.*?)\s*```", text, re.S)
if not j:
    (RUN / "codegen_raw.txt").write_text(text)
    print("NO JS BLOCK — dumped codegen_raw.txt")
    sys.exit(1)
(RUN / "beacon_spec.json").write_text(m.group(1) if m else "{}")
(RUN / "beacon_gen.js").write_text(j.group(1))
spec = json.loads((RUN / "beacon_spec.json").read_text()) if m else {}
print(
    "spec components:",
    len(spec.get("components", [])),
    "| must_nail:",
    spec.get("quality_contract", {}).get("must_nail"),
)
print("module bytes:", len(j.group(1)))
