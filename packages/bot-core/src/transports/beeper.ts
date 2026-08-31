// BeeperDesktopTransport — RWF chat transport over the LOCAL Beeper Desktop
// API ("Beeper Connect"), the newest transport path. See:
//   docs/21_BEEPER_MATRIX_INVESTIGATION.md  (why Beeper / Matrix, staged plan)
//   docs/22_BACKEND_CHAT_ARCHITECTURE.md    (target architecture, P0–P4)
//
// What this rides on (verified against developers.beeper.com, 2026-08-31):
//   • REST base http://127.0.0.1:23373 (default; found on this machine's
//     install at ~/.config/BeeperTexts, logs confirm /v1/* traffic)
//   • Auth: `Authorization: Bearer <token>` on EVERY endpoint. Token is
//     minted in-app: Beeper Desktop → Settings → Integrations → “+” next to
//     “Approved connections”.
//   • GET  /v1/chats                       → { items: [...] }
//   • POST /v1/chats/{chatID}/messages     → { text } ⇒ { chatID, pendingMessageID }
//   • WS   /v1/ws                          → subscriptions.set { chatIDs: ["*"] }
//                                            events: message.upserted { entries: [msg] }
//   • Message model fields we use: id, chatID, senderID, senderName, text,
//     type ("TEXT"|…), isSender (echo suppression).
//
// chatIDs are Matrix room IDs (Beeper is a Matrix app), e.g.
//   !telegram_-1234:ba_xxxx.local-telegram.localhost   → network "telegram"
//   !discord_1098:beeper.com                           → network "discord"
// The network is parsed out for labels/telemetry only — the CommandBus does
// not care which platform a group chat lives on (that is the whole point).
//
// TO POSTURE (be honest, founder-facing): messages are sent from the FOUNDER'S
// personal connected accounts through on-device sessions. Fine for dogfood +
// friends groups; NOT for stranger-facing product at scale. Beeper's own docs
// warn that heavy automated sending can get accounts suspended by the
// networks. We rate-limit sends accordingly (minSendGapMs).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { homedir } from "node:os";
import { looksLikeCommand, type InboundMessage } from "../bus.ts";
import type { CommandBus } from "../bus.ts";
import type { MatchStore } from "../store.ts";
import type { ReceivingTransport } from "./chat-transport.ts";

// ── config ───────────────────────────────────────────────────────────────────

export const BEEPER_DEFAULT_PORT = 23373;
const DEFAULT_BASE = `http://127.0.0.1:${BEEPER_DEFAULT_PORT}`;
const REQUEST_TIMEOUT_MS = 4000;

export interface BeeperTransportOptions {
  /** Base URL of the local Beeper API (default http://127.0.0.1:23373). */
  baseUrl?: string;
  /** Bearer token. Default: env BEEPER_ACCESS_TOKEN ?? RWF_BEEPER_TOKEN. */
  token?: string;
  /** Where the chat⇄crew map persists (default .data/beeper-links.json). */
  linksFile?: string;
  /** Min gap between sends, ms — personal-account rate safety (default 1200). */
  minSendGapMs?: number;
  /** WS reconnect backoff bounds (ms). */
  reconnectMinMs?: number;
  reconnectMaxMs?: number;
  /** DI: fetch (tests point this at a MockBeeperServer). */
  fetchImpl?: typeof fetch;
  /** DI: WebSocket factory (default: standard WebSocket with headers —
   *  Bun supports the non-standard 2nd options arg for headers). */
  wsFactory?: (url: string, headers: Record<string, string>) => WebSocket;
}

export function resolveBeeperToken(explicit?: string): string | undefined {
  return explicit ?? process.env.BEEPER_ACCESS_TOKEN ?? process.env.RWF_BEEPER_TOKEN ?? undefined;
}

// ── normalization helpers (exported for tests) ──────────────────────────────

