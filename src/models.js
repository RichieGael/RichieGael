import * as THREE from 'three';

const std = (color, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// A limb is a pivot group with a box hanging down from it; solveLimb aims and stretches it.
export function limb(th, len, mat, endMat) {
  const g = new THREE.Group();
  g.add(mesh(BOX(th, len, th), mat, 0, -len / 2, 0));
  if (endMat) g.add(mesh(BOX(th * 0.9, th * 0.9, th * 1.1), endMat, 0, -len, 0));
  g.userData.len = len;
  return g;
}
const DOWN = new THREE.Vector3(0, -1, 0);
const _d = new THREE.Vector3();
export function solveLimb(l, from, to) {
  l.position.copy(from);
  _d.subVectors(to, from);
  const L = Math.max(0.05, _d.length());
  l.quaternion.setFromUnitVectors(DOWN, _d.multiplyScalar(1 / L));
  l.scale.set(1, L / l.userData.len, 1);
}

// Humanoid faces +Z with its origin at the soles. Its right side is -X.
export function buildHumanoid(o) {
  const shirt = std(o.shirt);
  const pants = std(o.pants);
  const skin = std(o.skin, 0.7);
  const shoe = std(o.shoes, 0.6);
  const acc = std(o.acc || '#222', 0.7);
  const g = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.set(0, 0.92, 0);
  g.add(hips);
  hips.add(mesh(BOX(0.34, 0.18, 0.21), pants));
  const chest = new THREE.Group();
  chest.position.y = 0.06;
  hips.add(chest);
  chest.add(mesh(BOX(0.42, 0.56, 0.25), shirt, 0, 0.32, 0));
  if (o.vest) chest.add(mesh(BOX(0.45, 0.36, 0.29), acc, 0, 0.36, 0));
  const head = new THREE.Group();
  head.position.y = 0.74;
  chest.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.125, 16, 12), o.balaclava ? acc : skin, 0, 0.02, 0));
  if (o.balaclava) head.add(mesh(BOX(0.17, 0.04, 0.03), skin, 0, 0.045, 0.108));
  if (o.beanie) {
    head.add(mesh(new THREE.SphereGeometry(0.133, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(o.beanie), 0, 0.045, 0));
    head.add(mesh(new THREE.CylinderGeometry(0.136, 0.136, 0.05, 16), std(o.beanie), 0, 0.05, 0));
  }
  if (o.shades) head.add(mesh(BOX(0.21, 0.045, 0.03), std('#0d0d0d', 0.15, 0.7), 0, 0.035, 0.112));
  const legL = limb(0.15, 0.82, pants);
  const legR = limb(0.15, 0.82, pants);
  g.add(legL, legR);
  const shoeL = mesh(BOX(0.12, 0.09, 0.28), shoe);
  const shoeR = mesh(BOX(0.12, 0.09, 0.28), shoe);
  g.add(shoeL, shoeR);
  const armL = limb(0.1, 0.6, shirt, skin);
  const armR = limb(0.1, 0.6, shirt, skin);
  chest.add(armL, armR);
  const gunMount = new THREE.Group();
  gunMount.position.set(-0.08, 0.47, 0.16);
  chest.add(gunMount);
  return { g, hips, chest, head, legL, legR, shoeL, shoeR, armL, armR, gunMount };
}

const SH_L = new THREE.Vector3(0.25, 0.56, 0);
const SH_R = new THREE.Vector3(-0.25, 0.56, 0);
const REST_L = new THREE.Vector3(0.32, 0.0, 0.05);
const REST_R = new THREE.Vector3(-0.32, 0.0, 0.05);
const _p = new THREE.Vector3();

// Call after the owning root's world matrix is current.
export function poseArms(h, gun) {
  const gr = gun && gun.userData.gripR;
  const gl = gun && gun.userData.gripL;
  if (gr) {
    gr.getWorldPosition(_p);
    h.chest.worldToLocal(_p);
    solveLimb(h.armR, SH_R, _p);
  } else solveLimb(h.armR, SH_R, REST_R);
  if (gl) {
    gl.getWorldPosition(_p);
    h.chest.worldToLocal(_p);
    solveLimb(h.armL, SH_L, _p);
  } else solveLimb(h.armL, SH_L, REST_L);
}

