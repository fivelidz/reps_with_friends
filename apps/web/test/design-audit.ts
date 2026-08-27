// Design-system audit harness. Visits every surface at 390px + 1280px and
// reports programmatically: console errors, horizontal overflow, sub-44px tap
// targets, contrast ratios, lime-token usage, focus-visible, heading order.
// Run: bun apps/web/test/design-audit.ts   (needs `bun serve.ts` on :4173)

import { spawn } from "node:child_process";

const BASE = "http://localhost:4173";
const DEBUG_PORT = 9344;
const SURFACES = ["/", "/demo", "/app", "/system", "/hub", "/debug", "/connect", "/slack"];
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const targets = ONLY.length ? ONLY : SURFACES;

const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--window-size=390,844", `--remote-debugging-port=${DEBUG_PORT}`,
  "--user-data-dir=/tmp/rwf-audit-final", "about:blank",
], { stdio: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getPageWs(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const list = (await r.json()) as { type: string; webSocketDebuggerUrl?: string }[];
      const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl!;
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error("chromium CDP never came up");
}

const ws = new WebSocket(await getPageWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void }>();
let consoleErrors: string[] = [];

ws.onmessage = (ev: MessageEvent) => {
  const msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)!.resolve(msg); pending.delete(msg.id); return; }
  if (msg.method === "Runtime.exceptionThrown") consoleErrors.push(`EXCEPTION: ${(msg.params.exceptionDetails?.text ?? "") + " " + (msg.params.exceptionDetails?.exception?.description ?? "")}`.slice(0, 240));
  if (msg.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(msg.params.type)) consoleErrors.push(`CONSOLE: ${JSON.stringify(msg.params.args).slice(0, 200)}`);
  if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") consoleErrors.push(`LOG: ${msg.params.entry.text} ${msg.params.entry.url ?? ""}`.slice(0, 200));
};

function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const id = ++msgId;
  return new Promise((resolve) => { pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); });
}

async function evalJs(expression: string): Promise<any> {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(`eval failed: ${JSON.stringify(r.result.exceptionDetails).slice(0, 300)}`);
  return r.result?.result?.value;
}

