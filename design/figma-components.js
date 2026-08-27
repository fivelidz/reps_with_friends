/* RWF × Figma adoption — shared behaviour (lane F3).
   Loaded by /system and figma/impl/components. No deps, no engine wiring:
   these are VISUAL components only (docs/13 §7 — structural calls not ours).

   1. Icon map — Ben's 22-icon set redrawn same-school (24px grid, stroke 2,
      round caps). His vector paths aren't in the REST dump, so these are ours;
      logged as a divergence (icon art was his A3 placeholder anyway).
   2. Theme switch — [data-theme="gold"] on <html">, persisted.
   3. Library demos — chip selection + RUF preview, spring reorder, ticking
      countdown, DZ level cycle. */

(() => {
  /* ── 1 · icons ────────────────────────────────────────────────────── */
  const P = (d, extra = "") => `<path d="${d}" ${extra}/>`;
  const ICONS = {
    trophy: P("M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 15v2c0 .6-.5 1-1 1.2-1.2.6-2 2-2 3.8M14 15v2c0 .6.5 1 1 1.2 1.2.6 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2Z"),
    feed: P("M4 6h16M4 12h16M4 18h10"),
    bolt: P("M13 2 3 14h7l-1 8 10-12h-7l1-8Z"),
    user: P("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c0-4 3.6-6 8-6s8 2 8 6"),
    plus: P("M12 5v14M5 12h14"),
    flame: P("M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z"),
    shield: P("M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10Z"),
    clock: P("M12 6v6l4 2", 'fill="none"') + `<circle cx="12" cy="12" r="9" fill="none"/>`,
    crown: P("M3 18h18M3 18 2 7l5 4 5-7 5 7 5-4-1 11"),
    chest: P("M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9ZM4 13h16M11 13h2v3h-2z"),
    warning: P("M12 3 2 21h20L12 3ZM12 10v5M12 18v.5"),
    check: P("M4 12l5 5L20 7"),
    bell: P("M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0"),
    lock: P("M6 11V7a6 6 0 0 1 12 0v4M5 11h14a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a1 1 0 0 1 1-1Z"),
    wifioff: P("M2 2l20 20M12 20h.01M8.5 16.5a5 5 0 0 1 5-1M5 13a10 10 0 0 1 4-2.4M19 13a10 10 0 0 0-2.4-1.8M2 8.8a15 15 0 0 1 6-3M15.5 4.6a15 15 0 0 1 6.3 4.2"),
  };
  const svg = (name) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] ?? ""}</svg>`;

  function mountIcons(root = document) {
    root.querySelectorAll("[data-fg-icon]").forEach((el) => {
      if (el.dataset.fgIconDone) return;
      el.innerHTML = svg(el.dataset.fgIcon);
      el.dataset.fgIconDone = "1";
    });
  }

  /* ── 2 · theme switch (founder call D5/D6 demo) ───────────────────── */
  const KEY = "rwf-theme";
  function setTheme(t, persist = true) {
    if (t === "gold") document.documentElement.setAttribute("data-theme", "gold");
    else document.documentElement.removeAttribute("data-theme");
    if (persist) { try { localStorage.setItem(KEY, t); } catch { /* private mode */ } }
    document.querySelectorAll("[data-theme-set]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.themeSet === t));
    });
  }
  function initTheme() {
    // ?theme=gold in the URL wins (demo links + screenshot verification),
    // then the persisted choice.
    const url = new URLSearchParams(location.search).get("theme");
    let saved = "";
    try { saved = localStorage.getItem(KEY) ?? ""; } catch { /* private mode */ }
    const t = url === "gold" || url === "lime" ? url : saved;
    if (t) setTheme(t, false);
    document.querySelectorAll("[data-theme-set]").forEach((b) => {
      b.addEventListener("click", () => setTheme(b.dataset.themeSet));
    });
  }

  /* ── 3 · library demos ─────────────────────────────────────────────── */

  // quick-log sheet: exercise + preset chips → RUF preview + CTA label.
  // RUF conversion is Ben's table (push-up 1:1, burpee 1:2, plank 10s:5).
  const RUF = { "Push-ups": 1, Squats: 1, Burpees: 2, "Plank (10s)": 0.5 };
  function initSheet(root = document) {
    root.querySelectorAll(".fg-sheet[data-fg-live]").forEach((sheet) => {
      const ex = [...sheet.querySelectorAll(".fg-chip--exercise")];
      const pre = [...sheet.querySelectorAll(".fg-chip--lg")];
      const conv = sheet.querySelector(".fg-sheet__conversion");
      const cta = sheet.querySelector(".fg-sheet__cta");
      const state = { ex: "Push-ups", n: 20 };
      const render = () => {
        const ruf = Math.round(state.n * (RUF[state.ex] ?? 1));
        const pct = Math.min(100, Math.round(((85 + ruf) / 120) * 100)); // SAMPLE maths
        conv.innerHTML = `<b>${state.n} ${state.ex.toLowerCase()} = ${ruf} RUF</b> · takes you to ${pct}%`;
        cta.textContent = `LOG ${state.n} ${state.ex.toUpperCase()}`;
        ex.forEach((c) => c.setAttribute("aria-pressed", String(c.textContent.trim() === state.ex)));
        pre.forEach((c) => c.setAttribute("aria-pressed", String(Number(c.textContent) === state.n)));
      };
      ex.forEach((c) => c.addEventListener("click", () => { state.ex = c.textContent.trim(); render(); }));
      pre.forEach((c) => c.addEventListener("click", () => { state.n = Number(c.textContent); render(); }));
      render();
    });
  }

  // leaderboard: FLIP spring reorder — his 400ms row reposition (§7 row 16).
  function initBoard(root = document) {
    root.querySelectorAll("[data-fg-board]").forEach((btn) => {
      const list = btn.parentElement.querySelector(".fg-stack");
      if (!list) return;
      btn.addEventListener("click", () => {
        const rows = [...list.children];
        const first = new Map(rows.map((r) => [r, r.getBoundingClientRect().top]));
        rows.reverse().forEach((r) => list.appendChild(r));
        rows.forEach((r) => {
          const dy = first.get(r) - r.getBoundingClientRect().top;
          if (!dy) return;
          r.animate(
            [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
            { duration: 400, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" }
          );
        });
      });
    });
  }

  // countdown: live tick on the normal level (Anton tabular digits).
  function initCount(root = document) {
    root.querySelectorAll(".fg-count[data-fg-live]").forEach((el) => {
      const t = el.querySelector(".fg-count__time");
      if (!t) return;
      let s = 6 * 3600 + 12 * 60 + 44;
      const fmt = () => {
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
        return `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
      };
      t.textContent = fmt();
      setInterval(() => { s = Math.max(0, s - 1); t.textContent = fmt(); }, 1000);
    });
  }

  // danger zone: cycle L1 → L2 → L3 (layout never changes — colour + pulse only).
  function initDZ(root = document) {
    root.querySelectorAll(".fg-dz[data-fg-live]").forEach((el) => {
      const levels = [
        { c: "", label: "DANGER ZONE — 3 HOURS LEFT" },
        { c: "fg-dz--l2", label: "DANGER ZONE — 1 HOUR LEFT" },
        { c: "fg-dz--l3", label: "DANGER ZONE — 24 MINUTES LEFT" },
      ];
      let i = 0;
      el.addEventListener("click", () => {
        i = (i + 1) % levels.length;
        el.className = `fg-dz ${levels[i].c}`.trim();
        if (el.dataset.fgLive !== undefined) el.setAttribute("data-fg-live", "1");
        el.querySelector(".fg-dz__label").textContent = levels[i].label;
      });
    });
  }

  function boot() {
    mountIcons();
    initTheme();
    initSheet();
    initBoard();
    initCount();
    initDZ();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  // expose for pages that render components later
  window.rwfFigma = { mountIcons, setTheme };
})();
