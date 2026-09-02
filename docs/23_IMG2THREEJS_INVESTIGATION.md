# 23 — img2threejs Investigation (photo → procedural Three.js avatars)

**Date:** 2026-09-02 · **Investigator:** qalcode autonomous session (timeboxed)
**Source repo:** `~/projects/github_repos/_new_aug2026/img2threejs` (read-only, v1.5.1, Apache-2.0)
**Status:** §1–§2 complete · §3 prototype in progress · §4 recommendation drafted from §1–§2

---

## §1 What it actually is (facts, verified against the repo)

**The single most important fact: img2threejs is NOT a photo→3D ML model. There are no
neural weights, no inference runtime, no mesh extraction.** It is an **LLM-agent skill**
(a curated pack of markdown contracts + ~90 deterministic Python scripts) that drives a
host agent (Claude Code / Codex / OpenCode) to **write procedural TypeScript Three.js
code** that reconstructs the object in a reference image. "Reconstruction-by-code, not
photogrammetry, mesh extraction, or downloaded art packs" — their own words.

| Question | Answer |
|---|---|
| Photo→3D face? | No dedicated face model. Characters route through an "anatomy-aware track" (head-unit proportions, landmark grid overlay, 5-stage hair subsystem with a hard scalp-exposure gate). Likeness-maximization is an **opt-in** path: parametric template fit to landmarks + de-lighting + camera-match + photo projection onto the mesh, with per-region confidence. The README is blunt: *"characters are stylized reconstructions, not photoreal likeness."* |
| Photo→3D body? | Stylized humanoid yes (see live demos: girl-character, low-poly-humanoid). Optional multi-view **visual hull** (≥2 orthographic silhouettes → voxel mesh, unseen areas marked low-confidence). |
| Topology? | Procedural primitives + generated geometry (tapered-sweeps, cross-section rings, watertight capsules, implicit SDF patterns). The shipped girl-character uses **748 cross-section rings / 86,240 ring points** — all as code. Not quad topology, not retopologized scan mesh. |
| Mixamo rig? | **No.** v1.5 ships a skeleton **derived from the component tree** (chains: `spine/head/arm/leg/tail/wing/digit/prop`), bound to `SkinnedMesh` via **geodesic skinning** (weights from distance measured through the solid). Exposed as `root.userData.rig` (bones, one shared `Skeleton`, bone order + index map, `bound` flag). Bone names are **local joint ids** — the rigging contract explicitly allows mixamo names *only* as explicit alias maps (`mixamo:LeftArm → local joint id`), never inferred. **Mixamo compatibility is roadmap v1.8 ("The Animation Update"), not shipped.** |
| Animations shipped? | Runtime hierarchy with **pivots, sockets, colliders** (attach points for gear), and a `userData.tick` convention for looping idle animation. `THREE.Skeleton` + skin weights exist (v1.5) but there is **no animation clip system, no BVH/FBX retarget, no facial rig**. A separate `docs/GLB_CHARACTER_ANIMATION_PROMPT.md` exists for driving animation when you have a GLB reference. |
| Runtime? | Output = browser **Three.js** (a `createObjectNameModel(spec, options)` TypeScript factory returning `THREE.Group`). Tooling = **Python 3.10+ stdlib only** (no pip, no PIL/numpy — PNG I/O via `struct`/`zlib`). Generation **requires an LLM agent host with vision**; the Python scripts only validate/gate/package — they never judge visuals and never produce geometry themselves. |
| Licences — code | **Apache 2.0** (LICENSE verified). Grimoire docs, forge scripts, skills all in-repo. |
| Licences — weights | **N/A — there are no weights.** Optional "reference-fidelity evidence layer" (SAM2 masks, Depth Anything V2 priors, MediaPipe landmarks, Playwright) is opt-in tooling that "never approve a pass or silently provide geometry"; those carry their own upstream licences if installed. Generated output is code we author through our agent — no downstream licence contamination. |
| Cost to run | Their estimates: **~80k–180k model tokens per object**, **~150k–350k for a character** (landmark + projection checks + more review cycles). Dominant cost = render-review cycles (~5k–12k tokens each, 5–8 per pass). Requires browser screenshots for the vision loop. |
| Sample images in repo | **None.** `assets/` holds only the logo + sponsor SVGs. Reference images live in the separate **img2threejs-showcase** repo (github.com/img2threejs/img2threejs-showcase), which also contains the shipped demo factories as TypeScript. |
| Extras | GLB-reference route (`integrations/glb_character_pipeline`): a multipart GLB is used purely as a *measurement instrument* (never ships) to drive a procedural rebuild — needs `uv` + a showcase checkout. Resumable state via `forge/state.py` + `forge/next.py`. TRELLIS2 research doc exists (`docs/RESEARCH_TRELLIS2_TO_IMG2THREEJS.md`) — they looked at real photo→3D ML and documented why/how to bridge. |

