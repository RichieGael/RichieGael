// Spread values are radians. "air" is added while airborne, except near the apex of a jump.
export const WEAPONS = {
  knife: { name: 'Knife', slot: 'knife', melee: true, dmg: 40, heavy: 65, rate: 0.42, range: 2.3, reward: 1500, sound: 'knife' },
  p2000: { name: 'P2000', slot: 'secondary', dmg: 35, hs: 4, rate: 0.17, mag: 13, reserve: 52, reload: 2.2, spread: 0.006, move: 0.0012, air: 0.06, recoil: 0.012, pen: 0.505, reward: 300, price: 200, sound: 'pistol' },
  deagle: { name: 'Desert Eagle', slot: 'secondary', dmg: 63, hs: 4, rate: 0.25, mag: 7, reserve: 35, reload: 2.2, spread: 0.005, move: 0.002, air: 0.09, recoil: 0.045, pen: 0.932, reward: 300, price: 700, sound: 'deagle' },
  ak47: { name: 'AK-47', slot: 'primary', dmg: 36, hs: 4, rate: 0.1, mag: 30, reserve: 90, reload: 2.5, spread: 0.004, move: 0.0015, air: 0.07, recoil: 0.014, pen: 0.775, auto: true, reward: 300, price: 2700, sound: 'rifle' },
  m4a1: { name: 'M4A1', slot: 'primary', dmg: 33, hs: 4, rate: 0.09, mag: 25, reserve: 75, reload: 3.1, spread: 0.0035, move: 0.0013, air: 0.065, recoil: 0.011, pen: 0.7, auto: true, reward: 300, price: 2900, sound: 'rifleS' },
  ssg08: { name: 'SSG 08', slot: 'primary', dmg: 88, hs: 2.5, rate: 1.25, mag: 10, reserve: 90, reload: 3.7, spread: 0.0008, noscope: 0.035, move: 0.0006, air: 0.012, recoil: 0.03, pen: 0.85, scope: 40, reward: 300, price: 1700, sound: 'scout' },
  awp: { name: 'AWP', slot: 'primary', dmg: 115, hs: 4, rate: 1.46, mag: 5, reserve: 30, reload: 3.6, spread: 0.0006, noscope: 0.07, move: 0.003, air: 0.1, recoil: 0.05, pen: 0.975, scope: 25, reward: 100, price: 4750, sound: 'sniper' },
  he: { name: 'HE Grenade', slot: 'he', grenade: true, rate: 0.9, reward: 300, price: 300 },
};

export const SHOP = [
  { cat: 'Pistols', items: ['p2000', 'deagle'] },
  { cat: 'Rifles', items: ['ak47', 'm4a1'] },
  { cat: 'Snipers', items: ['ssg08', 'awp'] },
  { cat: 'Gear', items: ['vest', 'vesthelm', 'kit', 'he'] },
];
export const GEAR = {
  vest: { name: 'Kevlar Vest', price: 650 },
  vesthelm: { name: 'Kevlar + Helmet', price: 1000 },
  kit: { name: 'Defuse Kit', price: 400 },
};

const SLOT_ORDER = ['primary', 'secondary', 'knife', 'he'];

export class Loadout {
  constructor() {
    this.reset();
  }
  reset() {
    this.primary = null;
    this.secondary = this.make('p2000');
    this.he = 0;
    this.cur = 'secondary';
    this.prev = 'knife';
    this.cd = 0;
    this.deploy = 0.3;
    this.reloadT = 0;
    this.recoil = 0;
    this.shots = 0;
    this.scoped = false;
    this.rescope = 0;
  }
  make(id) {
    const w = WEAPONS[id];
    return { id, mag: w.mag ?? 0, reserve: w.reserve ?? 0 };
  }
  get id() {
    if (this.cur === 'primary') return this.primary?.id || 'knife';
    if (this.cur === 'secondary') return this.secondary?.id || 'knife';
    if (this.cur === 'he') return 'he';
    return 'knife';
  }
  get w() {
    return WEAPONS[this.id];
  }
  get item() {
    return this.cur === 'primary' ? this.primary : this.cur === 'secondary' ? this.secondary : null;
  }
  has(slot) {
    if (slot === 'primary') return !!this.primary;
    if (slot === 'secondary') return !!this.secondary;
    if (slot === 'he') return this.he > 0;
    return slot === 'knife';
  }
  switchTo(slot) {
    if (!this.has(slot) || slot === this.cur) return false;
    this.prev = this.cur;
    this.cur = slot;
    this.deploy = 0.35;
    this.reloadT = 0;
    this.scoped = false;
    this.rescope = 0;
    return true;
  }
  cycle(dir) {
    const owned = SLOT_ORDER.filter((s) => this.has(s));
    const i = owned.indexOf(this.cur);
    return this.switchTo(owned[(i + dir + owned.length) % owned.length]);
  }
  give(id) {
    const w = WEAPONS[id];
    if (w.grenade) {
      this.he = Math.min(1, this.he + 1);
      return;
    }
    this[w.slot] = this.make(id);
    this.prev = this.cur;
    this.cur = w.slot;
    this.deploy = 0.4;
    this.reloadT = 0;
    this.scoped = false;
  }
  startReload() {
    const it = this.item;
    const w = this.w;
    if (!it || w.melee || w.grenade || this.reloadT > 0 || it.mag >= w.mag || it.reserve <= 0) return false;
    this.reloadT = w.reload;
    this.scoped = false;
    return true;
  }
  update(dt) {
    this.cd -= dt;
    this.deploy -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 0.09);
    if (this.cd < -0.25) this.shots = 0;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        const it = this.item;
        const need = this.w.mag - it.mag;
        const take = Math.min(need, it.reserve);
        it.mag += take;
        it.reserve -= take;
      }
    }
  }
  canFire() {
    return this.cd <= 0 && this.deploy <= 0 && this.reloadT <= 0;
  }
}
