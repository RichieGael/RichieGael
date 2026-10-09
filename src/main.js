import * as THREE from 'three';
import { World, SPAWN_CT, SITES } from './world.js';
import { Skater, FLIPS } from './skater.js';
import { Bots } from './bots.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Menus } from './menus.js';
import { WEAPONS, GEAR, Loadout } from './weapons.js';
import { Inventory } from './skins.js';
import { buildGun } from './models.js';
import { skinCanvas, toTex } from './textures.js';
import { initAudio, sfx, setRoll, setGrind, setVolume, toggleMute } from './audio.js';
import { clamp, angDiff, damp, dampAng, rand, PI, TAU, store, fmtInt } from './util.js';
import { setupTouch, isTouch } from './touch.js';

const touch = isTouch();
const $ = (id) => document.getElementById(id);

// ---------------- renderer, scene, lights ----------------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.25 : 1.6));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe8d4ae, 80, 240);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 700);
scene.add(camera);

const SUN_OFF = new THREE.Vector3(-40, 70, 30);
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(500, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x4a88cc) },
      mid: { value: new THREE.Color(0xa6c8e4) },
      hor: { value: new THREE.Color(0xf0d8ac) },
      sunDir: { value: SUN_OFF.clone().normalize() },
    },
    vertexShader: 'varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; varying vec3 vW;
      void main(){
        float h = vW.y;
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, top, smoothstep(0.22, 0.9, h));
        if (h < 0.0) c = hor;
        float s = max(dot(normalize(vW), sunDir), 0.0);
        c += vec3(1.0, 0.86, 0.62) * (pow(s, 700.0) * 3.0 + pow(s, 10.0) * 0.22);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }),
);
sky.renderOrder = -1;
scene.add(sky);
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0xb39066, 1.3));
const sun = new THREE.DirectionalLight(0xfff0d6, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 220 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// Graffiti uses Permanent Marker; give the webfont a moment so the tags paint in it.
try {
  await Promise.race([document.fonts.load('64px "Permanent Marker"'), new Promise((r) => setTimeout(r, 1500))]);
} catch (e) {
  /* fall back to system cursive */
}

// ---------------- game objects ----------------
const world = new World(scene);
const fx = new FX(scene);
const inv = new Inventory();
const deckMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
const skater = new Skater(world, scene, deckMat);
const bots = new Bots(world, scene, fx);
const hud = new HUD(world);
const L = new Loadout();

const vm = new THREE.Group();
vm.position.set(0.2, -0.19, -0.58);
vm.rotation.y = PI - 0.05;
vm.scale.setScalar(0.6);
camera.add(vm);
const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.34), new THREE.MeshStandardMaterial({ color: 0x2f4a6b, roughness: 0.9 }));
sleeve.position.set(0, -0.1, -0.24);
vm.add(sleeve);

const bombMesh = new THREE.Group();
const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.22), new THREE.MeshStandardMaterial({ color: 0x5a2a20, roughness: 0.7 }));
bombBody.position.y = 0.065;
bombBody.castShadow = true;
const bombLed = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0x330000 }));
bombLed.position.set(0.1, 0.14, 0.04);
const bombPad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.09), new THREE.MeshStandardMaterial({ color: 0x1d1d1d }));
bombPad.position.set(-0.05, 0.135, 0);
bombMesh.add(bombBody, bombLed, bombPad);
bombMesh.visible = false;
scene.add(bombMesh);

// ---------------- state ----------------
const settings = Object.assign({ sens: 1, vol: 0.6, diff: 'normal' }, store.get('sk8strike.settings', {}));
$('optSens').value = settings.sens;
$('optVol').value = settings.vol;
$('optDiff').value = settings.diff;
setVolume(settings.vol);
const saveSettings = () => store.set('sk8strike.settings', settings);
$('optSens').oninput = (e) => {
  settings.sens = Number(e.target.value);
  saveSettings();
};
$('optVol').oninput = (e) => {
  settings.vol = Number(e.target.value);
  setVolume(settings.vol);
  saveSettings();
};
$('optDiff').onchange = (e) => {
  settings.diff = e.target.value;
  saveSettings();
};

const newStats = () => ({ kills: 0, hs: 0, style: 0, best: 0, bails: 0, deaths: 0, ct: 0, t: 0 });
const S = {
  mode: 'menu',
  running: false,
  paused: true,
  phase: 'idle',
  round: 0,
  ct: 0,
  t: 0,
  timer: 0,
  buyT: 0,
  freezeT: 0,
  endT: 0,
  respawnT: 0,
  lossStreak: 0,
  money: 800,
  hp: 100,
  armor: 0,
  helmet: false,
  kit: false,
  alive: true,
  defuseT: 0,
  view: 'tp',
  stats: newStats(),
  trickTotal: 0,
  nextCase: 25000,
  time: 0,
};
const bomb = { state: 'none', pos: new THREE.Vector3(), timer: 40, beepT: 0, carrier: null };
const combo = { active: false, pts: 0, mult: 0, names: [], idle: 0 };
const cam = { yaw: SPAWN_CT.yaw, pitch: -0.08, follow: 0, shake: 0, fov: 72, y: 0 };
const nades = [];

// ---------------- input ----------------
const keys = {};
const T = { push: false, brake: false, left: false, right: false, sl: false, sr: false, grab: false, use: false };
const inp = { push: false, brake: false, left: false, right: false, crouch: false, ollie: false, flip: null, grab: false, camYaw: 0 };
let fireHeld = false;
let triggerReady = true;
let lockFailed = false;

function look(dx, dy) {
  if (!S.running || S.paused) return;
  const s = 0.0022 * settings.sens * (L.scoped ? 0.35 : 1);
  cam.yaw -= dx * s;
  cam.pitch = clamp(cam.pitch - dy * s, -1.35, 1.2);
  if (Math.abs(dx) > 3) cam.follow = 0;
}

