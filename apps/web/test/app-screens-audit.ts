// Drives the REAL app UI through onboard → crew → match → result → season at
// 390px and audits each screen: overflow, tap targets, contrast, lime census,
// sticky-overlap, and the primary-CTA rule (one lime CTA per screen).
// Run: bun apps/web/test/app-screens-audit.ts   (needs `bun serve.ts` on :4173)

import { spawn } from "node:child_process";

const PORT = 9377;
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--window-size=390,844", `--remote-debugging-port=${PORT}`,
  "--user-data-dir=/tmp/rwf-appaudit-profile", "about:blank",
], { stdio: "ignore" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() {
  for (let i = 0; i < 40; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json() as any[];
      const p = l.find((t) => t.type === "page" && t.webSocketDebuggerUrl); if (p) return p.webSocketDebuggerUrl; } catch {}
    await sleep(250);
  }
  throw new Error("no cdp");
}
const ws = new WebSocket(await wsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pend = new Map<number, any>(); let consoleErrors: string[] = [];
ws.onmessage = (ev: MessageEvent) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") consoleErrors.push(`EXC: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`.slice(0, 200));
  if (m.method === "Runtime.consoleAPICalled" && ["error", "assert"].includes(m.params.type)) consoleErrors.push(`ERR: ${JSON.stringify(m.params.args).slice(0, 160)}`);
};
const send = (method: string, params: any = {}) => new Promise<any>((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expr: string) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(`eval: ${JSON.stringify(r.result.exceptionDetails).slice(0, 240)}`);
  return r.result?.result?.value;
}

const SCREEN_PROBE = `(() => {
  const toRgb = (s) => { const m = s.match(/[\\d.]+/g); return m ? m.slice(0,3).map(Number) : null; };
  const lum = (c) => { const f = c.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2]; };
  const ratio = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
  const bgOf = (el) => { let n=el; while(n && n!==document.documentElement){ const cs=getComputedStyle(n); const c=toRgb(cs.backgroundColor); const a=parseFloat((cs.backgroundColor.match(/[\\d.]+/g)||[])[3] ?? '1'); if(c&&a>0.6) return c; n=n.parentElement;} return [10,11,13]; };
  const de = document.documentElement;
  const out = { overflow:{scrollW:de.scrollWidth, clientW:de.clientWidth, over:de.scrollWidth>de.clientWidth+1, culprits:[]},
    tap:[], contrast:[], limeCTAs:[], covered:[], headings:[], emptyStates:[] };
  if (out.overflow.over) out.overflow.culprits = [...document.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.right>de.clientWidth+1;}).slice(0,10).map(el=>({sel:el.tagName.toLowerCase()+'.'+((typeof el.className==='string'?el.className:'').trim().split(/\\s+/).slice(0,2).join('.')),right:Math.round(el.getBoundingClientRect().right)}));

  const INT = 'a[href], button, input, select, textarea, [role=button], [tabindex]:not([tabindex="-1"])';
  for (const el of document.querySelectorAll(INT)) {
    const cs = getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden') continue;
    const r = el.getBoundingClientRect(); if (r.width===0&&r.height===0) continue;
    const label=(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,30);
    if (r.height<44||r.width<44) out.tap.push({w:Math.round(r.width),h:Math.round(r.height),cls:(typeof el.className==='string'?el.className:'').slice(0,40),label});
    // lime-filled CTA census (background is lime => primary)
    const bgc = cs.backgroundColor.replace(/\s/g,'');
    const solid = bgc === 'rgb(198,243,46)' || bgc === 'rgba(198,243,46,1)';
    const tint = !solid && cs.backgroundColor.includes('198, 243, 46');
    if (solid || tint) out.limeCTAs.push({raw: cs.backgroundColor, kind: solid?'SOLID':'tint', cls:(typeof el.className==='string'?el.className:'').slice(0,40),label,w:Math.round(r.width),h:Math.round(r.height)});
  }
  const seen=new Set();
  for (const el of document.querySelectorAll('#app *')) {
    const txt=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
    if(!txt) continue; const cs=getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||parseFloat(cs.opacity)<0.4) continue;
    const r=el.getBoundingClientRect(); if(r.width===0||r.height===0) continue;
    const fg=toRgb(cs.color); if(!fg) continue;
    const cr=ratio(fg,bgOf(el)); const fs=parseFloat(cs.fontSize); const fw=parseInt(cs.fontWeight)||400;
    const need=(fs>=24||(fs>=18.66&&fw>=700))?3:4.5;
    const key=cs.color+'|'+fs+'|'+fw;
    if(cr<need&&!seen.has(key)){seen.add(key);out.contrast.push({ratio:+cr.toFixed(2),need,color:cs.color,fs,fw,cls:(typeof el.className==='string'?el.className:'').slice(0,36),sample:txt.slice(0,36)});}
  }
  // sticky/fixed elements covering content at the bottom
  for (const el of document.querySelectorAll('#app *, #nav, #toasts')) {
    const cs=getComputedStyle(el);
    if(cs.position!=='sticky'&&cs.position!=='fixed') continue;
    const r=el.getBoundingClientRect(); if(r.height===0) continue;
    out.covered.push({cls:(typeof el.className==='string'?el.className:el.id||'').slice(0,36),pos:cs.position,top:Math.round(r.top),bottom:Math.round(r.bottom),h:Math.round(r.height),z:cs.zIndex});
  }
  out.headings=[...document.querySelectorAll('h1,h2,h3,h4')].map(h=>({lvl:+h.tagName[1],txt:h.textContent.trim().slice(0,30),fs:getComputedStyle(h).fontSize}));
  out.emptyStates=[...document.querySelectorAll('.emptystate')].map(e=>({txt:e.textContent.trim().slice(0,60),hasCTA:!!e.querySelector('button,a')}));
  out.screenClass=(document.querySelector('.screen')||{}).className||'';
  return out;
})()`;

