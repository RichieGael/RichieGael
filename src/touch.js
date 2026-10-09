// On-screen controls for phones and tablets: a stick on the left, buttons on the right,
// and drag anywhere else on the canvas to look.
const $ = (id) => document.getElementById(id);

export function isTouch() {
  return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

export function setupTouch(game, t) {
  const stick = $('stick');
  const knob = $('knob');
  let sid = null;
  let cx = 0;
  let cy = 0;
  const R = 50;
  const move = (e) => {
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const m = Math.hypot(dx, dy);
    if (m > R) {
      dx *= R / m;
      dy *= R / m;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    t.push = dy / R < -0.35;
    t.brake = dy / R > 0.5;
    t.left = dx / R < -0.35;
    t.right = dx / R > 0.35;
  };
  stick.addEventListener('pointerdown', (e) => {
    sid = e.pointerId;
    stick.setPointerCapture(sid);
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    move(e);
    e.preventDefault();
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === sid) move(e);
  });
  const end = (e) => {
    if (e.pointerId !== sid) return;
    sid = null;
    knob.style.transform = '';
    t.push = t.brake = t.left = t.right = false;
  };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);

  const canvas = $('game');
  let lid = null;
  let lx = 0;
  let ly = 0;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || lid !== null) return;
    lid = e.pointerId;
    lx = e.clientX;
    ly = e.clientY;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lid) return;
    game.look((e.clientX - lx) * 2.2, (e.clientY - ly) * 2.2);
    lx = e.clientX;
    ly = e.clientY;
  });
  const lend = (e) => {
    if (e.pointerId === lid) lid = null;
  };
  canvas.addEventListener('pointerup', lend);
  canvas.addEventListener('pointercancel', lend);

  for (const b of document.querySelectorAll('#tbtns button')) {
    const k = b.dataset.k;
    const down = (e) => {
      e.preventDefault();
      b.classList.add('on');
      game.touchAction(k, true);
    };
    const up = () => {
      if (!b.classList.contains('on')) return;
      b.classList.remove('on');
      game.touchAction(k, false);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }
  $('tpause').addEventListener('click', () => game.pause());
}
