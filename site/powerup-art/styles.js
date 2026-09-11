/* ═══════════════════════════════════════════════════════════════════════
   RWF POWER-UP ART · THE STYLE LIBRARY (7 named kits)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   Every symbol renders in 7 named art styles — the labelled-kit pattern
   from design/style-library + apps/styles. Each kit = a 5-colour palette
   + a frame() that paints a complete 512×512 sports poster:

     poster       THE MASTER — the sports-poster language (speed-line
                  halo, chromatic misregistration, halftone shade, thick
                  keyline). The default for 3D card faces + v4 chips.
     varsity      varsity badge — felt circle patch, chenille stitch
                  rings, college colours, star pips, blank banner.
     risograph    2-ink duotone print — misregistered layers, paper
                  grain, offset circle plate, heavy border.
     gold-etch    engraved gold on ink — hatch-line fields, filigree
                  corners, double rules.
     halftone     halftone comic — ben-day dot field, sticker-gap ink,
                  comic burst behind, heavy blacks.
     neon         neon arena — layered glow strokes on the dark arena,
                  floodlight beams, floor grid.
     boxing       vintage boxing poster — letterpress ink on aged paper,
                  double-print offset, rosette corners, star rows.

   Same CONstrained canvas API as symbols.js (see its header) — one code
   path renders canvas AND SVG. No fillText anywhere: art is text-free,
   fonts stay in the page layer.

   SIBLINGS: symbols.js (the 21 glyphs) · generate.mjs + svg-recorder.js
   + raster.html (the build) · README.md (the kit docs) · apps/powerups.
   ═══════════════════════════════════════════════════════════════════════ */
import { drawSymbol, burstRays, star, sparkle, circle, rr, ray } from "./symbols.js";

/* deterministic rng — committed assets must build byte-stable */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* batched halftone dot field — ONE path (SVG export stays compact) */
function dotField(g, x, y, w, h, step, r, color, alpha) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  for (let yy = y + step / 2, row = 0; yy < y + h; yy += step, row++) {
    const shift = row % 2 ? step / 2 : 0;                 // offset rows
    for (let xx = x + step / 2 + shift; xx < x + w; xx += step) {
      g.moveTo(xx + r, yy);
      g.arc(xx, yy, r, 0, Math.PI * 2);
    }
  }
  g.fill();
  g.restore();
}

/* paper-grain speckle (seeded — deterministic) */
function grain(g, x, y, w, h, n, color, alpha, rng) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const px = x + rng() * w, py = y + rng() * h, r = 0.6 + rng() * 1.7;
    g.moveTo(px + r, py);
    g.arc(px, py, r, 0, Math.PI * 2);
  }
  g.fill();
  g.restore();
}

/* speed-line ring behind the glyph (the poster star-burst) */
function speedRing(g, cx, cy, n, r0, r1, w, color, alpha, rot = 0.26) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = color;
  burstRays(g, cx, cy, n, r0, r1, w, { rot });
  g.restore();
}

/* double keyline frame */
function keylines(g, W, inset, wOut, colorOut, inset2, wIn, colorIn) {
  g.save();
  rr(g, inset, inset, W - inset * 2, W - inset * 2, W * 0.075);
  stroke(g, colorOut, wOut);
  rr(g, inset2, inset2, W - inset2 * 2, W - inset2 * 2, W * 0.055);
  stroke(g, colorIn, wIn);
  g.restore();
}
function stroke(g, c, w) { g.strokeStyle = c; g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round"; g.stroke(); }

/* corner rosettes (nested quarter arcs) — etching / boxing frames */
function rosettes(g, W, inset, reach, color, w) {
  g.save();
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = "round";
  const c = () => { for (const rad of reach) { g.beginPath(); g.arc(0, 0, rad, 0, Math.PI / 2); g.stroke(); } };
  g.save(); g.translate(inset, inset); c(); g.restore();
  g.save(); g.translate(W - inset, inset); g.scale(-1, 1); c(); g.restore();
  g.save(); g.translate(W - inset, W - inset); g.scale(-1, -1); c(); g.restore();
  g.save(); g.translate(inset, W - inset); g.scale(1, -1); c(); g.restore();
  g.restore();
}

/* star row (boxing poster ornament) */
function starRow(g, W, y, n, r, color) {
  g.save();
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = W / 2 + (i - (n - 1) / 2) * (r * 3.4);
    star(g, x, y, 5, r, r * 0.44);
    g.fill();
  }
  g.restore();
}

