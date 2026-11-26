import {
  TILE, MAP_W, MAP_H, PLAYER_RADIUS, BOT_SPEED, INPUT_DT,
  RESPAWN_MS, PICKUP_RESPAWN_MS, PICKUP_RADIUS, CRATE_RADIUS, ROUND_MS, ROUND_END_MS, MAX_PLAYERS,
  MODES, GRENADE_THROW_TIME, GRENADE_MIN_DIST, GRENADE_MAX_DIST,
} from '../../shared/constants.js';
import { WEAPONS, SKILLS, XP, DRAFT, CRATES, REVIVE, WAVES } from '../../shared/balance.js';
import { buildMap } from '../../shared/maps.js';
import { circleHitsWall, hasLineOfSight, isSolidPoint, isSolidTile, moveEntity } from '../../shared/physics.js';
import { BotBrain } from './BotBrain.js';
import { BalanceStats } from './BalanceStats.js';
import { WaveDirector } from './WaveDirector.js';
import {
  stacks, makeOffer, applySkill, maxHp, speedMul, playerSpeed, fireRateMul, activeCooldown, boomEvery,
} from './Skills.js';

const BOT_NAMES = ['Pixel', 'Rook', 'Mango', 'Zed', 'Bolt', 'Nova', 'Juno', 'Kite', 'Ash'];
const WAVE_BOT_NAMES = ['Grunt', 'Drone', 'Brute', 'Scrap', 'Rusty', 'Clank'];
const BOT_COLORS = ['#ff6b5b', '#9b6bff', '#3ad19a', '#ff8fd0', '#ff9a3c', '#e8e8e8'];
const MAX_QUEUED_INPUTS = 10;
const MAX_INPUTS_PER_TICK = 3;
const SELF_DAMAGE_FACTOR = 0.5;
const LOOT_WEAPONS = ['ar', 'sg', 'rpg', 'nade'];

/**
 * One match. Owns the authoritative simulation: movement, shooting,
 * projectiles, damage, skills, crates, revives, waves, respawns, scoring and rounds.
 *
 * The Room never touches sockets. It reports what happened through
 * `onEvent(type, payload)` and exposes `buildSnapshot()` / `privateState()` for the network layer.
 */
export class Room {
  constructor({ code, mode = 'dm', mapKey = 'field', visibility = 'public', bots = false, minPlayers = 4,
    rng = Math.random, now = () => Date.now(), onEvent = () => {}, stats = new BalanceStats() }) {
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
    this.stats = stats;
    this.createdAt = now();
    this.hostId = null;

    this.players = new Map();
    this.projectiles = [];
    this.turrets = [];
    this.loot = [];
    this.nextId = 1;
    this.nextBotId = 1;
    this.pickups = this.map.pickups.map((p) => ({ ...p, respawnAt: 0 }));
    this.crates = this.map.crates.map((c) => ({ ...c, hp: CRATES.hp, respawnAt: 0 }));
    this.teamScores = { 1: 0, 2: 0 };
    this.waves = this.isCoop ? new WaveDirector(this) : null;
    this.round = { number: 1, state: 'playing', endsAt: this.isCoop ? Infinity : now() + ROUND_MS, stateEndsAt: 0, winner: null };
  }

  /* ------------------------------------------------------------ players */

  get humanCount() { let n = 0; for (const p of this.players.values()) if (!p.isBot) n++; return n; }
  get isEmpty() { return this.humanCount === 0; }
  get isFull() { return this.humanCount >= MAX_PLAYERS; }
  get isTeamMode() { return this.modeDef.teams; }
  get isCoop() { return !!this.modeDef.coop; }

  /** Standing and able to act (not dead, not downed). */
  static active(p) { return p.alive && !p.downed; }

  /** `opts.team` places a party member next to their friends (see RoomManager.join). */
  addHuman(id, profile, opts = {}) {
    if (this.isFull) return null;
    if (!this.isCoop && this.players.size >= MAX_PLAYERS) this.removeOneBot();
    const p = this.createPlayer(id, profile, false, opts.team);
    if (!this.hostId) this.hostId = id;
    this.onEvent('join', { id, name: p.name });
    this.balanceBots();
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.projectiles = this.projectiles.filter((pr) => pr.ownerId !== id || pr.kind !== 'bullet');
    this.turrets = this.turrets.filter((tu) => tu.ownerId !== id);
    if (this.hostId === id) this.hostId = [...this.players.values()].find((o) => !o.isBot)?.id || null;
    if (!p.isBot) this.onEvent('leave', { id, name: p.name });
    this.balanceBots();
  }

