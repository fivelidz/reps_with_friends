# 29 — Google Play Publishing via the qalarc Account: inventory + runbook

*Research date: 2026-09-07. Trigger: founder — "we have a qalarc google
publishing account. I also want to publish other apps too. let's get this
working again." This doc inventories what exists on this machine, what state
the account is in, and gives the step-by-step to get publishing working — for
RWF and for other apps. Companion to docs/08 §3 (Play launch requirements).*

---

## TL;DR

1. **The account exists and is identity-verified**: `alexei@qalarc.com`,
   confirmed 2026-05-19. The previous publishing project (qalarc video
   converter) stalled **one live session short of the first upload** — at
   "create release keystore". No app was ever actually uploaded
   `[VERIFY in console]`.
2. **No API automation exists yet**: no Play service-account JSON, no
   fastlane, no gradle-play-publisher anywhere on this machine. All uploading
   so far was going to be manual via Play Console.
3. **Getting it working again is short**: founder does a ~45-min console
   session (keystore + first manual upload OR service-account creation);
   after that, agents can automate everything (fastlane supply / direct Play
   Developer API).
4. **RWF-specific**: we already have two shippable Android artifacts
   (TWA `com.qalarc.rwf` and native WebView shell
   `com.qalarc.repswithfriends`) — but the TWA keystore is prototype-grade
   and must NOT be the Play signing key. Plan: internal testing track first,
   closed testing with the pilot crews, and if the account is a *personal*
   one created post-Nov-2023, production access requires **12 testers opted
   in continuously for 14 days** before we can even apply.

---

## 1. What exists on this machine (found 2026-09-07, secrets masked)

### 1.1 The Play account

| Item | Value | Source |
|---|---|---|
| Account email | `alexei@qalarc.com` | `~/projects/phone_projects/launching_apps/video-converter/secrets/PLAY_ACCOUNT.md` |
| Identity verification | ✅ done ("no 3-day delay") | same file, confirmed by user 2026-05-19 |
| Console | https://play.google.com/console | same |
| $25 registration fee | Presumably paid (account usable) `[VERIFY — search `alexei@qalarc.com` mail for "Google Play Console" / "$25.00"]` | docs/03 of that project |
| Account type (personal vs organization) | **Unknown** `[VERIFY — Settings → Account details in console. docs/03 there *recommended* Organization, STATUS.md doesn't say which was picked]` | — |
| Existing apps on account | None uploaded as of 2026-05-21 (project stalled pre-upload) `[VERIFY console app list]` | STATUS.md of that project |

### 1.2 The previous publishing project (the "get this working again" base)

`~/projects/phone_projects/launching_apps/video-converter/` — a complete,
battle-tested publishing kit for a Flutter app (`com.qalarc.convert` v1.1.0,
release AAB built + device-verified 2026-05-21):

- `docs/05_PLAY_CONSOLE_UPLOAD_CHECKLIST.md` — linear console walkthrough
- `docs/04_PLAY_LISTING_COPY.md` — listing copy (lengths pre-validated)
- `docs/06_PRIVACY_POLICY_HOSTING.md` — privacy-policy hosting plan
- `scripts/01_create_keystore.sh` — interactive keystore creation (run WITH user)
- `scripts/02_build_release_aab.sh` — signed release AAB build
- `scripts/04_install_aab_on_device.sh` — MIUI-aware bundletool install
- `store-assets/` — 512×512 icon, 1024×500 feature graphic, 6 phone screenshots
- **bundletool v1.18.1** at `~/.local/bin/bundletool` ✅
- **Stalled at**: keystore creation (STATUS.md item 17) → signed AAB (18) →
  privacy hosting (20) → console upload (21). Items 1–16 all ✅.

