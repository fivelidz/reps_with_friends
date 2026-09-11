/* ═══════════════════════════════════════════════════════════════════════
   RWF POWER-UP ART · THE SYMBOL STUDIO (21 procedural sports-poster glyphs)
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   The founder brief: "format of the powerups should be better — cool
   power-up symbols like they would be on sports posters." So every card
   gets a real SYMBOL — a bold vector glyph built from canvas paths in the
   sports-poster language (star-bursts, speed lines, thick keylines,
   halftone shading, offset print misregistration) — NOT an emoji.

   CONstrained DRAW API — every glyph uses only ops the SVG recorder
   (svg-recorder.js) understands, so the same code renders to:
     · <canvas>   (cards3d.js faces, the v4 chips, the poster master)
     · <svg>      (the committed gen/ assets — crisp at any print size)
   Allowed: save/restore/translate/rotate/scale/beginPath/moveTo/lineTo/
   arc/quadraticCurveTo/bezierCurveTo/closePath/fill/stroke/clip/fillRect/
   strokeRect/setLineDash + fillStyle/strokeStyle/lineWidth/lineCap/
   lineJoin/globalAlpha + linear/radial gradients. NO fillText, NO
   shadowBlur (glow = layered strokes), NO ellipse() (use scale+arc),
   NO Path2D, NO drawImage, NO arcTo.

   SPACE — each glyph draws in a 100×100 box, centre (50,50), y-down.
   Callers scale/translate via drawSymbol() / drawCardSymbol().

   PALETTE — P = { ink, accent, glow, paper, deep }:
     ink    the hero colour (bold fills, key shapes)
     accent the second print colour (rays, sub-shapes, misreg layer)
     glow   the hot third colour (stars, eyes, sparks)
     paper  background/card colour (cut-outs, highlights)
     deep   darkest shade (shadows, cracks)

   SIBLINGS: styles.js (the 6 style kits + poster master) ·
   generate.mjs + svg-recorder.js + raster.html (the build script that
   renders gen/) · apps/powerups (the founder review page at /powerups).
   ═══════════════════════════════════════════════════════════════════════ */

/* ── tiny path toolbox (shared by every glyph; recorder-safe) ────────── */
function poly(g, pts, close = true) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
}
export function star(g, cx, cy, spikes, rOut, rIn, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = rot + (i * Math.PI) / spikes;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.closePath();
}
export function sparkle(g, cx, cy, r, rot = -Math.PI / 2) {   // 4-point twinkle
  star(g, cx, cy, 4, r, r * 0.32, rot);
}
/* tapering burst ray (a thin wedge) — the poster speed-line */
export function ray(g, cx, cy, a, r0, r1, w0, w1 = w0 * 0.3) {
  const ca = Math.cos(a), sa = Math.sin(a), pa = a + Math.PI / 2;
  const px = Math.cos(pa), py = Math.sin(pa);
  g.beginPath();
  g.moveTo(cx + ca * r0 + px * w0, cy + sa * r0 + py * w0);
  g.lineTo(cx + ca * r1 + px * w1, cy + sa * r1 + py * w1);
  g.lineTo(cx + ca * r1 - px * w1, cy + sa * r1 - py * w1);
  g.lineTo(cx + ca * r0 - px * w0, cy + sa * r0 - py * w0);
  g.closePath();
}
/* radiating speed-line ring — the star-burst background */
export function burstRays(g, cx, cy, n, r0, r1, w, opts = {}) {
  const skip = opts.skip ?? [];
  for (let i = 0; i < n; i++) {
    if (skip.includes(i)) continue;
    const a = (i / n) * Math.PI * 2 + (opts.rot ?? 0);
    ray(g, cx, cy, a, r0, r1, i % 2 ? w * 0.55 : w);
    g.fill();
  }
}
export function rr(g, x, y, w, h, r) {                        // rounded-rect path
  g.beginPath();
  g.moveTo(x + r, y);
  g.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  g.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  g.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  g.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  g.closePath();
}
export function circle(g, cx, cy, r) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); }
function fill(g, c) { g.fillStyle = c; g.fill(); }
function stroke(g, c, w, cap = "round") {
  g.strokeStyle = c; g.lineWidth = w; g.lineCap = cap; g.lineJoin = "round"; g.stroke();
}
/* the heraldic heater shield — shared by shield / shield_bash */
function shieldPath(g, s = 1, cx = 50, cy = 50) {
  const p = [ [50, 8], [88, 17], [88, 46], [50, 93], [12, 46], [12, 17] ];
  const curve = [ // bezier mirrors of the straight outline
    ["M", 50, 8],
    ["C", 62, 13, 75, 16, 88, 17], ["L", 88, 46],
    ["C", 88, 66, 73, 84, 50, 93],
    ["C", 27, 84, 12, 66, 12, 46], ["L", 12, 17],
    ["C", 25, 16, 38, 13, 50, 8], ["Z"],
  ];
  g.save();
  g.translate(cx, cy); g.scale(s, s); g.translate(-50, -50);
  g.beginPath();
  for (const seg of curve) {
    if (seg[0] === "M") g.moveTo(seg[1], seg[2]);
    else if (seg[0] === "C") g.bezierCurveTo(seg[1], seg[2], seg[3], seg[4], seg[5], seg[6]);
    else if (seg[0] === "L") g.lineTo(seg[1], seg[2]);
    else g.closePath();
  }
  g.restore();
}
/* fist (mitt) — shared by assist / training_partners */
function fist(g, cx, cy, r, dir = 1) {
  g.save();
  g.translate(cx, cy);
  g.scale(dir, 1);
  rr(g, -r, -r * 0.82, r * 1.9, r * 1.64, r * 0.62); g.fill();
  // knuckle bumps on the leading edge
  for (const k of [-0.45, 0, 0.45]) circle(g, r * 0.86, k * r, r * 0.3), g.fill();
  // thumb wrap
  circle(g, r * 0.5, r * 0.72, r * 0.42); g.fill();
  g.restore();
}

