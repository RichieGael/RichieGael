import * as THREE from 'three';

// All textures are painted on canvases at startup; no image files are loaded.
export function cv(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function rgbOf(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function grain(x, w, h, amt) {
  const img = x.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  x.putImageData(img, 0, 0);
}
export function toTex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// 512px = 4m of 1m pavers.
export function floorTex() {
  const S = 512;
  const c = cv(S);
  const x = c.getContext('2d');
  const n = 4;
  const k = S / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = (Math.random() - 0.5) * 16;
      x.fillStyle = `rgb(${214 + v},${192 + v},${152 + v})`;
      x.fillRect(i * k, j * k, k, k);
      const g = x.createRadialGradient(i * k + Math.random() * k, j * k + Math.random() * k, 2, i * k + k / 2, j * k + k / 2, k);
      g.addColorStop(0, 'rgba(140,110,70,0.14)');
      g.addColorStop(1, 'rgba(140,110,70,0)');
      x.fillStyle = g;
      x.fillRect(i * k, j * k, k, k);
    }
  }
  x.strokeStyle = 'rgba(122,98,64,0.55)';
  x.lineWidth = 3;
  for (let i = 0; i <= n; i++) {
    x.beginPath();
    x.moveTo(i * k, 0);
    x.lineTo(i * k, S);
    x.stroke();
    x.beginPath();
    x.moveTo(0, i * k);
    x.lineTo(S, i * k);
    x.stroke();
  }
  for (let i = 0; i < 900; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(90,70,40,.25)' : 'rgba(255,245,220,.25)';
    x.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  grain(x, S, S, 18);
  return toTex(c);
}

// Sandstone blocks in 0.5m courses.
export function wallTex(base = '#d2b98d') {
  const S = 512;
  const c = cv(S);
  const x = c.getContext('2d');
  x.fillStyle = '#a28962';
  x.fillRect(0, 0, S, S);
  const rowH = 64;
  const [R, G, B] = rgbOf(base);
  for (let r = 0; r < S / rowH; r++) {
    const m = 4 + (r % 2);
    const w = S / m;
    const off = Math.random() * S;
    for (let i = 0; i < m; i++) {
      const v = (Math.random() - 0.5) * 24;
      x.fillStyle = `rgb(${R + v},${G + v},${B + v * 0.8})`;
      const px = (off + i * w) % S;
      x.fillRect(px + 2, r * rowH + 2, w - 4, rowH - 4);
      if (px + w > S) x.fillRect(px - S + 2, r * rowH + 2, w - 4, rowH - 4);
    }
  }
  for (let i = 0; i < 500; i++) {
    x.fillStyle = Math.random() < 0.6 ? 'rgba(110,85,50,.3)' : 'rgba(255,240,210,.3)';
    x.fillRect(Math.random() * S, Math.random() * S, rnd(1, 4), rnd(1, 3));
  }
  grain(x, S, S, 26);
  return toTex(c);
}

export function crateTex() {
  const S = 256;
  const c = cv(S);
  const x = c.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const v = (Math.random() - 0.5) * 22;
    x.fillStyle = `rgb(${152 + v},${113 + v},${66 + v})`;
    x.fillRect(0, (i * S) / 6, S, S / 6);
    x.fillStyle = 'rgba(60,40,20,.5)';
    x.fillRect(0, (i * S) / 6, S, 2);
  }
  x.strokeStyle = 'rgba(70,45,20,.22)';
  for (let i = 0; i < 40; i++) {
    const y = Math.random() * S;
    x.lineWidth = rnd(0.5, 2);
    x.beginPath();
    x.moveTo(0, y);
    x.bezierCurveTo(S * 0.3, y + rnd(-4, 4), S * 0.6, y + rnd(-4, 4), S, y + rnd(-3, 3));
    x.stroke();
  }
  x.fillStyle = '#6a4a26';
  x.save();
  x.translate(S / 2, S / 2);
  x.rotate(-Math.PI / 4);
  x.fillRect(-S * 0.7, -14, S * 1.4, 28);
  x.restore();
  const b = 26;
  x.fillStyle = '#704f2a';
  x.fillRect(0, 0, S, b);
  x.fillRect(0, S - b, S, b);
  x.fillRect(0, 0, b, S);
  x.fillRect(S - b, 0, b, S);
  x.strokeStyle = 'rgba(40,25,10,.6)';
  x.lineWidth = 2;
  x.strokeRect(b, b, S - 2 * b, S - 2 * b);
  x.fillStyle = '#2f2f2f';
  for (const [px, py] of [[13, 13], [S - 13, 13], [13, S - 13], [S - 13, S - 13], [S / 2, 13], [S / 2, S - 13]]) {
    x.beginPath();
    x.arc(px, py, 3, 0, Math.PI * 2);
    x.fill();
  }
  grain(x, S, S, 20);
  return toTex(c, false);
}