/* ═══════════════════════════ THE KITS ════════════════════════════════ */
export const STYLES = [

  /* ── 1 · POSTER — the master (cards3d faces + v4 chips) ───────────── */
  {
    id: "poster",
    name: "Poster",
    tagline: "the house style",
    desc: "The master sports-poster treatment: speed-line halo, chromatic misregistration, halftone shade, thick keyline. What the 3D cards and app chips ship with.",
    palette: { deep: "#070d18", paper: "#13213a", ink: "#f2e9d8", accent: "#ffc941", glow: "#7cc4ff" },
    frame(g, W, P, id) {
      // arena wall + panel
      const grad = g.createLinearGradient(0, 0, 0, W);
      grad.addColorStop(0, P.deep);
      grad.addColorStop(1, "#0b1424");
      g.fillStyle = grad; g.fillRect(0, 0, W, W);
      g.globalAlpha = 0.5; g.fillStyle = P.paper; g.fillRect(0, 0, W, W); g.globalAlpha = 1;
      const vg = g.createRadialGradient(W / 2, W * 0.42, W * 0.1, W / 2, W * 0.42, W * 0.75);
      vg.addColorStop(0, "rgba(10,17,32,0)");
      vg.addColorStop(1, "rgba(5,9,17,0.55)");
      g.fillStyle = vg; g.fillRect(0, 0, W, W);
      speedRing(g, W / 2, W / 2, 16, W * 0.21, W * 0.4, W * 0.02, P.accent, 0.13);
      dotField(g, 0, W * 0.72, W, W * 0.28, W * 0.045, W * 0.011, P.glow, 0.14);
      drawSymbol(g, id, { x: W / 2, y: W * 0.46, size: W * 0.34, palette: { ...P, paper: P.paper } });
      g.save();
      g.translate(W / 2, W * 0.46);
      g.globalAlpha = 0.9;
      circle(g, 0, 0, W * 0.262); stroke(g, P.accent, W * 0.008);
      g.restore();
      keylines(g, W, W * 0.045, W * 0.016, P.accent, W * 0.062, W * 0.004, "rgba(242,233,216,0.5)");
    },
  },

  /* ── 2 · VARSITY BADGE — the chenille patch ───────────────────────── */
  {
    id: "varsity",
    name: "Varsity Badge",
    tagline: "stitched felt patch",
    desc: "College colours on a felt circle: chenille stitch rings, dashed chain-stitch border, star pips and a blank winner's banner. Warm, earned, team-spirit.",
    palette: { deep: "#0f1c14", paper: "#f3ead7", ink: "#1b4634", accent: "#e8b23a", glow: "#b03a36" },
    frame(g, W, P, id) {
      g.fillStyle = P.deep; g.fillRect(0, 0, W, W);
      g.globalAlpha = 0.35; g.fillStyle = "#1a2a1e"; g.fillRect(0, 0, W, W); g.globalAlpha = 1;
      const cx = W / 2, cy = W * 0.47, R = W * 0.34;
      // patch drop shadow
      g.globalAlpha = 0.5; g.fillStyle = "#060a07";
      circle(g, cx + W * 0.012, cy + W * 0.016, R); g.fill();
      g.globalAlpha = 1;
      // felt ground
      circle(g, cx, cy, R); g.fillStyle = P.paper; g.fill();
      circle(g, cx, cy, R); stroke(g, P.ink, W * 0.012);
      // chenille texture — fuzzy radial short stitches
      g.save();
      g.strokeStyle = "rgba(27,70,52,0.16)"; g.lineWidth = W * 0.005; g.lineCap = "round";
      const rng = mulberry32(7);
      for (let i = 0; i < 700; i++) {
        const a = rng() * Math.PI * 2, r = rng() * R * 0.97;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        g.lineTo(cx + Math.cos(a) * (r + W * 0.008), cy + Math.sin(a) * (r + W * 0.008));
        g.stroke();
      }
      g.restore();
      // chain-stitch rings (dashed)
      g.save();
      stroke(g, P.ink, W * 0.009);
      g.setLineDash([W * 0.022, W * 0.016]);
      circle(g, cx, cy, R - W * 0.028); g.stroke();
      circle(g, cx, cy, R - W * 0.058); g.stroke();
      g.setLineDash([]);
      g.restore();
      // inner disc for the glyph
      circle(g, cx, cy, R - W * 0.085); g.fillStyle = "rgba(232,178,58,0.2)"; g.fill();
      drawSymbol(g, id, { x: cx, y: cy, size: W * 0.3, palette: P });
      // star pips (varsity letters)
      g.fillStyle = P.accent;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.42;
        star(g, cx + Math.cos(a) * (R - W * 0.045), cy + Math.sin(a) * (R - W * 0.045), 5, W * 0.018, W * 0.008);
        g.fill();
      }
      // blank banner ribbon
      g.save();
      g.translate(cx, W * 0.87);
      g.beginPath();
      g.moveTo(-W * 0.26, 0); g.lineTo(W * 0.26, 0); g.lineTo(W * 0.22, W * 0.052); g.lineTo(-W * 0.22, W * 0.052);
      g.closePath(); g.fillStyle = P.accent; g.fill();
      g.closePath(); stroke(g, P.ink, W * 0.006);
      g.beginPath(); g.moveTo(-W * 0.26, 0); g.lineTo(-W * 0.30, -W * 0.03); g.lineTo(-W * 0.24, 0.001); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(W * 0.26, 0); g.lineTo(W * 0.30, -W * 0.03); g.lineTo(W * 0.24, 0.001); g.closePath(); g.fill();
      g.restore();
      keylines(g, W, W * 0.035, W * 0.012, P.paper, W * 0.05, W * 0.004, P.accent);
    },
  },

  /* ── 3 · RISOGRAPH — the 2-ink duotone print ──────────────────────── */
  {
    id: "risograph",
    name: "Risograph",
    tagline: "two-ink print run",
    desc: "Riso blue + alarm red on cream, printed a beat out of register with real paper grain. The zine-shop look — punk, tactile, very now.",
    palette: { deep: "#e9e1cd", paper: "#f6f1e3", ink: "#2b4a9b", accent: "#ff5346", glow: "#1d3578" },
    frame(g, W, P, id) {
      g.fillStyle = P.paper; g.fillRect(0, 0, W, W);
      const rng = mulberry32(21);
      grain(g, 0, 0, W, W, 900, "#b9ae94", 0.5, rng);
      // offset plate circle (the second drum)
      g.save();
      g.globalAlpha = 0.3;
      circle(g, W * 0.52, W * 0.48, W * 0.36); g.fillStyle = P.accent; g.fill();
      g.globalAlpha = 0.25;
      circle(g, W * 0.47, W * 0.52, W * 0.36); g.fillStyle = P.ink; g.fill();
      g.restore();
      speedRing(g, W / 2, W * 0.46, 12, W * 0.24, W * 0.38, W * 0.024, P.accent, 0.4);
      // misregistered passes — red drum low, blue drum high
      drawSymbol(g, id, { x: W / 2 + W * 0.012, y: W * 0.46 + W * 0.01, size: W * 0.34, palette: { ...P, ink: P.accent, accent: P.accent, glow: P.accent, paper: P.paper }, alpha: 0.82 });
      drawSymbol(g, id, { x: W / 2 - W * 0.008, y: W * 0.46 - W * 0.007, size: W * 0.34, palette: { ...P, paper: P.paper }, alpha: 0.95 });
      dotField(g, W * 0.06, W * 0.78, W * 0.88, W * 0.14, W * 0.036, W * 0.009, P.ink, 0.32);
      // heavy print border (slightly askew double frame)
      keylines(g, W, W * 0.042, W * 0.014, P.ink, W * 0.058, W * 0.005, P.accent);
      grain(g, 0, 0, W, W, 260, "#f6f1e3", 0.5, rng);
    },
  },

  /* ── 4 · GOLD ETCHING — engraved lines on ink ─────────────────────── */
  {
    id: "gold-etch",
    name: "Gold Etching",
    tagline: "engraved on ink",
    desc: "The trophy-room plate: gold linework engraved into deep ink, hatch-shaded fields, filigree corners and double rules. Museum-grade flex.",
    palette: { deep: "#131009", paper: "#1b1710", ink: "#d9b45c", accent: "#96742f", glow: "#f6e3a8" },
    frame(g, W, P, id) {
      const grad = g.createLinearGradient(0, 0, W, W);
      grad.addColorStop(0, "#171309"); grad.addColorStop(0.5, P.paper); grad.addColorStop(1, "#0f0c06");
      g.fillStyle = grad; g.fillRect(0, 0, W, W);
      // engraved hatch field
      g.save();
      g.globalAlpha = 0.13; stroke(g, P.ink, 1.4);
      for (let d = -W; d < W * 2; d += W * 0.022) {
        g.beginPath(); g.moveTo(d, 0); g.lineTo(d - W, W); g.stroke();
      }
      g.restore();
      // radial hatch burst behind the glyph
      g.save();
      g.globalAlpha = 0.22; stroke(g, P.accent, 1.6);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        g.beginPath();
        g.moveTo(W / 2 + Math.cos(a) * W * 0.18, W * 0.46 + Math.sin(a) * W * 0.18);
        g.lineTo(W / 2 + Math.cos(a) * W * 0.3, W * 0.46 + Math.sin(a) * W * 0.3);
        g.stroke();
      }
      g.restore();
      // engraved plate under the glyph (separates the linework from the field)
      g.save();
      g.globalAlpha = 0.12; circle(g, W / 2, W * 0.46, W * 0.27); g.fillStyle = P.ink; g.fill();
      g.globalAlpha = 0.85; circle(g, W / 2, W * 0.46, W * 0.27); stroke(g, P.accent, W * 0.005);
      g.restore();
      // the glyph as engraved gold: ink pass, dim repeat-etch, highlight pass
      drawSymbol(g, id, { x: W / 2, y: W * 0.46, size: W * 0.34, palette: { ...P, paper: P.paper } });
      drawSymbol(g, id, { x: W / 2, y: W * 0.46, size: W * 0.34, palette: { ...P, ink: P.accent, accent: P.accent, glow: P.accent, paper: "rgba(0,0,0,0)" }, alpha: 0.45, scale: 0.985 });
      drawSymbol(g, id, { x: W / 2, y: W * 0.46, size: W * 0.34, palette: { ...P, ink: P.glow, accent: P.glow, glow: P.glow, paper: "rgba(0,0,0,0)" }, alpha: 0.28, scale: 0.955 });
      dotField(g, 0, W * 0.8, W, W * 0.2, W * 0.028, W * 0.006, P.accent, 0.3);
      // double rules + filigree
      keylines(g, W, W * 0.038, W * 0.012, P.accent, W * 0.054, W * 0.004, P.ink);
      rosettes(g, W, W * 0.075, [W * 0.032, W * 0.05, W * 0.068], P.accent, W * 0.006);
      starRow(g, W, W * 0.095, 3, W * 0.011, P.ink);
      starRow(g, W, W * 0.905, 3, W * 0.011, P.ink);
    },
  },

  /* ── 5 · HALFTONE COMIC — ben-day dots and heavy blacks ───────────── */
  {
    id: "halftone",
    name: "Halftone Comic",
    tagline: "ben-day action print",
    desc: "Silver-age comic panel: ben-day dot field, the glyph inked with a sticker-gap outline over a comic burst, heavy blacks, one alarm-yellow spot.",
    palette: { deep: "#dcd5c2", paper: "#f8f4e6", ink: "#151412", accent: "#ffd23f", glow: "#e0453a" },
    frame(g, W, P, id) {
      g.fillStyle = P.paper; g.fillRect(0, 0, W, W);
      dotField(g, 0, 0, W, W, W * 0.043, W * 0.008, "#c9bfa4", 0.5);
      // comic burst polygon behind the glyph
      g.save();
      g.translate(W / 2, W * 0.45);
      g.fillStyle = P.accent;
      star(g, 0, 0, 14, W * 0.4, W * 0.31, -Math.PI / 2 + 0.1); g.fill();
      g.closePath(); stroke(g, P.ink, W * 0.008);
      g.restore();
      // sticker gap + ink pass
      drawSymbol(g, id, { x: W / 2, y: W * 0.45, size: W * 0.35, palette: { ...P, ink: P.paper, accent: P.paper, glow: P.paper, deep: P.paper, paper: P.paper }, scale: 1.12 });
      drawSymbol(g, id, { x: W / 2 - W * 0.004, y: W * 0.45 - W * 0.004, size: W * 0.35, palette: P });
      // ben-day shade bottom-right of the burst
      dotField(g, W * 0.55, W * 0.6, W * 0.4, W * 0.34, W * 0.032, W * 0.0095, P.glow, 0.75);
      // panel frame — heavy black, print-off-register red slip
      keylines(g, W, W * 0.035, W * 0.018, P.ink, W * 0.055, W * 0.005, P.glow);
      dotField(g, 0, 0, W * 0.12, W, W * 0.05, W * 0.01, P.ink, 0.25);
    },
  },

  /* ── 6 · NEON ARENA — glow strokes on the dark ────────────────────── */
  {
    id: "neon",
    name: "Neon Arena",
    tagline: "lights on the dark",
    desc: "The 11pm arena: floodlight beams, floor grid, and the glyph burning in layered neon — wide dim strokes under a hot white core.",
    palette: { deep: "#05070d", paper: "#0a1120", ink: "#49e0d0", accent: "#ff5f9e", glow: "#eaf8ff" },
    frame(g, W, P, id) {
      g.fillStyle = P.deep; g.fillRect(0, 0, W, W);
      // floodlight beams (kept dim — the dark arena must stay dark)
      g.save();
      g.globalAlpha = 0.05; g.fillStyle = P.glow;
      g.beginPath(); g.moveTo(-W * 0.05, -W * 0.05); g.lineTo(W * 0.42, W); g.lineTo(W * 0.05, W); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(W * 1.05, -W * 0.05); g.lineTo(W * 0.58, W); g.lineTo(W * 0.95, W); g.closePath(); g.fill();
      g.restore();
      // floor grid in perspective
      g.save();
      g.globalAlpha = 0.3; stroke(g, P.ink, 1.6);
      for (let i = 0; i <= 6; i++) {
        const x = (i / 6) * W;
        g.beginPath(); g.moveTo(W * 0.5 + (x - W * 0.5) * 0.25, W * 0.62);
        g.lineTo(x, W); g.stroke();
      }
      for (let i = 1; i <= 4; i++) {
        const y = W * 0.62 + (W * 0.38) * (i / 4) ** 1.7;
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      }
      g.restore();
      speedRing(g, W / 2, W * 0.45, 14, W * 0.2, W * 0.37, W * 0.016, P.accent, 0.18);
      // the neon glyph: faint wide halos then the hot core
      drawSymbol(g, id, { x: W / 2, y: W * 0.45, size: W * 0.34, palette: { ...P, ink: P.ink, accent: P.ink, glow: P.ink, paper: P.paper }, scale: 1.2, alpha: 0.08 });
      drawSymbol(g, id, { x: W / 2, y: W * 0.45, size: W * 0.34, palette: { ...P, ink: P.accent, accent: P.accent, glow: P.accent, paper: P.paper }, scale: 1.09, alpha: 0.14 });
      drawSymbol(g, id, { x: W / 2, y: W * 0.45, size: W * 0.34, palette: { ...P, paper: P.paper, glow: P.glow } });
      // vignette pulls the arena edges back into the dark
      const nvg = g.createRadialGradient(W / 2, W * 0.45, W * 0.22, W / 2, W * 0.45, W * 0.74);
      nvg.addColorStop(0, "rgba(5,7,13,0)");
      nvg.addColorStop(1, "rgba(3,5,9,0.55)");
      g.fillStyle = nvg; g.fillRect(0, 0, W, W);
      // hot edge ticks
      g.save();
      g.globalAlpha = 0.8;
      for (let i = 0; i < 4; i++) {
        g.save(); g.translate(W / 2, W * 0.45); g.rotate((i * Math.PI) / 2);
        g.beginPath(); g.moveTo(0, -W * 0.27); g.lineTo(0, -W * 0.245); stroke(g, P.glow, W * 0.007);
        g.restore();
      }
      g.restore();
      keylines(g, W, W * 0.042, W * 0.01, P.ink, W * 0.056, W * 0.003, "rgba(234,248,255,0.5)");
    },
  },

  /* ── 7 · VINTAGE BOXING POSTER — letterpress on aged paper ────────── */
  {
    id: "boxing",
    name: "Boxing Poster",
    tagline: "aged letterpress",
    desc: "Turn-of-the-century fight bill: letterpress ink double-struck on aged paper, oxblood accents, rosette corners, star rows, honest wear.",
    palette: { deep: "#e3d5b4", paper: "#f0e5c9", ink: "#282019", accent: "#8f2f2a", glow: "#a67c2e" },
    frame(g, W, P, id) {
      const grad = g.createRadialGradient(W / 2, W * 0.4, W * 0.2, W / 2, W * 0.5, W * 0.8);
      grad.addColorStop(0, P.paper); grad.addColorStop(1, P.deep);
      g.fillStyle = grad; g.fillRect(0, 0, W, W);
      const rng = mulberry32(33);
      // age blotches
      g.save();
      for (let i = 0; i < 12; i++) {
        g.globalAlpha = 0.05 + rng() * 0.05;
        circle(g, rng() * W, rng() * W, W * (0.05 + rng() * 0.12));
        g.fillStyle = "#8a7448"; g.fill();
      }
      g.restore();
      starRow(g, W, W * 0.09, 5, W * 0.014, P.ink);
      // double-print offset (the press slipped)
      drawSymbol(g, id, { x: W / 2 + W * 0.006, y: W * 0.47 + W * 0.005, size: W * 0.34, palette: { ...P, ink: P.accent, glow: P.accent, paper: P.paper }, alpha: 0.55 });
      drawSymbol(g, id, { x: W / 2, y: W * 0.47, size: W * 0.34, palette: P });
      dotField(g, 0, W * 0.82, W, W * 0.18, W * 0.03, W * 0.007, P.ink, 0.18);
      // rules — thick/thin pair + rosettes + star row
      keylines(g, W, W * 0.03, W * 0.016, P.ink, W * 0.044, W * 0.004, P.accent);
      rosettes(g, W, W * 0.062, [W * 0.026, W * 0.042], P.accent, W * 0.007);
      starRow(g, W, W * 0.91, 5, W * 0.014, P.ink);
      grain(g, 0, 0, W, W, 700, "#6d5b35", 0.35, rng);
    },
  },
];

