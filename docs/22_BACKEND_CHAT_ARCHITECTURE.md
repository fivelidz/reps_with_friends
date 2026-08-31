# RWF Backend Chat Architecture — the single source of truth

**Date:** 2026-08-31 · **Status:** living document (supersedes the transport sections of docs/03; builds on docs/21)
**Founder question this answers:** *"figure out how the tech backend of this should work so it is through slack or whatsapp etc."*

---

## TL;DR — the architecture in six lines

1. **ONE game core** (`@rwf/game-core`): pure engine — handicap scoring, comeback, seasons. No I/O, no platform code.
2. **ONE chat brain** (`@rwf/bot-core` CommandBus): every command (`new/join/start/log/s/taunt/pot/result/rematch/nemesis/digest/season/watch/challenge/link/help`) enters here, regardless of platform.
3. **MANY dumb transports** (implement `ChatTransport` in `packages/bot-core/src/transports/`): Slack Bolt (official) · WhatsApp via Qalarc Hub now → Cloud API at pilot · **Beeper Desktop (new, built)** · Telegram via bridge. Transports translate events in and cards out — nothing else.
4. **ONE state authority** (`apps/api` on :4174, JSON file now → Postgres later): crews, matches, seasons, pots. Bots mirror into it (`MatchStore.api()` — landed); the app pulls from it (already built).
5. **The app is a first-class client of the same API** — same scoreboard the bots write to, same crew codes (`link CREW-XXXX` binds a chat to the crew the app created).
6. **Official APIs at scale, bridges for reach** (docs/21): never build stranger-facing product on unofficial sessions; bridges (Beeper/Matrix) are for founder/friends/community groups.

```
                        ┌────────────────────────────────────────────────────────┐
                        │                    HUMANS                              │
                        │  Slack   WhatsApp   Telegram   Discord   …   Web app    │
                        └────┬─────────┬─────────┬─────────┬────────┴──────┬─────┘
                             │         │         │         │               │
                 ┌───────────▼──┐ ┌────▼─────┐ ┌─▼──────────▼──┐          │
                 │ Slack Bolt   │ │ Qalarc   │ │ BEEPER DESKTOP│          │
                 │ (official)   │ │ Hub →WA  │ │ local API+WS  │          │
                 │              │ │ (Cloud   │ │ one transport,│          │
                 │              │ │ API@pilot│ │ N networks)   │          │
                 └──────┬───────┘ └────┬─────┘ └──────┬────────┘          │
                        │              │              │                   │
        ┌───────────────▼──────────────▼──────────────▼──────────┐        │
        │        @rwf/bot-core  —  THE SINGLE CHAT BRAIN          │        │
        │  ChatTransport (dumb pipes)  ·  CommandBus (grammar)    │        │
        │  cards / digest / taunts / AI hooks                     │        │
        └───────────────────────┬─────────────────────────────────┘        │
                                │  MatchStore  ──.api() mirror (P1, landed)
                                │  file primary · apps/api when reachable
                                ▼                                           ▼
        ┌───────────────────────────────────────────┐        ┌──────────────────────────┐
        │  apps/api  :4174  —  STATE AUTHORITY      │◀───────│ apps/web (PWA)           │
        │  crews · matches · seasons · pots         │  pull/  │ localStorage + outbox    │
        │  JSON file now → Postgres at scale        │  sync   │ sync layer (built)       │
        └───────────────────────┬───────────────────┘        └──────────────────────────┘
                                │
                        ┌───────▼────────┐
                        │ @rwf/game-core │  pure engine: handicap, comeback,
                        │ (no I/O)       │  seasons, photo-finish — used by ALL of the above
                        └────────────────┘
```

---

## 1. Component contracts (what each piece is allowed to do)

| Component | Path | Contract |
|---|---|---|
| **game-core** | `packages/game-core/src/` | Pure functions over `MatchState`. Never touches network, files, or platforms. |
| **CommandBus** | `packages/bot-core/src/bus.ts` | `handle(InboundMessage) → card text`. Platform-agnostic (`chatId`/`playerId` are prefixed strings like `wa:+614…`, `slack:U123`, `beeper:@tg_ben:beeper.com`). Never throws — errors come back as cards. |
| **MatchStore** | `packages/bot-core/src/store.ts` | chatId → StoredMatch (+ seasons/spectators/challenges). File-primary. **`.api(baseUrl)` turns on the apps/api mirror (P1, landed)** — see §5. |
| **ChatTransport** | `packages/bot-core/src/transports/chat-transport.ts` | `send(text, to)` + `health()` (+ `start/stop` for receiving). The dumb-pipe rules: no game logic, never block, stay quiet on chatter, rate-limit personal-account sends. |
| **apps/api** | `apps/api/src/` | The state authority: `POST/GET /crews`, `/matches/:id/log`, `/mvp`, `/season`, `POST /bots/state` (bot mirror). JSON file store now; Postgres when a second writer appears. |
| **app sync layer** | `apps/web/src/sync.ts` | Offline-first mirror of app actions → apps/api, with outbox + crew pull. Already built; unifying is a matter of pointing it at a deployed API (T5, §6). |

