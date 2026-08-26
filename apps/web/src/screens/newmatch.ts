// New match — exercises, target, play days → creates via engine → link screen.
import { DAY_LABELS, EXERCISES } from "../data.ts";
import { createMatchAction } from "../state.ts";
import { el, toast, topbar } from "../ui.ts";

export function renderNewMatch(root: HTMLElement): () => void {
  const picked = new Set<string>(["pushup", "squat"]);
  let target = 300;
  const days = new Set<number>([1, 3, 5]);

  const exChips: HTMLElement[] = EXERCISES.map((ex) => {
    const chip = el("button", {
      class: `chip ${picked.has(ex.id) ? "on" : ""}`,
      type: "button",
      text: ex.name,
      onClick: () => {
        if (picked.has(ex.id)) {
          if (picked.size === 1) {
            toast("Pick at least one exercise", "warn");
            return;
          }
          picked.delete(ex.id);
          chip.classList.remove("on");
        } else {
          picked.add(ex.id);
          chip.classList.add("on");
        }
      },
    });
    return chip;
  });

  const targetBtns: HTMLElement[] = [100, 300, 500].map((t) => {
    const b = el("button", {
      class: `seg-btn ${t === target ? "on" : ""}`,
      type: "button",
      text: String(t),
      onClick: () => {
        target = t;
        targetBtns.forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
      },
    });
    return b;
  });

  const dayBtns: HTMLElement[] = DAY_LABELS.map((d, i) => {
    const b = el("button", {
      class: `daybtn ${days.has(i) ? "on" : ""}`,
      type: "button",
      text: d,
      "aria-label": `day ${i}`,
      onClick: () => {
        if (days.has(i)) {
          if (days.size === 1) {
            toast("Pick at least one play day", "warn");
            return;
          }
          days.delete(i);
          b.classList.remove("on");
        } else {
          days.add(i);
          b.classList.add("on");
        }
      },
    });
    return b;
  });

  root.append(
    el(
      "section",
      { class: "screen" },
      topbar("New match", { back: "#/" }),

      el(
        "div",
        { class: "rwf-card card-pad stack" },
        el("div", { class: "seclabel", text: "Exercises — any mix counts" }),
        el("div", { class: "chiprow" }, ...exChips)
      ),

      el(
        "div",
        { class: "rwf-card card-pad stack" },
        el("div", { class: "seclabel", text: "Target — first raw total to hit it closes the match" }),
        el("div", { class: "seg" }, ...targetBtns),
        el("p", { class: "hint", text: "Winner = highest effort-adjusted score at close, not the closer." })
      ),

      el(
        "div",
        { class: "rwf-card card-pad stack" },
        el("div", { class: "seclabel", text: "Play days" }),
        el("div", { class: "dayrow" }, ...dayBtns)
      ),

      el("div", { class: "stakenote", text: "Everyone stakes $5 into the charity pot. Winner directs it — no cash to the winner." }),

      el(
        "button",
        {
          class: "rwf-btn rwf-btn--primary btn-block btn-lg",
          text: "CREATE MATCH",
          onClick: () => {
            const id = createMatchAction([...picked], target, [...days]);
            location.hash = `#/link/${id}`;
          },
        }
      )
    )
  );
  return () => {};
}
