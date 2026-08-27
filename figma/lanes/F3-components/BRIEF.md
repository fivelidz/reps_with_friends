# Lane F3 — Component implementation

**Mission:** implement Ben's Figma components in OUR design system — mapped,
not forked.

**Owns:** `figma/impl/components/`, `design/tokens.css` (extensions),
component library on `/system`

## Status: DONE (28 Aug 2026)

Shipped:
- **Tokens** — `design/tokens.css` extended: Ben's palette as named tokens
  (--gold, --ink* surfaces, --energy axis, --success/--danger/--urgency,
  DZ ramp), radius --radius-lg/xl, motion budget (--ease-spring 400ms,
  --dur-sheet/winner/heartbeat), and the opt-in `[data-theme="gold"]` block
  that re-points the core slots 1:1 (lime→gold, bg→purple-ink,
  display→Anton). Lime/coral defaults untouched.
- **Fonts** — Anton + Inter (variable) vendored into `design/fonts/` like
  Space Grotesk (Google woff2, latin, no CDN). Offline-capable.
- **Components** — 13 families + 1 composed fragment, all token-mapped
  (zero hex literals; alpha via color-mix on tokens):
  bottom nav + central LOG · quick-log sheet (live chips + RUF preview) ·
  battle card (3 states) · leaderboard row (spring reorder demo) ·
  countdown (dual clock, DZ ramp, live tick) · DZ banner (3 levels, cycle) ·
  event banner (4 types) · dialog (confirm/destructive/money) · feed item
  (5 types + reactions) · power-up card (6 rarity/state variants — visual
  only) · subscription card (Reps Pro) · system state (6 states) ·
  badge system (5 types).
- **Pages** — `/figma` library (local, via serve.ts route) with spec
  citations per component; `/system` section "03 · From Figma" with 13
  cards, each labelled "from Figma — mapped X→Y", + the brand-theme toggle
  (persisted, `?theme=gold` deep link).
- **Verification** — 98/98 computed-style+geometry checks against the
  extracted specs; 15/15 dominant-colour pixel checks on rendered
  screenshots (gold theme) match Ben's hexes exactly; zero console errors
  on /figma /system / /app /demo /hub /connect; 122 tests green;
  deploy bundle builds. Evidence: `figma/impl/components/screenshots/`.
- **Specs** — `figma/impl/extract_specs.py` (kept, reusable) +
  `figma/impl/specs/*.txt` for every built component.

Deferred to F4: full screens, offline queue + sync-conflict resolver,
waiting room, wager suite, corporate/admin surfaces, DZ screen wash,
result/share cards, any engine wiring.

## Method
1. From F2's adopt-list: build each Figma component as a live component in our
   system (same pattern as the /system component library).
2. Map Figma values → our tokens: his colours become token values (or new
   named tokens, never hex literals in components); type/spacing/radius map
   or extend the scale.
3. Every implemented component gets a card on `/system` with a note:
   "from Figma — mapped: X→Y".
4. Screenshot-verify each against its Figma export (resize, look, diff).

## Rules
- design/tokens.css is the single source of truth — components consume tokens.
- Deliberate divergences only, each logged in docs/13 §7.
- Don't break existing components; extend the library.

## Definition of done
Every adopted Figma component renders in our system, token-mapped, verified
against the export, listed on /system.
