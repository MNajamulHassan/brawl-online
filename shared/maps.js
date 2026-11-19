import { MAP_W, MAP_H, TILE } from './constants.js';

/**
 * Maps are authored as the LEFT half (16 columns) and mirrored, so both
 * sides of every map are identical and no spawn side has an advantage.
 *
 * Legend:
 *   .  floor            #  hedge (solid)     o  rock (solid)
 *   B  building (solid) c  parked car (solid)
 *   A  assault rifle    H  shotgun           R  RPG          G  grenades
 */
const HALF_MAPS = {
  field: [
    '################',
    '#......#........',
    '#......#...A....',
    '#..##..#........',
    '#..#.......oo...',
    '#..#....#.......',
    '#.......#....###',
    '#####...#.......',
    '#.......####....',
    '#..G............',
    '#.........o.....',
    '#....o.....R....',
    '#..####.........',
    '#.....#...###...',
    '#.....#.....#...',
    '#..H..#.........',
    '#.........o.....',
    '####....###.....',
    '#.........#..o..',
    '#.........#.....',
    '#...............',
    '################',
  ],
  streets: [
    '################',
    '#........A......',
    '#.BBBB.BBBBB....',
    '#.BBBB.BBBBB.c..',
    '#.BBBB.BBBBB....',
    '#...............',
    '#.c.....G.......',
    '#.BBBBBBB.BBBB..',
    '#.BBBBBBB.BBBB..',
    '#.........BBBB..',
    '#..H......BBBB..',
    '#.BBBB..........',
    '#.BBBB.BBB..c...',
    '#.BBBB.BBB...R..',
    '#......BBB......',
    '#.BBBB......BBBB',
    '#.BBBB..c...BBBB',
    '#.BBBB.BBB......',
    '#......BBB......',
    '#...............',
    '#.......c.......',
    '################',
  ],
};

export const SOLID_TILES = new Set(['#', 'o', 'B', 'c']);
const PICKUP_TILES = { A: 'ar', H: 'sg', R: 'rpg', G: 'nade' };

export const MAP_KEYS = Object.keys(HALF_MAPS);

/** Build a full map: { key, grid[y][x], pickups[{x,y,weapon}] } */
export function buildMap(key) {
  const half = HALF_MAPS[key];
  if (!half) throw new Error(`Unknown map "${key}"`);
  const border = key === 'field' ? '#' : 'B';
  const grid = [];
  const pickups = [];
  for (let y = 0; y < MAP_H; y++) {
    const left = (half[y] || '').padEnd(MAP_W / 2, '.').slice(0, MAP_W / 2);
    const row = left + [...left].reverse().join('');
    grid[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      let c = row[x];
      if (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) c = border;
      if (PICKUP_TILES[c]) {
        pickups.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, weapon: PICKUP_TILES[c] });
        c = '.';
      }
      grid[y][x] = c;
    }
  }
  return { key, grid, pickups };
}
