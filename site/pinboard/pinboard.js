/* Pinboard wall — renders manifest.json as grouped masonry + tag filters + lightbox.
   v2 (2026-09-03): primary source = founder's saved secret board
   ("Reps With Friends ideation", 39 pins, complete); earlier 22-pin public
   board/profile scrape merged after (zero overlap by pin id + image signature).
   No deps; images + manifest sit next to this file. */
(() => {
  const $ = (id) => document.getElementById(id);
  let pins = [];
  let cur = -1;
  let activeTag = "all";

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
    el.dataset.tag = p.tag;
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

  function groupHead(label, sub) {
    const h = document.createElement("div");
    h.className = "group-head";
    h.innerHTML = `<p class="group-label">${esc(label)}</p><p class="group-sub">${esc(sub)}</p>`;
    return h;
  }

  function applyFilter() {
    document.querySelectorAll("#grid .card").forEach((c) => {
      c.hidden = activeTag !== "all" && c.dataset.tag !== activeTag;
    });
    document.querySelectorAll("#wallTags .chip[data-tag]").forEach((c) => {
      c.classList.toggle("chip--active", c.dataset.tag === activeTag);
    });
    document.querySelectorAll("#grid .group-head").forEach((h) => {
      /* hide a group head if every card after it (until next head) is hidden */
      let el = h.nextElementSibling, vis = 0;
      while (el && !el.classList.contains("group-head")) {
        if (el.classList.contains("card") && !el.hidden) vis++;
        el = el.nextElementSibling;
      }
      h.hidden = vis === 0;
    });
  }

  function show(i) {
    const p = pins[i];
    if (!p) return;
    cur = i;
    $("lbImg").src = BASE + p.file;
    $("lbImg").alt = p.title || "design reference";
    $("lbCount").textContent = `${String(cur + 1).padStart(2, "0")} / ${String(pins.length).padStart(2, "0")}`;
    $("lbTitle").textContent = p.title || "—";
    $("lbDesc").textContent = [p.notes, p.description].filter(Boolean).join(" — ");
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

  function step(dir) {
    const cards = [...document.querySelectorAll("#grid .card")].filter((c) => !c.hidden);
    if (!cards.length) return;
    const idxs = cards.map((c) => Number(c.getAttribute("aria-label").match(/open pin (\d+):/)[1]) - 1);
    let pos = idxs.indexOf(cur);
    if (pos === -1) pos = dir > 0 ? 0 : idxs.length - 1;
    else pos = (pos + (dir > 0 ? 1 : -1) + idxs.length) % idxs.length;
    show(idxs[pos]);
  }

  fetch(BASE + "manifest.json")
    .then((r) => {
      if (!r.ok) throw new Error(`manifest ${r.status}`);
      return r.json();
    })
    .then((m) => {
      pins = m.images || [];
      $("wallMeta").textContent =
        ` — ${m.counts.total} images · ${m.ideation_board.pin_count} ideation pins (complete) · updated ${m.scrape_date}`;
      const grid = $("grid");
      const frag = document.createDocumentFragment();

      const ideation = pins.filter((p) => p.source === "ideation board");
      const earlier = pins.filter((p) => p.source !== "ideation board");

      frag.appendChild(groupHead(
        "I. THE IDEATION BOARD — SAVED BY THE FOUNDER",
        `Secret board “${m.ideation_board.name}” · ${m.ideation_board.pin_count} pins, all captured · covers at 736px from the Pinterest CDN`));
      ideation.forEach((p) => {
        const i = pins.indexOf(p);
        frag.appendChild(card(p, i));
      });
      frag.appendChild(groupHead(
        "II. PUBLIC BOARD + PROFILE FEED — EARLIER SCRAPE",
        `22 pins from pinterest.com/bengillies888 public surfaces · original resolution`));
      earlier.forEach((p) => {
        const i = pins.indexOf(p);
        frag.appendChild(card(p, i));
      });
      grid.appendChild(frag);

      const tags = $("wallTags");
      tags.innerHTML =
        `<button class="chip chip--active" data-tag="all">all · ${m.counts.total}</button>` +
        Object.entries(m.counts.by_tag)
          .map(([t, n]) => `<button class="chip" data-tag="${esc(t)}">${esc(t)} · ${n}</button>`)
          .join("");
      tags.hidden = false;
      tags.addEventListener("click", (e) => {
        const b = e.target.closest(".chip[data-tag]");
        if (!b) return;
        activeTag = b.dataset.tag;
        applyFilter();
      });
    })
    .catch((e) => {
      $("wallMeta").textContent = ` — manifest failed: ${e.message}`;
    });

  $("lbClose").addEventListener("click", hide);
  $("lbPrev").addEventListener("click", () => step(-1));
  $("lbNext").addEventListener("click", () => step(1));
  $("lb").addEventListener("click", (e) => {
    if (e.target === $("lb")) hide();
  });
  document.addEventListener("keydown", (e) => {
    if ($("lb").hidden) return;
    if (e.key === "Escape") hide();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
})();
