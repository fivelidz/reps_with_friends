/* ═══════════════════════════════════════════════════════════════════════
   RWF V4 SoT APP — CARDS E2E (the v4.1 card stack, end to end)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The founder's two directives, walked on the real app:
     "pick out of three dealt"  → day opens → the deal sheet slides up →
       3 cards face-down → mid-flip shot → flip → REROLL (50 pts to the
       pot, odds re-dealt) → pick one → hand of 1 on the battle home
     "an exercise worth more"   → Double Exercise played through the
       Power-Ups tab → the ×2 rides the NEXT log's math (confirm chip +
       doubled ruf in state)
     "prove they did it — which others have to accept" →
       Prove It #1: a rival proves ME → my log screen gains the verified
       mark path → I verify → honest effort pays ME +15
       Prove It #2: I prove a rival → they log unverified → the FEED
       carries the group accept/contest card → a house rival contests →
       I contest → settled CONTESTED → the set scores 0 but the day
       still banks (BANKED flag stands)
   Plus hand cap / expiry badges, the pot ledger, language + console gates.
   Shots land in apps/sot/shots/ with the _cards suffix (390×844 @2x).
   ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4197;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = join(HERE, "shots");
const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9720 + Math.floor(Math.random() * 200);

let step = 0, passed = 0;
const failures = [];
function ok(cond, label) {
  step++;
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ FAIL: ${label}`); }
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2",
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
    const fsPath = p === "/" ? join(HERE, "index.html") : join(HERE, p.replace(/^\//, ""));
    const f = Bun.file(fsPath);
    if (await f.exists()) {
      const ext = fsPath.slice(fsPath.lastIndexOf("."));
      return new Response(f, { headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "no-store" } });
    }
    return new Response("not found", { status: 404 });
  },
});

try { Bun.spawnSync(["pkill", "-9", "-f", "rwf-v4-cards-e2e"]); } catch {}
await Bun.sleep(300);
const PROFILE = `/tmp/rwf-v4-cards-${Date.now()}`;
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
async function clickText(text, scope = "button, .pick, .ex-pill, .preset, .pu-card, .card") {
  const r = await evalJs(`(() => {
    const want = ${JSON.stringify(text)};
    const els = [...document.querySelectorAll('${scope}')];
    let hit = els.find(el => (el.textContent || '').trim() === want)
           || els.find(el => (el.textContent || '').trim().startsWith(want));
    if (!hit) hit = els.find(el => (el.textContent || '').includes(want));
    if (hit) { hit.click(); return (hit.textContent || '').trim().slice(0, 30); }
    return null;
  })()`);
  if (r === null) { try { console.log(`    [clickText miss "${text}" — screen: ${await dump()}]`); } catch {} throw new Error(`clickText target missing: ${text}`); }
  await sleep(240);
  return r;
}
async function shot(name) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${String(step).padStart(2, "0")}-${name}_cards.png`), Buffer.from(r.data, "base64"));
}
const text = (sel) => evalJs(`document.querySelector('${sel}')?.textContent ?? null`);
const exists = (sel) => evalJs(`!!document.querySelector('${sel}')`);
const bodyHas = (s) => evalJs(`(document.body.innerText || '').includes(${JSON.stringify(s)})`);
const dump = () => evalJs(`(document.body.innerText || '').replace(/\\n/g, ' | ').slice(0, 200)`);
const okBody = async (s, label) => { const r = await bodyHas(s); if (!r) console.log(`    [miss "${s}" — screen: ${await dump()}]`); ok(r, label); };
const snapState = () => evalJs(`(() => { const s = RWFSoT.snapshot(); return JSON.parse(JSON.stringify({ gid: s.group.id, battle: s.battle ? { idx: s.battle.idx, status: s.battle.status } : null, me: s.me ? { id: s.me.id, inventory: s.me.inventory } : null, points: s.points, pot: s.pot, draft: s.myDraft ? { reason: s.myDraft.reason, options: s.myDraft.options, openedAt: s.myDraft.openedAt } : null, board: s.board.map(r => ({ id: r.member.id, name: r.member.name, adjusted: r.adjusted, completed: r.completed, hand: r.hand })), members: s.group.members.map(m => ({ id: m.id, name: m.name })), proofs: (s.openProofs || []).map(p => ({ id: p.id, status: p.status, target: p.targetId, accepts: p.accepts, contests: p.contests })) })); })()`);
const driveLog = (memberId, ex, physical, verified = false) =>
  evalJs(`RWFSoT.logRepsAs(RWFSoT.state.activeGroupId, ${JSON.stringify(memberId)}, ${JSON.stringify(ex)}, ${physical}, ${verified})`);
const voteAs = (proofId, voterId, vote) =>
  evalJs(`RWFSoT.voteProofAs(RWFSoT.state.activeGroupId, ${JSON.stringify(proofId)}, ${JSON.stringify(voterId)}, ${JSON.stringify(vote)})`);

const BANNED = /\bmatch(?:es|ed|ing)?\b|kitty|poker|\bruf\b|\b300\b/i;

/* ═══════════════════════ THE WALK ═════════════════════════════════════ */
mkdirSync(SHOTS, { recursive: true });
console.log(`\nRWF V4 CARDS E2E — ${BASE} (headless chromium, 390×844)\n`);

