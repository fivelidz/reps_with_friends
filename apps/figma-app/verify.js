/* ═══════════════════════════════════════════════════════════════════════
   RWF VERIFY — camera rep counting.
   Part 1 is a faithful JS port of apps/web/src/verify/count.ts (Lane 7,
   pure logic: angle math + the angle-threshold state machine, Good-GYM
   approach, MIT). Parity is proven in engine.test.js.

   CAMERA DECISION (2026-08-29): the figma-app is offline-only (SW, no
   CDNs, no new deps). Pose detection needs a model — apps/web loads
   MoveNet/TF from a CDN at runtime, and no pose model is vendored in this
   repo, so a working pose counter cannot ship here without breaking the
   offline rule. The counting LOGIC is ported (below, tested); the camera
   overlay (part 2) opens a real getUserMedia preview and points at the
   prototype app (/app) for the full pose-verified experience.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Part 1: angle-threshold rep counter (spec: verify/count.ts) ─────── */

/** Keypoint score below this = ignored (MoveNet confidence). */
export const CONFIDENCE_FLOOR = 0.35;

/** "down" phase must persist this long before the return to "up" counts. */
export const DEBOUNCE_MS = 300;

/** Angle a–b–c in degrees (0–180), measured at vertex b. */
export function angleAt(a, b, c) {
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
export function trackedAngle(keypoints, sides, floor = CONFIDENCE_FLOOR) {
  if (!keypoints?.length) return null;
  const byName = new Map();
  for (const k of keypoints) byName.set(k.name ?? k.part, k);
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

/**
 * Angle-threshold state machine:
 *   angle < downAngle → enter "down" (timestamped)
 *   angle > upAngle   → enter "up"; if the down phase had persisted ≥ debounce
 *                       without interruption, that down→up cycle = 1 rep.
 * Hysteresis (two thresholds) + the persistence window reject jittery frames.
 */
export function createRepCounter(spec, debounceMs = DEBOUNCE_MS) {
  let reps = 0;
  let phase = null;
  let phaseAt = 0;
  let gapSince = null; // tracking lost at (null = signal healthy)
  return {
    get reps() { return reps; },
    get phase() { return phase; },
    push(angle, now) {
      if (angle == null) {
        if (gapSince == null) gapSince = now;
        // A dropout longer than the debounce invalidates the phase — the
        // person may have moved anywhere while untracked.
        if (phase != null && now - gapSince >= debounceMs) phase = null;
        return "no-signal";
      }
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

/* ── Part 2: camera overlay (honest preview — see decision note above) ── */

/**
 * Opens a full-screen overlay: live camera preview (getUserMedia) + the
 * honest note that pose-counted verification runs in the prototype app.
 * Returns a close() fn. Never throws — failures render inline.
 */
export function openCameraNote() {
  document.querySelectorAll(".fx-camnote[data-global]").forEach((n) => n.remove());
  const root = document.createElement("div");
  root.className = "fx-scrim fx-camnote";
  root.dataset.global = "1";
  root.innerHTML = `
    <div class="fx-sheet fx-camnote__sheet">
      <div class="fx-sheet__grab"></div>
      <h2 class="fx-sheet__h fx-sheet__h--20">CAMERA VERIFY</h2>
      <div class="fx-camnote__stage"><video class="fx-camnote__video" autoplay playsinline muted></video>
        <span class="fx-camnote__tag">LIVE PREVIEW</span></div>
      <p class="fx-camnote__body">The angle-threshold rep counter is ported into this app
        (<code>verify.js</code> — unit-tested against the prototype's logic), but the pose
        model (MoveNet) is a runtime download the offline build doesn't bundle.</p>
      <p class="fx-camnote__body"><b>Pose-counted logging lives in the prototype app:</b></p>
      <a class="fx-camnote__link" href="/app" target="_blank" rel="noopener">OPEN THE PROTOTYPE APP →</a>
      <button class="fg-sheet__cta" data-camnote-close>DONE</button>
    </div>`;
  document.body.appendChild(root);
  const video = root.querySelector("video");
  let stream = null;
  const close = () => {
    stream?.getTracks().forEach((t) => t.stop());
    root.remove();
  };
  root.querySelector("[data-camnote-close]").addEventListener("click", close);
  root.addEventListener("click", (e) => { if (e.target === root) close(); });
  if (navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((s) => {
        stream = s;
        video.srcObject = s;
      })
      .catch(() => {
        root.querySelector(".fx-camnote__stage").innerHTML =
          `<div class="fx-camnote__off">CAMERA UNAVAILABLE<br>(or permission denied)</div>`;
      });
  } else {
    root.querySelector(".fx-camnote__stage").innerHTML =
      `<div class="fx-camnote__off">NO CAMERA API<br>IN THIS CONTEXT</div>`;
  }
  return close;
}
