// Scratch debug tool (lane 7): computed-style / geometry sanity for the verifier UI.
// Not part of the test gate. Run: (bun serve.ts &) ; bun apps/web/test/debug-css.ts
// Computed-style sanity for the verifier UI (no image input needed).
import { spawn } from "node:child_process";
const DEBUG_PORT = 9490;
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=/tmp/rwf-css-${Date.now()}`, "about:blank",
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
await send("Page.navigate", { url: "http://localhost:4173/app" });
await sleep(1400);
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
await sleep(500);

const style = await evalJs(`(() => {
  const r = {};
  const cs = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e) : null; };
  const box = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().toJSON() : null; };
  // verify row on the match screen
  const vr = cs(".verifyrow");
  r.verifyrow = vr ? { display: vr.display, cols: vr.gridTemplateColumns } : null;
  const camBtn = [...document.querySelectorAll(".verifyrow-btn")][0];
  r.camBtnColor = camBtn ? getComputedStyle(camBtn).color : null;
  // open camera sheet
  [...document.querySelectorAll("button")].find(b => b.textContent.includes("CAMERA VERIFY")).click();
  return new Promise((res) => setTimeout(() => {
    const sheet = cs(".verify-sheet");
    const ov = cs(".verify-overlay");
    const count = cs(".verify-count");
    const priv = cs(".verify-privacy");
    r.sheet = sheet ? { bg: sheet.backgroundColor, radius: sheet.borderRadius, pos: sheet.position, w: box(".verify-sheet").width, bottom: box(".verify-sheet").bottom, vh: innerHeight } : null;
    r.overlay = ov ? { pos: ov.position, z: ov.zIndex, bg: ov.backdropFilter || ov.backgroundColor } : null;
    r.count = count ? { size: count.fontSize, color: count.color, family: count.fontFamily.slice(0, 30) } : null;
    r.privacy = priv ? { size: priv.fontSize, color: priv.color } : null;
    r.stage = box(".verify-stage");
    // close, open HR sheet
    document.querySelector(".verify-head .iconbtn").click();
    setTimeout(() => {
      [...document.querySelectorAll("button")].find(b => b.textContent.includes("HR STRAP")).click();
      setTimeout(() => {
        const hr = cs(".verify-sheet--slim") || cs(".verify-sheet");
        const inputs = [...document.querySelectorAll(".hr-input")];
        r.hrSheet = hr ? { w: box(".verify-sheet").width } : null;
        r.hrInputs = inputs.length;
        r.hrBody = (document.querySelector(".verify-sheet")?.textContent || "").slice(0, 80);
        res(r);
      }, 400);
    }, 300);
  }, 600));
})()`);
console.log(JSON.stringify(style, null, 1));
chrome.kill();
process.exit(0);
