# 30 — The iOS Approach: PWA now, TestFlight at pilot, store at launch

*Research date: 2026-09-07. Trigger: founder — "consider the iOS approach I
should have also and what is needed there." Companion to docs/08 §1–2 (PWA vs
native sequencing, Apple requirements) and docs/27 (SOT reconciliation — the
tech-stack questions are explicitly UNLOCKED in the spec).*

---

## TL;DR

1. **The SOT doesn't dictate iOS tech.** Its tech row is open questions
   ("Flutter? NestJS+Postgres+Redis+AWS? Cognito? — UNLOCKED") and our
   Bun/PWA/Hono stack is recorded as the velocity argument. Nothing in the
   spec forces a native rebuild.
2. **The recommended ladder**: (a) **PWA "Add to Home Screen" today** — free,
   no Apple account, works now, push included on iOS 16.4+; (b) **TestFlight
   native shell at pilot** — costs the Apple Developer Program ($99 USD/yr,
   shown in local currency ≈ A$149 `[VERIFY AUD at enrollment]`) and needs a
   mac-equivalent build path; (c) **App Store at launch** — where Apple's
   review rules around stakes/charity/webview-shells actually bite.
3. **The single biggest Apple-review landmine for RWF**: guideline 3.2.2(iv)
   — charity/cause money may NOT be collected inside the app (outside the
   app via Safari/SMS is fine). Our "pot settles outside the app" design
   isn't just lawyer-friendly, it's what makes an App Store version
   possible at all. The charity framing matters exactly as much as the
   founder suspected.
4. **We have no mac. All three mac-less build paths are documented in §4**
   (GitHub Actions macOS runners, Codemagic, rented/borrowed mac). Signing
   in CI is solved by App Store Connect API keys + cert import into the
   runner keychain.

---

## 1. What the SOT says vs what we've built

| | SOT (design/references/90e253a1…pdf, v2026-09-02) | Our build |
|---|---|---|
| Client tech | **UNLOCKED** — "Flutter? NestJS+…+AWS? Cognito?" listed as open questions for founder+Ben | Bun + PWA + Hono (serve.ts :4173 / rwf.qalarc.com), native WebView shell on Android, TWA built |
| Distribution implied | none specified | PWA + direct APK + (this doc) iOS ladder |
| Consequence | **No SOT obligation to go Flutter/native.** Any native iOS work is a distribution decision, not a spec requirement. Choosing Capacitor later does NOT violate the SOT; choosing Flutter would be a founder+Ben call with real cost |

docs/08 §1 already sequenced this: "What the PWA can do (today, no
approvals)" → camera rep counting in-browser via getUserMedia + MoveNet
works; push (web) works; install works. "What only native can do" was:
App Store presence, (historically) push — **that item expired when iOS 16.4
shipped web push for Home Screen web apps.**

## 2. The decision tree, honestly

### (a) PWA — Add to Home Screen. **Start here; testable TODAY on any iPhone.**

What's true on iOS (2026, iOS 16.4+ through current):

- **Install**: Share → Add to Home Screen. With a manifest
  (`display: standalone`) it opens as a real app — own icon, App Switcher
  card, no Safari chrome. **No store, no Apple account, no review, free.**
- **Web Push** (webkit.org/blog/13878, Feb 2023, current behaviour): works
  for **installed (Home Screen) web apps only** — not in a Safari tab.
  Permission must be requested **in response to direct user interaction**
  (a "notify me" tap — no permission prompt on load). Uses standard Push API
  + Service Workers via Apple's push service; **no Apple Developer Program
  membership required**. Notifications land on Lock Screen/Notification
  Center/Apple Watch, integrate with Focus, per-app controls in Settings.
