/* ═══════════════════════════════════════════════════════════════════════
   RWF · CARDS3D — real 3D power-up cards (site/models — REUSABLE ASSET)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The founder: "not the worst having 3d models for hurdles, cards, 3d
   powerup representations. not bad to have as potential assets we can
   reuse." — so this module lives in site/models/ (the asset layer), has
   ZERO app dependencies, and works in any three.js page with the shared
   importmap (three r177).

   What you get
   ────────────
   · makeCard(def, opts) → { group, setFace, flip, deal, play, discard,
     setHover, update(dt), hitMeshes, dispose } — a real card MESH:
     rounded-rect (63×88), bevelled edge, canvas-texture front face
     (256×358, sports-poster gold-on-black), shared card back (gold
     filigree + RWF monogram), rarity-tinted emissive edge.
   · DECK — the full 21-card stack (apps/sot-engine.js CARD_CATALOG is
     the source of truth; this mirror carries the face-art fields).
   · RARITY — common steel → legendary gold, with glow values.
   · burst / stepBursts — rarity-coloured sparkle bursts (the confetti
     language from v3, packaged for reuse).
   · makeDeckDemo(host, opts) — the whole 21-card deck fanned in 3D,
     slowly rotating — the ASSET VAULT showcase on /avatars.

   Perf contract (v3 battle: 4 runners × 3 cards, phone-first):
   · ONE shared geometry set (extruded core + face plates) for every card
   · front textures cached per card-id; ONE shared back texture
   · edge materials shared per rarity (legendary clones only, for shimmer)
   · NO per-frame canvas redraws — textures are drawn once, ever
   · shared assets are flagged __rwfShared so a host's dispose() walk can
     skip them and the cache survives route changes (re-uploads are free).

   Timing language: 300–500ms eased moves (deal 600ms + stagger) — shared
   with v2's CSS card rig so the whole product flips at the same tempo.
   ═══════════════════════════════════════════════════════════════════════ */

import * as THREE from "three";
import { drawCardSymbol } from "../powerup-art/symbols.js";

/* ── rarity treatment (matches the CSS: RAR_COL in v3/v2) ─────────────── */
export const RARITY = {
  common:    { hex: "#9aa7a0", glow: 0.22, label: "COMMON" },
  rare:      { hex: "#6ec1ff", glow: 0.34, label: "RARE" },
  epic:      { hex: "#b78cff", glow: 0.46, label: "EPIC" },
  legendary: { hex: "#ffc941", glow: 0.62, label: "LEGENDARY" },
};
export const rarityOf = (r) => RARITY[r] ?? RARITY.common;

/* ── the deck — mirror of apps/sot-engine.js CARD_CATALOG (21) ──────────
   family → badge copy; cost = the v3 RUF economy (CARD_COSTS) + rarity
   defaults for the rest. Glyphs are the SoT CARD_ICONS (v3's 💅 steal
   arrives as an override from the app — the deck stays SoT-canonical). */
