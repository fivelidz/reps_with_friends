# Reps With Friends — Launch Requirements (Phased)

**Owner:** Lane 8 (launch & compliance). **Status:** research doc, not legal advice.
**Purpose:** everything required to ship at each phase, with costs, lead times,
blockers, and consequences of skipping. Ends with a sequenced checklist.

**How to read this doc**

- Three phases: **PROTOTYPE** (now — internal + friends' groups, no approvals),
  **PILOT** (first external groups / first corporate trial), **PUBLIC** (store
  launch, scale).
- `[VERIFY]` = claim from general knowledge, not confirmed against an official
  source during this research pass. Sources attempted 2026-08-26: Apple App
  Review Guidelines (fetched successfully — last updated June 2026); Meta
  WhatsApp pricing docs, Google Play health-declaration docs, Slack app-review
  docs, ACNC pages (all blocked/404/JS-shell → knowledge + `[VERIFY]`).
- **This doc frames questions for a lawyer; it does not answer them.** No money
  should move on the strength of this document alone.

---

## Phase definitions (what gate we're at)

| Phase | Who plays | Money in pots? | Approvals needed |
|---|---|---|---|
| PROTOTYPE | Our own numbers, friends, Ben/Nico's circles | No — honour-system or company-funded | None (see WhatsApp caveat §4) |
| PILOT | First external groups, first corporate Slack trial | Only after legal opinion (§6) | Meta business verification, Slack app review, privacy policy live |
| PUBLIC | Anyone; store distribution | Per legal opinion + per-jurisdiction | App stores, health declarations, fundraising structure locked |

---

## 1. PWA vs native — sequencing decision

**Recommendation: PWA through PROTOTYPE and PILOT. Native only when Phase 3
(effort truth / wearables) demands it. Ship the PWA as the product; treat
native as a sensor layer, not the app.**

### What the PWA can do (today, no approvals)

- Installable (Add to Home Screen), offline scoreboard, instant updates, no
  store review, no developer fees, one codebase.
- Camera rep counting works in-browser: `getUserMedia` + MoveNet/BlazePose in
  WASM. This is the load-bearing prototype claim — no video leaves the device.
- Join links from WhatsApp/Slack open directly in browser. Zero-friction
  onboarding, which is the whole chat-first thesis.

### What only native can do

| Capability | PWA | Native | Needed for |
|---|---|---|---|
| Camera pose counting | ✅ | ✅ | Core loop (PWA sufficient) |
| Push notifications (iOS) | Partial — installed-PWA push supported since iOS 16.4 `[VERIFY current OS coverage]` | ✅ | Re-engagement |
| HealthKit (live HR, workout sessions) | ❌ | ✅ iOS only | Phase 3 %HRR effort scoring |
| Health Connect (Android HR/workouts) | ❌ | ✅ Android only | Phase 3 on Android |
| Apple Watch / Wear OS apps | ❌ | ✅ | Phase 3+ "just move" tracking |
| Background sensor capture | ❌ | ✅ | Passive verification (Lane 7) |

### Sequencing

1. **Now → PILOT:** PWA only. Every feature of the 300-loop fits.
2. **PILOT → PUBLIC:** keep PWA as the scoreboard + share surface. Add native
   shells (or full native apps) when %HRR scoring ships — that's the first
   feature with a hard native dependency.
3. **Watch apps:** Phase 3+, after phone-native proves the sensor pipeline.

### What breaks if we skip the decision / go native early

- Native-first costs 6–10 weeks of store-compliance work (§2, §3) before a
  single external player can join — fatal to the chat-first wedge.
- PWA-forever caps Phase 3: no HealthKit/Health Connect means effort stays
  self-declared (v1 tiers), which weakens the corporate-wellness pitch
  (verifiable effort is the differentiator).

---

## 2. Apple App Store (when native ships)

Verified against App Review Guidelines (fetched 2026-08-26, page dated
2026-06-08). Quoted clauses are exact; the rest is `[VERIFY]`.

### Requirements

- **4.2 Minimum Functionality** — "Your app should include features, content,
  and UI that elevate it beyond a repackaged website." A thin WebView around
  the PWA **will be rejected**. The native app must stand alone (native
  HealthKit charts, watch app, live HR — conveniently exactly our native
  reasons).
- **5.1.1(v) Account deletion** — if the app supports account creation, it
  must offer in-app account deletion. Build the deletion endpoint before
  first submission, not after.
- **5.1.1(i) Privacy policy** — link in App Store Connect metadata AND in-app;
  must state data collected, uses, third parties, retention/deletion, and how
  to revoke consent.
- **Privacy nutrition labels** — App Store Connect "App Privacy" section must
  declare collection (rep counts and HR = health & fitness data; phone
  number; identifiers). Mismatch with actual behaviour risks removal.
- **5.1.3 Health data** — health/fitness data may not be used for advertising
  or use-based data mining; may be used to benefit the user directly; "You
  must disclose the specific health data that you are collecting from the
  device." No false data written to HealthKit; no personal health info in
  iCloud.
- **2.5.1** — HealthKit must be used for health/fitness purposes (it is).
- **5.3.4 Gambling** — real-money gaming requires licensing, geo-restriction,
  and a free app. Our charity pot must never be presentable as real-money
  gaming (see §6). If a reviewer reads "wager" language in metadata, expect
  rejection or a legal-licence request.
- **3.2.2(iv) Charity fundraising — CRITICAL:** "Apps that seek to raise
  money for such causes must be free on the App Store and may only collect
  funds outside of the app, such as via Safari or SMS" (unless we become an
  Apple-approved nonprofit, 3.2.1(vi), which we are not). **Consequence: the
  pot-contribution flow must live on the website (reached via link), never
  inside the native app.** The app can show pot status; it cannot take the
  money. Design the payment UX accordingly from day one.
