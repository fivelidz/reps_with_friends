/* Pinboard wall — renders manifest.json as a masonry grid + lightbox.
   No deps; images + manifest sit next to this file. */
(() => {
  const $ = (id) => document.getElementById(id);
  let pins = [];
  let cur = -1;

  /* Manifest + images are resolved against the pinboard base so the page works
     at both /pinboard and /pinboard/ (relative "manifest.json" at the former
     would hit the site's SPA index fallback). */
  const BASE =
    (location.pathname.endsWith("/") ? location.pathname : location.pathname + "/")
      .replace(/\/+$/, "/");

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function card(p, i) {
    const el = document.createElement("div");
    el.className = "card";
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `open pin ${i + 1}: ${p.title || p.tag}`);
    el.innerHTML = `
      <img src="${BASE + p.file}" alt="${esc(p.title || "design reference " + (i + 1))}" loading="lazy" decoding="async" />
      <div class="card-cap">
        ${p.title ? `<div class="card-title">${esc(p.title)}</div>` : ""}
        <div class="card-row">
          <span class="chip">${esc(p.tag)}</span>
          <span class="chip chip--dim">${esc(p.source)}</span>
          ${p.is_video ? `<span class="chip chip--dim">video cover</span>` : ""}
        </div>
      </div>`;
    const open = () => show(i);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
    return el;
  }

  function show(i) {
    cur = (i + pins.length) % pins.length;
    const p = pins[cur];
    $("lbImg").src = BASE + p.file;
    $("lbImg").alt = p.title || "design reference";
    $("lbCount").textContent = `${String(cur + 1).padStart(2, "0")} / ${String(pins.length).padStart(2, "0")}`;
    $("lbTitle").textContent = p.title || "—";
    $("lbDesc").textContent = p.notes || p.description || "";
    $("lbTag").textContent = p.tag;
    $("lbSrc").textContent = p.source + (p.is_video ? " · video cover" : "");
    $("lbPin").href = p.pin_url;
    $("lb").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function hide() {
    $("lb").hidden = true;
    $("lbImg").src = "";
    document.body.style.overflow = "";
    cur = -1;
  }

  fetch(BASE + "manifest.json")
    .then((r) => {
      if (!r.ok) throw new Error(`manifest ${r.status}`);
      return r.json();
    })
    .then((m) => {
      pins = m.images || [];
      $("wallMeta").textContent =
        ` — ${m.counts.total} images · scraped ${m.scrape_date}`;
      const grid = $("grid");
      const frag = document.createDocumentFragment();
      pins.forEach((p, i) => frag.appendChild(card(p, i)));
      grid.appendChild(frag);

      const tags = $("wallTags");
      tags.innerHTML = Object.entries(m.counts.by_tag)
        .map(([t, n]) => `<span class="chip">${esc(t)} · ${n}</span>`)
        .join("");
      tags.hidden = false;
    })
    .catch((e) => {
      $("wallMeta").textContent = ` — manifest failed: ${e.message}`;
    });

  $("lbClose").addEventListener("click", hide);
  $("lbPrev").addEventListener("click", () => show(cur - 1));
  $("lbNext").addEventListener("click", () => show(cur + 1));
  $("lb").addEventListener("click", (e) => {
    if (e.target === $("lb")) hide();
  });
  document.addEventListener("keydown", (e) => {
    if ($("lb").hidden) return;
    if (e.key === "Escape") hide();
    if (e.key === "ArrowLeft") show(cur - 1);
    if (e.key === "ArrowRight") show(cur + 1);
  });
})();
