// One-off debug: drive to result screen, click an MVP chip, dump the FULL
// uncaught exception (browser.ts truncates at 300 chars).
import { spawn } from "node:child_process";

const APP = "http://localhost:4173/app";
const DEBUG_PORT = 9337;
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--user-data-dir=/tmp/rwf-cdp-profile",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let wsUrl = "";
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const list = await r.json();
      wsUrl = list.find((t: any) => t.type === "page")?.webSocketDebuggerUrl ?? "";
    } catch {}
    if (!wsUrl) await sleep(250);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === "Runtime.exceptionThrown") {
      console.log("=== EXCEPTION ===");
      console.log(JSON.stringify(msg.params.exceptionDetails, null, 2).slice(0, 2500));
    }
  };
  const send = (method: string, params: any = {}) =>
    new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expression: string) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) console.log("EVAL THROW:", JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    return r.result?.result?.value;
  };

  await send("Page.navigate", { url: APP });
  await sleep(1200);
  // reuse persisted state from the earlier browser.ts run: onboarded + crew + season + completed match
  const hash = await evalJs("location.hash");
  console.log("hash after load:", hash);
  const hasResult = await evalJs(`!!JSON.parse(localStorage.getItem('rwf.state.v1')).matches.find(m => m.status === 'complete')`);
  console.log("has completed match:", hasResult);
  if (hasResult) {
    const id = await evalJs(`JSON.parse(localStorage.getItem('rwf.state.v1')).matches.find(m => m.status === 'complete').config.id`);
    await evalJs(`location.hash = '#/result/${id}'`);
    await sleep(600);
    console.log("mvp chips:", await evalJs(`document.querySelectorAll('.mvp-chip').length`));
    await evalJs(`document.querySelectorAll('.mvp-chip')[1]?.click()`);
    await sleep(800);
    console.log("locked:", await evalJs(`!!document.querySelector('.mvp-locked')`));
  }
  await sleep(600);
  chrome.kill("SIGTERM");
  process.exit(0);
}
main().catch((e) => { console.error(e); chrome.kill("SIGTERM"); process.exit(1); });