// ── the in-page audit probe ──────────────────────────────────────────────────
const PROBE = `(() => {
  const px = (v) => parseFloat(v) || 0;
  const toRgb = (s) => { const m = s.match(/[\\d.]+/g); return m ? m.slice(0,3).map(Number) : null; };
  const lum = (c) => { const f = c.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2]; };
  const ratio = (a,b) => { const [x,y] = [lum(a), lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
  // resolve effective background by walking up
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = toRgb(getComputedStyle(n).backgroundColor);
      const alpha = parseFloat((getComputedStyle(n).backgroundColor.match(/[\\d.]+/g)||[])[3] ?? '1');
      if (bg && alpha > 0.6) return bg;
      n = n.parentElement;
    }
    return [10,11,13];
  };

  const out = { overflow: null, tapTargets: [], contrast: [], lime: [], headings: [], focusable: 0, noFocusVisible: [], radii: {}, fontSizes: {}, ariaIssues: [] };

  // horizontal overflow
  const de = document.documentElement;
  out.overflow = { scrollW: de.scrollWidth, clientW: de.clientWidth, over: de.scrollWidth > de.clientWidth + 1 };
  if (out.overflow.over) {
    out.overflow.culprits = [...document.querySelectorAll('*')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > de.clientWidth + 1;
    }).slice(0, 12).map(el => ({ sel: el.tagName.toLowerCase() + (el.id?'#'+el.id:'') + (el.className && typeof el.className === 'string' ? '.'+el.className.trim().split(/\\s+/).slice(0,2).join('.') : ''), right: Math.round(el.getBoundingClientRect().right) }));
  }

  // interactive elements
  const INTERACTIVE = 'a[href], button, input, select, textarea, [role=button], [role=tab], [role=link], [tabindex]:not([tabindex="-1"])';
  const els = [...document.querySelectorAll(INTERACTIVE)];
  out.focusable = els.length;
  for (const el of els) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const label = (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().slice(0, 34);
    if (r.height < 44 || r.width < 44) {
      out.tapTargets.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0,44), label, w: Math.round(r.width), h: Math.round(r.height) });
    }
    // accessible name check for icon-only controls
    if (!label && !el.getAttribute('aria-labelledby') && !el.querySelector('img[alt]:not([alt=""])') && !el.getAttribute('title')) {
      out.ariaIssues.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0,44), issue: 'no accessible name' });
    }
  }

  // contrast of text nodes
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const txt = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
    if (!txt) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.4) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Outlined display type (color:transparent + -webkit-text-stroke) is drawn
    // by its STROKE colour, not its fill — measure that instead, or we report
    // a bogus 1.14:1 on perfectly legible lime numerals.
    const strokeW = parseFloat(cs.webkitTextStrokeWidth || '0') || 0;
    const strokeC = strokeW > 0 ? toRgb(cs.webkitTextStrokeColor || '') : null;
    const fg = (strokeC && parseFloat((cs.color.match(/[\\d.]+/g)||[])[3] ?? '1') === 0)
      ? strokeC : toRgb(cs.color);
    if (!fg) continue;
    const bg = bgOf(el);
    const cr = ratio(fg, bg);
    const fs = px(cs.fontSize), fw = parseInt(cs.fontWeight) || 400;
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const need = large ? 3.0 : 4.5;
    const key = cs.color + '|' + fs + '|' + fw;
    if (cr < need && !seen.has(key)) {
      seen.add(key);
      out.contrast.push({ ratio: +cr.toFixed(2), need, color: cs.color, fs, fw, sample: txt.slice(0, 40), cls: (typeof el.className === 'string' ? el.className : '').slice(0,40) });
    }
  }

  // lime usage census — where does lime appear and on what
  const LIME = ['198, 243, 46', '198,243,46'];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const hits = [];
    if (LIME.some(l => cs.color.includes(l))) hits.push('color');
    if (LIME.some(l => cs.backgroundColor.includes(l))) hits.push('bg');
    if (hits.length) {
      const interactive = el.matches(INTERACTIVE) || !!el.closest(INTERACTIVE);
      out.lime.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0,44), hits, interactive, txt: (el.textContent||'').trim().slice(0,28) });
    }
  }

  // heading hierarchy
  out.headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => ({ lvl: +h.tagName[1], fs: px(getComputedStyle(h).fontSize), fw: getComputedStyle(h).fontWeight, txt: h.textContent.trim().slice(0,34) }));

  // radius + font-size census (rhythm check)
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const rad = cs.borderTopLeftRadius;
    if (rad && rad !== '0px') out.radii[rad] = (out.radii[rad] || 0) + 1;
    const fs = cs.fontSize;
    if ((el.textContent||'').trim()) out.fontSizes[fs] = (out.fontSizes[fs] || 0) + 1;
  }
  return out;
})()`;

