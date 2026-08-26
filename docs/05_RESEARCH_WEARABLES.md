# Reps With Friends — Wearable & Sensor Integration Research

**Date:** 2026-08-26 · **Type:** Research only (no code) · **Sources:** live fetches of vendor developer docs + GitHub API searches. Items I could not verify against a primary source are marked **[VERIFY]**.

---

## TL;DR

1. **Cheapest real-time rep counting = phone camera + pose estimation** (MediaPipe Pose / MoveNet / ML Kit). Free, on-device, ~30fps, no vendor approval, works in a browser via a chat link.
2. **Cheapest real-time heart rate = standard BLE Heart Rate Service (0x180D)** — any chest/arm strap (Polar H10, Garmin, Wahoo) broadcasts it. No vendor API needed. On Apple Watch, HealthKit `HKWorkoutSession` gives live high-frequency HR for free.
3. **Every cloud wearable API (WHOOP, Garmin, Fitbit→Google Health, Oura, Strava, Polar AccessLink) is sync-only** — fine for post-game effort verification and handicap baselines, useless for in-game live scores.
4. **Effort scoring should use %HRR (Karvonen)** — it normalises against the player's *own* resting + max HR, which is exactly the "effort relative to baseline beats raw fitness" mechanic.
5. **Landmines (Aug 2026):** Fitbit Web API is deprecated **this month** (Sept 2026) → migrate to Google Health API. Google Fit APIs are dead to new developers. Strava app creation now requires a paid Strava subscription. WHOOP dev requires an active WHOOP membership.

---

## 1. Phone/Watch Sensor Rep Counting (no wearable purchase needed)

### 1.1 Android

| Capability | API | Notes |
|---|---|---|
| Raw motion | `android.hardware.SensorManager` — `TYPE_ACCELEROMETER`, `TYPE_GYROSCOPE`, `TYPE_LINEAR_ACCELERATION` (~50 Hz typical) | Free, no auth, real-time. Classic peak-detection (low-pass filter → peak/valley counter) works well for **pushups/situps with phone on the floor**, and squats with phone in a pocket/armband. No maintained OSS library exists for this — you'd write ~100 lines of DSP. |
| Health data store | **Health Connect** (`androidx.health.connect`, on-device) | `ExerciseSessionRecord` (with `ExerciseSegment`, which carries a `reps` field in recent versions **[VERIFY]**), `HeartRateRecord` (per-sample), steps, sleep. **Sync-only** — apps write after the session ends. No rate limits (on-device). Permission-gated per record type via the Health Connect UI. |
| ~~Google Fit~~ | Fitness REST + Sensors APIs | **DEPRECATED in 2026; closed to new developers since 1 May 2024** (verified on developers.google.com/fit). Do NOT build on it. Successors: Health Connect (on-device) + Google Health API (cloud). |
| Camera pose | **ML Kit Pose Detection** (free, on-device) | 33 skeletal landmarks incl. hands/feet, `InFrameLikelihood` confidence per landmark, experimental Z-coordinate. Base SDK: **~30 fps on Pixel 4-class Android, ~45 fps iPhone X-class iOS** (verified). "Accurate" SDK variant = slower, more precise. Beta status. |
| Camera pose (alt) | **MediaPipe Pose (BlazePose)** | 33 keypoints with x/y/z/visibility, Android/iOS/Python/JS, Apache-2.0, real-time on mid-range phones. Google's official *pose classification* recipe (KNN over per-frame pose embeddings) ships with pushup/squat examples — this is the canonical OSS rep-counting approach. |

### 1.2 iOS / watchOS

| Capability | API | Notes |
|---|---|---|
| Raw motion | **CoreMotion** (`CMMotionManager`, up to 100 Hz accel/gyro/deviceMotion; `CMSensorRecorder` for buffered raw; `CMPedometer`) | Free, real-time, only the "Motion & Fitness" permission toggle. Same DSP approach as Android. |
| Research-grade sensor archive | **SensorKit** (`SRSensorReader`) | Ambient all-day sensor logs (accelerometer, PPG, etc.), retrieved in ~7-day windows. Requires a special Apple entitlement and is research-oriented — **not suitable for real-time play**. Use CoreMotion. |
| Live workout HR | **HealthKit `HKWorkoutSession`** (watchOS 2.0+; mirrored to iPhone iOS 17+) | Verified from Apple docs: *"All workout sessions generate high-frequency heart-rate samples."* Live HR is read via `HKAnchoredObjectQuery`/`HKObserverQuery` on `HKQuantityType.heartRate` (typically 1–5 s cadence). Supports Live Activity on Lock Screen, Siri start/stop. **One session at a time per watch.** iPhone itself has no HR sensor — needs an external strap for workout HR (verified). |
| Camera pose | Apple **Vision** `VNDetectHumanBodyPoseRequest` (17 joints) or MediaPipe Pose | Free, on-device, real-time. |
| Rep data in HealthKit | `HKWorkoutBuilder` | Functional-strength activity types exist, but there is **no first-class "reps" quantity** — reps go in workout metadata **[VERIFY]**. Apple's own watch rep auto-detection is not exposed to third parties **[VERIFY]**. |

