// Lane 7 — BLE heart-rate straps via Web Bluetooth.
//
// Standard GATT Heart Rate Service (0x180D) → Heart Rate Measurement
// characteristic (0x2A37). Any chest/arm strap (Polar H10, Garmin, Wahoo…)
// broadcasts it — no vendor API needed. Effort is scored as %HRR (Karvonen):
//   %HRR = (bpm − restingHr) / (maxHr − restingHr) × 100,  maxHr = 220 − age.
//
// Graceful by design: unsupported browser (iOS Safari), user cancel, and
// mid-session disconnect (partial averages are kept) all resolve cleanly.

import { el } from "../ui.ts";

// ── settings (persisted) ─────────────────────────────────────────────────────

export interface HrSettings {
  restingHr: number; // default 60
  age: number;       // default 35 → maxHr 185
}

const SETTINGS_KEY = "rwf.hr.v1";

export function loadHrSettings(): HrSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<HrSettings>;
      return {
        restingHr: clampNum(p.restingHr, 30, 100, 60),
        age: clampNum(p.age, 13, 90, 35),
      };
    }
  } catch { /* corrupt → defaults */ }
  return { restingHr: 60, age: 35 };
}

export function saveHrSettings(s: HrSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* storage blocked — session-only */ }
}

function clampNum(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt;
}

// ── controller ───────────────────────────────────────────────────────────────

export type HrStatus = "connecting" | "live" | "disconnected" | "error";

export interface HrStats {
  samples: number;        // HR notifications received this session
  avgHrrPct: number | null; // session-wide mean %HRR (null until 1 sample)
  lastBpm: number | null;
  durationMs: number;
}

export interface HrController {
  readonly deviceName: string | null;
  isConnected(): boolean;
  /** Session-wide stats (kept after a mid-session disconnect). */
  stats(): HrStats;
  /**
   * Mean %HRR since the last takeSetAverage() call (≈ "during this set"),
   * then resets that window. null if no samples in the window.
   */
  takeSetAverage(): number | null;
  /** Disconnect GATT (idempotent). Stats remain readable. */
  stop(): void;
}

export interface HrCallbacks {
  onBpm?: (bpm: number, hrrPct: number) => void;
  onStatus?: (status: HrStatus, detail?: string) => void;
}

export class HrError extends Error {
  constructor(
    public readonly kind: "unsupported" | "cancelled" | "failed",
    message: string
  ) {
    super(message);
  }
}

export function webBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth?.requestDevice;
}

/** Karvonen %HRR, clamped to a sane 0–150 band. */
export function karvonenHrr(bpm: number, restingHr: number, age: number): number {
  const maxHr = 220 - age;
  const span = Math.max(30, maxHr - restingHr); // guard degenerate inputs
  return Math.max(0, Math.min(150, ((bpm - restingHr) / span) * 100));
}

/**
 * Parse a Heart Rate Measurement (0x2A37) value per the Bluetooth spec:
 * flags byte bit0 → 0: UINT8 BPM at offset 1, 1: UINT16 LE BPM at offset 1.
 */
export function parseHeartRateMeasurement(dv: DataView): number {
  if (dv.byteLength < 2) return 0;
  const flags = dv.getUint8(0);
  return flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1);
}

/**
 * Ask the user to pick a heart-rate strap (browser chooser), connect, and
 * subscribe to notifications. Resolves once the FIRST notification arrives
 * (or after subscription if the strap is quiet for 6s — some straps only
 * transmit on skin contact).
 */
