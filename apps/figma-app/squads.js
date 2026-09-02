/* ═══════════════════════════════════════════════════════════════════════
   RWF SQUADS — multi-squad dashboard (sqd-001/sqd-002) + the squad state
   layer. A SQUAD is its own battle: same reps count in every squad you're
   in (that's the founder's whole point — one effort, many leaderboards).

   State (lives in rwf.figma.v1 alongside matches, added by this module):
     s.squads = {
       list:   [ { id, code, name, matchId, createdAt } ],   // 1 squad = 1 battle
       wagers: [ { id, squadId, description, points, proposedBy,
                   agreements: {playerId:true}, status:
                   "proposed" | "active" | "settled", createdAt,
                   settledAt?, paidBy?, paidTo? } ],
       points: { playerId: balance },                          // house points
     }

   FAIRNESS NOTE (cross-squad logging): the quick-log sheet lets you tick
   "also log to…" squads — the SAME reps are credited in every selected
   battle. That is deliberate ("same reps count across multiple squads").
   When a server lands, one effort event fans out to N battle ledgers
   server-side and the client stops double-writing (dedupe there, not here).

   WAGERS: propose (description + house points) → every squad member agrees
   → ACTIVE → points escrow-on-close: when the squad battle completes, the
   LAST place pays the wager to the WINNER (settled idempotently, lazily,
   on dashboard render — no engine/ticker coupling). House points only,
   never cash.
   ═══════════════════════════════════════════════════════════════════════ */

import * as S from "./state.js";
import * as E from "./engine.js";
import * as D from "./daily.js";

/* ── transient UI state (not persisted) ───────────────────────────────── */
let tabSel = null; // selected squad tab on sqd-001
const wagerDraft = { description: "", points: 50 };
const createDraft = { name: "The Lunch Crew", mates: ["sam", "alex"], target: "solid" };

const rerender = () => { try { dispatchEvent(new Event("hashchange")); } catch {} };

