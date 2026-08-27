// RWF debug page — every element, live.
const $ = (id) => document.getElementById(id);

// ── System status ────────────────────────────────────────────────────────────
async function loadState() {
  try {
    const r = await fetch('/api/state');
    const st = await r.json();
    const dots = [];
    const dot = (ok, label, extra = '') =>
      `<span class="rwf-tag"><span class="rwf-dot ${ok ? 'rwf-dot--ok' : 'rwf-dot--down'}"></span>${label}${extra}</span>`;
    dots.push(dot(true, 'server', ` · ${st.server?.uptimeSec ?? 0}s`));
    dots.push(dot(st.qalarcHub?.ok, 'qalarc hub'));
    dots.push(dot(st.bots?.whatsapp?.running, 'wa bot'));
    dots.push(dot(st.bots?.slack?.running, 'slack bot'));
    dots.push(dot(true, 'matches', ` · ${st.matches?.length ?? 0}`));
    $('sysDots').innerHTML = dots.join('');
    $('sysRaw').textContent = JSON.stringify(st, null, 2);
  } catch {
    $('sysDots').innerHTML = '<span class="rwf-tag"><span class="rwf-dot rwf-dot--down"></span>server unreachable</span>';
  }
}
loadState();
setInterval(loadState, 5000);

// ── Engine lab (exact port of game-core handicap math) ──────────────────────
const TIER = { couch: 1.5, casual: 1.25, fit: 1.0, athlete: 0.85 };
function lab() {
  const tier = $('labTier').value;
  const reps = Math.max(1, parseInt($('labReps').value || '0', 10));
  let mult = TIER[tier];
  let note = `tier ×${mult}`;
  if ($('labHrr').checked) {
    const blended = 0.7 * (80 / 70) + 0.3 * mult; // %HRR 80 vs baseline 70
    note += ` → %HRR blend ×${blended.toFixed(3)}`;
    mult = blended;
  }
  let score = reps * mult;
  if ($('labComeback').checked) { score *= 1.2; note += ' · comeback ×1.2'; }
  $('labOut').textContent = `${reps} reps → adjusted ${score.toFixed(1)}  (${note})`;
}
['labTier', 'labReps', 'labComeback', 'labHrr'].forEach((id) => $(id).addEventListener('input', lab));
lab();

// ── Bot console (real bus, in-memory, via /api/sim) ─────────────────────────
const term = $('term');
function tprint(cls, text) {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  term.appendChild(div);
  term.scrollTop = term.scrollHeight;
}
tprint('t-bot', 'RWF bot console ready — in-memory match store. Try: new');
$('termForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('termInput').value.trim();
  if (!text) return;
  $('termInput').value = '';
  tprint('t-user', '▸ ' + text);
  try {
    const r = await fetch('/api/sim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, user: 'Debugger', userId: 'debugger' }),
    });
    const d = await r.json();
    tprint(d.ok ? 't-bot' : 't-err', d.reply ?? d.error ?? 'no reply');
    if (d.cardUrl) {
      $('cardWrap').innerHTML = `<iframe src="${d.cardUrl}" title="result card"></iframe>`;
    }
  } catch {
    tprint('t-err', 'console unavailable (local server only)');
  }
});

// ── AI endpoint test ─────────────────────────────────────────────────────────
$('aiForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('aiInput').value.trim();
  if (!q) return;
  $('aiInput').value = '';
  $('aiOut').textContent = '…';
  try {
    const r = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: q }] }),
    });
    const d = await r.json();
    $('aiOut').textContent = d.text ?? JSON.stringify(d);
  } catch {
    $('aiOut').textContent = 'AI endpoint unreachable';
  }
});

