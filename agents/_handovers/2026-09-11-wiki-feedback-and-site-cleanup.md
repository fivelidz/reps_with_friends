# HANDOVER: wiki feedback + main-page squad removal — 2026-09-11

## Shipped

- **Wiki feedback layer** (founder: "set up the wiki and allow a comment function that can be read for feedback"):
  - `apps/api/src/feedback.ts` — dependency-free store module (`.data/feedback.json`, `RWF_FEEDBACK_DB` override, atomic writes, newest-2000 bound). Caps: text ≤1000 (rejected over), name ≤40 / page ≤80 (silently clamped), 12 POST / 5 min per IP, same page+text dedupe in newest 200 → `201 {deduped:true}`. Strictly monotonic `at` timestamps.
  - `apps/api/src/routes.ts` — `POST /feedback`, `GET /feedback?page=`, `GET /feedback/recent?limit=` (clamped 1–200, default 50). Zero auth by design.
  - `apps/wiki/feedback.js` — comment widget on EVERY wiki page (name optional → anon, char counter, inline status, this page's notes listed under the form); powers `/wiki/feedback`; fills `[data-fb-total]` on the index. textContent-only rendering (XSS-inert by construction).
  - `apps/wiki/feedback.html` — the admin reading room: filter by page (picked page = complete history via `?page=`; "all" = capped `recent`), live counts, page names link back to chapters. Mobile-clean.
  - 📝 Feedback nav link + `<script feedback.js>` on all 10 existing wiki pages; index got a "wiki notes" stat + an at-a-glance table row.
  - `wiki.css` — the `.fbx` block (widget + admin, mobile breakpoint at 560px).
- **Server wiring** (docs/22 §11): `serve.ts` proxies `/feedback*` → `http://127.0.0.1:4174` (2.5 s timeout, `x-forwarded-for` forwarded, verbatim status passthrough) **and falls back to the same feedback.ts module in-process when the API is down** — `bun serve.ts` alone keeps the comment box working. `dirRoute` gained a `rel.html` try (mirrors Cloudflare Pages pretty-URLs; `/wiki/feedback` resolves locally now).
- **Tests**: `apps/api/test/feedback.test.ts` (33 checks) + `apps/wiki/test/feedback-e2e.mjs` (29 checks: module → API → proxy → real browser post → appears → stream). `walk.mjs` extended to 11 pages.
- **Main site cleanup** (founder: avatars off the main screen): the whole `<section id="squad">` (markup + inline module) is archived in an inert `<template id="squad-archive" data-archived="2026-09-11">` inside `site/index.html` — NEVER deleted; restore = move the markup back out. Kickers renumbered 01–09 so nothing gaps. `/avatars` + `/atelier` links untouched in the explore grid. `.squad-*` CSS untouched.

## Verified

- `bun test apps/api` → **57/57** (24 pre-existing + 33 new feedback tests)
- `bun apps/wiki/test/feedback-e2e.mjs` → **29/29** (spawns a temp-store API on :4174 so the real notes box stays clean)
- `bun apps/wiki/test/walk.mjs` → **27/27** (11 pages incl. feedback.html, zero console errors)
- `bun site/verify.ts` → **13/13 PASS** (87/87 reveals — first-run 77/87 was CPU starvation from parallel suites, re-probe 0 missing)
- game-core + bot-core regression → 212 tests green (untouched lanes)
- DOM truth on `/`: `#squad` not rendered, template archive present, hero canvas alive, avatars/atelier links present
- Screenshots (for eyes): `/tmp/look_site_flow.png`, `/tmp/look_wiki_feedback.png`, `/tmp/look_wiki_widget.png` (1280×761)

## Next agent should

- **Production wiring is the open seam**: rwf.qalarc.com/wiki is static Cloudflare Pages — `/feedback` 404s there, so the prod widget shows a polite inline "unreachable" notice. Fix = a Pages Function proxying to the API box, or a reverse-proxy route on the host → :4174. Recipe in docs/22 §11. NOT done here (deploy/functions was outside this wave's path scope).
- Restart notes: both `serve.ts` and `apps/api` were restarted on this machine to pick up the new code (pids logged in /tmp/rwf-{serve,api}.log).
- When avatars are product-ready: pull the squad markup out of `template#squad-archive` in site/index.html, un-renumber the kickers (04→05…09→10), and re-run `bun site/verify.ts` + `apps/web/test/avatars-check.ts`.
- `apps/web/test/avatars-check.ts` currently FAILS by design (asserts `window.__rwfSquad` on the main page) — it's the lane-10 instrument, not in the standing suite. Leave it until the squad returns.

## Gotchas hit

- The feedback rate limiter counts failed-validation POSTs too (by design — spam guard); tests must ride per-call `x-forwarded-for` IPs or they wall-jump mid-file.
- Same-millisecond notes tie on `at` — the store bumps monotonic +1 ms so newest-first reads stay arrival-true.
- Template content is NOT in the document DOM tree: `querySelector('#squad')` misses it (that's why the archive is inert), but also means `walk.mjs`-style checks can't see it — the archive is verified by `template#squad-archive` presence.
- The e2e, when an API already runs on :4174, uses it and tags markers `page:"e2e-check"` (prints a notice) — expected noise, not a bug.
