export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrap = (a) => {
  a = (a + PI) % TAU;
  if (a < 0) a += TAU;
  return a - PI;
};
export const angDiff = (a, b) => wrap(a - b);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const dampAng = (a, b, k, dt) => a + angDiff(b, a) * (1 - Math.exp(-k * dt));
export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export const fmtTime = (s) => {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

// localStorage can throw or be empty (private windows, previews); the game works without it.
export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      /* storage unavailable */
    }
  },
};
