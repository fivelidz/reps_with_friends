/* ═══════════════════════════════════════════════════════════════════════
   WIKI FEEDBACK E2E — the founder's-crew-notes loop end to end (2026-09-11).
     0. module leg: apps/api/src/feedback.ts directly (the same functions
        serve.ts's fallback runs) — validation, dedupe, ordering.
     1. store leg: the API on :4174 — spawned here with a TEMP store when
        free (markers then stay out of the real notes box); if an API is
        already running, it's used as-is and markers are tagged page
        "e2e-check" (harmless noise, printed at the end).
     2. through-serve.ts leg: POST /feedback → GET /feedback?page= →
        GET /feedback/recent (the widget's exact wire contract).
     3. browser leg: headless Chromium — the /wiki widget injects, accepts a
        typed note, renders it; /wiki/feedback admin shows it in the stream,
        the page filter works, the index stat fills. Zero console errors.
   Run: bun apps/wiki/test/feedback-e2e.mjs   (serve.ts must be up on :4173)
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";

const SERVE = "http://127.0.0.1:4173";
const API = "http://127.0.0.1:4174";
const STAMP = Date.now();
const MARK = `e2e feedback probe ${STAMP}`;
const MARK2 = `e2e second probe ${STAMP}`;

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── 0 · module leg (the serve.ts fallback path) ───────────────────────── */
console.log(`\nFEEDBACK E2E 0/3 — store module (serve.ts fallback logic)\n`);
process.env.RWF_FEEDBACK_DB = `/tmp/rwf-feedback-e2e-${STAMP}.json`;
const fb = await import("../../../apps/api/src/feedback.ts");
{
  const miss = fb.addFeedback({ text: "   " });
  ok(!miss.ok && miss.status === 400, "module: blank text rejected 400");
  const tooBig = fb.addFeedback({ text: "x".repeat(1001) });
  ok(!tooBig.ok && tooBig.status === 400, "module: >1000 chars rejected 400");
  const a = fb.addFeedback({ page: "modpage", text: "module note A", name: "" });
  ok(a.ok && !a.deduped && a.entry.name === "anon", "module: note stored, name → anon");
  const dupe = fb.addFeedback({ page: "modpage", text: "module note A" });
  ok(dupe.ok && dupe.deduped, "module: same page+text → deduped");
  fb.addFeedback({ page: "modpage", text: "module note B" });
  const { comments } = fb.listForPage("modpage");
  ok(comments.length === 2 && comments[0].text === "module note B",
     "module: newest-first ordering (B before A)");
}

/* ── 1 · ensure the API on :4174 ───────────────────────────────────────── */
console.log(`\nFEEDBACK E2E 1/3 — the API on :4174\n`);
let apiProc = null;
let sharedStore = false;
try {
  const h = await fetch(`${API}/health`, { signal: AbortSignal.timeout(1200) });
  sharedStore = h.ok;
} catch { sharedStore = false; }

if (!sharedStore) {
  const tmpDb = `/tmp/rwf-feedback-e2e-api-${STAMP}.json`;
  apiProc = spawn("bun", ["apps/api/src/main.ts"], {
    env: { ...process.env, PORT: "4174", RWF_FEEDBACK_DB: tmpDb },
    stdio: ["ignore", "ignore", "ignore"],
  });
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    try { up = (await fetch(`${API}/health`, { signal: AbortSignal.timeout(800) })).ok; }
    catch { await Bun.sleep(200); }
  }
  ok(up, "spawned apps/api on :4174 (temp store — real notes box untouched)");
  ok((await (await fetch(`${API}/health`)).json()).service === "rwf-api", "health says rwf-api");
} else {
  console.log("  · API already running on :4174 — using it (markers land in the");
  console.log("    real store under page \"e2e-check\"; harmless, noted here)");
}

