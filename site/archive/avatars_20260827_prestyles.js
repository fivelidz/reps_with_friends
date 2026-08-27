// RWF avatars — stylised, customisable mini athletes, fully procedural.
//
// Rebuilt 2026-08-27 (previous capsule-stack version archived at
// site/archive/avatars_20260827.js). What changed:
//   • Toon shading — MeshToonMaterial + an in-canvas 5-band gradient ramp, lit
//     by a key + two coloured rims. Flat bands read far better at 90px than
//     MeshStandard's plastic specular did.
//   • Tapered forms — LatheGeometry profiles instead of capsules, so limbs
//     swell at the muscle belly and taper at the joint, and the torso has an
//     actual chest / waist / hip silhouette.
//   • A face (eyes, pupils, brows, mouth), mitten hands and chunky trainers.
//   • A per-figure contact shadow that tracks hip height.
//   • A customisation layer: skin / outfit / accent colours, build, height,
//     hair and accessory — serialisable to a plain JSON descriptor.
//   • Animation: asymmetric rep easing, joint lag, damped follow-through and
//     squash/stretch at the rep extremes.
//
// No deps beyond three, no model files, no textures on disk. Works offline.
import * as THREE from 'three';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── palette ──────────────────────────────────────────────────────────────────
// Tier identity colours (match design/tokens.css).
export const TIER_COLORS = {
  couch: 0xffb020,   // amber
  casual: 0x6ec1ff,  // sky
  fit: 0xc6f32e,     // lime
  athlete: 0xff5c38, // coral
};

// Accent (shoes / headband / wristband) per tier — deliberately NOT the outfit
// colour, so each figure carries two hues and reads as a designed character
// rather than a monochrome silhouette.
export const TIER_ACCENTS = {
  couch: '#6ec1ff',
  casual: '#c6f32e',
  fit: '#ff5c38',
  athlete: '#ffb020',
};

export const SKIN_TONES = [
  '#f7ddc3', '#e9c49b', '#d9a273', '#b97e4f', '#8f5a30', '#5f3a1f',
];

export const OUTFIT_COLORS = [
  '#c6f32e', '#ff5c38', '#ffb020', '#6ec1ff', '#e8eaed',
  '#8b5cf6', '#22d3a6', '#f26fb3', '#2f3540',
];

export const HAIR_STYLES = ['none', 'short', 'bun', 'cap'];
export const ACCESSORIES = ['none', 'headband', 'wristbands', 'belt'];
export const BUILDS = ['slim', 'average', 'heavy'];

// Hair colour is picked from its own small palette so "randomise" doesn't
// produce lime-green hair on every third avatar.
const HAIR_COLORS = ['#2b2118', '#4a3524', '#7a4a22', '#c8a24a', '#8c8f96', '#1a1c20'];

// ── easing / motion helpers ──────────────────────────────────────────────────
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);

// One rep as an asymmetric 0→1→0 curve. `dn` is the fraction of the cycle spent
// on the eccentric (lowering) half — real lifting is slow down, fast up, and
// that asymmetry is most of what stops the loop looking like a metronome.
function rep(p, dn = 0.55) {
  return p < dn ? easeInOut(p / dn) : 1 - easeOutCubic((p - dn) / (1 - dn));
}

// Wrap a phase into [0,1) so a joint can be driven from a *delayed* copy of the
// same curve — that lag is what makes forearms trail upper arms.
const wrap = (p) => ((p % 1) + 1) % 1;

// Damped follow-through over the tail of the cycle. Returns exactly 0 at both
// `from` and 1, so the loop stays seamless no matter the amplitude.
function bounce(p, from = 0.72) {
  if (p < from) return 0;
  const q = (p - from) / (1 - from);
  return Math.sin(q * Math.PI * 2.4) * (1 - q) * (1 - q);
}

// ── proportions ──────────────────────────────────────────────────────────────
// Base figure stands ~0.40 tall (metres-ish; the camera fits to the row, so the
// unit only matters for internal consistency).
const BUILD_MODS = {
  slim:    { limb: 0.80, torso: 0.87, belly: 0.78, shoulder: 0.95, headScale: 1.02 },
  average: { limb: 1.00, torso: 1.00, belly: 1.00, shoulder: 1.00, headScale: 1.00 },
  heavy:   { limb: 1.26, torso: 1.20, belly: 1.48, shoulder: 1.08, headScale: 0.97 },
};

// Height stretches limbs and torso but leaves the head nearly alone, so a short
// figure reads chibi and a tall one reads adult — rather than everything just
// scaling uniformly, which changes nothing about the silhouette.
function makeDims(build, height) {
  const b = BUILD_MODS[build] ?? BUILD_MODS.average;
  const h = clamp(height, 0.72, 1.35);
  const hl = lerp(1, h, 0.85);   // limb-length response to height
  const hh = lerp(1, h, 0.18);   // head response — deliberately weak

  const legUp = 0.086 * hl, legLo = 0.078 * hl;
  const torsoLen = 0.112 * lerp(1, h, 0.45);
  const headR = 0.055 * hh * b.headScale;
  const footLen = 0.052 * lerp(1, b.limb, 0.5);

  // Where the sole actually bottoms out below the ankle. The shoe is a sphere
  // of radius footLen/2 scaled 0.50 in Y and dropped footLen*0.14, so its
  // lowest point is footLen*(0.14 + 0.25). Deriving it (rather than eyeballing
  // a constant) is what keeps every build/height standing ON the floor instead
  // of sinking into it — heavy/tall figures have bigger shoes and were the
  // worst offenders.
  const footDrop = footLen * 0.39;
  const hipDrop = 0.010;                  // hip joints hang below the pelvis

  return {
    build: b,
    legUp, legLo, footDrop, hipDrop,
    legUpR: 0.031 * b.limb, legLoR: 0.026 * b.limb,
    hipX: 0.033 * b.torso,
    // Pelvis pivot height = everything stacked below it. Sole lands exactly on
    // y=0, so the contact shadow reads as contact.
    hipY: hipDrop + legUp + legLo + footDrop,
    torsoLen, torsoR: 0.053 * b.torso,
    shoulderY: torsoLen * 0.90,
    shoulderX: 0.053 * b.torso * b.shoulder + 0.013,
    armUp: 0.076 * hl, armLo: 0.070 * hl,
    armUpR: 0.022 * b.limb, armLoR: 0.019 * b.limb,
    handR: 0.024 * b.limb,
    headR, headY: torsoLen + headR * 0.86 + 0.014,
    footLen,
  };
}

