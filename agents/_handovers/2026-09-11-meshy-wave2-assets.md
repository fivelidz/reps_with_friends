# HANDOVER: meshy wave-2 asset library — 2026-09-11

## Shipped
- **10 meshy.ai assets** generated + downloaded to `site/models/meshy/wave2/` (canonical files; signed URLs expire, task ids in the manifest are the durable record):
  - Characters (refined PBR, **unrigged**): `athlete_f.glb` (ponytail, sportswear), `dad.glb` (60s heavyset), `teen.glb` (lanky, basketball shorts) — all T-pose, 100k-poly rig-eligible.
  - Props refined PBR: `trophy.glb` (v3 pot candidate), `floodlight.glb`, `stands.glb`.
  - Props **preview-grade** (material-less; vault cards tint them): `hurdle.glb`, `scoreboard.glb`, `jumprope.glb`, `bottle.glb`.
- **/avatars ASSET VAULT** — new section (`#vaultSection`/`#vaultGrid`): `VAULT` export in `site/model-avatars.js` + self-contained block at the end of `apps/avatars/avatars.js`. Lazy-WebGL turntable cards (context released 3 s off-screen, page ctx budget), spin toggle, per-asset tint for preview meshes, `vaultPerf` chip, test hook `window.__rwfVault`.
- Scheduler `site/models/meshy/wave2_run.py` (resume-capable; state `wave2_state.json`; event log `logs/wave2_scheduler.jsonl`).
- Ledger + post-mortem: `site/models/meshy/manifest_wave2.json`. docs/31 entry added.

## Verified
- 10/10 vault cards `ok:true` via page-truth; matrix-world **0 NaN** per asset; /avatars **0 console errors** (the phantom `ERR_FILE_NOT_FOUND Script` = a locally installed chrome extension's `page-script.js` — proven via CDP URL capture; harness uses `--disable-extensions`).
- Screenshots `*_wave2.png` → `apps/avatars/screenshots/` (10 cards + `wave2_vault_section.png`). Harness: `apps/avatars/test/wave2_shots.ts` (+ `_url.ts` variant that caught the extension).
- NOT verified: walk/run/squat deltas — **no rigged assets exist** (credit wall).

## Next agent should
- **When Meshy credits are refilled (~145 cr completes the wave):**
  1. Rig the 3 characters (`meshy.py rig <tag> <refine-task-id>` — refine ids are in `manifest_wave2.json`; 5 cr each) → `rename_bones.py in out` (Spine01→Spine1, Spine02→Spine2, neck→Neck) → install as `/models/meshy/wave2/<tag>_rigged.glb` → add MODELS entries (copy the `meshy-athlete` line pattern) → run `apps/avatars/test/meshy2_verify.ts` (22/22 joints, walk/run/squat deltas, 0 NaN) → remove the "rig pending" wording from the VAULT blurbs.
  2. Generate `bands` + `weights` (Reps Kits) + `medal` (wildcard) — params files already exist (`params_wave2_{bands,weights,medal}.json`), previews 20 + refines 10 each.
  3. Refine the 4 preview-grade props (10 cr each) — then drop their `tint` fields from `VAULT`.
- v3 trophy swap: DEFERRED deliberately — full recipe in `manifest_wave2.json` → `integration.trophy_v3` (primitives fallback pattern + light re-check + v3 e2e 69+35 validation).

## Gotchas hit
- **meshy.py `status` prints GLB URLs truncated to 120 chars** → CloudFront 403 (`Missing Key-Pair-Id`). Always download via `meshy.py download <taskid> <kind> <dest>` (refetches the full signed URL internally). Never parse printed URLs.
- **429 = plan's PENDING-TASK cap** (`NoMorePendingTasks`), not a rate limit — needs an in-flight-capped scheduler with backoff.
- **402 Insufficient funds** mid-chain when the balance empties: reserve headroom before submitting chains. Balance went 435 → 0; our tasks billed exactly 300 (per-task API table in the manifest); +135 drained externally on the shared key (unknown consumer — flagged to the founder).
- Two orphan duplicate previews (hurdle, jumprope) billed 20 cr each from a shell-extraction bug before the scheduler existed (`orphan_duplicate` ids in the manifest).
- A GLB can download truncated (dad.glb first pass, 1.1/12.4 MB) → three.js `Invalid typed array length`; validate magic + declared-total vs actual before shipping, and clear the chromium profile or you'll chase cache ghosts.
