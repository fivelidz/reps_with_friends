// v9 root-ring forensics: what flesh sets the ring0 k≈11 radius? Dumps the
// ring pt, the basis, and the arm-chain flesh near that θ with bone names.
(async () => {
  const T = await import('/site/lib/three.module.js');
  const A = window.__atelier, av = A.avatar;
  av.pose('stand', 0.35); av.root.updateMatrixWorld(true);
  const g = A.outfit.slots.tshirt[0];
  const GP = g.geometry.attributes.position;
  const base = 1792;   // sleeveL start
  const cm = 175 / av.H;
  const pti = (vi) => new T.Vector3().fromBufferAttribute(GP, vi);
  // arm axis from bones (bind): shoulder → elbow
  const skel = A.outfit.slots.tshirt[0].userData.rwfDerived.body.skeleton;
  const rawName = (n) => n.replace(/^mixamorig:/, '');
  const bonePos = (n) => { const b = skel.bones.find((x) => rawName(x.name) === n); const m = new T.Matrix4().copy(skel.boneInverses[skel.bones.indexOf(b)]).invert(); return new T.Vector3().setFromMatrixPosition(m); };
  const a0 = bonePos('LeftArm'), a1 = bonePos('LeftForeArm');
  const ax = a1.clone().sub(a0).normalize();
  // basis EXACTLY like the builder's planeBasis (geno-derived.js)
  const e1 = new T.Vector3(0, 0, 1);
  if (Math.abs(ax.z) > 0.9) e1.set(1, 0, 0);
  e1.addScaledVector(ax, -e1.dot(ax)).normalize();
  const e2 = new T.Vector3().crossVectors(ax, e1).normalize();
  const armLen = a0.distanceTo(a1);
  const body = g.userData.rwfDerived.body;
  const BP = body.geometry.attributes.position;
  const BSW = body.geometry.attributes.skinWeight, BSI = body.geometry.attributes.skinIndex;
  const domOf = (vi) => { let dw = -1, d2 = 0; for (let j = 0; j < 4; j++) { const w = BSW.getComponent(vi, j); if (w > dw) { dw = w; d2 = BSI.getComponent(vi, j); } } return rawName(skel.bones[d2].name); };
  const chain = new Set(['LeftShoulder', 'LeftArm', 'LeftForeArm', 'Spine', 'Spine1', 'Spine2', 'Spine3']);
  const out = { ring0: [], fleshNearK11: [] };
  for (const k of [5, 9, 11, 13, 17]) {
    const p = pti(base + k);
    out.ring0.push({ k, posCm: [+(p.x * cm).toFixed(1), +(p.y * cm).toFixed(1), +(p.z * cm).toFixed(1)], rCm: +(Math.hypot(p.clone().sub(a0).dot(e1), p.clone().sub(a0).dot(e2)) * cm).toFixed(1) });
  }
  // flesh in θ band around k=11's angle, any t near root
  const d = new T.Vector3();
  for (let i = 0; i < BP.count; i++) {
    const n = domOf(i);
    if (!chain.has(n)) continue;
    d.fromBufferAttribute(BP, i).sub(a0);
    const t = d.dot(ax) / armLen;
    if (t < -0.08 || t > 0.06) continue;
    const aa = d.dot(e1), bb = d.dot(e2);
    const th = Math.atan2(bb, aa);
    const thK11 = (11 / 48) * 2 * Math.PI;
    let dd = Math.abs(th - thK11); dd = Math.min(dd, 2 * Math.PI - dd);
    if (dd > 0.25) continue;   // ~14° around the k=11 angle
    const r = Math.hypot(aa, bb) * cm;
    if (r > 5) out.fleshNearK11.push({ bone: n, t: +t.toFixed(3), rCm: +r.toFixed(1), yCm: +(BP.getY(i) * cm).toFixed(1), thDeg: +(th * 180 / Math.PI).toFixed(0) });
  }
  out.fleshNearK11.sort((a, b) => b.rCm - a.rCm);
  out.fleshNearK11 = out.fleshNearK11.slice(0, 12);
  // basis directions for interpreting θ
  out.basis = { e1: [+(e1.x).toFixed(2), +(e1.y).toFixed(2), +(e1.z).toFixed(2)], e2: [+(e2.x).toFixed(2), +(e2.y).toFixed(2), +(e2.z).toFixed(2)], ax: [+(ax.x).toFixed(2), +(ax.y).toFixed(2), +(ax.z).toFixed(2)], armLenCm: +(armLen * cm).toFixed(1) };
  return out;
})()
