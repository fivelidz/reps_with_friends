/* RWF · review.js — the /styles review layer (2026-09-07 founder pass).
    Three things the founder asked for, on top of gallery.js:
    · HEADER DIET — the long page description moved out of the header into
      a "?" sheet (open/close/esc/backdrop).
    · 📱 PHONE REVIEW MODE — a full-screen client-review experience: the
      whole screen wears the theme (a real app-screen render inside via
      appdemo.html?bare=1), swipe ← → between themes (touch + trackpad +
      arrow keys), momentum swipes, crossfade between slides, progress
      dots, swipe ↑ (or ⊞) back to the gallery, ♥ pick for the shortlist.
      Auto-opens on touch devices; ?review=1 forces it; #review=<id>
      deep-links; exiting sets a sessionStorage flag so reloads don't
      force it back open.
    · ★ SHORTLIST — picks persist in localStorage rwf.styles.shortlist,
      surface at the top of the gallery, and a copy button produces a
      plain-text summary (names + describe-it lines) for pasting into
      chat — the thing you hand to the client.
    No app logic beyond this layer. */
(() => {
  "use strict";

  const THEMES = window.__rwfStyles?.THEMES ?? [];
  const N = THEMES.length;
  const LS_KEY = "rwf.styles.shortlist";
  const SS_KEY = "rwf.styles.switcher";

  /* ════════════ shortlist model ════════════ */

  const readPicks = () => {
    try {
      const v = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      return Array.isArray(v) ? v.filter((id) => THEMES.some((t) => t.id === id)) : [];
    } catch { return []; }
  };
  const writePicks = (ids) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(ids)); } catch {}
    renderShortlist();
    refreshPickUI();
  };
  const pick = (id) => { const p = readPicks(); if (!p.includes(id)) { p.push(id); writePicks(p); } };
  const unpick = (id) => writePicks(readPicks().filter((x) => x !== id));
  const togglePick = (id) => (readPicks().includes(id) ? unpick(id) : pick(id));

  const shortlistText = () => {
    const p = readPicks().map((id) => THEMES.find((t) => t.id === id));
    const lines = p.map((t, i) =>
      `${i + 1} · ${t.name}${t.origin ? ` (from ${t.origin})` : ""} — ${t.desc}`);
    return [
      `RWF · theme shortlist — ${p.length} picked for review`, "",
      ...(lines.length ? lines : ["(nothing picked yet)"]), "",
      "See them live: rwf.qalarc.com/styles — 📱 Review mode, ♥ to pick.",
    ].join("\n");
  };

  /* ════════════ the ? sheet ════════════ */

  const sheet = document.getElementById("stSheet");
  const helpBtn = document.getElementById("stHelp");
  let sheetOpen = false;

  function openSheet() {
    if (!sheet || sheetOpen) return;
    sheetOpen = true;
    sheet.hidden = false;
    helpBtn?.setAttribute("aria-expanded", "true");
  }
  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    sheet.hidden = true;
    helpBtn?.setAttribute("aria-expanded", "false");
  }
  helpBtn?.addEventListener("click", () => (sheetOpen ? closeSheet() : openSheet()));
  sheet?.querySelectorAll("[data-sheet-close]").forEach((el) =>
    el.addEventListener("click", closeSheet));

  /* ════════════ shortlist row in the gallery ════════════ */

  const shortSec = document.getElementById("shortlist");
  const shortList = document.getElementById("shortlistList");
  const shortN = document.getElementById("shortlistN");

  function renderShortlist() {
    if (!shortSec) return;
    const p = readPicks();
    shortSec.hidden = p.length === 0;
    shortN.textContent = p.length ? `— ${p.length}` : "";
    shortList.innerHTML = p.map((id) => {
      const t = THEMES.find((x) => x.id === id);
      if (!t) return "";
      /* the theme's own primary, resolved the same way gallery.js does */
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;left:-9999px;top:0;pointer-events:none";
      probe.setAttribute("data-theme", id);
      document.body.appendChild(probe);
      const dot = getComputedStyle(probe).getPropertyValue("--lime").trim();
      probe.remove();
      return `
        <button class="st-short__chip" type="button" data-short-pick="${id}" title="Preview ${t.name}">
          <i style="background:${dot}"></i>
          <span><b>${t.name}</b><small>${id}${t.origin ? ` · from ${t.origin}` : ""}</small></span>
          <span class="st-short__rm" data-short-rm="${id}" role="button" tabindex="-1" title="Remove ${t.name}">✕</span>
        </button>`;
    }).join("");
  }

  shortList?.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-short-rm]");
    if (rm) { e.stopPropagation(); unpick(rm.dataset.shortRm); return; }
    const chip = e.target.closest("[data-short-pick]");
    if (chip && window.__rwfStyles?.enterPreview) window.__rwfStyles.enterPreview(chip.dataset.shortPick);
  });

  const copyBtn = document.getElementById("shortlistCopy");
  copyBtn?.addEventListener("click", async () => {
    const text = shortlistText();
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand("copy");
      ta.remove();
    }
    if (!copied || !copyBtn) return;
    copyBtn.textContent = "✓ copied — paste into chat";
    copyBtn.classList.add("is-copied");
    window.setTimeout(() => {
      copyBtn.textContent = "⧉ Copy summary for chat";
      copyBtn.classList.remove("is-copied");
    }, 1600);
  });
  document.getElementById("shortlistClear")?.addEventListener("click", () => writePicks([]));

  /* ════════════ 📱 phone review mode ════════════ */

  const sw = document.getElementById("switcher");
  const stage = document.getElementById("swStage");
  const layers = ["swLayerA", "swLayerB", "swLayerC"].map((id) => document.getElementById(id));
  const nameEl = document.getElementById("swName");
  const descEl = document.getElementById("swDesc");
  const countEl = document.getElementById("swCount");
  const pickBtn = document.getElementById("swPick");
  const dotsEl = document.getElementById("swDots");

  let cur = 0;
  let swOpen = false;
  let animating = false;
  const layerOf = new Map();          // theme index → layer element (mounted slides)

  const frameHTML = (t) =>
    `<iframe class="sw__frame" title="${t.name} — the app wearing this theme"
             src="appdemo.html?t=${t.id}&screen=home&bare=1"></iframe>`;

  function fill(layer, i) {
    if (!layer) return;
    layer.dataset.swIdx = String(i);
    layer.innerHTML = frameHTML(THEMES[i]);
    layerOf.set(i, layer);
  }
  function clearLayer(layer) {
    if (!layer) return;
    if (layer.dataset.swIdx !== "") layerOf.delete(Number(layer.dataset.swIdx));
    layer.dataset.swIdx = "";
    layer.innerHTML = "";             // unmount far iframes — 3 mounted max
    layer.className = "sw__slide";
    layer.style.transform = "";
  }
  /* keep cur ± 1 preloaded on the free layer — swipes never wait on a load */
  function preload() {
    const want = new Set([cur, (cur + 1) % N, (cur - 1 + N) % N]);
    for (const layer of layers) {
      const i = layer.dataset.swIdx;
      if (i !== "" && !want.has(Number(i))) clearLayer(layer);
    }
    for (const i of want) {
      if (!layerOf.has(i)) fill(layers.find((l) => l.dataset.swIdx === "") ?? layers[1], i);
    }
  }

  function refreshDots() {
    dotsEl?.querySelectorAll("[data-sw-dot]").forEach((d) => {
      const i = Number(d.dataset.swDot);
      d.classList.toggle("is-on", i === cur);
      d.classList.toggle("is-picked", readPicks().includes(THEMES[i].id));
    });
  }
  function refreshPickUI() {
    if (!pickBtn) return;
    const id = THEMES[cur]?.id;
    const picked = !!id && readPicks().includes(id);
    pickBtn.setAttribute("aria-pressed", String(picked));
    pickBtn.innerHTML =
      `<span class="sw__heart">${picked ? "♥" : "♡"}</span> ${picked ? "Picked ✓" : "Pick for review"}`;
    if (swOpen) refreshDots();
  }

  function syncChrome() {
    const t = THEMES[cur];
    sw.dataset.theme = t.id;          // the WHOLE overlay wears the theme
    nameEl.textContent = t.name;
    descEl.textContent = t.desc;
    countEl.textContent = `${cur + 1} / ${N}`;
    refreshDots();
    refreshPickUI();
    if (history.replaceState) history.replaceState(null, "", `#review=${t.id}`);
  }

  /* crossfade: current slide eases out in the swipe direction, the
     (preloaded) incoming slide fades in from the opposite offset */
  function go(i, dir = 0) {
    i = ((i % N) + N) % N;
    if (i === cur || animating) return;
    let to = layerOf.get(i);
    if (!to) {
      const from = layerOf.get(cur);
      const free = layers.find((l) => l !== from && l.dataset.swIdx === "") ?? layers.find((l) => l !== from);
      fill(free, i);
      to = layerOf.get(i);
    }
    const from = layerOf.get(cur);
    animating = true;
    if (from) {
      from.style.transform = "";                    // release any drag offset
      from.classList.remove("is-cur", "is-drag");
      from.classList.add(dir >= 0 ? "is-out-l" : "is-out-r");
    }
    to.classList.remove("is-out-l", "is-out-r");
    to.classList.add("is-cur");
    cur = i;
    syncChrome();
    window.setTimeout(() => {
      if (from) from.classList.remove("is-out-l", "is-out-r");
      animating = false;
      preload();
    }, 340);
  }
  const step = (dir) => go(cur + dir, dir);

  function openSw(i = 0) {
    if (!sw || N === 0) return;
    cur = ((i % N) + N) % N;
    swOpen = true;
    layers.forEach(clearLayer);
    layerOf.clear();
    sw.hidden = false;
    document.body.style.overflow = "hidden";
    fill(layers[0], cur);
    layers[0].classList.add("is-cur");
    syncChrome();
    preload();
  }
  function closeSw() {
    if (!swOpen) return;
    swOpen = false;
    sw.hidden = true;
    document.body.style.overflow = "";
    layers.forEach(clearLayer);
    try { sessionStorage.setItem(SS_KEY, "off"); } catch {}
    if (history.replaceState && location.hash.startsWith("#review=")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    renderShortlist();               // the picks made on the phone surface now
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  /* ── gestures: touch swipes with momentum ── */
  let touching = false, horiz = null, x0 = 0, y0 = 0, dx = 0, dy = 0,
      lastX = 0, lastT = 0, v = 0;

  /* listeners on the whole overlay — the hud panel sits OUTSIDE .sw__stage
     (pointer-events:auto), and swipes often START on it (thumb at the
     bottom of the phone) */
  sw.addEventListener("touchstart", (e) => {
    if (!swOpen || animating) return;
    const t = e.touches[0];
    touching = true; horiz = null; v = 0;
    x0 = lastX = t.clientX; y0 = t.clientY;
    dx = dy = 0; lastT = performance.now();
    layerOf.get(cur)?.classList.add("is-drag");
  }, { passive: true });

  sw.addEventListener("touchmove", (e) => {
    if (!touching) return;
    const t = e.touches[0];
    const now = performance.now();
    if (now - lastT > 4) v = (t.clientX - lastX) / Math.max(1, now - lastT);   // px/ms
    lastX = t.clientX; lastT = now;
    dx = t.clientX - x0; dy = t.clientY - y0;
    if (horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      horiz = Math.abs(dx) > Math.abs(dy);
    }
    if (horiz === true) {
      e.preventDefault();
      const l = layerOf.get(cur);
      if (l) l.style.transform = `translateX(${dx * 0.88}px)`;
    } else if (horiz === false) {
      e.preventDefault();
      if (dy < 0) sw.style.setProperty("--sw-up", String(Math.min(70, -dy * 0.28)));
    }
  }, { passive: false });

  const endTouch = () => {
    if (!touching) return;
    touching = false;
    const l = layerOf.get(cur);
    l?.classList.remove("is-drag");
    sw.style.removeProperty("--sw-up");
    const w = stage.clientWidth || 390;
    const fast = Math.abs(v) > 0.35;
    if (horiz !== true) {
      /* vertical: up-swipe exits to the gallery */
      if (dy < -60 || (v < -0.6 && dy < -24)) { closeSw(); return; }
      return;
    }
    if (dx < 0 && (Math.abs(dx) > w * 0.26 || (fast && v < -0.35))) step(1);
    else if (dx > 0 && (dx > w * 0.26 || (fast && v > 0.35))) step(-1);
    else if (l) l.style.transform = "";            // spring back — not far enough
  };
  sw.addEventListener("touchend", endTouch);
  sw.addEventListener("touchcancel", endTouch);

  /* ── trackpad: horizontal scroll steps, scroll-up exits ── */
  let wheelLock = 0;
  sw.addEventListener("wheel", (e) => {
    if (!swOpen) return;
    const now = performance.now();
    if (now - wheelLock < 240) { e.preventDefault(); return; }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 16) {
      e.preventDefault(); wheelLock = now;
      step(e.deltaX > 0 ? 1 : -1);
    } else if (e.deltaY < -36) {
      e.preventDefault(); wheelLock = now;
      closeSw();
    }
  }, { passive: false });

  /* ── keyboard — gallery.js defers to us while a modal is open ── */
  addEventListener("keydown", (e) => {
    if (e.target?.matches?.("input,textarea,select")) return;
    if (sheetOpen && e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
    if (!swOpen) return;
    if (e.key === "Escape") { e.preventDefault(); closeSw(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  });

  /* ── chrome wiring ── */
  document.getElementById("reviewOpen")?.addEventListener("click", () => {
    const firstPick = readPicks()[0];
    const i = firstPick ? THEMES.findIndex((t) => t.id === firstPick) : cur;
    openSw(i >= 0 ? i : 0);
  });
  document.getElementById("swExit")?.addEventListener("click", closeSw);
  pickBtn?.addEventListener("click", () => togglePick(THEMES[cur]?.id));

  dotsEl?.addEventListener("click", (e) => {
    const d = e.target.closest("[data-sw-dot]");
    if (d) go(Number(d.dataset.swDot), Number(d.dataset.swDot) > cur ? 1 : -1);
  });
  function buildDots() {
    if (!dotsEl) return;
    dotsEl.innerHTML = THEMES.map((t, i) =>
      `<button class="sw__dot" data-sw-dot="${i}" type="button" aria-label="${t.name}"></button>`).join("");
  }
  buildDots();

  /* cross-tab / cross-mode sync */
  addEventListener("storage", (e) => { if (e.key === LS_KEY) renderShortlist(); });

  /* ── auto-open on touch devices ──
     coarse primary pointer (phones, tablets), or touch + a small viewport
     (covers browsers that report fine pointer with touch). NOT plain
     touch laptops. ?review=1 forces it; an exit this session suppresses
     it until the tab is closed. */
  const dismissed = () => { try { return sessionStorage.getItem(SS_KEY) === "off"; } catch { return false; } };
  const forced = new URLSearchParams(location.search).get("review") === "1";
  const hashMatch = location.hash.match(/^#review=(\w+)$/);
  const hashIdx = hashMatch ? THEMES.findIndex((t) => t.id === hashMatch[1]) : -1;
  const coarse = matchMedia("(pointer: coarse)").matches ||
    ((navigator.maxTouchPoints ?? 0) > 0 && Math.min(screen.width, screen.height) <= 500);
  /* note: exitPreview leaves the hash as bare "#", which is still "empty" */
  const hashEmpty = location.hash === "" || location.hash === "#";
  const shouldAuto = coarse && !dismissed() && hashEmpty;

  if (forced || shouldAuto) {
    const start = hashIdx >= 0 ? hashIdx
      : (readPicks()[0] ? THEMES.findIndex((t) => t.id === readPicks()[0]) : 0);
    openSw(start >= 0 ? start : 0);
  }

  renderShortlist();

  /* e2e hooks */
  window.__rwfReview = {
    open: openSw, close: closeSw, step, go,
    isOpen: () => swOpen, cur: () => cur,
    picks: readPicks, togglePick, pick, unpick, shortlistText,
    sheet: { open: openSheet, close: closeSheet, isOpen: () => sheetOpen },
    modalOpen: () => swOpen || sheetOpen,
    autoWanted: () => shouldAuto,
  };
  window.__rwfReviewReady = true;
})();
