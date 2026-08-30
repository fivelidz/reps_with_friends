// /avatars — avatar STYLE EXPLORATION + tuning studio.
//
// Two halves:
//   1. GALLERY — every style side by side, same exercise/build/height, so the
//      founder can compare directions rather than judge one figure in isolation.
//      Each card prints the proportions MEASURED off its own live rig.
//   2. STUDIO — the original single-figure playground, now driven by whichever
//      style the gallery selects.
//
// Local tool only: not linked from the public site, not part of the deploy.
import * as THREE from 'three';
import {
  AvatarScene, EXERCISES, EXERCISE_NAMES, TIER_COLORS, TIER_ACCENTS,
  SKIN_TONES, OUTFIT_COLORS, HAIR_STYLES, ACCESSORIES, BUILDS,
  STYLE_IDS, STYLE_LIST, styleSummary, DEFAULT_STYLE,
  normalizeAvatarConfig, randomAvatarConfig, avatarConfigFromSeed,
} from '/site/avatars.js';

const $ = (id) => document.getElementById(id);
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The phase that shows the most about a rep: deep in the eccentric, where a
// squat is at its lowest and a push-up's chest is nearest the floor. Every
// "freeze mid-rep" affordance uses this, so screenshots are comparable.
const MID_REP = 0.52;

// ─────────────────────────────────────────────────────────────────────────────
// PAGE-WIDE WEBGL CONTEXT BUDGET
// Chrome hard-caps live WebGL contexts (~16) and force-LOSTS the oldest when a
// new one pushes over — the evicted card's canvas renders black/blank forever:
// its IntersectionObserver never refires while the card stays on screen, so
// nothing ever recreates the context (verified headless: "Too many active
// WebGL contexts. Oldest context will be lost" ×20+ during one browse, with
// whole cards reading 0 drawn pixels). The per-section lazy release (3s
// off-screen) is not enough on its own: while scrolling, everything you just
// passed is still inside its 3s grace and stacks up with the sections above.
// One page-wide pressure valve: before ANY renderer is created, release the
// oldest OFF-SCREEN live renderers until the page is under budget; plus a
// watchdog that cycles any visible card whose context died anyway.
const CTX_BUDGET = 12; // headroom under Chrome's ~16 cap for transient overlap
const ctxHolders = []; // { el, gl(), release(), ensure() }
function ctxRegister(h) { ctxHolders.push(h); }
/** live (non-lost) contexts among REGISTERED holders — never touches unknown
 *  canvases (getContext on a context-less canvas would CREATE one) */
function ctxCountLive() {
  let n = 0;
  for (const h of ctxHolders) { const gl = h.gl(); if (gl && !gl.isContextLost()) n++; }
  return n;
}
function ctxOnScreen(el) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
}
/** release oldest off-screen holders until under budget (registration order ≈
 *  document order, the same "oldest" the browser would evict — but only ones
 *  the user can't see, whose 3s timer would have released them anyway) */
function ctxMakeRoom() {
  for (const h of ctxHolders) {
    if (ctxCountLive() <= CTX_BUDGET) break;
    const gl = h.gl();
    if (!gl || gl.isContextLost() || ctxOnScreen(h.el)) continue;
    h.release();
  }
}
/** register + pre-create hook for an AvatarScene (style cards, presets, viewer).
 *  Wraps the instance's own _ensureRenderer so the valve runs before ITS
 *  context creation too — without touching site/avatars.js. */
function ctxGuardScene(sc) {
  if (!sc || sc.dead) return;
  const orig = sc._ensureRenderer?.bind(sc);
  if (orig) sc._ensureRenderer = () => { ctxMakeRoom(); orig(); };
  ctxRegister({
    el: sc.mount,
    gl: () => sc.renderer?.getContext?.() ?? null,
    release: () => sc._releaseRenderer?.(),
    ensure: () => sc._ensureRenderer?.(),
  });
}
// watchdog: a visible card with a lost context cycles its renderer and comes
// back within ~2s instead of staying black until the user scrolls away.
setInterval(() => {
  for (const h of ctxHolders) {
    const gl = h.gl();
    if (!gl || !gl.isContextLost() || !ctxOnScreen(h.el)) continue;
    h.release();
    h.ensure();
  }
}, 2000);

