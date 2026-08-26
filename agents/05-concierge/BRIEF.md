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

✅ CORPORATE TAB (2nd view, "Operations" ↔ "Corporate" tab bar; state preserved
per tab — panels toggle `hidden`, DOM never destroyed). Sahha-EAP-informed:
aggregate-only, HR-friendly, employer-funded. Panels:
1. **Tab shell** — sticky underline tab bar (role=tablist), both tabs render
   from the same poll loop.
2. **Org leagues** — 3 seed orgs (Kalarc Group 4 crews / Wollongong Steel 2 /
   Test Corp 1) joined to live /api/state matches by crewCode (live pill,
   liveCrews n/n, live players/pot); standings by aggregate season points;
   expandable crew rows; amber "INSTALL PENDING" pill for orgs w/o Slack.
3. **Employer-funded pots** — per-org monthly budget vs contributed (CSS bar),
   matches sponsored + live now, all-org totals; framing: "Employer funds the
   pot — teams compete to direct it. No employee money handled."
4. **Aggregate wellbeing** — participation (headcount-weighted), weekly active
   crews (seed + unseeded live), effort trend (8-wk avg adjusted score,
   pure-SVG sparkline; current wk goes live only when ≥5 players = k-anon),
   charity total (seed baseline + live pots). Banner: "No individual health
   data. Aggregates of 5+ only."
5. **Renewal outlook** — auto-summary headline (nearest renewal · participation
   · recommendation) + per-org rows w/ urgency pills; rec rules: ≥70% expand
   +2 teams / 45–70% hold / <45% at-risk.
All org data is `// SEED DATA — replace with org API` in hub.js (ORG_SEED,
EFFORT_TREND_SEED, CHARITY_BASELINE_CENTS, WEEKLY_ACTIVE_CREWS_SEED).
Verified: bun parse + 25-check DOM-shim smoke test (empty + live merge paths,
caught+fixed one missing-field bug), curl :4173 serves all three files.
Pre-edit snapshots in apps/hub/archive/. No backend changes.

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
