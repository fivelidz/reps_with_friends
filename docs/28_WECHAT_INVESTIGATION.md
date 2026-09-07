# 28 — WeChat Compatibility: what's real, what's a trap, what's deferred

*Research date: 2026-09-07. Trigger: founder — "for groupchats I want to look into
wechat compatibility also." Companion doc to docs/18 (messaging platforms).
Methodology note: Tencent's developer portals (developer.work.weixin.qq.com,
developers.weixin.qq.com) are JS-walled to server-side fetches — official pages
are cited by URL but several specifics were read via the ecosystem around them
(wechaty docs, official sample repos, community writeups). Anything not nailed
down carries `[VERIFY]`.*

---

## TL;DR

1. **Consumer WeChat has NO group-message API and never has.** There is no
   official way for a bot to exist in a normal WeChat group chat. Every "WeChat
   group bot" you've seen is protocol-reverse-engineering (wechaty + pad/web
   puppets) that violates WeChat's ToS and gets accounts banned.
2. **The one legal, official group-bot surface in the WeChat universe is WeCom
   (企业微信, "WeChat Work")** — group robots (outbound webhooks per group) and
   self-built apps (bidirectional, callback-received). This maps onto our
   *corporate* lane, not our consumer crew lane.
3. **If we ever seriously enter China, the product shape is a Mini Program +
   Official Account, not a chat bot** — plus ICP licensing and data residency.
   That's a market-entry decision, months of work, deferred.
4. **Recommendation: defer all WeChat work.** One narrow exception worth
   keeping in the back pocket: a WeCom group-robot webhook adapter is ~a day of
   work in bot-core and is legal — do it only if a corporate pilot with China
   nexus actually appears.

---

## 1. The taxonomy — four different things called "WeChat"