function fillSelect(el, values, labels) {
  el.innerHTML = values
    .map((v, i) => `<option value="${v}">${(labels && labels[i]) || cap(v)}</option>`)
    .join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// GALLERY
// ─────────────────────────────────────────────────────────────────────────────
// One AvatarScene per card rather than one shared row: each style needs its own
// camera framing (a 3-head chibi and a 6.8-head athlete do NOT fit the same
// frustum), and per-card scenes let a single style fail without blanking the
// comparison.

const galState = { exercise: 'squat', build: 'average', height: 1, playing: true };
const galCards = [];

fillSelect($('galExercise'), EXERCISE_NAMES, EXERCISE_NAMES.map((n) => EXERCISES[n].label));
fillSelect($('galBuild'), BUILDS);
$('galExercise').value = galState.exercise;
$('galBuild').value = galState.build;

const styleGrid = $('styleGrid');

for (const style of STYLE_LIST) {
  const sum = styleSummary(style.id, galState.build, galState.height);

  const card = document.createElement('article');
  card.className = 'style-card';
  card.dataset.style = style.id;
  card.innerHTML = `
    <div class="style-stage"></div>
    <div class="style-meta">
      <h3>${style.name}</h3>
      <p class="style-ratio"><b class="js-heads">${sum.heads}</b> heads tall</p>
      <p class="style-blurb">${style.blurb}</p>
      <dl class="style-facts">
        <div><dt>Legs</dt><dd class="js-leg">${sum.legPct}%</dd></div>
        <div><dt>Arm : torso</dt><dd class="js-arm">${sum.armVsTorso}×</dd></div>
        <div><dt>Neck</dt><dd class="js-neck">${sum.neckPct}%</dd></div>
      </dl>
      <p class="style-audit js-audit"></p>
      <button class="rwf-btn rwf-btn--sm js-pick" type="button">Use this style ↓</button>
    </div>`;
  styleGrid.appendChild(card);

  const cfg = normalizeAvatarConfig({
    style: style.id, tier: 'fit', build: galState.build, height: galState.height,
    hair: 'short', accessory: 'headband', skinTone: '#e9c49b', exercise: galState.exercise,
  });

  // frameAll: the camera MEASURES the figure instead of trusting a per-style
  // magic distance. Hardcoded values cropped the chibi and blocky heads while
  // leaving the tall styles small — and would break again the moment a style's
  // proportions were tweaked.
  const scene = new AvatarScene({
    mount: card.querySelector('.style-stage'),
    avatars: [cfg],
    fov: 32, ground: true, frameAll: true, frameMargin: 1.18,
  });

  const entry = { style, card, scene, cfg };
  galCards.push(entry);
  ctxGuardScene(scene);

  if (scene.dead) {
    card.querySelector('.style-stage').innerHTML =
      '<p class="stage-fallback">WebGL unavailable</p>';
  } else {
    scene.start();
    // Surface any proportion-audit failure ON the card. A style that breaks the
    // rules should be visibly flagged, not silently shipped.
    const av = scene.avatars[0];
    const auditEl = card.querySelector('.js-audit');
    if (av?.audit?.length) {
      auditEl.textContent = '⚠ ' + av.audit.join('; ');
      auditEl.classList.add('is-bad');
    } else {
      auditEl.textContent = '✓ proportion rules pass';
    }
  }

  card.querySelector('.js-pick').addEventListener('click', () => {
    selectStyle(style.id);
    $('stage').scrollIntoView({ block: 'center', behavior: REDUCED ? 'instant' : 'smooth' });
  });
}

/** Rebuild every gallery avatar for the current exercise/build/height. */
function syncGallery() {
  for (const e of galCards) {
    if (e.scene.dead) continue;
    e.cfg = normalizeAvatarConfig({
      ...e.cfg, build: galState.build, height: galState.height, exercise: galState.exercise,
    });
    e.scene.setAvatarConfig(0, e.cfg);

    // Re-measure and re-label from the rebuilt rig.
    const sum = styleSummary(e.style.id, galState.build, galState.height);
    e.card.querySelector('.js-heads').textContent = sum.heads;
    e.card.querySelector('.js-leg').textContent = `${sum.legPct}%`;
    e.card.querySelector('.js-arm').textContent = `${sum.armVsTorso}×`;
    e.card.querySelector('.js-neck').textContent = `${sum.neckPct}%`;
    const auditEl = e.card.querySelector('.js-audit');
    if (sum.audit.length) {
      auditEl.textContent = '⚠ ' + sum.audit.join('; ');
      auditEl.classList.add('is-bad');
    } else {
      auditEl.textContent = '✓ proportion rules pass';
      auditEl.classList.remove('is-bad');
    }
  }
  markActiveCard();
}

$('galExercise').addEventListener('change', (e) => {
  galState.exercise = e.target.value;
  syncGallery();
  // keep the studio in step — the point is comparing like with like
  apply({ exercise: galState.exercise, cycle: null });
});
$('galBuild').addEventListener('change', (e) => {
  galState.build = e.target.value;
  syncGallery();
  apply({ build: galState.build });
});
$('galHeight').addEventListener('input', (e) => {
  galState.height = Number(e.target.value);
  $('galHeightVal').textContent = `${galState.height.toFixed(2)}×`;
  syncGallery();
});
$('galPlay').addEventListener('change', (e) => {
  galState.playing = e.target.checked;
  for (const g of galCards) {
    if (g.scene.dead) continue;
    if (galState.playing) g.scene.resume(); else g.scene.freeze();
  }
});
$('btnFreezeMid').addEventListener('click', () => {
  // Freeze every style at the same phase — this is the screenshot affordance.
  galState.playing = false;
  $('galPlay').checked = false;
  for (const g of galCards) {
    if (g.scene.dead) continue;
    g.scene.freeze();
    g.scene.poseAll(MID_REP);
  }
  viewer.freeze();
  viewer.poseAll(MID_REP);
  $('chkPlay').checked = false;
});

// ─────────────────────────────────────────────────────────────────────────────
// STUDIO
// ─────────────────────────────────────────────────────────────────────────────
const START = normalizeAvatarConfig({
  style: DEFAULT_STYLE,
  tier: 'fit', skinTone: '#e9c49b', build: 'average', height: 1,
  hair: 'short', accessory: 'headband', exercise: 'squat',
});

let config = { ...START };

const viewer = new AvatarScene({
  mount: $('stage'),
  avatars: [config],
  spacing: 0.62, fov: 30, orbit: true, ground: true,
  frameAll: true, frameMargin: 1.10,
});
ctxGuardScene(viewer);

if (viewer.dead) {
  $('stage').innerHTML = '<p style="padding:24px;color:var(--muted)">WebGL unavailable — the studio needs it.</p>';
}

fillSelect($('selExercise'), EXERCISE_NAMES, EXERCISE_NAMES.map((n) => EXERCISES[n].label));
fillSelect($('selBuild'), BUILDS);
fillSelect($('selHair'), HAIR_STYLES);
fillSelect($('selAccessory'), ACCESSORIES);
fillSelect($('selTier'), Object.keys(TIER_COLORS));

// style pills
const pillWrap = $('stylePills');
for (const s of STYLE_LIST) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'style-pill';
  b.dataset.style = s.id;
  b.textContent = s.name;
  b.addEventListener('click', () => selectStyle(s.id));
  pillWrap.appendChild(b);
}

function selectStyle(id) {
  apply({ style: id });
}

function markActiveCard() {
  for (const b of pillWrap.querySelectorAll('.style-pill')) {
    b.classList.toggle('is-active', b.dataset.style === config.style);
  }
  for (const e of galCards) {
    e.card.classList.toggle('is-active', e.style.id === config.style);
  }
}

function fillSwatches(el, colors, key) {
  el.innerHTML = '';
  for (const c of colors) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch-btn';
    b.style.background = c;
    b.title = c;
    b.setAttribute('aria-label', `Set ${key} to ${c}`);
    b.addEventListener('click', () => apply({ [key]: c }));
    el.appendChild(b);
  }
}
fillSwatches($('swatchSkin'), SKIN_TONES, 'skinTone');
fillSwatches($('swatchOutfit'), OUTFIT_COLORS, 'outfitColor');

// apply() is the ONLY way config changes: normalise, push to the scene, then
// sync every control + the JSON box back from the RESULT. The UI therefore can
// never drift from what's actually rendered.
function apply(patch, { syncControls = true } = {}) {
  config = normalizeAvatarConfig({ ...config, ...patch });
  viewer.setAvatarConfig(0, config);
  if (syncControls) syncUI();
  syncJson();
  syncStyleInfo();
  markActiveCard();
  refreshPresets();
}

function syncUI() {
  $('selExercise').value = config.exercise;
  $('selBuild').value = config.build;
  $('selHair').value = config.hair;
  $('selAccessory').value = config.accessory;
  $('selTier').value = config.tier;
  $('colSkin').value = config.skinTone;
  $('colOutfit').value = config.outfitColor;
  $('colAccent').value = config.accentColor;
  $('colHair').value = config.hairColor;
  $('rngHeight').value = String(config.height);
  $('valHeight').textContent = `${config.height.toFixed(2)}×`;
}