  createPlayer(id, profile, isBot, team) {
    let t = 0;
    if (this.isCoop) t = isBot ? 2 : 1;
    else if (this.isTeamMode) t = team === 1 || team === 2 ? team : this.smallerTeam(!isBot);
    const p = {
      id, isBot, name: profile.name, color: profile.color, hat: profile.hat, team: t,
      x: 0, y: 0, angle: 0, aimDist: 300, moveX: 0, moveY: 0, hp: 100, armor: 0, alive: false,
      weapon: 'pistol', special: null, ammo: 0, cooldownUntil: 0, respawnAt: 0, shots: 0,
      kills: 0, deaths: 0, lastKiller: null, fire: false, lastHurtAt: 0, damagedBy: new Map(), roundDamage: {},
      downed: false, downedUntil: 0, downedBy: null, reviveMs: 0,
      inputs: [], lastSeq: 0, brain: isBot ? new BotBrain(this.rng) : null,
    };
    this.resetProgress(p);
    this.players.set(id, p);
    this.spawn(p);
    return p;
  }

  /** Level, XP and skills: kept through deaths, reset every round. */
  resetProgress(p) {
    Object.assign(p, { level: 1, xp: 0, skills: {}, active: null, activeReadyAt: 0, shieldUntil: 0,
      drafts: 0, offer: null, offerDeadline: 0, roundDamage: {} });
  }

  /** Team with fewer members. Humans are balanced against humans; bots then fill the gaps. */
  smallerTeam(humansOnly = false) {
    const c = { 1: 0, 2: 0 };
    for (const p of this.players.values()) if (c[p.team] !== undefined && (!humansOnly || !p.isBot)) c[p.team]++;
    if (c[1] === c[2]) return this.rng() < 0.5 ? 1 : 2;
    return c[1] < c[2] ? 1 : 2;
  }

  /** The host's team, while it still has room for another human; else null. */
  partyTeam() {
    const host = this.players.get(this.hostId);
    if (!host || !this.isTeamMode || this.isCoop) return null;
    let humans = 0;
    for (const p of this.players.values()) if (!p.isBot && p.team === host.team) humans++;
    return humans < MAX_PLAYERS / 2 ? host.team : null;
  }

