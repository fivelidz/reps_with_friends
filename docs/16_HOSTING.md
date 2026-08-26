# RWF Hosting — Always-On Bots (blocker T3)

*Decision doc: where the bots live so they never sleep. 27 Aug 2026.*

## The constraint map (what actually needs a host)

| Component | Needs | Can it move off superlocal? |
|---|---|---|
| **Slack bot** | tokens + outbound websocket (Socket Mode) | ✅ anywhere — no inbound ports, no Hub dependency |
| **serve.ts** (local system: /api/sim, live /api/state, cards) | Bun + .data files | ✅ anywhere |
| **apps/api** (MVP backend) | Bun + .data | ✅ anywhere |
| **WhatsApp bot** | **Qalarc Hub on superlocal** (owns the single WhatsApp session, localhost:8769) | ⚠️ coupled — either the Hub moves, or the bot tunnels to it, or production migrates to WhatsApp Business Cloud API (no Hub at all) |
| Static site/app/hub | — | ✅ already always-on at rwf.qalarc.com (Cloudflare Pages) |

## Options considered

| Option | Cost | Pros | Cons | Verdict |
|---|---|---|---|---|
| **1. minirig** (existing, qalcachyminirig) | $0 | Already on 24/7, Tailscale-meshed, systemd user-service pattern proven (signal-daemon, phone-bridge), we have SSH | ARM SBC-class; WhatsApp bot still needs the Hub on superlocal (SSH tunnel or move Hub later) | ✅ **Do now** |
| **2. Oracle Cloud Free Tier** (A1.Flex ARM, 4 core/24GB) | $0 forever | Genuinely free, huge RAM headroom, runs everything incl. future Hub headless | Signup wants a card; capacity lottery in some regions; oracle-linux quirks (use Ubuntu) | ✅ **Best cloud option when we want off-LAN** |
| **3. Hetzner CX22/CAX11** | ~€4/mo | Cheap, solid, Singapore region | Another account/bill; overkill while free options exist | Good fallback |
| **4. Fly.io / Railway** | ~$3–5/mo | Lovely DX, deploy from repo | Bill creep, another platform to learn | Skip |
| **5. Cloudflare Workers** (Slack bot only) | $0 | Zero infra, HTTP events mode (Bolt supports it), secrets in CF | WhatsApp can't run there; rewrite of bot entry; Durable Objects for state = complexity | 🧊 Later, for Slack-at-scale |
| **6. AWS Lightsail Sydney** | $5/mo | Local region | AWS account weight for a bot | Skip |

## Decision

**Phase now — minirig.** Free, exists, pattern proven. Slack bot + serve.ts +
apps/api run there as systemd user services (kit in `scripts/hosting/`).
WhatsApp bot stays on superlocal beside its Hub until one of:
- (a) the Hub moves to minirig (it's a Tauri app — needs a virtual display;
  doable with xvfb but fiddly — only if superlocal uptime becomes a problem), or
- (b) pilot migration to WhatsApp Business Cloud API (kills the Hub dependency
  entirely — the real fix, gated on T2 verification).

**Phase pilot — Oracle Free ARM VM** (or Hetzner if Oracle signup fails):
everything moves to one boring Ubuntu box, still deployed by the same kit.
Migration trigger: first external group playing (same trigger as the
disposable-number rule in docs/08).

**Phase scale — split:** Slack bot → Cloudflare Worker (HTTP events);
WhatsApp → Cloud API webhooks; state → Postgres (Neon) + Redis. No VMs left.

## The kit — `scripts/hosting/`

- `rwf-serve.service`, `rwf-bot-slack.service`, `rwf-bot-whatsapp.service` —
  systemd **user** units, `Restart=always`, journald logging
- `install.sh` — run ON the target box: syncs the repo (git pull over SSH or
  rsync), checks bun, installs units into `~/.config/systemd/user/`, enables
  lingering (so services run without login), starts + prints status

```bash
# from superlocal, first time:
ssh qalarc@qalcachyminirig 'bash -s' < scripts/hosting/install.sh
# after that, updates are just: ssh in, git pull, systemctl --user restart rwf-serve
```

Secrets on the box: `~/.config/rwf/bot-slack.env` (tokens) — never in the repo.
