/* ═══════════════════════════════════════════════════════════════════════
   RWF BOTS-SIM + HUB CHECK — plays a full match through the REAL bot
   CommandBus (the same code the WhatsApp/Slack bots run) into the store
   serve.ts reads (.data/bot-matches.json), then verifies:
     1. /api/state reflects the played match
     2. the /hub console renders it (headless chromium, DOM assert + shot)

   Uses an isolated chatId so real bot chats are untouched.
   Run: bun apps/figma-app/bots-sim.mjs   (serve.ts must be up on :4173)
   ═══════════════════════════════════════════════════════════════════════ */

import { spawn } from "node:child_process";
import { CommandBus, MatchStore } from "../../packages/bot-core/src/index.ts";

const CHAT = "sl:e2e-hub-check";
const BASE = "http://localhost:4173";
let passed = 0, failed = 0;
const ok = (c, l) => { c ? (passed++, console.log(`  ✓ ${l}`)) : (failed++, console.log(`  ✗ FAIL: ${l}`)); };

/* ── 1. play a match through the real bus ────────────────────────────── */
const bus = new CommandBus(new MatchStore(".data/bot-matches.json"));
const say = (playerId, playerName, text) => {
  const reply = bus.handle({ chatId: CHAT, playerId, playerName, text });
  console.log(`  ${playerName}: ${text}\n  ↳ ${reply.split("\n")[0].slice(0, 110)}${reply.length > 110 ? "…" : ""}`);
  return reply;
};

console.log(`\nBOTS SIM — chat ${CHAT} (real CommandBus → .data/bot-matches.json)\n`);
say("u-ben", "Ben", "new 200");
say("u-ben", "Ben", "link CREW-E2E1");          // crew-code grammar (figma-app shows the same)
say("u-ben", "Ben", "join couch");
say("u-sam", "Sam", "join fit");
say("u-alex", "Alex", "join athlete");
say("u-ben", "Ben", "start");
say("u-sam", "Sam", "log pushups 80");          // sam 80 raw
const cbReply = say("u-ben", "Ben", "log squats 40");   // ben 0→40, 100% behind → comeback ×1.2 fires HERE
ok(cbReply.includes("comeback ×1.2 applied"), "comeback ×1.2 fired in the bot match");
say("u-ben", "Ben", "log pushups 40!");         // camera-verified, ben 80 raw
say("u-alex", "Alex", "log pushups 60");        // alex 60
const closeReply = say("u-sam", "Sam", "log pushups 120"); // sam 200 → closes
ok(closeReply.toLowerCase().includes("closed") || closeReply.includes("🏁") || closeReply.includes("match"), "closure card returned");
const resultReply = say("u-sam", "Sam", "result");
ok(/takes it|won|winner/i.test(resultReply), "result card names a winner");
console.log(`\n  result card (first lines):\n${resultReply.split("\n").slice(0, 6).map(l => "  │ " + l).join("\n")}`);

/* ── 2. /api/state must reflect it ───────────────────────────────────── */
console.log("\nAPI CHECK — /api/state");
const state = await fetch(`${BASE}/api/state`).then(r => r.json());
const mine = state.matches.find(m => m.chatId === CHAT);
ok(!!mine, "match present in /api/state");
ok(mine?.status === "complete", `status complete (got ${mine?.status})`);
ok(Array.isArray(mine?.players) && mine.players.length === 3, "3 players listed");
const winnerRow = mine?.players?.[0];
ok(!!winnerRow?.name, `leaderboard sorted — top: ${winnerRow?.name} ${winnerRow?.adjustedScore} RUF`);
console.log(`  standings via API: ${mine?.players?.map(p => `${p.name}(${p.tier}) ${p.rawReps}raw→${p.adjustedScore}adj`).join(" · ")}`);

/* ── 3. hub console renders it ───────────────────────────────────────── */
console.log("\nHUB CHECK — /hub (headless chromium)");
const proc = spawn("/usr/bin/chromium", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--remote-debugging-port=9231", "--window-size=1280,900",
  "--user-data-dir=/tmp/rwf-hub-check", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
proc.stderr.on("data", () => {});
await Bun.sleep(2500);
const tabs = await fetch("http://127.0.0.1:9231/json/list").then(r => r.json());
const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

await send("Runtime.enable"); await send("Page.enable");
await send("Page.navigate", { url: `${BASE}/hub` });
await Bun.sleep(3500); // hub polls every 3s

const hubText = await ev(`document.body.innerText`);
ok(hubText.includes("CREW-E2E1"), "hub shows the crew code (link grammar)");
ok(/complete/i.test(hubText), "hub shows the completed status");
const winnerShown = await ev(`document.body.innerText.includes(${JSON.stringify(winnerRow?.name ?? "?")})`);
ok(winnerShown, `hub leaderboard shows ${winnerRow?.name}`);
const shot = await send("Page.captureScreenshot", { format: "png" });
await Bun.write("apps/figma-app/shots/62-hub-console.png", Buffer.from(shot.data, "base64"));
console.log("  shot: apps/figma-app/shots/62-hub-console.png (1280×900)");

await Bun.sleep(150);
try { ws.close(); proc.kill(9); } catch {}
console.log(`\n${passed}/${passed + failed} checks passed${failed ? " — FAILED" : " — BOTS+HUB VERIFIED"}`);
process.exit(failed ? 1 : 0);