export async function connectHrStrap(
  settings: HrSettings = loadHrSettings(),
  cb: HrCallbacks = {}
): Promise<HrController> {
  if (!webBluetoothSupported()) {
    throw new HrError(
      "unsupported",
      "Web Bluetooth isn't available here (iOS Safari doesn't support it). Use Chrome, Edge, or the native app."
    );
  }

  let device: any;
  try {
    device = await (navigator as any).bluetooth.requestDevice({
      filters: [{ services: ["heart_rate"] }], // GATT 0x180D
    });
  } catch (err) {
    const e = err as DOMException;
    if (e?.name === "NotFoundError") {
      throw new HrError("cancelled", "No strap selected — pairing cancelled.");
    }
    throw new HrError("failed", `Couldn't open the Bluetooth chooser: ${e?.message ?? "unknown error"}`);
  }

  cb.onStatus?.("connecting");

  let server: any = null;
  let characteristic: any = null;
  let connected = false;
  const startedAt = Date.now();

  let sessSum = 0, sessCount = 0;
  let setSum = 0, setCount = 0;
  let lastBpm: number | null = null;
  let stopped = false;

  const controller: HrController = {
    deviceName: device?.name ?? null,
    isConnected: () => connected,
    stats: () => ({
      samples: sessCount,
      avgHrrPct: sessCount > 0 ? round1(sessSum / sessCount) : null,
      lastBpm,
      durationMs: Date.now() - startedAt,
    }),
    takeSetAverage: () => {
      const avg = setCount > 0 ? round1(setSum / setCount) : null;
      setSum = 0;
      setCount = 0;
      return avg;
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      connected = false;
      try {
        characteristic?.stopNotifications?.()?.catch(() => {});
      } catch { /* already gone */ }
      try {
        device?.gatt?.disconnect();
      } catch { /* already gone */ }
    },
  };

  const onValue = (event: Event): void => {
    const dv = (event.target as any)?.value;
    if (!dv) return;
    const bpm = parseHeartRateMeasurement(dv as DataView);
    if (!bpm || bpm > 255) return; // 0 = invalid/placeholder on some straps
    const hrr = karvonenHrr(bpm, settings.restingHr, settings.age);
    lastBpm = bpm;
    sessSum += hrr;
    sessCount++;
    setSum += hrr;
    setCount++;
    if (!connected) {
      connected = true;
      cb.onStatus?.("live");
    }
    cb.onBpm?.(bpm, round1(hrr));
  };

  const onDisconnect = (): void => {
    if (stopped) return;
    connected = false;
    // Keep the partial session average — entries can still carry it.
    cb.onStatus?.("disconnected", "Strap disconnected — partial average kept.");
  };
  device.addEventListener("gattserverdisconnected", onDisconnect);

  // GATT connect (2 attempts — straps are flaky on the first handshake).
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2 && !server; attempt++) {
    try {
      server = await device.gatt.connect();
    } catch (err) {
      lastErr = err;
      await sleep(600);
    }
  }
  if (!server) {
    device.removeEventListener("gattserverdisconnected", onDisconnect);
    throw new HrError("failed", `Couldn't connect to the strap: ${(lastErr as Error)?.message ?? "GATT unreachable"}`);
  }

  try {
    const service = await server.getPrimaryService("heart_rate"); // 0x180D
    characteristic = await service.getCharacteristic("heart_rate_measurement"); // 0x2A37
    await characteristic.startNotifications();
    characteristic.addEventListener("characteristicvaluechanged", onValue);
  } catch (err) {
    controller.stop();
    device.removeEventListener("gattserverdisconnected", onDisconnect);
    throw new HrError("failed", `Strap paired but the heart-rate service failed: ${(err as Error)?.message ?? "unknown"}`);
  }

  // Resolve on first beat; fall through after 6s of silence (skin-contact straps).
  await waitFor(() => sessCount > 0, 6000, 150).catch(() => {});
  return controller;
}

// ── connect sheet (UI) ───────────────────────────────────────────────────────

const X_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const HEART_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7.5-4.6-9.3-9A5.2 5.2 0 0 1 12 6.6a5.2 5.2 0 0 1 9.3 4.4C19.5 15.4 12 20 12 20z"/></svg>';

export interface HrSheetOptions {
  /** Called with the live controller once the first beat arrives. */
  onConnected: (ctrl: HrController) => void;
  /** Sheet closed (never connected, or after a manual close). */
  onClose?: () => void;
  /** Live beat updates (forwarded to the strap connection). */
  onBpm?: (bpm: number, hrrPct: number) => void;
  /** Connection lifecycle updates (forwarded to the strap connection). */
  onStatus?: (status: HrStatus, detail?: string) => void;
}

/**
 * Small bottom sheet: age + resting-HR inputs, CONNECT button, graceful
 * cards for unsupported browsers / user cancel / failures.
 */
