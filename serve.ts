// RWF local server — one process, whole system.
//   /        → site/            (Three.js showcase)
//   /app     → apps/web/dist/   (phone-first app)
//   /hub     → apps/hub/        (concierge ops console)
//   /design  → design/          (tokens + fonts)
//   /api/state → live system state for the hub console
// Run: bun serve.ts   → http://localhost:4173

import { readFileSync, existsSync } from "node:fs";

const PORT = 4173;
const startedAt = Date.now();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function file(path: string, urlPath: string): Response | null {
  try {
    const f = Bun.file(path);
    if (!f.exists?.()) return null;
    const ext = path.slice(path.lastIndexOf("."));
    return new Response(f, { headers: { "content-type": MIME[ext] ?? "application/octet-stream" } });
  } catch {
    return null;
  }
}

function dirRoute(root: string, url: URL): Response | null {
  const rel = decodeURIComponent(url.pathname.replace(/^\/[^/]+/, "").replace(/^\//, ""));
  const tries = rel
    ? [`${root}/${rel}`, `${root}/${rel}/index.html`]
    : [`${root}/index.html`];
  for (const t of tries) {
    const r = file(t, url.pathname);
    if (r) return r;
  }
  return null;
}

async function readJson(path: string): Promise<any | null> {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

async function heartbeat(name: string): Promise<{ running: boolean; lastSeen: number | null }> {
  const hb = await readJson(`.data/heartbeat-${name}.json`);
  if (!hb?.ts) return { running: false, lastSeen: null };
  const fresh = Date.now() - hb.ts < 45_000;
  return { running: fresh, lastSeen: hb.ts };
}

async function apiState(): Promise<Response> {
  let qalarcHub: any = null;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 1000);
    const r = await fetch("http://127.0.0.1:8769/health", { signal: ctrl.signal });
    qalarcHub = await r.json();
  } catch { /* hub down */ }

  const store = await readJson(".data/bot-matches.json");
  const matches = [];
  if (store) {
    for (const [chatId, m] of Object.entries<any>(store)) {
      const state = m.state;
      const players = (state?.players ?? []).map((p: any) => {
        const mine = (state?.entries ?? []).filter((e: any) => e.playerId === p.id);
        const raw = mine.reduce((s: number, e: any) => s + e.reps, 0);
        const verified = mine.filter((e: any) => e.verified).reduce((s: number, e: any) => s + e.reps, 0);
        const mult = { couch: 1.5, casual: 1.25, fit: 1.0, athlete: 0.85 }[p.tier as string] ?? 1;
        return {
          id: p.id, name: p.name, tier: p.tier, rawReps: raw,
          adjustedScore: Math.round(raw * mult * 10) / 10,
          progressPct: state?.config?.targetReps
            ? Math.min(100, Math.round((raw / state.config.targetReps) * 1000) / 10) : 0,
          verifiedPct: raw ? Math.round((verified / raw) * 100) : 0,
        };
      }).sort((a: any, b: any) => b.adjustedScore - a.adjustedScore);
      matches.push({
        chatId,
        platform: chatId.startsWith("wa:") ? "whatsapp" : chatId.startsWith("sl:") ? "slack" : "unknown",
        crewCode: m.crewCode ?? null,
        status: state?.status ?? "unknown",
        targetReps: state?.config?.targetReps ?? null,
        potCents: m.potCents ?? 0,
        leader: players[0]?.name ?? null,
        updatedAt: state?.completedAt ?? state?.startedAt ?? null,
        players,
      });
    }
  }

  return Response.json({
    server: { uptimeSec: Math.floor((Date.now() - startedAt) / 1000), port: PORT },
    qalarcHub,
    bots: { whatsapp: await heartbeat("whatsapp"), slack: await heartbeat("slack") },
    matches,
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === "/api/state") return apiState();
    if (p === "/api/health") return Response.json({ ok: true });

    let r: Response | null = null;
    if (p === "/" || p.startsWith("/design")) {
      const rel = p === "/" ? "" : p.replace(/^\/design/, "").replace(/^\//, "");
      r = rel
        ? file(`design/${rel}`, p) ?? dirRoute("site", url)
        : file("site/index.html", p);
      if (!r && p !== "/") r = dirRoute("site", url);
    } else if (p.startsWith("/app")) {
      r = dirRoute("apps/web/dist", url) ?? new Response("app not built yet — run lane 02", { status: 404 });
    } else if (p.startsWith("/hub")) {
      r = dirRoute("apps/hub", url) ?? new Response("hub not built yet — run lane 05", { status: 404 });
    } else {
      r = dirRoute("site", url);
    }
    return r ?? new Response("not found", { status: 404 });
  },
});

console.log(`RWF system → http://localhost:${PORT}  (/ site · /app app · /hub console · /api/state)`);
