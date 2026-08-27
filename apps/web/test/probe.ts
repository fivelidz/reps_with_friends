// Ad-hoc CDP probe: `bun apps/web/test/probe.ts <path> '<js expression>'`
// Evaluates an expression in the page after load and prints the JSON result.
import { spawn } from "node:child_process";

const path = process.argv[2] ?? "/";
const expr = process.argv[3] ?? "1";
const wait = Number(process.argv[4] ?? 1800);
const width = Number(process.argv[5] ?? 390);
const DEBUG_PORT = 9355;

const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--window-size=${width},844`, `--remote-debugging-port=${DEBUG_PORT}`,
  "--user-data-dir=/tmp/rwf-probe-profile", "about:blank",
], { stdio: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function getPageWs(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const list = (await r.json()) as any[];
      const p = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("no CDP");
}
const ws = new WebSocket(await getPageWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map<number, any>();
ws.onmessage = (ev: MessageEvent) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
};
const send = (method: string, params: any = {}) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width < 700 });
await send("Page.navigate", { url: "http://localhost:4173" + path });
await sleep(wait);
const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? r.result, null, 2));
ws.close(); chrome.kill();
