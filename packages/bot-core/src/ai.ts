// @rwf/bot-core — AI taunts via the local app server's /api/ai (GLM-backed).
//
// The `taunt` command tries this first; on ANY failure (down, slow, weird
// shape) it falls back to the canned lines in cards.ts. Timeout 2s so chat
// never feels slow. Endpoint + response shape: POST /api/ai
// {messages:[{role,content}], system} → {text, model} (serve.ts aiChat).

/** Per-call env read so tests/sims can point it at a dead port. */
function aiUrl(): string {
  return process.env.RWF_AI_URL ?? "http://localhost:4173/api/ai";
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/**
 * Generic one-shot call to the local AI endpoint. Returns the reply text
 * (first line, quote-stripped, length-capped) or null on ANY failure —
 * down, slow, weird shape. Shared by `aiTaunt` and the digest flavour line.
 */
export async function aiComplete(
  messages: { role: string; content: string }[],
  system: string,
  timeoutMs = 2000
): Promise<string | null> {
  try {
    const res = await fetch(aiUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, system }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    let out: string | null = null;
    try {
      const j = JSON.parse(raw) as any;
      out = firstString(
        j.text,
        j.reply,
        j.content,
        j.message,
        j.output,
        j.choices?.[0]?.message?.content
      );
    } catch {
      out = raw.trim() || null; // plain-text response
    }
    if (!out) return null;
    out = out.split("\n")[0].replace(/^["'\s]+|["'\s]+$/g, "").trim();
    if (!out || out.length > 200) return null;
    return out;
  } catch {
    return null; // down / timeout / garbage — caller falls back
  }
}

/**
 * Ask the banter engine for one cheeky Aussie taunt for `target`.
 * Returns the taunt text, or null on any failure (caller falls back to canned).
 */
export async function aiTaunt(target: string, timeoutMs = 2000): Promise<string | null> {
  const content = `Write one short cheeky Aussie taunt for ${target} who is slacking in a fitness match. Under 20 words, no emoji.`;
  return aiComplete(
    [{ role: "user", content }],
    "You are a banter engine for a fitness game with mates. Cheeky, never mean.",
    timeoutMs
  );
}