// Smooth skatepark concrete with 2m expansion joints.
export function concreteTex() {
  const S = 512;
  const c = cv(S);
  const x = c.getContext('2d');
  x.fillStyle = '#bdb5a6';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 3000; i++) {
    const v = Math.random() < 0.5 ? 'rgba(80,75,65,.18)' : 'rgba(255,255,250,.2)';
    x.fillStyle = v;
    x.fillRect(Math.random() * S, Math.random() * S, rnd(1, 2.5), rnd(1, 2.5));
  }
  x.strokeStyle = 'rgba(90,82,70,.45)';
  x.lineWidth = 2;
  for (const p of [0, S / 2]) {
    x.beginPath();
    x.moveTo(p, 0);
    x.lineTo(p, S);
    x.stroke();
    x.beginPath();
    x.moveTo(0, p);
    x.lineTo(S, p);
    x.stroke();
  }
  x.strokeStyle = 'rgba(70,64,55,.35)';
  x.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    let px = Math.random() * S;
    let py = Math.random() * S;
    x.beginPath();
    x.moveTo(px, py);
    for (let i = 0; i < 8; i++) {
      px += rnd(-18, 18);
      py += rnd(4, 16);
      x.lineTo(px, py);
    }
    x.stroke();
  }
  grain(x, S, S, 14);
  return toTex(c);
}

// Plywood ramp skin: 1.22m sheets with screw lines.
export function plyTex() {
  const S = 512;
  const c = cv(S);
  const x = c.getContext('2d');
  x.fillStyle = '#c9a368';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) {
    x.strokeStyle = `rgba(130,90,40,${rnd(0.05, 0.16)})`;
    x.lineWidth = rnd(1, 4);
    const y = Math.random() * S;
    x.beginPath();
    x.moveTo(0, y);
    x.bezierCurveTo(S * 0.3, y + rnd(-8, 8), S * 0.7, y + rnd(-8, 8), S, y);
    x.stroke();
  }
  const sheet = 156;
  x.strokeStyle = 'rgba(80,55,25,.55)';
  x.lineWidth = 2;
  for (let p = 0; p < S; p += sheet) {
    x.beginPath();
    x.moveTo(0, p);
    x.lineTo(S, p);
    x.stroke();
    x.fillStyle = 'rgba(60,50,40,.6)';
    for (let q = 10; q < S; q += 32) {
      x.fillRect(q, p + 6, 2, 2);
      x.fillRect(q, p - 8, 2, 2);
    }
  }
  grain(x, S, S, 16);
  return toTex(c);
}

