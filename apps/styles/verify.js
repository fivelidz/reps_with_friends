/* /styles verify — computed-style + WCAG assertions, run live in the page.
   Reads each theme iframe (same-origin), resolves the ACTUAL computed custom
   properties, and re-checks:
     · data-theme attr applied + non-empty core tokens
     · --primary (--lime slot) is DISTINCT across all five themes
     · --bg distinct across all five
     · text-on-bg ≥ 4.5 · faint-on-bg ≥ 4.5 (AA text)
     · primary-on-bg ≥ 3.0 (AA large display type)
     · on-accent-on-primary ≥ 4.5 · on-warn-on-urgency ≥ 4.5 (fill text)
     · the theme's display font is actually loaded (document.fonts.check)
   Exposed as window.__rwfStylesVerify() so apps/styles/e2e.mjs can assert
   the same results headlessly. Offline source of truth: scripts/styles_contrast.py.
   No deps. */
(() => {
  "use strict";

  const THEMES = [
    { id: "lime",   font: { spec: "700 16px 'Space Grotesk'",  label: "Space Grotesk" } },
    { id: "gold",   font: { spec: "400 16px 'Anton'",          label: "Anton" } },
    { id: "sunset", font: { spec: "800 16px 'Archivo'",        label: "Archivo" } },
    { id: "neon",   font: { spec: "700 16px 'JetBrains Mono'", label: "JetBrains Mono" } },
    { id: "forest", font: { spec: "600 16px 'Fredoka'",        label: "Fredoka" } },
    /* V2 expansion (board flagship + 7 — same AA bar as the five) */
    { id: "board",     font: { spec: "400 16px 'Anton'",          label: "Anton" } },
    { id: "mycelial",  font: { spec: "600 16px 'Fredoka'",        label: "Fredoka" } },
    { id: "techy",     font: { spec: "700 16px 'JetBrains Mono'", label: "JetBrains Mono" } },
    { id: "track",     font: { spec: "400 16px 'Anton'",          label: "Anton" } },
    { id: "cardtable", font: { spec: "400 16px Georgia",        label: "Georgia (system serif)" } },
    { id: "caveman",   font: { spec: "900 16px 'Archivo'",        label: "Archivo" } },
    { id: "n64",       font: { spec: "600 16px 'Fredoka'",        label: "Fredoka" } },
    { id: "goldeneye", font: { spec: "700 16px 'JetBrains Mono'", label: "JetBrains Mono" } },
    { id: "neobrut",   font: { spec: "400 16px 'Anton'",          label: "Anton" } },
    /* founder-site kits (mined 2026-09-03 — same AA bar as the rest) */
    { id: "x10",       font: { spec: "700 16px 'Space Grotesk'",  label: "Space Grotesk" } },
    { id: "doof",      font: { spec: "700 16px 'Space Grotesk'",  label: "Space Grotesk" } },
    { id: "qalarc",    font: { spec: "400 16px 'DM Serif Display'", label: "DM Serif Display" } },
    { id: "tradez",    font: { spec: "800 16px 'Fraunces'",       label: "Fraunces" } },
    { id: "gmux",      font: { spec: "700 16px 'JetBrains Mono'", label: "JetBrains Mono" } },
    { id: "volkus",    font: { spec: "400 16px Georgia",          label: "Georgia (system serif)" } },
    { id: "endispute", font: { spec: "600 16px 'Cormorant Garamond'", label: "Cormorant Garamond" } },
  ];

  /* WCAG 2.1 relative luminance + contrast — same math as the python script */
  const srgb = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  function lum([r, g, b]) {
    return 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
  }
  function parse(color) {
    const v = (color || "").trim();
    const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = [...h].map((c) => c + c).join("");
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    }
    const rg = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (rg) return [+rg[1], +rg[2], +rg[3]].map(Math.round);
    return null;
  }
  const ratio = (fg, bg) => {
    const f = parse(fg), b = parse(bg);
    if (!f || !b) return NaN;
    const l1 = Math.max(lum(f), lum(b)), l2 = Math.min(lum(f), lum(b));
    return (l1 + 0.05) / (l2 + 0.05);
  };

  const tok = (doc, name) => getComputedStyle(doc.documentElement).getPropertyValue(name).trim();

  async function runChecks() {
    const rows = [];
    const add = (ok, label, detail) => rows.push({ ok, label, detail });
    const primaries = [], bgs = [];

    for (const t of THEMES) {
      const frame = document.querySelector(`iframe[data-theme-frame="${t.id}"]`);
      if (!frame?.contentDocument) { add(false, `${t.id}: frame present`, "missing iframe"); continue; }
      const doc = frame.contentDocument;

      add(doc.documentElement.dataset.theme === t.id,
          `${t.id}: data-theme applied`, `attr=${doc.documentElement.dataset.theme}`);

      const primary = tok(doc, "--lime"), bg = tok(doc, "--bg");
      const text = tok(doc, "--text"), faint = tok(doc, "--faint");
      const onAccent = tok(doc, "--on-accent"), onWarn = tok(doc, "--on-warn");
      const urgency = tok(doc, "--urgency");
      primaries.push(primary); bgs.push(bg);

      add(!!primary && !!bg, `${t.id}: core tokens resolve`, `primary=${primary} bg=${bg}`);

      const pairs = [
        ["text on bg",        text,     bg,         4.5],
        ["faint on bg",       faint,    bg,         4.5],
        ["primary on bg",     primary,  bg,         3.0],
        ["on-accent on primary", onAccent, primary, 4.5],
        ["on-warn on urgency",   onWarn,  urgency,  4.5],
      ];
      for (const [name, fg, bgc, need] of pairs) {
        const r = ratio(fg, bgc);
        add(r >= need, `${t.id}: ${name} ≥ ${need}`, `${fg} on ${bgc} → ${r.toFixed(2)}:1`);
      }

      if (doc.fonts) {
        const loaded = doc.fonts.check(t.font.spec);
        add(loaded, `${t.id}: display font loaded`, `${t.font.label} — ${t.font.spec}`);
      }
    }

    add(new Set(primaries).size === THEMES.length,
        `distinct --primary across ${THEMES.length} themes`, primaries.join(" "));
    add(new Set(bgs).size === THEMES.length,
        `distinct --bg across ${THEMES.length} themes`, bgs.join(" "));

    const fails = rows.filter((r) => !r.ok).length;
    return { pass: fails === 0, fails, total: rows.length, rows };
  }

  /* render into #checksOut */
  async function render() {
    const out = document.getElementById("checksOut");
    const sum = document.getElementById("checksSummary");
    const btn = document.getElementById("runChecks");
    if (!out || !btn) return null;
    btn.disabled = true; btn.textContent = "… running";
    sum.textContent = ""; sum.className = "st-checks__sum";
    out.innerHTML = '<p class="st-note">reading frames…</p>';
    const res = await runChecks();
    btn.disabled = false; btn.textContent = "▸ Run checks";
    sum.textContent = res.pass
      ? `✓ ${res.total}/${res.total} checks pass — primaries + surfaces all distinct, AA holds in every theme`
      : `✗ ${res.fails}/${res.total} checks FAIL`;
    sum.className = `st-checks__sum ${res.pass ? "is-pass" : "is-fail"}`;
    out.innerHTML = `<table class="st-table"><thead><tr><th>result</th><th>check</th><th>detail</th></tr></thead><tbody>${
      res.rows.map((r) =>
        `<tr><td class="${r.ok ? "ok" : "bad"}">${r.ok ? "✓" : "✗ FAIL"}</td>` +
        `<td class="mut">${r.label}</td><td>${r.detail}</td></tr>`).join("")
    }</tbody></table>`;
    return res;
  }

  window.__rwfStylesVerify = runChecks; // headless hook (returns plain JSON)
  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("runChecks")?.addEventListener("click", () => render());
  });
})();
