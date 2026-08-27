// Lane 7 — camera rep verification. On-device pose counting (MoveNet).
//
// Heavy deps (TF.js ~1MB + MoveNet Lightning weights) load from the jsdelivr
// CDN via lazy <script> injection the FIRST time a verifier opens — never on
// app boot, never bundled. Inference is 100% local: no frame ever leaves the
// device.
//
// CDN strategy note (verified empirically in headless Chromium, Aug 2026):
//   - jsdelivr "+esm" builds of pose-detection are BROKEN (its bundled import
//     of @mediapipe/pose/+esm lacks the named export `Pose`), and the raw
//     dist/pose-detection.esm.js uses bare specifiers ("@mediapipe/pose")
//     which browsers can't resolve. So much for CDN ESM.
//   - The UMD dists (tf.min.js + pose-detection.min.js) are the documented,
//     working path → window.tf / window.poseDetection. We inject those.

import { el } from "../ui.ts";
import {
  CONFIDENCE_FLOOR,
  createRepCounter,
  trackedAngle,
  type Keypoint,
  type RepCounter,
} from "./count.ts";

// ── public API ───────────────────────────────────────────────────────────────

export interface CameraVerifyResult {
  reps: number;
  durationMs: number;
  avgFps: number;
  exerciseId: string; // "pushup" | "squat"
}

export interface CameraVerifyOptions {
  /** Exercise to preselect (used only if supported AND in allowedExercises). */
  exerciseId?: string;
  /** Exercise ids valid for the current match (counting logs into the match). */
  allowedExercises?: string[];
  /** User confirmed a counted set → caller logs it with verified:true. */
  onDone: (r: CameraVerifyResult) => void;
  /** Sheet closed without confirming. */
  onCancel?: () => void;
}

export function openCameraVerifier(opts: CameraVerifyOptions): void {
  new CameraVerifier(opts).open();
}

// ── exercise specs (Good-GYM-style angle thresholds) ─────────────────────────

interface ExerciseSpec {
  id: string;
  name: string;
  /** [start, vertex, end] joint base names — tracked angle sits at the vertex. */
  points: [string, string, string];
  /** Angle below this = "down" phase entered. */
  downAngle: number;
  /** Angle above this = "up" phase (a rep counts on down→up). */
  upAngle: number;
  hint: string;
}

const EXERCISES: ExerciseSpec[] = [
  {
    id: "pushup",
    name: "Push-ups",
    points: ["shoulder", "elbow", "wrist"],
    downAngle: 90,  // elbows below 90° = bottom of the rep
    upAngle: 160,   // elbows past 160° = top → count
    hint: "Side-on to the camera. Shoulders, elbows and wrists in frame.",
  },
  {
    id: "squat",
    name: "Squats",
    points: ["hip", "knee", "ankle"],
    downAngle: 100, // knees below 100° = bottom of the rep
    upAngle: 150,   // knees past 150° = top → count
    hint: "Side-on to the camera. Hips, knees and ankles in frame.",
  },
];

// MoveNet COCO keypoint names (left/right merged at runtime).
const SIDES: Record<string, [string, string]> = {
  shoulder: ["left_shoulder", "right_shoulder"],
  elbow: ["left_elbow", "right_elbow"],
  wrist: ["left_wrist", "right_wrist"],
  hip: ["left_hip", "right_hip"],
  knee: ["left_knee", "right_knee"],
  ankle: ["left_ankle", "right_ankle"],
};

// Skeleton edges for the debug overlay.
const EDGES: [string, string][] = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
];

// ── CDN loader (lazy, memoised, retryable) ───────────────────────────────────

const CDN_TF = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js";
const CDN_POSE = "https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js";

interface PoseStack {
  tf: any; // window.tf
  pd: any; // window.poseDetection
}

let stackPromise: Promise<PoseStack> | null = null;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(s);
  });
}

/** WebGL capability check — runs before we pull megabytes of model code. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function loadPoseStack(): Promise<PoseStack> {
  if (!stackPromise) {
    stackPromise = (async () => {
      await injectScript(CDN_TF);
      await injectScript(CDN_POSE);
      const w = window as any;
      if (!w.tf || !w.poseDetection) throw new Error("TF.js CDN scripts loaded but globals missing");
      await w.tf.setBackend("webgl");
      await w.tf.ready();
      if (w.tf.getBackend() !== "webgl") throw new Error("WebGL backend failed to initialise");
      return { tf: w.tf, pd: w.poseDetection };
    })().catch((err) => {
      stackPromise = null; // allow a retry
      throw err;
    });
  }
  return stackPromise;
}

// ── geometry helpers ─────────────────────────────────────────────────────────

/** Angle a–b–c in degrees (0–180), measured at b. */
// ── the verifier sheet ───────────────────────────────────────────────────────

