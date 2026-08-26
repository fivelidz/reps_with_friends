# RWF — MVP Product Design Spec

*Version 1.0 · 26 Aug 2026 · Lane: MVP · Status: **OUR design, written BEFORE seeing the founder-collaborator's Figma.***

This document is deliberately independent and opinionated. It was produced from
the master plan (doc 02), the approved element backlog (doc 07), the systems
overview (doc 11) and the shipped design tokens — **without** looking at the
incoming Figma blueprint. When the Figma arrives we audit it against §7
(Divergence log) and negotiate from a position of knowing exactly what we
believe and why.

---

## 1. Design language

### 1.1 Tokens (canonical: `design/tokens.css` — import, never fork)

| Token | Value | Meaning |
|---|---|---|
| `--bg` | `#0a0b0d` | App background — near-black, athletic |
| `--surface` | `#121418` | Cards |
| `--surface-2` | `#1a1d23` | Raised elements, buttons |
| `--line` / `--line-bright` | `#23262d` / `#31353e` | Hairlines / hover lines |
| `--text` / `--muted` / `--faint` | `#e8eaed` / `#9aa0a8` / `#5f646d` | Primary / secondary / decorative only |
| `--lime` | `#c6f32e` | **Primary.** Energy, verified, action, winning |
| `--coral` | `#ff5c38` | **Effort.** HR, heat, comeback, "go" |
| `--amber` | `#ffb020` | Warning, pending, unverified |
| `--sky` | `#6ec1ff` | Info, Slack, corporate |
| `--font-display/body` | Space Grotesk | One family, weights carry hierarchy |
| `--font-mono` | ui-monospace stack | **All numbers.** Scores, reps, codes, timers |
| `--radius` / `--radius-sm` | 14px / 9px | Cards / inner elements |
| `--pill` | 999px | Buttons, chips, badges |
| `--ease` | `160ms cubic-bezier(0.2, 0.7, 0.2, 1)` | The only transition |

**Colour rules (strict):**
- Lime is *earned*: verified reps, leading position, primary CTA. Never decorative filler — scarcity keeps it meaningful.
- Coral marks *effort and heat*: comeback badges, HR zones, the "LOG" verb. It never means error (that's coral only with an icon + text; amber is pending).
- One lime CTA per screen. Everything else is a secondary pill or text link.
- Numbers are always mono — a score must read like a scoreboard, not prose.

### 1.2 Type system

| Style | Spec | Use |
|---|---|---|
| Display XL | Space Grotesk 700, UPPERCASE, 34–40px, tracking +0.02em | Screen titles, "MATCH LIVE" |
| Display L | 700, UPPERCASE, 24px | Card headers, section labels |
| Body | 400/500, 15–16px | Everything readable |
| Meta | 600, 11px, UPPERCASE, tracking 0.14em | Tags, labels, `.rwf-tag` |
| Numeric | mono 700, tabular | Scores, reps, pot totals |

Uppercase display is the brand voice made visual: loud, blunt, scoreboard-like.
Never uppercase body copy or sentences — only labels and display.

### 1.3 Motion principles

1. **160ms is the law.** Every hover/press/state change uses `--ease`. Nothing
   slower for interaction feedback; nothing faster.
2. **Content arrives, chrome doesn't move.** New standings rows slide in
   (translateY 18px + fade, 500ms — the `.reveal` primitive); nav and layout
   never jump.
3. **Score changes animate the number, not the layout.** A logged rep bumps the
   score with a quick scale-pulse (1.0 → 1.06 → 1.0, 320ms) and the progress
   bar width eases to its new value.
4. **Comeback is the loudest moment in the product.** When ⚡ arms/applies:
   coral glow pulse on the badge + toast. It's a game-feel event, budgeted to
   one per player per match.
5. **Reduced motion honoured globally** (§5): all transforms/transitions collapse
   to opacity-only or instant.

### 1.4 Voice & tone — "cheeky but never mean"

Aussie register, matey, short. The product talks like the group chat's funniest
mate — not a coach, not a corporation.

- **Do:** "Oi, Dave's closing it in 🚨", "Couch tier carrying the group again,
  love to see it", "That's the set done. Hydrate, legend."
- **Never:** body-shaming, ability-shaming, gendered jabs, anything that would
  land badly if a stranger read the chat. The taunt engine roasts *effort
  gaps*, never *people*.
- Charity framing is always warm: "Winner directs the pot" — generosity is the
  punchline of every match, which is what makes the trash talk safe.
- Microcopy is uppercase-short: "LOG 20 PUSH-UPS", not "Please log your
  push-ups here".
- Errors are human: "That crew code's not right — check for typos, not
  sabotage."

### 1.5 Iconography

- **Line icons, 1.5px stroke, 20/24px grid, rounded joins** — matches Space
  Grotesk's geometric warmth. No filled emoji-style icons in chrome (emoji are
  allowed *inside chat content* like taunts, because that's the chat's native
  language, not ours).
- Status is colour + shape, never colour alone: verified = lime check, pending
  = amber clock, unverified = hollow circle.
