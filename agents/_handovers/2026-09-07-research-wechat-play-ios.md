# HANDOVER: research wave (WeChat / Play publishing / iOS) — 2026-09-07

Three research docs written in response to founder asks ("wechat
compatibility", "qalarc google publishing account — get this working again",
"the iOS approach"). Research-only wave: no code, no deploys, no commits.

## Shipped
- **docs/28_WECHAT_INVESTIGATION.md** — verdict: consumer WeChat has NO
  group API (every "WeChat group bot" = ToS-violating protocol hack;
  wechaty puppet table documented); the one legal surface is WeCom
  (企业微信) group-robot webhooks (outbound-only, ~½-day adapter) +
  self-built apps (bidirectional, 3–5 days); China-market entry = Mini
  Program + ICP + PIPL + pot-mechanic rework → **defer everything**.
- **docs/29_PLAY_PUBLISHING.md** — local inventory of the qalarc Play
  account (`alexei@qalarc.com`, identity-verified 2026-05-19) + the
  stalled video-converter publishing kit at
  `~/projects/phone_projects/launching_apps/video-converter/` (stops at
  keystore step 17). No service-account JSON / fastlane anywhere on this
  machine. Full 3-phase runbook: founder console session → service-account
  enablement → fastlane supply automation. RWF plan: TWA to internal
  testing → closed testing (12 testers/14 days if personal acct) →
  production. NOTE: `apps/twa/rwf.keystore` is prototype-grade — new upload
  key required for Play + enroll Play App Signing.
- **docs/30_IOS_APPROACH.md** — SOT leaves tech UNLOCKED (docs/27).
  Ladder: PWA now (web push iOS 16.4+ for installed web apps, no Apple
  account needed, getUserMedia works) → Capacitor shell via TestFlight at
  pilot ($99 USD/yr org enrollment + D-U-N-S, mac-less CI via GitHub
  Actions macOS runners / Codemagic) → App Store at launch. Apple-review
  analysis: charity money must stay OUTSIDE the app (3.2.2(iv)) — the pot
  settlement design is load-bearing; webview shells risk 4.2 rejection so
  ship native features in the shell.

## Verified
- Play 12-tester/14-day rule confirmed against live Play Console Help
  (answer/14151465, fetched 2026-09-07) — applies to PERSONAL accounts
  created after 13 Nov 2023; org accounts exempt. Account type of
  alexei@qalarc.com is UNCONFIRMED `[VERIFY in console]`.
- iOS 16.4 web-push facts quoted from webkit.org/blog/13878 directly;
  TestFlight 100/10,000 tester limits + Beta App Review from
  developer.apple.com/testflight; App Review guideline numbers
  (3.2.2(iv), 5.3.x, 4.2, 1.4.5) from the live guidelines page
  (updated 8 Jun 2026).
- wechaty puppet-provider table from wechaty.js.org (last updated Dec 2025):
  web puppets broken for most accounts, PadLocal = paid de-facto standard,
  official-account puppet = the legal 1:1 one.
- Local searches ran with timeouts over
  `~/projects/{tradez,qalarc.ai,phone_projects,MASTER_PROJECTS}` — no Play
  API credentials exist anywhere (only markdown docs). A ghost
  `qalarc_video_converter_publish` path appears in old rg indexes but the
  directory does not exist; live copy is under phone_projects.

## Next agent should
1. **WeChat**: nothing, unless a China-nexus corporate pilot appears — then
   build the WeCom webhook transport in packages/bot-core (docs/28 §2.1
   spec). Never wire wechaty into production.
2. **Play**: when founder says go, drive the Phase A session live (keystore
   script + console checklist are ready in the video-converter project),
   then Phase B service account, then wire `fastlane supply` for RWF's TWA
   (`bunx @bubblewrap/cli build` in apps/twa) to internal testing. Generate
   a fresh upload keystore for Play — do NOT reuse rwf.keystore.
3. **iOS stage 1 is unblocked and free**: an iOS PWA polish wave
   (install-education card, web-push opt-in flow, safe-areas, camera-verify
   test on a real iPhone) can be picked up by any app agent — see
   docs/30 §2a for the spec of what works.
4. Update docs/08 §1–2 cross-refs to point at docs/29/30 next time that doc
   is edited (its "only native can push" line is stale post-16.4).

## Gotchas hit
- Tencent's developer portals (work.weixin.qq.com, developers.weixin.qq.com)
  are JS-walled to fetches — official pages cited by URL, specifics tagged
  `[VERIFY]` in docs/28. Treat WeCom rate limits/robot-caps as unconfirmed
  until read in the console.
- /tmp/sot.txt (referenced in the tasking) no longer exists — used
  docs/27_SOURCE_OF_TRUTH_RECONCILIATION.md + the SOT PDF path
  (design/references/90e253a1…pdf) as the SOT source instead.
- The secrets file for the Play account is at
  `~/projects/phone_projects/launching_apps/video-converter/secrets/PLAY_ACCOUNT.md`
  — it contains only the login email (no keys), but don't paste account
  emails into public surfaces.