const STATE_JSON = "{\"v\":1,\"me\":{\"id\":\"p_vq2eya1\",\"name\":\"Alexei\",\"tier\":\"casual\"},\"crew\":{\"name\":\"Thursday Legends\",\"code\":\"4ESWFF\"},\"matches\":[{\"config\":{\"id\":\"m_yy040do\",\"exercises\":[{\"id\":\"pushup\",\"name\":\"Push-ups\"},{\"id\":\"squat\",\"name\":\"Squats\"},{\"id\":\"burpee\",\"name\":\"Burpees\"}],\"targetReps\":300,\"playDays\":[1,3,5]},\"players\":[{\"id\":\"p_vq2eya1\",\"name\":\"Alexei\",\"tier\":\"casual\"},{\"id\":\"sim_sam\",\"name\":\"Sam\",\"tier\":\"fit\"},{\"id\":\"sim_priya\",\"name\":\"Priya\",\"tier\":\"casual\"},{\"id\":\"sim_dex\",\"name\":\"Dex\",\"tier\":\"couch\"}],\"entries\":[{\"playerId\":\"p_vq2eya1\",\"exerciseId\":\"pushup\",\"reps\":42,\"at\":1787792743541,\"verified\":true},{\"playerId\":\"sim_dex\",\"exerciseId\":\"squat\",\"reps\":60,\"at\":1787792743541,\"verified\":false,\"comeback\":true},{\"playerId\":\"sim_priya\",\"exerciseId\":\"burpee\",\"reps\":25,\"at\":1787792743541,\"verified\":false,\"comeback\":true}],\"status\":\"live\",\"startedAt\":1787792743540}],\"pots\":{\"m_yy040do\":{\"id\":\"pot_buv7275\",\"matchId\":\"m_yy040do\",\"contributions\":[{\"playerId\":\"p_vq2eya1\",\"amountCents\":500},{\"playerId\":\"sim_sam\",\"amountCents\":500},{\"playerId\":\"sim_priya\",\"amountCents\":500},{\"playerId\":\"sim_dex\",\"amountCents\":500}]}},\"season\":{\"config\":{\"id\":\"sn_5cbmegy\",\"name\":\"Season 2\",\"weeks\":4,\"startedAt\":1787792743540},\"matches\":[],\"potCents\":0,\"forgiven\":[]},\"seasonHistory\":[],\"mvp\":{}}";
const MID = "m_yy040do";
const SCREENS: [string,string][] = [
  ["1-home", "#/"], ["2-crew", "#/crew"], ["3-match", "#/match/" + MID],
  ["4-new-match", "#/new"], ["5-season", "#/season"], ["6-profile", "#/profile"],
  ["7-link", "#/link/" + MID],
];

