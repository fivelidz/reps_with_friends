// Minimal CDP repro: does a match closed while a season is live get recorded?
import { spawn } from "node:child_process";
const APP = "http://localhost:4173/app";
const DEBUG_PORT = 9355;
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--window-size=390,844",
  `--remote-debugging-port=${DEBUG_PORT}`, "--user-data-dir=/tmp/rwf-repro-profile", "about:blank",
], { stdio: "ignore" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function getPageWs(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const list = (await r.json()) as { type: string; webSocketDebuggerUrl?: string }[];
      const p = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl!;
    } catch {}
    await sleep(250);
  }
  throw new Error("no CDP");
}
const ws = new WebSocket(await getPageWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map<number, { resolve: (v: any) => void }>();
ws.onmessage = (ev: MessageEvent) => {
  const m = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!.resolve(m); pending.delete(m.id); }
};
function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const id = ++msgId;
  return new Promise((resolve) => { pending.set(id, { resolve }); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expression: string): Promise<any> {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
}
async function clickBtn(text: string): Promise<boolean> {
  return evalJs(`(() => {
    const bs = [...document.querySelectorAll("button")];
    const b = bs.find(x => x.textContent.replace(/\\s+/g," ").includes(${JSON.stringify(text)}));
    if (!b) return false; b.click(); return true;
  })()`);
}

try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: APP });
  await sleep(600);
  await evalJs(`localStorage.clear()`);
  await send("Page.navigate", { url: APP });
  await sleep(900);

  // onboard + crew
  await evalJs(`(() => { const i = document.querySelector(".screen--onboard input"); i.value = "Repro"; i.dispatchEvent(new Event("input", {bubbles:true})); })()`);
  await evalJs(`document.querySelector(".tiercard--casual").click()`);
  await evalJs(`document.querySelector(".screen--onboard .rwf-btn--primary").click()`);
  await sleep(300);
  await evalJs(`(() => { const i = document.querySelector(".input"); i.value = "Repro Crew"; })()`);
  await clickBtn("CREATE & GET CODE");
  await sleep(300);

  // season FIRST
  await evalJs(`location.hash = "#/season"`);
  await sleep(300);
  await clickBtn("START SEASON");
  await sleep(400);
  console.log("season head:", await evalJs(`!!document.querySelector(".season-head")`));

  // match, close it fast (no demo crew → no sims)
  await evalJs(`location.hash = "#/new"`);
  await sleep(300);
  await evalJs(`[...document.querySelectorAll(".seg-btn")].find(b => b.textContent.trim() === "100").click()`);
  await clickBtn("CREATE MATCH");
  await sleep(400);
  await clickBtn("GO TO MATCH");
  await sleep(400);
  await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
  await clickBtn("LOG 50");
  await sleep(400);
  await evalJs(`[...document.querySelectorAll(".quickrow .chip")].find(c => c.textContent === "+50").click()`);
  await clickBtn("LOG 50");
  await sleep(700);
  console.log("on result:", await evalJs(`location.hash`));
  console.log("season.matches:", await evalJs(`JSON.stringify(JSON.parse(localStorage.getItem("rwf.state.v1")).season?.matches?.map(m=>m.matchId))`));

  await evalJs(`location.hash = "#/season"`);
  await sleep(400);
  console.log("ladderrows:", await evalJs(`document.querySelectorAll(".ladderrow").length`));
  console.log("emptystate:", await evalJs(`!!document.querySelector(".emptystate")`));
} finally {
  chrome.kill("SIGTERM");
}
