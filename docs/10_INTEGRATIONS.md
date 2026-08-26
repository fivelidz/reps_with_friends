# Reps With Friends — Direct Integrations Map

**Date:** 2026-08-26 · **Type:** research/planning doc, no code.
**Inputs:** docs/07 (all families A–F approved), docs/05 (wearables research),
docs/08 (launch requirements), repo inspection (apps: api, bot-slack, bot-whatsapp,
hub, web; packages: game-core, bot-core; `@slack/bolt` ^5 Socket Mode in-repo;
WhatsApp via Qalarc Hub / whatsmeow transport), live fetches (Stripe AU pricing
page; Resend domains API). Anything not verified this pass is marked **[VERIFY]**.

**Founder context (shapes §2):** Alexei built corporate wellness systems + EAPs
at Sahha (health-data API). The corporate world that product sold into expects:
SSO, HRIS-driven cohorts, SCIM offboarding, and **aggregate-only** wellbeing
reporting with a small-cell suppression floor. RWF's corporate integrations
should speak that language from day one — it's a credibility shortcut with the
exact buyers who will pay.

**Phase vocabulary (from docs/08):** NOW = PROTOTYPE (internal + friends, no
approvals) · PILOT = first external groups / first corporate Slack trial ·
LATER = PUBLIC / post-traction.

---

## 0. Element → integration index (every approved element, A–F)

| # | Element (docs/07) | Direct integrations | Section | Phase |
|---|---|---|---|---|
| 1 | 300-format match | Slack Bolt; WhatsApp rail (§4) | §4 | ✅ built |
| 2 | Tier handicap v1 | none (self-set) | — | ✅ built |
| 3 | Effort handicap v2 (%HRR) | BLE 0x180D / Web Bluetooth → HealthKit / Health Connect → WHOOP/Garmin (§5) | §5 | PILOT→LATER |
| 4 | Closure bonus | none | — | ✅ built |
| 5 | Charity pot | Pledge ledger → Stripe Payment Links → charity link-out (§1) | §1 | NOW→PILOT |
| 6 | Taunt engine | none external (AI later) | — | ✅ basic |
| 7 | Seasons | ICS calendar + reminders (§7) | §7 | NOW |
| 8 | Relegation/promotion | none external | — | — |
| 9 | Comeback multiplier | none external | — | — |
| 10 | MVP vote | Slack/WhatsApp interactions (in-repo) | §4 | NOW |
| 11 | Streak forgiveness (charity top-up) | §1 rails (pledge → Payment Link) | §1 | NOW→PILOT |
| 12 | Baseline learning | §5 wearable data feeds baseline | §5 | LATER |
| 13 | Result-card images | in-repo canvas/SVG + satori/resvg OG + deep links (§3) | §3 | NOW |
| 14 | Mid-set drop-cam | MediaRecorder (client) → ffmpeg (server) (§3) | §3 | LATER |
| 15 | Spectator mode | read-only bot posts; public ladder page on Cloudflare (§6) | §4/§6 | PILOT |
| 16 | Crew vs Crew | cross-chat bot messaging (§4); Slack link-sharing / wa.me (§3) | §3/§4 | PILOT |
| 17 | Public ladder opt-in | Cloudflare Pages site + Plausible analytics (§6) | §6 | PILOT |
| 18 | Org leagues | Slack org app / directory (§2); Teams LATER (§2) | §2 | PILOT |
| 19 | Employer-funded pots | Stripe Invoicing + pot budget ledger (§1) | §1 | PILOT |
| 20 | Admin dashboard | aggregate-only export, k≥5 suppression (§2) | §2 | PILOT |
| 21 | Onboarding-as-a-service | Resend email + ICS scheduling (§6/§7) | §6/§7 | NOW |
| 22 | Camera counting (MoveNet) | in-browser, no vendor (docs/05) | §5 | NOW |
| 23 | BLE HR strap | Web Bluetooth 0x180D (docs/05) | §5 | NOW |
| 24 | Apple Watch / HealthKit | HKWorkoutSession (docs/05 Phase 2) | §5 | LATER |
| 25 | WHOOP/Garmin cross-check | cloud APIs (docs/05 Phase 3) | §5 | LATER |
| F | Referee review | none (on-device) | — | 🧊 |
| F | Physical belts | shipping API (e.g. Shippo/Sendle [VERIFY]) — when real | — | 🧊 |
| F | Radio mode | audio hosting (Cloudflare R2) — when real | §6 | 🧊 |
| F | Charity championship | §1 rails at volume + media page (§6) | §1/§6 | 🧊 |