- The ⚡ glyph is reserved exclusively for comeback. 🏆 reserved for match
  winner / season champion. Belt icon reserved for season champion.
- Icons are inline SVG in a single sprite — no icon font, no CDN.

---

## 2. Screen inventory (12 screens)

Phone-first, 390×844 reference. Every screen: sticky topbar (back chevron +
title + context dot), content, and where relevant a single primary pill CTA.
ASCII wireframes show structure, not final pixels.

### 2.1 Onboard

**Purpose:** identity + handicap in under 20 seconds. First-run only.
**Primary action:** `LET'S GO` (disabled until name entered).
**Data shown:** name field; four tier cards (COUCH 1.5× / CASUAL 1.2× / FIT 1.0×
/ ATHLETE 0.85×) each with a one-line self-description; multiplier shown as
mono chip.

```
┌──────────────────────────────┐
│                              │
│   REPS WITH FRIENDS          │  ← display XL, lime full stop
│   First in, first served.    │  ← muted tagline
│                              │
│  ┌────────────────────────┐  │
│  │ YOUR NAME              │  │
│  │ ┌────────────────────┐ │  │
│  │ │ Alexei            │ │  │
│  │ └────────────────────┘ │  │
│  └────────────────────────┘  │
│                              │
│  HOW FIT ARE YOU, HONESTLY?  │
│  ┌────────────────────────┐  │
│  │ COUCH        ×1.5      │  │  ← selected: lime border+glow
│  │ "Dusty. But keen."     │  │
│  ├────────────────────────┤  │
│  │ CASUAL       ×1.2      │  │
│  │ "Weekend warrior"      │  │
│  ├────────────────────────┤  │
│  │ FIT          ×1.0      │  │
│  ├────────────────────────┤  │
│  │ ATHLETE      ×0.85     │  │
│  └────────────────────────┘  │
│  Tier is adjustable later.   │  ← faint, 12px
│                              │
│  ┌────────────────────────┐  │
│  │        LET'S GO        │  │  ← primary pill, lime
│  └────────────────────────┘  │
└──────────────────────────────┘
```

