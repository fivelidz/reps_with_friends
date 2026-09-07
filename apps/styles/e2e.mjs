/* ═══════════════════════════════════════════════════════════════════════
   RWF STYLES E2E — five-theme exploration verification.
   Zero deps: bun static server + headless chromium over the DevTools
   Protocol (same pattern as apps/figma-app/e2e.mjs).

    Walk:
       1. /styles gallery boots — 26 theme cards, 26 demo iframes,
          21 app-demo iframes (the V2 board game showcase)
       2. window.__rwfStylesVerify() — every check passes (distinct
          --primary/--bg per theme, AA ratios, fonts loaded)
       3. ON THE APP — appdemo.html?t=… × 21: renders clean, zero console
          errors, and computed STYLE SIGNATURES (radius/border/shadow/
          pattern/font) differ per theme pair in ≥3/10 dims — proof the
          overhaul is structural, not hue-only
       4. screenshots: compare strip + app strip + appdemo ×26
          + Sports Poster family (original + 4 variants) × 8 screens each
          + preview ×5
       5. /figma-app boots in EACH theme — home + battle screens, zero
          console errors, data-theme applied, primary-button text follows
          the theme (no unthemed patches)
       6. HEADER DIET — one compact bar (≤64px), long subtitle behind the
          "?" sheet, and the preview bar's ✕ ACTUALLY closes it (the old
          display:flex-overrides-[hidden] bug, asserted via a real click)
       7. PHONE REVIEW MODE at 390px — auto-opens on touch devices,
          synthetic CDP swipes cycle themes with momentum + drag-follow,
          ♥ picks persist (rwf.styles.shortlist), arrows still cycle,
          swipe-↑ exits, the ★ shortlist row + text summary generate,
          ?review=1 resumes at the first pick, AA contrast in the chrome.
          Shots carry the _phone suffix.

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
const V2_THEMES = ["board", "mycelial", "techy", "track", "cardtable", "caveman", "n64", "goldeneye"];
const NEOBRUT_VARIANTS = ["neobrut-field", "neobrut-zine", "neobrut-ticket", "neobrut-locker"];
const SITE_THEMES = ["x10", "doof", "qalarc", "tradez", "gmux", "volkus", "endispute", "steddi"];
const ALL_THEMES = ["lime", "gold", "sunset", "neon", "forest", ...V2_THEMES, "neobrut", ...NEOBRUT_VARIANTS, ...SITE_THEMES];
/* mined DNA — the founder's own hexes, straight from his live CSS */
const SITE_DNA = {
  x10:       { bg: "#0b0e0b", primary: "#6E9A6A", site: "x10.au" },
  doof:      { bg: "#0a0a0f", primary: "#a855f7", site: "doof.ing" },
  qalarc:    { bg: "#fdf6ee", primary: "#6d4fa3", site: "qalarc.com" },
  tradez:    { bg: "#FBF8EF", primary: "#3d5c3a", site: "tradez.au" },
  gmux:      { bg: "#edefe6", primary: "#2e6b40", site: "gmux.ai" },
  volkus:    { bg: "#0d0d0d", primary: "#c27840", site: "volkus.net" },
  endispute: { bg: "#f4eedf", primary: "#7d5a0e", site: "endispute.com.au" },
  steddi:    { bg: "#0f0b0d", primary: "#c23b2f", site: "qalarc.com/projects/steddi-overlap" },
};
const NEOBRUT_SCREENS = ["home", "battle", "log", "cards", "profile", "dialogs", "dz", "matlab"];
/* per-variant structural tells — computed-style probes proving each variant
   carries its OWN material (not a re-tint of the original). See C2. */

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
    if (p === "/favicon.ico") return new Response("", { status: 204 });
    if (p === "/styles" || p === "/styles/") p = "/styles/index.html";
    if (p.startsWith("/styles/")) return map(`apps/styles${p.replace(/^\/styles/, "")}`);
    if (p.startsWith("/design/")) return map(`design${p.replace(/^\/design/, "")}`);
    if (p.startsWith("/figma-app")) {
      if (p === "/figma-app" || p === "/figma-app/") p = "/figma-app/index.html";
      return map(`apps/figma-app${p.replace(/^\/figma-app/, "").replace(/^\/index\.html$/, "/index.html")}`);
    }
    if (p === "/v2" || p.startsWith("/v2/")) {
      /* appdemo.html loads the REAL board app stylesheet at /v2/board.css */
      if (p === "/v2" || p === "/v2/") p = "/v2/index.html";
      return map(`apps/board${p.replace(/^\/v2/, "")}`);
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
/* viewport-only capture — for full-screen overlays (the phone review mode):
   captureBeyondViewport would shoot the whole gallery behind the overlay */
async function shotViewport(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}.png`), Buffer.from(r.data, "base64"));
}

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF STYLES E2E — ${BASE} (headless chromium)\n`);

/* ── A · gallery boots ───────────────────────────────────────────────── */
console.log("— GALLERY");
await send("Page.navigate", { url: `${BASE}/styles/` });
await waitFor(() => evalJs(`window.__rwfStylesReady === true && document.querySelectorAll('.st-card').length === 26`).catch(() => false),
  { label: "gallery ready" });
await sleep(5000); // 26 eager iframes + fonts (lazy but settle slowly)
ok(await evalJs(`document.querySelectorAll('.st-card').length === 26`), "26 theme cards render (5 originals + board eight + 4 poster variants + 8 mined)");
ok(await evalJs(`document.querySelectorAll('[data-theme-frame]').length === 26`), "26 live iframes in the strip");
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
ok(new Set(distinct).size === 26, `--primary distinct across 26 themes`);