// ── toon material stack ──────────────────────────────────────────────────────
// A 5-step grayscale ramp sampled with NearestFilter gives MeshToonMaterial its
// hard bands. One texture is shared by every material in every scene.
let _gradient = null;
function toonGradient() {
  if (_gradient) return _gradient;
  const steps = [0.30, 0.50, 0.68, 0.85, 1.0];
  const c = document.createElement('canvas');
  c.width = steps.length; c.height = 1;
  const ctx = c.getContext('2d');
  steps.forEach((v, i) => {
    const n = Math.round(v * 255);
    ctx.fillStyle = `rgb(${n},${n},${n})`;
    ctx.fillRect(i, 0, 1, 1);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  _gradient = tex;
  return tex;
}

function toonMat(color, emissiveMix = 0.10) {
  const c = new THREE.Color(color);
  const e = c.clone().multiplyScalar(emissiveMix);
  return new THREE.MeshToonMaterial({
    color: c,
    emissive: e,
    gradientMap: toonGradient(),
  });
}

// ── geometry builders ────────────────────────────────────────────────────────
// A limb: revolve a profile that closes at both ends (so it's watertight like a
// capsule) but whose mid-section radius follows top → belly → bottom. `belly`
// sits at `bellyAt` along the length; that single control is the whole reason
// these read as arms and legs rather than as tubes.
function limbGeo(len, rTop, rBelly, rBot, bellyAt = 0.38, radial = 14) {
  const pts = [];
  const capSeg = 4;
  // domed top cap
  for (let i = 0; i <= capSeg; i++) {
    const a = (i / capSeg) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rTop * Math.sin(a), rTop * Math.cos(a) * 0.75));
  }
  // shaft — smoothstep from top radius through the belly to the bottom radius
  const shaft = 9;
  for (let i = 1; i <= shaft; i++) {
    const t = i / shaft;
    const r = t < bellyAt
      ? lerp(rTop, rBelly, easeInOut(t / bellyAt))
      : lerp(rBelly, rBot, easeInOut((t - bellyAt) / (1 - bellyAt)));
    pts.push(new THREE.Vector2(r, -len * t));
  }
  // domed bottom cap
  for (let i = 1; i <= capSeg; i++) {
    const a = (i / capSeg) * (Math.PI / 2);
    pts.push(new THREE.Vector2(rBot * Math.cos(a), -len - rBot * Math.sin(a) * 0.75));
  }
  return new THREE.LatheGeometry(pts, radial);
}

// The torso profile, hand-tuned. y runs 0 (hip) → 1 (neck); x is a fraction of
// torsoR. `belly` pushes the waist band outward for the heavy build.
function torsoGeo(D, belly) {
  const R = D.torsoR, H = D.torsoLen;
  // Waist radius as a fraction of chest. slim → 0.65 (a clear V-taper),
  // average → 0.83 (slight taper), heavy → 1.23 (waist wider than chest).
  // This one number is most of what separates the three builds by silhouette.
  const w = 0.83 * belly;
  const raw = [
    [0.00, -0.02], [0.62, -0.01], [0.94, 0.05], [0.97, 0.17],
    [w, 0.38], [lerp(w, 0.90, 0.5), 0.55], [1.00, 0.74],
    [0.97, 0.86], [0.74, 0.96], [0.36, 1.00], [0.00, 1.02],
  ];
  return new THREE.LatheGeometry(raw.map(([x, y]) => new THREE.Vector2(x * R, y * H)), 18);
}

// A short flared sleeve that hangs off a hip joint — i.e. a shorts leg. Being
// parented to the hip (not the pelvis) means it swings with the thigh, which is
// what shorts actually do.
function shortsGeo(D) {
  const r = D.legUpR;
  const pts = [
    new THREE.Vector2(0, 0.012),
    new THREE.Vector2(r * 1.28, 0.010),
    new THREE.Vector2(r * 1.34, -D.legUp * 0.20),
    new THREE.Vector2(r * 1.46, -D.legUp * 0.46),
    new THREE.Vector2(r * 1.44, -D.legUp * 0.50),
    new THREE.Vector2(r * 0.98, -D.legUp * 0.48),
    new THREE.Vector2(0, -D.legUp * 0.44),
  ];
  return new THREE.LatheGeometry(pts, 14);
}

