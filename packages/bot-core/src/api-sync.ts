// P1 seam (docs/22 §migration): mirror @rwf/bot-core's MatchStore into
// @rwf/api (apps/api, :4174) so the chat bots and the web app converge on ONE
// scoreboard (blocker T5).
//
// Shape of the seam:
//   • The JSON file store (.data/bot-matches.json) stays the PRIMARY store —
//     the bots keep working when apps/api is down (file fallback = today's
//     behaviour, unchanged).
//   • When apps/api is reachable, every persist() also pushes a full state
//     snapshot to POST /bots/state (debounced, fire-and-forget, never throws).
//   • apps/api adopts crew-linked bot matches into its own crews/matches so
//     the app's existing pull (GET /crews/:code) sees bot-played matches.
//   • Idempotent: the mirror upserts by match id; pushing twice changes
//     nothing.
//
// Why mirror instead of "bots call the API per action": the CommandBus is
// synchronous and battle-tested against the local store; a full-snapshot
// mirror gives eventual consistency with zero changes to the command path,
// and survives API restarts/outages without losing bot play. When we want
// the API to be the authority (P2+), the bus grows an async store — this
// seam is the stepping stone.

import type { CrewChallenge, StoredMatch } from "./store.ts";

export interface BotStateSnapshot {
  /** Which bot is talking ("bot-core", "bot-beeper", …). */
  source: string;
  generatedAt: number;
  /** chatId → StoredMatch (bot's own ids, unchanged). */
  matches: Record<string, StoredMatch>;
  seasons: Record<string, unknown>;
  spectators: Record<string, string[]>;
  challenges: CrewChallenge[];
}

export interface ApiMirrorStatus {
  lastPushAt: number | null;
  lastOk: boolean;
  lastError: string | null;
  pushes: number;
}

export interface ApiMirrorOptions {
  baseUrl?: string;
  source?: string;
  /** Debounce window for persist-triggered pushes (default 400ms). */
  debounceMs?: number;
  fetchImpl?: typeof fetch;
  /** Hard timeout per push (default 3000ms). */
  timeoutMs?: number;
}

const DEFAULT_BASE = process.env.RWF_API_URL ?? "http://127.0.0.1:4174";

export class ApiMirror {
  readonly baseUrl: string;
  readonly source: string;
  readonly debounceMs: number;
  readonly status: ApiMirrorStatus = { lastPushAt: null, lastOk: false, lastError: null, pushes: 0 };
  private readonly f: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ApiMirrorOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.source = (opts.source ?? "bot-core").slice(0, 40);
    this.debounceMs = opts.debounceMs ?? 400;
    this.timeoutMs = opts.timeoutMs ?? 3000;
    this.f = opts.fetchImpl ?? fetch;
  }

  /** GET /health — is apps/api up? Never throws. */
  async health(): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      try {
        const r = await this.f(`${this.baseUrl}/health`, { signal: ctrl.signal });
        return r.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  /** Push a snapshot to POST /bots/state. Returns ok; records status. */
  async pushSnapshot(snap: BotStateSnapshot): Promise<boolean> {
    this.status.pushes++;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const r = await this.f(`${this.baseUrl}/bots/state`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(snap),
          signal: ctrl.signal,
        });
        const ok = r.ok;
        this.status.lastOk = ok;
        this.status.lastPushAt = Date.now();
        this.status.lastError = ok ? null : `POST /bots/state → HTTP ${r.status}`;
        return ok;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      this.status.lastOk = false;
      this.status.lastPushAt = Date.now();
      this.status.lastError = e instanceof Error ? e.message : String(e);
      return false;
    }
  }
}
