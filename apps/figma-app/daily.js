/* ═══════════════════════════════════════════════════════════════════════
   RWF DAILY — the temporal game loop behind Ben's FLOW-06 + FLOW-07.
   Battles run across days with play-day deadlines; a nightly 3-level
   DANGER ZONE escalation (3h/1h/30min, gold→orange→red) pressures last
   logs; each day closes with a DAILY WINNER + recap; the battle itself
   finishes when someone hits the raw target (engine.js owns that).

   Pure functions over engine/state + one small app ticker. NO engine.js
   edits: standings math is reused by filtering entries to a day bucket.
   Time is INJECTABLE (setNowOverride) so e2e can time-travel; every
   function also takes an explicit now. deadlineAt is consumed
   defensively — if the engine layer adds it, it wins over the computed
   end-of-play-day deadline.
   ═══════════════════════════════════════════════════════════════════════ */

import * as E from "./engine.js";
import * as S from "./state.js";

/* ── injectable clock ────────────────────────────────────────────────────
   The whole module reads time through now(). Production: Date.now().
   Tests: setNowOverride(ts) pins it (same module instance the app uses —
   dynamic import of the same URL hits the module registry). */
let _nowOverride = null;
export function now() { return _nowOverride ?? Date.now(); }
export function setNowOverride(ts) { _nowOverride = Number.isFinite(ts) ? ts : null; }
export function clearNowOverride() { _nowOverride = null; }

/* ── day math — local calendar days are the play-day buckets ─────────── */

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const WEEKDAYS_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** "YYYY-MM-DD" (local) — the bucket a timestamp belongs to. */
export function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** 23:59:59.999 local on the given day — the play-day deadline. */
export function endOfDay(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}
/** 00:00:00.000 local on the given day. */
export function startOfDay(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
export function weekdayOf(dayKey) {
  return WEEKDAYS[new Date(startOfDay(dayKey)).getDay()];
}
export function weekdayShortOf(dayKey) {
  return WEEKDAYS_SHORT[new Date(startOfDay(dayKey)).getDay()];
}
/** "MONDAY" etc — Ben's "YOU WON TUESDAY" copy is day-name based. */
export const dayLabel = weekdayOf;

/** Is the calendar day of ts a play day for this match? (no playDays → all play) */
export function isPlayDay(match, ts) {
  const pd = match?.config?.playDays;
  if (!Array.isArray(pd) || pd.length === 0) return true;
  return pd.includes(new Date(ts).getDay());
}

/* ── deadline + danger zone (FLOW-06) ─────────────────────────────────── */

/** The play day the match is currently "in" (today if a play day, else the
 *  next one). The day whose deadline we count down to. */
export function activeDayKey(match, nowTs = now()) {
  const d0 = new Date(nowTs);
  for (let k = 0; k < 8; k++) {
    const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + k);
    if (isPlayDay(match, d.getTime())) return dayKeyOf(d.getTime());
  }
  return dayKeyOf(nowTs);
}

/** Deadline for the current play day. deadlineAt (the engine layer sets
 *  next-21:00-Australia/Sydney at create; Time Freeze extends it) wins
 *  while live or pending close; once its day is closed (and settleDay has
 *  rolled it forward) a stale value falls back to end-of-play-day local —
 *  so day 2+ always has a real deadline either way. */
export function deadlineFor(match, nowTs = now()) {
  const explicit = Number(match?.deadlineAt);
  if (Number.isFinite(explicit)) {
    const closed = (match?.dailyHistory ?? {})[dayKeyOf(explicit)];
    if (explicit >= nowTs || !closed) return explicit;
  }
  return endOfDay(activeDayKey(match, nowTs));
}

/** The day the match is currently playing — the bucket the current
 *  deadline (whichever branch won) belongs to. */
export function currentDayKey(match, nowTs = now()) {
  return dayKeyOf(deadlineFor(match, nowTs));
}

