/* ═══════════════════════════════════════════════════════════════════════
   V3 FORK POINT: apps/v3/state.js copied from apps/board/state.js @
   2026-09-03 and re-keyed to rwf.v3 (a v3 save can never collide with
   rwf.board.v2 or rwf.figma.v1). V3 additions are marked "V3" below.
   ═══════════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════════
   RWF STATE — apps/board FORK (V2 · track-and-field board game).
   FORK POINT: copied from apps/figma-app/state.js @ 2026-09-02 (v1.0.0).
   Same shape, DIFFERENT localStorage keys (rwf.v3 — a v2 save can
   never collide with the v1 app's rwf.figma.v1) plus the board layer:
   draft-from-3 picks, the RP economy hook in logToMatch, points-gated
   card plays. All game math goes through the forked engine.js. Pure
   data + functions — no DOM.
   ═══════════════════════════════════════════════════════════════════════ */

import * as E from "./engine.js";

export const REAL_KEY = "rwf.v3";
/** Demo mode runs on a SHADOW copy of the state (the user's real save is
 *  never touched). useKey() swaps the storage key every load/save/mutate
 *  below reads; useKey(null) restores the real one. */
export const DEMO_KEY = "rwf.v3.demo";
export let KEY = REAL_KEY;
export function useKey(k) {
  KEY = (k === DEMO_KEY || k === REAL_KEY) ? k : REAL_KEY;
}

/* ── exercise catalogue (Ben's bodyweight pack + a few extras) ────────── */
export const EXERCISES = [
  { id: "pushup", name: "Push-ups", conv: "1 rep = 1 rep" },
  { id: "squat", name: "Squats", conv: "1 rep = 1 rep" },
  { id: "situp", name: "Sit-ups", conv: "1 rep = 1 rep" },
  { id: "lunge", name: "Lunges", conv: "1 rep = 1 rep" },
  { id: "plank", name: "Plank", conv: "timed · 1 sec = 1 rep" },
  { id: "burpee", name: "Burpees", conv: "1 rep = 1 rep" },
];
export const PACKS = {
  bodyweight: ["pushup", "squat", "situp", "lunge", "plank"],
  fullbody: ["pushup", "squat", "burpee", "lunge", "plank", "situp"],
};
export const TARGETS = [
  { id: "light", label: "Light", reps: 150, sub: "≈ a gentle week — 150 total reps" },
  { id: "solid", label: "Solid", reps: 300, sub: "the classic 300 format" },
  { id: "hero", label: "Hero", reps: 500, sub: "you're a menace — 500 total reps" },
];

/** Ben's crew, as engine players — the mates your battles are actually
 *  against in this build (the app is single-human; bots make it a game). */
export const MATES = [
  { id: "sam", name: "Sam K", tier: "fit" },
  { id: "alex", name: "Alex T", tier: "couch" },
  { id: "jordan", name: "Jordan P", tier: "athlete" },
  { id: "casey", name: "Casey M", tier: "casual" },
  { id: "mika", name: "Mikayla Long-Name-Rutherford", tier: "casual" },
];

export const CHARITIES = [
  { id: "beyond_blue", name: "Beyond Blue" },
  { id: "black_dog", name: "Black Dog Institute" },
  { id: "foodbank", name: "Foodbank Australia" },
];

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

/* ── load / save ──────────────────────────────────────────────────────── */

export function blank() {
  return { v: 1, player: null, matches: [], pots: {}, season: null, seq: 0 };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw);
    return s && s.v === 1 ? s : blank();
  } catch {
    return blank();
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  return state;
}

export function mutate(fn) {
  const s = load();
  const out = fn(s) ?? s;
  return save(out);
}

/* ── identity / onboarding ────────────────────────────────────────────── */

export function setPlayer({ name, tier }) {
  return mutate((s) => {
    const prev = s.player;
    s.player = {
      id: prev?.id ?? "you",
      name: String(name || "You").slice(0, 40),
      tier,
    };
    if (s.season && prev == null) {
      // first identity → seed the season roster with you + the mates
      s.season = E.createSeason(
        { id: "season-1", name: "Season 1" },
        [s.player, ...MATES]
      );
    }
  });
}

export function me(state = load()) {
  return state.player;
}

/* ── matches ──────────────────────────────────────────────────────────── */

