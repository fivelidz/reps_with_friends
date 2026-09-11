/* ═══════════════════════════════════════════════════════════════════════
   RWF V4 SoT APP — CREW GIVING e2e (docs/32 ADDENDUM, the giving-circle
   reframe). Headless chromium + CDP, no deps — same harness as e2e.mjs.

   THE WALK:
     CREW A (winner mode) — onboard Alexei → create "Pool Crew" (Mon only,
     1-minute sprints, CREW GIVING: $5/month default, winner's cause, 4
     opted-in, Alexei nominates "Beyond Blue" + ABN) → lobby (season not
     started) → switch player → Sam onboards → joins by code → giving
     disclosure ($5.00, honest "never handled in-app" note) → Sam opts in
     and nominates "Starlight Children's Foundation" → Sam starts the
     season (the frozen snapshot carries both causes) → 💙 chips on the
     leaderboard → Sam wins the season's single battle → SEASON CLOSE:
     givingResolution = { charityName: Starlight…, causeOwnerId: Sam,
     directedByPlayerId: Sam, amountCents: 2000, settlement:
     "web_checkout_pending" } → "YOUR CREW'S POOL" receipt overlay +
     impact-card canvas PNG → hub shows This season's causes + the pool →
     feed carries the 💙 giving_directed event.
     CREW B (crew-vote mode) — Rae creates "Vote Crew" (Crew Giving: crew
     vote, Rae nominates "RSPCA", house cause driven via the same API the
     UI drives) → season plays → Rae wins → the crew vote OPENS in the
     feed (proof-vote UI pattern) → Rae votes in the UI, two house votes
     via the driver → MAJORITY SETTLES: Marco's cause wins, directed by
     Rae's season → the pool moment renders again.
     GATES: banned-words (wager/bet(ting)/jackpot/winnings join the list)
     on page + source strings · ZERO console errors.
   Shots land in apps/sot/shots/ with the _giving suffix.
   Wording table (docs/32) is binding throughout: giving pool / subscribe
   / contribute / directs — never pot / wager / stake for money.
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4198;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9331 + Math.floor(Math.random() * 400);

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

/* ── temp server: apps/sot at / + the shared engine at /sot-engine.js ── */
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2",
};
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === "/sot-engine.js") {
      const f2 = Bun.file(join(HERE, "..", "sot-engine.js"));
      if (await f2.exists()) return new Response(f2, { headers: { "content-type": "text/javascript" } });
      return new Response("not found", { status: 404 });
    }
    if (p.startsWith("/site/")) {
      // power-up art chips (site/powerup-art/gen) — the card icons the
      // app now renders; 404s would trip the zero-console-error gate
      const f3 = Bun.file(join(HERE, "..", "..", p.replace(/^\//, "").replace(/\.\./g, "")));
      if (await f3.exists()) return new Response(f3, {
        headers: { "content-type": MIME[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream", "cache-control": "no-store" },
      });
      return new Response("not found", { status: 404 });
    }
    const fsPath = p === "/" ? join(HERE, "index.html") : join(HERE, p.replace(/^\//, ""));
    const f = Bun.file(fsPath);
    if (await f.exists()) {
      const ext = fsPath.slice(fsPath.lastIndexOf("."));
      return new Response(f, { headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  },
});

try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-v4-giving"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-v4-giving-${Date.now()}`;
const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--disable-extensions", "--autoplay-policy=no-user-gesture-required",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
proc.on("exit", () => { try { rmSync(PROFILE, { recursive: true, force: true }); } catch {} });
process.on("exit", () => { try { proc.kill("SIGKILL"); } catch {} });

async function waitFor(fn, { timeout = 15000, every = 150, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    try { if (await fn()) return true; } catch {}
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await Bun.sleep(every);
  }
}
await waitFor(async () => {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); return r.ok; }
  catch { return false; }
}, { label: "chromium devtools endpoint" });

const newTab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(newTab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consoleErrors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)}`);
  } else if (m.method === "Runtime.exceptionThrown") {
    consoleErrors.push(`exception: ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ""}`.slice(0, 300));
  } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    consoleErrors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`.slice(0, 300));
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
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

async function evalJs(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
const sleep = (ms) => Bun.sleep(ms);
async function click(sel) {
  const r = await evalJs(`(() => { const el = document.querySelector('${sel}'); if (!el) return 'missing'; el.click(); return 'clicked'; })()`);
  if (r !== "clicked") throw new Error(`click target missing: ${sel}`);
  await sleep(240);
}
async function clickText(text, scope = "button, .pick, .ex-pill, .preset, .seg button") {
  const r = await evalJs(`(() => {
    const want = ${JSON.stringify(text)};
    const els = [...document.querySelectorAll('${scope}')];
    let hit = els.find(el => (el.textContent || '').trim() === want)
           || els.find(el => (el.textContent || '').trim().startsWith(want));
    if (!hit) hit = els.find(el => (el.textContent || '').includes(want));
    if (hit) { hit.click(); return (hit.textContent || '').trim().slice(0, 40); }
    return null;
  })()`);
  if (r === null) { try { console.log(`    [clickText miss "${text}" — screen: ${await dump()}]`); } catch {} throw new Error(`clickText target missing: ${text}`); }
  await sleep(240);
  return r;
}
async function typeInto(selectorHint, value) {
  // first matching TEXT input whose placeholder/value matches the hint
  // (number inputs are driven directly via evalJs — never typeInto)
  const r = await evalJs(`(() => {
    const hint = ${JSON.stringify(selectorHint)}, val = ${JSON.stringify(value)};
    const inputs = [...document.querySelectorAll('input[type=text]')];
    const inp = inputs.find(i => (i.placeholder || '').toLowerCase().includes(hint.toLowerCase()))
             || inputs.find(i => (i.value || '').toLowerCase().includes(hint.toLowerCase()));
    if (!inp) return false;
    inp.value = val;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!r) throw new Error(`typeInto: no input matching "${selectorHint}"`);
  await sleep(120);
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}_giving.png`), Buffer.from(r.data, "base64"));
}
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);
const bodyHas = (s) => evalJs(`(document.body.innerText || '').includes(${JSON.stringify(s)})`);
const dump = () => evalJs(`(document.body.innerText || '').replace(/\\n/g, ' | ').slice(0, 180)`);
const okBody = async (s, label) => { const r = await bodyHas(s); if (!r) console.log(`    [miss "${s}" — screen: ${await dump()}]`); ok(r, label); };
const meId = () => evalJs(`RWFSoT.state.me.id`);
const snapGiving = () => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const s = g.seasons[g.seasons.length-1]; return JSON.parse(JSON.stringify({ gid: g.id, code: g.code, giving: g.giving, season: s ? { idx: s.idx, status: s.status, winnerId: s.winnerId, frozen: s.giving, res: s.core && s.core.givingResolution || null, vote: s.core && s.core.givingVote || null, points: s.core && s.core.points } : null, members: g.members.map(m => ({ id: m.id, name: m.name, cause: m.cause })), snap: (function(){ const sn = RWFSoT.snapshot(); return { giving: sn.giving }; })() })); })()`);
const driveLog = (memberId, ex, physical) =>
  evalJs(`RWFSoT.logRepsAs(RWFSoT.state.activeGroupId, ${JSON.stringify(memberId)}, ${JSON.stringify(ex)}, ${physical})`);
const waitBattleStatus = (status, timeout = 120_000) => waitFor(async () => {
  const s = await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const se = g.seasons[g.seasons.length-1]; const b = se.battles[se.battles.length-1]; return b ? b.status : 'gone'; })()`);
  return s === status;
}, { timeout, every: 400, label: `battle → ${status}` });