// ── the rig ──────────────────────────────────────────────────────────────────
// root → shadow + orient (whole-body pose) → pelvis → torso / hips.
// Every joint is a Group at the pivot with its mesh hung below, so rotating the
// Group rotates the limb about the joint.
function buildRig(cfg) {
  const D = makeDims(cfg.build, cfg.height);
  const geoms = new Set();
  const mats = [];
  const keep = (g) => { geoms.add(g); return g; };
  const mat = (c, e) => { const m = toonMat(c, e); mats.push(m); return m; };

  const skin = mat(cfg.skinTone, 0.07);
  const outfit = mat(cfg.outfitColor, 0.14);
  const accent = mat(cfg.accentColor, 0.20);
  const hairMat = mat(cfg.hairColor, 0.05);
  const dark = mat('#14161b', 0.02);
  const white = mat('#f3f5f8', 0.30);

  const root = new THREE.Group();
  const orient = new THREE.Group();       // whole-body orientation (stand/prone)
  orient.position.y = D.hipY;
  root.add(orient);
  const pelvis = new THREE.Group();
  orient.add(pelvis);

  // pelvis block, in outfit colour so the shorts read as one garment
  const pelvisMesh = new THREE.Mesh(
    keep(limbGeo(0.020, D.torsoR * 0.80, D.torsoR * 0.90, D.torsoR * 0.82, 0.5, 16)),
    outfit
  );
  pelvisMesh.position.y = 0.010;
  pelvis.add(pelvisMesh);

  // ---- torso ----
  const torso = new THREE.Group();
  pelvis.add(torso);
  const torsoMesh = new THREE.Mesh(keep(torsoGeo(D, D.build.belly)), outfit);
  torso.add(torsoMesh);

  // neck — a sliver of skin between collar and jaw; without it the head looks
  // stuck straight onto the shirt.
  const neck = new THREE.Mesh(
    keep(limbGeo(0.016, D.headR * 0.42, D.headR * 0.40, D.headR * 0.44, 0.5, 12)), skin
  );
  neck.position.y = D.torsoLen + 0.014;
  torso.add(neck);

  // ---- head ----
  const head = new THREE.Group();
  head.position.y = D.headY;
  torso.add(head);
  const skull = new THREE.Mesh(keep(new THREE.SphereGeometry(D.headR, 24, 18)), skin);
  skull.scale.set(1.0, 0.98, 0.94);   // barely squashed — friendlier than a ball
  head.add(skull);

  // face — eyes sit slightly proud of the skull so they catch the key light and
  // survive at thumbnail size.
  const eyeR = D.headR * 0.27;
  const pupR = D.headR * 0.145;
  const eyeGeo = keep(new THREE.SphereGeometry(eyeR, 14, 12));
  const pupGeo = keep(new THREE.SphereGeometry(pupR, 12, 10));
  const browGeo = keep(new THREE.BoxGeometry(D.headR * 0.42, D.headR * 0.10, D.headR * 0.12));
  const eyes = [];
  for (const s of [-1, 1]) {
    const dir = new THREE.Vector3(s * 0.36, 0.07, 0.86).normalize();
    const eye = new THREE.Mesh(eyeGeo, white);
    eye.position.copy(dir).multiplyScalar(D.headR * 0.90);
    eye.scale.set(1, 1.06, 0.66);
    eye.lookAt(dir.clone().multiplyScalar(3));
    head.add(eye);
    const pup = new THREE.Mesh(pupGeo, dark);
    pup.position.copy(dir).multiplyScalar(D.headR * 1.02);
    pup.scale.set(1, 1.1, 0.6);
    head.add(pup);
    const brow = new THREE.Mesh(browGeo, hairMat);
    brow.position.copy(dir).multiplyScalar(D.headR * 0.96);
    brow.position.y += D.headR * 0.30;
    brow.rotation.z = s * -0.20;        // angled in = focused, not blank
    head.add(brow);
    eyes.push(eye, pup);
  }
  const mouth = new THREE.Mesh(
    keep(new THREE.BoxGeometry(D.headR * 0.30, D.headR * 0.075, D.headR * 0.10)), dark
  );
  mouth.position.set(0, -D.headR * 0.36, D.headR * 0.86);
  head.add(mouth);

  // ---- hair / headwear ----
  if (cfg.hair === 'short' || cfg.hair === 'bun') {
    // a skull-cap shell: top half of a sphere, nudged back so a forehead shows
    const capG = keep(new THREE.SphereGeometry(D.headR * 1.045, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56));
    const capM = new THREE.Mesh(capG, hairMat);
    capM.position.z = -D.headR * 0.09;
    capM.rotation.x = -0.14;
    head.add(capM);
  }
  if (cfg.hair === 'bun') {
    const bun = new THREE.Mesh(keep(new THREE.SphereGeometry(D.headR * 0.40, 14, 12)), hairMat);
    bun.position.set(0, D.headR * 0.72, -D.headR * 0.80);
    head.add(bun);
  }
  if (cfg.hair === 'cap') {
    const crown = new THREE.Mesh(
      keep(new THREE.SphereGeometry(D.headR * 1.06, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52)), accent
    );
    crown.position.y = D.headR * 0.02;
    head.add(crown);
    // brim: a half-sphere squashed flat, sticking forward
    const brim = new THREE.Mesh(
      keep(new THREE.SphereGeometry(D.headR * 1.02, 18, 8, 0, Math.PI)), accent
    );
    brim.scale.set(1.02, 0.14, 1.30);
    brim.position.set(0, D.headR * 0.40, D.headR * 0.10);
    brim.rotation.y = Math.PI / 2;   // flat side faces forward (+Z)
    brim.rotation.x = -0.10;
    head.add(brim);
  }
  if (cfg.accessory === 'headband') {
    const band = new THREE.Mesh(
      keep(new THREE.TorusGeometry(D.headR * 0.965, D.headR * 0.105, 8, 22)), accent
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = D.headR * 0.40;
    head.add(band);
  }

  // ---- arms ----
  function arm(side) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * D.shoulderX, D.shoulderY, 0);
    torso.add(shoulder);

    // deltoid cap — the single detail that gives the figure shoulders
    const delt = new THREE.Mesh(keep(new THREE.SphereGeometry(D.armUpR * 1.42, 14, 12)), skin);
    delt.scale.set(1, 0.88, 1);
    shoulder.add(delt);

    const upper = new THREE.Mesh(
      keep(limbGeo(D.armUp, D.armUpR * 1.06, D.armUpR * 1.20, D.armUpR * 0.82, 0.34)), skin
    );
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -D.armUp;
    shoulder.add(elbow);
    const lower = new THREE.Mesh(
      keep(limbGeo(D.armLo, D.armLoR * 0.94, D.armLoR * 1.10, D.armLoR * 0.70, 0.26)), skin
    );
    elbow.add(lower);

    const hand = new THREE.Mesh(keep(new THREE.SphereGeometry(D.handR, 14, 12)), skin);
    hand.scale.set(0.86, 1.12, 0.72);   // mitten, not a ball
    hand.position.y = -D.armLo - D.handR * 0.35;
    elbow.add(hand);

    if (cfg.accessory === 'wristbands') {
      const wb = new THREE.Mesh(
        keep(new THREE.TorusGeometry(D.armLoR * 1.05, D.armLoR * 0.42, 8, 16)), accent
      );
      wb.rotation.x = Math.PI / 2;
      wb.position.y = -D.armLo + D.armLoR * 0.5;
      elbow.add(wb);
    }
    return { shoulder, elbow, hand };
  }
  const armL = arm(+1);   // figure's left (+X)
  const armR = arm(-1);

  // ---- legs ----
  const shortsG = keep(shortsGeo(D));
  function leg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * D.hipX, -0.010, 0);
    pelvis.add(hip);

    const upper = new THREE.Mesh(
      keep(limbGeo(D.legUp, D.legUpR * 1.05, D.legUpR * 1.18, D.legUpR * 0.80, 0.30)), skin
    );
    hip.add(upper);
    hip.add(new THREE.Mesh(shortsG, outfit));

    const knee = new THREE.Group();
    knee.position.y = -D.legUp;
    hip.add(knee);
    const lower = new THREE.Mesh(
      keep(limbGeo(D.legLo, D.legLoR * 0.96, D.legLoR * 1.16, D.legLoR * 0.62, 0.24)), skin
    );
    knee.add(lower);

    // Ankle: a real joint, so the foot can be counter-rotated to stay FLAT on
    // the floor while the shin swings. Without it the shoe is welded to the
    // shin and its toe drives through the ground every time the knee bends.
    const ankle = new THREE.Group();
    ankle.position.y = -D.legLo;
    knee.add(ankle);

    // trainer: elongated dome + a darker sole slab
    const shoe = new THREE.Mesh(keep(new THREE.SphereGeometry(D.footLen * 0.5, 14, 12)), accent);
    shoe.scale.set(0.62, 0.50, 1.05);
    shoe.position.set(0, -D.footLen * 0.14, D.footLen * 0.22);
    ankle.add(shoe);
    const sole = new THREE.Mesh(keep(new THREE.SphereGeometry(D.footLen * 0.5, 14, 10)), dark);
    sole.scale.set(0.64, 0.22, 1.07);
    sole.position.set(0, -D.footLen * 0.26, D.footLen * 0.22);
    ankle.add(sole);

    return { hip, knee, ankle };
  }
  const legL = leg(+1);
  const legR = leg(-1);

  if (cfg.accessory === 'belt') {
    const belt = new THREE.Mesh(
      keep(new THREE.TorusGeometry(D.torsoR * 0.84, D.torsoR * 0.15, 8, 24)), accent
    );
    belt.rotation.x = Math.PI / 2;
    belt.position.y = D.torsoLen * 0.10;
    belt.scale.set(1, 1, 0.72);
    torso.add(belt);
  }

  // ---- contact shadow ----
  // A radial-gradient sprite on the floor. Not a real shadow map (way too
  // expensive for a row of these) but it's what actually sells "standing on
  // something" — and it can react to hip height for free.
  const shCanvas = document.createElement('canvas');
  shCanvas.width = shCanvas.height = 64;
  const sg = shCanvas.getContext('2d');
  const grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.62)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.26)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 64, 64);
  const shTex = new THREE.CanvasTexture(shCanvas);
  const shMat = new THREE.MeshBasicMaterial({
    map: shTex, transparent: true, depthWrite: false, opacity: 0.85,
  });
  mats.push(shMat);
  const shadow = new THREE.Mesh(keep(new THREE.PlaneGeometry(D.torsoR * 6.2, D.torsoR * 6.2)), shMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.0015;
  root.add(shadow);

  return {
    D, root, orient, pelvis, torso, head, shadow,
    shoulderL: armL.shoulder, elbowL: armL.elbow,
    shoulderR: armR.shoulder, elbowR: armR.elbow,
    hipL: legL.hip, kneeL: legL.knee, ankleL: legL.ankle,
    hipR: legR.hip, kneeR: legR.knee, ankleR: legR.ankle,
    mats, geoms,
    palette: { skin, outfit, accent, hair: hairMat },
    // per-frame shadow hints, reset by neutral() and overridden by exercises
    sh: { w: 1, l: 1, o: 1 },
  };
}

