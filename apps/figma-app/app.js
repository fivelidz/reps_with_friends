/* ═══════════════════════════════════════════════════════════════════════
   RWF FIGMA TEST APP — every Ben screen as a navigable page.
   Built from figma/assets/file.json (exact copy, fills, bboxes) via
   /tmp extraction + figma/notes/analysis.md. Mock data only — no engine.
   Gold theme default; lime toggle in the status bar. Hash router.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── icons (F3 redraw of Ben's 22-icon set — design/figma-components.js) ── */
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
  chevron: P("M9 6l6 6-6 6"),
  search: P("M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M16 16l5 5"),
  camera: P("M4 8h3l2-3h6l2 3h3v11H4V8Z", 'fill="none"') + `<circle cx="12" cy="13" r="3.5" fill="none"/>`,
  share: P("M12 3v12M8 7l4-4 4 4M5 14v6h14v-6"),
  close: P("M6 6l12 12M18 6 6 18"),
  settings: P("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z"),
};
const ic = (name, cls = "fg-icon") => `<span class="${cls}" data-icon="${name}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg></span>`;

/* ── tiny dom helpers ────────────────────────────────────────────────── */
const go = (id) => `data-go="${id}"`;
const $ = (s, r = document) => r.querySelector(s);

/* ── the real game: engine port + persistent state ───────────────────── */
import * as S from "./state.js";
import * as E from "./engine.js";
import * as D from "./daily.js"; // temporal loop: deadlines, danger zone, daily winners (FLOW-06/07)
import { openCameraNote } from "./verify.js";
import { APP_VERSION, BUILD_HASH, BUILD_DATE } from "./version.js"; // v1.0.0 surface + About

/* transient form drafts (persisted only on CONTINUE / CREATE) */
const draft = { name: "Ben the Machine", tier: "casual", battle: { name: "The Sunday Showdown", days: [1, 3, 5], pack: "bodyweight", target: "solid" } };

/* daily-001: which closed day the recap shows (null → latest) */
let dailyDaySel = null;
/* transient power-up selection (pwr-001 card tap → pwr-002 detail sheet) */
let selectedPwr = null;

const ST = () => S.load();
const ordinal = (n) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
const you = (st = ST()) => st.player;
/** current live/open match (null → empty states) */
const liveMatch = (st = ST()) => {
  const m = S.currentMatch(st);
  return m && m.status !== "complete" ? m : null;
};
const lastDone = (st = ST()) => [...st.matches].filter((m) => m.status === "complete").pop() ?? null;

/** real standings rows rendered with Ben's lbRow component */
function realBoard(match, { max = null, youId = null } = {}) {
  const st = ST();
  const you_ = youId ?? st.player?.id;
  const now = Date.now();
  const rows = E.standings(match);
  const shown = max ? rows.slice(0, max) : rows;
  const target = match.config.targetReps;
  const eligible = (pid) => E.comebackEligible(match, pid);
  const lit = (pid) => E.lightningActive(match, pid, now);
  const shielded = (pid) => !!match.shields?.[pid];
  return shown
    .map((r, i) => lbRow({
      rank: i + 1,
      pid: r.player.id,
      name: r.player.id === you_ ? "You" : r.player.name,
      you: r.player.id === you_,
      initials: r.player.id === you_
        ? (st.player?.name ?? "BT").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
        : r.player.name.split(" ").map(w => w[0]).join("").slice(0, 2),
      crown: i === 0,
      pct: Math.round(r.progressPct),
      ruf: Math.round(r.adjustedScore),
      rufOf: target,
      barPct: Math.round(r.progressPct),
      barColor: i === 0 ? "gold" : r.progressPct < 30 ? "orange" : "purple",
      online: r.player.id !== you_,
      leader: i === 0,
      comeback: eligible(r.player.id),
      lightning: lit(r.player.id),
      shield: shielded(r.player.id),
    }))
    .join("");
}

/** empty-state block when there's no battle to show */
function noBattleState() {
  return `
  <div class="fx-statewrap">
    <div class="fg-state">
      <span class="fg-state__icon">${ic("trophy")}</span>
      <h3 class="fg-state__title">No live battle</h3>
      <p class="fg-state__body">Create a fast battle — exercises, target, days. Your crew joins with a code.</p>
      <button class="fg-state__cta" ${go("create-002")}>CREATE A BATTLE</button>
      <div class="fx-gap8"></div>
      <button class="fx-btn fx-btn--ghost fx-btn--sm" ${go("home-003")}>SEE ALL BATTLES</button>
    </div>
  </div>`;
}

/* ── shared builders (all return HTML strings) ───────────────────────── */

function statusBar() {
  return `
  <div class="fx-status">
    <span>9:41</span>
    <span class="fx-status__tools">
      <button class="fx-tool" ${go("")} title="All screens">${ic("feed")}INDEX</button>
      <button class="fx-tool" id="themeToggle" title="Toggle Ben gold / our lime">GOLD</button>
    </span>
  </div>`;
}

function topBar({ title = "", back = false, logo = false, bellGo = "home-007" } = {}) {
  const left = logo
    ? `<span class="fx-topbar__logo">REPS<i>·</i>FRIENDS</span>`
    : `${back ? `<button class="fx-topbar__back" data-back="1" aria-label="Back">${ic("chevron")}</button>` : ""}${title ? `<span class="fx-topbar__title">${title}</span>` : ""}`;
  return `
  <div class="fx-topbar">
    <div class="fx-topbar__left">${left}</div>
    <div class="fx-topbar__right">
      <button class="fx-topbar__bell" ${go(bellGo)} aria-label="Notifications">${ic("bell")}</button>
      <span class="fg-avatar fg-avatar--sm" style="width:32px;height:32px;font-size:9px">BT</span>
    </div>
  </div>`;
}

function nav(active = "") {
  const tab = (id, icon, label) => `
    <button class="fx-nav__tab" ${go(id)} ${active === id ? 'aria-current="page"' : ""}>${ic(icon)}<span>${label}</span></button>`;
  return `
  <div class="fx-nav">
    ${tab("battle-001", "trophy", "Battle")}
    ${tab("battle-006", "feed", "Feed")}
    <button class="fx-nav__log" id="logBtn" aria-label="Log reps">${ic("plus")}</button>
    ${tab("pwr-001", "bolt", "Power-Ups")}
    ${tab("profile-001", "user", "Profile")}
  </div>`;
}

/* leaderboard row — his 9:90 (completion % primary, RUF secondary) */
function lbRow({ rank, name, you = false, initials = null, crown = false, pct, ruf, rufOf = 120, barPct, barColor = "purple", online = false, leader = false, comeback = false, lightning = false, shield = false, pid = "" }) {
  const barFill = barColor === "gold" ? "var(--lime)" : barColor === "orange" ? "var(--urgency)" : "var(--energy)";
  const av = initials ?? (you ? "BT" : name.split(" ").map(w => w[0]).join("").slice(0, 2));
  const tags = [
    comeback ? '<b class="fx-cb" title="Comeback ×1.2 armed — log to claim">×1.2</b>' : "",
    lightning ? '<b class="fx-lt" title="Lightning Round live — logs count ×3">×3</b>' : "",
    shield ? `<b class="fx-sh" title="Shield armed — blocks one rep steal">${ic("shield")}</b>` : "",
  ].join("");
  return `
  <div class="fg-lbrow ${leader ? "fg-lbrow--leader" : ""} ${you ? "fg-lbrow--you" : ""}" ${pid ? `data-player="${pid}"` : ""}>
    <span class="fg-lbrow__rank">${rank}</span>
    <span class="fg-avatar ${leader ? "fg-avatar--leader" : ""}" style="width:48px;height:48px;font-size:14px">${av}${online ? '<i class="fg-avatar__dot"></i>' : ""}</span>
    <div class="fg-lbrow__info">
      <span class="fg-lbrow__name">${name}${crown ? ic("crown") : ""}${tags}</span>
      <span class="fg-lbrow__bar"><i style="width:${barPct}%;background:${barFill}"></i></span>
    </div>
    <div class="fg-lbrow__score">
      <div class="fg-lbrow__pct">${pct}%</div>
      <div class="fg-lbrow__ruf">${ruf} / ${rufOf} RUF</div>
    </div>
  </div>`;
}

const BOARD = [
  { rank: 1, name: "Sam K", crown: true, pct: 88, ruf: 106, barPct: 88, barColor: "gold", online: true, leader: true },
  { rank: 2, name: "You", you: true, pct: 71, ruf: 85, barPct: 71, barColor: "purple" },
  { rank: 3, name: "Alex T", pct: 62, ruf: 74, barPct: 62, barColor: "purple" },
  { rank: 5, name: "Jordan P", pct: 24, ruf: 29, barPct: 24, barColor: "orange" },
];
const board = (rows = BOARD) => rows.map(lbRow).join("");

/* progress ring — his 9:120 (track #26263a, gold arc) */
function ring(pct, num, sub, size = 150) {
  const r = (size - 20) / 2, c = 2 * Math.PI * r;
  return `
  <div class="fx-hero__ring" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--lime)" stroke-width="10"
        stroke-linecap="round" stroke-dasharray="${(c * pct) / 100} ${c}"/>
    </svg>
    <div class="fx-hero__ring-c">
      <span class="fx-hero__num">${num}</span>
      <span class="fx-hero__of">${sub}</span>
    </div>
  </div>`;
}

/* countdown — his 9:165, dual clock, DZ ramp classes from fg-components.
   `extra` carries live-deadline attrs (data-dz-countdown + match id) so
   the daily ticker — not the naive decrementer — drives real deadlines. */
function countdown({ time = "6:12:44", sub = "ends 9:00 PM AEST · 7:00 PM for you", level = "", extra = "" }) {
  return `
  <span class="fg-count ${level ? `fg-count--${level}` : ""}" data-countdown="${time}" ${extra}>
    ${ic("clock")}
    <span class="fg-count__wrap">
      <span class="fg-count__time">${time}</span>
      <span class="fg-count__sub">${sub}</span>
    </span>
  </span>`;
}

function badge({ icon = "bolt", text = "7 DAY STREAK", solid = true }) {
  return `<span class="fg-badge ${solid ? "fg-badge--live" : ""}">${ic(icon)}${text}</span>`;
}

function option({ title, sub, sel = false, go: g = "" }) {
  return `<div class="fx-option ${sel ? "fx-option--sel" : ""}" ${g ? go(g) : ""}>
    <span class="fx-option__title">${title}</span>
    ${sub ? `<span class="fx-option__sub">${sub}</span>` : ""}
  </div>`;
}

function rule(k, v) {
  return `<div class="fx-rule"><span class="fx-rule__k">${k}</span><span class="fx-rule__v">${v}</span></div>`;
}

function field(label, value, ph = false) {
  return `<div class="fx-field">
    <span class="fx-field__label">${label}</span>
    <div class="fx-field__box ${ph ? "fx-field__box--ph" : ""}">${value}</div>
  </div>`;
}

function btn(text, cls = "fx-btn--primary", g = "", extra = "") {
  return `<button class="fx-btn ${cls}" ${g ? go(g) : ""} ${extra}>${text}</button>`;
}

function h1(text, cls = "") { return `<h1 class="fx-h1 ${cls}">${text}</h1>`; }
function sub(text, cls = "") { return `<p class="fx-sub ${cls}">${text}</p>`; }
function note(text, cls = "") { return `<p class="fx-note ${cls}">${text}</p>`; }
function block(...kids) { return `<div class="fx-block">${kids.join("")}</div>`; }

function steps(on, of = 5) {
  return `<div class="fx-steps">${Array.from({ length: of }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("")}</div>`;
}

/* feed item — his 11:182 (5 event types) */
function feedItem({ icon, tone, name, action, meta, react = "🔥 3" }) {
  return `
  <div class="fg-feed fg-feed--${tone}">
    <span class="fg-feed__bubble">${ic(icon)}</span>
    <div class="fg-feed__content">
      <div class="fg-feed__line"><b>${name}</b> ${action}</div>
      <div class="fg-feed__meta">${meta}</div>
    </div>
    <span class="fg-feed__react">${react}</span>
  </div>`;
}

/* power-up card — his 12:140 (rarity colour-coded) */
function pwrCard({ rarity, name, desc, icon = "bolt" }) {
  return `
  <div class="fg-pwr fg-pwr--${rarity}" ${rarity === "legendary" ? go("pwr-002") : ""}>
    <span class="fg-pwr__rarity">${rarity.toUpperCase()}</span>
    <span class="fg-pwr__art">${ic(icon)}</span>
    <h3 class="fg-pwr__name">${name}</h3>
    <p class="fg-pwr__desc">${desc}</p>
  </div>`;
}

/* danger-zone banner — his 3-level ramp (fg-dz). extra carries the live
   attr (data-dz-banner) so the daily ticker can retune level + copy. */
function dzBanner(level, text, extra = "") {
  return `<div class="fg-dz fg-dz--${level}" ${extra}>${ic("warning")}<span class="fg-dz__label">${text}</span></div>`;
}

/* event banner — his 12:175 */
function eventBanner({ kind = "", icon = "bolt", title, subText, tag }) {
  return `
  <div class="fg-event ${kind ? `fg-event--${kind}` : ""}">
    ${ic(icon)}
    <div class="fg-event__copy">
      <div class="fg-event__title">${title}</div>
      <div class="fg-event__sub">${subText}</div>
    </div>
    <span class="fg-event__tag">${tag}</span>
  </div>`;
}

/* battle card — his 11:131. `chip` = the temporal status chip (next
   deadline / DZ1-3 level) from the daily layer, shown on home lists. */
function battleCard({ status = "LIVE", statusCls = "", meta, title, crewN = 4, barPct = null, barColor = "var(--lime)", foot, border = "purple", chip = "" }) {
  const av = Array.from({ length: crewN }, (_, i) =>
    `<span class="fg-avatar fg-avatar--sm" style="width:32px;height:32px;font-size:9px;${i < 2 ? "" : ""}">${["BT", "SK", "AT", "JP", "CM"][i]}</span>`).join("");
  return `
  <div class="fg-battle ${border === "line" ? "fg-battle--upcoming" : ""}" ${go("battle-001")}>
    <div class="fg-battle__head">
      <span class="fg-status ${statusCls}">${status}</span>
      ${chip}
      <span class="fg-battle__meta">${meta}</span>
    </div>
    <h3 class="fg-battle__title">${title}</h3>
    <div class="fg-battle__crew">${av}</div>
    ${barPct !== null ? `<div class="fg-battle__bar"><i style="width:${barPct}%;background:${barColor}"></i></div>` : ""}
    <div class="fg-battle__foot">${foot}</div>
  </div>`;
}

/** temporal chip for a live battle: next deadline, or the DZ level ramp
 *  (gold/orange/red) once inside 3h / 1h / 30min of the day deadline. */
function dzChip(m, nowTs = D.now()) {
  if (!m || m.status !== "live") return "";
  const lvl = D.dangerLevel(m, nowTs);
  const dl = D.deadlineFor(m, nowTs);
  if (lvl) {
    return `<span class="fg-status fg-status--dz${lvl}">DZ${lvl} · ${D.fmtChip(dl - nowTs)}</span>`;
  }
  return `<span class="fg-status fg-status--info">CLOSES ${D.fmtTimeLocal(dl)}</span>`;
}

/* confetti — his winner frames (1.2s, reduced-motion safe) */
function confetti() {
  const cols = ["var(--lime)", "var(--urgency)", "var(--energy)", "var(--success)"];
  let out = '<div class="fx-confetti" aria-hidden="true">';
  for (let i = 0; i < 26; i++) {
    const x = (i * 37 + 13) % 380, y = (i * 53 + 40) % 320, w = 8 + (i % 3) * 4, h = 11 + (i % 4) * 3;
    out += `<i style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${cols[i % 4]};animation-delay:${(i % 5) * 0.12}s"></i>`;
  }
  return out + "</div>";
}

/* sheet screens: dimmed under-screen + sheet (as his frames show) */
function sheetScreen(under, sheetHtml, dialog = false) {
  return `${under}
  <div class="fx-scrim ${dialog ? "fx-scrim--center" : ""}">
    ${dialog ? sheetHtml : `<div class="fx-sheet">${sheetHtml}</div>`}
  </div>`;
}

/* ── quick-log sheet (the global LOG action — ≤3 taps, REAL logging) ─── */
function quickLogSheet() {
  const st = ST();
  const m = liveMatch(st);
  if (!m) return `
  <div class="fx-sheet" id="quickLog">
    <div class="fx-sheet__grab"></div>
    <h2 class="fx-sheet__h">LOG REPS</h2>
    <p class="fg-sheet__note">No live battle — create one and the sheet goes live.</p>
    <button class="fg-sheet__cta" ${go("create-002")}>CREATE A BATTLE</button>
  </div>`;
  const exs = m.config.exercises;
  const p = you(st);
  const mult = E.TIER_MULTIPLIERS[p?.tier ?? "casual"];
  const cb = E.comebackEligible(m, p?.id);
  const lt = E.lightningActive(m, p?.id);
  return `
  <div class="fx-sheet" id="quickLog" data-match="${m.config.id}">
    <div class="fx-sheet__grab"></div>
    <h2 class="fx-sheet__h">LOG REPS</h2>
    <div class="fg-sheet__row" id="qlEx">
      ${exs.slice(0, 3).map((e, i) => `<button class="fg-chip fg-chip--exercise" aria-pressed="${i === 0}" data-ex="${e.id}">${e.name}</button>`).join("")}
      <button class="fg-chip fg-chip--exercise" aria-pressed="false" ${go("log-002")}>More…</button>
    </div>
    <div class="fg-sheet__row" id="qlPre">
      ${[5, 10, 20, 30, 50].map((n, i) => `<button class="fg-chip fg-chip--lg" aria-pressed="${n === 20}" data-n="${n}">${n}</button>`).join("")}
    </div>
    <p class="fg-sheet__conversion" id="qlConv"></p>
    ${cb ? `<p class="fg-sheet__conversion" style="color:var(--energy-light)">${ic("bolt")} COMEBACK ×1.2 ARMED — THIS LOG COUNTS EXTRA</p>` : ""}
    ${lt ? `<p class="fg-sheet__conversion" style="color:var(--energy)">${ic("bolt")} LIGHTNING ROUND LIVE — THIS LOG COUNTS ×3</p>` : ""}
    <button class="fg-sheet__cta" id="qlCta">LOG</button>
    <button class="fx-cambtn" id="camVerify" type="button">${ic("camera")} CAMERA VERIFY <span>— pose counting lives in the prototype app</span></button>
    <p class="fg-sheet__note">3 taps, one thumb. Adjusted ×${mult} (${p?.tier ?? "casual"} tier).</p>
  </div>`;
}
function wireQuickLog(root) {
  const sheet = root.querySelector("#quickLog");
  if (!sheet || !sheet.dataset.match) return;
  const st = ST();
  const m = S.matchById(sheet.dataset.match, st);
  if (!m || m.status !== "live") return;
  const p = you(st);
  const mult = E.TIER_MULTIPLIERS[p?.tier ?? "casual"];
  const cbEligible = E.comebackEligible(m, p?.id);
  const sel = { ex: m.config.exercises[0], n: 20 };
  const conv = sheet.querySelector("#qlConv"), cta = sheet.querySelector("#qlCta");
  const ltActive = E.lightningActive(m, p?.id);
  const render = () => {
    const pts = Math.round(sel.n * mult * (cbEligible ? E.COMEBACK_MULTIPLIER : 1) * (ltActive ? E.LIGHTNING_MULTIPLIER : 1) * 10) / 10;
    const raw = E.playerRawReps(p.id, m.entries) + sel.n;
    const pct = Math.min(100, Math.round((raw / m.config.targetReps) * 100));
    conv.innerHTML = `<b>${sel.n} ${sel.ex.name.toLowerCase()} = ${pts} RUF</b> (×${mult}${cbEligible ? " ×1.2 comeback" : ""}${ltActive ? " ×3 lightning" : ""}) · takes you to ${pct}%`;
    cta.textContent = `LOG ${sel.n} ${sel.ex.name.toUpperCase()}`;
    sheet.querySelectorAll("#qlEx .fg-chip[data-ex]").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.ex === sel.ex.id)));
    sheet.querySelectorAll("#qlPre .fg-chip").forEach(c => c.setAttribute("aria-pressed", String(Number(c.dataset.n) === sel.n)));
  };
  sheet.querySelectorAll("#qlEx .fg-chip[data-ex]").forEach(c => c.addEventListener("click", () => {
    const e = m.config.exercises.find(x => x.id === c.dataset.ex);
    if (e) { sel.ex = e; render(); }
  }));
  sheet.querySelectorAll("#qlPre .fg-chip").forEach(c => c.addEventListener("click", () => { sel.n = Number(c.dataset.n); render(); }));
  cta.addEventListener("click", () => {
    let res;
    try {
      res = S.logToMatch(m.config.id, { exerciseId: sel.ex.id, reps: sel.n });
    } catch (err) {
      toast(`⚠️ ${err.message}`);
      return;
    }
    closeOverlay();
    if (res.closed) {
      location.hash = "#/result-005";
    } else {
      toast(`${ic("check")}+${sel.n} ${sel.ex.name.toLowerCase()} logged${res.comeback ? " · COMEBACK ×1.2 CLAIMED" : ""}${res.lightning ? " · LIGHTNING ×3 CLAIMED" : ""}`);
      route(); // re-render current screen with fresh standings
    }
  });
  render();
}