/** `!telegram_-100123:ba_x.local-telegram.localhost` → "telegram". */
export function networkFromChatId(chatId: string): string {
  const m = /^!([a-z0-9]+)[_-]/i.exec(chatId);
  if (m) return m[1].toLowerCase();
  // bare Matrix-ish ids (`!xyz:beeper.com`) have no network prefix
  return "matrix";
}

/**
 * Convert a Beeper message payload (from a message.upserted event entry) into
 * an InboundMessage for the CommandBus — or null when it must be ignored.
 * Null cases: our own sends echoing back (isSender), non-text messages, and
 * anything that doesn't look like an RWF command (stay quiet in conversation).
 */
export function beeperEventToInbound(
  chatID: string,
  m: {
    senderID?: string;
    senderName?: string;
    text?: string;
    type?: string;
    isSender?: boolean;
  }
): InboundMessage | null {
  if (m.isSender === true) return null; // our own message echoing back
  const text = String(m.text ?? "").trim();
  if (!text) return null;
  if (m.type != null && m.type !== "TEXT" && m.type !== "NOTICE") return null; // media/reactions/etc
  if (!looksLikeCommand(text)) return null; // chatter — ignore
  const sender = m.senderID ?? "unknown";
  return {
    chatId: `beeper:${chatID}`,
    playerId: `beeper:${sender}`,
    playerName: m.senderName ?? sender,
    text,
  };
}

/**
 * Card text from @rwf/bot-core uses WhatsApp/Slack mrkdwn (`*bold*`). Beeper
 * converts MARKDOWN to rich text (`**bold**`), so upgrade single-asterisk
 * emphasis without touching already-doubled or list/emoji asterisks.
 */
export function formatBeeperReply(card: string): string {
  // `*x*` → `**x**`, but leave `**x**` and mid-word/bullet asterisks alone.
  return card.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, (_all, pre: string, body: string) => `${pre}**${body}**`);
}

// ── crew link map (`link <CODE>` grammar) ────────────────────────────────────

export interface BeeperChatLink {
  chatId: string;
  /** Matrix-style chat id (raw Beeper id). */
  crewCode?: string;
  label?: string;
  network?: string;
  linkedAt?: number;
}

/**
 * Persistent chat ⇄ crew-code map for the Beeper transport.
 *
 * The CommandBus already binds a chat to a crew via `link <CODE>` (stored on
 * the StoredMatch) — but that only works once a match exists in the chat, and
 * it lives in the per-bot match store. This map is the TRANSPORT-level view:
 * it records every chat we've ever seen (with its human label + network) and
 * every crew binding, so `chatsForCrew(CODE)` can answer "which group chats
 * play as crew CODE" even before/without a live match — the join point for
 * cross-chat broadcast (docs/22 §data-flow).
 */
export class CrewLinkMap {
  private links = new Map<string, BeeperChatLink>();

  constructor(private file: string) {
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as { links?: BeeperChatLink[] };
      for (const l of raw.links ?? []) this.links.set(l.chatId, l);
    } catch {
      /* fresh start */
    }
  }

  /** Record/refresh a chat's display info (idempotent). */
  ensure(chatId: string, label?: string, network?: string): BeeperChatLink {
    const existing = this.links.get(chatId) ?? { chatId };
    if (label && label !== existing.label) existing.label = label;
    const net = network ?? networkFromChatId(chatId);
    if (net) existing.network = net;
    this.links.set(chatId, existing);
    this.persist();
    return existing;
  }

  /** Bind chat → crew code (the `link <CODE>` effect, transport-side). */
  link(chatId: string, crewCode: string): BeeperChatLink {
    const l = this.ensure(chatId);
    l.crewCode = crewCode.toUpperCase();
    l.linkedAt = Date.now();
    this.links.set(chatId, l);
    this.persist();
    return l;
  }

  crewFor(chatId: string): string | undefined {
    return this.links.get(chatId)?.crewCode;
  }

  chatsFor(crewCode: string): string[] {
    const code = crewCode.toUpperCase();
    const out: string[] = [];
    for (const l of this.links.values()) if (l.crewCode === code) out.push(l.chatId);
    return out;
  }

  get(chatId: string): BeeperChatLink | undefined {
    return this.links.get(chatId);
  }

  all(): BeeperChatLink[] {
    return [...this.links.values()];
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ links: this.all() }, null, 2));
  }
}