export function crewCode(state = load()) {
  const n = (state.seq ?? 0) + 1;
  return `CREW-${String((n * 7 + 11) % 46656).padStart(4, "0").slice(0, 4)}${"QXZ7K2"[n % 6]}`;
}

export function createFastBattle({ name, days, pack, target, withMates = true }) {
  const target_ = TARGETS.find((t) => t.id === target) ?? TARGETS[1];
  const packIds = PACKS[pack] ?? PACKS.bodyweight;
  const state = load();
  const code = crewCode(state);
  let match = E.createMatch(
    {
      id: `m${Date.now()}`,
      name: String(name || "The Battle").slice(0, 40),
      exercises: EXERCISES.filter((e) => packIds.includes(e.id)),
      targetReps: target_.reps,
      playDays: days?.length ? days : [1, 3, 5],
      deadlineAt: playDayEndMs(), // FLOW-05: battles run to end of play day (9PM AEST)
    },
    withMates ? [state.player, ...MATES.slice(0, 3)] : [state.player]
  );
  match.createdAt = Date.now();
  match = E.initBoard(match); // V2: entry → pot, RP balances, 3-card drafts
  // mates pick their draft immediately (first dealt); YOU pick on the draft screen
  for (const p of match.players) {
    if (p.id === state.player?.id) continue;
    match = E.applyDraft(match, p.id, match.board.drafts[p.id][0]);
  }
  // V2 FORK DIVERGENCE: return the CREATED MATCH (v1 returned the whole
  // state). Callers route to its draft — S.currentMatch() would prefer an
  // older LIVE match over this fresh OPEN one and bounce the draft.
  const out = mutate((s) => {
    s.seq = (s.seq ?? 0) + 1;
    s.matches.push(match);
    s.crewCode = code; // latest crew code (bots bridge: `link <CODE>`)
    s.pots[match.id] = E.createPot(`pot-${match.id}`, match.id);
  });
  return out.matches.find((m) => m.config.id === match.config.id) ?? match;
}

export function matchById(id, state = load()) {
  return state.matches.find((m) => m.config.id === id) ?? null;
}

/** The match the app is "in": newest live, else newest open, else newest. */
export function currentMatch(state = load()) {
  const rank = { live: 0, open: 1, complete: 2 };
  return [...state.matches].sort(
    (a, b) =>
      (rank[a.status] ?? 3) - (rank[b.status] ?? 3) ||
      String(b.config.id).localeCompare(String(a.config.id))
  )[0] ?? null;
}

export function startById(id) {
  return mutate((s) => {
    const i = s.matches.findIndex((m) => m.config.id === id);
    if (i >= 0 && s.matches[i].status === "open") s.matches[i] = E.startMatch(s.matches[i]);
  });
}

/** Log reps for a player (default: you). Comeback is applied automatically
 *  per the engine. On closure the season result + pot are recorded.
 *  Returns { closed, comeback, match } or throws engine errors upward. */
export function logToMatch(matchId, { exerciseId, reps, playerId, verified = false }) {
  const pre = load();
  const match = pre.matches.find((m) => m.config.id === matchId);
  if (!match) throw new Error("match not found");
  const pid = playerId ?? pre.player?.id;
  let entry = E.applyComeback(match, {
    playerId: pid,
    exerciseId,
    reps,
    at: Date.now(),
    verified,
  });
  entry = E.applyLightning(match, entry); // FLOW-05: tag ×3 while the window is open
  const res = E.logReps(match, entry);
  // V2 board economy: RP for the logger, pot tip chips (post-log, pure)
  const withBoard = E.boardEconomy(res.state, entry);
  const out = mutate((s) => {
    const i = s.matches.findIndex((m) => m.config.id === matchId);
    s.matches[i] = withBoard;
    if (res.closedMatch) recordCompletion(s, withBoard);
  });
  return {
    closed: res.closedMatch,
    comeback: !!entry.comeback,
    lightning: !!entry.lightning,
    match: out.matches.find((m) => m.config.id === matchId),
  };
}

