# Lane 10 — Avatars (PARKED, then rebuild)

**Mission:** workout avatars that match the goblin-fort game's character feel,
plus creature avatars (dragon) that read as what they are.

**Owns:** `site/avatar-styles/`, `site/avatars.js`, `site/model-avatars.js`,
`apps/avatars/`, avatar integrations in `site/` + `apps/demo/`.

## Status: 🅿️ PARKED by founder decision (28 Aug) — "come back to this later"

Two failed rounds preceded the park. The forensic investigation is DONE and
its findings are BINDING on any future attempt:

**READ FIRST: `notes_avatars_investigation.md`** (repo root)

## The 5 non-negotiables (from the investigation — measured, not opinions)

1. **Evaluate in a game context** — tile floor, warm sun, 52°-down RTS camera,
   in-world scale. Never judge an avatar on a dark void.
2. **Match the palette and VERIFY RENDERED PIXELS** — the game's goblin reads
   #3a911b lit / #19290a shadow. Our tier-lime rendered olive #617610 (2× too
   yellow). Pixel-check every colour against the game.
3. **Chibi proportions** — the game's goblin is ~2.7 heads tall, head+ears
   ≈40% of height and 1.5–1.9× body width, no neck/hands/feet. Our 3.4-head
   athlete with joints/hair/headbands was wrong in every one of those.
4. **Silhouette-first for creatures** — a dragon needs: horizontal body axis,
   neck ≥ torso, tail ≥ body, wing sails ≥1.5× body area in a CONTRASTING
   colour (ours were near-black on near-black — invisible), projecting snout.
   Never build a creature on the humanoid rig.
5. **Screenshot-diff against the live game every iteration** — the game repo
   (`~/projects/game_goblin_village/game/`) is the golden reference. It RUNS
   headless (investigation proved it) — capture it, compare, repeat.

## When reactivated

1. Build the evaluation harness first: game-context scene (tile, sun, camera)
   + side-by-side with a live-game capture. No styling before the harness.
2. Goblin-style avatar per the 5 non-negotiables → founder sign-off → THEN
   the dragon (creature rig, not humanoid).
3. Model characters (Soldier/Xbot/RobotExpressive/orc) stay available in
   `/avatars` as reference options; the realistic direction is a separate
   founder decision, not the default.

## Definition of done (when reactivated)
Founder says "yes, that one" — nothing less. Screenshot evidence against the
game capture attached to every iteration.
