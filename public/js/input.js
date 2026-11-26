import { ACTIONS, actionFor } from './settings.js';

/**
 * Keyboard + mouse on PC, twin virtual sticks on touch screens.
 * Keys come from the player's binds (settings.controls.binds), read live so a rebind applies at once.
 * sample() turns whatever the player is doing into one intent object.
 */
const STICK_RADIUS = 60;
const HOLD = new Set(ACTIONS.filter((a) => a.hold).map((a) => a.id));

export class Input {
  /** onAction(id) fires once per press for one-shot actions (swap, ability, pick1..3, scoreboard, mute, menu). */
  constructor(canvas, settings, onAction) {
    this.settings = settings;
    this.pressed = new Set(); // codes currently held
    this.mouse = { x: innerWidth / 2 + 100, y: innerHeight / 2 };
    this.sticks = { move: null, aim: null };
    this.fireHeld = false; // touch Fire button (when auto-fire is off)
    this.touch = matchMedia('(pointer: coarse)').matches;
    if (this.touch) document.body.classList.add('touch');
    this.aim = 0;
    this.active = false;

    const press = (code, e) => {
      const action = actionFor(this.settings.controls.binds, code);
      if (!action) return;
      if (e && this.active) e.preventDefault(); // keep Tab, Space, arrows from moving the page
      if (!HOLD.has(action) && (this.active || action === 'menu')) onAction(action);
    };

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      this.pressed.add(e.code);
      if (!e.repeat) press(e.code, e);
    });
    addEventListener('keyup', (e) => this.pressed.delete(e.code));
    addEventListener('blur', () => this.reset());

    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    canvas.addEventListener('mousedown', (e) => { const c = `Mouse${e.button}`; this.pressed.add(c); press(c, e); });
    addEventListener('mouseup', (e) => this.pressed.delete(`Mouse${e.button}`));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => press(e.deltaY < 0 ? 'WheelUp' : 'WheelDown'), { passive: true });

    const start = (e) => {
      e.preventDefault();
      if (!this.touch) { this.touch = true; document.body.classList.add('touch'); }
      const { joystick, layout } = this.settings.controls;
      for (const t of e.changedTouches) {
        const key = t.clientX < innerWidth / 2 ? 'move' : 'aim';
        if (this.sticks[key]) continue;
        const l = layout[key];
        const fixed = joystick === 'fixed';
        this.sticks[key] = {
          id: t.identifier, radius: STICK_RADIUS * l.s,
          ox: fixed ? l.x * innerWidth : t.clientX, oy: fixed ? l.y * innerHeight : t.clientY,
          dx: 0, dy: 0,
        };
        const s = this.sticks[key];
        s.dx = t.clientX - s.ox; s.dy = t.clientY - s.oy;
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

  held(action) { return this.settings.controls.binds[action].some((c) => c && this.pressed.has(c)); }

  reset() { this.pressed.clear(); this.sticks.move = null; this.sticks.aim = null; this.fireHeld = false; }

  sample(scale) {
    let mx = 0, my = 0, fire = false, aimDist = 300;
    if (!this.active) return { mx, my, aim: this.aim, fire, aimDist }; // menu open: stand still, keep aim
    if (this.held('up')) my -= 1;
    if (this.held('down')) my += 1;
    if (this.held('left')) mx -= 1;
    if (this.held('right')) mx += 1;
    const ms = this.sticks.move;
    if (ms) { mx = ms.dx / ms.radius; my = ms.dy / ms.radius; }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    if (this.touch) {
      const s = this.sticks.aim;
      const { touchSens, autoFire } = this.settings.gameplay;
      if (s) {
        const m = (Math.hypot(s.dx, s.dy) / s.radius) * touchSens;
        if (m > 0.2) { this.aim = Math.atan2(s.dy, s.dx); fire = autoFire && m > 0.6; aimDist = Math.min(1, m) * 330; }
      }
      if (!autoFire) fire = this.fireHeld;
    } else {
      const dx = this.mouse.x - innerWidth / 2, dy = this.mouse.y - innerHeight / 2;
      this.aim = Math.atan2(dy, dx);
      fire = this.held('shoot');
      aimDist = Math.hypot(dx, dy) / scale;
    }
    return { mx, my, aim: this.aim, fire, aimDist };
  }
}