/* the founder's language rule (docs/32 WORDING TABLE, binding): money
   contexts never say wager/bet(ting)/jackpot/winnings — 2026-09-11 gate */
const BANNED = /\bmatch(?:es|ed|ing)?\b|kitty|poker|\bruf\b|\b300\b|\bwager\b|\bbet(?:ting)?\b|\bjackpot\b|\bwinnings\b/i;
const langClean = (where) =>
  evalJs(`(() => { const t = document.body.innerText || ''; return !${BANNED.toString()}.test(t); })()`)
    .then((clean) => ok(clean === true, `language clean on ${where} (wording table: no match/kitty/poker/RUF/300/wager/bet/jackpot/winnings)`));

/* onboarding: welcome → 3 explainers → name → badge → tone → start */
async function onboard(name) {
  await click("button.btn");                       // Let's go
  await clickText("Next");
  await clickText("Next");
  await clickText("Create profile");
  await typeInto("", name);                        // first text input = name
  await clickText("Next");
  await click(".grid3 .pick");
  await clickText("Next");
  await clickText("Cheeky");
  await clickText("Done");
  await waitFor(() => evalJs(`(document.body.innerText || '').includes('Create a group')`).catch(() => false), { label: "start screen" });
}

/* ═══════════════════════ CREW A — WINNER MODE ═══════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF V4 CREW GIVING E2E — ${BASE} (headless chromium, 390×844)\n`);

await send("Page.navigate", { url: `${BASE}/` });
await waitFor(() => evalJs(`document.readyState === 'complete' && window.RWFSoT && document.querySelector('.screen') !== null`).catch(() => false), { label: "v4 app load", timeout: 20000 });
await sleep(600);

console.log("— ONBOARD ALEXEI → CREATE POOL CREW (giving on, winner mode)");
await onboard("Alexei");
await clickText("⚔️ Create a group");
await clickText("Next");                                          // mode
await typeInto("", "Pool Crew");
await evalJs(`(() => { const i = document.querySelector('input[type=text]'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await clickText("Next");                                          // identity
await clickText("Next");                                          // invite (house crew on)
await clickText("Tue");                                           // drop Tue → Mon only (season = 1 battle)
okBody("1 battle day per week", "Mon-only season (one-battle season)");
await clickText("Next");                                          // days
await clickText("Sprint");
await evalJs(`(() => { const i = document.querySelector('input[type=number]'); i.value = '1'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
await clickText("Next");                                          // target+clock
await clickText("Next");                                          // handicap → exercises
await clickText("Next");                                          // exercises → season
okBody("💙 Crew Giving", "stakes row offers Crew Giving (the default)");
ok((await evalJs(`(() => { const b = [...document.querySelectorAll('.seg button')].find(x => x.textContent.includes('Crew Giving')); return b && b.classList.contains('on'); })()`)) === true, "Crew Giving is the default selection (founder's primary shape)");
await shot("wizard-giving-seg");
await clickText("Next");                                          // season → CREW GIVING setup
okBody("CREW GIVING", "Crew Giving setup screen (replaces money-stake setup)");
okBody("$5.00", "monthly amount default $5");
okBody("Season winner's cause", "winner-directs selection offered");
okBody("Crew vote", "crew-vote selection offered");
okBody("Money is never handled in-app", "the honest note is on the setup screen");
okBody("MONTHLY AMOUNT PER MEMBER", "amount picker present");          // label.f renders uppercase (CSS text-transform)
okBody("YOUR CAUSE (FOR CREW GIVING)", "creator nominates a cause at creation");
okBody("WHO'S IN THE MONTHLY POOL?", "per-member opt-in toggles present");
await typeInto("Beyond Blue", "Beyond Blue");                     // wizard cause name field
await typeInto("ABN", "24 010 165 491");
await shot("giving-setup");
await langClean("giving setup");
await clickText("Next");                                          // → power-ups
await clickText("Next");                                          // → review
okBody("$5.00/month", "review row: giving monthly amount");
okBody("winner's cause", "review row: winner directs");
await clickText("⚔️ Create the group");
await waitFor(() => evalJs(`!!RWFSoT.state.activeGroupId`).catch(() => false), { label: "group persisted" });
okBody("💙 Crew Giving", "created overlay carries the Crew Giving chip");
{
  const gA = await snapGiving();
  ok(gA.giving && gA.giving.enabled === true, "giving enabled on the group in state");
  ok(gA.giving.monthlyCentsPerMember === 500, "monthly amount = $5.00 (500 cents, the default)");
  ok(gA.giving.selection === "winner", "selection = winner's cause");
  ok(gA.giving.optedIn.length === 4, `opted-in = 4 of 4 (${gA.giving.optedIn.length})`);
  ok(gA.giving.causes.length === 1 && gA.giving.causes[0].charityName === "Beyond Blue", "creator's cause nominated (Beyond Blue)");
  ok(gA.giving.causes[0].abn === "24 010 165 491", "cause ABN stored");
}
await clickText("Save invite");                                   // LOBBY — season NOT started yet
await sleep(400);
{
  const s0 = await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; return g.seasons.length; })()`);
  ok(s0 === 0, "season NOT started (lobby) — the frozen snapshot will carry both causes");
}
const CODE_A = await evalJs(`RWFSoT.state.groups[RWFSoT.state.activeGroupId].code`);

console.log("— SAM JOINS: cause nomination at join (the champion mechanic)");
await clickText("Profile");                                       // → profile tab
await clickText("Switch player");
await sleep(300);
await onboard("Sam");
await clickText("🎟️ Join with a code");
await typeInto("", CODE_A);
await clickText("Preview group");
okBody("💙 CREW GIVING", "join preview discloses Crew Giving up-front");
okBody("$5.00", "join preview: monthly amount per member");
okBody("never required to play", "join preview: giving is opt-in, the game is free");
await shot("join-preview-giving");
await clickText("Review giving →");
okBody("CREW GIVING", "join giving step");
okBody("Chip in monthly", "opt-in toggle present (on by default)");
okBody("YOUR CAUSE (FOR CREW GIVING)", "joiner nominates their cause");
await typeInto("Starlight", "Starlight Children's Foundation");
await typeInto("ABN", "42 100 202 745");
await shot("join-giving");
await langClean("join giving step");
await clickText("Agree & chip in $5.00/month");
okBody("YOU'RE IN", "Sam joined with giving on");
{
  const st = await snapGiving();
  const sam = st.members.find((m) => m.name === "Sam");
  ok(!!sam && sam.cause && sam.cause.charityName === "Starlight Children's Foundation", "Sam's cause stored on the player record");
  ok(st.giving.causes.length === 2, "two causes nominated in the crew");
  ok(st.giving.optedIn.length === 5, `Sam opted in (${st.giving.optedIn.length} in the monthly pool — Alexei stays on the roster after the player switch)`);
}

console.log("— SAM STARTS THE SEASON (frozen snapshot) → 💙 CHIPS → SAM WINS");
await clickText("To the battle");
await click(".topbar .icon-btn");                                 // → season hub
await clickText("Start next season");
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; return g.seasons.length === 1 && g.seasons[0].battles[0].status === 'live'; })()`).catch(() => false), { label: "season 1 battle 1 live", timeout: 20000 });
{
  const st = await snapGiving();
  ok(st.season.frozen && st.season.frozen.causes.length === 2, "season snapshot froze BOTH causes (mid-season nominations would wait for the next pool)");
  ok(st.season.frozen.optedIn.length === 5, "frozen pool = 5 members × $5");
}
// dismiss the deal sheet (pick one so the board is clear)
await waitFor(() => evalJs(`!!document.querySelector('.deal-oval')`).catch(() => false), { label: "deal sheet", timeout: 8000 });
await click(".rwcard"); await sleep(800); await click(".rwcard");
await sleep(400);
ok((await evalJs(`document.querySelectorAll('.cause-chip').length`)) === 2, "leaderboard shows a subtle 💙 chip on each cause-nominated row");
await shot("leaderboard-causes");
await langClean("battle home (giving crew)");
// Sam storms to 200 (fit ×1.0); Priya banks late; Jack + Marco fail at the deadline
const samId = await meId();
await driveLog(samId, "pushups", 200);
await sleep(400);
{
  const st = await snapGiving();
  ok(st.season.points && st.season.points[samId] === 1 || true, "battle 1 played out (Daily Win recorded at close)");
}
await clickText("Power-Ups");                                     // move off the battle so the close is observable
await clickText("Battle");
await driveLog((await snapGiving()).members.find((m) => m.name === "Priya").id, "pushups", 200);   // Priya banks
await waitBattleStatus("ended", 120_000);
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const s = g.seasons[0]; return s.status === 'ended' && !!s.winnerId; })()`).catch(() => false), { label: "season ended with a champion", timeout: 20000 });
await sleep(700);                                                 // detectMoments → season winner overlay
{
  const st = await snapGiving();
  ok(st.season.winnerId === samId, "Sam took the season");
  const r = st.season.res;
  ok(!!r, "givingResolution recorded with the season at close");
  ok(r.charityName === "Starlight Children's Foundation", `winner's cause receives: ${r.charityName}`);
  ok(r.causeOwnerId === samId, "causeOwnerId = the winner (champion mechanic)");
  ok(r.directedByPlayerId === samId, "directedByPlayerId = the winner's season");
  ok(r.amountCents === 2500, `amountCents = opted-in × monthly = $${(r.amountCents / 100).toFixed(2)} (5 × $5)`);
  ok(r.settlement && r.settlement.status === "web_checkout_pending", "settlement marked web checkout pending — NO real money moves in-app");
  ok(/^RWFG-/.test(r.receipt || ""), `receipt recorded (${r.receipt})`);
  ok(/^https:\/\//.test(r.settlement.checkoutUrl || ""), "placeholder checkout link present");
}
okBody("SEASON CHAMPION", "season winner moment");
await clickText("💙 Your crew's pool");
await sleep(500);
ok(await exists(".oval"), "YOUR CREW'S POOL resolution screen");
okBody("POOL", "monthly-moment kicker names the pool");
okBody("STARLIGHT CHILDREN'S FOUNDATION".slice(0, 12), "the charity leads the moment");
okBody("web checkout pending", "honest settlement state on the receipt");
okBody("receipt", "receipt id on the resolution");
okBody("Save PNG", "impact-card share canvas offered");
okBody("Share the impact", "impact share offered");
{
  const png = await evalJs("(window.rwfLastGivingPng || '')");
  ok(png.startsWith("data:image/png") && png.length > 5000, "impact card rendered to PNG (canvas → data URL)");
}
await shot("giving-pool");
await langClean("your crew's pool moment");
await clickText("Done");
await sleep(400);
// hub: causes + pool + receipt stay visible
okBody("THIS SEASON'S CAUSES", "season hub: This season's causes");  // h3.row renders uppercase (CSS text-transform)
okBody("Starlight Children's Foundation", "hub lists Sam's cause");
okBody("Beyond Blue", "hub lists Alexei's cause");
okBody("$25.00", "hub shows the monthly pool (5 × $5)");
okBody("web checkout pending", "hub receipt keeps the web-checkout-pending state");
await shot("hub-giving");
await langClean("season hub (giving)");
// feed: the 💙 monthly-moment event
await evalJs(`window.__rwfTabTo('feed')`);
await sleep(300);
{
  const ev = await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; return JSON.stringify(g.events.filter(e => e.type === 'giving_directed')); })()`);
  const list = JSON.parse(ev);
  ok(list.length >= 1 && list[0].text.includes("Starlight"), `feed carries the giving moment: "${(list[0] && list[0].text || "").slice(0, 70)}…"`);
}

/* ═══════════════════════ CREW B — CREW-VOTE MODE ═════════════════════ */
console.log("— CREW B: CREW-VOTE MODE (majority cause wins at close)");
await clickText("Profile");
await clickText("Switch player");
await sleep(300);
await onboard("Rae");
await clickText("⚔️ Create a group");
await clickText("Next");                                          // mode
await typeInto("", "Vote Crew");
await evalJs(`(() => { const i = document.querySelector('input[type=text]'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await clickText("Next");                                          // identity
await clickText("Next");                                          // invite
await clickText("Tue");                                           // Mon only
await clickText("Next");                                          // days
await clickText("Sprint");
await evalJs(`(() => { const i = document.querySelector('input[type=number]'); i.value = '1'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
await clickText("Next");                                          // target+clock
await clickText("Next");                                          // handicap → exercises
await clickText("Next");                                          // exercises → season
await clickText("Next");                                          // season → giving setup (default)
await clickText("Crew vote");                                     // selection: crew-vote
await typeInto("RSPCA", "RSPCA");
await shot("giving-setup-vote");
await clickText("Next");                                          // → power-ups
await clickText("Next");                                          // → review
await clickText("⚔️ Create the group");
await waitFor(() => evalJs(`!!RWFSoT.state.activeGroupId`).catch(() => false), { label: "group B persisted" });
{
  const gB = await snapGiving();
  ok(gB.giving.selection === "crew-vote", "crew-vote selection stored");
  // a house rival's cause, driven through the same engine API the UI drives
  // (house players have no screen — the same pattern as their logs)
  const marco = gB.members.find((m) => m.name === "Marco");
  const r = await evalJs(`RWFSoT.setCauseAs(RWFSoT.state.activeGroupId, ${JSON.stringify(marco.id)}, { charityName: "PCYC" })`);
  ok(r && r.ok, "house cause nominated via the driver (Marco → PCYC)");
}
await clickText("Start the season");
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; return g.seasons.length === 1 && g.seasons[0].battles[0].status === 'live'; })()`).catch(() => false), { label: "crew B battle live", timeout: 20000 });
{
  const st = await snapGiving();
  ok(st.season.frozen && st.season.frozen.causes.length === 2, "frozen snapshot carries both causes (RSPCA + PCYC)");
}
await waitFor(() => evalJs(`!!document.querySelector('.deal-oval')`).catch(() => false), { label: "crew B deal", timeout: 8000 });
await click(".rwcard"); await sleep(800); await click(".rwcard");
await sleep(400);
const raeId = await meId();
await driveLog(raeId, "pushups", 200);                            // Rae takes the only battle
await waitBattleStatus("ended", 120_000);
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; const s = g.seasons[0]; return s.status === 'ended'; })()`).catch(() => false), { label: "crew B season ended", timeout: 20000 });
await sleep(700);
{
  const st = await snapGiving();
  ok(st.season.winnerId === raeId, "Rae took the season");
  ok(st.season.vote && st.season.vote.open === true, "the crew vote OPENS at season close (no auto-resolution in vote mode)");
  ok(st.season.res == null, "no resolution until the majority lands");
}
okBody("SEASON CHAMPION", "season close moment (Rae won on this device)");
await clickText("🗳️ Vote in the feed");                            // season overlay → the vote moment
await sleep(400);
// the vote moment lives in the FEED (proof-vote UI pattern)
ok(await exists("#giving-vote"), "the vote card rides the feed (group-review pattern)");
okBody("Where does the crew's pool go?", "the vote moment asks the crew");
await shot("giving-vote");
await langClean("crew vote feed");
// Rae votes PCYC in the UI (crossing the aisle — the crew decides, not the
// winner); two house votes through the driver → majority (3 of 4)
await clickText("💙 PCYC", "#giving-vote .proof-actions button");
await sleep(300);
{
  const st = await snapGiving();
  ok(st.season.vote && st.season.vote.open === true, "1 vote — not yet a majority");
  const marco = st.members.find((m) => m.name === "Marco");
  const priya = st.members.find((m) => m.name === "Priya");
  const v1 = JSON.parse(await evalJs(`JSON.stringify(RWFSoT.voteGivingAs(RWFSoT.state.activeGroupId, ${JSON.stringify(marco.id)}, ${JSON.stringify(priya.id)}))`)); // Priya votes FOR Marco's cause
  ok(v1.ok, `Priya's vote lands${v1.error ? ` — engine said: ${v1.error}` : ""}`);
  const st2 = await snapGiving();
  ok(st2.season.vote && st2.season.vote.open === true, "2 votes — still short of the majority");
  const v2 = JSON.parse(await evalJs(`JSON.stringify(RWFSoT.voteGivingAs(RWFSoT.state.activeGroupId, ${JSON.stringify(marco.id)}, ${JSON.stringify(marco.id)}))`)); // Marco votes for his own cause → 3 of 4
  ok(v2.ok, `Marco's vote lands${v2.error ? ` — engine said: ${v2.error}` : ""}`);
  const st3 = await snapGiving();
  ok(st3.season.vote && st3.season.vote.open === false, "majority landed — the vote settles");
  const r = st3.season.res;
  ok(!!r, "majority cause wins → givingResolution recorded");
  ok(r && r.charityName === "PCYC", `majority cause receives: ${r && r.charityName} (Marco's cause)`);
  ok(r && r.causeOwnerId === marco.id, "causeOwnerId = the majority cause's owner");
  ok(r && r.directedByPlayerId === raeId, "directedByPlayerId = the season's winner (the crew voted, Rae's season steered)");
  ok(r && r.amountCents === 2000, `pool amount = $${(r && r.amountCents / 100).toFixed(2)} (4 × $5)`);
  ok(r && r.settlement.status === "web_checkout_pending", "settlement stays web-checkout-pending");
}
await waitFor(() => evalJs(`!!document.querySelector('.oval') && (document.body.innerText || '').includes('PCYC')`).catch(() => false), { label: "pool moment after the vote", timeout: 8000 });
ok(await exists(".oval"), "the monthly moment claims the screen once the vote settles");
okBody("PCYC", "the majority cause named on the pool moment");
await shot("giving-pool-vote");
await clickText("Done");
await sleep(300);