---

## 1. Charity pots — payment rails (elements 5, 11, 19, F-championship)

**Constraint from docs/08 §6:** no player money moves until the written legal
opinion lands; red lines = no winner value, no house cut, no "bet/wager"
vocabulary; pot-payment UX must be **web-only** (Apple 3.2.2(iv)). Employer-
funded pots (element 19) are flagged as the likely pilot-safe structure because
players pay no consideration.

### Options

| Integration | What it gives | Effort | Cost | Risk |
|---|---|---|---|---|
| **Pledge ledger (internal)** | App records pledges + winner's charity choice; settlement is honour-system via the charity's own donate page | S (days) | $0 | Social only — no money handled, no fundraising-authority nexus (docs/08 §6.3 Q2 structure) |
| **Charity link-out (ACNC-registered pages)** | Winner picks from a curated list; we deep-link to the charity's own donation page; ACNC public register used to verify donees | S | $0 | Donation happens off-platform → we can't prove settlement; mitigate with "I donated" confirmation + running pot total |
| **Stripe Payment Links** | Hosted no-code payment page per pot; web-only (satisfies Apple 3.2.2(iv)); API-creatable at scale | S–M | Included with Payments; **1.7% + A$0.30 domestic cards, 3.5% + A$0.30 intl (verified 2026-08-26; domestic drops further 1 Oct 2026)** | We become collector of player money → legal opinion + possible state fundraising registrations MUST precede; card fees eat small pots |
| **Stripe Checkout** | Same as above with more UI control (branding, metadata) | M | Same card fees (verified) | Same as above |
| **Stripe Connect (charity payouts)** | Route pot money to charity recipients as connected accounts | L | Standard pricing incl.; +0.25% only if we set our own pricing (verified) | Each charity needs a Stripe account — most AU charities don't have one; onboarding N charities per winner's choice is operationally dead. **Not the tool for this** |
| **PayPal Giving Fund API** | PGF is merchant-of-record, distributes to enrolled charities, typically at no fee to donor/charity [VERIFY current partner-program terms — developer docs unfetchable this pass] | M–L | ~0 [VERIFY] | Partner/enrolment program; AU charity coverage partial [VERIFY]; adds a second payment brand for little gain at pilot scale |
| **GoFundMe Charity** | Consumer fundraising pages | — | Platform fee ~0 [VERIFY] | **No automation API fit for per-match pots**; wrong shape — skip |
| **Employer-funded: Stripe Invoicing** | Invoice the company monthly for pot funding + subscription; company never touches per-player flows | S | **0.4% per paid invoice, A$2 cap (verified)** | Lowest-risk money path: B2B invoice, no player consideration |
| **Employer-funded: pot budget ledger** | Company pre-funds a budget; we allocate per season and remit donations ourselves | M | $0 platform | We hold and remit charity money → re-opens §6.3 fundraiser questions. Use ledger for *tracking*, invoicing + link-out for *money* |

### Recommendation

- **NOW: pledge ledger + ACNC-verified charity link-out.** Zero money handled,
  zero legal gate, the mechanic is fully playable — and it matches docs/08's
  interim rule ("pots are pledge-only or company/employer-funded").
- **PILOT: Stripe Payment Links for player contributions (only after the legal
  opinion), Stripe Invoicing for employer-funded pots (element 19) immediately
  at first corporate trial.** Payment Links is a hosted web page — one link per
  pot, no code, Apple-compliant by construction; Invoicing is the cleanest
  money RWF will ever touch.