/* mined themes: founder-recognisable DNA — the site's OWN bg + primary hexes
   must come out of the computed styles (proof the kit carries the source) */
for (const id of SITE_THEMES) {
  const dna = await evalJs(`(() => {
    const f = document.querySelector('iframe[data-theme-frame="${id}"]');
    const cs = getComputedStyle(f.contentDocument.documentElement);
    return JSON.stringify({ bg: cs.getPropertyValue('--bg').trim().toLowerCase(),
                            primary: cs.getPropertyValue('--lime').trim().toLowerCase() });
  })()`);
  const got = JSON.parse(dna);
  const want = SITE_DNA[id];
  ok(got.bg === want.bg.toLowerCase() && got.primary === want.primary.toLowerCase(),
     `${id}: carries ${want.site} DNA (bg ${got.bg} / primary ${got.primary})`);
}

/* switcher → battle-only strip */
await evalJs(`document.querySelector('[data-screen="battle"]').click(); true`);
await waitFor(() => evalJs(`document.querySelector('.st-strip').dataset.screen === 'battle' && [...document.querySelectorAll('[data-theme-frame]')].every(f => {
  const d = f.contentDocument; if (!d) return false;
  const h = d.getElementById('home'), b = d.getElementById('battle');
  return b && b.style.display !== 'none' && (!h || h.style.display === 'none');
})`).catch(() => false), { label: "battle strip" });
await sleep(2600);
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

/* ── B2 · ARROW KEYS — swap from cold, cycle, flash, esc ─────────────── */
console.log("— ARROW KEYS");
await evalJs(`(window.__rwfStyles.active() === null) || window.__rwfStyles.exitPreview(); true`);
await sleep(200);
ok(await evalJs(`window.__rwfStyles.active() === null`), "arrow test starts cold (no preview)");
/* first ArrowRight from the gallery ENTERS preview on the first theme */
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); true`);
await sleep(150);
ok(await evalJs(`window.__rwfStyles.active() === "lime"`), "ArrowRight from cold enters preview at Lime Athletic");
ok(await evalJs(`document.getElementById("themeFlash").classList.contains("is-on") === true`),
   "theme name flashes large on swap");
ok(await evalJs(`document.getElementById("themeFlash").textContent.includes("Lime Athletic")`),
   "flash shows the theme name");
/* cycle: 3 rights → gold → sunset → neon */
for (let i = 0; i < 3; i++) {
  await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); true`);
  await sleep(90);
}
ok(await evalJs(`window.__rwfStyles.active() === "neon"`), "3× ArrowRight cycles lime → gold → sunset → neon");
ok(await evalJs(`document.getElementById("previewChip").textContent === "Midnight Neon"`),
   "preview chip tracks the cycled theme");
/* key-repeat (holding) uses the quick flash — structural, not timing-based */
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, repeat: true })); true`);
await sleep(90);
ok(await evalJs(`window.__rwfStyles.active() === "forest" && document.getElementById("themeFlash").classList.contains("is-quick") === true`),
   "held key (repeat event) scrubs with the quick flash");
/* left wraps backwards */
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); true`);
await sleep(90);
ok(await evalJs(`window.__rwfStyles.active() === "neon"`), "ArrowLeft steps back");
/* number jump */
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "5", bubbles: true })); true`);
await sleep(90);
ok(await evalJs(`window.__rwfStyles.active() === "forest"`), "5 jumps to slot 5 (Forest Retro)");
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); true`);
await sleep(150);
ok(await evalJs(`window.__rwfStyles.active() === null && document.documentElement.dataset.theme === "lime"`),
   "Escape exits preview and restores lime");

/* ── C · ON THE APP — the V2 board game in every overhauled skin ────── */
console.log("— APP DEMOS (V2 board game × 8 + poster variants × 4 + founder-site × 8)");
consoleErrors = [];
await send("Emulation.setDeviceMetricsOverride", { width: 1480, height: 1100, deviceScaleFactor: 1, mobile: false });
ok(await evalJs(`document.querySelectorAll('[data-app-frame]').length === 21`),
   "21 app-demo iframes in the On-the-app strip (9 game kits + 4 poster variants + 8 founder-page kits)");
await waitFor(() => evalJs(`[...document.querySelectorAll('[data-app-frame]')].every(f =>
  f.contentDocument?.querySelector('#battle .bd-pot') &&
  f.contentDocument?.querySelector('#battle .bd-card') &&
  f.contentDocument?.querySelector('#home .bd-tcard') &&
  f.contentWindow.__appDemoReady === true)`).catch(() => false),
  { label: "app demos ready (fonts settled)" });