function requestLock() {
  if (touch || lockFailed) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => (lockFailed = true));
  } catch (e) {
    lockFailed = true;
  }
}
document.addEventListener('pointerlockerror', () => (lockFailed = true));
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) return;
  if (S.running && !S.paused && !menus.anyOpen() && S.phase !== 'over') pause();
});

const FLIP_KEYS = { KeyJ: 'kickflip', KeyK: 'heelflip', KeyL: 'shuvit', KeyI: 'treflip' };
addEventListener('keydown', (e) => {
  if (S.running && (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab')) e.preventDefault();
  const wasDown = keys[e.code];
  keys[e.code] = true;
  if (wasDown || !S.running) return;
  if (!$('buy').hidden) {
    if (/^Digit\d$/.test(e.code)) {
      const n = Number(e.code.slice(5));
      menus.buyIndex((n === 0 ? 10 : n) - 1);
    }
    if (e.code === 'KeyB' || e.code === 'Escape') closeBuy();
    return;
  }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !S.paused) return pause();
  if (S.paused) return;
  initAudio();
  if (FLIP_KEYS[e.code]) inp.flip = FLIP_KEYS[e.code];
  switch (e.code) {
    case 'Space':
      inp.crouch = true;
      break;
    case 'Digit1':
      switchSlot('primary');
      break;
    case 'Digit2':
      switchSlot('secondary');
      break;
    case 'Digit3':
      switchSlot('knife');
      break;
    case 'Digit4':
      switchSlot('he');
      break;
    case 'KeyQ':
      switchSlot(L.prev);
      break;
    case 'KeyR':
      reload();
      break;
    case 'KeyB':
      openBuy();
      break;
    case 'KeyV':
      S.view = S.view === 'tp' ? 'fp' : 'tp';
      break;
    case 'KeyM':
      hud.banner(toggleMute() ? 'MUTED' : 'SOUND ON');
      break;
    default:
      break;
  }
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space' && inp.crouch) {
    inp.crouch = false;
    if (S.running && !S.paused) inp.ollie = true;
  }
});
addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  fireHeld = false;
  inp.crouch = false;
});
canvas.addEventListener('mousedown', (e) => {
  if (!S.running || S.paused) return;
  initAudio();
  if (!document.pointerLockElement && !lockFailed) {
    requestLock();
    return;
  }
  if (e.button === 0) fireHeld = true;
  if (e.button === 2) altFire();
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    fireHeld = false;
    triggerReady = true;
  }
});
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas || (lockFailed && !touch)) look(e.movementX, e.movementY);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener(
  'wheel',
  (e) => {
    if (!S.running || S.paused || !$('buy').hidden) return;
    if (L.cycle(e.deltaY > 0 ? 1 : -1)) onWeaponChange();
  },
  { passive: true },
);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

function touchAction(k, down) {
  if (!S.running || S.paused) return;
  initAudio();
  switch (k) {
    case 'fire':
      fireHeld = down;
      if (!down) triggerReady = true;
      break;
    case 'ollie':
      if (down) inp.crouch = true;
      else {
        inp.crouch = false;
        inp.ollie = true;
      }
      break;
    case 'kickflip':
    case 'heelflip':
    case 'shuvit':
    case 'treflip':
      if (down) inp.flip = k;
      break;
    case 'grab':
      T.grab = down;
      break;
    case 'scope':
      if (down) altFire();
      break;
    case 'reload':
      if (down) reload();
      break;
    case 'swap':
      if (down && L.cycle(1)) onWeaponChange();
      break;
    case 'buy':
      if (down) ($('buy').hidden ? openBuy() : closeBuy());
      break;
    case 'use':
      T.use = down;
      break;
    case 'spinL':
      T.sl = down;
      break;
    case 'spinR':
      T.sr = down;
      break;
    default:
      break;
  }
}

// ---------------- skins & weapons ----------------
const texCache = new Map();
function skinTexFor(item, w = 256, h = 256) {
  const eq = inv.equippedFor(item);
  if (!eq) return null;
  const key = `${eq.skin.id}:${eq.wear.toFixed(3)}:${w}x${h}`;
  if (!texCache.has(key)) texCache.set(key, toTex(skinCanvas(eq.skin, eq.wear, w, h), true));
  return texCache.get(key);
}
const stockDeck = toTex(skinCanvas(null, 0.05, 128, 512), false);
function applySkins() {
  deckMat.map = skinTexFor('deck', 128, 512) || stockDeck;
  deckMat.needsUpdate = true;
  onWeaponChange();
}
function onWeaponChange() {
  const id = L.id;
  skater.setGun(buildGun(id, skinTexFor(id)));
  if (vm.gun) vm.remove(vm.gun);
  vm.gun = buildGun(id, skinTexFor(id));
  vm.gun.traverse((o) => (o.castShadow = false));
  vm.add(vm.gun);
}
function switchSlot(slot) {
  if (L.switchTo(slot)) onWeaponChange();
}
function reload() {
  if (L.startReload()) sfx.reload();
}
function altFire() {
  const w = L.w;
  if (w.scope && L.reloadT <= 0 && L.deploy <= 0) {
    L.scoped = !L.scoped;
    L.rescope = 0;
    sfx.zoom();
  } else if (w.melee && L.canFire()) knife(true);
}

function currentSpread(w) {
  let s = w.scope && !L.scoped ? w.noscope : w.spread;
  if (skater.state === 'air') s += Math.abs(skater.vel.y) < 1.6 ? w.spread * 1.5 : w.air;
  else s += Math.min(skater.hSpeed, 14) * w.move;
  return s + L.recoil * 0.35;
}

