// Canonical transport contract for RWF bots.
//
// Historically this interface lived in apps/bot-whatsapp/hub-client.ts (the
// Qalarc Hub connector). It moves here — into @rwf/bot-core — so that every
// transport (Slack Bolt, Qalarc Hub, Beeper Desktop, future Matrix/Cloud API)
// implements ONE interface against the ONE CommandBus. See
// docs/22_BACKEND_CHAT_ARCHITECTURE.md.
//
// Contract rules for transports (the "dumb pipe" rules):
//   • No game logic. Translate platform events → InboundMessage, and card
//     text → platform format. That's all.
//   • Never block on send failures longer than a few seconds; log and move on.
//   • Stay quiet in normal conversation — feed every message through
//     looksLikeCommand() and drop non-commands.
//   • Tag agent-generated traffic where the platform convention exists
//     (Hub: source:"ai" inside its client; Beeper: messages go out under the
//     founder's own account — keep volume low, it is a personal account).

import type { InboundMessage } from "../bus.ts";

/** Minimal send-only transport (the original hub-client shape). */
export interface ChatTransport {
  /** Send `text` to chat/peer identified by `to` (platform-native id). */
  send(text: string, to: string): Promise<void>;
  /** Cheap liveness check — must not throw, must resolve fast (<3s). */
  health(): Promise<boolean>;
}

/** A transport that can also RECEIVE (event stream / polling → InboundMessage). */
export interface ReceivingTransport extends ChatTransport {
  /** Start listening. Every inbound command-shaped message is handed to
   *  `onMessage`. Resolves once the stream is live (or throw with a
   *  human-readable reason — e.g. exact founder unblock steps). */
  start(onMessage: (msg: InboundMessage) => void | Promise<void>): Promise<void>;
  /** Stop listening and clean up. Safe to call when not started. */
  stop(): Promise<void>;
}

/** Adapter signature used by bot mains: transport event → bus → reply send. */
export type BotHandler = (msg: InboundMessage) => Promise<void>;
