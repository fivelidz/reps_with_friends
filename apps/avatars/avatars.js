// /avatars — internal avatar studio. Every customisation knob wired to a live
// figure, plus a preset row and a copyable JSON descriptor.
//
// Local tool only: not linked from the public site, not part of the deploy.
import {
  AvatarScene, EXERCISES, EXERCISE_NAMES, TIER_COLORS, TIER_ACCENTS,
  SKIN_TONES, OUTFIT_COLORS, HAIR_STYLES, ACCESSORIES, BUILDS,
  normalizeAvatarConfig, randomAvatarConfig, avatarConfigFromSeed,
} from '/site/avatars.js';

const $ = (id) => document.getElementById(id);
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ── viewer ───────────────────────────────────────────────────────────────────
// One avatar, big, orbitable. zMin/zMax and camY are tuned for a single figure
// filling the frame rather than the site's four-across row.
const START = normalizeAvatarConfig({
  tier: 'fit',
  skinTone: '#e9c49b',
  build: 'average',
  height: 1,
  hair: 'short',
  accessory: 'headband',
  exercise: 'squat',
});

let config = { ...START };

const viewer = new AvatarScene({
  mount: $('stage'),
  avatars: [config],
  spacing: 0.62,
  fov: 30,
  orbit: true,
  camY: 0.30,
  targetY: 0.20,
  zMin: 0.78,
  zMax: 0.78,   // fixed framing; OrbitControls takes over from here
  ground: true,
});

if (viewer.dead) {
  $('stage').innerHTML = '<p style="padding:24px;color:var(--muted)">WebGL unavailable — the studio needs it.</p>';
}

// ── control population ───────────────────────────────────────────────────────
function fillSelect(el, values, labels) {
  el.innerHTML = values
    .map((v, i) => `<option value="${v}">${(labels && labels[i]) || cap(v)}</option>`)
    .join('');
}

fillSelect($('selExercise'), EXERCISE_NAMES, EXERCISE_NAMES.map((n) => EXERCISES[n].label));
fillSelect($('selBuild'), BUILDS);
fillSelect($('selHair'), HAIR_STYLES);
fillSelect($('selAccessory'), ACCESSORIES);
fillSelect($('selTier'), Object.keys(TIER_COLORS));

// quick-pick swatch rows under the skin/outfit colour inputs
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

// ── the single source of truth ───────────────────────────────────────────────
// apply() is the ONLY way config changes: it normalises, pushes to the scene,
// then syncs every control + the JSON box back from the result. That means the
// UI can never drift from what's actually rendered.
function apply(patch, { syncControls = true } = {}) {
  config = normalizeAvatarConfig({ ...config, ...patch });
  viewer.setAvatarConfig(0, config);
  if (syncControls) syncUI();
  syncJson();
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

let jsonDirty = false;
function syncJson() {
  if (jsonDirty) return;   // don't stomp on the founder mid-edit
  $('jsonOut').value = JSON.stringify(config, null, 2);
}

// ── wiring ───────────────────────────────────────────────────────────────────
$('selExercise').addEventListener('change', (e) => apply({ exercise: e.target.value, cycle: null }));
$('selBuild').addEventListener('change', (e) => apply({ build: e.target.value }));
$('selHair').addEventListener('change', (e) => apply({ hair: e.target.value }));
$('selAccessory').addEventListener('change', (e) => apply({ accessory: e.target.value }));

// Changing tier resets outfit + accent to that tier's identity pair — that's
// the useful behaviour, since tier is the thing that carries brand colour.
$('selTier').addEventListener('change', (e) => {
  const t = e.target.value;
  apply({
    tier: t,
    outfitColor: '#' + TIER_COLORS[t].toString(16).padStart(6, '0'),
    accentColor: TIER_ACCENTS[t],
  });
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

$('chkPlay').addEventListener('change', (e) => {
  if (e.target.checked) viewer.resume();
  else viewer.freeze();
});

$('btnRandom').addEventListener('click', () => {
  jsonDirty = false;
  apply(randomAvatarConfig());
});

$('btnReset').addEventListener('click', () => {
  jsonDirty = false;
  config = { ...START };
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
  } catch (err) {
    note('invalid JSON');
  }
});

$('btnCopy').addEventListener('click', async () => {
  const text = JSON.stringify(config, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    note('copied');
  } catch {
    // headless / insecure-context fallback — select the box so ⌘C still works
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

// ── HUD: rep counter + render cost ───────────────────────────────────────────
// renderMs is an EMA maintained inside AvatarScene; surfacing it here is how we
// keep an eye on the frame budget while adding geometry.
setInterval(() => {
  const av = viewer.avatars[0];
  if (av) $('hudReps').textContent = `${av.reps} reps`;
  $('hudPerf').textContent = `${viewer.renderMs.toFixed(2)} ms/frame`;
}, 250);

// ── presets ──────────────────────────────────────────────────────────────────
// Six hand-authored characters. These double as the reference set: if a change
// to the rig makes any of these look wrong, it's a regression.
const PRESETS = [
  {
    name: 'Dave', meta: 'couch · heavy · cap',
    cfg: { tier: 'couch', build: 'heavy', height: 0.94, hair: 'cap',
           accessory: 'belt', skinTone: '#f7ddc3', exercise: 'squat' },
  },
  {
    name: 'Ben', meta: 'athlete · slim · headband',
    cfg: { tier: 'athlete', build: 'slim', height: 1.18, hair: 'short',
           accessory: 'headband', skinTone: '#8f5a30', hairColor: '#1a1c20',
           exercise: 'pushup' },
  },
  {
    name: 'Alexei', meta: 'casual · average · bun',
    cfg: { tier: 'casual', build: 'average', height: 1.02, hair: 'bun',
           accessory: 'wristbands', skinTone: '#e9c49b', hairColor: '#4a3524',
           exercise: 'curl' },
  },
  {
    name: 'Nico', meta: 'fit · average · short',
    cfg: { tier: 'fit', build: 'average', height: 1.10, hair: 'short',
           accessory: 'none', skinTone: '#d9a273', hairColor: '#7a4a22',
           exercise: 'jumpingjack' },
  },
  {
    name: 'Priya', meta: 'fit · slim · bun',
    cfg: { tier: 'fit', build: 'slim', height: 0.96, hair: 'bun',
           accessory: 'headband', skinTone: '#b97e4f', hairColor: '#2b2118',
           accentColor: '#8b5cf6', exercise: 'curl' },
  },
  {
    name: 'Seed demo', meta: 'avatarConfigFromSeed("rwf")',
    cfg: avatarConfigFromSeed('rwf'),
  },
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

  const cfg = normalizeAvatarConfig(p.cfg);
  const scene = new AvatarScene({
    mount: btn.querySelector('.preset-stage'),
    avatars: [cfg],
    fov: 32,
    camY: 0.28,
    targetY: 0.19,
    zMin: 0.84,
    zMax: 0.84,
    ground: true,
  });
  if (!scene.dead) {
    scene.start();
    presetScenes.push(scene);
  }

  // clicking a preset loads it into the big viewer
  btn.addEventListener('click', () => {
    jsonDirty = false;
    apply(cfg);
    $('stage').scrollIntoView({ block: 'center', behavior: REDUCED ? 'instant' : 'smooth' });
  });
}

// ── boot ─────────────────────────────────────────────────────────────────────
syncUI();
syncJson();
viewer.start();

// Test/automation hook: lets the CDP suite read state and drive the studio
// without synthesising DOM events for every control.
window.__rwfStudio = {
  get config() { return config; },
  apply,
  viewer,
  presetScenes,
  presets: PRESETS,
};