await sleep(1200);
for (const t of V2_THEMES) {
  ok(await evalJs(`(() => {
    const f = document.querySelector('[data-app-frame="${t}"]'); if (!f) return false;
    const d = f.contentDocument;
    const vis = [...d.querySelectorAll('.demo-phone')].filter((p) => p.style.display !== 'none');
    return d.documentElement.dataset.theme === "${t}" &&
           vis.length === 2 &&
           !!d.querySelector('#battle .bd-table .bd-track .bd-lane') &&
           d.querySelectorAll('#battle .bd-chip').length >= 6 &&
           d.querySelectorAll('#battle .bd-card').length === 3;
  })()`), `${t}: app demo renders home + battle (track, pot chips, 3-card hand)`);
  /* geometry probe — the demo must not just exist but LAYOUT correctly:
     pot centred on the table, tokens on the felt, hand inside the phone,
     no horizontal overflow on either screen */
  const geo = JSON.parse(await evalJs(`(() => {
    const f = document.querySelector('[data-app-frame="${t}"]');
    const d = f.contentDocument, r = (el) => { const b = el.getBoundingClientRect();
      return { x: +b.x.toFixed(0), y: +b.y.toFixed(0), w: +b.width.toFixed(0), h: +b.height.toFixed(0) }; };
    return JSON.stringify({
      table: r(d.querySelector('#battle .bd-table')),
      pot: r(d.querySelector('#battle .bd-pot')),
      hand: r(d.querySelector('#battle .bd-hand')),
      battlePhone: r(d.querySelector('#battle.demo-phone')),
      phones: [...d.querySelectorAll('.demo-phone')].map((p) => ({ sw: p.scrollWidth, cw: p.clientWidth, sh: p.scrollHeight, ch: p.clientHeight })),
      tok: [...d.querySelectorAll('#battle .bd-token')].map(r),
    });
  })()`));
  const dx = Math.abs((geo.pot.x + geo.pot.w / 2) - (geo.table.x + geo.table.w / 2));
  const dy = Math.abs((geo.pot.y + geo.pot.h / 2) - (geo.table.y + geo.table.h / 2));
  ok(dx <= 3 && dy <= 3 && geo.pot.w >= 90,
     `${t}: pot medallion centred on the table (${geo.pot.w}px, Δ${dx}/${dy})`);
  const tokOk = geo.tok.length === 4 && geo.tok.every((k) =>
    k.x >= geo.table.x && k.x <= geo.table.x + geo.table.w && k.y >= geo.table.y && k.y <= geo.table.y + geo.table.h);
  ok(tokOk, `${t}: 4 runner tokens render inside the felt`);
  const noOver = geo.phones.every((p) => p.sw <= p.cw + 1);
  const handInside = geo.hand.w > 60 && geo.hand.h > 60 &&
    geo.hand.y + geo.hand.h <= geo.battlePhone.y + geo.battlePhone.h - 4;
  ok(handInside && noOver,
     `${t}: card hand fully inside the phone ${geo.hand.w}×${geo.hand.h} (bottom ${geo.hand.y + geo.hand.h} ≤ ${geo.battlePhone.y + geo.battlePhone.h}) · overflow ${geo.phones.map((p) => p.sw + "/" + p.cw).join(" ")}`);
}
ok(consoleErrors.length === 0, `app demos: zero console errors${consoleErrors.length ? " — " + consoleErrors[0] : ""}`);

/* the founder-page kits render the same board app with their own DNA */
for (const id of SITE_THEMES) {
  ok(await evalJs(`(() => {
    const f = document.querySelector('[data-app-frame="${id}"]'); if (!f) return false;
    const d = f.contentDocument;
    const vis = [...d.querySelectorAll('.demo-phone')].filter((p) => p.style.display !== 'none');
    return d.documentElement.dataset.theme === "${id}" &&
           vis.length === 2 &&
           !!d.querySelector('#battle .bd-table .bd-track .bd-lane') &&
           d.querySelectorAll('#battle .bd-chip').length >= 6 &&
           d.querySelectorAll('#battle .bd-card').length === 3;
  })()`), `${id}: board app renders in the ${SITE_DNA[id].site} skin`);
}

/* distinctness: computed LAYOUT/STYLE signature per theme (radius, border,
   shadow, background pattern, font) — structure, not hue. Every pair of
   the eight must differ in ≥3 dimensions. */
const sigs = JSON.parse(await evalJs(`(() => {
  const out = {};
  for (const f of document.querySelectorAll('[data-app-frame]')) {
    const d = f.contentDocument;
    const cs = (el, p) => (el ? getComputedStyle(el)[p] : "none");
    const pot = d.querySelector('.bd-pot'), card = d.querySelector('.bd-card__face--front'),
          btn = d.querySelector('.pop-btn--big'), lane = d.querySelector('.bd-lane'),
          table = d.querySelector('.bd-table'), h1 = d.querySelector('.bd-h1');
    out[f.dataset.appFrame] = {
      potPattern: cs(pot, 'backgroundImage').slice(0, 70),
      potShadow: cs(pot, 'boxShadow').slice(0, 70),
      cardRadius: cs(card, 'borderRadius'),
      cardBorder: cs(card, 'borderTopWidth') + ' ' + cs(card, 'borderTopColor'),
      btnRadius: cs(btn, 'borderRadius'),
      btnShadow: cs(btn, 'boxShadow').slice(0, 50),
      btnFont: cs(btn, 'fontFamily'),
      laneBorder: cs(lane, 'borderTopWidth') + ' ' + cs(lane, 'borderTopStyle') + ' ' + cs(lane, 'borderTopColor'),
      tablePattern: cs(table, 'backgroundImage').slice(0, 50),
      h1Font: cs(h1, 'fontFamily'),
    };
  }
  return JSON.stringify(out);
})()`));
const APP_SIG = [...V2_THEMES, "neobrut", ...NEOBRUT_VARIANTS, ...SITE_THEMES];
let minDims = 99, worstPair = "";
for (let i = 0; i < APP_SIG.length; i++) {
  for (let j = i + 1; j < APP_SIG.length; j++) {
    const a = sigs[APP_SIG[i]], b = sigs[APP_SIG[j]];
    const dims = Object.keys(a).filter((k) => a[k] !== b[k]).length;
    if (dims < minDims) { minDims = dims; worstPair = `${APP_SIG[i]}↔${APP_SIG[j]}`; }
  }
}
ok(minDims >= 3, `style signatures distinct: all 21 app-kit pairs differ in ≥3/10 structural dims (worst ${worstPair} = ${minDims})`);
/* the founder's explicit bar: every variant must differ from the ORIGINAL
   neobrut AND from each other in ≥3/10 dims — structural riffs, not re-tints */
{
  const fam = ["neobrut", ...NEOBRUT_VARIANTS];
  let famMin = 99, famWorst = "";
  for (let i = 0; i < fam.length; i++) {
    for (let j = i + 1; j < fam.length; j++) {
      const a = sigs[fam[i]], b = sigs[fam[j]];
      const dims = Object.keys(a).filter((k) => a[k] !== b[k]).length;
      if (dims < famMin) { famMin = dims; famWorst = `${fam[i]}↔${fam[j]}`; }
    }
  }
  ok(famMin >= 3, `Sports Poster family: original + 4 variants all pairwise ≥3/10 structural dims (worst ${famWorst} = ${famMin})`);
}
for (const t of APP_SIG)
  console.log(`      ${t.padEnd(10)} card=${(sigs[t]?.cardRadius ?? "?").padEnd(24)} lane=${sigs[t]?.laneBorder ?? "?"}`);

