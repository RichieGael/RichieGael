import { SHOP, GEAR, WEAPONS } from './weapons.js';
import { RARITY, SKINS, skinById, rollSkin, rollRarity, wearName, fullName, ITEM_LABEL } from './skins.js';
import { skinThumb, gripDataURL } from './textures.js';
import { fmtMoney } from './util.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

export class Menus {
  constructor(game) {
    this.g = game;
    const grip = `url(${gripDataURL()})`;
    document.querySelectorAll('.grip').forEach((el) => (el.style.backgroundImage = grip));
    $('btnComp').onclick = () => game.start('comp');
    $('btnFree').onclick = () => game.start('free');
    $('btnResume').onclick = () => game.resume();
    $('btnQuit').onclick = () => game.quit();
    $('btnCases').onclick = () => this.openCases();
    $('btnInv').onclick = () => this.openInv();
    $('buyClose').onclick = () => game.closeBuy();
    $('caseClose').onclick = () => this.closeSheet('cases');
    $('invClose').onclick = () => this.closeSheet('inv');
    $('caseOpen').onclick = () => this.spin();
    $('meAgain').onclick = () => {
      $('matchEnd').hidden = true;
      game.start('comp');
    };
    $('meMenu').onclick = () => {
      $('matchEnd').hidden = true;
      game.quit();
    };
    $('odds').innerHTML = Object.values(RARITY)
      .map((r) => `<span style="--rc:${r.color}">${r.name} ${r.w}%</span>`)
      .join('');
    this.spinning = false;
  }

  showMain(paused) {
    $('menu').hidden = false;
    $('btnResume').hidden = !paused;
    $('btnQuit').hidden = !paused;
    $('btnComp').textContent = paused ? 'New competitive' : 'Play competitive';
    $('btnFree').textContent = paused ? 'New free skate' : 'Free skate';
    this.refreshCount();
  }
  hideMain() {
    $('menu').hidden = true;
  }
  refreshCount() {
    const n = this.g.inv.cases;
    $('caseCount').textContent = n;
    $('caseCount').hidden = n <= 0;
  }
  anyOpen() {
    return !$('buy').hidden || !$('cases').hidden || !$('inv').hidden || !$('matchEnd').hidden;
  }
  closeSheet(id) {
    if (this.spinning) return;
    $(id).hidden = true;
    this.refreshCount();
    this.g.sheetClosed();
  }

  // ---------- Buy ----------
  renderBuy() {
    const g = this.g;
    $('buyCash').textContent = fmtMoney(g.S.money);
    $('buyLeft').textContent = g.buyLeftText();
    let k = 0;
    const cols = SHOP.map((c) => {
      const items = c.items
        .map((id) => {
          k++;
          const w = WEAPONS[id] || GEAR[id];
          const owned = g.owns(id);
          const can = !owned && g.S.money >= w.price;
          return `<button class="item${owned ? ' owned' : ''}" data-id="${id}" ${can ? '' : 'disabled'}><span class="kbd k">${k}</span><span class="n">${w.name}</span><span class="p">${owned ? 'Owned' : fmtMoney(w.price)}</span></button>`;
        })
        .join('');
      return `<div class="buy-col"><h3>${c.cat}</h3>${items}</div>`;
    }).join('');
    $('buyGrid').innerHTML = cols;
    $('buyGrid').querySelectorAll('.item').forEach((b) => (b.onclick = () => g.buy(b.dataset.id)));
  }
  buyIndex(i) {
    const ids = SHOP.flatMap((c) => c.items);
    if (ids[i]) this.g.buy(ids[i]);
  }