/** Figma ramp: 0 none · 1 ≤3h gold · 2 ≤1h orange · 3 ≤30min red. */
export function dangerLevel(match, nowTs = now()) {
  if (!match || match.status !== "live") return 0;
  const rem = deadlineFor(match, nowTs) - nowTs;
  if (rem <= 0) return 0; // at/past deadline the day-close takes over
  if (rem <= 30 * 60e3) return 3;
  if (rem <= 60 * 60e3) return 2;
  if (rem <= 3 * 60 * 60e3) return 1;
  return 0;
}

/** Ben's banner copy, per level (verbatim pattern: "DANGER ZONE — 24 MINUTES LEFT"). */
export function dzCopy(level, remMs) {
  if (level === 3) return `DANGER ZONE — ${Math.max(1, Math.ceil(remMs / 60e3))} MINUTES LEFT`;
  if (level === 2) return "DANGER ZONE — UNDER AN HOUR LEFT";
  return "DANGER ZONE — FINAL 3 HOURS";
}

/* ── formatting (his dual clock: group AEST + your local) ────────────── */

export function fmtClock(remMs) {
  const rem = Math.max(0, remMs);
  const h = Math.floor(rem / 3600e3);
  const m = Math.floor((rem % 3600e3) / 60e3);
  const s = Math.floor((rem % 60e3) / 1e3);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Compact chip countdown: "2h 14m" / "41m" / "38s". */
export function fmtChip(remMs) {
  const rem = Math.max(0, remMs);
  if (rem >= 3600e3) return `${Math.floor(rem / 3600e3)}h ${Math.floor((rem % 3600e3) / 60e3)}m`;
  if (rem >= 60e3) return `${Math.max(1, Math.floor(rem / 60e3))}m`;
  return `${Math.max(1, Math.floor(rem / 1e3))}s`;
}

function fmtTime(ts, timeZone = undefined) {
  try {
    const opts = { hour: "numeric", minute: "2-digit", hour12: true };
    if (timeZone) opts.timeZone = timeZone;
    return new Intl.DateTimeFormat("en-AU", opts).format(new Date(ts));
  } catch { return null; }
}
export const fmtTimeLocal = (ts) => fmtTime(ts) ?? "";

/** Dual-clock strings for the deadline: time remaining + both wall clocks. */
export function deadlineClock(match, nowTs = now()) {
  const dl = deadlineFor(match, nowTs);
  const aest = fmtTime(dl, "Australia/Sydney");
  const local = fmtTime(dl);
  let sub = "ends at the day deadline";
  if (aest && local) sub = `ends ${aest} AEST · ${local} for you`;
  else if (aest) sub = `ends ${aest} AEST`;
  else if (local) sub = `ends ${local} your time`;
  return { time: fmtClock(dl - nowTs), sub, level: dangerLevel(match, nowTs), deadlineAt: dl };
}

/* ── daily standings — engine math, filtered to one day's entries ────── */

export function entriesForDay(match, dayKey) {
  return (match?.entries ?? []).filter((e) => dayKeyOf(e.at ?? 0) === dayKey);
}

/** Standings for one play day: engine.standings over a day-filtered match.
 *  Only players who logged that day appear (a day you didn't log isn't yours). */
export function dailyStandings(match, dayKey) {
  const dayEntries = entriesForDay(match, dayKey);
  const day = { ...match, entries: dayEntries };
  const rows = E.standings(day)
    .map((r) => ({
      playerId: r.player.id,
      name: r.player.name,
      rawReps: r.rawReps,
      adjustedScore: r.adjustedScore,
      sets: dayEntries.filter((e) => e.playerId === r.player.id).length,
    }))
    .filter((r) => r.sets > 0);
  // deterministic tie-break under the engine's adjustedScore sort:
  // more raw reps, then earliest first entry of the day.
  const firstAt = (pid) => Math.min(...(dayEntries.filter((e) => e.playerId === pid).map((e) => e.at ?? 0).concat([Infinity])));
  return rows.sort(
    (a, b) => b.adjustedScore - a.adjustedScore || b.rawReps - a.rawReps || firstAt(a.playerId) - firstAt(b.playerId)
  );
}

/* ── day close (FLOW-07: deadline → logging closes → result computes) ─── */

/** Pure: the daily result for one closed day. Does NOT touch state. */
export function closeDay(match, dayKey, { nowTs = now(), pot = null, youId = null } = {}) {
  const rows = dailyStandings(match, dayKey);
  const entries = entriesForDay(match, dayKey);
  const winner = rows.length ? rows[0] : null;
  const you = youId ?? match?.players?.[0]?.id ?? null;
  const potTotal = pot ? E.potTotalCents(pot) : 0;
  // potDelta: growth of the charity pot since the previous closed day.
  // (Contributions carry no timestamps in the engine port, so the delta is
  // measured close-to-close — honest, and exact enough for the recap.)
  const hist = match?.dailyHistory ?? {};
  const prevKeys = Object.keys(hist).sort();
  const prevTotal = prevKeys.length ? hist[prevKeys[prevKeys.length - 1]].potTotalCents ?? 0 : 0;
  return {
    dayKey,
    closedAt: nowTs,
    winner: winner
      ? { playerId: winner.playerId, name: winner.name, adjustedScore: winner.adjustedScore, rawReps: winner.rawReps }
      : null,
    youWon: !!winner && winner.playerId === you,
    standings: rows,
    entriesCount: entries.length,
    potTotalCents: potTotal,
    potDeltaCents: Math.max(0, potTotal - prevTotal),
  };
}

/** Recording half: writes the result into rwf.figma.v1 as
 *  match.dailyHistory[dayKey]. Idempotent — returns null if already closed.
 *  Matches using the engine's deadlineAt convention get it ROLLED to the
 *  next 21:00 Australia/Sydney play-day end (state.playDayEndMs), so the
 *  next day has a real deadline without any engine change. */
export function settleDay(matchId, dayKey, opts = {}) {
  const pre = S.load();
  const m = pre.matches.find((x) => x.config.id === matchId);
  if (!m || (m.dailyHistory ?? {})[dayKey]) return null;
  const result = closeDay(m, dayKey, { ...opts, youId: opts.youId ?? pre.player?.id });
  S.mutate((s) => {
    const mm = s.matches.find((x) => x.config.id === matchId);
    mm.dailyHistory = { ...(mm.dailyHistory ?? {}), [dayKey]: result };
    if (Number.isFinite(Number(mm.deadlineAt))) {
      try { mm.deadlineAt = S.playDayEndMs(new Date(result.closedAt)); } catch {}
    }
  });
  return result;
}

/** Previous play day strictly before dayKey. */
export function prevPlayDay(match, dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  for (let k = 1; k <= 8; k++) {
    const dd = new Date(y, m - 1, d - k);
    if (isPlayDay(match, dd.getTime())) {
      const key = dayKeyOf(dd.getTime());
      return { dayKey: key, weekday: WEEKDAYS[dd.getDay()], weekdayShort: WEEKDAYS_SHORT[dd.getDay()], closesAt: endOfDay(key) };
    }
  }
  return null;
}

/** Play days whose deadline has passed but have no recorded result yet
 *  (most-recent-first). Only days the match was LIVE for.
 *  deadlineAt matches close at their (possibly freeze-extended) deadline;
 *  legacy/computed matches close at local play-day end. Empty days only
 *  auto-close at the boundary (the play day immediately before the open
 *  one) — an absence never chain-generates a pile of empty "brutal days". */
export function dueDays(match, nowTs = now()) {
  if (!match || match.status !== "live") return [];
  const hist = match.dailyHistory ?? {};
  const startedAt = match.startedAt ?? 0;
  const out = [];
  const explicit = Number(match.deadlineAt);
  if (Number.isFinite(explicit)) {
    const key = dayKeyOf(explicit);
    if (nowTs > explicit && !hist[key] && explicit >= startedAt) out.push(key);
    return out;
  }
  const d0 = new Date(nowTs);
  const walked = [];
  for (let k = 0; k < 8; k++) {
    const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() - k);
    if (!isPlayDay(match, d.getTime())) continue;
    const key = dayKeyOf(d.getTime());
    const eod = endOfDay(key);
    if (eod >= nowTs) continue; // still open
    if (eod < startedAt) continue; // battle wasn't live yet
    if (hist[key]) continue;
    walked.push(key);
  }
  if (!walked.length) return out;
  const withEntries = walked.filter((k) => entriesForDay(match, k).length > 0);
  const boundary = prevPlayDay(match, activeDayKey(match, nowTs))?.dayKey ?? null;
  if (boundary && walked[0] === boundary && !withEntries.includes(boundary)) {
    out.push(boundary, ...withEntries); // the just-passed deadline closes even with zero logs
  } else {
    out.push(...withEntries);
  }
  return out;
}