// Reset every joint (and every squash scale) to the neutral standing pose.
function neutral(rig) {
  const D = rig.D;
  rig.orient.rotation.set(0, 0, 0);
  rig.orient.position.set(0, D.hipY, 0);
  rig.orient.scale.set(1, 1, 1);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.torso.scale.set(1, 1, 1);
  rig.head.rotation.set(0, 0, 0);
  rig.head.scale.set(1, 1, 1);
  for (const s of [rig.shoulderL, rig.shoulderR]) s.rotation.set(0, 0, 0);
  for (const e of [rig.elbowL, rig.elbowR]) e.rotation.set(0, 0, 0);
  for (const h of [rig.hipL, rig.hipR]) h.rotation.set(0, 0, 0);
  for (const k of [rig.kneeL, rig.kneeR]) k.rotation.set(0, 0, 0);
  for (const a of [rig.ankleL, rig.ankleR]) a.rotation.set(0, 0, 0);
  rig.sh.w = rig.sh.l = rig.sh.o = 1;
}

// ── flat-foot solver ─────────────────────────────────────────────────────────
// Rotations don't commute, so cancelling hip splay and knee bend with separate
// Euler terms on the ankle leaves the sole slightly tilted — and a tilted sole
// digs a corner into the floor. Instead, compose the parent chain's actual
// rotation and set the ankle to its exact inverse. Scratch objects are
// module-level so this allocates nothing per frame.
const _qHip = new THREE.Quaternion();
const _qKnee = new THREE.Quaternion();
const _eul = new THREE.Euler();
function flattenFoot(ankleJoint, hipX, splay, kneeX) {
  _qHip.setFromEuler(_eul.set(hipX, 0, splay, 'XYZ'));
  _qKnee.setFromEuler(_eul.set(kneeX, 0, 0, 'XYZ'));
  ankleJoint.quaternion.copy(_qHip.multiply(_qKnee)).invert();
}

// Squash/stretch helper: `v` > 0 squashes (wider, shorter), < 0 stretches.
function squash(rig, v) {
  rig.torso.scale.set(1 + v * 0.5, 1 - v, 1 + v * 0.5);
  rig.head.scale.set(1 + v * 0.35, 1 - v * 0.7, 1 + v * 0.35);
}