// ── probe (is the local API up? authenticated?) ─────────────────────────────

export interface BeeperProbeResult {
  up: boolean;
  baseUrl?: string;
  /** Server reachable AND a valid token was verified against /v1/chats. */
  authed: boolean;
  info?: Record<string, unknown>;
  chatCount?: number;
  error?: string;
  /** Founder-facing unblock steps when up/authed is false. */
  hint: string;
  /** Every candidate base URL that was tried. */
  tried: string[];
}

/** Parse candidate ports from the local Beeper install's renderer log
 *  (read-only). Pattern seen on this machine: ws://127.0.0.1:23373/… */
export function beeperPortsFromLogs(): number[] {
  const log = `${homedir()}/.config/BeeperTexts/logs/renderer/renderer-0.log`;
  const ports = new Set<number>([BEEPER_DEFAULT_PORT]);
  try {
    if (!existsSync(log)) return [...ports];
    const text = readFileSync(log, "utf8");
    for (const m of text.matchAll(/127\.0\.0\.1:(\d{4,5})/g)) {
      const p = Number(m[1]);
      if (p > 1023) ports.add(p);
    }
  } catch {
    /* unreadable — default only */
  }
  return [...ports];
}

// ── the transport ────────────────────────────────────────────────────────────

export class BeeperDesktopTransport implements ReceivingTransport {
  readonly baseUrl: string;
  readonly token: string | undefined;
  private readonly f: typeof fetch;
  private readonly wsFactory: (url: string, headers: Record<string, string>) => WebSocket;
  private readonly minSendGapMs: number;
  private sendChain: Promise<void> = Promise.resolve();
  private ws: WebSocket | null = null;
  private onMessage: ((msg: InboundMessage) => void | Promise<void>) | null = null;
  private stopped = true;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: BeeperTransportOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.BEEPER_BASE_URL ?? DEFAULT_BASE).replace(/\/+$/, "");
    this.token = resolveBeeperToken(opts.token);
    this.f = opts.fetchImpl ?? fetch;
    this.wsFactory =
      opts.wsFactory ??
      ((url, headers) => {
        // Bun's WebSocket client accepts a non-standard options object with
        // headers; browsers (no headers allowed) fall back to the query param.
        const Ctor = WebSocket as unknown as
          | ((u: string, o?: { headers?: Record<string, string> }) => WebSocket)
          | typeof WebSocket;
        try {
          return (Ctor as (u: string, o?: { headers?: Record<string, string> }) => WebSocket)(url, { headers });
        } catch {
          return new (Ctor as typeof WebSocket)(url);
        }
      });
    this.minSendGapMs = opts.minSendGapMs ?? 1200;
  }

  // ── REST ──────────────────────────────────────────────────────────────────

  private async req(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.f(`${this.baseUrl}${path}`, { ...init, headers, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET /health equivalent for ChatTransport: is the local API alive? */
  async health(): Promise<boolean> {
    try {
      const r = await this.req("/v1/info");
      return r.status !== 404; // any HTTP answer means the server is up
    } catch {
      return false;
    }
  }

  /**
   * Full diagnostic probe. Tries the configured base URL first, then ports
   * harvested from the local install's logs (the API port is chosen by the
   * desktop app; 23373 is the documented default and what this machine used).
   * Never throws.
   */
  async probe(): Promise<BeeperProbeResult> {
    const candidates = new Set<string>([this.baseUrl]);
    for (const port of beeperPortsFromLogs()) {
      candidates.add(`http://127.0.0.1:${port}`);
    }
    const tried: string[] = [];
    for (const base of candidates) {
      tried.push(base);
      const one = await this.probeBase(base);
      if (one.up) return { ...one, tried };
    }
    return {
      up: false,
      authed: false,
      error: `no Beeper Desktop API answered on ${tried.join(", ")}`,
      hint: probeHintDown,
      tried,
    };
  }

  private async probeBase(base: string): Promise<BeeperProbeResult> {
    const headers: Record<string, string> = {};
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1200);
      let info: Response;
      try {
        info = await this.f(`${base}/v1/info`, { headers, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      if (info.status === 401 || info.status === 403) {
        return { up: true, authed: false, baseUrl: base, error: "server up, token rejected/missing", hint: probeHintToken, tried: [base] };
      }
      if (!info.ok) {
        return { up: false, authed: false, baseUrl: base, error: `/v1/info → HTTP ${info.status}`, hint: probeHintDown, tried: [base] };
      }
      const infoJson = (await info.json().catch(() => ({}))) as Record<string, unknown>;
      // token check: /v1/chats requires auth per the API docs
      let chatCount: number | undefined;
      let authed = true;
      try {
        const chats = await this.f(`${base}/v1/chats`, { headers });
        if (chats.ok) {
          const body = (await chats.json()) as { items?: unknown[]; chats?: unknown[] };
          chatCount = (body.items ?? body.chats ?? []).length;
        } else {
          authed = false;
        }
      } catch {
        authed = false;
      }
      return {
        up: true,
        authed,
        baseUrl: base,
        info: infoJson,
        chatCount,
        hint: authed ? "" : probeHintToken,
        tried: [base],
      };
    } catch (e) {
      return {
        up: false,
        authed: false,
        baseUrl: base,
        error: e instanceof Error ? e.message : String(e),
        hint: probeHintDown,
        tried: [base],
      };
    }
  }

  /** GET /v1/chats → normalized chat list. */
  async listChats(): Promise<{ id: string; name: string; network: string }[]> {
    const r = await this.req("/v1/chats");
    if (!r.ok) throw new Error(`/v1/chats → HTTP ${r.status}${r.status === 401 ? " — token missing/rejected (see hint)" : ""}`);
    const body = (await r.json()) as { items?: Record<string, unknown>[]; chats?: Record<string, unknown>[] };
    const raw = body.items ?? body.chats ?? [];
    return raw
      .map((c) => {
        const id = String(c.id ?? c.chatID ?? c.chatId ?? "");
        const name = String(c.name ?? c.title ?? c.label ?? c.displayName ?? id);
        return id ? { id, name, network: networkFromChatId(id) } : null;
      })
      .filter((c): c is { id: string; name: string; network: string } => c !== null);
  }

  /**
   * POST /v1/chats/{chatID}/messages — sends as the FOUNDER'S account on that
   * chat's network. Sends are serialized with a minimum gap (personal-account
   * safety; Beeper warns networks may suspend heavy automation).
   */
  send(text: string, to: string): Promise<void> {
    const run = async (): Promise<void> => {
      if (this.minSendGapMs > 0) await sleep(this.minSendGapMs);
      const r = await this.req(`/v1/chats/${encodeURIComponent(to)}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        throw new Error(`beeper send → HTTP ${r.status} ${detail.slice(0, 120)}`);
      }
    };
    // serialize + keep errors isolated per send
    this.sendChain = this.sendChain.then(run, run);
    return this.sendChain;
  }

  // ── WebSocket event stream ────────────────────────────────────────────────

  /** Connect /v1/ws, subscribe to all chats, feed message.upserted events to
   *  the handler. Auto-reconnects with backoff until stop(). */
  async start(onMessage: (msg: InboundMessage) => void | Promise<void>): Promise<void> {
    if (!this.token) {
      throw new Error(
        `no Beeper access token — create one in Beeper Desktop → Settings → Integrations → “+” (Approved connections), then export BEEPER_ACCESS_TOKEN`
      );
    }
    this.onMessage = onMessage;
    this.stopped = false;
    await this.connectWs();
  }

  private wsUrl(): string {
    return `${this.baseUrl.replace(/^http/, "ws")}/v1/ws`;
  }

  private connectWs(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.stopped) return resolve();
      const headers: Record<string, string> = { authorization: `Bearer ${this.token ?? ""}` };
      // Query-param token too — harmless with header auth, and the fallback
      // for WS clients that cannot set headers.
      const url = `${this.wsUrl()}?access_token=${encodeURIComponent(this.token ?? "")}`;
      let settled = false;
      const ws = this.wsFactory(url, headers);
      this.ws = ws;

      ws.addEventListener("open", () => {
        this.reconnectAttempts = 0;
        ws.send(JSON.stringify({ type: "subscriptions.set", requestID: "rwf-sub-1", chatIDs: ["*"] }));
        if (!settled) {
          settled = true;
          resolve();
        }
      });

      ws.addEventListener("message", (ev: MessageEvent) => {
        void this.handleWsFrame(typeof ev.data === "string" ? ev.data : "");
      });

      ws.addEventListener("close", () => {
        this.ws = null;
        if (this.stopped) return;
        if (!settled) {
          settled = true;
          reject(new Error(`Beeper WS ${this.wsUrl()} closed before open — see probe hint`));
          return;
        }
        this.scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        // 'close' always follows 'error' — reconnect handled there.
      });
    });
  }

  private async handleWsFrame(data: string): Promise<void> {
    if (!data || !this.onMessage) return;
    let frame: {
      type?: string;
      chatID?: string;
      entries?: Record<string, unknown>[];
    };
    try {
      frame = JSON.parse(data) as typeof frame;
    } catch {
      return;
    }
    if (frame.type !== "message.upserted" || !frame.chatID) return;
    for (const entry of frame.entries ?? []) {
      const inbound = beeperEventToInbound(frame.chatID, entry as never);
      if (inbound) await this.onMessage(inbound);
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const min = this.opts.reconnectMinMs ?? 2000;
    const max = this.opts.reconnectMaxMs ?? 30000;
    const delay = Math.min(max, min * 2 ** this.reconnectAttempts++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs().catch(() => this.scheduleReconnect());
    }, delay);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.ws = null;
  }
}

export const probeHintDown =
  `Beeper Desktop isn't running (or its local API is off).
  → Open the Beeper Desktop app on this machine and let it log in.
  → Check Settings → Integrations → the Desktop API / local API toggle is ON.`;

export const probeHintToken =
  `Beeper Desktop API is UP but no valid access token.
  → Beeper Desktop → Settings → Integrations → “+” next to “Approved connections”
  → create a token, then: export BEEPER_ACCESS_TOKEN=<token> (or put it in .env).`;

// ── glue: transport + CommandBus + link map ─────────────────────────────────

export interface BeeperBotOptions {
  transport?: BeeperDesktopTransport;
  bus: CommandBus;
  /** The bus's store — read here for crew bindings (bus keeps it private). */
  store: MatchStore;
  links: CrewLinkMap;
}

/**
 * The bot loop glue shared by the --sim harness, --live mode, and tests:
 * inbound event → CommandBus → formatted reply → send back to the same chat.
 * Also keeps the CrewLinkMap in sync with the bus's per-chat crew bindings.
 */
export class BeeperBot {
  readonly transport: BeeperDesktopTransport;

  constructor(private opts: BeeperBotOptions) {
    this.transport = opts.transport ?? new BeeperDesktopTransport();
  }

  /** Core handler (pure aside from bus/store/transport IO). Returns the reply
   *  that was sent, or null when nothing should be sent. */
  async handleInbound(msg: InboundMessage): Promise<string | null> {
    // Transport-level crew binding: remember every chat we speak in.
    const rawChatId = msg.chatId.replace(/^beeper:/, "");
    this.opts.links.ensure(rawChatId, undefined, networkFromChatId(rawChatId));

    const reply = await this.opts.bus.handleAsync(msg);

    // Mirror the bus's crew binding (`link <CODE>`) into the transport map.
    const crew = this.opts.store.get(msg.chatId)?.crewCode;
    if (crew) this.opts.links.link(rawChatId, crew);

    await this.transport.send(formatBeeperReply(reply), rawChatId);
    return reply;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
