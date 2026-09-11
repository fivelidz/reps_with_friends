/* ═══════════════════════════════════════════════════════════════════════
   RWF POWER-UP ART · SVG RECORDER
   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   A Canvas2D-shaped recorder that emits SVG. It implements exactly the
   constrained API the power-up glyphs + style frames use (see
   symbols.js header): transforms, paths (M/L/Q/C/A), fill/stroke with
   solid colours or linear/radial gradients, clip, dashes, alpha.

   Design notes:
   · path points are BAKED through the current matrix as they are
     recorded, so emitted <path> elements need no transform attribute
     and mid-path transform changes still come out correct.
   · arcs: a circle under an affine transform is an ELLIPSE — the
     recorder converts (r, a0, a1, ccw) into an SVG elliptical arc with
     proper rx/ry/x-axis-rotation/sweep (singular values of the 2×2
     matrix part), so `scale(1, 0.62)` coils render as true ellipses.
   · gradients are emitted once into <defs> with userSpaceOnUse.
   · clip() emits a <clipPath> + opens a <g>; restore() closes any
     groups the frame opened.
   · fill() then stroke() on one path emits two elements sharing the
     same d (canvas keeps the path until beginPath — so do we).
   ═══════════════════════════════════════════════════════════════════════ */

const f2 = (n) => {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? "0" : String(v);
};
const DEG = 180 / Math.PI;