// Painted letters and graffiti on transparent canvases.
export function decalTex(text, o = {}) {
  const W = o.w || 1024;
  const H = o.h || 512;
  const c = cv(W, H);
  const x = c.getContext('2d');
  x.translate(W / 2, H / 2);
  x.rotate(o.rot || 0);
  const size = o.size || 220;
  x.font = `${o.weight || ''} ${size}px ${o.font || 'Impact, Haettenschweiler, sans-serif'}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  if (o.box) {
    const tw = x.measureText(text).width;
    x.fillStyle = o.box;
    x.fillRect(-tw / 2 - 40, -size * 0.62, tw + 80, size * 1.2);
  }
  if (o.stroke) {
    x.lineWidth = o.lineWidth || 18;
    x.strokeStyle = o.stroke;
    x.lineJoin = 'round';
    x.strokeText(text, 0, 0);
  }
  x.fillStyle = o.color || '#fff';
  x.fillText(text, 0, 0);
  if (o.drip) {
    const tw = x.measureText(text).width;
    x.fillStyle = o.color || '#fff';
    for (let i = 0; i < 14; i++) {
      const dx = rnd(-tw / 2, tw / 2);
      const len = rnd(20, 110);
      const w = rnd(3, 7);
      x.fillRect(dx, size * 0.28, w, len);
      x.beginPath();
      x.arc(dx + w / 2, size * 0.28 + len, w * 0.8, 0, Math.PI * 2);
      x.fill();
    }
  }
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1600; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.55})`;
    x.fillRect(Math.random() * W - W / 2, Math.random() * H - H / 2, 3, 3);
  }
  return toTex(c, false);
}

// Soft radial glow used for muzzle flashes and explosions.
export function glowTex(inner = 'rgba(255,240,200,1)', mid = 'rgba(255,170,60,0.6)') {
  const S = 128;
  const c = cv(S);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.3, mid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return toTex(c, false);
}

function drawPattern(x, w, h, pat, c) {
  const c0 = c[0];
  const c1 = c[1] || c0;
  const c2 = c[2] || c1;
  x.fillStyle = c0;
  x.fillRect(0, 0, w, h);
  switch (pat) {
    case 'stock': {
      for (let i = 0; i < 40; i++) {
        x.strokeStyle = `rgba(120,80,30,${rnd(0.05, 0.15)})`;
        x.lineWidth = rnd(1, 3);
        const xx = Math.random() * w;
        x.beginPath();
        x.moveTo(xx, 0);
        x.bezierCurveTo(xx + rnd(-10, 10), h * 0.3, xx + rnd(-10, 10), h * 0.6, xx + rnd(-8, 8), h);
        x.stroke();
      }
      x.save();
      x.translate(w / 2, h / 2);
      if (h > w) x.rotate(-Math.PI / 2);
      x.fillStyle = '#1b1b1b';
      x.font = `bold ${Math.round(Math.min(w, h) * 0.34)}px Teko, Impact, sans-serif`;
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('SK8 STRIKE', 0, 0);
      x.restore();
      break;
    }
    case 'speckle':
      for (let i = 0; i < (w * h) / 30; i++) {
        x.fillStyle = Math.random() < 0.5 ? c1 : c2;
        const s = rnd(1, 3.5);
        x.fillRect(Math.random() * w, Math.random() * h, s, s);
      }
      break;
    case 'stripes': {
      x.fillStyle = c1;
      const sw = Math.max(w, h) / 12;
      for (let i = -h; i < w + h; i += sw * 2) {
        x.beginPath();
        x.moveTo(i, 0);
        x.lineTo(i + sw, 0);
        x.lineTo(i + sw - h, h);
        x.lineTo(i - h, h);
        x.closePath();
        x.fill();
      }
      break;
    }
    case 'camo':
      for (let i = 0; i < 70; i++) {
        x.fillStyle = i % 2 ? c1 : c2;
        x.beginPath();
        x.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * w * 0.2, 6 + Math.random() * w * 0.1, Math.random() * Math.PI, 0, Math.PI * 2);
        x.fill();
      }
      break;
    case 'fade': {
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, c0);
      if (c.length > 2) {
        g.addColorStop(0.5, c1);
        g.addColorStop(1, c2);
      } else g.addColorStop(1, c1);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      break;
    }
    case 'hex': {
      x.strokeStyle = c1;
      x.lineWidth = 3;
      const r = 14;
      const hh = r * Math.sqrt(3);
      for (let row = -1; row < h / hh + 1; row++) {
        for (let col = -1; col < w / (r * 1.5) + 1; col++) {
          const cx = col * r * 1.5;
          const cy = row * hh + (col % 2 ? hh / 2 : 0);
          x.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k * Math.PI) / 3;
            x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
          }
          x.closePath();
          x.stroke();
        }
      }
      break;
    }
    case 'checker': {
      const s = Math.max(16, Math.min(w, h) / 6);
      x.fillStyle = c1;
      for (let i = 0; i < w / s; i++) for (let j = 0; j < h / s; j++) if ((i + j) % 2) x.fillRect(i * s, j * s, s, s);
      break;
    }
    case 'stars': {
      const g = x.createRadialGradient(w * 0.3, h * 0.3, 4, w / 2, h / 2, Math.max(w, h));
      g.addColorStop(0, c1);
      g.addColorStop(0.35, c0);
      g.addColorStop(1, '#000');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < (w * h) / 180; i++) {
        x.fillStyle = `rgba(255,255,255,${Math.random()})`;
        x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
      break;
    }
    case 'tiger': {
      x.fillStyle = c1;
      for (let i = 0; i < 22; i++) {
        const y = Math.random() * h;
        x.beginPath();
        x.moveTo(-10, y);
        x.bezierCurveTo(w * 0.3, y + rnd(-20, 20), w * 0.6, y + rnd(-20, 20), w + 10, y + rnd(0, 20));
        x.lineTo(w + 10, y + rnd(6, 16));
        x.bezierCurveTo(w * 0.6, y + 10, w * 0.3, y + 14, -10, y + 8);
        x.fill();
      }
      break;
    }
    case 'flames': {
      for (let i = 0; i < 18; i++) {
        const bx = Math.random() * w;
        const fh = h * rnd(0.3, 0.9);
        const fw = w * rnd(0.12, 0.28);
        const g = x.createLinearGradient(0, h, 0, h - fh);
        g.addColorStop(0, c2);
        g.addColorStop(0.5, c1);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(bx - fw, h);
        x.quadraticCurveTo(bx - fw * 0.8, h - fh * 0.6, bx + rnd(-fw, fw) * 0.5, h - fh);
        x.quadraticCurveTo(bx + fw * 0.6, h - fh * 0.5, bx + fw, h);
        x.fill();
      }
      break;
    }
    case 'gold': {
      const g = x.createLinearGradient(0, 0, w, h);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, i % 2 ? c1 : c0);
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(255,255,255,0.28)';
      for (let i = 0; i < 6; i++) x.fillRect(0, Math.random() * h, w, rnd(2, 6));
      break;
    }
    default:
      break;
  }
}