const X_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const FLIP_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 0 1-14.5 4.6M4 12A8 8 0 0 1 18.5 7.4"/><path d="M18.5 3v4.4h-4.4M5.5 21v-4.4h4.4"/></svg>';

/** Left/right keypoint-name triples for a spec's [start, vertex, end] joints. */
function specSides(spec: ExerciseSpec): [string[], string[]] {
  return [
    spec.points.map((j) => SIDES[j][0]),
    spec.points.map((j) => SIDES[j][1]),
  ];
}

class CameraVerifier {
  private readonly opts: CameraVerifyOptions;
  private readonly specs: ExerciseSpec[];
  private spec: ExerciseSpec;

  private overlay!: HTMLElement;
  private sheet!: HTMLElement;
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private countEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private hintEl!: HTMLElement;
  private stage!: HTMLElement;
  private controlsEl!: HTMLElement;
  private startBtn!: HTMLButtonElement;
  private exRow!: HTMLElement;
  private errorCard: HTMLElement | null = null;

  private closed = false;
  private running = false;
  private detector: any = null;
  private stream: MediaStream | null = null;
  private facing: "user" | "environment" = "user";
  private showSkeleton = false;
  private raf = 0;
  private busy = false;

  private counter: RepCounter = createRepCounter(EXERCISES[0]);
  private frames = 0;
  private startedAt = 0;
  private lastAngle: number | null = null;
  private camReady = false;
  private modelReady = false;

  constructor(opts: CameraVerifyOptions) {
    this.opts = opts;
    const allowed = opts.allowedExercises;
    this.specs = allowed ? EXERCISES.filter((e) => allowed.includes(e.id)) : EXERCISES.slice();
    this.spec = this.specs.find((e) => e.id === opts.exerciseId) ?? this.specs[0] ?? EXERCISES[0];
  }

  open(): void {
    this.buildDom();
    if (!this.specs.length) {
      this.showErrorCard(
        "No countable exercises in this match",
        "Camera counting currently supports push-ups and squats. This match has neither — log sets manually.",
        [{ label: "CLOSE", primary: true, fn: () => this.close(true) }]
      );
      return;
    }
    // Camera first (iOS wants getUserMedia close to the user gesture).
    void this.startCamera();
    if (!hasWebGL()) {
      this.showErrorCard(
        "No WebGL",
        "This browser can't run pose detection — WebGL is unavailable. Log your set manually instead.",
        [{ label: "CLOSE", primary: true, fn: () => this.close(true) }]
      );
      return;
    }
    void this.loadModel();
  }

  // ── DOM ───────────────────────────────────────────────────────────────────

