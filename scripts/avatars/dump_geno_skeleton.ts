// scripts/avatars/dump_geno_skeleton.ts — print Geno.glb bone tree + bind world
// positions (scene-local = skinning bind space) + the body SkinnedMesh skeleton
// info. Scratch diagnostic for the wardrobe skinning rebuild.
import { readFileSync } from 'node:fs';
import * as THREE from '../../site/lib/three.module.js';

const buf = readFileSync(new URL('../../site/models/Geno.glb', import.meta.url));
const { GLTFLoader } = await import('../../site/lib/GLTFLoader.js');
const gltf: any = await new Promise<any>((res, rej) =>
  new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
const scene = gltf.scene;
scene.updateMatrixWorld(true);

let body: any = null;
scene.traverse((o: any) => { if (!body && o.isSkinnedMesh) body = o; });
console.log(`body "${body.name}" verts=${body.geometry.attributes.position.count} bones=${body.skeleton.bones.length}`);

// ── replicate geno-wardrobe's bodyCloud + ringExtent ──
const P = body.geometry.attributes.position;
const SI = body.geometry.attributes.skinIndex;
const SW = body.geometry.attributes.skinWeight;
const pts: Array<{x:number,y:number,z:number,b:number}> = [];
for (let i = 0; i < P.count; i++) {
  let bi = 0, bw = -1;
  for (let k = 0; k < 4; k++) {
    const w = [SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)][k];
    if (w > bw) { bw = w; bi = [SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)][k]; }
  }
  pts.push({ x: P.getX(i), y: P.getY(i), z: P.getZ(i), b: bi });
}
const boneName = (i: number) => body.skeleton.bones[i]?.name ?? `#${i}`;
const idxOf = (n: string) => body.skeleton.bones.findIndex((b: any) => b.name === n);
const TORSO = new Set(['Hips', 'Spine', 'Spine1', 'Spine2', 'Spine3'].map(idxOf));
const LUP = idxOf('LeftUpLeg'), RUP = idxOf('RightUpLeg');

const extent = (set: Set<number> | number[], c: number[], nY: number, slab: number) => {
  let rx = 0, rz = 0, n = 0;
  for (const v of pts) {
    const inSet = typeof (set as any).has === 'function' ? (set as Set<number>).has(v.b) : (set as number[]).includes(v.b);
    if (!inSet) continue;
    if (Math.abs(v.y - c[1]) > slab) continue;
    n++;
    if (Math.abs(v.x - c[0]) > rx) rx = Math.abs(v.x - c[0]);
    if (Math.abs(v.z - c[2]) > rz) rz = Math.abs(v.z - c[2]);
  }
  return { rx, rz, n };
};

console.log('\nTORSO ring extents (centre x≈0, z at chain):');
for (let y = 0.70; y <= 1.42; y += 0.04) {
  const e = extent(TORSO, [0, y, -0.035], y, 0.035);
  console.log(`  y=${y.toFixed(2)}  rx=${e.rx.toFixed(3)} rz=${e.rz.toFixed(3)}  (n=${e.n})`);
}
console.log('\nTHIGH extents (per side, centre on hip→knee axis):');
const jp = (n: string) => { const k = idxOf(n); return new THREE.Vector3().setFromMatrixPosition(body.skeleton.boneInverses[k].clone().invert()); };
for (const [nm, bi] of [['L', LUP], ['R', RUP]] as Array<[string, number]>) {
  const hip = jp(nm === 'L' ? 'LeftUpLeg' : 'RightUpLeg');
  const knee = jp(nm === 'L' ? 'LeftLeg' : 'RightLeg');
  const axis = knee.clone().sub(hip); const L = axis.length(); axis.normalize();
  for (const t of [0.24, 0.33, 0.42, 0.52, 0.6]) {
    const c = hip.clone().addScaledVector(axis, t * L);
    const e = extent([bi], [c.x, c.y, c.z], 0, 0.086);
    console.log(`  ${nm} t=${t.toFixed(2)} y=${c.y.toFixed(2)}  rx=${e.rx.toFixed(3)} rz=${e.rz.toFixed(3)} (n=${e.n})`);
  }
}
// dominant-bone census around the torso — are torso verts actually TORSO-dominant?
const census: Record<string, number> = {};
for (const v of pts) if (v.y > 0.95 && v.y < 1.4 && Math.abs(v.x) < 0.25) census[boneName(v.b)] = (census[boneName(v.b)] ?? 0) + 1;
console.log('\ndominant-bone census, torso box y∈[0.95,1.4] |x|<0.25:', census);
const census2: Record<string, number> = {};
for (const v of pts) if (v.y > 0.72 && v.y < 0.95 && Math.abs(v.x) < 0.25) census2[boneName(v.b)] = (census2[boneName(v.b)] ?? 0) + 1;
console.log('dominant-bone census, pelvis box y∈[0.72,0.95] |x|<0.25:', census2);