- **LATER: PayPal Giving Fund** only if pot volume makes card fees a real
  complaint and PGF's AU coverage checks out. **Never: Connect for charity
  payouts** (charities won't onboard), **never: GoFundMe** (wrong shape).

---

## 2. Corporate / EAP (elements 18, 19, 20, 21)

The Sahha playbook: the buyer is HR/People, the gatekeeper is IT/Security, and
the renewal argument is aggregate wellbeing reporting nobody can weaponise
against an employee. Every choice below optimises for those three people.

### 2.1 Identity / SSO

| Integration | What | Effort | Cost | Risk |
|---|---|---|---|---|
| **Slack identity (sign-in with Slack / org install)** | Users are already authenticated in the workspace; Slack user + team IDs are the identity | S (in-repo already) | $0 | Only covers Slack orgs — which is exactly the wedge |
| **Google Workspace (OIDC)** | "Sign in with Google" for web/PWA users in Google-shop companies | S | $0 | Commodity; low risk. If offered as primary login in a native app, Apple 4.8 forces Sign in with Apple too (docs/08 §2) |
| **Azure AD / Entra ID (OIDC + SCIM)** | Enterprise SSO; multi-tenant app registration; the default ask of every >500-seat AU corporate | M | $0 (each customer uses their own tenant) | Enterprise IT will demand config docs, admin consent scopes, and a security questionnaire before enabling |
| **Okta (OIDC + SCIM)** | Same story, US-centric orgs | M | $0 | Niche in AU vs Entra [VERIFY customer mix when it matters] |

**Recommendation: NOW = Slack identity only (already built). PILOT = Google
OIDC (one evening of work, unblocks non-Slack pilots). LATER = Entra ID at the
first enterprise deal that requires it — build it *for a signed customer*, not
speculatively.** Why: SSO is a checkbox you buy cheaply with OIDC libraries;
the expensive part is the security-review paperwork, which only a real customer
justifies.

### 2.2 HRIS cohort sync (auto-create divisions/leagues from org structure)

| Integration | What | Effort | Cost | Risk |
|---|---|---|---|---|
| **CSV upload (any HRIS)** | HR exports a department/team list; we map columns → cohorts | S | $0 | Manual refresh; fine to ~500 employees |
| **BambooHR API** | REST, API-key, employee + department endpoints; the SMB default | S–M | Included in customer's BambooHR plan [VERIFY tier requirements] | We touch employee PII → data-processing agreement + data inventory entry (docs/08 §7) |
| **HiBob API** | REST/OAuth, growing AU mid-market presence | M | As above [VERIFY] | As above |
| **Workday (RaaS / APIs)** | The enterprise incumbent | L | Customer-side; often partner-gated [VERIFY] | Weeks of integration per customer; never build before a contract |

**Recommendation: NOW = CSV upload (every HRIS on earth exports one; cohort
mapping is a 2-day feature). PILOT = BambooHR or HiBob API for whichever HRIS
the first paying customer runs. LATER = Workday, contract-in-hand only.** Why:
HRIS sync is a demo line-item ("syncs from your HRIS") long before it needs to
be a live API.

### 2.3 SCIM (automated provisioning/offboarding)

SCIM 2.0 via Entra/Okta maps joiner→invite, leaver→suspend. Effort M, cost $0,
risk = handling deprovisioning correctly (suspend, not delete — match the
retention policy in docs/08 §7). **Recommendation: LATER** — it only matters
once IT teams (not HR champions) are doing the buying; before that, Slack
install/uninstall + CSV refresh covers it. Why: SCIM is table stakes for the
enterprise tier and worthless before it.

### 2.4 Wellbeing aggregate export (element 20 — the renewal argument)

Sahha-style rules, adapted to RWF: **employers get aggregates only, with a
k-anonymity floor of 5** — any cell (cohort × week × metric) covering fewer
than 5 active players is suppressed. No individual rep counts, HR, names, or
rankings ever leave the player layer.

What's sellable (aggregate, k≥5):

| Metric | Source | Renewal story |
|---|---|---|
| Participation rate (weekly active / enrolled) | bot + app events | "63% of your sales team played this month" |
| Match/season completion rate | game-core | habit formation |
| Streak length distribution | game-core | consistency, not intensity |
| Effort trend (aggregate %HRR or participation-weighted, Phase 3+) | docs/05 engine | "average effort up 12% season-over-season" |
| Crew count + cross-team matches | game-core | connection across silos (the EAP story) |
| Charity dollars directed | §1 ledger | CSR report line-item HR loves |

Delivery options: scheduled email PDF/CSV via Resend (S, $0 — do this first);
dashboard behind SSO (M); data-warehouse export (L, never before asked).

**Recommendation: PILOT = scheduled aggregate CSV/PDF email with k≥5 suppression
hard-coded in the query layer.** Why: element 20 is the renewal argument and a
weekly email is a weekend of work; a dashboard can wait for a customer who
renews.

### 2.5 Slack distribution (element 18)

In-repo today: Bolt on **Socket Mode** (single-workspace, no public URLs —
perfect for PROTOTYPE). Path to corporate:

| Step | What | Effort | Risk |
|---|---|---|---|
| HTTP mode + OAuth flow | Multi-workspace install (`oauth.v2.access`, state secret, redirect URLs) | M | Needs a public HTTPS endpoint → Cloudflare (§6) |
| App Directory listing | App details, privacy policy, support URL, demo → Slack review | S (paperwork) | Review days–weeks [VERIFY]; privacy policy must exist first (docs/08 §5/§7) |
| Org-level / Enterprise Grid install | Admin-approved org app; **Slack security review** (questionnaire + evidence, commonly cited 2–6 weeks [VERIFY]) | M + calendar | The real corporate gate — start the questionnaire the day the first Grid customer appears |

**Recommendation: NOW = stay Socket Mode. PILOT = HTTP/OAuth + directory
submission (unblocks "install it yourself" growth). LATER = Grid/security
review, triggered by first enterprise customer.** Why: distribution is the
difference between 10 bespoke IT conversations and a link (docs/08 §5).

### 2.6 Microsoft Teams — the neglected channel, assessed

- **The case for:** AU enterprise/government is M365-heavy; the buyers who
  sign wellness budgets often live in Teams, not Slack. Teams tabs can host the
  PWA directly (no store review for tab-only apps [VERIFY current policy]),
  Adaptive Cards approximate Block Kit, and Bot Framework gives 1:1 + channel
  bots. It doubles the addressable corporate market.
- **The case against:** a second bot surface to maintain (Bot Framework SDK vs
  Bolt), a different interaction vocabulary, and zero overlap with the
  consumer/friends wedge (WhatsApp) that is the actual growth engine now.
- **Recommendation: LATER — build Teams when a specific deal is blocked on it
  ("we'd sign, but we're a Teams house"), not before.** Why: it's a
  revenue-unblocking port, not a growth channel; Slack-first matches both the
  product's energy and where design-forward companies (the early adopter
  profile) actually are.

