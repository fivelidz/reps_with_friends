# Connect Design — Slack & WhatsApp onboarding

*How a crew gets from "here's a link" to "we're playing" on each platform.
Design principle: the chat is the arena — onboarding must land the bot in the
chat the group ALREADY uses, in under 2 minutes, with zero app installs for
spectators and players who only chat.*

## The shared shape

Every platform gets the same four beats, adapted:

```
1. CODE     captain creates a crew → 6-char code (KX4T9C)
2. ADD      bot enters the group's world (install / participant / invite)
3. LINK     one message binds chat ↔ crew: "link KX4T9C"
4. PLAY     new → join → start → log — the loop lives in the chat
```

The crew code is the universal join primitive: it works in-chat, on the
connect pages, in QR form, and deep-linked from the app.

---

## Slack — `/slack` (setup + install link)

**Reality:** Slack has proper app infrastructure. One app, many workspaces.

**Flow (built):**
1. **Create from manifest** — api.slack.com/apps → From an app manifest → paste (one copy button on `/slack`; manifest served at `/slack/manifest.yml`). Scopes: `commands`, `chat:write`, `app_mentions:read` — nothing creepy.
2. **Install to workspace** → bot token (`xoxb-`) + Socket Mode app token (`xapp-`).
3. **Add-to-Slack link** — paste the app's Client ID on `/slack` → we build `https://slack.com/oauth/v2/authorize?client_id=…&scope=commands,chat:write,app_mentions:read`. Bookmarkable (`/slack?client_id=…`) — this is THE shareable install link for any workspace admin. Corporate pilots get this link in their onboarding email.
4. **Bot online** — we run it (Socket Mode, no public URL needed).

**Design decisions:**
- Socket Mode over HTTP events: no public endpoint, no ngrok, works behind NAT — matches our local-first prototype.
- Slash command `/rwf` as primary surface; @RWF mention as secondary (same parser).
- The install link page doubles as the corporate "IT-approved" artefact: scopes table, what the bot can/can't do.

**Blocked on:** a human with a Slack login creates the app once (5 min) → then the Add-to-Slack link is permanent. See docs/15.

---

## WhatsApp — `/connect` (wa.me deep links + QR)

**Reality:** no bot-invite API, no app directory, no OAuth. The bot is a
phone number in your group. That's the constraint AND the charm — zero
platform permission, works today, every WhatsApp group on earth.

**Flow (built):**
1. Captain gets crew code in the app.
2. **Add the bot number** (+61 493 484 788) to the group — one manual step, by design. The group stays owned by the group; the bot is just a participant. Copy button on `/connect`.
3. **Tap the deep link** — `wa.me/61493484788?text=link%20KX4T9C` opens WhatsApp with the message ready; send it in the group. Bot confirms: `🔗 Chat linked to crew KX4T9C`.
4. **QR code** — same deep link as QR on `/connect`: scan → tap → linked. For gyms, offices, printed on the squat rack.

**Design decisions:**
- The manual group-add is framed as a feature (privacy story: "your group stays yours") not a bug.
- wa.me prefilled text removes typing; the command is short and self-documenting.
- DM fallback: same number, same command — solo players and 1:1 challenges work without a group.
- QR uses the same link — one artefact, three contexts (in-chat, in-person, print).

**Production note:** today this runs on our own number via the Qalarc Hub
(whatsmeow). At pilot scale we migrate to WhatsApp Business Cloud API — which
likely can't post INTO groups [VERIFY docs/08 §4] — the flow then becomes
per-player DMs with the group chat kept for human banter + result cards.
The crew-code primitive survives that migration unchanged; only step 2/3
delivery changes.

---

## Cross-platform glue

| Artefact | Where | Purpose |
|---|---|---|
| `/slack` | live | manifest copy, token steps, Add-to-Slack link builder |
| `/slack?client_id=…` | live | permanent install link per workspace |
| `/connect` | live | wa.me generator + QR + bot number |
| `/connect?code=KX4T9C` | live | app deep-links here with the crew code prefilled |
| `link <CODE>` | in-chat | the bind command (both platforms, same grammar) |

**Next wiring (not yet built):** the app's Link Chats screen should deep-link
to `/connect?code=…` and `/slack` instead of showing instructions inline —
one screen, two buttons, both flows hosted.
