# HANDOVER: SOT critical states in the v4 app — 2026-09-04

**For:** anyone touching `apps/sot/` (the v4 app), the wiki, or the next
state/UX wave. Written after the critical-states wave.

**Spec:** the master SOT's screen inventory — #103 (Server reconnecting,
MISSING), #104 (Offline battle), #105 (Sync conflict, MISSING), #119
(Duplicate log warning, MISSING), #120 (Offline log queue), #29 (Rest-day
home), #101 (Rest day), #102 (Battle complete but season live).

## Shipped (all in `apps/sot/` — states only, engine rules untouched)

**1 · Offline / reconnecting — `Conn` shim in `app.js`** (SOT #103/#104/#120)
- A simulated realtime layer (`Conn`: `online | offline | reconnecting`,
  `queue[]`, persisted at `localStorage["rwf.sot.conn.v1"]` — the queue
  survives reloads and replays on next boot).
- Toggle: **Settings → "Simulate offline"** (`#offline-toggle` on Profile).
- Offline banner (`#conn-banner`) leads every navbed screen: "you can keep
  logging… sets queue… sync the moment you're back" + live queue count.
- Submits while offline → `F.step = "queued"` screen ("QUEUED — SAVED
  OFFLINE", queue count, "Remove from queue" undo) — nothing hits the engine.
- Queue badge (`#queue-badge`) rides the central LOG button with a count.
- Back online → a visible RECONNECTING beat (~1.1s) → `replayQueuedLogs()`
  replays every queued set through the REAL engine → toast reports the
  outcome ("Back online — N synced" / "Sync complete — N kept, M dropped").

**2 · Duplicate + sync conflict — `duplicateLogOf()` + two overlays**
(SOT #105/#119)
- `duplicateLogOf(exerciseId, physical)`: same exercise + same reps
  (post-conversion RUF) by me **within 60s** → returns the engine entry.
  Reads a FRESH snapshot every call (replay sequences must see their own
  earlier entries).
- Live submit while online + duplicate → overlay `dupWarn` (`#dup-warn`):
  "POSSIBLE DUPLICATE — did that set count?" → **Yes — log it anyway**
  (applies through the same completion/overlay paths as a normal log) /
  **↩ Undo — not a double** (returns to the confirm step, nothing logged).
- Replay collision (queued set raced a log that already landed) → overlay
  `syncConflict` (`#sync-conflict`): per-conflict **Keep both sets** /
  **↩ Drop mine — it's a double**, sequential for multiple conflicts, toast
  tally at the end. Non-conflicting queued sets sync automatically first.

**3 · Rest-day home (SOT #29 — verified, then upgraded)**
- The old build HAD a stub (small card when next battle >3h out) — this wave
  made it a real state: `#rest-day` card with streak-safe messaging (branch:
  returning player with streak >0 gets "your 🔥 N-day streak is SAFE on rest
  days"), next battle day + countdown, season progress, streak + tier chips,
  Season-hub jump, "Recovery is part of the game" close. Trigger unchanged:
  `b.status === "scheduled"` && start >3h away. Below it the just-finished
  battle stays framed (#102 card) + past battles.

**4 · Battle complete but season live (SOT #102)**
- Live half — `#win-known` card under the hero when `b.winnerId && live`:
  winner named, "bank your own day" CTA (unless already banked), **tomorrow
  framing** ("Tomorrow's angle: battle N (day) — season points still live").
  The old info banner was folded INTO this card.
- Ended half — `battleCompleteCard()` (id `#battle-complete`): winner + X
  banked / Y missed, tomorrow line (LIVE-now vs opens-next branch), recap one
  tap. Renders in three places: while the NEXT battle runs (replaces the old
  recap-only strip), on the starts-soon screen, and on the rest-day screen.
  ⚠ **the card must keep the literal "Battle N recap" text + root onclick**
  — the main e2e clicks it by that text (`clickText("Battle 1 recap")`).

**CSS** (`sot.css`): `.banner.offline`, `.banner.reconn`, `.conn-n`,
`.queue-badge` (absolute on `.log-btn`, which gained `position: relative`),
`.rest-home`.

## Test handles (stable selectors for e2e)
`#conn-banner` · `#queue-badge` · `#offline-toggle` · `#dup-warn` ·
`#sync-conflict` · `#rest-day` · `#win-known` · `#battle-complete` ·
`window.__rwfConn` (read-only by convention, like `window.__rwfV4`).

## Proof
- **`apps/sot/e2e-states.mjs`** (NEW, 59/59 green, zero console errors):
  seeds the demo crew → fizzles the seed bomb for clean arithmetic →
  offline banner asserts → queued set + badge → race + reconnect → conflict
  sheet → drop-mine → dup warn (confirm AND undo paths) → rest-day home →
  winner-known (otherWon interrupt + card) → deadline time-travel →
  failed-day moment → battle-complete card → battle 2 live.
- **`apps/sot/e2e.mjs` (the main 120-check walk) stays green** — re-run
  after every change above; the only touchpoints were the win banner fold
  and the recap-strip replacement, both e2e-compatible by design.
- Layout probe (throwaway, /tmp): banner top-of-page, badge inside nav,
  conflict oval centred 350px, rest-day 358×528, no horizontal overflow on
  any state.

## Real bug found + fixed (one-line guard in the bridge, NOT the rules engine)
`engine.js` `startSeason()` crashed for **window-clock groups whose first
battle is in the future**: the season-1 founder pack ran
`Core.grantPowerUp(s.battles[0].core, …)` while `core` was still `null`
(the engine day is only created when the day opens). Fix: guard
`if (idx === 1 && s.battles[0].core)` — the daily drop at `beginBattle`
deals cards when the day actually opens, so no cards are lost. Semantics
unchanged; documented in-code. (This is the apps/sot state bridge, not
`apps/sot-engine.js`.)

## Gotchas for the next agent
- The dup check is *time-based* (60s) — e2e runs must finish fast or use
  distinct amounts; the states e2e fizzles the seed bomb FIRST so board
  arithmetic has no ±20 defusal bonus.
- `replayQueuedLogs` runs on boot if a queue survived a reload while online —
  keep e2e runs on one page, or clear `localStorage["rwf.sot.conn.v1"]`.
- e2e-states creates a "Rest Crew" group with activeDays = today+3 (always a
  real rest gap); it stays in the device's localStorage — the run ends on
  the demo group, but a fresh-states run should start from a clean profile
  (the harness does: fresh `--user-data-dir` per run).
- Language gate: new UI strings must avoid match/kitty/poker/RUF/300 —
  both e2e files scan source strings.

## Not done / next
- #102's "tomorrow" line reads the next SCHEDULED battle — in sprint/duration
  demo groups the next battle is "LIVE now" (branch handled); a real
  overnight gap shows the opens-next line (covered by the rest-day + window
  clock paths).
- Sync conflict currently resolves per-set; a bulk "drop all duplicates"
  affordance is obvious if it ever annoys.
- The shim is UI-level only — a real transport (bot/api-sync) should drive
  the same `Conn` surface; the SOT bot bus (in flight, parallel) is the
  natural next integration point.