| Thing | What it actually is | Group APIs? | Bot surface |
|---|---|---|---|
| **WeChat (微信)** consumer app | The consumer messenger (~1.3B users) | ❌ none for bots | None. Personal accounts only; automation = ToS violation |
| **Official Account platform (微信公众平台)** | Verified accounts (subscription/service) messaging followers 1:1 | ❌ accounts don't live in group chats | Passive reply (~5s window), customer-service messages (48h window after user msg), subscription notifications (订阅通知 — per-message user opt-in) `[VERIFY current windows]`. https://developers.weixin.qq.com/doc/offiaccount/ |
| **Mini Programs (小程序)** | Apps inside WeChat (Tencent's "app store within WeChat") | Share-into-chat, group leaderboards-ish; no bot messaging | Subscribe messages (one-time / long-term); the WeChat-native *client* play. https://developers.weixin.qq.com/miniprogram/ |
| **WeCom (企业微信)** | The separate corporate IM ("WeChat Work") — companies talk to staff + customers | ✅ **real ones** | Group robots (webhook, outbound), self-built apps (bidirectional), external-contact groups that can include consumer-WeChat users. https://developer.work.weixin.qq.com/ |

The historical fact the founder's question hinges on is row 1, and it still
holds in 2026: **there is no official consumer-WeChat group API.** Where
WhatsApp eventually shipped a (limited, bot-created) Groups API (docs/18 §1.3),
Tencent has never shipped any consumer-WeChat group surface. Everything that
claims otherwise is unofficial.

## 2. What EXISTS officially — the detail

### 2.1 WeCom group robots (群机器人) — the only easy, legal one

- Anyone in a WeCom group chat can add a **robot**, which yields a **webhook
  URL**: `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=<KEY>`.
- POST JSON; supported msgtypes: **text, markdown, image (base64+md5), news
  (link cards), file, template_card**. Markdown + template_card are actually a
  nice fit for match-state cards (score table, "your turn" nudges).
- **Outbound only.** The robot cannot see messages in the group — no receive
  path, so no command bus, no `link KX4T9C`, no interactive play. Broadcast
  only: "Daily Win went to Maya", "Season ends Sunday", "Pot stands at $34".
- Rate limit ~**20 messages/minute per robot** `[VERIFY]`; multiple robots per
  group allowed `[VERIFY cap — historically 20]`.
- Official doc (JS-walled, cite-by-URL): https://developer.work.weixin.qq.com/document/path/91788
  ("群机器人配置说明" / add group robot). Official sample libs by Tencent
  engineers exist per language: https://github.com/sbzhu/weworkapi_python
  (author abelzhu@tencent.com, WeCom team).

**Fit with bot-core:** a `wecom-webhook` transport is a ~½-day adapter — no
auth handshake beyond the key, one HTTP POST, markdown formatting we already
produce for Slack. It slots into `packages/bot-core` exactly like the Slack
Bolt transport, minus the receive half.

### 2.2 WeCom self-built apps — the full corporate rail

For *interactive* group play (receive commands, per-user identity) WeCom's real
API set is the self-built app (自建应用):

- Register app in the WeCom admin console → get corpid/secret → access_token
  flow (cache it; refresh ~2h — see token-caching notes in the official sample
  repo above).
- **Receive**: configure a callback URL; WeCom POSTs encrypted messages
  (AES) for app chats + group chats; you must echo-back a signature challenge.
- **Send**: `appchat/send` to group chats the app creates/manages
  `[VERIFY exact endpoint set — message/send for 1:1, appchat/send for groups]`.
- **External groups** (外部群): WeCom groups that include **consumer-WeChat
  users** via external contact — this is how a company bot ends up in a chat
  with normal WeChat users without breaking ToS. Group robots work in these
  groups too `[VERIFY — historically yes for 群机器人 in external groups;
  confirm current scope]`. User limits per external group apply
  (historically ~20-40 for robot-containing groups `[VERIFY]`).
- Cost: WeCom itself is free up to ~200 staff `[VERIFY current free tier]`;
  verification needs a business licence. **Non-mainland entities can register
  WeCom, but payment/customer-contact features are mainland-oriented**
  `[VERIFY — this is the single biggest open question for any AU→WeCom play;
  several features require a Chinese business licence or mainland admin ID]`.

**Effort:** a full bidirectional WeCom transport (callback decryption, token
refresh, appchat send, group lifecycle) is a 3–5 day adapter + a running
public callback endpoint (apps/api can host it). Not hard, just real.

### 2.3 Consumer WeChat via Official Account / Mini Program — the China-market path

If RWF ever goes to China properly:

- The client becomes a **Mini Program** (WeChat-native app, distributed inside
  WeChat, no store). Camera access exists in mini programs (wx.createCameraContext)
  so the verify loop is technically portable.
- Messaging becomes **Official Account subscription notifications** — and the
  key product fact: they are **opt-in per message** (one-time subscription =
  one notification), nothing like a chatty group bot. The group-chat social
  layer happens in whatever WeChat groups humans make themselves; we'd reach
  in only via shares and notifications.
- Both require a **verified Chinese entity**, an **ICP 备案/filing (and for
  commercial services an ICP licence)**, and — since 2023 — mini-program
  **备案** with MIIT before release `[VERIFY current enforcement]`.
- **PIPL data-residency**: fitness/health-adjacent data on Chinese users
  generally means China-hosted infrastructure. Our Cloudflare Pages + AU
  gmktec topology doesn't satisfy that as-is.
- **The charity pot doesn't travel**: public fundraising in China requires
  a registered charity with a 公开募捐 qualification. The China version of RWF
  would need the pot mechanic removed or reshaped (points/dares only).

## 3. The unofficial bridges — status check 2026 (for the record, not for use)

**wechaty** (github.com/wechaty/wechaty) is alive and still the centre of this
ecosystem — 23k stars, active Discord, polyglot (TS/Py/Go/Java/…). Its own
puppet table (wechaty.js.org/docs/puppet-providers, updated Dec 2025) is the
honest status:

| Puppet | Protocol | Status | Notes |
|---|---|---|---|
| wechaty-puppet-wechat / puppeteer | Web WeChat | Beta | Free; only works for accounts still eligible to log into web WeChat — **most post-2017 accounts aren't** (partial revival via the UOS trick, 2021) |
| wechaty-puppet-wechat4u | Web WeChat | Alpha | Same eligibility problem |
| wechaty-puppet-padlocal | iPad protocol | Beta | **Paid token**; works for normal accounts; the de-facto "real" one |
| wechaty-puppet-xp / WorkPro / Donut | Windows hook | Alpha | Runs a real Windows WeChat client under automation |
| wechaty-puppet-service | gRPC wrapper | Beta | Talks to hosted puppets (PadLocal etc.) |
| padpro / padchat / padplus / macpro / wxwork | — | **DEPRECATED** | Dead puppets; the graveyard that proves protocol churn |
| wechaty-puppet-official-account | Official Account API | Alpha | The legal one — 1:1 only, no groups |

- **itchat**: dead since 2017 (Tencent killed web-protocol access for new
  accounts). Historical footnote only.
- The Room API wechaty exposes (create room, add/del members, `room.say`) is
  exactly the fantasy feature set — *that's why it's a trap*: it runs on
  reverse-engineered protocols, violates WeChat ToS, and Tencent bans
  automated consumer accounts aggressively (it's the same class of risk as our
  whatsmeow prototype rail, but with a harder-working enforcement team and no
  "disposable number" insulation — you'd be burning *players'* group presence).
- Wechaty also now does **WhatsApp** (web protocol, alpha) — same unofficial
  class as Baileys/whatsapp-web.js in docs/18 §2.3. Not relevant beyond
  confirming the ecosystem's shape.

**Verdict: wechaty is a fine *prototyping* tool for a weekend demo and an
unacceptable *production* rail.** It's the China version of our own rule:
unofficial rails stay friends-only, disposable, never the product.

## 4. Verdict table

| Surface | Official path? | Effort | Risk | Recommendation |
|---|---|---|---|---|
| Consumer WeChat group bot | ❌ none exists | 2–4 days via wechaty/PadLocal | **Extreme** — ToS violation, account bans, burned players | **Never in production.** Not even pilot |
| WeCom group robot (webhook) | ✅ | **~½–1 day** (outbound adapter in bot-core) | Low (rate limits only) | Build **when a China-nexus corporate pilot exists** — otherwise don't |
| WeCom self-built app (bidirectional) | ✅ | 3–5 days + callback endpoint | Low-Med (verification, entity questions) | Corporate-lane expansion, post-revenue |
| Official Account (1:1 notifications) | ✅ | 2–3 days + Chinese entity + ICP | Med (compliance burden) | Only as part of a real China entry |
| Mini Program client | ✅ | Weeks (new client, new review, 备案) | Med-High (market + data residency + pot-mechanic rewrite) | **Defer until China market decision** |
| wechaty consumer bridge | ❌ | 1–2 days demo | Extreme (bans) | Demo only, if ever |

## 5. Sequencing within our existing roadmap

1. **Now → pilot → launch: nothing.** RWF's rails stay WhatsApp (Cloud API,
   docs/18) + Slack. WeChat compatibility is not on the pilot critical path
   and cannot be done legally at the consumer level at all.
