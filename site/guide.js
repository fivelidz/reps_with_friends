// RWF site — AI guide widget. Launcher + chat panel wired to POST /api/ai.
// Deliberately a STANDALONE module (own <script type="module"> tag): a failure
// here can never take down main.js boot (hero/graph scenes keep running).
// No deps. Vanilla DOM. Respects prefers-reduced-motion via site.css.

const ENDPOINT = '/api/ai';
const SYSTEM = 'You are guiding a visitor around the Reps With Friends showcase page.';
const HISTORY_LIMIT = 12;   // last N messages sent to the model
const TIMEOUT_MS = 30_000;  // AbortController deadline
const OPEN_KEY = 'rwf-guide-open'; // sessionStorage: panel open across reloads
const INTRO_KEY = 'rwf-guide-intro-shown'; // sessionStorage: 5s auto-intro, once per session

// ---- prebaked starter answers ------------------------------------------------
// Chip questions are answered LOCALLY — zero network, instant. Keys are the
// exact data-q strings from the chips in site/index.html and
// apps/systempage/index.html. Free-typed questions still go to /api/ai.
const PREBAKED = {
  // — site chips —
  'How do handicaps work?':
    "Every rep is scaled by a **handicap tier**, so a couch rookie and an athlete can go head-to-head: `couch ×1.50` · `casual ×1.25` · `fit ×1.00` · `athlete ×0.85`. 100 raw reps scores 150 as couch, 85 as athlete. When heart-rate straps land, handicap v2 blends your measured **%HRR** into the multiplier, and anyone >30% behind gets a once-per-match **comeback ×1.2** boost.",
  "What's a 300?":
    "A **300** is the signature match format: any exercises, any order — the first crew to close the raw 300-rep target ends the match. Closing isn't winning, though: every rep is effort-adjusted by handicap tier, and the top adjusted score takes it. The crew that closes banks a **+15 bonus**, so racing to finish and piling on effort both pay.",
  'How does verification work?':
    "Verification runs **entirely in your browser — nothing leaves your device**. The camera feed is counted on-device by in-browser pose detection (MoveNet), and heart rate streams in over Web Bluetooth from a chest strap. The engine already accepts `avgHrrPct` and `verified` flags; later phases add HealthKit / Health Connect, then WHOOP/Garmin cloud cross-checks.",
  'Can my workplace play?':
    "Yes — **corporate mode** is already built into the hub console. Organisations get their own leagues with **employer-funded charity pots** (no employee money is ever handled), and the wellbeing dashboard is **aggregate-only** with k≥5 suppression, so no individual's data surfaces. Renewal-outlook reporting rounds it out for the employer.",
  // — /system chips —
  'What am I looking at on this page?':
    "This is **/system** — the dissemination page for the whole Reps With Friends build. It walks through the design tokens, the 18-component design system, the feature families A–G, and exactly where the project stands against the roadmap. Everything here is real and live — 90+ tests green, push-to-deploy in ~20s.",
  'Which features are live right now?':
    "**Live now:** the full 300-format core loop (tier handicaps, closure bonus, charity-pot ledger, AI taunts), the 4-week retention arc (seasons, divisions, streaks, comeback ×1.2), the WhatsApp + Slack bots, the phone-first PWA, this site, and the corporate console (seeded). **Next lane:** camera verification — MoveNet counting plus BLE heart-rate, with the %HRR handicap v2 already engine-ready.",
  'What are the current blockers?':
    "Three red ones: the **Slack app** needs a five-minute human creation step before it can offer a permanent install link; **WhatsApp Cloud API** group support is unverified, which shapes the pilot architecture; and a **charity-wager legal opinion** is required before real money moves. Just behind: always-on bot hosting (kit ready) and unifying app ↔ API ↔ bot state.",
  'How do the design tokens work?':
    "`design/tokens.css` is the single source of truth — every page imports it, never forks it. Near-black surfaces, with **lime strictly earned** (verified reps, winning, the one primary CTA), coral for effort and heat, amber for pending, sky for info. Space Grotesk carries display and body, **every number is mono**, and all motion is one 160ms ease.",
};

// First-open self-introduction: who the guide is, what it knows, invitation.
const GREETING =
  "Hey! I'm the **RWF guide** — the AI concierge built into this page. I know the whole build: the 300 match format, handicap tiers, verification, seasons, the bots, corporate mode, and what's live versus next. Tap a starter chip below for an instant answer, or type anything and I'll answer live.";