### Pipeline (stage by stage)

```
stage1 intake   probe image → detail inventory (zones) → landmarks (chars) →
               camera-pose solve → de-light albedo → optional PBR/hair evidence
stage2 spec     pre-spec assessment (class/complexity/qualityContract) →
               ObjectSculptSpec JSON (component tree, materials, sockets, pivots) →
               validate --strict-quality  (fail-closed: blocks codegen on shallow specs)
stage3 build    pass-gated codegen: blockout → structural → form → material →
               surface → lighting → interaction → optimization  (one pass at a time)
stage4 review   comparison sheet (ref | render) → agent vision judges pass/fail →
               bounded self-correction (3 corrections/pass, 6 total default)
stage5 rig      skeleton derived from component tree → geodesic skin weights →
               payload-integrity gate → THREE.Skeleton bind
```

Scripts enforce; the model only judges and writes code. Output artifacts:
`ObjectSculptSpec` JSON + diffable TypeScript factory + comparison sheets.

---

## §2 Fit verdict for Reps With Friends

### Can output wear our mocap clips (mixamo-named BVH/anim clips)? — **NO (not today)**

- Our stack (`site/model-avatars.js`) retargets clips onto mixamo-named rigs
  (Soldier.glb, Xbot.glb) and hand-poses via aim/IK on arbitrary rigs.
- img2threejs v1.5 rigs use **component-tree local joint ids**, not mixamo names.
  The rigging contract's own rule — semantic aliases only via an explicit map —
  means retargeting our clips would require a **hand-written alias map per avatar**
  (mixamo bone → local joint id), plus rest-pose alignment (their rigs don't rest
  in a canonical mixamo T-pose AFAICT; chain lengths are envelope-derived).
- Our existing **aim/bend/ik2 procedural posing system** could drive an
  img2threejs rig *without* clips (it only needs bone rest directions), but every
  exercise pose would need re-tuning per avatar. Their `userData.tick` gives idle
  motion only.
- Verdict: **static/idle squad avatars = plausible; mocap-driven exercise reps =
  not viable until v1.8 or unless we build the alias-map retargeter ourselves.**

### Can output stand as squad avatars statically? — **YES, with caveats**

- Quality ceiling is "stylized reconstruction" — actually a decent match for our
  flat-palette game look (orc/Soldier palette-treated vibe), and code-only output
  is tiny (KBs of TS vs MBs of GLB), diffable, and has built-in sockets/colliders.
- Cost is the blocker for per-user generation: **150k–350k tokens + an agent host
  with a vision/browser loop per avatar.** That's a build-time production step on
  our infra, not an on-demand user flow.
- Privacy angle is a genuine win: **the photo never ships.** Output is procedural
  code with no texture bitmaps (code-only contract deliberately excludes texture
  images/normal maps), so no user pixels end up in the artifact — the reference is
  consumed at generation time and discarded (same philosophy as their GLB route).

### Bottom line

img2threejs is a **build-time avatar foundry**, not a runtime photo→avatar feature.
Strong fit for a curated set of stylized squad avatars (tiny, code-only, Apache-2.0,
no asset licences); zero fit today for user-uploaded-photo → animated workout buddy.

---

## §3 Prototype — DONE (lightweight pass; heavy route documented in §3.1)

