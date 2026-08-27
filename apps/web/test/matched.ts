// Print all CSS rules Chromium actually matched for a selector.
// bun apps/web/test/matched.ts <path> '<selector>' [width]
import { spawn } from "node:child_process";
const path = process.argv[2] ?? "/";
const sel = process.argv[3] ?? "body";
const width = Number(process.argv[4] ?? 390);
const PORT = 9366;
const chrome = spawn("/usr/bin/chromium", ["--headless=new","--disable-gpu","--no-sandbox","--hide-scrollbars",`--window-size=${width},844`,`--remote-debugging-port=${PORT}`,"--user-data-dir=/tmp/rwf-matched-profile","about:blank"], { stdio: "ignore" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function wsUrl() { for (let i=0;i<40;i++){ try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json() as any[]; const p = l.find(t=>t.type==="page"&&t.webSocketDebuggerUrl); if(p) return p.webSocketDebuggerUrl; } catch {} await sleep(250);} throw new Error("no cdp"); }
const ws = new WebSocket(await wsUrl());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id=0; const pend=new Map<number,any>();
ws.onmessage=(ev:MessageEvent)=>{const m=JSON.parse(String(ev.data)); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);} };
const send=(method:string,params:any={})=>new Promise<any>(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});

await send("Page.enable"); await send("DOM.enable"); await send("CSS.enable");
await send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width < 700 });
await send("Page.navigate", { url: "http://localhost:4173" + path });
await sleep(2200);
const doc = await send("DOM.getDocument", { depth: -1 });
const q = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: sel });
const nodeId = q.result?.nodeId;
if (!nodeId) { console.log("selector not found:", sel); ws.close(); chrome.kill(); process.exit(1); }
const m = await send("CSS.getMatchedStylesForNode", { nodeId });
console.log("=== INLINE ==="); console.log((m.result.inlineStyle?.cssText ?? "(none)"));
console.log("\n=== MATCHED RULES (last wins) ===");
for (const r of m.result.matchedCSSRules ?? []) {
  const origin = r.rule.origin; const selText = r.rule.selectorList.text;
  const src = r.rule.styleSheetId ? "" : "";
  const props = r.rule.style.cssProperties.filter((p: any) => p.text).map((p: any) => p.text).join("; ");
  console.log(`[${origin}] ${selText}\n    ${props.slice(0, 400)}`);
}
console.log("\n=== INHERITED width/display-relevant ===");
for (const inh of m.result.inherited ?? []) {
  for (const r of inh.matchedCSSRules ?? []) {
    const props = r.rule.style.cssProperties.filter((p: any) => /width|display|grid|flex|zoom|font/.test(p.name)).map((p: any) => p.text).join("; ");
    if (props) console.log(`${r.rule.selectorList.text} → ${props.slice(0,200)}`);
  }
}
ws.close(); chrome.kill();