/* ── power-up inventory sheet (FLOW-05 — REAL: engine + state) ───────── */
const fmtClock = (ms) => {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
};
const fmtDeadline = (ms) => {
  try { return new Date(ms).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }); }
  catch { return new Date(ms).toTimeString().slice(0, 5); }
};

/** One inventory row: rarity card (F3 fg-pwr component) + live state + action. */
function pwrRow(m, def, count, state) {
  const rarityTag = `${def.rarity.toUpperCase()}${count > 1 ? ` ×${count}` : ""}`;
  const action = state === "held"
    ? `<button class="fx-btn fx-btn--sm fx-btn--purple" data-pwr="${def.kind}">USE</button>`
    : state === "active"
      ? `<span class="fx-pwrstate fx-pwrstate--on">${ic("bolt")} ×3 LIVE</span>`
      : state === "armed"
        ? `<span class="fx-pwrstate fx-pwrstate--on">${ic("shield")} ARMED</span>`
        : `<span class="fx-pwrstate">${state === "used" ? "USED THIS MATCH" : "NONE HELD"}</span>`;
  return `
  <div class="fg-pwr fg-pwr--${def.rarity} fx-pwrcard">
    <span class="fg-pwr__rarity">${rarityTag}</span>
    <span class="fg-pwr__art">${ic(def.icon)}</span>
    <div class="fx-pwrcard__body">
      <h3 class="fg-pwr__name">${def.name}</h3>
      <p class="fg-pwr__desc">${state === "held" || state === "active" || state === "armed" ? def.blurb : state === "used" ? def.blurb : "Not in your inventory — the daily drop or a dev grant restocks it."}</p>
    </div>
    ${action}
  </div>`;
}

function powerUpSheet() {
  const st = ST();
  const m = liveMatch(st);
  if (!m) return `
  <div class="fx-sheet" id="pwrSheet">
    <div class="fx-sheet__grab"></div>
    <h2 class="fx-sheet__h">POWER-UPS</h2>
    <p class="fg-sheet__note">No live battle — power-ups live inside one. Create a battle and your arsenal opens with it.</p>
    <button class="fg-sheet__cta" ${go("create-002")}>CREATE A BATTLE</button>
  </div>`;
  const myId = st.player?.id;
  const now = Date.now();
  const inv = E.inventoryOf(m, myId);
  const count = (kind) => inv.filter((i) => i.kind === kind).length;
  const steal = E.stealPreview(m, myId);
  const shieldArmed = !!m.shields?.[myId];
  const litActive = E.lightningActive(m, myId, now);
  const litUsed = !!m.lightningUsed?.[myId];
  const litRemain = E.lightningRemainingMs(m, myId, now);
  const rows = [
    pwrRow(m, E.POWER_UPS.lightning, count("lightning"), litActive ? "active" : litUsed ? "used" : count("lightning") ? "held" : "none"),
    pwrRow(m, E.POWER_UPS.steal, count("steal"), count("steal") ? "held" : "none"),
    pwrRow(m, E.POWER_UPS.shield, count("shield"), shieldArmed ? "armed" : count("shield") ? "held" : "none"),
    pwrRow(m, E.POWER_UPS.freeze, count("freeze"), count("freeze") ? "held" : "none"),
  ].join("");
  return `
  <div class="fx-sheet" id="pwrSheet" data-match="${m.config.id}">
    <div class="fx-sheet__grab"></div>
    <h2 class="fx-sheet__h">POWER-UPS</h2>
    ${litActive ? `<div class="fx-ltline">${ic("bolt")}LIGHTNING LIVE — ${fmtClock(litRemain)} left · logs count ×3</div>` : ""}
    ${shieldArmed ? `<div class="fx-ltline fx-ltline--shield">${ic("shield")}SHIELD ARMED — your reps can't be stolen</div>` : ""}
    ${steal ? `<div class="fx-ltline fx-ltline--target">${ic("bolt")}STEAL TARGET: ${steal.victim.id === myId ? "you" : steal.victim.name} (${steal.victimRaw} reps) → takes ${steal.amount}${steal.blocked ? " · SHIELDED" : ""}</div>` : ""}
    <div class="fx-pwrlist">${rows}</div>
    <div class="fx-rule"><span class="fx-rule__k">BATTLE DEADLINE</span><span class="fx-rule__v">${fmtDeadline(m.deadlineAt)} · freeze +30 min</span></div>
    <p class="fg-sheet__note">Hidden from your crew · rarity is cosmetic in this build · one lightning per match</p>
  </div>`;
}

/** Toast copy for an activation result card (engine truth → founder words). */
function pwrToast(result, m) {
  const who = (id) => id === ST().player?.id ? "YOU" : (m?.players.find((p) => p.id === id)?.name ?? id);
  if (!result.ok) return `⚠️ ${result.reason ?? "can't activate that"}`;
  switch (result.kind) {
    case "lightning": return `${ic("bolt")}LIGHTNING ROUND LIVE — ×3 FOR 10:00. GO.`;
    case "shield": return `${ic("shield")}SHIELD ARMED — one steal bounces off you`;
    case "freeze": return `${ic("clock")}TIME FREEZE — DEADLINE +30 MIN → ${fmtDeadline(result.newDeadline)}`;
    case "steal":
      if (result.blocked) return `${ic("shield")}STEAL BLOCKED by ${who(result.victimId)}'s shield — their shield broke, your card survived`;
      return result.stolen > 0
        ? `${ic("bolt")}REP STEAL — TOOK ${result.stolen} FROM ${who(result.victimId).toUpperCase()}`
        : `${ic("bolt")}REP STEAL fizzled — ${who(result.victimId)} had nothing to take`;
    default: return `${ic("bolt")}${result.name ?? "POWER-UP"} ACTIVATED`;
  }
}

/** Wire the inventory sheet (overlay or embedded): USE buttons → engine. */
function wirePowerUps(root) {
  const sheet = root.querySelector("#pwrSheet");
  if (!sheet || !sheet.dataset.match) return;
  const matchId = sheet.dataset.match;
  sheet.querySelectorAll("[data-pwr]").forEach((btn) => {
    btn.addEventListener("click", () => {
      let out;
      try {
        out = S.activateInMatch(matchId, { kind: btn.dataset.pwr });
      } catch (err) {
        toast(`⚠️ ${err.message}`);
        return;
      }
      const { result } = out;
      if (result.ok && result.kind === "steal" && !result.blocked && result.stolen > 0) {
        pendingFlash = { victim: result.victimId, thief: result.playerId, at: Date.now() };
      }
      toast(pwrToast(result, out.match));
      closeOverlay();
      route(); // standings re-render (tags, bars, deadline)
    });
  });
}

/* steal flash: the two touched rows pulse once after re-render (cheap CSS) */
let pendingFlash = null;
function applyPendingFlash(root) {
  if (!pendingFlash) return;
  const { victim, thief, at } = pendingFlash;
  pendingFlash = null;
  if (Date.now() - at > 3000) return;
  for (const pid of [victim, thief]) {
    root.querySelector(`.fg-lbrow[data-player="${pid}"]`)
      ?.classList.add(pid === thief ? "fg-lbrow--gain" : "fg-lbrow--hit");
  }
}

