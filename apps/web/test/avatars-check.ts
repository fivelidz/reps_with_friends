// Avatar system verification — /avatars studio, site #squad, /demo strip.
//
// Asserts, on real headless Chromium via CDP:
//   • zero console errors on all three surfaces
//   • every studio control actually changes the rendered pixels (pixel-diff
//     the canvas region before/after each one)
//   • randomise + JSON output + presets work
//   • #squad renders four GEOMETRICALLY different figures (not just recoloured)
//   • /demo strip animates on play and freezes on pause
//   • render cost stays inside the frame budget
//
// Run: bun apps/web/test/avatars-check.ts   (needs `bun serve.ts` on :4173)

import { Cdp, Report, sleep } from "./cdp.ts";

const BUDGET_MS = 8;

// ── scroll-corrected region hash ─────────────────────────────────────────────
// NOTE: Cdp.regionHash() feeds getBoundingClientRect() (VIEWPORT coords)
// straight into Page.captureScreenshot's `clip`, which expects PAGE coords.
// For anything at scrollY 0 they coincide, which is why it has worked so far —
// but #squad and #squadStripCanvas both sit well down the page, and the clip
// then lands on empty document below the content and hashes a flat colour.
// Verified: at scrollY=2824 the viewport-coord capture had 1 unique colour, the
// page-coord capture had 11,682. Every "is it animating?" assertion here
// depends on this being right, so we compute it locally instead of editing the
// shared harness.
async function regionHash(cdp: Cdp, selector: string): Promise<number> {
  const box = await cdp.eval<{ x: number; y: number; width: number; height: number } | null>(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY),
             width: Math.round(r.width), height: Math.round(r.height) };
  })()`);
  if (!box) throw new Error(`regionHash: no visible element ${selector}`);
  const r = await cdp.send("Page.captureScreenshot", {
    format: "png", clip: { ...box, scale: 1 }, captureBeyondViewport: false,
  });
  const buf = Buffer.from(r.result?.data ?? "", "base64");
  let h = 0;
  for (let i = 0; i < buf.length; i++) h = (Math.imul(h, 31) + buf[i]) >>> 0;
  return h >>> 0;
}

/**
 * Guard against the above bug regressing: a PNG of a flat, single-colour region
 * compresses to almost nothing. If a clip we believe contains a rendered 3D
 * scene comes back tiny, we captured empty page, and every animation assertion
 * built on it would be meaningless. Returns the encoded byte count.
 */
async function regionBytes(cdp: Cdp, selector: string): Promise<number> {
  const box = await cdp.eval<any>(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY),
             width: Math.round(r.width), height: Math.round(r.height) };
  })()`);
  const r = await cdp.send("Page.captureScreenshot", {
    format: "png", clip: { ...box, scale: 1 }, captureBeyondViewport: false,
  });
  return Buffer.from(r.result?.data ?? "", "base64").length;
}

const cdp = new Cdp(9441, "/tmp/rwf-avatars-check");
await cdp.start();
const rep = new Report();

/** Console errors, filtered to things we actually control. */
function errs() {
  return cdp.consoleErrors.filter((e) => !/favicon|ERR_FAILED.*favicon/i.test(e));
}