  private buildDom(): void {
    this.video = el("video", {
      class: "verify-video",
      autoplay: "",
      playsinline: "",
      "aria-label": "Camera preview",
    }) as HTMLVideoElement;
    this.video.muted = true; // attribute alone is unreliable
    this.canvas = el("canvas", { class: "verify-canvas", "aria-hidden": "true" }) as HTMLCanvasElement;
    this.countEl = el("div", { class: "verify-count", text: "0" });
    this.stage = el("div", { class: "verify-stage" }, this.video, this.canvas, this.countEl);

    this.statusEl = el("div", { class: "verify-status", text: "Starting camera…" });
    this.hintEl = el("div", { class: "verify-hint", text: this.spec.hint });

    this.startBtn = el("button", {
      class: "rwf-btn rwf-btn--primary verify-start",
      type: "button",
      text: "GETTING READY…",
      disabled: true,
      onClick: () => (this.running ? this.stopCounting() : this.startCounting()),
    }) as HTMLButtonElement;

    const flipBtn = el("button", {
      class: "iconbtn verify-flip",
      type: "button",
      html: FLIP_ICON,
      title: "Switch camera",
      "aria-label": "Switch camera",
      onClick: () => void this.flipCamera(),
    });

    const skelBtn = el("button", {
      class: "chip chip--sm verify-skel",
      type: "button",
      text: "SKELETON OFF",
      "aria-pressed": "false",
      onClick: () => {
        this.showSkeleton = !this.showSkeleton;
        skelBtn.textContent = this.showSkeleton ? "SKELETON ON" : "SKELETON OFF";
        skelBtn.classList.toggle("on", this.showSkeleton);
        skelBtn.setAttribute("aria-pressed", String(this.showSkeleton));
        if (!this.showSkeleton) this.clearCanvas();
      },
    });

    this.exRow = el("div", { class: "chiprow verify-exrow" },
      ...this.specs.map((s) =>
        el("button", {
          class: `chip chip--sm ${s.id === this.spec.id ? "on" : ""}`,
          type: "button",
          text: s.name,
          "data-ex": s.id,
          onClick: () => this.selectExercise(s.id),
        })
      )
    );

    this.controlsEl = el("div", { class: "verify-controls" },
      el("div", { class: "verify-btnrow" }, flipBtn, skelBtn, this.startBtn)
    );

    this.sheet = el("div", { class: "verify-sheet", role: "dialog", "aria-modal": "true", "aria-label": "Camera rep verifier" },
      el("div", { class: "verify-grab" }),
      el("div", { class: "verify-head" },
        el("h2", { class: "h-display verify-title", text: "Camera verify" }),
        el("button", {
          class: "iconbtn", type: "button", html: X_ICON,
          "aria-label": "Close", onClick: () => this.close(true),
        })
      ),
      this.stage,
      this.exRow,
      this.hintEl,
      this.statusEl,
      this.controlsEl,
      el("p", { class: "verify-privacy", text: "Counting happens on this device. Nothing is uploaded." })
    );

    this.overlay = el("div", { class: "verify-overlay" }, this.sheet);
    // Overlay lives in #frame (not #app) so match-screen re-renders don't kill it.
    (document.getElementById("frame") ?? document.body).append(this.overlay);
    // Navigating away with the sheet open = cancel.
    window.addEventListener("hashchange", this.onHashChange);
  }

  private readonly onHashChange = (): void => this.close(true);

  private setStatus(msg: string | null): void {
    this.statusEl.textContent = msg ?? "";
    this.statusEl.classList.toggle("on", !!msg);
  }

  private syncStart(): void {
    const ready = this.camReady && this.modelReady;
    this.startBtn.disabled = !ready;
    if (!this.running) this.startBtn.textContent = ready ? "START" : "GETTING READY…";
  }

  // ── camera ────────────────────────────────────────────────────────────────

  private async startCamera(): Promise<void> {
    if (this.closed || !this.specs.length) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facing, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (this.closed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.attachStream(stream);
    } catch (err) {
      if (this.closed) return;
      this.camReady = false;
      this.syncStart();
      const e = err as DOMException;
      const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
      const missing = e?.name === "NotFoundError" || e?.name === "OverconstrainedError";
      this.showErrorCard(
        denied ? "Camera permission needed" : missing ? "No camera found" : "Camera unavailable",
        denied
          ? "Reps With Friends counts reps through your camera — nothing is recorded or uploaded. Allow camera access in your browser and try again."
          : "We couldn't open a camera on this device. You can still log sets manually.",
        [
          { label: "TRY AGAIN", primary: true, fn: () => { this.clearError(); void this.startCamera(); } },
          { label: "CLOSE", primary: false, fn: () => this.close(true) },
        ]
      );
    }
  }