/** transient toast (bottom of viewport, auto-dismiss) */
let toastTimer = null;
function toast(html) {
  document.querySelectorAll(".fx-toast--live").forEach(n => n.remove());
  const el = document.createElement("div");
  el.className = "fx-toast fx-toast--live";
  el.innerHTML = html;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

/* ═════════════════════════════ SCREENS ════════════════════════════════
   Registry: { id, figma, name, group, next?, render() } — copy verbatim
   from the file.json extraction. 65 screens (+ season-001).
   Core-loop screens are WIRED to real state (rwf.figma.v1); everything
   else keeps Ben's mock copy and carries a DEMO chip (see renderScreen). */

/* the battle screen underlay — REAL: standings, ring, comeback, dual clock
   + the temporal loop (FLOW-06): live day deadline, danger-zone banner,
   pulsing LOG NOW, DZ3 wash, recap link. */
const battleUnder = () => {
  const st = ST();
  const m = liveMatch(st);
  if (!m) {
    return `
    ${statusBar()}
    ${topBar({ title: "Reps With Friends" })}
    <div class="fx-content">
      ${h1("THE BATTLE BOARD", "fx-h1--26")}
      ${noBattleState()}
    </div>
    ${nav("battle-001")}`;
  }
  const rows = E.standings(m);
  const myId = st.player?.id;
  const mine = rows.find((r) => r.player.id === myId) ?? rows[0];
  const myRank = rows.findIndex((r) => r.player.id === myId) + 1;
  const leader = rows[0];
  const gap = leader.rawReps - mine.rawReps;
  /* ── temporal: real deadline, DZ ramp, play-day label ── */
  const dnow = D.now();
  const lvl = D.dangerLevel(m, dnow);
  const clock = D.deadlineClock(m, dnow); // ticking to THIS day's deadline
  const dayHist = m.dailyHistory ?? {};
  const dayN = Object.keys(dayHist).length + 1;
  const restDay = !D.isPlayDay(m, dnow);
  const nextD = D.nextPlayDay(m, D.dayKeyOf(dnow));
  const lastDay = Object.keys(dayHist).sort().pop() ?? null;
  const lastRecap = lastDay ? dayHist[lastDay] : null;
  const streak = st.season?.streaks?.[myId]?.length ?? 0;
  const cb = E.comebackEligible(m, myId);
  const litMe = E.lightningActive(m, myId);
  const litRemain = E.lightningRemainingMs(m, myId);
  const litClock = `0:${String(Math.floor(litRemain / 60000)).padStart(2, "0")}:${String(Math.floor((litRemain % 60000) / 1000)).padStart(2, "0")}`;
  const myCards = E.inventoryOf(m, myId).length;
  return `
  ${statusBar()}
  ${topBar({ title: m.config.name ?? "Battle" })}
  <div class="fx-content" data-dz-root data-match="${m.config.id}">
    <div class="fx-daylabel">${restDay
      ? `REST DAY — NEXT BATTLE DAY <b>${nextD?.weekdayShort ?? "SOON"}</b> · LOGS STILL COUNT FOR THE BATTLE`
      : `<b>DAY ${dayN}</b> — CLOSES ${D.fmtTimeLocal(D.deadlineFor(m, dnow))} YOUR TIME`}</div>
    <div class="fx-statusrow">
      ${badge({ icon: "flame", text: `${streak} DAY STREAK` })}
      ${countdown({ time: clock.time, sub: clock.sub, level: lvl ? `dz${lvl}` : "", extra: `data-dz-countdown data-match="${m.config.id}"` })}
    </div>
    ${lvl ? dzBanner(`l${lvl}`, D.dzCopy(lvl, D.deadlineFor(m, dnow) - dnow), 'data-dz-banner') : `<div style="display:none" data-dz-banner></div>`}
    ${cb ? `<div class="fx-cbbanner">${ic("bolt")}COMEBACK ×1.2 ARMED — YOU'RE ${Math.round((gap / Math.max(leader.rawReps, 1)) * 100)}% BEHIND. NEXT LOG COUNTS 1.2×</div>` : ""}
    ${litMe ? `<div class="fx-activebanner"><span style="font-size:24px">⚡</span><div><div class="fx-activebanner__t">LIGHTNING ROUND — 3× REPS</div><div class="fx-activebanner__s"><span class="fx-ltclock" data-countdown="${litClock}"><span class="fg-count__time">${litClock}</span></span> remaining · every log counts triple</div></div></div>` : ""}
    <div class="fx-hero">${ring(mine.progressPct, String(mine.rawReps), `of ${m.config.targetReps} reps`)}
      <div class="fx-hero__line">${mine.rawReps >= m.config.targetReps ? "TARGET HIT" : `${m.config.targetReps - mine.rawReps} REPS TO GO${gap > 0 && myRank > 1 ? ` — ${leader.player.id === myId ? "YOU" : leader.player.name} IS ${gap} AHEAD` : myRank === 1 ? " — YOU LEAD" : ""}`}</div>
    </div>
    <button class="fx-dzlog" data-dz-log type="button" ${lvl ? "" : 'style="display:none"'}>${ic("bolt")} LOG NOW — THE CLOCK'S NOT WAITING</button>
    <div class="fx-crewnow">
      ${m.players.slice(0, 5).map((p) => `<span class="fg-avatar fg-avatar--sm fg-avatar--online" style="width:32px;height:32px;font-size:9px">${p.id === myId ? (st.player.name.split(" ").map(w => w[0]).join("").slice(0, 2)) : p.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>`).join("")}
      <span class="fx-crewnow__text">${m.players.length} in the crew · ${m.entries.length} sets logged</span>
    </div>
    <div class="fx-board">${realBoard(m)}</div>
    ${lastRecap ? `<button class="fx-recaplink" data-go="daily-001">DAILY RECAP — <b>${lastRecap.youWon ? "YOU WON" : lastRecap.winner ? `${lastRecap.winner.name.split(" ")[0].toUpperCase()} TOOK` : "NOBODY LOGGED"} ${D.weekdayShortOf(lastRecap.dayKey)}</b>${ic("chevron")}</button>` : ""}
    <button class="fx-pwrbtn" id="pwrBtn" type="button">⚡ POWER-UPS <span>(${myCards} held)</span></button>
    <button class="fx-simbtn" id="simMates" type="button">▸ SIMULATE MATES' REPS <span>(demo)</span></button>
  </div>
  ${nav("battle-001")}`;
};

const SCREENS = [
  /* ── AUTH ×12 ─────────────────────────────────────────────────────── */
  {
    id: "auth-001", figma: "MOB-AUTH-001", name: "Splash", group: "Onboarding (AUTH)", next: "auth-002",
    render: () => `
      ${statusBar()}
      <div class="fx-content fx-content--center">
        <div class="fx-wordmark">REPS<i>·</i>WF</div>
        <p class="fx-sub" style="text-align:center;margin-top:56px;letter-spacing:0.14em;font-weight:600">JOIN THE BATTLE. WIN THE DAY.</p>
        <div class="fx-loading" style="margin-top:180px"><i></i><i></i><i></i></div>
      </div>`,
  },
  {
    id: "auth-002", figma: "MOB-AUTH-002", name: "Value proposition", group: "Onboarding (AUTH)", next: "auth-003",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap48"></div><div class="fx-gap16"></div>
        <div class="fx-wordmark fx-wordmark--sm" style="margin:0 auto">REPS<i>·</i>WF</div>
        ${h1("EXERCISE IS BORING.<br>BEATING YOUR MATES ISN'T.", "fx-h1--34")}
        ${sub("Create a battle, set the days, invite your crew. Everyone gets a daily target — first to smash it wins the day.", "fx-sub--16")}
        <div class="fx-board" style="margin-top:20px">${board([BOARD[0], BOARD[1]])}</div>
        <div class="fx-dots"><i class="on"></i><i></i><i></i></div>
        <div class="fx-gap48"></div><div class="fx-gap24"></div>
      </div>
      <div class="fx-block" style="padding:0 16px 40px">
        ${btn("GET STARTED", "fx-btn--primary", "auth-003")}
        <div class="fx-gap8"></div>
        ${btn("I already have an account", "fx-btn--ghost", "auth-004")}
      </div>`,
  },
  {
    id: "auth-003", figma: "MOB-AUTH-003", name: "Sign up", group: "Onboarding (AUTH)", next: "auth-006",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap24"></div>
        ${h1("CREATE YOUR ACCOUNT")}
        ${sub("Battles are better with an identity. Keep it real — your mates will see it.")}
        ${field("Email", "your@email.com", true)}
        ${field("Password", "••••••••••")}
        <div class="fx-gap8"></div>
        ${btn("SIGN UP", "fx-btn--primary", "auth-006")}
        <div class="fx-divider">or</div>
        ${btn("Continue with Apple", "fx-btn--dark")}
        <div class="fx-gap8"></div>
        ${btn("Continue with Google", "fx-btn--dark")}
        ${note("By continuing you accept the Terms & Privacy Policy.")}
      </div>`,
  },
  {
    id: "auth-004", figma: "MOB-AUTH-004", name: "Log in", group: "Onboarding (AUTH)", next: "home-002",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap48"></div>
        ${h1("WELCOME BACK")}
        ${sub("Your crew's been busy. Time to catch up.")}
        ${field("Email", "ben@repswithfriends.com")}
        ${field("Password", "••••••••••")}
        <div class="fx-gap8"></div>
        ${btn("LOG IN", "fx-btn--primary", "home-002")}
        <div class="fx-gap8"></div>
        ${btn("Forgot password?", "fx-btn--ghost")}
      </div>`,
  },
  {
    id: "auth-006", figma: "MOB-AUTH-006", name: "Verify email", group: "Onboarding (AUTH)", next: "auth-007",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap48"></div><div class="fx-gap16"></div>
        ${h1("CHECK YOUR INBOX")}
        ${sub("We sent a 6-digit code to ben@repswithfriends.com")}
        <div class="fx-code"><i>4</i><i>8</i><i>2</i><i>9</i><i>1</i><i style="border-color:var(--lime)"></i></div>
        <div class="fx-gap8"></div>
        ${btn("VERIFY", "fx-btn--primary", "auth-007")}
        <div class="fx-gap8"></div>
        ${btn("Resend code (0:42)", "fx-btn--ghost")}
      </div>`,
  },
  {
    id: "auth-007", figma: "MOB-AUTH-007", name: "Terms & age consent", group: "Onboarding (AUTH)", next: "auth-008",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap48"></div>
        ${h1("THE BORING (IMPORTANT) BIT", "fx-h1--26")}
        ${sub("Your date of birth stays private. It unlocks the right experience — cash stakes are strictly 18+ and only where legal.")}
        ${field("Date of birth", "12 / 04 / 1993")}
        <div class="fx-checkrow"><span class="fx-checkrow__box">${ic("check")}</span><span class="fx-checkrow__label">I accept the Terms of Service</span></div>
        <div class="fx-checkrow"><span class="fx-checkrow__box">${ic("check")}</span><span class="fx-checkrow__label">I accept the Privacy Policy</span></div>
        <div class="fx-checkrow"><span class="fx-checkrow__box fx-checkrow__box--off">${ic("check")}</span><span class="fx-checkrow__label">Send me product updates (optional)</span></div>
        <div class="fx-gap8"></div>
        ${btn("CONTINUE", "fx-btn--primary", "auth-008")}
      </div>`,
  },
  {
    id: "auth-008", figma: "MOB-AUTH-008", name: "Profile setup", group: "Onboarding (AUTH)", next: "auth-009",
    render: () => `
      ${statusBar()}
      ${steps(1)}
      <div class="fx-content">
        ${h1("WHO'S JOINING THE BATTLE?")}
        <div class="fx-avatarpick">
          <span class="fg-avatar fg-avatar--leader" style="width:96px;height:96px;font-size:23px">${(draft.name || "BT").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</span>
          <button class="fx-avatarpick__add">Add photo</button>
        </div>
        <div class="fx-field">
          <span class="fx-field__label">Display name</span>
          <input class="fx-input" id="obName" type="text" maxlength="40" value="${draft.name.replace(/"/g, "&quot;")}" autocomplete="off" spellcheck="false">
        </div>
        <div class="fx-field">
          <span class="fx-field__label">Username</span>
          <div class="fx-field__box fx-field__box--ph">@${(draft.name || "you").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "you"}</div>
        </div>
        <div class="fx-gap8"></div>
        ${btn("CONTINUE", "fx-btn--primary", "auth-009", 'id="obNameNext"')}
      </div>`,
  },
  {
    id: "auth-009", figma: "MOB-AUTH-009", name: "Time zone & quiet hours", group: "Onboarding (AUTH)", next: "auth-010",
    render: () => `
      ${statusBar()}
      ${steps(2)}
      <div class="fx-content">
        ${h1("YOUR CLOCK MATTERS")}
        ${sub("Battles run on a shared group clock, translated to your local time. We detected:")}
        ${option({ title: "Sydney (AEST, UTC+10)", sub: "Battle days will show in this time zone. Daylight-saving shifts are handled automatically — no duplicate or missing days.", sel: true })}
        <p class="fx-sub fx-sub--16" style="margin-top:20px;font-weight:700;color:var(--text)">Quiet hours — we won't buzz you</p>
        <div class="fx-quiet"><div class="fx-quiet__box">10:00 PM</div><div class="fx-quiet__box">7:00 AM</div></div>
        ${note("Urgent battle moments (final 30 min) can still come through — you can turn that off later.")}
        <div class="fx-gap8"></div>
        ${btn("CONTINUE", "fx-btn--primary", "auth-010")}
      </div>`,
  },
  {
    id: "auth-010", figma: "MOB-AUTH-010", name: "Capability tier", group: "Onboarding (AUTH)", next: "auth-011",
    render: () => `
      ${statusBar()}
      ${steps(3)}
      <div class="fx-content">
        ${h1("HOW DO YOU TRAIN?")}
        ${sub("This is your handicap — reps count ×1.5 as a couch starter, ×0.85 as an athlete. Effort competes, not raw fitness. Nobody outside the engine sees it.")}
        <div id="tierOpts">
          ${option({ title: "Couch — just starting out", sub: "Every rep ×1.5 · lower targets, bodyweight-first" })}
          ${option({ title: "Casual — I train sometimes", sub: "Every rep ×1.25 · balanced targets", sel: true })}
          ${option({ title: "Fit — I train seriously", sub: "Every rep ×1.0 · bigger targets" })}
          ${option({ title: "Athlete — I'm a menace", sub: "Every rep ×0.85 · respect" })}
        </div>
        <div class="fx-gap8"></div>
        ${btn("CONTINUE", "fx-btn--primary", "auth-011", 'id="tierNext"')}
      </div>`,
  },
  {
    id: "auth-011", figma: "MOB-AUTH-011", name: "Exercise preferences", group: "Onboarding (AUTH)", next: "auth-013",
    render: () => `
      ${statusBar()}
      ${steps(4)}
      <div class="fx-content">
        ${h1("PICK YOUR WEAPONS")}
        ${sub("Choose at least 3 you'd actually do. You can log any exercise later.")}
        <div class="fx-chips">
          <button class="fx-chip fx-chip--on">Push-ups</button>
          <button class="fx-chip fx-chip--on">Squats</button>
          <button class="fx-chip">Sit-ups</button>
          <button class="fx-chip">Burpees</button>
          <button class="fx-chip fx-chip--on">Plank</button>
          <button class="fx-chip">Lunges</button>
          <button class="fx-chip">Pull-ups</button>
          <button class="fx-chip">Jumping jacks</button>
          <button class="fx-chip">Jump rope</button>
          <button class="fx-chip">Wall sit</button>
        </div>
        <div class="fx-gap16"></div>
        ${btn("CONTINUE", "fx-btn--primary", "auth-013")}
      </div>`,
  },
  {
    id: "auth-013", figma: "MOB-AUTH-013", name: "Notification permission", group: "Onboarding (AUTH)", next: "auth-014",
    render: () => `
      ${statusBar()}
      ${steps(5)}
      <div class="fx-content">
        ${h1("BATTLES ARE LIVE.<br>DON'T MISS THE ENDING.", "fx-h1--26")}
        ${sub("Choose how loud we are. You can change this per-battle any time.")}
        ${option({ title: "Quiet", sub: "Daily result + final-hour warning only" })}
        ${option({ title: "Standard", sub: "Lead changes, close calls, power-up events", sel: true })}
        ${option({ title: "Chaos", sub: "Everything. Taunts included. Good luck." })}
        <div class="fx-gap8"></div>
        ${btn("ALLOW NOTIFICATIONS", "fx-btn--primary", "auth-014")}
        <div class="fx-gap8"></div>
        ${btn("Maybe later", "fx-btn--ghost", "auth-014")}
      </div>`,
  },
  {
    id: "auth-014", figma: "MOB-AUTH-014", name: "Onboarding complete", group: "Onboarding (AUTH)", next: "create-002",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap96"></div>
        ${h1(`YOU'RE IN, ${(you()?.name ?? "FRIEND").split(" ")[0].toUpperCase()}.`, "fx-h1--36 fx-h1--gold")}
        ${sub(`Tier: ${(you()?.tier ?? "casual").toUpperCase()} — every rep ×${E.TIER_MULTIPLIERS[you()?.tier ?? "casual"]}. Time to pick your first fight.`, "fx-sub--16")}
        ${option({ title: "Create a battle", sub: "Set the rules, invite your crew, own the smack talk", sel: true, go: "create-002" })}
        ${option({ title: "Join with a code or link", sub: "Got an invite? Jump straight in", go: "join-001" })}
        ${option({ title: "Try a demo battle", sub: "Solo practice round to learn the ropes", go: "battle-001" })}
        <div class="fx-gap8"></div>
        ${btn("LET'S GO", "fx-btn--primary", "create-002")}
      </div>`,
  },

  /* ── HOME ×5 ──────────────────────────────────────────────────────── */
  {
    id: "home-001", figma: "MOB-HOME-001", name: "Home — first use (no battles)", group: "Home", next: "create-002",
    render: () => `
      ${statusBar()}
      ${topBar({ logo: true })}
      <div class="fx-content">
        ${h1("READY WHEN YOU ARE", "fx-h1--30")}
        <div class="fx-statewrap">
          <div class="fg-state">
            <span class="fg-state__icon">${ic("trophy")}</span>
            <h3 class="fg-state__title">No battles yet</h3>
            <p class="fg-state__body">Create your first battle or join a mate's with an invite code.</p>
            <button class="fg-state__cta" ${go("create-002")}>CREATE A BATTLE</button>
          </div>
        </div>
        <div class="fx-card">
          <span class="fx-card__t">Got an invite code?</span>
          <span class="fx-card__s">Paste it here to join your crew's battle</span>
        </div>
        <div class="fx-gap8"></div>
        ${btn("▶  WATCH THE DEMO — 75 SECONDS", "fx-btn--dark", "", 'data-demo-start')}
      </div>
      ${nav("battle-001")}`,
  },
  {
    id: "home-002", figma: "MOB-HOME-002", name: "Home — active battle", group: "Home", next: "battle-001",
    render: () => {
      const st = ST();
      const m = liveMatch(st);
      if (!m) return `
      ${statusBar()}
      ${topBar({ logo: true })}
      <div class="fx-content">
        ${h1("READY WHEN YOU ARE", "fx-h1--30")}
        ${noBattleState()}
        <div class="fx-gap8"></div>
        ${btn("▶  WATCH THE DEMO — 75 SECONDS", "fx-btn--dark", "", 'data-demo-start')}
      </div>
      ${nav("battle-001")}`;
      const rows = E.standings(m);
      const myId = st.player?.id;
      const mine = rows.find((r) => r.player.id === myId) ?? rows[0];
      const myRank = rows.findIndex((r) => r.player.id === myId) + 1;
      const leader = rows[0];
      /* temporal: the real day deadline + latest closed-day recap strip */
      const dnow = D.now();
      const clock = D.deadlineClock(m, dnow);
      const dayHist = m.dailyHistory ?? {};
      const lastDay = Object.keys(dayHist).sort().pop() ?? null;
      const lastRecap = lastDay ? dayHist[lastDay] : null;
      return `
      ${statusBar()}
      ${topBar({ logo: true })}
      <div class="fx-content">
        <div class="fx-statusrow">
          <span class="fg-badge">${ic("flame")}${st.season?.streaks?.[myId]?.length ?? 0} DAY STREAK</span>
          ${countdown({ time: clock.time, sub: clock.sub, level: clock.level ? `dz${clock.level}` : "", extra: `data-dz-countdown data-match="${m.config.id}"` })}
        </div>
        ${lastRecap ? `<div data-go="daily-001" style="cursor:pointer">${eventBanner({ kind: lastRecap.youWon ? "" : "close", icon: "trophy", title: lastRecap.youWon ? `YOU WON ${D.weekdayShortOf(lastRecap.dayKey)}` : `${lastRecap.winner ? lastRecap.winner.name.split(" ")[0].toUpperCase() : "NOBODY"} TOOK ${D.weekdayShortOf(lastRecap.dayKey)}`, subText: "Day closed — see the recap & moments", tag: "RECAP" })}</div>` : ""}
        ${battleCard({ meta: `${m.players.length} mates · ${S.fmtDays(m.config.playDays)}`, title: (m.config.name ?? "BATTLE").toUpperCase(), crewN: m.players.length, barPct: Math.round(mine.progressPct), foot: myRank === 1 ? "You lead — don't blink" : `You're ${ordinal(myRank)} — ${leader.rawReps - mine.rawReps} reps behind ${leader.player.id === myId ? "you" : leader.player.name}`, chip: dzChip(m, dnow) })}
        <div class="fx-hero fx-hero--split">
          ${ring(mine.progressPct, String(mine.rawReps), `of ${m.config.targetReps} reps`, 120)}
          <div>
            <div class="fx-hero__line" style="font-size:22px;text-align:left">${Math.max(0, m.config.targetReps - mine.rawReps)} REPS TO GO</div>
            <p class="fx-hero__aside" style="text-align:left">${leader.player.name} is at ${Math.round(leader.progressPct)}% — adjusted score ${Math.round(leader.adjustedScore)} RUF.</p>
          </div>
        </div>
        <div class="fx-board">${realBoard(m, { max: 2 })}</div>
        <div class="fx-gap8"></div>
        ${btn("SEASON LADDER →", "fx-btn--dark", "season-001")}
        <div class="fx-gap8"></div>
        ${btn("▶  WATCH THE DEMO", "fx-btn--ghost", "", 'data-demo-start')}
      </div>
      ${nav("battle-001")}`;
    },
  },
  {
    id: "home-003", figma: "MOB-HOME-003", name: "Home — multiple battles", group: "Home", next: "battle-001",
    render: () => {
      const st = ST();
      if (st.matches.length === 0) return `
      ${statusBar()}
      ${topBar({ logo: true })}
      <div class="fx-content">
        ${h1("YOUR BATTLES", "fx-h1--26")}
        ${noBattleState()}
      </div>
      ${nav("battle-001")}`;
      const cards = [...st.matches].reverse().map((m) => {
        const rows = E.standings(m);
        const myId = st.player?.id;
        const mine = rows.find((r) => r.player.id === myId);
        const status = m.status === "live" ? "LIVE" : m.status === "open" ? "RECRUITING" : "COMPLETE";
        const cls = m.status === "live" ? "" : "fg-status--muted";
        const w = m.status === "complete" ? E.winner(m) : null;
        /* temporal: last daily winner goes in the foot, DZ chip in the head */
        const dh = m.dailyHistory ?? {};
        const ld = Object.keys(dh).sort().pop() ?? null;
        const lr = ld ? dh[ld] : null;
        const dailyFoot = lr ? `Last day: ${lr.youWon ? "you won" : lr.winner ? `${lr.winner.name.split(" ")[0]} won` : "nobody logged"} ${D.weekdayShortOf(lr.dayKey)} · see daily recap` : null;
        return battleCard({
          status: w ? (w.playerId === myId ? "YOU WON" : `${(m.players.find(p => p.id === w.playerId)?.name ?? "?").split(" ")[0].toUpperCase()} WON`) : status,
          statusCls: cls,
          meta: `${m.players.length} players · ${S.fmtDays(m.config.playDays)}`,
          title: (m.config.name ?? "Battle").toUpperCase(),
          crewN: m.players.length,
          barPct: mine ? Math.round(mine.progressPct) : 0,
          barColor: m.status === "complete" ? "var(--success)" : "var(--lime)",
          foot: m.status === "complete"
            ? `Winner: ${m.players.find(p => p.id === w?.playerId)?.name ?? "?"} · ${w?.adjustedScore} RUF (adjusted)`
            : dailyFoot ?? (mine ? `You're at ${Math.round(mine.progressPct)}% · ${mine.rawReps}/${m.config.targetReps} reps` : ""),
          border: m.status === "live" ? "purple" : "line",
          chip: dzChip(m),
        });
      }).join("");
      return `
      ${statusBar()}
      ${topBar({ logo: true })}
      <div class="fx-content">
        ${h1("YOUR BATTLES", "fx-h1--26")}
        ${cards}
        <div class="fx-gap8"></div>
        ${btn("SEASON LADDER →", "fx-btn--dark", "season-001")}
      </div>
      ${nav("battle-001")}`;
    },
  },
  {
    id: "home-007", figma: "MOB-HOME-007", name: "Notification centre", group: "Home", next: "battle-001",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Notifications", back: true, bellGo: "battle-001" })}
      <div class="fx-content">
        ${h1("NOTIFICATIONS", "fx-h1--26")}
        <div class="fx-feedlist">
          ${feedItem({ icon: "trophy", tone: "lead", name: "Alex T", action: "took the lead!", meta: "88% complete · just now" })}
          ${feedItem({ icon: "bolt", tone: "power", name: "Jordan P", action: "activated Lightning Round", meta: "Triple reps for 10 min · 5 min ago" })}
          ${feedItem({ icon: "bell", tone: "system", name: "Thunder Hour", action: "starts at 7:00 PM", meta: "All reps count double · today" })}
          ${feedItem({ icon: "flame", tone: "milestone", name: "You", action: "hit a 7-day streak", meta: "Streak reward unlocked · 1 h ago" })}
          ${feedItem({ icon: "check", tone: "", name: "Sam K", action: "logged 25 squats", meta: "+25 RUF · 2 min ago" })}
        </div>
        <div class="fx-gap16"></div>
        ${btn("Mark all as read", "fx-btn--ghost", "battle-001")}
      </div>
      ${nav("feed-nav")}`,
  },
  {
    id: "home-009", figma: "MOB-HOME-009", name: "Return after absence", group: "Home", next: "battle-001",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap48"></div><div class="fx-gap24"></div><div class="fx-gap16"></div>
        ${h1("OI. YOU'RE BACK.", "fx-h1--32 fx-h1--gold")}
        ${sub("9 days away. Here's the damage:", "fx-sub--15")}
        <div class="fx-card fx-card--r14">
          <div class="fx-moments__row">🥇 Sam won 4 of the last 5 days</div>
          <div class="fx-moments__row">🔥 Your 7-day streak ended (Streak Freeze would've saved it)</div>
          <div class="fx-moments__row">💬 12 taunts, mostly about you</div>
        </div>
        <div class="fx-card" style="border-color:var(--energy)">
          <div style="text-align:center;font-size:34px;line-height:1">🚀</div>
          <div class="fx-card__t" style="text-align:center;margin-top:8px">Comeback quest</div>
          <div class="fx-card__s" style="text-align:center">Log 3 days in a row and earn an Epic power-up + your streak multiplier back. Day 1 target is trimmed to 80 RUF to get you moving.</div>
        </div>
        <div class="fx-gap8"></div>
        ${btn("START THE COMEBACK", "fx-btn--primary", "battle-001")}
      </div>`,
  },

  /* ── CREATE ×6 ────────────────────────────────────────────────────── */
  {
    id: "create-002", figma: "MOB-CREATE-002", name: "Fast battle setup", group: "Create", next: "create-014",
    render: () => {
      const d = draft.battle;
      const dayLetter = (i, L) => `<button class="fx-chip fx-chip--day ${d.days.includes(i) ? "fx-chip--on" : ""}" data-day="${i}">${L}</button>`;
      const targetChip = (t) => `<button class="fx-chip fx-chip--target ${d.target === t.id ? "fx-chip--on" : ""}" data-target="${t.id}">${t.label} · ${t.reps} reps</button>`;
      return `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        <div class="fx-seg" style="margin-top:0">
          <button class="fx-seg__item fx-seg__item--on">Fast battle</button>
          <button class="fx-seg__item" ${go("create-005")}>Custom battle</button>
        </div>
        <div class="fx-field">
          <span class="fx-field__label">Battle name</span>
          <input class="fx-input" id="cbName" type="text" maxlength="40" value="${d.name.replace(/"/g, "&quot;")}" autocomplete="off" spellcheck="false">
        </div>
        <p class="fx-field__label" style="margin-top:14px">Battle days</p>
        <div class="fx-chips" id="cbDays">
          ${dayLetter(1, "M")}${dayLetter(2, "T")}${dayLetter(3, "W")}${dayLetter(4, "T")}${dayLetter(5, "F")}${dayLetter(6, "S")}${dayLetter(0, "S")}
        </div>
        ${note("Rest days are free — no targets, no streak risk.")}
        <p class="fx-field__label" style="margin-top:14px">Exercise pack</p>
        <div id="cbPack">
          ${option({ title: "Bodyweight basics", sub: "Push-ups, squats, sit-ups, lunges, plank — no kit needed", sel: d.pack === "bodyweight", go: "" })}
          ${option({ title: "Full-body burner", sub: "Adds burpees. You've been warned", sel: d.pack === "fullbody", go: "" })}
        </div>
        <p class="fx-field__label" style="margin-top:14px">Match target (total reps — first to hit it closes)</p>
        <div class="fx-chips" id="cbTarget">
          ${S.TARGETS.map(targetChip).join("")}
        </div>
        ${note("Handicaps apply: a couch player's reps count ×1.5, an athlete's ×0.85 — the closer doesn't always win.")}
        <div class="fx-gap8"></div>
        ${btn("CREATE & INVITE", "fx-btn--primary", "create-014", 'id="cbCreate"')}
        <div class="fx-gap8"></div>
        ${btn("Switch to custom setup", "fx-btn--ghost", "create-005")}
      </div>`;
    },
  },
  {
    id: "create-005", figma: "MOB-CREATE-005", name: "Custom — schedule & clock", group: "Create", next: "create-008",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("SCHEDULE", "fx-h1--26")}
        ${sub("Step 3 of 8 · Custom battle", "fx-sub--12")}
        <div class="fx-card"><div class="fx-card__t">Duration</div><div class="fx-card__s">2 weeks · Mon 4 Aug → Sun 17 Aug</div></div>
        <div class="fx-card"><div class="fx-card__t">Active days</div><div class="fx-card__s">Mon, Wed, Fri, Sun (4 days/week)</div></div>
        ${option({ title: "Battle clock — Shared", sub: "One group clock: 9:00 PM AEST reset. Everyone sees their local equivalent (e.g. 7:00 PM in Perth, 11:00 AM in London).", sel: true })}
        <div class="fx-card"><div class="fx-card__t">Adaptive global clock</div><div class="fx-card__s">One UTC window shown in each member's local time. Better for spread-out crews.</div></div>
        <div class="fx-info"><span class="fx-info__ic">ⓘ</span><span>Daylight saving: the group clock governs. If clocks shift mid-battle, day boundaries follow the group time zone — never doubled or skipped.</span></div>
        <div class="fx-gap8"></div>
        ${btn("NEXT — FORMAT", "fx-btn--primary", "create-008")}
      </div>`,
  },
  {
    id: "create-008", figma: "MOB-CREATE-008", name: "Custom — exercises & scoring", group: "Create", next: "create-010",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("EXERCISES & SCORING", "fx-h1--26")}
        ${sub("Step 5 of 8 · Every exercise converts to RUF (Reps Units) so different movements compete fairly. Conversion values shown are SAMPLE — final table is admin-controlled.", "fx-sub--12")}
        ${exRow("Push-up", "1 rep = 1 RUF", true)}
        ${exRow("Burpee", "1 rep = 2 RUF", true)}
        ${exRow("Plank", "10 sec = 5 RUF", true)}
        ${exRow("Pull-up", "1 rep = 2 RUF")}
        ${exRow("Kettlebell swing", "1 rep = 1 RUF · technique demo required")}
        <div class="fx-gap8"></div>
        ${btn("+ Add custom exercise", "fx-btn--dark")}
        <div class="fx-gap8"></div>
        ${btn("NEXT — POWER-UPS", "fx-btn--primary", "create-010")}
      </div>`,
  },
  {
    id: "create-010", figma: "MOB-CREATE-010", name: "Custom — stakes", group: "Create", next: "create-012",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("WHAT'S ON THE LINE?", "fx-h1--26")}
        ${sub("Step 7 of 8 · Stakes are optional. Fitness first, drama second.", "fx-sub--12")}
        ${option({ title: "Bragging rights", sub: "Ranks, streaks and the shame of losing. Free forever.", sel: true })}
        ${option({ title: "Dares", sub: "Loser wears the costume. Group agrees the dare up front." })}
        ${option({ title: "Charity pot", sub: "Missed targets donate to a charity the group picks." })}
        <div class="fx-card">
          <div class="fx-card__t">Cash pot — 18+ only</div>
          <div class="fx-card__s">Real-money stakes. Available only where legal — we check eligibility for every player before they can join.</div>
          <div class="fx-card__s" style="color:var(--urgency);font-weight:500">🔒 Requires age &amp; region check</div>
        </div>
        <div class="fx-gap8"></div>
        ${btn("NEXT — REVIEW", "fx-btn--primary", "create-012")}
      </div>`,
  },
  {
    id: "create-012", figma: "MOB-CREATE-012", name: "Review & create", group: "Create", next: "create-014",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("THE RULES, IN PLAIN ENGLISH", "fx-h1--24")}
        ${rule("Battle", "The Sunday Showdown · 2 weeks")}
        ${rule("Days", "Mon, Wed, Fri, Sun · resets 9:00 PM AEST")}
        ${rule("Format", "Everyone for themselves · daily winner")}
        ${rule("Winner rule", "Highest completion % · ties: most RUF, then first to finish")}
        ${rule("Targets", "Personalised · your target is 120 RUF/day")}
        ${rule("Exercises", "Push-ups, burpees, plank (+2 more)")}
        ${rule("Power-ups", "On · Lightning, Shield, Freeze, Steal")}
        ${rule("Stakes", "Bragging rights only")}
        ${note("Rules lock when the battle starts. Everyone sees this summary before they accept.")}
        <div class="fx-gap8"></div>
        ${btn("CREATE BATTLE", "fx-btn--primary", "create-014")}
      </div>`,
  },
  {
    id: "create-014", figma: "MOB-CREATE-014", name: "Waiting room", group: "Create", next: "battle-001",
    render: () => {
      const st = ST();
      const m = [...st.matches].reverse().find((x) => x.status === "open") ?? liveMatch(st);
      const code = st.crewCode ?? "CREW-7Q2";
      if (!m) return `
      ${statusBar()}
      ${topBar({ title: "Waiting room" })}
      <div class="fx-content">${noBattleState()}</div>
      ${nav("battle-001")}`;
      const myId = st.player?.id;
      const members = m.players.map((p, i) => member(
        p.id === myId ? `${st.player.name} (you) · Captain` : `${p.name} · ${p.tier} ×${E.TIER_MULTIPLIERS[p.tier]}`,
        i === 0 ? "Ready · creator" : `Joined · ${p.tier} handicap`, true
      )).join("");
      return `
      ${statusBar()}
      ${topBar({ title: m.config.name ?? "Battle" })}
      <div class="fx-content">
        ${h1("BATTLE CREATED. NOW RECRUIT.", "fx-h1--26 fx-h1--gold")}
        <div class="fx-sharecard">
          <div class="fx-sharecard__link">reps.fit/join/${(m.config.name ?? "BATTLE").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 10)}</div>
          <div class="fx-sharecard__sub">Crew code <b>${code}</b> · in WhatsApp/Slack: <code class="fx-codegram">link ${code}</code></div>
          <div class="fx-sharecard__btns"><button data-copy="${code}">Copy code</button><a class="fx-sharecard__a" href="/connect" target="_blank" rel="noopener">Connect a chat →</a><button ${go("join-001")}>Preview invite</button></div>
        </div>
        <p class="fx-sub fx-sub--13" style="margin-top:20px;font-weight:700;color:var(--text)">CREW (${m.players.length} IN · TARGET ${m.config.targetReps} REPS)</p>
        ${members}
        ${note(`Mates in this build are the demo crew (Sam, Alex, Jordan) — they log back when you tap "simulate mates" on the battle screen. Real friends join via ${code}.`)}
        <div class="fx-gap8"></div>
        ${btn("START EARLY (CAPTAIN ONLY)", "fx-btn--dark", "battle-001", `id="startEarly" data-start="${m.config.id}"`)}
      </div>
      ${nav("battle-001")}`;
    },
  },

  /* ── JOIN ×2 ──────────────────────────────────────────────────────── */
  {
    id: "join-001", figma: "MOB-JOIN-001", name: "Invitation preview", group: "Join", next: "join-003",
    render: () => {
      const st = ST();
      const m = [...st.matches].reverse().find((x) => x.status === "open" && !x.players.some((p) => p.id === st.player?.id)) ??
                 [...st.matches].reverse().find((x) => x.status === "open");
      if (!m) return `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap24"></div>
        <p class="fx-overline">NO PENDING INVITES</p>
        ${h1("THIS IS BEN'S MOCK PREVIEW", "fx-h1--30 fx-h1--gold")}
        <div class="fx-crewnow" style="margin-top:16px">
          ${["BT", "SK", "AT", "JP", "CM"].map(i => `<span class="fg-avatar" style="width:48px;height:48px;font-size:14px">${i}</span>`).join("")}
        </div>
        <p class="fx-sub fx-sub--13">5 mates already in</p>
        <div class="fx-gap8"></div>
        ${rule("Duration", "2 weeks · Mon, Wed, Fri, Sun")}
        ${rule("Your target", "Picked when you join — Light / Solid / Hero")}
        ${rule("Exercises", "Push-ups, burpees, plank, squats, sit-ups")}
        ${rule("Clock", "Resets 9:00 PM AEST · 7:00 PM your time")}
        ${rule("Stakes", "Bragging rights only — no money")}
        <div class="fx-gap8"></div>
        ${btn("CREATE A REAL BATTLE INSTEAD", "fx-btn--primary", "create-002")}
      </div>`;
      const code = st.crewCode ?? "CREW-7Q2";
      return `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap24"></div>
        <p class="fx-overline">YOU'RE INVITED TO</p>
        ${h1((m.config.name ?? "THE BATTLE").toUpperCase(), "fx-h1--34 fx-h1--gold")}
        <div class="fx-crewnow" style="margin-top:16px">
          ${m.players.slice(0, 5).map((p) => `<span class="fg-avatar" style="width:48px;height:48px;font-size:14px">${p.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>`).join("")}
        </div>
        <p class="fx-sub fx-sub--13">${m.players.length} players in · crew code <b>${code}</b> (<code class="fx-codegram">link ${code}</code> in chat)</p>
        <div class="fx-gap8"></div>
        ${rule("Format", `First to ${m.config.targetReps} total reps closes · highest adjusted score wins`)}
        ${rule("Your handicap", "Picked when you join — couch ×1.5 → athlete ×0.85")}
        ${rule("Exercises", m.config.exercises.map((e) => e.name).join(", "))}
        ${rule("Days", S.fmtDays(m.config.playDays))}
        ${rule("Stakes", "Bragging rights + charity pot — no money to winner")}
        <div class="fx-gap8"></div>
        ${btn("ACCEPT — PICK MY LEVEL", "fx-btn--primary", "join-003")}
        <div class="fx-gap8"></div>
        ${btn("Decline", "fx-btn--ghost", "home-002")}
      </div>`;
    },
  },
  {
    id: "join-003", figma: "MOB-JOIN-003", name: "Pick your level", group: "Join", next: "battle-001",
    render: () => {
      const tiers = [
        { id: "couch", title: "Couch — every rep ×1.5", sub: "Just starting out. The engine carries you" },
        { id: "casual", title: "Casual — every rep ×1.25", sub: "I train sometimes", sel: true },
        { id: "fit", title: "Fit — every rep ×1.0", sub: "I train seriously" },
        { id: "athlete", title: "Athlete — every rep ×0.85", sub: "You're a menace. Respect." },
      ];
      return `
      ${statusBar()}
      ${topBar({ title: "Join battle", back: true })}
      <div class="fx-content">
        ${h1("PICK YOUR HANDICAP")}
        ${sub("Effort competes, not raw fitness — every level can win the day. Only you and the engine see this.")}
        <div id="joinTiers">
          ${tiers.map((t) => option({ title: t.title, sub: t.sub, sel: draft.tier === t.id })).join("")}
        </div>
        <div class="fx-gap8"></div>
        ${btn("JOIN THE BATTLE", "fx-btn--primary", "battle-001", 'id="joinGo"')}
      </div>`;
    },
  },

  /* ── BATTLE ×5 ────────────────────────────────────────────────────── */
  {
    id: "battle-001", figma: "MOB-BATTLE-001", name: "Main battle screen", group: "Battle", next: "log-001",
    render: battleUnder,
  },
  {
    id: "battle-002", figma: "MOB-BATTLE-002", name: "Danger zone — 30 min", group: "Battle", next: "log-001", tint: "dz",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "The Sunday Showdown" })}
      <div class="fx-content">
        ${dzBanner("l3", "DANGER ZONE — 24 MINUTES LEFT")}
        <div class="fx-gap12"></div>
        ${countdown({ time: "0:24:12", sub: "30 min left — heartbeat pulse", level: "dz3" })}
        <div class="fx-hero fx-hero--dz3">
          ${ring(75, "90", "of 120 RUF", 140)}
          <div class="fx-hero__line fx-hero__line--danger">30 RUF IN 24 MIN — STILL DOABLE</div>
          <p class="fx-hero__aside">That's 2 quick sets of push-ups. Go. Now.</p>
        </div>
        <div class="fx-info">
          <span style="font-size:16px">🧊</span>
          <span>You're holding a Time Freeze — +30 min for the whole crew</span>
        </div>
        <div class="fx-board">${board([BOARD[1], BOARD[3]])}</div>
      </div>
      ${nav("battle-001")}`,
  },
  {
    id: "battle-004", figma: "MOB-BATTLE-004", name: "Team battle", group: "Battle", next: "log-001",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "The Sunday Showdown" })}
      <div class="fx-content">
        ${h1("TEAM CLASH — DAY 4", "fx-h1--24")}
        <div class="fx-vs">
          <div class="fx-team"><div class="fx-team__name">TEAM THUNDER</div><div class="fx-team__score">212</div><div class="fx-team__sub">RUF today</div></div>
          <div class="fx-team fx-team--b"><div class="fx-team__name">TEAM CHAOS</div><div class="fx-team__score">198</div><div class="fx-team__sub">RUF today</div></div>
        </div>
        <div class="fx-floor">
          <div class="fx-overline">CONTRIBUTION FLOOR — 40 RUF EACH</div>
          <div class="fx-floor__row"><span class="fx-dot" style="background:var(--success)"></span><b>Ben (you)</b><span>62 / 40 ✓</span></div>
          <div class="fx-floor__row"><span class="fx-dot" style="background:var(--success)"></span><b>Sam</b><span>88 / 40 ✓</span></div>
          <div class="fx-floor__row"><span class="fx-dot" style="background:var(--urgency)"></span><b>Alex</b><span style="color:var(--urgency)">24 / 40 — needs 16 more</span></div>
          <p class="fx-note" style="margin-top:10px">Team score only counts in full once everyone clears the floor. Send Alex an Assist Boost?</p>
        </div>
        <div class="fx-gap8"></div>
        ${btn("SEND ASSIST BOOST TO ALEX", "fx-btn--purple")}
      </div>
      ${nav("battle-001")}`,
  },
  {
    id: "battle-005", figma: "MOB-BATTLE-005", name: "Full leaderboard", group: "Battle", next: "battle-006",
    render: () => {
      const st = ST();
      const m = liveMatch(st) ?? lastDone(st);
      if (!m) return `${statusBar()}${topBar({ title: "Leaderboard" })}<div class="fx-content">${noBattleState()}</div>${nav("battle-001")}`;
      const rows = E.standings(m);
      const crewRaw = rows.reduce((s, r) => s + r.rawReps, 0);
      const crewAdj = Math.round(rows.reduce((s, r) => s + r.adjustedScore, 0));
      return `
      ${statusBar()}
      ${topBar({ title: m.config.name ?? "Battle" })}
      <div class="fx-content">
        ${h1("LEADERBOARD", "fx-h1--24")}
        <div class="fx-seg fx-seg--32">
          <button class="fx-seg__item fx-seg__item--on">${m.status === "complete" ? "FINAL (ADJUSTED)" : "LIVE (ADJUSTED)"}</button>
          <button class="fx-seg__item">This battle</button>
          <button class="fx-seg__item">All time</button>
        </div>
        <div class="fx-board">${realBoard(m)}</div>
        <div class="fx-card fx-card--r14" style="background:var(--energy-tint);border-color:transparent;display:flex;justify-content:space-between;align-items:center">
          <span style="font:700 12px/1.2 var(--font-body);color:var(--energy-light)">CREW TOTAL</span>
          <span style="font:700 14px/1.2 var(--font-body);color:var(--text)">${crewRaw} / ${m.config.targetReps * m.players.length} reps · ${crewAdj} RUF</span>
        </div>
        ${note("Ranked by adjusted score (tier handicap × reps, comeback ×1.2, closure +15). Tap LOG to move.", "fx-note--11")}
      </div>
      ${nav("battle-001")}`;
    },
  },
  {
    id: "battle-006", figma: "MOB-BATTLE-006", name: "Activity feed", group: "Battle", next: "result-003",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "The Sunday Showdown" })}
      <div class="fx-content">
        ${h1("THE FEED", "fx-h1--24")}
        ${eventBanner({ icon: "bolt", title: "THUNDER HOUR", subText: "All reps count DOUBLE until 8 PM", tag: "23:41" })}
        <div class="fx-feedlist" style="margin-top:8px">
          ${feedItem({ icon: "check", tone: "", name: "Sam K", action: "logged 25 squats", meta: "+25 RUF · 2 min ago" })}
          ${feedItem({ icon: "trophy", tone: "lead", name: "Alex T", action: "took the lead!", meta: "88% complete · just now" })}
          ${feedItem({ icon: "bolt", tone: "power", name: "Jordan P", action: "activated Lightning Round", meta: "Triple reps for 10 min · 5 min ago" })}
          ${feedItem({ icon: "flame", tone: "milestone", name: "You", action: "hit a 7-day streak", meta: "Streak reward unlocked · 1 h ago" })}
          ${feedItem({ icon: "bell", tone: "system", name: "Thunder Hour", action: "starts at 7:00 PM", meta: "All reps count double · today" })}
        </div>
        <div class="fx-react">
          <span>💪</span><span>🔥</span><span>⚡</span><span>👏</span><span>😂</span><span>👀</span><span>🏆</span><b>+ taunt</b>
        </div>
      </div>
      ${nav("feed-nav")}`,
  },
  {
    id: "feed-nav", figma: "MOB-BATTLE-006", name: "Feed (tab state)", group: "Battle", next: "result-003", hidden: true,
    render: () => SCREENS.find(s => s.id === "battle-006").render(),
  },

  /* ── LOG ×7 ─────────────────────────────────────────────────────── */
  {
    id: "log-001", figma: "MOB-LOG-001", name: "Quick log (bottom sheet)", group: "Log", next: "battle-001",
    render: () => sheetScreen(battleUnder(), quickLogSheet()),
  },
  {
    id: "log-002", figma: "MOB-LOG-002", name: "Exercise picker", group: "Log", next: "log-003",
    render: () => {
      const m = liveMatch(ST());
      const list = m
        ? m.config.exercises.map((e) => exListRow(e.name, "In this battle", "tap to log")).join("")
        : S.EXERCISES.slice(0, 3).map((e) => exListRow(e.name, "No live battle", e.conv)).join("");
      return sheetScreen(battleUnder(), `
      <div class="fx-sheet__grab"></div>
      <h2 class="fx-sheet__h fx-sheet__h--20">PICK AN EXERCISE</h2>
      <div class="fx-search"><span>${ic("search")}</span> ${m ? `${m.config.exercises.length} in this battle` : "20 exercises…"}</div>
      <p class="fx-overline" style="text-align:center;margin-top:8px">${m ? "THIS BATTLE'S SET" : "FAVOURITES"}</p>
      <div class="fx-sheet__rows" id="exPick">
        ${list}
      </div>
      <p style="text-align:center;font:600 12px/1.2 var(--font-body);color:var(--lime);margin:6px 0 0" ${go("log-001")}>BACK TO QUICK LOG ›</p>
    `);
    },
  },
  {
    id: "log-003", figma: "MOB-LOG-003", name: "Timed exercise", group: "Log", next: "log-004",
    render: () => sheetScreen(battleUnder(), `
      <div class="fx-sheet__grab"></div>
      <h2 class="fx-sheet__h fx-sheet__h--20">PLANK — TIMED</h2>
      <div class="fx-timednum">90</div>
      <div class="fx-timedsub">seconds · = 45 RUF</div>
      <div class="fg-sheet__row" style="justify-content:center">
        <button class="fg-chip fx-chip--time">30 s</button>
        <button class="fg-chip fx-chip--time">60 s</button>
        <button class="fg-chip fx-chip--time fx-chip--on">90 s</button>
        <button class="fg-chip fx-chip--time">2 min</button>
      </div>
      <button class="fg-sheet__cta">START LIVE TIMER</button>
      <p style="text-align:center;font:600 13px/1.2 var(--font-body);color:var(--lime);margin:0">or log a time manually</p>
    `),
  },
  {
    id: "log-004", figma: "MOB-LOG-004", name: "Weighted exercise (Gym mode)", group: "Log", next: "log-007",
    render: () => sheetScreen(battleUnder(), `
      <div class="fx-sheet__grab"></div>
      <h2 class="fx-sheet__h fx-sheet__h--20">BENCH PRESS — GYM MODE</h2>
      <div class="fx-gyminputs">
        <div class="fx-gyminput"><div class="fx-gyminput__k">Reps</div><div class="fx-gyminput__v">8</div></div>
        <div class="fx-gyminput"><div class="fx-gyminput__k">Weight</div><div class="fx-gyminput__v">60 kg</div></div>
        <div class="fx-gyminput"><div class="fx-gyminput__k">Sets</div><div class="fx-gyminput__v">3</div></div>
      </div>
      <p style="text-align:center;font:500 13px/1.4 var(--font-body);color:var(--lime);margin:0">24 reps @ 60 kg = 48 RUF (weight band ×2 — SAMPLE value)</p>
      <button class="fg-sheet__cta">LOG 3 × 8 @ 60 KG</button>
    `),
  },
  {
    id: "log-007", figma: "MOB-LOG-007", name: "Large-log confirmation", group: "Log", next: "log-008",
    render: () => sheetScreen(battleUnder(), `
      <div class="fx-dialog">
        <h3 class="fg-dialog__title">200 push-ups in one go?</h3>
        <p class="fg-dialog__body">Respect — but double-check the number. Big entries may be flagged for a friendly proof check in this battle.</p>
        <button class="fg-dialog__cta" ${go("log-008")}>YES, 200. I'M BUILT DIFFERENT</button>
        <button class="fg-dialog__dismiss">Whoops, fix it</button>
      </div>
    `, true),
  },
  {
    id: "log-008", figma: "MOB-LOG-008", name: "Log history & edit", group: "Log", next: "log-009",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("TODAY'S LOGS", "fx-h1--24")}
        ${sub("Edit or delete within 15 min of logging. In wager battles every edit is recorded for the crew to see.", "fx-sub--12")}
        <div class="fx-logrow">
          <div><div class="fx-logrow__t">25 push-ups · 25 RUF</div><div class="fx-logrow__s" style="color:var(--success)">6:42 PM · editable for 9 more min</div></div>
          <div class="fx-logrow__acts"><span class="fx-logrow__edit">Edit</span><span class="fx-logrow__del">Delete</span></div>
        </div>
        <div class="fx-logrow">
          <div><div class="fx-logrow__t">30 burpees · 60 RUF</div><div class="fx-logrow__s">5:10 PM · locked</div></div>
          <span class="fx-logrow__lock">🔒</span>
        </div>
        <div class="fx-logrow">
          <div><div class="fx-logrow__t">60 s plank · 30 RUF</div><div class="fx-logrow__s">1:22 PM · locked</div></div>
          <span class="fx-logrow__lock">🔒</span>
        </div>
        <div class="fx-toast">${ic("check")}+20 push-ups logged · 20 RUF</div>
      </div>
      ${nav("battle-001")}`,
  },
  {
    id: "log-009", figma: "MOB-LOG-009", name: "Offline & queued logs", group: "Log", next: "edge-001",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "The Sunday Showdown" })}
      <div class="fx-content">
        <div class="fx-toast fx-toast--muted">${ic("wifioff")}+20 push-ups logged · 20 RUF</div>
        <div class="fx-statewrap">
          <div class="fg-state">
            <span class="fg-state__icon">${ic("wifioff")}</span>
            <h3 class="fg-state__title">You're offline</h3>
            <p class="fg-state__body">Your reps are safe — they'll sync when you're back online.</p>
          </div>
        </div>
        <p class="fx-overline" style="margin-top:16px">QUEUED — WILL SYNC IN ORDER</p>
        <div class="fx-logrow">
          <div><div class="fx-logrow__t">25 push-ups</div><div class="fx-logrow__s">logged 6:42 PM · queued</div></div>
          <span style="margin-left:auto">⏳</span>
        </div>
        <div class="fx-logrow">
          <div><div class="fx-logrow__t">30 sec plank</div><div class="fx-logrow__s">logged 6:51 PM · queued</div></div>
          <span style="margin-left:auto">⏳</span>
        </div>
        ${note("Timestamps are kept — logs count for the day you did them, as long as they sync before the verification window closes. Duplicates are auto-detected.")}
      </div>
      ${nav("battle-001")}`,
  },

  /* ── RESULT ×5 ───────────────────────────────────────────────────── */
  {
    id: "result-001", figma: "MOB-RESULT-001", name: "Daily winner — you won", group: "Results", next: "result-003", tint: "tint",
    render: () => {
      const st = ST();
      const m = lastDone(st);
      const w = m ? E.winner(m) : null;
      const myId = st.player?.id;
      if (!m || !w || w.playerId !== myId) {
        // not your win — show the honest state
        return `
        ${statusBar()}
        <div class="fx-content">
          <div class="fx-gap96"></div>
          ${h1("NO WIN HERE YET", "fx-h1--36")}
          ${sub(m ? "This screen lights up when YOU take a battle." : "Finish a battle first — this screen reads real results.", "fx-sub--15")}
        <div class="fx-gap8"></div>
        ${m ? btn("SEE THE REAL RESULT", "fx-btn--primary", "result-005") : btn("CREATE A BATTLE", "fx-btn--primary", "create-002")}
      </div>`;
      }
      const rows = E.finalStandings(m);
      const mine = rows.find((r) => r.player.id === myId);
      const second = rows[1];
      return `
      ${confetti()}
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap96"></div>
        ${h1(`YOU WON ${(m.config.name ?? "THE BATTLE").toUpperCase()}`, "fx-h1--42 fx-h1--gold")}
        <div class="fx-trophy">${ic("trophy")}</div>
        ${sub(`${mine.adjustedScore} RUF adjusted · ${mine.rawReps} raw reps · closed by ${m.players.find(p => p.id === m.closedBy)?.name ?? "?"}`, "fx-sub--15")}
        ${second ? sub(`${second.player.name} finished 2nd — ${Math.round(mine.adjustedScore - second.adjustedScore)} RUF behind. Brutal.`, "fx-sub--13") : ""}
        <div class="fx-card fx-card--r14" style="background:var(--energy-tint);border-color:var(--energy);display:flex;gap:12px;align-items:center">
          <span style="font-size:20px">🎁</span>
          <span style="font:600 14px/1.2 var(--font-body);color:var(--text)">Winner directs the charity pot — pick on the final card</span>
        </div>
        <div class="fx-gap8"></div>
        ${btn("SEE FINAL STANDINGS", "fx-btn--primary", "result-005")}
        <div class="fx-gap8"></div>
        ${btn("Share the win", "fx-btn--ghost", "result-007")}
      </div>`;
    },
  },
  {
    id: "result-002", figma: "MOB-RESULT-002", name: "Daily result — Sam won", group: "Results", next: "result-003",
    render: () => {
      const st = ST();
      const m = lastDone(st);
      const w = m ? E.winner(m) : null;
      const myId = st.player?.id;
      if (!m || !w || w.playerId === myId) {
        return `
        ${statusBar()}
        <div class="fx-content">
          <div class="fx-gap96"></div>
          ${h1("NO RESULT YET", "fx-h1--36")}
          ${sub("This screen shows a real loss. Go take one on the chin.", "fx-sub--15")}
          <div class="fx-gap8"></div>
          ${btn(m ? "SEE THE REAL RESULT" : "CREATE A BATTLE", "fx-btn--primary", m ? "result-005" : "create-002")}
        </div>`;
      }
      const rows = E.finalStandings(m);
      const winnerP = m.players.find((p) => p.id === w.playerId);
      const myRow = rows.find((r) => r.player.id === myId);
      const myRank = rows.findIndex((r) => r.player.id === myId) + 1;
      const myStats = S.stats(st);
      return `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap96"></div>
        ${h1(`${winnerP.name.split(" ")[0].toUpperCase()} TOOK IT`, "fx-h1--36")}
        <div style="display:flex;justify-content:center;margin-top:16px"><span class="fg-avatar" style="width:72px;height:72px;font-size:23px">${winnerP.name.split(" ").map(x => x[0]).join("").slice(0, 2)}</span></div>
        ${sub(`${w.adjustedScore} RUF adjusted${w.closedMatch ? " · closed the match" : " · never closed — out-scored the closer"}`, "fx-sub--15")}
        ${myRow ? sub(`You finished ${ordinal(myRank)} on ${Math.round(myRow.adjustedScore)} RUF adjusted (${myRow.rawReps} raw).`, "fx-sub--13") : ""}
        <div class="fx-stats">
          <div class="fx-stat"><div class="fx-stat__v">🔥 ${myStats.streak}</div><div class="fx-stat__k">streak</div></div>
          <div class="fx-stat"><div class="fx-stat__v">💪 ${myStats.wins}</div><div class="fx-stat__k">wins</div></div>
          <div class="fx-stat"><div class="fx-stat__v">📈 ${myStats.lifetimeReps}</div><div class="fx-stat__k">lifetime reps</div></div>
        </div>
        <div class="fx-gap8"></div>
        ${btn("REMATCH — RUN IT BACK", "fx-btn--primary", "result-005")}
        <div class="fx-gap8"></div>
        ${btn("Send a taunt", "fx-btn--dark")}
      </div>`;
    },
  },
  {
    id: "result-003", figma: "MOB-RESULT-003", name: "Daily recap", group: "Results", next: "result-005",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "The Sunday Showdown" })}
      <div class="fx-content">
        ${h1("TUESDAY — DAY 3 OF 8", "fx-h1--24")}
        <div class="fx-board">${board()}</div>
        <div class="fx-moments">
          <div class="fx-overline">MOMENTS</div>
          <div class="fx-moments__row">⚡ Jordan's Lightning Round netted 54 RUF in 10 min</div>
          <div class="fx-moments__row">👑 Lead changed 4 times after 6 PM</div>
          <div class="fx-moments__row">🔥 Whole crew logged — first clean sweep this battle</div>
        </div>
        <div class="fx-nextday">NEXT BATTLE DAY: THURSDAY 9:00 AM</div>
      </div>
      ${nav("battle-001")}`,
  },
  {
    /* the REAL daily winner + recap — Ben's MOB-RESULT-001/002/003 wired to
       match.dailyHistory via daily.js (FLOW-07). result-003 above stays as
       his mock frame; this one computes from actual logged entries. */
    id: "daily-001", figma: "MOB-RESULT-001/002/003", name: "Daily winner & recap (real)", group: "Results", next: "battle-001",
    render: () => {
      const st = ST();
      const withDays = st.matches.filter((m) => m.dailyHistory && Object.keys(m.dailyHistory).length > 0);
      const m = withDays[withDays.length - 1] ?? null; // recap needs a closed day
      if (!m) return `
      ${statusBar()}
      ${topBar({ title: "Daily recap", back: true })}
      <div class="fx-content">
        ${h1("NO DAY CLOSED YET", "fx-h1--30")}
        ${sub("Every battle day closes at its deadline — winner, standings and moments land here.", "fx-sub--15")}
        <div class="fx-gap8"></div>
        ${btn("GO TO BATTLE", "fx-btn--primary", "battle-001")}
      </div>`;
      const hist = m.dailyHistory ?? {};
      const keys = Object.keys(hist).sort();
      const liveDay = m.status === "live" ? D.currentDayKey(m, D.now()) : null;
      const sel = dailyDaySel && keys.includes(dailyDaySel) ? dailyDaySel : keys[keys.length - 1];
      const r = D.recapFor(m, sel, { youId: st.player?.id, nowTs: D.now() });
      const maxAdj = Math.max(...r.standings.map((x) => x.adjustedScore), 1);
      const rows = r.standings.map((row, i) => `
        <div class="fx-drow ${i === 0 ? "fx-drow--win" : ""} ${row.playerId === st.player?.id ? "fx-drow--you" : ""}">
          <span class="fx-drow__rank">${i + 1}</span>
          <span class="fg-avatar" style="width:44px;height:44px;font-size:13px">${row.playerId === st.player?.id ? (st.player?.name ?? "You").split(" ").map(w => w[0]).join("").slice(0, 2) : row.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
          <div class="fx-drow__info">
            <span class="fx-drow__name">${row.playerId === st.player?.id ? `${st.player?.name ?? "You"} (you)` : row.name}${i === 0 ? ic("crown") : ""}</span>
            <span class="fx-drow__bar"><i style="width:${Math.round((row.adjustedScore / maxAdj) * 100)}%"></i></span>
          </div>
          <div class="fx-drow__score">
            <div class="fx-drow__pts">${Math.round(row.adjustedScore)}</div>
            <div class="fx-drow__sets">RUF · ${row.sets} set${row.sets === 1 ? "" : "s"} · ${row.rawReps} raw</div>
          </div>
        </div>`).join("");
      const chips = keys.map((k) => `
        <button class="fx-daychip" data-day="${k}" aria-pressed="${k === sel}">${D.weekdayShortOf(k)}${hist[k].youWon ? " ★" : ""}</button>`).join("") +
        (liveDay ? `<span class="fx-daychip fx-daychip--live">${D.weekdayShortOf(liveDay)} · LIVE</span>` : "");
      return `
      ${r.youWon ? confetti() : ""}
      ${statusBar()}
      ${topBar({ title: m.config.name ?? "Battle", back: true })}
      <div class="fx-content">
        <div class="fx-winnercard ${r.winner ? (r.youWon ? "fx-winnercard--won" : "") : "fx-winnercard--brutal"}">
          ${r.youWon ? `<div class="fx-winnercard__trophy">${ic("trophy")}</div>` : r.winner ? `<div style="display:flex;justify-content:center"><span class="fg-avatar" style="width:72px;height:72px;font-size:23px">${r.winner.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span></div>` : `<div class="fx-winnercard__trophy">${ic("clock")}</div>`}
          ${h1(r.headline, r.youWon ? "fx-h1--36 fx-h1--gold" : "fx-h1--30")}
          ${r.winner ? sub(`${Math.round(r.winner.adjustedScore)} RUF adjusted · ${r.winner.rawReps} raw reps — the handicap story, not the raw one`, "fx-sub--13") : sub("The deadline hit with zero logs. Streaks survive — pride doesn't.", "fx-sub--13")}
          ${r.youLine ? `<p class="fx-winnercard__sub">${r.youLine}${r.standings.length > 1 && r.yourRank === 1 ? ` ${r.standings[1] ? `${r.standings[1].name.split(" ")[0]} finished 2nd — ${Math.max(1, Math.round(r.standings[0].adjustedScore - r.standings[1].adjustedScore))} RUF behind. Brutal.` : ""}` : ""}</p>` : ""}
          ${r.ledLine ? `<p class="fx-winnercard__sub">${r.ledLine}</p>` : ""}
          ${r.potDeltaCents > 0 ? `<p class="fx-winnercard__sub">Charity pot grew <b>$${(r.potDeltaCents / 100).toFixed(2)}</b> today — $${(r.potTotalCents / 100).toFixed(2)} banked.</p>` : ""}
        </div>
        ${keys.length + (liveDay ? 1 : 0) > 1 ? `<div class="fx-daychips">${chips}</div>` : `<div class="fx-daychips">${chips}</div>`}
        <p class="fx-overline" style="margin-top:16px">${D.weekdayOf(sel)} — ADJUSTED STANDINGS</p>
        <div class="fx-board">${rows || `<div class="fx-note">No logs this day.</div>`}</div>
        ${r.nemesis ? `<div class="fx-nemesis">${ic("crown")} ${r.nemesis}</div>` : ""}
        <div class="fx-moments">
          <div class="fx-overline">MOMENTS</div>
          ${r.moments.map((mm) => `<div class="fx-moments__row">${mm}</div>`).join("")}
        </div>
        <div class="fx-nextday">${r.tomorrow.label} — ${r.tomorrow.sub}</div>
        <div class="fx-gap8"></div>
        ${m.status === "complete" ? btn("SEE FINAL RESULT", "fx-btn--primary", "result-005") : btn("BACK TO BATTLE — LOG FOR " + r.tomorrow.label.replace("NEXT BATTLE DAY: ", ""), "fx-btn--primary", "battle-001")}
        <div class="fx-gap8"></div>
        ${r.winner && !r.youWon ? btn(`${ic("bell")} SET A REVENGE REMINDER FOR 7 AM`, "fx-btn--dark", "", 'id="revengeBtn"') : ""}
        ${r.youWon ? btn("Share the win", "fx-btn--ghost", "result-007") : ""}
      </div>
      ${nav("battle-001")}`;
    },
  },
  {
    id: "result-005", figma: "MOB-RESULT-005", name: "Final battle result", group: "Results", next: "set-005", tint: "tint",
    render: () => {
      const st = ST();
      const m = lastDone(st);
      if (!m) return `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap48"></div><div class="fx-gap16"></div>
        ${h1("NO FINISHED BATTLE", "fx-h1--34")}
        ${sub("Close one out first — first player to the raw target ends it.", "fx-sub--15")}
        <div class="fx-gap8"></div>
        ${btn("GO TO BATTLE", "fx-btn--primary", "battle-001")}
      </div>`;
      const rows = E.finalStandings(m);
      const w = E.winner(m);
      const myId = st.player?.id;
      const winnerP = m.players.find((p) => p.id === w.playerId);
      const top3 = rows.slice(0, 3);
      const maxAdj = Math.max(...rows.map((r) => r.adjustedScore), 1);
      const podium = (r, hgt, color, rankTxt) => r ? `
        <div class="fx-podium__col"><span class="fx-podium__name">${r.player.id === myId ? "You" : r.player.name.split(" ")[0]}</span>
        <div class="fx-podium__bar" style="height:${hgt}px;background:${color}"></div>
        <span class="fx-podium__rank" style="color:${color === "var(--lime)" ? "var(--lime)" : "var(--muted)"}">${rankTxt}</span></div>` : "";
      // real awards from the entry log
      const mostSets = [...m.players].map((p) => ({ p, n: m.entries.filter((e) => e.playerId === p.id).length })).sort((a, b) => b.n - a.n)[0];
      const mostRaw = [...m.players].map((p) => ({ p, raw: E.playerRawReps(p.id, m.entries) })).sort((a, b) => b.raw - a.raw)[0];
      const cbUser = m.entries.find((e) => e.comeback);
      const cbP = cbUser ? m.players.find((p) => p.id === cbUser.playerId) : null;
      const pot = S.potFor(m.config.id, st);
      const potTotal = E.potTotalCents(pot);
      const designated = pot.designatedCharityId;
      const iWon = w.playerId === myId;
      return `
      ${confetti()}
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap48"></div><div class="fx-gap16"></div>
        <p class="fx-overline" style="color:var(--energy-light);text-align:center">BATTLE COMPLETE</p>
        ${h1(`${(iWon ? "YOU WIN" : winnerP.name.split(" ")[0].toUpperCase() + " WINS")}<br>${(m.config.name ?? "THE BATTLE").toUpperCase()}`, "fx-h1--38 fx-h1--gold")}
        ${sub(`${w.adjustedScore} RUF adjusted · closed by ${m.players.find(p => p.id === m.closedBy)?.name ?? "?"} (+15 closure bonus)`, "fx-sub--15")}
        <div class="fx-podium">
          ${podium(top3[1], 70, "color-mix(in srgb, var(--muted) 35%, transparent)", "2nd")}
          ${podium(top3[0], 100, "var(--lime)", "1st")}
          ${podium(top3[2], 50, "color-mix(in srgb, var(--urgency) 35%, transparent)", "3rd")}
        </div>
        <div class="fx-card fx-card--r14">
          <div class="fx-moments__row">🏅 ${top3[0].player.id === myId ? "You" : top3[0].player.name} — ${top3[0].adjustedScore} RUF (winner)</div>
          <div class="fx-moments__row">🚀 Best comeback — ${cbP ? (cbP.id === myId ? "you claimed ×1.2" : cbP.name.split(" ")[0] + " claimed ×1.2") : "nobody needed it"}</div>
          <div class="fx-moments__row">⚡ Most active — ${mostRaw.p.id === myId ? "you" : mostRaw.p.name} (${mostRaw.raw} reps)</div>
          <div class="fx-moments__row">💪 Most consistent — ${mostSets.p.id === myId ? "you" : mostSets.p.name} (${mostSets.n} sets)</div>
        </div>
        <div class="fx-pot">
          <div class="fx-overline" style="text-align:center;margin-top:4px">CHARITY POT — WINNER DIRECTS, NO CASH TO WINNER</div>
          <div class="fx-pot__total">$${(potTotal / 100).toFixed(2)} BANKED · ${pot.contributions.length} CONTRIBUTION${pot.contributions.length === 1 ? "" : "S"}</div>
          <div class="fx-pot__row">
            ${[200, 500, 1000].map((c) => `<button class="fx-pot__chip" data-pot-add="${c}">+$${c / 100}</button>`).join("")}
          </div>
          <div class="fx-pot__row" id="potCharities">
            ${S.CHARITIES.map((c) => `<button class="fx-pot__charity ${designated === c.id ? "fx-pot__charity--on" : ""}" data-pot-pick="${c.id}" ${iWon ? "" : "disabled"}>${c.name}${designated === c.id ? " ✓" : ""}</button>`).join("")}
          </div>
          ${iWon ? note("You won — pick where the pot goes.") : note("Only the winner directs the pot. Chip in if you're feeling noble.")}
        </div>
        <div class="fx-gap8"></div>
        ${btn("REMATCH — SAME RULES", "fx-btn--primary", "battle-001", `id="rematchBtn" data-rematch="${m.config.id}"`)}
        <div class="fx-gap8"></div>
        ${btn("Season ladder", "fx-btn--dark", "season-001")}
      </div>`;
    },
  },
  {
    id: "result-007", figma: "MOB-RESULT-007", name: "Share card preview", group: "Results", next: "set-005",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        ${h1("SHARE YOUR WIN", "fx-h1--26")}
        <div class="fx-sharewin">
          <div class="fx-sharewin__logo">REPS·WF</div>
          <div class="fx-sharewin__title">BEN WON
TUESDAY</div>
          <div class="fx-sharewin__sub">124 RUF · beat 4 mates · 6-day streak</div>
          <div class="fx-sharewin__cta">Think you'd beat him? reps.fit/join/SHOWDOWN</div>
        </div>
        <div class="fx-dests"><button>WhatsApp</button><button>Stories</button><button>iMessage</button><button>More</button></div>
        ${note("Card never shows health data — only battle results. Message is pre-written and editable.", "fx-note--11")}
      </div>`,
  },

  /* ── PWR ×5 ──────────────────────────────────────────────────────── */
  /* FLOW-05: pwr-001 (inventory) + pwr-002 (detail) are REAL — backed by
     the engine inventory in rwf.figma.v1. pwr-004 (lightning full-screen)
     stays mock, pwr-006 chest cadence is mock but the reveal grants a real
     card, pwr-007 store is mock + DEV GRANT. */
  {
    id: "pwr-001", figma: "MOB-PWR-001", name: "Power-up inventory", group: "Power-Ups", next: "pwr-002",
    render: () => {
      const st = ST();
      const m = liveMatch(st);
      const inv = m ? E.inventoryOf(m, st.player?.id) : [];
      const kinds = ["lightning", "steal", "shield", "freeze"];
      const slots = Math.max(6, inv.length);
      const card = (kind) => {
        const def = E.POWER_UPS[kind];
        const n = inv.filter((i) => i.kind === kind).length;
        return `
        <div class="fg-pwr fg-pwr--${def.rarity}" ${n ? `data-pwrsel="${kind}"` : ""} style="${n ? "cursor:pointer" : "opacity:0.45"}">
          <span class="fg-pwr__rarity">${def.rarity.toUpperCase()}${n > 1 ? ` ×${n}` : ""}</span>
          <span class="fg-pwr__art">${ic(def.icon)}</span>
          <h3 class="fg-pwr__name">${def.name}</h3>
          <p class="fg-pwr__desc">${n ? def.blurb : "none held"}</p>
        </div>`;
      };
      return `
      ${statusBar()}
      <div class="fx-content">
        ${h1("YOUR ARSENAL", "fx-h1--26")}
        ${m
          ? sub(`${inv.length} of ${slots} slots used in “${m.config.name ?? "battle"}” · commons would expire after 7 days (not enforced in this build).`, "fx-sub--12")
          : sub("No live battle — power-ups live inside one. Create a battle and every player starts with a free random card.", "fx-sub--12")}
        <div class="fx-pwrgrid">
          ${kinds.map(card).join("")}
        </div>
        <div class="fx-gap16"></div>
        <button class="fx-btn fx-btn--purple" id="devGrant" data-grant="${m?.config.id ?? ""}" ${m ? "" : "disabled"}>⚡ DEV GRANT — ALL FOUR, EVERY PLAYER</button>
        <p class="fx-note fx-note--11">DEV GRANT replaces the store in this build — it exists so the founder can actually play all four power-ups. The real store ships later.</p>
        <div class="fx-drop" ${go("pwr-006")}>🎁 Daily drop ready — open your free card</div>
      </div>
      ${nav("pwr-001")}`;
    },
    wire: (root) => {
        root.querySelectorAll("[data-pwrsel]").forEach((c) =>
          c.addEventListener("click", () => { selectedPwr = c.dataset.pwrsel; }));
        root.querySelector("#devGrant")?.addEventListener("click", (e) => {
          const id = e.currentTarget.dataset.grant;
          if (!id) { toast("⚠️ No battle to grant into"); return; }
          const r = S.devGrant(id);
        toast(`${ic("bolt")}DEV GRANT — all four power-ups × ${r.granted / 4} players. Go play.`);
        route();
      });
    },
  },
  {
    id: "pwr-002", figma: "MOB-PWR-002", name: "Card detail & activation", group: "Power-Ups", next: "pwr-004",
    render: () => {
      const st = ST();
      const m = liveMatch(st);
      const kind = selectedPwr ?? "lightning";
      const def = E.POWER_UPS[kind] ?? E.POWER_UPS.lightning;
      const myId = st.player?.id;
      const n = m ? E.inventoryOf(m, myId).filter((i) => i.kind === kind).length : 0;
      const shieldArmed = m?.shields?.[myId];
      const litActive = m ? E.lightningActive(m, myId) : false;
      const litUsed = m?.lightningUsed?.[myId];
      const steal = m ? E.stealPreview(m, myId) : null;
      const rules = {
        lightning: [
          ["Window", "10 minutes, server-timed — starts the second you confirm"],
          ["Effect", "every rep you log in the window counts ×3 (stacks with a comeback ×1.2)"],
          ["Limit", "one activation per player per match — the cap survives the window expiring"],
          ["Best used", "one big set left and the clock is closing"],
        ],
        steal: [
          ["Target", steal ? `${steal.victim.id === myId ? "You lead — your leading rival is next" : `${steal.victim.name} (${steal.victimRaw} reps)`} — takes ${steal.amount} instantly` : "the CURRENT leading rival by raw reps"],
          ["Math", "10% of their raw reps, rounded down, minimum 1"],
          ["Shielded?", steal?.blocked ? `${steal.victim.name} is shielded — your steal bounces and their shield breaks` : "if they're shielded, the steal is blocked and their shield breaks — your card survives"],
          ["Ledger", "raw AND adjusted both move — at each side's handicap multiplier"],
        ],
        shield: [
          ["Effect", "blocks one rep steal against you, then breaks"],
          ["Armed", shieldArmed ? "yes — you are protected right now" : "no"],
          ["Stacking", "one armed at a time; re-arm after it breaks"],
        ],
        freeze: [
          ["Effect", "extends the battle deadline by 30 minutes for the whole crew"],
          ["Stacks", "multiple freezes add up (+30 min each)"],
          ["Deadline", m ? fmtDeadline(m.deadlineAt) : "—"],
        ],
      }[kind];
      const cta = !m ? "NO LIVE BATTLE"
        : litActive ? "LIGHTNING ALREADY LIVE"
        : kind === "lightning" && litUsed ? "USED THIS MATCH"
        : kind === "shield" && shieldArmed ? "SHIELD ALREADY ARMED"
        : n === 0 ? "NONE HELD — DEV GRANT ON THE ARSENAL SCREEN"
        : null;
      return sheetScreen(battleUnder(), `
      <div class="fx-sheet__grab"></div>
      <div style="display:flex;justify-content:center">
        <div class="fg-pwr fg-pwr--${def.rarity}" style="width:272px;padding:20px">
          <span class="fg-pwr__rarity" style="font-size:12px">${def.rarity.toUpperCase()}${n > 1 ? ` ×${n}` : ""}</span>
          <span class="fg-pwr__art" style="width:102px;height:102px">${ic(def.icon)}</span>
          <h3 class="fg-pwr__name" style="font-size:25px">${def.name}</h3>
          <p class="fg-pwr__desc" style="font-size:14px">${def.blurb}</p>
        </div>
      </div>
      <div class="fx-card" style="margin-top:4px">
        <div style="font:700 12px/1.2 var(--font-body);color:var(--lime)">${def.name} · ${def.rarity.toUpperCase()}</div>
        ${rules.map(([k, v]) => `<div class="fx-rule"><span class="fx-rule__k">${k}</span><span class="fx-rule__v">${v}</span></div>`).join("")}
      </div>
      ${cta
        ? `<button class="fg-sheet__cta" disabled style="opacity:0.5">${cta}</button>`
        : `<button class="fg-sheet__cta" id="pwrActivate" data-pwr="${kind}" data-match="${m.config.id}">ACTIVATE ${def.name.toUpperCase()}</button>`}
      <button class="fg-sheet__cta" style="background:none;color:var(--lime)" ${go("pwr-001")}>Save it for later</button>
    `);
    },
    wire: (root) => {
      const act = root.querySelector("#pwrActivate");
      if (!act) return;
      act.addEventListener("click", () => {
        let out;
        try { out = S.activateInMatch(act.dataset.match, { kind: act.dataset.pwr }); }
        catch (err) { toast(`⚠️ ${err.message}`); return; }
        if (out.result.ok && out.result.kind === "steal" && !out.result.blocked && out.result.stolen > 0) {
          pendingFlash = { victim: out.result.victimId, thief: out.result.playerId, at: Date.now() };
        }
        toast(pwrToast(out.result, out.match));
        location.hash = "#/battle-001";
      });
    },
  },
  {
    id: "pwr-004", figma: "MOB-PWR-004", name: "Lightning Round active", group: "Power-Ups", next: "pwr-007",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "The Sunday Showdown" })}
      <div class="fx-content">
        <div class="fx-activebanner">
          <span style="font-size:24px">⚡</span>
          <div>
            <div class="fx-activebanner__t">LIGHTNING ROUND — 3× REPS</div>
            <div class="fx-activebanner__s">6:12 remaining · every log counts triple</div>
          </div>
        </div>
        <div style="display:flex;justify-content:center;margin-top:16px">${ring(75, "90", "of 120 RUF", 140)}</div>
        <div class="fx-feedlist" style="margin-top:8px">
          ${feedItem({ icon: "bolt", tone: "power", name: "Jordan P", action: "activated Lightning Round", meta: "Triple reps for 10 min · 5 min ago" })}
        </div>
        <div class="fx-gap8"></div>
        ${btn("LOG REPS (3× ACTIVE)", "fx-btn--primary", "log-001")}
      </div>
      ${nav("pwr-001")}`,
  },
  {
    id: "pwr-006", figma: "MOB-PWR-006", name: "Daily loot reveal", group: "Power-Ups", next: "pwr-007", tint: "tint",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap96"></div><div class="fx-gap24"></div>
        ${h1("DAILY DROP", "fx-h1--30")}
        <div class="fx-chestwrap">
          <button class="fx-chest" id="chest" aria-label="Open chest">${ic("chest")}</button>
          <span class="fx-tap-open" id="tapOpen">TAP TO OPEN</span>
        </div>
        ${sub("Come back every day you battle — streaks improve your odds of Rare+. Founders keep this forever. (Cadence is still mock in this build, but the card you pull is REAL — it lands in your live battle inventory.)", "fx-sub--12")}
        <div class="fx-gap16"></div>
        <div id="lootReveal"></div>
      </div>`,
  },
  {
    id: "pwr-007", figma: "MOB-PWR-007", name: "Power-up store", group: "Power-Ups", next: "set-005",
    render: () => {
      const st = ST();
      const m = liveMatch(st);
      return `
      ${statusBar()}
      <div class="fx-content">
        ${h1("THE STORE", "fx-h1--26")}
        ${sub("Cosmetic and convenience only — you can't buy the win. Purchase caps: 3 packs/week (SAMPLE). No IAP in this build — use the DEV GRANT instead.", "fx-sub--12")}
        ${storeRow("Starter pack", "3 random cards · max Rare", "$1.99")}
        ${storeRow("Battle pack", "5 random cards · 1 guaranteed Epic", "$4.99")}
        ${storeRow("Streak Freeze", "Protect one missed day", "$0.99")}
        <div class="fx-gap12"></div>
        <button class="fx-btn fx-btn--purple" id="devGrant" data-grant="${m?.config.id ?? ""}" ${m ? "" : "disabled"}>⚡ DEV GRANT — REPLACES THE STORE IN THIS BUILD</button>
        <p class="fx-note fx-note--11">Grants all four power-ups to every player in the live battle — so the founder can play the whole mechanic today. The real store + caps ship with the economy.</p>
        ${note("Disabled in wager battles where the crew turned off purchased power-ups. Purchases are separate from any wager money.", "fx-note--11")}
      </div>
      ${nav("pwr-001")}`;
    },
    wire: (root) => {
      root.querySelector("#devGrant")?.addEventListener("click", (e) => {
        const id = e.currentTarget.dataset.grant;
        if (!id) { toast("⚠️ No live battle to grant into"); return; }
        const r = S.devGrant(id);
        toast(`${ic("bolt")}DEV GRANT — all four power-ups × ${r.granted / 4} players`);
        route();
      });
    },
  },

  /* ── WAGER ×6 (all feature-flagged) ──────────────────────────────── */
  {
    id: "wager-001", figma: "MOB-WAGER-001", name: "Stakes explainer", group: "Wagers (flagged)", next: "wager-002",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("CASH STAKES, EXPLAINED", "fx-h1--26")}
        ${sub("This battle has a real-money pot. Here's exactly how it works — no fine print games.")}
        ${point("Everyone puts in the same", "$10.00 entry (SAMPLE). One currency per pot.")}
        ${point("The rules are locked at start", "Winner-takes-all, ties split evenly. Displayed before you pay.")}
        ${point("Platform fee is shown up front", "We take a small fee from the pot — the exact % is always displayed before you commit (SAMPLE: 5%).")}
        ${point("Money is held by our payment partner", "Paid out within 2 business days of the result. Disputes pause settlement.")}
        <div class="fx-info"><span class="fx-info__ic">ⓘ</span><span>18+ only. Availability depends on your country and region. Play with money you'd happily lose to a mate — set limits any time in Responsible Play.</span></div>
        <div class="fx-gap8"></div>
        ${btn("CHECK IF I'M ELIGIBLE", "fx-btn--primary", "wager-002")}
      </div>`,
  },
  {
    id: "wager-002", figma: "MOB-WAGER-002", name: "Eligibility check", group: "Wagers (flagged)", next: "wager-005",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("QUICK ELIGIBILITY CHECK", "fx-h1--26")}
        ${check("Age — verified 18+", "From your account date of birth", "ok")}
        ${check("Region — Australia (NSW)", "Cash stakes available in your region", "ok")}
        ${check("Identity check", "Required before your first payout, not before playing", "warn")}
        <div class="fx-info"><span class="fx-info__ic">ⓘ</span><span>Exact verification requirements depend on region and are pending final legal review — this flow is a placeholder pattern.</span></div>
        <div class="fx-gap8"></div>
        ${btn("CONTINUE TO PAYMENT", "fx-btn--primary", "wager-005")}
      </div>`,
  },
  {
    id: "wager-003", figma: "MOB-WAGER-003", name: "Region restricted", group: "Wagers (flagged)", next: "battle-001",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        <div class="fx-gap16"></div>
        <div class="fx-statewrap">
          <div class="fg-state">
            <span class="fg-state__icon">${ic("lock")}</span>
            <h3 class="fg-state__title">Not available in your region</h3>
            <p class="fg-state__body">Cash stakes aren't available where you are. Points, dares and charity stakes still work.</p>
          </div>
        </div>
        ${sub("The battle continues without you in the pot — you'll still compete for the day's win, streaks and loot.", "fx-sub--13")}
        <div class="fx-gap8"></div>
        ${btn("JOIN WITHOUT THE POT", "fx-btn--primary", "battle-001")}
      </div>`,
  },
  {
    id: "wager-005", figma: "MOB-WAGER-005", name: "Payment", group: "Wagers (flagged)", next: "wager-016",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("JOIN THE POT", "fx-h1--26")}
        <div class="fx-card">
          <div class="fx-kv"><span class="fx-kv__k">Entry</span><span class="fx-kv__v">$10.00 AUD</span></div>
          <div class="fx-kv"><span class="fx-kv__k">Platform fee (SAMPLE 5%)</span><span class="fx-kv__v">$0.50 — taken from pot</span></div>
          <div class="fx-kv"><span class="fx-kv__k">Current pot</span><span class="fx-kv__v">$40.00 · 4 players</span></div>
          <div class="fx-kv"><span class="fx-kv__k">Payout rule</span><span class="fx-kv__v">Winner takes all · ties split</span></div>
        </div>
        <div class="fx-gap8"></div>
        ${btn(" Pay $10.00 with Apple Pay", "fx-btn--black", "wager-016")}
        <div class="fx-gap8"></div>
        ${btn("Pay with card", "fx-btn--dark", "wager-016")}
        ${note("Money is held with our payment partner — never 'escrow'. Fee shown before you commit.")}
      </div>`,
  },
  {
    id: "wager-016", figma: "MOB-WAGER-016", name: "Settlement & payout", group: "Wagers (flagged)", next: "wager-011",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("POT SETTLED", "fx-h1--26")}
        <div class="fx-pot">
          <div class="fx-pot__k">YOU WON</div>
          <div class="fx-pot__v">$38.00</div>
          <div class="fx-pot__s">$40.00 pot − $2.00 platform fee (SAMPLE)</div>
        </div>
        ${payRow("Entry — The Sunday Showdown", "$10.00 · paid 12 Jul", "ok")}
        ${payRow("Entry — The Sunday Showdown", "$10.00 · processing", "warn")}
        <div class="fx-info"><span class="fx-info__ic">ⓘ</span><span>Payout to your linked account within 2 business days (SAMPLE SLA). A dispute filed during the verification window pauses payout until resolved.</span></div>
        <div class="fx-gap8"></div>
        ${btn("View transaction history", "fx-btn--ghost")}
      </div>`,
  },
  {
    id: "wager-011", figma: "MOB-WAGER-011", name: "Responsible play", group: "Wagers (flagged)", next: "set-001",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("RESPONSIBLE PLAY", "fx-h1--26")}
        ${sub("Stakes should make battles spicier — never stressful. These controls apply to all cash features.", "fx-sub--13")}
        ${setting("Monthly stake limit", "$50 / month")}
        ${setting("Per-battle limit", "$10")}
        ${setting("Cooling-off period", "Off")}
        ${setting("Self-exclusion from cash battles", "Off")}
        <div class="fx-info"><span class="fx-info__ic">ⓘ</span><span>Limits take effect immediately; raising them takes 24 h. Support resources and final copy pending compliance review.</span></div>
      </div>`,
  },

  /* ── PROFILE & SETTINGS ×5 ───────────────────────────────────────── */
  {
    id: "profile-001", figma: "MOB-PROFILE-001", name: "Profile", group: "Profile & Settings", next: "set-001",
    render: () => {
      const st = ST();
      const p = you(st);
      const t = S.stats(st);
      const initials = (p?.name ?? "You").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
      const ladder = S.ladder(st);
      const myLadder = ladder.findIndex((r) => r.playerId === p?.id) + 1;
      return `
      ${statusBar()}
      <div class="fx-content">
        <div style="display:flex;justify-content:center;margin-top:12px"><span class="fg-avatar" style="width:72px;height:72px;font-size:23px">${initials}</span></div>
        ${h1((p?.name ?? "SET UP YOUR PROFILE").toUpperCase(), "fx-h1--26")}
        <p class="fx-sub fx-sub--13" style="text-align:center">${p ? `${p.tier} tier · every rep ×${E.TIER_MULTIPLIERS[p.tier]}` : "finish onboarding to create your player"}${ladder.length ? ` · season rank ${myLadder || "—"}` : ""}</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;flex-wrap:wrap">
          <span class="fg-badge">${ic("flame")}${t.streak} DAY STREAK</span>
          <span class="fg-badge fg-badge--premium">${ic("crown")}${t.wins} WON</span>
          ${t.comebacks > 0 ? `<span class="fg-badge">${ic("bolt")}${t.comebacks} COMEBACK${t.comebacks === 1 ? "" : "S"}</span>` : ""}
        </div>
        <div class="fx-pstats">
          <div class="fx-pstat"><div class="fx-pstat__v">${t.lifetimeReps.toLocaleString()}</div><div class="fx-pstat__k">lifetime reps</div></div>
          <div class="fx-pstat"><div class="fx-pstat__v">${t.lifetimeAdjusted.toLocaleString()}</div><div class="fx-pstat__k">lifetime RUF</div></div>
          <div class="fx-pstat"><div class="fx-pstat__v">${t.played}</div><div class="fx-pstat__k">battles</div></div>
          <div class="fx-pstat"><div class="fx-pstat__v">${t.sets}</div><div class="fx-pstat__k">sets logged</div></div>
        </div>
        <div class="fx-menu">
          ${menuRow("Battle history", "home-003")}
          ${menuRow("Season ladder", "season-001")}
          ${menuRow("Achievements & streak calendar")}
          ${menuRow("Exercise stats & records")}
          ${menuRow("Friends", "social-001")}
          ${menuRow("Power-up inventory", "pwr-001")}
          ${menuRow("Settings", "set-001")}
          ${menuRow(`ℹ️ About · v${APP_VERSION} · build ${BUILD_HASH}`, "about-001")}
        </div>
      </div>
      ${nav("profile-001")}`;
    },
  },
  {
    id: "set-001", figma: "MOB-SET-001", name: "Settings", group: "Profile & Settings", next: "set-003",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("SETTINGS", "fx-h1--24")}
        <p class="fx-menurow__group" style="margin-left:0">ACCOUNT</p>
        <div class="fx-menu">
          ${menuRow("Edit profile", "profile-001")}
          ${menuRow("Time zone & quiet hours", "auth-009")}
        </div>
        <p class="fx-menurow__group" style="margin-left:0">BATTLES</p>
        <div class="fx-menu">
          ${menuRow("Notification intensity", "set-003")}
          ${menuRow("Default target level", "join-003")}
          ${menuRow("Integrations & wearables")}
        </div>
        <p class="fx-menurow__group" style="margin-left:0">MONEY</p>
        <div class="fx-menu">
          ${menuRow("Subscription — Free plan", "set-005")}
          ${menuRow("Payment methods (wagers)", "wager-005")}
          ${menuRow("Responsible play", "wager-011")}
        </div>
        <p class="fx-menurow__group" style="margin-left:0">SUPPORT</p>
        <div class="fx-menu">
          ${menuRow(`About this app · v${APP_VERSION}`, "about-001")}
          ${menuRow("Help centre")}
          ${menuRow("Report a problem")}
          ${menuRow("Terms & privacy policy")}
          ${menuRow("Log out")}
          ${menuRow("Delete account", "", true)}
        </div>
      </div>
      ${nav("profile-001")}`,
  },
  {
    id: "set-003", figma: "MOB-SET-003", name: "Notifications & quiet hours", group: "Profile & Settings", next: "set-005",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("NOTIFICATIONS", "fx-h1--24")}
        <p class="fx-overline" style="margin-top:16px">GLOBAL INTENSITY</p>
        <div class="fx-seg fx-seg--32">
          <button class="fx-seg__item">Quiet</button>
          <button class="fx-seg__item fx-seg__item--on">Standard</button>
          <button class="fx-seg__item">Chaos</button>
        </div>
        ${toggleRow("Lead changes & close calls", true)}
        ${toggleRow("Power-up events", true)}
        ${toggleRow("Taunts & reactions", true)}
        <div class="fx-card fx-card--r12 fx-card--row" style="margin-top:8px">
          <div><div class="fx-card__t" style="font-size:14px">Danger-zone final warning</div><div class="fx-card__s" style="color:var(--urgency)">Overrides quiet hours</div></div>
          <button class="fx-toggle" aria-label="Danger-zone final warning"></button>
        </div>
        ${toggleRow("Daily result", true)}
        ${toggleRow("Marketing", false)}
        ${note("Quiet hours: 10:00 PM – 7:00 AM (local). Non-urgent noise waits until morning.")}
      </div>`,
  },
  {
    id: "set-005", figma: "MOB-SET-005", name: "Reps Pro paywall", group: "Profile & Settings", next: "set-005b",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap16"></div>
        ${h1("REPS PRO", "fx-h1--34 fx-h1--gold")}
        ${sub("Your first crew is free forever. Pro is for the greedy ones.", "fx-sub--14")}
        <div class="fx-card">
          <div class="fx-kv"><span></span><span class="fx-kv__k">Free</span><span class="fx-kv__v" style="color:var(--lime)">Pro</span></div>
          <div class="fx-kv"><span class="fx-kv__k">Active battles</span><span class="fx-kv__k">1</span><span class="fx-kv__v" style="color:var(--lime)">Unlimited</span></div>
          <div class="fx-kv"><span class="fx-kv__k">Power-up inventory</span><span class="fx-kv__k">4 slots</span><span class="fx-kv__v" style="color:var(--lime)">12 slots</span></div>
          <div class="fx-kv"><span class="fx-kv__k">Advanced stats & trends</span><span class="fx-kv__k">—</span><span class="fx-kv__v" style="color:var(--lime)">✓</span></div>
          <div class="fx-kv"><span class="fx-kv__k">Premium share cards</span><span class="fx-kv__k">—</span><span class="fx-kv__v" style="color:var(--lime)">✓</span></div>
          <div class="fx-kv"><span class="fx-kv__k">Streak Freeze / month</span><span class="fx-kv__k">—</span><span class="fx-kv__v" style="color:var(--lime)">1 free</span></div>
        </div>
        <div class="fx-plans">
          <div class="fx-plan"><span class="fx-plan__name">Monthly</span><span class="fx-plan__price">$7.99</span></div>
          <div class="fx-plan fx-plan--sel"><span class="fx-plan__flag">SAVE 37%</span><span class="fx-plan__name">Annual</span><span class="fx-plan__price">$59.99</span></div>
          <div class="fx-plan"><span class="fx-plan__flag">FOUNDERS · 214 LEFT</span><span class="fx-plan__name">Lifetime</span><span class="fx-plan__price">$149</span></div>
        </div>
        ${note("Prices are SAMPLE · country-adjusted pricing applies · cancel anytime", "fx-note--11")}
        <div class="fx-gap8"></div>
        ${btn("START ANNUAL — $59.99/YR", "fx-btn--primary", "set-005b")}
        <div class="fx-gap8"></div>
        ${btn("Restore purchase · Manage · Terms", "fx-btn--ghost", "set-005b")}
      </div>`,
  },
  {
    id: "set-005b", figma: "MOB-SET-005b", name: "Manage subscription", group: "Profile & Settings", next: "social-001",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("YOUR SUBSCRIPTION", "fx-h1--24")}
        <div class="fx-card" style="background:var(--energy-tint);border-color:var(--energy)">
          <div class="fx-card__t">REPS PRO — ANNUAL</div>
          <div class="fx-card__s" style="color:var(--muted)">Renews 24 Jul 2027 · $59.99/yr · via App Store</div>
        </div>
        <div class="fx-menu">
          ${menuRow("Change plan", "set-005")}
          ${menuRow("Restore purchases")}
          ${menuRow("Payment failed? Update billing in App Store")}
          ${menuRow("Cancel subscription", "", true)}
        </div>
        ${note("Cancelling keeps Pro until the period ends, then drops to Free — your battles and history are never deleted. We'll show one save offer, never a maze.")}
      </div>`,
  },
  {
    /* v1.0.0 — the version surface: what this build is, honestly. */
    id: "about-001", figma: "MOB-SET-001", name: "About this app", group: "Profile & Settings", next: "profile-001",
    render: () => {
      const t = S.stats();
      return `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("ABOUT THIS APP", "fx-h1--24")}
        <div class="fx-card fx-card--r14" style="text-align:center">
          <div class="fx-wordmark fx-wordmark--sm" style="margin:8px auto 10px">REPS<i>·</i>WF</div>
          <div style="font:400 22px/1.3 var(--font-display);text-transform:uppercase">Reps With Friends</div>
          <div class="fx-card__s" style="margin-top:6px">prototype · v${APP_VERSION}</div>
          <div class="fx-card__s">build ${BUILD_HASH} · ${BUILD_DATE}</div>
        </div>
        ${rule("What's real", "the game engine — handicaps (couch ×1.5 → athlete ×0.85), comeback ×1.2, closure bonus, power-ups, charity pots, the season ladder")}
        ${rule("Your data", `lives on this device only · ${t.played} battle${t.played === 1 ? "" : "s"} · ${t.lifetimeReps.toLocaleString()} lifetime reps`)}
        ${rule("Offline", "installable PWA — after first load it works with the network off")}
        ${rule("Honesty", "screens still carrying mock content wear a DEMO chip")}
        <div class="fx-gap8"></div>
        ${btn("▶  WATCH THE DEMO — 75 SECONDS", "fx-btn--dark", "", 'data-demo-start')}
        <div class="fx-gap8"></div>
        <a class="fx-btn fx-btn--ghost" href="/wiki" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">EXPLORE THE SYSTEM — THE WIKI →</a>
        ${note("Every element, blocker and design decision, documented: rwf.qalarc.com/wiki")}
      </div>
      ${nav("profile-001")}`;
    },
  },

  /* ── SOCIAL & INTEGRITY ×3 ───────────────────────────────────────── */
  {
    id: "social-001", figma: "MOB-SOCIAL-001", name: "Friends", group: "Social & Integrity", next: "integ-001",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("FRIENDS", "fx-h1--24")}
        <div class="fx-search"><span>${ic("search")}</span> Search by name or @username</div>
        <p class="fx-overline" style="color:var(--urgency);margin-top:16px">PENDING (1)</p>
        <div class="fx-friend fx-friend--pending">
          <span class="fg-avatar" style="width:48px;height:48px;font-size:14px">CM</span>
          <div><div class="fx-friend__t">Casey M</div><div class="fx-friend__s">wants to be battle buddies</div></div>
          <div class="fx-friend__act"><span>Accept</span><span class="fx-friend__x">✕</span></div>
        </div>
        <p class="fx-overline" style="margin-top:16px">FRIENDS (12)</p>
        ${friendRow("Sam K", "3 shared battles · won 8 days vs you", true)}
        ${friendRow("Alex T", "2 shared battles")}
        ${friendRow("Jordan P", "1 shared battle · on a 4-day streak", true)}
        <div class="fx-gap8"></div>
        ${btn("+ INVITE A MATE (LINK OR CONTACTS)", "fx-btn--dark")}
      </div>`,
  },
  {
    id: "integ-001", figma: "MOB-INTEG-001", name: "Flag a result", group: "Social & Integrity", next: "integ-003",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-scrim">
        <div class="fx-sheet">
          <div class="fx-sheet__grab"></div>
          <h2 class="fx-sheet__h" style="font-size:18px">CHALLENGE SAM'S 200 BURPEES?</h2>
          <p class="fx-sub fx-sub--13" style="text-align:center;margin:0">Keep it friendly — a challenge just asks Sam to confirm or add proof. It's anonymous to the rest of the crew.</p>
          <div class="fx-sheet__rows">
            <div class="fx-option fx-option--sel" style="margin-top:0"><span class="fx-option__title" style="font-size:13px;font-weight:500">Looks like a typo (e.g. 200 vs 20)</span></div>
            <div class="fx-option"><span class="fx-option__title" style="font-size:13px;font-weight:500">Pace seems impossible</span></div>
            <div class="fx-option"><span class="fx-option__title" style="font-size:13px;font-weight:500">Pattern looks off (same log repeated)</span></div>
          </div>
          <button class="fg-sheet__cta" ${go("integ-003")}>SEND CHALLENGE</button>
          <p class="fg-sheet__note">3 challenges per battle · misuse lowers your own trust score</p>
        </div>
      </div>`,
  },
  {
    id: "integ-003", figma: "MOB-INTEG-003", name: "Dispute status", group: "Social & Integrity", next: "edge-001",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("DISPUTE #204", "fx-h1--24")}
        ${tlRow("Challenge sent", "Tue 8:41 PM", "ok")}
        ${tlRow("Sam responded with video proof", "Tue 9:02 PM", "ok")}
        ${tlRow("Under review", "Payout on hold for this battle day", "warn")}
        ${tlRow("Decision", "Expected within 24 h (SAMPLE SLA)", "off")}
        ${note("Both players can see this timeline. The rest of the crew only sees the outcome if a score changes. Repeated upheld challenges reduce trust and can require verified-only logging.")}
      </div>`,
  },

  /* ── EDGE ×3 ─────────────────────────────────────────────────────── */
  {
    id: "edge-001", figma: "MOB-EDGE-001", name: "Sync conflict", group: "Edge cases", next: "edge-002",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap96"></div>
        ${h1("QUICK CHECK", "fx-h1--26")}
        <div class="fx-card" style="border-color:var(--urgency);text-align:center">
          <div style="font-size:34px">🔄</div>
          <div class="fx-card__t" style="text-align:center;margin-top:8px;font-size:17px">Two versions of one set</div>
          <div class="fx-card__s" style="text-align:center">You logged 25 push-ups offline on your watch AND 25 in the app at 6:42 PM. Same set, or two separate sets?</div>
        </div>
        <div class="fx-gap8"></div>
        ${btn("ONE SET — KEEP 25", "fx-btn--primary", "battle-001")}
        <div class="fx-gap8"></div>
        ${btn("Two sets — keep 50", "fx-btn--dark", "battle-001")}
        ${note("Duplicate detection compares exercise, count and a 3-minute window. In wager battles, the choice is recorded in the audit trail.")}
      </div>`,
  },
  {
    id: "edge-002", figma: "MOB-EDGE-002", name: "Removed from battle", group: "Edge cases", next: "home-001",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap96"></div><div class="fx-gap16"></div>
        <div class="fx-card" style="text-align:center">
          <div style="font-size:34px">🚪</div>
          <div class="fx-card__t" style="text-align:center;margin-top:8px;font-size:17px">You've left The Sunday Showdown</div>
          <div class="fx-card__s" style="text-align:center">The captain removed you (or you left). Your logged history stays in the battle record. Any pot entry from before day 1 is refunded automatically.</div>
        </div>
        <div class="fx-gap8"></div>
        ${btn("BACK TO MY BATTLES", "fx-btn--primary", "home-001")}
        <div class="fx-gap8"></div>
        ${btn("Think this was a mistake?", "fx-btn--ghost")}
      </div>`,
  },
  {
    id: "edge-003", figma: "MOB-EDGE-003", name: "Timezone / DST change", group: "Edge cases", next: "corp-002",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap96"></div><div class="fx-gap16"></div>
        <div class="fx-card" style="border-color:var(--sky);text-align:center">
          <div style="font-size:34px">🕐</div>
          <div class="fx-card__t" style="text-align:center;margin-top:8px;font-size:17px">Clocks changed — battle unchanged</div>
          <div class="fx-card__s" style="text-align:center">Daylight saving started in Sydney. The battle still resets at 9:00 PM group time; for you that's now 8:00 PM local. No days are doubled or skipped.</div>
        </div>
        <div class="fx-card fx-card--r12" style="background:var(--ink-navy);border-color:transparent">
          <div class="fx-kv"><span class="fx-kv__k">Group clock (controls the battle)</span><span class="fx-kv__v">9:00 PM AEDT</span></div>
          <div class="fx-kv"><span class="fx-kv__k">Your local equivalent</span><span class="fx-kv__v">8:00 PM AEST → updates automatically</span></div>
          <div class="fx-kv"><span class="fx-kv__k">Next reset</span><span class="fx-kv__v">in 4 h 12 m</span></div>
        </div>
        <div class="fx-gap8"></div>
        ${btn("GOT IT", "fx-btn--primary", "corp-002")}
      </div>`,
  },

  /* ── CORP ×1 ─────────────────────────────────────────────────────── */
  {
    id: "corp-002", figma: "MOB-CORP-002", name: "Company battle home", group: "Corporate", next: "",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "The Sunday Showdown" })}
      <div class="fx-content">
        ${h1("ACME STEP-UP CHALLENGE", "fx-h1--22")}
        ${sub("Engineering vs Sales vs Ops · Week 2 of 4 · charity stake: winning dept picks the cause", "fx-sub--12")}
        ${corpRow("ENGINEERING (YOU)", "4,212 RUF", 78, true)}
        ${corpRow("SALES", "3,980 RUF", 72)}
        ${corpRow("OPS", "3,660 RUF", 66)}
        <div class="fx-info">
          <span style="color:var(--sky)">🔒</span>
          <span>Your employer sees team totals and participation rates only — never your individual logs, health data or activity times.</span>
        </div>
        ${sub("Your contribution this week: 486 RUF · 3rd in Engineering", "fx-sub--13")}
        <div class="fx-gap8"></div>
        ${btn("Leave challenge (no questions asked)", "fx-btn--ghost")}
      </div>
      ${nav("battle-001")}`,
  },

  /* ── SEASON ×1 — real ladder from recorded match history ─────────── */
  {
    id: "season-001", figma: "RWF-SEASON-001", name: "Season ladder", group: "Season", next: "battle-001",
    render: () => {
      const st = ST();
      const ladder = S.ladder(st);
      const season = st.season;
      if (!season || ladder.length === 0) return `
      ${statusBar()}
      ${topBar({ title: "Season", back: true })}
      <div class="fx-content">
        ${h1("SEASON 1", "fx-h1--26")}
        ${noBattleState()}
        ${note("The ladder fills as battles complete — 3/2/1 points for 1st/2nd/3rd, +1 MVP, 4-week series.")}
      </div>
      ${nav("battle-001")}`;
      const myId = st.player?.id;
      const champ = season.champion;
      const rows = ladder.map((r, i) => `
      <div class="fx-ladderow ${r.playerId === myId ? "fx-ladderow--you" : ""}">
        <span class="fx-ladderow__rank">${i === 0 ? ic("crown") : i + 1}</span>
        <span class="fg-avatar" style="width:40px;height:40px;font-size:12px">${(r.playerId === myId ? st.player.name : r.name).split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
        <div class="fx-ladderow__info">
          <span class="fx-ladderow__name">${r.playerId === myId ? `${st.player.name} (you)` : r.name}${champ === r.playerId ? " 🏆" : ""}</span>
          <span class="fx-ladderow__sub">${r.wins}W · ${r.played} played${r.mvpCount ? ` · ${r.mvpCount} MVP` : ""}</span>
        </div>
        <span class="fx-ladderow__pts">${r.points}<i>PTS</i></span>
      </div>`).join("");
      return `
      ${statusBar()}
      ${topBar({ title: season.config.name ?? "Season", back: true })}
      <div class="fx-content">
        ${h1(`${(season.config.name ?? "SEASON").toUpperCase()} LADDER`, "fx-h1--24")}
        ${sub(`Week ${season.week} of ${season.config.weeks} · ${season.results.length} match${season.results.length === 1 ? "" : "es"} recorded · 3/2/1 points + MVP`, "fx-sub--12")}
        ${champ ? `<div class="fx-cbbanner">${ic("crown")}${st.season.players.find(p => p.id === champ)?.name ?? champ} IS CHAMPION — SEASON COMPLETE</div>` : ""}
        <div class="fx-board">${rows}</div>
        ${note("Points come from real completed battles: 1st = 3, 2nd = 2, 3rd = 1, MVP (most raw reps) +1. Ties break on wins, then MVPs, then name.")}
        <div class="fx-gap8"></div>
        ${btn("BACK TO BATTLE", "fx-btn--dark", "battle-001")}
      </div>
      ${nav("battle-001")}`;
    },
  },
];

