import {
  TILE, MAP_W, MAP_H, PLAYER_RADIUS, PLAYER_SPEED, BOT_SPEED, MAX_HP, INPUT_DT,
  RESPAWN_MS, PICKUP_RESPAWN_MS, PICKUP_RADIUS, ROUND_MS, ROUND_END_MS, MAX_PLAYERS,
  MODES, WEAPONS, GRENADE_THROW_TIME, GRENADE_MIN_DIST, GRENADE_MAX_DIST,
} from '../../shared/constants.js';
import { buildMap } from '../../shared/maps.js';
import { circleHitsWall, isSolidPoint, isSolidTile, moveEntity } from '../../shared/physics.js';
import { BotBrain } from './BotBrain.js';

const BOT_NAMES = ['Pixel', 'Rook', 'Mango', 'Zed', 'Bolt', 'Nova', 'Juno', 'Kite', 'Ash'];
const BOT_COLORS = ['#ff6b5b', '#9b6bff', '#3ad19a', '#ff8fd0', '#ff9a3c', '#e8e8e8'];
const MAX_QUEUED_INPUTS = 10;
const MAX_INPUTS_PER_TICK = 3;
const SELF_DAMAGE_FACTOR = 0.5;

/**
 * One match. Owns the authoritative simulation: movement, shooting,
 * projectiles, damage, pickups, respawns, scoring and rounds.
 *
 * The Room never touches sockets. It reports what happened through
 * `onEvent(type, payload)` and exposes `buildSnapshot()` for the network layer.
 */
export class Room {
  constructor({ code, mode = 'dm', mapKey = 'field', visibility = 'public', bots = false, minPlayers = 4,
    rng = Math.random, now = () => Date.now(), onEvent = () => {} }) {
    this.code = code;
    this.mode = mode;
    this.modeDef = MODES[mode];
    this.mapKey = mapKey;
    this.map = buildMap(mapKey);
    this.visibility = visibility;
    this.botsEnabled = bots;
    this.minPlayers = minPlayers;
    this.rng = rng;
    this.now = now;
    this.onEvent = onEvent;
    this.createdAt = now();

    this.players = new Map();
    this.projectiles = [];
    this.nextProjectileId = 1;
    this.nextBotId = 1;
    this.pickups = this.map.pickups.map((p) => ({ ...p, respawnAt: 0 }));
    this.teamScores = { 1: 0, 2: 0 };
    this.round = { number: 1, state: 'playing', endsAt: now() + ROUND_MS, stateEndsAt: 0, winner: null };
  }

  /* ------------------------------------------------------------ players */

  get humanCount() { let n = 0; for (const p of this.players.values()) if (!p.isBot) n++; return n; }
  get isEmpty() { return this.humanCount === 0; }
  get isFull() { return this.humanCount >= MAX_PLAYERS; }
  get isTeamMode() { return this.modeDef.teams; }

  addHuman(id, profile) {
    if (this.isFull) return null;
    if (this.players.size >= MAX_PLAYERS) this.removeOneBot();
    const p = this.createPlayer(id, profile, false);
    this.onEvent('join', { id, name: p.name });
    this.balanceBots();
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.projectiles = this.projectiles.filter((pr) => pr.ownerId !== id || pr.kind !== 'bullet');
    if (!p.isBot) this.onEvent('leave', { id, name: p.name });
    this.balanceBots();
  }

  createPlayer(id, profile, isBot) {
    const p = {
      id, isBot, name: profile.name, color: profile.color, hat: profile.hat,
      team: this.isTeamMode ? this.smallerTeam(!isBot) : 0,
      x: 0, y: 0, angle: 0, aimDist: 300, hp: MAX_HP, alive: false,
      weapon: 'pistol', special: null, ammo: 0, cooldownUntil: 0, respawnAt: 0,
      kills: 0, deaths: 0, lastKiller: null, fire: false,
      inputs: [], lastSeq: 0, brain: isBot ? new BotBrain(this.rng) : null,
    };
    this.players.set(id, p);
    this.spawn(p);
    return p;
  }

  /** Team with fewer members. Humans are balanced against humans; bots then fill the gaps. */
  smallerTeam(humansOnly = false) {
    const c = { 1: 0, 2: 0 };
    for (const p of this.players.values()) if (c[p.team] !== undefined && (!humansOnly || !p.isBot)) c[p.team]++;
    if (c[1] === c[2]) return this.rng() < 0.5 ? 1 : 2;
    return c[1] < c[2] ? 1 : 2;
  }

