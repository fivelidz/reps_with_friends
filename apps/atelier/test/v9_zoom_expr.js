// v9 core-class zoom — WHERE exactly are the core Δsource (4.39 tshirt @
// jumpingjack@0.50) and strain−body (5.05 @ swagger@0.25) worst offenders?
// Reports per-vert detail (strip/ring/k, expected vs live) with the physics
// displacement subtracted exactly like the probe's core class, plus the
// strain excess with and without the physics layer (is it physics, or is it
// construction?). Run via: bun apps/atelier/test/v9_quick.ts -f apps/atelier/test/v9_zoom_expr.js
(async () => {
  const DBG = window.__zoom_dbg = [];
  try {
  const T = await import('/site/lib/three.module.js');
  const M = await import('/site/model-avatars.js');
  const A = window.__atelier, av = A.avatar;
  A.pause(); A.setTurntable(false);
  const { garmentVerts } = await import('/site/models/geno-outfit.js');
  const s2 = av.root.getWorldScale(new T.Vector3()).x || 1;
  const cm = 175 / (s2 * av.H);
  const FP = A.fabricPhysics();

  const drive = async (kind, name, ph) => {
    if (kind === 'pose') { av.pose(name, ph); }
    else {
      const res = await M.loadGenoClip(name);
      const p = new M.BVHPlayer(av, res);
      p.time = ph * p.duration; p.update(0);
    }
    av.root.updateMatrixWorld(true);
    A.outfit.settle(0.4);
    av.root.updateMatrixWorld(true);
  };

  const analyse = () => {
    const out = { delta: [], strain: [], strainCorrected: 0 };
    for (const slot of ['tshirt', 'shorts']) {
      const g = A.outfit.slots[slot][0];
      const der = g.userData.rwfDerived;
      const skel = der.body.skeleton;
      const mats = skel.bones.map((b, i) => new T.Matrix4().multiplyMatrices(b.matrixWorld, skel.boneInverses[i]));
      const BSW = der.body.geometry.attributes.skinWeight, BSI = der.body.geometry.attributes.skinIndex;
      const BP = der.body.geometry.attributes.position;
      const lbs = (vi) => {
        const bind = new T.Vector3().fromBufferAttribute(BP, vi);
        const p = new T.Vector3();
        for (let j = 0; j < 4; j++) {
          const w = BSW.getComponent(vi, j); if (w <= 0) continue;
          const m = mats[BSI.getComponent(vi, j)]; if (!m) continue;
          const e = m.elements;
          p.x += w * (e[0] * bind.x + e[4] * bind.y + e[8] * bind.z + e[12]);
          p.y += w * (e[1] * bind.x + e[5] * bind.y + e[9] * bind.z + e[13]);
          p.z += w * (e[2] * bind.x + e[6] * bind.y + e[10] * bind.z + e[14]);
        }
        return p;
      };
      const verts = garmentVerts(g);
      const src = der.srcIndex, bd = der.bindDelta;
      const pd = FP ? FP.dispOf(g) : null;
      const dispMap = new Map(); if (pd) for (let i = 0; i < pd.idx.length; i++) dispMap.set(pd.idx[i], i);
      const tuckSet = new Set();
      for (const tr of der.tuckRings ?? []) for (let i = 0; i < tr.samples; i++) tuckSet.add(tr.start + i);
      const bodyLive = new Array(src.length);
      for (let k = 0; k < src.length && k < verts.length; k++) bodyLive[k] = lbs(src[k]);
      // strip map — fabric meshes have no rwfLayout; the layout is
      // deterministic: tshirt [torso (4+N+2 rings × 64), sleeveL, sleeveR
      // ((sleeveRings+2 fin) × 48 + 1 cap centre)]; shorts [shell, legL, legR].
      const fab = der.fabric ?? {};
      const regionOf = slot === 'tshirt'
        ? (() => {
          const ST = fab.samples ?? 64, N = fab.torsoRings ?? 22;
          const torsoEnd = (4 + N + 2) * ST;
          const SS = fab.sleeveSamples ?? 48, SR = (fab.sleeveRings ?? 10) + 2;
          const sleeveEnd = torsoEnd + SR * SS + 1;
          return (vi) => {
            if (vi < torsoEnd) return { strip: 'torso', ring: Math.floor(vi / ST), k: vi % ST };
            if (vi < sleeveEnd) { const o = vi - torsoEnd; return { strip: 'sleeveL', ring: Math.floor(o / SS), k: o % SS }; }
            const o = vi - sleeveEnd; return { strip: 'sleeveR', ring: Math.floor(o / SS), k: o % SS };
          };
        })()
        : (() => {
          const SS = fab.samples ?? 48, pel = fab.pelvisRings ?? 8, legs = fab.legRings ?? 11;
          const shellEnd = pel * SS;
          const legEnd = shellEnd + legs * SS + 1;
          return (vi) => {
            if (vi < shellEnd) return { strip: 'shell', ring: Math.floor(vi / SS), k: vi % SS };
            if (vi < legEnd) { const o = vi - shellEnd; return { strip: 'legL', ring: Math.floor(o / SS), k: o % SS }; }
            const o = vi - legEnd; return { strip: 'legR', ring: Math.floor(o / SS), k: o % SS };
          };
        })();
      // ── Δsource core (phys subtracted, tuck excluded) ──
      for (let k = 0; k < src.length && k < verts.length; k++) {
        let vx = verts[k].x, vy = verts[k].y, vz = verts[k].z;
        if (dispMap.has(k)) { const j = dispMap.get(k); vx -= pd.disp[j * 3]; vy -= pd.disp[j * 3 + 1]; vz -= pd.disp[j * 3 + 2]; }
        const dl = Math.hypot(vx - bodyLive[k].x, vy - bodyLive[k].y, vz - bodyLive[k].z);
        const expect = Math.hypot(bd[k * 3], bd[k * 3 + 1], bd[k * 3 + 2]) * s2;
        const dev = Math.abs(dl - expect);
        if (tuckSet.has(k) || dispMap.has(k)) continue;   // core class only
        if (dev > 0.02) out.delta.push({ slot, vi: k, ...regionOf(k), devCm: +(dev * cm).toFixed(2), liveCm: +(dl * cm).toFixed(2), expCm: +(expect * cm).toFixed(2) });
      }
      // ── strain per-edge (raw + phys-corrected) ──
      const gI = g.geometry.index, GP = g.geometry.attributes.position;
      const isPhys = (vi) => dispMap.has(vi);
      const corr = (vi, v) => { if (!dispMap.has(vi)) return v; const j = dispMap.get(vi); return new T.Vector3(v.x - pd.disp[j * 3], v.y - pd.disp[j * 3 + 1], v.z - pd.disp[j * 3 + 2]); };
      const gS = new T.Vector3(), bS = new T.Vector3();
      let maxG = 0, maxB = 0, maxGcorr = 0;
      const edge = (a, b) => {
        const bindG = gS.fromBufferAttribute(GP, a).distanceTo(new T.Vector3().fromBufferAttribute(GP, b));
        const liveG = verts[a].distanceTo(verts[b]) / s2;
        maxG = Math.max(maxG, (liveG - bindG) * cm);
        const ca = corr(a, verts[a]), cb = corr(b, verts[b]);
        maxGcorr = Math.max(maxGcorr, (ca.distanceTo(cb) / s2 - bindG) * cm);
        const bindB = new T.Vector3().fromBufferAttribute(BP, src[a]).distanceTo(new T.Vector3().fromBufferAttribute(BP, src[b]));
        const liveB = (bodyLive[a]?.distanceTo(bodyLive[b]) ?? 0) / s2;
        maxB = Math.max(maxB, (liveB - bindB) * cm);
        const excess = ((liveG - bindG) - (liveB - bindB)) * cm;
        if (excess > 0.03 && !isPhys(a) && !isPhys(b)) out.strain.push({ slot, a: regionOf(a), b: regionOf(b), excessCm: +excess.toFixed(2) });
      };
      for (let t = 0; t < gI.count; t += 3) { edge(gI.getX(t), gI.getX(t + 1)); edge(gI.getX(t + 1), gI.getX(t + 2)); edge(gI.getX(t + 2), gI.getX(t)); }
      out.strainCorrected = Math.max(out.strainCorrected, maxGcorr - maxB);
    }
    out.delta.sort((x, y) => y.devCm - x.devCm); out.delta = out.delta.slice(0, 10);
    out.strain.sort((x, y) => y.excessCm - x.excessCm); out.strain = out.strain.slice(0, 8);
    return out;
  };

  DBG.push('cases-ready');
  const cases = [
    { kind: 'pose', name: 'jumpingjack', ph: 0.5 },
    { kind: 'clip', name: 'goblin_arm', ph: 0.5 },
    { kind: 'clip', name: 'swagger', ph: 0.25 },
    { kind: 'clip', name: 'headshake', ph: 0.25 },
  ];
  const res = {};
  for (const c of cases) {
    await drive(c.kind, c.name, c.ph);
    DBG.push('driven:' + c.name);
    res[`${c.name}@${c.ph}`] = analyse();
    DBG.push('analysed:' + c.name + ' n=' + res[`${c.name}@${c.ph}`].delta.length);
  }
  return { dbg: DBG, res };
  } catch (e) { return { dbg: [...DBG], err: String(e && e.stack || e).slice(0, 600) };
  }
})()
