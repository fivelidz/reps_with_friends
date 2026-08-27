// Reusable headless-Chromium CDP driver for the public-surface E2E sweep.
// Spawns one browser, exposes navigate/eval/click/type/screenshot + a network
// recorder (so we can assert "zero /api/ai fetches" for prebaked chips) and a
// console-error collector. Used by apps/web/test/public-e2e.ts.
//
// Deliberately dependency-free (no puppeteer): raw CDP over WebSocket, same
// approach as design-audit.ts.

import { spawn, type ChildProcess } from "node:child_process";

export const BASE = "http://localhost:4173";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type NetReq = { url: string; method: string };

export class Cdp {
  private ws!: WebSocket;
  private chrome!: ChildProcess;
  private msgId = 0;
  private pending = new Map<number, (v: any) => void>();

  consoleErrors: string[] = [];
  requests: NetReq[] = [];

  constructor(private port = 9422, private profile = "/tmp/rwf-e2e-profile") {}

  async start(reducedMotion = false) {
    const args = [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
      "--window-size=390,844", `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.profile}`,
      // deterministic canvas/WebGL so pixel checks are stable headless
      "--use-gl=swiftshader", "--enable-unsafe-swiftshader",
      "--disable-features=EyeDropper",
    ];
    if (reducedMotion) args.push("--force-prefers-reduced-motion=reduce");
    args.push("about:blank");
    this.chrome = spawn("/usr/bin/chromium", args, { stdio: "ignore" });

    const wsUrl = await this.discover();
    this.ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });

    this.ws.onmessage = (ev: MessageEvent) => {
      const msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
      if (msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)!(msg); this.pending.delete(msg.id); return; }
      switch (msg.method) {
        case "Runtime.exceptionThrown": {
          const d = msg.params.exceptionDetails;
          this.consoleErrors.push(`EXCEPTION: ${(d?.text ?? "") + " " + (d?.exception?.description ?? "")}`.slice(0, 300));
          break;
        }
        case "Runtime.consoleAPICalled":
          if (["error", "assert"].includes(msg.params.type))
            this.consoleErrors.push(`CONSOLE: ${JSON.stringify(msg.params.args).slice(0, 240)}`);
          break;
        case "Log.entryAdded":
          if (msg.params.entry.level === "error")
            this.consoleErrors.push(`LOG: ${msg.params.entry.text} ${msg.params.entry.url ?? ""}`.slice(0, 240));
          break;
        case "Network.requestWillBeSent":
          this.requests.push({ url: msg.params.request.url, method: msg.params.request.method });
          break;
      }
    };

    await this.send("Runtime.enable");
    await this.send("Log.enable");
    await this.send("Page.enable");
    await this.send("Network.enable");
  }

  private async discover(): Promise<string> {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${this.port}/json/list`);
        const list = (await r.json()) as { type: string; webSocketDebuggerUrl?: string }[];
        const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl!;
      } catch { /* not up yet */ }
      await sleep(250);
    }
    throw new Error("chromium CDP never came up");
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.msgId;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval<T = any>(expression: string): Promise<T> {
    const r = await this.send("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    const ex = r.result?.exceptionDetails;
    if (ex) throw new Error(`eval failed: ${ex.text} ${ex.exception?.description ?? ""}`.slice(0, 400));
    return r.result?.result?.value;
  }

  async viewport(width: number, height: number, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile,
    });
  }

  /** Navigate and settle. Clears console errors + network log for a clean slate. */
  async goto(path: string, settleMs = 1800) {
    this.consoleErrors = [];
    this.requests = [];
    await this.send("Page.navigate", { url: BASE + path });
    await sleep(settleMs);
  }

  /** Real trusted mouse click at an element's centre (engages :active, gestures). */
  async click(selector: string) {
    const box = await this.eval<{ x: number; y: number } | null>(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (!box) throw new Error(`click: no element ${selector}`);
    for (const type of ["mousePressed", "mouseReleased"] as const) {
      await this.send("Input.dispatchMouseEvent", {
        type, x: box.x, y: box.y, button: "left", clickCount: 1,
      });
    }
    await sleep(120);
  }

  async typeInto(selector: string, text: string) {
    await this.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    for (const ch of text) {
      await this.send("Input.dispatchKeyEvent", { type: "char", text: ch });
    }
    await sleep(80);
  }

  async pressTab() {
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
    await sleep(40);
  }

  async screenshot(dest: string) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    if (r.result?.data) await Bun.write(dest, Buffer.from(r.result.data, "base64"));
  }

  /**
   * Hash the COMPOSITED pixels of an element's box.
   *
   * Use this (not gl.readPixels) to tell "still animating" from "frozen":
   * these canvases use preserveDrawingBuffer:false, so a frozen scene simply
   * stops drawing and its drawing buffer reads back empty — indistinguishable
   * from a blank canvas. The compositor still shows the last painted frame,
   * which is what the user sees, and what a screenshot captures.
   */
  async regionHash(selector: string): Promise<{ hash: number; bytes: number }> {
    const box = await this.eval<{ x: number; y: number; width: number; height: number } | null>(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      return { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top)),
               width: Math.round(r.width), height: Math.round(r.height) };
    })()`);
    if (!box) throw new Error(`regionHash: no visible element ${selector}`);
    const r = await this.send("Page.captureScreenshot", {
      format: "png", clip: { ...box, scale: 1 }, captureBeyondViewport: false,
    });
    const data: string = r.result?.data ?? "";
    const buf = Buffer.from(data, "base64");
    let h = 0;
    for (let i = 0; i < buf.length; i++) h = (Math.imul(h, 31) + buf[i]) >>> 0;
    return { hash: h, bytes: buf.length };
  }

  /** Requests matching a substring since the last goto/resetNet. */
  matching(substr: string): NetReq[] {
    return this.requests.filter((r) => r.url.includes(substr));
  }
  resetNet() { this.requests = []; }

  async stop() {
    try { this.ws.close(); } catch { /* already gone */ }
    try { this.chrome.kill(); } catch { /* already gone */ }
  }
}