// ---- context awareness: which section is on screen -------------------------
const SECTIONS = [
  { sel: '#top',          name: 'hero' },
  { sel: '#how',          name: 'The 300' },
  { sel: '#handicap',     name: 'handicap demo' },
  { sel: '#connections',  name: 'connections' },
  { sel: '#verification', name: 'verification' },
  { sel: '#features',     name: 'features' },
  { sel: '#roadmap',      name: 'roadmap' },
  { sel: '.footer',       name: 'footer' },
  // dissemination page (/system) — absent elsewhere, filtered automatically
  { sel: '#tokens',       name: 'design tokens' },
  { sel: '#components',   name: 'component library' },
  { sel: '#families',     name: 'feature families' },
  { sel: '#progress',     name: 'progress and roadmap' },
];

let sectionTops = [];
let currentSection = 'hero';

function measureSections() {
  sectionTops = SECTIONS
    .map((s) => {
      const n = document.querySelector(s.sel);
      return n ? { name: s.name, top: n.offsetTop } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.top - b.top);
}

let scrollTick = false;
function updateCurrentSection() {
  if (!sectionTops.length) return;
  const y = window.scrollY + window.innerHeight * 0.4; // "reading line"
  let name = sectionTops[0].name;
  for (const s of sectionTops) if (s.top <= y) name = s.name;
  currentSection = name;
}
function onScroll() {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    scrollTick = false;
    updateCurrentSection();
  });
}

// ---- element handles --------------------------------------------------------
const launcher = document.getElementById('guideLauncher');
const panel = document.getElementById('guidePanel');
const closeBtn = document.getElementById('guideClose');
const msgsEl = document.getElementById('guideMessages');
const chipsEl = document.getElementById('guideChips');
const form = document.getElementById('guideForm');
const input = document.getElementById('guideInput');
const sendBtn = document.getElementById('guideSend');

if (!launcher || !panel || !msgsEl || !form || !input) {
  console.warn('[guide] markup missing — widget disabled');
} else {
  init();
}