**Edge cases:** empty name → CTA disabled with hint "Gotta have a name to
taunt"; name >20 chars → truncate visually, keep full; tier preselects CASUAL
(social default — nobody admits couch unprompted, but they'll pick it when
it's highlighted as an *advantage*).

### 2.2 Crew Home

**Purpose:** the hub. One glance = what's live, who's in, where the season
stands.
**Primary action:** resume the live match (card CTA), else `NEW MATCH`.
**Data shown:** active match card (target, days left, mini standings top-3),
crew roster with tier badges + status dots, season strip (week x of y, leader),
invite code block.

```
┌──────────────────────────────┐
│ ‹  THE BOYS          ● live  │
│──────────────────────────────│
│ ┌──────────────────────────┐ │
│ │ MATCH LIVE   ⏳ 2d left   │ │  ← coral LIVE tag, mono timer
│ │ TARGET 300 · PUSH/SQAT/PL │ │
│ │ 1 Dave      142.5  ▓▓▓░░ │ │  ← mini standings, top 3
│ │ 2 Alexei    118.0  ▓▓░░░ │ │
│ │ 3 Nico       96.4  ▓░░░░ │ │
│ │ [   OPEN MATCH →   ]     │ │  ← primary pill
│ └──────────────────────────┘ │
│ SEASON 2 · WEEK 3 OF 4       │
│ ┌──────────────────────────┐ │
│ │ 🏆 Dave 7pts · Nic 5 ·   │ │  ← ladder strip → Season
│ └──────────────────────────┘ │
│ CREW · 5 PLAYERS             │
│ ┌──────────────────────────┐ │
│ │ (D) Dave    [ATHLETE] ●  │ │
│ │ (A) Alexei  [CASUAL]  ●  │ │
│ │ (N) Nico    [COUCH ]  ○  │ │  ← idle dot = no reps today
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ CREW CODE  K7Q2M  [copy] │ │  ← mono, tap to copy
│ └──────────────────────────┘ │
│           ( + NEW MATCH )    │  ← floating pill
└──────────────────────────────┘
```

**Edge cases:** no crew yet → empty state (§2.12) with "CREATE OR JOIN" split
CTA; match complete but result unseen → result card replaces match card with
"SEE RESULT" urgency styling; >8 players → roster collapses to 5 + "+3 more".

### 2.3 New Match

**Purpose:** configure a 300-format match in ~30s.
**Primary action:** `START MATCH`.
**Data shown:** exercise chip picker (curated set + custom), target stepper
(100–1000, default 300), play-day selector (M T W T F S S), summary line.

```
┌──────────────────────────────┐
│ ‹  NEW MATCH                 │
│──────────────────────────────│
│ PICK YOUR PAIN (2–5)         │
│ [✕ PUSH-UPS] [✕ SQUATS]      │
│ [ LUNGES ] [ PLANK ] [ BURPEE│
│  ] [ SIT-UPS ] [ + CUSTOM ]  │
│                              │
│ TARGET REPS                  │
│   ( − )   300   ( + )        │  ← mono, step 50
│   first to RAW 300 closes    │
│                              │
│ PLAY DAYS                    │
│  M T [W] T [F] S S           │  ← lime = committed
│                              │
│ ┌──────────────────────────┐ │
│ │ 5 PLAYERS IN · HANDICAP  │ │
│ │ ON · WINNER DIRECTS POT  │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │      START MATCH         │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Edge cases:** <2 exercises → CTA disabled, hint "Pick at least 2, hero";
<2 players → inline "invite more" link (match can still start solo for
testing, flagged); custom exercise name >16 chars → truncate chip.

### 2.4 Link Chats

**Purpose:** connect the match to where it actually happens — the group chat.
Shown once after match start (and reachable from Crew Home).
**Primary action:** `COPY INVITE` / platform connect buttons.
**Data shown:** WhatsApp + Slack connect rows with status dots, shareable
invite link (join code embedded), bot command cheatsheet.

```
┌──────────────────────────────┐
│ ‹  LINK CHATS                │
│──────────────────────────────│
│ The chat is the arena.       │
│ The app is the scoreboard.   │
│                              │
│ ┌──────────────────────────┐ │
│ │ WHATSAPP        ● linked │ │
│ │ #footy-boys group        │ │
│ ├──────────────────────────┤ │
│ │ SLACK           ○ not    │ │
│ │ add for work crews       │ │
│ └──────────────────────────┘ │
│                              │
│ INVITE LINK                  │
│ ┌──────────────────────────┐ │
│ │ rwf.app/j/K7Q2M   [copy] │ │  ← mono
│ └──────────────────────────┘ │
│ Anyone with this link joins  │
│ in under 30 seconds.         │
│                              │
│ IN THE CHAT, TYPE:           │
│ ┌──────────────────────────┐ │
│ │ !rwf s      standings    │ │
│ │ !rwf log pushups 20!     │ │
│ │ !rwf taunt @dave         │ │
│ │ !rwf result  match card  │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │     GO TO MATCH →        │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Edge cases:** no messaging app on device → share sheet fallback; link
revoked when match closes; QR variant of the code block for IRL gyms.

### 2.5 Match Live

**Purpose:** the scoreboard. Live standings, urgency, the comeback drama.
**Primary action:** `LOG REPS` (persistent bottom bar).
**Data shown:** full standings (rank, avatar, name+tier, verified %, comeback
badge, adjusted score mono, raw, progress bar), leader flag, taunt feed (last
3), play-day strip, AI narrator line.

```
┌──────────────────────────────┐
│ ‹  MATCH LIVE       ⏳ 2d 4h │
│──────────────────────────────│
│ TARGET 300 · PUSH/SQT/PLNK   │
│ ┌──────────────────────────┐ │
│ │ 1 (D) Dave [ATH] 92% ✓   │ │
│ │   142.5    ▓▓▓▓▓▓░░ LEAD │ │
│ │ 2 (A) Alexei [CAS] 40% ✓ │ │
│ │   118.0    ▓▓▓▓░░░░      │ │
│ │ 3 (N) Nico [COU] 0%      │ │
│ │   ⚡ COMEBACK ×1.2 ARMED │ │  ← coral badge, pulses
│ │    96.4    ▓▓▓░░░░       │ │
│ │ 4 (S) Sam  [FIT] 12%     │ │
│ │    61.2    ▓░░░░░        │ │
│ └──────────────────────────┘ │
│ 🎙️ "Nico's gone quiet. The   │
│    couch tier lurks."        │  ← narrator, muted
│ ┌──────────────────────────┐ │
│ │ 💬 Dave: "morning reps    │ │
│ │   done, peasants"         │ │  ← taunt feed
│ │ 💬 Alexei: "sandbagging"  │ │
│ └──────────────────────────┘ │
│──────────────────────────────│
│ ┌──────────────────────────┐ │
│ │  LOG REPS      TAUNT 💬  │ │  ← sticky bottom bar
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Edge cases:** tie for lead → both get LEADING flag; player >30% behind and
unarmed → badge shows ARMED (armed = will apply on next entry); match closes
while viewing → full-screen close moment (coral→lime sweep) then auto-route to
Result; offline → banner "Showing last known score" + queue local logs.

### 2.6 Log Reps

**Purpose:** the only screen where the user *works*. Friction is the enemy.
**Primary action:** `LOG 20 PUSH-UPS` (label updates live).
**Data shown:** exercise chips, count stepper (±1, ±10), camera verify toggle
with live pose-count readout, verification status, my running total.

```
┌──────────────────────────────┐
│ ✕  LOG REPS            ● live│
│──────────────────────────────│
│ [PUSH-UPS] [SQUATS] [PLANK]  │  ← selected = lime
│                              │
│      ( −10 ) ( −1 )          │
│        ┌────────┐            │
│        │   20   │            │  ← mono 64px
│        └────────┘            │
│      ( +1 ) ( +10 )          │
│                              │
│ ┌──────────────────────────┐ │
│ │ 📷 VERIFY WITH CAMERA  ◉ │ │
│ │ ┌──────────────────────┐ │ │
│ │ │  (pose-count view)   │ │ │  ← MoveNet overlay,
│ │ │   COUNT: 14          │ │ │    rep dots bottom
│ │ └──────────────────────┘ │ │
│ │ ✓ counted = verified    │ │
│ └──────────────────────────┘ │
│ MY TOTAL: 80 / 300 raw       │
│──────────────────────────────│
│ ┌──────────────────────────┐ │
│ │    LOG 20 PUSH-UPS      │ │  ← primary, full width
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Edge cases:** camera denied → manual entry continues, entry logged
unverified (amber); pose count disagrees with stepper → camera wins when
verify on; reps that close the match → confirm sheet "This closes the match —
sure?"; >500 in one set → sanity sheet "Bold claim. Verified only."

### 2.7 Result + MVP Vote

**Purpose:** the payoff and the viral artefact. Podium, MVP vote, pot, share.
**Primary action:** `SHARE RESULT CARD`.
**Data shown:** winner banner (adjusted score + closure bonus note), full
final standings, MVP vote chips (one vote, any player, not just winner),
charity pot card, canvas result card preview (1200×675) with download.

```
┌──────────────────────────────┐
│ ‹  FULL TIME                 │
│──────────────────────────────│
│      🏆 DAVE TAKES IT        │
│   157.5 adjusted · closed it │
│      +15 closure bonus       │
│ ┌──────────────────────────┐ │
│ │ 2 Alexei 138.0           │ │
│ │ 3 Nico    121.7 ⚡cb     │ │
│ │ 4 Sam     110.4          │ │
│ └──────────────────────────┘ │
│ MVP VOTE — best effort, not  │
│ winner. One vote.            │
│ [(D)][(A)][(N) ⚡][(S)]      │  ← tap once, locks
│ 3 of 5 voted · waiting on 2  │
│ ┌──────────────────────────┐ │
│ │ ❤ CHARITY POT   $14.00   │ │
│ │ Dave directs → [charity] │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ ┌──────────────────────┐ │ │
│ │ │  [RESULT CARD 16:9]  │ │ │  ← branded, screenshot-
│ │ └──────────────────────┘ │ │    worthy
│ │  SHARE   ·   DOWNLOAD   │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Edge cases:** MVP vote pending others → "waiting" state, can navigate away,
vote locks on tap with undo window (5s); winner ≠ closer → banner explains
"Alexei closed it, Dave out-scored him — that's the handicap"; no pot
contributions → pot card shows "loser's round is $0 — brave."

### 2.8 Season Ladder

**Purpose:** the long arc. Points, streaks, divisions, the belt.
**Primary action:** `NEW WEEK MATCH` (or `START SEASON` when none).
**Data shown:** week strip (played weeks lime), ladder rows (points mono,
W/MVP counts, streak flame, division badge A/B), champion belt banner when
over, streak-forgiveness affordance.

```
┌──────────────────────────────┐
│ ‹  SEASON 2                  │
│──────────────────────────────│
│  W1  W2 [W3] W4              │  ← current week outlined
│ ┌──────────────────────────┐ │
│ │ 1 (D) Dave   7pts        │ │
│ │   2W · 1MVP · 🔥3 [A]    │ │
│ │ 2 (N) Nico   5pts        │ │
│ │   0W · 2MVP · 🔥3 [A]    │ │
│ │ 3 (A) Alexei 4pts        │ │
│ │   1W · 🔥2 [A]           │ │
│ │ 4 (S) Sam    2pts        │ │
│ │   streak broken [B]      │ │
│ │   [❤ FORGIVE — $2 to pot]│ │  ← once per season
│ └──────────────────────────┘ │
│ 3/2/1 points · MVP +1 ·      │
│ winner 3 · top of B promotes │
│──────────────────────────────│
│ ┌──────────────────────────┐ │
│ │    NEW WEEK MATCH       │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Edge cases:** season over → belt banner "DAVE — SEASON 2 CHAMPION" +
relegation/promotion callout + `START SEASON 3`; tie on points → wins, then
MVPs, then alphabetical (engine rule — surface it in a tooltip); forgiveness
already used → row shows "forgiven ❤" tag, button gone.

### 2.9 Profile / History

**Purpose:** identity, stats, tier honesty, the archive.
**Primary action:** edit tier (opens sheet).
**Data shown:** player card (avatar, name, tier badge + multiplier), season
stats (matches, wins, MVPs, comebacks, verified %), tier editor with warning,
match history list (result, score, placement chip).

```
┌──────────────────────────────┐
│ ‹  PROFILE                   │
│──────────────────────────────┐
│      (A)                      │
│    ALEXEI [CASUAL ×1.2]      │
│    member since Aug 2026      │
│ ┌──────────────────────────┐ │
│ │ 12 MATCHES  3 W  2 MVP   │ │
│ │ 4 COMEBACKS  61% VERIFIED│ │
│ └──────────────────────────┘ │
│ TIER                         │
│ ┌──────────────────────────┐ │
│ │ CASUAL ×1.2   [ CHANGE ] │ │
│ │ ⚠ crew can flag tier     │ │
│ └──────────────────────────┘ │
│ HISTORY                      │
│ ┌──────────────────────────┐ │
│ │ W Match #12  157.5  [1st]│ │
│ │ L Match #11  121.7  [3rd]│ │
│ │ L Match #10   98.0  [4th]│ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Edge cases:** tier change mid-season → applies next match, history keeps old
multiplier (audit trail); flagged for sandbagging → amber banner "3 crew flags
— tier under review"; zero history → empty state with "Your first match is
one tap away".

### 2.10 Charity Pot

**Purpose:** the hug at the end of the trash talk. Contributions ledger,
winner directs.
**Primary action:** `CONTRIBUTE` (loser's round) / winner: `DIRECT POT`.
**Data shown:** pot total (mono, big), contribution rows (player, amount,
note), winner's charity picker from championed set, season pot rollup.

```
┌──────────────────────────────┐
│ ‹  CHARITY POT               │
│──────────────────────────────│
│        $14.00                │  ← mono 48px, lime
│   Match #12 · 4 contributors │
│ ┌──────────────────────────┐ │
│ │ (N) Nico    $5.00 "ouch" │ │
│ │ (S) Sam     $5.00        │ │
│ │ (A) Alexei  $4.00        │ │
│ └──────────────────────────┘ │
│ WINNER DIRECTS               │
│ Dave, where's it going?      │
│ ┌──────────────────────────┐ │
│ │ ◉ Beyond Blue            │ │
│ │ ○ Movember               │ │
│ │ ○ Local SES              │ │
│ └──────────────────────────┘ │
│ No cash to the winner —      │
│ ever. That's the whole point.│
│──────────────────────────────│
│ ┌──────────────────────────┐ │
│ │      DIRECT POT          │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Edge cases:** MVP not yet voted → pot screen reachable but "direct" waits
for result finalisation; honour-system MVP (MVP) — payments are pledge-based
in MVP, settled externally, UI says "pledged"; corporate crews → pot shows
"EMPLOYER-FUNDED" tag instead of contributions.

### 2.11 Corporate Admin

**Purpose:** the renewal argument. Aggregate participation, never individual
health data. Reached from hub or /hub route.
**Primary action:** `EXPORT REPORT` (PDF/CSV).
**Data shown:** org header (logo, workspace, plan), participation cards
(active crews, weekly active %, verified-rep %), leagues table (crew vs crew),
employer-funded pot totals, privacy banner (k≥5 aggregation enforced).

```
┌──────────────────────────────┐
│ ‹  ACME CORP · RWF ADMIN     │
│──────────────────────────────│
│ ┌──────────────────────────┐ │
│ │ 🔒 AGGREGATE ONLY — no   │ │  ← sky info banner
│ │ individual data, k ≥ 5   │ │
│ └──────────────────────────┘ │
│ ┌────┐ ┌────┐ ┌────┐        │
│ │ 6  │ │74% │ │52% │        │  ← crews, weekly
│ │CRWS│ │ACT │ │VRFY│        │    active, verified
│ └────┘ └────┘ └────┘        │
│ TEAM LEAGUE · WEEK 3         │
│ ┌──────────────────────────┐ │
│ │ 1 SALES    14pts ▓▓▓░    │ │
│ │ 2 ENGINEER 11pts ▓▓░░    │ │
│ │ 3 OPS       8pts ▓░░░    │ │
│ └──────────────────────────┘ │
│ EMPLOYER POT   $240 THIS     │
│ SEASON → Beyond Blue         │
│ EFFORT TREND (12 wks)        │
│   ▁▂▄▃▅▆▇█ ← aggregate      │
│ ┌──────────────────────────┐ │
│ │    EXPORT REPORT         │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

**Edge cases:** <5 participants in a slice → that slice suppressed with
"hidden (k<5)" — never a partial leak; no seasons yet → onboarding checklist
card ("1. Install Slack app 2. Fund pot 3. Launch week 1"); Slack workspace
disconnected → amber banner + reconnect CTA.

### 2.12 Empty & Error states (pattern screen)

**Purpose:** every screen's zero-data and failure moment, designed once.
**Primary action:** always exactly one way out.

```
┌──────────────────────┐   ┌──────────────────────┐
│                      │   │                      │
│        ( ⚡ )         │   │        ( ✕ )         │
│   NO MATCH YET       │   │   CAN'T REACH CREW   │
│                      │   │                      │
│  The group chat is   │   │  Check your internet │
│  ready. Are you?     │   │  or the crew code.   │
│                      │   │  It's not sabotage.  │
│ ┌──────────────────┐ │   │ ┌──────────────────┐ │
│ │   NEW MATCH      │ │   │ │     RETRY        │ │
│ └──────────────────┘ │   │ └──────────────────┘ │
└──────────────────────┘   └──────────────────────┘
```

Rules: icon (line style, faint) + DISPLAY-L headline (cheeky, specific to the
screen) + one muted sentence + one pill CTA. Loading = skeletons matching
final layout (never spinners over blank). Full per-screen matrix in §5.

---

## 3. Flows

### 3.1 Cold start — chat invite → playing in <30 seconds

The make-or-break flow. A mate sees the bot in the group chat and must be
playing within half a minute, no install.

1. Match starts in the group chat; bot posts: "MATCH LIVE · 300 reps · join →
   rwf.app/j/K7Q2M".
2. Curious mate taps the link (chat app's in-app browser opens).
3. Web app loads PWA shell (instant, cached); invite code pre-filled from URL.
4. Onboard screen: types name (5s), taps tier (5s) — CASUAL preselected.
5. Taps `LET'S GO` → joined. Crew Home shows the live match.
6. Taps `OPEN MATCH` → Match Live → `LOG REPS`.
7. Logs 20 push-ups manual (unverified, amber) — on the board in <30s from
   link tap.
8. Prompt (non-blocking, bottom sheet): "Add to home screen?" — dismissible,
   never blocks play.
9. Bot broadcasts to chat: "Sam joined. 5 players." — social proof loop.
10. Later: Sam returns via home-screen icon or the same link; state persists.

**Budget:** steps 3–7 must total <30s on mid-range Android over 4G. If the
camera verify path is taken first, budget extends to 60s — camera is opt-in,
never forced.

### 3.2 Match day arc

1. **T-0 (match start):** creator configures (2.3), starts; bot posts card +
   invite link to chat; app routes everyone to Match Live.
2. **Morning:** keen players log before work. Each log → bot broadcast (rate-
   limited: one digest per 15min, not one per rep).
3. **Midday:** standings tighten; taunts fly (chat + in-app taunt button);
   comeback badges arm for anyone >30% behind — the app nudges: "⚡ You're
   armed. One big set changes this."
4. **Evening:** leader approaches target; app shows "Dave can close this"
   projection on the match card; urgency broadcast in chat.
5. **Close:** someone's raw total hits target → close moment (full-screen
   sweep) → match status complete; final standings frozen; closure bonus +15
   applied to closer.