- **1.4.5 Physical harm** — "Apps should not urge customers to participate in
  activities (like bets, challenges, etc.) … that risks physical harm."
  Exercise challenges sit near this line: include intensity guidance, rest
  prompts, and a health disclaimer `[VERIFY how reviewers apply this to
  fitness challenges in practice]`.
- **4.8 Login services** — if we offer Google/Apple social login for the
  primary account, Sign in with Apple (or equivalent) must also be offered.
  Simplest: email magic-link only, or phone-number identity from the chat
  side.
- **5.1.1(ix)** — apps in regulated fields should be submitted by a legal
  entity, not an individual developer account. Register as an organisation
  (needs DUNS number `[VERIFY current org-enrolment requirements]`).

### Costs & lead times

| Item | Cost | Lead time |
|---|---|---|
| Apple Developer Program (org) | USD 99/yr (~AUD 150) `[VERIFY AUD billing]` | 1–2 days + DUNS if new `[VERIFY]` |
| First review | — | ~24–48 h typical; health + payments context can extend `[VERIFY]` |
| Rejections | — | Budget 2–3 cycles for a health app first submission `[VERIFY]` |

### Blockers

- Organisation account + entity (ABN/company) must exist.
- Account-deletion endpoint + privacy labels + pot-money-outside-app UX.

### What breaks if we skip

- No iOS distribution at all (PWA-only is viable short-term but caps Phase 3).
- If we skip the 3.2.2(iv) separation: rejection at best, removal at worst,
  and a metadata trail that reads "gambling-adjacent" — poison for later
  submissions.

---

## 3. Google Play (when native ships)

All `[VERIFY]` — Play Console help pages blocked this research pass.

### Requirements

- **Developer account:** one-time USD 25 `[VERIFY]`. Organisation account
  recommended (personal accounts created after Nov 2023 require 14-day closed
  testing with 12+ testers before production access `[VERIFY current rule]`).
- **Health apps declaration:** apps in Health & Fitness categories that
  request health permissions must complete a declaration describing intended
  use of health data, with links to privacy policy `[VERIFY exact form and
  thresholds]`.
- **Health Connect:** reading/writing heart-rate and workout data goes
  through Health Connect permissions, which require a permission-declaration
  form and Google approval (with a demo video of the feature) before
  production `[VERIFY process + current approval SLA]`.
