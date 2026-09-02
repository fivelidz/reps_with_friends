/* /styles gallery logic — no deps.
   · renders the theme cards (swatches resolved from REAL computed
     tokens at runtime — a hidden probe per theme, so the cards can never
     drift from design/themes.css)
   · builds the 14-iframe compare strip (demo.html?t=<id>&screen=…)
   · full-screen preview: sets data-theme on THIS page (everything re-skins)
     and reveals the component library section; #theme=<id> deep-links
   No app logic beyond this gallery. */
(() => {
  "use strict";

  const THEMES = [
    { id: "lime",      name: "Lime Athletic",     desc: "…a steel weight-room floor under fluorescent light — matte charcoal, one lime stripe, technical type." },
    { id: "gold",      name: "Gold Arcade",       desc: "…a late-night arcade cabinet — deep purple shell, marquee-gold buttons, Anton capitals." },
    { id: "sunset",    name: "Sunset Brutalist",  desc: "…a screen-printed sport poster — cream stock, ink-black rules, hard offset shadows." },
    { id: "neon",      name: "Midnight Neon",     desc: "…an esports broadcast desk — blue-black glass, cyan + magenta rim-light, mono numerals." },
    { id: "forest",    name: "Forest Retro",      desc: "…a 1970s family board-game box — walnut tones, mustard + burnt-orange, soft rounded everything." },
    { id: "board",     name: "Stadium Board",     desc: "…a flip-scoreboard stadium — split-flap numerals, lane-paint stripes, starting-block buttons, photo-finish tape." },
    { id: "mycelial",  name: "Mycelial",          desc: "…a bioluminescent root network — tendril dividers, spore-drift air, fungus-cap buttons, growth-ring progress. Everything breathes." },
    { id: "techy",     name: "Mission Control",   desc: "…a flight telemetry console — brushed metal, corner rivets, scanlines, LED numerals, guarded switches, boot-up reveals." },
    { id: "track",     name: "Track & Field",     desc: "…stadium signage — condensed timing type, painted lane rows, race-bib ranks, chalk grids." },
    { id: "cardtable", name: "Card Table",        desc: "…green felt and bone — brushed felt noise, dealer-chip buttons, cream letterpress cards, brass hairlines." },
    { id: "caveman",   name: "Caveman",           desc: "…carved stone and fire — ROCK buttons with chiselled facets, ochre cave-paint walls, bone-white type, fire-glow danger." },
    { id: "n64",       name: "N64",               desc: "…a low-poly fog console — vertex-gradient washes, stepped bevels, cartridge-slot buttons, square avatars, fog reveals." },
    { id: "goldeneye", name: "GoldenEye",         desc: "…a spy dossier HUD — gunmetal notched panels, watch gauges, typewriter objectives under redaction, reticle focus." },
    { id: "neobrut",   name: "Sports Poster",     desc: "…a neo-brutalist sports poster with a soft underbelly — huge loud type on warm cream, thick rules, off-register duotone print edges; then every touch is buttery, pill-soft and gentle." },
  ];
  const KIT_THEMES = ["board", "mycelial", "techy", "track", "cardtable", "caveman", "n64", "goldeneye", "neobrut"];
  const V2_THEMES = ["board", "mycelial", "techy", "track", "cardtable", "caveman", "n64", "goldeneye"];
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
    const num = String(i + 1).padStart(2, "0");
    return `
      <article class="st-card" role="button" tabindex="0" data-theme-card="${t.id}" aria-pressed="false">
        <span class="st-card__num">${num} · ${t.id}</span>
        <h3 class="st-card__name">${t.name}</h3>
        <p class="st-card__desc">${t.desc}</p>
        <span class="st-card__swatches">${dots}</span>
        <span class="st-card__meta">
          <span class="st-card__hex">${tokFor(t.id, "--lime")}</span>
          <button class="st-card__snip" type="button" data-theme-snippet="${t.id}">⧉ snippet</button>
          <span class="st-card__cta">Full preview →</span>
        </span>
      </article>`;
  }).join("");

  function snippetFor(id) {
    return `<html data-theme="${id}">\nhttps://rwf.qalarc.com/styles/#theme=${id}`;
  }

  async function copySnippet(id, button) {
    const text = snippetFor(id);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand("copy");
      ta.remove();
    }
    if (!copied) return;
    button.textContent = "✓ copied";
    button.classList.add("is-copied");
    window.setTimeout(() => {
      button.textContent = "⧉ snippet";
      button.classList.remove("is-copied");
    }, 1300);
  }

  /* ── compare strip: 14 live iframes ───────────────────────────────── */
  const strip = document.getElementById("strip");
  let screen = "both";
  /* strip iframes are EAGER (not lazy): with 14 themes, off-viewport
     frames would never load in headless checks — the strip IS the check
     surface verify.js reads. The preview iframe below stays lazy. */
  function buildStrip() {
    strip.dataset.screen = screen;
    strip.innerHTML = THEMES.map((t) => `
      <div class="st-cell">
        <span class="st-cell__cap">
          <span class="st-cell__dot" style="background:${tokFor(t.id, "--lime")}"></span>
          ${t.name}
          <span class="st-cell__hex">${tokFor(t.id, "--lime")}</span>
        </span>
        <iframe data-theme-frame="${t.id}" title="${t.name} mock"
                src="demo.html?t=${t.id}&screen=${screen}"></iframe>
      </div>`).join("");
  }
  function setScreen(s) {
    screen = s;
    document.querySelectorAll("[data-screen]").forEach((x) => x.classList.toggle("is-on", x.dataset.screen === s));
    buildStrip();
  }
  buildStrip();

  document.querySelectorAll("[data-screen]").forEach((b) => {
    b.addEventListener("click", () => {
      setScreen(b.dataset.screen);
    });
  });

  /* ── ON THE APP strip: the nine material kits × the real /v2 screens ─ */
  /* appdemo.html renders the board app's actual bd-* markup (home +
     battle phones) wearing one overhauled theme per iframe. */
  const appStrip = document.getElementById("appStrip");
  let appScreen = "both";
  function buildAppStrip() {
    if (!appStrip) return;
    appStrip.dataset.screen = appScreen;
    appStrip.innerHTML = KIT_THEMES.map((id) => THEMES.find((t) => t.id === id)).map((t) => `
      <div class="st-appcell">
        <span class="st-cell__cap">
          <span class="st-cell__dot" style="background:${tokFor(t.id, "--lime")}"></span>
          ${t.name}
          <span class="st-cell__hex">${tokFor(t.id, "--lime")}</span>
        </span>
        <div class="st-apppair">
          <iframe data-app-frame="${t.id}" title="${t.name} on the app — home"
                  src="appdemo.html?t=${t.id}&screen=${appScreen}"></iframe>
        </div>
      </div>`).join("");
  }
  function setAppScreen(s) {
    appScreen = s;
    document.querySelectorAll("[data-appscreen]").forEach((x) => x.classList.toggle("is-on", x.dataset.appscreen === s));
    buildAppStrip();
  }
  buildAppStrip();

  document.querySelectorAll("[data-appscreen]").forEach((b) => {
    b.addEventListener("click", () => {
      setAppScreen(b.dataset.appscreen);
    });
  });

  /* ── preview mode: the page itself re-skins ────────────────────────── */
  const previewSec = document.getElementById("preview");
  const previewBar = document.getElementById("previewBar");
  const previewFrame = document.getElementById("previewFrame");
  const previewName = document.getElementById("previewName");
  const previewChip = document.getElementById("previewChip");
  let active = null;

  function updateActiveTheme(id, { frame = "instant" } = {}) {
    const t = THEMES.find((x) => x.id === id);
    if (!t) return false;
    active = id;
    document.documentElement.dataset.theme = id;
    previewName.textContent = t.name;
    previewChip.textContent = t.name;
    document.querySelectorAll("[data-theme-card]").forEach((c) =>
      c.setAttribute("aria-pressed", String(c.dataset.themeCard === id)));
    if (history.replaceState) history.replaceState(null, "", `#theme=${id}`);
    if (frame === "reload") {
      previewFrame.src = `demo.html?t=${id}&screen=both`;
    } else if (frame === "instant") {
      const doc = previewFrame.contentDocument;
      if (doc?.documentElement) {
        doc.documentElement.dataset.theme = id;
      } else {
        previewFrame.src = `demo.html?t=${id}&screen=both`;
      }
    }
    return true;
  }

  function enterPreview(id) {
    if (!THEMES.some((x) => x.id === id)) return;
    previewSec.hidden = false;
    previewBar.hidden = false;
    updateActiveTheme(id, { frame: "reload" });
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

  function cycleTheme(dir) {
    if (!active) return;
    const current = THEMES.findIndex((t) => t.id === active);
    const next = (current + dir + THEMES.length) % THEMES.length;
    updateActiveTheme(THEMES[next].id, { frame: "instant" });
  }

  function jumpTo(i) {
    if (i < 0 || i >= THEMES.length) return;
    if (!active) {
      enterPreview(THEMES[i].id);
      return;
    }
    updateActiveTheme(THEMES[i].id, { frame: "instant" });
  }

  cards.addEventListener("click", (e) => {
    const snip = e.target.closest("[data-theme-snippet]");
    if (snip) {
      e.stopPropagation();
      copySnippet(snip.dataset.themeSnippet, snip);
      return;
    }
    const card = e.target.closest("[data-theme-card]");
    if (card) enterPreview(card.dataset.themeCard);
  });
  cards.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest("[data-theme-card]");
    if (!card || e.target.closest("[data-theme-snippet]")) return;
    e.preventDefault();
    enterPreview(card.dataset.themeCard);
  });
  document.getElementById("previewExit").addEventListener("click", exitPreview);
  addEventListener("keydown", (e) => {
    if (e.target?.matches?.("input,textarea,select")) return;
    if (e.key === "Escape" && active) {
      e.preventDefault();
      exitPreview();
      return;
    }
    if (e.key === "ArrowRight" && active) {
      e.preventDefault();
      cycleTheme(1);
      return;
    }
    if (e.key === "ArrowLeft" && active) {
      e.preventDefault();
      cycleTheme(-1);
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      jumpTo(Number(e.key) - 1);
    }
  });

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
  window.__rwfStyles = { THEMES, KIT_THEMES, V2_THEMES, enterPreview, exitPreview, active: () => active,
                         cycleTheme, jumpTo,
                         get screen() { return screen; }, set screen(s) { setScreen(s); }, setScreen,
                         get appScreen() { return appScreen; }, set appScreen(s) { setAppScreen(s); }, setAppScreen };
  window.__rwfStylesReady = true;
})();