### 1.3 Open-source rep-counting repos (GitHub, searched 2026-08-26)

Notable finds (name · stars · approach):

- `yo-WASSUP/Good-GYM` · 397★ · real-time pose estimation + exercise counting + feedback (active, updated Aug 2026)
- `MichistaLin/mediapipe-Fitness-counter` · 131★ · pull-up/squat/push-up counter, MediaPipe + KNN classification
- `VNOpenAI/pushup-counter-app` · 82★ · BlazePose keypoints + action recognition, video/webcam
- `philippgehrke/SquatCounter` · 40★
- `bipinkc19/squat-counter` · 30★ · PoseNet
- `talha828/pushup-counter` · 23★ · Flutter + AI pose
- `Harrow-Enigma/pushup-counter` · 10★ · **TensorFlow.js** (browser — relevant for a no-install web MVP)
- `quickpose/*` examples · commercial iOS SDK (paid) squat/rep counters
- `aaronpk/PushupCounter-iOS` · nose-to-phone proximity trick (fun, not general)

**Key observation:** `gh search repos "rep counting accelerometer"` returned **zero** results — there is no maintained accelerometer rep-counting library. All active OSS is camera/pose-based. IMU-based exercise classification lives in academic datasets/models (PAMAP2, WISDM, UCI-HAR) — usable but you'd train/deploy yourself **[VERIFY current SOTA]**.

**Standard rep-counting algorithm** (what all the above do): compute a joint angle (e.g., elbow for pushups, knee for squats) from landmarks → hysteresis state machine (angle < ~90° = "down", > ~160° = "up", down→up = 1 rep) + confidence gating on landmark visibility + tempo (rep duration) for form checking.

---

## 2. Wearable Platform APIs

Legend: **Live** = usable during a game in progress; **Rep-level** = per-repetition data exists.

### 2.1 Apple HealthKit / watchOS
- **Data:** live HR in workout sessions (high-frequency, verified), HRV, resting HR, VO₂max, workouts; write-back of custom workouts.
- **Cost:** free; Apple Developer Program $99/yr only for App Store distribution.
- **Auth:** on-device per-type user consent. No cloud OAuth; your backend only ever sees what your own app forwards.
- **Rate limits:** none (local framework).
- **Live:** ✅ **YES** (watch workout session HR ~1 s cadence) — the only first-party *live* HR channel among the big platforms.
- **Rep-level:** ❌ (no native rep counting exposed; metadata workaround **[VERIFY]**).
- **Constraint:** requires building a watchOS app — highest engineering cost of the "free" options.

### 2.2 Google Health Connect (Android)
- **Data:** `ExerciseSessionRecord` (+ `ExerciseSegment` with reps **[VERIFY]**), `HeartRateRecord` samples, steps, sleep, etc.
- **Cost:** free. **Auth:** on-device permission prompts. **Rate limits:** none (on-device). Background read is restricted for some types **[VERIFY]**.
- **Live:** ❌ sync-only store. **Rep-level:** ⚠️ partial (segment reps **[VERIFY]**).
- **Role for RWF:** the Android *write* target (persist sessions so other fitness apps see RWF workouts) and *read* source for HR summaries.

### 2.3 Google Health API (successor to Fitbit Web API) — **breaking change this month**
- **Verified:** legacy **Fitbit Web API is deprecated September 2026**; migration to the **Google Health API** (developers.google.com/health). It unifies **Fitbit + Pixel Watch + third-party devices/apps** on Google's OAuth 2.0, HTTP + gRPC, "auto-subscribing webhooks", consolidated data-type bundles (100+ legacy endpoints → streamlined bundles), expanding write support.
- **Data (legacy surface, migrating):** Heart Rate Time Series (1-min/15-min intraday — intraday historically required approval **[VERIFY]**), **Active Zone Minutes** (a ready-made effort metric), activity, sleep, ECG, HRV, SpO₂, temperature; subscription webhooks.
- **Cost:** free **[VERIFY under new terms]**. Legacy rate limits were ~150 req/hr/user **[VERIFY]**; new API limits TBD.
- **Live:** ❌ sync + webhooks. **Rep-level:** ❌.

