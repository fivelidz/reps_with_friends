// Lane 7 E2E — headless Chromium CDP checks for the verifier UI.
// Run: bun apps/web/test/verify-check.ts   (spawns `bun serve.ts` itself)
//
// Scenario A (no camera): app boots clean → camera sheet opens → permission/
//   no-device error card renders → close → HR sheet opens → unsupported/cancel
//   path renders → close. Zero console errors; zero CDN hits before open.
// Scenario B (fake camera): camera granted → model loads from CDN → START
//   enabled → run → STOP → summary renders. CDN hits only after open.
import { spawn } from "node:child_process";

const APP = "http://localhost:4173/app";
const DEBUG_PORT = 9410 + (Date.now() % 400);

// ── serve the app ────────────────────────────────────────────────────────────
const server = spawn("bun", ["serve.ts"], { stdio: "ignore", cwd: process.cwd() });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitPort(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://localhost:4173/app/");
      if (r.ok) return;
    } catch { /* retry */ }
    await sleep(300);
  }
  throw new Error("serve.ts never came up on :4173");
}
await waitPort();

let step = 0;
function ok(label: string, cond: boolean): void {
  step++;
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${step}. ${label}`);
  if (!cond) process.exitCode = 1;
}

interface Cdp {
  eval: (expr: string) => Promise<any>;
  click: (selector: string) => Promise<boolean>;
  close: () => void;
  cdns: () => string[];
  errors: () => string[];
}

async function launch(extraFlags: string[]): Promise<Cdp> {
  const port = DEBUG_PORT + Math.floor(Math.random() * 50);
  const chrome = spawn("/usr/bin/chromium", [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--window-size=390,844",
    ...extraFlags,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/rwf-verify-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    "about:blank",
  ], { stdio: "ignore" });

  let wsUrl = "";
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = (await r.json()) as { type: string; webSocketDebuggerUrl?: string }[];
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) { wsUrl = page.webSocketDebuggerUrl!; break; }
    } catch { /* retry */ }
    await sleep(250);
  }
  if (!wsUrl) throw new Error("chromium CDP never came up");

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let msgId = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)!; pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    } else if (m.method === "Network.requestWillBeSent") {
      const url: string = m.params?.request?.url ?? "";
      if (url.includes("jsdelivr")) cdnHits.push(url);
    } else if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
      consoleErrors.push((m.params.args ?? []).map((a: any) => a.value ?? a.description ?? "").join(" "));
    } else if (m.method === "Runtime.exceptionThrown") {
      consoleErrors.push(m.params?.exceptionDetails?.text ?? "exception");
    }
  });
  const cdnHits: string[] = [];
  const consoleErrors: string[] = [];
  const send = (method: string, params: any = {}): Promise<any> => {
    const id = ++msgId;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
  await send("Runtime.enable");
  await send("Network.enable");
  const evalJs = async (expr: string): Promise<any> =>
    (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

  await send("Page.navigate", { url: APP });
  await sleep(1200); // boot + fonts

  const click = async (selector: string): Promise<boolean> =>
    evalJs(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return false; b.click(); return true; })()`);

  return {
    eval: evalJs,
    click,
    close: () => { try { ws.close(); } catch {} chrome.kill(); },
    cdns: () => cdnHits.slice(),
    errors: () => consoleErrors.slice(),
  };
}

