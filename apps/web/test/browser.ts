// Real-browser flow verification via Chromium CDP (no deps — bun WebSocket).
// Walks: onboard → crew → new match (target 100) → link screen (code shown) →
// demo crew → match view → log reps → standings update → closure → result →
// charity designation. Fails on ANY console error / uncaught exception.
// Run: bun apps/web/test/browser.ts   (needs `bun serve.ts` on :4173)

import { spawn } from "node:child_process";

const APP = "http://localhost:4173/app";
const DEBUG_PORT = 9333;

// ── launch chromium ──────────────────────────────────────────────────────────
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  "--window-size=390,844",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--user-data-dir=/tmp/rwf-cdp-profile",
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

// ── tiny CDP client ──────────────────────────────────────────────────────────
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
    consoleErrors.push(`EXCEPTION: ${JSON.stringify(msg.params.exceptionDetails).slice(0, 2000)}`);
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
    throw new Error(`page eval failed: ${expression.slice(0, 80)} → ${JSON.stringify(r.result.exceptionDetails).slice(0, 200)}`);
  }
  return r.result?.result?.value;
}

let step = 0;
function ok(label: string, cond: boolean): void {
  step++;
  console.log(`${cond ? "✓" : "✗ FAIL"}  ${step}. ${label}`);
  if (!cond) throw new Error(`step ${step} failed`);
}