- **Data safety form:** declare collection/sharing of fitness data, phone
  numbers, identifiers; must be consistent with the privacy policy and Apple
  labels (keep one internal data-inventory sheet feeding all three).
- **Ads:** health data may not feed personalised ads (mirrors Apple 5.1.3).

### Costs & lead times

| Item | Cost | Lead time |
|---|---|---|
| Developer account | USD 25 once `[VERIFY]` | 1–2 days |
| Health Connect permission approval | — | Days–weeks `[VERIFY]` |
| Health declaration review | — | Days `[VERIFY]` |

### Blockers

- Health Connect approval is the long pole — start it the week native
  development starts, not at submission.

### What breaks if we skip

- Undeclared health data = rejection or post-launch removal; Play policy
  enforcement can suspend the whole developer account `[VERIFY enforcement
  practice]`, which would also kill any other apps we ship.

---

## 4. WhatsApp Business Platform (the make-or-break platform dependency)

### 4.1 Two rails, one migration trigger

| Rail | Status | Use |
|---|---|---|
| **Qalarc Hub (whatsmeow)** — unofficial WhatsApp-Web-protocol bridge | Running today | PROTOTYPE only, on **our own number**, with friends who know it's a hack |
| **WhatsApp Business Platform (Cloud API)** — official, Meta-hosted | Not started | PILOT onward |

- whatsmeow automates the consumer WhatsApp protocol; it is a Terms-of-Service
  violation for automated/business use `[VERIFY exact ToS clause]`. Real risk
  is **number ban**, which is unappealable in practice for unofficial
  automation `[VERIFY appeal reality]`.
- **Migration trigger: the first group containing people we don't personally
  know.** A ban mid-season on a stranger's group kills the game and the
  referral loop. Until migration, keep the prototype number disposable and
  never let an external group join via it.

### 4.2 Cloud API onboarding requirements `[VERIFY all — Meta docs blocked]`

1. Meta Business Manager portfolio + **business verification** (ABN/ACN
   documents; ~1–7 days).
2. Dedicated phone number that is **not simultaneously registered** on the
   consumer WhatsApp app (number can be migrated in with a pin; plan the
   cutover).
3. Display-name approval (must match the business name).
4. App review for `whatsapp_business_messaging` + webhook configuration.
5. Payment method on file (per-message billing).

### 4.3 ⚠️ The group-messaging problem (top WhatsApp risk)

**The Cloud API historically does NOT support sending messages into WhatsApp
group chats — it is a 1:1 API.** whatsmeow (our prototype rail) does groups;
the official rail may not `[VERIFY current status — Meta announced group
support for business messaging in beta/roadmap form; confirm general
availability and scope before designing the pilot]`.

If groups are not available at pilot time, the production pattern becomes:
**bot DMs each player individually** (match updates, standings, nudges as 1:1
messages) while the human group chat remains the social surface. This changes
the product feel (no shared bot presence in the group) and the message-volume
model (N 1:1 conversations instead of 1 group). **Action: confirm Cloud API
group capability before finalising the pilot architecture — it is the single
biggest unknown on this platform.**

### 4.4 Pricing model `[VERIFY all rates — rate card not fetchable]`

Model changed over time: per-conversation pricing (2022–2025) → **per-template
-message pricing from July 2025** `[VERIFY cutover and current model]`.
Load-bearing facts to re-verify before pilot:

- **Service conversations (user-initiated) became FREE on 1 Nov 2024**
  `[VERIFY]`. Our game traffic is overwhelmingly user-initiated (players
  command the bot; bot replies inside the 24-hour customer-service window are
  free-form and free). If this holds, marginal cost of the core loop ≈ **$0**.
- **Template messages** (anything outside the 24-h window — re-engagement
  nudges, match summaries) are paid per message, by category:
  utility ≈ AUD 0.03–0.10, marketing ≈ AUD 0.05–0.15 in AU `[VERIFY against
  the current AU rate card]`.
