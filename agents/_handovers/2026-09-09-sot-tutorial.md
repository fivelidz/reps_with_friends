# 2026-09-09 · THE TUTORIAL SUITE (How-It-Works · Card Sheet · Guided Demo) — handover

*The founder asked for "an overview of the spec and card sheet, a tutorial
or run-through, a good demo." Built on the SOT app (v4), borrowing the v1
figma-app demo-driver wholesale. Everything green at hand-off: tutorial
e2e 80/80 (new), main walk 129/129, cards 58/58, states 59/59, cards.test
26, parity 5 — zero console errors everywhere.*

## What this wave shipped

**BUILD 1 · HOW IT WORKS** — App.view `"howitworks"` in `apps/sot/app.js`
(`scrHowItWorks`). One-scroll, phone-first spec overview in "reps"
language; 2-3 sentences + one visual per section:
1. **THE LOOP** — 7-node vertical diagram (`.tut-loop`): log reps → daily
   battle 200-adjusted → **first to target = Daily Win** (hot node) →
   everyone else banks the day → wins stack into the week → the stake
   settles at season end → your reps become your name.
2. **THE HANDICAP** — tier table (`.tut-tiers`) computed LIVE from the
   engine (`dailyTargetAdjusted(200, mult)`, ceil): couch ×1.5 → **134**,
   casual ×1.25 → 160, fit ×1.0 → 200, athlete ×0.85 → **236**.
3. **THE FOUR STAKES** — dinner / dare / deliverable / charity pot
   one-liners (grid2 picks).
4. **MODES + DUAL-SURFACE** — Individual / Team (min 2 a side, 3v2 fine) /
   Corporate chips; "the app is authoritative, the chat is where it lives."
   Footer card → the card sheet. Reached from **welcome** (`#tut-howto`)
   and **Profile → Settings** (`#profile-howto`); back button is
   context-aware (`tutBack()` → profile if onboarded, else welcome).

**BUILD 2 · THE CARD SHEET** — App.view `"cardsheet"` (`scrCardSheet`).
All 21 engine cards (`SoT.CARDS` = `Core.CARD_CATALOG` + app copy) grouped
by the 6 `FAMILIES` (declared atop the function: canon / post-launch /
exercise / rivalry / proof / catch-up with icons + blurbs). Every face
readable: icon, NAME (uppercased), rarity chip (`.tut-rarchip` + per-
rarity border glow), one-line effect (blurb), 🎯 target + ⏳ expiry chips.
**Family filter chips** (`App.cardFilter`, "All 21" + 6). Below: the
**draft rules block** (deal 3 pick 1 · hand cap 3 from `engine.HAND_CAP` ·
catch-up odds 50/30/15/5 → 10/50/27/13 · reroll-to-pot 50/100/200 · the
halfway bonus deal) and the **proof flow** (Prove It / Spot Check · verify
= +15 to the target · contested = 0 but banks). Entries: welcome
(`#tut-cards`), How-It-Works footer, Power-Ups header
(`#tut-cardsheet-link`).

**BUILD 3 · THE GUIDED DEMO** — `apps/sot/tutorial.js` (new module, loads
before app.js). The v1 `apps/figma-app/demo.js` pattern: SCRIPT of scenes
(cap + sub + dwell + run()), pausable/speed-scaled/skippable dwell on a
100ms TICK, narrator bottom-sheet (`.tut-narr`: caption, sub, 11 dots,
◀ prev · ⏭ skip · ⏸ pause · 2× speed · DEMO tag · ✕ exit), full-screen
click shield (`.tut-demo-shield`), end card (`.tut-endcard`: "THAT'S THE
WHOLE GAME." + Join the Battle / watch again / how-it-works + the honest
"ran on a shadow copy" note). **SHADOW STATE:** `startDemo` snapshots the
real save, `useKey(DEMO_KEY)` swaps persistence, blanks the demo key
(double-swap because same-key `useKey` short-circuits); `exitDemo`
restores the snapshot to REAL_KEY **before** `useKey(null)` and removes
DEMO_KEY **after** it (useKey persists the outbound state on its way out).

