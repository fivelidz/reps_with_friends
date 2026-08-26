// /demo — auto-playing match replay. Scripted timeline, real engine math.
const $ = (id) => document.getElementById(id);

// ── players & engine math (exact game-core semantics) ──────────────────────
const TIER = { couch: 1.5, casual: 1.25, fit: 1.0, athlete: 0.85 };
const PLAYERS = [
  { id: 'dave', name: 'Dave', tier: 'couch', mult: 1.5 },
  { id: 'ben', name: 'Ben', tier: 'athlete', mult: 0.85 },
  { id: 'alexei', name: 'Alexei', tier: 'casual', mult: 1.25 },
  { id: 'nico', name: 'Nico', tier: 'fit', mult: 1.0 },
];
const state = { raw: {}, adj: {}, comebackUsed: {}, closed: false };

function raw(id) { return state.raw[id] ?? 0; }
function adj(id) { return state.adj[id] ?? 0; }
function log(id, reps, comeback = false) {
  state.raw[id] = raw(id) + reps;
  state.adj[id] = Math.round((adj(id) + reps * PLAYERS.find((p) => p.id === id).mult * (comeback ? 1.2 : 1)) * 10) / 10;
}

// ── standings board ──────────────────────────────────────────────────────────
function sorted() {
  return [...PLAYERS].sort((a, b) => adj(b.id) - adj(a.id));
}
function renderRows() {
  const rows = sorted();
  const leaderRaw = Math.max(...PLAYERS.map((p) => raw(p.id)));
  $('rows').innerHTML = rows
    .map((p, i) => {
      const pct = Math.min(100, Math.round((raw(p.id) / 300) * 100));
      const behind = leaderRaw > 0 && (leaderRaw - raw(p.id)) / leaderRaw > 0.3 && !state.comebackUsed[p.id] && !state.closed;
      const medal = ['🥇', '🥈', '🥉', '4'][i];
      return `<div class="srow ${i === 0 ? 'lead' : ''} ${behind ? 'hot' : ''}">
        <div class="medal">${medal}</div>
        <div class="who">
          <div class="name">${p.name}<span class="tier tier--${p.tier}">${p.tier} ×${p.mult}</span>${behind ? '<span class="cb">⚡ comeback armed</span>' : ''}</div>
          <div class="bar"><i style="width:${pct}%"></i></div>
        </div>
        <div class="score"><div class="adj">${adj(p.id)}</div><div class="raw">${raw(p.id)} raw · ${pct}%</div></div>
      </div>`;
    })
    .join('');
}

// ── chat ─────────────────────────────────────────────────────────────────────
function bubble(kind, html, hot = false) {
  const div = document.createElement('div');
  div.className = `bub bub--${kind}${hot ? ' bub--hot' : ''}`;
  div.innerHTML = html;
  $('chat').appendChild(div);
  $('chat').scrollTop = $('chat').scrollHeight;
}
const user = (name, text) => bubble('user', `<b style="color:var(--lime)">${name}</b> · ${text}`);
const bot = (html, hot) => bubble('bot', html, hot);
const sys = (text) => bubble('sys', text);