const _o = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _mz = new THREE.Vector3();
const _h = new THREE.Vector3();
const _v = new THREE.Vector3();

function trace(o, d, maxT) {
  const wh = world.raycast(o, d, maxT);
  const bh = bots.hitTest(o, d, wh ? wh.t : maxT);
  if (bh) return { t: bh.t, bot: bh.bot, head: bh.head };
  return wh ? { t: wh.t, n: wh.n } : { t: maxT };
}

function aimRay() {
  camera.getWorldDirection(_dir);
  _o.copy(camera.position);
  _h.set(skater.pos.x, skater.pos.y + 1.5, skater.pos.z);
  _o.addScaledVector(_dir, Math.max(0, _v.subVectors(_h, _o).dot(_dir) - 0.3));
}

function muzzlePos(out) {
  const g = S.view === 'fp' || L.scoped ? vm.gun : skater.gun;
  return g ? g.userData.muzzle.getWorldPosition(out) : out.copy(camera.position);
}

function fire(w, it) {
  it.mag--;
  L.cd = w.rate;
  L.shots++;
  const spread = currentSpread(w);
  aimRay();
  _r.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const a = Math.random() * TAU;
  const rr = spread * Math.sqrt(Math.random());
  _dir.addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize();
  const hit = trace(_o, _dir, 260);
  const end = _o.clone().addScaledVector(_dir, hit.t);
  muzzlePos(_mz);
  fx.muzzle(_mz, w.slot === 'primary' ? 1.2 : 0.9);
  fx.tracer(_mz, end);
  sfx.shoot(w.sound, 1);
  bots.hear(skater.pos, 40);
  if (hit.bot) {
    const killed = bots.damage(hit.bot, w.dmg * (hit.head ? w.hs : 1), hit.head, w.pen);
    fx.burst(end, 0x8a1010, 10, 3, 0.4, 0.05);
    hud.hitmark(hit.head);
    if (hit.head) sfx.headshot();
    else sfx.hit();
    if (killed) onBotKilled(hit.bot, { weapon: w, head: hit.head });
  } else if (hit.n) {
    fx.hole(end, hit.n);
    fx.burst(end, 0xcdb48a, 6, 2.5, 0.35, 0.04);
  }
  L.recoil = Math.min(L.recoil + w.recoil, 0.12);
  cam.pitch = clamp(cam.pitch + w.recoil * 0.45, -1.35, 1.2);
  cam.yaw += (Math.random() - 0.5) * w.recoil * 0.4 * Math.min(1, L.shots / 6);
  vm.kick = 1;
  if (w.scope && L.scoped) {
    L.scoped = false;
    L.rescope = w.rate * 0.95;
  }
}

function knife(heavy) {
  L.cd = heavy ? 1.0 : WEAPONS.knife.rate;
  sfx.knife();
  vm.kick = 1;
  const reach = WEAPONS.knife.range + Math.min(skater.hSpeed * 0.08, 1);
  for (const b of bots.list) {
    if (!b.alive) continue;
    const dx = b.pos.x - skater.pos.x;
    const dz = b.pos.z - skater.pos.z;
    if (Math.hypot(dx, dz) > reach || Math.abs(b.pos.y - skater.pos.y) > 1.6) continue;
    const toYaw = Math.atan2(dx, dz);
    if (Math.abs(angDiff(toYaw, cam.yaw)) > 0.9) continue;
    const back = Math.abs(angDiff(b.yaw, toYaw)) < 1.0;
    const dmg = back ? (heavy ? 180 : 90) : heavy ? 65 : 40;
    const killed = bots.damage(b, dmg, false, 0.85);
    hud.hitmark(false);
    sfx.hit();
    fx.burst(_v.set(b.pos.x, b.pos.y + 1.1, b.pos.z), 0x8a1010, 12, 3, 0.4, 0.05);
    if (killed) onBotKilled(b, { weapon: WEAPONS.knife, head: false, knife: true });
    break;
  }
}

const nadeGeo = new THREE.SphereGeometry(0.06, 10, 8);
const nadeMat = new THREE.MeshStandardMaterial({ color: 0x4b5b2f, roughness: 0.6 });
function throwGrenade() {
  L.he--;
  L.cd = 0.9;
  camera.getWorldDirection(_dir);
  const m = new THREE.Mesh(nadeGeo, nadeMat);
  m.castShadow = true;
  scene.add(m);
  const pos = new THREE.Vector3(skater.pos.x, skater.pos.y + 1.5, skater.pos.z).addScaledVector(_dir, 0.6);
  const vel = _dir.clone().multiplyScalar(18);
  vel.y += 3;
  vel.add(skater.velocity(new THREE.Vector3()).multiplyScalar(0.8));
  nades.push({ m, pos, vel, t: 0 });
  sfx.knife();
  if (L.he <= 0) {
    L.switchTo(L.has(L.prev) && L.prev !== 'he' ? L.prev : 'secondary');
    onWeaponChange();
  }
}
function updateNades(dt) {
  for (let i = nades.length - 1; i >= 0; i--) {
    const n = nades[i];
    n.t += dt;
    n.vel.y -= 20 * dt;
    const prev = n.pos.clone();
    n.pos.addScaledVector(n.vel, dt);
    const hit = world.collide(n.pos, 0.08, n.pos.y, 0, prev);
    if (hit) {
      const into = n.vel.x * hit.nx + n.vel.z * hit.nz;
      if (into < 0) {
        n.vel.x -= 1.6 * into * hit.nx;
        n.vel.z -= 1.6 * into * hit.nz;
      }
      n.vel.multiplyScalar(0.6);
    }
    const g = world.groundAt(n.pos.x, n.pos.z, Math.max(prev.y, n.pos.y) + 0.1);
    if (n.pos.y < g.h + 0.06) {
      n.pos.y = g.h + 0.06;
      if (n.vel.y < 0) n.vel.y = -n.vel.y * 0.35;
      n.vel.x *= 0.7;
      n.vel.z *= 0.7;
    }
    n.m.position.copy(n.pos);
    if (n.t > 1.6) {
      explode(n.pos, 8, 98, 'he');
      scene.remove(n.m);
      nades.splice(i, 1);
    }
  }
}

