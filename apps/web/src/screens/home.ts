// Home — crew header, match list, entry point for new matches.
import { standings } from "../engine.ts";
import { getState } from "../state.ts";
import { copyText, el, icon, toast } from "../ui.ts";

export function renderHome(root: HTMLElement): () => void {
  const st = getState();
  if (!st.crew) {
    location.hash = "#/crew";
    return () => {};
  }

  const crewCard = el(
    "div",
    { class: "rwf-card card-pad crewcard" },
    el(
      "div",
      { class: "crewcard-row" },
      el("div", {}, el("div", { class: "seclabel", text: "Crew" }), el("div", { class: "h-display crewcard-name", text: st.crew.name })),
      el(
        "button",
        {
          class: "codechip",
          onClick: async () => {
            (await copyText(st.crew!.code)) ? toast("Crew code copied", "ok") : toast("Copy failed", "warn");
          },
          html: icon("copy", 13) + `<span>${st.crew.code}</span>`,
        }
      )
    )
  );

  const matches = [...st.matches].reverse();
  const cards: HTMLElement[] = matches.map((m) => {
    const rows = standings(m);
    const leader = rows[0];
    const done = m.status === "complete";
    const exNames = m.config.exercises.map((e) => e.name).join(" · ");
    return el(
      "button",
      {
        class: "rwf-card matchcard",
        onClick: () => {
          location.hash = done ? `#/result/${m.config.id}` : `#/match/${m.config.id}`;
        },
      },
      el(
        "div",
        { class: "matchcard-top" },
        el("span", { class: `pill ${done ? "pill--done" : "pill--live"}`, html: done ? "COMPLETE" : `<i class="pulse"></i>LIVE` }),
        el("span", { class: "matchcard-target", text: `→ ${m.config.targetReps}` })
      ),
      el("div", { class: "h-display matchcard-title", text: `${m.config.targetReps}-Rep Match` }),
      el("div", { class: "matchcard-ex", text: exNames }),
      leader
        ? el(
            "div",
            { class: "matchcard-lead" },
            el("span", { class: "matchcard-leadname", text: `🥇 ${leader.player.name} · ${leader.rawReps} reps` }),
            el("span", { class: "matchcard-leadscore", text: `${leader.adjustedScore} pts` })
          )
        : el("div", { class: "matchcard-lead muted", text: "No reps yet — be first on the board" }),
      el("div", { class: "bar" }, el("i", { style: `width:${leader ? leader.progressPct : 0}%` }))
    );
  });

  root.append(
    el(
      "section",
      { class: "screen" },
      el("div", { class: "homehead" }, el("div", { class: "h-display homehead-title", text: "Matches" })),
      crewCard,
      cards.length
        ? el("div", { class: "stack" }, ...cards)
        : el(
            "div",
            { class: "rwf-card card-pad emptystate" },
            el("div", { class: "emptystate-ico", text: "🏋️" }),
            el("div", { class: "h-display", text: "No matches yet" }),
            el("p", { class: "muted small", text: "Start one, link your group chat, let the bot keep score." }),
            el("button", {
              class: "rwf-btn rwf-btn--primary",
              html: icon("plus", 16) + "<span>NEW MATCH</span>",
              onClick: () => {
                location.hash = "#/new";
              },
            })
          ),
      cards.length
        ? el(
            "button",
            {
              class: "rwf-btn rwf-btn--primary btn-block btn-lg",
              html: icon("plus", 18) + "<span>NEW MATCH</span>",
              onClick: () => {
                location.hash = "#/new";
              },
            }
          )
        : null
    )
  );
  return () => {};
}
