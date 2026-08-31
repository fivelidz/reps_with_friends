# 21 — Beeper & Matrix Investigation: Multi-Platform Chat Bridge for RWF

**Date:** 2026-08-31 · **Author:** ops agent · **Status:** research complete, recommendation inside
**Trigger:** Founder installed Beeper on superlocal ("we have now installed the app Beeper").
**Question:** How does Beeper connect to different chat interfaces, and could RWF use it (or the stack beneath it) to reach group chats on many platforms with ONE bot core?

---

## TL;DR

- **Beeper is a Matrix app.** Every Beeper account is a real Matrix user (`@alexeib:beeper.com` on `matrix.beeper.com` — verified in the local install's own database). All of its bridges are **open source** (the `mautrix/*` family + `bridgev2` framework).
- The **new Beeper (2025+, post-Texts.com merger, Automattic-owned)** connects most networks with **on-device protocol implementations** — messages go straight from your device to WhatsApp/Telegram/etc., never touching Beeper's servers. The older "Beeper Cloud" mode runs per-user bridge clusters on their infra.
- Beeper Desktop ships a **local API ("Beeper Connect"): REST + WebSocket + a built-in MCP server**. An agent on superlocal can already read and send chats across every network the founder connects — with zero new infrastructure. This is the fastest pilot path, but it drives *personal accounts* (ToS-grey, rate-limited, desktop must be running).
- **Recommendation (staged):**
  1. **Now:** keep the Qalarc Hub as primary WhatsApp/Signal transport; add a **Beeper Desktop API (MCP) transport** for instant reach into the founder's other group chats (Telegram, Discord, LinkedIn, X, Messenger…). Days of effort, $0.
  2. **Next:** promote **Matrix as the ONE bot transport layer** — run `@rwf/bot-core` as a Matrix client; per-platform reach becomes "which bridges are connected," not "which bot code we wrote." Slot it behind the existing `ChatTransport` interface.
  3. **Long-term:** official APIs for scale/compliance (WhatsApp Business Cloud API — already the plan; Telegram Bot API; Slack Bolt stays), bridges for the long tail (Signal, Google Messages, iMessage). **Never** build stranger-facing product on unofficial WhatsApp sessions.
- A minimal pilot needs no new servers and ~2–4 days: connect 1–2 networks in Beeper Desktop, drive them through the local MCP/REST API, post real battle updates to one real group chat.

---

## 1. What's actually installed on superlocal (read-only inspection)

| Item | Finding |
|---|---|
| Install | `~/Applications/Beeper.AppImage` (AppImage, launcher `~/.local/share/applications/beeper.desktop`, "All chats, one app — with local Desktop API + MCP") |
| Config/data | `~/.config/BeeperTexts/` (new "Beeper Texts" architecture — no legacy `~/.config/Beeper`) |
| Account | `@alexeib:beeper.com` on `https://matrix.beeper.com/` (from `account.db`, read-only) — a genuine Matrix identity with local olm/megolm E2E keys (`crypto_*` tables) |
| Local DBs | `account.db` = embedded **Matrix client SDK** store (sync, rooms, E2E, per-bridge state). `index.db` = message index (threads/participants/messages/reactions/FTS). As of 2026-08-29: 3 threads, 11 participants, **0 messages, no networks connected yet** — freshly installed. |
| Backend endpoints it talks to | `app-manifest-production.json`: `matrix.beeper.com`, `roomserv.beeper.com`, `sygnal.beeper.com` (push), `ai-services.beeper.com`, and per-user bridge clusters `https://{username}.users.{clusterId}.bridges.beeper.com` |
| Local API | **Beeper Connect** (log-verified): WebSocket at `/v1/ws`, REST `GET /v1/info`, `/v1/spec`, `/v1/chats`, and **`POST /v0/mcp` — a built-in MCP server** |

So the local picture is: **a Matrix-first client with an embedded SDK, plus a localhost agent API on top.**

---

## 2. Beeper's model (2026) — how it reaches other chats

```
                        ┌────────────────────────────────────────────┐
                        │            BEEPER DESKTOP/PHONE            │
                        │                                            │
   founder's human ───▶ │  unified inbox UI (all networks, one app)  │
                        │                                            │
                        │  ┌──────────────────────────────────────┐  │
                        │  │ MODE A: On-Device Connections (new)  │  │
                        │  │ WhatsApp/Telegram/Signal/... proto-  │  │
                        │  │ col sessions run INSIDE the app.     │  │
                        │  │ Messages never touch Beeper servers. │  │──▶ WhatsApp
                        │  │ E2E preserved where network allows.  │  │──▶ Telegram
                        │  └──────────────────────────────────────┘  │──▶ Signal, ...
                        │  ┌──────────────────────────────────────┐  │
                        │  │ MODE B: Beeper Cloud bridges (older) │  │
                        │  │ per-user bridge clusters run on      │  │
                        │  │ {user}.users.{id}.bridges.beeper.com │  │
                        │  │ zero-access-encrypted history        │  │
                        │  └──────────────────────────────────────┘  │
                        │                                            │
                        │  embedded Matrix SDK ⇄ matrix.beeper.com   │
                        │  (Beeper account = Matrix account)         │
                        └──────────────────┬─────────────────────────┘
                                           │ localhost (Beeper Connect)
                                           ▼
                        REST /v1/*  ·  WS /v1/ws  ·  MCP POST /v0/mcp
                                 (agents / SDKs: JS, Python, Go, PHP)
```

Key facts (from beeper.com FAQ + developers.beeper.com, fetched 2026-08-31):

- **Two connection modes.** On-Device (new default; direct device→network) vs Beeper Cloud (their servers bridge; encrypted at rest). Either way, from the user's chair it's "one inbox."
- **Every account is a Matrix account** — Beeper is built on Matrix and funds/upstreams to the Matrix.org Foundation.
- **All bridges are open source**: `mautrix/whatsapp`, `telegram`, `signal`, `discord`, `slack`, `meta` (FB/IG), `gmessages`, `gvoice`, `googlechat`, `twitter`, `bluesky`, `imessage`, `linkedin`, `heisenbridge` (IRC), `beeper/imessage` (Go). Common framework: `mautrix/go` **bridgev2**.
- **Self-hosting without your own homeserver:** `bbctl` (Beeper Bridge Manager) runs official bridges on *your* hardware against *your Beeper account* (`bbctl run sh-whatsapp`, bridge bot appears as `@sh-whatsappbot:beeper.local`). Self-hosted accounts are free and don't count against account limits. Third-party/custom bridges plug in via `bbctl register` + `bbctl proxy`.
- **Pricing:** free ≤5 connected accounts; **Beeper Plus $9.99/mo** (10 accounts, multi-account-per-network, scheduling, reminders); Plus Plus $49.99/mo unlimited.
- **Supported features:** send/receive, **group chats**, images/video, reactions, replies, threads, stickers, disappearing messages, broadcast channels — "feature availability varies by network." Video calls fall back to native apps.
- **Desktop API caveats (their words):** "personal use recommended"; "sending too many messages might result in account suspension by the networks"; requires Beeper Desktop running; local-only by default (a remote-access option exists).

### How a bridge actually authenticates to each network

A Matrix bridge logs into the *remote network with a session of the bridge operator's own account* (for on-device mode: the app holds that session locally):

| Network | Session mechanism | ToS posture | Group-chat quality |
|---|---|---|---|
| WhatsApp | QR-pair as a **linked device** of a personal account (whatsmeow) | **Unofficial client — ToS-grey; ban risk low but real**; NOT for business scale | Excellent (existing groups bridgeable) |
| Telegram | Either **official Bot API** in groups (sanctioned) or personal MTProto session | Bot API: clean; MTProto: grey | Bot API: good (needs admin/privacy-mode off); MTProto: full |
| Signal | Linked-device session (signal-cli style) | Grey (no official bot API) | Good (GV2 groups) |
| Discord / Slack | Official bot tokens / OAuth | Clean | Good (channels, threads) |
| Meta (FB/IG) | Unofficial session | Grey | Variable |
| iMessage | macOS-only (BlueBubbles-class) | Apple-hostile history | Good on Mac |
| Google Messages/Voice | Phone-paired session | Grey | Adequate |

**The WhatsApp row is the load-bearing caveat for RWF:** bridged WhatsApp = personal-account automation. Fine for founder + friends dogfooding; wrong foundation for paying strangers (that's what the WhatsApp Business Cloud API is for — already our stated production plan in `apps/bot-whatsapp/hub-client.ts`).

---

## 3. Where RWF is today (baseline)

```
                 ┌──────────────────────────────┐
                 │      @rwf/bot-core           │
                 │ CommandBus · MatchStore ·    │
                 │ cards · digest · AI hooks    │
                 └──────┬───────────────┬───────┘
                        │               │
             Slack transport      ChatTransport interface
             (Bolt Socket Mode,   (apps/bot-whatsapp/hub-client.ts)
              official)                       │
                     │            ┌────────────┴────────────┐
                     │            │ TODAY: QalarcHubClient  │
                     ▼            │ → Qalarc Hub :8769      │
               Slack workspace    │   (owns ONE Signal +    │
                                  │    WhatsApp session)    │
                                  │   → founder's phone     │
                                  └────────────┬────────────┘
                                               │ planned
                                               ▼
                                  WhatsApp Business Cloud API
                                  (official, per-convo pricing)
```

Properties: one bot core, N hand-written transports; each new platform = new bot code + new session management; Signal has no official API; WhatsApp on a personal session is already ToS-grey *today* via the Hub.

---

## 4. The three options for RWF

### Option A — Bot via Beeper Desktop API (MCP / localhost REST)

```
@rwf/bot-core (or qalcode agent) ──HTTP──▶ Beeper Connect (localhost)
                                              │
                                     whatever the founder has
                                     connected in Beeper Desktop
                                              │
                        WhatsApp · Telegram · Signal · Discord · Slack ·
                        Messenger · LinkedIn · X · Google Messages · ...
```

- **Effort:** days. **Cost:** $0 (within free tier). **Infra:** none — rides the installed desktop app.
- **Reach:** every network *the founder personally* connects; group chats included.
- **Risks:** personal-account automation (Beeper itself warns about suspension); desktop app must stay running on superlocal; local-only by default; no story for other users' chats.

### Option B — RWF bot as a Matrix user on beeper.com (+ managed / bbctl bridges)

```
┌─────────────┐   Matrix    ┌────────────────────────┐
│ @rwf:beeper │ ⇄ rooms ⇄  │ matrix.beeper.com      │
│  .com       │            │ (their homeserver)     │
└─────────────┘            └──────────┬─────────────┘
       ▲  bot-core as Matrix client    │ per-user bridge clusters
       │  (one room per battle)        ▼
  founder uses ANY        ┌──────────────────────────────┐
  Matrix client / Beeper  │ bridges: WhatsApp · Telegram │
  as the human UI         │ Signal · Discord · Slack ... │
                         │ (Beeper-managed, or bbctl    │
                         │  self-hosted on our metal)   │
                         └──────────────────────────────┘
```

- **Effort:** 1–2 weeks. **Cost:** $0 now; $9.99/mo if we exceed 5 accounts. **Infra:** none (bridges managed) or one small host (bbctl).
- **Reach:** group chats on all bridged networks, from ONE bot codebase; humans can participate from Beeper itself or any Matrix client.
- **Risks:** our bot lives on *their* homeserver (account policy, availability); bridge sessions still ride personal accounts (same WhatsApp caveat); bridge quality varies per network.

### Option C — Fully self-hosted Matrix (our homeserver + mautrix bridges)

```
┌─────────────┐        ┌─────────────────────────────────┐
│ @rwf:rwf.   │ ⇄ appservice / client API               │
│  qalarc.com │        │ OUR homeserver                  │
└─────────────┘        │ Synapse (ref) · Tuwunel ·       │
       ▲               │ Continuwuity (Rust; conduwuit   │
       │ bot-core      │ is now OBSOLETE)                │
       │               └───────┬─────────────────────────┘
  same human story             │ mautrix bridgev2 stack
                               ▼ (docker/systemd, ours to run)
                    whatsapp · telegram · signal · slack · discord
```

- **Effort:** 2–4 weeks + ongoing ops. **Cost:** $5–10/mo VPS or $0 on minirig. **Infra:** homeserver + N bridges + backups.
- **Reach:** same as B, minus dependence on Beeper; we can also offer *users* Matrix accounts/rooms later.
- **Risks:** most maintenance of the three; E2E + bridge ops have real gotchas (key backup, verified devices, media repos).

---

## 5. Comparison

| Dimension | A: Desktop API | B: Beeper-hosted Matrix | C: Self-hosted Matrix | Today: per-platform bots |
|---|---|---|---|---|
| Time to first message | **hours–days** | 1–2 weeks | 2–4 weeks | ✅ already live (WA/Slack) |
| Monthly cost | $0 | $0–10 | $0–10 | $0 (Hub) + Cloud API later |
| New-platform cost | founder clicks "connect" | add a bridge | deploy a bridge | **write a new bot** |
| Group-chat reach | founder's own groups | bridged groups, all platforms | bridged groups, all platforms | per-platform, manual |
| WhatsApp ToS risk | personal (grey) | personal (grey) | personal (grey) | personal via Hub (grey today) |
| Compliance path for scale | ✗ | partial | partial | **✓ Cloud API planned** |
| Blast radius if it breaks | founder's desktop | Beeper infra | our infra | per-bot |
| One bot core for everything | ✗ (it's a transport) | **✓** | **✓** | ✗ (N transports, shared core) |
| Human can use same network natively | ✓ Beeper | ✓ Beeper/Element | ✓ any Matrix client | n/a |

---

## 6. Recommendation

**Adopt Matrix as RWF's canonical bot transport layer — incrementally, on Beeper's rails first, our rails later.**

1. **This week (Option A, dogfood):** add a `BeeperDesktopTransport implements ChatTransport` (and/or an MCP tool for agents) that talks to Beeper Connect on localhost. Instant multi-platform reach for founder-scale tests. Keep the Qalarc Hub for Signal/WhatsApp production dogfood — don't rip out what works. Tag agent traffic `source:"ai"` per house convention. Rate-limit sends (their warning is explicit).
2. **Next milestone (Option B):** stand up the bot as a Matrix user (`@rwf:beeper.com` or a second account), one Matrix room per battle, bridges as transports. `bot-core` stops caring *which* platform a group chat lives on. Use `bbctl` self-hosting for the noisy/bridge-heavy networks so they run on our metal, free.
3. **Production (keep the plan):** WhatsApp Business Cloud API for customer traffic; Telegram via official Bot API; Slack stays on Bolt. **Bridges (self-hosted or Beeper) are for founder/friends/community groups, not paying strangers.**
4. **Later (Option C):** self-host a homeserver (Tuwunel or Continuwuity — conduwuit is obsolete; Synapse if we want reference-grade) only when we need rooms for *users*, federation, or Beeper-independence. Don't pay that ops tax before it buys something.

Why this shape: our codebase already abstracts transports (`ChatTransport`); Matrix is the only model where "add platform" ≈ "connect bridge" instead of "write a bot," and Beeper gives us the whole bridge stack, managed or self-hosted, open source, for free — while we keep the official-API path for scale.

---

## 7. Minimal pilot (concrete)

**Goal:** a real RWF battle update lands in a real non-WhatsApp group chat with zero new servers.

1. Founder connects 1–2 networks in Beeper Desktop (e.g. Telegram + one group).
2. Agent side: `GET /v1/chats` → find the group; `POST /v1/messages/send`-equivalent via the Desktop API (or just use the MCP server) → post "Sunday Showdown is LIVE — log your reps" + a card image.
3. Read replies through `/v1/chats` polling or the WS endpoint; feed into the existing `CommandBus`.
4. Success criteria: message delivered + rendered in the native app; reply read back; no account warnings; end-to-end < 5 s.
5. Explicit non-goals: no customer traffic, no volume, no automation of strangers' chats.

**Risk notes:** personal-account rate limits; keep Beeper Desktop running (autostart exists); if a network balks, fall back to Hub/official APIs for that platform.

---

## Appendix — evidence & sources

- Local: `~/.config/BeeperTexts/` (account.db = Matrix SDK store incl. `crypto_olm_session`, `mx_registrations`; `app-manifest-production.json`; `logs/desktop-api/desktop-api-0.log` shows `/v1/ws`, `/v1/chats`, `POST /v0/mcp`).
- beeper.com FAQ (connection modes, pricing, features, Matrix stance) · developers.beeper.com `/bridges`, `/bridges/self-hosting` (bbctl, bridge table, repos), `/desktop-api` (REST/WS/MCP/SDKs, personal-use warning).
- matrix.org `/ecosystem/servers` (Synapse stable; Tuwunel & Continuwuity stable; Conduit/Dendrite beta; **conduwuit obsolete**).
- Repo: `apps/bot-whatsapp/hub-client.ts` (ChatTransport + Cloud-API plan), `apps/bot-slack/main.ts` (Bolt + CommandBus), `docs/03_CHAT_INTEGRATIONS.md`.
