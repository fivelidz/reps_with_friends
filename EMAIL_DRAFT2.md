# Email draft v3 — Alexei → Ben

*Reply to Ben's intro email (via Nico). Tone: professional, substantive,
peer-to-peer. Less casual than v2 — this version leads with demonstrated work
and a clear proposal. Body ~420 words. Review + edit before sending.*

---

**Subject:** Re: Reps With Friends — prototype, and where I'd take it

Ben — good to meet you, and thanks to Nico for the introduction.

Apologies for the delayed reply; I was hosting a bush doof across the weekend. Wonderful to e-meet you as well Ben, thanks Nico for the intro. 

Your brief is very well considered. I've built gamified fitness systems previously at a prior startup that specialised in biomarker aggregation. More recently I have been building AI interface systems across different chat platforms so this project is well aligned for me. 
Distributing through group chats I think is a great call and reduces friction and keeps the app engagement alive. Companies focused on corporate wellness I can think of a few connections in that space and I think the slack integration has potential for sure. 

I started hashing out some ideas and prototyping what I could easily pull off for this. Check out the following link as I brainstormed this concept a little and threw together some features and thought about how this may play out. Slack integration and whatsapp integration is ready for me to start testing. The following site is what I built this morning. 

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
   cross-checks.
- I have built sysytems that can work in this area if we want to consider intergation of this kind of tech. 
   
2. **Charity wagers need legal structure before any money moves.** The instinct
   is right; the mechanism needs an opinion first. Employer-funded pots look
   like the cleanest path, and they open the corporate market at the same time.
   
3. **Apple Messages should be out of scope for MVP.** No bot API exists. I'm an android person myself. 

General backgorund about myself...
My background is in Neuroscience and pharmacology, I shifted into AI applications in law and now am mostly building and engineering tech systems. I live off grid near sydney. 
I run a development studio (qalarc.com — recent work includes tradez.au and endispute.com.au), I've built my own WhatsApp/Signal messaging infrastructure, and I came from Sahha a company working on health-data APIs, which is directly applicable to the wearables and corporate
wellbeing side.

I'd still like the Figma and blueprint — I've deliberately designed my version
independently so far, which means we can compare approaches properly rather
than my anchoring on yours.

On structure: I'm genuinely interested in the equity conversation. 

Let me know when would suit for a call? An hour would let us cover scope
and structure properly.

0425228338

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