/* ── tiny local helpers (chrome replicated so app.js stays untouched) ── */
const P = (d, extra = "") => `<path d="${d}" ${extra}/>`;
const ICONS = {
  trophy: P("M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 15v2c0 .6-.5 1-1 1.2-1.2.6-2 2-2 3.8M14 15v2c0 .6.5 1 1 1.2 1.2.6 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2Z"),
  bolt: P("M13 2 3 14h7l-1 8 10-12h-7l1-8Z"),
  flame: P("M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z"),
  crown: P("M3 18h18M3 18 2 7l5 4 5-7 5 7 5-4-1 11"),
  check: P("M4 12l5 5L20 7"),
  chevron: P("M9 6l6 6-6 6"),
  clock: P("M12 6v6l4 2", 'fill="none"') + `<circle cx="12" cy="12" r="9" fill="none"/>`,
  bell: P("M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0"),
  plus: P("M12 5v14M5 12h14"),
};
const ic = (name, cls = "fg-icon") => `<span class="${cls}" data-icon="${name}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg></span>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ordinal = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
const initials = (name) => String(name || "You").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/* status bar / top bar / bottom nav — exact replicas of app.js chrome so
   the squad screens feel native; all behaviour is global-delegation driven */
function statusBar() {
  return `
  <div class="fx-status">
    <span>9:41</span>
    <span class="fx-status__tools">
      <button class="fx-tool" data-go="" title="All screens">${ic("trophy")}INDEX</button>
      <button class="fx-tool" id="sfxToggle" data-sfx-paint="1" title="Sound effects">SFX</button>
      <button class="fx-tool" id="themeToggle" title="Cycle theme (beta) — 5 directions">LIME</button>
    </span>
  </div>`;
}
function topBar({ title = "" } = {}) {
  return `
  <div class="fx-topbar">
    <div class="fx-topbar__left"><button class="fx-topbar__back" data-back="1" aria-label="Back">${ic("chevron")}</button><span class="fx-topbar__title">${title}</span></div>
    <div class="fx-topbar__right">
      <button class="fx-topbar__bell" data-go="home-007" aria-label="Notifications">${ic("bell")}</button>
      <span class="fg-avatar fg-avatar--sm" style="width:32px;height:32px;font-size:9px">BT</span>
    </div>
  </div>`;
}
function nav(active = "") {
  const tab = (id, icon, label) => `
    <button class="fx-nav__tab" data-go="${id}" ${active === id ? 'aria-current="page"' : ""}>${ic(icon)}<span>${label}</span></button>`;
  return `
  <div class="fx-nav">
    ${tab("battle-001", "trophy", "Battle")}
    ${tab("battle-006", "feed", "Feed")}
    <button class="fx-nav__log" id="logBtn" aria-label="Log reps">${ic("plus")}</button>
    ${tab("pwr-001", "bolt", "Power-Ups")}
    ${tab("profile-001", "user", "Profile")}
  </div>`;
}

/** Home segmented tabs — BATTLES | SQUADS (the SQUADS tab beside BATTLES). */
export function homeTabs(active = "battles", battlesGo = "home-002") {
  const item = (id, label, goId) =>
    `<button class="fx-seg__item ${active === id ? "fx-seg__item--on" : ""}" data-go="${goId}">${label}</button>`;
  return `<div class="fx-seg fx-seg--32 fx-sqd-hometabs">${item("battles", "BATTLES", battlesGo)}${item("squads", "SQUADS", "sqd-001")}</div>`;
}

/* ════════════════════════ STATE LAYER ═════════════════════════════════ */

export const START_POINTS = 200;

function ensureLayer(s) {
  if (!s.squads || typeof s.squads !== "object") s.squads = { list: [], wagers: [], points: {} };
  if (!Array.isArray(s.squads.list)) s.squads.list = [];
  if (!Array.isArray(s.squads.wagers)) s.squads.wagers = [];
  if (!s.squads.points || typeof s.squads.points !== "object") s.squads.points = {};
  return s.squads;
}
const layerOf = (st = S.load()) => ensureLayer(st) && st.squads;

export const squadsOf = (st = S.load()) => [...layerOf(st).list];
export const squadById = (id, st = S.load()) => layerOf(st).list.find((x) => x.id === id) ?? null;
export const wagersOf = (squadId, st = S.load()) => layerOf(st).wagers.filter((w) => w.squadId === squadId);
export const pointsOf = (playerId, st = S.load()) => layerOf(st).points[playerId] ?? 0;

export function squadMatch(squad, st = S.load()) {
  if (!squad) return null;
  return st.matches.find((m) => m.config.id === squad.matchId) ?? null;
}
export function squadMembers(squad, st = S.load()) {
  return squadMatch(squad, st)?.players ?? [];
}
/** Squads the player is actually IN (a member of the squad's battle). */
export function mySquads(st = S.load()) {
  const me = st.player?.id;
  if (!me) return [];
  return layerOf(st).list.filter((sq) => squadMembers(sq, st).some((p) => p.id === me));
}

function squadCode(st) {
  const n = layerOf(st).list.length + 1;
  return `SQD-${String((n * 13 + 7) % 46656).padStart(4, "0").slice(0, 4)}${"K7M2X"[(n - 1) % 5]}`;
}

/** Create a squad = create + start its own battle, seed power-ups, grant
 *  starting house points to every member. Returns the squad. */
export function createSquad({ name, mateIds = [], target = "solid" } = {}) {
  const st = S.load();
  if (!st.player) throw new Error("no player — onboard first");
  const t = S.TARGETS.find((x) => x.id === target) ?? S.TARGETS[1];
  const packIds = S.PACKS.bodyweight;
  const players = [st.player, ...S.MATES.filter((m) => mateIds.includes(m.id))];
  let match = E.createMatch(
    {
      id: `m${Date.now()}`,
      name: String(name || "The Squad").slice(0, 40),
      exercises: S.EXERCISES.filter((e) => packIds.includes(e.id)),
      targetReps: t.reps,
      playDays: [1, 3, 5],
      deadlineAt: S.playDayEndMs(),
    },
    players
  );
  match = E.startMatch(match);
  match = S.seedPowerUps(match);
  const squad = {
    id: `sq${Date.now()}`,
    code: squadCode(st),
    name: String(name || "The Squad").slice(0, 40),
    matchId: match.config.id,
    createdAt: Date.now(),
  };
  S.mutate((s) => {
    const L = ensureLayer(s);
    s.matches.push(match);
    L.list.push(squad);
    for (const p of match.players) if (L.points[p.id] == null) L.points[p.id] = START_POINTS;
  });
  return squad;
}

/** Cross-squad credit: the SAME reps into every selected squad's battle.
 *  (Fairness: intentional double-credit client-side; server dedupes later.) */
export function logToSquads({ exerciseId, reps, squadIds = [], playerId } = {}) {
  const out = { logged: [], skipped: [] };
  for (const sid of squadIds) {
    const squad = squadById(sid);
    if (!squad) continue;
    try {
      const r = S.logToMatch(squad.matchId, { exerciseId, reps, playerId });
      out.logged.push({ squad, closed: !!r.closed });
    } catch { out.skipped.push(squad); }
  }
  return out;
}

/** Your standing, three ways (raw reps — the founder's framing):
 *  from the top / above second / above last. null = you ARE the reference. */
export function threeWays(match, myId) {
  const rows = E.standings(match);
  const byRaw = [...rows].sort((a, b) => b.rawReps - a.rawReps);
  const top = byRaw[0] ?? null;
  const second = byRaw[1] ?? top;
  const last = byRaw[byRaw.length - 1] ?? top;
  const mine = rows.find((r) => r.player.id === myId) ?? rows[0] ?? null;
  if (!mine || !top) return null;
  return {
    rows, top, second, last, mine,
    fromTop: Math.max(0, top.rawReps - mine.rawReps),
    aboveSecond: second.player.id === mine.player.id ? null : mine.rawReps - second.rawReps,
    aboveLast: last.player.id === mine.player.id ? null : mine.rawReps - last.rawReps,
    isTop: top.player.id === mine.player.id,
    /* last = at the bottom AND strictly behind the top (kills the 0-0 tie) */
    isLast: byRaw.length > 1 && last.player.id === mine.player.id && mine.rawReps < top.rawReps,
    comebackArmed: E.comebackEligible(match, mine.player.id),
  };
}

/* ── wagers ───────────────────────────────────────────────────────────── */

export function proposeWager(squadId, { description, points, by } = {}) {
  const st = S.load();
  const squad = squadById(squadId, st);
  if (!squad) throw new Error("squad not found");
  const members = squadMembers(squad, st);
  if (!members.some((p) => p.id === by)) throw new Error("proposer not in squad");
  const pts = Math.round(Number(points));
  if (!Number.isFinite(pts) || pts < 1 || pts > 500) throw new Error("wager must be 1–500 points");
  const desc = String(description ?? "").trim().slice(0, 80);
  if (!desc) throw new Error("wager needs a description");
  const wager = {
    id: `w${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
    squadId, description: desc, points: pts, proposedBy: by,
    agreements: { [by]: true },
    status: "proposed", createdAt: Date.now(),
  };
  S.mutate((s) => { ensureLayer(s).wagers.push(wager); });
  return wager;
}

