// Screenshots of the lane-7 verifier UI (fake camera + synthetic poses).
// Run: bun apps/web/test/verify-shots.ts
import { spawn } from "node:child_process";
const DEBUG_PORT = 9480;
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--window-size=390,844",
  "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=/tmp/rwf-shots-${Date.now()}`, "about:blank",
], { stdio: "ignore" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function getPageWs(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const list = (await r.json()) as { type: string; webSocketDebuggerUrl?: string }[];
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl!;
    } catch { }
    await sleep(250);
  }
  throw new Error("no CDP");
}
const ws = new WebSocket(await getPageWs());
await new Promise((r) => ws.addEventListener("open", r));
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id)!; pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
});
const send = (method: string, params: any = {}): Promise<any> => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const evalJs = async (expr: string): Promise<any> =>
  (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:4173/app" });
await sleep(1400);

// onboard → crew → match
await evalJs(`(() => { const i = document.querySelector(".input--xl"); i.value="Alexei"; i.dispatchEvent(new Event("input",{bubbles:true})); })()`);
await evalJs(`document.querySelector(".tiercard--casual").click()`);
await evalJs(`document.querySelector("button.rwf-btn--primary").click()`);
await sleep(300);
await evalJs(`(() => { const i = document.querySelector(".screen .input"); i.value="Thursday Legends"; i.dispatchEvent(new Event("input",{bubbles:true})); })()`);
await evalJs(`document.querySelector(".screen button.rwf-btn--primary").click()`);
await sleep(300);
await evalJs(`location.hash = "#/new"`);
await sleep(300);
await evalJs(`document.querySelector(".screen button.rwf-btn--primary").click()`);
await sleep(400);
const mid = /#\/link\/(.+)/.exec(await evalJs("location.hash"))![1];
await evalJs(`location.hash = "#/match/${mid}"`);
await sleep(500);

const shot = async (name: string): Promise<void> => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  await Bun.write(`apps/web/screenshots/${name}`, Buffer.from(r.data, "base64"));
  console.log("saved", name);
};

await shot("verify0_match_logpanel.png");

// camera sheet (fake camera, real model)
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("CAMERA VERIFY")).click()`);
await sleep(400);
await shot("verify1_camera_sheet_loading.png");
let enabled = false;
for (let i = 0; i < 60 && !enabled; i++) {
  await sleep(500);
  enabled = await evalJs(`!document.querySelector(".verify-start")?.disabled`);
}
await evalJs(`document.querySelector("[data-ex='squat']")?.click()`);
await evalJs(`document.querySelector(".verify-skel")?.click()`);
await shot("verify2_camera_ready.png");
await evalJs(`document.querySelector(".verify-start").click()`);
await sleep(2500);
await shot("verify3_camera_counting.png");
await evalJs(`document.querySelector(".verify-start").click()`);
await sleep(400);
await shot("verify4_camera_summary.png");
await evalJs(`[...document.querySelectorAll(".verify-sheet .verify-btnrow button")].find(b => b.textContent === "DISCARD")?.click()`);
await sleep(300);

// HR sheet
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("HR STRAP")).click()`);
await sleep(500);
await shot("verify5_hr_sheet.png");

chrome.kill();
process.exit(0);