/** Drive onboard → crew → match; returns the match hash. */
async function driveToMatch(cdp: Cdp): Promise<string> {
  await cdp.eval(`(() => {
    const inp = document.querySelector(".input--xl");
    inp.value = "Tester";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await cdp.click(".tiercard--casual");
  await cdp.click("button.rwf-btn--primary"); // START MOVING → #/crew
  await sleep(350);
  await cdp.eval(`(() => {
    const inp = document.querySelector(".screen .input");
    inp.value = "Test Crew";
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await cdp.click(".screen button.rwf-btn--primary"); // CREATE CREW
  await sleep(350);
  location: await cdp.eval("location.hash = '#/new'");
  await sleep(350);
  await cdp.click(".screen button.rwf-btn--primary"); // CREATE MATCH → #/link/:id
  await sleep(400);
  const hash: string = await cdp.eval("location.hash");
  const m = /#\/link\/(.+)/.exec(hash ?? "");
  if (!m) throw new Error("no match id after create: " + hash);
  await cdp.eval(`location.hash = "#/match/${m[1]}"`);
  await sleep(500);
  return m[1];
}

// ═════════════════════════════════════════════════════════════════════════════
// Scenario A — no camera: graceful paths, lazy CDN, zero console errors
// ═════════════════════════════════════════════════════════════════════════════
console.log("— Scenario A: no camera (graceful paths) —");
{
  const cdp = await launch([]);
  try {
    ok("A: app booted to onboard screen", await cdp.eval(`!!document.querySelector(".screen--onboard")`));
    ok("A: zero console errors on boot", cdp.errors().length === 0);
    ok("A: zero CDN requests on boot (lazy-load contract)", cdp.cdns().length === 0);

    await driveToMatch(cdp);
    ok("A: match screen rendered", await cdp.eval(`!!document.querySelector(".logpanel")`));
    ok("A: CAMERA VERIFY button present", await cdp.eval(
      `[...document.querySelectorAll("button")].some(b => b.textContent.includes("CAMERA VERIFY"))`));
    ok("A: HR STRAP button present", await cdp.eval(
      `[...document.querySelectorAll("button")].some(b => b.textContent.includes("HR STRAP"))`));
    ok("A: still zero CDN requests before verifier opened", cdp.cdns().length === 0);

    // Open camera verifier — headless has no camera → friendly error card.
    await cdp.eval(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("CAMERA VERIFY")).click()`);
    await sleep(600);
    ok("A: verifier sheet opened", await cdp.eval(`!!document.querySelector(".verify-sheet")`));
    ok("A: privacy line present", await cdp.eval(
      `document.querySelector(".verify-privacy")?.textContent.includes("Nothing is uploaded")`));
    // wait for getUserMedia rejection → error card
    let errCard = false;
    for (let i = 0; i < 20 && !errCard; i++) {
      await sleep(300);
      errCard = await cdp.eval(`!!document.querySelector(".verify-error")`);
    }
    ok("A: camera-unavailable friendly card rendered", errCard);
    ok("A: error card offers retry", await cdp.eval(
      `[...document.querySelectorAll(".verify-error button")].some(b => b.textContent.includes("TRY AGAIN"))`));
    ok("A: no crash — app still on match screen", await cdp.eval(`!!document.querySelector(".logpanel")`));

    // Close the sheet.
    await cdp.click(".verify-head .iconbtn");
    await sleep(300);
    ok("A: verifier sheet closed cleanly", await cdp.eval(`!document.querySelector(".verify-sheet")`));

    // HR sheet — headless Linux chromium has no Web Bluetooth → unsupported card.
    await cdp.eval(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("HR STRAP")).click()`);
    await sleep(500);
    ok("A: HR sheet opened", await cdp.eval(`!!document.querySelector(".verify-sheet--slim, .verify-sheet")`));
    const hrBody: string = await cdp.eval(`document.querySelector(".verify-sheet")?.textContent ?? ""`);
    ok(
      "A: HR sheet shows unsupported card OR connect form (no crash)",
      hrBody.includes("Web Bluetooth unavailable") || hrBody.includes("CONNECT STRAP")
    );
    await cdp.click(".verify-head .iconbtn");
    await sleep(300);
    ok("A: HR sheet closed cleanly", await cdp.eval(`!document.querySelector(".verify-sheet")`));

    const errsA = cdp.errors();
    ok(`A: zero console errors across whole scenario (${errsA.length ? JSON.stringify(errsA) : "clean"})`, errsA.length === 0);
  } finally {
    cdp.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Scenario B — fake camera: full load → count loop → stop → summary
// ═════════════════════════════════════════════════════════════════════════════
console.log("— Scenario B: fake camera (full pipeline) —");
{
  const cdp = await launch(["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]);
  try {
    await driveToMatch(cdp);
    ok("B: zero CDN requests before verifier opened", cdp.cdns().length === 0);

    await cdp.eval(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("CAMERA VERIFY")).click()`);
    await sleep(500);
    ok("B: verifier sheet opened", await cdp.eval(`!!document.querySelector(".verify-sheet")`));
    ok("B: video element has a live track", await cdp.eval(
      `!!(document.querySelector(".verify-video")?.srcObject?.getVideoTracks().length)`));

    // Model loads from CDN (tf + pose-detection + weights).
    let startEnabled = false;
    for (let i = 0; i < 60 && !startEnabled; i++) {
      await sleep(500);
      startEnabled = await cdp.eval(`!document.querySelector(".verify-start")?.disabled`);
    }
    ok("B: START enabled after camera + model ready", startEnabled);
    const cdns = cdp.cdns();
    ok(`B: CDN loaded only after open (${cdns.length} jsdelivr hits: ${[...new Set(cdns.map(u => u.split("/npm/")[1]?.split("/")[0] ?? u))].join(", ")})`,
      cdns.length > 0 && cdns.every((u) => u.includes("jsdelivr")));

    // Exercise selector + skeleton toggle don't crash.
    await cdp.eval(`document.querySelector("[data-ex='pushup']")?.click()`);
    await sleep(200);
    ok("B: exercise switch works (hint updates)", await cdp.eval(
      `document.querySelector(".verify-hint")?.textContent.includes("Side-on")`));

    // START → run ~3s with skeleton on → STOP → summary.
    await cdp.click(".verify-start");
    await sleep(400);
    await cdp.eval(`document.querySelector(".verify-skel")?.click()`);
    await sleep(2600);
    const counting = await cdp.eval(`document.querySelector(".verify-start")?.textContent`);
    ok("B: counting ran (STOP visible)", counting === "STOP");
    await cdp.click(".verify-start"); // STOP
    await sleep(400);
    const summary: string = await cdp.eval(`document.querySelector(".verify-summary")?.textContent ?? ""`);
    ok(`B: summary rendered after stop ("${summary.trim()}")`, summary.includes("fps"));
    ok("B: zero-rep run disables LOG (green test frame has no person)", await cdp.eval(
      `document.querySelector(".verify-logbtn")?.disabled === true`));

    // Discard → sheet closes, no crash.
    await cdp.eval(`[...document.querySelectorAll(".verify-summary ~ .verify-btnrow button, .verify-sheet .verify-btnrow button")].find(b => b.textContent === "DISCARD")?.click()`);
    await sleep(300);
    ok("B: discard closed the sheet", await cdp.eval(`!document.querySelector(".verify-sheet")`));

    const errsB = cdp.errors();
    ok(`B: zero console errors across whole scenario (${errsB.length ? JSON.stringify(errsB) : "clean"})`, errsB.length === 0);
  } finally {
    cdp.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Scenario C — synthetic poses: count reps → LOG VERIFIED → state carries
// verified:true (wraps createDetector AFTER the CDN script lands, before the
// sheet's model init finishes)
// ═════════════════════════════════════════════════════════════════════════════
console.log("— Scenario C: synthetic squat poses → verified log —");
{
  const cdp = await launch(["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]);
  try {
    const matchId = await driveToMatch(cdp);

    // Intercept window.poseDetection with a Proxy returned from a property
    // getter: wraps createDetector at READ time, immune to the UMD factory's
    // late property population (a plain wrap gets overwritten by the factory).
    await cdp.eval(`(() => {
      window.__fakeCalls = 0;
      const fakeEst = async () => {
        window.__fakeCalls++;
        // 2s cycle: 1.2s standing (knees ~180°), 0.8s bottom (~91°).
        const bottom = (Date.now() % 2000) >= 1200;
        const hip = bottom ? [190, 220] : [200, 100];
        const knee = bottom ? [260, 250] : [200, 250];
        const ankle = [200, 400];
        const pts = [];
        for (const s of ["left_", "right_"]) {
          pts.push({ name: s + "hip", x: hip[0], y: hip[1], score: 0.9 });
          pts.push({ name: s + "knee", x: knee[0], y: knee[1], score: 0.9 });
          pts.push({ name: s + "ankle", x: ankle[0], y: ankle[1], score: 0.9 });
        }
        return [{ keypoints: pts, score: 0.9 }];
      };
      let val;
      Object.defineProperty(window, "poseDetection", {
        configurable: true,
        get() {
          if (!val) return val;
          return new Proxy(val, {
            get(t, prop) {
              if (prop === "createDetector") {
                const fn = t.createDetector;
                return async (...a) => {
                  const det = await fn.apply(t, a);
                  det.estimatePoses = fakeEst;
                  return det;
                };
              }
              return t[prop];
            },
          });
        },
        set(v) { val = v; },
      });
    })()`);

    await cdp.eval(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("CAMERA VERIFY")).click()`);
    await sleep(400);
    // Select SQUATS (synthetic poses are knee joints).
    await cdp.eval(`document.querySelector("[data-ex='squat']")?.click()`);

    let startEnabled = false;
    for (let i = 0; i < 60 && !startEnabled; i++) {
      await sleep(500);
      startEnabled = await cdp.eval(`!document.querySelector(".verify-start")?.disabled`);
    }
    ok("C: START enabled (camera + wrapped model ready)", startEnabled);

    await cdp.click(".verify-start");
    await sleep(5200); // ~2.5 synthetic squat cycles
    await cdp.click(".verify-start"); // STOP
    await sleep(400);

    const count: string = await cdp.eval(`document.querySelector(".verify-count")?.textContent`);
    const reps = parseInt(count ?? "0", 10);
    ok(`C: synthetic squats counted (${reps} reps in ~5s of 2s-cycle motion)`, reps >= 2 && reps <= 4);

    const logBtnDisabled = await cdp.eval(`document.querySelector(".verify-logbtn")?.disabled`);
    ok("C: LOG VERIFIED enabled after counted reps", logBtnDisabled === false);

    const entriesBefore: number = await cdp.eval(`JSON.parse(localStorage.getItem("rwf.state.v1")).matches.find(m => m.config.id === "${matchId}").entries.length`);
    await cdp.click(".verify-logbtn");
    await sleep(500);

    const entry = await cdp.eval(`(() => {
      const s = JSON.parse(localStorage.getItem("rwf.state.v1"));
      const m = s.matches.find(x => x.config.id === "${matchId}");
      return m.entries[m.entries.length - 1];
    })()`);
    ok("C: entry logged from the sheet", await cdp.eval(
      `JSON.parse(localStorage.getItem("rwf.state.v1")).matches.find(m => m.config.id === "${matchId}").entries.length`) === entriesBefore + 1);
    ok(`C: entry carries verified:true (reps=${entry?.reps}, ex=${entry?.exerciseId})`, entry?.verified === true && entry?.reps === reps && entry?.exerciseId === "squat");
    ok("C: no avgHrrPct without a strap", entry?.avgHrrPct === undefined);
    ok("C: verified toast shown", await cdp.eval(
      `[...document.querySelectorAll(".toast")].some(t => t.textContent.includes("Camera verified"))`));
    ok("C: sheet closed after logging", await cdp.eval(`!document.querySelector(".verify-sheet")`));

    const errsC = cdp.errors();
    ok(`C: zero console errors (${errsC.length ? JSON.stringify(errsC) : "clean"})`, errsC.length === 0);
  } finally {
    cdp.close();
  }
}

server.kill();
console.log(`\nDone — ${step} E2E checks${process.exitCode ? " (FAILURES)" : " passed"}.`);
process.exit(process.exitCode ?? 0);