  private attachStream(stream: MediaStream): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = stream;
    this.video.srcObject = stream;
    // Mirror BOTH video and overlay so the skeleton stays aligned.
    const mirror = this.facing === "user";
    this.video.classList.toggle("mirror", mirror);
    this.canvas.classList.toggle("mirror", mirror);
    void this.video.play().catch(() => { /* autoplay guard — muted video always plays */ });
    this.camReady = true;
    this.syncStart();
    if (!this.running) this.setStatus(this.modelReady ? null : "Camera ready — loading pose model…");
  }

  private async flipCamera(): Promise<void> {
    if (this.running) return;
    this.facing = this.facing === "user" ? "environment" : "user";
    this.camReady = false;
    this.syncStart();
    await this.startCamera();
  }

  // ── model ─────────────────────────────────────────────────────────────────

  private async loadModel(): Promise<void> {
    if (this.closed) return;
    this.setStatus("Loading pose model (first time ≈ 5s)…");
    try {
      const { pd } = await loadPoseStack();
      if (this.closed) return;
      this.detector = await pd.createDetector(pd.SupportedModels.MoveNet, {
        modelType: "SinglePose.Lightning",
        enableSmoothing: true,
      });
      if (this.closed) {
        this.disposeDetector();
        return;
      }
      this.modelReady = true;
      this.syncStart();
      if (!this.running) this.setStatus(this.camReady ? null : "Model ready — waiting for camera…");
    } catch {
      if (this.closed) return;
      this.modelReady = false;
      this.syncStart();
      this.showErrorCard(
        "Couldn't load the pose model",
        "The counting model downloads from a CDN the first time you verify. Check your connection and retry — or log this set manually.",
        [
          { label: "RETRY", primary: true, fn: () => { this.clearError(); void this.loadModel(); } },
          { label: "CLOSE", primary: false, fn: () => this.close(true) },
        ]
      );
    }
  }

  private disposeDetector(): void {
    try {
      this.detector?.dispose?.();
    } catch { /* already gone */ }
    this.detector = null;
  }

  // ── counting ──────────────────────────────────────────────────────────────

  private selectExercise(id: string): void {
    if (this.running) return;
    const s = this.specs.find((x) => x.id === id);
    if (!s) return;
    this.spec = s;
    this.hintEl.textContent = s.hint;
    for (const b of this.exRow.querySelectorAll("[data-ex]")) {
      (b as HTMLElement).classList.toggle("on", (b as HTMLElement).dataset.ex === id);
    }
    this.resetCount();
  }

  private resetCount(): void {
    this.counter = createRepCounter(this.spec);
    this.frames = 0;
    this.lastAngle = null;
    this.countEl.textContent = "0";
    this.clearCanvas();
  }

  private startCounting(): void {
    if (!this.detector || !this.camReady) return;
    this.running = true;
    this.startedAt = performance.now();
    this.resetCount();
    this.startBtn.textContent = "STOP";
    this.startBtn.classList.add("verify-start--stop");
    this.startBtn.disabled = false;
    this.exRow.classList.add("verify-exrow--locked");
    this.setStatus(null);
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopCounting(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.startBtn.textContent = "START";
    this.startBtn.classList.remove("verify-start--stop");
    this.exRow.classList.remove("verify-exrow--locked");
    this.showSummary();
  }

  private readonly tick = async (): Promise<void> => {
    if (!this.running || this.closed) return;
    if (!this.busy && this.detector && this.video.readyState >= 2) {
      this.busy = true;
      try {
        const poses = await this.detector.estimatePoses(this.video);
        this.frames++;
        this.onPose(poses?.[0]);
      } catch {
        /* dropped frame — next rAF retries */
      }
      this.busy = false;
    }
    if (this.running) this.raf = requestAnimationFrame(this.tick);
  };

  /**
   * Per-frame pose → angle → rep counter (see ./count.ts for the machine):
   *   angle < downAngle → phase "down" (timestamped)
   *   angle > upAngle   → phase "up"; a down phase that held ≥ 300ms = 1 rep.
   */
  private onPose(pose: { keypoints: Keypoint[] } | undefined): void {
    const angle = trackedAngle(pose?.keypoints, specSides(this.spec));
    if (angle == null) {
      if (this.frames % 15 === 1) this.setStatus("No person detected — step into frame");
      return;
    }
    this.setStatus(null);
    this.lastAngle = angle;
    if (this.counter.push(angle, performance.now()) === "counted") {
      this.countEl.textContent = String(this.counter.reps);
      this.countEl.classList.remove("pop");
      void this.countEl.offsetWidth; // restart the pop animation
      this.countEl.classList.add("pop");
    }
    if (this.showSkeleton) this.drawOverlay(pose!);
  }

  // ── summary ───────────────────────────────────────────────────────────────

  private showSummary(): void {
    const durationMs = performance.now() - this.startedAt;
    const avgFps = durationMs > 0 ? (this.frames / durationMs) * 1000 : 0;
    const mm = Math.floor(durationMs / 60000);
    const ss = Math.floor((durationMs % 60000) / 1000);
    const has = this.counter.reps > 0;
    this.controlsEl.replaceChildren(
      el("div", { class: "verify-summary" },
        el("div", {
          class: "verify-sumline",
          html: `<b>${this.counter.reps}</b> ${this.spec.name.toLowerCase()} · ${mm}:${String(ss).padStart(2, "0")} · ${Math.round(avgFps)} fps`,
        })
      ),
      el("div", { class: "verify-btnrow" },
        el("button", {
          class: "rwf-btn btn-sm",
          type: "button",
          text: "DISCARD",
          onClick: () => this.close(true),
        }),
        el("button", {
          class: "rwf-btn rwf-btn--primary verify-logbtn",
          type: "button",
          text: has ? `LOG ${this.counter.reps} VERIFIED` : "NO REPS COUNTED",
          disabled: !has,
          onClick: () => {
            this.close(false);
            this.opts.onDone({ reps: this.counter.reps, durationMs: Math.round(durationMs), avgFps, exerciseId: this.spec.id });
          },
        })
      )
    );
  }

  // ── error cards ───────────────────────────────────────────────────────────

  private showErrorCard(title: string, body: string, actions: { label: string; primary: boolean; fn: () => void }[]): void {
    this.clearError();
    this.errorCard = el("div", { class: "verify-error" },
      el("div", { class: "verify-error-title", text: title }),
      el("p", { class: "verify-error-body", text: body }),
      el("div", { class: "verify-btnrow" },
        ...actions.map((a) =>
          el("button", {
            class: `rwf-btn btn-sm ${a.primary ? "rwf-btn--primary" : ""}`,
            type: "button",
            text: a.label,
            onClick: a.fn,
          })
        )
      )
    );
    this.sheet.insertBefore(this.errorCard, this.statusEl);
    this.controlsEl.style.display = "none";
    this.statusEl.classList.remove("on");
  }

  private clearError(): void {
    this.errorCard?.remove();
    this.errorCard = null;
    this.controlsEl.style.display = "";
  }

  // ── overlay drawing ───────────────────────────────────────────────────────

  private clearCanvas(): void {
    const ctx = this.canvas.getContext("2d");
    if (ctx && this.canvas.width) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Map a point in video pixel coords onto the cover-fitted displayed box. */
  private coverPoint(k: Keypoint): { x: number; y: number } {
    const vw = this.video.videoWidth || 1;
    const vh = this.video.videoHeight || 1;
    const dw = this.canvas.width || 1;
    const dh = this.canvas.height || 1;
    const s = Math.max(dw / vw, dh / vh);
    return { x: k.x * s + (dw - vw * s) / 2, y: k.y * s + (dh - vh * s) / 2 };
  }

  private drawOverlay(pose: { keypoints: Keypoint[] }): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const byName = new Map<string, Keypoint>();
    for (const k of pose.keypoints) byName.set(k.name ?? (k as any).part, k);
    const ok = (k?: Keypoint): k is Keypoint => !!k && k.score >= CONFIDENCE_FLOOR;

    ctx.lineWidth = 2.5 * dpr;
    ctx.strokeStyle = "rgba(198, 243, 46, 0.85)";
    ctx.beginPath();
    for (const [a, b] of EDGES) {
      const ka = byName.get(a), kb = byName.get(b);
      if (!ok(ka) || !ok(kb)) continue;
      const pa = this.coverPoint(ka), pb = this.coverPoint(kb);
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();

    ctx.fillStyle = "#c6f32e";
    for (const k of pose.keypoints) {
      if (!ok(k)) continue;
      const p = this.coverPoint(k);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Live angle readout at the tracked joint's vertex.
    if (this.lastAngle != null) {
      const vertexNames = SIDES[this.spec.points[1]];
      const mid = byName.get(vertexNames[0]) ?? byName.get(vertexNames[1]);
      if (ok(mid)) {
        const p = this.coverPoint(mid);
        const label = `${Math.round(this.lastAngle)}°`;
        ctx.font = `700 ${13 * dpr}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(10, 11, 13, 0.72)";
        ctx.fillRect(p.x - tw / 2 - 5 * dpr, p.y - 10 * dpr, tw + 10 * dpr, 20 * dpr);
        ctx.fillStyle = "#c6f32e";
        ctx.fillText(label, p.x, p.y);
      }
    }
  }

  // ── teardown ──────────────────────────────────────────────────────────────

  private close(cancelled: boolean): void {
    if (this.closed) return;
    this.closed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("hashchange", this.onHashChange);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.disposeDetector();
    this.overlay.remove();
    if (cancelled) this.opts.onCancel?.();
  }
}