/* strip screenshot, then per-theme app shots (direct navigation) */
await evalJs(`document.getElementById('ontheapp').scrollIntoView(); true`);
await sleep(900);
await shot("app-strip-both", 1480, 1400);
for (const t of ALL_THEMES) {
  consoleErrors = [];
  await send("Page.navigate", { url: `${BASE}/styles/appdemo.html?t=${t}&screen=both` });
  await waitFor(() => evalJs(`window.__appDemoReady === true && [...document.querySelectorAll('.demo-phone')].filter((p) => p.style.display !== 'none').length === 2`).catch(() => false),
    { label: `${t} appdemo load` });
  await sleep(500);
  ok(consoleErrors.length === 0, `${t}: appdemo standalone boots clean`);
  await shot(`appdemo-${t}`, 860, 940);
}

/* ── C2 · THE SPORTS POSTER FAMILY — original + every variant, EVERY ───
   app overlay screen, plus one computed structural tell per variant. */
console.log("— SPORTS POSTER FAMILY (original + 4 variants) × every screen");
for (const t of ["neobrut", ...NEOBRUT_VARIANTS]) {
  for (const s of NEOBRUT_SCREENS) {
    consoleErrors = [];
    await send("Page.navigate", { url: `${BASE}/styles/appdemo.html?t=${t}&screen=${s}` });
    await waitFor(() => evalJs(`window.__appDemoReady === true && document.querySelectorAll('.demo-phone').length >= 1`).catch(() => false),
      { label: `${t}/${s} load` });
    await sleep(400);
    ok(consoleErrors.length === 0, `${t}/${s}: overlay boots clean`);
    await shot(`${t}-${s}`, 860, 960);
  }
}
/* structural tells — one computed probe per kit, each on ITS OWN page
   (navigate to the battle screen first; hidden elements in other screens
   would still resolve, but the pot's geometry/masks read truest live) */
