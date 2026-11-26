/**
 * Game-wide tunables shared by the server and the browser client.
 * Changing a value here changes it for both sides, which keeps client-side
 * prediction in step with the authoritative server simulation.
 */

export const VERSION = '1.2.0';
export const REPO_URL = 'https://github.com/MNajamulHassan/brawl-online';

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
export const CRATE_RADIUS = 18;
export const ROUND_MS = 5 * 60 * 1000;
export const ROUND_END_MS = 8000;

export const MAX_PLAYERS = 10;
export const MAX_NAME_LENGTH = 14;
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export const MODES = {
  dm: { name: 'Deathmatch', scoreLimit: 15, teams: false },
  tdm: { name: 'Team deathmatch', scoreLimit: 30, teams: true, revives: true },
  waves: { name: 'Bot waves', teams: true, coop: true, revives: true },
};

export const MAPS = { field: 'Fields', streets: 'Streets' };

export const TEAM_COLORS = { 1: '#ff5a4e', 2: '#4ea3ff' };
export const TEAM_NAMES = { 1: 'Red', 2: 'Blue' };

export const COLORS = ['#f5c542', '#ff6b5b', '#4ea3ff', '#9b6bff', '#3ad19a', '#ff8fd0', '#ff9a3c', '#e8e8e8'];
export const HATS = ['None', 'Cap', 'Band', 'Horns', 'Crown'];

// Weapon and skill numbers live in balance.js (one file for live balancing).
export { WEAPONS } from './balance.js';

export const GRENADE_THROW_TIME = 0.55;
export const GRENADE_MIN_DIST = 60;
export const GRENADE_MAX_DIST = 330;