6. **Result:** everyone routed to Result screen on next open; MVP vote opens
   (best effort, one vote each, locks on tap).
7. **Pot:** losers' round pledged in-app; winner directs to a championed
   charity.
8. **Share:** result card (branded 1200×675) downloaded/shared back into the
   chat — the ad.
9. **Season tick:** if a season is active, points/streaks/MVP recorded
   automatically on result finalisation.
10. **Cooldown:** 24h later, bot: "Rematch Thursday?" — one-tap rematch with
    same config.

### 3.3 Season arc (4 weeks)

1. Crew opens Season tab after ≥1 match → "START SEASON" (name + weeks,
   defaults "Season 1", 4).
2. Week 1 match plays out (3.2); on result, engine awards 3/2/1 + MVP+1,
   streaks start.
3. Weeks 2–3: weekly match (or more — engine counts best result per week);
    ladder shuffles; 🔥 streaks grow; mid-table stays alive via comeback +
    MVP points.
4. Missed week → streak breaks; player sees `❤ FORGIVE — $2 to pot` (once per
   season) on their ladder row.
5. Week 4 finale: engine flags "championship week"; winner-takes-glory
   framing in chat.
6. Season end: champion crowned (belt banner), bottom-of-A ↔ top-of-B
   relegation/promotion applied if divisions exist.
