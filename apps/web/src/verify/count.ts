// Lane 7 — pure rep-counting logic. No DOM, no TF: angle math + the
// angle-threshold state machine (Good-GYM approach, MIT). Kept separate so it
// can be unit-tested headlessly and reused by future verifiers (watch, IMU).

/** Keypoint score below this = ignored (MoveNet confidence). */
export const CONFIDENCE_FLOOR = 0.35;

/** "down" phase must persist this long before the return to "up" counts. */
export const DEBOUNCE_MS = 300;

export interface Keypoint {
  x: number;
  y: number;
  score: number;
  name?: string;
}

/** Angle a–b–c in degrees (0–180), measured at vertex b. */
export function angleAt(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number }
): number {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const magA = Math.hypot(abx, aby);
  const magC = Math.hypot(cbx, cby);
  if (magA === 0 || magC === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (magA * magC)))) * 180) / Math.PI;
}

/**
 * Tracked joint angle for a pose. `sides` is a pair of [start, vertex, end]
 * keypoint-name triples (left/right); sides whose three keypoints all clear
 * the confidence floor are averaged. null = not measurable this frame.
 */
export function trackedAngle(
  keypoints: Keypoint[] | undefined,
  sides: [string[], string[]],
  floor: number = CONFIDENCE_FLOOR
): number | null {
  if (!keypoints?.length) return null;
  const byName = new Map<string, Keypoint>();
  for (const k of keypoints) byName.set(k.name ?? (k as any).part, k);
  let sum = 0, n = 0;
  for (const [a, v, b] of sides) {
    const A = byName.get(a), V = byName.get(v), B = byName.get(b);
    if (A && V && B && A.score >= floor && V.score >= floor && B.score >= floor) {
      sum += angleAt(A, V, B);
      n++;
    }
  }
  return n > 0 ? sum / n : null;
}

export type RepPhase = "up" | "down" | null;
export type PushOutcome = "counted" | "down" | "up" | "holding" | "no-signal";

export interface RepCounter {
  readonly reps: number;
  readonly phase: RepPhase;
  /**
   * Feed one frame's tracked angle (null = person/joint not measurable).
   * Returns "counted" on the frame a rep is completed.
   */
  push(angle: number | null, nowMs: number): PushOutcome;
}

/**
 * Angle-threshold state machine:
 *   angle < downAngle → enter "down" (timestamped)
 *   angle > upAngle   → enter "up"; if the down phase had persisted ≥ debounce
 *                       without interruption, that down→up cycle = 1 rep.
 * Hysteresis (two thresholds) + the persistence window reject jittery frames.
 */
export function createRepCounter(
  spec: { downAngle: number; upAngle: number },
  debounceMs: number = DEBOUNCE_MS
): RepCounter {
  let reps = 0;
  let phase: RepPhase = null;
  let phaseAt = 0;
  let gapSince: number | null = null; // tracking lost at (null = signal healthy)
  return {
    get reps() { return reps; },
    get phase() { return phase; },
    push(angle, now): PushOutcome {
      if (angle == null) {
        if (gapSince == null) gapSince = now;
        // A dropout longer than the debounce invalidates the phase — the
        // person may have moved anywhere while untracked.
        if (phase != null && now - gapSince >= debounceMs) phase = null;
        return "no-signal";
      }
      // Signal is back. A long gap reset the phase; a brief dropout (< debounce)
      // is tolerated and the phase survives.
      gapSince = null;
      if (angle < spec.downAngle) {
        if (phase !== "down") {
          phase = "down";
          phaseAt = now;
          return "down";
        }
        return "holding";
      }
      if (angle > spec.upAngle) {
        if (phase === "down" && now - phaseAt >= debounceMs) {
          reps++;
          phase = "up";
          phaseAt = now;
          return "counted";
        }
        if (phase !== "up") {
          phase = "up";
          phaseAt = now;
          return "up";
        }
        return "holding";
      }
      return "holding"; // between thresholds — phase unchanged
    },
  };
}
