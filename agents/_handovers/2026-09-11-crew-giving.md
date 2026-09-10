# HANDOVER: Crew Giving built into the v4 SOT app (docs/32 ADDENDUM) — 2026-09-11

## Shipped
- **The ask:** build CREW GIVING — the giving-circle reframe from docs/32's ADDENDUM ("a group subscription model where they choose where the money goes") — into the v4 SOT app. The WORDING TABLE is binding: "giving pool" never "pot" for money; "subscribe/contribute" never "wager/stake"; "directs the pool" never "wins the pot".
- **Engine (apps/sot-engine.js)** — new Crew Giving block after the stakes section:
  - `GIVING_MONTHLY_DEFAULT_CENTS = 500`, `normalizeGiving(giving)`, `givingPoolCents(season)`.
  - Season config carries `giving` (`createBattleSeason` passes it through untouched).
  - `endBattleSeason` extends: giving enabled + unique champion → winner mode resolves immediately (`givingResolution = { charityName, abn?, causeOwnerId, directedByPlayerId, amountCents, receipt: "RWFG-<seasonId>-<date>", settlement: { status: "web_checkout_pending", checkoutUrl, note }, resolvedAt }`); crew-vote mode opens `givingVote = { open: true, votes: {} }` instead. Tie seasons resolve NOTHING (Q224 still open — a split season directs nothing).
  - `castGivingVote(s, playerId, causeOwnerId)` — voter must be a season player, one vote each; settles on a strict majority of season players (proof-vote pattern) or when everyone voted; ties → earliest-nominated cause (deterministic, by config order). Settling writes the same `givingResolution` shape with `directedByPlayerId = season.champion`.
  - `givingVoteTally(s)` — UI read helper.
  - NO real money moves anywhere: amounts are display-only, settlement is always "web_checkout_pending" with a placeholder link (`https://rwf.qalarc.com/giving/checkout/<seasonId>`).
- **Bridge (apps/sot/engine.js)**:
  - `g.giving` on the group (`applyGiving` resolves wizard opt-in markers "me"/house NAMES → member ids); `addMemberTo` defaults `cause: null`.
  - `startSeason` FREEZES the giving snapshot into the season (`s.giving` + engine `config.giving`) — mid-season joiners nominate but wait for the next pool (docs/32 §1 caveat). `syncSeasonGiving` refreshes the ACTIVE season's copy on deliberate mid-season changes.
  - `endSeason` mirrors the close: `giving_directed` 💙 feed event ("Your crew's September pool — $25.00 to X, Dave's cause, directed by Alexei's season. Receipt … · web checkout pending.") or `giving_vote_open` 🗳️.
  - New facade: `setCause` (member + group causes + profile cause sync), `setGivingOptIn`, `updateGiving` (amount/selection), `voteGiving` (+ settled event) and page-drivers `setCauseAs` / `setGivingOptInAs` / `voteGivingAs`.
  - `snapshot()` now returns `snap.giving` view-model: `{ monthlyCentsPerMember, selection, optedIn, causes (+ownerName), poolCents, meIn, myCause, resolution, vote }`. Reads the FROZEN season snapshot while live, the LAST season after close (stakeCard pattern), falling back to `g.giving`.
