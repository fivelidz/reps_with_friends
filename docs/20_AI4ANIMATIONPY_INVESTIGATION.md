# 20 — AI4AnimationPy Investigation (model movements)

**Date:** 2026-08-31 · **Requested by:** founder ("look up the repo ai 4 animation py … as an investigation on model movements")
**Repo:** `facebookresearch/ai4animationpy` — local clone `~/projects/github_repos/_new_aug2026/Ai4animationpy` (last commit `bfb5866` 2026-08-14, full clone = GitHub state; `.gitignore` only excludes an `Assets/` scratch dir, nothing else is withheld).
**Verdict up front:** the repo is *not* CMU-derived as we had assumed — its Geno motions are **100STYLE** captures retargeted to Geno by `orangeduck/100style-retarget`, and that correction makes the expansion path much better than CMU: **five public BVH datasets already live on Geno's exact skeleton**, one `convert` command away from our clip pipeline. Both untapped captures were analysed; three new clips are now shipped (§3). One licensing flag: the repo and the **Geno mesh are non-commercial**; the motion *data* is CC BY 4.0 (§6).

---

## 1. What the repo is

AI4AnimationPy (Meta / Paul Starke & Sebastian Starke) is the **Python/NumPy/PyTorch port of AI4Animation** (the Unity framework behind PFNN/MANN/DeepMimic-era demos) — training, inference, feature extraction and visualisation in one environment, keeping a game-engine-style architecture (ECS entities, Update/Draw loops, optional built-in raylib renderer, headless + manual modes). License **CC BY-NC 4.0**, docs at facebookresearch.github.io/ai4animationpy. Stack: NumPy + PyTorch (+ pygltflib, raylib for rendering, sklearn in AI demos) — nothing browser-native, so for RWF everything must exit through an exporter (§5).

Package layout (`ai4animation/`): `AI/` (MLP, Autoencoder, CategoricalEncoderDecoder, **CxM** codebook-matching w/ FiLM blocks — FiLM is exactly the mechanism from the 100STYLE paper, DataSampler, AdamW/cosine optimizers) · `Animation/` (Motion class, **ContactModule**, RootModule, TrackingModule, **MirrorModule**, GuidanceModule, Dataset, TimeSeries, PID) · `Import/` (BVH/FBX/GLB importers + **BatchConverter** CLI) · `Export/GLBExporter` · `IK/FABRIK` (pole-target FABRIK) · `Math/` (vectorised FK/quats/splines) · `Standalone/` (renderer, cameras, input).

The interactive demos (`Demos/`) are the useful catalogue of techniques:

| Demo | What it demonstrates | Data/model it needs |
|---|---|---|
| `Locomotion/Biped` | **Gamepad-driven stylised locomotion** — NN predicts future pose sequences from root trajectory + guidance style; post-processor + LegIK (FABRIK) + contact-driven foot sync/timescale adaptation | ships pretrained: `Network.pt` 60.7 MB + `PostProcessor.pt` 1.6 MB (trained on "Style100" = 100STYLE), Geno model, 12 style guidances |
| `Locomotion/Quadruped` | Same architecture for a dog (gait transitions, action poses) | pretrained models + Dog/Wolf models, 9 guidances |
| `Authoring` | **Path authoring**: 3D A* path planner around obstacles → Catmull-Rom spline → the locomotion controller walks it in a chosen style | same Network.pt + guidances |
| `AI/MotionGrounding` | Trains an MLP mapping per-bone spatial grounding heatmaps (11×11) → poses | Cranberry motions (shipped) |
| `AI/SequencePrediction` | Future-motion anticipation (past 12 frames → next 6 samples) | Cranberry motions |
| `AI/Autoencoder`, `AI/ToyExample` | Motion autoencoding / framework toy | Cranberry / synthetic |
| `MotionEditor` | Dataset browser + feature visualisation (root, contacts, mirroring) | any npz dir |
| `MotionImport/{BVH,FBX,GLB,Import_LaFan,Import_MANN}` | Import pipelines with `Instructions.txt` recipes | shipped samples |
| `InverseKinematics`, `SplineInterpolation`, `ECS`, `Actor`, `Empty` | FABRIK arm IK, splines, ECS scaffolding | Cranberry |

