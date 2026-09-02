/* ═══════════════════════════════════════════════════════════════════════
   RWF SFX-DEMO + MAIN-HUB E2E — headless Chromium over CDP (zero deps).
   Needs `bun serve.ts` on :4173.

   1. MAIN HUB (/) — desktop 1280 + mobile 390:
      · every estate link present in the DOM (versions cards, explore
        clusters, footer directory)
      · all 7 hub thumbnails actually load (naturalWidth > 0)
      · reveals fire on scroll, zero console errors
      · full-page screenshots (desktop + 390px)
   2. SFX PAGE (/sfx) — with a stubbed AudioContext injected pre-load:
      · 13 sound buttons present; every catalogue name plays via the exact
        window.rwfSfx global (play() returns true, synthesis reaches the
        stub — node counter climbs)
      · real mouse clicks on the buttons reach synthesis (wiring proof)
      · mute toggle flips state + blocks synthesis; unmute restores
      · zero console errors; screenshots (desktop + 390px)

   Run: bun apps/sfx-demo/e2e.mjs        Shots → apps/sfx-demo/shots/
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:4173";
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9231;

/* ── assertions bookkeeping ───────────────────────────────────────────── */
let passed = 0;
const failures = [];
function ok(cond, label) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── launch chromium headless ─────────────────────────────────────────── */
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-sfx-e2e-profile"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-sfx-e2e-profile-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=1280,900",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});

async function waitFor(fn, { timeout = 15000, every = 150, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await Bun.sleep(every);
  }
}
await waitFor(async () => {
  try { return (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok; } catch { return false; }
}, { label: "chromium devtools endpoint" });

const tab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

/* ── minimal CDP client ───────────────────────────────────────────────── */
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
    consoleErrors.push(`console.error: ${m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200)}`);
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ""}`.slice(0, 200));
  } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    consoleErrors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`.slice(0, 200));
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

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, "base64"));
}
async function setViewport(width, height, mobile = false) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
}

/* the estate the hub must link (checked in DOM hrefs) */
const ESTATE = [
  "/figma-app", "/v2", "/demo", "/styles", "/sfx", "/system", "/figma",
  "/atelier", "/avatars", "/v1", "/wiki",
  "/deck/RWF_Followup_Deck.pdf", "/deck/RWF_Contract_Scope.pdf", "/deck/RWF_Followup_Appendix.pdf",
  "/apk/rwf-app-debug.apk", "/hub", "/debug", "/connect", "/slack", "/api/state",
];

mkdirSync(SHOTS, { recursive: true });

/* ═══════════════════ PART 1 · MAIN HUB (desktop) ═══════════════════════ */
console.log(`\n═══ 1 · MAIN HUB — ${BASE}/ (desktop 1280) ═══`);
await setViewport(1280, 900);
await send("Page.navigate", { url: `${BASE}/` });
await sleep(5000); // boot three.js scenes

const hub = await evalJs(`(() => {
  const hrefs = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
  const missing = ${JSON.stringify(ESTATE)}.filter(r => !hrefs.includes(r));
  const imgs = [...document.querySelectorAll('.ver-shots img')].map(i => ({ ok: i.complete && i.naturalWidth > 0, src: i.getAttribute('src') }));
  return {
    missing,
    imgs,
    clusters: [...document.querySelectorAll('.x-cluster-label')].map(e => e.textContent.trim()),
    verCards: document.querySelectorAll('.ver-card').length,
    dirLinks: document.querySelectorAll('.footer-dir-text a').length,
    title: document.title,
  };
})()`);
ok(hub.missing.length === 0, `all ${ESTATE.length} estate routes linked in DOM (missing: ${hub.missing.join(",") || "none"})`);
ok(hub.imgs.length === 7 && hub.imgs.every(i => i.ok), `7 version thumbnails load (${hub.imgs.filter(i => i.ok).length}/7 ok)`);
ok(hub.verCards === 3, `3 version cards (v1 / v2 / demo) — got ${hub.verCards}`);
ok(hub.clusters.length === 6, `6 explore clusters — got ${hub.clusters.length}: ${hub.clusters.join(" · ")}`);
ok(hub.dirLinks >= 20, `footer directory links — got ${hub.dirLinks}`);