// Focus is checked by dispatching REAL Tab keypresses via CDP (programmatic
// .focus() does not engage the :focus-visible heuristic in Chrome).
const FOCUS_READ = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const hasOutline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
  const hasRing = cs.boxShadow && cs.boxShadow !== 'none';
  const matchesFV = (() => { try { return el.matches(':focus-visible'); } catch { return null; } })();
  const r = el.getBoundingClientRect();
  return {
    tag: el.tagName.toLowerCase(),
    cls: (typeof el.className === 'string' ? el.className : '').slice(0,40),
    label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0,30),
    visible: hasOutline || hasRing, matchesFV,
    outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor,
    inView: r.top >= -2 && r.bottom <= innerHeight + 2,
  };
})()`;

const results: Record<string, any> = {};

try {
  await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");

  for (const path of targets) {
    for (const [w, h, tag] of [[390, 844, "mobile"], [1280, 900, "desktop"]] as const) {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: tag === "mobile" });
      consoleErrors = [];
      await send("Page.navigate", { url: BASE + path });
      await sleep(path === "/" || path === "/demo" ? 2600 : 1700);
      const audit = await evalJs(PROBE);
      let focus: any = null;
      if (tag === "mobile") {
        // real Tab traversal → engages :focus-visible
        const bad: any[] = []; const seen: any[] = [];
        await evalJs(`document.body.focus(); document.activeElement && document.activeElement.blur();`);
        for (let i = 0; i < 45; i++) {
          await send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
          await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
          await sleep(40); // let any focus transition settle before measuring
          const f = await evalJs(FOCUS_READ);
          if (!f) continue;
          seen.push(f);
          if (!f.visible) bad.push(f);
        }
        focus = { checked: seen.length, bad, offscreen: seen.filter((s) => !s.inView).length };
      }
      results[`${path} @${tag}`] = { audit, focus, consoleErrors: [...consoleErrors] };
    }
  }
} finally {
  ws.close(); chrome.kill();
}

// ── report ───────────────────────────────────────────────────────────────────
for (const [key, r] of Object.entries(results)) {
  const a = r.audit;
  console.log(`\n${"═".repeat(72)}\n${key}\n${"═".repeat(72)}`);
  if (r.consoleErrors.length) console.log(`  ❌ CONSOLE ERRORS (${r.consoleErrors.length}):`), r.consoleErrors.slice(0, 6).forEach((e: string) => console.log(`     ${e}`));
  else console.log(`  ✓ no console errors`);
  if (a.overflow.over) { console.log(`  ❌ H-OVERFLOW scrollW=${a.overflow.scrollW} clientW=${a.overflow.clientW}`); (a.overflow.culprits || []).forEach((c: any) => console.log(`     ${c.sel} right=${c.right}`)); }
  else console.log(`  ✓ no horizontal overflow (${a.overflow.scrollW}/${a.overflow.clientW})`);
  if (a.tapTargets.length) { console.log(`  ⚠ TAP TARGETS <44px (${a.tapTargets.length}):`); a.tapTargets.slice(0, 14).forEach((t: any) => console.log(`     ${t.w}×${t.h}  ${t.tag}.${t.cls}  "${t.label}"`)); }
  else console.log(`  ✓ all tap targets ≥44px`);
  if (a.contrast.length) { console.log(`  ⚠ CONTRAST below AA (${a.contrast.length} unique):`); a.contrast.sort((x:any,y:any)=>x.ratio-y.ratio).slice(0, 12).forEach((c: any) => console.log(`     ${c.ratio}:1 (need ${c.need}) ${c.color} ${c.fs}px/${c.fw} .${c.cls} "${c.sample}"`)); }
  else console.log(`  ✓ contrast AA clean`);
  if (r.focus?.bad?.length) { console.log(`  ⚠ NO FOCUS RING (${r.focus.bad.length}/${r.focus.checked}):`); r.focus.bad.slice(0, 10).forEach((b: any) => console.log(`     ${b.tag}.${b.cls} "${b.label}"`)); }
  else if (r.focus) console.log(`  ✓ focus rings on all ${r.focus.checked} checked controls`);
  if (a.ariaIssues.length) { console.log(`  ⚠ NO ACCESSIBLE NAME (${a.ariaIssues.length}):`); a.ariaIssues.slice(0, 8).forEach((x: any) => console.log(`     ${x.tag}.${x.cls}`)); }
  const nonInteractiveLime = a.lime.filter((l: any) => !l.interactive);
  console.log(`  · lime elements: ${a.lime.length} (${a.lime.length - nonInteractiveLime.length} interactive / ${nonInteractiveLime.length} non-interactive)`);
  const hs = a.headings.map((h: any) => `h${h.lvl}`).join(" ");
  console.log(`  · headings: ${hs || "(none)"}`);
  const radKeys = Object.entries(a.radii).sort((x: any, y: any) => y[1] - x[1]).map(([k, v]) => `${k}×${v}`);
  console.log(`  · radii: ${radKeys.slice(0, 10).join("  ")}`);
  const fsKeys = Object.entries(a.fontSizes).sort((x: any, y: any) => y[1] - x[1]).map(([k, v]) => `${k}×${v}`);
  console.log(`  · font-sizes: ${fsKeys.slice(0, 14).join("  ")}  [${Object.keys(a.fontSizes).length} distinct]`);
}
console.log("\ndone.");
