// @rwf/api — server entry (Bun.serve, port 4174)
// CORS: localhost:4173 (dev serve.ts) + https://rwf.qalarc.com (prod).

import { handleRequest } from "./routes.ts";
import { dbPath, loadDb } from "./db.ts";

const PORT = Number(process.env.PORT ?? 4174);

const ALLOWED_ORIGINS = new Set([
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://rwf.qalarc.com",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

const withCors = (req: Request, res: Response): Response => {
  const h = corsHeaders(req);
  for (const [k, v] of Object.entries(h)) res.headers.set(k, v);
  return res;
};

export function startServer(port: number): Bun.Server {
  return Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        return withCors(req, new Response(null, { status: 204 }));
      }

      if (url.pathname === "/health") {
        return withCors(
          req,
          Response.json({
            ok: true,
            service: "rwf-api",
            db: dbPath(),
            crews: loadDb().crews.length,
            time: new Date().toISOString(),
          })
        );
      }

      return withCors(req, await handleRequest(req));
    },
  });
}

if (import.meta.main) {
  const server = startServer(PORT);
  console.log(`@rwf/api listening on http://localhost:${server.port} (db: ${dbPath()})`);
}