/** Print the live rig's measured proportions over the viewer. */
function syncStyleInfo() {
  const s = STYLE_LIST.find((x) => x.id === config.style);
  const sum = styleSummary(config.style, config.build, config.height);
  $('hudStyle').textContent = s ? s.name : config.style;
  let blurb = s?.blurb ?? '';
  if (s?.ignores?.length) blurb += ` (ignores: ${s.ignores.join(', ')})`;
  $('styleBlurb').textContent = blurb;
  $('hudRatios').innerHTML =
    `<span>${sum.heads} heads</span><span>legs ${sum.legPct}%</span>`
    + `<span>arm:torso ${sum.armVsTorso}×</span><span>neck ${sum.neckPct}%</span>`
    + (sum.audit.length ? `<span class="is-bad">⚠ ${sum.audit.join('; ')}</span>` : '<span class="is-ok">✓ rules pass</span>');

  // Hair/accessory controls that a style ignores get visibly disabled, rather
  // than silently doing nothing — that reads as a bug otherwise.
  const ig = s?.ignores ?? [];
  $('selHair').disabled = ig.includes('hair');
  $('selHair').closest('.ctl').classList.toggle('is-disabled', ig.includes('hair'));
  $('colHair').disabled = ig.includes('hair');
}

let jsonDirty = false;
function syncJson() {
  if (jsonDirty) return;   // don't stomp on an in-progress edit
  $('jsonOut').value = JSON.stringify(config, null, 2);
}

// ── wiring ───────────────────────────────────────────────────────────────────
$('selExercise').addEventListener('change', (e) => apply({ exercise: e.target.value, cycle: null }));
$('selBuild').addEventListener('change', (e) => apply({ build: e.target.value }));
$('selHair').addEventListener('change', (e) => apply({ hair: e.target.value }));
$('selAccessory').addEventListener('change', (e) => apply({ accessory: e.target.value }));

// Changing tier resets outfit + accent to that tier's identity pair — the
// useful behaviour, since tier is what carries brand colour.
$('selTier').addEventListener('change', (e) => {
  const t = e.target.value;
  apply({ tier: t, outfitColor: TIER_COLORS[t], accentColor: TIER_ACCENTS[t] });
});

// `input` (not `change`) so dragging a picker updates live — cheap, because
// colour-only patches hit setColors() and never rebuild geometry.
$('colSkin').addEventListener('input', (e) => apply({ skinTone: e.target.value }));
$('colOutfit').addEventListener('input', (e) => apply({ outfitColor: e.target.value }));
$('colAccent').addEventListener('input', (e) => apply({ accentColor: e.target.value }));
$('colHair').addEventListener('input', (e) => apply({ hairColor: e.target.value }));

$('rngHeight').addEventListener('input', (e) => {
  const h = Number(e.target.value);
  $('valHeight').textContent = `${h.toFixed(2)}×`;
  apply({ height: h }, { syncControls: false });
});

$('rngSpeed').addEventListener('input', (e) => {
  const s = Number(e.target.value);
  $('valSpeed').textContent = `${s.toFixed(2)}×`;
  viewer.setSpeed(s);
});

// Scrubbing the rep is how you actually inspect a pose — freeze, then walk the
// phase to find the frame where an elbow bends the wrong way.
$('rngPhase').addEventListener('input', (e) => {
  const p = Number(e.target.value);
  $('valPhase').textContent = p.toFixed(2);
  $('chkPlay').checked = false;
  viewer.freeze();
  viewer.poseAll(p);
});

$('chkPlay').addEventListener('change', (e) => {
  if (e.target.checked) { viewer.resume(); $('valPhase').textContent = 'live'; }
  else viewer.freeze();
});

$('btnRandom').addEventListener('click', () => {
  jsonDirty = false;
  apply(randomAvatarConfig({ style: config.style }));
});

$('btnReset').addEventListener('click', () => {
  jsonDirty = false;
  config = { ...START, style: config.style };
  apply({});
  viewer.avatars[0]?.reset();
});

$('jsonOut').addEventListener('input', () => { jsonDirty = true; });

$('btnApply').addEventListener('click', () => {
  try {
    const parsed = JSON.parse($('jsonOut').value);
    jsonDirty = false;
    apply(parsed);
    note('applied');
  } catch {
    note('invalid JSON');
  }
});

$('btnCopy').addEventListener('click', async () => {
  const text = JSON.stringify(config, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    note('copied');
  } catch {
    $('jsonOut').select();
    note('select + copy');
  }
});

let noteTimer = 0;
function note(msg) {
  $('copyNote').textContent = msg;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { $('copyNote').textContent = ''; }, 1800);
}

// ── HUD ──────────────────────────────────────────────────────────────────────
// renderMs is an EMA inside AvatarScene. The gallery figure sums every card, so
// it's the honest cost of the whole comparison view.
setInterval(() => {
  const av = viewer.avatars[0];
  if (av) $('hudReps').textContent = `${av.reps} reps`;
  $('hudPerf').textContent = `${viewer.renderMs.toFixed(2)} ms/frame`;
  const total = galCards.reduce((s, g) => s + (g.scene.dead ? 0 : g.scene.renderMs), 0);
  $('galPerf').textContent = `${total.toFixed(2)} ms/frame · ${galCards.length} styles`;
}, 250);

// ── presets ──────────────────────────────────────────────────────────────────
// Six hand-authored characters. These double as the reference set: if a rig
// change makes any of these look wrong, it's a regression.
const PRESETS = [
  { name: 'Dave', meta: 'couch · heavy · cap',
    cfg: { tier: 'couch', build: 'heavy', height: 0.94, hair: 'cap',
           accessory: 'belt', skinTone: '#f7ddc3', exercise: 'squat' } },
  { name: 'Ben', meta: 'athlete · slim · headband',
    cfg: { tier: 'athlete', build: 'slim', height: 1.18, hair: 'short',
           accessory: 'headband', skinTone: '#8f5a30', hairColor: '#1a1c20',
           exercise: 'pushup' } },
  { name: 'Alexei', meta: 'casual · average · bun',
    cfg: { tier: 'casual', build: 'average', height: 1.02, hair: 'bun',
           accessory: 'wristbands', skinTone: '#e9c49b', hairColor: '#4a3524',
           exercise: 'curl' } },
  { name: 'Nico', meta: 'fit · average · short',
    cfg: { tier: 'fit', build: 'average', height: 1.10, hair: 'short',
           accessory: 'none', skinTone: '#d9a273', hairColor: '#7a4a22',
           exercise: 'jumpingjack' } },
  { name: 'Priya', meta: 'fit · slim · bun',
    cfg: { tier: 'fit', build: 'slim', height: 0.96, hair: 'bun',
           accessory: 'headband', skinTone: '#b97e4f', hairColor: '#2b2118',
           accentColor: '#8b5cf6', exercise: 'curl' } },
  { name: 'Seed demo', meta: 'avatarConfigFromSeed("rwf")',
    cfg: avatarConfigFromSeed('rwf') },
];

