# F2 — Design Analysis: ours (docs/13) vs Ben's Figma

*Lane F2 · 28 Aug 2026 · Gates F3 (components) + F4 (screens).*
*Sources: figma/assets/file.json (full REST dump — every text node, fill, font, radius), figma/notes/catalogue.md, exports cross-checked. Method note: this agent cannot view images, so analysis is built from the complete JSON text/style extraction rather than visual inspection — every string and hex below is verbatim from the file. Visual-only qualities (icon stroke weight, logo art, illustration) still need one human pass before F3 locks.*

**The file in one line:** a complete, disciplined, app-store-native product design — 66 mobile screens, 5 corporate web, 5 admin, 12 wired prototype screens, 22 icons + 20 component sets (91 variants), 74 variables, 13 text styles, 5 effect styles — built 24 Jul 2026 from a "Master Product Blueprint v1.0" we have never seen, with its own assumptions register and a 10-item founder-decision list that maps almost 1:1 onto our open questions.

---

## 1. Ben's design language

### 1.1 Colour (semantic tokens, dark mode default)

| Token | Hex | Ours equivalent | Notes |
|---|---|---|---|
| bg/base | `#0B0A12` | `--bg #0a0b0d` | Purple-tinted ink, not blue-black |
| bg/surface | `#14121F` | `--surface #121418` | Cards, sheets |
| bg/raised | `#1B1830` | `--surface-2 #1a1d23` | Raised cards, modals |
| bg/brand-tint | `#1C1533` | — | Purple surfaces (power-up zones) |
| bg/navy | `#131A2E` | — | Alt surface |
| border/default / strong | `#26263A` / `#63637A` | `--line #23262d` / `#31353e` | |
| text/primary…tertiary | `#FFFFFF` / `#C2C2D1` / `#8E8EA3` | `#e8eaed` / `#9aa0a8` / `#5f646d` | |
| text/on-accent | `#07060D` | dark-on-lime | |
| **accent/primary** | **`#FFC821` gold** | **`--lime #c6f32e`** | "Gold — primary actions, wins" (467 uses — the workhorse) |
| accent/primary-strong | `#E0A800` | — | Pressed gold |
| accent/energy | `#FF8A00` orange | `--coral #ff5c38` | "Urgency, streaks" — also warning |
| accent/purple | `#8B5CF6` (+ light `#B79DFB`) | — | "Power-ups, events" — a whole semantic axis we don't have |
| state/success | `#34D399` | — | Success, target hit (we fold this into lime) |
| state/danger | `#FF4D5E` | coral doubles as error | Errors, DZ3 |
| state/info | `#4DA3FF` | `--sky #6ec1ff` | |
| dangerzone/1–3 | gold → orange → red | — | 3h / 1h / 30min; DZ bg tint `#150810` |
| Light mode | `#F4F4F8` + tinted cards | — | Corporate/admin web only |

**Read:** same philosophy as ours (dark athletic, one hot accent, scarcity discipline — gold is for actions/wins), different hue family (gold+purple vs lime+coral) and **more semantic axes** (success ≠ primary; purple reserved for game/economy; a 3-step danger ramp). Ben flags the palette itself as assumption A1 "needs sign-off" and founder decision D5.

### 1.2 Typography

- **Anton** (single weight 400, uppercase) for display + scores: Hero 44 / Large 32 / Medium 24 / **Score 56** (also 72 on the timed log). Dynamic-type capped at 1.3×.
- **Inter** 400–700 for all utility UI: H1 24 / H2 20 / H3 17 / Body 17-15-13 / Label-Button 600@16 / Label-Small 500@12 / Overline 600@11.
- Ours: Space Grotesk everywhere + mono for numerals. Theirs: display font is a condensed poster face (free, SIL OFL), numerals are Anton not mono. Both free licences; both treat scores as display, not prose.

### 1.3 Spacing / radius / grid