/* ── small row builders used above ───────────────────────────────────── */
function exRow(name, conv, sel = false) {
  return `<div class="fx-card fx-card--r12 fx-card--row" style="margin-top:8px;${sel ? "border-color:color-mix(in srgb, var(--lime) 70%, transparent)" : ""}">
    <div style="display:flex;gap:12px;align-items:center">
      <span class="fx-check ${sel ? "" : "fx-check--off"}">${ic("check")}</span>
      <div><div class="fx-card__t" style="font-size:15px">${name}</div><div class="fx-card__s">${conv}</div></div>
    </div>
  </div>`;
}
function exListRow(name, cat, conv) {
  return `<div class="fx-card fx-card--r12 fx-card--row" style="margin-top:0;background:var(--bg)">
    <div><div class="fx-card__t" style="font-size:15px">${name}</div><div class="fx-card__s">${cat}</div></div>
    <span style="font:500 12px/1.2 var(--font-body);color:var(--lime)">${conv}</span>
  </div>`;
}
function member(name, statusText, ready = false) {
  return `<div class="fx-member">
    <span class="fx-dot" style="background:${ready ? "var(--success)" : "var(--faint)"}"></span>
    <div><div class="fx-member__t">${name}</div><div class="fx-member__s">${statusText}</div></div>
  </div>`;
}
function storeRow(name, subText, price) {
  return `<div class="fx-storerow">
    <span class="fx-storerow__ic">${ic("chest")}</span>
    <div><div class="fx-storerow__t">${name}</div><div class="fx-storerow__s">${subText}</div></div>
    <span class="fx-storerow__price">${price}</span>
  </div>`;
}
function point(t, s) {
  return `<div class="fx-card fx-card--r12" style="margin-top:8px"><div class="fx-card__t" style="font-size:14px">${t}</div><div class="fx-card__s">${s}</div></div>`;
}
function check(t, s, state) {
  return `<div class="fx-card fx-card--r12 fx-card--row" style="margin-top:8px">
    <div style="display:flex;gap:12px;align-items:center">
      <span class="fx-dot" style="width:12px;height:12px;background:${state === "ok" ? "var(--success)" : "var(--urgency)"}"></span>
      <div><div class="fx-card__t" style="font-size:14px">${t}</div><div class="fx-card__s">${s}</div></div>
    </div>
  </div>`;
}
function payRow(t, s, state) {
  return `<div class="fx-payrow">
    <span class="fx-dot" style="width:10px;height:10px;background:${state === "ok" ? "var(--success)" : "var(--urgency)"}"></span>
    <div><div class="fx-logrow__t">${t}</div><div class="fx-logrow__s">${s}</div></div>
    <span class="fx-logrow__lock" style="margin-left:auto">${ic("chevron")}</span>
  </div>`;
}
function setting(t, v) {
  return `<div class="fx-card fx-card--r12 fx-card--row" style="margin-top:8px;min-height:45px">
    <span class="fx-card__t" style="font-size:14px">${t}</span><span class="fx-menurow__val">${v}</span>
  </div>`;
}
function toggleRow(t, on) {
  return `<div class="fx-card fx-card--r12 fx-card--row" style="margin-top:8px">
    <span class="fx-card__t" style="font-size:14px">${t}</span>
    <button class="fx-toggle ${on ? "" : "fx-toggle--off"}" aria-label="${t}"></button>
  </div>`;
}
function menuRow(t, g = "", danger = false) {
  return `<button class="fx-menurow ${danger ? "fx-menurow--danger" : ""}" ${g ? go(g) : ""}>
    <span>${t}</span><span class="fx-menurow__chev">${ic("chevron")}</span>
  </button>`;
}
function friendRow(name, subText, online = false) {
  return `<div class="fx-friend">
    <span class="fg-avatar ${online ? "fg-avatar--online" : ""}" style="width:48px;height:48px;font-size:14px">${name.split(" ").map(w => w[0]).join("")}</span>
    <div><div class="fx-friend__t">${name}</div><div class="fx-friend__s">${subText}</div></div>
    <div class="fx-friend__act"><span>Challenge</span></div>
  </div>`;
}
function tlRow(t, s, state) {
  const col = state === "ok" ? "var(--success)" : state === "warn" ? "var(--urgency)" : "var(--ink-line-strong, var(--line-bright))";
  return `<div class="fx-tl ${state === "warn" ? "fx-tl--warn" : ""}">
    <span class="fx-dot" style="width:12px;height:12px;background:${col}"></span>
    <div><div class="fx-tl__t">${t}</div><div class="fx-tl__s">${s}</div></div>
  </div>`;
}
function corpRow(t, v, pct, you = false) {
  return `<div class="fx-corprow ${you ? "fx-corprow--you" : ""}">
    <div class="fx-card__row"><span class="fx-corprow__t">${t}</span><span class="fx-corprow__v">${v}</span></div>
    <div class="fx-corprow__bar"><i style="width:${pct}%"></i></div>
  </div>`;
}

