// WeCom outbound transport tests — mocked fetch, no network.

import { describe, test, expect } from "bun:test";
import { WeComTransport } from "../src/transports/wecom.ts";

function mockFetch(log: any[]) {
  return (async (url: any, init: any) => {
    log.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ errcode: 0, errmsg: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

describe("WeComTransport", () => {
  test("sends markdown to the webhook with the key", async () => {
    const log: any[] = [];
    const t = new WeComTransport({ key: "TEST-KEY", fetchImpl: mockFetch(log) });
    await t.send("*Standings*\n1. Dave", "ignored");
    expect(log).toHaveLength(1);
    expect(log[0].url).toContain("qyapi.weixin.qq.com/cgi-bin/webhook/send?key=TEST-KEY");
    expect(log[0].body.msgtype).toBe("markdown");
    expect(log[0].body.markdown.content).toContain("Standings");
  });

  test("surfaces WeCom errcode as an exception (HTTP 200 + errcode!=0)", async () => {
    const t = new WeComTransport({
      key: "K",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ errcode: 93000, errmsg: "invalid webhook key" }), {
          status: 200,
        })) as unknown as typeof fetch,
    });
    await expect(t.send("x")).rejects.toThrow(/93000/);
  });

  test("local rate cap (default 18/min) protects the 20/min platform cap", async () => {
    const t = new WeComTransport({ key: "K", fetchImpl: mockFetch([]) });
    for (let i = 0; i < 18; i++) await t.send("m" + i);
    await expect(t.send("over")).rejects.toThrow(/rate limit/);
  });

  test("truncates overlong messages to WeCom's 4096-byte markdown cap", async () => {
    const log: any[] = [];
    const t = new WeComTransport({ key: "K", fetchImpl: mockFetch(log) });
    await t.send("x".repeat(9000));
    expect(log[0].body.markdown.content.length).toBeLessThanOrEqual(4096);
  });

  test("health() probes without throwing", async () => {
    const t = new WeComTransport({ key: "K", fetchImpl: mockFetch([]) });
    expect(await t.health()).toBe(true);
    const dead = new WeComTransport({
      key: "K",
      fetchImpl: (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
    });
    expect(await dead.health()).toBe(false);
  });

  test("requires a key", () => {
    expect(() => new WeComTransport({ key: "" })).toThrow(/key/);
  });
});