/* fire every reveal by scrolling through (220ms/step — the IntersectionObserver
   needs elements to linger in view; slower than the visual cadence on purpose),
   then full-page shot */
await evalJs(`(async () => {
  const H = document.body.scrollHeight;
  for (let y = 0; y <= H; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 220)); }
  window.scrollTo(0, H);
  await new Promise(r => setTimeout(r, 900));
})()`);
const rev = await evalJs(`({ total: document.querySelectorAll('.reveal').length, in: document.querySelectorAll('.reveal.in').length })`);
ok(rev.in === rev.total && rev.total > 40, `all reveals fire (${rev.in}/${rev.total})`);
await shot("hub-desktop-full");
console.log(`  📸 hub-desktop-full.png`);

/* versions section screenshot */
await evalJs(`document.getElementById('versions').scrollIntoView()`);
await sleep(700);
await shot("hub-versions-desktop");
console.log(`  📸 hub-versions-desktop.png`);

/* ═══════════════════ PART 2 · MAIN HUB (mobile 390) ════════════════════ */
console.log(`\n═══ 2 · MAIN HUB — / (mobile 390) ═══`);
await setViewport(390, 844, true);
await sleep(800);
await evalJs(`(async () => {
  const H = document.body.scrollHeight;
  for (let y = 0; y <= H; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 70)); }
  await new Promise(r => setTimeout(r, 400));
})()`);
const mob = await evalJs(`(() => ({
  overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  verCards: document.querySelectorAll('.ver-card').length,
}))()`);
ok(!mob.overflowX, "no horizontal overflow at 390px");
ok(mob.verCards === 3, `version cards present at 390px (${mob.verCards})`);
await shot("hub-mobile-390-full");
console.log(`  📸 hub-mobile-390-full.png`);

/* ═══════════════════ PART 3 · SFX PAGE ═════════════════════════════════ */
console.log(`\n═══ 3 · SFX PAGE — ${BASE}/sfx (stubbed AudioContext) ═══`);
await setViewport(1280, 900, false);

/* stub AudioContext BEFORE any page script runs; count synth nodes */
await send("Page.addScriptToEvaluateOnNewDocument", { source: `
  (() => {
    const prox = () => new Proxy(function(){}, {
      get(t, k) {
        if (k === Symbol.toPrimitive) return () => 0;
        if (k === 'length' || k === 'value' || k === 'currentTime') return 0;
        return prox();
      },
      set() { return true; },
      apply() { return prox(); },
    });
    window.__sfxNodes = [];
    const node = (kind) => { window.__sfxNodes.push(kind); return prox(); };
    window.AudioContext = class {
      constructor() { this.currentTime = 0; this.state = 'running'; this.destination = node('dest'); }
      createGain() { return node('gain'); }
      createOscillator() { return node('osc'); }
      createBufferSource() { return node('bufsrc'); }
      createBiquadFilter() { return node('filter'); }
      createBuffer() { return node('buffer'); }
      resume() { return Promise.resolve(); }
    };
  })();` });

await send("Page.navigate", { url: `${BASE}/sfx` });
await sleep(1200);

const sfx = await evalJs(`(() => ({
  title: document.title,
  buttons: document.querySelectorAll('.sfx-btn').length,
  names: [...document.querySelectorAll('.sfx-btn')].map(b => b.dataset.sfx),
  hasGlobal: !!window.rwfSfx,
  globalNames: window.rwfSfx?.names ?? [],
  nodes: window.__sfxNodes.length,
}))()`);
ok(sfx.title.includes("Sound FX"), `page title — "${sfx.title}"`);
ok(sfx.buttons === 13, `13 sound buttons — got ${sfx.buttons}`);
ok(sfx.hasGlobal && sfx.globalNames.length === 13, `window.rwfSfx global with 13 names (${sfx.globalNames.length})`);
ok(sfx.nodes === 0, "no synthesis before any gesture");

/* real mouse click FIRST — it is the user gesture that unlocks the lazy
   AudioContext (autoplay policy: play() before a gesture is a silent no-op) */
