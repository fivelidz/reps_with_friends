// Scratch debug tool (lane 7): drives the app to the match screen with a Proxy-wrapped
// poseDetection to inspect live counting internals. Not part of the test gate.
// Run: (bun serve.ts &) ; bun apps/web/test/debug-verify.ts
// Debug: is the createDetector wrapper installing and firing?
import { spawn } from "node:child_process";
const DEBUG_PORT = 9460;
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=/tmp/rwf-dbg-${Date.now()}`, "about:blank",
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
  } else if (m.method === "Runtime.consoleAPICalled") {
    console.log("[console." + m.params.type + "]", (m.params.args ?? []).map((a: any) => a.value ?? a.description).join(" "));
  }
});
const send = (method: string, params: any = {}): Promise<any> => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const evalJs = async (expr: string): Promise<any> =>
  (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
await send("Runtime.enable");
await send("Page.navigate", { url: "http://localhost:4173/app" });
await sleep(1200);

// onboard → crew → match (same as verify-check)
await evalJs(`(() => { const i = document.querySelector(".input--xl"); i.value="T"; i.dispatchEvent(new Event("input",{bubbles:true})); })()`);
await evalJs(`document.querySelector(".tiercard--casual").click()`);
await evalJs(`document.querySelector("button.rwf-btn--primary").click()`);
await sleep(300);
await evalJs(`(() => { const i = document.querySelector(".screen .input"); i.value="C"; i.dispatchEvent(new Event("input",{bubbles:true})); })()`);
await evalJs(`document.querySelector(".screen button.rwf-btn--primary").click()`);
await sleep(300);
await evalJs(`location.hash = "#/new"`);
await sleep(300);
await evalJs(`document.querySelector(".screen button.rwf-btn--primary").click()`);
await sleep(400);
const mid = /#\/link\/(.+)/.exec(await evalJs("location.hash"))![1];
await evalJs(`location.hash = "#/match/${mid}"`);
await sleep(400);

// Proxy-based wrapper: the getter returns a proxy that wraps createDetector
// at READ time — immune to the UMD factory's late property population.
await evalJs(`(() => {
  window.__wrapInstalled = false; window.__fakeCalls = 0; window.__createCalls = 0;
  const fakeEst = async () => {
    window.__fakeCalls++;
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
      window.__wrapInstalled = true;
      return new Proxy(val, {
        get(t, prop) {
          if (prop === "createDetector") {
            const fn = t.createDetector;
            return async (...a) => {
              window.__createCalls++;
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

await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("CAMERA VERIFY")).click()`);
await sleep(400);
await evalJs(`document.querySelector("[data-ex='squat']")?.click()`);
let enabled = false;
for (let i = 0; i < 40 && !enabled; i++) {
  await sleep(500);
  enabled = await evalJs(`!document.querySelector(".verify-start")?.disabled`);
}
console.log("startEnabled:", enabled, "| wrapInstalled:", await evalJs("window.__wrapInstalled"), "| createCalls:", await evalJs("window.__createCalls"), "| fakeCalls:", await evalJs("window.__fakeCalls"), "| wrapErr:", await evalJs("window.__wrapErr"));
await evalJs(`document.querySelector(".verify-start").click()`);
await sleep(5200);
console.log("after run — fakeCalls:", await evalJs("window.__fakeCalls"),
  "| count:", await evalJs(`document.querySelector(".verify-count")?.textContent`),
  "| status:", await evalJs(`document.querySelector(".verify-status")?.textContent`));
chrome.kill();
process.exit(0);
