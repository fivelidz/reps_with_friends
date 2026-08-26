// Live AI verification against the running server (:4173):
// create a match → demo crew → wait for sim entries → NARRATE → AI callout
// renders with real commentary; comeback badge appears once I'm >30% behind.
import { spawn } from "node:child_process";

const APP = "http://localhost:4173/app";
const DEBUG_PORT = 9339;
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--user-data-dir=/tmp/rwf-cdp-ai",
  "about:blank",
], { stdio: "ignore" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let wsUrl = "";
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      wsUrl = (await r.json()).find((t: any) => t.type === "page")?.webSocketDebuggerUrl ?? "";
    } catch {}
    if (!wsUrl) await sleep(250);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  let msgId = 0;
  const pending = new Map();
  const errors: string[] = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === "Runtime.exceptionThrown")
      errors.push(JSON.stringify(msg.params.exceptionDetails.exception?.description ?? msg.params).slice(0, 300));
  };
  const send = (method: string, params: any = {}) =>
    new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expression: string) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };
  const clickBtn = (needle: string) =>
    evalJs(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("${needle}"))?.click() ?? false`);

  await send("Page.navigate", { url: APP });
  await sleep(1200);
  // fresh state → onboard quickly if needed
  if (await evalJs(`!JSON.parse(localStorage.getItem("rwf.state.v1") ?? "null")?.me`)) {
    await evalJs(`(() => { const i = document.querySelector(".input"); i.value = "AI Tester"; i.dispatchEvent(new Event("input")); })()`);
    await evalJs(`[...document.querySelectorAll(".tiercard")][1].click()`);
    await clickBtn("START MOVING");
    await sleep(400);
    await evalJs(`(() => { const i = document.querySelector(".input"); i.value = "AI Crew"; })()`);
    await clickBtn("CREATE & GET CODE");
    await sleep(400);
  }
  // create a match
  await evalJs(`location.hash = "#/new"`);
  await sleep(400);
  await clickBtn("CREATE MATCH");
  await sleep(400);
  await clickBtn("ADD DEMO CREW");
  await sleep(300);
  await clickBtn("GO TO MATCH");
  await sleep(500);
  console.log("on match screen:", await evalJs(`location.hash.startsWith("#/match/")`));

  // comeback badge: I have 0 score; first sim entry makes me >30% behind
  let badge = false;
  for (let i = 0; i < 14 && !badge; i++) {
    await sleep(3000);
    badge = await evalJs(`!!document.querySelector(".cbk-badge")`);
  }
  console.log("comeback badge visible on my row:", badge);
  if (badge) console.log("  badge text:", await evalJs(`document.querySelector(".cbk-badge")?.textContent`));

  // AI narrator
  await clickBtn("NARRATE");
  let callout = "";
  for (let i = 0; i < 24 && !callout; i++) {
    await sleep(500);
    callout = await evalJs(`document.querySelector(".ai-callout-text")?.textContent ?? ""`);
  }
  console.log("AI narration rendered:", callout ? "YES" : "NO");
  if (callout) console.log("  🎙️", callout);

  // narration cached across re-render (sim logs trigger touch → re-render)
  await sleep(3500);
  const cached = await evalJs(`document.querySelector(".ai-callout-text")?.textContent ?? ""`);
  console.log("narration cached across re-renders:", cached === callout && callout !== "");

  console.log("console errors:", errors.length === 0 ? "0" : errors.join(" | "));
  chrome.kill("SIGTERM");
  process.exit(errors.length ? 1 : 0);
}
main().catch((e) => { console.error(e); chrome.kill("SIGTERM"); process.exit(1); });
