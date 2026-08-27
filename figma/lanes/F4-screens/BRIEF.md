# Lane F4 — Screen implementation

**Mission:** rebuild the app's screens per the Figma (as filtered by F2/F3),
keeping every working feature intact.

**Owns:** `apps/web/src/screens/**`, `apps/web/src/styles.css`

## Status: waiting on F3

## Method
1. Screen-by-screen from F2's priority order (likely: onboard → crew → match
   live → result → seasons → profile → link).
2. For each: rebuild layout/visuals per the Figma export using the F3
   component library + tokens. KEEP the underlying logic wired: state.ts
   actions, sync layer, camera verify, HR, comeback badge, MVP vote. Visual
   change, not functional rewrite — unless F2 flagged the flow itself.
3. Screenshot each rebuilt screen next to its Figma export; run the suites
   (flow.ts 31, browser.ts 37 — update assertions only for intentional visual
   changes, with dated comments).
4. Rebuild bundle, full suite, deploy.

## Rules
- Never regress: engine, sync, verification, seasons all stay green.
- Bots and hub cards evolve separately once F3 lands components.

## Definition of done
Every F2-prioritised screen matches its Figma export (screenshot evidence),
full test suite green, deployed to rwf.qalarc.com.
