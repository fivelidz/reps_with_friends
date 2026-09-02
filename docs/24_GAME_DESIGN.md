# Reps With Friends — Game Design Document

*Version 1.0 · 2 Sep 2026 · Owner: Alexei Brown (build) + Ben (design/vision)*
*Companion doc: [docs/25_DESIGN_BRIEF.md](25_DESIGN_BRIEF.md) — the 2-page handout. This is the bible.*

**What this document is.** The complete game design of Reps With Friends as it
exists today — a working system, not a concept deck. Every mechanic described
here is implemented and tested somewhere in this repo, and every section says
where. Where the design is genuinely undecided (five founder-level decisions),
this document says so honestly and lays out both sides.

**How to run everything in this repo** (a reader who has never seen it):

```bash
bun serve.ts          # → http://localhost:4173
```

| Route | What it is |
|---|---|
| `/figma-app` | The offline test app — **Ben's full design, every screen**, running our real engine (lane F4) |
| `/styles` | Five-theme design exploration, side-by-side gallery |
| `/system` | Complete dissemination: tokens, 16 components, 36 elements A–G with status |
| `/wiki` | This documentation as browsable pages (Game Rules, App Screens, Bots, Verification, Avatars, Ops, Design, Status) |
| `/atelier` | Outfit Atelier — avatar garment inspection tool (x-ray, seams, poses) |
| `/demo`, `/debug`, `/hub`, `/connect`, `/slack`, `/avatars` | 90-second match replay · live bot simulator · ops console · WhatsApp linking · Slack setup · avatar playground |

The same content is publicly deployed at **rwf.qalarc.com**.

**Source documents:** Ben's original brief (summarised in
[docs/01_BUSINESS_ANALYSIS.md](01_BUSINESS_ANALYSIS.md) §2) · the founder-decision
audit of his production Figma ([figma/notes/analysis.md](../figma/notes/analysis.md)) ·
the element backlog ([docs/07](07_BRAINSTORM_ELEMENTS.md)) · our MVP design spec
([docs/13](13_MVP_DESIGN.md)) · the wiki's own rules chapter (`apps/wiki/game.html`).
Code references: `packages/game-core` (the TypeScript spec), `apps/figma-app/engine.js`
(faithful browser port), `apps/figma-app/daily.js` (play-day/temporal layer),
`packages/bot-core` (the chat bots).

---

## 1. The fantasy

**Training stops being something you grind alone.**

The target user is a 35–50 year old who used to be fit, isn't anymore, and has
a group chat full of mates in exactly the same position. Every fitness app on
earth sells them the same lonely loop: open app → log workout → stare at your
own graph → feel vaguely guilty → churn by week three.

RWF replaces that with **your mates**. The gym session becomes a fixture of the
group chat — with standings, deadlines, comebacks, theft, taunts and a charity
pot. You are never training alone; someone is always ahead of you or coming for
you. The game's promise, mechanically enforced (§4): **everyone has a genuine
shot until the last set.**

Three load-bearing ideas arrived fully formed in Ben's original brief
(docs/01 §2) and have survived every design pass unchanged:

1. **The "300" format** — a real training-ground game Ben brought with him:
   the group agrees on exercises, then any reps, any order, any mix, first to
   300 total. Self-balancing (you choose your own mix), zero setup friction,
   instantly understandable in one chat message. The name does half the
   marketing ("tonight we do a 300" needs no explanation to anyone who has
   ever seen *300*).
2. **The handicap system** — effort and consistency compete, not raw fitness.
   A couch player's push-up is *worth more* than an athlete's. This is the
   moat: golf proved decades ago that handicaps keep weak players paying;
   nobody in fitness does this well. It is also the hardest thing to get
   right — which is why it's defensible (§4).
3. **Taunting as a feature, charity as the stakes.** Banter is the content
   engine; filming a mate mid-set is the ad. The pot gives trash talk real
   consequence without gambling: **the winner directs the pot to charity —
   never receives it** (Nico's idea, adopted; legal structure pending,
   docs/01 §5). Losing money to a mate is a grudge; losing it to charity is a
   story.

Everything else in this document is those three ideas, elaborated.

---

## 2. The core loop

