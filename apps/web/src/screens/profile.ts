// Profile — identity, lifetime stats, match history.
import { playerScore, playerRawReps, winner } from "../engine.ts";
import { TIER_INFO } from "../data.ts";
import { getState, resetAll } from "../state.ts";
import { avatar, el, fmtScore, tierBadge } from "../ui.ts";

export function renderProfile(root: HTMLElement): () => void {
  const st = getState();
  const me = st.me;
  if (!me) {
    location.hash = "#/onboard";
    return () => {};
  }
  const info = TIER_INFO[me.tier];

  const mine = st.matches.filter((m) => m.players.some((p) => p.id === me.id));
  const played = mine.length;
  const done = mine.filter((m) => m.status === "complete");
  const wins = done.filter((m) => winner(m)?.playerId === me.id).length;
  const totalReps = mine.reduce((sum, m) => sum + playerRawReps(me.id, m.entries), 0);
  const winRate = done.length ? Math.round((wins / done.length) * 100) : 0;

  const stat = (label: string, value: string): HTMLElement =>
    el("div", { class: "stat" }, el("b", { text: value }), el("span", { text: label }));

  const history = [...mine].reverse().map((m) => {
    const win = m.status === "complete" ? winner(m) : null;
    const champName = win ? m.players.find((p) => p.id === win.playerId)?.name : null;
    const myScore = playerScore(me, m.entries);
    const iWon = win?.playerId === me.id;
    return el(
      "button",
      {
        class: "rwf-card histcard",
        onClick: () => {
          location.hash = m.status === "complete" ? `#/result/${m.config.id}` : `#/match/${m.config.id}`;
        },
      },
      el(
        "div",
        { class: "histcard-top" },
        el("span", {
          class: `pill ${m.status === "complete" ? (iWon ? "pill--won" : "pill--done") : "pill--live"}`,
          html: m.status === "complete" ? (iWon ? "🏆 WON" : "PLAYED") : `<i class="pulse"></i>LIVE`,
        }),
        el("span", { class: "muted small", text: new Date(m.startedAt ?? Date.now()).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) })
      ),
      el("div", { class: "histcard-title h-display", text: `${m.config.targetReps}-Rep Match` }),
      el(
        "div",
        { class: "histcard-line" },
        el("span", { text: `You: ${fmtScore(Math.round(myScore * 10) / 10)} pts` }),
        el("span", { class: iWon ? "lime" : "muted", text: champName ? (iWon ? "Champion — nice work" : `Winner: ${champName}`) : "In progress" })
      )
    );
  });

  const resetBtn = el(
    "button",
    {
      class: "rwf-btn btn-sm btn--danger",
      text: "RESET APP DATA",
      onClick: () => {
        if (resetBtn.dataset.armed === "1") {
          resetAll();
          return;
        }
        resetBtn.dataset.armed = "1";
        resetBtn.textContent = "TAP AGAIN TO CONFIRM";
        setTimeout(() => {
          resetBtn.dataset.armed = "";
          resetBtn.textContent = "RESET APP DATA";
        }, 2500);
      },
    }
  );

  root.append(
    el(
      "section",
      { class: "screen" },
      el(
        "div",
        { class: "rwf-card card-pad profilecard" },
        avatar(me.name, me.tier, 56),
        el("div", { class: "h-display profilename", text: me.name }),
        el("div", { class: "champbadges" }, tierBadge(me.tier), el("span", { class: "tier tier--mult", text: `×${info.mult} multiplier` })),
        el("p", { class: "muted small", text: st.crew ? `${st.crew.name} · ${st.crew.code}` : "No crew yet" })
      ),
      el("div", { class: "statgrid" }, stat("Matches", String(played)), stat("Wins", String(wins)), stat("Total reps", String(totalReps)), stat("Win rate", `${winRate}%`)),
      el("div", { class: "seclabel", text: "History" }),
      history.length
        ? el("div", { class: "stack" }, ...history)
        : el(
            "div",
            { class: "rwf-card card-pad emptystate" },
            el("div", { class: "h-display", text: "No matches yet" }),
            el("p", { class: "muted small", text: "Your first match is one tap away — the crew is waiting." }),
            el("button", {
              class: "rwf-btn rwf-btn--primary",
              text: "START A MATCH",
              onClick: () => (location.hash = "#/new"),
            })
          ),
      el("div", { class: "resetrow" }, resetBtn)
    )
  );
  return () => {};
}