**Identity model (v1, pre-auth):** a player is a per-platform id string. Cross-platform player merging (same human on WhatsApp + Telegram) is future work via invite links — do not silently merge. **Crew codes are the join key today**: a chat runs `link CREW-7Q2` and its matches surface under that crew everywhere (app + API + other chats' `watch CREW-7Q2`).

---

## 2. Data flow — worked example

*A rep logged in a WhatsApp group flows everywhere it needs to go:*

```
 1. Dave types "log pushups 80"  in the WhatsApp group (Qalarc Hub session)
 2. Hub writes the inbound line to messages.jsonl → bot-whatsapp tails it (2s poll)
 3. looksLikeCommand("log pushups 80") ✓ → CommandBus.handleAsync({chatId:"wa:group-…",
    playerId:"wa:+614…", playerName:"Dave"})
 4. Bus: resolve exercise → applyComeback → game-core logReps → MatchStore.update()
    → persist() writes .data/bot-matches.json  AND schedules the apps/api mirror push
 5. apps/api (POST /bots/state) upserts the crew-linked match under CREW-7Q2
    → GET /crews/CREW-7Q2 (the app's existing pull) now shows Dave's reps
 6. Bus returns the log card → bot-whatsapp sends it via Hub → WhatsApp group
 7. (broadcast fan-out, P1.5 — seam exists, wiring TODO) every chat that ran
    `watch CREW-7Q2` gets the standings milestone card — including a Telegram
    group reachable through the Beeper transport, and the app's crew screen
    on its next pull
 8. Match closes → result card + SVG → season ladder records it
```

Step 7 is the only piece not wired end-to-end today: the MatchStore already tracks spectators per crew (`spectators` map), but there is no cross-transport broadcaster. **TODO (P1.5):** add a `BusEvents.onMatchClosed` hook in bot-core and a small fan-out loop in each bot main. Design note: broadcasts must be batched (milestones/hourly), never per-rep — cost control (docs/03 §1).

---

## 3. Transport inventory & status

| Transport | Path | Status | Reach | ToS posture |
|---|---|---|---|---|
| **Slack Bolt** | `apps/bot-slack/` | skeleton (T1: needs 5-min app setup) | corporate workspaces | ✅ official |
| **WhatsApp — Qalarc Hub** | `apps/bot-whatsapp/` | **live** (dogfood) | founder's groups/DMs | ⚠️ personal session (grey) |
| **WhatsApp — Cloud API** | planned (same `ChatTransport` seam) | not started (T2: group support unverified) | customers at scale | ✅ official, per-convo $ |
| **Beeper Desktop** | `packages/bot-core/src/transports/beeper.ts` | **built + sim-green**; live blocked on Beeper being open (§7) | every network the founder connects in Beeper: WhatsApp, Telegram, Discord, Signal, Messenger, LinkedIn, X, … | ⚠️ personal sessions via on-device bridges (grey) — dogfood only |
| **Telegram Bot API** | P4 | not started | clean bot path | ✅ official (via Beeper bridge until then) |
| **Matrix bot core** | P3 (docs/21 option B/C) | design only | all bridged networks with ONE bot account | bridges grey; Matrix itself clean |

**The Beeper insight (docs/21):** because Beeper is a Matrix client whose bridges are all open source, "add a platform" becomes "connect a bridge," not "write a bot." The BeeperDesktopTransport is the cheapest possible proof of that — one transport, every network the founder has connected, zero new infrastructure.

---

## 4. ToS / risk table & cost model

| Transport | Account type | Ban risk at dogfood volume | Ban risk at scale | Cost | What breaks first |
|---|---|---|---|---|---|
| Slack Bolt | org app | none | none | free tier → per-active-user $ | Slack rate limits (~1 msg/s/burst) |
| WhatsApp via Hub | personal linked device | low but real | **unacceptable — never scale this** | $0 | Meta device-pair bans; Hub is one session |
| WhatsApp Cloud API | business number | none | none | per-conversation (template/utility/marketing tiers) — model before pilot | cost at chatty-group volume; group support unverified (T2) |
| Beeper Desktop | founder's personal accounts (all networks) | low at ≤ a few msgs/min (Beeper's own warning: "sending too many messages might result in account suspension") | **unacceptable** | $0 (≤5 accounts; Plus $9.99/mo beyond) | desktop must stay running; per-network rate limits; port may change per install |
| Telegram via bridge | personal MTProto session | low | grey | $0 | session limits |
| Telegram Bot API | bot | none | none | free | privacy-mode/group-admin config |
| Matrix (P3) | bot account | none (Matrix) | bridge sessions still grey per network | $0–10/mo (bbctl self-host free) | homeserver ops (if self-hosted) |