- Free tier: 1,000 service conversations/month historically free before the
  Nov-2024 change made service free entirely `[VERIFY]`.

### 4.5 Cost model — 10 / 100 / 1,000 active groups playing weekly (AU)

**Assumptions (state these whenever the numbers are quoted):**

- 6 players per group; 1 match per group per week; match runs ~7 days.
- Player→bot commands: user-initiated → free. Bot replies within 24-h window
  → free.
- Re-engagement: 30% of players each week go quiet >24 h mid-match and get
  **1 utility template** each.
- Growth/weekly-digest: **1 marketing template per player per month**.
- Rates: utility AUD 0.08, marketing AUD 0.12 per message (placeholders —
  re-run with the live rate card).
- No service-conversation charges (see §4.4 — if this reverses, see
  sensitivity note).

| Scale | Groups | Players | Utility nudges/wk | Utility AUD/wk | Marketing AUD/mo | **≈ AUD/month** |
|---|---|---|---|---|---|---|
| Pilot | 10 | 60 | 18 | 1.44 | 7.20 | **~13** |
| Early growth | 100 | 600 | 180 | 14.40 | 72.00 | **~130** |
| Scale | 1,000 | 6,000 | 1,800 | 144.00 | 720.00 | **~1,300** |

**Sensitivity — the fact that matters:** if service conversations were ever
re-priced (they cost roughly AUD 0.05–0.10 each before Nov 2024 `[VERIFY]`),
the model explodes: at ~15 bot messages per player-week and AUD 0.08/conversation,
10 groups ≈ AUD 72/week (~AUD 310/month) — **~25× worse**. The "service is
free" fact is load-bearing for the whole business model. **Verify it on the
live pricing page the week the pilot starts, and re-check quarterly.**

### 4.6 What breaks if we skip migration / verification

- whatsmeow ban on an external group = dead season, dead referrals, no
  appeal. Unfixable retroactively.
- Without business verification + templates: no re-engagement messaging
  (retention collapses — Lane 9's problem becomes ours), no legal cover, no
  throughput guarantees.

---

## 5. Slack app directory (the corporate-wellness front door)

All `[VERIFY]` — Slack's docs are a JS shell to our fetcher.

### Requirements

- **Scopes:** `commands` (slash commands), `chat:write` (+ `chat:write.public`
  or explicit bot invite per channel), interactivity (actions/shortcuts
  webhook), `users:read` (names/avatars), `channels:history` /
  `groups:history` if the bot reads group context `[VERIFY exact minimal set
  against current scope descriptions]`.
- **Distribution:** without directory listing, an app can be installed into a
  limited number of workspaces `[VERIFY current cap and unlisted-install
  behaviour]`. Directory listing requires Slack app review (app details,
  screenshots, support URLs, privacy policy, short demo).
- **Security review:** triggered by sensitive scopes and/or scale —
  organisation-wide/Enterprise Grid installs and certain permission sets
  require Slack's security review (questionnaire + evidence; commonly cited
  2–6 weeks) `[VERIFY triggers and SLA]`.
- **Enterprise Grid:** org-level installation needs admin approval and
  typically the security review above. For the corporate wellness pitch this
  is the real gate — IT/Security will not approve an unlisted app regardless
  of how good the demo is.

### Costs & lead times

| Item | Cost | Lead time |
|---|---|---|
| Slack app + directory listing | Free (Slack takes no cut) `[VERIFY]` | Review days–weeks `[VERIFY]` |
| Security review (if triggered) | Free | 2–6 weeks `[VERIFY]` |

### Blockers

- Privacy policy + support URL + data-handling answers must exist before
  review — same artefacts as §7, build once.

### What breaks if we skip

- Every corporate install becomes a manual, per-workspace configuration
  conversation with IT. At 10 corporate customers that's 10 bespoke
  integrations; the "wellness program you install in Slack" pitch dies.

---

## 6. Charity wager legal structure (AU) — questions for a lawyer

**This section frames questions. It answers nothing. No player money moves
until a written legal opinion exists.**

