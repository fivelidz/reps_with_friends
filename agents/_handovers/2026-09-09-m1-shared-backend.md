# HANDOVER: M1 — the shared backend (apps/api = authority) — 9 Sep 2026

Founder question executed: *"why do the bots have to run on my system?
Surely the reads should come from the app for each user."*

**The answer, now shipped and tested:** apps/api is the game-state authority;
the v4 app and the bots are clients of it; the bots run BESIDE the API
wherever it is deployed — the founder's machine is optional.

## Shipped

**1. apps/api v2 — SOT groups (`apps/api/src/sot.ts`, routes `/sot/*`)**
- The v4 daily-battle model server-side. The engine is **`apps/sot-engine.js`
  imported directly** (checked: pure ES module, zero DOM deps — Bun runs it
  natively). One engine everywhere: app, API, bots, tests.
- Store: `.data/sot-api.json` (atomic tmp+rename; env `RWF_SOT_DB`).
  Groups are supersets of bot-core's `StoredSotGroup`
  (config/players/season/day/dayDate) + code/name/tokens/seq/events, so the
  SotCommandBus drives the SAME objects the structured endpoints serve.
- Endpoints (keep the old /crews ones 100% intact):
  - `POST /sot/groups` {name, config{targetReps, playDays, exercises,
    dayWindowMs, flags}, bots[]} → 5-char join code + botTokens (house-crew
    personas get server seats + tokens, returned ONCE).
  - `GET /sot/groups/:code` · `POST …/players` {name, tier, id?} →
    `{playerId, playerToken, state}`. Auth-lite: random token kept
    server-side; **clients propose their `id`** (the app's local member id)
    so engine days carry identical ids on both sides — token = credential,
    id = identity. Day 1 auto-opens on the first join (dayWindowMs or
    21:00 default); later joiners are patched INTO the live day.
  - `GET …/state?since=<seq>` → full state or `{seq, unchanged:true}`.
    Seq is monotonic on every mutation (joins, logs, cmds, auto-close).
  - `POST …/log` {playerToken, exercise, reps, verified?} → engine reps
    (RUF-equivalent physical reps — the CLIENT converts exercise values
    first, exactly like engine.js does; the engine tiers server-side).
  - `POST …/cmd` {playerToken, text} → the REAL SotCommandBus server-side
    (grammar: new/join/start/log/s/day close/season/stake/agree/lightning/
    steal/shield/freeze/bomb/rope/pot/charity/donate/cards/help). Bots and
    the app share literally one brain.
- Past-deadline days auto-close + record into the season before any
  read/write. Day-record date collisions get a `#idx` suffix (same trick as
  the app). CORS: prod origins exact + any localhost/127.0.0.1 port (the
  pilot's two-port dev world; deployed it's same-origin anyway).

**2. The v4 app's sync client (`apps/sot/cloud.js` → `window.RWFCloud`)**
- Settings row **"Sync: Local / Cloud (pilot)"** (profile settings + start
  screen, ids `sync-mode`/`sync-mode-start`), API-base input in Settings.
- Cloud mode: optimistic local logs POST to `/log` and merge the server
  reply (conflict = server wins + toast); **5s `state?since` poll** +
  visibilitychange → other phones' logs appear live; join-by-code looks up
  off-device groups (new scrJoin steps cloudLoading/cloudPreview/
  cloudJoining/cloudMiss); creator wizard finish → `createForLocalGroup`
  (server twin + bot seats, `g.code` becomes the server code).
- Local mode untouched: offline is still first-class; the Conn shim queue
  replays to the API on reconnect (`replayQueuedLogs`); demo seeder stays
  local-only. Merge marks feed events `cloud:true`; server win events map
  to the app's "win" feed type so the beaten-to-the-punch moment fires.
- Engine guard (`apps/sot/engine.js`): for cloud-bound groups (`g.cloud`)
  the scheduled-battle auto-open loop and `resolveBattle`'s beginBattle are
  skipped — **the server opens days; the poll merge flips the local
  mirror**. Local closes still work (same deadline, same entries).

**3. Bots as clients (`packages/bot-core/src/sot-api.ts`)**
- `SotApiSession` / `createSotHandler({apiUrl})`: `handle(InboundMessage) →
  reply card` via `/cmd`; auto-creates the chat's server group + the
  sender's seat (tier from `join <tier>`); token cache in
  `.data/sot-api-session.json`; **file-fallback** to the local SotStore +
  bus when the API is unreachable (P1 semantics preserved).
- `bot-whatsapp/main.ts`: new `--api <url>` flag —
  `bun apps/bot-whatsapp/main.ts --sim --sot --api http://localhost:4174`
  runs the day against the live API (group UAZT3-style codes printed;
  `day close force` is the ops close).
- Small bus fix (`sot-bus.ts` cmdJoin): an ALREADY-SEATED player typing
  `join` during a live day now gets a friendly "already in today's battle"
  instead of the new-joiner error (the API auto-opens days, so this path is
  the norm for server groups).

**4. Deployment path — appended to `docs/22 §10`** (also the README of
apps/api): Hetzner CX22 ~€4.5/mo or Oracle free ARM; `rwf-api.service`
systemd unit (adapted from scripts/hosting/rwf-serve.service) + one bot
service beside it; the app points at the API via the Settings base URL,
default **same-origin `/sot`** (Caddy/nginx snippet in docs/22); stores
change NOTHING for players — it's just fetch.

## Verified
- apps/api **40/40** (24 legacy crews + 16 new SOT: lifecycle, late-join
  patch, tier math server-side, two "phones" via state?since, seq
  monotonicity, /cmd grammar incl. stakes + day close + power-ups, auth-lite
  401s, past-deadline auto-close, bot personas, legacy-endpoints-still-work).
- bot-core **98/98** (incl. new sot-api.test.ts: auto-create/join/tier, two
  chats → two groups, lost-server-group recovery, offline fallback).
- **e2e-cloud.mjs 24/24 — THE TWO-PHONE TEST** (two headless chromiums =
  two storages, zero console errors on both): A creates a cloud group
  through the wizard + Settings toggle; API roster = 4 (creator + 3 house
  bots); B joins by code (cloud preview → "I'm in"); A logs via the LOG UI →
  B's standings update from the poll alone; B logs → A sees it; a bot
  persona logs via `/cmd` → BOTH phones see it; A crosses target (Daily
  Win), `day close force` settles; both phones show the SAME winner with 1
  season point each; day closed on both.
- Existing v4 suites green in LOCAL mode: **129/129** (main), **59/59**
  (states), **58/58** (cards), **80/80** (tutorial). Cloud is opt-in and
  cannot break local (module no-ops unless Sync: Cloud).
- Shots: `apps/sot/shots/*_cloud.png` — incl. `99-two-phones-sync_cloud.png`
  (two phone frames side by side mid-sync) + per-phone battle/preview/recap.

## Where things live (fast map)
- `apps/api/src/sot.ts` — the authority (store, lifecycle, bus adapter, seq)
- `apps/api/src/routes.ts` — /sot routes (top of the table) + old crews
- `apps/sot/cloud.js` — the app client (load-before-app.js in index.html)
- `apps/sot/e2e-cloud.mjs` — the two-phone test
- `packages/bot-core/src/sot-api.ts` — SotApiSession (bots as clients)
- `apps/bot-whatsapp/main.ts` — `--sim --sot --api <url>` sim
- `docs/22_BACKEND_CHAT_ARCHITECTURE.md §10` — deployment + boundaries

## Known limits (deliberate — the pilot unifier, not the scale backend)
- JSON-file persistence; single API process. Postgres swap keeps route
  shapes (db.ts/sot.ts store interfaces are the seams).
- Polling (5s), not push. Crew-scale: fine. WS/SSE later.
- The v4 card-stack deals (draft/reroll/proofs) remain app-local; server
  groups grant the canon day-kit and take power-up verbs over `/cmd`.
  Syncing the full card economy is the next seam if wanted.
- Cloud-group stakes: server groups take stakes via `/cmd`
  (`stake charity …`) — the wizard's stake config is local-only for now.
- Window-clock groups: cloud.js maps the wizard clock to a server
  `dayWindowMs` (duration → same minutes; window → until windowEnd today).

## Next (in order)
1. Deploy the pilot: Oracle/Hetzner box, `rwf-api.service`, Caddy
   `/sot/*` proxy on rwf.qalarc.com, one WhatsApp bot service beside it.
2. Founder's actual second phone joins a real crew code.
3. If card-stack sync is wanted: extend `/sot` state with drafts/proofs and
   give cloud.js a deal-pick POST (the engine functions already exist
   server-side).
4. The Workers/Postgres phase (docs/22 §5) — every route shape survives.
