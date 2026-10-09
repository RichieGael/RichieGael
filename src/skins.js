import { store } from './util.js';

// Case odds follow the familiar weapon-case spread: blue is common, gold is very rare.
export const RARITY = {
  mil: { name: 'Mil-Spec', color: '#4b69ff', w: 79.92, rank: 0 },
  res: { name: 'Restricted', color: '#8847ff', w: 15.98, rank: 1 },
  cla: { name: 'Classified', color: '#d32ce6', w: 3.2, rank: 2 },
  cov: { name: 'Covert', color: '#eb4b4b', w: 0.64, rank: 3 },
  gold: { name: 'Rare Special', color: '#e4ae39', w: 0.26, rank: 4 },
};

export const ITEM_LABEL = {
  deck: 'Deck',
  p2000: 'P2000',
  deagle: 'Desert Eagle',
  ak47: 'AK-47',
  m4a1: 'M4A1',
  ssg08: 'SSG 08',
  awp: 'AWP',
  knife: '★ Knife',
};

export const SKINS = [
  { id: 'deck_sand', item: 'deck', name: 'Sandblasted', r: 'mil', pat: 'speckle', c: ['#c9b38a', '#8e7650', '#efe2c4'] },
  { id: 'p2k_grip', item: 'p2000', name: 'Grip Tape', r: 'mil', pat: 'speckle', c: ['#2a2a2a', '#5a5a5a', '#111'] },
  { id: 'ak_wave', item: 'ak47', name: 'Concrete Wave', r: 'mil', pat: 'stripes', c: ['#8a949b', '#4d5961'] },
  { id: 'm4_curb', item: 'm4a1', name: 'Curb Rash', r: 'mil', pat: 'camo', c: ['#6d7752', '#3c4430', '#a29a76'] },
  { id: 'ssg_wax', item: 'ssg08', name: 'Wax Ledge', r: 'mil', pat: 'fade', c: ['#d8c27a', '#86a35c'] },
  { id: 'deck_hex', item: 'deck', name: 'Hexbolt', r: 'res', pat: 'hex', c: ['#1d2b36', '#3fa7d6'] },
  { id: 'ak_tre', item: 'ak47', name: 'Tre Flip', r: 'res', pat: 'checker', c: ['#121212', '#f2f2f2'] },
  { id: 'de_bear', item: 'deagle', name: 'Bearings', r: 'res', pat: 'hex', c: ['#3b3b3b', '#c9c9c9'] },
  { id: 'awp_tail', item: 'awp', name: 'Tail Drag', r: 'res', pat: 'stripes', c: ['#e0662b', '#1c1c1c'] },
  { id: 'deck_neon', item: 'deck', name: 'Neon Bowl', r: 'cla', pat: 'fade', c: ['#ff3fa4', '#7a3cff', '#3ff2ff'] },
  { id: 'm4_night', item: 'm4a1', name: 'Night Session', r: 'cla', pat: 'stars', c: ['#0b1033', '#7fa6ff'] },
  { id: 'ak_meat', item: 'ak47', name: 'Hall of Meat', r: 'cla', pat: 'tiger', c: ['#c2263a', '#2a0b10'] },
  { id: 'awp_dragon', item: 'awp', name: 'Kickflip Dragon', r: 'cov', pat: 'flames', c: ['#1a0d05', '#ff7a1a', '#ffd23f'] },
  { id: 'deck_molten', item: 'deck', name: 'Molten Coping', r: 'cov', pat: 'flames', c: ['#2b0a00', '#ff4d00', '#ffb347'] },
  { id: 'knife_gold', item: 'knife', name: 'Gold Fade', r: 'gold', pat: 'fade', c: ['#ffd75e', '#ff9a3c', '#ff7ad9'] },
  { id: 'deck_gold', item: 'deck', name: 'Solid Gold', r: 'gold', pat: 'gold', c: ['#f7d774', '#a8741a'] },
];

export const skinById = Object.fromEntries(SKINS.map((s) => [s.id, s]));
export const fullName = (s) => `${ITEM_LABEL[s.item]} | ${s.name}`;

export function rollRarity() {
  let r = Math.random() * 100;
  for (const k of ['gold', 'cov', 'cla', 'res', 'mil']) {
    r -= RARITY[k].w;
    if (r < 0) return k;
  }
  return 'mil';
}

const WEAR_BANDS = [
  [0, 0.07, 0.12],
  [0.07, 0.15, 0.24],
  [0.15, 0.38, 0.33],
  [0.38, 0.45, 0.24],
  [0.45, 1, 0.07],
];
function rollWear() {
  let r = Math.random();
  for (const [a, b, p] of WEAR_BANDS) {
    if ((r -= p) < 0) return a + Math.random() * (b - a);
  }
  return 0.2;
}

export function rollSkin() {
  const r = rollRarity();
  const pool = SKINS.filter((s) => s.r === r);
  const s = pool[Math.floor(Math.random() * pool.length)];
  return { skin: s.id, wear: rollWear() };
}

export function wearName(f) {
  if (f < 0.07) return 'Factory New';
  if (f < 0.15) return 'Minimal Wear';
  if (f < 0.38) return 'Field-Tested';
  if (f < 0.45) return 'Well-Worn';
  return 'Battle-Scarred';
}
export const wearShort = (f) => wearName(f).split(/[ -]/).map((w) => w[0]).join('');

const KEY = 'sk8strike.inventory.v1';

export class Inventory {
  constructor() {
    const d = store.get(KEY, null) || { items: [], equipped: {}, cases: 1, uid: 1 };
    this.items = Array.isArray(d.items) ? d.items.filter((i) => skinById[i.skin]) : [];
    this.equipped = d.equipped || {};
    this.cases = Number.isFinite(d.cases) ? d.cases : 1;
    this.uid = d.uid || this.items.length + 1;
  }
  save() {
    store.set(KEY, { items: this.items, equipped: this.equipped, cases: this.cases, uid: this.uid });
  }
  add(roll) {
    const it = { uid: this.uid++, ...roll };
    this.items.push(it);
    this.save();
    return it;
  }
  addCase(n = 1) {
    this.cases += n;
    this.save();
  }
  toggleEquip(uid) {
    const it = this.items.find((i) => i.uid === uid);
    if (!it) return;
    const s = skinById[it.skin];
    if (this.equipped[s.item] === uid) delete this.equipped[s.item];
    else this.equipped[s.item] = uid;
    this.save();
  }
  isEquipped(uid) {
    return Object.values(this.equipped).includes(uid);
  }
  equippedFor(item) {
    const uid = this.equipped[item];
    const it = uid && this.items.find((i) => i.uid === uid);
    return it ? { skin: skinById[it.skin], wear: it.wear } : null;
  }
}