  /** Keep total players at minPlayers by adding/removing bots (when bots are enabled). */
  balanceBots() {
    if (this.isEmpty) return;
    const bots = [...this.players.values()].filter((p) => p.isBot);
    const target = this.botsEnabled ? Math.max(0, this.minPlayers - this.humanCount) : 0;
    for (let i = bots.length; i < target && this.players.size < MAX_PLAYERS; i++) {
      const n = this.nextBotId++;
      this.createPlayer(`bot-${n}`, {
        name: `${BOT_NAMES[(n - 1) % BOT_NAMES.length]} (bot)`.slice(0, 14),
        color: BOT_COLORS[n % BOT_COLORS.length], hat: n % 5,
      }, true);
    }
    for (let i = bots.length; i > target; i--) this.removeOneBot();
    this.rebalanceBotTeams();
  }

  /** In team mode, bots change sides so the two teams differ by at most one player. */
  rebalanceBotTeams() {
    if (!this.isTeamMode) return;
    const c = { 1: 0, 2: 0 };
    for (const p of this.players.values()) if (!p.isBot) c[p.team]++;
    for (const bot of [...this.players.values()].filter((p) => p.isBot)) {
      bot.team = c[1] <= c[2] ? 1 : 2;
      c[bot.team]++;
    }
  }

  /** Remove a bot, taking it from the bigger team so teams stay even. */
  removeOneBot() {
    const bots = [...this.players.values()].filter((p) => p.isBot).reverse();
    if (!bots.length) return;
    let bot = bots[0];
    if (this.isTeamMode) {
      const c = { 1: 0, 2: 0 };
      for (const p of this.players.values()) c[p.team]++;
      const bigger = c[1] >= c[2] ? 1 : 2;
      bot = bots.find((b) => b.team === bigger) || bot;
    }
    this.players.delete(bot.id);
  }

  queueInput(id, input) {
    const p = this.players.get(id);
    if (!p || p.isBot) return false;
    if (p.inputs.length >= MAX_QUEUED_INPUTS) return false;
    const lastQueued = p.inputs.length ? p.inputs[p.inputs.length - 1].seq : p.lastSeq;
    if (input.seq <= lastQueued) return false;
    p.inputs.push(input);
    return true;
  }

  /* -------------------------------------------------------- simulation */

  tick(dt) {
    const t = this.now();
    this.updateRound(t);
    const playing = this.round.state === 'playing';

    for (const p of this.players.values()) {
      if (p.isBot) {
        if (p.alive && playing) {
          const intent = p.brain.think(p, this, dt);
          moveEntity(this.map, p, intent.mx, intent.my, dt, BOT_SPEED, PLAYER_RADIUS);
          p.angle = intent.aim;
          p.aimDist = intent.aimDist;
          p.fire = intent.fire;
          p.brain.preferWeapon(p);
        } else p.fire = false;
      } else {
        for (let n = 0; n < MAX_INPUTS_PER_TICK && p.inputs.length; n++) this.applyInput(p, p.inputs.shift(), playing);
      }
      if (p.fire && p.alive && playing) this.tryFire(p, t);
    }

    this.updateProjectiles(dt, t);
    for (const p of this.players.values()) {
      if (!p.alive && playing && t >= p.respawnAt) this.spawn(p);
      if (p.alive) this.checkPickups(p, t);
    }
  }

  applyInput(p, input, playing) {
    p.lastSeq = input.seq;
    p.angle = input.aim;
    p.aimDist = input.aimDist;
    p.fire = input.fire;
    if (!p.alive || !playing) return;
    moveEntity(this.map, p, input.mx, input.my, INPUT_DT, PLAYER_SPEED, PLAYER_RADIUS);
    if (input.swap) this.swapWeapon(p);
  }

  swapWeapon(p) {
    if (p.special) p.weapon = p.weapon === 'pistol' ? p.special : 'pistol';
  }

  tryFire(p, t) {
    const w = WEAPONS[p.weapon];
    if (!w || t < p.cooldownUntil) return;
    p.cooldownUntil = t + w.rate * 1000;
    const ox = p.x + Math.cos(p.angle) * 22;
    const oy = p.y + Math.sin(p.angle) * 22;
    const base = { ownerId: p.id, team: p.team, weapon: p.weapon, damage: w.dmg, x: ox, y: oy };

    if (w.pel) {
      for (let i = 0; i < w.pel; i++) {
        const a = p.angle + (this.rng() - 0.5) * w.sp * 2;
        const s = w.spd * (0.85 + this.rng() * 0.3);
        this.addProjectile({ ...base, kind: 'bullet', vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: w.life });
      }
    } else if (w.grenade) {
      const d = Math.max(GRENADE_MIN_DIST, Math.min(GRENADE_MAX_DIST, p.aimDist));
      const s = d / GRENADE_THROW_TIME;
      this.addProjectile({ ...base, kind: 'grenade', vx: Math.cos(p.angle) * s, vy: Math.sin(p.angle) * s,
        moveLeft: GRENADE_THROW_TIME, fuse: w.fuse, radius: w.rad, life: w.fuse + 1 });
    } else {
      const a = p.angle + (w.rocket ? 0 : (this.rng() - 0.5) * w.sp * 2);
      this.addProjectile({ ...base, kind: w.rocket ? 'rocket' : 'bullet',
        vx: Math.cos(a) * w.spd, vy: Math.sin(a) * w.spd, life: w.life, radius: w.rad });
    }

    if (p.weapon !== 'pistol') {
      p.ammo--;
      if (p.ammo <= 0) { p.special = null; p.weapon = 'pistol'; p.ammo = 0; }
    }
  }