const before = await evalJs(`window.__sfxNodes.length`);
await evalJs(`document.querySelector('.sfx-btn[data-sfx="tap"]').scrollIntoView({ block: 'center' })`);
const box = await evalJs(`(() => { const r = document.querySelector('.sfx-btn[data-sfx="tap"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
await sleep(300);
const afterClick = await evalJs(`window.__sfxNodes.length`);
ok(afterClick > before, `real click unlocks + reaches synthesis via module wiring (nodes ${before} → ${afterClick})`);

/* every catalogue name plays via the exact global API (now unlocked) */
const playAll = await evalJs(`(() => {
  const results = {};
  const names = window.rwfSfx?.names ?? [];
  for (const n of names) results[n] = window.rwfSfx.play(n) === true;
  return { results, nodes: window.__sfxNodes.length };
})()`);
const bad = Object.entries(playAll.results).filter(([, v]) => !v).map(([k]) => k);
ok(bad.length === 0, `all 13 names play via window.rwfSfx.play (failed: ${bad.join(",") || "none"})`);
ok(playAll.nodes > afterClick, `synthesis reached the stubbed context (${afterClick} → ${playAll.nodes} nodes)`);

/* mute round-trip through the REAL mute button (page paints + persists) */
await evalJs(`document.getElementById('muteBtn').scrollIntoView({ block: 'center' })`);
const muteBox = await evalJs(`(() => { const r = document.getElementById('muteBtn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
async function clickMute() {
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: muteBox.x, y: muteBox.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: muteBox.x, y: muteBox.y, button: "left", clickCount: 1 });
  await sleep(250);
}
await clickMute(); // → muted
const mutedState = await evalJs(`(() => ({
  aria: document.getElementById('muteBtn').getAttribute('aria-pressed'),
  label: document.getElementById('muteLabel').textContent,
  stored: localStorage.getItem('rwf.sfx.muted'),
}))()`);
const nodesMuted = await evalJs(`window.__sfxNodes.length`);
const playedMuted = await evalJs(`window.rwfSfx.play('win')`);
const nodesAfterMutedPlay = await evalJs(`window.__sfxNodes.length`);
ok(mutedState.aria === "true" && mutedState.label === "Muted" && mutedState.stored === "1",
  `mute button paints muted state (${JSON.stringify(mutedState)})`);
ok(playedMuted === false && nodesAfterMutedPlay === nodesMuted, "muted play() is a no-op (no synthesis)");
await clickMute(); // → unmuted
const playedUnmuted = await evalJs(`window.rwfSfx.play('win')`);
const nodesUnmuted = await evalJs(`window.__sfxNodes.length`);
const stored0 = await evalJs(`localStorage.getItem('rwf.sfx.muted')`);
ok(playedUnmuted === true && nodesUnmuted > nodesAfterMutedPlay && stored0 === "0", "unmute restores synthesis + persists");

/* shots + mobile */
await evalJs(`window.scrollTo(0, 0)`);
await sleep(300);
await shot("sfx-desktop");
console.log(`  📸 sfx-desktop.png`);
await setViewport(390, 844, true);
await sleep(500);
const sfxMob = await evalJs(`(() => ({
  overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
  cols: getComputedStyle(document.querySelector('.sfx-grid')).gridTemplateColumns.split(' ').length,
}))()`);
ok(!sfxMob.overflowX, "no horizontal overflow at 390px");
ok(sfxMob.cols === 2, `2-column sound grid at 390px (got ${sfxMob.cols})`);
await shot("sfx-mobile-390");
console.log(`  📸 sfx-mobile-390.png`);

/* ═══════════════════ CONSOLE + REPORT ══════════════════════════════════ */
ok(consoleErrors.length === 0, `zero console errors across hub + sfx${consoleErrors.length ? " — " + consoleErrors.slice(0, 3).join(" | ") : ""}`);

try { proc.kill(); } catch {}
console.log(`\n${failures.length === 0 ? `ALL ${passed} CHECKS PASSED` : failures.length + " CHECK(S) FAILED — " + failures.join(" | ")}`);
process.exit(failures.length === 0 ? 0 : 1);
