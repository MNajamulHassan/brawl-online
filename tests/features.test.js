import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game/Room.js';
import { RoomManager } from '../server/game/RoomManager.js';
import { BalanceStats } from '../server/game/BalanceStats.js';
import { WaveDirector } from '../server/game/WaveDirector.js';
import { makeOffer, maxHp } from '../server/game/Skills.js';
import { isAdmin } from '../server/adminAuth.js';
import { parseInput } from '../server/game/validation.js';
import { buildMap } from '../shared/maps.js';
import { XP, SKILLS, DRAFT, CRATES, REVIVE, WAVES, WEAPONS } from '../shared/balance.js';
import { PLAYER_SPEED, INPUT_DT, ROUND_END_MS } from '../shared/constants.js';

const DT = 1 / 30;
const profile = (name) => ({ name, color: '#f5c542', hat: 0 });

function makeRoom(opts = {}) {
  let t = 1_000_000;
  let seed = 42;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const events = [];
  const room = new Room({ code: 'test1', rng, now: () => t, onEvent: (type, p) => events.push({ type, ...p }), ...opts });
  const run = (ms) => { for (let i = 0; i < ms / 33; i++) { t += 33; room.tick(DT); } };
  return { room, events, advance: (ms) => { t += ms; }, now: () => t, run };
}

function duel(room) {
  const a = room.addHuman('a', profile('Alice'));
  const b = room.addHuman('b', profile('Bob'));
  Object.assign(a, { x: 300, y: 984, angle: 0 });
  Object.assign(b, { x: 450, y: 984 });
  return { a, b };
}

const input = (seq, extra = {}) => ({ seq, mx: 0, my: 0, aim: 0, aimDist: 300, fire: false, swap: false, ability: false, pick: 0, ...extra });

/* ---------------------------------------------------------------- XP */

test('kills give XP and reaching the threshold levels up with a 3-card draft', () => {
  const { room, events, now } = makeRoom();
  const { a } = duel(room);
  room.gainXp(a, XP.toNext(1), now());
  assert.equal(a.level, 2);
  assert.equal(a.offer.length, DRAFT.choices);
  assert.equal(new Set(a.offer).size, DRAFT.choices, 'cards are distinct');
  assert.ok(events.some((e) => e.type === 'levelUp' && e.playerId === 'a'));
});

test('damage, kills and assists all award XP', () => {
  const { room, now } = makeRoom();
  const { a, b } = duel(room);
  const c = room.addHuman('c', profile('Cy'));
  room.damage(b, 30, 'c', 'pistol', now());
  assert.equal(c.xp, 30 * XP.perDamage);
  room.damage(b, 200, 'a', 'pistol', now());
  assert.equal(b.alive, false);
  assert.equal(c.level, 1);
  assert.equal(c.xp, 30 * XP.perDamage + XP.assist, 'assist XP');
  // a: damage XP for the 70 HP actually dealt + the kill
  const total = 70 * XP.perDamage + XP.kill;
  assert.equal(a.level, total >= XP.toNext(1) ? 2 : 1);
});

test('pressing 1/2/3 picks a card and the skill applies', () => {
  const { room, now } = makeRoom();
  const { a } = duel(room);
  room.gainXp(a, XP.toNext(1), now());
  const chosen = a.offer[1];
  room.queueInput('a', input(1, { pick: 2 }));
  room.tick(DT);
  assert.equal(a.skills[chosen], 1);
  assert.equal(a.offer, null);
});

test('the draft auto-picks after 5 seconds', () => {
  const { room, now, advance } = makeRoom();
  const { a } = duel(room);
  room.gainXp(a, XP.toNext(1), now());
  advance(DRAFT.autoPickMs + 1);
  room.tick(DT);
  assert.equal(a.offer, null);
  assert.equal(Object.values(a.skills).reduce((s, n) => s + n, 0), 1);
});

test('several level-ups queue one draft each', () => {
  const { room, now } = makeRoom();
  const { a } = duel(room);
  room.gainXp(a, XP.toNext(1) + XP.toNext(2), now());
  assert.equal(a.level, 3);
  room.pickSkill(a, 0, now());
  assert.ok(a.offer, 'second draft appears after the first pick');
  room.pickSkill(a, 0, now());
  assert.equal(a.offer, null);
});