7. Result card: "SEASON 2 CHAMPION — DAVE" variant, extra shareable.
8. 48h later: "Season 3 starts Monday. Same crew, fresh ladder." — the
   retention loop closes.

### 3.4 Corporate pilot arc

1. Sales/demo: hub Corporate tab shown live (aggregate dashboard, employer
   pot) — the product sells itself as a renewal story.
2. Install: Slack workspace app added by admin; org record created; teams
   become crews (one per department).
3. Funding: employer funds the pot upfront ("no employee money handled") —
   legally cleanest structure (docs/08 §6).
4. Kickoff: we run week 1 as onboarding-as-a-service — seeded matches,
   announcement copy, a live standings channel.
5. Weeks 1–4: team-vs-team league season (3.3 with crews as units); admin
   dashboard tracks participation + effort trends (aggregate only, k≥5).
6. Mid-pilot check-in: export report → HR sees engagement; we adjust
   (exercise mix, play days).
7. Renewal: dashboard shows the trend line + pot total directed to charity —
   the renewal argument in one screen.
8. Expansion: multi-org league (public ladder opt-in) for the annual charity
   championship.

---

## 4. Component library (~20 components)

All built on tokens.css primitives (`.rwf-card`, `.rwf-btn`, `.rwf-tag`,
`.rwf-dot`). Components are functions in `apps/web/src/ui.ts` — no framework,
no fork.