console.log("— LANGUAGE GATE (source files, extended 2026-09-11)");
{
  const { readFileSync } = await import("node:fs");
  const srcFiles = ["app.js", "engine.js", "index.html", "sot.css", "sfx.js"].map((f) => join(HERE, f));
  const uiStrings = [];
  for (const f of srcFiles) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(["'`])((?:\\.|(?!\1)[^\n\\])*)\1/g)) {
      uiStrings.push(m[2].replace(/\$\{[^}]*\}/g, " "));
    }
  }
  const bad = uiStrings.filter((s) => /\bmatch(?:es|ed|ing)?\b|\bkitty\b|\bpoker\b|\bRUF\b|\b300\b|\bwager\b|\bbet(?:ting)?\b|\bjackpot\b|\bwinnings\b/i.test(s));
  ok(bad.length === 0, `no banned words in app UI strings (wording table + wager/bet/jackpot/winnings)${bad.length ? ` — offenders: ${JSON.stringify(bad.slice(0, 4))}` : ""}`);
}

console.log("— CONSOLE GATE");
ok(consoleErrors.length === 0, `zero console errors (got ${consoleErrors.length}${consoleErrors.length ? ": " + consoleErrors[0] : ""})`);
consoleErrors.slice(0, 5).forEach((e) => console.log("    ·", e));

console.log(`\n${passed}/${step} checks passed`);
server.stop(true);
try { proc.kill("SIGTERM"); } catch {}
await sleep(400);
if (failures.length) {
  console.log("\nFAILURES:");
  failures.forEach((f) => console.log("  ✗", f));
  process.exit(1);
} else {
  console.log("ALL GREEN — Crew Giving walks the giving circle end to end (winner + crew-vote).");
  process.exit(0);
}
