/* ═══════════════════════════════════════════════════════════════════════
   RWF /POWERUPS — the review page logic
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   Everything on the page is READ FROM THE ENGINE (apps/sot-engine.js —
   imported as /powerups/sot-engine.js, same mapping serve.ts uses for
   /v4): the card catalog, families, rarities, targets, expiries,
   counters, the draft economy constants and the catch-up curve. Nothing
   about the cards is hardcoded here.

   Art comes from the committed gen/ assets (site/powerup-art/gen/):
     gen/<style>/<card>.svg  · gen/<style>/_back.svg · gen/chips/<id>.png

   Founder feedback (💛 like + 💬 note per card) persists in
   localStorage — the styles-shortlist pattern — with a one-tap
   "copy feedback" export so it can ride a message back to the team.

   Style switching: ← → keys + tap (the /styles pattern); Review mode
   adds swipe. Zero deps.
   ═══════════════════════════════════════════════════════════════════════ */
import {
  CARD_CATALOG, HAND_CAP, REROLL_COSTS, BASE_DRAFT_ODDS,
  CATCH_UP_MAX_SHIFT, defaultCatchUpCurve,
} from "/powerups/sot-engine.js";

/* ── the style kits (mirror of styles.js — id, name, tagline) ───────── */
const STYLES = [
  { id: "poster",     name: "Poster",        tag: "the house style" },
  { id: "varsity",    name: "Varsity Badge", tag: "stitched felt patch" },
  { id: "risograph",  name: "Risograph",     tag: "two-ink print run" },
  { id: "gold-etch",  name: "Gold Etching",  tag: "engraved on ink" },
  { id: "halftone",   name: "Halftone Comic", tag: "ben-day action print" },
  { id: "neon",       name: "Neon Arena",    tag: "lights on the dark" },
  { id: "boxing",     name: "Boxing Poster", tag: "aged letterpress" },
];
const STYLE_DESCS = {
  poster: "The master sports-poster treatment — speed-line halo, chromatic misregistration, halftone shade, thick keyline. Feeds the v3 card faces and the v4 chips.",
  varsity: "College colours on a felt circle: chenille stitch rings, chain-stitch border, star pips and a blank winner's banner.",
  risograph: "Riso blue + alarm red on cream, printed out of register with real paper grain. The zine-shop look.",
  "gold-etch": "The trophy-room plate: gold linework engraved into deep ink, hatch fields, filigree corners, double rules.",
  halftone: "Silver-age comic panel: ben-day dot field, sticker-gap ink over a comic burst, heavy blacks, one alarm-yellow spot.",
  neon: "The 11pm arena: floodlight beams, floor grid, the glyph burning in layered neon under a hot white core.",
  boxing: "Turn-of-the-century fight bill: letterpress ink double-struck on aged paper, oxblood accents, rosette corners, honest wear.",
};

const RARITY = {
  common:    { hex: "#9aa7a0", label: "COMMON" },
  rare:      { hex: "#6ec1ff", label: "RARE" },
  epic:      { hex: "#b78cff", label: "EPIC" },
  legendary: { hex: "#ffc941", label: "LEGENDARY" },
};
const FAMILIES = [
  { id: "canon", label: "The Launch Four", blurb: "SOT canon — the cards the spec launches with." },
  { id: "post-launch", label: "Series 2 · Post-Launch", blurb: "Specced in the same breath — bombs, ropes, boosts, bashes." },
  { id: "exercise", label: "Exercise", blurb: "Making an exercise worth more — the founder's own lane." },
  { id: "rivalry", label: "Rivalry", blurb: "Making a relationship worth more — rivals, partners, packs." },
  { id: "proof", label: "Proof", blurb: "Integrity cards — trust is the game (SOT §2.11)." },
  { id: "catch-up", label: "Catch-Up", blurb: "The comeback lane — never shame, always a route back." },
];

/* ── state ──────────────────────────────────────────────────────────── */
/* CARD_CATALOG entries key on `kind` (the engine's canonical name);
   normalize to `id` here so the page speaks one dialect. */
const CARDS = Object.values(CARD_CATALOG).map((c) => ({ ...c, id: c.kind }));
const LS_FB = "rwf.powerups.feedback.v1";
const LS_STYLE = "rwf.powerups.style";
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let feedback = load(LS_FB, {});
let styleIdx = Math.max(0, STYLES.findIndex((s) => s.id === load(LS_STYLE, "poster")));
let reviewIdx = 0;
let reviewBack = false;
let openCardId = null;