| # | Component | Anatomy | Usage rules |
|---|---|---|---|
| 1 | **Topbar** | back chevron · DISPLAY-L title · context slot (status dot / timer) | Every screen. Title never truncates — shorten the label instead. |
| 2 | **Standings row** | rank · avatar · name+tier · verified chip · comeback badge · score (mono) · raw · progress bar | The core unit. Rank 1–3 gets lime rank numeral. LEADING flag only on rank 1 with score >0. |
| 3 | **Progress bar** | 4px track `--line`, fill lime (me) / `--line-bright` (others) | Fill eases 320ms. Caps at 100% — never overfills. |
| 4 | **Tier badge** | pill, uppercase 10px, tier name + ×multiplier | Colour-neutral (muted) — tier is info, not status. Athlete ≠ better; couch ≠ worse. |
| 5 | **Comeback badge** | coral pill "⚡ COMEBACK ×1.2 ARMED" | Only when armed/eligible. Pulses (until reduced-motion). Disappears after use. |
| 6 | **Verified chip** | "92% ✓" lime when >0, amber hollow when 0 | Always shown on standings rows — honesty is ambient. |
| 7 | **Avatar** | 2-letter initials disc, deterministic hue from name hash | Never photos in MVP (privacy + zero-moderation). |
| 8 | **Command chip** | mono pill `!rwf log pushups 20!` with copy affordance | Chat-command teaching. Shown on Link Chats + empty states. |
| 9 | **Exercise chip** | selectable pill, lime border when on | Max 5 selected (New Match); max 4 visible per row then wrap. |
| 10 | **Stepper** | −10 / −1 / value(mono) / +1 / +10 | Value 1–500. Long-press repeats. Used for reps + target. |
| 11 | **Primary pill button** | `.rwf-btn--primary`, uppercase, ≥52px tall | ONE per screen. Label is a verb + object: "LOG 20 PUSH-UPS". |
| 12 | **Tag / label** | `.rwf-tag` | Section labels, meta. Never interactive. |
| 13 | **Status dot** | `.rwf-dot` ok/down/idle | System + player liveness. Always paired with text elsewhere on screen. |
| 14 | **Toast** | bottom-floating pill, auto-dismiss 2.5s, ok(lime)/warn(amber)/err(coral) | Success + comeback moments only. Never errors (errors are inline). |
| 15 | **Bottom sheet** | drag handle, surface-2, max 70vh | Confirmations (close match, tier change), camera permission priming. |
| 16 | **Taunt bubble** | chat-style card: avatar + line + timestamp | Last 3 on Match Live. Canned or AI; rate-limited 1/30s per player. |
| 17 | **Result card** | 1200×675 canvas: brand, podium, scores, pot, QR | THE viral artefact. Generated client-side, PNG download + share. |
| 18 | **Pot card** | ❤ + mono total + contribution rows + direct CTA | Winner-directs framing always. "No cash to winner" microcopy always. |
| 19 | **Ladder row** | rank · avatar · points(mono) · W/MVP · 🔥streak · [A/B] division | Season only. Rank 1 gets belt icon when season over. |
| 20 | **Week strip** | W1..W4 squares, played=lime, current=outlined | Season header. Tapping a played week shows that week's result. |
| 21 | **Crew code block** | mono 24px code + copy button | Tap-to-copy with toast. Code is 5 chars, no 0/O/1/I. |
| 22 | **Empty state** | line icon + DISPLAY headline + one sentence + one pill | §2.12 pattern. Never a bare "No data". |
| 23 | **Skeleton** | grey blocks matching final layout | Loading only, 500ms min-display to avoid flash. |
| 24 | **Stat card** | big mono number + uppercase label | Profile stats, corporate dashboard. Grid of 3. |

