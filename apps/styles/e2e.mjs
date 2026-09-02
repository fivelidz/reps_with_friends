/* ═══════════════════════════════════════════════════════════════════════
   RWF STYLES E2E — five-theme exploration verification.
   Zero deps: bun static server + headless chromium over the DevTools
   Protocol (same pattern as apps/figma-app/e2e.mjs).

   Walk:
     1. /styles gallery boots — 5 theme cards, 5 live iframes
     2. window.__rwfStylesVerify() — every check passes (distinct
        --primary/--bg per theme, AA ratios, fonts loaded)
     3. screenshots: compare strip (both / battle) + full preview ×5
     4. /figma-app boots in EACH theme — home + battle screens, zero
        console errors, data-theme applied, primary-button text follows
        the theme (no unthemed patches)

   Run:  bun apps/styles/e2e.mjs
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const PORT = 4190;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9227;
const THEMES = ["lime", "gold", "sunset", "neon", "forest"];

/* ── assertions bookkeeping ───────────────────────────────────────────── */
let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 1. static server: /styles→apps/styles · /design→design · app ────── */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    let p = new URL(req.url).pathname;
    const map = (rel) => {
      const f = Bun.file(join(ROOT, rel));
      return f.exists() ? new Response(f, {
        headers: { "content-type": MIME[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream",
                   "cache-control": "no-store" },
      }) : null;
    };
    if (p === "/styles" || p === "/styles/") p = "/styles/index.html";
    if (p.startsWith("/styles/")) return map(`apps/styles${p.replace(/^\/styles/, "")}`);
    if (p.startsWith("/design/")) return map(`design${p.replace(/^\/design/, "")}`);
    if (p.startsWith("/figma-app")) {
      if (p === "/figma-app" || p === "/figma-app/") p = "/figma-app/index.html";
      return map(`apps/figma-app${p.replace(/^\/figma-app/, "").replace(/^\/index\.html$/, "/index.html")}`);
    }
    return new Response("not found", { status: 404 });
  },
});

/* ── 2. launch chromium headless ─────────────────────────────────────── */
import { rmSync } from "node:fs";
try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-styles-e2e"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-styles-e2e-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=1480,1100",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});

async function waitFor(fn, { timeout = 20000, every = 150, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await Bun.sleep(every);
  }
}
await waitFor(async () => {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); return r.ok; } catch { return false; }
}, { label: "chromium devtools endpoint" });

