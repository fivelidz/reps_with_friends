# Email draft v4 — Alexei → Ben (ALEXEI'S VERSION, copy-edited)

*This is Alexei's own rewrite of v3. I have only fixed typos and removed one
duplicated greeting — voice, structure and content are his. Ready to send.
Optional trims flagged in the notes below.*

---

**Subject:** Re: Reps With Friends — prototype, and where I'd take it

Ben — good to meet you, and thanks to Nico for the introduction.

Apologies for the delayed reply; I was hosting a bush doof across the weekend.

Your brief is very well considered. I've built gamified fitness systems
previously at a prior startup that specialised in biomarker aggregation. More
recently I have been building AI interface systems across different chat
platforms, so this project is well aligned for me.

Distributing through group chats I think is a great call — it reduces friction
and keeps engagement alive. For companies focused on corporate wellness I can
think of a few connections in that space, and I think the Slack integration
has potential for sure.

I started hashing out some ideas and prototyping what I could easily pull off
for this. Check out the following link — I brainstormed the concept a little,
threw together some features and thought about how this may play out. Slack
and WhatsApp integration is ready for me to start testing. The following site
is what I built this morning.

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
   cross-checks. I have built systems that can work in this area if we want to
   consider integration of this kind of tech.

2. **Charity wagers need legal structure before any money moves.** The instinct
   is right; the mechanism needs an opinion first. Employer-funded pots look
   like the cleanest path, and they open the corporate market at the same time.

3. **Apple Messages should be out of scope for MVP.** No bot API exists. I'm an
   Android person myself.

General background about myself: my background is in neuroscience and
pharmacology, I shifted into AI applications in law, and now I'm mostly
building and engineering tech systems. I live off grid near Sydney. I run a
development studio (qalarc.com — recent work includes tradez.au and
endispute.com.au), I've built my own WhatsApp/Signal messaging infrastructure,
and I came from Sahha, a company working on health-data APIs, which is
directly applicable to the wearables and corporate wellbeing side.

I'd still like the Figma and blueprint — I've deliberately designed my version
independently so far, which means we can compare approaches properly rather
than my anchoring on yours.

On structure: I'm genuinely interested in the equity conversation.

Let me know when would suit for a call? An hour would let us cover scope and
structure properly.

0425228338

Regards,
Alexei

---

## Notes (not for sending)

**What I changed (typos + one duplicate only):**
- `sysytems` → systems · `intergation` → integration · `backgorund` → background
- Removed the duplicated greeting: "Wonderful to e-meet you as well Ben, thanks
  Nico for the intro." — it repeated the opening line. Kept the opening.
- Folded the loose bullet under point 1 into the sentence (it was a stray dash).
- Minor: capitalised Slack/WhatsApp/Android/Sydney, "General background about
  myself..." became a sentence.

**Optional edits for you to consider (I did NOT make these):**
1. **Sahha appears twice** — once as "a prior startup that specialised in
   biomarker aggregation" (paragraph 2) and once by name in the background
   paragraph. Reads slightly redundant. Either name it up front, or leave the
   first reference generic and let the background paragraph land it.
2. **`qalarc.com` vs `qalarc.ai`** — you changed it to .com. Confirm that's the
   domain you want him visiting.
3. **The background paragraph is long** — it's the one place that reads as CV
   rather than conversation. Could trim to: neuroscience/pharmacology → AI in
   law → engineering; studio + Sahha. Your call; the off-grid detail is good
   colour and worth keeping.
4. **Silverchair still unmentioned** — deliberate, keeps it about the product.

**Before sending, sanity-check the live site:** /demo autoplays, /app loads,
/system renders. Note the AI guide may be degraded — Z.AI quota is exhausted
for a few hours; it falls back to canned answers, and the prebaked starter
chips still answer instantly, so a visitor won't hit a dead end.
