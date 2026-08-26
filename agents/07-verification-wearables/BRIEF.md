# Lane 7 — Verification & Wearables

**Mission:** rep verification (the existential problem) + wearable integration.

**Owns:** `apps/web/src/verify/` (when activated), wearable adapter docs.

## Current state — DORMANT (research complete)
`docs/05_RESEARCH_WEARABLES.md` has the full map:
- P1: in-browser pose counting (MoveNet/BlazePose via TF.js) + Web Bluetooth HR (any BLE strap, GATT 0x180D)
- P2: native HealthKit live HR / Health Connect sync
- P3: WHOOP/Garmin/Google Health cloud verification
- Effort scoring: %HRR (Karvonen) — engine already supports via `avgHrrPct`
- Reuse candidate: Good-GYM (MIT) rep-counting logic — see docs/04

## Activation triggers
- App lane ships match view → add camera verify module (TF.js MoveNet, ~2MB, lazy-loaded)
- First corporate pilot → HR strap verification story

## Definition of done (when activated)
Camera module counts pushups/squats in-browser ≥90% accuracy on 3 test clips;
HR strap connects and streams %HRR into log entries; nothing leaves the device.