test('skills stack, never exceed their max, and are never offered when maxed', () => {
  const { room } = makeRoom();
  const { a } = duel(room);
  a.skills.swift = SKILLS.swift.max;
  for (let i = 0; i < 50; i++) assert.ok(!makeOffer(a, Math.random).includes('swift'));
});

test('skills survive death but reset with the round', () => {
  const { room, now, advance } = makeRoom();
  const { a, b } = duel(room);
  b.skills.tough = 2; b.level = 4;
  room.damage(b, 1000, 'a', 'pistol', now());
  advance(4000); room.tick(DT);
  assert.equal(b.alive, true);
  assert.equal(b.skills.tough, 2);
  assert.equal(b.hp, maxHp(b), 'respawns with the boosted max HP');
  room.endRound(now()); advance(ROUND_END_MS); room.tick(DT);
  assert.deepEqual(b.skills, {});
  assert.equal(b.level, 1);
});

test('passives: swift moves faster, tough raises max HP, life steal heals', () => {
  const { room, now } = makeRoom();
  const { a, b } = duel(room);
  a.skills.swift = 1;
  Object.assign(a, { x: 300, y: 250 });
  room.queueInput('a', input(1, { mx: 1 }));
  room.tick(DT);
  assert.ok(Math.abs(a.x - (300 + PLAYER_SPEED * 1.1 * INPUT_DT)) < 1e-6);
  a.skills.tough = 1;
  assert.equal(maxHp(a), 120);
  a.skills.vamp = 1; a.hp = 50;
  room.damage(b, 40, 'a', 'pistol', now());
  assert.equal(a.hp, 50 + 40 * SKILLS.vamp.steal);
});

test('mods: piercing bullets hit two targets in a line', () => {
  const { room, events, run } = makeRoom();
  const { a } = duel(room);
  const c = room.addHuman('c', profile('Cy'));
  Object.assign(c, { x: 520, y: 984 });
  a.skills.pierce = 1; a.fire = true;
  room.tick(DT); a.fire = false;
  run(500);
  const hitIds = new Set(events.filter((e) => e.type === 'hit').map((e) => e.targetId));
  assert.ok(hitIds.has('b') && hitIds.has('c'));
});

test('mods: ricochet bullets bounce off walls instead of vanishing', () => {
  const { room } = makeRoom();
  const p = room.addHuman('a', profile('A'));
  Object.assign(p, { x: 72, y: 984, angle: Math.PI, fire: true });
  p.skills.bounce = 1;
  room.tick(DT); p.fire = false;
  for (let i = 0; i < 4; i++) room.tick(DT);
  assert.equal(room.projectiles.length, 1);
  assert.ok(room.projectiles[0].vx > 0, 'heading back out after the bounce');
});

test('mods: buckshot adds shotgun pellets, Finale makes the Nth shot explode', () => {
  const { room, events, now, advance } = makeRoom();
  const p = room.addHuman('a', profile('A'));
  Object.assign(p, { x: 300, y: 984, weapon: 'sg', special: 'sg', ammo: 6 });
  p.skills.pellets = 1;
  room.tryFire(p, now());
  assert.equal(room.projectiles.length, WEAPONS.sg.pel + SKILLS.pellets.extra);
  room.projectiles = [];
  Object.assign(p, { weapon: 'pistol', special: null, shots: 0, cooldownUntil: 0 });
  p.skills.boom = 1;
  for (let i = 0; i < SKILLS.boom.every; i++) { room.tryFire(p, now()); advance(1000); }
  assert.equal(room.projectiles.filter((pr) => pr.boom).length, 1);
  for (let i = 0; i < 40; i++) room.tick(DT);
  assert.ok(events.some((e) => e.type === 'explosion'));
});