- **App (apps/sot/app.js)**:
  - Wizard (11 steps unchanged): the season-step stake seg gains "💙 Crew Giving" — the DEFAULT (stakeChoice), so the primary launch shape is what founders see first. Its setup body = the Crew Giving screen: $2/$5/$10/custom monthly picker, winner's-cause vs crew-vote seg, "Your cause (for crew giving)" + ABN for the creator, per-member opt-in toggles (me + house crew), the honest note. Review row shows "$5.00/month · winner's cause · N in the pool"; created overlay chip shows "💙 Crew Giving". `finishWizard` sets `stake: none` + `giving` when chosen, and stores the creator's cause on the profile (`setMe({ cause })`) so future crews carry it.
  - Join flow: giving groups get a preview card ("💙 CREW GIVING — $5.00 monthly … never required to play") + a `giving` step: opt-in toggle (default on), cause fields, "Agree & chip in $X/month" (or play free when opted out). `acceptJoin` applies opt-in + cause.
  - Profile → Settings: "Your cause (for crew giving)" (free text + optional ABN + Save cause; also applies to the active crew's causes).
  - Leaderboard: subtle 💙 `.cause-chip` on rows of cause-nominated players (title = "giving for X").
  - Season hub: `givingCard(snap)` — pool stats (monthly pool / who directs), THIS SEASON'S CAUSES list with vote buttons when open, resolution receipt post-season (⏳ web checkout pending + placeholder checkout link), my-cause row, per-member opt-in toggles, amount + selection editors (apply from the next pool).
  - The monthly moment: `givingPool` overlay — kicker "YOUR CREW'S <MONTH> POOL", charity title, receipt share-card (whose cause · directed by whose season · receipt · web checkout pending), `givingCardPng` canvas impact card (`window.rwfLastGivingPng`), "Share the impact" + "Save PNG". detectMoments fires it once per group+season (`giving-<gid>-<idx>` gate); the seasonWinner overlay's right button becomes "💙 Your crew's pool" (or "🗳️ Vote in the feed").
  - Feed: `#giving-vote` card rides the top in crew-vote mode — same proof-card family, per-cause vote buttons, live tallies, settles at majority. New FEED_ICO: giving_directed 💙, giving_vote_open 🗳️, giving_vote 🗳️, cause_nominated 💙, giving_optin 💙.
- **Language sweep (WORDING TABLE, binding):** wizard charity body → "CONTRIBUTION POOL" (points trial keeps per-player $ + disclosed fee); stakeName/stakeBlurb/stakeDeclaration/stakeLabel/stake_due + `charity_donated` event + hub "STAKE — CONTRIBUTION POOL"/"Pool (N in)"/"Pool locks at season end" + charity chooser ("DIRECT THE POOL") + join stake step — all pool language. Dinner/dare/deliverable copy explicitly framed as the crew's forfeits. tutorial.js + scrHowItWorks: the money entry is "Crew Giving" now. The reroll POINTS pot keeps the word "pot" (points, not pooled money — the wording table bans pot for the pooled MONEY; e2e-cards still asserts "pot 50").
- **e2e gates:** `e2e.mjs` BANNED (page + source-string) extends with `wager|bet(ting)?|jackpot|winnings` (dated comments); wording-driven assertions updated with dated comments only: `clickText("Contribution pool")`, `okBody("STAKE — CONTRIBUTION POOL")`.

## Verified
- NEW **apps/sot/e2e-giving.mjs — 89/89** (headless chromium, same harness as e2e.mjs; shots `_giving` in apps/sot/shots/):
  - Crew A (winner mode): wizard → Crew Giving setup asserts ($5 default, both selection modes, honest note, opt-in toggles, creator cause+ABN) → lobby (season NOT started — frozen-snapshot order proven) → Switch player → Sam onboards → join preview discloses giving → join giving step (opt-in + cause "Starlight Children's Foundation") → Sam starts the season → frozen snapshot carries BOTH causes → 💙 chips ×2 on the leaderboard → Sam wins the 1-battle season → `givingResolution` asserted in state: Starlight, causeOwnerId = directedByPlayerId = Sam, $25.00 = 5 × $5 (Alexei stays on the roster as house after the switch), settlement web_checkout_pending, RWFG receipt, placeholder https link → "💙 Your crew's pool" → YOUR CREW'S POOL overlay → impact card PNG > 5000 bytes → hub (THIS SEASON'S CAUSES, both causes, $25.00 pool, receipt) → 💙 `giving_directed` feed event.
  - Crew B (crew-vote): setup with "Crew vote" + Rae's RSPCA cause → house cause PCYC via `setCauseAs` → season → vote OPENS (no auto-resolution) → the `#giving-vote` feed card → Rae votes PCYC in the UI, Priya + Marco vote via `voteGivingAs` → 3/4 majority settles → PCYC (Marco's cause) wins, directed by Rae's season, $20.00, web-checkout-pending → the pool moment fires once the vote settles.
  - Extended banned-words gate (source strings) + ZERO console errors.
- ALL existing suites stay green: **129/129** e2e.mjs · **58/58** e2e-cards · **82/82** e2e-states · **80/80** e2e-tutorial · **24/24** e2e-cloud · cards.test **31** · parity **5**.
- Only wording-driven assertion changes in existing suites, each with a dated 2026-09-11 comment: e2e.mjs (3 sites), e2e-tutorial.mjs (2 sites).

## Gotchas hit
- **`label.f` renders UPPERCASE** (sot.css text-transform) — innerText assertions must use the uppercase form ("MONTHLY AMOUNT PER MEMBER"); same for `h3.row` ("THIS SEASON'S CAUSES").
- **Season deadline lives at `b.core.config.deadlineAt`** (not `b.core.deadlineAt`) if you ever force-close a day in a probe — already noted in the 09-09 entry, cost me another probe cycle.
- **overlayShown keys must be group-scoped** — `"season" + idx` collided across the two crews in one session (second crew's season moment silently suppressed). Fixed for season + giving keys (`season-<gid>-<idx>`, `giving-<gid>-<idx>`); the per-battle `fail<idx>` keys still share the old shape (harmless today — only one crew has failures per session — but worth scoping if a future e2e crosses groups with failures).
- The creator STAYS on the roster after "Switch player" (marked isHouse) — a 4-player wizard crew is 5 players after one join; pool math in tests must count them.
- Wizard `input` state binds oninput — e2e must dispatch `new Event('input', { bubbles: true })` after setting `.value` (typeInto helper does this; number inputs are driven directly).
- `joinByCode` copies the profile cause onto the new member; the join UI's explicit `setCause` remains the authoritative write for the group's causes.

## Next agent should
- **Web checkout rails:** replace the placeholder link behind `web_checkout_pending` with Stripe Payment Links → Subscriptions (docs/32 §2.6 Option C — charity platform as merchant-of-record; we hold funds never). The settlement object is already shaped for it (`status` + `checkoutUrl`).
- **ACNC auto-check stub** on the ABN field (lookup + "verified on the ACNC register" chip); keep the free-text cause working when the register is unreachable.
- **Corporate mode:** the crew-vote path is built — corporate still needs the employer shortlist + report card (docs/32 §1 LAUNCH row).
- **Lifetime directed total** on the giving card (aggregate `givingResolution`s across seasons — docs/32 §1.8).
- **Match-pledge flag** (non-money display only) — still unbuilt from the 09-10 handover's pilot list.
- Don't touch the charity points-trial engine path (`proposeStake/charity` + `resolveCharity`) — it stays as the points demo; its copy is now contribution-pool language.
- If adding giving to cloud groups later: `g.giving` already serializes cleanly; the server would need the same `applyGiving` id-resolution + the frozen-snapshot rule on its season start.

Rules honored: apps/sot/ + apps/sot-engine.js + e2e only; wording table binding; nothing deleted (all edits in place; old shots untouched); no commits.
