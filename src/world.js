import * as THREE from 'three';
import { clamp } from './util.js';
import { floorTex, wallTex, crateTex, concreteTex, plyTex, decalTex } from './textures.js';

// Map "sk8_dunes": a desert skate town laid out like a bomb-defusal map.
// Collision is analytic: every solid is an axis-aligned box or ramp with a
// height function, so ground, wall and ray queries need no mesh raycasting.

const QP_ANG = (70 * Math.PI) / 180;
const UP = new THREE.Vector3(0, 1, 0);

export const BOUNDS = { x0: -66, x1: 66, z0: -62, z1: 66 };
export const SITES = {
  A: { x0: 33, x1: 58, z0: -36, z1: -10, cx: 45, cz: -25 },
  B: { x0: -44, x1: -26, z0: -38, z1: -4, cx: -36, cz: -22 },
};
export const SPAWN_CT = { x: 14, z: 58, yaw: Math.PI };
export const T_SPAWNS = [
  [-8, -54],
  [-4, -53],
  [4, -53],
  [8, -54],
  [0, -52.5],
  [12, -53],
];
export const DUMMY_SPOTS = [
  [0, -30],
  [-36, -22],
  [45, -25],
  [0, 8],
  [55, 26],
  [-59, 20],
  [-55, -30],
  [20, 50],
  [-30, 56],
  [6, -52],
];

export const NODES = {
  T0: [0, -55], T1: [-42, -52], T2: [42, -52], TB: [-42, -43], TA: [41, -43],
  B0: [-40, -36], B1: [-36, -22], B2: [-32, -10], B3: [-55, -14], BDW: [-30, -31], BD: [-20, -31],
  BL1: [-59, 4], BL2: [-59, 40], M0: [0, -43], UM: [0, -30], UMW: [-12, -30], UME: [12, -30],
  AD: [20, -31], AW: [29, -30], A1: [45, -25], A2: [41, -38], A3: [46, -11],
  LA1: [54, -4], LA2: [54, 10], LA3: [54, 40], LM1: [0, -14], LM2: [0, 8], LM3: [0, 38],
  CT0: [0, 46.5], CTW: [-59, 47], CTE: [59, 47],
};
export const EDGES = (
  'T0-T1 T0-T2 T0-M0 T1-TB T2-TA TB-B0 B0-B1 B1-B2 B1-BDW BDW-BD BD-UMW UMW-UM UM-UME UME-AD AD-AW AW-A1 ' +
  'M0-UM TA-A2 A2-A1 A1-A3 A3-LA1 LA1-LA2 LA2-LA3 LA3-CTE CTE-CT0 CT0-LM3 LM3-LM2 LM2-LM1 LM1-UM B2-B3 ' +
  'B3-BL1 BL1-BL2 BL2-CTW CTW-CT0'
).split(' ').map((e) => e.split('-'));

function rampS(c, x, z) {
  let s;
  if (c.axis === 'x') s = c.sign > 0 ? x - c.x0 : c.x1 - x;
  else s = c.sign > 0 ? z - c.z0 : c.z1 - z;
  return clamp(s, 0, c.len);
}
export function heightAt(c, x, z) {
  if (c.kind === 'box') return c.top;
  const s = rampS(c, x, z);
  if (c.qp) return c.h0 + c.R - Math.sqrt(Math.max(0, c.R * c.R - s * s));
  return c.h0 + ((c.h1 - c.h0) * s) / c.len;
}
export function normalAt(c, x, z, out) {
  if (c.kind === 'box') return out.set(0, 1, 0);
  const s = rampS(c, x, z);
  const k = c.qp ? s / Math.sqrt(Math.max(1e-4, c.R * c.R - s * s)) : (c.h1 - c.h0) / c.len;
  const gx = c.axis === 'x' ? c.sign * k : 0;
  const gz = c.axis === 'z' ? c.sign * k : 0;
  return out.set(-gx, 1, -gz).normalize();
}