### 6.1 The mechanic as built

Players pledge contributions into a pot; the match winner **directs** the pot
to a charity of their choice; the winner receives **no value**. Company takes
no cut of the pot (revenue is B2B subscriptions, per docs 01/02).

### 6.2 Betting/gaming classification — the questions

Australian gambling law is **state-based** (each state/territory has its own
gaming/betting legislation). The classic test is consideration + chance (or
mixed chance/skill) + prize. Our working hypotheses, each to be tested per
state:

1. **Prize element:** does "winner directs the pot to charity, receives
   nothing" remove the prize element? Counter-argument to put to the lawyer:
   the *power to direct* a donation may itself be characterised as a benefit
   to the winner (philanthropic control / warm glow). How have regulators or
   courts treated "winner's choice" charity payouts? `[VERIFY — no answer
   assumed]`
2. **Skill vs chance:** the 300-format is effort/skill-based (reps completed),
   but handicap multipliers and closure timing introduce structure a regulator
   might argue contains chance elements. Does "predominantly skill" suffice in
   each state, and where does our format sit? `[VERIFY per state]`
3. **Trade-promotion permits:** if the activity is instead characterised as a
   prize competition run to promote a business, some states require permits
   even for skill-based competitions with entry consideration (NSW via NSW
   Fair Trading, ACT via Access Canberra; thresholds and exemptions vary)
   `[VERIFY current permit thresholds, fees, and whether skill-only
   competitions are exempt in each state]`.
4. **Interstate + online:** players in multiple states/Territories (and later
   countries) — whose law governs an online group game? Physical-presence
   nexus tests for online gaming `[VERIFY]`.

### 6.3 Fundraising-authority nexus — the questions

Soliciting/collecting money **for charity** is separately regulated from
gambling, by state fundraising authorities:

- NSW: charitable fundraising authority regime (Charitable Fundraising Act
  1991 — note: reform/replacement legislation has been in progress
  `[VERIFY current status]`) — NSW Fair Trading.
- VIC: fundraising registrations (Fundraising Act 1998) — Consumer Affairs
  Victoria.
- QLD: collections regime (Collections Act 1966) — Office of Fair Trading.
- SA/WA/TAS/NT/ACT: each has its own regime `[VERIFY current regulators and
  thresholds]`.

Questions for the lawyer:

1. If **we collect and remit** pot money, are we a "commercial fundraiser" /
   do we need authorities/notifications in each state where a contributing
   player sits? What are the fees/reporting obligations per state?
2. Does the nexus disappear if **players donate directly to the charity**
   (we never touch funds — the app only records pledges and links out)?
   This is the cheapest structure; what do we lose (escrow, enforcement of
   payment, pot "reality")?
3. Middle option: a charity-donation platform as merchant of record
   (GoFundraise-type) — does that shift the obligation, and what does it cost?
4. **ACNC:** the ACNC regulates charities, not fundraisers — confirm our only
   ACNC touchpoints are (a) verifying donees are ACNC-registered (public
   register check) and (b) not misrepresenting charity relationships
   `[VERIFY]`. No ACNC registration of our own is contemplated.

### 6.4 What likely keeps us OUTSIDE betting classification (hypotheses to test — not conclusions)

- No prize of value to the winner (winner directs, never receives).
- No house take, no vig, no odds-making by us.
- No cash-out, no secondary market, no transferable stakes.
- Stakes framed and processed as donations, not wagers.
- Outcome predominantly skill/effort.

### 6.5 What would BREAK it (design red lines until the opinion says otherwise)

- Any winner value: cash, credits, subscription discounts, goods, "charity OR
  prize" choice.
- The company taking a percentage of pots (reads as promoting betting for
  commission).
- Random draws / raffle mechanics anywhere near the pot (injects chance).
- Copy that says "bet", "wager", "win money", "stakes", "payout" in app,
  store metadata, or marketing (also poisons §2 review).
- Letting pots roll over between matches (accumulator feel).
- **Corporate pots funded by the EMPLOYER** (wellness incentive, no player
  consideration) may be a much cleaner structure — different analysis because
  players don't pay to play. Frame as a separate question; it may be the
  pilot-safe version of the mechanic.

