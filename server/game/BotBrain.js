import { WEAPONS } from '../../shared/constants.js';
import { hasLineOfSight, findPath, angleDiff } from '../../shared/physics.js';

const SIGHT_RANGE = 620;
const REACTION_TIME = 0.4; // seconds a bot must see a target before shooting
const REPATH_INTERVAL = 0.7;

/**
 * Simple server-side AI. Produces the same kind of intent a human input does
 * ({ mx, my, aim, fire, aimDist }), so bots go through the same rules as players.
 */
export class BotBrain {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.path = [];
    this.repathIn = 0;
    this.strafeDir = 1;
    this.strafeIn = 1;
    this.seenFor = 0;
    this.wobble = rng() * 10;
  }

  think(bot, room, dt) {
    const map = room.map;
    const target = room.nearestEnemy(bot);
    const intent = { mx: 0, my: 0, aim: bot.angle, fire: false, aimDist: 300 };

    this.repathIn -= dt;
    this.strafeIn -= dt;
    if (this.strafeIn <= 0) { this.strafeDir *= -1; this.strafeIn = 0.8 + this.rng() * 1.2; }

    const dist = target ? Math.hypot(target.x - bot.x, target.y - bot.y) : Infinity;
    if (target && dist < SIGHT_RANGE && hasLineOfSight(map, bot, target)) {
      this.path = [];
      this.seenFor += dt;
      this.wobble += dt * 3;
      const want = Math.atan2(target.y - bot.y, target.x - bot.x) + Math.sin(this.wobble) * 0.08;
      const diff = angleDiff(bot.angle, want);
      intent.aim = bot.angle + diff * Math.min(1, dt * 8);
      const ux = Math.cos(want), uy = Math.sin(want);
      const approach = dist > 280 ? 1 : dist < 150 ? -1 : 0;
      intent.mx = ux * approach - uy * this.strafeDir * 0.8;
      intent.my = uy * approach + ux * this.strafeDir * 0.8;
      intent.aimDist = dist;
      intent.fire = this.seenFor > REACTION_TIME && Math.abs(diff) < 0.25;
      return intent;
    }

    this.seenFor = 0;
    let goal = target;
    if (!bot.special) {
      const pickup = room.nearestAvailablePickup(bot, 420);
      if (pickup) goal = pickup;
    }
    if (goal && (this.repathIn <= 0 || this.path.length === 0)) {
      this.path = findPath(map, bot, goal);
      this.repathIn = REPATH_INTERVAL;
    }
    const next = this.path[0];
    if (next) {
      intent.mx = next.x - bot.x;
      intent.my = next.y - bot.y;
      if (Math.hypot(intent.mx, intent.my) < 10) this.path.shift();
      intent.aim = Math.atan2(intent.my, intent.mx);
    }
    return intent;
  }

  /** Bots always use their special weapon while they have one. */
  preferWeapon(bot) {
    if (bot.special && bot.weapon === 'pistol' && WEAPONS[bot.special]) bot.weapon = bot.special;
  }
}
