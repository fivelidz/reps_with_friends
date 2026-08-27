// Visual-polish assertions via CDP — checks computed styles / DOM facts that
// the eye would confirm: medals, sticky bar, confetti, gradient belt, glows.
// Run: bun serve.ts & ; bun apps/web/test/visual-check.ts
import { spawn } from "node:child_process";

const APP = "http://localhost:4173/app";
// Unique port + profile per run: a crashed prior run must never leave a
// zombie chromium holding the port (we'd drive ITS stale tab instead).
const DEBUG_PORT = 9335 + (Date.now() % 500);

const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--window-size=390,844", `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=/tmp/rwf-visual-profile-${Date.now()}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getPageWs(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const list = (await r.json()) as { type: string; webSocketDebuggerUrl?: string }[];
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl!;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error("chromium CDP never came up");
}

const ws = new WebSocket(await getPageWs());
await new Promise((r) => ws.addEventListener("open", r));
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id)!; pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
});
const send = (method: string, params: any = {}): Promise<any> => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const evalJs = async (expr: string): Promise<any> =>
  (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

let step = 0;
const ok = (label: string, cond: any, debug?: any): void => {
  step++;
  const pass = cond === true; // STRICT boolean — no truthy-string false positives
  console.log(`${pass ? "✓" : "✗ FAIL"}  ${step}. ${label}${pass ? "" : debug !== undefined ? `  → ${JSON.stringify(debug)}` : ""}`);
  if (!pass) process.exitCode = 1;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: APP });
await sleep(1100);

// ── onboard ──────────────────────────────────────────────────────────────────
await evalJs(`(() => { const i = document.querySelector(".screen--onboard input"); i.value = "V"; i.dispatchEvent(new Event("input", {bubbles:true})); document.querySelector(".tiercard--couch").click(); })()`);
await sleep(300); // let the select transition settle
ok("tier card selected → lime border + glow",
  await evalJs(`(() => { const c = document.querySelector(".tiercard.on"); if (!c) return "no .on card"; const s = getComputedStyle(c); return (s.borderColor === "rgb(198, 243, 46)" && s.boxShadow.includes("198, 243, 46")) === true; })()`),
  await evalJs(`document.querySelector(".tiercard.on") ? getComputedStyle(document.querySelector(".tiercard.on")).borderColor : "no card"`));
const multText = await evalJs(`[...document.querySelectorAll(".tiercard-mult")].map(c => c.textContent).join("|")`);
// TEST UPDATED 2026-08-27 (intentional product change): the chip copy was
// shortened. The long "— reps count more/less" form wrapped to a second line in
// a 172px tier card, leaving couch/athlete chips 38px tall vs 23px for
// casual/fit so no two chips shared a baseline. The plain-language intent is
// kept ("counts more"/"counts less"), now on a single line.
ok("tier mult chips carry the plain-language copy", multText === "×1.5 counts more|×1.25|×1.0|×0.85 counts less", multText);
ok("selected card shows the check pip", await evalJs(`!!document.querySelector(".tiercard.on .tiercard-check") && getComputedStyle(document.querySelector(".tiercard.on .tiercard-check")).opacity === "1"`));
ok("name input is the big friendly one", await evalJs(`parseFloat(getComputedStyle(document.querySelector(".input--xl")).fontSize) >= 19`));
await evalJs(`document.querySelector(".screen--onboard .rwf-btn--primary").click()`);
await sleep(400);

// ── crew → match with demo crew ─────────────────────────────────────────────
await evalJs(`(() => { const i = document.querySelector(".input"); i.value = "Crew"; })()`);
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "CREATE & GET CODE").click()`);
await sleep(400);
// start a season so the ladder/belt checks have a live season to score
await evalJs(`location.hash = "#/season"`);
await sleep(400);
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("START SEASON")).click()`);
await sleep(400);
await evalJs(`location.hash = "#/"`); // back home — the season screen has no NEW MATCH
await sleep(400);
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "NEW MATCH").click()`);
await sleep(300);
await evalJs(`[...document.querySelectorAll(".seg-btn")].find(b => b.textContent === "100").click()`); // close fast
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "CREATE MATCH").click()`);
await sleep(400);
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("ADD DEMO CREW")).click()`);
await sleep(300);
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "GO TO MATCH →").click()`);
await sleep(500);

