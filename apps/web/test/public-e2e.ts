// FULL E2E verification sweep of the PUBLIC SURFACES.
//   /  ·  /demo  ·  /system  ·  /hub  ·  /debug  ·  /connect  ·  /slack
// Each surface is exercised at 390px AND 1280px with zero-console-error
// assertions, plus behaviour checks (canvas pixels, autoplay, scroll-spy,
// prebaked-chip network isolation, OAuth URL construction, …).
//
// Run:  bun apps/web/test/public-e2e.ts            (needs `bun serve.ts` on :4173)
//       bun apps/web/test/public-e2e.ts /demo /hub (subset)

import { Cdp, Report, sleep } from "./cdp.ts";

const ONLY = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const want = (p: string) => !ONLY.length || ONLY.includes(p);

const VPS = [
  { w: 390, h: 844, tag: "390", mobile: true },
  { w: 1280, h: 900, tag: "1280", mobile: false },
] as const;

const cdp = new Cdp(9422, "/tmp/rwf-e2e-a");
await cdp.start(false);
const rep = new Report();

/** Is the upstream AI provider currently refusing (quota/rate limit)? */
let aiQuotaExhausted = false;
async function probeAi() {
  try {
    const r = await fetch("http://localhost:4173/api/ai", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
    });
    if (r.status === 429 || r.status === 503) {
      aiQuotaExhausted = true;
      const body = await r.text();
      console.log(`\n⚠  upstream AI unavailable (${r.status}) — live-AI checks will be reported as SKIP.`);
      console.log(`   ${body.slice(0, 160)}\n`);
    }
  } catch { /* server down — surfaced elsewhere */ }
}

/** Assert no console errors accumulated on the current page. */
function noErrors(label = "zero console errors") {
  const errs = cdp.consoleErrors.filter((e) => {
    // favicon 404s are noise from the headless profile, not a page defect
    if (/favicon/i.test(e)) return false;
    // an exhausted upstream AI quota is an environment condition, not a defect;
    // the surface is expected to degrade gracefully (asserted separately)
    if (aiQuotaExhausted && /\/api\/ai/.test(e) && /(429|502|503)/.test(e)) return false;
    return true;
  });
  rep.ok(label, errs.length === 0, errs.slice(0, 3).join(" | ").slice(0, 220));
}