const GEN = "/site/powerup-art/gen";
const artUrl = (id, sid = STYLES[styleIdx].id) => `${GEN}/${sid}/${id}.svg`;
const backUrl = (sid = STYLES[styleIdx].id) => `${GEN}/${sid}/_back.svg`;
const chipUrl = (id) => `${GEN}/chips/${id}.png`;

/* ── tiny dom helper (the house pattern) ────────────────────────────── */
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
}
const $ = (sel) => document.querySelector(sel);

/* ── style rail ─────────────────────────────────────────────────────── */
function buildRail() {
  const rail = $("#puRail");
  rail.innerHTML = "";
  rail.append(el("span", { class: "pu-rail__kbd" }, "← → styles"));
  for (const [i, s] of STYLES.entries()) {
    rail.append(el("button", {
      class: "pu-chip" + (i === styleIdx ? " is-on" : ""),
      "data-style": s.id,
      type: "button",
      onclick: () => setStyle(i),
    }, s.name, el("small", {}, s.tag)));
  }
}
function setStyle(i, opts = {}) {
  styleIdx = ((i % STYLES.length) + STYLES.length) % STYLES.length;
  save(LS_STYLE, STYLES[styleIdx].id);
  document.documentElement.dataset.style = STYLES[styleIdx].id;
  buildRail();
  for (const img of document.querySelectorAll("img[data-art]")) {
    img.src = img.dataset.back ? backUrl() : artUrl(img.dataset.art);
  }
  if (!opts.silent) renderAll();   // refresh tiles (art urls + hearts)
  if (openCardId) fillDetail(openCardId);
  if (!$("#puReview").hidden) fillReview();
}

/* ── family sections + tiles ────────────────────────────────────────── */
function tile(card) {
  const fb = feedback[card.id] ?? {};
  const rar = RARITY[card.rarity] ?? RARITY.common;
  return el("figure", { class: `pcard r-${card.rarity}`, "data-card": card.id, style: "margin:0" },
    el("div", { class: "pcard__art", onclick: () => openDetail(card.id) },
      el("img", { src: artUrl(card.id), "data-art": card.id, alt: `${card.name} — ${STYLES[styleIdx].name} art`, loading: "lazy" }),
      el("span", { class: "pcard__rar" }, rar.label),
      el("button", {
        class: "pcard__like" + (fb.like ? " is-on" : ""),
        type: "button", title: "like this card's art",
        onclick: (e) => { e.stopPropagation(); toggleLike(card.id); },
      }, fb.like ? "💛" : "🤍"),
      fb.note ? el("span", { class: "pcard__note-ico", title: fb.note }, "💬") : null
    ),
    el("figcaption", { class: "pcard__body" },
      el("div", { class: "pcard__name", onclick: () => openDetail(card.id) }, card.name),
      el("div", { class: "pcard__meta" }, `${card.target ?? "self"} · ${card.expiry ?? "end of day"}`)));
}
function buildSections() {
  const main = $("#puMain");
  main.innerHTML = "";
  for (const fam of FAMILIES) {
    const famCards = CARDS.filter((c) => c.family === fam.id);
    if (!famCards.length) continue;
    main.append(el("section", { class: "pu-family", "data-family": fam.id },
      el("div", { class: "pu-family__head" },
        el("h2", { class: "pu-h2" }, fam.label),
        el("span", { class: "pu-family__badge" }, `${famCards.length} cards`)),
      el("p", { class: "pu-family__blurb" }, fam.blurb),
      el("div", { class: "pu-grid" }, famCards.map(tile))));
  }
}