### 6.6 Costs & lead times `[VERIFY all]`

| Item | Cost | Lead time |
|---|---|---|
| Written legal opinion (betting + fundraising, AU-wide) | AUD 3,000–10,000 | 2–6 weeks |
| State fundraising authority registrations (if needed) | ~AUD 100–500/state + reporting | Weeks per state |
| Trade-promotion permits (if characterised as competition) | ~AUD 100+/competition in permit states | Per-campaign |

### 6.7 What breaks if we skip

- Handling player money without structure = potential criminal exposure
  (unlicensed gaming/fundraising are offence-based regimes), platform
  de-listing (Apple 5.3.4 / Google gambling policies), and payment-processor
  termination. **This is the one area where skipping can end the company,
  not just the launch.**

---

## 7. Privacy

### Requirements

- **Privacy Act 1988 (Cth) + 13 APPs.** The small-business exemption (turnover
  ≤ AUD 3m) exists `[VERIFY current threshold]` but we should **comply from
  day one**: global ambitions, EU users possible, and both stores require
  privacy policies regardless. Decision: act as covered from PROTOTYPE.
- **Health data sensitivity:** exercise logs, rep counts, and especially HR
  data may qualify as health/sensitive information under the Privacy Act,
  requiring consent for collection (APP 3) `[VERIFY characterisation of
  fitness data]`. Consent flows at signup, not buried.
- **The on-device camera claim must be TRUE.** "No video leaves your device"
  is our best privacy story and our biggest liability if false. Audit:
  pose-estimation runs in-browser (WASM); frames never hit our servers;
  analytics/crash reporters must not capture frames or screenshots; any
  verification upload feature (Lane 7) must be opt-in and explicit. A false
  claim = ACCC misrepresentation exposure + store rejection.
- **Data inventory (build once, feed everywhere):** phone numbers (WhatsApp),
  Slack user/team IDs, email, rep counts/exercise logs, handicap tiers, HR
  data (Phase 3), charity preferences, payment references (via PSP only —
  never store card data).
- **Retention policy (APP 11):** define per class — e.g. raw HR 90 days then
  aggregates only; match history 24 months; deleted accounts purged in 30
  days `[VERIFY reasonableness with lawyer]`. Publish it; enforce it with a
  scheduled job, not good intentions.
- **Deletion on request (APP 12) + in-app account deletion (Apple 5.1.1(v))**
  — same endpoint.
- **Notifiable Data Breaches scheme** (OAIC): 30-day assessment / notification
  obligations if the Act applies `[VERIFY]`. Have an incident runbook before
  PILOT.
- **GDPR if global:** EU/UK players → lawful basis, records of processing,
  72-hour breach notification, transfer safeguards (choose hosting region
  deliberately; AU/US hosting of EU data needs SCCs or EU region `[VERIFY]`).

### Costs & lead times

| Item | Cost | Lead time |
|---|---|---|
| Privacy policy (drafted from data inventory, reviewed) | AUD 0 (template) – 2,000 (lawyer) | Days |
| Retention/deletion implementation | Engineering time | ~1 week |
| Incident runbook | Internal | Days |

### What breaks if we skip

- Store submissions fail (labels/policy required); a breach without basics =
  regulatory + reputational event; the on-device claim being false would be
  the single most damaging discovery a journalist or regulator could make
  about this product.

---

## 8. Costs table (all phases, AUD, indicative)

One-off / annual:

| Item | Cost | When | Source |
|---|---|---|---|
| Apple Developer Program | ~150/yr (USD 99) `[VERIFY]` | PUBLIC (buy at native start) | §2 |
| Google Play developer account | ~40 once (USD 25) `[VERIFY]` | PUBLIC | §3 |
| Meta business verification | Free | PILOT | §4 |
| Legal opinion (charity/betting) | 3,000–10,000 | PILOT (before any money) | §6 |
| Privacy policy review | 0–2,000 | PROTOTYPE (draft) / PILOT (review) | §7 |
| Domain (repswithfriends.au / .com) `[VERIFY availability]` | 20–100/yr | PROTOTYPE | — |
| Company/ABN (if not existing) | ~500–900 `[VERIFY]` | PILOT | — |

