// WeCom (企业微信) group-robot transport — OUTBOUND ONLY, by design decision.
//
// Context: consumer WeChat has no group API (docs/28 — every "WeChat group
// bot" is a ToS-violating protocol hack). The one legal surface is WeCom's
// group robot webhook: a single POST per message, no inbound, no session.
// The founder approved outbound-only: WeCom groups receive battle
// broadcasts (standings, Daily Wins, recaps, season results) — logging
// happens in the hero app, exactly as the SOT dual-surface rules it.
//
// Setup: a group owner adds the built-in 群机器人 (group robot) in a WeCom
// group → copies the webhook URL → that key is this transport's config.
// Nothing else exists to integrate: no app review, no tokens beyond the key.

import type { ChatTransport } from "./chat-transport.ts";

const WECOM_API = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send";

export interface WeComOptions {
  /** The robot's webhook key (the ?key= param of the copied URL). */
  key: string;
  /** Per-robot rate limit is 20 msgs/min — enforce locally with a token bucket. */
  maxPerMinute?: number;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
}

export class WeComTransport implements ChatTransport {
  private key: string;
  private bucket: number[] = [];
  private maxPerMinute: number;
  private doFetch: typeof fetch;

  constructor(opts: WeComOptions) {
    if (!opts.key) throw new Error("WeComTransport needs the group-robot webhook key");
    this.key = opts.key;
    this.maxPerMinute = opts.maxPerMinute ?? 18; // headroom under the 20/min cap
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  /** Outbound broadcast to the robot's group. `to` is ignored — one robot, one group. */
  async send(text: string, _to?: string): Promise<void> {
    const now = Date.now();
    this.bucket = this.bucket.filter((t) => now - t < 60_000);
    if (this.bucket.length >= this.maxPerMinute) {
      throw new Error("WeCom rate limit: 18/min local cap reached (platform cap is 20)");
    }

    // WeCom markdown messages keep our card formatting (*bold*, newlines).
    const body = { msgtype: "markdown", markdown: { content: text.slice(0, 4096) } };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await this.doFetch(`${WECOM_API}?key=${encodeURIComponent(this.key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const j = (await r.json().catch(() => ({}))) as { errcode?: number; errmsg?: string };
      // WeCom answers 200 with an errcode body — check both.
      if (!r.ok || j.errcode !== 0) {
        throw new Error(`WeCom send failed: ${r.status} errcode=${j.errcode ?? "?"} ${j.errmsg ?? ""}`.trim());
      }
      this.bucket.push(now);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The webhook has no health endpoint — a 1-byte text probe is the cheapest check. */
  async health(): Promise<boolean> {
    try {
      await this.send("·", undefined);
      return true;
    } catch {
      return false;
    }
  }
}