- Spacing scale: 2/4/8/12/16/20/24/32/40/48/64 (4pt base grid, cards on 8pt rhythm, 16pt side margins).
- Radius: 0/8/12/16/24/full-pill (usage histogram agrees: pills ×310, 12 ×177, 10 ×127, 8 ×110, 14 ×86, 24 ×81). Ours: 14/9 + pill — nearly identical DNA.
- Mobile 393×852 (ours 390×844 — same intent). Web 1440, 12-col, 24px gutters.
- Bottom nav 84pt incl. safe area; **central LOG button 64pt raised**.

### 1.4 Motion (theirs is a strategy, ours is a law)

> "Intensity is strategic, not constant." Setup: 200ms ease-out only. Logging: 250ms count-up + haptic tick. Battle: rows reposition 400ms spring; presence avatars pulse 2s loop. Danger zone: colour steps; ≤30min adds 1s heartbeat on the timer only — **layout never changes**. Winner: 1.2s confetti + count-up + haptic — "sports-broadcast, never slot-machine (no spinning reels, no near-miss fakery)". Reduced motion: static colour + single haptic, count-ups render final values.

Ours: 160ms for everything, comeback pulse is the loudest moment. Theirs budgets intensity across the arc (calm setup → loud finale) — a better game-feel model; the anti-casino clause is a value we share and should keep verbatim.

### 1.5 Accessibility

Theirs is our floor plus: contrast ≥4.5:1 with "gold on ink = 12.9:1, orange text only ≥17pt"; meaning never colour-alone (DZ adds icon+label at every level); dynamic type to 135% without truncating money/countdowns; screen-reader order fixed (status → personal progress → primary action → leaderboard); timers as accessible text, never canvas. **Adopt wholesale — strict superset of ours.**

### 1.6 Voice & terminology

> "Battle (not workout) · Crew/Group · Target · RUF (Reps Units) · Power-up · Streak · **Rest day (never 'missed day')** · Danger zone. Cheeky but never shaming; corporate tone pack swaps taunts for neutral encouragement. Numbers always show units (RUF, reps, min). **Money screens drop all banter — plain language only.**"

Sample copy: "EXERCISE IS BORING. BEATING YOUR MATES ISN'T." · "Hero — 200 RUF/day: You're a menace. Respect." · "YES, 200. I'M BUILT DIFFERENT" · "OI. YOU'RE BACK. … 12 taunts, mostly about you" · "Rest days are free — no targets, no streak risk." Same Aussie-cheeky register as our §1.4, with two rules we lacked: rest-day framing and the money-screens-no-banter rule. **Adopt both.**

### 1.7 Iconography & logo

22 line icons, 24px grid (home, feed, bolt, user, plus, bell, flame, shield, clock, trophy, lock, chevron, close, check, camera, share, crown, chest, warning, wifi-off, search, settings) — same school as ours (line, geometric); adds **crown + chest** for the loot economy. Logo: supplied PNG master, wordmark rebuilt as placeholder (A3), vector master recommended. Splash tagline: "JOIN THE BATTLE. WIN THE DAY." Domain in designs: **reps.fit** (not rwf.app).

---

## 2. Ben's product model (the part that reshapes screens)

### 2.1 Core loop (ARCH board)

create/join → **daily target** → log fast → leaderboard moves → events/power-ups spike urgency → countdown → **danger zone** → winner declared → streak/rewards/recap → next day resets → battle ends → rematch. Plus an explicit **non-winner retention** lane: PBs, streaks (active-day based), comeback quests, consistency awards, team contribution, revenge rematch prompts, daily loot — "the loop must create a social ripple even when you lose."

### 2.2 Navigation

4-tab bottom nav — **BATTLE · FEED · [LOG] · POWER-UPS · PROFILE** — with LOG a permanent central raised action opening the quick-log sheet from anywhere. Rationale (their words): logging is the one daily action so it's central + one-handed; battle creation hides behind '+' on Battle tab because it's rare. Modal layer: dialogs (confirm/destructive/money), gates, disputes, share sheets.

