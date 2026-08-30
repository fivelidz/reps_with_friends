// Headless verification of the AnimationClip→Geno retargeter: real mocap
// clips (Soldier/Xbot GLB + exported demo-motion JSON) driving Geno through
// BVHPlayer. Checks per clip: pairs matched, no NaNs, stride/arm-swing
// energy, stance-foot planting (skating), hips bob, and cross-clip
// distinctness (pairwise joint-trajectory distance).
// Usage: bun scripts/avatars/geno_mocap_check.ts
// bun lacks DOM progress events — stub what three FileLoader fires
(globalThis as any).ProgressEvent ??= class ProgressEvent extends Event {};
(globalThis as any).createImageBitmap ??= (async (b: any) => ({ width: 2, height: 2, close() {} }));

import * as THREE from 'three';
import { FileLoader } from '../../site/lib/three.core.js';
import { loadModel, ModelAvatar, BVHPlayer, loadGenoClip, GENO_CLIPS } from '../../site/model-avatars.js';

const BASE = 'http://127.0.0.1:4173';
// resolve browser-relative asset paths against the dev server (bun has no origin)
const origFL = (FileLoader.prototype as any).load;
(FileLoader.prototype as any).load = function (url: string, ...rest: any[]) {
  return origFL.call(this, url?.startsWith('/') ? BASE + url : url, ...rest);
};
const origFetch = globalThis.fetch;
(globalThis as any).fetch = (url: any, ...rest: any[]) =>
  origFetch(typeof url === 'string' && url.startsWith('/') ? BASE + url : url, ...rest);

const CLIPS = ['walk', 'run', 'idle', 'demo_walk', 'demo_run', 'sprint', 'swagger', 'agree', 'headshake', 'sad', 'sneak', 'goblin_walk'];
const TRACKED = ['hips', 'head', 'footL', 'footR', 'handL', 'handR', 'armL', 'armR', 'upLegL', 'upLegR'] as const;

const scene = await loadModel(`${BASE}/models/Geno.glb`);
const av = new ModelAvatar(scene as any, 'mixamo');
av.root.scale.setScalar(1.5 / av.H);
av.root.updateMatrixWorld(true);
console.log(`Geno H=${av.H.toFixed(3)}`);

type Sample = { t: number; p: Record<string, THREE.Vector3> };
const series: Record<string, Sample[]> = {};
const stats: Record<string, any> = {};

for (const id of CLIPS) {
  const res = await loadGenoClip(id);
  const player = new BVHPlayer(av, res);
  av.root.updateMatrixWorld(true);
  const dur = player.duration;
  const dt = 1 / 30;
  const frames = Math.max(8, Math.min(120, Math.round(dur / dt)));
  const samples: Sample[] = [];
  for (let f = 0; f <= frames; f++) {
    player.update(dur / frames);
    av.root.updateMatrixWorld(true);
    const s = Math.max(1e-6, av.root.scale.x);
    const p: Record<string, THREE.Vector3> = {};
    for (const k of TRACKED) {
      const b = (av.bones as any)[k];
      p[k] = b ? b.getWorldPosition(new THREE.Vector3()).divideScalar(s) : new THREE.Vector3();
    }
    samples.push({ t: f / frames, p });
  }
  series[id] = samples;

  // NaN check
  let nan = false;
  scene.traverse((o: any) => { if (!Number.isFinite(o.quaternion.x) || !Number.isFinite(o.position.x)) nan = true; });

  // per-clip metrics over the loop
  const vel = (k: string, i: number) => samples[i + 1].p[k].clone().sub(samples[i].p[k]).multiplyScalar(1 / (dur / frames));
  let swingE = 0, n = 0;
  for (let i = 0; i < samples.length - 1; i++) for (const k of TRACKED) { swingE += vel(k, i).length(); n++; }
  const stride = Math.max(
    ...samples.map((s) => Math.abs(s.p.footL.z - s.p.footR.z)),
  );
  const strideX = Math.max(...samples.map((s) => Math.abs(s.p.footL.x - s.p.footR.x)));
  const armSwing = Math.max(...samples.map((s) => Math.abs(s.p.handL.z - s.p.handR.z)));
  const hipsBob = Math.max(...samples.map((s) => s.p.hips.y)) - Math.min(...samples.map((s) => s.p.hips.y));
  // skating: for each foot, frames where ankle height is within 20% of that
  // foot's min over the clip = stance; horizontal speed there should be small
  const skate: Record<string, number> = {};
  const skateP25: Record<string, number> = {};
  for (const k of ['footL', 'footR'] as const) {
    const ys = samples.map((s) => s.p[k].y);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const stanceTh = ymin + 0.2 * Math.max(1e-4, ymax - ymin);
    const st: number[] = [];
    for (let i = 0; i < samples.length - 1; i++) {
      if (ys[i] <= stanceTh) st.push(vel(k, i).setY(0).length());
    }
    st.sort((a, b) => a - b);
    skate[k] = st.length ? st.reduce((a, b) => a + b, 0) / st.length : NaN;
    skateP25[k] = st.length ? st[Math.floor(st.length * 0.25)] : NaN;
  }
  // min ground clearance (feet must not go under ground)
  const minY = Math.min(...samples.flatMap((s) => [s.p.footL.y, s.p.footR.y]));
  // torso up-axis sanity: R_align must leave every figure standing (Y-up)
  const upDot = samples.reduce((a, s) => a + s.p.head.clone().sub(s.p.hips).normalize().y, 0) / samples.length;

  stats[id] = {
    pairs: player.pairs.length, dur: +dur.toFixed(2), nan, upDot: +upDot.toFixed(2),
    energy: +(swingE / n).toFixed(3),
    stride: +stride.toFixed(3), strideX: +strideX.toFixed(3), armSwing: +armSwing.toFixed(3),
    hipsBob: +hipsBob.toFixed(3),
    skateL: +skate.footL.toFixed(3), skateR: +skate.footR.toFixed(3),
    skateP25L: +skateP25.footL.toFixed(3), skateP25R: +skateP25.footR.toFixed(3),
    minY: +minY.toFixed(3),
  };
  player.stop();
  console.log(id.padEnd(11), JSON.stringify(stats[id]));
}

// ── pairwise distinctness: mean joint distance between aligned clips ──
console.log('\npairwise mean joint distance (should be high between different behaviours):');
const ids = CLIPS;
const D: string[][] = [];
for (const a of ids) {
  const row: string[] = [];
  for (const b of ids) {
    if (a === b) { row.push('    -'); continue; }
    let sum = 0, n = 0;
    const na = series[a].length, nb = series[b].length;
    for (let i = 0; i < na; i++) {
      const j = Math.round((i / (na - 1)) * (nb - 1));
      for (const k of TRACKED) { sum += series[a][i].p[k].distanceTo(series[b][j].p[k]); n++; }
    }
    row.push((sum / n).toFixed(3).padStart(6));
  }
  D.push(row);
}
console.log([''.padEnd(11), ...ids.map((i) => i.slice(0, 6).padStart(6))].join(''));
ids.forEach((id, r) => console.log([id.padEnd(11), ...D[r]].join('')));
