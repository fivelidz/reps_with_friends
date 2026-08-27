# Email draft v3 — Alexei → Ben

*Reply to Ben's intro email (via Nico). Tone: professional, substantive,
peer-to-peer. Less casual than v2 — this version leads with demonstrated work
and a clear proposal. Body ~420 words. Review + edit before sending.*

---

**Subject:** Re: Reps With Friends — prototype, and where I'd take it

Ben — good to meet you, and thanks to Nico for the introduction.

Apologies for the delayed reply; I was committed to an event over the weekend
and wanted to give this a proper response rather than a quick one.

Your brief is the most considered I've received. Two things stand out. The
handicap system is the actual product — it's what separates a novelty from
something people play for years, and almost nobody in fitness has solved it.
Second, distributing through group chats rather than competing with them is
the correct call, and it's rarer thinking than it should be.

Rather than describe what I'd build, I built it. Over the past few days I've
put together a working prototype so we have something concrete to react to on
the call:

**https://rwf.qalarc.com**

- **/demo** — a 90-second replay of a full match. A couch-tier player beats an
  athlete on effort-adjusted score, including a comeback multiplier. This is
  the fastest way to see the concept working.
- **/app** — the app itself: onboarding, crew creation, live matches, seasons,
  charity pots, result cards.
- **/system** — the complete technical and design breakdown: design system,
  component library, all 36 features catalogued with build status, and current
  progress.

What's running underneath: a tested game engine (handicap scoring, seasons,
comeback multiplier, charity pot ledger), working WhatsApp and Slack bots on a
shared command set, in-browser camera rep counting with heart-rate strap
support, and an operations console. Roughly 130 automated tests, deployed
continuously.

Three things I'd flag from the work so far:

1. **Rep verification is solvable.** On-device camera counting plus heart-rate
   cross-checks — nothing uploaded, which also becomes the privacy story for
   corporate sales.
2. **Charity wagers need legal structure before any money moves.** The instinct
   is right; the mechanism needs an opinion first. Employer-funded pots look
   like the cleanest path, and they open the corporate market at the same time.
3. **Apple Messages should be out of scope for MVP.** No bot API exists.
   Planning around it would burn budget for nothing.

My background is relevant here: I run a development studio (qalarc.ai — recent
work includes tradez.au and endispute.com.au), I've built my own
WhatsApp/Signal messaging infrastructure, and I came from Sahha working on
health-data APIs, which is directly applicable to the wearables and corporate
wellbeing side. [CONFIRM: Sahha role + tenure wording]

I'd still like the Figma and blueprint — I've deliberately designed my version
independently so far, which means we can compare approaches properly rather
than my anchoring on yours.

On structure: I'm genuinely interested in the equity conversation. I'd rather
have ownership in this than invoice it.

Would Tuesday or Wednesday suit for a call? An hour would let us cover scope
and structure properly.

Regards,
Alexei

---

## Notes (not for sending)

- **Tone shift from v2:** removed "bush doof", "got keen", "cheers to Nico for
  the join-the-dots", "fair warning". Now reads as a founder-to-founder reply
  rather than a mate's message. The weekend reference is neutral — restore the
  doof detail if you want the muso connection (he may well appreciate it).
- **Leads with the prototype**, with three specific labelled links so a
  non-technical reader knows exactly where to click first. Demo first.
- **[CONFIRM] before sending:** exact Sahha role/tenure wording.
- **Call extended to an hour** (was 45 min) — there's more to cover now.
- **Credentials placed lower** and framed as relevance, not CV.
- **Figma framing sharpened:** independent design = better comparison, which
  is a stronger reason than "send it over".
- Still no Silverchair mention — keeps it about the product.
- If equity bites: next step is roles/split/vesting/IP assignment memo —
  see docs/01 §4 and docs/09_CALL_PREP.md.
- **Length:** ~420 words vs v2's ~300. Justified by the prototype links, but
  trim the "what's running underneath" paragraph if you want it tighter.