const HIP_L = new THREE.Vector3();
const HIP_R = new THREE.Vector3();
export function poseLegs(h, footL, footR) {
  const hy = h.hips.position.y - 0.06;
  HIP_L.set(0.1, hy, h.hips.position.z);
  HIP_R.set(-0.1, hy, h.hips.position.z);
  solveLimb(h.legL, HIP_L, footL);
  solveLimb(h.legR, HIP_R, footR);
  h.shoeL.position.set(footL.x, footL.y + 0.045, footL.z + 0.04);
  h.shoeR.position.set(footR.x, footR.y + 0.045, footR.z + 0.04);
}

const GM = {
  metal: std('#2a2c2f', 0.45, 0.7),
  dark: std('#18191b', 0.6, 0.3),
  wood: std('#7b4a24', 0.7),
  green: std('#4c5a3a', 0.7),
  steel: std('#c2c7cc', 0.25, 0.9),
  ssg: std('#2f3640', 0.6, 0.3),
  he: std('#4b5b2f', 0.6),
};

// Guns point along +Z with the trigger hand near the origin.
export function buildGun(id, skinTex) {
  const g = new THREE.Group();
  const body = skinTex ? new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.45, metalness: 0.25 }) : null;
  const B = (w, h, d, mat, x, y, z, rx = 0) => {
    const m = mesh(BOX(w, h, d), mat, x, y, z);
    m.rotation.x = rx;
    g.add(m);
    return m;
  };
  const C = (r, len, mat, x, y, z) => {
    const m = mesh(new THREE.CylinderGeometry(r, r, len, 8), mat, x, y, z);
    m.rotation.x = Math.PI / 2;
    g.add(m);
    return m;
  };
  const muzzle = new THREE.Object3D();
  const gripR = new THREE.Object3D();
  let gripL = new THREE.Object3D();
  switch (id) {
    case 'ak47': {
      const wood = body || GM.wood;
      const rec = body || GM.metal;
      B(0.06, 0.09, 0.42, rec, 0, 0.03, 0.08);
      B(0.066, 0.075, 0.22, wood, 0, 0.025, 0.38);
      C(0.014, 0.34, GM.metal, 0, 0.045, 0.64);
      B(0.012, 0.05, 0.012, GM.metal, 0, 0.09, 0.78);
      B(0.05, 0.1, 0.3, wood, 0, -0.01, -0.27, 0.1);
      B(0.045, 0.2, 0.08, GM.metal, 0, -0.1, 0.16, -0.35);
      B(0.04, 0.11, 0.05, wood, 0, -0.07, -0.02, 0.35);
      muzzle.position.set(0, 0.045, 0.82);
      gripR.position.set(0, -0.08, -0.02);
      gripL.position.set(0, -0.01, 0.36);
      break;
    }
    case 'm4a1': {
      const rec = body || GM.dark;
      B(0.06, 0.1, 0.4, rec, 0, 0.03, 0.08);
      B(0.07, 0.08, 0.26, rec, 0, 0.03, 0.38);
      C(0.022, 0.28, GM.dark, 0, 0.04, 0.66);
      B(0.02, 0.03, 0.3, GM.metal, 0, 0.095, 0.12);
      B(0.05, 0.09, 0.24, rec, 0, 0.0, -0.24);
      B(0.04, 0.17, 0.07, GM.metal, 0, -0.1, 0.14, -0.15);
      B(0.04, 0.11, 0.05, GM.dark, 0, -0.07, -0.02, 0.35);
      muzzle.position.set(0, 0.04, 0.8);
      gripR.position.set(0, -0.08, -0.02);
      gripL.position.set(0, -0.01, 0.34);
      break;
    }
    case 'awp': {
      const b = body || GM.green;
      B(0.075, 0.11, 0.62, b, 0, 0.02, 0.05);
      C(0.017, 0.5, GM.metal, 0, 0.04, 0.6);
      C(0.034, 0.34, GM.dark, 0, 0.12, 0.1);
      B(0.02, 0.04, 0.02, GM.dark, 0, 0.085, 0.0);
      B(0.02, 0.04, 0.02, GM.dark, 0, 0.085, 0.2);
      B(0.06, 0.14, 0.3, b, 0, -0.01, -0.36);
      B(0.05, 0.1, 0.1, GM.dark, 0, -0.08, 0.05);
      B(0.04, 0.11, 0.05, b, 0, -0.07, -0.08, 0.35);
      muzzle.position.set(0, 0.04, 0.86);
      gripR.position.set(0, -0.08, -0.08);
      gripL.position.set(0, -0.02, 0.3);
      break;
    }
    case 'ssg08': {
      const b = body || GM.ssg;
      B(0.06, 0.09, 0.55, b, 0, 0.02, 0.05);
      C(0.012, 0.5, GM.metal, 0, 0.035, 0.55);
      C(0.028, 0.28, GM.dark, 0, 0.1, 0.08);
      B(0.05, 0.11, 0.26, b, 0, -0.005, -0.3);
      B(0.04, 0.1, 0.05, b, 0, -0.07, -0.06, 0.35);
      muzzle.position.set(0, 0.035, 0.8);
      gripR.position.set(0, -0.08, -0.06);
      gripL.position.set(0, -0.02, 0.28);
      break;
    }
    case 'p2000': {
      B(0.035, 0.045, 0.19, body || GM.dark, 0, 0.03, 0.06);
      B(0.03, 0.03, 0.15, GM.dark, 0, 0.0, 0.05);
      B(0.032, 0.11, 0.05, body || GM.dark, 0, -0.05, -0.01, 0.25);
      muzzle.position.set(0, 0.03, 0.16);
      gripR.position.set(0, -0.06, -0.01);
      gripL.position.set(0.01, -0.07, 0.01);
      break;
    }
    case 'deagle': {
      B(0.045, 0.06, 0.26, body || GM.steel, 0, 0.035, 0.08);
      B(0.04, 0.035, 0.18, GM.steel, 0, -0.005, 0.06);
      B(0.04, 0.13, 0.06, GM.dark, 0, -0.06, -0.02, 0.25);
      muzzle.position.set(0, 0.035, 0.22);
      gripR.position.set(0, -0.07, -0.02);
      gripL.position.set(0.01, -0.08, 0.0);
      break;
    }
    case 'knife': {
      B(0.008, 0.035, 0.2, body || GM.steel, 0, 0, 0.14);
      B(0.025, 0.05, 0.02, GM.dark, 0, 0, 0.035);
      B(0.028, 0.032, 0.11, body ? body : GM.dark, 0, 0, -0.03);
      muzzle.position.set(0, 0, 0.24);
      gripR.position.set(0, -0.01, -0.02);
      gripL = null;
      break;
    }
    case 'he': {
      g.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), GM.he, 0, 0.02, 0.04));
      B(0.015, 0.06, 0.02, GM.steel, 0, 0.06, 0.02);
      muzzle.position.set(0, 0.02, 0.08);
      gripR.position.set(0, -0.02, 0.02);
      gripL = null;
      break;
    }
    default:
      break;
  }
  g.add(muzzle, gripR);
  if (gripL) g.add(gripL);
  g.userData = { muzzle, gripR, gripL };
  return g;
}

export function buildBoard(deckMat) {
  const grp = new THREE.Group();
  const grip = std('#1d1d1b', 1);
  const mats = [deckMat, deckMat, grip, deckMat, deckMat, deckMat];
  grp.add(mesh(BOX(0.21, 0.022, 0.62), mats));
  const nose = mesh(BOX(0.21, 0.022, 0.15), mats, 0, 0.022, 0.375);
  nose.rotation.x = -0.32;
  const tail = mesh(BOX(0.21, 0.022, 0.15), mats, 0, 0.022, -0.375);
  tail.rotation.x = 0.32;
  grp.add(nose, tail);
  const truck = std('#aeb3b8', 0.3, 0.9);
  const wheel = std('#f3efe4', 0.5);
  for (const z of [0.24, -0.24]) {
    grp.add(mesh(BOX(0.17, 0.035, 0.05), truck, 0, -0.03, z));
    for (const x of [0.085, -0.085]) {
      const w = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.032, 10), wheel, x, -0.05, z);
      w.rotation.z = Math.PI / 2;
      grp.add(w);
    }
  }
  return grp;
}