/** Record one member's agreement; flips to ACTIVE when ALL members agree.
 *  Returns { wager, activated }. */
export function agreeWager(squadId, wagerId, playerId) {
  const res = { wager: null, activated: false };
  S.mutate((s) => {
    const L = ensureLayer(s);
    const w = L.wagers.find((x) => x.id === wagerId && x.squadId === squadId);
    if (!w || w.status !== "proposed") return;
    const squad = L.list.find((x) => x.id === squadId);
    const members = squadMatch(squad, s)?.players ?? [];
    if (!members.some((p) => p.id === playerId)) return;
    w.agreements[playerId] = true;
    if (members.every((p) => w.agreements[p.id])) {
      w.status = "active";
      w.activatedAt = Date.now();
      res.activated = true;
    }
    res.wager = w;
  });
  return res;
}

/** Bot sim (same philosophy as simMates): the mates say yes. */
export function nudgeMates(squadId, wagerId) {
  const st = S.load();
  const squad = squadById(squadId, st);
  if (!squad) return null;
  const me = st.player?.id;
  let out = null;
  for (const p of squadMembers(squad, st)) {
    if (p.id === me) continue;
    out = agreeWager(squadId, wagerId, p.id);
  }
  return out;
}

/** Escrow-on-close: when the squad battle is complete, every ACTIVE wager
 *  settles — last place pays the winner. Lazy + idempotent (called from
 *  the dashboard render, safe to call repeatedly). Returns settled wagers. */