/* ═════════════════════════════ ROUTER ═════════════════════════════════ */

const GROUPS = [
  ["Onboarding (AUTH)", "Splash → value → signup → tier → notif modes → done. Ben's 12-screen careful onboarding."],
  ["Home", "First use, active battle, multiple battles, notification centre, return after absence."],
  ["Create", "Fast battle (1 screen) + custom wizard steps Figma exported (3/5/7/8 of 8)."],
  ["Join", "Invitation preview + pick your level (Light/Solid/Hero)."],
  ["Battle", "Main screen, danger zone 30 min, team battle, full leaderboard, activity feed."],
  ["Log", "Quick sheet (≤3 taps), picker, timed, gym mode, large-log confirm, history, offline queue."],
  ["Results", "Daily winner, daily loss, recap + MOMENTS, final + awards, share card — plus the REAL daily winner/recap (daily-001) from each closed play day."],
  ["Season", "The real ladder — 3/2/1 points + MVP from completed battles."],
  ["Power-Ups", "Inventory, card detail, Lightning active, store, daily loot."],
  ["Wagers (flagged)", "All feature-flagged: explainer, eligibility, region, payment, settlement, responsible play."],
  ["Profile & Settings", "Profile, settings, notifications, Reps Pro paywall, manage subscription."],
  ["Social & Integrity", "Friends graph, flag a result, dispute timeline."],
  ["Edge cases", "Sync conflict resolver, removed from battle, DST change."],
  ["Corporate", "Company battle home (mobile view)."],
];