// ── exercises ────────────────────────────────────────────────────────────────
// Each fn(rig, p, t) writes joint angles for phase p ∈ [0,1). `t` is absolute
// seconds, used only for the always-on idle breath so two avatars on the same
// cycle don't breathe in lockstep with their own rep.
export const EXERCISES = {
  squat: {
    label: 'Squat',
    cycle: 1.5,
    fn(rig, p, t) {
      const D = rig.D;
      neutral(rig);
      const d = rep(p, 0.56);
      const lag = rep(wrap(p - 0.04), 0.56);   // torso trails the hips slightly
      const bnc = bounce(p, 0.70);

      // Two-link kinematics rather than a fudge factor: with thigh angle -a
      // from vertical and knee flexed by k, the ankle sits legUp·cos(a) +
      // legLo·cos(k-a) below the hip. Driving hip height from THAT keeps the
      // soles planted on y=0 through the whole descent — a hardcoded ratio
      // sank the feet through the floor at the bottom of the rep.
      const a = d * 1.42;                       // thigh swing forward
      const k = d * 1.72;                       // knee flexion
      rig.hipL.rotation.x = rig.hipR.rotation.x = -a;
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = k;
      const ankleY = D.legUp * Math.cos(a) + D.legLo * Math.cos(k - a);
      rig.orient.position.y = D.hipDrop + ankleY + D.footDrop + bnc * 0.006;
      // The shin's world angle is (k - a); cancelling it at the ankle keeps the
      // sole parallel to the floor, the way a real squat keeps feet flat.
      rig.ankleL.rotation.x = rig.ankleR.rotation.x = -(k - a);
      // knees track out over the toes rather than collapsing inward
      rig.hipL.rotation.z = d * 0.16;
      rig.hipR.rotation.z = -d * 0.16;

      rig.torso.rotation.x = lag * 0.34 - bnc * 0.06;
      // head counter-rotates ~70% of the torso lean — eyes stay on the horizon
      rig.head.rotation.x = -lag * 0.24 + bnc * 0.05;
      rig.head.rotation.y = Math.sin(t * 0.9) * 0.05;

      // arms swing forward as a counterweight, forearms trailing
      rig.shoulderL.rotation.x = rig.shoulderR.rotation.x = -lag * 1.46;
      rig.shoulderL.rotation.z = 0.11 + d * 0.13;
      rig.shoulderR.rotation.z = -0.11 - d * 0.13;
      const fore = rep(wrap(p - 0.07), 0.56);
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = -0.10 - fore * 0.30;

      squash(rig, d * 0.09 - bnc * 0.05);
      rig.sh.w = rig.sh.l = 1 + d * 0.16;
      rig.sh.o = 1 + d * 0.22;
    },
  },

  pushup: {
    label: 'Push-up',
    cycle: 1.4,
    fn(rig, p, t) {
      const D = rig.D;
      neutral(rig);
      const d = rep(p, 0.52);
      const bnc = bounce(p, 0.74);

      // prone: X=π/2 then Z=-π/2 puts the head at +X and the chest facing down
      rig.orient.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
      // body height = actual arm reach, so the hands stay planted on the floor
      const bend = 0.42 + d * 1.12;
      const reach = D.armUp + (D.armLo + D.handR) * Math.cos(bend);
      rig.orient.position.set(-(D.legUp + D.legLo) * 0.30, reach + bnc * 0.004, 0);

      rig.shoulderL.rotation.x = rig.shoulderR.rotation.x = -Math.PI / 2 + d * 0.34;
      // elbows flare out as they bend — that's what makes it look like effort
      rig.shoulderL.rotation.z = 0.10 + d * 0.26;
      rig.shoulderR.rotation.z = -0.10 - d * 0.26;
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = bend;

      // the plank isn't rigid: a slow hip sag independent of the rep
      const sag = Math.sin(t * 1.3) * 0.022;
      rig.torso.rotation.x = -0.05 + sag;
      rig.pelvis.rotation.x = sag * 0.6;
      rig.head.rotation.x = 0.48 + d * 0.18;   // chin tucks on the way down
      rig.hipL.rotation.z = 0.11; rig.hipR.rotation.z = -0.11;
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = -0.06;
      // toes tucked under, taking the weight — the body is horizontal here, so
      // "down" for the foot is along the body's -X, i.e. a big ankle flex
      rig.ankleL.rotation.x = rig.ankleR.rotation.x = -1.15;

      squash(rig, d * 0.05);
      rig.sh.w = 2.4; rig.sh.l = 1.1;          // long thin shadow under the body
      rig.sh.o = 1 - d * 0.10;
    },
  },

  jumpingjack: {
    label: 'Jumping jack',
    cycle: 1.3,
    fn(rig, p, t) {
      const D = rig.D;
      neutral(rig);
      const d = rep(p, 0.5);
      // a real hop arc rather than a sine wobble: airborne for the middle of
      // each half-cycle, hard landing at the extremes
      const air = Math.pow(Math.abs(Math.sin(p * Math.PI * 2)), 0.7);
      const land = 1 - air;                    // 1 at the two ground contacts
      const hop = air * (D.legUp + D.legLo) * 0.16;

      // arms lead, forearms and wrists trail — the classic overlapping action
      const armD = rep(wrap(p - 0.03), 0.5);
      rig.shoulderL.rotation.z = 0.10 + armD * 2.78;
      rig.shoulderR.rotation.z = -0.10 - armD * 2.78;
      rig.shoulderL.rotation.x = rig.shoulderR.rotation.x = -0.14 * air;
      const foreD = rep(wrap(p - 0.09), 0.5);
      rig.elbowL.rotation.z = (1 - foreD) * 0.20;
      rig.elbowR.rotation.z = -(1 - foreD) * 0.20;
      rig.elbowL.rotation.x = rig.elbowR.rotation.x = -0.10 - (1 - foreD) * 0.14;

      // Legs splay sideways (z) and the knees soften on landing (x). Both
      // shorten the hip→ankle distance, so hip height is derived from them the
      // same way the squat does it — otherwise the landing crouch drives the
      // shoes through the floor.
      const splay = d * 0.44;
      const kneeX = 0.05 + land * 0.34;
      const hipX = -land * 0.16;
      rig.hipL.rotation.z = splay;
      rig.hipR.rotation.z = -splay;
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = kneeX;
      rig.hipL.rotation.x = rig.hipR.rotation.x = hipX;
      const ankleY = (D.legUp * Math.cos(hipX) + D.legLo * Math.cos(kneeX - hipX)) * Math.cos(splay);
      rig.orient.position.y = D.hipDrop + ankleY + D.footDrop + hop;
      // exact inverse of hip⊗knee, so the sole is parallel to the floor even
      // with splay and knee bend applied together
      flattenFoot(rig.ankleL, hipX, splay, kneeX);
      flattenFoot(rig.ankleR, hipX, -splay, kneeX);

      rig.torso.rotation.x = land * 0.14 - air * 0.04;
      rig.head.rotation.x = -land * 0.10;
      rig.head.rotation.z = Math.sin(t * 1.1) * 0.04;

      // stretch in the air, squash on contact — the whole point of the exercise
      squash(rig, land * 0.11 - air * 0.06);
      rig.sh.w = rig.sh.l = 1.25 - air * 0.34;
      rig.sh.o = 1.05 - air * 0.45;
    },
  },

  curl: {
    label: 'Bicep curl',
    cycle: 1.6,
    fn(rig, p, t) {
      neutral(rig);
      // alternating arms — half a cycle apart. Far more watchable than both
      // forearms moving as one, and it gives the torso something to counter.
      const a = rep(p, 0.42);
      const b = rep(wrap(p + 0.5), 0.42);

      rig.elbowL.rotation.x = -0.14 - a * 2.05;
      rig.elbowR.rotation.x = -0.14 - b * 2.05;
      rig.shoulderL.rotation.x = -a * 0.20;
      rig.shoulderR.rotation.x = -b * 0.20;
      rig.shoulderL.rotation.z = 0.14 + a * 0.10;
      rig.shoulderR.rotation.z = -0.14 - b * 0.10;

      // torso counter-rotates toward the working arm, hips resist
      const twist = (a - b) * 0.13;
      rig.torso.rotation.y = twist;
      rig.pelvis.rotation.y = -twist * 0.35;
      rig.torso.rotation.z = -twist * 0.30;
      rig.torso.rotation.x = -Math.max(a, b) * 0.06;
      rig.head.rotation.y = -twist * 0.55;
      rig.head.rotation.x = Math.max(a, b) * 0.08 + Math.sin(t * 1.6) * 0.02;

      // soft knees taking the load, and a tiny dip per curl — hip height again
      // derived from the actual joint angles so the shoes stay on the floor
      const D = rig.D;
      const dip = Math.max(a, b);
      const kneeX = 0.09 + dip * 0.06;
      const hipX = -0.05 - dip * 0.03;
      rig.kneeL.rotation.x = rig.kneeR.rotation.x = kneeX;
      rig.hipL.rotation.x = rig.hipR.rotation.x = hipX;
      rig.orient.position.y = D.hipDrop
        + D.legUp * Math.cos(hipX) + D.legLo * Math.cos(kneeX - hipX) + D.footDrop;
      rig.ankleL.rotation.x = rig.ankleR.rotation.x = -(kneeX - hipX);

      squash(rig, dip * 0.035);
      rig.sh.o = 1 + dip * 0.06;
    },
  },
};

