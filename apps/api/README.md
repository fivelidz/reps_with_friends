# @rwf/api — the unified RWF backend (MVP foundation)

Plain **Bun + TypeScript**, zero framework deps (`Bun.serve` + a ~40-line
router in `src/routes.ts`). All game logic comes from
`@rwf/game-core` (imported by relative path — same engine the app and bots
already use). Persistence is one JSON file with atomic writes.

**Port 4174.** CORS allows `http://localhost:4173` (dev `serve.ts`) and
`https://rwf.qalarc.com`.

## Why this exists

Today there are two stores:

| Consumer | Current store | Problem |
|---|---|---|
| Web app (`apps/web`) | `localStorage` (`rwf.state.v1`) | Per-device, no cross-player truth, no chat sync |
| Bots (`apps/bot-*`) | `.data/bot-matches.json` | Bot-only shape, app can't read it |

This API is the single source of truth both converge on. **Migration path:**

- **App:** keeps localStorage as an offline cache; gains a "sync" layer that
  reads/writes these endpoints (crew code is the join key). Later.
- **Bots:** keep their file store until the swap — then bot commands become
  thin HTTP clients of this API (same engine underneath, so behaviour is
  identical). Later.
- **Storage:** JSON file now → Postgres in Phase 3 without touching route
  shapes (the `db.ts` interface is the seam).

## Run

