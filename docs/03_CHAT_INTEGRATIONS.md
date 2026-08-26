# Chat Integration Architecture — Slack + WhatsApp

*26 Aug 2026*

The core distribution thesis: **the chat is the arena, the app is the
scoreboard.** Both adapters must be thin translations into one shared command
bus so new platforms (Messenger) are one adapter away.

---

## 1. Shared bot command surface (platform-agnostic)

| Command | Effect |
|---|---|
| `/rwf new` | Create a match in this chat (interactive: pick exercises, target, day) |
| `/rwf join` | Join the active match |
| `/rwf log <exercise> <reps>` | Log reps (triggers verification flow if flagged) |
| `/rwf standings` | Current handicapped standings card |
| `/rwf taunt @user <msg>` | Registered taunt (rate-limited, logged for the banter feed) |
| `/rwf result` | Final card: winner, effort scores, charity pot destination |
| `/rwf profile` | Deep-link to web profile |

**Broadcast discipline (cost control):** standings are batched (e.g. on
milestone reps or hourly), never per-rep. Every broadcast card ends with a
join link — that's the viral loop.

---

## 2. WhatsApp

### Dev/dogfood: Qalarc Hub (already built — our unfair advantage)
- Local HTTP API on `127.0.0.1:8769` (`POST /send`, health at `/health`).
- Owns the single Signal + WhatsApp session. A working RWF WhatsApp bot is
  **days away**, not months — no Meta approval needed to start dogfooding in
  our own group chats.
- Connector stub: `apps/bot-whatsapp/hub-client.ts`.
- Inbound: poll/webhook from the Hub → command bus. (If the Hub lacks
  webhooks, add them upstream — it's our codebase.)

### Production: WhatsApp Business Platform (Cloud API)
- Official path for scale. Requires: Meta business verification, phone number,
  app review for `whatsapp_business_messaging`.
- **Cost model (must model before scale):** per-conversation pricing; a chatty
  bot across many groups is real money. Mitigations: batched standings,
  template messages for re-engagement, user-initiated conversations only.
- Migration path: same adapter interface, swap `HubClient` for `CloudApiClient`.

## 3. Slack (Bolt.js — `apps/bot-slack/`)

- **First-class from day one** because corporate mode is the revenue engine.
- Slash commands (`/rwf ...`) + Block Kit interactive messages (exercise
  pickers, join buttons, standings cards with progress bars).
- OAuth2 install flow → org-level app directory listing later.
- Events API → same command bus as WhatsApp adapter.
- Enterprise-ready posture early: audit logs, admin analytics hooks.

## 4. Messenger (Phase 4) & Apple Messages

- Messenger: Send API + webhooks, same adapter pattern. Straightforward.
- Apple Messages: **no official bot API.** Out of scope for MVP — say so
  plainly to Ben (he already suspects this).

## 5. Verification flow inside chat

1. User logs reps via command or web link.
2. If unverified and match has verification on → bot replies with a one-tap
   link to the in-browser pose counter (MoveNet) pre-loaded with the exercise.
3. Counter returns signed result (reps + duration + optional HR sample) →
   game-core scores it.
4. Chat gets the batched standings update.

No video ever leaves the device. Privacy line for corporate sales: *"we never
see your camera."*
