// apps/bot-whatsapp/main.ts — RWF WhatsApp bot (Qalarc Hub transport).
//
//   bun apps/bot-whatsapp/main.ts --sim   # demo match: prints cards, sends NOTHING (default)
//   bun apps/bot-whatsapp/main.ts --live  # opt-in: tail hub log, reply via hub API
//
// Live mode NEVER runs its own WhatsApp receiver — the Qalarc Hub owns the
// single session (contract: qalarc_hub/AGENTS.md, base http://127.0.0.1:8769).
// We tail the hub's append-only inbound log, dedupe by byte offset
// (.data/wa-tail.json), map sender→player, run the shared CommandBus, and
// reply through POST /send with source:"ai". Heartbeat every 15s.

import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { CommandBus, looksLikeCommand, MatchStore } from "@rwf/bot-core";
import { QalarcHubClient } from "./hub-client.ts";

const ROOT = resolve(import.meta.dir, "../..");
const DATA = join(ROOT, ".data");
const HUB_LOG = join(homedir(), ".local/share/qalarc-hub/messages.jsonl");
const TAIL_STATE = join(DATA, "wa-tail.json");
const HEARTBEAT = join(DATA, "heartbeat-whatsapp.json");
const POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;

// ── sim harness ─────────────────────────────────────────────────────────────

function sim(): void {
  const store = new MatchStore(join(DATA, "sim-whatsapp.json"));
  const bus = new CommandBus(store);
  const wa = (num: string, name: string, text: string) => ({
    chatId: `wa:+614${num}`,
    playerId: `wa:+614${num}`,
    playerName: name,
    text,
  });

  // One phone number = one group chat here (chatId keyed by the group peer).
  const G = "000000001";
  const inGroup = (name: string, num: string, text: string) => wa(G, name, text) && {
    chatId: `wa:group-${G}`,
    playerId: `wa:+614${num}`,
    playerName: name,
    text,
  };
  const ben = (t: string) => inGroup("Ben", "111111111", t);
  const dave = (t: string) => inGroup("Dave", "222222222", t);
  const nico = (t: string) => inGroup("Nico", "333333333", t);

  const script = [
    ben("help"),
    ben("new"),
    ben("join athlete"),
    dave("join couch"),
    nico("join fit"),
    ben("start"),
    dave("log pushups 40"),
    nico("log squats 60!"),
    ben("log burpees 30"),
    dave("log squats 60"),
    ben("taunt dave"),
    dave("log sit-ups 50"),
    nico("s"),
    dave("pot 500"),
    nico("pot 1000"),
    dave("log burpees 45"),
    ben("log pushups 280"), // athlete closes at 310 raw…
    nico("result"), // …but the couch player's adjusted score takes it
    ben("link CREW-7Q2"),
  ];

  console.log("=== RWF WhatsApp bot — SIM MODE (no live sends) ===\n");
  for (const m of script) {
    console.log(`▸ ${m.playerName}: ${m.text}`);
    console.log(bus.handle(m));
    console.log("");
  }
  console.log(`=== sim done — ${script.length} messages, store: ${join(DATA, "sim-whatsapp.json")} ===`);
}

// ── live mode ───────────────────────────────────────────────────────────────

interface HubMessage {
  platform?: string;
  direction?: string;
  peer?: string;
  peer_name?: string;
  text?: string;
}

async function live(): Promise<void> {
  mkdirSync(DATA, { recursive: true });
  const hub = new QalarcHubClient();
  const healthy = await hub.health();
  console.log(`hub: ${healthy ? "healthy" : "DOWN (tailing anyway — sends will fail until it's up)"}`);
  console.log(`tailing ${HUB_LOG}`);

  const store = new MatchStore(join(DATA, "bot-matches.json"));
  const bus = new CommandBus(store);

  // Heartbeat: liveness signal for the ops hub.
  const beat = () => writeFileSync(HEARTBEAT, JSON.stringify({ ts: Date.now() }));
  beat();
  const hbTimer = setInterval(beat, HEARTBEAT_MS);

  // Tail state: byte offset into messages.jsonl so restarts don't replay.
  let offset = 0;
  let freshStart = false;
  try {
    offset = Number(JSON.parse(readFileSync(TAIL_STATE, "utf8")).offset) || 0;
  } catch {
    freshStart = true; // no prior state → skip history, start at EOF
  }
  let pending = Buffer.alloc(0);

  const saveTail = () =>
    writeFileSync(TAIL_STATE, JSON.stringify({ offset, ts: Date.now() }, null, 2));

  const handleLine = async (line: string): Promise<void> => {
    if (!line.trim()) return;
    let m: HubMessage;
    try {
      m = JSON.parse(line) as HubMessage;
    } catch {
      return; // malformed line — hub's problem, not ours
    }
    if (m.platform !== "whatsapp" || m.direction !== "in") return;
    const text = String(m.text ?? "").trim();
    const peer = String(m.peer ?? "");
    if (!peer || !text) return;
    if (!looksLikeCommand(text)) return; // stay quiet in normal conversation

    const name = m.peer_name || peer;
    const reply = bus.handle({
      chatId: `wa:${peer}`,
      playerId: `wa:${peer}`,
      playerName: name,
      text,
    });
    console.log(`[in ] ${name}: ${text}`);
    console.log(`[out] → ${peer}: ${reply.split("\n")[0]}…`);
    try {
      await hub.send(reply, peer); // source:"ai" tagged inside the client
    } catch (err) {
      console.error(`send to ${peer} failed:`, err instanceof Error ? err.message : err);
    }
  };

  const poll = async (): Promise<void> => {
    let st;
    try {
      st = statSync(HUB_LOG);
    } catch {
      return; // hub log doesn't exist yet
    }
    if (freshStart) {
      offset = st.size; // first ever run: don't replay history
      freshStart = false;
      saveTail();
      console.log(`first run — starting at end of log (byte ${offset})`);
      return;
    }
    if (st.size < offset) {
      console.log("hub log truncated/rotated — resetting tail to 0");
      offset = 0;
      pending = Buffer.alloc(0);
    }
    if (st.size === offset) return;

    const len = st.size - offset;
    const buf = Buffer.alloc(len);
    const fd = openSync(HUB_LOG, "r");
    try {
      readSync(fd, buf, 0, len, offset);
    } finally {
      closeSync(fd);
    }
    pending = Buffer.concat([pending, buf]);

    let nl: number;
    while ((nl = pending.indexOf(0x0a)) >= 0) {
      const line = pending.subarray(0, nl).toString("utf8");
      pending = pending.subarray(nl + 1);
      offset += nl + 1;
      await handleLine(line);
    }
    saveTail();
  };

  const pollTimer = setInterval(() => void poll(), POLL_MS);
  await poll();

  const shutdown = () => {
    clearInterval(pollTimer);
    clearInterval(hbTimer);
    saveTail();
    beat();
    console.log("\nbye — tail state saved");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("live — Ctrl-C to stop");
}

// ── entry ───────────────────────────────────────────────────────────────────

const mode = process.argv[2] ?? "--sim";
if (mode === "--live") {
  await live();
} else if (mode === "--sim") {
  sim();
} else {
  console.error("usage: bun apps/bot-whatsapp/main.ts [--sim|--live]");
  process.exit(1);
}
