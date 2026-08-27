// /system — dissemination page behaviour: family grid + progress bars, swatch copy,
// scroll reveals, nav scroll-spy, hero count-ups.
const $ = (id) => document.getElementById(id);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

// Family columns: header + live-progress bar (computed, never hardcoded) + cards.
$('famGrid').innerHTML = FAMILIES.map(([id, name, els]) => {
  const live = els.filter((e) => e[1] === 'live').length;
  const pct = Math.round((live / els.length) * 100);
  const tier = pct === 100 ? 'f-full' : live > 0 ? 'f-part' : 'f-zero';
  const cards = els.map(([n, st, d]) => {
    const [cls, label] = ST[st];
    return `<div class="fam-card"><div class="row"><b>${n}</b><span class="st ${cls}">${label}</span></div><p>${d}</p></div>`;
  }).join('');
  return `<div class="fam-col">
    <div class="fam-head">
      <p class="map-head">FAMILY ${id} — ${name.toUpperCase()}</p>
      <span class="fam-count"><b>${live}</b>/${els.length} live</span>
    </div>
    <div class="fam-bar ${tier}" data-w="${pct}%"><i style="--w:${pct}%"></i></div>
    ${cards}
  </div>`;
}).join('');

// Animate family bars filling when they scroll into view.
const famBars = document.querySelectorAll('.fam-bar');
if (REDUCED) {
  famBars.forEach((b) => b.classList.add('go'));
} else {
  const barIO = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('go');
      barIO.unobserve(e.target);
    }),
    { threshold: 0.4 }
  );
  famBars.forEach((b) => barIO.observe(b));
}

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

// ── Nav scroll-spy — highlight the section whose top has passed the nav line ─
const navLinks = [...document.querySelectorAll('.sys-nav-links a')];
const spySections = navLinks
  .map((a) => document.getElementById(a.getAttribute('href').slice(1)))
  .filter(Boolean);
if (spySections.length) {
  const setActive = (sec) => {
    if (!sec) return;
    navLinks.forEach((a) => a.classList.toggle('active', a.hash === `#${sec.id}`));
  };
  let raf = 0;
  const update = () => {
    raf = 0;
    const line = window.scrollY + 120; // a little below the sticky nav
    let current = spySections[0];      // above everything → first section
    for (const s of spySections) {
      if (s.getBoundingClientRect().top + window.scrollY <= line) current = s;
    }
    // pinned to the bottom → always flag the last section
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = spySections[spySections.length - 1];
    }
    setActive(current);
  };
  const onScroll = () => raf || (raf = requestAnimationFrame(update));
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  navLinks.forEach((a) => a.addEventListener('click', () => {
    const sec = document.getElementById(a.hash.slice(1));
    if (sec) setActive(sec);
  }));
  update();
}

// ── Hero stat count-ups (600ms ease-out; reduced-motion → instant) ──────────
const counters = document.querySelectorAll('[data-count]');
if (counters.length) {
  const run = (el) => {
    const target = Number(el.dataset.count) || 0;
    const suffix = el.dataset.suffix || '';
    if (REDUCED) { el.textContent = target + suffix; return; }
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 600);
      const v = Math.round(target * (1 - Math.pow(1 - p, 3))); // ease-out cubic
      el.textContent = v + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ('IntersectionObserver' in window) {
    const cIO = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        run(e.target);
        cIO.unobserve(e.target);
      }),
      { threshold: 0.6 }
    );
    counters.forEach((c) => cIO.observe(c));
  } else {
    counters.forEach(run);
  }
}

// ── Scroll reveals (same pattern as site) ───────────────────────────────────
if (!REDUCED) {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
    { threshold: 0.08 }
  );
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
}
