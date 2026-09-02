// RWF site — end-to-end verification via headless Chromium CDP (no deps).
// Checks: zero console errors, both 3D canvases render (pixel colour check),
// rep counter ticks, handicap demo computes, reveals fire on scroll,
// guide widget opens and hits /api/ai.
// Run: bun site/verify.ts   (needs `bun serve.ts` on :4173)

import { spawn } from "node:child_process";

const URL = "http://localhost:4173/";
const DEBUG_PORT = 9337;

const chrome = spawn("/usr/bin/chromium", [
  "--headless=new",
  "--no-sandbox",
  "--hide-scrollbars",
  "--window-size=1280,900",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--user-data-dir=/tmp/rwf-site-cdp-profile",
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
const consoleErrors: string[] = [];

ws.onmessage = (ev: MessageEvent) => {
  const msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!.resolve(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`EXCEPTION: ${JSON.stringify(msg.params.exceptionDetails).slice(0, 1500)}`);
  }
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(msg.params.type)) {
    consoleErrors.push(`CONSOLE.${msg.params.type}: ${JSON.stringify(msg.params.args).slice(0, 300)}`);
  }
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    consoleErrors.push(`LOG: ${msg.params.entry.text} ${msg.params.entry.url ?? ""}`.slice(0, 300));
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
    throw new Error(`page eval failed: ${expression.slice(0, 80)} → ${JSON.stringify(r.result.exceptionDetails).slice(0, 300)}`);
  }
  return r.result?.result?.value;
}

// Screenshot a CSS-pixel region and count pixels matching a colour predicate.
// The PNG is served from a tiny local HTTP endpoint (CORS-open) and decoded
// inside the page itself (img → 2D canvas → getImageData).
let lastShot = new Uint8Array(0);
Bun.serve({
  port: 9338,
  headers: { "Access-Control-Allow-Origin": "*" },
  fetch: () => new Response(lastShot, { headers: { "Content-Type": "image/png", "Access-Control-Allow-Origin": "*" } }),
});

async function pixelCheck(selector: string, name: string): Promise<string> {
  const shot: any = await send("Page.captureScreenshot", { format: "png" });
  lastShot = new Uint8Array(Buffer.from(shot.result?.data ?? shot.data, "base64"));
  const counts: any = await evalJs(`(async () => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "http://127.0.0.1:9338/shot.png?ts=" + Date.now();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const dpr = img.width / window.innerWidth;
    const x0 = Math.max(0, Math.floor(r.left * dpr)), x1 = Math.min(img.width, Math.ceil(r.right * dpr));
    const y0 = Math.max(0, Math.floor(r.top * dpr)),  y1 = Math.min(img.height, Math.ceil(r.bottom * dpr));
    let lime = 0, steel = 0, total = 0;
    const data = g.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    for (let i = 0; i < data.length; i += 4) {
      const R = data[i], G = data[i + 1], B = data[i + 2];
      total++;
      if (R > 140 && G > 190 && B < 110 && G > R) lime++;          // #c6f32e family
      if (R >= 30 && R <= 80 && B >= 42 && B <= 100 && B > R && G >= R && G <= B + 12) steel++; // #2e333b family
    }
    return { lime, steel, total, w: x1 - x0, h: y1 - y0 };
  })()`);
  return `${name}: region ${counts.w}x${counts.h} — lime px ${counts.lime}, steel px ${counts.steel} (of ${counts.total})`;
}

// ── run ──────────────────────────────────────────────────────────────────────
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = "") => results.push([name, ok, detail]);