**Constraint hit:** this session's host model has **no image input**, so the full
img2threejs vision-review loop could not run here. Shipped the honest fallback:
a *lightweight manual pass* using (a) the showcase's own written intake analyses
as the proportion/construction source, and (b) **programmatic palette sampling**
of the reference pixels (median-cut on region crops — deterministic, no vision
needed). This proves the integration architecture end-to-end; the full pipeline
runbook for a vision-capable host is §3.1.

### What shipped

| File | What |
|---|---|
| `site/models/photo_avatars/pantera.js` | Dual-sword warrior (from showcase `girl-character` ref + `analysis.md` intake): ~8 heads, ponytail sway, corset/skirt/gloves/boots, two crossed back swords w/ glint tick. Sockets: hand_L/R, scabbards, head. |
| `site/models/photo_avatars/mouse.js` | Electric mascot (showcase `electric-mouse-mascot` ref + registry component contract): capsule Body_Head_Main, dark-tipped ears (wiggle), specular-highlight eyes, red cheek discs (glow), open smiling mouth + tongue, zigzag tail. |
| `site/models/photo_avatars/monster.js` | Abyss wraith (showcase `monster` ref): hunched pale gaunt figure, long clawed arms, jaw idle, eye pinlight flicker, back spines. |
| `site/models/photo_avatars/index.js` | Registry (`PHOTO_AVATARS`) with descriptors. |
| `apps/avatars/index.html` | New "Photo avatars — img2threejs prototype" section (`#photoSection`/`#photoGrid`), same studio-section markup. |
| `apps/avatars/avatars.js` | Append-only strip block: lazy WebGL contexts (IntersectionObserver + 3s release + page-wide ctx budget `ctxRegister/ctxMakeRoom` — identical contract to the model cards), turntable toggle, per-card tick loop calling `userData.tick(t)`. Test hook `window.__rwfPhotoAvatars`. |
| `apps/avatars/test/photo_verify.ts` | CDP verification harness (same pattern as `model_verify.ts`): loads page, scrolls section in, asserts 3 cards render + tick contract + sockets, screenshots each card deterministically. |
| `apps/avatars/screenshots/photo_avatars_contact.png` | Evidence contact sheet — originals + brightness-lifted row (for human review). |

All factories follow the skill's runtime contract: component-named nodes
(`Body_Head_Main`, `Ear_L`, `Hand_R`…), pivots as `Group` joints, exposed
`userData.sockets`, and a `userData.tick(t)` idle. Each file's header records
its provenance chain (ref → palette sample → construction source) per the
skill's own reference-provenance discipline.

### Verification results (2026-09-02, headless chromium via CDP)

```
PHOTO AVATAR CARDS:
  Pantera — dual-sword warrior — renderer=true ctxLost=false tick=true renderMs=0.52 sockets=[hand_L,hand_R,scabbards,head]
  Sparky — electric mascot      — renderer=true ctxLost=false tick=true renderMs=0.38 sockets=[ear_L,ear_R,mouth,tail]
  Wraith — abyss creature       — renderer=true ctxLost=false tick=true renderMs=0.50 sockets=[hand_L,hand_R,jaw,head]
PASS — 3 cards, screenshots in /tmp/photo_av/
```