```
┌─ PREP ─────────────────────────────────────────────────────────────────────┐
│ crew picks play days + exercises → match created                           │
│ (waiting room + crew code) · bot: `rwf new` · app: create-battle screen    │
└────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─ EVERY PLAY DAY (e.g. Mon/Wed/Fri) — loops ────────────────────────────────┐
│                                                                            │
│  log reps ───▶ live standings ───▶ deadline pressure ──▶ day closes        │
│  (chat or app)   effort-adjusted    DZ1 ─▶ DZ2 ─▶ DZ3   21:00 AEST         │
│                   comeback armed   ≤3h    ≤1h   ≤30min       │             │
│                                                              ▼             │
│  DAILY WINNER + RECAP — "YOU WON TUESDAY" · MOMENTS · next day opens       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
    │  at any moment: the first RAW total to reach the target…
    ▼
┌─ FINALE ──────────────────────────────┐        ┌─ SEASON · 4 weeks ────────────┐
│ match CLOSES · closure bonus +15      │        │ 3/2/1 points · MVP +1         │
│ RESULT CARD + CHARITY POT             │ ─────▶ │ champion · A/B swap           │
│ (the winner directs the pot)          │        │ streaks · forgiveness $2      │
└───────────────────────────────────────┘        └───────────────────────────────┘
                   │
                   ▼
REMATCH — one tap, same crew, fresh pot ──▶ back to PREP
```

Each step, mapped to where it lives:

| Step | Where it's implemented (screen / bot command / engine) |
|---|---|
| Group picks play days + exercises | App: create-battle screen (`/figma-app`, shot `10-create-battle.png`) → `config.playDays`; bot: **`rwf new [target]`** (default 300) announces exercises + play days (`packages/bot-core/src/bus.ts`) |
| Match created | `createMatch()` — `apps/figma-app/engine.js` / `packages/game-core/src/match.ts`; waiting room with 5-char crew code (no 0/O/1/I) + QR/invite (`18-waiting-room.png`); bot `link <code>` binds the chat |
| Log reps from chat | **`log pushups 25!`** — trailing `!` = camera-verified; chains `applyComeback` → closure check (bus.ts `cmdLog`) |
| Log reps from app | Log sheet: bottom sheet, preset chips 5/10/20/30/50, camera toggle (`27-log-sheet.png`, `57-camera-note.png`) |
| Live standings (effort-adjusted) | `standings()` in engine — raw reps, adjusted score, progress %, verified %; app battle screen (`24-battle-live.png`); bot **`s`** replies with medal bars + ⚡ comeback markers + 👁 spectator count |
| Deadline pressure (danger zone) | `apps/figma-app/daily.js` `dangerLevel / dzCopy / deadlineClock` — 1-second app ticker; DZ1/2/3 chrome (§3.3) |
| Daily winner + recap | `closeDay / settleDay / recapFor` in daily.js — the day auto-closes at the 21:00 Australia/Sydney deadline, winner recorded to `dailyHistory`, recap card renders (`d48-recap-you-won.png`, `d59-recap-sam-took.png`) |
| Match closes at target | `logReps()` — the first log taking a player's **raw** total to ≥ target flips status to `complete`, stamps `closedBy`, logging locks |
| Result + charity pot | `finalStandings()` (closure bonus applied) → result screen (`38-39-result-final.png`), pot screens (`41-43-result-pot*.png`); engine `pot.ts`; bot **`result`** writes a 1200×675 SVG share card, **`pot 500`** = "$5.00 banked. Winner picks where it goes." |
| Season arc | `packages/game-core/src/season.ts` — `recordMatch` 3/2/1+MVP, `seasonLadder`, `endSeason`; app ladder screen (`48-49-season-ladder.png`); bot **`season new / ladder`** |
| Rematch | One tap in app (`45-46-rematch-live.png`); bot **`rematch`** / `again` / `runitback` — same roster/rules, fresh pot |

The loop is deliberately **chat-first**: every broadcast (standings, result
cards, taunts) is an ad seen by the whole group chat; spectators convert via
`watch <code>` (docs/01 §2 — "the second moat").

---

## 3. The battles

This is the founder's explicit ask: *map out the battles.* There are five
battle forms — three shipped, one designed, one genuinely open.

### 3.1 The Classic 300 *(shipped — the canonical form)*

- **Setup:** the crew agrees on 2–4 exercises and a play schedule (2–3
  days/week — anti-burnout by design; "rest day, never *missed day*").
  Default target 300 raw reps; a "Light" match is 150 (`new 150`).
- **Play:** any reps, any exercise from the agreed set, any order, any mix,
  from the chat or the app. Reps can be camera-verified (`log pushups 25!`).
- **Win condition — the twist that IS the product:** the first player to hit
  the **raw** target *closes* the match (logging locks instantly), but the
  winner is the highest **effort-adjusted** score at closure. The closer gets
  +15. An athlete can close on raw reps and still lose to a couch player who
  moved less but earned more per rep.

```
entry value   = reps × tierMultiplier × (comeback? ×1.2) × (lightning? ×3)
match winner  = max(Σ entry values), +15 to the player who closed
```