async function probeTheme(t, fn) {
  consoleErrors = [];
  await send("Page.navigate", { url: `${BASE}/styles/appdemo.html?t=${t}&screen=battle` });
  await waitFor(() => evalJs(`window.__appDemoReady === true`).catch(() => false), { label: `${t} probe load` });
  await sleep(500);
  ok(consoleErrors.length === 0, `${t}: probe page boots clean`);
  return fn();
}
await probeTheme("neobrut", async () => {
  const sticker = await evalJs(`getComputedStyle(document.querySelector('.bd-pot'), '::after').content`);
  ok(String(sticker).includes("★"), `neobrut: the pot wears its sticker badge (${String(sticker).slice(0, 12)})`);
  const radius = await evalJs(`getComputedStyle(document.querySelector('.bd-pot')).borderRadius`);
  ok(String(radius).startsWith("14"), `neobrut: chunky corners rounded UNDER the hard edge (${radius})`);
});
await probeTheme("neobrut-field", async () => {
  const probe = JSON.parse(await evalJs(`(() => {
    const card = getComputedStyle(document.querySelector('.bd-card__face--front'));
    const pot = getComputedStyle(document.querySelector('.bd-pot'));
    return JSON.stringify({
      mask: (card.webkitMaskImage || card.maskImage || "").includes("radial-gradient"),
      potShadow: pot.boxShadow.includes("156, 61, 24"),
      potBadge: getComputedStyle(document.querySelector('.bd-pot'), '::after').content.includes('◈'),
    });
  })()`));
  ok(probe.mask && probe.potShadow && probe.potBadge,
     `neobrut-field: ticket-stub mask + warm clay plate + team roundel (mask=${probe.mask} clay=${probe.potShadow} roundel=${probe.potBadge})`);
});
await probeTheme("neobrut-zine", async () => {
  const shadow = await evalJs(`getComputedStyle(document.querySelector('.bd-pot')).boxShadow`);
  const misreg = String(shadow).includes("34, 68, 184") && String(shadow).includes("214, 31, 125");
  const centred = JSON.parse(await evalJs(`(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    const pot = r(document.querySelector('.bd-pot')), tbl = r(document.querySelector('.bd-table'));
    return JSON.stringify({ dx: Math.abs(pot.x - tbl.x), dy: Math.abs(pot.y - tbl.y) });
  })()`));
  ok(misreg && centred.dx <= 3 && centred.dy <= 3,
     `neobrut-zine: plates misregistered cyan + pink AND pot stays centred through its torn rotation (Δ${centred.dx}/${centred.dy})`);
});
await probeTheme("neobrut-ticket", async () => {
  const probe = JSON.parse(await evalJs(`(() => {
    const pot = getComputedStyle(document.querySelector('.bd-pot'));
    const total = getComputedStyle(document.querySelector('.bd-pot__total'));
    return JSON.stringify({
      ink: pot.backgroundColor === 'rgb(23, 25, 28)',
      amber: total.color === 'rgb(255, 176, 32)',
      mono: total.fontFamily.includes('JetBrains Mono'),
    });
  })()`));
  ok(probe.ink && probe.amber && probe.mono,
     `neobrut-ticket: departure-board pot (ink=${probe.ink} amber=${probe.amber} mono=${probe.mono})`);
});
await probeTheme("neobrut-locker", async () => {
  const probe = JSON.parse(await evalJs(`(() => {
    const btn = getComputedStyle(document.querySelector('.pop-btn--big'));
    return JSON.stringify({
      jersey: btn.borderRadius === '13px 13px 15px 15px',
      plate: getComputedStyle(document.querySelector('.bd-pot'), '::after').content.includes('◈'),
      tape: getComputedStyle(document.querySelector('.bd-pot__total')).textShadow.includes('31, 79, 143'),
    });
  })()`));
  ok(probe.jersey && probe.plate && probe.tape,
     `neobrut-locker: jersey-cut button + nameplate badge + tape-blue offset (jersey=${probe.jersey} plate=${probe.plate} tape=${probe.tape})`);
});
await probeTheme("steddi", async () => {
  const probe = JSON.parse(await evalJs(`(() => {
    const pot = document.querySelector('.bd-pot');
    const before = getComputedStyle(pot, '::before');
    const h1em = document.querySelector('.bd-h1 em');
    return JSON.stringify({
      datum: before.content.includes('+') && before.fontFamily.includes('JetBrains Mono'),
      laser: !!getComputedStyle(document.body, '::after').animationName.includes('matSteddiLaser'),
      gradInk: h1em ? getComputedStyle(h1em).color === 'rgba(0, 0, 0, 0)' : false,
    });
  })()`));
  ok(probe.datum && probe.laser && probe.gradInk,
     `steddi: datum crosshairs + 655nm laser sweep + KPI gradient ink (datum=${probe.datum} laser=${probe.laser} grad=${probe.gradInk})`);
});
/* steddi — the founder's page: every overlay screen, like the favourites */
console.log("— STEDDI (the founder's page) × every screen");
for (const s of NEOBRUT_SCREENS) {
  consoleErrors = [];
  await send("Page.navigate", { url: `${BASE}/styles/appdemo.html?t=steddi&screen=${s}` });
  await waitFor(() => evalJs(`window.__appDemoReady === true && document.querySelectorAll('.demo-phone').length >= 1`).catch(() => false),
    { label: `steddi/${s} load` });
  await sleep(400);
  ok(consoleErrors.length === 0, `steddi/${s}: overlay boots clean`);
  await shot(`steddi-${s}`, 860, 960);
}

/* ── C3 · /v2 regression smoke — the board app is untouched ──────────── */
console.log("— /v2 SMOKE");
consoleErrors = [];
await send("Page.navigate", { url: `${BASE}/v2/` });
await waitFor(() => evalJs(`document.readyState === 'complete' && document.querySelector('.bd-app, .bd-table, body') !== null`).catch(() => false),
  { label: "/v2 load" });
await sleep(700);
ok(await evalJs(`document.documentElement.dataset.theme === "board"`), "/v2 still defaults to the board skin");
ok(consoleErrors.length === 0, `/v2 boots with zero console errors${consoleErrors.length ? " — " + consoleErrors[0] : ""}`);
await send("Page.navigate", { url: `${BASE}/styles/` });
await waitFor(() => evalJs(`window.__rwfStylesReady === true`).catch(() => false), { label: "gallery re-load" });
await sleep(800);

/* ── D · figma-app boots in every theme ──────────────────────────────── */
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

