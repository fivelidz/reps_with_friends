// Cross-cutting: prefers-reduced-motion must be honoured on EVERY public
// surface — no /demo autoplay, static avatars, no pulsing/looping animation.
// Chromium is launched with --force-prefers-reduced-motion=reduce.
//
// Run: bun apps/web/test/reduced-motion.ts   (needs `bun serve.ts` on :4173)

import { Cdp, Report, sleep } from "./cdp.ts";

const SURFACES = ["/", "/demo", "/system", "/hub", "/debug", "/connect", "/slack"];

const cdp = new Cdp(9433, "/tmp/rwf-e2e-rm");
await cdp.start(true); // ← reduced motion forced
const rep = new Report();

// Any element still running an *infinite* animation is a violation: those are
// the attention-grabbing loops (pulse rings, shimmer, marquee) the setting is
// meant to stop. Finite one-shot transitions are acceptable.
const INFINITE_ANIM = `(() => {
  const bad = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('*')) {
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo);
      const name = cs.animationName;
      if (!name || name === 'none') continue;
      const iter = cs.animationIterationCount;
      const dur = parseFloat(cs.animationDuration) || 0;
      if (iter !== 'infinite' || dur === 0) continue;
      // element must actually be visible to matter
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      const key = name + '|' + (el.className || el.tagName) + '|' + (pseudo || '');
      if (seen.has(key)) continue;
      seen.add(key);
      bad.push({
        anim: name,
        dur: cs.animationDuration,
        pseudo: pseudo || '',
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 48),
      });
    }
  }
  return bad;
})()`;

try {
  for (const [w, h, tag] of [[390, 844, "390"], [1280, 900, "1280"]] as const) {
    console.log(`\n${"█".repeat(64)}\n REDUCED MOTION @${tag}px\n${"█".repeat(64)}`);
    await cdp.viewport(w, h, tag === "390");

    for (const path of SURFACES) {
      rep.ctx(path, tag);
      await cdp.goto(path, path === "/" || path === "/demo" ? 3000 : 2000);

      // the media query must actually be active in the page
      const rm = await cdp.eval<boolean>(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
      rep.ok("prefers-reduced-motion active", rm);

      const bad = await cdp.eval<any[]>(INFINITE_ANIM);
      rep.ok("no infinite animations", bad.length === 0,
        bad.slice(0, 4).map((b) => `${b.anim}${b.pseudo} .${b.cls}`).join(" · "));

      // ── surface-specific expectations ──────────────────────────────────
      if (path === "/demo") {
        // must NOT autoplay: the visitor presses play deliberately
        await sleep(1800);
        const st = await cdp.eval<any>(`(() => ({
          btn: document.getElementById('btnPlay').textContent.trim(),
          chat: document.getElementById('chat').children.length,
        }))()`);
        rep.ok("/demo does NOT autoplay under reduced motion",
          st.btn.includes("Play") && st.chat === 0, `btn="${st.btn}" chat=${st.chat}`);

        // Avatars static. Sample the GL drawing buffer inside rAF — headless
        // Chromium does not recomposite this WebGL layer between screenshots,
        // so a screenshot comparison would report "static" no matter what.
        const glHash = `new Promise((res) => {
          const c = document.querySelector('#squadStripCanvas canvas');
          if (!c) return res(null);
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          if (!gl) return res(null);
          requestAnimationFrame(() => {
            const px = new Uint8Array(c.width * c.height * 4);
            gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
            let h = 0; for (let i = 0; i < px.length; i += 16) h = (h * 31 + px[i]) >>> 0;
            res(h);
          });
        })`;
        await cdp.eval(`document.getElementById('squadStrip').scrollIntoView({ block: 'center', behavior: 'instant' })`);
        await sleep(500);
        const shots: any[] = [];
        for (let i = 0; i < 5; i++) { shots.push(await cdp.eval<any>(glHash)); await sleep(350); }
        if (shots[0] !== null) {
          rep.ok("/demo avatar strip is static", new Set(shots).size === 1,
            `${new Set(shots).size} distinct frames of ${shots.length}`);
        }

        // pressing play still works — reduced motion limits ambience, not agency
        await cdp.click("#btnPlay");
        await sleep(1500);
        const after = await cdp.eval<number>(`document.getElementById('chat').children.length`);
        rep.ok("/demo still plays when asked", after > 0, `${after} messages`);
      }

      if (path === "/") {
        // hero rep counter must not tick on its own
        const r1 = await cdp.eval<string>(`document.getElementById('repCount').textContent`);
        await sleep(3000);
        const r2 = await cdp.eval<string>(`document.getElementById('repCount').textContent`);
        rep.ok("hero rep counter frozen", r1 === r2, `${r1} → ${r2}`);

        // squad avatars static
        await cdp.eval(`document.getElementById('squad').scrollIntoView({ block:'center', behavior:'instant' })`);
        await sleep(1200);
        const c1 = await cdp.eval<string>(`document.getElementById('squadCounters').textContent`);
        await sleep(2200);
        const c2 = await cdp.eval<string>(`document.getElementById('squadCounters').textContent`);
        rep.ok("squad avatars static", c1 === c2, `counters changed=${c1 !== c2}`);

        // guide launcher must not pulse
        const pulse = await cdp.eval<any>(`(() => {
          const l = document.getElementById('guideLauncher');
          const cs = getComputedStyle(l);
          return { cls: l.className, anim: cs.animationName, iter: cs.animationIterationCount };
        })()`);
        rep.ok("guide launcher does not pulse", pulse.anim === "none" || pulse.iter !== "infinite",
          `anim=${pulse.anim} iter=${pulse.iter}`);

        // and must not auto-open
        await sleep(3200);
        rep.ok("guide does not auto-open under reduced motion",
          !(await cdp.eval<boolean>(`document.getElementById('guidePanel').classList.contains('open')`)));
      }

      if (path === "/system") {
        // reveals resolved (content visible, not stuck at opacity 0)
        const hidden = await cdp.eval<number>(`[...document.querySelectorAll('.reveal')].filter(e => !e.classList.contains('in')).length`);
        rep.ok("/system reveals resolved immediately", hidden === 0, `${hidden} unrevealed`);
        // family bars filled without needing scroll animation
        const bars = await cdp.eval<any>(`(() => {
          const b = [...document.querySelectorAll('.fam-bar')];
          return { total: b.length, go: b.filter(x => x.classList.contains('go')).length };
        })()`);
        rep.ok("/system family bars filled instantly", bars.go === bars.total, `${bars.go}/${bars.total}`);
        // count-ups show final values
        const counts = await cdp.eval<any[]>(`[...document.querySelectorAll('[data-count]')].map(e => ({ t: e.dataset.count, s: e.textContent.trim() }))`);
        const wrong = counts.filter((c) => !c.s.startsWith(String(c.t)));
        rep.ok("/system count-ups show final value", wrong.length === 0,
          wrong.length ? JSON.stringify(wrong.slice(0, 3)) : counts.map((c) => c.s).join(" "));
      }

      const errs = cdp.consoleErrors.filter((e) => !/favicon/i.test(e) && !/\/api\/ai/.test(e));
      rep.ok("zero console errors", errs.length === 0, errs.slice(0, 2).join(" | ").slice(0, 180));
    }
  }
} finally {
  await cdp.stop();
}

const fails = rep.table();
console.log(`\n${fails ? `❌ ${fails} reduced-motion violation(s)` : "✅ reduced motion honoured everywhere"}`);
