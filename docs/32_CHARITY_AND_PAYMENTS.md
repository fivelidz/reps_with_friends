# 32 — The Charity/Prize System & The Store Payment Architecture

*Research date: 2026-09-10. Trigger: founder — "figure out how the charity system
or the prize for each player should be selected and conceived. Also how payment
should be made on the Play Store or Apple Store." Companions: docs/08 §6 (the
legal questions — this doc does not replace a lawyer), docs/15 L1/L2 (blockers),
docs/30 (iOS ladder — 3.2.2(iv) load-bearing), SOT §3.7/§3.8/§3.16/§4.15
(design/references/90e253a1…pdf), docs/31.*

---

## TL;DR — the two answers

1. **The mechanic:** keep **winner-directs** as the spine (it's built, it's the
   dopamine moment, and it's the legally cleanest shape), then upgrade it once:
   **every player nominates their own charity at join — the winner's role becomes
   "the crew plays for MY cause"**. Winner-directs alone goes hollow when the
   winner has no connection to any charity; nomination fixes that by moving the
   cold choice to onboarding and giving every player a stake in every season.
   Wrap it in **impact cards** (already half-built) as the retention/viral layer.
   Crew-vote, rotation and matching are variants for specific modes, not the core.
2. **The payments:** **charity money never moves through either store, ever.**
   Apple bans in-app charity collection outright for non-nonprofits (3.2.2(iv));
   Google excludes donations from Play Billing (§3.2) and charges no fee on them,
   but our winner-directs + fee field reads gambling-adjacent — so one web-only
   money path on ALL platforms (Stripe AU, ~1.7% + 30¢). **Points stay earn-only
   at launch** (no IAP anywhere). Pro subscription rides store billing when it
   ships (15% tiers both stores today; Google's new fee structure live in
   US/EEA/UK since 30 Jun 2026). Reps Kits are physical goods — stores don't
   want that money and both policies say so explicitly.

Everything real-money below is **gated on the L1 legal opinion (docs/15)**. Until
it lands: points only, or employer-funded pots (the cleanest structure).

---

# PART 1 — How the charity/prize is selected and conceived

## 1.0 The frame: what the Charity Pot IS

The SOT is precise: *players contribute; the winner does not receive cash and
instead chooses which eligible charity receives the pot* (SOT §3.7, glossary).
That inversion is the product. A normal bet pays the winner; ours makes the
**victory itself the currency** — winning buys you the right to direct the
crew's money. That's why it can sit in a fitness app without becoming a gambling
product, and why every mechanic below must be judged on one axis: **does it
sharpen or dilute the winner's moment of directing?**

The SOT gives us the feature shelf (§3.8): eligible-charity choosing,
nomination-subject-to-approval, group contribution, company matching, platform-fee
disclosure, donation receipt, impact card, corporate PR share, charity season
history. The current build has: pot in points with agreement gating, winner-only
`designateCharity`, disclosed fee field (0% real take — trial currency), receipt
in the feed, impact/chooser overlays (apps/sot-engine.js `charity*`, apps/sot/app.js).

## 1.1 Winner-directs (current) — KEEP, it's the spine

**Pros.** Zero coordination cost (one decision, one person); the single biggest
dopamine moment in the game gets *bigger*, not side-tracked ("you didn't just win
— you got to give away the crew's money"); legally the cleanest shape (no vote, no
negotiation, no "losers fund a thing they didn't choose" grievance); already built
end-to-end including receipt and share card.

**Cons — when it feels hollow.** Be honest about the four hollow cases:

1. **Choice paralysis.** The winner has no personal connection to any charity,
   freezes, and picks whatever's top of the list. The "moment" becomes a chore
   five seconds after the confetti. *(Fix: nomination — §1.3.)*
2. **Small pots read performative.** Five friends × $10 = $50. Nobody believes
   $50 changed anything, so the gesture feels like theatre. *(Fix: don't chase
   bigger pots — chase a real return loop: impact card + "where it went" nudge
   weeks later, §1.5. Small + real beats big + forgotten.)*
3. **Unrecognisable list.** A charity nobody in the crew has heard of might as
   well be a random string. *(Fix: curate a tight list of names people KNOW —
   local shops of giving: Beyond Blue, RSPCA, Starlight, a local footy club's
   foundation — plus the nomination queue.)*
4. **No loop back.** The feed says "receipt #1042" and the story ends. *(Fix:
   the follow-up nudge — §1.5. The second beat is what makes the first beat
   feel true.)*

**Verdict: keep. It is the game.** The additions below exist to fix its hollow
cases, not to replace it.

## 1.2 Crew-vote charity — DEFER to corporate mode

Everyone votes on the pot's destination at season end; the group owns the giving.

**Pros:** social glue; the vote is chat-native (a poll in the crew chat is free
viral surface); no single winner carries the choice; pre-commits buy-in.

**Cons:** it **dilutes the winner moment** — the season's whole narrative
resolves into a committee decision exactly when the trophy should land; ties and
low turnout are awkward; and value-voting inside a friend group surfaces real
friction ("we voted down Marco's hospice"). That friction is unacceptable as a
default and manageable as a **corporate feature**, where the shortlist comes from
the employer's CSR team and voting is the *feature* (engagement + a report line
for HR).

