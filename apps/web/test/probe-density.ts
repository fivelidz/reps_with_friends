// Design probe (2026-08-27) — measures the MATCH screen's bottom cluster at
// 390px, where the most UI competes for space: standings + sticky log bar +
// verify row + HR chip + toasts + bottom nav.
//
// It checks concrete geometry rather than eyeballing screenshots:
//   • does a toast overlap the floating SEND IT bar? (the --toast-lift fix)
//   • is any interactive control covered by the sticky bar or the nav?
//   • is more than one solid-lime CTA live at once? (doc 13 §1.1)
//   • how much vertical room is left for content?
//
// Run: bun apps/web/test/probe-density.ts   (needs serve.ts on :4173)

import { spawn } from "node:child_process";

const APP = "http://localhost:4173/app";
const PORT = 9388;

const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--window-size=390,844", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/rwf-density-profile", "about:blank",
], { stdio: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function wsUrl(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const l = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as any[];
      const p = l.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error("no cdp");
}

const ws = new WebSocket(await wsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pend = new Map<number, any>();
ws.onmessage = (e: MessageEvent) => {
  const m = JSON.parse(String(e.data));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
};
const send = (method: string, params: any = {}) =>
  new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expr: string): Promise<any> {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
}
const clickBtn = (t: string) =>
  ev(`[...document.querySelectorAll("button")].find(b => b.textContent.includes(${JSON.stringify(t)}))?.click() ?? false`);

let fails = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "✓" : "✗ FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails++;
};