// ═══════════════════════════════════════════════════════════════════════════
// /  — the marketing site
// ═══════════════════════════════════════════════════════════════════════════
async function siteChecks(vp: string) {
  rep.ctx("/", vp);
  await cdp.goto("/", 3000);

  // -- hero canvas actually renders lime + steel pixels --------------------
  // NOTE: these renderers use the default preserveDrawingBuffer:false, so the
  // drawing buffer is cleared once the frame is composited. readPixels must run
  // INSIDE a rAF callback (same frame as the draw) or it always reads zeroes.
  const hero = await cdp.eval<any>(`new Promise((res) => {
    const c = document.querySelector('#heroCanvas canvas');
    if (!c) return res({ err: 'no canvas' });
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return res({ err: 'no gl ctx' });
    requestAnimationFrame(() => {
      const w = c.width, h = c.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let lime = 0, steel = 0, lit = 0;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i+1], b = px[i+2];
        if (r + g + b > 60) lit++;
        // lime ≈ #c6f32e: green dominant, red high, blue low
        if (g > 90 && g > b + 45 && r > 60) lime++;
        // steel ≈ desaturated mid grey-blue
        if (Math.abs(r - g) < 26 && Math.abs(g - b) < 30 && r > 55 && r < 205) steel++;
      }
      res({ w, h, lime, steel, lit, total: w * h });
    });
  })`);
  rep.ok("hero canvas present", !hero.err, hero.err ?? `${hero.w}×${hero.h}`);
  if (!hero.err) {
    rep.ok("hero renders lit pixels", hero.lit > hero.total * 0.01, `lit=${hero.lit}/${hero.total}`);
    rep.ok("hero has lime pixels", hero.lime > 40, `lime=${hero.lime}`);
    rep.ok("hero has steel pixels", hero.steel > 40, `steel=${hero.steel}`);
  }

  // -- rep counter ticks (hero must be in view) ----------------------------
  // The hero curl CYCLE is 2.4s, so poll for up to ~6s rather than sampling a
  // fixed window shorter than one rep.
  await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  await sleep(400);
  const r1 = await cdp.eval<string>(`document.getElementById('repCount').textContent`);
  let r2 = r1;
  for (let i = 0; i < 12 && r2 === r1; i++) {
    await sleep(500);
    r2 = await cdp.eval<string>(`document.getElementById('repCount').textContent`);
  }
  rep.ok("rep counter ticks", r1 !== r2, `${r1} → ${r2}`);
  rep.ok("rep counter is zero-padded 4-digit", /^\d{4}$/.test(r2), `"${r2}"`);

  // -- squad avatars: animate + all 4 tier colours -------------------------
  // The AvatarScene is IntersectionObserver-gated (it skips work off-screen),
  // so scroll it into view before sampling or nothing is drawn.
  await cdp.eval(`document.getElementById('squad').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(1200);
  const squad = await cdp.eval<any>(`new Promise((res) => {
    const c = document.querySelector('#squadCanvas canvas');
    if (!c) return res({ err: 'no squad canvas' });
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return res({ err: 'no gl' });
    requestAnimationFrame(() => {
      const w = c.width, h = c.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // tier hues: couch=amber, casual=sky, fit=lime, athlete=coral
      let amber = 0, sky = 0, lime = 0, coral = 0, lit = 0;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i+1], b = px[i+2];
        if (r + g + b < 70) continue;
        lit++;
        const mx = Math.max(r,g,b), mn = Math.min(r,g,b);
        if (mx - mn < 34) continue;               // grey — skip
        if (r > 130 && g > 90 && b < 90 && r >= g) amber++;      // amber/orange
        else if (b > 110 && b >= r && g > 70) sky++;             // sky blue
        else if (g > 110 && g > b + 35 && r < g) lime++;         // lime green
        else if (r > 130 && r > g + 45 && b > 55) coral++;       // coral/pink-red
      }
      res({ w, h, amber, sky, lime, coral, lit });
    });
  })`);
  rep.ok("squad canvas present", !squad.err, squad.err ?? `${squad.w}×${squad.h}`);
  if (!squad.err) {
    const tiers = [["amber(couch)", squad.amber], ["sky(casual)", squad.sky], ["lime(fit)", squad.lime], ["coral(athlete)", squad.coral]] as const;
    const missing = tiers.filter(([, n]) => n < 8).map(([k]) => k);
    rep.ok("squad shows all 4 tier colours", missing.length === 0,
      missing.length ? `missing ${missing.join(",")} · ${JSON.stringify({a:squad.amber,s:squad.sky,l:squad.lime,c:squad.coral})}` : `a=${squad.amber} s=${squad.sky} l=${squad.lime} c=${squad.coral}`);
    // animation: per-tier rep counters tick (driven by the avatar rig's onRep)
    const c1 = await cdp.eval<string>(`document.getElementById('squadCounters').textContent`);
    await sleep(2600);
    const c2 = await cdp.eval<string>(`document.getElementById('squadCounters').textContent`);
    rep.ok("squad avatars animate (counters tick)", c1 !== c2, `"${c1.slice(0,26)}" → "${c2.slice(0,26)}"`);

    // the handicap story: raw counts drift apart, adjusted stay close
    const adj = await cdp.eval<number[]>(`[...document.querySelectorAll('.squad-rep-adj')].map(e => Number((e.textContent.match(/→\\s*(\\d+)/)||[])[1] || 0))`);
    const spread = Math.max(...adj) - Math.min(...adj);
    rep.ok("adjusted scores stay neck-and-neck", spread <= 3, `adjusted=[${adj.join(",")}] spread=${spread}`);
  }

  // -- handicap demo: athlete 300 → 255 ------------------------------------
  const hc = await cdp.eval<any>(`(() => {
    const slider = document.getElementById('tierSlider');
    const reps = document.getElementById('repsInput');
    const set = (el, v) => {
      const proto = el.tagName === 'INPUT' && el.type === 'range'
        ? HTMLInputElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set(slider, 3);   // athlete = highest tier index
    set(reps, 300);
    return {
      tier: (document.getElementById('tierBlurb')||{}).textContent,
      score: (document.getElementById('scoreOut')||{}).textContent,
      mult: (document.getElementById('multOut')||{}).textContent,
    };
  })()`);
  const scoreNum = parseFloat(String(hc.score ?? "").replace(/[^\d.]/g, ""));
  rep.ok("handicap athlete 300 → 255", scoreNum === 255, `score="${hc.score}" mult="${hc.mult}"`);

  // -- connections graph ---------------------------------------------------
  await cdp.eval(`document.getElementById('connections').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(1000);
  const graph = await cdp.eval<any>(`new Promise((res) => {
    const c = document.querySelector('#graphCanvas canvas');
    if (!c) return res({ err: 'no graph canvas' });
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return res({ err: 'no gl' });
    requestAnimationFrame(() => {
      const w = c.width, h = c.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] + px[i+1] + px[i+2] > 70) lit++;
      res({ w, h, lit, total: w * h });
    });
  })`);
  rep.ok("connections graph renders", !graph.err && graph.lit > 200,
    graph.err ?? `lit=${graph.lit}/${graph.total}`);

  // -- app showcase phone frames ------------------------------------------
  const frames = await cdp.eval<number>(`document.querySelectorAll('#app-showcase .phone, #app-showcase .phone-frame, #app-showcase [class*="phone"]').length`);
  rep.ok("app showcase phone frames present", frames > 0, `${frames} frames`);

  // -- explore grid: 8 cards -----------------------------------------------
  const explore = await cdp.eval<string[]>(`[...document.querySelectorAll('#explore a[href]')].map(a => a.getAttribute('href'))`);
  rep.ok("explore grid has 8 cards", explore.length === 8, `${explore.length} links: ${explore.join(" ")}`);

  // -- footer links --------------------------------------------------------
  const footer = await cdp.eval<string[]>(`[...document.querySelectorAll('.footer a[href]')].map(a => a.getAttribute('href'))`);
  rep.ok("footer has links", footer.length > 0, `${footer.length}`);

  // link reachability (internal only), done once at 390
  if (vp === "390") {
    const all = [...new Set([...explore, ...footer])].filter((h) => h && h.startsWith("/"));
    const bad: string[] = [];
    for (const h of all) {
      const res = await fetch("http://localhost:4173" + h, { redirect: "follow" });
      if (res.status !== 200) bad.push(`${h}→${res.status}`);
    }
    rep.ok("all internal explore+footer links 200", bad.length === 0, bad.join(" ") || `${all.length} links OK`);
  }

  noErrors();
}