---

## 3. Result cards / shareables (elements 13, 14, 16, 17)

| Integration | What | Effort | Cost | Risk |
|---|---|---|---|---|
| **In-repo canvas/SVG generation** | Client-side card rendering (already done in-repo) | ✅ | $0 | None |
| **satori + resvg (server-side OG images)** | JSX→SVG→PNG at an endpoint; every shared match link unfurls with a live scoreboard image in WhatsApp/Slack/iMessage | S–M | $0 OSS; runs in worker | Font licensing (embed an open font); cold-start latency on serverless |
| **wa.me deep links** | `https://wa.me/?text=<prefilled>` from the card's share button — forwards card + link into any chat, no API, no Meta approval | S | $0 | None |
| **Slack deep links** | `slack://` URIs to channels/DMs; Slack share intents for posting results into another crew's channel (element 16) | S | $0 | Client-version quirks [VERIFY current URI schemes] |
| **ffmpeg (drop-cam, element 14)** | Server-side trim/transcode of captured clips | M | $0 OSS + CPU | Privacy: video must stay opt-in and device-side first (docs/08 §7 on-device claim); MediaRecorder client-side capture is the NOW-shaped version, ffmpeg only when server processing is genuinely needed |

**Recommendation: NOW = satori/resvg OG endpoint + wa.me and Slack deep links
(this is the whole viral loop for element 13 — every match end becomes an ad in
a chat, at $0). LATER = ffmpeg drop-cam, client-capture first.** Why: the share
mechanism is free, approval-free, and multiplies every other integration; video
processing is a cost centre with a privacy surface.

---

## 4. Messaging (elements 1, 15, 16)

| Integration | Status | Effort | Cost | Risk |
|---|---|---|---|---|
| **Qalarc Hub / whatsmeow bridge** | Running (in-repo transport) | ✅ | $0 | ToS-violating automation; **number ban is the risk**; docs/08 §4.1 migration trigger = first group containing strangers; never let an external group join the prototype number |
| **WhatsApp Cloud API (official)** | Not started | M (business verification, dedicated number, display name, webhooks — docs/08 §4.2) | Service conversations free (user-initiated) [VERIFY still true]; templates ≈ AUD 0.03–0.15/msg [VERIFY rate card]; ~AUD 13/mo at 10 groups (docs/08 §4.5 model) | **Group messaging historically unsupported** — the single biggest unknown (docs/08 §4.3); confirm before designing pilot architecture, else bot DMs each player 1:1 |
| **Slack Bolt** | In-repo (Socket Mode) | ✅ → M for HTTP/OAuth distribution | $0 | Distribution/security review per §2.5 |
| **Messenger Send API (Meta)** | Not started | M | Free within 24-h window; paid marketing messages [VERIFY] | AU friend groups live on WhatsApp/iMessage, not Messenger; second Meta review for little AU upside |
| **iMessage** | — | — | — | **No bot API exists** (Apple Business Chat is customer-service, 1:1, business-gated — wrong shape for group games). Not viable; the PWA + wa.me/OG unfurls is the iMessage story |

