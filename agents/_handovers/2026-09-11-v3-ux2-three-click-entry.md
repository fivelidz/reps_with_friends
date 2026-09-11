# HANDOVER: v3 UX2 — the 3-click entry — 2026-09-11

## What the founder said (and what it changed)
Tested /v3 on a phone; feedback was brutal and specific. Every item is addressed in apps/v3 only.

| Feedback | Fix |
|---|---|
| "A million clicks just to make a team. Less clicks to buy a car." | THE 3-CLICK ENTRY (`#/play`): type name → tap tier → tap START THE BATTLE → ON the course, LIVE vs the seeded crew. All other config auto-set from a prefs layer (target **200**, all days active, bodyweight pack, weekly season, giving OFF, power-ups auto-dealt = strongest of the dealt 3). The old setup/create wizard is ARCHIVED (never deleted): `apps/v3/archive/2026-09-11_wizard-entry/`; `#/setup` + `#/create` redirect. |
| "I did not see the 3D interaction board" | After START the view IS the course (TABLE cam, e2e asserts `view() === "battle"`). Fresh visitors land on the entry only (identity is required to seat you); every other path lands on the course or the hub. Drag-to-look hint (`.v3-orbit`) fades on first pointer/wheel or 6s. |
| "Text cutoff, buttons covered, need to scroll" | 390×844 audit baked into e2e: safe-area insets on quick bar/top, feed restacked ABOVE the action row (the old layout under-ran the buttons), fx chips under the standings strip, cam cheat-sheet above the feed, 5-card fan tightened (`margin −24px @ ≤430px`), standings names ellipsis + `data-fullname` → tap = toast with the full name, battle-card name/meta ellipsis, entry + battle screens assert `scrollHeight ≤ clientHeight`. |
| "Getting into a game didn't really work" | Full path e2e-verified: fresh visit → 3 clicks → live battle → LOG REPS → runner advances matching progress % → card auto-dealt at START. `createFastBattle` is born LIVE (auto-pick + `E.startMatch`); `joinByCode` force-starts too. |
| "Atelier avatars should be used" | Runners = the meshy trio (`site/models/meshy_rigged_01/02/03.glb`, mixamo rigs, real PBR — NO flat tint), cycled by tier: couch→02 heavy, casual→03 sprinter, fit/athlete→01 athlete; tinted Geno = per-runner fallback. Frog-head toggle (⚙︎ → 🐸 FROG HEAD) attaches `geno-wardrobe.attachHead` LIVE on any mixamo rig (attach/detach + dispose, `headOn` probe). `runnerPos()` now returns `avatarKind` (`meshy-athlete/-heavy/-slim`/`geno`) + `headOn`. |
| "Unsure how the game hub display works" | Hub = exactly three things: **START A BATTLE** hero (→ entry), **JOIN WITH CODE** (sheet → live demo-crew battle branded with the code until friends link via the bots bridge `link <CODE>`), battles list LIVE-first with one-tap resume. Everything else removed. |
| "Settings changes could basically be powerups" | One taste shipped: ⚙︎ **HOUSE RULES** in the quick bar — 11 rule cards (target 200↔150/250 · pack · auto-deal · giving · species head), `next battle` / `next result` / `live now` tags. Prefs: `DEFAULT_PREFS` + `prefs()`/`setPrefs()` in state.js, backfilled onto old saves in `load()`. |

## Suites (all green, zero console errors)
- `bun apps/v3/e2e.mjs` — **150/150**, rewritten to the founder's walk; shots → `apps/v3/shots/*_ux2.png` (30 shots, 390×844 @2x + desktop legs).
- `bun apps/v3/geom.mjs` — **53/53** (needs `bun serve.ts` on :4173; clears localStorage per leg, polls the runner advance).
- `bun apps/v3/e2e-sfx.mjs` — **30/30** (unlock on the entry's name field, tier tap = first real sound, START = primary, combo climb, win/lose/pot/flip, mute round-trip).
- `bun apps/v3/cards3d_verify.mjs` — **21/21** (updated to the 3-click boot).
- Frame budget: 2.5–3.3ms median headless WITH the PBR trio (was ~3.7ms with Geno).

## Gotchas for the next agent
- **The lerp is dt-clamped** (`Math.min(getDelta(), 0.06)` in course.js): the meshy PBR trio renders slower on SwiftShader than flat-tinted Geno, so fixed sleeps after `driveLog` undershoot — POLL positions (geom does; e2e always did).
- **Rematch honors the current house-rule target** (`targetById(prefs.target)`), not the old battle's — the rule card promises "applies from your next battle". Exercises pack still inherits.
- **Auto-deal changes the reachable states**: with prefs.autoDeal ON (default) battles are born live and the draft sheet never appears; e2e flips it OFF via the sheet to walk the manual draft. `myDraft()`/`bestDraftKind()` hardcode player id `"you"` (matches setPlayer).
- **Join sheet / settings sheet bind via `sheetEl.querySelector`** (scoped), not `$()` — the stale-sheet shadow bug (see commit 17e00ea) applies to any new sheet: always scope.
- **The boot renders twice now** (`#/home` → redirect `#/play` for fresh visitors): two silent swipe calls pre-gesture — the sfx suite asserts no FIRING (r flag), not zero calls.
- **Long-name seating is deliberate**: `createFastBattle` seats `MATES[0], MATES[1], MATES[4]` (sam/alex/Mikayla Long-Name-Rutherford) so varied tiers AND HUD truncation are exercised every battle. e2e/geom probe pids: `you, sam, alex, mika`.
- The fuzzy-match edit tool mangled app.js + state.js mid-task (ate MATES/CHARITIES once) — recovered from the archive; use exact-match scripted replacements for large blocks in these files.

## Deliberately NOT done (founder said "later")
- Full settings-as-powerups economy (only the rule-card teaser).
- Real join-by-code linking (waits on the bots bridge; demo crew fills the seat).
- Wave-2 characters (rigs pending Meshy credits — see 2026-09-09 handover).
- No commits made; working tree left for founder review.
