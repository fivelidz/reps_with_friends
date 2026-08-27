// Season — 4-week series: ladder (points/played/wins/MVP), current week,
// streak badges, streak forgiveness ($2 to pot), champion belt when ended.
import type { MatchState } from "../engine.ts";
import {
  FORGIVE_CENTS,
  seasonLadder,
  todayKey,
  type LadderRow,
  type SeasonState,
} from "../engine-extras.ts";
import {
  endSeasonAction,
  forgiveStreakAction,
  getState,
  startNextSeasonAction,
  startSeasonAction,
} from "../state.ts";
import { avatar, el, icon, money, toast, topbar } from "../ui.ts";

const DAY = 86400000;

// ── streak math (app-level: engine seasons stay pure data) ───────────────────

function dayKeyAt(ms: number): string {
  return todayKey(new Date(ms));
}

/** Scheduled play-days (YYYY-MM-DD) from season start to today. */
function scheduledDays(season: SeasonState, matches: MatchState[]): string[] {
  const playDays = new Set<number>();
  for (const m of matches) for (const d of m.config.playDays) playDays.add(d);
  if (playDays.size === 0) return [];
  const out: string[] = [];
  const start = new Date(season.config.startedAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= today.getTime(); t += DAY) {
    if (playDays.has(new Date(t).getDay())) out.push(dayKeyAt(t));
  }
  return out;
}

/** Days (YYYY-MM-DD) on which a player logged ≥1 rep, across all matches. */
function playedDays(playerId: string, matches: MatchState[]): Set<string> {
  const set = new Set<string>();
  for (const m of matches)
    for (const e of m.entries)
      if (e.playerId === playerId) set.add(dayKeyAt(e.at));
  return set;
}

function streakInfo(
  playerId: string,
  season: SeasonState,
  matches: MatchState[]
): { streak: number; atRisk: boolean } {
  const scheduled = scheduledDays(season, matches);
  const played = playedDays(playerId, matches);
  const forgiven = new Set(
    season.forgiven.filter((f) => f.playerId === playerId).map((f) => f.day)
  );
  const today = todayKey();
  let streak = 0;
  for (let i = scheduled.length - 1; i >= 0; i--) {
    const day = scheduled[i];
    if (played.has(day) || forgiven.has(day)) {
      streak++;
      continue;
    }
    if (day === today) continue; // today is still open — doesn't break (yet)
    break;
  }
  const atRisk =
    scheduled[scheduled.length - 1] === today &&
    !played.has(today) &&
    !forgiven.has(today) &&
    streak >= 1;
  return { streak, atRisk };
}

// ── screen ───────────────────────────────────────────────────────────────────