const newTab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const ws = new WebSocket(newTab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
let consoleErrors = []; // reset per app-boot phase
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consoleErrors.push(`console.error: ${m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200)}`);
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ""}`.slice(0, 200));
  } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    consoleErrors.push(`log: ${m.params.entry.text}`.slice(0, 200));
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function shot(name, w, h) {
  if (w) await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}.png`), Buffer.from(r.data, "base64"));
}

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF STYLES E2E — ${BASE} (headless chromium)\n`);

/* ── A · gallery boots ───────────────────────────────────────────────── */
console.log("— GALLERY");
await send("Page.navigate", { url: `${BASE}/styles/` });
await waitFor(() => evalJs(`window.__rwfStylesReady === true && document.querySelectorAll('.st-card').length === 5`).catch(() => false),
  { label: "gallery ready" });
await sleep(1400); // iframes + fonts
ok(await evalJs(`document.querySelectorAll('.st-card').length === 5`), "5 theme cards render");
ok(await evalJs(`document.querySelectorAll('[data-theme-frame]').length === 5`), "5 live iframes in the strip");
ok((await evalJs(`document.querySelector('.st-card__name').textContent`)) === "Lime Athletic", "card 1 is Lime Athletic");

/* clobber guard: /system's persisted gold (localStorage rwf-theme, owned by
   figma-components.js) must NOT flip the gallery away from lime */
await evalJs(`localStorage.setItem('rwf-theme', 'gold'); location.reload(); true`);
await waitFor(() => evalJs(`window.__rwfStylesReady === true`).catch(() => false), { label: "gallery reload" });
await sleep(900);
ok(await evalJs(`document.documentElement.dataset.theme === "lime"`), "gallery stays lime despite persisted /system gold");
await evalJs(`localStorage.removeItem('rwf-theme'); true`);
await shot("gallery-compare-both", 1480, 1200);

/* verify: distinct primaries + full check suite from the live page */
const v = await evalJs(`window.__rwfStylesVerify().then(r => JSON.stringify(r))`).then(JSON.parse);
ok(v.pass === true, `in-page verify suite — ${v.total - v.fails}/${v.total} checks pass`);
for (const row of v.rows.filter(r => !r.ok)) console.log(`      ✗ ${row.label}: ${row.detail}`);
const distinct = await evalJs(`(() => {
  const vals = [...document.querySelectorAll('[data-theme-frame]')].map(f =>
    getComputedStyle(f.contentDocument.documentElement).getPropertyValue('--lime').trim());
  return JSON.stringify(vals);
})()`).then(JSON.parse);
ok(new Set(distinct).size === 5, `--primary distinct across themes: ${distinct.join(" | ")}`);

/* switcher → battle-only strip */
await evalJs(`document.querySelector('[data-screen="battle"]').click(); true`);
await waitFor(() => evalJs(`document.querySelector('.st-strip').dataset.screen === 'battle' && [...document.querySelectorAll('[data-theme-frame]')].every(f => {
  const d = f.contentDocument; if (!d) return false;
  const h = d.getElementById('home'), b = d.getElementById('battle');
  return b && b.style.display !== 'none' && (!h || h.style.display === 'none');
})`).catch(() => false), { label: "battle strip" });
await sleep(900);
await shot("gallery-compare-battle", 1480, 1200);

/* ── B · full preview per theme ──────────────────────────────────────── */
console.log("— PREVIEWS");
for (const t of THEMES) {
  await evalJs(`window.__rwfStyles.enterPreview(${JSON.stringify(t)}); true`);
  await sleep(900);
  const attr = await evalJs(`document.documentElement.dataset.theme`);
  ok(attr === t, `preview mode applies data-theme="${t}" to the gallery itself`);
  await shot(`preview-${t}`, 1480, 1400);
}
await evalJs(`window.__rwfStyles.exitPreview(); true`);
await sleep(300);
ok(await evalJs(`document.documentElement.dataset.theme === "lime"`), "exit preview restores lime");

/* ── C · figma-app boots in every theme ──────────────────────────────── */
console.log("— FIGMA-APP × 5 THEMES");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
for (const t of THEMES) {
  consoleErrors = [];
  await send("Page.navigate", { url: `${BASE}/figma-app/index.html` });
  await waitFor(() => evalJs(`document.readyState === 'complete' && document.querySelector('.fx-app') !== null`).catch(() => false),
    { label: `${t} app load` });
  /* inject the saved theme + reload so the app restores it natively */
  await evalJs(`localStorage.setItem('rwf-figma-theme', ${JSON.stringify(t)}); location.reload(); true`);
  await waitFor(() => evalJs(`document.readyState === 'complete' && document.querySelector('.fx-app') !== null`).catch(() => false),
    { label: `${t} app reload` });
  await sleep(700);
  ok(await evalJs(`document.documentElement.dataset.theme`) === t, `${t}: data-theme applied on restore`);
  ok(consoleErrors.length === 0, `${t}: zero console errors (index)`);
  await shot(`app-${t}-index`, 390, 844);

  /* home screen */
  consoleErrors = [];
  await evalJs(`location.hash = '#/home-001'; true`);
  await sleep(500);
  ok(await evalJs(`document.querySelector('.fx-app') !== null && document.querySelector('.fx-app').innerHTML.length > 500`), `${t}: home screen renders`);
  ok(consoleErrors.length === 0, `${t}: zero console errors (home)`);
  await shot(`app-${t}-home`, 390, 844);

  /* battle screen */
  consoleErrors = [];
  await evalJs(`location.hash = '#/battle-001'; true`);
  await sleep(500);
  ok(await evalJs(`document.querySelector('.fx-app') !== null && document.querySelector('.fx-app').innerHTML.length > 500`), `${t}: battle screen renders`);
  ok(consoleErrors.length === 0, `${t}: zero console errors (battle)`);

  /* no unthemed patches: a real .fx-btn--primary injected into the app
     must wear the theme's --on-gold text (app.css: var(--on-gold, --bg))
     — proves the skin flows into app components, not just the shell */
  const themed = await evalJs(`(() => {
    const app = document.querySelector('.fx-app');
    const btn = document.createElement('button');
    btn.className = 'fx-btn--primary';
    btn.textContent = 'probe';
    app.appendChild(btn);
    const got = getComputedStyle(btn).color;
    const bgc = getComputedStyle(btn).backgroundColor;
    btn.remove();
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:-9999px;top:0';
    probe.setAttribute('data-theme', ${JSON.stringify(t)});
    document.body.appendChild(probe);
    const wantHex = getComputedStyle(probe).getPropertyValue('--on-gold').trim();
    probe.remove();
    const n = (h) => h.replace('#','').match(/.{2}/g).map(x => parseInt(x, 16));
    const [r, g, b] = n(wantHex);
    return JSON.stringify({ ok: got === \`rgb(\${r}, \${g}, \${b})\`, got, wantHex, bgc });
  })()`);
  const tt = JSON.parse(themed || "{}");
  ok(tt.ok === true, `${t}: primary-fill text follows theme (${tt.wantHex} → ${tt.got})`);

  /* Settings row + picker screen */
  await evalJs(`location.hash = '#/set-001'; true`);
  await sleep(400);
  ok(await evalJs(`document.body.innerHTML.includes('Theme (beta)')`), `${t}: Settings shows Theme (beta) row`);
  await evalJs(`location.hash = '#/set-007'; true`);
  await sleep(400);
  ok(await evalJs(`document.querySelectorAll('[data-theme-opt]').length === 5`), `${t}: picker shows 5 options`);
  await shot(`app-${t}-picker`, 390, 844);
}

/* restore neutral state for the next run */
await evalJs(`localStorage.removeItem('rwf-figma-theme'); true`);

/* ── done ────────────────────────────────────────────────────────────── */
console.log(`\n${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILURES`}: ${passed}/${step} checks`);
try { proc.kill("SIGTERM"); } catch {}
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
server.stop(true);
process.exit(failures.length === 0 ? 0 : 1);