/** Demo helper: each mate logs a plausible set (keeps the board alive). */
export function simMates(matchId, seed = Math.random()) {
  const s = load();
  const match = s.matches.find((m) => m.config.id === matchId);
  if (!match || match.status !== "live") return { logged: [], played: [] };
  const logged = [];
  const played = [];
  for (const p of match.players) {
    if (p.id === s.player?.id) continue;
    const ex = match.config.exercises[Math.floor(seed * match.config.exercises.length) % match.config.exercises.length];
    const reps = 10 + Math.floor(seed * 89) % 40; // 10–49
    try {
      const r = logToMatch(matchId, { exerciseId: ex.id, reps, playerId: p.id });
      logged.push({ playerId: p.id, reps, exercise: ex.name, closed: r.closed });
      if (r.closed) break;
    } catch { /* mate hit a closed match mid-loop — fine */ }
    // V2: ~35% of the time a mate also PLAYS a card they can afford
    // (points-gated like yours — the table feels alive, animations fire)
    if ((seed * 7.13) % 1 < 0.35) {
      const live = load().matches.find((m) => m.config.id === matchId);
      const held = E.inventoryOf(live ?? match, p.id);
      const rp = E.boardPoints(live ?? match, p.id);
      const affordable = held.filter((c) => (E.CARD_COSTS[c.kind] ?? 0) <= rp);
      if (affordable.length) {
        const pick = affordable[Math.floor(seed * 97) % affordable.length];
        try {
          const pr = boardPlayInMatch(matchId, { playerId: p.id, kind: pick.kind });
          if (pr.result.ok) played.push({ playerId: p.id, kind: pick.kind, ...pr.result });
        } catch { /* engine refused (armed shield etc.) — fine */ }
      }
    }
  }
  return { logged, played };
}

/** Rematch: same config + players, fresh entries, immediately live. */
export function rematch(matchId) {
  const s = load();
  const old = s.matches.find((m) => m.config.id === matchId);
  if (!old) throw new Error("match not found");
  let fresh = E.startMatch(
    E.createMatch(
      { ...old.config, id: `m${Date.now()}`, deadlineAt: playDayEndMs() }, // fresh play-day deadline
      old.players
    )
  );
  fresh.createdAt = Date.now();
  fresh = E.initBoard(fresh); // V2: fresh entry, RP, drafts — draft again on rematch
  for (const p of fresh.players) {
    if (p.id === s.player?.id) continue;
    fresh = E.applyDraft(fresh, p.id, fresh.board.drafts[p.id][0]);
  }
  // V2 FORK DIVERGENCE: return the fresh match (see createFastBattle note)
  const out = mutate((st) => {
    st.matches.push(fresh);
    st.pots[fresh.config.id] = E.createPot(`pot-${fresh.config.id}`, fresh.config.id);
  });
  return out.matches.find((m) => m.config.id === fresh.config.id) ?? fresh;
}



/* ── V3 ADDITION — the other deadline ──────────────────────────────────
   The dual deadline closes on EITHER the reps target (engine logReps) or
   the clock (here). Called by the battle screen's ticker when now() has
   passed match.deadlineAt on a live battle: highest adjusted score wins,
   no closure bonus (nobody closed). Pure state-layer close, same shape
   the engine uses, so the result screen treats both closes identically. */
export function closeByDeadline(matchId) {
  const pre = load();
  const m = pre.matches.find((x) => x.config.id === matchId);
  if (!m || m.status !== "live") return { closed: false, match: m ?? null };
  const done = {
    ...m,
    status: "complete",
    completedAt: Math.min(m.deadlineAt ?? Date.now(), Date.now()),
    closedBy: null, // the clock closed it — nobody earns the closure bonus
  };
  mutate((s) => {
    const i = s.matches.findIndex((x) => x.config.id === matchId);
    if (i >= 0) s.matches[i] = done;
    recordCompletion(s, done);
  });
  return { closed: true, match: done };
}

/* ── power-ups + the V2 board layer (draft · points · plays) ─────────── */

/** DRAFT PICK (you): keep ONE of your dealt 3. Throws engine errors up. */
export function pickMyDraft(matchId, kind) {
  const pre = load();
  const match = pre.matches.find((m) => m.config.id === matchId);
  if (!match) throw new Error("match not found");
  const next = E.applyDraft(match, pre.player?.id, kind);
  return mutate((s) => {
    const i = s.matches.findIndex((m) => m.config.id === matchId);
    if (i >= 0) s.matches[i] = next;
  });
}