const presetScenes = [];
const grid = $('presetGrid');

for (const p of PRESETS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'preset';
  btn.innerHTML =
    '<div class="preset-stage"></div>'
    + `<span class="preset-name">${p.name}</span>`
    + `<span class="preset-meta">${p.meta}</span>`;
  grid.appendChild(btn);

  const cfg = normalizeAvatarConfig({ ...p.cfg, style: START.style });
  const scene = new AvatarScene({
    mount: btn.querySelector('.preset-stage'),
    avatars: [cfg],
    fov: 32, ground: true, frameAll: true, frameMargin: 1.20,
  });
  ctxGuardScene(scene);
  if (!scene.dead) { scene.start(); presetScenes.push(scene); }

  btn.addEventListener('click', () => {
    jsonDirty = false;
    apply({ ...p.cfg, style: config.style });
    $('stage').scrollIntoView({ block: 'center', behavior: REDUCED ? 'instant' : 'smooth' });
  });
  p._scene = scene;
  p._cfg = cfg;
}

/** Presets follow the selected style, so the reference set is always on-style. */
function refreshPresets() {
  for (const p of PRESETS) {
    if (!p._scene || p._scene.dead) continue;
    if (p._cfg.style === config.style) continue;
    p._cfg = normalizeAvatarConfig({ ...p._cfg, style: config.style });
    p._scene.setAvatarConfig(0, p._cfg);
  }
}

// ── boot ─────────────────────────────────────────────────────────────────────
syncUI();
syncJson();
syncStyleInfo();
markActiveCard();
viewer.start();

