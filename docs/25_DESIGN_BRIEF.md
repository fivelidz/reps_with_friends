# Reps With Friends — Design Brief

*Version 1.0 · 2 Sep 2026 · The one document you hand a designer or stakeholder.
The full game rules live in [docs/24_GAME_DESIGN.md](24_GAME_DESIGN.md) —
read §3 (battles) and §4 (handicap) there before designing screens.*

---

## What Reps With Friends is

Reps With Friends is a real-time multiplayer fitness **game** for group chats.
A crew agrees on exercises and picks 2–3 battle days a week; everyone races to
a shared target (default: 300 total reps — any reps, any exercise, any order)
by logging from WhatsApp, Slack, or the app. First player to the raw target
*closes* the match — but the winner is the highest **effort-adjusted** score:
a couch player's push-up is worth ×1.5, an athlete's ×0.85, comebacks get
armed, theft gets shielded, and players' pledges flow into a charity pot
the **winner directs** (never receives). It is competitive,
cheeky, and never lonely — training stops being something you grind alone.
The engine, two chat bots, and a full phone app are already built and tested
(rwf.qalarc.com); the design work left is polish, brand, and the shareable
surface.

---

## The five design principles

1. **Effort is the hero.** Every screen shows two numbers: raw reps (who
   moved more) and adjusted score (who tried harder). Never let UI imply the
   raw number is the winner — the adjusted column is the product's soul.
2. **The chat is the arena; the app is the scoreboard.** Most players never
   open the app on a given day — they live in the group chat. Bot cards and
   shareable images are first-class design surfaces, not afterthoughts.
3. **Cheeky, never mean.** Aussie banter energy — "OI. YOU'RE BACK." — but
   shame is banned: it's always a *rest day*, never a *missed day*, and money
   screens drop all banter for plain language.
4. **Sports-broadcast motion, never slot-machine.** Calm setup (200ms
   ease-outs) → counted-up logging → 400ms spring leaderboard re-ordering →
   danger-zone colour steps (layout NEVER changes) → one loud 1.2s winner
   confetti. No spinning reels, no near-miss fakery, full reduced-motion
   respect. Intensity is budgeted across the arc.
5. **Everyone has a shot.** The comeback ⚡ (×1.2 when >30% behind),
   handicap multipliers, daily fresh starts and MVP-votes-for-effort must be
   *visible* — the UI's job is to make fairness legible and defeat temporary.

---

## Current visual identity

**Tokens (canonical): `design/tokens.css`** — dark athletic base
(`--bg #0a0b0d`, `--surface #121418`), one loud accent (`--lime #c6f32e`,
earned: verified/leading/CTA only), `--coral #ff5c38` for effort/comeback,
mono numerals for every score ("a score must read like a scoreboard, not
prose"), 14/9px radii, pills, one 160ms ease — with principle 4's
strategic-intensity ramp superseding that single-speed law.

**Five complete themes exist** — explore them side-by-side at **`/styles`**
(run `bun serve.ts`, then http://localhost:4173/styles):

| Theme | Read |
|---|---|
| **Lime Athletic** | The system as shipped — near-black steel, one loud lime. Technical with a streak of arcade. |
| **Gold Arcade** | Ben's Figma direction — purple-ink surfaces, brand-gold actions, Anton display. Confident consumer product. |
| Sunset Brutalist | The light mode — cream paper, 2px ink borders, hard offset shadows. Sport-poster loud. |
| Midnight Neon | The esports skin — electric cyan + magenta, subtle glow. Ranked-play energy. |
| Forest Retro | The family mode — walnut dark, 70s mustard/olive, soft radii. Everyone plays. |

**The open brand question (founder decision, §9 of the GDD):** gold + purple
+ Anton/Inter (Ben's file — "game") vs lime + coral + Space Grotesk (ours —
"athletic"). Both are now fully built and switchable; the test app ships all
fonts (Anton, Inter, Space Grotesk, Archivo, Fredoka, JetBrains Mono). The
typographic *roles* — display/score, heading, body, label, overline — map
cleanly either way, so the loser's hierarchy survives. Domain: reps.fit vs
rwf.app, same call.

---

## The surfaces to design

- **App screens** — the phone-first battle experience: waiting room → battle
  live (standings + progress + danger-zone chrome) → log sheet → daily recap
  → final result → season ladder → profile. Ben's full 66-screen model
  (incl. bottom nav with central raised LOG button) is implemented as an
  offline test app at **`/figma-app`** — walk it; it runs the real engine.
- **Bot cards** — standings, results, digests rendered as chat messages and
  branded SVG images (1200×675). These carry the game to people who never
  install anything; they are the growth surface.
- **Result & recap cards** — the viral artefact: every match end
  auto-generates a shareable image (winner, margin, comeback story, charity
  pot, join link). Direction: server-rendered, no health data, editable
  pre-written caption. Photo-finish variant for top-two-within-5%.
- **The avatar/creature system** — the identity layer: your creature evolves
  with your training (dragon: hatchling → fledgling → elder, already rigged).
  Playground at `/avatars`, garment/pose inspection at `/atelier`.
- **Motion & sound** — the intensity ramp in principle 4, plus haptics and
  (someday) Ben's drum-track rep cues.

---

## What a designer touches first — three concrete briefs

1. **Lock the brand (1 week).** Choose gold-vs-lime (accent + type + domain).
   Deliverable: one chosen theme applied end-to-end in `/styles` previews +
   a tokens.css mapping table. Everything downstream (bot cards, app, site)
   inherits this. Ben has asked for sign-off on this personally.
2. **The battle day (2 weeks).** The live-standings screen family: league
   table with adjusted-score emphasis, comeback-armed ⚡ states, the DZ1→DZ2
   →DZ3 escalation (colour/timer only, layout frozen), power-up activation
   moments (public, dramatic, honest — shield-blocks-steal must read as
   justice, not glitch), and the log sheet (bottom sheet, presets, ≤3 taps).
   This is where principles 1, 4 and 5 earn their keep.
3. **The shareable artefacts (2 weeks).** Result card + daily recap + Monday
   digest as one templated system (16:9 image + chat-message variant).
   Success metric: a losing player still posts it. Include the charity-pot
   "winner directs" moment — the one place the product goes quiet and warm.

---

## Links

Run `bun serve.ts` → http://localhost:4173 (public mirror: rwf.qalarc.com):

- **`/figma-app`** — Ben's full design, every screen, running the real engine
- **`/styles`** — the five themes, side-by-side + live previews
- **`/system`** — design tokens, 16 components, 36 elements with status
- **`/wiki`** — browsable docs (Game Rules, App Screens, Bots, Verification, Avatars)
- **`/atelier`** — avatar garment/pose inspection tool
- `/demo` (90-second match replay) · `/debug` (live bot simulator — chat
  `new`, `log pushups 25!`, `s`, `result`) · `/hub` (ops console)

Repo: `docs/24_GAME_DESIGN.md` (the game bible) · `docs/13` (MVP spec) ·
`figma/notes/analysis.md` (the Figma audit + open decisions) ·
`design/tokens.css` (canonical tokens).