**Worked match (real numbers, from the live bot transcript — wiki → Bots):**
Target 150. Ben (couch ×1.5) logs 40 push-ups → **60 adj**. Nico (athlete
×0.85) logs 80 squats → **68 adj**. Ben is now >30% behind on raw (40 vs 80 →
gap 50%) → comeback armed ⚡. Ben logs 110 push-ups: 110 × 1.5 × 1.2 = **198**,
and his raw (150) hits the target → match closes, +15 closure bonus.
Final: **Ben 273** (60 + 198 + 15), Nico 68. Ben closed *and* won — but
against a fitter closer, the upset is live: if Nico had also finished, the
adjusted column decides, not the clock.

### 3.2 Fast Battle vs Custom Battle *(the two creation paths)*

Ben's Figma defines both; the app ships the creation flow, the bots ship the
one-line version.

| | **Fast Battle** | **Custom Battle** |
|---|---|---|
| Setup | One screen: name, days, exercise pack, target tier | 8-step wizard: schedule & clock → format → exercises & scoring → power-ups → stakes → review ("THE RULES, IN PLAIN ENGLISH") → create |
| Use it when | 95% of matches — Tuesday-night energy | Corporate leagues, charity specials, weird stakes |
| Where | `/figma-app` create flow (Figma `FLOW-02/03`); bot `new [target]` is the chat-native fast path | Designed in full fidelity in Ben's Figma; rules lock at start, everyone accepts the summary before joining |
| Stakes step | Defaults (bragging) | Bragging · dares · charity · cash-18+ (cash feature-flagged OFF pending legal, §6) |

### 3.3 Daily-rhythm multi-day battles *(shipped in the app — the hybrid, see 3.5)*

