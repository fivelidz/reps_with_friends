// Deep user-journey verification via Chromium CDP (390px) with the API live.
// Companion to browser.ts (which walks the core UI flow). This script drives
// the five PRODUCT journeys end-to-end, including the offline-first sync
// layer (arm → adopt → queue → flush → converge) against the real API on :4174.
//
//   J1 happy path with sync   J2 offline queue/flush   J3 convergence (2nd device)
//   J4 persistence (reload)   J5 edge/empty states + reset
//
// Run: bun apps/web/test/journeys.ts
//   needs: bun serve.ts (:4173) AND the API (apps/api, :4174)

import { spawn } from "node:child_process";

const APP = "http://localhost:4173/app";
const API = "http://localhost:4174";
const DEBUG_PORT = 9344;

// ── launch chromium ──────────────────────────────────────────────────────────
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  "--window-size=390,844",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--user-data-dir=/tmp/rwf-journeys-profile",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getPageWs(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const list = (await r.json()) as { type: string; webSocketDebuggerUrl?: string }[];
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl!;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error("chromium CDP never came up");
}

const ws = new WebSocket(await getPageWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void }>();
const consoleErrors: { phase: string; text: string }[] = [];
let phase = "boot";

ws.onmessage = (ev: MessageEvent) => {
  const msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!.resolve(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push({ phase, text: `EXCEPTION: ${JSON.stringify(msg.params.exceptionDetails).slice(0, 1500)}` });
  }
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(msg.params.type)) {
    consoleErrors.push({ phase, text: `CONSOLE.${msg.params.type}: ${JSON.stringify(msg.params.args).slice(0, 300)}` });
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    consoleErrors.push({ phase, text: `LOG: ${msg.params.entry.text} ${msg.params.entry.url ?? ""}`.slice(0, 300) });
  }
};

function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const id = ++msgId;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression: string): Promise<any> {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    throw new Error(`page eval failed: ${expression.slice(0, 100)} → ${JSON.stringify(r.result.exceptionDetails).slice(0, 300)}`);
  }
  return r.result?.result?.value;
}

async function nav(url: string): Promise<void> {
  await send("Page.navigate", { url });
  await sleep(700);
}

/** Click the first button whose textContent includes `text` (trimmed match first). */
async function clickBtn(text: string): Promise<boolean> {
  return evalJs(`(() => {
    const bs = [...document.querySelectorAll("button")];
    const b = bs.find(x => x.textContent.trim() === ${JSON.stringify(text)})
      || bs.find(x => x.textContent.replace(/\\s+/g," ").includes(${JSON.stringify(text)}));
    if (!b) return false; b.click(); return true;
  })()`);
}

/** Poll a JS condition until true (returns false on timeout). */
async function waitFor(cond: string, ms: number, stepMs = 300): Promise<boolean> {
  for (let t = 0; t <= ms; t += stepMs) {
    try {
      if (await evalJs(cond)) return true;
    } catch { /* transient */ }
    await sleep(stepMs);
  }
  return false;
}

// ── reporting ────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures: string[] = [];
const syncLog: string[] = [];
function ok(journey: string, label: string, cond: boolean): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; failures.push(`[${journey}] ${label}`); console.log(`  ✗ FAIL ${label}`); }
}
function note(s: string): void { syncLog.push(s); console.log(`    · ${s}`); }

// ── API control (kill / restart from the driver) ─────────────────────────────
import { readFileSync, readdirSync, openSync } from "node:fs";

/** Pid of the REAL bun API process (comm === "bun", cmdline has src/main.ts).
 *  pgrep -f alone also matches the bash -c wrapper that launched it. */
