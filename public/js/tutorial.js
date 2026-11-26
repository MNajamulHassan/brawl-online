import { PLAYER_RADIUS, PLAYER_SPEED, PICKUP_RADIUS, GRENADE_THROW_TIME, GRENADE_MIN_DIST, GRENADE_MAX_DIST } from '/shared/constants.js';
import { WEAPONS } from '/shared/balance.js';
import { buildMap } from '/shared/maps.js';
import { moveEntity, isSolidPoint } from '/shared/physics.js';
import { bindLabel, moveLabel } from './settings.js';
import { esc } from './ui.js';

/**
 * The tutorial runs entirely in the browser: a small local simulation on the
 * Fields map with harmless target dummies. It never talks to the server, so it
 * works offline and cannot affect real matches. Movement and weapons reuse the
 * shared constants and physics, so it plays like the real game.
 */
const DUMMY_HP = 54; // three pistol hits
const START = { x: 312, y: 984 };
const STEPS = ['move', 'shoot', 'pickup', 'swap', 'grenade', 'board', 'ready'];

export class Tutorial {
  constructor({ settings, touch, onFinish }) {
    this.settings = settings;
    this.touch = touch;
    this.onFinish = onFinish; // ('quick' | 'lobby')
    this.map = buildMap('field');
    this.me = { i: 'me', n: 'You', c: '#c6f432', h: 1, x: START.x, y: START.y, a: 0, al: 1, hp: 100, mh: 100, w: 'pistol' };
    this.special = null; this.ammo = 0; this.cooldownUntil = 0;
    this.dummies = [];
    this.pickups = [];
    this.projectiles = [];
    this.particles = [];
    this.step = 0;
    this.moved = 0;
    this.swaps = 0;
    this.boardShown = 0;
    this.time = 0;
    this.nextId = 1;
    this.enterStep();
  }

  get stepId() { return STEPS[this.step]; }

  /** Spawn whatever the current step needs. */
  enterStep() {
    const id = this.stepId;
    if (id === 'shoot') this.dummies = [this.dummy(620, 984)];
    if (id === 'pickup') this.pickups = [{ x: 456, y: 936, weapon: 'ar' }];
    if (id === 'grenade') {
      this.pickups = [{ x: 800, y: 984, weapon: 'nade' }];
      this.dummies = [this.dummy(1150, 950), this.dummy(1200, 935), this.dummy(1190, 992)];
    }
  }

  dummy(x, y) { return { i: `d${this.nextId++}`, n: 'Dummy', c: '#c8b07a', h: 0, x, y, a: Math.PI, al: 1, hp: DUMMY_HP, mh: DUMMY_HP, w: null, respawn: 0 }; }

  complete() {
    this.step = Math.min(STEPS.length - 1, this.step + 1);
    this.flashUntil = this.time + 0.8;
    this.enterStep();
  }

  /** One-shot actions from the input module. */
  action(id) {
    if (id === 'swap' && this.special) {
      this.me.w = this.me.w === 'pistol' ? this.special : 'pistol';
      if (this.stepId === 'swap' && ++this.swaps >= 2) this.complete();
    }
    if (id === 'scoreboard') {
      this.boardShown = this.time + 2.5;
      if (this.stepId === 'board') this.complete();
    }
  }