- **Setup:** a battle spans days — e.g. 2 weeks, active Mon/Wed/Fri. The group
  shares one clock: every play day ends **21:00 Australia/Sydney** (each player
  sees the local equivalent — the dual clock: "ends 9:00 PM AEST · 7:00 PM for
  you"). Time Freeze (+30 min, §5) is the only thing that moves a deadline.
- **Play:** log any time during the day. The final three hours escalate the
  **danger zone**: DZ1 ≤3h (gold chip) → DZ2 ≤1h (orange banner, pulse) →
  DZ3 ≤30min (red banner with live minute count — "DANGER ZONE — 24 MINUTES
  LEFT" — heartbeat on the timer, full screen wash, "LOG NOW"). Layout never
  changes; only colour and the timer escalate (motion law, docs/25).
- **Win condition:** at the deadline the day **closes itself exactly once** —
  logging locks, the day's winner (highest adjusted among *that day's* entries
  only) is recorded to `dailyHistory`, a recap renders, and the next play day
  begins. Tie-break: adjusted → raw reps → earliest first entry. A day nobody
  logs closes as "NOBODY LOGGED. BRUTAL DAY." (streaks survive; pride doesn't).
  Absences never chain-generate a pile of brutal days — only the boundary day
  auto-closes empty.
- **The recap card (FLOW-07):** "YOU WON TUESDAY" / "SAM TOOK TUESDAY" · your
  line ("You finished 2nd at 92% — 10 RUF short.") · the sting ("You led until
  7:04 PM. Tomorrow, finish the job.") · nemesis tease · MOMENTS strip
  (biggest set, comeback claimed, clean sweep, lead change) · tomorrow's
  stakes in your timezone.
- **Where:** all of it is `apps/figma-app/daily.js` (`isPlayDay /
  deadlineFor / dangerLevel / closeDay / settleDay / recapFor`), proven by
  `e2e-daily.mjs` which time-travels the whole ramp. Screens: `d13` calm →
  `d19` DZ1 → `d23` DZ2 → `d30` DZ3 → `d42` close → `d48/d59` recaps.

**Worked day (numbers via the documented formula):** You (casual ×1.25) log
40 push-ups at 7 AM → 50 adj. Sam (fit ×1.0) logs 60 squats at 6:30 PM →
60 adj. DZ2 fires at 8 PM. You log 20 push-ups at 8:20 — you're >30% behind
on raw (40 vs 60), comeback armed → 20 × 1.25 × 1.2 = 30 → **You 80, Sam 60**.
Day closes at 9 PM: *"YOU WON TUESDAY"* · "You beat Sam by 20 RUF today.
They're coming for you." · pot grew $3 since yesterday's close ·
"NEXT BATTLE DAY: WEDNESDAY — logs open now".

### 3.4 Crew vs Crew *(shipped in bots; corporate form designed)*

- **Setup:** two group chats, one match. Crew A's captain runs
  **`challenge <CREW-XXXX>`**, crew B accepts (`challenge accept`). Corporate
  variant in Ben's Figma: dept-vs-dept / office-vs-office with a
  **contribution floor** (team score only counts in full once every member
  clears ~40 RUF — nobody rides the bench) and an **Assist Boost** send CTA.
- **Play:** identical to the classic 300, standings merged across both chats;
  spectators in either chat see the combined board.
- **Win condition:** highest cumulative adjusted crew score at closure (bot
  `s` shows both crests); employer-funded charity pot is the cleanest stakes
  structure for this form (docs/08 §6).
- **Where:** bot `challenge` + `watch` (bus.ts, live today); team battles +
  contribution floor designed in Figma (V1.x); corporate surfaces seeded in
  the `/hub` console (aggregate-only, k≥5 suppression).

### 3.5 The rhythm decision — his model vs ours, honestly *(OPEN, §9 D3)*

This is the one genuine structural fork left in the battle design, and it
deserves a straight presentation rather than a dodge:

- **Ben's model (his Figma, built as designed in `/figma-app`):** multi-day
  battles, *personalised daily targets* in RUF — Light 60 / Solid 120 / Hero
  200, picked privately when joining — and the **daily winner is whoever hits
  the highest completion-% of their own target**. Every level can win the day;
  ability differences are hidden rather than spotlighted. Retention thesis:
  losers get a fresh start tomorrow, so the loop never feels over.
- **Our model (the bots / original engine):** one shared target (300), one
  match, first-to-close finale, handicap multipliers as the *visible
  spectacle* — the standings are a running argument about who's really trying.
- **What's actually shipped is the hybrid, and that's the honest answer:**
  the app runs Ben's rhythm (play days, nightly deadline, DZ ramp, daily
  winners, recaps) on top of our engine (shared target, tier multipliers,
  comeback, closure finale, charity pot). Daily winners give everyone a
  fresh start tomorrow; the 300 closure gives the match a real finale.
- **Recommendation:** keep the hybrid, and resolve the last sub-question —
  shared 300 target vs personalised RUF targets — at the founder call with
  both variants playable side by side (§9).

---

## 4. The handicap system (the moat)

*Thesis, verbatim from the code comment: effort and consistency compete, not
raw fitness.*

### 4.1 Tier multipliers (v1 — live)

Chosen at onboarding (self-set, socially policed), applied to every rep:

| Tier | Multiplier | 100 raw reps score as | Expected weekly volume (anti-sandbag baseline) |
|---|---|---|---|
| Couch | ×1.5 | 150 | 150 reps |
| Casual | ×1.25 | 125 | 250 reps |
| Fit | ×1.0 | 100 | 400 reps |
| Athlete | ×0.85 | 85 | 550 reps |

`TIER_MULTIPLIERS` — `apps/figma-app/engine.js` / `packages/game-core/src/handicap.ts`;
expected volumes: `TIER_EXPECTED_WEEKLY_REPS` in `baseline.ts`.

### 4.2 The comeback multiplier ×1.2 — "everyone has a shot", mechanically enforced

More than **30% behind the leader in raw reps** while the match is live → your
*next* entry is tagged ×1.2. Once per player per match. Eligibility recomputes
on every log; bot standings mark eligible players ⚡ so the group can see it
coming. The boost is **tagged onto the entry at log time**, not a global
multiplier — so it composes (a comeback entry inside a Lightning window scores
×1.2 ×3 = ×3.6, §5).

`COMEBACK_THRESHOLD = 0.3`, `COMEBACK_MULTIPLIER = 1.2` — `comeback.ts` / engine.js
`comebackEligible / applyComeback`.

### 4.3 The closure bonus +15

The player whose raw total hits the target first gets +15 adjusted points —
urgency and glory for the closer, but deliberately small enough that real
effort still beats raw speed. A closer who sandbagged their tier wins nothing:
+15 doesn't rescue a thin adjusted column. (Found by the test suite — a bug in
the original bonus placement was caught and fixed before it ever shipped.)

`CLOSURE_BONUS = 15` — engine.js / `match.ts` `finalStandings / winner`.

### 4.4 Effort handicap v2 — %HRR blend (engine-ready, waiting on strap data)

When an entry carries a measured `avgHrrPct` (heart-rate reserve %, Karvonen,
from a BLE strap) and the player has a learned baseline, the multiplier blends
live evidence with the declared tier:

```
effortMultiplier = 0.7 × (avgHrrPct / baselineHrrPct) + 0.3 × tierMultiplier
```

70% measured, 30% declared. This makes *effort itself* the score — a couch
player red-lining scores like a champion; an athlete phoning it in doesn't.
The blend math is implemented and tested; it activates the day heart-rate
straps land (docs/05 phasing).

`HRR_WEIGHT = 0.7` — `handicap.ts` / engine.js `effortMultiplier`.

### 4.5 Anti-sandbagging — baseline drift (engine-ready)

Self-reported tiers have a loophole: a ringer declares "couch" and farms the
×1.5. Two drift correctors close it (`baseline.ts`, gated to at most one tier
step per week):

- **HR path:** `baselineHrrPct` drifts toward your rolling measured average,
  max **10% per update** — you can't tank your baseline in a weekend.
- **Volume path:** consistently logging **>1.3× your tier's expected weekly
  volume** drifts your tier one step *fitter*. The "couch" player doing 5×
  everyone's reps quietly becomes a casual.

### 4.6 The couch-beats-athlete worked example

The full thesis in one table (target 150, from the bot transcript):

| | Ben — couch ×1.5 | Nico — athlete ×0.85 |
|---|---|---|
| Log 1 | 40 push-ups → 60.0 adj | — |
| Log 2 | — | 80 squats → 68.0 adj |
| State | 40 raw vs 80 raw → 50% behind → **comeback armed ⚡** | leading |
| Log 3 | 110 push-ups → 110×1.5×**1.2** = 198.0 → raw 150 → **CLOSES** | — |
| Final | **273.0** (60+198+15 closure) — **WINNER** | 68.0 |

The athlete did the bigger single set and led most of the match. The adjusted
column says: Ben tried harder per rep, from further back, when it counted.
That sentence is the product.

---

## 5. Power-ups & the economy

Four cards, live in the app (`/figma-app`, Figma `FLOW-05`; engine.js —
figma-app only, deliberately not yet in game-core). All activations are pure
functions returning a new match state + a result card; every activation is
audit-logged to `powerLog`.

| Card | Rarity (drop %) | Exact effect |
|---|---|---|
| ⚡ **Lightning Round** | legendary (5%) | Reps count **×3 for 10 minutes**. One *activation* per player per match — the window can expire, the once-per-match flag never resets. |
| 🗡 **Rep Steal** | epic (15%) | Take **10% of the leading rival's raw reps** (floor, min 1 while they're above zero), instantly. Both raw ledgers move; entries are logged as ledger transfers, so tier multipliers apply — a couch thief gains more adjusted than the athlete victim loses. |
| 🛡 **Shield** | common (50%) | **Blocks one Rep Steal** against you, then breaks. A blocked steal *never fires*: the shield is consumed, **the thief keeps their card** — the shield buys the block, not a free kill. |
| ⏱ **Time Freeze** | rare (30%) | **+30 minutes** on the play-day deadline, for everyone. The one card that bends time. |