**Recommendation: NOW = whatsmeow on the disposable number (internal groups
only, per docs/08 standing rule) + Slack Socket Mode. PILOT = Cloud API
migration at the first-external-group trigger — start Meta business
verification the day the trigger fires, and confirm group support FIRST.
LATER/NO = Messenger (only if US expansion demands it), iMessage (never as a
bot).** Why: the migration trigger is about protecting the referral loop from
an unappealable ban, not about features.

---

## 5. Wearables / health (elements 3, 12, 22–25)

Summarised from docs/05 (do not re-research; see that doc for sources and the
full comparison table). Core doctrine: **live play runs on phone/watch sensors;
cloud wearable data is post-game verification only.**

| Phase | Integrations | RWF use | When |
|---|---|---|---|
| **Phase 1 (docs/05 = NOW)** | Camera pose in-browser (MoveNet/MediaPipe, no vendor); DeviceMotion fallback; **Web Bluetooth BLE HR 0x180D** (any strap, Chrome/Edge Android+desktop; no iOS Safari [VERIFY]) | Rep counting + live HR for %HRR effort handicap (element 3) with zero approvals | NOW — ships with the PWA |
| **Phase 2 (docs/05 = 1–2 quarters)** | **HealthKit** `HKWorkoutSession` live HR (the only first-party live HR); **Health Connect** read/write on Android | Native sensor layer once Phase-3 %HRR scoring demands it (docs/08 §1 sequencing) | LATER (PUBLIC) |
| **Phase 3 (docs/05 = post-traction)** | **WHOOP** (strain/recovery, webhooks; dev needs membership), **Garmin Connect** (activities, FIT, Training API; business approval ~2 days), **Google Health API** (Fitbit+Pixel; AZM — target this, NOT dead Fitbit Web API), **Oura** (readiness), **Strava** (aggregator: most devices sync there; paid sub to create app; >10 athletes needs review) | Post-game effort cross-check (element 12 baselines, element 25), recovery-adjusted handicap | LATER |

**Recommendation: adopt docs/05's phasing verbatim — Web Bluetooth + camera
NOW, HealthKit/Health Connect when native ships, cloud APIs post-traction with
WHOOP first (smallest effort, best-fit metrics) and Strava as the cheap
aggregator if device diversity becomes a support burden.** Why: it's already
researched, sequenced by approval friction, and every cloud API is sync-only —
nothing there can improve the live game.

---

## 6. Ops

| Integration | What | Effort | Cost | Risk |
|---|---|---|---|---|
| **Resend (transactional email)** | Magic links, season digests, aggregate reports (§2.4), invoices | S | Free tier 3k emails/mo, then ~US$20/mo [VERIFY current tiers] | **Verified live 2026-08-26:** sending domains `qalarc.com` (us-east-1), `tradez.au`, `endispute.com.au` all **verified**. No RWF domain yet → send from a subdomain (e.g. `play.repswithfriends.qalarc.com` [VERIFY Resend subdomain-of-subdomain behaviour] or `repswithfriends.qalarc.com`) until the RWF domain is bought (docs/08 NOW checklist) |
| **Postgres (managed)** | Neon / Supabase / RDS | S to migrate | Neon/Supabase free tiers [VERIFY current limits] | Self-hosted now = backup discipline is on us; managed at PILOT buys PITR + no-ops |
| **Redis (managed)** | Upstash serverless | S | Generous free tier [VERIFY] | Same story as Postgres |
| **Cloudflare Pages** | PWA + ladder site (element 17) hosting, global CDN | S | Free tier [VERIFY limits] | None material |
| **Cloudflare Tunnels** | Public HTTPS for the API/bot webhooks + demos beyond localhost — no port-forwarding, no VPS | S | Free | Tunnel downtime = webhook misses; add uptime monitor |
| **Plausible (Cloud or self-host)** | Privacy-first analytics — no cookies, aggregates only; matches the "no video leaves your device" story | S | ~US$9/mo cloud or self-host free [VERIFY] | None |
| **PostHog (self-host)** | Funnels, retention cohorts, feature flags | M | Free self-host (infra cost) | Self-hosted PostHog is heavy (ClickHouse); don't start here |