/** Your dealt draft choices (empty when already picked / no board). */
export function myDraft(matchId, state = load()) {
  const m = state.matches.find((x) => x.config.id === matchId);
  if (!m?.board) return null;
  if (m.board.picked?.[state.player?.id]) return null;
  return m.board.drafts?.[state.player?.id] ?? null;
}

/** Play a card THROUGH the RP economy (points-gated activatePowerUp).
 *  Persists only on ok. Returns { result, spent, pointsLeft, match }. */
export function boardPlayInMatch(matchId, { playerId, kind }) {
  const pre = load();
  const match = pre.matches.find((m) => m.config.id === matchId);
  if (!match) throw new Error("match not found");
  const res = E.boardActivate(match, playerId ?? pre.player?.id, kind);
  if (res.result.ok) {
    mutate((s) => {
      const i = s.matches.findIndex((m) => m.config.id === matchId);
      if (i >= 0) s.matches[i] = res.state;
    });
  }
  return {
    result: res.result,
    spent: res.spent ?? 0,
    pointsLeft: res.pointsLeft ?? E.boardPoints(match, playerId ?? pre.player?.id),
    match: load().matches.find((m) => m.config.id === matchId),
  };
}

/** The battle deadline as end-of-play-day: next 21:00 Australia/Sydney
 *  (the group clock Ben's design standardises on — matches dualClock).
 *  DST-safe via Intl; falls back to +24h off-browser. */
export function playDayEndMs(now = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit",
      hour12: false,
    });
    const [h, m] = fmt.format(now).split(":").map(Number);
    const minsNow = h * 60 + m;
    let minsLeft = 21 * 60 - minsNow;
    if (minsLeft <= 0) minsLeft += 1440; // past 9PM → tomorrow's play day
    return now.getTime() + minsLeft * 60_000;
  } catch {
    return now.getTime() + 24 * 60 * 60 * 1000;
  }
}

/** Your cards in a match (tolerates pre-FLOW-05 saved matches). */
export function myInventory(matchId, state = load()) {
  const m = state.matches.find((x) => x.config.id === matchId);
  if (!m) return [];
  return E.inventoryOf(m, state.player?.id);
}

/** Activate a held power-up inside a match (default: you). Persists the
 *  engine result + returns { result, match } — result is the result card
 *  ({ok:false, reason} on refusal; nothing is persisted then). */
export function activateInMatch(matchId, { playerId, kind }) {
  const pre = load();
  const match = pre.matches.find((m) => m.config.id === matchId);
  if (!match) throw new Error("match not found");
  const res = E.activatePowerUp(match, playerId ?? pre.player?.id, kind);
  if (res.result.ok) {
    mutate((s) => {
      const i = s.matches.findIndex((m) => m.config.id === matchId);
      if (i >= 0) s.matches[i] = res.state;
    });
  }
  return {
    result: res.result,
    match: load().matches.find((m) => m.config.id === matchId),
  };
}

/** DEV GRANT — replaces the store in this build. Grants ALL FOUR kinds to
 *  EVERY player (you + the mates, so shield-blocks and rival plays can be
 *  exercised). Honest label in the UI; not the real IAP economy. */
export function devGrant(matchId) {
  const pre = load();
  let m = pre.matches.find((x) => x.config.id === matchId);
  if (!m) return { awarded: 0, matchId };
  for (const p of m.players) {
    for (const kind of ["lightning", "steal", "shield", "freeze"]) {
      m = E.grantPowerUp(m, p.id, kind);
    }
  }
  const awarded = m.players.length * 4;
  mutate((s) => {
    const i = s.matches.findIndex((x) => x.config.id === matchId);
    if (i >= 0) s.matches[i] = m;
  });
  return { awarded, matchId };
}

/** Daily-drop style grant of one random card (the loot chest reveal). */
export function grantRandomTo(matchId, playerId) {
  const pre = load();
  const m0 = pre.matches.find((x) => x.config.id === matchId);
  if (!m0) return null;
  const pid = playerId ?? pre.player?.id;
  const kind = E.randomPowerUpKind();
  const m = E.grantPowerUp(m0, pid, kind);
  mutate((s) => {
    const i = s.matches.findIndex((x) => x.config.id === matchId);
    if (i >= 0) s.matches[i] = m;
  });
  return { kind, rarity: E.POWER_UPS[kind].rarity, playerId: pid };
}

/* ── season plumbing ──────────────────────────────────────────────────── */