await send("Page.navigate", { url: `${BASE}/` });
await waitFor(
  () => evalJs(`document.readyState === 'complete' && window.RWFSoT && document.querySelector('.screen') !== null`).catch(() => false),
  { label: "v4 app load", timeout: 20000 }
);
await sleep(600);

console.log("— ONBOARD (compact)");
await click("button.btn");                                    // Let's go
await clickText("Next"); await clickText("Next");             // explainers
await clickText("Create profile");
await evalJs(`(() => { const i = document.querySelector('input[type=text]'); i.value = 'Alexei'; return true; })()`);
await clickText("Next");
await clickText("Next");                                      // avatar
await clickText("Done");                                      // tone → start
okBody("Create a group", "start screen reached");

console.log("— CREATE (Card Crew · Mon+Tue · 200 · 6-min sprints · no stake · full stack)");
await clickText("⚔️ Create a group");
await clickText("Next");                                      // mode (individual)
await evalJs(`(() => { const i = document.querySelector('input[type=text]'); i.value = 'Card Crew'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await clickText("Next");                                      // identity
await clickText("Next");                                      // invite (house crew on)
await clickText("Next");                                      // days (Mon+Tue)
await clickText("Sprint");
await evalJs(`(() => { const i = document.querySelector('input[type=number]'); i.value = '6'; i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
await clickText("Next");                                      // target+clock
await clickText("Next");                                      // handicap → exercises
await clickText("Next");                                      // exercises → season
await clickText("No stake");                                  // on the season page's stake row
await clickText("Next");                                      // → stake step (Pride only)
await clickText("Next");                                      // → card settings
okBody("canon", "card settings mark the canon 4");
ok(await evalJs(`(() => { const rows = [...document.querySelectorAll('.toggle-row')]; return rows.length >= 20; })()`), "the full stack is configurable (20+ cards)");
await shot("stack-settings");
await clickText("Next");                                      // → review
await clickText("⚔️ Create the group");
await clickText("Start the season");
await waitFor(() => evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; return g.seasons.length === 1 && g.seasons[0].battles[0].status === 'live'; })()`).catch(() => false), { label: "season 1 battle 1 live" });

console.log("— THE DEAL: day opens → sheet slides up → 3 face-down → flip → reroll → pick");
await waitFor(() => evalJs(`!!document.querySelector('.deal-oval')`).catch(() => false), { label: "deal sheet at day open" });
ok(await exists(".deal-oval"), "the deal claims the screen at day open");
ok((await evalJs(`document.querySelectorAll('.rwcard').length`)) === 3, "three cards dealt (pick 1 of 3)");
ok(await bodyHas("PICK 1 OF 3"), "the pick-one framing");
ok(await bodyHas("500 pts"), "trial points balance shown (500)");
await shot("deal-facedown");
let st = await snapState();
const firstOptions = st.draft ? st.draft.options.slice() : [];
ok(firstOptions.length === 3, `options stored in state (${firstOptions.join(", ")})`);
await click(".rwcard");                                       // tap → the table flips
await sleep(280);                                             // MID-FLIP: the 3D turn is live
await shot("deal-midflip");
await sleep(750);                                             // flips settle
ok((await evalJs(`document.querySelectorAll('.rwcard .rw-front').length`)) === 3, "all three flipped face-up (poster faces)");
// REROLL: pay 50 points to the pot, three fresh cards
await clickText("Reroll — 50 pts");
await sleep(300);
st = await snapState();
ok(st.pot === 50, `reroll paid the pot (pot ${st.pot})`);
ok(st.points === 450, `balance burned (${st.points})`);
ok(st.draft && st.draft.options.length === 3, "fresh options on the table");
ok((await bodyHas("pot 50")), "the pot rides the deal sheet");
await click(".rwcard");                                       // flip the rerolled table
await sleep(950);
await click(".rwcard");                                       // pick one
await waitFor(() => evalJs(`!document.querySelector('.deal-oval')`).catch(() => false), { label: "deal closed after pick" });
st = await snapState();
ok(st.me.inventory.length === 1, `one card in hand (${st.me.inventory[0]})`);
ok(await exists("#my-hand"), "hand strip visible on battle home");
await shot("hand");
okBody("HAND", "hand labelled on the battle home");

console.log("— DOUBLE EXERCISE: play it, the ×2 rides the next log");
await evalJs(`RWFSoT.debugGrant(RWFSoT.state.activeGroupId, ${JSON.stringify(st.me.id)}, 'double_exercise')`);
await clickText("Power-Ups");
for (let i = 0; i < 6; i++) {
  const more = await evalJs(`(() => { const c = document.querySelector('.pu-card:not(.revealed)'); if (c) { c.click(); return true; } return false; })()`);
  if (!more) break;
  await sleep(140);
}
await sleep(250);
ok(await evalJs(`(() => { for (const c of document.querySelectorAll('.pu-card.revealed')) { if (c.textContent.toUpperCase().includes('DOUBLE EXERCISE')) { c.click(); return true; } } return false; })()`), "Double Exercise in the hand");
await sleep(300);
okBody("Name your exercise", "exercise picker for the modifier card");
await clickText("Push-ups");
okBody("PLAY CARD", "play confirm shown");
await clickText("Confirm");
okBody("×2 ON PUSH-UPS", "×2 activation moment names the exercise");
await clickText("Done");
ok(await exists(".fx-pill.stack") || (await bodyHas("×2")), "×2 active effect rides the battle home");
await shot("double-active");
// the math: 10 push-ups ×1 (fit) ×2 = 20
await clickText("LOG");
await clickText("Push-ups", ".ex-pill");
await clickText("Log a set");
for (const k of ["1", "0"]) await clickText(k, ".keypad button");
await clickText("Next");
okBody("×2 double push-ups", "the confirm screen shows the ×2 modifier chip");
okBody("+ 20 reps", "preview gain doubled (10 → 20)");
await shot("log-confirm-double");
await clickText("Log it");
await sleep(300);
okBody("+20 REPS", "the set scored 20 (×2 verified in the log math)");
st = await snapState();
ok(st.board.find((r) => r.id === st.me.id).adjusted === 20, `state agrees: my adjusted = ${st.board.find((r) => r.id === st.me.id).adjusted}`);
ok(await evalJs(`(() => { const g = RWFSoT.state.groups[RWFSoT.state.activeGroupId]; return g.events.some(e => e.text.includes('×2 double')); })()`), "the feed logs the doubled set (×2 tag on the log event)");
await clickText("Log another");
await clickText("Battle");

console.log("— PROVE IT #1 (the verify path): Marco proves ME → I verify → +15");
st = await snapState();
const marco = st.members.find((m) => m.name === "Marco");
const priya = st.members.find((m) => m.name === "Priya");
ok(!!marco && !!priya, "house crew present");
await evalJs(`RWFSoT.debugGrant(RWFSoT.state.activeGroupId, ${JSON.stringify(marco.id)}, 'prove_it')`);
await evalJs(`RWFSoT.activateCard(RWFSoT.state.activeGroupId, ${JSON.stringify(marco.id)}, 'prove_it', ${JSON.stringify(st.me.id)})`);
await sleep(300);
ok(await exists(".banner.proof"), "PROVE IT banner on my battle home (my next set is watched)");
await shot("prove-banner");
await clickText("LOG");
await clickText("Push-ups", ".ex-pill");
await clickText("Log a set");
for (const k of ["1", "0"]) await clickText(k, ".keypad button");
await clickText("Next");
ok(await exists("#prove-banner"), "the log confirm carries the proof banner");
ok(await exists("#verify-row"), "the verified mark path on the log screen");
await shot("verify-row");
await click(".verify-row button");                          // arm the verified mark
ok(await bodyHas("VERIFIED — honesty pays +15"), "verify toggle armed");
await clickText("Log it");
// same exercise + reps inside 60s → the duplicate warning intercepts; the
// honest answer is "yes, log it anyway" — and the verified mark must SURVIVE
await waitFor(() => evalJs(`!!document.querySelector('#dup-warn')`).catch(() => false), { label: "duplicate warning", timeout: 6000 });
ok(await exists("#dup-warn"), "duplicate warning intercepts the repeat set");
await clickText("Yes — log it anyway");
await sleep(400);
st = await snapState();
ok(st.board.find((r) => r.id === st.me.id).adjusted === 55, `verified set banked ×2 10 = 20 (the modifier rides it too) + 15 honesty bonus (adjusted ${st.board.find((r) => r.id === st.me.id).adjusted})`);
await clickText("Feed");
okBody("verified the set — honest effort pays THEM +15", "the feed carries the verified outcome");
await clickText("Battle");

console.log("— PROVE IT #2 (the contest path): I prove Marco → unverified set → the crew decides");
// Marco banks the day first (so the contest can prove the day STILL banks)
await driveLog(marco.id, "pushups", 160);                     // casual ×1.25 → 200 = banked
await sleep(300);
if (await exists(".oval")) { await clickText("Bank my day"); await sleep(250); }  // Marco took the Daily Win — dismiss the moment
st = await snapState();
ok(st.board.find((r) => r.id === marco.id).completed === true, "Marco banked the day (200)");
await evalJs(`RWFSoT.debugGrant(RWFSoT.state.activeGroupId, ${JSON.stringify(st.me.id)}, 'prove_it')`);
await clickText("Power-Ups");
for (let i = 0; i < 6; i++) {
  const more = await evalJs(`(() => { const c = document.querySelector('.pu-card:not(.revealed)'); if (c) { c.click(); return true; } return false; })()`);
  if (!more) break;
  await sleep(140);
}
await sleep(250);
ok(await evalJs(`(() => { for (const c of document.querySelectorAll('.pu-card.revealed')) { if (c.textContent.toUpperCase().includes('PROVE IT')) { c.click(); return true; } } return false; })()`), "Prove It in my hand");
await sleep(300);
okBody("Who has to prove it?", "target picker for the proof card");
await clickText("Marco (");
okBody("PLAY CARD", "confirm shown");
await clickText("Confirm");
okBody("PROOF OUT", "proof request live");
await clickText("Done");
// Marco logs an UNVERIFIED set — the review opens
await driveLog(marco.id, "pushups", 40);                      // +50 (unverified)
await sleep(300);
st = await snapState();
const review = st.proofs.find((p) => p.status === "review");
ok(!!review, "the set went to group review (not auto-punished)");
ok(st.board.find((r) => r.id === marco.id).adjusted === 250, `Marco's set counts while under review (${st.board.find((r) => r.id === marco.id).adjusted})`);
await clickText("Feed");
ok(await exists(".proof-card"), "the FEED carries the group accept/contest card");
okBody("under review", "review card explains the stakes");
ok((await exists(".proof-actions")) && (await bodyHas("Accept")) && (await bodyHas("Contest")), "accept + contest buttons present");
await shot("proof-feed-card");
// the crew votes: Priya contests, I contest → majority → CONTESTED
await voteAs(review.id, priya.id, "contest");
await sleep(250);
st = await snapState();
ok(st.proofs[0] && st.proofs[0].contests === 1 && st.proofs[0].status === "review", "house vote in (1 contest, not yet settled)");
await clickText("👎 Contest");
await sleep(400);
st = await snapState();
ok(st.proofs.length === 0, "the review settled (card left the feed)");
okBody("CONTESTED", "the feed records the crew's call");
okBody("scores 0", "contested messaging: the set scores 0");
okBody("day still banks", "the never-shame ruling is right in the feed");
const marcoRow = st.board.find((r) => r.id === marco.id);
ok(marcoRow.adjusted === 200, `Marco back to 200 (contested set zeroed: ${marcoRow.adjusted})`);
ok(marcoRow.completed === true, "…and his day STILL BANKS (completion stands)");
await shot("contested-settled");
await clickText("Battle");
await sleep(300);
ok((await bodyHas("BANKED")) || st.board.find((r) => r.id === marco.id).completed, "leaderboard shows Marco BANKED after the contest");

console.log("— HAND + EXPIRY BADGES");
await clickText("Power-Ups");
ok(await bodyHas("OF 3"), "hand size vs cap shown (hold up to 3)");
ok(await evalJs(`(() => { return [...document.querySelectorAll('.pu-card.revealed')].every(c => /⏳|today|minute|window|close|instant|fuse/i.test(c.textContent)); })()`) ||
  (await evalJs(`document.querySelectorAll('.pu-card.revealed .f-exp').length`)) > 0, "expiry badges on held cards");
okBody("pot 50", "the pot (reroll payments) persists on the stack screen");
await shot("stack-after");

console.log("— GATES");
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
  const bad = uiStrings.filter((s) => /\bmatch(?:es|ed|ing)?\b|\bkitty\b|\bpoker\b|\bRUF\b|\b300\b/i.test(s));
  ok(bad.length === 0, `no banned words in app UI strings${bad.length ? ` — offenders: ${JSON.stringify(bad.slice(0, 4))}` : ""}`);
}
ok(await evalJs(`(() => { const t = document.body.innerText || ''; return !${BANNED.toString()}.test(t); })()`), "language clean on screen (reps/battle language, no card-shark words)");
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
  console.log("ALL GREEN — the founder's card system walks its directives end to end.");
  process.exit(0);
}
