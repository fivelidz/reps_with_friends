// apps/booth/booth.js — PHOTO BOOTH client (selfie → stylised RWF bust).
//
// Parts:
//   1. CAPTURE  — getUserMedia front camera with a framing guide, or upload.
//                 Everything stays local: the capture is downscaled on-canvas
//                 before it is POSTed, and only to THIS origin's /api/booth.
//   2. GENERATE — POST /api/booth → job id → poll /api/booth/status. All
//                 model calls happen SERVER-SIDE (keys never reach this page —
//                 same rule as /api/ai).
//   3. REVEAL   — the generated module imports + renders in a lazy turntable
//                 (the /avatars card pattern: create on show, dispose on
//                 leave/retry), ADD TO MY AVATARS registers it in a
//                 localStorage set that the /avatars photo strip reads.
//
// Privacy line on the page is TRUE: the pipeline extracts palette hexes +
// coarse silhouette classes (vision intake) and writes a stylised procedural
// bust — no face geometry, no likeness, photo deleted after the run.

const $ = (id) => document.getElementById(id);
const state = {
  photo: null,          // data URL (downscaled client-side to ≤768px)
  stream: null,         // live camera stream (stopped on capture/leave)
  job: null,            // current generation job id
  phase: 'idle',
  result: null,
  error: null,
};
window.__boothState = state;   // test hook (same pattern as __rwfPhotoAvatars)

// ── step wiring ─────────────────────────────────────────────────────────────
const captureCard = $('captureCard'), genCard = $('genCard'), revealCard = $('revealCard');
function showStep(which) {
  captureCard.hidden = which !== 'capture';
  genCard.hidden = which !== 'gen';
  revealCard.hidden = which !== 'reveal';
  if (which !== 'capture') stopCamera();
}

// ── 1 · capture ─────────────────────────────────────────────────────────────
const camFrame = $('camFrame'), cam = $('cam'), camDenied = $('camDenied');
const preview = $('preview'), previewImg = $('previewImg');

function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  cam.srcObject = null;
  camFrame.hidden = true;
}

$('camBtn').addEventListener('click', async () => {
  camDenied.hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    camDenied.hidden = false; return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
    state.stream = stream;
    cam.srcObject = stream;
    preview.hidden = true;
    camFrame.hidden = false;
    $('captureActions').hidden = true;
  } catch (e) {
    // friendly denial path — upload is a first-class citizen, not a consolation
    camDenied.hidden = false;
    camFrame.hidden = true;
    $('captureActions').hidden = false;
  }
});

$('shutterBtn').addEventListener('click', () => {
  if (!cam.videoWidth) return;
  // capture UNmirrored (the mirror is presentation-only); downscale ≤768
  const c = document.createElement('canvas');
  const s = Math.min(1, 768 / Math.max(cam.videoWidth, cam.videoHeight));
  c.width = Math.round(cam.videoWidth * s);
  c.height = Math.round(cam.videoHeight * s);
  const ctx = c.getContext('2d');
  ctx.translate(c.width, 0); ctx.scale(-1, 1);   // un-mirror
  ctx.drawImage(cam, 0, 0, c.width, c.height);
  setPhoto(c.toDataURL('image/jpeg', 0.92));
});

$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url;
    });
    const c = document.createElement('canvas');
    const s = Math.min(1, 768 / Math.max(img.width, img.height));
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    setPhoto(c.toDataURL('image/jpeg', 0.92));
  } catch {
    $('genErrorText').textContent = 'Could not read that image — try a PNG or JPEG.';
    camDenied.hidden = false; // reuse the friendly banner slot
  } finally {
    URL.revokeObjectURL(url);
    e.target.value = '';
  }
});

function setPhoto(dataUrl) {
  state.photo = dataUrl;
  stopCamera();
  previewImg.src = dataUrl;
  preview.hidden = false;
  camDenied.hidden = true;
  $('captureActions').hidden = true;
}
$('retakeBtn').addEventListener('click', () => {
  state.photo = null;
  preview.hidden = true;
  $('captureActions').hidden = false;
});