/* ── draft rules (engine numbers only) ──────────────────────────────── */
function buildDraft() {
  const grid = $("#puDraftGrid");
  grid.innerHTML = "";
  const rule = (k, v, s) => el("div", { class: "pu-rule" },
    el("div", { class: "pu-rule__k" }, k), el("div", { class: "pu-rule__v" }, v), el("div", { class: "pu-rule__s" }, s));
  grid.append(
    rule("the deal", "3 cards", "face-down candidates, dealt to every player at day open + the earned halfway deal"),
    rule("hand cap", `${HAND_CAP} cards`, "a full hand blocks the next deal — play a card first"),
    rule("reroll pot", REROLL_COSTS.join(" → ") + " pts", "each reroll drops the cost into the pot, then holds"),
    rule("catch-up", `+${Math.round(CATCH_UP_MAX_SHIFT * 100)}% shift`, "behind players draft hotter — linear, capped"),
  );
  // the curve table — computed, not restated
  const curve = $("#puCurve");
  const rows = [0, 0.25, 0.5, 0.75, 1].map((b) => {
    const o = defaultCatchUpCurve(b);
    const max = Math.max(...Object.values(o));
    const cell = (r) => el("td", {},
      `${Math.round(o[r] * 100)}%`,
      el("span", { class: `bar b-${r}`, style: `width:${Math.round((o[r] / max) * 46)}px` }));
    return el("tr", {}, el("td", {}, b === 0 ? "level" : `${Math.round(b * 100)}% behind`), cell("common"), cell("rare"), cell("epic"), cell("legendary"));
  });
  curve.innerHTML = "";
  curve.append(el("table", {},
    el("thead", {}, el("tr", {}, el("th", {}, "catch-up position"), el("th", {}, "common"), el("th", {}, "rare"), el("th", {}, "epic"), el("th", {}, "legendary"))),
    el("tbody", {}, rows)));
}

/* ── card detail overlay ────────────────────────────────────────────── */
function openDetail(id) { openCardId = id; fillDetail(id); $("#puOv").hidden = false; }
function closeDetail() { openCardId = null; $("#puOv").hidden = true; }
function fillDetail(id) {
  const card = CARD_CATALOG[id];
  if (!card) return;
  const fb = feedback[id] ?? {};
  const rar = RARITY[card.rarity] ?? RARITY.common;
  const panel = $("#puOvPanel");
  panel.innerHTML = "";
  let showingBack = false;
  const img = el("img", { src: artUrl(id), "data-art": id, alt: `${card.name} art` });
  const art = el("div", {
    class: "pu-detail__art", title: "tap to flip",
    onclick: () => { showingBack = !showingBack; img.src = showingBack ? backUrl() : artUrl(id); img.removeAttribute("data-art"); if (!showingBack) img.setAttribute("data-art", id); },
  }, img, el("button", { class: "pu-detail__flip", type: "button", onclick: (e) => { e.stopPropagation(); art.click(); } }, "↻ front / back"));
  panel.append(el("div", { class: "pu-detail__top" },
    art,
    el("div", {},
      el("h3", { class: "pu-detail__name" }, card.name),
      el("div", { class: "pu-detail__chips" },
        el("span", { class: "pu-chipx rp", style: `color:${rar.hex};border-color:${rar.hex}66` }, rar.label),
        el("span", { class: "pu-chipx" }, card.family),
        el("span", { class: "pu-chipx" }, "kind: " + card.kind)),
      el("p", { class: "pu-detail__blurb" }, card.blurb),
      el("div", { class: "pu-drow" }, el("b", {}, "target"), el("span", {}, card.target ?? "self")),
      el("div", { class: "pu-drow" }, el("b", {}, "expiry"), el("span", {}, card.expiry ?? "end of day")),
      el("div", { class: "pu-drow" }, el("b", {}, "counters"), el("span", {}, card.counters ?? "none")))));
  const note = el("textarea", {
    placeholder: "note to the studio — what works, what to push (saved on this device)",
    oninput: () => { setNote(id, note.value); },
  });
  note.value = fb.note ?? "";
  panel.append(el("div", { class: "pu-fb" },
    el("button", {
      class: "pu-fb__like" + (fb.like ? " is-on" : ""), type: "button",
      onclick: () => { toggleLike(id); const f = feedback[id] ?? {}; document.querySelectorAll(".pu-fb__like").forEach((b) => { b.classList.toggle("is-on", !!f.like); b.textContent = f.like ? "💛 liked" : "🤍 like"; }); },
    }, (fb.like ? "💛 liked" : "🤍 like")),
    el("label", { class: "pu-fb__note" }, note)));
}