**Verdict: not the default. LAUNCH for corporate mode** (employer-supplied
shortlist + crew vote + report card). Home crews keep winner-directs.

## 1.3 Personal charity profile — THE one addition (launch spine)

Each player nominates **their** charity at join (subject to approval, per SOT
§3.8). When you win, the pot goes to your cause. The winner is no longer a
chooser with four seconds of paralysis — **the winner is a champion**.

**Why this is the strongest upgrade:**

- **It fixes hollowness #1 at the root.** The choice moves from the heat of
  victory (paralysing) to onboarding (cold, considered, identity-forming).
- **Everyone gets skin in the game, all season.** Standings read "Jess 412 ·
  plays for Beyond Blue". Losing to someone now has a second layer: their cause
  banks your pot. Rematches get narrative.
- **It keeps the legal shape intact.** Still winner-directs — the nomination is
  just a pre-registered direction. No new money flows, no new consent problem.
- **Cheap to build:** a `nominatedCharityId` on the player + an approval queue.
  The approval burden that SOT §3.8 flags is defused by an **ACNC public-register
  auto-check** (charity exists + registered → auto-approve; else human review).
  `[VERIFY ACNC API/charity register bulk access at build time]`
- **The onboarding investment is real.** Choosing a cause on day one is a
  commitment device — it costs the user a little and buys retention.

**Caveats:** mid-season joiners nominate but wait for next season's pot; a
charity must still pass the eligible list (no political/religious campaigning
orgs, no unregistered orgs); allow "no preference" (fallback = crew default).

**Verdict: BUILD for launch — this is the founder's "prize for each player".**
Pilot gets the schema + free-text field now so seasons accrue the data.

## 1.4 Rotation / round-robin — NO (as core)

Each season, a different player's charity gets the pot — fairness over drama.

**The design problem:** fairness is the enemy of stakes. If the destination is a
schedule, the winner no longer directs anything — the *season stopped deciding
something*. The prize decays into a rota. Winner-directs' entire meaning is that
**the season's outcome chose**; rotation tells the winner "your victory picked
nothing, it was your turn."

**Where a rotation IS right:** brand-level community seasons (a monthly
community pot whose destination rotates or is voted publicly — marketing, not
core loop). **Verdict: LATER, community/major seasons only.**

## 1.5 Impact cards + streaks — PILOT (the one thing added now)

Charity impact as progression content: lifetime-directed totals, "seasons
played for <cause>", shareable impact cards (already built — `charityDone`
overlay), charity season history (SOT §3.8 shelf).

- **The non-winner's loop:** in plain winner-directs, if you never win, charity
  seasons cost you $10 and give you nothing. Lifetime-given/gived-with stats
  fix that: **every contributor compounds their own impact number even when
  they lose.** This is the retention hook that makes the pot sustainable.