// ── 2 · generation ──────────────────────────────────────────────────────────
const STAGE_OF = {
  prep: 'intake', intake: 'intake', 'intake-retry': 'intake',
  codegen: 'codegen', 'codegen-retry': 'codegen',
  gate: 'gate', fix: 'gate', quick: 'codegen', save: 'gate', starting: 'intake',
};
function paintStages(phase) {
  const order = ['intake', 'codegen', 'gate'];
  const active = STAGE_OF[phase] ?? 'intake';
  const idx = order.indexOf(active);
  document.querySelectorAll('#stageList li').forEach((li, i) => {
    li.classList.toggle('done', i < idx);
    li.classList.toggle('active', i === idx);
  });
}

async function generate(mode = 'full') {
  if (!state.photo) return;
  showStep('gen');
  state.error = null; state.result = null; state.phase = 'starting';
  $('genError').hidden = true;
  $('genTitle').textContent = mode === 'quick'
    ? 'Sampling your palette…'
    : 'Sculpting your bust…';
  paintStages('starting');
  try {
    const r = await fetch('/api/booth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: state.photo, mode }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `booth busy (${r.status})`);
    state.job = j.job;
    poll();
  } catch (e) {
    fail(`could not start generation: ${e.message}`);
  }
}

async function poll() {
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    let j;
    try {
      const r = await fetch(`/api/booth/status?job=${encodeURIComponent(state.job)}`);
      j = await r.json();
    } catch {
      continue; // transient network — keep polling
    }
    state.phase = j.phase ?? 'working';
    if (j.phase === 'done' && j.result) { state.result = j.result; reveal(j.result); return; }
    if (j.phase === 'error') { fail(j.error || 'generation failed'); return; }
    if (j.phase === 'timeout') { fail('generation timed out (10 min cap)'); return; }
    paintStages(j.phase);
  }
}

function fail(msg) {
  state.phase = 'error';
  state.error = msg;
  $('genTitle').textContent = 'That one didn\'t make it out of the darkroom.';
  $('genErrorText').textContent = msg;
  $('genError').hidden = false;
}

$('useBtn').addEventListener('click', () => generate('full'));
$('retryBtn').addEventListener('click', () => { $('genError').hidden = true; generate('full'); });
$('quickBtn').addEventListener('click', () => generate('quick'));

// ── 3 · reveal ──────────────────────────────────────────────────────────────
let revealCtx = null;   // { renderer, scene, cam, turn, model, raf, model }

