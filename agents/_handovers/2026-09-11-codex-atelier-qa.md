# Atelier visual QA — Codex pass (blocked before fresh render)

Date run: 2026-09-10 (Australia/Sydney)

## Verdict

**Not signed off. No geometry or pose changes were made.** The execution
sandbox denied all local socket operations, so the mandatory CDP
screenshot/read/fix/re-shoot loop could not be performed. Making visual
changes without seeing a current and fixed render would violate the brief's
ground-truth rule.

The unrelated pre-existing worktree changes in `apps/figma-app/version.js`
and `apps/web/dist/main.js` were left untouched.

## Fresh-render blocker

- `http://localhost:4173/atelier` is already bound on port 4173, but a local
  HTTP request fails with `Operation not permitted` in this sandbox.
- The repository CDP runner (`bun apps/atelier/test/founder_check.ts`) exits
  with `chromium never came up`.
- Direct Chromium with the mandated `--use-gl=angle --use-angle=vulkan`
  flags exits 133 before page load:
  `crashpad/util/linux/socket.cc:45] setsockopt: Operation not permitted`.
- Disabling crash reporting/crashpad/breakpad and trying single-process /
  no-zygote mode did not bypass the environment-level socket denial.

## Visual findings from the latest repository evidence (not a fresh baseline)

Images read directly:

- `apps/atelier/shots/fullkit_v9.png`
- `apps/atelier/shots/expr_frog_{happy,grumpy,surprised,sleepy,cheeky,determined}.png`
- `apps/atelier/shots/pose_v7_{squat,pushup,jumpingjack,curl}.png`

### Garments

- The shirt neckline does not read as a finished collar. White body/neck is
  exposed in an irregular crescent and there are lime shards at both
  shoulder-neck junctions.
- The waistband is visually fragmented: dark pieces, skin/void gaps, and
  coral intrusions appear around the front waist. It does not read as one
  continuous band.
- Shirt and shorts hems have outward triangular fins/spikes in several poses,
  especially jumping jack and curl.
- Shoe uppers show white flesh/toe wedges and broken-looking ankle openings in
  exercise poses.
- The shorts silhouette varies from skirt-like in the standing full-kit shot
  to separated legs in exercise shots; the crotch and inner hems need a
  deliberate visual pass at locomotion extremes.

### Frog head

- The eye system does not read as alive. Pupils dominate the bulbs, point in
  inconsistent directions, and the thick green eyelid arcs float above the
  eyeballs like handles.
- The face is extremely wide and flat; tiny nostrils plus the heavy black
  mouth bar make several expressions read as swaps of a moustache-like piece
  rather than characterful frog expressions.
- Happy/grumpy/sleepy/determined remain insufficiently distinct at a glance.
- The crown sits plausibly on the centreline in the exercise evidence, but
  crown/head clearance must be checked through walk yaw and prone poses.
- In the push-up evidence the head/crown is at or beyond the stage edge and
  visually collides with the ground; this needs pose-vs-camera and actual
  ground-clearance measurement.

### Poses

- Squat, jumping jack, and curl have broadly readable silhouettes in the old
  evidence; no obvious backward elbow is visible there.
- Push-up is not acceptable as presented: the head/crown intersects or falls
  below the ground plane, and the pose reads partly side-lying because of the
  head placement.
- Garment/shoe failures obscure a confident foot-slide verdict; fresh
  frame-stepped locomotion evidence is required.

### Presentation

- The opening explanation and five-generation story are much longer than the
  working surface. The control rail is conceptually clear, but the primary
  atelier viewport/controls should be encountered before the historical
  narrative (or the narrative should default collapsed and stay compact).
- The UI copy says five skins while the requested founder pass calls for three;
  the intended release set should be made explicit before deleting or hiding
  options. Nothing was removed.

## Required continuation in a socket-enabled session

1. Run a fresh <=1300 px CDP matrix for all build-up steps, every `GENO_CLIPS`
   animation at strain extremes, and all four exercise poses with frame-step.
2. Capture frog front / three-quarter / walk for the intended three release
   skins, all six expressions, and crown clearance.
3. Fix only after comparing those renders; save paired evidence with the
   `_codexqa` suffix.
