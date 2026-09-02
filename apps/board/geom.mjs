/* RWF V2 BOARD — geometry audit (one-off headless probe).
   Verifies flagship layout quality WITHOUT screenshots: bounds, centering,
   overlap, visibility at 390×844 and 1280×800, plus console errors on the
   REAL server (http://localhost:4173/v2). Run: bun apps/board/geom.mjs */
import { spawn } from "node:child_process";

const BASE = "http://localhost:4173";
const CDP_PORT = 9231;
let step = 0, passed = 0; const failures = [];
const ok = (c, l) => { step++; if (c) { passed++; console.log(`  ✓ ${l}`); } else { failures.push(l); console.log(`  ✗ FAIL: ${l}`); } };

try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-board-geom"]); } catch {}
await Bun.sleep(250);
const PROFILE = `/tmp/rwf-board-geom-${Date.now()}`;
const proc = spawn("/usr/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`, "--no-first-run", "--disable-extensions", "about:blank",
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

async function walk(width, height, mobile, tag) {
  console.log(`\n— ${tag} (${width}×${height})`);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  await send("Page.navigate", { url: `${BASE}/v2/#/home` });
  for (let i = 0; i < 60; i++) { try { if (await evalJs("window.__rwfBoard?.ready === true")) break; } catch {} await sleep(200); }
  await sleep(400);
  ok(await evalJs("document.documentElement.dataset.theme") === "board", "board theme applied on the real /v2");

  // set up a live table with a known state (waits — the router is async)
  const waitSel = async (sel, ms = 8000) => {
    for (let i = 0; i < ms / 150; i++) { try { if (await evalJs(`!!document.querySelector('${sel}')`)) return true; } catch (e) { console.log(`      … ${sel}: ${String(e.message).slice(0, 120)}`); } await sleep(150); }
    console.log(`      DUMP hash=${await evalJs("location.hash")}`);
    console.log(`      DUMP html=${(await evalJs("document.body.innerHTML.slice(0, 240)")).replace(/\s+/g, " ")}`);
    throw new Error(`timeout: ${sel}`);
  };
  await evalJs(`location.hash = "#/setup"`); await sleep(250);
  await evalJs(`(() => { const i = document.querySelector("#nameIn"); i.value = "QA"; i.dispatchEvent(new Event("input", {bubbles:true})); document.querySelector('[data-tier="fit"]').click(); return true; })()`);
  await sleep(120);
  await evalJs(`document.querySelector("#setupGo").click()`); await sleep(300);
  await evalJs(`location.hash = "#/create"`); await waitSel("#deal");
  await evalJs(`document.querySelector("#deal").click()`); await waitSel("#draftFan .bd-card");
  await evalJs(`document.querySelectorAll("#draftFan .bd-card")[0].click()`); await sleep(150);
  await waitSel("#keepBtn:not([disabled])");
  await evalJs(`document.querySelector("#keepBtn").click()`); await waitSel("#felt");
  await sleep(600);
  await evalJs(`window.__rwfBoard.driveLog(60); true`); await sleep(1400);

  // table geometry
  const felt = await evalJs(`(() => { const r = document.querySelector("#felt").getBoundingClientRect(); return JSON.stringify({ x:r.x, y:r.y, w:r.width, h:r.height }); })()`);
  const F = JSON.parse(felt);
  ok(F.w > 200 && F.h >= 230, `felt is table-sized (${F.w.toFixed(0)}×${F.h.toFixed(0)})`);
  ok(F.w <= width + 1, `felt fits the viewport width`);

  const pot = JSON.parse(await evalJs(`(() => {
    const k = document.querySelector("#pot").getBoundingClientRect();
    const f = document.querySelector("#felt").getBoundingClientRect();
    return JSON.stringify({ cx: k.x + k.width / 2, cy: k.y + k.height / 2, w: k.width,
                            fx: f.x + f.width / 2, fy: f.y + f.height / 2 });
  })()`));
  ok(Math.abs(pot.cx - pot.fx) <= 2 && Math.abs(pot.cy - pot.fy) <= 2, "pot medallion centred in the felt");
  ok(pot.w >= 100, `pot medallion reads at a glance (${pot.w.toFixed(0)}px)`);

  const toks = await evalJs(`(() => {
    const felt = document.querySelector("#felt").getBoundingClientRect();
    const out = [];
    for (const t of document.querySelectorAll(".bd-token")) {
      const r = t.getBoundingClientRect();
      out.push({ id: t.dataset.pid, cx: r.x + r.width/2, cy: r.y + r.height/2, inside: r.x >= felt.x - 2 && r.right <= felt.right + 2 && r.y >= felt.y - 2 && r.bottom <= felt.bottom + 2, disp: getComputedStyle(t).display });
    }
    return JSON.stringify(out);
  })()`);
  const T = JSON.parse(toks);
  ok(T.length === 4, "4 tokens placed");
  ok(T.every((t) => t.inside && t.disp !== "none"), "every token inside the felt bounds");
  const lanes = JSON.parse(await evalJs(`JSON.stringify([...document.querySelectorAll(".bd-lane")].map((l) => { const r = l.getBoundingClientRect(); return { w: r.width, h: r.height }; }))`));
  ok(lanes.length === 4 && lanes[0].w > lanes[3].w, "nested lanes (outer > inner)");
  ok((await evalJs(`document.querySelectorAll("#stacks .bd-chip").length`)) >= 4, "pot chips visible");

  // hand + buttons visible in-viewport
  const hand = JSON.parse(await evalJs(`(function(){ const r = document.querySelector("#hand").getBoundingClientRect(); return JSON.stringify({ top:r.top, bottom:r.bottom, ih: innerHeight }); })()`));
  ok(hand.bottom <= hand.ih + 1, `card hand fully on-screen (bottom ${hand.bottom.toFixed(0)} ≤ ${hand.ih})`);
  ok((await evalJs(`document.querySelector("#logBtn").getBoundingClientRect().height`)) > 40, "LOG CTA is a big popping button");

  // no horizontal scroll anywhere
  ok((await evalJs(`document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth`)) <= 1, "no horizontal overflow");
  // key text uses display font (Anton via board theme)
  ok(/Anton/.test(await evalJs(`getComputedStyle(document.querySelector(".bd-h1, .bd-top__name, .bd-card__name")).fontFamily`)), "display font = Anton (board theme)");
}

await walk(390, 844, true, "PHONE");
await walk(1280, 800, false, "DESKTOP");

console.log("\n— CONSOLE");
ok(errs.length === 0, `zero console errors on the real /v2${errs.length ? " — " + errs[0] : ""}`);

console.log(`\n${passed}/${step} geometry checks passed`);
try { proc.kill("SIGKILL"); } catch {}
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-board-geom"]); } catch {}
process.exit(failures.length ? 1 : 0);