### 2.4 Garmin Connect Developer Program
- **Verified:** collection of cloud-to-cloud APIs — **Health API** (all-day HR, sleep, steps), **Activity API** (full data for 30+ activity types, downloadable activity files), **Women's Health API**, **Training API** (push structured workouts/training plans to users' Garmin devices!), **Courses API**.
- **Cost:** *"No licensing or maintenance fees… business use only. Access to some metrics may require a license fee or minimum device order."* (verified FAQ). Approval ≈2 business days; typical integration 1–4 weeks (verified).
- **Auth:** OAuth 2.0 (verified). **Rate limits:** "throttled access" in dev; production caps ~1,200 req/min/app + per-user daily caps + a Push/webhook API **[VERIFY exact numbers]**.
- **Live:** ❌ cloud sync-only (their docs explicitly point real-time seekers to the separate **Garmin Health SDKs** for direct BLE streaming from wearables — commercial program **[VERIFY terms]**).
- **Rep-level:** ⚠️ strength-training FIT files can contain set/rep structure; exposed via Activity API file downloads **[VERIFY]**.
- **FIT SDK:** free, open format — parse `.fit` files yourself if you want raw detail.

### 2.5 WHOOP
- **Status: Developer Platform is OPEN** (verified developer.whoop.com). OAuth 2.0 + **webhooks (v2)**; up to 5 apps per account; app approval required to launch publicly; **you must hold a WHOOP membership to develop** (verified).
- **Data:** physiological cycles (day strain 0–21), recovery (HRV, RHR, skin temp), sleep, workouts (sport, strain, avg/max HR **[VERIFY exact v2 fields]**). No beat-by-beat HR export.
- **Rate limits (verified):** **100 req/min and 10,000 req/day** per app; increases on request via dashboard.
- **Live:** ❌. **Rep-level:** ❌.
- **Why it matters for RWF:** WHOOP *strain* and *recovery* are literally "effort relative to your own baseline" — ideal for post-game effort verification and recovery-adjusted handicaps.

### 2.6 Fitbit Web API (legacy) — see §2.3
Deprecated Sept 2026. If you integrate anything Fitbit-shaped, target the **Google Health API** directly.

### 2.7 Polar
- **Polar API (AccessLink):** training sessions (HR zone summaries + samples), daily activity, sleep, body measurements. OAuth 2.0. Docs at polaraccesslink.com now sit behind a business contact form (verified) — production access appears agreement-gated **[VERIFY current cost/terms; historically free within rate limits]**.
- **Polar SDK (the gem):** free, open-source mobile SDK (iOS/Android) — `github.com/polarofficial/create-mobile-app-for-polar-sensors` (verified link from polar.com/developers) — streams **LIVE HR, live ECG, and live accelerometer** over BLE from H10 chest strap / Verity Sense armband. This is the cheapest gold-standard live-HR path for a custom app (H10 ≈ $90 hardware, no API approval, no rate limits).
- **Team Pro API:** team/coach telemetry (commercial).
- **Live:** ✅ via SDK (device→phone BLE); ❌ via AccessLink cloud. **Rep-level:** ❌.

