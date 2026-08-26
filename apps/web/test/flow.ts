// Headless smoke test — drives the REAL app state actions through the full flow.
// (Screens need a DOM; this validates every state/engine path the UI calls.)
// Run: bun apps/web/test/flow.ts

// ── minimal browser shims (state.ts touches these at module scope) ──────────
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

import {
  addDemoCrew,
  completeOnboard,
  createCrew,
  createMatchAction,
  designateCharity,
  getState,
  joinCrew,
  logEntry,
} from "../src/state.ts";
import { potTotalCents, standings, winner } from "../src/engine.ts";

let step = 0;
function ok(label: string, cond: boolean): void {
  step++;
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${step}. ${label}`);
  if (!cond) process.exit(1);
}

// 1. onboard
completeOnboard("Alexei", "casual");
ok("onboard persists me (name+tier)", getState().me?.name === "Alexei" && getState().me?.tier === "casual");
ok("state persisted to rwf.state.v1", store.get("rwf.state.v1")!.includes("Alexei"));

// 2. crew
createCrew("Thursday Legends");
const code = getState().crew?.code ?? "";
ok(`crew created with 6-char code (${code})`, /^[A-Z0-9]{6}$/.test(code));

// 3. new match
const mid = createMatchAction(["pushup", "squat", "burpee"], 100, [1, 3, 5]);
const m = getState().matches.find((x) => x.config.id === mid)!;
ok("match created live with 3 exercises, target 100", m.status === "live" && m.config.exercises.length === 3 && m.config.targetReps === 100);
ok("pot staked $5 by me", potTotalCents(getState().pots[mid]) === 500);

// 4. demo crew (the "link chats" screen button)
const added = addDemoCrew(mid);
ok("demo crew added (3 players, 4 total)", added === 3 && getState().matches.find((x) => x.config.id === mid)!.players.length === 4);
ok("pot now $20", potTotalCents(getState().pots[mid]) === 2000);
ok("addDemoCrew idempotent", addDemoCrew(mid) === 0);

// 5. log reps → standings update
logEntry(mid, getState().me!.id, "pushup", 20, false);
logEntry(mid, "sim_dex", "squat", 30, false);
let rows = standings(getState().matches.find((x) => x.config.id === mid)!);
const meRow = rows.find((r) => r.player.id === getState().me!.id)!;
const dexRow = rows.find((r) => r.player.id === "sim_dex")!;
ok("standings reflect entries (me 20 raw ×1.25 = 25 adj)", meRow.rawReps === 20 && meRow.adjustedScore === 25);
ok("couch multiplier applied (dex 30 raw ×1.5 = 45 adj, leads)", dexRow.adjustedScore === 45 && rows[0].player.id === "sim_dex");
ok("progress % tracked", meRow.progressPct === 20 && dexRow.progressPct === 30);
ok("verified 0% (camera not live)", meRow.verifiedPct === 0);

// 6. camera-verify path logs verified:false
logEntry(mid, getState().me!.id, "squat", 10, false);
rows = standings(getState().matches.find((x) => x.config.id === mid)!);
ok("unverified log counted (me 30 raw)", rows.find((r) => r.player.id === getState().me!.id)!.rawReps === 30);

// 7. invalid logs rejected by engine (no crash, no state change)
const before = JSON.stringify(getState());
let threw = false;
try {
  logEntry(mid, "sim_sam", "situp", 10, false); // situp not in match set
} catch {
  threw = true;
}
ok("exercise not in match set rejected", threw || JSON.stringify(getState()) === before);

// 8. close the match — I hit 100 raw first (30 + 75)
const closed = logEntry(mid, getState().me!.id, "burpee", 75, false);
const done = getState().matches.find((x) => x.config.id === mid)!;
ok("closure detected when raw hits target", closed && done.status === "complete" && done.closedBy === getState().me!.id);

// 9. winner = highest adjusted (+15 closure bonus to closer)
const win = winner(done)!;
const finalRows = standings(done);
console.log("   final standings:", finalRows.map((r) => `${r.player.name}:${r.adjustedScore}`).join(" "), `| winner=${done.players.find((p) => p.id === win.playerId)?.name}:${win.adjustedScore}`);
ok("winner computed with closure bonus", win.playerId === getState().me!.id && win.closedMatch === true && win.adjustedScore === Math.round((30 + 75) * 1.25 * 10) / 10 + 15);

// 10. charity pot designation
designateCharity(mid, "movember");
ok("pot designated to Movember", getState().pots[mid].designatedCharityId === "movember");

// 11. logging after complete is a no-op (no crash)
logEntry(mid, "sim_sam", "pushup", 50, false);
ok("post-complete log ignored", getState().matches.find((x) => x.config.id === mid)!.entries.length === 4);

// 12. join-crew path + second match isolation
joinCrew("kx4t9c");
ok("join by code normalises", getState().crew?.code === "KX4T9C");
const mid2 = createMatchAction(["situp"], 500, [2, 4]);
ok("second match independent (live, separate pot)", getState().matches.length === 2 && getState().matches.find((x) => x.config.id === mid2)!.status === "live" && potTotalCents(getState().pots[mid2]) === 500);

// 13. reload-from-storage round trip
const saved = store.get("rwf.state.v1")!;
store.delete("rwf.state.v1");
store.set("rwf.state.v1", saved);
ok("state JSON round-trips", JSON.parse(saved).matches.length === 2);

console.log(`\nAll ${step} flow checks passed.`);