export const DECK = {
  lightning:         { id: "lightning", name: "Lightning Round", family: "canon", rarity: "legendary", glyph: "⚡", cost: 50, blurb: "Your reps count ×3 for the next 10 minutes · once per day" },
  steal:             { id: "steal", name: "Rep Steal", family: "canon", rarity: "epic", glyph: "🥷", cost: 30, blurb: "Gain 10% of a rival's completed score — they keep theirs" },
  shield:            { id: "shield", name: "Group Shield", family: "canon", rarity: "common", glyph: "🛡️", cost: 10, blurb: "Protect everyone's streak from one failed day" },
  freeze:            { id: "freeze", name: "Time Freeze", family: "canon", rarity: "rare", glyph: "❄️", cost: 15, blurb: "The battle clock extends 30 minutes, group-wide" },
  combo_boost:       { id: "combo_boost", name: "Combo Boost", family: "post-launch", rarity: "rare", glyph: "🔥", cost: 15, blurb: "Bonus for nailing a prescribed exercise combo" },
  double_down:       { id: "double_down", name: "Double Down", family: "post-launch", rarity: "epic", glyph: "🎲", cost: 30, blurb: "Volunteer for 2× target; 2× season reward if you make it" },
  assist_boost:      { id: "assist_boost", name: "Assist Boost", family: "post-launch", rarity: "common", glyph: "🤝", cost: 10, blurb: "Help a mate finish — you both get rewarded when they do" },
  surprise_bomb:     { id: "surprise_bomb", name: "Surprise Bomb", family: "post-launch", rarity: "epic", glyph: "💣", cost: 30, blurb: "Drop +20 reps on a rival: 10 minutes to deliver or it fizzles" },
  rescue_rope:       { id: "rescue_rope", name: "Rescue Rope", family: "post-launch", rarity: "rare", glyph: "🪢", cost: 15, blurb: "Instant 50-rep credit to an inactive teammate · limited" },
  shield_bash:       { id: "shield_bash", name: "Shield Bash", family: "post-launch", rarity: "rare", glyph: "🔨", cost: 15, blurb: "Cancel the active Group Shield · Pro/competitive" },
  double_exercise:   { id: "double_exercise", name: "Double Exercise", family: "exercise", rarity: "rare", glyph: "🏋️", cost: 15, blurb: "Name one exercise — your reps of it count ×2 today" },
  specialist:        { id: "specialist", name: "Specialist", family: "exercise", rarity: "epic", glyph: "🎯", cost: 30, blurb: "Your top-3 most-logged exercises' reps +50% today" },
  wildcard_workout:  { id: "wildcard_workout", name: "Wildcard Workout", family: "exercise", rarity: "legendary", glyph: "🃏", cost: 50, blurb: "Any exercise counts as any other for you today" },
  rivalry:           { id: "rivalry", name: "Rivalry", family: "rivalry", rarity: "common", glyph: "⚔️", cost: 10, blurb: "Pick a rival — whoever logs more today takes +30 reps" },
  training_partners: { id: "training_partners", name: "Training Partners", family: "rivalry", rarity: "rare", glyph: "🤜", cost: 15, blurb: "If you BOTH bank today, you both earn the partner bonus" },
  pack_bond:         { id: "pack_bond", name: "Pack Bond", family: "rivalry", rarity: "epic", glyph: "🐺", cost: 30, blurb: "Every member who logs 20+ reps banks +10% today" },
  prove_it:          { id: "prove_it", name: "Prove It", family: "proof", rarity: "rare", glyph: "📋", cost: 15, blurb: "Target's next log must be verified — honesty pays them +15" },
  spot_check:        { id: "spot_check", name: "Spot Check", family: "proof", rarity: "epic", glyph: "🔍", cost: 30, blurb: "Proof check on the leader's biggest log — crew accepts or contests" },
  second_wind:       { id: "second_wind", name: "Second Wind", family: "catch-up", rarity: "rare", glyph: "💨", cost: 15, blurb: "Behind the pack? Your reps count ×1.5 for 15 minutes" },
  mulligan:          { id: "mulligan", name: "Mulligan", family: "catch-up", rarity: "common", glyph: "🔄", cost: 10, blurb: "Discard your hand — a fresh deal of 3 is on the table" },
  underdog:          { id: "underdog", name: "Underdog", family: "catch-up", rarity: "epic", glyph: "🐕", cost: 30, blurb: "Last place at the deal? Your reps count ×1.25 today" },
};
export const DECK_IDS = Object.keys(DECK);
export const getDef = (id) => DECK[id] ?? { id, name: id, family: "canon", rarity: "common", glyph: "🃏", cost: 10, blurb: "" };
const FAMILY_BADGE = { canon: "CANON", "post-launch": "SERIES 2", exercise: "EXERCISE", rivalry: "RIVALRY", proof: "PROOF", "catch-up": "CATCH-UP" };