// ── timeline ─────────────────────────────────────────────────────────────────
// [delayMs, fn]
const SCRIPT = [
  [400, () => sys('Tuesday · play day')],
  [700, () => { user('Ben', 'right lads, 300 today. burpees included 😈'); }],
  [1100, () => bot('🏋️ <b>Match created — first to 300 reps</b>\nPush-ups, Squats, Sit-ups, Burpees, Lunges\nPlay days: Tue · Thu\n\n<code>join</code> with your tier — couch / casual / fit / athlete')],
  [1000, () => { user('Dave', 'join couch'); }],
  [500, () => bot('✅ <b>Dave</b> in as <b>couch</b> (1 playing)\nTier matters — couch reps are worth 1.5×, athlete reps 0.85×. Effort wins.')],
  [800, () => { user('Ben', 'join athlete'); user('Alexei', 'join casual'); user('Nico', 'join fit'); }],
  [700, () => bot('✅ <b>Ben</b> (athlete) · <b>Alexei</b> (casual) · <b>Nico</b> (fit) — 4 playing\n<code>start</code> when you\'re ready.')],
  [900, () => { user('Ben', 'start'); }],
  [500, () => { $('matchStatus').textContent = 'match live'; bot('🔥 <b>Match live.</b> Any reps, any order. First to 300 closes it — highest effort-adjusted score wins.'); renderRows(); }],

  [1200, () => { user('Ben', 'log pushups 60!'); log('ben', 60); }],
  [600, () => bot('💪 <b>Ben</b> logs 60 push-ups ✅camera')],
  [900, () => { user('Dave', 'log pushups 40!'); log('dave', 40); }],
  [500, () => bot('💪 <b>Dave</b> logs 40 push-ups ✅camera')],
  [900, () => { user('Nico', 'log situps 50!'); log('nico', 50); }],
  [500, () => { bot('💪 <b>Nico</b> logs 50 sit-ups ✅camera'); renderRows(); }],

  [1100, () => { user('Alexei', 'taunt dave'); }],
  [700, () => bot('😤 <b>Dave</b> is saving their reps for the off-season, apparently.')],
  [900, () => { user('Dave', 'log squats 45!'); log('dave', 45); }],
  [500, () => { bot('💪 <b>Dave</b> logs 45 squats ✅camera'); renderRows(); }],

  [1100, () => { user('Ben', 'log squats 70!'); log('ben', 70); }],
  [600, () => bot('💪 <b>Ben</b> logs 70 squats ✅camera')],
  [900, () => { user('Nico', 'log pushups 55!'); log('nico', 55); }],
  [500, () => { bot('💪 <b>Nico</b> logs 55 push-ups ✅camera'); renderRows(); }],

  [1200, () => { sys('Dave is 43% behind — comeback armed'); }],
  [700, () => { user('Dave', 'log burpees 30!'); log('dave', 30, true); state.comebackUsed.dave = true; }],
  [600, () => bot('⚡ <b>COMEBACK ×1.2</b> — <b>Dave</b> logs 30 burpees ✅camera. Adjusted 54. The couch bites back.', true)],
  [800, () => { renderRows(); bot('👁 2 watching from the office. <code>s</code> for standings anytime.'); }],

  [1100, () => { user('Alexei', 'log squats 35'); log('alexei', 35); }],
  [500, () => bot('💪 <b>Alexei</b> logs 35 squats')],
  [900, () => { user('Ben', 'log situps 65!'); log('ben', 65); }],
  [500, () => { bot('💪 <b>Ben</b> logs 65 sit-ups ✅camera'); renderRows(); }],

  [1100, () => { user('Nico', 'log squats 60!'); log('nico', 60); }],
  [500, () => bot('💪 <b>Nico</b> logs 60 squats ✅camera')],
  [900, () => { user('Dave', 'log situps 50!'); log('dave', 50); }],
  [500, () => { bot('💪 <b>Dave</b> logs 50 sit-ups ✅camera'); renderRows(); }],

  [1100, () => { user('Alexei', 'pot 500'); }],
  [600, () => { $('pot').hidden = false; $('potAmt').textContent = '$5.00'; bot('💰 <b>Alexei</b> chucks $5 in the charity pot. Winner picks where it goes.'); }],
  [900, () => { user('Ben', 'pot 500'); user('Nico', 'pot 500'); user('Dave', 'pot 500'); }],
  [700, () => { $('potAmt').textContent = '$20.00'; bot('💰 Pot at <b>$20.00</b>. Stakes are real, nobody\'s gambling.'); }],

  [1200, () => { user('Ben', 'log pushups 60!'); log('ben', 60); }],
  [600, () => bot('💪 <b>Ben</b> logs 60 push-ups ✅camera — 255 raw, closing in')],
  [900, () => { user('Dave', 'log pushups 25!'); log('dave', 25); }],
  [500, () => bot('💪 <b>Dave</b> logs 25 push-ups ✅camera'); renderRows(); }],

  [1300, () => { user('Ben', 'log squats 45!'); log('ben', 45); state.closed = true; }],
  [600, () => bot('🔥 <b>Ben</b> logs 45 squats — <b>THAT\'S 300. MATCH CLOSED</b> 🏁', true)],
  [800, () => { $('matchStatus').textContent = 'complete'; renderRows(); }],
  [900, () => { user('Ben', 'result'); }],
  [700, () => {
    const w = sorted()[0];
    $('potNote').textContent = `${w.name} picks — Beyond Blue`;
    bot(`🏁 <b>MATCH RESULT</b>\n🏆 <b>${w.name}</b> takes it — adjusted <b>${adj(w.id)}</b>\n\n1. Dave — ${adj('dave')} (190 raw)\n2. Ben — ${Math.round((adj('ben') + 15) * 10) / 10} (300 raw, +15 close bonus)\n3. Nico — ${adj('nico')} (165 raw)\n4. Alexei — ${adj('alexei')} (105 raw)\n\nBen closed it. <b>Dave won it.</b> Effort > fitness.\n💰 $20.00 → charity, Dave picks.`, true);
  }],
  [1400, () => { user('Nico', 'mvp dave'); }],
  [700, () => bot('🏅 <b>MVP: Dave</b> — voted by the crew. +1 season point.')],
  [1000, () => { $('cta').hidden = false; $('cta').scrollIntoView({ behavior: 'smooth', block: 'center' }); }],
];

// ── player ────────────────────────────────────────────────────────────────────
let timer = null;
let speed = 1;
let cursor = 0;
let playing = false;

function reset() {
  stop();
  cursor = 0;
  state.raw = {}; state.adj = {}; state.comebackUsed = {}; state.closed = false;
  $('chat').innerHTML = '';
  $('rows').innerHTML = '';
  $('pot').hidden = true;
  $('potAmt').textContent = '$0.00';
  $('potNote').textContent = '';
  $('matchStatus').textContent = 'match live';
  $('cta').hidden = true;
  renderRows();
}
function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
  playing = false;
  $('btnPlay').textContent = '▶ Play';
}
function step() {
  if (cursor >= SCRIPT.length) { stop(); return; }
  const [delay, fn] = SCRIPT[cursor++];
  timer = setTimeout(() => { fn(); step(); }, delay / speed);
}
function play() {
  if (cursor >= SCRIPT.length) reset();
  playing = true;
  $('btnPlay').textContent = '⏸ Pause';
  step();
}
function toggle() { playing ? stop() : play(); }

$('btnPlay').addEventListener('click', toggle);
$('btnRestart').addEventListener('click', () => { reset(); play(); });
$('btnSpeed').addEventListener('click', () => {
  speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
  $('btnSpeed').textContent = speed + '×';
});

reset();
