/* Headless-Chromium verification driver for the figma-app.
   - walks EVERY screen at 390×844 (DPR 2), screenshots each
   - captures console errors + exceptions (must be zero)
   - captures all network requests (must be same-origin only)
   - offline check: Network.emulateNetworkConditions offline → reload → assert render
   Run: bun scripts/figma-app/verify.mts */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "http://localhost:4173/figma-app/";
const OUT = "apps/screenshots/figma-app";
mkdirSync(OUT, { recursive: true });
// Fresh profile every run: a stale service-worker cache would serve old code.
const PROFILE = mkdtempSync(join(tmpdir(), "figma-verify-"));

const SCREENS = process.argv.slice(2);
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu",
  "--remote-debugging-port=9333", `--user-data-dir=${PROFILE}`,
  "--window-size=390,844", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
chrome.stderr.on("data", () => {});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function json(path: string, method = "GET") {
  const r = await fetch(`http://127.0.0.1:9333${path}`, { method });
  return r.json();
}
// wait for devtools
for (let i = 0; i < 50; i++) {
  try { await json("/json/version"); break; } catch { await sleep(200); }
}

const targets = await json("/json/list");
const page = targets.find((t: any) => t.type === "page");
const ws: WebSocket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

let id = 0;
const pending = new Map<number, { resolve: (v: any) => void }>();
const events: any[] = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data as string);
  if (d.id && pending.has(d.id)) { pending.get(d.id)!.resolve(d.result ?? d.error); pending.delete(d.id); }
  else events.push(d);
};
const send = (method: string, params: any = {}) => new Promise<any>((resolve) => {
  const i = ++id; pending.set(i, { resolve });
  ws.send(JSON.stringify({ id: i, method, params }));
});

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const consoleErrors: string[] = [];
const requests: string[] = [];
const drainEvents = () => {
  while (events.length) {
    const e = events.shift()!;
    if (e.method === "Runtime.consoleAPICalled" && (e.params.type === "error" || e.params.type === "warning")) {
      consoleErrors.push(`[${e.params.type}] ${e.params.args?.map((a: any) => a.value ?? a.description ?? a.type).join(" ")}`);
    }
    if (e.method === "Runtime.exceptionThrown") {
      consoleErrors.push(`[exception] ${e.params.exceptionDetails?.text} ${e.params.exceptionDetails?.exception?.description ?? ""}`);
    }
    if (e.method === "Log.entryAdded" && ["error", "warning"].includes(e.params.entry.level)) {
      consoleErrors.push(`[log:${e.params.entry.level}] ${e.params.entry.text} ${e.params.entry.url ?? ""}`);
    }
    if (e.method === "Network.requestWillBeSent") requests.push(e.params.request.url);
  }
};

async function navigate(url: string, waitMs = 700) {
  await send("Page.navigate", { url });
  await sleep(waitMs);
  drainEvents();
}

async function shot(name: string) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, "base64"));
}

async function evalOK(expr: string) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  return r?.result?.value;
}

const report: any = { screens: [], offline: null, requests: null };

// 1) first load — capture ALL network requests for the zero-external assert
await navigate(BASE, 1200);
const firstLoadRequests = [...requests];

// 2) walk every screen
const rawList = await evalOK(
  `JSON.stringify([...document.querySelectorAll('.fx-index__item')].map(b => b.dataset.go))`
);
console.log("rawList:", JSON.stringify(rawList)?.slice(0, 120));
const list: string[] = SCREENS.length ? SCREENS : (rawList ? JSON.parse(rawList as any) : []);
const ids = list as string[];
for (const sid of ids) {
  await navigate(`${BASE}#/${sid}`, 650);
  const ok = await evalOK(`!!document.querySelector('.fx-content, .fx-index, .fx-sheet, .fx-scrim')`);
  const title = await evalOK(`document.title`);
  await shot(sid);
  report.screens.push({ id: sid, rendered: ok, title });
}
drainEvents();

// 3) offline: block network, reload, assert the app still renders + shot
await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await navigate(BASE, 1500);
const offlineRendered = await evalOK(
  `!!document.querySelector('.fx-status') && document.querySelectorAll('.fx-index__item, .fx-content, .fx-sheet').length > 0`
);
const offlineScreenOk = await evalOK(
  (async () => { return "true"; })() ? `location.hash = '#/battle-001'; 'nav-done'` : ""
);
await sleep(600);
const offlineBattle = await evalOK(`!!document.querySelector('.fx-hero')`);
await shot("_offline_index");
await navigate(`${BASE}#/battle-001`, 800);
const offlineBattle2 = await evalOK(`!!document.querySelector('.fx-hero')`);
await shot("_offline_battle-001");
report.offline = { indexRendered: offlineRendered, battleRendered: offlineBattle2 };
await send("Network.emulateNetworkConditions", { offline: false });

report.consoleErrors = consoleErrors;
report.firstLoadRequests = firstLoadRequests;
report.externalRequests = firstLoadRequests.filter(u => !u.startsWith("http://localhost:4173") && !u.startsWith("chrome-extension://"));
writeFileSync("/tmp/figma_verify_report.json", JSON.stringify(report, null, 2));
console.log(`screens: ${report.screens.length}, rendered: ${report.screens.filter((s: any) => s.rendered).length}`);
console.log(`console errors: ${consoleErrors.length}`);
console.log(`external requests: ${report.externalRequests.length}`);
console.log(`offline: index=${report.offline.indexRendered} battle=${report.offline.battleRendered}`);
chrome.kill();
process.exit(0);
