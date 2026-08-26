// Screen 1 — Onboard: name + fitness tier. One screen, zero friction.
import type { FitnessTier } from "../engine.ts";
import { TIER_INFO } from "../data.ts";
import { completeOnboard } from "../state.ts";
import { el, icon, toast } from "../ui.ts";

export function renderOnboard(root: HTMLElement): () => void {
  let name = "";
  let tier: FitnessTier | null = null;

  const nameInput = el("input", {
    class: "input",
    type: "text",
    maxlength: "20",
    placeholder: "Your name",
    autocomplete: "off",
    onInput: () => {
      name = (nameInput as HTMLInputElement).value;
      sync();
    },
  });

  const tierCards: HTMLElement[] = [];
  for (const t of ["couch", "casual", "fit", "athlete"] as FitnessTier[]) {
    const info = TIER_INFO[t];
    const card = el(
      "button",
      {
        class: `tiercard tiercard--${t}`,
        type: "button",
        onClick: () => {
          tier = t;
          tierCards.forEach((c) => c.classList.remove("on"));
          card.classList.add("on");
          sync();
        },
      },
      el("div", { class: "tiercard-name h-display", text: info.label }),
      el("div", { class: "tiercard-blurb", text: info.blurb }),
      el("div", { class: "tiercard-mult", text: `×${info.mult} score` })
    );
    tierCards.push(card);
  }

  const cta = el(
    "button",
    {
      class: "rwf-btn rwf-btn--primary btn-block btn-lg",
      disabled: true,
      text: "START MOVING",
      onClick: () => {
        if (!name.trim() || !tier) return;
        completeOnboard(name, tier);
        toast(`Welcome, ${name.trim()} 👋`, "ok");
        location.hash = "#/crew";
      },
    }
  );

  function sync(): void {
    (cta as HTMLButtonElement).disabled = !(name.trim().length > 0 && tier);
  }

  root.append(
    el(
      "section",
      { class: "screen screen--onboard" },
      el(
        "div",
        { class: "brand" },
        el("div", { class: "brand-mark", html: icon("bolt", 26) }),
        el("div", { class: "brand-name h-display", text: "Reps With Friends" }),
        el("p", { class: "brand-sub", text: "The group chat gets fit. The winner picks the charity." })
      ),
      el("div", { class: "field" }, el("label", { class: "seclabel", text: "What do we call you?" }), nameInput),
      el(
        "div",
        { class: "field" },
        el("label", { class: "seclabel", text: "Pick your tier — honestly" }),
        el("div", { class: "tiergrid" }, ...tierCards),
        el("p", { class: "hint", text: "Lower tier = higher score multiplier. Your mates are watching." })
      ),
      cta
    )
  );
  return () => {};
}