/* ── feedback (the styles-shortlist pattern) ────────────────────────── */
function setFb(id, patch) {
  feedback = { ...feedback, [id]: { ...(feedback[id] ?? {}), ...patch } };
  if (!feedback[id].like && !feedback[id].note) delete feedback[id];
  save(LS_FB, feedback);
  renderFbar();
}
const toggleLike = (id) => {
  setFb(id, { like: !(feedback[id]?.like) });
  buildSections(); // refresh the tile hearts (cheap — 21 figures)
};
const setNote = (id, text) => {
  setFb(id, { note: text.trim() ? text : undefined });
  // refresh the tile's 💬 marker only
  const t = document.querySelector(`.pcard[data-card="${id}"] .pcard__note-ico`);
  const has = !!(feedback[id]?.note);
  if (has && !t) document.querySelector(`.pcard[data-card="${id}"] .pcard__art`)?.append(el("span", { class: "pcard__note-ico", title: feedback[id].note }, "💬"));
  if (!has && t) t.remove();
};
function renderFbar() {
  const likes = Object.values(feedback).filter((f) => f.like).length;
  const notes = Object.values(feedback).filter((f) => f.note).length;
  const bar = $("#puFbar");
  bar.hidden = !(likes + notes);
  $("#puFbarText").textContent = `${likes} 💛 · ${notes} 💬 captured on this device`;
}
$("#btnFeedbackCopy")?.addEventListener("click", async () => {
  const lines = CARDS.filter((c) => feedback[c.id]).map((c) => {
    const f = feedback[c.id];
    return `- ${c.name} (${c.kind}) — ${f.like ? "LIKE" : "—"}${f.note ? ` — "${f.note}"` : ""}`;
  });
  const text = `RWF power-up art feedback (${STYLES[styleIdx].name}):\n${lines.join("\n")}`;
  try { await navigator.clipboard.writeText(text); $("#btnFeedbackCopy").textContent = "copied ✓"; setTimeout(() => { $("#btnFeedbackCopy").textContent = "copy feedback"; }, 1500); } catch {}
});

