import * as THREE from 'three';
import { NODES, EDGES, T_SPAWNS, DUMMY_SPOTS, SITES } from './world.js';
import { buildHumanoid, buildGun, poseArms, poseLegs } from './models.js';
import { clamp, angDiff, dampAng, rand, pick, PI } from './util.js';
import { sfx } from './audio.js';

const NAMES = ['Dusty', 'Gravel', 'Bearings', 'Griptape', 'Tumbleweed', 'Sandy', 'Truckbolt', 'Rusty', 'Coping', 'Wax', 'Kingpin', 'Bushing'];
export const DIFF = {
  easy: { acc: 0.2, react: 0.8, hs: 0.04, n: 4 },
  normal: { acc: 0.32, react: 0.5, hs: 0.08, n: 5 },
  hard: { acc: 0.46, react: 0.32, hs: 0.13, n: 5 },
};

const KEYS = Object.keys(NODES);
const ADJ = Object.fromEntries(KEYS.map((k) => [k, []]));
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}
function bfs(from, to) {
  const prev = { [from]: null };
  const q = [from];
  while (q.length) {
    const c = q.shift();
    if (c === to) break;
    for (const n of ADJ[c]) {
      if (!(n in prev)) {
        prev[n] = c;
        q.push(n);
      }
    }
  }
  if (!(to in prev)) return [to];
  const path = [];
  for (let c = to; c; c = prev[c]) path.unshift(c);
  return path;
}

const _e = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();
const _h = new THREE.Vector3();
const _m = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _fl = new THREE.Vector3();
const _fr = new THREE.Vector3();

function raySphere(o, d, c, r) {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t >= 0 ? t : null;
}
// Vertical capsule from (base + y0) to (base + y1).
function rayCapsule(o, d, base, y0, y1, r) {
  let best = null;
  const ox = o.x - base.x;
  const oz = o.z - base.z;
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-8) {
    const b = ox * d.x + oz * d.z;
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a;
      const y = o.y + d.y * t;
      if (t >= 0 && y >= base.y + y0 && y <= base.y + y1) best = t;
    }
  }
  for (const yy of [y0, y1]) {
    const t = raySphere(o, d, _c.set(base.x, base.y + yy, base.z), r);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

class Bot {
  constructor(scene, name, dummy) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.h = buildHumanoid({ shirt: '#a8865a', pants: '#5b4a36', skin: '#c69a74', shoes: '#2b2b2b', acc: '#26241f', balaclava: true, vest: true });
    this.root.add(this.h.g);
    this.gun = buildGun('ak47');
    this.h.gunMount.add(this.gun);
    this.name = name;
    this.dummy = dummy;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.armor = 0;
    this.helmet = false;
    this.alive = true;
    this.path = [];
    this.goal = 'site';
    this.hasBomb = false;
    this.planting = 0;
    this.thinkT = Math.random() * 0.2;
    this.canSee = false;
    this.react = 0;
    this.fireCd = 0;
    this.burst = 0;
    this.strafe = 0;
    this.strafeT = 0;
    this.walk = Math.random() * 6;
    this.deadT = 0;
    this.alertT = 0;
    this.holdYaw = 0;
    this.lookT = 0;
    this.stuckT = 0;
    this.lastSeen = new THREE.Vector3();
    this.lastSeenT = -99;
    this.fallDir = 1;
  }
}

export class Bots {
  constructor(world, scene, fx) {
    this.world = world;
    this.scene = scene;
    this.fx = fx;
    this.list = [];
    this.time = 0;
    this.diff = DIFF.normal;
    this.site = 'A';
  }

  clear() {
    for (const b of this.list) this.scene.remove(b.root);
    this.list.length = 0;
  }

  place(b, x, z, yaw) {
    b.pos.set(x, this.world.groundAt(x, z, 50).h, z);
    b.yaw = yaw;
    b.root.position.copy(b.pos);
    b.root.rotation.set(0, yaw, 0);
  }

  pts(keys) {
    return keys.map((k) => new THREE.Vector2(NODES[k][0] + rand(-1, 1), NODES[k][1] + rand(-1, 1)));
  }

  nearestNode(pos) {
    const sorted = KEYS.map((k) => [k, Math.hypot(NODES[k][0] - pos.x, NODES[k][1] - pos.z)]).sort((a, b) => a[1] - b[1]);
    for (const [k, dist] of sorted.slice(0, 6)) {
      _e.set(pos.x, pos.y + 1, pos.z);
      _d.set(NODES[k][0] - pos.x, 0, NODES[k][1] - pos.z).normalize();
      if (!this.world.raycast(_e, _d, dist)) return k;
    }
    return sorted[0][0];
  }

