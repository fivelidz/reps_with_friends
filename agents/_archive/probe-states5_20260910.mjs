/* probe: replicate e2e-states section 5 setup and dump the snapshot */
import { spawn } from "node:child_process";

const CHROMIUM = "/usr/bin/chromium";
const CDP_PORT = 9621;
process.env.RWF_API_DB = `/tmp/rwf-probe-api-${Date.now()}.json`;
process.env.RWF_SOT_DB = `/tmp/rwf-probe-sot-${Date.now()}.json`;
const { startServer } = await import("../api/src/main.ts");
const api = startServer(0);
const API_BASE = `http://127.0.0.1:${api.port}`;
console.log("api on", API_BASE);

const server = Bun.serve({
  port: 4195,
  async fetch(req) {
    const p = new URL(req.url).pathname;
    if (p === "/sot-engine.js") return new Response(Bun.file("apps/sot-engine.js"), { headers: { "content-type": "text/javascript" } });
    const f = Bun.file("apps/sot" + (p === "/" ? "/index.html" : p));
    if (await f.exists()) return new Response(f);
    return new Response("nope", { status: 404 });
  },
});

const proc = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
  `--remote-debugging-port=${CDP_PORT}`, "--window-size=390,844",
  `--user-data-dir=/tmp/rwf-probe-${Date.now()}`,
  "--no-first-run", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
process.on("exit", () => { try { proc.kill("SIGKILL"); } catch {} });

for (let i = 0; i < 100; i++) {
  try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) break; } catch {}
  await Bun.sleep(150);
}
const tab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  const on = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id === mid) { ws.removeEventListener("message", on); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
  };
  ws.addEventListener("message", on);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const errors = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
  if (m.method === "Runtime.exceptionThrown") errors.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
});
await send("Runtime.enable");
await send("Page.enable");
const evalJs = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

await send("Page.navigate", { url: "http://127.0.0.1:4195/" });
await Bun.sleep(2500);
// seed the demo crew like the suite does (click through)
await evalJs(`[...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('Jump into a live demo battle'))?.click()`);
await Bun.sleep(900);

const out = await evalJs(`(async () => {
  RWFCloud.setMode("cloud");
  RWFCloud.setApiBase(${JSON.stringify(API_BASE)});
  const g = RWFSoT.createGroup({ mode: "individual", name: "Cloud Crew", icon: "⚡", color: "#a06bff",
    activeDays: [0, 1, 2, 3, 4, 5, 6], target: 200, clockMode: "duration", durationMin: 60,
    stake: { type: "none" },
    housePlayers: [{ name: "Marco", tier: "casual" }, { name: "Priya", tier: "fit" }, { name: "Jack", tier: "couch" }] });
  const made = await RWFCloud.createForLocalGroup(g);
  if (made && made.error) return { error: made.error };
  RWFSoT.startSeason(g.id);
  const synced = await RWFCloud.resync(g.id);
  RWFSoT.state.activeGroupId = g.id; RWFSoT.save();
  return { code: g.cloud.code, made: { ok: made.ok, code: made.code }, synced, meId: RWFSoT.state.me.id };
})()`);
console.log("setup:", JSON.stringify(out));
await Bun.sleep(1500);
const snap = await evalJs(`(() => { const s = RWFSoT.snapshot(); return {
  battle: s.battle ? { idx: s.battle.idx, status: s.battle.status, hasCore: !!s.battle.core, coreStatus: s.battle.core && s.battle.core.status } : null,
  board: s.board.length,
  inv: s.me.inventory,
  gid: s.group.id, active: RWFSoT.state.activeGroupId === s.group.id,
  cloud: s.group.cloud ? { code: s.group.cloud.code, pid: s.group.cloud.pid } : null,
}; })()`);
console.log("snap:", JSON.stringify(snap, null, 1));
console.log("console errors:", errors.length ? errors : "none");
proc.kill("SIGKILL");
server.stop(true);
api.stop(true);
