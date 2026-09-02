/* ═══════════════════════════════════════════════════════════════════════
   RWF E2E — SQUADS + SFX wave.
   Zero deps: bun static server + headless chromium over CDP (own ports).

   Part 1 SFX — a stub AudioContext is injected BEFORE the app loads; every
   play() creates stub nodes, so "did a sound fire" is a log assertion:
     · window.rwfSfx API + full catalogue plays
     · delegated wiring fires on buttons (tap/primary/swipe/log)
     · log combo pitch rises on consecutive logs
     · mute toggle (header tool + Settings row) persists across reload
     · deadline tick + danger-zone heartbeat watcher
   Headless can't hear — for a real listen: load the app, tap around
   (log a rep twice, deal/flip a power-up, toggle the theme). No audio
   files exist anywhere; everything is synthesized per-interaction.

   Part 2 SQUADS — the multi-squad dashboard end-to-end:
     · player in 2 squads, dashboard tabs + leaderboards
     · standings DOM matches engine math (three ways)
     · cross-squad dual-credit logging from the quick-log sheet
     · last-place notice appears/hides + wager propose→agree→ACTIVE
     · escrow-on-close settlement (last place pays the winner)

   Run: bun apps/figma-app/e2e-squads.mjs
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4185;            // own static port (e2e 4180 · daily 4181 · sw 4183 · demo 4184)
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9228;        // own CDP port (…9223/9224/9226/9227 taken)

/* ── assertions bookkeeping ───────────────────────────────────────────── */
let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. static server ─────────────────────────────────────────────────── */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    let p = new URL(req.url).pathname;
    if (p === "/" || p.endsWith("/")) p += "index.html";
    const file = Bun.file(join(HERE, p.replace(/^\//, "")));
    if (await file.exists()) {
      return new Response(file, {
        headers: {
          "content-type": MIME[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream",
          "cache-control": "no-store",
        },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

/* ── 2. chromium + CDP client (same shape as e2e.mjs) ────────────────── */
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-e2e-squads-profile"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-e2e-squads-profile-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions",
  "--autoplay-policy=no-user-gesture-required",
  "about:blank",
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
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); return r.ok; } catch { return false; }
}, { label: "chromium devtools endpoint" });

const newTab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const ws = new WebSocket(newTab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

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
    consoleErrors.push(`console.error: ${m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
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
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function goto(hash) {
  await evalJs(`(() => { const h = '${hash}'; if (location.hash === h) dispatchEvent(new Event('hashchange')); else location.hash = h; return 'ok'; })()`);
  await sleep(240);
}
async function click(sel) {
  const r = await evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`click target missing: ${sel}`);
  await sleep(240);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}.png`), Buffer.from(r.data, "base64"));
}
const state = () => evalJs(`JSON.parse(localStorage.getItem('rwf.figma.v1') ?? 'null')`);
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);

/* ── 3. SFX STUB — a recording AudioContext, injected before any app js ── */
const SFX_STUB = `
(() => {
  if (window.__sfxLog) return;
  window.__sfxLog = [];
  const log = (entry) => window.__sfxLog.push({ t: Date.now(), ...entry });
  class FakeParam {
    constructor(v = 0) { this.value = v; }
    setValueAtTime(v) { if (this._from === undefined) this._from = v; this.value = v; return this; }
    linearRampToValueAtTime(v) { this.value = v; return this; }
    exponentialRampToValueAtTime(v) { this.value = v; return this; }
    cancelScheduledValues() { return this; }
  }
  class FakeNode { constructor(kind) { this.kind = kind; } connect(n) { return n; } disconnect() {} }
  class FakeOsc extends FakeNode {
    constructor() { super("osc"); this.type = "sine"; this.frequency = new FakeParam(440); }
    start() { log({ node: "osc", type: this.type, f: this.frequency._from ?? this.frequency.value }); }
    stop() {}
  }
  class FakeGain extends FakeNode { constructor() { super("gain"); this.gain = new FakeParam(1); } }
  class FakeBufferSrc extends FakeNode {
    constructor() { super("noise"); }
    start() { log({ node: "noise" }); }
    stop() {}
  }
  class FakeBiquad extends FakeNode {
    constructor() { super("biquad"); this.type = "bandpass"; this.frequency = new FakeParam(1000); this.Q = new FakeParam(1); }
  }
  class FakeAC {
    constructor() { this.state = "running"; this.currentTime = 0; this.sampleRate = 44100; this.destination = new FakeNode("dest"); }
    resume() { this.state = "running"; return Promise.resolve(); }
    createOscillator() { return new FakeOsc(); }
    createGain() { return new FakeGain(); }
    createBufferSource() { return new FakeBufferSrc(); }
    createBiquadFilter() { return new FakeBiquad(); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(1024) }; }
  }
  window.AudioContext = FakeAC;
})();
`;
await send("Page.addScriptToEvaluateOnNewDocument", { source: SFX_STUB });

const sfxLog = () => evalJs("window.__sfxLog ?? []");
const sfxLen = async () => (await sfxLog()).length;

const logOscsSince = async (marker) => {
  const log = await sfxLog();
  const idx = log.findIndex((e) => e.t >= marker);
  return log.slice(idx < 0 ? 0 : idx).filter((e) => e.node === "osc");
};

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF E2E SQUADS+SFX — ${BASE} (headless chromium, 390×844)\n`);

await send("Page.navigate", { url: `${BASE}/index.html` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && document.querySelector('.fx-app') !== null`).catch(() => false),
  { label: "app load", timeout: 20000 }
);
await sleep(700);

