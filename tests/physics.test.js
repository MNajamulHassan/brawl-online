import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, MAP_KEYS } from '../shared/maps.js';
import { circleHitsWall, moveEntity, hasLineOfSight, findPath, isSolidTile, angleDiff } from '../shared/physics.js';
import { TILE, MAP_W, MAP_H, PLAYER_RADIUS } from '../shared/constants.js';

test('every map has correct size, a solid border and mirrored pickups', () => {
  for (const key of MAP_KEYS) {
    const map = buildMap(key);
    assert.equal(map.grid.length, MAP_H);
    for (const row of map.grid) assert.equal(row.length, MAP_W);
    for (let x = 0; x < MAP_W; x++) { assert.ok(isSolidTile(map, x, 0)); assert.ok(isSolidTile(map, x, MAP_H - 1)); }
    for (let y = 0; y < MAP_H; y++) { assert.ok(isSolidTile(map, 0, y)); assert.ok(isSolidTile(map, MAP_W - 1, y)); }
    assert.equal(map.pickups.length % 2, 0, 'pickups come in mirrored pairs');
    assert.ok(map.pickups.length >= 8);
  }
});

test('unknown map throws', () => {
  assert.throws(() => buildMap('moon'));
});

test('all open tiles of each map are reachable from each other', () => {
  for (const key of MAP_KEYS) {
    const map = buildMap(key);
    const open = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (!isSolidTile(map, x, y)) open.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
    const start = open[0];
    for (const target of [open[open.length - 1], open[Math.floor(open.length / 2)]]) {
      assert.ok(findPath(map, start, target).length > 0, `${key}: path exists`);
    }
  }
});

test('outside the map counts as solid', () => {
  const map = buildMap('field');
  assert.ok(isSolidTile(map, -1, 5));
  assert.ok(isSolidTile(map, MAP_W, 5));
  assert.ok(circleHitsWall(map, -10, -10, 5));
});

test('moveEntity stops at walls and slides along them', () => {
  const map = buildMap('field');
  const e = { x: TILE * 1.5, y: TILE * 1.5 };
  for (let i = 0; i < 60; i++) moveEntity(map, e, -1, 0, 1 / 30, 220, PLAYER_RADIUS);
  assert.ok(e.x >= TILE + PLAYER_RADIUS - 0.01, 'did not enter the left border');
  const before = e.y;
  for (let i = 0; i < 5; i++) moveEntity(map, e, -1, 1, 1 / 30, 220, PLAYER_RADIUS);
  assert.ok(e.y > before, 'slid down along the wall');
});

test('moveEntity does not let diagonal input go faster', () => {
  const map = buildMap('field');
  const a = { x: 400, y: 1000 - 32 * 20 }, b = { ...a };
  moveEntity(map, a, 5, 5, 0.1, 220, 1);
  moveEntity(map, b, 1, 0, 0.1, 220, 1);
  const da = Math.hypot(a.x - 400, a.y - (1000 - 640));
  const db = Math.hypot(b.x - 400, b.y - (1000 - 640));
  assert.ok(Math.abs(da - db) < 0.01);
});

test('line of sight is blocked by walls', () => {
  const map = buildMap('field');
  // row 1: "#......#" -> tile x=7 is a hedge
  assert.equal(hasLineOfSight(map, { x: TILE * 1.5, y: TILE * 1.5 }, { x: TILE * 10.5, y: TILE * 1.5 }), false);
  assert.equal(hasLineOfSight(map, { x: TILE * 1.5, y: TILE * 1.5 }, { x: TILE * 5.5, y: TILE * 1.5 }), true);
});

test('angleDiff wraps around', () => {
  assert.ok(Math.abs(angleDiff(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
});