// Test/automation hook: lets the CDP suite drive the page without synthesising
// a DOM event for every control.
window.__rwfStudio = {
  get config() { return config; },
  apply, viewer, presetScenes, presets: PRESETS,
  gallery: galCards, galState,
  styles: STYLE_IDS,
  /** Freeze everything at one phase — used by the screenshot harness. */
  freezeAll(p = MID_REP) {
    viewer.freeze(); viewer.poseAll(p);
    for (const g of galCards) { if (!g.scene.dead) { g.scene.freeze(); g.scene.poseAll(p); } }
    $('galPlay').checked = false; $('chkPlay').checked = false;
  },
  setGallery(patch = {}) {
    Object.assign(galState, patch);
    $('galExercise').value = galState.exercise;
    $('galBuild').value = galState.build;
    $('galHeight').value = String(galState.height);
    $('galHeightVal').textContent = `${galState.height.toFixed(2)}×`;
    syncGallery();
  },
  ratios() {
    return galCards.map((g) => ({ style: g.style.id, ...styleSummary(g.style.id, galState.build, galState.height) }));
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MODEL CHARACTERS — real rigged GLBs (the game orcs + palette-treated
// Soldier), posed by the same exercise selector that drives the procedural
// gallery. Orc colourways come from the palette-remap system.
// ─────────────────────────────────────────────────────────────────────────────
const modelGrid = $('modelGrid');
if (modelGrid) {
  const { MODELS, loadModel, ModelAvatar, applyFlatTint, GENO_TINTS, BVH_FILES, loadBVH, BVHPlayer, GENO_CLIPS, loadGenoClip } = await import('/site/model-avatars.js');
  const { attachWardrobe, attachHead, clearWardrobe, WARDROBE_SLOTS, SLOT_LABELS } = await import('/site/models/geno-wardrobe.js');
  const { applyColorway, applySoldierPalette, COLORWAYS } = await import('/site/model-recolor.js');

  const modelCards = [];

  for (const M of MODELS) {
    const card = document.createElement('article');
    card.className = 'style-card style-card--model';
    const way = M.colorway ? COLORWAYS[M.colorway] : null;
    card.innerHTML = `
      <div class="style-stage"></div>
      <div class="style-meta">
        <h3>${M.name}</h3>
        <p class="style-blurb">${M.rig} rig · ${M.native.length ? 'native anims: ' + M.native.join(', ') : 'no anims — posed live'}${M.bvh ? ' · mocap: ' + M.bvh.slice(0, 4).map((n) => GENO_CLIPS[n]?.label ?? n).join(', ') + (M.bvh.length > 4 ? ` +${M.bvh.length - 4} more` : '') : ''}${way ? ' · palette remap' : ''}${M.palette ? ' · flat-colour treatment' : ''}${M.tint ? ' · flat tint' : ''}${M.wardrobe ? ' · wardrobe: ' + (M.wardrobe === 'full' ? 'full outfit' : M.wardrobe.join(', ')) : ''}${M.head ? ' · ' + M.head.replace('-', ' ') + ' head' : ''}</p>
        <div class="model-btns">
          ${M.native.map((n) => `<button class="rwf-btn btn--xs" data-native="${n}">${n}</button>`).join('')}
          ${(M.bvh ?? []).map((n) => `<button class="rwf-btn btn--xs" data-bvh="${n}" title="${GENO_CLIPS[n]?.group === 'captures' ? 'legacy AI4Animation capture' : 'real mocap retarget'}">${GENO_CLIPS[n]?.label ?? n}</button>`).join('')}
          ${M.wardrobeToggle ? WARDROBE_SLOTS.map((s) => `<button class="rwf-btn btn--xs is-on" data-slot="${s}" title="toggle ${s}">${SLOT_LABELS[s]}</button>`).join('') : ''}
          ${M.wardrobe ? ['squat', 'pushup', 'jumpingjack', 'curl'].map((n) => `<button class="rwf-btn btn--xs" data-ex="${n}" title="pose ${n} — stress-test the clothes">${n === 'pushup' ? 'push-up' : n === 'jumpingjack' ? 'jack' : n}</button>`).join('') : ''}
          <button class="rwf-btn btn--xs" data-native="">exercise</button>
        </div>
      </div>`;
    modelGrid.appendChild(card);
    const stage = card.querySelector('.style-stage');

    // per-card three.js scene — LAZY WebGL context (browsers cap ~16 live
    // contexts; 12+ eager cards evict the oldest and blank them). The renderer
    // is created when the card scrolls into view and released 3s after it
    // leaves, so live contexts ≈ visible cards.
    const W = 240, H = 300;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, W / H, 0.01, 60);
    const key = new THREE.DirectionalLight(0xffffff, M.dark ? 3.6 : 2.4); key.position.set(1.5, 3, 2); scene.add(key);
    const fill = new THREE.HemisphereLight(0x8fb6ff, 0x1a1d23, M.dark ? 1.7 : 1.1); scene.add(fill);
    const rim = new THREE.PointLight(0xc6f32e, 4, 8); rim.position.set(-2, 1.4, -2); scene.add(rim);
    if (M.dark) { // dark-armoured models (marauder) need a lift to read on the dark stage
      const warm = new THREE.PointLight(0xffd9a0, 2.2, 8); warm.position.set(1.8, 0.8, -1.5); scene.add(warm);
    }
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.95 })
    );
    scene.add(ground);

    const entry = { M, card, renderer: null, scene, cam, avatar: null, mixer: null, action: null, bvh: null, phase: Math.random(), ok: false };
    modelCards.push(entry);

    let releaseTimer = 0;
    let cardVisible = false; // first-intersection gate for the auto-BVH fetch
    const ensureRenderer = () => {
      if (entry.renderer) return;
      ctxMakeRoom(); // page-wide context budget — never push the browser over its cap
      try {
        const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        r.setPixelRatio(Math.min(devicePixelRatio, 2));
        r.setSize(W, H);
        r.outputColorSpace = THREE.SRGBColorSpace;
        stage.appendChild(r.domElement);
        entry.renderer = r;
      } catch (e) {
        card.querySelector('.style-blurb').textContent = 'WebGL unavailable';
      }
    };
    const releaseRenderer = () => {
      if (!entry.renderer) return;
      entry.renderer.dispose();
      // forceContextLoss warns where the extension is missing (headless
      // chromium); the detached canvas frees the context on GC anyway.
      if (entry.renderer.getContext().getExtension('WEBGL_lose_context')) entry.renderer.forceContextLoss?.();
      entry.renderer.domElement.remove();
      entry.renderer = null;
    };
    ctxRegister({
      el: card,
      gl: () => entry.renderer?.getContext?.() ?? null,
      release: releaseRenderer,
      ensure: ensureRenderer,
    });
    new IntersectionObserver((es) => {
      const vis = es[0].isIntersecting;
      clearTimeout(releaseTimer);
      if (vis) { ensureRenderer(); cardVisible = true; entry.autoBvh?.(); }
      else releaseTimer = setTimeout(releaseRenderer, 3000);
    }, { threshold: 0 }).observe(card);

    loadModel(M.file).then(async (gltfScene) => {
      // colourway / palette / flat-tint treatment BEFORE the avatar is posed & framed
      if (M.colorway) applyColorway(gltfScene, M.colorway);
      if (M.palette === 'soldier') applySoldierPalette(gltfScene);
      if (M.tint) applyFlatTint(gltfScene, GENO_TINTS[M.tint] ?? M.tint);

      if (M.creature) {
        // ── anyCreature compiled GLB: creature skeleton, native anims only.
        // No exercise retarget — centre on the ground, normalise scale, frame
        // by bounding sphere, auto-play the first native animation.
        const box0 = new THREE.Box3().setFromObject(gltfScene);
        const c0 = box0.getCenter(new THREE.Vector3());
        gltfScene.position.sub(new THREE.Vector3(c0.x, box0.min.y, c0.z));
        const s0 = 1.5 / Math.max(0.01, box0.max.y - box0.min.y);
        gltfScene.scale.setScalar(s0);
        scene.add(gltfScene);
        const box = new THREE.Box3().setFromObject(gltfScene);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const radius = Math.max(sphere.radius, 0.55);
        const vFov = THREE.MathUtils.degToRad(cam.fov);
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (W / H));
        const dist = (radius * 1.12) / Math.sin(Math.min(vFov, hFov) / 2);
        cam.position.set(sphere.center.x + dist * 0.18, sphere.center.y + radius * 0.22, dist);
        cam.lookAt(sphere.center.x, sphere.center.y, sphere.center.z);
        entry.root3d = gltfScene;
        entry.ok = true;
        // native animation buttons — clips come from a fresh load (cache holds
        // the scene only), the mixer binds to THIS card's scene instance
        card.querySelectorAll('[data-native]').forEach((btn) => {
          btn.addEventListener('click', () => {
            if (entry.mixer) { entry.mixer.stopAllAction(); entry.mixer = null; }
            const name = btn.dataset.native;
            if (!name) return;
            import('/site/lib/GLTFLoader.js').then(({ GLTFLoader }) =>
              new GLTFLoader().loadAsync(M.file)
            ).then((g) => {
              const clip = THREE.AnimationClip.findByName(g.animations, name);
              if (clip) {
                entry.mixer = new THREE.AnimationMixer(entry.root3d);
                entry.mixer.clipAction(clip).play();
              }
            }).catch(() => {});
          });
        });
        // auto-play the first native anim (idle) once visible
        import('/site/lib/GLTFLoader.js').then(({ GLTFLoader }) =>
          new GLTFLoader().loadAsync(M.file)
        ).then((g) => {
          if (g.animations && g.animations.length && !entry.mixer) {
            entry.mixer = new THREE.AnimationMixer(entry.root3d);
            entry.mixer.clipAction(g.animations[0]).play();
          }
        }).catch(() => {});
        return;
      }

      const av = new ModelAvatar(gltfScene, M.rig);
      // wardrobe / species heads: bone-parented attachments, measured + oriented
      // from the bind pose BEFORE the first pose() call, so the framing box
      // below includes them (a frog skull must not be cropped by the camera).
      // clearWardrobe once up front — attachHead must not strip a fresh wardrobe.
      if (M.wardrobe || M.head) {
        clearWardrobe(av);
        // hems are SKINNED by default (skin-follow). The verlet strips are
        // opt-in via attachWardrobe({ fabric: true }) — they exploded at
        // stride extremes (ring spread 29 cm), which read as fabric orbiting
        // the figure; the skinned hem is stiff but always attached.
        if (M.wardrobe) entry.wardrobe = attachWardrobe(av, { slots: M.wardrobe });
        if (M.head) entry.speciesHead = attachHead(av, M.head);
      }
      // normalise scale to ~1.5 units tall so all cards share a camera
      const s = 1.5 / av.H;
      av.root.scale.setScalar(s);
      scene.add(av.root);
      av.pose(galState.exercise, 0.5);
      // frame by bounding sphere — the push-up pose is wide, not tall
      const box = new THREE.Box3().setFromObject(av.root);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(sphere.radius, 0.55);
      const vFov = THREE.MathUtils.degToRad(cam.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (W / H));
      const dist = (radius * 1.05) / Math.sin(Math.min(vFov, hFov) / 2);
      cam.position.set(0, sphere.center.y + radius * 0.18, dist);
      cam.lookAt(sphere.center.x, sphere.center.y, sphere.center.z);
      entry.avatar = av;
      entry.ok = true;
      // wardrobe slot toggles — flip each piece's visibility (bone parenting
      // is untouched; a hidden group simply stops rendering)
      if (entry.wardrobe) {
        card.querySelectorAll('[data-slot]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const slot = btn.dataset.slot;
            const on = !entry.wardrobe.isVisible(slot);
            entry.wardrobe.toggle(slot, on);
            btn.classList.toggle('is-on', on);
          });
        });
      }
      // per-card exercise switcher (wardrobe cards): stop BVH/native playback
      // and pose THIS card at the chosen exercise — the stress poses the
      // clothes must survive (deep squat, prone push-up, arms-up jack, curl).
      // The card keeps its own exercise until another is picked or the
      // generic "exercise" button returns it to the global selector.
      card.querySelectorAll('[data-ex]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (entry.mixer) { entry.mixer.stopAllAction(); entry.mixer = null; entry.action = null; }
          if (entry.bvh) { entry.bvh.stop(); entry.bvh = null; }
          entry.exercise = btn.dataset.ex;
          entry.phase = 0.5;
          av.pose(entry.exercise, 0.5);
          card.querySelectorAll('[data-ex]').forEach((b) => b.classList.toggle('is-on', b === btn));
          card.querySelector('[data-native=""]')?.classList.remove('is-on');
        });
      });
      const clearCardExercise = () => {
        entry.exercise = null;
        card.querySelectorAll('[data-ex]').forEach((b) => b.classList.remove('is-on'));
      };
      // mocap buttons (Geno): world-space retarget of real animation onto
      // this card's skeleton — mixamo GLB clips (Soldier/Xbot), loops exported
      // from Geno's own AI4Animation demo motions, and the legacy BVH
      // captures. Lazy-loaded on demand — the heaviest capture is 33 MB, so
      // clips are fetched only when the card is first scrolled into view
      // (auto) or a clip button is clicked.
      const startBVH = async (name) => {
        entry.bvhRequested = true;
        if (entry.mixer) { entry.mixer.stopAllAction(); entry.mixer = null; entry.action = null; }
        if (entry.bvh) { entry.bvh.stop(); entry.bvh = null; }
        clearCardExercise();
        if (!name) { av.pose(galState.exercise, 0.5); return; }
        try {
          const res = await loadGenoClip(name);
          if (entry.bvh) entry.bvh.stop();
          entry.bvh = new BVHPlayer(av, res);
        } catch (e) {
          card.querySelector('.style-blurb').textContent = 'mocap failed: ' + e.message;
        }
      };
      card.querySelectorAll('[data-bvh]').forEach((btn) => {
        btn.addEventListener('click', () => startBVH(btn.dataset.bvh));
      });
      if (M.bvhAuto) {
        if (cardVisible) startBVH(M.bvhAuto); // model loaded after first intersection
        else entry.autoBvh = () => { entry.autoBvh = null; if (!entry.bvhRequested) startBVH(M.bvhAuto); };
      }
      // native animation buttons
      card.querySelectorAll('[data-native]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const name = btn.dataset.native;
          if (entry.mixer) { entry.mixer.stopAllAction(); entry.mixer = null; entry.action = null; }
          if (entry.bvh) { entry.bvh.stop(); entry.bvh = null; }
          if (!name) { clearCardExercise(); av.pose(galState.exercise, 0.5); return; } // back to exercise posing
          clearCardExercise();
          // reload the gltf for its AnimationClips (cache holds the scene only)
          import('/site/lib/GLTFLoader.js').then(({ GLTFLoader }) =>
            new GLTFLoader().loadAsync(M.file)
          ).then((g) => {
            entry.mixer = new THREE.AnimationMixer(entry.avatar.prone.children[0]);
            const clip = THREE.AnimationClip.findByName(g.animations, name);
            if (clip) { entry.action = entry.mixer.clipAction(clip); entry.action.play(); }
          }).catch(() => {});
        });
      });
    }).catch((e) => {
      card.querySelector('.style-blurb').textContent = 'load failed: ' + e.message;
    });
  }

  // shared animation loop for model cards
  let last = performance.now();
  (function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const e of modelCards) {
      if (!e.ok || !e.renderer) continue;   // renderer is lazy — may be released
      const t0 = performance.now();         // per-card frame cost (pose + fabric + render)
      if (e.mixer) {
        e.mixer.update(dt);
      } else if (e.bvh) {
        e.bvh.update(dt);                   // BVH mocap playback (Geno)
      } else if (e.avatar && galState.playing) {
        const ex = e.exercise ?? galState.exercise; // per-card switcher wins
        e.phase = (e.phase + dt / EXERCISES[ex].cycle) % 1;
        e.avatar.pose(ex, e.phase);
      }
      // fabric secondary motion: step the hem sims AFTER the pose/mocap update
      // (they pin to the freshly-skinned garment edges), BEFORE the render.
      // Frozen when reduced-motion is set or the card has nothing animating
      // (gallery paused + no BVH/native playback) — hems drape statically.
      if (e.wardrobe) {
        const animating = !!(e.mixer || e.bvh) || galState.playing;
        e.wardrobe.updateFabric(dt, REDUCED || !animating);
      }
      e.renderer.render(e.scene, e.cam);
      e.renderMs = (e.renderMs ?? 0) * 0.9 + (performance.now() - t0) * 0.1; // EMA, for the perf harness
    }
  })(last);

  // re-pose on exercise/build change (build doesn't apply to GLBs); a card
  // with its own exercise picked keeps posing that one
  const galExerciseEl = $('galExercise');
  if (galExerciseEl) galExerciseEl.addEventListener('change', () => {
    for (const e of modelCards) if (e.avatar && !e.mixer && !e.bvh) e.avatar.pose(e.exercise ?? galState.exercise, 0.5);
  });

  // Test/automation hook (same pattern as __rwfStudio): lets the CDP verify
  // suite read live joint positions, BVH player state and per-card entries.
  window.__rwfModels = modelCards;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREATURES — the dragon, take two, on the dedicated creature rig.