/* ═══════════════════════ canvas faces (drawn ONCE, cached) ════════════ */
const CARD_W = 256, CARD_H = 358;               // 63×88 ratio, crisp at scale
const _frontCache = new Map();                  // defId → CanvasTexture
let _backTex = null;
let _glowTex = null;

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** the shared card BACK — gold filigree on black + RWF monogram */
export function cardBackTexture() {
  if (_backTex) return _backTex;
  const c = document.createElement("canvas");
  c.width = CARD_W; c.height = CARD_H;
  const g = c.getContext("2d");
  const gold = "#ffc941", goldDim = "rgba(255,201,65,0.5)";
  const grad = g.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, "#191b20");
  grad.addColorStop(0.5, "#0d0e12");
  grad.addColorStop(1, "#15130b");
  g.fillStyle = grad;
  rr(g, 6, 6, CARD_W - 12, CARD_H - 12, 26); g.fill();
  // double gold border
  g.strokeStyle = gold; g.lineWidth = 5; g.shadowColor = gold; g.shadowBlur = 14;
  rr(g, 14, 14, CARD_W - 28, CARD_H - 28, 20); g.stroke();
  g.shadowBlur = 0; g.strokeStyle = goldDim; g.lineWidth = 2;
  rr(g, 26, 26, CARD_W - 52, CARD_H - 52, 14); g.stroke();
  // corner filigree — nested quarter arcs reaching inward
  g.strokeStyle = goldDim; g.lineWidth = 3;
  const corner = () => {
    for (const rad of [26, 40, 54]) {
      g.beginPath(); g.arc(0, 0, rad, 0, Math.PI / 2); g.stroke();
    }
  };
  g.save();
  g.translate(28, 28); corner();
  g.translate(CARD_W - 56, 0); g.scale(-1, 1); corner();
  g.translate(0, CARD_H - 56); g.scale(1, -1); corner();
  g.translate(-(CARD_W - 56), 0); g.scale(-1, 1); corner();
  g.restore();
  // centre medallion + RWF monogram
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = gold; g.shadowBlur = 18;
  g.fillStyle = gold;
  g.font = "800 64px ui-monospace, monospace";
  g.fillText("RWF", CARD_W / 2, CARD_H / 2 - 10);
  g.shadowBlur = 0;
  g.strokeStyle = goldDim; g.lineWidth = 3;
  g.beginPath(); g.arc(CARD_W / 2, CARD_H / 2 - 10, 60, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
  g.font = "700 14px ui-monospace, monospace";
  g.fillStyle = goldDim;
  g.fillText("R E P S   W I T H   F R I E N D S", CARD_W / 2, CARD_H / 2 + 76, CARD_W - 64);
  // pip row
  g.fillStyle = goldDim;
  for (let i = -1; i <= 1; i++) {
    g.beginPath(); g.arc(CARD_W / 2 + i * 18, CARD_H / 2 + 114, 3.2, 0, Math.PI * 2); g.fill();
  }
  _backTex = new THREE.CanvasTexture(c);
  _backTex.colorSpace = THREE.SRGBColorSpace;
  _backTex.anisotropy = 2;
  _backTex.__rwfShared = true;
  return _backTex;
}