### 2.8 Oura
- **V2 API** (cloud.ouraring.com): sleep, readiness, daily activity, workouts, tags. OAuth 2.. **10-user cap until app approval** (verified). Rate limit documented in V2 docs — 60 req/min **[VERIFY — page is JS-rendered, couldn't fetch]**.
- **Live:** ❌. **Rep-level:** ❌. **Role:** readiness → handicap modulation only.

### 2.9 Strava (aggregation layer)
- **Data:** activities (from nearly every device users own, since Garmin/Polar/etc. sync to Strava), activity streams incl. `heartrate` time series (owner-authenticated, `read_all` scope **[VERIFY]**), segments, clubs (club leaderboards!).
- **Cost:** free API, **but creating an app now requires a Strava subscription** (verified).
- **Auth:** OAuth 2.0; access tokens expire every 6 h (verified).
- **Rate limits (verified):** default single-player mode (only your own account); after upgrade: **10 athletes, 200 req/15 min & 2,000/day read, 400/15 min & 4,000/day overall**; scaling beyond 10 athletes requires app review. **Webhooks are mandatory** per API terms.
- **Live:** ❌. **Rep-level:** ❌ (endurance-oriented; strength workouts are opaque activities).
- **Role:** optional social/leaderboard glue, not core.

### 2.10 The open standard everyone forgets: BLE Heart Rate Service
Any BLE HR strap (Polar, Garmin, Wahoo, Coospo, Magene…) broadcasts the standard GATT **Heart Rate Service `0x180D`**, measurement characteristic `0x2A37`, ~1 Hz, with RR intervals on many straps. Readable via:
- Android `BluetoothGatt` (no special vendor permission),
- iOS CoreBluetooth,
- **Web Bluetooth API in Chrome/Edge on Android/desktop** — meaning a *browser* MVP can show live HR with zero native apps. ⚠️ Safari/iOS does not support Web Bluetooth **[VERIFY current status]**.

---

## 3. Heart-Rate Effort Scoring (the handicap engine)

Standard mechanisms used by fitness apps:

| Method | Formula | Used by | Notes |
|---|---|---|---|
| **%HRmax** | `HR / HRmax × 100` | everyone | HRmax ≈ `220 − age` (classic) or **Tanaka `208 − 0.7×age`** (better). Ignores personal baseline. |
| **%HRR (Karvonen)** | `(HR − RHR) / (HRmax − RHR)` | Polar, Orangetheory, most coaching apps | **Normalises to the individual** (resting HR from wearable). This is the RWF handicap primitive. |
| **TRIMP (Banister)** | `min × HRr × 0.64·e^(b·HRr)`, `HRr` = Karvonen ratio, b = 1.92 (M) / 1.67 (F) | TrainingPeaks, sports science | Duration-weighted session load; intensifies exponentially. |
| **Edwards TRIMP** | Σ (zone-minutes × 1…5) across 10%-of-HRmax bands | Garmin Connect (old), research | Trivial to compute from zone summaries. |
| **Zone minutes** | 5 zones: Z1 50–60% … Z5 90–100% HRmax | universal | Cheap, explainable. |
| **Active Zone Minutes** | Fat Burn 50–69% ×1, Cardio 70–84% ×2, Peak 85–100% ×3 (of HRmax) | **Fitbit/Google Health API — exposed as a first-class metric** | Default goal 150/day **[VERIFY]**. A free, vendor-computed effort score. |
| **Splat points** | minutes ≥ 84% HRmax | Orangetheory | Gamified zone-minutes — closest existing analogue to RWF scoring. |
| **Strain (0–21)** | %HRmax-weighted integral over the day | **WHOOP — exposed via API** | Effort vs *your* capacity, exactly the handicap concept. |
| **Training Effect / Load** | EPOC-model aerobic/anaerobic 0–5; 7-day load | Garmin (device-computed; summaries via API **[VERIFY exposure]**) | Good but opaque. |

**Recommended RWF mechanism (effort-relative-to-baseline):**

1. **Calibration (once, then rolling):** player does a fixed benchmark (e.g., max pushups in 60 s) while HR is recorded. Store personal `RHR`, `HRmax` (measured if possible, else Tanaka), and *baseline HR response* (Δ%HRR per 10 reps).
2. **Live score:** `effort_index = mean %HRR during set ÷ personal baseline %HRR for that exercise` → `points = reps × clamp(effort_index, 0.5…2.0)`. Fitter players must push harder HR-wise to earn the same multiplier; deconditioned players get fair credit for honest effort.
3. **Live HR sources (in order of cost):** BLE strap via Web Bluetooth → Apple Watch HKWorkoutSession → Polar SDK → phone-camera-only fallback (no HR; use tempo/ROM + RPE).
4. **Post-game verification (sync-only):** WHOOP workout strain, Google Health AZM, Garmin activity HR zones — cross-check self-reported effort; flag outliers.
5. **Recovery modulation (optional):** WHOOP recovery / Oura readiness scales the day's handicap (a 45%-recovered player earns a small multiplier boost).

---

## 4. Recommendation — Phased Integration

### Phase 1 — MVP (weeks, $0, zero vendor approvals)
- **Web app opened from the Slack/WhatsApp bot link**: camera rep counting with **MoveNet Lightning (TF.js)** or **MediaPipe Pose (JS)** — no install, runs in the browser on any phone.
- **Accelerometer fallback** via the web DeviceMotion API (phone on floor for pushups/situps) for poor lighting/no camera.
- **Optional live HR** via **Web Bluetooth** BLE 0x180D straps (Android/desktop Chrome).
- **Baseline:** calibration benchmark workout; effort = %HRR (or RPE fallback) vs personal baseline.
- *Why:* zero platform risk, zero auth flows, immediate group-chat playability.

### Phase 2 — Native apps + on-device health stores (1–2 quarters)
- **iOS + watchOS app:** `HKWorkoutSession` live HR + watch CoreMotion rep counting; Live Activity lock-screen scoreboard; write workouts back to HealthKit.
- **Android app:** SensorManager rep counting + ML Kit pose; read/write **Health Connect** (`ExerciseSessionRecord`, `HeartRateRecord`).
- App pushes live scores to your server → bot posts real-time group-chat updates.
- *Why:* unlocks the two biggest wearable user bases (Apple Watch ≈ largest smartwatch share; Health Connect is the Android hub) with no third-party business approvals.

### Phase 3 — Cloud wearable ecosystem (post-traction)
- **WHOOP** (webhooks, strain/recovery) → effort verification + recovery-adjusted handicap. Small but intensely engaged user base.
- **Garmin Connect** (Activity + Health APIs; Training API to push RWF workouts *onto* Garmin watches) → serious-fitness demographic; free but business approval.
- **Google Health API** (Fitbit + Pixel Watch; AZM) → mass-market reach; target this, *not* legacy Fitbit.
- **Oura** (readiness) → handicap modulation.
- **Strava** (optional) → club leaderboards/social glue.
- **Polar SDK** (optional) → in-app live chest-strap HR for accuracy purists.

### Comparison table

| Integration | Data richness | Live in-game? | Rep-level? | Integration cost | Addressable users | Approval friction |
|---|---|---|---|---|---|---|
| Phone camera (MediaPipe/MoveNet/ML Kit) | ⭐⭐⭐⭐ (reps + form) | ✅ | ✅ (you compute) | Very low (OSS, free) | ~everyone with a phone | None |
| Phone accelerometer (SensorManager/CoreMotion) | ⭐⭐ (reps only) | ✅ | ✅ (you compute) | Low | ~everyone | None |
| BLE HR strap (GATT 0x180D / Web Bluetooth) | ⭐⭐⭐ (live HR) | ✅ | ❌ | Low | strap owners | None |
| Apple HealthKit + watch app | ⭐⭐⭐⭐⭐ (live HR + motion) | ✅ | ⚠️ metadata only | High (watchOS app) | Apple Watch base (largest) | App Store review |
| Google Health Connect | ⭐⭐⭐ (sessions, HR samples) | ❌ sync | ⚠️ segment reps [VERIFY] | Medium | Android wearable base | Play Store review |
| Google Health API (Fitbit/Pixel) | ⭐⭐⭐ (AZM, HR zones, sleep) | ❌ sync+webhooks | ❌ | Medium | Fitbit + Pixel Watch mass market | OAuth + policy review |
| Garmin Connect APIs | ⭐⭐⭐⭐ (activities, FIT files, push workouts) | ❌ sync (+Health SDK for BLE) | ⚠️ FIT strength sets [VERIFY] | Medium-high | Serious athletes | Business approval (~2 days) |
| WHOOP API | ⭐⭐⭐⭐ (strain, recovery, HRV) | ❌ sync+webhooks | ❌ | Low-medium | WHOOP members | App approval; dev needs membership |
| Polar AccessLink / SDK | ⭐⭐⭐⭐ (cloud sessions; SDK = live ECG/HR/accel) | ✅ SDK / ❌ cloud | ❌ | Medium | Polar users (niche but accurate) | AccessLink agreement [VERIFY] |
| Oura API | ⭐⭐⭐ (sleep/readiness) | ❌ | ❌ | Low | Oura owners | 10-user cap until approved |
| Strava API | ⭐⭐⭐ (activities + HR streams) | ❌ | ❌ | Low | Strava athletes (huge) | Paid sub to create app; review >10 athletes |

---

## 5. Gotchas register

1. **Fitbit Web API dies Sept 2026** (now) — build against Google Health API. (verified)
2. **Google Fit APIs closed to new devs since May 2024**, deprecated 2026. (verified)
3. **Strava app creation requires a paid Strava subscription**; webhooks mandatory; >10 athletes needs review. (verified)
4. **WHOOP development requires an active WHOOP membership**; 100 req/min / 10k/day caps. (verified)
5. **Garmin program is business-use only**; some metrics may need license fees/min device orders. (verified)
6. **HealthKit has no cloud API** — you must ship an app to touch Apple Watch data.
7. **Web Bluetooth is unsupported on iOS Safari** [VERIFY] — iOS users need the native app or a BLE strap paired through it.
8. **No OSS accelerometer rep-counting library exists** — camera pose is the proven OSS path; IMU counting is DIY DSP or academic models.
9. **All cloud wearable APIs are sync-only** — design the game loop so live play runs on phone/watch sensors, and cloud data arrives as post-game verification.
10. Health Connect `ExerciseSegment` reps and Garmin FIT strength set/rep exposure are the two "rep-level data" claims I could not fully verify — confirm before relying on either.
