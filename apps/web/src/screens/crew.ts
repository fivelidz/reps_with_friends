// Screen 2 — Crew: create (get a 6-char code) or join by code.
import { createCrew, getState, joinCrew, pullCrewIntoState, syncCrewNow } from "../state.ts";
import { syncAvailable, syncHasCrew } from "../sync.ts";
import { copyText, el, icon, toast, topbar } from "../ui.ts";

/** Server-sync card for the manage view: opt in / pull (see sync.ts). */
function syncCard(): HTMLElement {
  if (!syncAvailable()) {
    // Deployed Pages has no API behind it — say so, quietly.
    return el(
      "div",
      { class: "rwf-card card-pad" },
      el("div", { class: "seclabel", text: "Server sync" }),
      el("p", {
        class: "muted small",
        text: "Local sync only — this device keeps the scoreboard. Server sync runs next to the dev API (localhost:4174).",
      })
    );
  }
  if (syncHasCrew()) {
    return el(
      "div",
      { class: "rwf-card card-pad stack-sm" },
      el("div", { class: "seclabel", text: "Server sync" }),
      el("p", {
        class: "muted small",
        text: "Crew mirrored to the server — phones and chat bots converge on the same code and scoreboard.",
      }),
      el("button", {
        class: "rwf-btn btn-sm",
        html: icon("download", 14) + "<span>PULL UPDATES</span>",
        onClick: () => {
          pullCrewIntoState();
          toast("Pulling latest from server…", "info");
        },
      })
    );
  }
  return el(
    "div",
    { class: "rwf-card card-pad stack-sm" },
    el("div", { class: "seclabel", text: "Server sync" }),
    el("p", {
      class: "muted small",
      text: "This crew lives on this device only. Sync it to the server to link phones and chat bots.",
    }),
    el("button", {
      class: "rwf-btn rwf-btn--primary btn-sm",
      html: icon("bolt", 14) + "<span>SYNC THIS CREW TO THE SERVER</span>",
      onClick: () => {
        syncCrewNow();
        toast("Syncing crew to server…", "info");
      },
    })
  );
}

export function renderCrew(root: HTMLElement): () => void {
  const st = getState();

  // Already has a crew → manage view (code + copy).
  if (st.crew) {
    const code = st.crew.code;
    root.append(
      el(
        "section",
        { class: "screen" },
        topbar("Your crew", { back: "#/" }),
        el(
          "div",
          { class: "rwf-card card-pad code-box" },
          el("div", { class: "seclabel", text: "Crew code" }),
          el("div", { class: "code", text: code }),
          el(
            "button",
            {
              class: "rwf-btn btn-sm",
              html: icon("copy", 15) + "<span>Copy code</span>",
              onClick: async () => {
                (await copyText(code)) ? toast("Crew code copied", "ok") : toast("Copy failed — long-press the code", "warn");
              },
            }
          )
        ),
        syncCard(),
        el("p", { class: "hint", text: "Share this code. Your crew joins from the chat or the app." })
      )
    );
    return () => {};
  }

  // No crew yet → create or join.
  const nameInput = el("input", { class: "input", type: "text", maxlength: "24", placeholder: "e.g. Thursday Legends" });
  const codeInput = el("input", {
    class: "input input--mono",
    type: "text",
    maxlength: "6",
    placeholder: "6-char code",
    autocomplete: "off",
  });

  root.append(
    el(
      "section",
      { class: "screen" },
      topbar("Start a crew"),
      el("p", { class: "lead", text: "A crew is your people — the group chat that gets fit together." }),

      el(
        "div",
        { class: "rwf-card card-pad stack" },
        el("div", { class: "seclabel", text: "Create a crew" }),
        nameInput,
        el(
          "button",
          {
            class: "rwf-btn rwf-btn--primary btn-block",
            text: "CREATE & GET CODE",
            onClick: () => {
              createCrew((nameInput as HTMLInputElement).value);
              toast("Crew created — share your code", "ok");
              location.hash = "#/";
            },
          }
        )
      ),

      el("div", { class: "or", text: "or" }),

      el(
        "div",
        { class: "rwf-card card-pad stack" },
        el("div", { class: "seclabel", text: "Join with a code" }),
        codeInput,
        el(
          "button",
          {
            class: "rwf-btn btn-block",
            text: "JOIN CREW",
            onClick: () => {
              const v = (codeInput as HTMLInputElement).value;
              if (v.trim().length < 4) {
                toast("Codes are 6 characters", "warn");
                return;
              }
              joinCrew(v);
              toast("Joined crew", "ok");
              location.hash = "#/";
            },
          }
        )
      )
    )
  );
  return () => {};
}