/** the per-card FRONT — 256×358 sports poster (gold on black), cached */
export function cardFrontTexture(def) {
  const hit = _frontCache.get(def.id);
  if (hit) return hit;
  const rar = rarityOf(def.rarity);
  const c = document.createElement("canvas");
  c.width = CARD_W; c.height = CARD_H;
  const g = c.getContext("2d");
  // face — the poster gradient + pinstripes (v3's cardTexture language)
  const grad = g.createLinearGradient(0, 0, CARD_W, CARD_H);
  grad.addColorStop(0, "#30343e");
  grad.addColorStop(0.38, "#1b2028");
  grad.addColorStop(1, "#0b0d12");
  g.fillStyle = grad;
  rr(g, 6, 6, CARD_W - 12, CARD_H - 12, 26); g.fill();
  g.save();
  rr(g, 6, 6, CARD_W - 12, CARD_H - 12, 26); g.clip();
  g.strokeStyle = "rgba(255,255,255,0.07)";
  g.lineWidth = 3;
  for (let y = -CARD_H; y < CARD_H * 1.4; y += 28) {
    g.beginPath(); g.moveTo(-20, y); g.lineTo(CARD_W + 20, y + CARD_W * 0.45); g.stroke();
  }
  if (def.rarity === "legendary") { // warm halo behind the glyph
    const halo = g.createRadialGradient(CARD_W / 2, CARD_H * 0.47, 8, CARD_W / 2, CARD_H * 0.47, 118);
    halo.addColorStop(0, "rgba(255,201,65,0.22)");
    halo.addColorStop(1, "rgba(255,201,65,0)");
    g.fillStyle = halo;
    g.fillRect(0, 0, CARD_W, CARD_H);
  }
  g.restore();
  // rarity border — glow stroke + crisp inner line
  g.shadowColor = rar.hex; g.shadowBlur = 18;
  g.lineWidth = 8; g.strokeStyle = rar.hex;
  rr(g, 6, 6, CARD_W - 12, CARD_H - 12, 26); g.stroke();
  g.shadowBlur = 0;
  g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,0.32)";
  rr(g, 6, 6, CARD_W - 12, CARD_H - 12, 26); g.stroke();
  // family badge (top-left)
  g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.fillStyle = rar.hex;
  const badge = FAMILY_BADGE[def.family] ?? "CARD";
  g.font = "700 16px ui-monospace, monospace";
  const bw = g.measureText(badge).width + 20;
  rr(g, 22, 24, bw, 28, 8); g.fill();
  g.fillStyle = "#0b0c0e";
  g.fillText(badge, 32, 44);
  // cost pip (top-right) — gold ◈ ring
  g.strokeStyle = "#ffc941"; g.lineWidth = 3;
  g.beginPath(); g.arc(CARD_W - 40, 38, 17, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#ffc941";
  g.font = "700 16px ui-monospace, monospace";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(`◈${def.cost}`, CARD_W - 40, 39, 30);
  // glyph — the poster-master SYMBOL (site/powerup-art, the founder's
  // "cool power-up symbols like they would be on sports posters"): real
  // vector art — speed-line halo, chromatic misregistration, halftone
  // shade — rarity-lit via the glow ink. Drawn once per card, cached
  // (the texture cache above is unchanged). def.glyph stays as the
  // engine-canonical emoji fallback for non-canvas UIs.
  drawCardSymbol(g, def.id, {
    x: CARD_W / 2, y: CARD_H * 0.47, size: 158,
    glow: rar.hex,                        // the glow ink rides the rarity
  });
  // name plate
  const plateY = CARD_H - 92;
  g.fillStyle = "rgba(6,7,9,0.72)";
  rr(g, 20, plateY - 24, CARD_W - 40, 52, 12); g.fill();
  g.strokeStyle = rar.hex; g.lineWidth = 2; g.globalAlpha = 0.6;
  rr(g, 20, plateY - 24, CARD_W - 40, 52, 12); g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = "#e8eaed";
  g.font = "700 27px system-ui, sans-serif";
  g.fillText(def.name.toUpperCase(), CARD_W / 2, plateY + 3, CARD_W - 52);
  // rarity caption
  g.fillStyle = rar.hex;
  g.font = "700 16px ui-monospace, monospace";
  g.fillText(rar.label, CARD_W / 2, CARD_H - 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  tex.__rwfShared = true; // cached module-level — never let a host dispose it
  _frontCache.set(def.id, tex);
  return tex;
}

/* ═══════════════════════ shared geometry + materials ══════════════════ */
const CARD_X = 0.63, CARD_Y = 0.88;             // world-units card (63×88)
let _coreGeo = null, _faceGeo = null;
const _edgeMats = new Map();                    // rarity → MeshStandardMaterial

function roundedShape(w, h, r, inset = 0) {
  const s = new THREE.Shape();
  const x = -w / 2 + inset, y = -h / 2 + inset;
  const iw = w - inset * 2, ih = h - inset * 2;
  const ri = Math.max(0.012, r - inset);
  s.moveTo(x + ri, y);
  s.lineTo(x + iw - ri, y);
  s.absarc(x + iw - ri, y + ri, ri, -Math.PI / 2, 0, false);
  s.lineTo(x + iw, y + ih - ri);
  s.absarc(x + iw - ri, y + ih - ri, ri, 0, Math.PI / 2, false);
  s.lineTo(x + ri, y + ih);
  s.absarc(x + ri, y + ih - ri, ri, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + ri);
  s.absarc(x + ri, y + ri, ri, Math.PI, Math.PI * 1.5, false);
  return s;
}

function coreGeometry() {
  if (_coreGeo) return _coreGeo;
  const geo = new THREE.ExtrudeGeometry(roundedShape(CARD_X, CARD_Y, 0.075), {
    depth: 0.014, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.006, bevelSegments: 2, curveSegments: 6,
  });
  geo.translate(0, 0, -0.007); // centre the slab on z
  geo.__rwfShared = true;
  return (_coreGeo = geo);
}
function faceGeometry() {
  if (_faceGeo) return _faceGeo;
  const geo = new THREE.ShapeGeometry(roundedShape(CARD_X, CARD_Y, 0.075, 0.003), 6);
  geo.__rwfShared = true;
  return (_faceGeo = geo);
}
function edgeMaterial(rarity) {
  const hit = _edgeMats.get(rarity);
  if (hit) return hit;
  const rar = rarityOf(rarity);
  const col = new THREE.Color(rar.hex);
  const m = new THREE.MeshStandardMaterial({
    color: col.clone().multiplyScalar(0.30), // dark body through the bevel
    roughness: 0.42, metalness: 0.55,
    emissive: col, emissiveIntensity: rar.glow * 0.6,
  });
  m.__rwfShared = true;
  _edgeMats.set(rarity, m);
  return m;
}
const _faceMatCache = new Map(); // defId → MeshBasicMaterial (front)
function frontMaterial(def) {
  const hit = _faceMatCache.get(def.id);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({ map: cardFrontTexture(def) });
  m.__rwfShared = true;
  _faceMatCache.set(def.id, m);
  return m;
}
let _backMat = null;
function backMaterial() {
  if (_backMat) return _backMat;
  _backMat = new THREE.MeshBasicMaterial({ map: cardBackTexture() });
  _backMat.__rwfShared = true;
  return _backMat;
}

/* ═══════════════════════ easing ═══════════════════════════════════════ */
export const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
export const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const easeInQuad = (p) => p * p;

/* ═══════════════════════ makeCard — the API ═══════════════════════════ */
/**
 * makeCard(def, opts) → card handle
 *   def:  { id?, name, glyph, rarity, cost?, family? } — a DECK entry or ad-hoc
 *   opts: { scale, phase, faceCamera = true, scene }
 * States (all driven by update(dt, { camera, now })):
 *   idle float+tilt · hover lift+tilt-to-camera · flip (front↔back) ·
 *   deal (arc fly-in with spin) · play (fly to target, then onArrive) ·
 *   discard (gravity toss).
 */
export function makeCard(defIn, opts = {}) {
  const base = defIn?.id && DECK[defIn.id] ? DECK[defIn.id] : getDef(defIn?.id);
  const def = { ...base, ...defIn, id: base.id };
  const faceCamera = opts.faceCamera !== false;
  const phase = opts.phase ?? Math.random() * Math.PI * 2;
  const baseScale = opts.scale ?? 1;

  const group = new THREE.Group();  // layout node — the HOST positions this (fan slot)
  const pivot = new THREE.Group();  // animation node — bob / lift / deal-spin offsets
  group.add(pivot);
  group.name = `card3d-${def.id}`;

  const edgeMat = def.rarity === "legendary" ? edgeMaterial("legendary").clone() : edgeMaterial(def.rarity);
  const core = new THREE.Mesh(coreGeometry(), edgeMat);
  const front = new THREE.Mesh(faceGeometry(), frontMaterial(def));
  front.position.z = 0.0082;   // sits on the slab face; the bevel rims above it
  const back = new THREE.Mesh(faceGeometry(), backMaterial());
  back.position.z = -0.0082;
  back.rotation.y = Math.PI;
  pivot.add(core, front, back);
  group.scale.setScalar(baseScale);

  // ── animation state ───────────────────────────────────────────────────
  const st = {
    mode: "idle",            // idle | deal | play | discard | done
    hover: false,
    lift: 0,                 // tweened 0..1 → hover lift + swell
    tweens: [],
    tiltZ: 0,                // fan tilt (host sets via setTilt)
    vel: new THREE.Vector3(),// discard physics
    spin: 0,
  };

  function addTween(t) { st.tweens.push(t); }
  function runTweens(dt) {
    for (let i = st.tweens.length - 1; i >= 0; i--) {
      const tw = st.tweens[i];
      if (tw.delay > 0) { tw.delay -= dt; continue; }
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = tw.ease ? tw.ease(tw.t) : tw.t;
      tw.step(e);
      if (tw.t >= 1) { st.tweens.splice(i, 1); tw.done?.(); }
    }
  }

  /** hover — lift + swell, eased both ways (300-500ms family: 280ms) */
  function setHover(on) {
    if (st.hover === !!on) return;
    st.hover = !!on;
    const from = st.lift, to = on ? 1 : 0;
    addTween({ t: 0, dur: 0.28, ease: easeOutCubic, step: (e) => { st.lift = from + (to - from) * e; } });
  }

  /** flip front ↔ back — half-turn on Y (420ms, cubic in-out). Returns
      true when the flip ENDS showing the back. */
  function flip() {
    const from = pivot.rotation.y;
    const to = from + Math.PI;
    addTween({
      t: 0, dur: 0.42, ease: easeInOutCubic,
      step: (e) => { pivot.rotation.y = from + (to - from) * e; },
      done: () => { pivot.rotation.y = to % (Math.PI * 2); },
    });
    return Math.round(pivot.rotation.y / Math.PI) % 2 === 0;
  }

  /** face swap — setFace(id) shows another cached front; setFace(null)
      hides the front (back shows). Textures are cached — free. */
  function setFace(id) {
    if (id == null) { front.visible = false; return; }
    front.visible = true;
    front.material = frontMaterial(getDef(id));
  }

  /** DEAL — arc fly-in from a world anchor with a full spin (600ms).
      Call AFTER the host has slotted the group (layout position). */
  function deal(fromWorld, { dur = 0.6, delay = 0 } = {}) {
    st.mode = "deal";
    const parent = group.parent;
    // express the arc in the PARENT's space (the fan parent may be transformed)
    const localStart = parent ? parent.worldToLocal(fromWorld.clone()) : fromWorld.clone();
    const end = pivot.position.clone();        // where idle sits (usually 0,0,0)
    const ctrl = localStart.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 1.1, 0));
    pivot.position.copy(localStart);
    const spinFrom = pivot.rotation.y;
    addTween({
      t: 0, dur, delay, ease: easeOutCubic,
      step: (e) => {
        const a = localStart.clone().lerp(ctrl, e);
        const b = ctrl.clone().lerp(end, e);
        pivot.position.copy(a.lerp(b, e));   // quadratic-bezier arc
        pivot.rotation.y = spinFrom + e * Math.PI * 2;
      },
      done: () => {
        pivot.position.copy(end);
        pivot.rotation.y = spinFrom;
        st.mode = "idle";
      },
    });
  }

  /** PLAY — fly to a world target (ease-in, swell, spin); the group
      detaches to the SCENE for the flight. onArrive(group, def) → the
      host bursts + removes (the v3 course routes this to its confetti). */
  function play(targetWorld, { dur = 0.5, onArrive } = {}) {
    st.mode = "play";
    const root = opts.scene ?? findScene(group);
    const startW = group.getWorldPosition(new THREE.Vector3());
    if (group.parent) group.parent.remove(group);
    if (root) root.add(group);
    group.position.copy(startW);
    group.quaternion.identity();
    group.scale.setScalar(baseScale);
    const end = targetWorld.clone();
    const ctrl = startW.clone().lerp(end, 0.55).add(new THREE.Vector3(0, 0.9, 0));
    addTween({
      t: 0, dur, ease: easeInQuad,
      step: (e) => {
        const a = startW.clone().lerp(ctrl, e);
        const b = ctrl.clone().lerp(end, e);
        group.position.copy(a.lerp(b, e));
        pivot.rotation.y = e * Math.PI * 1.5;
        group.scale.setScalar(baseScale * (1 + 0.28 * e));
      },
      done: () => { onArrive?.(group, def); },
    });
    return def;
  }

  /** DISCARD — tossed aside with gravity, tumbling; hides when done. */
  function discard({ dir = 1 } = {}) {
    st.mode = "discard";
    st.vel.set(1.6 * dir, 2.4, 0.6 * dir);
    st.spin = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 4);
    addTween({
      t: 0, dur: 0.75, step: () => {}, // pure timer — physics runs in update
      done: () => { st.mode = "done"; group.visible = false; },
    });
  }

  /** per-frame drive — tweens, idle bob + fan tilt + face-the-camera,
      legendary shimmer. Camera-facing ONLY in idle (deal/play own the
      rotation); play/discard own their transforms entirely. */
  const _q = new THREE.Quaternion();
  const _qz = new THREE.Quaternion();
  const _eul = new THREE.Euler();
  function update(dt, { camera, now = 0 } = {}) {
    runTweens(dt);
    if (def.rarity === "legendary") { // slow shimmer — emissive pulse
      edgeMat.emissiveIntensity = 0.30 + 0.34 * (0.5 + 0.5 * Math.sin(now * 1.7 + phase));
    }
    if (st.mode === "play") return;
    if (st.mode === "discard") {
      st.vel.y -= 6.2 * dt;
      group.position.addScaledVector(st.vel, dt);
      pivot.rotation.x += st.spin * dt;
      pivot.rotation.z += st.spin * 0.6 * dt;
      return;
    }
    if (st.mode !== "idle") return; // deal: the tween owns everything
    // idle float + hover lift
    pivot.position.y =
      Math.sin(now * 2.1 + phase) * 0.055 * (1 - st.lift) +
      st.lift * 0.34;
    group.scale.setScalar(baseScale * (1 + st.lift * 0.14));
    // face the camera (tilt-to-camera), with the fan tilt + gentle sway
    if (faceCamera && camera) {
      _eul.set(0, 0, st.tiltZ + Math.sin(now * 1.35 + phase) * 0.055);
      _qz.setFromEuler(_eul);
      _q.copy(camera.quaternion).multiply(_qz);
      group.quaternion.slerp(_q, Math.min(1, 1 - Math.exp(-dt * 8)));
    }
  }

  const hitMeshes = [front, back, core];
  core.userData.cardId = front.userData.cardId = back.userData.cardId = def.id;
  core.userData.cardRef = front.userData.cardRef = back.userData.cardRef = null; // host sets this

  return {
    id: def.id, def, group, pivot, hitMeshes,
    get mode() { return st.mode; },
    get hovered() { return st.hover; },
    setHover, flip, setFace, deal, play, discard, update,
    setTilt(z) { st.tiltZ = z; },
    /** release anything THIS card privately owns (legendary edge clone) */
    dispose() {
      if (def.rarity === "legendary") edgeMat.dispose();
    },
  };
}

