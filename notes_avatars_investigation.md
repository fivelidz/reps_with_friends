# Avatar Investigation — why our attempts don't match Goblin Fort, and how to fix it

**Date:** 2026-08-28 · **Scope:** read-only investigation of `~/projects/game_goblin_village/game/` (the "goblin fort" game) vs our `/avatars` page (`site/avatar-styles/goblinfit.js`, `site/avatar-styles/dragon.js`).

**Method note:** the game was run headless (python http.server :8899 + headless Chromium CDP, pattern from `apps/avatars/test/shot.ts`) and captured successfully — it renders fine. This analyst model cannot view images directly, so all visual evidence below was extracted **programmatically**: in-page raycasting to locate characters on screen, and pixel sampling of the PNGs (exact hex values, pixel dimensions, silhouette maps). That is arguably stronger evidence than eyeballing. Key screenshots (ephemeral, in /tmp):

- `/tmp/gobshot_village.png` — village at default zoom (what the founder sees)
- `/tmp/gob_green_close.png` + `/tmp/gob_green_crop.png` — forced-green goblin, close-up, clear tile
- `/tmp/gob_body_raw.png` — the red "Chief" goblin close-up (initial village cast)
- `/tmp/av_cards.png`, `/tmp/card_goblinfit.png`, `/tmp/card_dragon.png` — our gallery cards

---

## 1. THE GAME'S LOOK (measured, not guessed)

### 1.1 The world the characters live in

| Element | Value (from code + pixels) |
|---|---|
| Camera | RTS orbit: **pitch −52° (looking down), yaw 45°, FOV 60**, default zoom 14 (range 3–28), looks at map centre (32, y, 32) |
| Clear colour / fog | `0x0a0a08` warm near-black; `FogExp2(0x0a0a08, 0.016)` |
| Sun | `DirectionalLight(0xfff0d0, 0.9)` from (40, 80, 30) — warm, from the same quadrant the camera looks from |
| Ambient | `AmbientLight(0x9090a0, 0.7)` — cool grey |
| Shadows | PCFSoft, 2048 map — goblins/trees cast soft shadows onto tiles |
| Sky | Day/night cycle **locked by default to "golden afternoon"** (frac 0.354) — warm sun, blue sky `0x4a7ac8`, clouds, stars at night |
| Tiles | 1×1×1.8-unit boxes, **textured** (dirt/mossy-stone/cobble PNGs), top face full colour, sides darkened to 62% — visible block edges |
| Palette | earthy & muted: grass `0x3e6e28`, dirt `0x7a5030`, stone `0x52504a`, wall `0x4a4438`, floor `0x332e24` |
| Screen fill (measured) | village screenshot is ~47% dark moss green + ~33% dark olive-brown — **the world fills the frame** |

### 1.2 The goblin itself (procedural mesh — GLB orcs are permanently disabled, `upgradeToGLB()` is a no-op)

Geometry (goblin.js `_buildProceduralMesh`), all **low-poly on purpose**:

- Body: `CapsuleGeometry(bodyR, bodyH, 3, 6)` — **6 radial segments** (hexagonal cross-section), bodyR = 0.14–0.22 (constitution gene), bodyH = 0.30–0.48 (strength gene)
- Head: `SphereGeometry(headR, 7, 5)` — 7×5 segments, headR = bodyR × 1.1, **sunk into the shoulders** (head centre only 0.8·headR above the body cap — no neck at all)
- Ears: 4-sided cones (`ConeGeometry(headR·0.25, headR·0.7, 4)`), stuck out sideways at ±0.95·headR, tilted — **the silhouette wideners**
- Eyes: `MeshBasicMaterial` **red 0xff2200** (queen: 0xffaa00) — unlit, they glow through any lighting
- Nose: tiny 4-sided dark cone pointing forward
- Arms: ONE capsule each (`bodyR·0.28`), hanging, slightly splayed — **no elbows, no hands**
- Legs: ONE capsule each (`bodyR·0.32`), in the darkest tone — **no knees, no feet**
- Queen: purple `0x8010a0`, 1.35× scale, golden torus crown
- Village cast: the "Chief" is **red 0xd04020**, the Queen purple, the rest green — colour = identity

Materials: `MeshLambertMaterial` everywhere (flat diffuse, zero specular). Three tones from one base colour: body = base, head = base × 0.75, legs/nose = base × 0.5.

**Measured on screen** (zoom-3 close-up, raycast-located, pixel-measured):

- Total height ≈ **1.0–1.15 world units = about ONE tile** (ring outer Ø 0.76u = 234px → 308px/unit)
- Head+ears width ≈ 126px vs body width ≈ 66–80px → **head+ears are ~1.5–1.9× the body width**
- Head+ears ≈ **40% of total height** → the figure is **~2.7–2.9 "heads" tall** — a chibi/gremlin, not a small human
- Rendered body colour: **lit side #3a911b, shadow side #19290a** (clear, slightly cool green)
- Red eye glow confirmed in-pixels (bright red cluster at head height)
- At default zoom 14 the goblin is ≈ **66px tall on an 863px screen (~8%)** — a small figure in a big world