**Drop odds** (`DROP_ODDS`): common 50 / rare 30 / epic 15 / legendary 5 —
daily-drop style, one card per battle day in the Figma economy. Rarity is
cosmetic in v1: chip colour + drop odds only, no mechanical effect.

**The counter-web is the design.** Lightning is capped at one activation so it
can't be chained. Steal targets only the *current* leading rival (preview
shows exactly what you'd take and whether a shield is up — `stealPreview`),
so you can't snipe someone harmless. Shield makes Steal honest: theft against
a prepared leader is a wasted card, so steals happen when someone has actually
run away with it — which is exactly when the table wants a correction. Steals
never trigger the closure check; only real logged reps close a match.

**Stacking rule:** comeback and lightning both tag the entry, so they
multiply — a couch player's comeback set inside a lightning window is
×1.5 ×1.2 ×3 = ×5.4 per rep. Rare, loud, and earned from behind. That's the
point.

**What is deliberately unpriced.** Nothing in the current build can be bought:
cards are granted (`grantPowerUp` / daily drop), never sold. Ben's Figma
designs the full economy — store packs ($1.99–$4.99), daily loot chest, Reps
Pro subscription with 12 inventory slots — under one hard rule we adopt
verbatim: **"Cosmetic and convenience only — you can't buy the win."** Whether
any of that ships in the MVP is open decision #4 (§9).

---

## 6. The social layer

- **Taunts (live).** Bot **`taunt <name>`** — AI-generated cheek via the
  server-side GLM proxy with canned fallback (2s timeout), because taunting
  is a feature, not abuse: the crew opted in by joining. Proposed: per-crew
  **roast-tier setting** — gentle / standard / feral — gates the AI engine
  (also the corporate-safe switch, docs/07 G-34). Line that must never move:
  cheeky, never mean; "rest day", never "missed day"; money screens drop all
  banter.
- **MVP vote (live).** One vote, best *effort* not winner, locks on tap.
  Feeds the season (+1 point) — the second podium, so showing up hard with a
  bad multiplier still gets recognised.
- **Nemesis (live).** Auto-detected from head-to-head history: your nemesis
  is the opponent who has beaten you the most, with ≥2 shared matches and ≥1
  loss (someone you always beat is prey, not a rival). Bot `nemesis`; shown
  on profiles and result cards — every player gets a personal storyline, not
  just the leaders'. `packages/game-core/src/nemesis.ts`.
- **Photo finish (live).** Top two within **5%** adjusted → special result
  card + slow-mo styling. Manufactures shareable drama from close matches.
  `photo-finish.ts`, `PHOTO_FINISH_PCT = 5`.
- **Monday digest (live).** AI-written weekly recap auto-postable to the
  chat: results, margins, MVPs, pot total, rivalry callout, one-liner. Bot
  `digest` / alias `monday`; `packages/bot-core/src/digest.ts`. Re-opens the
  loop every week without anyone lifting a finger.
