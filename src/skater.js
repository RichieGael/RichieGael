import * as THREE from 'three';
import { clamp, wrap, angDiff, damp, rand, PI, TAU } from './util.js';
import { sfx } from './audio.js';
import { buildHumanoid, buildBoard, poseArms, poseLegs } from './models.js';

export const G = 17;
const STEP_UP = 0.34;
const SNAP = 0.16;
const RAD = 0.32;
const PUSH_MAX = 11;
const PUSH_CD = 0.5;
const ROLL_FRIC = 0.3;
const DRAG = 0.0032;
const BRAKE = 7;
const TURN = 2.7;
const SPIN = 8.5;

export const FLIPS = {
  kickflip: { name: 'Kickflip', z: 1, y: 0, dur: 0.36, pts: 500 },
  heelflip: { name: 'Heelflip', z: -1, y: 0, dur: 0.36, pts: 500 },
  shuvit: { name: '360 Shuv', z: 0, y: 1, dur: 0.34, pts: 400 },
  treflip: { name: 'Tre Flip', z: 1, y: 1, dur: 0.46, pts: 900 },
};
const MULTI = ['', 'Double ', 'Triple ', 'Quad '];

const _t = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _np = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _fl = new THREE.Vector3();
const _fr = new THREE.Vector3();
const _g = { h: 0, n: new THREE.Vector3(), col: null };
const _q = new THREE.Quaternion();
const _qy = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export class Skater {
  constructor(world, scene, deckMat) {
    this.world = world;
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.boardPivot = new THREE.Group();
    this.boardPivot.position.y = 0.085;
    this.root.add(this.boardPivot);
    this.board = buildBoard(deckMat);
    this.boardPivot.add(this.board);
    this.body = new THREE.Group();
    this.body.rotation.y = -PI / 2;
    this.body.position.y = 0.1;
    this.root.add(this.body);
    this.h = buildHumanoid({ shirt: '#2f4a6b', pants: '#3b3f45', skin: '#c99a76', shoes: '#efece4', beanie: '#c0392b', shades: true });
    this.body.add(this.h.g);
    this.gun = null;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.on = {};
    this.history = [];
    this.hipY = 0.86;
    this.reset(0, 0, 0);
  }

  setGun(model) {
    if (this.gun) this.h.gunMount.remove(this.gun);
    this.gun = model;
    if (model) this.h.gunMount.add(model);
  }

  reset(x, z, yaw) {
    if (this.board.parent !== this.boardPivot) {
      this.boardPivot.add(this.board);
      this.board.position.set(0, 0, 0);
      this.board.rotation.set(0, 0, 0);
    }
    const g = this.world.groundAt(x, z, 50, _g);
    this.pos.set(x, g.h, z);
    this.vel.set(0, 0, 0);
    this.normal.copy(g.n);
    this.groundCol = g.col;
    this.state = 'ground';
    this.speed = 0;
    this.heading = yaw;
    this.bodyYaw = yaw;
    this.crouchT = 0;
    this.pushCd = 0;
    this.pushAnim = 0;
    this.lean = 0;
    this.braking = false;
    this.air = null;
    this.grind = null;
    this.bail = null;
    this.grindCd = 0;
    this.dead = false;
    this.history.length = 0;
    this.histT = 0;
    this.root.position.copy(this.pos);
    this.root.quaternion.setFromAxisAngle(Y, yaw);
    this.h.g.rotation.set(0, 0, 0);
  }

  get travelYaw() {
    return this.speed >= 0 ? this.heading : wrap(this.heading + PI);
  }
  get hSpeed() {
    if (this.state === 'ground') return Math.abs(this.speed);
    if (this.state === 'air') return Math.hypot(this.vel.x, this.vel.z);
    if (this.state === 'grind') return this.grind.speed;
    return 0;
  }
  velocity(out) {
    if (this.state === 'ground') return this.surfaceTangent(out).multiplyScalar(this.speed);
    if (this.state === 'grind') return out.copy(this.grind.rail.dir).multiplyScalar(this.grind.sign * this.grind.speed);
    if (this.state === 'air') return out.copy(this.vel);
    return out.set(0, 0, 0);
  }
  surfaceTangent(out) {
    const n = this.normal;
    out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    out.addScaledVector(n, -out.dot(n)).normalize();
    return out;
  }

  // ---------------- simulation ----------------
  update(dt, inp) {
    this.grindCd -= dt;
    if (this.state === 'bail') return this.updateBail(dt);
    if (inp.crouch && this.state !== 'air') this.crouchT = Math.min(this.crouchT + dt, 0.45);
    if (inp.ollie) {
      inp.ollie = false;
      const late = this.state === 'air' && !this.air.popped && this.air.t < 0.14;
      if (this.state === 'ground' || this.state === 'grind' || late) this.ollie();
      this.crouchT = 0;
    }
    if (inp.flip) {
      if (this.state === 'ground' || this.state === 'grind') this.ollie();
      if (this.state === 'air') this.startFlip(inp.flip);
      inp.flip = null;
    }
    if (this.state === 'ground') this.updateGround(dt, inp);
    else if (this.state === 'air') this.updateAir(dt, inp);
    else if (this.state === 'grind') this.updateGrind(dt, inp);
  }

  ollie() {
    const charge = clamp(this.crouchT / 0.4, 0, 1);
    const pop = 4.6 + 1.9 * charge;
    if (this.state === 'air') {
      this.vel.y = Math.max(this.vel.y, 0) + pop;
      this.air.popped = true;
    } else if (this.state === 'grind') {
      const gr = this.grind;
      this.vel.copy(gr.rail.dir).multiplyScalar(gr.sign * gr.speed);
      this.vel.y += pop * 0.9;
      this.bodyYaw = gr.yaw;
      this.endGrind();
      this.toAir(true);
    } else {
      this.surfaceTangent(_t);
      _w.copy(this.normal).addScaledVector(Y, 1.5).normalize();
      this.vel.copy(_t).multiplyScalar(this.speed).addScaledVector(_w, pop);
      this.bodyYaw = this.heading;
      this.toAir(true);
    }
    this.crouchT = 0;
    sfx.pop();
  }

  toAir(popped) {
    const c = this.groundCol;
    let vert = false;
    if (this.state === 'ground' && c && c.vert && this.normal.y < 0.8) {
      // Vert: kill the motion that would carry you over the coping, so you come back down the ramp.
      const ax = c.axis === 'x' ? c.sign : 0;
      const az = c.axis === 'z' ? c.sign : 0;
      const along = this.vel.x * ax + this.vel.z * az;
      if (along > -0.35) {
        this.vel.x -= ax * (along + 0.35);
        this.vel.z -= az * (along + 0.35);
      }
      vert = this.vel.y > 2;
    }
    if (this.state === 'ground') this.bodyYaw = this.heading;
    this.state = 'air';
    this.air = { t: 0, popped, spin: 0, spinVel: 0, flip: null, flips: [], grab: null, grabs: [], startY: this.pos.y, maxY: this.pos.y, vert };
  }

  updateGround(dt, inp) {
    const absS = Math.abs(this.speed);
    if (absS < 0.6 && inp.push && this.normal.y > 0.96) {
      this.heading = inp.camYaw;
      if (this.speed < 0) this.speed = 0;
    } else {
      const d = angDiff(inp.camYaw, this.travelYaw);
      if (Math.abs(d) < 1.75 && !inp.noSteer) {
        const rate = TURN * (absS < 3 ? 1.6 : 1) * (inp.brake ? 0.6 : 1);
        const turn = clamp(d, -rate * dt, rate * dt);
        this.heading = wrap(this.heading + turn);
        this.lean = damp(this.lean, clamp(d * 2, -1, 1) * Math.min(1, absS / 6) * Math.sign(this.speed || 1), 8, dt);
      } else this.lean = damp(this.lean, 0, 6, dt);
    }
    const n = this.normal;
    this.surfaceTangent(_t);
    this.speed += -G * _t.y * dt;
    this.pushCd -= dt;
    const dirSign = this.speed < -0.3 ? -1 : 1;
    if (inp.push && !inp.crouch) {
      if (n.y > 0.96) {
        if (this.pushCd <= 0 && absS < PUSH_MAX) {
          this.speed += dirSign * (absS < 1 ? 3.4 : 2.4);
          this.pushCd = PUSH_CD;
          this.pushAnim = 1;
          sfx.push();
        }
      } else if (-_t.y * dirSign > 0) {
        this.speed += dirSign * 4.5 * dt; // pumping down a transition
      }
    }
    this.braking = inp.brake && absS > 1;
    const fr = ROLL_FRIC + (inp.brake ? BRAKE : 0);
    this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), fr * dt);
    this.speed -= this.speed * Math.abs(this.speed) * DRAG * dt;

    _prev.copy(this.pos);
    _np.copy(this.pos).addScaledVector(_t, this.speed * dt);
    const hit = this.world.collide(_np, RAD * clamp(n.y, 0.3, 1), _np.y, STEP_UP, _prev);
    if (hit && this.wallHit(hit, true)) return;
    const g = this.world.groundAt(_np.x, _np.z, _np.y + STEP_UP, _g);
    const drop = _np.y - g.h;
    const up = _t.y * Math.sign(this.speed);
    const onVert = this.groundCol && this.groundCol.vert && n.y < 0.8;
    const lip = up > 0.5 && Math.abs(this.speed) > 1 && g.n.y > 0.9 && n.y < 0.8;
    if (drop > SNAP || lip) {
      this.vel.copy(_t).multiplyScalar(this.speed);
      if (!(lip || onVert)) this.pos.copy(_np);
      this.toAir(false);
      return;
    }
    if (drop < -0.07 && g.n.y > 0.95 && n.y > 0.95) this.speed *= 0.8;
    _np.y = g.h;
    this.pos.copy(_np);
    this.normal.copy(g.n);
    this.groundCol = g.col;

    this.histT -= dt;
    if (this.histT <= 0 && g.n.y > 0.97 && Math.abs(this.speed) < 13) {
      this.histT = 0.4;
      this.history.push({ x: this.pos.x, z: this.pos.z, yaw: this.travelYaw });
      if (this.history.length > 8) this.history.shift();
    }
  }

  wallHit(hit, grounded) {
    let vx;
    let vz;
    if (grounded) {
      vx = _t.x * this.speed;
      vz = _t.z * this.speed;
    } else {
      vx = this.vel.x;
      vz = this.vel.z;
    }
    const into = -(vx * hit.nx + vz * hit.nz);
    if (into > (grounded ? 7.5 : 9.5)) {
      this.doBail('wall', into);
      return true;
    }
    if (into > 0) {
      if (grounded) {
        const tx = vx + hit.nx * into;
        const tz = vz + hit.nz * into;
        const mag = Math.hypot(tx, tz) * 0.85;
        if (mag > 0.3) {
          const yaw = Math.atan2(tx, tz);
          this.heading = this.speed >= 0 ? yaw : wrap(yaw + PI);
          this.speed = Math.sign(this.speed) * mag;
        } else this.speed = 0;
        if (into > 3) sfx.land(0.3);
      } else {
        this.vel.x += hit.nx * into * 1.15;
        this.vel.z += hit.nz * into * 1.15;
      }
    }
    return false;
  }

  updateAir(dt, inp) {
    const a = this.air;
    a.t += dt;
    this.vel.y -= G * dt;
    const target = ((inp.left ? 1 : 0) - (inp.right ? 1 : 0)) * SPIN;
    a.spinVel = damp(a.spinVel, target, target ? 12 : 9, dt);
    const dy = a.spinVel * dt;
    this.bodyYaw = wrap(this.bodyYaw + dy);
    a.spin += dy;
    if (a.flip) {
      a.flip.t += dt;
      if (a.flip.t >= a.flip.dur * a.flip.count) this.finishFlip();
    }
    if (inp.grab && !a.flip && a.t > 0.06) {
      if (!a.grab) a.grab = { name: inp.push ? 'Nosegrab' : inp.brake ? 'Tailgrab' : 'Indy', t: 0 };
      a.grab.t += dt;
    } else if (a.grab) this.finishGrab();

    _prev.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    a.maxY = Math.max(a.maxY, this.pos.y);
    const hit = this.world.collide(this.pos, RAD, this.pos.y, 0.25, _prev);
    if (hit && this.wallHit(hit, false)) return;
    if (this.grindCd <= 0 && this.vel.y < 1.5 && this.tryGrind(_prev.y)) return;
    const g = this.world.groundAt(this.pos.x, this.pos.z, Math.max(_prev.y, this.pos.y) + 0.3, _g);
    if (this.pos.y <= g.h) {
      this.pos.y = g.h;
      this.land(g);
    }
  }

  startFlip(type) {
    const a = this.air;
    const F = FLIPS[type];
    if (!F || a.grab) return;
    if (a.flip) {
      if (a.flip.type === type && a.flip.count < 4) a.flip.count++;
      return;
    }
    a.flip = { type, t: 0, dur: F.dur, count: 1, z: F.z, y: F.y };
    sfx.flick();
  }
  finishFlip() {
    const f = this.air.flip;
    const F = FLIPS[f.type];
    this.air.flips.push({ name: MULTI[f.count - 1] + F.name, pts: Math.round(F.pts * f.count * (f.count > 1 ? 1.3 : 1)) });
    this.air.flip = null;
  }
  finishGrab() {
    const gb = this.air.grab;
    if (gb.t > 0.15) this.air.grabs.push({ name: gb.name, pts: Math.round(250 + gb.t * 600) });
    this.air.grab = null;
  }

  tryGrind(prevY) {
    const p = this.pos;
    for (const r of this.world.rails) {
      _v.subVectors(p, r.a);
      const s = _v.dot(r.dir);
      if (s < 0.05 || s > r.len - 0.05) continue;
      const ry = r.a.y + r.dir.y * s;
      const dx = p.x - (r.a.x + r.dir.x * s);
      const dz = p.z - (r.a.z + r.dir.z * s);
      if (dx * dx + dz * dz > 0.25) continue;
      if (p.y > ry + 0.25 || p.y < ry - 0.4) continue;
      if (prevY < ry - 0.12) continue;
      let rel = Math.abs(angDiff(this.bodyYaw, r.yaw));
      const flipped = rel > PI / 2;
      if (flipped) rel = PI - rel;
      if (r.kind === 'coping' && rel > 0.55) continue;
      const a = this.air;
      if (a.flip) {
        if (a.flip.t / (a.flip.dur * a.flip.count) < 0.75) {
          this.doBail('flip', 5);
          return true;
        }
        this.finishFlip();
      }
      if (a.grab) this.finishGrab();
      let name;
      let yaw;
      if (rel < 0.45) {
        name = r.kind === 'coping' ? 'Coping Grind' : '50-50 Grind';
        yaw = flipped ? r.yaw + PI : r.yaw;
      } else if (rel < 1.0) {
        name = r.kind === 'ledge' ? 'Crooked Grind' : 'Feeble Grind';
        yaw = this.bodyYaw;
      } else {
        name = r.kind === 'ledge' ? 'Lipslide' : 'Boardslide';
        yaw = r.yaw + (angDiff(this.bodyYaw, r.yaw) > 0 ? PI / 2 : -PI / 2);
      }
      const along = this.vel.dot(r.dir);
      const horiz = Math.hypot(this.vel.x, this.vel.z);
      const speed = Math.max(Math.abs(along), 1.4, horiz * 0.3);
      if (a.flips.length || a.grabs.length || Math.abs(a.spin) > 2.6) this.scoreAir(false, false);
      this.grind = { rail: r, s, sign: along >= 0 ? 1 : -1, speed, name, t: 0, yaw: wrap(yaw) };
      this.state = 'grind';
      this.air = null;
      this.pos.set(r.a.x + r.dir.x * s, ry + 0.03, r.a.z + r.dir.z * s);
      sfx.land(0.25);
      this.on.grindStart?.(name);
      return true;
    }
    return false;
  }

  updateGrind(dt) {
    const gr = this.grind;
    const r = gr.rail;
    gr.t += dt;
    gr.speed += -G * r.dir.y * gr.sign * dt;
    gr.speed -= (gr.name.includes('slide') ? 1.3 : 0.6) * dt;
    if (gr.speed < 0) {
      if (Math.abs(r.dir.y) > 0.05) {
        gr.sign *= -1;
        gr.speed = -gr.speed;
      } else gr.speed = 0;
    }
    gr.s += gr.sign * gr.speed * dt;
    this.pos.copy(r.a).addScaledVector(r.dir, gr.s);
    this.pos.y += 0.03;
    this.on.grindTick?.(dt);
    if (gr.s < 0 || gr.s > r.len || gr.speed < 0.25) {
      this.vel.copy(r.dir).multiplyScalar(gr.sign * gr.speed);
      this.bodyYaw = gr.yaw;
      if (gr.speed < 0.25) {
        if (r.inward) {
          // Stalled on coping: drop back in facing down the ramp.
          this.vel.set(r.inward.x * 1.6, 0.4, r.inward.z * 1.6);
          this.bodyYaw = Math.atan2(r.inward.x, r.inward.z);
        } else {
          const side = Math.random() < 0.5 ? 1 : -1;
          this.vel.set(r.dir.z * 1.5 * side, 0.5, -r.dir.x * 1.5 * side);
        }
      }
      this.endGrind();
      this.toAir(false);
    }
  }
  endGrind() {
    this.on.grindEnd?.(this.grind);
    this.grind = null;
    this.grindCd = 0.25;
  }

  land(g) {
    const a = this.air;
    const n = g.n;
    if (a.flip) {
      if (a.flip.t / (a.flip.dur * a.flip.count) < 0.8) return this.doBail('flip', 6);
      this.finishFlip();
    }
    if (a.grab) this.finishGrab();
    const impact = -this.vel.dot(n);
    if (impact > 17) return this.doBail('impact', impact);
    const vp = _v.copy(this.vel).addScaledVector(n, -this.vel.dot(n));
    const vpl = vp.length();
    this.heading = this.bodyYaw;
    this.normal.copy(n);
    this.surfaceTangent(_t);
    const cos = vpl > 0.01 ? vp.dot(_t) / vpl : 1;
    if (vpl > 2.2 && Math.abs(cos) < 0.6) return this.doBail('sideways', impact);
    const sketchy = vpl > 2.2 && Math.abs(cos) < 0.82;
    if (vpl > 0.5 && n.y > 0.9) {
      const vy = Math.atan2(vp.x, vp.z);
      this.heading = cos >= 0 ? vy : wrap(vy + PI);
    }
    this.speed = (cos >= 0 ? 1 : -1) * vpl * (sketchy ? 0.75 : 0.97);
    this.groundCol = g.col;
    this.state = 'ground';
    this.scoreAir(sketchy, cos < 0);
    this.on.land?.({ vert: a.vert, sketchy });
    this.air = null;
    sfx.land(clamp(impact / 12, 0.2, 1));
    if (impact > 12.5) this.on.fallDamage?.((impact - 12.5) * 9);
  }

  scoreAir(sketchy, fakie) {
    const a = this.air;
    const deg = (Math.abs(a.spin) * 180) / PI;
    const spin = Math.round(deg / 180) * 180;
    const parts = [];
    let pts = 0;
    if (spin >= 180) {
      parts.push((a.spin > 0 ? 'BS ' : 'FS ') + spin);
      pts += spin === 180 ? 300 : spin === 360 ? 750 : spin === 540 ? 1300 : 2000 + (spin - 720) * 6;
    }
    for (const f of a.flips) {
      parts.push(f.name);
      pts += f.pts;
    }
    for (const gb of a.grabs) {
      parts.push(gb.name);
      pts += gb.pts;
    }
    const height = a.maxY - a.startY;
    pts += Math.round(a.t * 120 + Math.max(0, height) * (a.vert ? 220 : 90));
    if (!a.flips.length && !a.grabs.length && spin < 180) {
      if (a.popped && a.t > 0.42) parts.push('Ollie');
      else if (!a.popped && a.t > 0.55) parts.push('Air');
      else return;
    }
    let name = parts.join(' ');
    if (fakie && spin === 0) name = a.vert ? name + ' to Fakie' : 'Fakie ' + name;
    this.on.trick?.(name, Math.round(pts * (sketchy ? 0.6 : 1)), { sketchy });
  }

  doBail(reason, impact = 6) {
    if (this.state === 'bail') return;
    const v = this.velocity(_w).clone();
    const yaw = this.state === 'air' ? this.bodyYaw : this.state === 'grind' ? this.grind.yaw : this.heading;
    this.state = 'bail';
    this.grind = null;
    this.air = null;
    this.dead = reason === 'dead';
    this.scene.attach(this.board);
    const bv = v.clone().multiplyScalar(1.1).add(new THREE.Vector3(rand(-1.5, 1.5), 3 + Math.random() * 2, rand(-1.5, 1.5)));
    this.bail = { t: 0, reason, impact, v: v.multiplyScalar(0.8), yaw, side: Math.random() < 0.5 ? 1 : -1, bv, bspin: rand(6, 14) * (Math.random() < 0.5 ? -1 : 1), done: false };
    this.bail.v.y = Math.max(this.bail.v.y, 1.5);
    sfx.bail();
    this.on.bail?.(reason, impact);
  }

  updateBail(dt) {
    const b = this.bail;
    b.t += dt;
    b.v.y -= G * dt;
    _prev.copy(this.pos);
    this.pos.addScaledVector(b.v, dt);
    const hit = this.world.collide(this.pos, 0.3, this.pos.y, 0.3, _prev);
    if (hit) {
      const into = b.v.x * hit.nx + b.v.z * hit.nz;
      if (into < 0) {
        b.v.x -= hit.nx * into * 1.3;
        b.v.z -= hit.nz * into * 1.3;
      }
    }
    const g = this.world.groundAt(this.pos.x, this.pos.z, Math.max(_prev.y, this.pos.y) + 0.3, _g);
    if (this.pos.y <= g.h) {
      this.pos.y = g.h;
      b.v.y = b.v.y < -3 ? -b.v.y * 0.25 : 0;
      const f = Math.exp(-3.5 * dt);
      b.v.x *= f;
      b.v.z *= f;
    }
    const bp = this.board.position;
    b.bv.y -= G * dt;
    bp.addScaledVector(b.bv, dt);
    const bg = this.world.groundAt(bp.x, bp.z, bp.y + 0.3, _g);
    if (bp.y < bg.h + 0.06) {
      bp.y = bg.h + 0.06;
      b.bv.y = Math.abs(b.bv.y) > 2 ? -b.bv.y * 0.35 : 0;
      b.bv.x *= 0.85;
      b.bv.z *= 0.85;
      b.bspin *= 0.7;
    }
    this.board.rotation.x += b.bspin * dt;
    this.board.rotation.z += b.bspin * 0.6 * dt;
    if (b.t > 1.9 && !b.done) {
      b.done = true;
      this.on.bailDone?.(this.dead);
    }
  }

  safeSpot() {
    const h = this.history[0];
    return h || { x: this.pos.x, z: this.pos.z, yaw: this.heading };
  }

  liveTrick() {
    if (this.state === 'grind') return this.grind.name;
    if (this.state !== 'air') return '';
    const a = this.air;
    const parts = [];
    const spin = Math.floor(((Math.abs(a.spin) * 180) / PI + 25) / 180) * 180;
    if (spin) parts.push((a.spin > 0 ? 'BS ' : 'FS ') + spin);
    for (const f of a.flips) parts.push(f.name);
    if (a.flip) parts.push(MULTI[a.flip.count - 1] + FLIPS[a.flip.type].name);
    for (const gb of a.grabs) parts.push(gb.name);
    if (a.grab) parts.push(a.grab.name);
    return parts.join(' ');
  }

  // ---------------- presentation ----------------
  updateModel(dt, aimYaw, aimPitch) {
    const h = this.h;
    if (this.state === 'bail') {
      const b = this.bail;
      this.root.position.copy(this.pos);
      const k = Math.min(1, b.t * 4);
      _qy.setFromAxisAngle(Y, b.yaw);
      _qa.setFromAxisAngle(Z, b.side * k * PI * 0.47);
      this.root.quaternion.multiplyQuaternions(_qy, _qa);
      this.hipY = damp(this.hipY, 0.6, 10, dt);
      h.hips.position.y = this.hipY;
      _fl.set(0.35, 0.05, 0.25);
      _fr.set(-0.35, 0.1, -0.2);
      poseLegs(h, _fl, _fr);
      h.chest.rotation.set(0.4, 0, 0);
      this.root.updateMatrixWorld(true);
      poseArms(h, null);
      return;
    }
    let yaw = this.heading;
    if (this.state === 'ground') _v.copy(this.normal);
    else {
      _v.set(0, 1, 0);
      yaw = this.state === 'air' ? this.bodyYaw : this.grind.yaw;
    }
    _qa.setFromUnitVectors(Y, _v);
    _qy.setFromAxisAngle(Y, yaw);
    _q.multiplyQuaternions(_qa, _qy);
    this.root.quaternion.slerp(_q, 1 - Math.exp(-(this.state === 'ground' ? 18 : 35) * dt));
    this.root.position.copy(this.pos);

    const a = this.air;
    let lift = 0;
    let fz = 0;
    let fy = 0;
    let tilt = 0;
    if (a && a.flip) {
      const p = a.flip.t / a.flip.dur;
      fz = a.flip.z * p * TAU;
      fy = a.flip.y * p * TAU;
      lift = Math.sin(clamp(a.flip.t / (a.flip.dur * a.flip.count), 0, 1) * PI) * 0.24;
    }
    if (a && a.grab) {
      lift = 0.12;
      tilt = a.grab.name === 'Nosegrab' ? -0.35 : a.grab.name === 'Tailgrab' ? 0.35 : 0;
    }
    this.boardPivot.rotation.set(tilt, fy, fz, 'YXZ');
    this.boardPivot.position.y = 0.085 + lift;

    let hipT = 0.86 - (this.crouchT / 0.45) * 0.24 - (this.braking ? 0.08 : 0);
    if (this.state === 'air') hipT = a.grab ? 0.56 : a.flip ? 0.68 : 0.74;
    if (this.state === 'grind') hipT = 0.72;
    this.hipY = damp(this.hipY, hipT, 14, dt);
    h.hips.position.y = this.hipY;
    h.g.rotation.x = this.state === 'ground' ? this.lean * 0.18 : 0;

    const fly = this.state === 'air' ? lift * 0.7 + 0.04 : 0;
    _fl.set(0.21, fly, 0);
    _fr.set(-0.22, fly, 0);
    if (this.pushAnim > 0 && this.state === 'ground') {
      this.pushAnim = Math.max(0, this.pushAnim - dt * 2.2);
      const ph = 1 - this.pushAnim;
      _fr.set(-0.1 - ph * 0.45, -0.1 + Math.sin(ph * PI) * 0.06, 0.26);
    }
    poseLegs(h, _fl, _fr);

    const facing = yaw - PI / 2;
    const twist = clamp(angDiff(aimYaw, facing), -1.9, 1.9);
    h.chest.rotation.set(-aimPitch * 0.3, twist, 0);
    h.gunMount.rotation.x = -aimPitch * 0.7;
    this.root.updateMatrixWorld(true);
    poseArms(h, this.gun);
  }
}