/* ───────────────────────── PART 1 · SFX ─────────────────────────────── */
console.log("— SFX: global API + catalogue");
ok(await evalJs(`typeof window.rwfSfx?.play === 'function' && typeof window.rwfSfx?.setMuted === 'function'`), "window.rwfSfx = { play, setMuted, … } exported");
ok((await evalJs("window.rwfSfx.names.length")) === 13, "13 catalogue entries exposed");
{
  const before = await sfxLen();
  ok((await evalJs(`window.rwfSfx.play('tap')`)) === false, "before any gesture → play() no-ops (lazy AudioContext)");
  ok((await sfxLen()) === before, "no nodes created pre-gesture");
  await evalJs(`document.dispatchEvent(new Event('pointerdown')); true`); // first gesture → ctx arms
  ok((await evalJs(`window.rwfSfx.play('tap')`)) === true, "after first gesture → play() fires");
}
for (const name of await evalJs("window.rwfSfx.names")) {
  const before = await sfxLen();
  await evalJs(`window.rwfSfx.play('${name}')`);
  ok((await sfxLen()) > before, `play('${name}') fires nodes`);
}
{
  const before = await sfxLen();
  ok((await evalJs(`window.rwfSfx.play('bogus')`)) === false, "unknown name → false, no throw");
  ok((await sfxLen()) === before, "unknown name fires nothing");
}

console.log("— SFX: delegated button wiring");
let n0 = await sfxLen();
await click(".fx-index__item");
ok((await sfxLen()) > n0, "index item click → sound");
await goto("#/auth-002");
n0 = await sfxLen();
await click(".fx-btn--primary"); // GET STARTED (primary + data-go)
{
  const oscs = (await sfxLog()).slice(-10).filter((e) => e.node === "osc");
  ok(oscs.some((o) => o.type === "triangle" && o.f >= 140 && o.f <= 160), "primary CTA → thunk+pop (triangle ≈150Hz)");
}
n0 = await sfxLen();
await click("#themeToggle");
ok((await sfxLen()) > n0, "theme tool → tap");