  routeTo(pos, key) {
    return this.pts(bfs(this.nearestNode(pos), key));
  }

  spawnRound(round, diffKey) {
    this.clear();
    this.diff = DIFF[diffKey] || DIFF.normal;
    const names = NAMES.slice().sort(() => Math.random() - 0.5);
    this.site = Math.random() < 0.5 ? 'A' : 'B';
    const node = this.site === 'A' ? 'A1' : 'B1';
    const S = SITES[this.site];
    for (let i = 0; i < this.diff.n; i++) {
      const b = new Bot(this.scene, names[i], false);
      const [x, z] = T_SPAWNS[i % T_SPAWNS.length];
      this.place(b, x + rand(-0.5, 0.5), z, 0);
      if (round > 1) {
        b.armor = 100;
        b.helmet = true;
      }
      const via = Math.random() < 0.35 ? 'M0' : null;
      const keys = via ? bfs('T0', via).concat(bfs(via, node).slice(1)) : bfs('T0', node);
      b.path = this.pts(keys);
      b.path.push(new THREE.Vector2(S.cx + rand(-6, 6), S.cz + rand(-6, 6)));
      this.list.push(b);
    }
    const carrier = pick(this.list);
    carrier.hasBomb = true;
    carrier.path.pop();
    return carrier;
  }

  spawnDummies() {
    this.clear();
    const names = NAMES.slice().sort(() => Math.random() - 0.5);
    DUMMY_SPOTS.slice(0, 8).forEach(([x, z], i) => {
      const b = new Bot(this.scene, names[i % names.length], true);
      this.place(b, x, z, rand(-PI, PI));
      this.list.push(b);
    });
  }

  alive() {
    return this.list.filter((b) => b.alive && !b.dummy);
  }

  hitTest(o, d, maxT) {
    let best = null;
    let bt = maxT;
    for (const b of this.list) {
      if (!b.alive) continue;
      _c.set(b.pos.x - o.x, b.pos.y + 0.9 - o.y, b.pos.z - o.z);
      const tc = _c.dot(d);
      if (tc < -1 || tc > bt + 1) continue;
      if (_c.lengthSq() - tc * tc > 1.6) continue;
      const hy = b.planting ? 1.28 : 1.63;
      const th = raySphere(o, d, _h.set(b.pos.x, b.pos.y + hy, b.pos.z), 0.165);
      const tb = rayCapsule(o, d, b.pos, 0.12, hy - 0.4, 0.27);
      let t = null;
      let head = false;
      if (th !== null && (tb === null || th < tb + 0.25)) {
        t = th;
        head = true;
      } else if (tb !== null) t = tb;
      if (t !== null && t < bt) {
        bt = t;
        best = { bot: b, t, head };
      }
    }
    return best;
  }

  damage(b, dmg, head, pen = 0.775) {
    if (!b.alive) return false;
    if (head ? b.helmet : b.armor > 0) {
      dmg *= pen;
      b.armor = Math.max(0, b.armor - dmg * 0.5);
    }
    b.hp -= dmg;
    b.alertT = 3;
    b.react = Math.max(b.react, this.diff.react * 0.5);
    if (b.hp <= 0) {
      b.alive = false;
      b.deadT = 0;
      b.planting = 0;
      b.fallDir = Math.random() < 0.5 ? 1 : -1;
      return true;
    }
    return false;
  }