//
// Self-contained block (append-only by contract): builds its own game-context
// scenes — textured-ish tile floor, warm sun + cool ambient + soft shadows,
// 52°-down / 45°-yaw / FOV-60 camera — because the post-mortem's #1 rule is
// "evaluate in a game context, never in a void". WebGL contexts are LAZY
// (created on intersection, released 3s off-screen), same as the model cards:
// browsers cap ~16 live contexts and this page already runs many.
// ─────────────────────────────────────────────────────────────────────────────
{
  const grid = $('creatureGrid');
  if (grid) import('/site/avatar-styles/dragon2.js').then(({ createDragon, DRAGON_STAGES }) => {

  const W = 240, H = 300;
  const cards = [];   // { stage, card, dragon, scene, cam, renderer, releaseTimer }
  let playing = true;
  let currentAnim = 'flap';

  // ── the game-context world (per card) ───────────────────────────────────
  // One merged vertex-coloured mesh for the whole tile patch — 121 boxes as
  // one draw call, not 700. Top faces full colour, sides darkened to ~62%,
  // exactly the game's tile recipe (investigation §1.1).
  function buildTilePatch(size = 11) {
    const box = new THREE.BoxGeometry(0.97, 0.18, 0.97).toNonIndexed();
    const bp = box.attributes.position.array;
    const bn = box.attributes.normal.array;
    const positions = [], normals = [], colors = [];
    const c = new THREE.Color();
    // albedo darkened ~×0.75 from the game's raw palette: our sun (3.6) is
    // hotter than the game's (0.9 legacy), and pixel-verification showed the
    // brighter tiles dragging membrane-vs-floor contrast under the 3:1 bar.
    // Rendered result (#294716 avg) matches the game's DARK moss world census.
    const MOSS = 0x2f5420, MOSS_D = 0x294a19, DIRT = 0x5c3c24;
    for (let x = -(size - 1) / 2; x <= (size - 1) / 2; x++) {
      for (let z = -(size - 1) / 2; z <= (size - 1) / 2; z++) {
        const dirt = (Math.abs(x * x * 3 + z * z * 7) % 11) === 0;
        const base = dirt ? DIRT : ((x + z) % 2 === 0 ? MOSS : MOSS_D);
        const jitter = 0.94 + ((x * 31 + z * 17) % 7) / 100; // ±3% tile-to-tile
        for (let v = 0; v < bp.length; v += 3) {
          positions.push(bp[v] + x, bp[v + 1] - 0.09, bp[v + 2] + z);
          normals.push(bn[v], bn[v + 1], bn[v + 2]);
          const top = bn[v + 1] > 0.5;
          const side = Math.abs(bn[v + 1]) < 0.5;
          const m = top ? jitter : side ? 0.62 : 0.4;
          c.setHex(base).multiplyScalar(m);
          colors.push(c.r, c.g, c.b);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    return mesh;
  }

  function makeGameScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x26301c);
    // light haze only at the patch edges — an earlier 0.11 density was eating
    // 26-40% of the pixel at card distance and fogged the elder's membrane
    // down to #7e3d23 (pixel-verified). 0.035 keeps the warm depth cue.
    scene.fog = new THREE.FogExp2(0x26301c, 0.035);

    scene.add(buildTilePatch());
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x1c2412 })
    );
    under.position.y = -0.181;
    under.receiveShadow = true;
    scene.add(under);

    // the game's rig: one warm sun, one cool ambient, soft shadows.
    // Sun 3.6 (light-probe-verified: 2.4 left the body at #285b14, murkier
    // than the game's #3a911b reference; 3.6 lands the body in that family).
    // Sky/ground hemisphere replaces a plain AmbientLight that measured as
    // contributing ~nothing.
    const sun = new THREE.DirectionalLight(0xfff0d0, 3.6);
    sun.position.set(4, 8, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -3.5;
    sun.shadow.camera.right = sun.shadow.camera.top = 3.5;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 25;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x9090a0, 0x3a4030, 0.9));

    // game camera: 52° down, 45° yaw, FOV 60
    const cam = new THREE.PerspectiveCamera(60, W / H, 0.05, 60);
    return { scene, cam };
  }

  function frameCamera(cam, dragon) {
    dragon.poseAt('flap', 0.5); // spread pose for honest extents
    const box = new THREE.Box3().setFromObject(dragon.root);
    const center = box.getCenter(new THREE.Vector3());
    const el = THREE.MathUtils.degToRad(52), az = THREE.MathUtils.degToRad(45);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    // Fit by PROJECTING the box corners + anatomical extremes and ITERATING:
    // NDC does not scale exactly as 1/dist for points nearer the camera than
    // the fit centre (the elder's head kept clipping ~26px off-card through
    // two closed-form attempts), so converge instead of solving once.
    const rig = dragon.rig;
    const R = rig.dims.headR;
    const crit = [
      rig.head.getWorldPosition(new THREE.Vector3()),
      rig.head.localToWorld(new THREE.Vector3(0, -R * 0.1, R * 0.55 + R * 1.35)), // snout tip
      rig.tailTip.getWorldPosition(new THREE.Vector3()),
      rig.wings.L.marks.T[0].getWorldPosition(new THREE.Vector3()),
      rig.wings.R.marks.T[0].getWorldPosition(new THREE.Vector3()),
    ];
    const corners = [];
    for (let i = 0; i < 8; i++) {
      corners.push(new THREE.Vector3(
        i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    }
    const v = new THREE.Vector3();
    const FIT = 0.9; // target max |NDC| (10% margin)
    let dist = box.getSize(v).length() / (2 * Math.tan(THREE.MathUtils.degToRad(30)) * (W / H)) + 1;
    for (let it = 0; it < 12; it++) {
      cam.position.copy(center).addScaledVector(dir, dist);
      cam.lookAt(center);
      cam.updateMatrixWorld(true);
      let m = 0;
      for (const p of [...corners, ...crit]) {
        v.copy(p).project(cam);
        m = Math.max(m, Math.abs(v.x), Math.abs(v.y));
      }
      if (m <= FIT) break;
      dist *= Math.max(1.02, Math.min(m / FIT, 1.6)); // converge, capped per step
    }
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.lookAt(center);
  }

  // ── one card per evolution stage ────────────────────────────────────────
  for (const id of ['hatchling', 'fledgling', 'elder']) {
    const st = DRAGON_STAGES[id];
    const card = document.createElement('article');
    card.className = 'style-card';
    card.dataset.stage = id;
    card.innerHTML = `
      <div class="style-stage"></div>
      <div class="style-meta">
        <h3>${st.label}</h3>
        <p class="style-blurb">${st.blurb}</p>
        <dl class="style-facts">
          <div><dt>Wings : body</dt><dd class="js-wing">—</dd></div>
          <div><dt>Neck : torso</dt><dd class="js-neck">—</dd></div>
          <div><dt>Tail : body</dt><dd class="js-tail">—</dd></div>
        </dl>
        <p class="style-ratio">membrane <b style="color:${st.membrane}">${st.membrane}</b> on ${st.body}</p>
      </div>`;
    grid.appendChild(card);
    const stage = card.querySelector('.style-stage');

    const { scene, cam } = makeGameScene();
    const dragon = createDragon({ stage: id });
    scene.add(dragon.root);
    dragon.setAnimation(currentAnim);
    frameCamera(cam, dragon);

    // measured off the LIVE rig — labels can't disagree with the render
    const m = dragon.measure();
    card.querySelector('.js-wing').textContent = `${m.wingRatio.toFixed(1)}×`;
    card.querySelector('.js-neck').textContent = `${m.neckTorso.toFixed(2)}×`;
    card.querySelector('.js-tail').textContent = `${m.tailBody.toFixed(2)}×`;

    const entry = { stage: id, card, dragon, scene, cam, renderer: null, releaseTimer: 0 };
    cards.push(entry);

    // LAZY WebGL context — create on intersection, release 3s off-screen
    const ensureRenderer = () => {
      if (entry.renderer) return;
      ctxMakeRoom(); // page-wide context budget — never push the browser over its cap
      try {
        const r = new THREE.WebGLRenderer({ antialias: true });
        r.setPixelRatio(Math.min(devicePixelRatio, 2));
        r.setSize(W, H);
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.shadowMap.enabled = true;
        r.shadowMap.type = THREE.PCFSoftShadowMap;
        stage.appendChild(r.domElement);
        entry.renderer = r;
      } catch {
        stage.innerHTML = '<p class="stage-fallback">WebGL unavailable</p>';
      }
    };
    const releaseRenderer = () => {
      if (!entry.renderer) return;
      entry.renderer.dispose();
      // forceContextLoss warns where the extension is missing (headless
      // chromium); the detached canvas frees the context on GC anyway.
      if (entry.renderer.getContext().getExtension('WEBGL_lose_context')) entry.renderer.forceContextLoss?.();
      entry.renderer.domElement.remove();
      entry.renderer = null;
    };
    ctxRegister({
      el: card,
      gl: () => entry.renderer?.getContext?.() ?? null,
      release: releaseRenderer,
      ensure: ensureRenderer,
    });
    new IntersectionObserver((es) => {
      const vis = es[0].isIntersecting;
      clearTimeout(entry.releaseTimer);
      if (vis) ensureRenderer();
      else entry.releaseTimer = setTimeout(releaseRenderer, 3000);
    }, { threshold: 0 }).observe(card);
  }

  // ── shared tick ─────────────────────────────────────────────────────────
  let last = performance.now(), ema = 0;
  (function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t0 = performance.now();
    let drew = 0;
    for (const e of cards) {
      if (!e.renderer) continue;   // lazy — may be released off-screen
      if (playing) e.dragon.update(dt);
      e.renderer.render(e.scene, e.cam);
      drew++;
    }
    if (drew) {
      ema = ema * 0.9 + (performance.now() - t0) / drew * 0.1;
      const el = $('creaturePerf');
      if (el) el.textContent = `${ema.toFixed(1)} ms/frame`;
    }
  })(last);

  // ── controls ────────────────────────────────────────────────────────────
  const setAnim = (name) => {
    currentAnim = name;
    for (const e of cards) e.dragon.setAnimation(name);
  };
  $('creatureAnim').addEventListener('change', (e) => setAnim(e.target.value));
  $('creaturePlay').addEventListener('change', (e) => { playing = e.target.checked; });
  $('creatureFreeze').addEventListener('click', () => {
    playing = false;
    $('creaturePlay').checked = false;
    // mid-downstroke for flap (wings spread & lit), mid-stride for walk
    const phase = currentAnim === 'flap' ? 0.62 : 0.5;
    for (const e of cards) e.dragon.poseAt(currentAnim, phase);
  });

  // debug/verification handle for the screenshot tooling (test/creature-shot.ts)
  window.__creatures = {
    setAnim, freeze: (ph) => { playing = false; for (const e of cards) e.dragon.poseAt(currentAnim, ph ?? 0.62); },
    get playing() { return playing; },
    set playing(v) { playing = v; $('creaturePlay').checked = v; },
    canvasCount: () => grid.querySelectorAll('canvas').length,
    cards: cards.map((e) => ({
      stage: e.stage,
      dragon: e.dragon,
      scene: e.scene,
      cam: e.cam,
      // project a world point through this card's camera → page pixels
      // (the investigation's raycast-locate technique, inverted)
      project: (x, y, z) => {
        const v = new THREE.Vector3(x, y, z).project(e.cam);
        const r = e.card.querySelector('.style-stage').getBoundingClientRect();
        return { x: r.left + scrollX + (v.x * 0.5 + 0.5) * r.width, y: r.top + scrollY + (-v.y * 0.5 + 0.5) * r.height };
      },
      rect: () => { const r = e.card.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; },
      // named landmark world positions for pixel verification
      landmarks: () => {
        e.dragon.root.updateMatrixWorld(true);
        const rig = e.dragon.rig;
        const R = rig.dims.headR;
        const hornLen = R * (0.5 + e.dragon.stage.horn * 1.1);
        const wp = (o) => { const p = o.getWorldPosition(new THREE.Vector3()); return [p.x, p.y, p.z]; };
        const hp = (x, y, z) => { const p = rig.head.localToWorld(new THREE.Vector3(x, y, z)); return [p.x, p.y, p.z]; };
        const avg = (...os) => {
          const v = new THREE.Vector3();
          os.forEach((o) => v.add(o.getWorldPosition(new THREE.Vector3())));
          v.divideScalar(os.length);
          return [v.x, v.y, v.z];
        };
        return {
          headCenter: wp(rig.head),
          snoutTip: hp(0, -R * 0.1, R * 0.55 + R * 1.35),
          jawTip: hp(0, -R * 0.38, R * 0.12 + R * 1.35 * 0.95),
          eyeL: hp(R * 0.66, R * 0.23, R * 0.79),
          eyeR: hp(-R * 0.66, R * 0.23, R * 0.79),
          hornTipL: e.dragon.hornTips?.L ? wp(e.dragon.hornTips.L) : null,
          hips: wp(rig.hips),
          chest: wp(rig.chest),
          tailTip: wp(rig.tailTip),
          wingTipL: wp(rig.wings.L.marks.T[0]),
          wingTipR: wp(rig.wings.R.marks.T[0]),
          membraneL: avg(rig.wings.L.marks.S, rig.wings.L.marks.W, rig.wings.L.marks.T[1], rig.wings.L.marks.B),
          membraneR: avg(rig.wings.R.marks.S, rig.wings.R.marks.W, rig.wings.R.marks.T[1], rig.wings.R.marks.B),
        };
      },
    })),
  };

  }).catch((err) => {
    grid.innerHTML = `<p class="gallery-note" style="color:#ff7a5c">creature module failed: ${err.message}</p>`;
    console.error('[creatures]', err);
  });
}
