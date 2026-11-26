/**
 * Every gameplay number that affects balance lives in this one file:
 * weapons, skills, XP, crates, revives and bot waves.
 * It is shared by the server (authoritative) and the browser (display and prediction).
 *
 * When you change a number here, add a line to BALANCE_CHANGELOG.md saying what and why.
 */

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

/** XP and levels. Levels reset every round. */
export const XP = {
  kill: 100,
  assist: 40, // damaged the victim in the last ASSIST_WINDOW_MS without the kill
  assistWindowMs: 5000,
  perDamage: 0.5, // XP per HP of damage dealt to enemies
  crate: 30,
  orb: 60,
  maxLevel: 12,
  /** XP needed to go from `level` to `level + 1`. */
  toNext: (level) => 120 + 60 * (level - 1),
};

export const DRAFT = { choices: 3, autoPickMs: 5000 };

/**
 * Skills offered on level-up. `max` is how many times one skill can stack.
 *  type: passive | mod (weapon modifier) | active (key E, on a cooldown)
 *  per-stack values are multiplied by the stack count.
 */
export const SKILLS = {
  // Passives
  swift: { type: 'passive', name: 'Swift', desc: '+10% move speed', max: 3, speed: 0.1 },
  tough: { type: 'passive', name: 'Tough', desc: '+20 max HP', max: 3, hp: 20 },
  vamp: { type: 'passive', name: 'Life steal', desc: 'Heal 10% of damage dealt', max: 3, steal: 0.1 },
  trigger: { type: 'passive', name: 'Hair trigger', desc: '12% faster fire rate', max: 3, rate: 0.12 },
  bigmag: { type: 'passive', name: 'Big mags', desc: '+50% ammo from weapon pickups', max: 3, mag: 0.5 },
  regen: { type: 'passive', name: 'Regen', desc: 'Heal 4 HP/s after 4 s without damage', max: 3, hps: 4, delayMs: 4000 },
  // Weapon mods
  bounce: { type: 'mod', name: 'Ricochet', desc: 'Bullets bounce off walls once more', max: 3 },
  pierce: { type: 'mod', name: 'Piercing', desc: 'Bullets pass through one more target', max: 3 },
  boom: { type: 'mod', name: 'Finale', desc: 'Every 8th shot explodes (−2 per stack)', max: 3, every: 8, minEvery: 4, rad: 60, dmg: 35 },
  pellets: { type: 'mod', name: 'Buckshot', desc: '+2 shotgun pellets', max: 3, extra: 2 },
  // Actives (one slot; picking a new one replaces it, picking the same one cuts its cooldown)
  dash: { type: 'active', name: 'Dash', desc: 'Burst 140 px in your move direction', max: 3, cd: 4000, dist: 140 },
  shield: { type: 'active', name: 'Shield bubble', desc: 'Block all damage for 2.5 s', max: 3, cd: 12000, ms: 2500 },
  heal: { type: 'active', name: 'Patch up', desc: 'Heal 40 HP', max: 3, cd: 10000, amount: 40 },
  turret: { type: 'active', name: 'Turret', desc: 'Place a turret for 10 s', max: 3, cd: 15000, ms: 10000, range: 420, rate: 0.4, dmg: 8 },
  blink: { type: 'active', name: 'Blink', desc: 'Teleport up to 200 px toward your aim', max: 3, cd: 6000, dist: 200 },
};
export const ACTIVE_CD_PER_STACK = 0.2; // each repeat pick of the same active cuts its cooldown by 20%

/** Breakable loot crates. Drop chances are relative weights. */
export const CRATES = {
  hp: 40,
  respawnMs: 20000,
  lootLifeMs: 20000,
  drops: { weapon: 3, orb: 3, health: 2, armor: 2 },
  health: 40,
  armor: 50,
  maxArmor: 100,
};

/** Team revives (team deathmatch and bot waves). */
export const REVIVE = { downedMs: 8000, reviveMs: 3000, radius: 55, hpFraction: 0.5 };

/** Bot waves (co-op). Wave n has base + perWave*(n-1) bots, each tougher than the last. */
export const WAVES = {
  breakMs: 5000,
  base: 3,
  perWave: 2,
  maxAlive: 12,
  spawnEveryMs: 700,
  hpPerWave: 0.15, // +15% bot HP per wave
  dmgPerWave: 0.08, // +8% bot damage per wave
};
