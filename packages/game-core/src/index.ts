// @rwf/game-core — spec surface.
//
// ENGINE V4 (the SOT model, 2026-09-03): ruf (unit ruling), daily (daily
// battle), powerups (SOT canon), season (battle seasons + stakes), teams
// (team-mode scaffold), plus the v4 handicap additions.
//
// LEGACY 300-format (archived but fully exported — the v1/v2/v3 app engine
// forks in apps/figma-app, apps/board, apps/v3 run on it): types, handicap,
// match, pot, comeback, season300 (→ legacy300.ts), baseline, nemesis,
// photo-finish. The forks are independent copies; re-sync deliberately.

export * from "./types.ts";
export * from "./handicap.ts";
export * from "./match.ts";
export * from "./pot.ts";
export * from "./comeback.ts";
export * from "./legacy300.ts";
export * from "./baseline.ts";
export * from "./nemesis.ts";
export * from "./photo-finish.ts";
export * from "./ruf.ts";
export * from "./daily.ts";
export * from "./powerups.ts";
export * from "./season.ts";
export * from "./teams.ts";