- **The viral hook:** impact card shares (founder's Instagram moment) with the
  charity tagged = organic reach + the corporate PR share the SOT wants.
- **The follow-up nudge (build for launch):** 2–4 weeks after settlement, the
  crew gets one message: "Your $63 became [what the charity does with ~$63]".
  The second beat is what makes the first beat feel true — this is the single
  cheapest fix for hollowness #2/#4.
- **The red line:** **never rank players by amount given.** A donation
  leaderboard re-creates "pay to win the giving game" optics and reframes
  contributions as entries (bad for both the fundraising-law analysis in
  docs/08 §6.5 and basic decency). Rank by **seasons participated**; show
  amounts as crew totals, not player comparisons.

**Verdict: PILOT.** Crew impact line + share card now; follow-up nudge at launch.

## 1.6 Company matching — PILOT-LITE as a pledge, LATER as money

Employer matches or funds the pot (SOT §3.8 "company matching").

- **The legal gift hiding in plain sight:** docs/08 §6.5 already flags that
  **employer-funded pots are the cleanest structure** — players pay nothing to
  enter, so the "consideration" leg of the gambling test collapses. If the
  legal opinion blesses one real-money shape first, it's this one.
- **The corporate sell:** wellness + CSR in one invoice. Matches turn a $50 pot
  into $150 and make impact cards genuinely meaningful. This is the wedge for
  the B2B tier (docs/02).
- **The plumbing rule:** matching money should move **employer → charity
  directly** (or via the charity platform, §2.6 Option C). We must not become
  the conduit for the employer's charitable funds — same never-touch rule as
  player money.
- **PILOT-LITE:** build the *pledge* as a non-money feature now — a creator/
  employer attaches "Company X matches this pot" to a season; settlement stays
  outside us. The flag costs a weekend and makes every corporate demo instantly
  concrete.

**Verdict: pilot the pledge flag; money matches at corporate launch.**

## 1.7 Personal stakes × charity — coexist, but never stack

Should the Dinner/Dare/Deliverable stakes and the Charity Pot coexist in one
season? Recommendation: **one money-like stake per season (the current four-way
choice stays), no stacking — but let the non-money stakes live alongside
naturally.**

- Stacking charity + dare in one season creates "the dare is the real game, the
  charity is decoration" — it cheapens both. The SOT already defers side bets
  (§3.7) for exactly this tidiness.
- The social pair that *does* work: **Dinner seasons where the crew also has a
  charity pot** — but as two separate, separately-agreed decisions (the
  agreement gate already supports this). Loser shouts dinner; the pot still
  goes to the winner's cause. Different ledgers, different emotions.
- Note the asymmetry that keeps charity clean: in Dinner/Dare the **loser**
  pays the **winner**; in Charity Pot **everyone** contributes and **nobody**
  receives. That asymmetry is load-bearing for the not-gambling analysis
  (docs/08 §6.4) — never blur it (no "loser pays extra into the pot", no
  "winner gets the pot if the charity's closed" — refunds are refund-only,
  SOT §5 MISSING item on refund rules is a launch-table item).

## 1.8 The phased set (recommendation)

| Phase | Charity/prize build | Real money? |
|---|---|---|
| **PILOT (now)** | Current winner-directs (points) + **personal nomination field** (free-text, ACNC auto-check stub) + **crew impact line & share card** + **match-pledge flag**. Charity list = 8–12 recognisable Australian charities, curated by hand. | **No** — points only. Exception: employer-funded pilot pots *after* the L1 legal opinion (docs/08 §6.5). |
| **LAUNCH** | Nomination as the join-flow step (approved list + nominations queue), winner **dedication line** ("for Dad"), **follow-up impact nudge** (2–4 wk), **corporate mode** = employer shortlist + crew vote + report card, charity-season history, settlement via **charity platform** (§2.6 Option C). | Yes — web-settled pots, employer matches, all outside stores. Fee 0% while opinion is fresh; any later fee disclosed and charged on top (§2.7). |
| **LATER** | Split pots (winner splits across 2–3 causes), community/major seasons with public vote or rotation, sponsored match pools, DGR receipt passthrough, international charity rails per-market. | Only per-market legal review. |

---

# PART 2 — Payment architecture per platform

**The prime directive (adopted, docs/30 §3):** charity money never moves through
the App Store or Google Play — not as IAP, not as a webview checkout inside the
native app, not through any in-app call-to-action that Apple/Google could read
as in-app collection. One money path: **the web**.

## 2.1 The web/PWA path (today)

Unrestricted by store rules — we're a PWA on rwf.qalarc.com; store policies
simply don't reach us. What applies is ordinary AU law (§2.5) and Stripe's
rules.

- **Rails:** Stripe Payment Links (no-code, free — the pilot answer) or Stripe
  Checkout embedded/redirect (still included in standard pricing, no extra fee
  beyond processing). **Stripe AU standard fees (fetched 2026-09-10):**
  domestic cards **1.7% + A$0.30** (GST incl.), international **3.5% + A$0.30**,
  +2% currency conversion; PayTo/BECS direct debit **1% + A$0.30** (A$3.50 cap);
  disputes A$25. Note: Stripe's announced **lower AU card pricing from
  1 Oct 2026 (domestic) / 1 Apr 2027 (international)**.
  Source: stripe.com/au/pricing.
- **The flow (contribute at season start):** crew agrees stake → each
  contributor taps through to a Payment Link (season-tagged, amount preset)
  → the app records "pledged ✅ / paid ✅" per player → season plays → winner
  directs → settlement per §2.6.
- **Escrow vs direct-at-close:** see §2.6 — recommendation is **never hold**
  (Option B/C), which also means we never touch refunds (charity's own refund
  policy applies) — this answers SOT §5's "contribution refund rules" MISSING
  item by design.
- **Receipts:** our receipt is a **contribution receipt** (proof of payment,
  receipt number in the feed — built). It is **not a tax-deductible-donation
  receipt** unless the money went DGR-direct (§2.5). DGR receipts come from the
  charity/platform, never from us.

## 2.2 Google Play

*Sources: Payments policy (support.google.com/googleplay/android-developer/
answer/9858738) and Service fees (…/answer/112622), both fetched 2026-09-10.*

**Donations.** Play Billing **must not be used** for "tax exempt donations"
(Payments policy §3.2 — same list as peer-to-peer payments and auctions). There
is **no Play commission on donations** precisely because Play Billing isn't in
the loop. And §4's ban on steering users to other payment methods is carved out
"other than the conditions described in Section 3" — so a donation flow outside
Play Billing is policy-legal on Android. **BUT we still keep pots web-only on
Android**, for three reasons: (a) our contribution buys participation in a
winner-directs game — whether it's a "tax exempt donation" at all is exactly
what the L1 legal opinion must say (if it isn't, the §3.2 carve-out doesn't
cover it); (b) a reviewer reading "contribute money → winner directs" inside a
game can pull the Real-Money Gambling lens (Play gambling policy,
…/answer/9877032; docs/08 §2 metadata warning); (c) one money path on all
platforms is cheaper to keep compliant than two.

**Points (if/when purchasable — digital currency):** "virtual currencies" are
the first example in Payments §2 — **Play Billing is mandatory**, no web-link
steering (§4), and §5: currencies bought in-app **must only be usable inside
that app** (ours already are). Loot-box odds disclosure if purchasable packs
include drafted cards (§7 — same as Apple).

**Fees (fetched 2026-09-10 — note Google's fee regime CHANGED 30 Jun 2026):**

| Market | Structure today |
|---|---|
| **AU** (and all markets not yet migrated) | **15% on first US$1M/yr** earnings (15% tier), **30% above**; **auto-renewing subscriptions 15% flat** regardless of revenue; 15%-or-lower media programs. `[VERIFY AU migration date to the new structure]` |
| **US / EEA / UK** (live since **30 Jun 2026**) | Install-cohort model: **subscriptions 10% + 5% billing fee** (all installs); **other transactions 20% + 5%** for NEW installs (25% for pre-30-Jun-2026 installs); external **web links carry 20%** (15% under the Level Up/Experience programs). |
| Alternative billing | Korea/India: service fee minus 4% under enrolled programs; EEA/US/UK external-link programs per §8/§9 — enrolled, region-scoped. |

Practical read for us: at launch scale (<US$1M/yr) a Pro subscription costs
**15% on Google today in AU**; if we ever enable web links for digital goods in
the US/EEA/UK they are **not free** (20%/15%) — factor that before believing
"link out and dodge the fee".

**Subscriptions (Pro):** auto-renewables via Play Billing, Play-console product
setup (one-time vs sub products), pricing transparency (§6 — in-app price must
match the listing).

## 2.3 Apple

*Sources: App Review Guidelines (developer.apple.com/app-store/review/
guidelines/, "Last Updated: June 8, 2026", fetched 2026-09-10); Apple Pay for
Donations (developer.apple.com/apple-pay/nonprofits/), fetched 2026-09-10.*

**3.2.2(iv) — exact current text:**

> "Unless you are an approved nonprofit or otherwise permitted under Section
> 3.2.1 (vi) above, collecting funds within the app for charities and
> fundraisers. **Apps that seek to raise money for such causes must be free on
> the App Store and may only collect funds outside of the app, such as via
> Safari or SMS.**"

Meaning, operationally: we (qalarc Pty Ltd / Narwhal Ent Pty Ltd — for-profits)
may **not** collect charity money inside an App Store app, full stop. Collection
in **Safari** (or the PWA, or an external browser session) is the sanctioned
route — exactly our architecture. The app must be **free** on the store (it is).

**The approved nonprofit route — closed for us, open for our charities.**
Guideline 3.2.1(vi) lets *approved nonprofits* fundraise in-app (their own or
third-party apps) with Apple Pay, disclosures, and tax receipts; "nonprofit
platforms that connect donors to other nonprofits must ensure that every
nonprofit listed in the app has also gone through the nonprofit approval
process." The Apple Pay Donations page: US nonprofits need a Candid Seal of
Transparency; **non-US nonprofits are approved through Benevity**; Apple charges
**no fees or commission** on Apple Pay. We will never be the approved party —
but the **charities on our eligible list** can be. A future "donate direct to
the winner's charity via Apple Pay" experience belongs to the *charity's* app
or web, not ours. `[VERIFY whether a Benevity-style approved-platform
partnership could one day cover RWF's flow — treat as no until in writing]`

**Points (if/when purchasable):** 3.1.1 lists "in-game currencies" verbatim —
**IAP mandatory**, own payment mechanisms banned. Currency **may not expire**
(ours don't) and a restore mechanism is required. Loot-box odds disclosure
mirrors Play §7. Commission: **30% standard / 15% after a subscriber's first
year** for autos; **App Store Small Business Program = 15% from dollar one**
for developers ≤US$1M/yr (enrollment required)
`[VERIFY enrollment eligibility when we ship IAP]`.

**External-link entitlements (the post-Epic rules, as written 8 Jun 2026):**
3.1.1(a) — apps in **specific regions** may take a StoreKit External Purchase
Link Entitlement to link to the developer's own website for digital purchases;
in all storefronts **except the United States**, digital-goods CTAs must not
bypass IAP (entitlement-gated); **on the US storefront the entitlement is not
required** — buttons/links out are allowed. For us: until RWF has digital goods
worth selling (§2.4 says it won't at launch), this entire regime is irrelevant —
and note **Australia is not a carve-out region** `[VERIFY current entitlement
storefront list before ever relying on it]`.

**Physical goods:** 3.1.3(e) — apps selling physical goods/services consumed
outside the app **must NOT use IAP** ("you must use purchase methods other than
in-app purchase… such as Apple Pay or traditional credit card entry"). Reps
Kits = web checkout, always.

**Enterprise seats:** 3.1.3(c) — apps sold **directly to organisations** for
their employees may let enterprise users access purchased content without IAP;
consumer sales must use IAP. This is how corporate seats ride without an Apple
tax; consumer Pro does not get this treatment.

**Also load-bearing:** 5.3.4 (real-money gaming needs licensing + geo + free
app) and 5.3.3 (no IAP currency redeemable in real-money gaming) — the reason
points must **never** be convertible to anything prize-like (docs/08 §6.5).
1.4.5 (don't urge bets risking harm) — dare copy discipline.

## 2.4 The compliant hybrid — every money flow mapped

| # | Flow | Platform surface | Mechanism | Rule that decides | Fee |
|---|---|---|---|---|---|
| F1 | **Charity pot contributions** | PWA/web + external browser from any app | Stripe Payment Links / Checkout → settlement per §2.6 | Apple 3.2.2(iv) (banned in-app); Play §3.2/§4 (excluded from billing, and we don't tempt the gambling lens) | Stripe ~1.7%+30¢; stores 0% |
| F2 | **Platform fee on pots** | Same web flow only | Disclosed, charged on top, deducted at settlement | SOT §3.16; consumer-law disclosure; NEVER route through stores (would break Apple 3.2.2(iv) and the Play donation carve-out) | Revenue to us, not a store |
| F3 | **Points** | **Earn-only at launch — no purchase surface anywhere** | — | Keeps us out of Apple 3.1.1 / Play §2 entirely; also Apple 3.1.3(b): if web-purchasable, consumables must ALSO be IAP in-app — double rails before we're ready | 0% (nothing sold) |
| F4 | **Pro subscription (consumer)** | PWA: Stripe Billing. Native iOS: IAP auto-renewable. Native Android: Play Billing subscription | Store product setup both stores when native ships | Apple 3.1.1/3.1.2; Play §2 | AU today: 15% first US$1M (Apple SBP) / 15% flat (Google). US/EEA/UK Google: 10%+5% since 30 Jun 2026 |
| F5 | **Corporate/Teams seats** | Direct B2B invoicing (Stripe Invoicing); app consumes entitlement | Sold to the org, not the consumer | Apple 3.1.3(c) enterprise; Play §2 read with enterprise contracting `[VERIFY Google's enterprise-contract position at ship]` | Stripe ~0.7% Billing pay-as-you-go |
| F6 | **Reps Kits / merch (physical)** | Web only | Stripe + Apple Pay/Google Pay on web | Apple 3.1.3(e) and Play §3.1 both **mandate** non-store payment for physical goods | Stripe only |

Points stay earn-only → F3 is the entire reason the store compliance surface at
launch is **just F4 (and F4 only if/when native ships)**. That is a deliberate
gift to ourselves.

## 2.5 The AU legal frame (what we must satisfy regardless of platform)

*(Frames questions for the L1 legal opinion — it answers none of them. docs/08
§6 remains the questionnaire; this section is the architecture's legal map.)*

- **Fundraising-authority nexus, state by state.** Soliciting/collecting for
  charity is regulated per state: NSW (Charitable Fundraising Act 1991 — NSW
  Fair Trading; replacement reform in progress `[VERIFY]`), VIC (Fundraising
  Act 1998 — Consumer Affairs Victoria), QLD (Collections Act 1966 — OFT),
  SA/WA/TAS/NT/ACT own regimes `[VERIFY current regulators/thresholds]`. The
  architecture's job is to **make the nexus question small**: if we never hold
  funds (§2.6 B/C) and the donor's money moves payer→charity (or
  payer→platform→charity), our activity looks like promotion and record-keeping,
  not fundraising — which is precisely the question the opinion must confirm.
- **ACNC + DGR.** The ACNC registers charities; it does not register us, and we
  must never imply otherwise. **Tax-deductible receipts exist only for gifts to
  DGR-endorsed organisations** (ACNC DGR topic guide; ATO gifts rules: must be a
  true gift — voluntary, no material benefit to the donor — to a DGR at the time
  of the gift, $2+ `[VERIFY threshold wording]`). Two consequences: (1) a pot
  contribution that buys you into a game is **very unlikely to be a tax-deductible
  gift** — our receipts must never claim deductibility; (2) DGR receipts are
  issued by the charity/platform, and our UI must present them as coming from
  there. Donee verification = ACNC public register + DGR status flag in the
  eligible-charity record.
- **Platform-fee disclosure.** SOT §3.16/§4.15 require the fee shown at
  contribute time (built — the wizard shows it). Keep the promise mechanically:
  the fee is a separate line at settlement, charged on top, named ("RWF platform
  fee"), never netted silently from the donation.
- **The gambling lens (docs/08 §6.2/§6.4) — the standing red lines:** no winner
  value, no house take *of the wager*, no chance elements added, no rollover
  accumulators, no "bet/wager/win" language anywhere including store metadata.
  The winner-directs design is the moat; §1.7's asymmetry rule protects it.
- **The blocker:** L1 written legal opinion (betting + fundraising, AU-wide),
  AUD 3–10k, 2–6 weeks (docs/08 §6.6, docs/15 L1). **No real player money moves
  before it lands.** Employer-funded pots are the pre-approved interim
  candidate (§1.6).

## 2.6 Money-flow diagrams — who holds funds at each step

**Option A — ESCROW (we hold). NOT recommended; shown for completeness.**

```
PILOT-VIEW: contribution → hold → close → charity   (Option A: ESCROW)

 Player1 ─$10─►┐
 Player2 ─$10─►┤   ┌─────────────────────────────┐
 Player3 ─$10─►┼──►│  STRIPE (qalarc account)     │
 Player4 ─$10─►┤   │  balance = pot ($40)         │
 Player5 ─$10─►┘   │  WE HOLD CLIENT MONEY        │
                   └──────────────┬──────────────┘
                    season plays  │  (weeks: our liability,
                                  │   refund requests, GST on fee,
                    winner directs │   trust-account questions)
                                  ▼
                   ┌─────────────────────────────┐
                   │ settle: fee −$2 (5%)         │
                   │ payout $38 ────────────────► CHARITY
                   │ receipts: ours (+risk)       │
                   └─────────────────────────────┘

 WHO HOLDS: qalarc Pty Ltd holds the pot for the season's duration.
 EXPOSURE: fundraising-authority nexus at its STRONGEST (we solicit AND
 collect AND remit), trust/Client-money treatment, refund & insolvency
 risk, GST on the fee. Needs the most legal opinion, the most reporting.
```

**Option B — DIRECT-AT-CLOSE (we never touch it). Pilot-safe shape.**

```
 Option B: PLEDGE NOW, PAY THE CHARITY AT CLOSE (honor rails)

 Player1 ─ pledge ──► app records "pledged $10"     (no money moves)
 Player2 ─ pledge ──►        "pledged $10"
   ...
   season plays (money never existed on our side)
   winner directs ──► app generates per-player payment links
                      ─► EACH PLAYER pays THE CHARITY DIRECTLY
                         (charity's own donate page / DGR channel)
                                │
                                ▼
                      charity bank account
                      charity issues DGR receipts
                      players mark "paid ✅" in app (self-attested)

 WHO HOLDS: only the charity, ever. WE HOLD NOTHING — at any step.
 EXPOSURE: smallest legal surface (we promote + record); BUT the pot is
 soft — a pledge can go unpaid (no escrow teeth). Fix the vibe, not the
 enforcement: public pot progress, "paid" chips, crew social pressure.
 This is the PILOT answer for real money (post-opinion), because the
 opinion's hardest questions (holding funds, state nexus) mostly vanish.
```

**Option C — CHARITY PLATFORM as merchant of record. The launch target.**

```
 Option C: PLATFORM-MEDIATED (GoFundraise / Good2Give / GiveEasy / Benevity-style)

 Player1 ─$10─►┐
 Player2 ─$10─►┤    ┌──────────────────────────┐        ┌──────────────┐
 Player3 ─$10─►┼───►│ CHARITY PLATFORM          │───────►│ CHARITY      │
 Player4 ─$10─►┤    │ (merchant of record)      │ payout │ (ACNC + DGR) │
 Player5 ─$10─►┘    │ holds + disperses +       │        └──────────────┘
                    │ issues DGR receipts       │  receipts issued BY platform/
                    └──────────────────────────┘   charity → surfaced in our app
                          ▲
                          │ our API: season id, amount, winner-directed donee
                          │ (we integrate; we never take custody)
                     RWF APP (records pledges, pot, direction, receipt #s)

 WHO HOLDS: the platform (regulated, insured, receipts their job), then the
 charity. WE HOLD NOTHING.
 EXPOSURE: platform fees (~3–6% typical `[VERIFY per-platform rate sheets at
 procurement]`) on top of Stripe — the price of outsourced compliance.
 Corporate matching plugs in here natively (employer pays the platform).
 THIS is the launch settlement rail, and the SOT §3.8 "eligible charity
 source" MISSING item resolves to the platform's charity catalogue.
```

## 2.7 The fee, honestly

Keep the fee **0% at pilot** (points anyway). At launch, if the opinion blesses
a fee: charge it **on top** (player sees contribution + "platform fee" line,
both at contribute time and at settlement), never as a silent skim, and never
inside a store flow. If the opinion balks at any fee on pots: fee = 0% forever,
revenue stays 100% subscriptions/B2B (docs/08 §6.1 already prefers this) — the
product survives either answer; the doc's architecture doesn't change.

---

# The recommended architecture — one page

**What we build for pilot NOW (points, no real money):**

1. Charity Pot stays winner-directs — untouched engine (`designateCharity`,
   winner-only, agreement-gated).
2. **Personal charity nomination** at join: `nominatedCharityId` on the player,
   free-text + curated-list pick, ACNC-register auto-check stub, "no
   preference" fallback. The winner-directs moment becomes "play for my cause".
3. **Crew impact line** on the season recap + shareable impact card (mostly
   built) — lifetime directed total per crew and per player; ranked by
   participation, never by amount.
4. **Match-pledge flag** on seasons (non-money; employer attaches a pledge).
5. Wizard copy discipline: "contribute", "direct", "cause" — never bet/wager/
   win (docs/08 §6.5; also poisons store review, docs/08 §2).

**What NEVER goes through the stores (permanent rule):**

- Charity pot contributions and settlements (Apple 3.2.2(iv); Play §3.2/§4 + gambling-lens caution).
- The platform fee on pots (would break both carve-outs).
- Reps Kits/merch (both stores *mandate* external payment for physical goods).

**What rides store billing, WHEN native ships:**

- Pro subscription: IAP on iOS, Play Billing on Android. 15% AU today
  (Apple SBP / Google 15% tier); 10%+5% Google subscriptions in US/EEA/UK since
  30 Jun 2026.
- Corporate seats: B2B invoiced direct (Apple 3.1.3(c) enterprise).
- Points: **earn-only through launch**; if ever sold, Play Billing/IAP with
  odds disclosure — and never convertible to anything prize-like (5.3.3).

**Settlement rails (real money, post-opinion):** pilot = Option B
(direct-to-charity at close, honor rails, employer-funded pots first);
launch = Option C (charity platform as merchant of record, DGR receipts
passthrough). We hold funds **never** (Option A is the shape we avoid).

**Gates:** L1 legal opinion before any player-funded pot. Privacy policy + data
inventory (docs/15 L3) before store submissions. ACNC register check before any
charity enters the eligible list.

---

# The founder's decision list

| # | Decision | Recommendation | Notes |
|---|---|---|---|
| 1 | Keep winner-directs as THE mechanic? | **Yes** | Built, cleanest, the dopamine moment. Don't dilute with default votes. |
| 2 | Add personal charity nomination at join? | **Yes — the one upgrade** | Winner becomes champion; fixes choice paralysis; ACNC auto-check makes approval cheap. |
| 3 | Charity money via stores — ever? | **Never (write it down as a product law)** | Apple 3.2.2(iv) bans it; Play carve-out too risky to lean on. |
| 4 | Points purchasable at launch? | **No — earn-only** | Avoids 3.1.1/Play §2 + 3.1.3(b) double-rail until it pays for itself. |
| 5 | Fund the L1 legal opinion now (AUD 3–10k)? | **Yes, this quarter** | Everything real-money is gated on it (docs/15 L1). Employer-funded pots first. |
| 6 | Settlement model for launch | **Option C (charity platform)**; pilot Option B | We never hold funds; DGR receipts outsourced; ~3–6% platform cost `[VERIFY]`. |
| 7 | Platform fee on pots | **0% at pilot; launch = opinion-dependent, on-top & disclosed** | If fee blocked: 0% forever, revenue = subs/B2B. Product survives either way. |
| 8 | Crew-vote charity | **Corporate mode only at launch** | Employer curates shortlist; home crews keep winner-directs. |
| 9 | Donation leaderboard? | **No — never** | Rank by participation. Amounts as crew totals. (Law optics + decency.) |
| 10 | Stakes stacking (charity + dare one season) | **Separate decisions only** | Agreement gate supports it; never one bundled "entry". |
| 11 | Who approves eligible charities? | **Ops runbook + ACNC auto-check; human review on flags** | 8–12 recognisable AU charities to start; DGR flag per charity. |
| 12 | Impact card sharing default | **Opt-in at share time, charity tagged** | Viral surface without auto-posting anyone's giving. |

---

## Sources (all fetched 2026-09-10 unless noted)

- Apple App Review Guidelines — 3.1.1, 3.1.1(a), 3.1.2, 3.1.3(b)(c)(e), 3.2.1(vi)(vii), 3.2.2(iv), 5.3.3, 5.3.4, 1.4.5 ("Last Updated June 8, 2026"): https://developer.apple.com/app-store/review/guidelines/
- Apple Pay for Donations (no Apple fees; Candid Seal US; Benevity non-US): https://developer.apple.com/apple-pay/nonprofits/
- Google Play Payments policy (§2 billing-required incl. virtual currencies; §3.1 physical; §3.2 tax-exempt donations excluded; §4 no steering; §5 currency scope; §7 odds; §8/§9 alternative/external programs): https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play Service fees (15%/US$1M/30%; subs 15%; **new EEA/UK/US structure effective 30 Jun 2026** — 10%+5% subs, 20/25% other, 20%/15% external web links; KR/IN alt-billing −4%): https://support.google.com/googleplay/android-developer/answer/112622
- Google Play Real-Money Gambling, Games, and Contests policy (referenced from Payments): https://support.google.com/googleplay/android-developer/answer/9877032
- Stripe AU pricing (1.7%+A$0.30 domestic incl GST; 3.5%+A$0.30 intl; PayTo/BECS 1%+30¢; disputes A$25; Payment Links/Checkout included; lower AU card pricing from 1 Oct 2026 / 1 Apr 2027): https://stripe.com/au/pricing
- ACNC, DGR topic guide (DGR = orgs able to receive tax-deductible donations): https://www.acnc.gov.au/tools/topic-guides/deductible-gift-recipient-dgr
- ATO, gifts & donations (DGR at time of gift; true gift, no material benefit): https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim/gifts-and-donations
- In-repo: SOT extract §3.7/§3.8/§3.16/§4.15/§5 MISSING items (design/references/90e253a1…pdf); docs/08 §2 + §6; docs/15 L1/L2; docs/30 (iOS ladder); engine `apps/sot-engine.js` charity block; app `apps/sot/app.js` charity overlays.

*Every `[VERIFY]` above is an explicit open question — none of them blocks the
pilot architecture; several block specific later moves (store IAP, external
links, fee rates). The one gate that blocks real money is L1 (docs/15).*