function renderIndex() {
  const app = $("#app");
  app.className = "fx-app";
  const groups = GROUPS.map(([g, desc]) => {
    const items = SCREENS.filter(s => s.group === g && !s.hidden);
    if (!items.length) return "";
    return `
      <div class="fx-index__group">${g} · ${items.length}</div>
      <div class="fx-index__list">
        ${items.map(s => `
          <button class="fx-index__item" ${go(s.id)}>
            <span class="fx-index__id">${s.figma}</span>
            <span class="fx-index__name">${s.name}</span>
            <span class="fx-index__chev">${ic("chevron")}</span>
          </button>`).join("")}
      </div>
      <p class="fx-index__sub" style="margin:4px 8px 0">${desc}</p>`;
  }).join("");
  const html = `
  ${statusBar()}
  <div class="fx-index">
    <div class="fx-index__hero">
      <div class="fx-wordmark fx-wordmark--sm" style="margin:0 auto">REPS<i>·</i>WF</div>
      <h1 class="fx-index__title">THE FIGMA TEST APP</h1>
      <p class="fx-index__sub">Ben's complete design — all 65 screens — now with the REAL game engine: handicapped scoring, comeback ×1.2, closure bonus, charity pots and the season ladder, persisted in your browser. Screens still showing mock content carry a DEMO chip. Everything works offline.</p>
      <div class="fx-gap16"></div>
      ${btn("▶  START THE REAL APP (ONBOARDING)", "fx-btn--primary", "auth-008")}
      <div class="fx-gap8"></div>
      ${btn("▶  WATCH THE DEMO — self-playing tour", "fx-btn--dark", "", 'data-demo-start')}
      <div class="fx-gap8"></div>
      ${btn("Jump straight into a live battle", "fx-btn--ghost", "battle-001")}
    </div>
    ${groups}
  </div>`;
  app.innerHTML = html;
}

