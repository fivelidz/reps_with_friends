# Lane 5 — Concierge (ops hub: data control & overview)

**Mission:** one console to watch the whole system — matches across platforms,
bot health, players, pots. Modelled on the tradez.au concierge (Tauri shell +
web UI); build the web UI now, Tauri-wrap later with zero changes.

**Owns:** `apps/hub/`

## Current state
✅ BUILT — index.html + hub.css + hub.js (no-build static console). Polls
/api/state every 3s, status dots, stat cards, matches table with expandable
player rows, diffed activity feed, graceful degradation. Smoke-tested through
7 poll cycles incl. failure/recovery.

## Data contract (root `serve.ts` exposes `/api/state`)
```json
{
  "server": { "uptimeSec": 123, "port": 4173 },
  "qalarcHub": { "ok": true, "signal": true, "whatsapp": true },
  "bots": {
    "whatsapp": { "running": true, "lastSeen": 1699999999000 },
    "slack":    { "running": false, "lastSeen": null }
  },
  "matches": [
    {
      "chatId": "wa:+614…-g12", "platform": "whatsapp", "crewCode": "KX4T9C",
      "status": "live", "targetReps": 300, "potCents": 2000,
      "leader": "Dave", "updatedAt": 1699999999000,
      "players": [
        { "id": "dave", "name": "Dave", "tier": "couch", "rawReps": 190,
          "adjustedScore": 285, "progressPct": 63.3, "verifiedPct": 100 }
      ]
    }
  ]
}
```
Poll every 3s. Fields may be missing — degrade gracefully.

## Layout (desktop-first console, same design system)
- **Top bar:** RWF wordmark + system status dots (Server / Qalarc Hub / WhatsApp bot / Slack bot) + uptime.
- **Row of stat cards:** Live matches · Players active · Total reps today · Charity pots total.
- **Matches table:** crew code, platform icon, status pill, leader + progress bar, players count, pot, updated. Click → expand player rows (tier, raw, adjusted, verified%).
- **Activity feed:** right column, recent events (match created, player joined, match closed) derived from match `updatedAt`/status changes between polls.
- Monospace accents for codes/numbers. Status colours from tokens (`--lime` ok, `--coral` down, `--faint` idle).

## Tech
- Vanilla TS/JS + CSS, no build step (serve static). Import `/design/tokens.css`.
- No framework. `fetch('/api/state')` on interval; diff for feed events.

## Definition of done
Served at `/hub` via `bun serve.ts`: renders with live data when bots run,
renders sensibly with empty/missing data, status dots reflect reality, no
console errors. Looks like an ops console, not a marketing page.
