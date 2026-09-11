/* ═══════════════════════════════════════════════════════════════════════
   RWF V3 BATTLE COURSE — geometry audit (headless probe, no deps).
   Verifies the 3D layout on the REAL server (http://localhost:4173/v3):
   runners in distinct centred lanes at the same ground height, the
   charity pot centred on the course axis past the finish, lane geometry
   sane, the oblique TABLE camera (50–65° down, all runners framed),
   mocap models loaded through the real /models routes, frame
   budget, and zero console errors — at 390×844 and 1280×800. UX2: the
   walk IS the founder's 3-click entry (name → tier → START THE BATTLE).
   Run: bun apps/v3/geom.mjs (needs `bun serve.ts` on :4173)
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process";

const BASE = "http://localhost:4173";
const CDP_PORT = 9233;
let step = 0, passed = 0; const failures = [];
const ok = (c, l) => { step++; if (c) { passed++; console.log(`  ✓ ${l}`); } else { failures.push(l); console.log(`  ✗ FAIL: ${l}`); } };

/* ── server must be the real one ──────────────────────────────────────── */
{
  let up = false;
  try { up = (await fetch(`${BASE}/api/health`)).ok; } catch {}
  if (!up) {
    console.error("real server not on :4173 — start it first:  bun serve.ts");
    process.exit(2);
  }
}

try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-v3-geom"]); } catch {}
await Bun.sleep(250);
const PROFILE = `/tmp/rwf-v3-geom-${Date.now()}`;
const proc = spawn("/usr/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`, "--no-first-run", "--disable-extensions",
  "--use-gl=angle", "--use-angle=swiftshader",
  "about:blank",
], { stdio: ["ignore", "ignore", "ignore"] });

for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok) break; } catch {}
  await Bun.sleep(200);
}
const tab = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let msgId = 0; const pending = new Map(); const errs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
  else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errs.push("console: " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 160));
  else if (m.method === "Runtime.exceptionThrown") errs.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 160));
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable");
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const sleep = (ms) => Bun.sleep(ms);
const call = (expr) => evalJs(`(window.__rwfV3 ? window.__rwfV3.${expr} : null)`);

