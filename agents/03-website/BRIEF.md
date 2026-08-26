# Lane 3 — Website (Three.js showcase)

**Mission:** a local, dynamic, fitness-focused page presenting the whole
system: features, connections (architecture), how it works. The taste piece —
this sells the vision.

**Owns:** `site/` (index.html, main.js, vendor/ already has three@0.185.1 + OrbitControls)

## Current state
- ✅ Site built: `site/index.html` + `site.css` + `main.js` + `hero-scene.js` + `graph-scene.js`
  + `handicap.js` + `reveal.js`. All 8 sections, both Three.js scenes, interactive
  handicap demo (real engine math), scroll reveals, reduced-motion support.
- ⚠️ **`site/vendor/` is INCOMPLETE**: `three.module.js` (0.185.1) is the split build
  that imports `./three.core.js` — that file was never vendored, so the vendor pair
  cannot work (whole module graph dies on a 500, silently). Do NOT use vendor/ as-is.
- ✅ Workaround (fully offline): `site/lib/` holds a coherent three@**0.177.0** triple
  (`three.module.js` + `three.core.js` + `OrbitControls.js`) copied from the local bun
  cache (`~/.bun/install/cache/three@0.177.0@@@1`). Importmap points at `/site/lib/*`.
  If 0.185.1's `three.core.js` is ever obtained, drop it in `vendor/` and flip the
  importmap back.
- `site/jsprobe.html` — debug artifact from headless verification; unlinked, harmless.
- Verified headless via CDP: zero console errors, both canvases mount, rep counter
  ticks at 2.4s, handicap math correct (200×1.5=300), reveals fire on scroll, graph
  nodes render (lime/sky/amber confirmed by pixel analysis), all requests localhost-only.

## Design direction (follow precisely)
Dark athletic: near-black `--bg`, electric lime `--lime` primary, coral `--coral`
for effort/HR. Space Grotesk, uppercase display headings, tight tracking.
Kinetic but classy — motion serves meaning (reps, heartbeats, data flow).

## Sections (in order)
1. **Hero** — Three.js scene: stylised dumbbell (bar + plates, lime emissive
   edges on dark metal) auto-rotating with pointer parallax + drag (OrbitControls,
   zoom disabled). Particle field (lime/coral motes). The dumbbell does a slow
   "curl" bob every ~2.4s; an HTML rep counter ticks up in sync. Headline:
   "TRAIN TOGETHER. WIN ON EFFORT." Sub: "Real-time multiplayer fitness, inside
   your group chats." CTAs: "See how it works" (anchor) + "Open the app" (/app).
2. **The 300** — how a match works: 4 steps (pick exercises → any reps any order →
   first to target closes → effort-adjusted winner). Animated step reveal.
3. **Handicap demo (INTERACTIVE — centrepiece)** — tier slider (couch→athlete) +
   reps input; live adjusted score using the REAL engine math (port of
   `packages/game-core/src/handicap.ts` — 20 lines). Show "athlete 300 raw =
   255 adjusted" vs "couch 190 raw = 285 adjusted → couch wins" example.
4. **Connections** — Three.js node graph: WhatsApp/Slack/Messenger nodes →
   RWF API → game-core → Postgres/Redis. Animated pulses along edges
   (LineDashedMaterial, animate dashOffset). Labels via canvas-texture sprites.
   Draggable/rotatable. Legend below in HTML.
5. **Verification** — three cards: in-browser camera counting (MoveNet),
   any BLE heart-rate strap (Web Bluetooth), wearable cloud cross-check (Phase 3).
   "No video ever leaves your device."
6. **Feature grid** — taunts, charity pots, pick-your-days, seasons, shareable
   result cards, corporate mode.
7. **Roadmap** — Phase 0–4 timeline (from docs/02_MASTER_PLAN.md).
8. **Footer** — repo, phase status, "Built as discovery prototype".

## Tech rules
- ES modules + importmap: `"three": "./vendor/three.module.js"`,
  `"three/addons/": "./vendor/"` (OrbitControls imports 'three').
- No other deps. No CDN. Must work fully offline via `bun serve.ts` at `/`.
- Scroll reveals (IntersectionObserver, `.reveal` class in tokens.css).
- Respect `prefers-reduced-motion` (static scene, no bob).

## Definition of done
`bun serve.ts` → http://localhost:4173 renders hero scene at 60fps-ish, all
sections present, handicap demo computes correct engine math, node graph
animates, zero console errors, works offline (no network tab requests beyond
localhost).
