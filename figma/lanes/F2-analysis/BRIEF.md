# Lane F2 — Design analysis (ours vs Ben's)

**Mission:** compare the Figma against our independent design (docs/13) and
produce the decision document: what we adopt, what we keep, what we argue.

**Owns:** `figma/notes/analysis.md`, docs/13 §7 divergence log

## Status: waiting on F1

## Method
1. Read `figma/notes/catalogue.md` + LOOK at every export in
   `figma/assets/exports/` (resize ≤1300px, Read tool — actually look).
2. Extract Ben's design language: colours (variables.json or pixel-sample the
   exports), type scale, spacing, radius, motion hints, component shapes,
   screen inventory, flows, copy tone.
3. Compare against docs/13_MVP_DESIGN.md section by section.
4. Fill docs/13 §7 divergence log — every difference gets a row:
   `ours | theirs | decision (adopt/keep/decide-on-call) | why`.
5. Flag gaps both ways: what Ben has that we never designed, and what we built
   that his file doesn't cover (comeback badge, seasons, sync states, camera
   verify, HR chip).

## Rules
- The Figma is the founder's intent — weight it heavily — but our working
  prototype has shipped learnings his static file can't have. "Adopt" is the
  default for visual language; "keep" needs a functional reason; "decide" goes
  on the call agenda (docs/09).
- No implementation in this lane. Analysis only.

## Definition of done
analysis.md covers every screen + the design language; divergence log has a
row for every meaningful difference; a one-page summary ready for the call.