**The 11-scene script (~75s at 1×; dwells sum 73.7s):** welcome → meet the
crew (real `seedDemo()`: Gold Squad — Marco casual ×1.25, Priya fit ×1.0,
Jack couch ×1.5; deal parked via `App.dealDismissed`) → THE DEAL (overlay,
flip) → deal-pick (tap a card → hand) → log reps (me +20 pushups; caption
explains Jack's ×1.5) → rival-win (Marco +112 → 200; otherWon moment fires
by itself) → bank (me +180 → 200; banked overlay) → proof (Marco plays
Prove It on Jack; Jack logs unverified; me + Priya vote accept; feed shows
"the crew ACCEPTED") → recap (`b.core.config.deadlineAt` pulled into the
past + `tick()` closes the day; battle 2's deal parked; recap overlay) →
season (hub, standings) → stake (charity pot card) → end card.

## Where things live

- `apps/sot/tutorial.js` — the demo driver (self-IIFE, `window.RWFTutorial
  = { startDemo, exitDemo, SCRIPT, scriptTotal1xMs }`; status surface
  `window.__rwfSotDemo` = { sceneIndex, sceneId, caption, running, endcard,
  paused, speed, scriptTotal1xMs, pause/resume/skip/setSpeed/exit }).
- `apps/sot/app.js` — `scrHowItWorks` + `scrCardSheet` (+ `FAMILIES`,
  `tutBack`, `tutTopbar`), welcome/profile/power-ups entries, view cases
  in `render()`, drive handles `__rwfGo / __rwfTabTo / __rwfOverlay /
  __rwfSeason` next to `__rwfV4`.
- `apps/sot/engine.js` — **shadow-state support**: `storeKey` variable,
  `useKey(key)` (persists outbound, loads inbound, emits),
  `blankState()`, exports `REAL_KEY` + `DEMO_KEY` ("rwf.sot.demo.v1").
  Additive only — no existing behaviour touched.
- `apps/sot/index.html` — `<script tutorial.js>` before app.js.
- `apps/sot/sot.css` — TUTORIAL SUITE section: `.tut-loop*`, `.tut-tier*`,
  `.tut-cardface*` (+ `.chip.rar-*` rarity chips), `.tut-filters`,
  `.tut-rule`, `.tut-narr*`, `.tut-demo-shield`, `.tut-scrim`,
  `.tut-endcard*`.
- Tests: `apps/sot/e2e-tutorial.mjs` (80 checks, `_tut` shots, port 4196).
- Shots: `apps/sot/shots/*_tut.png` — 20-howitworks-loop, 36-cardsheet,
  43-howitworks-from-profile, 55-demo-deal-narration, 76-demo-endcard
  (390×844 @2x).
- Log: `docs/31_PROGRESS_LOG.md` — 2026-09-09 entry.

## Gotchas for the next agent

1. **The core day's deadline lives at `b.core.config.deadlineAt`** — the
   app-level `b.deadlineMs` is a mirror and `effDeadline()` reads the
   CORE. To close a battle programmatically: mutate `b.core.config.deadlineAt`
   then `SoT.tick(groupId)`. (This cost the recap scene its first pass.)
2. **`useKey` to the SAME key short-circuits** — to reset the shadow key:
   `useKey(DEMO)` → removeItem → `useKey(null)` → `useKey(DEMO)`.
3. **Battle 2 auto-begins** when battle 1 ends (rolling clock) and its
   deal re-claims the screen via `detectMoments` — park it with
   `App.dealDismissed = draft.openedAt` right after the close.
4. **`innerText` reflects `text-transform`** — card names are uppercased
   in JS; season/stake text checks should be case-insensitive.
5. **The engine refuses logs past a player's `completedAt`**? It doesn't
   refuse more logs after completion — but the demo order (log → win →
   bank → proof) keeps every caption honest regardless.
6. **`/v4` without the trailing slash** resolves relative module srcs
   against root (pre-existing serve.ts base-URL quirk, outside this
   wave's path scope) — `/v4/` is the correct URL. A redirect in serve.ts
   would fix it if the founder wants.
7. e2e rooms: tutorial 4196, main 4194, states 4195, cards 4197 — CDP
   ports are randomised per run already.

## Verify (all green at hand-off)

```
bun apps/sot/e2e-tutorial.mjs   # 80/80  (new — tutorial suite)
bun apps/sot/e2e.mjs            # 129/129
bun apps/sot/e2e-cards.mjs      # 58/58
bun apps/sot/e2e-states.mjs     # 59/59
bun test apps/sot/cards.test.js # 26 pass
bun test ./apps/sot-engine.test.js  # 5 pass (parity)
```

Live check: `setsid nohup bun serve.ts > /tmp/rwf-serve.log 2>&1 < /dev/null &`
→ `http://localhost:4173/v4/` (trailing slash) — welcome shows
"▶ Watch how it works — 75 seconds", "📖 How it works", "🃏 The card sheet".

## Next (founder's call)

- Founder pass on demo wording + loop copy (the script lives in one
  SCRIPT array — one-line edits, dwells included).
- Optional voice-over track keyed off `__rwfSotDemo.sceneId`.
- Possible: auto-open the tour on first-ever visit (one `localStorage`
  flag + one `startDemo()` call).
- The `/v4` → `/v4/` redirect in serve.ts (outside allowed paths this wave).