export const EXERCISE_NAMES = Object.keys(EXERCISES);

// ── configuration ────────────────────────────────────────────────────────────
export const AVATAR_DEFAULTS = {
  tier: 'fit',
  skinTone: '#e9c49b',
  outfitColor: null,     // null → tier colour
  accentColor: null,     // null → tier accent
  hairColor: '#2b2118',
  build: 'average',      // slim | average | heavy
  height: 1,             // 0.72 … 1.35
  hair: 'short',         // none | short | bun | cap
  accessory: 'none',     // none | headband | wristbands | belt
  exercise: 'squat',
  cycle: null,           // null → the exercise's own cycle
  scale: 1,
};

function hex(v, fallback) {
  if (typeof v === 'number') return '#' + v.toString(16).padStart(6, '0');
  if (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v.trim())) {
    const s = v.trim();
    return s[0] === '#' ? s.toLowerCase() : '#' + s.toLowerCase();
  }
  return fallback;
}

const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

/**
 * Fold any partial options object into a complete, plain, serialisable avatar
 * descriptor. This is the contract: whatever this returns round-trips through
 * JSON.stringify → JSON.parse → createAvatar and produces the same figure.
 */
export function normalizeAvatarConfig(opts = {}) {
  const tier = oneOf(opts.tier, Object.keys(TIER_COLORS), AVATAR_DEFAULTS.tier);
  const tierHex = hex(TIER_COLORS[tier], '#c6f32e');
  // `color` is the legacy single-colour option — still honoured as the outfit.
  const legacy = opts.color != null ? hex(opts.color, tierHex) : null;
  return {
    tier,
    skinTone: hex(opts.skinTone, AVATAR_DEFAULTS.skinTone),
    outfitColor: hex(opts.outfitColor ?? legacy, tierHex),
    accentColor: hex(opts.accentColor, TIER_ACCENTS[tier] ?? '#e8eaed'),
    hairColor: hex(opts.hairColor, AVATAR_DEFAULTS.hairColor),
    build: oneOf(opts.build, BUILDS, AVATAR_DEFAULTS.build),
    height: Math.round(clamp(Number(opts.height ?? 1) || 1, 0.72, 1.35) * 1000) / 1000,
    hair: oneOf(opts.hair, HAIR_STYLES, AVATAR_DEFAULTS.hair),
    accessory: oneOf(opts.accessory, ACCESSORIES, AVATAR_DEFAULTS.accessory),
    exercise: oneOf(opts.exercise, EXERCISE_NAMES, AVATAR_DEFAULTS.exercise),
    cycle: opts.cycle == null ? null : Math.round(clamp(Number(opts.cycle) || 1.5, 0.4, 6) * 100) / 100,
    scale: Math.round(clamp(Number(opts.scale ?? 1) || 1, 0.2, 4) * 1000) / 1000,
  };
}

// mulberry32 — tiny, fast, deterministic. Same seed ⇒ same avatar, forever.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const s = String(seed ?? '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic avatar from any player id / name / number. Same input always
 * produces the same character, so a crew looks stable across sessions without
 * anything being persisted.
 *
 *   avatarConfigFromSeed('alexei')                     → a full descriptor
 *   avatarConfigFromSeed('alexei', { tier: 'casual' }) → same, tier pinned
 */
export function avatarConfigFromSeed(seed, overrides = {}) {
  const rnd = mulberry32(hashSeed(seed));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const tier = overrides.tier ?? pick(Object.keys(TIER_COLORS));
  const cfg = {
    tier,
    skinTone: pick(SKIN_TONES),
    outfitColor: hex(TIER_COLORS[tier], '#c6f32e'),
    accentColor: pick(OUTFIT_COLORS),
    hairColor: pick(HAIR_COLORS),
    build: pick(BUILDS),
    height: Math.round((0.86 + rnd() * 0.36) * 100) / 100,
    hair: pick(HAIR_STYLES),
    accessory: pick(ACCESSORIES),
    exercise: pick(EXERCISE_NAMES),
  };
  // never let the accent land on the outfit colour — the two-hue read is the
  // point, and a same-on-same avatar looks like a bug
  if (cfg.accentColor === cfg.outfitColor) {
    cfg.accentColor = OUTFIT_COLORS[(OUTFIT_COLORS.indexOf(cfg.accentColor) + 3) % OUTFIT_COLORS.length];
  }
  return normalizeAvatarConfig({ ...cfg, ...overrides });
}