4. Re-run every direct `apps/atelier/test/*.ts` suite, the in-page Verify
   button, attachment probe, and console-error collector.

## 2026-09-10 continuation — fresh evidence and implementation

Fresh evidence reviewed at native resolution (whole-frame and detail):
`codex_evidence/01-fullkit-standing`, `02-walk-mid`, all four `03-pose-*`,
and `04-frog-{happy,cheeky,grumpy,sleepy}`. It confirms the original garment,
frog-face, and prone-pose findings against the current state. In particular,
standing shorts merge into a skirt panel while the moving poses expose the
unstable inner edges; the push-up crown is effectively on the floor; and the
four shown frog expressions are differentiated mostly by floating brow/lid
bars rather than eyes and mouth.

### Fix log (awaiting orchestrator re-shoot)

- **Shirt collar — `site/models/geno-derived.js`:** reversed the four collar
  rings to run crownward → true neck base before the torso continues downward.
  Previously the lattice ran base → crownward and then connected back down to
  the torso-base row, making a self-folding seam. **Expected:** a compact,
  continuous lime rib band on the neck surface, with no white crescent and no
  lime trap shards in standing, walk, jack, or curl.
- **Waistband continuity:** fabric mode now builds the waistband as one closed
  four-ring regular lattice, overlapping the shirt above and shorts below;
  fitted mode retains the archived extraction path. **Expected:** one solid
  charcoal belt around the full waist, with no front dark fragments, voids,
  skin, or coral breaks.
- **Hem fins/spikes:** reduced the three free-ring physics weights from
  `0.2/0.5/1.0` to `0.12/0.28/0.45`. The construction remains loose, but a
  single lip vertex can no longer travel the full 2 cm clamp at an extreme.
  **Expected:** softly moving hems whose ring silhouette stays rounded in
  jumping jack and curl, without outward triangular fins.
- **Shoes:** lowered the white sole-wall heel/toe profiles and made the toe
  wall equal to the low mid-wall (`2.4/1.3/1.3 cm` vs `3.4/1.5/2.6`). The
  charcoal upper remains the foot-enclosing surface. **Expected:** no white
  wedge climbing over either toe; a clean dark upper and readable ankle cut
  in squat, jack, curl, and push-up.
- **Shorts silhouette:** moved each leg tube's inner cap to its own side of
  centre (`±0.8 cm`) while retaining the pelvis flap/crotch bridge. **Expected:**
  two deliberate leg openings at stand and a stable small bridge at the
  crotch, instead of a skirt at rest and suddenly separated shorts in poses.
- **Frog head — `site/models/frog-heads.js`:** narrowed/deepened the skull and
  snout, brought turrets inward, reduced pupils from 3.0 to 1.75% H, aimed both
  toward one forward target, shortened the lid cap onto the globe, reduced
  brow thickness/float, and halved the mouth tube radius. Existing expression
  curves/lid coverage remain intact. **Expected:** focused, lively eyes;
  eyelids reading as globe occlusion; a less flat face; legible smile, smirk,
  frown, and sleepy line rather than a black bar; four expressions distinct
  at thumbnail scale.
- **Push-up — `site/model-avatars.js`:** raised the toe-pivot ground target
  from 2% to 6.5% H and the key-chain clearance target from 6% to 11% H so the
  clearance calculation allows the frog cranium/crown envelope, not only the
  Head bone origin. **Expected:** crown and head visibly above the floor for
  the full rep, with the rigid torso supported as a prone plank rather than
  visually resting on its side/head.

### Local verification

- `git diff --check`: pass.
- Browser-target bundle check for all three changed modules: pass.
- Pure suites (`packages/game-core/test` plus socket-free bot-core suites):
  183 pass, 0 fail.
- Root `bun test`: 268 pass; cannot complete in this sandbox because tests
  that bind local sockets fail with `Bun.serve ... Failed to start server`,
  plus two pre-existing deploy test import errors. No failure identified in
  the changed atelier modules.
- Browser atelier probes and visual confirmation remain assigned to the
  orchestrator as requested.

## 2026-09-10 re-judgment — `codex_evidence2`

All ten replacement PNGs were read at their native 1385×1066 resolution and
compared to the expected outcomes above.