Pixel-level checks (objective, since the agent can't view images): mascot card
reads 19–21% bright-yellow pixels (p90 luminance 168–185); dark-palette
characters show highlight peaks (max 234/255 pantera, 255 wraith pinlights) —
they render, they're just *dark characters on the dark stage* by design. The
marauder-style warm lift was added for readability; further brightening is a
taste knob (see contact sheet). Run `bun apps/avatars/test/photo_verify.ts`
against the dev server to re-verify any time.

### Licence/provenance notes

- **Showcase repo has NO licence file** — its reference images carry no explicit
  grant, so **none were copied into our repo**. We used only (a) sampled colour
  *values*, (b) textual construction facts, (c) our own original code. Renders in
  the contact sheet are of our own factories. For production, use references we
  own/generate (genmedia characters are the natural source).
- img2threejs skill itself: Apache-2.0 — method contracts freely usable.
- Showcase CONTRIBUTING requires demo PRs to attest rights to the reference
  image — mirrors what our own pipeline policy should be (see §4).

### §3.1 Exact commands for the full (heavy) route — follow-up runbook

```bash
# 0. Host: Claude Code / Codex / OpenCode with image reading + a browser tool.
#    Skill install (symlink so hosts share one checkout):
ln -s ~/projects/github_repos/_new_aug2026/img2threejs ~/.claude/skills/img2threejs

# 1. Reference image (use showcase refs — no real people):
git clone --depth 1 https://github.com/img2threejs/img2threejs-showcase /tmp/showcase
# refs live under src/demos/<demo>/ (reference image per demo)

# 2. Init resumable state:
cd <workdir>
python3 ~/.claude/skills/img2threejs/forge/state.py init \
  --state .img2threejs/state.json \
  --reference /tmp/showcase/src/demos/<demo>/reference.png \
  --profile character --spec object-sculpt-spec.json

# 3. Drive the loop (agent-side, not a single command):
python3 ~/.claude/skills/img2threejs/forge/next.py --state .img2threejs/state.json
#   ...follow its printed next-command until exit code 3 (hard stop) or done.
#   Deterministic stages can be run directly:
python3 forge/stage1_intake/probe_image.py <image>
python3 forge/stage2_spec/new_pre_spec_assessment.py "Name" --image <img> --out assessment.json
python3 forge/stage2_spec/new_sculpt_spec.py "Name" --image <img> --assessment assessment.json --out spec.json
python3 forge/stage2_spec/validate_sculpt_spec.py spec.json --strict-quality
python3 forge/stage3_build/generate_threejs_factory.py spec.json --out src/createObjectModel.ts
#   Vision review needs screenshots: scripts/capture_threejs_playwright.py (Playwright optional dep)
#   Budget: 150k–350k model tokens per character, hours of wall-clock review cycles.

# 4. Port factory TS→JS module into site/models/photo_avatars/.
```

*(prototype results appended below once complete)*

---

## §4 Squad architecture recommendation — photo → avatar

**Recommendation: adopt img2threejs as a build-time avatar foundry for a curated
starter squad; do NOT make it the user-photo runtime path. Keep Geno + mocap as
the animated exercise core.**

### The two-lane architecture

```
LANE A — "Foundry squad" (build-time, curated, ships as code)          ← img2threejs
  user/genmedia reference image ──▶ agent host w/ vision (Claude/Codex)
       │  forge/ gates + spec + pass-by-pass codegen + review sheets
       ▼
  TypeScript factory → port to site/models/photo_avatars/<id>.js
       │  expose: pivots · sockets · userData.tick · (later) userData.rig
       ▼
  static/idle squad avatars — KBs of code, diffable, no user pixels shipped

LANE B — "Workout engine" (runtime, per-user, animated)                ← existing stack
  Geno mixamo-family rig + BVH/npz mocap retarget (site/model-avatars.js)
  aim/bend/ik2 procedural posing · wardrobe/heads bone-parented
```

Users see a foundry avatar as their *identity card* (profile, chat, streaks —
static + idle tick is plenty), while exercise reps are performed by the Geno
engine. This sidesteps today's hard blocker (v1.5 rigs are component-tree local
joints; **mixamo retarget = v1.8 roadmap**) instead of fighting it.

### Why this shape

1. **Cost curve.** 150k–350k tokens + a vision-loop agent per character makes
   per-user photo→avatar a premium/curated step, not an on-signup flow. Batch
   the foundry (e.g. 8 archetypes) once, then **differentiate cheaply**: the
   factories are code — parameterise palette (as `site/model-recolor.js` already
   does for orc colourways) and proportions from a per-user seed/photo sample
   (the palette-sampling script pattern from §3 generalises: photo → swatches →
   factory params, fully on-device).
2. **Privacy is architectural, not policy.** Code-only contract means the photo
   is consumed at generation and *nothing derived from pixels ships* — no
   texture bitmaps, no face geometry. The shipped artifact is a parametric
   stylised figure. On-device palette sampling (Lane A per-user step) keeps even
   that local; only hex codes + params leave the phone. This is materially
   better than photo→mesh pipelines for our verification/wearables story (docs/05).
3. **Squad fit.** `userData.sockets` matches our wardrobe/bone-parenting
   pattern (attach gear to sockets exactly like geno-wardrobe slots). When v1.8
   lands (mixamo compat), foundry avatars gain clip playback without a rebuild —
   bridge then is an explicit alias map (`mixamo:LeftArm → Shoulder_L`), which
   the skill's rigging contract already anticipates.
