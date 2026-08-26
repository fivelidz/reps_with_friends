// Screen 2 — Crew: create (get a 6-char code) or join by code.
import { createCrew, getState, joinCrew } from "../state.ts";
import { copyText, el, icon, toast, topbar } from "../ui.ts";

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
