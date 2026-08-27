// Screenshot walker — drives the real UI through every screen and captures
// PNGs to apps/web/screenshots/ so the visual polish pass can be eyeballed.
// Run: bun serve.ts & ; bun apps/web/test/screenshots.ts
import { spawn } from "node:child_process";

const APP = "http://localhost:4173/app";
const DEBUG_PORT = 9334;
// FIX 2026-08-27: this file lives in apps/web/test/, so "../../screenshots/"
// resolved to apps/screenshots/ — one level too high. Shots were landing beside
// the app instead of in apps/web/screenshots/, so anyone reviewing the latter
// was looking at stale images. One "../" is correct.
const OUT = new URL("../screenshots/", import.meta.url).pathname;

const chrome = spawn("/usr/bin/chromium", [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  "--window-size=390,844",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--user-data-dir=/tmp/rwf-shot-profile",
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
await new Promise((r) => ws.addEventListener("open", r));

let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id)!;
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
});
function send(method: string, params: any = {}): Promise<any> {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evalJs(expr: string): Promise<any> {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
}

async function shot(name: string): Promise<void> {
  await sleep(450); // let animations settle
  await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }).then((r) => {
    Bun.write(`${OUT}${name}.png`, Buffer.from(r.data, "base64"));
    console.log(`📸 ${name}.png`);
  });
}

const clickBtn = (match: string) =>
  evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes(${JSON.stringify(match)}))?.click() ?? false`);

await send("Page.enable");
await send("Runtime.enable");
// True phone viewport — --window-size includes browser chrome, so shots were
// coming out 500px wide instead of the 390px target device width.
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: APP });
await sleep(1200);
// FIX 2026-08-27: the profile dir persists between runs, so each walk inherited
// the LAST walk's state — the "season live" shot was actually showing a season
// already ENDED by the previous run. Start every walk from a clean slate.
await evalJs(`localStorage.clear()`);
await send("Page.navigate", { url: APP });
await sleep(1200);

// 1 — onboard (fill name + pick tier for the selected-state visual)
await evalJs(`(() => { const i = document.querySelector(".screen--onboard input"); i.value = "Alexei"; i.dispatchEvent(new Event("input", {bubbles:true})); })()`);
await evalJs(`document.querySelector(".tiercard--couch").click()`);
await shot("polish1_onboard");
await clickBtn("START MOVING");

// 2 — crew
await evalJs(`(() => { const i = document.querySelector(".input"); i.value = "Thursday Legends"; })()`);
await shot("polish2_crew");
await clickBtn("CREATE & GET CODE");

// 3 — season pitch
await evalJs(`location.hash = "#/season"`);
await sleep(500);
await shot("polish3_season_pitch");
await clickBtn("START SEASON");

// 4 — new match → link → demo crew → match
// FIX 2026-08-27: navigate by hash instead of clicking "NEW MATCH". Starting a
// season routes back to home, so the click-chain was firing on whatever screen
// happened to be mounted — every shot from here on captured the WRONG screen
// (polish6_match was actually the season screen). Explicit routing is stable.
await evalJs(`location.hash = "#/new"`);
await sleep(500);
await shot("polish4_newmatch");
// FIX 2026-08-27: pick the 100 target. The default is 300, but the walker only
// logs 125 reps — so the match never closed and "polish7_result" was actually
// another shot of the match screen. 100 is reachable with the sets logged below.
await evalJs(`[...document.querySelectorAll(".seg-btn")].find(b => b.textContent.trim() === "100")?.click()`);
await sleep(200);
await clickBtn("CREATE MATCH");
await sleep(500);
await shot("polish5_link");
await clickBtn("ADD DEMO CREW");
await sleep(400);
await clickBtn("GO TO MATCH");
await sleep(700);
// Guard: every shot below assumes the live match screen is mounted.
if (!(await evalJs(`location.hash.startsWith("#/match/")`))) {
  throw new Error(`expected the match screen, got ${await evalJs(`location.hash`)}`);
}

// 5 — match live: log sets so bars/medals/feed have content
await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
await clickBtn("LOG 50");
await sleep(1400); // let a demo-crew sim tick + bar animate
await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+25").click()`);
await clickBtn("LOG 25");
await sleep(1600);
await shot("polish6_match");

// 6 — close it → result (confetti mid-flight)
await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
await clickBtn("LOG 50");
await sleep(700);
if (!(await evalJs(`location.hash.startsWith("#/result/")`))) {
  throw new Error(`expected the result screen, got ${await evalJs(`location.hash`)}`);
}
await shot("polish7_result");

// 7 — season (ladder scored) then end → belt
await evalJs(`location.hash = "#/season"`);
await sleep(500);
if (!(await evalJs(`!!document.querySelector(".ladderrow")`))) {
  // The belt shot is only meaningful with a scored ladder behind it — the
  // completed match above should have put rows here.
  throw new Error("expected a scored ladder before ending the season");
}
await shot("polish8_season_live");
await clickBtn("END SEASON NOW");
await sleep(200);
await clickBtn("TAP AGAIN TO CONFIRM");
await sleep(500);
await shot("polish9_season_belt");

// 8 — profile
await evalJs(`location.hash = "#/profile"`);
await sleep(500);
await shot("polish10_profile");

console.log("done");
chrome.kill();
process.exit(0);