---

## 5. States & accessibility

### 5.1 State matrix (empty / loading / error per screen)

| Screen | Empty | Loading | Error |
|---|---|---|---|
| Onboard | n/a (first run) | instant (cached shell) | name save fail → inline retry, never lose input |
| Crew Home | "No crew yet" + CREATE/JOIN split CTA | roster skeleton | crew fetch fail → RETRY pill, cached roster shown stale-marked |
| New Match | n/a (exercise set is static) | instant | invalid config → CTA disabled + hint (never a submit error) |
| Link Chats | platform rows show "not linked" idle state | link-gen skeleton | share fail → copy-to-clipboard fallback |
| Match Live | 0 entries → "First reps set the tone" + LOG CTA | standings skeleton | log fail → queued-offline banner + retry on reconnect |
| Log Reps | n/a | camera warm-up shimmer | camera denied → manual mode, amber "unverified" note |
| Result | n/a (always has data) | card render skeleton | card canvas fail → SVG fallback |
| Season Ladder | "No season yet" + START SEASON | ladder skeleton | record fail → banner, ladder shown last-known |
| Profile | "Your first match is one tap away" | history skeleton | n/a (local) |
| Charity Pot | $0.00 → "Loser's round is $0 — brave." | n/a | pledge fail → "pledge saved locally, settle in person" |
| Corporate Admin | onboarding checklist card | stat skeletons | Slack disconnected → amber banner + reconnect |
| All (network) | — | — | global offline bar: "Offline — showing last known score" |

### 5.2 Reduced motion

`@media (prefers-reduced-motion: reduce)`: all transforms → none; transitions
→ opacity-only ≤160ms; comeback pulse + score pulse → static colour change;
reveal → instant. The `.reveal` primitive and every animation goes through one
motion utility so this is a single switch, not per-component archaeology.

### 5.3 Contrast