// ── AI guide (site) ─────────────────────────────────────────────────────────
async function guideChecks(vp: string) {
  rep.ctx("/", vp);
  await cdp.goto("/", 2200);

  // Auto-open is DESKTOP-ONLY by design (≤620px keeps the pulsing launcher
  // instead of hijacking a small screen with a bottom sheet).
  const isMobile = vp === "390";
  await cdp.eval(`sessionStorage.clear()`);
  await cdp.goto("/", 1500);
  await sleep(6200); // intro timer is 5s
  const autoOpened = await cdp.eval<boolean>(`document.getElementById('guidePanel').classList.contains('open')`);
  if (isMobile) {
    rep.ok("guide does NOT auto-open on mobile (by design)", !autoOpened, `open=${autoOpened}`);
    const pulsing = await cdp.eval<boolean>(`document.getElementById('guideLauncher').classList.contains('pulse')`);
    rep.ok("mobile launcher keeps its pulse ring instead", pulsing, `pulse=${pulsing}`);
  } else {
    rep.ok("guide auto-opens once per session", autoOpened, `open=${autoOpened}`);
  }

  // second load in same session → must NOT auto-open
  await cdp.goto("/", 1500);
  await cdp.eval(`document.getElementById('guidePanel').classList.remove('open')`);
  await sleep(6200);
  const reOpened = await cdp.eval<boolean>(`document.getElementById('guidePanel').classList.contains('open')`);
  rep.ok("guide does NOT re-auto-open same session", !reOpened, `open=${reOpened}`);

  // open it deliberately
  await cdp.eval(`sessionStorage.clear()`);
  await cdp.goto("/", 1600);
  await cdp.click("#guideLauncher");
  await sleep(500);
  rep.ok("guide opens on launcher click",
    await cdp.eval<boolean>(`document.getElementById('guidePanel').classList.contains('open')`));

  // ── prebaked chip: INSTANT + ZERO /api/ai fetches ──────────────────────
  cdp.resetNet();
  const chipCount = await cdp.eval<number>(`document.querySelectorAll('#guideChips button[data-q]').length`);
  rep.ok("guide has starter chips", chipCount >= 4, `${chipCount} chips`);

  const before = await cdp.eval<number>(`document.querySelectorAll('#guideMessages .msg--bot').length`);
  await cdp.click(`#guideChips button[data-q]`);
  await sleep(260); // deliberately short — a prebaked answer must be instant
  const instant = await cdp.eval<any>(`(() => {
    const bots = document.querySelectorAll('#guideMessages .msg--bot');
    const last = bots[bots.length - 1];
    return {
      bots: bots.length,
      loading: document.querySelectorAll('#guideMessages .msg--loading').length,
      text: last ? last.textContent.trim().slice(0, 60) : '',
    };
  })()`);
  rep.ok("prebaked chip answers instantly (<260ms)",
    instant.bots > before && instant.text.length > 0 && instant.loading === 0,
    `bots ${before}→${instant.bots} loading=${instant.loading} "${instant.text.slice(0,40)}…"`);

  await sleep(900);
  const aiCalls = cdp.matching("/api/ai");
  rep.ok("prebaked chip made ZERO /api/ai fetches", aiCalls.length === 0,
    aiCalls.length ? aiCalls.map((r) => r.url).join(",") : "0 requests");

  // typewriter runs (text grows over time)
  const t1 = await cdp.eval<number>(`(() => { const b = document.querySelectorAll('#guideMessages .msg--bot'); return b[b.length-1].textContent.length; })()`);
  await cdp.click(`#guideChips button[data-q]:nth-of-type(2)`);
  await sleep(160);
  const w1 = await cdp.eval<number>(`(() => { const b = document.querySelectorAll('#guideMessages .msg--bot'); return b[b.length-1].textContent.length; })()`);
  await sleep(1000);
  const w2 = await cdp.eval<number>(`(() => { const b = document.querySelectorAll('#guideMessages .msg--bot'); return b[b.length-1].textContent.length; })()`);
  rep.ok("typewriter runs (text grows)", w2 > w1, `len ${w1} → ${w2}`);

  // chips stay visible + get marked seen
  const chipState = await cdp.eval<any>(`(() => {
    const chips = [...document.querySelectorAll('#guideChips button[data-q]')];
    const vis = chips.filter(c => c.offsetParent !== null).length;
    const seen = chips.filter(c => c.classList.contains('guide-chip--seen')).length;
    return { total: chips.length, vis, seen };
  })()`);
  rep.ok("chips stay visible after answering", chipState.vis === chipState.total,
    `${chipState.vis}/${chipState.total} visible`);
  rep.ok("used chips marked seen", chipState.seen >= 2, `${chipState.seen} seen`);

  // ── the restored panel must never swallow page taps ────────────────────
  // Regression guard: on mobile the panel is a ~78svh bottom sheet. It used to
  // be restored from sessionStorage on every load, dropping a full-screen
  // overlay over the page and eating clicks meant for the content beneath.
  await cdp.eval(`sessionStorage.setItem('rwf-guide-open','1')`);
  await cdp.goto("/", 1800);
  const intercept = await cdp.eval<any>(`(() => {
    const el = document.querySelector('#explore a[href]');
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    return {
      reachable: !!hit && (hit === el || el.contains(hit) || hit.contains(el)),
      hit: hit ? hit.tagName + '.' + String(hit.className).slice(0, 30) : null,
      panelOpen: document.getElementById('guidePanel').classList.contains('open'),
    };
  })()`);
  rep.ok("restored guide panel does not swallow page clicks", intercept.reachable,
    `hit=${intercept.hit} panelOpen=${intercept.panelOpen}`);
  if (isMobile) {
    rep.ok("guide panel not restored as a sheet on mobile", !intercept.panelOpen,
      `open=${intercept.panelOpen}`);
  }
  await cdp.eval(`sessionStorage.clear()`);
  await cdp.goto("/", 1600);
  await cdp.click("#guideLauncher");
  await sleep(400);

  // ── free-typed question DOES fetch /api/ai ─────────────────────────────
  cdp.resetNet();
  await cdp.typeInto("#guideInput", "what is the weather");
  await cdp.eval(`document.getElementById('guideForm').requestSubmit()`);
  await sleep(1400);
  const freeCalls = cdp.matching("/api/ai");
  rep.ok("free-typed question DOES fetch /api/ai", freeCalls.length >= 1, `${freeCalls.length} request(s)`);

  // when the provider is out of quota the widget must degrade gracefully:
  // a clear rate-limit message + a retry, never a dead spinner
  if (aiQuotaExhausted) {
    let state: any = null;
    for (let i = 0; i < 12; i++) {
      await sleep(700);
      state = await cdp.eval<any>(`(() => {
        const err = document.querySelector('#guideMessages .msg--error');
        return {
          err: err ? err.textContent.trim() : '',
          retry: !!document.querySelector('#guideMessages .guide-retry'),
          spinner: document.querySelectorAll('#guideMessages .msg--loading').length,
        };
      })()`);
      if (state.err) break;
    }
    rep.ok("AI outage degrades gracefully (message + retry, no dead spinner)",
      !!state?.err && state.retry && state.spinner === 0,
      `"${String(state?.err).slice(0, 70)}" retry=${state?.retry} spinner=${state?.spinner}`);
    rep.ok("AI outage message names the rate limit",
      /usage limit|limit/i.test(String(state?.err ?? "")),
      `"${String(state?.err).slice(0, 70)}"`);
  }

  noErrors("guide: zero console errors");
}