/** Next play day strictly after dayKey → "tomorrow's stakes". */
export function nextPlayDay(match, dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  for (let k = 1; k <= 8; k++) {
    const dd = new Date(y, m - 1, d + k);
    if (isPlayDay(match, dd.getTime())) {
      const key = dayKeyOf(dd.getTime());
      return { dayKey: key, weekday: WEEKDAYS[dd.getDay()], weekdayShort: WEEKDAYS_SHORT[dd.getDay()], closesAt: endOfDay(key) };
    }
  }
  return null;
}

/* ── the recap card (FLOW-07: winner reveal → streak → recap → next-day) ─ */

const firstName = (name) => String(name ?? "?").split(" ")[0];

/** Did `youId` lead the day at any point, and when did they last lead?
 *  Walks the day's entries chronologically, tracking cumulative adjusted. */
function ledUntil(match, dayKey, youId) {
  const entries = entriesForDay(match, dayKey).slice().sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const playerOf = (pid) => match.players.find((p) => p.id === pid);
  const totals = new Map();
  let lastLedAt = null;
  let led = false;
  for (const e of entries) {
    const p = playerOf(e.playerId);
    if (!p) continue;
    totals.set(e.playerId, (totals.get(e.playerId) ?? 0) + E.scoreEntry(p, e));
    const mine = totals.get(youId) ?? 0;
    const bestOther = Math.max(0, ...[...totals.entries()].filter(([pid]) => pid !== youId).map(([, v]) => v));
    if (mine > bestOther) { led = true; lastLedAt = e.at ?? 0; }
  }
  const finalMine = totals.get(youId) ?? 0;
  const finalBest = Math.max(0, ...[...totals.entries()].filter(([pid]) => pid !== youId).map(([, v]) => v));
  return { led, lastLedAt, stillLeading: finalMine > finalBest };
}