### 2.3 The battle model (biggest structural difference)

- **Multi-day battles** (e.g. 2 weeks, active Mon/Wed/Fri/Sun) with a **shared group clock** (9:00 PM AEST reset, everyone sees local equivalent; DST server-resolved).
- **Personalised daily targets in RUF**: Light 60 / Solid 120 / Hero 200 — picked per player when joining, private ("Only you and the captain see your choice"), auto-adjusting.
- **Daily winner** each battle day (highest completion % of own target; ties → most RUF → earliest finish) + **overall battle winner** (most days won). "Everyone chases 100% of their own target, so every level can win the day."
- **RUF (Reps Units)**: universal conversion (push-up 1:1, burpee 1:2, plank 10s:5, pull-up 1:2, weighted ×band), admin-versioned (ExerciseVersion — history never rewrites, active battles keep their version, edits need second-admin approval).
- Two creation paths: **Fast battle** (one screen: name, days, pack, target tier) vs **Custom** (8-step wizard incl. power-ups toggle + stakes step).
- **Waiting room** with invite link/QR/WhatsApp, crew join states, captain early-start, auto-delay if <2 joined (max 2, then clean cancel).

### 2.4 Screen inventory (66 mobile)

AUTH ×12 (splash, value props, signup, login, verify, terms+DOB, profile, tz+quiet hours, capability tier, exercise prefs, notif intensity, done) · HOME ×5 (first-use, active, multiple, notification centre, return-after-absence) · CREATE ×6 · JOIN ×2 · BATTLE ×4 (main, danger zone, leaderboard, feed, +team) · LOG ×6 (sheet, picker, timed, gym/weighted, large-log confirm, history/edit, +offline queue) · RESULT ×5 (daily win, daily loss, recap, final, share card) · PWR ×5 · WAGER ×6 (all feature-flagged) · PROFILE/SET ×6 · SOCIAL ×1 · INTEG ×2 · EDGE ×4 (sync conflict, removed, DST, absence) · CORP ×1. Plus corporate web ×5, admin ×5, prototype ×12.

### 2.5 Engineering posture (Dev Handoff page)

WebSocket live subscribe; **server authoritative for ALL scoring/multipliers/deadlines**; client never computes DZ levels (clock drift); optimistic log reconcile ≤2s; never reorder rows while touched; idempotency keys + append-only offline queue, FIFO sync, 3-minute-window duplicate detection; share cards **server-rendered** (image API) with no health data; wagers on a separate ledger from IAP, "held with our payment partner — never 'escrow'"; analytics named (activation funnel, time-to-first-log, **log→ripple**, share rate, power-up→activity lift, DZ→completion lift). This is a spec our engine team can build against almost as-is.

---

## 3. NEW concepts we don't have (catalogued — product decisions to surface)

