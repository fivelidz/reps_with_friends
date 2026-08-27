// Probe: which CDN loading strategy for TF.js + MoveNet actually works in Chromium?
// Run: bun apps/web/test/cdn-probe.ts
import { spawn } from "node:child_process";

const DEBUG_PORT = 9377;
const chrome = spawn("/usr/bin/chromium", [
  "--headless=new", "--disable-gpu", "--no-sandbox",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=/tmp/rwf-cdn-probe-${Date.now()}`, "about:blank",
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

// ── Strategy A: ESM dynamic imports (jsdelivr +esm, versions pinned to match pose-detection's peers)
const esm = await evalJs(`(async () => {
  const t0 = performance.now();
  try {
    const core = await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core@4.10.0/+esm");
    await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@4.10.0/+esm");
    const pd = await import("https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/+esm");
    const ok = await core.setBackend("webgl");
    await core.ready();
    const det = await pd.createDetector(pd.SupportedModels.MoveNet, {
      modelType: (pd.movenet && pd.movenet.modelType.SINGLEPOSE_LIGHTNING) || "SinglePose.Lightning",
    });
    const ms = Math.round(performance.now() - t0);
    det.dispose();
    return { ok: true, backend: core.getBackend(), ms, hasMovenet: !!pd.movenet };
  } catch (e) {
    return { ok: false, err: String(e && e.message || e).slice(0, 300) };
  }
})()`);
console.log("A) ESM +esm dynamic import:", JSON.stringify(esm));

// ── Strategy B: UMD script injection (documented TF.js path)
const umd = await evalJs(`(async () => {
  const t0 = performance.now();
  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = () => res(null); s.onerror = () => rej(new Error("load fail " + src));
    document.head.append(s);
  });
  try {
    await load("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js");
    await load("https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js");
    const tf = (window).tf, pd = (window).poseDetection;
    await tf.setBackend("webgl"); await tf.ready();
    const det = await pd.createDetector(pd.SupportedModels.MoveNet, { modelType: "SinglePose.Lightning" });
    const ms = Math.round(performance.now() - t0);
    det.dispose();
    return { ok: true, backend: tf.getBackend(), ms };
  } catch (e) {
    return { ok: false, err: String(e && e.message || e).slice(0, 300) };
  }
})()`);
console.log("B) UMD script injection:", JSON.stringify(umd));

chrome.kill();
process.exit(0);