2. **Trigger to revisit:** a paying corporate account (docs/08 §5
   corporate-wellness lane) with China offices or China-based employees asks
   for WeCom. Then: webhook adapter first (day one comms), self-built app
   second (interactive play).
3. **China-market decision** (separate from corporate): Mini Program client +
   ICP + local hosting + pot-mechanic rework. Months, needs the founder +
   Ben + probably a China partner. Everything in §2.3 is the pre-read for
   that conversation.

## What the founder does next

1. **Nothing urgently** — this doc is the "look into wechat compatibility"
   answer: no legal consumer path exists; corporate path exists and is cheap
   when triggered.
2. **Ask Ben/the SOT**: does any target corporate account (real or pipeline)
   have China operations on WeCom? If yes → green-light the ½-day webhook
   adapter. If no → this doc sits on the shelf.
3. If/when China gets serious: budget for ICP/licence + entity + localisation
   as a **separate project phase** (it's bigger than any chat adapter).
4. Optional 10-min sanity read: https://wechaty.js.org/docs/puppet-providers/
   (see for yourself what the unofficial world looks like) and the WeCom robot
   doc URL in §2.1.

## Sources

- WeCom group robot doc (official, JS-walled): https://developer.work.weixin.qq.com/document/path/91788
- WeCom API index + official sample libs: https://work.weixin.qq.com/api/doc · https://github.com/sbzhu/weworkapi_python (Tencent-authored sample)
- WeChat Official Account docs: https://developers.weixin.qq.com/doc/offiaccount/ (EN mirror 404s; CN is canonical)
- Mini Program docs: https://developers.weixin.qq.com/miniprogram/dev/framework/
- wechaty repo + puppet-provider status: https://github.com/wechaty/wechaty · https://wechaty.js.org/docs/puppet-providers/ (fetched 2026-09-07; table last updated Dec 2025)
- Context: docs/18_MESSAGING_PLATFORMS.md (WhatsApp Groups API reality), docs/21 (Beeper/Matrix), agents/05-concierge (corporate lane)
