import { WAVES } from '../../shared/balance.js';

/**
 * Runs the Bot waves co-op mode: a short break, then a wave of enemy bots that
 * grows and toughens each time. The wave is cleared when every bot is dead.
 */
export class WaveDirector {
  constructor(room) {
    this.room = room;
    this.reset(room.now());
  }

  reset(t) {
    this.number = 0;
    this.state = 'break';
    this.nextAt = t + WAVES.breakMs;
    this.toSpawn = 0;
    this.nextSpawnAt = 0;
  }

  /** Waves fully cleared: the score for the round. */
  get survived() { return this.state === 'break' ? this.number : this.number - 1; }

  get botsLeft() {
    let alive = 0;
    for (const p of this.room.players.values()) if (p.isBot && p.alive) alive++;
    return alive + this.toSpawn;
  }

  static sizeOf(n) { return WAVES.base + WAVES.perWave * (n - 1); }

  tick(t) {
    const room = this.room;
    if (this.state === 'break') {
      if (t < this.nextAt) return;
      this.number++;
      this.state = 'fighting';
      this.toSpawn = WaveDirector.sizeOf(this.number);
      this.nextSpawnAt = t;
      // Fallen players come back for every new wave.
      for (const p of room.players.values()) if (!p.isBot && !p.alive) room.spawn(p);
      room.onEvent('waveStart', { number: this.number, bots: this.toSpawn });
      return;
    }

    let alive = 0;
    for (const p of room.players.values()) if (p.isBot && p.alive) alive++;
    while (this.toSpawn > 0 && alive < WAVES.maxAlive && t >= this.nextSpawnAt) {
      room.spawnWaveBot(this.number);
      this.toSpawn--;
      alive++;
      this.nextSpawnAt = t + WAVES.spawnEveryMs;
    }
    if (this.toSpawn === 0 && alive === 0) {
      this.state = 'break';
      this.nextAt = t + WAVES.breakMs;
      room.onEvent('waveClear', { number: this.number });
    }
  }
}
