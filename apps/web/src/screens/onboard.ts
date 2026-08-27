// Screen 1 — Onboard: name + fitness tier. One screen, zero friction.
import type { FitnessTier } from "../engine.ts";
import { TIER_INFO } from "../data.ts";
import { completeOnboard } from "../state.ts";
import { el, icon, toast } from "../ui.ts";

export function renderOnboard(root: HTMLElement): () => void {
  let name = "";
  let tier: FitnessTier | null = null;

  const nameInput = el("input", {
    class: "input input--xl",
    type: "text",
    maxlength: "20",
    placeholder: "Your name 🏋️",
    // A placeholder is not an accessible name — it vanishes on input and is
    // skipped by some screen readers. The visible "What do we call you?"
    // seclabel is the real label, so name the field explicitly too.
    "aria-label": "Your name",
    autocomplete: "off",
    enterkeyhint: "next",
    onInput: () => {
      name = (nameInput as HTMLInputElement).value;
      sync();
    },
  });

  // Multiplier chip copy — spells out what the number means for reps.
  const multChip: Record<FitnessTier, string> = {
    couch: "×1.5 — reps count more",
    casual: "×1.25",
    fit: "×1.0",
    athlete: "×0.85 — reps count less",
  };

  const tierCards: HTMLElement[] = [];
  for (const t of ["couch", "casual", "fit", "athlete"] as FitnessTier[]) {
    const info = TIER_INFO[t];
    const card = el(
      "button",
      {
        class: `tiercard tiercard--${t}`,
        type: "button",
        "aria-pressed": "false",
        onClick: () => {
          tier = t;
          tierCards.forEach((c) => {
            c.classList.remove("on");
            c.setAttribute("aria-pressed", "false");
          });
          card.classList.add("on");
          card.setAttribute("aria-pressed", "true");
          sync();
        },
      },
      el("span", { class: "tiercard-check", html: icon("check", 13) }),
      el("div", { class: "tiercard-name h-display", text: info.label }),
      el("div", { class: "tiercard-blurb", text: info.blurb }),
      el("span", { class: "tiercard-mult", text: multChip[t] })
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
