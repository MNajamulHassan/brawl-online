import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeName, sanitizeProfile, parseRoomCode, parseCreateOptions, parseInput } from '../server/game/validation.js';
import { RateLimiter } from '../server/game/RateLimiter.js';

test('names are trimmed, stripped of markup and length-limited', () => {
  assert.equal(sanitizeName('  Najam  '), 'Najam');
  assert.equal(sanitizeName('<script>x</script>'), 'scriptxscript');
  assert.equal(sanitizeName('a'.repeat(40)).length, 14);
  assert.equal(sanitizeName(''), 'Player');
  assert.equal(sanitizeName(42), 'Player');
});

test('profile falls back to safe defaults', () => {
  const p = sanitizeProfile({ name: 'X', color: 'red; background:url(x)', hat: 99 });
  assert.equal(p.name, 'X');
  assert.match(p.color, /^#[0-9a-f]{6}$/i);
  assert.equal(p.hat, 0);
  assert.deepEqual(sanitizeProfile(null).name, 'Player');
});

test('room codes must match the alphabet and length', () => {
  assert.equal(parseRoomCode('AB3CD'), 'ab3cd');
  assert.equal(parseRoomCode('abc'), null);
  assert.equal(parseRoomCode('ab0cd'), null, '0 is not in the alphabet');
  assert.equal(parseRoomCode({}), null);
});

test('create options are whitelisted', () => {
  assert.deepEqual(parseCreateOptions({ mode: 'tdm', map: 'streets', visibility: 'private', bots: true }),
    { mode: 'tdm', map: 'streets', visibility: 'private', bots: true });
  assert.deepEqual(parseCreateOptions({ mode: '__proto__', map: 'moon', visibility: 'x', bots: 'yes' }),
    { mode: 'dm', map: 'field', visibility: 'public', bots: false });
});

test('inputs are rejected when malformed or replayed', () => {
  assert.equal(parseInput(null), null);
  assert.equal(parseInput({ seq: 1, mx: NaN, my: 0, aim: 0 }), null);
  assert.equal(parseInput({ seq: 5, mx: 0, my: 0, aim: 0 }, 5), null, 'old sequence number');
  assert.equal(parseInput({ seq: 1.5, mx: 0, my: 0, aim: 0 }), null);
});

test('inputs are clamped so nobody can move faster than allowed', () => {
  const i = parseInput({ seq: 1, mx: 50, my: 50, aim: 100, aimDist: 1e9, fire: 'yes' });
  assert.ok(Math.hypot(i.mx, i.my) <= 1 + 1e-9);
  assert.ok(i.aim >= -Math.PI && i.aim <= Math.PI);
  assert.equal(i.aimDist, 400);
  assert.equal(i.fire, false, 'only literal true counts');
});

test('rate limiter refills over time', () => {
  let t = 0;
  const rl = new RateLimiter(2, 1, () => t);
  assert.ok(rl.take()); assert.ok(rl.take()); assert.equal(rl.take(), false);
  t = 1000;
  assert.ok(rl.take());
});
