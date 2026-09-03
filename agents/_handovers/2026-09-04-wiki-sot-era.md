# HANDOVER: wiki documents the SOT era — 2026-09-04

**For:** anyone editing `apps/wiki/` or the docs surfaces. Written after the
SOT-era documentation wave.

**Spec:** docs/27_SOURCE_OF_TRUTH_RECONCILIATION.md + the master SOT
(v2026-09-02). The wiki still documented the 300-match model everywhere;
this wave makes the daily model canonical while preserving the old era.

## Shipped

**Game Rules (`game.html`) — rewritten for the daily model.** The 300-era
page is archived VERBATIM at `apps/wiki/archive/game_300era_20260904.html`
(never-delete rule) and condensed into a "Legacy" section at the page
bottom. New canonical sections (numbers read from `apps/sot-engine.js`):
daily battle 200-adjusted / first-to-target Daily Win / bank-day
continuation / failed days; tier handicap table (with target-200 physical
equivalents: couch 134 … athlete 236); streaks + rest days + the shield
save; weekly seasons 1:1 + all four stakes (charity maths incl. the
disclosed 5% fee); the SOT power-up canon with the CORRECTED steal (pure
gain + the Q237 flag) and shield (streak protection) + post-launch set +
our Q240-242 economy answer (founder pack, daily drop, hold cap 4, no
expiry); the clock/DZ ramp; the winners family; the RUF/reps ruling and how
the e2e enforces it.

**NEW PAGE — The four versions (`versions.html`).** v1 Figma-faithful →
v2 board → v3 3D course → v4 SOT app: what each proved, what carried
forward (card presentation, DZ ramp, SFX, tier multipliers, the house crew,
charity-never-pays-a-player), links + shots. Added to the nav on ALL TEN
pages and to the walk test's `PAGES` list.

**App Screens (`app.html`) — v4 leads.** New sections: "v4 — the
Source-of-Truth app" (`id="v4"`, the tested journey) and "v4 critical
states" (`id="v4-states"`, the 8 state shots + mechanics of the offline/sync
/rest/winner-known states). v1 sections kept below, re-framed as the
preserved reference build; hero lede updated. The page now documents BOTH
apps.

**Bots (`bots.html`) — SOT grammar section.** Hero notes "SOT bots in
flight". New section (`id="sot-grammar"`) documents the REAL grammar read
from the concurrent bot agent's UNCOMMITTED work
(`packages/bot-core/src/{sot-bus,sot-cards}.ts` — landed mid-wave; git was
clean when this wave started): `new/join/start/log/s/day close/season/stake
+ agree + decline/pot/charity/donate` + canon power-up commands with
pure-gain steal, the `--sot` sim flags. The 300-era grammar above it is
labelled as the running surface. ⚠ If the bot agent's grammar changes before
commit, this section is the thing to re-check.

**Status (`status.html`) — the reconciliation, condensed.** New "SOT
reconciliation" table (docs/27 trimmed to current truth with badges) +
"Open questions we answered with working software" (Q240-242, Q216, Q222,
Q223, Q237, the critical states) + the §6 still-founder/Ben list. "Where
the build stands" updated for the SOT era.

**Ops (`ops.html`) — test inventory refreshed.** game-core 110 (V4),
bot-core 89 (SOT suite in), api 24 — measured live this wave; the v4 walks
(120 + 59) + wiki walk (25) listed with what each proves.

**Index (`index.html`) — SOT-era hero.** Daily-model lede, stats (~700
checks / 12 surfaces / 4 versions), Versions card in the grid, v4 row in
the surfaces table.

**Shots:** 22 new PNGs copied into `apps/wiki/shots/` (self-contained per
the wiki footer rule): `v4-*` (battle home, quick log, power-ups, season
hub, you-won, stake donated) + `v4-states-*` (8 critical states, from the
states e2e) + `v2-*` + `v3-*` (board table/cards, 3D course/billboards).

## Proof
- `bun apps/wiki/test/walk.mjs` — **25/25**, now covering **10 pages**
  (versions.html added): every page 200s, all 76 asset refs resolve, 77
  PNGs sane, browser walk decodes every image, zero console errors.
- Screenshot decode spot-check passes on the v4 shots (780×1688).

## Gotchas
- The walk's HTTP check resolves RELATIVE asset refs against `/wiki/` —
  wiki pages must keep shots inside `apps/wiki/shots/` (copy, don't
  cross-link ../../sot/shots).
- Nav order is Game / App / **Versions** / Bots / … — added to all pages by
  sed; new pages must include it (walk only fails on missing FILES, not
  nav links — keep it honest manually).
- `game.html`'s numbers are read from the engine — the page footer says
  "any change to a multiplier should update this page". Tier table now
  shows target-200 physical equivalents (134/160/200/236) which the SOT bot
  card also prints — keep the three in sync (wiki, bot card, engine).
- The legacy 300 page archive lives at
  `apps/wiki/archive/game_300era_20260904.html` — do not link it from the
  walk-covered pages (it references old shots that still exist, so it
  would actually pass, but it's an archive, not a page).

## Next
- When the SOT bots commit, flip the bots badges from "in flight" to live
  and capture a real `--sot` sim transcript into the bots page (the
  300-era transcript section shows the pattern).
- The design.html page still doesn't cover the v4 gold-on-black skin
  (Anton + Space Grotesk loot presentation) — a "the SOT brand direction"
  section is the natural next doc task.