console.log("— SFX: header speaker + Settings row + persistence");
await goto("#/battle-001");
ok(await exists("#sfxToggle"), "SFX tool in the status bar");
await goto("#/set-001");
ok(await exists("#sfxRowToggle"), "Sound-effects toggle row in Settings");
await evalJs(`window.rwfSfx.setMuted(true)`);
await click("#sfxRowToggle"); // back on
ok((await evalJs(`window.rwfSfx.isMuted()`)) === false, "Settings row un-mutes");
await click("#sfxRowToggle"); // off again → persist THIS
ok((await evalJs(`localStorage.getItem('rwf.sfx.muted')`)) === "1", "mute persisted to rwf.sfx.muted=1");
{
  const before = await sfxLen();
  ok((await evalJs(`window.rwfSfx.play('win')`)) === false, "play() no-ops while muted");
  await evalJs(`document.querySelector('.fx-menurow')?.click(); true`);
  ok((await sfxLen()) === before, "delegated listener silent while muted");
}
/* reload → stub re-injected by addScriptToEvaluateOnNewDocument, state persists */
await send("Page.navigate", { url: `${BASE}/index.html#/home-002` });
await waitFor(() => evalJs(`document.querySelector('#sfxToggle') !== null`).catch(() => false), { label: "reload with mute persisted" });
await sleep(500);
ok((await evalJs(`localStorage.getItem('rwf.sfx.muted')`)) === "1", "mute survives reload");
ok(await evalJs(`document.querySelector('#sfxToggle')?.classList.contains('fx-tool--off')`), "header SFX tool painted muted after reload");
await click("#sfxToggle");
ok((await evalJs(`window.rwfSfx.isMuted()`)) === false, "header speaker un-mutes (and confirms with a tap)");

console.log("— SFX: battle deadline tick + DZ heartbeat");
await goto("#/battle-001");
await evalJs(`(() => {
  const host = document.querySelector('.fx-content');
  const el = document.createElement('span');
  el.className = 'fg-count fg-count--dz3';
  el.setAttribute('data-dz-countdown', '');
  el.innerHTML = '<span class="fg-count__time">0:00:42</span>';
  host.appendChild(el);
  return true;
})()`);
await sleep(2600); // watcher runs every 1s
{
  const log = await sfxLog();
  const dz = log.filter((e) => e.node === "osc" && e.type === "sine" && e.f >= 60 && e.f <= 70);
  const ticks = log.filter((e) => e.node === "osc" && e.type === "square" && e.f >= 1500 && e.f <= 1600);
  ok(dz.length >= 1, `DZ level change → heartbeat thump (${dz.length}×)`);
  ok(ticks.length >= 1, `final-minute countdown → tick per second (${ticks.length}×)`);
  await evalJs(`document.querySelector('[data-dz-countdown]')?.remove(); true`);
}

