/* /styles gallery logic — no deps.
   · renders the five theme cards (swatches resolved from REAL computed
     tokens at runtime — a hidden probe per theme, so the cards can never
     drift from design/themes.css)
   · builds the 5-iframe compare strip (demo.html?t=<id>&screen=…)
   · full-screen preview: sets data-theme on THIS page (everything re-skins)
     and reveals the component library section; #theme=<id> deep-links
   No app logic beyond this gallery. */
(() => {
  "use strict";

  const THEMES = [
    { id: "lime",   name: "Lime Athletic",   line: "The system as shipped — near-black steel, one loud lime, technical with a streak of arcade." },
    { id: "gold",   name: "Gold Arcade",     line: "Ben's Figma direction — purple-ink surfaces, brand-gold actions, Anton display. Confident consumer product." },
    { id: "sunset", name: "Sunset Brutalist",line: "The light mode — cream paper, 2px ink borders, hard offset shadows, oversized flat type. Sport-poster loud." },
    { id: "neon",   name: "Midnight Neon",   line: "The esports skin — blue-black, electric cyan + magenta, mono numerals, subtle glow edges. Ranked-play energy." },
    { id: "forest", name: "Forest Retro",    line: "The family mode — walnut dark, mustard/burnt-orange/olive 70s palette, soft radii, rounded type. Everyone plays." },
  ];
  const SWATCH_SLOTS = [
    ["--bg", "bg"], ["--surface-2", "surface"], ["--lime", "primary"],
    ["--coral", "effort"], ["--success", "success"], ["--text", "text"],
  ];

  /* resolve a token for a theme WITHOUT touching the page theme:
     an off-screen probe element wearing data-theme=X */
  const probe = document.createElement("div");
  probe.style.cssText = "position:absolute;left:-9999px;top:0;pointer-events:none";
  document.body.appendChild(probe);
  const tokFor = (theme, name) => {
    probe.setAttribute("data-theme", theme);
    const v = getComputedStyle(probe).getPropertyValue(name).trim();
    return v;
  };

  /* ── theme cards ───────────────────────────────────────────────────── */
  const cards = document.getElementById("cards");
  cards.innerHTML = THEMES.map((t, i) => {
    const dots = SWATCH_SLOTS.map(([slot, label]) =>
      `<span class="st-card__sw ${label === "bg" ? "st-card__sw--bg" : ""}" title="${label} ${tokFor(t.id, slot)}"
             style="background:${tokFor(t.id, slot)}"></span>`).join("");
    return `
      <button class="st-card" type="button" data-theme-card="${t.id}" aria-pressed="false">
        <span class="st-card__num">0${i + 1} · ${t.id}</span>
        <h3 class="st-card__name">${t.name}</h3>
        <p class="st-card__line">${t.line}</p>
        <span class="st-card__swatches">${dots}</span>
        <span class="st-card__meta">
          <span class="st-card__hex">${tokFor(t.id, "--lime")}</span>
          <span class="st-card__cta">Full preview →</span>
        </span>
      </button>`;
  }).join("");

  /* ── compare strip: 5 live iframes ────────────────────────────────── */
  const strip = document.getElementById("strip");
  let screen = "both";
  function buildStrip() {
    strip.dataset.screen = screen;
    strip.innerHTML = THEMES.map((t) => `
      <div class="st-cell">
        <span class="st-cell__cap">
          <span class="st-cell__dot" style="background:${tokFor(t.id, "--lime")}"></span>
          ${t.name}
          <span class="st-cell__hex">${tokFor(t.id, "--lime")}</span>
        </span>
        <iframe data-theme-frame="${t.id}" title="${t.name} mock" loading="lazy"
                src="demo.html?t=${t.id}&screen=${screen}"></iframe>
      </div>`).join("");
  }
  buildStrip();

  document.querySelectorAll(".st-switch__btn").forEach((b) => {
    b.addEventListener("click", () => {
      screen = b.dataset.screen;
      document.querySelectorAll(".st-switch__btn").forEach((x) => x.classList.toggle("is-on", x === b));
      buildStrip();
    });
  });

  /* ── preview mode: the page itself re-skins ────────────────────────── */
  const previewSec = document.getElementById("preview");
  const previewBar = document.getElementById("previewBar");
  const previewFrame = document.getElementById("previewFrame");
  const previewName = document.getElementById("previewName");
  const previewChip = document.getElementById("previewChip");
  let active = null;

  function enterPreview(id) {
    const t = THEMES.find((x) => x.id === id);
    if (!t) return;
    active = id;
    document.documentElement.dataset.theme = id;
    previewSec.hidden = false;
    previewBar.hidden = false;
    previewName.textContent = t.name;
    previewChip.textContent = t.name;
    previewFrame.src = `demo.html?t=${id}&screen=both`;
    document.querySelectorAll("[data-theme-card]").forEach((c) =>
      c.setAttribute("aria-pressed", String(c.dataset.themeCard === id)));
    if (history.replaceState) history.replaceState(null, "", `#theme=${id}`);
    previewSec.scrollIntoView({ behavior: "smooth", block: "start" });
    /* icons inside the library mount once via figma-components.js boot; the
       section existed from parse so they're already drawn. Re-run for safety
       if a later render ever replaces them. */
    window.rwfFigma?.mountIcons?.(previewSec);
  }
  function exitPreview() {
    active = null;
    document.documentElement.dataset.theme = "lime";
    previewSec.hidden = true;
    previewBar.hidden = true;
    previewFrame.src = "about:blank";
    document.querySelectorAll("[data-theme-card]").forEach((c) => c.setAttribute("aria-pressed", "false"));
    if (history.replaceState) history.replaceState(null, "", "#");
    document.getElementById("compare").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  cards.addEventListener("click", (e) => {
    const card = e.target.closest("[data-theme-card]");
    if (card) enterPreview(card.dataset.themeCard);
  });
  document.getElementById("previewExit").addEventListener("click", exitPreview);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && active) exitPreview(); });

  /* deep link: /styles/#theme=forest */
  const m = location.hash.match(/^#theme=(\w+)$/);
  const initialTheme = m && THEMES.some((t) => t.id === m[1]) ? m[1] : null;
  if (initialTheme) enterPreview(initialTheme);
  /* figma-components.js boot (loaded before us) may set data-theme="gold"
     from the /system localStorage key — this handler registers after its
     DOMContentLoaded listener, so our assert runs last and wins. */
  document.addEventListener("DOMContentLoaded", () => {
    if (!active) document.documentElement.dataset.theme = initialTheme ?? "lime";
  }, false);

  /* e2e hooks */
  window.__rwfStyles = { THEMES, enterPreview, exitPreview, active: () => active,
                         get screen() { return screen; }, setScreen(s) { screen = s; buildStrip(); } };
  window.__rwfStylesReady = true;
})();
