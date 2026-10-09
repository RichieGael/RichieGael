import * as THREE from 'three';
import { glowTex } from './textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class FX {
  constructor(scene) {
    this.scene = scene;
    const N = 600;
    this.pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    this.pm.frustumCulled = false;
    this.pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.free = [];
    this.parts = [];
    for (let i = 0; i < N; i++) {
      this.free.push(i);
      this.pm.setMatrixAt(i, ZERO);
      this.pm.setColorAt(i, _c.set(0xffffff));
    }
    scene.add(this.pm);

    const tg = new THREE.BoxGeometry(1, 1, 1);
    tg.translate(0, 0, 0.5);
    this.tracers = [];
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.tracers.push({ m, life: 0 });
    }

    this.flashLight = new THREE.PointLight(0xffb060, 0, 9, 2);
    scene.add(this.flashLight);
    this.flashT = 0;
    const ft = glowTex();
    this.flashes = [];
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, color: 0xffd28a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      this.flashes.push({ s, life: 0 });
    }

    const hg = new THREE.CircleGeometry(0.045, 8);
    const hm = new THREE.MeshBasicMaterial({ color: 0x241c12, polygonOffset: true, polygonOffsetFactor: -4 });
    this.holes = [];
    this.holeI = 0;
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(hg, hm);
      m.visible = false;
      scene.add(m);
      this.holes.push(m);
    }

    this.boom = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,250,230,1)', 'rgba(255,120,30,0.7)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.boom.visible = false;
    scene.add(this.boom);
    this.boomLight = new THREE.PointLight(0xff8a3a, 0, 40, 1.5);
    scene.add(this.boomLight);
    this.boomT = 0;
  }

  spawn(pos, vel, color, life, size, grav = 1) {
    const i = this.free.pop();
    if (i === undefined) return;
    this.parts.push({ i, p: pos.clone(), v: vel.clone(), life, max: life, size, grav });
    this.pm.setColorAt(i, _c.set(color));
    this.pm.instanceColor.needsUpdate = true;
  }

  burst(pos, color, n, speed, life = 0.5, size = 0.06, grav = 1, up = 0.5) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() * up + (up > 0 ? 0.1 : -0.5), Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.spawn(pos, v, color, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), grav);
    }
  }

  tracer(from, to, color = 0xffe2a0) {
    const t = this.tracers.find((x) => x.life <= 0) || this.tracers[0];
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    t.m.position.copy(from);
    t.m.lookAt(to);
    t.m.scale.set(0.022, 0.022, len);
    t.m.material.color.set(color);
    t.m.material.opacity = 0.9;
    t.m.visible = true;
    t.life = 0.06;
  }

  muzzle(pos, big = 1) {
    const f = this.flashes.find((x) => x.life <= 0) || this.flashes[0];
    f.s.position.copy(pos);
    f.s.scale.setScalar(0.45 * big);
    f.s.material.rotation = Math.random() * Math.PI;
    f.s.visible = true;
    f.life = 0.05;
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 6 * big;
    this.flashT = 0.05;
  }

  hole(point, normal) {
    const m = this.holes[this.holeI++ % this.holes.length];
    m.position.copy(point).addScaledVector(normal, 0.01);
    m.lookAt(point.clone().add(normal));
    m.visible = true;
  }

  explosion(pos) {
    this.boom.position.copy(pos).add(new THREE.Vector3(0, 1, 0));
    this.boom.visible = true;
    this.boomT = 0.9;
    this.boomLight.position.copy(this.boom.position);
    this.burst(pos, 0xffb347, 60, 14, 0.9, 0.16, 0.6, 1);
    this.burst(pos, 0x5a4a3a, 50, 7, 1.6, 0.3, -0.05, 1);
  }

  clearHoles() {
    for (const h of this.holes) h.visible = false;
  }

  update(dt) {
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k];
      p.life -= dt;
      if (p.life <= 0) {
        this.pm.setMatrixAt(p.i, ZERO);
        this.free.push(p.i);
        this.parts.splice(k, 1);
        continue;
      }
      p.v.y -= 9.8 * p.grav * dt;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.02 && p.grav > 0) {
        p.p.y = 0.02;
        p.v.multiplyScalar(0.4);
      }
      const s = p.size * Math.min(1, (p.life / p.max) * 2);
      _m.compose(p.p, _q, _s.set(s, s, s));
      this.pm.setMatrixAt(p.i, _m);
    }
    this.pm.instanceMatrix.needsUpdate = true;
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.m.material.opacity = Math.max(0, t.life / 0.06) * 0.9;
        if (t.life <= 0) t.m.visible = false;
      }
    }
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        if (f.life <= 0) f.s.visible = false;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashLight.intensity = 0;
    }
    if (this.boomT > 0) {
      this.boomT -= dt;
      const k = this.boomT / 0.9;
      this.boom.scale.setScalar(14 * (1.2 - k));
      this.boom.material.opacity = k;
      this.boomLight.intensity = 400 * k;
      if (this.boomT <= 0) {
        this.boom.visible = false;
        this.boomLight.intensity = 0;
      }
    }
  }
}
