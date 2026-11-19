import { TILE, MAP_W, MAP_H } from './constants.js';
import { SOLID_TILES } from './maps.js';

/** Pure collision and pathfinding helpers. No side effects besides moveEntity. */

export function isSolidTile(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return SOLID_TILES.has(map.grid[ty][tx]);
}

export function isSolidPoint(map, x, y) {
  return isSolidTile(map, Math.floor(x / TILE), Math.floor(y / TILE));
}

/** True when a circle at (x, y) with radius r overlaps any solid tile. */
export function circleHitsWall(map, x, y, r) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!isSolidTile(map, tx, ty)) continue;
      const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
      const cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
      if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
  }
  return false;
}

/**
 * Move an entity by an input vector, sliding along walls (axis-separated).
 * The vector is clamped to length 1 so diagonal movement is not faster.
 */
export function moveEntity(map, e, dx, dy, dt, speed, radius) {
  const len = Math.hypot(dx, dy);
  if (len < 0.05) return;
  if (len > 1) { dx /= len; dy /= len; }
  const nx = e.x + dx * speed * dt;
  if (!circleHitsWall(map, nx, e.y, radius)) e.x = nx;
  const ny = e.y + dy * speed * dt;
  if (!circleHitsWall(map, e.x, ny, radius)) e.y = ny;
}

/** Ray-march between two points; false if a solid tile is in the way. */
export function hasLineOfSight(map, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(d / 14);
  for (let i = 1; i < steps; i++) {
    if (isSolidPoint(map, a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps)) return false;
  }
  return true;
}

/** Breadth-first search over the tile grid. Returns tile-centre waypoints (start excluded). */
export function findPath(map, from, to) {
  const sx = Math.floor(from.x / TILE), sy = Math.floor(from.y / TILE);
  const gx = Math.floor(to.x / TILE), gy = Math.floor(to.y / TILE);
  if (isSolidTile(map, gx, gy)) return [];
  const key = (x, y) => y * MAP_W + x;
  const start = key(sx, sy), goal = key(gx, gy);
  const prev = new Int16Array(MAP_W * MAP_H).fill(-1);
  prev[start] = start;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head];
    if (k === goal) break;
    const x = k % MAP_W, y = (k / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (isSolidTile(map, nx, ny)) continue;
      const nk = key(nx, ny);
      if (prev[nk] !== -1) continue;
      prev[nk] = k;
      queue.push(nk);
    }
  }
  if (prev[goal] === -1) return [];
  const path = [];
  for (let k = goal; k !== start; k = prev[k]) path.push(k);
  path.reverse();
  return path.map((k) => ({ x: (k % MAP_W) * TILE + TILE / 2, y: ((k / MAP_W) | 0) * TILE + TILE / 2 }));
}

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
