// Every sound is synthesized with WebAudio, so the game ships with no audio files.
let ctx = null;
let master = null;
let noise = null;
let roll = null;
let grind = null;
let vol = 0.6;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch (e) {
    return;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : vol;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  master.connect(comp);
  comp.connect(ctx.destination);
  const len = ctx.sampleRate * 2;
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  roll = loop('lowpass', 380, 0.8);
  grind = loop('bandpass', 2700, 7);
}

function loop(type, f, q) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(fl);
  fl.connect(g);
  g.connect(master);
  src.start();
  return { g, fl };
}

export function setVolume(v) {
  vol = v;
  if (master) master.gain.value = muted ? 0 : vol;
}
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : vol;
  return muted;
}
export function setRoll(level, pitch) {
  if (!roll) return;
  roll.g.gain.setTargetAtTime(level * 0.32, ctx.currentTime, 0.05);
  roll.fl.frequency.setTargetAtTime(220 + pitch * 520, ctx.currentTime, 0.1);
}
export function setGrind(level) {
  if (!grind) return;
  grind.g.gain.setTargetAtTime(level * 0.2, ctx.currentTime, 0.03);
}

function burst({ dur = 0.2, f = 1000, f2 = 0, type = 'lowpass', q = 1, gain = 1, delay = 0, attack = 0.002 }) {
  if (!ctx || gain < 0.01) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl);
  fl.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

function tone({ f = 440, f2 = 0, dur = 0.15, type = 'sine', gain = 0.3, delay = 0, attack = 0.004 }) {
  if (!ctx || gain < 0.01) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const GUNS = {
  pistol: (v) => {
    burst({ dur: 0.15, f: 3200, f2: 500, gain: 0.55 * v });
    tone({ f: 170, f2: 60, dur: 0.09, gain: 0.35 * v });
  },
  deagle: (v) => {
    burst({ dur: 0.32, f: 2200, f2: 260, gain: 0.85 * v });
    tone({ f: 110, f2: 40, dur: 0.2, gain: 0.55 * v });
  },
  rifle: (v) => {
    burst({ dur: 0.2, f: 2600, f2: 380, gain: 0.75 * v });
    burst({ dur: 0.04, f: 5200, type: 'highpass', gain: 0.25 * v });
    tone({ f: 125, f2: 45, dur: 0.13, gain: 0.45 * v });
  },
  rifleS: (v) => {
    burst({ dur: 0.11, f: 1700, f2: 600, type: 'bandpass', q: 1.4, gain: 0.55 * v });
    tone({ f: 200, f2: 90, dur: 0.06, gain: 0.2 * v });
  },
  sniper: (v) => {
    burst({ dur: 0.75, f: 1900, f2: 140, gain: 1 * v });
    tone({ f: 85, f2: 28, dur: 0.45, gain: 0.8 * v });
    burst({ dur: 0.6, f: 700, f2: 200, gain: 0.22 * v, delay: 0.22 });
  },
  scout: (v) => {
    burst({ dur: 0.4, f: 2700, f2: 300, gain: 0.8 * v });
    tone({ f: 140, f2: 50, dur: 0.2, gain: 0.5 * v });
  },
};

export const sfx = {
  pop() {
    burst({ dur: 0.05, f: 2600, type: 'highpass', gain: 0.45 });
    tone({ f: 190, f2: 70, dur: 0.08, gain: 0.35 });
  },
  push() {
    burst({ dur: 0.18, f: 500, f2: 200, gain: 0.18 });
  },
  land(h = 0.5) {
    burst({ dur: 0.12, f: 700, f2: 150, gain: 0.3 + h * 0.45 });
    tone({ f: 120, f2: 45, dur: 0.12, gain: 0.25 + h * 0.3 });
  },
  flick() {
    burst({ dur: 0.08, f: 3800, f2: 1800, type: 'bandpass', q: 2, gain: 0.18 });
  },
  shoot(kind, v = 1) {
    if (v < 0.03 || !GUNS[kind]) return;
    GUNS[kind](v);
  },
  knife() {
    burst({ dur: 0.18, f: 3400, f2: 900, type: 'bandpass', q: 3, gain: 0.3 });
  },
  dry() {
    tone({ f: 1300, dur: 0.03, type: 'square', gain: 0.08 });
  },
  reload() {
    burst({ dur: 0.05, f: 2200, type: 'bandpass', q: 3, gain: 0.25 });
    burst({ dur: 0.06, f: 1600, type: 'bandpass', q: 3, gain: 0.3, delay: 0.55 });
    burst({ dur: 0.05, f: 2600, type: 'bandpass', q: 3, gain: 0.3, delay: 1.1 });
  },
  zoom() {
    tone({ f: 2400, dur: 0.025, type: 'square', gain: 0.05 });
  },
  hit() {
    tone({ f: 1700, dur: 0.05, type: 'triangle', gain: 0.18 });
  },
  headshot() {
    tone({ f: 2700, f2: 2400, dur: 0.14, gain: 0.3 });
    burst({ dur: 0.05, f: 6000, type: 'highpass', gain: 0.2 });
  },
  hurt() {
    burst({ dur: 0.2, f: 420, f2: 120, gain: 0.5 });
  },
  bail() {
    burst({ dur: 0.4, f: 320, f2: 80, gain: 0.7 });
    tone({ f: 95, f2: 40, dur: 0.3, gain: 0.45 });
    burst({ dur: 0.25, f: 2500, type: 'highpass', gain: 0.22, delay: 0.12 });
  },
  beep() {
    tone({ f: 1480, dur: 0.09, gain: 0.22 });
  },
  explode() {
    burst({ dur: 2.4, f: 900, f2: 60, gain: 1 });
    tone({ f: 62, f2: 24, dur: 1.3, gain: 0.9 });
  },
  buy() {
    tone({ f: 880, dur: 0.05, type: 'triangle', gain: 0.15 });
    tone({ f: 1320, dur: 0.07, type: 'triangle', gain: 0.15, delay: 0.05 });
  },
  cash() {
    tone({ f: 1568, dur: 0.06, type: 'triangle', gain: 0.12 });
    tone({ f: 2093, dur: 0.09, type: 'triangle', gain: 0.12, delay: 0.06 });
  },
  tick() {
    tone({ f: 950, dur: 0.015, type: 'square', gain: 0.05 });
  },
  reveal(rank) {
    const base = [523, 587, 659, 784, 880][rank] || 523;
    [1, 1.25, 1.5, 2].forEach((m, i) => tone({ f: base * m, dur: 0.35, type: 'triangle', gain: 0.14, delay: i * 0.07 }));
  },
  roundStart() {
    [523, 659, 784].forEach((f, i) => tone({ f, dur: 0.18, type: 'triangle', gain: 0.12, delay: i * 0.1 }));
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ f, dur: 0.5, type: 'triangle', gain: 0.12, delay: i * 0.09 }));
  },
  lose() {
    [392, 330, 262].forEach((f, i) => tone({ f, dur: 0.5, type: 'triangle', gain: 0.12, delay: i * 0.12 }));
  },
  trick() {
    tone({ f: 720, f2: 1440, dur: 0.1, type: 'triangle', gain: 0.07 });
  },
  defuse() {
    tone({ f: 640, dur: 0.04, type: 'square', gain: 0.05 });
  },
  plant() {
    [1200, 1200, 1600].forEach((f, i) => tone({ f, dur: 0.08, type: 'square', gain: 0.07, delay: i * 0.12 }));
  },
};