// ═══════════════════════════════════════════════════════════════════════════
// /demo
// ═══════════════════════════════════════════════════════════════════════════
async function demoChecks(vp: string) {
  rep.ctx("/demo", vp);
  await cdp.goto("/demo", 700);

  // autoplays within ~2s
  await sleep(1500);
  const auto = await cdp.eval<any>(`(() => ({
    play: document.getElementById('btnPlay').textContent.trim(),
    chat: document.getElementById('chat').children.length,
  }))()`);
  rep.ok("demo autoplays within ~2s", auto.play.includes("Pause") && auto.chat > 0,
    `btn="${auto.play}" chat=${auto.chat} msgs`);

  // avatar strip animates during play
  const stripPresent = await cdp.eval<boolean>(`!!document.querySelector('#squadStripCanvas canvas')`);
  rep.ok("demo avatar strip present", stripPresent);
  if (stripPresent) {
    // Read inside rAF — the renderer uses preserveDrawingBuffer:false, so a
    // readPixels outside the draw frame always returns zeroes (a zero hash on
    // both samples would otherwise make the FREEZE check pass trivially).
    const grab = `new Promise((res) => {
      const c = document.querySelector('#squadStripCanvas canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      requestAnimationFrame(() => {
        const px = new Uint8Array(c.width * c.height * 4);
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let h = 0, nz = 0;
        for (let i = 0; i < px.length; i += 16) { h = (h * 31 + px[i]) >>> 0; if (px[i]) nz++; }
        res({ h, nz });
      });
    })`;
    await cdp.eval(`document.getElementById('squadStrip').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await sleep(600);

    const a1 = await cdp.eval<any>(grab);
    const playFrames: number[] = [a1.h];
    for (let i = 0; i < 7; i++) {
      await sleep(320);
      playFrames.push((await cdp.eval<any>(grab)).h);
    }
    // guard against the false-positive: the sample must contain real pixels
    rep.ok("avatar strip actually draws pixels", a1.nz > 0, `non-zero samples=${a1.nz}`);
    rep.ok("avatar strip animates during play", new Set(playFrames).size > 1,
      `${new Set(playFrames).size} distinct frames of ${playFrames.length}`);

    // FREEZE / RESUME are measured from the GL drawing buffer sampled inside
    // rAF. Screenshot compositing is NOT usable here: headless Chromium does
    // not recomposite this WebGL layer between captures, so Page.captureScreenshot
    // returns an identical image every time and a "frozen" assertion would
    // pass trivially (verified: gl=6 distinct frames vs screenshot=1 while playing).
    const series = async (n: number) => {
      const hs: number[] = [];
      for (let i = 0; i < n; i++) { hs.push((await cdp.eval<any>(grab)).h); await sleep(320); }
      return hs;
    };

    await cdp.click("#btnPlay");
    // the replay scrolls the chat/CTA, which can push the strip off a 390px
    // viewport; the scene is IntersectionObserver-gated, so re-centre it or it
    // is legitimately (and misleadingly) frozen
    await cdp.eval(`document.getElementById('squadStrip').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await sleep(700);
    const paused = await series(6);
    rep.ok("avatar strip FREEZES on pause", new Set(paused).size === 1,
      `${new Set(paused).size} distinct frames of ${paused.length}`);
    rep.ok("demo pause button reads Play",
      (await cdp.eval<string>(`document.getElementById('btnPlay').textContent`)).includes("Play"));

    // resumes
    await cdp.click("#btnPlay");
    await cdp.eval(`document.getElementById('squadStrip').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await sleep(600);
    const resumed = await series(6);
    rep.ok("avatar strip resumes", new Set(resumed).size > 1,
      `${new Set(resumed).size} distinct frames of ${resumed.length}`);
  }

  // speed toggle cycles 1× / 2× / 4×
  const speeds: string[] = [];
  speeds.push(await cdp.eval<string>(`document.getElementById('btnSpeed').textContent.trim()`));
  for (let i = 0; i < 3; i++) {
    await cdp.click("#btnSpeed");
    speeds.push(await cdp.eval<string>(`document.getElementById('btnSpeed').textContent.trim()`));
  }
  rep.ok("speed toggle cycles 1×/2×/4×",
    speeds[0] === "1×" && speeds[1] === "2×" && speeds[2] === "4×" && speeds[3] === "1×",
    speeds.join(" → "));

  // full replay reaches result + CTA (run at 4× to keep it quick)
  await cdp.eval(`document.getElementById('btnRestart').click()`);
  await sleep(300);
  // set 4× then ensure playing
  for (let i = 0; i < 4; i++) {
    const s = await cdp.eval<string>(`document.getElementById('btnSpeed').textContent.trim()`);
    if (s === "4×") break;
    await cdp.click("#btnSpeed");
  }
  await cdp.eval(`(() => { const b = document.getElementById('btnPlay'); if (b.textContent.includes('Play')) b.click(); })()`);

  let done: any = null;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    done = await cdp.eval<any>(`(() => ({
      cta: !document.getElementById('cta').hidden,
      status: document.getElementById('matchStatus').textContent.trim(),
      result: document.getElementById('chat').textContent.includes('MATCH RESULT'),
      pot: document.getElementById('potAmt').textContent.trim(),
    }))()`);
    if (done.cta && done.result) break;
  }
  rep.ok("full replay reaches result", done?.result === true, `status="${done?.status}" pot=${done?.pot}`);
  rep.ok("full replay reveals CTA", done?.cta === true, `cta visible=${done?.cta}`);

  noErrors();
}

// ═══════════════════════════════════════════════════════════════════════════
// /system
// ═══════════════════════════════════════════════════════════════════════════
const EXPECTED_FAMILIES: Record<string, string> = {
  A: "5/6", B: "6/6", C: "3/5", D: "3/4", E: "2/4", F: "0/4", G: "4/11",
};

async function systemChecks(vp: string) {
  rep.ctx("/system", vp);
  await cdp.goto("/system", 2000);

  // family bars show correct counts
  const fams = await cdp.eval<any[]>(`[...document.querySelectorAll('.fam-col')].map(col => ({
    head: col.querySelector('.map-head').textContent.trim(),
    count: col.querySelector('.fam-count').textContent.replace(/\\s+/g,' ').trim(),
    bar: col.querySelector('.fam-bar').dataset.w,
    go: col.querySelector('.fam-bar').classList.contains('go'),
  }))`);
  rep.ok("7 family columns render", fams.length === 7, `${fams.length}`);
  const famErr: string[] = [];
  for (const f of fams) {
    const letter = (f.head.match(/FAMILY\s+([A-G])/) ?? [])[1];
    const got = (f.count.match(/(\d+)\s*\/\s*(\d+)/) ?? []).slice(1, 3).join("/");
    const exp = EXPECTED_FAMILIES[letter];
    if (exp && got !== exp) famErr.push(`${letter}: got ${got} want ${exp}`);
  }
  rep.ok("family counts match expected (A5/6 B6/6 C3/5 D3/4 E2/4 F0/4 G4/11)",
    famErr.length === 0, famErr.join(" · ") || fams.map((f) => f.count).join(" "));

  // count-ups fire
  const counts = await cdp.eval<any[]>(`[...document.querySelectorAll('[data-count]')].map(el => ({
    target: el.dataset.count, shown: el.textContent.trim(),
  }))`);
  rep.ok("count-up elements exist", counts.length > 0, `${counts.length}`);
  const notFired = counts.filter((c) => !/\d/.test(c.shown) || c.shown === "0");
  rep.ok("count-ups fired", notFired.length === 0,
    notFired.length ? JSON.stringify(notFired.slice(0, 4)) : counts.map((c) => c.shown).join(" "));

  // family bars fill when scrolled into view (IntersectionObserver, threshold .4)
  await cdp.eval(`(() => { const f = document.getElementById('families'); f && f.scrollIntoView({ block:'start', behavior:'instant' }); })()`);
  await sleep(900);
  // walk down the families section so every column crosses the threshold
  for (let i = 0; i < 8; i++) {
    await cdp.eval(`window.scrollBy({ top: window.innerHeight * 0.6, behavior: 'instant' })`);
    await sleep(220);
  }
  const barsGo = await cdp.eval<any>(`(() => {
    const b = [...document.querySelectorAll('.fam-bar')];
    return {
      total: b.length,
      go: b.filter(x => x.classList.contains('go')).length,
      widths: b.map(x => getComputedStyle(x.querySelector('i')).width),
    };
  })()`);
  rep.ok("family bars fill on scroll into view", barsGo.go === barsGo.total,
    `${barsGo.go}/${barsGo.total} filled · widths ${(barsGo.widths||[]).join(",")}`);
  const zeroWidth = (barsGo.widths || []).filter((w: string) => parseFloat(w) < 1);
  rep.ok("family bars have non-zero fill width", zeroWidth.length <= 1,
    `${zeroWidth.length} zero-width (F is legitimately 0/4)`);

  // scroll-spy through all sections
  const spy = await cdp.eval<string[]>(`[...document.querySelectorAll('.sys-nav-links a')].map(a => a.getAttribute('href'))`);
  rep.ok("scroll-spy nav has 5 sections", spy.length === 5, `${spy.length}: ${spy.join(" ")}`);
  const activated = new Set<string>();
  for (const href of spy) {
    await cdp.eval(`(() => { const s = document.querySelector('${href}'); s && window.scrollTo({ top: s.offsetTop + 10, behavior: 'instant' }); })()`);
    await sleep(320);
    const act = await cdp.eval<string>(`(() => { const a = document.querySelector('.sys-nav-links a.active'); return a ? a.getAttribute('href') : ''; })()`);
    if (act) activated.add(act);
  }
  rep.ok("scroll-spy highlights through all 5 sections", activated.size === spy.length,
    `${activated.size}/${spy.length}: ${[...activated].join(" ")}`);

  // swatch copy on click. Scroll FIRST and let it settle, then install the
  // clipboard stub — cdp.click() scrolls the target into view, and doing that
  // in the same tick as the stub let the click land before the stub was live.
  await cdp.eval(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  await sleep(350);
  await cdp.eval(`window.__copied = ''; navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };`);
  const swatchCount = await cdp.eval<number>(`document.querySelectorAll('.swatch').length`);
  rep.ok("swatches present", swatchCount > 0, `${swatchCount}`);
  await cdp.click(".swatch");
  let copied: any = { copied: "", label: "" };
  for (let i = 0; i < 10 && !String(copied.copied).trim(); i++) {
    await sleep(220);
    copied = await cdp.eval<any>(`(() => ({
      copied: window.__copied || '',
      label: (document.querySelector('.swatch em') || {}).textContent,
    }))()`);
  }
  rep.ok("swatch copies hex on click", /^#?[0-9a-fA-F]{3,8}$/.test(String(copied.copied).trim()),
    `copied="${copied.copied}" label="${copied.label}"`);

  // timeline current-phase pulses (.phase.now .p-node → node-pulse keyframes)
  const timeline = await cdp.eval<any>(`(() => {
    const phases = [...document.querySelectorAll('.phase-track .phase')];
    const now = phases.filter(p => p.classList.contains('now'));
    const node = now[0] ? now[0].querySelector('.p-node') : null;
    return {
      phases: phases.length,
      nowCount: now.length,
      label: now[0] ? now[0].querySelector('b').textContent.trim() : '',
      anim: node ? getComputedStyle(node).animationName : null,
      dur: node ? getComputedStyle(node).animationDuration : null,
      done: phases.filter(p => p.classList.contains('done')).length,
    };
  })()`);
  rep.ok("timeline renders 5 phases", timeline.phases === 5, `${timeline.phases} phases, ${timeline.done} done`);
  rep.ok("timeline marks exactly one current phase", timeline.nowCount === 1,
    `${timeline.nowCount} · "${timeline.label}"`);
  rep.ok("timeline current-phase pulses",
    timeline.anim === "node-pulse" && parseFloat(timeline.dur) > 0,
    `animation=${timeline.anim} ${timeline.dur}`);

  // guide widget + its own chips work
  const hasGuide = await cdp.eval<boolean>(`!!document.getElementById('guideLauncher')`);
  rep.ok("system guide widget present", hasGuide);
  if (hasGuide) {
    await cdp.eval(`sessionStorage.clear()`);
    await cdp.click("#guideLauncher");
    await sleep(400);
    cdp.resetNet();
    const b0 = await cdp.eval<number>(`document.querySelectorAll('#guideMessages .msg--bot').length`);
    await cdp.click("#guideChips button[data-q]");
    await sleep(280);
    const b1 = await cdp.eval<number>(`document.querySelectorAll('#guideMessages .msg--bot').length`);
    await sleep(700);
    const calls = cdp.matching("/api/ai");
    rep.ok("system guide chip answers instantly", b1 > b0, `bots ${b0}→${b1}`);
    rep.ok("system guide chip ZERO /api/ai", calls.length === 0, `${calls.length} calls`);
  }

  noErrors();
}

// ═══════════════════════════════════════════════════════════════════════════
// /hub
// ═══════════════════════════════════════════════════════════════════════════
async function hubChecks(vp: string) {
  rep.ctx("/hub", vp);
  cdp.resetNet();
  await cdp.goto("/hub", 2600);

  rep.ok("hub polls /api/state", cdp.matching("/api/state").length >= 1,
    `${cdp.matching("/api/state").length} calls`);

  const ops = await cdp.eval<any>(`(() => ({
    dots: document.querySelectorAll('#sysdots .rwf-tag, #sysdots > *').length,
    matches: document.getElementById('matches').children.length,
    feed: document.getElementById('feed').children.length,
    sub: document.getElementById('matches-sub').textContent.trim(),
    uptime: document.getElementById('uptime').textContent.trim(),
  }))()`);
  rep.ok("hub ops tab renders", ops.dots > 0, `dots=${ops.dots} matches=${ops.matches} feed=${ops.feed} uptime="${ops.uptime}"`);

  // graceful when bots down — dots present and marked down rather than crashing
  const dotStates = await cdp.eval<any>(`(() => {
    const ids = ['dot-server','dot-hub','dot-whatsapp','dot-slack'];
    return ids.map(id => { const e = document.getElementById(id); return { id, ok: !!e, cls: e ? e.className : null }; });
  })()`);
  const missingDots = dotStates.filter((d: any) => !d.ok);
  rep.ok("hub status dots present (graceful when bots down)", missingDots.length === 0,
    dotStates.map((d: any) => `${d.id}:${(d.cls||"").replace(/rwf-dot ?/,"")}`).join(" "));

  // corporate tab: 5 panels with seed data
  await cdp.click("#tabbtn-corporate");
  await sleep(700);
  const corp = await cdp.eval<any>(`(() => {
    const t = document.getElementById('tab-corporate');
    const panels = [...t.querySelectorAll('.panel')];
    return {
      visible: !t.hidden,
      panels: panels.length,
      banner: t.querySelectorAll('.agg-banner').length,
      filled: panels.filter(p => p.textContent.replace(/\\s|—/g,'').length > 40).length,
      labels: panels.map(p => p.getAttribute('aria-label')),
      stats: (document.getElementById('wb-stats')||{}).children?.length ?? 0,
      orgs: (document.getElementById('orgs')||{}).children?.length ?? 0,
      pots: (document.getElementById('pots')||{}).children?.length ?? 0,
      renewal: (document.getElementById('renewal')||{}).children?.length ?? 0,
    };
  })()`);
  rep.ok("corporate tab shows", corp.visible);
  // 5 content regions = k≥5 banner + 4 data panels (wellbeing, orgs, pots, renewal)
  rep.ok("corporate tab has 4 data panels + k-anon banner (5 regions)",
    corp.panels === 4 && corp.banner === 1,
    `${corp.panels} panels + ${corp.banner} banner: ${(corp.labels||[]).join(" | ")}`);
  rep.ok("corporate panels show seed data", corp.filled === corp.panels,
    `${corp.filled}/${corp.panels} filled · orgs=${corp.orgs} pots=${corp.pots} renewal=${corp.renewal} wb=${corp.stats}`);

  // tabs switch back
  await cdp.click("#tabbtn-ops");
  await sleep(400);
  rep.ok("hub tabs toggle back to ops",
    await cdp.eval<boolean>(`!document.getElementById('tab-ops').hidden && document.getElementById('tab-corporate').hidden`));

  noErrors();
}

// ═══════════════════════════════════════════════════════════════════════════
// /debug
// ═══════════════════════════════════════════════════════════════════════════
async function debugChecks(vp: string) {
  rep.ctx("/debug", vp);
  await cdp.goto("/debug", 2200);

  const dots = await cdp.eval<number>(`document.querySelectorAll('#sysDots .rwf-tag').length`);
  rep.ok("debug system dots render", dots >= 4, `${dots} dots`);

  // engine lab: couch 100 → 150
  const labOut = await cdp.eval<string>(`(() => {
    const set = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
      d.set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const t = document.getElementById('labTier');
    t.value = 'couch'; t.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('labComeback').checked = false;
    document.getElementById('labHrr').checked = false;
    set(document.getElementById('labReps'), 100);
    return document.getElementById('labOut').textContent.trim();
  })()`);
  rep.ok("engine lab couch 100 → 150", /adjusted\s+150\.0/.test(labOut), `"${labOut}"`);

  // bot console: full match via /api/sim.
  // The store keys matches per chat and one player per userId, so drive a
  // FRESH chat each run — otherwise a leftover open match makes `new` a no-op
  // and the whole script degrades into warnings.
  const replies: string[] = [];
  const chatId = `e2e-${Date.now()}`;
  const cmds = [
    { text: "new", user: "Dave", userId: "dave" },
    { text: "join couch", user: "Dave", userId: "dave" },
    { text: "join athlete", user: "Ben", userId: "ben" },
    { text: "join fit", user: "Nico", userId: "nico" },
    { text: "start", user: "Dave", userId: "dave" },
    // the 300 target is PER PLAYER cumulative — one player must cross it to
    // close the match, so Ben banks 150 + 160 = 310 and closes
    { text: "log pushups 150", user: "Dave", userId: "dave" },
    { text: "log squats 150", user: "Ben", userId: "ben" },
    { text: "log pushups 160", user: "Ben", userId: "ben" },
    { text: "result", user: "Dave", userId: "dave" },
  ];
  let cardUrl: string | null = null;
  const warned: string[] = [];
  for (const c of cmds) {
    const r = await fetch("http://localhost:4173/api/sim", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...c, chatId }),
    });
    const d = await r.json() as any;
    const reply = String(d.reply ?? d.error ?? "");
    replies.push(`${c.text} → ${reply.slice(0, 70).replace(/\n/g, " ")}`);
    if (/^⚠️/.test(reply.trim())) warned.push(c.text);
    if (d.cardUrl) cardUrl = d.cardUrl;
  }
  rep.ok("bot console: new → join×3 → start → logs → result (no warnings)",
    warned.length === 0,
    warned.length ? `warned on: ${warned.join(", ")}` : cmds.map((c) => c.text).join(" · "));
  const resultReply = replies[replies.length - 1];
  rep.ok("bot console result produces a podium",
    /MATCH RESULT/i.test(resultReply) && /takes it/i.test(resultReply),
    resultReply.slice(0, 90));

  // result-card iframe renders
  if (cardUrl) {
    const path = new URL(cardUrl).pathname;
    const cr = await fetch("http://localhost:4173" + path);
    rep.ok("result card URL serves 200", cr.status === 200, `${path} → ${cr.status}`);
  } else {
    rep.ok("bot console emits a result card URL", false, "no cardUrl in any reply");
  }

  // drive the actual in-page console once, and check the iframe mounts
  await cdp.eval(`document.getElementById('termInput').value = 's'`);
  await cdp.eval(`document.getElementById('termForm').requestSubmit()`);
  await sleep(900);
  const termLines = await cdp.eval<number>(`document.getElementById('term').children.length`);
  rep.ok("in-page bot console echoes", termLines >= 3, `${termLines} lines`);

  // AI box answers (or, when the provider is out of quota, reports it clearly
  // rather than hanging on the "…" placeholder)
  await cdp.eval(`document.getElementById('aiInput').value = 'one word: ping'`);
  await cdp.eval(`document.getElementById('aiForm').requestSubmit()`);
  let aiOut = "";
  for (let i = 0; i < 25; i++) {
    await sleep(800);
    aiOut = await cdp.eval<string>(`document.getElementById('aiOut').textContent.trim()`);
    if (aiOut && aiOut !== "…") break;
  }
  if (aiQuotaExhausted) {
    rep.ok("AI box resolves during upstream outage (no stuck spinner)",
      !!aiOut && aiOut !== "…", `"${aiOut.slice(0, 70)}"`);
  } else {
    rep.ok("AI box answers", !!aiOut && aiOut !== "…" && !/unreachable/i.test(aiOut), `"${aiOut.slice(0, 70)}"`);
  }

  // element gallery statuses current (must agree with /system)
  const els = await cdp.eval<any[]>(`[...document.querySelectorAll('#elementGrid .dbg-el')].map(e => ({
    id: e.querySelector('b').textContent.trim(),
    st: e.querySelector('.st').textContent.trim(),
  }))`);
  rep.ok("element gallery renders", els.length > 0, `${els.length} elements`);
  const mustBeLive = ["E22", "E23", "G26", "G27", "G28", "G30"];
  const stale = els.filter((e) => mustBeLive.some((m) => e.id.startsWith(m + " ")) && e.st !== "LIVE");
  rep.ok("element gallery statuses current (E22/E23/G26-28/G30 live)", stale.length === 0,
    stale.map((s) => `${s.id}=${s.st}`).join(" ") || mustBeLive.join(",") + " LIVE");
  const gCount = els.filter((e) => /^G\d/.test(e.id)).length;
  rep.ok("element gallery includes the G-family", gCount === 11,
    `${gCount}/11 G elements`);

  // ── cross-surface consistency: /debug gallery vs /system family grid ─────
  // These two lists are maintained separately and have drifted before
  // (commit b1ed393 updated /system + docs but not /debug).
  const sysEls = await (async () => {
    await cdp.goto("/system", 1800);
    return cdp.eval<any[]>(`[...document.querySelectorAll('.fam-card')].map(c => ({
      id: c.querySelector('b').textContent.trim().split(/\\s+/)[0],
      st: c.querySelector('.st').textContent.trim(),
    }))`);
  })();
  const sysMap = new Map(sysEls.map((e: any) => [e.id, e.st]));
  const dbgMap = new Map(els.map((e: any) => [e.id.split(" ")[0], e.st]));
  const drift: string[] = [];
  for (const [id, st] of dbgMap) {
    if (id === "F") continue; // F entries are unnumbered on both surfaces
    const other = sysMap.get(id);
    if (other && other !== st) drift.push(`${id}: /debug=${st} /system=${other}`);
  }
  rep.ok("/debug and /system element statuses agree", drift.length === 0,
    drift.join(" · ") || `${dbgMap.size} vs ${sysMap.size} compared`);
  await cdp.goto("/debug", 1500);

  noErrors();
}

// ═══════════════════════════════════════════════════════════════════════════
// /connect
// ═══════════════════════════════════════════════════════════════════════════
async function connectChecks(vp: string) {
  rep.ctx("/connect", vp);
  await cdp.goto("/connect", 1500);

  await cdp.eval(`document.getElementById('codeInput').value = 'abc-123'`);
  await cdp.eval(`document.getElementById('codeForm').requestSubmit()`);
  await sleep(700);

  const out = await cdp.eval<any>(`(() => ({
    hidden: document.getElementById('result').hidden,
    cmd: document.getElementById('cmdText').textContent.trim(),
    group: document.getElementById('waGroup').getAttribute('href'),
    dm: document.getElementById('waDm').getAttribute('href'),
    qrSvg: document.querySelectorAll('#qrWrap svg').length,
    qrRects: document.querySelectorAll('#qrWrap svg rect, #qrWrap svg path').length,
  }))()`);
  const EXPECT = "https://wa.me/61493484788?text=link%20ABC123";
  rep.ok("crew code → wa.me link correct", out.group === EXPECT, `got ${out.group}`);
  rep.ok("both wa links identical", out.group === out.dm, `dm=${out.dm}`);
  rep.ok("command text is `link ABC123`", out.cmd === "link ABC123", `"${out.cmd}"`);
  rep.ok("QR renders SVG", out.qrSvg === 1 && out.qrRects > 0, `svg=${out.qrSvg} shapes=${out.qrRects}`);
  rep.ok("result panel revealed", out.hidden === false);

  // copy works
  await cdp.eval(`navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }`);
  await cdp.click("#copyNumber");
  await sleep(300);
  const copied = await cdp.eval<any>(`(() => ({ c: window.__copied, label: document.getElementById('copyNumber').textContent.trim() }))()`);
  rep.ok("copy number works", copied.c === "+61493484788", `copied="${copied.c}" label="${copied.label}"`);

  // ?code= prefill
  await cdp.goto("/connect?code=zz9", 1400);
  const pre = await cdp.eval<any>(`(() => ({
    val: document.getElementById('codeInput').value,
    href: document.getElementById('waGroup').getAttribute('href'),
    shown: !document.getElementById('result').hidden,
  }))()`);
  rep.ok("?code= prefills and submits", pre.shown && pre.href === "https://wa.me/61493484788?text=link%20ZZ9",
    `val="${pre.val}" href=${pre.href}`);

  noErrors();
}

// ═══════════════════════════════════════════════════════════════════════════
// /slack
// ═══════════════════════════════════════════════════════════════════════════
async function slackChecks(vp: string) {
  rep.ctx("/slack", vp);
  await cdp.goto("/slack", 1600);

  const man = await cdp.eval<any>(`(() => {
    const t = document.getElementById('manifestText').textContent;
    return { len: t.length, ok: t.includes('display_information') || t.includes('slash_commands'), head: t.slice(0, 40) };
  })()`);
  rep.ok("manifest loads", man.len > 100 && man.ok, `${man.len} chars: "${man.head.replace(/\n/g, " ")}"`);

  await cdp.eval(`navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }`);
  await cdp.click("#copyManifest");
  await sleep(300);
  const mc = await cdp.eval<any>(`(() => ({ len: (window.__copied||'').length, label: document.getElementById('copyManifest').textContent.trim() }))()`);
  rep.ok("manifest copies", mc.len > 100, `copied ${mc.len} chars, label="${mc.label}"`);

  // client-id form builds correct OAuth URL
  await cdp.eval(`document.getElementById('cidInput').value = '123456.7890'`);
  await cdp.eval(`document.getElementById('cidForm').requestSubmit()`);
  await sleep(500);
  const oauth = await cdp.eval<any>(`(() => ({
    url: document.getElementById('oauthUrl').textContent.trim(),
    href: document.getElementById('openOauth').getAttribute('href'),
    shown: !document.getElementById('cidResult').hidden,
  }))()`);
  let parsed: any = {};
  try {
    const u = new URL(oauth.url);
    parsed = { origin: u.origin + u.pathname, cid: u.searchParams.get("client_id"), scope: u.searchParams.get("scope") };
  } catch { /* bad url */ }
  rep.ok("OAuth URL base correct", parsed.origin === "https://slack.com/oauth/v2/authorize", `${parsed.origin}`);
  rep.ok("OAuth client_id correct", parsed.cid === "123456.7890", `${parsed.cid}`);
  rep.ok("OAuth scopes = commands,chat:write,app_mentions:read",
    parsed.scope === "commands,chat:write,app_mentions:read", `${parsed.scope}`);
  rep.ok("OAuth result shown + link href set", oauth.shown && oauth.href === oauth.url);

  // scopes must match the manifest
  const manScopes = await cdp.eval<string>(`document.getElementById('manifestText').textContent`);
  const inManifest = ["commands", "chat:write", "app_mentions:read"].filter((s) => manScopes.includes(s));
  rep.ok("page scopes match manifest scopes", inManifest.length === 3,
    `found in manifest: ${inManifest.join(",")}`);

  // ?client_id= prefill
  await cdp.goto("/slack?client_id=999.111", 1500);
  const pf = await cdp.eval<any>(`(() => ({
    val: document.getElementById('cidInput').value,
    shown: !document.getElementById('cidResult').hidden,
    url: document.getElementById('oauthUrl').textContent.trim(),
  }))()`);
  rep.ok("?client_id= prefill works", pf.shown && pf.val === "999.111" && pf.url.includes("client_id=999.111"),
    `val="${pf.val}" shown=${pf.shown}`);

  noErrors();
}

// ═══════════════════════════════════════════════════════════════════════════
// run
// ═══════════════════════════════════════════════════════════════════════════
const SUITES: [string, (vp: string) => Promise<void>][] = [
  ["/", siteChecks],
  ["/guide", guideChecks],
  ["/demo", demoChecks],
  ["/system", systemChecks],
  ["/hub", hubChecks],
  ["/debug", debugChecks],
  ["/connect", connectChecks],
  ["/slack", slackChecks],
];

await probeAi();

try {
  for (const vp of VPS) {
    console.log(`\n${"█".repeat(64)}\n VIEWPORT ${vp.tag}px\n${"█".repeat(64)}`);
    await cdp.viewport(vp.w, vp.h, vp.mobile);
    for (const [name, fn] of SUITES) {
      if (!want(name)) continue;
      console.log(`\n── ${name} @${vp.tag} ────────────────────────────────`);
      try {
        await fn(vp.tag);
      } catch (e: any) {
        rep.ok(`${name} suite crashed`, false, String(e?.message ?? e).slice(0, 200));
      }
    }
  }
} finally {
  await cdp.stop();
}

const failCount = rep.table();
console.log(`\n${failCount ? `❌ ${failCount} failing check(s)` : "✅ all checks green"}`);