/** A fresh random descriptor (non-deterministic — used by the "randomise" button). */
export function randomAvatarConfig(overrides = {}) {
  return avatarConfigFromSeed(Math.floor(Math.random() * 0xffffffff), overrides);
}

// ── createAvatar ─────────────────────────────────────────────────────────────
/**
 * Build one avatar.
 *
 * @param {object} opts — any subset of AVATAR_DEFAULTS, plus `onRep(reps, api)`.
 * @returns {{
 *   group: THREE.Group, config: object, dims: object,
 *   setExercise(name, cycle?): boolean,
 *   setColors(partial): void,   // live, no rebuild — for colour pickers
 *   update(dt): void, pose(p?): void, reset(): void, dispose(): void,
 *   toJSON(): object,
 * }}
 */
export function createAvatar(opts = {}) {
  const config = normalizeAvatarConfig(opts);
  const rig = buildRig(config);
  if (config.scale !== 1) rig.root.scale.setScalar(config.scale);

  let exercise = EXERCISES[config.exercise] ?? EXERCISES.squat;
  let cycle = config.cycle ?? exercise.cycle;
  let phase = 0;
  let clockT = 0;
  let reps = 0;

  const baseShadow = { w: rig.shadow.scale.x, l: rig.shadow.scale.y };

  function applyPose(p) {
    exercise.fn(rig, p, clockT);
    // shadow follows whatever hint the exercise left behind
    rig.shadow.scale.set(baseShadow.w * rig.sh.w, baseShadow.l * rig.sh.l, 1);
    rig.shadow.material.opacity = clamp(0.85 * rig.sh.o, 0, 1);
  }

  const api = {
    group: rig.root,
    config,
    dims: rig.D,
    get exercise() { return exercise; },
    get exerciseName() { return config.exercise; },
    get cycle() { return cycle; },
    get reps() { return reps; },

    setExercise(name, cycleOverride) {
      const ex = EXERCISES[name];
      if (!ex) return false;
      exercise = ex;
      config.exercise = name;
      cycle = cycleOverride ?? config.cycle ?? ex.cycle;
      phase = 0;
      applyPose(0);
      return true;
    },

    setCycle(v) {
      cycle = clamp(Number(v) || exercise.cycle, 0.3, 8);
      config.cycle = Math.round(cycle * 100) / 100;
    },

    // Colour-only updates don't touch geometry, so the playground's colour
    // pickers can be live-dragged without rebuilding the rig every frame.
    setColors(partial = {}) {
      const map = {
        skinTone: rig.palette.skin, outfitColor: rig.palette.outfit,
        accentColor: rig.palette.accent, hairColor: rig.palette.hair,
      };
      for (const [key, mat] of Object.entries(map)) {
        if (partial[key] == null) continue;
        const h = hex(partial[key], config[key]);
        config[key] = h;
        mat.color.set(h);
        mat.emissive.set(h).multiplyScalar(mat === rig.palette.accent ? 0.20 : 0.10);
        mat.needsUpdate = true;
      }
    },

    update(dt) {
      clockT += dt;
      phase += dt;
      if (phase >= cycle) {
        phase %= cycle;
        reps++;
        if (typeof opts.onRep === 'function') opts.onRep(reps, api);
      }
      applyPose(phase / cycle);
    },

    // Hold a static phase (reduced motion / frozen previews). 0.34 lands inside
    // the eccentric, which is the most legible frame of every one of these.
    pose(p = 0.34) {
      phase = p * cycle;
      applyPose(p);
    },

    reset() { reps = 0; phase = 0; applyPose(0); },

    toJSON() { return { ...config }; },

    dispose() {
      for (const g of rig.geoms) g.dispose();
      for (const m of rig.mats) { if (m.map) m.map.dispose(); m.dispose(); }
      rig.geoms.clear();
      rig.mats.length = 0;
    },
  };

  applyPose(0);
  return api;
}

// ── AvatarScene ──────────────────────────────────────────────────────────────
/**
 * Stage a row of avatars on one shared renderer.
 *
 * opts: {
 *   mount, avatars: [config…],
 *   spacing = 0.62, fov = 33, ground = true, alpha = true, bg,
 *   camY = 0.46, targetY = 0.19, zMin = 0.9, zMax = 4.4,
 *   orbit = false,       // OrbitControls (the /avatars playground uses this)
 *   speed = 1,
 * }
 *
 * Frozen keeps the last composited frame on screen — that's the demo's pause.
 */
