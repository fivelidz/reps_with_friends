// @rwf/api — wiki feedback tests (docs/22 §11). Real HTTP against an
// ephemeral-port server with an isolated temp store, plus direct module
// calls (the same functions serve.ts's fallback uses). Covers: create with
// defaults, validation caps, per-page + recent reads (newest first), the
// same-text dedupe, persistence, clamping and the per-IP rate limit.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  addFeedback,
  feedbackPath,
  listRecent,
  loadFeedback,
  RATE_MAX,
} from "../src/feedback.ts";
import { startServer } from "../src/main.ts";

let server: Bun.Server;
let base: string;

beforeAll(() => {
  // Isolated store per run — never touches the real .data/feedback.json.
  process.env.RWF_FEEDBACK_DB = `/tmp/rwf-feedback-test-${crypto.randomUUID()}.json`;
  server = startServer(0); // ephemeral port
  base = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop(true);
});

const j = async (res: Response): Promise<any> => res.json();

// Each call rides its own x-forwarded-for IP (like real visitors) so the
// shared bucket never wall-jumps mid-file; the rate-limit test pins ONE ip.
let ipSeq = 0;
const post = (path: string, body: unknown, ip?: string): Promise<Response> =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip ?? `test-ip-${++ipSeq}`,
    },
    body: JSON.stringify(body),
  });

const get = (path: string): Promise<Response> => fetch(`${base}${path}`);

describe("POST /feedback", () => {
  test("creates a note with explicit name + page", async () => {
    const res = await post("/feedback", {
      page: "game",
      name: "Ben",
      text: "the danger zone explainer is great",
    });
    expect(res.status).toBe(201);
    const b = await j(res);
    expect(b.ok).toBe(true);
    expect(b.id).toMatch(/^fb_/);
    expect(b.page).toBe("game");
    expect(b.name).toBe("Ben");
    expect(b.deduped).toBe(false);
  });

  test("defaults: no name → anon, no page → index", async () => {
    const res = await post("/feedback", { text: "index note with defaults" });
    expect(res.status).toBe(201);
    const b = await j(res);
    expect(b.name).toBe("anon");
    expect(b.page).toBe("index");
  });

  test("blank/missing text → 400", async () => {
    expect((await post("/feedback", {})).status).toBe(400);
    expect((await post("/feedback", { text: "   " })).status).toBe(400);
    expect((await post("/feedback", { text: 42 })).status).toBe(400);
  });

  test("caps: text ≤1000 rejected; name/page length-capped (clamped, not rejected)", async () => {
    expect((await post("/feedback", { text: "x".repeat(1001) })).status).toBe(400);
    expect((await post("/feedback", { text: "x".repeat(1000) })).status).toBe(201);
    const longName = await post("/feedback", { text: "ok", name: "n".repeat(41) });
    expect(longName.status).toBe(201);
    expect((await j(longName)).name.length).toBe(40);
    const longPage = await post("/feedback", { text: "ok", page: "p".repeat(81) });
    expect(longPage.status).toBe(201);
    expect((await j(longPage)).page.length).toBe(80);
  });

  test("control characters are stripped; single-line fields collapse whitespace", async () => {
    const res = await post("/feedback", {
      page: "app\u0000.html\u007f",
      name: "  spaced\u0008  name ",
      text: "line1\u000bline2",
    });
    expect(res.status).toBe(201);
    const b = await j(res);
    expect(b.page).toBe("app.html");
    expect(b.name).toBe("spaced name");
  });

  test("same page+text within the window → deduped, count unchanged", async () => {
    const text = `dedupe probe ${Date.now()}`;
    const first = await post("/feedback", { page: "dedupe", text });
    expect(first.status).toBe(201);
    const before = (await j(await get("/feedback?page=dedupe"))).count;
    const second = await post("/feedback", { page: "dedupe", text });
    expect(second.status).toBe(201);
    const b = await j(second);
    expect(b.deduped).toBe(true);
    const after = (await j(await get("/feedback?page=dedupe"))).count;
    expect(after).toBe(before);
    // same text, different page → stored
    const other = await post("/feedback", { page: "dedupe2", text });
    expect((await j(other)).deduped).toBe(false);
  });
});

describe("GET /feedback + /feedback/recent", () => {
  test("GET /feedback without page → 400", async () => {
    expect((await get("/feedback")).status).toBe(400);
  });

  test("GET /feedback?page= returns only that page, newest first", async () => {
    const t = Date.now();
    await post("/feedback", { page: "order", name: "a", text: `first ${t}` });
    await post("/feedback", { page: "order", name: "b", text: `second ${t}` });
    await post("/feedback", { page: "other", name: "c", text: `elsewhere ${t}` });
    const b = await j(await get("/feedback?page=order"));
    expect(b.page).toBe("order");
    expect(b.count).toBe(2);
    expect(b.comments.map((c: any) => c.name)).toEqual(["b", "a"]); // newest first
    expect(b.total).toBeGreaterThanOrEqual(3); // all-time across pages
  });

  test("GET /feedback/recent is the whole stream, newest first", async () => {
    const t = Date.now();
    await post("/feedback", { page: "recent", name: "old", text: `older ${t}` });
    await post("/feedback", { page: "recent", name: "new", text: `newer ${t}` });
    const b = await j(await get("/feedback/recent?limit=50"));
    expect(b.limit).toBe(50);
    expect(b.count).toBeLessThanOrEqual(50);
    expect(b.total).toBeGreaterThanOrEqual(b.count);
    const names = b.comments.map((c: any) => c.name);
    expect(names.indexOf("new")).toBeLessThan(names.indexOf("old"));
  });

  test("limit clamps: ?limit=0 → default 50, ?limit=9999 → 200", async () => {
    expect((await j(await get("/feedback/recent?limit=0"))).limit).toBe(50);
    expect((await j(await get("/feedback/recent?limit=-3"))).limit).toBe(50);
    expect((await j(await get("/feedback/recent?limit=9999"))).limit).toBe(200);
  });
});

describe("rate limit + persistence", () => {
  test("RATE_MAX posts per IP per window, then 429 (own x-forwarded-for bucket)", async () => {
    const t = Date.now();
    let last: Response | null = null;
    for (let i = 0; i < RATE_MAX + 1; i++) {
      last = await post(
        "/feedback",
        { page: "ratelimit", text: `hammer ${t} ${i}` },
        "ratelimit-test-ip"
      );
    }
    expect(last!.status).toBe(429);
    // other IPs unaffected
    expect((await post("/feedback", { page: "ratelimit", text: `calm ${t}` }, "calm-ip")).status).toBe(201);
  });

  test("notes persist to .data file on disk (the store is the file)", async () => {
    const onDisk = JSON.parse(readFileSync(feedbackPath(), "utf8")) as any[];
    expect(Array.isArray(onDisk)).toBe(true);
    expect(onDisk.length).toBe(loadFeedback().length);
    expect(onDisk.some((e) => e.page === "ratelimit")).toBe(true);
  });

  test("module-level addFeedback/listRecent agree with the HTTP layer (serve.ts fallback path)", async () => {
    const marker = `module probe ${crypto.randomUUID().slice(0, 8)}`;
    const out = addFeedback({ page: "module", text: marker, name: "mod" });
    expect(out.ok).toBe(true);
    const { comments } = listRecent(200);
    expect(comments.some((c) => c.text === marker)).toBe(true);
    const viaHttp = await j(await get("/feedback?page=module"));
    expect(viaHttp.comments.some((c: any) => c.text === marker)).toBe(true);
  });
});
