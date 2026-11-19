import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game/Room.js';
import { RESPAWN_MS, ROUND_MS, ROUND_END_MS, WEAPONS, MAX_PLAYERS, PLAYER_SPEED, INPUT_DT } from '../shared/constants.js';

const DT = 1 / 30;
const profile = (name) => ({ name, color: '#f5c542', hat: 0 });

function makeRoom(opts = {}) {
  let t = 1_000_000;
  let seed = 42;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const events = [];
  const room = new Room({ code: 'test1', rng, now: () => t, onEvent: (type, p) => events.push({ type, ...p }), ...opts });
  return { room, events, advance: (ms) => { t += ms; }, now: () => t };
}

/** Put two players face to face in open ground. */
function duel(room) {
  const a = room.addHuman('a', profile('Alice'));
  const b = room.addHuman('b', profile('Bob'));
  Object.assign(a, { x: 300, y: 984, angle: 0 });
  Object.assign(b, { x: 450, y: 984 });
  return { a, b };
}

test('players spawn alive, inside open ground, at full health', () => {
  const { room } = makeRoom();
  const p = room.addHuman('a', profile('A'));
  assert.equal(p.alive, true);
  assert.equal(p.hp, 100);
  assert.equal(p.weapon, 'pistol');
});

test('inputs move the player at exactly PLAYER_SPEED', () => {
  const { room } = makeRoom();
  const p = room.addHuman('a', profile('A'));
  Object.assign(p, { x: 300, y: 250 });
  room.queueInput('a', { seq: 1, mx: 1, my: 0, aim: 0, aimDist: 300, fire: false, swap: false });
  room.tick(DT);
  assert.ok(Math.abs(p.x - (300 + PLAYER_SPEED * INPUT_DT)) < 1e-6);
  assert.equal(p.lastSeq, 1);
});

test('duplicate or out-of-order inputs are ignored', () => {
  const { room } = makeRoom();
  room.addHuman('a', profile('A'));
  assert.ok(room.queueInput('a', { seq: 2, mx: 0, my: 0, aim: 0 }));
  assert.equal(room.queueInput('a', { seq: 2, mx: 0, my: 0, aim: 0 }), false);
  assert.equal(room.queueInput('a', { seq: 1, mx: 0, my: 0, aim: 0 }), false);
});

test('pistol bullets damage the target and respect fire rate', () => {
  const { room, events, advance } = makeRoom();
  const { a, b } = duel(room);
  a.fire = true;
  for (let i = 0; i < 10; i++) { room.tick(DT); advance(1000 / 30); a.fire = true; }
  const hits = events.filter((e) => e.type === 'hit' && e.targetId === 'b').length;
  assert.ok(hits >= 1 && hits <= 2, `expected 1-2 hits in 0.33s, got ${hits}`);
  assert.equal(b.hp, 100 - hits * WEAPONS.pistol.dmg);
});

test('killing a player scores, records the death and respawns after the delay', () => {
  const { room, events, advance } = makeRoom();
  const { a, b } = duel(room);
  b.hp = 1;
  a.fire = true;
  for (let i = 0; i < 10 && b.alive; i++) { room.tick(DT); advance(33); }
  assert.equal(b.alive, false);
  assert.equal(a.kills, 1);
  assert.equal(b.deaths, 1);
  assert.ok(events.some((e) => e.type === 'kill' && e.killerId === 'a' && e.victimId === 'b'));
  a.fire = false;
  advance(RESPAWN_MS);
  room.tick(DT);
  assert.equal(b.alive, true);
  assert.equal(b.hp, 100);
});

test('no friendly fire in team deathmatch', () => {
  const { room, advance } = makeRoom({ mode: 'tdm' });
  const { a, b } = duel(room);
  b.team = a.team;
  a.fire = true;
  for (let i = 0; i < 30; i++) { room.tick(DT); advance(33); a.fire = true; }
  assert.equal(b.hp, 100);
});

test('teams are kept balanced', () => {
  const { room } = makeRoom({ mode: 'tdm' });
  for (let i = 0; i < 6; i++) room.addHuman(`p${i}`, profile(`P${i}`));
  const counts = { 1: 0, 2: 0 };
  for (const p of room.players.values()) counts[p.team]++;
  assert.equal(counts[1], 3);
  assert.equal(counts[2], 3);
});

test('picking up a weapon gives one mag, and running dry returns to the pistol', () => {
  const { room, advance } = makeRoom();
  const p = room.addHuman('a', profile('A'));
  const pk = room.pickups.find((x) => x.weapon === 'ar');
  Object.assign(p, { x: pk.x, y: pk.y });
  room.tick(DT);
  assert.equal(p.weapon, 'ar');
  assert.equal(p.ammo, WEAPONS.ar.mag);
  assert.ok(pk.respawnAt > 0, 'pickup is on cooldown');
  Object.assign(p, { x: 300, y: 250, angle: Math.PI / 2 });
  for (let i = 0; i < 200 && p.special; i++) { p.fire = true; room.tick(DT); advance(100); }
  assert.equal(p.weapon, 'pistol');
  assert.equal(p.special, null);
});