### Seven-fix verdicts

1. **Shirt collar — not fixed.** The self-folding lime shards at the centre
   neck are improved, but the visible collar is still a broad white/grey
   crescent in standing, squat, jack, and curl. Small white shoulder/trap
   cutouts also remain; it does not read as the requested continuous lime rib.
2. **Waistband continuity — not fixed.** A charcoal belt exists, but its
   visible face is repeatedly occluded by alternating lime and coral triangles
   in standing, walk, squat, jack, curl, and every rear expression frame. It
   does not read as one continuous band.
3. **Hem fins/spikes — not fixed.** Isolated downward/outward lime teeth remain
   around the shirt hem, most clearly in walk and curl and still visible in
   standing/jack. The coral shorts edges are calmer, but the stated all-hems
   outcome is not met.
4. **Shoes — fixed.** The dark uppers enclose the feet in all six full-body
   frames. The white material is confined to a thin sole/rim and does not climb
   over either toe; ankle cuts remain readable. Some sole-edge aliasing is a
   residual presentation issue, not the former exposed-toe wedge.
5. **Shorts silhouette — fixed.** Standing and all rear idle frames show two
   deliberate leg openings with a small centre bridge/seam. Squat, jack, curl,
   and walk retain recognizable separate legs rather than changing from a rest
   skirt into disconnected pose geometry. The loose front panels still overlap
   visually at some angles, which is consistent with draped shorts.
6. **Frog head/expressions — partially fixed (evidence incomplete).** The
   standing three-quarter frame shows smaller, jointly focused pupils, eyelids
   seated on the globes, a narrower/deeper head, and a thinner curved happy
   mouth: those visible parts are materially improved. However, all four files
   named `04-frog-{happy,cheeky,grumpy,sleepy}` show only the back of the head,
   so smile/smirk/frown/sleepy differentiation cannot be judged at any scale.
   This pack cannot support a full pass for the expression fix.
7. **Push-up clearance — fixed.** In the prone frame the frog cranium and eye
   turret are visibly above the stage, with the torso held in a recognizable
   prone support. The crown is not visible from the rear camera, so exact crown
   clearance remains a minor evidence risk, but the former head-on-floor/
   side-lying failure is gone.

### Regression checks

- **Walk:** no pose regression; the mid-stride silhouette remains readable and
  the planted/trailing feet remain attached. Garment hem artifacts persist but
  are covered by the failed hem verdict above.
- **Squat silhouette:** no regression; knee/hip flexion and balance remain
  readable, with no backward elbow.
- **Attachment:** no regression visible. Head, garments, hands, and shoes stay
  with their intended anatomy in all ten frames, and the overlay still reports
  `attached <2 cm`.

### Follow-up implementation (awaiting final re-shot)

- **Collar:** increased the fabric rib height from 1.5 cm to 3.0 cm so the lime
  collar reaches under the oversized head and covers the exposed neck-base
  crescent. **Expected:** a visible continuous lime collar in standing, walk,
  squat, jack, and curl, without the broad white/grey neck band.
- **Waistband:** increased its regular shell offset from 15/16 mm to 22/23 mm.
  The band now clears the animated +11–18 mm shirt/shorts lips instead of
  relying on a few millimetres of depth separation. **Expected:** an unbroken
  charcoal belt face around the waist with no lime/coral triangle occlusion.
- **Hem coherence:** set the three secondary-motion weights to zero. The
  skin-weighted constructed lattice continues to move with the avatar, while
  finish-ring vertices can no longer peel away independently into teeth.
  **Expected:** rounded, coherent shirt/sleeve/shorts edges in stand, walk,
  jack, and curl, with no isolated triangular fins.

No additional frog or push-up change was made: the visible frog geometry and
prone clearance improved as intended. A final evidence round must shoot the
four expressions from the front or three-quarter view; rear views cannot close
that verdict. Atelier QA is **not signed off** pending that final visual check.

### Re-judgment verification

- `git diff --check`: pass.
- Browser-target bundle check for all three atelier modules: pass (10 modules).
- Pure portion of `bun test packages/game-core/test packages/bot-core/test`:
  183 pass. The remaining 25 tests are the same socket-dependent Beeper/API
  cases and fail because this sandbox cannot start `Bun.serve`; no changed
  atelier module is implicated.

