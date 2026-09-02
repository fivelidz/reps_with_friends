# HANDOVER: 03 website — main page = FULL HUB + /sfx demo — 2 Sep 2026

Founder directive executed: *"the main page should have links to the different
versions for designs"* + *"all links on the main page — sound effects, styles,
avatars etc. A full hub."*

## Shipped

**BUILD 1 — `/sfx` sound demo (new surface)**
- `apps/sfx-demo/index.html` — token-styled grid of all 13 sounds
  (tap/primary/log/deal/flip/play/win/lose/pot/tick/dz/error/swipe), mute
  toggle (shared localStorage key with the app), "these are the live app
  sounds" note, back-link to the hub. No audio files anywhere — pure
  WebAudio, same as the apps.
- `apps/sfx-demo/sfx.js` — the defensive one-file copy of
  `apps/figma-app/sfx.js`. Its header always CLAIMED the app-DOM wiring was
  stripped; it wasn't (delegated click mapper, watchBattle ticker,
  MutationObserver painter were all still present and would have
  double-fired a "tap" under every demo button). Completed the stated
  divergence: wiring gone, synthesis primitives + CATALOGUE byte-identical.
  Re-sync rule unchanged (see its header).
- `serve.ts` — new route `p === "/sfx" || p.startsWith("/sfx/")` →
  `dirRoute("apps/sfx-demo")`, placed with the design surfaces.
- `scripts/build-deploy.sh` — copies `apps/sfx-demo/{index.html,sfx.js}` →
  `deploy/public/sfx/` (served at `/sfx` on Cloudflare Pages too).
- `apps/sfx-demo/e2e.mjs` — zero-dep CDP verification (see Verified).

**BUILD 2 — main page → full hub (`site/index.html`, additive)**
- **New section 01 "Design versions"** right after the hero (most prominent
  slot): three cards — V1 `/figma-app` (Ben's Figma built faithful, lime,
  65 screens, *preserved forever*), V2 `/v2` (track-and-field board game,
  *current direction*, lime-highlighted card), Replay `/demo` — each with
  real screenshot thumbnails and a version story.
- **Thumbnails**: new `site/hub-shots/` (7 PNGs, 240px wide, ~428 KB total)
  resized from `apps/figma-app/shots/` + `apps/board/shots/`. Provenance +
  regen commands in `site/hub-shots/README.md`. Served at
  `/site/hub-shots/…` (works local + Pages); copied by build-deploy.
- **Explore section re-clustered** into six labelled groups —
  App versions · Design & themes · Avatars · Sound · Docs & business ·
  Systems & dashboards — every estate route has a described `.x-card`
  (20 cards): /v2, /figma-app, /demo, /styles, /system, /figma, /atelier,
  /avatars, /sfx, /v1, /wiki, 3× /deck PDFs, /apk, /hub, /debug, /connect,
  /slack, /api/state.
- **Footer = full directory**: columns (Versions / Design & sound / Docs &
  business / Systems) + a full-route text directory line listing every
  live path.
- Nav gained a "Versions" anchor; section kickers renumbered 01→10
  (versions is 01); hero and all existing sections untouched otherwise.
  All new CSS is a scoped `<style>` block in index.html — site.css
  untouched.

**Test fix (not product)**: `site/verify.ts` guide-panel check was racing
the guide's 5s auto-intro (pre-existing since the auto-intro shipped) — the
intro opens the panel, verify's click then TOGGLES it closed and fails.
Verify now closes-if-already-open first, so it always asserts click → OPEN.
No assertion weakened.

