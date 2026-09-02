/* ═══════════════════════════════════════════════════════════════════════
   RWF V3 BATTLE COURSE — SFX E2E (headless chromium + CDP, no deps)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   Proves the 13-sound SFX module (apps/v3/sfx.js, loaded by index.html)
   actually FIRES per interaction — plays are counted per click with a
   stubbed AudioContext (the apps/sfx-demo/e2e.mjs pattern), not just
   trusted. The walk mirrors the real battle:
     real-mouse click unlocks the lazy context (autoplay policy) →
     hero CTA (primary) → nav (swipe) → setup (tap + win) → create
     (tap/deal) → draft (flip + deal) → LOG REPS ×2 (log — combo pitch
     CLIMBS, verified through recorded oscillator frequencies) →
     deal drop (deal) → mates (tap) → card play (play) → danger-zone
     wind (dz heartbeat + final-minute tick) → close on the TARGET
     (win chime on the podium) → charity (pot) → rematch → close on
     the CLOCK from behind (lose — gentle, never mean) → mute
     round-trip through the top-bar button (rwf.sfx.muted persisted,
     survives reload, shared key) → all-13 catalogue sweep via the
     exact window.rwfSfx.play API.
   Zero console errors is a hard gate. Shots land in apps/v3/shots/
   with the _sfx suffix.
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = 4194;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9232;
const MY_NAME = "Sound Check"; // the runner this probe plays as

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. temp server: apps/v3 at / + the real /design, /site, /models ─── */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".glb": "model/gltf-binary", ".woff2": "font/woff2", ".bvh": "text/plain",
};
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const p = new URL(req.url).pathname;
    let fsPath = null;
    if (p.startsWith("/design/")) {
      fsPath = join(ROOT, p); // index.html references /design/{fonts,tokens}.css absolutely
    } else if (p.startsWith("/site/")) {
      fsPath = join(ROOT, p); // three.js r177 + model-avatars.js + recolor
    } else if (p.startsWith("/models/")) {
      fsPath = join(ROOT, "site/models", p.replace(/^\/models\//, "")); // Geno + Soldier GLBs
    } else if (p === "/" || p.endsWith("/")) {
      fsPath = join(HERE, p === "/" ? "index.html" : join(p.replace(/^\//, ""), "index.html"));
    } else {
      fsPath = join(HERE, p.replace(/^\//, ""));
    }
    const f = Bun.file(fsPath);
    if (await f.exists()) {
      return new Response(f, {
        headers: {
          "content-type": MIME[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream",
          "cache-control": "no-store",
        },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

/* ── 2. launch chromium headless (unique profile per run) ────────────── */
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-v3-sfx-e2e"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-v3-sfx-e2e-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions",
  "--use-gl=angle", "--use-angle=swiftshader",
  // real audio stack off — the counting stub replaces AudioContext
  "--autoplay-policy=no-user-gesture-required",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
proc.on("exit", () => { try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });

async function waitFor(fn, { timeout = 15000, every = 150, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await Bun.sleep(every);
  }
}

await waitFor(async () => {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); return r.ok; }
  catch { return false; }
}, { label: "chromium devtools endpoint" });

const newTab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(newTab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

/* ── 3. minimal CDP client ────────────────────────────────────────────── */
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consoleErrors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ""}`.slice(0, 300));
  } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    consoleErrors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`.slice(0, 300));
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}_sfx.png`), Buffer.from(r.data, "base64"));
  console.log(`  📸 ${step}-${name}_sfx.png`);
}
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);
const plays = () => evalJs(`window.__plays ? window.__plays.map(p => p.n) : null`);
const playEvents = () => evalJs(`window.__plays ?? []`); // [{n, r}]
const nodes = () => evalJs(`window.__sfxNodes.length`);
const count = (name) => evalJs(`window.__plays ? window.__plays.filter(p => p.n === '${name}' && p.r).length : 0`);
async function click(sel) {
  const r = await evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`click target missing: ${sel}`);
  await sleep(260);
}
async function realClick(sel) {
  await evalJs(`document.querySelector('${sel}')?.scrollIntoView({ block: 'center' })`);
  const box = await evalJs(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await sleep(300);
}

/* ── 4. the counting stub — installed BEFORE any page script ────────────
   AudioContext is replaced with a recorder: every synth node is counted,
   every frequency setValueAtTime is captured (the log-combo pitch assert
   reads real numbers). window.rwfSfx.play gets a transparent wrapper that
   logs {name, fired} per call — counts are PER INTERACTION, not vibes. */
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  (() => {
    window.__sfxNodes = [];
    window.__freqs = [];
    window.__plays = [];
    const param = () => ({
      setValueAtTime(v) { window.__freqs.push(Number(v)); return this; },
      exponentialRampToValueAtTime() { return this; },
      linearRampToValueAtTime() { return this; },
      value: 0,
    });
    const node = (kind) => {
      window.__sfxNodes.push(kind);
      return {
        kind, gain: param(), frequency: param(), Q: param(), buffer: null,
        type: "", connect() { return arguments[0]; }, disconnect() {},
        start() {}, stop() {},
        getChannelData: () => new Float32Array(48000),
      };
    };
    window.AudioContext = class {
      constructor() { this.currentTime = 0; this.state = "running"; this.sampleRate = 48000; this.destination = node("dest"); }
      createGain() { return node("gain"); }
      createOscillator() { return node("osc"); }
      createBufferSource() { return node("bufsrc"); }
      createBiquadFilter() { return node("filter"); }
      createBuffer() { return node("buffer"); }
      resume() { return Promise.resolve(); }
    };
    /* wrap rwfSfx.play the moment sfx.js installs the global */
    const t = setInterval(() => {
      if (window.rwfSfx && !window.rwfSfx.__counted) {
        window.rwfSfx.__counted = true;
        const orig = window.rwfSfx.play.bind(window.rwfSfx);
        window.rwfSfx.play = (n, o) => { const r = orig(n, o); window.__plays.push({ n, r }); return r; };
        clearInterval(t);
      }
    }, 10);
  })();` });

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF V3 SFX E2E — ${BASE} (headless chromium, 390×844, counting AudioContext stub)\n`);

await send("Page.navigate", { url: `${BASE}/index.html#/home` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && window.__rwfV3?.ready === true && document.querySelector('.v3-h1') !== null`).catch(() => false),
  { label: "v3 app load", timeout: 20000 }
);
await sleep(600);

console.log("— MODULE + MUTE BUTTON (pre-gesture)");
const boot = await evalJs(`(() => ({
  hasGlobal: !!window.rwfSfx,
  names: window.rwfSfx?.names ?? [],
  nodes: window.__sfxNodes.length,
  plays: window.__plays.length,
  muteBtn: !!document.querySelector('.v3-mute'),
  mutePressed: document.querySelector('.v3-mute')?.getAttribute('aria-pressed'),
}))()`);
ok(boot.hasGlobal, "sfx.js loaded — window.rwfSfx global exists");
ok(boot.names.length === 13, `13 catalogue names exposed (${boot.names.length})`);
ok(boot.nodes === 0, "no synthesis before any gesture (lazy context)");
ok(boot.plays <= 1 && (await playEvents()).every((p) => !p.r), "boot swipe was a silent no-op (no synthesis pre-gesture — the lazy-context gate)");
ok(boot.muteBtn && boot.mutePressed === "false", "top-bar mute button painted unmuted");

console.log("— REAL CLICK unlocks audio (the autoplay-policy gate)");
const nodesBefore = await nodes();
await realClick("#newBattle");
const afterGesture = await playEvents();
ok(afterGesture.some((p) => p.n === "primary" && p.r === true), `hero CTA fires primary via a real mouse click (nodes ${nodesBefore} → ${await nodes()})`);
ok((await count("primary")) === 1, "primary fired EXACTLY once (data-sfx + onclick deduped by the re-trigger guard)");
ok(await count("swipe") >= 1, "navigation fires the swipe whoosh");
ok(await exists("#nameIn"), "arrived on setup");

console.log("— SETUP → identity (tap + win)");
await evalJs(`(() => { const i = document.querySelector('#nameIn'); i.value = ${JSON.stringify(MY_NAME)}; i.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
await click('[data-tier="couch"]');
ok((await count("tap")) >= 1, "tier chip taps");
await click("#setupGo");
ok((await count("win")) >= 1, "taking your lane plays the win fanfare");

console.log("— CREATE → draft → battle (deal + flip)");
await click("#newBattle");
ok((await count("primary")) === 2, "hero CTA primary again (create this time)");
await click("#packRow .v3-pick");
await click("#startBattle");
ok((await count("deal")) >= 1, "set-the-course deals");
await waitFor(() => exists("#draftFan .bd-card").catch(() => false), { label: "draft sheet over the course" });
const flipBefore = await count("flip");
await evalJs(`document.querySelectorAll('#draftFan .bd-card')[1].click(); true`);
await sleep(150);
ok((await count("flip")) === flipBefore + 1, "draft card pick snaps (flip)");
await click("#keepBtn");
await waitFor(async () => !(await exists(".bd-sheet").catch(() => true)), { label: "draft sheet closed (keep timed in)" });
await waitFor(() => exists("#logBtn").catch(() => false), { label: "battle live — log button" });

console.log("— LOG REPS ×2 — the combo climbs (real oscillator numbers)");
const f1 = await evalJs(`window.__freqs.length`);
await click("#logBtn");           // tap opens the sheet
await click("#logGo");            // log #1 — combo 0 → base 620Hz
await waitFor(async () => !(await exists(".bd-sheet").catch(() => true)), { label: "log sheet closed" });
await click("#logBtn");
await click("#logGo");            // log #2 within 4s — combo 1 → base ≈655.6Hz
const comboProbe = await evalJs(`(() => {
  const f = window.__freqs.slice(${f1});
  const base = (n) => 620 * Math.pow(1.059, n);
  const i1 = f.findIndex((v) => v > base(0) - 6 && v < base(0) + 6);
  const i2 = f.findIndex((v) => v > base(1) - 6 && v < base(1) + 6);
  const logs = window.__plays.filter(p => p.n === 'log' && p.r).length;
  return { i1, i2, logs, f: f.slice(0, 12) };
})()`);
ok(comboProbe.logs === 2, `two logs played (deduped — exactly one log per LOG IT press, got ${comboProbe.logs})`);
ok(comboProbe.i1 >= 0 && comboProbe.i2 > comboProbe.i1, `log-combo pitch climbed 620Hz → ~656Hz (i=${comboProbe.i1}→${comboProbe.i2}, saw [${comboProbe.f.slice(0, 6).map(Math.round)}…])`);

console.log("— DEAL DROP + MATES");
await click("#dealDrop");
ok((await count("deal")) >= 2, "daily drop deals");
await click("#simBtn");
ok((await count("tap")) >= 4, "mates button taps");

console.log("— CARD PLAY (tap → play)");
const handCards = await evalJs(`document.querySelectorAll('#hand .bd-card').length`);
if (handCards > 0) {
  let played = false;
  for (let i = 0; i < handCards && !played; i++) {
    await evalJs(`document.querySelectorAll('#hand .bd-card')[${i}].click(); true`);
    await sleep(200);
    const enabled = await evalJs(`!document.querySelector('#playIt')?.disabled`);
    if (enabled) { await click("#playIt"); played = true; }
    else await evalJs(`document.querySelector('.bd-sheet__veil')?.click(); true`); // unaffordable — next
  }
  ok(played && (await count("play")) >= 1, "power-up card ACTIVATE arpeggio (play) through the sheet");
} else {
  ok(false, "hand had cards to play");
}

console.log("— DANGER ZONE + final-minute TICK");
const dzBefore = await count("dz"), tickBefore = await count("tick");
await evalJs(`window.__rwfV3.driveDeadline(30 * 1000); true`); // 30s left → DZ ramp + final minute
await sleep(200);
const dzNow = await count("dz"), tickNow = await count("tick");
ok(dzNow > dzBefore, `danger-zone heartbeat fires as the level RISES (${dzBefore} → ${dzNow})`);
ok(tickNow > tickBefore, `final-minute deadline seconds tick (${tickBefore} → ${tickNow})`);
await evalJs(`window.__rwfV3.driveDeadline(6 * 60 * 60 * 1000); true`); // unwind — battle stays live

console.log("— CLOSE ON THE TARGET (win chime on the podium)");
const winBefore = await count("win"), loseBefore = await count("lose");
let closed = false;
for (let i = 0; i < 12 && !closed; i++) {
  const r = await evalJs(`window.__rwfV3.driveLog(50)`);
  closed = !!r.closed;
  await sleep(180);
}
await waitFor(() => exists(".v3-resultbar").catch(() => false), { label: "3D podium result" });
await sleep(400);
const winName = await evalJs(`document.querySelector('.v3-resultbar__t')?.textContent ?? ''`);
const iWon = winName.includes(MY_NAME);
ok(closed, "battle closed on the reps target");
ok(iWon ? (await count("win")) > winBefore : (await count("lose")) > loseBefore,
  `settle chime matches the podium (${winName.trim()} → ${iWon ? "win fanfare" : "lose descend"})`);
await shot("result-win");

console.log("— CHARITY POT + REMATCH (pot + deal)");
await click("#charRow .v3-pick");
ok((await count("pot")) >= 1, "charity designation clinks the pot");
await click("#rematchBtn");
await waitFor(() => exists("#draftFan .bd-card").catch(() => false), { label: "rematch draft sheet" });
await evalJs(`document.querySelectorAll('#draftFan .bd-card')[0].click(); true`);
await click("#keepBtn");
await waitFor(async () => !(await exists(".bd-sheet").catch(() => true)), { label: "rematch draft sheet closed" });
await waitFor(() => exists("#logBtn").catch(() => false), { label: "rematch battle live" });

console.log("— CLOSE ON THE CLOCK, from behind (lose — gentle, never mean)");
const loseBefore2 = await count("lose");
await click("#simBtn"); // mates log; we stay on zero — the clock will beat us
await sleep(200);
await evalJs(`window.__rwfV3.driveClockClose(); true`);
await waitFor(() => exists(".v3-resultbar").catch(() => false), { label: "clock-close result" });
await sleep(400);
const winName2 = await evalJs(`document.querySelector('.v3-resultbar__t')?.textContent ?? ''`);
const lose2 = await count("lose");
ok(!winName2.includes(MY_NAME) && lose2 > loseBefore2, `behind at the deadline → the gentle lose descend (${winName2.trim()} won, lose ×${lose2})`);
await shot("result-lose");

console.log("— INTERACTION COVERAGE (the sounds the real UI fires by itself)");
const heard = await evalJs(`[...new Set(window.__plays.filter(p => p.r).map(p => p.n))]`);
const expectInteraction = ["primary", "swipe", "tap", "win", "deal", "flip", "log", "play", "dz", "tick", "pot", "lose"];
const missingInteraction = expectInteraction.filter((n) => !heard.includes(n));
ok(missingInteraction.length === 0, `12 of 13 names fire through real interactions (missing: ${missingInteraction.join(",") || "none"} — error needs an engine refusal, swept next)`);

console.log("— MUTE round-trip (the top-bar button + the shared rwf.sfx.muted key)");
async function clickMute() {
  await evalJs(`document.querySelector('.v3-mute')?.scrollIntoView({ block: 'center' })`);
  const box = await evalJs(`(() => { const r = document.querySelector('.v3-mute').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await sleep(250);
}
await clickMute(); // → muted
const mutedState = await evalJs(`(() => ({
  aria: document.querySelector('.v3-mute').getAttribute('aria-pressed'),
  label: document.querySelector('.v3-mute').getAttribute('aria-label'),
  api: window.rwfSfx.isMuted(),
  stored: localStorage.getItem('rwf.sfx.muted'),
}))()`);
const nodesMuted = await nodes();
const playedMuted = await evalJs(`window.rwfSfx.play('win')`);
ok(mutedState.aria === "true" && mutedState.api === true && mutedState.stored === "1",
  `mute button paints + persists muted (${JSON.stringify(mutedState)})`);
ok(playedMuted === false && (await nodes()) === nodesMuted, "muted play() is a no-op (no synthesis)");

console.log("— MUTE survives a REAL reload (persistence)");
/* location.reload() — a same-URL hash jump would NOT create a new document
   (the SPA just re-renders); we need the module to re-read localStorage */
await evalJs(`location.reload(); true`);
await waitFor(
  () => evalJs(`document.readyState === 'complete' && window.__rwfV3?.ready === true && document.querySelector('.v3-mute') !== null`).catch(() => false),
  { label: "reload with mute on", timeout: 20000 }
);
await sleep(400);
const reloaded = await evalJs(`(() => ({
  painted: document.querySelector('.v3-mute')?.getAttribute('aria-pressed'),
  api: window.rwfSfx.isMuted(),
  stored: localStorage.getItem('rwf.sfx.muted'),
  bootPlay: window.__plays.filter(p => p.r).length,
}))()`);
ok(reloaded.painted === "true" && reloaded.api === true && reloaded.stored === "1",
  `still muted after reload — button painted, api + storage agree (${JSON.stringify(reloaded)})`);
ok(reloaded.bootPlay === 0, "boot swipe stays silent while muted");
await clickMute(); // → unmuted (the button re-rendered at the same spot)
const unmuted = await evalJs(`(() => ({ aria: document.querySelector('.v3-mute')?.getAttribute('aria-pressed'), stored: localStorage.getItem('rwf.sfx.muted') }))()`);
ok(unmuted.aria === "false" && unmuted.stored === "0", "unmute restores + persists");

console.log("— ALL 13 NAMES via the exact window.rwfSfx.play API (error included)");
const sweep = await evalJs(`(() => {
  const out = {};
  for (const n of window.rwfSfx.names) out[n] = window.rwfSfx.play(n) === true;
  return out;
})()`);
const sweepBad = Object.entries(sweep).filter(([, v]) => !v).map(([k]) => k);
ok(sweepBad.length === 0, `all 13 catalogue names play (${sweepBad.length ? "failed: " + sweepBad.join(",") : "13/13"})`);

console.log("— CONSOLE GATE");
ok(consoleErrors.length === 0, `zero console errors across the whole walk${consoleErrors.length ? " — " + consoleErrors.slice(0, 3).join(" | ") : ""}`);

try { proc.kill(); } catch {}
server.stop(true);
console.log(`\n${failures.length === 0 ? `ALL ${passed} CHECKS PASSED` : failures.length + " CHECK(S) FAILED — " + failures.join(" | ")}`);
process.exit(failures.length === 0 ? 0 : 1);