## 2. Full motion inventory (shipped in-repo)

Format for all motions: world-space per-joint `positions (F, J, 3)` + `quaternions (F, J, 4)` (xyzw), `bone_names`, `parent_indices`, `framerate` — the exact format our `scripts/avatars/geno_npz_export.py` consumes.

**`Demos/_ASSETS_/Geno/Motions/` — 5 biped clips, Geno's 23-joint mixamo-family skeleton, 60 fps (the only directory we previously tapped):**

| File | Duration | Content | Status in RWF |
|---|---|---|---|
| `walk3_subject3.npz` | 246 s | walking | shipped as `demo_walk` |
| `run1_subject2.npz` | 238 s | running | shipped as `demo_run` |
| `sprint1_subject4.npz` | 273 s | sprinting | shipped as `sprint` |
| `aiming1_subject1.npz` | 239.5 s (14,367 f) | tactical aim-walk, see §3 | **now shipped as `aim_walk`** |
| `ground1_subject1.npz` | 158.1 s (9,483 f) | ground work, see §3 | **now shipped as `floor_scoot` + `get_down`** |

No subfolders, no additional subjects — those five are the complete set.

**`Demos/_ASSETS_/Cranberry/Motions/` — 5 biped clips, Cranberry's own 29-joint `b_*` skeleton, 120 fps (`.trk.npz`):** `Sh02 walking_forward` 53.8 s · `Sh03 walking_backward` 75.9 s · `Sh06 standing` 107.4 s · **`Sh11 crouching_transitions` 107.2 s** · `Sh13 VR_beatsaber` 66.2 s. Not directly consumable by our Geno-name pipeline (needs a bone-rename map, §5), but Sh11 is the standout for us: **two minutes of crouch/stand transitions — the closest thing to squat motion anywhere in the repo.**

**`Demos/_ASSETS_/Quadruped/Motions/` — 5 dog clips, 27 joints, 60 fps:** `D1_008` 17.9 s · `D1_031` 21.1 s · `D1_047` 18.0 s · `D1_047z` 45.9 s · `D1_058` 36.3 s (MANN dataset; Dog/Wolf models alongside). No RWF use.

**`Demos/MotionImport/BVH/WalkingStickLeft_BR`** — 91.4 s, 23 joints **already in Geno's skeleton** (LaFan1-derived "walking with a stick" — an assistive-device walk). Could flow through our exporter unchanged if we ever want a mobility-aid character; not exported now.

**`Guidances/`** (12 biped + 9 quadruped, ~1 KB each) — not motions but **style pose descriptors** (BigSteps, Chicken, Dinosaur, DragLeftLeg, HandsBetweenLegs, Idle, LeanRight, LegsApart, Neutral, OnHeels, Star, Zombie; Canter/Idle/Jump/Lie/Pace/Sit/Stand/Trot/Walk) that steer the locomotion NN. Interesting as evidence of how little data a style needs.

**Models shipped:** Geno `.fbx/.glb` (our `site/models/Geno.glb` is byte-identical), Cranberry `.fbx/.glb`, Dog/Wolf `.fbx/.glb`. **Pretrained NNs ship in-repo** (`Locomotion/Biped/Models/` and `Authoring/Models/`: Network.pt + PostProcessor.pt) — their headline demos run without training.

**Datasets the README points to (downloads, not in-repo)** — all retargeted to Geno by orangeduck except where noted:

| Dataset | Character | License (data) | Notes |
|---|---|---|---|
| [100Style retargeted](https://github.com/orangeduck/100style-retarget) | Geno | **CC BY 4.0** | the full ~14-subject/100-style set our 5 clips came from; authors Mason, **Starke** (repo author), Komura — which is *why* these clips ship here |
| [LaFan1 resolved](https://github.com/orangeduck/lafan1-resolved) | Geno | LaFan1 = CC BY 4.0 | Ubisoft LaFan: locomotion, **falling + getting up**, dance, fighting — very RWF-relevant |
| [ZeroEggs retargeted](https://github.com/orangeduck/zeroeggs-retarget) | Geno | ZeroEggs terms | acting styles ( laughing, crying, …) |
| [Motorica retargeted](https://github.com/orangeduck/motorica-retarget) | Geno | Motorica terms | NN-*generated* mocap, huge variety |
| [interact-retarget](https://github.com/orangeduck/interact-retarget) | Geno | — | a 5th compatible set the ai4animationpy README doesn't list |
| Cranberry (SIGGRAPH 2024) | Cranberry | non-commercial | full dataset much larger than the 5 shipped clips |
| NSM / MANN | Anubis / Dog | — | older AI4Animation training sets |

Known limitation of the whole Geno-retarget family: no finger motion (irrelevant to our 23-joint rig).

## 3. The two untapped captures — what they actually are

### `aiming1_subject1` — tactical aim-walk (239.5 s)
Statistics: standing 97 % of frames (hips 0.56–0.86 m, never below 0.5 m); slow travel (mean 0.60 m/s, p95 1.22) covering 144 m inside a 6×9 m area; **shoulder yaw sweeps the full ±180°** — the subject pivots and scans constantly; wrists held ~0.4 m forward of the body with **hands ~0.32 m apart** (two-hand weapon hold; wrist-wrist min 0.06 m, max 1.28 m during repositioning bursts). Twelve sustained (>3 s) steady aim-walk segments totalling ~70 s. In plain words: **a person walking slowly around a small area holding a rifle with both hands, turning to scan/aim — ready-stance patrol.**

*RWF relevance:* not an exercise, but a characterful **game-side walk** for coach/boss avatars patrolling the arena — clearly distinct from our neutral walk/run and reads as "game", which suits RWF's competitive framing. Also the closest two-hand forward-carry posture in any dataset we own.

**Exported → `site/models/geno_npz_aimwalk.json`** (loop found at t=22.3 s, 1.38 s period, 0.12 m/s; **pose error 0.077 rad — the cleanest loop in the entire dataset**, vs 0.186 for our walk). Registered `GENO_CLIPS.aim_walk` (group `mocap`). Label: "aim walk" — honest.

### `ground1_subject1` — side-lying ground locomotion (158.1 s)
Statistics: upright only for the first ~10 s; **91 % of the capture has hips below 0.35 m** (one continuous grounded segment 9.6 s → 155.9 s); spine (hips→neck) angle sits at 65–85° from vertical — i.e. **lying on the side**, propped slightly; 0 % inverted (never prone), 0 % sitting posture, **zero full-roll revolutions** — no log rolls; bursts up to 2.1 m/s with mean 0.20 m/s as the subject **drags themselves across the room with their arms** (head travels x +2.6 → −2.1 m over the capture); wrists spread cycles 0.17–0.67 m (reach-pull rhythm). The opening contains a clean **stand → side-lying descent** (9.0–11.0 s: hips 0.75 → 0.11 m in ~2 s). In plain words: **get down to the floor, then lie on your side and scoot/drag yourself around the room — no push-ups, no sit-ups, no rolls.**

*RWF relevance:* honest answer — it is *not* push-up/sit-up-adjacent motion. What it does give us: (a) the **get-down**, which is the actual prelude to every floor exercise we may ever demo (crunches, stretches, ground rest), and (b) a distinctive **floor-work idle/locomotion** — useful as a "recover on the ground" or comic avatar action, and proof our pipeline can ship grounded motion.

**Exported → two clips:**
- `site/models/geno_npz_floorscoot.json` — loop of the scoot cycle (t=107.6 s, 3.08 s period, 0.33 m/s, pose err 0.138 rad; scan restricted to the grounded phase 16–150 s). Registered `GENO_CLIPS.floor_scoot` (group `captures`), label "floor scoot (side-lying)".
- `site/models/geno_npz_getdown.json` — **one-shot** (8.5–11.5 s, 2.98 s, plays once and clamps) enabled by adding `hold: true` support for `type: 'json'` clips in `loadGenoClip` (`site/model-avatars.js`). Registered `GENO_CLIPS.get_down` (group `captures`), label "get down (one-shot)".

**Verification** (headless `bun scripts/avatars/geno_mocap_check.ts`, now covering all three): zero NaNs, correct pair matching (23/23 joints), all above ground (minY 0.046–0.075 m); `aim_walk` upright (upDot 0.99) with calm hips-bob 0.029 m; `floor_scoot` shows the expected large vertical range (0.634 m); `get_down` averages 0.39 upDot as a stand→lie descent should, and is the **most distinct clip in the entire set** (pairwise joint distance 0.55–0.85 vs everything else). The three pre-existing exports regenerated **byte-identical** (md5-checked) after the script refactor.

## 4. The repo's core tech — assessment for a browser fitness game

### Near-term, usable through our existing export pipeline (no new deps on the site)
1. **The conversion funnel** — `Motion.LoadFromBVH/FBX/GLB → SaveToNPZ` plus the multiprocess `convert` CLI (`BatchConverter.py`; recipe in `Demos/MotionImport/Import_LaFan/Instructions.txt`): any BVH/FBX/GLB in Geno joint names becomes npz in minutes, then our `geno_npz_export.py` turns interesting windows into site-ready JSON loops. This is the single most valuable capability for RWF right now (see §5).
2. **`MirrorModule`** — principled left/right mirroring (auto-detects symmetric joints, applies per-joint corrective rotations). The concept ports directly to our exporter: one extra job type that flips X and swaps L/R bone names doubles every exercise clip for free (left-dominant/right-dominant reps).
3. **`ContactModule`** — automatic foot-contact labels from velocity thresholds. Two uses for us: (a) objective skating metrics in `geno_mocap_check.ts` (already reimplemented there), (b) if we ever foot-lock in the browser, this is the reference labelling technique.
4. **`GLBExporter` (npz → GLB animation)** — world pos/quat → local TRS glTF channels. An alternative delivery format for our clips (smaller/faster than JSON quats, playable by `loadGLTFClip`), worth A/B-ing if clip count grows.

### Long-term, offline (PyTorch) — the actual research tech
5. **Style-conditioned locomotion controller** (`Locomotion/Biped` + pretrained `Network.pt`): predict pose sequences from root trajectory + a *style guidance pose*; post-processor + LegIK + contact-based foot sync make it game-ready. This is the productionised 100STYLE controller (FiLM feature-wise transformations). The RWF dream use: train on exercise-form mocap so avatars **transition walk → squat → press in one continuous controlled system**, steered by style descriptors instead of hand-blended clips. Requires: training data (see §5), GPU training runs, and an export path (their ONNX-era streaming is gone; we'd bake output sequences back into clips, or run the net server-side).
6. **`SequencePrediction`** (future-motion anticipation) — the mechanism behind seamless blending when you know where motion is going; directly relevant to rep-counting continuity (squat → squat without hitches).
7. **FABRIK IK (+ `LegIK` two-bone helper)** — clean, tiny, dependency-light algorithm we could reimplement in JS for foot planting or prop grasping if needed.
8. **`MotionGrounding` / `Autoencoder` / CxM codebook matching** — building blocks for learned motion representations; no text-to-motion anywhere in the repo (despite the name "MotionGrounding", it grounds *spatial target maps*, not language).

**Not present:** physics/rigid bodies (roadmap item), classical motion-matching search, text-driven generation. Anything neural is PyTorch-only — nothing runs in a browser without our baking it into clips/JSON first.

### Top-3 capabilities for RWF, ranked
1. **The Geno-retarget data funnel** (near-term clips: squats via Cranberry rename, falls/get-ups via LaFan1, style variety via 100Style/ZeroEggs/Motorica/interact).
2. **Mirror + contact tooling** for honest L/R exercise variants and quality gates.
3. **The style-conditioned controller + sequence prediction** as the long-term answer to fluid exercise-form animation (offline training, clip-baked delivery).

## 5. Expansion path — bigger than the "CMU question"

**Correction:** nothing in this repo is CMU. The five Geno clips are 100STYLE (confirmed by trial naming `{style}{take}_subject{n}`, the README dataset table, and orangeduck/100style-retarget). There is no CMU converter in the repo; the only "CMU" string in the codebase is an incidental mention inside `AdamW.py`.

**The actual path (turnkey):** download any orangeduck Geno-retarget BVH set →
```bash
convert bvh --definitions <repo>/Demos/_ASSETS_/Geno/Definitions.py FULL_BODY_NAMES --scale 0.01
```
(multiprocess batch; outputs the same npz schema we already consume) → add jobs to `scripts/avatars/geno_npz_export.py` → JSON clips in `site/models/`, entries in `GENO_CLIPS`. Priorities for RWF:
1. **LaFan1-resolved** — falls and **getting up from the ground** (pairs with our new `get_down`), plus dance/fighting;
2. **Cranberry `Sh11 crouching_transitions`** — squats. In-repo already; needs only a bone-rename pass (`b_root→Hips`, `b_l_upleg→LeftUpLeg`, … 23 of 29 map cleanly to Geno's names, extras `p_*_scap`, `*_wrist_twist` drop or fold) which the exporter can do at load time;
3. **100Style full set** — same five subjects' siblings plus ~100 styles (Zombie, Sneaky, Proud, Old… many are exactly "avatar personality" material);
4. ZeroEggs (acting), Motorica (generated variety), interact-retarget as needed.

**CMU (optional, second choice):** CMU BVH conversions (cgspeed) use the same mixamo-family joint names, so the identical `convert bvh --definitions … FULL_BODY_NAMES` route *should* ingest e.g. CMU's exercise/gymnastics categories after a name-order check on one file — worth a 15-minute trial if we specifically want jumping-jacks/push-up sources that the Geno-retarget sets don't cover. Do a license check per-category before shipping anything.

## 6. Licensing flag (pre-existing, now documented)

- **ai4animationpy repo: CC BY-NC 4.0** — code and shipped assets are non-commercial.
- **100Style-retarget motion data: CC BY 4.0** (same terms as the original 100STYLE dataset) — commercial use OK with attribution/citation (Mason, Starke, Komura 2022). LaFan1 also CC BY 4.0.
- **The Geno character mesh: "free for non-commercial research use"** (orangeduck repo). RWF's site already renders `Geno.glb` — if RWF ships commercially, the *motions* are fine but the **mesh must be swapped** to a licensed mixamo-convention rig (our BVHPlayer retargets by joint name, so any properly-named skeleton drops in). Cranberry/Dog/Wolf models carry the same non-commercial framing.

## 7. Files touched in this investigation

| File | Change |
|---|---|
| `scripts/avatars/geno_npz_export.py` | attribution corrected (100STYLE, not CMU); optional per-job scan-range; `ONE_SHOTS` mode; shared `emit_clip`/`load_npz` (old outputs regenerate byte-identical — md5-verified, backups in `site/models/archive/*_20260831.json`) |
| `site/models/geno_npz_aimwalk.json` | **new** — 42-frame loop |
| `site/models/geno_npz_floorscoot.json` | **new** — 93-frame loop |
| `site/models/geno_npz_getdown.json` | **new** — 90-frame one-shot (hold) |
| `site/model-avatars.js` | `GENO_CLIPS`: `aim_walk`, `floor_scoot`, `get_down`; `hold` honoured for json/bvh clip types; `geno-bvh` model's clip list extended; CMU→100STYLE comment fix |
| `scripts/avatars/geno_mocap_check.ts` | verification now covers the three new clips |
| `docs/20_AI4ANIMATIONPY_INVESTIGATION.md` | this document |

Repo rules respected: ai4animationpy treated read-only; atelier untouched (it auto-enumerates `GENO_CLIPS`, so the new clips appear there without edits); no commits; no new dependencies.