test('actives: E uses the skill and starts its cooldown', () => {
  const { room, now } = makeRoom();
  const { a, b } = duel(room);
  room.gainXp(a, 0, now());
  a.skills.heal = 1; a.active = 'heal'; a.hp = 30;
  room.queueInput('a', input(1, { ability: true }));
  room.tick(DT);
  assert.equal(a.hp, 30 + SKILLS.heal.amount);
  assert.ok(a.activeReadyAt > now());
  room.queueInput('a', input(2, { ability: true }));
  room.tick(DT);
  assert.equal(a.hp, 30 + SKILLS.heal.amount, 'still on cooldown');

  a.skills.shield = 1; a.active = 'shield'; a.activeReadyAt = 0;
  room.useAbility(a, now());
  room.damage(a, 50, 'b', 'pistol', now());
  assert.equal(a.hp, 30 + SKILLS.heal.amount, 'shield blocks damage');
  assert.ok(b);
});

test('actives: dash and blink move the player, turret shoots enemies', () => {
  const { room, events, now, run } = makeRoom();
  const { a } = duel(room);
  a.skills.dash = 1; a.active = 'dash'; a.moveX = 1; a.moveY = 0;
  const x0 = a.x;
  room.useAbility(a, now());
  assert.ok(a.x - x0 > 100);
  a.skills.blink = 1; a.active = 'blink'; a.activeReadyAt = 0; a.angle = Math.PI;
  const x1 = a.x;
  room.useAbility(a, now());
  assert.ok(x1 - a.x > 100);
  a.skills.turret = 1; a.active = 'turret'; a.activeReadyAt = 0;
  Object.assign(a, { x: 300, y: 984 });
  room.useAbility(a, now());
  Object.assign(a, { x: 100, y: 250 }); // walk away; the turret keeps shooting
  run(1000);
  assert.ok(events.some((e) => e.type === 'hit' && e.attackerId === 'a' && e.targetId === 'b'));
});

/* ----------------------------------------------------------- revives */

test('team deathmatch: lethal damage downs the player instead of killing', () => {
  const { room, events, now } = makeRoom({ mode: 'tdm' });
  const { a, b } = duel(room);
  b.team = a.team === 1 ? 2 : 1;
  room.damage(b, 500, 'a', 'pistol', now());
  assert.equal(b.alive, true);
  assert.equal(b.downed, true);
  assert.equal(a.kills, 0, 'no kill yet');
  assert.ok(events.some((e) => e.type === 'downed'));
  room.damage(b, 50, 'a', 'pistol', now());
  assert.equal(b.downed, true, 'downed players cannot be hit again');
});

test('a teammate standing close for 3 s revives at 50% HP', () => {
  const { room, events, now, run } = makeRoom({ mode: 'tdm' });
  const { a, b } = duel(room);
  const mate = room.addHuman('m', profile('Mate'));
  b.team = 1; mate.team = 1; a.team = 2;
  room.damage(b, 500, 'a', 'pistol', now());
  Object.assign(a, { x: 1400, y: 250 });
  Object.assign(mate, { x: b.x + 20, y: b.y });
  run(REVIVE.reviveMs + 200);
  assert.equal(b.downed, false);
  assert.equal(b.hp, maxHp(b) * REVIVE.hpFraction);
  assert.ok(events.some((e) => e.type === 'revived' && e.byId === 'm'));
});

test('no revive in time: the player dies and the enemy gets the kill', () => {
  const { room, now, run } = makeRoom({ mode: 'tdm' });
  const { a, b } = duel(room);
  b.team = 1; a.team = 2;
  room.damage(b, 500, 'a', 'pistol', now());
  Object.assign(a, { x: 1400, y: 250 });
  run(REVIVE.downedMs + 200);
  assert.equal(b.alive, false);
  assert.equal(a.kills, 1);
  assert.equal(room.teamScores[2], 1);
});

test('deathmatch has no downed state', () => {
  const { room, now } = makeRoom();
  const { b } = duel(room);
  room.damage(b, 500, 'a', 'pistol', now());
  assert.equal(b.alive, false);
  assert.equal(b.downed, false);
});

/* ------------------------------------------------------------ crates */

test('maps have crate spawns', () => {
  for (const key of ['field', 'streets']) assert.ok(buildMap(key).crates.length >= 4, key);
});

test('crates break, award XP, drop loot and respawn on a timer', () => {
  const { room, events, now, advance } = makeRoom();
  const p = room.addHuman('a', profile('A'));
  const c = room.crates[0];
  room.damageCrate(c, CRATES.hp, 'a', now());
  assert.equal(c.hp, 0);
  assert.equal(p.xp, XP.crate);
  assert.equal(room.loot.length, 1);
  assert.ok(events.some((e) => e.type === 'crate'));
  advance(CRATES.respawnMs);
  room.tick(DT);
  assert.equal(c.hp, CRATES.hp);
});