Recurring monthly:

| Item | PROTOTYPE | PILOT (10 groups) | PUBLIC (100 groups) | PUBLIC (1,000 groups) |
|---|---|---|---|---|
| Hosting (API + PWA + DB) | 0–20 | 20–50 | 50–150 | 150–500 `[VERIFY]` |
| WhatsApp templates (§4.5) | 0 (whatsmeow) | ~13 | ~130 | ~1,300 |
| Slack | 0 | 0 | 0 | 0 |
| Monitoring (uptime + Sentry-class) | 0 (free tiers) | ~20 | ~50 | ~100 `[VERIFY]` |
| **≈ Total/month** | **~0–40** | **~55–85** | **~230–330** | **~1,550–1,900** |

Reading: infrastructure is never the constraint. **WhatsApp template spend and
the legal opinion are the only material line items**, and both are gated by
decisions, not by growth itself.

---

## 9. Sequenced checklist — one page

### NOW (PROTOTYPE — nothing below is a blocker; all of it is cheap)

- [ ] Draft privacy policy from the data inventory (§7) — needed by every
      later gate; draft costs nothing.
- [ ] Audit the on-device camera claim end-to-end (analytics, crash reporter,
      any upload path) — make the claim true or remove it.
- [ ] Keep whatsmeow on a **disposable, company-owned number**; never add an
      external group to it (§4.1 migration trigger).
- [ ] Purge "bet/wager/stake/payout" vocabulary from all copy and metadata
      (§6.5) — costs nothing now, prevents review poison later.
- [ ] Design pot-payment UX as **web-only** (outside any future native app)
      per Apple 3.2.2(iv).
- [ ] Buy the domain(s).

### AT PILOT TRIGGER (first external group / first corporate Slack trial)

- [ ] Start Meta business verification + dedicated number cutover (1–2 weeks;
      §4.2). **Do not onboard external groups until Cloud API is live.**
- [ ] **Confirm Cloud API group-messaging status** (§4.3) — decides the pilot
      architecture (group bot vs per-player DMs).
- [ ] Verify the live WhatsApp rate card; re-run §4.5 model; set a template
      budget alert.
- [ ] Commission the legal opinion (§6) — brief the lawyer with §6.2/§6.3
      questions verbatim. **No player money until it lands.** Interim: pots
      are pledge-only or company/employer-funded.
- [ ] Slack: app details, privacy policy, support URL → submit for directory
      review (§5); start security-review questionnaire if corporate target
      uses Enterprise Grid.
- [ ] Retention/deletion job + account-deletion endpoint live (§7).
- [ ] Incident runbook written (§7).

### AT PUBLIC TRIGGER (store submission, when Phase 3 native work starts)

- [ ] Apple org developer account + DUNS; privacy labels from the data
      inventory; account deletion in-app; HealthKit purpose strings; pot
      money strictly outside the app (§2).
- [ ] Google org account; Health Connect permission declaration + demo video
      (start FIRST — longest lead time); data safety form (§3).
- [ ] Legal opinion implemented: pot structure, permits/authorities per state,
      red lines enforced in product (§6).
- [ ] Re-verify every `[VERIFY]` in this doc against live official pages —
      platform pricing/policies move quarterly.
- [ ] Load test the bot at 100-group message volume before listing anywhere.

### Standing rules

1. whatsmeow never touches an external group. 2. No player money without the
legal opinion. 3. One data inventory feeds privacy policy + Apple labels +
Play data safety + Slack review. 4. Re-check WhatsApp pricing quarterly.

---

*Research pass 2026-08-26. Apple guidelines verified live (page dated
2026-06-08). All other platform/legal specifics `[VERIFY]` before reliance.
This document prepares questions for qualified AU legal counsel; it is not
legal, tax, or fundraising advice.*
