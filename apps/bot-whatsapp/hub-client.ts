// Qalarc Hub WhatsApp connector — dev/dogfood transport for the RWF bot.
// The Hub owns the single Signal + WhatsApp session and exposes HTTP on :8769.
// Production swaps this for the WhatsApp Business Cloud API behind the same
// ChatTransport interface (see docs/03_CHAT_INTEGRATIONS.md).

export interface ChatTransport {
  send(text: string, to: string): Promise<void>;
  health(): Promise<boolean>;
}

const HUB = "http://127.0.0.1:8769";

export class QalarcHubClient implements ChatTransport {
  constructor(private defaultTo: string = "+61425228338") {}

  async health(): Promise<boolean> {
    try {
      const r = await fetch(`${HUB}/health`);
      const j = (await r.json()) as { ok: boolean };
      return j.ok === true;
    } catch {
      return false;
    }
  }

  async send(text: string, to: string = this.defaultTo): Promise<void> {
    const r = await fetch(`${HUB}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "whatsapp",
        recipient: to,
        text,
        source: "ai", // agent-generated tag — required by hub convention
      }),
    });
    if (!r.ok) throw new Error(`hub send failed: ${r.status}`);
  }
}

// Standings card formatter — shared shape across WhatsApp/Slack adapters.
export function standingsCard(rows: { name: string; adjustedScore: number; progressPct: number }[]): string {
  const lines = rows.map(
    (r, i) => `${i + 1}. ${r.name} — ${r.adjustedScore} pts (${r.progressPct}%)`
  );
  return ["🏋️ *Reps With Friends — standings*", ...lines, "", "Join in: https://rwf.app/j/m001"].join("\n");
}