function init() {
  const history = []; // {role:'user'|'assistant', content} — memory only
  let busy = false;
  let greeted = false;
  let activeTyper = null; // in-flight typewriter (prebaked answer / greeting)

  // -- open / close ----------------------------------------------------------
  function setPanel(open, { focus = true } = {}) {
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      launcher.classList.remove('pulse'); // pulse ring only until first open
      try { sessionStorage.setItem(OPEN_KEY, '1'); } catch { /* private mode */ }
      if (!greeted) {
        greeted = true;
        activeTyper = typeBotMsg(GREETING); // the guide introduces itself
      }
      if (focus) input.focus();
    } else {
      try { sessionStorage.removeItem(OPEN_KEY); } catch { /* ignore */ }
    }
  }

  launcher.addEventListener('click', () => {
    setPanel(!panel.classList.contains('open'));
  });
  closeBtn.addEventListener('click', () => {
    setPanel(false);
    launcher.focus();
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setPanel(false);
      launcher.focus();
    }
  });

  // click outside closes (desktop only — mobile is a bottom sheet)
  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('open')) return;
    if (window.matchMedia('(max-width: 620px)').matches) return;
    if (panel.contains(e.target) || launcher.contains(e.target)) return;
    setPanel(false, { focus: false });
  });

  // Restore open state across reloads (no focus steal, no greeting re-roll).
  // DESKTOP ONLY: on mobile the panel is a bottom sheet covering ~78svh, so
  // restoring it on every navigation drops a full-screen overlay over content
  // the visitor didn't ask to cover here (and swallows taps meant for the
  // page). Mobile keeps the launcher — same rule as the 5s auto-intro.
  try {
    const isSheet = window.matchMedia('(max-width: 620px)').matches;
    if (isSheet) sessionStorage.removeItem(OPEN_KEY);
    if (!isSheet && sessionStorage.getItem(OPEN_KEY) === '1') {
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      launcher.setAttribute('aria-expanded', 'true');
      launcher.classList.remove('pulse');
      greeted = true;
      addMsg('bot', "Still here — ask away.");
      sessionStorage.setItem(INTRO_KEY, '1'); // panel is already open — no auto-intro
    }
  } catch { /* ignore */ }

  // -- 5s self-intro: auto-open once per session --------------------------------
  // Desktop + motion only. If the visitor already opened (or opened-and-closed)
  // the panel, the intro counts as shown and we never auto-open. Mobile and
  // reduced-motion visitors keep the pulsing launcher instead.
  let introShown = false;
  try { introShown = sessionStorage.getItem(INTRO_KEY) === '1'; } catch { /* private mode */ }
  const markIntroShown = () => { try { sessionStorage.setItem(INTRO_KEY, '1'); } catch { /* ignore */ } };

  if (!introShown) {
    const introTimer = setTimeout(() => {
      markIntroShown();
      if (panel.classList.contains('open')) return; // visitor beat us to it
      if (window.matchMedia('(max-width: 620px)').matches || reducedMotion()) {
        return; // no auto-open — launcher keeps its pulse ring
      }
      setPanel(true, { focus: false }); // polite: no focus steal from the page
    }, 5000);
    // any visitor interaction with the widget counts as "intro shown"
    const cancelIntro = () => { clearTimeout(introTimer); markIntroShown(); };
    launcher.addEventListener('click', cancelIntro, { once: true, capture: true });
    closeBtn.addEventListener('click', cancelIntro, { once: true, capture: true });
  }

  // -- message rendering -------------------------------------------------------
  // Markdown-lite, safely: **bold** and `code` via DOM building; everything
  // else is literal text. Blank lines split paragraphs.
  function renderLite(container, text) {
    const paras = text.split(/\n{2,}/);
    for (const para of paras) {
      const p = document.createElement('p');
      const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
      let last = 0, m;
      while ((m = re.exec(para)) !== null) {
        if (m.index > last) p.appendChild(document.createTextNode(para.slice(last, m.index)));
        if (m[0].startsWith('**')) {
          const b = document.createElement('b');
          b.textContent = m[0].slice(2, -2);
          p.appendChild(b);
        } else {
          const c = document.createElement('code');
          c.textContent = m[0].slice(1, -1);
          p.appendChild(c);
        }
        last = m.index + m[0].length;
      }
      if (last < para.length) p.appendChild(document.createTextNode(para.slice(last)));
      container.appendChild(p);
    }
  }

  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = 'msg msg--' + role + (role === 'bot' ? ' msg--in' : '');
    renderLite(div, text);
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return div;
  }

  // -- typewriter (prebaked answers + greeting) ---------------------------------
  // Renders the full markdown-lite DOM up front, then reveals the text
  // character-by-character at 15–20ms/char (total capped ~7s) with a lime
  // caret. Reduced motion → instant. Returns {finish} to complete instantly
  // (used when a new message arrives mid-type).
  function reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function typeBotMsg(text) {
    const div = document.createElement('div');
    div.className = 'msg msg--bot msg--in';
    renderLite(div, text);
    msgsEl.appendChild(div);

    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push({ node: n, full: n.nodeValue });
    const total = nodes.reduce((s, x) => s + x.full.length, 0);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    if (!total || reducedMotion()) return { finish() {} }; // instant

    for (const x of nodes) x.node.nodeValue = '';
    const caret = document.createElement('span');
    caret.className = 'guide-caret';
    nodes[0].node.parentElement.appendChild(caret);

    function finishTyper() {
      clearInterval(iv);
      for (const x of nodes) x.node.nodeValue = x.full;
      caret.remove();
      if (activeTyper === handle) activeTyper = null;
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    const perChar = Math.max(15, Math.min(20, Math.round(7000 / total)));
    let ni = 0, ci = 0, iv = null;
    const handle = { finish: finishTyper };
    // first char shows synchronously — the answer is visible the instant the
    // chip is tapped; the typewriter then carries the rest
    nodes[0].node.nodeValue = nodes[0].full.slice(0, 1);
    ci = 1;
    iv = setInterval(() => {
      const x = nodes[ni];
      if (!x) return finishTyper();
      x.node.nodeValue = x.full.slice(0, ci + 1);
      if (ci + 1 >= x.full.length) {
        ni += 1; ci = 0;
        const nxt = nodes[ni];
        if (nxt) { caret.remove(); nxt.node.parentElement.appendChild(caret); }
      } else {
        ci += 1;
      }
      msgsEl.scrollTop = msgsEl.scrollHeight;
      if (ni >= nodes.length) finishTyper();
    }, perChar);
    return handle;
  }

  // Instant local answer for a chip question — no network, no busy lock.
  // Returns false if the question isn't prebaked (caller falls back to /api/ai).
  function answerPrebaked(question, chip) {
    const answer = PREBAKED[question];
    if (!answer) return false;
    if (activeTyper) { activeTyper.finish(); activeTyper = null; }
    addMsg('user', question);
    history.push({ role: 'user', content: question }, { role: 'assistant', content: answer });
    activeTyper = typeBotMsg(answer);
    if (chip) {
      chip.classList.add('guide-chip--seen');
      chip.setAttribute('aria-pressed', 'true');
    }
    return true;
  }

  const THINKING = ['Thinking…', 'Warming up…', 'Counting reps…', 'Checking the ladder…'];
  function addLoading() {
    const div = document.createElement('div');
    div.className = 'msg msg--bot msg--loading';
    div.setAttribute('aria-label', 'Guide is typing');
    div.innerHTML = '<i></i><i></i><i></i><span class="guide-thinking"></span>';
    const label = div.querySelector('.guide-thinking');
    let n = 0;
    label.textContent = THINKING[0];
    const iv = setInterval(() => {
      n = (n + 1) % THINKING.length;
      label.textContent = THINKING[n];
    }, 2200);
    div._stopThinking = () => clearInterval(iv);
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return div;
  }

  function addError(text, kind = 'generic') {
    const div = document.createElement('div');
    div.className = 'msg msg--error';
    const span = document.createElement('span');
    // A provider quota/rate limit is not a broken guide — say so honestly, and
    // point at the starter chips, which still answer instantly with no network.
    span.textContent = kind === 'ratelimit'
      ? 'Hit the AI usage limit for now — the starter chips below still answer instantly.'
      : 'Guide is catching its breath — try again.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'guide-retry';
    btn.textContent = 'Retry';
    btn.addEventListener('click', () => {
      div.remove();
      ask(text, { silent: true });
    });
    div.append(span, btn);
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  // -- network -----------------------------------------------------------------
  // Sends the last HISTORY_LIMIT history entries plus the current question.
  // The system hint carries the section the visitor is looking at.
  async function transmit(text) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [...history.slice(-HISTORY_LIMIT), { role: 'user', content: text }],
          system: `${SYSTEM} The visitor is currently viewing the "${currentSection}" section of the page.`,
        }),
        signal: ctrl.signal,
      });
      const ctype = res.headers.get('content-type') || '';
      if (!ctype.includes('application/json')) throw new Error('non-json response');
      const data = await res.json(); // throws on garbage body
      if (!res.ok) {
        // 429 (ours or the provider's) → a "come back later", surfaced as a
        // distinct, non-alarming message rather than a generic failure.
        const err = new Error('http ' + res.status);
        err.kind = res.status === 429 ? 'ratelimit' : 'generic';
        throw err;
      }
      const reply = typeof data?.text === 'string' ? data.text.trim() : '';
      if (!reply) throw new Error('empty reply');
      return reply;
    } finally {
      clearTimeout(timer);
    }
  }

  async function ask(text, { silent = false } = {}) {
    if (busy) return;
    busy = true;
    sendBtn.disabled = true;
    if (activeTyper) { activeTyper.finish(); activeTyper = null; } // settle any typing first
    if (!silent) addMsg('user', text);
    const loading = addLoading();
    try {
      const reply = await transmit(text);
      history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
      addMsg('bot', reply);
      // chips stay visible — prebaked starters are instant and re-tappable
    } catch (err) {
      // history stays clean (user turn only lands on success) — retry re-sends.
      addError(text, err && err.kind === 'ratelimit' ? 'ratelimit' : 'generic');
    } finally {
      if (loading._stopThinking) loading._stopThinking();
      loading.remove();
      busy = false;
      sendBtn.disabled = false;
      if (panel.classList.contains('open')) input.focus();
    }
  }

  // -- input --------------------------------------------------------------------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    ask(text);
  });

  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('button[data-q]');
    if (!chip) return;
    // prebaked first (instant, works even while a network ask is in flight);
    // unknown chip falls through to the live model
    if (!answerPrebaked(chip.dataset.q, chip)) ask(chip.dataset.q);
  });

  // -- section tracking boot ------------------------------------------------------
  measureSections();
  updateCurrentSection();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    measureSections();
    updateCurrentSection();
  });
}
