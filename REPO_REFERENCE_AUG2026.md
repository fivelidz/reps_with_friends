# External Repo Reference — Aug 2026 Batch
> For AI agents working in this project. Cloned/analysed 2026-08-27.
> Library: ~/projects/github_repos/_new_aug2026/ · Analysis: summaries/ there.

Context: reps_with_friends is a **commercial** social-fitness product (browser avatars in three.js, `site/avatar-styles/*` on an exercise rig; `apps/avatars`). Avatar work is an active investigation — see `notes_avatars_investigation.md` (2026-08-28): the goblin/dragon post-mortem found the *look* failures (palette, proportions, lighting, camera, world context) and demanded "evaluate in a game context, verify rendered pixels". This batch of Meta FAIR motion/animation repos answers the *other* half — **where body motion comes from** (mocap → retarget → synthesis → playback). License reality is the headline:

**⚠️ LICENCE VERDICT (commercial app):**
- **Momentum — MIT ✅ USABLE** (build-time tooling: retargeting, IK, mocap cleanup, GLB IO).
- **AI4AnimationPy — CC BY-NC 4.0 ❌ UNUSABLE in product** (patterns/architecture reference only).
- **Metamotivo — CC BY-NC 4.0 ❌ UNUSABLE** (code *and* HuggingFace weights; idea reference only).
- **HumEnv — CC BY-NC 4.0 ❌ UNUSABLE** (plus its AMASS/SMPL data inputs are research-licensed too).
Only one of four can touch the product. Plan accordingly.

### Momentum (404⭐, MIT ✅)
- **Local clone:** `~/projects/github_repos/_new_aug2026/Momentum/` · analysis: `summaries/21_momentum.md`
- **What it is:** Meta's kinematics + optimization library (C++, Python `pymomentum` via pip/conda/PyPI): Gauss-Newton IK family incl. **fully differentiable IK** error functions, **mocap marker tracking + gap-filling**, batched Triton GPU FK, and motion IO for **GLTF/FBX/BVH/USD/URDF**. Actively maintained (pushed 2026-08-26). No weights, no ML — pure math/geometry.
- **Use here (avatar pipeline, commercial-safe as offline tooling):**
  1. **Retargeting engine**: retarget any source skeleton (BVH/FBX/GLB mocap, licensed motion libs) onto our rig — humanoid *and* the creature rig from the dragon post-mortem — via differentiable IK with pose priors, then **export GLB** for the web. Runs at build time on the dev machine; only GLB output ships.
  2. **Mocap cleanup**: marker gap-fill + pose priors are the right tools for smoothing noisy captured exercise motions before they become avatar clips.
  3. **Batched FK** for generating thumbnail/preview poses of avatar variants server-side if we ever render previews outside the browser.
- Safety: static scan clean (subprocess only in codegen/build scripts); no runtime downloads; no network in library. Note: our clone needed a worktree rebuild after an interrupted partial clone (fixed).