function explode(p, radius, maxDmg, kind) {
  fx.explosion(p);
  sfx.explode();
  const dp = Math.hypot(skater.pos.x - p.x, skater.pos.y + 1 - p.y, skater.pos.z - p.z);
  cam.shake = Math.max(cam.shake, clamp(1.2 - dp / 40, 0, 1));
  bots.hear(p, 50);
  for (const b of bots.list) {
    if (!b.alive) continue;
    const d = Math.hypot(b.pos.x - p.x, b.pos.y + 1 - p.y, b.pos.z - p.z);
    if (d > radius) continue;
    _o.copy(p).y += 0.3;
    _dir.set(b.pos.x - _o.x, b.pos.y + 1 - _o.y, b.pos.z - _o.z);
    const len = _dir.length();
    _dir.divideScalar(len);
    if (world.raycast(_o, _dir, len - 0.2)) continue;
    const killed = bots.damage(b, maxDmg * Math.pow(1 - d / radius, 1.2), false, 0.5);
    if (killed && kind === 'he') onBotKilled(b, { weapon: WEAPONS.he, head: false, he: true });
    else if (killed) hud.kill({ killer: '', victim: b.name, vTeam: 't', weapon: 'C4' });
  }
  if (dp < radius) damagePlayer(maxDmg * Math.pow(1 - dp / radius, 1.2), false, null, kind);
}

// ---------------- combos & money ----------------
function addMoney(n, why) {
  const before = S.money;
  S.money = clamp(S.money + n, 0, 16000);
  const d = S.money - before;
  if (d) hud.popMoney(d, why);
}

function addTrick(name, pts) {
  if (!combo.active) {
    combo.active = true;
    combo.pts = 0;
    combo.mult = 0;
    combo.names = [];
  }
  combo.pts += pts;
  combo.mult += 1;
  combo.names.push(name);
  combo.idle = 0;
}

function bankCombo() {
  const total = combo.pts * combo.mult;
  combo.active = false;
  S.stats.best = Math.max(S.stats.best, total);
  const cash = Math.min(S.mode === 'free' ? 5000 : 2000, Math.round(total / 250) * 10);
  if (cash > 0) {
    addMoney(cash, 'line');
    sfx.cash();
  }
  const n = combo.names.length;
  hud.comboResult(`<b>${fmtInt(total)}</b>`, `${n} trick${n === 1 ? '' : 's'}` + (cash ? ` · +$${cash.toLocaleString('en-US')}` : ''));
  S.trickTotal += total;
  while (S.trickTotal >= S.nextCase) {
    S.nextCase += 30000;
    inv.addCase(1);
    hud.banner('CASE EARNED', 'Open it from the pause menu', 'style');
  }
}

const INJURIES = ['Bruised ego', 'Cracked rib', 'Sprained wrist', 'Fractured tailbone', 'Chipped tooth', 'Torn ACL', 'Concussion', 'Broken collarbone', 'Shattered femur', 'Dislocated shoulder'];

skater.on.trick = (name, pts, info) => {
  addTrick(name, pts);
  hud.trickLanded(info.sketchy ? name + ' (sketchy)' : name);
  sfx.trick();
};
skater.on.grindEnd = (gr) => {
  if (gr.t > 0.15) {
    addTrick(gr.name, Math.round(150 + gr.t * 450));
    hud.trickLanded(gr.name);
  }
};
let sparkT = 0;
skater.on.grindTick = (dt) => {
  sparkT -= dt;
  if (sparkT <= 0) {
    sparkT = 0.035;
    fx.burst(skater.pos, 0xffc04a, 2, 3, 0.25, 0.035, 1, 0.8);
  }
};
skater.on.land = (info) => {
  if (info.vert) cam.follow = 0.55;
};
skater.on.fallDamage = (dmg) => damagePlayer(dmg, false, null, 'fall');
skater.on.bail = (reason, impact) => {
  if (combo.active) {
    const lost = combo.pts * combo.mult;
    combo.active = false;
    hud.comboResult(`<b>−${fmtInt(lost)}</b>`, 'Line lost');
  }
  hud.trickLanded(reason === 'dead' ? '' : 'Bailed', 'bailed');
  if (reason === 'dead') return;
  S.stats.bails++;
  if (impact >= 9) {
    const n = clamp(Math.floor(impact / 4), 1, 4);
    const list = INJURIES.slice().sort(() => Math.random() - 0.5).slice(0, n);
    hud.banner('HALL OF MEAT', list.join(' · '), 'meat');
    if (reason === 'impact' || reason === 'wall') damagePlayer((impact - 9) * 6, false, null, 'fall');
  }
};
skater.on.bailDone = (dead) => {
  if (dead || !S.alive) return;
  const s = skater.safeSpot();
  skater.reset(s.x, s.z, s.yaw);
  cam.yaw = s.yaw;
};