function findScene(obj) {
  let o = obj;
  while (o && !o.isScene) o = o.parent;
  return o;
}

/* ═══════════════════════ sparkle burst (confetti language) ════════════ */
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  _glowTex.__rwfShared = true;
  return _glowTex;
}

/** rarity-coloured burst at a world position — sparks fade over ~0.65s.
    Pass your own `sprites` array and step it with stepBursts(dt). */
export function burst(scene, pos, hex = "#ffc941", n = 16, sprites = []) {
  for (let i = 0; i < n; i++) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: new THREE.Color(hex), transparent: true,
      opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    spr.scale.setScalar(0.16);
    spr.position.copy(pos);
    const a = (i / n) * Math.PI * 2;
    const v = 2.2 + Math.random() * 1.6;
    scene.add(spr);
    const vel = new THREE.Vector3(Math.cos(a) * v, 1.4 + Math.random() * 1.8, Math.sin(a) * v);
    sprites.push({ spr, vel, t: 0, dur: 0.65 });
  }
  return sprites;
}

/** advance a burst list created by burst(); call from the host's loop */
export function stepBursts(sprites, dt) {
  for (let i = sprites.length - 1; i >= 0; i--) {
    const s = sprites[i];
    s.t += dt;
    const p = Math.min(1, s.t / s.dur);
    s.spr.position.addScaledVector(s.vel, dt);
    s.vel.y -= 2.2 * dt;
    s.spr.material.opacity = 0.95 * (1 - p);
    s.spr.scale.setScalar(0.16 * (1 - p * 0.6));
    if (p >= 1) {
      s.spr.material.dispose();
      s.spr.parent?.remove(s.spr);
      sprites.splice(i, 1);
    }
  }
}