**Recommendation: NOW = Resend on a qalarc.com subdomain + Cloudflare
Pages/Tunnel for demos + Plausible. PILOT = Neon (or Supabase) Postgres + 
Upstash Redis so backups stop being a discipline problem. LATER = PostHog when
funnel questions outgrow Plausible.** Why: every NOW item is free-tier, an
evening of work, and directly unblocks other sections (Tunnel → Slack HTTP
mode; Resend → §2.4 reports; Pages → element 17).

---

## 7. Scheduling / calendar (play-day reminders, element 7's heartbeat)

| Integration | What | Effort | Cost | Risk |
|---|---|---|---|---|
| **ICS file generation** | Season schedule as a calendar file/URL (`webcal://`); subscribable in Google/Apple/Outlook with zero API consent screens | S | $0 | Recurring-event edge cases; test across the three big calendar apps |
| **Google Calendar API** | Per-user OAuth, event insert, push reminders | M | $0 quota | Calendar scope is a scary consent screen for a game; per-user tokens to manage |
| **Cron + WhatsApp template** | Scheduled bot message ("play-day tomorrow: 6 of 6 still alive") | S | Free on whatsmeow now; template cost at Cloud API (utility ≈ AUD 0.03–0.10/msg [VERIFY]) — already inside the docs/08 §4.5 model | Template approval needed post-migration |

**Recommendation: NOW = ICS subscription URL + cron-driven bot nudge (free on
the current rail). LATER = Google Calendar API only if players demonstrably
want events pushed rather than subscribed.** Why: ICS is the only calendar
integration with no consent screen, no tokens, and no platform risk — and a
subscribed calendar is a standing reminder that outlives any notification.

---

## 8. Integration backlog — top 8, sequenced

| # | Integration | Phase | Gate | Why this order |
|---|---|---|---|---|
| 1 | **satori/resvg OG result cards + wa.me/Slack deep links** (§3) | NOW | none | The viral loop (element 13); free, approval-free, multiplies everything else |
| 2 | **ICS season calendar + cron play-day nudges** (§7) | NOW | none | Retention heartbeat for seasons (element 7); zero platform risk |
| 3 | **Resend transactional email on qalarc.com subdomain** (§6) | NOW | none | Magic links + digests; domains verified live; unblocks §2.4 reports later |
| 4 | **Cloudflare Pages + Tunnel** (§6) | NOW | none | Public demo URLs + the HTTPS endpoint Slack HTTP mode (item 6) requires |
| 5 | **Pledge ledger + ACNC charity link-out** (§1) | NOW | none | Makes element 5 fully playable with zero money handled; legal-gate-safe |
| 6 | **Slack HTTP/OAuth distribution + App Directory submission** (§2.5) | PILOT | privacy policy live | Turns corporate installs from IT negotiations into a link |
| 7 | **WhatsApp Cloud API migration** (§4) | PILOT | first external group (docs/08 §4.1); **confirm group support first** | Protects the referral loop from an unappealable whatsmeow ban |
| 8 | **Stripe Payment Links (player pots, post-legal-opinion) + Stripe Invoicing (employer pots)** (§1) | PILOT | legal opinion (docs/08 §6) | Element 19 is the pilot-safe money structure; Invoicing needs no opinion to bill a company |

**On deck (LATER, in order):** aggregate-only admin export with k≥5 suppression
(§2.4 — build the week before the first corporate renewal conversation) →
Google OIDC (§2.1) → CSV→BambooHR/HiBob cohort sync (§2.2) → HealthKit/Health
Connect with native (§5) → Entra ID + SCIM + Slack Grid security review, all
deal-triggered (§2) → WHOOP then Strava (§5) → Teams, Messenger, ffmpeg
drop-cam, PostHog — each only when a real user or signed deal demands it.

---

*Research pass 2026-08-26. Verified live this pass: Stripe AU pricing page
(card rates, Payment Links/Checkout inclusion, Invoicing 0.4%/A$2 cap, Connect
inclusion), Resend domain statuses (API). Everything else marked [VERIFY]
follows docs/05 + docs/08 sourcing rules — re-verify against official pages
before spending money or submitting reviews.*