// ---------------- kills & damage ----------------
function onBotKilled(b, info) {
  const w = info.weapon;
  const mods = [];
  const st = skater.state;
  const a = skater.air;
  if (!info.he) {
    if (st === 'air') mods.push('air');
    if (st === 'grind') mods.push('grind');
    if (w.scope && !L.scoped && !info.knife) mods.push('noscope');
    if (a && Math.abs(a.spin) > 5.2) mods.push('360');
    if (a && (a.flip || a.flips.length)) mods.push('flip');
  }
  const parts = [];
  if (mods.includes('360')) parts.push('360');
  if (mods.includes('noscope')) parts.push('NO-SCOPE');
  if (mods.includes('flip')) parts.push((a.flip ? FLIPS[a.flip.type].name : a.flips[a.flips.length - 1].name).toUpperCase());
  else if (mods.includes('air')) parts.push('AIRBORNE');
  if (mods.includes('grind')) parts.push(skater.grind.name.toUpperCase());
  if (info.knife) parts.push('KNIFE');
  if (info.he) parts.push('NADE');
  if (info.head) parts.push('HEADSHOT');
  const style = mods.length;
  const pts = Math.round(500 * (1 + style) * (info.head ? 1.5 : 1));
  const label = parts.length ? parts.join(' ') : 'KILL';
  addTrick(label.charAt(0) + label.slice(1).toLowerCase() + (parts.length ? ' kill' : ''), pts);
  addMoney(w.reward + style * 200, style ? 'style kill' : 'kill');
  if (style || info.head || info.knife || info.he) hud.banner(label + '!', `+${fmtInt(pts)} points`, style ? 'style' : '');
  hud.kill({ killer: 'You', kTeam: 'ct', victim: b.name, vTeam: 't', weapon: w.name, mods, head: info.head, mine: true });
  S.stats.kills++;
  if (info.head) S.stats.hs++;
  if (style) S.stats.style++;
  if (b.hasBomb) {
    b.hasBomb = false;
    dropBomb(b.pos);
  }
}

function damagePlayer(dmg, head, attacker, source) {
  if (!S.alive || !S.running || dmg <= 0) return;
  if (source === 'bot' && (head ? S.helmet : S.armor > 0)) {
    dmg *= 0.775;
    S.armor = Math.max(0, S.armor - dmg * 0.5);
  }
  if (source === 'he' && S.armor > 0) dmg *= 0.5;
  S.hp -= dmg;
  sfx.hurt();
  if (head) sfx.headshot();
  cam.pitch = clamp(cam.pitch + 0.015, -1.35, 1.2);
  if (attacker) hud.damageDir(-angDiff(Math.atan2(attacker.pos.x - skater.pos.x, attacker.pos.z - skater.pos.z), cam.yaw));
  else hud.damageDir(PI);
  if (S.hp <= 0) die(attacker, head, source);
}

function die(attacker, head, source) {
  S.alive = false;
  S.hp = 0;
  S.stats.deaths++;
  L.scoped = false;
  skater.doBail('dead', 8);
  const weapon = attacker ? 'AK-47' : { fall: 'Gravity', he: 'HE Grenade', bomb: 'C4' }[source] || 'World';
  hud.kill({ killer: attacker ? attacker.name : '', kTeam: 't', victim: 'You', vTeam: 'ct', weapon, head, mine: false });
  hud.banner('YOU DIED', attacker ? `${attacker.name} got you${head ? ' with a headshot' : ''}` : weapon === 'Gravity' ? 'Gravity wins again' : '', 'meat');
  if (S.mode === 'free') S.respawnT = 2.5;
  else endRound('t', 'Counter-terrorist eliminated');
}

// ---------------- bomb ----------------
function dropBomb(p) {
  bomb.state = 'dropped';
  bomb.carrier = null;
  bomb.pos.set(p.x, world.groundAt(p.x, p.z, p.y + 0.5).h, p.z);
  bombMesh.position.copy(bomb.pos);
  bombMesh.visible = true;
}
function plantBomb(b) {
  bomb.state = 'planted';
  bomb.carrier = null;
  bomb.pos.copy(b.pos);
  bomb.timer = 40;
  bomb.beepT = 0;
  bombMesh.position.copy(bomb.pos);
  bombMesh.rotation.y = b.yaw;
  bombMesh.visible = true;
  hud.banner('BOMB PLANTED', `Site ${bots.site} · 40 seconds`, 'meat');
  hud.kill({ killer: b.name, kTeam: 't', victim: `planted at ${bots.site}`, vTeam: 't', weapon: 'C4' });
  sfx.plant();
}
const botCtx = {
  player: { pos: skater.pos, alive: true, speed: 0, air: false },
  bomb,
  frozen: false,
  hitPlayer: (dmg, head, b) => damagePlayer(dmg, head, b, 'bot'),
  plant: (b) => plantBomb(b),
  pickBomb: (b) => {
    bomb.state = 'carried';
    bomb.carrier = b;
    bombMesh.visible = false;
  },
  canPlant: (p) => {
    const s = SITES[bots.site];
    return p.x > s.x0 && p.x < s.x1 && p.z > s.z0 && p.z < s.z1;
  },
};