/** Recap data for one day — from recorded history when present (history is
 *  truth), else computed live. Everything the daily screen renders. */
export function recapFor(match, dayKey, { youId = null, nowTs = now() } = {}) {
  const you = youId ?? match?.players?.[0]?.id ?? null;
  const recorded = (match?.dailyHistory ?? {})[dayKey] ?? null;
  const rows = dailyStandings(match, dayKey);
  const standings = recorded?.standings ?? rows;
  const entries = entriesForDay(match, dayKey);
  const players = match?.players ?? [];

  const winner = recorded?.winner ?? (rows.length ? { playerId: rows[0].playerId, name: rows[0].name, adjustedScore: rows[0].adjustedScore, rawReps: rows[0].rawReps } : null);
  const youWon = !!winner && winner.playerId === you;
  const youRow = standings.find((r) => r.playerId === you) ?? null;
  const yourRank = youRow ? standings.findIndex((r) => r.playerId === you) + 1 : null;
  const ahead = youRow && yourRank > 1 ? standings[yourRank - 2] : null;
  const behindYou = youRow && yourRank === 1 && standings.length > 1 ? standings[1] : null;

  /* headline — Ben's exact shapes */
  let headline;
  if (!winner) headline = `NOBODY LOGGED. BRUTAL DAY.`;
  else if (youWon) headline = `YOU WON ${weekdayOf(dayKey)}`;
  else headline = `${String(firstName(winner.name)).toUpperCase()} TOOK ${weekdayOf(dayKey)}`;

  /* your line — "You finished 2nd at 92% — 10 RUF short." pattern */
  let youLine = null;
  if (youRow) {
    const diff = ahead ? Math.max(1, Math.round(ahead.adjustedScore - youRow.adjustedScore)) : 0;
    youLine = ahead
      ? `You finished ${ordinal(yourRank)} at ${Math.round(youRow.adjustedScore)} RUF — ${diff} short.`
      : `You finished 1st on ${Math.round(youRow.adjustedScore)} RUF adjusted (${youRow.rawReps} raw reps).`;
  }

  /* led-and-lost line — "You were ahead until 7 PM." but computed honestly */
  let ledLine = null;
  if (youRow && !youWon) {
    const led = ledUntil(match, dayKey, you);
    if (led.led && led.lastLedAt != null) ledLine = `You led until ${fmtTime(led.lastLedAt) ?? "late"}. Tomorrow, finish the job.`;
    else ledLine = `Tomorrow, finish the job.`;
  }

  /* nemesis tease — the head-to-head that day */
  let nemesis = null;
  if (youRow && ahead) {
    nemesis = `${firstName(ahead.name)} finished ${Math.max(1, Math.round(ahead.adjustedScore - youRow.adjustedScore))} RUF ahead of you today. Settle it next battle day.`;
  } else if (behindYou) {
    nemesis = `You beat ${firstName(behindYou.name)} by ${Math.max(1, Math.round(youRow.adjustedScore - behindYou.adjustedScore))} RUF today. They're coming for you.`;
  }

  /* MOMENTS — his recap strip, computed from the real entry log */
  const moments = [];
  if (entries.length === 0) {
    moments.push("🦗 Crickets. The day closed with zero logs — streaks survive, pride doesn't.");
  } else {
    const big = entries.reduce((a, b) => (Number(b.reps) > Number(a.reps) ? b : a));
    const bigEx = match.config.exercises.find((x) => x.id === big.exerciseId);
    const bigWho = players.find((p) => p.id === big.playerId);
    moments.push(`⚡ ${bigWho ? (bigWho.id === you ? "You" : firstName(bigWho.name)) : "Someone"} logged ${big.reps} ${(bigEx?.name ?? "reps").toLowerCase()} in one set — biggest of the day`);
    const cb = entries.find((e) => e.comeback);
    if (cb) {
      const cbWho = players.find((p) => p.id === cb.playerId);
      moments.push(`🚀 ${cbWho ? (cbWho.id === you ? "You" : firstName(cbWho.name)) : "Someone"} claimed the ×1.2 comeback`);
    }
    const swept = standings.length === players.length && players.length > 1;
    if (swept) {
      const hist = match?.dailyHistory ?? {};
      const firstSweep = !Object.entries(hist).some(([k, r]) => k !== dayKey && (r.standings?.length ?? 0) === players.length);
      moments.push(`🔥 Whole crew logged — ${firstSweep ? "first" : "another"} clean sweep this battle`);
    }
    if (winner) {
      const battleLeader = E.standings(match)[0];
      if (battleLeader && battleLeader.player.id !== winner.playerId) {
        moments.push(`👑 ${firstName(winner.name)} took the day off ${battleLeader.player.id === you ? "you" : firstName(battleLeader.player.name)} — overall lead still live`);
      }
    }
  }

  /* tomorrow's stakes — the rolled engine deadline when present (21:00
   *  AEST convention), else the next calendar play day */
  const battleOver = match?.status === "complete";
  let next = null;
  if (!battleOver) {
    const dl = Number(match?.deadlineAt);
    if (Number.isFinite(dl) && dl > (recorded?.closedAt ?? 0)) {
      next = { dayKey: dayKeyOf(dl), closesAt: dl };
    } else {
      next = nextPlayDay(match, dayKey);
    }
  }
  const tomorrow = next
    ? {
        label: `NEXT BATTLE DAY: ${weekdayOf(next.dayKey)}`,
        sub: `logs open now · day closes ${fmtTimeLocal(next.closesAt)} your time`,
        ...next,
      }
    : { label: "BATTLE COMPLETE", sub: "target hit — see the final result", dayKey: null };

  return {
    dayKey,
    headline,
    youWon,
    winner,
    youRow,
    yourRank,
    youLine,
    ledLine,
    nemesis,
    standings,
    moments,
    tomorrow,
    entriesCount: recorded?.entriesCount ?? entries.length,
    potDeltaCents: recorded?.potDeltaCents ?? 0,
    potTotalCents: recorded?.potTotalCents ?? 0,
    recorded: !!recorded,
  };
}

