# 2026-09-10 Codex 3D Visual Pass

## Scope

- Edited `apps/v3/course.js` and `apps/v3/app.js` only.
- Did not touch `apps/sot/`, `apps/api/`, or `packages/`.

## What Changed

- Upgraded the Three.js lighting rig: warm directional key, cool rim light, softer hemisphere ambient, subtle turf bounce, ACES tone mapping, and closer fog for a more dramatic but still readable dark-sports scene.
- Reworked lane surfaces from flat colored boxes into generated canvas stripe textures per tier, with edge glow lines and rough Standard materials.
- Added a low-poly stadium suggestion around the course: tiered stand blocks and small light masts outside the track corridor.
- Improved power-up billboard card faces with richer canvas rendering: brighter rarity border, inner highlight, diagonal surface detail, and glyph glow.
- Improved runner legibility at TABLE distance:
  - tier-colored additive silhouette glow behind every runner,
  - existing name labels lifted slightly,
  - current P1 gets a floating crown and stronger glow.
- Added motion polish:
  - runner progress now uses smoothstep acceleration/deceleration,
  - idle/start-line breathing happens on the visible figure, not the debug world anchor,
  - held 3D cards bob and subtly tilt.
- Added game-moment FX:
  - `+N REPS` 3D text burst when the user or mates log reps,
  - course-level confetti particles on Daily Deal,
  - 3D confetti burst when the podium rises.
- Fixed a lifecycle issue while working: `Course3D` now stores the provided `onModelsReady` callback, and shared generated textures are reset after context disposal so lazy remounts do not reuse disposed maps.

## Visual Verdict

- Before, based on existing screenshots inspected:
  - Phone TABLE (`apps/v3/shots/52-battle-table_pov_v3.png`): structurally clear, but mostly flat green/gray field; cards and runners were small and low-contrast.
  - Desktop TABLE (`apps/v3/shots/88-desktop-table_pov_v3.png`): good board-course framing, but sparse environment and flat lane bands made it feel more prototype than flagship.
- After, expected from code changes:
  - The course should read more like a night-stadium miniature: textured lanes, atmospheric rim/key lighting, visible stands, and stronger runner/card read from TABLE.
  - Moment-to-moment interactions should feel more alive: eased runner advances, floating rep bursts, card tilt, crown leadership, and particle celebration.

## Verification

- Syntax:
  - `node --check apps/v3/app.js` passed.
  - `node --check apps/v3/course.js` passed.
- Full harnesses could not be executed in this sandbox:
  - `bun apps/v3/e2e.mjs` failed before app load because `Bun.serve` could not bind `4193` (`EADDRINUSE`).
  - `bun serve.ts` failed before `geom.mjs` because `Bun.serve` could not bind `4173` (`EADDRINUSE`).
  - A temporary uncommitted e2e copy on alternate port `4313` also failed to bind (`EADDRINUSE`), indicating local binding is blocked/occupied at the sandbox level rather than by the v3 code.
- Existing baseline screenshots were read visually, but fresh screenshots could not be captured without a bindable local server.

## Risk Notes

- The largest regression risk is frame budget from extra lighting/material detail. The added steady-state geometry is intentionally low-poly; confetti/text FX are transient and self-dispose.
- Re-run the requested verification in an environment that can bind local ports:
  - `bun apps/v3/e2e.mjs && bun apps/v3/geom.mjs`