function updateBomb(dt) {
  let defusing = false;
  let hint = '';
  if (bomb.state === 'planted') {
    bomb.timer -= dt;
    bomb.beepT -= dt;
    if (bomb.beepT <= 0) {
      bomb.beepT = bomb.timer > 20 ? 1 : bomb.timer > 10 ? 0.5 : bomb.timer > 5 ? 0.25 : 0.12;
      const d = skater.pos.distanceTo(bomb.pos);
      if (d < 60) sfx.beep();
      bombLed.material.color.setHex(0xff2010);
      setTimeout(() => bombLed.material.color.setHex(0x330000), 80);
    }
    if (S.alive) {
      const d = Math.hypot(skater.pos.x - bomb.pos.x, skater.pos.z - bomb.pos.z) + Math.abs(skater.pos.y - bomb.pos.y) * 0.5;
      const dur = S.kit ? 3 : 5;
      if (d < 2) {
        if (skater.state !== 'ground' || skater.hSpeed > 3) hint = 'Slow down to defuse';
        else if (keys.KeyE || T.use) {
          defusing = true;
          S.defuseT += dt;
          if (Math.floor(S.defuseT * 4) !== Math.floor((S.defuseT - dt) * 4)) sfx.defuse();
          if (S.defuseT >= dur) {
            bomb.state = 'defused';
            hud.banner('BOMB DEFUSED', S.kit ? 'Kit paid off' : 'With no kit, too', 'style');
            endRound('ct', 'Bomb defused');
          }
        } else hint = `${touch ? 'Hold DEFUSE' : 'Hold E'} to defuse (${dur}s)`;
      }
    }
    if (bomb.state === 'planted' && bomb.timer <= 0) {
      bomb.state = 'exploded';
      bombMesh.visible = false;
      endRound('t', 'Target bombed');
      explode(bomb.pos, 30, 520, 'bomb');
      cam.shake = 1.4;
    }
  }
  if (!defusing) S.defuseT = 0;
  hud.defuse(defusing ? S.defuseT / (S.kit ? 3 : 5) : null);
  return hint;
}