State & motion:

- Body colour is a **status display**: idle `0x2d7a1a` → moving `0x3a8a22` → working `0x50b030` → eating `0xf0c040` → starving `0xc87020`; custom player colour overrides
- Movement = pure position lerp — goblins **glide, no walk cycle, no limb swing**
- Working = **bob**: dig = stomp `|sin(t·0.8)|·0.06`, build = sway `sin(t·0.4)·0.025`
- Selection: **yellow ellipse ring** `0xffd040` (RingGeometry 0.3–0.38) at the feet
- Floating **emoji job icons** (⛏ 🪓 🪜) on sprites above heads; names in the inspector panel

### 1.3 "Goblin FORT" = the wave-defense mode

`main_wave_defense.js` ("🏰 Goblin Fortress Defense") uses the **identical** renderer, lights, camera, world and the **same procedural goblins** (5 spawned, one labelled "Captain"). The only different unit is the enemy — and it's instructive:

- Enemy = "dark grey wolf": `CapsuleGeometry(0.3, 0.6)` **rotated horizontal**, cone snout at the front, red `0xff2020` eyes, `MeshStandardMaterial 0x3a3838` — i.e. **the game's own non-humanoid creature is built on a horizontal axis**. Remember this for the dragon.

---

## 2. OUR DELTAS — why goblinfit is "totally different", ranked