async function reveal(result) {
  showStep('reveal');
  disposeReveal();
  $('revealName').textContent = result.name ?? 'Your bust';
  $('addedNote').hidden = true;
  const addBtn = $('addBtn');
  addBtn.disabled = false;
  addBtn.textContent = 'ADD TO MY AVATARS';
  const row = $('paletteRow');
  row.innerHTML = '';
  for (const hexv of result.palette ?? []) {
    const i = document.createElement('i');
    i.style.background = hexv;
    i.title = hexv;
    row.appendChild(i);
  }
  if (myAvatars().includes(result.module)) markAdded();

  try {
    const THREE = await import('three');
    const mod = await import(result.url);
    const stage = $('revealStage');
    const W = stage.clientWidth || 480, H = stage.clientHeight || 340;
    const scene = new THREE.Scene();
    const cam3 = new THREE.PerspectiveCamera(38, W / H, 0.01, 60);
    // the /avatars photo-card light rig — a bust must read the same here
    const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(1.5, 3, 2); scene.add(key);
    const key2 = new THREE.DirectionalLight(0xfff2e0, 1.6); key2.position.set(-1.2, 2, 2.4); scene.add(key2);
    const warm = new THREE.PointLight(0xffd9a0, 2.4, 8); warm.position.set(1.8, 0.9, 1.8); scene.add(warm);
    const fill = new THREE.HemisphereLight(0x8fb6ff, 0x1a1d23, 1.8); scene.add(fill);
    const rim = new THREE.PointLight(0xc6f32e, 3, 8); rim.position.set(-2, 1.4, -2); scene.add(rim);

    const model = mod.createBoothModel();
    const box0 = new THREE.Box3().setFromObject(model);
    const c0 = box0.getCenter(new THREE.Vector3());
    model.position.sub(new THREE.Vector3(c0.x, box0.min.y, c0.z));
    model.scale.setScalar(1.5 / Math.max(0.01, box0.max.y - box0.min.y));
    const turn = new THREE.Group(); turn.add(model); scene.add(turn);
    const box = new THREE.Box3().setFromObject(model);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.55);
    const vFov = THREE.MathUtils.degToRad(cam3.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (W / H));
    const dist = (radius * 1.12) / Math.sin(Math.min(vFov, hFov) / 2);
    cam3.position.set(sphere.center.x + dist * 0.16, sphere.center.y + radius * 0.18, dist);
    cam3.lookAt(sphere.center);

    // preserveDrawingBuffer: the reveal is right-click-savable and testable
    // (readPixels after compositing reads zeros without it)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    stage.replaceChildren(renderer.domElement);

    let spin = true, drag = null, t0 = performance.now();
    stage.onpointerdown = (e) => { drag = { x: e.clientX, y: turn.rotation.y }; spin = false; stage.setPointerCapture(e.pointerId); };
    stage.onpointermove = (e) => { if (drag) turn.rotation.y = drag.y + (e.clientX - drag.x) * 0.012; };
    stage.onpointerup = () => { drag = null; };

    const loop = (now) => {
      const t = (now - t0) / 1000;
      if (spin) turn.rotation.y = t * 0.5;
      model.userData.tick?.(t);
      renderer.render(scene, cam3);
      revealCtx.raf = requestAnimationFrame(loop);
    };
    revealCtx = { renderer, raf: requestAnimationFrame(loop) };
  } catch (e) {
    $('revealName').textContent = 'Render failed — module loaded but did not draw.';
    console.warn('booth reveal:', e);
  }
}

function disposeReveal() {
  if (!revealCtx) return;
  cancelAnimationFrame(revealCtx.raf);
  revealCtx.renderer.dispose();
  revealCtx.renderer.forceContextLoss?.();
  revealCtx.renderer.domElement.remove();
  revealCtx = null;
}

// ── my avatars (localStorage registry the /avatars strip reads) ─────────────
const MY_KEY = 'rwf_my_booth_avatars';
function myAvatars() {
  try { return JSON.parse(localStorage.getItem(MY_KEY) ?? '[]'); } catch { return []; }
}
function markAdded() {
  const addBtn = $('addBtn');
  addBtn.textContent = 'ADDED ✓';
  addBtn.disabled = true;
  $('addedNote').hidden = false;
}
$('addBtn').addEventListener('click', () => {
  const mod = state.result?.module;
  if (!mod) return;
  const mine = myAvatars();
  if (!mine.includes(mod)) {
    mine.push(mod);
    localStorage.setItem(MY_KEY, JSON.stringify(mine));
  }
  markAdded();
});
$('againBtn').addEventListener('click', () => {
  disposeReveal();
  state.photo = null; state.result = null;
  preview.hidden = true;
  $('captureActions').hidden = false;
  showStep('capture');
});

// page leave → camera off (privacy + battery)
addEventListener('pagehide', stopCamera);
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });

// capability probe: the public deploy mirror has no /api/booth (generation is
// local-machine only — python harness + server-side keys). Say so honestly up
// front instead of failing at submit time.
fetch('/api/booth/status').then((r) => {
  if (!r.ok) {
    const el = document.createElement('div');
    el.className = 'cam-denied';
    el.innerHTML = '<b>Booth generation runs on the local machine.</b> This public mirror '
      + 'shows the flow — busts are generated at <code>localhost:4173/booth</code> '
      + 'and appear in the /avatars photo strip.';
    captureCard.prepend(el);
  }
}).catch(() => { /* local server offline — generate() will surface it */ });

showStep('capture');
