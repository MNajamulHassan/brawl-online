import { SKILLS, DRAFT, ACTIVE_CD_PER_STACK } from '../../shared/balance.js';
import { MAX_HP, PLAYER_SPEED } from '../../shared/constants.js';

/** Pure skill helpers: draft offers, stacking, and the stats skills modify. */

export const SKILL_IDS = Object.keys(SKILLS);

export const stacks = (p, id) => p.skills[id] || 0;

/** Up to DRAFT.choices distinct skills the player has not maxed out. */
export function makeOffer(p, rng) {
  const pool = SKILL_IDS.filter((id) => stacks(p, id) < SKILLS[id].max);
  const offer = [];
  while (offer.length < DRAFT.choices && pool.length) offer.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return offer;
}

/** Add one stack. Actives share one slot: a new active replaces the old one. */
export function applySkill(p, id) {
  const def = SKILLS[id];
  if (!def || stacks(p, id) >= def.max) return false;
  const before = maxHp(p);
  p.skills[id] = stacks(p, id) + 1;
  if (def.type === 'active') p.active = id;
  if (p.alive) p.hp += maxHp(p) - before; // +max HP also fills the new space
  return true;
}

export function maxHp(p) {
  return (MAX_HP + stacks(p, 'tough') * SKILLS.tough.hp) * (p.hpMul || 1);
}

export function speedMul(p) {
  return 1 + stacks(p, 'swift') * SKILLS.swift.speed;
}

export function playerSpeed(p) {
  return PLAYER_SPEED * speedMul(p);
}

export function fireRateMul(p) {
  return Math.max(0.4, 1 - stacks(p, 'trigger') * SKILLS.trigger.rate);
}

export function activeCooldown(p) {
  if (!p.active) return 0;
  return SKILLS[p.active].cd * (1 - ACTIVE_CD_PER_STACK) ** (stacks(p, p.active) - 1);
}

/** Every Nth shot explodes when the player has the Finale mod; 0 = never. */
export function boomEvery(p) {
  const n = stacks(p, 'boom');
  return n ? Math.max(SKILLS.boom.minEvery, SKILLS.boom.every - 2 * (n - 1)) : 0;
}
