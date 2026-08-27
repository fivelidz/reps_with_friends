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
// MODEL CHARACTERS — real rigged GLBs (Soldier / Xbot / orc), posed by the
// same exercise selector that drives the procedural gallery.
// ─────────────────────────────────────────────────────────────────────────────
const modelGrid = $('modelGrid');
if (modelGrid) {
  const { MODELS, loadModel, ModelAvatar } = await import('/site/model-avatars.js');

  const modelCards = [];

  for (const M of MODELS) {
    const card = document.createElement('article');
    card.className = 'style-card style-card--model';
    card.innerHTML = `
      <div class="style-stage"></div>
      <div class="style-meta">
        <h3>${M.name}</h3>
        <p class="style-blurb">${M.rig} rig · ${M.native.length ? 'native anims: ' + M.native.join(', ') : 'no anims — posed live'}</p>
        <div class="model-btns">
          ${M.native.map((n) => `<button class="rwf-btn btn--xs" data-native="${n}">${n}</button>`).join('')}
          <button class="rwf-btn btn--xs" data-native="">exercise</button>
        </div>
      </div>`;
    modelGrid.appendChild(card);
    const stage = card.querySelector('.style-stage');

    // per-card three.js scene (same pattern as the procedural gallery cards)
    const W = 240, H = 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    stage.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, W / H, 0.01, 60);
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1.5, 3, 2); scene.add(key);
    const fill = new THREE.HemisphereLight(0x8fb6ff, 0x1a1d23, 1.1); scene.add(fill);
    const rim = new THREE.PointLight(0xc6f32e, 4, 8); rim.position.set(-2, 1.4, -2); scene.add(rim);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.95 })
    );
    scene.add(ground);

    const entry = { M, card, renderer, scene, cam, avatar: null, mixer: null, action: null, phase: Math.random(), ok: false };
    modelCards.push(entry);

    loadModel(M.file).then((gltfScene) => {
      const av = new ModelAvatar(gltfScene, M.rig);
      // normalise scale to ~1.5 units tall so all three share a camera
      const s = 1.5 / av.H;
      av.root.scale.setScalar(s);
      scene.add(av.root);
      av.pose(galState.exercise, 0.5);
      const box = new THREE.Box3().setFromObject(av.root);
      const h = box.max.y - box.min.y;
      cam.position.set(0, h * 0.52, h * 1.9);
      cam.lookAt(0, h * 0.47, 0);
      entry.avatar = av;
      entry.ok = true;
      // native animation buttons
      card.querySelectorAll('[data-native]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const name = btn.dataset.native;
          if (entry.mixer) { entry.mixer.stopAllAction(); entry.mixer = null; entry.action = null; }
          if (!name) return; // back to exercise posing
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
      if (!e.ok) continue;
      if (e.mixer) {
        e.mixer.update(dt);
      } else if (e.avatar && galState.playing) {
        e.phase = (e.phase + dt / EXERCISES[galState.exercise].cycle) % 1;
        e.avatar.pose(galState.exercise, e.phase);
      }
      e.renderer.render(e.scene, e.cam);
    }
  })(last);

  // re-pose on exercise/build change (build doesn't apply to GLBs)
  const galExerciseEl = $('galExercise');
  if (galExerciseEl) galExerciseEl.addEventListener('change', () => {
    for (const e of modelCards) if (e.avatar && !e.mixer) e.avatar.pose(galState.exercise, 0.5);
  });
}
