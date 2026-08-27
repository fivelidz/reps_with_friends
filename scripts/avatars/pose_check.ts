// scripts/avatars/pose_check.ts — offline verification of the model-avatars
// posing system. Parses a GLB directly (no GLTFLoader/browser), builds a bone
// hierarchy, runs the REAL ModelAvatar from site/model-avatars.js, and
// measures objective pose metrics. Usage:
//   bun scripts/avatars/pose_check.ts [orc.glb] [rig]
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { ModelAvatar } from '../../site/model-avatars.js';

function parseGlb(path: string) {
  const data = readFileSync(path);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let off = 12, json: any = null, binStart = 0;
  while (off < data.length) {
    const clen = dv.getUint32(off, true), ctype = dv.getUint32(off + 4, true);
    if (ctype === 0x4e4f534a) json = JSON.parse(data.subarray(off + 8, off + 8 + clen).toString());
    else if (ctype === 0x004e4942) binStart = off + 8;
    off += 8 + clen;
  }
  return { json, data, binStart };
}

/** build a THREE bone hierarchy from the glTF nodes (bones = skin joints) */
function buildScene(path: string): THREE.Group {
  const { json } = parseGlb(path);
  const joints = new Set<number>();
  for (const sk of json.skins ?? []) for (const j of sk.joints ?? []) joints.add(j);
  const objects: THREE.Object3D[] = json.nodes.map((n: any) => {
    const o = joints.has(json.nodes.indexOf(n)) ? new THREE.Bone() : new THREE.Group();
    o.name = n.name ?? '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    // give every node a point geometry so Box3.setFromObject sees joint positions
    // (real GLBs have skinned meshes; this harness is bones-only)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    (o as any).geometry = g;
    return o;
  });
  json.nodes.forEach((n: any, i: number) => {
    for (const c of n.children ?? []) objects[i].add(objects[c]);
  });
  const root = new THREE.Group();
  json.nodes.forEach((n: any, i: number) => {
    const hasParent = json.nodes.some((m: any) => (m.children ?? []).includes(i));
    if (!hasParent) root.add(objects[i]);
  });
  return root;
}

const file = process.argv[2] ?? 'site/models/orc.glb';
const rig = process.argv[3] ?? 'rigify';
const scene = buildScene(file);
const av = new ModelAvatar(scene as any, rig);
// mimic the gallery: normalise height to 1.5 and scale the root
av.root.scale.setScalar(1.5 / av.H);
console.log(`== ${file} rig=${rig} H=${av.H.toFixed(3)} scale=${(1.5 / av.H).toFixed(3)}`);

const B = av.bones;
const wp = (b?: THREE.Bone) => (b ? b.getWorldPosition(new THREE.Vector3()).divideScalar(av.root.scale.x) : null);

function metrics(ex: string, p: number) {
  av.pose(ex, p);
  av.root.updateMatrixWorld(true);
  const hips = wp(B.hips)!, head = wp(B.head)!, chest = wp(B.spine2)!;
  const handL = wp(B.handL), footL = wp(B.footL), toeL = wp(B.toeL);
  const kneeL = wp(B.legL), shL = wp(B.armL), elbL = wp(B.foreL);
  const out: Record<string, string> = {};
  out.hips_y = hips.y.toFixed(3);
  out.head_y = head.y.toFixed(3);
  if (handL) out.hand_y = handL.y.toFixed(3);
  if (footL) out.foot_y = footL.y.toFixed(3);
  if (toeL) out.toe_y = toeL.y.toFixed(3);
  if (kneeL) out.knee_z = kneeL.z.toFixed(3);
  if (shL && elbL && handL) {
    const armLen = shL.distanceTo(elbL) + elbL.distanceTo(handL);
    out.arm_ext = ((shL.distanceTo(handL) / armLen) * 100).toFixed(0) + '%';
    out.elbow_behind = (elbL.x - Math.min(shL.x, handL.x) < 0 ? 'yes' : 'no');
  }
  if (hips && chest) {
    const torso = new THREE.Vector3().subVectors(chest, hips).normalize();
    out.torso_up = torso.y.toFixed(2);
    out.torso_fwd = torso.z.toFixed(2);
    out.torso_x = torso.x.toFixed(2);
  }
  console.log(`  ${ex} p=${p}: ${Object.entries(out).map(([k, v]) => `${k}=${v}`).join(' ')}`);
}

for (const ex of ['stand', 'squat', 'pushup', 'jumpingjack', 'curl']) {
  metrics(ex, 0.0);   // top of rep
  metrics(ex, 0.5);   // bottom of rep
}