function ensureSeason(s) {
  if (s.season) return s.season;
  const roster = s.player ? [s.player, ...MATES] : [...MATES];
  s.season = E.createSeason({ id: "season-1", name: "Season 1" }, roster);
  return s.season;
}

function recordCompletion(s, match) {
  const season = ensureSeason(s);
  const rows = E.finalStandings(match).map((r) => ({
    playerId: r.player.id,
    adjustedScore: r.adjustedScore,
  }));
  // MVP: most raw reps logged (simple, honest, engine-visible)
  const mvp = [...match.players]
    .map((p) => ({ id: p.id, raw: E.playerRawReps(p.id, match.entries) }))
    .sort((a, b) => b.raw - a.raw)[0]?.id;
  const week = Math.min(season.week, season.config.weeks);
  try {
    s.season = E.recordMatch(season, {
      matchId: match.config.id,
      week,
      standings: rows,
      mvpPlayerId: mvp,
    });
  } catch { /* season over — rematch still works, ladder frozen */ }
}

export function ladder(state = load()) {
  if (!state.season) return [];
  return E.seasonLadder(state.season).map((row) => ({
    ...row,
    name: nameOf(row.playerId, state),
  }));
}

function nameOf(playerId, state) {
  if (state.player?.id === playerId) return state.player.name;
  return (
    state.season?.players.find((p) => p.id === playerId)?.name ??
    MATES.find((m) => m.id === playerId)?.name ??
    playerId
  );
}

/* ── charity pot ──────────────────────────────────────────────────────── */

export function potFor(matchId, state = load()) {
  return state.pots[matchId] ?? E.createPot(`pot-${matchId}`, matchId);
}

export function addToPot(matchId, playerId, amountCents) {
  return mutate((s) => {
    s.pots[matchId] = E.contribute(potFor(matchId, s), playerId ?? s.player?.id, amountCents);
  });
}

export function designatePot(matchId, charityId) {
  const charity = CHARITIES.find((c) => c.id === charityId) ?? CHARITIES[0];
  return mutate((s) => {
    s.pots[matchId] = E.designate(potFor(matchId, s), charity);
  });
}

/* ── profile stats (derived from real history) ────────────────────────── */

export function stats(state = load()) {
  const you = state.player?.id;
  let lifetimeReps = 0, lifetimeAdjusted = 0, played = 0, wins = 0, sets = 0, comebacks = 0;
  for (const m of state.matches) {
    const mine = m.entries.filter((e) => e.playerId === you);
    if (m.players.some((p) => p.id === you)) played++;
    lifetimeReps += E.playerRawReps(you, m.entries);
    const p = m.players.find((x) => x.id === you);
    if (p) lifetimeAdjusted += Math.round(E.playerScore(p, m.entries));
    sets += mine.length;
    comebacks += mine.filter((e) => e.comeback).length;
    if (m.status === "complete") {
      const w = E.winner(m);
      if (w?.playerId === you) wins++;
    }
  }
  const streak = state.season?.streaks?.[you]?.length ?? 0;
  return { lifetimeReps, lifetimeAdjusted, played, wins, sets, comebacks, streak };
}

/* ── formatting helpers used by the screens ───────────────────────────── */

export function fmtDays(playDays = []) {
  return playDays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
    .join(", ");
}

export function dayLetters(playDays = []) {
  return DAYS.map((d, i) => ({ d, on: playDays.includes(i) }));
}

/** Dual clock: ms until 9:00 PM group time (Australia/Sydney), plus the
 *  local-time equivalent string. Falls back gracefully off-browser. */
export function dualClock(now = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Sydney", hour: "2-digit", minute: "2-digit",
      hour12: false,
    });
    const [h, m] = fmt.format(now).split(":").map(Number);
    const minsNow = h * 60 + m;
    const minsLeft = (21 * 60 - minsNow + 1440) % 1440;
    const local = new Intl.DateTimeFormat("en-AU", {
      hour: "numeric", minute: "2-digit", hour12: true,
    }).format(now);
    const hh = Math.floor(minsLeft / 60), mm = Math.floor(minsLeft % 60);
    return {
      time: `${hh}:${String(mm).padStart(2, "0")}:00`,
      sub: `ends 9:00 PM AEST · ${local} for you`,
    };
  } catch {
    return { time: "6:12:44", sub: "ends 9:00 PM AEST" };
  }
}
