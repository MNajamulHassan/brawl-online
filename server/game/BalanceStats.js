/**
 * Counts what happens with every weapon and skill so balance decisions can be
 * made from data. One instance is shared by all rooms; it lives in memory and
 * resets when the server restarts (the periodic `balance.stats` log keeps history).
 */
export class BalanceStats {
  constructor() {
    this.weapons = {};
    this.skills = {};
    this.rounds = 0;
  }

  weapon(id) { return (this.weapons[id] ||= { shots: 0, damage: 0, kills: 0, pickups: 0, rounds: 0, wins: 0 }); }
  skill(id) { return (this.skills[id] ||= { offered: 0, picked: 0, damage: 0, kills: 0, rounds: 0, wins: 0 }); }

  shot(weapon) { this.weapon(weapon).shots++; }
  pickup(weapon) { this.weapon(weapon).pickups++; }
  offer(ids) { for (const id of ids) this.skill(id).offered++; }
  pick(id) { this.skill(id).picked++; }

  damage(weapon, amount, skills) {
    this.weapon(weapon).damage += amount;
    for (const id of Object.keys(skills)) this.skill(id).damage += amount;
  }

  kill(weapon, skills) {
    this.weapon(weapon).kills++;
    for (const id of Object.keys(skills)) this.skill(id).kills++;
  }

  /** entries: [{ skills, mainWeapon, won }] — `won` is undefined in co-op, which has no winner. */
  roundEnd(entries) {
    this.rounds++;
    for (const e of entries) {
      if (e.won === undefined) continue;
      const targets = Object.keys(e.skills).map((id) => this.skill(id));
      if (e.mainWeapon) targets.push(this.weapon(e.mainWeapon));
      for (const s of targets) { s.rounds++; if (e.won) s.wins++; }
    }
  }

  summary() {
    const rate = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null); // percent, 1 decimal
    const weapons = {};
    for (const [id, s] of Object.entries(this.weapons)) {
      weapons[id] = { ...s, damage: Math.round(s.damage), winRate: rate(s.wins, s.rounds) };
    }
    const skills = {};
    for (const [id, s] of Object.entries(this.skills)) {
      skills[id] = { ...s, damage: Math.round(s.damage), pickRate: rate(s.picked, s.offered), winRate: rate(s.wins, s.rounds) };
    }
    return { rounds: this.rounds, weapons, skills };
  }
}