- **Badging API** works (app-icon badge counts — streak nudges!).
- **Camera (the verify loop)**: getUserMedia supported in Safari since iOS
  11; the long-broken in-PWA case was fixed in iOS 13.4 (WebKit bug 185448,
  linked from caniuse). Current Safari iOS = supported (caniuse
  getUserMedia, fetched 2026-09-07). Expect the usual WebKit quirks: secure
  context required (we're HTTPS ✅), front/back camera switching UX, and
  keep the pose model in a worker for frame budget.
- **The honest limits**:
  - **No install prompt** — iOS never shows Chrome-style "install app"
    banners; users must be *taught* Share → Add to Home Screen. Our
    onboarding needs an iOS-specific "how to install" card (visual, 2 taps).
  - **No background audio** — SFX/music only while foregrounded. Fine for
    our foreground game loop; kills any ambient-audio ambitions.
  - **No background execution generally** — timers die when backgrounded;
    sync on foreground (we already do this on the web build).
  - Storage/ITP: Safari tabs can have site data evicted after ~7 days of
    non-use; **installed web apps are exempt from that cap** `[VERIFY
    current WebKit behaviour — the 7-day ITP eviction script famously skips
    home-screen web apps]`. Another reason install is the iOS happy path.
  - No App Store discovery/marketing surface — distribution is by link/QR
    (which is exactly how our crews onboard anyway: `/connect`, crew codes).

**Cost: $0. Work: an iOS polish pass (install-education card, touch targets,
safe-areas, test push + camera on a real iPhone). Testable today.**

### (b) TestFlight native shell — the pilot-era step

- Requires **Apple Developer Program** membership: $99 USD/membership year,
  local currency at enrollment (≈A$149) `[VERIFY AUD figure at checkout]`.
  Enrollment as individual = legal name as seller; **organization
  enrollment** (right for Narwhal Ent Pty Ltd) needs D-U-N-S number, legal
  entity status, work-domain email, public website — all obtainable
  (developer.apple.com/programs/enroll/, fetched 2026-09-07).
- TestFlight mechanics (developer.apple.com/testflight/): up to **100
  internal testers** (App Store Connect team roles, no review delay) + up
  to **10,000 external testers** via email or **public link**; external
  distribution requires a one-time **Beta App Review** of the first build;
  up to 100 builds shareable; testers need the free TestFlight app.
  → Our pilot crews fit inside internal testing alone; public link is the
  growth lever later.
- The shell itself: a thin native app (SwiftUI WKWebView, or Capacitor —
  see (c)) around rwf.qalarc.com. Builds must be **signed** (cert +
  profile) and uploaded to App Store Connect → needs the mac-less paths
  in §4.
- Review reality for the *shell itself*: TestFlight builds must comply with
  App Review guidelines (2.2) — including **4.2 minimum functionality** ("a
  repackaged website" rejection risk). Mitigate with genuinely native
  value: native push, share sheet, haptics, camera permission strings,
  maybe a widget (streak counter) — i.e., don't ship a naked webview.

### (c) Capacitor — the middle path (likely our actual (b))

Capacitor (capacitorjs.com) wraps the existing web app in a native iOS (and
Android) shell **with a plugin bridge** — camera, push, haptics, status bar,
share — without rewriting anything. Our PWA drops in nearly as-is; the
Android side could converge on it later too (replacing both the hand-rolled
WebView shell and possibly the TWA). It keeps: one codebase, web-first
product truth, SOT-neutral. It costs: a node build step + Xcode project +
the same signing/CI machinery as (b). **Recommendation: when we do (b), do
it as Capacitor unless a hard native need appears.**

## 3. What iOS changes product-wise (beyond distribution)

1. **Stakes/charity language — the App Review analysis** (App Review
   Guidelines, updated 8 Jun 2026, fetched 2026-09-07):
   - **5.3.4 real-money gaming** needs licensing + geo-restriction; we
     don't touch it as long as no money flows through the app.
   - **3.2.2(iv)**: unless we're an *approved nonprofit*, apps may not
     collect charity funds in-app; such apps must be free and **collect
     outside the app (Safari/SMS)**. → The charity pot must keep settling
     outside the app; in-app we show pot state, not pot payments. Our
     points-trial + external-settlement design is Apple-compatible by
     construction. The **charity framing is load-bearing** — "loser
     donates to charity" outside the app reads as challenge/fitness; any
     in-app wager wallet reads as gambling.
   - **5.3.1–5.3.2**: any contest element → developer-sponsored, official
     rules presented in-app, "Apple is not a sponsor" disclaimer. Cheap to
     add; add at store submission.
   - **1.4.5**: apps must not *urge* users into activities that risk
     physical harm — keep copy on the safe side of "challenge your mates"
     vs medical/exertion claims (docs/08's hardening lane covers this).
   - **1.2 UGC**: with social features we need filter/report/block +
     contact info. On the roadmap for store anyway.
   - **5.1.3 health data**: fitness data can't feed ads/data-mining — our
     no-ads stance keeps us clean.
   - **4.8 login**: if we ever add "Sign in with Apple-adjacent" social
     logins, equivalent-privacy options required. We're crew-code-first;
     fine.
2. **Camera verify on WebKit**: supported (see §2a) but test on device —
   iOS Safari/WKWebView permission prompts differ from Android Chrome, and
   in a native shell (Capacitor) camera goes through the native permission
   string, which we must write properly (a vague string is a rejection).
3. **Push**: web push (installed PWA, 16.4+) vs native push (TestFlight
   shell). If both exist, dedupe by surface — the bot (WhatsApp/Slack) is
   still the primary notification rail; device push is the secondary.
4. **No background audio** (SFX demo page noted; fine foreground-only).
5. **App Store metadata at launch**: privacy "nutrition labels" (docs/08
   §2 already enumerates), privacy policy URL, demo account for review,
   screenshots, 4+/12+/17+ rating honestly reflecting stakes language.

## 4. Building/signing without owning a mac

All routes end in: Xcode build → signed with distribution cert + profile →
uploaded to App Store Connect. The cert/profile dance can run headless via
the **App Store Connect API key** (fastlane `pilot`/`deliver` + `match`, or
Codemagic's tooling).

| Path | What | Cost | Notes |
|---|---|---|---|
| **GitHub Actions macOS runners** | `runs-on: macos-14/15` VMs with Xcode preinstalled | free minutes on paid plans / per-minute for private repos `[VERIFY current pricing/included minutes]` | Import .p12 + profile into the runner keychain in-workflow, or use fastlane match (certs stored encrypted in a repo/Cloud). Fully scriptable from our existing `.github/workflows/deploy.yml` culture |
| **Codemagic** | CI built for exactly this (Flutter/Capacitor/React Native → TestFlight) | free tier for small projects, then usage pricing `[VERIFY tier]` | First-class App Store Connect integration; least custom YAML |
| **Xcode Cloud** | Apple's own CI | usage-priced, requires Apple Developer Program | Configured from Xcode/cloud dashboard — awkward mac-less `[VERIFY web-only configuration maturity]` |
| **Rent/borrow a mac** | MacStadium / MacInCloud / a mate's Mac mini | ~US$30–80/mo hosted | The "someone owns it" path; a one-time setup mac is enough since CI takes over after |

**Recommendation**: GitHub Actions (we already live there for deploys) with
fastlane `match` for certs — zero new vendors. Codemagic as fallback if the
runner queue/ruby pain isn't worth it.

## 5. The sequenced recommendation + costs

| Stage | When | What ships | Cost | Gate |
|---|---|---|---|---|
| **1. PWA polish** | now | iOS onboarding (install-education card), safe-area/touch pass, web-push opt-in flow, camera verify tested on a real iPhone | $0 (borrow any iPhone; no Apple account needed for web push) | none — just do it |
| **2. TestFlight shell** | at pilot (when iPhone-owning crews appear) | Enroll Apple Dev Program (org, D-U-N-S if needed) → Capacitor shell → GH-Actions macOS CI → internal testing (100) → public link if wanted | **$99 USD/yr + CI minutes** | founder does enrollment (2FA, D-U-N-S, legal entity); agents do everything after |
| **3. App Store** | at launch | Store listing, privacy labels, rules-in-app (5.3.1/5.3.2), review-proof shell (native features), demo account | $0 extra (same membership) | App Review — the §3 analysis is the prep sheet |

Decision the founder makes once: **individual vs organization enrollment.**
Given docs/27 (Narwhal Ent Pty Ltd is the contracting party) org is right,
and regulated-adjacent apps *must* come from a legal entity (5.1.1(ix)) —
but org needs D-U-N-S (free, ~1–2 weeks `[VERIFY turnaround]`), work email
on the company domain, and a real website (rwf.qalarc.com qualifies once
it's public-facing marketing, not just the hub).

## What the founder does next

1. **Stage 1 is free and needs no decisions**: green-light an iOS PWA polish
   pass (agent work: install-education card + web-push opt-in + iPhone
   device test of camera verify — a 1-day wave once an iPhone is in hand).
2. **Get one iPhone into the loop** (founder's or a pilot friend's) — every
   iOS decision above is testable on real hardware before any money moves.
3. **Defer the $99 until pilot** (Stage 2 trigger = iPhone-owning pilot
   crews). When triggered: founder does org enrollment (D-U-N-S first —
   longest lead item), agent builds the Capacitor shell + CI same week.
4. Keep the pot money **outside the app** permanently — it's not just the
   legal stance (docs/08 §6), it's what keeps the App Store door open (§3).
5. Optional: 10-min read of webkit.org/blog/13878 (what iOS web apps can do
   now) — it's the fact-base that makes "PWA now" defensible to Ben.

## Sources

- Web Push on iOS 16.4 (Home Screen web apps, user-gesture permission, Badging, no dev account needed): https://webkit.org/blog/13878/web-push-for-ios-and-ipados/ (fetched 2026-09-07)
- getUserMedia support incl. iOS PWA fix (13.4): https://caniuse.com/getUsermedia + https://bugs.webkit.org/show_bug.cgi?id=185448 (fetched 2026-09-07)
- Apple Developer Program enrollment (individual vs org, D-U-N-S, $99/yr): https://developer.apple.com/programs/enroll/ (fetched 2026-09-07)
- TestFlight (100 internal / 10,000 external, public links, Beta App Review): https://developer.apple.com/testflight/ (fetched 2026-09-07)
- App Review Guidelines (3.2.2(iv) charity, 5.3.x gaming/contests, 1.4.5, 2.2, 4.2, 4.8, 5.1.1, 5.1.3; updated 8 Jun 2026): https://developer.apple.com/app-store/review/guidelines/ (fetched 2026-09-07)
- fastlane supply (cert/CI tooling context): https://docs.fastlane.tools/
- Context: docs/08_LAUNCH_REQUIREMENTS.md §1–2, docs/27_SOURCE_OF_TRUTH_RECONCILIATION.md (tech row UNLOCKED), agents/ORCHESTRATION.md (stack)