export class AvatarScene {
  constructor(opts) {
    const o = {
      spacing: 0.62, fov: 33, ground: true, alpha: true,
      camY: 0.46, targetY: 0.19, zMin: 0.9, zMax: 4.4,
      orbit: false, speed: 1, ...opts,
    };
    this.mount = o.mount;
    this.opts = o;
    this.speed = o.speed;
    this.frozen = false;
    this.visible = true;
    this.disposed = false;
    this.renderMs = 0;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: o.alpha });
    } catch (err) {
      console.warn('RWF avatars: WebGL unavailable, scene skipped —', err);
      if (this.mount && this.mount.parentElement) this.mount.parentElement.style.minHeight = '0';
      this.dead = true;
      return;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(this.mount.clientWidth || 300, this.mount.clientHeight || 200);
    if (o.alpha) renderer.setClearColor(0x000000, 0);
    // Toon banding is the whole look — ACES would smear the steps back into a
    // gradient, so tone mapping is off and exposure lives in the light rig.
    renderer.toneMapping = THREE.NoToneMapping;
    this.mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'pan-y';

    this.scene = new THREE.Scene();
    if (!o.alpha) {
      this.scene.background = new THREE.Color(o.bg ?? 0x0a0b0d);
      this.scene.fog = new THREE.Fog(o.bg ?? 0x0a0b0d, 4, 10);
    }

    this.camera = new THREE.PerspectiveCamera(
      o.fov, (this.mount.clientWidth || 1) / Math.max(this.mount.clientHeight || 1, 1), 0.05, 40
    );

    // Toon light rig: a cool fill that keeps shadowed sides on band 2 (never
    // crushed to black), one warm key for the band break, and two coloured rims
    // from behind so the silhouette separates from a dark card.
    this.scene.add(new THREE.HemisphereLight(0x9fb4d0, 0x1b1f26, 1.15));
    const key = new THREE.DirectionalLight(0xfff3e2, 2.05);
    key.position.set(2.4, 3.6, 2.8);
    this.scene.add(key);
    const rimA = new THREE.DirectionalLight(0xc6f32e, 1.35);
    rimA.position.set(-3.2, 1.4, -2.2);
    this.scene.add(rimA);
    const rimB = new THREE.DirectionalLight(0xff5c38, 0.95);
    rimB.position.set(3.0, 0.9, -2.6);
    this.scene.add(rimB);

    // avatars in a centred row
    this.avatars = [];
    this.configs = [];
    const list = o.avatars || [];
    const n = list.length;
    this.rowHalf = Math.max(n * o.spacing, 1) / 2;
    list.forEach((cfg, i) => this._mountAvatar(cfg, i, n));

    if (o.ground && n) this._buildGround(this.rowHalf + 0.42);

    if (o.orbit) this._initOrbit();

    // render-gating: only draw while on screen (hero-scene pattern)
    this._io = new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting;
      if (this.visible && !this.frozen) this._renderOnce();
    }, { threshold: 0 });
    this._io.observe(this.mount);

    this._ro = new ResizeObserver(() => this._fit());
    this._ro.observe(this.mount);

    this.clock = new THREE.Clock();
    this._raf = 0;
    this._fit();
    if (REDUCED) this.avatars.forEach((a) => a.pose(0.34));
    this._renderOnce();
  }

  _mountAvatar(cfg, i, n) {
    const av = createAvatar(cfg);
    av.group.position.x = (i - (n - 1) / 2) * this.opts.spacing;
    this.scene.add(av.group);
    this.avatars[i] = av;
    this.configs[i] = av.config;
    if (REDUCED) av.pose(0.34);
    return av;
  }

  _buildGround(gr) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(gr, 48),
      new THREE.MeshBasicMaterial({ color: 0x14171d })
    );
    disc.rotation.x = -Math.PI / 2;
    this.scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(gr - 0.035, gr, 64),
      new THREE.MeshBasicMaterial({ color: 0x3a4048, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    this.scene.add(ring);
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const g = glowCanvas.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(198,243,46,0.10)');
    grad.addColorStop(1, 'rgba(198,243,46,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(gr * 2.6, gr * 2.6),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.0005;
    this.scene.add(glow);
  }

  // Orbit is opt-in and loaded lazily so the site/demo bundles never pay for it.
  _initOrbit() {
    import('three/addons/controls/OrbitControls.js').then(({ OrbitControls }) => {
      if (this.disposed || this.dead) return;
      const c = new OrbitControls(this.camera, this.renderer.domElement);
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.enablePan = false;
      c.minDistance = 0.35;
      c.maxDistance = 3.0;
      c.maxPolarAngle = Math.PI * 0.52;
      c.target.set(0, this.opts.targetY, 0);
      c.update();
      this.controls = c;
      this._renderOnce();
    }).catch((err) => console.warn('RWF avatars: orbit controls unavailable —', err));
  }

  /**
   * Swap one avatar for a new configuration. Geometry depends on build/height/
   * hair/accessory, so anything structural means a rebuild — but pure colour
   * changes are routed to setColors() and skip it entirely.
   */
  setAvatarConfig(i, cfg) {
    if (this.dead || this.disposed) return null;
    const old = this.avatars[i];
    if (!old) return null;
    const next = normalizeAvatarConfig({ ...old.config, ...cfg });
    const structural = ['build', 'height', 'hair', 'accessory', 'scale'];
    if (structural.every((k) => next[k] === old.config[k])) {
      old.setColors(next);
      if (next.exercise !== old.config.exercise) old.setExercise(next.exercise, next.cycle ?? undefined);
      else if (next.cycle != null && next.cycle !== old.cycle) old.setCycle(next.cycle);
      if (this.frozen || REDUCED) { old.pose(0.34); this._renderOnce(); }
      return old;
    }
    const n = this.avatars.length;
    this.scene.remove(old.group);
    old.dispose();
    const av = this._mountAvatar(next, i, n);
    this._renderOnce();
    return av;
  }

  setExercise(i, name) { this.avatars[i]?.setExercise(name); }
  setExerciseAll(name) { for (const a of this.avatars) a.setExercise(name); }
  setSpeed(x) { this.speed = clamp(Number(x) || 1, 0.1, 4); }

  _fit() {
    if (this.dead || this.disposed) return;
    const w = this.mount.clientWidth, h = this.mount.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    // halfW = n·spacing/2 exactly: that places avatar i at horizontal fraction
    // (i+0.5)/n — matching an n-column HTML overlay cell for cell.
    const halfW = this.rowHalf;
    const z = THREE.MathUtils.clamp(
      halfW / (Math.tan(THREE.MathUtils.degToRad(this.opts.fov / 2)) * this.camera.aspect),
      this.opts.zMin, this.opts.zMax
    );
    if (!this.controls) {
      this.camera.position.set(0, this.opts.camY, z);
      this.camera.lookAt(0, this.opts.targetY, 0);
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.frozen || REDUCED) this._renderOnce();
  }

  _renderOnce() {
    if (this.dead || this.disposed) return;
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    // exponential moving average — one slow first frame shouldn't dominate
    const ms = performance.now() - t0;
    this.renderMs = this.renderMs ? this.renderMs * 0.9 + ms * 0.1 : ms;
  }

  start() {
    if (this.dead || this.disposed || this._raf) return;
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (!this.visible || this.frozen) return;   // keep clock flowing, skip work
      if (this.controls) this.controls.update();
      if (!REDUCED) {
        const scaled = dt * this.speed;
        for (const av of this.avatars) av.update(scaled);
      }
      this._renderOnce();
    };
    loop();
  }

  freeze() { this.frozen = true; }
  resume() { this.frozen = false; this._renderOnce(); }
  reset() { this.avatars.forEach((a) => a.reset()); this._renderOnce(); }

  /** Current configs as plain JSON — persist to localStorage, ship over the wire. */
  toJSON() { return this.avatars.map((a) => a.toJSON()); }

  dispose() {
    if (this.disposed || this.dead) { this.disposed = true; return; }
    this.disposed = true;
    cancelAnimationFrame(this._raf);
    this._io.disconnect();
    this._ro.disconnect();
    this.controls?.dispose();
    for (const av of this.avatars) av.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
