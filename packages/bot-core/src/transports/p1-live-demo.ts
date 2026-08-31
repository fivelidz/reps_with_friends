// P1 LIVE DEMO — run against a real apps/api on :4174.
//   RWF_API_DB=.data/api-db-p1demo.json bun apps/api/src/main.ts &
//   bun packages/bot-core/src/transports/p1-live-demo.ts
// Proves: bot chat play → MatchStore.api() mirror → apps/api crew scoreboard,
// i.e. the same endpoint the web app's sync layer pulls (blocker T5).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandBus, MatchStore } from "../index.ts";

const API = process.env.RWF_API_URL ?? "http://127.0.0.1:4174";

const dir = mkdtempSync(join(tmpdir(), "rwf-p1-live-"));
const store = new MatchStore(join(dir, "matches.json")).api(API, { source: "bot-beeper-demo" });
const bus = new CommandBus(store, { cardsDir: join(dir, "cards") });

const chat = { chatId: "beeper:!telegram_sunday:local", playerId: "beeper:@tg_ben", playerName: "Ben" };
const dave = { ...chat, playerId: "beeper:@tg_dave", playerName: "Dave" };

for (const [who, text] of [
  [chat, "new 100"],
  [chat, "join athlete"],
  [dave, "join couch"],
  [chat, "link CREW-P1LV"],
  [chat, "start"],
  [dave, "log pushups 80"],
  [chat, "log burpees 100"],
  [dave, "result"],
] as [typeof chat, string][]) {
  const reply = bus.handle({ ...who, text });
  console.log(`▸ ${who.playerName}: ${text}\n  ↳ ${reply.split("\n")[0]}`);
}

const ok = await store.syncNow();
const status = store.apiStatus();
console.log(`\nmirror push: ${ok ? "OK" : "FAILED"} (pushes=${status?.pushes}, lastError=${status?.lastError})`);

const crew = await (await fetch(`${API}/crews/CREW-P1LV`)).json();
console.log(`API crew:    ${crew.crew?.code} · ${crew.crew?.players?.length} players · ${crew.matches?.length} match(es) · status ${crew.matches?.[0]?.status}`);
const bots = await (await fetch(`${API}/bots/state`)).json();
console.log(`API mirrors: ${JSON.stringify(bots.sources)}`);
console.log(ok && crew.crew?.code === "CREW-P1LV" ? "\nP1 LIVE ✅ — bot match is on the API scoreboard the app pulls." : "\nP1 LIVE ❌");