  // ---------- Cases ----------
  openCases() {
    $('cases').hidden = false;
    $('caseResult').hidden = true;
    $('caseEquip').hidden = true;
    this.updateCaseUI();
    if (!$('strip').children.length) this.fillStrip(null);
    this.g.sheetOpened();
  }
  updateCaseUI() {
    const n = this.g.inv.cases;
    $('caseLeft').textContent = n === 1 ? '1 left' : `${n} left`;
    $('caseOpen').disabled = n <= 0 || this.spinning;
    $('caseOpen').textContent = n <= 0 ? 'No cases yet' : 'Open case';
  }
  cardHtml(roll) {
    const s = skinById[roll.skin];
    const r = RARITY[s.r];
    return `<div class="card" style="--rc:${r.color}"><img alt="" src="${skinThumb(s, Math.min(roll.wear, 0.3))}"><div class="ci"><span class="it">${ITEM_LABEL[s.item]}</span><span class="nm">${s.name}</span></div></div>`;
  }
  fillStrip(winner) {
    const rolls = [];
    for (let i = 0; i < 56; i++) {
      if (i === 46 && winner) rolls.push(winner);
      else {
        const r = rollRarity();
        const pool = SKINS.filter((s) => s.r === r);
        rolls.push({ skin: pool[Math.floor(Math.random() * pool.length)].id, wear: Math.random() * 0.5 });
      }
    }
    $('strip').innerHTML = rolls.map((r) => this.cardHtml(r)).join('');
    $('strip').style.transform = 'translateX(0px)';
  }
  spin() {
    const g = this.g;
    if (this.spinning || g.inv.cases <= 0) return;
    g.inv.cases--;
    g.inv.save();
    const roll = rollSkin();
    this.fillStrip(roll);
    this.spinning = true;
    this.updateCaseUI();
    $('caseResult').hidden = true;
    $('caseEquip').hidden = true;
    $('caseClose').disabled = true;
    const reel = document.querySelector('.reel');
    const W = reel.clientWidth;
    const step = 124 + 8;
    const end = -(46 * step + 62 - W / 2 + (Math.random() * 100 - 50));
    const dur = 5200;
    const t0 = performance.now();
    let lastIdx = -1;
    const strip = $('strip');
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      const x = end * e;
      strip.style.transform = `translateX(${x}px)`;
      const idx = Math.floor((-x + W / 2) / step);
      if (idx !== lastIdx) {
        lastIdx = idx;
        sfx.tick();
      }
      if (p < 1) requestAnimationFrame(tick);
      else this.reveal(roll);
    };
    requestAnimationFrame(tick);
  }
  reveal(roll) {
    const it = this.g.inv.add(roll);
    const s = skinById[roll.skin];
    const r = RARITY[s.r];
    sfx.reveal(r.rank);
    const el = $('caseResult');
    el.style.setProperty('--rc', r.color);
    el.innerHTML = `<img alt="" src="${skinThumb(s, roll.wear)}"><div class="info"><span class="rar">${r.name}</span><span class="nm">${fullName(s)}</span><span class="wr">${wearName(roll.wear)} · float ${roll.wear.toFixed(4)}</span></div>`;
    el.hidden = false;
    const eq = $('caseEquip');
    eq.hidden = false;
    eq.textContent = 'Equip';
    eq.disabled = false;
    eq.onclick = () => {
      if (!this.g.inv.isEquipped(it.uid)) this.g.inv.toggleEquip(it.uid);
      this.g.applySkins();
      eq.textContent = 'Equipped';
      eq.disabled = true;
    };
    this.spinning = false;
    $('caseClose').disabled = false;
    this.updateCaseUI();
    this.refreshCount();
  }

  // ---------- Inventory ----------
  openInv() {
    $('inv').hidden = false;
    this.renderInv();
    this.g.sheetOpened();
  }
  renderInv() {
    const inv = this.g.inv;
    const grid = $('invGrid');
    if (!inv.items.length) {
      grid.innerHTML = '<p class="empty">Nothing here yet. Open a case to get your first skin.</p>';
      return;
    }
    const items = inv.items.slice().sort((a, b) => RARITY[skinById[b.skin].r].rank - RARITY[skinById[a.skin].r].rank);
    grid.innerHTML = items
      .map((it) => {
        const s = skinById[it.skin];
        const r = RARITY[s.r];
        return `<button class="inv-item${inv.isEquipped(it.uid) ? ' eq' : ''}" style="--rc:${r.color}" data-uid="${it.uid}"><img alt="" src="${skinThumb(s, it.wear)}"><span class="ci"><span class="it">${ITEM_LABEL[s.item]}</span><span class="nm">${s.name}</span><span class="wr">${wearName(it.wear)} · ${it.wear.toFixed(3)}</span></span></button>`;
      })
      .join('');
    grid.querySelectorAll('.inv-item').forEach(
      (b) =>
        (b.onclick = () => {
          inv.toggleEquip(Number(b.dataset.uid));
          this.g.applySkins();
          this.renderInv();
        }),
    );
  }

  // ---------- Match end ----------
  showMatchEnd(won, st) {
    $('meTitle').textContent = won ? 'Match won' : 'Match lost';
    const stats = [
      ['Score', `${st.ct}–${st.t}`],
      ['Kills', st.kills],
      ['Headshot %', st.kills ? Math.round((st.hs / st.kills) * 100) + '%' : '0%'],
      ['Style kills', st.style],
      ['Best line', st.best.toLocaleString('en-US')],
      ['Bails', st.bails],
    ];
    $('meStats').innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`).join('');
    $('matchEnd').hidden = false;
  }
}