export function openHrSheet(opts: HrSheetOptions): void {
  const settings = loadHrSettings();
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    window.removeEventListener("hashchange", onHashChange);
    overlay.remove();
    opts.onClose?.();
  };
  const onHashChange = (): void => close();

  const body = el("div", { class: "verify-controls hr-body" });
  const sheet = el("div", { class: "verify-sheet verify-sheet--slim", role: "dialog", "aria-modal": "true", "aria-label": "Heart-rate strap" },
    el("div", { class: "verify-grab" }),
    el("div", { class: "verify-head" },
      el("h2", { class: "h-display verify-title", html: HEART_ICON + " Heart-rate strap" }),
      el("button", { class: "iconbtn", type: "button", html: X_ICON, "aria-label": "Close", onClick: close })
    ),
    body,
    el("p", { class: "verify-privacy", text: "Your strap streams to this device only. %HRR = effort vs your own heart." })
  );
  const overlay = el("div", { class: "verify-overlay" }, sheet);
  (document.getElementById("frame") ?? document.body).append(overlay);
  window.addEventListener("hashchange", onHashChange);

  const renderUnsupported = (): void => {
    body.replaceChildren(
      el("div", { class: "verify-error" },
        el("div", { class: "verify-error-title", text: "Web Bluetooth unavailable" }),
        el("p", { class: "verify-error-body",
          text: "This browser can't talk to BLE straps (iOS Safari doesn't support Web Bluetooth). Use Chrome or Edge on desktop/Android — or a camera-verified set instead." }),
        el("div", { class: "verify-btnrow" },
          el("button", { class: "rwf-btn rwf-btn--primary btn-sm", type: "button", text: "GOT IT", onClick: close })
        )
      )
    );
  };

  const renderForm = (): void => {
    const ageInput = el("input", { class: "input hr-input", type: "number", inputmode: "numeric", min: "13", max: "90", value: String(settings.age), "aria-label": "Age" }) as HTMLInputElement;
    const restInput = el("input", { class: "input hr-input", type: "number", inputmode: "numeric", min: "30", max: "100", value: String(settings.restingHr), "aria-label": "Resting heart rate" }) as HTMLInputElement;
    const connectBtn = el("button", { class: "rwf-btn rwf-btn--primary btn-block", type: "button", text: "CONNECT STRAP" }) as HTMLButtonElement;
    const note = el("div", { class: "verify-status", text: "" });

    connectBtn.addEventListener("click", () => {
      settings.age = clampNum(ageInput.value, 13, 90, 35);
      settings.restingHr = clampNum(restInput.value, 30, 100, 60);
      saveHrSettings(settings);
      connectBtn.disabled = true;
      connectBtn.textContent = "WAITING FOR STRAP…";
      note.textContent = "Pick your strap in the browser's Bluetooth dialog.";
      note.classList.add("on");

      connectHrStrap(settings, { onBpm: opts.onBpm, onStatus: opts.onStatus })
        .then((ctrl) => {
          if (closed) {
            ctrl.stop();
            return;
          }
          close();
          opts.onConnected(ctrl);
        })
        .catch((err: unknown) => {
          if (closed) return;
          connectBtn.disabled = false;
          connectBtn.textContent = "CONNECT STRAP";
          if (err instanceof HrError && err.kind === "cancelled") {
            note.textContent = "No strap selected — try again.";
          } else if (err instanceof HrError && err.kind === "unsupported") {
            renderUnsupported();
          } else {
            note.textContent = (err as Error)?.message ?? "Connection failed — try again.";
          }
        });
    });

    body.replaceChildren(
      el("div", { class: "hr-inputs" },
        el("label", { class: "field" },
          el("span", { class: "seclabel", text: "Age" }), ageInput),
        el("label", { class: "field" },
          el("span", { class: "seclabel", text: "Resting HR" }), restInput)
      ),
      el("p", { class: "verify-hint", text: "Max HR is estimated as 220 − age. Any BLE strap works (Polar, Garmin, Wahoo…)." }),
      connectBtn,
      note
    );
  };

  if (webBluetoothSupported()) renderForm();
  else renderUnsupported();
}

// ── tiny utils ───────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitFor(cond: () => boolean, timeoutMs: number, stepMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (cond()) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); reject(new Error("timeout")); }
    }, stepMs);
  });
}