// ---------------- rounds ----------------
function canBuyNow() {
  return S.mode === 'free' || (S.phase === 'live' && S.buyT > 0);
}
function buyLeftText() {
  if (S.mode === 'free') return 'Free skate: buy anything, anytime';
  return S.buyT > 0 ? `${Math.ceil(S.buyT)}s left to buy` : 'Buy time is over';
}
function owns(id) {
  if (id === 'vest') return S.armor >= 100;
  if (id === 'vesthelm') return S.armor >= 100 && S.helmet;
  if (id === 'kit') return S.kit;
  if (id === 'he') return L.he >= 1;
  const w = WEAPONS[id];
  return L[w.slot] && L[w.slot].id === id;
}
function buy(id) {
  if (!canBuyNow()) return;
  const item = WEAPONS[id] || GEAR[id];
  if (!item || owns(id) || S.money < item.price) return;
  S.money -= item.price;
  sfx.buy();
  if (id === 'vest') S.armor = 100;
  else if (id === 'vesthelm') {
    S.armor = 100;
    S.helmet = true;
  } else if (id === 'kit') S.kit = true;
  else {
    L.give(id);
    onWeaponChange();
  }
  menus.renderBuy();
}
function openBuy() {
  if (!canBuyNow()) {
    hud.banner('BUY TIME IS OVER', 'Earn cash with tricks for next round');
    return;
  }
  $('buy').hidden = false;
  menus.renderBuy();
  fireHeld = false;
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeBuy() {
  $('buy').hidden = true;
  requestLock();
}

function respawnPlayer() {
  S.alive = true;
  S.hp = 100;
  skater.reset(SPAWN_CT.x + rand(-2, 2), SPAWN_CT.z, SPAWN_CT.yaw);
  cam.yaw = SPAWN_CT.yaw;
  cam.pitch = -0.08;
}

function clearNades() {
  for (const n of nades) scene.remove(n.m);
  nades.length = 0;
}

function startMatch(mode) {
  S.mode = mode;
  S.round = 0;
  S.ct = 0;
  S.t = 0;
  S.lossStreak = 0;
  S.money = mode === 'free' ? 10000 : 800;
  S.stats = newStats();
  S.armor = 0;
  S.helmet = false;
  S.kit = false;
  S.alive = true;
  L.reset();
  onWeaponChange();
  combo.active = false;
  clearNades();
  fx.clearHoles();
  bomb.state = 'none';
  bombMesh.visible = false;
  hud.roundBanner(null);
  if (mode === 'free') {
    bots.spawnDummies();
    S.phase = 'free';
    respawnPlayer();
    hud.banner('FREE SKATE', 'Target dummies respawn. Buy anything with B.');
  } else startRound();
}

function startRound() {
  S.round++;
  if (!S.alive) {
    L.reset();
    S.armor = 0;
    S.helmet = false;
    S.kit = false;
    onWeaponChange();
  }
  L.scoped = false;
  respawnPlayer();
  clearNades();
  fx.clearHoles();
  const carrier = bots.spawnRound(S.round, settings.diff);
  bomb.state = 'carried';
  bomb.carrier = carrier;
  bombMesh.visible = false;
  S.phase = 'live';
  S.timer = 115;
  S.buyT = 20;
  S.freezeT = 5;
  hud.roundBanner(null);
  hud.banner(`ROUND ${S.round}`, touch ? 'Tap BUY for guns, then hold the sites' : 'Press B to buy, then hold the sites');
  sfx.roundStart();
}

function endRound(winner, reason) {
  if (S.phase !== 'live') return;
  S.phase = 'end';
  S.endT = 5.5;
  S[winner]++;
  const won = winner === 'ct';
  if (won) {
    S.lossStreak = 0;
    addMoney(3250 + (reason === 'Bomb defused' ? 300 : 0), 'round won');
    inv.addCase(1);
  } else {
    addMoney(1400 + 500 * Math.min(4, S.lossStreak), 'round lost');
    S.lossStreak++;
  }
  if (combo.active) bankCombo();
  hud.roundBanner(won ? 'COUNTER-TERRORISTS WIN' : 'TERRORISTS WIN', reason + (won ? ' · +1 case' : ''), won ? 'ct' : 't');
  if (won) sfx.win();
  else sfx.lose();
}

function matchOver() {
  S.phase = 'over';
  S.stats.ct = S.ct;
  S.stats.t = S.t;
  if (document.pointerLockElement) document.exitPointerLock();
  menus.showMatchEnd(S.ct > S.t, S.stats);
}

// ---------------- flow ----------------
function start(mode) {
  initAudio();
  for (const id of ['matchEnd', 'buy', 'cases', 'inv']) $(id).hidden = true;
  menus.hideMain();
  S.running = true;
  S.paused = false;
  hud.show(true);
  $('touch').hidden = !touch;
  startMatch(mode);
  requestLock();
}
function pause() {
  if (!S.running || S.paused) return;
  S.paused = true;
  fireHeld = false;
  inp.crouch = false;
  setRoll(0, 0);
  setGrind(0);
  $('buy').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  menus.showMain(true);
}
function resume() {
  menus.hideMain();
  S.paused = false;
  initAudio();
  requestLock();
}
function quit() {
  S.running = false;
  S.paused = true;
  S.mode = 'menu';
  S.phase = 'idle';
  bots.clear();
  clearNades();
  bomb.state = 'none';
  bombMesh.visible = false;
  hud.show(false);
  $('touch').hidden = true;
  setRoll(0, 0);
  setGrind(0);
  respawnPlayer();
  menus.showMain(false);
}

const game = {
  S,
  inv,
  start,
  resume,
  quit,
  pause,
  buy,
  owns,
  closeBuy,
  buyLeftText,
  applySkins,
  look,
  touchAction,
  sheetOpened() {},
  sheetClosed() {
    menus.refreshCount();
  },
};
const menus = new Menus(game);
if (touch) setupTouch(game, T);
applySkins();
menus.showMain(false);

// ---------------- per-frame ----------------
const _cd = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _tg = new THREE.Vector3();
const _rd = new THREE.Vector3();
let aimT = 0;
let radarT = 0;

function step(dt) {
  const kL = keys.KeyA || keys.ArrowLeft || T.left || T.sl;
  const kR = keys.KeyD || keys.ArrowRight || T.right || T.sr;
  inp.push = !!(keys.KeyW || keys.ArrowUp || T.push);
  inp.brake = !!(keys.KeyS || keys.ArrowDown || T.brake);
  inp.left = !!kL;
  inp.right = !!kR;
  inp.grab = !!(keys.ShiftLeft || keys.ShiftRight || T.grab);
  if (skater.state === 'ground' || skater.state === 'grind') cam.yaw += ((kL ? 1 : 0) - (kR ? 1 : 0)) * 2.3 * dt;
  if (cam.follow > 0) {
    cam.follow -= dt;
    cam.yaw = dampAng(cam.yaw, skater.travelYaw, 8, dt);
  }
  inp.camYaw = cam.yaw;
  inp.noSteer = cam.follow > 0;
  if (!S.alive) {
    inp.ollie = false;
    inp.flip = null;
  }

  const n = Math.min(8, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < n; i++) skater.update(dt / n, inp);

  // weapons
  L.update(dt);
  if (L.rescope > 0) {
    L.rescope -= dt;
    if (L.rescope <= 0 && L.w.scope) L.scoped = true;
  }
  const w = L.w;
  if (fireHeld && S.alive && skater.state !== 'bail' && $('buy').hidden && (w.auto || w.melee || triggerReady) && L.canFire()) {
    if (w.grenade) {
      throwGrenade();
      triggerReady = false;
    } else if (w.melee) knife(false);
    else {
      const it = L.item;
      triggerReady = false;
      if (it.mag <= 0) {
        sfx.dry();
        L.cd = 0.25;
        reload();
      } else fire(w, it);
    }
  }
  updateNades(dt);

  // bots
  botCtx.player.alive = S.alive;
  botCtx.player.speed = skater.hSpeed;
  botCtx.player.air = skater.state === 'air';
  botCtx.frozen = S.phase === 'end' || (S.phase === 'live' && S.freezeT > 0);
  bots.update(dt, botCtx);

  // rules
  let hint = updateBomb(dt);
  if (S.phase === 'live') {
    S.freezeT -= dt;
    S.buyT -= dt;
    if (bomb.state !== 'planted') {
      S.timer -= dt;
      if (S.timer <= 0) endRound('ct', 'Time ran out');
    }
    if (S.phase === 'live' && bots.alive().length === 0 && bomb.state !== 'planted') endRound('ct', 'All terrorists eliminated');
  } else if (S.phase === 'end') {
    S.endT -= dt;
    if (S.endT <= 0) {
      if (S.ct >= 8 || S.t >= 8) matchOver();
      else startRound();
    }
  } else if (S.phase === 'free' && !S.alive) {
    S.respawnT -= dt;
    if (S.respawnT <= 0) respawnPlayer();
  }

  // combo
  if (combo.active) {
    combo.idle = skater.state === 'ground' ? combo.idle + dt : 0;
    if (combo.idle > 1.6) bankCombo();
  }

  // hud
  const it = L.item;
  if (!hint) {
    if (S.phase === 'live' && S.buyT > 0 && S.round > 0) hint = touch ? '' : `B to buy · ${Math.ceil(S.buyT)}s`;
    else if (it && it.mag === 0 && it.reserve > 0 && L.reloadT <= 0) hint = touch ? 'Tap RELOAD' : 'R to reload';
    else if (S.phase === 'live' && S.freezeT > 0) hint = 'Terrorists are gearing up…';
  }
  hud.hint(hint);
  hud.vitals(S.hp, S.armor, S.helmet, S.kit);
  hud.money(S.money);
  const slots = [];
  if (L.primary) slots.push({ slot: 'primary', key: 1, name: WEAPONS[L.primary.id].name });
  if (L.secondary) slots.push({ slot: 'secondary', key: 2, name: WEAPONS[L.secondary.id].name });
  slots.push({ slot: 'knife', key: 3, name: 'Knife' });
  if (L.he > 0) slots.push({ slot: 'he', key: 4, name: 'HE Grenade' });
  if (it) hud.ammo(w.name, it.mag, it.reserve, slots, L.cur, L.reloadT > 0);
  else hud.ammo(w.grenade ? `HE ×${L.he}` : 'KNIFE', null, 0, slots, L.cur, false);
  if (S.mode === 'free') hud.clock(null, false, 'Free skate');
  else if (bomb.state === 'planted') hud.clock(bomb.timer, true, 'Bomb planted');
  else hud.clock(S.phase === 'live' ? S.timer : 0, S.phase === 'live' && S.timer < 10, `Round ${S.round}`);
  hud.score(S.ct, S.t);
  hud.alive(S.mode === 'comp' ? bots.alive().length : 0, S.mode === 'comp' ? bots.list.length : 0);
  hud.bombTimer(null);
  const fovRad = (camera.fov * PI) / 180;
  hud.crosshair((Math.tan(currentSpread(w)) / Math.tan(fovRad / 2)) * (innerHeight / 2), S.alive && !w.scope);
  hud.scope(L.scoped && S.alive);
  hud.trick(skater.liveTrick(), combo);
  hud.speed(skater.hSpeed * 3.6);
  hud.tick(dt);
  aimT -= dt;
  if (aimT <= 0) {
    aimT = 0.1;
    aimRay();
    const h = trace(_o, _dir, 120);
    hud.aimName(h.bot ? h.bot.name : '');
  }
  radarT -= dt;
  if (radarT <= 0) {
    radarT = 0.05;
    hud.drawRadar(skater.pos, cam.yaw, bots.list, bomb, false);
  }

  // audio beds
  setRoll(skater.state === 'ground' ? clamp(Math.abs(skater.speed) / 12, 0, 1) : 0, clamp(Math.abs(skater.speed) / 14, 0, 1));
  setGrind(skater.state === 'grind' ? clamp(skater.grind.speed / 8, 0.35, 1) : 0);
}

function updateCamera(dt) {
  const fp = (S.view === 'fp' || L.scoped) && S.alive;
  _cd.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  const crouch = skater.state === 'ground' ? (skater.crouchT / 0.45) * 0.25 : 0;
  const eyeY = skater.pos.y + (skater.state === 'bail' ? 0.6 : 1.55 - crouch);
  cam.y = Math.abs(cam.y - eyeY) > 3 ? eyeY : damp(cam.y, eyeY, 16, dt);
  _tg.set(skater.pos.x, cam.y, skater.pos.z);
  if (fp) {
    camera.position.copy(_tg);
    camera.position.y += 0.1;
  } else {
    const dist = 3.7 + Math.min(skater.hSpeed, 14) * 0.06;
    _cp.copy(_tg).addScaledVector(_cd, -dist);
    _cp.x += -Math.cos(cam.yaw) * 0.75;
    _cp.z += Math.sin(cam.yaw) * 0.75;
    _cp.y += 0.5;
    _rd.subVectors(_cp, _tg);
    const len = _rd.length();
    _rd.divideScalar(len);
    const hit = world.raycast(_tg, _rd, len + 0.3);
    if (hit) _cp.copy(_tg).addScaledVector(_rd, Math.max(0.3, hit.t - 0.3));
    camera.position.copy(_cp);
  }
  if (cam.shake > 0) {
    camera.position.x += rand(-1, 1) * cam.shake * 0.25;
    camera.position.y += rand(-1, 1) * cam.shake * 0.25;
    cam.shake = Math.max(0, cam.shake - dt * 1.8);
  }
  camera.lookAt(camera.position.x + _cd.x, camera.position.y + _cd.y, camera.position.z + _cd.z);
  const baseFov = camera.aspect < 1 ? Math.min(95, 72 / Math.sqrt(camera.aspect)) : 72;
  const fovT = L.scoped ? L.w.scope : baseFov + Math.min(skater.hSpeed, 16) * 0.7;
  cam.fov = L.scoped ? fovT : damp(cam.fov, fovT, 6, dt);
  if (Math.abs(camera.fov - cam.fov) > 0.01) {
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
  }
  skater.body.visible = !fp;
  if (skater.gun) skater.gun.visible = !fp;
  vm.visible = fp && !L.scoped && S.alive;
  if (vm.visible) {
    vm.kick = Math.max(0, (vm.kick || 0) - dt * 8);
    const bob = skater.state === 'ground' ? Math.sin(S.time * 9) * Math.min(1, skater.hSpeed / 8) * 0.008 : 0;
    vm.position.set(0.2, -0.19 + bob, -0.58 + vm.kick * 0.04);
    vm.rotation.x = vm.kick * 0.08;
  }
}

function idleCamera() {
  const t = S.time * 0.05;
  camera.position.set(Math.cos(t) * 62, 30, Math.sin(t) * 62 - 6);
  camera.lookAt(0, 0, -6);
  if (camera.fov !== 60) {
    camera.fov = 60;
    camera.updateProjectionMatrix();
  }
  vm.visible = false;
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  S.time += dt;
  if (S.running && !S.paused) step(dt);
  if (S.running) {
    skater.updateModel(dt, cam.yaw, cam.pitch);
    updateCamera(S.paused ? 0 : dt);
  } else {
    skater.updateModel(dt, skater.heading - PI / 2, 0);
    idleCamera();
  }
  fx.update(S.paused ? 0 : dt);
  const focus = S.running ? skater.pos : _v.set(0, 0, -6);
  sun.target.position.set(Math.round(focus.x), 0, Math.round(focus.z));
  sun.position.copy(sun.target.position).add(SUN_OFF);
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Handle for poking at the game from the console.
window.sk8 = { S, skater, bots, cam, L, world, combo, bomb, inp, keys, step, buy, fire: () => fire(L.w, L.item), hud, camPos: () => camera.position.clone(), renderer, inv, applySkins, matchOver };