*(A stale `qalarc_video_converter_publish` path appears in old rg indexes but
the directory doesn't exist — the live copy is the path above.)*

### 1.3 What does NOT exist (checked 2026-09-07)

- ❌ Play Developer API **service-account JSON** — searched
  `~/projects/{tradez,qalarc.ai,phone_projects,MASTER_PROJECTS}` for
  `service_account|com.google.play|play-publisher|fastlane` → only docs and
  this video-converter project's markdown; **no key files, no fastlane dirs**.
- ❌ fastlane / supply config anywhere
- ❌ gradle-play-publisher plugin in any build.gradle
- ❌ Play-App-Signing enrollment `[VERIFY in console]`

### 1.4 RWF's own Android artifacts (in this repo)

| Artifact | Package | Version | Signing key | Play-readiness |
|---|---|---|---|---|
| `apps/twa/` (bubblewrap TWA) | `com.qalarc.rwf` | 1.0.0 | `rwf.keystore` — **explicitly prototype-grade, "do NOT use for Play Store production"** (KEYSTORE.md) | Needs a fresh upload key + Play App Signing; assetlinks.json + SHA256 already wired for the domain ✅ |
| `apps/android/` (native WebView shell) | `com.qalarc.repswithfriends` | 0.1.0 | debug-key only | Needs release signing config; zero-dependency Kotlin shell, builds with Gradle 8.7/AGP 8.5 ✅ |

Both wrap `rwf.qalarc.com` — the PWA stays the product; the shell is
distribution. The TWA is the better Play citizen (launcher-quality,
address-bar-free via digital asset links); the native shell is the fallback
if we need WebView tweaks TWA can't do.

## 2. The account-level picture (what "publish other apps too" rides on)

- One Play developer account = unlimited apps, one $25 lifetime fee. Getting
  the account healthy once unblocks every future qalarc app (video converter,
  RWF, whatever's next).
- **Personal vs organization matters twice**:
  1. *Testing gate*: personal accounts created after 13 Nov 2023 must run a
     closed test with **≥12 testers opted in continuously for 14 days** and
     then apply for production access (3-section questionnaire, review ≤7
     days) before any app goes public. Organization accounts are exempt from
     the 12-tester requirement. Source: Play Console Help "App testing
     requirements for new personal developer accounts"
     (support.google.com/googleplay/android-developer/answer/14151465,
     fetched 2026-09-07). `[VERIFY which type alexei@qalarc.com is — this
     changes the launch runway by ~2-3 weeks]`
  2. *Trust*: org accounts (D-U-N-S number required since 2023 for new orgs)
     display a company name and survive founder-scale changes. For RWF under
     Narwhal Ent Pty Ltd (docs/27) an org account is the right end-state —
     `[VERIFY whether upgrading personal→org is possible without a new
     account; Google historically requires a new registration]`.
- Internal testing track: no requirements, builds live in seconds, up to 100
  testers. **This is where RWF Android pilots first.**
- Data safety / content rating / target-audience declarations are per-app
  (see §5).

## 3. The runbook — "get publishing working again"

### Phase A — founder-only (the 45-minute console session; agents cannot do any of this)

1. Log in at https://play.google.com/console as `alexei@qalarc.com` (2FA).
2. Screenshot/confirm: account type (personal/org), app list (expected empty),
   payment method still valid, phone/email contact current.
3. Pick the first app to upload. Recommendation: **the video converter** (it
   is 100% finished incl. assets and a device-verified AAB) — use it to
   re-activate the account and shake the rust off the checklist, THEN do RWF.
4. Do the keystore session with the agent driving
   (`bash scripts/01_create_keystore.sh` in the video-converter project) —
   founder picks + records the password (offline + password manager).
5. Upload the signed AAB to **Internal testing** following
   `docs/05_PLAY_CONSOLE_UPLOAD_CHECKLIST.md`.

### Phase B — founder enables automation (10 min, one time)

Follow fastlane supply's setup (docs.fastlane.tools/actions/supply/):

1. Play Console → **Account details** → note the linked Google Cloud project.
2. Google Cloud Console → enable the **Google Play Developer API** on that project.
3. Create a **service account** (`fastlane-supply`), no extra roles.
4. Create a **JSON key** for it; drop it somewhere private (NOT this repo —
   e.g. `~/.secrets/play-qalarc.json`, chmod 600, like the Resend key).
5. Play Console → **Users and permissions** → invite the service-account
   email → grant admin (or releases-only) permissions.
6. Tell the agent the path. Done — from here automation owns uploads.

### Phase C — agent-automated (no founder needed ever again for uploads)

1. First build of each app must be uploaded **manually once** (Play API
   limitation — supply can only update apps that exist), then:
   `fastlane supply --aab app.aab --track internal` (or `production`,
   `--rollout 0.1` for staged). AAB + metadata + screenshots + changelogs
   all scriptable; `supply init` pulls existing metadata into git.
2. Alternative for the gradle-inclined: gradle-play-publisher plugin
   (github.com/Triple-T/gradle-play-publisher) — same API, wired into
   `./gradlew publish`. fastlane is the more universal tool across our
   mixed bubblewrap/gradle/Flutter projects; pick one and standardise.
3. Signing discipline: **enroll Play App Signing** on first upload (Play
   holds the signing key; we keep an upload key). This makes keystore loss
   non-fatal forever after. For RWF: generate a NEW upload key — never
   reuse `apps/twa/rwf.keystore` (prototype key, password in git history).

## 4. RWF on Play — the sequenced plan

1. **Internal testing first** (pilot crews): upload the TWA AAB → add up to
   100 testers by email list → opt-in link. No review gate, no requirements,
   instant. This covers the whole AU pilot with zero policy exposure.
2. **Closed testing** when we want strangers: create a closed track, recruit
   (docs/08 §5 gyms/communities), 12+ testers for 14 continuous days if the
   account is personal-post-Nov-2023.
3. **Production access application** → then store launch with the listing
   (title/desc from our copy, 4–8 screenshots at 1080×2400, feature graphic,
   content rating questionnaire, target audience 18+ given stakes language).
4. Per-app declarations RWF will need (from docs/08 §3 groundwork):
   - **Data safety form**: declare collection of fitness/activity data,
     phone identifiers, and (if Cloud API rail) phone numbers; "no data
     shared with third parties" only if literally true once analytics land.
   - **Camera/mic permissions**: purpose strings + a camera-verification
     disclosure; expect extra review attention on any permission that looks
     surveillance-y. Our pose-counting is on-device — say so.
   - **No gambling declaration** as long as no money flows through the app
     (points trial, pot settled outside) — if money ever enters the app,
     Play has a real-money-games policy regime that is a different project.
   - Account deletion: Play requires an in-app path to account deletion
     `[VERIFY current enforcement date — was announced for 2024]` — trivial
     for us once auth exists.
5. Watch the TWA-specific trap: Play reviews TWAs for "minimum
   functionality" too — ensure the PWA has manifest, offline fallback,
   push, and app-like navigation (all already true).

## 5. Costs & lead times (planning numbers)

| Item | Cost | Lead time |
|---|---|---|
| Account (already paid, presumably) | $25 one-time | — |
| Internal testing live | $0 | minutes after upload |
| Closed-testing gate (if personal acct) | $0 | 14 days wall-clock |
| Production access review | $0 | ≤7 days stated |
| Service-account automation setup | $0 | 10 min founder + 1h agent |
| RWF upload key + keystore | $0 | 30 min with founder |
| Per-app store assets (icon/graphics/shots) | $0 (in-house) | ~1 day agent |

## What the founder does next

1. **Book the 45-min Phase A session** (console login + keystore + first
   upload of the finished video-converter AAB). Everything else unblocks
   from here. Say the word and the agent drives it live.
2. **Do Phase B** (service account + JSON key) in the same sitting — 10 extra
   minutes that convert publishing from "founder chore" to "agent routine".
3. **Confirm account type** (personal vs org) while logged in — it decides
   whether RWF's store launch has a 2–3-week testing gate in front of it.
4. Decide: video converter first (recommended, it's done), RWF TWA second.
5. Store the keystore passwords offline + password manager — the #1
   irreversible mistake available in this whole doc is losing a signing key
   after first upload (mitigated anyway by Play App Signing enrollment).

## Sources

- Play Console Help — testing requirements (12 testers / 14 days rule): https://support.google.com/googleplay/android-developer/answer/14151465 (fetched 2026-09-07)
- fastlane supply setup + AAB/tracks: https://docs.fastlane.tools/actions/supply/ (fetched 2026-09-07)
- Local inventory: `~/projects/phone_projects/launching_apps/video-converter/{STATUS.md,secrets/PLAY_ACCOUNT.md,docs/03,docs/05,scripts/}`; this repo `apps/twa/KEYSTORE.md`, `apps/android/README.md`
- Context: docs/08_LAUNCH_REQUIREMENTS.md §3 (Play requirements, data safety), agents/11-ops-deploy/BRIEF.md