```bash
bun apps/api/src/main.ts            # :4174, db at .data/api-db.json
PORT=4300 bun apps/api/src/main.ts  # custom port
RWF_API_DB=/tmp/x.json bun apps/api/src/main.ts  # custom store (tests use this)
bun test apps/api                   # full flow test over real HTTP
```

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ok, service, db, crews, sotGroups, time}` |
| POST | `/crews` | `{name}` | `201 {code, crew}` — code is 5 chars, no 0/O/1/I |
| GET | `/crews/:code` | — | `{crew, matches[], season?}` |
| POST | `/crews/:code/players` | `{name, tier?}` | `201 {player}` — tier: couch·casual·fit·athlete (default casual) |
| POST | `/crews/:code/matches` | `{exercises[], target?, playDays?}` | `201 {match, standings}` — exercises are strings or `{id?,name}`; defaults target 300, playDays [1,3,5]. Creates **and starts** the match with all crew players |
| GET | `/matches/:id` | — | `{match, standings, winner, mvpPlayerId}` |
| POST | `/matches/:id/log` | `{playerId, exerciseId, reps, verified?, avgHrrPct?}` | `{standings, closed, comebackApplied, winner?}` — engine `applyComeback` + `logReps`; `closed=true` when raw target reached |
| POST | `/matches/:id/mvp` | `{playerId}` | `{mvpPlayerId, match, seasonLadder?}` — match must be complete; if the crew has an active season the result is recorded (3/2/1 + MVP+1, streaks) |
| GET | `/crews/:code/season` | — | `{season, ladder}` or `{season: null, ladder: null}` |
| POST | `/crews/:code/season` | `{name?, weeks?}` | `201 {season, ladder}` — defaults name "Season N", weeks 4 |

Errors are `{error: string}` with 400 (validation/engine), 401 (bad token),
404 (unknown crew/match/group). Engine errors surface verbatim
("match is not live", …).

## SOT groups (M1 — the v4 daily-battle authority)

**`/sot/*` is the M1 answer to "why do the bots have to run on my system?":
this API is the game-state authority; the v4 app and the bots are clients.**
The engine is `apps/sot-engine.js` imported directly (the app's own engine —
one engine everywhere). Groups live in `.data/sot-api.json` (atomic writes;
Postgres later per docs/22). Auth-lite: joining mints a random
`playerToken`, kept server-side; clients may propose their `id` (the app's
local member id) so engine state carries identical ids on both sides — the
token remains the actual credential.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/sot/groups` | `{name, config?{targetReps, playDays, exercises, dayWindowMs, flags}, bots?[{name, tier, id}]}` | `201 {code, groupId, botTokens[]}` — season + battle day 1 open on first player join. House-crew "bots" get tokens (returned **once**) so a device-less player acts via `/cmd` |
| GET | `/sot/groups/:code` | — | `{name, config, players[], playerCount, hasLiveDay, seq}` |
| POST | `/sot/groups/:code/players` | `{name, tier?, id?}` | `201 {playerId, playerToken, state}` — the day auto-opens on the first join; later joiners are patched INTO the live day (app late-join semantics) |
| GET | `/sot/groups/:code/state?since=<seq>` | — | full state `{seq, group, players, day, season, stake, board, standings, events}` or `{seq, unchanged: true}` when caught up — the app polls this every 5s |
| POST | `/sot/groups/:code/log` | `{playerToken, exercise, reps, verified?}` | `{ok, ruf, completed, wonDay, seq, state}` — **`reps` are engine reps** (RUF-equivalent physical reps; the client applies its exercise-value conversion first, exactly like `apps/sot/engine.js` does). Tiers apply server-side |
| POST | `/sot/groups/:code/cmd` | `{playerToken, text}` | `{ok, reply, seq, state}` — **any chat command through the real `SotCommandBus`, server-side**: `new/join/start/log/s/day close/season/stake/agree/lightning/steal/…`. Bots and the app share literally one brain |

Past-deadline days auto-close (and record into the season) before any
read/write. `seq` is monotonic across every mutation — polls with `since`
are near-free when nothing moved.

**Consumers:**
- **v4 app** — `apps/sot/cloud.js` (Settings → Sync: Cloud pilot): optimistic
  local logs + `/log`, 5s `state?since` polls (plus visibilitychange),
  join-by-code against `/sot`. Local mode unchanged; the offline Conn queue
  replays to the API on reconnect.
- **Bots** — `@rwf/bot-core`'s `SotApiSession`/`createSotHandler`: the same
  text grammar piped to `/cmd`; auto-creates the chat's group + the sender's
  seat (tier from `join <tier>`); falls back to the local file bus when the
  API is down.
  `bun apps/bot-whatsapp/main.ts --sim --sot --api http://localhost:4174`
  runs a full day against the live API.

Old `/crews`/`/matches` endpoints are unchanged (the LEGACY 300-match model —
v1-v3 apps and existing bot matches keep working beside this).

## Layout

```
src/db.ts      JSON store (.data/api-db.json): crews, matches, seasons.
               loadDb / saveDb (atomic tmp+rename) / mutateDb / lookups.
src/routes.ts  Route table + tiny matcher. Transport + validation only —
               every game decision is a game-core call.
src/sot.ts     SOT groups (M1): /sot/* handlers + store (.data/sot-api.json),
               the apps/sot-engine.js import, the bus adapter, seq, events.
src/main.ts    Bun.serve + CORS + /health. startServer(port) is exported so
               tests boot an ephemeral instance.
test/api.test.ts  Full flow over fetch: crew → players → season → match →
               logs (comeback armed + once-only) → close → mvp → ladder,
               plus CORS/preflight/404/error paths.
test/sot.test.ts  SOT flow: create → join (auto-open day) → logs → /cmd
               (standings, power-ups, day close, stakes) → two phones via
               state?since → seq monotonicity → auto-close → bot personas.
```

## Design notes

- **Comeback** is applied server-side in `/log` (engine checks eligibility
  against pre-entry state) so every client gets the same rule for free.
- **Season recording** happens on MVP vote (result finalisation), not on
  match close — the vote is part of the result. `seasonRecorded` guards
  against double-counting.
- **Atomic writes** (write tmp → rename) mean a crash can't corrupt the store;
  a corrupt file degrades to empty rather than taking the API down.
- No auth in MVP — codes are the capability. Auth lands with the Postgres
  swap.