export function settleSquadIfDue(squadId, st = S.load()) {
  const squad = squadById(squadId, st);
  if (!squad) return [];
  const match = squadMatch(squad, st);
  if (!match || match.status !== "complete") return [];
  if (!layerOf(st).wagers.some((w) => w.squadId === squadId && w.status === "active")) return [];
  const rows = E.finalStandings(match);
  const winner = rows[0], loser = rows[rows.length - 1];
  const settled = [];
  S.mutate((s) => {
    const L = ensureLayer(s);
    for (const w of L.wagers) {
      if (w.squadId !== squadId || w.status !== "active") continue;
      L.points[loser.player.id] = (L.points[loser.player.id] ?? 0) - w.points;
      L.points[winner.player.id] = (L.points[winner.player.id] ?? 0) + w.points;
      w.status = "settled";
      w.settledAt = Date.now();
      w.paidBy = loser.player.id;
      w.paidTo = winner.player.id;
      settled.push(w);
    }
  });
  return settled;
}

/* ════════════════════════ SCREENS ═════════════════════════════════════ */

const countChip = (match) => {
  if (match.status === "complete") return `<span class="fg-count fg-count--closed">${ic("clock")}<span class="fg-count__wrap"><span class="fg-count__time">CLOSED</span></span></span>`;
  const clock = D.deadlineClock(match, D.now());
  return `
  <span class="fg-count ${clock.level ? `fg-count--dz${clock.level}` : ""}" data-countdown="${clock.time}" data-dz-countdown data-match="${match.config.id}">
    ${ic("clock")}<span class="fg-count__wrap"><span class="fg-count__time">${clock.time}</span><span class="fg-count__sub">${clock.sub}</span></span>
  </span>`;
};

function standCard(label, value, { ahead = true, you = false, sub = "" } = {}) {
  const cls = value === null ? "" : ahead ? "fx-stand__v--up" : "fx-stand__v--down";
  const v = value === null ? "—" : `${value}`;
  return `
  <div class="fx-stand">
    <span class="fx-stand__label">${label}</span>
    <span class="fx-stand__v ${cls}">${v}</span>
    <span class="fx-stand__s">${you ? "that's you" : sub}</span>
  </div>`;
}

function lastPlaceNote(tw, activePts, activeCount) {
  if (!tw.isLast) return "";
  const gap = tw.fromTop;
  const stakes = activeCount > 0
    ? `${activePts} pt${activePts === 1 ? "" : "s"} ride on last place — settle it before the close, not after.`
    : "Nothing's riding on this one — pride only.";
  return `
  <div class="fx-lastnote">
    <span class="fx-lastnote__ic">${ic("flame")}</span>
    <div>
      <div class="fx-lastnote__t">${gap} REP${gap === 1 ? "" : "S"} OFF THE PACE${tw.comebackArmed ? " — COMEBACK ARMED" : ""}</div>
      <div class="fx-lastnote__s">${tw.comebackArmed
        ? "The engine's already carrying you: your next log counts ×1.2. One good set starts the climb."
        : "Fall 30% behind and the comeback ×1.2 arms itself — the engine wants a chase, not a procession."}</div>
      <div class="fx-lastnote__w">${stakes}</div>
      <div class="fx-lastnote__s fx-lastnote__s--dim">No shame in last — every champ has a Tuesday.</div>
    </div>
  </div>`;
}

function squadRow(r, i, myId) {
  const you = r.player.id === myId;
  const pct = Math.min(100, Math.round(r.progressPct));
  return `
  <div class="fx-sqdrow ${you ? "fx-sqdrow--you" : ""} ${i === 0 ? "fx-sqdrow--lead" : ""}">
    <span class="fx-sqdrow__pos">${i === 0 ? ic("crown") : ordinal(i + 1)}</span>
    <span class="fg-avatar" style="width:40px;height:40px;font-size:12px">${initials(r.player.name)}</span>
    <div class="fx-sqdrow__info">
      <span class="fx-sqdrow__name">${esc(r.player.name)}${you ? ' <b class="fx-sqdrow__you">(you)</b>' : ""}</span>
      <span class="fx-sqdrow__bar"><i style="width:${pct}%"></i></span>
    </div>
    <div class="fx-sqdrow__score">
      <b>${r.rawReps}</b><span>reps</span>
      <em>${Math.round(r.adjustedScore)} RUF</em>
    </div>
  </div>`;
}