The goblinfit port is *faithful to the mesh recipe* (ears, eyes, nose, 6-radial capsules, two-tone derivation, Lambert — all correct, the code comments even cite the game's source lines). It is *totally different from the rendered game* because **look = recipe × palette × lighting × camera × context × pose**. We matched only the first term. Measured from `/tmp/card_goblinfit.png`:

### #1 — No world: dark void vs earthy tiles (the biggest delta)
Our card is **>90% near-black cool grey** (#0a0b0d/#121418/#1a1d23 — measured page census). The game is ~80% warm moss/brown textured tiles under a blue sky. The founder's mental image of "the avatars in the game" is mostly *world + lighting + top-down view*. An isolated figure on a black void can never match it, whatever the mesh.

### #2 — Wrong palette: tier-lime → murky olive
The gallery forces `tier:'fit'` → outfit **#c6f32e lime**. goblinfit derives its tones from it, and under our cool hemisphere + dark void the body renders **#617610–#7d9a16 (olive/khaki)**. The game goblin renders **#3a911b lit / #19290a shadow — a clear, cooler green** (g/r ratio 2.5 vs our 1.23 — ours is ~2× too yellow). The game never uses lime anywhere; its accents are red eyes + a yellow ring on muted moss/brown.

### #3 — Wrong proportions: 3.4-heads athlete vs 2.7-heads chibi
goblinfit's spec is `headCount: 3.4` on the articulated humanoid rig. Measured on card: head ≈ 28% of figure height, head ≈ 0.67× body width. The game: head+ears ≈ 40% of height, ≈ 1.5–1.9× body width, no neck, no hands, no feet. Ours reads "small athletic human in green"; the game reads "gremlin toy".

### #4 — Extra anatomy the game doesn't have
Articulated joints with dark ball joints, mitten hands, wedge feet, hair caps/buns, headbands/belts. Every one of these pushes further from the game's sealed-capsule simplicity. The game's arms are single hanging capsules — no elbows, ever.

### #5 — Wrong camera & framing
Ours: front-on, FOV 32, slight lift, `frameAll` — a **product/character-sheet shot**, figure fills ~57% of the card. Game: **52° top-down, FOV 60**, figure ~8% of screen standing on a tile. Even with a perfect mesh, a full-frame front-on close-up of a squatting figure looks nothing like the game's tiny figures seen from above-at-an-angle.

### #6 — Wrong lighting rig
Ours: cool hemisphere 1.15 + warm key 2.05 + **lime rim 1.35 + orange-red rim 0.95** (a three-point studio rig with coloured rims), NoToneMapping. Game: one warm sun 0.9 + cool ambient 0.7, PCF soft shadows, warm fog. The rims especially say "product render", not "game world".

### #7 — Wrong pose & motion context
Gallery default = frozen **mid-squat** (MID_REP 0.52). The game's goblins stand idle, glide between tiles, and bob while working. A squat silhouette is maximally unlike the game's upright capsule-plus-head silhouette.

### #8 — Missing game furniture
No yellow selection ring, no emoji job icons, no name label near the figure, no ground shadow on a textured tile. These tiny props are strong identity signals.

---

## 3. DRAGON POST-MORTEM — what a dragon needs vs what we built

What makes "dragon" readable (in rough priority order):

1. **Silhouette on a horizontal axis**: long neck out of the shoulders, heavy body, long tail counterbalancing — an S-curve reading even at 64px.
2. **Wing membrane AREA**: wings are the single biggest shape, sails wider than the body is long, with visible scalloped trailing edges — in a colour that CONTRASTS the body.
3. **Elongated snout/jaw**: muzzle projecting well forward of the skull, jawline, nostrils.
4. **Reptile posture**: perched or quadruped, body roughly horizontal; digitigrade legs fold under the body.
5. **Scale/plate texture cues**: dorsal ridge, plates, spikes, horns with mass.
6. **Size presence**: reads big even when small on screen.

What we built (dragon.js, measured from `/tmp/card_dragon.png`):

| Dragon cue | What we built | Measured/observed failure |
|---|---|---|
| Horizontal axis | **Upright humanoid biped** (`headCount 3.8`, vertical capsule torso, `neckFrac 0.05` ≈ human neck) | Reads "person in a dragon suit" / green humanoid |
| Wing area | Membranes = flat `ShapeGeometry` flaps hung **behind thin arm bones**, span ≈ armLen×2.2 (~25% of height), coloured **accent #12202a = near-black navy** | In the card the wings are literally **invisible**: dark-navy membranes on the #0a0b0d void — only two thin green bone lines show (pixel-confirmed). Wing area ≈ 0 effective |
| Long neck | 5%-of-height cylinder | No neck read at all |
| Long tail | 4 capsule segments, total ≈ 0.42×height×stage, hanging **down behind the pelvis** | Hidden behind the body from the front camera; even visible it's a short downward strap, not a counterbalance |
| Snout | Box 0.7R×0.5R×0.9R on a sphere | Reads as a shoebox stuck on a ball |
| Plates/spikes | Belly plate only on 'average' (fledgling: nub horns 0.45, no spikes) | The gallery default shows the *least* dragon-like stage |
| Posture | **Squatting** (exercise rig) | A squatting wyvern is a green person |
| Colour | Same murky olive body + invisible navy membranes | No contrast anywhere on the figure |

Kicker: the game repo itself already demonstrates the fix — its wolf enemy is a **horizontal** capsule with a cone snout and red eyes, ~15 lines of code, and it reads instantly as a creature. We mapped a dragon onto a human exercise rig instead of building it as a creature.

---

## 4. RECOMMENDATIONS — the 5 non-negotiables for the next attempt

1. **Evaluate in a game context, never in a void.** Any game-style avatar must be rendered standing on a textured 1×1 earthy tile with 2–3 tiles of surroundings, warm sun (0xfff0d0 ≈ 0.9) + cool ambient (0x9090a0 ≈ 0.7), soft shadow, warm-dark fog — at the game's **52°-down, 45°-yaw, FOV 60** camera, at in-world scale (figure ≈ 8% of viewport height ≈ 1 tile tall), *plus* one close-up. Studio rims, black voids and front-on close-ups are banned for evaluation shots.
2. **Match the palette and verify the RENDERED pixels.** Base greens in the `0x2d7a1a` family (never tier-lime), head = ×0.75, limbs = ×0.5, red `0xff2200` unlit eyes, yellow `0xffd040` ring. Acceptance test: sample the PNG — lit body within ~±15% of **#3a911b**, shadow side near **#19290a**. If it renders olive, it's wrong no matter what the code says.
3. **Match the proportions, not the recipe details.** ~2.7 heads tall, head+ears 1.5–1.9× body width, head sunk into shoulders with no neck, single-capsule limbs (no elbows/knees/hands/feet), stubby legs, gene-driven size variance (bodyR 0.14–0.22). Delete hair, hats, headbands, joint balls for the game-style variant. Keep the low poly counts (6-radial capsules, 7×5 sphere, 4-seg cones) and Lambert materials.
4. **Silhouette-first for creatures.** A dragon (or any creature) must pass a 64px flat-black silhouette test before any detail: horizontal body axis, neck ≥ torso length, tail ≥ body length, wing sails ≥ 1.5× body area in a contrasting colour, projecting snout. Build creatures as creatures (see the game's horizontal wolf), never as retargets of the humanoid exercise rig; the identity pose is standing/perched, and exercise retargeting comes after — if ever.
5. **Screenshot-diff against the live game every iteration.** The game runs headless (proven in this investigation: serve `~/projects/game_goblin_village/game/`, CDP screenshot, raycast to find the goblin). Produce a standing side-by-side — game close-up vs ours at matched zoom, plus sampled hex values — and don't show the founder anything that hasn't passed that diff. The game repo is the golden reference; code-comments like "straight from the game" are not evidence, renders are.

### Root cause in one sentence
We kept porting the game's *mesh recipe* while changing everything that actually produces its look — palette, lighting, camera, world context, proportions and pose — and we never once compared our render to the game's render; the dragon then failed for a second, independent reason: it was built as a humanoid-in-a-suit instead of a horizontal creature, with wings rendered in a colour invisible against our own background.
