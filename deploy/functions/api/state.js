// Pages Function: GET /api/state — static-host stub (no live bots here).
// The hub console degrades gracefully against this shape.
export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      server: { uptimeSec: 0, port: null, static: true },
      qalarcHub: null,
      bots: {
        whatsapp: { running: false, lastSeen: null },
        slack: { running: false, lastSeen: null },
      },
      matches: [],
    }),
    { headers: { "content-type": "application/json" } }
  );
}