const results: Record<string, any> = {};
async function capture(name: string) {
  await sleep(650);
  const a = await ev(SCREEN_PROBE);
  results[name] = { a, errs: [...consoleErrors] }; consoleErrors = [];
}
const click = async (sel: string) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'MISSING'; e.click(); return 'ok';})()`);

try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: "http://localhost:4173/app" });
  await sleep(1500);
  // seed a realistic mid-match state (generated via the real state.ts module)
  await ev("localStorage.setItem('rwf.state.v1', " + JSON.stringify(STATE_JSON) + ")");
  // reload so the app boots FROM the seeded state (state is read once at load)
  await send("Page.navigate", { url: "http://localhost:4173/app" });
  await sleep(1500);

  for (const [name, hash] of SCREENS) {
    await ev("location.hash=" + JSON.stringify(hash));
    await sleep(320);
    await ev("document.getElementById('app').scrollTop = 0");
    await capture(name);
  }
  await ev("localStorage.clear()");
  await send("Page.navigate", { url: "http://localhost:4173/app" });
  await sleep(1400);
  await capture("0-onboard");
} finally { ws.close(); chrome.kill(); }

for (const [k, { a, errs }] of Object.entries(results) as any) {
  console.log(`\n${"─".repeat(70)}\n${k}   [.screen${a.screenClass ? " " + a.screenClass : ""}]\n${"─".repeat(70)}`);
  if (errs.length) { console.log(`  ❌ console: ${errs.length}`); errs.slice(0,4).forEach((e:string)=>console.log(`     ${e}`)); }
  if (a.overflow.over) { console.log(`  ❌ overflow ${a.overflow.scrollW}>${a.overflow.clientW}`); a.overflow.culprits.forEach((c:any)=>console.log(`     ${c.sel} right=${c.right}`)); }
  if (a.tap.length) { console.log(`  ⚠ tap<44 (${a.tap.length}):`); a.tap.slice(0,8).forEach((t:any)=>console.log(`     ${t.w}×${t.h} .${t.cls} "${t.label}"`)); }
  if (a.contrast.length) { console.log(`  ⚠ contrast (${a.contrast.length}):`); a.contrast.sort((x:any,y:any)=>x.ratio-y.ratio).slice(0,6).forEach((c:any)=>console.log(`     ${c.ratio}:1/${c.need} ${c.fs}px .${c.cls} "${c.sample}"`)); }
  const solids = a.limeCTAs.filter((c:any)=>c.kind==='SOLID');
  console.log(`  · SOLID-lime CTAs: ${solids.length}${solids.length>1?"  ⚠ VIOLATION >1 per screen":""}  ${solids.map((c:any)=>`"${c.label}"`).join(" ")}`);
  const tints = a.limeCTAs.filter((c:any)=>c.kind==='tint');
  if (tints.length) console.log(`  · lime-tint: ${tints.map((c:any)=>`"${c.label}"[${c.raw}]`).join(" ")}`);
  if (a.covered.length) console.log(`  · sticky/fixed: ${a.covered.map((c:any)=>`.${c.cls}@${c.top}-${c.bottom}(z${c.z})`).join("  ")}`);
  console.log(`  · headings: ${a.headings.map((h:any)=>`h${h.lvl}(${h.fs})`).join(" ")||"(none)"}`);
  if (a.emptyStates.length) console.log(`  · empty states: ${a.emptyStates.map((e:any)=>`${e.hasCTA?"✓CTA":"✗noCTA"} "${e.txt.slice(0,40)}"`).join(" | ")}`);
}
console.log("\ndone.");
