# Balance changelog

Every change to a number in [`shared/balance.js`](shared/balance.js) is recorded here: what changed, old → new, and why.
Use the stats from `GET /api/balance` as evidence (see [docs/08-maintenance.md](docs/08-maintenance.md#balancing-workflow)).

| Date | Version | Area | Change | Old → New | Why (evidence) |
|---|---|---|---|---|---|
| 2026-11-26 | 1.1.0 | Weapons | Moved into `balance.js`, values unchanged | – | Baseline: one file for live balancing |
| 2026-11-26 | 1.1.0 | XP | Initial curve: kill 100, assist 40, 0.5 per damage, crate 30, orb 60; level n→n+1 costs 120 + 60(n−1); cap 12 | new | Baseline: about 1 level per kill early on, slower later so a 5-minute round reaches roughly level 6–8 |
| 2026-11-26 | 1.1.0 | Skills | Initial 15 skills, max 3 stacks each; actives: dash 4 s, shield 12 s, heal 10 s, turret 15 s, blink 6 s cooldown; repeat pick −20% cooldown | new | Baseline; strong defensive actives get the longest cooldowns |
| 2026-11-26 | 1.1.0 | Hair trigger | Fire-rate bonus floored at 40% of base cooldown | new | Safety cap so stacking can never remove the fire-rate limit |
| 2026-11-26 | 1.1.0 | Crates | 40 HP, respawn 20 s, loot lasts 20 s; drop weights weapon 3, orb 3, health 2, armour 2; health +40, armour +50 (max 100) | new | Baseline: two pistol hits plus change breaks a crate |
| 2026-11-26 | 1.1.0 | Revives | Downed 8 s, revive 3 s within 55 px, back at 50% HP | new | Long enough for a teammate to cross a corridor, short enough that downed players don't stall rounds |
| 2026-11-26 | 1.1.0 | Waves | 3 + 2 per wave, max 12 alive, +15% HP and +8% damage per wave, 5 s break | new | Baseline: wave 5 ≈ 11 bots at 1.6× HP |

<!-- Template for the next change:
| YYYY-MM-DD | x.y.z | Skill / weapon | What changed | old → new | e.g. "pierce: pickRate 52%, winRate 64% over 140 rounds – overperforming" |
-->
