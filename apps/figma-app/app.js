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
function lbRow({ rank, name, you = false, crown = false, pct, ruf, barPct, barColor = "purple", online = false, leader = false }) {
  const barFill = barColor === "gold" ? "var(--lime)" : barColor === "orange" ? "var(--urgency)" : "var(--energy)";
  return `
  <div class="fg-lbrow ${leader ? "fg-lbrow--leader" : ""} ${you ? "fg-lbrow--you" : ""}">
    <span class="fg-lbrow__rank">${rank}</span>
    <span class="fg-avatar ${leader ? "fg-avatar--leader" : ""}" style="width:48px;height:48px;font-size:14px">${you ? "BT" : name.split(" ").map(w => w[0]).join("")}${online ? '<i class="fg-avatar__dot"></i>' : ""}</span>
    <div class="fg-lbrow__info">
      <span class="fg-lbrow__name">${name}${crown ? ic("crown") : ""}</span>
      <span class="fg-lbrow__bar"><i style="width:${barPct}%;background:${barFill}"></i></span>
    </div>
    <div class="fg-lbrow__score">
      <div class="fg-lbrow__pct">${pct}%</div>
      <div class="fg-lbrow__ruf">${ruf} / 120 RUF</div>
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

/* countdown — his 9:165, dual clock, DZ ramp classes from fg-components */
function countdown({ time = "6:12:44", sub = "ends 9:00 PM AEST · 7:00 PM for you", level = "" }) {
  return `
  <span class="fg-count ${level ? `fg-count--${level}` : ""}" data-countdown="${time}">
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

/* danger-zone banner — his 3-level ramp (fg-dz) */
function dzBanner(level, text) {
  return `<div class="fg-dz fg-dz--${level}">${ic("warning")}<span class="fg-dz__label">${text}</span></div>`;
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

/* battle card — his 11:131 */
function battleCard({ status = "LIVE", statusCls = "", meta, title, crewN = 4, barPct = null, barColor = "var(--lime)", foot, border = "purple" }) {
  const av = Array.from({ length: crewN }, (_, i) =>
    `<span class="fg-avatar fg-avatar--sm" style="width:32px;height:32px;font-size:9px;${i < 2 ? "" : ""}">${["BT", "SK", "AT", "JP", "CM"][i]}</span>`).join("");
  return `
  <div class="fg-battle ${border === "line" ? "fg-battle--upcoming" : ""}" ${go("battle-001")}>
    <div class="fg-battle__head">
      <span class="fg-status ${statusCls}">${status}</span>
      <span class="fg-battle__meta">${meta}</span>
    </div>
    <h3 class="fg-battle__title">${title}</h3>
    <div class="fg-battle__crew">${av}</div>
    ${barPct !== null ? `<div class="fg-battle__bar"><i style="width:${barPct}%;background:${barColor}"></i></div>` : ""}
    <div class="fg-battle__foot">${foot}</div>
  </div>`;
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

/* ── quick-log sheet (the global LOG action — ≤3 taps, RUF preview) ──── */
function quickLogSheet() {
  return `
  <div class="fx-sheet" id="quickLog">
    <div class="fx-sheet__grab"></div>
    <h2 class="fx-sheet__h">LOG REPS</h2>
    <div class="fg-sheet__row" id="qlEx">
      <button class="fg-chip fg-chip--exercise" aria-pressed="true">Push-ups</button>
      <button class="fg-chip fg-chip--exercise" aria-pressed="false">Squats</button>
      <button class="fg-chip fg-chip--exercise" aria-pressed="false">Plank</button>
      <button class="fg-chip fg-chip--exercise" aria-pressed="false" ${go("log-002")}>More…</button>
    </div>
    <div class="fg-sheet__row" id="qlPre">
      <button class="fg-chip fg-chip--lg" aria-pressed="false">5</button>
      <button class="fg-chip fg-chip--lg" aria-pressed="false">10</button>
      <button class="fg-chip fg-chip--lg" aria-pressed="true">20</button>
      <button class="fg-chip fg-chip--lg" aria-pressed="false">30</button>
      <button class="fg-chip fg-chip--lg" aria-pressed="false">50</button>
    </div>
    <p class="fg-sheet__conversion" id="qlConv"><b>20 push-ups = 20 RUF</b> · takes you to 92%</p>
    <button class="fg-sheet__cta" id="qlCta" ${go("battle-001")}>LOG 20 PUSH-UPS</button>
    <p class="fg-sheet__note">3 taps, one thumb. Undo available for 30 s after logging.</p>
  </div>`;
}

function wireQuickLog(root) {
  const sheet = root.querySelector("#quickLog");
  if (!sheet) return;
  const RUF = { "Push-ups": 1, Squats: 1, Plank: 0.5 };
  const st = { ex: "Push-ups", n: 20 };
  const conv = sheet.querySelector("#qlConv"), cta = sheet.querySelector("#qlCta");
  const render = () => {
    const ruf = Math.round(st.n * RUF[st.ex]);
    const pct = Math.min(100, Math.round(((85 + ruf) / 120) * 100));
    conv.innerHTML = `<b>${st.n} ${st.ex.toLowerCase()} = ${ruf} RUF</b> · takes you to ${pct}%`;
    cta.textContent = `LOG ${st.n} ${st.ex.toUpperCase()}`;
    sheet.querySelectorAll("#qlEx .fg-chip").forEach(c => c.setAttribute("aria-pressed", String(c.textContent.trim() === st.ex)));
    sheet.querySelectorAll("#qlPre .fg-chip").forEach(c => c.setAttribute("aria-pressed", String(Number(c.textContent) === st.n)));
  };
  sheet.querySelectorAll("#qlEx .fg-chip").forEach(c => c.addEventListener("click", () => { st.ex = c.textContent.trim(); render(); }));
  sheet.querySelectorAll("#qlPre .fg-chip").forEach(c => c.addEventListener("click", () => { st.n = Number(c.textContent); render(); }));
  render();
}

/* ═════════════════════════════ SCREENS ════════════════════════════════
   Registry: { id, figma, name, group, next?, render() } — copy verbatim
   from the file.json extraction. 65 screens. */

const battleUnder = () => `
  ${statusBar()}
  ${topBar({ title: "The Sunday Showdown" })}
  <div class="fx-content">
    <div class="fx-statusrow">
      ${badge({ icon: "bolt", text: "7 DAY STREAK" })}
      ${countdown({})}
    </div>
    <div class="fx-hero">${ring(75, "90", "of 120 RUF")}
      <div class="fx-hero__line">30 RUF TO GO — SAM IS 12 AHEAD</div>
    </div>
    <div class="fx-crewnow">
      <span class="fg-avatar fg-avatar--sm fg-avatar--online" style="width:32px;height:32px;font-size:9px">BT</span>
      <span class="fg-avatar fg-avatar--sm fg-avatar--online" style="width:32px;height:32px;font-size:9px">SK</span>
      <span class="fg-avatar fg-avatar--sm fg-avatar--online" style="width:32px;height:32px;font-size:9px">AT</span>
      <span class="fx-crewnow__text">3 mates moving right now</span>
    </div>
    <div class="fx-board">${board()}</div>
  </div>
  ${nav("battle-001")}
`;

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
          <span class="fg-avatar fg-avatar--leader" style="width:96px;height:96px;font-size:23px">BT</span>
          <button class="fx-avatarpick__add">Add photo</button>
        </div>
        ${field("Display name", "Ben the Machine")}
        ${field("Username", "@benwins")}
        <div class="fx-gap8"></div>
        ${btn("CONTINUE", "fx-btn--primary", "auth-009")}
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
        ${sub("This just seeds fair targets. Nobody in your crew sees it.")}
        ${option({ title: "Just starting out", sub: "Lower daily targets, bodyweight-first suggestions" })}
        ${option({ title: "I train sometimes", sub: "Balanced targets that stretch you a bit", sel: true })}
        ${option({ title: "I train seriously", sub: "Bigger targets, gym mode suggestions" })}
        <div class="fx-gap8"></div>
        ${btn("CONTINUE", "fx-btn--primary", "auth-011")}
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
        ${h1("YOU'RE IN, BEN.", "fx-h1--36 fx-h1--gold")}
        ${sub("Time to pick your first fight.", "fx-sub--16")}
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
      </div>
      ${nav("battle-001")}`,
  },
  {
    id: "home-002", figma: "MOB-HOME-002", name: "Home — active battle", group: "Home", next: "battle-001",
    render: () => `
      ${statusBar()}
      ${topBar({ logo: true })}
      <div class="fx-content">
        <div class="fx-statusrow">
          <span class="fg-badge">${ic("flame")}7 DAY STREAK</span>
          ${countdown({})}
        </div>
        ${battleCard({ meta: "5 mates · Day 3 of 7", title: "THE SUNDAY SHOWDOWN", crewN: 4, barPct: 62, foot: "You're 2nd — 36 RUF behind Sam" })}
        <div class="fx-hero fx-hero--split">
          ${ring(75, "90", "of 120 RUF", 120)}
          <div>
            <div class="fx-hero__line" style="font-size:22px;text-align:left">30 RUF TO GO</div>
            <p class="fx-hero__aside" style="text-align:left">Sam's at 88% — don't let him take Tuesday too.</p>
          </div>
        </div>
        <div class="fx-board">${board([BOARD[0], BOARD[1]])}</div>
      </div>
      ${nav("battle-001")}`,
  },
  {
    id: "home-003", figma: "MOB-HOME-003", name: "Home — multiple battles", group: "Home", next: "battle-001",
    render: () => `
      ${statusBar()}
      ${topBar({ logo: true })}
      <div class="fx-content">
        ${h1("YOUR BATTLES", "fx-h1--26")}
        ${battleCard({ meta: "5 mates · Day 3 of 7", title: "THE SUNDAY SHOWDOWN", crewN: 4, barPct: 62, foot: "You're 2nd — 36 RUF behind Sam" })}
        ${battleCard({ status: "STARTS IN 2 D", statusCls: "fg-status--info", meta: "8 colleagues · starts Mon", title: "ACME STEP-UP", crewN: 4, barPct: null, foot: "Target: 100 RUF/day · Mon–Fri", border: "line" })}
        ${battleCard({ status: "SAM WON", statusCls: "fg-status--muted", meta: "3 players · finished", title: "LUNCHTIME LEGS", crewN: 3, barPct: 100, barColor: "var(--success)", foot: "You won 2 of 7 days · Rematch?", border: "line" })}
      </div>
      ${nav("battle-001")}`,
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
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        <div class="fx-seg" style="margin-top:0">
          <button class="fx-seg__item fx-seg__item--on">Fast battle</button>
          <button class="fx-seg__item" ${go("create-005")}>Custom battle</button>
        </div>
        ${field("Battle name", "The Sunday Showdown")}
        <p class="fx-field__label" style="margin-top:14px">Battle days</p>
        <div class="fx-chips">
          <button class="fx-chip fx-chip--day fx-chip--on">M</button>
          <button class="fx-chip fx-chip--day">T</button>
          <button class="fx-chip fx-chip--day fx-chip--on">W</button>
          <button class="fx-chip fx-chip--day">T</button>
          <button class="fx-chip fx-chip--day fx-chip--on">F</button>
          <button class="fx-chip fx-chip--day">S</button>
          <button class="fx-chip fx-chip--day fx-chip--on">S</button>
        </div>
        ${note("Rest days are free — no targets, no streak risk.")}
        <p class="fx-field__label" style="margin-top:14px">Exercise pack</p>
        ${option({ title: "Bodyweight basics", sub: "Push-ups, squats, sit-ups, lunges, plank — no kit needed", sel: true })}
        <p class="fx-field__label" style="margin-top:14px">Daily target (per person)</p>
        <div class="fx-chips">
          <button class="fx-chip fx-chip--target">Light · 60 RUF</button>
          <button class="fx-chip fx-chip--target fx-chip--on">Solid · 120 RUF</button>
          <button class="fx-chip fx-chip--target">Hero · 200 RUF</button>
        </div>
        ${note("Targets auto-adjust per person if someone picks a different level when joining.")}
        <div class="fx-gap8"></div>
        ${btn("CREATE & INVITE", "fx-btn--primary", "create-014")}
        <div class="fx-gap8"></div>
        ${btn("Switch to custom setup", "fx-btn--ghost", "create-005")}
      </div>`,
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
    render: () => `
      ${statusBar()}
      ${topBar({ title: "The Sunday Showdown" })}
      <div class="fx-content">
        ${h1("BATTLE CREATED. NOW RECRUIT.", "fx-h1--26 fx-h1--gold")}
        <div class="fx-sharecard">
          <div class="fx-sharecard__link">reps.fit/join/SHOWDOWN</div>
          <div class="fx-sharecard__sub">Share link · QR · or send straight to WhatsApp</div>
          <div class="fx-sharecard__btns"><button>Copy link</button><button>QR code</button><button>Share</button></div>
        </div>
        <p class="fx-sub fx-sub--13" style="margin-top:20px;font-weight:700;color:var(--text)">CREW (3 of 8 joined)</p>
        ${member("Ben (you) · Captain", "Ready", true)}
        ${member("Sam K", "Joined · picked Solid level", true)}
        ${member("Alex T", "Joined · picked Light level", true)}
        ${member("Jordan P", "Invited · not joined yet")}
        ${member("Casey M", "Invited · not joined yet")}
        ${note("Battle starts Monday 9:00 AM whether everyone's joined or not. Latecomers join from the current day.")}
        <div class="fx-gap8"></div>
        ${btn("START EARLY (CAPTAIN ONLY)", "fx-btn--dark", "battle-001")}
      </div>
      ${nav("battle-001")}`,
  },

  /* ── JOIN ×2 ──────────────────────────────────────────────────────── */
  {
    id: "join-001", figma: "MOB-JOIN-001", name: "Invitation preview", group: "Join", next: "join-003",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap24"></div>
        <p class="fx-overline">SAM INVITED YOU TO</p>
        ${h1("THE SUNDAY SHOWDOWN", "fx-h1--34 fx-h1--gold")}
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
        ${btn("ACCEPT — PICK MY LEVEL", "fx-btn--primary", "join-003")}
        <div class="fx-gap8"></div>
        ${btn("Decline", "fx-btn--ghost")}
      </div>`,
  },
  {
    id: "join-003", figma: "MOB-JOIN-003", name: "Pick your level", group: "Join", next: "battle-001",
    render: () => `
      ${statusBar()}
      ${topBar({ title: "Create battle", back: true })}
      <div class="fx-content">
        ${h1("PICK YOUR LEVEL")}
        ${sub("Everyone chases 100% of their own target, so every level can win the day. Only you and the captain see your choice.")}
        ${option({ title: "Light — 60 RUF/day", sub: "≈ 40 push-ups + 2 min plank" })}
        ${option({ title: "Solid — 120 RUF/day", sub: "≈ 60 push-ups + 30 burpees", sel: true })}
        ${option({ title: "Hero — 200 RUF/day", sub: "You're a menace. Respect." })}
        <div class="fx-gap8"></div>
        ${btn("JOIN THE BATTLE", "fx-btn--primary", "battle-001")}
      </div>`,
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
    render: () => `
      ${statusBar()}
      ${topBar({ title: "The Sunday Showdown" })}
      <div class="fx-content">
        ${h1("TODAY'S LEADERBOARD", "fx-h1--24")}
        <div class="fx-seg fx-seg--32">
          <button class="fx-seg__item fx-seg__item--on">Today</button>
          <button class="fx-seg__item">This battle</button>
          <button class="fx-seg__item">All time</button>
        </div>
        <div class="fx-board">${board()}</div>
        <div class="fx-card fx-card--r14" style="background:var(--energy-tint);border-color:transparent;display:flex;justify-content:space-between;align-items:center">
          <span style="font:700 12px/1.2 var(--font-body);color:var(--energy-light)">CREW TOTAL</span>
          <span style="font:700 14px/1.2 var(--font-body);color:var(--text)">418 / 600 RUF today</span>
        </div>
        ${note("Tap any player for their battle detail · long-press to react or flag a log", "fx-note--11")}
      </div>
      ${nav("battle-001")}`,
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
    render: () => sheetScreen(battleUnder(), `
      <div class="fx-sheet__grab"></div>
      <h2 class="fx-sheet__h">LOG REPS</h2>
      <div class="fg-sheet__row" id="qlEx">
        <button class="fg-chip fg-chip--exercise" aria-pressed="true">Push-ups</button>
        <button class="fg-chip fg-chip--exercise" aria-pressed="false">Squats</button>
        <button class="fg-chip fg-chip--exercise" aria-pressed="false">Plank</button>
        <button class="fg-chip fg-chip--exercise" aria-pressed="false" ${go("log-002")}>More…</button>
      </div>
      <div class="fg-sheet__row" id="qlPre">
        <button class="fg-chip fg-chip--lg" aria-pressed="false">5</button>
        <button class="fg-chip fg-chip--lg" aria-pressed="false">10</button>
        <button class="fg-chip fg-chip--lg" aria-pressed="true">20</button>
        <button class="fg-chip fg-chip--lg" aria-pressed="false">30</button>
        <button class="fg-chip fg-chip--lg" aria-pressed="false">50</button>
      </div>
      <p class="fg-sheet__conversion" id="qlConv"><b>20 push-ups = 20 RUF</b> · takes you to 92%</p>
      <button class="fg-sheet__cta" id="qlCta" ${go("battle-001")}>LOG 20 PUSH-UPS</button>
      <p class="fg-sheet__note">3 taps, one thumb. Undo available for 30 s after logging.</p>
    `),
  },
  {
    id: "log-002", figma: "MOB-LOG-002", name: "Exercise picker", group: "Log", next: "log-003",
    render: () => sheetScreen(battleUnder(), `
      <div class="fx-sheet__grab"></div>
      <h2 class="fx-sheet__h fx-sheet__h--20">PICK AN EXERCISE</h2>
      <div class="fx-search"><span>${ic("search")}</span> Search 20 exercises…</div>
      <p class="fx-overline" style="text-align:center;margin-top:8px">FAVOURITES</p>
      <div class="fx-sheet__rows">
        ${exListRow("Push-ups", "Upper body", "1 = 1 RUF")}
        ${exListRow("Burpees", "Full body", "1 = 2 RUF")}
        ${exListRow("Plank", "Core · timed", "10 s = 5 RUF")}
      </div>
      <p style="text-align:center;font:600 12px/1.2 var(--font-body);color:var(--lime);margin:6px 0 0" ${go("log-003")}>ALL EXERCISES A–Z ›</p>
    `),
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
    render: () => `
      ${confetti()}
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap96"></div>
        ${h1("YOU WON TUESDAY", "fx-h1--42 fx-h1--gold")}
        <div class="fx-trophy">${ic("trophy")}</div>
        ${sub("124 RUF · finished at 8:12 PM · 103% of target", "fx-sub--15")}
        ${sub("Sam finished 2nd — 4 RUF behind. Brutal.", "fx-sub--13")}
        <div class="fx-card fx-card--r14" style="background:var(--energy-tint);border-color:var(--energy);display:flex;gap:12px;align-items:center">
          <span style="font-size:20px">🎁</span>
          <span style="font:600 14px/1.2 var(--font-body);color:var(--text)">Winner's loot: 1 Rare power-up card</span>
        </div>
        <div class="fx-gap8"></div>
        ${btn("SHARE THE WIN", "fx-btn--primary", "result-007")}
        <div class="fx-gap8"></div>
        ${btn("See full recap", "fx-btn--ghost", "result-003")}
      </div>`,
  },
  {
    id: "result-002", figma: "MOB-RESULT-002", name: "Daily result — Sam won", group: "Results", next: "result-003",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap96"></div>
        ${h1("SAM TOOK TUESDAY", "fx-h1--36")}
        <div style="display:flex;justify-content:center;margin-top:16px"><span class="fg-avatar" style="width:72px;height:72px;font-size:23px">SK</span></div>
        ${sub("You finished 2nd at 92% — 10 RUF short.", "fx-sub--15")}
        ${sub("You were ahead until 7 PM. Tomorrow, finish the job.", "fx-sub--13")}
        <div class="fx-stats">
          <div class="fx-stat"><div class="fx-stat__v">🔥 6</div><div class="fx-stat__k">day streak safe</div></div>
          <div class="fx-stat"><div class="fx-stat__v">💪 110</div><div class="fx-stat__k">RUF today</div></div>
          <div class="fx-stat"><div class="fx-stat__v">📈 +8%</div><div class="fx-stat__k">vs your avg</div></div>
        </div>
        <div class="fx-gap8"></div>
        ${btn("SET A REVENGE REMINDER FOR 7 AM", "fx-btn--primary", "battle-001")}
        <div class="fx-gap8"></div>
        ${btn("Send Sam a taunt", "fx-btn--dark")}
      </div>`,
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
    id: "result-005", figma: "MOB-RESULT-005", name: "Final battle result", group: "Results", next: "set-005", tint: "tint",
    render: () => `
      ${confetti()}
      ${statusBar()}
      <div class="fx-content">
        <div class="fx-gap48"></div><div class="fx-gap16"></div>
        <p class="fx-overline" style="color:var(--energy-light);text-align:center">BATTLE COMPLETE</p>
        ${h1("SAM WINS<br>THE SHOWDOWN", "fx-h1--38 fx-h1--gold")}
        ${sub("5 of 8 days won · 934 total RUF", "fx-sub--15")}
        <div class="fx-podium">
          <div class="fx-podium__col"><span class="fx-podium__name">You</span><div class="fx-podium__bar" style="height:70px;background:color-mix(in srgb, var(--muted) 35%, transparent)"></div><span class="fx-podium__rank" style="color:var(--muted)">2nd</span></div>
          <div class="fx-podium__col"><span class="fx-podium__name">Sam</span><div class="fx-podium__bar" style="height:100px;background:var(--lime)"></div><span class="fx-podium__rank" style="color:var(--lime)">1st</span></div>
          <div class="fx-podium__col"><span class="fx-podium__name">Alex</span><div class="fx-podium__bar" style="height:50px;background:color-mix(in srgb, var(--urgency) 35%, transparent)"></div><span class="fx-podium__rank" style="color:var(--urgency)">3rd</span></div>
        </div>
        <div class="fx-card fx-card--r14">
          <div class="fx-moments__row">🏅 Most consistent — You (logged every day)</div>
          <div class="fx-moments__row">🚀 Best comeback — Alex (last-day surge)</div>
          <div class="fx-moments__row">⚡ Most active — Sam (41 sets)</div>
          <div class="fx-moments__row">💪 Personal best — You (124 RUF Tuesday)</div>
        </div>
        <div class="fx-gap8"></div>
        ${btn("REMATCH — SAME RULES", "fx-btn--primary", "create-014")}
        <div class="fx-gap8"></div>
        ${btn("Share battle poster", "fx-btn--dark", "result-007")}
      </div>`,
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
  {
    id: "pwr-001", figma: "MOB-PWR-001", name: "Power-up inventory", group: "Power-Ups", next: "pwr-002",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        ${h1("YOUR ARSENAL", "fx-h1--26")}
        ${sub("Hidden from your crew. 6 of 12 slots used · commons expire after 7 days.", "fx-sub--12")}
        <div class="fx-pwrgrid">
          ${pwrCard({ rarity: "legendary", name: "LIGHTNING ROUND", desc: "Reps count 3× for the next 10 minutes", icon: "bolt" })}
          ${pwrCard({ rarity: "epic", name: "REP STEAL", desc: "Take 10% of an opponent's total (SAMPLE cap)", icon: "bolt" })}
          ${pwrCard({ rarity: "rare", name: "TIME FREEZE", desc: "Pauses the battle clock for 30 minutes", icon: "clock" })}
          ${pwrCard({ rarity: "common", name: "GROUP SHIELD", desc: "Protects the crew from one failure consequence", icon: "shield" })}
        </div>
        <div class="fx-drop" ${go("pwr-006")}>🎁 Daily drop ready — open your free card</div>
      </div>
      ${nav("pwr-001")}`,
  },
  {
    id: "pwr-002", figma: "MOB-PWR-002", name: "Card detail & activation", group: "Power-Ups", next: "pwr-004",
    render: () => sheetScreen(battleUnder(), `
      <div class="fx-sheet__grab"></div>
      <div style="display:flex;justify-content:center">
        <div class="fg-pwr fg-pwr--legendary" style="width:272px;padding:20px">
          <span class="fg-pwr__rarity" style="font-size:12px">LEGENDARY</span>
          <span class="fg-pwr__art" style="width:102px;height:102px">${ic("bolt")}</span>
          <h3 class="fg-pwr__name" style="font-size:25px">LIGHTNING ROUND</h3>
          <p class="fg-pwr__desc" style="font-size:14px">Reps count 3× for the next 10 minutes</p>
        </div>
      </div>
      <div class="fx-card" style="margin-top:4px">
        <div style="font:700 12px/1.2 var(--font-body);color:var(--lime)">LIGHTNING ROUND · LEGENDARY</div>
        <div class="fx-card__s" style="color:var(--muted)">For 10 minutes, every rep you log counts 3×. Server-timed — the window starts the second you confirm.</div>
        <div class="fx-card__s">Best used when: you've got one big set left and the clock is closing.</div>
        <div class="fx-card__s" style="color:var(--faint-deco)">Limit: one per player per day · visible to the whole crew when fired</div>
      </div>
      <button class="fg-sheet__cta" ${go("pwr-004")}>ACTIVATE — 10:00 STARTS NOW</button>
      <button class="fg-sheet__cta" style="background:none;color:var(--lime)" ${go("pwr-001")}>Save it for later</button>
    `),
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
        ${sub("Come back every day you battle — streaks improve your odds of Rare+. Founders keep this forever.", "fx-sub--12")}
        <div class="fx-gap16"></div>
        <div id="lootReveal"></div>
      </div>`,
  },
  {
    id: "pwr-007", figma: "MOB-PWR-007", name: "Power-up store", group: "Power-Ups", next: "set-005",
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        ${h1("THE STORE", "fx-h1--26")}
        ${sub("Cosmetic and convenience only — you can't buy the win. Purchase caps: 3 packs/week (SAMPLE).", "fx-sub--12")}
        ${storeRow("Starter pack", "3 random cards · max Rare", "$1.99")}
        ${storeRow("Battle pack", "5 random cards · 1 guaranteed Epic", "$4.99")}
        ${storeRow("Streak Freeze", "Protect one missed day", "$0.99")}
        ${note("Disabled in wager battles where the crew turned off purchased power-ups. Purchases are separate from any wager money.", "fx-note--11")}
      </div>
      ${nav("pwr-001")}`,
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
    render: () => `
      ${statusBar()}
      <div class="fx-content">
        <div style="display:flex;justify-content:center;margin-top:12px"><span class="fg-avatar" style="width:72px;height:72px;font-size:23px">BT</span></div>
        ${h1("BEN THE MACHINE", "fx-h1--26")} 
        <p class="fx-sub fx-sub--13" style="text-align:center">@benwins · Sydney · battling since Jul 2026</p>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
          <span class="fg-badge">${ic("flame")}7 DAY STREAK</span>
          <span class="fg-badge fg-badge--premium">${ic("crown")}12 DAYS WON</span>
        </div>
        <div class="fx-pstats">
          <div class="fx-pstat"><div class="fx-pstat__v">4,218</div><div class="fx-pstat__k">lifetime RUF</div></div>
          <div class="fx-pstat"><div class="fx-pstat__v">12</div><div class="fx-pstat__k">days won</div></div>
          <div class="fx-pstat"><div class="fx-pstat__v">3</div><div class="fx-pstat__k">battles</div></div>
          <div class="fx-pstat"><div class="fx-pstat__v">7</div><div class="fx-pstat__k">best streak</div></div>
        </div>
        <div class="fx-menu">
          ${menuRow("Battle history", "home-003")}
          ${menuRow("Achievements & streak calendar")}
          ${menuRow("Exercise stats & records")}
          ${menuRow("Friends", "social-001")}
          ${menuRow("Power-up inventory", "pwr-001")}
          ${menuRow("Settings", "set-001")}
        </div>
      </div>
      ${nav("profile-001")}`,
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
  ["Results", "Daily winner, daily loss, recap + MOMENTS, final + awards, share card."],
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
      <p class="fx-index__sub">Ben's complete design — all 65 mobile screens, mock data, gold theme on. Tap GOLD up top to compare our lime. Everything is offline-capable: install it, kill your wifi, it still works.</p>
      <div class="fx-gap16"></div>
      ${btn("▶  RUN THE PROTOTYPE FLOW", "fx-btn--primary", "auth-001")}
      <div class="fx-gap8"></div>
      ${btn("Jump straight into a live battle", "fx-btn--dark", "battle-001")}
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
  wireQuickLog(app);
  wireChest(app);
  document.title = `${s.figma} · ${s.name} — RWF Figma Test`;
}

/* loot chest tap → reveal (his chest-tap reveal) */
function wireChest(root) {
  const chest = root.querySelector("#chest");
  if (!chest) return;
  const reveal = root.querySelector("#lootReveal");
  const tap = root.querySelector("#tapOpen");
  chest.addEventListener("click", () => {
    if (reveal.dataset.done) return;
    reveal.dataset.done = "1";
    reveal.innerHTML = `<div style="display:flex;justify-content:center">${pwrCard({ rarity: "rare", name: "TIME FREEZE", desc: "Pauses the battle clock for 30 minutes", icon: "clock" })}</div>`;
    if (tap) tap.textContent = "NICE. SEE YOU TOMORROW.";
  });
}

/* global click delegation: data-go, back, theme, LOG overlay */
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { location.hash = g.dataset.go ? `#/${g.dataset.go}` : "#/"; closeOverlay(); return; }
  if (e.target.closest("[data-back]")) { history.back(); return; }
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
}
function closeOverlay() {
  document.querySelectorAll("body > .fx-scrim[data-global]").forEach(n => n.remove());
  overlayEl = null;
}

/* countdown tick (text only — reduced-motion safe, timers-as-text) */
setInterval(() => {
  document.querySelectorAll("[data-countdown]").forEach(el => {
    const t = el.querySelector(".fg-count__time");
    if (!t) return;
    let [h, m, s] = t.textContent.split(":").map(Number);
    if (isNaN(h)) return;
    s--; if (s < 0) { s = 59; m--; } if (m < 0) { m = 59; h = Math.max(0, h - 1); }
    t.textContent = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  });
}, 1000);

/* theme restore + route */
try {
  const saved = localStorage.getItem("rwf-figma-theme");
  if (saved === "lime") { document.documentElement.removeAttribute("data-theme"); }
} catch {}
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