// ── Element gallery (families A–F from docs/07) ──────────────────────────────
const ELEMENTS = [
  ['A1', '300-format match', 'live', 'Any reps, any order; first to target closes'],
  ['A2', 'Tier handicap v1', 'live', 'couch ×1.5 → athlete ×0.85'],
  ['A3', '%HRR handicap v2', 'next', 'Karvonen blend — engine ready, needs straps'],
  ['A4', 'Closure bonus', 'live', '+15 urgency for the closer'],
  ['A5', 'Charity pot', 'live', 'Winner directs, never receives'],
  ['A6', 'Taunt engine', 'live', 'AI-generated with canned fallback'],
  ['B7', 'Seasons', 'live', '4-week series, points, champion belt'],
  ['B8', 'Relegation/promotion', 'live', 'A/B divisions swap at season end'],
  ['B9', 'Comeback ×1.2', 'live', '>30% behind → one-time boost'],
  ['B10', 'MVP vote', 'live', 'Second podium, feeds season points'],
  ['B11', 'Streak forgiveness', 'live', '$2 charity top-up saves the streak'],
  ['B12', 'Baseline learning', 'live', 'Anti-sandbag drift (HR + volume)'],
  ['C13', 'Result cards', 'live', 'SVG from bots, PNG from app'],
  ['C14', 'Drop-cam clips', 'later', 'ffmpeg mid-set moments'],
  ['C15', 'Spectator mode', 'live', 'watch a crew without joining'],
  ['C16', 'Crew-vs-crew', 'live', 'challenge + rivalry cards'],
  ['C17', 'Public ladder', 'idea', 'opt-in web ladder for publicity wave'],
  ['D18', 'Org leagues', 'live', 'hub corporate tab (seeded)'],
  ['D19', 'Employer-funded pots', 'live', 'legally-cleanest structure'],
  ['D20', 'Admin dashboard', 'live', 'aggregate-only, k≥5'],
  ['D21', 'Onboarding-as-a-service', 'idea', 'we run month one'],
  ['E22', 'Camera rep counting', 'live', 'MoveNet in-browser (lane 7)'],
  ['E23', 'BLE HR straps', 'live', 'Web Bluetooth GATT 0x180D'],
  ['E24', 'Apple Watch live HR', 'later', 'HealthKit, Phase 3'],
  ['E25', 'WHOOP/Garmin cross-check', 'later', 'cloud verification, Phase 3'],
  ['F', 'Referee review', 'idea', 'crew verdicts on flagged sets'],
  ['F', 'Physical champion belt', 'idea', 'real trophies, zero crypto'],
  ['F', 'Radio mode', 'idea', "Ben's drumming as rep-cadence cues"],
  ['F', 'Charity championship', 'idea', 'annual inter-crew, sponsored'],
  // G — second wave. Must stay in step with apps/systempage/system.js.
  ['G26', 'Rematch button', 'live', 'one tap → next match'],
  ['G27', 'Monday digest', 'live', 'AI weekly recap to the chat'],
  ['G28', 'Nemesis system', 'live', 'auto rival detection'],
  ['G29', 'Personal records', 'idea', 'PR celebration cards'],
  ['G30', 'Photo finish', 'live', 'special card when top two within 5%'],
  ['G31', 'Ghost race', 'idea', 'solo vs your past self'],
  ['G32', 'Guest slot', 'idea', 'account-less one-match visitor'],
  ['G33', 'Charity all-time ladder', 'idea', 'giving is competitive too'],
  ['G34', 'Roast-tier setting', 'idea', 'banter intensity control'],
  ['G35', 'Adaptive equivalents', 'idea', 'seated/low-impact variants'],
  ['G36', 'Warm-up predictions', 'idea', 'pre-match pick the winner'],
];
const ST = { live: ['st-live', 'LIVE'], next: ['st-next', 'NEXT'], idea: ['st-idea', 'IDEA'], later: ['st-later', 'LATER'] };
$('elementGrid').innerHTML = ELEMENTS.map(([id, name, st, desc]) => {
  const [cls, label] = ST[st];
  return `<div class="dbg-el"><div class="row"><b>${id} · ${name}</b><span class="st ${cls}">${label}</span></div><p>${desc}</p></div>`;
}).join('');