  hear(pos, radius) {
    for (const b of this.list) {
      if (!b.alive || b.dummy) continue;
      const d = Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z);
      if (d < radius) {
        b.alertT = 2.5;
        b.holdYaw = Math.atan2(pos.x - b.pos.x, pos.z - b.pos.z);
      }
    }
  }

  sees(b, P) {
    _e.set(b.pos.x, b.pos.y + 1.6, b.pos.z);
    _t.set(P.pos.x, P.pos.y + 1.1, P.pos.z);
    _d.subVectors(_t, _e);
    const dist = _d.length();
    if (dist > 80) return false;
    const yawTo = Math.atan2(_d.x, _d.z);
    if (Math.abs(angDiff(yawTo, b.yaw)) > 1.35 && b.alertT <= 0 && dist > 5) return false;
    _d.divideScalar(dist);
    return !this.world.raycast(_e, _d, dist - 0.3);
  }

  move(b, dx, dz, speed, dt) {
    _prev.copy(b.pos);
    b.pos.x += dx * speed * dt;
    b.pos.z += dz * speed * dt;
    this.world.collide(b.pos, 0.3, b.pos.y, 0.7, _prev);
    b.pos.y = this.world.groundAt(b.pos.x, b.pos.z, b.pos.y + 0.7).h;
    return Math.hypot(b.pos.x - _prev.x, b.pos.z - _prev.z) / Math.max(dt, 1e-4);
  }

  shoot(b, P, ctx, dist, moving) {
    const muzzle = b.gun.userData.muzzle.getWorldPosition(_m);
    sfx.shoot('rifle', clamp(1 - dist / 90, 0.06, 1) * 0.7);
    this.fx.muzzle(muzzle, 0.8);
    const distF = clamp(1.15 - dist / 60, 0.25, 1);
    const moveF = 1 / (1 + 0.07 * P.speed);
    const p = this.diff.acc * distF * moveF * (P.air ? 0.6 : 1) * (moving ? 0.75 : 1);
    const target = _t.set(P.pos.x, P.pos.y + 1.1, P.pos.z);
    if (Math.random() < p) {
      ctx.hitPlayer(36, Math.random() < this.diff.hs, b);
      this.fx.tracer(muzzle, target, 0xffc98a);
    } else {
      target.x += rand(-1.3, 1.3);
      target.y += rand(-0.6, 1.0);
      target.z += rand(-1.3, 1.3);
      _d.subVectors(target, muzzle).normalize();
      const hit = this.world.raycast(muzzle, _d, 120);
      const end = muzzle.clone().addScaledVector(_d, hit ? hit.t : 120);
      this.fx.tracer(muzzle, end, 0xffc98a);
      if (hit) this.fx.hole(end, hit.n);
    }
  }

  engage(b, dt, P) {
    const dx = P.pos.x - b.pos.x;
    const dz = P.pos.z - b.pos.z;
    const dist = Math.hypot(dx, dz);
    const yawTo = Math.atan2(dx, dz);
    b.yaw = dampAng(b.yaw, yawTo, 8, dt);
    b.pitch = Math.atan2(P.pos.y + 1.1 - (b.pos.y + 1.45), dist);
    b.react += dt;
    b.strafeT -= dt;
    if (b.strafeT <= 0) {
      b.strafeT = rand(0.5, 1.3);
      b.strafe = pick([-1, 0, 1]);
    }
    let moved = 0;
    if (b.strafe) moved = this.move(b, Math.cos(b.yaw) * b.strafe, -Math.sin(b.yaw) * b.strafe, 2.2, dt);
    if (b.react > this.diff.react && Math.abs(angDiff(yawTo, b.yaw)) < 0.25) {
      b.fireCd -= dt;
      if (b.fireCd <= 0) {
        if (b.burst > 0) {
          this.shoot(b, P, this.ctx, Math.hypot(dist, P.pos.y - b.pos.y), moved > 0.5);
          b.burst--;
          b.fireCd = 0.11;
        } else {
          b.burst = 2 + Math.floor(Math.random() * 4);
          b.fireCd = rand(0.3, 0.7);
        }
      }
    }
    return moved;
  }

  navigate(b, dt, ctx) {
    const bomb = ctx.bomb;
    b.pitch = 0;
    if (b.hasBomb && !b.path.length && ctx.canPlant(b.pos)) {
      b.planting += dt;
      if (b.planting > 3.2) {
        b.planting = 0;
        b.hasBomb = false;
        ctx.plant(b);
        this.guardBomb(bomb.pos, b);
      }
      return 0;
    }
    b.planting = 0;
    if (b.goal === 'bomb' && bomb.state === 'dropped' && Math.hypot(b.pos.x - bomb.pos.x, b.pos.z - bomb.pos.z) < 1.4) {
      ctx.pickBomb(b);
      b.hasBomb = true;
      b.goal = 'site';
      b.path = this.routeTo(b.pos, this.site === 'A' ? 'A1' : 'B1');
    }
    if (!b.path.length) {
      if (b.hasBomb) {
        b.path = this.routeTo(b.pos, this.site === 'A' ? 'A1' : 'B1');
        return 0;
      }
      b.lookT -= dt;
      if (b.lookT <= 0) {
        b.lookT = rand(1.2, 3);
        b.holdYaw = this.time - b.lastSeenT < 6 ? Math.atan2(b.lastSeen.x - b.pos.x, b.lastSeen.z - b.pos.z) : b.yaw + rand(-1.4, 1.4);
      }
      b.yaw = dampAng(b.yaw, b.holdYaw, 3, dt);
      return 0;
    }
    const tgt = b.path[0];
    const dx = tgt.x - b.pos.x;
    const dz = tgt.y - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.9) {
      b.path.shift();
      return 0;
    }
    b.yaw = dampAng(b.yaw, Math.atan2(dx, dz), 6, dt);
    const moved = this.move(b, dx / d, dz / d, 4.4, dt);
    b.stuckT = moved < 0.6 ? b.stuckT + dt : 0;
    if (b.stuckT > 1.5) {
      b.stuckT = 0;
      b.path.shift();
    }
    return moved;
  }

  guardBomb(pos, planter) {
    for (const b of this.list) {
      if (!b.alive || b === planter) continue;
      b.goal = 'guard';
      b.path = this.routeTo(b.pos, this.site === 'A' ? 'A1' : 'B1');
      b.path.push(new THREE.Vector2(pos.x + rand(-7, 7), pos.z + rand(-7, 7)));
    }
  }

  animate(b, dt, speed) {
    b.walk += dt * speed * 2.4;
    const s = Math.sin(b.walk);
    const amp = Math.min(1, speed / 4) * 0.28;
    const lift = amp > 0.02 ? 0.12 : 0;
    b.h.hips.position.y = 0.92 - (b.planting ? 0.38 : 0) + Math.abs(Math.cos(b.walk)) * 0.03 * Math.min(1, speed / 4);
    _fl.set(0.11, Math.max(0, s) * lift, s * amp);
    _fr.set(-0.11, Math.max(0, -s) * lift, -s * amp);
    poseLegs(b.h, _fl, _fr);
    b.h.chest.rotation.set(-b.pitch * 0.4, 0, 0);
    b.h.gunMount.rotation.x = -b.pitch * 0.6;
    b.root.position.copy(b.pos);
    b.root.rotation.set(0, b.yaw, 0);
    b.root.updateMatrixWorld(true);
    poseArms(b.h, b.gun);
  }

  update(dt, ctx) {
    this.time += dt;
    this.ctx = ctx;
    const P = ctx.player;
    if (ctx.bomb.state === 'dropped' && !this.list.some((b) => b.alive && !b.dummy && b.goal === 'bomb')) {
      let best = null;
      let bd = 1e9;
      for (const b of this.list) {
        if (!b.alive || b.dummy) continue;
        const d = Math.hypot(b.pos.x - ctx.bomb.pos.x, b.pos.z - ctx.bomb.pos.z);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      if (best) {
        best.goal = 'bomb';
        best.path = this.routeTo(best.pos, this.nearestNode(ctx.bomb.pos));
        best.path.push(new THREE.Vector2(ctx.bomb.pos.x, ctx.bomb.pos.z));
      }
    }
    for (const b of this.list) {
      if (!b.alive) {
        b.deadT += dt;
        const k = Math.min(1, b.deadT * 3);
        b.root.rotation.set(-k * PI * 0.48 * b.fallDir, b.yaw, 0, 'YXZ');
        if (b.dummy && b.deadT > 4) {
          const [x, z] = pick(DUMMY_SPOTS);
          b.alive = true;
          b.hp = 100;
          this.place(b, x, z, rand(-PI, PI));
        }
        continue;
      }
      if (b.dummy) {
        const dx = P.pos.x - b.pos.x;
        const dz = P.pos.z - b.pos.z;
        if (dx * dx + dz * dz < 900) b.yaw = dampAng(b.yaw, Math.atan2(dx, dz), 1.5, dt);
        this.animate(b, dt, 0);
        continue;
      }
      b.thinkT -= dt;
      b.alertT -= dt;
      if (b.thinkT <= 0) {
        b.thinkT = 0.12 + Math.random() * 0.1;
        b.canSee = P.alive && !ctx.frozen && this.sees(b, P);
        if (b.canSee) {
          b.lastSeen.copy(P.pos);
          b.lastSeenT = this.time;
        } else b.react = Math.max(0, b.react - 0.25);
      }
      let speed = 0;
      if (!ctx.frozen) speed = b.canSee && P.alive ? this.engage(b, dt, P) : this.navigate(b, dt, ctx);
      this.animate(b, dt, speed);
    }
  }
}