function renderScreen(id) {
  const app = $("#app");
  const s = SCREENS.find(x => x.id === id);
  if (!s) { location.hash = ""; return; }
  app.className = "fx-app" + (s.tint === "tint" ? " fx-app--tint" : s.tint === "dz" ? " fx-app--dz" : "");
  app.innerHTML = s.render();
  if (DEMO_SCREENS.has(id)) app.insertAdjacentHTML("afterbegin", demoChip());
  wireQuickLog(app);
  wireChest(app);
  wirePowerUps(app);
  wireScreen(app, id);
  s.wire?.(app); // per-screen wiring (FLOW-05 pwr screens)
  applyPendingFlash(app);
  try { D.tickCountdowns(); } catch {} // paint live deadline + DZ chrome immediately
  document.title = `${s.figma} · ${s.name} — RWF Figma Test`;
}

/* ── DEMO chip: honest labelling of screens that are still Ben's mock ── */
const DEMO_SCREENS = new Set([
  "auth-001", "auth-002", "auth-003", "auth-004", "auth-006", "auth-007", "auth-011", "auth-013",
  "create-005", "create-008", "create-010", "create-012",
  "battle-002", "battle-004", "battle-006", "feed-nav",
  "log-003", "log-004", "log-007", "log-008", "log-009",
  "result-003", "result-007",
  /* pwr-001 (inventory) + pwr-002 (detail/activation) went REAL in FLOW-05;
     pwr-004 (lightning full-screen mock) / pwr-006 (chest cadence) /
     pwr-007 (store — DEV GRANT replaces it) stay demo-chipped */
  "pwr-004", "pwr-006", "pwr-007",
  "wager-001", "wager-002", "wager-003", "wager-005", "wager-011", "wager-016",
  "set-005", "set-005b",
  "social-001", "integ-001", "integ-003",
  "edge-001", "edge-002", "edge-003",
  "corp-002", "home-007", "home-009",
]);
function demoChip() {
  return `<span class="fx-demochip" title="This screen is Ben's design with mock data — the core loop screens are real.">DEMO</span>`;
}