function wagerRow(w, squad, st, myId) {
  const members = squadMembers(squad, st);
  const nameOf = (pid) => members.find((p) => p.id === pid)?.name ?? pid;
  const flags = members.map((p) => {
    const on = !!w.agreements[p.id];
    return `<span class="fx-wflag ${on ? "fx-wflag--on" : ""}" title="${esc(p.name)} ${on ? "agreed" : "pending"}">${initials(p.name)}${on ? ic("check") : ""}</span>`;
  }).join("");
  const agreed = members.filter((p) => w.agreements[p.id]).length;
  let status = "";
  let action = "";
  if (w.status === "proposed") {
    status = `<span class="fx-wchip fx-wchip--proposed">WAITING ${agreed}/${members.length}</span>`;
    if (myId && !w.agreements[myId]) action = `<button class="fx-btn fx-btn--sm fx-btn--purple" data-wager-agree="${w.id}" data-squad="${squad.id}">AGREE</button>`;
    if (w.proposedBy === myId || members.length > 1) action += ` <button class="fx-btn fx-btn--sm fx-btn--ghost" data-wager-nudge="${w.id}" data-squad="${squad.id}">NUDGE MATES</button>`;
  } else if (w.status === "active") {
    status = `<span class="fx-wchip fx-wchip--active">${ic("bolt")}ACTIVE</span>`;
    action = `<span class="fx-wsub">settles at battle close — last place pays ${w.points} pts</span>`;
  } else {
    status = `<span class="fx-wchip fx-wchip--settled">${ic("check")}SETTLED</span>`;
    action = `<span class="fx-wsub">${esc(nameOf(w.paidBy))} paid ${esc(nameOf(w.paidTo))} ${w.points} pts</span>`;
  }
  return `
  <div class="fx-wager">
    <div class="fx-wager__main">
      <div class="fx-wager__desc">${esc(w.description)}</div>
      <div class="fx-wager__meta">${status}<span class="fx-wpts">${w.points} PTS</span></div>
      <div class="fx-wflags">${flags}</div>
      <div class="fx-wager__act">${action}</div>
    </div>
  </div>`;
}