/* ── E · COLOUR-STRIP DISTINCTNESS — structure must survive grayscale ─── */
console.log("— GRAYSCALE DISTINCTNESS (colour stripped, structure must remain)");
{
  const { execFileSync } = await import("node:child_process");
  const py = `
from PIL import Image, ImageOps
import itertools, json, sys, pathlib
shots = pathlib.Path(${JSON.stringify(SHOTS)})
themes = ${JSON.stringify(ALL_THEMES)}
imgs = {}
for t in themes:
    f = next(shots.glob(f"*appdemo-{t}.png"), None)
    if f is None:
        f = shots / f"appdemo-{t}.png"  # let the exists-check below report it
    if not f.exists():
        print(json.dumps({"missing": t})); sys.exit(2)
    im = Image.open(f).convert("L").resize((430, 470))   # grayscale, coarse
    imgs[t] = list(im.getdata())
worst, worst_pair, diffs = 1e9, None, {}
for a, b in itertools.combinations(themes, 2):
    ia, ib = imgs[a], imgs[b]
    d = sum(abs(x - y) for x, y in zip(ia, ib)) / len(ia)
    diffs[f"{a}|{b}"] = round(d, 2)
    if d < worst: worst, worst_pair = d, (a, b)
print(json.dumps({"worst": round(worst, 2), "pair": worst_pair, "n": len(diffs)}))
`;
  let res;
  try {
    res = execFileSync("python3", ["-c", py], { encoding: "utf8" });
  } catch (e) {
    res = e.stdout || "";
  }
  const parsed = JSON.parse(res.trim().split("\n").pop());
  if (parsed.missing) { ok(false, `grayscale: screenshot missing for ${parsed.missing}`); }
  else {
    ok(parsed.worst > 2.0,
       `every theme pair is structurally distinct in grayscale — ${parsed.n} pairs, worst ${parsed.pair.join("↔")} = ${parsed.worst} mean-ΔL (threshold 2.0)`);
  }
}

/* ═══════════════════ F · HEADER DIET + PREVIEW BAR FIX ═══════════════
   Founder: "the style screen header takes up too much of the screen and
   the preview bar cannot be closed." Root cause of the close bug:
   .st-previewbar{display:flex} (author CSS) beat the UA [hidden] rule,
   so the bar rendered from load and ✕ never hid it. Now: one compact
   bar (≤64px), the long subtitle behind "?" in a sheet, and a real
   [hidden]{display:none!important} guard — asserted by CLICKING the ✕. */