function worldUV(g, w, h, d, ts) {
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / ts, (uv.getY(k) * dims[f][1]) / ts);
    }
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.cols = [];
    this.rails = [];
    this._gq = { h: 0, n: new THREE.Vector3(), col: null };
    const wall = wallTex();
    const ply = plyTex();
    const conc = concreteTex();
    const ds = THREE.DoubleSide;
    this.mats = {
      wall: new THREE.MeshStandardMaterial({ map: wall, roughness: 0.95 }),
      bldg: new THREE.MeshStandardMaterial({ map: wall, color: 0xf3e2c6, roughness: 0.95 }),
      crate: new THREE.MeshStandardMaterial({ map: crateTex(), roughness: 0.85 }),
      concrete: new THREE.MeshStandardMaterial({ map: conc, roughness: 0.8 }),
      concreteDS: new THREE.MeshStandardMaterial({ map: conc, roughness: 0.8, side: ds }),
      ply: new THREE.MeshStandardMaterial({ map: ply, roughness: 0.75 }),
      plyDS: new THREE.MeshStandardMaterial({ map: ply, roughness: 0.75, side: ds }),
      metal: new THREE.MeshStandardMaterial({ color: 0xa3acb5, metalness: 0.85, roughness: 0.3 }),
      paint: new THREE.MeshStandardMaterial({ color: 0x2c6e9e, metalness: 0.4, roughness: 0.5 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x5b8a3a, roughness: 0.9, side: ds }),
    };
    this.texScale = { wall: 4, bldg: 4, concrete: 4, ply: 4 };
    this.statics = [];
    this.build();
    this.mergeStatic();
  }

  add(m, parent = this.scene) {
    parent.add(m);
    this.statics.push(m);
    return m;
  }

  // Bake every static mesh into one mesh per material to keep draw calls low on phones.
  mergeStatic() {
    const groups = new Map();
    this.scene.updateMatrixWorld(true);
    for (const m of this.statics) {
      if (!groups.has(m.material)) groups.set(m.material, []);
      groups.get(m.material).push(m);
    }
    for (const [mat, list] of groups) {
      const geos = list.map((m) => {
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        return g;
      });
      const count = geos.reduce((n, g) => n + g.attributes.position.count, 0);
      const pos = new Float32Array(count * 3);
      const nor = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2);
      let o = 0;
      for (const g of geos) {
        if (!g.attributes.normal) g.computeVertexNormals();
        const n = g.attributes.position.count;
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
        o += n;
        g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      for (const m of list) m.parent.remove(m);
    }
    this.statics = [];
  }

  // ---------- builders ----------
  box(x0, x1, z0, z1, top, o = {}) {
    const y0 = o.y0 ?? 0;
    const mat = o.mat ?? 'wall';
    const col = { kind: 'box', x0, x1, z0, z1, y0, top, mat };
    this.cols.push(col);
    const w = x1 - x0;
    const d = z1 - z0;
    const h = top - y0;
    const g = new THREE.BoxGeometry(w, h, d);
    if (mat !== 'crate') worldUV(g, w, h, d, this.texScale[mat] || 4);
    const m = new THREE.Mesh(g, this.mats[mat]);
    m.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
    this.add(m);
    if (o.grind) for (const e of o.grind) this.ledgeEdge(col, e);
    return col;
  }

  crate(x, z, s = 2, y0 = 0) {
    return this.box(x - s / 2, x + s / 2, z - s / 2, z + s / 2, y0 + s, { y0, mat: 'crate' });
  }

  ledgeEdge(c, e) {
    const y = c.top;
    const i = 0.05;
    if (e === 'n') this.rail(c.x0, y, c.z0 + i, c.x1, y, c.z0 + i, { kind: 'ledge' });
    if (e === 's') this.rail(c.x0, y, c.z1 - i, c.x1, y, c.z1 - i, { kind: 'ledge' });
    if (e === 'w') this.rail(c.x0 + i, y, c.z0, c.x0 + i, y, c.z1, { kind: 'ledge' });
    if (e === 'e') this.rail(c.x1 - i, y, c.z0, c.x1 - i, y, c.z1, { kind: 'ledge' });
  }

  // dir: '+x' means height rises as x increases.
  ramp(x0, x1, z0, z1, dir, h0, h1, o = {}) {
    const axis = dir[1];
    const sign = dir[0] === '+' ? 1 : -1;
    const len = axis === 'x' ? x1 - x0 : z1 - z0;
    const col = { kind: 'ramp', x0, x1, z0, z1, y0: 0, axis, sign, len, h0, h1, qp: !!o.qp, vert: !!o.qp };
    if (o.qp) {
      col.R = len / Math.sin(QP_ANG);
      col.h1 = h0 + col.R * (1 - Math.cos(QP_ANG));
    }
    col.top = Math.max(col.h0, col.h1);
    this.cols.push(col);
    this.rampMesh(col, o.mat ?? (o.qp ? 'ply' : 'concrete'));
    if (o.qp) {
      const y = col.h1;
      if (axis === 'x') {
        const x = sign > 0 ? x1 : x0;
        this.rail(x, y, z0, x, y, z1, { kind: 'coping', posts: false, inward: { x: -sign, z: 0 } });
      } else {
        const z = sign > 0 ? z1 : z0;
        this.rail(x0, y, z, x1, y, z, { kind: 'coping', posts: false, inward: { x: 0, z: -sign } });
      }
    }
    return col;
  }

  // Quarter pipe with a deck behind it, so the lip launches you straight up.
  qp(x0, x1, z0, z1, dir, deck = 2) {
    const c = this.ramp(x0, x1, z0, z1, dir, 0, 0, { qp: true });
    const t = c.h1;
    if (dir === '+x') this.box(x1, x1 + deck, z0, z1, t, { mat: 'ply' });
    if (dir === '-x') this.box(x0 - deck, x0, z0, z1, t, { mat: 'ply' });
    if (dir === '+z') this.box(x0, x1, z1, z1 + deck, t, { mat: 'ply' });
    if (dir === '-z') this.box(x0, x1, z0 - deck, z0, t, { mat: 'ply' });
    return c;
  }

  rampMesh(c, matName) {
    const segs = c.qp ? 16 : 1;
    const wid = c.axis === 'x' ? c.z1 - c.z0 : c.x1 - c.x0;
    const P = (s, w) => (c.axis === 'x' ? [c.sign > 0 ? c.x0 + s : c.x1 - s, c.z0 + w] : [c.x0 + w, c.sign > 0 ? c.z0 + s : c.z1 - s]);
    const H = (s) => {
      const [x, z] = P(s, 0);
      return heightAt(c, x, z);
    };
    const pos = [];
    const uv = [];
    const idx = [];
    let arc = 0;
    let prevH = H(0);
    for (let i = 0; i <= segs; i++) {
      const s = (c.len * i) / segs;
      const h = H(s);
      if (i > 0) arc += Math.hypot(c.len / segs, h - prevH);
      prevH = h;
      for (let j = 0; j <= 1; j++) {
        const [x, z] = P(s, j * wid);
        pos.push(x, h, z);
        uv.push((j * wid) / 4, arc / 4);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    top.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    top.setIndex(idx);
    top.computeVertexNormals();
    if (top.attributes.normal.getY(0) < 0) {
      top.setIndex(idx.slice().reverse());
      top.computeVertexNormals();
    }
    const ds = this.mats[matName + 'DS'] || this.mats[matName];
    this.add(new THREE.Mesh(top, ds));

    // Side walls and the back face.
    const sp = [];
    const su = [];
    const quad = (a, b, cc, d, ua, ub, uc, ud) => {
      sp.push(...a, ...b, ...cc, ...a, ...cc, ...d);
      su.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
    };
    for (const w of [0, wid]) {
      for (let i = 0; i < segs; i++) {
        const s0 = (c.len * i) / segs;
        const s1 = (c.len * (i + 1)) / segs;
        const [x0, z0] = P(s0, w);
        const [x1, z1] = P(s1, w);
        const h0 = H(s0);
        const h1 = H(s1);
        quad([x0, 0, z0], [x1, 0, z1], [x1, h1, z1], [x0, h0, z0], [s0 / 4, 0], [s1 / 4, 0], [s1 / 4, h1 / 4], [s0 / 4, h0 / 4]);
      }
    }
    const hEnd = H(c.len);
    if (hEnd > 0.02) {
      const [ax, az] = P(c.len, 0);
      const [bx, bz] = P(c.len, wid);
      quad([ax, 0, az], [bx, 0, bz], [bx, hEnd, bz], [ax, hEnd, az], [0, 0], [wid / 4, 0], [wid / 4, hEnd / 4], [0, hEnd / 4]);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    sg.computeVertexNormals();
    this.add(new THREE.Mesh(sg, this.mats.concreteDS));
  }

  rail(ax, ay, az, bx, by, bz, o = {}) {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.divideScalar(len);
    const kind = o.kind || 'rail';
    this.rails.push({ a, b, dir, len, kind, yaw: Math.atan2(dir.x, dir.z), inward: o.inward || null });
    const r = kind === 'ledge' ? 0.03 : 0.04;
    const geo = new THREE.CylinderGeometry(r, r, len, 8, 1);
    const m = new THREE.Mesh(geo, kind === 'rail' ? this.mats.paint : this.mats.metal);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, dir);
    this.add(m);
    if (kind === 'rail' && o.posts !== false) {
      const n = Math.max(2, Math.round(len / 3) + 1);
      for (let i = 0; i < n; i++) {
        const p = a.clone().lerp(b, i / (n - 1));
        const ph = p.y;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, ph, 6), this.mats.paint);
        post.position.set(p.x, ph / 2, p.z);
        this.add(post);
      }
    }
  }

  stairs(x0, x1, zTop, topH, steps, depth, dirSign) {
    // Steps descend from height topH, moving along +z (dirSign 1) or -z.
    const rise = topH / (steps + 1);
    for (let i = 0; i < steps; i++) {
      const h = topH - rise * (i + 1);
      const za = zTop + dirSign * depth * i;
      const zb = za + dirSign * depth;
      this.box(x0, x1, Math.min(za, zb), Math.max(za, zb), h, { mat: 'concrete' });
    }
  }

  decal(tex, x, y, z, rotY, w, h) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    this.scene.add(m);
  }

  palm(x, z, h = 7) {
    this.cols.push({ kind: 'box', x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, y0: 0, top: h, mat: 'trunk', decor: true });
    const g = new THREE.Group();
    const segs = 7;
    let px = 0;
    let pz = 0;
    const lean = Math.random() * Math.PI * 2;
    for (let i = 0; i < segs; i++) {
      const r = 0.22 - i * 0.015;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.02, r, h / segs + 0.05, 7), this.mats.trunk);
      px += Math.cos(lean) * 0.06 * i;
      pz += Math.sin(lean) * 0.06 * i;
      s.position.set(px, (i + 0.5) * (h / segs), pz);
      this.add(s, g);
    }
    for (let i = 0; i < 8; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.2, 1, 4), this.mats.leaf);
      const pa = leaf.geometry.attributes.position;
      for (let k = 0; k < pa.count; k++) {
        const yy = pa.getY(k);
        pa.setZ(k, -((yy + 1.6) ** 2) * 0.12);
      }
      leaf.geometry.computeVertexNormals();
      leaf.geometry.translate(0, 1.6, 0);
      leaf.position.set(px, h, pz);
      leaf.rotation.set(-1.0 - Math.random() * 0.3, (i / 8) * Math.PI * 2, 0, 'YXZ');
      this.add(leaf, g);
    }
    g.position.set(x, 0, z);
    this.scene.add(g);
  }

  build() {
    const ft = floorTex();
    ft.repeat.set(40, 40);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const H = 7;
    // Outer walls
    this.box(-76, -66, -74, 74, 9);
    this.box(66, 76, -74, 74, 9);
    this.box(-76, 76, -74, -62, 9);
    this.box(-76, 76, 66, 74, 9);
    // T spawn separators with chokepoints to B, mid and A
    this.box(-66, -46, -46, -40, H);
    this.box(-38, -10, -46, -40, H);
    this.box(10, 38, -46, -40, H);
    this.box(46, 66, -46, -40, H);
    // Door columns between sites and upper mid
    this.box(-26, -14, -40, -34, H);
    this.box(-26, -14, -28, 0, H);
    this.box(14, 26, -40, -34, H);
    this.box(14, 26, -28, -2, H);
    // Building blocks between lanes
    this.box(-52, -14, 0, 22, 7.5, { mat: 'bldg' });
    this.box(-52, -14, 22, 44, 6.2, { mat: 'bldg' });
    this.box(14, 52, -2, 20, 7, { mat: 'bldg' });
    this.box(14, 52, 20, 44, 6, { mat: 'bldg' });

    // ---- T spawn
    this.qp(-20, 20, -60, -56, '-z');
    this.ramp(-14, -10, -52, -49, '+z', 0, 1.0);
    this.crate(-29, -50);
    this.crate(25, -59);
    this.rail(16, 0.5, -51, 30, 0.5, -51);

    // ---- Upper mid plaza, bank ramps and the stair set
    this.box(-10, 10, -36, -24, 1.2, { mat: 'concrete' });
    this.ramp(-10, 10, -40, -36, '+z', 0, 1.2);
    this.ramp(-14, -10, -36, -24, '+x', 0, 1.2);
    this.ramp(10, 14, -36, -24, '-x', 0, 1.2);
    this.stairs(-10, 10, -24, 1.2, 5, 1, 1);
    this.rail(-5, 2.0, -24.4, -5, 0.78, -18.4);
    this.rail(5, 2.0, -24.4, 5, 0.78, -18.4);
    this.box(-7, -3, -33, -32.4, 1.65, { y0: 1.2, mat: 'concrete', grind: ['n', 's'] });
    this.box(3, 7, -33, -32.4, 1.65, { y0: 1.2, mat: 'concrete', grind: ['n', 's'] });

    // ---- Lower mid street spot
    this.box(-9, -7.5, -12, 2, 0.5, { mat: 'concrete', grind: ['w', 'e'] });
    this.rail(6, 0.5, -12, 6, 0.5, 4);
    this.box(-4, 4, 16, 22, 1.0, { mat: 'concrete', grind: ['w', 'e'] });
    this.ramp(-4, 4, 12, 16, '+z', 0, 1.0);
    this.ramp(-4, 4, 22, 26, '-z', 0, 1.0);
    this.ramp(-11, -7, 30, 33.5, '-z', 0, 1.0);
    this.box(12.5, 14, 0, 30, 0.5, { mat: 'concrete', grind: ['w'] });
    this.box(3, 9, 30, 36, 0.25, { mat: 'concrete', grind: ['n', 's', 'w', 'e'] });

    // ---- CT spawn
    this.qp(-30, 30, 60, 64, '+z');
    this.box(-4, 4, 51, 55, 1.2, { mat: 'concrete', grind: ['w', 'e'] });
    this.ramp(-4, 4, 47, 51, '+z', 0, 1.2);
    this.ramp(-4, 4, 55, 59, '-z', 0, 1.2);
    this.ramp(-40, -36, 50, 54, '-x', 0, 1.0);
    this.ramp(36, 40, 50, 54, '+x', 0, 1.0);
    this.rail(-24, 0.5, 49, -12, 0.5, 49);
    this.rail(12, 0.5, 52.5, 26, 0.5, 52.5);
    this.palm(-62, 62);
    this.palm(62, 62);
    this.palm(-11, 41);

    // ---- B site: halfpipe, crates and a planter ledge
    this.qp(-62, -58, -38, -22, '-x', 4);
    const eqp = this.qp(-52, -48, -38, -22, '+x', 3);
    this.ramp(-48, -45, -22, -12, '-z', 0, eqp.h1);
    this.crate(-36, -32);
    this.crate(-36, -32, 2, 2);
    this.crate(-40, -14);
    this.box(-34, -28, -20, -19, 0.55, { mat: 'concrete', grind: ['n', 's'] });
    this.ramp(-38, -34, -6, -3, '-z', 0, 1.0);

    // ---- A site: raised platform with bank ramps
    this.box(32, 58, -36, -14, 1.5, { mat: 'concrete', grind: ['n', 'e'] });
    this.ramp(36, 56, -14, -8, '-z', 0, 1.5);
    this.ramp(26, 32, -34, -26, '+x', 0, 1.5);
    this.ramp(38, 44, -40, -36, '+z', 0, 1.5);
    this.crate(41.1, -29.9, 2.2, 1.5);
    this.crate(41.1, -29.9, 1.6, 3.7);
    this.crate(51.1, -22.9, 2.2, 1.5);
    this.box(44, 48, -20, -19.4, 2.0, { y0: 1.5, mat: 'concrete', grind: ['n', 's'] });
    this.qp(60, 64, -38, -6, '+x');

    // ---- Long A: kicker-to-landing gap and a long rail
    this.ramp(56, 62, 30, 33, '-z', 0, 1.1);
    this.ramp(56, 62, 17, 23, '+z', 0, 0.9);
    this.rail(53.2, 0.55, 40, 53.2, 0.55, 6);
    this.crate(64, 0);

    // ---- Paint
    const letter = (t) => decalTex(t, { size: 400, color: '#f1ece0', drip: true, w: 512, h: 512 });
    this.decal(letter('A'), 54, 3.6, -39.97, 0, 4.5, 4.5);
    this.decal(letter('B'), -26.03, 3.6, -14, -Math.PI / 2, 4.5, 4.5);
    this.decal(letter('B'), -39, 3.2, -39.97, 0, 3, 3);
    const tag = (t, color, stroke, rot = -0.08) =>
      decalTex(t, { font: '"Permanent Marker", "Marker Felt", cursive', size: 150, color, stroke, lineWidth: 14, rot });
    this.decal(tag('RUSH B', '#ff4fa3', '#1b1b1b'), -24, 3, -46.03, Math.PI, 8, 4);
    this.decal(tag('SK8 OR DIE', '#3fe0c5', '#1b1b1b'), -13.97, 3.2, 22, Math.PI / 2, 9, 4.5);
    this.decal(tag('HALL OF MEAT', '#ffd23f', '#3a1010', 0.06), 13.97, 3.2, 10, -Math.PI / 2, 10, 5);
    this.decal(tag('no skating', '#f5f1e6', '#7a1d1d', 0.1), 39, 3, 43.97, Math.PI, 6, 3);
    this.decal(tag('MID', '#f2c14e', '#1b1b1b', 0), 0, 4.2, -39.97, 0, 5, 2.5);
  }

  // ---------- queries ----------
  groundAt(x, z, maxY, out = this._gq) {
    let best = 0;
    let bc = null;
    for (const c of this.cols) {
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
      const h = heightAt(c, x, z);
      if (h <= maxY && h > best) {
        best = h;
        bc = c;
      }
    }
    out.h = best;
    out.col = bc;
    if (bc) normalAt(bc, x, z, out.n);
    else out.n.set(0, 1, 0);
    return out;
  }

  // Pushes a vertical cylinder out of anything taller than feetY + stepUp.
  collide(pos, r, feetY, stepUp, prev) {
    let hit = null;
    for (const c of this.cols) {
      if (pos.x < c.x0 - r || pos.x > c.x1 + r || pos.z < c.z0 - r || pos.z > c.z1 + r) continue;
      if (c.y0 > feetY + 1.7) continue;
      const cx = clamp(pos.x, c.x0, c.x1);
      const cz = clamp(pos.z, c.z0, c.z1);
      if (heightAt(c, cx, cz) <= feetY + stepUp) continue;
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      let nx = 0;
      let nz = 0;
      if (d2 > 1e-8) {
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
        pos.x = cx + nx * r;
        pos.z = cz + nz * r;
      } else {
        const px = prev ? prev.x : pos.x;
        const pz = prev ? prev.z : pos.z;
        let side;
        if (px < c.x0) side = 0;
        else if (px > c.x1) side = 1;
        else if (pz < c.z0) side = 2;
        else if (pz > c.z1) side = 3;
        else {
          const pens = [pos.x - c.x0, c.x1 - pos.x, pos.z - c.z0, c.z1 - pos.z];
          side = pens.indexOf(Math.min(...pens));
        }
        if (side === 0) { nx = -1; pos.x = c.x0 - r; }
        if (side === 1) { nx = 1; pos.x = c.x1 + r; }
        if (side === 2) { nz = -1; pos.z = c.z0 - r; }
        if (side === 3) { nz = 1; pos.z = c.z1 + r; }
      }
      if (!hit) hit = { nx, nz, col: c };
    }
    return hit;
  }

  // Ray against floor and all solids. Returns { t, n } or null.
  raycast(o, d, maxT) {
    let best = maxT;
    let bn = null;
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t > 0 && t < best) {
        best = t;
        bn = UP;
      }
    }
    const N = this._rn || (this._rn = new THREE.Vector3());
    for (const c of this.cols) {
      const mn = [c.x0, c.y0, c.z0];
      const mx = [c.x1, c.top, c.z1];
      const oo = [o.x, o.y, o.z];
      const dd = [d.x, d.y, d.z];
      let t0 = 0;
      let t1 = best;
      let axis = -1;
      let sgn = 0;
      let miss = false;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(dd[a]) < 1e-9) {
          if (oo[a] < mn[a] || oo[a] > mx[a]) {
            miss = true;
            break;
          }
          continue;
        }
        let ta = (mn[a] - oo[a]) / dd[a];
        let tb = (mx[a] - oo[a]) / dd[a];
        let s = -1;
        if (ta > tb) {
          const tmp = ta;
          ta = tb;
          tb = tmp;
          s = 1;
        }
        if (ta > t0) {
          t0 = ta;
          axis = a;
          sgn = s;
        }
        if (tb < t1) t1 = tb;
        if (t0 > t1) {
          miss = true;
          break;
        }
      }
      if (miss || axis < 0) continue;
      if (c.kind === 'box') {
        best = t0;
        bn = N.set(axis === 0 ? sgn : 0, axis === 1 ? sgn : 0, axis === 2 ? sgn : 0).clone();
        continue;
      }
      // Ramp: march through the bounding box until the ray dips under the surface.
      const step = 0.08;
      let prevT = t0;
      for (let t = t0; t <= t1 + 1e-6; t += step) {
        const px = o.x + d.x * t;
        const py = o.y + d.y * t;
        const pz = o.z + d.z * t;
        if (py <= heightAt(c, px, pz)) {
          let lo = prevT;
          let hi = t;
          if (t > t0) {
            for (let k = 0; k < 6; k++) {
              const m = (lo + hi) / 2;
              if (o.y + d.y * m <= heightAt(c, o.x + d.x * m, o.z + d.z * m)) hi = m;
              else lo = m;
            }
          }
          if (hi < best) {
            best = hi;
            if (t === t0 && axis !== 1) bn = N.set(axis === 0 ? sgn : 0, 0, axis === 2 ? sgn : 0).clone();
            else bn = normalAt(c, o.x + d.x * hi, o.z + d.z * hi, new THREE.Vector3());
          }
          break;
        }
        prevT = t;
      }
    }
    return best < maxT ? { t: best, n: bn } : null;
  }
}