4. **Escapes the mesh ghetto.** No GLB licence vetting, no MB-size payloads on
   the phone app, and diffs are reviewable PRs. The showcase's character demos
   prove quality; the catch (3–23 MB of baked cross-section/rig data for
   max-likeness builds) is avoidable by staying stylized-low-poly like our §3
   prototypes (~10–15 KB each).

### Concrete next steps (ordered)

1. **Try one full-pipeline run** with a vision-capable host (runbook §3.1) on a
   genmedia-generated character (we own it end-to-end). Measure real token cost
   and wall-clock; decide foundry batch size from that number.
2. **Parameterise the §3 prototypes** — palette + proportion args per factory;
   add the palette-sampler as `scripts/avatars/photo_palette_sample.py` (kept,
   per repo rules) so per-user tint is deterministic and on-device-portable.
3. **figma-app players / site #squad**: consume `PHOTO_AVATARS` registry as the
   squad source; map `sockets` → wardrobe slots for gear.
4. **Re-check at v1.8** ("Animation Update": auto-rig, auto-skin, Mixamo
   compatibility, facial rig) — that's the moment foundry avatars can join
   Lane B exercise playback directly.

### Honest risks

- Stylized likeness ceiling: a single photo can't guarantee resemblance; the
  skill itself reports per-region confidence and asks for more views. For
  "this is me" identification, palette+silhouette is the realistic promise.
- Agent-dependence: the foundry needs a vision-capable agent per batch —
  budget and gate it like any CI job (state.py resume support helps).
- Upstream velocity: v1.6–v2.0 roadmap is ambitious; pin the skill version per
  foundry batch and record `generatedWith` (the showcase does exactly this).

---

## §5 The REAL run — photo → vision → code → gated avatar (2026-09-02, evening)

Founder: *"Are you not able to use images of people and do image2threejs?"* — this section is
the answer: a complete vision-driven run, executed for real, with every call logged
(`scripts/img2threejs_run/glm_transcript.jsonl`). Result: **avatar #4 "Beacon" live in the
/avatars photo strip**, gated 11/11 by deterministic pixel probes and 0.95/pass by the
vision model's own review.

### §5.1 The test subject (licence-clean by construction)

No showcase images were copied (repo IS Apache-2.0, but the run needed *known ground truth*
to score vision honestly). Instead: a flat-colour cartoon bust composed in PIL
(`make_test_subject.py`) — coral top-knot hair, sky eyes (left one under an asymmetric
fringe), gold-ringed headphones, purple hoodie with lime drawstrings + gold zip, drawn in
RWF design tokens. Every hex and coordinate is authored, so vision output is scored against
exact truth, not vibes. No person involved; the generator script is the source of truth.

### §5.2 Operational findings — which GLM can actually see (the big one)

| Route | Verdict | Evidence |
|---|---|---|
| `api.z.ai/api/anthropic/v1/messages`, `glm-5.3` + image block | **TEXT-ONLY.** Accepts the block, returns a fluent **confabulation** from priors | described our coral/purple bust as "crimson garment, grey-blue hair, cream accents" — 200 input tokens ≈ image ignored |
| Same shim, `glm-4.6` | **Confabulates too** (claims to see, answers wrong) | canary (magenta/teal split + white ring) → "grey top, black bottom, diamond" |
| `api.z.ai/api/paas/v4/chat/completions`, `glm-4.6v`, **zhipuai key** | **REAL VISION** | canary → "pink top, teal bottom, white circle" exact; image ~359 in-tokens |
| v4 vision on `zai`/`zai3` keys | blocked | HTTP 429 code 1113 "insufficient balance" — vision models need a funded key |

**Rules learned:** (1) the anthropic-compatible shim fronts text models only — never feed it
images; (2) always run a colour canary before trusting any "vision" endpoint — glm-4.6's
confident wrongness is more dangerous than a refusal; (3) vision = `-v` suffix models on the
native v4 API; here only the `zhipuai` key has vision balance. A second surprise: **the host
agent (this session) has no image input either** — so the skill's "agent vision" role was
delegated to glm-4.6v itself (intake AND render review), with deterministic PIL probes as the
ground-truth layer.