export const STYLE_IDS = STYLES.map((s) => s.id);
export const styleById = (id) => STYLES.find((s) => s.id === id) ?? STYLES[0];

/* Render a full poster of `styleId` into g at size×size (top-left 0,0). */
export function drawPoster(g, styleId, cardId, size = 512) {
  const S = styleById(styleId);
  g.save();
  g.translate(0, 0);
  S.frame(g, size, S.palette, cardId);
  g.restore();
}

/* ═══════════════════════ THE CARD BACK ════════════════════════════════
   One back per style — the deck's reverse. Text-free: a central diamond
   medallion, four sparkles, rosette corners and the kit's keylines. The
   review page + deck sheet flip cards onto this. ═════════════════════ */
export function drawBack(g, styleId, size = 512) {
  const S = styleById(styleId);
  const P = S.palette;
  const W = size;
  g.save();
  // the kit's own ground treatment (reuse the frame's background by
  // painting its base layers, minus the glyph — frames take "__back" as
  // the card id which no glyph matches, so drawSymbol falls through to
  // a medallion-appropriate blank; simpler: paint a shared ornament)
  g.fillStyle = P.deep; g.fillRect(0, 0, W, W);
  g.globalAlpha = 0.35; g.fillStyle = P.paper; g.fillRect(0, 0, W, W); g.globalAlpha = 1;
  speedRing(g, W / 2, W / 2, 16, W * 0.18, W * 0.42, W * 0.012, P.accent, 0.2);
  // central medallion
  g.save();
  g.translate(W / 2, W / 2);
  g.fillStyle = P.ink;
  g.beginPath();
  g.moveTo(0, -W * 0.16); g.lineTo(W * 0.16, 0); g.lineTo(0, W * 0.16); g.lineTo(-W * 0.16, 0);
  g.closePath(); g.fill();
  g.fillStyle = P.accent;
  g.beginPath();
  g.moveTo(0, -W * 0.1); g.lineTo(W * 0.1, 0); g.lineTo(0, W * 0.1); g.lineTo(-W * 0.1, 0);
  g.closePath(); g.fill();
  g.fillStyle = P.glow;
  sparkle(g, 0, 0, W * 0.045); g.fill();
  // four satellite sparkles
  for (let i = 0; i < 4; i++) {
    g.save(); g.rotate((i * Math.PI) / 2);
    sparkle(g, 0, -W * 0.24, W * 0.022); g.fill();
    g.restore();
  }
  g.restore();
  keylines(g, W, W * 0.045, W * 0.014, P.accent, W * 0.062, W * 0.004, P.ink);
  rosettes(g, W, W * 0.09, [W * 0.03, W * 0.046], P.accent, W * 0.005);
  g.restore();
}