- **Spectators (live).** `watch <code>` — read-only standings of another crew
  in your chat; standings show 👁 count. Spectators are the funnel: they see
  the leaderboard without joining, and joining is one command.
- **Result cards — the viral artefact (live).** Every match end auto-
  generates a branded 1200×675 card (SVG from the bots — `/cards/…`, PNG
  export from the app). Direction adopted from Ben's file: **server-rendered,
  no health data, pre-written editable message, join link** — every result
  card is an ad with a call to action.
- **Drop-cam (proposed).** 10-second clip capture during verified sets —
  Ben's "friends filming friends" content engine (docs/07 C-14).
- **The charity pot ritual (live as a pledge ledger).** Players chip in
  (`pot 500` = $5.00); at result time the **winner directs** the pot to a
  charity of their choice (`designate`) — a dedicated picker screen, the one
  moment the product goes quiet and warm. Pot growth is recapped daily
  (`potDeltaCents` — growth since the previous day's close).
- **The legal line.** No cash ever moves to a winner; the pot is a pledge
  ledger today and stays one until a proper legal opinion lands (AU
  state-law raffle/betting classification risk — docs/01 §5, docs/08 §6).
  **Employer-funded pots are the clean interim structure** — the company
  puts the money in, the winning crew directs it; nothing to classify.
  Ben's full cash-wagers suite (KYC, regions, responsible-play limits,
  separate ledger, never the word "escrow") is designed behind a
  feature flag and stays there (§9, D17).

---

## 7. Progression & retention

The retention stack answers the week-3 cliff (docs/01 §5) with four layers —
each one cheap, each compounding:

1. **Seasons (live).** 4-week series. Every finished match feeds
   `recordMatch`: 1st +3, 2nd +2, 3rd +1, MVP vote +1. Ladder sorts
   points → wins → MVPs. At season end: champion crowned (the belt —
   physical trophies proposed, docs/07 F), and **A/B division swap** —
   bottom of A ↔ top of B — so mid-table stays meaningful all season.
   `season.ts`; app `48-49-season-ladder.png`; bot `season ladder`.
2. **Streaks + forgiveness (live).** Streaks count *played weeks* (you chose
   your days — no streak guilt for resting). A streak about to break can be
   saved **once per season** by topping the charity pot **≥ $2** —
   preserved, not extended. Guilt converts to pot money; no free rides
   (`FORGIVE_MIN_CENTS = 200`, `forgiveStreak`).