### §5.3 The loop as run (13 calls, 10.5k in / 43.6k out tokens)

```
1  canary ×4           → route discovery (above)
2  intake (glm-4.6v)   → palette 8/9 hex hits ≤ΔE60; but semantics misread:
                        headphones→"eye rings", drawstrings→"necklace", "tears"
3  correction ×1       → host-feedback pass (skill's refine-spec): recovered top-knot,
                        hair-vs-skin, hoodie collar/zip/shoulders, drawstrings
4  host arbitration    → pixel evidence settled cup placement at EAR height
                        (cups at head flank x-extremes; eyes are separate sky rects)
5  codegen (glm-5.3)   → 18-component spec + full module in our format (2 calls burned
                        on thinking-token ceilings; 3rd, module-only, completed)
6  gate render         → headless chromium (swiftshader), status-DOM + screenshot
7  pixel gate v1       → 7/11: caught 3 REAL defects (topknot swallowed by headphone
                        band; eyes buried inside head sphere r=1.0; metal gold rings
                        rendering black with no envMap)
8  vision review #1    → 0.85/pass — LENIENT: missed all three (called buried eyes
                        "slightly offset"). Vision alone is NOT a sufficient gate.
9  refine-code (host)  → knot lifted above band (1.58→1.80), eyes z 0.95→1.06,
                        rings de-metaled + emissive lift; fringe widened
10 re-gate             → pixel gate v2 bbox-relative 11/11 PASS
11 vision review #2    → 0.95/pass (palette/silhouette/headphones 1.0; flagged
                        drawstrings "not visible" — the pixel probe proves them present;
                        thin features at 480px — probe wins, complements confirmed)
12 strip gate          → registry test page: avatars=4 [pantera(37m), mouse(26m),
                        wraith(43m), beacon(24m)], all tick+sockets, zero errors
```

Artifacts: `scripts/img2threejs_run/` (generator, caller with key-fallback + JSONL
transcript, canary, intake JSONs, spec, module, gate pages, pixel gate, screenshots,
reviews). Module landed: `site/models/photo_avatars/generated/beacon.js` (provenance
header in-file); wired in `site/models/photo_avatars/index.js`.

### §5.4 Costs & scaling verdict — "player photos as avatars"?

- **Actual spend this run:** ~54k tokens total, of which only ~24k was productive
  (canaries, confabulation test, and glm-5.3's invisible thinking-token burn on two
  truncated attempts were tuition). **Repeat-run floor: ~15–24k tokens/avatar** for a
  bounded bust with one correction pass — vs the skill's own 150k–350k estimate for a full
  gated character. Wall-clock: ~8 min API + a few min host gating, unattended.
- **What breaks at scale:** (a) intake semantics on flat/stylised art misreads
  accessories — expect 1–2 correction passes per avatar, more for photos (faces have
  priors, which cuts both ways); (b) the vision reviewer is generous — deterministic
  probes must own the gate; (c) glm-5.3 codegen wastes ~40% tokens on hidden reasoning;
  prompt for code-only output; (d) only ONE key on this machine has vision balance.
- **Verdict:** YES, the pipeline is real and cheap enough for founder demos and small
  batches (a "photo booth" at onboarding: player selfie → stylised bust in ~10 min for
  well under a cent of tokens). NO for photoreal "this is me" likeness from one photo —
  output is palette+silhouette stylisation, exactly as the skill's README warns. The
  honest product framing: **"your photo becomes a stylised RWF-palette bust"**, with the
  same tick/sockets contract as every other avatar in the gallery.
- **Next step if we productise:** batch harness around `glm_call.py` + `pixel_gate.py`
  (both stdlib-only, already key-fallback aware), queue user photos, human-review the
  top-3 renders, land winners into `photo_avatars/generated/`.

---

*End of investigation. §1–§4 complete; §5 REAL vision-driven run complete —
`/avatars` photo strip now shows 4 avatars: 3 manual prototypes + 1 fully
vision-generated (Beacon). Transcript + evidence in `scripts/img2threejs_run/`.*