/* ── 2 · through serve.ts :4173 (the widget's wire contract) ───────────── */
console.log(`\nFEEDBACK E2E 2/3 — through serve.ts (:4173)\n`);
{
  const r1 = await fetch(`${SERVE}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page: "e2e-check", name: "walker", text: MARK }),
  });
  ok(r1.status === 201, `POST /feedback → 201 (got ${r1.status})`);
  const b1 = await r1.json().catch(() => ({}));
  ok(b1.ok === true && typeof b1.id === "string" && b1.id.startsWith("fb_"), "POST returns ok + fb_ id");

  const r2 = await fetch(`${SERVE}/feedback?page=e2e-check`);
  const b2 = await r2.json().catch(() => ({}));
  ok(r2.status === 200 && b2.page === "e2e-check", "GET /feedback?page= → 200");
  ok((b2.count ?? 0) >= 1 && b2.comments[0]?.text === MARK,
     "page stream has the marker, newest first");

  await fetch(`${SERVE}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page: "e2e-check", name: "walker", text: MARK2 }),
  });
  const r3 = await fetch(`${SERVE}/feedback/recent?limit=50`);
  const b3 = await r3.json().catch(() => ({}));
  const iMark = (b3.comments ?? []).findIndex((c) => c.text === MARK);
  const iMark2 = (b3.comments ?? []).findIndex((c) => c.text === MARK2);
  ok(r3.status === 200 && iMark >= 0, "GET /feedback/recent shows the first marker");
  ok(iMark2 !== -1 && iMark2 < iMark, "recent stream: second note sorts above the first");

  const dupe = await (await fetch(`${SERVE}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page: "e2e-check", text: MARK2 }),
  })).json().catch(() => ({}));
  ok(dupe.deduped === true, "re-posting the same text over the wire → deduped:true");

  const bad = await fetch(`${SERVE}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page: "e2e-check", text: "" }),
  });
  ok(bad.status === 400, "blank text → 400 over the wire");

  const noPage = await fetch(`${SERVE}/feedback`);
  ok(noPage.status === 400, "GET /feedback without ?page → 400");
}