try {
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");

  // 1. load (fresh — clear any persisted state from a previous run)
  await send("Page.navigate", { url: APP });
  await sleep(600);
  await evalJs(`localStorage.clear()`);
  await send("Page.navigate", { url: APP });
  await sleep(900);
  ok("app loads, onboard screen rendered", await evalJs(`!!document.querySelector(".screen--onboard")`));
  ok("nav hidden pre-onboard", await evalJs(`document.getElementById("nav").children.length === 0`));

  // 2. onboard: name + tier + CTA
  await evalJs(`(() => { const i = document.querySelector(".screen--onboard input"); i.value = "Testy"; i.dispatchEvent(new Event("input", {bubbles:true})); })()`);
  await evalJs(`document.querySelector(".tiercard--casual").click()`);
  const ctaEnabled = await evalJs(`!document.querySelector(".screen--onboard .rwf-btn--primary").disabled`);
  ok("CTA enabled after name+tier", ctaEnabled);
  await evalJs(`document.querySelector(".screen--onboard .rwf-btn--primary").click()`);
  await sleep(300);
  ok("onboard → crew screen", await evalJs(`location.hash === "#/crew" && !!document.querySelector(".code, .input")`));

  // 3. crew: create
  await evalJs(`(() => { const i = document.querySelector(".input"); i.value = "Test Crew"; })()`);
  await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "CREATE & GET CODE").click()`);
  await sleep(300);
  ok("crew created → home", await evalJs(`location.hash === "#/"`));
  ok("bottom nav now visible (4 tabs incl. Season)", await evalJs(`document.getElementById("nav").children.length === 4`));

  // 3b. start a season NOW so the match we're about to play scores season points
  await evalJs(`location.hash = "#/season"`);
  await sleep(300);
  await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("START SEASON")).click()`);
  await sleep(300);
  ok("season live (header + ladder card)", await evalJs(`!!document.querySelector(".season-head") && !!document.querySelector(".ladderlist, .ladderrow, .rwf-card")`));
  await evalJs(`location.hash = "#/"`);
  await sleep(300);

  // 4. new match: target 100
  await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "NEW MATCH").click()`);
  await sleep(300);
  ok("new match screen", await evalJs(`location.hash === "#/new"`));
  await evalJs(`[...document.querySelectorAll(".seg-btn")].find(b => b.textContent === "100").click()`);
  await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "CREATE MATCH").click()`);
  await sleep(300);

  // 5. link screen: code shown big
  ok("link screen shown", await evalJs(`location.hash.startsWith("#/link/")`));
  const code = await evalJs(`document.querySelector(".code")?.textContent ?? ""`);
  ok(`link code displayed big (${code})`, /^[A-Z0-9]{6}$/.test(code));
  ok("WhatsApp + Slack cards present", await evalJs(`document.querySelectorAll(".chatcard").length === 2`));

  // 6. demo crew + go to match
  await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("ADD DEMO CREW")).click()`);
  await sleep(300);
  ok("demo crew added (button flips to ✓)", await evalJs(`[...document.querySelectorAll("button")].some(b => b.textContent.includes("DEMO CREW ADDED"))`));
  await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "GO TO MATCH →").click()`);
  await sleep(300);

  // 7. match view: standings with 4 players
  ok("match view live", await evalJs(`location.hash.startsWith("#/match/") && !!document.querySelector(".pill--live")`));
  ok("standings show 4 players", await evalJs(`document.querySelectorAll(".strow").length === 4`));
  ok("log panel present with stepper", await evalJs(`!!document.querySelector(".stepper") && !!document.querySelector(".stepval")`));

  // 8. log reps → standings update
  await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
  const btnLabel = await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.startsWith("LOG ")).textContent`);
  ok(`quick chip updates LOG button label (${btnLabel})`, btnLabel === "LOG 50 PUSH-UPS");
  await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.startsWith("LOG ")).click()`);
  await sleep(300);
  const rawAfter = await evalJs(`[...document.querySelectorAll(".strow")].map(r => r.querySelector(".score span").textContent).join(",")`);
  ok(`standings updated after log (raw: ${rawAfter})`, rawAfter.includes("50 raw"));

  // 9. crew feed + AI taunt (before closing the match).
  //    AI composer can take up to 3s (timeout → canned fallback) — poll for it.
  ok("crew feed shows entries", await evalJs(`document.querySelectorAll(".feedlist li").length >= 1`));
  await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("TAUNT")).click()`);
  let tauntLanded = false;
  for (let i = 0; i < 20 && !tauntLanded; i++) {
    await sleep(300);
    tauntLanded = await evalJs(`[...document.querySelectorAll(".feedlist li")].some(li => li.textContent.includes("You:"))`);
  }
  ok("taunt lands in crew feed (AI or canned fallback)", tauntLanded);

  // 10. camera verify button logs verified:false (+50 → 100 raw = target → closes)
  await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("CAMERA VERIFY")).click()`);
  await sleep(400);
  ok("camera verify closed the match at 100 raw → result screen", await evalJs(`location.hash.startsWith("#/result/") && [...document.querySelectorAll(".strow")].some(r => r.textContent.includes("100 raw"))`));
  ok("match closed → result screen", await evalJs(`location.hash.startsWith("#/result/")`));
  ok("champion card rendered", await evalJs(`!!document.querySelector(".champcard") && !!document.querySelector(".champname")`));
  const champ = await evalJs(`document.querySelector(".champname").textContent`);
  const potTotal = await evalJs(`document.querySelector(".pottotal")?.textContent`);
  ok(`champion crowned (${champ})`, champ.length > 0);
  ok(`pot shows $20 (${potTotal})`, potTotal === "$20");
  ok("final standings rendered", await evalJs(`document.querySelectorAll(".rwf-card .strow").length === 4`));

  // 11a. MVP vote — chips, one vote, locks
  ok("MVP vote chips rendered (one per player)", await evalJs(`document.querySelectorAll(".mvp-chip").length === 4`));
  await evalJs(`document.querySelectorAll(".mvp-chip")[1].click()`);
  await sleep(300);
  ok("MVP vote locked (chips replaced)", await evalJs(`!!document.querySelector(".mvp-locked") && document.querySelectorAll(".mvp-chip").length === 0`));

  // 11b. shareable result card canvas
  ok("result card canvas 1200×675 rendered", await evalJs(`(() => { const c = document.querySelector(".result-canvas"); return !!c && c.width === 1200 && c.height === 675; })()`));

  // 12. designate charity
  await evalJs(`document.querySelector(".charitycard").click()`);
  await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "DESIGNATE POT").click()`);
  await sleep(300);
  ok("pot designated (confirmation banner)", await evalJs(`!!document.querySelector(".potdone")`));

  // 12b. season ladder scored the completed match (+ MVP badge from the vote)
  await evalJs(`location.hash = "#/season"`);
  await sleep(300);
  const ladderN = await evalJs(`document.querySelectorAll(".ladderrow").length`);
  ok(`season ladder scored the match (${ladderN} players)`, ladderN === 4);
  ok("MVP badge shows on ladder", await evalJs(`!!document.querySelector(".mvpbadge")`));

  // 13. profile
  await evalJs(`location.hash = "#/profile"`);
  await sleep(300);
  ok("profile stats rendered", await evalJs(`document.querySelectorAll(".stat").length === 4`));
  const wins = await evalJs(`[...document.querySelectorAll(".stat b")].map(b => b.textContent).join(",")`);
  ok(`stats sensible (matches,wins,reps,rate = ${wins})`, wins === "1,1,100,100%");

  // 14. persistence across reload
  await send("Page.navigate", { url: APP });
  await sleep(900);
  ok("state survives reload (home with 1 match card)", await evalJs(`location.hash === "#/" || location.hash === "" ? document.querySelectorAll(".matchcard").length === 1 : false`));

  // 15. console error audit (print captured errors BEFORE failing so they're visible)
  if (consoleErrors.length) console.log(consoleErrors.join("\n"));
  ok(`zero console errors across whole flow (${consoleErrors.length} captured)`, consoleErrors.length === 0);

  console.log(`\nBrowser flow: all ${step} checks passed, 0 console errors.`);
} finally {
  try { ws.close(); } catch {}
  chrome.kill("SIGTERM");
  setTimeout(() => process.exit(consoleErrors.length || step === 0 ? 1 : 0), 300);
}
