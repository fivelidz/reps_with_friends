// CDP layout probe for the coverage hub (v1.1.0) — bun-native, zero deps.
// Launches headless chromium, loads the page at mobile + desktop widths,
// reports: console errors, horizontal overflow, offscreen elements,
// link count, screenshot-ready metrics. Usage: bun probe.cdp.mts [url]
import { spawn } from "node:child_process";

const URL = process.argv[2] ?? "http://localhost:4173/v1";
const PORT = 9337;

const chr = spawn("chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cdp(): Promise<{ ws: any; id: number; send: any; waitEvent: any }> {
  // wait for DevTools endpoint
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) break;
    } catch {}
    await sleep(200);
  }
  // create a target for our URL
  const t = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: "PUT" });
  const target = await t.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const events: any[] = [];
  ws.onmessage = (ev: any) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else events.push(m);
  };
  const send = (method: string, params: any = {}) =>
    new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const waitEvent = (name: string, timeoutMs = 15000) =>
    new Promise((res) => {
      const t0 = Date.now();
      const poll = () => {
        const hit = events.find((e) => e.method === name);
        if (hit) return res(hit);
        if (Date.now() - t0 > timeoutMs) return res(null);
        setTimeout(poll, 100);
      };
      poll();
    });
  return { ws, id, send, waitEvent, events };
}

const { ws, send, waitEvent, events } = await cdp();
await send("Runtime.enable");
await send("Page.enable");
await send("Log.enable");
await waitEvent("Page.loadEventFired", 20000);
await sleep(2500); // fonts + images settle

async function measure(width: number, height: number) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  await sleep(1200);
  const r = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const de = document.documentElement;
      const wide = [...document.querySelectorAll('*')]
        .filter(el => el.getBoundingClientRect().right > de.clientWidth + 1)
        .map(el => el.tagName + '.' + (el.className?.toString().split(' ')[0] ?? ''));
      return {
        viewport: de.clientWidth + 'x' + de.clientHeight,
        scrollW: de.scrollWidth, scrollH: de.scrollHeight,
        overflowX: de.scrollWidth > de.clientWidth + 1,
        wideElements: wide.slice(0, 8),
        links: document.querySelectorAll('a[href]').length,
        imgs: document.querySelectorAll('img').length,
        imgBroken: [...document.querySelectorAll('img')].filter(i => !i.complete || i.naturalWidth === 0).length,
        h2: [...document.querySelectorAll('h2')].map(h => h.textContent.trim()),
        pills: document.querySelectorAll('.pill').length,
        cards: document.querySelectorAll('.card').length,
        docs: document.querySelectorAll('.doc').length,
      };
    })()`,
  });
  return r.result?.result?.value;
}

const errors: string[] = [];
// collect console/log entries already captured in events[]
for (const e of events) {
  if (e.method === "Log.entryAdded" && (e.params.entry.level === "error" || e.params.entry.level === "warning"))
    errors.push(`${e.params.entry.level}: ${e.params.entry.text}`);
  if (e.method === "Runtime.consoleAPICalled" && e.params.type === "error")
    errors.push(`console.error: ${JSON.stringify(e.params.args?.[0]?.value ?? e.params.args?.[0]?.description)}`);
}

const mobile = await measure(390, 844);
const desktop = await measure(1440, 900);
const docSample = await send("Runtime.evaluate", {
  returnByValue: true,
  expression: `fetch('/v1/docs/24_GAME_DESIGN.html').then(r=>r.text()).then(t=>{
    const d=new DOMParser().parseFromString(t,'text/html');
    return {tables:d.querySelectorAll('table').length, h2:d.querySelectorAll('h2').length,
            links:d.querySelectorAll('a[href]').length, deadMd:d.querySelectorAll('a[href$=".md"]').length};
  })`,
}).then((r: any) => r.result?.result?.value ?? { async: true });

console.log(JSON.stringify({ url: URL, consoleErrors: errors, mobile, desktop, docSample }, null, 2));
chr.kill("SIGKILL");
process.exit(0);