  /** Keep total players at minPlayers by adding/removing bots (when bots are enabled). */
  balanceBots() {
    if (this.isEmpty || this.isCoop) return;
    const bots = [...this.players.values()].filter((p) => p.isBot);
    let target = this.botsEnabled ? Math.max(0, this.minPlayers - this.humanCount) : 0;
    if (this.botsEnabled && this.isTeamMode) {
      // A party stacked on one side still gets a fair fight: bots fill the gap.
      const c = { 1: 0, 2: 0 };
      for (const p of this.players.values()) if (!p.isBot) c[p.team]++;
      target = Math.max(target, Math.abs(c[1] - c[2]));
    }
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
    if (!this.isTeamMode || this.isCoop) return;
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

  spawnWaveBot(wave) {
    const n = this.nextBotId++;
    const p = this.createPlayer(`wave-${n}`, {
      name: WAVE_BOT_NAMES[(n - 1) % WAVE_BOT_NAMES.length], color: '#8a8f99', hat: 2,
    }, true);
    p.hpMul = 1 + WAVES.hpPerWave * (wave - 1);
    p.dmgMul = 1 + WAVES.dmgPerWave * (wave - 1);
    p.hp = maxHp(p);
    return p;
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
    if (playing && this.waves) this.waves.tick(t);

    for (const p of this.players.values()) {
      if (p.isBot) {
        if (Room.active(p) && playing) {
          const intent = p.brain.think(p, this, dt);
          moveEntity(this.map, p, intent.mx, intent.my, dt, BOT_SPEED * speedMul(p), PLAYER_RADIUS);
          p.moveX = intent.mx; p.moveY = intent.my;
          p.angle = intent.aim;
          p.aimDist = intent.aimDist;
          p.fire = intent.fire;
          p.brain.preferWeapon(p);
          if (intent.ability) this.useAbility(p, t);
        } else p.fire = false;
        if (p.offer) this.pickSkill(p, Math.floor(this.rng() * p.offer.length), t);
      } else {
        for (let n = 0; n < MAX_INPUTS_PER_TICK && p.inputs.length; n++) this.applyInput(p, p.inputs.shift(), playing, t);
        if (p.offer && t >= p.offerDeadline) this.pickSkill(p, Math.floor(this.rng() * p.offer.length), t);
      }
      if (p.fire && Room.active(p) && playing) this.tryFire(p, t);
      this.regen(p, dt, t);
    }

    this.updateTurrets(t);
    this.updateProjectiles(dt, t);
    if (playing) this.updateDowned(dt, t);
    for (const p of this.players.values()) {
      if (p.remove) { this.players.delete(p.id); continue; }
      if (!p.alive && playing && t >= p.respawnAt) this.spawn(p);
      if (Room.active(p)) this.checkPickups(p, t);
    }
    for (const c of this.crates) if (c.hp <= 0 && t >= c.respawnAt) c.hp = CRATES.hp;
    this.loot = this.loot.filter((l) => l.expiresAt > t);
    if (playing && this.isCoop) this.checkWipe(t);
  }

  applyInput(p, input, playing, t) {
    p.lastSeq = input.seq;
    p.angle = input.aim;
    p.aimDist = input.aimDist;
    p.fire = input.fire;
    if (input.pick && p.offer) this.pickSkill(p, input.pick - 1, t);
    if (!Room.active(p) || !playing) return;
    p.moveX = input.mx; p.moveY = input.my;
    moveEntity(this.map, p, input.mx, input.my, INPUT_DT, playerSpeed(p), PLAYER_RADIUS);
    if (input.swap) this.swapWeapon(p);
    if (input.ability) this.useAbility(p, t);
  }

  swapWeapon(p) {
    if (p.special) p.weapon = p.weapon === 'pistol' ? p.special : 'pistol';
  }

  regen(p, dt, t) {
    const n = stacks(p, 'regen');
    if (!n || !Room.active(p) || t - p.lastHurtAt < SKILLS.regen.delayMs) return;
    p.hp = Math.min(maxHp(p), p.hp + SKILLS.regen.hps * n * dt);
  }

  tryFire(p, t) {
    const w = WEAPONS[p.weapon];
    if (!w || t < p.cooldownUntil) return;
    p.cooldownUntil = t + w.rate * fireRateMul(p) * 1000;
    p.shots++;
    this.stats.shot(p.weapon);
    const ox = p.x + Math.cos(p.angle) * 22;
    const oy = p.y + Math.sin(p.angle) * 22;
    const base = { ownerId: p.id, team: p.team, weapon: p.weapon, damage: w.dmg * (p.dmgMul || 1), x: ox, y: oy };
    const bullet = { ...base, kind: 'bullet', bounces: stacks(p, 'bounce'), pierce: stacks(p, 'pierce'), life: w.life };
    const every = boomEvery(p);
    if (every && p.shots % every === 0) Object.assign(bullet, { boom: true, radius: SKILLS.boom.rad, blastDmg: SKILLS.boom.dmg });

    if (w.pel) {
      const pellets = w.pel + (p.weapon === 'sg' ? stacks(p, 'pellets') * SKILLS.pellets.extra : 0);
      for (let i = 0; i < pellets; i++) {
        const a = p.angle + (this.rng() - 0.5) * w.sp * 2;
        const s = w.spd * (0.85 + this.rng() * 0.3);
        this.addProjectile({ ...bullet, boom: i === 0 && bullet.boom, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
      }
    } else if (w.grenade) {
      const d = Math.max(GRENADE_MIN_DIST, Math.min(GRENADE_MAX_DIST, p.aimDist));
      const s = d / GRENADE_THROW_TIME;
      this.addProjectile({ ...base, kind: 'grenade', vx: Math.cos(p.angle) * s, vy: Math.sin(p.angle) * s,
        moveLeft: GRENADE_THROW_TIME, fuse: w.fuse, radius: w.rad, life: w.fuse + 1 });
    } else if (w.rocket) {
      this.addProjectile({ ...base, kind: 'rocket', vx: Math.cos(p.angle) * w.spd, vy: Math.sin(p.angle) * w.spd, life: w.life, radius: w.rad });
    } else {
      const a = p.angle + (this.rng() - 0.5) * w.sp * 2;
      this.addProjectile({ ...bullet, vx: Math.cos(a) * w.spd, vy: Math.sin(a) * w.spd });
    }

    if (p.weapon !== 'pistol') {
      p.ammo--;
      if (p.ammo <= 0) { p.special = null; p.weapon = 'pistol'; p.ammo = 0; }
    }
  }

  addProjectile(pr) {
    pr.id = this.nextId++;
    if (pr.kind === 'bullet') pr.hitIds = new Set();
    this.projectiles.push(pr);
  }

  canDamage(target, pr) {
    if (!Room.active(target)) return false;
    if (this.isTeamMode && target.team === pr.team && target.id !== pr.ownerId) return false;
    return true;
  }

  /** A projectile reached the end of its flight: rockets and Finale bullets explode. */
  finish(pr, t) {
    if (pr.kind === 'rocket' || pr.boom) this.explode(pr, t);
    else pr.dead = true;
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
        const px = pr.x, py = pr.y;
        pr.x += (pr.vx * dt) / steps;
        pr.y += (pr.vy * dt) / steps;
        if (isSolidPoint(this.map, pr.x, pr.y)) {
          if (pr.bounces > 0) this.bounce(pr, px, py);
          else { this.finish(pr, t); break; }
          continue;
        }
        if (this.hitCrate(pr, t)) break;
        for (const target of this.players.values()) {
          if (target.id === pr.ownerId || !this.canDamage(target, pr) || pr.hitIds?.has(target.id)) continue;
          if (Math.hypot(target.x - pr.x, target.y - pr.y) >= PLAYER_RADIUS + 3) continue;
          if (pr.kind === 'rocket') { this.explode(pr, t); break; }
          pr.hitIds.add(target.id);
          this.damage(target, pr.damage, pr.ownerId, pr.weapon, t);
          if (pr.pierce > 0) { pr.pierce--; continue; }
          this.finish(pr, t);
          break;
        }
      }
      pr.life -= dt;
      if (pr.life <= 0 && !pr.dead) this.finish(pr, t);
    }
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
  }

  /** Reflect a bullet off the wall it just entered (Ricochet mod). */
  bounce(pr, px, py) {
    const hitX = isSolidPoint(this.map, pr.x, py), hitY = isSolidPoint(this.map, px, pr.y);
    if (hitX || !hitY) pr.vx = -pr.vx;
    if (hitY || !hitX) pr.vy = -pr.vy;
    pr.x = px; pr.y = py;
    pr.bounces--;
    pr.hitIds.clear();
  }

  /** Returns true when the projectile was stopped by a crate. */
  hitCrate(pr, t) {
    for (const c of this.crates) {
      if (c.hp <= 0 || Math.hypot(c.x - pr.x, c.y - pr.y) >= CRATE_RADIUS + 3) continue;
      if (pr.kind === 'rocket') { this.explode(pr, t); return true; }
      this.damageCrate(c, pr.damage, pr.ownerId, t);
      this.finish(pr, t);
      return true;
    }
    return false;
  }

  damageCrate(c, amount, attackerId, t) {
    if (c.hp <= 0) return;
    c.hp -= amount;
    if (c.hp > 0) return;
    c.hp = 0;
    c.respawnAt = t + CRATES.respawnMs;
    const breaker = this.players.get(attackerId);
    if (breaker) this.gainXp(breaker, XP.crate, t);
    const kind = this.rollDrop();
    const item = { id: this.nextId++, kind, x: c.x, y: c.y, expiresAt: t + CRATES.lootLifeMs };
    if (kind === 'weapon') item.weapon = LOOT_WEAPONS[Math.floor(this.rng() * LOOT_WEAPONS.length)];
    this.loot.push(item);
    this.onEvent('crate', { x: Math.round(c.x), y: Math.round(c.y), loot: kind });
  }

  rollDrop() {
    const entries = Object.entries(CRATES.drops);
    let r = this.rng() * entries.reduce((s, [, w]) => s + w, 0);
    for (const [kind, w] of entries) { r -= w; if (r < 0) return kind; }
    return entries[0][0];
  }

  explode(pr, t) {
    pr.dead = true;
    const dmgBase = pr.blastDmg ?? pr.damage;
    this.onEvent('explosion', { x: Math.round(pr.x), y: Math.round(pr.y), r: pr.radius });
    for (const target of this.players.values()) {
      if (!this.canDamage(target, pr)) continue;
      const d = Math.hypot(target.x - pr.x, target.y - pr.y);
      if (d > pr.radius) continue;
      let dmg = dmgBase * (1 - (d / pr.radius) * 0.6);
      if (target.id === pr.ownerId) dmg *= SELF_DAMAGE_FACTOR;
      this.damage(target, dmg, pr.ownerId, pr.weapon, t);
    }
    for (const c of this.crates) {
      if (Math.hypot(c.x - pr.x, c.y - pr.y) <= pr.radius) this.damageCrate(c, dmgBase, pr.ownerId, t);
    }
  }

  damage(target, amount, attackerId, weapon, t) {
    if (!Room.active(target) || this.round.state !== 'playing') return;
    const hit = { attackerId, targetId: target.id, x: Math.round(target.x), y: Math.round(target.y) };
    if (target.shieldUntil > t) { this.onEvent('hit', { ...hit, dmg: 0, blocked: 1 }); return; }
    const absorbed = Math.min(target.armor, amount);
    target.armor -= absorbed;
    const dealt = Math.min(target.hp, amount - absorbed) + absorbed;
    target.hp -= amount - absorbed;
    target.lastHurtAt = t;

    const attacker = this.players.get(attackerId);
    if (attacker && attacker !== target && !(this.isTeamMode && attacker.team === target.team)) {
      target.damagedBy.set(attackerId, t);
      attacker.roundDamage[weapon] = (attacker.roundDamage[weapon] || 0) + dealt;
      this.stats.damage(weapon, dealt, attacker.skills);
      this.gainXp(attacker, dealt * XP.perDamage, t);
      const steal = stacks(attacker, 'vamp') * SKILLS.vamp.steal;
      if (steal && Room.active(attacker)) attacker.hp = Math.min(maxHp(attacker), attacker.hp + dealt * steal);
    }
    this.onEvent('hit', { ...hit, dmg: Math.round(amount) });
    if (target.hp > 0) return;

    target.hp = 0;
    // Enemy bots in co-op just die; everyone else on a team can be revived.
    if (this.modeDef.revives && !(this.isCoop && target.isBot)) this.down(target, attackerId, weapon, t);
    else this.kill(target, attackerId, weapon, t);
  }

  /** Team modes: a lethal hit knocks the player down so a teammate can revive them. */
  down(target, attackerId, weapon, t) {
    Object.assign(target, { downed: true, downedUntil: t + REVIVE.downedMs, downedBy: { attackerId, weapon },
      reviveMs: 0, fire: false });
    this.onEvent('downed', { victimId: target.id, victimName: target.name, attackerId });
  }

  updateDowned(dt, t) {
    for (const p of this.players.values()) {
      if (!p.downed) continue;
      const helper = [...this.players.values()].find((o) => o !== p && o.team === p.team && Room.active(o)
        && Math.hypot(o.x - p.x, o.y - p.y) <= REVIVE.radius);
      p.reviveMs = helper ? p.reviveMs + dt * 1000 : 0;
      if (p.reviveMs >= REVIVE.reviveMs) {
        Object.assign(p, { downed: false, reviveMs: 0, hp: maxHp(p) * REVIVE.hpFraction, lastHurtAt: t });
        this.onEvent('revived', { playerId: p.id, name: p.name, byId: helper.id, byName: helper.name });
      } else if (t >= p.downedUntil) {
        p.downed = false;
        this.kill(p, p.downedBy?.attackerId, p.downedBy?.weapon, t);
      }
    }
  }

  kill(target, attackerId, weapon, t) {
    Object.assign(target, { hp: 0, alive: false, downed: false, special: null, weapon: 'pistol', ammo: 0,
      lastKiller: attackerId, respawnAt: this.isCoop && !target.isBot ? Infinity : t + RESPAWN_MS });
    target.deaths++;
    if (this.isCoop && target.isBot) target.remove = true;
    const killer = this.players.get(attackerId);
    const enemyKill = killer && killer !== target && !(this.isTeamMode && killer.team === target.team);
    if (enemyKill) {
      killer.kills++;
      if (this.isTeamMode && !this.isCoop) this.teamScores[killer.team]++;
      this.gainXp(killer, XP.kill, t);
      this.stats.kill(weapon, killer.skills);
    }
    for (const [id, at] of target.damagedBy) {
      const helper = this.players.get(id);
      if (helper && helper !== killer && t - at <= XP.assistWindowMs) this.gainXp(helper, XP.assist, t);
    }
    target.damagedBy.clear();
    this.onEvent('kill', {
      killerId: attackerId, killerName: killer ? killer.name : 'someone',
      victimId: target.id, victimName: target.name, weapon, self: killer === target,
    });
    if (!this.isCoop && this.leaderScore() >= this.modeDef.scoreLimit) this.endRound(t);
  }

  /** Co-op ends when every human is dead or downed. */
  checkWipe(t) {
    const humans = [...this.players.values()].filter((p) => !p.isBot);
    if (humans.length && humans.every((p) => !Room.active(p))) this.endRound(t);
  }

  /* ------------------------------------------------------- xp / skills */

  gainXp(p, amount, t) {
    if (p.level >= XP.maxLevel) return;
    p.xp += amount;
    while (p.level < XP.maxLevel && p.xp >= XP.toNext(p.level)) {
      p.xp -= XP.toNext(p.level);
      p.level++;
      p.drafts++;
      this.onEvent('levelUp', { playerId: p.id, level: p.level });
    }
    if (p.level >= XP.maxLevel) p.xp = 0;
    this.nextOffer(p, t);
  }

  nextOffer(p, t) {
    if (p.offer || p.drafts <= 0) return;
    const offer = makeOffer(p, this.rng);
    if (!offer.length) { p.drafts = 0; return; }
    p.offer = offer;
    p.offerDeadline = t + DRAFT.autoPickMs;
    this.stats.offer(offer);
  }

  pickSkill(p, index, t) {
    const id = p.offer?.[index];
    if (!id) return false;
    applySkill(p, id);
    this.stats.pick(id);
    p.offer = null;
    p.drafts--;
    this.onEvent('skill', { playerId: p.id, skill: id });
    this.nextOffer(p, t);
    return true;
  }

  useAbility(p, t) {
    if (!p.active || t < p.activeReadyAt || !Room.active(p)) return false;
    const def = SKILLS[p.active];
    if (p.active === 'dash') {
      let dx = p.moveX, dy = p.moveY;
      if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); }
      for (let i = 0; i < def.dist / 10; i++) moveEntity(this.map, p, dx, dy, 1, 10, PLAYER_RADIUS);
    } else if (p.active === 'blink') {
      const ux = Math.cos(p.angle), uy = Math.sin(p.angle);
      for (let d = 8; d <= def.dist; d += 8) {
        const x = p.x + ux * 8, y = p.y + uy * 8;
        if (circleHitsWall(this.map, x, y, PLAYER_RADIUS)) break;
        p.x = x; p.y = y;
      }
    } else if (p.active === 'shield') p.shieldUntil = t + def.ms;
    else if (p.active === 'heal') p.hp = Math.min(maxHp(p), p.hp + def.amount);
    else if (p.active === 'turret') {
      this.turrets.push({ id: this.nextId++, ownerId: p.id, team: p.team, x: p.x, y: p.y, angle: p.angle, until: t + def.ms, nextShot: t });
    }
    p.activeReadyAt = t + activeCooldown(p);
    this.onEvent('ability', { playerId: p.id, skill: p.active, x: Math.round(p.x), y: Math.round(p.y) });
    return true;
  }

  updateTurrets(t) {
    const def = SKILLS.turret;
    this.turrets = this.turrets.filter((tu) => tu.until > t && this.players.has(tu.ownerId));
    for (const tu of this.turrets) {
      const target = this.nearestEnemyOf(tu, tu.team, (e, d) => d <= def.range && hasLineOfSight(this.map, tu, e));
      if (!target) continue;
      tu.angle = Math.atan2(target.y - tu.y, target.x - tu.x);
      if (t < tu.nextShot || this.round.state !== 'playing') continue;
      tu.nextShot = t + def.rate * 1000;
      this.addProjectile({ ownerId: tu.ownerId, team: tu.team, weapon: 'turret', damage: def.dmg, kind: 'bullet',
        x: tu.x + Math.cos(tu.angle) * 16, y: tu.y + Math.sin(tu.angle) * 16,
        vx: Math.cos(tu.angle) * 900, vy: Math.sin(tu.angle) * 900, life: def.range / 900, bounces: 0, pierce: 0 });
    }
  }

  /* ------------------------------------------------------------ pickups */

  checkPickups(p, t) {
    this.pickups.forEach((pk, index) => {
      if (pk.respawnAt > t) return;
      if (Math.hypot(p.x - pk.x, p.y - pk.y) > PICKUP_RADIUS) return;
      if (!this.giveWeapon(p, pk.weapon)) return;
      pk.respawnAt = t + PICKUP_RESPAWN_MS;
      this.onEvent('pickup', { playerId: p.id, weapon: pk.weapon, index });
    });
    for (const l of this.loot) {
      if (l.taken || Math.hypot(p.x - l.x, p.y - l.y) > PICKUP_RADIUS) continue;
      let ok = true;
      if (l.kind === 'weapon') ok = this.giveWeapon(p, l.weapon);
      else if (l.kind === 'orb') this.gainXp(p, XP.orb, t);
      else if (l.kind === 'health') { ok = p.hp < maxHp(p); if (ok) p.hp = Math.min(maxHp(p), p.hp + CRATES.health); }
      else if (l.kind === 'armor') { ok = p.armor < CRATES.maxArmor; if (ok) p.armor = Math.min(CRATES.maxArmor, p.armor + CRATES.armor); }
      if (!ok) continue;
      l.taken = true;
      l.expiresAt = 0;
      this.onEvent('loot', { playerId: p.id, kind: l.kind, weapon: l.weapon });
    }
  }

  giveWeapon(p, weapon) {
    const mag = Math.round(WEAPONS[weapon].mag * (1 + stacks(p, 'bigmag') * SKILLS.bigmag.mag));
    if (p.special === weapon && p.ammo >= mag) return false;
    Object.assign(p, { special: weapon, ammo: mag, weapon });
    this.stats.pickup(weapon);
    return true;
  }

  nearestEnemyOf(pos, team, accept = () => true) {
    let best = null, bestD = Infinity;
    for (const o of this.players.values()) {
      if (o === pos || !Room.active(o) || (this.isTeamMode && o.team === team)) continue;
      const d = Math.hypot(o.x - pos.x, o.y - pos.y);
      if (d < bestD && accept(o, d)) { bestD = d; best = o; }
    }
    return best;
  }

  nearestEnemy(p) { return this.nearestEnemyOf(p, p.team); }

  /** A downed teammate within maxDist, for bots that go and revive. */
  downedTeammate(p, maxDist) {
    for (const o of this.players.values()) {
      if (o !== p && o.downed && o.team === p.team && Math.hypot(o.x - p.x, o.y - p.y) < maxDist) return o;
    }
    return null;
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
    Object.assign(p, { x: best.x, y: best.y, alive: true, downed: false, reviveMs: 0, weapon: 'pistol', special: null, ammo: 0, armor: 0 });
    p.hp = maxHp(p);
  }

  /* ------------------------------------------------------------ rounds */

  leaderScore() {
    if (this.isTeamMode) return Math.max(this.teamScores[1], this.teamScores[2]);
    let max = 0;
    for (const p of this.players.values()) max = Math.max(max, p.kills);
    return max;
  }

  winnerLabel() {
    if (this.isCoop) {
      const n = this.waves.survived;
      return `Survived ${n} wave${n === 1 ? '' : 's'}`;
    }
    if (this.isTeamMode) {
      const [r, b] = [this.teamScores[1], this.teamScores[2]];
      return r === b ? 'Draw' : r > b ? 'Red team' : 'Blue team';
    }
    let best = null;
    for (const p of this.players.values()) if (!best || p.kills > best.kills) best = p;
    return best ? best.name : 'Nobody';
  }

  /** Who won, for balance stats. undefined = no winner (co-op or draw). */
  didWin(p) {
    if (this.isCoop) return undefined;
    if (this.isTeamMode) {
      const [r, b] = [this.teamScores[1], this.teamScores[2]];
      return r === b ? undefined : p.team === (r > b ? 1 : 2);
    }
    return p.name === this.round.winner;
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
    this.stats.roundEnd([...this.players.values()].map((p) => {
      const main = Object.entries(p.roundDamage).sort((a, b) => b[1] - a[1])[0];
      return { skills: p.skills, mainWeapon: main && main[0], won: this.didWin(p) };
    }));
    this.onEvent('roundEnd', { number: this.round.number, winner: this.round.winner, waves: this.waves ? this.waves.survived : undefined });
  }

  startRound(t) {
    this.round = { number: this.round.number + 1, state: 'playing', endsAt: this.isCoop ? Infinity : t + ROUND_MS, stateEndsAt: 0, winner: null };
    this.teamScores = { 1: 0, 2: 0 };
    this.projectiles = [];
    this.turrets = [];
    this.loot = [];
    for (const pk of this.pickups) pk.respawnAt = 0;
    for (const c of this.crates) c.hp = CRATES.hp;
    if (this.isCoop) {
      for (const p of [...this.players.values()]) if (p.isBot) this.players.delete(p.id);
      this.waves.reset(t);
    }
    for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; p.alive = false; this.resetProgress(p); }
    for (const p of this.players.values()) this.spawn(p);
    this.onEvent('roundStart', { number: this.round.number });
  }

  /* --------------------------------------------------------- snapshots */

  /** Everything a client needs to draw one frame. Same for every client except `ack` and `me`. */
  buildSnapshot() {
    const t = this.now();
    const r = (v) => Math.round(v * 10) / 10;
    const until = this.round.state === 'playing' ? this.round.endsAt : this.round.stateEndsAt;
    const w = this.waves;
    return {
      t,
      round: {
        n: this.round.number,
        s: this.round.state,
        tl: Number.isFinite(until) ? Math.max(0, Math.ceil((until - t) / 1000)) : 0,
        w: this.round.winner,
      },
      ts: [this.teamScores[1], this.teamScores[2]],
      pk: this.pickups.map((pk) => (pk.respawnAt <= t ? '1' : '0')).join(''),
      cr: this.crates.map((c) => (c.hp > 0 ? '1' : '0')).join(''),
      lo: this.loot.map((l) => ({ i: l.id, k: l.kind[0], x: l.x, y: l.y, w: l.weapon })),
      tu: this.turrets.map((tu) => ({ i: tu.id, x: r(tu.x), y: r(tu.y), a: Math.round(tu.angle * 100) / 100, t: tu.team })),
      wv: w ? { n: w.number, s: w.state, left: w.botsLeft, nx: w.state === 'break' ? Math.max(0, Math.ceil((w.nextAt - t) / 1000)) : 0 } : undefined,
      pl: [...this.players.values()].map((p) => ({
        i: p.id, n: p.name, c: p.color, h: p.hat, t: p.team, b: p.isBot ? 1 : 0,
        x: r(p.x), y: r(p.y), a: Math.round(p.angle * 100) / 100,
        hp: Math.ceil(p.hp), mh: Math.round(maxHp(p)), ar: Math.ceil(p.armor), lv: p.level,
        al: p.alive ? 1 : 0, w: p.weapon, sp: p.special, am: p.ammo,
        dn: p.downed ? 1 : 0, dl: p.downed ? Math.max(0, p.downedUntil - t) : 0, rv: p.downed ? Math.round((p.reviveMs / REVIVE.reviveMs) * 100) : 0,
        sh: p.shieldUntil > t ? 1 : 0,
        k: p.kills, d: p.deaths, lk: p.lastKiller, rs: p.alive || !Number.isFinite(p.respawnAt) ? 0 : Math.max(0, p.respawnAt - t),
      })),
      pr: this.projectiles.map((pr) => ({ i: pr.id, k: pr.kind[0], o: pr.ownerId, x: r(pr.x), y: r(pr.y), vx: Math.round(pr.vx), vy: Math.round(pr.vy), f: pr.fuse ? r(pr.fuse) : undefined })),
    };
  }

  /** Data only the player themself sees: XP, the skill draft and their ability cooldown. */
  privateState(id) {
    const p = this.players.get(id);
    if (!p) return null;
    const t = this.now();
    return {
      xp: Math.floor(p.xp), xn: p.level >= XP.maxLevel ? 0 : XP.toNext(p.level), lv: p.level,
      of: p.offer, ot: p.offer ? Math.max(0, p.offerDeadline - t) : 0,
      sk: p.skills, ac: p.active, acd: p.active ? Math.max(0, p.activeReadyAt - t) : 0,
      spd: Math.round(speedMul(p) * 1000) / 1000,
    };
  }

  summary() {
    return { code: this.code, mode: this.mode, map: this.mapKey, players: this.humanCount, bots: this.players.size - this.humanCount, max: MAX_PLAYERS };
  }
}
