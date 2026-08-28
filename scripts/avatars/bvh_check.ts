// Headless BVHPlayer verification: Geno + goblin_walk_stick.bvh
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { ModelAvatar, BVHPlayer } from '../../site/model-avatars.js';
import { BVHLoader } from '../../site/lib/BVHLoader.js';

function parseGlb(path: string) {
  const data = readFileSync(path);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let off = 12, json: any = null;
  while (off < data.length) {
    const clen = dv.getUint32(off, true), ctype = dv.getUint32(off + 4, true);
    if (ctype === 0x4e4f534a) json = JSON.parse(data.subarray(off + 8, off + 8 + clen).toString());
    off += 8 + clen;
  }
  return json;
}
function buildScene(path: string): THREE.Group {
  const json = parseGlb(path);
  const joints = new Set<number>();
  for (const sk of json.skins ?? []) for (const j of sk.joints ?? []) joints.add(j);
  const objects: THREE.Object3D[] = json.nodes.map((n: any) => {
    const o = joints.has(json.nodes.indexOf(n)) ? new THREE.Bone() : new THREE.Group();
    o.name = n.name ?? '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    (o as any).geometry = g;
    return o;
  });
  json.nodes.forEach((n: any, i: number) => { for (const c of n.children ?? []) objects[i].add(objects[c]); });
  const root = new THREE.Group();
  json.nodes.forEach((n: any, i: number) => {
    const hasParent = json.nodes.some((m: any) => (m.children ?? []).includes(i));
    if (!hasParent) root.add(objects[i]);
  });
  return root;
}

const scene = buildScene('site/models/Geno.glb');
const av = new ModelAvatar(scene as any, 'mixamo');
av.root.scale.setScalar(1.5 / av.H);
console.log(`Geno H=${av.H.toFixed(3)} pairs expect 62`);

const text = readFileSync('site/models/goblin_walk_stick.bvh', 'utf8');
const t0 = Date.now();
const bvh = new BVHLoader().parse(text);
console.log(`BVH parsed in ${Date.now() - t0}ms, clip ${bvh.clip.duration.toFixed(1)}s`);

const player = new BVHPlayer(av, bvh);
console.log(`player: ${player.pairs.length} matched pairs, scale=${player.scale.toFixed(4)}`);

const B = av.bones;
const wp = (b?: THREE.Bone) => (b ? b.getWorldPosition(new THREE.Vector3()).divideScalar(av.root.scale.x) : null);
const wq = (b?: THREE.Bone) => (b ? b.getWorldQuaternion(new THREE.Quaternion()) : null);

// sample a stride: over one walk cycle, ankles should alternate leading,
// arms should swing opposite to legs, hips should bob.
console.log('\nt(s)  hipsY  ankL_z ankR_z  ankL_y ankR_y  handL_z handR_z  head_z');
for (let t = 0; t < 1.4; t += 0.1) {
  player.update(0.1);
  av.root.updateMatrixWorld(true);
  const hips = wp(B.hips)!, aL = wp(B.footL)!, aR = wp(B.footR)!;
  const hL = wp(B.handL)!, hR = wp(B.handR)!, hd = wp(B.head)!;
  console.log(
    player.time.toFixed(2).padStart(5),
    hips.y.toFixed(3).padStart(6),
    aL.z.toFixed(2).padStart(7), aR.z.toFixed(2).padStart(7),
    aL.y.toFixed(2).padStart(7), aR.y.toFixed(2).padStart(7),
    hL.z.toFixed(2).padStart(7), hR.z.toFixed(2).padStart(7),
    hd.z.toFixed(2).padStart(7),
  );
}
// facing check: head-to-toe axis should have toes +Z of head (facing camera +Z)
av.root.updateMatrixWorld(true);
const hd = wp(B.head)!, tl = wp(B.toeL)!;
console.log(`\nfacing: toeL.z - head.z = ${(tl.z - hd.z).toFixed(3)} (>0 → faces +Z/camera)`);
// sanity: no NaNs
let nan = false;
scene.traverse((o: any) => {
  if (!Number.isFinite(o.quaternion.x) || !Number.isFinite(o.position.x)) nan = true;
});
console.log('NaN check:', nan ? 'FAIL' : 'ok');
