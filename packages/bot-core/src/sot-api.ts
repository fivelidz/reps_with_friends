// @rwf/bot-core — SOT bots as CLIENTS of apps/api (M1, docs/22).
// ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
// THE ANSWER to "why do the bots have to run on my system?": they don't.
// The chat brain (SotCommandBus) runs SERVER-SIDE on apps/api — the bot
// transport just pipes text: same grammar, same cards, same truth the v4
// app polls. Wherever apps/api runs, the bot runs beside it (a ~10MB
// process + this client) and the founder's laptop is optional.
//
//   createSotHandler({ apiUrl }) → handle(InboundMessage) → reply card
//
// · groups are auto-created per chatId and players auto-joined (auth-lite:
//   the API mints a playerToken, cached in a small local session file)
// · once a chat has a server session, API outages fail closed: commands are
//   queued and replayed against the server, never applied to a local store.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { InboundMessage } from "./bus.ts";

const DEFAULT_BASE = process.env.RWF_API_URL ?? "http://127.0.0.1:4174";

export interface SotApiSessionOptions {
  /** apps/api base URL (default RWF_API_URL or http://127.0.0.1:4174). */
  apiUrl?: string;
  /** Token cache file (default .data/sot-api-session.json). */
  sessionFile?: string;
  /** Hard timeout per call in ms (default 4000). */
  timeoutMs?: number;
  /** Injectable fetch (tests). */
  fetchImpl?: typeof fetch;
}

interface ChatSession {
  code: string;
  tokens: Record<string, string>; // playerId → playerToken
  names: Record<string, string>; // playerId → last seen display name
}

export class SotApiSession {
  readonly baseUrl: string;
  private file: string;
  private f: typeof fetch;
  private timeoutMs: number;
  private chats = new Map<string, ChatSession>();
  private pending = new Map<string, InboundMessage[]>();

  constructor(opts: SotApiSessionOptions = {}) {
    this.baseUrl = (opts.apiUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.file = opts.sessionFile ?? ".data/sot-api-session.json";
    this.timeoutMs = opts.timeoutMs ?? 4000;
    this.f = opts.fetchImpl ?? fetch;
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8"));
      for (const [k, v] of Object.entries(raw.chats ?? {})) this.chats.set(k, v as ChatSession);
    } catch {
      /* fresh session */
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify({ chats: Object.fromEntries(this.chats) }, null, 2));
    } catch {
      /* session cache is best-effort */
    }
  }

  private async call(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const r = await this.f(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data };
    } catch {
      return { ok: false, status: 0, data: {} };
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET /health — is the API reachable? */
  async health(): Promise<boolean> {
    return (await this.call("GET", "/health")).ok;
  }

  sessionFor(chatId: string): ChatSession | undefined {
    return this.chats.get(chatId);
  }

  /** Ensure the chat has a server group and the sender has a seat. */
  private async ensure(chatId: string, playerId: string, playerName: string, tier?: string): Promise<ChatSession | null> {
    let s = this.chats.get(chatId);
    if (s) {
      const meta = await this.call("GET", `/sot/groups/${s.code}`);
      if (!meta.ok) {
        if (meta.status === 404) {
          this.chats.delete(chatId); // server lost the group — recreate below
          s = undefined;
        } else return null; // server down → caller queues/fails closed
      }
    }
    if (!s) {
      const name = chatId.replace(/[^A-Za-z0-9 _-]/g, " ").trim().slice(0, 40) || "Chat crew";
      const created = await this.call("POST", "/sot/groups", {
        name,
        config: { targetReps: 200, playDays: [0, 1, 2, 3, 4, 5, 6] },
      });
      if (!created.ok) return null;
      s = { code: created.data.code, tokens: {}, names: {} };
      this.chats.set(chatId, s);
    }
    if (!s.tokens[playerId]) {
      const joined = await this.call("POST", `/sot/groups/${s.code}/players`, {
        name: playerName || playerId.slice(-4),
        ...(tier ? { tier } : {}),
      });
      if (!joined.ok) return null;
      s.tokens[playerId] = joined.data.playerToken;
      s.names[playerId] = playerName;
      this.persist();
    } else if (s.names[playerId] !== playerName && playerName) {
      s.names[playerId] = playerName; // renames ride along on the next cmd
    }
    return s;
  }

  /**
   * Handle one inbound message through the SERVER's bus. Established chats
   * queue during outages and replay on reconnect; no local store is allowed
   * to become a second authority.
   */
  async handle(msg: InboundMessage): Promise<string> {
    // first message sets the tier when the grammar carries one (`join fit`)
    const tierHint = tierFromText(msg.text);
    const s = await this.ensure(msg.chatId, msg.playerId, msg.playerName, tierHint);
    if (!s) {
      if (this.chats.has(msg.chatId)) return this.queue(msg);
      return "⚠️ Reps With Friends can't reach the game server right now. Try again in a moment.";
    }
    await this.replay(msg.chatId, s);
    const r = await this.call("POST", `/sot/groups/${s.code}/cmd`, {
      playerToken: s.tokens[msg.playerId],
      text: msg.text,
    });
    if (!r.ok) {
      if (r.status === 0) return this.queue(msg); // transport down
      return `⚠️ ${r.data?.error ?? `API error ${r.status}`}`;
    }
    return String(r.data.reply ?? "…");
  }

  private queue(msg: InboundMessage): string {
    const q = this.pending.get(msg.chatId) ?? [];
    q.push(msg);
    this.pending.set(msg.chatId, q.slice(-50));
    return `⚠️ Game server is offline. I queued this command and will replay it when the connection is back. (${this.pending.get(msg.chatId)!.length} pending)`;
  }

  private async replay(chatId: string, s: ChatSession): Promise<void> {
    const q = this.pending.get(chatId);
    if (!q?.length) return;
    const rest: InboundMessage[] = [];
    for (const msg of q) {
      const token = s.tokens[msg.playerId];
      if (!token) { rest.push(msg); continue; }
      const r = await this.call("POST", `/sot/groups/${s.code}/cmd`, {
        playerToken: token,
        text: msg.text,
      });
      if (!r.ok) { rest.push(msg); break; }
    }
    if (rest.length) this.pending.set(chatId, rest);
    else this.pending.delete(chatId);
  }
}

/** One-liner for bot mains: a handler with API-first, file-fallback wiring. */
export function createSotHandler(opts: SotApiSessionOptions = {}) {
  const session = new SotApiSession(opts);
  return {
    session,
    handle: (msg: InboundMessage) => session.handle(msg),
  };
}

const TIERS = ["couch", "casual", "fit", "athlete"];

/** `join fit` / `join athlete` — the first message picks the handicap tier. */
function tierFromText(text: string): string | undefined {
  const m = /^\s*(?:rwf\s+)?join\s+(couch|casual|fit|athlete)\s*$/i.exec(String(text ?? ""));
  return m ? m[1].toLowerCase() : undefined;
}