**Operating rules that fall out of this table:**
- Bridges and personal sessions are for **founder + friends + community groups** only. The moment a paying stranger appears, that platform's traffic must be on its official API.
- Every transport rate-limits sends (`minSendGapMs` in the Beeper transport; batched standings everywhere).
- Agent-generated traffic is tagged where the convention exists (Hub `source:"ai"`; Beeper sends as the founder — keep volume conversational).

---

## 5. Migration plan — each phase shippable

### P0 — where we were this morning ✅
Transports write their own stores (`bot-matches.json`), app is standalone localStorage. Works, splits state.

### P1 — bots mirror into apps/api ✅ **LANDED 2026-08-31**
- `MatchStore.api(baseUrl)` (`packages/bot-core/src/api-sync.ts`): every persist pushes a state snapshot to `POST /bots/state`, debounced, fire-and-forget. **File stays primary** — bots keep playing when the API is down; the mirror marks `lastError` and retries on the next persist.
- apps/api adopts crew-linked bot matches into its real `crews`/`matches` tables (upsert by match id, players merged by id) → the app's existing `GET /crews/:code` pull sees bot-played matches. Idempotent.
- Verified live on :4174 (`packages/bot-core/src/transports/p1-live-demo.ts`): bot match → `GET /crews/CREW-P1LV` → 2 players, completed match, photo-finish standings.
- Tests: `packages/bot-core/test/api-sync.test.ts` (real apps/api on an ephemeral port; incl. API-down fallback).
- **Still TODO in P1:** wire `.api()` into the running bots' mains (`apps/bot-whatsapp/main.ts`, Slack when live, Beeper `--live`) — one line each: `new MatchStore(f).api("http://127.0.0.1:4174")`. Left undone so the dogfood bots' behaviour is unchanged until the founder opts in.