## Verified
- **Every estate route**: content-type + content signature on
  localhost:4173 — titles for all 15 HTML surfaces (e.g. `/v2` → "V2 · The
  Table"), `%PDF` + `application/pdf` ×3, `PK` + apk MIME, JSON `server`
  key on /api/state, PNG magic ×7 thumbnails. No HTML-fallthrough fakes.
- **`bun apps/sfx-demo/e2e.mjs` — 21/21 PASS**: all 20 estate routes linked
  in DOM; 7/7 thumbnails load; 3 version cards; 6 clusters; footer
  directory; 89/89 reveals; no horizontal overflow at 390px (hub + sfx);
  /sfx: 13 buttons, `window.rwfSfx` global with 13 names, no synthesis
  before gesture, real mouse click unlocks + synthesises (stub AudioContext
  node counter 0→4), all 13 names return `true` from
  `window.rwfSfx.play()` (→58 nodes), mute button paints/persists/blocks
  synthesis, unmute restores; **zero console errors** across hub + sfx.
- **`bun site/verify.ts` — ALL CHECKS PASSED** after the guide-race fix
  (hero/graph canvases pixel-checked, rep counter, handicap math, reveals,
  guide panel + /api/ai reply, zero console errors).
- **`scripts/build-deploy.sh` runs clean**: `deploy/public/sfx/` and
  `deploy/public/site/hub-shots/` populated, hub index.html carries all new
  sections (308 assets, 83M bundle).
- Screenshots in `apps/sfx-demo/shots/`: hub-desktop-full, hub-versions-
  desktop, hub-mobile-390-full, sfx-desktop, sfx-mobile-390. NOTE: the
  agent that ran this session could not visually read images (no image
  input) — evidence is programmatic: pixel-statistics on the crops (the
  versions sections show the highest unique-colour counts, 14k/18k, i.e.
  the thumbnails really drew) + the pixel checks above. **A human should
  eyeball the five PNGs** (each < 1600px after the crops in /tmp are gone —
  read the raw shots by cropping first; they are 13k–40k px tall).

## Next agent should
- **Deploy is orchestrator-only** (wave protocol): run the full test
  battery, then build-deploy + wrangler + gmktec rsync per
  ORCHESTRATION.md §5. Nothing is committed yet (task said no commits) —
  changes span site/index.html, apps/sfx-demo/*, serve.ts,
  scripts/build-deploy.sh, site/hub-shots/*, site/verify.ts.
- If a sound changes in `apps/figma-app/sfx.js`, mirror it in
  `apps/sfx-demo/sfx.js` (catalogue + synth primitives only).
- `/figma` (component library) is localhost/gmktec-only — it is NOT in the
  Pages bundle (by design, lane F3). The hub links it anyway; on
  rwf.qalarc.com it will 404. If that bothers the founder, either add
  figma/impl/components to build-deploy or tag the card "local only".
- Consider pointing the nav CTA + hero "Open the app" at `/v2` (currently
  `/figma-app`) — left untouched per "existing sections intact"; now that
  the hub leads with versions, it's a one-line opinion call for the
  founder.
- serve.ts on this box was restarted (pid in ss output, ~21:05); if you
  edit serve.ts, restart it — stale servers serve stale routes.

## Gotchas hit
- **Trailing-slash module resolution**: `/sfx` serves index.html but the
  document URL has no trailing slash, so a bare `./sfx.js` import resolves
  against `/` → `/sfx.js` → HTML fallthrough → strict MIME check kills the
  module silently (page renders, sounds dead, one console error). The page
  imports `/sfx/sfx.js` (absolute) — works at `/sfx`, `/sfx/` and
  `/sfx/index.html`, local AND Pages. apps/board's bare `board.css`/
  `board.js` relatives rely on `/v2/` being entered with a slash or Pages
  redirect — same trap if someone links `/v2` bare from outside. Watch it.
- **The sfx.js "demo copy" lied in its header** — claimed wiring was
  stripped, wasn't. Diff before trusting a defensive copy's header.
- **verify.ts × guide auto-intro race** (see above) — fixed in verify.ts.
- **/api/ai 429 flake**: serve.ts's in-memory rate limiter is per-process
  and shared; a verify run right after other /api/ai traffic can 429 (the
  "reply" check then passes on the prebaked greeting and only the console
  check fails). Restart serve.ts for a clean window before verifying.
- Full-page screenshots at 390px are 40k+ px tall — always crop before
  reading (image-size limit).