try {
  await send("Page.enable");
  await send("Runtime.enable");
  // --window-size includes browser chrome, so the viewport came out 500px wide.
  // Force a true 390×844 phone viewport (the target device width).
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await send("Page.navigate", { url: APP });
  await sleep(1200);

  // fresh state → onboard → crew → match with the demo crew for busy standings
  await ev(`localStorage.clear()`);
  await send("Page.navigate", { url: APP });
  await sleep(1000);
  await ev(`(() => { const i=document.querySelector(".screen--onboard input"); i.value="Density"; i.dispatchEvent(new Event("input",{bubbles:true})); })()`);
  await ev(`document.querySelector(".tiercard--casual")?.click()`);
  await clickBtn("START MOVING");
  await sleep(400);
  await ev(`(() => { const i=document.querySelector(".input"); i.value="Density Crew"; })()`);
  await clickBtn("CREATE & GET CODE");
  await sleep(400);
  await ev(`location.hash = "#/new"`);
  await sleep(400);
  await clickBtn("CREATE MATCH");
  await sleep(500);
  await clickBtn("ADD DEMO CREW");
  await sleep(400);
  await clickBtn("GO TO MATCH");
  await sleep(800);

  console.log("\nMATCH SCREEN @390px — bottom cluster");
  ok("on the match screen", await ev(`location.hash.startsWith("#/match/")`));

  // The floating bar only appears once the real LOG button scrolls OUT of view
  // (one lime CTA at a time). Scroll to the TOP — standings fill the screen and
  // the log panel is below the fold — which is exactly the state where a toast
  // could land on top of the bar.
  await ev(`document.getElementById("app").scrollTop = 0`);
  await sleep(700);

  const geo = await ev(`(() => {
    const r = (el) => { if(!el) return null; const b = el.getBoundingClientRect(); return {t:Math.round(b.top),b:Math.round(b.bottom),l:Math.round(b.left),rt:Math.round(b.right),h:Math.round(b.height),w:Math.round(b.width)}; };
    const bar = document.querySelector(".stickylog");
    const barHidden = bar?.classList.contains("is-hidden") ?? true;
    return {
      viewport: { w: innerWidth, h: innerHeight },
      bar: r(bar), barHidden,
      nav: r(document.getElementById("nav")),
      verifyRow: r(document.querySelector(".verifyrow")),
      camBtn: r(document.querySelector(".verifyrow-btn")),
      hrBtn: r(document.querySelector(".verifyrow-btn--hr")),
      logBtn: r([...document.querySelectorAll("button")].find(b => b.textContent.startsWith("LOG "))),
      toastLift: getComputedStyle(document.documentElement).getPropertyValue("--toast-lift").trim(),
      toastsBottom: getComputedStyle(document.getElementById("toasts")).bottom,
    };
  })()`);
  console.log(`  · viewport ${geo.viewport.w}×${geo.viewport.h}; bar ${geo.barHidden ? "hidden" : `visible @${geo.bar?.t}-${geo.bar?.b}`}; nav @${geo.nav?.t}-${geo.nav?.b}`);
  console.log(`  · verify row @${geo.verifyRow?.t}-${geo.verifyRow?.b} (h${geo.verifyRow?.h}); --toast-lift "${geo.toastLift}"; #toasts bottom ${geo.toastsBottom}`);

  // 1. verify-row buttons must not sit under the sticky bar or the nav.
  const coversVerify = !geo.barHidden && geo.bar && geo.verifyRow &&
    geo.bar.t < geo.verifyRow.b && geo.bar.b > geo.verifyRow.t;
  ok("verify row not covered by the floating log bar", !coversVerify,
    coversVerify ? `bar ${geo.bar.t}-${geo.bar.b} overlaps verify ${geo.verifyRow.t}-${geo.verifyRow.b}` : "");
  // Only meaningful when the row is actually on screen — when it's scrolled
  // below the fold it isn't "covered", it's just further down the page.
  const verifyOnScreen = geo.verifyRow && geo.verifyRow.t < geo.viewport.h && geo.verifyRow.b > 0;
  const navCoversVerify = verifyOnScreen && geo.nav && geo.verifyRow.b > geo.nav.t;
  ok(
    verifyOnScreen ? "verify row not covered by the bottom nav" : "verify row below the fold (nav check n/a)",
    !navCoversVerify
  );

  // 2. toast must clear the floating bar (the --toast-lift fix).
  await ev(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+10")?.click()`);
  await clickBtn("SEND IT");
  await sleep(450);
  const toastGeo = await ev(`(() => {
    const t = document.querySelector(".toast"); const bar = document.querySelector(".stickylog");
    if(!t) return {noToast:true};
    const tb = t.getBoundingClientRect(); const bb = bar?.getBoundingClientRect();
    const barVisible = bar && !bar.classList.contains("is-hidden");
    return { noToast:false, barVisible,
      toast:{t:Math.round(tb.top),b:Math.round(tb.bottom)},
      bar: bb?{t:Math.round(bb.top),b:Math.round(bb.bottom)}:null,
      overlap: !!(barVisible && bb && tb.bottom > bb.top && tb.top < bb.bottom),
      text: t.textContent };
  })()`);
  if (toastGeo.noToast) {
    ok("a confirmation toast appeared after logging", false);
  } else {
    console.log(`  · toast "${toastGeo.text}" @${toastGeo.toast.t}-${toastGeo.toast.b}; bar ${toastGeo.barVisible ? `@${toastGeo.bar.t}-${toastGeo.bar.b}` : "hidden"}`);
    ok("toast does NOT overlap the floating SEND IT bar", !toastGeo.overlap,
      toastGeo.overlap ? "toast is covering the primary control" : "");
  }

  // 3. one solid-lime CTA at a time (doc 13 §1.1) — the sticky bar stands in for
  //    the LOG button, it must not duplicate it.
  //    Selected chips/segments also paint lime but are STATE, not calls to
  //    action — exclude them and count only real CTA buttons.
  const limeCount = await ev(`(() => {
    const isChip = (b) => b.closest(".quickrow") || /\\bchip\\b|\\bseg-btn\\b|\\btiercard\\b/.test(b.className);
    // "Visible" means IN THE VIEWPORT — a CTA scrolled below the fold isn't
    // competing with anything, which is the whole point of the floating bar.
    const solid = [...document.querySelectorAll("button")].filter(b => {
      const cs = getComputedStyle(b); const bg = cs.backgroundColor;
      const r = b.getBoundingClientRect();
      const onScreen = r.height > 0 && r.top < innerHeight && r.bottom > 0;
      const vis = onScreen && cs.visibility !== "hidden" && cs.opacity !== "0";
      return vis && !isChip(b) && /198,\\s*243,\\s*46/.test(bg);
    });
    return { n: solid.length, labels: solid.map(b => b.textContent.trim().slice(0,24)) };
  })()`);
  console.log(`  · solid-lime CTAs live: ${limeCount.n} [${limeCount.labels.join(" | ")}]`);
  ok("at most one solid-lime CTA visible at a time", limeCount.n <= 1);

  console.log(`\n${fails === 0 ? "density probe: all checks passed" : `density probe: ${fails} FAILED`}`);
} finally {
  try { ws.close(); } catch {}
  chrome.kill("SIGTERM");
  setTimeout(() => process.exit(fails ? 1 : 0), 300);
}