// Skin artwork for decks and guns. Wear adds scratches, like a skin's float value.
export function skinCanvas(skin, wear = 0.1, w = 256, h = 256) {
  const c = cv(w, h);
  const x = c.getContext('2d');
  drawPattern(x, w, h, skin ? skin.pat : 'stock', skin ? skin.c : ['#d9b77e', '#b48a52']);
  const n = Math.floor(wear * 320);
  for (let i = 0; i < n; i++) {
    x.strokeStyle = `rgba(${Math.random() < 0.6 ? '225,225,225' : '30,30,30'},${rnd(0.15, 0.5)})`;
    x.lineWidth = rnd(1, 2.5);
    const sx = Math.random() * w;
    const sy = Math.random() * h;
    const a = Math.random() * Math.PI;
    const L = rnd(4, 26);
    x.beginPath();
    x.moveTo(sx, sy);
    x.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L);
    x.stroke();
  }
  return c;
}

const thumbCache = new Map();
export function skinThumb(skin, wear = 0.05) {
  const key = (skin ? skin.id : 'stock') + ':' + wear.toFixed(2);
  if (!thumbCache.has(key)) thumbCache.set(key, skinCanvas(skin, wear, 160, 90).toDataURL());
  return thumbCache.get(key);
}

// Griptape swatch for the menu panel background.
export function gripDataURL() {
  const S = 160;
  const c = cv(S);
  const x = c.getContext('2d');
  x.fillStyle = '#16170f';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 4200; i++) {
    const v = Math.random();
    x.fillStyle = v < 0.5 ? 'rgba(255,255,240,0.05)' : 'rgba(0,0,0,0.35)';
    x.fillRect(Math.random() * S, Math.random() * S, 1.4, 1.4);
  }
  return c.toDataURL();
}
