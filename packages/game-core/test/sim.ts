// Simulation: a full 300-format match with mixed-fitness players.
// Run: bun run packages/game-core/test/sim.ts
//
// Demonstrates the core thesis: the athlete closes the match, but the couch
// player's effort-adjusted score can still take the day.

import { createMatch, startMatch, logReps, standings, winner } from "../src/match.ts";
import { createPot, contribute, potTotalCents, designate } from "../src/pot.ts";
import type { Player, RepEntry } from "../src/types.ts";

const players: Player[] = [
  { id: "ben", name: "Ben", tier: "athlete", baselineHrrPct: 75 },
  { id: "alexei", name: "Alexei", tier: "casual" },
  { id: "nico", name: "Nico", tier: "fit" },
  { id: "dave", name: "Dave", tier: "couch" },
];

const match = startMatch(
  createMatch(
    {
      id: "m001",
      exercises: [
        { id: "pushup", name: "Push-ups" },
        { id: "squat", name: "Squats" },
        { id: "situp", name: "Sit-ups" },
      ],
      targetReps: 300,
      playDays: [2, 4], // Tue & Thu — the group picked its days
    },
    players
  )
);

let state = match;
const log = (playerId: string, exerciseId: string, reps: number, verified = false, avgHrrPct?: number) => {
  const entry: RepEntry = { playerId, exerciseId, reps, at: Date.now(), verified, avgHrrPct };
  const res = logReps(state, entry);
  state = res.state;
  return res.closedMatch;
};

// A scrappy match: Dave goes hard (camera-verified), Ben is efficient but
// low-effort (HR data shows it), Alexei manual-logs, Nico mixes it up.
log("dave", "pushup", 40, true, 82);
log("ben", "pushup", 60, true, 62); // athlete cruising — low %HRR vs baseline
log("alexei", "squat", 35);
log("nico", "situp", 50, true);
log("dave", "squat", 45, true, 85);
log("ben", "squat", 70, true, 60);
log("alexei", "pushup", 30);
log("nico", "pushup", 55, true);
log("dave", "situp", 50, true, 80);
log("ben", "situp", 65, true, 58);
log("alexei", "situp", 40);
log("nico", "squat", 60, true);
log("dave", "pushup", 55, true, 88);
log("ben", "pushup", 60, true, 61);
log("ben", "squat", 45, true, 59); // Ben hits 300 raw → closes the match
const closedBy = "ben";

console.log(`\n=== Match ${state.config.id} — ${state.status} (closed by ${closedBy}) ===\n`);
console.log("Standings (handicapped):");
for (const [i, row] of standings(state).entries()) {
  console.log(
    `  ${i + 1}. ${row.player.name.padEnd(8)} raw=${String(row.rawReps).padStart(3)}  ` +
    `adjusted=${String(row.adjustedScore).padStart(6)}  ` +
    `progress=${String(row.progressPct).padStart(5)}%  verified=${row.verifiedPct}%`
  );
}

const w = winner(state)!;
const winnerName = players.find((p) => p.id === w.playerId)!.name;
console.log(`\nWINNER: ${winnerName} (adjusted ${w.adjustedScore}) — closed by Ben but effort wins the day: ${!w.closedMatch}`);

// Charity pot
let pot = createPot("pot001", "m001");
pot = contribute(pot, "ben", 1000);
pot = contribute(pot, "alexei", 1000);
pot = contribute(pot, "nico", 1000);
pot = contribute(pot, "dave", 1000);
pot = designate(pot, { id: "beyond_blue", name: "Beyond Blue" });
console.log(`\nCharity pot: $${potTotalCents(pot) / 100} → ${pot.designatedCharityId} (winner ${winnerName} picks)\n`);