  update(dt, s) {
    this.time += dt;
    const me = this.me;
    const x0 = me.x, y0 = me.y;
    moveEntity(this.map, me, s.mx, s.my, dt, PLAYER_SPEED, PLAYER_RADIUS);
    me.a = s.aim;
    this.moved += Math.hypot(me.x - x0, me.y - y0);
    if (this.stepId === 'move' && this.moved > 220) this.complete();
    if (s.fire) this.fire(s);

    for (const pk of this.pickups) {
      if (!pk.taken && Math.hypot(me.x - pk.x, me.y - pk.y) < PICKUP_RADIUS) {
        pk.taken = true;
        this.special = pk.weapon; this.ammo = WEAPONS[pk.weapon].mag; me.w = pk.weapon;
        if (this.stepId === 'pickup') this.complete();
      }
    }
    this.pickups = this.pickups.filter((p) => !p.taken);
    // Out of grenades without finishing the step: put another pack down.
    if (this.stepId === 'grenade' && !this.pickups.length && this.special !== 'nade' && !this.projectiles.some((p) => p.k === 'g')) {
      this.pickups = [{ x: 800, y: 984, weapon: 'nade' }];
    }

    for (const d of this.dummies) if (!d.al && this.time >= d.respawn) Object.assign(d, { al: 1, hp: DUMMY_HP });
    this.updateProjectiles(dt);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  fire(s) {
    const me = this.me, w = WEAPONS[me.w];
    if (this.time < this.cooldownUntil) return;
    this.cooldownUntil = this.time + w.rate;
    const ox = me.x + Math.cos(me.a) * 22, oy = me.y + Math.sin(me.a) * 22;
    const add = (p) => this.projectiles.push({ i: this.nextId++, x: ox, y: oy, ...p });
    if (w.grenade) {
      const d = Math.max(GRENADE_MIN_DIST, Math.min(GRENADE_MAX_DIST, s.aimDist));
      const sp = d / GRENADE_THROW_TIME;
      add({ k: 'g', vx: Math.cos(me.a) * sp, vy: Math.sin(me.a) * sp, moveLeft: GRENADE_THROW_TIME, f: w.fuse, dmg: w.dmg, rad: w.rad });
    } else {
      for (let n = 0; n < (w.pel || 1); n++) {
        const a = me.a + (Math.random() - 0.5) * w.sp * 2;
        add({ k: 'b', vx: Math.cos(a) * w.spd, vy: Math.sin(a) * w.spd, life: w.life, dmg: w.dmg });
      }
    }
    this.particles.push({ x: ox, y: oy, vx: 0, vy: 0, life: 0.07, max: 0.07, r: 11, col: '#ffe27a' });
    if (me.w !== 'pistol' && --this.ammo <= 0) { this.special = null; me.w = 'pistol'; }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (p.k === 'g') {
        if (p.moveLeft > 0) {
          const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
          if (isSolidPoint(this.map, nx, p.y)) p.vx *= -0.3; else p.x = nx;
          if (isSolidPoint(this.map, p.x, ny)) p.vy *= -0.3; else p.y = ny;
          p.moveLeft -= dt;
        }
        p.f -= dt;
        if (p.f <= 0) this.explode(p);
        continue;
      }
      const steps = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy) * dt) / 12));
      for (let n = 0; n < steps && !p.dead; n++) {
        p.x += (p.vx * dt) / steps; p.y += (p.vy * dt) / steps;
        if (isSolidPoint(this.map, p.x, p.y)) { p.dead = true; break; }
        const d = this.dummies.find((o) => o.al && Math.hypot(o.x - p.x, o.y - p.y) < PLAYER_RADIUS + 3);
        if (d) { p.dead = true; this.hurt(d, p.dmg); }
      }
      p.life -= dt;
      if (p.life <= 0) p.dead = true;
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  explode(p) {
    p.dead = true;
    let hit = 0;
    for (const d of this.dummies) {
      const dist = Math.hypot(d.x - p.x, d.y - p.y);
      if (d.al && dist <= p.rad) { this.hurt(d, p.dmg * (1 - (dist / p.rad) * 0.6)); hit++; }
    }
    for (let n = 0; n < 18; n++) {
      const a = Math.random() * 7, sp = 60 + Math.random() * 240;
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5, r: 6 + Math.random() * 9, col: ['#ffb347', '#ff6a2b', '#ffe27a', '#555'][n % 4] });
    }
    this.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.3, max: 0.3, r: p.rad, ring: true });
    this.lastBlast = { x: p.x, y: p.y, r: p.rad };
    if (this.stepId === 'grenade' && hit >= 2) this.complete();
  }

  hurt(d, dmg) {
    d.hp -= dmg;
    d.flashAt = this.time;
    if (d.hp <= 0) { d.al = 0; d.respawn = this.time + 1.5; }
    if (this.stepId === 'shoot') this.complete();
  }

  /** The scene for renderer.drawFrame. */
  scene(now) {
    const players = [this.me, ...this.dummies].map((p) => ({ ...p, flash: p.flashAt && this.time - p.flashAt < 0.12 ? 1 : 0 }));
    return {
      map: this.map, camera: this.me, players, now, meId: 'me', teams: false,
      pickups: this.pickups.map((p) => ({ ...p, available: true })),
      projectiles: this.projectiles.map((p) => ({ ...p })),
      particles: this.particles,
    };
  }

  /** Step list with checkmarks plus the tip for the current step, using the player's own controls. */
  renderCard(el) {
    const b = this.settings.controls.binds, k = (a) => esc(bindLabel(b, a));
    const t = this.touch;
    const tips = {
      move: t ? 'Drag your <b>left thumb</b> to walk around.' : `Walk with <b>${esc(moveLabel(b))}</b>.`,
      shoot: t ? 'Drag your <b>right thumb</b> toward the dummy and push past the red ring to shoot.' : `Aim with the <b>mouse</b> and shoot the dummy with <b>${k('shoot')}</b>.`,
      pickup: 'Walk over the glowing <b>AR</b> circle to pick up an assault rifle.',
      swap: t ? 'Tap <b>Swap</b> to switch to the pistol, then tap it again to switch back.' : `Press <b>${k('swap')}</b> to switch to the pistol, then press it again to switch back.`,
      grenade: t ? 'Grab the <b>NADE</b>, walk right and throw one into the group. How far you push the stick sets the distance.' : 'Grab the <b>NADE</b>, walk right and throw one into the group. The cursor distance sets how far it flies.',
      board: t ? 'Tap <b>Scores</b> to open the scoreboard.' : `Press <b>${k('scoreboard')}</b> to open the scoreboard.`,
      ready: 'You\'re ready! Jump into a real match.',
    };
    const names = ['Move', 'Aim and shoot', 'Pick up a weapon', 'Swap weapons', 'Throw a grenade', 'Open the scoreboard', 'Ready'];
    el.querySelector('.tut-steps').innerHTML = names.map((n, i) =>
      `<li class="${i < this.step ? 'done' : i === this.step ? 'now' : ''}">${i < this.step ? '✓' : `${i + 1}.`} ${n}</li>`).join('');
    el.querySelector('.tut-tip').innerHTML = tips[this.stepId];
    el.classList.toggle('flash', this.time < (this.flashUntil || 0));
    el.querySelector('.tut-end').hidden = this.stepId !== 'ready';
    el.querySelector('.tut-board').hidden = this.time > this.boardShown;
    el.querySelector('#tSwap').hidden = !t || !this.special;
    el.querySelector('#tBoard').hidden = !t;
  }
}

export const TUTORIAL_STEPS = STEPS;
