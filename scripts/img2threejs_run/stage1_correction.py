#!/usr/bin/env python3
"""Stage-1 CORRECTION pass (skill correction loop, refine-spec): host feedback
on specific misreads, model re-verifies against pixels, re-emits intake JSON."""

import json, sys, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from glm_call import vision_call

RUN = pathlib.Path(__file__).parent

PROMPT = """Re-examine the reference image carefully. Your first reading had misreads that the host caught. Answer these checks against the ACTUAL PIXELS, then re-emit the full corrected intake JSON (same schema as before).

Checks:
1. The two large gold-ringed dark circles: are they on the FACE FRONT around the eyes, or flanking the HEAD SIDIDES at EAR height, outside the face outline? Trace the dark arc that runs over the TOP of the head — does it connect those two circles (headphone band)?
2. The orange region: does tan skin show BELOW it on the face (i.e. orange = hair on top of head, tan = face), or is the entire head orange?
3. Is there a small round orange shape ABOVE the crown, separate from the head (top-knot/bun)?
4. The two lime-green vertical bars on the chest: do they hang from the garment neckline (hoodie drawstrings), or lie on the neck (necklace)?
5. The purple garment: is a hood collar visible around/behind the neck? Are the shoulders wide and squared? Is there a gold dot (zip pull) at centre chest?
6. The mouth: open smile, or closed?

Re-emit STRICT JSON only:
{
 "corrections_confirmed": ["..."],
 "palette": [{"region": "...", "hex": "#rrggbb"}],
 "zones": [{"name": "...", "what": "...", "colour_hex": "#rrggbb", "position": "...", "size": "..."}],
 "proportions": {"head_height_vs_canvas": 0.0, "shoulder_width_vs_head_width": 0.0, "notes": "..."},
 "silhouette_signature": ["..."],
 "expression": "...",
 "quality_contract": {"target": "stylised flat-colour bust reconstruction", "must_nail": ["..."], "acceptable_approximations": ["..."]}
}"""

text = vision_call(
    "intake_correction1", RUN / "test_subject.png", PROMPT, max_tokens=3000
)
(RUN / "intake_correction1_raw.txt").write_text(text)
t = text.strip()
if t.startswith("```"):
    t = t.split("```")[1]
    t = t[4:] if t.startswith("json") else t
try:
    d = json.loads(t)
except Exception as e:
    print("PARSE FAIL:", e)
    print(t[:600])
    sys.exit(1)
(RUN / "intake_corrected.json").write_text(json.dumps(d, indent=1))
print("CONFIRMED:", *d.get("corrections_confirmed", []), sep="\n  ")
print("\nZONES:", [z["name"] for z in d.get("zones", [])])
print("SIGNATURE:", d.get("silhouette_signature"))
print("EXPRESSION:", d.get("expression"))
