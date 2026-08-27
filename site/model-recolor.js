// site/model-recolor.js — colourway system for the rigged game models.
//
// The orc GLBs are painted from a 256×256 PALETTE texture: a 16×16 grid of
// 16px flat swatches (a hue×sat wheel + greyscale ramp). The meshes' UVs only
// touch ~11 cells — measured with scripts/avatars/uv_map.py:
//
//   skin main   cell (11,10) #77974b   skin shadow (11,11) #657b42
//   skin accent cell (11,9)  #908d41   lips/inner ear (12,2) #d3a7c4
//   leather     cell (13,13) #382510   (a 32×16 block — straps/belt)
//   pant olive  cell (12,13) #3a351f   pant black (12,14) #191909
//   grey kit    cell (11,15) #444444   dark reds (15,12) #431716, (15,11) #651c21
//   eyes/tusks  cell (4,15)  #bbbbbb   (kept — identity detail)
//
// ROUTE A — TEXTURE REMAP (orcs): clone the palette texture onto a canvas and
// repaint the swatches by EXACT colour match (flat cells make this exact, and
// colour-matching automatically covers the double-size blocks). The variant
// keeps the game's flat art style, just re-inked — colour = identity, exactly
// like the goblin game's red Chief / purple Queen / green grunts.
//
// ROUTE B — FALLBACK TINT: if a model has no texture, tint material.color
// per mesh (cruder but reliable).
//
// ROUTE C — POSTERISE (Soldier): photo-diffuse → nearest of a small flat
// palette ("realistic proportions, game art"). UV-correct by construction.

import * as THREE from 'three';

// ── palette cells (from-colours measured from the GLB's embedded PNG) ───────
const CELLS = {
  skinMain:   [119, 151, 75],
  skinShadow: [101, 123, 66],
  skinAccent: [144, 141, 65],
  lips:       [211, 167, 196],
  leather:    [56, 37, 16],
  pantOlive:  [58, 53, 31],
  pantBlack:  [25, 25, 9],
  greyKit:    [68, 68, 68],
  red1:       [67, 23, 22],
  red2:       [101, 28, 33],
};

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const shade = (rgb, f) => rgb.map((c) => Math.min(255, Math.max(0, Math.round(c * f))));

// ── colourways ───────────────────────────────────────────────────────────────
// `skin` re-inks the three skin swatches (main / shadow×0.76 / accent×1.18);
// everything else (leather, pants, eyes) stays = the model keeps its outfit.
export const COLORWAYS = {
  couch:    { name: 'Couch — amber',    skin: '#ffb020' }, // rookie→couch amber
  casual:   { name: 'Casual — sky',     skin: '#6ec1ff' }, // casual sky
  fit:      { name: 'Fit — lime',       skin: '#c6f32e' }, // fit lime
  athlete:  { name: 'Athlete — coral',  skin: '#ff5c38' }, // athlete coral
  human:    { name: 'Human palette',    skin: '#e9c49b', lips: '#c98a7a' },
};

function buildReplacements(def) {
  const skin = hexToRgb(def.skin);
  const out = [
    { from: CELLS.skinMain, to: skin },
    { from: CELLS.skinShadow, to: shade(skin, 0.76) },
    { from: CELLS.skinAccent, to: shade(skin, 1.18) },
  ];
  if (def.lips) out.push({ from: CELLS.lips, to: hexToRgb(def.lips) });
  return out;
}

// ── texture helpers ──────────────────────────────────────────────────────────
function canvasFromTexture(texture) {
  const img = texture.image;
  if (!img || !(img.width > 0)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return { canvas, ctx };
}

function textureFromCanvas(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; // palette colours are authoring colours
  tex.flipY = false;                     // glTF UV convention (v=0 at top)
  tex.needsUpdate = true;
  return tex;
}

/** ROUTE A: repaint exact swatch colours on a clone of the texture */
function repaintTexture(texture, replacements) {
  const c = canvasFromTexture(texture);
  if (!c) return null;
  const data = c.ctx.getImageData(0, 0, c.canvas.width, c.canvas.height);
  const px = data.data;
  for (const r of replacements) {
    const [fr, fg, fb] = r.from, [tr, tg, tb] = r.to;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] === fr && px[i + 1] === fg && px[i + 2] === fb) {
        px[i] = tr; px[i + 1] = tg; px[i + 2] = tb;
      }
    }
  }
  c.ctx.putImageData(data, 0, 0);
  return textureFromCanvas(c.canvas);
}

/** ROUTE C: snap every texel to the nearest flat palette colour */
function posteriseTexture(texture, palette) {
  const c = canvasFromTexture(texture);
  if (!c) return null;
  const data = c.ctx.getImageData(0, 0, c.canvas.width, c.canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    let best = 0, bestD = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const dr = px[i] - palette[p][0], dg = px[i + 1] - palette[p][1], db = px[i + 2] - palette[p][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = p; }
    }
    px[i] = palette[best][0]; px[i + 1] = palette[best][1]; px[i + 2] = palette[best][2];
  }
  c.ctx.putImageData(data, 0, 0);
  return textureFromCanvas(c.canvas);
}

// ── public API ───────────────────────────────────────────────────────────────

/** Apply a named colourway to a loaded model scene. Returns true if the
 *  texture route was used, false if it fell back to per-mesh tinting. */
export function applyColorway(root, id) {
  const def = COLORWAYS[id];
  if (!def) return false;
  const repl = buildReplacements(def);
  let textured = false;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (o.material.map) {
      const mat = o.material.clone();
      const tex = repaintTexture(o.material.map, repl);
      if (tex) { mat.map = tex; o.material = mat; textured = true; }
    }
  });
  if (!textured) fallbackTint(root, def);
  return textured;
}

/** ROUTE B: per-mesh flat tint (no texture) — Body/Head take the colourway
 *  skin, everything else keeps its material. */
function fallbackTint(root, def) {
  const skin = new THREE.Color(def.skin);
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const name = (o.name || '').toLowerCase();
    if (name.includes('body') || name.includes('head')) {
      const mat = o.material.clone();
      mat.color.copy(skin);
      o.material = mat;
    }
  });
}

/** Soldier palette treatment: posterise the photo diffuse to flat game tones
 *  (skin / olive kit / charcoal gear / brown boots / steel / hair / black). */
export function applySoldierPalette(root) {
  const PAL = [
    [216, 168, 126], // skin
    [86, 96, 62],    // olive kit
    [35, 38, 43],    // charcoal gear
    [74, 54, 38],    // boots / leather
    [122, 128, 138], // steel
    [30, 24, 18],    // hair / dark
    [12, 12, 14],    // black
  ].map((c) => c);
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mat = o.material.clone();
    if (o.material.map) {
      const tex = posteriseTexture(o.material.map, PAL);
      if (tex) mat.map = tex;
    }
    mat.metalness = 0;
    mat.roughness = 1;
    if (mat.color) mat.color.set(0xffffff); // neutralise the 0.8 grey factor
    o.material = mat;
  });
}