/* ─────────────────────── PART 2 · SQUADS ────────────────────────────── */
console.log("— SQUADS: fresh onboard");
await evalJs(`localStorage.clear(); true`);
await send("Page.navigate", { url: `${BASE}/index.html#/auth-008` });
await waitFor(() => evalJs(`document.querySelector('#obName') !== null`).catch(() => false), { label: "onboard after clear" });
await evalJs(`(() => { const i = document.querySelector('#obName'); i.value = 'Squad Tester'; i.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
await click("#obNameNext");
await goto("#/auth-010");
await evalJs(`document.querySelectorAll('#tierOpts .fx-option')[1].click(); true`); // casual
await click("#tierNext");
let st = await state();
ok(st?.player?.name === "Squad Tester" && st?.player?.tier === "casual", "player onboarded (Squad Tester, casual)");

console.log("— SQUADS: home tabs (BATTLES | SQUADS)");
await goto("#/home-002");
ok(await exists(".fx-sqd-hometabs"), "home segmented tabs render");
ok((await evalJs(`document.querySelectorAll('.fx-sqd-hometabs .fx-seg__item').length`)) === 2, "two tabs: BATTLES + SQUADS");
ok((await evalJs(`document.querySelectorAll('.fx-sqd-hometabs .fx-seg__item')[0].textContent`)) === "BATTLES", "BATTLES is tab one");
await evalJs(`document.querySelectorAll('.fx-sqd-hometabs .fx-seg__item')[1].click(); true`);
await sleep(300);
ok((await evalJs(`location.hash`)).includes("sqd-001"), "SQUADS tab → sqd-001");
ok(await exists(".fx-sqdempty"), "empty state when no squads");
await shot("sqd-empty");
await click(".fx-sqdempty .fg-state__cta");
await sleep(300);
ok((await evalJs(`location.hash`)).includes("sqd-002"), "CREATE A SQUAD → sqd-002");

console.log("— SQUADS: create squad Alpha");
await evalJs(`(() => { const i = document.querySelector('#sqdName'); i.value = 'Alpha Pack'; i.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
ok(await evalJs(`document.querySelector('[data-mate="sam"]')?.classList.contains('fx-chip--on')`), "mates default: sam on");
await evalJs(`document.querySelector('[data-target="light"]').click(); true`);
await click("#sqdCreate");
await sleep(400);
st = await state();
ok(st?.squads?.list?.length === 1, "squad in state");
ok(/^SQD-/.test(st?.squads?.list?.[0]?.code ?? ""), "squad code SQD-xxxx");
const alpha = st.squads.list[0];
const alphaMatch = st.matches.find((m) => m.config.id === alpha.matchId);
ok(alphaMatch?.status === "live", "squad battle live immediately");
ok(alphaMatch?.players?.length === 3, "alpha = you + sam + alex");
ok(st.squads.points.you === 200 && st.squads.points.sam === 200, "members start with 200 house points");

console.log("— SQUADS: dashboard (tabs, leaderboard, three ways)");
ok(await exists(".fx-sqdtabs"), "squad tab chips render");
ok((await evalJs(`document.querySelectorAll('.fx-sqdrow').length`)) === 3, "3 leaderboard rows (adjusted order)");
ok((await evalJs(`document.querySelectorAll('.fx-stand').length`)) === 3, "three-way standing cards");
ok((await text(".fx-sqdhead__code"))?.includes("SQD-"), "squad code shown");
ok((await text(".fx-sqdmeta"))?.includes("200 PTS BALANCE"), "points balance shown");
await shot("sqd-alpha-empty");

console.log("— SQUADS: create squad Bravo (different crew)");
await goto("#/sqd-002");
await evalJs(`(() => {
  document.querySelector('[data-mate="sam"]').click();
  document.querySelector('[data-mate="alex"]').click();
  document.querySelector('[data-mate="jordan"]').click();
  document.querySelector('[data-mate="casey"]').click();
  const i = document.querySelector('#sqdName'); i.value = 'Bravo Band';
  i.dispatchEvent(new Event('input', {bubbles:true}));
  return true; })()`);
await evalJs(`document.querySelector('[data-target="solid"]').click(); true`);
await click("#sqdCreate");
await sleep(400);
st = await state();
ok(st?.squads?.list?.length === 2, "second squad in state");
const bravo = st.squads.list[1];
const bravoMatch = st.matches.find((m) => m.config.id === bravo.matchId);
ok(bravoMatch?.players?.length === 3 && bravoMatch.players.some((p) => p.id === "jordan"), "bravo = you + jordan + casey");
await goto("#/sqd-001");
ok((await evalJs(`document.querySelectorAll('.fx-sqdtabs .fx-chip').length`)) === 3, "two squad tabs + NEW chip");

console.log("— SQUADS: cross-squad dual-credit logging");
/* currentMatch = newest live = bravo → quick log targets bravo, chips carry alpha */
await click("#logBtn");
ok(await exists("#qlSquads"), "'ALSO LOG TO' multi-select appears with squads");
ok((await evalJs(`document.querySelectorAll('#qlSquads .fg-chip[data-sqd]').length`)) === 2, "both squads tickable");
ok((await evalJs(`document.querySelectorAll('#qlSquads .fg-chip[aria-pressed="true"]').length`)) === 2, "both default ON");
ok((await text("#quickLog"))?.includes("counts in each battle"), "fairness note shown");
const tLog1 = Date.now();
await evalJs(`(() => { document.querySelector('[data-n="20"]').click(); return true; })()`);
await sleep(120);
await click("#qlCta");
await sleep(400);
st = await state();
const youIn = (mid) => st.matches.find((m) => m.config.id === mid).entries.filter((e) => e.playerId === "you");
ok(youIn(bravo.matchId).length === 1 && youIn(bravo.matchId)[0].reps === 20, "main log → bravo battle (you, 20)");
ok(youIn(alpha.matchId).length === 1 && youIn(alpha.matchId)[0].reps === 20, "same effort ALSO credited in alpha");
{
  /* log tick = square, base 620Hz + semitone steps (deadline ticks are 1568 — excluded) */
  const oscs = await logOscsSince(tLog1);
  ok(oscs.some((e) => e.type === "square" && e.f >= 550 && e.f <= 1200), "log CTA → rep-tick sound");
}

console.log("— SQUADS: log combo pitch rises");
await click("#logBtn");
await evalJs(`(() => { document.querySelector('[data-n="5"]').click(); return true; })()`);
await sleep(100);
{
  const tA = Date.now();
  await click("#qlCta"); // combo n
  await sleep(450);
  await click("#logBtn");
  await evalJs(`(() => { document.querySelector('[data-n="5"]').click(); return true; })()`);
  await sleep(100);
  const tB = Date.now();
  await click("#qlCta"); // combo n+1 — inside the 4s window
  await sleep(300);
  const oscs = (await logOscsSince(tA)).filter((e) => e.type === "square" && e.f >= 550 && e.f <= 1200);
  const first = oscs.find((e) => e.t >= tA && e.t < tB);
  const last = oscs[oscs.length - 1];
  ok(!!first && !!last && last.f > first.f, `combo: consecutive log ticks rise in pitch (${first?.f} → ${last?.f})`);
}

console.log("— SQUADS: standings math (DOM vs engine)");
/* the dashboard opened on bravo (newest squad) — switch to the alpha tab */
await evalJs(`document.querySelector('[data-sqd-tab="${alpha.id}"]').click(); true`);
await sleep(300);
ok((await evalJs(`document.querySelector('.fx-sqdhead__name')?.textContent`)) === "ALPHA PACK", "tab switch re-renders the selected squad");
const math = await evalJs(`(async () => {
  const E = await import('${BASE}/engine.js'); const S = await import('${BASE}/state.js');
  const st = S.load(); const me = st.player.id;
  const out = {};
  for (const sq of st.squads.list) {
    const m = st.matches.find((x) => x.config.id === sq.matchId);
    const rows = E.standings(m);
    const byRaw = [...rows].sort((a, b) => b.rawReps - a.rawReps);
    out[sq.name] = {
      myRaw: rows.find((r) => r.player.id === me).rawReps,
      top: byRaw[0].player.name, topRaw: byRaw[0].rawReps,
      secondRaw: byRaw[1].rawReps, lastRaw: byRaw[byRaw.length - 1].rawReps,
      n: rows.length,
    };
  }
  return out; })()`);
{
  const a = math["Alpha Pack"];
  ok((await evalJs(`document.querySelectorAll('.fx-sqdrow').length`)) === a.n, `leaderboard row count matches engine (${a.n})`);
  const standVals = await evalJs(`Array.from(document.querySelectorAll('.fx-stand__v')).map(n => n.textContent.trim())`);
  ok(standVals[0] === String(Math.max(0, a.topRaw - a.myRaw)), `FROM TOP = engine gap (${standVals[0]}, engine ${a.topRaw - a.myRaw})`);
  ok(standVals[1] === String(a.myRaw - a.secondRaw), `ABOVE 2ND = engine gap (${standVals[1]}, engine ${a.myRaw - a.secondRaw})`);
  ok(standVals[2] === String(a.myRaw - a.lastRaw), `ABOVE LAST = engine gap (${standVals[2]}, engine ${a.myRaw - a.lastRaw})`);
  ok(await evalJs(`document.querySelector('.fx-stand__v')?.classList.contains('fx-stand__v--up')`), "leading → green (ahead)");
}

console.log("— SQUADS: last-place notice (cheeky, not mean)");
/* push the alpha mates decisively ahead via the state layer (deterministic):
   you 30 → sam 80, alex 60: you're last, >30% behind → comeback arms */
await evalJs(`(async () => { const S = await import('${BASE}/state.js');
  const sq = S.load().squads.list[0];
  S.logToMatch(sq.matchId, { exerciseId: 'pushup', reps: 80, playerId: 'sam' });
  S.logToMatch(sq.matchId, { exerciseId: 'pushup', reps: 60, playerId: 'alex' });
  return true; })()`);
await goto("#/sqd-001");
ok(await exists(".fx-lastnote"), "last place → notice card appears");
ok((await text(".fx-lastnote__t"))?.includes("OFF THE PACE"), "notice frames the gap, not the person");
{
  const eligible = await evalJs(`(async () => { const E = await import('${BASE}/engine.js'); const S = await import('${BASE}/state.js');
    const sq = S.load().squads.list[0]; const m = S.load().matches.find((x) => x.config.id === sq.matchId);
    return E.comebackEligible(m, 'you'); })()`);
  if (eligible) ok((await text(".fx-lastnote__t"))?.includes("COMEBACK ARMED"), "comeback ×1.2 surfaced in the notice");
  ok((await text(".fx-lastnote__s--dim"))?.length > 0, "notice stays kind (no-shame line)");
}
await shot("sqd-lastplace");
/* bravo tab: you lead → no notice */
await evalJs(`document.querySelector('[data-sqd-tab="${bravo.id}"]').click(); true`);
await sleep(300);
ok(!(await exists(".fx-lastnote")), "not last on bravo tab → no notice");
await evalJs(`document.querySelector('[data-sqd-tab="${alpha.id}"]').click(); true`);
await sleep(300);

console.log("— SQUADS: wagers — propose → nudge (agree) → ACTIVE");
await evalJs(`(() => { const i = document.querySelector('#wagerDesc'); i.value = 'Loser makes smoothies'; i.dispatchEvent(new Event('input', {bubbles:true})); return true; })()`);
await evalJs(`document.querySelector('[data-wpts="50"]').click(); true`);
await sleep(150);
await click("#wagerPropose");
await sleep(300);
st = await state();
const w0 = st.squads.wagers[0];
ok(st.squads.wagers.length === 1, "wager proposed (state)");
ok(w0.status === "proposed" && w0.points === 50 && w0.agreements.you === true, "proposed: 50 pts, you auto-agreed");
ok((await text(".fx-wchip--proposed"))?.includes("1/3"), "WAITING 1/3 chip (per-player agreement flags)");
await shot("sqd-wager-proposed");
ok(await exists("[data-wager-nudge]"), "NUDGE MATES (mates say yes — bot sim)");
await evalJs(`document.querySelector('[data-wager-nudge]').click(); true`);
await sleep(300);
st = await state();
ok(st.squads.wagers[0].status === "active", "all members agreed → ACTIVE");
ok(Object.keys(st.squads.wagers[0].agreements).length === 3, "3/3 agreement flags");
ok((await text(".fx-wchip--active"))?.includes("ACTIVE"), "ACTIVE chip on the wager row");
ok((await text(".fx-wsub"))?.includes("last place pays 50 pts"), "'last place pays' consequence shown");
ok((await text(".fx-sqdmeta"))?.includes("50 PTS IN ESCROW"), "escrow badge shows the staked points");
await shot("sqd-wager-active");

console.log("— SQUADS: escrow settles on battle close (last pays first)");
const settle = await evalJs(`(async () => { const E = await import('${BASE}/engine.js'); const S = await import('${BASE}/state.js');
  const st0 = S.load(); const sq = st0.squads.list.find((x) => x.name === 'Alpha Pack');
  const m = st0.matches.find((x) => x.config.id === sq.matchId);
  let guard = 0;
  while (S.load().matches.find((x) => x.config.id === sq.matchId).status === 'live' && guard++ < 12) {
    try { S.logToMatch(sq.matchId, { exerciseId: 'pushup', reps: 50 }); } catch (e) { break; }
  }
  const done = S.load().matches.find((x) => x.config.id === sq.matchId);
  const rows = E.finalStandings(done);
  const winnerId = rows[0].player.id, loserId = rows[rows.length - 1].player.id;
  return { status: done.status, winnerId, loserId }; })()`);
ok(settle.status === "complete", "alpha battle closed (you ran to target)");
await goto("#/sqd-001"); /* render triggers lazy settlement */
await sleep(400);
st = await state();
const w1 = st.squads.wagers[0];
ok(w1.status === "settled", "wager settled on close (state)");
ok(w1.paidBy === settle.loserId && w1.paidTo === settle.winnerId, `escrow: last (${w1.paidBy}) paid winner (${w1.paidTo})`);
ok(st.squads.points[settle.loserId] === 150 && st.squads.points[settle.winnerId] === 250, "points moved ±50 exactly");
ok((await text(".fx-wchip--settled"))?.includes("SETTLED"), "SETTLED chip on the wager row");
ok((await text(".fx-wsub"))?.includes("paid"), "settlement line names payer + payee");
await shot("sqd-wager-settled");

console.log("— VISUAL AUDIT (new screens don't clip)");
let clippedTotal = 0;
const clippedReport = [];
for (const scr of ["sqd-001", "sqd-002", "home-002", "home-003", "set-001"]) {
  await goto(`#/${scr}`);
  const clipped = await evalJs(`(() => {
    const bad = [];
    for (const el of document.querySelectorAll('.fx-content *')) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'visible' || el.classList.contains('fg-lbrow__bar')) continue;
      if (cs.textOverflow === 'ellipsis') continue;
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) bad.push(el.className.toString().split(' ')[0] + ':' + el.scrollWidth + '>' + el.clientWidth);
    }
    return bad;
  })()`);
  const pageOverflow = await evalJs(`document.scrollingElement.scrollWidth - document.documentElement.clientWidth`);
  clippedTotal += clipped.length + (pageOverflow > 0 ? 1 : 0);
  if (clipped.length || pageOverflow > 0) clippedReport.push(`${scr}: ${clipped.join(", ")} pageOverflow=${pageOverflow}px`);
}
ok(clippedTotal === 0, `no clipped/overflowing elements on the new surfaces${clippedReport.length ? " — " + clippedReport.join(" | ") : ""}`);

/* ── verdict ─────────────────────────────────────────────────────────── */
console.log(`\n${passed}/${step + failures.length} assertions passed`);
if (consoleErrors.length) {
  console.log(`\n✗ CONSOLE ERRORS (${consoleErrors.length}):`);
  for (const e of consoleErrors.slice(0, 10)) console.log(`  · ${e}`);
} else {
  console.log("✓ zero console errors");
}
if (failures.length || consoleErrors.length) {
  console.log(`\nE2E FAILED: ${failures.length} assertion(s), ${consoleErrors.length} console error(s)`);
  process.exitCode = 1;
} else {
  console.log("\nE2E PASSED — squads + sfx walked clean");
  console.log("NOTE (manual listen): headless chromium can't play audio. To hear the");
  console.log("SFX wave: open the app, toggle SFX on (header speaker), then tap around —");
  console.log("log two reps in a row (pitch climbs), deal/flip a power-up card, activate");
  console.log("one (arpeggio), add to a charity pot (chip clink), let a battle hit the");
  console.log("danger zone (tick + heartbeat). All synthesized live — zero audio files.");
}

function cleanup() {
  try { ws.close(); } catch {}
  try { proc.kill(9); } catch {}
  try { server.stop(true); } catch {}
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
}
process.on("exit", () => { cleanup(); Bun.sleepSync(150); });
await Bun.sleep(200);
process.exit(process.exitCode ?? 0);