/* ═══════════════════════ the deck demo (VAULT showcase) ═══════════════ */
/**
 * makeDeckDemo(host, opts) — the full 21-card deck fanned in a slow 3D
 * wheel. ONE renderer (lazy via ensure()/release() — the /avatars context
 * budget drives those), one shared animation tick.
 *   opts: { W, H, ids, spin }
 * → { ensure, release, tick(now, dt), setSpin, stats, cards, scene, camera }
 */
export function makeDeckDemo(host, { W = 340, H = 420, ids = DECK_IDS, spin = true } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 40);
  camera.position.set(0, 2.1, 3.4);
  camera.lookAt(0, 0.12, 0);
  scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x1a1206, 0.9));
  const key = new THREE.DirectionalLight(0xffd7a3, 2.2);
  key.position.set(-2.4, 3.4, 2.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x82d5ff, 0.9);
  rim.position.set(2.6, 1.6, -2.2);
  scene.add(rim);

  const wheel = new THREE.Group();
  wheel.name = "CardWheel";
  scene.add(wheel);
  const cards = [];
  const R = 1.78;
  ids.forEach((id, i) => {
    const card = makeCard(getDef(id), { scale: 0.92, phase: i * 0.7, faceCamera: false });
    const a = (i / ids.length) * Math.PI * 2;
    card.group.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
    card.group.rotation.y = a;           // face outward, radially
    card.pivot.rotation.x = -0.38;       // tilted back so faces catch the light
    wheel.add(card.group);
    cards.push(card);
  });
  wheel.rotation.x = 0.1;                // tip the whole wheel toward the camera

  let renderer = null, spinning = spin, renderMs = 0;
  function ensure() {
    if (renderer) return;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setSize(W, H);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.display = "block";
      host.appendChild(renderer.domElement);
    } catch { renderer = null; }
  }
  function release() {
    if (!renderer) return;
    renderer.dispose();
    if (renderer.getContext().getExtension("WEBGL_lose_context")) renderer.forceContextLoss?.();
    renderer.domElement.remove();
    renderer = null;
  }
  function tick(now, dt = 0.016) {
    if (!renderer) return;
    const t0 = performance.now();
    if (spinning) wheel.rotation.y += dt * 0.22;
    for (const c of cards) c.update(dt, { camera, now });
    renderer.render(scene, camera);
    renderMs = renderMs * 0.9 + (performance.now() - t0) * 0.1;
  }
  return {
    ensure, release, tick,
    setSpin(v) { spinning = !!v; },
    get spinning() { return spinning; },
    stats: () => ({ cards: cards.length, renderMs: +renderMs.toFixed(2), live: !!renderer }),
    gl: () => renderer?.getContext?.() ?? null, // for host context-budget valves
    cards,
    scene, camera,
  };
}
