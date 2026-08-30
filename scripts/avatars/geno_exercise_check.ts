// Headless verification of the rebuilt exercise poses on Geno.
// Push-up: planted hands/toes (world Y ≈ const), rigid body line (max
// deviation of hips/knees from the ankle→shoulder line), elbow DIRECTION
// (must sit on the feet-side of the shoulder→hand line — no backward/
// ceiling elbows), depth (chest height at bottom).
// Squat: heels planted all phases, depth (hip drop), knee-forward tracking.
// Jumping jack: foot spread symmetry, arm overhead reach.
// Curl: forearm sweep range, upper-arm stability.
// Usage: bun scripts/avatars/geno_exercise_check.ts
(globalThis as any).ProgressEvent ??= class extends Event {};
(globalThis as any).createImageBitmap ??= (async () => ({ width: 2, height: 2, close() {} }));

import * as THREE from 'three';
import { FileLoader } from '../../site/lib/three.core.js';
import { loadModel, ModelAvatar } from '../../site/model-avatars.js';

const BASE = 'http://127.0.0.1:4173';
const origFL = (FileLoader.prototype as any).load;
(FileLoader.prototype as any).load = function (url: string, ...rest: any[]) {
  return origFL.call(this, url?.startsWith('/') ? BASE + url : url, ...rest);
};
const origFetch = globalThis.fetch;
(globalThis as any).fetch = (url: any, ...rest: any[]) =>
  origFetch(typeof url === 'string' && url.startsWith('/') ? BASE + url : url, ...rest);

const scene = await loadModel('/models/Geno.glb');
const av = new ModelAvatar(scene as any, 'mixamo');
av.root.scale.setScalar(1.5 / av.H);
av.root.updateMatrixWorld(true);
const B = av.bones as any;
const s = av.root.scale.x;
const rp = (b?: THREE.Bone) => (b ? b.getWorldPosition(new THREE.Vector3()).divideScalar(s) : new THREE.Vector3());
const H = av.H;

function lineDev(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(p, a).dot(ab) / Math.max(1e-9, ab.lengthSq())));
  return new THREE.Vector3().subVectors(p, a).sub(ab.multiplyScalar(t)).length();
}

// ── PUSH-UP ─────────────────────────────────────────────────────────────────
console.log('── push-up ──');
{
  const rows: string[] = [];
  let worstToe = 0, worstHand = 0, worstDev = 0, elbowBad = 0, elbowTotal = 0;
  for (const p of [0, 0.25, 0.5, 0.75, 1.0]) {
    av.pose('pushup', p);
    av.root.updateMatrixWorld(true);
    const toeY = Math.min(rp(B.toeL).y, rp(B.toeR).y);
    const handY = Math.min(rp(B.handL).y, rp(B.handR).y);
    // body line: ankle → shoulder
    const ank = rp(B.footL).add(rp(B.footR)).multiplyScalar(0.5);
    const sh = rp(B.armL).add(rp(B.armR)).multiplyScalar(0.5);
    const dev = Math.max(lineDev(rp(B.hips), ank, sh), lineDev(rp(B.legL), ank, sh), lineDev(rp(B.legR), ank, sh), lineDev(rp(B.spine2), ank, sh));
    // elbow direction: elbow must be on the FEET side of the shoulder→hand line
    for (const [arm, fore, hand] of [[B.armL, B.foreL, B.handL], [B.armR, B.foreR, B.handR]] as const) {
      const shP = rp(arm), elP = rp(fore), haP = rp(hand);
      const sh2ha = new THREE.Vector3().subVectors(haP, shP);
      const feetDir = new THREE.Vector3().subVectors(ank, sh); // toward feet
      const off = new THREE.Vector3().subVectors(elP, shP).sub(sh2ha.clone().multiplyScalar(
        Math.max(0, Math.min(1, new THREE.Vector3().subVectors(elP, shP).dot(sh2ha) / Math.max(1e-9, sh2ha.lengthSq())))
      ));
      elbowTotal++;
      if (off.dot(feetDir) <= 0) elbowBad++;
    }
    worstToe = Math.max(worstToe, Math.abs(toeY - 0.02 * H));
    worstHand = Math.max(worstHand, Math.abs(handY - 0.03 * (B.armL ? rp(B.foreL).distanceTo(rp(B.handL)) + rp(B.armL).distanceTo(rp(B.foreL)) : 0.5)));
    worstDev = Math.max(worstDev, dev);
    rows.push(`p=${p.toFixed(2)} toeY=${toeY.toFixed(3)} handY=${handY.toFixed(3)} hipsY=${rp(B.hips).y.toFixed(3)} lineDev=${dev.toFixed(3)}`);
  }
  rows.forEach((r) => console.log(r));
  console.log(`worst toe Δ=${worstToe.toFixed(3)} hand Δ=${worstHand.toFixed(3)} line dev=${worstDev.toFixed(3)} (H=${H.toFixed(2)}; dev<4%H=${(0.04*H).toFixed(3)} = rigid plank)`);
  console.log(`elbow direction: ${elbowBad}/${elbowTotal} phases with elbow NOT on feet side (want 0)`);
}

// ── SQUAT ───────────────────────────────────────────────────────────────────
console.log('── squat ──');
{
  for (const p of [0, 0.25, 0.5, 0.75, 1.0]) {
    av.pose('squat', p);
    av.root.updateMatrixWorld(true);
    const heel = Math.min(rp(B.footL).y, rp(B.footR).y);
    const hips = rp(B.hips);
    const knee = rp(B.legL);
    const toe = rp(B.toeL);
    console.log(`p=${p.toFixed(2)} heelY=${heel.toFixed(3)} hipsY=${hips.y.toFixed(3)} drop=${(rp(B.hips).y).toFixed(3)} kneeFwdOfToe=${((knee.z - toe.z) / H).toFixed(3)}H`);
  }
}

// ── JUMPING JACK ────────────────────────────────────────────────────────────
console.log('── jumping jack ──');
{
  for (const p of [0.25, 0.5]) { // 0.25 = max spread (t=1), 0.5 = feet together
    av.pose('jumpingjack', p);
    av.root.updateMatrixWorld(true);
    const spread = Math.abs(rp(B.footL).x - rp(B.footR).x);
    const handY = Math.max(rp(B.handL).y, rp(B.handR).y);
    console.log(`p=${p.toFixed(2)} footSpread=${(spread / H).toFixed(3)}H handMaxY=${(handY / H).toFixed(3)}H`);
  }
}

// ── CURL ────────────────────────────────────────────────────────────────────
console.log('── curl ──');
{
  for (const p of [0, 0.5]) {
    av.pose('curl', p);
    av.root.updateMatrixWorld(true);
    const sh = rp(B.armL), el = rp(B.foreL), ha = rp(B.handL);
    const v1 = new THREE.Vector3().subVectors(el, sh);
    const v2 = new THREE.Vector3().subVectors(ha, el);
    const ang = Math.acos(Math.max(-1, Math.min(1, v1.normalize().dot(v2.normalize()))));
    console.log(`p=${p.toFixed(2)} elbowFlex=${((Math.PI - ang) * 180 / Math.PI).toFixed(0)}° handY=${rp(B.handL).y.toFixed(3)}`);
  }
}
console.log('NaN sweep:', (() => {
  let nan = false;
  scene.traverse((o: any) => { if (!Number.isFinite(o.quaternion.x) || !Number.isFinite(o.position.x)) nan = true; });
  return nan ? 'FAIL' : 'ok';
})());
