// RWF site — AI guide widget. Launcher + chat panel wired to POST /api/ai.
// Deliberately a STANDALONE module (own <script type="module"> tag): a failure
// here can never take down main.js boot (hero/graph scenes keep running).
// No deps. Vanilla DOM. Respects prefers-reduced-motion via site.css.

const ENDPOINT = '/api/ai';
const SYSTEM = 'You are guiding a visitor around the Reps With Friends showcase page.';
const HISTORY_LIMIT = 12;   // last N messages sent to the model
const TIMEOUT_MS = 30_000;  // AbortController deadline
const OPEN_KEY = 'rwf-guide-open'; // sessionStorage: panel open across reloads

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
        addMsg('bot', "Hey! I'm the RWF guide. Ask me about the match format, handicaps, verification — or tap a starter below.");
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

  // restore open state across reloads (no focus steal, no greeting re-roll)
  try {
    if (sessionStorage.getItem(OPEN_KEY) === '1') {
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      launcher.setAttribute('aria-expanded', 'true');
      launcher.classList.remove('pulse');
      greeted = true;
      addMsg('bot', "Still here — ask away.");
    }
  } catch { /* ignore */ }

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

  function addError(text) {
    const div = document.createElement('div');
    div.className = 'msg msg--error';
    const span = document.createElement('span');
    span.textContent = 'Guide is catching its breath — try again.';
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
      if (!res.ok) throw new Error('http ' + res.status); // 429 / 502 / 503 …
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
    if (!silent) addMsg('user', text);
    const loading = addLoading();
    try {
      const reply = await transmit(text);
      history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
      addMsg('bot', reply);
      chipsEl.hidden = true; // starters retire only after the first real answer
    } catch {
      // history stays clean (user turn only lands on success) — retry re-sends.
      addError(text);
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
    if (!chip || busy) return;
    ask(chip.dataset.q);
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