function ordinal(n) { return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`; }

/* ── logRepsAt — the timestamped log seam ────────────────────────────────
   state.logToMatch stamps Date.now(); for back-fill / offline sync / the
   e2e time machine we need explicit `at`. Mirrors its engine path exactly
   (comeback etc). NOTE: if an logRepsAt entry CLOSES the match, the season
   + pot recording inside state.logToMatch is skipped — closing entries
   should go through the normal UI path. */
export function logRepsAt(matchId, { exerciseId, reps, playerId, verified = false }, at = now()) {
  const pre = S.load();
  const match = pre.matches.find((m) => m.config.id === matchId);
  if (!match) throw new Error("match not found");
  const pid = playerId ?? pre.player?.id;
  const entry = E.applyComeback(match, { playerId: pid, exerciseId, reps, at, verified });
  const res = E.logReps(match, entry);
  S.mutate((s) => {
    const i = s.matches.findIndex((m) => m.config.id === matchId);
    if (i >= 0) s.matches[i] = res.state;
  });
  return { closed: res.closedMatch, comeback: !!entry.comeback, match: res.state };
}

/* ── the app ticker — countdowns, chrome, and the nightly close ───────── */

let _timer = null;

/** Drive every [data-dz-countdown] from the real deadline, live-switch its
 *  DZ level class, and update the danger-zone chrome (banner copy, log-now
 *  pulse, DZ3 screen wash) inside the nearest [data-dz-root]. */
export function tickCountdowns() {
  document.querySelectorAll("[data-dz-countdown]").forEach((el) => {
    const m = S.matchById(el.dataset.match);
    if (!m || m.status !== "live") return;
    const rem = deadlineFor(m) - now();
    const t = el.querySelector(".fg-count__time");
    if (t) t.textContent = fmtClock(rem);
    const lvl = dangerLevel(m);
    el.classList.remove("fg-count--dz1", "fg-count--dz2", "fg-count--dz3");
    if (lvl) el.classList.add(`fg-count--dz${lvl}`);
    const root = el.closest("[data-dz-root]");
    if (root) applyDzChrome(root, m, lvl);
  });
}

/** Banner copy/visibility, pulsing LOG NOW affordance, DZ3 wash + hero.
 *  Layout never changes between levels (§7 row 16/23) — only colour, copy
 *  and the timer-only heartbeat move. */
export function applyDzChrome(root, match, level) {
  const rem = deadlineFor(match) - now();
  const banner = root.querySelector("[data-dz-banner]");
  if (banner) {
    banner.classList.remove("fg-dz--l1", "fg-dz--l2", "fg-dz--l3");
    if (level) {
      banner.classList.add(`fg-dz--l${level}`);
      banner.style.display = "";
      const lbl = banner.querySelector(".fg-dz__label");
      if (lbl) lbl.textContent = dzCopy(level, rem);
    } else {
      banner.style.display = "none";
    }
  }
  const pulse = root.querySelector("[data-dz-log]");
  if (pulse) pulse.style.display = level ? "" : "none";
  const hero = root.querySelector(".fx-hero");
  if (hero) hero.classList.toggle("fx-hero--dz3", level === 3);
  const app = document.getElementById("app");
  if (app) app.classList.toggle("fx-app--dz", level === 3);
}

/** One ticker for the whole app: every second, tick countdowns and close
 *  any due play days (once — settleDay is idempotent). onDayClosed fires
 *  per recorded result. Tick errors are swallowed — the loop must survive. */
export function startAppTicker({ onDayClosed = null, onTick = null, intervalMs = 1000 } = {}) {
  stopAppTicker();
  const beat = () => {
    try { tickCountdowns(); if (onTick) onTick(); } catch {}
    try {
      const st = S.load();
      for (const m of st.matches) {
        if (m.status !== "live") continue;
        for (const key of dueDays(m, now())) {
          const pot = st.pots?.[m.config.id] ?? null;
          const r = settleDay(m.config.id, key, { pot, youId: st.player?.id });
          if (r && onDayClosed) { try { onDayClosed(r, m); } catch {} }
        }
      }
    } catch {}
  };
  _timer = setInterval(beat, intervalMs);
  return stopAppTicker;
}
export function stopAppTicker() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
