# Lane F3 — Component implementation

**Mission:** implement Ben's Figma components in OUR design system — mapped,
not forked.

**Owns:** `figma/impl/components/`, `design/tokens.css` (extensions),
component library on `/system`

## Status: waiting on F2's decisions

## Method
1. From F2's adopt-list: build each Figma component as a live component in our
   system (same pattern as the /system component library).
2. Map Figma values → our tokens: his colours become token values (or new
   named tokens, never hex literals in components); type/spacing/radius map
   or extend the scale.
3. Every implemented component gets a card on `/system` with a note:
   "from Figma — mapped: X→Y".
4. Screenshot-verify each against its Figma export (resize, look, diff).

## Rules
- design/tokens.css is the single source of truth — components consume tokens.
- Deliberate divergences only, each logged in docs/13 §7.
- Don't break existing components; extend the library.

## Definition of done
Every adopted Figma component renders in our system, token-mapped, verified
against the export, listed on /system.
