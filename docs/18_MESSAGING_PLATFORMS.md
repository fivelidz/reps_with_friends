# 18 — Messaging Platforms: WhatsApp Business (official path) + multi-platform chat libraries

*Research date: 2026-08-27. Supersedes the `[VERIFY]` items in docs/08 §4 and the
production note in docs/14. Meta's own developer docs (developers.facebook.com)
block server-side fetching, so official pages are cited by URL but were read via
search-cache snippets + reliable secondaries (Twilio, SendPulse, BSP guides,
Unipile's endpoint-level breakdown verified against Meta docs Aug 2026). Anything
not nailed down carries `[VERIFY]`.*

---

# TOPIC 1 — WhatsApp Business for BOT accounts

## 1.1 Business App vs Business Platform (Cloud API) — which one has bots

Two different products with confusingly similar names:

| | WhatsApp **Business App** | WhatsApp **Business Platform** (Cloud API) |
|---|---|---|
| What it is | Free phone app (Android/iOS/Web) for solo traders | Meta-hosted REST API + webhooks on the Graph API |
| Bots | ❌ None. Quick replies & greeting messages only — no API, no automation hook | ✅ Full programmatic send/receive; this is THE bot rail |
| Scale | 1 user, broadcast lists ≤ 256 contacts | ~500 msg/s throughput, unlimited opt-in audience |
| Groups | Consumer-style groups (manual, in-app only) | Groups API (see §1.3) — programmatic, capped |
| Cost | Free | Per-message billing (§1.4) |
| Verification | None | Meta Business verification + display-name approval |

Sources: https://whatsappbusiness.com/products/business-platform/ (official Meta
property); https://www.messagecentral.com/blog/whatsapp-business-api-complete-guide
(App-vs-API table, 2026-04); https://kudosity.com/resources/articles/whatsapp-business-pricing
(AU-focused comparison, updated 2026-06-25).