/* ── deck sheet ─────────────────────────────────────────────────────── */
function buildDeck() {
  const sheet = $("#puDeckSheet");
  sheet.innerHTML = "";
  $("#deckTitle").textContent = `The deck — ${STYLES[styleIdx].name} · one sheet`;
  const grid = el("div", { class: "pu-deckgrid" });
  for (const c of CARDS) {
    grid.append(el("figure", { class: "pu-deckgrid__cell", style: "margin:0" },
      el("img", { src: artUrl(c.id), "data-art": c.id, alt: c.name, loading: "lazy" }),
      el("figcaption", {}, c.name)));
  }
  sheet.append(grid);
  sheet.append(el("p", { style: "font-size:11px;color:var(--dim);margin:12px 0 0" },
    `${CARDS.length} cards · ${STYLES[styleIdx].name} — ${STYLE_DESCS[STYLES[styleIdx].id]}`));
}
async function downloadDeckPng() {
  // client-side stitch: the committed 512 PNGs of the CURRENT style, labelled
  const size = 512, pad = 10, cap = 56, cols = 5;
  const rows = Math.ceil(CARDS.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * (size + pad) + pad;
  canvas.height = rows * (size + cap + pad) + pad + 90;
  const g = canvas.getContext("2d");
  g.fillStyle = "#0a0c11"; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#ffc941"; g.font = "700 44px Archivo, sans-serif";
  g.fillText(`RWF POWER-UPS — ${STYLES[styleIdx].name.toUpperCase()}`, pad + 6, 62);
  const imgs = await Promise.all(CARDS.map((c) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = `${GEN}/${STYLES[styleIdx].id}/${c.id}.png`;
  })));
  g.font = "600 26px Archivo, sans-serif";
  imgs.forEach((im, i) => {
    const x = pad + (i % cols) * (size + pad);
    const y = 90 + pad + Math.floor(i / cols) * (size + cap + pad);
    if (im) g.drawImage(im, x, y, size, size);
    g.fillStyle = "#9aa3ad";
    g.fillText(CARDS[i].name.toUpperCase(), x + 4, y + size + 38);
    g.fillStyle = "#9aa3ad";
  });
  const a = document.createElement("a");
  a.download = `rwf-powerups-${STYLES[styleIdx].id}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

/* ── review mode (fullscreen swipe deck — the /styles pattern) ──────── */
function openReview(i = 0) {
  reviewIdx = i; reviewBack = false;
  $("#puReview").hidden = false;
  document.body.style.overflow = "hidden";
  fillReview();
}
function closeReview() { $("#puReview").hidden = true; document.body.style.overflow = ""; }
function fillReview() {
  const card = CARDS[reviewIdx];
  const fb = feedback[card.id] ?? {};
  const rar = RARITY[card.rarity] ?? RARITY.common;
  const stage = $("#rvStage");
  stage.innerHTML = "";
  stage.append(el("div", { class: "rv-card" },
    el("img", {
      src: reviewBack ? backUrl() : artUrl(card.id),
      "data-art": reviewBack ? null : card.id,
      "data-back": reviewBack ? "1" : null,
      alt: card.name,
      onclick: () => { reviewBack = !reviewBack; fillReview(); },
    }),
    el("div", { class: "rv-meta" },
      el("div", { class: "rv-meta__name", style: `color:${rar.hex}` }, card.name),
      el("div", { class: "rv-meta__sub" }, `${rar.label} · ${card.family} · target ${card.target} · ${card.expiry}`),
      el("div", { class: "rv-meta__blurb" }, card.blurb)),
    el("div", { class: "rv-fb" },
      el("button", {
        class: "rv-fb__like" + (fb.like ? " is-on" : ""), type: "button",
        onclick: () => { toggleLike(card.id); fillReview(); },
      }, fb.like ? "💛 liked" : "🤍 like"),
      el("textarea", {
        placeholder: "note…", rows: 1,
        oninput: (e) => setNote(card.id, e.target.value),
      }, /* value via prop below */))));
  const ta = stage.querySelector("textarea");
  ta.value = fb.note ?? "";
  $("#rvCount").textContent = `${reviewIdx + 1} / ${CARDS.length}`;
  const dots = $("#rvDots");
  dots.innerHTML = "";
  CARDS.forEach((c, i) => dots.append(el("span", { class: i === reviewIdx ? "is-on" : "", title: c.name, onclick: () => { reviewIdx = i; reviewBack = false; fillReview(); } })));
}
function reviewGo(dir) {
  reviewIdx = ((reviewIdx + dir) % CARDS.length + CARDS.length) % CARDS.length;
  reviewBack = false;
  fillReview();
}

/* swipe (touch + pointer drag, the review.js approach) */
let swipeX0 = null;
$("#rvStage").addEventListener("pointerdown", (e) => { swipeX0 = e.clientX; });
$("#rvStage").addEventListener("pointerup", (e) => {
  if (swipeX0 == null) return;
  const dx = e.clientX - swipeX0;
  swipeX0 = null;
  if (Math.abs(dx) > 46) reviewGo(dx < 0 ? 1 : -1);
});

/* ── keyboard ───────────────────────────────────────────────────────── */
document.addEventListener("keydown", (e) => {
  if (!$("#puReview").hidden) {
    if (e.key === "ArrowRight") reviewGo(1);
    else if (e.key === "ArrowLeft") reviewGo(-1);
    else if (e.key === "Escape") closeReview();
    return;
  }
  if (e.key === "Escape") { closeDetail(); $("#puSheet").hidden = true; $("#puDeckOv").hidden = true; return; }
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  if (e.key === "ArrowRight") setStyle(styleIdx + 1);
  else if (e.key === "ArrowLeft") setStyle(styleIdx - 1);
});

/* ── chrome wiring ──────────────────────────────────────────────────── */
$("#btnHelp").addEventListener("click", () => { $("#puSheet").hidden = !$("#puSheet").hidden; });
$("#btnReview").addEventListener("click", () => openReview(0));
$("#btnReviewExit").addEventListener("click", closeReview);
$("#btnSheet").addEventListener("click", () => { buildDeck(); $("#puDeckOv").hidden = false; });
$("#btnDeckClose").addEventListener("click", () => { $("#puDeckOv").hidden = true; });
$("#btnDeckPrint").addEventListener("click", () => window.print());
$("#btnDeckPng").addEventListener("click", downloadDeckPng);
for (const [sel, fn] of [["[data-sheet-close]", () => { $("#puSheet").hidden = true; }], ["[data-ov-close]", closeDetail], ["[data-deck-close]", () => { $("#puDeckOv").hidden = true; }]]) {
  document.querySelectorAll(sel).forEach((n) => n.addEventListener("click", fn));
}

function renderAll() {
  buildSections();
  renderFbar();
}
/* ── boot ───────────────────────────────────────────────────────────── */
document.documentElement.dataset.style = STYLES[styleIdx].id;
$("#puCount").textContent = `${CARDS.length} cards · ${STYLES.length} styles`;
buildRail();
buildSections();
buildDraft();
renderFbar();
// expose a probe handle for the e2e (read-only)
window.__pu = { CARDS, STYLES, get styleIdx() { return styleIdx; }, get feedback() { return feedback; } };