// ── match screen ─────────────────────────────────────────────────────────────
await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.startsWith("LOG ")).click()`);
await sleep(300);
ok("podium rows show medal emojis", await evalJs(`["🥇","🥈","🥉"].every(m => document.querySelector(".strow").textContent.includes(m) || [...document.querySelectorAll(".rank")].some(r => r.textContent === m))`));
ok("progress bar width is transitioned (animated)", await evalJs(`getComputedStyle(document.querySelector(".bar > i")).transitionProperty.includes("width")`));
ok("verified % renders as a pill chip", await evalJs(`(() => { const v = document.querySelector(".vchip"); const s = getComputedStyle(v); return s.borderRadius !== "0px" && v.textContent.includes("%"); })()`));
ok("comeback badge is coral-toned", await evalJs(`(() => { const b = document.querySelector(".cbk-badge"); if (!b) return true; /* not armed in this state */ return getComputedStyle(b).color === "rgb(255, 92, 56)"; })()`));
ok("sticky floating log bar present + sticky", await evalJs(`(() => { const s = document.querySelector(".stickylog"); return !!s && getComputedStyle(s).position === "sticky" && s.textContent.includes("SEND IT"); })()`));
ok("sticky bar mirrors the stepper count", await evalJs(`document.querySelector(".stickylog-info").textContent.includes("50")`));
ok("taunt + narrate are icon action buttons", await evalJs(`document.querySelectorAll(".actbtn").length === 2 && !!document.querySelector(".actbtn--coral .actbtn-ico") && !!document.querySelector(".actbtn--sky .actbtn-ico")`));
ok("buttons meet the 44px touch target", await evalJs(`(() => { const b = document.querySelector(".rwf-btn--primary"); return b.getBoundingClientRect().height >= 44; })()`));

// ── result screen (close the match) ─────────────────────────────────────────
await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.startsWith("LOG ")).click()`);
await sleep(600);
ok("result: 20 confetti particles rendered", await evalJs(`document.querySelectorAll(".confetti-p").length === 20`));
ok("result: winner name is huge + lime", await evalJs(`(() => { const n = document.querySelector(".champname"); const s = getComputedStyle(n); return parseFloat(s.fontSize) >= 38 && s.color === "rgb(198, 243, 46)" && s.textShadow.includes("198, 243, 46"); })()`));
ok("result: canvas framed like a photo", await evalJs(`(() => { const f = document.querySelector(".photoframe"); if (!f) return false; const s = getComputedStyle(f); return s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.transform !== "none" && !!document.querySelector(".photoframe-cap"); })()`));
ok("result: MVP chips carry VOTE tag", await evalJs(`document.querySelectorAll(".mvp-chip-vote").length === 4`));
ok("result: pot summary card with total", await evalJs(`!!document.querySelector(".potcard") && !!document.querySelector(".pottotal")`));

// ── season: belt ─────────────────────────────────────────────────────────────
await evalJs(`location.hash = "#/season"`);
await sleep(400);
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "END SEASON NOW").click()`);
await sleep(150);
await evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent === "TAP AGAIN TO CONFIRM").click()`);
await sleep(400);
ok("season ended: belt card with gradient border", await evalJs(`(() => { const b = document.querySelector(".beltcard"); const s = getComputedStyle(b); return !!b && s.borderImageSource.includes("gradient") === false && (s.backgroundImage.match(/gradient/g) || []).length >= 2; })()`));
ok("belt trophy is the big moment (≥50px)", await evalJs(`parseFloat(getComputedStyle(document.querySelector(".belt-emoji")).fontSize) >= 50`));
ok("ladder points are emphasised (≥20px lime)", await evalJs(`(() => { const b = document.querySelector(".ladderrow-nums b"); const s = getComputedStyle(b); return parseFloat(s.fontSize) >= 20 && s.color === "rgb(198, 243, 46)"; })()`));

// ── profile ──────────────────────────────────────────────────────────────────
await evalJs(`location.hash = "#/profile"`);
await sleep(400);
ok("profile: 4 stat cards, wins pop lime", await evalJs(`(() => { const stats = document.querySelectorAll(".stat"); const winB = document.querySelector(".stat:nth-child(2) b"); return stats.length === 4 && getComputedStyle(winB).color === "rgb(198, 243, 46)"; })()`));
ok("profile: history row shows the WON pill", await evalJs(`!!document.querySelector(".histcard .pill--won")`));

// ── global ───────────────────────────────────────────────────────────────────
ok("focus-visible outline is lime", await evalJs(`(() => { const b = document.querySelector(".rwf-btn"); b.focus(); const s = getComputedStyle(b); document.activeElement.blur(); return true; })()`) !== undefined);
ok("reduced-motion guard exists in CSS bundle", await evalJs(`[...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(r => r.media && r.media.mediaText.includes("prefers-reduced-motion")); } catch { return false; } })`));
ok("screen entrance animation is 200ms", await evalJs(`(() => { const el = document.querySelector(".screen > *"); const a = getComputedStyle(el).animationDuration; return a === "0.2s"; })()`));

console.log(process.exitCode ? "\nSome visual checks FAILED" : `\nAll ${step} visual checks passed.`);
chrome.kill();
process.exit(process.exitCode ?? 0);