### AI4AnimationPy (2080⭐, CC BY-NC 4.0 ❌ product)
- **Local clone:** `~/projects/github_repos/_new_aug2026/Ai4animationpy/` · analysis: `summaries/22_ai4animationpy.md`
- **What it is:** official Python AI4Animation (Starke): full neural-animation framework — mocap import (GLB/FBX/BVH→**NPZ**), feature modules (root/contact/future-window), MLP/Autoencoder/**Codebook-Matching** motion synthesis, FABRIK IK, built-in renderer, 14 demos (style-conditioned biped/quadruped locomotion, drag-guided authoring with in-repo weights).
- **Use here (patterns only — reimplement, never vendor):** this is the blueprint for the avatar **motion-synthesis layer**: `mocap → npz → feature modules → small MLP/CxM → GLB → three.js playback`. Directly answers investigation finding #7 ("wrong pose & motion context — frozen mid-squat"): the rig needs a *motion library with styles and anticipation*, not a static squat pose. Adopt: (a) NPZ-style motion interchange (pos+quat per joint per frame — three.js-consumable), (b) contact/root feature design for exercise-specific data (squat/press contact phases), (c) style latent → motion for tier-flavoured avatars (couch→athlete motion personality), (d) future-window inputs for anticipatory idle→rep transitions. All reimplemented in our own TS; zero file copying.
- Safety: scan clean; demo weights (60MB) committed in-repo, no runtime fetching; FBX path gated by Autodesk SDK (avoid). ⚠️ Also: its recommended datasets (LaFan, ZeroEggs, 100Style-retarget, Motorica-retarget…) are research-licensed — do **not** train commercial avatars on them; buy/licence commercial mocap or capture our own.

### Metamotivo (784⭐, CC BY-NC 4.0 ❌ product)
- **Local clone:** `~/projects/github_repos/_new_aug2026/Metamotivo/` · analysis: `summaries/19_metamotivo.md`
- **What it is:** "behavioral foundation model" controlling an SMPL humanoid in MuJoCo zero-shot, prompted by reward/goal/reference-motion latents; 6 HF checkpoints (24.5M–288M), CPU inference.
- **Use here:** idea bank only — e.g. *tracking prompts* (any reference clip → latent → character follows it) as the conceptual shape of "user does squat → avatar mirrors with their creature body". Physics-based reactive avatars ("avatar gets tired") are **not** shippable from this code, and MuJoCo server-side physics is wrong for our browser budget anyway. Keep as research reading.
- Safety: scan clean; **weights + buffers download from HuggingFace at runtime** — and are NC-licensed, so unusable regardless.

### HumEnv (123⭐, CC BY-NC 4.0 ❌ product)
- **Local clone:** `~/projects/github_repos/_new_aug2026/Humenv/` · analysis: `summaries/20_humenv.md`
- **What it is:** MuJoCo SMPL-humanoid RL environment with 10 skill reward classes and reward/goal/**motion-tracking** benchmarks (AMASS-based).
- **Use here:** one transferable idea — their **motion-tracking eval metric** (how well does the controlled body follow a reference motion) is the objective definition for scoring *form quality* of a user's exercise (BlazePose track vs reference squat). Reimplement the metric idea client-side in TS; no code, no AMASS.
- Safety: scan clean, no network; AMASS/SMPL data research-gated.

## Quick wins
1. **Spike a MIT-licensed retarget step with `pymomentum-core`**: take one BVH/GLB exercise clip (self-captured or commercially licensed), retarget onto the goblinfit rig, export GLB, play it in `/avatars` — first real motion on a web avatar, zero licence risk.
2. **Define the house motion asset format now** (AI4AnimationPy pattern): NPZ/GLB with pos+quat per joint per frame + contact labels; every future clip source funnels through it.
3. **Exercise contact-phase features** (squat descent/bottom/ascent, press lockout) as first-class motion metadata — enables form-scoring (HumEnv's tracking-metric idea) *and* cleaner avatar state transitions (idle→rep).
4. **Style-latent toy model** in TS: condition a small motion-interpolation/policy on a 4–8 dim style vector (Couch→Athlete tiers already exist in game-core handicap logic — motion personality should follow the same tiers).
5. **Commercial mocap sourcing checklist** before any training: self-capture (MediaPipe/BlazePose recordings of the team), or paid libraries; explicitly ban NC datasets (AMASS, LaFan, ZeroEggs, 100Style) from the pipeline docs.

---
*One-line licence summary: Momentum (MIT) is the only dependency-safe repo; AI4AnimationPy/Metamotivo/HumEnv are CC BY-NC 4.0 — fine to read, illegal to ship. Full per-repo detail: `~/projects/github_repos/_new_aug2026/summaries/19..22_*.md`. Read together with `notes_avatars_investigation.md` (look/palette) — this file covers the motion half of the avatar plan.*