test('bullets break crates', () => {
  const { room } = makeRoom();
  const p = room.addHuman('a', profile('A'));
  const c = room.crates[0];
  c.hp = 1;
  Object.assign(p, { x: c.x - 80, y: c.y, angle: 0, fire: true });
  room.tick(DT); p.fire = false;
  for (let i = 0; i < 10; i++) room.tick(DT);
  assert.equal(c.hp, 0);
});

test('loot: health heals, armor absorbs damage first, orbs give XP, weapons equip', () => {
  const { room, now } = makeRoom();
  const p = room.addHuman('a', profile('A'));
  const drop = (kind, extra = {}) => room.loot.push({ id: room.nextId++, kind, x: p.x, y: p.y, expiresAt: now() + 1000, ...extra });
  p.hp = 30; drop('health'); room.tick(DT);
  assert.equal(p.hp, 30 + CRATES.health);
  drop('armor'); room.tick(DT);
  assert.equal(p.armor, CRATES.armor);
  room.damage(p, 20, 'x', 'pistol', now());
  assert.equal(p.armor, CRATES.armor - 20);
  assert.equal(p.hp, 30 + CRATES.health);
  drop('orb'); room.tick(DT);
  assert.equal(p.xp, XP.orb);
  drop('weapon', { weapon: 'sg' }); room.tick(DT);
  assert.equal(p.special, 'sg');
  assert.equal(room.loot.length, 0);
});

test('Big mags gives more ammo from pickups', () => {
  const { room } = makeRoom();
  const p = room.addHuman('a', profile('A'));
  p.skills.bigmag = 1;
  room.giveWeapon(p, 'ar');
  assert.equal(p.ammo, Math.round(WEAPONS.ar.mag * 1.5));
});

/* ------------------------------------------------------------- party */

test('friends joining by code in team deathmatch land on the host team', () => {
  const m = new RoomManager();
  const { room } = m.createAndJoin('host', profile('H'), { mode: 'tdm', map: 'field', visibility: 'private', bots: true });
  const hostTeam = room.players.get('host').team;
  for (const id of ['f1', 'f2', 'f3']) m.join(room.code, id, profile(id));
  for (const id of ['f1', 'f2', 'f3']) assert.equal(room.players.get(id).team, hostTeam, id);
  const c = { 1: 0, 2: 0 };
  for (const p of room.players.values()) c[p.team]++;
  assert.ok(Math.abs(c[1] - c[2]) <= 1, 'bots balance the other side');
});

test('a full party side sends extra friends to the other team', () => {
  const m = new RoomManager();
  const { room } = m.createAndJoin('host', profile('H'), { mode: 'tdm', map: 'field', visibility: 'private', bots: false });
  for (let i = 0; i < 6; i++) m.join(room.code, `f${i}`, profile(`F${i}`));
  const c = { 1: 0, 2: 0 };
  for (const p of room.players.values()) c[p.team]++;
  assert.equal(Math.max(c[1], c[2]), 5);
});

/* ------------------------------------------------------------- waves */

test('bot waves: all humans on one team, waves spawn after a break', () => {
  const { room, events, advance } = makeRoom({ mode: 'waves' });
  const a = room.addHuman('a', profile('A'));
  const b = room.addHuman('b', profile('B'));
  assert.equal(a.team, b.team);
  assert.equal(room.players.size, 2, 'no filler bots');
  advance(WAVES.breakMs); room.tick(DT);
  assert.ok(events.some((e) => e.type === 'waveStart' && e.number === 1));
  for (let i = 0; i < 100; i++) { advance(WAVES.spawnEveryMs); room.tick(DT); if (room.waves.toSpawn === 0) break; }
  const bots = [...room.players.values()].filter((p) => p.isBot);
  assert.equal(bots.length, WaveDirector.sizeOf(1));
  assert.ok(bots.every((bot) => bot.team !== a.team));
});

