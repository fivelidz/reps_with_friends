// Pages Function: POST /api/ai — same contract as the local serve.ts proxy.
// Key comes from Pages env var ZAI_API_KEY (never in the repo).
const ZAI_URL = "https://api.z.ai/api/anthropic/v1/messages";
const AI_MODEL = "glm-5.3";

const RWF_SYSTEM = `You are the Reps With Friends guide — a sharp, warm, slightly cheeky fitness-tech expert.
Reps With Friends: real-time multiplayer fitness game. Groups agree on exercises, race to 300 total reps (any reps, any order, any mix); first to raw target CLOSES the match; winner = highest EFFORT-ADJUSTED score (handicap: couch 1.5x, casual 1.25x, fit 1.0x, athlete 0.85x; v2 blends measured %HRR vs personal baseline). Charity pots: winner directs contributions to charity, no cash to winner. Played inside WhatsApp/Slack group chats via bots; the app is home base (profile, crew, seasons). Seasons are 4-week series with points, champion belt, relegation. Comeback multiplier x1.2 when >30% behind (once per match). Verification: in-browser camera pose counting + BLE heart-rate straps; no video leaves the device. Corporate mode: org leagues, employer-funded pots, aggregate-only dashboards.

The site you guide (rwf.qalarc.com) has these pages: "/" the concept site (Three.js hero, interactive handicap demo, architecture graph); "/demo" an auto-playing 90-second match replay; "/app" the phone-first demo app (onboard, crew, match, seasons); "/system" the complete dissemination page — every design token, the 16-component library, all 36 feature elements (families A-G) with LIVE/NEXT/IDEA status, progress metrics and a systems map; "/hub" the ops + corporate console; "/debug" a debug console with a live bot simulator and element gallery; "/connect" WhatsApp group linking (wa.me + QR); "/slack" Slack app setup with install-link builder. If asked "what am I looking at", orient them using the current section context provided.

Answer concisely (under 120 words), Aussie-friendly tone, no emoji spam. If asked something you don't know, say so.`;

export async function onRequestPost(context) {
  const key = context.env.ZAI_API_KEY;
  if (!key) return json({ error: "AI not configured" }, 503);
  let body;
  try { body = await context.request.json(); } catch { body = {}; }
  const msgs = Array.isArray(body?.messages)
    ? body.messages
        .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string" && m.content.trim())
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    : [];
  if (msgs.length === 0) return json({ error: "messages required" }, 400);
  try {
    const r = await fetch(ZAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 600,
        system: typeof body?.system === "string" && body.system.trim()
          ? `${RWF_SYSTEM}\n\nAdditional context: ${body.system.slice(0, 1500)}`
          : RWF_SYSTEM,
        messages: msgs,
      }),
    });
    if (!r.ok) return json({ error: `upstream ${r.status}` }, 502);
    const data = await r.json();
    const text = (data?.content ?? []).filter((c) => c?.type === "text").map((c) => c.text).join("\n");
    return json({ text });
  } catch (e) {
    return json({ error: "ai failed" }, 502);
  }
}

export async function onRequest() { return json({ error: "POST only" }, 405); }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