async function walk(width, height, mobile, tag) {
  console.log(`\n— ${tag} (${width}×${height})`);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Page.navigate", { url: `${BASE}/v3/#/home` });
  for (let i = 0; i < 80; i++) { try { if (await evalJs("window.__rwfV3?.ready === true")) break; } catch {} await sleep(200); }
  await sleep(400);
  // fresh state per leg — the second (desktop) walk must be a fresh visitor too
  await evalJs("localStorage.clear(); location.hash = '#/home'; location.reload(); true");
  for (let i = 0; i < 80; i++) { try { if (await evalJs("window.__rwfV3?.ready === true")) break; } catch {} await sleep(200); }
  await sleep(400);

  const waitSel = async (sel, ms = 9000) => {
    for (let i = 0; i < ms / 150; i++) { try { if (await evalJs(`!!document.querySelector('${sel}')`)) return true; } catch {} await sleep(150); }
    throw new Error(`timeout: ${sel}`);
  };

  // fresh profile → THE 3-CLICK ENTRY → live battle (UX2 — no wizard,
  // no draft screen: auto-deal seats the crew and starts the clock)
  ok(await evalJs(`window.__rwfV3.view() === "play"`), "fresh visit lands on the 3-click entry (not a hub or wizard)");
  ok((await evalJs(`document.querySelector(".v3-screen").scrollHeight - document.querySelector(".v3-screen").clientHeight`)) <= 2,
     "the entry fits the viewport with no scrolling");
  await evalJs(`(() => { const i = document.querySelector('#nameIn'); i.value = "QA"; i.dispatchEvent(new Event("input", {bubbles:true})); document.querySelector('[data-tier="fit"]').click(); return true; })()`);
  await sleep(120);
  ok((await evalJs(`!document.querySelector('#startBattle').disabled`)), "name + tier light START THE BATTLE (3 clicks total)");
  await evalJs(`document.querySelector("#startBattle").click()`); await waitSel("#gl canvas");
  ok(await evalJs(`window.__rwfV3.view() === "battle"`), "after START the view IS the course (live battle, nothing between)");
  await sleep(700);

  /* ── course geometry (world-space, via the debug probes) ── */
  ok(await evalJs(`!!document.querySelector('#gl canvas')`), "WebGL canvas mounted on the real /v3");
  const lanes = await call("laneXs()");
  const spread = Math.max(...lanes) - Math.min(...lanes);
  ok(lanes.length === 4, "4 runners placed (one per lane)");
  ok(new Set(lanes).size === 4 && spread > 5.5 && spread < 7,
     `runners in DISTINCT lanes (Δx=${spread.toFixed(2)} for laneW 2.1 — no shared lane)`);
  ok(Math.abs(lanes.reduce((a, b) => a + b, 0)) < 0.01, "lane row centred on the course axis (x=0)");

  /* ── the oblique POV (default TABLE) — angle + all-runners-on-frame ── */
  const cam = await call("camState()");
  ok(cam?.mode === "table", "TABLE is the default camera (oblique board-game view)");
  ok(cam?.downDeg >= 50 && cam?.downDeg <= 65,
     `TABLE looks down in the 50–65° band (${cam?.downDeg}° — perspective third person)`);
  const onFrame = [];
  for (const pid of ["you", "sam", "alex", "mika"]) {
    const sp = await call(`runnerScreen('${pid}')`);
    onFrame.push(!!sp && Math.abs(sp.x) <= 1 && Math.abs(sp.y) <= 1);
  }
  ok(onFrame.length === 4 && onFrame.every(Boolean), "all 4 runners on-frame at once in the TABLE view");
  const potNdc = await call(`worldScreen(0, 1.4, ${(await call("potPos()")).z})`);
  ok(!!potNdc && Math.abs(potNdc.x) <= 0.45 && Math.abs(potNdc.y) <= 0.75,
     `charity pot framed with the course in TABLE (NDC ${potNdc?.x},${potNdc?.y} — centred, on-screen)`);

  const ys = [], zs = [];
  for (const pid of ["you", "sam", "alex", "mika"]) {
    const p = await call(`runnerPos('${pid}')`);
    if (p) { ys.push(p.y); zs.push(p.z); }
  }
  ok(ys.length === 4 && ys.every((y) => Math.abs(y - 0.02) < 0.001),
     `every runner on the SAME ground plane (y=${[...new Set(ys.map((y) => +y.toFixed(3)))].join(",")}) — no z-fight with the surface`);
  ok(new Set(zs).size === 1, "all runners level at the start (equal z)");

  const pot = await call("potPos()");
  ok(!!pot && Math.abs(pot.x) < 0.01, `charity pot centred on the course axis (x=${pot?.x})`);
  const track = await call("trackStats()");
  ok(pot.z < track.finishZ, `charity pot sits PAST the finish line (z=${pot.z} < finish ${track.finishZ})`);
  ok(track.lanes === 4, "track built with 4 lane strips (tier-coloured)");

  /* ── the real model routes ── */
  let models = false;
  for (let i = 0; i < 90 && !models; i++) { models = await call("modelsReady()").catch(() => false); if (!models) await sleep(300); }
  ok(models === true, "the meshy trio + Soldier mocap loaded through the real /models routes");
  const avatar = await call("runnerPos('you')");
  ok(avatar?.avatarReady === true, "your runner is a real rigged atelier avatar (not the placeholder capsule)");

  /* ── runner advance + frame budget on the real server ──
     (poll: the meshy trio is heavier than flat-tinted Geno on SwiftShader,
     and the lerp's dt is clamped — wall time to advance varies) */
  await evalJs(`window.__rwfV3.driveLog(30); true`);
  let after = null;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    after = await call("runnerPos('you')");
    if (after.z < avatar.z - 1) break;
  }
  ok(after.z < avatar.z - 1, `runner advanced after logging (Δz=${(after.z - avatar.z).toFixed(2)})`);
  await sleep(1500);
  const fms = await call("frameMs()");
  ok(fms > 0 && fms < 8, `frame render cost under 8ms headless (median ${fms.toFixed(2)}ms)`);

  /* ── DOM-level sanity ── */
  ok((await evalJs(`document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth`)) <= 1, "no horizontal overflow");
  ok((await evalJs(`document.querySelectorAll('.v3-srow').length`)) === 4, "HUD standings strip shows 4 rows");
  ok((await evalJs(`document.querySelector('#hand .bd-card') !== null`)), "card hand docked under the course (auto-dealt at START)");
  ok((await evalJs(`!!document.querySelector('#orbitHint')`)), "drag-to-look affordance mounted over the course");
  ok((await evalJs(`document.querySelector('#hand').getBoundingClientRect().bottom <= innerHeight + 1`)), "card hand fully on-screen");
}

await walk(390, 844, true, "PHONE");
await walk(1280, 800, false, "DESKTOP");

console.log("\n— CONSOLE");
ok(errs.length === 0, `zero console errors on the real /v3${errs.length ? " — " + errs[0] : ""}`);

console.log(`\n${passed}/${step} geometry checks passed`);
try { proc.kill("SIGKILL"); } catch {}
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-v3-geom"]); } catch {}
process.exit(failures.length ? 1 : 0);