console.log("— HEADER DIET");
consoleErrors = [];
await send("Emulation.setDeviceMetricsOverride", { width: 1480, height: 1100, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setTouchEmulationEnabled", { enabled: false });
await send("Page.navigate", { url: `${BASE}/styles/` });
await waitFor(() => evalJs(`window.__rwfStylesReady === true && window.__rwfReviewReady === true`).catch(() => false),
  { label: "gallery ready (gallery + review layers)" });
await sleep(1200);
const barH = await evalJs(`document.querySelector('.st-bar').getBoundingClientRect().height`);
ok(barH > 24 && barH <= 64, `header collapsed to one compact bar — ${Math.round(barH)}px tall (≤ 64)`);
const headerH = await evalJs(`document.querySelector('.st-header').getBoundingClientRect().height`);
ok(headerH <= 70, `header stays slim with preview closed — ${Math.round(headerH)}px`);
ok(await evalJs(`!document.querySelector('.st-header .st-sub') && !document.querySelector('.st-header .st-links')`),
   "long subtitle + link nav moved out of the header");

/* the "?" sheet */
await evalJs(`document.getElementById('stHelp').click(); true`);
await sleep(220);
ok(await evalJs(`!document.getElementById('stSheet').hidden && document.getElementById('stSheet').textContent.includes('mined from your own pages')`),
   "? opens the sheet with the full page description");
ok(await evalJs(`document.getElementById('stHelp').getAttribute('aria-expanded') === 'true'`),
   "? button reflects open state (aria-expanded)");
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); true`);
await sleep(150);
ok(await evalJs(`document.getElementById('stSheet').hidden === true`),
   "Escape closes the sheet");
await evalJs(`document.querySelector('[data-sheet-close]').click(); true`);   /* backdrop */
await evalJs(`document.getElementById('stHelp').click(); true`);
await sleep(150);
await evalJs(`document.querySelector('.st-sheet__x').click(); true`);
await sleep(150);
ok(await evalJs(`document.getElementById('stSheet').hidden === true && document.getElementById('stHelp').getAttribute('aria-expanded') === 'false'`),
   "sheet ✕ (and backdrop) close it");

/* the preview bar — the actual founder bug, asserted through the real button */
ok(await evalJs(`getComputedStyle(document.getElementById('previewBar')).display === 'none'`),
   "preview bar hidden at rest (the display:flex-overrides-[hidden] bug is dead)");
await evalJs(`window.__rwfStyles.enterPreview('neon'); true`);
await sleep(500);
ok(await evalJs(`getComputedStyle(document.getElementById('previewBar')).display === 'flex'`),
   "preview bar appears in preview mode");
await evalJs(`document.getElementById('previewExit').click(); true`);
await sleep(400);
ok(await evalJs(`getComputedStyle(document.getElementById('previewBar')).display === 'none' && window.__rwfStyles.active() === null && document.documentElement.dataset.theme === 'lime'`),
   "clicking ✕ actually exits preview (bar hidden, theme back to lime)");
await shot("header-compact", 1480, 1100);
ok(consoleErrors.length === 0, `header diet: zero console errors${consoleErrors.length ? " — " + consoleErrors[0] : ""}`);

/* ═══════════════════ G · PHONE REVIEW MODE (390px, synthetic swipes) ══
   The client-review tool: full-screen theme slides, swipe ← → (+ arrows
   + trackpad), momentum, crossfade, dots, ♥ shortlist (localStorage
   rwf.styles.shortlist), swipe ↑ or ⊞ back to the gallery. */
console.log("— PHONE REVIEW MODE");
consoleErrors = [];
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await send("Page.navigate", { url: `${BASE}/styles/` });   /* clean URL — no stale hash */
await waitFor(() => evalJs(`window.__rwfReviewReady === true`).catch(() => false), { label: "phone load" });
await sleep(2600);   /* switcher slide iframe boots */

/* auto-open: touch + small screen = phone → the review mode takes over */
ok(await evalJs(`window.__rwfReview.autoWanted() === true`),
   "touch device with a phone-sized screen wants review mode");
ok(await evalJs(`window.__rwfReview.isOpen() === true && !document.getElementById('switcher').hidden`),
   "review mode auto-opens on the phone");
ok(await evalJs(`document.getElementById('swName').textContent === 'Lime Athletic' && document.getElementById('swCount').textContent === '1 / 26'`),
   "slide 1 chrome reads Lime Athletic · 1 / 26");
ok(await evalJs(`document.getElementById('switcher').dataset.theme === 'lime'`),
   "the whole overlay wears the active theme");
await waitFor(() => evalJs(`(() => {
  const l = [...document.querySelectorAll('.sw__slide')].find(x => x.dataset.swIdx === '0');
  return !!l && l.querySelector('iframe')?.contentWindow?.__appDemoReady === true;
})()`).catch(() => false), { label: "switcher slide app render" });
ok(await evalJs(`(() => {
  const l = [...document.querySelectorAll('.sw__slide')].find(x => x.dataset.swIdx === '0');
  const f = l?.querySelector('iframe');
  return !!f && getComputedStyle(f).width === '390px' && !!f.contentDocument.querySelector('#home .bd-tcard');
})()`),
   "slide renders the real app screen full-bleed (bare appdemo inside)");
ok(await evalJs(`document.body.style.overflow === 'hidden'`),
   "gallery scroll locked under the switcher");
const geo = JSON.parse(await evalJs(`(() => {
  const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b ? { x: +b.x.toFixed(0), y: +b.y.toFixed(0), w: +b.width.toFixed(0), h: +b.height.toFixed(0) } : null; };
  return JSON.stringify({ panel: r('.sw__panel'), dots: r('.sw__dots'), name: r('.sw__name'), grid: r('.sw__grid') });
})()`));
ok(geo.panel && geo.panel.y + geo.panel.h <= 844 && geo.panel.x >= 0 && geo.panel.x + geo.panel.w <= 390,
   `chrome panel sits fully inside the 390px viewport (${geo.panel.w}×${geo.panel.h} at ${geo.panel.x},${geo.panel.y})`);
ok(geo.dots && geo.dots.w <= 390 && geo.dots.h <= 16,
   `26 progress dots fit in one row (${geo.dots.w}px wide)`);
ok(geo.grid && geo.grid.y <= 60, `⊞ exit reachable in the top corner (${geo.grid.x},${geo.grid.y})`);
await shotViewport("review-worn_phone");
/* shot() resets metrics to desktop — the phone profile drives the gesture
   pipeline, so re-assert it before dispatching touches */
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

/* synthetic swipes over the DevTools Protocol */
async function swipe(x0, y0, x1, y1, { steps = 4, hold = 80 } = {}) {
  const pt = (x, y) => ({ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 2, radiusY: 2, force: 1 });
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt(x0, y0)] });
  for (let s = 1; s <= steps; s++) {
    await send("Input.dispatchTouchEvent", { type: "touchMove",
      touchPoints: [pt(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps)] });
    await Bun.sleep(hold / steps);
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/* mid-swipe: finger down, slide dragging with the finger */
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 330, y: 420, id: 1 }] });
await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 180, y: 420, id: 1 }] });
await sleep(120);
const dragT = await evalJs(`(() => {
  const l = [...document.querySelectorAll('.sw__slide')].find(x => x.classList.contains('is-cur'));
  return (l?.style.transform || '').match(/-?[\\d.]+/)?.[0] ?? '';
})()`);
ok(Math.abs(Number(dragT)) > 40, `the slide drags with the finger mid-swipe (translateX ${dragT}px)`);
await shotViewport("review-midswipe_phone");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 110, y: 420, id: 1 }] });
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await sleep(500);
ok(await evalJs(`window.__rwfReview.cur() === 1 && document.getElementById('swName').textContent === 'Gold Arcade'`),
   "left swipe (with momentum) advances to the next theme");
ok(await evalJs(`document.getElementById('swCount').textContent === '2 / 26' && document.getElementById('switcher').dataset.theme === 'gold'`),
   "count chip + overlay theme track the swipe");
ok(await evalJs(`document.querySelectorAll('.sw__dot.is-on').length === 1 && document.querySelector('.sw__dot.is-on').dataset.swDot === '1'`),
   "progress dot follows the slide");

/* the pick heart → localStorage shortlist */
await evalJs(`document.getElementById('swPick').click(); true`);
await sleep(120);
ok(await evalJs(`JSON.parse(localStorage.getItem('rwf.styles.shortlist')).join(',') === 'gold'`),
   "♥ pick persists to localStorage rwf.styles.shortlist");
ok(await evalJs(`document.getElementById('swPick').getAttribute('aria-pressed') === 'true' && document.getElementById('swPick').textContent.includes('♥')`),
   "pick heart fills for the current theme");
ok(await evalJs(`document.querySelector('.sw__dot.is-picked').dataset.swDot === '1'`),
   "picked slide's progress dot wears a ring");

/* arrows still cycle inside the switcher (gallery defers to it) */
await evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); true`);
await sleep(500);
ok(await evalJs(`window.__rwfReview.cur() === 2 && document.getElementById('swName').textContent === 'Sunset Swiss'`),
   "arrow keys still cycle themes inside review mode");
