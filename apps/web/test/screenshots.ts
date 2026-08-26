// Screenshot walker — drives the real UI through every screen and captures
// PNGs to apps/web/screenshots/ so the visual polish pass can be eyeballed.
// Run: bun serve.ts & ; bun apps/web/test/screenshots.ts
import { spawn } from "node:child_process";

const APP = "http://localhost:4173/app";
const DEBUG_PORT = 9334;
const OUT = new URL("../../screenshots/", import.meta.url).pathname;

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
await clickBtn("NEW MATCH");
await sleep(400);
await shot("polish4_newmatch");
await clickBtn("CREATE MATCH");
await sleep(500);
await shot("polish5_link");
await clickBtn("ADD DEMO CREW");
await sleep(300);
await clickBtn("GO TO MATCH");
await sleep(600);

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
await shot("polish7_result");

// 7 — season (ladder scored) then end → belt
await evalJs(`location.hash = "#/season"`);
await sleep(500);
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