export const SQUAD_SCREENS = [
  {
    id: "sqd-001", figma: "RWF-SQD-001", name: "Squads dashboard (tabs)", group: "Squads", next: "sqd-002",
    render: () => {
      /* lazy settlement first (idempotent) so the render shows the truth */
      for (const sq of squadsOf()) settleSquadIfDue(sq.id);
      const st = S.load();
      const me = st.player;
      const list = squadsOf(st);
      const empty = `
      ${statusBar()}
      ${topBar({ title: "Squads" })}
      <div class="fx-content">
        ${homeTabs("squads")}
        <div class="fx-gap16"></div>
        <h1 class="fx-h1 fx-h1--26">SQUADS</h1>
        <p class="fx-sub fx-sub--14">Same reps, multiple crews. Each squad is its own battle with its own leaderboard — one effort counts in all of them.</p>
        <div class="fx-sqdempty">
          <span class="fx-sqdempty__ic">${ic("trophy")}</span>
          <h3 class="fx-sqdempty__t">No squads yet</h3>
          <p class="fx-sqdempty__s">Spin one up: name it, pick the mates, pick the target. You can be in as many as you like.</p>
          <button class="fg-state__cta" data-go="sqd-002">CREATE A SQUAD</button>
        </div>
      </div>
      ${nav("battle-001")}`;
      if (!me || list.length === 0) return empty;
      const squad = list.find((x) => x.id === tabSel) ?? list[0];
      tabSel = squad.id;
      const match = squadMatch(squad, st);
      if (!match) return empty;
      const myId = me.id;
      const tw = threeWays(match, myId) ?? null;
      const wagers = wagersOf(squad.id, st);
      const active = wagers.filter((w) => w.status === "active");
      const activePts = active.reduce((s, w) => s + w.points, 0);
      const streak = st.season?.streaks?.[myId]?.length ?? 0;
      const status = match.status === "live" ? "LIVE" : match.status === "open" ? "RECRUITING" : "COMPLETE";
      const board = tw ? tw.rows.map((r, i) => squadRow(r, i, myId)).join("") : "";
      const stands = tw ? `
        <div class="fx-stands">
          ${standCard("FROM TOP", tw.isTop ? 0 : tw.fromTop, { ahead: tw.isTop, sub: tw.isTop ? "you lead" : `behind ${tw.top.player.name}` })}
          ${standCard("ABOVE 2ND", tw.aboveSecond, { ahead: (tw.aboveSecond ?? 0) >= 0, you: tw.aboveSecond === null, sub: tw.aboveSecond === null ? "" : `vs ${tw.second.player.name}` })}
          ${standCard("ABOVE LAST", tw.aboveLast, { ahead: (tw.aboveLast ?? 0) >= 0, you: tw.aboveLast === null, sub: tw.aboveLast === null ? "" : `vs ${tw.last.player.name}` })}
        </div>` : "";
      return `
      ${statusBar()}
      ${topBar({ title: "Squads" })}
      <div class="fx-content">
        ${homeTabs("squads")}
        <div class="fx-sqdtabs">
          ${list.map((sq) => `<button class="fx-chip fx-chip--target ${sq.id === squad.id ? "fx-chip--on" : ""}" data-sqd-tab="${sq.id}">${esc(sq.name)}</button>`).join("")}
          <button class="fx-chip fx-chip--target fx-sqdtab--new" data-go="sqd-002" aria-label="New squad">+</button>
        </div>
        <div class="fx-sqdhead">
          <div>
            <span class="fx-sqdhead__name">${esc(squad.name.toUpperCase())}</span>
            <span class="fx-sqdhead__code">${squad.code} · ${match.players.length} players · ${match.config.targetReps} reps</span>
          </div>
          <span class="fg-status ${match.status === "live" ? "" : "fg-status--muted"}">${status}</span>
        </div>
        ${countChip(match)}
        <div class="fx-sqdmeta">
          <span class="fg-badge">${ic("flame")}${streak} DAY STREAK</span>
          <span class="fg-badge">${ic("bolt")}${pointsOf(myId, st)} PTS BALANCE</span>
          ${activePts > 0 ? `<span class="fg-badge fx-escrow">${activePts} PTS IN ESCROW</span>` : ""}
        </div>
        ${lastPlaceNote(tw, activePts, active.length)}
        ${stands}
        <p class="fx-overline">SQUAD LEADERBOARD</p>
        <div class="fx-board">${board}</div>
        <div class="fx-gap8"></div>
        <p class="fx-overline">WAGERS ${wagers.length ? `· ${active.length} ACTIVE` : ""}</p>
        <div class="fx-wagers">
          ${wagers.length ? [...wagers].reverse().map((w) => wagerRow(w, squad, st, myId)).join("") : `<p class="fx-note">No wagers yet. Propose one — everyone agrees, last place pays at the close. House points only.</p>`}
          <div class="fx-wform">
            <input class="fx-input" id="wagerDesc" type="text" maxlength="80" placeholder="Wager — e.g. loser makes smoothies" value="${esc(wagerDraft.description)}" autocomplete="off">
            <div class="fx-wform__row">
              ${[25, 50, 100].map((n) => `<button class="fx-chip fx-chip--target ${wagerDraft.points === n ? "fx-chip--on" : ""}" data-wpts="${n}">${n} pts</button>`).join("")}
              <button class="fx-btn fx-btn--primary fx-btn--sm" id="wagerPropose">PROPOSE</button>
            </div>
            <p class="fx-note">All members agree → ACTIVE → settles when the battle closes (last place pays the winner). House points, never cash.</p>
          </div>
        </div>
        <div class="fx-gap8"></div>
        <p class="fx-note">Fair play: one set of reps counts in every squad you're in — the server dedupes later.</p>
      </div>
      ${nav("battle-001")}`;
    },
    wire: (root) => {
      root.querySelectorAll("[data-sqd-tab]").forEach((btn) =>
        btn.addEventListener("click", () => { tabSel = btn.dataset.sqdTab; rerender(); }));
      const desc = root.querySelector("#wagerDesc");
      if (desc) desc.addEventListener("input", () => { wagerDraft.description = desc.value; });
      root.querySelectorAll("[data-wpts]").forEach((c) =>
        c.addEventListener("click", () => { wagerDraft.points = Number(c.dataset.wpts); rerender(); }));
      root.querySelector("#wagerPropose")?.addEventListener("click", () => {
        const st = S.load();
        const squad = tabSel ? squadById(tabSel, st) : null;
        if (!squad) return;
        try {
          proposeWager(squad.id, { description: wagerDraft.description, points: wagerDraft.points, by: st.player?.id });
          wagerDraft.description = "";
        } catch { /* validation toast-free: the row simply won't appear */ }
        rerender();
      });
      root.querySelectorAll("[data-wager-agree]").forEach((b) =>
        b.addEventListener("click", () => { agreeWager(b.dataset.squad, b.dataset.wagerAgree, S.load().player?.id); rerender(); }));
      root.querySelectorAll("[data-wager-nudge]").forEach((b) =>
        b.addEventListener("click", () => { nudgeMates(b.dataset.squad, b.dataset.wagerNudge); rerender(); }));
    },
  },
  {
    id: "sqd-002", figma: "RWF-SQD-002", name: "Create squad", group: "Squads", next: "sqd-001",
    render: () => {
      const mateChip = (m) =>
        `<button class="fx-chip fx-chip--target ${createDraft.mates.includes(m.id) ? "fx-chip--on" : ""}" data-mate="${m.id}">${m.name}</button>`;
      const targetChip = (t) =>
        `<button class="fx-chip fx-chip--target ${createDraft.target === t.id ? "fx-chip--on" : ""}" data-target="${t.id}">${t.label} · ${t.reps} reps</button>`;
      return `
      ${statusBar()}
      ${topBar({ title: "Create squad" })}
      <div class="fx-content">
        ${homeTabs("squads")}
        <div class="fx-gap16"></div>
        <h1 class="fx-h1 fx-h1--26">CREATE A SQUAD</h1>
        <p class="fx-sub fx-sub--14">A squad is its own battle. You can be in as many squads as you like — your reps count in all of them.</p>
        <div class="fx-field">
          <span class="fx-field__label">Squad name</span>
          <input class="fx-input" id="sqdName" type="text" maxlength="40" value="${esc(createDraft.name)}" autocomplete="off" spellcheck="false">
        </div>
        <p class="fx-overline">MATES IN THIS SQUAD</p>
        <div class="fx-sheet__row">
          ${S.MATES.map(mateChip).join("")}
        </div>
        <p class="fx-overline">TARGET</p>
        <div class="fx-sheet__row">
          ${S.TARGETS.map(targetChip).join("")}
        </div>
        <div class="fx-gap8"></div>
        <button class="fx-btn fx-btn--primary" id="sqdCreate">CREATE SQUAD</button>
        <p class="fx-note">Everyone starts with 200 house points. Wagers inside a squad need every member's yes — they settle at battle close, last place pays.</p>
      </div>
      ${nav("battle-001")}`;
    },
    wire: (root) => {
      const name = root.querySelector("#sqdName");
      if (name) name.addEventListener("input", () => { createDraft.name = name.value; });
      root.querySelectorAll("[data-mate]").forEach((c) =>
        c.addEventListener("click", () => {
          const id = c.dataset.mate;
          createDraft.mates = createDraft.mates.includes(id)
            ? createDraft.mates.filter((x) => x !== id)
            : [...createDraft.mates, id];
          c.classList.toggle("fx-chip--on", createDraft.mates.includes(id));
        }));
      root.querySelectorAll("[data-target]").forEach((c) =>
        c.addEventListener("click", () => {
          createDraft.target = c.dataset.target;
          root.querySelectorAll("[data-target]").forEach((x) =>
            x.classList.toggle("fx-chip--on", x === c));
        }));
      root.querySelector("#sqdCreate")?.addEventListener("click", () => {
        try {
          const squad = createSquad({
            name: (createDraft.name || "").trim() || "The Squad",
            mateIds: createDraft.mates,
            target: createDraft.target,
          });
          tabSel = squad.id;
          location.hash = "#/sqd-001";
        } catch { /* no player yet — onboard first */ rerender(); }
      });
    },
  },
];