ok(await evalJs(`window.__rwfStyles.active() === null`),
   "gallery preview logic stays out of the way while review mode is open");

/* AA contrast of the switcher chrome — name/desc/pick on their panels */
const aa = JSON.parse(await evalJs(`(() => {
  const parse = (s) => {
    const n = (s.match(/[\\d.]+/g) || []).map(Number);
    /* color-mix() serializes as color(srgb r g b / a) with 0–1 floats */
    if (String(s).startsWith("color(") && n.length >= 3) { for (let i = 0; i < 3; i++) n[i] = Math.round(n[i] * 255); if (n.length === 3) n.push(1); }
    return n;
  };
  const blend = (f, b) => f.slice(0, 3).map((c, i) => c * (f[3] ?? 1) + b[i] * (1 - (f[3] ?? 1)));
  const lum = (c) => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const swEl = document.getElementById('switcher');
  const rootBg = parse(getComputedStyle(swEl).backgroundColor);
  const ratio = (el, container) => {
    const cs = getComputedStyle(el);
    const over = blend(parse(getComputedStyle(container).backgroundColor), rootBg);
    const bg = blend(parse(cs.backgroundColor), over);   /* the element's OWN fill first */
    const fg = blend(parse(cs.color), bg);
    return +(((Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05))).toFixed(2);
  };
  const panel = document.querySelector('.sw__panel');
  return JSON.stringify({ name: ratio(document.getElementById('swName'), panel),
                          desc: ratio(document.getElementById('swDesc'), panel),
                          pick: ratio(document.getElementById('swPick'), panel),
                          count: ratio(document.getElementById('swCount'), document.querySelector('.sw__top')) });
})()`));
ok(aa.name >= 4.5 && aa.desc >= 4.5 && aa.pick >= 4.5 && aa.count >= 4.5,
   `switcher chrome keeps AA contrast in every kit (name ${aa.name} · desc ${aa.desc} · pick ${aa.pick} · count ${aa.count})`);

/* swipe ↑ exits to the gallery */
await swipe(195, 660, 195, 230);
await sleep(400);
ok(await evalJs(`window.__rwfReview.isOpen() === false && document.getElementById('switcher').hidden === true`),
   "swipe up exits review mode to the gallery");
ok(await evalJs(`document.body.style.overflow === ''`),
   "gallery scroll unlocked after exit");

/* shortlist surfaces at the top of the gallery */
ok(await evalJs(`!document.getElementById('shortlist').hidden && document.getElementById('shortlistList').textContent.includes('Gold Arcade')`),
   "★ Picked for review row surfaces at the top of the gallery");
await shotViewport("shortlist_phone");
const summary = await evalJs(`window.__rwfReview.shortlistText()`);
ok(summary.includes("Gold Arcade") && summary.includes("arcade cabinet") && summary.includes("1 picked"),
   "shortlist summary generates (names + describe-it lines)");
await evalJs(`document.getElementById('shortlistCopy').click(); true`);
await sleep(200);
ok(await evalJs(`document.getElementById('shortlistCopy').textContent.includes('copied') || document.getElementById('shortlistCopy').textContent.includes('⧉')`),
   "copy button runs clean (clipboard or fallback)");
await evalJs(`document.getElementById('shortlistClear').click(); true`);
await sleep(120);
ok(await evalJs(`document.getElementById('shortlist').hidden === true && localStorage.getItem('rwf.styles.shortlist') === '[]'`),
   "clear picks empties the shortlist row");

/* forced open via ?review=1 → resumes at the first picked theme */
await evalJs(`window.__rwfReview.pick('forest'); true`);
await send("Page.navigate", { url: `${BASE}/styles/?review=1` });
await waitFor(() => evalJs(`window.__rwfReviewReady === true`).catch(() => false), { label: "?review=1 reload" });
await sleep(2200);
ok(await evalJs(`window.__rwfReview.isOpen() === true`),
   "?review=1 forces review mode open (desktop too)");
ok(await evalJs(`window.__rwfReview.cur() === 4 && document.getElementById('swName').textContent === 'Forest Retro'`),
   "review mode resumes at the first picked theme (Forest Retro)");
ok(await evalJs(`document.getElementById('swPick').getAttribute('aria-pressed') === 'true'`),
   "picked state survives the reload");
/* ⊞ exits too, and exit suppresses auto-open for the session */
await evalJs(`document.getElementById('swExit').click(); true`);
await sleep(250);
ok(await evalJs(`window.__rwfReview.isOpen() === false`),
   "⊞ button exits review mode");
ok(await evalJs(`sessionStorage.getItem('rwf.styles.switcher') === 'off' && window.__rwfReview.autoWanted() === false`),
   "exiting suppresses auto-open for the rest of the session");
await evalJs(`localStorage.removeItem('rwf.styles.shortlist'); true`);
ok(consoleErrors.length === 0, `phone review mode: zero console errors${consoleErrors.length ? " — " + consoleErrors[0] : ""}`);

/* restore neutral state for the next run */
await send("Emulation.setTouchEmulationEnabled", { enabled: false });
await send("Emulation.setDeviceMetricsOverride", { width: 1480, height: 1100, deviceScaleFactor: 1, mobile: false });

/* ── done ────────────────────────────────────────────────────────────── */
console.log(`\n${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILURES`}: ${passed}/${step} checks`);
try { proc.kill("SIGTERM"); } catch {}
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
server.stop(true);
process.exit(failures.length === 0 ? 0 : 1);
