# RWF ORCHESTRATION — the operating system for agents

*Written 2 Sep 2026 after the v2 wave. This file is how ANY agent (or the
founder) gets control of this project in one read.*

## THE STACK IN ONE PAGE

```
┌──────────────────── WHAT THE PRODUCT IS ────────────────────┐
│ A real-time multiplayer fitness game played in group chats. │
│ 300-format battles, effort-handicap scoring, power-up cards,│
│ charity pots, seasons. v2 = board-game presentation.        │
└──────────────────────────────────────────────────────────────┘

PRODUCT SURFACES (all on rwf.qalarc.com + localhost:4173)
  /              main site → FULL HUB (versions, design, sound, docs)
  /figma-app     v1 APP — Ben's design, real engine (65 screens)
  /v2            v2 APP — the board-game/track direction (CURRENT)
  /demo          90s match replay
  /styles        theme gallery (13 skins)
  /sfx           sound-effect demo page
  /avatars       avatar gallery (Geno mocap, frogs, photo avatars)
  /atelier       garment workshop (the frog's outfit)
  /v1            coverage hub — the share link
  /wiki          9-page system documentation
  /system        design dissemination (tokens/components/status)
  /figma         F3 component library
  /hub           ops console (live matches, bots, corporate)
  /debug         live bot console (/api/sim)
  /connect       WhatsApp linking   /slack   Slack setup
  /deck/*.pdf    deck, contract, appendix    /apk  Android app
  /api/state     live JSON   /api/ai   AI proxy   /api/sim  bot sim

CODE (this repo, Bun-native, no build for most)
  packages/game-core    pure TS engine (59 tests) — the IP
  packages/bot-core     chat brain: CommandBus + transports
                        (WhatsApp Hub, Slack Bolt, Beeper, api-sync)
  apps/figma-app        v1 app (engine.js port, 49 tests, e2e 122+74+90)
  apps/board            v2 app (engine fork, e2e 56, geom 27)
  apps/api              unified REST backend (24 tests, :4174)
  apps/android          native WebView shell (installed on the phone)
  apps/{styles,sfx-demo,atelier,avatars,wiki,systempage,hub,hub-public,
        demo,connect,slack-setup,debug}   support surfaces
  site/                 the main site + avatar/three.js systems
  design/               tokens.css, themes.css, figma-components.css, fonts
  figma/                Ben's Figma extraction + analysis (F1-F4 lanes)
  docs/                 01-26: analysis, plans, research, contracts
  scripts/              build-deploy.sh, hosting/, avatars/, figma-app/
  serve.ts              ONE local server :4173 (routes everything)

INFRA
  rwf.qalarc.com        Cloudflare Pages (CI: push→deploy ~20s)
  gmktec (Tailscale)    always-on host 100.111.199.12:4173 (rwf-serve)
  phone (TOCI5LD...)    Redmi — native app installed + PWA
  Qalarc Hub :8769      WhatsApp/Signal session owner (superlocal)

TESTS (~600 checks; ALL must be green before any deploy)
  bun test packages/game-core packages/bot-core apps/api
  bun test apps/figma-app/engine.test.js
  bun apps/figma-app/{e2e,e2e-daily,e2e-squads,e2e-demo,e2e-sw}.mjs
  bun apps/board/{e2e,geom}.mjs   +  bun apps/styles/e2e.mjs
```

## HOW TO ORCHESTRATE (for the next agent in this chair)

1. **Read this file, then the lane you're working** (`agents/NN-name/BRIEF.md`)
2. **Check the tree state first**: `git log --oneline -5` + `git status` —
   concurrent agents leave work uncommitted; commit completed waves with a
   wave-summary message (see git log for the house style)
3. **Dispatch pattern**: one agent per disjoint path-set. The collision
   history is real: shared files (serve.ts, build-deploy.sh, themes.css,
   atelier) must be "re-read before edit" territory — put that in every brief
4. **Verify before claiming**: screenshot + LOOK if possible, else
   programmatic checks with numbers. The house rule: never claim rendering
   works without evidence. Content-type check every route (HTML fallthrough
   fakes 200s)
5. **Deploy** (orchestrator only): `./scripts/build-deploy.sh && cd deploy &&
   CLOUDFLARE_API_TOKEN=$(…qalarc.ai/.dev.vars) bunx wrangler pages deploy
   public --project-name=rwf` + `rsync … gmktec:~/reps_with_friends/` +
   restart rwf-serve
6. **Wave protocol**: work → commit → deploy → verify links → Signal the
   founder (`signal-send`, tag source ai)

## LANES (status 2 Sep 2026 — after the v2 wave)

| Lane | Status | Current truth |
|---|---|---|
| 01 message-interface | ✅ shipped | 3 transports + Beeper (needs token) |
| 02 app (v1) | ✅ shipped | feature-complete; PRESERVED as v1 |
| 03 website | 🔨 active | main-hub restructure in flight |
| 04 communications | ✅ | deck/contract PDFs live |
| 05 concierge | ✅ | ops + corporate |
| 06 game-engine | ✅ | 59+49 tests; power-ups v2 + points |
| 07 verification | ✅ | camera+HR live; hardening = M2 |
| 08 launch-compliance | 🟨 | legal opinion pending (pilot gate) |
| 09 growth | 💤 | activates at pilot |
| 10 avatars | 🅿️ parked | investigations DONE (docs/20/23) |
| 11 ops-deploy | 🔨 standing | CI green; gmktec live; phone installed |
| 12-board-app | 🔨 NEW | /v2 current direction; theme overhaul in flight |
| 13-themes | 🔨 NEW | 13 skins → overhaul in flight |
| F1-F4 figma | ✅/🅿️ | extraction+analysis+components done; screens → v1 shipped |
| 14-squads-sound | ✅ NEW | dashboard + wagers + SFX shipped |

Lane folders: `agents/NN-name/` each with BRIEF.md. Handover docs (what an
agent finished, what's next, gotchas) go in `agents/_handovers/` — write one
after every completed wave (template in `_handovers/TEMPLATE.md`).

## THE FOUNDER'S STANDING DIRECTIVES (accumulated — obey)

- Reps language stays — NO poker terminology ("kitty" is out; it's "the pot")
- The track-and-field board-game style is the v2 direction (style only, not
  poker references)
- Old versions PRESERVED (v1 at /figma-app forever — design progression)
- Main page = the full hub (links to everything: versions, styles, SFX,
  avatars, docs)
- Themes must be TRULY distinct — app presentations, not token swaps
- Equity conversation separate from the $2,500 contract (both live in docs/)
- No money in-app until the points trial verdict (then decide)
- Catch-up for last place is a design principle (draft curve, notices)
- Cheeky never mean — last-place notices frame comeback, never shame
