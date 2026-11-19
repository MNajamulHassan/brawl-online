/**
 * Keyboard + mouse on PC, twin virtual sticks on touch screens.
 * sample() turns whatever the player is doing into one intent object.
 */
const STICK_RADIUS = 60;

export class Input {
  constructor(canvas, { onSwap, onToggleBoard }) {
    this.keys = new Set();
    this.mouse = { x: innerWidth / 2 + 100, y: innerHeight / 2, down: false };
    this.sticks = { move: null, aim: null };
    this.touch = matchMedia('(pointer: coarse)').matches;
    if (this.touch) document.body.classList.add('touch');
    this.aim = 0;
    this.active = false;

    addEventListener('keydown', (e) => {
      if (!this.active || e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (k === 'tab') { e.preventDefault(); onToggleBoard(); return; }
      if (k === 'q' && !e.repeat) onSwap();
      this.keys.add(k);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });

    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouse.down = true; });
    addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', () => onSwap(), { passive: true });

    const start = (e) => {
      e.preventDefault();
      if (!this.touch) { this.touch = true; document.body.classList.add('touch'); }
      for (const t of e.changedTouches) {
        const s = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0, radius: STICK_RADIUS };
        if (t.clientX < innerWidth / 2) { if (!this.sticks.move) this.sticks.move = s; }
        else if (!this.sticks.aim) this.sticks.aim = s;
      }
    };
    const move = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) for (const s of Object.values(this.sticks)) {
        if (s && s.id === t.identifier) { s.dx = t.clientX - s.ox; s.dy = t.clientY - s.oy; }
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) for (const k of ['move', 'aim']) {
        if (this.sticks[k] && this.sticks[k].id === t.identifier) this.sticks[k] = null;
      }
    };
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  reset() { this.keys.clear(); this.mouse.down = false; this.sticks.move = null; this.sticks.aim = null; }

  sample(scale) {
    let mx = 0, my = 0, fire = false, aimDist = 300;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) my -= 1;
    if (k.has('s') || k.has('arrowdown')) my += 1;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (this.sticks.move) { mx = this.sticks.move.dx / STICK_RADIUS; my = this.sticks.move.dy / STICK_RADIUS; }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    if (this.touch) {
      const s = this.sticks.aim;
      if (s) {
        const m = Math.hypot(s.dx, s.dy) / STICK_RADIUS;
        if (m > 0.2) { this.aim = Math.atan2(s.dy, s.dx); fire = m > 0.6; aimDist = Math.min(1, m) * 330; }
      }
    } else {
      const dx = this.mouse.x - innerWidth / 2, dy = this.mouse.y - innerHeight / 2;
      this.aim = Math.atan2(dy, dx);
      fire = this.mouse.down;
      aimDist = Math.hypot(dx, dy) / scale;
    }
    return { mx, my, aim: this.aim, fire, aimDist };
  }
}