/* ── per-screen wiring for the REAL interactions ─────────────────────── */
function wireScreen(root, id) {
  /* onboarding: name */
  const nameInput = root.querySelector("#obName");
  if (nameInput) {
    nameInput.addEventListener("input", () => {
      draft.name = nameInput.value;
      const av = root.querySelector(".fx-avatarpick .fg-avatar");
      if (av) av.textContent = (draft.name || "BT").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
      const un = root.querySelector(".fx-field__box--ph");
      if (un) un.textContent = `@${(draft.name || "you").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "you"}`;
    });
    root.querySelector("#obNameNext")?.addEventListener("click", () => {
      draft.name = nameInput.value.trim() || "Player One";
    });
  }

  /* onboarding: tier options (auth-010) */
  const tierOpts = root.querySelector("#tierOpts");
  if (tierOpts) {
    const TIERS = ["couch", "casual", "fit", "athlete"];
    const opts = [...tierOpts.querySelectorAll(".fx-option")];
    const paint = () => opts.forEach((o, i) => o.classList.toggle("fx-option--sel", TIERS[i] === draft.tier));
    opts.forEach((o, i) => o.addEventListener("click", () => { draft.tier = TIERS[i]; paint(); }));
    paint();
    root.querySelector("#tierNext")?.addEventListener("click", () => {
      S.setPlayer({ name: draft.name, tier: draft.tier });
    });
  }

  /* join: tier options (join-003) */
  const joinTiers = root.querySelector("#joinTiers");
  if (joinTiers) {
    const TIERS = ["couch", "casual", "fit", "athlete"];
    const opts = [...joinTiers.querySelectorAll(".fx-option")];
    const paint = () => opts.forEach((o, i) => o.classList.toggle("fx-option--sel", TIERS[i] === draft.tier));
    opts.forEach((o, i) => o.addEventListener("click", () => { draft.tier = TIERS[i]; paint(); }));
    paint();
    root.querySelector("#joinGo")?.addEventListener("click", () => {
      const st = ST();
      S.setPlayer({ name: st.player?.name ?? draft.name, tier: draft.tier });
      const open = [...st.matches].reverse().find((x) => x.status === "open" && !x.players.some((p) => p.id === st.player?.id));
      if (open) {
        S.mutate((s) => {
          const mm = s.matches.find((x) => x.config.id === open.config.id);
          mm.players.push(s.player);
        });
        toast(`${ic("check")}Joined ${(open.config.name ?? "battle")} as ${draft.tier} ×${E.TIER_MULTIPLIERS[draft.tier]}`);
      }
    });
  }

  /* create battle form */
  const cbName = root.querySelector("#cbName");
  if (cbName) {
    cbName.addEventListener("input", () => { draft.battle.name = cbName.value; });
    root.querySelector("#cbDays")?.addEventListener("click", (e) => {
      const c = e.target.closest("[data-day]");
      if (!c) return;
      const d = Number(c.dataset.day);
      const has = draft.battle.days.includes(d);
      draft.battle.days = has ? draft.battle.days.filter(x => x !== d) : [...draft.battle.days, d];
      c.classList.toggle("fx-chip--on", !has);
    });
    root.querySelector("#cbPack")?.addEventListener("click", (e) => {
      const o = e.target.closest(".fx-option");
      if (!o) return;
      const idx = [...root.querySelectorAll("#cbPack .fx-option")].indexOf(o);
      draft.battle.pack = idx === 1 ? "fullbody" : "bodyweight";
      root.querySelectorAll("#cbPack .fx-option").forEach((x, i) => x.classList.toggle("fx-option--sel", i === idx));
    });
    root.querySelector("#cbTarget")?.addEventListener("click", (e) => {
      const c = e.target.closest("[data-target]");
      if (!c) return;
      draft.battle.target = c.dataset.target;
      root.querySelectorAll("#cbTarget .fx-chip").forEach(x => x.classList.toggle("fx-chip--on", x === c));
    });
    root.querySelector("#cbCreate")?.addEventListener("click", () => {
      if (!you()) S.setPlayer({ name: draft.name, tier: draft.tier }); // safety: never create without a player
      S.createFastBattle({
        name: cbName.value.trim() || "The Sunday Showdown",
        days: draft.battle.days.length ? draft.battle.days : [1, 3, 5],
        pack: draft.battle.pack,
        target: draft.battle.target,
      });
    });
  }

  /* waiting room: start early + copy code */
  const startBtn = root.querySelector("#startEarly");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      S.startById(startBtn.dataset.start);
      toast(`${ic("bolt")}Battle is LIVE — first to target closes it`);
    });
  }
  root.querySelector("[data-copy]")?.addEventListener("click", (e) => {
    const code = e.currentTarget.dataset.copy;
    try { navigator.clipboard?.writeText(code); } catch {}
    toast(`${ic("check")}Crew code ${code} copied — paste \`link ${code}\` in your crew chat`);
  });

  /* battle: power-up inventory sheet (FLOW-05) */
  root.querySelector("#pwrBtn")?.addEventListener("click", () => openOverlay(powerUpSheet()));

  /* battle (FLOW-06): danger-zone LOG NOW → quick-log sheet */
  root.querySelector("[data-dz-log]")?.addEventListener("click", () => openOverlay(quickLogSheet()));

  /* daily recap (FLOW-07): day chips + revenge reminder
     (.fx-daychip scope is load-bearing: bare [data-day] also matches the
     CREATE-battle day chips and re-rendered them before the #cbDays
     handler could update the draft — FLOW-05 e2e caught the collision) */
  root.querySelectorAll(".fx-daychip[data-day]").forEach(c => c.addEventListener("click", () => {
    dailyDaySel = c.dataset.day;
    route();
  }));
  root.querySelector("#revengeBtn")?.addEventListener("click", () => {
    toast(`${ic("bell")}Revenge reminder set for 7 AM — push notifications are a V1 feature, this one's on your honour.`);
  });

  /* battle: simulate mates */
  root.querySelector("#simMates")?.addEventListener("click", () => {
    const st = ST();
    const m = liveMatch(st);
    if (!m) return;
    const r = S.simMates(m.config.id);
    if (r.logged.length === 0) { toast("No mates logged (match state changed)"); return; }
    const last = r.logged[r.logged.length - 1];
    toast(`${r.logged.map(l => `${l.playerId === st.player?.id ? "you" : l.playerId} +${l.reps}`).join(" · ")}${last.closed ? " — MATCH CLOSED" : ""}`);
    if (last.closed) location.hash = "#/result-005";
    else route();
  });

  /* result: rematch + charity pot */
  root.querySelector("#rematchBtn")?.addEventListener("click", (e) => {
    S.rematch(e.currentTarget.dataset.rematch);
    toast(`${ic("bolt")}REMATCH LIVE — same crew, fresh board. Run it back.`);
  });
  root.querySelectorAll("[data-pot-add]").forEach(b => b.addEventListener("click", () => {
    const st = ST();
    const m = lastDone(st);
    if (!m) return;
    S.addToPot(m.config.id, st.player?.id, Number(b.dataset.potAdd));
    toast(`${ic("check")}Added $${Number(b.dataset.potAdd) / 100} to the charity pot`);
    route();
  }));
  root.querySelectorAll("[data-pot-pick]").forEach(b => b.addEventListener("click", () => {
    const st = ST();
    const m = lastDone(st);
    if (!m) return;
    S.designatePot(m.config.id, b.dataset.potPick);
    toast(`${ic("crown")}Pot directed to ${S.CHARITIES.find(c => c.id === b.dataset.potPick)?.name}`);
    route();
  }));

  /* log sheet: camera verify is wired globally (the sheet lives outside #app) */
}

/* loot chest tap → reveal (his chest-tap reveal) — the card is REAL:
   it's granted into the live battle inventory (cadence stays mock). */
function wireChest(root) {
  const chest = root.querySelector("#chest");
  if (!chest) return;
  const reveal = root.querySelector("#lootReveal");
  const tap = root.querySelector("#tapOpen");
  chest.addEventListener("click", () => {
    if (reveal.dataset.done) return;
    reveal.dataset.done = "1";
    const st = ST();
    const m = liveMatch(st) ?? lastDone(st) ?? st.matches[st.matches.length - 1] ?? null;
    const drop = m ? S.grantRandomTo(m.config.id) : null;
    if (!drop) {
      reveal.innerHTML = `<p class="fg-sheet__note" style="margin-top:12px">No battle to drop into — create one and the chest pays out for real.</p>`;
      if (tap) tap.textContent = "CREATE A BATTLE FIRST";
      return;
    }
    const def = E.POWER_UPS[drop.kind];
    reveal.innerHTML = `<div style="display:flex;justify-content:center">${pwrCard({ rarity: def.rarity, name: def.name, desc: def.blurb, icon: def.icon })}</div>`;
    toast(`${ic("chest")}${def.name.toUpperCase()} (${def.rarity}) granted to your arsenal`);
    if (tap) tap.textContent = "NICE. SEE YOU TOMORROW.";
  });
}

/* global click delegation: data-go, back, theme, LOG overlay */
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { location.hash = g.dataset.go ? `#/${g.dataset.go}` : "#/"; closeOverlay(); return; }
  if (e.target.closest("[data-back]")) { history.back(); return; }
  if (e.target.closest("[data-demo-start]")) { e.preventDefault(); bootDemo(); return; }
  if (e.target.closest("[data-sw-reload]")) { location.reload(); return; }
  const theme = e.target.closest("#themeToggle");
  if (theme) {
    const html = document.documentElement;
    const gold = html.getAttribute("data-theme") === "gold";
    if (gold) html.removeAttribute("data-theme"); else html.setAttribute("data-theme", "gold");
    theme.textContent = gold ? "LIME" : "GOLD";
    try { localStorage.setItem("rwf-figma-theme", gold ? "lime" : "gold"); } catch {}
    return;
  }
  if (e.target.closest("#logBtn")) { openOverlay(quickLogSheet()); return; }
  if (e.target.closest("#camVerify")) { openCameraNote(); return; }
  if (e.target.classList?.contains("fx-scrim")) closeOverlay();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeOverlay(); });

let overlayEl = null;
function openOverlay(html) {
  closeOverlay();
  overlayEl = document.createElement("div");
  overlayEl.className = "fx-scrim";
  overlayEl.dataset.global = "1";
  overlayEl.innerHTML = html;
  document.body.appendChild(overlayEl);
  wireQuickLog(document);
  wirePowerUps(document);
}
function closeOverlay() {
  document.querySelectorAll("body > .fx-scrim[data-global]").forEach(n => n.remove());
  overlayEl = null;
}

/* countdown tick (text only — reduced-motion safe, timers-as-text).
   Live-deadline elements ([data-dz-countdown]) are owned by the daily
   ticker — skip them here so they're never double-driven. */
setInterval(() => {
  document.querySelectorAll("[data-countdown]").forEach(el => {
    if (el.hasAttribute("data-dz-countdown")) return;
    const t = el.querySelector(".fg-count__time");
    if (!t) return;
    let [h, m, s] = t.textContent.split(":").map(Number);
    if (isNaN(h)) return;
    s--; if (s < 0) { s = 59; m--; } if (m < 0) { m = 59; h = Math.max(0, h - 1); }
    t.textContent = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  });
}, 1000);

/* ── the temporal loop ticker (FLOW-06/07) — every second: real countdown
   to the day deadline, DZ level switches (banner copy, LOG NOW pulse, DZ3
   wash), and the nightly close — each due play day settles ONCE into
   match.dailyHistory with a winner + recap. Toast + recap link on close;
   battle screens re-render so day 2 shows without a manual reload. */
D.startAppTicker({
  onDayClosed: (result, match) => {
    const day = D.weekdayOf(result.dayKey);
    const who = result.youWon ? "YOU WON" : result.winner ? `${result.winner.name.split(" ")[0].toUpperCase()} TOOK` : "NOBODY LOGGED";
    toast(`${ic("trophy")}DAY CLOSED — ${who} ${day} <button data-go="daily-001" style="background:none;border:1px solid var(--line-bright);color:var(--lime);border-radius:999px;padding:4px 10px;font:600 11px/1.2 var(--font-body);cursor:pointer;margin-left:6px">RECAP →</button>`);
    if (["#/battle-001", "#/log-001", "#/log-002", "#/home-002", "#/home-003"].includes(location.hash)) route();
  },
});

/* theme restore + route */
try {
  const saved = localStorage.getItem("rwf-figma-theme");
  if (saved === "lime") { document.documentElement.removeAttribute("data-theme"); }
} catch {}

/* ── SW update lane (v1.0.0): old tabs must learn about new builds ──────
   sw.js's cache name comes from version.js's BUILD_STAMP; when a new
   build deploys, this ping installs the new worker (skipWaiting +
   clients.claim are in sw.js), controllerchange fires here, and the user
   gets an "APP UPDATED — RELOAD" toast instead of a stale app. */
if ("serviceWorker" in navigator) {
  let swToastShown = false;
  let hadController = !!navigator.serviceWorker.controller; // false on first load
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const replaced = hadController; // a real UPDATE replaced the old worker
    hadController = true;
    if (!replaced || swToastShown) return; // first activation is not an update
    swToastShown = true;
    toast(`${ic("bolt")} APP UPDATED — <button data-sw-reload style="background:none;border:1px solid var(--line-bright);color:var(--lime);border-radius:999px;padding:4px 10px;font:600 11px/1.2 var(--font-body);cursor:pointer;margin-left:6px">RELOAD</button>`);
  });
  const ping = () => navigator.serviceWorker.ready.then((r) => r.update()).catch(() => {});
  addEventListener("load", ping);
  setInterval(ping, 30 * 60 * 1000); // long-lived tabs re-check every 30 min
}

/* ── demo mode entry (v1.0.0): ?demo=1 deep link + [data-demo-start] ──── */
let demoBooted = false;
async function bootDemo({ speed = 1 } = {}) {
  if (demoBooted) return;
  demoBooted = true;
  const mod = await import("./demo.js");
  mod.startDemo({ speed });
}
if (location.protocol.startsWith("http")) {
  const q = new URLSearchParams(location.search);
  if (q.get("demo") === "1") {
    const speed = Number(q.get("speed")) === 2 ? 2 : 1;
    requestAnimationFrame(() => setTimeout(() => bootDemo({ speed }), 400));
  }
}

function route() {
  const id = location.hash.replace(/^#\//, "");
  if (!id) { renderIndex(); return; }
  renderScreen(id);
}
addEventListener("hashchange", route);
route();

/* keep the theme toggle label honest on load */
requestAnimationFrame(() => {
  const t = $("#themeToggle");
  if (t) t.textContent = document.documentElement.getAttribute("data-theme") === "gold" ? "GOLD" : "LIME";
});