### P2 — app onto the same authority 🟧 mostly built
`apps/web/src/sync.ts` already mirrors app actions → apps/api (offline-first, outbox, armed opt-in) and pulls crews (`GET /crews/:code`). Remaining:
1. Deploy apps/api somewhere always-on (minirig once it's back — T3 — or a $5 VPS / Cloudflare worker) so sync is available beyond localhost.
2. Flip the app's crew-adopt path to prefer API ids when present (id mapping already exists in `rwf.sync.v1` meta).
3. Result cards generated by bots (SVG in `.data/cards/`) need a URL the app can render — serve `cards/` through apps/api (static route) or upload to the same host.

### P3 — Matrix as the canonical bot transport (docs/21 option B→C)
Run `@rwf/bot-core` as a Matrix user (`@rwf:beeper.com` first, our own homeserver later — Tuwunel/Continuwuity, not conduwuit). Per-platform reach = which bridges are connected (`bbctl` self-hosting for the noisy ones, free). The `ChatTransport` seam already fits: a `MatrixTransport` is a receiving transport whose chatIds ARE Matrix room ids — the Beeper transport's `beeper:!room:…` ids are already Matrix-shaped, so migration is renames, not rewrites. Exit criteria: bot posts to a bridged Telegram group without the founder's Beeper running.

### P4 — official APIs at scale
WhatsApp Business Cloud API (Meta verification, per-convo cost model, template messages, DM-fallback design if groups are out — T2), Telegram Bot API, Slack stays Bolt. Bridges remain for the long tail (Signal, iMessage). Exit criteria: a stranger can join a paid crew on an official-API platform with a supportable ToS posture.

---

## 6. T5 (app ↔ bot state split) — concrete unblock steps

The blocker (docs/15): *app localStorage vs bot .data JSON, no sync; a crew created in the app can't be played by the bots.* P1 just closed the hard half. Remaining, in order:

1. **Wire the bots' stores to the mirror** (P1 TODO above — one line per bot main; bots then WRITE to the authority).
2. **Always-on apps/api** (T3): minirig systemd user service (pattern exists: `scripts/hosting/`) or VPS; CORS already allows `rwf.qalarc.com`.
3. **App reads through the API** when armed: crew screen pulls `GET /crews/:code` (built) — bot matches appear because of P1's adoption.
4. **Shared crew code UX:** app shows the crew code prominently (it already mints 5-char codes, same alphabet as bot `link`); bot `link <CODE>` binds the chat. No new id system needed.
5. **Identity (T4) later:** magic-link auth via Resend unifies a human's platform ids under one account; until then, per-platform ids + crew codes are honest and work.

---

## 7. The Beeper transport (built today) — operator's guide

**Code:** `packages/bot-core/src/transports/beeper.ts` (+ `beeper-cli.ts` harness, `mock-beeper.ts` sim server, `test/beeper.test.ts` — 21 tests).
**Implements:** `ChatTransport` + receive (`start/stop`) → WS `/v1/ws` with `subscriptions.set ["*"]`; REST `GET /v1/chats`, `POST /v1/chats/{id}/messages`; Bearer auth; echo suppression via `isSender`; chatter filtered by `looksLikeCommand`; replies upgraded mrkdwn→markdown (`*x*`→`**x**`) for Beeper rich text; sends rate-limited (`minSendGapMs`, default 1.2s — personal-account safety).
**Crew mapping:** every chat the bot speaks in is recorded in `.data/beeper-links.json` (id + network label); `link <CODE>` flows bus → CrewLinkMap; `chatsFor(crewCode)` is the fan-out join point for P1.5 broadcast.

**Probe findings on this machine (2026-08-31):**
- Install: `~/Applications/Beeper.AppImage`, data `~/.config/BeeperTexts/`, account `@alexeib:beeper.com`.
- Local API port: **23373** (the documented default; confirmed in the install's own logs — `renderer-0.log` connects to `ws://127.0.0.1:23373/…` 1000+ times; `desktop-api-0.log` shows `/v1/info`, `/v1/spec`, `/v1/chats`, `POST /v0/mcp` traffic).
- **Beeper Desktop is not currently running** → probe reports `up:false` with the unblock steps below (this is the expected outcome until the founder opens the app).
- Auth model: **every endpoint needs a Bearer token** minted in-app. The desktop-api log shows `Loaded 0 existing access tokens` — **no token exists yet**.

**To go live (founder, ~3 minutes):**
```bash
# 1. Open the Beeper Desktop app (leave it running) and connect ≥1 network
#    (e.g. Telegram) with a group you're willing to dogfood in.
# 2. Beeper → Settings → Integrations → “+” next to “Approved connections”
#    → create an access token.
# 3. export BEEPER_ACCESS_TOKEN=<that token>
# 4. bun packages/bot-core/src/transports/beeper-cli.ts --probe   # expect up ✓ authed ✓
# 5. bun packages/bot-core/src/transports/beeper-cli.ts --live    # say `rwf help` in the group
```
Sim needs none of this: `bun packages/bot-core/src/transports/beeper-cli.ts --sim` runs the whole loop (probe → chats → link → match → photo-finish result → cross-network spectators) against the in-process mock.

**Known caveats:** the API port is chosen by the app (23373 today; the probe re-discovers it from logs); `--live` drives the founder's personal accounts — keep volume conversational; iMessage impossible off-macOS; message history may be partial until Beeper finishes indexing a newly-added account.

---

## 8. What is intentionally NOT in this architecture (yet)

- **No queue/broker** (Redis, NATS…) — single-process bots + a JSON-file API are correct for ≤ a few crews. Introduce a real DB + job queue when: a second always-on writer exists, or match-close fan-out latency matters.
- **No multi-instance bots** — one process per transport, one store file each. The mirror makes their state visible, not shared; true shared-authority bots are P2/P3 (async store behind the bus).
- **No webhooks into transports** — polling (Hub tail) and WS (Beeper) are enough; webhook ingestion arrives with the Cloud API anyway.
- **No payments in chat** — pots are pledge-only until L1 (legal opinion) clears.

## 9. Cross-references

- docs/21_BEEPER_MATRIX_INVESTIGATION.md — why Matrix/Beeper, bridge inventory, staged recommendation (this doc implements its step ①)
- docs/03_CHAT_INTEGRATIONS.md — command surface, verification flow, broadcast discipline
- docs/15_BLOCKERS.md — T1 Slack app, T2 Cloud API groups, T3 always-on host, T4 auth, T5 state split (§6 above closes it)
- docs/18_MESSAGING_PLATFORMS.md — WhatsApp Groups API status detail
- Code: `packages/bot-core/src/transports/` (Beeper + ChatTransport + mock + harness) · `packages/bot-core/src/api-sync.ts` (P1 mirror) · `apps/api/src/routes.ts` (`/bots/state`) · `apps/web/src/sync.ts` (app side)