**Also dead:** the self-hosted On-Premise API was shut down **23 Oct 2025** —
Cloud API is the only official integration path in 2026
(https://www.messagecentral.com/blog/whatsapp-business-api-complete-guide,
https://singhamandeep.com/whatsapp-cloud-api-setup-2026/).

**Verdict for RWF:** bots = Cloud API, no question. The Business App is irrelevant
to us except as a migration source (a number registered on the Business App CAN
be migrated to the API; a number on consumer WhatsApp cannot — see §1.2).

## 1.2 Cloud API bot-account setup in 2026

The sequence (all steps required before first production message):

1. **Meta Business portfolio** (Business Manager) for qalarc + **business
   verification** — ABN/ACN + company documents. 1–3 business days per
   MessageCentral (2026-04); docs/08 budgeted 1–7 days. Free.
2. **Create a Meta app** (type: Business) → add the **WhatsApp** product →
   you get a temporary access token + test number immediately.
3. **Dedicated phone number.** Rules (Meta:
   https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers/
   and .../registration/, read via cache, 2026-05/06):
   - Must be able to receive an **SMS or voice call** for the one-time
     verification code (mobile or landline both OK).
   - Must **not** be actively registered on consumer WhatsApp. Numbers on the
     WhatsApp **Business App** CAN be migrated (with a pin / two-step flow).
   - **Fresh AU number: yes, perfectly fine** — a new AU prepaid mobile SIM
     (Telstra/Optus/Vodafone) is the *safest* option: carrier line-type lookups
     return "mobile", which passes Meta's screening
     (https://voidmob.com/blog/whatsapp-business-verification-non-voip-numbers-2026).
   - **VoIP: avoid.** The Business *App* no longer verifies VoIP numbers at all;
     some BSPs can still onboard VoIP numbers through the API, but it's the
     flakiest category and risks registration rejection
     (https://www.dataphone.cloud/docs/%E2%9D%8C-whatsapp-business-no-longer-supports-voip-numbers/)
     `[VERIFY current Cloud-API-direct behaviour with VoIP]`.
   - Note the 2026 flow change: numbers are now registered **via the API only**,
     not through WhatsApp Manager ("You can only register a number via the API" —
     Meta docs, 2026-06-26 snippet).
4. **Display name** — must have a clear relationship to the business name
   ("Reps With Friends" under the qalarc business `[VERIFY exact matching rule —
   Meta's display-name policy page is behind the block]`). Approval is usually
   minutes-to-hours; mismatched names are the #1 rejection cause.
5. **App review** for `whatsapp_business_messaging` (+ `whatsapp_business_management`)
   permissions + **webhook configuration** (callback URL, verify token, subscribe
   to the `messages` field).
6. **Payment method on file** — per-message billing. ⚠️ From **30 Sep 2026** Meta
   requires a payment method even for accounts that until now only sent free
   service messages; without it, **service-message delivery stops on 1 Oct 2026**
   (Meta pricing-docs snippet, 2026-08-25:
   https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/).

**Messaging limits / tiers** (business-initiated messages to *unique* recipients
per rolling 24h):

| Tier | Limit | How you get there |
|---|---|---|
| 0 | 250 | Default (unverified) |
| 1 | 1,000 | Business verified |
| 2 | 10,000 | Verified + quality rating held while sending near your current cap |
| 3 | 100,000 | Same, at scale |
| — | Unlimited | Ongoing high quality + volume |

Graduation is automatic on quality rating + volume; poor quality (blocks,
"spam" reports) downgrades you. 2026 note: limits are moving to
**portfolio level** — the old `messaging_limit_tier` field is deprecated in
favour of `whatsapp_business_manager_messaging_limit`
(https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits/;
tier table cross-checked at https://wa.expert/pages/whatsapp-messaging-limits-guide.html
and https://www.conferbot.com/limits/whatsapp). Inbound (user-initiated) messages
are NOT limited by tiers — only business-initiated sends are.

## 1.3 ⚠️ GROUPS — the answer to docs/08's biggest unknown

**The Cloud API now HAS a Groups API, and it's live — but it is not the feature
we assumed.** Status as of Aug 2026:

- **GA-ish, gated on Official Business Account (OBA) status**: "The Groups API
  is now open to all businesses with an Official Business Account (OBA)" —
  Meta docs page dated 2026-06-16
  (https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/).
  It left beta during 2025–26 (Sanuker's writeup is dated 2025-10; the
  open-to-all-OBAs note is 2026-06). OBA = the green-tick verified tier;
  business verification is a prerequisite `[VERIFY whether every verified
  business gets OBA automatically or needs separate green-tick approval — this
  is now a load-bearing detail]`.
- **The business CREATES the group.** 12 new endpoints
  (`POST/GET /{PHONE_NUMBER_ID}/groups`, group CRUD, invite-link get/reset,
  join-request list/approve/reject, `DELETE /participants`, and sending via the
  normal `/messages` endpoint with `recipient_type: "group"`). Graph API **v21.0+**
  (Unipile's examples; current Graph version is higher — `[VERIFY latest vN]`).
- **8 participants max per group** — and the business number itself takes one
  slot, so **7 humans + the bot**. Up to 10,000 groups per number; only one
  Cloud API business per group. (imBee: https://www.imbee.io/resource/whatsapp-groups-api-business-guide-2026;
  Unipile: https://www.unipile.com/whatsapp-group-api/ — endpoint table verified
  against Meta's docs, Aug 2026.)
- **There is NO add-participant endpoint.** People join exclusively via the
  group's **invite link** → the business **approves the join request** via API.
  You can remove participants but not add them.
- **A business cannot join an existing consumer group.** The API only sees
  groups the business number created. This is the critical product fact.
- **Not supported inside groups:** interactive messages (buttons/lists!),
  authentication templates, disappearing messages, view-once media, calls,
  editing/deleting sent messages, per-template analytics. Text, media and
  template messages only.
- **4 new webhook fields** (each a separate subscription):
  `group_lifecycle_update`, `group_participants_update`, `group_settings_update`,
  `group_status_update` (https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/get-started).
- **Billing:** per message, identical to 1:1 rates — no group discount
  (Unipile, Aug 2026).
- Excluded: numbers on the Business App, and numbers in "Multi-solution
  Conversations" (shared across multiple BSPs).

**What this means for RWF's architecture (docs/14's "ADD the bot to the group"
step):**

| | Old assumption (docs/08 §4.3) | Reality (Aug 2026) |
|---|---|---|
| Bot joins crew's existing group | ❌ impossible on Cloud API | Still only possible via whatsmeow (unofficial) |
| Bot creates + owns the group | — | ✅ the ONLY official path; ≤ 7 humans + bot |
| Players join | captain adds them | tap invite link → bot approves join request |
| Interactive buttons in group | assumed yes | ❌ text/media/templates only |
| Crew size fit | any | ✅ our 6-player crews fit (7 humans max) |

So the official-rail product shape inverts: instead of "bot enters the group
the crew already uses", it becomes "**the crew's game group IS a bot-created
group** (invite link from `/connect`, QR-able), while the crew's original human
group stays untouched for banter." The crew-code primitive survives unchanged;
only the ADD step's direction flips. The 8-cap fits our 6-player format but
kills any "big gym league group" idea on the official rail.

## 1.4 Pricing 2026 (AU) — and the October 2026 bombshell

**Current model (since 1 Jul 2025, all markets): per-message, charged on
delivery** — the per-conversation model is gone. Four categories: marketing,
utility, authentication, service. Rates vary by *recipient-country × category*
(Meta bills the recipient's number country, not the sender's — an AU crew
member keeping their UK number is billed at UK rates:
https://kudosity.com/resources/articles/whatsapp-business-pricing).

Official summary (https://whatsappbusiness.com/products/platform-pricing/):
- **Service messages (free-form replies in the 24h customer-service window):
  FREE — until 30 Sep 2026.**
- **Utility templates sent inside the 24h window: FREE — until 30 Sep 2026.**
- Marketing / utility / authentication templates outside the window: paid per
  delivered message; **volume tiers** discount utility + authentication as
  volume grows.
- **Free entry points:** conversations started from a Click-to-WhatsApp ad or
  Facebook Page CTA button → **72 hours of free messages of any category**.

**⚠️ From 1 October 2026 (5 weeks after this research):**
- **Service messages become billable per message**, priced the same as
  utility/authentication templates for the recipient's country.
- In-window utility templates also become billable.
- Meta Business Agent (Meta's built-in AI — not us) moved to token billing
  ($2.00/M tokens ≈ 4–5¢/reply) on 1 Aug 2026.
- Final country rates were due to be published by **1 Sep 2026** — check them
  the week the pilot starts.

Sources: Meta pricing docs
(https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/
and .../pricing/non-template-messages/, snippets 2026-08-25); Twilio customer
notice (https://help.twilio.com/articles/53100462475931-Notice-Changes-to-WhatsApp-s-Pricing-October-2026);
SendPulse deep-dive with the before/after table
(https://sendpulse.com/blog/whatsapp-service-message-pricing, 2026-08-10);
Conferbot ("billable at utility rates",
https://www.conferbot.com/blog/whatsapp-service-message-billing-october-2026);
Superchat (DE service rate €0.0456,
https://help.superchat.com/en/articles/769350).

**Rate anchors (utility/authentication ≈ future service rate), per delivered
message:** US $0.0064 · UK $0.0264 · Germany ~€0.046 · Brazil $0.0098 · Mexico
$0.0115 · India $0.0024 (SendPulse, Aug 2026). **Australia: `[VERIFY]`** —
Meta's rate card is a JS widget on the official page and no secondary publishes
a current AUD figure; AU has historically sat between the US and UK bands, so
**AUD 0.01–0.05 per utility/service message** is the planning range (docs/08's
AUD 0.03–0.10 placeholder stays defensible). Marketing runs ~2–4× utility.

**Impact on docs/08 §4.5's cost model — the sensitivity case FIRES:**
docs/08's "service is free" assumption was load-bearing and it expires
1 Oct 2026. Re-running the pilot row (10 groups, 60 players, ~15 bot
messages/player-week) at AUD 0.03/service message ≈ **AUD 27/week ≈ AUD
115/month** (vs ~AUD 13/month in the old table, vs ~AUD 310 in the worst case).
Not fatal — but bot verbosity is now a cost line. Mitigations that matter from
day 1: batch replies into single messages (4,096-char bodies), strip
acknowledgement chatter, prefer buttons/Flows over multi-turn text (though note:
buttons are interactive messages = 1:1 only, not in groups).

## 1.5 BSPs (Twilio / 360dialog / Vonage) vs direct Cloud API

| | Direct Cloud API | BSP (Twilio, 360dialog, Vonage, MessageCentral…) |
|---|---|---|
| Meta message charges | Pay Meta directly (card on file) | Passed through (verify pass-through vs markup) |
| Platform fee | **$0** | Twilio ~US$0.005/msg on top `[VERIFY current]`; 360dialog flat monthly ~€49+ `[VERIFY]`; others per-seat/subscription |
| You build | Webhooks, token refresh, template lifecycle, media handling, retry/compliance tooling | They give you a dashboard, inbox, flows, sometimes a visual bot builder |
| Time to first message | Days (it's a simple REST API; we already have the adapter pattern in bot-core) | Hours (embedded signup) |
| Flexibility | Full (Groups API, newest features at Graph-API release cadence) | BSPs lag new features — several still advertise "no group support" even though Meta's Groups API is live (Unipile FAQ, Aug 2026) |
| Multi-solution Conversations | n/a | Numbers shared across BSPs are excluded from the Groups API |

Sources: https://www.messagecentral.com/blog/whatsapp-business-api-complete-guide
("Direct Cloud API without a BSP typically takes 2–6 weeks of engineering" —
pessimistic for us; our bot-core adapter is ~a day of work);
https://payperwa.com/blog/whatsapp-business-api-pricing-australia-2026
(flat-fee vs subscription models); https://www.unipile.com/whatsapp-group-api/
(BSP lag on groups).

**Verdict for a startup with our shape (own bot framework, engineers on hand,
cost-sensitive, needs Groups API): DIRECT.** BSP fees buy UIs and inboxes we
don't need, and BSP lag is actively dangerous for a groups-dependent product.
Revisit only if we ever want a human-agent inbox for customer support.

## 1.6 Practical verdict — signup sequence for "Reps With Friends" under qalarc

Elapsed time ≈ **1–2 weeks** (mostly waiting on verification); cash cost ≈
**AUD 30 (SIM) + AUD 10–30/month messaging pre-Oct, ~AUD 100–150/month at pilot
scale post-Oct** `[VERIFY against the Sep-1 rate card]`.

1. **Meta Business portfolio for qalarc** (business.facebook.com) → submit
   business verification with ABN + company docs. *Start this first; it gates
   everything.* (1–3 days, free.)
2. **Buy a fresh AU prepaid SIM** (Telstra/Optus/Vodafone — carrier "mobile"
   line type). Do NOT reuse the whatsmeow prototype number (+61 493 484 788) —
   docs/08 §4.1 keeps it disposable by design, and migrating it would kill the
   Hub rail we still prototype on.
3. **Create Meta app** (Business type) → add WhatsApp product → Cloud API.
4. **Register the number via the API** (2026 flow — not via WhatsApp Manager),
   receive the OTP by SMS/voice, set **display name "Reps With Friends"**
   `[VERIFY naming rule vs "qalarc"]`, complete profile (logo, category,
   qalarc website).
5. **Webhooks** → point at our existing API (apps/api or the Cloudflare
   function), subscribe to `messages` (+ the 4 group fields when we do groups).
6. **App review** for `whatsapp_business_messaging` permissions.
7. **Payment method on file** — mandatory before 30 Sep 2026 anyway.
8. **Templates**: submit the small set we need outside 24h windows
   (re-engagement nudge = utility; weekly digest = marketing).
9. **Apply for OBA / green tick** — required for the Groups API
   `[VERIFY process + approval odds for a small verified AU business]`.
10. **Pilot architecture** (see §2 of the action list at the end): DM-first on
    the official rail; keep whatsmeow for friends-only existing groups until
    the Groups API flow is built and OBA lands.

---

# TOPIC 2 — npm "chat" packages / Vercel, and multi-platform messaging

## 2.1 The Vercel clarification — three different things, honestly separated

The question conflated two (actually three) separate Vercel projects:

1. **AI SDK — npm `ai` + `@ai-sdk/*`** (23.1M downloads/week). This is an
   **LLM application toolkit, NOT a messaging-platform connector**. It
   standardises calls to model providers (OpenAI, Anthropic, Google, xAI…):
   `generateText`, structured output, tool calling, streaming, agents, and
   React `useChat` hooks for building chat *UIs in your own web app*. It will
   never post to WhatsApp or Slack. (https://ai-sdk.dev/docs/introduction)
   *We already use this pattern — apps/web/src/ai.ts is our own thin version.*
2. **Chat SDK — npm `chat` + `@chat-adapter/*`** (2.46M downloads/week for
   `chat`). **This is what the user heard about, and it's real**: a Vercel
   project (github.com/vercel/chat; maintainers include Vercel's CTO Malte Ubl
   "cramforce" and the vercel-release-bot) described as *"universal TypeScript
   toolkit for building multi-platform chat bots and AI agents on Slack, Teams,
   Google Chat, Discord, WhatsApp, and more"*. Docs: https://chat-sdk.dev/docs.
3. (For completeness: Vercel also markets a "Chat SDK" *starter template* for
   Next.js chatbots — that's just #1 + a UI. Ignore.)

So: **the user's recollection was correct** — `chat` from Vercel does connect
one codebase to many messaging systems. It is *not* the AI SDK, and the AI SDK
does *not* do this.

## 2.2 Chat SDK (`chat`) — what it actually is

Architecture: a `Chat` class + per-platform **adapters** + pluggable **state**
(Redis/Postgres/memory). Event-driven handlers (`onNewMention`,
`onNewMessage`, `onAction`…), thread subscriptions for multi-turn
conversations, JSX cards that render natively per platform, AI-streaming
support, serverless-ready with message dedup. Official (Vercel-maintained)
adapters, from npm:

| Adapter | Platform | Notes |
|---|---|---|
| `@chat-adapter/slack` | Slack | webhooks, Block Kit, OAuth, slash commands |
| `@chat-adapter/teams` | MS Teams | **Bot Framework webhooks**, Adaptive Cards |
| `@chat-adapter/gchat` | Google Chat | service-account auth, Card v2 |
| `@chat-adapter/discord` | Discord | interactions, Gateway, slash commands |
| `@chat-adapter/telegram` | Telegram | Bot API webhooks, inline keyboards |
| `@chat-adapter/whatsapp` | **WhatsApp Business Cloud** | official Cloud API (Graph v21.0 default), interactive messages, `sendTemplate`, typing/read receipts |
| `@chat-adapter/messenger` | Facebook Messenger | Send API |
| `@chat-adapter/x` | X/Twitter | mentions, DMs |
| `@chat-adapter/github`, `@chat-adapter/linear` | dev tools | PR/issue mentions |
| `@chat-adapter/twilio` | SMS/MMS | Messaging webhooks |
| `@chat-adapter/web` | browser chat UI | speaks the AI SDK `useChat` stream protocol |

(https://chat-sdk.dev/docs, https://chat-sdk.dev/docs/platform-adapters,
https://chat-sdk.dev/adapters/official/whatsapp; npm registry, 2026-08-27.)

**WhatsApp adapter specifics** (matters for us): it's the *official* Cloud API
— env creds (`WHATSAPP_ACCESS_TOKEN` etc.), webhook signature verification,
template sends outside the 24h window, cards→interactive-messages conversion,
4096-char auto-chunking, media uploads. It is a **1:1 DM model** — no Groups
API surface documented in the adapter `[VERIFY — groups would need raw Graph
calls alongside the adapter]`.

**Maturity caution:** v4.38.x, fast-moving; the subclassing/extension surface
is explicitly "not yet considered fully stable"; state adapters want Redis/PG
for production. Young, but Vercel-backed and heavily used.

## 2.3 The rest of the multi-platform landscape

Weekly downloads (npm, 2026-08-27) and honest one-liners:

- **grammY** (4.2M/wk) — the Telegram bot framework. Excellent, official Bot
  API, plugin ecosystem. Telegram-only. If we add Telegram, this is the pick.
- **Telegraf** (786K/wk) — the older Telegram framework. Fine, but grammY is
  its modern successor.
- **whatsapp-web.js** (115K/wk) / **Baileys** (`@whiskeysockets/baileys`,
  452K/wk) — *unofficial* WhatsApp-Web-protocol libraries. Same ToS/ban-risk
  category as our whatsmeow Hub rail. Groups work great — that's exactly why
  the unofficial ecosystem exists. Never the production rail (docs/08 §4.1).
- **@slack/bolt** (3.6M/wk) — what our Slack rail already uses. Keep.
- **botbuilder** (410K/wk) — Microsoft Bot Framework SDK. The *official* deep
  Teams path (Azure Bot registration + channels for Slack/WhatsApp/etc).
  Heavy, Azure-flavoured, callback-oriented; its Teams channel is the same
  Bot-Framework webhook layer that `@chat-adapter/teams` wraps more lightly.
- **Botpress / Typebot** — hosted no-code bot-builder *platforms* (their npm
  counts are nominal: 478/wk, 11/wk). Wrong shape for us: they want to own the
  brain; we have a game engine.
- **matterbridge** (26K/wk) — Go bridge *daemon* relaying messages between
  60+ protocols (Slack, Discord, Telegram, Matrix, MS Teams via hooks,
  Mattermost, IRC/XMPP…). Not a bot framework: no command handling, no game
  logic, no per-user identity — it's user-to-user message relay with formatting
  loss and another long-running service. WhatsApp support exists `[VERIFY
  which rail — historically whatsmeow-based]`. Good for personal
  experiments; poor fit for a production game bot.
- **n8n** (133K/wk) — workflow automation with messaging nodes. Orchestration
  shape, not real-time-in-chat shape. No.
- **Literal `npm search chat` top hits worth noting:** `stream-chat` (Stream's
  hosted chat backend SDK — in-app chat UI, not platform bots), `@ably/chat`
  (same idea on Ably), `@twurple/chat` (Twitch), `@googleapis/chat` (Google
  Chat API client), `@scalar/agent-chat` (docs-site AI widget). None are
  multi-platform bot frameworks — the only such package in the top hits is
  Vercel's `chat`.

## 2.4 Fit with our architecture (thin adapters over one command bus)

packages/bot-core's design — platform adapters normalise inbound messages onto
one command bus, game logic never knows the platform — is the *same shape* as
Chat SDK's Chat/adapters split. Options:

1. **Keep bot-core, ignore Chat SDK.** Cost: we hand-write each new adapter
   (Slack done, WhatsApp-Cloud ~1 day, Teams ~2–3 days via Bot Framework).
   Benefit: zero new deps, our group-grammar (crew codes, `link KX4T9C`)
   stays centre-stage.
2. **Adopt Chat SDK as the transport layer, keep our command bus as the brain.**
   Register adapters, translate their normalized `Message` events into our bus
   commands, keep game-core untouched. Benefit: Teams/Messenger/GChat/Discord
   reach for ~free, battle-tested webhook verification, cards. Cost: young SDK,
   Vercel-flavoured deployment assumptions, Redis/PG state dep, and its
   WhatsApp adapter is DM-only (groups still need our own Graph calls).
3. **Hybrid (recommended):** keep the two working rails (bolt for Slack, Hub
   for prototype WhatsApp) and use `@chat-adapter/teams` (or raw Bot
   Framework) *only* when a corporate pilot actually demands Teams. Don't
   migrate working code to a 4.x SDK preemptively.

**Bot Framework vs matterbridge for Teams/Messenger reach, specifically:**
Bot Framework (directly or via `@chat-adapter/teams`) is the only *official*
Teams bot path and gives real interactive cards — it's the right answer if
corporate-wellness (docs/08 §5) lands. matterbridge would technically get
Teams messages relayed into an existing bot channel, but as a dumb pipe with
identity/formatting loss — fine for a hack weekend, not for a product.

## 2.5 Verdict table

| Platform | Best library | Official API? | Risk | Fit with bot-core |
|---|---|---|---|---|
| Slack | **@slack/bolt** (incumbent) — or `@chat-adapter/slack` | ✅ | Low | ✅ already built |
| WhatsApp (production) | **Direct Cloud API** (own adapter; `@chat-adapter/whatsapp` as reference/shortcut) | ✅ | Low (policy: templates, quality rating) | ✅ adapter pattern ready; groups need extra Graph calls |
| WhatsApp (prototype) | whatsmeow via Qalarc Hub (Baileys/whatsapp-web.js = same class) | ❌ unofficial | **Number ban** — friends-only, disposable number | ✅ current rail |
| MS Teams | **`@chat-adapter/teams`** (light) or botbuilder (deep) | ✅ (Bot Framework) | Low-Med (Azure tenant admin install) | ➕ add when corporate pilots demand |
| Telegram | **grammY** | ✅ | Low | ➕ cheap future add |
| Messenger | `@chat-adapter/messenger` | ✅ | Low-Med (Meta app review) | ➕ optional |
| Google Chat | `@chat-adapter/gchat` | ✅ | Low | ➕ optional (Workspace orgs) |
| Discord | `@chat-adapter/discord` or discord.js | ✅ | Low | ➕ optional |
| SMS | `@chat-adapter/twilio` | ✅ | Low (per-msg cost) | ➕ fallback channel |
| Everything-at-once hack | matterbridge | Mixed | Med-High (relay lossiness) | ❌ not for production |
| No-code platforms | Botpress / Typebot / n8n | n/a | Lock-in | ❌ wrong shape |

---

# What to do for qalarc's RWF bot — action sequence

1. **This week (free, starts the clock):** create the qalarc Meta Business
   portfolio and submit business verification (ABN docs). Everything official
   is gated on it. (1–3 days.)
2. **Buy a fresh AU prepaid SIM** for the production bot number. Never let the
   whatsmeow prototype number near production.
3. **Direct Cloud API, no BSP**: Meta app → WhatsApp product → register number
   via API → display name "Reps With Friends" → webhooks to our existing API →
   app review → payment method (mandatory by 30 Sep 2026 regardless).
4. **Write the Cloud API adapter in bot-core** (1–2 days; the API is plain
   REST + one webhook). Use `@chat-adapter/whatsapp`'s documented behaviour as
   the reference for interactive-message/template edge cases.
5. **Pilot DM-first** (docs/14's fallback pattern): bot DMs each player;
   existing human group stays the social surface; whatsmeow rail remains for
   friends-only existing-group play. This is now *confirmed* as the only
   compliant shape for "bot in the crew's own group".
6. **Apply for OBA (green tick)** after verification; once approved, prototype
   the **Groups API flow**: bot creates the crew group on `link <CODE>`,
   `/connect` shows the group invite link + QR, bot approves join requests.
   Crews ≤ 7 humans fit the cap. Update docs/14's ADD step to the inverted
   flow when this ships.
7. **Budget re-check 1 Sep 2026**: Meta publishes final per-country service
   rates. Re-run docs/08 §4.5 with the real AU utility rate (planning band
   AUD 0.01–0.05/msg). Design bot replies to batch (one rich message beats
   three chatty ones — each is billable from 1 Oct).
8. **Slack stays on bolt.** Add Teams via `@chat-adapter/teams` only when a
   corporate pilot requires it; Telegram via grammY if consumer growth wants
   it. Don't adopt Chat SDK wholesale while it's a fast-moving 4.x.

**Bottom line:** the official WhatsApp path exists, is affordable at pilot
scale, and now even has groups — but groups are bot-created, ≤ 8 participants,
invite-link-only, OBA-gated, and button-less. The single most urgent item is
#1 (start Meta verification now) and #7 (the 1 Oct 2026 service-message
pricing change re-prices our whole cost model in five weeks).
