// Mock Beeper Desktop API — an in-process stand-in for "Beeper Connect"
// (the local REST+WS server inside Beeper Desktop, default :23373).
//
// Used by (a) packages/bot-core/test/beeper.test.ts and (b) the --sim harness
// in beeper-cli.ts so the whole transport path (probe → list chats → WS
// events → CommandBus → reply send) runs with NO live Beeper installed.
//
// Implements exactly the surface BeeperDesktopTransport touches:
//   GET  /v1/info                        → server metadata (auth required)
//   GET  /v1/chats                       → { items: [...] } (auth required)
//   POST /v1/chats/:chatID/messages      → send (auth required)
//   WS   /v1/ws                          → subscriptions.set / message.upserted
// Auth: Bearer token only (default "test-token"), matching the real API's
// "requires an access token for all endpoints" posture. The WS endpoint
// additionally accepts ?access_token= for clients that can't set headers.

import type { ServerWebSocket } from "bun";

export interface MockBeeperChat {
  id: string;
  /** Display name — real API exposes this under different keys per network;
   *  the mock uses `name` and the transport normalizes several. */
  name: string;
}

export interface MockSentMessage {
  chatId: string;
  text: string;
  at: number;
}

export class MockBeeperServer {
  readonly server: Bun.Server;
  readonly sent: MockSentMessage[] = [];
  private sockets = new Set<ServerWebSocket<unknown>>();
  private seq = 0;

  constructor(opts: { token?: string; chats?: MockBeeperChat[] } = {}) {
    const token = opts.token ?? "test-token";
    const chats = opts.chats ?? [];
    const authed = (req: Request): boolean =>
      req.headers.get("authorization") === `Bearer ${token}`;

    this.server = Bun.serve({
      port: 0,
      fetch: async (req, srv) => {
        const url = new URL(req.url);

        // WS upgrade: header token OR ?access_token= (header clients win).
        if (url.pathname === "/v1/ws") {
          const ok = authed(req) || url.searchParams.get("access_token") === token;
          if (!ok) return new Response("unauthorized", { status: 401 });
          if (srv.upgrade(req)) return; // handshake done — events flow via websocket handlers
          return new Response("upgrade failed", { status: 500 });
        }

        if (!authed(req)) return new Response("unauthorized", { status: 401 });

        if (req.method === "GET" && url.pathname === "/v1/info") {
          return Response.json({
            product: "beeper-desktop-mock",
            version: "0.0.1-mock",
            transport: { websocket: "/v1/ws" },
          });
        }

        if (req.method === "GET" && url.pathname === "/v1/chats") {
          return Response.json({ items: chats });
        }

        const sendMatch = /^\/v1\/chats\/([^/]+)\/messages$/.exec(url.pathname);
        if (req.method === "POST" && sendMatch) {
          const chatId = decodeURIComponent(sendMatch[1]);
          const body = (await req.json().catch(() => ({}))) as { text?: string };
          const text = String(body.text ?? "");
          this.sent.push({ chatId, text, at: Date.now() });
          // Echo the send back over the WS stream with isSender:true — the
          // real API does this (sendStatus flows as message.upserted) and the
          // transport MUST ignore its own messages (echo-suppression test).
          this.broadcastMessage(chatId, { text, isSender: true });
          return Response.json({
            chatID: chatId,
            pendingMessageID: `m${Date.now()}${this.seq++}`,
          });
        }

        return new Response("no route", { status: 404 });
      },
      websocket: {
        open: (ws) => this.sockets.add(ws),
        message: (ws, msg) => {
          try {
            const data = JSON.parse(String(msg)) as { type?: string; requestID?: string };
            if (data.type === "subscriptions.set") {
              ws.send(
                JSON.stringify({ type: "subscriptions.updated", requestID: data.requestID, chatIDs: ["*"] })
              );
            }
          } catch {
            /* ignore malformed client frames */
          }
        },
        close: (ws) => this.sockets.delete(ws),
      },
    });
  }

  /** Broadcast a `message.upserted` domain event (the WS shape from
   *  developers.beeper.com/desktop-api/websocket-experimental). */
  broadcastMessage(chatId: string, entry: Record<string, unknown>): void {
    const event = {
      type: "message.upserted",
      seq: ++this.seq,
      ts: Date.now(),
      chatID: chatId,
      ids: [entry.id ?? `m${this.seq}`],
      entries: [entry],
    };
    const frame = JSON.stringify(event);
    for (const ws of this.sockets) ws.send(frame);
  }

  /** Simulate a HUMAN message arriving in a chat (isSender:false). */
  injectIncoming(
    chatId: string,
    msg: { id?: string; senderID: string; senderName?: string; text: string; type?: string }
  ): void {
    this.broadcastMessage(chatId, {
      id: msg.id ?? `in${Date.now()}${this.seq++}`,
      chatID: chatId,
      senderID: msg.senderID,
      senderName: msg.senderName ?? msg.senderID,
      text: msg.text,
      type: msg.type ?? "TEXT",
      isSender: false,
    });
  }

  get port(): number {
    return this.server.port;
  }

  get url(): string {
    return `http://127.0.0.1:${this.server.port}`;
  }

  stop(): void {
    this.server.stop(true);
  }
}