// ── tiny assertion collector ────────────────────────────────────────────────
export type Check = { surface: string; vp: string; name: string; ok: boolean; detail: string };

export class Report {
  checks: Check[] = [];
  surface = "?";
  vp = "?";

  ctx(surface: string, vp: string) { this.surface = surface; this.vp = vp; }

  ok(name: string, cond: boolean, detail = "") {
    this.checks.push({ surface: this.surface, vp: this.vp, name, ok: !!cond, detail });
    const mark = cond ? "✓" : "✗";
    console.log(`  ${mark} [${this.vp}] ${name}${detail ? ` — ${detail}` : ""}`);
    return !!cond;
  }

  fails() { return this.checks.filter((c) => !c.ok); }

  table() {
    const bySurface = new Map<string, { pass: number; fail: number }>();
    for (const c of this.checks) {
      const e = bySurface.get(c.surface) ?? { pass: 0, fail: 0 };
      c.ok ? e.pass++ : e.fail++;
      bySurface.set(c.surface, e);
    }
    console.log(`\n${"═".repeat(64)}\nSURFACE SUMMARY\n${"═".repeat(64)}`);
    console.log(`${"surface".padEnd(18)} ${"pass".padStart(5)} ${"fail".padStart(5)}  status`);
    for (const [s, e] of bySurface) {
      console.log(`${s.padEnd(18)} ${String(e.pass).padStart(5)} ${String(e.fail).padStart(5)}  ${e.fail ? "❌ FAIL" : "✅ PASS"}`);
    }
    const f = this.fails();
    if (f.length) {
      console.log(`\n${"─".repeat(64)}\nFAILURES (${f.length})\n${"─".repeat(64)}`);
      for (const c of f) console.log(`  ✗ ${c.surface} [${c.vp}] ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    }
    return f.length;
  }
}