export function renderSeason(root: HTMLElement): () => void {
  const st = getState();
  if (!st.me) {
    location.hash = "#/";
    return () => {};
  }

  // ── no season yet → pitch + create ────────────────────────────────────────
  if (!st.season) {
    const nameInput = el("input", {
      class: "input",
      type: "text",
      maxlength: "24",
      placeholder: "Season name (e.g. Winter Smash)",
    });
    root.append(
      el(
        "section",
        { class: "screen" },
        topbar("Season"),
        el(
          "div",
          { class: "rwf-card card-pad stack season-pitch" },
          el("div", { class: "belt-emoji", text: "🏆" }),
          el("div", { class: "h-display season-title", text: "Run a 4-week season" }),
          el("p", { class: "muted", text: "Every match scores season points — 3 for the win, 1 for showing up, 1 for MVP. Most points after 4 weeks takes the belt and directs the streak pot to charity." }),
          el("div", { class: "ptsrow" },
            el("span", { class: "rwf-tag", text: "WIN +3" }),
            el("span", { class: "rwf-tag", text: "PLAYED +1" }),
            el("span", { class: "rwf-tag", text: "MVP +1" })
          ),
          nameInput,
          el("button", {
            class: "rwf-btn rwf-btn--primary btn-block btn-lg",
            html: icon("trophy", 18) + "<span>START SEASON</span>",
            onClick: () => {
              startSeasonAction((nameInput as HTMLInputElement).value);
              toast("Season live — next 4 weeks count 🏆", "ok");
            },
          })
        ),
        pastChampions()
      )
    );
    return () => {};
  }

  // ── active / ended season ─────────────────────────────────────────────────
  const season = st.season;
  const matches = st.matches;
  const ladder = seasonLadder(season);
  const nameOf = (pid: string): string => {
    for (const m of matches) {
      const p = m.players.find((x) => x.id === pid);
      if (p) return p.name;
    }
    return "—";
  };
  const tierOf = (pid: string): string => {
    for (const m of matches) {
      const p = m.players.find((x) => x.id === pid);
      if (p) return p.tier;
    }
    return "casual";
  };

  const weekMs = season.config.weeks * 7 * DAY;
  const elapsed = Date.now() - season.config.startedAt;
  const week = Math.min(season.config.weeks, Math.floor(elapsed / (7 * DAY)) + 1);
  const timeUp = elapsed >= weekMs;
  const ended = !!season.endedAt || timeUp;
  const championId = season.championId ?? (!ended ? undefined : ladder[0]?.playerId);

  // header card: name, week, progress
  const weekPct = Math.min(100, Math.round((elapsed / weekMs) * 100));
  const header = el(
    "div",
    { class: "rwf-card card-pad stack-sm season-head" },
    el(
      "div",
      { class: "crewcard-row" },
      el("div", {},
        el("div", { class: "seclabel", text: ended ? "Season complete" : "Season live" }),
        el("div", { class: "h-display season-title", text: season.config.name })
      ),
      el("span", { class: `pill ${ended ? "pill--done" : "pill--live"}`, html: ended ? "ENDED" : `<i class="pulse"></i>WEEK ${week}/${season.config.weeks}` })
    ),
    el("div", { class: "bar" }, el("i", { style: `width:${weekPct}%` })),
    el(
      "div",
      { class: "season-meta muted small" },
      el("span", { text: `${season.matches.length} match${season.matches.length === 1 ? "" : "es"} scored` }),
      el("span", { class: "amber", text: `Streak pot ${money(season.potCents)} → charity` })
    )
  );

  // champion belt (ended seasons) — gold→lime gradient border moment
  const belt = ended
    ? el(
        "div",
        { class: "rwf-card card-pad beltcard" },
        el("div", { class: "belt-emoji", text: "🏆" }),
        el("div", { class: "seclabel seclabel--lime", text: "Season champion" }),
        el("div", { class: "h-display beltname", text: championId ? nameOf(championId) : "No matches played" }),
        championId
          ? el("div", { class: "beltstats muted small", text: `${ladder[0]?.points ?? 0} pts · ${ladder[0]?.wins ?? 0} wins · ${ladder[0]?.mvps ?? 0} MVPs` })
          : null,
        el("div", { class: "potdone", html: icon("check", 16) }, el("span", { text: `Belt + ${money(season.potCents)} streak pot directed to charity` })),
        el("button", {
          class: "rwf-btn rwf-btn--primary btn-block",
          text: "START NEXT SEASON",
          onClick: () => {
            startNextSeasonAction("");
            toast("New season live — week 1 of 4 🏆", "ok");
          },
        })
      )
    : null;

  // ladder table — position number + points emphasis
  const ladderRows: HTMLElement[] = ladder.map((row: LadderRow, i) => {
    const p = st.me!;
    const isMe = row.playerId === p.id;
    const { streak } = streakInfo(row.playerId, season, matches);
    return el(
      "div",
      { class: `ladderrow ${i === 0 ? "lead" : ""}` },
      el("span", { class: `ladderrank ${i === 0 ? "ladderrank--1" : ""}`, text: String(i + 1) }),
      avatar(nameOf(row.playerId), tierOf(row.playerId)),
      el(
        "div",
        { class: "ladderrow-id" },
        el("span", { class: "ladderrow-name" }, nameOf(row.playerId), isMe ? el("span", { class: "tier tier--mult", text: "YOU" }) : null),
        el(
          "span",
          { class: "ladderrow-sub" },
          streak >= 2 ? el("span", { class: "streakbadge", text: `🔥 ×${streak}` }) : null,
          row.mvps > 0 ? el("span", { class: "mvpbadge", text: `🏅 ${row.mvps} MVP` }) : null
        )
      ),
      el(
        "div",
        { class: "ladderrow-nums" },
        el("b", { text: String(row.points) }),
        el("span", { text: `${row.played}P · ${row.wins}W · ${row.mvps}M` })
      )
    );
  });

  const ladderCard = el(
    "div",
    { class: "rwf-card card-pad stack-sm" },
    el("div", { class: "seclabel", text: "Ladder — season points" }),
    ladderRows.length
      ? el("div", { class: "ladderlist" }, ...ladderRows)
      : el(
          "div",
          { class: "emptystate" },
          // doc 13 §2.12 empty-state pattern: icon + headline + sentence + pill.
          el("div", { class: "emptystate-ico", text: "🏆" }),
          el("div", { class: "h-display", text: "Ladder's wide open" }),
          el("p", { class: "muted small", text: "Finish a match while the season is live and the points start flowing." }),
          el("button", {
            class: "rwf-btn btn-sm",
            text: "START A MATCH",
            onClick: () => {
              location.hash = "#/new";
            },
          })
        )
  );

  // my streak / forgiveness
  const mine = streakInfo(st.me.id, season, matches);
  const forgivenToday = season.forgiven.some(
    (f) => f.playerId === st.me!.id && f.day === todayKey()
  );
  const streakCard = !ended
    ? el(
        "div",
        { class: `rwf-card card-pad stack-sm streakcard ${mine.atRisk ? "atrisk" : ""}` },
        el("div", { class: "seclabel", text: "Your streak" }),
        el(
          "div",
          { class: "streakline" },
          el("span", { class: "h-display", text: mine.streak > 0 ? `🔥 ${mine.streak}-day` : "No streak yet" }),
          el("span", { class: "muted small", text: mine.streak > 0 ? "consecutive play-days" : "log reps on a play-day to start one" })
        ),
        mine.atRisk && !forgivenToday
          ? el(
              "div",
              { class: "stack-sm" },
              el("p", { class: "hint", text: "Today is a play-day and you haven't logged — your streak breaks at midnight." }),
              el("button", {
                class: "rwf-btn btn-block forgivebtn",
                html: icon("heart", 16) + `<span>FORGIVE STREAK — ${money(FORGIVE_CENTS)} TO POT</span>`,
                onClick: () => {
                  forgiveStreakAction();
                  toast("Streak forgiven — $2 to the charity pot 🙏", "ok");
                },
              })
            )
          : forgivenToday
            ? el("div", { class: "potdone", html: icon("check", 16) }, el("span", { text: "Streak forgiven today — $2 added to the pot" }))
            : null
      )
    : null;

  // end-season (armed confirm, like profile reset)
  const endBtn = !ended
    ? el("button", {
        class: "rwf-btn btn-sm btn--danger",
        text: "END SEASON NOW",
        onClick: () => {
          const b = endBtn as HTMLButtonElement;
          if (b.dataset.armed === "1") {
            endSeasonAction();
            toast("Season ended — champion crowned 🏆", "ok");
            return;
          }
          b.dataset.armed = "1";
          b.textContent = "TAP AGAIN TO CONFIRM";
          setTimeout(() => {
            b.dataset.armed = "";
            b.textContent = "END SEASON NOW";
          }, 2500);
        },
      })
    : null;

  root.append(
    el(
      "section",
      { class: "screen" },
      topbar("Season"),
      header,
      belt,
      ladderCard,
      streakCard,
      endBtn ? el("div", { class: "resetrow" }, endBtn) : null,
      ended ? null : el("p", { class: "hint", text: "Matches that complete while a season is live score points. Miss a play-day? Forgive the streak for $2 — guilt becomes charity." })
    )
  );
  return () => {};
}

function pastChampions(): HTMLElement | null {
  const hist = getState().seasonHistory ?? [];
  if (hist.length === 0) return null;
  const lines = hist.map((s) => {
    const top = seasonLadder(s)[0];
    const name = top
      ? (getState().matches.find((m) => m.players.some((p) => p.id === top.playerId))?.players.find((p) => p.id === top.playerId)?.name ?? "—")
      : "—";
    return `${s.config.name}: ${name} (${top?.points ?? 0} pts)`;
  });
  return el(
    "div",
    { class: "rwf-card card-pad stack-sm" },
    el("div", { class: "seclabel", text: "Past champions" }),
    ...lines.map((l) => el("div", { class: "potline" }, el("span", { text: l })))
  );
}