## 2026-09-10 final atelier round — `codex_evidence3`

All ten PNGs were read at native 1385×1066 resolution, including the four
page-reloaded, home-camera front expression takes. **Atelier QA is not signed
off:** six of the seven acceptance areas pass, but collar continuity still
fails visibly.

### Final seven-area verdict

1. **Collar continuity — fail.** The 3.0 cm rib is taller and the centre seam
   remains coherent, but white neck/trap cutouts are still plainly visible at
   the throat and shoulder-neck junctions in standing, walk, curl, jumping
   jack, squat, and all four expression frames. It therefore does not yet read
   as a continuous lime collar.
2. **Waistband continuity — pass.** The 22/23 mm shell reads as one continuous
   charcoal band in every full-body and expression frame. There are a few
   sub-pixel/small edge intersections from the neighbouring cloth at extreme
   angles, but no return of the former fragmented belt or skin/void gaps.
3. **Hem fins — pass.** With secondary motion disabled, the shirt, sleeves,
   and shorts retain coherent folded edges across stand, walk, curl, jack,
   squat, and push-up. The draped edges remain mildly irregular by design, but
   no isolated triangular fin peels away from a finish ring.
4. **Shoes — pass.** Dark uppers enclose both feet throughout; white stays on
   the sole/rim and the ankle cuts remain readable. No exposed-toe wedge has
   returned.
5. **Shorts silhouette — pass.** Two leg openings and the small centre bridge
   remain deliberate at rest and through walk, squat, jack, curl, and prone
   poses. The shorts do not collapse back into a skirt or disconnect.
6. **Frog face/expressions at a glance — pass.** The front-view evidence closes
   the prior evidence gap. Happy is an upswept smile, cheeky is a one-sided
   smirk, grumpy is a downturned frown with lowered lids, and sleepy combines a
   flat mouth with heavy lids. The four read distinctly at full-frame scale;
   pupils remain small and jointly focused and the lids stay seated on the
   globes.
7. **Push-up clearance — pass.** The head/turret envelope is visibly above the
   stage and the body reads as a supported prone plank, with no return of the
   head-on-floor/side-lying failure. The rear view still does not expose every
   crown extremity, but nothing visible intersects the ground.

### Regression check

No new regression is visible in the ten-frame matrix: walk remains attached
and readable; squat, jack, and curl retain coherent limb silhouettes with no
backward elbow; head, hands, garments, shorts, and shoes remain attached; and
the on-screen attachment probe continues to report `attached <2 cm`. The
minor residual presentation risks are sole-edge aliasing, small cloth/band
edge intersections at extreme angles, and the push-up camera not proving the
hidden crown extremity.

### One final targeted fix (awaiting re-shot)

Only neckline clearance was changed in `site/models/geno-derived.js`: the
shirt's collar-level clearance was increased from 6 mm to 12 mm and the lime
rib clearance from 3 mm to 10 mm. Height, ring order, waistband, hems, shorts,
shoes, frog geometry, and poses were left unchanged. **Expected outcome:** the
collar and adjacent shirt surface remain outside the animated neck/trap
envelope, replacing the persistent white throat/shoulder wedges with a
continuous lime neckline in stand, walk, curl, jack, squat, and front idle
views without disturbing the six areas that already pass.

---

## ORCHESTRATOR NOTE — 11 Sep (final round queued)

Codex usage limit hit (resets 03:56). State at pause:
- Round 2 verdicts: shoes ✓ shorts ✓ push-up ✓; stronger collar/waistband/hem
  follow-ups applied but UNJUDGED (evidence3 captured, frog expressions now
  front-view after Codex caught the rear-view capture).
- derived_v6 probe: 17/18 — "graded offsets wired" FAILS after the
  hem-secondary-motion disable (the drape grading may be collateral — judge
  whether the founder-approved "hanging loose" survived). Also note the
  walk-50% shoe/toe region numbers (lifted-foot case, historically ungated).
- FINAL ROUND (when Codex resets): judge evidence3, verdict all 7 areas,
  resolve the graded-offsets question, then sign-off or one more fix.