/* ═══════════════════════ THE 21 GLYPHS ════════════════════════════════
   Each fn(g, P) paints into the 100×100 box. Design notes inline. ═══ */
export const GLYPHS = {

  /* ⚡ LIGHTNING ROUND — jagged bolt in a speed-line burst */
  lightning(g, P) {
    g.globalAlpha = 0.85; fill(g, P.accent);
    burstRays(g, 50, 52, 11, 30, 49, 4.6, { rot: 0.28 });
    g.globalAlpha = 1;
    // the bolt
    poly(g, [[57, 5], [26, 51], [44, 51], [34, 95], [75, 39], [53, 39], [67, 5]]); fill(g, P.ink);
    // accent core (scaled redraw around the bolt's centroid)
    g.save(); g.translate(50, 48); g.scale(0.42, 0.42); g.translate(-50, -48);
    poly(g, [[57, 5], [26, 51], [44, 51], [34, 95], [75, 39], [53, 39], [67, 5]]); fill(g, P.accent);
    g.restore();
    // hot sparks at the tips
    fill(g, P.glow);
    sparkle(g, 69, 9, 6.5); g.fill();
    sparkle(g, 31, 91, 5); g.fill();
  },

  /* 🥷 REP STEAL — bandit money-bag (masked) snatched by a hand */
  steal(g, P) {
    // motion swooshes behind (left → right)
    g.globalAlpha = 0.8; stroke(g, P.accent, 4.5);
    g.beginPath(); g.arc(52, 54, 40, Math.PI * 0.72, Math.PI * 1.06); g.stroke();
    stroke(g, P.accent, 3.2);
    g.beginPath(); g.arc(52, 54, 33, Math.PI * 0.66, Math.PI * 0.96); g.stroke();
    g.globalAlpha = 1;
    // the sack
    poly(g, [[42, 26], [58, 26], [56, 36], [44, 36]]); fill(g, P.deep);
    circle(g, 50, 60, 27); fill(g, P.ink);
    // knot ears
    poly(g, [[42, 26], [34, 16], [46, 20]]); fill(g, P.accent);
    poly(g, [[58, 26], [66, 16], [54, 20]]); fill(g, P.accent);
    // the domino mask across the bag
    rr(g, 32, 50, 36, 15, 7); fill(g, P.paper);
    poly(g, [[37, 54], [48, 54], [46, 61], [38, 60]]); fill(g, P.glow);   // left eye slit
    poly(g, [[63, 54], [52, 54], [54, 61], [62, 60]]); fill(g, P.glow);   // right eye slit
    // grabbing hand from the right
    fill(g, P.accent);
    fist(g, 78, 68, 12, -1);
    stroke(g, P.deep, 2.4);
    circle(g, 78, 68, 12); g.stroke();
    // snatch sparks
    fill(g, P.glow);
    sparkle(g, 88, 30, 5.5); g.fill();
    sparkle(g, 74, 20, 3.6); g.fill();
  },

  /* 🛡️ GROUP SHIELD — heraldic shield, riveted */
  shield(g, P) {
    shieldPath(g, 1); fill(g, P.ink);
    shieldPath(g, 0.76); fill(g, P.paper);
    shieldPath(g, 0.76); stroke(g, P.accent, 3);
    // the chevron band
    g.beginPath(); g.moveTo(28, 44); g.lineTo(50, 60); g.lineTo(72, 44); stroke(g, P.accent, 9);
    g.beginPath(); g.moveTo(28, 44); g.lineTo(50, 60); g.lineTo(72, 44); stroke(g, P.glow, 2.6);
    // rivets
    fill(g, P.ink);
    for (const [x, y] of [[24, 30], [38, 24], [62, 24], [76, 30], [50, 74]]) {
      circle(g, x, y, 2.6); g.fill();
    }
  },

  /* ❄️ TIME FREEZE — crystalline clock-shard */
  freeze(g, P) {
    g.save(); g.translate(50, 50);
    // six crystal arms (long thin diamonds)
    for (let i = 0; i < 6; i++) {
      g.save(); g.rotate((i * Math.PI) / 3);
      poly(g, [[0, -46], [5, -30], [0, -16], [-5, -30]]); g.fill();
      g.restore();
    }
    g.globalAlpha = 0.9;
    for (let i = 0; i < 6; i++) {  // short secondary ticks
      g.save(); g.rotate((i * Math.PI) / 3 + Math.PI / 6);
      poly(g, [[0, -28], [3, -20], [0, -13], [-3, -20]]); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
    g.restore();
    // clock core
    circle(g, 50, 50, 14); fill(g, P.paper);
    circle(g, 50, 50, 14); stroke(g, P.ink, 3.4);
    g.beginPath(); g.moveTo(50, 50); g.lineTo(50, 41); stroke(g, P.ink, 3);
    g.beginPath(); g.moveTo(50, 50); g.lineTo(57, 54); stroke(g, P.accent, 3);
    fill(g, P.glow); circle(g, 50, 50, 2.2); g.fill();
    // falling shards
    fill(g, P.glow);
    poly(g, [[78, 12], [84, 20], [76, 22]]); g.fill();
    poly(g, [[18, 76], [24, 84], [16, 85]]); g.fill();
  },

  /* 🔥 COMBO BOOST — three ordered chevrons + the payoff star */
  combo_boost(g, P) {
    // baseline plate
    rr(g, 16, 72, 68, 10, 5); fill(g, P.deep);
    // chevron chain 1 → 2 → 3 (the prescribed order)
    g.beginPath(); g.moveTo(18, 62); g.lineTo(32, 44); g.lineTo(46, 62); stroke(g, P.ink, 9);
    g.beginPath(); g.moveTo(38, 62); g.lineTo(52, 40); g.lineTo(66, 62); stroke(g, P.accent, 9);
    g.beginPath(); g.moveTo(58, 62); g.lineTo(72, 36); g.lineTo(86, 62); stroke(g, P.glow, 9);
    // payoff sparkle
    fill(g, P.glow);
    sparkle(g, 80, 24, 9); g.fill();
    sparkle(g, 24, 30, 4.4); g.fill();
  },

  /* 🎲 DOUBLE DOWN — twin dive chevrons into the reward burst */
  double_down(g, P) {
    // two downward chevrons (volunteer for 2× target)
    g.beginPath(); g.moveTo(24, 14); g.lineTo(50, 32); g.lineTo(76, 14); stroke(g, P.ink, 11);
    g.beginPath(); g.moveTo(24, 34); g.lineTo(50, 52); g.lineTo(76, 34); stroke(g, P.ink, 11);
    // the 2× reward burst
    fill(g, P.accent);
    star(g, 50, 76, 8, 17, 7, -Math.PI / 2); g.fill();
    fill(g, P.glow);
    star(g, 50, 76, 8, 10, 4, -Math.PI / 2); g.fill();
    sparkle(g, 22, 78, 5); g.fill();
    sparkle(g, 78, 78, 5); g.fill();
  },

  /* 🤝 ASSIST BOOST — the relay baton pass */
  assist_boost(g, P) {
    // motion arc under the pass
    g.globalAlpha = 0.85;
    g.beginPath(); g.moveTo(20, 76); g.quadraticCurveTo(50, 88, 82, 74); stroke(g, P.glow, 3.4);
    g.globalAlpha = 1;
    // the baton (tilted)
    g.save(); g.translate(50, 44); g.rotate(-0.62);
    rr(g, -30, -6, 60, 12, 6); fill(g, P.accent);
    rr(g, -30, -6, 14, 12, 6); fill(g, P.deep);
    rr(g, 16, -6, 14, 12, 6); fill(g, P.deep);
    g.restore();
    // giver hand (left, open) + receiver fist (right, gripping)
    fill(g, P.ink);
    fist(g, 24, 60, 13, 1);
    fill(g, P.ink);
    fist(g, 76, 32, 12, -1);
    // pass sparks
    fill(g, P.glow);
    sparkle(g, 50, 22, 5.5); g.fill();
    sparkle(g, 62, 70, 4); g.fill();
  },

  /* 💣 SURPRISE BOMB — spherical bomb, fusing spark */
  surprise_bomb(g, P) {
    // speed arcs behind
    g.globalAlpha = 0.75; stroke(g, P.accent, 3.6);
    g.beginPath(); g.arc(52, 58, 36, Math.PI * 0.75, Math.PI * 1.15); g.stroke();
    stroke(g, P.accent, 2.6);
    g.beginPath(); g.arc(52, 58, 42, Math.PI * 0.8, Math.PI * 1.05); g.stroke();
    g.globalAlpha = 1;
    // body + cap
    circle(g, 46, 60, 26); fill(g, P.ink);
    circle(g, 46, 60, 26); stroke(g, P.deep, 3);
    rr(g, 37, 27, 18, 10, 3); fill(g, P.deep);
    // paper highlight crescent
    g.save(); g.translate(46, 60);
    g.beginPath(); g.arc(0, 0, 18, Math.PI * 0.85, Math.PI * 1.35); stroke(g, P.paper, 4.5);
    g.restore();
    // fuse + spark
    g.beginPath(); g.moveTo(50, 27); g.quadraticCurveTo(60, 16, 68, 13); stroke(g, P.accent, 3.6);
    fill(g, P.glow);
    star(g, 70, 11, 8, 10, 4, -Math.PI / 2); g.fill();
    sparkle(g, 84, 20, 4.5); g.fill();
  },

  /* 🪢 RESCUE ROPE — coiled rope with fraying ends */
  rescue_rope(g, P) {
    g.save(); g.translate(46, 48); g.rotate(-0.3);
    // the coil (three rope rings)
    stroke(g, P.ink, 7);
    g.save(); g.scale(1, 0.62);
    circle(g, 0, 0, 27); g.stroke();
    circle(g, 0, 0, 19); g.stroke();
    circle(g, 0, 0, 11); g.stroke();
    g.restore();
    // rope twist highlights
    stroke(g, P.paper, 2.2);
    g.save(); g.scale(1, 0.62);
    g.setLineDash([5, 7]); circle(g, 0, 0, 27); g.stroke();
    g.setLineDash([4, 6]); circle(g, 0, 0, 19); g.stroke();
    g.setLineDash([]); g.restore();
    g.restore();
    // frayed ends (two ropes whipping out)
    stroke(g, P.accent, 5);
    g.beginPath(); g.moveTo(66, 58); g.quadraticCurveTo(78, 66, 74, 82); g.stroke();
    stroke(g, P.glow, 4);
    g.beginPath(); g.moveTo(26, 62); g.quadraticCurveTo(16, 72, 22, 86); g.stroke();
    // splayed fibres
    stroke(g, P.accent, 2.4);
    g.beginPath(); g.moveTo(74, 82); g.lineTo(84, 88); g.stroke();
    g.beginPath(); g.moveTo(74, 82); g.lineTo(70, 92); g.stroke();
    stroke(g, P.glow, 2.2);
    g.beginPath(); g.moveTo(22, 86); g.lineTo(12, 90); g.stroke();
    g.beginPath(); g.moveTo(22, 86); g.lineTo(24, 95); g.stroke();
  },

  /* 🔨 SHIELD BASH — the shield, cracked by impact */
  shield_bash(g, P) {
    shieldPath(g, 0.94, 46, 52); fill(g, P.ink);
    shieldPath(g, 0.72, 46, 52); fill(g, P.paper);
    // the crack (a paper-cut zigzag with a hot seam)
    g.beginPath(); g.moveTo(56, 16); g.lineTo(48, 40); g.lineTo(58, 54); g.lineTo(46, 74);
    stroke(g, P.deep, 5);
    g.beginPath(); g.moveTo(56, 16); g.lineTo(48, 40); g.lineTo(58, 54); g.lineTo(46, 74);
    stroke(g, P.glow, 1.8);
    // impact star where the bash landed
    fill(g, P.accent);
    star(g, 80, 16, 8, 14, 5.5, -Math.PI / 2); g.fill();
    fill(g, P.glow);
    star(g, 80, 16, 8, 8, 3, -Math.PI / 2); g.fill();
    // flying shards
    fill(g, P.accent);
    poly(g, [[88, 34], [95, 40], [87, 42]]); g.fill();
    poly(g, [[82, 44], [90, 52], [80, 52]]); g.fill();
  },

  /* 🏋️ DOUBLE EXERCISE — barbell with the ×2 ticks */
  double_exercise(g, P) {
    // ×2 chevrons above
    g.beginPath(); g.moveTo(38, 22); g.lineTo(50, 10); g.lineTo(62, 22); stroke(g, P.glow, 7);
    g.beginPath(); g.moveTo(38, 36); g.lineTo(50, 24); g.lineTo(62, 36); stroke(g, P.glow, 7);
    // bar
    rr(g, 14, 55, 72, 9, 4.5); fill(g, P.ink);
    // plates (outer accent, inner ink)
    rr(g, 12, 38, 13, 42, 4); fill(g, P.accent);
    rr(g, 28, 46, 10, 26, 3.5); fill(g, P.ink);
    rr(g, 75, 38, 13, 42, 4); fill(g, P.accent);
    rr(g, 62, 46, 10, 26, 3.5); fill(g, P.ink);
    // chalk dust
    fill(g, P.paper);
    sparkle(g, 50, 74, 4); g.fill();
    sparkle(g, 26, 84, 2.8); g.fill();
    sparkle(g, 74, 84, 2.8); g.fill();
  },

  /* 🎯 SPECIALIST — bullseye with the top-3 pips */
  specialist(g, P) {
    circle(g, 50, 44, 27); stroke(g, P.ink, 4.5);
    circle(g, 50, 44, 17.5); fill(g, P.accent);
    circle(g, 50, 44, 8); fill(g, P.glow);
    // crosshair ticks
    stroke(g, P.ink, 3.6);
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      g.beginPath();
      g.moveTo(50 + dx * 30, 44 + dy * 30);
      g.lineTo(50 + dx * 39, 44 + dy * 39);
      g.stroke();
    }
    // the top-3 pips
    fill(g, P.glow);
    sparkle(g, 32, 82, 6); g.fill();
    sparkle(g, 50, 88, 7.5); g.fill();
    sparkle(g, 68, 82, 6); g.fill();
  },

  /* 🃏 WILDCARD WORKOUT — the great swap, two looping arrows */
  wildcard_workout(g, P) {
    // top arrow (cw loop)
    g.beginPath(); g.arc(50, 48, 27, Math.PI * 0.86, Math.PI * 0.14, true);
    stroke(g, P.ink, 7);
    poly(g, [[50 + 27 * Math.cos(Math.PI * 0.14), 48 + 27 * Math.sin(Math.PI * 0.14)],
             [72, 22], [80, 36]]); fill(g, P.ink);
    // bottom arrow (ccw loop, accent)
    g.beginPath(); g.arc(50, 48, 27, Math.PI * -0.86, Math.PI * -0.14, false);
    stroke(g, P.accent, 7);
    poly(g, [[50 + 27 * Math.cos(-Math.PI * 0.14), 48 + 27 * Math.sin(-Math.PI * 0.14)],
             [28, 74], [20, 60]]); fill(g, P.accent);
    // the wild sparkle
    fill(g, P.glow);
    star(g, 50, 48, 4, 12, 4.2); g.fill();
    sparkle(g, 80, 66, 4.5); g.fill();
    sparkle(g, 20, 30, 4.5); g.fill();
  },

  /* ⚔️ RIVALRY — crossed swords */
  rivalry(g, P) {
    const sword = (palette, rot) => {
      g.save(); g.translate(50, 50); g.rotate(rot);
      poly(g, [[-4.5, -30], [0, -44], [4.5, -30], [3, 24], [-3, 24]]); fill(g, palette.ink);
      rr(g, -13, 24, 26, 6.5, 3); fill(g, palette.accent);          // guard
      rr(g, -3, 30, 6, 15, 3); fill(g, palette.deep);               // grip
      circle(g, 0, 49, 4.6); fill(g, palette.accent);               // pommel
      g.restore();
    };
    sword({ ink: P.accent, accent: P.accent, deep: P.deep }, -Math.PI / 4);
    sword({ ink: P.ink, accent: P.glow, deep: P.deep }, Math.PI / 4);
    // the clash
    fill(g, P.glow);
    star(g, 50, 48, 4, 11, 3.8); g.fill();
  },

  /* 🤜 TRAINING PARTNERS — the fist bump */
  training_partners(g, P) {
    fill(g, P.ink);
    fist(g, 29, 54, 15, 1);
    fill(g, P.accent);
    fist(g, 71, 54, 15, -1);
    // cuffs
    rr(g, 8, 44, 8, 20, 3); fill(g, P.accent);
    rr(g, 84, 44, 8, 20, 3); fill(g, P.ink);
    // the bump
    fill(g, P.glow);
    star(g, 50, 50, 8, 13, 5, -Math.PI / 2); g.fill();
    stroke(g, P.glow, 2.6);
    g.beginPath(); g.moveTo(50, 30); g.lineTo(50, 22); g.stroke();
    g.beginPath(); g.moveTo(50, 70); g.lineTo(50, 78); g.stroke();
  },

  /* 🐺 PACK BOND — the wolf over the pack circle */
  pack_bond(g, P) {
    // pack circle (open at the front)
    g.globalAlpha = 0.85; stroke(g, P.accent, 3.6);
    g.beginPath(); g.arc(50, 54, 35, Math.PI * 0.65, Math.PI * 0.35); g.stroke();
    g.globalAlpha = 1;
    // ears
    poly(g, [[28, 22], [37, 42], [21, 44]]); fill(g, P.ink);
    poly(g, [[72, 22], [63, 42], [79, 44]]); fill(g, P.ink);
    poly(g, [[30, 27], [35, 38], [26, 39]]); fill(g, P.deep);
    poly(g, [[70, 27], [65, 38], [74, 39]]); fill(g, P.deep);
    // head
    poly(g, [[30, 36], [70, 36], [74, 54], [50, 78], [26, 54]]); fill(g, P.ink);
    // snout
    poly(g, [[50, 78], [43, 66], [57, 66]]); fill(g, P.deep);
    circle(g, 50, 68, 2.6); fill(g, P.paper);
    // forehead blaze
    poly(g, [[50, 36], [45, 48], [50, 44], [55, 48]]); fill(g, P.accent);
    // eyes
    fill(g, P.glow);
    poly(g, [[35, 47], [44, 45], [43, 51], [36, 51]]); g.fill();
    poly(g, [[65, 47], [56, 45], [57, 51], [64, 51]]); g.fill();
  },

  /* 📋 PROVE IT — the verification stamp */
  prove_it(g, P) {
    // rays of honesty
    stroke(g, P.glow, 3.4);
    for (const a of [-1.9, -1.55, -1.2]) {
      g.beginPath();
      g.moveTo(50 + Math.cos(a) * 40, 42 + Math.sin(a) * 40);
      g.lineTo(50 + Math.cos(a) * 48, 42 + Math.sin(a) * 48);
      g.stroke();
    }
    // the stamp
    rr(g, 22, 24, 56, 40, 10); stroke(g, P.accent, 5.5);
    rr(g, 30, 32, 40, 24, 6); stroke(g, P.accent, 2.4);
    g.beginPath(); g.moveTo(33, 44); g.lineTo(45, 55); g.lineTo(68, 27); stroke(g, P.ink, 8.5);
    // the marked strip below
    rr(g, 28, 72, 44, 9, 4.5); fill(g, P.deep);
    fill(g, P.glow); circle(g, 36, 76.5, 2.2); g.fill();
    fill(g, P.paper);
    rr(g, 44, 74.5, 22, 4, 2); g.fill();
  },

  /* 🔍 SPOT CHECK — magnifier over the leader's biggest log */
  spot_check(g, P) {
    // the log page
    poly(g, [[26, 14], [56, 14], [68, 26], [68, 60], [26, 60]]); fill(g, P.paper);
    poly(g, [[26, 14], [56, 14], [68, 26], [68, 60], [26, 60]]); stroke(g, P.ink, 3.4);
    poly(g, [[56, 14], [56, 26], [68, 26]]); fill(g, P.accent);
    stroke(g, P.ink, 2.6);
    g.beginPath(); g.moveTo(33, 30); g.lineTo(48, 30); g.stroke();
    g.beginPath(); g.moveTo(33, 38); g.lineTo(52, 38); g.stroke();
    g.beginPath(); g.moveTo(33, 46); g.lineTo(44, 46); g.stroke();
    // the lens
    circle(g, 56, 52, 15); fill(g, P.glow);
    g.globalAlpha = 0.35; circle(g, 56, 52, 15); fill(g, P.glow); g.globalAlpha = 1;
    circle(g, 56, 52, 15); stroke(g, P.accent, 5);
    g.beginPath(); g.moveTo(67, 63); g.lineTo(78, 74); stroke(g, P.ink, 7);
    // the eye inside
    fill(g, P.deep);
    circle(g, 56, 52, 5.2); g.fill();
    circle(g, 58, 50, 1.8); fill(g, P.paper); g.fill();
    fill(g, P.glow);
    sparkle(g, 80, 26, 4.5); g.fill();
  },

  /* 💨 SECOND WIND — three gusts and the fresh-air star */
  second_wind(g, P) {
    const gust = (c, w, y0, bend, r) => {
      stroke(g, c, w);
      g.beginPath();
      g.moveTo(12, y0);
      g.quadraticCurveTo(52, y0 - bend, 78, y0 + 4);
      g.stroke();
      g.beginPath(); g.arc(70, y0 + 4 - r * 0.2, r, Math.PI * 1.1, Math.PI * 2.25); g.stroke();
    };
    gust(P.ink, 6.5, 36, 12, 7);
    gust(P.accent, 5.5, 52, 16, 8.5);
    gust(P.glow, 4.5, 68, 20, 6.5);
    fill(g, P.glow);
    sparkle(g, 86, 24, 7); g.fill();
    sparkle(g, 14, 22, 3.6); g.fill();
  },

  /* 🔄 MULLIGAN — the fresh deal (fanned cards + restart arrow) */
  mulligan(g, P) {
    const fan = (palette, rot) => {
      g.save(); g.translate(50, 56); g.rotate(rot);
      rr(g, -12, -17, 24, 34, 4); fill(g, palette.paper);
      rr(g, -12, -17, 24, 34, 4); stroke(g, palette.ink, 3.2);
      g.restore();
    };
    fan({ paper: P.accent, ink: P.ink }, -0.42);
    fan({ paper: P.glow, ink: P.ink }, 0.42);
    fan({ paper: P.paper, ink: P.ink }, 0);
    fill(g, P.glow);
    sparkle(g, 50, 52, 6); g.fill();
    // the restart arrow around the fan
    g.beginPath(); g.arc(50, 50, 40, -Math.PI * 0.36, Math.PI * 0.78);
    stroke(g, P.accent, 4.5);
    poly(g, [[50 + 40 * Math.cos(-Math.PI * 0.36), 50 + 40 * Math.sin(-Math.PI * 0.36)],
             [76, 12], [88, 26]]); fill(g, P.accent);
  },

  /* 🐕 UNDERDOG — the rising dog-tag arrow */
  underdog(g, P) {
    // trail stars
    fill(g, P.glow);
    sparkle(g, 24, 50, 4.5); g.fill();
    sparkle(g, 38, 86, 3.4); g.fill();
    // the rising arrow
    g.beginPath(); g.moveTo(26, 74); g.lineTo(62, 38); stroke(g, P.ink, 9);
    poly(g, [[50, 26], [78, 20], [70, 48]]); fill(g, P.ink);
    // the dog tag riding the shaft
    g.save(); g.translate(36, 64); g.rotate(0.5);
    rr(g, -8, -11, 16, 22, 5); fill(g, P.accent);
    rr(g, -8, -11, 16, 22, 5); stroke(g, P.deep, 2.2);
    circle(g, 0, -5.5, 2.6); fill(g, P.paper);
    g.restore();
    // momentum sparks
    fill(g, P.glow);
    sparkle(g, 80, 66, 4); g.fill();
  },

  /* the fallback — unknown kind: the house diamond */
  __fallback(g, P) {
    g.globalAlpha = 0.85; g.fillStyle = P.accent;
    burstRays(g, 50, 50, 10, 30, 48, 4, {});
    g.globalAlpha = 1;
    poly(g, [[50, 12], [84, 50], [50, 88], [16, 50]]); fill(g, P.ink);
    poly(g, [[50, 26], [70, 50], [50, 74], [30, 50]]); fill(g, P.accent);
    fill(g, P.glow);
    star(g, 50, 50, 4, 8, 3); g.fill();
  },
};