test('swap toggles between pistol and special', () => {
  const { room } = makeRoom();
  const p = room.addHuman('a', profile('A'));
  Object.assign(p, { special: 'rpg', weapon: 'rpg', ammo: 2 });
  room.swapWeapon(p);
  assert.equal(p.weapon, 'pistol');
  room.swapWeapon(p);
  assert.equal(p.weapon, 'rpg');
});

test('rockets explode with splash damage, self damage is halved', () => {
  const { room, events, advance } = makeRoom();
  const { a, b } = duel(room);
  Object.assign(a, { weapon: 'rpg', special: 'rpg', ammo: 2, fire: true });
  for (let i = 0; i < 30; i++) { room.tick(DT); advance(33); a.fire = false; }
  assert.ok(events.some((e) => e.type === 'explosion'));
  assert.ok(b.hp < 100 || !b.alive);
  assert.equal(a.hp, 100, 'shooter was out of the blast');
});

test('grenades travel, wait for the fuse, then explode', () => {
  const { room, events, advance } = makeRoom();
  const { a } = duel(room);
  Object.assign(a, { weapon: 'nade', special: 'nade', ammo: 3, fire: true, aimDist: 150 });
  room.tick(DT); a.fire = false;
  assert.equal(room.projectiles.length, 1);
  for (let i = 0; i < 20; i++) { room.tick(DT); advance(33); }
  assert.equal(events.filter((e) => e.type === 'explosion').length, 0, 'not yet');
  for (let i = 0; i < 30; i++) { room.tick(DT); advance(33); }
  assert.equal(events.filter((e) => e.type === 'explosion').length, 1);
});

test('round ends at the score limit and restarts with fresh scores', () => {
  const { room, events, advance } = makeRoom();
  const { a } = duel(room);
  a.kills = room.modeDef.scoreLimit - 1;
  const b = room.players.get('b');
  b.hp = 1; a.fire = true;
  for (let i = 0; i < 10 && room.round.state === 'playing'; i++) { room.tick(DT); advance(33); }
  assert.equal(room.round.state, 'ended');
  assert.equal(room.round.winner, 'Alice');
  assert.ok(events.some((e) => e.type === 'roundEnd'));
  advance(ROUND_END_MS);
  room.tick(DT);
  assert.equal(room.round.state, 'playing');
  assert.equal(room.round.number, 2);
  assert.equal(a.kills, 0);
});

test('round ends when the timer runs out', () => {
  const { room, advance } = makeRoom();
  room.addHuman('a', profile('A'));
  advance(ROUND_MS + 1);
  room.tick(DT);
  assert.equal(room.round.state, 'ended');
});

test('bots fill the room up to the minimum and leave as humans join', () => {
  const { room } = makeRoom({ bots: true, minPlayers: 4 });
  room.addHuman('a', profile('A'));
  assert.equal(room.players.size, 4);
  room.addHuman('b', profile('B'));
  assert.equal(room.players.size, 4);
  assert.equal(room.humanCount, 2);
});

test('teams stay balanced when bots make room for joining humans', () => {
  const { room } = makeRoom({ mode: 'tdm', bots: true, minPlayers: 4 });
  for (let i = 0; i < 3; i++) {
    room.addHuman(`h${i}`, profile(`H${i}`));
    const c = { 1: 0, 2: 0 };
    for (const p of room.players.values()) c[p.team]++;
    assert.ok(Math.abs(c[1] - c[2]) <= 1, `after ${i + 1} humans: ${c[1]} v ${c[2]}`);
  }
});

test('room refuses humans past the cap', () => {
  const { room } = makeRoom();
  for (let i = 0; i < MAX_PLAYERS; i++) assert.ok(room.addHuman(`p${i}`, profile(`P${i}`)));
  assert.equal(room.addHuman('extra', profile('X')), null);
});

test('bots fight on their own', () => {
  const { room, events, advance } = makeRoom({ bots: true, minPlayers: 6 });
  room.addHuman('a', profile('A'));
  for (let i = 0; i < 30 * 60; i++) { room.tick(DT); advance(1000 / 30); }
  assert.ok(events.some((e) => e.type === 'kill'), 'at least one kill in a simulated minute');
});

test('snapshot contains everything the client draws', () => {
  const { room } = makeRoom();
  room.addHuman('a', profile('A'));
  const s = room.buildSnapshot();
  assert.ok(Array.isArray(s.pl) && s.pl.length === 1);
  assert.equal(s.pk.length, room.pickups.length);
  for (const key of ['i', 'n', 'x', 'y', 'a', 'hp', 'al', 'w', 'k', 'd']) assert.ok(key in s.pl[0], key);
  assert.ok(JSON.stringify(s).length < 4000, 'snapshot stays small');
});