/* ── 3 · browser leg (headless Chromium, walk.mjs harness) ─────────────── */
console.log(`\nFEEDBACK E2E 3/3 — headless browser (widget + admin)\n`);
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9235;
const PROFILE = `/tmp/rwf-feedback-e2e-${STAMP}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=1280,900",
  `--user-data-dir=${PROFILE}`, "--no-first-run", "--disable-extensions", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});

async function waitFor(fn, label, timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) throw new Error(`timeout: ${label}`);
    await Bun.sleep(200);
  }
}
await waitFor(async () => {
  try { return (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok; } catch { return false; }
}, "chromium devtools");

const tab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then(r => r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pending = new Map(); const consoleErrors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id); pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consoleErrors.push(`console.error: ${m.params.args.map(a => a.value ?? a.description ?? "").join(" ").slice(0, 200)}`);
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ""}`.slice(0, 200));
  } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    consoleErrors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`.slice(0, 200));
  }
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

// 3a · the widget on a wiki page — injects, posts a typed note, renders it
await send("Page.navigate", { url: `${SERVE}/wiki/status.html` });
await Bun.sleep(900);
const widget = await evalJs(`(() => {
  const fbx = document.getElementById('feedback');
  return {
    present: !!fbx,
    hasForm: !!fbx?.querySelector('form.fbx__form'),
    hasNav: [...document.querySelectorAll('.wnav__link')].some(a => a.textContent.includes('Feedback')),
    beforeFooter: fbx && document.querySelector('footer.wfoot') ? fbx.nextElementSibling === document.querySelector('footer.wfoot') : null,
  };
})()`);
ok(widget.present && widget.hasForm, "status.html — comment widget injected with form");
ok(widget.hasNav, "nav carries the 📝 Feedback link");
ok(widget.beforeFooter === true, "widget sits at the page bottom (before the footer)");

const browserMark = `browser note ${STAMP}`;
await evalJs(`(() => {
  const fbx = document.getElementById('feedback');
  fbx.querySelector('.fbx__name').value = 'browser-bot';
  const ta = fbx.querySelector('textarea');
  ta.value = ${JSON.stringify(browserMark)};
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  fbx.querySelector('form.fbx__form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return true;
})()`);
let noted = null;
for (let i = 0; i < 30; i++) {
  await Bun.sleep(400);
  noted = await evalJs(`(() => {
    const s = document.querySelector('#feedback .fbx__status');
    const cards = [...document.querySelectorAll('#feedback .fbx__ctext')].map(n => n.textContent);
    return { status: s?.textContent ?? '', ok: s?.classList.contains('fbx__status--ok') ?? false,
             hasCard: cards.some(t => t.includes(${JSON.stringify(browserMark)})) };
  })()`);
  if (noted.ok && noted.hasCard) break;
}
ok(noted?.ok === true, `widget POST → success status ("${noted?.status ?? ""}")`);
ok(noted?.hasCard === true, "the typed note appears in the page's comment list");

// 3b · the admin view — stream shows it, filter works, count stat fills
await send("Page.navigate", { url: `${SERVE}/wiki/feedback` });
await Bun.sleep(1000);
let admin = null;
for (let i = 0; i < 25; i++) {
  admin = await evalJs(`(() => {
    const root = document.getElementById('fbAdmin');
    const texts = [...root.querySelectorAll('.fbx__ctext')].map(n => n.textContent);
    const count = root.querySelector('.fbx__streamcount')?.textContent ?? '';
    const options = [...root.querySelectorAll('.fbx__filter option')].map(o => o.value);
    return { texts, count, options, hasStream: root.querySelectorAll('.fbx__comment').length > 0 };
  })()`);
  if (admin.hasStream && admin.texts.some(t => t.includes(browserMark))) break;
  await Bun.sleep(400);
}
ok(admin.hasStream, "admin stream rendered with notes");
ok(admin.texts.some(t => t.includes(browserMark)), "admin stream shows the browser-posted note");
ok(admin.options.includes("all") && admin.options.includes("e2e-check"),
   `page filter populated from the data (${admin.options.join(", ")})`);
ok(/\d+ shown/.test(admin.count) || admin.count.includes("shown"), `stream count line live ("${admin.count}")`);

// filter to e2e-check — the picked page must still contain the browser note
await evalJs(`(() => {
  const f = document.querySelector('#fbAdmin .fbx__filter');
  // the browser note was posted FROM status.html, so its page is "status"
  f.value = 'status';
  f.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
await Bun.sleep(900);
const filtered = await evalJs(`(() => {
  const root = document.getElementById('fbAdmin');
  return {
    texts: [...root.querySelectorAll('.fbx__ctext')].map(n => n.textContent),
    count: root.querySelector('.fbx__streamcount')?.textContent ?? '',
  };
})()`);
ok(filtered.texts.some(t => t.includes(browserMark)), "filter #status keeps the browser-posted note");
ok(filtered.count.includes("#status"), `filtered count line ("${filtered.count}")`);

// 3c · the index stat
await send("Page.navigate", { url: `${SERVE}/wiki/` });
await Bun.sleep(900);
const stat = await evalJs(`document.querySelector('[data-fb-total]')?.textContent`);
ok(/^\d+$/.test(stat ?? ""), `index stat shows a numeric total ("${stat}")`);

ok(consoleErrors.length === 0, `zero console errors (${consoleErrors.length ? consoleErrors.join(" | ") : "clean"})`);

ws.close();
try { proc.kill("SIGTERM"); } catch {}
if (apiProc) { try { apiProc.kill("SIGTERM"); } catch {} }

console.log(`\n═══ ${passed}/${step} checks passed ${failures.length ? "— FAILURES:\n  " + failures.join("\n  ") : "— ALL GREEN"} ═══\n`);
process.exit(failures.length ? 1 : 0);
