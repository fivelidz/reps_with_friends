/* ═══════════════════════════════════════════════════════════════════════
   RWF V4 SoT APP — TUTORIAL e2e (headless chromium + CDP, no deps)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   Covers the tutorial suite on the real app:
     · HOW IT WORKS screen — the loop diagram (7 nodes), the handicap
       table (couch 134 / athlete 236 for the same 200), the four stakes,
       modes + dual-surface, entry from welcome AND Profile
     · THE CARD SHEET — all 21 cards, family filter chips, the draft
       rules block, the proof flow; entry from the tutorial AND Power-Ups
     · THE GUIDED DEMO — full headless walk on SHADOW state: skip works,
       exit restores the real save, the scene sequence matches the
       script, captions render, state transitions happen (deal picked →
       logged → rival wins → banked → proof accepted → recap → season),
       end card shows · ZERO console errors.
   Shots land in apps/sot/shots/ with the _tut suffix (390×844 @2x).
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4196;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9231 + Math.floor(Math.random() * 400);

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. temp server: apps/sot at / + the shared engine ────────────────── */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === "/sot-engine.js") {
      const f2 = Bun.file(join(HERE, "..", "sot-engine.js"));
      if (await f2.exists()) return new Response(f2, { headers: { "content-type": "text/javascript" } });
      return new Response("not found", { status: 404 });
    }
    const fsPath = p === "/" ? join(HERE, "index.html") : join(HERE, p.replace(/^\//, ""));
    const f = Bun.file(fsPath);
    if (await f.exists()) {
      const ext = fsPath.slice(fsPath.lastIndexOf("."));
      return new Response(f, {
        headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-store" },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

/* ── 2. headless chromium ──────────────────────────────────────────────── */
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-v4-tut-e2e"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-v4-tut-e2e-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions", "--autoplay-policy=no-user-gesture-required",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
proc.on("exit", () => { try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
process.on("exit", () => { try { proc.kill("SIGKILL"); } catch {} });

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

/* ── 3. minimal CDP client ─────────────────────────────────────────────── */
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
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function click(sel) {
  const r = await evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`click target missing: ${sel}`);
  await sleep(240);
}
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);
const count = (sel) => evalJs(`document.querySelectorAll('${sel}').length`);
const bodyHas = (s) => evalJs(`(document.body.innerText || '').includes(${JSON.stringify(s)})`);
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}_tut.png`), Buffer.from(r.data, "base64"));
}
const okBody = async (s, label) => { const r = await bodyHas(s); ok(r, label); };

/* the founder's language rule, enforced on the new surfaces too */
const BANNED = /\bmatch(?:es|ed|ing)?\b|kitty|poker|\bruf\b|\b300\b/i;
const langClean = (where) =>
  evalJs(`(() => { const t = document.body.innerText || ''; return !${BANNED.toString()}.test(t); })()`)
    .then((clean) => ok(clean === true, `language clean on ${where} (no match/kitty/poker/RUF/300)`));

/* demo status surface reader */
const demoState = () => evalJs(`(() => { const d = window.__rwfSotDemo; if (!d) return null;
  return JSON.parse(JSON.stringify({ i: d.sceneIndex, id: d.sceneId, cap: d.caption, running: d.running, endcard: d.endcard, paused: d.paused, total: d.totalScenes })); })()`);
async function waitScene(id, timeout = 60000) {
  await waitFor(async () => { const d = await demoState(); return d && d.running && d.id === id; },
    { timeout, every: 120, label: `demo scene ${id}` });
}

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
async function main() {
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF V4 TUTORIAL E2E — ${BASE} (headless chromium, 390×844)\n`);

await send("Page.navigate", { url: `${BASE}/` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && window.RWFSoT && window.RWFTutorial && document.querySelector('.screen') !== null`).catch(() => false),
  { label: "v4 app + tutorial module load", timeout: 20000 }
);
await sleep(600);

console.log("— WELCOME ENTRIES");
ok(await exists("#tut-watch"), "welcome offers ▶ Watch how it works");
ok(((await text("#tut-watch")) || "").includes("Watch how it works"), "demo entry labelled for the founder");
ok(await exists("#tut-howto"), "welcome offers the How-It-Works screen");
ok(await exists("#tut-cards"), "welcome offers the card sheet");

console.log("— HOW IT WORKS (from welcome)");
await click("#tut-howto");
ok(await exists("#howitworks"), "how-it-works screen renders");
ok((await count("#tut-loop .tut-loop__node")) === 7, "the loop diagram shows all 7 nodes (log → battle → win → bank → week → stake → identity)");
ok(await bodyHas("DAILY WIN"), "the loop names the Daily Win");
ok(await bodyHas("BANKS THE DAY"), "the loop explains banking");
ok((await count("#tut-tiers .tut-tier")) === 5, "handicap table: header + 4 tiers");
ok(await bodyHas("134"), "couch 134 physical reps for the 200 target");
ok(await bodyHas("236"), "athlete 236 physical reps for the same target");
ok(await bodyHas("×1.5"), "couch multiplier ×1.5 shown");
ok(await bodyHas("×0.85"), "athlete multiplier ×0.85 shown");
ok((await count("#tut-stakes .pick")) === 4, "the four stakes render");
okBody("Crew Giving", "crew giving (the money circle) in the stakes row");  // 2026-09-11: reworded per docs/32 ADDENDUM wording table — the stakes row's money entry is Crew Giving now
okBody("Dinner", "dinner stake present");
ok((await count("#tut-modes .chip")) === 3, "modes: individual / team / corporate");
okBody("authoritative", "dual-surface rule: the app is authoritative");
okBody("group chat", "dual-surface rule: the chat is where it lives");
await langClean("how-it-works");
await shot("howitworks-loop");

console.log("— THE CARD SHEET (from the tutorial)");
await click("#tut-to-cards .btn");
ok(await exists("#cardsheet"), "card sheet renders");
ok((await count(".tut-cardface")) === 21, "all 21 cards render");
ok((await count("#card-filters .tut-filter")) === 7, "filter chips: All + 6 families");
ok(await bodyHas("LIGHTNING ROUND"), "canon: Lightning Round face readable");
ok(await bodyHas("RESCUE ROPE"), "post-launch: Rescue Rope present");
ok(await bodyHas("WILDCARD WORKOUT"), "exercise family present");
ok(await bodyHas("PACK BOND"), "rivalry family present");
ok(await bodyHas("SPOT CHECK"), "proof family present");
ok(await bodyHas("UNDERDOG"), "catch-up family present");
ok((await count(".tut-cardface .tut-rarchip")) === 21, "every card wears its rarity chip");
ok(await exists("#tut-draft-rules"), "draft rules block present");
okBody("50, then 100, then 200", "reroll-to-pot escalation shown");
okBody("halfway bonus", "halfway bonus deal shown");
ok(await exists("#tut-proof-flow"), "proof flow block present");
okBody("still banks", "contested = 0 but banks, stated");
await langClean("card sheet");
await shot("cardsheet");

console.log("— CARD SHEET FILTERS");
await click('[data-fam="canon"]');
ok((await count(".tut-cardface")) === 4, "Launch Four filter → exactly 4 cards");
await click('[data-fam="proof"]');
ok((await count(".tut-cardface")) === 2, "Proof filter → Prove It + Spot Check");
await click('[data-fam="all"]');
ok((await count(".tut-cardface")) === 21, "All → back to 21");

console.log("— POWER-UPS + PROFILE ENTRIES");
// the app-shell entries need an onboarded player with a group — seed the demo crew
await evalJs(`(() => { RWFSoT.seedDemo(); const d = RWFSoT.snapshot().myDraft; if (d) window.__rwfV4.dealDismissed = d.openedAt; return true; })()`);
await sleep(400);
await evalJs(`window.__rwfTabTo("powerups")`);
await sleep(300);
ok(await exists("#tut-cardsheet-link"), "Power-Ups links to the full card sheet");
await click("#tut-cardsheet-link");
ok(await exists("#cardsheet"), "card sheet opens from Power-Ups");
await evalJs(`window.__rwfTabTo("profile")`);
await sleep(300);
ok(await exists("#profile-howto"), "Profile links to how-it-works");
await click("#profile-howto");
ok(await exists("#howitworks"), "how-it-works opens from Profile");
await shot("howitworks-from-profile");

console.log("— GUIDED DEMO · SKIP + EXIT (shadow safety)");
await evalJs(`window.__rwfGo("welcome")`);
await sleep(300);
await click("#tut-watch");
await waitFor(async () => { const d = await demoState(); return d && d.running; }, { label: "demo starts", timeout: 8000 });
ok(true, "guided demo starts from the welcome button");
ok(await exists(".tut-narr"), "narrator bottom-sheet appears");
ok(await exists(".tut-demo-shield"), "click shield up — the script owns the screen");
await waitScene("crew", 15000);
await evalJs(`window.__rwfSotDemo.setSpeed(2)`);
const before = await demoState();
await evalJs(`window.__rwfSotDemo.skip()`);
await waitFor(async () => { const d = await demoState(); return d.i > before.i; }, { label: "skip advances", timeout: 6000 });
ok(true, `skip advances the scene (${before.id} → ${(await demoState()).id})`);
ok((await demoState()).i < (await demoState()).total, "dots/scene index inside the script");
await evalJs(`window.__rwfSotDemo.exit()`);
await sleep(400);
ok(!(await exists(".tut-narr")), "exit tears the narrator down");
ok(!(await exists(".tut-demo-shield")), "exit lifts the click shield");
ok(await exists("h1.display"), "back on the real app (welcome)");
const shadowGone = await evalJs(`localStorage.getItem(window.RWFSoT.DEMO_KEY) === null`);
ok(shadowGone, "shadow state removed on exit — real save untouched");

console.log("— GUIDED DEMO · FULL RUN (2×, shadow state)");
await click("#tut-watch");
await waitFor(async () => { const d = await demoState(); return d && d.running; }, { label: "demo restarts", timeout: 8000 });
await evalJs(`window.__rwfSotDemo.setSpeed(2)`);

const scriptIds = await evalJs(`window.RWFTutorial.SCRIPT.map(s => s.id)`);
const seen = [];
const checksAt = {
  crew: async () => {
    const s = await evalJs(`(() => { const g = Object.values(RWFSoT.state.groups)[0]; return g ? JSON.stringify({ name: g.name, members: g.members.map(m => m.name) }) : "null"; })()`);
    const g = JSON.parse(s);
    return g && g.name === "Gold Squad" && g.members.length === 4 && g.members.includes("Marco");
  },
  "deal-pick": async () =>
    evalJs(`(() => { const s = RWFSoT.snapshot(); return s.me && s.me.inventory && s.me.inventory.length === 1; })()`),
  log: async () =>
    evalJs(`(() => { const s = RWFSoT.snapshot(); const me = s.board.find(r => r.member.id === s.me.id); return me && me.adjusted >= 20; })()`),
  "rival-win": async () =>
    evalJs(`(() => { const s = RWFSoT.snapshot(); const m = s.group.members.find(x => x.name === "Marco"); return s.battle && s.battle.winnerId === m.id; })()`),
  bank: async () =>
    evalJs(`(() => { const s = RWFSoT.snapshot(); const me = s.group.members.find(x => x.id === s.me.id); return me && me.completions === 1; })()`),
  proof: async () =>
    evalJs(`(() => { const s = RWFSoT.snapshot(); return s.feed.some(e => e.type === "proof_accepted"); })()`),
  recap: async () =>
    evalJs(`(() => { const s = RWFSoT.snapshot(); return s.season.battles[0].status === "ended"; })()`),
  season: async () => bodyHas("SEASON"),
  stake: async () => evalJs(`(document.body.innerText || "").toLowerCase().includes("crew giving")`),  // 2026-09-11: reworded per docs/32 ADDENDUM wording table
};
const checkpoints = {};
const pollStart = Date.now();
let narrationShots = 0;
for (;;) {
  const d = await demoState();
  if (!d || (!d.running && !d.endcard)) {
    if (Date.now() - pollStart > 150000) { ok(false, "demo run timed out"); break; }
    await sleep(200);
    continue;
  }
  if (!seen.length || seen[seen.length - 1] !== d.id) {
    seen.push(d.id);
    const capDom = await text(".tut-narr__cap");
    ok(capDom === d.cap, `scene ${d.id}: caption renders (${(d.cap || "").slice(0, 38)}…)`);
    if (d.id === "deal" && narrationShots === 0) { narrationShots++; await sleep(700); await shot("demo-deal-narration"); }
    if (checksAt[d.id] && checkpoints[d.id] === undefined) {
      await sleep(650); // let the scene's run() settle
      checkpoints[d.id] = await checksAt[d.id]();
    }
  }
  if (d.endcard || d.id === "end") break;
  if (Date.now() - pollStart > 150000) { ok(false, "demo run timed out"); break; }
  await sleep(180);
}

for (const [id, pass] of Object.entries(checkpoints)) ok(pass === true, `state transition at "${id}" holds`);
const seqOk = scriptIds.every((id) => seen.includes(id));
ok(seqOk, `full script walked in order (${seen.length} scenes seen of ${scriptIds.length})`);
ok(await exists(".tut-demo-endcard"), "the end card shows: THAT'S THE WHOLE GAME");
okBody("Join the Battle", "end card carries the founder's line");
await shot("demo-endcard");

console.log("— END CARD EXIT");
await click('[data-end="play"]');
await sleep(400);
ok(!(await exists(".tut-demo-endcard")), "JOIN THE BATTLE exits the demo");
const realUntouched = await evalJs(`localStorage.getItem(window.RWFSoT.DEMO_KEY) === null`);
ok(realUntouched, "shadow key cleaned up after the full run");
ok(await evalJs(`!!document.querySelector("h1.display")`), "welcome hero restored");

console.log("— CONSOLE");
ok(consoleErrors.length === 0, `zero console errors (got ${consoleErrors.length})`);
if (consoleErrors.length) consoleErrors.slice(0, 8).forEach((e) => console.log("   • " + e));
}

main().then(() => {
  console.log(`\n${passed}/${passed + failures.length} checks passed`);
  if (failures.length) {
    console.log("FAILURES:");
    failures.forEach((f) => console.log("  ✗ " + f));
    server.stop(true);
    process.exit(1);
  }
  console.log("ALL GREEN — the tutorial suite walks the spec, the cards and the demo.");
  server.stop(true);
  process.exit(0);
}).catch((e) => {
  console.error(`\nWALK BROKE: ${e.message}`);
  if (failures.length) {
    console.log(`(${passed} passed before the break) FAILURES:`);
    failures.forEach((f) => console.log("  ✗ " + f));
  }
  console.log(`console errors so far: ${consoleErrors.length}`);
  consoleErrors.slice(0, 8).forEach((x) => console.log("   • " + x));
  server.stop(true);
  process.exit(1);
});