| # | Concept | What the Figma actually says |
|---|---|---|
| N1 | **Power-ups (FLOW-05)** | 4 launch cards: **Lightning Round** (legendatory, reps ×3 for 10 min, server-timed, 1/player/day, public feed event), **Rep Steal** (epic, take 10% of opponent's total, SAMPLE cap), **Time Freeze** (rare, +30 min for whole crew, broadcasts revised endsAtUTC, one concurrent + global cap), **Group Shield** (common, protects crew from one failure consequence). Rarity = colour-coded (grey/blue/purple/gold). Inventory slots (4 free / 12 Pro), commons expire 7d, hidden from crew. Activation flow: tab → card detail → [target select] → confirm → public activation moment → active banner + server countdown → result state. **In Ben's MVP.** |
| N2 | **Danger zone (FLOW-06)** | 3-level escalation at T-3h/1h/30min: gold banner → orange + timer pulse → red heartbeat + hero glow; bg shifts to `#150810`; layout NEVER changes; server emits `dz_level`; L1 push optional, L3 final warning on-by-default; quiet-hours override configurable. Target hit → celebration state instead. |
| N3 | **Subscription — Reps Pro (FLOW-09)** | Free: 1 active battle, 4 slots. Pro: unlimited battles, 12 slots, advanced stats, premium share cards, 1 Streak Freeze/mo. $7.99/mo · $59.99/yr "SAVE 37%" · **$149 lifetime founders "214 LEFT"**. Paywall triggers on 2nd battle / locked feature / settings; "never blocks first-battle value"; cancel keeps Pro till period end, one save offer max. All prices SAMPLE. |
| N4 | **Power-up store + daily loot** | Store: Starter $1.99 (3 cards, max Rare), Battle $4.99 (5 cards, 1 guaranteed Epic), Streak Freeze $0.99. "Cosmetic and convenience only — you can't buy the win." Caps 3 packs/week; disabled in wager battles that opt out. **Daily drop**: free card every battle day, streaks improve Rare+ odds, "Founders keep this forever", chest-tap reveal. |
| N5 | **"Fast battle" terminology + Custom wizard** | Fast = 1-screen creation (name/days/pack/target tier). Custom = 8-step (schedule & clock → format → exercises & scoring → power-ups → stakes → review "THE RULES, IN PLAIN ENGLISH" → create). Rules lock at start; everyone sees the summary before accepting. |
| N6 | **Daily winner & recap (FLOW-07)** | Winner: full-screen "YOU WON TUESDAY" + stats + winner's loot (1 card). Non-winner: encouraging result, personal delta, streak-safe, **revenge reminder for 7 AM**, taunt CTA. Recap: standings + "MOMENTS" (⚡ Lightning netted 54 RUF · 👑 lead changed 4× · 🔥 first clean sweep) + next battle day. Nobody hits target → "brutal day" recap, no winner. |
| N7 | **Live events** | Event banners: **Thunder Hour** (gold, double reps until 8 PM), **Rep Storm** (purple, 4 crew active → bonus unlocked), **Close Call** (orange, you and Sam within 10 RUF), **Charity Bomb** (green, missed targets donate today). V1.x per ARCH, but components + feed types exist now. |
| N8 | **Wagers suite (all feature-flagged)** | Stakes explainer → eligibility (age/region/KYC-later) → region-restricted join-without-pot → payment (fee shown pre-commit, Apple Pay) → settlement/payout (2 business days SAMPLE) → responsible play (monthly/per-battle limits, cooling-off, self-exclusion; raising limits takes 24h). Separate ledger; never "escrow". Stakes options in custom battles: bragging / dares / charity / cash-18+. |
| N9 | **Integrity: challenge + dispute** | Long-press any log → flag (typo / impossible pace / repeated pattern), anonymous to crew, 3 challenges/battle, misuse lowers own trust score; challenged player confirms or adds proof; dispute timeline visible to both; payout held; admin queue SLA 24h. |
| N10 | **Notification intensity modes** | Quiet / Standard / Chaos ("Everything. Taunts included. Good luck.") + per-type toggles + quiet hours 10PM–7AM + DZ-final-warning override. Set during onboarding, changeable per-battle. |
| N11 | **Waiting room** | Invite link (reps.fit/join/CODE) + QR + WhatsApp; crew list with joined/invited states and picked level; auto-start at scheduled time "whether everyone's joined or not"; latecomers join current day; START EARLY (captain only). |
| N12 | **Team battles** | Team vs team (Team Thunder/Chaos), **contribution floor** (40 RUF each — team score only counts in full once everyone clears it), per-member floor status, **Assist Boost** send CTA. V1.x. |
| N13 | **Comeback quest (return after absence)** | "OI. YOU'RE BACK." damage report (days missed, streak lost, taunts received) → quest: log 3 days in a row → Epic card + streak multiplier back; day-1 target trimmed to 80 RUF. |
| N14 | **Log editing discipline** | Edit/delete window 15 min, then locked (🔒); every edit recorded in wager battles; large-log confirm ("200 push-ups in one go? … YES, 200. I'M BUILT DIFFERENT"); offline queue screen with FIFO + timestamps + duplicate detection; **sync conflict resolver** ("Two versions of one set — one set keep 25 / two sets keep 50"). |
| N15 | **Timed + weighted logging** | Timed: duration presets + live timer (Anton 72 countdown). Gym mode: reps × weight × sets with weight-band RUF multiplier. |
| N16 | **Corporate web suite + admin suite** | Corp: dashboard (participation %, active, avg completion, charity pot), create (dept-vs-dept / office-vs-office / company-vs-company later), participants (opt-in, "Declined (private)" — pressure-free), leaderboards/export (aggregates only; individual export needs consent, off by default), billing ($3.20/seat SAMPLE). Admin: users (trust score, wager status, audit log), Exercises & RUF (versioned), disputes queue, payments, flags & regions. Light mode. |
| N17 | **Friends graph** | Pending requests, "3 shared battles · won 8 days vs you", Challenge button, invite by contacts. |
| N18 | **Dual-clock everywhere** | Group time + local equivalent on every timer ("ends 9:00 PM AEST · 7:00 PM for you"); DST change screen; group clock governs day boundaries. |
| N19 | **Demo battle** | Onboarding path 3: "solo practice round to learn the ropes." |
| N20 | **Awards (final result)** | 🏅 Most consistent · 🚀 Best comeback · ⚡ Most active · 💪 Personal best — auto-computed, shown on final result. |

---

## 4. Divergence log (ours vs theirs)

Decision key: **adopt** (take theirs) · **keep** (ours wins, functional reason) · **hybrid** (merge) · **call** (founder decision, docs/09 agenda). Full log also mirrored into docs/13 §7.

| # | Element | Ours (docs/13) | Theirs (Figma) | Decision | Why |
|---|---|---|---|---|---|
| D1 | **Fairness model** | Shared target (300) + tier multipliers (couch ×1.5 → adjusted score); effort visible in numbers | Personalised targets (Light/Solid/Hero RUF), winner = completion % of own target; tier private | **call (top)** | The deepest product divergence. Theirs hides ability differences (privacy, simpler math, "every level can win the day"); ours makes handicap the spectacle. Ben's own D8 "MVP handicap default" is open — he expects this fight. Hybrid possible: personalised targets + our comeback multiplier on top. |
| D2 | **Platform / distribution** | PWA + WhatsApp/Slack bots day one; "chat is the arena, app is scoreboard"; no install, <30s cold start | Native app: email/Apple/Google auth, push, app-store IAP; Slack = V1.x; WhatsApp = share target only | **call (top)** | Our bots are SHIPPED and are the differentiation; his model assumes app-store distribution + push (DZ notifications basically require push). Staged answer possible: PWA+bot MVP → native when retention proven. |
| D3 | **Battle rhythm** | One match to target, first-to-close ends it, days-left urgency | Multi-day battles, daily winner each day + overall (most days won), countdown → danger zone nightly | **call (top)** | Daily-winner rhythm is a stronger habit loop + gives losers a fresh start tomorrow (their non-winner retention thesis). Our close-moment drama is a better finale. Hybrid: daily winners inside a season-style multi-week battle. |
| D4 | **Scoring unit** | Raw reps + adjusted score | RUF (Reps Units), admin-versioned conversion table, shown pre-log ("20 push-ups = 20 RUF · takes you to 92%") | **adopt** | RUF is a superset of our exercise-mix logic, makes mixed exercise fair, and the pre-log preview is trust craft. Keep our mono/scoreboard presentation. |
| D5 | **Primary palette** | Lime #c6f32e + coral effort | Gold #FFC821 + purple #8B5CF6 energy + orange urgency + green success | **call** | Ben flags as A1/D5 (sign-off + licensing). Gold/purple reads more "game"; lime/coral more "athletic". Founder taste — decide on call, then F3 maps variables 1:1 into tokens.css. |
| D6 | **Type** | Space Grotesk + mono numerals | Anton display/scores + Inter utility | **call** (lean adopt) | Both free. Anton+Inter is more conventional game-adjacent; SG is more distinctive. Founder taste; whichever loses, the type ROLES (display/heading/body/label/overline) map cleanly. |
| D7 | **Navigation** | Topbar + per-screen primary pill, no tab bar | 4-tab bottom nav + central raised LOG (64pt) opening quick-log anywhere | **adopt** | Their rationale is right: logging is the daily action; central + thumb-zone beats our per-screen pill hunting. Keep our one-primary-CTA rule inside screens. |
| D8 | **Onboarding** | Name + tier, <20s, no auth | 12 screens: auth, verify, DOB, profile, tz+quiet hours, tier, exercise prefs, notif intensity, path chooser | **call** (depends on D2) | If native: adopt theirs (it's careful). If PWA+bot: keep ours (speed is the whole point) and steal their notification-intensity + quiet-hours steps as optional post-join. |
| D9 | **Log flow** | Full screen, stepper ±1/±10, camera toggle | Bottom sheet, recent exercise preselected, preset chips 5/10/20/30/50, RUF preview, UNDO 30s, 3 taps | **adopt** | Their flow is strictly better for the 95% case (sheet + presets + undo). Keep stepper + camera inside the picker for the long tail. |
| D10 | **Verification** | Camera pose-count (MoveNet) opt-in on Log | Rep Cam = "Later"; integrity via peer challenges + trust score + disputes | **hybrid** | Keep camera as the positive verify (our shipped work, "honest by design"); adopt their challenge/dispute as the social backstop. Sequence: camera MVP, challenges V1. |
| D11 | **Comeback** | ⚡ ×1.2 multiplier armed >30% behind; loudest moment in product | Comeback quest after absence + Best Comeback award + revenge reminder | **hybrid** | Different mechanisms, same value. Ours is in-battle drama; theirs is re-engagement. Keep both: multiplier in battle, quest on return. |
| D12 | **Seasons** | Season ladder: 4 weeks, 3/2/1+MVP points, divisions, belt, forgive-$2 | Nothing — retention via streaks, daily loot, awards, rematch | **keep** | Our long-arc retention layer is a gap in theirs. Fold daily-winner rhythm (D3) INTO the season and both get stronger. |
| D13 | **MVP vote** | One vote, best effort, locks on tap | Awards auto-computed (consistency/comeback/most active/PB) | **hybrid (lean theirs)** | Awards need zero coordination and cover the same "effort ≠ winning" value. Keep MVP vote only if seasons (D12) survive — it feeds season points. |
| D14 | **Charity** | Loser's-round pledge pot; winner directs; dedicated screen + picker | Charity as stake type (missed targets donate), Charity Bomb event, corporate charity pot (winning dept picks) | **call** | Same soul, different mechanics. Ours is a ritual at match end; theirs is a stake + event. If daily rhythm adopted, "missed targets donate" compounds daily — decide. |
| D15 | **Power-ups** | None (comeback badge only) | 4 at launch, rarity economy, inventory, daily drop, store, Pro slots | **call (top)** | Biggest MVP scope add. Ben puts them IN the launch gate; they're also the Pro/store monetisation spine. If adopted, F3 gets a whole component family (cards, banners, chest). |
| D16 | **Danger zone** | Days-left timer only | 3-level nightly escalation, server-emitted, layout-never-changes, reduced-motion safe | **adopt (if D3 daily rhythm)** | Genuinely good urgency craft with a11y discipline. Worthless without nightly countdowns — coupled to D3. |
| D17 | **Money** | Charity pledges only, settled externally | Wagers (flagged, KYC, regions, responsible play) + Reps Pro + store, separate ledgers | **call** | Ben's D7 "wagers in launch or not". His gating craft (server-side flags, never 'escrow', fees pre-commit) is adoptable whenever we go there. Pro pricing = his D3. |
| D18 | **Corporate** | Aggregate-only k≥5 dashboard, employer-funded pot | Full suite (5 web screens + mobile view + admin), opt-in, declined-private, consent-gated exports, $/seat billing | **adopt direction, keep k≥5** | Privacy postures agree almost verbatim. His suite is further along than our single screen; our k≥5 suppression rule is stricter than his — keep ours, adopt his surfaces post-MVP. |
| D19 | **Terminology** | Match, crew, adjusted score, rwf.app | Battle, crew/group, RUF/completion %, reps.fit, "rest day (never missed day)" | **adopt** | Battle is the better word (their whole voice is built on it). Domain is a founder/brand call. |
| D20 | **Result card** | 1200×675 client-side canvas | Server-rendered image API, no health data, pre-written editable message, join link | **adopt** | Server-rendered is more reliable + shareable; keep our 16:9 canvas layout as the template. |
| D21 | **Empty/error pattern** | icon+headline+sentence+pill | System State component set: empty/error/offline/locked/restricted/loading | **adopt** | Strict superset (locked + restricted map to Pro + region gates we'll need). |
| D22 | **Motion** | 160ms law, comeback loudest | Strategic intensity ramp, 400ms springs, 1.2s winner confetti, heartbeat DZ3, anti-casino clause | **adopt** | Their model is richer game-feel; port our single reduced-motion switch onto it. |
| D23 | **A11y** | 44px, reduced-motion, AA | + dynamic type 135%, SR order, orange ≥17pt, timers-as-text | **adopt** | Superset, no conflict. |
| D24 | **Avatars** | Initials disc, deterministic hue, never photos | Photo upload + initials fallback | **call (lean keep)** | Photos raise moderation + privacy load his file doesn't price in. Keep initials for MVP; his "Add photo" becomes V1. |
| D25 | **Offline/sync** | Queue + banner + retry | Queued-logs screen, FIFO, idempotency, duplicate detection, sync-conflict resolver UI | **adopt** | We built the states; his resolver + queue screen are the missing UX. Cheap to adopt, big integrity win. |
| D26 | **Timezone** | Implicit | Dual clock everywhere, group clock governs, DST screen | **adopt** | Our crew is already multi-tz; this is table stakes for shared clocks. |
| D27 | **Voice** | Aussie cheeky, never mean | Same + rest-day framing + money-screens-plain-language + corporate tone pack | **adopt** | Same voice, three extra rules that are all correct. |
| D28 | **Screen count (MVP)** | 12 | 66 mobile + 10 web | **call (scope)** | His MVP list is genuinely bigger (power-ups, notif modes, Pro scaffolding). The call decides MVP scope; F4 sequences whatever survives. |
| D29 | **Streaks** | Season streaks + forgive ($2 to pot) | Active-day streaks + Streak Freeze ($0.99 / 1 free per mo Pro) | **hybrid** | Keep forgiveness-as-generosity (ours); their purchasable freeze is monetisation, fold into store if D15 adopted. |
| D30 | **Taunts/reactions** | Taunt feed + bot commands + AI narrator | Emoji reactions + taunt composer + notification centre | **hybrid** | Reactions are lighter than our taunt bubbles; keep bot-side taunts (shipped), add reactions in-app. |

---

## 5. Gaps both ways

### 5.1 Ben designed, we never built
Power-up system (cards/rarity/store/loot) · danger zone · subscription + paywall + entitlements · store IAP · daily winner/recap rhythm + MOMENTS · live events (Thunder Hour/Rep Storm/Close Call/Charity Bomb) · notification intensity modes · waiting room · wagers suite · integrity challenge/dispute + trust score · friends graph · corporate web suite · platform admin suite · team battles + contribution floor + assist boost · comeback quest · timed/weighted logging · log edit window + large-log confirm · sync-conflict resolver · dual-clock/DST handling · quiet hours · DOB/18+ gates · demo battle · revenge reminder · notification centre · awards.

### 5.2 We built/designed, his file doesn't cover
**Chat-bot integrations** (WhatsApp + Slack commands, standings/log/taunt in-chat — our shipped differentiator; his file has zero bot surface) · **crew codes** (5-char, no 0/O/1/I) + Link Chats screen + bot cheatsheet · **seasons ladder** (points, divisions, belt, promotion) · **MVP vote** · **charity pot ledger + winner-directs picker** (his charity is a stake/event, not a ritual) · **camera verify** (Rep Cam = later) · **comeback multiplier badge** (in-battle) · **PWA no-install <30s cold start** · **AI narrator line** · **HR chip / wearables** (his = V1.x) · **closure bonus / first-to-close finale** · **QR for IRL gyms** (he has QR for invites — overlap).

### 5.3 Agreeing already (no decision needed)
Dark athletic one-accent discipline · pills + 12–16px radii · scores-as-display · 44pt targets · reduced-motion · offline queue · rematch · share cards · charity as the safety valve for trash talk · corporate aggregate-only privacy · cheeky-never-mean voice · "server authoritative" engineering posture.

---

## 6. ONE PAGE for the founder call — top 10 decisions

1. **Fairness model (D1/D8).** Personalised targets + completion-% (Ben) vs shared target + handicap multipliers (ours). Everything downstream — standings, comeback, result cards — re-shapes around this. *Ben flagged it as his D8.*
2. **Platform (D2).** Native app + push (Ben) vs PWA + chat bots (ours, shipped). Or staged: bots now, native at retention. *His D6 "first chat platform" implies he expects bots eventually.*
3. **Battle rhythm (D3).** Daily winners inside multi-day battles + nightly danger zone (Ben) vs single match to 300 with close-moment (ours). The habit-loop decision.
4. **Brand (D5/D6).** Gold+purple+Anton/Inter vs lime+coral+Space Grotesk. Plus domain: reps.fit vs rwf.app. *His A1/D5 — he wants sign-off.*
5. **Power-ups in MVP? (D15).** Ben's launch gate includes 4 power-ups + rarity + daily drop + store + Pro slots. Biggest scope + monetisation spine. *His D4 balance numbers.*
6. **Money at launch (D17).** Wagers feature-flagged (Ben, with KYC/regions/responsible-play craft) vs charity-pledge-only (ours). And Reps Pro pricing ($7.99/$59.99/$149-founders, all SAMPLE). *His D3 + D7.*
7. **Verification sequence (D10).** Camera verify in MVP (ours, shipped) with peer-challenge integrity (Ben's) as V1 backstop — or reverse.
8. **Retention arc (D12/D13).** Seasons ladder + MVP vote (ours) vs streaks + loot + auto-awards (Ben). If daily rhythm wins (3), seasons become the container for it.
9. **Navigation + log flow (D7/D9).** Recommend adopting Ben's bottom-nav + central LOG + preset sheet outright — say yes once, save an argument.
10. **MVP scope (D28).** His MVP list ≈ our 12 screens + power-ups + notif modes + Pro scaffolding + report/block. Agree the launch-gate checklist here so F3/F4 sequence correctly.

*Ben's own register also asks: RUF table (D1), winner rule + true-tie (D2), DZ notification cadence (D9), corporate visibility boundary (D10) — fold into the agenda above where relevant.*

**Recommendation posture for the call:** adopt his craft (nav, log sheet, motion, a11y, system states, RUF, dual clock, offline resolver, terminology); keep our shipped differentiators (bots, camera, seasons, charity ritual); and put the four structural fights (fairness, platform, rhythm, power-ups) at the top of the agenda with prototypes, not opinions.

---

*Next: F3 consumes §1 (tokens→tokens.css mapping table ready), §4 adopt/hybrid rows (component build list), and the D5/D6 brand decision from this call. F4 consumes §2.3/§2.4 screen model once D1–D3 land.*