function apiPid(): number | null {
  let pids: number[] = [];
  try {
    pids = readdirSync("/proc")
      .filter((d) => /^\d+$/.test(d))
      .map(Number);
  } catch { return null; }
  for (const pid of pids) {
    try {
      const comm = readFileSync(`/proc/${pid}/comm`, "utf8").trim();
      if (comm !== "bun") continue;
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
      if (cmd.includes("src/main.ts")) return pid;
    } catch { /* gone */ }
  }
  return null;
}
function killApi(): void {
  const pid = apiPid();
  if (pid) { process.kill(pid, "SIGKILL"); note(`API killed (pid ${pid})`); }
  else note("API kill: no pid found!");
}
function startApi(): void {
  const logFd = openSync("/tmp/rwf-api-journeys.log", "a");
  const child = spawn("bun", ["src/main.ts"], {
    cwd: new URL("../../api/", import.meta.url).pathname,
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  note(`API restarted (pid ${child.pid})`);
}
async function apiUp(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/health`);
    return r.ok;
  } catch { return false; }
}

// ═════════════════════════════════════════════════════════════════════════════
try {
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");

  // ═══ J1 — HAPPY PATH WITH SYNC ═══════════════════════════════════════════
  console.log("\nJ1 — happy path with sync");
  phase = "J1";

  if (!(await apiUp())) throw new Error("API not running on :4174 — start it first");
  await nav(APP);
  await evalJs(`localStorage.clear()`);
  await nav(APP);
  ok("J1", "fresh storage → onboard screen", await evalJs(`!!document.querySelector(".screen--onboard")`));

  // onboard: name + tier card
  await evalJs(`(() => { const i = document.querySelector(".screen--onboard input"); i.value = "Journeys"; i.dispatchEvent(new Event("input", {bubbles:true})); })()`);
  await evalJs(`document.querySelector(".tiercard--casual").click()`);
  await evalJs(`document.querySelector(".screen--onboard .rwf-btn--primary").click()`);
  await sleep(400);
  ok("J1", "onboard (tier card) → crew screen", await evalJs(`location.hash === "#/crew"`));

  // create crew
  await evalJs(`(() => { const i = document.querySelector(".input"); i.value = "Journey Crew"; })()`);
  await clickBtn("CREATE & GET CODE");
  await sleep(400);
  const localCode = await evalJs(`JSON.parse(localStorage.getItem("rwf.state.v1")).crew.code`);
  // TEST UPDATED 2026-08-27 (stale assertion): crew codes are 5 chars per doc 13
  // §705, matching the API's newCrewCode(). Was asserting 6.
  ok("J1", `crew created (local code ${localCode})`, typeof localCode === "string" && localCode.length === 5);

  // arm sync from the crew manage screen
  await evalJs(`location.hash = "#/crew"`);
  await sleep(400);
  ok("J1", "crew screen offers SYNC THIS CREW", await evalJs(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("SYNC THIS CREW"))`));
  await clickBtn("SYNC THIS CREW");
  const synced = await waitFor(`document.getElementById("syncchip")?.className.includes("syncchip--synced")`, 8000);
  ok("J1", "chip flips to SYNCED after arming", synced);
  const chipTitle = await evalJs(`document.getElementById("syncchip")?.title ?? ""`);
  // Both sides now mint 5-char codes (app newCrewCode + API db.ts newCrewCode),
  // so the adopted code has the same shape as the local one it replaces.
  const adoptedCode = (chipTitle.match(/crew ([A-Z0-9]{5})/) ?? [])[1] ?? null;
  ok("J1", `remote code adopted (${adoptedCode ?? "?"} ≠ local ${localCode})`, !!adoptedCode && adoptedCode !== localCode);
  const remoteCrew = await (await fetch(`${API}/crews/${adoptedCode}`)).json();
  ok("J1", "adopted code resolves on the API (GET /crews/:code)", !!remoteCrew?.crew?.code);
  note(`local ${localCode} → adopted ${adoptedCode}; remote crew "${remoteCrew?.crew?.name}"`);

  // create match → link screen
  await evalJs(`location.hash = "#/new"`);
  await sleep(400);
  await evalJs(`[...document.querySelectorAll(".seg-btn")].find(b => b.textContent.trim() === "100").click()`);
  await clickBtn("CREATE MATCH");
  await sleep(500);
  ok("J1", "match created → link screen", await evalJs(`location.hash.startsWith("#/link/")`));
  const linkCode = await evalJs(`document.querySelector(".code-box .code")?.textContent`);
  ok("J1", `link screen shows the ADOPTED code (${linkCode})`, linkCode === adoptedCode);

  // demo crew (needed for comeback + standings life)
  await clickBtn("ADD DEMO CREW");
  await sleep(400);
  ok("J1", "demo crew added (button flips to ✓)", await evalJs(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("DEMO CREW ADDED ✓"))`));
  await clickBtn("GO TO MATCH");
  await sleep(500);
  ok("J1", "match view live (4 players)", await evalJs(`document.querySelectorAll(".strow").length === 4`));

  // manual log #1
  await clickBtn("LOG 10");
  await sleep(600);
  ok("J1", "manual log #1 → standings update (10 raw on my row)", await evalJs(`[...document.querySelectorAll(".strow")].some(r => r.textContent.includes("Journeys") && r.textContent.includes("10 raw"))`));

  // comeback badge: wait for a sim to outscore me by >30%
  const badge = await waitFor(
    `[...document.querySelectorAll(".strow")].some(r => r.textContent.includes("Journeys") && !!r.querySelector(".cbk-badge"))`,
    30000, 1000
  );
  ok("J1", "comeback badge shows on my row when >30% behind (demo crew)", badge);

  // manual log #2 — comeback applies (×1.2 toast + flagged entry)
  await clickBtn("LOG 10");
  await sleep(600);
  const comebackApplied = await evalJs(`(() => {
    const s = JSON.parse(localStorage.getItem("rwf.state.v1"));
    const m = s.matches[s.matches.length - 1];
    const me = s.me.id;
    return m.entries.some(e => e.playerId === me && e.comeback === true);
  })()`);
  ok("J1", "manual log #2 while armed → comeback flagged (×1.2)", comebackApplied);

  // manual log #3
  await clickBtn("LOG 10");
  await sleep(600);
  ok("J1", "manual log #3 → 30 raw on my row", await evalJs(`[...document.querySelectorAll(".strow")].some(r => r.textContent.includes("Journeys") && r.textContent.includes("30 raw"))`));

  // camera verify → no camera in headless → friendly card → close
  await clickBtn("CAMERA VERIFY");
  await sleep(800);
  const camSheet = await evalJs(`!!document.querySelector(".verify-sheet[role='dialog']")`);
  const camErr = await evalJs(`document.querySelector(".verify-error-title")?.textContent ?? ""`);
  ok("J1", `camera sheet opens + friendly card ("${camErr}")`, camSheet && /camera|webgl|permission/i.test(camErr));
  await evalJs(`[...document.querySelectorAll(".verify-sheet button")].find(b => b.textContent.trim() === "CLOSE")?.click()`);
  await sleep(400);
  ok("J1", "camera sheet closed — back on match", await evalJs(`!document.querySelector(".verify-sheet") && location.hash.startsWith("#/match/")`));

  // HR strap → Web Bluetooth unsupported in headless → card → GOT IT
  await clickBtn("HR STRAP");
  await sleep(500);
  const hrUnsupported = await evalJs(`document.querySelector(".verify-error-title")?.textContent ?? ""`);
  ok("J1", `HR button → unsupported card ("${hrUnsupported}")`, /bluetooth/i.test(hrUnsupported));
  await clickBtn("GOT IT");
  await sleep(300);
  ok("J1", "HR sheet closed", await evalJs(`!document.querySelector(".verify-sheet")`));

  // close the match: +50 chip ×2 → 130 raw ≥ 100 target
  await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
  await clickBtn("LOG 50");
  await sleep(500);
  const closedNow = await evalJs(`location.hash.startsWith("#/result/")`);
  if (!closedNow) {
    await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
    await clickBtn("LOG 50");
    await sleep(700);
  }
  ok("J1", "match closed at target → result screen", await evalJs(`location.hash.startsWith("#/result/")`));

  // result: confetti, winner, MVP locks, pot picker, canvas
  ok("J1", "confetti burst rendered (20 particles)", await evalJs(`document.querySelectorAll(".confetti-p").length === 20`));
  const champ = await evalJs(`document.querySelector(".champname")?.textContent`);
  ok("J1", `champion crowned (${champ})`, !!champ);
  await evalJs(`[...document.querySelectorAll(".mvp-chip")][1]?.click()`);
  await sleep(500);
  ok("J1", "MVP vote locks (chips → locked card)", await evalJs(`!!document.querySelector(".mvp-locked") && document.querySelectorAll(".mvp-chip").length === 0`));
  await evalJs(`document.querySelector(".charitycard")?.click()`);
  await sleep(200);
  const desig = await clickBtn("DESIGNATE POT");
  await sleep(500);
  ok("J1", "pot picker → designated", desig && await evalJs(`!!document.querySelector(".potdone")`));
  const canvasOk = await evalJs(`(() => {
    const c = document.querySelector("canvas.result-canvas"); if (!c) return false;
    if (c.width !== 1200 || c.height !== 675) return false;
    const d = c.getContext("2d").getImageData(0, 0, 1200, 675).data;
    let n = 0; for (let i = 3; i < d.length; i += 400) if (d[i] > 0) n++;
    return n > 500; // populated, not blank
  })()`);
  ok("J1", "result card canvas populated (1200×675, non-blank)", canvasOk);

  // season tab: create → ladder
  await evalJs(`location.hash = "#/season"`);
  await sleep(400);
  if (await evalJs(`!!document.querySelector(".season-pitch")`)) {
    await evalJs(`(() => { const i = document.querySelector(".season-pitch input"); i.value = "Journey Season"; })()`);
    await clickBtn("START SEASON");
    await sleep(500);
  }
  ok("J1", "season created → live header", await evalJs(`!!document.querySelector(".season-head")`));
  ok("J1", "ladder card present (rows or friendly empty)", await evalJs(`!!document.querySelector(".ladderlist, .emptystate")`));

  // profile stats + history
  await evalJs(`location.hash = "#/profile"`);
  await sleep(400);
  ok("J1", "profile stats rendered", await evalJs(`!!document.querySelector(".statgrid, .stats") || document.body.textContent.includes("Lifetime")`));
  ok("J1", "profile history lists the match", await evalJs(`document.body.textContent.includes("100") && !document.querySelector(".empty")`));

  // ═══ J2 — OFFLINE SYNC (queue → flush) ═══════════════════════════════════
  console.log("\nJ2 — offline sync");
  phase = "J2";

  // new match while API is up; wait for its create op to flush
  await evalJs(`location.hash = "#/new"`);
  await sleep(400);
  await evalJs(`[...document.querySelectorAll(".seg-btn")].find(b => b.textContent.trim() === "100").click()`);
  await clickBtn("CREATE MATCH");
  await sleep(500);
  await clickBtn("GO TO MATCH");
  await sleep(500);
  await waitFor(`document.getElementById("syncchip")?.className.includes("syncchip--synced")`, 8000);
  note("match #2 created + mirrored while API up");

  // kill the API, then log → chip OFFLINE + queued (a sim tick may add +1)
  killApi();
  await sleep(600);
  await clickBtn("LOG 10");
  await sleep(1200);
  const chipOffline = await evalJs(`document.getElementById("syncchip")?.textContent ?? ""`);
  ok("J2", `chip OFFLINE + queued after log ("${chipOffline.trim()}")`, /OFFLINE/i.test(chipOffline) && /QUEUED \d/.test(chipOffline));

  // restart the API → retry tick (≤15s) flushes → SYNCED
  startApi();
  let up = false;
  for (let i = 0; i < 20 && !up; i++) { await sleep(500); up = await apiUp(); }
  ok("J2", "API restarted", up);
  const flushed = await waitFor(
    `(document.getElementById("syncchip")?.textContent ?? "").includes("SYNCED")`,
    25000, 1000
  );
  ok("J2", "retry tick flushed the outbox → chip SYNCED", flushed);
  note("offline entry flushed without user action (15s retry tick)");

  // entry visible via GET on 4174
  const crewAfter = await (await fetch(`${API}/crews/${adoptedCode}`)).json();
  const remoteMatchIds: string[] = (crewAfter?.matches ?? []).map((m: any) => m.id);
  let remoteEntries = 0;
  for (const id of remoteMatchIds) {
    const fm = await (await fetch(`${API}/matches/${id}`)).json();
    remoteEntries += fm?.match?.entries?.length ?? 0;
  }
  ok("J2", `queued entry visible via GET :4174 (${remoteEntries} remote entries across ${remoteMatchIds.length} matches)`, remoteEntries >= 4);

  // ═══ J4 — PERSISTENCE (reload mid-match) ═════════════════════════════════
  console.log("\nJ4 — persistence (reload mid-match)");
  phase = "J4";

  const urlBefore = await evalJs(`location.href`);
  const hashBefore = await evalJs(`location.hash`);
  await nav(urlBefore); // full reload, SAME url incl. hash
  await sleep(900);
  ok("J4", "reload lands back on the live match", await evalJs(`location.hash === ${JSON.stringify(hashBefore)} && location.hash.startsWith("#/match/")`));
  ok("J4", "match still live with my 10 raw", await evalJs(`[...document.querySelectorAll(".strow")].some(r => r.textContent.includes("Journeys") && r.textContent.includes("10 raw"))`));
  const chipAfterReload = await evalJs(`document.getElementById("syncchip")?.className ?? ""`);
  ok("J4", "sync chip still SYNCED after reload", chipAfterReload.includes("syncchip--synced"));

  // close match #2 so the app is tidy for J3
  await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
  await clickBtn("LOG 50");
  await sleep(500);
  if (!(await evalJs(`location.hash.startsWith("#/result/")`))) {
    await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
    await clickBtn("LOG 50");
    await sleep(700);
  }
  ok("J4", "match #2 closed → result", await evalJs(`location.hash.startsWith("#/result/")`));

  // match #2 closed while the season is live → it scores into the ladder
  // (match #2 has no demo crew → the record holds just me → 1 row)
  await evalJs(`location.hash = "#/season"`);
  await sleep(400);
  ok("J4", "ladder scored match #2 (rows rendered)", await evalJs(`document.querySelectorAll(".ladderrow").length >= 1`));

  // ═══ J3 — CONVERGENCE (fresh device joins by adopted code) ═══════════════
  console.log("\nJ3 — convergence (second device)");
  phase = "J3";

  await evalJs(`localStorage.clear()`);
  await nav(APP);
  await sleep(600);
  ok("J3", "fresh storage → onboard again", await evalJs(`!!document.querySelector(".screen--onboard")`));
  await evalJs(`(() => { const i = document.querySelector(".screen--onboard input"); i.value = "Second Phone"; i.dispatchEvent(new Event("input", {bubbles:true})); })()`);
  await evalJs(`document.querySelector(".tiercard--fit").click()`);
  await evalJs(`document.querySelector(".screen--onboard .rwf-btn--primary").click()`);
  await sleep(400);
  // join by the ADOPTED code
  await evalJs(`(() => { const i = document.querySelector(".input--mono"); i.value = ${JSON.stringify(adoptedCode)}; })()`);
  await clickBtn("JOIN CREW");
  await sleep(500);
  ok("J3", "joined by adopted code → home (empty)", await evalJs(`location.hash === "#/" && document.body.textContent.includes("No matches yet")`));

  // arm sync on this device too (probe finds the twin, code kept)
  await evalJs(`location.hash = "#/crew"`);
  await sleep(400);
  await clickBtn("SYNC THIS CREW");
  const j3synced = await waitFor(`document.getElementById("syncchip")?.className.includes("syncchip--synced")`, 8000);
  ok("J3", "second device armed + SYNCED (twin found, code kept)", j3synced);
  const j3code = await evalJs(`JSON.parse(localStorage.getItem("rwf.state.v1")).crew.code`);
  ok("J3", `crew code unchanged (${j3code})`, j3code === adoptedCode);

  // pull → match + entries restored (check on the HOME screen)
  await clickBtn("PULL UPDATES");
  await sleep(1500);
  await evalJs(`location.hash = "#/"`);
  await sleep(500);
  const pulled = await waitFor(`document.querySelectorAll(".matchcard, .mcard").length > 0 || !document.body.textContent.includes("No matches yet")`, 6000);
  ok("J3", "pull restores the matches (home no longer empty)", pulled);
  const j3state = await evalJs(`JSON.parse(localStorage.getItem("rwf.state.v1"))`);
  const totalEntries = (j3state?.matches ?? []).reduce((n: number, m: any) => n + (m?.entries?.length ?? 0), 0);
  ok("J3", `entries restored (${(j3state?.matches ?? []).length} matches, ${totalEntries} entries)`, (j3state?.matches ?? []).length >= 2 && totalEntries >= 4);

  // ═══ J5 — EDGE / EMPTY STATES / RESET ════════════════════════════════════
  console.log("\nJ5 — edge: empty states, reset, demo crew");
  phase = "J5";

  // reset all (double-tap confirm)
  await evalJs(`location.hash = "#/profile"`);
  await sleep(400);
  await clickBtn("RESET APP DATA");
  await sleep(200);
  await clickBtn("TAP AGAIN TO CONFIRM");
  await sleep(1200);
  ok("J5", "reset all → back to onboard", await evalJs(`!!document.querySelector(".screen--onboard")`));
  ok("J5", "reset wiped sync arming too (chip LOCAL ONLY)", await evalJs(`(document.getElementById("syncchip")?.textContent ?? "").includes("LOCAL ONLY")`));

  // empty: no crew → crew screen is the guard
  await evalJs(`(() => { const i = document.querySelector(".screen--onboard input"); i.value = "Edge Case"; i.dispatchEvent(new Event("input", {bubbles:true})); })()`);
  await evalJs(`document.querySelector(".tiercard--couch").click()`);
  await evalJs(`document.querySelector(".screen--onboard .rwf-btn--primary").click()`);
  await sleep(400);
  ok("J5", "no crew → friendly start-a-crew screen", await evalJs(`document.body.textContent.includes("Start a crew")`));

  // empty: crew but no match / no season
  await evalJs(`(() => { const i = document.querySelector(".input"); i.value = "Edge Crew"; })()`);
  await clickBtn("CREATE & GET CODE");
  await sleep(400);
  ok("J5", "home empty state friendly (No matches yet)", await evalJs(`document.body.textContent.includes("No matches yet")`));
  await evalJs(`location.hash = "#/season"`);
  await sleep(400);
  ok("J5", "season empty state friendly (pitch card)", await evalJs(`!!document.querySelector(".season-pitch")`));
  await evalJs(`location.hash = "#/profile"`);
  await sleep(400);
  ok("J5", "profile empty history friendly", await evalJs(`document.body.textContent.includes("No matches yet")`));

  // demo crew button works from a fresh match
  await evalJs(`location.hash = "#/new"`);
  await sleep(400);
  await clickBtn("CREATE MATCH");
  await sleep(500);
  await clickBtn("ADD DEMO CREW");
  await sleep(400);
  ok("J5", "demo crew button works (✓ + pot grows)", await evalJs(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("DEMO CREW ADDED ✓"))`));

  // ── console error audit ───────────────────────────────────────────────────
  console.log("\n── console error audit ──");
  const expected = (e: { phase: string; text: string }) =>
    // J2: the API is deliberately dead — connection-refused fetches are the
    // product working as designed (offline-first queue).
    (e.phase === "J2" && /net::ERR|Failed to fetch|fetch|CONNECTION|offline|502/i.test(e.text)) ||
    // J1/J3: ensureCrewRemote PROBES GET /crews/<localCode> before creating the
    // twin — a 404 is the expected "no twin yet" answer, and Chromium logs
    // every non-2xx fetch as a console error. Unavoidable without an API change.
    (/404.*\/crews\/|\/crews\/.*404/.test(e.text) && (e.phase === "J1" || e.phase === "J3"));
  const unexpected = consoleErrors.filter((e) => !expected(e));
  for (const e of consoleErrors) {
    console.log(`  [${e.phase}] ${expected(e) ? "expected (probe/offline by design)" : "UNEXPECTED"} ${e.text.slice(0, 160)}`);
  }
  ok("AUDIT", `zero unexpected console errors (${consoleErrors.length} captured, ${consoleErrors.length - unexpected.length} expected)`, unexpected.length === 0);

  console.log(`\nJourneys: ${pass} passed, ${fail} failed.`);
  if (failures.length) { console.log("Failures:"); for (const f of failures) console.log(`  - ${f}`); }
} finally {
  chrome.kill("SIGTERM");
}

process.on("exit", () => { try { chrome.kill("SIGTERM"); } catch { /* gone */ } });

setTimeout(() => {
  console.log("\n⏱ driver timed out");
  process.exit(2);
}, 420000).unref?.();

if (fail > 0) setTimeout(() => process.exit(1), 100);