| Pair | Ratio (approx) | Verdict |
|---|---|---|
| `--text` #e8eaed on `--bg` #0a0b0d | ~15:1 | AAA |
| `--lime` #c6f32e on `--bg` | ~13:1 | AAA — primary CTA text is #0a0b0d on lime, same |
| `--muted` #9aa0a8 on `--bg` | ~7:1 | AA (body secondary) |
| `--coral` #ff5c38 on `--bg` | ~6.5:1 | AA — badges/labels only, never body text |
| `--faint` #5f646d on `--bg` | ~3.2:1 | **Decorative only** — never text below 18px |
| `--amber` #ffb020 on `--surface` | ~8:1 | AA |

Rules: lime-on-dark and dark-on-lime are the only AAA pairings used for
critical info; scores are mono 700 ≥16px so contrast + weight carry them;
never encode state by colour alone (dot + label, chip + icon).

### 5.4 Touch & interaction

- All interactive targets ≥ **44×44px** (primary pills ≥52px tall, full-width
  on phone).
- Steppers and chips have 8px minimum gap — mis-taps corrupt scores, the one
  place we cannot be sloppy.
- Swipe: standings rows swipe → quick-taunt (left) / quick-log (right);
  disabled when reduced-motion is on... no — swipe is fine, it's the
  animations that reduce. Swipe stays.
- Haptics on log confirm + comeback arm (where supported).
- Keyboard: full tab order in web/PWA; Enter logs on Log Reps; focus rings
  are lime 2px offset outlines (visible on dark).

---

## 6. Design principles (5, final)

1. **Effort is the hero.** Raw reps are the means; adjusted score is the
   meaning. Every screen shows the handicap doing work — the couch player's
   96.4 next to the athlete's 142.5 is the product.
2. **The chat is the arena, the app is the scoreboard.** Nothing important
   should require leaving the chat; nothing delightful should be impossible
   outside it. The app earns its keep with what chat can't do: live
   standings, camera verification, result cards, seasons.
3. **One tap from thought to action.** Every screen answers "what do I do
   next?" with a single primary pill. If a flow needs instructions, the flow
   is wrong.
4. **Cheeky but never mean.** The voice roasts effort gaps and celebrates
   comebacks; it never touches identity or ability. The charity pot is the
   structural guarantee the trash talk stays safe — every match ends in
   generosity.
5. **Honest by design, not by policing.** Verification is a one-tap
   opportunity (camera), never a toll. Unverified is visible (amber) but
   never shamed. The comeback multiplier and tier multipliers make honesty
   the winning strategy — the mechanics do the policing so people don't have
   to.

---

## 7. Divergence log — OURS vs FIGMA (fill when the Figma arrives)

Method: audit the Figma screen-by-screen against this doc. Every material
difference gets a row and a decision. Default posture: **their visual craft,
our interaction model** — but argue from these tables, not vibes.

| # | Element / decision | Ours (this doc) | Theirs (Figma) | Decision + rationale | Status |
|---|---|---|---|---|---|
| 1 | Primary colour | Lime #c6f32e on near-black | *TBD* | | ☐ open |
| 2 | Effort/heat colour | Coral #ff5c38 | *TBD* | | ☐ open |
| 3 | Typography | Space Grotesk, uppercase display, mono numerals | *TBD* | | ☐ open |
| 4 | Nav model | topbar + per-screen primary pill, no bottom tab bar | *TBD* | | ☐ open |
| 5 | Screen count / inventory | 12 (§2) | *TBD* | | ☐ open |
| 6 | Onboarding length | name + tier, <20s | *TBD* | | ☐ open |
| 7 | Verification entry | camera opt-in on Log Reps, manual always available | *TBD* | | ☐ open |
| 8 | Standings presentation | adjusted score primary, raw secondary, progress bar | *TBD* | | ☐ open |
| 9 | Comeback visibility | persistent armed badge on standings row | *TBD* | | ☐ open |
| 10 | Result card format | 1200×675 branded canvas, PNG share | *TBD* | | ☐ open |
| 11 | MVP vote placement | on Result screen, one vote, locks on tap | *TBD* | | ☐ open |
| 12 | Charity pot placement | card on Result + dedicated screen | *TBD* | | ☐ open |
| 13 | Season prominence | tab-level surface from MVP (retention fix) | *TBD* | | ☐ open |
| 14 | Corporate admin | aggregate-only, k≥5, employer-funded pot | *TBD* | | ☐ open |
| 15 | Voice/tone | Aussie cheeky, never mean (§1.4) | *TBD* | | ☐ open |
| 16 | Motion budget | 160ms law, comeback is loudest | *TBD* | | ☐ open |
| 17 | Empty/error pattern | icon+headline+sentence+pill (§2.12) | *TBD* | | ☐ open |
| 18 | Accessibility floor | 44px targets, reduced-motion, AA contrast | *TBD* | | ☐ open |
| 19 | | | | | ☐ open |
| 20 | | | | | ☐ open |

---

*End of doc 13. When the Figma lands: fill §7, then reconcile doc 02 Phase 0
checklist ("Audit the Figma against this plan").*
