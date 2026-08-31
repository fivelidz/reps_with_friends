// v9 bind-state probe of the sleeve ROOT rings: for each ring 0-3 vert, how
// far is it from the nearest body vert (any) vs its chosen source (in-chain)?
// If far from ALL flesh → the ring balloons off the shoulder (geometric
// defect). If close to flesh but the in-chain src is far → sourcing defect.
(async () => {
  const T = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  const g = A.outfit.slots.tshirt[0];
  const der = g.userData.rwfDerived;
  const body = der.body;
  const BP = body.geometry.attributes.position;
  const BSW = body.geometry.attributes.skinWeight, BSI = body.geometry.attributes.skinIndex;
  const bones = body.skeleton.bones;
  const cm = 175 / (av.H * (av.root.getWorldScale(new T.Vector3()).x || 1));
  const domName = (vi) => { let dw = -1, d2 = 0; for (let j = 0; j < 4; j++) { const w = BSW.getComponent(vi, j); if (w > dw) { dw = w; d2 = BSI.getComponent(vi, j); } } return bones[d2].name.replace(/^mixamorig:/, ''); };
  // all body verts in world (bind == stand here)
  const bpts = [];
  for (let i = 0; i < BP.count; i++) bpts.push(new T.Vector3().fromBufferAttribute(BP, i));
  const nearestAll = (p) => { let bd = Infinity; for (const q of bpts) { const d = q.distanceToSquared(p); if (d < bd) bd = d; } return Math.sqrt(bd); };
  const GP = g.geometry.attributes.position;
  const out = [];
  // sleeves start at 1792; L: 1792..2368, R: 2369..2945; ring r vert = base + r*48 + k
  for (const [name, base] of [['L', 1792], ['R', 2369]]) {
    for (let r = 0; r <= 3; r++) {
      const row = { sleeve: name, ring: r, worstSrcCm: 0, worstAllCm: 0, worstK: -1, perK: [] };
      for (let k = 0; k < 48; k++) {
        const vi = base + r * 48 + k;
        if (vi >= GP.count) break;
        const p = new T.Vector3().fromBufferAttribute(GP, vi);
        const srcI = der.srcIndex[vi];
        const srcD = p.distanceTo(bpts[srcI]) * cm;
        const allD = nearestAll(p) * cm;
        if (srcD > row.worstSrcCm) { row.worstSrcCm = +srcD.toFixed(1); row.worstK = k; }
        if (allD > row.worstAllCm) row.worstAllCm = +allD.toFixed(1);
        if (srcD > 3) row.perK.push({ k, srcCm: +srcD.toFixed(1), allCm: +allD.toFixed(1), srcBone: domName(srcI) });
      }
      out.push(row);
    }
  }
  return out;
})()