try {
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");

  // patch fetch BEFORE navigation so we can observe /api/ai calls
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__aiCalls = [];
             const _f = window.fetch;
             window.fetch = function(u, o) {
               try { if (String(u).includes('/api/ai')) window.__aiCalls.push(Date.now()); } catch {}
               return _f.apply(this, arguments);
             };`,
  });

  const nav = await send("Page.navigate", { url: URL });
  if (nav.result?.errorText) throw new Error(`navigation failed: ${nav.result.errorText}`);
  await sleep(4500); // load + scenes boot + a couple of curl cycles

  // 1 · canvases mounted
  const canvases: any = await evalJs(`({
    hero: !!document.querySelector('#heroCanvas canvas'),
    graph: !!document.querySelector('#graphCanvas canvas'),
  })`);
  check("hero canvas mounted", canvases.hero);
  check("graph canvas mounted", canvases.graph);

  // 2 · pixel checks (hero at top of page)
  const heroPixels = await pixelCheck("#heroCanvas", "hero pixels");
  const heroCounts = heroPixels.match(/lime px (\d+), steel px (\d+)/)!;
  check("hero renders lime", Number(heroCounts[1]) > 200, heroPixels);
  check("hero renders steel", Number(heroCounts[2]) > 500, heroPixels);

  // 3 · rep counter ticks
  const rep1 = await evalJs(`document.getElementById('repCount')?.textContent`);
  await sleep(3200);
  const rep2 = await evalJs(`document.getElementById('repCount')?.textContent`);
  check("rep counter ticks", rep1 !== rep2 && Number(rep2) > Number(rep1), `${rep1} → ${rep2}`);

  // 4 · handicap demo computes
  const hc: any = await evalJs(`(() => {
    const s = document.getElementById('tierSlider');
    s.value = '3'; s.dispatchEvent(new Event('input', { bubbles: true }));
    return {
      mult: document.getElementById('multOut')?.textContent,
      score: document.getElementById('scoreOut')?.textContent,
      adjBar: document.getElementById('adjBar')?.style.width,
      rawBar: document.getElementById('rawBar')?.style.width,
    };
  })()`);
  check("handicap computes (200 × 0.85 = 170)", hc.mult === "× 0.85" && hc.score === "170", JSON.stringify(hc));
  check("handicap bars live", !!hc.adjBar && !!hc.rawBar && hc.adjBar !== hc.rawBar, `adj=${hc.adjBar} raw=${hc.rawBar}`);

  // 5 · reveals fire on scroll
  await evalJs(`(async () => {
    for (const y of [400, 900, 1400, 1900, 2400, 2900, 3400, 3900, document.body.scrollHeight]) {
      window.scrollTo(0, y);
      await new Promise(r => setTimeout(r, 220));
    }
  })()`);
  await sleep(800);
  const rev: any = await evalJs(`({ total: document.querySelectorAll('.reveal').length, in: document.querySelectorAll('.reveal.in').length })`);
  check("reveals fire on scroll", rev.total > 0 && rev.in === rev.total, `${rev.in}/${rev.total} revealed`);

  // graph canvas pixel check (now that we scrolled past it — scroll back up to it)
  await evalJs(`document.getElementById('connections').scrollIntoView()`);
  await sleep(1500);
  const graphPixels = await pixelCheck("#graphCanvas", "graph pixels");
  const graphLime = Number(graphPixels.match(/lime px (\d+)/)![1]);
  check("graph scene renders lime", graphLime > 100, graphPixels);

  // 6 · guide widget opens and hits /api/ai
  await evalJs(`window.scrollTo(0, 0)`);
  await sleep(300);
  // The guide auto-intro (guide.js) opens the panel by itself ~5s after load
  // on desktop. By the time we get here it may already be open — clicking the
  // launcher would TOGGLE it closed and fail the check below. Close first if
  // the intro beat us, so this always asserts click → OPEN.
  const alreadyOpen: any = await evalJs(`document.getElementById('guidePanel').classList.contains('open')`);
  if (alreadyOpen) await evalJs(`document.getElementById('guideLauncher').click()`);
  await sleep(200);
  await evalJs(`document.getElementById('guideLauncher').click()`);
  await sleep(500);
  const panelOpen: any = await evalJs(`document.getElementById('guidePanel').classList.contains('open')`);
  check("guide panel opens", panelOpen === true);

  await evalJs(`(() => {
    const i = document.getElementById('guideInput');
    i.value = 'In one short sentence: what is the 300?';
    document.getElementById('guideForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  // wait for bot reply (or error bubble — either proves the endpoint was hit)
  let botText = "";
  for (let i = 0; i < 40; i++) {
    await sleep(750);
    botText = await evalJs(`document.querySelector('#guideMessages .msg--bot:not(.msg--loading)')?.textContent ?? ''`);
    if (botText.trim().length > 3) break;
  }
  const aiCalls: number = await evalJs(`window.__aiCalls.length`);
  check("guide hits /api/ai", aiCalls > 0, `${aiCalls} call(s)`);
  check("guide gets a reply", botText.trim().length > 3, botText.trim().slice(0, 90));

  // 7 · zero console errors
  check("zero console errors", consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 600));
} finally {
  chrome.kill();
}

// ── report ───────────────────────────────────────────────────────────────────
let fail = 0;
console.log("\n═══ RWF SITE VERIFICATION ═══");
for (const [name, ok, detail] of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  —  ${detail}` : ""}`);
  if (!ok) fail++;
}
console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : fail + " CHECK(S) FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
