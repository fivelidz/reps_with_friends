# 31 · PROGRESS LOG

*What shipped, verified how, what's next. One dated entry per wave. The
founder asked for this — append, never rewrite.*

---

## 2026-09-08 — THE CARD SYSTEM (SOT app)

**Shipped:** 21-card deck, 6 families — canon 4 (Lightning/Steal-pure-gain/Shield-streak/Freeze) · post-launch 6 (Surprise Bomb, Rescue Rope, Double Down, Combo Boost, Assist Boost, Shield Bash) · **exercise modifiers** (Double Exercise ×2, Specialist ×1.5 top-3, Wildcard Workout) · **rivalry** (Rivalship +30 head-to-head, Training Partners both-bank +25, Pack Bond team) · **proof** (Prove It, Spot Check) · catch-up (Second Wind, Mulligan, Underdog). **Draft-from-3** with the catch-up curve (behind players draft better — seeded-statistically proven), hand cap 3, day-open deal + halfway bonus deal, reroll-to-pot 50/100/200, points ledger (start 500). **The proof flow:** verify path on the log screen (timer/camera attest) → feed accept/contest card → majority settles → **contested scores 0 but the day still banks** (never shame). Sports-poster card faces, CSS-3D staggered flips.
**Verified:** 31 engine tests (289 expects) · e2e-cards 58/58 (deal→flip→reroll→pick→×2-rides-a-log→verified+15→contested-0-banks) · main walk 129/129 · states 59/59 · zero console errors. Parity intact.
**Next:** 3 open product questions (Training Partners stat vs season point; pot settlement timing; wildcard conversion placement); founder review of the deal-sheet visuals.

## 2026-09-07 — POV + styles review + research + WeCom

**Shipped:** v3 **TABLE camera** (57.5° oblique board-game default, course re-proportioned 60→28 so figures read as game pieces, STADIUM sweep + FOLLOW kept, persistent quick bar, back-gesture fix) — e2e 94/94. Styles page diet (compact bar, ?-sheet, preview-✕ bug root-caused: author `display:flex` beat `[hidden]`) + **Phone Review Mode** (full-screen theme slides, swipe/momentum, heart-pick shortlist, copy-to-chat) — 251/251. **Live /atelier blank FIXED** (deploy served index.html as the garment modules — production-only; guarded in build-deploy now). **WeCom OUTBOUND transport** (founder-approved; markdown cards, errcode-aware, 18/min guard; activation = a copied webhook key) — 6 tests. Research: docs/28 WeChat (defer consumer; WeCom legal), docs/29 Play (account exists + verified; needs founder's 45-min keystore session + service account; 12-tester gate if personal), docs/30 iOS (PWA→TestFlight→store ladder; Apple 3.2.2(iv) bans in-app charity collection — pot-outside-app is load-bearing).
**Verified:** all suites green (~1,000 checks across the estate).

## 2026-09-04 — THE SOURCE-OF-TRUTH ERA

**Shipped:** Ben's 36-page master spec read + reconciled (docs/27). **Engine V4**: daily-200 adjusted targets, first-to-target Daily Win, bank-day continuation, weekly seasons 1:1, all 4 stakes (dinner/dare/deliverable/charity with agreement gating + season resolution), SOT power-up canon (steal = pure gain; shield = streak protection) — 110 tests, parity 5/5. **/v4 the SOT app** (120/120 e2e walking the entire spec — welcome→wizard→battle→win→bank→fail→recap→season→stake→charity chooser; 7 real bugs caught by the walk). **SOT bots** (SotCommandBus: Daily Win + bank-day cards, stakes in chat, --sot sims — 89 tests). **Critical states** (offline+queued+replay, sync-conflict sheet, rest-day home, season-live — 59/59). Wiki rewritten for the SOT era (25/25). Contract PDF with real entities (qalarc Pty Ltd ↔ Ben Gillies for Narwhal Ent Pty Ltd).
**Verified:** 223 unit + 110 engine + 179 v4 e2e + parity.

## 2026-09-03 — v3, styles repository, photo booth, Pinterest

**Shipped:** /v3 3D battle course (mocap runners on tier lanes, floating card billboards, trophy pot — 69/69 e2e + 35/35 geom). The **style LIBRARY** (kits mined verbatim from the founder's own sites: x10.au, doof.ing, qalarc, tradez, gmux, volkus, endispute; 4 neo-brutalist Sports Poster variants; grayscale-distinct pairwise). **/booth photo→avatar** (GLM-4.6v vision intake → palette+silhouette spec → codegen → pixel gate; honest privacy: no likeness, photo deleted). Ben's **Pinterest board** fully scraped (39 pins) + ANALYSIS.md (cream/teal sports-numbers cluster ×3; his board votes light-surface ~3:1). img2threejs verdict (docs/23: agent skill, not a model — two-lane foundry recommendation).

## 2026-09-02 — orchestration + handover system (ORCHESTRATION.md, lanes, standing directives); themes → 26 kits.

## 2026-09-01 → 09-02 — v2 board app; power-up economy v2 (points, draft-from-3, catch-up curve, reroll-to-pot); multi-squad dashboard + wagers; WebAudio SFX (13 sounds); timeline doc; coverage hub /v1.

## 2026-08-28 → 09-01 — **the avatar epic**: Geno sourced (Meta ai4animationpy; "goblin mocap" was a mislabeled demo capture — 16 real clips via retarget); garments v5→v9 (ending at skin-derived construction: the body's own triangles +6mm with its own weights — the founder's "use the body's dimensions"); frog heads + wardrobe + /atelier; anyCreature integration; the Figma cascade (extraction→analysis→components→65-screen offline app); engine/app hardening (~700 checks); email v4, deck, contract.

## 2026-08-26 → 28 — **Phase 0 + prototype**: business analysis; research (OpenGym, wearables, messaging platforms); game-core engine (300-format + handicap); bots (WhatsApp via Qalarc Hub, Slack Bolt); app v1; the Three.js site; ops hub; rwf.qalarc.com + CI/CD.
