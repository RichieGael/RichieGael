import { BOUNDS, SITES } from './world.js';
import { fmtMoney, fmtInt, fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const ICON = {
  hs: '<svg viewBox="0 0 16 16" aria-label="headshot"><circle cx="8" cy="8" r="5"/><path d="M8 1v4M8 11v4M1 8h4M11 8h4"/></svg>',
};
const MOD_LABEL = { air: 'AIR', noscope: 'NOSCOPE', '360': '360', flip: 'FLIP', grind: 'GRIND', knife: '', he: '' };

export class HUD {
  constructor(world) {
    this.world = world;
    this.el = $('hud');
    this.radar = $('radar');
    this.rctx = this.radar.getContext('2d');
    this.radarBg = this.drawRadarBg();
    this.lastTrickKey = '';
    this.trickHold = 0;
  }

  show(v) {
    this.el.hidden = !v;
  }

  // Map coordinates to the 344px radar canvas, north (-z) up.
  rx(x) {
    return ((x - BOUNDS.x0) / (BOUNDS.x1 - BOUNDS.x0)) * 320 + 12;
  }
  rz(z) {
    return ((z - BOUNDS.z0) / (BOUNDS.z1 - BOUNDS.z0)) * 320 + 12;
  }

  drawRadarBg() {
    const c = document.createElement('canvas');
    c.width = c.height = 344;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(214,190,145,0.22)';
    x.fillRect(this.rx(BOUNDS.x0), this.rz(BOUNDS.z0), 320, 320);
    const cols = [...this.world.cols].sort((a, b) => a.top - b.top);
    for (const col of cols) {
      if (col.decor) continue;
      const tall = col.top > 3.5;
      x.fillStyle = tall ? 'rgba(18,18,14,0.92)' : col.kind === 'ramp' ? 'rgba(232,214,176,0.55)' : 'rgba(180,160,120,0.7)';
      const x0 = Math.max(this.rx(col.x0), 0);
      const z0 = Math.max(this.rz(col.z0), 0);
      const x1 = Math.min(this.rx(col.x1), 344);
      const z1 = Math.min(this.rz(col.z1), 344);
      x.fillRect(x0, z0, x1 - x0, z1 - z0);
    }
    for (const [k, s] of Object.entries(SITES)) {
      x.strokeStyle = 'rgba(255,90,70,0.8)';
      x.lineWidth = 2;
      x.setLineDash([5, 4]);
      x.strokeRect(this.rx(s.x0), this.rz(s.z0), this.rx(s.x1) - this.rx(s.x0), this.rz(s.z1) - this.rz(s.z0));
      x.setLineDash([]);
      x.fillStyle = 'rgba(255,255,255,0.9)';
      x.font = 'bold 30px Teko, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(k, this.rx(s.cx), this.rz(s.cz));
    }
    return c;
  }

  drawRadar(player, yaw, bots, bomb, showAll) {
    const x = this.rctx;
    x.clearRect(0, 0, 344, 344);
    x.drawImage(this.radarBg, 0, 0);
    for (const b of bots) {
      if (!b.alive) {
        x.strokeStyle = 'rgba(231,178,76,0.6)';
        x.lineWidth = 2;
        const px = this.rx(b.pos.x);
        const pz = this.rz(b.pos.z);
        x.beginPath();
        x.moveTo(px - 4, pz - 4);
        x.lineTo(px + 4, pz + 4);
        x.moveTo(px + 4, pz - 4);
        x.lineTo(px - 4, pz + 4);
        x.stroke();
        continue;
      }
      if (!showAll && !b.canSee && !b.dummy) continue;
      x.fillStyle = b.dummy ? '#e7b24c' : '#ff5a46';
      x.beginPath();
      x.arc(this.rx(b.pos.x), this.rz(b.pos.z), 5, 0, Math.PI * 2);
      x.fill();
    }
    if (bomb && bomb.state !== 'carried' && bomb.state !== 'none') {
      x.fillStyle = bomb.state === 'planted' && Math.floor(performance.now() / 300) % 2 ? '#ff2a1a' : '#ffb347';
      x.fillRect(this.rx(bomb.pos.x) - 5, this.rz(bomb.pos.z) - 4, 10, 8);
    }
    const px = this.rx(player.x);
    const pz = this.rz(player.z);
    x.save();
    x.translate(px, pz);
    x.rotate(-yaw + Math.PI);
    x.fillStyle = '#82b4e6';
    x.strokeStyle = '#0f100d';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, -9);
    x.lineTo(7, 7);
    x.lineTo(0, 3);
    x.lineTo(-7, 7);
    x.closePath();
    x.stroke();
    x.fill();
    x.restore();
  }

  vitals(hp, armor, helmet, kit) {
    $('hp').textContent = Math.max(0, Math.ceil(hp));
    $('armor').textContent = Math.ceil(armor);
    $('hpBox').classList.toggle('low', hp <= 25);
    $('kit').textContent = (helmet && armor > 0 ? 'HELMET ' : '') + (kit ? 'KIT' : '');
  }

  money(m) {
    $('money').textContent = fmtMoney(m);
  }

  popMoney(delta, why = '') {
    const d = document.createElement('div');
    d.textContent = (delta >= 0 ? '+' : '−') + fmtMoney(Math.abs(delta)) + (why ? '  ' + why : '');
    if (delta < 0) d.className = 'neg';
    const box = $('moneyPop');
    box.appendChild(d);
    setTimeout(() => d.remove(), 1700);
  }

  ammo(name, mag, reserve, slots, cur, reloading) {
    const a = $('ammo');
    if (mag === null) {
      $('mag').textContent = name;
      $('reserve').textContent = '';
      a.classList.remove('empty');
    } else {
      $('mag').textContent = reloading ? '…' : mag;
      $('reserve').textContent = '/ ' + reserve;
      a.classList.toggle('empty', mag === 0);
    }
    const html = slots.map((s) => `<div class="${s.slot === cur ? 'on' : ''}"><b>${s.key}</b>${s.name}</div>`).join('');
    if (html !== this.slotsHtml) {
      $('slots').innerHTML = html;
      this.slotsHtml = html;
    }
  }

  clock(sec, red, label) {
    const t = $('timer');
    t.textContent = sec === null ? '∞' : fmtTime(sec);
    t.classList.toggle('red', !!red);
    $('roundLbl').textContent = label;
  }

  score(ct, t) {
    $('scoreCT').textContent = ct;
    $('scoreT').textContent = t;
  }

  alive(n, total) {
    const html = Array.from({ length: total }, (_, i) => `<i class="${i < n ? '' : 'dead'}"></i>`).join('');
    if (html !== this.aliveHtml) {
      $('alive').innerHTML = html;
      this.aliveHtml = html;
    }
  }

  bombTimer(t) {
    const el = $('bombTimer');
    el.hidden = t === null;
    if (t !== null) el.textContent = 'BOMB ' + fmtTime(t);
  }

  kill({ killer, kTeam, victim, vTeam, weapon, mods = [], head, mine }) {
    const feed = $('killfeed');
    const d = document.createElement('div');
    d.className = 'kf' + (mine ? ' mine' : '');
    const modHtml = mods.filter((m) => MOD_LABEL[m]).map((m) => `<span>${MOD_LABEL[m]}</span>`).join('');
    d.innerHTML =
      (killer ? `<span class="${kTeam}">${killer}</span>` : '') +
      (modHtml ? `<span class="m">${modHtml}</span>` : '') +
      `<span class="w">${weapon}</span>` +
      (head ? ICON.hs : '') +
      `<span class="${vTeam}">${victim}</span>`;
    feed.prepend(d);
    while (feed.children.length > 5) feed.lastChild.remove();
    setTimeout(() => d.remove(), 7000);
  }

  // Live trick line (while in the air or grinding) plus the running combo.
  trick(live, combo) {
    const name = $('trickName');
    if (live) {
      name.textContent = live;
      name.className = '';
      this.trickHold = 0;
    } else if (this.trickHold <= 0 && !combo.active) {
      name.textContent = '';
    }
    if (combo.active) {
      $('trickScore').innerHTML = `${fmtInt(combo.pts)} <b>× ${combo.mult}</b>`;
      $('trickList').textContent = combo.names.slice(-5).join(' + ');
    } else if (this.trickHold <= 0) {
      $('trickScore').textContent = '';
      $('trickList').textContent = '';
    }
  }

  trickLanded(name, cls = 'landed') {
    const el = $('trickName');
    el.textContent = name;
    el.className = cls;
    this.trickHold = 1.4;
  }

  comboResult(text, sub) {
    $('trickScore').innerHTML = text;
    $('trickList').textContent = sub;
    this.trickHold = 1.8;
  }

  tick(dt) {
    if (this.trickHold > 0) this.trickHold -= dt;
    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) $('hitmark').style.opacity = 0;
    }
  }

  banner(text, sub = '', cls = '') {
    const b = $('banner');
    b.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'b ' + cls;
    t.textContent = text;
    b.appendChild(t);
    if (sub) {
      const s = document.createElement('div');
      s.className = 's';
      s.textContent = sub;
      b.appendChild(s);
    }
  }

  roundBanner(title, sub, cls) {
    const el = $('roundBanner');
    if (!title) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.querySelector('b').textContent = title;
    el.querySelector('b').className = cls || '';
    el.querySelector('span').textContent = sub || '';
  }

  hint(text) {
    if (text !== this.hintText) {
      $('hint').textContent = text || '';
      this.hintText = text;
    }
  }

  defuse(p) {
    const el = $('defuse');
    el.hidden = p === null;
    if (p !== null) el.firstElementChild.style.width = Math.round(p * 100) + '%';
  }

  crosshair(spreadPx, visible) {
    const x = $('xhair');
    x.style.display = visible ? '' : 'none';
    x.style.setProperty('--gap', Math.round(4 + spreadPx) + 'px');
  }

  scope(on) {
    $('scope').hidden = !on;
  }

  aimName(name) {
    if (name !== this.aimText) {
      $('aimName').textContent = name || '';
      this.aimText = name;
    }
  }

  hitmark(head) {
    const h = $('hitmark');
    h.className = head ? 'head' : '';
    h.style.opacity = 1;
    this.hitT = 0.15;
  }

  damageDir(angle) {
    const box = $('dmg');
    const i = document.createElement('i');
    i.style.transform = `rotate(${angle}rad)`;
    box.appendChild(i);
    setTimeout(() => i.remove(), 950);
    const f = $('flash');
    f.style.background = 'rgba(255,40,20,0.18)';
    setTimeout(() => (f.style.background = 'rgba(255,40,20,0)'), 90);
  }

  speed(kmh) {
    $('speedo').textContent = kmh > 1 ? Math.round(kmh) + ' km/h' : '';
  }
}