export class SVGRecorder {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.body = [];
    this.defs = [];
    this._pending = [];
    this._n = 0;
    // state
    this.stack = [];
    this.mat = [1, 0, 0, 1, 0, 0];
    this.alpha = 1;
    this.dash = [];
    this.fillStyle = "#000";
    this.strokeStyle = "#000";
    this.lineWidth = 1;
    this.lineCap = "butt";
    this.lineJoin = "miter";
    this.d = "";               // current path (baked coords)
  }

  /* ── matrix ── */
  _mul(m) {
    const [a, b, c, d, e, f] = this.mat;
    this.mat = [
      a * m[0] + c * m[1],      b * m[0] + d * m[1],
      a * m[2] + c * m[3],      b * m[2] + d * m[3],
      a * m[4] + c * m[5] + e,  b * m[4] + d * m[5] + f,
    ];
  }
  _pt(x, y) {
    const [a, b, c, d, e, f] = this.mat;
    return [a * x + c * y + e, b * x + d * y + f];
  }

  save() {
    this.stack.push({
      mat: this.mat.slice(), alpha: this.alpha, dash: this.dash.slice(),
      fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth, lineCap: this.lineCap, lineJoin: this.lineJoin,
      open: 0,
    });
  }
  restore() {
    const s = this.stack.pop();
    if (!s) return;
    while (s.open-- > 0) this.body.push("</g>");
    this.mat = s.mat; this.alpha = s.alpha; this.dash = s.dash;
    this.fillStyle = s.fillStyle; this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth; this.lineCap = s.lineCap; this.lineJoin = s.lineJoin;
  }
  translate(x, y) { this._mul([1, 0, 0, 1, x, y]); }
  scale(x, y = x) { this._mul([x, 0, 0, y, 0, 0]); }
  rotate(a) {
    const c = Math.cos(a), s = Math.sin(a);
    this._mul([c, s, -s, c, 0, 0]);
  }

  /* ── path building (all points baked through the matrix) ── */
  beginPath() { this.d = ""; }
  moveTo(x, y) { const [px, py] = this._pt(x, y); this.d += `M${f2(px)} ${f2(py)}`; }
  lineTo(x, y) { const [px, py] = this._pt(x, y); this.d += `L${f2(px)} ${f2(py)}`; }
  quadraticCurveTo(cx, cy, x, y) {
    const [ax, ay] = this._pt(cx, cy), [bx, by] = this._pt(x, y);
    this.d += `Q${f2(ax)} ${f2(ay)} ${f2(bx)} ${f2(by)}`;
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    const [ax, ay] = this._pt(c1x, c1y), [bx, by] = this._pt(c2x, c2y), [qx, qy] = this._pt(x, y);
    this.d += `C${f2(ax)} ${f2(ay)} ${f2(bx)} ${f2(by)} ${f2(qx)} ${f2(qy)}`;
  }
  closePath() { if (this.d) this.d += "Z"; }

  arc(x, y, r, a0, a1, ccw = false) {
    // start / end points of the (possibly transformed) circle
    const [sx, sy] = this._pt(x + Math.cos(a0) * r, y + Math.sin(a0) * r);
    const [ex, ey] = this._pt(x + Math.cos(a1) * r, y + Math.sin(a1) * r);
    if (this.d && !this.d.endsWith("Z")) this.d += `L${f2(sx)} ${f2(sy)}`;
    else this.d += `M${f2(sx)} ${f2(sy)}`;

    let span = a1 - a0;
    if (ccw) while (span > 0) span -= Math.PI * 2;
    else while (span < 0) span += Math.PI * 2;
    if (Math.abs(span) < 1e-6 || r <= 0) { this.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r); return; }

    // the 2×2 linear part maps the circle → ellipse. Its singular values
    // are the semi-axes; the rotation is the first singular vector's angle.
    const [a, b, c, d] = this.mat;
    const det = a * d - b * c;
    const s1 = Math.hypot((a * a + b * b + c * c + d * d) / 2 +
      Math.sqrt(((a * a + b * b - c * c - d * d) / 2) ** 2 + (a * c + b * d) ** 2), 1e-9);
    const s2 = Math.abs(det) / s1 || 1e-9;
    if (s2 < 1e-6) return;                        // degenerate (flat) — drop
    // first singular vector angle: eigenvector of E·Eᵀ for s1²
    const q = (a * a + b * b - c * c - d * d) / 2;
    const p2 = (a * c + b * d);
    const phi = Math.atan2(p2, q + Math.sqrt(q * q + p2 * p2 || 1e-9)) / 2;
    // sweep: SVG sweep=1 is increasing-angle (y-down cw) — flips under mirroring
    const sweepFlag = ccw !== det < 0 ? 0 : 1;
    const largeArc = Math.abs(span) > Math.PI ? 1 : 0;
    this.d += `A${f2(s1 * r)} ${f2(s2 * r)} ${f2(phi * DEG)} ${largeArc} ${sweepFlag} ${f2(ex)} ${f2(ey)}`;
  }

  rect(x, y, w, h) {
    this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h);
    this.lineTo(x, y + h); this.closePath();
  }

  /* ── paint ── */
  _ref(style) {
    return typeof style === "object" && style && style.__grad ? `url(#${style.__id})` : style;
  }
  _alpha() { return this.alpha < 1 ? ` opacity="${f2(this.alpha)}"` : ""; }
  fill() {
    if (!this.d) return;
    this.body.push(`<path d="${this.d}" fill="${this._ref(this.fillStyle)}"${this._alpha()}/>`);
  }
  stroke() {
    if (!this.d) return;
    const dash = this.dash.length ? ` stroke-dasharray="${this.dash.map(f2).join(" ")}"` : "";
    this.body.push(
      `<path d="${this.d}" fill="none" stroke="${this._ref(this.strokeStyle)}" stroke-width="${f2(this.lineWidth)}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"${dash}${this._alpha()}/>`
    );
  }
  clip() {
    if (!this.d) return;
    const id = `cp${++this._n}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this.d}"/></clipPath>`);
    this.body.push(`<g clip-path="url(#${id})">`);
    if (this.stack.length) this.stack[this.stack.length - 1].open++;
    this.d = "";
  }
  fillRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.fill(); }
  strokeRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.stroke(); }
  clearRect() {}
  setLineDash(arr) { this.dash = Array.from(arr); }

  /* ── gradients (emitted into defs, userSpaceOnUse, baked coords) ── */
  _makeGrad(kind, attrs) {
    const id = `gr${++this._n}`;
    const stops = [];
    const marker = `__PENDING_${id}__`;
    this.defs.push(marker);
    const rec = {
      __grad: true, __id: id,
      addColorStop(off, col) { stops.push([off, col]); },
      __flush: () => {
        this.defs[this.defs.indexOf(marker)] =
          `<${kind} id="${id}" ${attrs}>` +
          stops.map(([o, c]) => `<stop offset="${f2(o)}" stop-color="${c}"/>`).join("") +
          `</${kind}>`;
      },
    };
    this._pending.push(rec);
    return rec;
  }
  createLinearGradient(x0, y0, x1, y1) {
    const [ax, ay] = this._pt(x0, y0), [bx, by] = this._pt(x1, y1);
    return this._makeGrad("linearGradient",
      `gradientUnits="userSpaceOnUse" x1="${f2(ax)}" y1="${f2(ay)}" x2="${f2(bx)}" y2="${f2(by)}"`);
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    const [fx, fy] = this._pt(x0, y0), [cx, cy] = this._pt(x1, y1);
    const rScale = Math.hypot(this.mat[0], this.mat[1]) || 1;
    return this._makeGrad("radialGradient",
      `gradientUnits="userSpaceOnUse" cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r1 * rScale)}" fx="${f2(fx)}" fy="${f2(fy)}" fr="${f2(r0 * rScale)}"`);
  }

  /* ── output ── */
  toString() {
    for (const rec of this._pending) rec.__flush();
    this._pending = [];
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w}" height="${this.h}">` +
      (this.defs.length ? `<defs>${this.defs.join("")}</defs>` : "") +
      this.body.join("") +
      `</svg>`
    );
  }
}