/* ── dispatch ────────────────────────────────────────────────────────── */
export const SYMBOL_IDS = Object.keys(GLYPHS).filter((k) => !k.startsWith("__"));

/** Draw one glyph centred at (x, y), box `size` px.
 *  opts: { palette, scale, alpha, rot } */
export function drawSymbol(g, id, opts = {}) {
  const fn = GLYPHS[id] ?? GLYPHS.__fallback;
  const x = opts.x ?? 50, y = opts.y ?? 50, size = opts.size ?? 100;
  g.save();
  g.translate(x, y);
  if (opts.rot) g.rotate(opts.rot);
  const s = (size / 100) * (opts.scale ?? 1);
  g.scale(s, s);
  if (opts.alpha != null) g.globalAlpha = opts.alpha;
  g.translate(-50, -50);
  fn(g, opts.palette);
  g.restore();
}

/* ═══════════════════════ THE POSTER MASTER ════════════════════════════
   The default sports-poster treatment — what the 3D card faces + the v4
   chips use. Sports-poster language, in order:
     1. radiating speed-line halo (accent, low alpha)
     2. GLOW pass  — the symbol scaled up behind itself (the halo)
     3. OFFSET pass — the symbol re-printed ±1.5px in the second ink
        (chromatic misregistration, the press didn't quite line up)
     4. the KEY pass — the symbol itself
     5. halftone shading arc under the glyph (the printed-dot shade)
     6. keyline ring + registration ticks
   transparent:true skips nothing except opaque fills — it is bg-free by
   construction, so cards3d can layer it straight onto the card face. ══ */
