// Lane 7 unit tests — pure rep-counting logic (no DOM, no TF).
// Run: bun apps/web/test/verify-unit.ts
import {
  angleAt,
  createRepCounter,
  trackedAngle,
  type Keypoint,
} from "../src/verify/count.ts";
import { karvonenHrr, parseHeartRateMeasurement } from "../src/verify/hr.ts";

let step = 0;
function ok(label: string, cond: boolean): void {
  step++;
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${step}. ${label}`);
  if (!cond) process.exit(1);
}

// ── angle math ───────────────────────────────────────────────────────────────
const P = (x: number, y: number, score = 1): Keypoint => ({ x, y, score });
ok("right angle = 90°", Math.abs(angleAt(P(0, 0), P(0, 1), P(1, 1)) - 90) < 0.001);
ok("straight line = 180°", Math.abs(angleAt(P(0, 0), P(0.5, 0), P(1, 0)) - 180) < 0.001);
ok("135° bend (left then up-right)", Math.abs(angleAt(P(0, 0), P(1, 0), P(2, 1)) - 135) < 0.001);

// ── trackedAngle: confidence floor + side averaging ──────────────────────────
const squatSides: [string[], string[]] = [
  ["left_hip", "left_knee", "left_ankle"],
  ["right_hip", "right_knee", "right_ankle"],
];
const straight = (n: string, x: number): Keypoint => ({ name: n, x, y: 0, score: 0.9 });
const bent = (n: string, x: number, y: number): Keypoint => ({ name: n, x, y, score: 0.9 });

// left side straight (180°), right side bent (90°) → average 135
const pose: Keypoint[] = [
  straight("left_hip", 0), straight("left_knee", 1), straight("left_ankle", 2),
  bent("right_hip", 0, 0), bent("right_knee", 1, 0), bent("right_ankle", 1, 1),
];
ok("trackedAngle averages confident sides", Math.abs(trackedAngle(pose, squatSides)! - 135) < 0.001);

// low-confidence keypoints are excluded
const lowConf = pose.map((k) => (k.name === "left_knee" ? { ...k, score: 0.2 } : k));
ok("low-confidence side excluded (90° only)", Math.abs(trackedAngle(lowConf, squatSides)! - 90) < 0.001);

// all below floor → null
const allLow = pose.map((k) => ({ ...k, score: 0.1 }));
ok("all keypoints below floor → null", trackedAngle(allLow, squatSides) === null);
ok("empty pose → null", trackedAngle([], squatSides) === null);

// ── rep counter state machine (squat: down<100, up>150, 300ms debounce) ──────
const squat = { downAngle: 100, upAngle: 150 };

// A clean slow rep: 170 → 80 (hold 500ms) → 170 = 1 rep
let c = createRepCounter(squat);
let t = 0;
const feed = (angle: number | null, dt: number): string => {
  t += dt;
  return c.push(angle, t);
};
feed(170, 100); // standing
feed(80, 400); // descend → down
const r1 = feed(80, 500); // hold the bottom
ok("bottom hold returns holding", r1 === "holding");
const counted = feed(170, 400); // stand up → count
ok("slow squat cycle counts 1 rep", counted === "counted" && c.reps === 1);

// Fast jitter: 170 → 95 → 170 all within <300ms = no rep
c = createRepCounter(squat);
t = 0;
feed(170, 50);
feed(95, 80); // down at t=130
const jitter = feed(170, 100); // up at t=230 — down phase only 100ms old
ok("jitter crossing (down <300ms) does NOT count", jitter !== "counted" && c.reps === 0);

// Partial rep: 170 → 120 (never below 100) → 170 = no rep
c = createRepCounter(squat);
t = 0;
feed(170, 50);
feed(120, 500); // between thresholds — no phase change
feed(170, 500);
ok("partial depth (never <100°) does NOT count", c.reps === 0);

// Multiple reps
c = createRepCounter(squat);
t = 0;
for (let i = 0; i < 3; i++) {
  feed(170, 300);
  feed(80, 300);
  feed(80, 300); // hold bottom >300ms total
  feed(170, 300);
}
ok("3 clean cycles = 3 reps", c.reps === 3);

// Signal loss mid-rep: a LONG dropout (≥ debounce) invalidates the phase…
c = createRepCounter(squat);
t = 0;
feed(170, 50);
feed(80, 400);
feed(null, 100); // dropout starts at the bottom
feed(null, 500); // …and lasts ≥300ms → phase reset
feed(170, 400); // returns standing — nothing counted
ok("long dropout at the bottom does NOT count a stale rep", c.reps === 0);

// …but a BRIEF dropout (< debounce) is tolerated
c = createRepCounter(squat);
t = 0;
feed(170, 50);
feed(80, 400);
feed(null, 100); // 100ms blip
feed(170, 400);
ok("brief dropout mid-rep still counts", c.reps === 1);

// Pushup thresholds: down<90, up>160
const pushup = { downAngle: 90, upAngle: 160 };
c = createRepCounter(pushup);
t = 0;
feed(165, 100);
feed(85, 400);
feed(85, 300);
feed(162, 400);
ok("pushup cycle counts with its own thresholds", c.reps === 1);

// ── HR parsing + Karvonen ────────────────────────────────────────────────────
// UINT8 BPM: flags 0x00, bpm 72
const u8 = new DataView(new Uint8Array([0x00, 72]).buffer);
ok("UINT8 BPM parsed (72)", parseHeartRateMeasurement(u8) === 72);
// UINT16 LE BPM: flags 0x01, bpm 0x0110 = 272 (LE bytes 10 01)
const u16 = new DataView(new Uint8Array([0x01, 0x10, 0x01]).buffer);
ok("UINT16 LE BPM parsed (272)", parseHeartRateMeasurement(u16) === 272);
// Energy-expended + RR-interval flags present (0x08|0x10) — BPM still first
const flags816 = new DataView(new Uint8Array([0x19, 150, 0x00, 0x00, 0x30, 0x39]).buffer);
ok("flags with energy/RR don't break BPM (150)", parseHeartRateMeasurement(flags816) === 150);

// Karvonen: resting 60, age 35 → max 185, span 125
// bpm 60 → 0%, bpm 185 → 100%, bpm 142 → 65.6%
ok("Karvonen 0% at resting", Math.abs(karvonenHrr(60, 60, 35)) < 0.001);
ok("Karvonen 100% at max", Math.abs(karvonenHrr(185, 60, 35) - 100) < 0.001);
ok("Karvonen 142bpm = 65.6%", Math.abs(karvonenHrr(142, 60, 35) - 65.6) < 0.001);
ok("Karvonen clamps below zero", karvonenHrr(40, 60, 35) === 0);

console.log(`\nAll ${step} verify unit checks passed.`);
