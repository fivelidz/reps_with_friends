// /system — dissemination page behaviour: family grid, swatch copy, reveals.
const $ = (id) => document.getElementById(id);

// ── Feature families (mirrors docs/07_BRAINSTORM_ELEMENTS.md) ───────────────
const FAMILIES = [
  ['A', 'Core loop', [
    ['A1 300-format match', 'live', 'any reps, any order, first to target closes'],
    ['A2 tier handicap v1', 'live', 'couch ×1.5 → athlete ×0.85'],
    ['A3 %HRR handicap v2', 'next', 'Karvonen blend — engine ready, needs straps'],
    ['A4 closure bonus', 'live', '+15 urgency for the closer'],
    ['A5 charity pot', 'live', 'winner directs, never receives'],
    ['A6 taunt engine', 'live', 'AI-generated, canned fallback'],
  ]],
  ['B', 'Retention arc', [
    ['B7 seasons', 'live', '4-week series, points, champion belt'],
    ['B8 relegation', 'live', 'A/B divisions swap at season end'],
    ['B9 comeback ×1.2', 'live', '>30% behind → one-time boost'],
    ['B10 MVP vote', 'live', 'second podium, feeds season points'],
    ['B11 streak forgiveness', 'live', '$2 charity top-up saves the streak'],
    ['B12 baseline learning', 'live', 'anti-sandbag drift'],
  ]],
  ['C', 'Social & viral', [
    ['C13 result cards', 'live', 'SVG from bots, PNG from app'],
    ['C14 drop-cam clips', 'later', 'ffmpeg mid-set moments'],
    ['C15 spectator mode', 'live', 'watch a crew without joining'],
    ['C16 crew-vs-crew', 'live', 'challenge + rivalry cards'],
    ['C17 public ladder', 'idea', 'opt-in web ladder'],
  ]],
  ['D', 'Corporate', [
    ['D18 org leagues', 'live', 'hub corporate tab'],
    ['D19 employer-funded pots', 'live', 'legally-cleanest structure'],
    ['D20 admin dashboard', 'live', 'aggregate-only, k≥5'],
    ['D21 onboarding-as-a-service', 'idea', 'we run month one'],
  ]],
  ['E', 'Verification', [
    ['E22 camera rep counting', 'next', 'MoveNet in-browser'],
    ['E23 BLE HR straps', 'next', 'Web Bluetooth'],
    ['E24 Apple Watch live HR', 'later', 'HealthKit, phase 3'],
    ['E25 WHOOP/Garmin cross-check', 'later', 'cloud verification'],
  ]],
  ['F', 'Wilder cards', [
    ['F referee review', 'idea', 'crew verdicts on flagged sets'],
    ['F physical champion belt', 'idea', 'real trophies, zero crypto'],
    ['F radio mode', 'idea', "drum tracks as rep-cadence cues"],
    ['F charity championship', 'idea', 'annual inter-crew'],
  ]],
  ['G', 'Second wave (proposed)', [
    ['G26 rematch button', 'idea', 'one tap → next match'],
    ['G27 Monday digest', 'idea', 'AI weekly recap to the chat'],
    ['G28 nemesis system', 'idea', 'auto rival detection'],
    ['G29 personal records', 'idea', 'PR celebration cards'],
    ['G30 photo finish', 'idea', 'special card when top two within 5%'],
    ['G31 ghost race', 'idea', 'solo vs your past self'],
    ['G32 guest slot', 'idea', 'account-less one-match visitor'],
    ['G33 charity all-time ladder', 'idea', 'giving is competitive too'],
    ['G34 roast-tier setting', 'idea', 'banter intensity control'],
    ['G35 adaptive equivalents', 'idea', 'seated/low-impact variants'],
    ['G36 warm-up predictions', 'idea', 'pre-match pick the winner'],
  ]],
];
const ST = { live: ['st-live', 'LIVE'], next: ['st-next', 'NEXT'], idea: ['st-idea', 'IDEA'], later: ['st-later', 'LATER'] };
$('famGrid').innerHTML = FAMILIES.map(([id, name, els]) => {
  const cards = els.map(([n, st, d]) => {
    const [cls, label] = ST[st];
    return `<div class="fam-card"><div class="row"><b>${n}</b><span class="st ${cls}">${label}</span></div><p>${d}</p></div>`;
  }).join('');
  return `<div><p class="map-head" style="margin:0 0 8px">FAMILY ${id} — ${name.toUpperCase()} (${els.length})</p><div style="display:grid;gap:8px">${cards}</div></div>`;
}).join('');

// ── Swatch copy ──────────────────────────────────────────────────────────────
document.querySelectorAll('.swatch').forEach((sw) => {
  sw.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(sw.dataset.hex); } catch { /* ignore */ }
    const em = sw.querySelector('em');
    const old = em.textContent;
    em.textContent = 'copied ✓';
    setTimeout(() => (em.textContent = old), 1200);
  });
});

// ── Scroll reveals (same pattern as site) ───────────────────────────────────
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
    { threshold: 0.08 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
}