3. **The avatar/creature system — the identity layer (in active build).**
   The founder's tamagotchi concept: your avatar **evolves with your
   training**. The reference creature is the dragon — three stages already
   modelled and rigged: **Hatchling** (round, stub-winged, all eyes) →
   **Fledgling** (wings come in, nub horns, first spikes) → **Elder**
   (`site/avatar-styles/dragon2.js` — stages driven by a `stage` param,
   ready to wire to season/streak milestones). Learned the hard way
   (documented post-mortem, `notes_avatars_investigation.md`): creatures are
   built on a **dedicated creature rig** (`site/creature-rig.js`, horizontal
   silhouette — a dragon doesn't squat), never as humans-in-suits. The same
   pipeline already carries 11 humanoid styles + 12 rigged GLBs across
   species; the Outfit Atelier (`/atelier`) stress-tests garments through
   every extreme exercise pose. Design intent: your creature grows when you
   show up — the identity layer makes absence *visible* and progress
   *adorable*.
4. **Awards & badges (designed, from Ben's file — adopt).** Auto-computed on
   final results: 🏅 most consistent · 🚀 best comeback · ⚡ most active ·
   💪 personal best — zero coordination, covers the "effort ≠ winning" value
   the MVP vote serves. Plus PB detection cards for the non-competitive half
   (docs/07 G-29).

Non-winner retention is a stated design lane in Ben's architecture ("the loop
must create a social ripple even when you lose") and everything above feeds
it: comeback, MVP, awards, nemesis, revenge rematch prompts, daily fresh
starts.

---

## 8. Verification & fairness — the trust ladder

The existential technical problem (docs/01 §5): if reps are self-reported the
game is a lying contest; if verification is annoying nobody plays. The answer
is a ladder, not a gate — every rung is optional and every rung is visible:

| Rung | Mechanism | Status |
|---|---|---|
| 1 · Honour | Self-report + socially-policed tier + crew chat visibility (liar gets roasted) | Live — the default |
| 2 · Camera | In-browser pose counting (MoveNet; push-ups/squats via angle-threshold state machine). **On-device only — no video ever leaves the phone.** Entry logs `verified:true`; standings show each player's **verified %** | Live in app (`apps/web/src/verify/`); bot grammar `log pushups 25!` |
| 3 · Heart rate | BLE straps via Web Bluetooth (GATT 0x180D), Karvonen %HRR per set → `avgHrrPct` on the entry → feeds the v2 handicap blend (§4.4) — *effort becomes verifiable even when reps aren't* | Engine live; strap hardware pending (docs/05) |
| 4 · Peers | Long-press any log → challenge (typo / impossible pace / repeated pattern), anonymous, 3 per battle, misuse lowers your trust score; dispute timeline; admin queue | Designed in Ben's Figma (V1) — sequence decision §9 |
| 5 · Cloud | Apple Watch / HealthKit, WHOOP/Garmin cross-check, recovery-adjusted handicap | Phase 3 (docs/05) |

Server-authoritative everything (Ben's engineering posture, adopted): the
server computes all scoring, multipliers and deadlines; the client never
decides a danger-zone level. The camera rung is deliberately the *positive*
verification ("honest by design" — show off) with peer challenge as the
*social* backstop, in that order (the sequencing itself is one of the adjacent
open calls, §9).

---

## 9. The five open decisions

Full evidence and the 30-row divergence log: `figma/notes/analysis.md` (§4,
§6 — the founder-call one-pager). The five that reshape the game:

### ① Fairness model — *the deepest divergence*
- **Ben's design:** personalised daily targets (Light 60 / Solid 120 / Hero
  200 RUF), winner = completion-% of *your own* target; tier private.
  Ability differences hidden — privacy, simple math, "every level can win
  the day".
- **Our build:** shared target + tier multipliers; the handicap is the
  spectacle — effort visible in the numbers.
- **Recommended hybrid:** personalised targets *and* our comeback multiplier
  on top (both "everyone can win" mechanics, one hidden one visible).
- **Downstream:** standings math, comeback triggers, result cards, the whole
  adjusted-score narrative reshape around this. Decide first.

### ② Platform / distribution
- **Ben:** native app, app-store IAP, push notifications (DZ nudges basically
  require push).
- **Ours (shipped):** PWA + WhatsApp/Slack bots day one — no install, <30s
  cold start, the chat IS the arena. The bots are built and are the
  differentiation.
- **Recommended:** staged — bots + PWA now, native when retention is proven.
- **Downstream:** onboarding (12-screen native flow vs our <20s name+tier),
  notification strategy, payments.

### ③ Battle rhythm
- **Ben:** daily winners inside multi-day battles + nightly danger zone.
- **Ours:** single match to 300 with the close-moment finale.
- **What's built:** the hybrid — daily winners + DZ *on top of* the 300
  closure (§3.5), running in `/figma-app` today.
- **Recommended:** keep the hybrid; settle the shared-target vs personalised-
  target sub-question with both playable side by side.
- **Downstream:** if daily rhythm fully wins, seasons become its container
  and the closure finale becomes the season finale.

### ④ Power-ups in the MVP?
- **Ben:** 4 power-ups + rarity + daily drop + store + Pro inventory slots in
  the launch gate — the monetisation spine.
- **Ours (shipped):** the same 4 power-ups, fully mechanised app-side; no
  store, no prices, drops only.
- **Recommended:** ship the four cards (they're done and tested), hold the
  store/Pro economy for post-retention-proof. Never break: "you can't buy
  the win."
- **Downstream:** a whole component family (cards, chest, banners) and the
  Pro paywall design hang on this.

### ⑤ Brand — gold vs lime
- **Ben's file:** gold `#FFC821` + purple `#8B5CF6` + Anton/Inter, domain
  reps.fit — "game" energy; he flags the palette as needing sign-off.
- **Ours:** lime `#c6f32e` + coral `#ff5c38` + Space Grotesk, rwf.app —
  "athletic" energy.
- **Where it stands:** **both now exist as complete, switchable themes**
  (`/styles` — Lime Athletic, Gold Arcade, Sunset Brutalist, Midnight Neon,
  Forest Retro); the test app ships Anton + Inter *and* Space Grotesk. This
  is now a founder-taste call, not a build problem.
- **Downstream:** D5/D6 lock → tokens map 1:1 (`figma/notes` F3-ready), the
  Figma variable table converts, the domain registers.

Adjacent decisions already leaning resolved — money at launch (charity-only,
wagers flagged; D17) and verification sequence (camera MVP → peer challenges
V1; D10) — both with Ben's craft adopted and our shipped work kept.

---

## 10. Numbers appendix — every constant, one table

All values verified against the code on 2 Sep 2026. Any change to a number
here must update this table, the wiki Game Rules page, and the tests.

| Constant | Value | Where it lives |
|---|---|---|
| Default match target | 300 raw reps ("Light" = 150) | `match.ts` / engine.js `createMatch` · bot `new [target]` |
| Tier multipliers | couch ×1.5 · casual ×1.25 · fit ×1.0 · athlete ×0.85 | `TIER_MULTIPLIERS` — engine.js / `handicap.ts` |
| Comeback threshold | >30% behind leader (raw) | `COMEBACK_THRESHOLD = 0.3` — `comeback.ts` / engine.js |
| Comeback multiplier | ×1.2, once per player per match, tagged on entry | `COMEBACK_MULTIPLIER` — `comeback.ts` / engine.js |
| Closure bonus | +15 adjusted, to the closer only | `CLOSURE_BONUS` — engine.js / `match.ts` |
| Lightning window | 10 minutes, ×3 rep value, 1 activation/player/match | `LIGHTNING_MS`, `LIGHTNING_MULTIPLIER` — engine.js |
| Rep Steal share | 10% of leading rival's raw (floor, min 1) | `STEAL_SHARE = 0.1` — engine.js |
| Time Freeze | +30 min on the deadline | `FREEZE_MS` — engine.js |
| Power-up drop odds | common 50% · rare 30% · epic 15% · legendary 5% | `DROP_ODDS` — engine.js |
| Play-day deadline | 21:00 Australia/Sydney (dual clock; freeze extends) | `daily.js` `deadlineFor` · `state.js playDayEndMs` |
| Danger zone ramp | DZ1 ≤3h gold · DZ2 ≤1h orange · DZ3 ≤30min red | `daily.js dangerLevel` |
| Daily tie-break | adjusted → raw reps → earliest first entry | `daily.js dailyStandings` |
| HR blend weight | 0.7 measured + 0.3 declared tier (v2) | `HRR_WEIGHT` — `handicap.ts` / engine.js |
| Baseline HR drift | max 10% per update | `HR_DRIFT_MAX = 0.1` — `baseline.ts` |
| Sandbag volume ratio | >1.3× expected weekly reps → drift one tier fitter (max 1 step/week) | `VOLUME_SANDBAG_RATIO = 1.3` — `baseline.ts` |
| Expected weekly reps/tier | 150 / 250 / 400 / 550 (couch→athlete) | `TIER_EXPECTED_WEEKLY_REPS` — `baseline.ts` |
| Photo finish | top two within 5% of leader's adjusted | `PHOTO_FINISH_PCT = 5` — `photo-finish.ts` |
| Season length | 4 weeks | `season.ts createSeason` |
| Season points | 1st +3 · 2nd +2 · 3rd +1 · MVP +1 | `recordMatch` — `season.ts` / engine.js |
| Streak forgiveness | ≥ $2 to pot, once per season, preserves (not extends) | `FORGIVE_MIN_CENTS = 200` — `season.ts` / engine.js |
| Nemesis eligibility | ≥2 shared matches, ≥1 loss | `nemesis.ts` |
| Result card | 1200×675 (16:9), SVG from bots / PNG from app | `packages/bot-core/src/card-image.ts` |
| Crew code | `CREW-XXXXX`, 5 chars, alphabet excludes 0/O/1/I (design rule) | docs/13 §21 · generated in `apps/figma-app/state.js crewCode()` |
| Bot commands | 15 commands + aliases (`s`,`h`,`again`,`runitback`,`nem`,`monday`) | `bus.ts COMMANDS / ALIASES` · wiki → Bots |

**Proof of correctness** (run any of these yourself):

```bash
cd packages/game-core && bun test   # 59 tests, 134 expect() calls — engine spec
cd apps/figma-app   && bun test engine.test.js   # 23 parity tests: TS vs JS side by side
cd packages/bot-core && bun test    # 64 tests — command bus, cards, AI fallback
cd apps/figma-app   && bun e2e.mjs && bun e2e-daily.mjs   # full app walks, injected time
```

90+ green across the repo, CI-gated on every push (docs/17).

---

*Cross-links: [docs/25_DESIGN_BRIEF.md](25_DESIGN_BRIEF.md) (design handout) ·
[docs/01](01_BUSINESS_ANALYSIS.md) (Ben's brief + market) · [docs/02](02_MASTER_PLAN.md)
(phasing) · [docs/05](05_RESEARCH_WEARABLES.md) (verification research) ·
[docs/07](07_BRAINSTORM_ELEMENTS.md) (element backlog A–G) · [docs/08](08_LAUNCH_REQUIREMENTS.md)
(legal) · [docs/11](11_SYSTEMS_OVERVIEW.md) (systems) · [docs/13](13_MVP_DESIGN.md)
(our MVP spec + 30-row divergence log) · [docs/17](17_FEATURES_AND_PROGRESS.md)
(progress) · `figma/notes/analysis.md` (the Figma audit + founder-call one-pager) ·
wiki: `/wiki/game.html`, `/wiki/app.html`, `/wiki/bots.html`,
`/wiki/verification.html`, `/wiki/avatars.html`, `/wiki/status.html`.*
