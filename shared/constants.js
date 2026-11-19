/**
 * Game-wide tunables shared by the server and the browser client.
 * Changing a value here changes it for both sides, which keeps client-side
 * prediction in step with the authoritative server simulation.
 */

export const TILE = 48;
export const MAP_W = 32;
export const MAP_H = 22;

export const PLAYER_RADIUS = 16;
export const PLAYER_SPEED = 220; // px per second
export const BOT_SPEED = 185;
export const MAX_HP = 100;

export const TICK_RATE = 30; // server simulation steps per second
export const SNAPSHOT_RATE = 15; // state broadcasts per second
export const INPUT_RATE = 30; // client input packets per second
export const INPUT_DT = 1 / INPUT_RATE; // movement time each input represents

export const RESPAWN_MS = 3000;
export const PICKUP_RESPAWN_MS = 15000;
export const PICKUP_RADIUS = 30;
export const ROUND_MS = 5 * 60 * 1000;
export const ROUND_END_MS = 8000;

export const MAX_PLAYERS = 10;
export const MAX_NAME_LENGTH = 14;
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export const MODES = {
  dm: { name: 'Deathmatch', scoreLimit: 15, teams: false },
  tdm: { name: 'Team deathmatch', scoreLimit: 30, teams: true },
};

export const MAPS = { field: 'Fields', streets: 'Streets' };

export const TEAM_COLORS = { 1: '#ff5a4e', 2: '#4ea3ff' };
export const TEAM_NAMES = { 1: 'Red', 2: 'Blue' };

export const COLORS = ['#f5c542', '#ff6b5b', '#4ea3ff', '#9b6bff', '#3ad19a', '#ff8fd0', '#ff9a3c', '#e8e8e8'];
export const HATS = ['None', 'Cap', 'Band', 'Horns', 'Crown'];

/**
 * Weapon definitions.
 *  rate  seconds between shots      dmg   damage per hit / blast centre
 *  sp    spread (radians, +/-)      spd   projectile speed px/s
 *  life  projectile lifetime (s)    mag   ammo when picked up (pistol: infinite)
 *  pel   pellets per shot           rad   explosion radius
 *  fuse  grenade fuse (s)           len   barrel length used for drawing
 */
export const WEAPONS = {
  pistol: { name: 'Pistol', rate: 0.28, dmg: 18, sp: 0.03, spd: 950, life: 0.75, len: 14 },
  ar: { name: 'Assault rifle', tag: 'AR', mag: 30, rate: 0.095, dmg: 12, sp: 0.07, spd: 1050, life: 0.7, len: 26, color: '#ff9a3c' },
  sg: { name: 'Shotgun', tag: 'SG', mag: 6, rate: 0.75, dmg: 11, sp: 0.3, spd: 900, life: 0.4, pel: 7, len: 22, color: '#e2c27a' },
  rpg: { name: 'RPG', tag: 'RPG', mag: 2, rate: 1, dmg: 95, rad: 100, spd: 560, life: 2, len: 30, rocket: true, color: '#ff5a4e' },
  nade: { name: 'Grenades', tag: 'NADE', mag: 3, rate: 0.7, dmg: 90, rad: 105, fuse: 1.15, len: 6, grenade: true, color: '#7bd65a' },
};

export const GRENADE_THROW_TIME = 0.55;
export const GRENADE_MIN_DIST = 60;
export const GRENADE_MAX_DIST = 330;