  addProjectile(pr) {
    pr.id = this.nextProjectileId++;
    this.projectiles.push(pr);
  }

  canDamage(target, pr) {
    if (!target.alive) return false;
    if (this.isTeamMode && target.team === pr.team && target.id !== pr.ownerId) return false;
    return true;
  }

  updateProjectiles(dt, t) {
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      if (pr.kind === 'grenade') {
        if (pr.moveLeft > 0) {
          const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;
          if (isSolidPoint(this.map, nx, pr.y)) pr.vx *= -0.3; else pr.x = nx;
          if (isSolidPoint(this.map, pr.x, ny)) pr.vy *= -0.3; else pr.y = ny;
          pr.moveLeft -= dt;
          if (pr.moveLeft <= 0) { pr.vx = 0; pr.vy = 0; }
        }
        pr.fuse -= dt;
        if (pr.fuse <= 0) this.explode(pr, t);
        continue;
      }
      const steps = Math.max(1, Math.ceil((Math.hypot(pr.vx, pr.vy) * dt) / 12));
      for (let i = 0; i < steps && !pr.dead; i++) {
        pr.x += (pr.vx * dt) / steps;
        pr.y += (pr.vy * dt) / steps;
        if (isSolidPoint(this.map, pr.x, pr.y)) {
          if (pr.kind === 'rocket') this.explode(pr, t); else pr.dead = true;
          break;
        }
        for (const target of this.players.values()) {
          if (target.id === pr.ownerId || !this.canDamage(target, pr)) continue;
          if (Math.hypot(target.x - pr.x, target.y - pr.y) < PLAYER_RADIUS + 3) {
            if (pr.kind === 'rocket') this.explode(pr, t);
            else { pr.dead = true; this.damage(target, pr.damage, pr.ownerId, pr.weapon, t); }
            break;
          }
        }
      }
      pr.life -= dt;
      if (pr.life <= 0 && !pr.dead) {
        if (pr.kind === 'rocket') this.explode(pr, t); else pr.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
  }

  explode(pr, t) {
    pr.dead = true;
    this.onEvent('explosion', { x: Math.round(pr.x), y: Math.round(pr.y), r: pr.radius });
    for (const target of this.players.values()) {
      if (!this.canDamage(target, pr)) continue;
      const d = Math.hypot(target.x - pr.x, target.y - pr.y);
      if (d > pr.radius) continue;
      let dmg = pr.damage * (1 - (d / pr.radius) * 0.6);
      if (target.id === pr.ownerId) dmg *= SELF_DAMAGE_FACTOR;
      this.damage(target, dmg, pr.ownerId, pr.weapon, t);
    }
  }

  damage(target, amount, attackerId, weapon, t) {
    if (!target.alive || this.round.state !== 'playing') return;
    target.hp -= amount;
    this.onEvent('hit', { attackerId, targetId: target.id });
    if (target.hp > 0) return;

    target.hp = 0;
    target.alive = false;
    target.deaths++;
    target.respawnAt = t + RESPAWN_MS;
    target.special = null;
    target.weapon = 'pistol';
    target.ammo = 0;
    target.lastKiller = attackerId;
    const killer = this.players.get(attackerId);
    if (killer && killer !== target) {
      killer.kills++;
      if (this.isTeamMode) this.teamScores[killer.team]++;
    }
    this.onEvent('kill', {
      killerId: attackerId, killerName: killer ? killer.name : 'someone',
      victimId: target.id, victimName: target.name, weapon, self: killer === target,
    });
    if (this.leaderScore() >= this.modeDef.scoreLimit) this.endRound(t);
  }

  checkPickups(p, t) {
    this.pickups.forEach((pk, index) => {
      if (pk.respawnAt > t) return;
      if (Math.hypot(p.x - pk.x, p.y - pk.y) > PICKUP_RADIUS) return;
      const w = WEAPONS[pk.weapon];
      if (p.special === pk.weapon && p.ammo >= w.mag) return;
      p.special = pk.weapon;
      p.ammo = w.mag;
      p.weapon = pk.weapon;
      pk.respawnAt = t + PICKUP_RESPAWN_MS;
      this.onEvent('pickup', { playerId: p.id, weapon: pk.weapon, index });
    });
  }

  nearestEnemy(p) {
    let best = null, bestD = Infinity;
    for (const o of this.players.values()) {
      if (o === p || !o.alive || (this.isTeamMode && o.team === p.team)) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  nearestAvailablePickup(p, maxDist) {
    const t = this.now();
    let best = null, bestD = maxDist;
    for (const pk of this.pickups) {
      if (pk.respawnAt > t) continue;
      const d = Math.hypot(pk.x - p.x, pk.y - p.y);
      if (d < bestD) { bestD = d; best = pk; }
    }
    return best;
  }

  /** Pick the open tile that is farthest from living enemies. */
  spawn(p) {
    const enemies = [...this.players.values()].filter((o) => o !== p && o.alive && !(this.isTeamMode && o.team === p.team));
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 40; i++) {
      const tx = 1 + Math.floor(this.rng() * (MAP_W - 2));
      const ty = 1 + Math.floor(this.rng() * (MAP_H - 2));
      if (isSolidTile(this.map, tx, ty)) continue;
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      if (circleHitsWall(this.map, x, y, PLAYER_RADIUS)) continue;
      let score = 1e6;
      for (const e of enemies) score = Math.min(score, Math.hypot(e.x - x, e.y - y));
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (!best) best = { x: TILE * 1.5, y: TILE * 1.5 };
    Object.assign(p, { x: best.x, y: best.y, hp: MAX_HP, alive: true, weapon: 'pistol', special: null, ammo: 0 });
  }

  /* ------------------------------------------------------------ rounds */

  leaderScore() {
    if (this.isTeamMode) return Math.max(this.teamScores[1], this.teamScores[2]);
    let max = 0;
    for (const p of this.players.values()) max = Math.max(max, p.kills);
    return max;
  }

  winnerLabel() {
    if (this.isTeamMode) {
      const [r, b] = [this.teamScores[1], this.teamScores[2]];
      return r === b ? 'Draw' : r > b ? 'Red team' : 'Blue team';
    }
    let best = null;
    for (const p of this.players.values()) if (!best || p.kills > best.kills) best = p;
    return best ? best.name : 'Nobody';
  }

  updateRound(t) {
    if (this.round.state === 'playing' && t >= this.round.endsAt) this.endRound(t);
    else if (this.round.state === 'ended' && t >= this.round.stateEndsAt) this.startRound(t);
  }

  endRound(t) {
    if (this.round.state !== 'playing') return;
    this.round.state = 'ended';
    this.round.stateEndsAt = t + ROUND_END_MS;
    this.round.winner = this.winnerLabel();
    for (const p of this.players.values()) p.fire = false;
    this.onEvent('roundEnd', { number: this.round.number, winner: this.round.winner });
  }

  startRound(t) {
    this.round = { number: this.round.number + 1, state: 'playing', endsAt: t + ROUND_MS, stateEndsAt: 0, winner: null };
    this.teamScores = { 1: 0, 2: 0 };
    this.projectiles = [];
    for (const pk of this.pickups) pk.respawnAt = 0;
    for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; p.alive = false; }
    for (const p of this.players.values()) this.spawn(p);
    this.onEvent('roundStart', { number: this.round.number });
  }

  /* --------------------------------------------------------- snapshots */

  /** Everything a client needs to draw one frame. Same for every client except `ack`. */
  buildSnapshot() {
    const t = this.now();
    const r = (v) => Math.round(v * 10) / 10;
    return {
      t,
      round: {
        n: this.round.number,
        s: this.round.state,
        tl: Math.max(0, Math.ceil(((this.round.state === 'playing' ? this.round.endsAt : this.round.stateEndsAt) - t) / 1000)),
        w: this.round.winner,
      },
      ts: [this.teamScores[1], this.teamScores[2]],
      pk: this.pickups.map((pk) => (pk.respawnAt <= t ? '1' : '0')).join(''),
      pl: [...this.players.values()].map((p) => ({
        i: p.id, n: p.name, c: p.color, h: p.hat, t: p.team, b: p.isBot ? 1 : 0,
        x: r(p.x), y: r(p.y), a: Math.round(p.angle * 100) / 100,
        hp: Math.ceil(p.hp), al: p.alive ? 1 : 0, w: p.weapon, sp: p.special, am: p.ammo,
        k: p.kills, d: p.deaths, lk: p.lastKiller, rs: p.alive ? 0 : Math.max(0, p.respawnAt - t),
      })),
      pr: this.projectiles.map((pr) => ({ i: pr.id, k: pr.kind[0], o: pr.ownerId, x: r(pr.x), y: r(pr.y), vx: Math.round(pr.vx), vy: Math.round(pr.vy), f: pr.fuse ? r(pr.fuse) : undefined })),
    };
  }

  summary() {
    return { code: this.code, mode: this.mode, map: this.mapKey, players: this.humanCount, bots: this.players.size - this.humanCount, max: MAX_PLAYERS };
  }
}
