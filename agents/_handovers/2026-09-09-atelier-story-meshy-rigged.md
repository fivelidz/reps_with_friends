# HANDOVER: atelier + meshy characters — 2026-09-09

## Shipped
- **/atelier "HOW THIS WAS BUILT" panel** (`apps/atelier/index.html` `<details class="at-story" id="story">` + `atelier.css` `.at-story…`, zero JS): five-generation garment saga (① fitted rings → armour ② full PBD cloth-sim → jitter + idle CPU burn ③ SKIN-DERIVED — the founder's insight, lime-highlighted ④ contour hems + graded hang ⑤ fabric-flow v8/v9), each with a small SVG cross-section; mocap sidebar (Geno = ai4animationpy demo biped, goblin BVHs mislabelled, 16 CC-BY clips world-quaternion retarget, Soldier preferred); instruments explained (x-ray / seam heatmap / attachment probe); sources footer; lime **NEW note card** ("commercial-safe base — replaces research-licensed Geno").
- **Meshy commercial-safe character family** (manifest: `site/models/meshy/manifest_rigged.json`, 135 credits of the ~150 cap, balance 1785): `site/models/meshy_rigged_01.glb` (athlete), `_02.glb` (heavyweight), `_03.glb` (sprinter) — text-to-3d T-pose → Meshy auto-rig (mixamo names, `rename_bones.py` folds Spine01/02/neck) — plus `meshy_podium.glb` (arena, display-only). MODELS entries `meshy-athlete/-heavy/-slim/-arena` in `site/model-avatars.js` → /avatars cards render automatically with the lazy-WebGL budget (mocap button lists + bvhAuto walk).

## Verified
- **Clips by two-frame world-position deltas** (`apps/avatars/test/meshy2_verify.ts`, per character): walk max Δ 0.16–0.21 m · run 0.36–0.42 m · squat hips −35 cm with feet Δ 0 (planted) · 22/22 joints matched · 0 NaN · above ground.
- Page-truth on /avatars: cards 19/20/21 `ok:true`, BVH walk playing (asymmetric foot heights), **card 18 (meshy frog) FIXED and walking** — see gotcha.
- 0 console errors on /avatars and /atelier (CDP console + Log + exception capture).
- Shots: `apps/atelier/shots/atelier_story_*.png` (5, incl. note card) · `apps/avatars/screenshots/meshy_*_card_meshy2.png` (5 cards).
- Full atelier attachment probe (runVerify) left running in background at session end — result in `/tmp/atelier_verify_regress.txt` (panel is inert HTML/CSS; anim select, 1 ctx, frog stage all confirmed live).

## Next agent should
- Founder picks a direction; iterate Meshy prompts cheaply (20 cr preview → thumbnails before refining — athlete_preview/heavy_preview/slim_preview/arena_preview.png in meshy/).
- Port the skin-derived garment system onto the chosen character (geno-derived.js region machinery is body-mesh-generic; Geno bone bands → same names on the mixamo rig).
- Consider expanding the chosen character's card `bvh:` list to the full 16-clip set.
- Meshy task URLs EXPIRE — site/models/*.glb are canonical; re-download needs new tasks.

## Gotchas hit
- **rename_bones.py had a GLB chunk-alignment bug** (padding written outside the JSON chunk's declared length → three.js reads a garbage BIN header → `body` null → all loads reject "Cannot read properties of null (reading 'slice')"). **The /avatars meshy-frog card has been silently blank since 2026-08-31.** Fixed 2026-09-08 (padding inside chunkLength + 4-align assert; original archived at `meshy/archive/rename_bones_pre_fix_20260908.py`); meshy_frog_full.glb regenerated from the untouched `A_rigged.glb`.
- `art_style` is DEPRECATED in the Meshy API (only realistic/sculpture; Meshy-6+ ignores it) — "stylized" must live in the prompt text.
- Headless-chromium HTTP cache lies across runs (serves stale bytes for the same URL): new `--user-data-dir` or bumped CDP port per harness run when checking changed assets (v9_quick already disables cache via Network.setCacheDisabled).
- `down(p)` in model-avatars.js is a triangle wave — pose phases 0.15/0.85 are mirror-identical; use 0.1 vs 0.5 for contrast.
- Never `appendChild` a THREE.Group to the DOM (harness crash); add to a Scene or keep detached.
