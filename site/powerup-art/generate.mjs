/* ═══════════════════════════════════════════════════════════════════════
   RWF POWER-UP ART · THE BUILD (run: bun site/powerup-art/generate.mjs)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The local media studio: renders every power-up symbol (apps/
   sot-engine.js CARD_CATALOG) in every style kit to
     gen/<style>/<card>.svg   — the vector master (compact, print-safe)
     gen/<style>/<card>.png   — 512×512 raster (the committed asset)
     gen/<style>/_back.svg|.png — the deck's reverse, per style
     gen/chips/<card>.png     — 96×96 poster-master chips (v4 app, 2×)
     gen/manifest.json        — the index the review page reads
   Assets are generated ONCE and committed — the page never generates at
   runtime. The recorder (svg-recorder.js) turns the constrained canvas
   code into SVG; rasterization goes through headless chromium (no
   canvas dep, no image API — procedural IS the studio).
   ═══════════════════════════════════════════════════════════════════════ */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const GEN = join(HERE, "gen");
const CHROMIUM = "/usr/bin/chromium";
const PORT = 4311;

const { CARD_CATALOG } = await import(join(ROOT, "apps", "sot-engine.js"));
const { SVGRecorder } = await import("./svg-recorder.js");
const { STYLES, STYLE_IDS, drawPoster, drawBack } = await import("./styles.js");

const CARDS = Object.values(CARD_CATALOG);
const SIZE = 512;
const CHIP = 96;
const BACK = "_back";

/* ── 1 · render the SVG masters ──────────────────────────────────────── */
console.log(`▸ rendering ${CARDS.length} symbols × ${STYLES.length} styles → SVG`);
mkdirSync(GEN, { recursive: true });
const svgJobs = [];   // { url-path, abs-path }
for (const style of STYLES) {
  const dir = join(GEN, style.id);
  mkdirSync(dir, { recursive: true });
  for (const card of CARDS) {
    const rec = new SVGRecorder(SIZE, SIZE);
    drawPoster(rec, style.id, card.kind, SIZE);
    const p = join(dir, `${card.kind}.svg`);
    writeFileSync(p, rec.toString());
    svgJobs.push({ url: `/gen/${style.id}/${card.kind}.svg`, abs: p.replace(/\.svg$/, ".png"), size: SIZE });
  }
  const rec = new SVGRecorder(SIZE, SIZE);
  drawBack(rec, style.id, SIZE);
  writeFileSync(join(dir, `${BACK}.svg`), rec.toString());
  svgJobs.push({ url: `/gen/${style.id}/${BACK}.svg`, abs: join(dir, `${BACK}.png`), size: SIZE });
}
// v4 chips — the poster master at 96px (displayed ~48px → crisp at 2×)
const chipDir = join(GEN, "chips");
mkdirSync(chipDir, { recursive: true });
for (const card of CARDS) {
  const rec = new SVGRecorder(CHIP, CHIP);
  drawPoster(rec, "poster", card.kind, CHIP);
  writeFileSync(join(chipDir, `${card.kind}.svg`), rec.toString());
  svgJobs.push({ url: `/gen/chips/${card.kind}.svg`, abs: join(chipDir, `${card.kind}.png`), size: CHIP });
}
console.log(`  ${svgJobs.length} SVG masters written`);

/* ── 2 · rasterize via headless chromium (CDP, no deps) ──────────────── */
const rasterHtml = `<!doctype html><meta charset="utf-8"><title>raster</title>
<canvas id="c"></canvas><script>
window.raster = async (url, size) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.getElementById("c");
  c.width = size; c.height = size;
  const g = c.getContext("2d");
  g.clearRect(0, 0, size, size);
  g.drawImage(img, 0, 0, size, size);
  return c.toDataURL("image/png");
};
</script>`;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === "/") return new Response(rasterHtml, { headers: { "content-type": "text/html" } });
    const f = Bun.file(join(HERE, p.replace(/^\//, "")));
    if (await f.exists()) {
      const type = p.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
      return new Response(f, { headers: { "content-type": type, "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  },
});

const PROFILE = `/tmp/rwf-powerup-gen-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  "--remote-debugging-port=4312", `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions", "--window-size=600,600",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
const killChromium = () => { try { proc.kill("SIGKILL"); } catch {} };
process.on("exit", () => { killChromium(); server.stop(true); });

async function waitFor(fn, { timeout = 20000, every = 150, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await Bun.sleep(every);
  }
}
await waitFor(async () => (await fetch(`http://127.0.0.1:4312/json/version`).then((r) => r.ok).catch(() => false)), { label: "chromium devtools" });

const tab = await fetch(`http://127.0.0.1:4312/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
await send("Runtime.enable");
await send("Page.enable");
await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
await waitFor(async () => (await evalJs(`typeof window.raster === 'function'`)) === true, { label: "raster page ready" });

console.log(`▸ rasterizing ${svgJobs.length} PNGs (chromium, ${SIZE}px + ${CHIP}px chips)`);
let done = 0;
for (const job of svgJobs) {
  const dataUrl = await evalJs(`window.raster('${job.url}', ${job.size})`);
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error(`raster failed for ${job.url}`);
  }
  writeFileSync(job.abs, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
  done++;
  if (done % 36 === 0) console.log(`  ${done}/${svgJobs.length}`);
}
console.log(`  ${done}/${svgJobs.length} PNGs written`);

/* ── 3 · manifest (the review page reads this) ───────────────────────── */
const manifest = {
  generatedAt: new Date().toISOString(),
  engine: "apps/sot-engine.js CARD_CATALOG",
  styles: STYLES.map((s) => ({ id: s.id, name: s.name, tagline: s.tagline, desc: s.desc })),
  chips: { dir: "chips", size: CHIP, note: "poster master · v4 app icons (2x)" },
  cards: CARDS.map((c) => ({
    id: c.kind, name: c.name, family: c.family, rarity: c.rarity,
    files: Object.fromEntries(STYLE_IDS.map((s) => [s, { svg: `gen/${s}/${c.kind}.svg`, png: `gen/${s}/${c.kind}.png` }])),
  })),
  backs: Object.fromEntries(STYLE_IDS.map((s) => [s, `gen/${s}/${BACK}.png`])),
};
writeFileSync(join(GEN, "manifest.json"), JSON.stringify(manifest, null, 2));

killChromium();
server.stop(true);
console.log(`✓ power-up art gen complete — ${CARDS.length}×${STYLES.length} posters + backs + ${CARDS.length} chips + manifest`);