try {
  // ══════════════════════════════════════════════════════════════════════════
  // /avatars — the studio
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${"█".repeat(64)}\n /avatars — AVATAR STUDIO\n${"█".repeat(64)}`);
  rep.ctx("/avatars", "1280");
  await cdp.viewport(1280, 1000);
  await cdp.goto("/avatars", 3000);

  rep.ok("studio boots with no console errors", errs().length === 0, errs().slice(0, 2).join(" | "));
  rep.ok("viewer canvas present", await cdp.eval(`!!document.querySelector('#stage canvas')`));
  rep.ok("test hook exposed", await cdp.eval(`!!window.__rwfStudio`));

  // ── every control must visibly change the render ──────────────────────────
  // Freeze first: a running animation changes pixels on its own, which would
  // make every diff pass regardless of whether the control did anything.
  await cdp.eval(`(() => { document.getElementById('chkPlay').checked = false;
    window.__rwfStudio.viewer.freeze(); window.__rwfStudio.viewer._renderOnce(); })()`);
  await sleep(300);

  async function stageHash() {
    return await regionHash(cdp, "#stage");
  }

  // Each entry: label, a patch applied through the studio's own apply(), and
  // whether it should change geometry (structural) or only colour.
  const CONTROLS: Array<[string, string]> = [
    ["exercise → pushup", `{ exercise: 'pushup' }`],
    ["exercise → jumpingjack", `{ exercise: 'jumpingjack' }`],
    ["exercise → curl", `{ exercise: 'curl' }`],
    ["build → heavy", `{ build: 'heavy' }`],
    ["build → slim", `{ build: 'slim' }`],
    ["height → 1.32", `{ height: 1.32 }`],
    ["height → 0.75", `{ height: 0.75 }`],
    ["hair → bun", `{ hair: 'bun' }`],
    ["hair → cap", `{ hair: 'cap' }`],
    ["hair → none", `{ hair: 'none' }`],
    ["accessory → headband", `{ accessory: 'headband' }`],
    ["accessory → wristbands", `{ accessory: 'wristbands' }`],
    ["accessory → belt", `{ accessory: 'belt' }`],
    ["skinTone → #5f3a1f", `{ skinTone: '#5f3a1f' }`],
    ["outfitColor → #8b5cf6", `{ outfitColor: '#8b5cf6' }`],
    ["accentColor → #22d3a6", `{ accentColor: '#22d3a6' }`],
    ["hairColor → #c8a24a", `{ hairColor: '#c8a24a' }`],
    ["tier → athlete", `{ tier: 'athlete', outfitColor: '#ff5c38', accentColor: '#ffb020' }`],
  ];

  let before = await stageHash();
  for (const [label, patch] of CONTROLS) {
    await cdp.eval(`window.__rwfStudio.apply(${patch})`);
    // frozen scene: force one draw so the change is composited
    await cdp.eval(`window.__rwfStudio.viewer._renderOnce()`);
    await sleep(160);
    const after = await stageHash();
    rep.ok(`control changes render — ${label}`, after !== before, `${before} → ${after}`);
    before = after;
  }

  // ── ground contact ────────────────────────────────────────────────────────
  // The figures must STAND on the floor, not float above it or sink through it.
  // This regressed badly in the first pass (feet up to 4cm — ~8% of body height
  // — below y=0) because hip height was a hardcoded ratio instead of real
  // two-link leg kinematics, and the shoe was welded to the shin with no ankle.
  const contact = await cdp.eval<any>(`(async () => {
    const T = await import('three');
    const s = window.__rwfStudio;
    const rows = [];
    for (const build of ['slim', 'average', 'heavy']) {
      for (const height of [0.75, 1.0, 1.35]) {
        s.apply({ build, height, exercise: 'squat' });
        const av = s.viewer.avatars[0];
        av.pose(0); av.group.updateWorldMatrix(true, true);
        const b = new T.Box3().setFromObject(av.group);
        rows.push({ build, height, minY: +b.min.y.toFixed(5) });
      }
    }
    return rows;
  })()`);
  const worstStand = Math.max(...contact.map((r: any) => Math.abs(r.minY)));
  console.log(`    ↳ standing minY across 9 build/height combos: worst |Δ| = ${worstStand.toFixed(5)}`);
  rep.ok("figures stand exactly on the floor (all builds/heights)", worstStand < 0.002,
    `worst |minY| = ${worstStand.toFixed(5)}`);

  // Through a full rep, nothing should dip more than ~2cm below the floor —
  // and what little does is hidden by the opaque, depth-writing ground disc
  // (camera sits above it), so it never reaches the viewer.
  const cycleDip = await cdp.eval<any>(`(async () => {
    const T = await import('three');
    const s = window.__rwfStudio;
    const out = {};
    for (const e of ['squat', 'pushup', 'jumpingjack', 'curl']) {
      s.apply({ build: 'average', height: 1, exercise: e });
      const av = s.viewer.avatars[0];
      let lo = 99;
      for (let i = 0; i < 40; i++) {
        av.pose(i / 40); av.group.updateWorldMatrix(true, true);
        lo = Math.min(lo, new T.Box3().setFromObject(av.group).min.y);
      }
      out[e] = +lo.toFixed(4);
    }
    return out;
  })()`);
  console.log(`    ↳ deepest point over a full cycle: ${JSON.stringify(cycleDip)}`);
  for (const [ex, lo] of Object.entries<number>(cycleDip)) {
    rep.ok(`${ex}: no visible floor penetration`, lo > -0.02, `minY=${lo}`);
  }

  // ── config integrity ──────────────────────────────────────────────────────
  const cfg = await cdp.eval<any>(`window.__rwfStudio.config`);
  rep.ok("config carries every field", ["tier","skinTone","outfitColor","accentColor","hairColor","build","height","hair","accessory","exercise","scale"]
    .every((k) => cfg[k] !== undefined), Object.keys(cfg).join(","));

  const jsonMatches = await cdp.eval<boolean>(`(() => {
    const txt = document.getElementById('jsonOut').value;
    try { const p = JSON.parse(txt);
      return p.build === window.__rwfStudio.config.build
          && p.hair === window.__rwfStudio.config.hair
          && p.outfitColor === window.__rwfStudio.config.outfitColor;
    } catch { return false; }
  })()`);
  rep.ok("JSON output tracks live config", jsonMatches);

  // round-trip: JSON → parse → apply must reproduce the same descriptor
  const roundTrip = await cdp.eval<boolean>(`(() => {
    const a = JSON.stringify(window.__rwfStudio.config);
    window.__rwfStudio.apply(JSON.parse(a));
    return JSON.stringify(window.__rwfStudio.config) === a;
  })()`);
  rep.ok("config round-trips through JSON", roundTrip);

  // ── randomise ─────────────────────────────────────────────────────────────
  const randBefore = await stageHash();
  const cfgBefore = await cdp.eval<string>(`JSON.stringify(window.__rwfStudio.config)`);
  // click it several times: randomise CAN legitimately land on the same value
  // once, so require that it moved at least once across a few presses.
  let randChanged = false;
  let randPixels = false;
  for (let i = 0; i < 5 && !(randChanged && randPixels); i++) {
    await cdp.click("#btnRandom");
    await cdp.eval(`window.__rwfStudio.viewer._renderOnce()`);
    await sleep(180);
    if (await cdp.eval<string>(`JSON.stringify(window.__rwfStudio.config)`) !== cfgBefore) randChanged = true;
    if (await stageHash() !== randBefore) randPixels = true;
  }
  rep.ok("randomise changes the config", randChanged);
  rep.ok("randomise changes the render", randPixels);

  const jsonAfterRandom = await cdp.eval<boolean>(`(() => {
    try { const p = JSON.parse(document.getElementById('jsonOut').value);
      return p.build === window.__rwfStudio.config.build; } catch { return false; }
  })()`);
  rep.ok("JSON box updates after randomise", jsonAfterRandom);

  // ── determinism: same seed ⇒ same avatar ──────────────────────────────────
  const deterministic = await cdp.eval<boolean>(`(async () => {
    const m = await import('/site/avatars.js');
    const a = JSON.stringify(m.avatarConfigFromSeed('alexei'));
    const b = JSON.stringify(m.avatarConfigFromSeed('alexei'));
    const c = JSON.stringify(m.avatarConfigFromSeed('dave'));
    return a === b && a !== c;
  })()`);
  rep.ok("avatarConfigFromSeed is deterministic + varies by seed", deterministic);

  // ── presets ───────────────────────────────────────────────────────────────
  const presetCount = await cdp.eval<number>(`document.querySelectorAll('.preset').length`);
  rep.ok("six presets rendered", presetCount === 6, `${presetCount} presets`);

  const presetCanvases = await cdp.eval<number>(`document.querySelectorAll('.preset-stage canvas').length`);
  rep.ok("every preset has a live canvas", presetCanvases === 6, `${presetCanvases} canvases`);

  // presets must be visually distinct from each other, not six clones
  const presetHashes: number[] = [];
  for (let i = 0; i < 6; i++) {
    presetHashes.push(await regionHash(cdp, `.preset:nth-of-type(${i + 1}) .preset-stage`));
  }
  rep.ok("presets are visually distinct", new Set(presetHashes).size === 6,
    `${new Set(presetHashes).size}/6 unique`);

  // clicking a preset loads it into the viewer
  const beforePreset = await cdp.eval<string>(`JSON.stringify(window.__rwfStudio.config)`);
  await cdp.click(".preset:nth-of-type(2)");
  await sleep(400);
  const afterPreset = await cdp.eval<string>(`JSON.stringify(window.__rwfStudio.config)`);
  rep.ok("clicking a preset loads it into the viewer", afterPreset !== beforePreset);

  // ── speed + play/pause ────────────────────────────────────────────────────
  await cdp.eval(`(() => { document.getElementById('chkPlay').checked = true;
    document.getElementById('chkPlay').dispatchEvent(new Event('change')); })()`);
  await sleep(200);
  const playA = await stageHash();
  await sleep(500);
  const playB = await stageHash();
  rep.ok("animate checkbox resumes motion", playA !== playB);

  await cdp.eval(`(() => { const el = document.getElementById('rngSpeed');
    el.value = '2.4'; el.dispatchEvent(new Event('input')); })()`);
  const speedApplied = await cdp.eval<number>(`window.__rwfStudio.viewer.speed`);
  rep.ok("speed slider drives the scene", Math.abs(speedApplied - 2.4) < 0.001, `speed=${speedApplied}`);

  await cdp.eval(`(() => { const c = document.getElementById('chkPlay');
    c.checked = false; c.dispatchEvent(new Event('change')); })()`);
  await sleep(300);
  const frozenA = await stageHash();
  await sleep(500);
  const frozenB = await stageHash();
  rep.ok("animate checkbox freezes motion", frozenA === frozenB);

  // ── perf ──────────────────────────────────────────────────────────────────
  await cdp.eval(`(() => { const c = document.getElementById('chkPlay');
    c.checked = true; c.dispatchEvent(new Event('change')); })()`);
  await sleep(1200);
  const studioMs = await cdp.eval<number>(`window.__rwfStudio.viewer.renderMs`);
  console.log(`    ↳ studio render: ${studioMs.toFixed(2)} ms/frame (swiftshader software GL)`);

  rep.ok("no console errors after full studio exercise", errs().length === 0, errs().slice(0, 3).join(" | "));

  // ══════════════════════════════════════════════════════════════════════════
  // / — the site squad
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${"█".repeat(64)}\n / — #squad\n${"█".repeat(64)}`);
  rep.ctx("/", "1280");
  await cdp.goto("/", 2500);

  await cdp.eval(`document.getElementById('squad').scrollIntoView({block:'center',behavior:'instant'})`);
  await sleep(1500);

  rep.ok("squad canvas present", await cdp.eval(`!!document.querySelector('#squadCanvas canvas')`));
  rep.ok("no console errors on /", errs().length === 0, errs().slice(0, 3).join(" | "));

  // Geometric distinctness: compare the four rigs by triangle count and by
  // world-space bounding box. Colour-only differences would leave these equal —
  // so this proves they're genuinely different characters.
  const squadGeom = await cdp.eval<any>(`(() => {
    const s = window.__rwfSquad;
    if (!s) return null;
    return s.avatars.map((a) => {
      let tris = 0, meshes = 0;
      a.group.traverse((o) => {
        if (o.isMesh && o.geometry) {
          meshes++;
          const g = o.geometry;
          tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        }
      });
      const box = new (window.__rwfThree.Box3)().setFromObject(a.group);
      return {
        tris: Math.round(tris), meshes,
        h: +(box.max.y - box.min.y).toFixed(4),
        w: +(box.max.x - box.min.x).toFixed(4),
        build: a.config.build, hair: a.config.hair,
        accessory: a.config.accessory, outfit: a.config.outfitColor,
        exercise: a.config.exercise,
      };
    });
  })()`);

  if (!squadGeom) {
    rep.ok("squad exposes avatars for inspection", false, "window.__rwfSquad missing");
  } else {
    console.log("    ↳ squad rigs:");
    for (const g of squadGeom) {
      console.log(`       ${g.build.padEnd(8)} hair=${g.hair.padEnd(6)} acc=${g.accessory.padEnd(11)}`
        + ` ${String(g.meshes).padStart(3)} meshes ${String(g.tris).padStart(5)} tris`
        + ` h=${g.h} w=${g.w} ${g.exercise}`);
    }
    rep.ok("four avatars in the squad", squadGeom.length === 4, `${squadGeom.length}`);
    rep.ok("builds differ", new Set(squadGeom.map((g: any) => g.build)).size >= 2,
      squadGeom.map((g: any) => g.build).join(","));
    rep.ok("hair styles differ", new Set(squadGeom.map((g: any) => g.hair)).size >= 3,
      squadGeom.map((g: any) => g.hair).join(","));
    rep.ok("accessories differ", new Set(squadGeom.map((g: any) => g.accessory)).size >= 3,
      squadGeom.map((g: any) => g.accessory).join(","));
    rep.ok("triangle counts differ (real geometry variation)",
      new Set(squadGeom.map((g: any) => g.tris)).size >= 3,
      squadGeom.map((g: any) => g.tris).join(","));
    rep.ok("heights differ", new Set(squadGeom.map((g: any) => g.h)).size === 4,
      squadGeom.map((g: any) => g.h).join(","));
    rep.ok("outfit colours differ", new Set(squadGeom.map((g: any) => g.outfit)).size === 4,
      squadGeom.map((g: any) => g.outfit).join(","));
    rep.ok("all four exercises represented", new Set(squadGeom.map((g: any) => g.exercise)).size === 4,
      squadGeom.map((g: any) => g.exercise).join(","));
  }

  // sanity: we must actually be capturing the canvas, not blank page below it
  const sqBytes = await regionBytes(cdp, "#squadCanvas");
  rep.ok("squad capture region is non-blank", sqBytes > 5000, `${sqBytes} bytes of PNG`);

  // animation is live
  const sqA = await regionHash(cdp, "#squadCanvas");
  await sleep(600);
  const sqB = await regionHash(cdp, "#squadCanvas");
  rep.ok("squad animates", sqA !== sqB, `${sqA} → ${sqB}`);

  // rep counters tick
  await sleep(2400);
  const counted = await cdp.eval<number>(`(() => {
    const nums = [...document.querySelectorAll('.squad-rep-num')].map((n) => parseInt(n.textContent, 10) || 0);
    return nums.reduce((a, b) => a + b, 0);
  })()`);
  rep.ok("rep counters tick", counted > 0, `${counted} total reps`);

  const squadMs = await cdp.eval<number>(`window.__rwfSquad ? window.__rwfSquad.renderMs : -1`);
  console.log(`    ↳ squad render: ${squadMs.toFixed(2)} ms/frame (swiftshader software GL)`);
  rep.ok(`squad frame time under budget (${BUDGET_MS}ms)`, squadMs > 0 && squadMs < BUDGET_MS,
    `${squadMs.toFixed(2)} ms`);

  // ── reduced motion ────────────────────────────────────────────────────────
  console.log(`\n  reduced motion →`);
  const rmCdp = new Cdp(9442, "/tmp/rwf-avatars-rm");
  await rmCdp.start(true);
  try {
    await rmCdp.viewport(1280, 1000);
    await rmCdp.goto("/", 2500);
    await rmCdp.eval(`document.getElementById('squad').scrollIntoView({block:'center',behavior:'instant'})`);
    await sleep(1500);
    const rmA = await regionHash(rmCdp, "#squadCanvas");
    await sleep(900);
    const rmB = await regionHash(rmCdp, "#squadCanvas");
    rep.ok("reduced motion → squad is static", rmA === rmB, `${rmA} vs ${rmB}`);
    const rmErrs = rmCdp.consoleErrors.filter((e) => !/favicon/i.test(e));
    rep.ok("reduced motion → no console errors", rmErrs.length === 0, rmErrs.slice(0, 2).join(" | "));
  } finally {
    await rmCdp.stop();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // /demo — the strip
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n${"█".repeat(64)}\n /demo — SQUAD STRIP\n${"█".repeat(64)}`);
  rep.ctx("/demo", "1280");
  await cdp.goto("/demo", 2500);

  rep.ok("strip canvas present", await cdp.eval(`!!document.querySelector('#squadStripCanvas canvas')`));
  rep.ok("no console errors on /demo", errs().length === 0, errs().slice(0, 3).join(" | "));

  // The scene render-gates on IntersectionObserver, so it must be on screen
  // before any "is it animating?" comparison means anything.
  await cdp.eval(`document.getElementById('squadStrip').scrollIntoView({block:'center',behavior:'instant'})`);
  await sleep(700);

  const stripBytes = await regionBytes(cdp, "#squadStripCanvas");
  rep.ok("strip capture region is non-blank", stripBytes > 3000, `${stripBytes} bytes of PNG`);

  // /demo AUTOPLAYS ~700ms after load (demo.js: `setTimeout(... play(), 700)`),
  // so we can't assume a starting state — drive from the button's own label.
  // "⏸ Pause" means it's currently playing.
  const isPlaying = async () =>
    (await cdp.eval<string>(`document.getElementById('btnPlay').textContent`)).includes("Pause");

  async function setPlaying(want: boolean) {
    if ((await isPlaying()) !== want) await cdp.click("#btnPlay");
    await sleep(800);
  }

  // ── playing → the strip must animate ──────────────────────────────────────
  await setPlaying(true);
  rep.ok("play state reached", await isPlaying());
  const dPlayA = await regionHash(cdp, "#squadStripCanvas");
  await sleep(700);
  const dPlayB = await regionHash(cdp, "#squadStripCanvas");
  rep.ok("strip animates on play", dPlayA !== dPlayB, `${dPlayA} → ${dPlayB}`);

  // ── paused → the strip must hold its last frame ───────────────────────────
  await setPlaying(false);
  rep.ok("pause state reached", !(await isPlaying()));
  await sleep(400);   // let the in-flight RAF settle before sampling
  const dPauseA = await regionHash(cdp, "#squadStripCanvas");
  await sleep(800);
  const dPauseB = await regionHash(cdp, "#squadStripCanvas");
  rep.ok("strip freezes on pause", dPauseA === dPauseB, `${dPauseA} vs ${dPauseB}`);

  // ── and resumes again ─────────────────────────────────────────────────────
  await setPlaying(true);
  const dResumeA = await regionHash(cdp, "#squadStripCanvas");
  await sleep(700);
  const dResumeB = await regionHash(cdp, "#squadStripCanvas");
  rep.ok("strip resumes after pause", dResumeA !== dResumeB, `${dResumeA} → ${dResumeB}`);

  rep.ok("no console errors after demo interaction", errs().length === 0, errs().slice(0, 3).join(" | "));

} finally {
  await cdp.stop();
}

rep.table();
process.exit(rep.fails().length ? 1 : 0);