test('bot waves: clearing a wave starts the next, tougher one', () => {
  const { room, events, advance, now } = makeRoom({ mode: 'waves' });
  room.addHuman('a', profile('A'));
  advance(WAVES.breakMs); room.tick(DT);
  room.waves.toSpawn = 0;
  for (const p of [...room.players.values()]) if (p.isBot) room.players.delete(p.id);
  room.tick(DT);
  assert.ok(events.some((e) => e.type === 'waveClear' && e.number === 1));
  advance(WAVES.breakMs); room.tick(DT);
  assert.equal(room.waves.number, 2);
  const bot = room.spawnWaveBot(2);
  assert.equal(bot.hp, 100 * (1 + WAVES.hpPerWave));
  assert.equal(bot.dmgMul, 1 + WAVES.dmgPerWave);
  room.damage(bot, 1000, 'a', 'pistol', now());
  room.tick(DT);
  assert.equal(room.players.has(bot.id), false, 'dead wave bots are removed');
});

test('bot waves: the run ends when every human is down; score = waves cleared', () => {
  const { room, events, advance, now } = makeRoom({ mode: 'waves' });
  const a = room.addHuman('a', profile('A'));
  Object.assign(room.waves, { number: 3, state: 'fighting', toSpawn: 5, nextSpawnAt: Infinity });
  room.damage(a, 1000, 'bot', 'pistol', now());
  room.tick(DT);
  assert.equal(room.round.state, 'ended');
  const end = events.find((e) => e.type === 'roundEnd');
  assert.equal(end.waves, 2);
  advance(ROUND_END_MS); room.tick(DT);
  assert.equal(room.waves.number, 0);
  assert.equal(a.alive, true);
});

/* --------------------------------------------------------- balancing */

test('balance stats count shots, damage, kills, picks and win rate', () => {
  const stats = new BalanceStats();
  const { room, now } = makeRoom({ stats });
  const { a, b } = duel(room);
  a.skills.swift = 1; a.level = XP.maxLevel; // no level-up drafts muddying the pick counts
  room.tryFire(a, now());
  room.damage(b, 500, 'a', 'pistol', now());
  stats.offer(['swift', 'tough']); stats.pick('swift');
  a.kills = 15; room.endRound(now());
  const s = stats.summary();
  assert.equal(s.weapons.pistol.shots, 1);
  assert.equal(s.weapons.pistol.kills, 1);
  assert.equal(s.weapons.pistol.damage, 100);
  assert.equal(s.skills.swift.pickRate, 100);
  assert.equal(s.skills.tough.pickRate, 0);
  assert.equal(s.skills.swift.winRate, 100);
  assert.equal(s.rounds, 1);
});

test('all rooms share one stats instance', () => {
  const m = new RoomManager();
  const r1 = m.createRoom({ mode: 'dm', map: 'field', visibility: 'public' }).room;
  const r2 = m.createRoom({ mode: 'tdm', map: 'streets', visibility: 'public' }).room;
  assert.equal(r1.stats, m.balance);
  assert.equal(r2.stats, m.balance);
});

test('admin check needs the exact bearer token and is off without one', () => {
  assert.equal(isAdmin('Bearer secret', 'secret'), true);
  assert.equal(isAdmin('Bearer wrong', 'secret'), false);
  assert.equal(isAdmin('secret', 'secret'), false);
  assert.equal(isAdmin(undefined, 'secret'), false);
  assert.equal(isAdmin('Bearer ', ''), false);
});

test('input validation accepts skill picks 1-3 and the ability flag only', () => {
  assert.equal(parseInput(input(1, { pick: 2, ability: true })).pick, 2);
  assert.equal(parseInput(input(1, { ability: true })).ability, true);
  assert.equal(parseInput(input(1, { pick: 9 })).pick, 0);
  assert.equal(parseInput(input(1, { pick: '1' })).pick, 0);
  assert.equal(parseInput(input(1, { ability: 'yes' })).ability, false);
});

test('private state carries the draft; the shared snapshot does not', () => {
  const { room, now } = makeRoom();
  const { a } = duel(room);
  room.gainXp(a, XP.toNext(1), now());
  const priv = room.privateState('a');
  assert.deepEqual(priv.of, a.offer);
  assert.equal(priv.lv, 2);
  assert.ok(!JSON.stringify(room.buildSnapshot()).includes('"of"'));
});