export function drawCardSymbol(g, id, opts = {}) {
  const x = opts.x ?? 0, y = opts.y ?? 0, size = opts.size ?? 160;
  const P = {
    ink: opts.ink ?? "#f2e9d8",
    accent: opts.accent ?? "#ffc941",
    glow: opts.glow ?? "#7cc4ff",
    paper: opts.paper ?? "#101b2a",
    deep: opts.deep ?? "#05080e",
  };
  const off = Math.max(1, size * 0.012);       // the 1–2px press shift

  // 1 · speed-line halo
  g.save();
  g.translate(x, y);
  g.globalAlpha = 0.16;
  burstRays(g, 0, 0, 12, size * 0.30, size * 0.50, size * 0.045, { rot: 0.26 });
  g.restore();

  // 2 · glow pass
  drawSymbol(g, id, { x, y, size, palette: { ...P, ink: P.glow, accent: P.glow, glow: P.glow }, scale: 1.14, alpha: 0.26 });

  // 3 · offset print pass (chromatic misregistration)
  drawSymbol(g, id, { x: x + off, y: y + off * 0.7, size, palette: { ...P, ink: P.accent, glow: P.accent, paper: P.deep }, alpha: 0.9 });

  // 4 · key pass
  drawSymbol(g, id, { x, y, size, palette: P });

  // 5 · halftone shade under the glyph — ONE batched path (a fill per dot
  // would explode the SVG export into thousands of paths)
  g.save();
  g.translate(x, y);
  g.globalAlpha = 0.2;
  g.fillStyle = P.glow;
  g.beginPath();
  const step = Math.max(2.5, size * 0.024), r = step * 0.3;
  for (let yy = size * 0.16; yy < size * 0.5; yy += step) {
    for (let xx = -size * 0.52; xx < size * 0.52; xx += step) {
      if (xx * xx + yy * yy > (size * 0.52) ** 2) continue;
      const cy = yy + size * 0.3;
      g.moveTo(xx + r, cy);
      g.arc(xx, cy, r, 0, Math.PI * 2);
    }
  }
  g.fill();
  g.restore();

  // 6 · keyline ring + registration ticks
  g.save();
  g.translate(x, y);
  g.globalAlpha = 0.9;
  circle(g, 0, 0, size * 0.52); stroke(g, P.accent, Math.max(1.2, size * 0.012));
  g.globalAlpha = 0.65;
  for (let i = 0; i < 4; i++) {
    g.save(); g.rotate((i * Math.PI) / 2);
    g.beginPath(); g.moveTo(0, -size * 0.54); g.lineTo(0, -size * 0.5);
    stroke(g, P.glow, Math.max(1.2, size * 0.014));
    g.restore();
  }
  g.restore();
}
