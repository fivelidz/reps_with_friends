# HANDOVER: SOT app — offline card queue (cloud groups) — 2026-09-10

## Shipped
- **The ask:** "people can still log reps but get the powerup impacts when they reconnect." Card plays offline in a CLOUD group used to just error; now they queue exactly like sets.
- **Conn shim (`apps/sot/app.js`)**: queue items now carry `kind:"log" | "cmd"`. Logs unchanged (`{id, exerciseId, amount}`). Cmds: `{id, kind:"cmd", clientCmdId, text, label, code, queuedAt}` — `text` is the exact chat command the bots send (lightning / steal @name / shield / freeze / bomb @name / rope @name — `CARD_CMDS` map), `label` is the card name for toasts, `code` is the crew the cmd belongs to. Pre-cmd entries (no kind) replay as logs.
- **Card-play path** (`renderOverlay` → `confirmCard` Confirm): when `Conn.mode !== "online"` AND the group is a cloud group → `Conn.enqueueCmd(...)` + `cardQueued` overlay ("QUEUED — PLAYS WHEN YOU RECONNECT", chips, remove-from-queue). The card is NOT played locally — no optimistic local effect (server is the authority; a local effect would be wiped by the next poll merge). Online cloud + all local groups behave exactly as before.
- **Replay** (`replayQueuedLogs`): two passes — logs first, then cmds — cmds go through `RWFCloud.cmd(groupId, text, clientCmdId)` (cloud.js `cmd()` gained an optional idempotency id; default generator preserved for closeDay). Refusals (bus replies `⚠️ …` or "Unknown command" with HTTP 200) DROP the cmd with a toast: `cmdFailReason()` maps day-closed → "<Card> expired while offline — dropped"; unknown verb → "the crew server can't play that card yet". Network failures keep the cmd queued (same as logs). Cmds replay against the crew stored in `q.code`, not the currently-active group.
- **`RWFCloud.resync(groupId)`** (cloud.js): zeroes the poll cursor + full `syncNow`. Real bug found on the way: a fresh creator's mirror NEVER merged the server day — the join snapshot that set `since` already contains the opened day, so every poll answered `unchanged`. e2e-states section 5 uses resync after startSeason; a future pull-to-refresh can too.

## Verified
- `bun apps/sot/e2e-states.mjs` → **82/82** (was 59; new state 5 = offline card queue):
  - cloud crew (in-process apps/api, same pattern as e2e-cloud) → offline → play Lightning → queue holds `{kind:"cmd", text:"lightning", clientCmdId, label:"Lightning Round", code}`; queued sheet shows; NO local storm, card still in hand.
  - reconnect → toast "Lightning Round played"; queue empty; mirror shows ×3 storm + spent hand; **server truth checked node-side** via `GET /state` with the app's own token: `day.lightning[pid]` live, card removed from server hand.
  - expiry-drop: shield queued offline → creator force-closes the day via `/cmd "day close force"` (node-side, creator token) → reconnect → toast "Group Shield expired while offline — dropped"; queue empty; no local shield ever existed; server day closed, shield unspent.
  - zero console errors across the whole walk.
- All existing suites green: **129/129** (e2e.mjs) · **58/58** (e2e-cards) · **80/80** (e2e-tutorial) · **24/24** (e2e-cloud — exercises the new `cmd()` signature via closeDay) · cards.test **31 pass** (`bun test apps/sot/cards.test.js`).
- Dev server: `setsid nohup bun serve.ts > /tmp/rwf-serve.log 2>&1 < /dev/null &` (was already running on 4173 from a prior session — that's fine, suites self-host on 4194–4197).

## Gotchas hit
- `createForLocalGroup(g)` takes the GROUP OBJECT, not its id (I passed `g.id` first — the API's "name is required" is the tell).
- A creator's fresh cloud mirror needs `resync()` — `syncNow` alone returns `unchanged` forever (cursor already covers the day-open; see above).
- The app's 5s poll keeps running while SIMULATED offline (the shim only gates app-initiated calls) — handy for tests ("world moved on" merges arrive on their own) and the reason the expiry-drop case works without any file surgery.
- The engine's `snapshot()` can return an ended battle with `core` nulled locally after resolution — guard `battle.core` reads in assertions.
- Card flips need two `.pu-card` clicks with a re-render between (CSS 3D flip replaces nodes).
- Server kit order is `DEFAULT_DAY_KIT` = [lightning, steal, shield, freeze, surprise_bomb, rescue_rope] — grid index is stable after spending lightning.

## Next agent should
- If the server kit grows beyond the canon six, add bus verbs for exercise/rivalry/proof cards — those queue today and drop on replay with "the crew server can't play that card yet" (honest, but a dead end until verbs exist).
- Consider surfacing queued CARD plays on the offline banner (currently the badge counts them, the banner copy only mentions logging).
- Non-canon failure path is untested in e2e (can't occur with the current server kit); if you touch `CARD_CMDS`, extend state 5 first.
- Docs: wave appended to docs/31_PROGRESS_LOG.md (2026-09-10 entry). No commits made (per instructions).
